export interface User {
  id: string;
  username: string;
  name: string;
  role: 'ADMIN' | 'MEMBER' | 'GUEST';
  disabled: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  clientName: string | null;
  templateId: string | null;
  status: string;
  statuses: string[];
  priorities: string[];
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  _count?: { tasks: number };
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: string;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  assigneeId: string | null;
  assignee?: { id: string; name: string; username: string } | null;
  dueDate: string | null;
  tags: string[];
  orderIndex: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  comments?: Comment[];
  project?: { id: string; name: string; statuses: string[] };
  _count?: { comments: number; tasks?: number };
}
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  author?: { id: string; name: string };
  body: string;
  createdAt: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  seedConfig: {
    statuses: string[];
    priorities: string[];
    tags: string[];
    sampleTasks: Array<{
      title: string;
      status: string;
      priority: string;
      tags: string[];
    }>;
  };
}

export interface ActivityLog {
  id: string;
  actorId: string;
  actor?: { id: string; name: string };
  entityType: string;
  entityId: string;
  action: string;
  before: any;
  after: any;
  createdAt: string;
}

export interface ConflictError {
  error: 'CONFLICT';
  message: string;
  currentVersion: number;
  currentData: any;
}
