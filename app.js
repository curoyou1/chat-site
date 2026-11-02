const appState = {
  user: null,
  messages: [],
  onlineUsers: [],
  replyTo: null,
  mode: 'login',
  isMuted: false,
  mutedUntil: 0
};

const ADMIN_PASSWORDS = ['92729', '284847', '9484948', '639473', '903830'];
const PRIVILEGED_ADMIN_USERS = {
  nsiJiski: 'nsiJiski',
  HyUUkj: 'HyUUkj',
  UKina: 'UKina',
  Msamu: 'Msamu'
};

const els = {};

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name, value) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

function clearCookie(name) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

function showScreen(name) {
  appState.mode = name;
  const screens = ['loginScreen', 'registerScreen', 'appShell'];
  screens.forEach((key) => {
    const el = document.getElementById(key);
    if (el) {
      el.classList.toggle('hidden', key !== name);
    }
  });
  document.getElementById('logoutButton')?.classList.toggle('hidden', name !== 'appShell');
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

function renderHeader() {
  const user = appState.user;
  const header = document.getElementById('headerUser');
  if (!header) return;

  if (!user) {
    header.textContent = '';
    return;
  }

  const roleText = user.role === 'privileged_admin' ? '特権管理者' : user.role === 'admin' ? '管理者' : '一般ユーザー';
  header.textContent = `${user.username} (${roleText})`;
}

function renderOnlineList() {
  const list = document.getElementById('onlineList');
  const count = document.getElementById('onlineCount');
  if (!list || !count) return;

  count.textContent = String(appState.onlineUsers.length);
  list.innerHTML = '';

  appState.onlineUsers.forEach((entry) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'online-user';
    button.innerHTML = `
      <span class="online-user-name">${escapeHtml(entry.username)}</span>
      <span class="online-dot"></span>
    `;
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

  list.innerHTML = (appState.messages || []).map((message) => {
    const isSystem = message.type === 'system';
    const isSelf = appState.user && message.sender === appState.user.username;

    const mediaMarkup = message.mediaType === 'image'
      ? `<img src="${escapeHtml(message.mediaData || '')}" alt="image" />`
      : message.mediaType === 'video'
        ? `<video controls src="${escapeHtml(message.mediaData || '')}"></video>`
        : '';

    const replyMarkup = message.replyTo
      ? `<div class="reply-badge">返信: ${escapeHtml(message.replyTo.sender || '')}</div>`
      : '';

    const content = message.replyTo ? `<div class="reply-badge">${escapeHtml(message.replyTo.sender || '')}: ${escapeHtml(message.replyTo.text || '')}</div>` : '';

    const actionButtons = !isSystem ? `
      <div class="message-actions">
        <button data-action="reply" data-id="${message.id}" type="button">返信</button>
        ${isSelf || appState.user?.role === 'admin' || appState.user?.role === 'privileged_admin' ? `<button data-action="edit" data-id="${message.id}" type="button">編集</button>` : ''}
        ${isSelf || appState.user?.role === 'admin' || appState.user?.role === 'privileged_admin' ? `<button data-action="delete" data-id="${message.id}" type="button">削除</button>` : ''}
      </div>
    ` : '';

    return `
      <article class="message ${isSystem ? 'system' : isSelf ? 'self' : ''}">
        <div class="message-header">
          <span class="message-author">${escapeHtml(message.sender)}</span>
          <span>${new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        ${replyMarkup}
        <div class="message-content">
          ${content}
          ${escapeHtml(message.text || '')}
          ${mediaMarkup}
        </div>
        ${actionButtons}
      </article>
    `;
  }).join('');
}

function renderReplyPreview() {
  const box = document.getElementById('replyPreview');
  if (!box) return;

  if (!appState.replyTo) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }

  box.classList.remove('hidden');
  box.innerHTML = `<strong>返信先:</strong> ${escapeHtml(appState.replyTo.sender)} — ${escapeHtml(appState.replyTo.text || 'メディア')}`;
}

function renderAdminTools() {
  const tools = document.getElementById('adminTools');
  if (!tools) return;

  if (!appState.user || appState.user.role !== 'privileged_admin') {
    tools.classList.add('hidden');
    tools.innerHTML = '';
    return;
  }

  tools.classList.remove('hidden');
  tools.innerHTML = (appState.onlineUsers || []).filter((u) => u.username !== appState.user.username).map((u) => `
    <div class="admin-user-inline">
      <span>${escapeHtml(u.username)}</span>
      <span class="meta">IP: ${escapeHtml(u.ip || 'unknown')}</span>
      <button data-role="ipban" data-target="${escapeHtml(u.username)}" type="button">P</button>
      <button data-role="ipunban" data-target="${escapeHtml(u.username)}" type="button">PK</button>
      <button data-role="ban" data-target="${escapeHtml(u.username)}" type="button">B</button>
      <button data-role="unban" data-target="${escapeHtml(u.username)}" type="button">BK</button>
      <button data-role="mute" data-target="${escapeHtml(u.username)}" type="button">M</button>
      <button data-role="unmute" data-target="${escapeHtml(u.username)}" type="button">MK</button>
    </div>
  `).join('');
}

function render() {
  renderHeader();
  renderOnlineList();
  renderMessages();
  renderReplyPreview();
  renderAdminTools();
}

async function loadSession() {
  try {
    const data = await fetchJson('/api/me');
    if (!data.user) {
      showScreen('loginScreen');
      return;
    }

    appState.user = data.user;
    await refreshOnlineUsers();
    await refreshMessages();
    showScreen('appShell');
  } catch {
    showScreen('loginScreen');
  }
}

async function refreshOnlineUsers() {
  try {
    const data = await fetchJson('/api/users/online');
    appState.onlineUsers = data.users || [];
    render();
  } catch (error) {
    console.warn(error.message);
  }
}

async function refreshMessages() {
  try {
    const data = await fetchJson('/api/messages');
    appState.messages = data.messages || [];
    render();
  } catch (error) {
    console.warn(error.message);
  }
}

async function login() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const adminPassword = document.getElementById('adminPassword').value.trim();

  try {
    const data = await fetchJson('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, adminPassword })
    });

    appState.user = data.user;
    showScreen('appShell');
    render();
    await refreshOnlineUsers();
    await refreshMessages();
  } catch (error) {
    alert(error.message);
  }
}

async function register() {
  const username = document.getElementById('registerUsername').value.trim();
  const password = document.getElementById('registerPassword').value.trim();
  const confirm = document.getElementById('registerConfirm').value.trim();

  try {
    const data = await fetchJson('/api/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, confirm })
    });

    appState.user = data.user;
    showScreen('appShell');
    render();
    await refreshOnlineUsers();
    await refreshMessages();
  } catch (error) {
    alert(error.message);
  }
}

async function logout() {
  try {
    await fetchJson('/api/logout', { method: 'POST' });
    appState.user = null;
    appState.messages = [];
    appState.onlineUsers = [];
    clearCookie('chat_session');
    showScreen('loginScreen');
  } catch (error) {
    console.warn(error.message);
  }
}

async function sendMessage() {
  const text = els.chatInput.value.trim();
  const file = els.mediaInput.files[0];

  if (!text && !file) return;

  const payload = {
    text,
    target: 'all',
    replyTo: appState.replyTo
  };

  if (file) {
    const reader = new FileReader();
    reader.onload = async () => {
      payload.mediaType = file.type.startsWith('video/') ? 'video' : 'image';
      payload.mediaData = String(reader.result);
      await sendPayload(payload);
    };
    reader.readAsDataURL(file);
    return;
  }

  await sendPayload(payload);
}

async function sendPayload(payload) {
  try {
    await fetchJson('/api/messages', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    appState.replyTo = null;
    els.chatInput.value = '';
    els.mediaInput.value = '';
    await refreshMessages();
  } catch (error) {
    alert(error.message);
  }
}

async function handleMessageAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const { action, id } = button.dataset;
  if (action === 'reply') {
    const message = (appState.messages || []).find((item) => item.id === id);
    if (!message) return;
    appState.replyTo = { sender: message.sender, text: message.text || 'メディア' };
    renderReplyPreview();
    return;
  }

  if (action === 'delete') {
    try {
      await fetchJson(`/api/messages/${id}`, { method: 'DELETE' });
      await refreshMessages();
    } catch (error) {
      alert(error.message);
    }
    return;
  }

  if (action === 'edit') {
    const message = (appState.messages || []).find((item) => item.id === id);
    if (!message) return;
    const newText = window.prompt('新しいメッセージ', message.text || '');
    if (newText === null) return;
    try {
      await fetchJson(`/api/messages/${id}`, { method: 'PUT', body: JSON.stringify({ text: newText }) });
      await refreshMessages();
    } catch (error) {
      alert(error.message);
    }
  }
}

async function handleAdminAction(targetUsername, action) {
  if (!appState.user || appState.user.role !== 'privileged_admin') return;

  try {
    let body = { action, targetUsername };
    if (action === 'mute' || action === 'unmute') {
      body = { ...body, durationSec: action === 'mute' ? Number(prompt('ミュート秒数を入力', '60')) : 0 };
    }

    await fetchJson('/api/admin/action', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    await refreshOnlineUsers();
  } catch (error) {
    alert(error.message);
  }
}

function bindUi() {
  els.loginButton = document.getElementById('loginButton');
  els.showRegisterButton = document.getElementById('showRegisterButton');
  els.registerButton = document.getElementById('registerButton');
  els.backToLoginButton = document.getElementById('backToLoginButton');
  els.loginUsername = document.getElementById('loginUsername');
  els.loginPassword = document.getElementById('loginPassword');
  els.adminPassword = document.getElementById('adminPassword');
  els.registerUsername = document.getElementById('registerUsername');
  els.registerPassword = document.getElementById('registerPassword');
  els.registerConfirm = document.getElementById('registerConfirm');
  els.chatInput = document.getElementById('chatInput');
  els.mediaInput = document.getElementById('mediaInput');
  els.sendButton = document.getElementById('sendButton');
  els.logoutButton = document.getElementById('logoutButton');
  els.messageList = document.getElementById('messageList');
  els.adminTools = document.getElementById('adminTools');

  els.loginButton.addEventListener('click', login);
  els.showRegisterButton.addEventListener('click', () => {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('registerScreen').classList.remove('hidden');
  });
  els.registerButton.addEventListener('click', register);
  els.backToLoginButton.addEventListener('click', () => {
    document.getElementById('registerScreen').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
  });
  els.sendButton.addEventListener('click', sendMessage);
  els.logoutButton.addEventListener('click', logout);
  els.messageList.addEventListener('click', handleMessageAction);
  els.adminTools.addEventListener('click', (event) => {
    const button = event.target.closest('[data-role]');
    if (!button) return;
    handleAdminAction(button.dataset.target, button.dataset.role);
  });
  els.chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendMessage();
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  bindUi();
  await loadSession();
  render();
});
