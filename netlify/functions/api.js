import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import {
  ORDER_STATUSES,
  ORDER_STATUS_PROGRESS,
  SERVICE_IDS,
} from '../../shared/serviceCatalog.js'

const ADMIN_COOKIE = 'megabyte_admin'
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const MAX_PHOTOS = 5
const STORAGE_BUCKET = 'order-photos'
const STATUS_SET = new Set(ORDER_STATUSES)
const SERVICE_SET = new Set(SERVICE_IDS)
const loginAttempts = new Map()

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers })
}

function dbResult(result) {
  if (result.error) throw result.error
  return result.data
}

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
  const actual = Buffer.from(value.slice(separator + 1), 'base64url')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function passwordMatches(input, expected, secret) {
  const digest = (value) => createHmac('sha256', secret).update(value).digest()
  return timingSafeEqual(digest(input), digest(expected))
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim().split(/=(.*)/s, 2))
      .filter(([name, value]) => name && value !== undefined),
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

function imageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
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

function getSettings() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MEGABYTE_ADMIN_PASSWORD, MEGABYTE_SESSION_SECRET } =
    process.env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for the order API.')
  }
  if (!MEGABYTE_ADMIN_PASSWORD || MEGABYTE_ADMIN_PASSWORD.length < 12) {
    throw new Error('Set MEGABYTE_ADMIN_PASSWORD to a password at least 12 characters long.')
  }
  if (!MEGABYTE_SESSION_SECRET || MEGABYTE_SESSION_SECRET.length < 32) {
    throw new Error('Set MEGABYTE_SESSION_SECRET to a random secret at least 32 characters long.')
  }
  return {
    supabase: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    adminPassword: MEGABYTE_ADMIN_PASSWORD,
    sessionSecret: MEGABYTE_SESSION_SECRET,
  }
}

function hasApiSettings() {
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    MEGABYTE_ADMIN_PASSWORD,
    MEGABYTE_SESSION_SECRET,
  } = process.env
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_SERVICE_ROLE_KEY &&
    MEGABYTE_ADMIN_PASSWORD?.length >= 12 &&
    MEGABYTE_SESSION_SECRET?.length >= 32,
  )
}

function validateOrder(body) {
  const serviceId = body.serviceId
  const customerName = typeof body.name === 'string' ? body.name.trim() : ''
  const customerPhone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const phoneDigits = customerPhone.replace(/\D/g, '')
  if (!SERVICE_SET.has(serviceId)) return 'Choose a valid service.'
  if (customerName.length < 2 || customerName.length > 100) {
    return 'Name must be between 2 and 100 characters.'
  }
  if (
    customerPhone.length > 30 ||
    phoneDigits.length < 7 ||
    !/^[+()\d\s.-]+$/.test(customerPhone)
  ) return 'Enter a valid phone number.'
  if (description.length < 5 || description.length > 2000) {
    return 'Description must be between 5 and 2000 characters.'
  }
  return null
}

async function readJson(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

async function readHistory(supabase, orderId) {
  return dbResult(await supabase
    .from('order_status_history')
    .select('status,note,created_at')
    .eq('order_id', orderId)
    .order('id', { ascending: true }))
    .map((entry) => ({
      status: entry.status,
      note: entry.note,
      createdAt: entry.created_at,
    }))
}

async function getAdminOrders(supabase) {
  const orders = dbResult(await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500))
  if (!orders.length) return []
  const orderIds = orders.map((order) => order.id)
  const [history, attachments] = await Promise.all([
    supabase.from('order_status_history').select('*').in('order_id', orderIds).order('id'),
    supabase.from('order_attachments').select('*').in('order_id', orderIds),
  ])
  const historyByOrder = new Map()
  for (const entry of dbResult(history)) {
    const records = historyByOrder.get(entry.order_id) ?? []
    records.push({
      status: entry.status,
      note: entry.note,
      createdAt: entry.created_at,
    })
    historyByOrder.set(entry.order_id, records)
  }
  const attachmentsByOrder = new Map()
  for (const entry of dbResult(attachments)) {
    const records = attachmentsByOrder.get(entry.order_id) ?? []
    records.push({
      id: entry.id,
      originalName: entry.original_name,
      mimeType: entry.mime_type,
      size: entry.size,
    })
    attachmentsByOrder.set(entry.order_id, records)
  }
  return orders.map((order) => ({
    ...safeOrder(order),
    customerPhone: order.customer_phone,
    history: historyByOrder.get(order.id) ?? [],
    attachments: attachmentsByOrder.get(order.id) ?? [],
  }))
}

function validateAdminCookie(request, sessionSecret) {
  const cookie = parseCookies(request.headers.get('cookie') ?? '')[ADMIN_COOKIE]
  return validAdminCookie(cookie, sessionSecret)
}

async function handleSignUploads(request, supabase) {
  const body = await readJson(request)
  if (!body || !Array.isArray(body.photos) || body.photos.length > MAX_PHOTOS) {
    return json({ error: 'Choose no more than 5 photos.' }, 400)
  }
  for (const photo of body.photos) {
    if (
      !photo ||
      typeof photo.name !== 'string' ||
      !Number.isSafeInteger(photo.size) ||
      photo.size < 1 ||
      photo.size > MAX_PHOTO_BYTES ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)
    ) return json({ error: 'Upload JPEG, PNG, or WebP images no larger than 5 MB.' }, 400)
  }
  const signedUploads = []
  try {
    for (const photo of body.photos) {
      const id = randomUUID()
      const extension = photo.type.slice('image/'.length)
      const storageName = `${randomUUID()}.${extension}`
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUploadUrl(storageName)
      if (error) throw error
      dbResult(await supabase.from('pending_uploads').insert({
        id,
        storage_name: storageName,
        original_name: photo.name.split(/[\\/]/).at(-1).slice(0, 200),
        mime_type: photo.type,
        size: photo.size,
      }))
      signedUploads.push({ id, storageName, token: data.token })
    }
    return json({ uploads: signedUploads })
  } catch (error) {
    const ids = signedUploads.map((upload) => upload.id)
    const paths = signedUploads.map((upload) => upload.storageName)
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove(paths)
      if (storageError) console.error('Could not clean up signed uploads:', storageError)
    }
    if (ids.length) {
      const { error: databaseError } = await supabase.from('pending_uploads').delete().in('id', ids)
      if (databaseError) console.error('Could not clean up pending upload records:', databaseError)
    }
    throw error
  }
}

async function handleUploadCleanup(request, supabase) {
  const body = await readJson(request)
  if (!body || !Array.isArray(body.ids) || body.ids.length > MAX_PHOTOS) {
    return json({ error: 'Invalid upload cleanup request.' }, 400)
  }
  if (!body.ids.length) return new Response(null, { status: 204 })
  const pending = dbResult(await supabase
    .from('pending_uploads')
    .select('id,storage_name')
    .in('id', body.ids))
  if (pending.length) {
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(pending.map((item) => item.storage_name))
    if (error) throw error
    dbResult(await supabase.from('pending_uploads').delete().in('id', pending.map((item) => item.id)))
  }
  return new Response(null, { status: 204 })
}

async function handleCreateOrder(request, supabase) {
  const body = await readJson(request)
  if (!body) return json({ error: 'Request body contains invalid JSON.' }, 400)
  const validationError = validateOrder(body)
  if (validationError) return json({ error: validationError }, 400)
  const uploadIds = body.uploadIds ?? []
  if (!Array.isArray(uploadIds) || uploadIds.length > MAX_PHOTOS || new Set(uploadIds).size !== uploadIds.length) {
    return json({ error: 'Invalid photo uploads.' }, 400)
  }

  const pending = uploadIds.length
    ? dbResult(await supabase
      .from('pending_uploads')
      .select('*')
      .in('id', uploadIds)
      .gt('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()))
    : []
  if (pending.length !== uploadIds.length) {
    return json({ error: 'One or more photo uploads expired. Please try again.' }, 400)
  }
  const attachments = []
  for (const upload of pending) {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(upload.storage_name)
    if (error) return json({ error: 'A photo did not finish uploading. Please try again.' }, 400)
    const buffer = Buffer.from(await data.arrayBuffer())
    if (buffer.length !== upload.size || imageType(buffer) !== upload.mime_type) {
      return json({ error: 'Upload JPEG, PNG, or WebP images only.' }, 400)
    }
    attachments.push({
      id: upload.id,
      storage_name: upload.storage_name,
      original_name: upload.original_name,
      mime_type: upload.mime_type,
      size: upload.size,
    })
  }

  const id = `MB-${new Date().getFullYear()}-${randomBytes(8).toString('hex').toUpperCase()}`
  const trackingToken = randomBytes(32).toString('base64url')
  const createdAt = new Date().toISOString()
  dbResult(await supabase.rpc('create_service_order', {
    p_order: {
      id,
      tracking_token_hash: hashToken(trackingToken),
      service_id: body.serviceId,
      customer_name: body.name.trim(),
      customer_phone: body.phone.trim(),
      description: body.description.trim(),
      status: 'received',
      progress: ORDER_STATUS_PROGRESS.received,
      estimated_completion: null,
      created_at: createdAt,
      updated_at: createdAt,
    },
    p_attachments: attachments,
    p_upload_ids: uploadIds,
  }))
  return json({ orderId: id, trackingUrl: `/track/${trackingToken}` }, 201, {
    'Cache-Control': 'private, no-store',
  })
}

function loginLimit(request, context) {
  const ip = context.ip || request.headers.get('x-nf-client-connection-ip') || 'unknown'
  const now = Date.now()
  const state = loginAttempts.get(ip)
  if (state && state.until > now && state.count >= 10) {
    return json(
      { error: 'Too many login attempts. Try again later.' },
      429,
      { 'Retry-After': String(Math.ceil((state.until - now) / 1000)) },
    )
  }
  return ip
}

async function handleLogin(request, context, adminPassword, sessionSecret) {
  const ip = loginLimit(request, context)
  if (ip instanceof Response) return ip
  const body = await readJson(request)
  const password = typeof body?.password === 'string' ? body.password : ''
  const state = loginAttempts.get(ip)
  if (!passwordMatches(password, adminPassword, sessionSecret)) {
    const now = Date.now()
    if (!state || state.until <= now) {
      loginAttempts.set(ip, { count: 1, until: now + 15 * 60 * 1000 })
    } else {
      state.count += 1
    }
    return json({ error: 'Incorrect password.' }, 401)
  }
  loginAttempts.delete(ip)
  return json(
    { authenticated: true },
    200,
    {
      'Cache-Control': 'no-store',
      'Set-Cookie': `${ADMIN_COOKIE}=${makeAdminCookie(sessionSecret)}; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=${ADMIN_SESSION_MS / 1000}`,
    },
  )
}

async function handleUpdateOrder(request, orderId, supabase) {
  const body = await readJson(request)
  if (!body) return json({ error: 'Request body contains invalid JSON.' }, 400)
  const status = body.status
  const note = typeof body.note === 'string' ? body.note.trim() : ''
  const estimate = body.estimatedCompletion
  if (!STATUS_SET.has(status)) return json({ error: 'Choose a valid order status.' }, 400)
  if (note.length > 1000) return json({ error: 'Update must be 1000 characters or fewer.' }, 400)
  if (estimate !== null && estimate !== '') {
    const parsedEstimate = new Date(`${estimate}T00:00:00.000Z`)
    if (
      typeof estimate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(estimate) ||
      Number.isNaN(parsedEstimate.getTime()) ||
      parsedEstimate.toISOString().slice(0, 10) !== estimate
    ) return json({ error: 'Enter a valid estimated completion date.' }, 400)
  }
  const updatedAt = new Date().toISOString()
  const { error } = await supabase.rpc('update_service_order', {
    p_order_id: orderId,
    p_status: status,
    p_progress: ORDER_STATUS_PROGRESS[status],
    p_estimated_completion: estimate ? `${estimate}T23:59:59.999Z` : null,
    p_note: note,
    p_updated_at: updatedAt,
  })
  if (error?.code === 'P0002') return json({ error: 'Order not found.' }, 404)
  if (error) throw error
  const order = dbResult(await supabase.from('orders').select('*').eq('id', orderId).maybeSingle())
  if (!order) return json({ error: 'Order not found.' }, 404)
  return json({ order: safeOrder(order), history: await readHistory(supabase, order.id) })
}

async function route(request, context, settings) {
  const { supabase, adminPassword, sessionSecret } = settings
  const { pathname } = new URL(request.url)
  if (pathname === '/api/health' && request.method === 'GET') {
    return json({ status: 'ok' }, 200, { 'Cache-Control': 'no-store' })
  }
  if (pathname.startsWith('/api/admin/')) {
    const headers = { 'Cache-Control': 'no-store' }
    if (pathname === '/api/admin/session' && request.method === 'GET') {
      return json({ authenticated: validateAdminCookie(request, sessionSecret) }, 200, headers)
    }
    if (pathname === '/api/admin/login' && request.method === 'POST') {
      return handleLogin(request, context, adminPassword, sessionSecret)
    }
    if (pathname === '/api/admin/logout' && request.method === 'POST') {
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          'Set-Cookie': `${ADMIN_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=0`,
        },
      })
    }
    if (!validateAdminCookie(request, sessionSecret)) {
      return json({ error: 'Admin sign-in required.' }, 401, headers)
    }
    if (pathname === '/api/admin/orders' && request.method === 'GET') {
      return json({ orders: await getAdminOrders(supabase) }, 200, headers)
    }
    const fileMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)\/files\/([^/]+)$/)
    if (fileMatch && request.method === 'GET') {
      const [, orderId, fileId] = fileMatch.map(decodeURIComponent)
      const file = dbResult(await supabase
        .from('order_attachments')
        .select('storage_name,mime_type')
        .eq('id', fileId)
        .eq('order_id', orderId)
        .maybeSingle())
      if (!file) return json({ error: 'Photo not found.' }, 404, headers)
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(file.storage_name)
      if (error) throw error
      return new Response(data, {
        headers: {
          ...headers,
          'Cache-Control': 'private, no-store',
          'Content-Type': file.mime_type,
          'X-Content-Type-Options': 'nosniff',
        },
      })
    }
    const orderMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/)
    if (orderMatch && request.method === 'PATCH') {
      return handleUpdateOrder(request, decodeURIComponent(orderMatch[1]), supabase)
    }
    return json({ error: 'API route not found.' }, 404, headers)
  }
  if (pathname === '/api/uploads/sign' && request.method === 'POST') {
    return handleSignUploads(request, supabase)
  }
  if (pathname === '/api/uploads/cleanup' && request.method === 'POST') {
    return handleUploadCleanup(request, supabase)
  }
  if (pathname === '/api/orders' && request.method === 'POST') {
    return handleCreateOrder(request, supabase)
  }
  const trackingMatch = pathname.match(/^\/api\/orders\/track\/([^/]+)$/)
  if (trackingMatch && request.method === 'GET') {
    const token = decodeURIComponent(trackingMatch[1])
    if (!/^[\w-]{40,50}$/.test(token)) return json({ error: 'Order not found.' }, 404)
    const order = dbResult(await supabase
      .from('orders')
      .select('*')
      .eq('tracking_token_hash', hashToken(token))
      .maybeSingle())
    if (!order) return json({ error: 'Order not found.' }, 404)
    return json(
      { order: safeOrder(order), history: await readHistory(supabase, order.id) },
      200,
      { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
    )
  }
  return json({ error: 'API route not found.' }, 404)
}

export default async function handler(request, context) {
  const { pathname } = new URL(request.url)
  if (pathname === '/api/health' && request.method === 'GET') {
    return json({ status: 'ok' }, 200, { 'Cache-Control': 'no-store' })
  }
  if (!hasApiSettings()) {
    return json(
      { error: 'Order service is not configured. Orders, tracking, and admin features are unavailable.' },
      503,
      { 'Cache-Control': 'no-store' },
    )
  }
  try {
    return await route(request, context, getSettings())
  } catch (error) {
    console.error('Order API request failed:', error)
    return json({ error: 'The request could not be completed. Please try again.' }, 500)
  }
}

export const config = { path: '/api/*' }
