'use client';

import { useFetch } from '@/hooks/useFetch';
import { Task } from '@/types';
import { Users, RefreshCw, Trophy } from 'lucide-react';
import { format, subMonths, startOfMonth } from 'date-fns';

interface CompletionEntry {
  userId: string;
  name: string;
  month: string;
  count: number;
}

export default function TeamPage() {
  const { data: users, loading, refetch } = useFetch<any[]>('/api/users');
  const { data: allTasks } = useFetch<Task[]>('/api/tasks');
  const { data: completions } = useFetch<CompletionEntry[]>('/api/stats/completions', { pollInterval: false });

  const activeUsers = users?.filter(u => !u.disabled) || [];

  const thisMonth = format(new Date(), 'yyyy-MM');
  const lastMonth = format(subMonths(new Date(), 1), 'yyyy-MM');

  const getCompletions = (userId: string, month: string) =>
    completions?.find(c => c.userId === userId && c.month === month)?.count ?? 0;

  const getTaskStats = (userId: string) => {
    const userTasks = allTasks?.filter(t =>
      (t.assigneeId === userId || (Array.isArray(t.assigneeIds) && t.assigneeIds.includes(userId))) && !t.deletedAt
    ) || [];
    const statuses = (userTasks[0] as any)?.project?.statuses as string[] | undefined;
    const doneStatus = statuses && statuses.length > 0 ? statuses[statuses.length - 1] : 'Done';
    return {
      total: userTasks.length,
      active: userTasks.filter(t => t.status !== doneStatus).length,
      done: userTasks.filter(t => t.status === doneStatus).length,
      urgent: userTasks.filter(t => t.priority === 'URGENT' && t.status !== doneStatus).length,
    };
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
            return (
              <div key={user.id} className="card p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center">
                    <span className="text-brand-700 dark:text-brand-300 font-bold">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-surface-900 dark:text-white">{user.name}</h3>
                    <p className="text-xs text-surface-500">@{user.username} · {user.role}</p>
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
    </div>
  );
}
