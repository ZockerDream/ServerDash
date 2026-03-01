import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu, MemoryStick, HardDrive, Network, Activity,
  Server, RefreshCw, Clock,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '../api.js';

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

function formatUptime(seconds) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

function GaugeBar({ value, colorClass }) {
  return (
    <div className="w-full bg-gray-800 rounded-full h-2 mt-2">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${colorClass}`}
        style={{ width: `${Math.min(100, value || 0)}%` }}
      />
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const { data: overview } = await api.get('/monitoring/overview');
      setData(overview);
      setLastRefresh(new Date());
      setHistory(prev => {
        const entry = {
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          cpu: Math.round(overview.cpu?.load || 0),
          memory: Math.round(overview.memory?.percent || 0),
        };
        const updated = [...prev, entry];
        return updated.slice(-20);
      });
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load monitoring data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={24} className="animate-spin text-brand-500" />
      </div>
    );
  }

  const cpuPct = data?.cpu?.load || 0;
  const memPct = data?.memory?.percent || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {data?.os?.hostname || ''} — {data?.os?.distro} {data?.os?.release}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-xs text-gray-600 hidden sm:block">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button onClick={fetchData} className="btn-secondary flex items-center gap-2 text-sm py-1.5">
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* CPU */}
        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-gray-400">
              <Cpu size={16} />
              <span className="text-sm font-medium">CPU Load</span>
            </div>
            <span className={`text-lg font-bold ${cpuPct > 80 ? 'text-red-400' : cpuPct > 50 ? 'text-yellow-400' : 'text-green-400'}`}>
              {cpuPct.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs text-gray-600">{data?.cpu?.cores || 0} cores</p>
          <GaugeBar value={cpuPct} colorClass={cpuPct > 80 ? 'bg-red-500' : cpuPct > 50 ? 'bg-yellow-500' : 'bg-green-500'} />
        </div>

        {/* Memory */}
        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-gray-400">
              <MemoryStick size={16} />
              <span className="text-sm font-medium">Memory</span>
            </div>
            <span className={`text-lg font-bold ${memPct > 85 ? 'text-red-400' : memPct > 65 ? 'text-yellow-400' : 'text-blue-400'}`}>
              {memPct.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs text-gray-400">
            {formatBytes(data?.memory?.active)} used / {formatBytes(data?.memory?.total)} total
          </p>
          <p className="text-xs text-gray-600 mt-0.5">
            {formatBytes(data?.memory?.cached)} cache · {formatBytes(data?.memory?.buffered)} buffers
          </p>
          <GaugeBar value={memPct} colorClass={memPct > 85 ? 'bg-red-500' : memPct > 65 ? 'bg-yellow-500' : 'bg-blue-500'} />
        </div>

        {/* Disk */}
        <div className="card">
          <div className="flex items-center gap-2 text-gray-400 mb-1">
            <HardDrive size={16} />
            <span className="text-sm font-medium">Disk (root)</span>
          </div>
          {(() => {
            const root = data?.disk?.find(d => d.mount === '/') || data?.disk?.[0];
            if (!root) return <p className="text-xs text-gray-600">No disk data</p>;
            const pct = root.percent;
            return (
              <>
                <div className="flex justify-between">
                  <p className="text-xs text-gray-600">
                    {formatBytes(root.used)} / {formatBytes(root.size)}
                  </p>
                  <span className={`text-lg font-bold ${pct > 85 ? 'text-red-400' : pct > 65 ? 'text-yellow-400' : 'text-purple-400'}`}>
                    {pct?.toFixed(0)}%
                  </span>
                </div>
                <GaugeBar value={pct} colorClass={pct > 85 ? 'bg-red-500' : pct > 65 ? 'bg-yellow-500' : 'bg-purple-500'} />
              </>
            );
          })()}
        </div>

        {/* Uptime */}
        <div className="card">
          <div className="flex items-center gap-2 text-gray-400 mb-1">
            <Clock size={16} />
            <span className="text-sm font-medium">Uptime</span>
          </div>
          <p className="text-2xl font-bold text-white mt-1">{formatUptime(data?.uptime)}</p>
          <p className="text-xs text-gray-600 mt-1">
            Kernel {data?.os?.kernel || '—'} · {data?.os?.arch}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">CPU History</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="cpu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} interval="preserveEnd" tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} unit="%" />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={v => [`${v}%`, 'CPU']}
              />
              <Area type="monotone" dataKey="cpu" stroke="#6366f1" fill="url(#cpu)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Memory History</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="mem" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} interval="preserveEnd" tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} unit="%" />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                formatter={v => [`${v}%`, 'Memory']}
              />
              <Area type="monotone" dataKey="memory" stroke="#3b82f6" fill="url(#mem)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Disk details */}
      {data?.disk && data.disk.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Filesystems</h3>
          <div className="space-y-3">
            {data.disk.filter(d => d.size > 0).map((d, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-300 font-mono">{d.mount}</span>
                  <span className="text-gray-500 text-xs">
                    {formatBytes(d.used)} / {formatBytes(d.size)} ({d.percent?.toFixed(1)}%)
                  </span>
                </div>
                <GaugeBar
                  value={d.percent}
                  colorClass={d.percent > 85 ? 'bg-red-500' : d.percent > 65 ? 'bg-yellow-500' : 'bg-purple-500'}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Network */}
      {data?.network && data.network.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Network Interfaces</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left border-b border-gray-800">
                  <th className="pb-2 font-medium">Interface</th>
                  <th className="pb-2 font-medium">RX</th>
                  <th className="pb-2 font-medium">TX</th>
                  <th className="pb-2 font-medium">RX/s</th>
                  <th className="pb-2 font-medium">TX/s</th>
                </tr>
              </thead>
              <tbody>
                {data.network.map((n, i) => (
                  <tr key={i} className="border-b border-gray-800/50 text-gray-300">
                    <td className="py-2 font-mono text-xs">{n.iface}</td>
                    <td className="py-2">{formatBytes(n.rx_bytes)}</td>
                    <td className="py-2">{formatBytes(n.tx_bytes)}</td>
                    <td className="py-2">{formatBytes(n.rx_sec)}/s</td>
                    <td className="py-2">{formatBytes(n.tx_sec)}/s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
