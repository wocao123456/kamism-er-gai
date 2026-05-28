import { create } from 'zustand';

export interface User {
  id: string;
  username: string;
  email: string;
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
    set({ token: null, refreshToken: null, role: null, user: null, viewMode: null });
  },

  isAuthenticated: () => !!get().token,

  setViewMode: (mode) => set({ viewMode: mode }),

  ensureMerchantRecord: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const resp = await fetch('/api/merchant/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resp.ok) return; // 已有商户记录

      // 自动注册商户
      await fetch('/api/merchant/register', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: get().user?.username || 'admin',
          email: get().user?.email || 'admin@kamism.local',
          password: 'AdminAuto@123',
          code: '000000'
        })
      });
    } catch (e) {
      console.error('自动创建商户失败', e);
    }
  },
}));
