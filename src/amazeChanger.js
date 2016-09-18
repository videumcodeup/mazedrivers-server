function takeRandom (amount, ...items) {
  return new Array(amount).fill()
    .map(() => items.splice(Math.floor(Math.random() * items.length), 1)[0])
}

function getWallsAndOpeningsToChange (maze, amount) {
  const mazeWithCoordinates = maze
    .map((row, y) => row
      .map((cell, x) => ({ x, y, cell })))
    .slice(1, maze.length - 2)
    .map(row => row
      .slice(1, row.length - 2))

  const wallsWithCoordinates = mazeWithCoordinates
    .map(row => row.filter(({ cell, x, y }) => cell === 'wall'))
    .filter(row => row.length)
    .reduce((a, b) => a.concat(b))

  const openingsWithCoordinates = mazeWithCoordinates
    .map(row => row.filter(({ cell, x, y }) => cell === 'opening'))
    .filter(row => row.length)
    .reduce((a, b) => a.concat(b))

  return {
    walls: takeRandom(amount, ...wallsWithCoordinates),
    openings: takeRandom(amount, ...openingsWithCoordinates)
  }
}

export default function amazeChanger (maze, amount) {
  const mazeCopy = maze.slice(0).map(row => row.slice(0))
  const { walls, openings } = getWallsAndOpeningsToChange(mazeCopy, amount)

  walls.forEach(({ x, y }) => {
    mazeCopy[y][x] = 'opening'
  })

  openings.forEach(({ x, y }) => {
    mazeCopy[y][x] = 'wall'
  })

  return mazeCopy
}
