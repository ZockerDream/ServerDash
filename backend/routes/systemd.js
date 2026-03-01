// Systemd service management (admin + operator)
const router = require('express').Router();
const { exec } = require('child_process');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware, requireRole('admin', 'operator'));

function run(cmd, timeout = 15000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: 'utf8', timeout }, (err, stdout, stderr) => {
      if (err && !stdout) return reject(new Error(stderr || err.message));
      resolve((stdout || '').trim());
    });
  });
}

function safeUnit(name) {
  // Allow only safe unit name characters, enforce .service suffix
  const clean = name.replace(/[^a-zA-Z0-9._@:-]/g, '');
  return clean.endsWith('.service') ? clean : clean + '.service';
}

// GET /api/systemd/services  — list all services
router.get('/services', async (_req, res) => {
  try {
    // --all includes inactive/dead; output: UNIT LOAD ACTIVE SUB DESCRIPTION
    const out = await run(
      'systemctl list-units --type=service --all --no-pager --plain --no-legend 2>/dev/null',
    );

    const services = out
      .split('\n')
      .filter(Boolean)
      .map(line => {
        // Handle "●" marker prefix that systemctl sometimes adds
        const clean = line.replace(/^[●\s]+/, '').trim();
        const parts = clean.split(/\s+/);
        const unit        = parts[0] || '';
        const load        = parts[1] || '';
        const active      = parts[2] || '';
        const sub         = parts[3] || '';
        const description = parts.slice(4).join(' ');
        return { unit, load, active, sub, description };
      })
      .filter(s => s.unit.endsWith('.service'));

    // Also get enabled/disabled status via is-enabled in bulk
    // Use systemctl is-enabled for all units at once (faster than looping)
    let enabledMap = {};
    try {
      const names = services.map(s => s.unit).join(' ');
      const enabledOut = await run(
        `systemctl is-enabled ${names} 2>/dev/null || true`,
        20000,
      );
      const results = enabledOut.trim().split('\n');
      services.forEach((s, i) => {
        enabledMap[s.unit] = results[i] ? results[i].trim() : 'unknown';
      });
    } catch {}

    const enriched = services.map(s => ({
      ...s,
      enabled: enabledMap[s.unit] || 'unknown',
    }));

    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/systemd/service/:name/status
router.get('/service/:name/status', async (req, res) => {
  const unit = safeUnit(req.params.name);
  try {
    const out = await run(`systemctl status '${unit}' --no-pager -l 2>&1 || true`);
    const isActive  = /Active:\s+active/i.test(out);
    const isEnabled = /;\s+(enabled|enabled-runtime)/i.test(out);
    res.json({ unit, active: isActive, enabled: isEnabled, raw: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/systemd/service/:name/logs?lines=100
router.get('/service/:name/logs', async (req, res) => {
  const unit  = safeUnit(req.params.name);
  const lines = Math.min(parseInt(req.query.lines, 10) || 100, 1000);
  try {
    const out = await run(
      `sudo journalctl -u '${unit}' -n ${lines} --no-pager -q 2>/dev/null`,
      15000,
    );
    res.json({ lines: out ? out.split('\n') : [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/systemd/service/:name/:action  — start|stop|restart|enable|disable|reload
router.post('/service/:name/:action', requireRole('admin'), async (req, res) => {
  const unit   = safeUnit(req.params.name);
  const action = req.params.action;
  const allowed = ['start', 'stop', 'restart', 'enable', 'disable', 'reload'];
  if (!allowed.includes(action))
    return res.status(400).json({ error: `Action must be one of: ${allowed.join(', ')}` });

  try {
    const sudo = ['start', 'stop', 'restart', 'enable', 'disable', 'reload'].includes(action) ? 'sudo ' : '';
    await run(`${sudo}systemctl ${action} '${unit}'`);
    res.json({ ok: true, unit, action });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
