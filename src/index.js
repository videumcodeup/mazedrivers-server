import fs from 'fs'
import ws from 'nodejs-websocket'
import { v4 as getToken } from 'node-uuid'
import getAmaze from './amaze'
import incrementalStorage from './incrementalStorage'
import keyValueArrayStore from './keyValueArrayStore'

import {
  BREAK_FAILURE,
  BREAK_REQUEST,
  BREAK_SUCCESS,
  DRIVE_FAILURE,
  DRIVE_REQUEST,
  DRIVE_SUCCESS,
  FOLLOW_FAILURE,
  FOLLOW_REQUEST,
  FOLLOW_SUCCESS,
  GAME_STARTING,
  JOIN_FAILURE,
  JOIN_REQUEST,
  JOIN_SUCCESS,
  LIST_REQUEST,
  LIST_SUCCESS,
  REJOIN_FAILURE,
  REJOIN_REQUEST,
  REJOIN_SUCCESS,
  UNFOLLOW_FAILURE,
  UNFOLLOW_REQUEST,
  UNFOLLOW_SUCCESS,
  UNKNOWN_ACTION
} from './actions'

const DRIVE_DIRECTION_INVALID = 'DRIVE_DIRECTION_INVALID'
const DRIVE_DIRECTION_MISSING = 'DRIVE_DIRECTION_MISSING'
const DRIVE_GAME_NOT_STARTED = 'DRIVE_GAME_NOT_STARTED'
const DRIVE_JOIN_GAME_FIRST = 'DRIVE_JOIN_GAME_FIRST'
const DRIVE_PLAYER_IS_FINISHED = 'DRIVE_PLAYER_IS_FINISHED'
const FOLLOW_NICKNAME_MISSING = 'FOLLOW_NICKNAME_MISSING'
const FOLLOW_NICKNAME_INVALID = 'FOLLOW_NICKNAME_INVALID'
const FOLLOW_NICKNAME_WRONG = 'FOLLOW_NICKNAME_WRONG'
const GAME_SECONDS_UNTIL_START = 3
const JOIN_NICKNAME_ALREADY_TAKEN = 'JOIN_NICKNAME_ALREADY_TAKEN'
const JOIN_NICKNAME_INVALID = 'JOIN_NICKNAME_INVALID'
const JOIN_NICKNAME_MAX_LEN = 16
const JOIN_NICKNAME_MIN_LEN = 3
const JOIN_NICKNAME_MISSING = 'JOIN_NICKNAME_MISSING'
const JOIN_NICKNAME_TOO_LONG = 'JOIN_NICKNAME_TOO_LONG'
const JOIN_NICKNAME_TOO_SHORT = 'JOIN_NICKNAME_TOO_SHORT'

const REJOIN_TOKEN_INVALID = 'REJOIN_TOKEN_INVALID'
const REJOIN_TOKEN_MISSING = 'REJOIN_TOKEN_MISSING'
const REJOIN_TOKEN_WRONG = 'REJOIN_TOKEN_WRONG'

const UNFOLLOW_NICKNAME_MISSING = 'UNFOLLOW_NICKNAME_MISSING'
const UNFOLLOW_NICKNAME_INVALID = 'UNFOLLOW_NICKNAME_INVALID'
const UNFOLLOW_NICKNAME_WRONG = 'UNFOLLOW_NICKNAME_WRONG'

const GAME_PLAYER_LIMIT = 3
const MAZE_WIDTH = 10
const MAZE_HEIGHT = 10
const MAZE_MAX_X = MAZE_WIDTH * 2
const MAZE_MAX_Y = MAZE_HEIGHT * 2

const host = 'localhost'
const port = process.env.PORT || 8001

const mazePromises = {}

const clients = keyValueArrayStore()

const games = incrementalStorage()

const stylesAvailable = ['taxi', 'police', 'ambulance']

const getPlayersNumber = (gameId) => {
  const game = games.get()[gameId] || {}
  const players = game.players || {}
  return Object.keys(players).length
}

const isGameFull = (gameId) => {
  return getPlayersNumber(gameId) >= GAME_PLAYER_LIMIT
}

var server = ws.createServer()

const createOrGetMaze = gameId => {
  console.log('gameId', gameId, 'createOrGetMaze')
  if (!mazePromises[gameId]) {
    mazePromises[gameId] = getAmaze(MAZE_WIDTH, MAZE_HEIGHT).then(maze => {
      const mazeWithCoordinates = maze
        .map((row, y) => row.map((cell, x) => ({ x, y, cell })))

      const [entrance, exit] = mazeWithCoordinates
        .map(row => row.filter(({ cell }) => cell === 'entrance'))
        .filter(row => row.length)
        .reduce((a, b) => a.concat(b))

      games.update(gameId, 'maze', maze)
      games.update(gameId, 'details', 'entrance', 'x', entrance.x)
      games.update(gameId, 'details', 'entrance', 'y', entrance.y)
      games.update(gameId, 'details', 'exit', 'x', exit.x)
      games.update(gameId, 'details', 'exit', 'y', exit.y)
      games.update(gameId, 'details', 'predicates', 'isStarted', false)

      return { maze, entrance, exit }
    })
  }
  return mazePromises[gameId]
}

const getInitialDirection = ({ x, y }) => {
  if (x === 0) {
    return 'EAST'
  } else if (y === 0) {
    return 'SOUTH'
  } else if (x === MAZE_MAX_X) {
    return 'WEST'
  } else if (y === MAZE_MAX_Y) {
    return 'NORTH'
  } else {
    console.error(`Failed getInitialDirection for ${[x, y]}`)
    return 'NORTH'
  }
}

const createOrJoinGame = (() => {
  let nextGameId = getToken()
  function createOrJoin (nickname) {
    let gameId = nextGameId
    if (isGameFull(gameId)) {
      gameId = nextGameId = getToken()
    }
    return createOrGetMaze(gameId).then(({ maze, entrance, exit }) => {
      const { x, y } = entrance
      const style = stylesAvailable[getPlayersNumber(gameId)]
      const direction = getInitialDirection(entrance)
      console.log('gameId', gameId, 'updateBy')
      games.update(gameId, 'players', nickname, 'x', x)
      games.update(gameId, 'players', nickname, 'y', y)
      games.update(gameId, 'players', nickname, 'style', style)
      games.update(gameId, 'players', nickname, 'direction', direction)
      games.update(gameId, 'players', nickname, 'speed', 0)
      games.update(gameId, 'players', nickname, 'time', null)
      games.update(gameId, 'players', nickname, 'finished', false)
      return gameId
    })
  }
  return createOrJoin
})()

server.on('connection', function (conn) {
  console.log('New connection')

  const sendError = (type, payload) =>
    conn.send(JSON.stringify({ type, error: true, payload }))

  const sendAction = (type, payload) =>
    conn.send(JSON.stringify({ type, payload }))

  const handleJoinRequest = ({ nickname } = {}) => {
    const failure = payload => sendError(JOIN_FAILURE, payload)
    const success = payload => sendAction(JOIN_SUCCESS, payload)

    if (nickname == null) {
      failure(JOIN_NICKNAME_MISSING)
    } else if (typeof nickname !== 'string') {
      failure(JOIN_NICKNAME_INVALID)
    } else if (nickname.length < JOIN_NICKNAME_MIN_LEN) {
      failure(JOIN_NICKNAME_TOO_SHORT)
    } else if (nickname.length > JOIN_NICKNAME_MAX_LEN) {
      failure(JOIN_NICKNAME_TOO_LONG)
    } else if (clients.someBy({ nickname })) {
      failure(JOIN_NICKNAME_ALREADY_TAKEN)
    } else {
      const token = getToken()
      clients.updateBy({ token }, { token, nickname, key: conn.key })
      createOrJoinGame(nickname).then(gameId => {
        clients.updateBy({ nickname }, { gameId })
        success({ token, nickname, gameId })
        if (isGameFull(gameId)) {
          server.connections
            .filter(conn => clients.someBy({ gameId }))
            .forEach(conn => conn.sendText(JSON.stringify({
              type: GAME_STARTING,
              payload: { countdown: GAME_SECONDS_UNTIL_START }
            })))
          setTimeout(() => {
            const now = Date.now()
            const players = games.get()[gameId].players
            games.update(gameId, 'details', 'predicates', 'isStarted', true)
            Object.keys(players).forEach(nickname => {
              games.update(gameId, 'players', nickname, 'time', now)
            })
          }, GAME_SECONDS_UNTIL_START * 1000)
        }
        sendAction('STATE', games.get()[gameId])
      })
    }
  }

  const handleRejoinRequest = ({ token } = {}) => {
    const failure = payload => sendError(REJOIN_FAILURE, payload)
    const success = payload => sendAction(REJOIN_SUCCESS, payload)
    if (token == null) {
      failure(REJOIN_TOKEN_MISSING)
    } else if (typeof token !== 'string') {
      failure(REJOIN_TOKEN_INVALID)
    } else if (!clients.someBy({ token })) {
      console.log('REJOIN_TOKEN_WRONG', token, clients.all())
      failure(REJOIN_TOKEN_WRONG)
    } else {
      const { nickname, gameId } = clients.findBy({ token })
      clients.updateBy({ token }, { key: conn.key })
      success({ token, nickname, gameId })
    }
  }

  const handleListRequest = () => {
    const success = payload => sendAction(LIST_SUCCESS, payload)
    const players = clients.all()
      .filter(({ nickname }) => nickname)
      .map(({ nickname, gameId }) => ({ nickname, gameId }))
    success({ clients: players })
  }

  const handleFollowRequest = ({ nickname } = {}) => {
    const failure = payload => sendError(FOLLOW_FAILURE, payload)
    const success = payload => sendAction(FOLLOW_SUCCESS, payload)
    if (nickname == null) {
      failure(FOLLOW_NICKNAME_MISSING)
    } else if (typeof nickname !== 'string') {
      failure(FOLLOW_NICKNAME_INVALID)
    } else if (!clients.findBy({ nickname })) {
      failure(FOLLOW_NICKNAME_WRONG)
    } else {
      // Get gameId from specified nickname
      const { gameId } = clients.findBy({ nickname })
      // Add this spectator to clients
      clients.updateBy({ key: conn.key }, { key: conn.key, gameId })
      success({ nickname })
      if (gameId && games.get()[gameId]) {
        sendAction('STATE', games.get()[gameId])
      }
    }
  }

  const handleUnfollowRequest = ({ nickname } = {}) => {
    const failure = payload => sendError(UNFOLLOW_FAILURE, payload)
    const success = payload => sendAction(UNFOLLOW_SUCCESS, payload)
    if (nickname == null) {
      failure(UNFOLLOW_NICKNAME_MISSING)
    } else if (typeof nickname !== 'string') {
      failure(UNFOLLOW_NICKNAME_INVALID)
    } else if (!clients.findBy({ nickname })) {
      failure(UNFOLLOW_NICKNAME_WRONG)
    } else {
      clients.updateBy({ key: conn.key }, { key: conn.key, gameId: undefined })
      success()
    }
  }

  const directions = ['EAST', 'NORTH', 'SOUTH', 'WEST']
  const handleDriveRequest = direction => {
    const failure = payload => sendError(DRIVE_FAILURE, payload)
    const success = payload => sendAction(DRIVE_SUCCESS, payload)

    const gameIsStarted = () => {
      const { gameId } = clients.findBy({ key: conn.key })
      return games.get()[gameId].details.predicates.isStarted
    }

    const playerIsFinished = () => {
      const { gameId, nickname } = clients.findBy({ key: conn.key })
      return games.get()[gameId].players[nickname].finished
    }

    if (direction == null) {
      failure(DRIVE_DIRECTION_MISSING)
    } else if (typeof direction !== 'string') {
      failure(DRIVE_DIRECTION_INVALID)
    } else if (!directions.includes(direction)) {
      failure(DRIVE_DIRECTION_INVALID)
    } else if (!clients.someBy({ key: conn.key })) {
      failure(DRIVE_JOIN_GAME_FIRST)
    } else if (!gameIsStarted()) {
      failure(DRIVE_GAME_NOT_STARTED)
    } else if (playerIsFinished()) {
      failure(DRIVE_PLAYER_IS_FINISHED)
    } else {
      const { nickname, gameId } = clients.findBy({ key: conn.key })
      games.update(gameId, 'players', nickname, 'direction', direction)
      games.update(gameId, 'players', nickname, 'speed', 1)
      success()
    }
  }

  const handleBreakRequest = () => {
    const failure = payload => sendError(BREAK_FAILURE, payload)
    const success = () => sendAction(BREAK_SUCCESS)
    if (!clients.someBy({ key: conn.key })) {
      failure(BREAK_JOIN_GAME_FIRST)
    } else {
      const { nickname, gameId } = clients.findBy({ key: conn.key })
      games.update(gameId, 'players', nickname, 'speed', 0)
      success()
    }
  }

  const handleUnknownAction = payload =>
    sendError(UNKNOWN_ACTION, payload)

  conn.on('text', function (str) {
    let action
    try {
      action = JSON.parse(str) || {}
    } catch (e) {
      action = {}
    }
    switch (action.type) {
      case JOIN_REQUEST:
        handleJoinRequest(action.payload)
        break
      case REJOIN_REQUEST:
        handleRejoinRequest(action.payload)
        break
      case DRIVE_REQUEST:
        handleDriveRequest(action.payload)
        break
      case BREAK_REQUEST:
        handleBreakRequest()
        break
      case LIST_REQUEST:
        handleListRequest(action.payload)
        break
      case FOLLOW_REQUEST:
        handleFollowRequest(action.payload)
        break
      case UNFOLLOW_REQUEST:
        handleUnfollowRequest(action.payload)
        break
      default:
        handleUnknownAction(action)
        break
    }
  })

  conn.on('close', function (code, reason) {
    console.log('Connection closed')
  })
})

const saveTimeToFile = (gameId, nickname, time) => {
  const result = JSON.stringify({ gameId, nickname, time })
  fs.writeFile(`./results/${gameId}`, result, err => {
    if (err) { console.error(`Could not save result ${result}`, err) }
  })
}

const getNextPosition = ({ x, y, direction, speed }, maze) => {
  if (!maze) { return { x, y } }
  if (speed === 0) { return { x, y } }
  switch (direction) {
    case 'NORTH':
      if (!maze[y - 1]) { return { x, y } }
      if (!maze[y - 1][x]) { return { x, y } }
      if (maze[y - 1][x] === 'wall') { return { x, y } }
      if (maze[y - 1][x] === 'corner') { return { x, y } }
      return { x, y: y - 1 }
    case 'SOUTH':
      if (!maze[y + 1]) { return { x, y } }
      if (!maze[y + 1][x]) { return { x, y } }
      if (maze[y + 1][x] === 'wall') { return { x, y } }
      if (maze[y + 1][x] === 'corner') { return { x, y } }
      return { x, y: y + 1 }
    case 'EAST':
      if (!maze[y]) { return { x, y } }
      if (!maze[y][x + 1]) { return { x, y } }
      if (maze[y][x + 1] === 'wall') { return { x, y } }
      if (maze[y][x + 1] === 'corner') { return { x, y } }
      return { x: x + 1, y }
    case 'WEST':
      if (!maze[y]) { return { x, y } }
      if (!maze[y][x - 1]) { return { x, y } }
      if (maze[y][x - 1] === 'wall') { return { x, y } }
      if (maze[y][x - 1] === 'corner') { return { x, y } }
      return { x: x - 1, y }
    default:
      return { x, y }
  }
}

server.on('listening', () => {
  setInterval(() => {
    Object.keys(games.get()).forEach(gameId => {
      const { players, maze, details } = games.get()[gameId]
      Object.keys(players).forEach(nickname => {
        const player = players[nickname]
        const { x, y } = getNextPosition(player, maze)
        if (player.x !== x) {
          games.update(gameId, 'players', nickname, 'x', x)
        }
        if (player.y !== y) {
          games.update(gameId, 'players', nickname, 'y', y)
        }
        if (details.exit.x == x && details.exit.y == y && !player.finished) {
          const now = Date.now()
          games.update(gameId, 'players', nickname, 'finished', true)
          games.update(gameId, 'players', nickname, 'time', now - player.time)
          games.update(gameId, 'players', nickname, 'speed', 0)
          saveTimeToFile(gameId, nickname, now - player.time)
        }
      })

      const action = games.takeQueue(gameId)
      if (!action.length) { return }
      server.connections
        .filter(conn => clients.someBy({ key: conn.key, gameId }))
        .forEach(conn => conn.sendText(JSON.stringify(action)))
    })
  }, 300)
})

server.listen(port)
console.log(`Listening on ws://${host}:${port}`)
