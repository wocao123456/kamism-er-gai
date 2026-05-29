import { useEffect, useState } from 'react';
import { adminApi, healthApi, logApi } from '../../lib/api';
import { Activity, AlertTriangle, CreditCard, Database, Edit3, FileText, Key, Lock, LogIn, LogOut, MinusCircle, Package, PlusCircle, Rabbit, RefreshCw, ScrollText, Send, Server, Settings, Shield, Smartphone, Trash2, TrendingUp, Unlink, Users , Eye } from 'lucide-react';

interface Stats {
  merchants: number;
  total_cards: number;
  active_cards: number;
  total_activations: number;
  total_apps: number;
}

interface HealthStatus {
  status: 'ok' | 'degraded';
  db: 'ok' | 'error';
  redis: 'ok' | 'error';
  mq: 'ok' | 'error';
  uptime_secs: number;
}

function formatUptime(secs: number): string {
  if (secs < 60) return `${secs} 秒`;
  if (secs < 3600) return `${Math.floor(secs / 60)} 分钟`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} 小时 ${Math.floor((secs % 3600) / 60)} 分钟`;
  return `${Math.floor(secs / 86400)} 天 ${Math.floor((secs % 86400) / 3600)} 小时`;
}


function getActionIcon(action: string) {
  const s: React.CSSProperties = {
    width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, flexShrink: 0, transition: 'transform 0.15s',
  };
  const cfgs: Record<string, { el: React.ReactNode; bg: string }> = {
    login:        { el: <LogIn     size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#34d399,#059669)' },
    logout:       { el: <LogOut    size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#fbbf24,#d97706)' },
    register:     { el: <PlusCircle size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#34d399,#059669)' },
    create:       { el: <PlusCircle size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#60a5fa,#2563eb)' },
    update:       { el: <Edit3     size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#fbbf24,#d97706)' },
    delete:       { el: <Trash2    size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#f87171,#dc2626)' },
    add:          { el: <PlusCircle size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#60a5fa,#2563eb)' },
    remove:       { el: <MinusCircle size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#f87171,#dc2626)' },
    send:         { el: <Send      size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#a78bfa,#7c3aed)' },
    activate:     { el: <Smartphone size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#34d399,#059669)' },
    verify:       { el: <Shield    size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#22d3ee,#0891b2)' },
    unbind:       { el: <Unlink    size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#fbbf24,#d97706)' },
    heartbeat:    { el: <Activity  size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#818cf8,#4f46e5)' },
    sign:         { el: <FileText  size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#a78bfa,#7c3aed)' },
    encrypt:      { el: <Lock      size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#22d3ee,#0891b2)' },
    decrypt:      { el: <Lock      size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#34d399,#059669)' },
    change_password: { el: <Lock   size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#f87171,#dc2626)' },
    update_profile:  { el: <Settings size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#9ca3af,#4b5563)' },
    regenerate:   { el: <RefreshCw size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#a78bfa,#7c3aed)' },
    update_plan:  { el: <CreditCard size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#fbbf24,#d97706)' },
    update_status: { el: <AlertTriangle size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#f87171,#dc2626)' },
    view:          { el: <Eye       size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#818cf8,#4f46e5)' },
    other:         { el: <Eye       size={11} strokeWidth={2.5} />, bg: 'linear-gradient(135deg,#9ca3af,#4b5563)' },
  };
  const c = cfgs[action] || cfgs.other;
  return <span style={{ ...s, background: c.bg, color: '#fff' }}>{c.el}</span>;
}

function getActionLabel(action: string) {
  const m: Record<string, [string, string]> = {
    login: ['登录','#34d399'], logout: ['退出登录','#fbbf24'], register: ['注册','#34d399'],
    create: ['新建','#60a5fa'], update: ['修改','#fbbf24'], delete: ['删除','#f87171'],
    add: ['添加','#60a5fa'], remove: ['移除','#f87171'], send: ['发送','#a78bfa'],
    activate: ['激活','#34d399'], verify: ['验证','#22d3ee'], unbind: ['解绑','#fbbf24'],
    heartbeat: ['心跳','#818cf8'], sign: ['签名','#a78bfa'], encrypt: ['加密','#22d3ee'],
    decrypt: ['解密','#34d399'], change_password: ['修改密码','#f87171'],
    update_profile: ['修改信息','#9ca3af'], regenerate: ['重新生成','#a78bfa'],
    update_plan: ['修改套餐','#fbbf24'], update_status: ['修改状态','#f87171'],
    view: ['查看页面','#818cf8'],
    refresh: ['刷新数据','#818cf8'],
    open: ['打开模块','#818cf8'],
    other: ['其他操作','#9ca3af'],
  };
  const [t, c] = m[action] || m.other;
  return <span style={{ color: c, fontWeight: 500, fontSize: 12 }}>{t}</span>;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [opLogs, setOpLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  useEffect(() => {
    logApi.log('view', 'platform', 'view_platform_overview');
    adminApi.getStats().then(res => {
      if (res.data.success) setStats(res.data.data);
    }).catch(() => {}).finally(() => setLoading(false));

    fetch('/api/admin/op-logs?page=1&page_size=15',{headers:{Authorization:'Bearer '+localStorage.getItem('token')||''}}).then(r=>r.json()).then(d=>{if(d.success)setOpLogs(d.data||[]);}).catch(()=>{}).finally(()=>setLogsLoading(false));

    healthApi.check().then(res => {
      setHealth(res.data);
    }).catch(() => {
      setHealth({ status: 'degraded', db: 'error', redis: 'error', mq: 'error', uptime_secs: 0 });
    }).finally(() => setHealthLoading(false));
  }, []);

  const statCards = [
    { label: '注册商户', value: stats?.merchants ?? '—', icon: <Users size={18} />, color: '#7c6af7', breathing: true },
    { label: '应用总数', value: stats?.total_apps ?? '—', icon: <Package size={18} />, color: '#34d399', breathing: true },
    { label: '卡密总数', value: stats?.total_cards ?? '—', icon: <Key size={18} />, color: '#fbbf24', breathing: true },
    { label: '活跃卡密', value: stats?.active_cards ?? '—', icon: <TrendingUp size={18} />, color: '#60a5fa', breathing: true },
    { label: '激活次数', value: stats?.total_activations ?? '—', icon: <Activity size={18} />, color: '#f472b6', breathing: true },
  ];

  const depItems = [
    { key: 'db'    as const, label: '数据库',   icon: <Database size={15} /> },
    { key: 'redis' as const, label: 'Redis',    icon: <Server size={15} /> },
    { key: 'mq'    as const, label: 'RabbitMQ', icon: <Rabbit size={15} /> },
  ];

  return (
    <div className="fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">平台总览</h1>
          <p className="page-subtitle">KamiSM 平台运行数据</p>
        </div>
      </div>

      <div className="stats-grid">
        {statCards.map(card => (
          <div key={card.label} className={`stat-card ${card.breathing ? 'stat-card-breathing' : ''}`} style={{ '--card-color': card.color } as any}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span className="stat-label">{card.label}</span>
              <span style={{ color: card.color, opacity: 0.8 }}>{card.icon}</span>
            </div>
            {loading ? (
              <span className="skeleton" style={{ display: 'block', width: '60%', height: 32, borderRadius: 6 }} />
            ) : (
              <div className="stat-value data-enter" style={{ color: card.color }}>{String(card.value)}</div>
            )}
          </div>
        ))}
      </div>

      {/* 全局操作日志 */}
      <div className='stat-card' style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <ScrollText size={18} className='text-accent' style={{ marginRight: 8 }} />
          <h3 style={{ margin: 0, fontSize: 16 }}>全局操作日志</h3>
        </div>
        {logsLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>加载中...</div>
        ) : opLogs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>暂无操作记录</div>
        ) : (
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {opLogs.map((log: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {getActionIcon(log.action)}
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--text)' }}>{log.detail || getActionLabel(log.action)}</span>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 12, fontWeight: 600, letterSpacing: 0.3, background: log.user_type === 'admin' ? 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.05))' : 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.05))', color: log.user_type === 'admin' ? '#ef4444' : '#3b82f6', border: log.user_type === 'admin' ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(59,130,246,0.2)' }}>
                        {log.user_type === 'admin' ? '管理员' : log.user_type === 'merchant' ? '商户' : log.user_type || ''}
                      </span>
                    </span>
                  </span>
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 12 }}>{new Date(log.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 服务依赖状态 */}
      <div className="card" style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>服务依赖状态</span>
          {healthLoading ? (
            <span className="skeleton" style={{ width: 60, height: 22, borderRadius: 20, display: 'inline-block' }} />
          ) : (
            <span style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 20,
              background: health?.status === 'ok' ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
              color: health?.status === 'ok' ? '#34d399' : '#f87171',
            }}>{health?.status === 'ok' ? '正常' : '异常'}</span>
          )}
        </div>
        <div className="service-deps-grid">
          {depItems.map(({ key, label, icon }) => {
            const ok = health?.[key] === 'ok';
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <span style={{ color: ok ? '#34d399' : '#f87171', fontSize: 14, fontWeight: 700 }}>{ok ? '✓' : '✗'}</span>
                {icon}
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', flex: 1, whiteSpace: 'nowrap' }}>{label}</span>
                <span style={{ fontSize: 12, color: ok ? '#34d399' : '#f87171', fontWeight: 600 }}>{ok ? 'OK' : 'DOWN'}</span>
              </div>
            );
          })}
        </div>
        {!healthLoading && health && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            已运行 {formatUptime(health.uptime_secs)}
          </div>
        )}
      </div>
    </div>
  );
}
