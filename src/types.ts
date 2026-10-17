export type TaskStatus = 'todo' | 'in-progress' | 'done';

export interface ProjectPhase {
  id: string;
  name: string;
  status: 'not_started' | 'in_progress' | 'completed';
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  invitationCode: string;
  ownerId: string;
  createdAt: number;
  order?: number;
  isPinned?: boolean;
  color?: string;
  goalTitle?: string;
  goalSuccessMetric?: string;
  goalDeadline?: number;
  phases?: ProjectPhase[];
  currentPhaseId?: string;
  projectResult?: string;
}

export interface Attachment {
  id: string;
  taskId: string;
  url: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'file' | 'link';
  size: number; // in bytes
  createdAt: number;
  linkMetadata?: {
    title?: string;
    description?: string;
    image?: string;
    favicon?: string;
  }
}

export interface Comment {
  id: string;
  taskId: string;
  text: string;
  userId: string;
  userName: string;
  userPhotoURL?: string;
  createdAt: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  assignedUserId?: string;
  assignedUserName?: string;
  status: TaskStatus;
  priority?: 'low' | 'medium' | 'high';
  deadline?: number;
  projectId: string;
  milestoneId?: string;
  createdAt: number;
  updatedAt?: number;
  position: number;
  deleted?: boolean;
  deletedAt?: number | null;
  attachments?: Attachment[];
  assignedUserPhotoURL?: string;
}

export interface Member {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer' | 'member';
  joinedAt: number;
  photoURL?: string;
}

export type ActivityType = 
  | 'task_created' 
  | 'task_updated' 
  | 'task_deleted' 
  | 'member_role_changed'
  | 'member_removed'
  | 'member_joined'
  | 'project_created';

export interface ActivityLog {
  id: string;
  projectId: string;
  type: ActivityType;
  entityId: string; // taskId, userId, etc.
  entityName: string; // task title, user name, etc.
  userId: string;
  userName: string;
  details?: string;
  timestamp: number;
}

export interface Invite {
  id: string;
  projectId: string;
  role: 'member';
  createdBy: string;
  createdAt: number;
  expiresAt: number;
  maxUses: number;
  uses: number;
  tokenHash: string;
  token: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  email: string;
  updatedAt: number;
}

export interface Milestone {
  id: string;
  title: string;
  description: string;
  order: number;
}
