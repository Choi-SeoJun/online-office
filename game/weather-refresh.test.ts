import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { watchLocalWeather } from './weather-refresh.ts';

function watch(t: TestContext) {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 1_000_000 });
  const window = Object.assign(new EventTarget(), { navigator: { onLine: true } });
  const document = Object.assign(new EventTarget(), { hidden: false });
  const attempt = { lastAttempt: Date.now(), failures: 0, inFlight: false };
  const refreshes: number[] = [], clock: number[] = [];
  const stop = watchLocalWeather({ window, document, getAttempt: () => attempt,
    onTick: now => clock.push(now),
    onRefresh: () => { attempt.lastAttempt = Date.now(); refreshes.push(Date.now()); },
  });
  t.after(stop);
  return { window, document, attempt, refreshes, clock, stop, advance: (ms: number) => t.mock.timers.tick(ms) };
}

test('an open game refreshes every five minutes without clicks or reloads', t => {
  const w = watch(t);
  w.advance(4 * 60_000);
  assert.equal(w.refreshes.length, 0);
  assert.ok(w.clock.length > 0, 'the sky clock continues between weather requests');
  w.advance(60_000);
  assert.equal(w.refreshes.length, 1);
  w.advance(5 * 60_000);
  assert.equal(w.refreshes.length, 2);
});

test('hidden tabs catch up once on return without replaying missed refreshes', t => {
  const w = watch(t);
  w.document.hidden = true;
  w.advance(60 * 60_000);
  assert.equal(w.refreshes.length, 0);
  w.document.hidden = false;
  w.document.dispatchEvent(new Event('visibilitychange'));
  w.window.dispatchEvent(new Event('focus'));
  assert.equal(w.refreshes.length, 1);
  w.advance(30_000);
  assert.equal(w.refreshes.length, 1);
});

test('network recovery refreshes automatically and never overlaps a pending request', t => {
  const w = watch(t);
  w.window.navigator.onLine = false;
  w.advance(10 * 60_000);
  assert.equal(w.refreshes.length, 0);
  w.window.navigator.onLine = true;
  w.window.dispatchEvent(new Event('online'));
  assert.equal(w.refreshes.length, 1);
  w.attempt.inFlight = true;
  w.advance(10 * 60_000);
  w.window.dispatchEvent(new Event('online'));
  w.window.dispatchEvent(new Event('focus'));
  assert.equal(w.refreshes.length, 1);
  w.attempt.inFlight = false;
  w.advance(30_000);
  assert.equal(w.refreshes.length, 2);
});

test('failures retry automatically with backoff and return to five minutes after recovery', t => {
  const w = watch(t);
  for (const [failures, delay] of [[1, 60_000], [2, 120_000], [3, 240_000], [4, 300_000]]) {
    w.attempt.failures = failures;
    const before = w.refreshes.length;
    w.advance(delay - 30_000);
    assert.equal(w.refreshes.length, before);
    w.advance(30_000);
    assert.equal(w.refreshes.length, before + 1);
  }
  w.attempt.failures = 0;
  w.advance(4 * 60_000);
  assert.equal(w.refreshes.length, 4);
  w.advance(60_000);
  assert.equal(w.refreshes.length, 5);
});

test('fresh cached data is reused and disposal removes timers and event listeners', t => {
  const w = watch(t);
  w.window.dispatchEvent(new Event('focus'));
  w.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(w.refreshes.length, 0);
  w.stop();
  const ticks = w.clock.length;
  w.advance(60 * 60_000);
  w.window.dispatchEvent(new Event('online'));
  w.window.dispatchEvent(new Event('focus'));
  w.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(w.refreshes.length, 0);
  assert.equal(w.clock.length, ticks);
});
