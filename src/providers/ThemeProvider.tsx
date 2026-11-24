'use client';

import { createContext, useContext, useEffect, useState } from 'react';

// The app is dark-only: nobody uses light mode, so there is no toggle and no stored preference.
type Theme = 'dark';

const ThemeContext = createContext<{ theme: Theme }>({ theme: 'dark' });

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('dark');
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="opacity-0">{children}</div>;
  }

  return (
    <ThemeContext.Provider value={{ theme: 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}
