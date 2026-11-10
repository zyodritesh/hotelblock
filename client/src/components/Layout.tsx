import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { api } from '../api/client';
import { cn } from '../lib/utils';
import MobileBottomNav from './MobileBottomNav';
import QuickLogModal from './QuickLogModal';
import NotificationBell from './NotificationBell';
import LiveProvider, { enablePush } from '../live/LiveProvider';
import { getSnapshot, patch, subscribe as subscribeLive } from '../live/store';
import { roleLabel } from '../lib/utils';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/attendance', label: 'Attendance', icon: '🕐' },
  { path: '/phone', label: 'Phone', icon: '📲' },
  { path: '/chat', label: 'Team Chat', icon: '💬', badge: 'chat' },
  { path: '/calls', label: 'Calls', icon: '📞' },
  { path: '/meetings', label: 'Meetings', icon: '🤝' },
  { path: '/pipeline', label: 'Pipeline', icon: '🔄' },
  { path: '/calendar', label: 'Calendar', icon: '📅' },
  { path: '/accounts', label: 'Accounts', icon: '🏢' },
  { path: '/contacts', label: 'Contacts', icon: '👥' },
  { path: '/proposals', label: 'Proposals', icon: '📄' },
  { path: '/tasks', label: 'Tasks', icon: '✅' },
  { path: '/targets', label: 'Targets & Scores', icon: '🎯' },
  { path: '/wallet', label: 'Incentive Wallet', icon: '👛' },
  { path: '/agents', label: 'Agent Network', icon: '🌐' },
  { path: '/agent-offers', label: 'Agent offers', icon: '📣' },
  { path: '/agent-rewards', label: 'Agent free nights', icon: '🌙' },
  { path: '/agents/due', label: 'My Follow-ups', icon: '🔔', badge: true },
  { path: '/reports', label: 'Reports', icon: '📈' },
  { path: '/settings', label: 'Settings', icon: '⚙️' },
];

interface Property { id: string; name: string; city: string; logo_path: string | null; brand_color: string; }

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, token, logout, isAdmin, activePropertyId, setActiveProperty } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [chatUnread, setChatUnread] = useState(getSnapshot().unreadChat);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => subscribeLive(() => {
    const snap = getSnapshot();
    setChatUnread(snap.unreadChat);
    setToast(snap.toast);
  }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => { setToast(null); patch({ toast: null }); }, 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const [showQuickLog, setShowQuickLog] = useState(false);

  useEffect(() => {
    api.get<Property[]>('/properties').then(data => {
      setProperties(data);
      if (data.length > 0 && !activePropertyId) {
        setActiveProperty(data[0].id);
      }
    }).catch(() => {});
  }, []);

  const refreshOverdue = useCallback(() => {
    if (!token) return;
    fetch('/api/agents/due-today', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((data: any[]) => setOverdueCount(Array.isArray(data) ? data.length : 0))
      .catch(() => {});
  }, [token]);

  useEffect(() => { refreshOverdue(); const t = setInterval(refreshOverdue, 60000); return () => clearInterval(t); }, [refreshOverdue]);

  useEffect(() => {
    if (!token) return;
    const installed = window.matchMedia('(display-mode: standalone)').matches || document.referrer.startsWith('android-app://') || navigator.userAgent.includes('HotelBlockApp');
    if (!installed || !('Notification' in window) || Notification.permission === 'denied') return;
    enablePush().catch(() => {});
  }, [token]);

  const inChatThread = /^\/chat\/.+/.test(location.pathname);
  const activeProperty = properties.find(p => p.id === activePropertyId);
  const brandColor = activeProperty?.brand_color || '#2563eb';

  const handleLogout = () => { logout(); navigate('/login'); };

  const navItems = NAV_ITEMS.filter(item => {
    if (item.path === '/settings') return isAdmin();
    return true;
  });

  interface NavItem { path: string; label: string; icon: string; badge?: boolean | 'chat' }

  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-gray-900 text-white w-64">
      <div className="px-5 py-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          {activeProperty?.logo_path ? (
            <img src={activeProperty.logo_path} alt="Logo" className="w-9 h-9 rounded-lg object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold text-white" style={{ backgroundColor: brandColor }}>
              {activeProperty?.name?.[0] || 'H'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm leading-tight truncate">{activeProperty?.name || 'HotelBlock'}</p>
            <p className="text-xs text-gray-400">Sales Tracker</p>
          </div>
        </div>

        {/* Property Selector */}
        {properties.length > 1 && (
          <select
            className="mt-3 w-full bg-gray-800 text-white text-xs rounded-lg px-2 py-1.5 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={activePropertyId || ''}
            onChange={e => setActiveProperty(e.target.value)}
          >
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.name}{p.city ? ` — ${p.city}` : ''}</option>
            ))}
          </select>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {(navItems as NavItem[]).map(item => {
          const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path) && item.path !== '/agents' && item.path !== '/agents/due' ? false : location.pathname === item.path);
          const exact = location.pathname === item.path;
          const active = item.path === '/' ? exact : item.path === '/agents' ? location.pathname === '/agents' : item.path === '/chat' ? location.pathname.startsWith('/chat') : exact;
          const badgeNum = item.badge === 'chat' ? chatUnread : item.badge && overdueCount > 0 ? overdueCount : 0;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5 transition-all',
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <span className="text-base w-6 h-6 flex items-center justify-center shrink-0">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {badgeNum > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {badgeNum > 99 ? '99+' : badgeNum}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-gray-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: brandColor }}>
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-gray-400">{roleLabel(user?.role)}{user?.role === 'call_center' ? ' · assign leads' : user?.role === 'executive' ? ' · own data' : user?.role === 'manager' ? ' · full team' : ' · full access'}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="w-full text-left text-sm text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-800 transition-colors">
          → Sign out
        </button>
      </div>
    </aside>
  );

  if (user?.role === 'agent') {
    return (
      <div className="h-full overflow-y-auto bg-stone-50">
        <header className="bg-stone-950 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <div>
            <p className="font-bold tracking-tight">Aayor Agent Club</p>
            <p className="text-xs text-stone-400">{user.name}</p>
          </div>
          <button type="button" onClick={handleLogout} className="text-sm text-stone-300">Sign out</button>
        </header>
        <main className="max-w-lg mx-auto p-4 pb-12">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-64 flex-shrink-0"><Sidebar /></div>
          <div className="flex-1 bg-black/40" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className={`${inChatThread ? 'hidden lg:flex' : 'flex'} items-center gap-2 px-3 lg:px-6 py-2 bg-white border-b border-gray-200`} style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden shrink-0 w-10 h-10 rounded-lg text-gray-700 text-xl flex items-center justify-center" aria-label="Open menu">☰</button>
          <span className="font-bold text-gray-900 lg:hidden truncate min-w-0 flex-1">{activeProperty?.name || 'HotelBlock'}</span>
          <div className="hidden lg:block text-sm text-gray-500 flex-1 min-w-0 truncate">{activeProperty?.name || 'HotelBlock'}</div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={() => setShowQuickLog(true)} className="lg:hidden text-xs font-semibold text-white bg-blue-600 rounded-full px-3 py-2">Log</button>
            <NotificationBell />
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white lg:hidden" style={{ backgroundColor: brandColor }}>
              {user?.name?.[0]?.toUpperCase()}
            </div>
          </div>
        </div>
        <main className={`flex-1 min-h-0 overflow-x-hidden ${inChatThread ? 'overflow-hidden p-0 lg:overflow-y-auto lg:p-6' : 'overflow-y-auto p-4 lg:p-6 pb-28 lg:pb-6'}`}>
          {toast && (
            <button type="button" className="mb-3 w-full text-left bg-slate-900 text-white rounded-xl px-4 py-3" onClick={() => { setToast(null); patch({ toast: null }); }}>
              <p className="text-sm font-semibold">{toast.title}</p>
              <p className="text-xs text-slate-300 mt-0.5 line-clamp-2">{toast.body}</p>
            </button>
          )}
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <MobileBottomNav overdueCount={overdueCount} chatUnread={chatUnread} />
      <LiveProvider />

      {/* Desktop FAB — Quick Log */}
      <button
        onClick={() => setShowQuickLog(true)}
        className="hidden lg:flex fixed bottom-6 right-6 z-40 items-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-full shadow-lg hover:bg-blue-700 active:scale-95 transition-all font-semibold text-sm"
        title="Quick Log Call"
      >
        <span className="text-lg leading-none">⚡</span> Quick Log
      </button>

      {showQuickLog && <QuickLogModal onClose={() => setShowQuickLog(false)} onSaved={() => setShowQuickLog(false)} />}
    </div>
  );
}
