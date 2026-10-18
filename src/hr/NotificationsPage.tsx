import { Bell } from 'lucide-react';
import type { Bootstrap, Lang, Notification } from './types';
import type { Translator } from './i18n';
import { notificationOverview } from './notifications';
import NotificationList from './NotificationList';
import './notifications.css';

interface Props {
  data: Bootstrap; lang: Lang; t: Translator;
  mutate: <T = unknown>(path: string, body?: unknown, message?: string) => Promise<T>;
  openNotification: (item: Notification) => void;
}

export default function NotificationsPage(props: Props) {
  const { data, t } = props;
  const groups = notificationOverview(data.notifications);
  const unread = groups.filter(group => group.unreadIds.length).length;
  return <section className="hr-notices-page" aria-label={t('notifications')}>
    <header className="hr-notices-heading"><div><h1>{t('notifications')}</h1><p>{t('noticeListHelp')}</p></div>{unread > 0 && <span className="hr-notices-summary">{t('noticeNew')}: {unread}</span>}</header>
    <NotificationList {...props} groups={groups} />
    {!groups.length && <div className="hr-notices-empty"><Bell size={28} /><h2>{t('noticeNothingYet')}</h2><p>{t('noticeEmptyHelp')}</p></div>}
  </section>;
}
