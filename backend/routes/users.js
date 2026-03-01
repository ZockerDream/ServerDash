// Webapp user management (admin only)
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/users
router.get('/', requireRole('admin'), (req, res) => {
  const users = db.prepare(`
    SELECT id, username, email, role, totp_enabled, created_at, last_login
    FROM users ORDER BY id
  `).all();
  res.json(users);
});

// POST /api/users
router.post('/', requireRole('admin'), (req, res) => {
  const { username, password, email, role } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'username and password required' });
  if (!['admin', 'operator', 'viewer'].includes(role))
    return res.status(400).json({ error: 'role must be admin, operator, or viewer' });

  const hash = bcrypt.hashSync(password, 12);
  try {
    const info = db.prepare(`
      INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)
    `).run(username, hash, email || null, role);
    res.status(201).json({ id: info.lastInsertRowid, username, email, role });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
    throw e;
  }
});

// PUT /api/users/:id
router.put('/:id', requireRole('admin'), (req, res) => {
  const { email, role, password } = req.body;
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (role && !['admin', 'operator', 'viewer'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });

  if (password && password.length >= 8) {
    const hash = bcrypt.hashSync(password, 12);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
  }

  db.prepare(`
    UPDATE users SET
      email = COALESCE(?, email),
      role  = COALESCE(?, role)
    WHERE id = ?
  `).run(email || null, role || null, req.params.id);

  res.json({ ok: true });
});

// DELETE /api/users/:id/2fa  — admin resets another user's TOTP
router.delete('/:id/2fa', requireRole('admin'), (req, res) => {
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true, message: `2FA reset for ${user.username}` });
});

// DELETE /api/users/:id
router.delete('/:id', requireRole('admin'), (req, res) => {
  if (Number(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'Cannot delete yourself' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// GET /api/users/audit-log
router.get('/audit-log', requireRole('admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM audit_log ORDER BY id DESC LIMIT 200
  `).all();
  res.json(rows);
});

module.exports = router;
