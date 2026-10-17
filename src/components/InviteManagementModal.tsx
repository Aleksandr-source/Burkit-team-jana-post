import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Link as LinkIcon, Trash2, Clock, ShieldCheck, Copy, CheckCircle2, AlertTriangle, Plus, Share2 } from 'lucide-react';
import { Invite } from '../types';
import { subscribeInvites, revokeInvite, createInvite } from '../lib/services';
import { useTranslation } from 'react-i18next';
import { formatDistanceStrict } from 'date-fns';
import { cn } from '../lib/utils';
import { useAuth } from '../lib/AuthContext';
import { Select } from './ui/Select';

interface InviteManagementModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  canManage: boolean;
}

export function InviteManagementModal({ projectId, isOpen, onClose, canManage }: InviteManagementModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Custom invite state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [maxUses, setMaxUses] = useState(10);
  const [expiryDays, setExpiryDays] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      return subscribeInvites(projectId, setInvites);
    }
  }, [projectId, isOpen]);

  const formatShortTime = (time: number) => {
    const dist = formatDistanceStrict(time, Date.now());
    return dist.replace(' hours', 'h').replace(' hour', 'h').replace(' days', 'd').replace(' day', 'd').replace(' minutes', 'm').replace(' minute', 'm');
  };

  const sortedInvites = useMemo(() => {
    return [...invites].sort((a, b) => {
      const aExpired = a.expiresAt < Date.now() || a.uses >= a.maxUses;
      const bExpired = b.expiresAt < Date.now() || b.uses >= b.maxUses;
      
      if (!aExpired && bExpired) return -1;
      if (aExpired && !bExpired) return 1;
      return a.expiresAt - b.expiresAt;
    });
  }, [invites]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreate = async () => {
    if (!user || !canManage || isCreating) return;
    setIsCreating(true);
    try {
      const expiresAt = Date.now() + (expiryDays * 24 * 60 * 60 * 1000);
      await createInvite(projectId, user.uid, { 
        maxUses: maxUses === 0 ? 999999 : maxUses,
        expiresAt 
      });
      showToast(t('invite.toasts.ready'));
      setShowCreateForm(false);
    } catch {
      showToast(t('invite.toasts.createFailed'), 'error');
    } finally {
      setTimeout(() => setIsCreating(false), 1000); // Debounce
    }
  };

  const handleRevoke = async (id: string) => {
    if (!canManage) return;
    try {
      await revokeInvite(id);
      showToast(t('invite.toasts.revoked'), 'info');
      setConfirmRevoke(null);
    } catch {
      showToast(t('invite.toasts.revokeFailed'), 'error');
    }
  };

  const copyLink = async (invite: Invite) => {
    try {
      const url = `${window.location.origin}/invite?token=${invite.token}`;
      await navigator.clipboard.writeText(url);
      setCopiedId(invite.id);
      setTimeout(() => setCopiedId(null), 1500);
      showToast(t('invite.toasts.copied'));
    } catch {
      showToast(t('invite.toasts.copyFailed'), 'error');
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
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[480px] surface rounded-2xl shadow-xl z-[9999] overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Toast Notification */}
            <AnimatePresence>
              {toast && (
                <motion.div
                  initial={{ y: -50, opacity: 0 }}
                  animate={{ y: 24, opacity: 1 }}
                  exit={{ y: -50, opacity: 0 }}
                  className="absolute top-0 left-1/2 -translate-x-1/2 z-[200] px-4 py-2 surface rounded-full flex items-center gap-2.5"
                >
                  {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : 
                   toast.type === 'error' ? <AlertTriangle className="w-4 h-4 text-red-500" /> : 
                   <Clock className="w-4 h-4 text-blue-500" />}
                  <span className="text-[13px] font-bold whitespace-nowrap">{toast.message}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="p-8 border-b border-brand-border flex items-center justify-between bg-brand-surface-hover/40 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-brand-accent to-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-brand-accent/20">
                  <Share2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-[20px] font-black text-brand-text-main tracking-tight uppercase leading-none mb-1.5">{t('invite.shareProject')}</h2>
                  <p className="text-[10px] text-brand-text-muted font-black uppercase tracking-[0.1em] opacity-60">{t('invite.accessManagement')}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2.5 hover:bg-brand-surface-hover rounded-xl transition-all text-brand-text-muted active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {canManage && (
                <div className="bg-brand-surface-hover border border-brand-border rounded-3xl p-5">
                  {!showCreateForm ? (
                    <button 
                      onClick={() => setShowCreateForm(true)}
                      className="w-full py-3.5 px-4 bg-gradient-to-r from-brand-surface to-brand-surface-hover border-2 border-dashed border-brand-accent/30 rounded-2xl text-brand-accent font-bold text-[14px] hover:border-brand-accent/50 hover:shadow-sm hover:from-brand-surface hover:to-brand-surface transition-all flex items-center justify-center gap-2 group"
                    >
                      <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                      {t('invite.generateNewLink')}
                    </button>
                  ) : (
                    <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-black text-brand-text-main">{t('invite.inviteSettings')}</h3>
                        <button onClick={() => setShowCreateForm(false)} className="text-[11px] font-bold text-brand-text-muted hover:text-brand-text-main">{t('common.cancel')}</button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-brand-text-muted uppercase tracking-widest px-1">{t('invite.expirationLabel')}</label>
                          <Select
                            value={expiryDays.toString()}
                            onChange={(val) => setExpiryDays(parseInt(val))}
                            options={[
                              { value: '1', label: t('invite.duration.24h') },
                              { value: '7', label: t('invite.duration.7d') },
                              { value: '30', label: t('invite.duration.30d') }
                            ]}
                            className="bg-brand-surface border-brand-border py-2.5 font-bold text-brand-text-main"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-brand-text-muted uppercase tracking-widest px-1">{t('invite.maxUsesLabel')}</label>
                          <Select
                            value={maxUses.toString()}
                            onChange={(val) => setMaxUses(parseInt(val))}
                            options={[
                              { value: '10', label: t('invite.usersLimit.10') },
                              { value: '50', label: t('invite.usersLimit.50') },
                              { value: '0', label: t('invite.usersLimit.unlimited') }
                            ]}
                            className="bg-brand-surface border-brand-border py-2.5 font-bold text-brand-text-main"
                          />
                        </div>
                      </div>

                      <button 
                        onClick={handleCreate}
                        disabled={isCreating}
                        className="w-full py-3 bg-brand-header text-brand-text-main font-bold rounded-2xl text-[13px] shadow-xl shadow-brand-header/10 hover:bg-brand-header/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isCreating ? t('invite.generating') : t('invite.createInvite')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                {invites.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-brand-surface-hover rounded-full flex items-center justify-center text-brand-text-muted/30 mb-4 border border-dashed border-brand-border">
                      <LinkIcon className="w-7 h-7" />
                    </div>
                    <h3 className="text-[16px] font-bold text-brand-text-main mb-1">{t('invite.noActiveInvites')}</h3>
                    <p className="text-[13px] text-brand-text-muted max-w-[240px]">
                      {t('invite.noActiveInvitesDesc')}
                    </p>
                  </div>
                ) : (
                  sortedInvites.map((invite) => {
                    const isExpired = invite.expiresAt < Date.now();
                    const isExhausted = invite.uses >= invite.maxUses;
                    const isRevoking = confirmRevoke === invite.id;
                    const isCopied = copiedId === invite.id;
                    const usagePercent = Math.min((invite.uses / invite.maxUses) * 100, 100);
                    
                    return (
                      <div 
                        key={invite.id} 
                        className={cn(
                          "group p-5 rounded-[28px] border transition-all relative overflow-hidden",
                          isExpired || isExhausted 
                            ? "bg-brand-surface-hover border-brand-border grayscale opacity-60" 
                            : "bg-brand-surface border-brand-border shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:border-brand-border hover:shadow-[0_12px_40px_rgb(0,0,0,0.06)] ring-1 ring-emerald-500/5"
                        )}
                      >
                        <div className="flex items-center justify-between gap-4 mb-5">
                          <div className="flex items-center gap-2.5">
                            {isExpired ? (
                              <div className="px-3 py-1 rounded-full bg-red-100 text-red-600 text-[9px] font-black uppercase tracking-wider border border-red-200">
                                {t('invite.status.expired')}
                              </div>
                            ) : isExhausted ? (
                              <div className="px-3 py-1 rounded-full bg-orange-100 text-orange-600 text-[9px] font-black uppercase tracking-wider border border-orange-200">
                                {t('invite.status.usedUp')}
                              </div>
                            ) : (
                              <div className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-600 text-[9px] font-black uppercase tracking-wider border border-emerald-200">
                                {t('invite.status.active')}
                              </div>
                            )}
                            <p className="text-[11px] font-black text-brand-text-muted uppercase tracking-widest">{t('invite.expiresIn', { time: formatShortTime(invite.expiresAt) })}</p>
                          </div>
                          
                          {canManage && !isRevoking && (
                            <button
                              onClick={() => setConfirmRevoke(invite.id)}
                              className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all text-neutral-300 active:scale-90"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {isRevoking ? (
                          <div className="bg-red-50/50 rounded-2xl p-4 border border-red-100 animate-in fade-in slide-in-from-top-4 duration-300">
                            <p className="text-[12px] font-bold text-red-700 mb-4 text-center">{t('invite.revokeConfirm')}</p>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => setConfirmRevoke(null)}
                                className="flex-1 py-2 bg-brand-surface border border-red-100 text-red-600 text-[11px] font-bold rounded-xl hover:bg-brand-surface transition-colors"
                              >
                                {t('invite.keep')}
                              </button>
                              <button 
                                onClick={() => handleRevoke(invite.id)}
                                className="flex-1 py-2 bg-red-600 text-white text-[11px] font-bold rounded-xl hover:bg-red-700 transition-colors shadow-sm"
                              >
                                {t('common.revoke')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-5">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between px-1">
                                <p className="text-[10px] font-black text-brand-text-muted uppercase tracking-widest">{t('invite.usageLimit')}</p>
                                <p className="text-[11px] font-black text-brand-text-main">{invite.uses} / {invite.maxUses > 1000 ? '∞' : invite.maxUses}</p>
                              </div>
                              <div className="h-2 bg-brand-surface-hover rounded-full overflow-hidden border border-brand-border/40">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${usagePercent}%` }}
                                  className={cn(
                                    "h-full transition-colors duration-500",
                                    isExhausted ? "bg-red-400" : (usagePercent > 80 ? "bg-orange-400" : "bg-emerald-400")
                                  )} 
                                />
                              </div>
                            </div>

                            <button
                              onClick={() => copyLink(invite)}
                              disabled={isExpired || isExhausted}
                              className={cn(
                                "w-full py-3.5 rounded-[18px] text-[13px] font-black transition-all flex items-center justify-center gap-2 shadow-sm",
                                isExpired || isExhausted 
                                  ? "bg-brand-surface-hover text-brand-text-muted cursor-not-allowed opacity-50" 
                                  : isCopied 
                                    ? "bg-emerald-500 text-white shadow-emerald-500/20" 
                                    : "bg-brand-header text-brand-text-main hover:bg-brand-header/90 active:scale-[0.98] shadow-brand-header/10"
                              )}
                            >
                              {isCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                              {isCopied 
                                ? t('invite.copied') 
                                : (isExpired ? t('invite.linkExpired') : isExhausted ? t('invite.limitReached') : t('invite.copyLink'))
                              }
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="p-7 bg-brand-surface-hover/50 border-t border-brand-border flex items-center gap-5">
               <div className="w-12 h-12 bg-brand-surface rounded-2xl flex items-center justify-center text-emerald-500 shrink-0 border border-brand-border shadow-sm">
                 <ShieldCheck className="w-6 h-6" />
               </div>
               <p className="text-[11px] text-brand-text-muted font-bold leading-relaxed opacity-70">
                 {t('invite.securityDisclaimer')}
               </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
