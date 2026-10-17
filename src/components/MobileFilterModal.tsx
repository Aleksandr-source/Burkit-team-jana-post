import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Flag, Calendar, Check, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { Button } from './ui/Button';
import { Member } from '../types';

interface MobileFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  assigneeId: string;
  setAssigneeId: (id: string) => void;
  priorityFilter: string;
  setPriorityFilter: (priority: string) => void;
  deadlineFilter: string;
  setDeadlineFilter: (deadline: string) => void;
  members: Member[];
  onReset: () => void;
}

export function MobileFilterModal({
  isOpen,
  onClose,
  assigneeId,
  setAssigneeId,
  priorityFilter,
  setPriorityFilter,
  deadlineFilter,
  setDeadlineFilter,
  members,
  onReset
}: MobileFilterModalProps) {
  const { t } = useTranslation();
  // Temporary state to allow "Apply" pattern if desired, 
  // but for now we'll update parent state directly for simplicity 
  // or use local state and then apply.
  // The requirement says "Apply" and "Reset" buttons at the bottom.
  
  const [localAssignee, setLocalAssignee] = useState(assigneeId);
  const [localPriority, setLocalPriority] = useState(priorityFilter);
  const [localDeadline, setLocalDeadline] = useState(deadlineFilter);

  // Sync with parent when opened
  React.useEffect(() => {
    if (isOpen) {
      setLocalAssignee(assigneeId);
      setLocalPriority(priorityFilter);
      setLocalDeadline(deadlineFilter);
    }
  }, [isOpen, assigneeId, priorityFilter, deadlineFilter]);

  const handleApply = () => {
    setAssigneeId(localAssignee);
    setPriorityFilter(localPriority);
    setDeadlineFilter(localDeadline);
    onClose();
  };

  const handleReset = () => {
    setLocalAssignee('all');
    setLocalPriority('all');
    setLocalDeadline('all');
    onReset();
    onClose();
  };

  const priorityOptions = [
    { id: 'all', label: t('task.anyPriority') },
    { id: 'low', label: t('task.low'), color: 'bg-blue-500' },
    { id: 'medium', label: t('task.medium'), color: 'bg-brand-accent' },
    { id: 'high', label: t('task.high'), color: 'bg-red-500' }
  ];

  const deadlineOptions = [
    { id: 'all', label: t('task.anyDeadline') },
    { id: 'overdue', label: t('task.overdueFilter') },
    { id: 'upcoming', label: t('task.dueThisWeek') },
    { id: 'no-deadline', label: t('task.noDeadline') }
  ];

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9990] flex items-end sm:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 surface-backdrop"
            style={{ WebkitBackdropFilter: 'blur(16px)' }}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-brand-surface rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-[9999]"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-brand-border bg-brand-surface-hover/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-accent/10 rounded-2xl flex items-center justify-center text-brand-accent">
                  <Flag className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-[17px] font-bold text-brand-text-main">{t('task.filterTasks')}</h2>
                  <p className="text-[11px] text-brand-text-muted font-medium uppercase tracking-wider">{t('task.filterRefineView')}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-neutral-100 rounded-full transition-colors text-brand-text-muted hover:text-brand-text-main"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-32">
              {/* Assignee Section */}
              <section className="space-y-4">
                <label className="text-[11px] font-bold text-brand-text-muted uppercase tracking-wider flex items-center gap-2 px-1">
                  <User className="w-4 h-4" />
                  {t('task.assignee')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <FilterOption 
                    active={localAssignee === 'all'} 
                    onClick={() => setLocalAssignee('all')}
                    label={t('task.allMembers')}
                  />
                  {members.map(member => (
                    <FilterOption 
                      key={member.userId}
                      active={localAssignee === member.userId}
                      onClick={() => setLocalAssignee(member.userId)}
                      label={member.name}
                    />
                  ))}
                </div>
              </section>

              {/* Priority Section */}
              <section className="space-y-4">
                <label className="text-[11px] font-bold text-brand-text-muted uppercase tracking-wider flex items-center gap-2 px-1">
                  <Flag className="w-4 h-4" />
                  {t('task.priority')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {priorityOptions.map(opt => (
                    <FilterOption 
                      key={opt.id}
                      active={localPriority === opt.id}
                      onClick={() => setLocalPriority(opt.id)}
                      label={opt.label}
                      dotColor={opt.color}
                    />
                  ))}
                </div>
              </section>

              {/* Deadline Section */}
              <section className="space-y-4">
                <label className="text-[11px] font-bold text-brand-text-muted uppercase tracking-wider flex items-center gap-2 px-1">
                  <Calendar className="w-4 h-4" />
                  {t('task.deadline')}
                </label>
                <div className="space-y-2">
                  {deadlineOptions.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setLocalDeadline(opt.id)}
                      className={cn(
                        "w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border transition-all text-sm font-bold",
                        localDeadline === opt.id 
                          ? "bg-brand-accent/5 border-brand-accent text-brand-accent" 
                          : "bg-brand-surface-hover border-brand-border text-brand-text-main hover:bg-brand-surface-hover/80"
                      )}
                    >
                      {opt.label}
                      {localDeadline === opt.id && <Check className="w-4 h-4" />}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* Sticky Footer */}
            <div className="absolute bottom-0 inset-x-0 p-6 pt-4 bg-brand-surface border-t border-brand-border grid grid-cols-2 gap-3">
              <Button
                variant="danger"
                size="lg"
                fullWidth
                onClick={handleReset}
                leftIcon={<RotateCcw className="w-4 h-4" />}
                className="rounded-2xl py-6 border-red-100 bg-red-50/50 text-red-500 hover:bg-red-50"
              >
                {t('common.reset')}
              </Button>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={handleApply}
                className="rounded-2xl py-6"
              >
                {t('task.applyFilters')}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function FilterOption({ 
  active, 
  onClick, 
  label, 
  dotColor 
}: { 
  active: boolean; 
  onClick: () => void; 
  label: string;
  dotColor?: string;
  key?: React.Key;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all text-[13px] font-bold",
        active 
          ? "bg-brand-accent text-white border-brand-accent shadow-md shadow-brand-accent/20" 
          : "bg-brand-surface border-brand-border text-brand-text-main hover:bg-brand-surface-hover"
      )}
    >
      {dotColor && !active && (
        <div className={cn("w-2 h-2 rounded-full", dotColor)} />
      )}
      <span className="truncate">{label}</span>
      {active && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
    </button>
  );
}
