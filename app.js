const appState = { user: null, messages: [], onlineUsers: [], replyTo: null, mode: 'login' };
const els = {};

function showScreen(name) {
  appState.mode = name;
  ['loginScreen', 'registerScreen', 'appShell'].forEach((key) => {
    document.getElementById(key)?.classList.toggle('hidden', key !== name);
  });
  document.getElementById('logoutButton')?.classList.toggle('hidden', name !== 'appShell');
}
function escapeHtml(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
async function fetchJson(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) throw new Error(data.error || 'リクエストに失敗しました。');
  return data;
}
function roleName(role) { return role === 'privileged_admin' ? '特権管理者' : role === 'admin' ? '管理者' : '一般ユーザー'; }
function renderHeader() {
  const header = document.getElementById('headerUser');
  if (header) header.textContent = appState.user ? `${appState.user.username} (${roleName(appState.user.role)})` : '';
}
function renderOnlineList() {
  const list = document.getElementById('onlineList');
  const count = document.getElementById('onlineCount');
  if (!list || !count) return;
  const users = appState.onlineUsers || [];
  count.textContent = String(users.length);
  list.innerHTML = '';
  users.forEach((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'online-user';
    button.innerHTML = `<span class="online-user-name">${escapeHtml(entry.username)}</span><span class="online-dot" aria-label="online"></span>`;
    button.addEventListener('click', () => {
      els.chatInput.value = `prm ${entry.username} `;
      els.chatInput.focus();
    });
    list.appendChild(button);
  });
}
function renderMessages() {
  const list = document.getElementById('messageList');
  if (!list) return;
  // Hide old/system notifications even if an old server or stored history returns them.
  const visible = (appState.messages || []).filter((message) => message.type !== 'system' && message.sender !== 'System');
  list.innerHTML = visible.map((message) => {
    const isSelf = appState.user && message.sender === appState.user.username;
    const media = message.mediaType === 'image'
      ? `<img src="${escapeHtml(message.mediaData || '')}" alt="画像" />`
      : message.mediaType === 'video' ? `<video controls src="${escapeHtml(message.mediaData || '')}"></video>` : '';
    const reply = message.replyTo ? `<div class="reply-badge">${escapeHtml(message.replyTo.sender || '')}: ${escapeHtml(message.replyTo.text || '')}</div>` : '';
    const canModerate = appState.user?.role === 'admin' || appState.user?.role === 'privileged_admin';
    const showEdit = isSelf || appState.user?.role === 'privileged_admin';
    const showDelete = isSelf || canModerate;
    const actions = `<div class="message-actions">
      <button data-action="reply" data-id="${escapeHtml(message.id)}" type="button">返信</button>
      ${showEdit ? `<button data-action="edit" data-id="${escapeHtml(message.id)}" type="button">編集</button>` : ''}
      ${showDelete ? `<button data-action="delete" data-id="${escapeHtml(message.id)}" type="button">削除</button>` : ''}
    </div>`;
    return `<article class="message ${isSelf ? 'self' : ''}" data-message-id="${escapeHtml(message.id)}" tabindex="0" aria-label="${escapeHtml(message.sender)}のメッセージ。タップして操作">
      <div class="message-header"><span class="message-author">${escapeHtml(message.sender)}</span><span>${new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
      ${reply}<div class="message-content">${escapeHtml(message.text || '')}${media}</div>${actions}
    </article>`;
  }).join('');
}
function renderReplyPreview() {
  const box = document.getElementById('replyPreview');
  if (!box) return;
  if (!appState.replyTo) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  box.innerHTML = `<strong>返信先:</strong> ${escapeHtml(appState.replyTo.sender)} — ${escapeHtml(appState.replyTo.text || 'メディア')}`;
}
function renderAdminTools() {
  const tools = document.getElementById('adminTools');
  if (!tools) return;
  if (appState.user?.role !== 'privileged_admin') { tools.classList.add('hidden'); tools.innerHTML = ''; return; }
  tools.classList.remove('hidden');
  tools.innerHTML = (appState.onlineUsers || []).filter((u) => u.username !== appState.user.username).map((u) => `
    <div class="admin-user-inline"><span>${escapeHtml(u.username)}</span><span class="meta">IP: ${escapeHtml(u.ip || '非公開')}</span>
      <button data-role="ipban" data-target="${escapeHtml(u.username)}" type="button">P</button>
      <button data-role="ipunban" data-target="${escapeHtml(u.username)}" type="button">PK</button>
      <button data-role="ban" data-target="${escapeHtml(u.username)}" type="button">B</button>
      <button data-role="unban" data-target="${escapeHtml(u.username)}" type="button">BK</button>
      <button data-role="mute" data-target="${escapeHtml(u.username)}" type="button">M</button>
      <button data-role="unmute" data-target="${escapeHtml(u.username)}" type="button">MK</button>
    </div>`).join('');
}
function render() { renderHeader(); renderOnlineList(); renderMessages(); renderReplyPreview(); renderAdminTools(); }
async function refreshOnlineUsers() {
  try { const data = await fetchJson('/api/users/online'); appState.onlineUsers = data.users || []; renderOnlineList(); renderAdminTools(); }
  catch (error) { console.warn('オンライン一覧の更新に失敗:', error.message); }
}
async function refreshMessages() {
  try { const data = await fetchJson('/api/messages'); appState.messages = data.messages || []; renderMessages(); }
  catch (error) { console.warn('メッセージの更新に失敗:', error.message); }
}
async function heartbeat() {
  if (!appState.user) return;
  try {
    const data = await fetchJson('/api/presence', { method: 'POST' });
    if (data.user) appState.user = data.user;
    await refreshOnlineUsers();
  } catch (error) {
    if (error.message.includes('ログイン状態')) { appState.user = null; showScreen('loginScreen'); }
  }
}
async function loadSession() {
  try {
    const data = await fetchJson('/api/me');
    if (!data.user) { showScreen('loginScreen'); return; }
    appState.user = data.user;
    showScreen('appShell');
    await heartbeat();
    await refreshMessages();
  } catch { showScreen('loginScreen'); }
}
async function login() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const adminPassword = document.getElementById('adminPassword').value.trim();
  try {
    const data = await fetchJson('/api/login', { method: 'POST', body: JSON.stringify({ username, password, adminPassword }) });
    appState.user = data.user;
    showScreen('appShell');
    render();
    await heartbeat();
    await refreshMessages();
  } catch (error) { alert(error.message); }
}
async function register() {
  const username = document.getElementById('registerUsername').value.trim();
  const password = document.getElementById('registerPassword').value.trim();
  const confirm = document.getElementById('registerConfirm').value.trim();
  try {
    const data = await fetchJson('/api/register', { method: 'POST', body: JSON.stringify({ username, password, confirm }) });
    appState.user = data.user;
    showScreen('appShell');
    render();
    await heartbeat();
    await refreshMessages();
  } catch (error) { alert(error.message); }
}
async function logout() {
  try { await fetchJson('/api/logout', { method: 'POST' }); }
  catch (error) { console.warn(error.message); }
  appState.user = null; appState.messages = []; appState.onlineUsers = []; showScreen('loginScreen');
}
async function sendMessage() {
  const text = els.chatInput.value.trim();
  const file = els.mediaInput.files[0];
  if (!text && !file) return;
  const payload = { text, target: 'all', replyTo: appState.replyTo };
  const send = async () => {
    try {
      const result = await fetchJson('/api/messages', { method: 'POST', body: JSON.stringify(payload) });
      if (result.messages) appState.messages = result.messages;
      appState.replyTo = null; els.chatInput.value = ''; els.mediaInput.value = '';
      renderReplyPreview(); await refreshMessages();
    } catch (error) { alert(error.message); }
  };
  if (!file) return send();
  const reader = new FileReader();
  reader.onload = async () => { payload.mediaType = file.type.startsWith('video/') ? 'video' : 'image'; payload.mediaData = String(reader.result); await send(); };
  reader.readAsDataURL(file);
}
async function handleMessageAction(event) {
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const { action, id } = actionButton.dataset;
  const message = appState.messages.find((item) => item.id === id);
  if (!message) return;
  if (action === 'reply') { appState.replyTo = { sender: message.sender, text: message.text || 'メディア' }; renderReplyPreview(); els.chatInput.focus(); return; }
  if (action === 'delete') {
    try { await fetchJson(`/api/messages/${id}`, { method: 'DELETE' }); await refreshMessages(); }
    catch (error) { alert(error.message); }
    return;
  }
  if (action === 'edit') {
    const text = prompt('新しいメッセージ', message.text || '');
    if (text === null) return;
    try { await fetchJson(`/api/messages/${id}`, { method: 'PUT', body: JSON.stringify({ text }) }); await refreshMessages(); }
    catch (error) { alert(error.message); }
  }
}
async function handleAdminAction(targetUsername, action) {
  if (!appState.user) return;
  const body = { action, targetUsername };
  if (action === 'mute') { body.durationSec = Number(prompt('ミュート秒数を入力', '60')); if (!body.durationSec) return; }
  try { await fetchJson('/api/admin/action', { method: 'POST', body: JSON.stringify(body) }); await refreshOnlineUsers(); }
  catch (error) { alert(error.message); }
}
function bindUi() {
  Object.assign(els, {
    loginButton: document.getElementById('loginButton'), showRegisterButton: document.getElementById('showRegisterButton'),
    registerButton: document.getElementById('registerButton'), backToLoginButton: document.getElementById('backToLoginButton'),
    chatInput: document.getElementById('chatInput'), mediaInput: document.getElementById('mediaInput'),
    sendButton: document.getElementById('sendButton'), logoutButton: document.getElementById('logoutButton'),
    messageList: document.getElementById('messageList'), adminTools: document.getElementById('adminTools')
  });
  els.loginButton.addEventListener('click', login);
  els.showRegisterButton.addEventListener('click', () => { document.getElementById('loginScreen').classList.add('hidden'); document.getElementById('registerScreen').classList.remove('hidden'); });
  els.registerButton.addEventListener('click', register);
  els.backToLoginButton.addEventListener('click', () => { document.getElementById('registerScreen').classList.add('hidden'); document.getElementById('loginScreen').classList.remove('hidden'); });
  els.sendButton.addEventListener('click', sendMessage);
  els.logoutButton.addEventListener('click', logout);
  els.messageList.addEventListener('click', (event) => {
    const message = event.target.closest('.message');
    if (!message) return;
    if (!event.target.closest('[data-action]')) message.classList.toggle('show-actions');
    handleMessageAction(event);
  });
  els.messageList.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.message')) { event.preventDefault(); event.target.classList.toggle('show-actions'); }
  });
  els.adminTools.addEventListener('click', (event) => { const button = event.target.closest('[data-role]'); if (button) handleAdminAction(button.dataset.target, button.dataset.role); });
  els.chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); sendMessage(); }
  });
}
document.addEventListener('DOMContentLoaded', async () => {
  bindUi();
  await loadSession();
  setInterval(() => { heartbeat(); refreshMessages(); }, 15000);
});
