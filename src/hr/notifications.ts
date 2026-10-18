import type { Bootstrap, Lang, Notification } from './types';
import { formatDate, localized } from './i18n.ts';
import type { Translator } from './i18n';

export interface NotificationGroup { key: string; latest: Notification; events: Notification[]; unreadIds: string[]; }

// Older notifications predate structured document metadata; keep their original meaning.
export const isDocumentNotification = (item: Notification) => item.view === 'requests' && !!item.entityId && (item.type === 'document_registered' || item.type === 'document_status');
const documentOrder: Record<string, number> = { registered: 0, in_review: 1, completed: 2, rejected: 2 };

export function groupNotifications(items: Notification[]): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  for (const item of [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (isDocumentNotification(a) && isDocumentNotification(b) && a.entityId === b.entityId ? (documentOrder[b.documentProcessing?.status || ''] ?? -1) - (documentOrder[a.documentProcessing?.status || ''] ?? -1) : 0))) {
    const key = isDocumentNotification(item) ? `documentolog:${item.entityId}` : item.entityId ? `${item.view}:${item.entityId}` : `notice:${item.id}`;
    let group = groups.get(key);
    if (!group) { group = { key, latest: item, events: [], unreadIds: [] }; groups.set(key, group); }
    group.events.push(item);
    if (!item.readAt) group.unreadIds.push(item.id);
  }
  return [...groups.values()];
}

export function notificationContent(item: Notification, data: Bootstrap, lang: Lang, t: Translator) {
  const request = item.view === 'requests' && data.requests.find(request => request.id === item.entityId);
  if (isDocumentNotification(item)) {
    const status = item.documentProcessing?.status;
    const known = status && ['registered', 'in_review', 'completed', 'rejected'].includes(status);
    return { category: 'document' as const, title: known ? t(`noticeDocument_${status}`) : `Documentolog · ${localized(item.title, lang)}`,
      body: request ? `${t('noticeLeave_' + request.status)} · ${formatDate(request.startDate, lang)} — ${formatDate(request.endDate, lang)}` : localized(item.body, lang), action: 'noticeViewDocument' };
  }
  if (request) return { category: 'request' as const, title: t('noticeLeave_' + request.status), body: (request.employeeId !== data.user.id ? request.employeeName + ' · ' : '') + formatDate(request.startDate, lang) + ' — ' + formatDate(request.endDate, lang), action: 'noticeViewLeave' };
  const course = item.view === 'academy' && data.courses.find(course => course.id === item.entityId);
  if (course) return { category: 'learning' as const, title: localized(item.title, lang), body: localized(item.body, lang) || localized(course.title, lang), action: 'noticeViewLearning' };
  const inquiry = item.view === 'hrInquiries' && data.hrInquiries.find(inquiry => inquiry.id === item.entityId);
  if (inquiry) return { category: 'inquiry' as const, title: t(inquiry.status === 'answered' ? 'noticeHrAnswered' : 'noticeHrWaiting'), body: inquiry.question, action: inquiry.status === 'answered' ? 'noticeReadAnswer' : 'noticeViewQuestion' };
  return { category: 'general' as const, title: localized(item.title, lang), body: localized(item.body, lang), action: ({ requests: 'noticeOpenRequest', academy: 'noticeViewLearning', hrInquiries: 'noticeViewQuestion', profile: 'noticeViewProfile' })[item.view] || 'noticeViewHome' };
}

/** Keep unread conversations visible first without hiding earlier messages. */
export function notificationOverview(items: Notification[], limit = Infinity): NotificationGroup[] {
  return groupNotifications(items)
    .sort((a, b) => Number(b.unreadIds.length > 0) - Number(a.unreadIds.length > 0))
    .slice(0, limit);
}

export function notificationDay(value: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return ['year', 'month', 'day'].map(key => parts.find(part => part.type === key)?.value).join('-');
}
export const notificationTime = (value: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Almaty', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
