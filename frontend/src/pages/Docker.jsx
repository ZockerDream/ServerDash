import React, { useState, useEffect, useCallback } from 'react';
import {
  Container, Play, Square, RotateCcw, Trash2,
  RefreshCw, FileText, Image, Network, Database, Info,
} from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../App.jsx';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function ContainerStatusBadge({ state }) {
  const map = {
    running: 'badge-green',
    exited: 'badge-red',
    paused: 'badge-yellow',
    restarting: 'badge-yellow',
    created: 'badge-blue',
  };
  return <span className={map[state] || 'badge-gray'}>{state}</span>;
}

function LogModal({ id, name, onClose }) {
  const [logs, setLogs] = useState('Loading…');
  const [tail, setTail] = useState(100);

  const fetchLogs = useCallback(async () => {
    try {
      const { data } = await api.get(`/docker/containers/${id}/logs?tail=${tail}`);
      // strip Docker stream header bytes (first 8 bytes per line)
      const cleaned = data
        .split('\n')
        .map(l => l.replace(/[\x00-\x08]/g, '').trimEnd())
        .join('\n');
      setLogs(cleaned || '(no output)');
    } catch (e) {
      setLogs(`Error: ${e.response?.data?.error || e.message}`);
    }
  }, [id, tail]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <span className="font-semibold text-white">Logs — {name}</span>
          <div className="flex items-center gap-2">
            <select
              className="input py-1 w-28 text-sm"
              value={tail}
              onChange={e => setTail(Number(e.target.value))}
            >
              <option value={50}>50 lines</option>
              <option value={100}>100 lines</option>
              <option value={200}>200 lines</option>
              <option value={500}>500 lines</option>
            </select>
            <button onClick={fetchLogs} className="btn-secondary py-1 px-2 text-sm">Refresh</button>
            <button onClick={onClose} className="btn-secondary py-1 px-2 text-sm">Close</button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto p-4 text-xs text-green-300 font-mono whitespace-pre-wrap break-all">
          {logs}
        </pre>
      </div>
    </div>
  );
}

export default function DockerPage() {
  const { user } = useAuth();
  const isOperator = ['admin', 'operator'].includes(user?.role);
  const isAdmin = user?.role === 'admin';

  const [containers, setContainers] = useState([]);
  const [images, setImages] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [volumes, setVolumes] = useState([]);
  const [info, setInfo] = useState(null);
  const [tab, setTab] = useState('containers');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState({});
  const [logsFor, setLogsFor] = useState(null);
  const [showAll, setShowAll] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [c, img, net, vol, inf] = await Promise.all([
        api.get('/docker/containers').then(r => r.data),
        api.get('/docker/images').then(r => r.data),
        api.get('/docker/networks').then(r => r.data),
        api.get('/docker/volumes').then(r => r.data),
        api.get('/docker/info').then(r => r.data),
      ]);
      setContainers(c);
      setImages(img);
      setNetworks(net);
      setVolumes(vol);
      setInfo(inf);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load Docker data. Is Docker running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const action = async (id, act) => {
    setActionLoading(prev => ({ ...prev, [id + act]: true }));
    try {
      await api.post(`/docker/containers/${id}/${act}`);
      await fetchAll();
    } catch (e) {
      alert(e.response?.data?.error || `Failed to ${act} container`);
    } finally {
      setActionLoading(prev => ({ ...prev, [id + act]: false }));
    }
  };

  const removeContainer = async (id) => {
    if (!confirm('Remove container?')) return;
    try {
      await api.delete(`/docker/containers/${id}`);
      await fetchAll();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to remove container');
    }
  };

  const removeImage = async (id) => {
    if (!confirm('Remove image?')) return;
    try {
      await api.delete(`/docker/images/${id}`);
      await fetchAll();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to remove image');
    }
  };

  const filtered = showAll
    ? containers
    : containers.filter(c => c.State === 'running');

  const tabs = [
    { key: 'containers', label: 'Containers', icon: Container, count: containers.length },
    { key: 'images', label: 'Images', icon: Image, count: images.length },
    { key: 'networks', label: 'Networks', icon: Network, count: networks.length },
    { key: 'volumes', label: 'Volumes', icon: Database, count: volumes.length },
    { key: 'info', label: 'Info', icon: Info },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Docker</h1>
        <button onClick={fetchAll} className="btn-secondary flex items-center gap-2 text-sm py-1.5">
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {error && <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            <t.icon size={14} />
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${tab === t.key ? 'bg-brand-700' : 'bg-gray-700'}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Containers */}
      {tab === 'containers' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-gray-400">{filtered.length} containers</span>
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showAll}
                onChange={e => setShowAll(e.target.checked)}
                className="rounded"
              />
              Show all (including stopped)
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left border-b border-gray-800">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium hidden md:table-cell">Image</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium hidden lg:table-cell">Ports</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const name = (c.Names?.[0] || c.Id).replace(/^\//, '');
                  const ports = c.Ports?.filter(p => p.PublicPort).map(p => `${p.PublicPort}→${p.PrivatePort}`).join(', ') || '—';
                  return (
                    <tr key={c.Id} className="border-b border-gray-800/50">
                      <td className="py-2.5">
                        <span className="text-white font-medium">{name}</span>
                        <p className="text-gray-600 text-xs font-mono">{c.Id.slice(0, 12)}</p>
                      </td>
                      <td className="py-2.5 hidden md:table-cell">
                        <span className="text-gray-400 text-xs font-mono truncate max-w-[200px] block">{c.Image}</span>
                      </td>
                      <td className="py-2.5">
                        <ContainerStatusBadge state={c.State} />
                        <p className="text-gray-600 text-xs mt-0.5">{c.Status}</p>
                      </td>
                      <td className="py-2.5 hidden lg:table-cell">
                        <span className="text-gray-400 text-xs">{ports}</span>
                      </td>
                      <td className="py-2.5">
                        <div className="flex gap-1 justify-end flex-wrap">
                          {isOperator && c.State !== 'running' && (
                            <button
                              onClick={() => action(c.Id, 'start')}
                              disabled={actionLoading[c.Id + 'start']}
                              className="p-1.5 rounded-lg bg-green-900 hover:bg-green-800 text-green-300 transition-colors"
                              title="Start"
                            >
                              <Play size={13} />
                            </button>
                          )}
                          {isOperator && c.State === 'running' && (
                            <button
                              onClick={() => action(c.Id, 'stop')}
                              disabled={actionLoading[c.Id + 'stop']}
                              className="p-1.5 rounded-lg bg-red-900 hover:bg-red-800 text-red-300 transition-colors"
                              title="Stop"
                            >
                              <Square size={13} />
                            </button>
                          )}
                          {isOperator && (
                            <button
                              onClick={() => action(c.Id, 'restart')}
                              disabled={actionLoading[c.Id + 'restart']}
                              className="p-1.5 rounded-lg bg-yellow-900 hover:bg-yellow-800 text-yellow-300 transition-colors"
                              title="Restart"
                            >
                              <RotateCcw size={13} />
                            </button>
                          )}
                          {isOperator && (
                            <button
                              onClick={() => setLogsFor({ id: c.Id, name })}
                              className="p-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                              title="Logs"
                            >
                              <FileText size={13} />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={() => removeContainer(c.Id)}
                              className="p-1.5 rounded-lg bg-red-900 hover:bg-red-800 text-red-300 transition-colors"
                              title="Remove"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-500">No containers found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Images */}
      {tab === 'images' && (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left border-b border-gray-800">
                  <th className="pb-2 font-medium">Repository</th>
                  <th className="pb-2 font-medium">Tag</th>
                  <th className="pb-2 font-medium">ID</th>
                  <th className="pb-2 font-medium">Size</th>
                  {isAdmin && <th className="pb-2 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {images.map(img => {
                  const repo = img.RepoTags?.[0] || '<none>';
                  const [name, tag] = repo.includes(':') ? repo.split(':') : [repo, 'latest'];
                  return (
                    <tr key={img.Id} className="border-b border-gray-800/50">
                      <td className="py-2.5 text-gray-300 font-mono text-xs">{name}</td>
                      <td className="py-2.5"><span className="badge-blue">{tag}</span></td>
                      <td className="py-2.5 text-gray-600 font-mono text-xs">{img.Id.replace('sha256:', '').slice(0, 12)}</td>
                      <td className="py-2.5 text-gray-400">{formatBytes(img.Size)}</td>
                      {isAdmin && (
                        <td className="py-2.5 text-right">
                          <button onClick={() => removeImage(img.Id)} className="p-1.5 rounded-lg bg-red-900 hover:bg-red-800 text-red-300">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {images.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-500">No images found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Networks */}
      {tab === 'networks' && (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left border-b border-gray-800">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Driver</th>
                  <th className="pb-2 font-medium">Scope</th>
                  <th className="pb-2 font-medium">ID</th>
                </tr>
              </thead>
              <tbody>
                {networks.map(n => (
                  <tr key={n.Id} className="border-b border-gray-800/50">
                    <td className="py-2.5 text-white font-medium">{n.Name}</td>
                    <td className="py-2.5"><span className="badge-blue">{n.Driver}</span></td>
                    <td className="py-2.5 text-gray-400">{n.Scope}</td>
                    <td className="py-2.5 text-gray-600 font-mono text-xs">{n.Id.slice(0, 12)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Volumes */}
      {tab === 'volumes' && (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left border-b border-gray-800">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Driver</th>
                  <th className="pb-2 font-medium">Mountpoint</th>
                </tr>
              </thead>
              <tbody>
                {volumes.map(v => (
                  <tr key={v.Name} className="border-b border-gray-800/50">
                    <td className="py-2.5 text-white font-medium font-mono text-xs">{v.Name}</td>
                    <td className="py-2.5"><span className="badge-blue">{v.Driver}</span></td>
                    <td className="py-2.5 text-gray-500 font-mono text-xs truncate max-w-[300px]">{v.Mountpoint}</td>
                  </tr>
                ))}
                {volumes.length === 0 && (
                  <tr><td colSpan={3} className="py-8 text-center text-gray-500">No volumes found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info */}
      {tab === 'info' && info && (
        <div className="card">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              ['Docker Version', info.ServerVersion],
              ['Containers', info.Containers],
              ['Running', info.ContainersRunning],
              ['Stopped', info.ContainersStopped],
              ['Images', info.Images],
              ['OS', info.OperatingSystem],
              ['Architecture', info.Architecture],
              ['CPUs', info.NCPU],
              ['Total Memory', formatBytes(info.MemTotal)],
              ['Storage Driver', info.Driver],
              ['Logging Driver', info.LoggingDriver],
              ['Cgroup Driver', info.CgroupDriver],
            ].map(([k, v]) => (
              <div key={k} className="bg-gray-800 rounded-lg px-4 py-3">
                <p className="text-xs text-gray-500 mb-1">{k}</p>
                <p className="text-white font-medium">{String(v ?? '—')}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {logsFor && (
        <LogModal id={logsFor.id} name={logsFor.name} onClose={() => setLogsFor(null)} />
      )}
    </div>
  );
}
