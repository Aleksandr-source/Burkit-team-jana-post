import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, UserX, Shield, Clock, ShieldAlert, ChevronDown } from 'lucide-react';
import { Member, UserProfile } from '../types';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { updateMember, removeMember, subscribeUserProfile } from '../lib/services';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';

interface TeamManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  members: Member[];
  presenceMap: Record<string, { online: boolean; lastSeen: number }>;
  currentUserRole: string; // The role of the currently logged-in user
}

export function TeamManagementModal({ 
  isOpen, 
  onClose, 
  projectId, 
  members, 
  presenceMap,
  currentUserRole
}: TeamManagementModalProps) {
  const { t } = useTranslation();
  const { user, displayName } = useAuth();
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, UserProfile>>({});

  useEffect(() => {
    if (!isOpen) return;

    const unsubs: (() => void)[] = [];
    const uniqueUserIds = Array.from(new Set(members.map(m => m.userId)));

    uniqueUserIds.forEach(uid => {
      const unsub = subscribeUserProfile(uid, (profile) => {
        if (profile) {
          setMemberProfiles(prev => ({ ...prev, [uid]: profile }));
        }
      });
      unsubs.push(unsub);
    });

    return () => unsubs.forEach(unsub => unsub());
  }, [isOpen, members]);

  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'owner';

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleRoleChange = async (member: Member, newRole: string) => {
    if (!user || isProcessing === member.id) return;
    setIsProcessing(member.id);
    try {
      await updateMember(
        member.id, 
        { role: newRole as 'owner' | 'admin' | 'editor' | 'viewer' | 'member' }, 
        projectId, 
        user.uid, 
        displayName || t('common.user'), 
        member.name
      );
    } catch (e) {
      console.error('Role update error:', e);
      alert(t('team.updateRoleFailed'));
    } finally {
      setIsProcessing(null);
    }
  };

  const handleRemove = async (member: Member) => {
    if (!user || isProcessing === member.id) return;
    
    if (confirmDelete !== member.id) {
      setConfirmDelete(member.id);
      setTimeout(() => setConfirmDelete(null), 3000);
      return;
    }

    setIsProcessing(member.id);
    try {
      await removeMember(
        member.id, 
        projectId, 
        user.uid, 
        displayName || t('common.user'), 
        member.name
      );
      setConfirmDelete(null);
    } catch (e) {
      console.error('Member removal error:', e);
      alert(t('team.removeMemberFailed'));
    } finally {
      setIsProcessing(null);
    }
  };

  const getRoleBadge = (role: string) => {
    switch(role) {
      case 'owner': return <span className="px-2 py-0.5 rounded-full text-[9px] uppercase font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm tracking-wider">{t('common.roles.owner')}</span>;
      case 'admin': return <span className="px-2 py-0.5 rounded-full text-[9px] uppercase font-bold bg-rose-50 text-rose-600 border border-rose-100 shadow-sm tracking-wider">{t('common.roles.admin')}</span>;
      case 'editor': return <span className="px-2 py-0.5 rounded-full text-[9px] uppercase font-bold bg-sky-50 text-sky-600 border border-sky-100 shadow-sm tracking-wider">{t('common.roles.editor')}</span>;
      default: return <span className="px-2 py-0.5 rounded-full text-[9px] uppercase font-bold bg-neutral-50 text-neutral-500 border border-neutral-100 shadow-sm tracking-wider">{t(`common.roles.${role}` as string) || role}</span>;
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
            className="fixed inset-0 surface-backdrop z-[9990]"
            style={{ WebkitBackdropFilter: 'blur(16px)' }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-32px)] sm:w-full max-w-2xl surface rounded-3xl z-[9999] overflow-hidden flex flex-col max-h-[85vh] textPrimary"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-brand-border shrink-0 bg-brand-surface">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 flex items-center justify-center bg-indigo-50 rounded-2xl border border-indigo-100 shadow-inner">
                  <Shield className="w-6 h-6 text-indigo-500" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-brand-text-main tracking-tight">{t('team.title')}</h2>
                  <p className="text-[13px] text-brand-text-muted font-medium">{t('team.subtitle')}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2.5 hover:bg-brand-surface-hover rounded-xl transition-all duration-200 text-brand-text-muted hover:text-brand-text-main border border-transparent hover:border-brand-border"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stats Bar */}
            <div className="px-8 py-3 bg-brand-surface-hover/80 border-b border-brand-border flex items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-brand-text-muted tracking-widest leading-none mb-1">{t('team.totalMembers')}</span>
                    <span className="text-sm font-bold text-brand-text-main">{members.length}</span>
                  </div>
                  <div className="w-[1px] h-6 bg-brand-border" />
                  <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-brand-text-muted tracking-widest leading-none mb-1">{t('team.activity')}</span>
                    <span className="text-sm font-bold text-green-600">{t('team.activeCount', { count: members.filter(m => presenceMap[m.userId]?.online).length })}</span>
                  </div>
               </div>
               <div className="text-[11px] font-medium text-brand-text-muted italic">
                 {t('project.id')}: {projectId.slice(0, 8)}...
               </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar pb-10">
              {members.map((member, idx) => {
                const presence = presenceMap[member.userId];
                const isOnline = presence?.online;
                const lastSeenText = presence?.lastSeen 
                  ? formatDistanceToNow(presence.lastSeen, { addSuffix: true }) 
                  : t('common.unknown');
                
                const isSelf = member.userId === user?.uid;
                const canManage = isAdmin && member.role !== 'owner' && !isSelf;

                return (
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={member.id}
                    className={cn(
                      "group flex flex-col sm:flex-row sm:items-center justify-between p-6 rounded-[24px] border transition-all duration-300",
                      isSelf 
                        ? "border-brand-accent/20 bg-brand-accent/5" 
                        : "border-brand-border/60 hover:border-brand-accent/30 bg-brand-surface hover:shadow-lg"
                    )}
                  >
                    <div className="flex items-center gap-6 mb-6 sm:mb-0">
                      <div className="relative shrink-0">
                        <div className="w-14 h-14 rounded-2xl border-2 border-brand-surface bg-brand-surface-hover flex items-center justify-center text-[18px] font-black text-brand-text-muted uppercase shadow-md group-hover:scale-105 transition-transform duration-300 overflow-hidden">
                          {memberProfiles[member.userId]?.photoURL ? (
                            <img 
                              src={memberProfiles[member.userId].photoURL} 
                              alt={member.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            member.name.charAt(0)
                          )}
                        </div>
                        <div className={cn(
                          "absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-brand-surface shadow-md ring-1 ring-black/5",
                          isOnline ? "bg-emerald-500" : "bg-neutral-300"
                        )} />
                      </div>
                      
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <span className="text-[17px] font-black text-brand-text-main tracking-tight truncate leading-none">
                            {member.name}
                            {isSelf && <span className="ml-3 text-[10px] font-black text-brand-accent bg-brand-accent/10 px-2 py-0.5 rounded-full uppercase tracking-widest">{t('common.you')}</span>}
                          </span>
                          {getRoleBadge(member.role)}
                        </div>
                        <div className="flex items-center gap-5">
                          <div className="flex items-center gap-2 min-w-0">
                             <Clock className="w-3.5 h-3.5 text-brand-text-muted shrink-0" />
                             <span className="text-[12px] text-brand-text-muted font-bold truncate">
                               {isOnline ? (
                                 <span className="text-emerald-600 font-black uppercase tracking-wider">{t('team.activeNow')}</span>
                               ) : (
                                 t('team.seenAt', { time: lastSeenText })
                               )}
                             </span>
                          </div>
                          <div className="hidden xs:flex items-center gap-5 min-w-0 border-l border-brand-border pl-5">
                            <span className="text-[10px] text-brand-text-muted/60 font-black uppercase tracking-widest truncate">
                              {t('team.joinedAt', { time: formatDistanceToNow(member.joinedAt || Date.now(), { addSuffix: true }) })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 sm:pl-6 sm:ml-2 sm:border-l border-brand-border shrink-0">
                      {canManage ? (
                        <>
                          <div className="relative flex-1 sm:flex-none">
                            <RoleDropdown 
                              currentRole={member.role} 
                              onSelect={(role) => handleRoleChange(member, role)} 
                              disabled={isProcessing === member.id}
                            />
                          </div>
                          
                          <Button
                            variant={confirmDelete === member.id ? "danger" : "secondary"}
                            size="md"
                            disabled={isProcessing === member.id}
                            onClick={() => handleRemove(member)}
                            className={cn(
                              "w-auto min-w-[44px] h-10 rounded-xl p-0 flex items-center justify-center transition-all shadow-sm border px-3 gap-2 shrink-0 flex-1 sm:flex-none",
                              confirmDelete === member.id 
                                ? "bg-red-500 text-white border-red-600 hover:bg-red-600 w-24 sm:w-28" 
                                : "bg-brand-surface-hover text-brand-text-muted border-brand-border hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                            )}
                            title={t('team.removeFromProject')}
                          >
                            {confirmDelete === member.id ? (
                              <span className="text-[11px] font-bold uppercase tracking-wider">{t('common.confirmAction')}</span>
                            ) : (
                              <UserX className="w-4 h-4" />
                            )}
                          </Button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2.5 text-[11px] text-brand-text-muted font-bold uppercase tracking-wider px-4 py-2 bg-brand-surface-hover rounded-xl border border-brand-border shadow-inner">
                          <ShieldAlert className="w-4 h-4 text-brand-text-muted/60" />
                          <span>{t('team.protectedMember')}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

function RoleDropdown({ 
  currentRole, 
  onSelect, 
  disabled 
}: { 
  currentRole: string; 
  onSelect: (role: string) => void; 
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const roles = [
    { id: 'admin', label: t('common.roles.admin'), desc: t('team.roles.adminDesc'), color: 'text-rose-500', bg: 'bg-rose-50' },
    { id: 'member', label: t('common.roles.member'), desc: t('team.roles.memberDesc'), color: 'text-indigo-500', bg: 'bg-indigo-50' },
    { id: 'editor', label: t('common.roles.editor'), desc: t('team.roles.editorDesc'), color: 'text-sky-500', bg: 'bg-sky-50' },
    { id: 'viewer', label: t('common.roles.viewer'), desc: t('team.roles.viewerDesc'), color: 'text-neutral-500', bg: 'bg-neutral-50' },
  ];

  const current = roles.find(r => r.id === currentRole) || roles[1];

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          "w-full sm:w-32 px-4 py-2.5 rounded-xl border flex items-center justify-between gap-2 transition-all duration-200 outline-none",
          disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-brand-surface-hover active:scale-95 cursor-pointer",
          isOpen ? "border-indigo-400 ring-2 ring-indigo-50" : "border-brand-border"
        )}
      >
        <span className="text-[13px] font-bold text-brand-text-main capitalize">{current.label}</span>
        <ChevronDown className={cn("w-4 h-4 text-brand-text-muted transition-transform duration-200", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: "spring", duration: 0.3, bounce: 0.3 }}
            className="absolute top-full left-0 sm:left-auto sm:right-0 mt-3 w-64 bg-brand-surface rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.2)] border border-brand-border overflow-hidden z-[110]"
          >
            <div className="p-2 space-y-1">
              <div className="px-3 py-2 border-b border-brand-border/30 mb-1">
                <span className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest">{t('team.selectPermission')}</span>
              </div>
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => {
                    onSelect(role.id);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200 text-left",
                    currentRole === role.id ? "bg-indigo-50" : "hover:bg-brand-surface-hover"
                  )}
                >
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", role.bg)}>
                    <Shield className={cn("w-4 h-4", role.color)} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className={cn("text-[13px] font-bold", currentRole === role.id ? "text-indigo-600" : "text-brand-text-main")}>
                      {role.label}
                    </span>
                    <span className="text-[10px] text-brand-text-muted font-medium truncate">{role.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
