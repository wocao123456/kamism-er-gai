#!/usr/bin/env python3
import os, re

os.chdir('/root/kamism')

# 1. theme.ts
with open('src/stores/theme.ts', 'w') as f:
    f.write('''import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'dark' | 'light';

interface ThemeStore {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

function getInitialTheme(): Theme {
  try {
    const raw = localStorage.getItem('kamism-theme');
    if (raw) { const p = JSON.parse(raw); if (p?.state?.theme) return p.state.theme; }
  } catch {}
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: getInitialTheme(),
      toggle: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        set({ theme: next });
        document.documentElement.setAttribute('data-theme', next);
      },
      setTheme: (t) => {
        set({ theme: t });
        document.documentElement.setAttribute('data-theme', t);
      },
    }),
    {
      name: 'kamism-theme',
      onRehydrateStorage: () => (state) => {
        if (state) document.documentElement.setAttribute('data-theme', state.theme);
      },
    }
  )
);

export function applyStoredTheme() {
  const theme = getInitialTheme();
  document.documentElement.setAttribute('data-theme', theme);
}
''')
print('[1] theme.ts done')

# 2. index.css - add breathing animation
css = open('src/index.css').read()
if '@keyframes card-breathe' not in css:
    css += '\n\n/* Card top line breathing glow */\n@keyframes card-breathe {\n  0%, 100% { opacity: 0.45; box-shadow: none; }\n  50% { opacity: 1; box-shadow: 0 0 8px 2px var(--card-color, var(--accent)); }\n}\n.stat-card-breathing::before {\n  content: \'\';\n  position: absolute;\n  top: 0; left: 0; right: 0;\n  height: 3px;\n  background: var(--card-color, var(--accent));\n  border-radius: 12px 12px 0 0;\n  opacity: 0.45;\n  animation: card-breathe 3s ease-in-out infinite;\n}\n'
with open('src/index.css', 'w') as f:
    f.write(css)
print('[2] index.css done')

# 3. Layout.tsx
layout = open('src/components/Layout.tsx').read()
if 'hideForAdmin' not in layout:
    layout = layout.replace(
        "interface NavItem { label: string; path: string; icon: React.ReactNode; }",
        "interface NavItem { label: string; path: string; icon: React.ReactNode; hideForAdmin?: boolean; }"
    )
if "hideForAdmin: true" not in layout:
    layout = layout.replace(
        "  { label: '总览', path: '/dashboard', icon: <LayoutDashboard size={16} /> },",
        "  { label: '总览', path: '/dashboard', icon: <LayoutDashboard size={16} />, hideForAdmin: true },"
    )
    layout = layout.replace(
        "  { label: '代理管理', path: '/agents', icon: <Network size={16} /> },",
        "  { label: '代理管理', path: '/agents', icon: <Network size={16} />, hideForAdmin: true },"
    )
if '商户功能' not in layout:
    layout = layout.replace(
        '[...adminNav, ...merchantNav.filter((n: any) => !n.hideForAdmin)]',
        '[...adminNav, { label: "\u2500\u2500 商户功能 \u2500\u2500", path: "" } as any, ...merchantNav.filter((n: any) => !n.hideForAdmin)]'
    )
# Add separator and hideForAdmin rendering
if 'item.hideForAdmin' not in layout:
    layout = layout.replace(
        '        {navItems.map((item, i) => (',
        '        {navItems.map((item) => {\n          if (role === \'admin\' && item.hideForAdmin) return null;\n          if (!item.path) return (\n            <div key={item.label} style={{ fontSize: 10, fontWeight: 700, color: \'var(--text-muted)\', padding: \'12px 12px 4px\', textTransform: \'uppercase\', letterSpacing: \'1px\' }}>
              {item.label}\n            </div>\n          );\n          return ('
    )
    layout = layout.replace(
        '        ))}',
        '        );\n        })}'
    )
with open('src/components/Layout.tsx', 'w') as f:
    f.write(layout)
print('[3] Layout.tsx done')

# 4. App.tsx - add /api-manage for merchant
app = open('src/App.tsx').read()
if 'MerchantApiManage' not in app:
    app = app.replace(
        "const ApiManage         = lazy(() => import('./pages/admin/ApiManage'));",
        "const ApiManage         = lazy(() => import('./pages/admin/ApiManage'));\nconst MerchantApiManage = lazy(() => import('./pages/admin/ApiManage'));"
    )
if app.count('/api-manage') < 2:
    app = app.replace(
        "          <Route path=\"/admin/api-manage\"   element={<RequireAuth role=\"admin\"><Layout><ApiManage         key={pageKey} /></Layout></RequireAuth>} />",
        "          <Route path=\"/admin/api-manage\"   element={<RequireAuth role=\"admin\"><Layout><ApiManage         key={pageKey} /></Layout></RequireAuth>} />\n          <Route path=\"/api-manage\"           element={<RequireAuth role={[\"admin\",\"merchant\"]}><Layout><MerchantApiManage key={pageKey} /></Layout></RequireAuth>} />"
    )
with open('src/App.tsx', 'w') as f:
    f.write(app)
print('[4] App.tsx done')

# 5. admin/Dashboard.tsx
admindash = open('src/pages/admin/Dashboard.tsx').read()
if 'ScrollText' not in admindash:
    admindash = admindash.replace(
        "import { Users, Key, Activity, Package, TrendingUp, Database, Server, GitBranch } from 'lucide-react';",
        "import { Users, Key, Activity, Package, TrendingUp, Database, Server, GitBranch, ScrollText } from 'lucide-react';"
    )
if 'opLogs' not in admindash:
    admindash = admindash.replace(
        "  const [healthLoading, setHealthLoading] = useState(true);",
        "  const [healthLoading, setHealthLoading] = useState(true);\n  const [opLogs, setOpLogs] = useState<any[]>([]);\n  const [logsLoading, setLogsLoading] = useState(true);"
    )
if 'op-logs' not in admindash:
    admindash = admindash.replace(
        "    healthApi.check().then(res =>",
        "    fetch('/api/admin/op-logs?page=1&page_size=15',{headers:{Authorization:'Bearer '+JSON.parse(localStorage.getItem('kamism-auth')||'{}')?.state?.token||''}}).then(r=>r.json()).then(d=>{if(d.success)setOpLogs(d.data||[]);}).catch(()=>{}).finally(()=>setLogsLoading(false));\n    healthApi.check().then(res =>"
    )
if 'breathing' not in admindash:
    admindash = admindash.replace(
        "    { label: '注册商户', value: stats?.merchants ?? '\u2014', icon: <Users size={18} />, color: '#7c6af7' },",
        "    { label: '注册商户', value: stats?.merchants ?? '\u2014', icon: <Users size={18} />, color: '#7c6af7', breathing: true },"
    )
    admindash = admindash.replace(
        "    { label: '应用总数', value: stats?.total_apps ?? '\u2014', icon: <Package size={18} />, color: '#34d399' },",
        "    { label: '应用总数', value: stats?.total_apps ?? '\u2014', icon: <Package size={18} />, color: '#34d399', breathing: true },"
    )
    admindash = admindash.replace(
        "    { label: '卡密总数', value: stats?.total_cards ?? '\u2014', icon: <Key size={18} />, color: '#fbbf24' },",
        "    { label: '卡密总数', value: stats?.total_cards ?? '\u2014', icon: <Key size={18} />, color: '#fbbf24', breathing: true },"
    )
    admindash = admindash.replace(
        "    { label: '活跃卡密', value: stats?.active_cards ?? '\u2014', icon: <TrendingUp size={18} />, color: '#60a5fa' },",
        "    { label: '活跃卡密', value: stats?.active_cards ?? '\u2014', icon: <TrendingUp size={18} />, color: '#60a5fa', breathing: true },"
    )
    admindash = admindash.replace(
        "    { label: '激活次数', value: stats?.total_activations ?? '\u2014', icon: <Activity size={18} />, color: '#f472b6' },",
        "    { label: '激活次数', value: stats?.total_activations ?? '\u2014', icon: <Activity size={18} />, color: '#f472b6', breathing: true },"
    )
if 'card.breathing' not in admindash:
    admindash = admindash.replace(
        "          <div key={card.label} className='stat-card'>",
        "          <div key={card.label} className={\`stat-card ${card.breathing ? 'stat-card-breathing' : ''}\`} style={{ '--card-color': card.color } as any}>"
    )
if '全局操作日志' not in admindash:
    opblock = '''
      <div className='stat-card'>
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
                <span>{log.action} - {log.module}</span>
                <span style={{ color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
'''
    admindash = admindash.replace(
        "      {/* 服务依赖状态 */}",
        opblock + '\n      {/* 服务依赖状态 */}'
    )
with open('src/pages/admin/Dashboard.tsx', 'w') as f:
    f.write(admindash)
print('[5] admin/Dashboard.tsx done')

# 6. merchant/Dashboard.tsx
merchdash = open('src/pages/merchant/Dashboard.tsx').read()
if 'ScrollText' not in merchdash:
    merchdash = merchdash.replace(
        "import { Key, Activity, Package, Monitor, Globe } from 'lucide-react';",
        "import { Key, Activity, Package, Monitor, Globe, ScrollText } from 'lucide-react';"
    )
if 'opLogs' not in merchdash:
    merchdash = merchdash.replace(
        "  const { theme } = useThemeStore();",
        "  const { theme } = useThemeStore();\n  const [opLogs, setOpLogs] = useState<any[]>([]);\n  const [logsLoading, setLogsLoading] = useState(true);"
    )
if '/api/merchant/op-logs' not in merchdash:
    merchdash = merchdash.replace(
        "    Promise.all([",
        "    fetch('/api/merchant/op-logs?page=1&page_size=15',{headers:{Authorization:'Bearer '+JSON.parse(localStorage.getItem('kamism-auth')||'{}')?.state?.token||''}}).then(r=>r.json()).then(d=>{if(d.success)setOpLogs(d.data||[]);}).catch(()=>{}).finally(()=>setLogsLoading(false));\n    Promise.all(["
    )
if 'breathing' not in merchdash:
    merchdash = merchdash.replace(
        "    { label: '卡密总数', value: totalCards, icon: <Key size={18} />, color: 'var(--accent)' },",
        "    { label: '卡密总数', value: totalCards, icon: <Key size={18} />, color: 'var(--accent)', breathing: true },"
    )
    merchdash = merchdash.replace(
        "    { label: '使用中', value: activeCards, icon: <Activity size={18} />, color: 'var(--success)' },",
        "    { label: '使用中', value: activeCards, icon: <Activity size={18} />, color: 'var(--success)', breathing: true },"
    )
    merchdash = merchdash.replace(
        "    { label: '近30天激活', value: totalActivations, icon: <Monitor size={18} />, color: '#f472b6' },",
        "    { label: '近30天激活', value: totalActivations, icon: <Monitor size={18} />, color: '#f472b6', breathing: true },"
    )
    merchdash = merchdash.replace(
        "    { label: '绑定设备', value: totalDevices, icon: <Package size={18} />, color: 'var(--warning)' },",
        "    { label: '绑定设备', value: totalDevices, icon: <Package size={18} />, color: 'var(--warning)', breathing: true },"
    )
    merchdash = merchdash.replace(
        "    { label: '卡密IP访问', value: grandTotal, icon: <Globe size={18} />, color: '#60a5fa' },",
        "    { label: '卡密IP访问', value: grandTotal, icon: <Globe size={18} />, color: '#60a5fa', breathing: true },"
    )
if 'card.breathing' not in merchdash:
    merchdash = merchdash.replace(
        "          <div key={card.label} className='stat-card'>",
        "          <div key={card.label} className={\`stat-card ${card.breathing ? 'stat-card-breathing' : ''}\`} style={{ '--card-color': card.color } as any}>"
    )
if '操作日志' not in merchdash:
    merch_op = '''
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
'''
    merchdash = merchdash.replace(
        "      {loading ?",
        merch_op + '\n      {loading ?'
    )
with open('src/pages/merchant/Dashboard.tsx', 'w') as f:
    f.write(merchdash)
print('[6] merchant/Dashboard.tsx done')

# 7. merchant/ApiDocs.tsx - not side by side
apidocs = open('src/pages/merchant/ApiDocs.tsx').read()
if "gridTemplateColumns: '1fr 1fr'" in apidocs:
    apidocs = apidocs.replace(
        "gridTemplateColumns: '1fr 1fr'",
        "flexDirection: 'column', gap: '12px'"
    )
    apidocs = apidocs.replace(
        "display: 'grid'",
        "display: 'flex'"
    )
    with open('src/pages/merchant/ApiDocs.tsx', 'w') as f:
        f.write(apidocs)
    print('[7] ApiDocs.tsx done')
else:
    print('[7] ApiDocs.tsx already ok')

print('\n=== All frontend files updated ===')
