import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Container,
  Clock,
  RefreshCw,
  Users,
  Server,
  Settings,
  X,
  Monitor,
  Terminal,
  FolderOpen,
  ExternalLink,
  Shield,
  ScrollText,
  Cpu,
} from 'lucide-react';
import { useAuth } from '../App.jsx';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/docker', icon: Container, label: 'Docker' },
  { to: '/cron', icon: Clock, label: 'Cron Jobs' },
  { to: '/updates', icon: RefreshCw, label: 'Updates', roles: ['admin'] },
  { label: 'Tools', divider: true },
  { to: '/terminal', icon: Terminal, label: 'SSH Terminal', roles: ['admin', 'operator'] },
  { to: '/filesystem', icon: FolderOpen, label: 'Filesystem', roles: ['admin', 'operator'] },
  { to: '/firewall', icon: Shield, label: 'Firewall (UFW)', roles: ['admin'] },
  { to: '/logs', icon: ScrollText, label: 'Log Viewer', roles: ['admin', 'operator'] },
  { to: '/systemd', icon: Cpu, label: 'Systemd', roles: ['admin', 'operator'] },
  { label: 'Users', divider: true },
  { to: '/users/app', icon: Users, label: 'App Users', roles: ['admin'] },
  { to: '/users/server', icon: Server, label: 'Server Users', roles: ['admin', 'operator'] },
  { label: 'System', divider: true },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar({ onClose }) {
  const { user } = useAuth();

  return (
    <div className="h-full flex flex-col bg-gray-900 border-r border-gray-800">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <Monitor size={20} className="text-brand-500" />
          <span className="font-bold text-white text-lg">ServerDash</span>
        </div>
        <button onClick={onClose} className="lg:hidden text-gray-500 hover:text-white p-1">
          <X size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item, i) => {
          if (item.divider) {
            return (
              <div key={i} className="pt-4 pb-1 px-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {item.label}
                </p>
              </div>
            );
          }

          // Role-based visibility
          if (item.roles && !item.roles.includes(user?.role)) return null;

          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              <Icon size={17} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-gray-800 space-y-1 shrink-0">
        <a
          href="https://www.zd-c.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <ExternalLink size={17} />
          zd-c.com
        </a>
        <p className="text-xs text-gray-700 px-3 py-1">ServerDash v1.0 — Ubuntu 24.04</p>
      </div>
    </div>
  );
}

