'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * スキーマ定義。
 * - members  : 部下（チームメンバー）
 * - tasks    : ミッション / アサイン業務
 * - records  : 1on1・評価などの面談記録
 */
db.exec(`
CREATE TABLE IF NOT EXISTS members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  role        TEXT,
  email       TEXT,
  note        TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  member_id   INTEGER REFERENCES members(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'todo',   -- todo | in_progress | review | done | blocked
  priority    TEXT NOT NULL DEFAULT 'medium', -- low | medium | high | urgent
  progress    INTEGER NOT NULL DEFAULT 0,     -- 0-100
  due_date    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS records (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT '1on1',   -- 1on1 | evaluation | memo
  date        TEXT NOT NULL DEFAULT (date('now')),
  rating      INTEGER,                         -- 1-5 (評価時)
  summary     TEXT,
  next_action TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_member ON tasks(member_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_records_member ON records(member_id);
`);

module.exports = db;
