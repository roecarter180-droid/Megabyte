import 'dotenv/config'
import Database from 'better-sqlite3'
import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const databasePath = path.resolve(process.env.MEGABYTE_DATA_DIR || 'data', 'orders.sqlite')
const uploadDir = path.resolve(process.env.MEGABYTE_DATA_DIR || 'data', 'uploads')
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before migrating.')
}
if (!existsSync(databasePath)) throw new Error(`Local database not found: ${databasePath}`)

const db = new Database(databasePath, { readonly: true })
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function assertNoError({ error }) {
  if (error) throw error
}

try {
  const orders = db.prepare('SELECT * FROM orders').all()
  const history = db.prepare('SELECT * FROM order_status_history').all()
  const attachments = db.prepare('SELECT * FROM order_attachments').all()

  for (const attachment of attachments) {
    const filePath = path.join(uploadDir, attachment.storage_name)
    if (!existsSync(filePath)) {
      throw new Error(`Attachment file is missing for order ${attachment.order_id}.`)
    }
    const contents = readFileSync(filePath)
    if (contents.length !== attachment.size) {
      throw new Error(`Attachment size mismatch for order ${attachment.order_id}.`)
    }
    assertNoError(await supabase.storage
      .from('order-photos')
      .upload(attachment.storage_name, contents, {
        contentType: attachment.mime_type,
        upsert: true,
      }))
  }

  if (orders.length) assertNoError(await supabase.from('orders').upsert(orders, { onConflict: 'id' }))
  if (history.length) {
    assertNoError(await supabase.from('order_status_history').upsert(history, { onConflict: 'id' }))
  }
  if (attachments.length) {
    const hostedAttachments = attachments.map((attachment) => ({
      id: attachment.id,
      order_id: attachment.order_id,
      storage_name: attachment.storage_name,
      original_name: attachment.original_name,
      mime_type: attachment.mime_type,
      size: attachment.size,
    }))
    assertNoError(await supabase.from('order_attachments').upsert(hostedAttachments, { onConflict: 'id' }))
  }
  assertNoError(await supabase.rpc('sync_order_status_history_sequence'))
  console.log(`Migrated ${orders.length} orders, ${history.length} status updates, and ${attachments.length} photos.`)
} finally {
  db.close()
}
