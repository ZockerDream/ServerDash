import React, { useState, useEffect } from 'react';
import { KeyRound, ShieldCheck, ShieldOff, CheckCircle, Terminal, Trash2, Upload } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../App.jsx';

export default function Settings() {
  const { user } = useAuth();
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');

  const [qr, setQr] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [totpSetupLoading, setTotpSetupLoading] = useState(false);
  const [totpConfirmLoading, setTotpConfirmLoading] = useState(false);
  const [totpMsg, setTotpMsg] = useState('');
  const [totpError, setTotpError] = useState('');

  const [disableForm, setDisableForm] = useState({ password: '' });
  const [disableLoading, setDisableLoading] = useState(false);
  const [disableMsg, setDisableMsg] = useState('');
  const [disableError, setDisableError] = useState('');

  // SSH key state
  const [sshKeyText, setSshKeyText] = useState('');
  const [sshKeyLoading, setSshKeyLoading] = useState(false);
  const [sshKeyMsg, setSshKeyMsg] = useState('');
  const [sshKeyError, setSshKeyError] = useState('');

  // Always load fresh data from API — context object is stale after login
  const [me, setMe] = useState(null);

  const refreshMe = async () => {
    const { data } = await api.get('/auth/me');
    setMe(data);
  };

  useEffect(() => { refreshMe(); }, []);

  const changePassword = async e => {
    e.preventDefault();
    setPwError('');
    setPwMsg('');
    if (pwForm.newPassword !== pwForm.confirm)
      return setPwError('Passwords do not match');
    if (pwForm.newPassword.length < 8)
      return setPwError('New password must be at least 8 characters');

    setPwLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwMsg('Password changed successfully');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (e) {
      setPwError(e.response?.data?.error || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  const setup2FA = async () => {
    setTotpError('');
    setTotpMsg('');
    setTotpSetupLoading(true);
    try {
      const { data } = await api.post('/auth/setup-2fa');
      setQr(data.qr);
    } catch (e) {
      setTotpError(e.response?.data?.error || 'Failed to set up 2FA');
    } finally {
      setTotpSetupLoading(false);
    }
  };

  const confirm2FA = async () => {
    setTotpError('');
    setTotpConfirmLoading(true);
    try {
      await api.post('/auth/confirm-2fa', { token: totpCode });
      setTotpMsg('2FA enabled successfully! You will be asked for a code on next login.');
      setQr('');
      setTotpCode('');
      refreshMe();
    } catch (e) {
      setTotpError(e.response?.data?.error || 'Invalid code');
    } finally {
      setTotpConfirmLoading(false);
    }
  };

  const disable2FA = async e => {
    e.preventDefault();
    setDisableError('');
    setDisableMsg('');
    setDisableLoading(true);
    try {
      await api.post('/auth/disable-2fa', { password: disableForm.password });
      setDisableMsg('2FA disabled');
      setDisableForm({ password: '' });
      refreshMe();
    } catch (e) {
      setDisableError(e.response?.data?.error || 'Failed to disable 2FA');
    } finally {
      setDisableLoading(false);
    }
  };

  const saveSshKey = async () => {
    if (!sshKeyText.trim()) return;
    setSshKeyError('');
    setSshKeyMsg('');
    setSshKeyLoading(true);
    try {
      await api.post('/auth/ssh-key', { privateKey: sshKeyText.trim() });
      setSshKeyMsg('SSH key saved successfully.');
      setSshKeyText('');
      refreshMe();
    } catch (e) {
      setSshKeyError(e.response?.data?.error || 'Failed to save key');
    } finally {
      setSshKeyLoading(false);
    }
  };

  const deleteSshKey = async () => {
    if (!confirm('Remove your stored SSH key?')) return;
    setSshKeyError('');
    setSshKeyMsg('');
    setSshKeyLoading(true);
    try {
      await api.delete('/auth/ssh-key');
      setSshKeyMsg('SSH key removed.');
      refreshMe();
    } catch (e) {
      setSshKeyError(e.response?.data?.error || 'Failed to remove key');
    } finally {
      setSshKeyLoading(false);
    }
  };

  const handleSshKeyFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setSshKeyText(ev.target.result);
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {/* Profile info */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-200 mb-3">Account</h2>
        {!me ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Username</p>
              <p className="text-white font-mono mt-0.5">{me.username}</p>
            </div>
            <div>
              <p className="text-gray-500">Role</p>
              <p className="text-white mt-0.5 capitalize">{me.role}</p>
            </div>
            <div>
              <p className="text-gray-500">2FA Status</p>
              <p className="mt-0.5">
                {me.totp_enabled
                  ? <span className="badge-green">Enabled</span>
                  : <span className="badge-red">Disabled</span>
                }
              </p>
            </div>
            <div>
              <p className="text-gray-500">Last Login</p>
              <p className="text-white mt-0.5 text-xs">
                {me.last_login ? new Date(me.last_login).toLocaleString() : 'Never'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Change password */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <KeyRound size={16} /> Change Password
        </h2>
        <form onSubmit={changePassword} className="space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Current Password</label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={pwForm.currentPassword}
              onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">New Password</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={pwForm.newPassword}
              onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Confirm New Password</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={pwForm.confirm}
              onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
              required
            />
          </div>
          {pwError && <p className="text-sm text-red-400 bg-red-950 rounded-lg px-3 py-2">{pwError}</p>}
          {pwMsg && (
            <p className="text-sm text-green-400 bg-green-950 rounded-lg px-3 py-2 flex items-center gap-2">
              <CheckCircle size={14} /> {pwMsg}
            </p>
          )}
          <button type="submit" className="btn-primary" disabled={pwLoading}>
            {pwLoading ? 'Changing…' : 'Change Password'}
          </button>
        </form>
      </div>

      {/* 2FA Setup */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-200 mb-4 flex items-center gap-2">
          <ShieldCheck size={16} /> Two-Factor Authentication
        </h2>

        {me?.totp_enabled ? (
          <div className="space-y-3">
            <p className="text-sm text-green-400">2FA is currently enabled on your account.</p>
            <form onSubmit={disable2FA} className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Enter your password to disable 2FA</label>
                <input
                  className="input max-w-xs"
                  type="password"
                  value={disableForm.password}
                  onChange={e => setDisableForm({ password: e.target.value })}
                  required
                />
              </div>
              {disableError && <p className="text-sm text-red-400 bg-red-950 rounded-lg px-3 py-2">{disableError}</p>}
              {disableMsg && <p className="text-sm text-green-400 bg-green-950 rounded-lg px-3 py-2">{disableMsg}</p>}
              <button type="submit" className="btn-danger flex items-center gap-2" disabled={disableLoading}>
                <ShieldOff size={14} /> {disableLoading ? 'Disabling…' : 'Disable 2FA'}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Use an authenticator app (e.g. Google Authenticator, Aegis, Authy) to scan the QR code.
            </p>

            {!qr && (
              <button
                onClick={setup2FA}
                className="btn-primary flex items-center gap-2"
                disabled={totpSetupLoading}
              >
                <ShieldCheck size={14} />
                {totpSetupLoading ? 'Generating…' : 'Set up 2FA'}
              </button>
            )}

            {qr && (
              <div className="space-y-4">
                <div className="bg-white p-3 rounded-xl inline-block">
                  <img src={qr} alt="2FA QR Code" className="w-48 h-48" />
                </div>
                <p className="text-sm text-gray-400">
                  Scan the QR code, then enter the 6-digit code below to confirm.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    className="input font-mono text-center text-xl tracking-widest w-40"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                    value={totpCode}
                    onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  />
                  <button
                    onClick={confirm2FA}
                    className="btn-primary"
                    disabled={totpConfirmLoading || totpCode.length !== 6}
                  >
                    {totpConfirmLoading ? 'Verifying…' : 'Enable 2FA'}
                  </button>
                </div>
              </div>
            )}

            {totpError && <p className="text-sm text-red-400 bg-red-950 rounded-lg px-3 py-2">{totpError}</p>}
            {totpMsg && (
              <p className="text-sm text-green-400 bg-green-950 rounded-lg px-3 py-2 flex items-center gap-2">
                <CheckCircle size={14} /> {totpMsg}
              </p>
            )}
          </div>
        )}
      </div>

      {/* SSH Key for Terminal */}
      <div className="card">
        <h2 className="text-base font-semibold text-gray-200 mb-1 flex items-center gap-2">
          <Terminal size={16} /> SSH Key for Terminal
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Your key is stored encrypted on the server and is only used when you connect the SSH terminal.<br />
          Only you can use it — each account has its own key.
        </p>

        {me?.ssh_key_stored ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-400">
              <CheckCircle size={14} /> A private key is stored for your account.
            </div>
            <p className="text-xs text-gray-500">To replace it, paste or upload a new key below and save.</p>
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-1">No SSH key stored yet.</p>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Private key (PEM format)</label>
            <textarea
              className="input font-mono text-xs"
              rows={8}
              placeholder={`-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----`}
              value={sshKeyText}
              onChange={(e) => setSshKeyText(e.target.value)}
              spellCheck={false}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={saveSshKey}
              className="btn-primary flex items-center gap-2 text-sm"
              disabled={sshKeyLoading || !sshKeyText.trim()}
            >
              {sshKeyLoading ? 'Saving…' : 'Save Key'}
            </button>

            <label className="btn-secondary flex items-center gap-2 text-sm cursor-pointer">
              <Upload size={13} /> Upload file
              <input type="file" accept=".pem,.key,*" className="hidden" onChange={handleSshKeyFile} />
            </label>

            {me?.ssh_key_stored && (
              <button
                onClick={deleteSshKey}
                className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-red-900/50 hover:bg-red-800 border border-red-700 text-red-300 hover:text-white transition-colors"
                disabled={sshKeyLoading}
              >
                <Trash2 size={13} /> Remove key
              </button>
            )}
          </div>

          {sshKeyError && <p className="text-sm text-red-400 bg-red-950 rounded-lg px-3 py-2">{sshKeyError}</p>}
          {sshKeyMsg && (
            <p className="text-sm text-green-400 bg-green-950 rounded-lg px-3 py-2 flex items-center gap-2">
              <CheckCircle size={14} /> {sshKeyMsg}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
