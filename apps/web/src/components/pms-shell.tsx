'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BedDouble,
  CalendarRange,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  MoonStar,
  RadioTower,
  Sparkles,
  UserRoundPlus,
} from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import clsx from 'clsx';

const NAV = [
  { href: '/app/dashboard', label: 'Command Centre', icon: LayoutDashboard },
  { href: '/app/tape', label: 'Tape Chart', icon: CalendarRange },
  { href: '/app/reservations/new', label: 'New Reservation', icon: UserRoundPlus },
  { href: '/app/arrivals', label: 'Arrivals', icon: BedDouble },
  { href: '/app/housekeeping', label: 'Housekeeping', icon: Sparkles },
  { href: '/app/night-audit', label: 'Night Audit', icon: MoonStar },
  { href: '/app/distribution', label: 'Channels', icon: RadioTower },
];

export function PmsShell({ children }: { children: ReactNode }) {
  const { user, property, loading, logout, setPropertyId } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user || !property) {
    return (
      <div className="min-h-screen grid place-items-center text-[var(--ink-muted)]">
        Loading Hotel OS…
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="relative overflow-hidden text-white px-4 py-5"
        style={{
          background:
            'linear-gradient(165deg, #0b1f33 0%, #12324d 48%, #0d5c56 140%)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(62,207,186,0.25), transparent 40%), radial-gradient(circle at 80% 0%, rgba(255,255,255,0.08), transparent 35%)',
          }}
        />
        <div className="relative">
          <div className="mb-8 px-1">
            <div
              className="text-[1.55rem] font-bold tracking-[-0.04em]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Hotel OS
            </div>
            <div className="mt-1 text-xs text-white/65">Property Management</div>
          </div>

          <nav className="space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx('nav-link', active && 'active')}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-10 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-[0.7rem] uppercase tracking-[0.08em] text-white/50">
              Signed in
            </div>
            <div className="mt-1 font-semibold">{user.fullName}</div>
            <div className="text-xs text-white/60">{user.roles[0]}</div>
            <button
              className="mt-3 inline-flex items-center gap-2 text-xs text-white/75 hover:text-white"
              onClick={() => {
                logout();
                router.push('/login');
              }}
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[rgba(244,247,250,0.82)] backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <span className="live-dot" />
              <div>
                <div className="text-sm font-bold">{property.name}</div>
                <div className="text-xs text-[var(--ink-muted)]">
                  Business date {property.businessDate} · {property.timezone}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <select
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
                value={property.id}
                onChange={(e) => setPropertyId(e.target.value)}
              >
                {user.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
              <div className="hidden sm:flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs text-[var(--ink-muted)]">
                <ClipboardCheck size={14} />
                Audit on
              </div>
            </div>
          </div>
        </header>
        <main className="px-5 py-5">{children}</main>
      </div>
    </div>
  );
}
