import axios, { type InternalAxiosRequestConfig } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:9527';
export const api = axios.create({ baseURL: BASE_URL, timeout: 15000 });

const pendingRequests = new Map<string, AbortController>();
function buildRequestKey(config: InternalAxiosRequestConfig): string {
  return `${config.method?.toUpperCase()}:${config.url}:${JSON.stringify(config.params ?? {})}`;
}

export async function initApiUrl() {}

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];
const flushQueue = (token: string) => { refreshQueue.forEach(cb => cb(token)); refreshQueue = []; };

api.interceptors.request.use((config) => {
  if (config.method?.toUpperCase() === 'GET') {
    const key = buildRequestKey(config);
    const existing = pendingRequests.get(key);
    if (existing) { existing.abort(); pendingRequests.delete(key); }
    const controller = new AbortController();
    config.signal = controller.signal;
    pendingRequests.set(key, controller);
  }
  return config;
}, (error) => Promise.reject(error));

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) { config.headers.Authorization = `Bearer ${token}`; }
  return config;
});

api.interceptors.response.use(
  (res) => {
    if (res.config.method?.toUpperCase() === 'GET') { const key = buildRequestKey(res.config); pendingRequests.delete(key); }
    return res;
  },
  async (err) => {
    if (axios.isCancel(err) || err.name === 'CanceledError') { return Promise.reject(err); }
    const original = err.config;
    if (original?.method?.toUpperCase() === 'GET') { const key = buildRequestKey(original); pendingRequests.delete(key); }
    if (err.response?.status === 401 && !original?._retry && !original?.url?.includes('/auth/refresh')) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) { logout(); return Promise.reject(err); }
      if (isRefreshing) {
        return new Promise((resolve) => { refreshQueue.push((token: string) => { original.headers.Authorization = `Bearer ${token}`; resolve(api(original)); }); });
      }
      original._retry = true; isRefreshing = true;
      try {
        const res = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: refreshToken });
        if (res.data.success) {
          const { token: newToken, refresh_token: newRefresh } = res.data;
          localStorage.setItem('token', newToken); localStorage.setItem('refreshToken', newRefresh);
          api.defaults.headers.common.Authorization = `Bearer ${newToken}`;
          flushQueue(newToken); original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        } else { logout(); return Promise.reject(err); }
      } catch { logout(); return Promise.reject(err); }
      finally { isRefreshing = false; }
    }
    return Promise.reject(err);
  }
);

function logout() {
  localStorage.removeItem('token'); localStorage.removeItem('refreshToken');
  localStorage.removeItem('role'); localStorage.removeItem('user');
  window.location.href = '/login';
}

export const authApi = {
  sendCode: (email: string) => api.post('/auth/send-code', { email }),
  register: (data: { username: string; email: string; password: string; code: string }) => api.post('/auth/register', data),
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refresh_token: refreshToken }),
  sendResetCode: (email: string) => api.post('/auth/send-reset-code', { email }),
  resetPassword: (data: { email: string; code: string; new_password: string }) => api.post('/auth/reset-password', data),
};

export const adminApi = {
  getStats: () => api.get('/admin/stats'),
  getMerchants: (params?: { page?: number; page_size?: number; keyword?: string; plan?: string }) => api.get('/admin/merchants', { params }),
  updateMerchantStatus: (id: string, status: string) => api.patch(`/admin/merchants/${id}/status`, { status }),
  updateMerchantPlan: (id: string, plan: 'free' | 'pro', expires_days?: number) => api.patch(`/admin/merchants/${id}/plan`, { plan, expires_days }),
  getPlanConfigs: () => api.get('/admin/plan-configs'),
  updatePlanConfig: (id: string, data: { label?: string; max_apps?: number; max_cards?: number; max_devices?: number; max_gen_once?: number }) => api.patch(`/admin/plan-configs/${id}`, data),
  // 风控
  getBlacklist: (params?: { page?: number; page_size?: number; tp?: string }) => api.get('/admin/blacklist', { params }),
  addBlacklist: (data: { tp: string; value: string; reason?: string }) => api.post('/admin/blacklist', data),
  removeBlacklist: (id: string) => api.delete(`/admin/blacklist/${id}`),
  getBlacklistStats: () => api.get('/admin/blacklist/stats'),
  getWhitelist: (params?: { page?: number; page_size?: number; tp?: string }) => api.get('/admin/whitelist', { params }),
  addWhitelist: (data: { tp: string; value: string; reason?: string }) => api.post('/admin/whitelist', data),
  removeWhitelist: (id: string) => api.delete(`/admin/whitelist/${id}`),
  getWhitelistStats: () => api.get('/admin/whitelist/stats'),
  getHeartbeats: (params?: { page?: number; page_size?: number }) => api.get('/admin/heartbeats', { params }),
  getHeartbeatStats: () => api.get('/admin/heartbeats/stats'),
  getAlerts: (params?: { page?: number; page_size?: number }) => api.get('/admin/alerts', { params }),
  markAlertRead: (id: string) => api.patch(`/admin/alerts/${id}/read`),
  getAlertStats: () => api.get('/admin/alerts/stats'),
  getRiskSettings: () => api.get('/admin/risk-settings'),
  saveRiskSetting: (key: string, value: any) => api.post('/admin/risk-settings', { key, value }),
};

export const appsApi = {
  list: (params?: { page?: number; page_size?: number }) => api.get('/apps', { params }),
  create: (data: { app_name: string; description?: string }) => api.post('/apps', data),
  delete: (id: string) => api.delete(`/apps/${id}`),
  updateStatus: (id: string, status: string) => api.patch(`/apps/${id}/status`, { status }),
};

export const cardsApi = {
  list: (params?: { app_id?: string; status?: string; page?: number; page_size?: number }) => api.get('/cards', { params }),
  exportCsv: (params?: { app_id?: string; status?: string }) => api.get('/cards/export', { params, responseType: 'blob' }),
  disable: (id: string) => api.patch(`/cards/${id}/disable`),
  enable: (id: string) => api.patch(`/cards/${id}/enable`),
  delete: (id: string) => api.delete(`/cards/${id}`),
  batchStatus: (ids: string[], action: 'disabled' | 'unused') => api.post('/cards/batch-status', { ids, action }),
  batchExtend: (ids: string[], days: number) => api.post('/cards/batch-extend', { ids, days }),
  stats: () => api.get('/cards/stats'),
  generate: (data: { app_id: string; count: number; duration_days: number; max_devices: number; note?: string; prefix?: string; segment_count?: number; segment_len?: number }) => api.post('/cards', data),
};

export const activationsApi = {
  list: (params?: { page?: number; page_size?: number; card_code?: string }) => api.get('/activations', { params }),
  unbind: (id: string) => api.delete(`/activations/${id}`),
};

export const merchantApi = {
  getProfile: () => api.get('/merchant/profile'),
  dashboardStats: (range?: 'week' | 'month' | 'year') => api.get('/merchant/dashboard-stats', { params: { range } }),
  changePassword: (data: { old_password: string; new_password: string }) => api.post('/merchant/change-password', data),
  regenerateApiKey: () => api.post('/merchant/regenerate-apikey'),
};

export const adminMessagesApi = {
  list: (params?: { page?: number; page_size?: number; msg_type?: string }) => api.get('/admin/messages', { params }),
  send: (data: { msg_type: string; title: string; content: string; target_type?: string; target_id?: string; target_email?: string; pinned?: boolean; expires_at?: string }) => api.post('/admin/messages', data),
  update: (id: string, data: { title?: string; content?: string; pinned?: boolean; expires_at?: string }) => api.patch(`/admin/messages/${id}`, data),
  delete: (id: string) => api.delete(`/admin/messages/${id}`),
};

export const merchantMessagesApi = {
  listNotices: (params?: { page?: number; page_size?: number }) => api.get('/merchant/notices', { params }),
  listMessages: (params?: { page?: number; page_size?: number }) => api.get('/merchant/messages', { params }),
  unreadCount: () => api.get('/merchant/messages/unread_count'),
  markRead: (id: string) => api.post(`/merchant/messages/${id}/read`),
};

export function getWsUrl(): string {
  const base = (import.meta.env.VITE_API_URL || 'http://localhost:9527') as string;
  const ws = base.replace(/^http/, 'ws');
  const token = localStorage.getItem('token') ?? '';
  return `${ws}/ws/messages?token=${encodeURIComponent(token)}`;
}

export const healthApi = { check: () => api.get('/health'), };

export const agentApi = {
  createInvite: (data: { quota_total?: number; commission_rate?: number; note?: string }) => api.post('/agent/invite', data),
  listAgents: (params?: { page?: number; page_size?: number }) => api.get('/agent/list', { params }),
  updateQuota: (id: string, delta: number, reason?: string) => api.patch(`/agent/${id}/quota`, { delta, reason }),
  updateCommission: (id: string, commission_rate: number) => api.patch(`/agent/${id}/commission`, { commission_rate }),
  updateStatus: (id: string, status: 'active' | 'disabled') => api.patch(`/agent/${id}/status`, { status }),
  removeAgent: (id: string) => api.delete(`/agent/${id}`),
  listCommissions: (params?: { page?: number; page_size?: number }) => api.get('/agent/commissions', { params }),
  myRelation: () => api.get('/agent/my'),
  myCommissions: (params?: { page?: number; page_size?: number }) => api.get('/agent/my/commissions', { params }),
  joinByInvite: (code: string) => api.post(`/agent/join/${code}`),
};

export const blacklistApi = {
  listIps: (params?: { page?: number; page_size?: number }) => api.get('/blacklist/ips', { params }),
  addIp: (ip: string, reason?: string) => api.post('/blacklist/ips', { ip, reason }),
  removeIp: (id: string) => api.delete(`/blacklist/ips/${id}`),
  listDevices: (params?: { page?: number; page_size?: number }) => api.get('/blacklist/devices', { params }),
  addDevice: (device_id: string, reason?: string) => api.post('/blacklist/devices', { device_id, reason }),
  removeDevice: (id: string) => api.delete(`/blacklist/devices/${id}`),
  listAlerts: (params?: { page?: number; page_size?: number }) => api.get('/blacklist/alerts', { params }),
  unreadAlertCount: () => api.get('/blacklist/alerts/unread_count'),
  markAlertRead: (id: string) => api.post(`/blacklist/alerts/${id}/read`),
};

export const webhookApi = {
  get: (appId: string) => api.get(`/webhooks/app/${appId}`),
  upsert: (appId: string, data: { url: string; secret?: string; enabled?: boolean; events?: string[] }) => api.put(`/webhooks/app/${appId}`, data),
  delete: (appId: string) => api.delete(`/webhooks/app/${appId}`),
  list: () => api.get('/webhooks'),
};
