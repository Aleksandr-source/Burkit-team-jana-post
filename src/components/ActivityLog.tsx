import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ActivityLog as ActivityLogType } from '../types';
import { subscribeActivityLog } from '../lib/services';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { 
  History, 
  X, 
  Check,
  Pencil, 
  Trash2, 
  UserCog, 
  CheckCircle2, 
  Clock 
} from 'lucide-react';

interface ActivityLogProps {
  projectId: string;
  onClose: () => void;
  isOpen: boolean;
}

export function ActivityLog({ projectId, onClose, isOpen }: ActivityLogProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<ActivityLogType[]>([]);

  useEffect(() => {
    if (isOpen) {
      return subscribeActivityLog(projectId, setLogs);
    }
  }, [projectId, isOpen]);

  const getActivityIcon = (type: ActivityLogType['type']) => {
    switch (type) {
      case 'task_created': return <Check className="w-3.5 h-3.5 text-green-500" />;
      case 'task_updated': return <Pencil className="w-3.5 h-3.5 text-blue-500" />;
      case 'task_deleted': return <Trash2 className="w-3.5 h-3.5 text-red-500" />;
      case 'member_role_changed': return <UserCog className="w-3.5 h-3.5 text-purple-500" />;
      case 'project_created': return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
      default: return <Clock className="w-3.5 h-3.5 text-neutral-400" />;
    }
  };

  const formatActivityMessage = (log: ActivityLogType) => {
    const actor = log.userName;
    const entity = log.entityName ? `"${log.entityName}"` : '';

    return (
      <span className="text-gray-900 dark:text-white font-medium">
        {t(`history.messages.${log.type}` as string, { 
          actor, 
          entity, 
          details: log.details || '',
          defaultValue: t('history.messages.default', { actor })
        })}
      </span>
    );
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
            className="fixed right-0 top-0 bottom-0 w-[340px] bg-white text-gray-900 dark:bg-[#020617] dark:text-white flex flex-col z-[9999] border-l border-gray-200 dark:border-white/10"
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-gray-900 dark:text-white">{t('common.history')}</h2>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">{t('history.recentEvents')}</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-md transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 select-none">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-center text-gray-500 opacity-80">
                  <Clock className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-[13px] font-medium">{t('history.noActivity')}</p>
                </div>
              ) : (
                logs.map((log) => (
                  <div 
                    key={log.id} 
                    className="p-3 bg-white border border-gray-200 dark:bg-white/5 dark:border-white/10 rounded-xl flex gap-3 transition-all duration-200 ease-out hover:bg-gray-50 dark:hover:bg-white/10 hover:translate-x-0.5"
                  >
                    <div className="shrink-0 mt-0.5">
                      <div className="w-8 h-8 rounded-full bg-white dark:bg-white/5 shadow-sm border border-gray-100 dark:border-white/10 flex items-center justify-center">
                        {getActivityIcon(log.type)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] leading-[1.6]">
                        {formatActivityMessage(log)}
                      </p>
                      <div className="flex items-center gap-1.5 mt-2 opacity-60">
                        <Clock className="w-2.5 h-2.5" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          {formatDistanceToNow(log.timestamp, { addSuffix: true, locale: ru })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="p-4 border-t border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5">
              <p className="text-[10px] text-center text-gray-500 dark:text-gray-400 font-bold uppercase tracking-widest">
                {t('history.endOfHistory')}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
