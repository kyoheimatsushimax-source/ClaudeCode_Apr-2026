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
    if (btn.dataset.tab === 'settings') loadSettings();
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
  const selects = ['stamp-employee', 'history-employee', 'mon-employee'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
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

// ─── 打刻 ────────────────────────────────────────────────────────────────

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

// ─── 本日の勤怠 ───────────────────────────────────────────────────────────

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

// ─── 勤務監視 ────────────────────────────────────────────────────────────

async function loadMonitoring() {
  const employeeId = document.getElementById('mon-employee').value;
  const year  = document.getElementById('mon-year').value;
  const month = document.getElementById('mon-month').value;

  if (!employeeId) {
    alert('従業員を選択してください');
    return;
  }

  const res = await fetch(
    `/api/monitoring/${encodeURIComponent(employeeId)}?year=${year}&month=${month}`
  );
  if (!res.ok) {
    alert('データの取得に失敗しました');
    return;
  }
  const data = await res.json();
  renderMonitoring(data);
}

function renderMonitoring(data) {
  const { stats, settings, year, month } = data;

  document.getElementById('mon-empty').style.display = 'none';
  document.getElementById('mon-content').style.display = 'block';

  // ── アラートバナー
  const alertEl = document.getElementById('mon-alert');
  if (stats.overtime_exceeded) {
    alertEl.className = 'mon-alert danger';
    alertEl.textContent = `⚠ 法定外労働時間の上限（${settings.overtime_monthly_limit}時間）を ${stats.overtime_hours}時間で超過しています`;
    alertEl.style.display = 'block';
  } else if (stats.overtime_ratio >= 80) {
    alertEl.className = 'mon-alert warning';
    alertEl.textContent = `⚠ 法定外労働時間の上限まで残り ${stats.overtime_remaining}時間です（${stats.overtime_ratio}% 消化）`;
    alertEl.style.display = 'block';
  } else {
    alertEl.style.display = 'none';
  }

  // ── 法定労働時間カード
  const workedRatio = Math.min(100, stats.worked_ratio);
  document.getElementById('mon-statutory-sub').textContent =
    `${stats.worked_hours}時間 / ${stats.statutory_hours}時間`;
  const statBar = document.getElementById('mon-statutory-bar');
  statBar.style.width = `${workedRatio}%`;
  statBar.className = `progress-bar ${workedRatio >= 100 ? 'bar-green' : 'bar-blue'}`;
  document.getElementById('mon-statutory-detail').innerHTML =
    `達成率 ${stats.worked_ratio}%　／　稼働日数 ${stats.working_days_in_month}日`;

  // ── 法定外労働時間カード
  const otRatio = Math.min(100, stats.overtime_ratio);
  document.getElementById('mon-overtime-sub').textContent =
    `${stats.overtime_hours}時間 / ${stats.overtime_limit}時間 上限`;
  const otBar = document.getElementById('mon-overtime-bar');
  otBar.style.width = `${otRatio}%`;
  otBar.className = `progress-bar ${
    stats.overtime_exceeded ? 'bar-red' : otRatio >= 80 ? 'bar-yellow' : 'bar-green'
  }`;
  document.getElementById('mon-overtime-detail').innerHTML =
    `残り ${stats.overtime_remaining}時間　／　消化率 ${stats.overtime_ratio}%`;

  // ── 残勤務日数カード
  document.getElementById('mon-remaining-days').innerHTML =
    `${stats.remaining_working_days}<span> 日</span>`;
  document.getElementById('mon-remaining-detail').innerHTML =
    `今月稼働日 ${stats.working_days_in_month}日<br>残り所定労働時間 ${stats.remaining_statutory_hours}時間`;

  // ── 帰宅時間ガイド
  const baseLabel = stats.working_now
    ? `今日の出勤時刻 ${stats.base_clock_in} 基準`
    : `平均出勤時刻 ${stats.avg_clock_in} 基準`;
  document.getElementById('mon-base-clockin').textContent = baseLabel;

  // 目標帰宅時間
  document.getElementById('mon-target-dep').textContent = stats.remaining_working_days > 0
    ? stats.target_departure
    : '─';
  document.getElementById('mon-required-daily').textContent = stats.remaining_working_days > 0
    ? `1日 ${stats.required_daily_hours}時間 必要`
    : '';

  // 上限帰宅時間
  document.getElementById('mon-limit-dep').textContent = stats.remaining_working_days > 0
    ? stats.limit_departure
    : '─';
  document.getElementById('mon-max-daily').textContent = stats.remaining_working_days > 0
    ? `最大 ${stats.max_daily_hours}時間 / 日`
    : '';
  document.getElementById('mon-ot-remaining-inline').textContent = stats.overtime_remaining;

  // 補足ノート
  const noteEl = document.getElementById('mon-guide-note');
  if (stats.remaining_working_days === 0) {
    noteEl.textContent = '今月の残勤務日数は 0 日です（月末または過去の月）';
  } else if (stats.required_daily_hours > settings.daily_hours) {
    const extraH = (stats.required_daily_hours - settings.daily_hours).toFixed(1);
    noteEl.textContent = `所定労働時間に対して 1 日 ${extraH}時間の残業が必要なペースです`;
  } else if (stats.overtime_exceeded) {
    noteEl.textContent = '法定外労働時間の上限を超えています。勤務調整が必要です';
  } else {
    noteEl.textContent = `目標帰宅時間に退社すると月末の所定労働時間を達成できます。上限帰宅時間を超えた勤務は法定外上限超過となります`;
  }
}

// ─── 勤怠履歴 ────────────────────────────────────────────────────────────

async function loadHistory() {
  const employeeId = document.getElementById('history-employee').value;
  const startDate  = document.getElementById('history-start').value;
  const endDate    = document.getElementById('history-end').value;
  const params = new URLSearchParams();
  if (employeeId) params.set('employee_id', employeeId);
  if (startDate)  params.set('start_date', startDate);
  if (endDate)    params.set('end_date', endDate);

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

// ─── 月次集計 ────────────────────────────────────────────────────────────

async function loadMonthly() {
  const year  = document.getElementById('monthly-year').value;
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

// ─── 従業員管理 ──────────────────────────────────────────────────────────

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
  const id   = document.getElementById('new-emp-id').value.trim();
  const name = document.getElementById('new-emp-name').value.trim();
  const dept = document.getElementById('new-emp-dept').value.trim();
  const msgEl = document.getElementById('emp-message');
  if (!id || !name) { showMessage(msgEl, '社員IDと氏名は必須です', 'error'); return; }
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
  } catch { showMessage(msgEl, '通信エラーが発生しました', 'error'); }
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
  } catch { showMessage(msgEl, '通信エラーが発生しました', 'error'); }
}

// ─── 設定 ────────────────────────────────────────────────────────────────

async function loadSettings() {
  const res = await fetch('/api/settings');
  const s = await res.json();
  document.getElementById('set-daily-hours').value = s.daily_hours;
  document.getElementById('set-ot-limit').value    = s.overtime_monthly_limit;
  document.getElementById('set-break').value        = s.break_minutes;
  document.getElementById('set-start-time').value   = s.work_start_time;
}

async function saveSettings() {
  const body = {
    daily_hours:            parseFloat(document.getElementById('set-daily-hours').value),
    overtime_monthly_limit: parseFloat(document.getElementById('set-ot-limit').value),
    break_minutes:          parseInt(document.getElementById('set-break').value),
    work_start_time:        document.getElementById('set-start-time').value
  };
  const msgEl = document.getElementById('settings-message');
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      showMessage(msgEl, '設定を保存しました', 'success');
    } else {
      showMessage(msgEl, '保存に失敗しました', 'error');
    }
  } catch { showMessage(msgEl, '通信エラーが発生しました', 'error'); }
}

// ─── ユーティリティ ──────────────────────────────────────────────────────

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

// ─── 初期化 ──────────────────────────────────────────────────────────────

(async () => {
  const now = new Date();
  document.getElementById('monthly-year').value = now.getFullYear();
  document.getElementById('monthly-month').value = now.getMonth() + 1;
  document.getElementById('mon-year').value  = now.getFullYear();
  document.getElementById('mon-month').value = now.getMonth() + 1;

  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  document.getElementById('history-start').value = firstDay;
  document.getElementById('history-end').value   = now.toISOString().slice(0, 10);

  await fetchEmployees();
  populateEmployeeSelects();
  await loadToday();
})();
