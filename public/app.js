// 現在時刻表示
function updateClock() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('current-time').textContent =
    `${now.getFullYear()}/${pad(now.getMonth()+1)}/${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}
setInterval(updateClock, 1000);
updateClock();

// タブ切り替え
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'today') loadToday();
    if (btn.dataset.tab === 'employees') loadEmployees();
  });
});

// 従業員データ
let employees = [];

async function fetchEmployees() {
  const res = await fetch('/api/employees');
  employees = await res.json();
  return employees;
}

function populateEmployeeSelects() {
  const selects = ['stamp-employee', 'history-employee'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    const currentVal = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    employees.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.employee_id;
      opt.textContent = `${e.employee_id} - ${e.name}`;
      sel.appendChild(opt);
    });
    sel.value = currentVal;
  });
}

// 打刻
document.getElementById('btn-clock-in').addEventListener('click', () => stamp('clock-in'));
document.getElementById('btn-clock-out').addEventListener('click', () => stamp('clock-out'));

async function stamp(type) {
  const employee_id = document.getElementById('stamp-employee').value;
  const msgEl = document.getElementById('stamp-message');
  if (!employee_id) {
    showMessage(msgEl, '従業員を選択してください', 'error');
    return;
  }
  try {
    const res = await fetch(`/api/attendance/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id })
    });
    const data = await res.json();
    if (res.ok) {
      const timeStr = data.time ? `（${formatTime(data.time)}）` : '';
      showMessage(msgEl, `${data.message}${timeStr}`, 'success');
    } else {
      showMessage(msgEl, data.error, 'error');
    }
  } catch {
    showMessage(msgEl, '通信エラーが発生しました', 'error');
  }
}

// 本日の勤怠
async function loadToday() {
  const res = await fetch('/api/attendance/today');
  const records = await res.json();
  const tbody = document.getElementById('today-tbody');
  tbody.innerHTML = '';
  records.forEach(r => {
    const status = !r.clock_in ? 'absent' : !r.clock_out ? 'in' : 'out';
    const badgeClass = { absent: 'badge-absent', in: 'badge-in', out: 'badge-out' }[status];
    const badgeLabel = { absent: '未出勤', in: '勤務中', out: '退勤済' }[status];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.employee_id}</td>
      <td>${r.name}</td>
      <td>${r.department || '-'}</td>
      <td>${r.clock_in ? formatTime(r.clock_in) : '-'}</td>
      <td>${r.clock_out ? formatTime(r.clock_out) : '-'}</td>
      <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// 勤怠履歴
async function loadHistory() {
  const employeeId = document.getElementById('history-employee').value;
  const startDate = document.getElementById('history-start').value;
  const endDate = document.getElementById('history-end').value;
  const params = new URLSearchParams();
  if (employeeId) params.set('employee_id', employeeId);
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);

  const res = await fetch(`/api/attendance/history?${params}`);
  const records = await res.json();
  const tbody = document.getElementById('history-tbody');
  tbody.innerHTML = '';
  records.forEach(r => {
    const hours = calcHours(r.clock_in, r.clock_out);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.date}</td>
      <td>${r.employee_id}</td>
      <td>${r.name}</td>
      <td>${r.department || '-'}</td>
      <td>${r.clock_in ? formatTime(r.clock_in) : '-'}</td>
      <td>${r.clock_out ? formatTime(r.clock_out) : '-'}</td>
      <td>${hours !== null ? `${hours}時間` : '-'}</td>
    `;
    tbody.appendChild(tr);
  });
  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#a0aec0">データがありません</td></tr>';
  }
}

// 月次集計
async function loadMonthly() {
  const year = document.getElementById('monthly-year').value;
  const month = document.getElementById('monthly-month').value;
  const params = new URLSearchParams({ year, month });
  const res = await fetch(`/api/attendance/monthly-summary?${params}`);
  const data = await res.json();
  document.getElementById('monthly-label').textContent = `${data.year}年 ${parseInt(data.month)}月`;
  const tbody = document.getElementById('monthly-tbody');
  tbody.innerHTML = '';
  data.records.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.employee_id}</td>
      <td>${r.name}</td>
      <td>${r.department || '-'}</td>
      <td>${r.work_days}日</td>
      <td>${r.total_hours ? `${r.total_hours}時間` : '0時間'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 従業員管理
async function loadEmployees() {
  await fetchEmployees();
  populateEmployeeSelects();
  const tbody = document.getElementById('emp-tbody');
  tbody.innerHTML = '';
  employees.forEach(e => {
    const tr = document.createElement('tr');
    const created = e.created_at ? e.created_at.slice(0, 10) : '-';
    tr.innerHTML = `
      <td>${e.employee_id}</td>
      <td>${e.name}</td>
      <td>${e.department || '-'}</td>
      <td>${created}</td>
      <td><button class="btn btn-delete" onclick="deleteEmployee('${e.employee_id}', '${e.name}')">削除</button></td>
    `;
    tbody.appendChild(tr);
  });
}

async function addEmployee() {
  const id = document.getElementById('new-emp-id').value.trim();
  const name = document.getElementById('new-emp-name').value.trim();
  const dept = document.getElementById('new-emp-dept').value.trim();
  const msgEl = document.getElementById('emp-message');

  if (!id || !name) {
    showMessage(msgEl, '社員IDと氏名は必須です', 'error');
    return;
  }
  try {
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_id: id, name, department: dept })
    });
    const data = await res.json();
    if (res.ok) {
      showMessage(msgEl, `${name}さんを登録しました`, 'success');
      document.getElementById('new-emp-id').value = '';
      document.getElementById('new-emp-name').value = '';
      document.getElementById('new-emp-dept').value = '';
      await loadEmployees();
    } else {
      showMessage(msgEl, data.error, 'error');
    }
  } catch {
    showMessage(msgEl, '通信エラーが発生しました', 'error');
  }
}

async function deleteEmployee(employeeId, name) {
  if (!confirm(`${name}さんのデータを削除しますか？\n（関連する勤怠記録もすべて削除されます）`)) return;
  const msgEl = document.getElementById('emp-message');
  try {
    const res = await fetch(`/api/employees/${encodeURIComponent(employeeId)}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      showMessage(msgEl, `${name}さんを削除しました`, 'success');
      await loadEmployees();
    } else {
      showMessage(msgEl, data.error, 'error');
    }
  } catch {
    showMessage(msgEl, '通信エラーが発生しました', 'error');
  }
}

// ユーティリティ
function showMessage(el, text, type) {
  el.textContent = text;
  el.className = `message ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = 'message'; }, 5000);
}

function formatTime(dt) {
  if (!dt) return '-';
  return dt.slice(11, 16);
}

function calcHours(clockIn, clockOut) {
  if (!clockIn || !clockOut) return null;
  const ms = new Date(clockOut.replace(' ', 'T')) - new Date(clockIn.replace(' ', 'T'));
  return (ms / 3600000).toFixed(1);
}

// 初期化
(async () => {
  const now = new Date();
  document.getElementById('monthly-year').value = now.getFullYear();
  document.getElementById('monthly-month').value = now.getMonth() + 1;
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  document.getElementById('history-start').value = firstDay;
  document.getElementById('history-end').value = now.toISOString().slice(0, 10);

  await fetchEmployees();
  populateEmployeeSelects();
  await loadToday();
})();
