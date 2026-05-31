import { create } from 'zustand';

export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  background_url?: string;
  api_key?: string;
  status?: string;
  plan?: string;
  plan_expires_at?: string | null;
  email_verified?: boolean;
  created_at?: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  role: 'admin' | 'merchant' | null;
  user: User | null;
  viewMode: 'admin' | 'merchant' | null;
  setAuth: (token: string, refreshToken: string, role: 'admin' | 'merchant', user: User) => void;
  updateToken: (token: string, refreshToken: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  setViewMode: (mode: 'admin' | 'merchant' | null) => void;
  ensureMerchantRecord: () => Promise<void>;
  updateUser: (partial: Partial<User>) => void;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('token'),
  refreshToken: localStorage.getItem('refreshToken'),
  role: localStorage.getItem('role') as 'admin' | 'merchant' | null,
  user: (() => {
    try {
      const u = localStorage.getItem('user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  })(),
  viewMode: null,

  setAuth: (token, refreshToken, role, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('role', role);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, refreshToken, role, user, viewMode: null });
  },

  updateToken: (token, refreshToken) => {
    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', refreshToken);
    set({ token, refreshToken });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('role');
    localStorage.removeItem('user');
    document.documentElement.style.removeProperty('--custom-bg');
    set({ token: null, refreshToken: null, role: null, user: null, viewMode: null });
  },

  updateUser: (partial: Partial<User>) => {
    const updated = { ...get().user, ...partial } as User;
    localStorage.setItem('user', JSON.stringify(updated));
    set({ user: updated });
    // 触发侧栏同步事件
    window.dispatchEvent(new Event('merchant-sync'));
  },

  refreshProfile: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const res = await fetch('/api/profile', {
        headers: { Authorization: 'Bearer ' + token },
      });
      const json = await res.json();
      if (json.success && json.data) {
        const u = json.data;
        localStorage.setItem('user', JSON.stringify(u));
        set({ user: u });
      }
    } catch (e) {
      console.error('refreshProfile failed', e);
    }
  },

  isAuthenticated: () => !!get().token,

  setViewMode: (mode) => set({ viewMode: mode }),

  ensureMerchantRecord: async () => {
    return;
  },
}));