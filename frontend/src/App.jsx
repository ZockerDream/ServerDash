import React, { createContext, useContext, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DockerPage from './pages/Docker.jsx';
import CronJobs from './pages/CronJobs.jsx';
import UpdatesPage from './pages/Updates.jsx';
import AppUsers from './pages/AppUsers.jsx';
import ServerUsers from './pages/ServerUsers.jsx';
import Settings from './pages/Settings.jsx';
import TerminalPage from './pages/Terminal.jsx';
import FilesystemPage from './pages/Filesystem.jsx';
import FirewallPage from './pages/Firewall.jsx';
import LogsPage from './pages/Logs.jsx';
import SystemdPage from './pages/Systemd.jsx';

export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });

  const login = (token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/docker" element={<DockerPage />} />
              <Route path="/cron" element={<CronJobs />} />
              <Route path="/updates" element={<UpdatesPage />} />
              <Route path="/users/app" element={<AppUsers />} />
              <Route path="/users/server" element={<ServerUsers />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/terminal" element={<TerminalPage />} />
              <Route path="/filesystem" element={<FilesystemPage />} />
              <Route path="/firewall" element={<FirewallPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/systemd" element={<SystemdPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
