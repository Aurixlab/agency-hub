import { differenceInCalendarDays, format, startOfMonth, startOfWeek } from 'date-fns';

// Pure helpers behind the member dashboard. Kept free of React so the grouping rules are testable.

export interface FocusTask {
  id: string;
  title: string;
  status: string;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  dueDate: string | null;
  doneDate: string | null;
  updatedAt?: string;
  deletedAt: string | null;
  project?: { id: string; name: string; statuses: string[] } | null;
}

export type DueBucket = 'overdue' | 'today' | 'week' | 'later' | 'none';

export const WEEK_HORIZON_DAYS = 7;

const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };

/** The last status of a task's project is its "done" column; standalone tasks use "Done". */
export function finalStatusOf(task: Pick<FocusTask, 'project'>): string {
  const statuses = task.project?.statuses;
  return Array.isArray(statuses) && statuses.length > 0 ? statuses[statuses.length - 1] : 'Done';
}

export function isTaskDone(task: FocusTask): boolean {
  return task.status === finalStatusOf(task);
}

/**
 * Due dates are stored as UTC midnight of the day the user picked, so read the calendar day from
 * the UTC parts. This keeps "due Nov 24" on Nov 24 for people in any timezone.
 */
export function dueDay(dueDate: string): Date {
  const d = new Date(dueDate);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function dueBucket(dueDate: string | null, now: Date): DueBucket {
  if (!dueDate) return 'none';
  const diff = differenceInCalendarDays(dueDay(dueDate), now);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= WEEK_HORIZON_DAYS) return 'week';
  return 'later';
}

export function dueLabel(dueDate: string | null, now: Date): string {
  if (!dueDate) return 'No due date';
  const day = dueDay(dueDate);
  const diff = differenceInCalendarDays(day, now);
  if (diff === -1) return 'Due yesterday';
  if (diff < -1) return `${-diff} days overdue`;
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  if (diff <= 6) return `Due ${format(day, 'EEEE')}`;
  return `Due ${format(day, 'MMM d')}`;
}

/** Merge task lists, dropping duplicates and soft-deleted tasks. */
export function uniqueTasks<T extends FocusTask>(...lists: Array<T[] | null | undefined>): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists) {
    for (const task of list ?? []) {
      if (task.deletedAt || seen.has(task.id)) continue;
      seen.add(task.id);
      out.push(task);
    }
  }
  return out;
}

const byDueThenPriority = (a: FocusTask, b: FocusTask) => {
  const dueA = a.dueDate ? dueDay(a.dueDate).getTime() : Infinity;
  const dueB = b.dueDate ? dueDay(b.dueDate).getTime() : Infinity;
  if (dueA !== dueB) return dueA < dueB ? -1 : 1;
  const p = (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4);
  return p !== 0 ? p : a.title.localeCompare(b.title);
};

// Overdue work is ordered by importance first: a stale low-priority task should not
// outrank an urgent one just because it is older.
const byPriorityThenDue = (a: FocusTask, b: FocusTask) => {
  const p = (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4);
  return p !== 0 ? p : byDueThenPriority(a, b);
};

export const finishedAt = (task: FocusTask): Date => new Date(task.doneDate ?? task.updatedAt ?? 0);

export interface FocusSummary<T extends FocusTask = FocusTask> {
  overdue: T[];
  today: T[];
  week: T[];
  /** Due beyond the next 7 days, plus tasks with no due date. Shown quietly. */
  later: T[];
  nextUp: T | null;
  /** Active tasks that are not the hero task, grouped for the focus list. */
  focusCount: number;
  doneThisWeek: number;
  weekTotal: number;
  finishedThisMonth: number;
  recentlyFinished: T[];
  activeCount: number;
}

export function summarizeFocus<T extends FocusTask>(tasks: T[], now: Date): FocusSummary<T> {
  const active = tasks.filter(t => !isTaskDone(t));
  const done = tasks.filter(isTaskDone);

  const overdue = active.filter(t => dueBucket(t.dueDate, now) === 'overdue').sort(byPriorityThenDue);
  const today = active.filter(t => dueBucket(t.dueDate, now) === 'today').sort(byDueThenPriority);
  const week = active.filter(t => dueBucket(t.dueDate, now) === 'week').sort(byDueThenPriority);
  const later = active
    .filter(t => {
      const b = dueBucket(t.dueDate, now);
      return b === 'later' || b === 'none';
    })
    .sort(byDueThenPriority);

  const nextUp = overdue[0] ?? today[0] ?? week[0] ?? null;

  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const doneThisWeek = done.filter(t => finishedAt(t) >= weekStart).length;
  const finishedThisMonth = done.filter(t => finishedAt(t) >= monthStart).length;

  const recentlyFinished = [...done]
    .sort((a, b) => finishedAt(b).getTime() - finishedAt(a).getTime())
    .slice(0, 4);

  const dueNow = overdue.length + today.length + week.length;

  return {
    overdue,
    today,
    week,
    later,
    nextUp,
    focusCount: dueNow,
    doneThisWeek,
    weekTotal: doneThisWeek + dueNow,
    finishedThisMonth,
    recentlyFinished,
    activeCount: active.length,
  };
}

export function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One calm sentence describing the week. Leads with what is manageable, never with a pile-up. */
export function headlineFor(s: FocusSummary): string {
  if (s.activeCount === 0) return "You're all caught up.";
  if (s.focusCount === 0) return `Nothing due this week. ${plural(s.later.length, 'task is', 'tasks are')} further out.`;
  const parts = [`${plural(s.focusCount, 'task', 'tasks')} on your plate this week`];
  if (s.today.length > 0) parts.push(`${s.today.length} due today`);
  if (s.overdue.length > 0) parts.push(`${s.overdue.length} to catch up on`);
  return `${parts.join(', ')}.`;
}

export function weekMessage(s: FocusSummary): string {
  if (s.weekTotal === 0) return 'Nothing scheduled this week yet.';
  if (s.doneThisWeek === 0) return 'A fresh start. Pick the task above and go.';
  if (s.doneThisWeek >= s.weekTotal) return 'Week cleared. Nice work.';
  if (s.doneThisWeek / s.weekTotal >= 0.5) return 'More than halfway there.';
  return 'Good start. Keep the momentum.';
}
