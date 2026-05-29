import { create } from 'zustand';

interface ThemeStore {
  theme: 'dark' | 'light';
  toggle: () => void;
  setTheme: (t: 'dark' | 'light') => void;
}

function getSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(t: string) {
  document.documentElement.setAttribute('data-theme', t);
}

// 启动时立即应用系统主题
applyTheme(getSystemTheme());

// 监听系统主题变化，自动跟随
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  const t = e.matches ? 'dark' : 'light';
  applyTheme(t);
  useThemeStore.setState({ theme: t });
});

export const useThemeStore = create<ThemeStore>()((set, get) => ({
  theme: getSystemTheme(),
  toggle: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    set({ theme: next });
    applyTheme(next);
  },
  setTheme: (t) => {
    set({ theme: t });
    applyTheme(t);
  },
}));

export function applyStoredTheme() {
  applyTheme(getSystemTheme());
}
