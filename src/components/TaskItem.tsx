import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task, Member } from '../types';
import { 
  Upload, 
  Trash2, 
  UserPlus, 
  Calendar, 
  X, 
  ChevronDown,
  ChevronUp,
  Minus,
  Target
} from 'lucide-react';
import { AttachmentButton } from './attachments/AttachmentButton';
import { format, isPast, isToday } from 'date-fns';
import { cn } from '../lib/utils';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { useTranslation } from 'react-i18next';

import { updateTask } from '../lib/services';
import { useUploadAttachment } from '../hooks/useAttachments';
import { getMilestones } from '../lib/milestones';

function MilestoneLabel({ milestoneId }: { milestoneId: string }) {
  const { t } = useTranslation();
  const title = getMilestones(t).find(m => m.id === milestoneId)?.title;
  return <span className="text-[11px] font-medium">{title || milestoneId}</span>;
}

interface TaskItemProps {
  task: Task;
  isOverlay?: boolean;
  readOnly?: boolean;
  onClick?: () => void;
  key?: React.Key;
  members?: Member[];
}

export const TaskItem = React.memo(function TaskItem({ task, isOverlay, readOnly, onClick, members = [] }: TaskItemProps) {
  const { t } = useTranslation();
  const { user, displayName } = useAuth();
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  
  const [isDragActiveOverTask, setIsDragActiveOverTask] = useState(false);
  const { uploadMultipleFiles } = useUploadAttachment(task.projectId, task.id);

  useEffect(() => {
    setEditTitle(task.title);
  }, [task.title]);

  const isActuallyEditing = isEditing;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: isActuallyEditing || readOnly,
    data: {
      type: 'Task',
      task,
    },
  });

  const style = {
    transition,
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    zIndex: isDragging ? 50 : 1,
  };

  const handleAssign = React.useCallback((member: Member | null) => {
    if (!user) return;
    updateTask(task.id, {
      assignedUserId: (member?.userId || null) as string | undefined,
      assignedUserName: (member?.name || null) as string | undefined,
      assignedUserPhotoURL: (member?.photoURL || null) as string | undefined,
    }, task.projectId, user.uid, displayName || t('common.user'), task.title);
    setShowAssigneeDropdown(false);
  }, [user, task.id, task.projectId, task.title, displayName, t]);

  const handleSaveTitle = React.useCallback(async () => {
    if (!user) return;
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== task.title) {
      await updateTask(task.id, { title: trimmed }, task.projectId, user.uid, displayName || t('common.user'), task.title);
    } else {
      setEditTitle(task.title);
    }
    setIsEditing(false);
  }, [user, editTitle, task.id, task.projectId, task.title, displayName, t]);

  const handleDeadlineChange = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    const newDate = e.target.value ? new Date(e.target.value).getTime() : undefined;
    await updateTask(task.id, { deadline: newDate }, task.projectId, user.uid, displayName || t('common.user'), task.title);
  }, [user, task.id, task.projectId, task.title, displayName, t]);

  const removeDeadline = React.useCallback(async (e: React.MouseEvent) => {
    if (!user) return;
    e.stopPropagation();
    await updateTask(task.id, { deadline: undefined }, task.projectId, user.uid, displayName || t('common.user'), task.title);
  }, [user, task.id, task.projectId, task.title, displayName, t]);

  const cyclePriority = React.useCallback(async (e: React.MouseEvent) => {
    if (!user) return;
    e.stopPropagation();
    const priorities: NonNullable<Task['priority']>[] = ['low', 'medium', 'high'];
    const currentPriority = task.priority || 'medium';
    const currentIndex = priorities.indexOf(currentPriority);
    const nextIndex = (currentIndex + 1) % priorities.length;
    await updateTask(task.id, { priority: priorities[nextIndex] }, task.projectId, user.uid, displayName || t('common.user'), task.title);
  }, [user, task.id, task.projectId, task.title, task.priority, displayName, t]);
  
  // ... rest of component uses priorityConfig, handlers ...
  // Wait, I am replacing the exported function, I must provide the *entire* component now if I am replacing the export.
  // Actually, I will replace the function signature and add the memo, but keep the rest.
  // The edit_file tool needs the target content to match *exactly*.
  // This is too big to replace in one go accurately without risk. 
  // I will use multi_edit_file.

  const priorityConfig = {
    low: { 
      label: t('task.low'), 
      icon: ChevronDown, 
      color: 'text-blue-500', 
      bg: 'bg-blue-500/10',
      borderColor: 'border-l-blue-400' 
    },
    medium: { 
      label: t('task.medium'), 
      icon: Minus, 
      color: 'text-amber-500', 
      bg: 'bg-amber-500/10',
      borderColor: 'border-l-amber-400' 
    },
    high: { 
      label: t('task.high'), 
      icon: ChevronUp, 
      color: 'text-rose-500', 
      bg: 'bg-rose-500/10',
      borderColor: 'border-l-rose-500' 
    },
  };

  const currentPriority = task.priority || 'medium';
  const pConfig = priorityConfig[currentPriority];
  const PriorityIcon = pConfig.icon;

  const isOverdue = task.deadline ? isPast(task.deadline) && !isToday(task.deadline) && task.status !== 'done' : false;

  const handleDragEnter = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragActiveOverTask(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget && !e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragActiveOverTask(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isDragActiveOverTask) {
      setIsDragActiveOverTask(true);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragActiveOverTask(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      try {
        await uploadMultipleFiles(e.dataTransfer.files);
      } catch (err) {
        console.error('TaskItem: drag & drop upload failed.', err);
      }
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        cursor: 'grab',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
      }}
      className={cn(
        "group relative",
        isOverlay && "z-50",
        "[&_.drag-handle]:pointer-events-auto [&_button]:pointer-events-auto [&_input]:pointer-events-auto"
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div {...attributes} {...listeners} className="drag-handle absolute top-2 right-2 text-brand-text-muted hover:text-brand-text-main cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity z-20 pointer-events-auto">
        ⠿
      </div>
      <div
        onClick={(e) => {
          // If clicked on interactive elements, don't open modal
          if ((e.target as HTMLElement).closest('button, input, textarea, [data-no-open]')) return;
          onClick?.();
        }}
        className={cn(
          "flex flex-col gap-3 p-4 bg-brand-surface border border-brand-border rounded-xl transition-all duration-200 relative overflow-hidden",
          "shadow-sm hover:shadow-md group/task",
          pConfig.borderColor,
          "border-l-[3px]",
          onClick && "cursor-pointer pointer-events-auto",
          isOverlay && "shadow-xl border-brand-accent/50 z-[1000]",
          isDragging && "pointer-events-none opacity-0 shadow-none border-dashed",
          "pointer-events-auto"
        )}
      >
        {/* Priority Icon Background Indicator */}
        <div className={cn(
          "absolute right-2 -top-2 opacity-[0.03] transition-opacity pointer-events-none group-hover/task:opacity-[0.06] group-hover/task:rotate-[5deg] group-hover/task:scale-[1.1]",
          pConfig.color
        )}>
          <PriorityIcon size={48} strokeWidth={1} />
        </div>

        {/* Drag Drop Feedback Overlay */}
        {isDragActiveOverTask && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-brand-surface/80 backdrop-blur-[2px] border-2 border-dashed border-brand-accent rounded-xl">
             <div className="flex flex-col items-center justify-center text-brand-accent animate-pulse p-4 text-center">
               <Upload className="w-5 h-5 mb-1.5" />
               <p className="text-[11px] font-bold tracking-tight">{t('task.dropFilesToAttach')}</p>
             </div>
          </div>
        )}

        <div className="flex flex-col gap-2 relative z-10">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {isEditing && !readOnly ? (
                <input
                  autoFocus
                  className="w-full text-[14px] font-medium leading-[1.4] text-brand-text-main outline-none bg-brand-surface-hover px-2 py-1 rounded-md border border-brand-accent/20"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => {
                    if (editTitle.trim() && editTitle.trim() !== task.title) {
                      handleSaveTitle();
                    } else {
                      setEditTitle(task.title);
                      setIsEditing(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveTitle();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditTitle(task.title);
                      setIsEditing(false);
                    }
                  }}
                />
              ) : (
                <div className="flex flex-col gap-1">
                  <h3 
                    onClick={(e) => {
                      if (readOnly) return;
                      e.stopPropagation();
                      setIsEditing(true);
                    }}
                    className={cn(
                      "text-[14px] font-semibold leading-[1.4] text-brand-text-main transition-colors",
                      task.status === 'done' && "line-through text-brand-text-muted",
                      !readOnly && "hover:text-brand-accent cursor-pointer"
                    )}
                  >
                    {task.title}
                  </h3>
                  {task.description && (
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsDescriptionExpanded(!isDescriptionExpanded);
                      }}
                      onMouseEnter={() => setIsDescriptionExpanded(true)}
                      onMouseLeave={() => setIsDescriptionExpanded(false)}
                      className="cursor-pointer group/desc"
                    >
                      <p className={cn(
                        "text-[12.5px] leading-relaxed text-brand-text-muted transition-all break-words",
                        task.status === 'done' && "opacity-50",
                        isDescriptionExpanded ? "whitespace-pre-wrap" : "line-clamp-2"
                      )}>
                        {task.description}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-y-2 gap-x-3 mt-1.5">
            {/* Priority Indicator */}
            <button
              onClick={(e) => !readOnly && cyclePriority(e)}
              onPointerDown={(e) => e.stopPropagation()}
              data-no-open
              className={cn(
                "flex items-center gap-1.5 px-1.5 py-0.5 rounded-md transition-all group/prio",
                !readOnly ? "hover:bg-brand-surface-hover cursor-pointer" : "cursor-default"
              )}
            >
              <PriorityIcon className={cn("w-3.5 h-3.5", pConfig.color)} strokeWidth={2.5} />
              <span className="text-[11px] font-medium text-brand-text-muted group-hover/prio:text-brand-text-main">{pConfig.label}</span>
            </button>

            {/* Assignee */}
            <div className="relative">
              <button
                onClick={(e) => {
                  if (readOnly) return;
                  e.stopPropagation();
                  e.preventDefault();
                  setShowAssigneeDropdown(!showAssigneeDropdown);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                data-no-open
                className={cn(
                  "flex items-center gap-1.5 group/assign focus:outline-none",
                  readOnly ? "cursor-default" : "hover:bg-brand-surface-hover px-1.5 py-0.5 rounded-md transition-colors"
                )}
              >
                <div className={cn(
                  "w-4.5 h-4.5 rounded-full ring-1 ring-brand-border flex items-center justify-center text-[9px] font-bold bg-brand-surface overflow-hidden text-brand-text-main transition-colors",
                  task.assignedUserName && "bg-brand-accent/5 text-brand-accent ring-brand-accent/20"
                )}>
                  {task.assignedUserPhotoURL ? (
                    <img src={task.assignedUserPhotoURL} alt={task.assignedUserName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : task.assignedUserName ? (
                    task.assignedUserName[0].toUpperCase()
                  ) : (
                    <UserPlus className="w-2.5 h-2.5 opacity-60" />
                  )}
                </div>
                {task.assignedUserName && (
                  <span className="text-[11px] font-medium text-brand-text-muted truncate max-w-[70px]">
                    {task.assignedUserName.split(' ')[0]}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showAssigneeDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                    className="absolute left-0 bottom-full mb-2 w-48 bg-brand-surface border border-brand-border rounded-lg shadow-xl z-50 py-1 overflow-hidden"
                  >
                    <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-text-muted bg-brand-surface-hover/50">{t('task.assignTo')}</p>
                    <div className="max-h-40 overflow-y-auto">
                      <button
                        onClick={() => handleAssign(null)}
                        className="w-full text-left px-3 py-2 text-[13px] hover:bg-brand-surface-hover flex items-center gap-2 text-rose-500 font-medium"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {t('task.unassign')}
                      </button>
                      {members.map((member) => (
                        <button
                          key={member.id}
                          onClick={() => handleAssign(member)}
                          className={cn(
                            "w-full text-left px-3 py-2 text-[13px] hover:bg-brand-surface-hover flex items-center gap-2",
                            task.assignedUserId === member.userId && "bg-brand-accent/5 text-brand-accent font-semibold"
                          )}
                        >
                          <div className="w-5 h-5 bg-brand-accent/10 rounded-full flex items-center justify-center text-[10px] font-bold overflow-hidden">
                            {member.photoURL ? (
                              <img src={member.photoURL} alt={member.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              member.name[0].toUpperCase()
                            )}
                          </div>
                          <span className="truncate">{member.name}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Deadline */}
            <div className="relative group/date">
              <input
                type="date"
                disabled={readOnly}
                className={cn(
                  "absolute inset-0 opacity-0 z-10",
                  !readOnly ? "cursor-pointer" : "cursor-default"
                )}
                onChange={handleDeadlineChange}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                value={task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : ''}
              />
              <div className={cn(
                "flex items-center gap-1.5 px-1.5 py-0.5 rounded-md transition-colors",
                task.deadline ? (isOverdue ? "text-rose-600 bg-rose-500/10" : "text-brand-text-muted bg-brand-surface-hover") : "text-brand-text-muted",
                !readOnly && "hover:bg-brand-surface-hover"
              )}>
                {task.deadline ? (
                  <>
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-medium">
                      {format(task.deadline, 'MMM d')}
                    </span>
                    {!readOnly && (
                      <button
                        onClick={removeDeadline}
                        data-no-open
                        className="opacity-0 group-hover/date:opacity-100 hover:text-rose-500 transition-opacity ml-0.5"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </>
                ) : (
                  <Calendar className="w-3.5 h-3.5 opacity-60" />
                )}
              </div>
            </div>

            {/* Milestone Indicator */}
            {task.milestoneId && (() => {
               // Render milestone title. We don't have access to getMilestones() inside JSX without hook or simple import.
               // We will import it at the top.
               const MilestoneIcon = Target; // Default icon
               return (
                 <div 
                   title={t('journey.targetDetails', { defaultValue: 'Milestone' })}
                   className="flex items-center gap-1.5 px-1.5 py-0.5 rounded-md text-emerald-600 bg-emerald-500/10 pointer-events-none"
                 >
                   <MilestoneIcon className="w-3.5 h-3.5" />
                   <MilestoneLabel milestoneId={task.milestoneId} />
                 </div>
               );
            })()}

            {/* Attachments & Comments Badge Concept */}
            <div className="flex items-center gap-1.5 grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all">
              <AttachmentButton projectId={task.projectId} taskId={task.id} />
              {(task.attachments && task.attachments.length > 0) && (
                <span className="text-[11px] font-bold text-brand-text-muted">
                  {task.attachments.length}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
})
