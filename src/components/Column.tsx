import React, { useState } from 'react';
import { createTask } from '../lib/services';
import { X, User, Calendar, Flag, Plus, Clipboard, Zap, CheckCircle, Layout, AlignLeft, Type, Target, ClipboardList } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useTranslation } from 'react-i18next';
import { getMilestones } from '../lib/milestones';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Task, TaskStatus, Member } from '../types';
import { TaskItem } from './TaskItem';
import { Select } from './ui/Select';

interface ColumnProps {
  column: {
    id: TaskStatus;
    title: string;
    tasks: Task[];
  };
  projectId: string;
  members: Member[];
  readOnly?: boolean;
  onTaskClick?: (task: Task) => void;
  key?: React.Key;
}

interface ColumnEmptyStateProps {
  status: TaskStatus;
  readOnly?: boolean;
}

function ColumnEmptyState({ status }: ColumnEmptyStateProps) {
  const { t } = useTranslation();
  const config = {
    'todo': {
      icon: Clipboard,
      title: t("task.empty.todo"),
      desc: t("task.empty.todoDesc"),
      iconColor: "text-blue-500",
      bgColor: "bg-blue-500/10",
      decorIcon: ClipboardList
    },
    'in-progress': {
      icon: Zap,
      title: t("task.empty.inProgress"),
      desc: t("task.empty.inProgressDesc"),
      iconColor: "text-orange-500",
      bgColor: "bg-orange-500/10",
      decorIcon: Zap
    },
    'done': {
      icon: CheckCircle,
      title: t("task.empty.done"),
      desc: t("task.empty.doneDesc"),
      iconColor: "text-green-500",
      bgColor: "bg-green-500/10",
      decorIcon: CheckCircle
    }
  }[status] || {
    icon: Layout,
    title: t("task.empty.column"),
    desc: t("task.empty.columnDesc"),
    iconColor: "text-brand-text-muted",
    bgColor: "bg-brand-surface-hover",
    decorIcon: Layout
  };

  const Icon = config.icon;
  const DecorIcon = config.decorIcon;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-12 px-6 min-h-[220px] border-2 border-dashed border-brand-border rounded-2xl bg-brand-surface-hover/30 transition-all duration-300 relative group/empty-state gap-4"
    >
      {/* Decorative background icons */}
      <DecorIcon className="absolute -right-4 -bottom-4 w-24 h-24 text-brand-text-main opacity-[0.03] -rotate-12 transition-transform duration-500 group-hover/empty-state:scale-110 group-hover/empty-state:rotate-0" />
      <DecorIcon className="absolute -left-6 -top-6 w-20 h-20 text-brand-text-main opacity-[0.02] rotate-45 transition-transform duration-500 group-hover/empty-state:scale-110" />

      <div className={cn("w-14 h-14 rounded-full flex items-center justify-center shadow-sm transition-transform duration-300 group-hover/empty-state:scale-110", config.bgColor)}>
        <Icon className={cn("w-7 h-7", config.iconColor)} />
      </div>
      
      <h3 className="text-[16px] font-semibold text-brand-text-main text-center">
        {config.title}
      </h3>
      <p className="text-[13px] text-brand-text-muted text-center leading-relaxed max-w-[220px]">
        {config.desc}
      </p>
    </motion.div>
  );
}

export function Column({ column, projectId, members, readOnly, onTaskClick }: ColumnProps) {
  const { t } = useTranslation();
  const { user, displayName } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  const handleCreateTask = async (taskData: { 
    title: string; 
    description: string; 
    assigneeId: string; 
    deadline: string; 
    priority: 'low' | 'medium' | 'high' 
  }) => {
    if (!user) return;
    
    const assignedMember = members.find(m => m.userId === taskData.assigneeId);
    
    await createTask(projectId, taskData.title, -1, user.uid, displayName || t('common.user'), {
      description: taskData.description,
      assignedUserId: taskData.assigneeId === 'unassigned' ? undefined : taskData.assigneeId,
      assignedUserName: assignedMember?.name,
      deadline: taskData.deadline ? new Date(taskData.deadline).getTime() : undefined,
      priority: taskData.priority,
      status: column.id
    });
    
    setIsModalOpen(false);
  };

  const statusStyles = {
    'todo': {
      header: 'text-brand-text-muted',
      dot: 'bg-brand-text-muted',
      bg: 'bg-brand-surface',
      border: 'border-brand-border',
      accent: 'bg-brand-surface-hover'
    },
    'in-progress': {
      header: 'text-blue-500',
      dot: 'bg-blue-500',
      bg: 'bg-brand-surface',
      border: 'border-brand-border',
      accent: 'bg-blue-500/10'
    },
    'done': {
      header: 'text-emerald-500',
      dot: 'bg-emerald-500',
      bg: 'bg-brand-surface',
      border: 'border-brand-border',
      accent: 'bg-emerald-500/10'
    }
  }[column.id] || {
    header: 'text-brand-text-main',
    dot: 'bg-brand-text-muted',
    bg: 'bg-brand-surface',
    border: 'border-brand-border',
    accent: 'bg-brand-surface-hover'
  };

  const statusBorderColor = {
    'todo': 'border-t-brand-text-muted',
    'in-progress': 'border-t-blue-500',
    'done': 'border-t-emerald-500',
  }[column.id] || 'border-t-brand-text-muted';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className={cn(
        "group/empty flex flex-col relative w-full h-auto max-w-full box-border min-h-min bg-brand-surface rounded-xl border border-brand-border overflow-hidden transition-all duration-200 p-3 shadow-sm",
        "border-t-4", statusBorderColor,
        isOver && "ring-2 ring-brand-accent/20 bg-brand-accent/[0.02]"
      )}
    >
      <div className="flex items-center justify-between pb-3">
        <div className="flex items-center gap-2.5">
          <div className={cn("w-1.5 h-1.5 rounded-full", statusStyles.dot)} />
          <h2 className={cn("text-[14px] font-semibold text-brand-text-main tracking-tight transition-colors group-hover/empty:text-brand-accent")}>{column.title}</h2>
          <span className={cn("px-1.5 py-0.5 rounded-md font-semibold text-[11px] text-brand-text-muted bg-brand-surface shadow-sm transition-transform group-hover/empty:scale-110")}>
            {column.tasks.length}
          </span>
        </div>
        {!readOnly && (
           <button
            onClick={() => setIsModalOpen(true)}
            className="p-1.5 text-brand-text-muted hover:text-brand-text-main hover:bg-brand-surface rounded-md transition-all active:scale-90 group-hover/empty:rotate-[5deg] group-hover/empty:scale-110"
            aria-label={t('task.createNewTask')}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div
        ref={setNodeRef}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        className={cn(
          "flex flex-col gap-2 min-w-0 w-full max-w-full box-border transition-colors duration-300",
          isOver && "bg-brand-accent/[0.02]"
        )}
      >
        <SortableContext
          items={column.tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {column.tasks.map((task) => (
            <TaskItem 
              key={task.id} 
              task={task} 
              members={members}
              readOnly={readOnly} 
              onClick={() => onTaskClick?.(task)} 
            />
          ))}
          
          {column.tasks.length === 0 && (
            <ColumnEmptyState status={column.id} readOnly={readOnly} />
          )}
        </SortableContext>
      </div>

      <CreateTaskModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateTask}
        members={members}
      />
    </motion.div>
  );
}

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { 
    title: string; 
    description: string; 
    assigneeId: string; 
    deadline: string; 
    priority: 'low' | 'medium' | 'high';
    milestoneId?: string;
  }) => void;
  members: Member[];
}

export function CreateTaskModal({ isOpen, onClose, onSubmit, members }: CreateTaskModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('unassigned');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [milestoneId, setMilestoneId] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title, description, assigneeId, deadline, priority, milestoneId: milestoneId || undefined });
    // Reset form
    setTitle('');
    setDescription('');
    setAssigneeId('unassigned');
    setDeadline('');
    setPriority('medium');
    setMilestoneId('');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full h-full sm:h-auto sm:max-h-[90vh] max-w-[500px] bg-brand-surface sm:rounded-[24px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col border border-brand-border"
        >
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-brand-border h-[64px] shrink-0 bg-brand-surface-hover/30">
            <h2 className="text-[17px] font-black text-brand-text-main flex items-center gap-3 uppercase tracking-tight">
              <div className="w-8 h-8 bg-brand-accent/10 rounded-lg flex items-center justify-center text-brand-accent shadow-sm">
                <Plus className="w-4 h-4" />
              </div>
              {t('task.createNewTask')}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-brand-surface-hover rounded-lg transition-colors text-brand-text-muted hover:text-brand-text-main active:scale-95 border border-transparent hover:border-brand-border"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-5">
            <div className="space-y-1">
              <label className="text-[12px] font-black text-brand-text-muted opacity-60 uppercase tracking-widest flex items-center gap-2 ml-1">
                <Type className="w-3.5 h-3.5" />
                {t('task.title')}
              </label>
              <input
                autoFocus
                required
                className="w-full h-10 px-3 bg-brand-bg border border-brand-border rounded-xl text-[14px] font-bold text-brand-text-main outline-none focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 transition-all shadow-sm"
                placeholder={t('task.titlePlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-[12px] font-black text-brand-text-muted opacity-60 uppercase tracking-widest flex items-center gap-2 ml-1">
                <AlignLeft className="w-3.5 h-3.5" />
                {t('task.description')}
              </label>
              <textarea
                className="w-full min-h-[80px] md:min-h-[100px] px-3 py-2 bg-brand-bg border border-brand-border rounded-xl text-[14px] font-medium leading-relaxed text-brand-text-main outline-none focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 transition-all resize-none shadow-sm"
                placeholder={t('task.descriptionPlaceholder')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[12px] font-black text-brand-text-muted opacity-60 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <User className="w-3.5 h-3.5" />
                  {t('task.assignee')}
                </label>
                <Select
                  value={assigneeId}
                  onChange={setAssigneeId}
                  options={[
                    { value: "unassigned", label: t('task.unassigned') },
                    ...members.map(m => ({ value: m.userId, label: m.name }))
                  ]}
                  className="h-10 bg-brand-bg border-brand-border text-[13px] font-bold text-brand-text-main"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[12px] font-black text-brand-text-muted opacity-60 uppercase tracking-widest flex items-center gap-2 ml-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {t('task.deadline')}
                </label>
                <input
                  type="date"
                  className="w-full h-10 px-3 bg-brand-bg border border-brand-border rounded-xl text-[13px] font-bold text-brand-text-main outline-none focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 transition-all cursor-pointer shadow-sm"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-black text-brand-text-muted opacity-60 uppercase tracking-widest flex items-center gap-2 ml-1">
                <Flag className="w-3.5 h-3.5" />
                {t('task.priority')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={cn(
                      "h-8 py-0 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all border shadow-sm",
                      priority === p 
                        ? p === 'high' ? "bg-red-500 border-red-500 text-white shadow-red-500/20" :
                          p === 'medium' ? "bg-brand-accent border-brand-accent text-white shadow-brand-accent/20" :
                          "bg-blue-500 border-blue-500 text-white shadow-blue-500/20"
                        : "bg-brand-bg border-brand-border text-brand-text-muted hover:bg-brand-surface-hover hover:border-brand-border/80"
                    )}
                  >
                    {t(`task.${p}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[12px] font-black text-brand-text-muted opacity-60 uppercase tracking-widest flex items-center gap-2 ml-1">
                <Target className="w-3.5 h-3.5" />
                {t('journey.targetDetails', { defaultValue: 'Milestone' })}
              </label>
              <Select
                value={milestoneId}
                onChange={setMilestoneId}
                options={[
                  { value: "", label: t('common.none', { defaultValue: 'None' }) },
                  ...getMilestones(t).map((m) => ({ value: m.id, label: m.title }))
                ]}
                className="h-10 bg-brand-bg border-brand-border text-[13px] font-bold text-brand-text-main"
              />
            </div>
          </form>

          <div className="p-4 md:p-6 border-t border-brand-border flex items-center justify-end gap-3 bg-brand-surface-hover/30">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[14px] font-bold text-brand-text-muted hover:text-brand-text-main transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={!title.trim()}
              className="px-6 py-2 bg-brand-accent text-white rounded-lg text-[14px] font-black hover:bg-brand-accent/90 shadow-lg shadow-brand-accent/20 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            >
              {t('task.createTask')}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
