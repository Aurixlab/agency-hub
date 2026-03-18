'use client';

import { useFetch } from '@/hooks/useFetch';
import { Task } from '@/types';
import { Users, RefreshCw } from 'lucide-react';

export default function TeamPage() {
  const { data: users, loading, refetch } = useFetch<any[]>('/api/users');
  const { data: allTasks } = useFetch<Task[]>('/api/tasks');

  const activeUsers = users?.filter(u => !u.disabled) || [];

  const getTaskStats = (userId: string) => {
    const userTasks = allTasks?.filter(t => t.assigneeId === userId && !t.deletedAt) || [];
    return {
      total: userTasks.length,
      active: userTasks.filter(t => t.status !== 'Done').length,
      done: userTasks.filter(t => t.status === 'Done').length,
      urgent: userTasks.filter(t => t.priority === 'URGENT' && t.status !== 'Done').length,
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Team</h1>
          <p className="text-surface-500 dark:text-surface-400 mt-1 text-sm">
            {activeUsers.length} active member{activeUsers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={refetch} className="btn-ghost btn-sm group">
          <RefreshCw className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-180" />
        </button>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0,1,2,3,4,5].map(i => (
            <div key={i} className="card p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="skeleton w-11 h-11 rounded-full" />
                <div className="space-y-1.5">
                  <div className="skeleton h-5 w-24 rounded" />
                  <div className="skeleton h-3 w-32 rounded" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[0,1,2,3].map(j => (
                  <div key={j} className="text-center space-y-1">
                    <div className="skeleton h-6 w-8 mx-auto rounded" />
                    <div className="skeleton h-2 w-10 mx-auto rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeUsers.map((user, idx) => {
            const stats = getTaskStats(user.id);
            return (
              <div key={user.id} className="card-hover p-5"
                style={{ animation: `slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 50}ms both` }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center transition-transform duration-300 hover:scale-110">
                    <span className="text-brand-700 dark:text-brand-300 font-bold">
                      {user.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-surface-900 dark:text-white">{user.name}</h3>
                    <p className="text-xs text-surface-500">@{user.username} · {user.role}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-surface-900 dark:text-white stat-value">{stats.total}</p>
                    <p className="text-[10px] text-surface-500">Total</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-brand-600 stat-value" style={{ animationDelay: '50ms' }}>{stats.active}</p>
                    <p className="text-[10px] text-surface-500">Active</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-600 stat-value" style={{ animationDelay: '100ms' }}>{stats.done}</p>
                    <p className="text-[10px] text-surface-500">Done</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-red-600 stat-value" style={{ animationDelay: '150ms' }}>{stats.urgent}</p>
                    <p className="text-[10px] text-surface-500">Urgent</p>
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
