// Cron job management — reads/writes crontabs via crontab command
const router = require('express').Router();
const { execSync, exec } = require('child_process');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const os = require('os');

router.use(authMiddleware, requireRole('admin', 'operator'));

function runAsync(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: 'utf8', timeout: 15000, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

function parseCrontab(raw) {
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      // Special syntax: @reboot, @hourly etc.
      const specialMatch = l.match(/^(@\w+)\s+(.+)$/);
      if (specialMatch) {
        return {
          id: uuidv4(),
          schedule: specialMatch[1],
          command: specialMatch[2],
          raw: l,
          isSpecial: true,
        };
      }
      const parts = l.split(/\s+/);
      if (parts.length < 6) return null;
      const schedule = parts.slice(0, 5).join(' ');
      const command = parts.slice(5).join(' ');
      return { id: uuidv4(), schedule, command, raw: l, isSpecial: false };
    })
    .filter(Boolean);
}

async function getCrontab(user) {
  try {
    const raw = user
      ? await runAsync(`sudo crontab -l -u ${user}`)
      : await runAsync('sudo crontab -l -u root');
    return raw;
  } catch {
    return '';
  }
}

async function setCrontab(lines, user) {
  const tmpFile = path.join(os.tmpdir(), `crontab_${Date.now()}.tmp`);
  fs.writeFileSync(tmpFile, lines.join('\n') + '\n', 'utf8');
  try {
    const cmd = user ? `sudo crontab -u ${user} ${tmpFile}` : `sudo crontab -u root ${tmpFile}`;
    await runAsync(cmd);
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

// GET /api/cron?user=root
router.get('/', async (req, res) => {
  const user = req.query.user || null;
  try {
    const raw = await getCrontab(user);
    const jobs = parseCrontab(raw);
    res.json({ user: user || 'current', jobs, raw });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cron/users  — list users that have crontabs
router.get('/users', async (_req, res) => {
  try {
    const out = execSync('ls /var/spool/cron/crontabs 2>/dev/null || true', { encoding: 'utf8' });
    const users = out.trim().split('\n').filter(Boolean);
    res.json(users);
  } catch (e) {
    res.json([]);
  }
});

// POST /api/cron  — add a new job
router.post('/', async (req, res) => {
  const { schedule, command, user } = req.body;
  if (!schedule || !command)
    return res.status(400).json({ error: 'schedule and command required' });

  try {
    const raw = await getCrontab(user);
    const lines = raw.split('\n').filter(l => l.trim());
    lines.push(`${schedule} ${command}`);
    await setCrontab(lines, user);
    res.status(201).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/cron/:index  — update job by line index
router.put('/:index', async (req, res) => {
  const { schedule, command, user } = req.body;
  const idx = Number(req.params.index);
  if (!schedule || !command)
    return res.status(400).json({ error: 'schedule and command required' });

  try {
    const raw = await getCrontab(user);
    const lines = raw.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    if (idx < 0 || idx >= lines.length)
      return res.status(404).json({ error: 'Job index out of range' });
    lines[idx] = `${schedule} ${command}`;
    await setCrontab(lines, user);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/cron/:index
router.delete('/:index', async (req, res) => {
  const idx = Number(req.params.index);
  const user = req.query.user || null;
  try {
    const raw = await getCrontab(user);
    const lines = raw.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    if (idx < 0 || idx >= lines.length)
      return res.status(404).json({ error: 'Job index out of range' });
    lines.splice(idx, 1);
    await setCrontab(lines, user);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
