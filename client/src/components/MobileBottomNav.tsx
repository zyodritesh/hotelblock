import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const BOTTOM_NAV = [
  { path: '/phone', icon: '📲', label: 'Phone' },
  { path: '/chat', icon: '💬', label: 'Chat' },
  { path: '/', icon: '📊', label: 'Home' },
  { path: '/pipeline', icon: '🔄', label: 'Leads' },
  { path: '/calendar', icon: '📅', label: 'Calendar' },
];

export default function MobileBottomNav({ overdueCount, chatUnread }: { overdueCount?: number; chatUnread?: number }) {
  const location = useLocation();
  if (/^\/chat\/.+/.test(location.pathname)) return null;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex items-stretch shadow-lg" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {BOTTOM_NAV.map((item) => {
        const active = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
        const badge = item.path === '/chat' ? (chatUnread ?? 0) : item.path === '/agents/due' ? (overdueCount ?? 0) : 0;
        return (
          <Link key={item.path} to={item.path}
            className={`flex-1 min-w-0 flex flex-col items-center justify-center py-2 text-[11px] font-medium transition-colors relative ${active ? 'text-blue-600' : 'text-gray-500'}`}>
            <span className="h-7 w-7 flex items-center justify-center text-[22px] relative">
              {item.icon}
              {badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold px-1 rounded-full min-w-[14px] text-center leading-none">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </span>
            <span className="leading-none mt-0.5">{item.label}</span>
            {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-full" />}
          </Link>
        );
      })}
    </nav>
  );
}
