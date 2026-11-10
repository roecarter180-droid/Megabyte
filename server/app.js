import express from 'express'
import multer from 'multer'
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ORDER_STATUSES, ORDER_STATUS_PROGRESS, SERVICE_IDS } from '../shared/serviceCatalog.js'

const ADMIN_COOKIE = 'megabyte_admin'
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const MAX_PHOTOS = 5
const STATUS_SET = new Set(ORDER_STATUSES)
const SERVICE_SET = new Set(SERVICE_IDS)
const PROGRESS = ORDER_STATUS_PROGRESS

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function makeAdminCookie(secret) {
  const expires = Date.now() + ADMIN_SESSION_MS
  const signature = createHmac('sha256', secret).update(String(expires)).digest('base64url')
  return `${expires}.${signature}`
}

function validAdminCookie(value, secret) {
  if (!value) return false
  const separator = value.indexOf('.')
  if (separator < 1) return false
  const expires = value.slice(0, separator)
  if (!/^\d+$/.test(expires) || Number(expires) <= Date.now()) return false
  const expected = createHmac('sha256', secret).update(expires).digest()
  let actual
  try {
    actual = Buffer.from(value.slice(separator + 1), 'base64url')
  } catch {
    return false
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function passwordMatches(input, expected, secret) {
  const digest = (value) => createHmac('sha256', secret).update(value).digest()
  return timingSafeEqual(digest(input), digest(expected))
}

function imageType(buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) return 'image/jpeg'
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) return 'image/png'
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp'
  return null
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim().split(/=(.*)/s, 2))
      .filter(([name, value]) => name && value !== undefined)
      .map(([name, value]) => [name, value]),
  )
}

function safeOrder(order) {
  return {
    id: order.id,
    serviceId: order.service_id,
    customerName: order.customer_name,
    description: order.description,
    status: order.status,
    progress: order.progress,
    estimatedCompletion: order.estimated_completion,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  }
}

function readOrder(db, id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id)
}

function readHistory(db, id) {
  return db
    .prepare(
      'SELECT status, note, created_at AS createdAt FROM order_status_history WHERE order_id = ? ORDER BY id',
    )
    .all(id)
}

function readAttachments(db, id) {
  return db
    .prepare(
      'SELECT id, original_name AS originalName, mime_type AS mimeType, size FROM order_attachments WHERE order_id = ?',
    )
    .all(id)
}

function addLoginThrottle(req, res, next) {
  const ip = req.ip
  const now = Date.now()
  const state = loginAttempts.get(ip)
  if (state && state.until > now && state.count >= 10) {
    res.set('Retry-After', String(Math.ceil((state.until - now) / 1000)))
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' })
  }
  next()
}

const loginAttempts = new Map()

export function createApp({
  db,
  uploadDir,
  adminPassword,
  sessionSecret,
  publicDir,
  production = false,
}) {
  if (!db) throw new Error('A SQLite database connection is required.')
  if (!adminPassword) throw new Error('MEGABYTE_ADMIN_PASSWORD is required.')
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error('MEGABYTE_SESSION_SECRET must contain at least 32 characters.')
  }
  if (!uploadDir) throw new Error('An upload directory is required.')

  mkdirSync(uploadDir, { recursive: true })
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS, fields: 4, parts: 9 },
  })

  const requireAdmin = (req, res, next) => {
    res.set('Cache-Control', 'private, no-store')
    const cookie = parseCookies(req.headers.cookie)[ADMIN_COOKIE]
    if (!validAdminCookie(cookie, sessionSecret)) {
      return res.status(401).json({ error: 'Admin sign-in required.' })
    }
    next()
  }

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
  app.use('/api/admin', (_req, res, next) => {
    res.set('Cache-Control', 'no-store')
    next()
  })
  app.get('/api/admin/session', (req, res) => {
    const cookie = parseCookies(req.headers.cookie)[ADMIN_COOKIE]
    res.json({ authenticated: validAdminCookie(cookie, sessionSecret) })
  })

  app.post('/api/orders', upload.array('photos', MAX_PHOTOS), (req, res, next) => {
    const { serviceId, name, phone, description } = req.body
    const customerName = typeof name === 'string' ? name.trim() : ''
    const customerPhone = typeof phone === 'string' ? phone.trim() : ''
    const orderDescription = typeof description === 'string' ? description.trim() : ''
    const phoneDigits = customerPhone.replace(/\D/g, '')

    if (!SERVICE_SET.has(serviceId)) {
      return res.status(400).json({ error: 'Choose a valid service.' })
    }
    if (customerName.length < 2 || customerName.length > 100) {
      return res.status(400).json({ error: 'Name must be between 2 and 100 characters.' })
    }
    if (
      customerPhone.length > 30 ||
      phoneDigits.length < 7 ||
      !/^[+()\d\s.-]+$/.test(customerPhone)
    ) {
      return res.status(400).json({ error: 'Enter a valid phone number.' })
    }
    if (orderDescription.length < 5 || orderDescription.length > 2000) {
      return res.status(400).json({ error: 'Description must be between 5 and 2000 characters.' })
    }

    const files = req.files ?? []
    for (const file of files) {
      const verifiedType = imageType(file.buffer)
      if (!verifiedType || verifiedType !== file.mimetype) {
        return res.status(400).json({ error: 'Upload JPEG, PNG, or WebP images only.' })
      }
    }

    const id = `MB-${new Date().getFullYear()}-${randomBytes(8).toString('hex').toUpperCase()}`
    const trackingToken = randomBytes(32).toString('base64url')
    const tokenHash = hashToken(trackingToken)
    const createdAt = new Date().toISOString()
    const savedFiles = files.map((file) => ({
      id: randomUUID(),
      storageName: `${randomUUID()}.${file.mimetype.slice('image/'.length)}`,
      originalName: path.basename(file.originalname).slice(0, 200),
      mimeType: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    }))

    try {
      for (const file of savedFiles) {
        writeFileSync(path.join(uploadDir, file.storageName), file.buffer, { flag: 'wx' })
      }
      const createOrder = db.transaction(() => {
        db.prepare(`
          INSERT INTO orders (
            id, tracking_token_hash, service_id, customer_name, customer_phone,
            description, status, progress, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'received', ?, ?, ?)
        `).run(
          id,
          tokenHash,
          serviceId,
          customerName,
          customerPhone,
          orderDescription,
          PROGRESS.received,
          createdAt,
          createdAt,
        )
        db.prepare(`
          INSERT INTO order_status_history (order_id, status, note, created_at)
          VALUES (?, 'received', '', ?)
        `).run(id, createdAt)
        const insertFile = db.prepare(`
          INSERT INTO order_attachments (id, order_id, storage_name, original_name, mime_type, size)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        for (const file of savedFiles) {
          insertFile.run(file.id, id, file.storageName, file.originalName, file.mimeType, file.size)
        }
      })
      createOrder()
    } catch (error) {
      for (const file of savedFiles) {
        rmSync(path.join(uploadDir, file.storageName), { force: true })
      }
      return next(error)
    }

    res.set('Cache-Control', 'private, no-store')
    res.status(201).json({
      orderId: id,
      trackingUrl: `/track/${trackingToken}`,
    })
  })

  app.get('/api/orders/track/:token', (req, res) => {
    const token = req.params.token
    if (!/^[\w-]{40,50}$/.test(token)) {
      return res.status(404).json({ error: 'Order not found.' })
    }
    const order = db
      .prepare('SELECT * FROM orders WHERE tracking_token_hash = ?')
      .get(hashToken(token))
    if (!order) return res.status(404).json({ error: 'Order not found.' })
    res.set('Cache-Control', 'private, no-store')
    res.set('Referrer-Policy', 'no-referrer')
    res.json({
      order: safeOrder(order),
      history: readHistory(db, order.id),
    })
  })

  app.post('/api/admin/login', addLoginThrottle, express.json({ limit: '2kb' }), (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    const state = loginAttempts.get(req.ip)
    if (!passwordMatches(password, adminPassword, sessionSecret)) {
      const now = Date.now()
      if (!state || state.until <= now) {
        loginAttempts.set(req.ip, { count: 1, until: now + 15 * 60 * 1000 })
      } else {
        state.count += 1
      }
      return res.status(401).json({ error: 'Incorrect password.' })
    }
    loginAttempts.delete(req.ip)
    res.cookie(ADMIN_COOKIE, makeAdminCookie(sessionSecret), {
      httpOnly: true,
      secure: production,
      sameSite: 'strict',
      path: '/api/admin',
      maxAge: ADMIN_SESSION_MS,
    })
    res.json({ authenticated: true })
  })

  app.post('/api/admin/logout', (_req, res) => {
    res.clearCookie(ADMIN_COOKIE, {
      httpOnly: true,
      secure: production,
      sameSite: 'strict',
      path: '/api/admin',
    })
    res.status(204).end()
  })

  app.get('/api/admin/orders', requireAdmin, (_req, res) => {
    const orders = db
      .prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 500')
      .all()
      .map((order) => ({
        ...safeOrder(order),
        customerPhone: order.customer_phone,
        history: readHistory(db, order.id),
        attachments: readAttachments(db, order.id),
      }))
    res.json({ orders })
  })

  app.get('/api/admin/orders/:id/files/:fileId', requireAdmin, (req, res, next) => {
    const file = db
      .prepare('SELECT * FROM order_attachments WHERE id = ? AND order_id = ?')
      .get(req.params.fileId, req.params.id)
    if (!file) return res.status(404).json({ error: 'Photo not found.' })
    res.type(file.mime_type)
    res.set('Cache-Control', 'private, no-store')
    res.sendFile(file.storage_name, { root: uploadDir }, (error) => {
      if (error) next(error)
    })
  })

  app.patch('/api/admin/orders/:id', requireAdmin, express.json({ limit: '4kb' }), (req, res) => {
    const order = readOrder(db, req.params.id)
    if (!order) return res.status(404).json({ error: 'Order not found.' })

    const status = req.body?.status
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : ''
    const estimate = req.body?.estimatedCompletion
    if (!STATUS_SET.has(status)) {
      return res.status(400).json({ error: 'Choose a valid order status.' })
    }
    if (note.length > 1000) {
      return res.status(400).json({ error: 'Update must be 1000 characters or fewer.' })
    }
    if (estimate !== null && estimate !== '') {
      const parsedEstimate = new Date(`${estimate}T00:00:00.000Z`)
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(estimate) ||
        Number.isNaN(parsedEstimate.getTime()) ||
        parsedEstimate.toISOString().slice(0, 10) !== estimate
      ) {
        return res.status(400).json({ error: 'Enter a valid estimated completion date.' })
      }
    }

    const estimatedCompletion = estimate ? `${estimate}T23:59:59.999Z` : null
    const updatedAt = new Date().toISOString()
    const updateOrder = db.transaction(() => {
      db.prepare(`
        UPDATE orders SET status = ?, progress = ?, estimated_completion = ?, updated_at = ?
        WHERE id = ?
      `).run(status, PROGRESS[status], estimatedCompletion, updatedAt, order.id)
      db.prepare(`
        INSERT INTO order_status_history (order_id, status, note, created_at) VALUES (?, ?, ?, ?)
      `).run(order.id, status, note, updatedAt)
    })
    updateOrder()

    res.json({
      order: safeOrder(readOrder(db, order.id)),
      history: readHistory(db, order.id),
    })
  })

  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }))

  if (publicDir) {
    app.use(express.static(publicDir))
    app.get('*splat', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')))
  }

  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Each image must be 5 MB or smaller.'
          : error.code === 'LIMIT_FILE_COUNT'
            ? 'Upload no more than 5 images.'
            : 'Could not process the uploaded images.'
      return res.status(400).json({ error: message })
    }
    if (error instanceof SyntaxError && 'body' in error) {
      return res.status(400).json({ error: 'Request body contains invalid JSON.' })
    }
    console.error('Request failed:', error)
    res.status(500).json({ error: 'The request could not be completed. Please try again.' })
  })

  return app
}
