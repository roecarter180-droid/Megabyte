import assert from 'node:assert/strict'
import test from 'node:test'
import handler from '../netlify/functions/api.js'

test('Netlify order function serves the health route with deployment settings', async () => {
  const keys = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'MEGABYTE_ADMIN_PASSWORD',
    'MEGABYTE_SESSION_SECRET',
  ]
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
  Object.assign(process.env, {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    MEGABYTE_ADMIN_PASSWORD: 'secure-test-password',
    MEGABYTE_SESSION_SECRET: '0123456789abcdef0123456789abcdef',
  })

  try {
    const response = await handler(
      new Request('https://example.netlify.app/api/health'),
      { ip: '127.0.0.1' },
    )
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ok' })
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
})
