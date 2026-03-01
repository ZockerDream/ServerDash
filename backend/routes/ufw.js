// UFW Firewall management (admin only)
const router = require('express').Router();
const { exec } = require('child_process');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware, requireRole('admin'));

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: 'utf8', timeout: 15000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

// Parse "ufw status numbered" output into structured rules (active UFW)
function parseRules(output) {
  const rules = [];
  const lines = output.split('\n');
  for (const line of lines) {
    // Matches lines like: [ 1] 22/tcp   ALLOW IN   Anywhere    # SSH
    const m = line.match(/^\[\s*(\d+)\]\s+(.+?)\s{2,}(ALLOW|DENY|REJECT|LIMIT)\s+(IN|OUT|FWD)?\s*(.*)/i);
    if (m) {
      const fromAndComment = (m[5] || 'Anywhere').trim() || 'Anywhere';
      // comment is appended after from: "Anywhere                   # SSH"
      const commentMatch = fromAndComment.match(/^(.*?)\s+#\s+(.*)$/);
      rules.push({
        num: parseInt(m[1], 10),
        to: m[2].trim(),
        action: m[3].trim().toUpperCase(),
        direction: (m[4] || 'IN').trim().toUpperCase(),
        from: commentMatch ? commentMatch[1].trim() || 'Anywhere' : fromAndComment,
        comment: commentMatch ? commentMatch[2].trim() : '',
        pending: false,
        raw: line.trim(),
      });
    }
  }
  return rules;
}

// Parse "ufw show added" output — works even when UFW is inactive
async function getAddedRules() {
  const out = await run('sudo ufw show added 2>&1');
  const rules = [];
  let num = 1;
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('ufw ')) continue;
    const actionMatch = trimmed.match(/^ufw\s+(allow|deny|reject|limit)\s+(.+)/i);
    if (!actionMatch) continue;
    const action = actionMatch[1].toUpperCase();
    let rest = actionMatch[2].trim();
    // Extract comment
    const commentMatch = rest.match(/comment\s+'([^']*)'/i);
    const comment = commentMatch ? commentMatch[1] : '';
    rest = rest.replace(/comment\s+'[^']*'/gi, '').trim();
    // Extract from/port or just port
    let from = 'Anywhere';
    let to = rest;
    const fromMatch = rest.match(/from\s+(\S+)\s+to\s+any\s+port\s+(\S+)/i);
    if (fromMatch) {
      from = fromMatch[1];
      to = fromMatch[2];
    }
    // ruleSpec is used for deletion when UFW is inactive: e.g. "allow 22/tcp"
    const ruleSpec = `${actionMatch[1]} ${rest}`;
    rules.push({ num: num++, to, action, direction: 'IN', from, comment, pending: true, ruleSpec, raw: trimmed });
  }
  return rules;
}

// GET /api/ufw/status
router.get('/status', async (_req, res) => {
  try {
    const statusOut = await run('sudo ufw status verbose 2>&1');
    const enabled = /Status:\s*active/i.test(statusOut);

    let rules;
    if (enabled) {
      const numberedOut = await run('sudo ufw status numbered 2>&1');
      rules = parseRules(numberedOut);
    } else {
      // UFW inactive — show rules stored via ufw show added
      rules = await getAddedRules();
    }

    // Extract default policies
    const defaultIn  = (statusOut.match(/Default:\s*(\w+)\s*\(incoming\)/i) || [])[1] || 'deny';
    const defaultOut = (statusOut.match(/Default:\s*\w+\s*\(incoming\),\s*(\w+)\s*\(outgoing\)/i) || [])[1] || 'allow';

    res.json({ enabled, defaultIn, defaultOut, rules, raw: statusOut });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ufw/enable
router.post('/enable', async (_req, res) => {
  try {
    await run('echo "y" | sudo ufw enable');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ufw/disable
router.post('/disable', async (_req, res) => {
  try {
    await run('sudo ufw disable');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ufw/rule  — add a rule
// body: { action: 'allow'|'deny'|'reject'|'limit', port, proto, from, comment }
router.post('/rule', async (req, res) => {
  const { action, port, proto, from, comment } = req.body;
  if (!action || !port) return res.status(400).json({ error: 'action and port are required' });
  if (!['allow', 'deny', 'reject', 'limit'].includes(action))
    return res.status(400).json({ error: 'action must be allow, deny, reject, or limit' });

  // Basic sanitisation — only allow alphanumeric, slashes, colons, dashes, dots
  const safePort = String(port).replace(/[^a-zA-Z0-9:/_-]/g, '');
  const safeProto = proto && ['tcp', 'udp'].includes(proto) ? `/${proto}` : '';
  const safeFrom = from && /^[\w.:/\[\]-]+$/.test(from) ? from : null;
  const safeComment = comment ? comment.replace(/['"]/g, '').slice(0, 60) : null;

  try {
    let cmd;
    if (safeFrom) {
      cmd = `sudo ufw ${action} from '${safeFrom}' to any port ${safePort}${safeProto}`;
    } else {
      cmd = `sudo ufw ${action} ${safePort}${safeProto}`;
    }
    if (safeComment) cmd += ` comment '${safeComment}'`;
    await run(cmd);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/ufw/rule/:num  — delete rule by number (UFW must be active)
router.delete('/rule/:num', async (req, res) => {
  const num = parseInt(req.params.num, 10);
  if (!num || num < 1) return res.status(400).json({ error: 'Invalid rule number' });
  try {
    await run(`echo "y" | sudo ufw delete ${num}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/ufw/rule-spec  — delete rule by spec string (works when UFW is inactive)
// body: { spec: 'allow 22/tcp' }
router.delete('/rule-spec', async (req, res) => {
  const { spec } = req.body;
  if (!spec || typeof spec !== 'string') return res.status(400).json({ error: 'spec is required' });
  // Only allow safe characters
  if (!/^[a-zA-Z0-9\/:.\-_ ]+$/.test(spec))
    return res.status(400).json({ error: 'Invalid spec characters' });
  try {
    await run(`echo "y" | sudo ufw delete ${spec}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ufw/reload
router.post('/reload', async (_req, res) => {
  try {
    await run('sudo ufw reload');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/ufw/rule  — edit rule: delete old, add new
// body: { oldNum?, oldSpec?, action, port, proto, from, comment }
router.put('/rule', async (req, res) => {
  const { oldNum, oldSpec, action, port, proto, from, comment } = req.body;
  if (!action || !port) return res.status(400).json({ error: 'action and port are required' });
  if (!['allow', 'deny', 'reject', 'limit'].includes(action))
    return res.status(400).json({ error: 'Invalid action' });

  const safePort    = String(port).replace(/[^a-zA-Z0-9:/_-]/g, '');
  const safeProto   = proto && ['tcp', 'udp'].includes(proto) ? `/${proto}` : '';
  const safeFrom    = from && /^[\w.:/\[\]-]+$/.test(from) ? from : null;
  const safeComment = comment ? comment.replace(/['"]/g, '').slice(0, 60) : null;

  try {
    // Step 1: delete old rule
    if (oldNum && Number.isInteger(Number(oldNum))) {
      await run(`echo "y" | sudo ufw delete ${Number(oldNum)}`);
    } else if (oldSpec && /^[a-zA-Z0-9\/:.\-_ ]+$/.test(oldSpec)) {
      await run(`echo "y" | sudo ufw delete ${oldSpec}`);
    } else {
      return res.status(400).json({ error: 'oldNum or oldSpec required' });
    }

    // Step 2: add new rule
    let cmd = safeFrom
      ? `sudo ufw ${action} from '${safeFrom}' to any port ${safePort}${safeProto}`
      : `sudo ufw ${action} ${safePort}${safeProto}`;
    if (safeComment) cmd += ` comment '${safeComment}'`;
    await run(cmd);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
