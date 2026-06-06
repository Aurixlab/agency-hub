'use client';

import { useFetch, apiCall } from '@/hooks/useFetch';
import { Task } from '@/types';
import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { X, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

const priorityColors: Record<string, string> = {
  URGENT: 'priority-urgent', HIGH: 'priority-high', MEDIUM: 'priority-medium', LOW: 'priority-low', NONE: 'priority-none',
};

interface Props {
  taskId: string;
  users?: any[];
  onClose: () => void;
  onUpdated: () => void;
}

export default function TaskDetailModal({ taskId, users, onClose, onUpdated }: Props) {
  const { data: task, loading, refetch } = useFetch<Task>(`/api/tasks/${taskId}`, { pollInterval: false });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [doneDate, setDoneDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState('');
  const [conflict, setConflict] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const toggleAssignee = (id: string) => {
    setAssigneeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setStatus(task.status);
      setPriority(task.priority);
      setAssigneeIds(task.assigneeIds && Array.isArray(task.assigneeIds) && task.assigneeIds.length > 0
        ? task.assigneeIds
        : (task.assigneeId ? [task.assigneeId] : []));
      setDueDate(task.dueDate ? task.dueDate.split('T')[0] : '');
      setDoneDate((task as any).doneDate ? (task as any).doneDate.split('T')[0] : '');
    }
  }, [task]);

  const statuses: string[] = (task as any)?.project?.statuses || [];

  const handleSave = async () => {
    setSaving(true);
    setConflict(false);
    const { error, status: httpStatus } = await apiCall(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        version: task?.version,
        title, description, status, priority, assigneeIds,
        dueDate: dueDate || null,
        doneDate: doneDate || null,
      }),
    });
    if (httpStatus === 409) {
      setConflict(true);
      toast.error('This task was updated by someone else. Reload before saving.');
    } else if (error) {
      toast.error(error);
    } else {
      toast.success('Task updated');
      setEditing(false);
      refetch();
      onUpdated();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('Move this task to trash?')) return;
    await apiCall(`/api/tasks/${taskId}`, { method: 'DELETE' });
    toast.success('Task deleted');
    onClose();
    onUpdated();
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    const { error } = await apiCall('/api/comments', {
      method: 'POST',
      body: JSON.stringify({ taskId, body: comment }),
    });
    if (error) toast.error(error);
    else { setComment(''); refetch(); }
  };

  if (loading || !task) {
    return (
      <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center" onClick={onClose}>
        <div className="card p-8 animate-fade-in">Loading...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="card w-full sm:max-w-2xl max-h-[95vh] overflow-y-auto animate-slide-up sm:rounded-xl rounded-t-2xl rounded-b-none sm:rounded-b-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 space-y-5">
          {/* Conflict Banner */}
          {conflict && (
            <div className="px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm">
              <p className="font-medium">This task was updated by someone else.</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => { setConflict(false); refetch(); toast.success('Data reloaded'); }} className="btn-sm bg-amber-600 text-white hover:bg-amber-700 rounded-md px-3 py-1 text-xs">
                  Reload data
                </button>
                <button
                  onClick={() => { navigator.clipboard.writeText(`${title}\n${description}`); toast.success('Copied!'); }}
                  className="btn-sm border border-amber-300 dark:border-amber-700 rounded-md px-3 py-1 text-xs"
                >
                  Copy my edits
                </button>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="flex items-start justify-between">
            {editing ? (
              <input value={title} onChange={e => setTitle(e.target.value)} className="input text-lg font-bold flex-1 mr-4" />
            ) : (
              <div className="flex-1">
                <h2 className="text-lg font-bold text-surface-900 dark:text-white">{task.title}</h2>
                {(task as any).project?.name && (
                  <p className="text-xs text-surface-500 mt-0.5">{(task as any).project.name}</p>
                )}
              </div>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Status</label>
              {editing ? (
                <select value={status} onChange={e => setStatus(e.target.value)} className="select">
                  {statuses.length > 0
                    ? statuses.map((s: string) => <option key={s}>{s}</option>)
                    : <option>{status}</option>
                  }
                </select>
              ) : (
                <span className="badge bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300">{task.status}</span>
              )}
            </div>
            <div>
              <label className="label">Priority</label>
              {editing ? (
                <select value={priority} onChange={e => setPriority(e.target.value)} className="select">
                  <option value="NONE">None</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              ) : (
                <span className={`badge ${priorityColors[task.priority]}`}>{task.priority}</span>
              )}
            </div>
            <div>
              <label className="label">Assignees</label>
              {editing ? (
                <div>
                  <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-surface-300 dark:border-surface-700 min-h-[36px]">
                    {assigneeIds.length === 0 && <span className="text-xs text-surface-400">No one assigned</span>}
                    {assigneeIds.map(id => {
                      const u = users?.find((u: any) => u.id === id);
                      return u ? (
                        <span key={id} onClick={() => toggleAssignee(id)} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-100 dark:bg-brand-900/40 text-brand-800 dark:text-brand-200 text-xs cursor-pointer hover:bg-brand-200">
                          {u.name} <X className="w-3 h-3" />
                        </span>
                      ) : null;
                    })}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {users?.filter((u: any) => !u.disabled && !assigneeIds.includes(u.id)).map((u: any) => (
                      <button key={u.id} type="button" onClick={() => toggleAssignee(u.id)} className="px-2 py-0.5 rounded text-xs bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-700">
                        + {u.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(task.assignees && task.assignees.length > 0)
                    ? task.assignees.map((a: any) => (
                        <span key={a.id} className="badge bg-brand-100 dark:bg-brand-900/40 text-brand-800 dark:text-brand-200">{a.name}</span>
                      ))
                    : task.assignee
                      ? <span className="text-sm text-surface-700 dark:text-surface-300">{task.assignee.name}</span>
                      : <span className="text-sm text-surface-500">Unassigned</span>
                  }
                </div>
              )}
            </div>
            <div>
              <label className="label">Due Date</label>
              {editing ? (
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input" />
              ) : (
                <p className="text-sm text-surface-700 dark:text-surface-300">
                  {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : 'No due date'}
                </p>
              )}
            </div>
          </div>

          {/* Done Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Done Date</label>
              {editing ? (
                <input type="date" value={doneDate} onChange={e => setDoneDate(e.target.value)} className="input" />
              ) : (
                <p className="text-sm text-surface-700 dark:text-surface-300">
                  {(task as any).doneDate ? format(new Date((task as any).doneDate), 'MMM d, yyyy') : 'Not marked done'}
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label">Description</label>
            {editing ? (
              <textarea value={description} onChange={e => setDescription(e.target.value)} className="input min-h-[100px]" />
            ) : (
              <p className="text-sm text-surface-600 dark:text-surface-400 whitespace-pre-wrap">
                {task.description || 'No description'}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-surface-200 dark:border-surface-800">
            {editing ? (
              <>
                <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => { setEditing(false); setConflict(false); }} className="btn-secondary btn-sm">Cancel</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="btn-primary btn-sm">Edit</button>
                <button onClick={handleDelete} className="btn-danger btn-sm">Delete</button>
                <button
                  onClick={async () => {
                    setSummarizing(true);
                    setAiSummary(null);
                    const res = await fetch('/api/ai/summarize', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ taskId }),
                    });
                    const data = await res.json();
                    if (data.summary) setAiSummary(data.summary);
                    else toast.error(data.error || 'Failed to summarize');
                    setSummarizing(false);
                  }}
                  disabled={summarizing}
                  className="btn-ghost btn-sm ml-auto"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {summarizing ? 'Summarizing...' : 'AI Summary'}
                </button>
              </>
            )}
          </div>

          {/* AI Summary */}
          {aiSummary && (
            <div className="px-4 py-3 rounded-lg bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-800 text-sm text-brand-900 dark:text-brand-100">
              <p className="text-xs font-semibold text-brand-600 dark:text-brand-400 mb-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> AI Summary
              </p>
              {aiSummary}
            </div>
          )}

          {/* Comments */}
          <div className="pt-4 border-t border-surface-200 dark:border-surface-800">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white mb-3">
              Comments ({task.comments?.length || 0})
            </h3>
            <form onSubmit={handleComment} className="flex flex-col sm:flex-row gap-2 mb-4">
              <input
                value={comment}
                onChange={e => setComment(e.target.value)}
                className="input flex-1"
                placeholder="Add a comment..."
              />
              <button type="submit" className="btn-primary btn-sm">Post</button>
            </form>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {task.comments?.map((c: any) => (
                <div key={c.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-surface-900 dark:text-white">{c.author?.name}</span>
                    <span className="text-xs text-surface-400">{format(new Date(c.createdAt), 'MMM d, h:mm a')}</span>
                  </div>
                  <p className="text-surface-600 dark:text-surface-400 mt-0.5">{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
