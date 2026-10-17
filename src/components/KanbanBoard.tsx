import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  defaultDropAnimationSideEffects,
  pointerWithin,
  rectIntersection,
  CollisionDetection,
} from '@dnd-kit/core';
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Task, TaskStatus, Member, Project } from '../types';
import { Column, CreateTaskModal } from './Column';
import { TaskItem } from './TaskItem';
import { TaskDetailPanel } from './TaskDetailPanel';
import { TrashPanel } from './TrashPanel';
import { MobileFilterModal } from './MobileFilterModal';
import { TeamManagementModal } from './TeamManagementModal';
import { MapView } from './MapView';
import { ProjectGoalModal } from './ProjectGoalModal';
import { updateTask, createTask, subscribePresence } from '../lib/services';
import { X, Trash2, Plus } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';
import { FilterPill } from './ui/FilterPill';

interface KanbanBoardProps {
  tasks: Task[];
  projectId: string;
  project: Project | null;
  members: Member[];
  assigneeId: string;
  setAssigneeId: (val: string) => void;
  priorityFilter: string;
  setPriorityFilter: (val: string) => void;
  deadlineFilter: string;
  setDeadlineFilter: (val: string) => void;
  isTrashOpen?: boolean;
  setIsTrashOpen?: (val: boolean) => void;
}

export function KanbanBoard({ 
  tasks, 
  projectId, 
  project,
  members,
  assigneeId,
  setAssigneeId,
  priorityFilter,
  setPriorityFilter,
  deadlineFilter,
  setDeadlineFilter,
  isTrashOpen: externalIsTrashOpen,
  setIsTrashOpen: externalSetIsTrashOpen
}: KanbanBoardProps) {
  const { t } = useTranslation();
  const { user, displayName } = useAuth();

  const COLUMNS: { id: TaskStatus; title: string }[] = useMemo(() => [
    { id: 'todo', title: t('task.todo') },
    { id: 'in-progress', title: t('task.inProgress') },
    { id: 'done', title: t('task.done') },
  ], [t]);
  const [searchParams, setSearchParams] = useSearchParams();
  const currentView = searchParams.get('view') === 'map' ? 'map' : 'board';
  const currentMilestone = searchParams.get('milestone');

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Sync local tasks with props when not dragging
  useEffect(() => {
    if (!activeTask) {
      setLocalTasks(tasks);
    }
  }, [tasks, activeTask]);

  const [internalIsTrashOpen, setInternalIsTrashOpen] = useState(false);
  const isTrashOpen = externalIsTrashOpen !== undefined ? externalIsTrashOpen : internalIsTrashOpen;
  const setIsTrashOpen = externalSetIsTrashOpen || setInternalIsTrashOpen;

  const [presenceMap, setPresenceMap] = useState<Record<string, { online: boolean; lastSeen: number }>>({});

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [undoTask, setUndoTask] = useState<{ id: string; title: string } | null>(null);

  const userMember = useMemo(() => members.find(m => m.userId === user?.uid), [members, user]);
  const canEdit = useMemo(() => {
    if (!userMember) return false;
    return ['owner', 'admin', 'member'].includes(userMember.role);
  }, [userMember]);

  const canDeleteTasks = useMemo(() => {
    if (!userMember) return false;
    return ['owner', 'admin'].includes(userMember.role);
  }, [userMember]);

  useEffect(() => {
    const unsubPresence = subscribePresence(setPresenceMap);
    return () => {
      unsubPresence();
    };
  }, [projectId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const filteredTasks = useMemo(() => {
    return localTasks
      .filter((task) => task.deleted !== true)
      .filter((task) => {
        const matchAssignee = assigneeId === 'all' || task.assignedUserId === assigneeId;
        const matchPriority = priorityFilter === 'all' || task.priority === priorityFilter;
        const matchMilestone = currentMilestone ? task.milestoneId === currentMilestone : true;
        
        let matchDeadline = true;
        const now = Date.now();
        if (deadlineFilter === 'overdue') {
          matchDeadline = !!task.deadline && task.deadline < now && task.status !== 'done';
        } else if (deadlineFilter === 'upcoming') {
          const soon = now + 7 * 24 * 60 * 60 * 1000;
          matchDeadline = !!task.deadline && task.deadline >= now && task.deadline <= soon;
        } else if (deadlineFilter === 'no-deadline') {
          matchDeadline = !task.deadline;
        }
        
        return matchAssignee && matchPriority && matchDeadline && matchMilestone;
      });
  }, [localTasks, assigneeId, priorityFilter, deadlineFilter, currentMilestone]);

  const columnsData = useMemo(() => {
    return COLUMNS.map((col) => {
      const colTasks = filteredTasks.filter((t) => t.status === col.id);
      
      if (deadlineFilter !== 'all') {
        colTasks.sort((a, b) => {
          if (!a.deadline && !b.deadline) return (a.position ?? 0) - (b.position ?? 0);
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return a.deadline - b.deadline;
        });
      } else {
        colTasks.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      }

      return {
        ...col,
        tasks: colTasks,
      };
    });
  }, [filteredTasks, COLUMNS, deadlineFilter]);

  const customCollisionDetection: CollisionDetection = (args) => {
    // 1. First, check if pointer is within the trash zone
    const pointerCollisions = pointerWithin(args);
    const trashCollision = pointerCollisions.find(c => c.id === 'trash');
    
    if (trashCollision) {
      return [trashCollision];
    }
    
    // 2. Otherwise, use rect intersection for the rest of the board
    return rectIntersection(args);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find((t) => t.id === active.id);
    if (task) setActiveTask(task);
  };

  const handleDragOver = (event: DragOverEvent) => {
    if (!canEdit) return;
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeTask = localTasks.find((t) => t.id === activeId);
    if (!activeTask) return;

    // Determine if we're hovering over a column or a task
    const overColumn = COLUMNS.find((c) => c.id === overId);
    const overTask = localTasks.find((t) => t.id === overId);

    const newStatus = overColumn ? (overColumn.id as TaskStatus) : (overTask?.status as TaskStatus);

    if (!newStatus) return;

    if (activeTask.status !== newStatus) {
      setLocalTasks((prev) => {
        const activeIdx = prev.findIndex((t) => t.id === activeId);
        const updated = [...prev];
        updated[activeIdx] = { ...updated[activeIdx], status: newStatus };
        
        // When moving to a different status, we don't necessarily reorder indexes yet,
        // but handleDragEnd will sort it out. For a smoother transition:
        const taskToMove = updated[activeIdx];
        const otherInNewCol = updated.filter(t => t.status === newStatus && t.id !== activeId)
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        
        // Find position in new column
        let destinationIndex = otherInNewCol.length;
        if (overTask) {
          destinationIndex = otherInNewCol.findIndex(t => t.id === overId);
        }
        
        // Re-calculate positions for the new sequence locally
        const newColSequence = [...otherInNewCol];
        newColSequence.splice(destinationIndex, 0, taskToMove);
        
        const final = prev.map(t => {
          if (t.id === activeId) {
            return { ...t, status: newStatus, position: destinationIndex };
          }
          const inNewSeq = newColSequence.find(ni => ni.id === t.id);
          if (inNewSeq) {
            return { ...t, position: newColSequence.indexOf(inNewSeq) };
          }
          return t;
        });
        
        return final;
      });
    } else if (overTask && activeId !== overId) {
      // Handle reordering within the same column during drag for a "jumpy" feel (optional but good)
      setLocalTasks((prev) => {
        const colTasks = prev.filter(t => t.status === activeTask.status).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        const oldIdx = colTasks.findIndex(t => t.id === activeId);
        const newIdx = colTasks.findIndex(t => t.id === overId);
        
        if (oldIdx === -1 || newIdx === -1) return prev;
        
        const reorderedCol = arrayMove(colTasks, oldIdx, newIdx);
        const updated = prev.map(t => {
          const reorderedItem = reorderedCol.find(ri => ri.id === t.id);
          if (reorderedItem) {
            return { ...t, position: reorderedCol.indexOf(reorderedItem) };
          }
          return t;
        });
        return updated;
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const task = active.data.current?.task as Task;
    setActiveTask(null);

    if (!over || !task || !canEdit || !user) {
      setLocalTasks(tasks); // Reset to server state if dropped nowhere or invalid
      return;
    }

    // 🗑️ TRASH (SOFT DELETE)
    if (over.id === "trash") {
      if (!canDeleteTasks) {
        alert(t('task.noDeletePermission'));
        setLocalTasks(tasks);
        return;
      }
      try {
        await updateTask(
          task.id,
          {
            deleted: true,
            deletedAt: Date.now(),
          },
          projectId,
          user.uid,
          displayName || t('common.user'),
          task.title
        );

        setUndoTask({ id: task.id, title: task.title });
        setTimeout(() => setUndoTask(prev => prev?.id === task.id ? null : prev), 5000);
      } catch (e) {
        alert(e instanceof Error ? e.message : t('task.deleteFailed'));
        setLocalTasks(tasks);
      }
      return;
    }

    // 💾 PERSIST FINAL STATE
    // We already have the roughly correct state in localTasks from onDragOver.
    // Let's calculate the final positions for the affected columns.
    const finalActiveTask = localTasks.find(t => t.id === active.id);
    if (!finalActiveTask) return;

    const affectedStatuses = new Set([task.status, finalActiveTask.status]);
    
    try {
      const updates: Promise<void>[] = [];
      
      affectedStatuses.forEach(status => {
        const columnTasks = localTasks
          .filter(t => t.status === status)
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
          
        columnTasks.forEach((item, index) => {
          // Only update if something actually changed
          const original = tasks.find(ot => ot.id === item.id);
          if (original?.position !== index || original?.status !== item.status) {
            updates.push(updateTask(
              item.id,
              { position: index, status: item.status },
              projectId,
              user.uid,
              displayName || t('common.user'),
              item.title,
              true // silent mode
            ));
          }
        });
      });

      await Promise.all(updates);
    } catch (e) {
      alert(e instanceof Error ? e.message : t('task.reorderFailed'));
      setLocalTasks(tasks);
    }
  };

  const isFiltered = assigneeId !== 'all' || priorityFilter !== 'all' || deadlineFilter !== 'all' || !!currentMilestone;

  const resetFilters = () => {
    setAssigneeId('all');
    setPriorityFilter('all');
    setDeadlineFilter('all');
    if (currentMilestone) {
      searchParams.delete('milestone');
      setSearchParams(searchParams);
    }
  };

  const currentAssignee = useMemo(() => 
    assigneeId === 'all' ? t('task.allAssignees') : members.find(m => m.userId === assigneeId)?.name || t('common.unknown'),
    [assigneeId, members, t]
  );

  const handleCreateTask = async (taskData: { 
    title: string; 
    description: string; 
    assigneeId: string; 
    deadline: string; 
    priority: 'low' | 'medium' | 'high';
    milestoneId?: string;
  }) => {
    if (!user) return;
    
    const assignedMember = members.find(m => m.userId === taskData.assigneeId);
    
    await createTask(projectId, taskData.title, -1, user.uid, displayName || t('common.user'), {
      description: taskData.description,
      assignedUserId: taskData.assigneeId === 'unassigned' ? undefined : taskData.assigneeId,
      assignedUserName: assignedMember?.name,
      deadline: taskData.deadline ? new Date(taskData.deadline).getTime() : undefined,
      priority: taskData.priority,
      status: 'todo',
      milestoneId: taskData.milestoneId
    });
    
    setIsCreateModalOpen(false);
  };

  return (
    <div className="flex flex-col w-full bg-brand-bg relative transition-colors duration-500">
      
      <div className="w-full box-border p-4 sm:p-6 lg:p-8">
        <AnimatePresence mode="wait">
          {currentView === 'board' ? (
            <motion.div
              key="board"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
            >
              <DndContext
                sensors={sensors}
                collisionDetection={customCollisionDetection}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <TrashDropZone active={!!activeTask} />
                
                <div className="flex flex-col h-full gap-6">
                  {/* Mobile Filter Pills */}
                  <AnimatePresence>
                    {isFiltered && (
                      <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex sm:hidden flex-wrap gap-2 mb-2"
                      >
                        {assigneeId !== 'all' && (
                          <FilterPill 
                            label={currentAssignee} 
                            onRemove={() => setAssigneeId('all')} 
                          />
                        )}
                        {priorityFilter !== 'all' && (
                          <FilterPill 
                            label={priorityFilter} 
                            onRemove={() => setPriorityFilter('all')} 
                          />
                        )}
                        {deadlineFilter !== 'all' && (
                          <FilterPill 
                            label={deadlineFilter} 
                            onRemove={() => setDeadlineFilter('all')} 
                          />
                        )}
                        {currentMilestone && (
                          <FilterPill 
                            label={t('journey.targetDetails', { defaultValue: 'Milestone' })} 
                            onRemove={() => {
                              searchParams.delete('milestone');
                              setSearchParams(searchParams);
                            }} 
                          />
                        )}
                        <button 
                          onClick={resetFilters}
                          className="text-[11px] font-bold text-rose-500 flex items-center gap-1 px-3 py-1 bg-brand-surface-hover rounded-full"
                        >
                          <X className="w-3 h-3" />
                          {t('common.reset')}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {canEdit && (
                    <div className="w-full">
                      <Button
                        variant="primary"
                        size="lg"
                        fullWidth
                        leftIcon={<Plus className="w-5 h-5" />}
                        onClick={() => setIsCreateModalOpen(true)}
                        className="py-6 border-brand-accent/20 border-dashed bg-brand-surface text-brand-accent hover:bg-brand-accent/5 hover:border-brand-accent/40 shadow-sm"
                      >
                        {t('task.addNewTask')}
                      </Button>
                    </div>
                  )}
                  <div className="flex-1 relative w-full max-w-full box-border grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
                    {columnsData.map((column) => (
                      <div className="min-w-0 w-full max-w-full overflow-hidden" key={column.id}>
                        <Column 
                            column={column} 
                            projectId={projectId} 
                            members={members}
                            readOnly={!canEdit} 
                            onTaskClick={setSelectedTask} 
                          />
                      </div>
                    ))}
                  </div>
                </div>

                <DragOverlay 
                  dropAnimation={{
                    duration: 250,
                    easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
                    sideEffects: defaultDropAnimationSideEffects({
                      styles: {
                        active: {
                          opacity: '0.4',
                        },
                      },
                    }),
                  }}
                >
                  {activeTask ? (
                    <div className="touch-none transition-transform duration-200" style={{ transform: 'scale(1.02)' }}>
                      <TaskItem task={activeTask} isOverlay members={members} />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </motion.div>
          ) : currentView === 'map' ? (
            <motion.div
              key="map"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              <MapView 
                project={project}
              />
            </motion.div>
            
          ) : (
            <motion.div
              key="empty"
            />
          )}
        </AnimatePresence>
      </div>

      <CreateTaskModal 
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateTask}
        members={members}
      />

      <TaskDetailPanel
        task={selectedTask}
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        members={members}
        readOnly={!canEdit}
      />

      <TrashPanel
        projectId={projectId}
        isOpen={isTrashOpen}
        onClose={() => setIsTrashOpen(false)}
      />

      <MobileFilterModal
        isOpen={isMobileFilterOpen}
        onClose={() => setIsMobileFilterOpen(false)}
        assigneeId={assigneeId}
        setAssigneeId={setAssigneeId}
        priorityFilter={priorityFilter}
        setPriorityFilter={setPriorityFilter}
        deadlineFilter={deadlineFilter}
        setDeadlineFilter={setDeadlineFilter}
        members={members}
        onReset={resetFilters}
      />

      <TeamManagementModal
        isOpen={isTeamModalOpen}
        onClose={() => setIsTeamModalOpen(false)}
        projectId={projectId}
        members={members}
        presenceMap={presenceMap}
        currentUserRole={userMember?.role || 'member'}
      />

      {project && (
        <ProjectGoalModal
          isOpen={isGoalModalOpen}
          onClose={() => setIsGoalModalOpen(false)}
          project={project}
        />
      )}

      {/* Undo Toast */}
      <AnimatePresence>
        {undoTask && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-24 left-1/2 z-[100] bg-brand-surface text-brand-text-main border border-brand-border px-6 py-4 rounded-2xl shadow-xl flex items-center gap-6 min-w-[320px]"
          >
            <div className="flex-1">
              <p className="text-[14px] font-bold">{t('task.deleted', { title: undoTask.title })}</p>
              <p className="text-[11px] text-brand-text-muted">{t('task.movedToTrash')}</p>
            </div>
            <button
              onClick={async () => {
                if (user) {
                  await updateTask(undoTask.id, { deleted: false, deletedAt: null }, projectId, user.uid, displayName || t('common.user'), undoTask.title);
                  setUndoTask(null);
                }
              }}
              className="px-4 py-2 bg-brand-accent hover:bg-brand-accent/90 text-white rounded-lg text-[12px] font-bold uppercase tracking-wider transition-all"
            >
              {t('task.undo')}
            </button>
            <button 
              onClick={() => setUndoTask(null)}
              className="p-1 hover:bg-brand-surface-hover rounded-lg transition-colors text-brand-text-muted hover:text-brand-text-main"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TrashDropZone({ active }: { active: boolean }) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({
    id: 'trash',
  });

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          ref={setNodeRef}
          initial={{ opacity: 0, x: 100 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 100 }}
          className={cn(
            "fixed bottom-8 right-8 z-[100] flex items-center justify-center rounded-3xl border-2 transition-all duration-500",
            "w-20 h-20 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)]",
            isOver 
              ? "bg-red-500 border-red-400 text-white scale-110 rotate-6" 
              : "bg-brand-surface border-red-500/20 text-red-500 hover:border-red-500/40"
          )}
        >
          <div className={cn(
            "flex flex-col items-center gap-1 transition-transform",
            isOver && "scale-110"
          )}>
            <Trash2 className={cn("w-7 h-7", isOver ? "animate-bounce" : "")} />
            <span className="text-[10px] font-black uppercase tracking-tighter">{t('task.trash')}</span>
          </div>
          
          {isOver && (
            <motion.div 
              layoutId="trash-glow"
              className="absolute inset-[-12px] bg-red-500/20 rounded-[40px] -z-10 blur-xl"
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
