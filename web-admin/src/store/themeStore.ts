import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface ThemeStore {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const saved = (localStorage.getItem('app-theme') as Theme | null) ?? 'light';

function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('app-theme', t);
}

// Apply immediately on module load (before React renders)
applyTheme(saved);

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: saved,
  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === 'light' ? 'dark' : 'light';
      applyTheme(next);
      return { theme: next };
    }),
  setTheme: (t) => {
    applyTheme(t);
    set({ theme: t });
  },
}));
