import deepFreeze from 'deep-freeze'
import omit from 'lodash/omit'
import { v4 as getId } from 'node-uuid'

export default function createState (initial) {
  let state = deepFreeze(initial)
  let listeners = {}
  const notify = () => setTimeout(() =>
    Object.keys(listeners).forEach(id => listeners[id].call(null, state)))

  const api = {
    get () {
      return state
    },
    update (coll, key, val) {
      if (typeof state[coll] !== 'object') {
        throw new Error(`Cannot access coll ${coll} in state ${state}`)
      }

      let newVal
      if (val instanceof Array) {
        newVal = val
      } else {
        newVal = {
          ...state[coll] && state[coll][key],
          ...val
        }
      }
      // state[coll][key] = val
      state = {
        ...state,
        [coll]: {
          ...state[coll],
          [key]: newVal
        }
      }
      notify()
      return api
    },
    remove (coll, key) {
      if (typeof state[coll] !== 'object') {
        throw new Error(`Cannot access coll ${coll} in state ${state}`)
      }
      // delete state[key]
      state = Object.assign({}, state, {
        [coll]: omit(state[coll], key)
      })
      notify()
      return api
    },
    listen (callback) {
      const id = getId()
      listeners[id] = callback
      const unlisten = () => delete listeners[id]
      return unlisten
    }
  }
  return api
}
