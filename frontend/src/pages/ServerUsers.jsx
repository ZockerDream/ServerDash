import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, Server, Users } from 'lucide-react';
import api from '../api.js';

const COMMON_SHELLS = ['/bin/bash', '/bin/sh', '/bin/zsh', '/usr/sbin/nologin', '/bin/false'];

function UserModal({ user, groups, onSave, onClose }) {
  const isEdit = !!user;
  const [form, setForm] = useState({
    username: user?.username || '',
    password: '',
    comment: user?.comment || '',
    shell: user?.shell || '/bin/bash',
    groups: user?.groups || [],
    createHome: true,
    removeHome: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [groupInput, setGroupInput] = useState(form.groups.join(', '));

  const handleSave = async () => {
    const groupList = groupInput.split(',').map(g => g.trim()).filter(Boolean);
    const payload = {
      ...form,
      groups: groupList,
      password: form.password || undefined,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/system-users/${user.username}`, payload);
      } else {
        if (!form.username || !form.password)
          throw new Error('Username and password are required');
        await api.post('/system-users', payload);
      }
      onSave();
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-white">{isEdit ? 'Edit' : 'Create'} Server User</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {!isEdit && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Username</label>
              <input
                className="input font-mono"
                placeholder="john"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">
              {isEdit ? 'New Password (leave blank to keep)' : 'Password'}
            </label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Shell</label>
            <select className="input" value={form.shell} onChange={e => setForm(f => ({ ...f, shell: e.target.value }))}>
              {COMMON_SHELLS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">GECOS / Comment</label>
            <input
              className="input"
              placeholder="Full Name"
              value={form.comment}
              onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Additional Groups (comma-separated)</label>
            <input
              className="input font-mono"
              placeholder="sudo, docker, www-data"
              value={groupInput}
              onChange={e => setGroupInput(e.target.value)}
            />
          </div>

          {!isEdit && (
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={form.createHome}
                onChange={e => setForm(f => ({ ...f, createHome: e.target.checked }))}
              />
              Create home directory
            </label>
          )}

          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={form.removeHome}
                onChange={e => setForm(f => ({ ...f, removeHome: e.target.checked }))}
              />
              Remove home directory on delete
            </label>
          )}

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

export default function ServerUsers() {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState('normal'); // 'all' | 'normal' | 'system'

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, groupsRes] = await Promise.all([
        api.get('/system-users'),
        api.get('/system-users/groups'),
      ]);
      setUsers(usersRes.data);
      setGroups(groupsRes.data);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load server users. Check server permissions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const deleteUser = async (username) => {
    const removeHome = confirm(`Also remove home directory for "${username}"?`);
    if (!confirm(`Delete server user "${username}"?`)) return;
    try {
      await api.delete(`/system-users/${username}`, { data: { removeHome } });
      fetchData();
    } catch (e) {
      alert(e.response?.data?.error || 'Delete failed');
    }
  };

  const filteredUsers = users.filter(u => {
    if (filter === 'normal') return !u.isSystem;
    if (filter === 'system') return u.isSystem;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Server Users</h1>
          <p className="text-gray-500 text-sm mt-0.5">Ubuntu system user accounts</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="btn-secondary flex items-center gap-2 text-sm py-1.5">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setModal({ user: null })} className="btn-primary flex items-center gap-2 text-sm py-1.5">
            <Plus size={14} /> Add User
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
          {error}
          <p className="mt-2 text-red-400 text-xs">
            Note: This feature requires the backend to run as root (or with sudo privileges).
          </p>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-1">
        {[['normal', 'Normal Users'], ['system', 'System Accounts'], ['all', 'All']].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === k ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw size={20} className="animate-spin text-brand-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left border-b border-gray-800">
                  <th className="pb-2 font-medium">Username</th>
                  <th className="pb-2 font-medium hidden sm:table-cell">UID</th>
                  <th className="pb-2 font-medium hidden md:table-cell">Primary Group</th>
                  <th className="pb-2 font-medium hidden lg:table-cell">Groups</th>
                  <th className="pb-2 font-medium hidden md:table-cell">Shell</th>
                  <th className="pb-2 font-medium hidden lg:table-cell">Home</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.username} className="border-b border-gray-800/50">
                    <td className="py-3">
                      <span className="text-white font-medium font-mono">{u.username}</span>
                      {u.comment && <p className="text-gray-500 text-xs">{u.comment}</p>}
                    </td>
                    <td className="py-3 hidden sm:table-cell text-gray-400">{u.uid}</td>
                    <td className="py-3 hidden md:table-cell">
                      <span className="badge-gray">{u.primaryGroup}</span>
                    </td>
                    <td className="py-3 hidden lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {u.groups.slice(0, 4).map(g => (
                          <span key={g} className="badge-blue">{g}</span>
                        ))}
                        {u.groups.length > 4 && <span className="badge-gray">+{u.groups.length - 4}</span>}
                      </div>
                    </td>
                    <td className="py-3 hidden md:table-cell">
                      <code className="text-gray-500 text-xs">{u.shell}</code>
                    </td>
                    <td className="py-3 hidden lg:table-cell">
                      <code className="text-gray-500 text-xs">{u.home}</code>
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
                        {!['root', 'ubuntu'].includes(u.username) && !u.isSystem && (
                          <button
                            onClick={() => deleteUser(u.username)}
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
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-gray-500">No users in this category</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal !== null && (
        <UserModal
          user={modal.user}
          groups={groups}
          onSave={fetchData}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
