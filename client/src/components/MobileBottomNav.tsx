import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import QuickLogModal from './QuickLogModal';

const BOTTOM_NAV = [
  { path: '/', icon: '📊', label: 'Home' },
  { path: '/calls', icon: '📞', label: 'Calls' },
  { path: '/pipeline', icon: '🔄', label: 'Pipeline' },
  { path: '/agents/due', icon: '🔔', label: 'Follow-ups' },
  { path: '/calendar', icon: '📅', label: 'Calendar' },
];

export default function MobileBottomNav({ overdueCount }: { overdueCount?: number }) {
  const location = useLocation();
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  return (
    <>
      {/* Bottom nav bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex items-stretch shadow-lg">
        {BOTTOM_NAV.map((item, i) => {
          const active = item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path);
          const showBadge = item.path === '/agents/due' && (overdueCount ?? 0) > 0;
          return (
            <Link key={item.path} to={item.path}
              className={`flex-1 flex flex-col items-center justify-center py-2 text-xs font-medium transition-colors relative ${active ? 'text-blue-600' : 'text-gray-500'}`}>
              <span className="text-xl leading-none mb-0.5 relative">
                {item.icon}
                {showBadge && (
                  <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[9px] font-bold px-1 rounded-full min-w-[14px] text-center leading-tight">
                    {(overdueCount ?? 0) > 9 ? '9+' : overdueCount}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-full" />}
            </Link>
          );
        })}
      </nav>

      {/* FAB — Quick Log Call */}
      <button
        onClick={() => setShowQuickLog(true)}
        className="lg:hidden fixed bottom-20 right-4 z-40 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-blue-700 active:scale-95 transition-all"
        title="Quick Log Call"
      >
        ＋
      </button>

      {showQuickLog && (
        <QuickLogModal
          onClose={() => setShowQuickLog(false)}
          onSaved={() => {}}
        />
      )}
    </>
  );
}
