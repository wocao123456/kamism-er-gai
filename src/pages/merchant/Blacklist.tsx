import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, RefreshCw, Shield, AlertTriangle, CheckCircle, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '../../stores/confirm';

const API_BASE = window.location.origin;
const PAGE_SIZE = 10;

interface AlertEntry {
  id: string;
  alert_type: string;
  device_hint: string | null;
  ip_address: string | null;
  detail: string | null;
  is_read: boolean;
  created_at: string;
}

interface BlacklistEntry {
  id: string;
  type: string;
  value: string;
  reason: string | null;
  blocked_until: string | null;
  created_at: string;
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: 24
};

const sectionTitle: React.CSSProperties = {
  fontWeight: 800,
  fontSize: 15,
  marginBottom: 20,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: 'var(--text)'
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 0',
  borderBottom: '1px solid var(--border-light)'
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500
};

const inputNum: React.CSSProperties = {
  width: 56,
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 13,
  textAlign: 'center'
};

const inputFull: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: 13,
  boxSizing: 'border-box'
};

const checkboxStyle: React.CSSProperties = {
  width: 18,
  height: 18,
  cursor: 'pointer',
  accentColor: 'var(--accent)'
};

const subText: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-muted)',
  lineHeight: 1.8,
  marginTop: 8
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 18px',
  borderRadius: 10,
  border: 'none',
  background: 'var(--accent)',
  color: '#fff',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer'
};

const ALERT_TYPE_LABELS: Record<string, { label: string; level: 'severe' | 'warn' | 'info' }> = {
  card_rate_block: { label: '卡密超限封禁', level: 'severe' },
  rate_warn: { label: '卡密频率警告', level: 'warn' },
  ip_abuse: { label: 'IP频繁激活', level: 'severe' },
  device_multi_card: { label: '设备多卡告警', level: 'warn' },
  auto_block: { label: '自动封禁', level: 'severe' },
  auto_unblock: { label: '自动解封', level: 'info' },
};

const API_KEYS = ['rate_activate', 'rate_verify', 'rate_auth_key', 'rate_sign', 'rate_encrypt', 'rate_decrypt'] as const;
const API_LABELS: Record<string, string> = {
  rate_activate: '激活接口',
  rate_verify: '验证接口',
  rate_auth_key: '鉴权密钥',
  rate_sign: '签名接口',
  rate_encrypt: '加密接口',
  rate_decrypt: '解密接口'
};

export default function Blacklist() {
  const [tab, setTab] = useState<'alerts' | 'blacklist' | 'whitelist' | 'settings'>('alerts');
  const confirm = useConfirm();
  const [submitting, setSubmitting] = useState(false);

  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [alertTotal, setAlertTotal] = useState(0);
  const [alertPage, setAlertPage] = useState(1);
  const [alertLoading, setAlertLoading] = useState(false);
  const [alertSearch, setAlertSearch] = useState('');
  const [alertTypeFilter, setAlertTypeFilter] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [showAlertDetail, setShowAlertDetail] = useState(false);
  const [alertDetail, setAlertDetail] = useState<AlertEntry | null>(null);

  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [blTotal, setBlTotal] = useState(0);
  const [blPage, setBlPage] = useState(1);
  const [blLoading, setBlLoading] = useState(false);
  const [blFilter, setBlFilter] = useState('');
  const [showBlModal, setShowBlModal] = useState(false);
  const [blForm, setBlForm] = useState({ tp: 'ip', value: '', reason: '' });
  const [blStats, setBlStats] = useState({ ip_total: 0, dev_total: 0, card_total: 0, ip_today: 0, dev_today: 0, card_today: 0 });
  const [showBlDetail, setShowBlDetail] = useState(false);
  const [blDetail, setBlDetail] = useState<BlacklistEntry | null>(null);

  const [whitelist, setWhitelist] = useState<BlacklistEntry[]>([]);
  const [wlTotal, setWlTotal] = useState(0);
  const [wlPage, setWlPage] = useState(1);
  const [wlLoading, setWlLoading] = useState(false);
  const [wlFilter, setWlFilter] = useState('');
  const [showWlModal, setShowWlModal] = useState(false);
  const [wlForm, setWlForm] = useState({ tp: 'ip', value: '', reason: '' });
  const [wlStats, setWlStats] = useState({ ip_total: 0, dev_total: 0, card_total: 0 });
  const [showWlDetail, setShowWlDetail] = useState(false);
  const [wlDetail, setWlDetail] = useState<BlacklistEntry | null>(null);

  const [settings, setSettings] = useState<Record<string, any>>({});
  const [settingsLoading, setSettingsLoading] = useState(false);

  const api = (url: string, method = 'GET', body?: any) => fetch(`${API_BASE}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(r => r.json());

  const loadAlerts = useCallback((p = alertPage) => {
    setAlertLoading(true);
    api(`/api/admin/alerts?page=${p}&page_size=${PAGE_SIZE}`).then(d => {
      if (d.success) { setAlerts(d.data); setAlertTotal(d.total); }
    }).finally(() => setAlertLoading(false));
  }, [alertPage]);

  const loadUnread = useCallback(() => {
    api('/api/admin/alerts/stats').then(d => {
      if (d.success) setUnreadCount(d.data.unread || 0);
    }).catch(() => {});
  }, []);

  const markRead = async (id: string) => {
    await api(`/api/admin/alerts/${id}/read`, 'PATCH');
    setAlerts(p => p.map(a => a.id === id ? { ...a, is_read: true } : a));
    setUnreadCount(c => Math.max(0, c - 1));
  };

  const loadBlacklist = useCallback((p = blPage) => {
    setBlLoading(true);
    api(`/api/admin/blacklist?page=${p}&page_size=${PAGE_SIZE}&tp=${blFilter}`).then(d => {
      if (d.success) { setBlacklist(d.data); setBlTotal(d.total); }
    }).finally(() => setBlLoading(false));
  }, [blPage, blFilter]);

  const loadBlStats = useCallback(() => {
    api('/api/admin/blacklist/stats').then(d => {
      if (d.success) setBlStats(d.data);
    }).catch(() => {});
  }, []);

  const addBlacklist = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await api('/api/admin/blacklist', 'POST', blForm);
      if (r.success) {
        toast.success('已添加');
        setShowBlModal(false);
        setBlForm({ tp: 'ip', value: '', reason: '' });
        loadBlacklist();
        loadBlStats();
      } else {
        toast.error(r.message);
      }
    } catch {
      toast.error('添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  const removeBlacklist = async (id: string) => {
    const ok = await confirm({ title: '移除', message: '确认移除？', confirmText: '移除', danger: true });
    if (!ok) return;
    try {
      await api(`/api/admin/blacklist/${id}`, 'DELETE');
      toast.success('已移除');
      loadBlacklist();
      loadBlStats();
    } catch {
      toast.error('操作失败');
    }
  };

  const loadWhitelist = useCallback((p = wlPage) => {
    setWlLoading(true);
    api(`/api/admin/whitelist?page=${p}&page_size=${PAGE_SIZE}&tp=${wlFilter}`).then(d => {
      if (d.success) { setWhitelist(d.data); setWlTotal(d.total); }
    }).finally(() => setWlLoading(false));
  }, [wlPage, wlFilter]);

  const loadWlStats = useCallback(() => {
    api('/api/admin/whitelist/stats').then(d => {
      if (d.success) setWlStats(d.data);
    }).catch(() => {});
  }, []);

  const addWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await api('/api/admin/whitelist', 'POST', wlForm);
      if (r.success) {
        toast.success('已添加');
        setShowWlModal(false);
        setWlForm({ tp: 'ip', value: '', reason: '' });
        loadWhitelist();
        loadWlStats();
      } else {
        toast.error(r.message);
      }
    } catch {
      toast.error('添加失败');
    } finally {
      setSubmitting(false);
    }
  };

  const removeWhitelist = async (id: string) => {
    const ok = await confirm({ title: '移除', message: '确认移除？', confirmText: '移除', danger: true });
    if (!ok) return;
    try {
      await api(`/api/admin/whitelist/${id}`, 'DELETE');
      toast.success('已移除');
      loadWhitelist();
      loadWlStats();
    } catch {
      toast.error('操作失败');
    }
  };

  const defaults: Record<string, any> = {
    robot_enabled: true,
    rate_activate: { enabled: true, ip_limit: 30, card_warn: 30, card_block: 50 },
    rate_verify: { enabled: true, ip_limit: 60, card_warn: 30, card_block: 50 },
    rate_auth_key: { enabled: true, ip_limit: 0, card_warn: 30, card_block: 50 },
    rate_sign: { enabled: true, ip_limit: 20, card_warn: 30, card_block: 50 },
    rate_encrypt: { enabled: true, ip_limit: 20, card_warn: 30, card_block: 50 },
    rate_decrypt: { enabled: true, ip_limit: 20, card_warn: 30, card_block: 50 },
    heartbeat: { enabled: true, interval: 30, timeout: 120 },
    auto_block: { ip_fail_enabled: true, ip_fail_threshold: 5, device_multi_card: true, device_card_limit: 3 },
    violation: { reset_days: 7 },
    unblock: { auto_unblock: true, permanent_on_relapse: false, relapse_hours: 24 },
    notify: { websocket: true }
  };

  const loadSettings = useCallback(() => {
    setSettingsLoading(true);
    api(`/api/admin/risk-settings`).then(d => {
      if (d.success) setSettings({ ...defaults, ...d.data });
    }).finally(() => setSettingsLoading(false));
  }, []);

  const saveSettings = async (key: string, value: any) => {
    await api('/api/admin/risk-settings', 'POST', { key, value });
  };

  const blockIp = async (ip: string) => {
    await api('/api/admin/blacklist', 'POST', { tp: 'ip', value: ip, reason: '告警封禁' });
    toast.success('IP已封禁');
    loadBlacklist();
    loadBlStats();
  };

  const blockDevice = async (device: string) => {
    await api('/api/admin/blacklist', 'POST', { tp: 'device', value: device, reason: '告警封禁' });
    toast.success('设备已封禁');
    loadBlacklist();
    loadBlStats();
  };

  useEffect(() => {
    loadUnread();
    if (tab === 'alerts') loadAlerts(1);
    else if (tab === 'blacklist') { loadBlacklist(1); loadBlStats(); }
    else if (tab === 'whitelist') { loadWhitelist(1); loadWlStats(); }
    else if (tab === 'settings') loadSettings();
  }, [tab, loadAlerts, loadBlacklist, loadBlStats, loadWhitelist, loadWlStats, loadSettings]);

  const tabs = [
    { key: 'alerts', label: '异常告警', icon: <AlertTriangle size={14} /> },
    { key: 'blacklist', label: '黑名单', icon: <Shield size={14} /> },
    { key: 'whitelist', label: '白名单', icon: <CheckCircle size={14} /> },
    { key: 'settings', label: '设置', icon: <Settings2 size={14} /> },
  ] as const;

  const filteredAlerts = alerts.filter(a => {
    if (alertSearch && !JSON.stringify(a).toLowerCase().includes(alertSearch.toLowerCase())) return false;
    if (alertTypeFilter && a.alert_type !== alertTypeFilter) return false;
    return true;
  });

  const getLevelIcon = (level: string) => level === 'severe' ? '🔴' : level === 'warn' ? '🟡' : '🔵';

  const formatReason = (reason: string | null) => {
    if (!reason) return '—';
    if (reason.length > 30) return reason.slice(0, 30) + '...';
    return reason;
  };

  const detailBoxStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '80px 1fr',
    gap: '10px 14px',
    fontSize: 13,
    lineHeight: 1.8,
    color: 'var(--text)'
  };

  const detailLabelStyle: React.CSSProperties = {
    color: 'var(--text-muted)',
    fontWeight: 500,
    fontSize: 12
  };

  const detailValueStyle: React.CSSProperties = {
    wordBreak: 'break-all',
    fontFamily: 'monospace',
    fontSize: 12
  };

  return (
    <div className="fade-in" style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">风控管理</h1>
          <p className="page-subtitle">异常告警 · 黑白名单 · 参数设置</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} style={{
            padding: '10px 20px',
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: tab === t.key ? 700 : 500,
            borderBottom: tab === t.key ? '3px solid var(--accent)' : '3px solid transparent',
            color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)',
            background: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.2s'
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ========== 异常告警 ========== */}
      {tab === 'alerts' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              未读 {unreadCount} | 🔴严重 {alerts.filter(a => ALERT_TYPE_LABELS[a.alert_type]?.level === 'severe').length} 🟡警告 {alerts.filter(a => ALERT_TYPE_LABELS[a.alert_type]?.level === 'warn').length} 🔵通知 {alerts.filter(a => ALERT_TYPE_LABELS[a.alert_type]?.level === 'info').length} ｜ 今日 {alertTotal} 条
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                placeholder="搜索..."
                value={alertSearch}
                onChange={e => setAlertSearch(e.target.value)}
                style={{
                  fontSize: 12,
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  width: 100
                }}
              />
              <select
                value={alertTypeFilter}
                onChange={e => setAlertTypeFilter(e.target.value)}
                style={{
                  fontSize: 12,
                  padding: '6px 8px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)'
                }}
              >
                <option value="">全部类型</option>
                {Object.entries(ALERT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <button className="btn btn-ghost" onClick={() => loadAlerts()}>
                <RefreshCw size={14} /> 刷新
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 50 }}>级别</th>
                  <th style={{ width: 110 }}>类型</th>
                  <th>设备</th>
                  <th style={{ width: 130 }}>IP</th>
                  <th style={{ width: 140 }}>时间</th>
                  <th style={{ width: 60 }}>状态</th>
                </tr>
              </thead>
              <tbody>
                {alertLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j}><span className="skeleton" style={{ width: '60%' }} /></td>
                      ))}
                    </tr>
                  ))
                ) : filteredAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">
                        <div className="empty-state-icon">✅</div>
                        <div className="empty-state-text">暂无异常告警</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAlerts.map((a, idx) => (
                    <tr
                      key={a.id}
                      className="data-enter"
                      style={{
                        animationDelay: `${idx * 30}ms`,
                        cursor: 'pointer',
                        opacity: a.is_read ? 0.6 : 1
                      }}
                      onClick={() => {
                        setAlertDetail(a);
                        setShowAlertDetail(true);
                        if (!a.is_read) markRead(a.id);
                      }}
                    >
                      <td style={{ textAlign: 'center' }}>
                        {getLevelIcon(ALERT_TYPE_LABELS[a.alert_type]?.level || 'info')}
                      </td>
                      <td>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 600,
                          background: 'rgba(248,113,113,0.12)',
                          color: '#f87171',
                          display: 'inline-block',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {ALERT_TYPE_LABELS[a.alert_type]?.label || a.alert_type}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 12,
                          fontFamily: 'monospace',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'var(--text)'
                        }}>
                          {a.device_hint || '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 12,
                          fontFamily: 'monospace',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'var(--accent)'
                        }}>
                          {a.ip_address || '—'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(a.created_at).toLocaleString('zh-CN')}
                        </span>
                      </td>
                      <td>
                        {a.is_read ? (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>已读</span>
                        ) : (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 10,
                            fontSize: 10,
                            fontWeight: 600,
                            background: 'rgba(52,211,153,0.15)',
                            color: '#34d399'
                          }}>新</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {alertTotal > PAGE_SIZE && (
            <div className="pagination">
              {Array.from({ length: Math.ceil(alertTotal / PAGE_SIZE) }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  className={`page-btn ${p === alertPage ? 'active' : ''}`}
                  onClick={() => { setAlertPage(p); loadAlerts(p); }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* 告警详情弹窗 */}
          {showAlertDetail && alertDetail && (
            <div className="modal-overlay" onClick={() => setShowAlertDetail(false)}>
              <div className="modal" style={{ maxWidth: 450, borderRadius: 20, padding: 28 }} onClick={e => e.stopPropagation()}>
                <h2 className="modal-title" style={{ marginBottom: 16 }}>📋 告警详情</h2>
                <div style={detailBoxStyle}>
                  <span style={detailLabelStyle}>级别</span>
                  <span>{getLevelIcon(ALERT_TYPE_LABELS[alertDetail.alert_type]?.level || 'info')} {ALERT_TYPE_LABELS[alertDetail.alert_type]?.level === 'severe' ? '严重' : ALERT_TYPE_LABELS[alertDetail.alert_type]?.level === 'warn' ? '警告' : '通知'}</span>
                  
                  <span style={detailLabelStyle}>类型</span>
                  <span>{ALERT_TYPE_LABELS[alertDetail.alert_type]?.label || alertDetail.alert_type}</span>
                  
                  <span style={detailLabelStyle}>时间</span>
                  <span>{new Date(alertDetail.created_at).toLocaleString('zh-CN')}</span>
                  
                  <span style={detailLabelStyle}>设备</span>
                  <span style={detailValueStyle}>{alertDetail.device_hint || '—'}</span>
                  
                  <span style={detailLabelStyle}>IP</span>
                  <span style={detailValueStyle}>{alertDetail.ip_address || '—'}</span>
                  
                  <span style={detailLabelStyle}>详情</span>
                  <span style={{ ...detailValueStyle, fontFamily: 'inherit', fontSize: 13 }}>{alertDetail.detail || '—'}</span>
                </div>
                <div className="modal-actions" style={{ marginTop: 16, gap: 8, flexWrap: 'wrap' }}>
                  {alertDetail.ip_address && (
                    <button className="btn btn-sm btn-danger" onClick={() => { blockIp(alertDetail.ip_address!); setShowAlertDetail(false); }}>
                      🚫 封禁IP
                    </button>
                  )}
                  {alertDetail.device_hint && (
                    <button className="btn btn-sm btn-danger" onClick={() => { blockDevice(alertDetail.device_hint!); setShowAlertDetail(false); }}>
                      🚫 封禁设备
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAlertDetail(false)}>关闭</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========== 黑名单 ========== */}
      {tab === 'blacklist' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              今日封禁 🌐IP {blStats.ip_today} 📱设备 {blStats.dev_today} 🔑卡密 {blStats.card_today} ｜ 总计 🌐IP {blStats.ip_total} 📱设备 {blStats.dev_total} 🔑卡密 {blStats.card_total}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={blFilter}
                onChange={e => { setBlFilter(e.target.value); setBlPage(1); setTimeout(() => loadBlacklist(1), 0); }}
                style={{
                  fontSize: 12,
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)'
                }}
              >
                <option value="">全部类型</option>
                <option value="ip">IP</option>
                <option value="device">设备</option>
                <option value="card">卡密</option>
              </select>
              <button className="btn btn-ghost" onClick={() => { loadBlacklist(); loadBlStats(); }}>
                <RefreshCw size={14} /> 刷新
              </button>
              <button className="btn btn-primary" onClick={() => setShowBlModal(true)}>
                <Plus size={14} /> 添加
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>类型</th>
                  <th>标识</th>
                  <th>原因</th>
                  <th style={{ width: 120 }}>封禁至</th>
                  <th style={{ width: 110 }}>时间</th>
                  <th style={{ width: 100 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {blLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j}><span className="skeleton" style={{ width: '60%' }} /></td>
                      ))}
                    </tr>
                  ))
                ) : blacklist.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">
                        <div className="empty-state-icon">🛡️</div>
                        <div className="empty-state-text">暂无黑名单</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  blacklist.map((b, idx) => (
                    <tr key={b.id} className="data-enter" style={{ animationDelay: `${idx * 30}ms` }}>
                      <td>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: b.type === 'ip' ? '#60a5fa' : b.type === 'card' ? '#a78bfa' : '#f59e0b'
                        }}>
                          {b.type === 'ip' ? '🌐IP' : b.type === 'card' ? '🔑卡密' : '📱设备'}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          color: 'var(--accent)',
                          fontSize: 12,
                          fontFamily: 'monospace',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {b.value}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          color: 'var(--text-muted)',
                          fontSize: 12,
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {formatReason(b.reason)}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 11 }}>
                          {b.blocked_until ? new Date(b.blocked_until).toLocaleString('zh-CN') : '永久'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(b.created_at).toLocaleString('zh-CN')}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ fontSize: 11, padding: '4px 10px' }}
                            onClick={() => { setBlDetail(b); setShowBlDetail(true); }}
                          >
                            详情
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => removeBlacklist(b.id)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {blTotal > PAGE_SIZE && (
            <div className="pagination">
              {Array.from({ length: Math.ceil(blTotal / PAGE_SIZE) }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  className={`page-btn ${p === blPage ? 'active' : ''}`}
                  onClick={() => { setBlPage(p); loadBlacklist(p); }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* 黑名单详情弹窗 */}
          {showBlDetail && blDetail && (
            <div className="modal-overlay" onClick={() => setShowBlDetail(false)}>
              <div className="modal" style={{ maxWidth: 450, borderRadius: 20, padding: 28 }} onClick={e => e.stopPropagation()}>
                <h2 className="modal-title" style={{ marginBottom: 16 }}>📋 {blDetail.type === 'ip' ? 'IP' : blDetail.type === 'card' ? '卡密' : '设备'}黑名单详情</h2>
                <div style={detailBoxStyle}>
                  <span style={detailLabelStyle}>类型</span>
                  <span>{blDetail.type === 'ip' ? '🌐 IP' : blDetail.type === 'card' ? '🔑 卡密' : '📱 设备'}</span>
                  
                  <span style={detailLabelStyle}>标识</span>
                  <span style={detailValueStyle}>{blDetail.value}</span>
                  
                  <span style={detailLabelStyle}>原因</span>
                  <span style={{ ...detailValueStyle, fontFamily: 'inherit', fontSize: 13 }}>{blDetail.reason || '—'}</span>
                  
                  <span style={detailLabelStyle}>添加时间</span>
                  <span>{new Date(blDetail.created_at).toLocaleString('zh-CN')}</span>
                  
                  <span style={detailLabelStyle}>封禁至</span>
                  <span>{blDetail.blocked_until ? new Date(blDetail.blocked_until).toLocaleString('zh-CN') : '永久'}</span>
                  
                  {blDetail.blocked_until && (
                    <>
                      <span style={detailLabelStyle}>剩余时间</span>
                      <span style={{ color: '#fbbf24' }}>
                        {Math.max(0, Math.floor((new Date(blDetail.blocked_until).getTime() - Date.now()) / 1000 / 60))} 分钟
                      </span>
                    </>
                  )}
                </div>
                <div className="modal-actions" style={{ marginTop: 16, gap: 8 }}>
                  <button className="btn btn-sm btn-danger" onClick={() => { removeBlacklist(blDetail.id); setShowBlDetail(false); }}>
                    ✅ 提前解封
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowBlDetail(false)}>关闭</button>
                </div>
              </div>
            </div>
          )}

          {/* 添加黑名单弹窗 */}
          {showBlModal && (
            <div className="modal-overlay" onClick={() => setShowBlModal(false)}>
              <div className="modal" style={{ maxWidth: 420, borderRadius: 20, padding: 28 }} onClick={e => e.stopPropagation()}>
                <h2 className="modal-title">添加黑名单</h2>
                <form onSubmit={addBlacklist}>
                  <div className="form-group">
                    <label className="form-label">类型</label>
                    <select
                      value={blForm.tp}
                      onChange={e => setBlForm({ ...blForm, tp: e.target.value })}
                      style={inputFull}
                    >
                      <option value="ip">🌐 IP</option>
                      <option value="device">📱 设备</option>
                      <option value="card">🔑 卡密</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{blForm.tp === 'ip' ? 'IP 地址' : blForm.tp === 'card' ? '卡密密钥' : '设备 ID'} *</label>
                    <input
                      placeholder={blForm.tp === 'ip' ? '如：192.168.1.1' : blForm.tp === 'card' ? '输入卡密密钥' : '输入设备ID'}
                      value={blForm.value}
                      onChange={e => setBlForm({ ...blForm, value: e.target.value })}
                      style={inputFull}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">原因（可选）</label>
                    <input
                      placeholder="如：频繁激活"
                      value={blForm.reason}
                      onChange={e => setBlForm({ ...blForm, reason: e.target.value })}
                      style={inputFull}
                    />
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => setShowBlModal(false)}>取消</button>
                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                      {submitting ? <span className="spinner" /> : '添加'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========== 白名单 ========== */}
      {tab === 'whitelist' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              🌐IP {wlStats.ip_total} ｜ 📱设备 {wlStats.dev_total} ｜ 🔑卡密 {wlStats.card_total}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={wlFilter}
                onChange={e => { setWlFilter(e.target.value); setWlPage(1); setTimeout(() => loadWhitelist(1), 0); }}
                style={{
                  fontSize: 12,
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)'
                }}
              >
                <option value="">全部类型</option>
                <option value="ip">IP</option>
                <option value="device">设备</option>
                <option value="card">卡密</option>
              </select>
              <button className="btn btn-ghost" onClick={() => { loadWhitelist(); loadWlStats(); }}>
                <RefreshCw size={14} /> 刷新
              </button>
              <button className="btn btn-primary" onClick={() => setShowWlModal(true)}>
                <Plus size={14} /> 添加
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>类型</th>
                  <th>标识</th>
                  <th>原因</th>
                  <th style={{ width: 120 }}>时间</th>
                  <th style={{ width: 100 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {wlLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j}><span className="skeleton" style={{ width: '60%' }} /></td>
                      ))}
                    </tr>
                  ))
                ) : whitelist.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">
                        <div className="empty-state-icon">✅</div>
                        <div className="empty-state-text">暂无白名单</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  whitelist.map((w, idx) => (
                    <tr key={w.id} className="data-enter" style={{ animationDelay: `${idx * 30}ms` }}>
                      <td>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: w.type === 'ip' ? '#60a5fa' : '#f59e0b'
                        }}>
                          {w.type === 'ip' ? '🌐IP' : '📱设备'}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          color: 'var(--accent)',
                          fontSize: 12,
                          fontFamily: 'monospace',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {w.value}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          color: 'var(--text-muted)',
                          fontSize: 12,
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {formatReason(w.reason)}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(w.created_at).toLocaleString('zh-CN')}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-sm btn-ghost"
                            style={{ fontSize: 11, padding: '4px 10px' }}
                            onClick={() => { setWlDetail(w); setShowWlDetail(true); }}
                          >
                            详情
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => removeWhitelist(w.id)}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {wlTotal > PAGE_SIZE && (
            <div className="pagination">
              {Array.from({ length: Math.ceil(wlTotal / PAGE_SIZE) }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  className={`page-btn ${p === wlPage ? 'active' : ''}`}
                  onClick={() => { setWlPage(p); loadWhitelist(p); }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* 白名单详情弹窗 */}
          {showWlDetail && wlDetail && (
            <div className="modal-overlay" onClick={() => setShowWlDetail(false)}>
              <div className="modal" style={{ maxWidth: 450, borderRadius: 20, padding: 28 }} onClick={e => e.stopPropagation()}>
                <h2 className="modal-title" style={{ marginBottom: 16 }}>📋 {wlDetail.type === 'ip' ? 'IP' : '设备'}白名单详情</h2>
                <div style={detailBoxStyle}>
                  <span style={detailLabelStyle}>类型</span>
                  <span>{wlDetail.type === 'ip' ? '🌐 IP' : '📱 设备'}</span>
                  
                  <span style={detailLabelStyle}>标识</span>
                  <span style={detailValueStyle}>{wlDetail.value}</span>
                  
                  <span style={detailLabelStyle}>原因</span>
                  <span style={{ ...detailValueStyle, fontFamily: 'inherit', fontSize: 13 }}>{wlDetail.reason || '—'}</span>
                  
                  <span style={detailLabelStyle}>添加时间</span>
                  <span>{new Date(wlDetail.created_at).toLocaleString('zh-CN')}</span>
                </div>
                <div className="modal-actions" style={{ marginTop: 16, gap: 8 }}>
                  <button className="btn btn-sm btn-danger" onClick={() => { removeWhitelist(wlDetail.id); setShowWlDetail(false); }}>
                    移除白名单
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowWlDetail(false)}>关闭</button>
                </div>
              </div>
            </div>
          )}

          {/* 添加白名单弹窗 */}
          {showWlModal && (
            <div className="modal-overlay" onClick={() => setShowWlModal(false)}>
              <div className="modal" style={{ maxWidth: 420, borderRadius: 20, padding: 28 }} onClick={e => e.stopPropagation()}>
                <h2 className="modal-title">添加白名单</h2>
                <form onSubmit={addWhitelist}>
                  <div className="form-group">
                    <label className="form-label">类型</label>
                    <select
                      value={wlForm.tp}
                      onChange={e => setWlForm({ ...wlForm, tp: e.target.value })}
                      style={inputFull}
                    >
                      <option value="ip">🌐 IP</option>
                      <option value="device">📱 设备</option>
                      <option value="card">🔑 卡密</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{wlForm.tp === 'ip' ? 'IP 地址' : wlForm.tp === 'card' ? '卡密密钥' : '设备 ID'} *</label>
                    <input
                      placeholder={wlForm.tp === 'ip' ? '如：192.168.1.1' : wlForm.tp === 'card' ? '输入卡密密钥' : '输入设备ID'}
                      value={wlForm.value}
                      onChange={e => setWlForm({ ...wlForm, value: e.target.value })}
                      style={inputFull}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">原因（可选）</label>
                    <input
                      placeholder="如：内部服务器"
                      value={wlForm.reason}
                      onChange={e => setWlForm({ ...wlForm, reason: e.target.value })}
                      style={inputFull}
                    />
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => setShowWlModal(false)}>取消</button>
                    <button type="submit" className="btn btn-primary" disabled={submitting}>
                      {submitting ? <span className="spinner" /> : '添加'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========== 设置 ========== */}
      {tab === 'settings' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-ghost" onClick={loadSettings}>
              <RefreshCw size={14} /> 刷新
            </button>
          </div>
          {settingsLoading ? (
            <div className="empty-state"><span className="spinner" /></div>
          ) : (
            <div style={{ display: 'grid', gap: 20, maxWidth: 750 }}>
              {/* 机器人总开关 */}
              <div style={cardStyle}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={settings.robot_enabled !== false}
                    onChange={e => {
                      const v = { ...settings, robot_enabled: e.target.checked };
                      setSettings(v);
                      saveSettings('robot_enabled', e.target.checked);
                    }}
                    style={checkboxStyle}
                  />
                  <span style={{ fontWeight: 700, fontSize: 16 }}>🤖 启用智能风控机器人</span>
                </label>
                <div style={subText}>关闭后仅使用固定规则，机器人暂停自动研判</div>
              </div>

              {/* 监控接口开关 */}
              <div style={cardStyle}>
                <div style={{ ...sectionTitle, justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <span>📡 监控接口开关</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={btnPrimary} onClick={() => {
                      Object.keys(settings).filter(k => k.startsWith('rate_')).forEach(k => saveSettings(k, settings[k]));
                      toast.success('已保存');
                    }}>
                      💾 保存全部
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setSettings({ ...settings, ...defaults });
                      Object.keys(defaults).filter(k => k.startsWith('rate_')).forEach(k => saveSettings(k, defaults[k]));
                      toast.success('已恢复默认');
                    }}>
                      🔄 恢复默认
                    </button>
                  </div>
                </div>
                <div style={{ ...subText, marginBottom: 16 }}>
                  同卡密1分钟超30次→⚠警告  超50次→🔒封禁（按叠加策略）
                </div>
                {API_KEYS.map(key => {
                  const cfg = settings[key] || {};
                  return (
                    <div key={key} style={rowStyle}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1 }}>
                        <input
                          type="checkbox"
                          checked={cfg.enabled !== false}
                          onChange={e => {
                            const v = { ...settings, [key]: { ...cfg, enabled: e.target.checked } };
                            setSettings(v);
                          }}
                          style={checkboxStyle}
                        />
                        <span style={labelStyle}>{API_LABELS[key] || key}</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>同IP</span>
                          <input
                            type="number"
                            value={cfg.ip_limit || 0}
                            onChange={e => {
                              const v = { ...settings, [key]: { ...cfg, ip_limit: parseInt(e.target.value) || 0 } };
                              setSettings(v);
                            }}
                            style={inputNum}
                          />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>同卡密</span>
                          <input
                            type="number"
                            value={cfg.card_warn || 30}
                            onChange={e => {
                              const v = { ...settings, [key]: { ...cfg, card_warn: parseInt(e.target.value) || 30 } };
                              setSettings(v);
                            }}
                            style={{ ...inputNum, width: 44 }}
                          />
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>⚠</span>
                          <input
                            type="number"
                            value={cfg.card_block || 50}
                            onChange={e => {
                              const v = { ...settings, [key]: { ...cfg, card_block: parseInt(e.target.value) || 50 } };
                              setSettings(v);
                            }}
                            style={{ ...inputNum, width: 44 }}
                          />
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>🔒</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>次/分</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 心跳检测 */}
              <div style={cardStyle}>
                <div style={sectionTitle}>💓 心跳检测</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <input
                    type="checkbox"
                    checked={settings.heartbeat?.enabled !== false}
                    onChange={e => {
                      const v = { ...settings, heartbeat: { ...(settings.heartbeat || {}), enabled: e.target.checked } };
                      setSettings(v);
                    }}
                    style={checkboxStyle}
                  />
                  <span style={{ fontWeight: 600 }}>启用心跳检测</span>
                </div>
                <div style={{ display: 'flex', gap: 24 }}>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                      心跳间隔(秒)
                    </label>
                    <input
                      type="number"
                      value={settings.heartbeat?.interval || 30}
                      onChange={e => {
                        const v = { ...settings, heartbeat: { ...(settings.heartbeat || {}), interval: parseInt(e.target.value) } };
                        setSettings(v);
                      }}
                      style={{ ...inputFull, width: 90, textAlign: 'center' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                      超时阈值(秒)
                    </label>
                    <input
                      type="number"
                      value={settings.heartbeat?.timeout || 120}
                      onChange={e => {
                        const v = { ...settings, heartbeat: { ...(settings.heartbeat || {}), timeout: parseInt(e.target.value) } };
                        setSettings(v);
                      }}
                      style={{ ...inputFull, width: 90, textAlign: 'center' }}
                    />
                  </div>
                </div>
                <div style={{ ...subText, marginTop: 14 }}>
                  <b>🤖 智能机器人：</b>波动识别 | 不稳定检测 | 频繁断连 | 慢速攻击 | 时间戳跳跃 | 同IP多设备 | 行为模式异常
                </div>
                <button style={{ ...btnPrimary, marginTop: 16 }} onClick={() => {
                  saveSettings('heartbeat', settings.heartbeat || {});
                  toast.success('已保存');
                }}>
                  💾 保存心跳设置
                </button>
              </div>

              {/* 自动封禁规则 */}
              <div style={cardStyle}>
                <div style={sectionTitle}>🤖 自动封禁规则</div>
                <div style={rowStyle}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.auto_block?.ip_fail_enabled !== false}
                      onChange={e => {
                        const v = { ...settings, auto_block: { ...(settings.auto_block || {}), ip_fail_enabled: e.target.checked } };
                        setSettings(v);
                      }}
                      style={checkboxStyle}
                    />
                    <span style={labelStyle}>IP失败封禁</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number"
                      value={settings.auto_block?.ip_fail_threshold || 5}
                      onChange={e => {
                        const v = { ...settings, auto_block: { ...(settings.auto_block || {}), ip_fail_threshold: parseInt(e.target.value) } };
                        setSettings(v);
                      }}
                      style={inputNum}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>次/分钟</span>
                  </div>
                </div>
                <div style={rowStyle}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.auto_block?.device_multi_card !== false}
                      onChange={e => {
                        const v = { ...settings, auto_block: { ...(settings.auto_block || {}), device_multi_card: e.target.checked } };
                        setSettings(v);
                      }}
                      style={checkboxStyle}
                    />
                    <span style={labelStyle}>设备多卡告警</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>超过</span>
                    <input
                      type="number"
                      value={settings.auto_block?.device_card_limit || 3}
                      onChange={e => {
                        const v = { ...settings, auto_block: { ...(settings.auto_block || {}), device_card_limit: parseInt(e.target.value) } };
                        setSettings(v);
                      }}
                      style={inputNum}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>张→⚠告警</span>
                  </div>
                </div>
                <div style={rowStyle}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.auto_block?.geo_jump || false}
                      onChange={e => {
                        const v = { ...settings, auto_block: { ...(settings.auto_block || {}), geo_jump: e.target.checked } };
                        setSettings(v);
                      }}
                      style={checkboxStyle}
                    />
                    <span style={labelStyle}>异地激活 → 自动封禁</span>
                  </label>
                </div>
                <button style={{ ...btnPrimary, marginTop: 16 }} onClick={() => {
                  saveSettings('auto_block', settings.auto_block || {});
                  toast.success('已保存');
                }}>
                  💾 保存封禁规则
                </button>
              </div>

              {/* 叠加封禁策略 */}
              <div style={cardStyle}>
                <div style={sectionTitle}>🔄 叠加封禁策略</div>
                <div style={{ ...subText, fontSize: 12, marginBottom: 12 }}>
                  第1次→🔒10分钟　第2次→🔒20分钟　第3次→🔒40分钟　第4次→🔒60分钟<br />
                  第5次→🔒120分钟　第6次→🔒240分钟　...倍增叠加...　上限🔒1440分钟（24小时）<br />
                  重置：连续{' '}
                  <input
                    type="number"
                    value={settings.violation?.reset_days || 7}
                    onChange={e => {
                      const v = { ...settings, violation: { ...(settings.violation || {}), reset_days: parseInt(e.target.value) } };
                      setSettings(v);
                    }}
                    style={{ width: 40, padding: '3px 6px', borderRadius: 4, border: '1px solid var(--border)', fontSize: 12, textAlign: 'center' }}
                  />{' '}
                  天无违规→计数器归零　｜　IP和设备独立计算
                </div>
                <button style={btnPrimary} onClick={() => {
                  saveSettings('violation', settings.violation || {});
                  toast.success('已保存');
                }}>
                  💾 保存叠加策略
                </button>
              </div>

              {/* 自动解封策略 */}
              <div style={cardStyle}>
                <div style={sectionTitle}>🔄 自动解封策略</div>
                <div style={rowStyle}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.unblock?.auto_unblock !== false}
                      onChange={e => {
                        const v = { ...settings, unblock: { ...(settings.unblock || {}), auto_unblock: e.target.checked } };
                        setSettings(v);
                      }}
                      style={checkboxStyle}
                    />
                    <span style={labelStyle}>临时封禁到期自动解封</span>
                  </label>
                </div>
                <div style={rowStyle}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.unblock?.permanent_on_relapse || false}
                      onChange={e => {
                        const v = { ...settings, unblock: { ...(settings.unblock || {}), permanent_on_relapse: e.target.checked } };
                        setSettings(v);
                      }}
                      style={checkboxStyle}
                    />
                    <span style={labelStyle}>解封后</span>
                    <input
                      type="number"
                      value={settings.unblock?.relapse_hours || 24}
                      onChange={e => {
                        const v = { ...settings, unblock: { ...(settings.unblock || {}), relapse_hours: parseInt(e.target.value) } };
                        setSettings(v);
                      }}
                      style={inputNum}
                    />
                    <span style={labelStyle}>小时内再犯 → 永久封禁</span>
                  </label>
                </div>
                <button style={{ ...btnPrimary, marginTop: 16 }} onClick={() => {
                  saveSettings('unblock', settings.unblock || {});
                  toast.success('已保存');
                }}>
                  💾 保存解封策略
                </button>
              </div>

              {/* 通知方式 */}
              <div style={cardStyle}>
                <div style={sectionTitle}>📢 通知方式</div>
                <div style={rowStyle}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.notify?.websocket !== false}
                      onChange={e => {
                        const v = { ...settings, notify: { ...(settings.notify || {}), websocket: e.target.checked } };
                        setSettings(v);
                      }}
                      style={checkboxStyle}
                    />
                    <span style={labelStyle}>WebSocket 实时推送</span>
                  </label>
                </div>
                <div style={rowStyle}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.notify?.email || false}
                      onChange={e => {
                        const v = { ...settings, notify: { ...(settings.notify || {}), email: e.target.checked } };
                        setSettings(v);
                      }}
                      style={checkboxStyle}
                    />
                    <span style={labelStyle}>邮件告警</span>
                  </label>
                  {settings.notify?.email && (
                    <input
                      type="email"
                      value={settings.notify?.email_addr || ''}
                      onChange={e => {
                        const v = { ...settings, notify: { ...(settings.notify || {}), email_addr: e.target.value } };
                        setSettings(v);
                      }}
                      placeholder="admin@qq.com"
                      style={{ ...inputFull, width: 200, marginLeft: 12 }}
                    />
                  )}
                </div>
                <div style={rowStyle}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.notify?.webhook || false}
                      onChange={e => {
                        const v = { ...settings, notify: { ...(settings.notify || {}), webhook: e.target.checked } };
                        setSettings(v);
                      }}
                      style={checkboxStyle}
                    />
                    <span style={labelStyle}>Webhook</span>
                  </label>
                  {settings.notify?.webhook && (
                    <input
                      type="url"
                      value={settings.notify?.webhook_url || ''}
                      onChange={e => {
                        const v = { ...settings, notify: { ...(settings.notify || {}), webhook_url: e.target.value } };
                        setSettings(v);
                      }}
                      placeholder="https://hook..."
                      style={{ ...inputFull, width: 250, marginLeft: 12 }}
                    />
                  )}
                </div>
                <button style={{ ...btnPrimary, marginTop: 16 }} onClick={() => {
                  saveSettings('notify', settings.notify || {});
                  toast.success('已保存');
                }}>
                  💾 保存通知设置
                </button>
              </div>

              {/* 封禁接口提示 */}
              <div style={cardStyle}>
                <div style={sectionTitle}>🚫 封禁接口行为</div>
                <div style={subText}>
                  被封禁后调用接口自动返回：<br />
                  <code style={{ background: 'var(--bg)', padding: '6px 10px', borderRadius: 8, fontSize: 11, display: 'inline-block', marginTop: 6 }}>
                    {'{"success":false,"message":"请求超限已被封禁","remaining_seconds":600}'}
                  </code><br />
                  <span style={{ marginTop: 8, display: 'block' }}>
                    ☑ /activate　☑ /verify　☑ /unbind（设备封禁不可解绑）
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
