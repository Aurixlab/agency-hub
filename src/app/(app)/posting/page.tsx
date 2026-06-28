'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Check,
  Clock,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Send,
  Settings,
} from 'lucide-react';

type PostingAccount = {
  id: string;
  name: string;
  platform: 'META';
  pageId: string;
  tokenExpiresAt: string | null;
};

type ScheduledPost = {
  id: string;
  accountId: string;
  content: string;
  mediaUrls: string[];
  scheduledTime: string | null;
  status: 'DRAFT' | 'SCHEDULED' | 'POSTING' | 'POSTED' | 'FAILED';
  approvedAt: string | null;
  postedAt: string | null;
  failureReason: string | null;
  attemptCount: number;
  nextRetryAt: string | null;
  createdAt: string;
  account?: { name: string; pageId: string };
  logs?: Array<{
    id: string;
    attemptNumber: number;
    status: string;
    errorMessage: string | null;
    createdAt: string;
  }>;
};

const initialAccount = {
  name: '',
  page_id: '',
  access_token: '',
  token_expires_at: '',
};

const initialPost = {
  account_id: '',
  content: '',
  media_urls: '',
  scheduled_time: '',
};

const statusLabels = ['DRAFT', 'SCHEDULED', 'POSTING', 'POSTED', 'FAILED'] as const;

function toIsoFromLocal(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function statusBadge(status: ScheduledPost['status']) {
  const classes: Record<ScheduledPost['status'], string> = {
    DRAFT: 'bg-surface-100 text-surface-700 dark:bg-surface-800 dark:text-surface-300',
    SCHEDULED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    POSTING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    POSTED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };
  return `badge ${classes[status]}`;
}

export default function PostingPage() {
  const [accounts, setAccounts] = useState<PostingAccount[]>([]);
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [accountForm, setAccountForm] = useState(initialAccount);
  const [postForm, setPostForm] = useState(initialPost);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    return statusLabels.reduce<Record<string, number>>((acc, status) => {
      acc[status] = posts.filter(post => post.status === status).length;
      return acc;
    }, {});
  }, [posts]);

  const fetchData = async () => {
    setLoading(true);
    const [accountsRes, postsRes] = await Promise.all([
      fetch('/api/posting/accounts'),
      fetch('/api/posting/posts'),
    ]);
    const [accountsPayload, postsPayload] = await Promise.all([
      accountsRes.json(),
      postsRes.json(),
    ]);
    if (!accountsRes.ok) throw new Error(accountsPayload?.error || 'Failed to load posting accounts');
    if (!postsRes.ok) throw new Error(postsPayload?.error || 'Failed to load scheduled posts');
    setAccounts(accountsPayload.accounts || []);
    setPosts(postsPayload.posts || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData().catch(err => {
      setError(err instanceof Error ? err.message : 'Failed to load posting automation');
      setLoading(false);
    });
  }, []);

  const call = async (label: string, request: () => Promise<Response>) => {
    setWorking(label);
    setError(null);
    setMessage(null);
    try {
      const res = await request();
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || `Request failed (${res.status})`);
      await fetchData();
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      return null;
    } finally {
      setWorking(null);
    }
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = await call('account', () => fetch('/api/posting/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...accountForm,
        token_expires_at: toIsoFromLocal(accountForm.token_expires_at),
      }),
    }));
    if (payload) {
      setAccountForm(initialAccount);
      setMessage('Meta account saved.');
    }
  };

  const createPost = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = await call('post', () => fetch('/api/posting/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: postForm.account_id || accounts[0]?.id,
        content: postForm.content,
        media_urls: postForm.media_urls.split(',').map(item => item.trim()).filter(Boolean),
        scheduled_time: toIsoFromLocal(postForm.scheduled_time),
      }),
    }));
    if (payload) {
      setPostForm(initialPost);
      setMessage('Post saved.');
    }
  };

  const schedulePost = async (postId: string, date = new Date()) => {
    const payload = await call(`schedule-${postId}`, () => fetch(`/api/posting/posts/${postId}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_time: date.toISOString() }),
    }));
    if (payload) setMessage('Post scheduled.');
  };

  const runPublishCheck = async () => {
    const payload = await call('publish', () => fetch('/api/cron/publish-posts', { method: 'POST' }));
    if (payload) setMessage(`Publish check complete. ${payload.processed || 0} post(s) processed.`);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Megaphone className="w-6 h-6 text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Posting Automation</h1>
            <p className="text-sm text-surface-500 dark:text-surface-400">
              Create, approve, schedule, and publish Meta posts from Mission Control.
            </p>
          </div>
        </div>
        <button onClick={runPublishCheck} disabled={Boolean(working)} className="btn-secondary">
          {working === 'publish' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Run Publish Check
        </button>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>
        </div>
      )}
      {message && (
        <div className="card border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          {message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statusLabels.map(status => (
          <div key={status} className="card p-4">
            <p className="text-xs font-semibold text-surface-500 dark:text-surface-400">{status}</p>
            <p className="mt-2 text-2xl font-bold text-surface-900 dark:text-white">{stats[status] || 0}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Meta Account</h2>
              <p className="text-sm text-surface-500 dark:text-surface-400">Tokens are encrypted before storage.</p>
            </div>
            <Settings className="w-5 h-5 text-surface-400" />
          </div>
          <form onSubmit={createAccount} className="space-y-4">
            <div>
              <label className="label">Display name</label>
              <input className="input" value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="Main Facebook Page" required />
            </div>
            <div>
              <label className="label">Meta page ID</label>
              <input className="input" value={accountForm.page_id} onChange={e => setAccountForm({ ...accountForm, page_id: e.target.value })} required />
            </div>
            <div>
              <label className="label">Page access token</label>
              <input className="input" type="password" value={accountForm.access_token} onChange={e => setAccountForm({ ...accountForm, access_token: e.target.value })} required />
            </div>
            <div>
              <label className="label">Token expiry</label>
              <input className="input" type="datetime-local" value={accountForm.token_expires_at} onChange={e => setAccountForm({ ...accountForm, token_expires_at: e.target.value })} />
            </div>
            <button type="submit" disabled={working === 'account'} className="btn-primary w-full">
              {working === 'account' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Save Account
            </button>
          </form>
        </section>

        <section className="card p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Post Composer</h2>
              <p className="text-sm text-surface-500 dark:text-surface-400">Save as draft or approve immediately by adding a schedule.</p>
            </div>
            <CalendarClock className="w-5 h-5 text-surface-400" />
          </div>
          <form onSubmit={createPost} className="space-y-4">
            <div>
              <label className="label">Account</label>
              <select className="select" value={postForm.account_id || accounts[0]?.id || ''} onChange={e => setPostForm({ ...postForm, account_id: e.target.value })} required>
                <option value="">Select account</option>
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>{account.name} ({account.pageId})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Content</label>
              <textarea className="input min-h-[140px]" value={postForm.content} onChange={e => setPostForm({ ...postForm, content: e.target.value })} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Media URLs</label>
                <input className="input" value={postForm.media_urls} onChange={e => setPostForm({ ...postForm, media_urls: e.target.value })} placeholder="Comma-separated image URLs" />
              </div>
              <div>
                <label className="label">Schedule</label>
                <input className="input" type="datetime-local" value={postForm.scheduled_time} onChange={e => setPostForm({ ...postForm, scheduled_time: e.target.value })} />
              </div>
            </div>
            <button type="submit" disabled={!accounts.length || working === 'post'} className="btn-primary w-full">
              {working === 'post' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Post
            </button>
          </form>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="border-b border-surface-200 p-5 dark:border-surface-800">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-white">Publishing Queue</h2>
          <p className="text-sm text-surface-500 dark:text-surface-400">Due scheduled posts are picked up by the cron publisher.</p>
        </div>
        <div className="divide-y divide-surface-200 dark:divide-surface-800">
          {loading && <div className="p-5 text-sm text-surface-500">Loading...</div>}
          {!loading && posts.length === 0 && <div className="p-5 text-sm text-surface-500">No posts yet.</div>}
          {posts.map(post => (
            <article key={post.id} className="p-5 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <span className={statusBadge(post.status)}>{post.status}</span>
                  <p className="text-sm text-surface-500 dark:text-surface-400">
                    {post.account?.name || 'Meta account'} · {post.scheduledTime ? new Date(post.scheduledTime).toLocaleString() : 'Not scheduled'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={post.status !== 'DRAFT' || Boolean(working)} onClick={() => schedulePost(post.id)} className="btn-secondary btn-sm">
                    <Clock className="w-3.5 h-3.5" /> Approve Now
                  </button>
                  <button disabled={post.status !== 'SCHEDULED' || Boolean(working)} onClick={() => schedulePost(post.id)} className="btn-primary btn-sm">
                    <Send className="w-3.5 h-3.5" /> Due Now
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm text-surface-800 dark:text-surface-200">{post.content}</p>
              {post.failureReason && <p className="text-sm text-red-600 dark:text-red-300">Failure: {post.failureReason}</p>}
              {post.nextRetryAt && <p className="text-xs text-surface-500">Next retry: {new Date(post.nextRetryAt).toLocaleString()}</p>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
