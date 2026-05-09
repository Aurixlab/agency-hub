'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized: 'Your Google account is not authorized. Contact your admin.',
  google_cancelled: 'Google sign-in was cancelled.',
  no_email: 'Could not retrieve your email from Google.',
  oauth_failed: 'Google sign-in failed. Please try again.',
};

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-surface-50 dark:bg-surface-950">
      {/* Background pattern */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-brand-400/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-600 shadow-lg mb-4">
            <span className="text-white font-bold text-base">AL</span>
          </div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">
            Welcome to Mission Control
          </h1>
          <p className="text-surface-500 dark:text-surface-400 mt-2 text-sm">
            Sign in with your Aurixlab Google account
          </p>
        </div>

        {/* Card */}
        <div className="card p-8">
          {error && (
            <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm animate-slide-up">
              {ERROR_MESSAGES[error] ?? 'Something went wrong. Please try again.'}
            </div>
          )}

          <a
            href="/api/auth/google-login"
            className="flex items-center justify-center gap-3 w-full px-4 py-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 hover:bg-surface-50 dark:hover:bg-surface-800 text-surface-900 dark:text-white font-medium text-sm transition-all shadow-sm"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <g fill="none" fillRule="evenodd">
                <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </g>
            </svg>
            Sign in with Google
          </a>
        </div>

        <p className="text-center text-xs text-surface-400 dark:text-surface-600 mt-6">
          Contact your admin if you need access
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
