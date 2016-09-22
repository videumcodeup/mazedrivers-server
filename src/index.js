import ws from 'nodejs-websocket'
import { v4 as getToken } from 'node-uuid'
import getAmaze from './amaze'
import createState from './state'
import amazeChanger from './amazeChanger'

import {
  DRIVE_FAILURE,
  DRIVE_REQUEST,
  DRIVE_SUCCESS,
  JOIN_FAILURE,
  JOIN_REQUEST,
  JOIN_SUCCESS,
  REJOIN_FAILURE,
  REJOIN_REQUEST,
  REJOIN_SUCCESS,
  UNKNOWN_ACTION
} from './actions'

const DRIVE_DIRECTION_MISSING = 'DRIVE_DIRECTION_MISSING'
const DRIVE_DIRECTION_INVALID = 'DRIVE_DIRECTION_INVALID'
const DRIVE_JOIN_GAME_FIRST = 'DRIVE_JOIN_GAME_FIRST'
const JOIN_NICKNAME_ALREADY_TAKEN = 'JOIN_NICKNAME_ALREADY_TAKEN'
const JOIN_NICKNAME_INVALID = 'JOIN_NICKNAME_INVALID'
const JOIN_NICKNAME_MAX_LEN = 16
const JOIN_NICKNAME_MIN_LEN = 3
const JOIN_NICKNAME_MISSING = 'JOIN_NICKNAME_MISSING'
const JOIN_NICKNAME_TOO_LONG = 'JOIN_NICKNAME_TOO_LONG'
const JOIN_NICKNAME_TOO_SHORT = 'JOIN_NICKNAME_TOO_SHORT'
const JOIN_TOO_LATE_GAME_ALREADY_STARTED = 'JOIN_TOO_LATE_GAME_ALREADY_STARTED'

const REJOIN_TOKEN_INVALID = 'REJOIN_TOKEN_INVALID'
const REJOIN_TOKEN_MISSING = 'REJOIN_TOKEN_MISSING'
const REJOIN_TOKEN_WRONG = 'REJOIN_TOKEN_WRONG'

var host = 'localhost'
var port = process.env.PORT || 8001
var mazePromise = getAmaze(10, 10)

var privateState = createState({
  tokens: {}
})

var publicState = createState({
  game: {
    maze: [],
    started: false
  },
  players: {}
})

const stylesAvailable = ['taxi', 'police_car', 'ambulance', 'audi', 'truck']
const randomStyle = () =>
  stylesAvailable[Math.floor(Math.random() * stylesAvailable.length)]

mazePromise.then(maze => {
  publicState.update('game', 'maze', maze)
  setInterval(updateMaze, 4000)
})

var server = ws.createServer()

publicState.listen(state =>
    server.connections.map(conn =>
        conn.sendText(JSON.stringify({ type: 'STATE', payload: state }))))

const mazeWithCoordinates = mazePromise.then(maze => maze
  .map((row, y) => row.map((cell, x) => ({ x, y, cell })))
)

const getEntrances = mazeWithCoordinates.then(maze => maze
  .map(row => row.filter(({ cell }) => cell === 'entrance'))
  .filter(row => row.length)
  .reduce((a, b) => a.concat(b))
)

const updateMaze = () => {
  const currentMaze = publicState.get().game.maze
  const changedMaze = amazeChanger(currentMaze, 1)
  publicState.update('game', 'maze', changedMaze)
}

server.on('connection', function (conn) {
  const { setNickname, getNickname } = (() => {
    let state
    return {
      getNickname: () => state,
      setNickname: nickname => { state = nickname }
    }
  })()

  console.log('New connection')

  const sendError = (type, payload) =>
    conn.send(JSON.stringify({ type, error: true, payload }))

  const sendAction = (type, payload) =>
    conn.send(JSON.stringify({ type, payload }))

  const handleJoinRequest = ({ nickname } = {}) => {
    console.log('handleJoinRequest', nickname)
    const failure = payload => sendError(JOIN_FAILURE, payload)
    const success = payload => sendAction(JOIN_SUCCESS, payload)
    if (publicState.get().game.started) {
      failure(JOIN_TOO_LATE_GAME_ALREADY_STARTED)
    } else if (nickname == null) {
      failure(JOIN_NICKNAME_MISSING)
    } else if (typeof nickname !== 'string') {
      failure(JOIN_NICKNAME_INVALID)
    } else if (nickname.length < JOIN_NICKNAME_MIN_LEN) {
      failure(JOIN_NICKNAME_TOO_SHORT)
    } else if (nickname.length > JOIN_NICKNAME_MAX_LEN) {
      failure(JOIN_NICKNAME_TOO_LONG)
    } else if (publicState.get().players[nickname]) {
      failure(JOIN_NICKNAME_ALREADY_TAKEN)
    } else {
      getEntrances.then(([entrance, exit]) => {
        const { x, y } = entrance
        const style = randomStyle()
        publicState.update('players', nickname, { x, y, style })
        setNickname(nickname)
        const token = getToken()
        privateState.update('tokens', token, nickname)
        success({ token, nickname })
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
    } else if (!privateState.get().tokens[token]) {
      failure(REJOIN_TOKEN_WRONG)
    } else {
      const nickname = privateState.get().tokens[token]
      setNickname(nickname)
      success({ token, nickname })
    }
  }

  const directions = ['EAST', 'NORTH', 'SOUTH', 'WEST']
  const handleDriveRequest = direction => {
    const failure = payload => sendError(DRIVE_FAILURE, payload)
    const success = payload => sendAction(DRIVE_SUCCESS, payload)
    if (direction == null) {
      failure(DRIVE_DIRECTION_MISSING)
    } else if (typeof direction !== 'string') {
      failure(DRIVE_DIRECTION_INVALID)
    } else if (!directions.includes(direction)) {
      failure(DRIVE_DIRECTION_INVALID)
    } else if (!getNickname()) {
      failure(DRIVE_JOIN_GAME_FIRST)
    } else {
      publicState.update('players', getNickname(), { direction })
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
      default:
        handleUnknownAction(action)
        break
    }
  })

  conn.on('close', function (code, reason) {
    console.log('Connection closed')
  })
  mazePromise.then(() => {
    sendAction('STATE', publicState.get())
  })
})

const getNextPosition = ({ x, y, direction }, maze) => {
  if (!maze) { return { x, y } }
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
  mazePromise.then(() => {
    setInterval(() => {
      const { players, game: { maze } } = publicState.get()
      Object.keys(players).forEach(nickname => {
        const player = players[nickname]
        const { x, y } = getNextPosition(player, maze)
        publicState.update('players', nickname, { x, y })
      })
    }, 1000)
  })
})

server.listen(port)
console.log(`Listening on ws://${host}:${port}`)
