'use client';

import { useFetch } from '@/hooks/useFetch';
import { Task, Project } from '@/types';
import { RefreshCw, Clock, CheckCircle2, AlertTriangle, FolderKanban, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { format, isAfter, isBefore, addDays } from 'date-fns';
import { useState, useEffect } from 'react';

const priorityColors: Record<string, string> = {
  URGENT: 'priority-urgent',
  HIGH: 'priority-high',
  MEDIUM: 'priority-medium',
  LOW: 'priority-low',
  NONE: 'priority-none',
};

export default function DashboardPage() {
  const { data: myTasks, loading: loadingTasks, refetch: refetchTasks } = useFetch<Task[]>('/api/tasks?myTasks=true');
  const { data: projects, loading: loadingProjects, refetch: refetchProjects } = useFetch<Project[]>('/api/projects');
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(setUser).catch(() => {});
  }, []);

  const activeTasks = myTasks?.filter(t => t.status !== 'Done' && !t.deletedAt) || [];
  const dueSoonTasks = activeTasks
    .filter(t => t.dueDate && isBefore(new Date(t.dueDate), addDays(new Date(), 7)))
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  const recentlyDone = myTasks?.filter(t => t.status === 'Done').slice(0, 5) || [];
  const activeProjects = projects?.filter(p => p.status === 'active' && !p.deletedAt) || [];

  const refetchAll = () => { refetchTasks(); refetchProjects(); };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">
            {user ? `Welcome back, ${user.name}` : 'Dashboard'}
          </h1>
          <p className="text-surface-500 dark:text-surface-400 mt-1 text-sm">
            Here&apos;s what&apos;s on your plate
          </p>
        </div>
        <button onClick={refetchAll} className="btn-secondary btn-sm group" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-180" />
          Refresh
        </button>
      </div>

      {/* Stats — staggered entrance */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loadingTasks || loadingProjects ? (
          <>
            {[0,1,2,3].map(i => (
              <div key={i} className="card px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="skeleton w-10 h-10 rounded-xl" />
                  <div className="space-y-2 flex-1">
                    <div className="skeleton h-7 w-12 rounded" />
                    <div className="skeleton h-3 w-20 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <StatCard label="My Active Tasks" value={activeTasks.length}
              icon={<CheckCircle2 className="w-5 h-5 text-brand-600" />} color="brand" delay={0} />
            <StatCard label="Due This Week" value={dueSoonTasks.length}
              icon={<Clock className="w-5 h-5 text-orange-600" />} color="orange" delay={1} />
            <StatCard label="Urgent" value={activeTasks.filter(t => t.priority === 'URGENT').length}
              icon={<AlertTriangle className="w-5 h-5 text-red-600" />} color="red" delay={2} />
            <StatCard label="Active Projects" value={activeProjects.length}
              icon={<FolderKanban className="w-5 h-5 text-emerald-600" />} color="emerald" delay={3} />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* My Tasks */}
        <div className="lg:col-span-2 card p-0 animate-stagger-2">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-surface-800">
            <h2 className="font-semibold text-surface-900 dark:text-white">My Tasks</h2>
            <span className="text-xs text-surface-500">{activeTasks.length} active</span>
          </div>
          <div className="divide-y divide-surface-100 dark:divide-surface-800 max-h-[480px] overflow-y-auto">
            {loadingTasks ? (
              <div className="p-4 space-y-3">
                {[0,1,2,3,4].map(i => (
                  <div key={i} className="flex items-center gap-3 px-1">
                    <div className="skeleton w-7 h-5 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-4 w-3/4 rounded" />
                      <div className="skeleton h-3 w-1/3 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : activeTasks.length === 0 ? (
              <div className="p-8 text-center text-surface-400 animate-fade-in">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>All caught up!</p>
              </div>
            ) : (
              activeTasks.slice(0, 15).map((task, idx) => (
                <Link
                  key={task.id}
                  href={`/projects/${task.projectId}`}
                  className="row-interactive flex items-center gap-3 px-5 py-3.5 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <span className={`badge ${priorityColors[task.priority]}`}>
                    {task.priority === 'NONE' ? '—' : task.priority.charAt(0)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900 dark:text-white truncate">
                      {task.title}
                    </p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      {task.project?.name} · {task.status}
                    </p>
                  </div>
                  {task.dueDate && (
                    <span className={`text-xs ${
                      isBefore(new Date(task.dueDate), new Date()) ? 'text-red-600 font-medium' : 'text-surface-500'
                    }`}>
                      {format(new Date(task.dueDate), 'MMM d')}
                    </span>
                  )}
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Due Soon + Projects */}
        <div className="space-y-6 animate-stagger-3">
          {/* Due Soon */}
          <div className="card p-0">
            <div className="px-5 py-4 border-b border-surface-200 dark:border-surface-800">
              <h2 className="font-semibold text-surface-900 dark:text-white">Due Soon</h2>
            </div>
            <div className="divide-y divide-surface-100 dark:divide-surface-800 max-h-56 overflow-y-auto">
              {dueSoonTasks.length === 0 ? (
                <div className="p-6 text-center text-surface-400 text-sm">Nothing due soon</div>
              ) : (
                dueSoonTasks.slice(0, 5).map(task => (
                  <div key={task.id} className="px-5 py-3">
                    <p className="text-sm font-medium text-surface-900 dark:text-white truncate">{task.title}</p>
                    <p className={`text-xs mt-0.5 ${
                      isBefore(new Date(task.dueDate!), new Date()) ? 'text-red-600 font-medium' : 'text-surface-500'
                    }`}>
                      {isBefore(new Date(task.dueDate!), new Date()) ? 'Overdue — ' : ''}
                      {format(new Date(task.dueDate!), 'EEEE, MMM d')}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active Projects */}
          <div className="card p-0">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-surface-800">
              <h2 className="font-semibold text-surface-900 dark:text-white">Projects</h2>
              <Link href="/projects" className="text-xs text-brand-600 hover:text-brand-700 transition-colors">
                View all
              </Link>
            </div>
            <div className="divide-y divide-surface-100 dark:divide-surface-800">
              {loadingProjects ? (
                <div className="p-4 space-y-3">
                  {[0,1,2].map(i => (
                    <div key={i} className="flex items-center justify-between px-1">
                      <div className="space-y-1.5">
                        <div className="skeleton h-4 w-32 rounded" />
                        <div className="skeleton h-3 w-20 rounded" />
                      </div>
                      <div className="skeleton h-4 w-14 rounded" />
                    </div>
                  ))}
                </div>
              ) : activeProjects.length === 0 ? (
                <div className="p-6 text-center text-surface-400 text-sm">No active projects</div>
              ) : (
                activeProjects.slice(0, 5).map(project => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="row-interactive flex items-center justify-between px-5 py-3.5 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-surface-900 dark:text-white truncate">
                        {project.name}
                      </p>
                      {project.clientName && (
                        <p className="text-xs text-surface-500 mt-0.5">{project.clientName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-surface-500">{project._count?.tasks || 0} tasks</span>
                      <ArrowRight className="w-3.5 h-3.5 text-surface-400 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color, delay }: {
  label: string; value: number; icon: React.ReactNode; color: string; delay: number;
}) {
  const staggerClass = ['animate-stagger-1', 'animate-stagger-2', 'animate-stagger-3', 'animate-stagger-4'][delay] || 'animate-stagger-1';

  return (
    <div className={`card px-5 py-4 ${staggerClass}`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${color}-50 dark:bg-${color}-950/30 transition-transform duration-300 hover:scale-110`}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-surface-900 dark:text-white stat-value">{value}</p>
          <p className="text-xs text-surface-500 dark:text-surface-400">{label}</p>
        </div>
      </div>
    </div>
  );
}
