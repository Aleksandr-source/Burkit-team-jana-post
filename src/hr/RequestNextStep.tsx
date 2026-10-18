import { Clock3 } from 'lucide-react';
import type { Bootstrap, Lang, LeaveRequest } from './types';
import type { Translator } from './i18n';
import { formatDate } from './i18n';
import { waitingSince } from './workspace-actions';

export default function RequestNextStep({ request, data, lang, t }: { request: LeaveRequest; data: Bootstrap; lang: Lang; t: Translator }) {
  if (!['pending_manager', 'pending_hr'].includes(request.status)) return null;
  const person = data.people.find(item => item.id === request.employeeId);
  const reviewer = request.status === 'pending_hr' ? t('waitingCompanyHr') : person?.managerName
    || data.people.find(item => item.id === person?.managerId)?.name || t('lineManager');
  return <section className="hr-request-next" aria-label={t('status')}>
    <Clock3 size={22} /><div><strong>{t(request.status === 'pending_hr' ? 'waitingHr' : 'waitingManager')}</strong><p>{t('waitingReviewer')}: {reviewer}</p><small>{t('enteredQueue')}: {formatDate(waitingSince(request), lang, true)}. {t('trackingHint')}</small></div>
  </section>;
}
