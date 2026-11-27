'use client';

import { useFetch, apiCall } from '@/hooks/useFetch';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface EmailSetting {
  enabled: boolean;
}

export default function SettingsPage() {
  const { data: me } = useFetch<any>('/api/auth/me', { pollInterval: false });
  const { data, error, mutate, refetch } = useFetch<EmailSetting>(
    me?.role === 'ADMIN' ? '/api/settings/emails' : null,
  );
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Redirect non-admins
  useEffect(() => {
    if (me && me.role !== 'ADMIN') {
      router.push('/dashboard');
    }
  }, [me, router]);

  const handleToggle = async () => {
    if (!data) return;
    setSaving(true);
    setSaveError('');
    const result = await apiCall<EmailSetting>('/api/settings/emails', {
      method: 'PUT',
      body: JSON.stringify({ enabled: !data.enabled }),
    });
    // The switch only moves once the server confirms; either way re-read what is actually stored.
    if (result.data) mutate(result.data);
    else setSaveError('Could not save the change. Please try again.');
    await refetch();
    setSaving(false);
  };

  if (me && me.role !== 'ADMIN') return null;

  const enabled = data?.enabled === true;
  const status = data ? (enabled ? 'On' : 'Off') : error ? 'Unknown' : 'Loading...';
  const description = data
    ? enabled
      ? 'Task emails and the daily digest are being sent. Assignments: 8am, 12pm, 4pm, 8pm. Digest: 8:30am (Bangladesh time).'
      : 'No emails are sent to the team.'
    : '';

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-full overflow-x-hidden">
      <h1 className="text-xl sm:text-2xl font-bold text-surface-900 dark:text-white">Settings</h1>

      <div className="card p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 id="emails-heading" className="font-semibold text-surface-900 dark:text-white">Emails</h2>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span
              aria-live="polite"
              className={`text-sm font-semibold ${enabled ? 'text-emerald-400' : 'text-surface-400'}`}
            >
              {status}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-labelledby="emails-heading"
              aria-describedby="emails-description"
              onClick={handleToggle}
              disabled={!data || saving}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-900 disabled:opacity-50 disabled:cursor-not-allowed ${
                enabled ? 'bg-emerald-500' : 'bg-surface-600'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
        <p id="emails-description" className="mt-2 text-sm text-surface-500 dark:text-surface-400">{description}</p>
        {(saveError || (error && !data)) && (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {saveError || 'Could not load the email setting. Please refresh the page.'}
          </p>
        )}
      </div>
    </div>
  );
}
