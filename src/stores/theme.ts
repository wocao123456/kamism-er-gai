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
