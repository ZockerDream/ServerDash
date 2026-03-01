import React, { useState, useEffect } from 'react';
import { Shield, ShieldOff, Plus, Trash2, RefreshCw, Loader, AlertCircle, Pencil, X } from 'lucide-react';
import api from '../api.js';

const ACTION_COLORS = {
  ALLOW:  'badge-green',
  DENY:   'badge-red',
  REJECT: 'badge-red',
  LIMIT:  'badge-yellow',
};

const COMMON_PORTS = [
  { label: 'SSH (22)', port: '22', proto: 'tcp' },
  { label: 'HTTP (80)', port: '80', proto: 'tcp' },
  { label: 'HTTPS (443)', port: '443', proto: 'tcp' },
  { label: 'DNS (53)', port: '53', proto: '' },
  { label: 'Custom…', port: '', proto: '' },
];

function RuleModal({ initial, onSave, onClose }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(
    initial
      ? {
          action:  (initial.action || 'ALLOW').toLowerCase(),
          port:    initial.to?.split('/')[0] || '',
          proto:   initial.to?.includes('/') ? initial.to.split('/')[1].toLowerCase() : '',
          from:    initial.from === 'Anywhere' ? '' : (initial.from || ''),
          comment: initial.comment || '',
        }
      : { action: 'allow', port: '', proto: '', from: '', comment: '' }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.port) return setError('Port ist erforderlich');
    setSaving(true);
    setError('');
    try {
      if (isEdit) {
        await api.put('/ufw/rule', {
          oldNum:  initial.pending ? undefined : initial.num,
          oldSpec: initial.pending ? initial.ruleSpec : undefined,
          ...form,
        });
      } else {
        await api.post('/ufw/rule', form);
      }
      onSave();
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-white">
            {isEdit ? 'Regel bearbeiten' : 'Regel hinzufügen'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">

          {!isEdit && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Schnellauswahl</label>
              <div className="flex gap-2 flex-wrap">
                {COMMON_PORTS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => setForm(f => ({ ...f, port: p.port, proto: p.proto }))}
                    className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Action</label>
              <select className="input" value={form.action} onChange={e => set('action', e.target.value)}>
                <option value="allow">Allow</option>
                <option value="deny">Deny</option>
                <option value="reject">Reject</option>
                <option value="limit">Limit (rate)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Protokoll</label>
              <select className="input" value={form.proto} onChange={e => set('proto', e.target.value)}>
                <option value="">Beliebig</option>
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Port / Service<span className="text-red-400 ml-0.5">*</span>
            </label>
            <input
              className="input font-mono"
              placeholder="22  oder  8000:8100  oder  http"
              value={form.port}
              onChange={e => set('port', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Von IP (leer = Anywhere)</label>
            <input
              className="input font-mono"
              placeholder="192.168.1.0/24"
              value={form.from}
              onChange={e => set('from', e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Beschreibung (optional)</label>
            <input
              className="input"
              placeholder="z.B. SSH Zugang"
              value={form.comment}
              onChange={e => set('comment', e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-400 bg-red-950 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1">Abbrechen</button>
            <button onClick={handleSave} className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Speichern…' : isEdit ? 'Speichern' : 'Hinzufügen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FirewallPage() {
  const [status, setStatus]           = useState(null);
  const [loading, setLoading]         = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError]             = useState('');
  const [modal, setModal]             = useState(null); // null | 'add' | rule-object

  const fetchStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/ufw/status');
      setStatus(data);
    } catch (e) {
      setError(e.response?.data?.error || 'UFW Status konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const toggle = async () => {
    const action = status?.enabled ? 'disable' : 'enable';
    if (!confirm(`UFW ${action === 'enable' ? 'aktivieren' : 'deaktivieren'}?`)) return;
    setActionLoading(action);
    try {
      await api.post(`/ufw/${action}`);
      await fetchStatus();
    } catch (e) {
      alert(e.response?.data?.error || 'Aktion fehlgeschlagen');
    } finally {
      setActionLoading('');
    }
  };

  const deleteRule = async (rule) => {
    if (!confirm(`Regel #${rule.num} löschen?`)) return;
    setActionLoading(`del-${rule.num}`);
    try {
      if (rule.pending && rule.ruleSpec) {
        await api.delete('/ufw/rule-spec', { data: { spec: rule.ruleSpec } });
      } else {
        await api.delete(`/ufw/rule/${rule.num}`);
      }
      await fetchStatus();
    } catch (e) {
      alert(e.response?.data?.error || 'Löschen fehlgeschlagen');
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Shield size={22} /> Firewall (UFW)
        </h1>
        <div className="flex gap-2">
          <button onClick={fetchStatus} className="btn-secondary flex items-center gap-2 text-sm py-1.5" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setModal('add')} className="btn-primary flex items-center gap-2 text-sm py-1.5">
            <Plus size={14} /> Regel hinzufügen
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Status card */}
      {status && (
        <div className="card flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${status.enabled ? 'bg-green-900/40' : 'bg-gray-800'}`}>
              {status.enabled
                ? <Shield size={22} className="text-green-400" />
                : <ShieldOff size={22} className="text-gray-500" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold">UFW Firewall</span>
                {status.enabled
                  ? <span className="badge-green">Aktiv</span>
                  : <span className="badge-red">Inaktiv</span>}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Standard: eingehend{' '}<span className="text-white font-mono">{status.defaultIn}</span>
                {' · '}ausgehend{' '}<span className="text-white font-mono">{status.defaultOut}</span>
              </p>
            </div>
          </div>
          <button
            onClick={toggle}
            disabled={!!actionLoading}
            className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg border transition-colors ${
              status.enabled
                ? 'bg-red-900/50 hover:bg-red-800 border-red-700 text-red-300 hover:text-white'
                : 'bg-green-900/50 hover:bg-green-800 border-green-700 text-green-300 hover:text-white'
            }`}
          >
            {actionLoading === 'enable' || actionLoading === 'disable'
              ? <Loader size={14} className="animate-spin" />
              : status.enabled ? <ShieldOff size={14} /> : <Shield size={14} />}
            UFW {status.enabled ? 'deaktivieren' : 'aktivieren'}
          </button>
        </div>
      )}

      {/* Pending rules banner */}
      {status && !status.enabled && status.rules.length > 0 && (
        <div className="bg-yellow-950/60 border border-yellow-700/50 rounded-xl px-4 py-3 text-yellow-300 text-sm flex items-start gap-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-yellow-400" />
          <div>
            <span className="font-semibold">UFW ist inaktiv — </span>
            diese {status.rules.length} Regeln sind gespeichert und werden aktiv sobald du UFW einschaltest.
            Prüfe und bearbeite die Liste, dann klicke <span className="font-semibold">UFW aktivieren</span>.
          </div>
        </div>
      )}

      {/* Rules table */}
      {status && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="font-semibold text-white text-sm">
              {status.rules.length} Regeln
              {!status.enabled && status.rules.length > 0 && (
                <span className="ml-2 text-xs font-normal text-yellow-500">(ausstehend · UFW inaktiv)</span>
              )}
            </h2>
          </div>
          {status.rules.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <Shield size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Keine Regeln definiert.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-800/50">
              <div className="grid grid-cols-[36px_1fr_80px_60px_1fr_1fr_72px] gap-2 px-4 py-2 border-b border-gray-800 bg-gray-800/40">
                <span className="text-xs font-semibold text-gray-400 uppercase">#</span>
                <span className="text-xs font-semibold text-gray-400 uppercase">Port</span>
                <span className="text-xs font-semibold text-gray-400 uppercase">Action</span>
                <span className="text-xs font-semibold text-gray-400 uppercase">Dir</span>
                <span className="text-xs font-semibold text-gray-400 uppercase">Von</span>
                <span className="text-xs font-semibold text-gray-400 uppercase">Beschreibung</span>
                <span></span>
              </div>
              {status.rules.map(rule => (
                <div key={rule.num} className="grid grid-cols-[36px_1fr_80px_60px_1fr_1fr_72px] gap-2 px-4 py-2.5 items-center text-sm hover:bg-gray-800/30">
                  <span className="text-gray-600 font-mono text-xs">{rule.num}</span>
                  <span className="text-white font-mono text-xs truncate" title={rule.to}>{rule.to}</span>
                  <span><span className={ACTION_COLORS[rule.action] || 'badge-gray'}>{rule.action}</span></span>
                  <span className="text-gray-500 text-xs">{rule.direction}</span>
                  <span className="text-gray-400 font-mono text-xs truncate" title={rule.from}>{rule.from}</span>
                  <span className="text-gray-300 text-xs truncate" title={rule.comment}>{rule.comment || '—'}</span>
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      onClick={() => setModal(rule)}
                      className="p-1 rounded hover:bg-blue-900/50 text-gray-600 hover:text-blue-300 transition-colors"
                      title="Bearbeiten"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => deleteRule(rule)}
                      disabled={actionLoading === `del-${rule.num}`}
                      className="p-1 rounded hover:bg-red-900/50 text-gray-600 hover:text-red-300 transition-colors"
                      title="Löschen"
                    >
                      {actionLoading === `del-${rule.num}`
                        ? <Loader size={13} className="animate-spin" />
                        : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && !status && (
        <div className="flex justify-center py-12">
          <Loader size={24} className="animate-spin text-brand-400" />
        </div>
      )}

      {modal && (
        <RuleModal
          initial={modal === 'add' ? null : modal}
          onSave={fetchStatus}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
