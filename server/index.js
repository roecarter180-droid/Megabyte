import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { createDatabase } from './db.js'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.resolve(process.env.MEGABYTE_DATA_DIR || path.join(rootDir, 'data'))
const production = process.env.NODE_ENV === 'production'
let adminPassword = process.env.MEGABYTE_ADMIN_PASSWORD
let sessionSecret = process.env.MEGABYTE_SESSION_SECRET

if (production) {
  if (!adminPassword || adminPassword.length < 12) {
    throw new Error('Set MEGABYTE_ADMIN_PASSWORD to a password at least 12 characters long.')
  }
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error('Set MEGABYTE_SESSION_SECRET to a random secret at least 32 characters long.')
  }
} else {
  if (!adminPassword) adminPassword = randomBytes(24).toString('base64url')
  if (!sessionSecret) sessionSecret = randomBytes(48).toString('base64url')
  if (!process.env.MEGABYTE_ADMIN_PASSWORD) {
    console.log(`Temporary development admin password: ${adminPassword}`)
  }
}

const db = createDatabase(dataDir)
const app = createApp({
  db,
  uploadDir: path.join(dataDir, 'uploads'),
  adminPassword,
  sessionSecret,
  publicDir: production ? path.join(rootDir, 'dist') : undefined,
  production,
})

const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || (production ? '0.0.0.0' : '127.0.0.1')
app.listen(port, host, () => {
  console.log(`MegaByte order API listening on http://${host}:${port}`)
})
