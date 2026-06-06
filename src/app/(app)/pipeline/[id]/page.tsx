'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  EdgeProps,
  Node,
  Handle,
  Position,
  NodeProps,
  BackgroundVariant,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useFetch, apiCall } from '@/hooks/useFetch';
import { ArrowLeft, Plus, Check, Cloud, Trash2, X } from 'lucide-react';

// ── Deletable Edge ────────────────────────────────────────────────────────
function DeletableEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected }: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      <BaseEdge path={edgePath} style={{ strokeWidth: 2, stroke: selected ? '#3b82f6' : '#94a3b8' }} />
      <EdgeLabelRenderer>
        <div
          style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }}
          className="nodrag nopan"
        >
          <button
            onClick={() => {
              setEdges(eds => eds.filter(e => e.id !== id));
            }}
            className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity shadow-md"
            style={{ opacity: selected ? 1 : undefined }}
            title="Delete connection"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// ── Stable callback bag — passed by ref so node cards always call the latest version
interface Callbacks {
  onLabelChange: (nodeId: string, label: string) => void;
  onDescChange: (nodeId: string, desc: string) => void;
  onAssigneesChange: (nodeId: string, userId: string) => void;
  onDoneToggle: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
}

// ── Custom Node ───────────────────────────────────────────────────────────
function PipelineNodeCard({ id, data, selected }: NodeProps) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [label, setLabel] = useState(data.label as string);
  const [desc, setDesc] = useState((data.description as string) || '');
  const [showAssignees, setShowAssignees] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Only sync from parent when not actively editing, prevents overwriting mid-type
  useEffect(() => { if (!editingLabel) setLabel(data.label as string); }, [data.label, editingLabel]);
  useEffect(() => { if (!editingDesc) setDesc((data.description as string) || ''); }, [data.description, editingDesc]);
  useEffect(() => { if (editingLabel) labelRef.current?.focus(); }, [editingLabel]);
  useEffect(() => { if (editingDesc) descRef.current?.focus(); }, [editingDesc]);

  // Always call through the stable callbacks ref — never goes stale
  const cbs = data.callbacks as Callbacks;

  const saveLabel = () => {
    setEditingLabel(false);
    const trimmed = label.trim();
    if (trimmed) cbs.onLabelChange(id, trimmed);
  };

  const saveDesc = () => {
    setEditingDesc(false);
    cbs.onDescChange(id, desc);
  };

  const assigneeIds: string[] = (data.assigneeIds as string[]) || [];
  const users: any[] = (data.users as any[]) || [];
  const assignedUsers = users.filter(u => assigneeIds.includes(u.id));
  const done = data.done as boolean;

  return (
    <div className={`relative bg-white dark:bg-surface-900 rounded-xl shadow-md border-2 transition-all min-w-[200px] max-w-[240px] ${
      done ? 'border-emerald-500' : selected ? 'border-brand-500' : 'border-red-400 dark:border-red-500'
    }`}>
      <Handle id="left" type="target" position={Position.Left} className="!w-3 !h-3 !bg-brand-500 !border-2 !border-white" />
      <Handle id="right" type="source" position={Position.Right} className="!w-3 !h-3 !bg-brand-500 !border-2 !border-white" />
      <Handle id="top" type="target" position={Position.Top} className="!w-3 !h-3 !bg-brand-400 !border-2 !border-white" />
      <Handle id="bottom" type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-brand-400 !border-2 !border-white" />

      <div className="p-3 space-y-2">
        {/* Label row with done toggle + delete */}
        <div className="flex items-center gap-1.5">
          {editingLabel ? (
            <>
              <input
                ref={labelRef}
                value={label}
                onChange={e => setLabel(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveLabel();
                  if (e.key === 'Escape') { setEditingLabel(false); setLabel(data.label as string); }
                }}
                className="text-sm font-semibold bg-transparent border-b border-brand-500 outline-none flex-1 text-surface-900 dark:text-white min-w-0"
              />
              <button onClick={saveLabel} className="p-0.5 text-brand-600 flex-shrink-0"><Check className="w-3 h-3" /></button>
            </>
          ) : (
            <p
              onDoubleClick={() => setEditingLabel(true)}
              className="text-sm font-semibold text-surface-900 dark:text-white cursor-pointer truncate flex-1"
              title="Double-click to edit"
            >
              {data.label as string}
            </p>
          )}
          {/* Done toggle */}
          <button
            onClick={() => cbs.onDoneToggle(id)}
            title={done ? 'Mark as not done' : 'Mark as done'}
            className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
              done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-red-400 dark:border-red-500 text-transparent hover:border-emerald-400'
            }`}
          >
            <Check className="w-2.5 h-2.5" />
          </button>
          {/* Delete node */}
          <button
            onClick={() => cbs.onDelete(id)}
            title="Delete node"
            className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center text-surface-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
          >
            <Trash2 className="w-2.5 h-2.5" />
          </button>
        </div>

        {/* Description */}
        {editingDesc ? (
          <div className="space-y-1">
            <textarea
              ref={descRef}
              value={desc}
              onChange={e => setDesc(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setEditingDesc(false); setDesc((data.description as string) || ''); } }}
              rows={2}
              placeholder="Add a description…"
              className="w-full text-xs bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-md p-1.5 outline-none resize-none text-surface-700 dark:text-surface-300 placeholder-surface-400"
            />
            <button onClick={saveDesc} className="text-[10px] text-brand-600 hover:text-brand-700 font-medium">Save</button>
          </div>
        ) : (
          <p
            onDoubleClick={() => setEditingDesc(true)}
            className={`text-xs cursor-pointer leading-relaxed ${
              data.description
                ? 'text-surface-500 dark:text-surface-400'
                : 'text-surface-300 dark:text-surface-600 italic'
            }`}
            title="Double-click to edit description"
          >
            {(data.description as string) || 'Add description…'}
          </p>
        )}

        {/* Assignees */}
        <div className="flex items-center gap-1 flex-wrap pt-0.5">
          {assignedUsers.map(u => (
            u.avatarUrl ? (
              <img key={u.id} src={u.avatarUrl} alt={u.name} title={u.name}
                className="w-6 h-6 rounded-full object-cover cursor-pointer hover:ring-2 ring-brand-400"
                onClick={() => setShowAssignees(v => !v)} />
            ) : (
              <div key={u.id} title={u.name}
                className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-[10px] font-bold text-brand-700 dark:text-brand-300 cursor-pointer hover:ring-2 ring-brand-400"
                onClick={() => setShowAssignees(v => !v)}>
                {u.name.charAt(0).toUpperCase()}
              </div>
            )
          ))}
          <button onClick={() => setShowAssignees(v => !v)}
            className="w-6 h-6 rounded-full border border-dashed border-surface-300 dark:border-surface-600 flex items-center justify-center text-surface-400 hover:border-brand-400 hover:text-brand-500 text-xs">
            +
          </button>
        </div>

        {/* Assignee picker */}
        {showAssignees && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg shadow-elevated p-2 w-48">
            <p className="text-xs font-medium text-surface-500 mb-1.5 px-1">Assign members</p>
            {users.filter(u => !u.disabled).map(u => (
              <button key={u.id} onClick={() => cbs.onAssigneesChange(id, u.id)}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors ${
                  assigneeIds.includes(u.id)
                    ? 'bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300'
                    : 'hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-700 dark:text-surface-300'
                }`}>
                {u.avatarUrl ? (
                  <img src={u.avatarUrl} alt={u.name} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-[10px] font-bold text-brand-700 dark:text-brand-300 flex-shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                )}
                {u.name}
                {assigneeIds.includes(u.id) && <Check className="w-3 h-3 ml-auto" />}
              </button>
            ))}
            <button onClick={() => setShowAssignees(false)} className="mt-1 w-full text-xs text-surface-400 hover:text-surface-600 py-1">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { pipelineNode: PipelineNodeCard };
const edgeTypes = { deletable: DeletableEdge };

interface NodeMeta { label: string; description: string; assigneeIds: string[]; done: boolean; }

// ── Editor Page ───────────────────────────────────────────────────────────
export default function PipelineEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: pipeline, loading } = useFetch<any>(`/api/pipelines/${id}`, { pollInterval: false });
  const { data: users } = useFetch<any[]>('/api/users', { pollInterval: false });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [pipelineName, setPipelineName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [initialized, setInitialized] = useState(false);

  const metaRef = useRef<Record<string, NodeMeta>>({});
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Stable callbacks bag — mutated in place, never recreated
  const callbacksRef = useRef<Callbacks>({
    onLabelChange: () => {},
    onDescChange: () => {},
    onAssigneesChange: () => {},
    onDoneToggle: () => {},
    onDelete: () => {},
  });

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  const scheduleAutoSave = useCallback(() => {
    setSaveStatus('unsaved');
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      setSaveStatus('saving');
      const edgeMap: Record<string, string[]> = {};
      for (const e of edgesRef.current) {
        if (!edgeMap[e.source]) edgeMap[e.source] = [];
        edgeMap[e.source].push(e.target);
      }
      const nodesToSave = nodesRef.current.map(n => {
        const meta = metaRef.current[n.id] || { label: n.data.label as string, description: '', assigneeIds: [], done: false };
        return { id: n.id, label: meta.label, description: meta.description, assigneeIds: meta.assigneeIds, done: meta.done, position: n.position, edges: edgeMap[n.id] || [] };
      });
      const { error } = await apiCall(`/api/pipelines/${id}/nodes`, {
        method: 'PUT',
        body: JSON.stringify({ nodes: nodesToSave }),
      });
      setSaveStatus(error ? 'unsaved' : 'saved');
    }, 1500);
  }, [id]);

  const syncNodeData = useCallback((nodeId: string) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      const meta = metaRef.current[nodeId];
      return { ...n, data: { ...n.data, label: meta.label, description: meta.description, assigneeIds: meta.assigneeIds, done: meta.done } };
    }));
  }, []);

  // Wire up callbacksRef so node cards always get the latest handlers
  useEffect(() => {
    callbacksRef.current.onLabelChange = (nodeId, newLabel) => {
      if (!metaRef.current[nodeId]) metaRef.current[nodeId] = { label: newLabel, description: '', assigneeIds: [], done: false };
      else metaRef.current[nodeId].label = newLabel;
      syncNodeData(nodeId);
      scheduleAutoSave();
    };
    callbacksRef.current.onDescChange = (nodeId, newDesc) => {
      if (!metaRef.current[nodeId]) metaRef.current[nodeId] = { label: 'New Stage', description: newDesc, assigneeIds: [], done: false };
      else metaRef.current[nodeId].description = newDesc;
      syncNodeData(nodeId);
      scheduleAutoSave();
    };
    callbacksRef.current.onAssigneesChange = (nodeId, userId) => {
      const meta = metaRef.current[nodeId];
      if (!meta) return;
      const has = meta.assigneeIds.includes(userId);
      meta.assigneeIds = has ? meta.assigneeIds.filter(i => i !== userId) : [...meta.assigneeIds, userId];
      syncNodeData(nodeId);
      scheduleAutoSave();
    };
    callbacksRef.current.onDoneToggle = (nodeId) => {
      const meta = metaRef.current[nodeId];
      if (!meta) return;
      meta.done = !meta.done;
      syncNodeData(nodeId);
      scheduleAutoSave();
    };
    callbacksRef.current.onDelete = (nodeId) => {
      delete metaRef.current[nodeId];
      setNodes(nds => nds.filter(n => n.id !== nodeId));
      setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
      scheduleAutoSave();
    };
  }, [syncNodeData, scheduleAutoSave, setNodes, setEdges]);

  // Load saved nodes from DB
  useEffect(() => {
    if (!pipeline || initialized) return;
    setPipelineName(pipeline.name);
    const loadedNodes: Node[] = (pipeline.nodes || []).map((n: any) => {
      const assigneeIds = Array.isArray(n.assigneeIds) ? n.assigneeIds : [];
      const description = n.description || '';
      const done = n.done ?? false;
      metaRef.current[n.id] = { label: n.label, description, assigneeIds, done };
      return {
        id: n.id, type: 'pipelineNode',
        position: { x: n.positionX, y: n.positionY },
        data: { label: n.label, description, assigneeIds, done, users: [], callbacks: callbacksRef.current },
      };
    });
    const loadedEdges: Edge[] = [];
    for (const n of pipeline.nodes || []) {
      for (const target of (Array.isArray(n.edges) ? n.edges : [])) {
        loadedEdges.push({ id: `e-${n.id}-${target}`, source: n.id, target });
      }
    }
    setNodes(loadedNodes);
    setEdges(loadedEdges);
    setInitialized(true);
  }, [pipeline, initialized]);

  // Keep users fresh in node data
  useEffect(() => {
    if (!users || !initialized) return;
    setNodes(nds => nds.map(n => ({ ...n, data: { ...n.data, users } })));
  }, [users, initialized]);

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => addEdge({ ...connection, animated: false }, eds));
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleNodesChange = useCallback((changes: any) => {
    onNodesChange(changes);
    if (changes.some((c: any) => c.type === 'position' && c.dragging === false)) scheduleAutoSave();
  }, [onNodesChange, scheduleAutoSave]);

  const handleEdgesChange = useCallback((changes: any) => {
    onEdgesChange(changes);
    if (changes.some((c: any) => c.type === 'remove')) scheduleAutoSave();
  }, [onEdgesChange, scheduleAutoSave]);

  const addNode = useCallback(() => {
    const nodeId = `node-${Date.now()}`;
    metaRef.current[nodeId] = { label: 'New Stage', description: '', assigneeIds: [], done: false };
    setNodes(nds => [...nds, {
      id: nodeId, type: 'pipelineNode',
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: { label: 'New Stage', description: '', assigneeIds: [], done: false, users: users || [], callbacks: callbacksRef.current },
    }]);
    scheduleAutoSave();
  }, [users, scheduleAutoSave]);

  const saveName = async () => {
    setEditingName(false);
    if (pipelineName.trim() && pipelineName !== pipeline?.name) {
      await apiCall(`/api/pipelines/${id}`, { method: 'PATCH', body: JSON.stringify({ name: pipelineName }) });
    }
  };

  if (loading) return <div className="py-20 text-center text-surface-400 animate-fade-in">Loading pipeline...</div>;
  if (!pipeline) return <div className="py-20 text-center text-surface-400">Pipeline not found</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] lg:h-[calc(100vh-2rem)] -mx-4 -mb-8 sm:-mx-6 lg:-m-6 animate-fade-in max-w-none overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-4 py-3 border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 flex-shrink-0">
        <button onClick={() => router.push('/pipeline')} className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-500">
          <ArrowLeft className="w-4 h-4" />
        </button>
        {editingName ? (
          <input value={pipelineName} onChange={e => setPipelineName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setPipelineName(pipeline.name); } }}
            onBlur={saveName} autoFocus
            className="text-base sm:text-lg font-bold bg-transparent border-b-2 border-brand-500 outline-none text-surface-900 dark:text-white min-w-0 flex-1" />
        ) : (
          <h1 onClick={() => setEditingName(true)} title="Click to rename"
            className="text-base sm:text-lg font-bold text-surface-900 dark:text-white cursor-pointer hover:text-brand-600 dark:hover:text-brand-400 transition-colors truncate min-w-0 flex-1">
            {pipelineName}
          </h1>
        )}
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className={`text-xs flex items-center gap-1.5 transition-colors ${
            saveStatus === 'saved' ? 'text-emerald-500' : saveStatus === 'saving' ? 'text-surface-400 animate-pulse' : 'text-amber-500'
          }`}>
            <Cloud className="w-3.5 h-3.5" />
            {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : 'Unsaved'}
          </span>
          <button onClick={addNode} className="btn-secondary btn-sm">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Node</span>
          </button>
        </div>
      </div>

      <div className="flex-1">
        <ReactFlow nodes={nodes} edges={edges}
          onNodesChange={handleNodesChange} onEdgesChange={handleEdgesChange}
          onConnect={onConnect} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView fitViewOptions={{ padding: 0.3 }}
          defaultEdgeOptions={{ type: 'deletable', style: { strokeWidth: 2 } }}>
          <Background variant={BackgroundVariant.Dots} gap={20} size={1}
            className="!bg-surface-50 dark:!bg-surface-950" color="var(--color-surface-300, #cbd5e1)" />
          <Controls style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }} />
          <MiniMap className="!border-surface-200 dark:!border-surface-700 !bg-white dark:!bg-surface-900" nodeColor="#3b82f6" />
        </ReactFlow>
      </div>
    </div>
  );
}
