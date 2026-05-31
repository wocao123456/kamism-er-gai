import { useEffect, useState } from 'react';
import { merchantApi, activationsApi } from '../../lib/api';
import { logApi } from '../../lib/api';
import { Activity, AlertTriangle, CreditCard, Edit3, Eye, FileText, Globe, Key, Lock, LogIn, LogOut, MinusCircle, Monitor, Package, PlusCircle, RefreshCw, ScrollText, Send, Settings, Shield, Smartphone, Trash2, Unlink } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend,
  BarChart, Bar, LabelList,
} from 'recharts';
import { useThemeStore } from '../../stores/theme';

interface CardStat { status: string; count: number; }
interface TrendItem { date: string; count: number; }
interface DeviceDistItem { app: string; count: number; }
interface IpStatItem { ip: string; activate_count: number; last_access: string; }
interface DashboardStats {
  card_stats: CardStat[];
  activation_trend: TrendItem[];
  device_dist: DeviceDistItem[];
  ip_stats: IpStatItem[];
}

const STATUS_LABEL: Record<string, string> = { unused: '未使用', active: '使用中', expired: '已过期', disabled: '已禁用' };
const STATUS_COLOR: Record<string, string> = { unused: '#888899', active: '#7c6af7', expired: '#f87171', disabled: '#fbbf24' };

type Range = 'week' | 'month' | 'year';
const RANGE_LABELS: Record<Range, string> = { week: '近7天', month: '近3月', year: '近1年' };
const RANGE_TICK_FORMAT: Record<Range, (d: string) => string> = { week: (d) => d.slice(5), month: (d) => d.slice(5), year: (d) => d.slice(0, 7) };


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

function getActionLabel(action: string): [string, string] {
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
  return m[action] || m.other;
}

function formatLogDetail(detail: string | null, action: string): string {
  if (!detail) return getActionLabel(action)[0];
  let cleaned = detail;
  cleaned = cleaned.replace(/\/profile\/upload-background/g, '上传背景');
  cleaned = cleaned.replace(/\/profile\/avatar/g, '上传头像');
  cleaned = cleaned.replace(/\/profile\/api-key/g, '重新生成Key');
  cleaned = cleaned.replace(/\/profile\/change-password/g, '修改密码');
  cleaned = cleaned.replace(/\/profile\/change-email/g, '更换邮箱');
  cleaned = cleaned.replace(/\/auth\/oauth\/login/g, 'OAuth登录');
  if (cleaned.includes('/')) {
    const parts = cleaned.split('/');
    cleaned = parts[parts.length - 1] || parts[parts.length - 2] || cleaned;
  }
  const map: Record<string, string> = {
    'upload-background': '上传背景',
    'avatar': '上传头像',
    'api-key': '重新生成Key',
    'change-password': '修改密码',
    'change-email': '更换邮箱',
    'login': '登录',
    'logout': '退出登录',
    'view_merchant_overview': '查看平台总览',
    'update_profile': '修改信息',
  };
  return map[cleaned] || cleaned;
}

export default function MerchantDashboard() {
  const [stats, setStats] = useState<DashboardStats>({ card_stats: [], activation_trend: [], device_dist: [], ip_stats: [] });
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('week');
  const [ipPage, setIpPage] = useState(1);
  const [ipPageSize] = useState(10);
  const { theme } = useThemeStore();
  const [opLogs, setOpLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const hiddenPaths = ['/profile/upload-background', '/profile/avatar', '/profile/api-key', '/profile/change-password', '/profile/change-email', '/auth/send-code', '/profile/verify-old-email'];

  const axisColor = theme === 'dark' ? '#55556a' : '#8888a0';
  const gridColor = theme === 'dark' ? '#1e1e2e' : '#dddde8';
  const tooltipBg = theme === 'dark' ? '#111118' : '#ffffff';
  const tooltipBorder = theme === 'dark' ? '#2a2a3e' : '#c8c8da';
  const tooltipText = theme === 'dark' ? '#e8e8f0' : '#18181f';

  useEffect(() => {
    logApi.log('view', 'platform', 'view_merchant_overview');
    setLoading(true);
    fetch('/api/merchant/op-logs?page=1&page_size=300',{headers:{Authorization:'Bearer '+localStorage.getItem('token')||''}}).then(r=>r.json()).then(d=>{if(d.success)setOpLogs(d.data||[]);}).catch(()=>{}).finally(()=>setLogsLoading(false));
    Promise.all([
      merchantApi.dashboardStats(range),
      activationsApi.list({ page: 1, page_size: 500 })
    ]).then(([statsRes, actRes]) => {
      const data: DashboardStats = { card_stats: [], activation_trend: [], device_dist: [], ip_stats: [] };

      if (statsRes?.data?.success) {
        data.card_stats = statsRes.data.data?.card_stats ?? [];
        data.activation_trend = statsRes.data.data?.activation_trend ?? [];
        data.device_dist = statsRes.data.data?.device_dist ?? [];
      }

      if (actRes?.data?.success) {
        const ipMap = new Map<string, { activate_count: number; last_access: string }>();
        (actRes.data.data || []).forEach((a: any) => {
          const ip = a.ip_address || '未知';
          const t = a.last_verified_at || a.activated_at;
          if (!ipMap.has(ip)) {
            ipMap.set(ip, { activate_count: a.activate_count ?? 0, last_access: t || '' });
          } else {
            const v = ipMap.get(ip)!;
            v.activate_count += a.activate_count ?? 0;
            if (t && t > v.last_access) v.last_access = t;
          }
        });
        ipMap.forEach((v, ip) => data.ip_stats.push({ ip, activate_count: v.activate_count, last_access: v.last_access }));
      }

      setStats(data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [range]);

  const totalCards = stats.card_stats.reduce((s, c) => s + c.count, 0);
  const activeCards = stats.card_stats.find(c => c.status === 'active')?.count ?? 0;
  const totalActivations = stats.activation_trend.reduce((s, c) => s + c.count, 0);
  const totalDevices = stats.device_dist.reduce((s, c) => s + c.count, 0);
  const totalIps = stats.ip_stats.length;

  const grandTotal = stats.ip_stats.reduce((s, ip) => s + ip.activate_count, 0);

  const summaryCards = [
    { label: '卡密总数', value: totalCards, icon: <Key size={18} />, color: 'var(--accent)', breathing: true },
    { label: '使用中', value: activeCards, icon: <Activity size={18} />, color: 'var(--success)', breathing: true },
    { label: '近30天激活', value: totalActivations, icon: <Monitor size={18} />, color: '#f472b6', breathing: true },
    { label: '绑定设备', value: totalDevices, icon: <Package size={18} />, color: 'var(--warning)', breathing: true },
    { label: '卡密IP访问', value: grandTotal, icon: <Globe size={18} />, color: '#60a5fa', breathing: true },
  ];

  const tooltipStyle = { background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 8, color: tooltipText, fontSize: 12 };

  const sortedIpStats = [...stats.ip_stats].sort((a, b) => b.activate_count - a.activate_count);
  const chartIpData = sortedIpStats.slice(0, 20).map((item, i) => ({ ...item, rank: i + 1 }));
  const ipTotalPages = Math.ceil(totalIps / ipPageSize);
  const pagedIpStats = sortedIpStats.slice((ipPage - 1) * ipPageSize, ipPage * ipPageSize);

  return (
    <div className="fade-in">
      <div className="page-header"><div><h1 className="page-title">控制台</h1><p className="page-subtitle">欢迎使用 KamiSM 卡密管理平台</p></div></div>

      <div className="stats-grid">
        {summaryCards.map(card => (
          <div key={card.label} className={`stat-card ${card.breathing ? "stat-card-breathing" : ""}`} style={{ "--card-color": card.color } as any}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span className="stat-label">{card.label}</span><span style={{ color: card.color, opacity: 0.8 }}>{card.icon}</span>
            </div>
            <div className="stat-value" style={{ color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>


      <div className='stat-card'>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <ScrollText size={18} className='text-accent' style={{ marginRight: 8 }} />
          <h3 style={{ margin: 0, fontSize: 16 }}>操作日志</h3>
        </div>
        {logsLoading ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>加载中...</div>
        ) : opLogs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>暂无操作记录</div>
        ) : (
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {opLogs.filter((log: any) => !hiddenPaths.some((p: string) => (log.detail || '').includes(p))).map((log: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {getActionIcon(log.action)}
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--text)' }}>{formatLogDetail(log.detail, log.action)}</span>
                    </span>
                  </span>
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 12 }}>{new Date(log.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner" /></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>

          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, margin: 0 }}>激活趋势</p>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['week','month','year'] as Range[]).map(r => (
                  <button key={r} onClick={() => setRange(r)} style={{ padding:'4px 12px', borderRadius:6, fontSize:12, fontWeight:600, border:'1px solid', cursor:'pointer', background:range===r?'var(--accent)':'transparent', color:range===r?'#fff':'var(--text-dim)', borderColor:range===r?'var(--accent)':'var(--border-light)' }}>{RANGE_LABELS[r]}</button>
                ))}
              </div>
            </div>
            {stats.activation_trend.length === 0 ? <div className="empty-state" style={{ padding:'40px 0' }}><div className="empty-state-icon">📈</div><div className="empty-state-text">暂无激活数据</div></div> : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={stats.activation_trend} margin={{ top:4, right:16, left:-20, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="date" tick={{ fontSize:11, fill:axisColor }} tickFormatter={RANGE_TICK_FORMAT[range]} />
                  <YAxis tick={{ fontSize:11, fill:axisColor }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(_v: any) => [Number(_v??0), '激活次数']} labelFormatter={(l: any) => `日期：${l}`} />
                  <Line type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={2} dot={{ r:3, fill:'var(--accent)' }} activeDot={{ r:5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card">
            <p style={{ fontWeight:700, marginBottom:20, color:'var(--text)', fontSize:14 }}>卡密使用率</p>
            {stats.card_stats.length === 0 ? <div className="empty-state" style={{ padding:'40px 0' }}><div className="empty-state-icon">🔑</div><div className="empty-state-text">暂无卡密</div></div> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={stats.card_stats} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {stats.card_stats.map(e => <Cell key={e.status} fill={STATUS_COLOR[e.status]??'#888'} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(_v: any, _: any, props: any) => { const s = props?.payload?.status ?? ''; return [Number(_v??0), STATUS_LABEL[s]??s]; }} />
                <Legend formatter={(v: string) => STATUS_LABEL[v]??v} wrapperStyle={{ fontSize:12, color:axisColor }} /></PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card">
            <p style={{ fontWeight:700, marginBottom:20, color:'var(--text)', fontSize:14 }}>应用设备分布</p>
            {stats.device_dist.length === 0 ? <div className="empty-state" style={{ padding:'40px 0' }}><div className="empty-state-icon">📱</div><div className="empty-state-text">暂无设备数据</div></div> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={stats.device_dist} margin={{ top:4, right:16, left:-20, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="app" tick={{ fontSize:11, fill:axisColor }} tickFormatter={(s: string) => s.length>8?s.slice(0,8)+'…':s} />
                  <YAxis tick={{ fontSize:11, fill:axisColor }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(_v: any) => [Number(_v??0), '绑定设备数']} labelFormatter={(l: any) => `应用：${l}`} />
                  <Bar dataKey="count" fill="var(--accent)" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <p style={{ fontWeight:700, marginBottom:20, color:'var(--text)', fontSize:14 }}>IP 访问次数</p>
            {stats.ip_stats.length === 0 ? <div className="empty-state" style={{ padding:'40px 0' }}><div className="empty-state-icon">🌐</div><div className="empty-state-text">暂无 IP 访问数据</div></div> : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartIpData} margin={{ top:18, right:16, left:-20, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="rank" tick={{ fontSize:11, fill:axisColor }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={tooltipStyle} formatter={(_v: any, _: any, props: any) => { const p = props?.payload; return [p?.activate_count??0, `IP: ${p?.ip??''}`]; }} labelFormatter={(l: any) => `排名 #${l}`} />
                    <Bar dataKey="activate_count" fill="#60a5fa" radius={[4,4,0,0]}>
                      <LabelList dataKey="activate_count" position="top" style={{ fontSize:11, fill:axisColor, fontWeight:600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="table-wrap" style={{ marginTop:16 }}>
                  <table>
                    <thead><tr><th style={{ width:50 }}>#</th><th>IP 地址</th><th>激活</th><th>最近访问</th></tr></thead>
                    <tbody>
                      {pagedIpStats.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ color:'var(--text-muted)', fontSize:12 }}>{(ipPage-1)*ipPageSize+idx+1}</td>
                          <td><span className="mono" style={{ fontSize:12, color:'var(--accent)' }}>{item.ip}</span></td>
                          <td>{item.activate_count} 次</td>
                          <td style={{ fontSize:12, color:'var(--text-muted)' }}>{item.last_access?new Date(item.last_access).toLocaleString('zh-CN'):'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {ipTotalPages > 1 && (
                  <div className="pagination" style={{ marginTop:12 }}>
                    <button className="page-btn" onClick={()=>setIpPage(p=>Math.max(1,p-1))} disabled={ipPage===1}>‹</button>
                    {Array.from({length:ipTotalPages},(_,i)=>i+1).slice(Math.max(0,ipPage-3),Math.min(ipTotalPages,ipPage+2)).map(p=>(<button key={p} className={`page-btn ${p===ipPage?'active':''}`} onClick={()=>setIpPage(p)}>{p}</button>))}
                    <button className="page-btn" onClick={()=>setIpPage(p=>Math.min(ipTotalPages,p+1))} disabled={ipPage>=ipTotalPages}>›</button>
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      )}

      <div className="card" style={{ marginTop:20 }}>
        <p style={{ fontWeight:700, marginBottom:12, color:'var(--text)' }}>快速开始</p>
        <div style={{ color:'var(--text-muted)', fontSize:13, lineHeight:2 }}>
          <p>1. 前往「我的应用」创建一个应用</p>
          <p>2. 前往「卡密管理」批量生成卡密</p>
          <p>3. 在「账号设置」中查看 API Key</p>
          <p>4. 调用 <span className="mono" style={{ color:'var(--accent)' }}>POST /api/v1/activate</span> 激活卡密</p>
          <p>5. 调用 <span className="mono" style={{ color:'var(--accent)' }}>POST /api/v1/verify</span> 验证卡密</p>
        </div>
      </div>
    </div>
  );
}