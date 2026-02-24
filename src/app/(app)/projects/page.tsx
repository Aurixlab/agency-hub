'use client';

import { useFetch, apiCall } from '@/hooks/useFetch';
import { Project, Template } from '@/types';
import { Plus, FolderKanban, RefreshCw, Trash2, RotateCcw, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export default function ProjectsPage() {
  const { data: projects, loading, refetch } = useFetch<Project[]>('/api/projects');
  const { data: templates } = useFetch<Template[]>('/api/templates');
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newClient, setNewClient] = useState('');
  const [newTemplate, setNewTemplate] = useState('');
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  const filteredProjects = projects?.filter(p =>
    !p.deletedAt &&
    (p.name.toLowerCase().includes(search.toLowerCase()) ||
     p.clientName?.toLowerCase().includes(search.toLowerCase()))
  ) || [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);

    const { data, error } = await apiCall('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: newName,
        clientName: newClient || null,
        templateId: newTemplate || null,
      }),
    });

    if (error) {
      toast.error(error);
    } else {
      toast.success('Project created!');
      setShowNew(false);
      setNewName('');
      setNewClient('');
      setNewTemplate('');
      refetch();
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Move this project to trash?')) return;
    const { error } = await apiCall(`/api/projects/${id}`, { method: 'DELETE' });
    if (error) toast.error(error);
    else { toast.success('Project moved to trash'); refetch(); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Projects</h1>
          <p className="text-surface-500 dark:text-surface-400 mt-1 text-sm">
            {filteredProjects.length} active project{filteredProjects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn-ghost btn-sm">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setShowNew(true)} className="btn-primary btn-sm">
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
        <input
          type="text"
          placeholder="Search projects..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input pl-10"
        />
      </div>

      {/* Create project modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
          <div className="card p-6 w-full max-w-lg animate-slide-up" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-surface-900 dark:text-white mb-4">Create Project</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="label">Project Name *</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="input"
                  placeholder="e.g. Website Redesign"
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="label">Client Name</label>
                <input
                  value={newClient}
                  onChange={e => setNewClient(e.target.value)}
                  className="input"
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="label">Template</label>
                <select
                  value={newTemplate}
                  onChange={e => setNewTemplate(e.target.value)}
                  className="select"
                >
                  <option value="">No template (blank project)</option>
                  {templates?.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <p className="text-xs text-surface-500 mt-1">
                  Templates pre-fill statuses, tags, and sample tasks
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={creating} className="btn-primary">
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Projects grid */}
      {loading ? (
        <div className="py-12 text-center text-surface-400">Loading projects...</div>
      ) : filteredProjects.length === 0 ? (
        <div className="card py-16 text-center">
          <FolderKanban className="w-12 h-12 mx-auto mb-3 text-surface-300 dark:text-surface-600" />
          <p className="text-surface-500 dark:text-surface-400">
            {search ? 'No projects match your search' : 'No projects yet'}
          </p>
          {!search && (
            <button onClick={() => setShowNew(true)} className="btn-primary btn-sm mt-4">
              <Plus className="w-4 h-4" />
              Create your first project
            </button>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map(project => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="card-hover p-5 group"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-surface-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {project.name}
                  </h3>
                  {project.clientName && (
                    <p className="text-sm text-surface-500 mt-0.5 truncate">{project.clientName}</p>
                  )}
                </div>
                <button
                  onClick={e => { e.preventDefault(); e.stopPropagation(); handleDelete(project.id); }}
                  className="p-1.5 rounded-lg text-surface-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-3 mt-4 text-xs text-surface-500">
                <span>{project._count?.tasks || 0} tasks</span>
                <span>·</span>
                <span>Updated {format(new Date(project.updatedAt), 'MMM d')}</span>
              </div>
              {project.statuses && (
                <div className="flex gap-1 mt-3">
                  {(project.statuses as string[]).slice(0, 5).map(s => (
                    <span key={s} className="px-2 py-0.5 rounded text-[10px] bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400">
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
