import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, RotateCcw, X, AlertCircle, Clock } from 'lucide-react';
import { Task } from '../types';
import { subscribeTrashTasks, restoreTask, permanentlyDeleteTask } from '../lib/services';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/ToastContext';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { ru, enUS as en, kk } from 'date-fns/locale';

interface TrashPanelProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TrashPanel({ projectId, isOpen, onClose }: TrashPanelProps) {
  const { t, i18n } = useTranslation();
  const { user, displayName } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [confirmTaskId, setConfirmTaskId] = useState<string | null>(null);

  const dateLocales: Record<string, typeof ru> = { ru, en, kk };
  const currentLocale = dateLocales[i18n.language.split('-')[0]] || en;

  useEffect(() => {
    if (isOpen && projectId) {
      return subscribeTrashTasks(projectId, setTasks);
    }
  }, [isOpen, projectId]);

  const handleRestore = async (task: Task) => {
    if (!user) return;
    try {
      await restoreTask(projectId, task.id, user.uid, displayName || t('common.user'), task.title);
      toast(t('task.restored', { defaultValue: 'Task restored successfully' }), 'success');
    } catch {
      toast(t('task.restoreFailed'), 'error');
    }
  };

  const handleDeletePermanent = async (task: Task) => {
    setConfirmTaskId(task.id);
  };

  const confirmDelete = async (task: Task) => {
    setConfirmTaskId(null);
    if (!user) return;
    try {
      await permanentlyDeleteTask(projectId, task.id, user.uid, displayName || t('common.user'), task.title);
      toast(t('task.deletedPermanently', { defaultValue: 'Task permanently deleted' }), 'success');
    } catch {
      toast(t('task.deletePermanentFailed'), 'error');
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-[9990]"
          />
          <motion.div
            initial={{ x: '20px', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '20px', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-[480px] bg-white text-gray-900 dark:bg-[#020617] dark:text-white z-[9999] flex flex-col border-l border-gray-200 dark:border-white/10"
          >
            <div className="flex items-center justify-between p-8 border-b border-gray-200 dark:border-white/10 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 shadow-sm border border-red-100">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-[20px] font-black tracking-tight uppercase text-gray-900 dark:text-white">{t('task.trashBin')}</h2>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                    {t('task.itemsDeletedCount', { count: tasks.length })}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2.5 hover:bg-gray-200 rounded-xl transition-colors text-gray-400 hover:text-gray-600 active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-3 custom-scrollbar pb-32">
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-4 border border-dashed border-gray-200">
                    <Trash2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-[15px] font-bold text-gray-900 dark:text-white mb-1">{t('task.emptyTrashTitle')}</h3>
                  <p className="text-[12px] text-gray-500 dark:text-gray-400 max-w-[200px]">
                    {t('task.emptyTrashDesc')}
                  </p>
                </div>
              ) : (
                tasks.map((task) => (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-white border border-gray-200 dark:bg-white/5 dark:border-white/10 rounded-xl transition-all duration-200 ease-out hover:bg-gray-50 dark:hover:bg-white/10 hover:translate-x-0.5 relative overflow-hidden"
                  >
                    <div className="flex justify-between items-center gap-3">
                      <div className="min-w-0 flex-1 group/item">
                        <h4 className="text-[14px] font-bold text-gray-900 dark:text-white line-through truncate transition-colors">
                          {task.title}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-1 text-[13px] text-gray-600 dark:text-gray-400 group-hover/item:text-gray-900 dark:group-hover/item:text-white transition-colors">
                          <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 group-hover/item:text-gray-600 dark:group-hover/item:text-gray-400 transition-colors shrink-0" />
                          <p className="truncate">
                            <span className="text-[12px] text-gray-500 dark:text-gray-400 font-medium group-hover/item:text-gray-600 dark:group-hover/item:text-gray-400 transition-colors">{t('task.deleted')} </span>
                            <span className="font-semibold text-gray-800 dark:text-gray-300 group-hover/item:text-gray-900 dark:group-hover/item:text-white transition-colors">
                               {task.deletedAt ? format(task.deletedAt, 'd MMM, HH:mm', { locale: currentLocale }) : t('common.unknown')}
                            </span>
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleRestore(task)}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-bold text-blue-500 bg-indigo-50 hover:bg-indigo-100 rounded-[10px] transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          {t('task.restore')}
                        </button>
                        <button
                          onClick={() => handleDeletePermanent(task)}
                          className="flex px-2.5 items-center justify-center py-2 text-[12px] font-bold text-red-500 bg-transparent hover:bg-red-50 rounded-[10px] transition-colors"
                          title={t('task.deletePermanently')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Confirm Dialog Overlay */}
                      {confirmTaskId === task.id && (
                        <div className="absolute inset-0 bg-white/95 dark:bg-[#020617]/95 backdrop-blur-sm z-10 flex items-center justify-between px-4 border border-red-100 dark:border-red-900/30 rounded-xl">
                          <p className="text-gray-900 dark:text-white font-bold text-xs">{t('task.deletePermanentConfirm', { title: task.title })}</p>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => setConfirmTaskId(null)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 transition-colors"
                            >
                              {t('common.cancel')}
                            </button>
                            <button 
                              onClick={() => confirmDelete(task)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-red-500 hover:bg-red-600 shadow-sm transition-colors"
                            >
                              {t('common.confirmAction')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {tasks.length > 0 && (
              <div className="p-6 border-t border-gray-200 dark:border-white/10 shrink-0">
                <div className="flex items-start gap-3 p-4 bg-orange-50 rounded-[12px] border border-orange-100 text-orange-800">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-[12px] font-medium leading-relaxed">
                    {t('task.trashWarning')}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
