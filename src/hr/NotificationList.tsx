import { useState } from 'react';
import { ArrowRight, Bell, CalendarDays, FileText, GraduationCap, Loader2, MessageCircle } from 'lucide-react';
import type { Bootstrap, Lang, Notification } from './types';
import type { Translator } from './i18n';
import { formatDate } from './i18n';
import { notificationContent } from './notifications';
import type { NotificationGroup } from './notifications';
import './notifications.css';
const noticeIcons = { document: FileText, request: CalendarDays, learning: GraduationCap, inquiry: MessageCircle, general: Bell };

interface Props {
  data: Bootstrap; lang: Lang; t: Translator; groups: NotificationGroup[];
  preview?: boolean;
  mutate: <T = unknown>(path: string, body?: unknown, message?: string) => Promise<T>;
  openNotification: (item: Notification) => void;
}

export default function NotificationList({ data, lang, t, groups, mutate, openNotification, preview = false }: Props) {
  const Heading = preview ? 'h3' : 'h2';
  const [pending, setPending] = useState<string | null>(null);
  async function select(group: NotificationGroup) {
    if (pending) return;
    setPending(group.key);
    try {
      if (group.unreadIds.length) await mutate('/notifications/read', { ids: group.unreadIds }, '');
      openNotification(group.latest);
    } catch { /* The workspace mutation reports errors. */ }
    finally { setPending(null); }
  }
  return <div className="hr-notices-feed">{groups.map(group => {
    const content = notificationContent(group.latest, data, lang, t);
    const Icon = noticeIcons[content.category];
    return <article className={`hr-notice-card ${group.unreadIds.length ? 'is-new' : ''}`} key={group.key}>
      <span className="hr-notice-category" aria-hidden="true"><Icon size={21} /></span>
      <div className="hr-notice-copy"><div className="hr-notice-title"><Heading>{content.title}</Heading>{group.unreadIds.length > 0 && <span className="hr-notice-new">{t('noticeNewSingular')}</span>}</div>
        <p>{content.body}</p><time dateTime={group.latest.createdAt}>{formatDate(group.latest.createdAt, lang, true)}</time>
      </div>
      {(!preview || group.latest.view !== 'home' || group.latest.entityId) && <button className="hr-notice-action" disabled={!!pending} onClick={() => void select(group)}>{t(content.action)}{pending === group.key ? <Loader2 className="hr-spin" size={16} /> : <ArrowRight size={16} />}</button>}
    </article>;
  })}</div>;
}
