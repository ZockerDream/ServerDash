// WebSocket SSH Terminal handler
// Validates JWT from query param, then bridges WebSocket ↔ SSH shell on localhost
const jwt = require('jsonwebtoken');
const { Client } = require('ssh2');
const url = require('url');
const db = require('../db/database');
const { decrypt } = require('../utils/sshKeyCrypto');

/**
 * Called for every incoming WebSocket connection on the /terminal path.
 * Protocol (JSON messages both ways):
 *
 *  Client → Server:
 *    { type: 'connect',  username: string, password: string, port?: number }
 *    { type: 'data',     data: string }        – keystrokes / paste
 *    { type: 'resize',   cols: number, rows: number }
 *
 *  Server → Client:
 *    { type: 'connected' }
 *    { type: 'data',  data: string }             – terminal output
 *    { type: 'error', message: string }
 *    { type: 'closed' }
 */
function createTerminalHandler(ws, request) {
  // ── 1. Authenticate via JWT in query string ─────────────────────────────────
  const query = url.parse(request.url, true).query;
  const token = query.token;

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
    ws.close(1008, 'Unauthorized');
    return;
  }

  if (!['admin', 'operator'].includes(decoded.role)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Insufficient role' }));
    ws.close(1008, 'Forbidden');
    return;
  }

  // ── 2. Wait for the first 'connect' message with SSH credentials ────────────
  ws.once('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      ws.close();
      return;
    }

    if (msg.type !== 'connect' || !msg.username) {
      ws.send(JSON.stringify({ type: 'error', message: 'Expected connect message with username' }));
      ws.close();
      return;
    }

    if (!msg.password && !msg.useStoredKey) {
      ws.send(JSON.stringify({ type: 'error', message: 'Provide a password or use a stored SSH key' }));
      ws.close();
      return;
    }

    // ── 3. Resolve auth method ──────────────────────────────────────────────────
    let sshAuth = {};
    if (msg.useStoredKey) {
      const row = db.prepare('SELECT ssh_key FROM users WHERE id = ?').get(decoded.sub);
      if (!row || !row.ssh_key) {
        ws.send(JSON.stringify({ type: 'error', message: 'No SSH key stored for your account. Please add one in Settings.' }));
        ws.close();
        return;
      }
      try {
        const privateKey = decrypt(row.ssh_key);
        sshAuth = { privateKey };
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Failed to decrypt stored SSH key' }));
        ws.close();
        return;
      }
    } else {
      sshAuth = { password: msg.password };
    }

    // ── 4. Open SSH connection ──────────────────────────────────────────────────
    const conn = new Client();

    conn.on('ready', () => {
      ws.send(JSON.stringify({ type: 'connected' }));

      conn.shell({ term: 'xterm-256color', cols: msg.cols || 80, rows: msg.rows || 24 }, (err, stream) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Shell error: ' + err.message }));
          conn.end();
          ws.close();
          return;
        }

        // Server → Client: SSH output
        stream.on('data', (chunk) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'data', data: chunk.toString('utf8') }));
          }
        });

        stream.stderr.on('data', (chunk) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'data', data: chunk.toString('utf8') }));
          }
        });

        stream.on('close', () => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'closed' }));
            ws.close();
          }
          conn.end();
        });

        // Client → Server: keystrokes and resize
        ws.on('message', (raw) => {
          try {
            const m = JSON.parse(raw);
            if (m.type === 'data') {
              stream.write(m.data);
            } else if (m.type === 'resize') {
              stream.setWindow(m.rows || 24, m.cols || 80, 0, 0);
            }
          } catch {}
        });

        ws.on('close', () => {
          try { stream.end(); } catch {}
          try { conn.end(); } catch {}
        });
      });
    });

    conn.on('error', (err) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'error', message: 'SSH connection failed: ' + err.message }));
        ws.close();
      }
    });

    conn.connect({
      host: msg.host || '127.0.0.1',
      port: msg.port || 22,
      username: msg.username,
      ...sshAuth,
      readyTimeout: 10000,
    });
  });

  ws.on('error', () => { /* suppress */ });
}

module.exports = { createTerminalHandler };
