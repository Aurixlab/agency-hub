'use client';

import { apiCall, useFetch } from '@/hooks/useFetch';
import { Task } from '@/types';
import {
  RefreshCw, Check, CheckCircle2, ChevronDown, ChevronRight, ArrowRight, ListTodo, Users, CalendarClock,
} from 'lucide-react';
import { format, formatDistanceToNow, subDays } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import TaskDetailModal from '@/components/TaskDetailModal';
import {
  dueBucket, dueLabel, dueDay, finalStatusOf, finishedAt, greetingFor, headlineFor,
  summarizeFocus, uniqueTasks, weekMessage,
} from '@/lib/dashboard-focus';

const priorityColors: Record<string, string> = {
  URGENT: 'priority-urgent',
  HIGH: 'priority-high',
  MEDIUM: 'priority-medium',
  LOW: 'priority-low',
  NONE: 'priority-none',
};

const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };

const priorityLabel = (p: string) => p.charAt(0) + p.slice(1).toLowerCase();

const LIST_CAP = 5;
const LATER_CAP = 8;

export default function DashboardPage() {
  const { data: myTasks, loading: loadingTasks, refetch: refetchTasks } = useFetch<Task[]>('/api/tasks?myTasks=true');
  const { data: standaloneTasks, refetch: refetchStandalone } = useFetch<Task[]>('/api/tasks?standalone=true');
  const { data: allTasks, loading: loadingAll, refetch: refetchAll } = useFetch<Task[]>('/api/tasks');
  const { data: users } = useFetch<any[]>('/api/users', { pollInterval: false });
  const [user, setUser] = useState<any>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [laterOpen, setLaterOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  // Tasks being completed: hidden straight away so the list reacts instantly.
  const [completing, setCompleting] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(setUser).catch(() => {});
  }, []);

  // "Today" is computed on the client after mount (no hydration mismatch) and refreshed so the
  // page stays correct if it is left open across midnight.
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const refetchEverything = useCallback(() => {
    refetchTasks(); refetchStandalone(); refetchAll();
    setNow(new Date());
  }, [refetchTasks, refetchStandalone, refetchAll]);

  const combined = useMemo(
    () => uniqueTasks<Task>(myTasks, standaloneTasks).filter(t => !completing.has(t.id)),
    [myTasks, standaloneTasks, completing],
  );
  const summary = useMemo(() => (now ? summarizeFocus(combined, now) : null), [combined, now]);

  const hide = (id: string, on: boolean) =>
    setCompleting(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });

  const completeTask = async (task: Task) => {
    hide(task.id, true);
    const { data, error } = await apiCall<Task>(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: finalStatusOf(task), doneDate: new Date().toISOString(), version: task.version }),
    });
    if (error || !data) {
      hide(task.id, false);
      toast.error(error || 'Could not mark that task done');
      return;
    }
    // Keep the task hidden until fresh data arrives, so it never flickers back into the list.
    setNow(new Date());
    await Promise.all([refetchTasks(), refetchStandalone(), refetchAll()]);
    hide(task.id, false);
    toast((t) => (
      <span className="flex items-center gap-3 text-sm">
        Done: {task.title.length > 40 ? `${task.title.slice(0, 40)}…` : task.title}
        <button
          className="font-semibold text-brand-600 hover:text-brand-700 underline underline-offset-2"
          onClick={async () => {
            toast.dismiss(t.id);
            const undo = await apiCall<Task>(`/api/tasks/${task.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: task.status, doneDate: task.doneDate ?? null, version: data.version }),
            });
            hide(task.id, false);
            if (undo.error) toast.error(undo.error); else refetchEverything();
          }}
        >
          Undo
        </button>
      </span>
    ), { duration: 6000 });
  };

  const firstName = user?.name?.split(' ')[0];
  const nextUp = summary?.nextUp ?? null;
  const groups = summary
    ? [
        { key: 'overdue', title: 'Needs attention', tasks: summary.overdue.filter(t => t.id !== nextUp?.id) },
        { key: 'today', title: 'Today', tasks: summary.today.filter(t => t.id !== nextUp?.id) },
        { key: 'week', title: 'Later this week', tasks: summary.week.filter(t => t.id !== nextUp?.id) },
      ].filter(g => g.tasks.length > 0)
    : [];
  const truncated = groups.some(g => g.tasks.length > LIST_CAP);
  const listLoading = loadingTasks || !summary;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-full overflow-x-hidden">
      {/* Greeting */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-surface-500 dark:text-surface-400">
            {now ? format(now, 'EEEE, MMMM d') : ' '}
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold text-surface-900 dark:text-white mt-1 break-words">
            {now && firstName ? `${greetingFor(now)}, ${firstName}` : 'Welcome back'}
          </h1>
          <p className="text-surface-600 dark:text-surface-300 mt-1.5 text-sm sm:text-base min-h-[1.5rem]">
            {summary ? headlineFor(summary) : ''}
          </p>
        </div>
        <button onClick={refetchEverything} className="btn-secondary btn-sm self-start sm:self-auto" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </header>

      {/* Start here */}
      {listLoading ? (
        <div className="h-40 rounded-xl bg-surface-100 dark:bg-surface-900 animate-pulse" />
      ) : nextUp ? (
        <StartHere task={nextUp} now={now!} onOpen={() => setSelectedTaskId(nextUp.id)} onComplete={() => completeTask(nextUp)} />
      ) : summary!.activeCount === 0 ? (
        <AllClear finished={summary!.finishedThisMonth} />
      ) : (
        <div className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-card p-5 sm:p-6">
          <p className="font-medium text-surface-900 dark:text-white">Nothing is due this week.</p>
          <p className="text-sm text-surface-600 dark:text-surface-400 mt-1">
            Use the quiet time to get ahead on what is coming up below.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 items-start">
        {/* Focus list */}
        <div className="lg:col-span-2 space-y-4 min-w-0">
          {(listLoading || groups.length > 0) && (
            <section className="card p-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-surface-800">
                <h2 className="font-semibold text-surface-900 dark:text-white">Your focus</h2>
                {summary && <span className="text-xs text-surface-500">{summary.focusCount} this week</span>}
              </div>
              {listLoading ? (
                <div className="p-5 space-y-3">
                  {[0, 1, 2].map(i => <div key={i} className="h-10 rounded-lg bg-surface-100 dark:bg-surface-800 animate-pulse" />)}
                </div>
              ) : (
                <div>
                  {groups.map(group => (
                    <div key={group.key}>
                      <h3 className={`px-5 pt-4 pb-1.5 text-xs font-semibold ${
                        group.key === 'overdue' ? 'text-red-700 dark:text-red-400' : 'text-surface-500 dark:text-surface-400'
                      }`}>
                        {group.title} <span className="font-normal text-surface-400">· {group.tasks.length}</span>
                      </h3>
                      <ul className="divide-y divide-surface-100 dark:divide-surface-800/70">
                        {group.tasks.slice(0, expanded ? undefined : LIST_CAP).map(task => (
                          <TaskRow key={task.id} task={task} now={now!} onOpen={setSelectedTaskId} onComplete={completeTask} />
                        ))}
                      </ul>
                    </div>
                  ))}
                  {truncated && (
                    <button
                      onClick={() => setExpanded(e => !e)}
                      className="w-full px-5 py-3 text-xs font-medium text-brand-700 dark:text-brand-300 hover:bg-surface-50 dark:hover:bg-surface-800/50 border-t border-surface-100 dark:border-surface-800 transition-colors"
                    >
                      {expanded ? 'Show fewer' : 'Show everything this week'}
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Later: present, but quiet */}
          {summary && summary.later.length > 0 && (
            <section className="rounded-xl border border-surface-200/70 dark:border-surface-800/70">
              <button
                onClick={() => setLaterOpen(o => !o)}
                aria-expanded={laterOpen}
                className="flex w-full items-center gap-2 px-5 py-3.5 text-left text-sm text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 transition-colors"
              >
                {laterOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <CalendarClock className="w-4 h-4" />
                <span className="font-medium">Coming up later</span>
                <span className="text-surface-400">· {summary.later.length}</span>
              </button>
              {laterOpen && (
                <ul className="divide-y divide-surface-100 dark:divide-surface-800/70 border-t border-surface-100 dark:border-surface-800/70">
                  {summary.later.slice(0, LATER_CAP).map(task => (
                    <TaskRow key={task.id} task={task} now={now!} onOpen={setSelectedTaskId} onComplete={completeTask} quiet />
                  ))}
                  {summary.later.length > LATER_CAP && (
                    <li className="px-5 py-3 text-xs text-surface-500">
                      + {summary.later.length - LATER_CAP} more.{' '}
                      <Link href="/tasks" className="font-medium text-brand-700 dark:text-brand-300 hover:underline">Open My Tasks</Link>
                    </li>
                  )}
                </ul>
              )}
            </section>
          )}
        </div>

        {/* Right rail: progress and wins */}
        <aside className="space-y-4 min-w-0">
          {summary && (
            <>
              <section className="card p-5">
                <h2 className="font-semibold text-surface-900 dark:text-white">Your week</h2>
                <p className="text-sm text-surface-600 dark:text-surface-300 mt-2">
                  {summary.weekTotal > 0
                    ? <><span className="font-semibold text-surface-900 dark:text-white">{summary.doneThisWeek}</span> of {summary.weekTotal} done</>
                    : 'No tasks scheduled'}
                </p>
                <div
                  className="mt-3 h-2 rounded-full bg-surface-100 dark:bg-surface-800 overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={summary.weekTotal}
                  aria-valuenow={summary.doneThisWeek}
                  aria-label="Tasks finished this week"
                >
                  <div
                    className="h-full rounded-full bg-brand-500 transition-[width] duration-500 ease-out motion-reduce:transition-none"
                    style={{ width: `${summary.weekTotal ? Math.round((summary.doneThisWeek / summary.weekTotal) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-3">{weekMessage(summary)}</p>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-1">
                  {summary.finishedThisMonth} finished this month
                </p>
              </section>

              <section className="card p-0 overflow-hidden">
                <h2 className="px-5 pt-4 pb-2 font-semibold text-surface-900 dark:text-white">Recently finished</h2>
                {summary.recentlyFinished.length === 0 ? (
                  <p className="px-5 pb-5 text-sm text-surface-500">Finished tasks will show up here.</p>
                ) : (
                  <ul className="pb-2">
                    {summary.recentlyFinished.map(task => (
                      <li key={task.id}>
                        <button
                          onClick={() => setSelectedTaskId(task.id)}
                          className="flex w-full items-start gap-2.5 px-5 py-2 text-left hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span className="min-w-0">
                            <span className="block text-sm text-surface-700 dark:text-surface-300 truncate">{task.title}</span>
                            <span className="block text-xs text-surface-500">
                              {formatDistanceToNow(finishedAt(task), { addSuffix: true })}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </aside>
      </div>

      {/* Everyone's tasks: still here, tucked away until needed */}
      <section>
        <button
          onClick={() => setAllOpen(o => !o)}
          aria-expanded={allOpen}
          className="flex items-center gap-2 text-sm font-medium text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-100 transition-colors"
        >
          {allOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <Users className="w-4 h-4" />
          Everyone&apos;s tasks
        </button>
        {allOpen && (
          <div className="mt-3">
            <AllTasksTable
              tasks={allTasks || []}
              loading={loadingAll}
              users={users || []}
              onTaskClick={setSelectedTaskId}
            />
          </div>
        )}
      </section>

      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          users={users ?? []}
          onClose={() => setSelectedTaskId(null)}
          onUpdated={() => { setSelectedTaskId(null); refetchEverything(); }}
        />
      )}
    </div>
  );
}

// ==================== HERO ====================
function StartHere({ task, now, onOpen, onComplete }: { task: Task; now: Date; onOpen: () => void; onComplete: () => void }) {
  const bucket = dueBucket(task.dueDate, now);
  return (
    <section className="rounded-xl border border-brand-200 dark:border-brand-800/50 bg-brand-50 dark:bg-brand-950/40 shadow-card p-5 sm:p-6">
      <p className="text-sm font-medium text-brand-800 dark:text-brand-200">
        {bucket === 'overdue' ? 'Start here' : bucket === 'today' ? 'Start with today' : 'Next up'}
      </p>
      <h2 className="mt-2 text-xl sm:text-2xl font-semibold text-surface-900 dark:text-white break-words">{task.title}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="text-surface-600 dark:text-surface-300">{task.project?.name ?? 'Personal'}</span>
        <span className="text-surface-400" aria-hidden>·</span>
        <span className="text-surface-600 dark:text-surface-300">{task.status}</span>
        {task.dueDate && (
          <>
            <span className="text-surface-400" aria-hidden>·</span>
            <span className={bucket === 'overdue' ? 'font-medium text-red-700 dark:text-red-400' : 'font-medium text-surface-800 dark:text-surface-100'}>
              {dueLabel(task.dueDate, now)}
            </span>
          </>
        )}
        {task.priority !== 'NONE' && (
          <span className={`badge ${priorityColors[task.priority]}`}>{priorityLabel(task.priority)}</span>
        )}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={onOpen} className="btn-primary">
          Open task <ArrowRight className="w-4 h-4" />
        </button>
        <button onClick={onComplete} className="btn-secondary">
          <Check className="w-4 h-4" /> Mark done
        </button>
      </div>
    </section>
  );
}

function AllClear({ finished }: { finished: number }) {
  return (
    <section className="rounded-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-card p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center flex-shrink-0">
          <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-semibold text-surface-900 dark:text-white">You&apos;re all caught up</h2>
          <p className="text-sm sm:text-base text-surface-600 dark:text-surface-300 mt-1 max-w-prose">
            {finished > 0 ? `${finished} finished this month. ` : ''}
            Nothing is waiting on you. Check the projects for anything you can pick up, or ask for the next task.
          </p>
          <Link href="/projects" className="btn-secondary btn-sm mt-4 inline-flex">
            Browse projects <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ==================== TASK ROW ====================
function TaskRow({ task, now, onOpen, onComplete, quiet = false }: {
  task: Task; now: Date; onOpen: (id: string) => void; onComplete: (task: Task) => void; quiet?: boolean;
}) {
  const bucket = dueBucket(task.dueDate, now);
  const label = !task.dueDate
    ? 'No due date'
    : quiet ? format(dueDay(task.dueDate), 'MMM d') : dueLabel(task.dueDate, now).replace(/^Due /, '');
  return (
    <li className="group flex items-center gap-3 px-5 py-3 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
      <button
        onClick={() => onComplete(task)}
        aria-label={`Mark "${task.title}" done`}
        title="Mark done"
        className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-surface-300 dark:border-surface-600 text-transparent hover:border-emerald-500 hover:text-emerald-600 focus-visible:border-emerald-500 focus-visible:text-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 flex items-center justify-center transition-colors"
      >
        <Check className="w-3 h-3" strokeWidth={3} />
      </button>
      <button onClick={() => onOpen(task.id)} className="flex-1 min-w-0 text-left">
        <p className={`text-sm truncate ${quiet ? 'text-surface-600 dark:text-surface-400' : 'font-medium text-surface-900 dark:text-white'}`}>
          {task.title}
        </p>
        <p className="text-xs text-surface-500 mt-0.5 truncate">
          {task.project?.name ?? 'Personal'} · {task.status}
        </p>
      </button>
      {!quiet && task.priority !== 'NONE' && task.priority !== 'LOW' && (
        <span className={`badge hidden sm:inline-flex ${priorityColors[task.priority]}`}>{priorityLabel(task.priority)}</span>
      )}
      <span className={`text-xs flex-shrink-0 ${
        bucket === 'overdue' ? 'font-medium text-red-700 dark:text-red-400' : 'text-surface-500 dark:text-surface-400'
      }`}>
        {label}
      </span>
    </li>
  );
}

// ==================== ALL TASKS TABLE COMPONENT ====================
function AllTasksTable({ tasks, loading, users, onTaskClick }: { tasks: Task[]; loading: boolean; users: any[]; onTaskClick: (id: string) => void }) {
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
    <div className="card p-0 max-w-full overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-5 py-4 border-b border-surface-200 dark:border-surface-800">
        <div className="max-w-full overflow-x-auto">
        <div className="flex w-max items-center gap-1 p-1 rounded-lg bg-surface-100 dark:bg-surface-800/50">
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
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={filterAssignee}
            onChange={e => setFilterAssignee(e.target.value)}
            className="select py-1.5 text-xs w-full sm:w-40"
          >
            <option value="">All members</option>
            {users.filter(u => !u.disabled).map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="max-w-full overflow-x-auto">
        <table className="min-w-[760px] w-full">
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
                <tr key={task.id} className="hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors cursor-pointer" onClick={() => onTaskClick(task.id)}>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-surface-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
                      {task.title}
                    </p>
                    <p className="text-xs text-surface-500 mt-0.5">{task.project?.name ?? 'Personal'}</p>
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
