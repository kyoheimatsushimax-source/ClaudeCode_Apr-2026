const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'attendance.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    department TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL,
    date TEXT NOT NULL,
    clock_in DATETIME,
    clock_out DATETIME,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
    UNIQUE(employee_id, date)
  );
`);

const seedEmployees = db.prepare('SELECT COUNT(*) as count FROM employees').get();
if (seedEmployees.count === 0) {
  const insert = db.prepare(
    'INSERT INTO employees (employee_id, name, department) VALUES (?, ?, ?)'
  );
  insert.run('E001', '山田 太郎', '開発部');
  insert.run('E002', '佐藤 花子', '営業部');
  insert.run('E003', '鈴木 一郎', '総務部');
}

module.exports = db;
