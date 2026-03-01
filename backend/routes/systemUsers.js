// Ubuntu server user management via shell commands
const router = require('express').Router();
const { execSync, exec } = require('child_process');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware, requireRole('admin', 'operator'));

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', timeout: 10000 }).trim();
}

function runAsync(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: 'utf8', timeout: 30000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

// GET /api/system-users  — list all non-system users + system accounts
router.get('/', (req, res) => {
  try {
    // Parse /etc/passwd: username:x:uid:gid:comment:home:shell
    const lines = run('cat /etc/passwd').split('\n');
    const users = lines
      .map(l => {
        const [username, , uid, gid, comment, home, shell] = l.split(':');
        return { username, uid: Number(uid), gid: Number(gid), comment, home, shell };
      })
      .filter(u => u.uid >= 0); // include all, frontend can filter

    // Get groups
    const groupLines = run('cat /etc/group').split('\n');
    const groupMap = {};
    groupLines.forEach(l => {
      const [name, , gid, members] = l.split(':');
      groupMap[gid] = name;
      (members || '').split(',').filter(Boolean).forEach(m => {
        if (!groupMap[`user_${m}`]) groupMap[`user_${m}`] = [];
        groupMap[`user_${m}`].push(name);
      });
    });

    const enriched = users.map(u => ({
      ...u,
      primaryGroup: groupMap[String(u.gid)] || String(u.gid),
      groups: groupMap[`user_${u.username}`] || [],
      isSystem: u.uid < 1000 || u.shell === '/usr/sbin/nologin' || u.shell === '/bin/false',
    }));

    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/system-users  — create user
router.post('/', requireRole('admin'), async (req, res) => {
  const { username, password, groups, shell, comment, createHome } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'username and password required' });
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(username))
    return res.status(400).json({ error: 'Invalid username format' });

  try {
    const homeFlag = createHome !== false ? '-m' : '-M';
    const shellFlag = shell ? `-s ${shell}` : '-s /bin/bash';
    const commentFlag = comment ? `-c "${comment.replace(/"/g, '')}"` : '';
    await runAsync(`sudo useradd ${homeFlag} ${shellFlag} ${commentFlag} ${username}`);
    await runAsync(`echo "${username}:${password.replace(/'/g, '')}" | sudo chpasswd`);
    if (groups && groups.length > 0) {
      await runAsync(`sudo usermod -aG ${groups.join(',')} ${username}`);
    }
    res.status(201).json({ ok: true, username });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/system-users/:username  — modify user
router.put('/:username', requireRole('admin'), async (req, res) => {
  const { username } = req.params;
  const { password, groups, shell, comment, locked } = req.body;

  try {
    if (password) {
      await runAsync(`echo "${username}:${password.replace(/'/g, '')}" | sudo chpasswd`);
    }
    if (shell) {
      await runAsync(`sudo usermod -s '${shell.replace(/'/g, '')}' '${username}'`);
    }
    if (comment !== undefined) {
      await runAsync(`sudo usermod -c '${comment.replace(/'/g, '')}' '${username}'`);
    }
    if (Array.isArray(groups) && groups.length > 0) {
      const groupStr = groups.map(g => g.trim()).filter(Boolean).join(',');
      await runAsync(`sudo usermod -G '${groupStr}' '${username}'`);
    }
    if (locked === true) {
      await runAsync(`sudo usermod -L '${username}'`);
    } else if (locked === false) {
      await runAsync(`sudo usermod -U '${username}'`);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/system-users/:username
router.delete('/:username', requireRole('admin'), async (req, res) => {
  const { username } = req.params;
  const { removeHome } = req.body;
  if (['root', 'ubuntu'].includes(username))
    return res.status(400).json({ error: 'Cannot delete protected system user' });

  try {
    const flag = removeHome ? '-r' : '';
    await runAsync(`sudo userdel ${flag} ${username}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/system-users/groups
router.get('/groups', (req, res) => {
  try {
    const lines = run('cat /etc/group').split('\n');
    const groups = lines.map(l => {
      const [name, , gid, members] = l.split(':');
      return { name, gid: Number(gid), members: (members || '').split(',').filter(Boolean) };
    });
    res.json(groups);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
