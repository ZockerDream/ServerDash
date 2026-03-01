const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const db = require('../db/database');
const { authMiddleware } = require('../middleware/auth');
const { encrypt, decrypt } = require('../utils/sshKeyCrypto');

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid credentials' });

  // If 2FA is enabled, require TOTP
  if (user.totp_enabled) {
    return res.json({ require2fa: true, userId: user.id });
  }

  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  const token = signToken(user);
  return res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

// POST /api/auth/verify-2fa
router.post('/verify-2fa', (req, res) => {
  const { userId, token } = req.body;
  if (!userId || !token)
    return res.status(400).json({ error: 'userId and token required' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || !user.totp_enabled || !user.totp_secret)
    return res.status(400).json({ error: 'User not found or 2FA not configured' });

  const valid = speakeasy.totp.verify({
    secret: user.totp_secret,
    encoding: 'base32',
    token: String(token),
    window: 1,
  });

  if (!valid) return res.status(401).json({ error: 'Invalid 2FA code' });

  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  const jwtToken = signToken(user);
  return res.json({ token: jwtToken, user: { id: user.id, username: user.username, role: user.role } });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, email, role, totp_enabled, created_at, last_login, ssh_key FROM users WHERE id = ?').get(req.user.id);
  // Never send the encrypted key to the client — just whether one is stored
  const { ssh_key, ...rest } = user;
  res.json({ ...rest, ssh_key_stored: !!ssh_key });
});

// GET /api/auth/ssh-key  — does the current user have a key saved?
router.get('/ssh-key', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT ssh_key FROM users WHERE id = ?').get(req.user.id);
  res.json({ stored: !!row?.ssh_key });
});

// POST /api/auth/ssh-key  — save (or replace) a private key
router.post('/ssh-key', authMiddleware, (req, res) => {
  const { privateKey } = req.body;
  if (!privateKey || typeof privateKey !== 'string' || !privateKey.trim())
    return res.status(400).json({ error: 'privateKey is required' });

  // Basic sanity check — must look like a PEM private key
  const pem = privateKey.trim();
  if (!pem.includes('PRIVATE KEY'))
    return res.status(400).json({ error: 'The key does not look like a PEM private key' });

  try {
    const encrypted = encrypt(pem);
    db.prepare('UPDATE users SET ssh_key = ? WHERE id = ?').run(encrypted, req.user.id);
    res.json({ ok: true, message: 'SSH key saved successfully' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to store key: ' + e.message });
  }
});

// DELETE /api/auth/ssh-key  — remove the stored key
router.delete('/ssh-key', authMiddleware, (req, res) => {
  db.prepare('UPDATE users SET ssh_key = NULL WHERE id = ?').run(req.user.id);
  res.json({ ok: true, message: 'SSH key removed' });
});

// POST /api/auth/setup-2fa  — generate TOTP secret + QR
router.post('/setup-2fa', authMiddleware, async (req, res) => {
  const secret = speakeasy.generateSecret({
    name: `${process.env.APP_NAME || 'ServerDash'} (${req.user.username})`,
    length: 20,
  });

  // Store secret temporarily (not enabled yet until confirmed)
  db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret.base32, req.user.id);

  const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);
  res.json({ secret: secret.base32, qr: qrDataUrl });
});

// POST /api/auth/confirm-2fa  — verify first TOTP code and enable
router.post('/confirm-2fa', authMiddleware, (req, res) => {
  const { token } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user.totp_secret) return res.status(400).json({ error: 'Run setup-2fa first' });

  const valid = speakeasy.totp.verify({
    secret: user.totp_secret,
    encoding: 'base32',
    token: String(token),
    window: 1,
  });
  if (!valid) return res.status(400).json({ error: 'Invalid code' });

  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

// POST /api/auth/disable-2fa
router.post('/disable-2fa', authMiddleware, (req, res) => {
  const { password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Wrong password' });

  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password))
    return res.status(401).json({ error: 'Current password incorrect' });

  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
