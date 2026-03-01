const jwt = require('jsonwebtoken');
const db = require('../db/database');

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(payload.sub);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

function audit(action, details) {
  return (req, _res, next) => {
    try {
      const db2 = require('../db/database');
      db2.prepare(`
        INSERT INTO audit_log (user_id, username, action, details, ip)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        req.user?.id || null,
        req.user?.username || 'anonymous',
        action,
        typeof details === 'function' ? details(req) : details,
        req.ip
      );
    } catch (_) { /* non-blocking */ }
    next();
  };
}

module.exports = { authMiddleware, requireRole, audit };
