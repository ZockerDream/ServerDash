// System log viewer (admin + operator)
const router = require('express').Router();
const { exec } = require('child_process');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware, requireRole('admin', 'operator'));

function run(cmd, timeout = 15000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: 'utf8', timeout, maxBuffer: 1024 * 512 }, (err, stdout, stderr) => {
      // stdout may still have content even on non-zero exit (journalctl -u unknown returns 0 anyway)
      if (err && !stdout) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

const SOURCES = [
  { id: 'syslog',   label: 'Syslog',        cmd: (n) => `sudo tail -n ${n} /var/log/syslog 2>/dev/null || journalctl -n ${n} --no-pager -q` },
  { id: 'auth',     label: 'Auth',           cmd: (n) => `sudo tail -n ${n} /var/log/auth.log 2>/dev/null` },
  { id: 'kernel',   label: 'Kernel (dmesg)', cmd: (n) => `sudo dmesg --color=never -T 2>/dev/null | tail -n ${n}` },
  { id: 'journal',  label: 'Journal',        cmd: (n) => `sudo journalctl -n ${n} --no-pager -q 2>/dev/null` },
  { id: 'apt',      label: 'APT History',    cmd: (n) => `sudo tail -n ${n} /var/log/apt/history.log 2>/dev/null` },
  { id: 'nginx',    label: 'Nginx Error',    cmd: (n) => `sudo tail -n ${n} /var/log/nginx/error.log 2>/dev/null` },
  { id: 'dpkg',     label: 'dpkg',           cmd: (n) => `sudo tail -n ${n} /var/log/dpkg.log 2>/dev/null` },
];

// GET /api/logs/sources
router.get('/sources', (_req, res) => {
  res.json(SOURCES.map(({ id, label }) => ({ id, label })));
});

// GET /api/logs/service-units  — list available systemd units for journal filtering
router.get('/service-units', async (_req, res) => {
  try {
    const out = await run('systemctl list-units --type=service --all --no-pager --plain --no-legend 2>/dev/null');
    const units = out.split('\n')
      .map(l => l.trim().split(/\s+/)[0])
      .filter(u => u && u.endsWith('.service'))
      .sort();
    res.json(units);
  } catch {
    res.json([]);
  }
});

// GET /api/logs/read?source=syslog&lines=200&filter=<string>&service=<unit>
router.get('/read', async (req, res) => {
  const lines = Math.min(parseInt(req.query.lines, 10) || 200, 2000);
  const filter = req.query.filter ? String(req.query.filter).replace(/['"\\]/g, '') : '';
  const service = req.query.service ? String(req.query.service).replace(/[^a-zA-Z0-9._@:-]/g, '') : '';

  let cmd;

  if (service) {
    // journalctl for a specific systemd unit
    cmd = `sudo journalctl -u '${service}' -n ${lines} --no-pager -q 2>/dev/null`;
  } else {
    const source = SOURCES.find(s => s.id === req.query.source) || SOURCES[0];
    cmd = source.cmd(lines);
  }

  if (filter) {
    cmd += ` | grep -i '${filter}' || true`;
  }

  try {
    const out = await run(cmd, 20000);
    res.json({ lines: out ? out.split('\n') : [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
