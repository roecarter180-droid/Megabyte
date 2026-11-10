import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

export function createDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true })
  const db = new Database(path.join(dataDir, 'orders.sqlite'))
  initializeDatabase(db)
  return db
}

export function initializeDatabase(db) {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      tracking_token_hash TEXT NOT NULL UNIQUE,
      service_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL,
      estimated_completion TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_attachments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      storage_name TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS order_status_history_order_id
      ON order_status_history(order_id, id);
    CREATE INDEX IF NOT EXISTS orders_created_at
      ON orders(created_at DESC);
  `)
}
