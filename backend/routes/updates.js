// APT package update management
const router = require('express').Router();
const { exec } = require('child_process');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware, requireRole('admin'));

let upgradeLog = [];
let upgradeRunning = false;

function runStream(cmd, onData, onEnd) {
  const child = exec(cmd, { encoding: 'utf8' });
  child.stdout.on('data', d => onData(d));
  child.stderr.on('data', d => onData(d));
  child.on('close', code => onEnd(code));
  return child;
}

function runAsync(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: 'utf8', timeout: 120000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

// GET /api/updates/check  — run apt-get update + list upgradeable
router.get('/check', async (_req, res) => {
  try {
    await runAsync('sudo apt-get update -qq');
    const out = await runAsync('sudo apt list --upgradable 2>/dev/null');
    const packages = out
      .split('\n')
      .filter(l => l.includes('/'))
      .map(l => {
        const [nameArch, rest] = l.split(' ', 2);
        const [name] = nameArch.split('/');
        return { name, info: l };
      });
    res.json({ count: packages.length, packages });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/updates/status  — is upgrade running?
router.get('/status', (_req, res) => {
  res.json({ running: upgradeRunning, log: upgradeLog.slice(-200) });
});

// POST /api/updates/upgrade  — run apt-get upgrade
router.post('/upgrade', (req, res) => {
  if (upgradeRunning)
    return res.status(409).json({ error: 'Upgrade already in progress' });

  upgradeRunning = true;
  upgradeLog = ['[ServerDash] Starting apt-get upgrade...\n'];

  const env = { ...process.env, DEBIAN_FRONTEND: 'noninteractive' };
  const child = exec(
    'sudo apt-get upgrade -y',
    { encoding: 'utf8', env },
  );

  child.stdout.on('data', d => upgradeLog.push(d));
  child.stderr.on('data', d => upgradeLog.push(d));
  child.on('close', code => {
    upgradeRunning = false;
    upgradeLog.push(`\n[ServerDash] Finished with exit code ${code}\n`);
  });

  res.json({ ok: true, message: 'Upgrade started — poll /api/updates/status for progress' });
});

// POST /api/updates/dist-upgrade  — full dist-upgrade
router.post('/dist-upgrade', (req, res) => {
  if (upgradeRunning)
    return res.status(409).json({ error: 'Upgrade already in progress' });

  upgradeRunning = true;
  upgradeLog = ['[ServerDash] Starting full dist-upgrade...\n'];

  const env = { ...process.env, DEBIAN_FRONTEND: 'noninteractive' };
  const child = exec('sudo apt-get dist-upgrade -y', { encoding: 'utf8', env });

  child.stdout.on('data', d => upgradeLog.push(d));
  child.stderr.on('data', d => upgradeLog.push(d));
  child.on('close', code => {
    upgradeRunning = false;
    upgradeLog.push(`\n[ServerDash] Finished with exit code ${code}\n`);
  });

  res.json({ ok: true, message: 'Dist-upgrade started' });
});

// POST /api/updates/autoremove  — apt autoremove
router.post('/autoremove', async (_req, res) => {
  try {
    const out = await runAsync('sudo apt-get autoremove -y');
    res.json({ ok: true, output: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/updates/history  — last 50 apt log entries
router.get('/history', async (_req, res) => {
  try {
    const out = await runAsync('tail -n 100 /var/log/apt/history.log 2>/dev/null || echo "No apt history found"');
    res.json({ log: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/updates/reboot  — schedule a system reboot (admin only)
router.post('/reboot', async (_req, res) => {
  try {
    // Schedule reboot in 1 second so the response can be sent first
    exec('sudo /sbin/shutdown -r +0', { encoding: 'utf8' });
    res.json({ ok: true, message: 'System reboot initiated. The server will reboot momentarily.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
