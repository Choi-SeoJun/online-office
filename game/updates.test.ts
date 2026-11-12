import test from 'node:test';
import assert from 'node:assert/strict';
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
