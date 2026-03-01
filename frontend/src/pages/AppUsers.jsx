import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, ShieldOff } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../App.jsx';

const ROLES = ['admin', 'operator', 'viewer'];

function UserModal({ user, onSave, onClose }) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    username: user?.username || '',
    email: user?.email || '',
    role: user?.role || 'viewer',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!isEdit && (!form.username || !form.password))
      return setError('Username and password required');
    if (form.password && form.password.length > 0 && form.password.length < 8)
      return setError('Password must be at least 8 characters');

    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/users/${user.id}`, {
          email: form.email || undefined,
          role: form.role,
          password: form.password || undefined,
        });
      } else {
        await api.post('/users', form);
      }
      onSave();
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-white">{isEdit ? 'Edit' : 'Create'} User</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {!isEdit && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Username</label>
              <input
                className="input"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              />
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Email (optional)</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Role</label>
            <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <p className="text-xs text-gray-600 mt-1">admin = full access · operator = manage services · viewer = read only</p>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{isEdit ? 'New password (leave blank to keep)' : 'Password'}</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            />
          </div>

          {error && <p className="text-sm text-red-400 bg-red-950 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleSave} className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Update' : 'Create User'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [tab, setTab] = useState('users');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/users');
      setUsers(data);
    } catch (_) {}
    setLoading(false);
  };

  const fetchAudit = async () => {
    try {
      const { data } = await api.get('/users/audit-log');
      setAuditLog(data);
    } catch (_) {}
  };

  useEffect(() => { fetchUsers(); }, []);

  const deleteUser = async (id) => {
    if (!confirm('Delete this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      fetchUsers();
    } catch (e) {
      alert(e.response?.data?.error || 'Delete failed');
    }
  };

  const reset2FA = async (u) => {
    if (!confirm(`Reset 2FA for "${u.username}"?\n\nThe user will need to set up 2FA again on their next login.`)) return;
    try {
      await api.delete(`/users/${u.id}/2fa`);
      fetchUsers();
    } catch (e) {
      alert(e.response?.data?.error || 'Reset failed');
    }
  };

  const roleBadge = role => {
    if (role === 'admin') return <span className="badge-blue">admin</span>;
    if (role === 'operator') return <span className="badge-yellow">operator</span>;
    return <span className="badge-gray">viewer</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">App Users</h1>
        <div className="flex gap-2">
          <button onClick={fetchUsers} className="btn-secondary flex items-center gap-2 text-sm py-1.5">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setModal({ user: null })} className="btn-primary flex items-center gap-2 text-sm py-1.5">
            <Plus size={14} /> Add User
          </button>
        </div>
      </div>

      <div className="flex gap-1">
        {[['users', 'Users'], ['audit', 'Audit Log']].map(([k, l]) => (
          <button
            key={k}
            onClick={() => { setTab(k); if (k === 'audit') fetchAudit(); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === k ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left border-b border-gray-800">
                  <th className="pb-2 font-medium">Username</th>
                  <th className="pb-2 font-medium hidden sm:table-cell">Email</th>
                  <th className="pb-2 font-medium">Role</th>
                  <th className="pb-2 font-medium hidden md:table-cell">2FA</th>
                  <th className="pb-2 font-medium hidden md:table-cell">Last Login</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-gray-800/50">
                    <td className="py-3">
                      <span className="text-white font-medium">{u.username}</span>
                      {u.id === currentUser.id && (
                        <span className="ml-2 text-xs text-brand-400">(you)</span>
                      )}
                    </td>
                    <td className="py-3 hidden sm:table-cell text-gray-400">{u.email || '—'}</td>
                    <td className="py-3">{roleBadge(u.role)}</td>
                    <td className="py-3 hidden md:table-cell">
                      {u.totp_enabled
                        ? <span className="badge-green">enabled</span>
                        : <span className="badge-gray">off</span>
                      }
                    </td>
                    <td className="py-3 hidden md:table-cell text-gray-500 text-xs">
                      {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => setModal({ user: u })}
                          className="p-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        {u.totp_enabled === 1 && (
                          <button
                            onClick={() => reset2FA(u)}
                            className="p-1.5 rounded-lg bg-yellow-900/60 hover:bg-yellow-800 text-yellow-300"
                            title="Reset 2FA"
                          >
                            <ShieldOff size={13} />
                          </button>
                        )}
                        {u.id !== currentUser.id && (
                          <button
                            onClick={() => deleteUser(u.id)}
                            className="p-1.5 rounded-lg bg-red-900 hover:bg-red-800 text-red-300"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left border-b border-gray-800">
                  <th className="pb-2 font-medium">Time</th>
                  <th className="pb-2 font-medium">User</th>
                  <th className="pb-2 font-medium">Action</th>
                  <th className="pb-2 font-medium hidden md:table-cell">Details</th>
                  <th className="pb-2 font-medium hidden sm:table-cell">IP</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map(row => (
                  <tr key={row.id} className="border-b border-gray-800/50">
                    <td className="py-2 text-gray-500 text-xs">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="py-2 text-white">{row.username}</td>
                    <td className="py-2"><span className="badge-blue">{row.action}</span></td>
                    <td className="py-2 text-gray-400 text-xs hidden md:table-cell">{row.details}</td>
                    <td className="py-2 text-gray-600 text-xs hidden sm:table-cell">{row.ip}</td>
                  </tr>
                ))}
                {auditLog.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-gray-500">No audit entries yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal !== null && (
        <UserModal user={modal.user} onSave={fetchUsers} onClose={() => setModal(null)} />
      )}
    </div>
  );
}
