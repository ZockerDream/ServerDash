require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { WebSocketServer } = require('ws');

// Force DB init early (creates tables + seeds admin)
require('./db/database');

const { createTerminalHandler } = require('./routes/terminal');

const app = express();

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please try again later' },
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/system-users', require('./routes/systemUsers'));
app.use('/api/docker', require('./routes/docker'));
app.use('/api/cron', require('./routes/cron'));
app.use('/api/updates', require('./routes/updates'));
app.use('/api/monitoring', require('./routes/monitoring'));
app.use('/api/fs', require('./routes/fs'));
app.use('/api/ufw', require('./routes/ufw'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/systemd', require('./routes/systemd'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ─── Serve React build in production ─────────────────────────────────────────
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
const fs = require('fs');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.json({ message: 'ServerDash API running. Build the frontend for the UI.' }));
}

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ─── HTTP server + WebSocket upgrade ─────────────────────────────────────────
const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  if (request.url && request.url.startsWith('/terminal')) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      createTerminalHandler(ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 ServerDash API running on http://0.0.0.0:${PORT}`);
  console.log(`   WebSocket terminal at ws://0.0.0.0:${PORT}/terminal`);
  console.log(`   Serving frontend from: ${frontendDist}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
