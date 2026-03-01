import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, Download, Trash2, CheckCircle, AlertCircle, Loader, Power } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../App.jsx';

export default function UpdatesPage() {
  const { user } = useAuth();
  const [packages, setPackages] = useState([]);
  const [checking, setChecking] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [upgradeStatus, setUpgradeStatus] = useState(null); // null | { running, log }
  const [history, setHistory] = useState('');
  const [error, setError] = useState('');
  const [tab, setTab] = useState('available'); // 'available' | 'history'
  const logRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    checkStatus();
    fetchHistory();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [upgradeStatus?.log]);

  const checkStatus = async () => {
    try {
      const { data } = await api.get('/updates/status');
      setUpgradeStatus(data);
      if (data.running) startPolling();
    } catch (_) {}
  };

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get('/updates/status');
        setUpgradeStatus(data);
        if (!data.running) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch (_) {}
    }, 1500);
  };

  const fetchHistory = async () => {
    try {
      const { data } = await api.get('/updates/history');
      setHistory(data.log);
    } catch (_) {}
  };

  const handleCheck = async () => {
    setChecking(true);
    setError('');
    setPackages([]);
    try {
      const { data } = await api.get('/updates/check');
      setPackages(data.packages);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to check for updates');
    } finally {
      setChecking(false);
    }
  };

  const handleUpgrade = async (type = 'upgrade') => {
    if (!confirm(`Run apt-get ${type}? This will install updates on the server.`)) return;
    try {
      await api.post(`/updates/${type}`);
      setUpgradeStatus({ running: true, log: [`Starting ${type}…\n`] });
      startPolling();
      setTab('available');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to start upgrade');
    }
  };

  const handleAutoremove = async () => {
    if (!confirm('Run apt autoremove? This will remove unused packages.')) return;
    try {
      const { data } = await api.post('/updates/autoremove');
      alert('Autoremove completed:\n' + data.output.slice(0, 500));
    } catch (e) {
      alert(e.response?.data?.error || 'Autoremove failed');
    }
  };

  const handleReboot = async () => {
    if (!confirm('⚠️ Reboot the server now?\n\nThe server will restart and the dashboard will be temporarily unavailable.')) return;
    setRebooting(true);
    try {
      await api.post('/updates/reboot');
      alert('Reboot initiated. The server will restart momentarily. Refresh this page in ~30 seconds.');
    } catch (e) {
      alert(e.response?.data?.error || 'Reboot failed');
      setRebooting(false);
    }
  };

  const logText = upgradeStatus?.log?.join('') || '';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">System Updates (apt)</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleCheck} className="btn-secondary flex items-center gap-2 text-sm py-1.5" disabled={checking}>
            {checking ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Check for Updates
          </button>
          <button
            onClick={() => handleUpgrade('upgrade')}
            className="btn-primary flex items-center gap-2 text-sm py-1.5"
            disabled={upgradeStatus?.running}
          >
            <Download size={14} /> Upgrade
          </button>
          <button
            onClick={() => handleUpgrade('dist-upgrade')}
            className="btn-secondary flex items-center gap-2 text-sm py-1.5"
            disabled={upgradeStatus?.running}
            title="Full distribution upgrade"
          >
            Dist-Upgrade
          </button>
          <button
            onClick={handleAutoremove}
            className="btn-secondary flex items-center gap-2 text-sm py-1.5"
            disabled={upgradeStatus?.running}
          >
            <Trash2 size={14} /> Autoremove
          </button>
          {user?.role === 'admin' && (
            <button
              onClick={handleReboot}
              className="flex items-center gap-2 text-sm py-1.5 px-3 rounded-lg bg-red-900/50 hover:bg-red-800 border border-red-700 text-red-300 hover:text-white transition-colors disabled:opacity-50"
              disabled={rebooting}
              title="Reboot the server"
            >
              {rebooting ? <Loader size={14} className="animate-spin" /> : <Power size={14} />}
              Reboot
            </button>
          )}
        </div>
      </div>

      {error && <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>}

      {/* Upgrade in progress */}
      {upgradeStatus?.running && (
        <div className="card border-yellow-800 bg-yellow-950/20">
          <div className="flex items-center gap-2 mb-3">
            <Loader size={16} className="animate-spin text-yellow-400" />
            <span className="text-yellow-300 font-medium">Upgrade in progress…</span>
          </div>
          <pre
            ref={logRef}
            className="bg-gray-950 rounded-lg p-3 text-xs text-green-300 font-mono overflow-y-auto max-h-80 whitespace-pre-wrap"
          >
            {logText}
          </pre>
        </div>
      )}

      {/* Completed log */}
      {upgradeStatus && !upgradeStatus.running && logText && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle size={16} className="text-green-400" />
            <span className="text-green-300 font-medium">Last upgrade completed</span>
          </div>
          <pre
            ref={logRef}
            className="bg-gray-950 rounded-lg p-3 text-xs text-gray-400 font-mono overflow-y-auto max-h-64 whitespace-pre-wrap"
          >
            {logText}
          </pre>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1">
        {[['available', 'Available Updates'], ['history', 'History']].map(([k, l]) => (
          <button
            key={k}
            onClick={() => { setTab(k); if (k === 'history') fetchHistory(); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === k ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'available' && (
        <div className="card">
          {packages.length === 0 && !checking ? (
            <div className="text-center py-12 text-gray-500">
              <RefreshCw size={32} className="mx-auto mb-3 opacity-40" />
              <p>Click "Check for Updates" to see available packages.</p>
            </div>
          ) : checking ? (
            <div className="flex items-center justify-center gap-2 py-12 text-brand-400">
              <Loader size={20} className="animate-spin" />
              Running apt-get update…
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4">
                <span className="badge-yellow">{packages.length} packages upgradeable</span>
              </div>
              <div className="space-y-1">
                {packages.map((p, i) => (
                  <div key={i} className="flex items-start gap-2 py-1.5 border-b border-gray-800/50">
                    <span className="text-gray-300 font-mono text-sm font-medium w-48 shrink-0">{p.name}</span>
                    <span className="text-gray-500 text-xs font-mono truncate">{p.info}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-800">
                <button
                  onClick={() => handleUpgrade('upgrade')}
                  className="btn-primary flex items-center gap-2"
                  disabled={upgradeStatus?.running}
                >
                  <Download size={16} /> Install All Updates
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="card">
          <pre className="text-xs text-gray-400 font-mono whitespace-pre-wrap overflow-x-auto max-h-[500px] overflow-y-auto">
            {history || 'No apt history found.'}
          </pre>
        </div>
      )}
    </div>
  );
}
