import test from 'node:test';
import assert from 'node:assert/strict';
import { groupNotifications, isDocumentNotification, notificationContent, notificationOverview, notificationDay, notificationTime } from '../src/hr/notifications.ts';
import { makeT } from '../src/hr/i18n.ts';

const notice = (id, time, values = {}) => ({ id, createdAt: `2026-10-18T${time}:00Z`, view: 'requests', entityId: 'leave-1', readAt: null, ...values });
test('notifications show the newest state of an entity and retain its chronological history', () => {
  const items = [notice('first', '03:00'), notice('other', '04:00', { entityId: 'leave-2' }), notice('last', '05:00', { readAt: 'read' })];
  const before = JSON.stringify(items);
  const groups = groupNotifications(items);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].latest.id, 'last');
  assert.deepEqual(groups[0].events.map(event => event.id), ['last', 'first']);
  assert.deepEqual(groups[0].unreadIds, ['first'], 'unread earlier events stay visible even if the newest event was read');
  assert.equal(JSON.stringify(items), before, 'grouping never changes source notifications');
});
test('notification grouping isolates destinations and does not combine unrelated general notices', () => {
  const groups = groupNotifications([notice('r', '02:00'), notice('c', '03:00', { view: 'academy' }), notice('welcome', '04:00', { entityId: undefined }), notice('general', '05:00', { entityId: undefined })]);
  assert.equal(groups.length, 4);
  assert.deepEqual(groupNotifications([]), []);
});
test('notification dates use the company time zone around midnight', () => {
  assert.equal(notificationDay('2026-10-17T20:15:00Z'), '2026-10-18');
  assert.equal(notificationTime('2026-10-17T20:15:00Z'), '01:15');
});

test('overview prioritizes unread threads, keeps chronological order and limits only the dashboard preview', () => {
  const items = [notice('read-newest', '05:00', { entityId: 'read', readAt: 'read' }), notice('unread-old', '02:00', { entityId: 'old' }), notice('unread-new', '04:00', { entityId: 'new' }), notice('read-oldest', '01:00', { entityId: 'read-old', readAt: 'read' })];
  assert.deepEqual(notificationOverview(items).map(group => group.latest.id), ['unread-new', 'unread-old', 'read-newest', 'read-oldest']);
  assert.deepEqual(notificationOverview(items, 2).map(group => group.latest.id), ['unread-new', 'unread-old']);
  assert.equal(items[0].id, 'read-newest');
  assert.equal(notificationOverview([]).length, 0);
});

const L = value => ({ ru: value, kk: value, en: value });
const displayData = { user: { id: 'employee' }, requests: [{ id: 'leave-1', employeeId: 'employee', startDate: '2026-10-21', endDate: '2026-10-28', status: 'approved' }], courses: [{ id: 'onboarding', title: L('Onboarding') }], hrInquiries: [] };
test('document processing and leave approval keep separate unread groups, including legacy notifications', () => {
  const approval = notice('approval', '01:00', { type: 'request_approved' });
  const registration = notice('registered', '02:00', { type: 'document_registered' });
  const rejected = notice('rejected', '03:00', { type: 'document_status', documentProcessing: { id: 'mock-doc', status: 'rejected' } });
  const groups = groupNotifications([approval, registration, rejected]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].key, 'documentolog:leave-1');
  assert.deepEqual(groups[0].unreadIds, ['rejected', 'registered']);
  assert.deepEqual(groups[1].unreadIds, ['approval'], 'viewing the document never marks leave approval as read');
  assert.equal(isDocumentNotification(approval), false);
  assert.equal(isDocumentNotification(registration), true);
  assert.equal(isDocumentNotification({ ...rejected, view: 'academy' }), false);
  assert.equal(isDocumentNotification({ ...rejected, entityId: undefined }), false);
});
test('all Documentolog statuses keep their meaning instead of becoming leave approval in RU/KK/EN', () => {
  for (const lang of ['ru', 'kk', 'en']) for (const status of ['registered', 'in_review', 'completed', 'rejected']) {
    const t = makeT(lang);
    const item = notice('doc', '03:00', { type: 'document_status', documentProcessing: { id: 'mock-doc', status }, title: L('original'), body: L('demo') });
    const content = notificationContent(item, displayData, lang, t);
    assert.equal(content.title, t('noticeDocument_' + status));
    assert.notEqual(content.title, 'noticeDocument_' + status);
    assert.notEqual(content.title, t('noticeLeave_approved'));
    assert.equal(content.category, 'document');
    assert.equal(content.action, 'noticeViewDocument');
    assert.ok(content.body.includes(t('noticeLeave_approved')), 'the separate leave decision is retained as context');
    assert.equal(displayData.requests[0].status, 'approved');
  }
});
test('legacy Documentolog notifications preserve the original localized event without guessing its status', () => {
  const item = notice('old', '03:00', { type: 'document_status', title: { ru: 'Документ отклонён', kk: 'Құжат қабылданбады', en: 'Document rejected' }, body: L('demo') });
  for (const lang of ['ru', 'kk', 'en']) assert.ok(notificationContent(item, displayData, lang, makeT(lang)).title.includes(item.title[lang]));
  assert.equal(notificationContent(item, { ...displayData, requests: [] }, 'ru', makeT('ru')).action, 'noticeViewDocument');
});
test('learning completion and profile updates retain the actual event and matching destination', () => {
  const completed = notice('course', '03:00', { view: 'academy', entityId: 'onboarding', type: 'course_completed', title: L('Курс пройден'), body: L('Алия: Onboarding') });
  const content = notificationContent(completed, displayData, 'ru', makeT('ru'));
  assert.equal(content.title, 'Курс пройден');
  assert.equal(content.body, 'Алия: Onboarding');
  const profile = { ...completed, view: 'profile', type: 'profile_updated' };
  assert.equal(notificationContent(profile, displayData, 'ru', makeT('ru')).action, 'noticeViewProfile');
});

test('same-millisecond document events show the furthest valid processing stage', () => {
  const items = ['registered', 'in_review', 'completed'].map(status => notice(status, '03:00', { type: 'document_status', documentProcessing: { id: 'mock-doc', status } }));
  assert.equal(groupNotifications(items)[0].latest.documentProcessing.status, 'completed');
  assert.equal(groupNotifications([...items].reverse())[0].latest.documentProcessing.status, 'completed');
});
