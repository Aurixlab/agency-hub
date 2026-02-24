import './globals.css';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { Toaster } from 'react-hot-toast';

export const metadata = {
  title: 'AgencyHub — Project & Task Management',
  description: 'Internal project management for digital agencies',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <ThemeProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              className: 'toast-custom',
              duration: 3000,
              style: {
                background: 'var(--toast-bg, #fff)',
                color: 'var(--toast-color, #1f2937)',
                border: '1px solid var(--toast-border, #e5e8ed)',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
