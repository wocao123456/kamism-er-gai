#!/bin/bash
cd /root/kamism
echo '=== Starting all changes ==='

# 1. theme.ts
cat > src/stores/theme.ts << 'TSEOF'
import { create } from 'zustand';
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
TSEOF
echo '[1] theme.ts done'

# 2. Layout.tsx
sed -i "s|interface NavItem { label: string; path: string; icon: React.ReactNode; }|interface NavItem { label: string; path: string; icon: React.ReactNode; hideForAdmin?: boolean; }|" src/components/Layout.tsx
sed -i "s|{ label: '总览', path: '/dashboard', icon: <LayoutDashboard size={16} /> }|{ label: '总览', path: '/dashboard', icon: <LayoutDashboard size={16} />, hideForAdmin: true }|" src/components/Layout.tsx
sed -i "s|{ label: '代理管理', path: '/agents', icon: <Network size={16} /> }|{ label: '代理管理', path: '/agents', icon: <Network size={16} />, hideForAdmin: true }|" src/components/Layout.tsx
echo '[2] Layout.tsx nav items fixed'

# 3. index.css - breathing
cat >> src/index.css << 'CSSEOF'

/* Card top line breathing glow */
@keyframes card-breathe {
  0%, 100% { opacity: 0.45; box-shadow: none; }
  50% { opacity: 1; box-shadow: 0 0 8px 2px var(--card-color, var(--accent)); }
}
.stat-card-breathing::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: var(--card-color, var(--accent));
  border-radius: 12px 12px 0 0;
  opacity: 0.45;
  animation: card-breathe 3s ease-in-out infinite;
}
CSSEOF
echo '[3] index.css breathing added'

echo '=== Shell part done, now run python ==='
