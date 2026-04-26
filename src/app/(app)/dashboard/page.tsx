'use client';

import { useFetch } from '@/hooks/useFetch';
import { Task, Project } from '@/types';
import { RefreshCw, Clock, CheckCircle2, AlertTriangle, Trophy, ListTodo } from 'lucide-react';
import Link from 'next/link';
import { format, isBefore, addDays, subDays } from 'date-fns';
import { useState, useEffect } from 'react';

const priorityColors: Record<string, string> = {
  URGENT: 'priority-urgent',
  HIGH: 'priority-high',
  MEDIUM: 'priority-medium',
  LOW: 'priority-low',
  NONE: 'priority-none',
};

const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };

export default function DashboardPage() {
  const { data: myTasks, loading: loadingTasks, refetch: refetchTasks } = useFetch<Task[]>('/api/tasks?myTasks=true');
  const { data: standaloneTasks, refetch: refetchStandalone } = useFetch<Task[]>('/api/tasks?standalone=true');
  const { data: allTasks, loading: loadingAll, refetch: refetchAll } = useFetch<Task[]>('/api/tasks');
  const { data: users } = useFetch<any[]>('/api/users', { pollInterval: false });
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(setUser).catch(() => {});
  }, []);

  // Merge assigned project tasks + standalone tasks, deduplicated
  const combinedTasks = [
    ...(myTasks || []),
    ...(standaloneTasks || []).filter(s => !(myTasks || []).some(m => m.id === s.id)),
  ];
  const activeTasks = combinedTasks.filter(t => {
    if (t.deletedAt) return false;
    const statuses = t.project?.statuses as string[] | undefined;
    const doneStatus = statuses && statuses.length > 0 ? statuses[statuses.length - 1] : 'Done';
    return t.status !== doneStatus;
  });
  const dueSoonTasks = activeTasks
    .filter(t => t.dueDate && isBefore(new Date(t.dueDate), addDays(new Date(), 7)))
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  const doneTasks = combinedTasks.filter(t => !t.deletedAt && !!t.doneDate);

  const refetchEverything = () => { refetchTasks(); refetchStandalone(); refetchAll(); };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">
            {user ? `Welcome back, ${user.name}` : 'Dashboard'}
          </h1>
          <p className="text-surface-500 dark:text-surface-400 mt-1 text-sm">
            Here&apos;s what&apos;s on your plate
          </p>
        </div>
        <button onClick={refetchEverything} className="btn-secondary btn-sm" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="My Active Tasks" value={activeTasks.length}
          icon={<CheckCircle2 className="w-5 h-5 text-brand-600" />} color="brand" />
        <StatCard label="Due This Week" value={dueSoonTasks.length}
          icon={<Clock className="w-5 h-5 text-orange-600" />} color="orange" />
        <StatCard label="Urgent" value={activeTasks.filter(t => t.priority === 'URGENT').length}
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />} color="red" />
        <StatCard label="Done" value={doneTasks.length}
          icon={<Trophy className="w-5 h-5 text-amber-600" />} color="amber" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* My Tasks */}
        <div className="lg:col-span-2 card p-0">
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-surface-800">
            <h2 className="font-semibold text-surface-900 dark:text-white">My Tasks</h2>
            <span className="text-xs text-surface-500">{activeTasks.length} active</span>
          </div>
          <div className="divide-y divide-surface-100 dark:divide-surface-800 max-h-[480px] overflow-y-auto">
            {loadingTasks ? (
              <div className="p-8 text-center text-surface-400">Loading...</div>
            ) : activeTasks.length === 0 ? (
              <div className="p-8 text-center text-surface-400">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>All caught up!</p>
              </div>
            ) : (
              activeTasks.slice(0, 15).map(task => (
                <Link
                  key={task.id}
                  href={task.projectId ? `/projects/${task.projectId}` : '/tasks'}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                >
                  <span className={`badge ${priorityColors[task.priority]}`}>
                    {task.priority === 'NONE' ? '—' : task.priority.charAt(0)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900 dark:text-white truncate">
                      {task.title}
                    </p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      {task.project?.name ?? 'Personal'} · {task.status}
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
        <div className="space-y-6">
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

        </div>
      </div>

      {/* ==================== ALL TASKS TABLE ==================== */}
      <AllTasksTable
        tasks={allTasks || []}
        loading={loadingAll}
        users={users || []}
      />
    </div>
  );
}

// ==================== ALL TASKS TABLE COMPONENT ====================
function AllTasksTable({ tasks, loading, users }: { tasks: Task[]; loading: boolean; users: any[] }) {
  const [tab, setTab] = useState<'active' | 'archive'>('active');
  const [sortField, setSortField] = useState<string>('dueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterAssignee, setFilterAssignee] = useState('');

  const tenDaysAgo = subDays(new Date(), 10);

  const isArchived = (task: Task) => {
    const statuses = task.project?.statuses as string[] | undefined;
    const doneStatus = statuses && statuses.length > 0 ? statuses[statuses.length - 1] : 'Done';
    return task.status === doneStatus && new Date((task as any).updatedAt) < tenDaysAgo;
  };

  const nonDeleted = tasks.filter(t => !t.deletedAt);
  const activeTasks = nonDeleted.filter(t => !isArchived(t));
  const archivedTasks = nonDeleted.filter(t => isArchived(t));
  const source = tab === 'active' ? activeTasks : archivedTasks;

  const filtered = filterAssignee
    ? source.filter(t => {
        if (t.assigneeId === filterAssignee) return true;
        if (t.assignees?.some((a: any) => a.id === filterAssignee)) return true;
        const ids = Array.isArray(t.assigneeIds) ? t.assigneeIds : [];
        return ids.includes(filterAssignee);
      })
    : source;

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'title') cmp = a.title.localeCompare(b.title);
    else if (sortField === 'status') cmp = a.status.localeCompare(b.status);
    else if (sortField === 'priority') cmp = (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4);
    else if (sortField === 'dueDate') cmp = (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    else if (sortField === 'assignee') {
      const aName = a.assignees?.[0]?.name || a.assignee?.name || 'zzz';
      const bName = b.assignees?.[0]?.name || b.assignee?.name || 'zzz';
      cmp = aName.localeCompare(bName);
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <th
      onClick={() => toggleSort(field)}
      className="px-4 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider cursor-pointer hover:text-surface-700 dark:hover:text-surface-200 select-none transition-colors"
    >
      {children} {sortField === field && (sortDir === 'asc' ? '↑' : '↓')}
    </th>
  );

  const getAssigneeNames = (task: Task): string => {
    if (task.assignees && task.assignees.length > 0) {
      return task.assignees.map((a: any) => a.name).join(', ');
    }
    if (task.assignee) return task.assignee.name;
    return '—';
  };

  return (
    <div className="card p-0">
      <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-surface-800">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-100 dark:bg-surface-800/50">
          <button
            onClick={() => setTab('active')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              tab === 'active'
                ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm'
                : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            }`}
          >
            <ListTodo className="w-3.5 h-3.5" />
            All Tasks <span className="opacity-60">({activeTasks.length})</span>
          </button>
          <button
            onClick={() => setTab('archive')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              tab === 'archive'
                ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm'
                : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            }`}
          >
            Archive <span className="opacity-60">({archivedTasks.length})</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterAssignee}
            onChange={e => setFilterAssignee(e.target.value)}
            className="select py-1.5 text-xs w-40"
          >
            <option value="">All members</option>
            {users.filter(u => !u.disabled).map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-surface-200 dark:border-surface-800">
            <tr>
              <SortHeader field="title">Task</SortHeader>
              <SortHeader field="status">Status</SortHeader>
              <SortHeader field="assignee">Assigned To</SortHeader>
              <SortHeader field="priority">Priority</SortHeader>
              <SortHeader field="dueDate">Due Date</SortHeader>
              <th className="px-4 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider">Done Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-surface-400 text-sm">Loading all tasks...</td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-surface-400 text-sm">
                  {tab === 'archive' ? 'No archived tasks yet' : filterAssignee ? 'No tasks assigned to this member' : 'No tasks found'}
                </td>
              </tr>
            ) : (
              sorted.map((task: Task) => (
                <tr key={task.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link href={task.projectId ? `/projects/${task.projectId}` : '/tasks'} className="block">
                      <p className="text-sm font-medium text-surface-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
                        {task.title}
                      </p>
                      <p className="text-xs text-surface-500 mt-0.5">{task.project?.name ?? 'Personal'}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300">
                      {task.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {(task.assignees && task.assignees.length > 0) ? (
                        <>
                          <div className="flex -space-x-1">
                            {task.assignees.slice(0, 3).map((a: any) => (
                              <div key={a.id} className="w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center ring-1 ring-white dark:ring-surface-900" title={a.name}>
                                <span className="text-[10px] font-bold text-brand-700 dark:text-brand-300">{a.name.charAt(0)}</span>
                              </div>
                            ))}
                          </div>
                          <span className="text-sm text-surface-600 dark:text-surface-400">
                            {getAssigneeNames(task)}
                          </span>
                        </>
                      ) : task.assignee ? (
                        <>
                          <div className="w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-brand-700 dark:text-brand-300">{task.assignee.name.charAt(0)}</span>
                          </div>
                          <span className="text-sm text-surface-600 dark:text-surface-400">{task.assignee.name}</span>
                        </>
                      ) : (
                        <span className="text-sm text-surface-400">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${priorityColors[task.priority]}`}>
                      {task.priority === 'NONE' ? '—' : task.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-surface-600 dark:text-surface-400">
                    {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-surface-600 dark:text-surface-400">
                    {(task as any).doneDate ? format(new Date((task as any).doneDate), 'MMM d, yyyy') : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="card px-5 py-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${color}-50 dark:bg-${color}-950/30`}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-surface-900 dark:text-white">{value}</p>
          <p className="text-xs text-surface-500 dark:text-surface-400">{label}</p>
        </div>
      </div>
    </div>
  );
}
