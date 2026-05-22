'use client';

import { useFetch } from '@/hooks/useFetch';
import { Task } from '@/types';
import { RefreshCw, Trophy, Camera, X } from 'lucide-react';
import { format, subMonths } from 'date-fns';
import { useRef, useState } from 'react';
import Image from 'next/image';
import toast from 'react-hot-toast';

interface CompletionEntry {
  userId: string;
  name: string;
  month: string;
  count: number;
}

export default function TeamPage() {
  const { data: users, loading, refetch } = useFetch<any[]>('/api/users');
  const { data: me } = useFetch<any>('/api/me', { pollInterval: false });
  const { data: allTasks } = useFetch<Task[]>('/api/tasks');
  const { data: completions } = useFetch<CompletionEntry[]>('/api/stats/completions', { pollInterval: false });
  const [uploading, setUploading] = useState(false);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeUsers = users?.filter(u => !u.disabled) || [];
  const thisMonth = format(new Date(), 'yyyy-MM');
  const lastMonth = format(subMonths(new Date(), 1), 'yyyy-MM');

  const getCompletions = (userId: string, month: string) =>
    completions?.find(c => c.userId === userId && c.month === month)?.count ?? 0;

  const getTaskStats = (userId: string) => {
    const userTasks = allTasks?.filter(t =>
      (t.assigneeId === userId || (Array.isArray(t.assigneeIds) && t.assigneeIds.includes(userId))) && !t.deletedAt
    ) || [];
    return {
      total: userTasks.length,
      active: userTasks.filter(t => !t.doneDate).length,
      done: userTasks.filter(t => !!t.doneDate).length,
      urgent: userTasks.filter(t => t.priority === 'URGENT' && !t.doneDate).length,
    };
  };

  const handleAvatarUpload = async (file: File, targetUserId: string) => {
    if (file.size > 500 * 1024) { toast.error('Image must be under 500 KB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('File must be an image'); return; }
    setUploading(true);
    const form = new FormData();
    form.append('avatar', file);
    form.append('userId', targetUserId);
    const res = await fetch('/api/me/avatar', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) toast.error(data.error || 'Upload failed');
    else { toast.success('Profile picture updated'); refetch(); }
    setUploading(false);
  };

  const handleRemoveAvatar = async (targetUserId: string) => {
    setUploading(true);
    await fetch(`/api/me/avatar?userId=${targetUserId}`, { method: 'DELETE' });
    toast.success('Profile picture removed');
    refetch();
    setUploading(false);
  };

  const openUploadFor = (userId: string) => {
    setUploadTargetId(userId);
    fileInputRef.current?.click();
  };

  const Avatar = ({ user, size = 'md' }: { user: any; size?: 'sm' | 'md' | 'lg' }) => {
    const dim = size === 'lg' ? 'w-16 h-16' : size === 'md' ? 'w-11 h-11' : 'w-8 h-8';
    const text = size === 'lg' ? 'text-xl' : size === 'md' ? 'text-base' : 'text-xs';
    return user.avatarUrl ? (
      <Image src={user.avatarUrl} alt={user.name} width={64} height={64} className={`${dim} rounded-full object-cover flex-shrink-0`} />
    ) : (
      <div className={`${dim} rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center flex-shrink-0`}>
        <span className={`${text} font-bold text-brand-700 dark:text-brand-300`}>
          {user.name.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Team</h1>
          <p className="text-surface-500 dark:text-surface-400 mt-1 text-sm">
            {activeUsers.length} active member{activeUsers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={refetch} className="btn-ghost btn-sm">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-surface-400">Loading...</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeUsers.map(user => {
            const stats = getTaskStats(user.id);
            const thisMonthCount = getCompletions(user.id, thisMonth);
            const lastMonthCount = getCompletions(user.id, lastMonth);
            const isMe = me?.id === user.id;

            return (
              <div key={user.id} className="card p-5 space-y-4">
                <div className="flex items-center gap-3">
                  {/* Avatar — editable for own card or by admin */}
                  <div className="relative flex-shrink-0 group">
                    <Avatar user={user} size="md" />
                    {(isMe || me?.role === 'ADMIN') && (
                      <>
                        <button
                          onClick={() => openUploadFor(user.id)}
                          disabled={uploading}
                          className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          title="Change photo"
                        >
                          <Camera className="w-4 h-4 text-white" />
                        </button>
                        {user.avatarUrl && (
                          <button
                            onClick={() => handleRemoveAvatar(user.id)}
                            disabled={uploading}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full items-center justify-center hidden group-hover:flex"
                            title="Remove photo"
                          >
                            <X className="w-2.5 h-2.5 text-white" />
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-surface-900 dark:text-white truncate">{user.name}</h3>
                      {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 font-medium flex-shrink-0">You</span>}
                    </div>
                    <p className="text-xs text-surface-500">@{user.username} · {user.role}</p>
                    {user.bio && <p className="text-xs text-surface-500 dark:text-surface-400 mt-1 line-clamp-2 leading-relaxed">{user.bio}</p>}
                  </div>
                </div>

                {/* Task stats */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-surface-900 dark:text-white">{stats.total}</p>
                    <p className="text-[10px] text-surface-500">Total</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-brand-600">{stats.active}</p>
                    <p className="text-[10px] text-surface-500">Active</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-600">{stats.done}</p>
                    <p className="text-[10px] text-surface-500">Done</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-red-600">{stats.urgent}</p>
                    <p className="text-[10px] text-surface-500">Urgent</p>
                  </div>
                </div>

                {/* Monthly completions */}
                <div className="border-t border-surface-100 dark:border-surface-800 pt-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Trophy className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs font-medium text-surface-600 dark:text-surface-400">Completions</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-center">
                      <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{thisMonthCount}</p>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-500">This month</p>
                    </div>
                    <div className="rounded-lg bg-surface-50 dark:bg-surface-800/50 px-3 py-2 text-center">
                      <p className="text-xl font-bold text-surface-700 dark:text-surface-300">{lastMonthCount}</p>
                      <p className="text-[10px] text-surface-500">Last month</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hidden file input for avatar upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file && uploadTargetId) handleAvatarUpload(file, uploadTargetId);
          e.target.value = '';
        }}
      />
    </div>
  );
}
