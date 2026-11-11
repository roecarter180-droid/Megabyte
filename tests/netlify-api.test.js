import assert from 'node:assert/strict'
import test from 'node:test'
import handler from '../netlify/functions/api.js'

test('Netlify site can publish without configuring its optional order API', async () => {
  const keys = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'MEGABYTE_ADMIN_PASSWORD',
    'MEGABYTE_SESSION_SECRET',
  ]
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

  try {
    for (const key of keys) delete process.env[key]
    const health = await handler(
      new Request('https://example.netlify.app/api/health'),
      { ip: '127.0.0.1' },
    )
    assert.equal(health.status, 200)
    assert.deepEqual(await health.json(), { status: 'ok' })

    const response = await handler(
      new Request('https://example.netlify.app/api/orders', { method: 'POST' }),
      { ip: '127.0.0.1' },
    )
    assert.equal(response.status, 503)
    assert.match((await response.json()).error, /not configured/)
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
})
