import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createApp } from '../server/app.js'
import { createDatabase } from '../server/db.js'
import { T } from '../src/content.js'

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])

test('Russian locale matches the English content structure', () => {
  const compareShape = (english, russian, path = 'content') => {
    assert.equal(typeof russian, typeof english, `Unexpected Russian value at ${path}`)
    if (Array.isArray(english)) {
      assert.ok(Array.isArray(russian), `Expected a Russian array at ${path}`)
      assert.equal(russian.length, english.length, `Unexpected Russian array length at ${path}`)
      english.forEach((value, index) => compareShape(value, russian[index], `${path}[${index}]`))
      return
    }
    if (english && typeof english === 'object') {
      for (const key of Object.keys(english)) {
        assert.ok(Object.hasOwn(russian, key), `Missing Russian translation at ${path}.${key}`)
        compareShape(english[key], russian[key], `${path}.${key}`)
      }
    }
  }
  compareShape(T.en, T.ru)
})

test('customers submit private trackable orders; admins persist updates and access photos', async (t) => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'megabyte-orders-'))
  const db = createDatabase(path.join(dataDir, 'db'))
  const app = createApp({
    db,
    uploadDir: path.join(dataDir, 'uploads'),
    adminPassword: 'a-secure-test-password',
    sessionSecret: '0123456789abcdef0123456789abcdef',
  })
  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, '127.0.0.1', () => resolve(listeningServer))
  })
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    db.close()
    rmSync(dataDir, { recursive: true, force: true })
  })

  const unauthorizedOrders = await fetch(`${baseUrl}/api/admin/orders`)
  assert.equal(unauthorizedOrders.status, 401)
  const anonymousSession = await fetch(`${baseUrl}/api/admin/session`)
  assert.deepEqual(await anonymousSession.json(), { authenticated: false })

  const body = new FormData()
  body.append('serviceId', 'computer-setup')
  body.append('name', 'Test Customer')
  body.append('phone', '+993 65 123456')
  body.append('description', 'My laptop does not start.')
  body.append('photos', new Blob([png], { type: 'image/png' }), 'laptop.png')

  const createResponse = await fetch(`${baseUrl}/api/orders`, { method: 'POST', body })
  assert.equal(createResponse.status, 201)
  const created = await createResponse.json()
  assert.match(created.orderId, /^MB-\d{4}-[A-F0-9]{16}$/)
  assert.match(created.trackingUrl, /^\/track\/[\w-]{40,50}$/)

  const token = created.trackingUrl.split('/').at(-1)
  const trackingResponse = await fetch(`${baseUrl}/api/orders/track/${token}`)
  assert.equal(trackingResponse.status, 200)
  assert.equal(trackingResponse.headers.get('cache-control'), 'private, no-store')
  const tracking = await trackingResponse.json()
  assert.equal(tracking.order.id, created.orderId)
  assert.equal(tracking.order.status, 'received')
  assert.equal(tracking.order.progress, 20)
  assert.equal('customerPhone' in tracking.order, false)
  assert.deepEqual(tracking.history.map((entry) => entry.status), ['received'])
  assert.equal((await fetch(`${baseUrl}/api/orders/track/${'A'.repeat(43)}`)).status, 404)

  const badLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong-password' }),
  })
  assert.equal(badLogin.status, 401)

  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'a-secure-test-password' }),
  })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie').split(';')[0]
  const adminHeaders = { Cookie: cookie }
  const authenticatedSession = await fetch(`${baseUrl}/api/admin/session`, { headers: adminHeaders })
  assert.deepEqual(await authenticatedSession.json(), { authenticated: true })

  const listResponse = await fetch(`${baseUrl}/api/admin/orders`, { headers: adminHeaders })
  assert.equal(listResponse.status, 200)
  const list = await listResponse.json()
  assert.equal(list.orders.length, 1)
  assert.equal(list.orders[0].customerPhone, '+993 65 123456')
  const attachment = list.orders[0].attachments[0]

  const photoResponse = await fetch(
    `${baseUrl}/api/admin/orders/${created.orderId}/files/${attachment.id}`,
    { headers: adminHeaders },
  )
  assert.equal(photoResponse.status, 200)
  assert.deepEqual(Buffer.from(await photoResponse.arrayBuffer()), png)

  const updateResponse = await fetch(`${baseUrl}/api/admin/orders/${created.orderId}`, {
    method: 'PATCH',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'in_progress',
      estimatedCompletion: '2026-12-01',
      note: 'Technician has started the repair.',
    }),
  })
  assert.equal(updateResponse.status, 200)
  const updated = await updateResponse.json()
  assert.equal(updated.order.progress, 60)
  assert.equal(updated.order.estimatedCompletion, '2026-12-01T23:59:59.999Z')
  assert.equal(updated.history.length, 2)

  const updatedTracking = await (
    await fetch(`${baseUrl}/api/orders/track/${token}`)
  ).json()
  assert.equal(updatedTracking.order.status, 'in_progress')
  assert.equal(updatedTracking.order.progress, 60)
  assert.equal(updatedTracking.history[1].note, 'Technician has started the repair.')

  const invalidDate = await fetch(`${baseUrl}/api/admin/orders/${created.orderId}`, {
    method: 'PATCH',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ready', estimatedCompletion: '2026-99-99' }),
  })
  assert.equal(invalidDate.status, 400)
})

test('SQLite order records survive closing and reopening the database', (t) => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'megabyte-persistence-'))
  let secondDb
  t.after(() => {
    secondDb?.close()
    rmSync(dataDir, { recursive: true, force: true })
  })
  const dbPath = path.join(dataDir, 'persistent')

  const firstDb = createDatabase(dbPath)
  firstDb.prepare(`
    INSERT INTO orders (
      id, tracking_token_hash, service_id, customer_name, customer_phone, description,
      status, progress, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('MB-2026-PERSISTENT', 'stored-hash', 'computer-setup', 'Test', '+993 65 123456', 'Persistent order', 'received', 20, '2026-01-01', '2026-01-01')
  firstDb.close()

  secondDb = createDatabase(dbPath)
  assert.equal(
    secondDb.prepare('SELECT description FROM orders WHERE id = ?').get('MB-2026-PERSISTENT').description,
    'Persistent order',
  )
})
