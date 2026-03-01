import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal as TerminalIcon, Wifi, WifiOff, Loader, X, KeyRound, LockKeyhole } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import api from '../api.js';

export default function TerminalPage() {
  const terminalRef = useRef(null);  // DOM container
  const xtermRef = useRef(null);     // xterm.js Terminal instance
  const fitAddonRef = useRef(null);  // FitAddon
  const wsRef = useRef(null);        // WebSocket

  const [status, setStatus] = useState('idle'); // idle | connecting | connected | error | closed
  const [errorMsg, setErrorMsg] = useState('');
  const [form, setForm] = useState({
    username: localStorage.getItem('ssh_last_username') || '',
    password: '',
    port: '22',
  });
  const [authMethod, setAuthMethod] = useState('password'); // 'password' | 'sshkey'
  const [hasStoredKey, setHasStoredKey] = useState(false);

  // Check if the current user has a stored SSH key
  useEffect(() => {
    api.get('/auth/ssh-key')
      .then(({ data }) => {
        setHasStoredKey(data.stored);
        if (data.stored) setAuthMethod('sshkey');
      })
      .catch(() => {});
  }, []);

  // ── Init xterm once ──────────────────────────────────────────────────────────
  useEffect(() => {
    const term = new Terminal({
      theme: {
        background: '#0a0a0a',
        foreground: '#d4d4d4',
        cursor: '#22c55e',
        selectionBackground: '#4a4a4a',
      },
      fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
      fontSize: 14,
      lineHeight: 1.3,
      cursorBlink: true,
      scrollback: 1000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln('\x1b[32m╔══════════════════════════════════════╗\x1b[0m');
    term.writeln('\x1b[32m║  ServerDash SSH Terminal              ║\x1b[0m');
    term.writeln('\x1b[32m╚══════════════════════════════════════╝\x1b[0m');
    term.writeln('');
    term.writeln('\x1b[90mEnter SSH credentials above and click Connect.\x1b[0m');

    // Resize observer
    const ro = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
    });
    if (terminalRef.current) ro.observe(terminalRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
      if (wsRef.current) wsRef.current.close();
    };
  }, []); // eslint-disable-line

  const sendResize = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && xtermRef.current) {
      const term = xtermRef.current;
      wsRef.current.send(JSON.stringify({
        type: 'resize',
        cols: term.cols,
        rows: term.rows,
      }));
    }
  }, []);

  const handleConnect = () => {
    if (!form.username) return;
    if (authMethod === 'password' && !form.password) return;

    localStorage.setItem('ssh_last_username', form.username);
    setStatus('connecting');
    setErrorMsg('');

    const token = localStorage.getItem('token');
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${proto}://${window.location.host}/terminal?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      const term = xtermRef.current;
      ws.send(JSON.stringify({
        type: 'connect',
        username: form.username,
        ...(authMethod === 'password' ? { password: form.password } : { useStoredKey: true }),
        port: parseInt(form.port, 10) || 22,
        cols: term?.cols || 80,
        rows: term?.rows || 24,
      }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'connected') {
          setStatus('connected');
          const term = xtermRef.current;
          term?.clear();
          term?.writeln('\x1b[32mConnected to ' + form.username + '@' + window.location.hostname + '\x1b[0m');
          term?.writeln('');

          // Route keystrokes → server
          term?.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'data', data }));
            }
          });

          // Resize → server
          term?.onResize(({ cols, rows }) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'resize', cols, rows }));
            }
          });

          fitAddonRef.current?.fit();
          sendResize();
        } else if (msg.type === 'data') {
          xtermRef.current?.write(msg.data);
        } else if (msg.type === 'error') {
          setStatus('error');
          setErrorMsg(msg.message);
          xtermRef.current?.writeln('\r\n\x1b[31mError: ' + msg.message + '\x1b[0m');
        } else if (msg.type === 'closed') {
          setStatus('closed');
          xtermRef.current?.writeln('\r\n\x1b[33mConnection closed.\x1b[0m');
        }
      } catch {}
    };

    ws.onerror = () => {
      setStatus('error');
      setErrorMsg('WebSocket connection failed');
    };

    ws.onclose = (e) => {
      if (status === 'connected') {
        setStatus('closed');
      } else if (status !== 'idle') {
        setStatus('closed');
      }
    };
  };

  const handleDisconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('idle');
    const term = xtermRef.current;
    term?.writeln('');
    term?.writeln('\x1b[90mDisconnected. Enter credentials to reconnect.\x1b[0m');
  };

  const statusColors = {
    idle: 'text-gray-400',
    connecting: 'text-yellow-400',
    connected: 'text-green-400',
    error: 'text-red-400',
    closed: 'text-gray-400',
  };

  const statusLabels = {
    idle: 'Not connected',
    connecting: 'Connecting…',
    connected: 'Connected',
    error: 'Error',
    closed: 'Disconnected',
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] gap-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 shrink-0">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <TerminalIcon size={22} />
          SSH Terminal
        </h1>

        {/* Status indicator */}
        <div className={`flex items-center gap-1.5 text-sm ${statusColors[status]}`}>
          {status === 'connecting' ? (
            <Loader size={14} className="animate-spin" />
          ) : status === 'connected' ? (
            <Wifi size={14} />
          ) : (
            <WifiOff size={14} />
          )}
          {statusLabels[status]}
        </div>
      </div>

      {/* Credentials bar */}
      {status !== 'connected' && (
        <div className="card flex items-end gap-3 flex-wrap shrink-0">
          {/* Auth method toggle */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">Auth method</label>
            <div className="flex rounded-lg overflow-hidden border border-gray-700 text-sm">
              <button
                onClick={() => setAuthMethod('password')}
                className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                  authMethod === 'password' ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                <LockKeyhole size={13} /> Password
              </button>
              <button
                onClick={() => setAuthMethod('sshkey')}
                className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                  authMethod === 'sshkey' ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                } ${!hasStoredKey ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!hasStoredKey}
                title={!hasStoredKey ? 'No SSH key stored — add one in Settings' : 'Use your stored SSH key'}
              >
                <KeyRound size={13} /> SSH Key
                {!hasStoredKey && <span className="text-xs opacity-60">(none)</span>}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">SSH Username</label>
            <input
              type="text"
              placeholder="e.g. root"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              className="input text-sm w-40"
              disabled={status === 'connecting'}
            />
          </div>
          {authMethod === 'password' && (
            <div className="flex flex-col gap-1 min-w-0">
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">SSH Password</label>
              <input
                type="password"
                placeholder="Password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="input text-sm w-40"
                disabled={status === 'connecting'}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">Port</label>
            <input
              type="number"
              value={form.port}
              onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
              className="input text-sm w-20"
              disabled={status === 'connecting'}
            />
          </div>
          <button
            onClick={handleConnect}
            className="btn-primary text-sm py-2"
            disabled={status === 'connecting' || !form.username || (authMethod === 'password' && !form.password)}
          >
            {status === 'connecting' ? (
              <span className="flex items-center gap-2"><Loader size={14} className="animate-spin" /> Connecting…</span>
            ) : 'Connect'}
          </button>
          {errorMsg && (
            <p className="text-red-400 text-sm">{errorMsg}</p>
          )}
        </div>
      )}

      {/* Disconnect button when connected */}
      {status === 'connected' && (
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm text-gray-400">
            Connected as <span className="text-white font-mono">{form.username}</span>
          </span>
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition-colors"
          >
            <X size={13} /> Disconnect
          </button>
        </div>
      )}

      {/* xterm container */}
      <div
        ref={terminalRef}
        className="flex-1 rounded-xl overflow-hidden border border-gray-800"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
