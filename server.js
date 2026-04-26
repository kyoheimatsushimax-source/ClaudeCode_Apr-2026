const express = require('express');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── ヘルパー ──────────────────────────────────────────────────────────────

function getSettings() {
  const rows = db.prepare('SELECT * FROM work_settings').all();
  const raw = {};
  rows.forEach(r => (raw[r.key] = r.value));
  return {
    daily_hours: parseFloat(raw.daily_hours ?? 8),
    overtime_monthly_limit: parseFloat(raw.overtime_monthly_limit ?? 45),
    break_minutes: parseInt(raw.break_minutes ?? 60),
    work_start_time: raw.work_start_time ?? '09:00'
  };
}

// 指定月の月〜金の日数を集計
function countWorkingDays(year, month, fromDay, toDay) {
  let count = 0;
  for (let d = fromDay; d <= toDay; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

// HH:MM 形式の時刻に指定分を加算して HH:MM を返す（翌日を超えても表示）
function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const rh = Math.floor(total / 60);
  const rm = total % 60;
  return `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
}

// "YYYY-MM-DD HH:MM:SS" または "YYYY-MM-DDTHH:MM:SS" を Date に変換
function parseDate(s) {
  return new Date(s.includes('T') ? s : s.replace(' ', 'T'));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// ─── 従業員 API ────────────────────────────────────────────────────────────

app.get('/api/employees', (req, res) => {
  res.json(db.prepare('SELECT * FROM employees ORDER BY employee_id').all());
});

app.post('/api/employees', (req, res) => {
  const { employee_id, name, department } = req.body;
  if (!employee_id || !name) {
    return res.status(400).json({ error: '社員IDと氏名は必須です' });
  }
  try {
    const result = db
      .prepare('INSERT INTO employees (employee_id, name, department) VALUES (?, ?, ?)')
      .run(employee_id, name, department || '');
    res.json({ id: result.lastInsertRowid, employee_id, name, department });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'この社員IDはすでに登録されています' });
    } else {
      res.status(500).json({ error: 'サーバーエラーが発生しました' });
    }
  }
});

app.delete('/api/employees/:employeeId', (req, res) => {
  const { employeeId } = req.params;
  db.prepare('DELETE FROM attendance WHERE employee_id = ?').run(employeeId);
  const result = db.prepare('DELETE FROM employees WHERE employee_id = ?').run(employeeId);
  if (result.changes === 0) return res.status(404).json({ error: '従業員が見つかりません' });
  res.json({ message: '削除しました' });
});

// ─── 勤怠打刻 API ──────────────────────────────────────────────────────────

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

  db.prepare(`
    INSERT INTO attendance (employee_id, date, clock_in) VALUES (?, ?, ?)
    ON CONFLICT(employee_id, date) DO UPDATE SET clock_in = excluded.clock_in
  `).run(employee_id, date, datetime);
  res.json({ message: '出勤を記録しました', time: datetime });
});

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

  db.prepare('UPDATE attendance SET clock_out = ? WHERE employee_id = ? AND date = ?').run(
    datetime, employee_id, date
  );
  res.json({ message: '退勤を記録しました', time: datetime });
});

// ─── 勤怠参照 API ──────────────────────────────────────────────────────────

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

app.get('/api/attendance/history', (req, res) => {
  const { employee_id, start_date, end_date } = req.query;
  let query = `
    SELECT a.*, e.name, e.department
    FROM attendance a
    JOIN employees e ON a.employee_id = e.employee_id
    WHERE 1=1
  `;
  const params = [];
  if (employee_id) { query += ' AND a.employee_id = ?'; params.push(employee_id); }
  if (start_date)  { query += ' AND a.date >= ?'; params.push(start_date); }
  if (end_date)    { query += ' AND a.date <= ?'; params.push(end_date); }
  query += ' ORDER BY a.date DESC, a.employee_id';
  res.json(db.prepare(query).all(...params));
});

app.get('/api/attendance/monthly-summary', (req, res) => {
  const { year, month } = req.query;
  const y = year || new Date().getFullYear();
  const m = String(month || new Date().getMonth() + 1).padStart(2, '0');
  const records = db.prepare(`
    SELECT
      e.employee_id, e.name, e.department,
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
  `).all(`${y}-${m}-01`, `${y}-${m}-31`);
  res.json({ year: y, month: m, records });
});

// ─── 設定 API ──────────────────────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
  res.json(getSettings());
});

app.put('/api/settings', (req, res) => {
  const allowed = ['daily_hours', 'overtime_monthly_limit', 'break_minutes', 'work_start_time'];
  const upsert = db.prepare('INSERT OR REPLACE INTO work_settings (key, value) VALUES (?, ?)');
  const updateAll = db.transaction(data => {
    allowed.forEach(key => {
      if (data[key] !== undefined) upsert.run(key, String(data[key]));
    });
  });
  updateAll(req.body);
  res.json(getSettings());
});

// ─── 勤務監視 API ──────────────────────────────────────────────────────────
// GET /api/monitoring/:employeeId?year=YYYY&month=M
// 指定月の法定労働・法定外労働の進捗と必要帰宅時間を返す

app.get('/api/monitoring/:employeeId', (req, res) => {
  const { employeeId } = req.params;
  const now = new Date();
  const year  = parseInt(req.query.year  || now.getFullYear());
  const month = parseInt(req.query.month || now.getMonth() + 1);

  const employee = db.prepare('SELECT * FROM employees WHERE employee_id = ?').get(employeeId);
  if (!employee) return res.status(404).json({ error: '従業員が見つかりません' });

  const s = getSettings();
  const lastDay = new Date(year, month, 0).getDate();
  const workingDaysInMonth = countWorkingDays(year, month, 1, lastDay);

  // 法定労働時間 = 所定労働時間(日) × 月の稼働日数
  const statutoryHours = workingDaysInMonth * s.daily_hours;

  // 当月の勤怠レコード取得
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const records = db
    .prepare('SELECT * FROM attendance WHERE employee_id = ? AND date LIKE ? ORDER BY date')
    .all(employeeId, `${monthStr}%`);

  let workedHours = 0;  // 実労働時間合計（休憩除く）
  let overtimeHours = 0; // 法定外労働時間
  let totalClockInMin = 0;
  let clockInCount = 0;
  const todayStr = now.toISOString().slice(0, 10);
  let todayRecord = null;

  records.forEach(r => {
    if (r.date === todayStr) todayRecord = r;

    if (r.clock_in && r.clock_out) {
      const diffH = (parseDate(r.clock_out) - parseDate(r.clock_in)) / 3600000;
      const actual = Math.max(0, diffH - s.break_minutes / 60);
      workedHours += actual;
      if (actual > s.daily_hours) overtimeHours += actual - s.daily_hours;
    }

    if (r.clock_in) {
      const t = r.clock_in.slice(11, 16); // "HH:MM"
      const [h, m] = t.split(':').map(Number);
      totalClockInMin += h * 60 + m;
      clockInCount++;
    }
  });

  // 平均出勤時刻（実績がなければ設定値を使用）
  let avgClockIn = s.work_start_time;
  if (clockInCount > 0) {
    const avg = Math.round(totalClockInMin / clockInCount);
    avgClockIn = `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`;
  }

  // 今日出勤中（打刻済・退勤未済）かどうか
  const todayDow = new Date(year, month - 1, now.getDate()).getDay();
  const todayIsWeekday = todayDow !== 0 && todayDow !== 6;
  const workingNow =
    todayIsWeekday &&
    todayRecord &&
    todayRecord.clock_in &&
    !todayRecord.clock_out &&
    now.getFullYear() === year &&
    now.getMonth() + 1 === month;

  // 残勤務日数：今日出勤中なら今日を含む、それ以外は明日から月末
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
  let remainingDays = 0;
  if (isCurrentMonth) {
    const fromDay = workingNow ? now.getDate() : now.getDate() + 1;
    remainingDays = countWorkingDays(year, month, fromDay, lastDay);
  }

  // 残り所定労働時間
  const remainingStatutory = Math.max(0, statutoryHours - workedHours);

  // 法定外労働時間の上限まで残り
  const overtimeRemaining = Math.max(0, s.overtime_monthly_limit - overtimeHours);

  // 月の上限総労働時間（所定 + 法定外上限）まで残り
  const totalAllowed = statutoryHours + s.overtime_monthly_limit;
  const remainingAllowed = Math.max(0, totalAllowed - workedHours);

  // 残勤務日数で割った1日あたりの必要勤務時間
  const requiredDailyH = remainingDays > 0 ? remainingStatutory / remainingDays : 0;
  const maxDailyH      = remainingDays > 0 ? remainingAllowed  / remainingDays : 0;

  // 帰宅時間の基準：今日出勤中は今日の実際の出勤時刻、それ以外は平均
  const baseClockIn = (workingNow && todayRecord.clock_in)
    ? todayRecord.clock_in.slice(11, 16)
    : avgClockIn;

  // 目標帰宅時間：所定労働時間を消化するために必要な帰宅時刻
  const targetDeparture = addMinutes(baseClockIn, Math.round(requiredDailyH * 60) + s.break_minutes);

  // 上限帰宅時間：法定外上限内で働ける最大の帰宅時刻
  const limitDeparture  = addMinutes(baseClockIn, Math.round(maxDailyH * 60) + s.break_minutes);

  res.json({
    employee,
    year,
    month,
    settings: s,
    stats: {
      // 法定労働時間
      working_days_in_month:   workingDaysInMonth,
      statutory_hours:         round1(statutoryHours),
      worked_hours:            round1(workedHours),
      worked_ratio:            round1((workedHours / statutoryHours) * 100),

      // 法定外労働
      overtime_hours:          round1(overtimeHours),
      overtime_limit:          s.overtime_monthly_limit,
      overtime_remaining:      round1(overtimeRemaining),
      overtime_ratio:          round1((overtimeHours / s.overtime_monthly_limit) * 100),
      overtime_exceeded:       overtimeHours > s.overtime_monthly_limit,

      // 残り状況
      remaining_working_days:   remainingDays,
      remaining_statutory_hours: round1(remainingStatutory),
      remaining_allowed_hours:  round1(remainingAllowed),

      // 1日あたりの必要勤務時間
      required_daily_hours:    round1(requiredDailyH),
      max_daily_hours:         round1(maxDailyH),

      // 帰宅時間
      avg_clock_in:    avgClockIn,
      base_clock_in:   baseClockIn,
      target_departure: targetDeparture,
      limit_departure:  limitDeparture,
      working_now:      workingNow || false
    }
  });
});

app.listen(PORT, () => {
  console.log(`勤怠管理サーバー起動中: http://localhost:${PORT}`);
});
