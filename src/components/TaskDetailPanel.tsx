import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Task, Member, TaskStatus, ActivityLog as ActivityLogType, Comment } from '../types';
import { updateTask, subscribeActivityLog, subscribeComments, addComment } from '../lib/services';
import { useAuth } from '../lib/AuthContext';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Calendar, 
  User, 
  Tag, 
  AlignLeft, 
  Type, 
  CheckCircle2, 
  Circle,
  Clock,
  AlertCircle,
  Loader2,
  History,
  Paperclip,
  MessageSquare,
  Send
} from 'lucide-react';
import { AttachmentButton } from './attachments/AttachmentButton';
import { AttachmentGrid } from './attachments/AttachmentGrid';
import { format, isPast, isToday, isThisWeek, formatDistanceToNow } from 'date-fns';
import { cn } from '../lib/utils';
import { getMilestones } from '../lib/milestones';
import { Target } from 'lucide-react';
import { Select } from './ui/Select';

// ...


interface TaskDetailPanelProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  readOnly?: boolean;
}

export function TaskDetailPanel({ task, isOpen, onClose, members, readOnly }: TaskDetailPanelProps) {
  const { t } = useTranslation();
  const { user, displayName } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [logs, setLogs] = useState<ActivityLogType[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      const unsubLogs = subscribeActivityLog(task.projectId, setLogs, task.id);
      const unsubComments = subscribeComments(task.projectId, task.id, setComments);
      return () => {
        unsubLogs();
        unsubComments();
      };
    }
  }, [task]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!task) return null;

  const handleUpdate = async (updates: Partial<Task>) => {
    if (readOnly || !user) return;
    try {
      setIsSaving(true);
      await updateTask(task.id, updates, task.projectId, user.uid, displayName || t('common.user'), task.title);
    } catch (error) {
      console.error('TaskDetailPanel: Failed to update task', error);
      alert(t('common.updateFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim() || readOnly) return;
    
    try {
      setIsSubmittingComment(true);
      await addComment(task.projectId, task.id, newComment.trim(), user.uid, displayName || t('common.user'), user.photoURL || undefined);
      setNewComment('');
    } catch (error) {
      console.error("Failed to add comment:", error);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const statusOptions: { value: TaskStatus; label: string; icon: React.FC<{className?: string}> }[] = [
    { value: 'todo', label: t('task.todo'), icon: Circle },
    { value: 'in-progress', label: t('task.inProgress'), icon: Clock },
    { value: 'done', label: t('task.done'), icon: CheckCircle2 },
  ];

  const isOverdue = task.deadline ? isPast(task.deadline) && !isToday(task.deadline) && task.status !== 'done' : false;
  const isDueToday = task.deadline ? isToday(task.deadline) && task.status !== 'done' : false;
  const isDueThisWeek = task.deadline ? isThisWeek(task.deadline) && !isToday(task.deadline) && !isOverdue && task.status !== 'done' : false;

  const getDeadlineIndicator = () => {
    if (task.status === 'done' || !task.deadline) return null;
    if (isOverdue) return { color: 'bg-red-500', label: t('task.overdueFilter') };
    if (isDueToday) return { color: 'bg-orange-500', label: t('task.dueToday') };
    if (isDueThisWeek) return { color: 'bg-blue-500', label: t('task.dueThisWeek') };
    return null;
  };

  const deadlineIndicator = getDeadlineIndicator();

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 dark:bg-black/60 z-[9990] backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none p-0 sm:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full h-full sm:h-[90vh] sm:max-h-[850px] max-w-[500px] bg-brand-surface sm:rounded-[32px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] flex flex-col pointer-events-auto overflow-hidden border border-brand-border"
            >
            {/* Header */}
            <div className="flex items-center justify-between p-6 sm:p-8 border-b border-brand-border shrink-0 bg-brand-surface-hover/30">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border border-brand-border",
                  task.status === 'done' ? "bg-brand-surface-hover text-brand-text-muted" : "bg-brand-accent/5 text-brand-accent"
                )}>
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-[18px] font-black text-brand-text-main line-clamp-1 leading-tight uppercase tracking-tight">{task.title}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[10px] text-brand-text-muted font-black uppercase tracking-widest opacity-60">{t('task.detailView')}</p>
                    {deadlineIndicator && (
                      <div className="flex items-center gap-1.5 ml-2">
                        <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", deadlineIndicator.color)} />
                        <span className={cn("text-[10px] font-black uppercase tracking-wider", deadlineIndicator.color.replace('bg-', 'text-'))}>
                          {deadlineIndicator.label}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2.5 hover:bg-brand-surface-hover rounded-xl transition-all text-brand-text-muted hover:text-brand-text-main active:scale-95 border border-transparent hover:border-brand-border"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-8 sm:space-y-12 custom-scrollbar pb-32">
              {/* Title Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2.5 text-brand-text-muted ml-1">
                  <Type className="w-4 h-4" />
                  <span className="text-[11px] font-black uppercase tracking-widest">{t('task.title')}</span>
                </div>
                <input
                  readOnly={readOnly}
                  className={cn(
                    "w-full text-[24px] font-black text-brand-text-main bg-transparent border-none outline-none placeholder:text-brand-text-muted/20 tracking-tight leading-tight",
                    !readOnly && "focus:ring-8 focus:ring-brand-accent/5 rounded-2xl px-4 -mx-4 py-2 transition-all"
                  )}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => title.trim() !== task.title && handleUpdate({ title: title.trim() })}
                />
              </section>

              {/* Status & Priority Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-brand-text-muted">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-[12px] font-bold uppercase tracking-wider">{t('task.status')}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {statusOptions.map((opt) => (
                      <button
                        key={opt.value}
                        disabled={readOnly}
                        onClick={() => handleUpdate({ status: opt.value })}
                         className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all border",
                          task.status === opt.value
                            ? "bg-brand-accent/5 border-brand-accent/30 text-brand-accent"
                            : "bg-brand-surface border-brand-border text-brand-text-muted hover:bg-brand-surface-hover"
                        )}
                      >
                        <opt.icon className="w-3.5 h-3.5" />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-brand-text-muted">
                    <Tag className="w-4 h-4" />
                    <span className="text-[12px] font-bold uppercase tracking-wider">{t('task.priority')}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(['low', 'medium', 'high'] as const).map((p) => (
                      <button
                        key={p}
                        disabled={readOnly}
                        onClick={() => handleUpdate({ priority: p })}
                         className={cn(
                          "px-3 py-1.5 rounded-full text-[12px] font-bold uppercase tracking-widest transition-all border",
                          task.priority === p || (!task.priority && p === 'medium')
                            ? "border-current shadow-sm"
                            : "bg-brand-surface border-brand-border text-brand-text-muted hover:bg-brand-surface-hover border-solid",
                          p === 'low' && (task.priority === p ? "bg-brand-surface-hover text-blue-500" : "hover:text-blue-500"),
                          p === 'medium' && ((task.priority === p || !task.priority) ? "bg-brand-surface-hover text-orange-500" : "hover:text-orange-500"),
                          p === 'high' && (task.priority === p ? "bg-brand-surface-hover text-red-500" : "hover:text-red-500")
                        )}
                      >
                        {t(`task.${p}`)}
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              {/* Assignee Section */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-brand-text-muted">
                  <User className="w-4 h-4" />
                  <span className="text-[12px] font-bold uppercase tracking-wider">{t('task.assignee')}</span>
                </div>
                <Select
                  disabled={readOnly}
                  value={task.assignedUserId || ''}
                  onChange={(val) => {
                    const m = members.find(m => m.userId === val);
                    handleUpdate({ 
                      assignedUserId: val || undefined,
                      assignedUserName: m?.name || undefined,
                      assignedUserPhotoURL: m?.photoURL || undefined
                    });
                  }}
                  options={[
                    { value: '', label: t('task.unassigned') },
                    ...members.map((m) => ({ value: m.userId, label: m.name }))
                  ]}
                  className="bg-brand-surface border-brand-border py-2 text-[14px] font-medium"
                  prefix={
                    <div className="w-6 h-6 rounded-full bg-brand-accent/10 flex items-center justify-center overflow-hidden shrink-0">
                      {task.assignedUserId ? (
                        members.find(m => m.userId === task.assignedUserId)?.photoURL ? (
                          <img src={members.find(m => m.userId === task.assignedUserId)?.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="text-[10px] font-bold text-brand-accent">{task.assignedUserName?.[0].toUpperCase()}</span>
                        )
                      ) : (
                        <User className="w-3 h-3 text-brand-accent" />
                      )}
                    </div>
                  }
                />
              </section>

              {/* Milestone Section */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-brand-text-muted">
                  <Target className="w-4 h-4" />
                  <span className="text-[12px] font-bold uppercase tracking-wider">{t('journey.targetDetails', { defaultValue: 'Milestone' })}</span>
                </div>
                <Select
                  disabled={readOnly}
                  value={task.milestoneId || ''}
                  onChange={(val) => handleUpdate({ milestoneId: val || undefined })}
                  options={[
                    { value: '', label: t('common.none', { defaultValue: 'None' }) },
                    ...getMilestones(t).map(m => ({ value: m.id, label: m.title }))
                  ]}
                  className="bg-brand-surface border-brand-border py-2 text-[14px] font-medium"
                />
              </section>

              {/* Deadline Section */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-brand-text-muted">
                  <Calendar className="w-4 h-4" />
                  <span className="text-[12px] font-bold uppercase tracking-wider">{t('task.deadline')}</span>
                </div>
                <div className="flex items-center gap-2">
                   <input
                    type="date"
                    disabled={readOnly}
                    aria-label="Set task deadline"
                    className="bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-[14px] font-medium outline-none focus:ring-2 focus:ring-brand-accent/20 w-full text-brand-text-main"
                    value={task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      const date = e.target.value ? new Date(e.target.value).getTime() : undefined;
                      handleUpdate({ deadline: date });
                    }}
                  />
                  {task.deadline && (
                    <button
                      onClick={() => handleUpdate({ deadline: undefined })}
                      disabled={readOnly}
                      className="px-3 py-2 text-[12px] font-bold text-brand-text-main hover:text-red-500 bg-brand-surface-hover rounded-lg transition-colors"
                      aria-label="Remove deadline"
                    >
                      {t('common.clear')}
                    </button>
                  )}
                </div>
                {task.deadline && isPast(task.deadline) && task.status !== 'done' && (
                  <div className="flex items-center gap-2 text-red-500 mt-1">
                    <AlertCircle className="w-3 h-3" />
                    <span className="text-[11px] font-bold uppercase tracking-wider">{t('task.isOverdue')}</span>
                  </div>
                )}
              </section>

              {/* Description Section */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-brand-text-muted">
                  <AlignLeft className="w-4 h-4" />
                  <span className="text-[12px] font-bold uppercase tracking-wider">{t('task.description')}</span>
                </div>
                <textarea
                  readOnly={readOnly}
                  rows={6}
                  className={cn(
                    "w-full text-[14px] leading-relaxed text-brand-text-muted bg-brand-surface-hover/30 border border-brand-border/50 rounded-xl p-4 outline-none transition-all resize-none font-sans",
                    !readOnly && "focus:bg-brand-surface focus:border-brand-accent/30 focus:shadow-sm focus:ring-4 focus:ring-brand-accent/5"
                  )}
                  placeholder={readOnly ? t('task.noDescription') : t('task.descriptionPlaceholder')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onBlur={() => description.trim() !== (task.description || '') && handleUpdate({ description: description.trim() })}
                />
              </section>

              {/* Attachments Section */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-brand-text-muted">
                    <Paperclip className="w-4 h-4" />
                    <span className="text-[12px] font-bold uppercase tracking-wider">{t('task.attachments')}</span>
                  </div>
                  {!readOnly && <AttachmentButton projectId={task.projectId} taskId={task.id} />}
                </div>
                <AttachmentGrid projectId={task.projectId} taskId={task.id} attachments={task.attachments} readOnly={readOnly} />
              </section>

              {/* Comments Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-brand-text-muted">
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-[12px] font-bold uppercase tracking-wider">{t('task.comments')}</span>
                </div>
                
                <div className="flex flex-col gap-3">
                  {comments.length === 0 ? (
                    <p className="text-[12px] text-brand-text-muted italic">{t('task.noComments')}</p>
                  ) : (
                    comments.map(comment => (
                      <div key={comment.id} className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-accent/10 flex items-center justify-center shrink-0 overflow-hidden">
                          {comment.userPhotoURL ? (
                            <img src={comment.userPhotoURL} alt={comment.userName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="text-[12px] font-bold text-brand-accent uppercase">{comment.userName[0]}</span>
                          )}
                        </div>
                        <div className="flex-1 bg-brand-surface-hover/50 border border-brand-border/50 rounded-xl rounded-tl-none p-3 shadow-sm min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] font-bold text-brand-text-main truncate pr-2">{comment.userName}</span>
                            <span className="text-[10px] text-brand-text-muted shrink-0">
                              {formatDistanceToNow(comment.createdAt, { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-[13px] text-brand-text-muted whitespace-pre-wrap leading-relaxed break-words">{comment.text}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {!readOnly && (
                  <form onSubmit={handleAddComment} className="flex gap-2 items-end pt-2">
                    <div className="relative flex-1">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder={t('task.writeCommentPlaceholder')}
                        className="w-full text-[13px] text-brand-text-main bg-brand-surface border border-brand-border rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-brand-accent/20 min-h-[40px] max-h-[120px] resize-y"
                        rows={1}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAddComment(e);
                          }
                        }}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!newComment.trim() || isSubmittingComment}
                      className="shrink-0 w-10 h-10 rounded-xl bg-brand-accent hover:bg-brand-accent/90 text-white flex items-center justify-center disabled:opacity-50 transition-colors shadow-md"
                    >
                      {isSubmittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-[2px]" />}
                    </button>
                  </form>
                )}
              </section>

              {/* History Section */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-brand-text-muted">
                  <History className="w-4 h-4" />
                  <span className="text-[12px] font-bold uppercase tracking-wider">{t('task.history')}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {logs.length === 0 ? (
                    <p className="text-[12px] text-brand-text-muted italic">{t('task.noHistory')}</p>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="text-[12px] p-3 rounded-lg bg-brand-surface-hover/30 border border-brand-border/50">
                        <p className="text-brand-text-main break-words">
                          <span className="font-bold">{log.userName}</span> {log.type === 'task_created' ? t('task.action.created') : t('task.action.updated')} {t('task.task')}
                          {log.details && <span className="block italic opacity-70 text-[11px] mt-0.5 break-words">{log.details}</span>}
                        </p>
                        <p className="text-brand-text-muted text-[10px] uppercase font-bold mt-1.5">
                           {formatDistanceToNow(log.timestamp, { addSuffix: true })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            <div className="p-6 border-t border-brand-border bg-brand-surface-hover/50">
              <div className="flex items-center justify-between text-[11px] text-brand-text-muted font-medium">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3" />
                    <span>{t('task.createdDate', { date: format(task.createdAt, 'MMM d, yyyy') })}</span>
                  </div>
                  {isSaving && (
                    <div className="flex items-center gap-1.5 text-brand-accent/70">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">{t('common.saving')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
