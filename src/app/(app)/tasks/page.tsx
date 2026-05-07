'use client';

import { useFetch, apiCall } from '@/hooks/useFetch';
import { Task, User } from '@/types';
import { Plus, ListTodo, RefreshCw, X, Circle, Clock, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { format, isBefore } from 'date-fns';
import toast from 'react-hot-toast';

const STATUSES = ['Backlog', 'In Progress', 'Done'] as const;
type Status = typeof STATUSES[number];

const statusIcon: Record<Status, React.ReactNode> = {
  'Backlog':     <Circle className="w-4 h-4 text-surface-400" />,
  'In Progress': <Clock className="w-4 h-4 text-brand-500" />,
  'Done':        <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
};

const priorityColors: Record<string, string> = {
  URGENT: 'priority-urgent', HIGH: 'priority-high',
  MEDIUM: 'priority-medium', LOW: 'priority-low', NONE: 'priority-none',
};

export default function TasksPage() {
  const { data: tasks, loading, refetch } = useFetch<Task[]>('/api/tasks?standalone=true');
  const { data: users } = useFetch<User[]>('/api/users', { pollInterval: false });
  const [showNew, setShowNew] = useState(false);

  const activeUsers = (users || []).filter(u => !u.disabled);

  const tasksByStatus = STATUSES.reduce<Record<Status, Task[]>>((acc, s) => {
    acc[s] = (tasks || [])
      .filter(t => t.status === s && !t.deletedAt)
      .sort((a: Task, b: Task) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
    return acc;
  }, { Backlog: [], 'In Progress': [], Done: [] });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListTodo className="w-6 h-6 text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Tasks</h1>
            <p className="text-surface-500 dark:text-surface-400 text-sm">
              Team tasks not linked to any project
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} className="btn-ghost btn-sm">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setShowNew(true)} className="btn-primary btn-sm">
            <Plus className="w-4 h-4" /> Add Task
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4">
        {STATUSES.map(s => (
          <div key={s} className="card px-4 py-3 flex items-center gap-3 flex-1">
            {statusIcon[s]}
            <div>
              <p className="text-xl font-bold text-surface-900 dark:text-white">
                {tasksByStatus[s].length}
              </p>
              <p className="text-xs text-surface-500">{s}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Columns */}
      {loading ? (
        <div className="py-20 text-center text-surface-400">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STATUSES.map(status => (
            <StatusColumn
              key={status}
              status={status}
              tasks={tasksByStatus[status]}
              users={activeUsers}
              onRefetch={refetch}
            />
          ))}
        </div>
      )}

      {/* New Task Modal */}
      {showNew && (
        <NewTaskModal
          users={activeUsers}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); refetch(); }}
        />
      )}
    </div>
  );
}

// ================== STATUS COLUMN ==================
function StatusColumn({ status, tasks, users, onRefetch }: {
  status: Status;
  tasks: Task[];
  users: User[];
  onRefetch: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        {statusIcon[status]}
        <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300">{status}</h3>
        <span className="ml-auto text-xs text-surface-400 bg-surface-100 dark:bg-surface-800 px-2 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </div>

      <div className="space-y-2">
        {tasks.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-surface-200 dark:border-surface-800 py-8 text-center text-xs text-surface-400">
            No tasks
          </div>
        ) : (
          tasks.map(task =>
            editingId === task.id ? (
              <TaskEditCard
                key={task.id}
                task={task}
                users={users}
                onDone={() => { setEditingId(null); onRefetch(); }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={() => setEditingId(task.id)}
                onStatusChange={async (newStatus) => {
                  await apiCall(`/api/tasks/${task.id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ version: task.version, status: newStatus }),
                  });
                  onRefetch();
                }}
                onDelete={async () => {
                  await apiCall(`/api/tasks/${task.id}`, { method: 'DELETE' });
                  toast.success('Task deleted');
                  onRefetch();
                }}
              />
            )
          )
        )}
      </div>
    </div>
  );
}

// ================== TASK CARD ==================
function TaskCard({ task, onEdit, onStatusChange, onDelete }: {
  task: Task;
  onEdit: () => void;
  onStatusChange: (status: string) => void;
  onDelete: () => void;
}) {
  const isOverdue = task.dueDate && isBefore(new Date(task.dueDate), new Date()) && task.status !== 'Done';
  const currentIndex = STATUSES.indexOf(task.status as Status);
  const nextStatus = currentIndex < STATUSES.length - 1 ? STATUSES[currentIndex + 1] : null;
  const prevStatus = currentIndex > 0 ? STATUSES[currentIndex - 1] : null;

  const assignees = task.assignees && task.assignees.length > 0
    ? task.assignees
    : task.assignee ? [task.assignee] : [];

  return (
    <div className="card p-4 group space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p
          className={`text-sm font-medium leading-snug cursor-pointer hover:text-brand-600 dark:hover:text-brand-400 transition-colors ${
            task.status === 'Done' ? 'line-through text-surface-400' : 'text-surface-900 dark:text-white'
          }`}
          onClick={onEdit}
        >
          {task.title}
        </p>
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-surface-300 hover:text-red-500 flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {task.description && (
        <p className="text-xs text-surface-500 dark:text-surface-400 leading-relaxed line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Assignees */}
      {assignees.length > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="flex -space-x-1">
            {assignees.slice(0, 4).map((a: any) => (
              <div
                key={a.id}
                title={a.name}
                className="w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center ring-1 ring-white dark:ring-surface-900"
              >
                <span className="text-[10px] font-bold text-brand-700 dark:text-brand-300">
                  {a.name.charAt(0)}
                </span>
              </div>
            ))}
          </div>
          <span className="text-[10px] text-surface-500">
            {assignees.length === 1
              ? assignees[0].name
              : assignees.length <= 3
                ? assignees.map((a: any) => a.name).join(', ')
                : `${assignees[0].name} +${assignees.length - 1}`}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {task.priority !== 'NONE' && (
          <span className={`badge text-[10px] ${priorityColors[task.priority]}`}>{task.priority}</span>
        )}
        {task.dueDate && (
          <span className={`text-[10px] font-medium ${isOverdue ? 'text-red-500' : 'text-surface-400'}`}>
            {isOverdue ? 'Overdue · ' : ''}{format(new Date(task.dueDate), 'MMM d')}
          </span>
        )}
      </div>

      {/* Move buttons */}
      <div className="flex gap-1.5 pt-1 border-t border-surface-100 dark:border-surface-800">
        {prevStatus && (
          <button
            onClick={() => onStatusChange(prevStatus)}
            className="text-[10px] text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 px-2 py-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
          >
            ← {prevStatus}
          </button>
        )}
        {nextStatus && (
          <button
            onClick={() => onStatusChange(nextStatus)}
            className="text-[10px] text-brand-600 dark:text-brand-400 hover:text-brand-700 px-2 py-1 rounded hover:bg-brand-50 dark:hover:bg-brand-950/40 transition-colors ml-auto"
          >
            {nextStatus} →
          </button>
        )}
      </div>
    </div>
  );
}

// ================== ASSIGNEE PICKER (shared) ==================
function AssigneePicker({ users, selected, onChange }: {
  users: User[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);

  return (
    <div>
      <label className="label">Assignees</label>
      <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-surface-300 dark:border-surface-700 min-h-[40px]">
        {selected.length === 0 && (
          <span className="text-xs text-surface-400 py-0.5">No one assigned</span>
        )}
        {selected.map(id => {
          const u = users.find(u => u.id === id);
          return u ? (
            <span
              key={id}
              onClick={() => toggle(id)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-100 dark:bg-brand-900/40 text-brand-800 dark:text-brand-200 text-xs cursor-pointer hover:bg-brand-200 dark:hover:bg-brand-800/40"
            >
              {u.name} <X className="w-3 h-3" />
            </span>
          ) : null;
        })}
      </div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {users.filter(u => !selected.includes(u.id)).map(u => (
          <button
            key={u.id}
            type="button"
            onClick={() => toggle(u.id)}
            className="px-2 py-0.5 rounded text-xs bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors"
          >
            + {u.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ================== TASK EDIT CARD ==================
function TaskEditCard({ task, users, onDone, onCancel }: {
  task: Task;
  users: User[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [status, setStatus] = useState(task.status);
  const [priority, setPriority] = useState(task.priority);
  const [dueDate, setDueDate] = useState(task.dueDate ? task.dueDate.split('T')[0] : '');
  const [doneDate, setDoneDate] = useState((task as any).doneDate ? (task as any).doneDate.split('T')[0] : '');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    task.assigneeIds?.length ? task.assigneeIds : task.assigneeId ? [task.assigneeId] : []
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const { error } = await apiCall(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        version: task.version,
        title, description, status, priority,
        assigneeIds,
        dueDate: dueDate || null,
        doneDate: doneDate || null,
      }),
    });
    if (error) toast.error(error);
    else onDone();
    setSaving(false);
  };

  return (
    <div className="card p-4 space-y-3 ring-2 ring-brand-400 dark:ring-brand-600">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        className="input text-sm font-medium"
        autoFocus
      />
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        className="input text-xs min-h-[60px]"
        placeholder="Description (optional)"
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label text-[10px]">Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} className="select text-xs py-1.5">
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-[10px]">Priority</label>
          <select value={priority} onChange={e => setPriority(e.target.value as any)} className="select text-xs py-1.5">
            <option value="NONE">None</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
      </div>
      <AssigneePicker users={users} selected={assigneeIds} onChange={setAssigneeIds} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label text-[10px]">Due Date</label>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input text-xs py-1.5" />
        </div>
        <div>
          <label className="label text-[10px]">Done Date</label>
          <input type="date" value={doneDate} onChange={e => setDoneDate(e.target.value)} className="input text-xs py-1.5" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="btn-secondary btn-sm text-xs">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm text-xs">
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ================== NEW TASK MODAL ==================
function NewTaskModal({ users, onClose, onCreated }: {
  users: User[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Status>('Backlog');
  const [priority, setPriority] = useState('NONE');
  const [dueDate, setDueDate] = useState('');
  const [doneDate, setDoneDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    const { error } = await apiCall('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title, description, status, priority,
        assigneeIds,
        dueDate: dueDate || null,
        doneDate: doneDate || null,
      }),
    });
    if (error) toast.error(error);
    else { toast.success('Task created!'); onCreated(); }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-surface-900 dark:text-white">New Task</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800">
            <X className="w-4 h-4 text-surface-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="input"
              placeholder="What needs to be done?"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="input min-h-[72px]"
              placeholder="Optional details..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as Status)} className="select">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className="select">
                <option value="NONE">None</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>
          <AssigneePicker users={users} selected={assigneeIds} onChange={setAssigneeIds} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="label">Done Date</label>
              <input
                type="date"
                value={doneDate}
                onChange={e => setDoneDate(e.target.value)}
                className="input"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={creating} className="btn-primary">
              {creating ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
