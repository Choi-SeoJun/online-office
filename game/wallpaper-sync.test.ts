import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWallpaperSync } from './wallpaper-sync.ts';
const settle = () => new Promise<void>(resolve => setImmediate(resolve));
function clock() {
  let time = 0;
  const timers: { at: number; run: () => void; cancelled: boolean }[] = [];
  return {
    now: () => time,
    schedule(run: () => void, delay: number) { const timer = { at: time + delay, run, cancelled: false }; timers.push(timer); return () => { timer.cancelled = true; }; },
    async advance(delay: number) { time += delay; for (const timer of timers.splice(0)) { if (!timer.cancelled && timer.at <= time) timer.run(); else if (!timer.cancelled) timers.push(timer); } await settle(); },
  };
}
test('one personal wallpaper automatically follows entry to two independent rooms', async () => {
  const writes: unknown[] = [], c = clock();
  const make = (room: string) => createWallpaperSync({ ...c, initialImage: null, save: async image => { writes.push([room, image]); }, onStatus() {}, onSaved() {} });
  const first = make('first'); first.set('my-photo'); await settle(); first.set('my-photo'); await settle(); first.dispose();
  const second = make('second'); second.set('my-photo'); await settle();
  assert.deepEqual(writes, [['first', 'my-photo'], ['second', 'my-photo']]); second.dispose();
});
test('rapid changes are serialized and the latest reset wins over an earlier in-flight image', async () => {
  const writes: (string | null)[] = [], c = clock(); let finish!: () => void;
  const sync = createWallpaperSync({ ...c, save: async image => { writes.push(image); if (writes.length === 1) await new Promise<void>(resolve => { finish = resolve; }); }, onStatus() {}, onSaved() {} });
  sync.set('old'); sync.set('intermediate'); sync.set(null); assert.deepEqual(writes, ['old']);
  finish(); await settle(); await c.advance(2199); assert.deepEqual(writes, ['old']); await c.advance(1);
  assert.deepEqual(writes, ['old', null]); sync.dispose();
});
test('failed sharing retries without losing the personal selection or duplicating successful uploads', async () => {
  const c = clock(), statuses: string[] = []; let attempts = 0, saved = 0;
  const sync = createWallpaperSync({ ...c, save: async image => { assert.equal(image, 'photo'); if (++attempts === 1) throw new Error('offline'); }, onStatus: status => statuses.push(status), onSaved: () => saved++ });
  sync.set('photo'); await settle(); assert.equal(statuses.at(-1), 'retrying');
  await c.advance(5000); assert.equal(attempts, 2); assert.equal(saved, 1); assert.equal(statuses.at(-1), 'saved');
  sync.retry(); await settle(); assert.equal(attempts, 2); sync.dispose();
});
test('leaving a room cancels pending work and ignores a late response', async () => {
  const c = clock(); let finish!: () => void, signal!: AbortSignal, saved = 0;
  const sync = createWallpaperSync({ ...c, save: async (_, requestSignal) => { signal = requestSignal; await new Promise<void>(resolve => { finish = resolve; }); }, onStatus() {}, onSaved: () => saved++ });
  sync.set('photo'); sync.dispose(); assert.equal(signal.aborted, true); finish(); await settle(); await c.advance(10000); assert.equal(saved, 0);
});
test('a lost upload response cannot suppress a newer reset to the previous default', async () => {
  const c = clock(), writes: (string | null)[] = []; let fail!: () => void;
  const sync = createWallpaperSync({ ...c, initialImage: null, save: async image => {
    writes.push(image);
    if (writes.length === 1) await new Promise<void>((_, reject) => { fail = () => reject(new Error('response lost after commit')); });
  }, onStatus() {}, onSaved() {} });
  sync.set('photo'); sync.set(null); fail(); await settle(); await c.advance(5000);
  assert.deepEqual(writes, ['photo', null]); sync.dispose();
});
test('a fresh default needs no upload, but an explicit reset clears an existing room image', async () => {
  const writes: (string | null)[] = [];
  const options = { save: async (image: string | null) => { writes.push(image); }, onStatus() {}, onSaved() {} };
  const fresh = createWallpaperSync({ ...options, initialImage: null }); fresh.set(undefined); fresh.set(null); await settle(); assert.equal(writes.length, 0); fresh.dispose();
  const restored = createWallpaperSync(options); restored.set(null); await settle(); assert.deepEqual(writes, [null]); restored.dispose();
});
