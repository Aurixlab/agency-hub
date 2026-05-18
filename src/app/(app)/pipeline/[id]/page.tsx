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
  Node,
  Handle,
  Position,
  NodeProps,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useFetch, apiCall } from '@/hooks/useFetch';
import { ArrowLeft, Plus, Save, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';

// ── Custom Node ───────────────────────────────────────────────────────────
function PipelineNodeCard({ id, data, selected }: NodeProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(data.label as string);
  const [showAssignees, setShowAssignees] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLabel(data.label as string); }, [data.label]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const saveLabel = () => {
    setEditing(false);
    if (label.trim() && label !== data.label) {
      (data.onLabelChange as any)(id, label.trim());
    }
  };

  const toggleAssignee = (userId: string) => {
    (data.onAssigneesChange as any)(id, userId);
  };

  const assigneeIds: string[] = (data.assigneeIds as string[]) || [];
  const users: any[] = (data.users as any[]) || [];
  const assignedUsers = users.filter(u => assigneeIds.includes(u.id));

  return (
    <div className={`relative bg-white dark:bg-surface-900 rounded-xl shadow-md border-2 transition-all min-w-[180px] max-w-[220px] ${
      selected ? 'border-brand-500' : 'border-surface-200 dark:border-surface-700'
    }`}>
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-brand-500 !border-2 !border-white" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-brand-500 !border-2 !border-white" />
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-brand-400 !border-2 !border-white" />
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-brand-400 !border-2 !border-white" />

      <div className="p-3">
        {/* Label */}
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveLabel(); if (e.key === 'Escape') { setEditing(false); setLabel(data.label as string); } }}
              className="text-sm font-semibold bg-transparent border-b border-brand-500 outline-none flex-1 text-surface-900 dark:text-white"
            />
            <button onClick={saveLabel} className="p-0.5 text-brand-600"><Check className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <p
            onDoubleClick={() => setEditing(true)}
            className="text-sm font-semibold text-surface-900 dark:text-white cursor-pointer truncate"
            title="Double-click to edit"
          >
            {data.label as string}
          </p>
        )}

        {/* Assignees */}
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          {assignedUsers.map(u => (
            <div
              key={u.id}
              title={u.name}
              className="w-6 h-6 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-[10px] font-bold text-brand-700 dark:text-brand-300 cursor-pointer hover:ring-2 ring-brand-400"
              onClick={() => setShowAssignees(v => !v)}
            >
              {u.name.charAt(0).toUpperCase()}
            </div>
          ))}
          <button
            onClick={() => setShowAssignees(v => !v)}
            className="w-6 h-6 rounded-full border border-dashed border-surface-300 dark:border-surface-600 flex items-center justify-center text-surface-400 hover:border-brand-400 hover:text-brand-500 text-xs"
          >
            +
          </button>
        </div>

        {/* Assignee picker */}
        {showAssignees && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-700 rounded-lg shadow-elevated p-2 w-48">
            <p className="text-xs font-medium text-surface-500 mb-1.5 px-1">Assign members</p>
            {users.filter(u => !u.disabled).map(u => (
              <button
                key={u.id}
                onClick={() => toggleAssignee(u.id)}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors ${
                  assigneeIds.includes(u.id)
                    ? 'bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300'
                    : 'hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-700 dark:text-surface-300'
                }`}
              >
                <div className="w-5 h-5 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center text-[10px] font-bold text-brand-700 dark:text-brand-300 flex-shrink-0">
                  {u.name.charAt(0).toUpperCase()}
                </div>
                {u.name}
                {assigneeIds.includes(u.id) && <Check className="w-3 h-3 ml-auto" />}
              </button>
            ))}
            <button onClick={() => setShowAssignees(false)} className="mt-1 w-full text-xs text-surface-400 hover:text-surface-600 py-1">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { pipelineNode: PipelineNodeCard };

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
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Load saved nodes from DB
  useEffect(() => {
    if (!pipeline || initialized) return;
    setPipelineName(pipeline.name);
    const loadedNodes: Node[] = (pipeline.nodes || []).map((n: any) => ({
      id: n.id,
      type: 'pipelineNode',
      position: { x: n.positionX, y: n.positionY },
      data: {
        label: n.label,
        assigneeIds: Array.isArray(n.assigneeIds) ? n.assigneeIds : [],
        users: users || [],
        onLabelChange: handleLabelChange,
        onAssigneesChange: handleAssigneesChange,
      },
    }));

    const loadedEdges: Edge[] = [];
    for (const n of pipeline.nodes || []) {
      const edgeList = Array.isArray(n.edges) ? n.edges : [];
      for (const target of edgeList) {
        loadedEdges.push({ id: `e-${n.id}-${target}`, source: n.id, target });
      }
    }

    setNodes(loadedNodes);
    setEdges(loadedEdges);
    setInitialized(true);
  }, [pipeline, users, initialized]);

  // Keep users ref fresh in node data
  useEffect(() => {
    if (!users) return;
    setNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data, users, onLabelChange: handleLabelChange, onAssigneesChange: handleAssigneesChange },
    })));
  }, [users]);

  const handleLabelChange = useCallback((nodeId: string, newLabel: string) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, label: newLabel } } : n));
  }, []);

  const handleAssigneesChange = useCallback((nodeId: string, userId: string) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      const ids: string[] = (n.data.assigneeIds as string[]) || [];
      const newIds = ids.includes(userId) ? ids.filter(i => i !== userId) : [...ids, userId];
      return { ...n, data: { ...n.data, assigneeIds: newIds } };
    }));
  }, []);

  const onConnect = useCallback((connection: Connection) => {
    setEdges(eds => addEdge({ ...connection, animated: false }, eds));
  }, []);

  const addNode = () => {
    const id = `node-${Date.now()}`;
    const newNode: Node = {
      id,
      type: 'pipelineNode',
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: {
        label: 'New Stage',
        assigneeIds: [],
        users: users || [],
        onLabelChange: handleLabelChange,
        onAssigneesChange: handleAssigneesChange,
      },
    };
    setNodes(nds => [...nds, newNode]);
  };

  const handleSave = async () => {
    setSaving(true);

    // Build edge map per node
    const edgeMap: Record<string, string[]> = {};
    for (const e of edges) {
      if (!edgeMap[e.source]) edgeMap[e.source] = [];
      edgeMap[e.source].push(e.target);
    }

    const nodesToSave = nodes.map(n => ({
      id: n.id,
      label: n.data.label,
      assigneeIds: n.data.assigneeIds || [],
      position: n.position,
      edges: edgeMap[n.id] || [],
    }));

    const { error } = await apiCall(`/api/pipelines/${id}/nodes`, {
      method: 'PUT',
      body: JSON.stringify({ nodes: nodesToSave }),
    });

    if (error) { toast.error(error); }
    else { toast.success('Pipeline saved'); }
    setSaving(false);
  };

  const saveName = async () => {
    setEditingName(false);
    if (pipelineName.trim() && pipelineName !== pipeline?.name) {
      await apiCall(`/api/pipelines/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: pipelineName }),
      });
    }
  };

  if (loading) return <div className="py-20 text-center text-surface-400 animate-fade-in">Loading pipeline...</div>;
  if (!pipeline) return <div className="py-20 text-center text-surface-400">Pipeline not found</div>;

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] -m-6 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-950 flex-shrink-0">
        <button onClick={() => router.push('/pipeline')} className="p-2 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-500">
          <ArrowLeft className="w-4 h-4" />
        </button>

        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              value={pipelineName}
              onChange={e => setPipelineName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setEditingName(false); setPipelineName(pipeline.name); } }}
              onBlur={saveName}
              className="text-lg font-bold bg-transparent border-b-2 border-brand-500 outline-none text-surface-900 dark:text-white"
              autoFocus
            />
          </div>
        ) : (
          <h1
            onClick={() => setEditingName(true)}
            className="text-lg font-bold text-surface-900 dark:text-white cursor-pointer hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            title="Click to rename"
          >
            {pipelineName}
          </h1>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button onClick={addNode} className="btn-secondary btn-sm">
            <Plus className="w-4 h-4" /> Add Node
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm">
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          defaultEdgeOptions={{ type: 'smoothstep', style: { strokeWidth: 2 } }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="!bg-surface-50 dark:!bg-surface-950" color="var(--color-surface-300, #cbd5e1)" />
          <Controls className="!border-surface-200 dark:!border-surface-700 !bg-white dark:!bg-surface-900 !shadow-md" />
          <MiniMap
            className="!border-surface-200 dark:!border-surface-700 !bg-white dark:!bg-surface-900"
            nodeColor="#3b82f6"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
