'use client';

import { useFetch, apiCall } from '@/hooks/useFetch';
import { Inbox, FileText, Trash2, Send, X, Loader2, Calendar, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';

const PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];
const priorityColors: Record<string, string> = {
  URGENT: 'priority-urgent',
  HIGH: 'priority-high',
  MEDIUM: 'priority-medium',
  LOW: 'priority-low',
  NONE: 'priority-none',
};

interface DraftAssignee { id: string; name: string; username: string; avatarUrl?: string | null; }
interface Draft {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  suggestedAssigneeIds: string[];
  suggestedDueDate: string | null;
  suggestedAssignees: DraftAssignee[];
}
interface TranscriptImport {
  id: string;
  fileName: string;
  createdAt: string;
  uploader: { id: string; name: string; username: string };
  drafts: Draft[];
}

export default function InboxPage() {
  const { data: imports, loading, refetch } = useFetch<TranscriptImport[]>('/api/transcripts');
  const { data: users } = useFetch<any[]>('/api/users', { pollInterval: false });
  const { data: projects } = useFetch<any[]>('/api/projects', { pollInterval: false });
  const [publishing, setPublishing] = useState<Draft | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this draft task?')) return;
    const { error } = await apiCall(`/api/drafts/${id}`, { method: 'DELETE' });
    if (error) toast.error(error);
    else { toast.success('Draft deleted'); refetch(); }
  };

  const totalDrafts = imports?.reduce((sum, imp) => sum + imp.drafts.length, 0) ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Inbox className="w-6 h-6 text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Task Inbox</h1>
            <p className="text-surface-500 dark:text-surface-400 text-sm">
              {totalDrafts} draft task{totalDrafts === 1 ? '' : 's'} waiting for review
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-surface-400">Loading…</div>
      ) : !imports || imports.length === 0 ? (
        <div className="card p-12 text-center">
          <Inbox className="w-10 h-10 mx-auto mb-3 text-surface-300" />
          <p className="text-surface-600 dark:text-surface-300 font-medium">No draft tasks</p>
          <p className="text-surface-400 text-sm mt-1">
            Upload a meeting transcript from the{' '}
            <Link href="/dashboard" className="text-brand-600 hover:underline">dashboard</Link>{' '}
            to generate draft tasks.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {imports.map(imp => (
            <div key={imp.id} className="card p-0 overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-surface-200 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-800/30">
                <FileText className="w-4 h-4 text-surface-400 flex-shrink-0" />
                <span className="text-sm font-medium text-surface-900 dark:text-white truncate">{imp.fileName}</span>
                <span className="text-xs text-surface-400 ml-auto flex-shrink-0">
                  {imp.uploader?.name} · {format(new Date(imp.createdAt), 'MMM d, h:mm a')}
                </span>
              </div>
              <div className="divide-y divide-surface-100 dark:divide-surface-800">
                {imp.drafts.map(draft => (
                  <div key={draft.id} className="px-5 py-4 flex items-start gap-4">
                    <span className={`badge ${priorityColors[draft.priority]} mt-0.5 flex-shrink-0`}>
                      {draft.priority === 'NONE' ? '—' : draft.priority}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-surface-900 dark:text-white">{draft.title}</p>
                      {draft.description && (
                        <p className="text-xs text-surface-500 dark:text-surface-400 mt-1 leading-relaxed">{draft.description}</p>
                      )}
                      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2">
                        {draft.suggestedAssignees.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <div className="flex -space-x-1">
                              {draft.suggestedAssignees.map(a => (
                                <div key={a.id} className="w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center ring-1 ring-white dark:ring-surface-900 overflow-hidden" title={a.name}>
                                  {a.avatarUrl
                                    ? <img src={a.avatarUrl} alt={a.name} className="w-full h-full object-cover" />
                                    : <span className="text-[10px] font-bold text-brand-700 dark:text-brand-300">{a.name.charAt(0)}</span>}
                                </div>
                              ))}
                            </div>
                            <span className="text-xs text-surface-500">{draft.suggestedAssignees.map(a => a.name).join(', ')}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-surface-400">No suggested assignee</span>
                        )}
                        {draft.suggestedDueDate && (
                          <span className="text-xs text-surface-500 flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {format(new Date(draft.suggestedDueDate), 'MMM d, yyyy')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => setPublishing(draft)} className="btn-primary btn-sm" title="Publish to a project">
                        <Send className="w-3.5 h-3.5" /> Publish
                      </button>
                      <button onClick={() => handleDelete(draft.id)} className="btn-ghost btn-sm" title="Delete draft">
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {publishing && (
        <PublishModal
          draft={publishing}
          users={(users || []).filter(u => !u.disabled)}
          projects={projects || []}
          onClose={() => setPublishing(null)}
          onPublished={() => { setPublishing(null); refetch(); }}
        />
      )}
    </div>
  );
}

// ==================== PUBLISH MODAL ====================
function PublishModal({ draft, users, projects, onClose, onPublished }: {
  draft: Draft;
  users: any[];
  projects: any[];
  onClose: () => void;
  onPublished: () => void;
}) {
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState(draft.title);
  const [description, setDescription] = useState(draft.description || '');
  const [priority, setPriority] = useState(draft.priority);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(draft.suggestedAssigneeIds || []);
  const [dueDate, setDueDate] = useState(draft.suggestedDueDate ? draft.suggestedDueDate.slice(0, 10) : '');
  const [saving, setSaving] = useState(false);
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const selectedProject = projects.find(p => p.id === projectId);
  const firstStatus = (() => {
    const s = selectedProject?.statuses;
    return Array.isArray(s) && s.length > 0 ? s[0] : 'Backlog';
  })();

  const toggleAssignee = (id: string) => {
    setAssigneeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handlePublish = async () => {
    if (!projectId) { toast.error('Choose a project'); return; }
    if (!title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    const { error } = await apiCall(`/api/drafts/${draft.id}/publish`, {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        assigneeIds,
        dueDate: dueDate || null,
      }),
    });
    if (error) toast.error(error);
    else { toast.success('Task published'); onPublished(); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-surface-900 dark:text-white">Publish task</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800">
            <X className="w-4 h-4 text-surface-500" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Project *</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className="select">
              <option value="">Select a project…</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {selectedProject && (
              <p className="text-xs text-surface-500 mt-1">
                Lands in: <span className="font-medium text-surface-700 dark:text-surface-300">{firstStatus}</span>
              </p>
            )}
          </div>

          <div>
            <label className="label">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input" />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} className="input resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} className="select">
                {PRIORITIES.map(p => <option key={p} value={p}>{p === 'NONE' ? 'None' : p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Due date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input" />
            </div>
          </div>

          <div className="relative">
            <label className="label">Assignees</label>
            <button
              type="button"
              onClick={() => setAssigneeOpen(o => !o)}
              className="input flex items-center justify-between text-left"
            >
              <span className="truncate">
                {assigneeIds.length === 0
                  ? 'Select people…'
                  : users.filter(u => assigneeIds.includes(u.id)).map(u => u.name).join(', ')}
              </span>
              <ChevronDown className="w-4 h-4 text-surface-400 flex-shrink-0" />
            </button>
            {assigneeOpen && (
              <div className="absolute z-10 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 shadow-elevated">
                {users.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleAssignee(u.id)}
                    className="flex items-center gap-2 w-full px-3 py-2 hover:bg-surface-50 dark:hover:bg-surface-800 text-left"
                  >
                    <input type="checkbox" readOnly checked={assigneeIds.includes(u.id)} className="pointer-events-none" />
                    <div className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {u.avatarUrl
                        ? <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                        : <span className="text-[10px] font-bold text-brand-700 dark:text-brand-300">{u.name.charAt(0)}</span>}
                    </div>
                    <span className="text-sm text-surface-700 dark:text-surface-300">{u.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            <button onClick={handlePublish} disabled={saving} className="btn-primary">
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Publishing…</> : <><Send className="w-3.5 h-3.5" /> Publish</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
