import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dueBucket,
  dueLabel,
  headlineFor,
  isTaskDone,
  summarizeFocus,
  uniqueTasks,
  type FocusTask,
} from './dashboard-focus';

// Tuesday 24 Nov 2026, 10:00 local. Monday of that week is 23 Nov.
const NOW = new Date(2026, 10, 24, 10, 0);

// Due dates are stored as UTC midnight of the picked day, whatever the viewer's timezone.
const due = (offsetDays: number) => new Date(Date.UTC(2026, 10, 24 + offsetDays)).toISOString();
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h, 0).toISOString();

const project = { id: 'p1', name: 'Project', statuses: ['To Do', 'In Progress', 'Shipped'] };

let seq = 0;
function task(overrides: Partial<FocusTask> = {}): FocusTask {
  seq += 1;
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    status: 'To Do',
    priority: 'MEDIUM',
    dueDate: null,
    doneDate: null,
    deletedAt: null,
    project: null,
    ...overrides,
  };
}

test('due string fixture is UTC midnight', () => {
  assert.equal(due(0), '2026-11-24T00:00:00.000Z');
});

test('dueBucket and dueLabel: today', () => {
  assert.equal(dueBucket(due(0), NOW), 'today');
  assert.equal(dueLabel(due(0), NOW), 'Due today');
});

test('dueBucket and dueLabel: tomorrow', () => {
  assert.equal(dueBucket(due(1), NOW), 'week');
  assert.equal(dueLabel(due(1), NOW), 'Due tomorrow');
});

test('dueBucket and dueLabel: yesterday', () => {
  assert.equal(dueBucket(due(-1), NOW), 'overdue');
  assert.equal(dueLabel(due(-1), NOW), 'Due yesterday');
});

test('dueBucket and dueLabel: 3 days overdue', () => {
  assert.equal(dueBucket(due(-3), NOW), 'overdue');
  assert.equal(dueLabel(due(-3), NOW), '3 days overdue');
});

test('dueBucket: 7 days out is still this week, 8 days out is later', () => {
  assert.equal(dueBucket(due(7), NOW), 'week');
  assert.equal(dueBucket(due(8), NOW), 'later');
});

test('dueBucket and dueLabel: no due date', () => {
  assert.equal(dueBucket(null, NOW), 'none');
  assert.equal(dueLabel(null, NOW), 'No due date');
});

test('isTaskDone: last project status is done', () => {
  assert.equal(isTaskDone(task({ project, status: 'Shipped' })), true);
  assert.equal(isTaskDone(task({ project, status: 'In Progress' })), false);
  // "Done" means nothing special when the project defines its own final column.
  assert.equal(isTaskDone(task({ project, status: 'Done' })), false);
});

test('isTaskDone: task without a project is done only when status is Done', () => {
  assert.equal(isTaskDone(task({ status: 'Done' })), true);
  assert.equal(isTaskDone(task({ status: 'To Do' })), false);
});

test('summarizeFocus: overdue is ordered by priority before age', () => {
  const lowOld = task({ title: 'low old', priority: 'LOW', dueDate: due(-10) });
  const urgentNew = task({ title: 'urgent new', priority: 'URGENT', dueDate: due(-1) });
  const s = summarizeFocus([lowOld, urgentNew], NOW);
  assert.deepEqual(s.overdue.map(t => t.title), ['urgent new', 'low old']);
  assert.equal(s.nextUp?.id, urgentNew.id);
});

test('summarizeFocus: nextUp falls through overdue, today, week, then null', () => {
  const overdue = task({ dueDate: due(-2) });
  const today = task({ dueDate: due(0) });
  const week = task({ dueDate: due(3) });
  const later = task({ dueDate: due(20) });

  assert.equal(summarizeFocus([week, today, overdue, later], NOW).nextUp?.id, overdue.id);
  assert.equal(summarizeFocus([week, today, later], NOW).nextUp?.id, today.id);
  assert.equal(summarizeFocus([week, later], NOW).nextUp?.id, week.id);
  assert.equal(summarizeFocus([later], NOW).nextUp, null);
  assert.equal(summarizeFocus([], NOW).nextUp, null);
});

test('summarizeFocus: later holds tasks beyond 7 days and tasks with no due date', () => {
  const far = task({ dueDate: due(8) });
  const undated = task({ dueDate: null });
  const soon = task({ dueDate: due(2) });
  const s = summarizeFocus([far, undated, soon], NOW);
  assert.deepEqual(s.later.map(t => t.id).sort(), [far.id, undated.id].sort());
  assert.deepEqual(s.week.map(t => t.id), [soon.id]);
  assert.equal(s.activeCount, 3);
});

test('summarizeFocus: doneThisWeek counts done tasks finished on or after Monday', () => {
  const onMonday = task({ status: 'Done', doneDate: local(2026, 10, 23, 0) });
  const today = task({ status: 'Done', doneDate: local(2026, 10, 24, 9) });
  const lastWeek = task({ status: 'Done', doneDate: local(2026, 10, 22, 23) });
  // No doneDate: falls back to updatedAt.
  const viaUpdated = task({ status: 'Done', updatedAt: local(2026, 10, 23, 15) });
  const staleUpdated = task({ status: 'Done', updatedAt: local(2026, 10, 1, 15) });
  const open = task({ doneDate: local(2026, 10, 24, 9) });

  const s = summarizeFocus([onMonday, today, lastWeek, viaUpdated, staleUpdated, open], NOW);
  assert.equal(s.doneThisWeek, 3);
  assert.equal(s.finishedThisMonth, 5);
});

test('summarizeFocus: weekTotal = doneThisWeek + overdue + today + week', () => {
  const tasks = [
    task({ status: 'Done', doneDate: local(2026, 10, 24, 9) }),
    task({ status: 'Done', doneDate: local(2026, 10, 23, 9) }),
    task({ dueDate: due(-1) }),
    task({ dueDate: due(0) }),
    task({ dueDate: due(0) }),
    task({ dueDate: due(5) }),
    task({ dueDate: due(30) }),
    task({ dueDate: null }),
  ];
  const s = summarizeFocus(tasks, NOW);
  assert.equal(s.doneThisWeek, 2);
  assert.equal(s.overdue.length, 1);
  assert.equal(s.today.length, 2);
  assert.equal(s.week.length, 1);
  assert.equal(s.focusCount, 4);
  assert.equal(s.weekTotal, 6);
  assert.equal(s.activeCount, 6);
});

test('summarizeFocus: recentlyFinished is capped at 4, newest first', () => {
  const finished = [1, 2, 3, 4, 5, 6].map(day =>
    task({ title: `done ${day}`, status: 'Done', doneDate: local(2026, 9, day) }),
  );
  const s = summarizeFocus(finished, NOW);
  assert.equal(s.recentlyFinished.length, 4);
  assert.deepEqual(s.recentlyFinished.map(t => t.title), ['done 6', 'done 5', 'done 4', 'done 3']);
});

test('uniqueTasks drops duplicate ids and deleted tasks', () => {
  const a = task({ id: 'a' });
  const aDup = task({ id: 'a', title: 'dup' });
  const b = task({ id: 'b' });
  const gone = task({ id: 'c', deletedAt: '2026-11-01T00:00:00.000Z' });
  const out = uniqueTasks([a, b], [aDup, gone], null, undefined);
  assert.deepEqual(out.map(t => t.id), ['a', 'b']);
  assert.equal(out[0].title, a.title);
});

test('headlineFor: no active tasks', () => {
  const s = summarizeFocus([task({ status: 'Done', doneDate: local(2026, 10, 24) })], NOW);
  assert.equal(headlineFor(s), "You're all caught up.");
  assert.equal(headlineFor(summarizeFocus([], NOW)), "You're all caught up.");
});

test('headlineFor: only later tasks', () => {
  const s = summarizeFocus([task({ dueDate: due(30) }), task({ dueDate: null })], NOW);
  assert.ok(headlineFor(s).startsWith('Nothing due this week.'));
  assert.ok(headlineFor(s).includes('2 tasks are further out'));
});

test('headlineFor: mixed today and overdue', () => {
  const s = summarizeFocus(
    [task({ dueDate: due(0) }), task({ dueDate: due(0) }), task({ dueDate: due(-2) })],
    NOW,
  );
  const line = headlineFor(s);
  assert.ok(line.includes('3 tasks on your plate this week'));
  assert.ok(line.includes('2 due today'));
  assert.ok(line.includes('1 to catch up on'));
});
