import { collection, query, where, onSnapshot, doc, setDoc, addDoc, getDoc, updateDoc, deleteDoc, orderBy, documentId, limit, runTransaction, getDocs, writeBatch } from 'firebase/firestore';
import { db, auth, analyticsPromise } from './firebase';
import { logEvent } from 'firebase/analytics';
import { Project, Task, Member, ActivityLog, ActivityType, Invite, UserProfile, Comment } from '../types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const trackEvent = async (eventName: string, params?: Record<string, unknown>) => {
  try {
    const analytics = await analyticsPromise;
    if (analytics) {
      logEvent(analytics, eventName, params);
    }
  } catch (e) {
    console.error("Failed to log event:", e);
  }
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>) => {
  const userRef = doc(db, 'users', uid);
  await setDoc(userRef, {
    ...data,
    updatedAt: Date.now()
  }, { merge: true });
};

export const subscribeUserProfile = (uid: string, callback: (profile: UserProfile | null) => void) => {
  return onSnapshot(doc(db, 'users', uid), (doc) => {
    if (doc.exists()) {
      callback({ uid: doc.id, ...doc.data() } as UserProfile);
    } else {
      callback(null);
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  });
};

export const logActivity = async (
  projectId: string, 
  type: ActivityType, 
  entityId: string, 
  entityName: string, 
  userId: string, 
  userName: string, 
  details?: string
) => {
  try {
    await addDoc(collection(db, 'projects', projectId, 'activityLog'), {
      projectId,
      type,
      entityId,
      entityName,
      userId,
      userName,
      details: details || '',
      timestamp: Date.now()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `projects/${projectId}/activityLog`);
  }
};

export const subscribeActivityLog = (projectId: string, callback: (logs: ActivityLog[]) => void, taskId?: string) => {
  let q = query(
    collection(db, 'projects', projectId, 'activityLog'),
    orderBy('timestamp', 'desc'),
    limit(50)
  );
  
  if (taskId) {
    q = query(
      collection(db, 'projects', projectId, 'activityLog'),
      where('entityId', '==', taskId),
      limit(50) // Removed orderBy to prevent composite index requirement
    );
  }

  return onSnapshot(q, (snapshot) => {
    const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
    if (taskId) {
      // Sort client-side to replace the removed orderBy
      logs.sort((a, b) => b.timestamp - a.timestamp);
    }
    callback(logs);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, `projects/${projectId}/activityLog`);
  });
};

export const subscribeProjects = (userId: string, callback: (projects: Project[]) => void) => {
  console.log('Services: subscribeProjects init for', userId);
  const q = query(collection(db, 'members'), where('userId', '==', userId));
  
  let unsubProjects: (() => void) | null = null;

  const unsubMembers = onSnapshot(q, (snapshot) => {
    console.log('Services: Members snapshot received. Count:', snapshot.docs.length);
    if (unsubProjects) {
      unsubProjects();
      unsubProjects = null;
    }

    const memberProjectIds = snapshot.docs
      .map(doc => doc.data().projectId)
      .filter(id => typeof id === 'string' && id.length > 0);
    
    console.log('Services: Extracted memberProjectIds:', memberProjectIds);
    
    // For simplicity and real-time correctness, we listen to the projects the user is a member of. 
    // Firestore 'in' query is limited to 30 IDs.
    
    const projectsQ = query(
      collection(db, 'projects'), 
      where(documentId(), 'in', memberProjectIds.length > 0 ? memberProjectIds.slice(0, 30) : ['_placeholder_'])
    );

    unsubProjects = onSnapshot(projectsQ, (projSnapshot) => {
      console.log('Services: Projects snapshot received. Count:', projSnapshot.docs.length);
      const projects = projSnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      } as Project));
      
      // Sort projects by createdAt descending
      projects.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      callback(projects);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'projects');
    });
  }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'members');
  });

  return () => {
    unsubMembers();
    if (unsubProjects) unsubProjects();
  };
};

export const subscribeTasks = (projectId: string, callback: (tasks: Task[]) => void) => {
  const q = query(
    collection(db, 'projects', projectId, 'tasks'), 
    where('projectId', '==', projectId),
    limit(250)
  );
  
  return onSnapshot(q, (snapshot) => {
    console.log(`[SYNC] Received tasks snapshot (Active). Count: ${snapshot.docs.length}`);
    
    const tasks = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Task))
      .filter(t => t.id && t.projectId === projectId && !t.deleted);
      
    tasks.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    
    callback([...tasks]);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, `projects/${projectId}/tasks`);
  });
};

export const subscribeTrashTasks = (projectId: string, callback: (tasks: Task[]) => void) => {
  const q = query(
    collection(db, 'projects', projectId, 'tasks'), 
    where('projectId', '==', projectId), 
    where('deleted', '==', true),
    limit(100)
  );
  
  return onSnapshot(q, (snapshot) => {
    console.log(`[SYNC] Received trash snapshot. Count: ${snapshot.docs.length}`);
    const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
    tasks.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
    callback([...tasks]);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, `projects/${projectId}/tasks`);
  });
};

export const createProject = async (name: string, userId: string, userName: string, photoURL?: string) => {
  try {
    const q = query(collection(db, 'members'), where('userId', '==', userId), limit(30));
    const snapshots = await getDocs(q);
    if (snapshots.docs.length >= 30) {
      throw new Error("You have reached the maximum limit of 30 projects.");
    }

    const inviteCode = Math.random().toString(36).substring(2, 10);
    const createdAt = Date.now();
    
    const projectRef = await addDoc(collection(db, 'projects'), {
      name,
      invitationCode: inviteCode,
      ownerId: userId,
      createdAt: createdAt,
      order: createdAt,
      isPinned: false,
      color: 'blue'
    });

    await setDoc(doc(db, 'members', `${projectRef.id}_${userId}`), {
      projectId: projectRef.id,
      userId,
      name: userName,
      photoURL: photoURL || null,
      role: 'owner',
      joinedAt: createdAt
    });
    
    await trackEvent('create_project', { projectId: projectRef.id, userId });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'projects');
  }
};

export const renameProject = async (projectId: string, newName: string) => {
  try {
    await updateDoc(doc(db, 'projects', projectId), { name: newName });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
  }
};

export const updateProject = async (projectId: string, updates: Partial<Project>) => {
  try {
    await updateDoc(doc(db, 'projects', projectId), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
  }
};

export const updateProjectOrders = async (updates: { id: string; order: number }[]) => {
  try {
    const batchJob = writeBatch(db);
    updates.forEach(u => {
      batchJob.update(doc(db, 'projects', u.id), { order: u.order });
    });
    await batchJob.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'projects');
  }
};

export const deleteProject = async (projectId: string) => {
  try {
    await deleteDoc(doc(db, 'projects', projectId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `projects/${projectId}`);
  }
};

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const getActiveInvite = async (projectId: string): Promise<Invite | null> => {
  const now = Date.now();
  const q = query(
    collection(db, 'invites'),
    where('projectId', '==', projectId)
  );
  
  try {
    const snapshot = await getDocs(q);
    const active = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as Invite))
      .find(inv => inv.expiresAt > now && inv.uses < inv.maxUses);
      
    return active || null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'invites');
    return null;
  }
};

export const createInvite = async (
  projectId: string, 
  userId: string, 
  options: { maxUses?: number; expiresAt?: number } = {}
): Promise<string> => {
  try {
    const existing = await getActiveInvite(projectId);
    if (existing && existing.token) return existing.token;

    const token = crypto.randomUUID();
    const tokenHash = await sha256(token);
    const expiresAt = options.expiresAt || (Date.now() + 24 * 60 * 60 * 1000);
    const maxUses = options.maxUses !== undefined ? options.maxUses : 10;

    await addDoc(collection(db, 'invites'), {
      projectId,
      role: 'member',
      createdBy: userId,
      createdAt: Date.now(),
      expiresAt,
      maxUses,
      uses: 0,
      tokenHash,
      token
    });

    await trackEvent('create_invite', { projectId });
    return token;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'invites');
    return "";
  }
};

export const acceptInvite = async (token: string, userId: string, userName: string, photoURL?: string) => {
  try {
    const tokenHash = await sha256(token);
    const invitesQuery = query(collection(db, 'invites'), where('tokenHash', '==', tokenHash));
    const inviteSnapshot = await getDocs(invitesQuery);

    if (inviteSnapshot.empty) throw new Error('Invalid invite link');
    const inviteDoc = inviteSnapshot.docs[0];
    const inviteData = inviteDoc.data() as { projectId: string; expiresAt: number; uses: number; maxUses: number; role: string };

    if (inviteData.expiresAt < Date.now()) throw new Error('Invite expired');
    if (inviteData.uses >= inviteData.maxUses) throw new Error('Invite limit reached');

    await runTransaction(db, async (transaction) => {
      const memberDocRef = doc(db, 'members', `${inviteData.projectId}_${userId}`);
      const memberDoc = await transaction.get(memberDocRef);

      if (!memberDoc.exists()) {
        transaction.set(memberDocRef, {
          projectId: inviteData.projectId,
          userId,
          name: userName,
          photoURL: photoURL || null,
          role: inviteData.role,
          joinedAt: Date.now()
        });
      }

      transaction.update(inviteDoc.ref, { uses: inviteData.uses + 1 });
    });

    await trackEvent('accept_invite', { projectId: inviteData.projectId, userId });
    return inviteData.projectId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'invites/members');
    return null;
  }
};

export const subscribeInvites = (projectId: string, callback: (invites: Invite[]) => void) => {
  const q = query(collection(db, 'invites'), where('projectId', '==', projectId));
  
  return onSnapshot(q, (snapshot) => {
    const invites = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invite));
    callback(invites);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, 'invites');
  });
};

export const revokeInvite = async (inviteId: string) => {
  try {
    await deleteDoc(doc(db, 'invites', inviteId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `invites/${inviteId}`);
  }
};

export const joinProject = async (projectId: string, userId: string, userName: string, photoURL?: string) => {
  try {
    const memberRef = doc(db, 'members', `${projectId}_${userId}`);
    const memberSnap = await getDoc(memberRef);
    
    if (!memberSnap.exists()) {
      await setDoc(memberRef, {
        projectId,
        userId,
        name: userName,
        photoURL: photoURL || null,
        role: 'member',
        joinedAt: Date.now()
      });
      
      await logActivity(projectId, 'member_joined', userId, userName, userId, userName, 'Joined the project');
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `members/${projectId}_${userId}`);
  }
};

export const createTask = async (
  projectId: string, 
  title: string, 
  position: number, 
  userId: string, 
  userName: string, 
  extra?: {
    description?: string;
    assignedUserId?: string;
    assignedUserName?: string;
    deadline?: number;
    priority?: 'low' | 'medium' | 'high';
    status?: string;
    milestoneId?: string;
  }
) => {
  if (!projectId) {
    throw new Error("CREATE FAILED: projectId is missing");
  }
  
  try {
    const q = query(collection(db, 'projects', projectId, 'tasks'), where('projectId', '==', projectId), limit(250));
    const snapshot = await getDocs(q);
    if (snapshot.docs.length >= 250) {
      throw new Error("This project has reached the maximum limit of 250 tasks.");
    }

    // Ensure position is always unique and defined
    const timestamp = Date.now();
    const finalPosition = position === -1 ? (timestamp * -1) : (position ?? timestamp);
    
    const taskRef = await addDoc(collection(db, 'projects', projectId, 'tasks'), {
      title,
      description: extra?.description || '',
      projectId,
      status: 'todo',
      priority: extra?.priority || 'medium',
      assignedUserId: extra?.assignedUserId || null,
      assignedUserName: extra?.assignedUserName || null,
      deadline: extra?.deadline || null,
      milestoneId: extra?.milestoneId || null,
      createdAt: timestamp,
      updatedAt: timestamp,
      position: finalPosition,
      deleted: false,
      deletedAt: null
    });

    await logActivity(projectId, 'task_created', taskRef.id, title, userId, userName);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `projects/${projectId}/tasks`);
  }
};

export const subscribeProjectMembers = (projectId: string, callback: (members: Member[]) => void) => {
  const q = query(collection(db, 'members'), where('projectId', '==', projectId));
  return onSnapshot(q, (snapshot) => {
    const members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Member));
    callback(members);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, 'members');
  });
};

export const updateTask = async (taskId: string, updates: Partial<Task>, projectId: string, userId: string, userName: string, taskTitle: string, skipLog: boolean = false) => {
  try {
    const finalUpdates = {
      ...updates,
      updatedAt: Date.now()
    };
    await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), finalUpdates);
    if (skipLog) return;
    const fields = Object.keys(updates).join(', ');
    await logActivity(projectId, 'task_updated', taskId, taskTitle, userId, userName, `Updated: ${fields}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}/tasks/${taskId}`);
  }
};

export const updateMember = async (memberId: string, updates: Partial<Member>, projectId: string, userId: string, userName: string, targetMemberName: string) => {
  try {
    await updateDoc(doc(db, 'members', memberId), updates);
    if (updates.role) {
      await logActivity(projectId, 'member_role_changed', memberId, targetMemberName, userId, userName, `New role: ${updates.role}`);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `members/${memberId}`);
  }
};

export const removeMember = async (memberId: string, projectId: string, userId: string, userName: string, targetMemberName: string) => {
  try {
    await deleteDoc(doc(db, 'members', memberId));
    await logActivity(projectId, 'member_removed', memberId, targetMemberName, userId, userName, 'Removed from project');
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `members/${memberId}`);
  }
};

export const deleteTask = async (projectId: string, taskId: string, userId: string, userName: string, taskTitle: string) => {
  if (!projectId || !taskId) {
    console.error('Services: deleteTask - projectId or taskId is missing', { projectId, taskId });
    return;
  }
  
  try {
    console.log("Soft deleting task:", taskTitle);
    await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), {
      deleted: true,
      deletedAt: Date.now()
    });
    console.log('Services: soft delete success:', taskId);
    await logActivity(projectId, 'task_deleted', taskId, taskTitle, userId, userName);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}/tasks/${taskId}`);
  }
};

export const restoreTask = async (projectId: string, taskId: string, userId: string, userName: string, taskTitle: string) => {
  try {
    await updateDoc(doc(db, 'projects', projectId, 'tasks', taskId), {
      deleted: false,
      deletedAt: null,
      status: 'todo' // Move back to todo as requested
    });
    await logActivity(projectId, 'task_updated', taskId, taskTitle, userId, userName, 'Restored from Trash');
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}/tasks/${taskId}`);
  }
};

export const permanentlyDeleteTask = async (projectId: string, taskId: string, userId: string, userName: string, taskTitle: string) => {
  try {
    await deleteDoc(doc(db, 'projects', projectId, 'tasks', taskId));
    await logActivity(projectId, 'task_deleted', taskId, taskTitle, userId, userName, 'Permanently deleted');
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `projects/${projectId}/tasks/${taskId}`);
  }
};

export const addComment = async (projectId: string, taskId: string, text: string, userId: string, userName: string, userPhotoURL?: string) => {
  try {
    await addDoc(collection(db, 'projects', projectId, 'tasks', taskId, 'comments'), {
      taskId,
      text,
      userId,
      userName,
      userPhotoURL: userPhotoURL || null,
      createdAt: Date.now()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `projects/${projectId}/tasks/${taskId}/comments`);
  }
};

export const subscribeComments = (projectId: string, taskId: string, callback: (comments: Comment[]) => void) => {
  const q = query(
    collection(db, 'projects', projectId, 'tasks', taskId, 'comments'),
    orderBy('createdAt', 'asc')
  );
  return onSnapshot(q, (snapshot) => {
    const comments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Comment[];
    callback(comments);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, `projects/${projectId}/tasks/${taskId}/comments`);
  });
};

export const updatePresence = async (userId: string, online: boolean) => {
  if (!auth.currentUser || auth.currentUser.uid !== userId) return;
  try {
    await setDoc(doc(db, 'presence', userId), {
      online,
      lastSeen: Date.now()
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `presence/${userId}`);
  }
};

export const subscribePresence = (callback: (presenceMap: Record<string, { online: boolean; lastSeen: number }>) => void) => {
  return onSnapshot(collection(db, 'presence'), (snapshot) => {
    const presenceMap: Record<string, { online: boolean; lastSeen: number }> = {};
    snapshot.docs.forEach(doc => {
      presenceMap[doc.id] = doc.data() as { online: boolean; lastSeen: number };
    });
    callback(presenceMap);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, 'presence');
  });
};
