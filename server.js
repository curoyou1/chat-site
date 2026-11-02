const express = require('express');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_COOKIE = 'chat_session';
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const MUTES_FILE = path.join(DATA_DIR, 'mutes.json');
const IP_BANS_FILE = path.join(DATA_DIR, 'ipbans.json');

const ADMIN_PASSWORDS = ['92729', '284847', '9484948', '639473', '903830'];
const PRIVILEGED_ADMIN_CREDENTIALS = Object.freeze({
  nsiJiski: 'nsiJiski',
  HyUUkj: 'HyUUkj',
  UKina: 'UKina',
  Msamu: 'Msamu'
});

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
      return fallback;
    }
    const raw = fs.readFileSync(file, 'utf8');
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return (req.ip || req.connection?.remoteAddress || 'unknown').replace(/^::ffff:/, '');
}

function createDefaultMessages() {
  return [
    {
      id: 'welcome-system',
      sender: 'System',
      type: 'system',
      target: 'all',
      text: 'チャットにようこそ。ログインして会話を始めましょう。',
      createdAt: Date.now(),
      replyTo: null,
      mediaType: null,
      mediaData: null
    }
  ];
}

function loadUsers() {
  return readJson(USERS_FILE, []);
}

function loadMessages() {
  return readJson(MESSAGES_FILE, createDefaultMessages());
}

function loadMutes() {
  return readJson(MUTES_FILE, {});
}

function loadIpBans() {
  return readJson(IP_BANS_FILE, {});
}

function saveUsers(users) {
  writeJson(USERS_FILE, users);
}

function saveMessages(messages) {
  writeJson(MESSAGES_FILE, messages);
}

function saveMutes(mutes) {
  writeJson(MUTES_FILE, mutes);
}

function saveIpBans(ipBans) {
  writeJson(IP_BANS_FILE, ipBans);
}

function sanitizeText(value) {
  return String(value || '').trim();
}

function pickUsername(baseName, users) {
  const cleaned = sanitizeText(baseName).replace(/#\d+$/, '');
  if (!cleaned) return 'Guest';

  let candidate = cleaned;
  let index = 1;
  while (users.some((user) => user.username === candidate)) {
    candidate = `${cleaned}#${index}`;
    index += 1;
  }

  return candidate;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    ip: user.ip,
    isOnline: !!user.isOnline,
    banned: !!user.banned
  };
}

function authenticate(req) {
  const username = req.cookies?.[AUTH_COOKIE];
  if (!username) return null;
  const users = loadUsers();
  return users.find((user) => user.username === username) || null;
}

function isPrivilegedAdmin(user) {
  return !!user && user.role === 'privileged_admin';
}

function isNormalAdmin(user) {
  return !!user && user.role === 'admin';
}

function isAdmin(user) {
  return !!user && (user.role === 'admin' || user.role === 'privileged_admin');
}

function canDeleteAll(user) {
  return !!user && (user.role === 'admin' || user.role === 'privileged_admin');
}

function canModerate(user) {
  return !!user && (user.role === 'admin' || user.role === 'privileged_admin');
}

function getMuteRemaining(username, mutes) {
  const expires = Number(mutes[username] || 0);
  if (!expires || Date.now() > expires) {
    delete mutes[username];
    return 0;
  }
  return Math.max(0, Math.ceil((expires - Date.now()) / 1000));
}

function requiresLogin(req, res, next) {
  const user = authenticate(req);
  if (!user) {
    return res.status(401).json({ error: 'auth required' });
  }
  req.user = user;
  next();
}

ensureDataDir();

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(__dirname));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, now: Date.now() });
});

app.get('/api/me', (req, res) => {
  const user = authenticate(req);
  res.json({ user: user ? publicUser(user) : null });
});

app.post('/api/register', (req, res) => {
  const users = loadUsers();
  const username = sanitizeText(req.body.username);
  const password = sanitizeText(req.body.password);
  const confirm = sanitizeText(req.body.confirm);
  const ip = getClientIp(req);

  if (!username || !password || !confirm) {
    return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください。' });
  }

  if (password !== confirm) {
    return res.status(400).json({ error: 'パスワードが確認と一致しません。' });
  }

  if (password.length < 4) {
    return res.status(400).json({ error: 'パスワードは4文字以上にしてください。' });
  }

  if (users.filter((user) => user.ip === ip).length >= 3) {
    return res.status(400).json({ error: '同じIPアドレスでは3つまでアカウントを作成できます。' });
  }

  const generatedUsername = pickUsername(username, users);
  const user = {
    id: `user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    username: generatedUsername,
    password,
    role: 'user',
    ip,
    createdAt: Date.now(),
    isOnline: false,
    banned: false
  };

  users.push(user);
  saveUsers(users);
  res.cookie(AUTH_COOKIE, user.username, { httpOnly: true, sameSite: 'lax' });
  return res.status(201).json({ ok: true, user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const users = loadUsers();
  const username = sanitizeText(req.body.username);
  const password = sanitizeText(req.body.password);
  const adminPassword = sanitizeText(req.body.adminPassword);
  const ip = getClientIp(req);

  if (loadIpBans()[ip]) {
    return res.status(403).json({ error: 'このIPアドレスはアクセスできません。' });
  }

  const privilegedMatch = Object.entries(PRIVILEGED_ADMIN_CREDENTIALS).find(([name, pass]) => {
    return (name === username && pass === password) || pass === adminPassword || name === adminPassword;
  });

  if (privilegedMatch) {
    const user = {
      id: `privileged-${Date.now()}`,
      username: privilegedMatch[0],
      password: privilegedMatch[1],
      role: 'privileged_admin',
      ip,
      createdAt: Date.now(),
      isOnline: true,
      banned: false
    };
    res.cookie(AUTH_COOKIE, user.username, { httpOnly: true, sameSite: 'lax' });
    return res.json({ ok: true, user: publicUser(user) });
  }

  if (adminPassword && ADMIN_PASSWORDS.includes(adminPassword)) {
    const user = {
      id: `admin-${Date.now()}`,
      username,
      role: 'admin',
      password: '',
      ip,
      createdAt: Date.now(),
      isOnline: true,
      banned: false
    };
    res.cookie(AUTH_COOKIE, user.username, { httpOnly: true, sameSite: 'lax' });
    return res.json({ ok: true, user: publicUser(user) });
  }

  const account = users.find((user) => user.username === username && user.password === password);
  if (!account) {
    return res.status(401).json({ error: 'ユーザー名またはパスワードが違います。' });
  }

  if (account.banned) {
    return res.status(403).json({ error: 'このアカウントはBANされています。' });
  }

  account.isOnline = true;
  account.ip = ip;
  saveUsers(users);
  res.cookie(AUTH_COOKIE, account.username, { httpOnly: true, sameSite: 'lax' });
  return res.json({ ok: true, user: publicUser(account) });
});

app.post('/api/logout', requiresLogin, (req, res) => {
  const users = loadUsers();
  const user = users.find((item) => item.username === req.user.username);
  if (user) {
    user.isOnline = false;
    saveUsers(users);
  }

  res.clearCookie(AUTH_COOKIE);
  res.json({ ok: true });
});

app.get('/api/users/online', requiresLogin, (req, res) => {
  const users = loadUsers();
  const online = users.filter((user) => user.isOnline).map((user) => {
    const item = publicUser(user);
    if (!isAdmin(req.user)) {
      delete item.ip;
    }
    return item;
  });
  res.json({ users: online });
});

app.get('/api/messages', requiresLogin, (req, res) => {
  const messages = loadMessages();
  const visible = messages.filter((message) => {
    if (message.type === 'system') return true;
    if (message.type === 'private') {
      return message.sender === req.user.username || message.target === req.user.username || isPrivilegedAdmin(req.user);
    }
    return true;
  });
  res.json({ messages: visible });
});

app.post('/api/messages', requiresLogin, (req, res) => {
  const users = loadUsers();
  const messages = loadMessages();
  const mutes = loadMutes();
  const user = req.user;
  const remaining = getMuteRemaining(user.username, mutes);

  if (remaining > 0) {
    return res.status(403).json({ error: 'ミュート中です', remaining });
  }

  const text = sanitizeText(req.body.text);
  const mediaType = req.body.mediaType || null;
  const mediaData = req.body.mediaData || null;
  const target = sanitizeText(req.body.target || 'all');
  const replyTo = req.body.replyTo || null;

  if (text === '/削除') {
    if (!canDeleteAll(user)) {
      return res.status(403).json({ error: '全メッセージ削除の権限がありません。' });
    }

    const cleared = [
      {
        id: `system-${Date.now()}`,
        sender: 'System',
        type: 'system',
        target: 'all',
        text: '全メッセージを削除しました。',
        createdAt: Date.now(),
        replyTo: null,
        mediaType: null,
        mediaData: null
      }
    ];
    saveMessages(cleared);
    return res.json({ ok: true, messages: cleared });
  }

  if (!text && !mediaData) {
    return res.status(400).json({ error: 'メッセージ内容を入力してください。' });
  }

  if (target !== 'all') {
    const targetUser = users.find((entry) => entry.username === target);
    if (!targetUser) {
      return res.status(404).json({ error: '対象ユーザーが見つかりません。' });
    }
  }

  const message = {
    id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sender: user.username,
    target: target || 'all',
    type: target && target !== 'all' ? 'private' : 'chat',
    text,
    createdAt: Date.now(),
    replyTo,
    mediaType,
    mediaData
  };

  messages.push(message);
  saveMessages(messages);
  return res.status(201).json({ ok: true, message });
});

app.post('/api/admin/action', requiresLogin, (req, res) => {
  const { action, targetUsername, durationSec } = req.body || {};
  const users = loadUsers();
  const mutes = loadMutes();
  const ipBans = loadIpBans();
  const actor = req.user;

  if (!action || !targetUsername) {
    return res.status(400).json({ error: '対象ユーザーと操作が必要です。' });
  }

  const target = users.find((user) => user.username === targetUsername);
  if (!target) {
    return res.status(404).json({ error: '対象ユーザーが見つかりません。' });
  }

  if (action === 'deleteAll') {
    if (!canModerate(actor)) {
      return res.status(403).json({ error: '全メッセージ削除の権限がありません。' });
    }
    const cleared = [
      {
        id: `system-${Date.now()}`,
        sender: 'System',
        type: 'system',
        target: 'all',
        text: '全メッセージが削除されました。',
        createdAt: Date.now(),
        replyTo: null,
        mediaType: null,
        mediaData: null
      }
    ];
    saveMessages(cleared);
    return res.json({ ok: true });
  }

  if (action === 'ban') {
    if (!canModerate(actor)) {
      return res.status(403).json({ error: 'BANの権限がありません。' });
    }
    if (target.role === 'privileged_admin') {
      return res.status(403).json({ error: '特権管理者はBANできません。' });
    }
    target.banned = true;
    target.isOnline = false;
    saveUsers(users);
    return res.json({ ok: true });
  }

  if (action === 'unban') {
    if (!canModerate(actor)) {
      return res.status(403).json({ error: 'BAN解除の権限がありません。' });
    }
    target.banned = false;
    saveUsers(users);
    return res.json({ ok: true });
  }

  if (action === 'ipban') {
    if (!isPrivilegedAdmin(actor)) {
      return res.status(403).json({ error: '特権管理者のみIPBANできます。' });
    }
    if (target.role === 'privileged_admin') {
      return res.status(403).json({ error: '特権管理者はIPBANできません。' });
    }
    ipBans[target.ip] = true;
    target.banned = true;
    target.isOnline = false;
    saveIpBans(ipBans);
    saveUsers(users);
    return res.json({ ok: true, ip: target.ip });
  }

  if (action === 'ipunban') {
    if (!isPrivilegedAdmin(actor)) {
      return res.status(403).json({ error: '特権管理者のみIPBAN解除できます。' });
    }
    delete ipBans[target.ip];
    saveIpBans(ipBans);
    return res.json({ ok: true });
  }

  if (action === 'mute') {
    if (!isPrivilegedAdmin(actor)) {
      return res.status(403).json({ error: '特権管理者のみミュートできます。' });
    }
    const duration = Number(durationSec || 60);
    if (!Number.isFinite(duration) || duration <= 0) {
      return res.status(400).json({ error: 'ミュート秒数を正しく入力してください。' });
    }
    mutes[target.username] = Date.now() + duration * 1000;
    saveMutes(mutes);
    return res.json({ ok: true, remaining: duration });
  }

  if (action === 'unmute') {
    if (!isPrivilegedAdmin(actor)) {
      return res.status(403).json({ error: '特権管理者のみミュート解除できます。' });
    }
    delete mutes[target.username];
    saveMutes(mutes);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: '未対応の管理者操作です。' });
});

app.delete('/api/messages/:id', requiresLogin, (req, res) => {
  const messages = loadMessages();
  const message = messages.find((item) => item.id === req.params.id);
  if (!message) return res.status(404).json({ error: 'メッセージが見つかりません。' });

  const actor = req.user;
  const allowed = actor.username === message.sender || isPrivilegedAdmin(actor) || isNormalAdmin(actor);
  if (!allowed) {
    return res.status(403).json({ error: '削除権限がありません。' });
  }

  const nextMessages = messages.filter((item) => item.id !== req.params.id);
  saveMessages(nextMessages);
  return res.json({ ok: true });
});

app.put('/api/messages/:id', requiresLogin, (req, res) => {
  const messages = loadMessages();
  const message = messages.find((item) => item.id === req.params.id);
  if (!message) return res.status(404).json({ error: 'メッセージが見つかりません。' });

  const actor = req.user;
  if (message.sender !== actor.username && !isPrivilegedAdmin(actor)) {
    return res.status(403).json({ error: '編集権限がありません。' });
  }

  const newText = sanitizeText(req.body.text);
  if (!newText) {
    return res.status(400).json({ error: '編集内容がありません。' });
  }

  message.text = newText;
  saveMessages(messages);
  return res.json({ ok: true, message });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Chat site running on http://localhost:${PORT}`);
});
