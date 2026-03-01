// Filesystem browser — restricted to /opt and /home subtrees
const router = require('express').Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const fsNode = require('fs');
const path = require('path');

router.use(authMiddleware, requireRole('admin', 'operator'));

const ALLOWED_ROOTS = ['/opt', '/home'];

function isAllowedPath(p) {
  const resolved = path.resolve(p);
  return ALLOWED_ROOTS.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

// GET /api/fs?path=<dir>
router.get('/', async (req, res) => {
  const reqPath = req.query.path || '/';

  // Virtual root: show /opt and /home as top-level entries
  if (reqPath === '/') {
    const entries = await Promise.all(
      ALLOWED_ROOTS.map(async (root) => {
        let modified = null;
        try {
          const stat = await fsNode.promises.stat(root);
          modified = stat.mtime.toISOString();
        } catch {}
        return {
          name: root.slice(1), // 'opt' / 'home'
          fullPath: root,
          type: 'directory',
          size: 0,
          sizeFormatted: '',
          modified,
          permissions: '',
        };
      }),
    );
    return res.json({ path: '/', entries });
  }

  if (!isAllowedPath(reqPath)) {
    return res
      .status(403)
      .json({ error: 'Access denied – path must be under /opt or /home' });
  }

  try {
    const dirents = await fsNode.promises.readdir(reqPath, { withFileTypes: true });

    const entries = await Promise.all(
      dirents.map(async (d) => {
        const fullPath = path.join(reqPath, d.name);
        let size = 0, modified = null, permissions = '';
        try {
          const stat = await fsNode.promises.lstat(fullPath);
          size = stat.size;
          modified = stat.mtime.toISOString();
          // Convert mode bits to octal permissions string
          permissions = (stat.mode & 0o777).toString(8).padStart(3, '0');
        } catch {}
        return {
          name: d.name,
          fullPath,
          type: d.isDirectory() ? 'directory' : d.isSymbolicLink() ? 'symlink' : 'file',
          size,
          sizeFormatted: d.isDirectory() ? '' : formatSize(size),
          modified,
          permissions,
        };
      }),
    );

    // Directories first, then alphabetical within each group
    entries.sort((a, b) => {
      if (a.type !== b.type) {
        if (a.type === 'directory') return -1;
        if (b.type === 'directory') return 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    res.json({ path: reqPath, entries });
  } catch (e) {
    if (e.code === 'ENOENT') return res.status(404).json({ error: 'Path not found' });
    if (e.code === 'EACCES') return res.status(403).json({ error: 'Permission denied' });
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
