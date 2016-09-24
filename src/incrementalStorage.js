// Nested object storage with saved queue for each storageId
// Usage examples:
//   update('game123', 'players', 'albert', 'direction', 'NORTH')
//   update('game123', 'maze', 4, 7, 'opening')
//   takeQueue('game123')
//   => [['game123', 'players', 'albert', 'direction', 'NORTH']
//       ['game123', 'maze', 4, 7, 'NORTH']]
//   update('game123', 'players', 'kevin', 'x', 10)
//   takeQueue('game123')
//   => [['game123', 'players', 'kevin', 'x', 10]]
//   all()
//   => {game123: { players: { albert: { direction: 'NORTH' },
//                             kevin: { x: 10 } },
//                  maze: [['corner', 'wall', 'corner', ...], ...] } },
//
export default function incrementalStorage () {
  let state = {}
  let queue = {}

  function tryUpdate (storageId, collection, scope, key, value) {
    if (!state[storageId]) {
      state[storageId] = {}
    }
    if (!state[storageId][collection]) {
      state[storageId][collection] = {}
    }
    if (!state[storageId][collection][scope]) {
      state[storageId][collection][scope] = {}
    }
    if (value == null && key == null) {
      state[storageId][collection] = scope
      return
    }
    if (typeof value === 'undefined') {
      delete state[storageId][collection][scope][key]
    } else {
      state[storageId][collection][scope][key] = value
    }
  }

  function addToQueue (storageId, args) {
    if (!queue[storageId]) { queue[storageId] = [] }
    queue[storageId].push(args)
  }

  const api = {
    get () {
      return state
    },

    update (storageId, ...args) {
      tryUpdate(storageId, ...args)
      addToQueue(storageId, args)
    },

    takeQueue (storageId) {
      return queue[storageId].splice(0, queue[storageId].length)
    }
  }

  return api
}
