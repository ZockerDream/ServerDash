// Docker management via dockerode
const router = require('express').Router();
const Docker = require('dockerode');
const { authMiddleware, requireRole } = require('../middleware/auth');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

router.use(authMiddleware);

// ─── Containers ───────────────────────────────────────────────────────────────

// GET /api/docker/containers
router.get('/containers', async (_req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    res.json(containers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/docker/containers/:id
router.get('/containers/:id', async (req, res) => {
  try {
    const info = await docker.getContainer(req.params.id).inspect();
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/docker/containers/:id/start
router.post('/containers/:id/start', requireRole('admin', 'operator'), async (req, res) => {
  try {
    await docker.getContainer(req.params.id).start();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/docker/containers/:id/stop
router.post('/containers/:id/stop', requireRole('admin', 'operator'), async (req, res) => {
  try {
    await docker.getContainer(req.params.id).stop();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/docker/containers/:id/restart
router.post('/containers/:id/restart', requireRole('admin', 'operator'), async (req, res) => {
  try {
    await docker.getContainer(req.params.id).restart();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/docker/containers/:id
router.delete('/containers/:id', requireRole('admin'), async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.remove({ force: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/docker/containers/:id/logs
router.get('/containers/:id/logs', requireRole('admin', 'operator'), async (req, res) => {
  try {
    const tail = req.query.tail || '100';
    const logs = await docker.getContainer(req.params.id).logs({
      stdout: true,
      stderr: true,
      tail: Number(tail),
      timestamps: true,
    });
    // logs is a Buffer with Docker multiplexed stream, decode to string
    res.type('text').send(logs.toString('utf8'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/docker/containers/:id/stats
router.get('/containers/:id/stats', requireRole('admin', 'operator'), async (req, res) => {
  try {
    const stats = await docker.getContainer(req.params.id).stats({ stream: false });
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Images ───────────────────────────────────────────────────────────────────

// GET /api/docker/images
router.get('/images', async (_req, res) => {
  try {
    const images = await docker.listImages({ all: false });
    res.json(images);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/docker/images/:id
router.delete('/images/:id', requireRole('admin'), async (req, res) => {
  try {
    await docker.getImage(req.params.id).remove({ force: req.query.force === 'true' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Networks ─────────────────────────────────────────────────────────────────

// GET /api/docker/networks
router.get('/networks', async (_req, res) => {
  try {
    const networks = await docker.listNetworks();
    res.json(networks);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Volumes ──────────────────────────────────────────────────────────────────

// GET /api/docker/volumes
router.get('/volumes', async (_req, res) => {
  try {
    const data = await docker.listVolumes();
    res.json(data.Volumes || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── System info ──────────────────────────────────────────────────────────────

// GET /api/docker/info
router.get('/info', async (_req, res) => {
  try {
    const info = await docker.info();
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
