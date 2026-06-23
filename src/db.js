'use strict';

const { Pool, types } = require('pg');

// DATE型(OID 1082)は 'YYYY-MM-DD' の文字列のまま受け取る（フロント側の期待に合わせる）
types.setTypeParser(1082, (v) => v);

const connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  console.warn('[db] 接続文字列が未設定です。POSTGRES_URL / DATABASE_URL を設定してください。');
}

// Neon / Supabase / RDS などのマネージドPGはSSL必須。ローカルは不要。
const needSsl =
  /sslmode=require|neon\.tech|supabase|amazonaws|render\.com/.test(connectionString || '') ||
  process.env.PGSSL === '1';

const pool = new Pool({
  connectionString,
  ssl: needSsl ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PG_POOL_MAX || 3),
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  role        TEXT,
  email       TEXT,
  note        TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  member_id   INTEGER REFERENCES members(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'todo',
  priority    TEXT NOT NULL DEFAULT 'medium',
  progress    INTEGER NOT NULL DEFAULT 0,
  due_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS records (
  id          SERIAL PRIMARY KEY,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT '1on1',
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  rating      INTEGER,
  summary     TEXT,
  next_action TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_member ON tasks(member_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_records_member ON records(member_id);
`;

// スキーマ初期化はプロセス内で一度だけ実行（サーバーレスのコールドスタート対策）
let schemaReady;
function ensureSchema() {
  if (!schemaReady) {
    schemaReady = pool.query(SCHEMA).catch((err) => {
      schemaReady = undefined; // 失敗したら次回再試行
      throw err;
    });
  }
  return schemaReady;
}

// クエリ実行ヘルパ。最初の呼び出しでスキーマを保証する。
async function query(text, params) {
  await ensureSchema();
  return pool.query(text, params);
}

module.exports = { pool, query, ensureSchema };
