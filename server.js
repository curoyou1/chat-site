const express = require('express');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_COOKIE = 'chat_session';
const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  messages: path.join(DATA_DIR, 'messages.json'),
  mutes: path.join(DATA_DIR, 'mutes.json'),
  ipBans: path.join(DATA_DIR, 'ipbans.json')
};
const ONLINE_WINDOW_MS = 60_000;

// Keep credentials in the deployment environment, never in the public source tree.
const PRIVILEGED_ADMIN_CREDENTIALS = Object.freeze({
  nsiJiski: process.env.PRIVILEGED_ADMIN_NSIJISKI || '',
  HyUUkj: process.env.PRIVILEGED_ADMIN_HYUUKJ || '',
  UKina: process.env.PRIVILEGED_ADMIN_UKINA || '',
  Msamu: process.env.PRIVILEGED_ADMIN_MSAMU || ''
});
const ADMIN_PASSWORDS = (process.env.ADMIN_PASSWORDS || '').split(',').map((value) => value.trim()).filter(Boolean);

fs.mkdirSync(DATA_DIR, { recursive: true });
function readJson(key, fallback) {
  try {
    if (!fs.existsSync(FILES[key])) { fs.writeFileSync(FILES[key], JSON.stringify(fallback, null, 2)); return fallback; }
    const raw = fs.readFileSync(FILES[key], 'utf8');
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function writeJson(key, value) { fs.writeFileSync(FILES[key], JSON.stringify(value, null, 2)); }
const loadUsers = () => readJson('users', []);
const loadMessages = () => readJson('messages', []);
const loadMutes = () => readJson('mutes', {});
const loadIpBans = () => readJson('ipBans', {});
const clean = (value) => String(value || '').trim();
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  return (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : (req.ip || req.socket?.remoteAddress || 'unknown')).replace(/^::ffff:/, '');
}
function publicUser(user) {
  // Deliberately omit password, hashes, secrets, and IP for ordinary users.
  const result = { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt, isOnline: !!user.isOnline, banned: !!user.banned };
  if (user.ip) result.ip = user.ip;
  return result;
}
function touchUser(username, ip) {
  const users = loadUsers();
  const user = users.find((item) => item.username === username);
  if (!user || user.banned) return null;
  user.isOnline = true;
  user.lastSeen = Date.now();
  if (ip) user.ip = ip;
  writeJson('users', users);
  return user;
}
function authenticate(req) {
  const username = req.cookies?.[AUTH_COOKIE];
  if (!username) return null;
  const user = loadUsers().find((item) => item.username === username) || null;
  return user && !user.banned ? user : null;
}
function requireLogin(req, res, next) {
  const user = authenticate(req);
  if (!user) return res.status(401).json({ error: 'ログイン状態を確認できません。再ログインしてください。' });
  req.user = user;
  next();
}
const isPrivilegedAdmin = (user) => user?.role === 'privileged_admin';
const isAdmin = (user) => user?.role === 'admin' || isPrivilegedAdmin(user);
const visibleMessages = (user) => loadMessages().filter((message) => {
  if (message.type === 'system' || message.sender === 'System') return false;
  if (message.type === 'private') return message.sender === user.username || message.target === user.username || isPrivilegedAdmin(user);
  return true;
});
function nextUsername(base, users) {
  const name = clean(base).replace(/#\d+$/, '') || 'Guest';
  if (!users.some((user) => user.username === name)) return name;
  let n = 1;
  while (users.some((user) => user.username === `${name}#${n}`)) n++;
  return `${name}#${n}`;
}
function onlineView(reqUser) {
  const now = Date.now();
  const entries = loadUsers().filter((user) => user.isOnline && now - Number(user.lastSeen || 0) < ONLINE_WINDOW_MS).map((user) => {
    const value = publicUser(user);
    if (!isPrivilegedAdmin(reqUser)) delete value.ip;
    return value;
  });
  if (!entries.some((entry) => entry.username === reqUser.username)) entries.push(publicUser(reqUser));
  return entries;
}
function remainingMute(username) {
  const mutes = loadMutes();
  const until = Number(mutes[username] || 0);
  if (until <= Date.now()) { delete mutes[username]; writeJson('mutes', mutes); return 0; }
  return Math.ceil((until - Date.now()) / 1000);
}
function resetChat() { writeJson('messages', []); }
function upsertVirtualAdmin(username, role, ip) {
  const users = loadUsers();
  let user = users.find((entry) => entry.username === username);
  if (!user) {
    user = { id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`, username, createdAt: Date.now(), banned: false };
    users.push(user);
  }
  user.role = role; user.ip = ip; user.isOnline = true; user.lastSeen = Date.now();
  writeJson('users', users);
  return user;
}

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(__dirname));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/me', (req, res) => {
  const user = authenticate(req);
  const updated = user && touchUser(user.username);
  res.json({ user: updated ? publicUser(updated) : null });
});
app.post('/api/presence', requireLogin, (req, res) => {
  const user = touchUser(req.user.username, clientIp(req));
  if (!user) return res.status(401).json({ error: 'ログイン状態を確認できません。' });
  res.json({ ok: true, user: publicUser(user) });
});
app.post('/api/register', (req, res) => {
  const users = loadUsers();
  const username = clean(req.body.username), password = clean(req.body.password), confirm = clean(req.body.confirm), ip = clientIp(req);
  if (!username || !password || !confirm) return res.status(400).json({ error: 'ユーザー名とパスワードを入力してください。' });
  if (password !== confirm) return res.status(400).json({ error: 'パスワードが確認と一致しません。' });
  if (password.length < 4) return res.status(400).json({ error: 'パスワードは4文字以上にしてください。' });
  if (users.filter((user) => user.ip === ip).length >= 3) return res.status(400).json({ error: '同じIPアドレスでは3つまでアカウントを作成できます。' });
  const user = { id: `user-${Date.now()}-${Math.random().toString(16).slice(2)}`, username: nextUsername(username, users), password, role: 'user', ip, createdAt: Date.now(), isOnline: true, lastSeen: Date.now(), banned: false };
  users.push(user); writeJson('users', users);
  res.cookie(AUTH_COOKIE, user.username, { httpOnly: true, sameSite: 'lax' });
  res.status(201).json({ ok: true, user: publicUser(user) });
});
app.post('/api/login', (req, res) => {
  const username = clean(req.body.username), password = clean(req.body.password), adminPassword = clean(req.body.adminPassword), ip = clientIp(req);
  if (loadIpBans()[ip]) return res.status(403).json({ error: 'このIPアドレスはアクセスできません。' });
  const privileged = Object.entries(PRIVILEGED_ADMIN_CREDENTIALS).find(([name, secret]) => secret && ((name === username && secret === password) || secret === adminPassword));
  if (privileged) {
    const user = upsertVirtualAdmin(privileged[0], 'privileged_admin', ip);
    res.cookie(AUTH_COOKIE, user.username, { httpOnly: true, sameSite: 'lax' });
    return res.json({ ok: true, user: publicUser(user) });
  }
  if (adminPassword && ADMIN_PASSWORDS.includes(adminPassword)) {
    if (!username) return res.status(400).json({ error: '管理者ログインにはユーザー名を入力してください。' });
    const user = upsertVirtualAdmin(username, 'admin', ip);
    res.cookie(AUTH_COOKIE, user.username, { httpOnly: true, sameSite: 'lax' });
    return res.json({ ok: true, user: publicUser(user) });
  }
  const users = loadUsers();
  const account = users.find((user) => user.username === username && user.password === password);
  if (!account) return res.status(401).json({ error: 'ユーザー名またはパスワードが違います。' });
  if (account.banned) return res.status(403).json({ error: 'このアカウントはBANされています。' });
  account.ip = ip; account.isOnline = true; account.lastSeen = Date.now(); writeJson('users', users);
  res.cookie(AUTH_COOKIE, account.username, { httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true, user: publicUser(account) });
});
app.post('/api/logout', requireLogin, (req, res) => {
  const users = loadUsers(), user = users.find((entry) => entry.username === req.user.username);
  if (user) { user.isOnline = false; user.lastSeen = 0; writeJson('users', users); }
  res.clearCookie(AUTH_COOKIE); res.json({ ok: true });
});
app.get('/api/users/online', requireLogin, (req, res) => res.json({ users: onlineView(req.user) }));
app.get('/api/messages', requireLogin, (req, res) => res.json({ messages: visibleMessages(req.user) }));
app.post('/api/messages', requireLogin, (req, res) => {
  const remaining = remainingMute(req.user.username);
  if (remaining > 0) return res.status(403).json({ error: `ミュート中です。解除まで ${remaining} 秒です。`, remaining });
  const text = clean(req.body.text), mediaType = req.body.mediaType || null, mediaData = req.body.mediaData || null, target = clean(req.body.target || 'all');
  if (text === '/削除') {
    if (!isAdmin(req.user)) return res.status(403).json({ error: '全メッセージ削除の権限がありません。' });
    resetChat(); return res.json({ ok: true, messages: [] });
  }
  if (!text && !mediaData) return res.status(400).json({ error: 'メッセージ内容を入力してください。' });
  if (target !== 'all' && !loadUsers().some((user) => user.username === target)) return res.status(404).json({ error: '対象ユーザーが見つかりません。' });
  const messages = loadMessages();
  const message = { id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`, sender: req.user.username, target, type: target === 'all' ? 'chat' : 'private', text, createdAt: Date.now(), replyTo: req.body.replyTo || null, mediaType, mediaData };
  messages.push(message); writeJson('messages', messages); res.status(201).json({ ok: true, message });
});
app.post('/api/admin/action', requireLogin, (req, res) => {
  const { action, targetUsername, durationSec } = req.body || {};
  const users = loadUsers(), target = users.find((user) => user.username === targetUsername);
  if (!action || !target) return res.status(404).json({ error: '対象ユーザーまたは操作が見つかりません。' });
  if (action === 'deleteAll') { if (!isAdmin(req.user)) return res.status(403).json({ error: '権限がありません。' }); resetChat(); return res.json({ ok: true }); }
  if (action === 'ban' || action === 'unban') {
    if (!isAdmin(req.user)) return res.status(403).json({ error: '権限がありません。' });
    if (target.role === 'privileged_admin') return res.status(403).json({ error: '特権管理者は対象にできません。' });
    target.banned = action === 'ban'; if (target.banned) { target.isOnline = false; target.lastSeen = 0; } writeJson('users', users); return res.json({ ok: true });
  }
  if (!isPrivilegedAdmin(req.user)) return res.status(403).json({ error: '特権管理者のみ実行できます。' });
  if (action === 'ipban' || action === 'ipunban') {
    if (target.role === 'privileged_admin') return res.status(403).json({ error: '特権管理者は対象にできません。' });
    const bans = loadIpBans(); if (action === 'ipban') { bans[target.ip] = true; target.banned = true; target.isOnline = false; target.lastSeen = 0; } else delete bans[target.ip];
    writeJson('ipBans', bans); writeJson('users', users); return res.json({ ok: true });
  }
  const mutes = loadMutes();
  if (action === 'mute') { const seconds = Number(durationSec); if (!Number.isFinite(seconds) || seconds <= 0) return res.status(400).json({ error: 'ミュート秒数が不正です。' }); mutes[target.username] = Date.now() + seconds * 1000; writeJson('mutes', mutes); return res.json({ ok: true }); }
  if (action === 'unmute') { delete mutes[target.username]; writeJson('mutes', mutes); return res.json({ ok: true }); }
  res.status(400).json({ error: '未対応の操作です。' });
});
app.delete('/api/messages/:id', requireLogin, (req, res) => {
  const messages = loadMessages(), message = messages.find((item) => item.id === req.params.id);
  if (!message) return res.status(404).json({ error: 'メッセージが見つかりません。' });
  if (message.sender !== req.user.username && !isAdmin(req.user)) return res.status(403).json({ error: '削除権限がありません。' });
  writeJson('messages', messages.filter((item) => item.id !== req.params.id)); res.json({ ok: true });
});
app.put('/api/messages/:id', requireLogin, (req, res) => {
  const messages = loadMessages(), message = messages.find((item) => item.id === req.params.id);
  if (!message) return res.status(404).json({ error: 'メッセージが見つかりません。' });
  if (message.sender !== req.user.username && !isPrivilegedAdmin(req.user)) return res.status(403).json({ error: '編集権限がありません。' });
  const text = clean(req.body.text); if (!text) return res.status(400).json({ error: '編集内容がありません。' });
  message.text = text; writeJson('messages', messages); res.json({ ok: true, message });
});
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(PORT, () => console.log(`Chat site running on http://localhost:${PORT}`));
