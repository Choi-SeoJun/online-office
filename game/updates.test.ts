import test from 'node:test';
import assert from 'node:assert/strict';
import * as updates from './updates.ts';
import { DAILY_UPDATES, formatUpdateDate, updateDays, hasUnreadUpdates, markUpdatesRead } from './updates.ts';

test('calendar days appear newest first, with additions and fixes in the same daily entry', () => {
  const days = updateDays({ '2026-11-10': { added: ['a'], fixed: [] }, '2026-11-12': { added: ['b'], fixed: ['c'] } });
  assert.deepEqual(days.map(day => day.date), ['2026-11-12', '2026-11-10']);
  assert.deepEqual(days[0].fixed, ['c']);
  assert.equal(formatUpdateDate('2026-11-12'), '2026년 11월 12일');
  assert.ok(updateDays(DAILY_UPDATES).every(day => day.added.length + day.fixed.length > 0));
});

test('read marker acknowledges a calendar date, so another deployment that day stays read', () => {
  let saved: string | null = null;
  const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
  assert.equal(hasUnreadUpdates('2026-11-12', storage), true);
  assert.equal(markUpdatesRead('2026-11-12', storage), true);
  assert.equal(hasUnreadUpdates('2026-11-12', storage), false);
  assert.equal(hasUnreadUpdates('2026-11-13', storage), true);
  assert.equal(hasUnreadUpdates('2026-11-11', storage), false);
});

test('blocked or malformed browser storage never prevents opening news', () => {
  assert.equal(hasUnreadUpdates('2026-11-12', { getItem: () => 'not-a-day' }), true);
  assert.equal(hasUnreadUpdates('2026-11-12', { getItem() { throw Error('blocked'); } }), true);
  assert.equal(markUpdatesRead('2026-11-12', { setItem() { throw Error('blocked'); } }), false);
});

test('announcement dates group late-night and early-morning changes at the next Seoul 04:00', () => {
  assert.equal(typeof updates.announcementDateForChange, 'function');
  for (const [changedAt, expected] of [
    ['2026-11-12T23:00:00+09:00', '2026-11-13'],
    ['2026-11-13T03:00:00+09:00', '2026-11-13'],
    ['2026-11-13T03:59:59.999+09:00', '2026-11-13'],
    ['2026-11-13T04:00:00+09:00', '2026-11-14'],
    ['2026-11-30T23:00:00+09:00', '2026-12-01'],
    ['2026-12-31T23:00:00+09:00', '2027-01-01'],
    ['2028-02-28T04:00:00+09:00', '2028-02-29'],
    ['2028-02-29T04:00:00+09:00', '2028-03-01'],
  ]) {
    assert.equal(updates.announcementDateForChange(Date.parse(changedAt)), expected, changedAt);
  }
});

test('release instants use Seoul 04:00 independently of the browser time zone', () => {
  assert.equal(typeof updates.updateReleaseTime, 'function');
  assert.equal(updates.updateReleaseTime('2026-11-13'), Date.parse('2026-11-12T19:00:00Z'));
  assert.equal(updates.updateReleaseTime('2027-01-01'), Date.parse('2026-12-31T19:00:00Z'));
});

test('published news includes the cutoff instant and hides all later batches', () => {
  assert.equal(typeof updates.publishedUpdateDays, 'function');
  const source = {
    '2026-11-14': { added: ['future'], fixed: [] },
    '2026-11-12': { added: ['past'], fixed: [] },
    '2026-11-13': { added: ['next'], fixed: ['fix'] },
  };
  assert.deepEqual(updates.publishedUpdateDays(Date.parse('2026-11-13T03:59:59.999+09:00'), source).map(day => day.date), ['2026-11-12']);
  assert.deepEqual(updates.publishedUpdateDays(Date.parse('2026-11-13T04:00:00+09:00'), source).map(day => day.date), ['2026-11-13', '2026-11-12']);
  assert.deepEqual(updates.publishedUpdateDays(Date.parse('2026-11-11T04:00:00+09:00'), source), []);
  assert.deepEqual(updates.publishedUpdateDays(Date.parse('2026-11-13T04:00:00+09:00'), {}), []);
});

test('next release skips already published batches and stops when no future batch exists', () => {
  assert.equal(typeof updates.nextUpdateReleaseTime, 'function');
  const source = {
    '2026-11-14': { added: ['later'], fixed: [] },
    '2026-11-12': { added: ['past'], fixed: [] },
    '2026-11-13': { added: ['next'], fixed: [] },
  };
  assert.equal(updates.nextUpdateReleaseTime(Date.parse('2026-11-13T03:59:59.999+09:00'), source), Date.parse('2026-11-12T19:00:00Z'));
  assert.equal(updates.nextUpdateReleaseTime(Date.parse('2026-11-13T04:00:00+09:00'), source), Date.parse('2026-11-13T19:00:00Z'));
  assert.equal(updates.nextUpdateReleaseTime(Date.parse('2026-11-14T04:00:00+09:00'), source), undefined);
  assert.equal(updates.nextUpdateReleaseTime(0, {}), undefined);
});

test('opening published news leaves the future batch unread when it releases', () => {
  assert.equal(typeof updates.createUpdateReadTracker, 'function');
  const source = {
    '2026-11-12': { added: ['past'], fixed: [] },
    '2026-11-13': { added: ['next'], fixed: [] },
  };
  const tracker = updates.createUpdateReadTracker(() => undefined);
  const before = updates.publishedUpdateDays(Date.parse('2026-11-13T03:59:59.999+09:00'), source);
  assert.equal(before[0].date, '2026-11-12');
  tracker.markRead(before[0].date);
  assert.equal(tracker.hasUnread(before[0].date), false);
  const after = updates.publishedUpdateDays(Date.parse('2026-11-13T04:00:00+09:00'), source);
  assert.equal(after[0].date, '2026-11-13');
  assert.equal(tracker.hasUnread(after[0].date), true);
});

test('read history survives a reload using the existing storage key', () => {
  assert.equal(typeof updates.createUpdateReadTracker, 'function');
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const firstVisit = updates.createUpdateReadTracker(() => storage);
  assert.equal(firstVisit.markRead('2026-11-13'), true);
  assert.equal(values.get('office-updates-read-day-v1'), '2026-11-13');
  const reloaded = updates.createUpdateReadTracker(() => storage);
  assert.equal(reloaded.hasUnread('2026-11-13'), false);
  assert.equal(reloaded.hasUnread('2026-11-14'), true);
});

test('blocked storage falls back to once-only read history during one visit', () => {
  assert.equal(typeof updates.createUpdateReadTracker, 'function');
  const blocked = {
    getItem(): string | null { throw Error('blocked'); },
    setItem() { throw Error('blocked'); },
  };
  for (const getStorage of [() => blocked, () => undefined, () => { throw Error('blocked access'); }]) {
    const tracker = updates.createUpdateReadTracker(getStorage);
    assert.equal(tracker.hasUnread('2026-11-13'), true);
    assert.equal(tracker.markRead('2026-11-13'), false);
    assert.equal(tracker.hasUnread('2026-11-13'), false);
    assert.equal(tracker.hasUnread('2026-11-14'), true);
    assert.equal(updates.createUpdateReadTracker(getStorage).hasUnread('2026-11-13'), true);
  }
});

test('older manual notices cannot downgrade a newer saved read marker', () => {
  let saved: string | null = '2026-11-14';
  const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
  assert.equal(markUpdatesRead('2026-11-12', storage), true);
  assert.equal(saved, '2026-11-14');
  assert.equal(hasUnreadUpdates('2026-11-14', storage), false);
});

test('read history keeps the newest observed marker if storage later regresses', () => {
  assert.equal(typeof updates.createUpdateReadTracker, 'function');
  let saved: string | null = '2026-11-14';
  const storage = { getItem: () => saved, setItem: (_key: string, value: string) => { saved = value; } };
  const tracker = updates.createUpdateReadTracker(() => storage);
  assert.equal(tracker.hasUnread('2026-11-14'), false);
  saved = '2026-11-12';
  assert.equal(tracker.hasUnread('2026-11-14'), false);
  assert.equal(tracker.markRead('2026-11-13'), true);
  assert.equal(saved, '2026-11-14');
});

test('explicit blocked storage retains read state across wrapper calls', () => {
  const storage = { getItem(): string | null { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.equal(hasUnreadUpdates('2026-11-13', storage), true);
  assert.equal(markUpdatesRead('2026-11-13', storage), false);
  assert.equal(hasUnreadUpdates('2026-11-13', storage), false);
});
