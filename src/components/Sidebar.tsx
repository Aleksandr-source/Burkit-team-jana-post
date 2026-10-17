import { useEffect, useState } from 'react';
import { Project } from '../types';
import { useAuth } from '../lib/AuthContext';
import { subscribeProjects, createProject } from '../lib/services';
import { Plus } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSidebar } from '../lib/SidebarContext';
import { cn } from '../lib/utils';
import { SidebarHeader, SidebarProjects } from './SidebarComponents';
import { motion, AnimatePresence } from 'motion/react';

import { useToast } from '../lib/ToastContext';

export function Sidebar() {
  const { user, displayName } = useAuth();
  const { t } = useTranslation();
  const { collapsed, setCollapsed, isMobileOpen, setIsMobileOpen } = useSidebar();
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { projectId } = useParams();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) {
      setProjects([]);
      return;
    }
    return subscribeProjects(user.uid, setProjects);
  }, [user]);

  // Handle body scroll locking
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileOpen]);

  const handleCreate = async () => {
    if (!user) return;
    const name = newProjectName.trim();
    if (!name) return;
    try {
      setIsCreating(true);
      await createProject(name, user.uid, displayName || 'User', user.photoURL || undefined);
      setNewProjectName('');
      toast(t('sidebar.projectCreated', { defaultValue: 'Project created successfully' }), 'success');
      if (window.innerWidth < 768) setIsMobileOpen(false);
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : t('sidebar.projectCreateFailed', { defaultValue: 'Failed to create project' }), 'error');
    } finally {
      setIsCreating(false);
    }
  };

  if (!user) return null;

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] md:hidden"
            onClick={() => setIsMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={false}
        animate={{ 
          x: isMobileOpen || window.innerWidth >= 768 ? 0 : '-100%',
          width: collapsed ? 72 : 260
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={cn(
          "fixed top-0 bottom-0 left-0 flex flex-col z-[110] max-h-screen overflow-hidden bg-brand-sidebar border-r border-brand-border shadow-[2px_0_12px_rgba(0,0,0,0.02)] transition-colors",
          collapsed ? "py-4 px-2" : "py-5 px-4"
        )}
      >
        <SidebarHeader 
          collapsed={collapsed} 
          onToggle={() => setCollapsed(!collapsed)}
        />
        
        <SidebarProjects projects={projects} projectId={projectId} collapsed={collapsed} t={t} />

        {collapsed ? (
          <div className="mt-2 pt-4 flex flex-col items-center">
            <div className="group relative">
              <button 
                onClick={() => setCollapsed(false)}
                className="w-10 h-10 rounded-[14px] flex items-center justify-center text-brand-text-muted bg-brand-surface-hover hover:text-brand-accent hover:bg-brand-accent/10 transition-all duration-200 outline-none"
              >
                <Plus className="w-5 h-5" />
              </button>
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-4 px-3 py-2 bg-brand-surface text-brand-text-main text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-[100] shadow-md border border-brand-border transition-all duration-200 translate-x-1 group-hover:translate-x-0">
                {t('sidebar.addProject')}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-auto pt-6 space-y-3">
            <div className="px-1">
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder={t('sidebar.newProject')}
                className="w-full px-4 py-2.5 text-[13px] bg-brand-surface-hover border border-brand-border rounded-[12px] text-brand-text-main placeholder:text-brand-text-muted outline-none focus:ring-2 focus:ring-brand-accent/20 focus:border-brand-accent transition-all font-medium mb-3"
                onKeyDown={(e) => e.key === 'Enter' && newProjectName.trim() && !isCreating && handleCreate()}
                disabled={isCreating}
              />
              <button
                onClick={handleCreate}
                disabled={isCreating || !newProjectName.trim()}
                className="w-full h-11 flex items-center justify-center gap-2 bg-[linear-gradient(135deg,#4f7cff,#7c3aed)] text-white font-semibold text-[14px] rounded-[14px] shadow-[0_4px_12px_rgba(79,124,255,0.25)] hover:shadow-[0_6px_16px_rgba(79,124,255,0.35)] transition-all disabled:opacity-50 active:scale-[0.98]"
              >
                {isCreating ? t('common.saving') : `+ ${t('sidebar.addProject')}`}
              </button>
            </div>
          </div>
        )}


      </motion.div>
    </>
  );
}
