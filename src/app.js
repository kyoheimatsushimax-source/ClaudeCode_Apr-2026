'use strict';

const crypto = require('crypto');
const express = require('express');
const { query } = require('./db');

const app = express();
app.use(express.json());

// ---- 定数（バリデーション用） -------------------------------------------
const TASK_STATUS = ['todo', 'in_progress', 'review', 'done', 'blocked'];
const TASK_PRIORITY = ['low', 'medium', 'high', 'urgent'];
const RECORD_TYPE = ['1on1', 'evaluation', 'memo'];

// =========================================================================
//  簡易パスワード認証
//  - APP_PASSWORD が設定されている場合のみ有効
//  - 未設定ならローカル開発用に認証なしで動作
// =========================================================================
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const COOKIE = 'tm_auth';
const authToken = APP_PASSWORD
  ? crypto.createHash('sha256').update('tm:' + APP_PASSWORD).digest('hex')
  : '';

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  raw.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function isAuthed(req) {
  if (!APP_PASSWORD) return true; // 認証なし運用
  return parseCookies(req)[COOKIE] === authToken;
}

function setAuthCookie(res) {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL ? '; Secure' : '';
  // 30日有効
  res.setHeader('Set-Cookie',
    `${COOKIE}=${authToken}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure}`);
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

// セッション状態（フロントの初期判定に使用）
app.get('/api/session', (req, res) => {
  res.json({ authRequired: !!APP_PASSWORD, authed: isAuthed(req) });
});

app.post('/api/login', (req, res) => {
  if (!APP_PASSWORD) return res.json({ ok: true }); // 認証なし
  const { password } = req.body || {};
  // タイミング攻撃を避けるため固定長ハッシュで比較
  const given = crypto.createHash('sha256').update('tm:' + String(password || '')).digest('hex');
  const ok = crypto.timingSafeEqual(Buffer.from(given), Buffer.from(authToken));
  if (!ok) return res.status(401).json({ error: 'パスワードが違います' });
  setAuthCookie(res);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// これ以降の /api/* はすべて認証必須
app.use('/api', (req, res, next) => {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'unauthorized' });
});

// ---- ヘルパ --------------------------------------------------------------
function clampProgress(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
function fail(res, code, message) { return res.status(code).json({ error: message }); }

// 非同期ハンドラのエラーをまとめて処理
function wrap(handler) {
  return async (req, res) => {
    try { await handler(req, res); }
    catch (err) { console.error(err); fail(res, 500, err.message || 'internal error'); }
  };
}

// =========================================================================
//  Members  (部下)
// =========================================================================
app.get('/api/members', wrap(async (req, res) => {
  const { rows } = await query(`
    SELECT m.*,
      (SELECT COUNT(*)::int FROM tasks t WHERE t.member_id = m.id AND t.status <> 'done') AS open_tasks,
      (SELECT COUNT(*)::int FROM tasks t WHERE t.member_id = m.id) AS total_tasks
    FROM members m
    ORDER BY m.active DESC, lower(m.name)
  `);
  res.json(rows);
}));

app.get('/api/members/:id', wrap(async (req, res) => {
  const { rows } = await query('SELECT * FROM members WHERE id = $1', [req.params.id]);
  const member = rows[0];
  if (!member) return fail(res, 404, 'member not found');
  member.tasks = (await query(
    'SELECT * FROM tasks WHERE member_id = $1 ORDER BY due_date IS NULL, due_date', [member.id])).rows;
  member.records = (await query(
    'SELECT * FROM records WHERE member_id = $1 ORDER BY date DESC, id DESC', [member.id])).rows;
  res.json(member);
}));

app.post('/api/members', wrap(async (req, res) => {
  const { name, role, email, note } = req.body || {};
  if (!name || !String(name).trim()) return fail(res, 400, 'name is required');
  const { rows } = await query(
    `INSERT INTO members (name, role, email, note) VALUES ($1, $2, $3, $4) RETURNING *`,
    [String(name).trim(), role || null, email || null, note || null]);
  res.status(201).json(rows[0]);
}));

app.put('/api/members/:id', wrap(async (req, res) => {
  const cur = (await query('SELECT * FROM members WHERE id = $1', [req.params.id])).rows[0];
  if (!cur) return fail(res, 404, 'member not found');
  const b = req.body || {};
  const { rows } = await query(`
    UPDATE members SET name = $1, role = $2, email = $3, note = $4, active = $5, updated_at = now()
    WHERE id = $6 RETURNING *`,
    [
      b.name != null ? String(b.name).trim() : cur.name,
      b.role !== undefined ? b.role : cur.role,
      b.email !== undefined ? b.email : cur.email,
      b.note !== undefined ? b.note : cur.note,
      b.active !== undefined ? (b.active ? 1 : 0) : cur.active,
      req.params.id,
    ]);
  res.json(rows[0]);
}));

app.delete('/api/members/:id', wrap(async (req, res) => {
  const r = await query('DELETE FROM members WHERE id = $1', [req.params.id]);
  if (r.rowCount === 0) return fail(res, 404, 'member not found');
  res.json({ ok: true });
}));

// =========================================================================
//  Tasks  (ミッション / アサイン業務)
// =========================================================================
app.get('/api/tasks', wrap(async (req, res) => {
  const { status, member_id, priority } = req.query;
  const where = [];
  const params = [];
  if (status) { params.push(status); where.push(`t.status = $${params.length}`); }
  if (priority) { params.push(priority); where.push(`t.priority = $${params.length}`); }
  if (member_id) { params.push(member_id); where.push(`t.member_id = $${params.length}`); }
  const { rows } = await query(`
    SELECT t.*, m.name AS member_name
    FROM tasks t LEFT JOIN members m ON m.id = t.member_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY (t.status = 'done'), (t.due_date IS NULL), t.due_date,
      CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
  `, params);
  res.json(rows);
}));

app.post('/api/tasks', wrap(async (req, res) => {
  const { title, description, member_id, status, priority, progress, due_date } = req.body || {};
  if (!title || !String(title).trim()) return fail(res, 400, 'title is required');
  if (status && !TASK_STATUS.includes(status)) return fail(res, 400, 'invalid status');
  if (priority && !TASK_PRIORITY.includes(priority)) return fail(res, 400, 'invalid priority');
  const { rows } = await query(`
    INSERT INTO tasks (title, description, member_id, status, priority, progress, due_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      String(title).trim(), description || null, member_id || null,
      status || 'todo', priority || 'medium', clampProgress(progress), due_date || null,
    ]);
  res.status(201).json(rows[0]);
}));

app.put('/api/tasks/:id', wrap(async (req, res) => {
  const t = (await query('SELECT * FROM tasks WHERE id = $1', [req.params.id])).rows[0];
  if (!t) return fail(res, 404, 'task not found');
  const b = req.body || {};
  if (b.status && !TASK_STATUS.includes(b.status)) return fail(res, 400, 'invalid status');
  if (b.priority && !TASK_PRIORITY.includes(b.priority)) return fail(res, 400, 'invalid priority');

  // 完了にしたら進捗を100へ（明示指定が無い場合のみ）
  let progress = b.progress !== undefined ? clampProgress(b.progress) : t.progress;
  if (b.status === 'done' && b.progress === undefined) progress = 100;

  const { rows } = await query(`
    UPDATE tasks SET title = $1, description = $2, member_id = $3, status = $4,
      priority = $5, progress = $6, due_date = $7, updated_at = now()
    WHERE id = $8 RETURNING *`,
    [
      b.title !== undefined ? String(b.title).trim() : t.title,
      b.description !== undefined ? b.description : t.description,
      b.member_id !== undefined ? (b.member_id || null) : t.member_id,
      b.status || t.status,
      b.priority || t.priority,
      progress,
      b.due_date !== undefined ? (b.due_date || null) : t.due_date,
      req.params.id,
    ]);
  res.json(rows[0]);
}));

app.delete('/api/tasks/:id', wrap(async (req, res) => {
  const r = await query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
  if (r.rowCount === 0) return fail(res, 404, 'task not found');
  res.json({ ok: true });
}));

// =========================================================================
//  Records  (1on1 / 評価 / メモ)
// =========================================================================
app.get('/api/records', wrap(async (req, res) => {
  const { member_id, type } = req.query;
  const where = [];
  const params = [];
  if (member_id) { params.push(member_id); where.push(`r.member_id = $${params.length}`); }
  if (type) { params.push(type); where.push(`r.type = $${params.length}`); }
  const { rows } = await query(`
    SELECT r.*, m.name AS member_name
    FROM records r JOIN members m ON m.id = r.member_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY r.date DESC, r.id DESC
  `, params);
  res.json(rows);
}));

app.post('/api/records', wrap(async (req, res) => {
  const { member_id, type, date, rating, summary, next_action } = req.body || {};
  if (!member_id) return fail(res, 400, 'member_id is required');
  if (type && !RECORD_TYPE.includes(type)) return fail(res, 400, 'invalid type');
  const exists = (await query('SELECT id FROM members WHERE id = $1', [member_id])).rows[0];
  if (!exists) return fail(res, 400, 'member not found');
  const { rows } = await query(`
    INSERT INTO records (member_id, type, date, rating, summary, next_action)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      member_id, type || '1on1',
      date || new Date().toISOString().slice(0, 10),
      rating != null && rating !== '' ? Number(rating) : null,
      summary || null, next_action || null,
    ]);
  res.status(201).json(rows[0]);
}));

app.delete('/api/records/:id', wrap(async (req, res) => {
  const r = await query('DELETE FROM records WHERE id = $1', [req.params.id]);
  if (r.rowCount === 0) return fail(res, 404, 'record not found');
  res.json({ ok: true });
}));

// =========================================================================
//  Dashboard  (進捗ダッシュボード)
// =========================================================================
app.get('/api/dashboard', wrap(async (req, res) => {
  const statusCounts = (await query(
    `SELECT status, COUNT(*)::int AS count FROM tasks GROUP BY status`)).rows;
  const byMember = (await query(`
    SELECT m.id, m.name,
      COUNT(t.id)::int AS total,
      COALESCE(SUM(CASE WHEN t.status <> 'done' THEN 1 ELSE 0 END), 0)::int AS open,
      COALESCE(SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END), 0)::int AS done,
      COALESCE(ROUND(AVG(CASE WHEN t.status <> 'done' THEN t.progress END)), 0)::int AS avg_progress
    FROM members m
    LEFT JOIN tasks t ON t.member_id = m.id
    WHERE m.active = 1
    GROUP BY m.id, m.name
    ORDER BY open DESC, lower(m.name)
  `)).rows;
  const totals = (await query(`
    SELECT COUNT(*)::int AS total,
      COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0)::int AS done,
      COALESCE(SUM(CASE WHEN status <> 'done' THEN 1 ELSE 0 END), 0)::int AS open
    FROM tasks
  `)).rows[0];
  res.json({ totals, statusCounts, byMember });
}));

// =========================================================================
//  Reminders  (通知 / リマインド)
// =========================================================================
app.get('/api/reminders', wrap(async (req, res) => {
  const days = Number(req.query.days || 3);
  const overdue = (await query(`
    SELECT t.*, m.name AS member_name FROM tasks t LEFT JOIN members m ON m.id = t.member_id
    WHERE t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE
    ORDER BY t.due_date`)).rows;
  const dueSoon = (await query(`
    SELECT t.*, m.name AS member_name FROM tasks t LEFT JOIN members m ON m.id = t.member_id
    WHERE t.status <> 'done' AND t.due_date IS NOT NULL
      AND t.due_date >= CURRENT_DATE AND t.due_date <= CURRENT_DATE + $1::int
    ORDER BY t.due_date`, [days])).rows;
  const blocked = (await query(`
    SELECT t.*, m.name AS member_name FROM tasks t LEFT JOIN members m ON m.id = t.member_id
    WHERE t.status = 'blocked' ORDER BY t.priority`)).rows;
  const unassigned = (await query(`
    SELECT t.* FROM tasks t WHERE t.member_id IS NULL AND t.status <> 'done' ORDER BY t.due_date`)).rows;
  res.json({
    overdue, dueSoon, blocked, unassigned,
    count: overdue.length + dueSoon.length + blocked.length + unassigned.length,
  });
}));

// =========================================================================
//  Seed  (空のときだけサンプルデータ投入。スマホからの初回お試し用)
// =========================================================================
app.post('/api/seed', wrap(async (req, res) => {
  const { seedSampleData } = require('./seed-data');
  const count = (await query('SELECT COUNT(*)::int AS c FROM members')).rows[0].c;
  if (count > 0) return fail(res, 400, '既にデータがあります');
  await seedSampleData(query);
  res.json({ ok: true });
}));

module.exports = app;
