'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.toLowerCase().trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      if (data.mustChangePassword) {
        router.push('/change-password');
      } else {
        router.push('/dashboard');
      }
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-50 dark:bg-surface-950 overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 left-1/4 w-[500px] h-[500px] bg-brand-500/[0.07] rounded-full blur-[100px] animate-pulse-soft" />
        <div className="absolute -bottom-32 right-1/4 w-[400px] h-[400px] bg-brand-400/[0.05] rounded-full blur-[80px] animate-pulse-soft" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo — staggered entrance */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 mb-4 transition-transform duration-500 hover:scale-110 hover:rotate-3"
               style={{ boxShadow: '0 8px 32px -4px rgb(184 118 32 / 0.35)' }}>
            <span className="text-white font-bold text-base">AL</span>
          </div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white animate-stagger-1">
            Welcome to Aurix Lab Notion
          </h1>
          <p className="text-surface-500 dark:text-surface-400 mt-2 text-sm animate-stagger-2">
            Sign in with your team credentials
          </p>
        </div>

        {/* Form card — spring entrance */}
        <div className="card p-8 animate-stagger-3" style={{ boxShadow: '0 12px 40px -8px rgb(0 0 0 / 0.08)' }}>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm animate-slide-down">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="label">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input"
                placeholder="Enter your username"
                autoComplete="username"
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-surface-400 dark:text-surface-600 mt-6 animate-stagger-4">
          Contact your admin if you need access
        </p>
      </div>
    </div>
  );
}
