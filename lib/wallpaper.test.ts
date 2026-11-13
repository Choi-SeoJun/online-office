import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { handleRoomAction, type RoomDatabase } from './rooms.ts';
import { collectWallpaperFiles, handleWallpaperAction, type WallpaperBucket } from './wallpaper.ts';
import { handleWallpaperRequest } from './wallpaper-http.ts';
import { wallpaperDataUrl, WALLPAPER_BODY_LIMIT } from '../game/wallpaper.ts';
import type { RoomSession, RoomSnapshot } from '../game/multi-types.ts';
const image = wallpaperDataUrl(new Uint8Array(readFileSync(new URL('../game/fixtures/monitor.jpg', import.meta.url))));
type Joined = { session: RoomSession; snapshot: RoomSnapshot };
async function fixture() {
  const sql = new DatabaseSync(':memory:'); sql.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../drizzle', import.meta.url)).filter(x => x.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const wrap = (query: string, values: (string | number | null)[] = []) => ({
    bind: (...next: (string | number | null)[]) => wrap(query, next),
    async all() { return { results: sql.prepare(query).all(...values) }; },
    async first() { return sql.prepare(query).get(...values) ?? null; },
    async run() { return sql.prepare(query).run(...values); },
    execute() { return { results: sql.prepare(query).all(...values) }; },
  });
  const db = { prepare: wrap, async batch(statements: ReturnType<typeof wrap>[]) { sql.exec('BEGIN'); try { const result = statements.map(s => s.execute()); sql.exec('COMMIT'); return result; } catch (error) { sql.exec('ROLLBACK'); throw error; } } } as unknown as RoomDatabase;
  const files = new Map<string, ArrayBuffer>();
  const bucket: WallpaperBucket = { async put(key, value) { files.set(key, value); }, async get(key) { const data = files.get(key); return data ? { async arrayBuffer() { return data; } } : null; }, async delete(key) { files.delete(key); } };
  let now = Date.now();
  const room = (input: unknown) => handleRoomAction(db, input, { now, rateKey: 'test' });
  const create = async () => (await room({ action: 'create', name: '테스트', roomName: '화면 확인', capacity: 4 })).body as Joined;
  const host = await create(), guest = (await room({ action: 'join', code: host.session.code, name: '동료' })).body as Joined, outsider = await create();
  const send = (input: Record<string, unknown>) => handleWallpaperAction(db, bucket, input, now);
  return { sql, db, files, bucket, host, guest, outsider, send, room, advance(ms: number) { now += ms; }, now: () => now };
}
test('wallpaper is shared only within an active room and snapshots carry IDs, not image bytes', async () => {
  const f = await fixture(), saved = await f.send({ action: 'set', ...f.host.session, image });
  assert.equal(saved.status, 200); const id = saved.body.wallpaperId;
  assert.equal((await f.send({ action: 'read', ...f.guest.session, id })).body.image, image);
  assert.equal((await f.send({ action: 'read', ...f.outsider.session, id })).status, 404);
  assert.equal((await f.send({ action: 'read', code: f.host.session.code, id })).status, 401);
  const synced = await f.room({ action: 'sync', ...f.guest.session });
  const snapshot = (synced.body as { snapshot: RoomSnapshot }).snapshot;
  assert.equal(snapshot.players.find(p => p.id === f.host.session.playerId)?.wallpaperId, id);
  assert.equal(JSON.stringify(snapshot).includes('base64'), false);
  f.advance(121_000); assert.equal((await f.send({ action: 'read', ...f.guest.session, id })).status, 401);
});
test('a member cannot replace another desk; replace/reset reclaim old files and have a write cooldown', async () => {
  const f = await fixture();
  const a = await f.send({ action: 'set', ...f.host.session, image });
  const b = await f.send({ action: 'set', ...f.guest.session, playerId: f.host.session.playerId, image });
  assert.notEqual(a.body.wallpaperId, b.body.wallpaperId);
  assert.equal(f.files.size, 2);
  assert.equal((await f.send({ action: 'remove', ...f.host.session })).status, 429);
  f.advance(2001);
  const c = await f.send({ action: 'set', ...f.host.session, image }); assert.equal(c.status, 200); assert.equal(f.files.size, 2);
  assert.equal((await f.send({ action: 'read', ...f.guest.session, id: a.body.wallpaperId })).status, 404);
  f.advance(2001); assert.equal((await f.send({ action: 'remove', ...f.host.session })).body.wallpaperId, null); assert.equal(f.files.size, 1);
  assert.equal((await f.send({ action: 'read', ...f.host.session, id: b.body.wallpaperId })).status, 200);
});
test('failed upload preserves the current wallpaper; leaving during an upload cannot publish it', async () => {
  const f = await fixture(), a = await f.send({ action: 'set', ...f.host.session, image }); f.advance(2001);
  const put = f.bucket.put; f.bucket.put = async () => { throw new Error('R2 unavailable'); };
  assert.equal((await f.send({ action: 'set', ...f.host.session, image })).status, 503);
  assert.equal((await f.send({ action: 'read', ...f.guest.session, id: a.body.wallpaperId })).status, 200);
  assert.equal(f.files.size, 1);
  f.bucket.put = async (...args) => { await put(...args); f.sql.prepare('DELETE FROM office_members WHERE id = ?').run(f.host.session.playerId); };
  assert.equal((await f.send({ action: 'set', ...f.host.session, image })).status, 409);
  assert.equal(f.files.size, 1);
});
test('simultaneous writes produce one winner without orphaning the losing upload', async () => {
  const f = await fixture(); let ready!: () => void; const gate = new Promise<void>(resolve => { ready = resolve; }); let count = 0;
  const put = f.bucket.put; f.bucket.put = async (...args) => { await put(...args); if (++count === 2) ready(); await gate; };
  const results = await Promise.all([f.send({ action: 'set', ...f.host.session, image }), f.send({ action: 'set', ...f.host.session, image })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal(f.files.size, 1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM office_wallpaper_files').get()?.n, 1);
});
test('expired rooms cannot read images and bounded collection reclaims files after room deletion', async () => {
  const f = await fixture(); await f.send({ action: 'set', ...f.host.session, image });
  await collectWallpaperFiles(f.db, f.bucket, f.now() + 400_000); assert.equal(f.files.size, 1);
  f.sql.prepare('UPDATE office_rooms SET expires_at = ? WHERE code = ?').run(f.now(), f.host.session.code);
  assert.equal((await f.send({ action: 'remove', ...f.host.session })).status, 401);
  f.sql.prepare('DELETE FROM office_rooms WHERE code = ?').run(f.host.session.code);
  await collectWallpaperFiles(f.db, f.bucket, f.now() + 400_000); assert.equal(f.files.size, 0);
});
test('HTTP allows Pages with membership auth, bounds streamed bodies, and rejects cross-origin reads and invalid files', async () => {
  const f = await fixture(), endpoint = 'https://office.example/api/wallpaper';
  const request = (body: unknown, origin = 'https://choi-seojun.github.io') => new Request(endpoint, { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await handleWallpaperRequest(request({ action: 'set', ...f.host.session, image }), f.db, f.bucket);
  assert.equal(result.status, 200); assert.equal(result.headers.get('Access-Control-Allow-Origin'), 'https://choi-seojun.github.io'); assert.match(result.headers.get('Cache-Control')!, /no-store/);
  assert.equal((await handleWallpaperRequest(request({}, 'https://evil.example'), f.db, f.bucket)).status, 403);
  assert.equal((await handleWallpaperRequest(new Request(endpoint), f.db, f.bucket)).status, 405);
  assert.equal((await handleWallpaperRequest(request({ filler: 'x'.repeat(WALLPAPER_BODY_LIMIT) }), f.db, f.bucket)).status, 413);
  assert.equal((await handleWallpaperRequest(request({ action: 'set', ...f.guest.session, image: 'data:image/svg+xml;base64,PHN2Zz4=' }), f.db, f.bucket)).status, 400);
  assert.equal((await handleWallpaperRequest(request({}), f.db)).status, 503);
});
