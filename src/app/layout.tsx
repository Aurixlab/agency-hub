import './globals.css';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { Toaster } from 'react-hot-toast';
import { DM_Sans, JetBrains_Mono } from 'next/font/google';

// Self-hosted via next/font — no render-blocking external CSS request
const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500'],
});

export const metadata = {
  title: 'Aurix Lab Notion — Project & Task Management',
  description: 'Internal project management for Aurix Lab',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${dmSans.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen font-sans">
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
                borderRadius: '12px',
                boxShadow: '0 8px 24px -4px rgb(0 0 0 / 0.08)',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
