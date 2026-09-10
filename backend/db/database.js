import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'honeychain.db');

// Ensure parent dir exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS beekeepers (
      id            INTEGER PRIMARY KEY,
      name          TEXT NOT NULL,
      location      TEXT NOT NULL,
      phone         TEXT,
      joined_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hives (
      id              TEXT PRIMARY KEY,
      beekeeper_id    INTEGER NOT NULL REFERENCES beekeepers(id),
      name            TEXT,
      latitude        REAL,
      longitude       REAL,
      current_health  REAL,
      current_weight  REAL,
      last_updated    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS batches (
      id                TEXT PRIMARY KEY,
      hive_id           TEXT NOT NULL REFERENCES hives(id),
      beekeeper_id      INTEGER NOT NULL REFERENCES beekeepers(id),
      harvest_date      TEXT NOT NULL,
      location          TEXT NOT NULL,
      health_at_harvest REAL NOT NULL,
      health_label      TEXT NOT NULL,
      weight_kg         REAL,
      moisture_pct      REAL,
      onchain_hash      TEXT NOT NULL,
      block_number      INTEGER,
      ipfs_cid          TEXT,
      status            TEXT NOT NULL DEFAULT 'verified',
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS batch_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id      TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
      event_type    TEXT NOT NULL,
      event_date    TEXT NOT NULL,
      location      TEXT,
      actor         TEXT,
      notes         TEXT,
      onchain_tx    TEXT
    );

    CREATE TABLE IF NOT EXISTS sensor_readings (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      hive_id            TEXT NOT NULL REFERENCES hives(id),
      recorded_at        TEXT NOT NULL,
      temperature_c      REAL,
      humidity_pct       REAL,
      weight_kg          REAL,
      audio_health_score REAL
    );

    CREATE INDEX IF NOT EXISTS idx_batches_hive ON batches(hive_id);
    CREATE INDEX IF NOT EXISTS idx_events_batch ON batch_events(batch_id);
    CREATE INDEX IF NOT EXISTS idx_readings_hive ON sensor_readings(hive_id, recorded_at);
  `);
}