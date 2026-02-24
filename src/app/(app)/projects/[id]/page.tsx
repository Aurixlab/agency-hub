'use client';

import { useFetch, apiCall } from '@/hooks/useFetch';
import { Task } from '@/types';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths } from 'date-fns';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Plus, Table, Columns3, Calendar, RefreshCw, ArrowLeft, Search, X, ChevronLeft, ChevronRight, MessageSquare, GripVertical } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

type ViewMode = 'table' | 'kanban' | 'calendar';

const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3, NONE: 4 };
const priorityColors: Record<string, string> = {
  URGENT: 'priority-urgent', HIGH: 'priority-high', MEDIUM: 'priority-medium', LOW: 'priority-low', NONE: 'priority-none',
};

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: project, loading, refetch } = useFetch<any>(`/api/projects/${id}`);
  const { data: users } = useFetch<any[]>('/api/users', { pollInterval: false });
  const [view, setView] = useState<ViewMode>('kanban');
  const [showNewTask, setShowNewTask] = useState(false);
  const [showTaskDetail, setShowTaskDetail] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  const tasks: Task[] = project?.tasks || [];
  const statuses: string[] = project?.statuses || [];

  const filteredTasks = tasks.filter(t => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterAssignee && t.assigneeId !== filterAssignee) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    return true;
  });

  if (loading) {
    return <div className="py-20 text-center text-surface-400 animate-fade-in">Loading project...</div>;
  }

  if (!project) {
    return (
      <div className="py-20 text-center animate-fade-in">
        <p className="text-surface-500 mb-4">Project not found</p>
        <Link href="/projects" className="btn-primary btn-sm">Back to Projects</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/projects" className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-500">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-surface-900 dark:text-white">{project.name}</h1>
            {project.clientName && <p className="text-sm text-surface-500">{project.clientName}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn-ghost btn-sm" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setShowNewTask(true)} className="btn-primary btn-sm">
            <Plus className="w-4 h-4" /> Add Task
          </button>
        </div>
      </div>

      {/* View Toggle + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-surface-100 dark:bg-surface-800/50">
          {[
            { key: 'kanban' as ViewMode, icon: Columns3, label: 'Board' },
            { key: 'table' as ViewMode, icon: Table, label: 'Table' },
            { key: 'calendar' as ViewMode, icon: Calendar, label: 'Calendar' },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                view === key
                  ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm'
                  : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter tasks..."
              className="input pl-9 py-2 text-xs"
            />
          </div>
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="select py-2 text-xs w-36">
            <option value="">All members</option>
            {users?.filter(u => !u.disabled).map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="select py-2 text-xs w-32">
            <option value="">All priorities</option>
            <option value="URGENT">Urgent</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* Views */}
      {view === 'kanban' && (
        <KanbanView
          tasks={filteredTasks}
          statuses={statuses}
          users={users || []}
          projectId={id}
          onRefetch={refetch}
          onTaskClick={setShowTaskDetail}
        />
      )}
      {view === 'table' && (
        <TableView
          tasks={filteredTasks}
          statuses={statuses}
          users={users || []}
          projectId={id}
          onRefetch={refetch}
          onTaskClick={setShowTaskDetail}
        />
      )}
      {view === 'calendar' && (
        <CalendarView tasks={filteredTasks} onTaskClick={setShowTaskDetail} />
      )}

      {/* New Task Modal */}
      {showNewTask && (
        <NewTaskModal
          projectId={id}
          statuses={statuses}
          users={users || []}
          projectTags={project.tags || []}
          onClose={() => setShowNewTask(false)}
          onCreated={() => { setShowNewTask(false); refetch(); }}
        />
      )}

      {/* Task Detail Modal */}
      {showTaskDetail && (
        <TaskDetailModal
          taskId={showTaskDetail}
          statuses={statuses}
          users={users || []}
          projectTags={project.tags || []}
          onClose={() => setShowTaskDetail(null)}
          onUpdated={refetch}
        />
      )}
    </div>
  );
}

// ================== KANBAN VIEW ==================
function KanbanView({ tasks, statuses, users, projectId, onRefetch, onTaskClick }: any) {
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;
    const newStatus = destination.droppableId;
    const task = tasks.find((t: Task) => t.id === draggableId);
    if (!task) return;

    // Build new order
    const columnTasks = tasks
      .filter((t: Task) => t.status === newStatus && t.id !== draggableId)
      .sort((a: Task, b: Task) => a.orderIndex - b.orderIndex);

    columnTasks.splice(destination.index, 0, { ...task, status: newStatus });

    const bulkUpdates = columnTasks.map((t: Task, i: number) => ({
      id: t.id,
      status: newStatus,
      orderIndex: (i + 1) * 1000,
    }));

    // Optimistic update via refetch
    await apiCall(`/api/tasks/${draggableId}`, {
      method: 'PATCH',
      body: JSON.stringify({ bulkOrder: { tasks: bulkUpdates } }),
    });

    onRefetch();
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4">
        {statuses.map((status: string) => {
          const columnTasks = tasks
            .filter((t: Task) => t.status === status)
            .sort((a: Task, b: Task) => a.orderIndex - b.orderIndex);

          return (
            <div key={status} className="flex-shrink-0 w-72">
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300">
                  {status}
                </h3>
                <span className="text-xs text-surface-400 bg-surface-100 dark:bg-surface-800 px-2 py-0.5 rounded-full">
                  {columnTasks.length}
                </span>
              </div>
              <Droppable droppableId={status}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`min-h-[120px] rounded-xl p-2 space-y-2 transition-colors ${
                      snapshot.isDraggingOver
                        ? 'bg-brand-50/50 dark:bg-brand-950/20 border-2 border-dashed border-brand-300 dark:border-brand-700'
                        : 'bg-surface-100/50 dark:bg-surface-800/30'
                    }`}
                  >
                    {columnTasks.map((task: Task, index: number) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`card p-3.5 cursor-pointer group ${
                              snapshot.isDragging ? 'shadow-elevated rotate-1' : ''
                            }`}
                            onClick={() => onTaskClick(task.id)}
                          >
                            <div className="flex items-start gap-2">
                              <div {...provided.dragHandleProps} className="mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <GripVertical className="w-3.5 h-3.5 text-surface-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-surface-900 dark:text-white leading-snug">
                                  {task.title}
                                </p>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <span className={`badge text-[10px] ${priorityColors[task.priority]}`}>
                                    {task.priority === 'NONE' ? 'No priority' : task.priority}
                                  </span>
                                  {task.dueDate && (
                                    <span className="text-[10px] text-surface-500">
                                      {format(new Date(task.dueDate), 'MMM d')}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center justify-between mt-2.5">
                                  {task.assignee ? (
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center">
                                        <span className="text-[10px] font-bold text-brand-700 dark:text-brand-300">
                                          {task.assignee.name.charAt(0)}
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-surface-500">{task.assignee.name}</span>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-surface-400">Unassigned</span>
                                  )}
                                  {task._count?.comments > 0 && (
                                    <span className="flex items-center gap-1 text-[10px] text-surface-400">
                                      <MessageSquare className="w-3 h-3" /> {task._count.comments}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}

// ================== TABLE VIEW ==================
function TableView({ tasks, statuses, users, onTaskClick }: any) {
  const [sortField, setSortField] = useState<string>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = [...tasks].sort((a: Task, b: Task) => {
    let cmp = 0;
    if (sortField === 'title') cmp = a.title.localeCompare(b.title);
    else if (sortField === 'status') cmp = statuses.indexOf(a.status) - statuses.indexOf(b.status);
    else if (sortField === 'priority') cmp = (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4);
    else if (sortField === 'dueDate') cmp = (a.dueDate || '9').localeCompare(b.dueDate || '9');
    else if (sortField === 'assignee') cmp = (a.assignee?.name || 'zzz').localeCompare(b.assignee?.name || 'zzz');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <th
      onClick={() => toggleSort(field)}
      className="px-4 py-3 text-left text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider cursor-pointer hover:text-surface-700 dark:hover:text-surface-200 select-none"
    >
      {children} {sortField === field && (sortDir === 'asc' ? '↑' : '↓')}
    </th>
  );

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-surface-200 dark:border-surface-800">
            <tr>
              <SortHeader field="title">Task</SortHeader>
              <SortHeader field="status">Status</SortHeader>
              <SortHeader field="priority">Priority</SortHeader>
              <SortHeader field="assignee">Assignee</SortHeader>
              <SortHeader field="dueDate">Due Date</SortHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-100 dark:divide-surface-800">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-surface-400 text-sm">
                  No tasks found
                </td>
              </tr>
            ) : (
              sorted.map((task: Task) => (
                <tr
                  key={task.id}
                  onClick={() => onTaskClick(task.id)}
                  className="hover:bg-surface-50 dark:hover:bg-surface-800/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-surface-900 dark:text-white">{task.title}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300">
                      {task.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${priorityColors[task.priority]}`}>
                      {task.priority === 'NONE' ? '—' : task.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-surface-600 dark:text-surface-400">
                    {task.assignee?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-surface-600 dark:text-surface-400">
                    {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ================== CALENDAR VIEW ==================
function CalendarView({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (id: string) => void }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const start = startOfMonth(currentMonth);
  const end = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start, end });

  // Pad start to Monday
  const startDay = start.getDay();
  const padStart = startDay === 0 ? 6 : startDay - 1;
  const paddedDays = [...Array(padStart).fill(null), ...days];

  const getTasksForDay = (day: Date) =>
    tasks.filter(t => t.dueDate && isSameDay(new Date(t.dueDate), day));

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-surface-900 dark:text-white">
          {format(currentMonth, 'MMMM yyyy')}
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="btn-ghost btn-sm">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => setCurrentMonth(new Date())} className="btn-ghost btn-sm text-xs">Today</button>
          <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="btn-ghost btn-sm">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px bg-surface-200 dark:bg-surface-700 rounded-lg overflow-hidden">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="bg-surface-50 dark:bg-surface-800 px-2 py-2 text-center text-xs font-medium text-surface-500">
            {d}
          </div>
        ))}
        {paddedDays.map((day, i) => {
          if (!day) {
            return <div key={`pad-${i}`} className="bg-surface-50/50 dark:bg-surface-900/50 min-h-[80px]" />;
          }
          const dayTasks = getTasksForDay(day);
          const isToday = isSameDay(day, new Date());
          return (
            <div
              key={day.toISOString()}
              className={`bg-white dark:bg-surface-900 min-h-[80px] p-1.5 ${isToday ? 'ring-2 ring-inset ring-brand-500' : ''}`}
            >
              <span className={`text-xs font-medium ${
                isToday ? 'text-brand-600 dark:text-brand-400' : 'text-surface-500'
              }`}>
                {format(day, 'd')}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayTasks.slice(0, 3).map(t => (
                  <div
                    key={t.id}
                    onClick={() => onTaskClick(t.id)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300 truncate cursor-pointer hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors"
                  >
                    {t.title}
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <span className="text-[10px] text-surface-400 px-1">+{dayTasks.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ================== NEW TASK MODAL ==================
function NewTaskModal({ projectId, statuses, users, projectTags, onClose, onCreated }: any) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState(statuses[0] || 'Backlog');
  const [priority, setPriority] = useState('NONE');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);

    const { error } = await apiCall('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        projectId, title, description, status, priority,
        assigneeId: assigneeId || null,
        dueDate: dueDate || null,
      }),
    });

    if (error) toast.error(error);
    else { toast.success('Task created!'); onCreated(); }
    setCreating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-surface-900 dark:text-white">New Task</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-100 dark:hover:bg-surface-800">
            <X className="w-4 h-4 text-surface-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input" placeholder="What needs to be done?" autoFocus required />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="input min-h-[80px]" placeholder="Add details..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="select">
                {statuses.map((s: string) => <option key={s} value={s}>{s}</option>)}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Assignee</label>
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="select">
                <option value="">Unassigned</option>
                {users?.filter((u: any) => !u.disabled).map((u: any) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input" />
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

// ================== TASK DETAIL MODAL ==================
function TaskDetailModal({ taskId, statuses, users, projectTags, onClose, onUpdated }: any) {
  const { data: task, loading, refetch } = useFetch<Task>(`/api/tasks/${taskId}`, { pollInterval: false });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState('');
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setStatus(task.status);
      setPriority(task.priority);
      setAssigneeId(task.assigneeId || '');
      setDueDate(task.dueDate ? task.dueDate.split('T')[0] : '');
    }
  }, [task]);

  const handleSave = async () => {
    setSaving(true);
    setConflict(false);

    const { error, status: httpStatus } = await apiCall(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        version: task?.version,
        title, description,
        status: status,
        priority,
        assigneeId: assigneeId || null,
        dueDate: dueDate || null,
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

  const handleReload = async () => {
    setConflict(false);
    await refetch();
    toast.success('Data reloaded');
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
                <button onClick={handleReload} className="btn-sm bg-amber-600 text-white hover:bg-amber-700 rounded-md px-3 py-1 text-xs">
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
              <h2 className="text-lg font-bold text-surface-900 dark:text-white flex-1">{task.title}</h2>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Status</label>
              {editing ? (
                <select value={status} onChange={e => setStatus(e.target.value)} className="select">
                  {statuses.map((s: string) => <option key={s}>{s}</option>)}
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
              <label className="label">Assignee</label>
              {editing ? (
                <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="select">
                  <option value="">Unassigned</option>
                  {users?.filter((u: any) => !u.disabled).map((u: any) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-surface-700 dark:text-surface-300">{task.assignee?.name || 'Unassigned'}</p>
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
              </>
            )}
          </div>

          {/* Comments */}
          <div className="pt-4 border-t border-surface-200 dark:border-surface-800">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white mb-3">
              Comments ({task.comments?.length || 0})
            </h3>
            <form onSubmit={handleComment} className="flex gap-2 mb-4">
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
