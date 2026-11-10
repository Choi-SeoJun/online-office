import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { handleRoomAction, type RoomDatabase } from './rooms.ts';
import { createMultiLayout } from '../game/multi-layout.ts';
import type { RoomSession, RoomSnapshot } from '../game/multi-types.ts';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../drizzle', import.meta.url)).filter(x => x.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const wrap = (query: string, values: (string | number | null)[] = []) => ({
    bind(...next: (string | number | null)[]) { return wrap(query, next); },
    async all() { return { success: true, results: sql.prepare(query).all(...values), meta: { changes: Number(sql.prepare('SELECT changes() AS n').get()!.n) } }; },
    async first() { return sql.prepare(query).get(...values) ?? null; },
    async run() { const result = sql.prepare(query).run(...values); return { success: true, results: [], meta: { changes: Number(result.changes) } }; },
    execute() { return { success: true, results: sql.prepare(query).all(...values), meta: { changes: Number(sql.prepare('SELECT changes() AS n').get()!.n) } }; },
  });
  const db = { prepare: wrap, async batch(statements: ReturnType<typeof wrap>[]) {
    sql.exec('BEGIN'); try { const results = statements.map(s => s.execute()); sql.exec('COMMIT'); return results; } catch (error) { sql.exec('ROLLBACK'); throw error; }
  } } as unknown as RoomDatabase;
  let now = 1_000_000;
  const send = (input: unknown, key = 'visitor') => handleRoomAction(db, input, { now, rateKey: key });
  const advance = (ms: number) => { now += ms; };
  const create = async (capacity = 4) => {
    const r = await send({ action: 'create', name: '김사원', roomName: '우리 회사', capacity });
    assert.equal(r.status, 201); return r.body as { session: RoomSession; snapshot: RoomSnapshot };
  };
  return { sql, send, advance, create };
}

test('creates a private member session and joins with unique server-owned seats', async () => {
  const f = fixture(), first = await f.create(2);
  assert.equal(first.snapshot.players[0].seatIndex, 0);
  assert.equal(first.snapshot.room.hostId, first.session.playerId);
  assert.match(first.session.code, /^[A-Z2-9]{8}$/);
  assert.ok(first.session.token.length >= 40);
  assert.ok(!JSON.stringify(first.snapshot).includes(first.session.token));
  const stored = f.sql.prepare('SELECT token_hash FROM office_members').get()!;
  assert.notEqual(stored.token_hash, first.session.token);
  const joined = await f.send({ action: 'join', code: first.session.code.toLowerCase(), name: '이대리' });
  assert.equal(joined.status, 201);
  assert.equal((joined.body as { snapshot: RoomSnapshot }).snapshot.players[1].seatIndex, 1);
  const full = await f.send({ action: 'join', code: first.session.code, name: '최주임' });
  assert.equal(full.status, 409);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM office_members').get()!.n, 2);
});

test('concurrent admission never exceeds the configured capacity', async () => {
  const f = fixture(), owner = await f.create(4);
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => f.send({ action: 'join', code: owner.session.code, name: `동료${i}` }, `joiner${i}`)));
  assert.equal(results.filter(r => r.status === 201).length, 3);
  const rows = f.sql.prepare('SELECT seat_index FROM office_members').all();
  assert.equal(rows.length, 4); assert.equal(new Set(rows.map(r => r.seat_index)).size, 4);
});

test('rejects another room token, malformed inputs, and impossible positions', async () => {
  const f = fixture(), a = await f.create(), b = await f.create();
  const wrong = await f.send({ action: 'sync', code: a.session.code, token: b.session.token });
  assert.equal(wrong.status, 401);
  for (const input of [null, { action: 'create', capacity: 17, name: 'a', roomName: 'x' }, { action: 'join', code: '../x', name: 'a' }]) assert.equal((await f.send(input)).status, 400);
  const auth = { code: a.session.code, token: a.session.token };
  for (const x of [Infinity, NaN, 9999]) {
    const r = await f.send({ action: 'sync', ...auth, player: { x, z: 0, angle: 0, pose: 'walk', moving: true } }); assert.equal(r.status, 400);
  }
  const seat = createMultiLayout(4).desks[1].seat;
  assert.equal((await f.send({ action: 'sync', ...auth, player: { ...seat, angle: 0, pose: 'sit', moving: false } })).status, 400);
});

test('synchronizes positions and chat with server identity, limits spam and keeps only 100 messages', async () => {
  const f = fixture(), a = await f.create(), auth = { code: a.session.code, token: a.session.token };
  const seat = createMultiLayout(4).desks[0].seat;
  f.advance(300);
  const sync = await f.send({ action: 'sync', ...auth, player: { ...seat, angle: Math.PI, pose: 'type', moving: false } });
  assert.equal(sync.status, 200); assert.equal((sync.body as { snapshot: RoomSnapshot }).snapshot.players[0].pose, 'type');
  assert.equal((await f.send({ action: 'sync', ...auth })).status, 429);
  const sent = await f.send({ action: 'chat', ...auth, text: '<b>점심 먹을까요?</b>', name: '위장' });
  assert.equal(sent.status, 200);
  const message = (sent.body as { snapshot: RoomSnapshot }).snapshot.messages[0];
  assert.equal(message.name, '김사원'); assert.equal(message.text, '<b>점심 먹을까요?</b>');
  assert.equal((await f.send({ action: 'chat', ...auth, text: '또' })).status, 429);
  assert.equal((await f.send({ action: 'chat', ...auth, text: '가'.repeat(201) })).status, 400);
  for (let i = 0; i < 103; i++) { f.advance(1001); assert.equal((await f.send({ action: 'chat', ...auth, text: `대화${i}` })).status, 200); }
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM office_messages').get()!.n, 100);
});

test('only the host can resize and occupied seats cannot be removed', async () => {
  const f = fixture(), a = await f.create(3);
  const b = (await f.send({ action: 'join', code: a.session.code, name: '둘째' })).body as { session: RoomSession };
  const c = (await f.send({ action: 'join', code: a.session.code, name: '셋째' })).body as { session: RoomSession };
  assert.equal((await f.send({ action: 'capacity', ...b.session, capacity: 16 })).status, 403);
  assert.equal((await f.send({ action: 'capacity', ...a.session, capacity: 2 })).status, 409);
  assert.equal((await f.send({ action: 'leave', ...c.session })).status, 200);
  assert.equal((await f.send({ action: 'capacity', ...a.session, capacity: 2 })).status, 200);
  assert.equal((await f.send({ action: 'capacity', ...a.session, capacity: 16 })).status, 200);
});

test('reserves disconnected seats for 120 seconds, reclaims safely and transfers host ownership', async () => {
  const f = fixture(), a = await f.create(2);
  const b = (await f.send({ action: 'join', code: a.session.code, name: '둘째' })).body as { session: RoomSession };
  f.advance(119_000);
  assert.equal((await f.send({ action: 'sync', ...b.session })).status, 200);
  assert.equal((await f.send({ action: 'join', code: a.session.code, name: '셋째' })).status, 409);
  f.advance(2000);
  const c = await f.send({ action: 'join', code: a.session.code, name: '셋째' });
  assert.equal(c.status, 201);
  const state = (c.body as { snapshot: RoomSnapshot }).snapshot;
  assert.equal(state.room.hostId, b.session.playerId);
  assert.equal((await f.send({ action: 'sync', ...a.session })).status, 401);
  const left = await f.send({ action: 'leave', ...b.session }); assert.deepEqual(left.body, { left: true });
});

test('rooms expire after 24 hours and public admission has a persistent request limit', async () => {
  const f = fixture(), a = await f.create();
  for (let i = 0; i < 9; i++) assert.equal((await f.send({ action: 'create', name: '사원', roomName: '방', capacity: 2 })).status, 201);
  assert.equal((await f.send({ action: 'create', name: '사원', roomName: '방', capacity: 2 })).status, 429);
  f.advance(24 * 60 * 60 * 1000 + 1);
  const expired = await f.send({ action: 'sync', ...a.session }); assert.equal(expired.status, 410);
  assert.equal((expired.body as { code: string }).code, 'ROOM_EXPIRED');
});

test('expanding desks moves an obstructed visitor to the safe entrance', async () => {
  const f = fixture(), a = await f.create(2);
  f.advance(300);
  assert.equal((await f.send({ action: 'sync', ...a.session, player: { x: 2.4, z: .66, angle: 0, pose: 'idle', moving: false } })).status, 200);
  const expanded = await f.send({ action: 'capacity', ...a.session, capacity: 4 });
  assert.equal(expanded.status, 200);
  const own = (expanded.body as { snapshot: RoomSnapshot }).snapshot.players[0];
  assert.deepEqual({ x: own.x, z: own.z }, createMultiLayout(4).spawn);
});

test('simultaneous chat and sync requests cannot bypass member cooldowns', async () => {
  const f = fixture(), a = await f.create();
  f.advance(300);
  const syncs = await Promise.all(Array.from({ length: 4 }, () => f.send({ action: 'sync', ...a.session })));
  assert.equal(syncs.filter(x => x.status === 200).length, 1);
  const chats = await Promise.all(Array.from({ length: 4 }, () => f.send({ action: 'chat', ...a.session, text: '동시 전송' })));
  assert.equal(chats.filter(x => x.status === 200).length, 1);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM office_messages').get()!.n, 1);
});

test('leaving the host role skips disconnected members whose leases elapsed', async () => {
  const f = fixture(), host = await f.create(3);
  await f.send({ action: 'join', code: host.session.code, name: '자리비움' });
  const active = (await f.send({ action: 'join', code: host.session.code, name: '남은동료' })).body as { session: RoomSession };
  f.advance(121_000);
  assert.equal((await f.send({ action: 'sync', ...active.session })).status, 200);
  assert.equal((await f.send({ action: 'leave', ...host.session })).status, 200);
  assert.equal(f.sql.prepare('SELECT host_id FROM office_rooms').get()!.host_id, active.session.playerId);
});

test('chat preserves plain multiline text while rejecting non-line-break control characters', async () => {
  const f = fixture(), a = await f.create();
  const result = await f.send({ action: 'chat', ...a.session, text: '  <b>점심</b>\r\n같이 먹어요\r좋아요?  ' });
  assert.equal(result.status, 200);
  assert.equal((result.body as { snapshot: RoomSnapshot }).snapshot.messages[0].text, '<b>점심</b>\n같이 먹어요\n좋아요?');
  for (const control of ['\t', '\u0000', '\u000b', '\u001f', '\u007f']) {
    assert.equal((await f.send({ action: 'chat', ...a.session, text: `안녕${control}동료` })).status, 400);
  }
});

test('a remaining active member inherits an expired host lease on sync and can resize', async () => {
  const f = fixture(), host = await f.create(3);
  const active = (await f.send({ action: 'join', code: host.session.code, name: '남은동료' })).body as { session: RoomSession };
  f.advance(121_000);
  const response = await f.send({ action: 'sync', ...active.session });
  assert.equal(response.status, 200);
  const state = (response.body as { snapshot: RoomSnapshot }).snapshot;
  assert.equal(state.players.length, 1);
  assert.equal(state.room.hostId, active.session.playerId);
  assert.equal((await f.send({ action: 'capacity', ...active.session, capacity: 6 })).status, 200);
});

test('chat also renews membership before assigning a disconnected host role', async () => {
  const f = fixture(), host = await f.create(3);
  const active = (await f.send({ action: 'join', code: host.session.code, name: '남은동료' })).body as { session: RoomSession };
  f.advance(121_000);
  const response = await f.send({ action: 'chat', ...active.session, text: '누구 계세요?' });
  assert.equal(response.status, 200);
  assert.equal((response.body as { snapshot: RoomSnapshot }).snapshot.room.hostId, active.session.playerId);
});
