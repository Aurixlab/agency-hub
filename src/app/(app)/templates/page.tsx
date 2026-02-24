'use client';

import { useFetch, apiCall } from '@/hooks/useFetch';
import { Template } from '@/types';
import { Code2, PenTool, Megaphone, Video, Rocket, LayoutTemplate, Plus, Check } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

const iconMap: Record<string, any> = {
  'code-2': Code2,
  'pen-tool': PenTool,
  'megaphone': Megaphone,
  'video': Video,
  'rocket': Rocket,
};

export default function TemplatesPage() {
  const { data: templates, loading } = useFetch<Template[]>('/api/templates');
  const router = useRouter();
  const [creating, setCreating] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');

  const handleUseTemplate = async (templateId: string) => {
    if (!projectName.trim()) {
      toast.error('Enter a project name');
      return;
    }

    const { data, error } = await apiCall<any>('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: projectName,
        clientName: clientName || null,
        templateId,
      }),
    });

    if (error) {
      toast.error(error);
    } else {
      toast.success('Project created from template!');
      router.push(`/projects/${data.id}`);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Templates</h1>
        <p className="text-surface-500 dark:text-surface-400 mt-1 text-sm">
          Start a new project with a pre-built workflow
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-surface-400">Loading templates...</div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {templates?.map(template => {
            const Icon = iconMap[template.icon] || LayoutTemplate;
            const config = template.seedConfig as any;
            const isExpanded = creating === template.id;

            return (
              <div
                key={template.id}
                className="card overflow-hidden group"
              >
                {/* Header with color accent */}
                <div
                  className="h-2"
                  style={{ backgroundColor: template.color }}
                />
                <div className="p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${template.color}15` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: template.color }} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-surface-900 dark:text-white">
                        {template.name}
                      </h3>
                      <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5 line-clamp-2">
                        {template.description}
                      </p>
                    </div>
                  </div>

                  {/* Workflow preview */}
                  <div className="mb-4">
                    <p className="text-[10px] uppercase tracking-wider text-surface-400 mb-1.5 font-medium">Workflow</p>
                    <div className="flex flex-wrap gap-1">
                      {config.statuses?.map((s: string) => (
                        <span
                          key={s}
                          className="px-2 py-0.5 rounded text-[10px] font-medium bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-[10px] uppercase tracking-wider text-surface-400 mb-1.5 font-medium">Tags</p>
                    <div className="flex flex-wrap gap-1">
                      {config.tags?.slice(0, 6).map((t: string) => (
                        <span
                          key={t}
                          className="px-2 py-0.5 rounded text-[10px] bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300"
                        >
                          {t}
                        </span>
                      ))}
                      {config.tags?.length > 6 && (
                        <span className="text-[10px] text-surface-400 px-1">+{config.tags.length - 6} more</span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-surface-500 mb-4">
                    {config.sampleTasks?.length || 0} sample tasks included
                  </p>

                  {/* Use template */}
                  {isExpanded ? (
                    <div className="space-y-3 animate-slide-up">
                      <input
                        value={projectName}
                        onChange={e => setProjectName(e.target.value)}
                        className="input"
                        placeholder="Project name *"
                        autoFocus
                      />
                      <input
                        value={clientName}
                        onChange={e => setClientName(e.target.value)}
                        className="input"
                        placeholder="Client name (optional)"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => setCreating(null)} className="btn-secondary btn-sm flex-1">
                          Cancel
                        </button>
                        <button
                          onClick={() => handleUseTemplate(template.id)}
                          className="btn-primary btn-sm flex-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Create
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setCreating(template.id); setProjectName(''); setClientName(''); }}
                      className="btn-primary btn-sm w-full"
                    >
                      <Plus className="w-4 h-4" />
                      Use Template
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
