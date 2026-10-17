import { Routes, Route, Navigate, useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { KanbanBoard } from './components/KanbanBoard';
import { MobileFilterModal } from './components/MobileFilterModal';
import { ActivityLog } from './components/ActivityLog';
import { InviteManagementModal } from './components/InviteManagementModal';
import { UserMenu } from './components/UserMenu';
import { useAuth } from './lib/AuthContext';
import { useSidebar } from './lib/SidebarContext';
import { cn } from './lib/utils';
import { useEffect, useState, useMemo } from 'react';
import { Task, Project, Member } from './types';
import { subscribeTasks, joinProject as dbJoinProject, subscribeProjectMembers, acceptInvite } from './lib/services';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './lib/firebase';
import { Share2, AlertCircle, User, Flag, Calendar, LayoutGrid, ListTodo, Route as RouteIcon, CheckSquare, Trash2, History, Layers, Menu } from 'lucide-react';
import { Button } from './components/ui/Button';
import { useTranslation } from 'react-i18next';
import { Select } from './components/ui/Select';
import { Landing } from './components/Landing';
import { motion } from 'motion/react';

/**
 * Dashboard Component
 * Displays the Kanban board for a specific project.
 */
function Dashboard() {
  const { projectId } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toggleMobileOpen } = useSidebar();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [showInviteMgmt, setShowInviteMgmt] = useState(false);

  // Lifted filter states
  const [assigneeId, setAssigneeId] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [deadlineFilter, setDeadlineFilter] = useState<string>('all');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const currentView = searchParams.get('view') === 'map' ? 'map' : 'board';

  const setView = (view: 'board' | 'map') => {
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set('view', view);
      return p;
    });
  };

  useEffect(() => {
    if (isMobile && currentView === 'map') {
      setView('board');
    }
  }, [isMobile, currentView]);

  const { user } = useAuth();

  useEffect(() => {
    if (projectId) {
      setLoadingProject(true);
      const unsubProj = onSnapshot(doc(db, 'projects', projectId), (snapshot) => {
        if (snapshot.exists()) {
          setProject({ id: snapshot.id, ...snapshot.data() } as Project);
          setLoadingProject(false);
        } else {
          setProject(null);
          setLoadingProject(false);
          navigate('/', { replace: true });
        }
      }, (error) => {
        console.error('Project check error:', error);
        setLoadingProject(false);
        navigate('/', { replace: true });
      });
      
      const unsubMembers = subscribeProjectMembers(projectId, setMembers);
      
      return () => {
        unsubProj();
        unsubMembers();
      };
    }
  }, [projectId, navigate]);

  useEffect(() => {
    if (projectId && user && members.length > 0) {
      const isMember = members.some(m => m.userId === user.uid);
      if (isMember) {
        return subscribeTasks(projectId, setTasks);
      }
    }
  }, [projectId, user, members]);

  const userMember = useMemo(() => members.find(m => m.userId === user?.uid), [members, user]);
  const canInvite = useMemo(() => {
    return userMember?.role === 'owner' || userMember?.role === 'admin' || project?.ownerId === user?.uid;
  }, [userMember, project, user]);

  if (loadingProject) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!project) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col min-h-screen pb-[80px] bg-transparent">
      <header className="bg-brand-surface sticky top-0 shrink-0 z-[100] flex flex-col pt-4 md:pt-6 px-4 md:px-8 border-b border-brand-border">
        {/* Layer 1: App & Project Context, Primary Actions */}
        <div className="flex items-center justify-between mb-4 md:mb-5">
          <div className="flex items-center gap-3">
            <button 
              onClick={toggleMobileOpen}
              className="p-1.5 -ml-1 text-brand-text-muted hover:bg-brand-surface-hover rounded-lg md:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg md:text-[20px] font-semibold tracking-tight text-brand-text-main truncate max-w-[180px] sm:max-w-[300px] md:max-w-[400px]">
              {project?.name || t('project.loading')}
            </h1>
          </div>

          <div className="flex items-center gap-2.5">
            {canInvite && (
              <button
                onClick={() => setShowInviteMgmt(true)}
                className="flex items-center gap-1.5 px-3 h-8 bg-brand-surface border border-brand-border text-brand-text-muted hover:text-brand-text-main hover:bg-brand-surface-hover rounded-md text-[13px] font-medium transition-colors shadow-sm"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{t('common.share')}</span>
              </button>
            )}
            <UserMenu />
          </div>
        </div>

        {/* Layer 2: Navigation & Filters */}
        <div className="flex items-center justify-between overflow-x-auto no-scrollbar relative -mb-[1px]">
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setView('board')}
              className={cn(
                "relative pb-3 px-1 text-[13px] transition-colors",
                currentView === 'board'
                  ? "text-brand-text-main font-semibold"
                  : "text-brand-text-muted hover:text-brand-text-main font-medium"
              )}
            >
              <span className="px-2.5 py-1.5 rounded-md hover:bg-brand-surface-hover transition-colors">
                {t('task.board')}
              </span>
              {currentView === 'board' && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-accent rounded-full" />
              )}
            </button>
            {!isMobile && (
              <button
                onClick={() => setView('map')}
                className={cn(
                  "relative pb-3 px-1 text-[13px] transition-colors",
                  currentView === 'map'
                    ? "text-brand-text-main font-semibold"
                    : "text-brand-text-muted hover:text-brand-text-main font-medium"
                )}
              >
                <span className="px-2.5 py-1.5 rounded-md hover:bg-brand-surface-hover transition-colors">
                  {t('task.map')}
                </span>
                {currentView === 'map' && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-accent rounded-full" />
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 pb-3 shrink-0 ml-auto opacity-100 transition-opacity">
            <div className="hidden md:flex items-center gap-2">
              <Select
                value={assigneeId}
                onChange={setAssigneeId}
                prefix={<User className="w-3.5 h-3.5" />}
                options={[
                  { value: 'all', label: t('task.allAssignees') },
                  ...members.map(m => ({ value: m.userId, label: m.name }))
                ]}
                className={cn("h-8 py-0 rounded-md text-[13px] font-medium border", assigneeId !== 'all' ? "bg-brand-surface border-brand-border text-brand-text-main shadow-[0_1px_2px_rgba(0,0,0,0.04)]" : "bg-transparent border-transparent text-brand-text-muted hover:bg-brand-surface-hover hover:text-brand-text-main shadow-none")}
              />

              <Select
                value={priorityFilter}
                onChange={setPriorityFilter}
                prefix={<Flag className="w-3.5 h-3.5" />}
                options={[
                  { value: 'all', label: t('task.anyPriority') },
                  { value: 'low', label: t('task.low') },
                  { value: 'medium', label: t('task.medium') },
                  { value: 'high', label: t('task.high') }
                ]}
                className={cn("h-8 py-0 rounded-md text-[13px] font-medium border", priorityFilter !== 'all' ? "bg-brand-surface border-brand-border text-brand-text-main shadow-[0_1px_2px_rgba(0,0,0,0.04)]" : "bg-transparent border-transparent text-brand-text-muted hover:bg-brand-surface-hover hover:text-brand-text-main shadow-none")}
              />

              <Select
                value={deadlineFilter}
                onChange={setDeadlineFilter}
                prefix={<Calendar className="w-3.5 h-3.5" />}
                options={[
                  { value: 'all', label: t('task.anyDeadline') },
                  { value: 'overdue', label: t('task.overdue') },
                  { value: 'upcoming', label: t('task.dueThisWeek') },
                  { value: 'no-deadline', label: t('task.noDeadline') }
                ]}
                className={cn("h-8 py-0 rounded-md text-[13px] font-medium border", deadlineFilter !== 'all' ? "bg-brand-surface border-brand-border text-brand-text-main shadow-[0_1px_2px_rgba(0,0,0,0.04)]" : "bg-transparent border-transparent text-brand-text-muted hover:bg-brand-surface-hover hover:text-brand-text-main shadow-none")}
              />

              <div className="bg-brand-border w-[1px] h-4 mx-1" />
            </div>

            <div className="flex md:hidden items-center">
              <button
                onClick={() => setIsMobileFilterOpen(true)}
                className={cn(
                  "flex items-center gap-1.5 px-3 h-8 rounded-md text-[13px] font-medium transition-colors border",
                  (assigneeId !== 'all' || priorityFilter !== 'all' || deadlineFilter !== 'all')
                    ? "bg-brand-accent/5 border-brand-accent text-brand-accent"
                    : "bg-brand-surface border-brand-border text-brand-text-muted transition-colors"
                )}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{t('common.filters')}</span>
              </button>
              <div className="bg-brand-border w-[1px] h-4 mx-2" />
            </div>

            <button
               onClick={() => setShowLog(true)}
              className="p-1.5 text-brand-text-muted hover:text-brand-text-main hover:bg-brand-surface-hover rounded-md transition-colors"
              title={t('project.activity')}
            >
              <History className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsTrashOpen(true)}
              className="p-1.5 text-brand-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
              title={t('task.trash')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 bg-transparent relative">
        <KanbanBoard 
          tasks={tasks} 
          projectId={projectId!} 
          project={project} 
          members={members}
          assigneeId={assigneeId}
          setAssigneeId={setAssigneeId}
          priorityFilter={priorityFilter}
          setPriorityFilter={setPriorityFilter}
          deadlineFilter={deadlineFilter}
          setDeadlineFilter={setDeadlineFilter}
          isTrashOpen={isTrashOpen}
          setIsTrashOpen={setIsTrashOpen}
        />
        <ActivityLog 
          projectId={projectId!} 
          isOpen={showLog} 
          onClose={() => setShowLog(false)} 
        />
        <InviteManagementModal
          projectId={projectId!}
          isOpen={showInviteMgmt}
          onClose={() => setShowInviteMgmt(false)}
          canManage={canInvite}
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
          onReset={() => {
            setAssigneeId('all');
            setPriorityFilter('all');
            setDeadlineFilter('all');
          }}
        />
      </main>
    </div>
  );
}

/**
 * Home Component
 * Premium empty state for authenticated users without a selected project.
 */
function Home() {
  const { t } = useTranslation();
  const { user, displayName } = useAuth();
  const { toggleMobileOpen } = useSidebar();
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const handleCreate = async () => {
    if (!newProjectName.trim() || !user) return;
    setIsSubmitting(true);
    try {
      const { createProject } = await import('./lib/services');
      await createProject(newProjectName.trim(), user.uid, displayName || t('common.user'), user.photoURL || undefined);
      setNewProjectName('');
      setIsCreating(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-[80px] bg-brand-bg relative">
       {/* Background Depth Elements */}
       <div className="absolute inset-0 pointer-events-none overflow-hidden">
         {/* Central Light Glow */}
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(79,124,255,0.06),transparent)] pointer-events-none" />
         
         {/* Floating Icons - Layers */}
         {/* Back Layer - Slow */}
         <motion.div
           animate={{ y: [0, -8, 0], rotate: [0, 2, 0] }}
           transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
           className="absolute top-[20%] left-[10%] text-brand-accent opacity-[0.06] scale-[1.2] blur-[1px]"
         >
           <LayoutGrid className="w-20 h-20" strokeWidth={1} />
         </motion.div>
         
         {/* Mid Layer - Medium */}
         <motion.div
           animate={{ y: [0, -12, 0], rotate: [0, -3, 0] }}
           transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
           className="absolute bottom-[20%] right-[15%] text-purple-500 opacity-[0.1]"
         >
           <ListTodo className="w-16 h-16" strokeWidth={1} />
         </motion.div>
         
         {/* Front Layer - Fast */}
         <motion.div
           animate={{ y: [0, -20, 0], rotate: [0, 5, 0] }}
           transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
           className="absolute top-[40%] left-[30%] text-emerald-500 opacity-[0.15] scale-[1.1]"
         >
           <RouteIcon className="w-20 h-20" strokeWidth={1} />
         </motion.div>
         <motion.div
           animate={{ y: [0, -16, 0], rotate: [0, -4, 0] }}
           transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 2 }}
           className="absolute bottom-[30%] right-[30%] text-brand-accent opacity-[0.15] scale-[1.1]"
         >
           <CheckSquare className="w-24 h-24" strokeWidth={1} />
         </motion.div>
       </div>

       <header className="h-[64px] border-b border-brand-border bg-brand-surface flex items-center justify-between px-4 md:px-8 shrink-0 z-[100] sticky top-0 shadow-sm transition-colors">
          <div className="flex items-center gap-3">
            <button 
              onClick={toggleMobileOpen}
              className="p-1.5 -ml-1 text-brand-text-muted hover:bg-brand-surface-hover rounded-lg md:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-bold text-brand-text-main">{t('home.title')}</span>
          </div>
          <div className="flex items-center gap-3">
             <UserMenu />
          </div>
       </header>

       <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 z-10 text-center">
        <div className="w-20 h-20 bg-brand-surface rounded-[20px] flex items-center justify-center mb-8 border border-brand-border shadow-sm transform rotate-3 transition-colors">
          <LayoutGrid className="w-10 h-10 text-brand-accent -rotate-3" />
        </div>
        
        <h1 className="text-[32px] sm:text-[40px] font-bold text-brand-text-main mb-4 tracking-[-0.02em] transition-colors">
          {t('home.welcomeUser', { name: displayName?.split(' ')[0] || t('common.user') })}
        </h1>
        <p className="text-[17px] text-brand-text-muted max-w-lg mb-12 leading-relaxed transition-colors">
          {t('home.subtitle')}
        </p>
        
        <div className="flex flex-col sm:flex-row items-center gap-5 w-full justify-center mb-16">
          {!isCreating ? (
            <button 
              onClick={() => setIsCreating(true)}
              className="px-8 py-4 bg-[linear-gradient(135deg,#4F7CFF,#6A8BFF)] dark:bg-[linear-gradient(135deg,#638BFF,#8B5CF6)] hover:opacity-90 text-white rounded-[14px] font-semibold text-[15px] shadow-[0_10px_30px_rgba(79,124,255,0.25)] hover:shadow-[0_15px_35px_rgba(79,124,255,0.35)] hover:-translate-y-[1px] transition-all duration-200 flex items-center gap-3"
            >
              <LayoutGrid className="w-5 h-5" />
              <span>{t('home.createProject')}</span>
            </button>
          ) : (
            <div className="flex items-center gap-3 bg-brand-surface p-2.5 rounded-[16px] border border-brand-border shadow-[0_15px_40px_rgba(0,0,0,0.06)] animate-in fade-in zoom-in-95 duration-200">
              <input
                autoFocus
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder={t('home.newProjectPlaceholder')}
                className="bg-transparent border-none outline-none text-brand-text-main px-4 py-2 w-64 text-[15px] font-medium placeholder:text-brand-text-muted"
                disabled={isSubmitting}
              />
              <button
                onClick={handleCreate}
                disabled={isSubmitting || !newProjectName.trim()}
                className="px-6 py-2.5 bg-brand-accent text-white font-semibold text-[14px] rounded-[10px] shadow-sm hover:opacity-90 transition-colors disabled:opacity-50"
              >
                {t('common.save')}
              </button>
              <button
                onClick={() => setIsCreating(false)}
                className="px-4 py-2.5 text-brand-text-muted hover:text-brand-text-main transition-colors text-[14px] font-medium"
              >
                {t('common.cancel')}
              </button>
            </div>
          )}
        </div>

        {/* Guidance Section */}
        <div className="w-full max-w-[1000px] grid grid-cols-1 md:grid-cols-3 gap-8">
          <motion.div 
            whileHover={{ y: -6 }}
            className="group bg-brand-surface/70 backdrop-blur-xl border border-brand-border p-8 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] transition-all duration-300"
          >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white mb-6 shadow-lg shadow-blue-500/20 group-hover:scale-110 transition-transform duration-300">
              <Layers className="w-7 h-7" />
            </div>
            <h3 className="text-[18px] font-semibold text-brand-text-main mb-3">{t('home.features.space')}</h3>
            <p className="text-brand-text-muted text-[15px] leading-relaxed opacity-70">{t('home.features.spaceDesc')}</p>
          </motion.div>
          
          <motion.div 
            whileHover={{ y: -6 }}
            className="group bg-brand-surface/70 backdrop-blur-xl border border-brand-border p-8 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] transition-all duration-300"
          >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center text-white mb-6 shadow-lg shadow-purple-500/20 group-hover:scale-110 transition-transform duration-300">
              <ListTodo className="w-7 h-7" />
            </div>
            <h3 className="text-[18px] font-semibold text-brand-text-main mb-3">{t('home.features.plan')}</h3>
            <p className="text-brand-text-muted text-[15px] leading-relaxed opacity-70">{t('home.features.planDesc')}</p>
          </motion.div>
          
          <motion.div 
            whileHover={{ y: -6 }}
            className="group bg-brand-surface/70 backdrop-blur-xl border border-brand-border p-8 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] transition-all duration-300"
          >
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white mb-6 shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform duration-300">
              <RouteIcon className="w-7 h-7" />
            </div>
            <h3 className="text-[18px] font-semibold text-brand-text-main mb-3">{t('home.features.track')}</h3>
            <p className="text-brand-text-muted text-[15px] leading-relaxed opacity-70">{t('home.features.trackDesc')}</p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}



/**
 * Main App Component
 * Handles routing and conditional layout for auth/public states.
 */
export default function App() {
  const { user, loading } = useAuth();
  const { collapsed } = useSidebar();

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-brand-bg transition-colors duration-500">
        <div className="w-10 h-10 border-4 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Public View
  if (!user) {
    return (
      <div className="bg-brand-bg min-h-screen transition-colors duration-500">
        <Routes>
          <Route path="/join/:projectId/:code" element={<JoinHandler />} />
          <Route path="/invite" element={<InviteHandler />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </div>
    );
  }

  // Authenticated Layout
  return (
    <>
      <div className="flex min-h-screen w-full bg-brand-bg transition-colors duration-300">
        <Sidebar />
        <div className={cn(
          "flex-1 relative transition-all duration-300 ease-in-out",
          collapsed ? "md:ml-[72px]" : "md:ml-[260px]",
          "ml-0"
        )}>
          <Routes>
            <Route path="/project/:projectId" element={<Dashboard />} />
            <Route path="/join/:projectId/:code" element={<JoinHandler />} />
            <Route path="/invite" element={<InviteHandler />} />
            <Route path="/" element={<Home />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </>
  );
}

/**
 * InviteHandler Component
 * Manages the project invitation logic via link.
 */
function InviteHandler() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { user, displayName, login } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handle() {
      if (user && token) {
        try {
          const finalName = displayName || user.email?.split('@')[0] || 'Member';
          const projectId = await acceptInvite(token, user.uid, finalName, user.photoURL || undefined);
          navigate(`/project/${projectId}`);
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : 'An error occurred');
        }
      }
    }
    handle();
  }, [user, token, displayName, navigate]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-transparent p-8 text-center">
        <div className="max-w-md w-full bg-brand-surface border border-brand-border p-10 rounded-xl shadow-sm">
          <h2 className="text-2xl font-bold mb-4 text-brand-text-main">{t('invite.title')}</h2>
          <p className="text-brand-text-muted mb-6">{t('invite.desc')}</p>
          <button 
            onClick={login}
            className="w-full py-4 bg-brand-accent text-white font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
          >
            {t('invite.signIn')}
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
       <div className="flex items-center justify-center min-h-screen bg-transparent p-8">
         <div className="max-w-md w-full bg-brand-surface border border-red-100 p-10 rounded-2xl shadow-xl text-center">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 mx-auto mb-6">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-brand-text-main mb-2">{t('invite.errorTitle')}</h2>
            <p className="text-[14px] text-brand-text-muted mb-8 leading-relaxed">
              {error === 'Invalid invite link' ? t('invite.invalid') : 
               error === 'Invite expired' ? t('invite.expired') :
               error === 'Invite limit reached' ? t('invite.limit') :
               error}
            </p>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => navigate('/')}
              className="rounded-xl"
            >
              {t('invite.backHome')}
            </Button>
         </div>
       </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
      <p className="text-brand-text-muted font-medium">{t('invite.joining')}</p>
    </div>
  );
}

/**
 * JoinHandler Component
 * Manages the project invitation logic.
 */
function JoinHandler() {
  const { projectId } = useParams();
  const { user, displayName, login } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleJoin = async () => {
    if (user && projectId) {
      const finalName = displayName || user.email?.split('@')[0] || 'Member';
      await dbJoinProject(projectId, user.uid, finalName, user.photoURL || undefined);
      navigate(`/project/${projectId}`);
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-transparent p-8 text-center">
        <div className="max-w-md w-full bg-brand-surface border border-brand-border p-10 rounded-xl shadow-sm">
          <h2 className="text-2xl font-bold mb-4 text-brand-text-main">{t('invite.title')}</h2>
          <p className="text-brand-text-muted mb-6">{t('invite.desc')}</p>
          <button 
            onClick={login}
            className="w-full py-4 bg-brand-accent text-white font-bold rounded-xl shadow-sm hover:opacity-90 transition-opacity"
          >
            {t('invite.signIn')}
          </button>
        </div>
      </div>
    );
  }

  useEffect(() => {
    handleJoin();
  }, [user, projectId, displayName]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
      <p className="text-brand-text-muted font-medium">{t('invite.joining')}</p>
    </div>
  );
}
