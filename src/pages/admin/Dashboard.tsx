import { useEffect, useState } from 'react';
import { adminApi, healthApi } from '../../lib/api';
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
  const iconStyle = { width: 14, height: 14 };
  switch (action) {
    case 'login': return <LogIn style={{...iconStyle, color: '#10b981'}} />;
    case 'logout': return <LogOut style={{...iconStyle, color: '#f59e0b'}} />;
    case 'register': return <PlusCircle style={{...iconStyle, color: '#10b981'}} />;
    case 'create': return <PlusCircle style={{...iconStyle, color: '#3b82f6'}} />;
    case 'update': return <Edit3 style={{...iconStyle, color: '#f59e0b'}} />;
    case 'delete': return <Trash2 style={{...iconStyle, color: '#ef4444'}} />;
    case 'add': return <PlusCircle style={{...iconStyle, color: '#3b82f6'}} />;
    case 'remove': return <MinusCircle style={{...iconStyle, color: '#ef4444'}} />;
    case 'send': return <Send style={{...iconStyle, color: '#8b5cf6'}} />;
    case 'activate': return <Smartphone style={{...iconStyle, color: '#10b981'}} />;
    case 'verify': return <Shield style={{...iconStyle, color: '#06b6d4'}} />;
    case 'unbind': return <Unlink style={{...iconStyle, color: '#f59e0b'}} />;
    case 'heartbeat': return <Activity style={{...iconStyle, color: '#6366f1'}} />;
    case 'sign': return <FileText style={{...iconStyle, color: '#8b5cf6'}} />;
    case 'encrypt': return <Lock style={{...iconStyle, color: '#06b6d4'}} />;
    case 'decrypt': return <Lock style={{...iconStyle, color: '#10b981'}} />;
    case 'change_password': return <Lock style={{...iconStyle, color: '#ef4444'}} />;
    case 'update_profile': return <Settings style={{...iconStyle, color: '#6b7280'}} />;
    case 'regenerate': return <RefreshCw style={{...iconStyle, color: '#8b5cf6'}} />;
    case 'update_plan': return <CreditCard style={{...iconStyle, color: '#f59e0b'}} />;
    case 'update_status': return <AlertTriangle style={{...iconStyle, color: '#ef4444'}} />;
    default: return <Eye style={{...iconStyle, color: '#6b7280'}} />;
  }
}

function getActionLabel(action: string) {
  const labels: Record<string, string> = {
    login: '登录', logout: '退出登录', register: '注册', create: '新建', update: '修改',
    delete: '删除', add: '添加', remove: '移除', send: '发送', activate: '激活',
    verify: '验证', unbind: '解绑', heartbeat: '心跳', sign: '签名', encrypt: '加密',
    decrypt: '解密', change_password: '修改密码', update_profile: '修改信息',
    regenerate: '重新生成', update_plan: '修改套餐', update_status: '修改状态',
    other: '其他操作',
  };
  return labels[action] || action;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [opLogs, setOpLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  useEffect(() => {
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
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {getActionIcon(log.action)}
                  {getActionLabel(log.action)}
                  {log.module && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({log.module})</span>}
                  <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: log.user_type === 'admin' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)', color: log.user_type === 'admin' ? '#ef4444' : '#3b82f6' }}>
                    {log.user_type === 'admin' ? '管理员' : log.user_type === 'merchant' ? '商户' : log.user_type || ''}
                  </span>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString()}</span>
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
