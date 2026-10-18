import { useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, FileText, GraduationCap, MessageCircle } from 'lucide-react';
import type { Bootstrap, Lang } from './types';
import { formatDate, localized, locales } from './i18n';
import type { Translator } from './i18n';
import { waitingSince, workspaceActions } from './workspace-actions';
import './workspace-actions.css';

interface Props {
  data: Bootstrap; lang: Lang; t: Translator;
  openRequest: (id: string) => void; openInquiry: (id: string) => void;
}
type Filter = 'all' | 'requests' | 'inquiries' | 'learning';

function age(date: string, lang: Lang) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 60000));
  if (lang === 'kk') {
    if (!Number.isFinite(minutes) || minutes < 1) return 'жаңа ғана';
    if (minutes < 60) return `${minutes} минут бұрын`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} сағат бұрын`;
    return `${Math.floor(minutes / 1440)} күн бұрын`;
  }
  const formatter = new Intl.RelativeTimeFormat(locales[lang], { numeric: 'auto' });
  if (!Number.isFinite(minutes) || minutes < 1) return formatter.format(0, 'minute');
  if (minutes < 60) return formatter.format(-minutes, 'minute');
  if (minutes < 1440) return formatter.format(-Math.floor(minutes / 60), 'hour');
  return formatter.format(-Math.floor(minutes / 1440), 'day');
}

export default function ActionQueue({ data, lang, t, openRequest, openInquiry }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  if (data.user.role === 'employee') return null;
  const { requests, inquiries, learning } = workspaceActions(data);
  const pendingLearning = learning.filter(item => item.completed < item.enrollments.length);
  const count = requests.length + inquiries.length + pendingLearning.length;
  const tabs: [Filter, string, number][] = [
    ['all', 'all', count], ['requests', 'queueRequests', requests.length],
    ...(data.user.role === 'hr' ? [['inquiries', 'hrInbox', inquiries.length] as [Filter, string, number]] : []),
    ['learning', 'academy', learning.length],
  ];
  const visibleRequests = filter === 'all' || filter === 'requests' ? requests : [];
  const visibleInquiries = filter === 'all' || filter === 'inquiries' ? inquiries : [];
  const visibleLearning = filter === 'learning' ? learning : filter === 'all' ? pendingLearning : [];
  const empty = !visibleRequests.length && !visibleInquiries.length && !visibleLearning.length;
  return <section className="hr-panel hr-action-queue" aria-labelledby="hr-actions-title">
    <div className="hr-panel-heading"><div><span className="hr-eyebrow">{t('workday')}</span><h2 id="hr-actions-title">{t('actionQueue')}</h2><p className="hr-section-caption">{t('actionQueueHint')}</p></div><span className="hr-action-total">{count}</span></div>
    <div className="hr-tabs hr-action-tabs" role="group" aria-label={t('actionFilter')}>
      {tabs.map(([value, label, amount]) => <button key={value} aria-pressed={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{t(label)}<span>{amount}</span></button>)}
    </div>
    <div className="hr-action-list">
      {visibleRequests.map(request => <button className="hr-action-row" key={request.id} onClick={() => openRequest(request.id)}>
        <span className="hr-action-icon"><FileText size={20} /></span>
        <span className="hr-action-copy"><strong>{request.employeeName}</strong><span>{t('request')} · {formatDate(request.startDate, lang)} — {formatDate(request.endDate, lang)} · {request.days} {t('days')}</span><small><Clock3 size={12} />{t('enteredQueue')} {age(waitingSince(request), lang)}</small></span>
        <span className="hr-action-label">{t(request.status === 'pending_hr' ? 'approveFinal' : 'reviewRequest')}<ArrowRight size={16} /></span>
      </button>)}
      {visibleInquiries.map(inquiry => <button className="hr-action-row" key={inquiry.id} onClick={() => openInquiry(inquiry.id)}>
        <span className="hr-action-icon is-question"><MessageCircle size={20} /></span>
        <span className="hr-action-copy"><strong>{inquiry.authorName}</strong><span>{inquiry.question}</span><small><Clock3 size={12} />{t('enteredQueue')} {age(inquiry.createdAt, lang)}</small></span>
        <span className="hr-action-label">{t('answerInquiry')}<ArrowRight size={16} /></span>
      </button>)}
      {visibleLearning.map(({ course, enrollments, completed }) => <details className="hr-action-learning" key={course.id}>
        <summary className="hr-action-row"><span className="hr-action-icon is-learning"><GraduationCap size={20} /></span><span className="hr-action-copy"><strong>{localized(course.title, lang)}</strong><span>{t('learningCompleted')}: {completed}/{enrollments.length}</span></span><span className="hr-action-label">{t('learningPeople')}<ArrowRight size={16} /></span></summary>
        <ul className="hr-action-enrollments">{enrollments.map(enrollment => <li key={enrollment.id}><span><strong>{enrollment.userName}</strong><small>{t('assignedAt')}: {formatDate(enrollment.assignedAt, lang)}</small></span><span>{enrollment.passed ? <><CheckCircle2 size={14} />{t('completed')}{enrollment.score !== null && ` · ${enrollment.score}%`}</> : <>{t('progress')}: {course.lessons.filter(lesson => enrollment.completedLessonIds.includes(lesson.id)).length}/{course.lessons.length} {t('lessons').toLowerCase()}{enrollment.score !== null && ` · ${t('quiz')}: ${enrollment.score}%`}</>}</span></li>)}</ul>
      </details>)}
      {empty && <div className="hr-action-empty"><CheckCircle2 size={28} /><strong>{t(filter === 'all' ? 'queueClear' : 'queueFilterEmpty')}</strong><p>{t('queueClearHint')}</p></div>}
    </div>
  </section>;
}
