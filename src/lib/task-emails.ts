import type { PrismaClient } from '@prisma/client';
import { finalStatusOf } from './dashboard-focus';
import { getEmailsEnabled } from './email-settings';
import { SEND_GAP_MS, sendEmail, sleep, type SendEmailResult } from './email';
import { assignmentEmail, digestEmail, type EmailContent } from './email-templates';

// Task emails: batched "new tasks assigned to you" messages and a daily team digest.
// Selection, date and grouping logic is pure (plain data + a `now` Date) so it can be tested without a DB.
// Prisma is only touched inside the two runner functions at the bottom.

export const EXCLUDED_USERNAMES = ['guest'];
export const DIGEST_DAYS = 5;
export const DIGEST_TIME_ZONE = 'Asia/Dhaka';
export const DEFAULT_APP_URL = 'https://mission.aurixlab.com';

export const appUrl = () => (process.env.APP_URL || DEFAULT_APP_URL).replace(/\/+$/, '');

const MS_PER_DAY = 86_400_000;
const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };

// ---------- Types ----------

export interface TaskRecord {
  id: string;
  title: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  assigneeIds: unknown;
  dueDate: Date | string | null;
  deletedAt: Date | string | null;
  project?: { name: string; statuses: unknown } | null;
}

export interface UserRecord {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  disabled: boolean;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  taskId: string | null;
  actorName: string;
  taskTitle: string;
}

export interface DigestTask {
  id: string;
  title: string;
  projectName: string | null;
  priority: string;
  /** Integer day number of the due date (UTC calendar day). */
  day: number;
  /** "Fri, Nov 27" */
  dayLabel: string;
  /** Days past due, 0 when not overdue. */
  daysOverdue: number;
}

export interface DigestDay {
  day: number;
  label: string;
  tasks: DigestTask[];
}

export interface MemberDigest {
  id: string;
  name: string;
  email: string;
  overdue: DigestTask[];
  today: DigestTask[];
  /** Days today+1 .. today+5 that have at least one task. */
  upcoming: DigestDay[];
  counts: { overdue: number; today: number; upcoming: number; total: number };
}

export interface DigestData {
  todayDay: number;
  todayLabel: string;
  /** "Tue, Nov 24" */
  todayShort: string;
  members: MemberDigest[];
  anyDue: boolean;
}

export interface AssignmentItem {
  taskId: string;
  title: string;
  projectName: string | null;
  priority: string;
  dueLabel: string | null;
  /** Integer day number of the current due date, for urgency colouring. */
  dueDay: number | null;
  actorName: string;
}

export interface AssignmentBatch {
  userId: string;
  name: string;
  email: string | null;
  items: AssignmentItem[];
  /** Every pending notification of this user. All are marked handled, listed or not. */
  notificationIds: string[];
}

export interface RunOptions {
  dryRun?: boolean;
  /** Username to send made-up sample content to. Any string, even empty, selects sample mode. */
  sample?: string;
}

/** Swapped out in tests; routes always use the defaults. */
export interface RunDeps {
  db?: Pick<PrismaClient, 'user' | 'task' | 'notification' | 'appSetting'>;
  send?: typeof sendEmail;
}

// ---------- Dates ----------

const dayNumberOf = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m, d) / MS_PER_DAY);

/** Today's calendar date in Asia/Dhaka as an integer day number, independent of the server timezone. */
export function dhakaToday(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DIGEST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return dayNumberOf(get('year'), get('month') - 1, get('day'));
}

/** Due dates are stored as UTC midnight of the picked day, so the UTC Y-M-D is the calendar day. */
export function dueDayNumber(dueDate: Date | string): number {
  const d = new Date(dueDate);
  return dayNumberOf(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** "Fri, Nov 27" */
export function dayLabel(day: number): string {
  return new Date(day * MS_PER_DAY).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** "Tuesday, November 24, 2026" */
export function longDayLabel(day: number): string {
  return new Date(day * MS_PER_DAY).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------- Task helpers ----------

/** Union of the primary assignee and the ids in the JSON `assigneeIds` list. */
export function assigneesOf(task: Pick<TaskRecord, 'assigneeId' | 'assigneeIds'>): string[] {
  const ids = new Set<string>();
  if (task.assigneeId) ids.add(task.assigneeId);
  if (Array.isArray(task.assigneeIds)) {
    for (const id of task.assigneeIds) if (typeof id === 'string' && id) ids.add(id);
  }
  return Array.from(ids);
}

export function isTaskFinished(task: Pick<TaskRecord, 'status' | 'project'>): boolean {
  const statuses = task.project?.statuses;
  return (
    task.status ===
    finalStatusOf({
      project: task.project
        ? { id: '', name: task.project.name, statuses: Array.isArray(statuses) ? (statuses as string[]) : [] }
        : null,
    })
  );
}

export function isEligibleRecipient(user: UserRecord): boolean {
  return (
    !user.disabled &&
    !!user.email?.trim() &&
    (user.role === 'ADMIN' || user.role === 'MEMBER') &&
    !EXCLUDED_USERNAMES.includes(user.username)
  );
}

const priorityRank = (p: string) => PRIORITY_RANK[p] ?? 4;

const byDayThenPriority = (a: DigestTask, b: DigestTask) =>
  a.day - b.day || priorityRank(a.priority) - priorityRank(b.priority) || a.title.localeCompare(b.title);

const byPriorityThenDay = (a: DigestTask, b: DigestTask) =>
  priorityRank(a.priority) - priorityRank(b.priority) || byDayThenPriority(a, b);

// ---------- Digest ----------

export function buildDigest(users: UserRecord[], tasks: TaskRecord[], now: Date): DigestData {
  const todayDay = dhakaToday(now);
  const recipients = users.filter(isEligibleRecipient);

  const open = tasks.filter(t => !t.deletedAt && t.dueDate && !isTaskFinished(t));

  const members: MemberDigest[] = recipients.map(user => {
    const overdue: DigestTask[] = [];
    const today: DigestTask[] = [];
    const byDay = new Map<number, DigestTask[]>();

    for (const task of open) {
      if (!assigneesOf(task).includes(user.id)) continue;
      const day = dueDayNumber(task.dueDate as Date | string);
      if (day > todayDay + DIGEST_DAYS) continue;
      const item: DigestTask = {
        id: task.id,
        title: task.title,
        projectName: task.project?.name ?? null,
        priority: task.priority,
        day,
        dayLabel: dayLabel(day),
        daysOverdue: Math.max(0, todayDay - day),
      };
      if (day < todayDay) overdue.push(item);
      else if (day === todayDay) today.push(item);
      else byDay.set(day, [...(byDay.get(day) ?? []), item]);
    }

    overdue.sort(byPriorityThenDay);
    today.sort(byDayThenPriority);
    const upcoming = Array.from(byDay.entries())
      .sort(([a], [b]) => a - b)
      .map(([day, list]) => ({ day, label: dayLabel(day), tasks: list.sort(byDayThenPriority) }));
    const upcomingCount = upcoming.reduce((n, d) => n + d.tasks.length, 0);

    return {
      id: user.id,
      name: user.name,
      email: (user.email as string).trim(),
      overdue,
      today,
      upcoming,
      counts: {
        overdue: overdue.length,
        today: today.length,
        upcoming: upcomingCount,
        total: overdue.length + today.length + upcomingCount,
      },
    };
  });

  return {
    todayDay,
    todayLabel: longDayLabel(todayDay),
    todayShort: dayLabel(todayDay),
    members,
    anyDue: members.some(m => m.counts.total > 0),
  };
}

// ---------- Assignment batches ----------

/**
 * Group pending `task_assigned` notifications into one batch per user. A notification is listed only if
 * its task still exists, is not done, and is still assigned to that user; the rest are only marked handled.
 * Users who are disabled or have no email get a batch with no items (handled, nothing sent).
 */
export function buildAssignmentBatches(
  notifications: NotificationRecord[],
  tasks: TaskRecord[],
  users: UserRecord[],
): AssignmentBatch[] {
  const taskById = new Map(tasks.map(t => [t.id, t]));
  const userById = new Map(users.map(u => [u.id, u]));
  const batches = new Map<string, AssignmentBatch>();
  const listed = new Map<string, Map<string, AssignmentItem>>();

  for (const n of notifications) {
    const user = userById.get(n.userId);
    let batch = batches.get(n.userId);
    if (!batch) {
      batch = { userId: n.userId, name: user?.name ?? '', email: user?.email?.trim() || null, items: [], notificationIds: [] };
      batches.set(n.userId, batch);
      listed.set(n.userId, new Map());
    }
    batch.notificationIds.push(n.id);

    if (!user || user.disabled || !batch.email || !n.taskId) continue;
    const task = taskById.get(n.taskId);
    if (!task || task.deletedAt || isTaskFinished(task)) continue;
    if (!assigneesOf(task).includes(n.userId)) continue;

    // Same task assigned twice in one window: list it once, credit the latest assigner.
    listed.get(n.userId)!.set(task.id, {
      taskId: task.id,
      title: task.title,
      projectName: task.project?.name ?? null,
      priority: task.priority,
      dueLabel: task.dueDate ? dayLabel(dueDayNumber(task.dueDate)) : null,
      dueDay: task.dueDate ? dueDayNumber(task.dueDate) : null,
      actorName: n.actorName,
    });
  }

  batches.forEach((batch, userId) => {
    batch.items = Array.from(listed.get(userId)!.values());
  });
  return Array.from(batches.values());
}

// ---------- Sample content ----------

export type EmailKind = 'assignment' | 'digest';

const SAMPLE_PROJECT = { name: 'Sample project', statuses: ['To Do', 'Done'] };

/**
 * Made-up users, tasks and notifications for previewing the emails. The only real value is the
 * recipient's first name. The first user is the recipient.
 */
export function buildSampleData(
  recipientName: string,
  now: Date,
): { users: UserRecord[]; tasks: TaskRecord[]; notifications: NotificationRecord[] } {
  const todayDay = dhakaToday(now);
  const person = (id: string, name: string): UserRecord => ({
    id, username: id, name, email: `${id}@example.com`, role: 'MEMBER', disabled: false,
  });
  const you = person('sample-you', recipientName.trim().split(/\s+/)[0] || 'You');
  const users = [you, ...['A', 'B', 'C', 'D', 'E'].map(x => person(`sample-${x.toLowerCase()}`, `Teammate ${x}`))];

  const task = (n: number, title: string, assigneeId: string, offset: number, priority: string): TaskRecord => ({
    id: `sample-task-${n}`,
    title: `Sample: ${title}`,
    status: 'To Do',
    priority,
    assigneeId,
    assigneeIds: [],
    dueDate: new Date((todayDay + offset) * MS_PER_DAY),
    deletedAt: null,
    project: SAMPLE_PROJECT,
  });
  // Covers every urgency and priority. Teammates D and E have no tasks, so they show as all clear.
  const tasks = [
    task(1, 'homepage banner update', you.id, -2, 'URGENT'),
    task(2, 'pricing table fix', you.id, -1, 'HIGH'),
    task(3, 'weekly report draft', you.id, 0, 'MEDIUM'),
    task(4, 'contact page copy', you.id, 2, 'LOW'),
    task(5, 'image alt text pass', you.id, 4, 'MEDIUM'),
    // Beyond the digest window: only the assignment email lists it, in the neutral colour.
    task(6, 'quarterly plan outline', you.id, 9, 'NONE'),
    task(7, 'newsletter layout', 'sample-a', -5, 'URGENT'),
    task(8, 'footer link check', 'sample-a', -3, 'MEDIUM'),
    task(9, 'checkout wording review', 'sample-a', -1, 'HIGH'),
    task(10, 'menu spacing tweak', 'sample-a', 3, 'LOW'),
    task(11, 'social image resize', 'sample-b', 0, 'HIGH'),
    task(12, 'signup form copy', 'sample-b', 0, 'LOW'),
    task(13, 'sitemap review', 'sample-b', 5, 'NONE'),
    task(14, 'blog outline', 'sample-c', 1, 'MEDIUM'),
    task(15, 'product photo selection', 'sample-c', 1, 'HIGH'),
    task(16, 'help page refresh', 'sample-c', 2, 'LOW'),
    task(17, 'metadata cleanup', 'sample-c', 3, 'MEDIUM'),
    task(18, 'banner copy options', 'sample-c', 4, 'LOW'),
    task(19, 'analytics notes', 'sample-c', 5, 'NONE'),
  ];

  const notifications = tasks
    .filter(t => t.assigneeId === you.id)
    .map(t => ({ id: `n-${t.id}`, userId: you.id, taskId: t.id, actorName: 'Teammate A', taskTitle: t.title }));

  return { users, tasks, notifications };
}

export function buildSampleEmail(kind: EmailKind, recipientName: string, now: Date, base: string): EmailContent {
  const { users, tasks, notifications } = buildSampleData(recipientName, now);
  let mail: EmailContent;
  if (kind === 'digest') {
    const digest = buildDigest(users, tasks, now);
    mail = digestEmail({ digest, member: digest.members[0], appUrl: base });
  } else {
    const [batch] = buildAssignmentBatches(notifications, tasks, users);
    mail = assignmentEmail({ name: batch.name, items: batch.items, appUrl: base, now });
  }
  return { ...mail, subject: `[Sample] ${mail.subject}` };
}

// ---------- Runners ----------

/**
 * The endpoint response. It ends up in public CI logs, so it must never carry names, addresses,
 * task data or email content. Details go to console.error on the server.
 */
export interface RunSummary {
  ok: boolean;
  recipients: number;
  sent: number;
  failed: number;
  /** Count of recipients not emailed (claimed by another run, nothing to list), or why the run was skipped. */
  skipped: number | string;
  dryRun?: boolean;
  sample?: boolean;
  /** Dry runs only: which way the Settings "Emails" switch is set. */
  emailsEnabled?: boolean;
  /** Generic messages only. */
  errors?: string[];
}

async function getPrisma(): Promise<PrismaClient> {
  // Loaded lazily so the pure functions above stay importable without a database client.
  return (await import('./prisma')).prisma;
}

const emptySummary = (dryRun: boolean, recipients = 0, emailsEnabled?: boolean): RunSummary => ({
  ok: true,
  recipients,
  sent: 0,
  failed: 0,
  skipped: 0,
  ...(dryRun ? { dryRun: true } : {}),
  ...(dryRun && emailsEnabled !== undefined ? { emailsEnabled } : {}),
});

/** A real run while the switch is off. `ok` stays true so the scheduled job does not report a failure. */
const emailsOffSummary = (): RunSummary => ({ ...emptySummary(false), skipped: 'emails off' });

/** Count a failed send: full detail to the server log, a generic line in the response. */
function recordFailure(summary: RunSummary, who: string, result: Extract<SendEmailResult, { ok: false }>) {
  console.error(`Task email to ${who} failed: ${result.error}`);
  summary.ok = false;
  summary.failed += 1;
  summary.errors = [
    ...(summary.errors ?? []),
    result.status ? `send failed (status ${result.status})` : 'send failed',
  ];
}

/** Sample mode: reads one user row, sends made-up content to that user only, writes nothing. */
async function runSample(kind: EmailKind, username: string, dryRun: boolean, deps: RunDeps): Promise<RunSummary> {
  const db = deps.db ?? (await getPrisma());
  const summary: RunSummary = { ...emptySummary(dryRun), sample: true };

  const user = username
    ? await db.user.findUnique({ where: { username }, select: { name: true, email: true, disabled: true } })
    : null;
  const email = user?.email?.trim();
  if (!user || user.disabled || !email) {
    return { ...summary, ok: false, errors: ['sample user unavailable'] };
  }

  const mail = buildSampleEmail(kind, user.name, new Date(), appUrl());
  summary.recipients = 1;
  if (dryRun) return summary;

  const result = await (deps.send ?? sendEmail)({ to: email, ...mail });
  if (result.ok) summary.sent = 1;
  else recordFailure(summary, username, result);
  return summary;
}

export async function runAssignmentEmails(
  { dryRun = false, sample }: RunOptions = {},
  deps: RunDeps = {},
): Promise<RunSummary> {
  if (sample !== undefined) return runSample('assignment', sample, dryRun, deps);

  const prisma = deps.db ?? (await getPrisma());
  const send = deps.send ?? sendEmail;
  const now = new Date();

  // A failed read throws, so nothing is sent when the setting is unknown.
  const emailsEnabled = await getEmailsEnabled(prisma);
  if (!dryRun && !emailsEnabled) return emailsOffSummary();

  const notifications: NotificationRecord[] = await prisma.notification.findMany({
    where: { type: 'task_assigned', emailedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true, taskId: true, actorName: true, taskTitle: true },
  });
  if (notifications.length === 0) return emptySummary(dryRun, 0, emailsEnabled);

  const taskIds = Array.from(new Set(notifications.map(n => n.taskId).filter((id): id is string => !!id)));
  const userIds = Array.from(new Set(notifications.map(n => n.userId)));
  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: {
        id: true, title: true, status: true, priority: true, assigneeId: true, assigneeIds: true,
        dueDate: true, deletedAt: true, project: { select: { name: true, statuses: true } },
      },
    }) as Promise<TaskRecord[]>,
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, name: true, email: true, role: true, disabled: true },
    }) as Promise<UserRecord[]>,
  ]);

  const batches = buildAssignmentBatches(notifications, tasks, users);
  const toSend = batches.filter(b => b.items.length > 0 && b.email);
  const base = appUrl();
  const rendered = toSend.map(b => ({ batch: b, mail: assignmentEmail({ name: b.name, items: b.items, appUrl: base, now }) }));

  const summary: RunSummary = {
    ...emptySummary(dryRun, rendered.length, emailsEnabled),
    skipped: batches.length - rendered.length,
  };
  if (dryRun) return summary;

  // Notifications with nothing to list (task done, deleted, reassigned, user disabled) are just marked handled.
  const silentIds = batches.filter(b => !rendered.some(r => r.batch === b)).flatMap(b => b.notificationIds);
  if (silentIds.length > 0) {
    await prisma.notification.updateMany({ where: { id: { in: silentIds }, emailedAt: null }, data: { emailedAt: new Date() } });
  }

  let first = true;
  for (const { batch, mail } of rendered) {
    const ids = batch.notificationIds;
    // Claim first so a double-fired run cannot send the same batch twice.
    const claim = await prisma.notification.updateMany({ where: { id: { in: ids }, emailedAt: null }, data: { emailedAt: new Date() } });
    if (claim.count !== ids.length) {
      // Another run already took some or all of these rows; leave them to that run.
      summary.skipped = (summary.skipped as number) + 1;
      continue;
    }
    if (!first) await sleep(SEND_GAP_MS);
    first = false;
    const result = await send({ to: batch.email as string, ...mail });
    if (result.ok) {
      summary.sent += 1;
    } else {
      recordFailure(summary, batch.name, result);
      await prisma.notification.updateMany({ where: { id: { in: ids } }, data: { emailedAt: null } });
    }
  }
  return summary;
}

export async function runDailyDigest(
  { dryRun = false, sample }: RunOptions = {},
  deps: RunDeps = {},
): Promise<RunSummary> {
  if (sample !== undefined) return runSample('digest', sample, dryRun, deps);

  const prisma = deps.db ?? (await getPrisma());
  const send = deps.send ?? sendEmail;
  const now = new Date();

  // A failed read throws, so nothing is sent when the setting is unknown.
  const emailsEnabled = await getEmailsEnabled(prisma);
  if (!dryRun && !emailsEnabled) return emailsOffSummary();

  const users: UserRecord[] = await prisma.user.findMany({
    where: { disabled: false, role: { in: ['ADMIN', 'MEMBER'] }, username: { notIn: EXCLUDED_USERNAMES } },
    orderBy: { name: 'asc' },
    select: { id: true, username: true, name: true, email: true, role: true, disabled: true },
  });

  // Anything due up to a week ahead covers every overdue and next-5-days task whatever the server timezone.
  const horizon = new Date(now.getTime() + 7 * MS_PER_DAY);
  const tasks: TaskRecord[] = await prisma.task.findMany({
    where: { deletedAt: null, dueDate: { not: null, lt: horizon } },
    select: {
      id: true, title: true, status: true, priority: true, assigneeId: true, assigneeIds: true,
      dueDate: true, deletedAt: true, project: { select: { name: true, statuses: true } },
    },
  });

  const digest = buildDigest(users, tasks, now);
  const base = appUrl();

  if (!digest.anyDue) {
    return { ...emptySummary(dryRun, digest.members.length, emailsEnabled), skipped: 'nothing due' };
  }

  const rendered = digest.members.map(member => ({
    member,
    mail: digestEmail({ digest, member, appUrl: base }),
  }));

  const summary = emptySummary(dryRun, rendered.length, emailsEnabled);
  if (dryRun) return summary;

  for (let i = 0; i < rendered.length; i++) {
    if (i > 0) await sleep(SEND_GAP_MS);
    const { member, mail } = rendered[i];
    const result = await send({ to: member.email, ...mail });
    if (result.ok) summary.sent += 1;
    else recordFailure(summary, member.name, result);
  }
  return summary;
}
