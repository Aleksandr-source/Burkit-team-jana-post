import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Project } from '../types';
import { updateProject } from '../lib/services';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'motion/react';
import { X, Target, Save, Calendar, BarChart3 } from 'lucide-react';

interface ProjectGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
}

export function ProjectGoalModal({ isOpen, onClose, project }: ProjectGoalModalProps) {
  const { t } = useTranslation();
  const [goalTitle, setGoalTitle] = useState(project.goalTitle || '');
  const [goalSuccessMetric, setGoalSuccessMetric] = useState(project.goalSuccessMetric || '');
  const [goalDeadline, setGoalDeadline] = useState(
    project.goalDeadline ? new Date(project.goalDeadline).toISOString().split('T')[0] : ''
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateProject(project.id, {
        goalTitle: goalTitle.trim(),
        goalSuccessMetric: goalSuccessMetric.trim(),
        goalDeadline: goalDeadline ? new Date(goalDeadline).getTime() : undefined,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save project goal:', error);
      alert(t('project.saveGoalFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 surface-backdrop"
            style={{ WebkitBackdropFilter: 'blur(16px)' }}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="surface w-full max-w-[480px] rounded-2xl overflow-hidden shadow-xl relative z-[9999]"
          >
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-brand-accent/10 flex items-center justify-center text-brand-accent shadow-sm">
                    <Target size={24} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-brand-text-main tracking-tight uppercase">{t('project.objective')}</h2>
                    <p className="text-brand-text-muted text-[12px] font-bold uppercase tracking-wider opacity-60">{t('project.objectiveDesc')}</p>
                  </div>
                </div>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-brand-surface-hover rounded-xl transition-colors text-brand-text-muted hover:text-brand-text-main active:scale-95"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-8">
                <div className="space-y-2">
                  <label className="block text-[11px] font-black text-brand-text-muted uppercase tracking-widest mb-1 ml-1">
                    {t('project.primaryResultLabel')}
                  </label>
                  <div className="group relative">
                    <input
                      type="text"
                      value={goalTitle}
                      onChange={(e) => setGoalTitle(e.target.value)}
                      placeholder={t('project.primaryResultPlaceholder')}
                      className="w-full px-5 py-4 bg-brand-surface-hover border border-brand-border rounded-xl focus:outline-none focus:ring-4 focus:ring-brand-accent/5 focus:border-brand-accent transition-all font-bold text-brand-text-main"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <div className="space-y-2">
                    <label className="block text-[11px] font-black text-brand-text-muted uppercase tracking-widest mb-1 ml-1">
                      {t('project.successMetricLabel')}
                    </label>
                    <div className="relative">
                      <BarChart3 size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-brand-text-muted" />
                      <input
                        type="text"
                        value={goalSuccessMetric}
                        onChange={(e) => setGoalSuccessMetric(e.target.value)}
                        placeholder={t('project.successMetricPlaceholder')}
                        className="w-full pl-14 pr-5 py-4 bg-brand-surface-hover border border-brand-border rounded-xl focus:outline-none focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 transition-all font-bold text-brand-text-main"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-black text-brand-text-muted uppercase tracking-widest mb-1 ml-1">
                      {t('task.deadline')}
                    </label>
                    <div className="relative">
                      <Calendar size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-brand-text-muted" />
                      <input
                        type="date"
                        value={goalDeadline}
                        onChange={(e) => setGoalDeadline(e.target.value)}
                        className="w-full pl-14 pr-5 py-4 bg-brand-surface-hover border border-brand-border rounded-xl focus:outline-none focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/5 transition-all font-bold text-brand-text-main"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 bg-brand-surface-hover border-t border-brand-border flex items-center justify-end gap-3">
              <button 
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-[14px] font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving || !goalTitle.trim()}
                className="bg-blue-500 hover:bg-blue-600 text-white rounded-lg px-4 py-2 flex items-center justify-center gap-2 text-[14px] font-bold transition-all disabled:opacity-50"
              >
                {isSaving ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save size={18} />
                )}
                {t('project.commitGoal')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
