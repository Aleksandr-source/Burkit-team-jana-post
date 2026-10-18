import Select from './Select';
import ProfilePage from './ProfilePage';
import { groupNotifications, isDocumentNotification, notificationOverview } from './notifications';
import DocumentProcessingModal from './DocumentProcessingModal';
import NotificationList from './NotificationList';
import './dashboard.css';
import SettingsModal from './SettingsModal';
import NotificationsPage from './NotificationsPage';
import AssistantPage from './AssistantPage';
import Modal from './Modal';
import CourseDetail from './CourseDetail';
import { courseProgress } from './learning';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, Bell, BookOpen, CalendarDays, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronRight, Clock3, FileText, GraduationCap, LayoutDashboard, Loader2, LogOut, Menu, MessageCircle, PanelLeftClose, Paperclip, Pencil, Plus, Search, Send, Settings, ShieldCheck, Trash2, Users, X, XCircle } from 'lucide-react';
import { api, ApiError, bootstrap, login, logout, getDemoAccess, demoLogin } from './api';
import type { Bootstrap, Course, DemoAccess, HrInquiry, Lang, LeaveRequest, Localized, Notification, Person, Role, View } from './types';
import { formatDate, formatToday, localized, makeT, readLanguage } from './i18n';
import type { Translator } from './i18n';
import { createWorkspaceSync, commitAndRefresh } from './workspace-sync';
import './styles.css';
import './appearance.css';
import './shell.css';
import { useAppearance } from './appearance';
import AppearanceSettings from './AppearanceSettings';
import ActionQueue from './ActionQueue';
import RequestNextStep from './RequestNextStep';
import { canReview } from './workspace-actions';
import DemoAccounts from './DemoAccounts';

type ModalState = { kind: 'documentProcessing'; id: string } | { kind: 'request'; id: string } | { kind: 'newRequest' } | { kind: 'course'; id: string } | { kind: 'editor'; course?: Course } | { kind: 'assign'; id: string } | { kind: 'person' } | { kind: 'employeeProfile'; id: string } | { kind: 'editProfile'; person: Person } | { kind: 'inquiry'; id: string } | { kind: 'escalate'; question: string; language?: Lang } | { kind: 'appearance' } | { kind: 'settings' } | null;
type Mutation = <T = unknown>(path: string, body?: unknown, message?: string) => Promise<T>;
interface CommonProps { data: Bootstrap; lang: Lang; t: Translator; mutate: Mutation; open: (modal: ModalState) => void; navigate: (view: View) => void; }
const viewIcons = { home: LayoutDashboard, requests: FileText, team: Users, academy: GraduationCap, assistant: MessageCircle, hrInquiries: MessageCircle, notifications: Bell, integrations: Settings, profile: Users, people: Users };
const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const activeStatus = (request: LeaveRequest) => request.status === 'pending_manager' || request.status === 'pending_hr';
const canApprove = canReview;
const emptyLocalized = (): Localized => ({ ru: '', kk: '', en: '' });

function Brand({ light = false }: { light?: boolean }) {
  return <div className={`hr-brand ${light ? 'is-light' : ''}`}><span className="hr-brand-symbol" aria-hidden="true"><span /><span /><span /></span><span>Jana<span className="hr-brand-dot">Men</span></span></div>;
}

function LanguagePicker({ lang, change, t }: { lang: Lang; change: (lang: Lang) => void; t: Translator }) {
  return <div className="hr-language"><Select aria-label={t('language')} value={lang} onChange={event => change(event.target.value as Lang)}><option value="ru">РУС</option><option value="kk">ҚАЗ</option><option value="en">ENG</option></Select></div>;
}

function Status({ request, t }: { request: LeaveRequest; t: Translator }) {
  return <span className={`hr-status status-${request.status}`}><i />{t(request.status)}</span>;
}

function Avatar({ person, size = 'normal' }: { person: Pick<Person, 'name'>; size?: 'normal' | 'large' | 'small' }) {
  return <span className={`hr-avatar avatar-${size}`} aria-hidden="true">{initials(person.name)}</span>;
}

function Empty({ icon = <FileText size={28} />, title, text, children }: { icon?: ReactNode; title: string; text?: string; children?: ReactNode }) {
  return <div className="hr-empty"><span className="hr-empty-icon">{icon}</span><h3>{title}</h3>{text && <p>{text}</p>}{children}</div>;
}

function LoginPage({ lang, setLang, onLogin, t, demo, onDemoLogin, authError }: { lang: Lang; setLang: (lang: Lang) => void; onLogin: (email: string, password: string) => Promise<void>; t: Translator; demo: DemoAccess; onDemoLogin: (role: Role) => Promise<void>; authError: string }) {
  const [email, setEmail] = useState('employee@janamen.demo');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setError(''); setBusy(true); try { await onLogin(email, password); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); } }
  const passwordForm = <form onSubmit={submit}><label>{t('email')}<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label><label>{t('password')}<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <div className="hr-form-error" role="alert">{error}</div>}<button className="hr-button primary login-submit" disabled={busy}>{busy ? <Loader2 className="hr-spin" size={18} /> : null}{t('signIn')}<ArrowRight size={18} /></button></form>;
  return <main className="hr-login"><section className="hr-login-story"><Brand light /><div className="hr-login-copy"><span className="hr-eyebrow">JANAMEN · DIGITAL HR</span><h1>{t('loginTitle')}</h1><p>{t('loginText')}</p><div className="hr-login-illustration"><div className="hr-float-card"><CalendarDays size={26} /><span>{t('leave')}<strong>24 <small>{t('days')}</small></strong></span><span className="hr-check-round"><Check size={18} /></span></div><div className="hr-float-card second"><GraduationCap size={26} /><span>{t('academy')}<strong>{t('completed')}</strong></span><div className="hr-mini-bars"><i /><i /><i /><i /></div></div><span className="hr-orbit orbit-one" /><span className="hr-orbit orbit-two" /></div></div><div className="hr-login-security"><ShieldCheck size={17} />{t('loginPrivacy')}</div></section><section className="hr-login-form-side"><div className="hr-login-top"><span className="hr-jana-logo">jana<span>post</span></span><div className="hr-login-top-actions"><LanguagePicker lang={lang} change={setLang} t={t} /></div></div><div className="hr-login-form"><span className="hr-tag">DIGITAL HR</span><h2>{t('signIn')}</h2><p>{t('signInSubtitle')}</p><DemoAccounts access={demo} busy={busy} t={t} choose={onDemoLogin} />{authError && <div className="hr-form-error" role="alert">{authError}</div>}{demo.enabled ? <details className="hr-password-login"><summary>{t('passwordSignIn')}</summary>{passwordForm}</details> : passwordForm}{!demo.enabled && <details className="hr-demo-accounts"><summary>{t('demoAccounts')}<ChevronDown size={15} /></summary><div className="hr-demo-roles">{(['employee', 'manager', 'hr'] as Role[]).map(role => <button key={role} onClick={() => { setEmail(`${role}@janamen.demo`); setPassword(''); }}><span>{t(role)}</span><code>{role}@janamen.demo</code></button>)}</div><p>{t('demoPassword')}</p></details>}</div><div className="hr-login-footer"><span className="hr-demo-dot" />{t('demo')} · {t('demoNote')}</div></section></main>;
}

function Dashboard(props: CommonProps) {
  const { data, lang, t, open, navigate } = props;
  const ownRequests = data.requests.filter(request => request.employeeId === data.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const assigned = data.enrollments.filter(enrollment => enrollment.userId === data.user.id);
  const course = data.courses.find(course => assigned.some(enrollment => enrollment.courseId === course.id && !enrollment.passed)) || data.courses.find(course => assigned.some(enrollment => enrollment.courseId === course.id));
  const enrollment = assigned.find(enrollment => enrollment.courseId === course?.id);
  const manager = data.people.find(person => person.id === data.user.managerId);
  const managerName = data.user.managerName || manager?.name || t('none');
  const approvals = data.requests.filter(request => canApprove(request, data.user, data.people)).length;
  return <><header className="hr-dashboard-heading"><h1>{t('hello')}, {data.user.name.split(' ')[0]}</h1><div className="hr-dashboard-date"><CalendarDays size={20} aria-hidden="true" /><div><span>{t('today')}</span><time dateTime={new Date().toISOString()}>{formatToday(lang)}</time></div></div></header><ActionQueue data={data} lang={lang} t={t} openRequest={id => open({ kind: 'request', id })} openInquiry={id => open({ kind: 'inquiry', id })} /><section className="hr-welcome-banner"><div className="hr-banner-copy"><span className="hr-eyebrow">JANAMEN</span><h2>{t('heroTitle')}</h2><p>{t('heroText')}</p><div className="hr-banner-actions"><button className="hr-button white" onClick={() => open({ kind: 'newRequest' })}><Plus size={17} />{t('newRequest')}</button><button className="hr-button banner-ghost" onClick={() => navigate('assistant')}><MessageCircle size={17} />{t('askJanaMen')}<ArrowUpRight size={16} /></button></div></div><div className="hr-banner-art" aria-hidden="true"><div className="hr-art-circle outer" /><div className="hr-art-circle inner" /><div className="hr-art-card"><span className="hr-art-avatar"><Users size={32} /></span><span className="hr-art-line" /><span className="hr-art-line short" /><span className="hr-art-check"><Check size={25} /></span></div><span className="hr-art-star">✦</span><span className="hr-art-spark">✧</span></div></section><div className="hr-stat-grid"><article className="hr-stat"><span className="hr-stat-icon blue"><CalendarDays size={21} /></span><div><p>{t('available')}</p><strong>{Math.max(0, data.user.leaveBalance - data.user.leaveReserved)}<small>{t('days')}</small></strong><span>{data.user.leaveReserved} {t('days')} {t('reserved').toLowerCase()}</span></div></article><article className="hr-stat"><span className="hr-stat-icon violet"><GraduationCap size={22} /></span><div><p>{t('assignedCourses')}</p><strong>{assigned.length}<small>{t('academy')}</small></strong><span>{assigned.filter(enrollment => enrollment.passed).length} {t('completed').toLowerCase()}</span></div></article><article className="hr-stat"><span className="hr-stat-icon amber"><Clock3 size={21} /></span><div><p>{data.user.role === 'employee' ? t('reserved') : t('needsApproval')}</p><strong>{data.user.role === 'employee' ? ownRequests.filter(activeStatus).length : approvals}<small>{t('requestCount')}</small></strong><button className="hr-text-link" onClick={() => navigate(data.user.role === 'manager' ? 'team' : 'requests')}>{t('seeAll')}<ArrowRight size={13} /></button></div></article></div><div className="hr-dashboard-columns"><section className="hr-panel hr-profile-panel"><div className="hr-panel-heading"><h2>{t('profile')}</h2><button className="hr-text-link" onClick={() => navigate('profile')}>{t('openProfile')}<ArrowUpRight size={15} /></button></div><div className="hr-profile-identity"><Avatar person={data.user} size="large" /><div><h3>{data.user.name}</h3><p>{t(data.user.role)}</p><span>{data.user.email}</span></div></div><dl className="hr-profile-fields">{[[t('company'), data.user.company], [t('department'), data.user.department], [t('lineManager'), managerName], [t('hiredAt'), formatDate(data.user.hiredAt, lang)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="hr-profile-note"><ShieldCheck size={16} />{t('profileNote')}</p></section><section className="hr-panel hr-learning-panel"><div className="hr-panel-heading"><h2>{t('nextLearning')}</h2><button className="hr-text-link" onClick={() => navigate('academy')}><ArrowUpRight size={18} aria-label={t('seeAll')} /></button></div>{course ? <><div className="hr-learning-cover"><BookOpen size={37} /><span>JANA<br />ACADEMY</span><span className="hr-cover-dots" /></div><div className="hr-learning-content"><span className="hr-eyebrow">{course.category} · {course.durationMinutes} {t('minutes')}</span><h3>{localized(course.title, lang)}</h3><div className="hr-progress-label"><span>{t('progress')}</span><strong>{courseProgress(course, enrollment)}%</strong></div><div className="hr-progress"><i style={{ width: `${courseProgress(course, enrollment)}%` }} /></div><button className="hr-button secondary full" onClick={() => open({ kind: 'course', id: course.id })}>{enrollment?.passed ? t('reviewCourse') : t('continueLearning')}<ArrowRight size={16} /></button></div></> : <Empty icon={<GraduationCap size={28} />} title={t('noCourses')} text={t('noCoursesText')} />}</section></div><section className="hr-panel"><div className="hr-panel-heading"><h2>{t('recentRequests')}</h2><button className="hr-text-link" onClick={() => navigate('requests')}>{t('seeAll')}<ArrowRight size={15} /></button></div>{ownRequests.length ? <RequestTable requests={ownRequests.slice(0, 3)} {...props} /> : <Empty title={t('emptyRequests')} text={t('emptyRequestsText')} />}</section><PersonalNotifications {...props} /></>;
}

function RequestTable({ requests, lang, t, open, showEmployee = false }: Pick<CommonProps, 'lang' | 't' | 'open'> & { requests: LeaveRequest[]; showEmployee?: boolean }) {
  return <div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>{showEmployee ? t('employeeName') : t('request')}</th><th>{t('period')}</th><th>{t('daysLabel')}</th><th>{t('status')}</th><th><span className="hr-sr-only">{t('seeAll')}</span></th></tr></thead><tbody>{requests.map(request => <tr key={request.id} onClick={() => open({ kind: 'request', id: request.id })}><td><div className="hr-request-identity">{showEmployee ? <Avatar person={{ name: request.employeeName }} size="small" /> : <span className="hr-file-icon"><CalendarDays size={18} /></span>}<div><button className="hr-table-title" onClick={event => { event.stopPropagation(); open({ kind: 'request', id: request.id }); }}>{showEmployee ? request.employeeName : t('request')}</button><span>{showEmployee ? request.department : `${t('createdAt')}: ${formatDate(request.createdAt, lang)}`}</span></div></div></td><td>{formatDate(request.startDate, lang)}<span className="hr-table-subdate">— {formatDate(request.endDate, lang)}</span></td><td><strong>{request.days}</strong></td><td><Status request={request} t={t} /></td><td><ChevronRight size={17} className="hr-muted-icon" /></td></tr>)}</tbody></table></div>;
}

function RequestsPage(props: CommonProps) {
  const { data, t, open } = props;
  const [tab, setTab] = useState(data.user.role === 'employee' ? 'mine' : 'approvals');
  const [filter, setFilter] = useState('all');
  const requests = data.requests.filter(request => tab === 'mine' ? request.employeeId === data.user.id : tab === 'approvals' ? canApprove(request, data.user, data.people) : request.employeeId !== data.user.id).filter(request => tab === 'approvals' || filter === 'all' || request.status === filter).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <><div className="hr-page-intro"><div><span className="hr-eyebrow">{t('hrServices')}</span><h1>{t('requests')}</h1><p>{t('myRequestsDesc')}</p></div><button className="hr-button primary" onClick={() => open({ kind: 'newRequest' })}><Plus size={18} />{t('newRequest')}</button></div><section className="hr-panel"><div className="hr-list-toolbar"><div className="hr-tabs"><button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>{t('own')}<span>{data.requests.filter(request => request.employeeId === data.user.id).length}</span></button>{data.user.role !== 'employee' && <button className={tab === 'approvals' ? 'active' : ''} onClick={() => setTab('approvals')}>{t('approvals')}<span>{data.requests.filter(request => canApprove(request, data.user, data.people)).length}</span></button>}{data.user.role !== 'employee' && <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>{t('teamRequests')}</button>}</div>{tab !== 'approvals' && <Select aria-label={t('status')} className="hr-filter" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{t('all')}</option>{(['pending_manager', 'pending_hr', 'approved', 'rejected', 'cancelled'] as const).map(status => <option key={status} value={status}>{t(status)}</option>)}</Select>}</div>{requests.length ? <RequestTable {...props} requests={requests} showEmployee={tab !== 'mine'} /> : <Empty title={t(tab === 'approvals' ? 'noApprovals' : 'emptyRequests')} text={tab === 'mine' ? t('emptyRequestsText') : tab === 'approvals' ? t('noApprovalsText') : undefined}>{tab === 'mine' && <button className="hr-button secondary" onClick={() => open({ kind: 'newRequest' })}><Plus size={16} />{t('newRequest')}</button>}</Empty>}</section></>;
}

function NewRequest({ data, lang, t, mutate, close, open, navigate }: CommonProps & { close: () => void }) {
  const [startDate, setStartDate] = useState(''); const [endDate, setEndDate] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const days = startDate && endDate ? Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000) + 1 : 0;
  const available = data.user.leaveBalance - data.user.leaveReserved;
  const submission = useRef({ fingerprint: '', key: crypto.randomUUID() });
  const submitting = useRef(false);
  async function submit(event: FormEvent) { event.preventDefault(); if (submitting.current) return; setError(''); if (days < 1) return setError(t('badDates')); if (days > available) return setError(t('exceedsBalance')); submitting.current = true; setBusy(true); const fingerprint = JSON.stringify([startDate, endDate, reason]); if (submission.current.fingerprint !== fingerprint) submission.current = { fingerprint, key: crypto.randomUUID() }; try { const created = await mutate<LeaveRequest>('/requests', { startDate, endDate, reason, clientRequestId: submission.current.key }, t('requestSent')); navigate('requests'); open({ kind: 'request', id: created.id }); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { submitting.current = false; setBusy(false); } }
  return <Modal title={t('newRequest')} subtitle={`${data.user.name} · ${data.user.department}`} close={close} t={t}><form className="hr-form" onSubmit={submit}><div className="hr-leave-summary"><CalendarDays size={23} /><div><span>{t('available')}</span><strong>{available} {t('days')}</strong></div><span>{t('reserved')}: {data.user.leaveReserved}</span></div><div className="hr-form-grid"><label>{t('startDate')}<input type="date" required value={startDate} min={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Almaty' })} onChange={event => { setStartDate(event.target.value); if (endDate && endDate < event.target.value) setEndDate(event.target.value); }} /></label><label>{t('endDate')}<input type="date" required min={startDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Almaty' })} value={endDate} onChange={event => setEndDate(event.target.value)} /></label></div>{days > 0 && <div className={`hr-date-summary ${days > available ? 'over-limit' : ''}`}><span>{formatDate(startDate, lang)} — {formatDate(endDate, lang)}</span><strong>{days} {t('days')}</strong></div>}<label>{t('reason')} <span className="hr-optional">({t('optional')})</span><textarea maxLength={1500} rows={3} placeholder={t('reasonPlaceholder')} value={reason} onChange={event => setReason(event.target.value)} /></label><p className="hr-info-note"><ShieldCheck size={17} />{t('leavePolicy')}</p>{!data.user.managerId && <p className="hr-form-error" role="alert">{t('missingManager')}</p>}{error && <p className="hr-form-error" role="alert">{error}</p>}<div className="hr-form-actions"><button type="button" className="hr-button secondary" onClick={close}>{t('cancel')}</button><button className="hr-button primary" disabled={busy || days > available || !data.user.managerId}>{busy ? <Loader2 className="hr-spin" size={16} /> : <Send size={16} />}{t('sendRequest')}</button></div></form></Modal>;
}

function RequestDetail({ request, data, lang, t, mutate, open, close, refresh }: CommonProps & { request: LeaveRequest; close: () => void; refresh: () => Promise<void> }) {
  const [reason, setReason] = useState(''); const [rejecting, setRejecting] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const inputRef = useRef<HTMLInputElement>(null);
  const own = request.employeeId === data.user.id;
  async function action(action: 'approve' | 'reject' | 'cancel') { if (action === 'cancel' && !window.confirm(t('cancelConfirm'))) return; if (action === 'reject' && !reason.trim()) return; setBusy(true); setError(''); try { await mutate(`/requests/${request.id}/action`, { action, comment: reason, expectedStatus: request.status }); setRejecting(false); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); } }
  async function upload(file?: File) { if (!file) return; if (file.size > 10 * 1024 * 1024) { setError(t('fileTooLarge')); return; } setBusy(true); setError(''); try { await commitAndRefresh(() => api(`/requests/${request.id}/attachments`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file }), () => {}, refresh, () => setError(t('savedRefreshPending'))); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; } }
  const stage = request.status === 'pending_manager' ? 1 : request.status === 'pending_hr' ? 2 : request.status === 'approved' ? 3 : request.history.some(item => item.action === 'manager_approved') ? 2 : 1;
  return <Modal title={t('request')} subtitle={`${request.employeeName} · ${formatDate(request.createdAt, lang)}`} close={close} t={t} wide><div className="hr-detail-top"><Status request={request} t={t} /><span className="hr-detail-id">#{request.id.slice(0, 8).toUpperCase()}</span></div><div className="hr-approval-track">{['stage1', 'stage2', 'stage3'].map((label, index) => <div key={label} className={index < stage ? 'complete' : index === stage && activeStatus(request) ? 'current' : ''}><span>{index < stage ? <Check size={15} /> : index + 1}</span><strong>{t(label)}</strong>{index < 2 && <i />}</div>)}</div><RequestNextStep request={request} data={data} lang={lang} t={t} /><div className="hr-request-dates"><CalendarDays size={24} /><div><span>{t('period')}</span><strong>{formatDate(request.startDate, lang)} — {formatDate(request.endDate, lang)}</strong></div><span className="hr-day-count">{request.days}<small>{t('days')}</small></span></div><dl className="hr-detail-fields"><div><dt>{t('submittedBy')}</dt><dd>{request.employeeName}</dd></div><div><dt>{t('department')}</dt><dd>{request.department}</dd></div></dl>{request.reason && <div className="hr-comment"><span>{t('reason')}</span><p>{request.reason}</p></div>}<section className="hr-detail-section"><div className="hr-panel-heading"><h3>{t('attachments')}</h3>{own && request.status === 'pending_manager' && <button className="hr-text-link" disabled={busy} onClick={() => inputRef.current?.click()}><Paperclip size={15} />{t('attachFile')}</button>}<input ref={inputRef} className="hr-hidden-input" type="file" onChange={event => upload(event.target.files?.[0])} /></div><p className="hr-section-caption">{t('attachmentsHint')}{request.status === 'pending_hr' && ` ${t('attachmentsLocked')}`}</p>{request.attachments.length ? <div className="hr-attachment-list">{request.attachments.map(file => <a href={`/api/attachments/${file.id}`} key={file.id} className="hr-attachment" download><span className="hr-file-icon"><FileText size={18} /></span><div><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB</span></div><ArrowDownToLine size={17} aria-label={t('download')} /></a>)}</div> : <p className="hr-subtle-text">{t('noAttachments')}</p>}</section><section className="hr-detail-section"><h3>{t('history')}</h3><ol className="hr-history">{request.history.map(item => <li key={item.id}><span className="hr-history-dot"><Check size={11} /></span><div><strong>{t(item.action)}</strong><p>{item.actorName} <span>· {formatDate(item.at, lang, true)}</span></p>{item.comment && <blockquote>{item.comment}</blockquote>}</div></li>)}</ol></section>{error && <p className="hr-form-error" role="alert">{error}</p>}{rejecting && canApprove(request, data.user, data.people) && <label className="hr-reject-box">{t('rejectReason')}<textarea required rows={3} value={reason} placeholder={t('rejectPlaceholder')} onChange={event => setReason(event.target.value)} maxLength={1500} /></label>}{request.status === 'approved' && <section className="hr-detail-section hr-document-ready"><div><h3>{t('requestDocument')}</h3><p className="hr-section-caption">{t('documentHint')}</p></div><a className="hr-button secondary" href={`/api/requests/${encodeURIComponent(request.id)}/document?lang=${lang}`} target="_blank" rel="noreferrer"><FileText size={17} />{t('printDocument')}</a><button className="hr-button secondary" onClick={() => open({ kind: 'documentProcessing', id: request.id })}><FileText size={17} />{t('documentProcessingTitle')}</button></section>}<div className="hr-form-actions">{own && activeStatus(request) && <button className="hr-button danger-ghost" disabled={busy} onClick={() => action('cancel')}>{t('cancelRequest')}</button>}{canApprove(request, data.user, data.people) && <>{rejecting ? <><button className="hr-button secondary" onClick={() => setRejecting(false)}>{t('cancel')}</button><button className="hr-button danger" disabled={busy || !reason.trim()} onClick={() => action('reject')}><XCircle size={16} />{t('reject')}</button></> : <><button className="hr-button secondary" disabled={busy} onClick={() => setRejecting(true)}>{t('reject')}</button><button className="hr-button primary" disabled={busy} onClick={() => action('approve')}>{busy ? <Loader2 size={16} className="hr-spin" /> : <Check size={17} />}{request.status === 'pending_hr' ? t('approveFinal') : t('approve')}</button></>}</>}</div></Modal>;
}

function TeamPage(props: CommonProps) {
  const { data, t } = props;
  const people = data.people.filter(person => person.managerId === data.user.id);
  const pending = data.requests.filter(request => canApprove(request, data.user, data.people));
  return <><div className="hr-page-intro"><div><span className="hr-eyebrow">{t('peopleTeam')}</span><h1>{t('team')}</h1><p>{t('teamDesc')}</p></div><span className="hr-count-label">{people.length} {t('peopleCount')}</span></div><p className="hr-info-note"><ShieldCheck size={17} />{t('teamPrivacy')}</p><div className="hr-team-grid">{people.map(person => <article key={person.id} className="hr-panel hr-team-person"><Avatar person={person} /><div><h3>{person.name}</h3><p>{t(person.role)}</p><span>{person.department}</span></div></article>)}</div>{!people.length && <section className="hr-panel"><Empty icon={<Users size={28} />} title={t('teamEmpty')} /></section>}<section className="hr-panel"><div className="hr-panel-heading"><h2>{t('needsApproval')}</h2><span className="hr-tiny-tag">{pending.length}</span></div>{pending.length ? <RequestTable {...props} requests={pending} showEmployee /> : <Empty icon={<CheckCheck size={28} />} title={t('noApprovals')} text={t('noApprovalsText')} />}</section></>;
}

function AcademyPage(props: CommonProps) {
  const { data, lang, t, open } = props;
  const [tab, setTab] = useState(data.user.role === 'hr' ? 'catalog' : 'mine');
  const previousCourseCount = useRef(data.courses.length);
  useEffect(() => {
    if (data.user.role === 'hr' && data.courses.length > previousCourseCount.current) setTab('catalog');
    previousCourseCount.current = data.courses.length;
  }, [data.courses.length, data.user.role]);
  const own = data.enrollments.filter(enrollment => enrollment.userId === data.user.id);
  const courses = data.courses.filter(course => tab === 'catalog' || own.some(enrollment => enrollment.courseId === course.id));
  return <><div className="hr-page-intro"><div><span className="hr-eyebrow">{t('learningEyebrow')}</span><h1>{t('academy')}</h1><p>{t('academyDesc')}</p></div>{data.user.role === 'hr' && <button className="hr-button primary" onClick={() => open({ kind: 'editor' })}><Plus size={17} />{t('newCourse')}</button>}</div><div className="hr-academy-banner"><span className="hr-academy-icon"><GraduationCap size={35} /></span><div><h2>{t('learningDesc')}</h2><p>{t('assignedCourses')}: <strong>{own.length}</strong><span>·</span>{t('completedCourses')}: <strong>{own.filter(enrollment => enrollment.passed).length}</strong></p></div><span className="hr-academy-decoration" aria-hidden="true">✦</span></div><div className="hr-tabs hr-academy-tabs"><button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>{t('myCourses')}<span>{own.length}</span></button><button className={tab === 'catalog' ? 'active' : ''} onClick={() => setTab('catalog')}>{t('catalog')}<span>{data.courses.length}</span></button></div>{courses.length ? <div className="hr-course-grid">{courses.map((course, index) => { const enrollment = own.find(enrollment => enrollment.courseId === course.id); const progress = courseProgress(course, enrollment); return <article key={course.id} className="hr-panel hr-course-card"><div className={`hr-course-cover cover-${index % 3}`}><span className="hr-course-category">{course.category}</span><BookOpen size={49} /><span className="hr-cover-circle" /><span className="hr-cover-spark">✦</span><span className="hr-cover-word">ACADEMY</span></div><div className="hr-course-body"><div className="hr-course-meta"><span><Clock3 size={13} />{course.durationMinutes} {t('minutes')}</span><span><BookOpen size={13} />{course.lessons.length} {t('lessons')}</span>{!course.published && <span>{t('draft')}</span>}</div><h2>{localized(course.title, lang)}</h2><p>{localized(course.description, lang)}</p><div className="hr-progress-label"><span>{enrollment?.passed ? t('completed') : enrollment ? progress ? t('inProgress') : t('notStarted') : t('notAssigned')}</span><strong>{progress}%</strong></div><div className="hr-progress"><i style={{ width: `${progress}%` }} /></div><button className="hr-button secondary full" onClick={() => open({ kind: 'course', id: course.id })}>{enrollment?.passed ? t('reviewCourse') : progress ? t('continueLearning') : t('startLearning')}<ArrowRight size={16} /></button>{data.user.role === 'hr' && <div className="hr-course-admin"><button onClick={() => open({ kind: 'editor', course })}><Pencil size={14} />{t('edit')}</button><button disabled={!course.published} title={!course.published ? t('publishBeforeAssign') : undefined} onClick={() => open({ kind: 'assign', id: course.id })}><Users size={14} />{t('assign')}</button></div>}</div></article>; })}</div> : <section className="hr-panel"><Empty icon={<GraduationCap size={28} />} title={t('noCourses')} text={data.user.role === 'hr' ? t('hrCoursesHint') : t('noCoursesText')}>{data.user.role === 'hr' && <button className="hr-button secondary" onClick={() => open({ kind: 'editor' })}><Plus size={16} />{t('newCourse')}</button>}</Empty></section>}</>;
}

function CourseEditor({ course, lang, t, mutate, close }: { course?: Course; lang: Lang; t: Translator; mutate: Mutation; close: () => void }) {
  const [draft, setDraft] = useState<Course>(() => course ? structuredClone(course) : { id: '', title: emptyLocalized(), description: emptyLocalized(), category: 'Onboarding', durationMinutes: 15, published: true, lessons: [{ id: crypto.randomUUID(), title: emptyLocalized(), content: emptyLocalized() }], quiz: [{ id: crypto.randomUUID(), prompt: emptyLocalized(), options: [emptyLocalized(), emptyLocalized(), emptyLocalized()], correctIndex: 0 }], passScore: 70, createdAt: '', updatedAt: '', cover: 'blue' });
  const [contentLang, setContentLang] = useState<Lang>(lang); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const change = (update: Partial<Course>) => setDraft(previous => ({ ...previous, ...update }));
  async function save(event: FormEvent) { event.preventDefault(); setError(''); if (!draft.title.ru.trim() || !draft.description.ru.trim() || !draft.lessons.length || !draft.quiz.length || draft.lessons.some(lesson => !lesson.title.ru.trim() || !lesson.content.ru.trim()) || draft.quiz.some(question => !question.prompt.ru.trim() || question.options.some(option => !option.ru.trim()))) { setError(t('contentRequired')); setContentLang('ru'); return; } setBusy(true); try { await mutate('/courses', { ...draft, id: draft.id || undefined }); close(); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); } }
  return <Modal title={t('editor')} subtitle={course ? localized(course.title, lang) : t('newCourse')} close={close} t={t} wide><form className="hr-form hr-editor" onSubmit={save}><div className="hr-editor-lang"><label>{t('contentLanguage')}<Select aria-label={t('contentLanguage')}  value={contentLang} onChange={event => setContentLang(event.target.value as Lang)}><option value="ru">Русский</option><option value="kk">Қазақша</option><option value="en">English</option></Select></label><p>{t('translationNote')}</p></div><label>{t('title')}<input value={draft.title[contentLang]} maxLength={160} onChange={event => change({ title: { ...draft.title, [contentLang]: event.target.value } })} /></label><label>{t('description')}<textarea rows={2} value={draft.description[contentLang]} maxLength={1200} onChange={event => change({ description: { ...draft.description, [contentLang]: event.target.value } })} /></label><div className="hr-form-grid"><label>{t('category')}<input required maxLength={80} value={draft.category} onChange={event => change({ category: event.target.value })} /></label><label>{t('duration')}<input type="number" required min="1" max="600" value={draft.durationMinutes} onChange={event => change({ durationMinutes: Number(event.target.value) })} /></label></div><label className="hr-checkbox"><input type="checkbox" checked={draft.published} onChange={event => change({ published: event.target.checked })} />{t('published')}</label><div className="hr-editor-heading"><h3>{t('academy')} · {t('lessons')}</h3><button type="button" className="hr-text-link" onClick={() => change({ lessons: [...draft.lessons, { id: crypto.randomUUID(), title: emptyLocalized(), content: emptyLocalized() }] })}><Plus size={15} />{t('addLesson')}</button></div>{draft.lessons.map((lesson, index) => <div className="hr-editor-block" key={lesson.id}><div className="hr-editor-block-head"><strong>{t('lesson')} {index + 1}</strong><button type="button" className="hr-icon-button" aria-label={`${t('remove')} ${t('lesson')} ${index + 1}`} onClick={() => change({ lessons: draft.lessons.filter(item => item.id !== lesson.id) })}><Trash2 size={16} /></button></div><label>{t('lessonTitle')}<input maxLength={180} value={lesson.title[contentLang]} onChange={event => change({ lessons: draft.lessons.map(item => item.id === lesson.id ? { ...item, title: { ...item.title, [contentLang]: event.target.value } } : item) })} /></label><label>{t('lessonContent')}<textarea rows={5} value={lesson.content[contentLang]} maxLength={12000} onChange={event => change({ lessons: draft.lessons.map(item => item.id === lesson.id ? { ...item, content: { ...item.content, [contentLang]: event.target.value } } : item) })} /></label><label>{t('resourceUrl')}<input type="url" pattern="https://.*" value={lesson.resourceUrl || ''} onChange={event => change({ lessons: draft.lessons.map(item => item.id === lesson.id ? { ...item, resourceUrl: event.target.value } : item) })} /></label></div>)}<div className="hr-editor-heading"><h3>{t('quiz')}</h3><button type="button" className="hr-text-link" onClick={() => change({ quiz: [...draft.quiz, { id: crypto.randomUUID(), prompt: emptyLocalized(), options: [emptyLocalized(), emptyLocalized(), emptyLocalized()], correctIndex: 0 }] })}><Plus size={15} />{t('addQuestion')}</button></div><label>{t('passScore')}<input type="number" min="1" max="100" required value={draft.passScore} onChange={event => change({ passScore: Number(event.target.value) })} /></label>{draft.quiz.map((question, index) => <div className="hr-editor-block" key={question.id}><div className="hr-editor-block-head"><strong>{t('question')} {index + 1}</strong><button type="button" className="hr-icon-button" aria-label={`${t('remove')} ${t('question')} ${index + 1}`} onClick={() => change({ quiz: draft.quiz.filter(item => item.id !== question.id) })}><Trash2 size={16} /></button></div><label>{t('question')}<input maxLength={1000} value={question.prompt[contentLang]} onChange={event => change({ quiz: draft.quiz.map(item => item.id === question.id ? { ...item, prompt: { ...item.prompt, [contentLang]: event.target.value } } : item) })} /></label>{question.options.map((option, optionIndex) => <label key={optionIndex}>{t('answer')} {optionIndex + 1}<input maxLength={500} value={option[contentLang]} onChange={event => change({ quiz: draft.quiz.map(item => item.id === question.id ? { ...item, options: item.options.map((value, idx) => idx === optionIndex ? { ...value, [contentLang]: event.target.value } : value) } : item) })} /></label>)}<label>{t('correctAnswer')}<Select aria-label={t('correctAnswer')}  value={question.correctIndex ?? 0} onChange={event => change({ quiz: draft.quiz.map(item => item.id === question.id ? { ...item, correctIndex: Number(event.target.value) } : item) })}>{question.options.map((_, idx) => <option key={idx} value={idx}>{t('answer')} {idx + 1}</option>)}</Select></label></div>)}{error && <p className="hr-form-error" role="alert">{error}</p>}<div className="hr-form-actions"><button type="button" className="hr-button secondary" onClick={close}>{t('cancel')}</button><button className="hr-button primary" disabled={busy}>{busy ? <Loader2 className="hr-spin" size={16} /> : <Check size={16} />}{t('save')}</button></div></form></Modal>;
}

function AssignCourse({ course, data, t, lang, mutate, close }: CommonProps & { course: Course; close: () => void }) {
  const [selected, setSelected] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { await mutate(`/courses/${course.id}/assign`, { userIds: selected }); close(); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); } }
  return <Modal title={t('assignCourse')} subtitle={localized(course.title, lang)} close={close} t={t}><form onSubmit={submit} className="hr-form"><p className="hr-section-caption">{t('assignNote')}</p><div className="hr-assignment-list">{data.people.map(person => { const assigned = data.enrollments.some(enrollment => enrollment.courseId === course.id && enrollment.userId === person.id); return <label className="hr-assignment-person" key={person.id}><input type="checkbox" checked={selected.includes(person.id)} onChange={event => setSelected(event.target.checked ? [...selected, person.id] : selected.filter(id => id !== person.id))} /><Avatar person={person} size="small" /><span><strong>{person.name}</strong><small>{person.department}</small></span>{assigned && <span className="hr-tiny-tag">{t('assigned')}</span>}</label>; })}</div>{error && <p className="hr-form-error" role="alert">{error}</p>}<div className="hr-form-actions"><button type="button" className="hr-button secondary" onClick={close}>{t('cancel')}</button><button className="hr-button primary" disabled={busy || !selected.length}>{busy && <Loader2 className="hr-spin" size={16} />}{t('assign')} ({selected.length})</button></div></form></Modal>;
}

interface IntegrationCatalog { integrations: { id: string; mode: 'mock' | 'off'; connected: boolean }[]; }
interface PersonnelPreview { applied: false; employees: { externalId: string; name: string; department: string }[]; leaveBalances: { employeeExternalId: string; availableDays: number }[]; }
interface IntegrationDocument { id: string; requestId: string; status: 'registered' | 'in_review' | 'completed' | 'rejected'; updatedAt: string; }
function IntegrationsPage({ data, lang, t, navigate }: CommonProps) {
  const [catalog, setCatalog] = useState<IntegrationCatalog | null>(null);
  const [preview, setPreview] = useState<PersonnelPreview | null>(null);
  const [document, setDocument] = useState<IntegrationDocument | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api<IntegrationCatalog>('/integrations', { signal: controller.signal }).then(setCatalog).catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    });
    return () => controller.abort();
  }, []);
  const enabled = (id: string) => catalog?.integrations.some(item => item.id === id && item.mode === 'mock');
  const approved = data.requests.filter(request => request.status === 'approved');
  const requestId = selected || approved[0]?.id || '';
  async function perform(task: () => Promise<void>) {
    setBusy(true); setError('');
    try { await task(); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); }
    finally { setBusy(false); }
  }
  async function updateDocument(status: string) {
    if (!document) return;
    const result = await api<{ document: IntegrationDocument }>(`/integrations/documentolog/documents/${document.id}/mock-transition`, { method: 'POST', body: JSON.stringify({ status }) });
    setDocument(result.document);
  }
  return <>
    <div className="hr-page-intro"><div><span className="hr-eyebrow">JANAMEN · HR</span><h1>{t('integrations')}</h1><p>{t('integrationIntro')}</p></div></div>
    <p className="hr-integration-notice"><ShieldCheck size={18} />{t('integrationNotice')}</p>
    {error && <p className="hr-form-error" role="alert">{error}</p>}
    {!catalog && !error && <p role="status">{t('connecting')}</p>}
    <div className="hr-integration-grid">
      <section className="hr-integration-card">
        <header><h2>1С:ЗУП</h2><span className="hr-tiny-tag">{enabled('1c-zup') ? t('integrationMock') : t('integrationOff')}</span></header>
        <p>{t('integrationPersonnel')}</p>
        <button className="hr-button primary" disabled={busy || !enabled('1c-zup')} onClick={() => perform(async () => setPreview(await api<PersonnelPreview>('/integrations/1c-zup/sync-preview', { method: 'POST', body: '{}' })))}>{t('integrationPreview')}</button>
        {preview && <div aria-live="polite"><p className="hr-integration-result">{t('integrationPreviewResult')}</p><ul className="hr-integration-people">{preview.employees.map(person => <li key={person.externalId}><div><strong>{person.name}</strong><span>{person.department}</span></div><b>{preview.leaveBalances.find(balance => balance.employeeExternalId === person.externalId)?.availableDays ?? '—'} {t('days')}</b></li>)}</ul></div>}
      </section>
      <section className="hr-integration-card">
        <header><h2>Documentolog</h2><span className="hr-tiny-tag">{enabled('documentolog') ? t('integrationMock') : t('integrationOff')}</span></header>
        <p>{t('integrationDocuments')}</p>
        {approved.length ? <><label className="hr-integration-select">{t('integrationApproved')}<Select aria-label={t('integrationApproved')}  value={requestId} disabled={busy} onChange={event => { setSelected(event.target.value); setDocument(null); }}>{approved.map(request => <option value={request.id} key={request.id}>{request.employeeName} · {formatDate(request.startDate, lang)} — {formatDate(request.endDate, lang)}</option>)}</Select></label><button className="hr-button primary" disabled={busy || !enabled('documentolog') || !requestId} onClick={() => perform(async () => { const result = await api<{ document: IntegrationDocument }>('/integrations/documentolog/documents', { method: 'POST', body: JSON.stringify({ requestId }) }); setDocument(result.document); })}>{t('integrationRegister')}</button></> : <p>{t('integrationNoApproved')} <button className="hr-text-link" onClick={() => navigate('requests')}>{t('requests')}</button></p>}
        {document && <div className="hr-integration-document" aria-live="polite"><strong>{t(`integrationStatus_${document.status}`)}</strong><code>{document.id}</code><small>{formatDate(document.updatedAt, lang, true)}</small><div className="hr-integration-actions">{document.status === 'registered' && <button className="hr-button secondary" disabled={busy} onClick={() => perform(() => updateDocument('in_review'))}>{t('integrationReview')}</button>}{document.status === 'in_review' && <button className="hr-button secondary" disabled={busy} onClick={() => perform(() => updateDocument('completed'))}>{t('integrationComplete')}</button>}{['registered', 'in_review'].includes(document.status) && <button className="hr-button secondary" disabled={busy} onClick={() => perform(() => updateDocument('rejected'))}>{t('integrationReject')}</button>}</div></div>}
      </section>
    </div>
  </>;
}

function InquiryStatus({ inquiry, t }: { inquiry: HrInquiry; t: Translator }) {
  return <span className={`hr-status hr-inquiry-status ${inquiry.status}`}><i />{t(inquiry.status === 'answered' ? 'inquiryAnswered' : 'inquiryOpen')}</span>;
}

function HrInquiriesPage({ data, lang, t, open }: CommonProps) {
  const isHr = data.user.role === 'hr';
  const [filter, setFilter] = useState<'all' | 'open' | 'answered'>(isHr ? 'open' : 'all');
  const inquiries = [...(data.hrInquiries ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const filtered = inquiries.filter(inquiry => filter === 'all' || inquiry.status === filter);
  return <><div className="hr-page-intro"><div><span className="hr-eyebrow">{t('hrSupport')}</span><h1>{t(isHr ? 'hrInbox' : 'hrInquiries')}</h1><p>{t(isHr ? 'hrInboxDesc' : 'hrInquiriesDesc')}</p></div><button className="hr-button primary" onClick={() => open({ kind: 'escalate', question: '' })}><Plus size={16} />{t('escalateToHr')}</button></div>
    <section className="hr-panel"><div className="hr-tabs hr-inquiry-tabs" role="group" aria-label={t('status')}>{(['open', 'all', 'answered'] as const).map(value => <button key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{t(value === 'all' ? 'all' : value === 'open' ? 'inquiryPending' : 'inquiryResolved')}<span>{inquiries.filter(inquiry => value === 'all' || inquiry.status === value).length}</span></button>)}</div>
      {filtered.length ? <div className="hr-inquiry-list">{filtered.map(inquiry => <button key={inquiry.id} className="hr-inquiry-row" onClick={() => open({ kind: 'inquiry', id: inquiry.id })}>
        <span className="hr-inquiry-icon"><MessageCircle size={20} /></span><span className="hr-inquiry-copy"><strong>{inquiry.question}</strong><span>{inquiry.authorName} · {formatDate(inquiry.createdAt, lang, true)}</span>{inquiry.answer && <small>{inquiry.answeredByName}: {inquiry.answer}</small>}</span><InquiryStatus inquiry={inquiry} t={t} /><ChevronRight size={17} />
      </button>)}</div> : <Empty icon={<MessageCircle size={28} />} title={t(inquiries.length ? 'inquiryFilterEmpty' : 'inquiryEmpty')} text={!inquiries.length ? t('inquiryEmptyText') : undefined} />}
    </section></>;
}

function EscalateInquiry({ question: initialQuestion, language, lang, t, mutate, open, close }: Pick<CommonProps, 'lang' | 't' | 'mutate' | 'open'> & { question: string; language?: Lang; close: () => void }) {
  const [question, setQuestion] = useState(initialQuestion);
  const [questionLanguage] = useState(language || lang);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const requestRef = useRef({ id: crypto.randomUUID(), question: initialQuestion.trim() });
  const inFlight = useRef(false);
  const safeClose = useCallback(() => { if (!inFlight.current) close(); }, [close]);
  async function submit(event: FormEvent) {
    event.preventDefault(); const text = question.trim();
    if (!text || inFlight.current) return;
    if (requestRef.current.question !== text) requestRef.current = { id: crypto.randomUUID(), question: text };
    inFlight.current = true; setBusy(true); setError('');
    try {
      const inquiry = await mutate<HrInquiry>('/hr-inquiries', { question: text, language: questionLanguage, clientRequestId: requestRef.current.id }, t('inquirySent'));
      if (mounted.current) open({ kind: 'inquiry', id: inquiry.id });
    } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : t('networkError')); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  return <Modal title={t('escalateToHr')} subtitle={t('inquiryConfirm')} close={safeClose} t={t}><form className="hr-form hr-inquiry-form" onSubmit={submit}>
    <p className="hr-info-note"><ShieldCheck size={17} />{t('inquiryPrivacy')}</p>
    <label>{t('inquiryQuestion')}<textarea required maxLength={1200} rows={5} value={question} disabled={busy} onChange={event => { setQuestion(event.target.value); setError(''); }} /><small className="hr-inquiry-counter">{question.length} / 1200</small></label>
    {error && <p className="hr-form-error" role="alert">{error}</p>}
    <div className="hr-form-actions"><button type="button" className="hr-button secondary" disabled={busy} onClick={safeClose}>{t('cancel')}</button><button className="hr-button primary" disabled={busy || !question.trim()}>{busy ? <Loader2 size={16} className="hr-spin" /> : <Send size={16} />}{t('escalateToHr')}</button></div>
  </form></Modal>;
}

function InquiryDetail({ inquiry, data, lang, t, mutate, close }: CommonProps & { inquiry: HrInquiry; close: () => void }) {
  const [answer, setAnswer] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const inFlight = useRef(false);
  const mayAnswer = data.user.role === 'hr' && inquiry.authorId !== data.user.id && inquiry.status === 'open';
  const safeClose = useCallback(() => { if (!inFlight.current) close(); }, [close]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (inFlight.current || !answer.trim() || !mayAnswer) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await mutate<HrInquiry>(`/hr-inquiries/${inquiry.id}/answer`, { answer: answer.trim() }, t('inquiryAnswerSent')); setAnswer(''); }
    catch (error) { setError(error instanceof Error ? error.message : t('networkError')); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <Modal title={t('inquiryDetail')} close={safeClose} t={t}><article className="hr-inquiry-detail">
    <InquiryStatus inquiry={inquiry} t={t} />
    <dl className="hr-detail-fields"><div><dt>{t('inquiryAuthor')}</dt><dd>{inquiry.authorName}</dd></div><div><dt>{t('createdAt')}</dt><dd>{formatDate(inquiry.createdAt, lang, true)}</dd></div><div><dt>{t('inquiryLanguage')}</dt><dd lang={inquiry.language}>{({ ru: 'Русский', kk: 'Қазақша', en: 'English' })[inquiry.language]}</dd></div></dl>
    <section className="hr-inquiry-question"><h3>{t('inquiryQuestion')}</h3><p lang={inquiry.language}>{inquiry.question}</p></section>
    {inquiry.status === 'answered' ? <section className="hr-inquiry-response"><span className="hr-inquiry-human"><Users size={16} />{t('inquiryHumanAnswer')}</span><h3>{t('inquiryHrAnswer')}</h3><p>{inquiry.answer}</p><footer><strong>{inquiry.answeredByName}</strong><time dateTime={inquiry.answeredAt || undefined}>{inquiry.answeredAt ? formatDate(inquiry.answeredAt, lang, true) : ''}</time></footer></section>
      : mayAnswer ? <form className="hr-form hr-inquiry-form" onSubmit={submit}><label>{t('inquiryAnswerLabel')}<textarea required maxLength={4000} rows={5} value={answer} disabled={busy} onChange={event => { setAnswer(event.target.value); setError(''); }} /><small>{t('inquiryAnswerHint')}</small><small className="hr-inquiry-counter">{answer.length} / 4000</small></label>{error && <p className="hr-form-error" role="alert">{error}</p>}<div className="hr-form-actions"><button className="hr-button primary" disabled={busy || !answer.trim()}>{busy ? <Loader2 size={16} className="hr-spin" /> : <Send size={16} />}{t('inquirySendAnswer')}</button></div></form>
      : <p className="hr-info-note"><Clock3 size={17} />{t(data.user.role === 'hr' && inquiry.authorId === data.user.id ? 'inquiryOwnHr' : 'inquiryWaitingText')}</p>}
  </article></Modal>;
}

function openNotificationTarget(item: Notification, { data, navigate, open }: CommonProps) {
  if (isDocumentNotification(item)) {
    navigate('requests');
    open({ kind: 'documentProcessing', id: item.entityId! });
    return;
  }
  navigate(item.view);
  if (!item.entityId) return;
  if (item.view === 'requests' && data.requests.some(request => request.id === item.entityId)) open({ kind: 'request', id: item.entityId });
  if (item.view === 'hrInquiries' && data.hrInquiries.some(inquiry => inquiry.id === item.entityId)) open({ kind: 'inquiry', id: item.entityId });
  if (item.view === 'academy' && data.courses.some(course => course.id === item.entityId)) open({ kind: 'course', id: item.entityId });
}

function PersonalNotifications(props: CommonProps) {
  const { data, lang, t, mutate, navigate } = props;
  const all = notificationOverview(data.notifications);
  const unread = all.filter(group => group.unreadIds.length).length;
  return <section className="hr-panel hr-personal-notifications">
    <div className="hr-panel-heading"><h2>{t('notifications')}{unread > 0 && <span className="hr-personal-count">{unread}</span>}</h2>{all.length > 0 && <button className="hr-text-link" onClick={() => navigate('notifications')}>{t('allNotifications')}<ArrowRight size={15} /></button>}</div>
    {all.length ? <NotificationList preview data={data} lang={lang} t={t} mutate={mutate} groups={all.slice(0, 3)} openNotification={item => openNotificationTarget(item, props)} /> : <p className="hr-notice-preview-empty">{t('noticeEmptyHelp')}</p>}
  </section>;
}

function PeoplePage({ data, lang, t, open }: CommonProps) {
  const [search, setSearch] = useState(''); const people = data.people.filter(person => `${person.name} ${person.email} ${person.department}`.toLowerCase().includes(search.toLowerCase()));
  return <><div className="hr-page-intro"><div><span className="hr-eyebrow">{t('peopleEyebrow')}</span><h1>{t('people')}</h1><p>{t('peopleDesc')}</p></div><button className="hr-button primary" onClick={() => open({ kind: 'person' })}><Plus size={17} />{t('addPerson')}</button></div><section className="hr-panel"><div className="hr-list-toolbar"><span className="hr-count-label">{data.people.length} {t('peopleCount')}</span><div className="hr-inline-search"><Search size={16} /><input aria-label={t('search')} placeholder={t('employeeName')} value={search} onChange={event => setSearch(event.target.value)} /></div></div><div className="hr-table-wrap"><table className="hr-table hr-people-table"><thead><tr><th>{t('employeeName')}</th><th>{t('department')}</th><th>{t('role')}</th><th>{t('lineManager')}</th><th>{t('hiredAt')}</th></tr></thead><tbody>{people.map(person => <tr key={person.id}><td><div className="hr-request-identity"><Avatar person={person} size="small" /><div><button className="hr-table-title" onClick={() => open({ kind: 'employeeProfile', id: person.id })}>{person.name}</button><span>{person.email}</span></div></div></td><td><strong>{person.department}</strong><span className="hr-table-subdate">{person.position}</span></td><td><span className={`hr-role-tag role-${person.role}`}>{t(person.role)}</span></td><td>{data.people.find(manager => manager.id === person.managerId)?.name || '—'}</td><td>{formatDate(person.hiredAt, lang)}</td></tr>)}</tbody></table>{!people.length && <Empty icon={<Search size={26} />} title={t('noResults')} />}</div></section></>;
}

function AddPerson({ data, t, mutate, close }: CommonProps & { close: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'employee' as Role, department: '', position: '', managerId: '', hiredAt: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Almaty' }), leaveBalance: 24 }); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const change = (field: string, value: string | number) => setForm(previous => ({ ...previous, [field]: value }));
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { await mutate('/people', { ...form, managerId: form.managerId || null }, t('personCreated')); close(); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); } }
  return <Modal title={t('addPerson')} close={close} t={t}><form className="hr-form" onSubmit={submit}><label>{t('name')}<input required maxLength={120} autoComplete="off" value={form.name} onChange={event => change('name', event.target.value)} /></label><div className="hr-form-grid"><label>{t('email')}<input type="email" required autoComplete="off" value={form.email} onChange={event => change('email', event.target.value)} /></label><label>{t('role')}<Select aria-label={t('role')}  value={form.role} onChange={event => change('role', event.target.value)}>{(['employee', 'manager', 'hr'] as Role[]).map(role => <option key={role} value={role}>{t(role)}</option>)}</Select></label></div><label>{t('password')}<input type="password" minLength={10} maxLength={200} required autoComplete="new-password" value={form.password} onChange={event => change('password', event.target.value)} /><small>{t('passwordHint')}</small></label><div className="hr-form-grid"><label>{t('department')}<input required maxLength={120} value={form.department} onChange={event => change('department', event.target.value)} /></label><label>{t('position')}<input required maxLength={120} value={form.position} onChange={event => change('position', event.target.value)} /></label></div><label>{t('lineManager')}<Select aria-label={t('lineManager')}  value={form.managerId} onChange={event => change('managerId', event.target.value)}><option value="">{t('none')}</option>{data.people.filter(person => person.role === 'manager' || person.role === 'hr').map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</Select></label><div className="hr-form-grid"><label>{t('hiredAt')}<input required type="date" value={form.hiredAt} onChange={event => change('hiredAt', event.target.value)} /></label><label>{t('initialBalance')}<input type="number" min="0" max="365" required value={form.leaveBalance} onChange={event => change('leaveBalance', Number(event.target.value))} /></label></div>{error && <p className="hr-form-error" role="alert">{error}</p>}<div className="hr-form-actions"><button type="button" className="hr-button secondary" onClick={close}>{t('cancel')}</button><button className="hr-button primary" disabled={busy}>{busy ? <Loader2 className="hr-spin" size={16} /> : <Plus size={16} />}{t('addPerson')}</button></div></form></Modal>;
}

function ProfileCard({ person, data, lang, t, open }: CommonProps & { person: Person }) {
  const fields = [
    [t('name'), person.name], [t('employeeNumber'), person.employeeNumber || '—'],
    [t('email'), person.email], [t('phone'), person.phone || '—'],
    [t('company'), person.company], [t('department'), person.department],
    [t('position'), person.position],
    ...(person.managerId || person.managerName ? [[t('lineManager'), person.managerName || data.people.find(item => item.id === person.managerId)?.name || t('none')]] : []),
    [t('hiredAt'), formatDate(person.hiredAt, lang)], [t('role'), t(person.role)],
  ];
  return <div className="hr-profile-card">
    <div className="hr-profile-identity"><Avatar person={person} size="large" /><div><h3>{person.name}</h3><p>{t(person.role)}</p><span>{person.company}</span></div>{data.user.role === 'hr' && <button className="hr-button secondary" onClick={() => open({ kind: 'editProfile', person })}><Pencil size={16} />{t('editProfile')}</button>}</div>
    <dl className="hr-profile-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <section className="hr-profile-leave" aria-label={t('leave')}><h4><CalendarDays size={19} />{t('leave')}</h4><dl>
      <div className="hr-profile-leave-available"><dt>{t('available')}</dt><dd>{Math.max(0, person.leaveBalance - person.leaveReserved)} <small>{t('days')}</small></dd></div>
      <div><dt>{t('reserved')}</dt><dd>{person.leaveReserved} <small>{t('days')}</small></dd></div>
      <div><dt>{t('balance')}</dt><dd>{person.leaveBalance} <small>{t('days')}</small></dd></div>
    </dl><p>{t('balanceHint')}</p></section>
    <p className="hr-profile-note"><ShieldCheck size={16} />{t('profileNote')}</p>
  </div>;
}

function ProfileEditor({ person, data, t, mutate, close }: CommonProps & { person: Person; close: () => void }) {
  const [form, setForm] = useState({ name: person.name, company: person.company, department: person.department, position: person.position, managerId: person.managerId || '', hiredAt: person.hiredAt, employeeNumber: person.employeeNumber || '', phone: person.phone || '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const change = (field: keyof typeof form, value: string) => setForm(previous => ({ ...previous, [field]: value }));
  async function submit(event: FormEvent) { event.preventDefault(); setError(''); setBusy(true); try { await mutate(`/people/${encodeURIComponent(person.id)}/profile`, { ...form, managerId: form.managerId || null }); close(); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); } }
  return <Modal title={t('editProfile')} subtitle={person.email} close={close} t={t}><form className="hr-form" onSubmit={submit}>
    <label>{t('name')}<input required maxLength={120} value={form.name} onChange={event => change('name', event.target.value)} /></label>
    <div className="hr-form-grid"><label>{t('employeeNumber')}<input maxLength={40} value={form.employeeNumber} onChange={event => change('employeeNumber', event.target.value)} /></label><label>{t('phone')}<input type="tel" maxLength={40} value={form.phone} onChange={event => change('phone', event.target.value)} /></label></div>
    <label>{t('company')}<input readOnly value={form.company} aria-describedby="hr-company-hint" /><small id="hr-company-hint">{t('companyManaged')}</small></label>
    <div className="hr-form-grid"><label>{t('department')}<input required maxLength={120} value={form.department} onChange={event => change('department', event.target.value)} /></label><label>{t('position')}<input required maxLength={120} value={form.position} onChange={event => change('position', event.target.value)} /></label></div>
    <div className="hr-form-grid"><label>{t('lineManager')}<Select aria-label={t('lineManager')}  value={form.managerId} onChange={event => change('managerId', event.target.value)}><option value="">{t('none')}</option>{data.people.filter(item => item.id !== person.id && (item.role === 'manager' || item.role === 'hr')).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label><label>{t('hiredAt')}<input required type="date" value={form.hiredAt} onChange={event => change('hiredAt', event.target.value)} /></label></div>
    <p className="hr-section-caption">{t('profileEditingHint')}</p>{error && <p className="hr-form-error" role="alert">{error}</p>}<div className="hr-form-actions"><button type="button" className="hr-button secondary" onClick={close}>{t('cancel')}</button><button className="hr-button primary" disabled={busy}>{busy ? <Loader2 className="hr-spin" size={16} /> : <Check size={16} />}{t('save')}</button></div>
  </form></Modal>;
}

export default function HRApp() {
  const appearance = useAppearance();
  const appearanceRoot = { 'data-theme': appearance.dark ? 'dark' : 'light', 'data-text-size': appearance.preferences.textSize, 'data-wallpaper': appearance.preferences.wallpaper, style: appearance.style };
  const [lang, setLang] = useState<Lang>(readLanguage);
  const [data, setData] = useState<Bootstrap | null>(null); const [loading, setLoading] = useState(true); const [connectionError, setConnectionError] = useState(''); const [view, setView] = useState<View>('home'); const [modal, setModal] = useState<ModalState>(null); const [menu, setMenu] = useState(false); const [search, setSearch] = useState(''); const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [assistantVisited, setAssistantVisited] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [compactScreen, setCompactScreen] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const [demo, setDemo] = useState<DemoAccess>({ enabled: false, roles: [] });
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const authPending = useRef(false);
  const t = useMemo(() => makeT(lang), [lang]); const closeModal = useCallback(() => setModal(null), []);
  const openSettings = useCallback(() => { setModal({ kind: 'settings' }); setMenu(false); }, []);
  const appearanceDialog = modal?.kind === 'appearance' ? <Modal title={t('appearance')} subtitle={t('appearanceDesc')} close={closeModal} back={() => setModal({ kind: 'settings' })} t={t} wide><AppearanceSettings {...appearance} t={t} /></Modal> : null;
  const accountId = useRef<string | null>(null);
  const sync = useMemo(() => createWorkspaceSync(bootstrap, result => {
    if (accountId.current !== result.user.id) {
      setModal(null); setAssistantVisited(false); setSearch(''); setView('home'); setToast(null);
    }
    accountId.current = result.user.id;
    setData(result); setConnectionError('');
  }, error => {
    if (error instanceof ApiError && error.status === 401) {
      accountId.current = null; setData(null); setModal(null); setAssistantVisited(false); setSearch(''); setConnectionError('');
    } else setConnectionError(error instanceof Error ? error.message : 'Connection failed');
  }), []);
  const refresh = useCallback(() => sync.refresh(), [sync]);
  useEffect(() => { refresh().catch(() => {}).finally(() => setLoading(false)); }, [refresh]);
  useEffect(() => {
    let active = true;
    getDemoAccess().then(value => { if (active) setDemo(value); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const signedIn = !!data;
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => { setCompactScreen(media.matches); setMenu(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!menu || !compactScreen || !signedIn) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const sidebar = sidebarRef.current;
    const controls = () => [...(sidebar?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || [])].filter(button => button.offsetParent !== null);
    sidebar?.querySelector<HTMLButtonElement>('[aria-current="page"]')?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setMenu(false); }
      if (event.key !== 'Tab') return;
      const buttons = controls();
      if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); menuToggleRef.current?.focus(); };
  }, [menu, compactScreen, signedIn]);
  useEffect(() => {
    if (!signedIn || authBusy) return;
    let pending = false;
    const update = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try { await refresh(); } catch { /* Keep the active workspace during a temporary connection failure. */ }
      finally { pending = false; }
    };
    const interval = window.setInterval(update, 2000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [signedIn, refresh, authBusy]);
  useEffect(() => {
    try { localStorage.setItem('asar-hr-lang', lang); } catch { /* The selected language still works in this tab. */ }
    document.documentElement.lang = lang; document.title = 'JanaMen · Digital HR';
  }, [lang]);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(null), 4500); return () => window.clearTimeout(timeout); }, [toast]);
  const navigate = useCallback((next: View) => {
    if (next === 'assistant') setAssistantVisited(true);
    setView(next); setMenu(false); setSearch(''); setModal(null);
    window.scrollTo({ top: 0 });
  }, []);
  const mutate: Mutation = async (path, body, message = t('saved')) => {
    const mutationAccountId = accountId.current;
    sync.invalidate();
    try {
      return await commitAndRefresh(
        () => api(path, { method: 'POST', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
        result => {
          if (accountId.current !== mutationAccountId) return;
          sync.invalidate();
          // Show the acknowledged request even if the following snapshot fails.
          if (path === '/requests' || /^\/requests\/[^/]+\/action$/.test(path)) {
            const request = result as LeaveRequest;
            setData(previous => previous ? { ...previous, requests: [request, ...previous.requests.filter(item => item.id !== request.id)] } : previous);
          }
          if (path === '/hr-inquiries' || /^\/hr-inquiries\/[^/]+\/answer$/.test(path)) {
            const inquiry = result as HrInquiry;
            setData(previous => previous?.user.id === mutationAccountId ? { ...previous, hrInquiries: [inquiry, ...(previous.hrInquiries ?? []).filter(item => item.id !== inquiry.id)] } : previous);
          }
          if (message) setToast({ text: message });
        }, refresh, () => { if (accountId.current === mutationAccountId) setToast({ text: t('savedRefreshPending'), error: true }); },
      ) as never;
    } catch (error) {
      if (accountId.current !== mutationAccountId) throw error;
      if (error instanceof ApiError && error.status === 401) {
        sync.invalidate(); accountId.current = null; setData(null); setModal(null); setAssistantVisited(false);
      } else {
        // Reconcile a conflicting or uncertain write, without retrying the write.
        try { await refresh(); } catch { /* The connection banner remains visible. */ }
      }
      setToast({ text: error instanceof Error ? error.message : t('networkError'), error: true });
      throw error;
    }
  };
  async function changeAccount(signIn: () => Promise<unknown>, showTransition = true) {
    if (authPending.current) return;
    authPending.current = true; setAuthBusy(showTransition); setAuthError(''); setConnectionError('');
    sync.invalidate();
    try {
      await signIn();
      sync.invalidate(); accountId.current = null; setData(null); setModal(null); setAssistantVisited(false); setMenu(false); setSearch(''); setToast(null);
      await refresh();
      setConnectionError('');
      navigate('home');
    } catch (error) {
      const message = error instanceof Error ? error.message : t('networkError');
      setAuthError(message); setToast({ text: message, error: true });
    } finally {
      authPending.current = false; setAuthBusy(false);
    }
  }
  const doLogin = (email: string, password: string) => changeAccount(() => login(email, password), false);
  const doDemoLogin = (role: Role) => changeAccount(() => demoLogin(role));
  async function doLogout() {
    if (authPending.current) return;
    authPending.current = true; setAuthBusy(true); sync.invalidate();
    try {
      try { await logout(); } catch (error) { if (!(error instanceof ApiError && error.status === 401)) throw error; }
      sync.invalidate(); accountId.current = null; setData(null); setModal(null); setAssistantVisited(false); setMenu(false); setSearch(''); setToast(null); setAuthError(''); setConnectionError('');
    } catch (error) { setToast({ text: error instanceof Error ? error.message : t('networkError'), error: true }); }
    finally { authPending.current = false; setAuthBusy(false); }
  }
  const allowedViews: View[] = data ? ['home', 'profile', 'requests', ...(data.user.role === 'manager' ? ['team' as View] : []), 'academy', 'assistant', 'hrInquiries', 'notifications', ...(data.user.role === 'hr' ? ['people' as View, 'integrations' as View] : [])] : [];
  const unread = data ? groupNotifications(data.notifications).filter(group => group.unreadIds.length).length : 0;
  const common: CommonProps | null = data ? { data, lang, t, mutate, open: setModal, navigate } : null;
  const searchResults = data && search.trim().length > 1 ? [...data.requests.filter(request => `${request.employeeName} ${request.startDate} ${t('request')}`.toLowerCase().includes(search.toLowerCase())).slice(0, 4).map(request => ({ id: request.id, label: `${t('request')} · ${request.employeeName}`, detail: `${formatDate(request.startDate, lang)} · ${t(request.status)}`, type: 'request' as const })), ...data.courses.filter(course => `${localized(course.title, lang)} ${localized(course.description, lang)}`.toLowerCase().includes(search.toLowerCase())).slice(0, 3).map(course => ({ id: course.id, label: localized(course.title, lang), detail: t('academy'), type: 'course' as const })), ...(data.user.role === 'hr' ? data.people.filter(person => `${person.name} ${person.email}`.toLowerCase().includes(search.toLowerCase())).slice(0, 3).map(person => ({ id: person.id, label: person.name, detail: t(person.role), type: 'person' as const })) : [])] : [];
  const activeView = allowedViews.includes(view) ? view : 'home';
  function renderView(current: View) {
    if (!common) return null;
    switch (current) {
      case 'home': return <Dashboard {...common} />;
      case 'profile': return <ProfilePage person={data.user} manager={data.user.managerName || data.people.find(person => person.id === data.user.managerId)?.name} lang={lang} t={t} edit={data.user.role === 'hr' ? () => setModal({ kind: 'editProfile', person: data.user }) : undefined} />;
      case 'requests': return <RequestsPage {...common} />;
      case 'team': return <TeamPage {...common} />;
      case 'academy': return <AcademyPage {...common} />;
      case 'assistant': return <AssistantPage data={common.data} lang={lang} t={t} active={activeView === 'assistant'} onEscalate={(question, language) => setModal({ kind: 'escalate', question, language })} />;
      case 'hrInquiries': return <HrInquiriesPage {...common} />;
      case 'notifications': return <NotificationsPage data={common.data} lang={lang} t={t} mutate={mutate} openNotification={item => openNotificationTarget(item, common)} />;
      case 'integrations': return <IntegrationsPage {...common} />;
      case 'people': return <PeoplePage {...common} />;
    }
  }
  if (loading || authBusy) return <div className="hr-app hr-starting" {...appearanceRoot}><Brand /><Loader2 size={30} className="hr-spin" /><p role="status">{t(authBusy ? 'switchingAccount' : 'connecting')}</p></div>;
  if (connectionError && !data) return <div className="hr-app hr-starting" {...appearanceRoot}><Brand /><XCircle size={35} /><h2>{t('connectionError')}</h2><p>{connectionError}</p><button className="hr-button primary" onClick={() => { setLoading(true); setConnectionError(''); refresh().catch(error => setConnectionError(error.message)).finally(() => setLoading(false)); }}>{t('retry')}</button></div>;
  if (!data || !common) return <div className="hr-app" {...appearanceRoot}><LoginPage lang={lang} setLang={setLang} onLogin={doLogin} t={t} demo={demo} onDemoLogin={doDemoLogin} authError={authError} /></div>;
  const selectedRequest = modal?.kind === 'request' ? data.requests.find(request => request.id === modal.id) : null;
  const selectedInquiry = modal?.kind === 'inquiry' ? (data.hrInquiries ?? []).find(inquiry => inquiry.id === modal.id) : null;
  const selectedCourse = modal?.kind === 'course' || modal?.kind === 'assign' ? data.courses.find(course => course.id === modal.id) : null;
  const sidebarExpanded = compactScreen ? menu : !sidebarCollapsed;
  return (
    <div className={`hr-app ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`} {...appearanceRoot}>
      <a href="#hr-main" className="hr-skip-link">{t('home')}</a>
      {menu && compactScreen && <button className="hr-sidebar-backdrop" aria-label={t('closeMenu')} onClick={() => setMenu(false)} />}
      <aside ref={sidebarRef} id="hr-sidebar" className={`hr-sidebar ${menu ? 'open' : ''}`} inert={!sidebarExpanded} aria-hidden={!sidebarExpanded}>
        <div className="hr-sidebar-brand">
          <button className="hr-brand-home" aria-label={t('goHome')} onClick={() => navigate('home')}><Brand /></button>
          <button className="hr-mobile-close hr-icon-button" aria-label={t('closeMenu')} onClick={() => setMenu(false)}><X size={20} /></button>
        </div>
        <span className="hr-nav-eyebrow">{t('workspace')}</span>
        <nav aria-label={t('workspace')}>
          {allowedViews.map(item => {
            const Icon = viewIcons[item];
            return <button className={`hr-nav-item ${activeView === item ? 'active' : ''}`} key={item} onClick={() => navigate(item)} aria-current={activeView === item ? 'page' : undefined}>
              <Icon size={19} aria-hidden="true" /><span>{t(item === 'hrInquiries' && data.user.role === 'hr' ? 'hrInbox' : item)}</span>
              {item === 'notifications' && unread > 0 && <b>{unread}</b>}
              {item === 'hrInquiries' && (data.hrInquiries ?? []).some(inquiry => inquiry.status === 'open' && inquiry.authorId !== data.user.id) && data.user.role === 'hr' && <b>{(data.hrInquiries ?? []).filter(inquiry => inquiry.status === 'open' && inquiry.authorId !== data.user.id).length}</b>}
              {item === 'assistant' && <small aria-hidden="true">AI</small>}
            </button>;
          })}
        </nav>
        <div className="hr-sidebar-bottom">
          <button className="hr-nav-item hr-sidebar-settings" onClick={openSettings} aria-haspopup="dialog"><Settings size={19} /><span>{t('settings')}</span></button>
          <div className="hr-sidebar-user">
            <button className="hr-sidebar-account" aria-label={t('openProfile')} title={`${data.user.name} · ${t(data.user.role)}`} onClick={() => navigate('profile')}><Avatar person={data.user} size="small" /><span><strong>{data.user.name}</strong><small>{t(data.user.role)}</small></span></button>
            <button className="hr-icon-button hr-sidebar-signout" aria-label={t('logout')} title={t('logout')} onClick={() => void doLogout()} disabled={authBusy}><LogOut size={19} aria-hidden="true" /></button>
          </div>
        </div>
      </aside>
      <div className={`hr-main-layout ${activeView === 'assistant' ? 'is-assistant' : ''}`} inert={compactScreen && menu}>
        <header className="hr-header">
          <div className="hr-header-left">
            <button ref={menuToggleRef} className="hr-menu-toggle hr-icon-button" aria-label={t(!compactScreen && sidebarExpanded ? 'collapseMenu' : 'menu')} title={t(!compactScreen && sidebarExpanded ? 'collapseMenu' : 'menu')} aria-expanded={sidebarExpanded} aria-controls="hr-sidebar" onClick={() => compactScreen ? setMenu(previous => !previous) : setSidebarCollapsed(previous => !previous)}>{!compactScreen && sidebarExpanded ? <PanelLeftClose size={21} /> : <Menu size={21} />}</button>
            <span className="hr-header-page-title">{t(activeView === 'hrInquiries' && data.user.role === 'hr' ? 'hrInbox' : activeView)}</span>
          </div>
            <div className="hr-global-search">
              <Search size={17} />
              <input aria-label={t('search')} placeholder={t('search')} value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setSearch(''); }} />
              {search && <button className="hr-icon-button" aria-label={t('close')} onClick={() => setSearch('')}><X size={14} /></button>}
              {search.trim().length > 1 && <div className="hr-search-results">
                {searchResults.length ? searchResults.map(result => <button key={`${result.type}-${result.id}`} onClick={() => { if (result.type === 'person') { navigate('people'); setModal({ kind: 'employeeProfile', id: result.id }); } else setModal({ kind: result.type, id: result.id }); setSearch(''); }}>
                  <span className="hr-file-icon">{result.type === 'course' ? <BookOpen size={17} /> : result.type === 'person' ? <Users size={17} /> : <FileText size={17} />}</span>
                  <span><strong>{result.label}</strong><small>{result.detail}</small></span><ArrowUpRight size={14} />
                </button>) : <p>{t('noResults')}</p>}
              </div>}
            </div>
          <div className="hr-header-actions">
            <LanguagePicker lang={lang} change={setLang} t={t} />
            <button className="hr-header-bell hr-icon-button" aria-label={`${t('notifications')}: ${unread}`} onClick={() => navigate('notifications')}><Bell size={20} />{unread > 0 && <i />}</button>
          </div>
        </header>
        <main className={`hr-main ${activeView === 'assistant' ? 'is-assistant' : ''}`} id="hr-main">
          {connectionError && <div className="hr-info-note" role="alert"><span>{t('staleWorkspace')}</span><button className="hr-text-link" onClick={() => { void refresh().catch(() => {}); }}>{t('retry')}</button></div>}
          {activeView !== 'assistant' && <div className="hr-view-enter" data-view={activeView} key={`${data.user.id}-${activeView}`}>{renderView(activeView)}</div>}
          {assistantVisited && <div data-view="assistant" hidden={activeView !== 'assistant'} key={`${data.user.id}-assistant`}>{renderView('assistant')}</div>}
        </main>
      </div>
      {modal?.kind === 'escalate' && <EscalateInquiry {...common} question={modal.question} language={modal.language} close={closeModal} />}
      {modal?.kind === 'inquiry' && (selectedInquiry ? <InquiryDetail key={selectedInquiry.id} {...common} inquiry={selectedInquiry} close={closeModal} /> : <Modal title={t('inquiryDetail')} close={closeModal} t={t}><Empty title={t('inquiryUnavailable')} /></Modal>)}
      {modal?.kind === 'settings' && <SettingsModal lang={lang} t={t} close={closeModal} preferences={appearance.preferences} change={appearance.change} saved={appearance.saved} changeLanguage={setLang} openAppearance={() => setModal({ kind: 'appearance' })} />}
      {appearanceDialog}
      {modal?.kind === 'employeeProfile' && data.people.some(person => person.id === modal.id) && <Modal title={t('employeeProfile')} close={closeModal} t={t}><ProfileCard {...common} person={data.people.find(person => person.id === modal.id)!} /></Modal>}
      {modal?.kind === 'editProfile' && data.user.role === 'hr' && <ProfileEditor key={modal.person.id} {...common} person={modal.person} close={closeModal} />}
      {modal?.kind === 'newRequest' && <NewRequest {...common} close={closeModal} />}
      {selectedRequest && <RequestDetail key={selectedRequest.id} {...common} request={selectedRequest} close={closeModal} refresh={refresh} />}
      {modal?.kind === 'documentProcessing' && <DocumentProcessingModal key={modal.id} requestId={modal.id} request={data.requests.find(request => request.id === modal.id)} lang={lang} t={t} close={closeModal} openRequest={() => setModal({ kind: 'request', id: modal.id })} />}
      {modal?.kind === 'course' && selectedCourse && <CourseDetail key={`${selectedCourse.id}-${selectedCourse.updatedAt}`} {...common} course={selectedCourse} close={closeModal} />}
      {modal?.kind === 'editor' && <CourseEditor course={modal.course} lang={lang} t={t} mutate={mutate} close={closeModal} />}
      {modal?.kind === 'assign' && selectedCourse && <AssignCourse {...common} course={selectedCourse} close={closeModal} />}
      {modal?.kind === 'person' && <AddPerson {...common} close={closeModal} />}
      {toast && <div role="status" className={`hr-toast ${toast.error ? 'error' : ''}`}>
        {toast.error ? <XCircle size={19} /> : <CheckCircle2 size={19} />}<span>{toast.text}</span>
        <button className="hr-icon-button" aria-label={t('close')} onClick={() => setToast(null)}><X size={16} /></button>
      </div>}
    </div>
  );
}
