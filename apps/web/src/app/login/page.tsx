'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('admin@hotel-os.demo');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) router.replace('/app/dashboard');
  }, [user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password, 'demo');
      router.push('/app/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden lg:block overflow-hidden text-white">
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(145deg, #0b1f33 0%, #12445a 42%, #0d8a7a 120%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.16), transparent 35%), radial-gradient(circle at 80% 70%, rgba(62,207,186,0.25), transparent 40%)',
          }}
        />
        <div className="relative h-full flex flex-col justify-between p-12">
          <div className="animate-rise">
            <div
              className="text-5xl font-extrabold tracking-[-0.05em]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Hotel OS
            </div>
            <p className="mt-4 max-w-md text-lg text-white/80 leading-relaxed">
              Run reservations, rooms, guests, front office, housekeeping,
              folios and OTA distribution from one trusted system.
            </p>
          </div>
          <div className="animate-rise-delay-1 grid grid-cols-3 gap-4 max-w-xl">
            {[
              ['Inventory', 'Source of truth'],
              ['Front desk', 'Keyboard-first'],
              ['Channex', 'OTA transport'],
            ].map(([title, sub]) => (
              <div
                key={title}
                className="rounded-xl border border-white/15 bg-white/8 p-4 backdrop-blur"
              >
                <div className="font-bold">{title}</div>
                <div className="text-sm text-white/65 mt-1">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid place-items-center p-6">
        <form
          onSubmit={onSubmit}
          className="panel w-full max-w-md p-7 animate-rise-delay-2"
        >
          <div
            className="text-3xl font-bold tracking-[-0.04em] lg:hidden"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Hotel OS
          </div>
          <h1
            className="mt-2 text-2xl font-bold tracking-[-0.03em]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Sign in to PMS
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Demo tenant · India-first multi-property foundation
          </p>

          <div className="mt-6 space-y-4">
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>

          {error ? (
            <div className="mt-4 text-sm text-[var(--danger)]">{error}</div>
          ) : null}

          <button className="btn btn-primary mt-6 w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Enter Command Centre'}
          </button>

          <p className="mt-4 text-xs text-[var(--ink-muted)] leading-relaxed">
            Use <strong>admin@hotel-os.demo</strong> / <strong>password123</strong>
          </p>
        </form>
      </section>
    </div>
  );
}
