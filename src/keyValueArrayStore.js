import matches from 'lodash/matches'

// An array of things where it's easy to update an item by one
// of it's keys.
export default function keyValueArrayStore () {
  const all = []

  const api = {
    all: () => all,

    filterBy (keyValues) {
      return all.filter(matches(keyValues))
    },

    findBy (keyValues) {
      return all.find(matches(keyValues))
    },

    someBy (keyValues) {
      return all.some(matches(keyValues))
    },

    updateBy (keyValues, newValues) {
      const match = all.find(matches(keyValues))
      if (!match) {
        return all.push(newValues)
      }
      Object.assign(match, newValues)
      return match
    },

    removeBy (keyValues) {
      for (let i = all.length - 1; i >= 0; i--) {
        if (matches(keyValues)(all[i])) {
          all.splice(i, 1)
        }
      }
    }
  }

  return api
}
