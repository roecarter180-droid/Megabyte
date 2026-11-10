import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const children = [
  spawn(process.execPath, [path.join(root, 'server', 'index.js')], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: 'inherit',
  }),
  spawn(process.execPath, [viteCli, ...process.argv.slice(2)], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: 'inherit',
  }),
]

let stopping = false

function stop(exitCode) {
  if (stopping) return
  stopping = true
  process.exitCode = exitCode
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill()
  }
}

for (const child of children) {
  child.on('error', (error) => {
    console.error('Could not start the development server:', error)
    stop(1)
  })
  child.on('exit', (code) => {
    if (!stopping) stop(code ?? 1)
  })
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
