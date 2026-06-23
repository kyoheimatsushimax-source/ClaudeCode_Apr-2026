'use strict';

// =========================================================================
//  API ヘルパ
// =========================================================================
const api = {
  async get(url) { return handle(await fetch(url)); },
  async post(url, body) { return handle(await fetch(url, mk('POST', body))); },
  async put(url, body) { return handle(await fetch(url, mk('PUT', body))); },
  async del(url) { return handle(await fetch(url, { method: 'DELETE' })); },
};
function mk(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
async function handle(resp) {
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || resp.statusText);
  return data;
}

// =========================================================================
//  ラベル / ユーティリティ
// =========================================================================
const STATUS_LABEL = { todo: '未着手', in_progress: '進行中', review: 'レビュー', done: '完了', blocked: 'ブロック' };
const PRIORITY_LABEL = { low: '低', medium: '中', high: '高', urgent: '緊急' };
const TYPE_LABEL = { '1on1': '1on1', evaluation: '評価', memo: 'メモ' };
const STATUS_ORDER = ['todo', 'in_progress', 'review', 'blocked', 'done'];
const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function tag(value, label) { return `<span class="tag ${value}">${esc(label || value)}</span>`; }
function fmtDate(d) { return d ? esc(d) : '—'; }
function dueInfo(due) {
  if (!due) return { cls: '', txt: '—' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due + 'T00:00:00');
  const diff = Math.round((d - today) / 86400000);
  if (diff < 0) return { cls: 'overdue', txt: `${due}（${-diff}日超過）` };
  if (diff === 0) return { cls: 'soon', txt: `${due}（本日）` };
  if (diff <= 3) return { cls: 'soon', txt: `${due}（あと${diff}日）` };
  return { cls: '', txt: due };
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2400);
}

// =========================================================================
//  モーダル
// =========================================================================
const overlay = document.getElementById('modal-overlay');
function openModal(title, bodyEl) {
  document.getElementById('modal-title').textContent = title;
  const body = document.getElementById('modal-body');
  body.innerHTML = ''; body.appendChild(bodyEl);
  overlay.classList.remove('hidden');
}
function closeModal() { overlay.classList.add('hidden'); }
document.getElementById('modal-close').onclick = closeModal;
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

// =========================================================================
//  ルーティング (タブ)
// =========================================================================
const views = {};
let membersCache = [];

document.querySelectorAll('.tabs button').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.view));
});
function navigate(view) {
  document.querySelectorAll('.tabs button').forEach((b) =>
    b.classList.toggle('active', b.dataset.view === view));
  views[view]();
}

const app = document.getElementById('app');

// メンバー一覧は多くの画面で使うのでキャッシュ
async function loadMembers() { membersCache = await api.get('/api/members'); return membersCache; }
function memberOptions(selectedId) {
  return ['<option value="">（未アサイン）</option>']
    .concat(membersCache.map((m) =>
      `<option value="${m.id}" ${m.id == selectedId ? 'selected' : ''}>${esc(m.name)}</option>`))
    .join('');
}

// =========================================================================
//  ダッシュボード
// =========================================================================
views.dashboard = async function () {
  app.innerHTML = '<div class="muted">読み込み中…</div>';
  const [d] = await Promise.all([api.get('/api/dashboard'), loadMembers()]);
  const t = d.totals;
  const sc = Object.fromEntries(d.statusCounts.map((r) => [r.status, r.count]));
  const donePct = t.total ? Math.round((t.done / t.total) * 100) : 0;

  app.innerHTML = `
    <div class="section-head"><h2>ダッシュボード</h2></div>
    <div class="grid cards" style="margin-bottom:24px">
      <div class="card stat"><div class="big">${t.total || 0}</div><div class="label">全タスク</div></div>
      <div class="card stat"><div class="big">${t.open || 0}</div><div class="label">進行中（未完了）</div></div>
      <div class="card stat"><div class="big">${t.done || 0}</div><div class="label">完了</div></div>
      <div class="card stat">
        <div class="big">${donePct}%</div><div class="label">完了率</div>
        <div class="bar" style="margin-top:8px"><span style="width:${donePct}%"></span></div>
      </div>
    </div>

    <div class="grid" style="grid-template-columns: 1fr 1fr; align-items:start">
      <div class="card">
        <h3 style="margin-top:0">ステータス内訳</h3>
        ${STATUS_ORDER.map((s) => {
          const c = sc[s] || 0; const pct = t.total ? Math.round((c / t.total) * 100) : 0;
          return `<div class="row spread" style="margin:10px 0 4px">${tag(s, STATUS_LABEL[s])}<span class="muted">${c}件</span></div>
            <div class="bar"><span style="width:${pct}%"></span></div>`;
        }).join('')}
      </div>
      <div class="card">
        <h3 style="margin-top:0">メンバー別の負荷</h3>
        <table><thead><tr><th>メンバー</th><th>未完了</th><th>完了</th><th style="width:140px">平均進捗</th></tr></thead>
        <tbody>
        ${d.byMember.length ? d.byMember.map((m) => `
          <tr>
            <td><a class="linkish" data-member="${m.id}">${esc(m.name)}</a></td>
            <td>${m.open || 0}</td><td>${m.done || 0}</td>
            <td><div class="bar"><span style="width:${m.avg_progress || 0}%"></span></div></td>
          </tr>`).join('') : '<tr><td colspan="4" class="muted">メンバー未登録</td></tr>'}
        </tbody></table>
      </div>
    </div>`;

  app.querySelectorAll('[data-member]').forEach((a) =>
    a.addEventListener('click', () => openMemberDetail(a.dataset.member)));
};

// =========================================================================
//  タスク / ミッション
// =========================================================================
let taskFilter = { status: '', member_id: '', priority: '' };

views.tasks = async function () {
  app.innerHTML = '<div class="muted">読み込み中…</div>';
  await loadMembers();
  await renderTasks();
};

async function renderTasks() {
  const qs = new URLSearchParams(Object.entries(taskFilter).filter(([, v]) => v)).toString();
  const tasks = await api.get('/api/tasks' + (qs ? '?' + qs : ''));

  app.innerHTML = `
    <div class="section-head">
      <h2>ミッション / タスク</h2>
      <button class="btn" id="new-task">＋ 新規タスク</button>
    </div>
    <div class="row" style="margin-bottom:16px">
      <select id="f-status" class="">
        <option value="">全ステータス</option>
        ${STATUS_ORDER.map((s) => `<option value="${s}" ${taskFilter.status === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}
      </select>
      <select id="f-priority">
        <option value="">全優先度</option>
        ${PRIORITY_ORDER.map((p) => `<option value="${p}" ${taskFilter.priority === p ? 'selected' : ''}>${PRIORITY_LABEL[p]}</option>`).join('')}
      </select>
      <select id="f-member">
        <option value="">全メンバー</option>
        ${membersCache.map((m) => `<option value="${m.id}" ${taskFilter.member_id == m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
      </select>
    </div>
    <div class="card" style="padding:0">
      <table>
        <thead><tr>
          <th>タスク</th><th>担当</th><th>状態</th><th>優先度</th><th style="width:130px">進捗</th><th>期限</th><th></th>
        </tr></thead>
        <tbody>
        ${tasks.length ? tasks.map(taskRow).join('') : '<tr><td colspan="7" class="empty">タスクがありません</td></tr>'}
        </tbody>
      </table>
    </div>`;

  document.getElementById('new-task').onclick = () => taskForm();
  document.getElementById('f-status').onchange = (e) => { taskFilter.status = e.target.value; renderTasks(); };
  document.getElementById('f-priority').onchange = (e) => { taskFilter.priority = e.target.value; renderTasks(); };
  document.getElementById('f-member').onchange = (e) => { taskFilter.member_id = e.target.value; renderTasks(); };

  app.querySelectorAll('[data-edit]').forEach((b) =>
    b.onclick = () => taskForm(tasks.find((t) => t.id == b.dataset.edit)));
  app.querySelectorAll('[data-del]').forEach((b) =>
    b.onclick = () => deleteTask(b.dataset.del));
}

function taskRow(t) {
  const due = dueInfo(t.due_date);
  return `<tr>
    <td><strong>${esc(t.title)}</strong>${t.description ? `<div class="muted" style="font-size:12.5px">${esc(t.description).slice(0, 60)}</div>` : ''}</td>
    <td>${t.member_name ? esc(t.member_name) : '<span class="muted">未アサイン</span>'}</td>
    <td>${tag(t.status, STATUS_LABEL[t.status])}</td>
    <td>${tag(t.priority, PRIORITY_LABEL[t.priority])}</td>
    <td><div class="bar"><span style="width:${t.progress}%"></span></div><span class="muted" style="font-size:11px">${t.progress}%</span></td>
    <td class="due ${due.cls}">${due.txt}</td>
    <td class="row" style="gap:4px;justify-content:flex-end">
      <button class="btn ghost sm" data-edit="${t.id}">編集</button>
      <button class="btn danger sm" data-del="${t.id}">削除</button>
    </td>
  </tr>`;
}

function taskForm(task) {
  const t = task || {};
  const form = el(`<form>
    <div class="field"><label>タイトル *</label><input name="title" value="${esc(t.title || '')}" required></div>
    <div class="field"><label>詳細</label><textarea name="description">${esc(t.description || '')}</textarea></div>
    <div class="field"><label>担当メンバー</label><select name="member_id">${memberOptions(t.member_id)}</select></div>
    <div class="field inline">
      <div><label>ステータス</label><select name="status">
        ${STATUS_ORDER.map((s) => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}
      </select></div>
      <div><label>優先度</label><select name="priority">
        ${PRIORITY_ORDER.map((p) => `<option value="${p}" ${(t.priority || 'medium') === p ? 'selected' : ''}>${PRIORITY_LABEL[p]}</option>`).join('')}
      </select></div>
    </div>
    <div class="field inline">
      <div><label>進捗 (<span id="pv">${t.progress || 0}</span>%)</label>
        <input type="range" name="progress" min="0" max="100" step="5" value="${t.progress || 0}"></div>
      <div><label>期限</label><input type="date" name="due_date" value="${esc(t.due_date || '')}"></div>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn ghost" id="cancel">キャンセル</button>
      <button type="submit" class="btn">${task ? '更新' : '作成'}</button>
    </div>
  </form>`);

  form.querySelector('[name=progress]').oninput = (e) => form.querySelector('#pv').textContent = e.target.value;
  form.querySelector('#cancel').onclick = closeModal;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    fd.progress = Number(fd.progress);
    try {
      if (task) await api.put('/api/tasks/' + task.id, fd);
      else await api.post('/api/tasks', fd);
      closeModal(); toast(task ? '更新しました' : '作成しました'); renderTasks();
    } catch (err) { toast('エラー: ' + err.message); }
  };
  openModal(task ? 'タスクを編集' : '新規タスク', form);
}

async function deleteTask(id) {
  if (!confirm('このタスクを削除しますか？')) return;
  await api.del('/api/tasks/' + id); toast('削除しました'); renderTasks();
}

// =========================================================================
//  メンバー
// =========================================================================
views.members = async function () {
  app.innerHTML = '<div class="muted">読み込み中…</div>';
  const members = await loadMembers();
  app.innerHTML = `
    <div class="section-head">
      <h2>メンバー</h2>
      <button class="btn" id="new-member">＋ メンバー追加</button>
    </div>
    <div class="grid cards">
      ${members.length ? members.map(memberCard).join('') : '<div class="empty">メンバーが登録されていません</div>'}
    </div>`;
  document.getElementById('new-member').onclick = () => memberForm();
  app.querySelectorAll('[data-open]').forEach((c) =>
    c.onclick = () => openMemberDetail(c.dataset.open));
};

function memberCard(m) {
  return `<div class="card" style="cursor:pointer" data-open="${m.id}">
    <div class="row spread">
      <strong>${esc(m.name)}</strong>
      ${m.active ? '' : '<span class="tag todo">休止</span>'}
    </div>
    <div class="muted" style="font-size:13px">${esc(m.role || '役割未設定')}</div>
    <div class="row" style="margin-top:12px;gap:18px">
      <div><div class="big" style="font-size:20px">${m.open_tasks}</div><div class="label muted" style="font-size:11px">未完了</div></div>
      <div><div class="big" style="font-size:20px">${m.total_tasks}</div><div class="label muted" style="font-size:11px">全タスク</div></div>
    </div>
  </div>`;
}

function memberForm(member) {
  const m = member || {};
  const form = el(`<form>
    <div class="field"><label>氏名 *</label><input name="name" value="${esc(m.name || '')}" required></div>
    <div class="field"><label>役割 / ポジション</label><input name="role" value="${esc(m.role || '')}" placeholder="例: エンジニア"></div>
    <div class="field"><label>メール</label><input name="email" type="email" value="${esc(m.email || '')}"></div>
    <div class="field"><label>メモ</label><textarea name="note">${esc(m.note || '')}</textarea></div>
    ${member ? `<div class="field"><label><input type="checkbox" name="active" ${m.active ? 'checked' : ''}> 在籍中（アクティブ）</label></div>` : ''}
    <div class="modal-actions">
      <button type="button" class="btn ghost" id="cancel">キャンセル</button>
      <button type="submit" class="btn">${member ? '更新' : '追加'}</button>
    </div>
  </form>`);
  form.querySelector('#cancel').onclick = closeModal;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    if (member) fd.active = form.querySelector('[name=active]').checked ? 1 : 0;
    try {
      if (member) await api.put('/api/members/' + member.id, fd);
      else await api.post('/api/members', fd);
      closeModal(); toast(member ? '更新しました' : '追加しました'); navigate('members');
    } catch (err) { toast('エラー: ' + err.message); }
  };
  openModal(member ? 'メンバーを編集' : 'メンバー追加', form);
}

async function openMemberDetail(id) {
  const m = await api.get('/api/members/' + id);
  const body = el(`<div>
    <div class="row spread">
      <div>
        <div class="muted">${esc(m.role || '役割未設定')} ${m.email ? '・' + esc(m.email) : ''}</div>
      </div>
      <button class="btn ghost sm" id="edit-m">編集</button>
    </div>
    ${m.note ? `<p class="muted" style="white-space:pre-wrap">${esc(m.note)}</p>` : ''}

    <h3 style="margin:18px 0 8px;font-size:14px">担当タスク（${m.tasks.length}）</h3>
    ${m.tasks.length ? m.tasks.map((t) => {
      const due = dueInfo(t.due_date);
      return `<div class="row spread" style="padding:6px 0;border-bottom:1px solid var(--border)">
        <span>${esc(t.title)} ${tag(t.status, STATUS_LABEL[t.status])}</span>
        <span class="due ${due.cls}" style="font-size:12px">${due.txt}</span></div>`;
    }).join('') : '<div class="muted">タスクなし</div>'}

    <h3 style="margin:18px 0 8px;font-size:14px">1on1・評価履歴（${m.records.length}）</h3>
    ${m.records.length ? m.records.map((r) => `
      <div style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div class="row spread"><span>${tag(r.type, TYPE_LABEL[r.type])} <span class="muted">${esc(r.date)}</span> ${r.rating ? '★'.repeat(r.rating) : ''}</span></div>
        ${r.summary ? `<div style="font-size:13px;white-space:pre-wrap">${esc(r.summary)}</div>` : ''}
        ${r.next_action ? `<div class="muted" style="font-size:12.5px">→ ${esc(r.next_action)}</div>` : ''}
      </div>`).join('') : '<div class="muted">記録なし</div>'}

    <div class="modal-actions" style="margin-top:18px">
      <button class="btn danger" id="del-m">メンバー削除</button>
      <button class="btn" id="add-rec">＋ 1on1/評価を記録</button>
    </div>
  </div>`);
  body.querySelector('#edit-m').onclick = () => memberForm(m);
  body.querySelector('#add-rec').onclick = () => recordForm(m.id);
  body.querySelector('#del-m').onclick = async () => {
    if (!confirm(`${m.name} を削除しますか？関連する記録も削除されます。`)) return;
    await api.del('/api/members/' + m.id); closeModal(); toast('削除しました'); navigate('members');
  };
  openModal(m.name, body);
}

// =========================================================================
//  1on1 / 評価 記録
// =========================================================================
views.records = async function () {
  app.innerHTML = '<div class="muted">読み込み中…</div>';
  const [records] = await Promise.all([api.get('/api/records'), loadMembers()]);
  app.innerHTML = `
    <div class="section-head">
      <h2>1on1・評価記録</h2>
      <button class="btn" id="new-rec">＋ 記録を追加</button>
    </div>
    <div class="card" style="padding:0">
      <table>
        <thead><tr><th>日付</th><th>メンバー</th><th>種別</th><th>評価</th><th>サマリ</th><th></th></tr></thead>
        <tbody>
        ${records.length ? records.map((r) => `
          <tr>
            <td class="due">${esc(r.date)}</td>
            <td>${esc(r.member_name)}</td>
            <td>${tag(r.type, TYPE_LABEL[r.type])}</td>
            <td>${r.rating ? '★'.repeat(r.rating) : '—'}</td>
            <td>${esc((r.summary || '').slice(0, 50)) || '<span class="muted">—</span>'}
              ${r.next_action ? `<div class="muted" style="font-size:12px">→ ${esc(r.next_action.slice(0, 50))}</div>` : ''}</td>
            <td style="text-align:right"><button class="btn danger sm" data-del="${r.id}">削除</button></td>
          </tr>`).join('') : '<tr><td colspan="6" class="empty">記録がありません</td></tr>'}
        </tbody>
      </table>
    </div>`;
  document.getElementById('new-rec').onclick = () => recordForm();
  app.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('この記録を削除しますか？')) return;
    await api.del('/api/records/' + b.dataset.del); toast('削除しました'); navigate('records');
  });
};

function recordForm(memberId) {
  if (!membersCache.length) { toast('先にメンバーを登録してください'); return; }
  const form = el(`<form>
    <div class="field"><label>メンバー *</label><select name="member_id" required>
      ${membersCache.map((m) => `<option value="${m.id}" ${m.id == memberId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
    </select></div>
    <div class="field inline">
      <div><label>種別</label><select name="type">
        ${Object.entries(TYPE_LABEL).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
      </select></div>
      <div><label>日付</label><input type="date" name="date" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div><label>評価(1-5)</label><select name="rating">
        <option value="">—</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${'★'.repeat(n)}</option>`).join('')}
      </select></div>
    </div>
    <div class="field"><label>サマリ / 議事メモ</label><textarea name="summary" placeholder="話した内容、成果、課題など"></textarea></div>
    <div class="field"><label>ネクストアクション</label><input name="next_action" placeholder="次回までの宿題・約束など"></div>
    <div class="modal-actions">
      <button type="button" class="btn ghost" id="cancel">キャンセル</button>
      <button type="submit" class="btn">記録する</button>
    </div>
  </form>`);
  form.querySelector('#cancel').onclick = closeModal;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(form));
    try {
      await api.post('/api/records', fd);
      closeModal(); toast('記録しました');
      navigate(document.querySelector('.tabs button.active').dataset.view);
    } catch (err) { toast('エラー: ' + err.message); }
  };
  openModal('1on1 / 評価を記録', form);
}

// =========================================================================
//  通知 / リマインド
// =========================================================================
views.reminders = async function () {
  app.innerHTML = '<div class="muted">読み込み中…</div>';
  const r = await api.get('/api/reminders');
  const group = (title, items, color) => `
    <div class="reminder-group">
      <h3><span class="tag ${color}">${items.length}</span> ${title}</h3>
      ${items.length ? `<div class="card" style="padding:0"><table><tbody>
        ${items.map((t) => {
          const due = dueInfo(t.due_date);
          return `<tr>
            <td><strong>${esc(t.title)}</strong></td>
            <td>${t.member_name ? esc(t.member_name) : '<span class="muted">未アサイン</span>'}</td>
            <td>${tag(t.priority, PRIORITY_LABEL[t.priority])}</td>
            <td class="due ${due.cls}">${due.txt}</td>
          </tr>`;
        }).join('')}
      </tbody></table></div>` : '<div class="muted" style="padding:4px 0 8px">なし</div>'}
    </div>`;

  app.innerHTML = `
    <div class="section-head"><h2>通知 / リマインド</h2></div>
    ${r.count === 0 ? '<div class="empty">対応が必要なタスクはありません 🎉</div>' : ''}
    ${group('期限超過', r.overdue, 'overdue')}
    ${group('期限間近（3日以内）', r.dueSoon, 'high')}
    ${group('ブロック中', r.blocked, 'blocked')}
    ${group('未アサイン', r.unassigned, 'todo')}`;
};

// =========================================================================
//  通知バッジ（全画面共通）
// =========================================================================
async function refreshBadge() {
  try {
    const r = await api.get('/api/reminders');
    const badge = document.getElementById('reminder-badge');
    if (r.count > 0) { badge.textContent = r.count; badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  } catch (_) { /* ignore */ }
}

// =========================================================================
//  起動
// =========================================================================
navigate('dashboard');
refreshBadge();
setInterval(refreshBadge, 60000);
