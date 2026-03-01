// System monitoring via systeminformation
const router = require('express').Router();
const si = require('systeminformation');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/monitoring/overview  — quick dashboard summary
router.get('/overview', async (_req, res) => {
  try {
    const [cpu, mem, disk, osInfo, uptime, load, network] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.time(),
      si.currentLoad(),
      si.networkStats(),
    ]);

    res.json({
      cpu: {
        load: Math.round(cpu.currentLoad * 10) / 10,
        cores: cpu.cpus?.length || 0,
      },
      memory: {
        total:     mem.total,
        active:    mem.active,   // actually used by processes (excludes cache/buffers)
        used:      mem.used,     // includes cache — kept for reference
        cached:    mem.cached,
        buffered:  mem.buffers,
        free:      mem.free,
        swapTotal: mem.swaptotal,
        swapUsed:  mem.swapused,
        percent: Math.round((mem.active / mem.total) * 100 * 10) / 10,
      },
      disk: disk.map(d => ({
        fs: d.fs,
        mount: d.mount,
        size: d.size,
        used: d.used,
        available: d.available,
        percent: d.use,
      })),
      os: {
        distro: osInfo.distro,
        release: osInfo.release,
        kernel: osInfo.kernel,
        arch: osInfo.arch,
        hostname: osInfo.hostname,
      },
      uptime: uptime.uptime,
      network: network.map(n => ({
        iface: n.iface,
        rx_bytes: n.rx_bytes,
        tx_bytes: n.tx_bytes,
        rx_sec: n.rx_sec,
        tx_sec: n.tx_sec,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/monitoring/cpu
router.get('/cpu', async (_req, res) => {
  try {
    const [info, load, temp] = await Promise.all([
      si.cpu(),
      si.currentLoad(),
      si.cpuTemperature(),
    ]);
    res.json({ info, load, temp });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/monitoring/memory
router.get('/memory', async (_req, res) => {
  try {
    const [mem, layout] = await Promise.all([si.mem(), si.memLayout()]);
    res.json({ mem, layout });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/monitoring/disk
router.get('/disk', async (_req, res) => {
  try {
    const [fs, io] = await Promise.all([si.fsSize(), si.fsStats()]);
    res.json({ fs, io });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/monitoring/network
router.get('/network', async (_req, res) => {
  try {
    const [ifaces, stats, connections] = await Promise.all([
      si.networkInterfaces(),
      si.networkStats(),
      si.networkConnections(),
    ]);
    res.json({ ifaces, stats, connections: connections.slice(0, 50) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/monitoring/processes
router.get('/processes', async (_req, res) => {
  try {
    const data = await si.processes();
    const top = (data.list || [])
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 30);
    res.json({ count: data.all, running: data.running, blocked: data.blocked, list: top });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/monitoring/services
router.get('/services', async (_req, res) => {
  try {
    // Get top running systemd services
    const { exec } = require('child_process');
    const out = await new Promise((resolve) => {
      exec(
        'systemctl list-units --type=service --state=active --no-pager --no-legend 2>/dev/null | head -40',
        { encoding: 'utf8' },
        (_, stdout) => resolve(stdout || '')
      );
    });
    const services = out.trim().split('\n').filter(Boolean).map(l => {
      const parts = l.trim().split(/\s+/);
      return { unit: parts[0], load: parts[1], active: parts[2], sub: parts[3], description: parts.slice(4).join(' ') };
    });
    res.json(services);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
