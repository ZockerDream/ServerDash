import React, { useState, useEffect, useRef } from 'react';
import {
  Cpu, RefreshCw, Loader, Play, Square, RotateCcw,
  ToggleLeft, ToggleRight, ScrollText, ChevronDown, ChevronRight, Search,
} from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../App.jsx';

function statusDot(active) {
  if (active === 'active')   return <span className="inline-block w-2 h-2 rounded-full bg-green-400 mr-1.5" />;
  if (active === 'failed')   return <span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1.5" />;
  if (active === 'inactive') return <span className="inline-block w-2 h-2 rounded-full bg-gray-600 mr-1.5" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1.5" />;
}

function ServiceLogs({ unit, onClose }) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const logRef = useRef(null);

  useEffect(() => {
    api.get(`/systemd/service/${unit}/logs`, { params: { lines: 150 } })
      .then(({ data }) => setLines(data.lines || []))
      .catch(e => setLines([`Error: ${e.response?.data?.error || e.message}`]))
      .finally(() => setLoading(false));
  }, [unit]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-3xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h3 className="font-semibold text-white font-mono text-sm">{unit} — logs</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader size={20} className="animate-spin text-brand-400" /></div>
        ) : (
          <div
            ref={logRef}
            className="flex-1 overflow-y-auto p-4 font-mono text-xs text-gray-300 bg-gray-950 rounded-b-xl whitespace-pre-wrap break-all"
          >
            {lines.map((l, i) => <div key={i} className="leading-5">{l}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SystemdPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState('all'); // all | active | inactive | failed
  const [logsUnit, setLogsUnit] = useState(null);
  const [error, setError] = useState('');

  const fetchServices = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/systemd/services');
      setServices(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchServices(); }, []);

  const doAction = async (unit, action) => {
    const key = `${unit}-${action}`;
    setActionLoading(key);
    try {
      await api.post(`/systemd/service/${unit}/${action}`);
      await fetchServices();
    } catch (e) {
      alert(e.response?.data?.error || `${action} failed`);
    } finally {
      setActionLoading('');
    }
  };

  const filtered = services.filter(s => {
    const matchSearch = !search || s.unit.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filterActive === 'all' ? true :
      filterActive === 'active' ? s.active === 'active' :
      filterActive === 'inactive' ? s.active === 'inactive' :
      filterActive === 'failed' ? s.active === 'failed' : true;
    return matchSearch && matchFilter;
  });

  const counts = {
    all: services.length,
    active: services.filter(s => s.active === 'active').length,
    inactive: services.filter(s => s.active === 'inactive').length,
    failed: services.filter(s => s.active === 'failed').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Cpu size={22} /> Systemd Services
        </h1>
        <button onClick={fetchServices} className="btn-secondary flex items-center gap-2 text-sm py-1.5" disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {/* Summary chips */}
      <div className="flex gap-2 flex-wrap">
        {[
          ['all', 'All', 'bg-gray-800 text-gray-300'],
          ['active', 'Active', 'bg-green-900/50 text-green-300'],
          ['inactive', 'Inactive', 'bg-gray-800 text-gray-400'],
          ['failed', 'Failed', 'bg-red-900/50 text-red-300'],
        ].map(([key, label, cls]) => (
          <button
            key={key}
            onClick={() => setFilterActive(key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              filterActive === key
                ? 'border-brand-500 ring-1 ring-brand-500'
                : 'border-transparent'
            } ${cls}`}
          >
            {label} <span className="ml-1 opacity-70">{counts[key]}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          className="input pl-8 text-sm"
          placeholder="Filter services…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Services table */}
      <div className="card p-0 overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_90px_auto] gap-3 px-4 py-2.5 border-b border-gray-800 bg-gray-800/40">
          <span className="text-xs font-semibold text-gray-400 uppercase">Unit</span>
          <span className="text-xs font-semibold text-gray-400 uppercase">Status</span>
          <span className="text-xs font-semibold text-gray-400 uppercase">Enabled</span>
          <span className="text-xs font-semibold text-gray-400 uppercase text-right">Actions</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader size={24} className="animate-spin text-brand-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-gray-500 text-sm">No services match the current filter.</div>
        ) : (
          <div className="divide-y divide-gray-800/50 max-h-[60vh] overflow-y-auto">
            {filtered.map(svc => {
              const busy = actionLoading.startsWith(svc.unit);
              const isActive = svc.active === 'active';
              const isEnabled = svc.enabled === 'enabled' || svc.enabled === 'enabled-runtime';

              return (
                <div key={svc.unit} className="grid grid-cols-[1fr_80px_90px_auto] gap-3 px-4 py-2.5 items-center hover:bg-gray-800/30 text-sm">
                  {/* Unit name */}
                  <div className="min-w-0">
                    <div className="flex items-center">
                      {statusDot(svc.active)}
                      <span className="text-white font-mono text-xs truncate">{svc.unit.replace('.service', '')}</span>
                    </div>
                    {svc.description && (
                      <p className="text-gray-600 text-xs truncate ml-3.5">{svc.description}</p>
                    )}
                  </div>

                  {/* Active state */}
                  <div>
                    <span className={`text-xs font-mono ${
                      svc.active === 'active' ? 'text-green-400' :
                      svc.active === 'failed' ? 'text-red-400' : 'text-gray-500'
                    }`}>
                      {svc.active}
                    </span>
                  </div>

                  {/* Enabled state */}
                  <div>
                    <span className={`text-xs font-mono ${isEnabled ? 'text-blue-400' : 'text-gray-600'}`}>
                      {svc.enabled}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1 justify-end">
                    {/* Logs */}
                    <button
                      onClick={() => setLogsUnit(svc.unit)}
                      className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
                      title="View logs"
                    >
                      <ScrollText size={13} />
                    </button>

                    {isAdmin && (
                      <>
                        {/* Start / Stop */}
                        {isActive ? (
                          <button
                            onClick={() => doAction(svc.unit, 'stop')}
                            disabled={busy}
                            className="p-1.5 rounded-lg bg-gray-800 hover:bg-red-900/60 text-gray-400 hover:text-red-300"
                            title="Stop"
                          >
                            {busy && actionLoading === `${svc.unit}-stop`
                              ? <Loader size={13} className="animate-spin" />
                              : <Square size={13} />}
                          </button>
                        ) : (
                          <button
                            onClick={() => doAction(svc.unit, 'start')}
                            disabled={busy}
                            className="p-1.5 rounded-lg bg-gray-800 hover:bg-green-900/60 text-gray-400 hover:text-green-300"
                            title="Start"
                          >
                            {busy && actionLoading === `${svc.unit}-start`
                              ? <Loader size={13} className="animate-spin" />
                              : <Play size={13} />}
                          </button>
                        )}

                        {/* Restart */}
                        <button
                          onClick={() => doAction(svc.unit, 'restart')}
                          disabled={busy}
                          className="p-1.5 rounded-lg bg-gray-800 hover:bg-yellow-900/60 text-gray-400 hover:text-yellow-300"
                          title="Restart"
                        >
                          {busy && actionLoading === `${svc.unit}-restart`
                            ? <Loader size={13} className="animate-spin" />
                            : <RotateCcw size={13} />}
                        </button>

                        {/* Enable / Disable */}
                        {isEnabled ? (
                          <button
                            onClick={() => doAction(svc.unit, 'disable')}
                            disabled={busy}
                            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-blue-400 hover:text-gray-400"
                            title="Disable (on boot)"
                          >
                            {busy && actionLoading === `${svc.unit}-disable`
                              ? <Loader size={13} className="animate-spin" />
                              : <ToggleRight size={13} />}
                          </button>
                        ) : (
                          <button
                            onClick={() => doAction(svc.unit, 'enable')}
                            disabled={busy}
                            className="p-1.5 rounded-lg bg-gray-800 hover:bg-blue-900/60 text-gray-500 hover:text-blue-300"
                            title="Enable (on boot)"
                          >
                            {busy && actionLoading === `${svc.unit}-enable`
                              ? <Loader size={13} className="animate-spin" />
                              : <ToggleLeft size={13} />}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {logsUnit && <ServiceLogs unit={logsUnit} onClose={() => setLogsUnit(null)} />}
    </div>
  );
}
