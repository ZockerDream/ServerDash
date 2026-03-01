import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Eye, EyeOff } from 'lucide-react';
import api from '../api.js';
import { useAuth } from '../App.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('credentials'); // 'credentials' | '2fa'
  const [userId, setUserId] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', totp: '' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCredentials = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', {
        username: form.username,
        password: form.password,
      });
      if (data.require2fa) {
        setUserId(data.userId);
        setStep('2fa');
      } else {
        login(data.token, data.user);
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handle2FA = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/verify-2fa', {
        userId,
        token: form.totp,
      });
      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid 2FA code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-brand-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand-900">
            <Monitor size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">ServerDash</h1>
          <p className="text-gray-500 text-sm mt-1">Server Management Dashboard</p>
        </div>

        <div className="card">
          {step === 'credentials' ? (
            <form onSubmit={handleCredentials} className="space-y-4">
              <h2 className="text-lg font-semibold text-white mb-2">Sign in</h2>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Username</label>
                <input
                  className="input"
                  autoFocus
                  autoComplete="username"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Password</label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                    onClick={() => setShowPw(v => !v)}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-red-400 bg-red-950 rounded-lg px-3 py-2">{error}</p>}

              <button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          ) : (
            <form onSubmit={handle2FA} className="space-y-4">
              <h2 className="text-lg font-semibold text-white mb-2">Two-Factor Authentication</h2>
              <p className="text-sm text-gray-400">Enter the 6-digit code from your authenticator app.</p>

              <input
                className="input text-center text-2xl tracking-widest font-mono"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoFocus
                placeholder="000000"
                value={form.totp}
                onChange={e => setForm(f => ({ ...f, totp: e.target.value.replace(/\D/g, '') }))}
                required
              />

              {error && <p className="text-sm text-red-400 bg-red-950 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => { setStep('credentials'); setError(''); }}
                >
                  Back
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={loading}>
                  {loading ? 'Verifying…' : 'Verify'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
