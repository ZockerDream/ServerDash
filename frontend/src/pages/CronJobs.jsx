import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Pencil, Trash2, RefreshCw, ChevronDown } from 'lucide-react';
import api from '../api.js';

const QUICK_SCHEDULES = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every 5 minutes', value: '*/5 * * * *' },
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at midnight', value: '0 0 * * *' },
  { label: 'Every day at 2am', value: '0 2 * * *' },
  { label: 'Every Sunday at midnight', value: '0 0 * * 0' },
  { label: 'Every month on 1st', value: '0 0 1 * *' },
  { label: 'At reboot', value: '@reboot' },
];

function JobModal({ job, index, cronUser, onSave, onClose }) {
  const [schedule, setSchedule] = useState(job?.schedule || '');
  const [command, setCommand] = useState(job?.command || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!schedule.trim() || !command.trim()) {
      setError('Both schedule and command are required');
      return;
    }
    setSaving(true);
    try {
      if (index !== undefined) {
        await api.put(`/cron/${index}`, { schedule, command, user: cronUser || undefined });
      } else {
        await api.post('/cron', { schedule, command, user: cronUser || undefined });
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
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-white">{index !== undefined ? 'Edit' : 'Add'} Cron Job</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Quick schedule picker */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Quick Schedule</label>
            <select
              className="input"
              onChange={e => e.target.value && setSchedule(e.target.value)}
              defaultValue=""
            >
              <option value="">— pick a preset —</option>
              {QUICK_SCHEDULES.map(s => (
                <option key={s.value} value={s.value}>{s.label} ({s.value})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Schedule Expression</label>
            <input
              className="input font-mono"
              placeholder="* * * * *"
              value={schedule}
              onChange={e => setSchedule(e.target.value)}
            />
            <p className="text-xs text-gray-600 mt-1">min  hour  day  month  weekday</p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Command</label>
            <input
              className="input font-mono"
              placeholder="/usr/bin/bash /home/user/script.sh"
              value={command}
              onChange={e => setCommand(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-400 bg-red-950 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleSave} className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving…' : 'Save Job'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CronJobs() {
  const [jobs, setJobs] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // null | { job?, index? }

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const [jobsRes, usersRes] = await Promise.all([
        api.get(`/cron${selectedUser ? `?user=${selectedUser}` : ''}`),
        api.get('/cron/users'),
      ]);
      setJobs(jobsRes.data.jobs);
      setUsers(usersRes.data);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load cron jobs');
    } finally {
      setLoading(false);
    }
  }, [selectedUser]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const deleteJob = async (index) => {
    if (!confirm('Delete this cron job?')) return;
    try {
      await api.delete(`/cron/${index}${selectedUser ? `?user=${selectedUser}` : ''}`);
      fetchJobs();
    } catch (e) {
      alert(e.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Cron Jobs</h1>
        <div className="flex gap-2">
          <button onClick={fetchJobs} className="btn-secondary flex items-center gap-2 text-sm py-1.5">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => setModal({ job: null, index: undefined })} className="btn-primary flex items-center gap-2 text-sm py-1.5">
            <Plus size={14} /> Add Job
          </button>
        </div>
      </div>

      {/* User selector */}
      <div className="card p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm text-gray-400 font-medium">Crontab user:</label>
          <select
            className="input w-auto min-w-[140px]"
            value={selectedUser}
            onChange={e => setSelectedUser(e.target.value)}
          >
            <option value="">current (root)</option>
            {users.map(u => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>}

      <div className="card">
        {loading ? (
          <div className="flex justify-center py-12">
            <RefreshCw size={20} className="animate-spin text-brand-500" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Clock size={32} className="mx-auto mb-3 opacity-40" />
            <p>No cron jobs found for this user.</p>
            <button
              onClick={() => setModal({ job: null, index: undefined })}
              className="btn-primary mt-4 text-sm"
            >
              <Plus size={14} className="inline mr-1" /> Add first job
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-left border-b border-gray-800">
                  <th className="pb-2 font-medium w-8">#</th>
                  <th className="pb-2 font-medium">Schedule</th>
                  <th className="pb-2 font-medium">Command</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    <td className="py-3 text-gray-600 text-xs">{i}</td>
                    <td className="py-3">
                      <code className="text-brand-400 bg-brand-900/30 px-2 py-0.5 rounded font-mono text-xs">
                        {job.schedule}
                      </code>
                    </td>
                    <td className="py-3">
                      <code className="text-gray-300 font-mono text-xs break-all">{job.command}</code>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => setModal({ job, index: i })}
                          className="p-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => deleteJob(i)}
                          className="p-1.5 rounded-lg bg-red-900 hover:bg-red-800 text-red-300"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal !== null && (
        <JobModal
          job={modal.job}
          index={modal.index}
          cronUser={selectedUser}
          onSave={fetchJobs}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
