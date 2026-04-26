const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 従業員一覧取得
app.get('/api/employees', (req, res) => {
  const employees = db.prepare('SELECT * FROM employees ORDER BY employee_id').all();
  res.json(employees);
});

// 従業員追加
app.post('/api/employees', (req, res) => {
  const { employee_id, name, department } = req.body;
  if (!employee_id || !name) {
    return res.status(400).json({ error: '社員IDと氏名は必須です' });
  }
  try {
    const stmt = db.prepare(
      'INSERT INTO employees (employee_id, name, department) VALUES (?, ?, ?)'
    );
    const result = stmt.run(employee_id, name, department || '');
    res.json({ id: result.lastInsertRowid, employee_id, name, department });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'この社員IDはすでに登録されています' });
    } else {
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  }
});

// 従業員削除
app.delete('/api/employees/:employeeId', (req, res) => {
  const { employeeId } = req.params;
  db.prepare('DELETE FROM attendance WHERE employee_id = ?').run(employeeId);
  const result = db.prepare('DELETE FROM employees WHERE employee_id = ?').run(employeeId);
  if (result.changes === 0) {
    return res.status(404).json({ error: '従業員が見つかりません' });
  }
  res.json({ message: '削除しました' });
});

// 出勤打刻
app.post('/api/attendance/clock-in', (req, res) => {
  const { employee_id } = req.body;
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const datetime = now.toISOString().slice(0, 19).replace('T', ' ');

  const existing = db
    .prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?')
    .get(employee_id, date);

  if (existing && existing.clock_in) {
    return res.status(409).json({ error: '本日はすでに出勤済みです' });
  }

  const stmt = db.prepare(`
    INSERT INTO attendance (employee_id, date, clock_in)
    VALUES (?, ?, ?)
    ON CONFLICT(employee_id, date) DO UPDATE SET clock_in = excluded.clock_in
  `);
  stmt.run(employee_id, date, datetime);
  res.json({ message: '出勤を記録しました', time: datetime });
});

// 退勤打刻
app.post('/api/attendance/clock-out', (req, res) => {
  const { employee_id } = req.body;
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const datetime = now.toISOString().slice(0, 19).replace('T', ' ');

  const existing = db
    .prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?')
    .get(employee_id, date);

  if (!existing || !existing.clock_in) {
    return res.status(400).json({ error: '出勤記録がありません。先に出勤打刻をしてください' });
  }
  if (existing.clock_out) {
    return res.status(409).json({ error: '本日はすでに退勤済みです' });
  }

  db.prepare(
    'UPDATE attendance SET clock_out = ? WHERE employee_id = ? AND date = ?'
  ).run(datetime, employee_id, date);
  res.json({ message: '退勤を記録しました', time: datetime });
});

// 本日の勤怠一覧
app.get('/api/attendance/today', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const records = db.prepare(`
    SELECT e.employee_id, e.name, e.department, a.clock_in, a.clock_out
    FROM employees e
    LEFT JOIN attendance a ON e.employee_id = a.employee_id AND a.date = ?
    ORDER BY e.employee_id
  `).all(today);
  res.json(records);
});

// 勤怠履歴（従業員別・期間別）
app.get('/api/attendance/history', (req, res) => {
  const { employee_id, start_date, end_date } = req.query;
  let query = `
    SELECT a.*, e.name, e.department
    FROM attendance a
    JOIN employees e ON a.employee_id = e.employee_id
    WHERE 1=1
  `;
  const params = [];

  if (employee_id) {
    query += ' AND a.employee_id = ?';
    params.push(employee_id);
  }
  if (start_date) {
    query += ' AND a.date >= ?';
    params.push(start_date);
  }
  if (end_date) {
    query += ' AND a.date <= ?';
    params.push(end_date);
  }
  query += ' ORDER BY a.date DESC, a.employee_id';

  const records = db.prepare(query).all(...params);
  res.json(records);
});

// 月次集計
app.get('/api/attendance/monthly-summary', (req, res) => {
  const { year, month } = req.query;
  const y = year || new Date().getFullYear();
  const m = String(month || new Date().getMonth() + 1).padStart(2, '0');
  const startDate = `${y}-${m}-01`;
  const endDate = `${y}-${m}-31`;

  const records = db.prepare(`
    SELECT
      e.employee_id,
      e.name,
      e.department,
      COUNT(a.id) as work_days,
      SUM(CASE
        WHEN a.clock_in IS NOT NULL AND a.clock_out IS NOT NULL
        THEN ROUND((julianday(a.clock_out) - julianday(a.clock_in)) * 24, 2)
        ELSE 0
      END) as total_hours
    FROM employees e
    LEFT JOIN attendance a ON e.employee_id = a.employee_id
      AND a.date BETWEEN ? AND ?
      AND a.clock_in IS NOT NULL
    GROUP BY e.employee_id
    ORDER BY e.employee_id
  `).all(startDate, endDate);

  res.json({ year: y, month: m, records });
});

app.listen(PORT, () => {
  console.log(`勤怠管理サーバー起動中: http://localhost:${PORT}`);
});
