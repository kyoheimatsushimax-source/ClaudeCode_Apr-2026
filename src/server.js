'use strict';

const path = require('path');
const express = require('express');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---- 定数（バリデーション用） -------------------------------------------
const TASK_STATUS = ['todo', 'in_progress', 'review', 'done', 'blocked'];
const TASK_PRIORITY = ['low', 'medium', 'high', 'urgent'];
const RECORD_TYPE = ['1on1', 'evaluation', 'memo'];

// ---- ヘルパ --------------------------------------------------------------
function clampProgress(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function fail(res, code, message) {
  return res.status(code).json({ error: message });
}

// asyncに見えても基本同期(better-sqlite3)なので素直にtry/catch
function wrap(handler) {
  return (req, res) => {
    try {
      handler(req, res);
    } catch (err) {
      console.error(err);
      fail(res, 500, err.message || 'internal error');
    }
  };
}

// =========================================================================
//  Members  (部下)
// =========================================================================
app.get('/api/members', wrap((req, res) => {
  const rows = db.prepare(`
    SELECT m.*,
      (SELECT COUNT(*) FROM tasks t WHERE t.member_id = m.id AND t.status != 'done') AS open_tasks,
      (SELECT COUNT(*) FROM tasks t WHERE t.member_id = m.id) AS total_tasks
    FROM members m
    ORDER BY m.active DESC, m.name COLLATE NOCASE
  `).all();
  res.json(rows);
}));

app.get('/api/members/:id', wrap((req, res) => {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!member) return fail(res, 404, 'member not found');
  member.tasks = db.prepare('SELECT * FROM tasks WHERE member_id = ? ORDER BY due_date IS NULL, due_date').all(member.id);
  member.records = db.prepare('SELECT * FROM records WHERE member_id = ? ORDER BY date DESC, id DESC').all(member.id);
  res.json(member);
}));

app.post('/api/members', wrap((req, res) => {
  const { name, role, email, note } = req.body || {};
  if (!name || !String(name).trim()) return fail(res, 400, 'name is required');
  const info = db.prepare(
    'INSERT INTO members (name, role, email, note) VALUES (?, ?, ?, ?)'
  ).run(String(name).trim(), role || null, email || null, note || null);
  res.status(201).json(db.prepare('SELECT * FROM members WHERE id = ?').get(info.lastInsertRowid));
}));

app.put('/api/members/:id', wrap((req, res) => {
  const existing = db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, 404, 'member not found');
  const { name, role, email, note, active } = req.body || {};
  db.prepare(`
    UPDATE members
    SET name = ?, role = ?, email = ?, note = ?, active = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name != null ? String(name).trim() : existing.name,
    role !== undefined ? role : existing.role,
    email !== undefined ? email : existing.email,
    note !== undefined ? note : existing.note,
    active !== undefined ? (active ? 1 : 0) : existing.active,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM members WHERE id = ?').get(req.params.id));
}));

app.delete('/api/members/:id', wrap((req, res) => {
  const info = db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return fail(res, 404, 'member not found');
  res.json({ ok: true });
}));

// =========================================================================
//  Tasks  (ミッション / アサイン業務)
// =========================================================================
app.get('/api/tasks', wrap((req, res) => {
  const { status, member_id, priority } = req.query;
  const where = [];
  const params = {};
  if (status) { where.push('t.status = @status'); params.status = status; }
  if (priority) { where.push('t.priority = @priority'); params.priority = priority; }
  if (member_id) { where.push('t.member_id = @member_id'); params.member_id = member_id; }
  const sql = `
    SELECT t.*, m.name AS member_name
    FROM tasks t
    LEFT JOIN members m ON m.id = t.member_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.status = 'done', t.due_date IS NULL, t.due_date,
      CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
  `;
  res.json(db.prepare(sql).all(params));
}));

app.post('/api/tasks', wrap((req, res) => {
  const { title, description, member_id, status, priority, progress, due_date } = req.body || {};
  if (!title || !String(title).trim()) return fail(res, 400, 'title is required');
  if (status && !TASK_STATUS.includes(status)) return fail(res, 400, 'invalid status');
  if (priority && !TASK_PRIORITY.includes(priority)) return fail(res, 400, 'invalid priority');
  const info = db.prepare(`
    INSERT INTO tasks (title, description, member_id, status, priority, progress, due_date)
    VALUES (@title, @description, @member_id, @status, @priority, @progress, @due_date)
  `).run({
    title: String(title).trim(),
    description: description || null,
    member_id: member_id || null,
    status: status || 'todo',
    priority: priority || 'medium',
    progress: clampProgress(progress),
    due_date: due_date || null,
  });
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid));
}));

app.put('/api/tasks/:id', wrap((req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) return fail(res, 404, 'task not found');
  const b = req.body || {};
  if (b.status && !TASK_STATUS.includes(b.status)) return fail(res, 400, 'invalid status');
  if (b.priority && !TASK_PRIORITY.includes(b.priority)) return fail(res, 400, 'invalid priority');

  // statusがdoneになったら進捗を100に寄せる（明示指定が無い場合）
  let progress = b.progress !== undefined ? clampProgress(b.progress) : t.progress;
  if (b.status === 'done' && b.progress === undefined) progress = 100;

  db.prepare(`
    UPDATE tasks SET
      title = @title, description = @description, member_id = @member_id,
      status = @status, priority = @priority, progress = @progress,
      due_date = @due_date, updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id: req.params.id,
    title: b.title !== undefined ? String(b.title).trim() : t.title,
    description: b.description !== undefined ? b.description : t.description,
    member_id: b.member_id !== undefined ? (b.member_id || null) : t.member_id,
    status: b.status || t.status,
    priority: b.priority || t.priority,
    progress,
    due_date: b.due_date !== undefined ? (b.due_date || null) : t.due_date,
  });
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
}));

app.delete('/api/tasks/:id', wrap((req, res) => {
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return fail(res, 404, 'task not found');
  res.json({ ok: true });
}));

// =========================================================================
//  Records  (1on1 / 評価 / メモ)
// =========================================================================
app.get('/api/records', wrap((req, res) => {
  const { member_id, type } = req.query;
  const where = [];
  const params = {};
  if (member_id) { where.push('r.member_id = @member_id'); params.member_id = member_id; }
  if (type) { where.push('r.type = @type'); params.type = type; }
  const sql = `
    SELECT r.*, m.name AS member_name
    FROM records r
    JOIN members m ON m.id = r.member_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY r.date DESC, r.id DESC
  `;
  res.json(db.prepare(sql).all(params));
}));

app.post('/api/records', wrap((req, res) => {
  const { member_id, type, date, rating, summary, next_action } = req.body || {};
  if (!member_id) return fail(res, 400, 'member_id is required');
  if (type && !RECORD_TYPE.includes(type)) return fail(res, 400, 'invalid type');
  const member = db.prepare('SELECT id FROM members WHERE id = ?').get(member_id);
  if (!member) return fail(res, 400, 'member not found');
  const info = db.prepare(`
    INSERT INTO records (member_id, type, date, rating, summary, next_action)
    VALUES (@member_id, @type, @date, @rating, @summary, @next_action)
  `).run({
    member_id,
    type: type || '1on1',
    date: date || new Date().toISOString().slice(0, 10),
    rating: rating != null && rating !== '' ? Number(rating) : null,
    summary: summary || null,
    next_action: next_action || null,
  });
  res.status(201).json(db.prepare('SELECT * FROM records WHERE id = ?').get(info.lastInsertRowid));
}));

app.delete('/api/records/:id', wrap((req, res) => {
  const info = db.prepare('DELETE FROM records WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return fail(res, 404, 'record not found');
  res.json({ ok: true });
}));

// =========================================================================
//  Dashboard  (進捗ダッシュボード)
// =========================================================================
app.get('/api/dashboard', wrap((req, res) => {
  const statusCounts = db.prepare(`
    SELECT status, COUNT(*) AS count FROM tasks GROUP BY status
  `).all();

  const byMember = db.prepare(`
    SELECT m.id, m.name,
      COUNT(t.id) AS total,
      SUM(CASE WHEN t.status != 'done' THEN 1 ELSE 0 END) AS open,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done,
      COALESCE(ROUND(AVG(CASE WHEN t.status != 'done' THEN t.progress END)), 0) AS avg_progress
    FROM members m
    LEFT JOIN tasks t ON t.member_id = m.id
    WHERE m.active = 1
    GROUP BY m.id
    ORDER BY open DESC, m.name COLLATE NOCASE
  `).all();

  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN status != 'done' THEN 1 ELSE 0 END) AS open
    FROM tasks
  `).get();

  res.json({ totals, statusCounts, byMember });
}));

// =========================================================================
//  Reminders  (通知 / リマインド) — 期限切れ・期限間近・未アサイン
// =========================================================================
app.get('/api/reminders', wrap((req, res) => {
  const soonDays = Number(req.query.days || 3);
  const overdue = db.prepare(`
    SELECT t.*, m.name AS member_name
    FROM tasks t LEFT JOIN members m ON m.id = t.member_id
    WHERE t.status != 'done' AND t.due_date IS NOT NULL AND date(t.due_date) < date('now')
    ORDER BY t.due_date
  `).all();
  const dueSoon = db.prepare(`
    SELECT t.*, m.name AS member_name
    FROM tasks t LEFT JOIN members m ON m.id = t.member_id
    WHERE t.status != 'done' AND t.due_date IS NOT NULL
      AND date(t.due_date) >= date('now')
      AND date(t.due_date) <= date('now', '+' || @days || ' days')
    ORDER BY t.due_date
  `).all({ days: soonDays });
  const blocked = db.prepare(`
    SELECT t.*, m.name AS member_name
    FROM tasks t LEFT JOIN members m ON m.id = t.member_id
    WHERE t.status = 'blocked' ORDER BY t.priority
  `).all();
  const unassigned = db.prepare(`
    SELECT t.* FROM tasks t WHERE t.member_id IS NULL AND t.status != 'done' ORDER BY t.due_date
  `).all();
  res.json({
    overdue,
    dueSoon,
    blocked,
    unassigned,
    count: overdue.length + dueSoon.length + blocked.length + unassigned.length,
  });
}));

// SPA フォールバック
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`チームミッション管理 → http://localhost:${PORT}`);
});

module.exports = app;
