'use client';

import { useFetch, apiCall } from '@/hooks/useFetch';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GitBranch, Plus, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export default function PipelinePage() {
  const { data: pipelines, loading, refetch } = useFetch<any[]>('/api/pipelines');
  const router = useRouter();
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    const { data, error } = await apiCall('/api/pipelines', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (error) { toast.error(error); setCreating(false); return; }
    toast.success('Pipeline created');
    setShowNew(false);
    setName('');
    setCreating(false);
    router.push(`/pipeline/${(data as any).id}`);
  };

  const handleDelete = async (id: string, pipelineName: string) => {
    if (!confirm(`Delete "${pipelineName}"? This cannot be undone.`)) return;
    const { error } = await apiCall(`/api/pipelines/${id}`, { method: 'DELETE' });
    if (error) toast.error(error);
    else { toast.success('Pipeline deleted'); refetch(); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranch className="w-6 h-6 text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Pipelines</h1>
            <p className="text-surface-500 dark:text-surface-400 text-sm">Visual workflow flowcharts</p>
          </div>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary btn-sm">
          <Plus className="w-4 h-4" /> New Pipeline
        </button>
      </div>

      {loading ? (
        <div className="py-20 text-center text-surface-400">Loading...</div>
      ) : pipelines?.length === 0 ? (
        <div className="py-20 text-center">
          <GitBranch className="w-12 h-12 mx-auto mb-4 text-surface-300 dark:text-surface-700" />
          <p className="text-surface-500 dark:text-surface-400 mb-4">No pipelines yet</p>
          <button onClick={() => setShowNew(true)} className="btn-primary btn-sm">
            <Plus className="w-4 h-4" /> Create your first pipeline
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pipelines?.map(p => (
            <div
              key={p.id}
              onClick={() => router.push(`/pipeline/${p.id}`)}
              className="card p-5 cursor-pointer hover:border-brand-300 dark:hover:border-brand-700 transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-brand-100 dark:bg-brand-900/40 flex items-center justify-center flex-shrink-0">
                    <GitBranch className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-surface-900 dark:text-white truncate">{p.name}</p>
                    <p className="text-xs text-surface-500 mt-0.5">by {p.creator?.name}</p>
                  </div>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(p.id, p.name); }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 text-surface-400 hover:text-red-600 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-surface-500">
                <span>{p._count?.nodes ?? 0} nodes</span>
                <span>{format(new Date(p.createdAt), 'MMM d, yyyy')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
          <div className="card p-6 w-full max-w-sm animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-surface-900 dark:text-white">New Pipeline</h2>
              <button onClick={() => setShowNew(false)} className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800">
                <X className="w-4 h-4 text-surface-400" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="label">Pipeline Name *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="input"
                  placeholder="e.g. Content Workflow"
                  autoFocus
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={creating} className="btn-primary">
                  {creating ? 'Creating...' : 'Create & Open'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
