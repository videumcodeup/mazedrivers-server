import { exec } from 'child_process'

export default function getAmaze (width, height) {
  if (typeof width !== 'number' || width < 3 || width > 30) {
    throw new Error(`Invalid width ${width}`)
  }
  if (typeof height !== 'number' || height < 3 || height > 30) {
    throw new Error(`Invalid height ${height}`)
  }
  return new Promise((resolve, reject) => {
    exec(`ruby amaze.rb ${width} ${height} json`, (err, stdout, stderr) => {
      if (err) {
        console.error(err)
        reject(err)
      }
      const maze = JSON.parse(stdout.trim())
      resolve(maze)
    })
  })
}
