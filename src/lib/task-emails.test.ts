import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assigneesOf,
  buildAssignmentBatches,
  buildDigest,
  buildSampleData,
  buildSampleEmail,
  dhakaToday,
  runAssignmentEmails,
  runDailyDigest,
  type NotificationRecord,
  type RunDeps,
  type RunSummary,
  type TaskRecord,
  type UserRecord,
} from './task-emails';
import { assignmentEmail, digestEmail } from './email-templates';

// Tuesday 24 Nov 2026, 10:00 in Dhaka (04:00 UTC).
const NOW = new Date('2026-11-24T04:00:00Z');
const APP = 'https://mission.aurixlab.com';

// Due dates are stored as UTC midnight of the picked calendar day.
const due = (offsetDays: number) => new Date(Date.UTC(2026, 10, 24 + offsetDays));

const project = { name: 'Website', statuses: ['To Do', 'In Progress', 'Shipped'] };

let seq = 0;
function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    status: 'To Do',
    priority: 'MEDIUM',
    assigneeId: 'u1',
    assigneeIds: [],
    dueDate: due(0),
    deletedAt: null,
    project: null,
    ...overrides,
  };
}

function user(id: string, overrides: Partial<UserRecord> = {}): UserRecord {
  return { id, username: id, name: `User ${id}`, email: `${id}@example.com`, role: 'MEMBER', disabled: false, ...overrides };
}

const ann = user('u1', { name: 'Ann Lee' });
const bob = user('u2', { name: 'Bob Ray' });
const TEAM = [ann, bob];

const member = (users: UserRecord[], tasks: TaskRecord[], id: string, now = NOW) =>
  buildDigest(users, tasks, now).members.find(m => m.id === id)!;

test('Dhaka today rolls over at 18:00 UTC regardless of server timezone', () => {
  const nov24 = dhakaToday(new Date('2026-11-24T17:59:00Z'));
  const nov25 = dhakaToday(new Date('2026-11-24T19:00:00Z'));
  assert.equal(nov25 - nov24, 1);
  assert.equal(nov24, Math.floor(Date.UTC(2026, 10, 24) / 86400000));
});

test('a task due on the Dhaka "tomorrow" is due today once Dhaka rolls over', () => {
  const t = task({ dueDate: due(1) });
  assert.equal(member(TEAM, [t], 'u1', NOW).counts.today, 0);
  assert.equal(member(TEAM, [t], 'u1', new Date('2026-11-24T19:00:00Z')).counts.today, 1);
});

test('buckets: overdue, today, next 5 days (day 5 in, day 6 out)', () => {
  const tasks = [
    task({ title: 'late', dueDate: due(-2) }),
    task({ title: 'now', dueDate: due(0) }),
    task({ title: 'd1', dueDate: due(1) }),
    task({ title: 'd5', dueDate: due(5) }),
    task({ title: 'd6', dueDate: due(6) }),
    task({ title: 'nodue', dueDate: null }),
  ];
  const m = member(TEAM, tasks, 'u1');
  assert.deepEqual(m.overdue.map(t => t.title), ['late']);
  assert.equal(m.overdue[0].daysOverdue, 2);
  assert.deepEqual(m.today.map(t => t.title), ['now']);
  assert.deepEqual(m.upcoming.flatMap(d => d.tasks.map(t => t.title)), ['d1', 'd5']);
  assert.deepEqual(m.counts, { overdue: 1, today: 1, upcoming: 2, total: 4 });
  assert.equal(m.upcoming[0].label, 'Wed, Nov 25');
});

test('done and deleted tasks are excluded, using the project final status', () => {
  const tasks = [
    task({ title: 'standalone done', status: 'Done' }),
    task({ title: 'project done', status: 'Shipped', project }),
    task({ title: 'project open', status: 'In Progress', project }),
    task({ title: 'deleted', deletedAt: new Date() }),
    // "Done" is not the final status of this project, so the task is still open.
    task({ title: 'not final', status: 'Done', project }),
  ];
  const m = member(TEAM, tasks, 'u1');
  assert.deepEqual(m.today.map(t => t.title).sort(), ['not final', 'project open']);
  assert.equal(m.today.find(t => t.title === 'project open')!.projectName, 'Website');
});

test('multi-assignee tasks appear for each assignee', () => {
  assert.deepEqual(assigneesOf({ assigneeId: 'u1', assigneeIds: ['u2', 'u1', 5] }).sort(), ['u1', 'u2']);
  const shared = task({ title: 'shared', assigneeId: 'u1', assigneeIds: ['u2'] });
  const onlyIds = task({ title: 'ids only', assigneeId: null, assigneeIds: ['u2'] });
  const digest = buildDigest(TEAM, [shared, onlyIds], NOW);
  assert.deepEqual(digest.members.find(m => m.id === 'u1')!.today.map(t => t.title), ['shared']);
  assert.deepEqual(digest.members.find(m => m.id === 'u2')!.today.map(t => t.title).sort(), ['ids only', 'shared']);
});

test('recipients: disabled, no email, guest and GUEST role are left out', () => {
  const users = [
    ann,
    user('u3', { disabled: true }),
    user('u4', { email: null }),
    user('u5', { email: '  ' }),
    user('guest', { username: 'guest' }),
    user('u6', { role: 'GUEST' }),
    user('u7', { role: 'ADMIN' }),
  ];
  const ids = buildDigest(users, [], NOW).members.map(m => m.id);
  assert.deepEqual(ids, ['u1', 'u7']);
});

test('own section is omitted when empty but the team overview lists everyone', () => {
  const digest = buildDigest(TEAM, [task({ title: 'Ann only', assigneeId: 'u1' })], NOW);
  const bobMail = digestEmail({ digest, member: digest.members.find(m => m.id === 'u2')!, appUrl: APP });
  assert.ok(!bobMail.html.includes('Your tasks'));
  assert.ok(!bobMail.text.includes('YOUR TASKS'));
  assert.ok(bobMail.html.includes('Team this week'));
  assert.ok(bobMail.html.includes('Ann Lee'));
  assert.ok(bobMail.html.includes('Bob Ray'));
  assert.ok(bobMail.html.includes('Nothing due'));
  assert.ok(bobMail.html.includes('Ann only'));

  const annMail = digestEmail({ digest, member: digest.members.find(m => m.id === 'u1')!, appUrl: APP });
  assert.ok(annMail.html.includes('Your tasks'));
  assert.ok(annMail.html.indexOf('Your tasks') < annMail.html.indexOf('Team this week'));
});

test('digest is skipped when nobody has anything due', () => {
  const none = buildDigest(TEAM, [task({ dueDate: due(9) }), task({ dueDate: null }), task({ status: 'Done' })], NOW);
  assert.equal(none.anyDue, false);
  assert.equal(none.members.length, 2);
  assert.equal(buildDigest(TEAM, [task()], NOW).anyDue, true);
});

test('team overview caps titles at 4 and flags overdue', () => {
  const tasks = [
    task({ title: 'Late one', dueDate: due(-1) }),
    ...[1, 2, 3, 4, 5].map(n => task({ title: `Soon ${n}`, dueDate: due(n) })),
  ];
  const digest = buildDigest(TEAM, tasks, NOW);
  const mail = digestEmail({ digest, member: digest.members[1], appUrl: APP });
  assert.ok(mail.html.includes('+2 more'));
  assert.ok(mail.html.includes('(overdue)'));
});

test('digest email has stats, link and no em dashes', () => {
  const digest = buildDigest(TEAM, [task({ dueDate: due(-1) }), task({ dueDate: due(2) })], NOW);
  const mail = digestEmail({ digest, member: digest.members[0], appUrl: APP });
  assert.equal(mail.subject, 'Your day: 1 overdue, 0 due today, 1 in the next 5 days');
  assert.ok(mail.html.includes(`${APP}/dashboard`));
  assert.ok(mail.html.includes('Bangladesh time'));
  assert.ok(!mail.html.includes('—') && !mail.text.includes('—'));
});

// ---------- Assignment batches ----------

const notif = (id: string, userId: string, taskId: string | null, actorName = 'Zed'): NotificationRecord => ({
  id,
  userId,
  taskId,
  actorName,
  taskTitle: 'x',
});

test('several notifications for one user become ONE message listing each task', () => {
  const a = task({ title: 'A', assigneeId: 'u1' });
  const b = task({ title: 'B', assigneeId: null, assigneeIds: ['u1'] });
  const c = task({ title: 'C', assigneeId: 'u2' });
  const batches = buildAssignmentBatches(
    [notif('n1', 'u1', a.id), notif('n2', 'u1', b.id), notif('n3', 'u2', c.id)],
    [a, b, c],
    TEAM,
  );
  assert.equal(batches.length, 2);
  const annBatch = batches.find(x => x.userId === 'u1')!;
  assert.deepEqual(annBatch.items.map(i => i.title), ['A', 'B']);
  assert.deepEqual(annBatch.notificationIds, ['n1', 'n2']);

  const mail = assignmentEmail({ name: 'Ann Lee', items: annBatch.items, appUrl: APP, now: NOW });
  assert.equal(mail.subject, '2 new tasks assigned to you');
  assert.ok(mail.html.includes('Assigned by Zed'));
  assert.ok(mail.html.includes('Hi Ann'));
});

test('a single task gets a specific subject; duplicates are listed once', () => {
  const a = task({ title: 'A', priority: 'URGENT', dueDate: due(3), project });
  const batches = buildAssignmentBatches([notif('n1', 'u1', a.id, 'Bob'), notif('n2', 'u1', a.id, 'Cy')], [a], TEAM);
  assert.equal(batches[0].items.length, 1);
  assert.equal(batches[0].items[0].actorName, 'Cy');
  assert.deepEqual(batches[0].notificationIds, ['n1', 'n2']);
  const mail = assignmentEmail({ name: 'Ann Lee', items: batches[0].items, appUrl: APP, now: NOW });
  assert.equal(mail.subject, 'New task from Cy: A');
  assert.ok(mail.html.includes('Website'));
  assert.ok(mail.html.includes('Urgent priority'));
  assert.ok(mail.html.includes('Due Fri, Nov 27'));
});

test('done, deleted, reassigned, missing and null-task notifications are handled but not listed', () => {
  const done = task({ title: 'done', status: 'Done' });
  const gone = task({ title: 'gone', deletedAt: new Date() });
  const moved = task({ title: 'moved', assigneeId: 'u2' });
  const live = task({ title: 'live' });
  const batches = buildAssignmentBatches(
    [
      notif('n1', 'u1', done.id),
      notif('n2', 'u1', gone.id),
      notif('n3', 'u1', moved.id),
      notif('n4', 'u1', 'missing'),
      notif('n5', 'u1', null),
      notif('n6', 'u1', live.id),
    ],
    [done, gone, moved, live],
    TEAM,
  );
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].items.map(i => i.title), ['live']);
  assert.deepEqual(batches[0].notificationIds, ['n1', 'n2', 'n3', 'n4', 'n5', 'n6']);
});

test('disabled or email-less users get no items but their notifications are handled', () => {
  const t = task({ assigneeId: 'u3', assigneeIds: ['u4'] });
  const users = [user('u3', { disabled: true }), user('u4', { email: null })];
  const batches = buildAssignmentBatches([notif('n1', 'u3', t.id), notif('n2', 'u4', t.id)], [t], users);
  assert.equal(batches.length, 2);
  for (const b of batches) assert.equal(b.items.length, 0);
  assert.deepEqual(batches.flatMap(b => b.notificationIds), ['n1', 'n2']);
});

// ---------- Escaping ----------

test('user text is HTML-escaped in both emails', () => {
  const evil = '<script>alert(1)</script>';
  const evilUser = user('u9', { name: '<b>Eve</b> "Q"' });
  const t = task({ title: evil, assigneeId: 'u9', project: { name: '<img src=x onerror=1>', statuses: ['To Do', 'Done'] } });

  const digest = buildDigest([evilUser, bob], [t], NOW);
  const dMail = digestEmail({ digest, member: digest.members[1], appUrl: APP });
  const batches = buildAssignmentBatches([notif('n1', 'u9', t.id, evil)], [t], [evilUser]);
  const aMail = assignmentEmail({ name: evilUser.name, items: batches[0].items, appUrl: APP, now: NOW });

  for (const html of [dMail.html, aMail.html]) {
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(!html.includes('<b>Eve</b>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  }
});

// ---------- Sample content ----------

test('sample data is made up and covers overdue, today, later and teammates', () => {
  const data = buildSampleData('Robin Placeholder', NOW);
  for (const t of data.tasks) {
    assert.ok(t.title.startsWith('Sample: '));
    assert.equal(t.project!.name, 'Sample project');
  }
  assert.deepEqual(data.users.map(u => u.name), ['Robin', 'Teammate A', 'Teammate B']);
  assert.ok(data.users.every(u => u.email!.endsWith('@example.com')));

  const digest = buildDigest(data.users, data.tasks, NOW);
  assert.deepEqual(digest.members[0].counts, { overdue: 1, today: 1, upcoming: 2, total: 4 });
  assert.ok(digest.members[1].counts.total > 0);
  assert.equal(digest.members[2].counts.total, 0);
});

test('sample emails are marked and contain every section', () => {
  const d = buildSampleEmail('digest', 'Robin Placeholder', NOW, APP);
  assert.ok(d.subject.startsWith('[Sample] '));
  const sections = ['Hi Robin', 'Your tasks', 'Overdue', 'Today', 'Thu, Nov 26', 'Sat, Nov 28', 'Team this week', 'Teammate A', 'Nothing due'];
  for (const part of sections) assert.ok(d.html.includes(part), part);
  assert.ok(!d.html.includes('Placeholder'));

  const a = buildSampleEmail('assignment', 'Robin Placeholder', NOW, APP);
  assert.equal(a.subject, '[Sample] 4 new tasks assigned to you');
  assert.ok(a.html.includes('Sample: homepage banner update'));
  assert.ok(a.html.includes('Assigned by Teammate A'));
});

// ---------- Runners (fake database and sender, no network) ----------

const PUBLIC_KEYS = ['ok', 'recipients', 'sent', 'failed', 'skipped', 'dryRun', 'sample', 'errors'];
const RUNNERS = [runAssignmentEmails, runDailyDigest];

function assertPublic(summary: RunSummary) {
  for (const key of Object.keys(summary)) assert.ok(PUBLIC_KEYS.includes(key), `unexpected key ${key}`);
  const json = JSON.stringify(summary);
  for (const secret of ['@', 'Ann', 'Lee', 'Bob', 'Secret title', 'u1', '<']) {
    assert.ok(!json.includes(secret), `response leaks ${secret}: ${json}`);
  }
}

function fakes(opts: { fail?: boolean; user?: Partial<UserRecord> | null } = {}) {
  const sent: Array<{ to: string; subject: string }> = [];
  const calls: string[] = [];
  // Long overdue, so the digest has something to report whatever today's date is.
  const t = task({ title: 'Secret title', dueDate: new Date(Date.UTC(2020, 0, 1)) });
  const returns = (name: string, value: unknown) => async () => {
    calls.push(name);
    return value;
  };
  const db = {
    user: {
      findMany: returns('user.findMany', TEAM),
      findUnique: returns('user.findUnique', opts.user === null ? null : { ...ann, ...opts.user }),
    },
    task: { findMany: returns('task.findMany', [t]) },
    notification: {
      findMany: returns('notification.findMany', [notif('n1', 'u1', t.id)]),
      updateMany: returns('notification.updateMany', { count: 1 }),
    },
  };
  const deps: RunDeps = {
    db: db as unknown as RunDeps['db'],
    send: async mail => {
      sent.push(mail);
      return opts.fail
        ? { ok: false, status: 422, error: 'Resend responded 422: invalid address u1@example.com for Ann Lee' }
        : { ok: true };
    },
  };
  return { deps, sent, calls };
}

test('dry run responses carry counts only and send or write nothing', async () => {
  for (const run of RUNNERS) {
    const { deps, sent, calls } = fakes();
    const summary = await run({ dryRun: true }, deps);
    assertPublic(summary);
    assert.equal(summary.dryRun, true);
    assert.ok(summary.recipients > 0);
    assert.equal(sent.length, 0);
    assert.ok(!calls.includes('notification.updateMany'));
  }
});

test('send failures give generic errors; the detail is only logged', async t => {
  const logged: string[] = [];
  t.mock.method(console, 'error', (line: string) => void logged.push(line));
  for (const run of RUNNERS) {
    const { deps } = fakes({ fail: true });
    const summary = await run({}, deps);
    assertPublic(summary);
    assert.equal(summary.ok, false);
    assert.ok(summary.failed > 0);
    assert.equal(summary.errors![0], 'send failed (status 422)');
  }
  assert.ok(logged.some(line => line.includes('u1@example.com')));
});

test('sample mode sends one [Sample] email to that user and reads only the user row', async () => {
  for (const run of RUNNERS) {
    const { deps, sent, calls } = fakes();
    const summary = await run({ sample: 'u1' }, deps);
    assertPublic(summary);
    assert.deepEqual(summary, { ok: true, recipients: 1, sent: 1, failed: 0, skipped: 0, sample: true });
    assert.deepEqual(sent.map(m => m.to), ['u1@example.com']);
    assert.ok(sent[0].subject.startsWith('[Sample] '));
    assert.deepEqual(calls, ['user.findUnique']);
  }
});

test('sample mode rejects unknown, disabled, email-less or empty usernames without sending', async () => {
  const cases: Array<[string, Partial<UserRecord> | null]> = [
    ['nobody', null],
    ['u1', { disabled: true }],
    ['u1', { email: null }],
    ['', {}],
  ];
  for (const run of RUNNERS) {
    for (const [sample, user] of cases) {
      const { deps, sent, calls } = fakes({ user });
      const summary = await run({ sample }, deps);
      assertPublic(summary);
      assert.equal(summary.ok, false);
      assert.deepEqual(summary.errors, ['sample user unavailable']);
      assert.equal(sent.length, 0);
      assert.ok(calls.every(c => c === 'user.findUnique'));
    }
  }
});

test('sample mode with dry run sends nothing', async () => {
  const { deps, sent } = fakes();
  const summary = await runDailyDigest({ sample: 'u1', dryRun: true }, deps);
  assert.equal(summary.sent, 0);
  assert.equal(sent.length, 0);
});
