'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type AuthUser, type LoginResponse, type PropertySummary } from './api';

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  property: PropertySummary | null;
  loading: boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<void>;
  logout: () => void;
  setPropertyId: (id: string) => void;
};

const AuthContext = createContext<AuthState | null>(null);
const TOKEN_KEY = 'hotel_os_token';
const PROPERTY_KEY = 'hotel_os_property';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [property, setProperty] = useState<PropertySummary | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async (accessToken: string) => {
    const me = await api<AuthUser>('/v1/auth/me', { token: accessToken });
    setToken(accessToken);
    setUser(me);
    const saved = localStorage.getItem(PROPERTY_KEY);
    const selected =
      me.properties.find((p) => p.id === saved) || me.properties[0] || null;
    setProperty(selected);
    if (selected) localStorage.setItem(PROPERTY_KEY, selected.id);
  }, []);

  useEffect(() => {
    const existing = localStorage.getItem(TOKEN_KEY);
    if (!existing) {
      setLoading(false);
      return;
    }
    hydrate(existing)
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [hydrate]);

  const login = useCallback(
    async (email: string, password: string, tenantSlug = 'demo') => {
      const res = await api<LoginResponse>('/v1/auth/login', {
        method: 'POST',
        body: { email, password, tenantSlug },
      });
      localStorage.setItem(TOKEN_KEY, res.accessToken);
      await hydrate(res.accessToken);
    },
    [hydrate],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setProperty(null);
  }, []);

  const setPropertyId = useCallback(
    (id: string) => {
      const next = user?.properties.find((p) => p.id === id) || null;
      setProperty(next);
      if (next) localStorage.setItem(PROPERTY_KEY, next.id);
    },
    [user],
  );

  const value = useMemo(
    () => ({ token, user, property, loading, login, logout, setPropertyId }),
    [token, user, property, loading, login, logout, setPropertyId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
