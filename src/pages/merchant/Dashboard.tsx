import { useEffect, useState } from 'react';
import { merchantApi, activationsApi } from '../../lib/api';
import { Key, Activity, Package, Monitor, Globe, ScrollText } from 'lucide-react';
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

export default function MerchantDashboard() {
  const [stats, setStats] = useState<DashboardStats>({ card_stats: [], activation_trend: [], device_dist: [], ip_stats: [] });
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('week');
  const [ipPage, setIpPage] = useState(1);
  const [ipPageSize] = useState(10);
  const { theme } = useThemeStore();
  const [opLogs, setOpLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const axisColor = theme === 'dark' ? '#55556a' : '#8888a0';
  const gridColor = theme === 'dark' ? '#1e1e2e' : '#dddde8';
  const tooltipBg = theme === 'dark' ? '#111118' : '#ffffff';
  const tooltipBorder = theme === 'dark' ? '#2a2a3e' : '#c8c8da';
  const tooltipText = theme === 'dark' ? '#e8e8f0' : '#18181f';

  useEffect(() => {
    setLoading(true);
    fetch('/api/merchant/op-logs?page=1&page_size=15',{headers:{Authorization:'Bearer '+JSON.parse(localStorage.getItem('kamism-auth')||'{}')?.state?.token||''}}).then(r=>r.json()).then(d=>{if(d.success)setOpLogs(d.data||[]);}).catch(()=>{}).finally(()=>setLogsLoading(false));
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
            {opLogs.map((log: any, idx: number) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span>{log.action} - {log.module}</span>
                <span style={{ color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString()}</span>
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