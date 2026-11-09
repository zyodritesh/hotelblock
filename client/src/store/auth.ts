import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'executive' | 'call_center';
}

interface AuthState {
  user: User | null;
  token: string | null;
  activePropertyId: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
  setActiveProperty: (id: string | null) => void;
  isAdmin: () => boolean;
  isManager: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      activePropertyId: null,
      login: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null, activePropertyId: null }),
      setActiveProperty: (id) => set({ activePropertyId: id }),
      isAdmin: () => get().user?.role === 'admin',
      isManager: () => ['admin', 'manager'].includes(get().user?.role || ''),
    }),
    { name: 'hotelblock-auth' }
  )
);
