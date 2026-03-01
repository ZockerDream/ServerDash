import React, { useState, useEffect, useRef } from 'react';
import { ScrollText, RefreshCw, Loader, Search, ChevronDown } from 'lucide-react';
import api from '../api.js';

const LINE_OPTIONS = [50, 100, 200, 500, 1000];

// Colour-code log lines by severity keywords
function lineClass(line) {
  const l = line.toLowerCase();
  if (/\b(error|fail|critical|emerg|alert|crit)\b/.test(l)) return 'text-red-400';
  if (/\b(warn|warning)\b/.test(l)) return 'text-yellow-400';
  if (/\b(notice|info)\b/.test(l)) return 'text-blue-300';
  return 'text-gray-300';
}

export default function LogsPage() {
  const [sources, setSources] = useState([]);
  const [units, setUnits] = useState([]);
  const [source, setSource] = useState('journal');
  const [service, setService] = useState('');
  const [lines, setLines] = useState([]);
  const [lineCount, setLineCount] = useState(200);
  const [filter, setFilter] = useState('');
  const [filterInput, setFilterInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [mode, setMode] = useState('source'); // 'source' | 'service'
  const logRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    api.get('/logs/sources').then(({ data }) => setSources(data)).catch(() => {});
    api.get('/logs/service-units').then(({ data }) => setUnits(data)).catch(() => {});
    fetchLogs();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (autoRefresh) {
      pollRef.current = setInterval(fetchLogs, 5000);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [autoRefresh, source, service, lineCount, filter, mode]); // eslint-disable-line

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = { lines: lineCount, filter };
      if (mode === 'service' && service) {
        params.service = service;
      } else {
        params.source = source;
      }
      const { data } = await api.get('/logs/read', { params });
      setLines(data.lines || []);
    } catch (e) {
      setLines([`Error: ${e.response?.data?.error || e.message}`]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilter = () => {
    setFilter(filterInput);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3 shrink-0">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ScrollText size={22} /> Log Viewer
        </h1>
      </div>

      {/* Controls */}
      <div className="card flex items-end gap-3 flex-wrap shrink-0">
        {/* Mode toggle */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">Mode</label>
          <div className="flex rounded-lg overflow-hidden border border-gray-700 text-sm">
            <button
              onClick={() => setMode('source')}
              className={`px-3 py-1.5 transition-colors ${mode === 'source' ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            >
              Log file
            </button>
            <button
              onClick={() => setMode('service')}
              className={`px-3 py-1.5 transition-colors ${mode === 'service' ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            >
              Service
            </button>
          </div>
        </div>

        {/* Source / service selector */}
        {mode === 'source' ? (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">Source</label>
            <select className="input text-sm" value={source} onChange={e => setSource(e.target.value)}>
              {sources.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        ) : (
          <div className="flex flex-col gap-1 min-w-0">
            <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">Service unit</label>
            <select className="input text-sm w-56" value={service} onChange={e => setService(e.target.value)}>
              <option value="">— pick a service —</option>
              {units.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        )}

        {/* Lines */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">Lines</label>
          <select className="input text-sm w-24" value={lineCount} onChange={e => setLineCount(Number(e.target.value))}>
            {LINE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {/* Filter */}
        <div className="flex flex-col gap-1 flex-1 min-w-40">
          <label className="text-xs text-gray-400 font-medium uppercase tracking-wide">Filter (grep)</label>
          <div className="flex gap-1">
            <input
              className="input text-sm flex-1 font-mono"
              placeholder="error"
              value={filterInput}
              onChange={e => setFilterInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyFilter()}
            />
            <button onClick={applyFilter} className="btn-secondary p-2">
              <Search size={14} />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 items-end">
          <button onClick={fetchLogs} className="btn-secondary flex items-center gap-2 text-sm py-2" disabled={loading}>
            {loading ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
          <button
            onClick={() => setAutoRefresh(a => !a)}
            className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
              autoRefresh
                ? 'bg-green-900/50 border-green-700 text-green-300'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            {autoRefresh ? 'Auto ✓' : 'Auto'}
          </button>
        </div>
      </div>

      {/* Log output */}
      <div
        ref={logRef}
        className="flex-1 rounded-xl border border-gray-800 bg-gray-950 overflow-y-auto p-4 font-mono text-xs"
        style={{ minHeight: 0 }}
      >
        {lines.length === 0 && !loading && (
          <p className="text-gray-600 text-center pt-8">No log data. Select a source and click Refresh.</p>
        )}
        {lines.map((line, i) => (
          <div key={i} className={`leading-5 whitespace-pre-wrap break-all ${lineClass(line)}`}>
            {line}
          </div>
        ))}
        {loading && lines.length === 0 && (
          <div className="flex justify-center pt-8">
            <Loader size={20} className="animate-spin text-brand-400" />
          </div>
        )}
      </div>

      <div className="shrink-0 text-xs text-gray-600 text-right">
        {lines.length} lines{filter ? ` · filtered by "${filter}"` : ''}{autoRefresh ? ' · auto-refresh 5s' : ''}
      </div>
    </div>
  );
}
