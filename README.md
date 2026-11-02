const STORAGE_KEY = 'darkChatStateV1';
const ADMIN_PASSWORDS = ['92729', '284847', '9484948', '639473', '903830'];
const PRIVILEGED_ADMIN_PASSWORDS = {
  nsiJiski: 'nsiJiski',
  HyUUkj: 'HyUUkj',
  UKina: 'UKina',
  Msamu: 'Msamu'
};

const app = {
  state: loadState(),
  ui: {}
};

function defaultState() {
  return {
    users: [],
    messages: [
      {
        id: crypto.randomUUID(),
        sender: 'System',
        type: 'system',
        text: 'チャットにようこそ。ログインして会話を始めましょう。',
        createdAt: Date.now()
      }
    ],
    onlineUsers: [],
    currentUser: null,
    replyTo: null,
    privateTarget: null,
    muteMap: {}
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = defaultState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    return {
      ...defaultState(),
      ...parsed,
      users: parsed.users || [],
      messages: parsed.messages || [],
      onlineUsers: parsed.onlineUsers || [],
      muteMap: parsed.muteMap || {}
    };
  } catch (error) {
    console.error('Failed to load state', error);
    const initial = defaultState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app.state));
}

function sanitizeText(value) {
  return String(value || '').trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getClientIpKey() {
  const key = 'chatSiteClientIp';
  let value = localStorage.getItem(key);
  if (!value) {
    value = `browser-ip-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, value);
  }
  return value;
}

function buildUniqueUsername(baseName) {
  const cleaned = sanitizeText(baseName).replace(/#\d+$/, '');
  if (!cleaned) return 'Guest';

  const count = app.state.users.filter((user) => user.username.startsWith(cleaned + '#')).length;
  const suffix = count === 0 ? 1 : count + 1;
  return `${cleaned}#${suffix}`;
}

function findUser(name) {
  if (!name) return null;
  return app.state.users.find((user) => user.username.toLowerCase() === String(name).toLowerCase()) || null;
}

function getCurrentUser() {
  return app.state.currentUser;
}

function isAdmin(user) {
  return user && (user.role === 'admin' || user.role === 'privileged_admin');
}

function isPrivilegedAdmin(user) {
  return user && user.role === 'privileged_admin';
}

function setCurrentUser(user) {
  app.state.currentUser = user;
  if (user) {
    const existing = app.state.onlineUsers.find((entry) => entry.username === user.username && entry.role === user.role);
    if (!existing) app.state.onlineUsers.push({ username: user.username, role: user.role, ip: user.ip || getClientIpKey() });
    if (user.persisted) {
      const stored = findUser(user.username);
      if (stored) stored.online = true;
    }
    addSystemMessage(`${user.username} が入室しました。`);
  }
  persistState();
  render();
}

function addSystemMessage(text) {
  app.state.messages.push({
    id: crypto.randomUUID(),
    sender: 'System',
    type: 'system',
    text,
    createdAt: Date.now()
  });
  persistState();
}

function registerUser() {
  const username = sanitizeText(app.ui.registerUsername.value);
  const password = sanitizeText(app.ui.registerPassword.value);
  const confirm = sanitizeText(app.ui.registerConfirm.value);

  if (!username || !password || !confirm) {
    alert('ユーザー名とパスワードを入力してください。');
    return;
  }

  if (password !== confirm) {
    alert('パスワードが確認と一致しません。');
    return;
  }

  if (password.length < 4) {
    alert('パスワードは4文字以上にしてください。');
    return;
  }

  const ip = getClientIpKey();
  const sameIpCount = app.state.users.filter((user) => user.ip === ip).length;
  if (sameIpCount >= 3) {
    alert('同じIPアドレスでは3つまでアカウントを作成できます。');
    return;
  }

  const uniqueName = buildUniqueUsername(username);
  const user = {
    id: crypto.randomUUID(),
    username: uniqueName,
    password,
    ip,
    online: false,
    role: 'user',
    persisted: true
  };

  app.state.users.push(user);
  persistState();
  alert(`アカウントを作成しました。ログインしてください���\nユーザー名: ${uniqueName}`);
  showLoginScreen();
}

function loginUser() {
  const username = sanitizeText(app.ui.loginUsername.value);
  const password = sanitizeText(app.ui.loginPassword.value);
  const adminPassword = sanitizeText(app.ui.adminPassword.value);

  const privilegedMatch = Object.entries(PRIVILEGED_ADMIN_PASSWORDS).find(([name, pass]) => {
    return name === username && pass === password;
  });

  if (privilegedMatch) {
    const [name, pass] = privilegedMatch;
    const adminUser = {
      id: crypto.randomUUID(),
      username: name,
      password: pass,
      role: 'privileged_admin',
      ip: getClientIpKey(),
      persisted: false
    };
    app.state.currentUser = adminUser;
    app.state.onlineUsers = [...new Map([...app.state.onlineUsers, [adminUser.username, adminUser]].map((item) => [item[0], item[1]])).values()];
    addSystemMessage(`${adminUser.username} が特権管理者としてログインしました。`);
    persistState();
    render();
    return;
  }

  if (adminPassword) {
    if (ADMIN_PASSWORDS.includes(adminPassword)) {
      const adminUser = {
        id: crypto.randomUUID(),
        username,
        password: '',
        role: adminPassword === '92729' || adminPassword === '284847' || adminPassword === '9484948' || adminPassword === '639473' || adminPassword === '903830' ? 'admin' : 'privileged_admin',
        ip: getClientIpKey(),
        persisted: false
      };
      app.state.currentUser = adminUser;
      app.state.onlineUsers = app.state.onlineUsers.filter((user) => user.username !== adminUser.username);
      app.state.onlineUsers.push({ username: adminUser.username, role: adminUser.role, ip: adminUser.ip });
      addSystemMessage(`${adminUser.username} が管理者としてログインしました。`);
      persistState();
      render();
      return;
    }

    if (Object.values(PRIVILEGED_ADMIN_PASSWORDS).includes(adminPassword)) {
      const privileged = Object.entries(PRIVILEGED_ADMIN_PASSWORDS).find(([_, pass]) => pass === adminPassword);
      const adminUser = {
        id: crypto.randomUUID(),
        username: privileged ? privileged[0] : username,
        password: adminPassword,
        role: 'privileged_admin',
        ip: getClientIpKey(),
        persisted: false
      };
      app.state.currentUser = adminUser;
      app.state.onlineUsers.push({ username: adminUser.username, role: adminUser.role, ip: adminUser.ip });
      addSystemMessage(`${adminUser.username} が特権管理者としてログインしました。`);
      persistState();
      render();
      return;
    }
  }

  const account = findUser(username);
  if (!account || account.password !== password) {
    alert('ユーザー名またはパスワードが違います。');
    return;
  }

  app.state.currentUser = { ...account, persisted: true };
  account.online = true;
  app.state.onlineUsers = app.state.onlineUsers.filter((user) => user.username !== account.username);
  app.state.onlineUsers.push({ username: account.username, role: account.role, ip: account.ip });
  addSystemMessage(`${account.username} がチャットに参加しました。`);
  persistState();
  render();
}

function logoutUser() {
  const user = getCurrentUser();
  if (!user) return;

  if (user.persisted) {
    const storedUser = findUser(user.username);
    if (storedUser) storedUser.online = false;
  }

  app.state.onlineUsers = app.state.onlineUsers.filter((entry) => entry.username !== user.username || entry.role !== user.role);
  addSystemMessage(`${user.username} がログアウトしました。`);
  app.state.currentUser = null;
  app.state.replyTo = null;
  app.state.privateTarget = null;
  persistState();
  render();
}

function showLoginScreen() {
  app.ui.loginScreen.classList.remove('hidden');
  app.ui.registerScreen.classList.add('hidden');
  app.ui.appShell.classList.add('hidden');
}

function showAppShell() {
  app.ui.loginScreen.classList.add('hidden');
  app.ui.registerScreen.classList.add('hidden');
  app.ui.appShell.classList.remove('hidden');
}

function clearAllMessages() {
  app.state.messages = [{
    id: crypto.randomUUID(),
    sender: 'System',
    type: 'system',
    text: '全メッセージが削除されました。',
    createdAt: Date.now()
  }];
  app.state.replyTo = null;
  persistState();
  render();
}

function isMuted(user) {
  if (!user || !user.username) return false;
  const expiry = app.state.muteMap[user.username];
  if (!expiry) return false;
  if (Date.now() > Number(expiry)) {
    delete app.state.muteMap[user.username];
    persistState();
    return false;
  }
  return true;
}

function getMuteRemainingText(username) {
  const expiry = app.state.muteMap[username];
  if (!expiry) return '';
  const remain = Math.max(0, Math.ceil((Number(expiry) - Date.now()) / 1000));
  return remain > 0 ? `ミュート解除まで ${remain} 秒` : 'ミュート解除中';
}

function canUserSendMessage(user) {
  if (!user) return false;
  if (isMuted(user)) {
    alert(getMuteRemainingText(user.username));
    return false;
  }
  return true;
}

function renderOnlineUsers() {
  const count = app.state.onlineUsers.length;
  app.ui.onlineCount.textContent = String(count);
  app.ui.onlineList.innerHTML = '';

  app.state.onlineUsers.forEach((entry) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'online-user';
    item.innerHTML = `
      <span class="online-user-name">${escapeHtml(entry.username)}</span>
      <span class="online-dot" aria-label="online"></span>
    `;
    item.addEventListener('click', () => {
      app.state.privateTarget = entry.username;
      app.ui.chatInput.value = `prm ${entry.username} `;
      app.ui.chatInput.focus();
    });
    app.ui.onlineList.appendChild(item);
  });
}

function renderMessages() {
  const user = getCurrentUser();
  if (!user) {
    app.ui.messageList.innerHTML = '';
    return;
  }

  const visibleMessages = app.state.messages.filter((msg) => {
    if (msg.type === 'system') return true;
    if (msg.type === 'private') {
      const isTarget = msg.target === user.username || msg.sender === user.username;
      return isTarget || isPrivilegedAdmin(user);
    }
    return true;
  });

  app.ui.messageList.innerHTML = visibleMessages.map((msg) => {
    const isSelf = msg.sender === user.username;
    const isReply = !!msg.replyTo;
    const canEdit = isSelf || isPrivilegedAdmin(user) || isAdmin(user);
    const canDelete = isSelf || isPrivilegedAdmin(user) || isAdmin(user);
    const text = msg.text ? escapeHtml(msg.text) : '';
    const replyText = msg.replyTo ? escapeHtml(msg.replyTo.text || '') : '';
    const replyMarkup = msg.replyTo ? `<div class="reply-badge">返信: ${escapeHtml(msg.replyTo.sender)}</div>` : '';
    const mediaMarkup = msg.mediaType === 'image'
      ? `<img src="${escapeHtml(msg.mediaSrc)}" alt="image" />`
      : msg.mediaType === 'video'
        ? `<video controls src="${escapeHtml(msg.mediaSrc)}"></video>`
        : '';

    return `
      <article class="message ${msg.type === 'system' ? 'system' : isSelf ? 'self' : ''}" data-id="${msg.id}">
        <div class="message-header">
          <span class="message-author">${escapeHtml(msg.sender)}</span>
          <span>${new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        ${replyMarkup}
        <div class="message-content">
          ${replyText ? `<div class="reply-badge">${escapeHtml(msg.replyTo.sender)}: ${replyText}</div>` : ''}
          ${text}
          ${mediaMarkup}
        </div>
        ${msg.type !== 'system' ? `<div class="message-actions">
          <button type="button" data-action="reply" data-id="${msg.id}">返信</button>
          ${canEdit ? `<button type="button" data-action="edit" data-id="${msg.id}">編集</button>` : ''}
          ${canDelete ? `<button type="button" data-action="delete" data-id="${msg.id}">削除</button>` : ''}
        </div>` : ''}
      </article>
    `;
  }).join('');
}

function renderAdminTools() {
  const user = getCurrentUser();
  const tools = app.ui.adminTools;
  if (!user || !isPrivilegedAdmin(user)) {
    tools.classList.add('hidden');
    tools.innerHTML = '';
    return;
  }

  const online = app.state.onlineUsers.filter((entry) => entry.username !== user.username);
  tools.classList.remove('hidden');
  tools.innerHTML = online.map((entry) => {
    const target = app.state.users.find((item) => item.username === entry.username) || { role: entry.role || 'user', ip: entry.ip || 'unknown' };
    const ipText = target.ip ? `IP: ${escapeHtml(target.ip)}` : 'IP: unknown';
    return `
      <div class="admin-user-inline">
        <span>${escapeHtml(entry.username)}</span>
        <span class="meta">${ipText}</span>
        <button type="button" data-role="ipban" data-target="${escapeHtml(entry.username)}">P</button>
        <button type="button" data-role="ipunban" data-target="${escapeHtml(entry.username)}">PK</button>
        <button type="button" data-role="ban" data-target="${escapeHtml(entry.username)}">B</button>
        <button type="button" data-role="unban" data-target="${escapeHtml(entry.username)}">BK</button>
        <button type="button" data-role="mute" data-target="${escapeHtml(entry.username)}">M</button>
        <button type="button" data-role="unmute" data-target="${escapeHtml(entry.username)}">MK</button>
      </div>
    `;
  }).join('');
}

function renderHeader() {
  const user = getCurrentUser();
  if (!user) {
    app.ui.headerUser.textContent = '';
    return;
  }
  app.ui.headerUser.textContent = `${user.username} (${user.role === 'privileged_admin' ? '特権管理者' : user.role === 'admin' ? '管理者' : '一般ユーザー'})`;
}

function render() {
  const user = getCurrentUser();
  if (!user) {
    showLoginScreen();
    app.ui.logoutButton.classList.add('hidden');
    return;
  }

  showAppShell();
  app.ui.logoutButton.classList.remove('hidden');
  renderOnlineUsers();
  renderMessages();
  renderAdminTools();
  renderHeader();
  updateReplyPreview();
}

function updateReplyPreview() {
  const reply = app.state.replyTo;
  if (!reply) {
    app.ui.replyPreview.classList.add('hidden');
    app.ui.replyPreview.innerHTML = '';
    return;
  }

  app.ui.replyPreview.classList.remove('hidden');
  app.ui.replyPreview.innerHTML = `<strong>返信先:</strong> ${escapeHtml(reply.sender)} — ${escapeHtml(reply.text || 'メディア')}`;
}

function sendMessage() {
  const user = getCurrentUser();
  if (!user) return;
  if (!canUserSendMessage(user)) return;

  const rawText = sanitizeText(app.ui.chatInput.value);
  if (!rawText && !app.ui.mediaInput.files[0]) {
    return;
  }

  if (rawText.startsWith('/削除')) {
    clearAllMessages();
    app.ui.chatInput.value = '';
    return;
  }

  const isPrivate = rawText.startsWith('prm ');
  let targetName = app.state.privateTarget;
  let text = rawText;

  if (isPrivate) {
    const match = rawText.match(/^prm\s+([^\s]+)\s*(.*)$/);
    if (!match) {
      alert('送信形式が正しくありません。例: prm user1 こんにちは');
      return;
    }
    targetName = match[1];
    text = match[2].trim();
  }

  if (!text && !app.ui.mediaInput.files[0]) {
    alert('メッセージ内容を入力してください。');
    return;
  }

  const message = {
    id: crypto.randomUUID(),
    sender: user.username,
    target: isPrivate ? targetName : 'all',
    type: isPrivate ? 'private' : 'chat',
    text: text,
    createdAt: Date.now(),
    replyTo: app.state.replyTo ? { ...app.state.replyTo } : null,
    mediaType: null,
    mediaSrc: null
  };

  const file = app.ui.mediaInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      message.mediaType = file.type.startsWith('video/') ? 'video' : 'image';
      message.mediaSrc = String(reader.result);
      app.state.messages.push(message);
      app.state.replyTo = null;
      app.ui.mediaInput.value = '';
      app.ui.chatInput.value = '';
      persistState();
      render();
    };
    reader.readAsDataURL(file);
    return;
  }

  app.state.messages.push(message);
  app.state.replyTo = null;
  app.ui.chatInput.value = '';
  persistState();
  render();
}

function handleMessageAction(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const user = getCurrentUser();
  const messageId = target.dataset.id;
  const message = app.state.messages.find((item) => item.id === messageId);
  if (!message) return;

  const action = target.dataset.action;

  if (action === 'reply') {
    app.state.replyTo = { id: message.id, sender: message.sender, text: message.text || (message.mediaType ? 'メディア' : '') };
    updateReplyPreview();
    return;
  }

  if (action === 'delete') {
    if (!user || (!isPrivilegedAdmin(user) && !(message.sender === user.username) && !isAdmin(user))) {
      alert('削除権限がありません。');
      return;
    }
    app.state.messages = app.state.messages.filter((item) => item.id !== message.id);
    persistState();
    render();
    return;
  }

  if (action === 'edit') {
    const isAllowed = !user || (message.sender === user.username || isPrivilegedAdmin(user));
    if (!isAllowed) {
      alert('編集権限がありません。');
      return;
    }
    const newText = window.prompt('新しいメッセージを入力してください', message.text || '');
    if (newText === null) return;
    message.text = newText;
    persistState();
    render();
  }
}

function handleAdminActionFromTool(targetName, action) {
  const actor = getCurrentUser();
  if (!actor) return;
  const target = findUser(targetName) || app.state.onlineUsers.find((entry) => entry.username === targetName);

  if (action === 'mute') {
    if (!isPrivilegedAdmin(actor)) {
      alert('特権管理者のみがミュートできます。');
      return;
    }
    const seconds = Number(window.prompt('ミュート秒数を入力してください', '60'));
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    app.state.muteMap[targetName] = Date.now() + seconds * 1000;
    alert(`${targetName} を ${seconds} 秒ミュートしました。`);
    persistState();
    render();
    return;
  }

  if (action === 'unmute') {
    if (!isPrivilegedAdmin(actor)) {
      alert('特権管理者のみがミュート解除できます。');
      return;
    }
    delete app.state.muteMap[targetName];
    alert(`${targetName} のミュートを解除しました。`);
    persistState();
    render();
    return;
  }

  if (action === 'ipban') {
    if (!isPrivilegedAdmin(actor)) {
      alert('特権管理者のみがIPBANを実行できます。');
      return;
    }
    if (target && target.role === 'privileged_admin') {
      alert('特権管理者はIPBAN対象にできません。');
      return;
    }
    const ip = target?.ip || getClientIpKey();
    const key = `ipban:${ip}`;
    localStorage.setItem(key, '1');
    alert(`${targetName} をIPBANしました。`);
    return;
  }

  if (action === 'ipunban') {
    if (!isPrivilegedAdmin(actor)) {
      alert('特権管理者のみがIPBAN解除を実行できます。');
      return;
    }
    const ip = target?.ip || getClientIpKey();
    localStorage.removeItem(`ipban:${ip}`);
    alert(`${targetName} のIPBANを解除しました。`);
    return;
  }

  if (action === 'ban') {
    if (!actor || (!isPrivilegedAdmin(actor) && !isAdmin(actor))) {
      alert('BANの権限がありません。');
      return;
    }
    if (target && target.role === 'privileged_admin') {
      alert('特権管理者はBANできません。');
      return;
    }
    const targetUser = findUser(targetName);
    if (targetUser) targetUser.banned = true;
    alert(`${targetName} をBANしました。`);
    persistState();
    render();
    return;
  }

  if (action === 'unban') {
    if (!actor || (!isPrivilegedAdmin(actor) && !isAdmin(actor))) {
      alert('BAN解除の権限がありません。');
      return;
    }
    const targetUser = findUser(targetName);
    if (targetUser) targetUser.banned = false;
    alert(`${targetName} のBANを解除しました。`);
    persistState();
    render();
  }
}

function bindEvents() {
  app.ui = {
    loginScreen: document.getElementById('loginScreen'),
    registerScreen: document.getElementById('registerScreen'),
    appShell: document.getElementById('appShell'),
    loginUsername: document.getElementById('loginUsername'),
    loginPassword: document.getElementById('loginPassword'),
    adminPassword: document.getElementById('adminPassword'),
    loginButton: document.getElementById('loginButton'),
    showRegisterButton: document.getElementById('showRegisterButton'),
    registerUsername: document.getElementById('registerUsername'),
    registerPassword: document.getElementById('registerPassword'),
    registerConfirm: document.getElementById('registerConfirm'),
    registerButton: document.getElementById('registerButton'),
    backToLoginButton: document.getElementById('backToLoginButton'),
    messageList: document.getElementById('messageList'),
    onlineCount: document.getElementById('onlineCount'),
    onlineList: document.getElementById('onlineList'),
    chatInput: document.getElementById('chatInput'),
    mediaInput: document.getElementById('mediaInput'),
    sendButton: document.getElementById('sendButton'),
    replyPreview: document.getElementById('replyPreview'),
    adminTools: document.getElementById('adminTools'),
    headerUser: document.getElementById('headerUser'),
    logoutButton: document.getElementById('logoutButton')
  };

  app.ui.loginButton.addEventListener('click', loginUser);
  app.ui.showRegisterButton.addEventListener('click', () => {
    app.ui.loginScreen.classList.add('hidden');
    app.ui.registerScreen.classList.remove('hidden');
  });
  app.ui.registerButton.addEventListener('click', registerUser);
  app.ui.backToLoginButton.addEventListener('click', showLoginScreen);
  app.ui.sendButton.addEventListener('click', sendMessage);
  app.ui.chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendMessage();
    }
  });
  app.ui.logoutButton.addEventListener('click', logoutUser);
  app.ui.messageList.addEventListener('click', handleMessageAction);
  app.ui.adminTools.addEventListener('click', (event) => {
    const button = event.target.closest('[data-role]');
    if (!button) return;
    handleAdminActionFromTool(button.dataset.target, button.dataset.role);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  render();
});

window.addEventListener('beforeunload', () => {
  const user = getCurrentUser();
  if (user && user.persisted) {
    const storedUser = findUser(user.username);
    if (storedUser) storedUser.online = false;
  }
  persistState();
});
