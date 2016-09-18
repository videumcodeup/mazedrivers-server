import ws from 'nodejs-websocket'
import { v4 as getToken } from 'node-uuid'
import getAmaze from './amaze'
import createState from './state'
import amazeChanger from './amazeChanger'

import {
  JOIN_FAILURE,
  JOIN_REQUEST,
  JOIN_SUCCESS,
  RESUME_FAILURE,
  RESUME_REQUEST,
  RESUME_SUCCESS,
  UNKNOWN_ACTION
} from './actions'

const JOIN_NICKNAME_ALREADY_TAKEN = 'JOIN_NICKNAME_ALREADY_TAKEN'
const JOIN_NICKNAME_INVALID = 'JOIN_NICKNAME_INVALID'
const JOIN_NICKNAME_MAX_LEN = 16
const JOIN_NICKNAME_MIN_LEN = 3
const JOIN_NICKNAME_MISSING = 'JOIN_NICKNAME_MISSING'
const JOIN_NICKNAME_TOO_LONG = 'JOIN_NICKNAME_TOO_LONG'
const JOIN_NICKNAME_TOO_SHORT = 'JOIN_NICKNAME_TOO_SHORT'
const JOIN_TOO_LATE_GAME_ALREADY_STARTED = 'JOIN_TOO_LATE_GAME_ALREADY_STARTED'

const RESUME_TOKEN_INVALID = 'RESUME_TOKEN_INVALID'
const RESUME_TOKEN_MISSING = 'RESUME_TOKEN_MISSING'
const RESUME_TOKEN_WRONG = 'RESUME_TOKEN_WRONG'

var host = 'localhost'
var port = process.env.PORT || 8001
var mazePromise = getAmaze(10, 10)

var privateState = createState({
  tokens: {}
})

var publicState = createState({
  game: {
    maze: {},
    started: false
  },
  players: {}
})

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
  console.log('New connection')

  const sendError = (type, payload) =>
    conn.send(JSON.stringify({ type, error: true, payload }))

  const sendAction = (type, payload) =>
    conn.send(JSON.stringify({ type, payload }))

  // const parseBodyIntoAction = str => {
  //   try {
  //     return JSON.parse(str) || {}
  //   } catch (e) {
  //     return {}
  //   }
  // }

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
        publicState.update('players', nickname, { x, y })
        const token = getToken()
        privateState.update('tokens', token, nickname)
        success({ token, nickname })
      })
    }
  }

  const handleResumeRequest = ({ token } = {}) => {
    const failure = payload => sendError(RESUME_FAILURE, payload)
    const success = payload => sendAction(RESUME_SUCCESS, payload)
    if (token == null) {
      failure(RESUME_TOKEN_MISSING)
    } else if (typeof token !== 'string') {
      failure(RESUME_TOKEN_INVALID)
    } else if (!privateState.get().tokens[token]) {
      failure(RESUME_TOKEN_WRONG)
    } else {
      const nickname = privateState.get().tokens[token]
      success({ token, nickname })
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
      case RESUME_REQUEST:
        handleResumeRequest(action.payload)
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

server.listen(port)
console.log(`Listening on ws://${host}:${port}`)
