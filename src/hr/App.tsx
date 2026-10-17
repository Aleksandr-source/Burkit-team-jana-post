import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Bell, BookOpen, CalendarDays, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronRight, Clock3, FileText, GraduationCap, LayoutDashboard, Loader2, LogOut, Menu, MessageCircle, Palette, Paperclip, Pencil, Plus, Search, Send, Settings, ShieldCheck, Trash2, Users, X, XCircle } from 'lucide-react';
import { api, ApiError, askAssistant, bootstrap, login, logout } from './api';
import type { AssistantAnswer, Bootstrap, Course, Enrollment, Lang, LeaveRequest, Localized, Person, Role, View } from './types';
import { formatDate, localized, locales, makeT, readLanguage } from './i18n';
import type { Translator } from './i18n';
import './styles.css';
import './appearance.css';
import { useAppearance } from './appearance';
import AppearanceSettings from './AppearanceSettings';

type ModalState = { kind: 'request'; id: string } | { kind: 'newRequest' } | { kind: 'course'; id: string } | { kind: 'editor'; course?: Course } | { kind: 'assign'; id: string } | { kind: 'person' } | { kind: 'employeeProfile'; id: string } | { kind: 'editProfile'; person: Person } | { kind: 'appearance' } | { kind: 'settings' } | null;
type Mutation = <T = unknown>(path: string, body?: unknown, message?: string) => Promise<T>;
interface CommonProps { data: Bootstrap; lang: Lang; t: Translator; mutate: Mutation; open: (modal: ModalState) => void; navigate: (view: View) => void; }
const viewIcons = { home: LayoutDashboard, requests: FileText, team: Users, academy: GraduationCap, assistant: MessageCircle, notifications: Bell, profile: Users, people: Users };
const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const activeStatus = (request: LeaveRequest) => request.status === 'pending_manager' || request.status === 'pending_hr';
const canApprove = (request: LeaveRequest, user: Person, people: Person[]) => request.employeeId !== user.id && (((user.role === 'manager' || user.role === 'hr') && request.status === 'pending_manager' && people.some(person => person.id === request.employeeId && person.managerId === user.id)) || (user.role === 'hr' && request.status === 'pending_hr'));
const courseProgress = (course: Course, enrollment?: Enrollment) => enrollment?.passed ? 100 : course.lessons.length ? Math.round((enrollment?.completedLessonIds.length || 0) / (course.lessons.length + 1) * 100) : 0;
const emptyLocalized = (): Localized => ({ ru: '', kk: '', en: '' });

function Brand({ light = false }: { light?: boolean }) {
  return <div className={`hr-brand ${light ? 'is-light' : ''}`}><span className="hr-brand-symbol"><span /><span /><span /></span><span>Jana<span className="hr-brand-dot">Men</span><small>PEOPLE & WORK</small></span></div>;
}

function LanguagePicker({ lang, change, t }: { lang: Lang; change: (lang: Lang) => void; t: Translator }) {
  return <div className="hr-language"><select aria-label={t('language')} value={lang} onChange={event => change(event.target.value as Lang)}><option value="ru">РУС</option><option value="kk">ҚАЗ</option><option value="en">ENG</option></select><ChevronDown size={13} /></div>;
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

function Modal({ title, subtitle, children, close, back, wide = false, t }: { title: string; subtitle?: string; children: ReactNode; close: () => void; back?: () => void; wide?: boolean; t: Translator }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>('input,button,select,textarea,a[href]');
    first?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
      if (event.key !== 'Tab' || !dialog) return;
      const focusables = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')].filter(element => element.offsetParent !== null);
      const start = focusables[0]; const end = focusables.at(-1);
      if (event.shiftKey && document.activeElement === start) { event.preventDefault(); end?.focus(); }
      else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); start?.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [close]);
  return <div className="hr-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="hr-modal-title" className={`hr-modal ${wide ? 'hr-modal-wide' : ''}`}><header className="hr-modal-header">{back && <button className="hr-icon-button hr-settings-back" onClick={back} aria-label={t('backToSettings')}><ArrowLeft size={20} /></button>}<div><h2 id="hr-modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="hr-icon-button" onClick={close} aria-label={t('close')}><X size={21} /></button></header><div className="hr-modal-body">{children}</div></div></div>;
}

function LoginPage({ lang, setLang, onLogin, t }: { lang: Lang; setLang: (lang: Lang) => void; onLogin: (email: string, password: string) => Promise<void>; t: Translator }) {
  const [email, setEmail] = useState('employee@janamen.demo');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setError(''); setBusy(true); try { await onLogin(email, password); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); } }
  return <main className="hr-login"><section className="hr-login-story"><Brand light /><div className="hr-login-copy"><span className="hr-eyebrow">JANAMEN · DIGITAL HR</span><h1>{t('loginTitle')}</h1><p>{t('loginText')}</p><div className="hr-login-illustration"><div className="hr-float-card"><CalendarDays size={26} /><span>{t('leave')}<strong>24 <small>{t('days')}</small></strong></span><span className="hr-check-round"><Check size={18} /></span></div><div className="hr-float-card second"><GraduationCap size={26} /><span>{t('academy')}<strong>{t('completed')}</strong></span><div className="hr-mini-bars"><i /><i /><i /><i /></div></div><span className="hr-orbit orbit-one" /><span className="hr-orbit orbit-two" /></div></div><div className="hr-login-security"><ShieldCheck size={17} />{t('loginPrivacy')}</div></section><section className="hr-login-form-side"><div className="hr-login-top"><span className="hr-jana-logo">jana<span>post</span></span><div className="hr-login-top-actions"><LanguagePicker lang={lang} change={setLang} t={t} /></div></div><div className="hr-login-form"><span className="hr-tag">DIGITAL HR</span><h2>{t('signIn')}</h2><p>{t('signInSubtitle')}</p><form onSubmit={submit}><label>{t('email')}<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label><label>{t('password')}<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <div className="hr-form-error" role="alert">{error}</div>}<button className="hr-button primary login-submit" disabled={busy}>{busy ? <Loader2 className="hr-spin" size={18} /> : null}{t('signIn')}<ArrowRight size={18} /></button></form><details className="hr-demo-accounts"><summary>{t('demoAccounts')}<ChevronDown size={15} /></summary><div className="hr-demo-roles">{(['employee', 'manager', 'hr'] as Role[]).map(role => <button key={role} onClick={() => { setEmail(`${role}@janamen.demo`); setPassword(''); }}><span>{t(role)}</span><code>{role}@janamen.demo</code></button>)}</div><p>{t('demoPassword')}</p></details></div><div className="hr-login-footer"><span className="hr-demo-dot" />{t('demo')} · {t('demoNote')}</div></section></main>;
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
  return <><div className="hr-page-intro"><div><span className="hr-eyebrow">{t('today')} · {new Intl.DateTimeFormat(locales[lang], { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'Asia/Almaty' }).format(new Date())}</span><h1>{t('hello')}, {data.user.name.split(' ')[0]} <span className="hr-wave">✦</span></h1><p>{t('workspace')}</p></div></div><section className="hr-welcome-banner"><div className="hr-banner-copy"><span className="hr-eyebrow">JANAMEN</span><h2>{t('heroTitle')}</h2><p>{t('heroText')}</p><div className="hr-banner-actions"><button className="hr-button white" onClick={() => open({ kind: 'newRequest' })}><Plus size={17} />{t('newRequest')}</button><button className="hr-button banner-ghost" onClick={() => navigate('assistant')}><MessageCircle size={17} />{t('askJanaMen')}<ArrowUpRight size={16} /></button></div></div><div className="hr-banner-art" aria-hidden="true"><div className="hr-art-circle outer" /><div className="hr-art-circle inner" /><div className="hr-art-card"><span className="hr-art-avatar"><Users size={32} /></span><span className="hr-art-line" /><span className="hr-art-line short" /><span className="hr-art-check"><Check size={25} /></span></div><span className="hr-art-star">✦</span><span className="hr-art-spark">✧</span></div></section><div className="hr-stat-grid"><article className="hr-stat"><span className="hr-stat-icon blue"><CalendarDays size={21} /></span><div><p>{t('available')}</p><strong>{Math.max(0, data.user.leaveBalance - data.user.leaveReserved)}<small>{t('days')}</small></strong><span>{data.user.leaveReserved} {t('days')} {t('reserved').toLowerCase()}</span></div></article><article className="hr-stat"><span className="hr-stat-icon violet"><GraduationCap size={22} /></span><div><p>{t('assignedCourses')}</p><strong>{assigned.length}<small>{t('academy')}</small></strong><span>{assigned.filter(enrollment => enrollment.passed).length} {t('completed').toLowerCase()}</span></div></article><article className="hr-stat"><span className="hr-stat-icon amber"><Clock3 size={21} /></span><div><p>{data.user.role === 'employee' ? t('reserved') : t('needsApproval')}</p><strong>{data.user.role === 'employee' ? ownRequests.filter(activeStatus).length : approvals}<small>{t('requests').toLowerCase()}</small></strong><button className="hr-text-link" onClick={() => navigate(data.user.role === 'manager' ? 'team' : 'requests')}>{t('seeAll')}<ArrowRight size={13} /></button></div></article></div><div className="hr-dashboard-columns"><section className="hr-panel hr-profile-panel"><div className="hr-panel-heading"><h2>{t('profile')}</h2><button className="hr-text-link" onClick={() => navigate('profile')}>{t('openProfile')}<ArrowUpRight size={15} /></button></div><div className="hr-profile-identity"><Avatar person={data.user} size="large" /><div><h3>{data.user.name}</h3><p>{data.user.position}</p><span>{data.user.email}</span></div></div><dl className="hr-profile-fields">{[[t('company'), data.user.company], [t('department'), data.user.department], [t('lineManager'), managerName], [t('hiredAt'), formatDate(data.user.hiredAt, lang)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="hr-profile-note"><ShieldCheck size={16} />{t('profileNote')}</p></section><section className="hr-panel hr-learning-panel"><div className="hr-panel-heading"><h2>{t('nextLearning')}</h2><button className="hr-text-link" onClick={() => navigate('academy')}><ArrowUpRight size={18} aria-label={t('seeAll')} /></button></div>{course ? <><div className="hr-learning-cover"><BookOpen size={37} /><span>JANA<br />ACADEMY</span><span className="hr-cover-dots" /></div><div className="hr-learning-content"><span className="hr-eyebrow">{course.category} · {course.durationMinutes} {t('minutes')}</span><h3>{localized(course.title, lang)}</h3><div className="hr-progress-label"><span>{t('progress')}</span><strong>{courseProgress(course, enrollment)}%</strong></div><div className="hr-progress"><i style={{ width: `${courseProgress(course, enrollment)}%` }} /></div><button className="hr-button secondary full" onClick={() => open({ kind: 'course', id: course.id })}>{enrollment?.passed ? t('reviewCourse') : t('continueLearning')}<ArrowRight size={16} /></button></div></> : <Empty icon={<GraduationCap size={28} />} title={t('noCourses')} text={t('noCoursesText')} />}</section></div><section className="hr-panel"><div className="hr-panel-heading"><h2>{t('recentRequests')}</h2><button className="hr-text-link" onClick={() => navigate('requests')}>{t('seeAll')}<ArrowRight size={15} /></button></div>{ownRequests.length ? <RequestTable requests={ownRequests.slice(0, 3)} {...props} /> : <Empty title={t('emptyRequests')} text={t('emptyRequestsText')} />}</section></>;
}

function RequestTable({ requests, lang, t, open, showEmployee = false }: Pick<CommonProps, 'lang' | 't' | 'open'> & { requests: LeaveRequest[]; showEmployee?: boolean }) {
  return <div className="hr-table-wrap"><table className="hr-table"><thead><tr><th>{showEmployee ? t('employeeName') : t('request')}</th><th>{t('period')}</th><th>{t('daysLabel')}</th><th>{t('status')}</th><th><span className="hr-sr-only">{t('seeAll')}</span></th></tr></thead><tbody>{requests.map(request => <tr key={request.id} onClick={() => open({ kind: 'request', id: request.id })}><td><div className="hr-request-identity">{showEmployee ? <Avatar person={{ name: request.employeeName }} size="small" /> : <span className="hr-file-icon"><CalendarDays size={18} /></span>}<div><button className="hr-table-title" onClick={event => { event.stopPropagation(); open({ kind: 'request', id: request.id }); }}>{showEmployee ? request.employeeName : t('request')}</button><span>{showEmployee ? request.department : `${t('createdAt')}: ${formatDate(request.createdAt, lang)}`}</span></div></div></td><td>{formatDate(request.startDate, lang)}<span className="hr-table-subdate">— {formatDate(request.endDate, lang)}</span></td><td><strong>{request.days}</strong></td><td><Status request={request} t={t} /></td><td><ChevronRight size={17} className="hr-muted-icon" /></td></tr>)}</tbody></table></div>;
}

function RequestsPage(props: CommonProps) {
  const { data, t, open } = props;
  const [tab, setTab] = useState('mine');
  const [filter, setFilter] = useState('all');
  const requests = data.requests.filter(request => tab === 'mine' ? request.employeeId === data.user.id : request.employeeId !== data.user.id).filter(request => filter === 'all' || request.status === filter).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <><div className="hr-page-intro"><div><span className="hr-eyebrow">HR SERVICES</span><h1>{t('requests')}</h1><p>{t('myRequestsDesc')}</p></div><button className="hr-button primary" onClick={() => open({ kind: 'newRequest' })}><Plus size={18} />{t('newRequest')}</button></div><section className="hr-panel"><div className="hr-list-toolbar"><div className="hr-tabs"><button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>{t('own')}<span>{data.requests.filter(request => request.employeeId === data.user.id).length}</span></button>{data.user.role !== 'employee' && <button className={tab === 'approvals' ? 'active' : ''} onClick={() => setTab('approvals')}>{t('approvals')}<span>{data.requests.filter(request => canApprove(request, data.user, data.people)).length}</span></button>}</div><select aria-label={t('status')} className="hr-filter" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{t('all')}</option>{(['pending_manager', 'pending_hr', 'approved', 'rejected', 'cancelled'] as const).map(status => <option key={status} value={status}>{t(status)}</option>)}</select></div>{requests.length ? <RequestTable {...props} requests={requests} showEmployee={tab !== 'mine'} /> : <Empty title={t('emptyRequests')} text={t('emptyRequestsText')}>{tab === 'mine' && <button className="hr-button secondary" onClick={() => open({ kind: 'newRequest' })}><Plus size={16} />{t('newRequest')}</button>}</Empty>}</section></>;
}

function NewRequest({ data, lang, t, mutate, close }: CommonProps & { close: () => void }) {
  const [startDate, setStartDate] = useState(''); const [endDate, setEndDate] = useState(''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const days = startDate && endDate ? Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000) + 1 : 0;
  const available = data.user.leaveBalance - data.user.leaveReserved;
  async function submit(event: FormEvent) { event.preventDefault(); setError(''); if (days < 1) return setError(t('badDates')); if (days > available) return setError(t('exceedsBalance')); setBusy(true); try { await mutate('/requests', { startDate, endDate, reason }, t('requestSent')); close(); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); } }
  return <Modal title={t('newRequest')} subtitle={`${data.user.name} · ${data.user.department}`} close={close} t={t}><form className="hr-form" onSubmit={submit}><div className="hr-leave-summary"><CalendarDays size={23} /><div><span>{t('available')}</span><strong>{available} {t('days')}</strong></div><span>{t('reserved')}: {data.user.leaveReserved}</span></div><div className="hr-form-grid"><label>{t('startDate')}<input type="date" required value={startDate} min={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Almaty' })} onChange={event => { setStartDate(event.target.value); if (endDate && endDate < event.target.value) setEndDate(event.target.value); }} /></label><label>{t('endDate')}<input type="date" required min={startDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Almaty' })} value={endDate} onChange={event => setEndDate(event.target.value)} /></label></div>{days > 0 && <div className={`hr-date-summary ${days > available ? 'over-limit' : ''}`}><span>{formatDate(startDate, lang)} — {formatDate(endDate, lang)}</span><strong>{days} {t('days')}</strong></div>}<label>{t('reason')} <span className="hr-optional">({t('optional')})</span><textarea maxLength={1500} rows={3} placeholder={t('reasonPlaceholder')} value={reason} onChange={event => setReason(event.target.value)} /></label><p className="hr-info-note"><ShieldCheck size={17} />{t('leavePolicy')}</p>{error && <p className="hr-form-error" role="alert">{error}</p>}<div className="hr-form-actions"><button type="button" className="hr-button secondary" onClick={close}>{t('cancel')}</button><button className="hr-button primary" disabled={busy || days > available}>{busy ? <Loader2 className="hr-spin" size={16} /> : <Send size={16} />}{t('sendRequest')}</button></div></form></Modal>;
}

function RequestDetail({ request, data, lang, t, mutate, close, refresh }: CommonProps & { request: LeaveRequest; close: () => void; refresh: () => Promise<void> }) {
  const [reason, setReason] = useState(''); const [rejecting, setRejecting] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const inputRef = useRef<HTMLInputElement>(null);
  const own = request.employeeId === data.user.id;
  async function action(action: 'approve' | 'reject' | 'cancel') { if (action === 'cancel' && !window.confirm(t('cancelConfirm'))) return; if (action === 'reject' && !reason.trim()) return; setBusy(true); setError(''); try { await mutate(`/requests/${request.id}/action`, { action, comment: reason }); setRejecting(false); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); } }
  async function upload(file?: File) { if (!file) return; if (file.size > 10 * 1024 * 1024) { setError(t('fileTooLarge')); return; } setBusy(true); setError(''); try { await api(`/requests/${request.id}/attachments`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file }); await refresh(); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); if (inputRef.current) inputRef.current.value = ''; } }
  const stage = request.status === 'pending_manager' ? 1 : request.status === 'pending_hr' ? 2 : request.status === 'approved' ? 3 : 0;
  return <Modal title={t('request')} subtitle={`${request.employeeName} · ${formatDate(request.createdAt, lang)}`} close={close} t={t} wide><div className="hr-detail-top"><Status request={request} t={t} /><span className="hr-detail-id">#{request.id.slice(0, 8).toUpperCase()}</span></div><div className="hr-approval-track">{['stage1', 'stage2', 'stage3'].map((label, index) => <div key={label} className={index < stage ? 'complete' : index === stage ? 'current' : ''}><span>{index < stage ? <Check size={15} /> : index + 1}</span><strong>{t(label)}</strong>{index < 2 && <i />}</div>)}</div><div className="hr-request-dates"><CalendarDays size={24} /><div><span>{t('period')}</span><strong>{formatDate(request.startDate, lang)} — {formatDate(request.endDate, lang)}</strong></div><span className="hr-day-count">{request.days}<small>{t('days')}</small></span></div><dl className="hr-detail-fields"><div><dt>{t('submittedBy')}</dt><dd>{request.employeeName}</dd></div><div><dt>{t('department')}</dt><dd>{request.department}</dd></div></dl>{request.reason && <div className="hr-comment"><span>{t('reason')}</span><p>{request.reason}</p></div>}<section className="hr-detail-section"><div className="hr-panel-heading"><h3>{t('attachments')}</h3>{own && activeStatus(request) && <button className="hr-text-link" disabled={busy} onClick={() => inputRef.current?.click()}><Paperclip size={15} />{t('attachFile')}</button>}<input ref={inputRef} className="hr-hidden-input" type="file" onChange={event => upload(event.target.files?.[0])} /></div><p className="hr-section-caption">{t('attachmentsHint')}</p>{request.attachments.length ? <div className="hr-attachment-list">{request.attachments.map(file => <a href={`/api/attachments/${file.id}`} key={file.id} className="hr-attachment" download><span className="hr-file-icon"><FileText size={18} /></span><div><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB</span></div><ArrowDownToLine size={17} aria-label={t('download')} /></a>)}</div> : <p className="hr-subtle-text">{t('noAttachments')}</p>}</section><section className="hr-detail-section"><h3>{t('history')}</h3><ol className="hr-history">{request.history.map(item => <li key={item.id}><span className="hr-history-dot"><Check size={11} /></span><div><strong>{t(item.action)}</strong><p>{item.actorName} <span>· {formatDate(item.at, lang, true)}</span></p>{item.comment && <blockquote>{item.comment}</blockquote>}</div></li>)}</ol></section>{error && <p className="hr-form-error" role="alert">{error}</p>}{rejecting && <label className="hr-reject-box">{t('rejectReason')}<textarea required rows={3} value={reason} placeholder={t('rejectPlaceholder')} onChange={event => setReason(event.target.value)} maxLength={1500} /></label>}{request.status === 'approved' && <section className="hr-detail-section hr-document-ready"><div><h3>{t('requestDocument')}</h3><p className="hr-section-caption">{t('documentHint')}</p></div><a className="hr-button secondary" href={`/api/requests/${encodeURIComponent(request.id)}/document?lang=${lang}`} target="_blank" rel="noreferrer"><FileText size={17} />{t('printDocument')}</a></section>}<div className="hr-form-actions">{own && activeStatus(request) && <button className="hr-button danger-ghost" disabled={busy} onClick={() => action('cancel')}>{t('cancelRequest')}</button>}{canApprove(request, data.user, data.people) && <>{rejecting ? <><button className="hr-button secondary" onClick={() => setRejecting(false)}>{t('cancel')}</button><button className="hr-button danger" disabled={busy || !reason.trim()} onClick={() => action('reject')}><XCircle size={16} />{t('reject')}</button></> : <><button className="hr-button secondary" disabled={busy} onClick={() => setRejecting(true)}>{t('reject')}</button><button className="hr-button primary" disabled={busy} onClick={() => action('approve')}>{busy ? <Loader2 size={16} className="hr-spin" /> : <Check size={17} />}{request.status === 'pending_hr' ? t('approveFinal') : t('approve')}</button></>}</>}</div></Modal>;
}

function TeamPage(props: CommonProps) {
  const { data, t } = props;
  const people = data.people.filter(person => person.managerId === data.user.id);
  const pending = data.requests.filter(request => canApprove(request, data.user, data.people));
  return <><div className="hr-page-intro"><div><span className="hr-eyebrow">PEOPLE & TEAM</span><h1>{t('team')}</h1><p>{t('teamDesc')}</p></div><span className="hr-count-label">{people.length} {t('peopleCount')}</span></div><p className="hr-info-note"><ShieldCheck size={17} />{t('teamPrivacy')}</p><div className="hr-team-grid">{people.map(person => <article key={person.id} className="hr-panel hr-team-person"><Avatar person={person} /><div><h3>{person.name}</h3><p>{person.position}</p><span>{person.department}</span></div></article>)}</div>{!people.length && <section className="hr-panel"><Empty icon={<Users size={28} />} title={t('teamEmpty')} /></section>}<section className="hr-panel"><div className="hr-panel-heading"><h2>{t('needsApproval')}</h2><span className="hr-tiny-tag">{pending.length}</span></div>{pending.length ? <RequestTable {...props} requests={pending} showEmployee /> : <Empty icon={<CheckCheck size={28} />} title={t('noApprovals')} text={t('noApprovalsText')} />}</section></>;
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
  return <><div className="hr-page-intro"><div><span className="hr-eyebrow">LEARN. GROW. TOGETHER.</span><h1>{t('academy')}</h1><p>{t('academyDesc')}</p></div>{data.user.role === 'hr' && <button className="hr-button primary" onClick={() => open({ kind: 'editor' })}><Plus size={17} />{t('newCourse')}</button>}</div><div className="hr-academy-banner"><span className="hr-academy-icon"><GraduationCap size={35} /></span><div><h2>{t('learningDesc')}</h2><p>{t('assignedCourses')}: <strong>{own.length}</strong><span>·</span>{t('completedCourses')}: <strong>{own.filter(enrollment => enrollment.passed).length}</strong></p></div><span className="hr-academy-decoration" aria-hidden="true">✦</span></div><div className="hr-tabs hr-academy-tabs"><button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>{t('myCourses')}<span>{own.length}</span></button><button className={tab === 'catalog' ? 'active' : ''} onClick={() => setTab('catalog')}>{t('catalog')}<span>{data.courses.length}</span></button></div>{courses.length ? <div className="hr-course-grid">{courses.map((course, index) => { const enrollment = own.find(enrollment => enrollment.courseId === course.id); const progress = courseProgress(course, enrollment); return <article key={course.id} className="hr-panel hr-course-card"><div className={`hr-course-cover cover-${index % 3}`}><span className="hr-course-category">{course.category}</span><BookOpen size={49} /><span className="hr-cover-circle" /><span className="hr-cover-spark">✦</span><span className="hr-cover-word">ACADEMY</span></div><div className="hr-course-body"><div className="hr-course-meta"><span><Clock3 size={13} />{course.durationMinutes} {t('minutes')}</span><span><BookOpen size={13} />{course.lessons.length} {t('lessons')}</span>{!course.published && <span>{t('draft')}</span>}</div><h2>{localized(course.title, lang)}</h2><p>{localized(course.description, lang)}</p><div className="hr-progress-label"><span>{enrollment?.passed ? t('completed') : enrollment ? progress ? t('inProgress') : t('notStarted') : t('notAssigned')}</span><strong>{progress}%</strong></div><div className="hr-progress"><i style={{ width: `${progress}%` }} /></div><button className="hr-button secondary full" onClick={() => open({ kind: 'course', id: course.id })}>{enrollment?.passed ? t('reviewCourse') : progress ? t('continueLearning') : t('startLearning')}<ArrowRight size={16} /></button>{data.user.role === 'hr' && <div className="hr-course-admin"><button onClick={() => open({ kind: 'editor', course })}><Pencil size={14} />{t('edit')}</button><button disabled={!course.published} title={!course.published ? t('publishBeforeAssign') : undefined} onClick={() => open({ kind: 'assign', id: course.id })}><Users size={14} />{t('assign')}</button></div>}</div></article>; })}</div> : <section className="hr-panel"><Empty icon={<GraduationCap size={28} />} title={t('noCourses')} text={data.user.role === 'hr' ? t('hrCoursesHint') : t('noCoursesText')}>{data.user.role === 'hr' && <button className="hr-button secondary" onClick={() => open({ kind: 'editor' })}><Plus size={16} />{t('newCourse')}</button>}</Empty></section>}</>;
}

function CourseDetail({ course, ...props }: CommonProps & { course: Course; close: () => void }) {
  const { data, lang, t, mutate, close } = props;
  const [selected, setSelected] = useState(0); const [answers, setAnswers] = useState<number[]>([]); const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const enrollment = data.enrollments.find(enrollment => enrollment.userId === data.user.id && enrollment.courseId === course.id);
  const lesson = course.lessons[selected]; const finishedLessons = !!enrollment && course.lessons.every(lesson => enrollment.completedLessonIds.includes(lesson.id));
  async function complete() { if (!lesson) return; setBusy(true); setError(''); try { await mutate(`/courses/${course.id}/lessons/${lesson.id}/complete`, {}); if (selected < course.lessons.length) setSelected(selected + 1); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); } }
  async function submitQuiz(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const result = await mutate<{ score: number; passed: boolean }>(`/courses/${course.id}/quiz`, { answers }); setResult(result); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); } }
  return <Modal title={localized(course.title, lang)} subtitle={`${course.category} · ${course.durationMinutes} ${t('minutes')}`} close={close} t={t} wide><div className="hr-course-detail"><aside className="hr-lesson-list">{course.lessons.map((lesson, index) => <button className={selected === index ? 'active' : ''} key={lesson.id} onClick={() => setSelected(index)}><span className={enrollment?.completedLessonIds.includes(lesson.id) ? 'done' : ''}>{enrollment?.completedLessonIds.includes(lesson.id) ? <Check size={14} /> : index + 1}</span><span>{localized(lesson.title, lang)}</span></button>)}<button className={selected === course.lessons.length ? 'active' : ''} onClick={() => setSelected(course.lessons.length)}><span><GraduationCap size={15} /></span><span>{t('quiz')}</span></button><div className="hr-lesson-progress"><span>{t('progress')}<strong>{courseProgress(course, enrollment)}%</strong></span><div className="hr-progress"><i style={{ width: `${courseProgress(course, enrollment)}%` }} /></div></div></aside><div className="hr-lesson-main">{lesson ? <><span className="hr-eyebrow">{t('lesson')} {selected + 1} / {course.lessons.length}</span><h3>{localized(lesson.title, lang)}</h3><div className="hr-lesson-content">{localized(lesson.content, lang).split(/\n\n+/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>{lesson.resourceUrl && /^https:\/\//i.test(lesson.resourceUrl) && <a className="hr-text-link hr-resource-link" href={lesson.resourceUrl} target="_blank" rel="noreferrer">{t('material')}<ArrowUpRight size={15} /></a>}{enrollment ? <button className="hr-button primary" onClick={complete} disabled={busy}>{busy ? <Loader2 size={16} className="hr-spin" /> : <Check size={17} />}{enrollment.completedLessonIds.includes(lesson.id) ? t('continueLearning') : t('completeLesson')}</button> : <p className="hr-info-note">{t('notAssigned')}. {t('noCoursesText')}</p>}</> : <><span className="hr-eyebrow">JANA ACADEMY</span><h3>{t('quiz')}</h3>{enrollment?.passed && <div className="hr-quiz-result passed"><CheckCircle2 size={28} /><div><strong>{t('quizPassed')}</strong><p>{t('score')}: {enrollment.score}%</p></div></div>}{!finishedLessons ? <p className="hr-info-note">{t('quizIntro')}</p> : <form onSubmit={submitQuiz} className="hr-quiz-form">{course.quiz.map((question, index) => <fieldset key={question.id}><legend>{index + 1}. {localized(question.prompt, lang)}</legend>{question.options.map((option, optionIndex) => <label key={optionIndex} className={`hr-quiz-option ${answers[index] === optionIndex ? 'selected' : ''}`}><input type="radio" required name={`question-${question.id}`} checked={answers[index] === optionIndex} onChange={() => { const next = [...answers]; next[index] = optionIndex; setAnswers(next); setResult(null); }} />{localized(option, lang)}</label>)}</fieldset>)}{result && <div role="status" className={`hr-quiz-result ${result.passed ? 'passed' : 'failed'}`}><CheckCircle2 size={26} /><div><strong>{result.passed ? t('quizPassed') : t('quizRetry')}</strong><p>{t('score')}: {result.score}% · {t('passScore')}: {course.passScore}%</p></div></div>}<button className="hr-button primary" disabled={busy || course.quiz.some((_, index) => answers[index] === undefined)}>{busy && <Loader2 size={16} className="hr-spin" />}{t('submitQuiz')}</button></form>}</>}{error && <p className="hr-form-error" role="alert">{error}</p>}</div></div></Modal>;
}

function CourseEditor({ course, lang, t, mutate, close }: { course?: Course; lang: Lang; t: Translator; mutate: Mutation; close: () => void }) {
  const [draft, setDraft] = useState<Course>(() => course ? structuredClone(course) : { id: '', title: emptyLocalized(), description: emptyLocalized(), category: 'Onboarding', durationMinutes: 15, published: true, lessons: [{ id: crypto.randomUUID(), title: emptyLocalized(), content: emptyLocalized() }], quiz: [{ id: crypto.randomUUID(), prompt: emptyLocalized(), options: [emptyLocalized(), emptyLocalized(), emptyLocalized()], correctIndex: 0 }], passScore: 70, createdAt: '', updatedAt: '', cover: 'blue' });
  const [contentLang, setContentLang] = useState<Lang>(lang); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const change = (update: Partial<Course>) => setDraft(previous => ({ ...previous, ...update }));
  async function save(event: FormEvent) { event.preventDefault(); setError(''); if (!draft.title.ru.trim() || !draft.description.ru.trim() || !draft.lessons.length || !draft.quiz.length || draft.lessons.some(lesson => !lesson.title.ru.trim() || !lesson.content.ru.trim()) || draft.quiz.some(question => !question.prompt.ru.trim() || question.options.some(option => !option.ru.trim()))) { setError(t('contentRequired')); setContentLang('ru'); return; } setBusy(true); try { await mutate('/courses', { ...draft, id: draft.id || undefined }); close(); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); } }
  return <Modal title={t('editor')} subtitle={course ? localized(course.title, lang) : t('newCourse')} close={close} t={t} wide><form className="hr-form hr-editor" onSubmit={save}><div className="hr-editor-lang"><label>{t('contentLanguage')}<select value={contentLang} onChange={event => setContentLang(event.target.value as Lang)}><option value="ru">Русский</option><option value="kk">Қазақша</option><option value="en">English</option></select></label><p>{t('translationNote')}</p></div><label>{t('title')}<input value={draft.title[contentLang]} maxLength={160} onChange={event => change({ title: { ...draft.title, [contentLang]: event.target.value } })} /></label><label>{t('description')}<textarea rows={2} value={draft.description[contentLang]} maxLength={1200} onChange={event => change({ description: { ...draft.description, [contentLang]: event.target.value } })} /></label><div className="hr-form-grid"><label>{t('category')}<input required maxLength={80} value={draft.category} onChange={event => change({ category: event.target.value })} /></label><label>{t('duration')}<input type="number" required min="1" max="600" value={draft.durationMinutes} onChange={event => change({ durationMinutes: Number(event.target.value) })} /></label></div><label className="hr-checkbox"><input type="checkbox" checked={draft.published} onChange={event => change({ published: event.target.checked })} />{t('published')}</label><div className="hr-editor-heading"><h3>{t('academy')} · {t('lessons')}</h3><button type="button" className="hr-text-link" onClick={() => change({ lessons: [...draft.lessons, { id: crypto.randomUUID(), title: emptyLocalized(), content: emptyLocalized() }] })}><Plus size={15} />{t('addLesson')}</button></div>{draft.lessons.map((lesson, index) => <div className="hr-editor-block" key={lesson.id}><div className="hr-editor-block-head"><strong>{t('lesson')} {index + 1}</strong><button type="button" className="hr-icon-button" aria-label={`${t('remove')} ${t('lesson')} ${index + 1}`} onClick={() => change({ lessons: draft.lessons.filter(item => item.id !== lesson.id) })}><Trash2 size={16} /></button></div><label>{t('lessonTitle')}<input maxLength={180} value={lesson.title[contentLang]} onChange={event => change({ lessons: draft.lessons.map(item => item.id === lesson.id ? { ...item, title: { ...item.title, [contentLang]: event.target.value } } : item) })} /></label><label>{t('lessonContent')}<textarea rows={5} value={lesson.content[contentLang]} maxLength={12000} onChange={event => change({ lessons: draft.lessons.map(item => item.id === lesson.id ? { ...item, content: { ...item.content, [contentLang]: event.target.value } } : item) })} /></label><label>{t('resourceUrl')}<input type="url" pattern="https://.*" value={lesson.resourceUrl || ''} onChange={event => change({ lessons: draft.lessons.map(item => item.id === lesson.id ? { ...item, resourceUrl: event.target.value } : item) })} /></label></div>)}<div className="hr-editor-heading"><h3>{t('quiz')}</h3><button type="button" className="hr-text-link" onClick={() => change({ quiz: [...draft.quiz, { id: crypto.randomUUID(), prompt: emptyLocalized(), options: [emptyLocalized(), emptyLocalized(), emptyLocalized()], correctIndex: 0 }] })}><Plus size={15} />{t('addQuestion')}</button></div><label>{t('passScore')}<input type="number" min="1" max="100" required value={draft.passScore} onChange={event => change({ passScore: Number(event.target.value) })} /></label>{draft.quiz.map((question, index) => <div className="hr-editor-block" key={question.id}><div className="hr-editor-block-head"><strong>{t('question')} {index + 1}</strong><button type="button" className="hr-icon-button" aria-label={`${t('remove')} ${t('question')} ${index + 1}`} onClick={() => change({ quiz: draft.quiz.filter(item => item.id !== question.id) })}><Trash2 size={16} /></button></div><label>{t('question')}<input maxLength={1000} value={question.prompt[contentLang]} onChange={event => change({ quiz: draft.quiz.map(item => item.id === question.id ? { ...item, prompt: { ...item.prompt, [contentLang]: event.target.value } } : item) })} /></label>{question.options.map((option, optionIndex) => <label key={optionIndex}>{t('answer')} {optionIndex + 1}<input maxLength={500} value={option[contentLang]} onChange={event => change({ quiz: draft.quiz.map(item => item.id === question.id ? { ...item, options: item.options.map((value, idx) => idx === optionIndex ? { ...value, [contentLang]: event.target.value } : value) } : item) })} /></label>)}<label>{t('correctAnswer')}<select value={question.correctIndex ?? 0} onChange={event => change({ quiz: draft.quiz.map(item => item.id === question.id ? { ...item, correctIndex: Number(event.target.value) } : item) })}>{question.options.map((_, idx) => <option key={idx} value={idx}>{t('answer')} {idx + 1}</option>)}</select></label></div>)}{error && <p className="hr-form-error" role="alert">{error}</p>}<div className="hr-form-actions"><button type="button" className="hr-button secondary" onClick={close}>{t('cancel')}</button><button className="hr-button primary" disabled={busy}>{busy ? <Loader2 className="hr-spin" size={16} /> : <Check size={16} />}{t('save')}</button></div></form></Modal>;
}

function AssignCourse({ course, data, t, lang, mutate, close }: CommonProps & { course: Course; close: () => void }) {
  const [selected, setSelected] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { await mutate(`/courses/${course.id}/assign`, { userIds: selected }); close(); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); } }
  return <Modal title={t('assignCourse')} subtitle={localized(course.title, lang)} close={close} t={t}><form onSubmit={submit} className="hr-form"><p className="hr-section-caption">{t('assignNote')}</p><div className="hr-assignment-list">{data.people.map(person => { const assigned = data.enrollments.some(enrollment => enrollment.courseId === course.id && enrollment.userId === person.id); return <label className="hr-assignment-person" key={person.id}><input type="checkbox" checked={selected.includes(person.id)} onChange={event => setSelected(event.target.checked ? [...selected, person.id] : selected.filter(id => id !== person.id))} /><Avatar person={person} size="small" /><span><strong>{person.name}</strong><small>{person.department}</small></span>{assigned && <span className="hr-tiny-tag">{t('assigned')}</span>}</label>; })}</div>{error && <p className="hr-form-error" role="alert">{error}</p>}<div className="hr-form-actions"><button type="button" className="hr-button secondary" onClick={close}>{t('cancel')}</button><button className="hr-button primary" disabled={busy || !selected.length}>{busy && <Loader2 className="hr-spin" size={16} />}{t('assign')} ({selected.length})</button></div></form></Modal>;
}

interface ChatMessage { id: string; role: 'user' | 'assistant'; text: string; result?: AssistantAnswer; }
function AssistantPage({ data, lang, t, open, active }: CommonProps & { active: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]); const [question, setQuestion] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active || !messages.length) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    endRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  }, [active, messages, busy]);
  async function send(text = question) { if (!text.trim() || busy) return; setQuestion(''); setError(''); setMessages(previous => [...previous.slice(-39), { id: crypto.randomUUID(), role: 'user', text: text.trim() }]); setBusy(true); try { const result = await askAssistant(text.trim(), lang); setMessages(previous => [...previous.slice(-39), { id: crypto.randomUUID(), role: 'assistant', text: result.answer, result }]); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); } }
  return <><div className="hr-page-intro"><div><span className="hr-eyebrow">YOUR EVERYDAY HR GUIDE</span><h1>{t('assistant')}<span className="hr-ai-title-tag">AI</span></h1><p>{t('assistantDesc')}</p></div><button className="hr-button secondary" onClick={() => { setMessages([]); setQuestion(''); setError(''); }} disabled={busy}><Plus size={16} />{t('newChat')}</button></div><section className="hr-chat-panel"><div className="hr-chat-top"><span className="hr-jana-orb"><MessageCircle size={20} /></span><div><strong>{t('assistantName')}</strong><span><i className={data.ai.ready ? 'ready' : ''} />{data.ai.ready ? `${t('localAI')} · ${data.ai.model}` : t('knowledgeSearch')}</span></div><ShieldCheck size={20} className="hr-muted-icon" /></div>{!data.ai.ready && <p className="hr-ai-fallback">{t('aiFallback')}</p>}<details className="hr-knowledge-catalog"><summary><BookOpen size={14} />{t('knowledgeDocuments')}<ChevronDown size={14} /></summary><p>{t('knowledgeDocumentsHint')}</p><ul>{data.knowledge.map(document => <li key={document.id}><strong>{localized(document.title, lang)}</strong><span>{t('version')} {document.version} · {document.origin ? localized(document.origin, lang) : t('demoSource')}</span></li>)}</ul></details><div className={`hr-chat-messages ${!messages.length ? 'is-empty' : ''}`}>{!messages.length ? <div className="hr-ai-welcome"><div className="hr-ai-welcome-orb"><MessageCircle size={40} /></div><h2>{t('aiWelcome')}</h2><p>{t('aiWelcomeText')}</p><div className="hr-prompt-list">{['promptLeave', 'promptApproval', 'promptLearning'].map(key => <button key={key} onClick={() => send(t(key))}><MessageCircle size={16} />{t(key)}<ArrowUpRight size={15} /></button>)}</div></div> : messages.map(message => <div key={message.id} className={`hr-chat-message ${message.role}`}><span className={message.role === 'assistant' ? 'hr-jana-orb' : 'hr-chat-user'}>{message.role === 'assistant' ? <MessageCircle size={16} /> : initials(data.user.name)}</span><div className="hr-chat-bubble">{message.result && <span className={`hr-answer-mode mode-${message.result.mode}`}>{t(message.result.mode === 'local_model' ? 'localAI' : message.result.mode === 'knowledge_search' ? 'knowledgeSearch' : 'refusal')}</span>}<p>{message.text}</p>{!!message.result?.sources.length && <div className="hr-chat-sources"><strong><BookOpen size={13} />{t('sources')}</strong>{message.result.sources.map((source, index) => <details key={source.id}><summary><span>{index + 1}</span>{source.title}<ChevronDown size={13} /></summary><p className="hr-source-meta">{t('source')}: {source.origin || t('demoSource')}{source.version && <> · {t('version')} {source.version}</>}</p><p>{source.excerpt}</p></details>)}</div>}{message.role === 'assistant' && message.result?.sources.some(source => /leave|vacation|отпуск|demalys/i.test(`${source.id} ${source.title}`)) && <button className="hr-chat-action" onClick={() => open({ kind: 'newRequest' })}>{t('newRequest')}<ArrowRight size={14} /></button>}</div></div>)}{busy && <div className="hr-chat-message assistant"><span className="hr-jana-orb"><MessageCircle size={16} /></span><div className="hr-chat-bubble hr-thinking"><span className="hr-typing-dots" aria-hidden="true"><i /><i /><i /></span><span role="status">{t('thinking')}</span></div></div>}<div ref={endRef} /></div><div className="hr-chat-bottom">{error && <p className="hr-form-error" role="alert">{error}</p>}<form className="hr-chat-input" onSubmit={event => { event.preventDefault(); send(); }}><textarea aria-label={t('askPlaceholder')} placeholder={t('askPlaceholder')} maxLength={1200} rows={2} value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }} /><button className="hr-button primary" disabled={!question.trim() || busy} aria-label={t('send')}><Send size={19} /></button></form><p><ShieldCheck size={12} />{t('aiSafety')}</p></div></section></>;
}

function NotificationsPage({ data, lang, t, mutate, navigate, open }: CommonProps) {
  const [filter, setFilter] = useState('all'); const [busy, setBusy] = useState(false);
  const notifications = data.notifications.filter(item => filter === 'all' || !item.readAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  async function read(id?: string) { setBusy(true); try { await mutate('/notifications/read', id ? { id } : {}, ''); } catch { /* Mutation already displays the error. */ } finally { setBusy(false); } }
  return <><div className="hr-page-intro"><div><span className="hr-eyebrow">STAY IN THE LOOP</span><h1>{t('notifications')}</h1><p>{t('notificationsDesc')}</p></div><button className="hr-button secondary" disabled={busy || !data.notifications.some(item => !item.readAt)} onClick={() => read()}><CheckCheck size={16} />{t('readAll')}</button></div><section className="hr-panel"><div className="hr-tabs hr-notification-tabs"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>{t('all')}<span>{data.notifications.length}</span></button><button className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>{t('unread')}<span>{data.notifications.filter(item => !item.readAt).length}</span></button></div>{notifications.length ? <div className="hr-notification-list">{notifications.map(item => <button key={item.id} className={`hr-notification-item ${!item.readAt ? 'unread' : ''}`} disabled={busy} onClick={async () => { await read(item.id); navigate(item.view); if (item.entityId && item.view === 'requests') open({ kind: 'request', id: item.entityId }); if (item.entityId && item.view === 'academy') open({ kind: 'course', id: item.entityId }); }}><span className={`hr-notification-icon ${item.view === 'academy' ? 'violet' : 'blue'}`}>{item.view === 'academy' ? <GraduationCap size={21} /> : <CalendarDays size={20} />}</span><span className="hr-notification-copy"><strong>{localized(item.title, lang)}{!item.readAt && <i />}</strong><span>{localized(item.body, lang)}</span><small>{formatDate(item.createdAt, lang, true)}</small></span><ChevronRight size={17} /></button>)}</div> : <Empty icon={<Bell size={28} />} title={t('allRead')} text={t('allReadText')} />}</section></>;
}

function PeoplePage({ data, lang, t, open }: CommonProps) {
  const [search, setSearch] = useState(''); const people = data.people.filter(person => `${person.name} ${person.email} ${person.department}`.toLowerCase().includes(search.toLowerCase()));
  return <><div className="hr-page-intro"><div><span className="hr-eyebrow">PEOPLE OPERATIONS</span><h1>{t('people')}</h1><p>{t('peopleDesc')}</p></div><button className="hr-button primary" onClick={() => open({ kind: 'person' })}><Plus size={17} />{t('addPerson')}</button></div><section className="hr-panel"><div className="hr-list-toolbar"><span className="hr-count-label">{data.people.length} {t('peopleCount')}</span><div className="hr-inline-search"><Search size={16} /><input aria-label={t('search')} placeholder={t('employeeName')} value={search} onChange={event => setSearch(event.target.value)} /></div></div><div className="hr-table-wrap"><table className="hr-table hr-people-table"><thead><tr><th>{t('employeeName')}</th><th>{t('department')}</th><th>{t('role')}</th><th>{t('lineManager')}</th><th>{t('hiredAt')}</th></tr></thead><tbody>{people.map(person => <tr key={person.id}><td><div className="hr-request-identity"><Avatar person={person} size="small" /><div><button className="hr-table-title" onClick={() => open({ kind: 'employeeProfile', id: person.id })}>{person.name}</button><span>{person.email}</span></div></div></td><td><strong>{person.department}</strong><span className="hr-table-subdate">{person.position}</span></td><td><span className={`hr-role-tag role-${person.role}`}>{t(person.role)}</span></td><td>{data.people.find(manager => manager.id === person.managerId)?.name || '—'}</td><td>{formatDate(person.hiredAt, lang)}</td></tr>)}</tbody></table>{!people.length && <Empty icon={<Search size={26} />} title={t('noResults')} />}</div></section></>;
}

function AddPerson({ data, t, mutate, close }: CommonProps & { close: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'employee' as Role, department: '', position: '', managerId: '', hiredAt: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Almaty' }), leaveBalance: 24 }); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const change = (field: string, value: string | number) => setForm(previous => ({ ...previous, [field]: value }));
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { await mutate('/people', { ...form, managerId: form.managerId || null }, t('personCreated')); close(); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); } }
  return <Modal title={t('addPerson')} close={close} t={t}><form className="hr-form" onSubmit={submit}><label>{t('name')}<input required maxLength={120} autoComplete="off" value={form.name} onChange={event => change('name', event.target.value)} /></label><div className="hr-form-grid"><label>{t('email')}<input type="email" required autoComplete="off" value={form.email} onChange={event => change('email', event.target.value)} /></label><label>{t('role')}<select value={form.role} onChange={event => change('role', event.target.value)}>{(['employee', 'manager', 'hr'] as Role[]).map(role => <option key={role} value={role}>{t(role)}</option>)}</select></label></div><label>{t('password')}<input type="password" minLength={10} maxLength={200} required autoComplete="new-password" value={form.password} onChange={event => change('password', event.target.value)} /><small>{t('passwordHint')}</small></label><div className="hr-form-grid"><label>{t('department')}<input required maxLength={120} value={form.department} onChange={event => change('department', event.target.value)} /></label><label>{t('position')}<input required maxLength={120} value={form.position} onChange={event => change('position', event.target.value)} /></label></div><label>{t('lineManager')}<select value={form.managerId} onChange={event => change('managerId', event.target.value)}><option value="">{t('none')}</option>{data.people.filter(person => person.role === 'manager' || person.role === 'hr').map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><div className="hr-form-grid"><label>{t('hiredAt')}<input required type="date" value={form.hiredAt} onChange={event => change('hiredAt', event.target.value)} /></label><label>{t('initialBalance')}<input type="number" min="0" max="365" required value={form.leaveBalance} onChange={event => change('leaveBalance', Number(event.target.value))} /></label></div>{error && <p className="hr-form-error" role="alert">{error}</p>}<div className="hr-form-actions"><button type="button" className="hr-button secondary" onClick={close}>{t('cancel')}</button><button className="hr-button primary" disabled={busy}>{busy ? <Loader2 className="hr-spin" size={16} /> : <Plus size={16} />}{t('addPerson')}</button></div></form></Modal>;
}

function SettingsModal({ user, t, close, openAppearance, onLogout }: { user: Person; t: Translator; close: () => void; openAppearance: () => void; onLogout: () => Promise<void> }) {
  const [leaving, setLeaving] = useState(false);
  async function leave() {
    setLeaving(true);
    try { await onLogout(); } finally { setLeaving(false); }
  }
  return <Modal title={t('settings')} subtitle={t('settingsDesc')} close={close} t={t}>
    <div className="hr-settings-menu">
      <div className="hr-settings-account"><Avatar person={user} size="large" /><div><strong>{user.name}</strong><small>{user.email}</small></div></div>
      <button className="hr-settings-row" onClick={openAppearance} aria-haspopup="dialog"><span className="hr-settings-icon"><Palette size={21} /></span><span className="hr-settings-copy"><strong>{t('appearance')}</strong><small>{t('appearanceDesc')}</small></span><ChevronRight size={18} /></button>
      <button className="hr-settings-row is-danger" onClick={leave} disabled={leaving}><span className="hr-settings-icon">{leaving ? <Loader2 size={21} className="hr-spin" /> : <LogOut size={21} />}</span><span className="hr-settings-copy"><strong>{t('logout')}</strong><small>{t('logoutDescription')}</small></span></button>
    </div>
  </Modal>;
}

function ProfileCard({ person, data, lang, t, open }: CommonProps & { person: Person }) {
  const fields = [
    [t('name'), person.name], [t('employeeNumber'), person.employeeNumber || '—'],
    [t('email'), person.email], [t('phone'), person.phone || '—'],
    [t('company'), person.company], [t('department'), person.department],
    [t('position'), person.position], [t('lineManager'), person.managerName || data.people.find(item => item.id === person.managerId)?.name || t('none')],
    [t('hiredAt'), formatDate(person.hiredAt, lang)], [t('role'), t(person.role)],
  ];
  return <div className="hr-profile-card">
    <div className="hr-profile-identity"><Avatar person={person} size="large" /><div><h3>{person.name}</h3><p>{person.position}</p><span>{person.company}</span></div>{data.user.role === 'hr' && <button className="hr-button secondary" onClick={() => open({ kind: 'editProfile', person })}><Pencil size={16} />{t('editProfile')}</button>}</div>
    <dl className="hr-profile-fields">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className="hr-leave-summary"><CalendarDays size={24} /><div><span>{t('available')}</span><strong>{Math.max(0, person.leaveBalance - person.leaveReserved)} {t('days')}</strong></div><span>{t('reserved')}: {person.leaveReserved}</span></div>
    <p className="hr-profile-note"><ShieldCheck size={16} />{t('profileNote')}</p>
  </div>;
}

function ProfilePage(props: CommonProps) {
  const { data, t, navigate, open } = props;
  const completed = data.enrollments.filter(item => item.userId === data.user.id && item.passed).length;
  return <><div className="hr-page-intro"><div><span className="hr-eyebrow">JANAMEN · PEOPLE</span><h1>{t('profile')}</h1><p>{t('profileDesc')}</p></div><button className="hr-button primary" onClick={() => open({ kind: 'newRequest' })}><Plus size={17} />{t('newRequest')}</button></div>
    <section className="hr-panel hr-profile-page"><ProfileCard {...props} person={data.user} /></section>
    <section className="hr-panel hr-profile-documents"><div className="hr-panel-heading"><h2>{t('profileDocuments')}</h2><FileText size={20} /></div><p>{t('profileDocumentsHint')}</p><div className="hr-form-actions"><button className="hr-button secondary" onClick={() => navigate('academy')}><GraduationCap size={17} />{t('nextLearning')} · {completed} {t('completed').toLowerCase()}</button><button className="hr-button secondary" onClick={() => navigate('requests')}><FileText size={17} />{t('requests')}<ArrowRight size={16} /></button></div></section>
  </>;
}

function ProfileEditor({ person, data, t, mutate, close }: CommonProps & { person: Person; close: () => void }) {
  const [form, setForm] = useState({ name: person.name, company: person.company, department: person.department, position: person.position, managerId: person.managerId || '', hiredAt: person.hiredAt, employeeNumber: person.employeeNumber || '', phone: person.phone || '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const change = (field: keyof typeof form, value: string) => setForm(previous => ({ ...previous, [field]: value }));
  async function submit(event: FormEvent) { event.preventDefault(); setError(''); setBusy(true); try { await mutate(`/people/${encodeURIComponent(person.id)}/profile`, { ...form, managerId: form.managerId || null }); close(); } catch (error) { setError(error instanceof Error ? error.message : t('networkError')); } finally { setBusy(false); } }
  return <Modal title={t('editProfile')} subtitle={person.email} close={close} t={t}><form className="hr-form" onSubmit={submit}>
    <label>{t('name')}<input required maxLength={120} value={form.name} onChange={event => change('name', event.target.value)} /></label>
    <div className="hr-form-grid"><label>{t('employeeNumber')}<input maxLength={40} value={form.employeeNumber} onChange={event => change('employeeNumber', event.target.value)} /></label><label>{t('phone')}<input type="tel" maxLength={40} value={form.phone} onChange={event => change('phone', event.target.value)} /></label></div>
    <label>{t('company')}<input required maxLength={160} value={form.company} onChange={event => change('company', event.target.value)} /></label>
    <div className="hr-form-grid"><label>{t('department')}<input required maxLength={120} value={form.department} onChange={event => change('department', event.target.value)} /></label><label>{t('position')}<input required maxLength={120} value={form.position} onChange={event => change('position', event.target.value)} /></label></div>
    <div className="hr-form-grid"><label>{t('lineManager')}<select value={form.managerId} onChange={event => change('managerId', event.target.value)}><option value="">{t('none')}</option>{data.people.filter(item => item.id !== person.id && (item.role === 'manager' || item.role === 'hr')).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{t('hiredAt')}<input required type="date" value={form.hiredAt} onChange={event => change('hiredAt', event.target.value)} /></label></div>
    <p className="hr-section-caption">{t('profileEditingHint')}</p>{error && <p className="hr-form-error" role="alert">{error}</p>}<div className="hr-form-actions"><button type="button" className="hr-button secondary" onClick={close}>{t('cancel')}</button><button className="hr-button primary" disabled={busy}>{busy ? <Loader2 className="hr-spin" size={16} /> : <Check size={16} />}{t('save')}</button></div>
  </form></Modal>;
}

export default function HRApp() {
  const appearance = useAppearance();
  const appearanceRoot = { 'data-theme': appearance.dark ? 'dark' : 'light', 'data-text-size': appearance.preferences.textSize, 'data-wallpaper': appearance.preferences.wallpaper, style: appearance.style };
  const [lang, setLang] = useState<Lang>(readLanguage);
  const [data, setData] = useState<Bootstrap | null>(null); const [loading, setLoading] = useState(true); const [connectionError, setConnectionError] = useState(''); const [view, setView] = useState<View>('home'); const [modal, setModal] = useState<ModalState>(null); const [menu, setMenu] = useState(false); const [search, setSearch] = useState(''); const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [assistantVisited, setAssistantVisited] = useState(false);
  const t = useMemo(() => makeT(lang), [lang]); const closeModal = useCallback(() => setModal(null), []);
  const openSettings = useCallback(() => { setModal({ kind: 'settings' }); setMenu(false); }, []);
  const appearanceDialog = modal?.kind === 'appearance' ? <Modal title={t('appearance')} subtitle={t('appearanceDesc')} close={closeModal} back={() => setModal({ kind: 'settings' })} t={t} wide><AppearanceSettings {...appearance} t={t} /></Modal> : null;
  const refresh = useCallback(async () => { try { const result = await bootstrap(); setData(result); setConnectionError(''); } catch (error) { if (error instanceof ApiError && error.status === 401) { setData(null); setModal(null); } else throw error; } }, []);
  useEffect(() => { refresh().catch(error => setConnectionError(error instanceof Error ? error.message : 'Connection failed')).finally(() => setLoading(false)); }, [refresh]);
  const signedIn = !!data;
  useEffect(() => {
    if (!signedIn) return;
    let pending = false;
    const update = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try { await refresh(); } catch { /* Keep the active workspace during a temporary connection failure. */ }
      finally { pending = false; }
    };
    const interval = window.setInterval(update, 20000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); };
  }, [signedIn, refresh]);
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
  const mutate: Mutation = async (path, body, message = t('saved')) => { try { const result = await api(path, { method: 'POST', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }); await refresh(); if (message) setToast({ text: message }); return result as never; } catch (error) { const text = error instanceof Error ? error.message : t('networkError'); setToast({ text, error: true }); if (error instanceof ApiError && error.status === 401) { setData(null); setModal(null); } throw error; } };
  async function doLogin(email: string, password: string) {
    await login(email, password);
    try {
      const result = await bootstrap();
      setData(result);
      setConnectionError('');
      navigate('home');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw new ApiError(t('sessionUnavailable'), 401);
      throw error;
    }
  }
  async function doLogout() { try { await logout(); setData(null); setModal(null); setAssistantVisited(false); } catch (error) { setToast({ text: error instanceof Error ? error.message : t('networkError'), error: true }); } }
  const allowedViews: View[] = data ? ['home', 'profile', 'requests', ...(data.user.role === 'manager' ? ['team' as View] : []), 'academy', 'assistant', 'notifications', ...(data.user.role === 'hr' ? ['people' as View] : [])] : [];
  const unread = data?.notifications.filter(item => !item.readAt).length || 0;
  const common: CommonProps | null = data ? { data, lang, t, mutate, open: setModal, navigate } : null;
  const searchResults = data && search.trim().length > 1 ? [...data.requests.filter(request => `${request.employeeName} ${request.startDate} ${t('request')}`.toLowerCase().includes(search.toLowerCase())).slice(0, 4).map(request => ({ id: request.id, label: `${t('request')} · ${request.employeeName}`, detail: `${formatDate(request.startDate, lang)} · ${t(request.status)}`, type: 'request' as const })), ...data.courses.filter(course => `${localized(course.title, lang)} ${localized(course.description, lang)}`.toLowerCase().includes(search.toLowerCase())).slice(0, 3).map(course => ({ id: course.id, label: localized(course.title, lang), detail: t('academy'), type: 'course' as const })), ...(data.user.role === 'hr' ? data.people.filter(person => `${person.name} ${person.email}`.toLowerCase().includes(search.toLowerCase())).slice(0, 3).map(person => ({ id: person.id, label: person.name, detail: person.position, type: 'person' as const })) : [])] : [];
  const activeView = allowedViews.includes(view) ? view : 'home';
  function renderView(current: View) {
    if (!common) return null;
    switch (current) {
      case 'home': return <Dashboard {...common} />;
      case 'profile': return <ProfilePage {...common} />;
      case 'requests': return <RequestsPage {...common} />;
      case 'team': return <TeamPage {...common} />;
      case 'academy': return <AcademyPage {...common} />;
      case 'assistant': return <AssistantPage {...common} active={activeView === 'assistant'} />;
      case 'notifications': return <NotificationsPage {...common} />;
      case 'people': return <PeoplePage {...common} />;
    }
  }
  if (loading) return <div className="hr-app hr-starting" {...appearanceRoot}><Brand /><Loader2 size={30} className="hr-spin" /><p>{t('connecting')}</p></div>;
  if (connectionError && !data) return <div className="hr-app hr-starting" {...appearanceRoot}><Brand /><XCircle size={35} /><h2>{t('connectionError')}</h2><p>{connectionError}</p><button className="hr-button primary" onClick={() => { setLoading(true); setConnectionError(''); refresh().catch(error => setConnectionError(error.message)).finally(() => setLoading(false)); }}>{t('retry')}</button></div>;
  if (!data || !common) return <div className="hr-app" {...appearanceRoot}><LoginPage lang={lang} setLang={setLang} onLogin={doLogin} t={t} /></div>;
  const selectedRequest = modal?.kind === 'request' ? data.requests.find(request => request.id === modal.id) : null;
  const selectedCourse = modal?.kind === 'course' || modal?.kind === 'assign' ? data.courses.find(course => course.id === modal.id) : null;
  return (
    <div className="hr-app" {...appearanceRoot}>
      <a href="#hr-main" className="hr-skip-link">{t('home')}</a>
      {menu && <button className="hr-sidebar-backdrop" aria-label={t('close')} onClick={() => setMenu(false)} />}
      <aside className={`hr-sidebar ${menu ? 'open' : ''}`}>
        <div className="hr-sidebar-brand">
          <button className="hr-brand-home" aria-label={t('goHome')} onClick={() => navigate('home')}><Brand /></button>
          <button className="hr-mobile-close hr-icon-button" aria-label={t('close')} onClick={() => setMenu(false)}><X size={20} /></button>
        </div>
        <div className="hr-workspace-label"><span className="hr-company-mark">J</span><div><strong>JanaMen</strong><span>Digital HR workspace</span></div></div>
        <span className="hr-nav-eyebrow">{t('workspace')}</span>
        <nav aria-label={t('workspace')}>
          {allowedViews.map(item => {
            const Icon = viewIcons[item];
            return <button className={`hr-nav-item ${activeView === item ? 'active' : ''}`} key={item} onClick={() => navigate(item)} aria-current={activeView === item ? 'page' : undefined}>
              <Icon size={19} aria-hidden="true" /><span>{t(item)}</span>
              {item === 'notifications' && unread > 0 && <b>{unread}</b>}
              {item === 'assistant' && <small aria-hidden="true">AI</small>}
            </button>;
          })}
        </nav>
        <div className="hr-sidebar-bottom">
          <button className="hr-nav-item hr-sidebar-settings" onClick={openSettings} aria-haspopup="dialog"><Settings size={19} /><span>{t('settings')}</span></button>
          <div className="hr-sidebar-user">
            <button className="hr-profile-button" aria-label={t('openProfile')} onClick={() => navigate('profile')}><Avatar person={data.user} /></button>
            <div><strong>{data.user.name}</strong><span>{t(data.user.role)}</span></div>
          </div>
        </div>
      </aside>
      <div className="hr-main-layout">
        <header className="hr-header">
          <div className="hr-header-left">
            <button className="hr-mobile-menu hr-icon-button" aria-label={t('menu')} onClick={() => setMenu(true)}><Menu size={22} /></button>
            <span className="hr-breadcrumb">{t('workspace')}<ChevronRight size={13} /><strong>{t(activeView)}</strong></span>
          </div>
          <div className="hr-header-actions">
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
            <LanguagePicker lang={lang} change={setLang} t={t} />
            <button className="hr-header-bell hr-icon-button" aria-label={`${t('notifications')}: ${unread}`} onClick={() => navigate('notifications')}><Bell size={20} />{unread > 0 && <i />}</button>
            <button className="hr-profile-button" aria-label={t('openProfile')} title={data.user.name} onClick={() => navigate('profile')}><Avatar person={data.user} size="small" /></button>
          </div>
        </header>
        <main className="hr-main" id="hr-main">
          {activeView !== 'assistant' && <div className="hr-view-enter" data-view={activeView} key={`${data.user.id}-${activeView}`}>{renderView(activeView)}</div>}
          {assistantVisited && <div data-view="assistant" hidden={activeView !== 'assistant'} key={`${data.user.id}-assistant`}>{renderView('assistant')}</div>}
          <footer className="hr-page-footer"><span>JanaMen · Digital HR</span><span className="hr-jana-logo">jana<span>post</span></span></footer>
        </main>
      </div>
      {modal?.kind === 'settings' && <SettingsModal user={data.user} t={t} close={closeModal} openAppearance={() => setModal({ kind: 'appearance' })} onLogout={doLogout} />}
      {appearanceDialog}
      {modal?.kind === 'employeeProfile' && data.people.some(person => person.id === modal.id) && <Modal title={t('employeeProfile')} close={closeModal} t={t}><ProfileCard {...common} person={data.people.find(person => person.id === modal.id)!} /></Modal>}
      {modal?.kind === 'editProfile' && data.user.role === 'hr' && <ProfileEditor key={modal.person.id} {...common} person={modal.person} close={closeModal} />}
      {modal?.kind === 'newRequest' && <NewRequest {...common} close={closeModal} />}
      {selectedRequest && <RequestDetail {...common} request={selectedRequest} close={closeModal} refresh={refresh} />}
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
