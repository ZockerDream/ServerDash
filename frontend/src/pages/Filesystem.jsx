import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderOpen, Folder, FileText, Link, ChevronRight, Home,
  Loader, AlertCircle, ArrowLeft, RefreshCw,
} from 'lucide-react';
import api from '../api.js';

function Breadcrumb({ path, onNavigate }) {
  if (path === '/') {
    return (
      <div className="flex items-center gap-1 text-sm flex-wrap">
        <span className="text-white font-medium">Root</span>
      </div>
    );
  }

  // Build crumbs: root "/" + each path segment
  const parts = path.split('/').filter(Boolean); // e.g. ['opt','serverdash']
  const crumbs = [{ label: '/', path: '/' }];
  parts.forEach((part, i) => {
    crumbs.push({ label: part, path: '/' + parts.slice(0, i + 1).join('/') });
  });

  return (
    <nav className="flex items-center gap-0.5 text-sm flex-wrap">
      {crumbs.map((c, i) => (
        <React.Fragment key={c.path}>
          {i > 0 && <ChevronRight size={13} className="text-gray-600 shrink-0" />}
          {i === crumbs.length - 1 ? (
            <span className="text-white font-medium px-1">{c.label === '/' ? <Home size={14} /> : c.label}</span>
          ) : (
            <button
              onClick={() => onNavigate(c.path)}
              className="text-brand-400 hover:text-brand-300 px-1 flex items-center gap-0.5"
            >
              {c.label === '/' ? <Home size={14} /> : c.label}
            </button>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

function FileIcon({ type }) {
  if (type === 'directory') return <Folder size={15} className="text-yellow-400 shrink-0" />;
  if (type === 'symlink') return <Link size={15} className="text-blue-400 shrink-0" />;
  return <FileText size={15} className="text-gray-400 shrink-0" />;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function FilesystemPage() {
  const [path, setPath] = useState('/');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState(['/']); // navigation history stack

  const navigate = useCallback(async (newPath) => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/fs', { params: { path: newPath } });
      setEntries(data.entries);
      setPath(newPath);
      setHistory((prev) => {
        // If same path, don't push
        if (prev[prev.length - 1] === newPath) return prev;
        return [...prev, newPath];
      });
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to read directory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    navigate('/');
  }, []); // eslint-disable-line

  const handleEntry = (entry) => {
    if (entry.type === 'directory') {
      navigate(entry.fullPath);
    }
  };

  const handleBack = () => {
    if (history.length < 2) return;
    const newHistory = history.slice(0, -1);
    const previous = newHistory[newHistory.length - 1];
    setHistory(newHistory);
    navigate(previous).then(); // navigate will push again; compensate
    // Override: set history to not double-push
    setHistory(newHistory);
  };

  // Better back implementation
  const goBack = async () => {
    if (history.length < 2) return;
    const newHistory = history.slice(0, -1);
    const previous = newHistory[newHistory.length - 1];
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/fs', { params: { path: previous } });
      setEntries(data.entries);
      setPath(previous);
      setHistory(newHistory);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to read directory');
    } finally {
      setLoading(false);
    }
  };

  const refresh = () => navigate(path);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <FolderOpen size={22} />
          Filesystem
        </h1>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            className="btn-secondary flex items-center gap-2 text-sm py-1.5"
            disabled={loading}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Navigation bar */}
      <div className="card flex items-center gap-3 flex-wrap">
        <button
          onClick={goBack}
          disabled={history.length < 2 || loading}
          className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white disabled:opacity-30 transition-colors"
          title="Back"
        >
          <ArrowLeft size={16} />
        </button>
        <Breadcrumb path={path} onNavigate={(p) => navigate(p)} />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Directory listing */}
      <div className="card p-0 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[minmax(0,1fr)_80px_120px_60px] gap-4 px-4 py-2.5 border-b border-gray-800 bg-gray-800/40">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Size</span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Modified</span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Perm</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-brand-400">
            <Loader size={20} className="animate-spin" />
            Loading…
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-2">
            <FolderOpen size={32} className="opacity-40" />
            <p className="text-sm">Empty directory</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {entries.map((entry) => (
              <div
                key={entry.fullPath}
                onClick={() => handleEntry(entry)}
                className={`grid grid-cols-[minmax(0,1fr)_80px_120px_60px] gap-4 px-4 py-2.5 text-sm transition-colors ${
                  entry.type === 'directory'
                    ? 'cursor-pointer hover:bg-gray-800/60 hover:text-white'
                    : 'cursor-default'
                }`}
              >
                {/* Name */}
                <div className="flex items-center gap-2 min-w-0">
                  <FileIcon type={entry.type} />
                  <span
                    className={`truncate font-mono text-xs ${
                      entry.type === 'directory'
                        ? 'text-yellow-300 font-semibold'
                        : entry.type === 'symlink'
                        ? 'text-blue-300'
                        : 'text-gray-300'
                    }`}
                  >
                    {entry.name}
                    {entry.type === 'directory' && '/'}
                  </span>
                </div>

                {/* Size */}
                <div className="text-right text-xs text-gray-500 font-mono self-center">
                  {entry.sizeFormatted || '—'}
                </div>

                {/* Modified */}
                <div className="text-xs text-gray-500 self-center truncate">
                  {formatDate(entry.modified)}
                </div>

                {/* Permissions */}
                <div className="text-xs text-gray-600 font-mono self-center">
                  {entry.permissions || '—'}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer summary */}
        {!loading && entries.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-800 bg-gray-800/20 text-xs text-gray-500">
            {entries.filter((e) => e.type === 'directory').length} directories,{' '}
            {entries.filter((e) => e.type !== 'directory').length} files
          </div>
        )}
      </div>
    </div>
  );
}
