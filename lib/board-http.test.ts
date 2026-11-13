import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { BOARD_BODY_LIMIT, BOARD_MAX_ENTRIES, BOARD_MAX_POINTS, BOARD_MAX_STROKES, type BoardDraft } from '../game/board-types.ts';
import { BOARD_CREATE_INTERVAL_MS, handleBoardAction } from './board.ts';
import { handleBoardRequest } from './board-http.ts';
import { hashRoomToken, ROOM_SEAT_LEASE_MS, type RoomDatabase } from './rooms.ts';

const start = 10_000_000;
const origin = 'https://office.example';
const endpoint = origin + '/api/board';
const pages = 'https://choi-seojun.github.io';
const note = (overrides: Partial<BoardDraft> = {}): BoardDraft => ({
  id: crypto.randomUUID(), kind: 'note', color: 'yellow', text: '한 줄 공지', strokes: [], ...overrides,
});

async function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(new URL('../drizzle', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) {
    sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  }
  function prepare(query: string, params: (string | number | null)[] = []) {
    return {
      bind: (...next: (string | number | null)[]) => prepare(query, next),
      execute: () => ({ results: sql.prepare(query).all(...params) }),
    };
  }
  const db = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sql.exec('BEGIN');
      try {
        const results = statements.map(statement => statement.execute());
        sql.exec('COMMIT');
        return results;
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as RoomDatabase;
  const createRoom = (code: string) => {
    const id = crypto.randomUUID();
    sql.prepare('INSERT INTO office_rooms (code, name, capacity, host_id, created_at, expires_at) VALUES (?, ?, 4, ?, ?, ?)').run(code, '회사', id, start, start + 86_400_000);
    return id;
  };
  async function member(code: string, id = crypto.randomUUID(), seat = 0, name = '김사원') {
    const token = crypto.randomUUID().replaceAll('-', '').repeat(2);
    const hash = await hashRoomToken(token);
    sql.prepare(`INSERT INTO office_members (id, room_code, token_hash, seat_index, name, x, z, angle, pose, moving, joined_at, last_seen)
      VALUES (?, ?, ?, ?, ?, 0, 0, 0, 'idle', 0, ?, ?)`).run(id, code, hash, seat, name, start, start);
    return { code, token, id };
  }
  const code = 'ABCDEFGH';
  const otherCode = 'ABCDEFGJ';
  const host = await member(code, createRoom(code));
  const author = await member(code, undefined, 1, '이사원');
  const visitor = await member(code, undefined, 2);
  const outsider = await member(otherCode, createRoom(otherCode));
  const send = (input: Record<string, unknown>, now = start) => handleBoardAction(db, input, now);
  return { sql, db, code, host, author, visitor, outsider, send };
}

test('board isolates rooms and requires an active membership token', async () => {
  const { sql, code, host, author, outsider, send } = await fixture();
  const draft = note();
  const created = await send({ action: 'create', ...author, draft, authorId: host.id, authorName: '다른 이름' });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body, { entries: [{ ...draft, authorId: author.id, authorName: '이사원', createdAt: start }] });
  assert.deepEqual((await send({ action: 'list', ...host })).body, created.body);
  assert.deepEqual((await send({ action: 'list', ...outsider })).body, { entries: [] });
  assert.equal((await send({ action: 'list', code, token: outsider.token })).status, 401);
  assert.equal((await send({ action: 'list', code })).status, 401);
  assert.equal((await send({ action: 'list', ...author }, start + ROOM_SEAT_LEASE_MS + 1)).status, 401);
  assert.equal((await send({ action: 'create', ...author, draft: note() }, start + ROOM_SEAT_LEASE_MS + 1)).status, 401);
  assert.equal((await send({ action: 'delete', ...host, id: draft.id }, start + 86_400_000)).status, 410);
  sql.prepare('DELETE FROM office_rooms WHERE code = ?').run(code);
  assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM office_board_entries').get()?.count, 0);
});

test('board deletion requires the author or current host and is safe to retry', async () => {
  const { sql, code, host, author, visitor, send } = await fixture();
  const first = note();
  const second = note();
  await send({ action: 'create', ...author, draft: first });
  await send({ action: 'create', ...author, draft: second }, start + BOARD_CREATE_INTERVAL_MS);
  assert.equal((await send({ action: 'delete', ...visitor, id: first.id })).status, 403);
  sql.prepare('UPDATE office_rooms SET host_id = ? WHERE code = ?').run(visitor.id, code);
  assert.equal((await send({ action: 'delete', ...host, id: first.id })).status, 403);
  assert.equal((await send({ action: 'delete', ...visitor, id: first.id })).status, 200);
  assert.deepEqual((await send({ action: 'delete', ...author, id: second.id })).body, { entries: [] });
  assert.deepEqual((await send({ action: 'delete', ...author, id: second.id })).body, { entries: [] });
  assert.equal((await send({ action: 'create', ...author, draft: note() }, start + BOARD_CREATE_INTERVAL_MS + 1)).status, 429);
});

test('concurrent duplicate posts are idempotent and concurrent authors share the same capacity', async () => {
  const { host, author, visitor, send } = await fixture();
  const draft = note();
  const sendCreate = (member: typeof host, draft: BoardDraft, now = start) => send({ action: 'create', ...member, draft }, now);
  const duplicates = await Promise.all([sendCreate(author, draft), sendCreate(author, draft)]);
  assert.deepEqual(duplicates.map(result => result.status).sort(), [200, 201]);
  assert.deepEqual(duplicates[0].body, duplicates[1].body);
  assert.equal((await sendCreate(host, draft)).status, 409);
  assert.equal((await sendCreate(author, note())).status, 429);
  for (let i = 1; i < BOARD_MAX_ENTRIES - 1; i++) {
    assert.equal((await sendCreate(author, note(), start + i * BOARD_CREATE_INTERVAL_MS)).status, 201);
  }
  const now = start + BOARD_MAX_ENTRIES * BOARD_CREATE_INTERVAL_MS;
  const last = await Promise.all([sendCreate(host, note(), now), sendCreate(visitor, note(), now)]);
  assert.deepEqual(last.map(result => result.status).sort(), [201, 409]);
  assert.equal((await sendCreate(author, draft, now)).status, 200);
  const snapshot = await send({ action: 'list', ...host }, now);
  assert.equal('entries' in snapshot.body && snapshot.body.entries.length, BOARD_MAX_ENTRIES);
});

test('board rejects malformed, oversized or non-normalized content and accepts plain text and bounded doodles', async () => {
  const { host, send } = await fixture();
  const draw = { color: 'blue', points: [{ x: 0, y: 1 }] } as const;
  for (const draft of [
    note({ text: ' ' }), note({ text: '가'.repeat(281) }), note({ kind: 'text', text: 'a'.repeat(2001) }),
    note({ id: 'missing' }), note({ kind: 'doodle', text: '' }),
    { ...note(), color: 'url(https://example.test)' },
    { ...note(), kind: 'doodle', strokes: Array(BOARD_MAX_STROKES + 1).fill(draw) },
    { ...note(), kind: 'doodle', strokes: [{ ...draw, points: Array(BOARD_MAX_POINTS + 1).fill(draw.points[0]) }] },
    { ...note(), kind: 'doodle', strokes: [{ ...draw, points: [{ x: -0.1, y: 1 }] }] },
    { ...note(), kind: 'doodle', strokes: [{ ...draw, points: [{ x: Number.POSITIVE_INFINITY, y: 1 }] }] },
    { ...note(), kind: 'doodle', strokes: [{ ...draw, points: [{ x: '0', y: 1 }] }] },
  ]) {
    assert.equal((await send({ action: 'create', ...host, draft })).status, 400);
  }
  const text = note({ kind: 'text', text: '  <b>공지</b>\r\n두 번째 줄  ' });
  const textResult = await send({ action: 'create', ...host, draft: text });
  assert.ok('entries' in textResult.body);
  assert.equal(textResult.body.entries[0].text, '<b>공지</b>\n두 번째 줄');
  const doodle = note({ kind: 'doodle', text: '', strokes: [{ color: 'blue', points: [{ x: 0.123456, y: 1 }] }] });
  const doodleResult = await send({ action: 'create', ...host, draft: doodle }, start + BOARD_CREATE_INTERVAL_MS);
  assert.equal(doodleResult.status, 201);
  assert.ok('entries' in doodleResult.body);
  assert.deepEqual(doodleResult.body.entries[0].strokes[0].points, [{ x: 0.1235, y: 1 }]);
});

test('board HTTP uses the exact frontend origin and enforces the byte limit before parsing', async () => {
  const { db } = await fixture();
  const preflight = (requestOrigin: string, extra = 'content-type') => handleBoardRequest(new Request(endpoint, {
    method: 'OPTIONS', headers: { origin: requestOrigin, 'access-control-request-method': 'POST', 'access-control-request-headers': extra },
  }));
  for (const accepted of [pages, origin]) {
    const response = await preflight(accepted);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), accepted);
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
  }
  assert.equal((await preflight(pages + '.example.com')).status, 403);
  assert.equal((await preflight(pages, 'content-type, authorization')).status, 400);
  const request = (body: string) => new Request(endpoint, { method: 'POST', body, headers: { 'content-type': 'application/json', origin: pages } });
  const oversized = await handleBoardRequest(request(JSON.stringify('가'.repeat(BOARD_BODY_LIMIT / 2))), db);
  assert.equal(oversized.status, 413);
  assert.equal(oversized.headers.get('cache-control'), 'private, no-store');
  assert.equal((await handleBoardRequest(request('{'), db)).status, 400);
  assert.equal((await handleBoardRequest(new Request(endpoint, { method: 'POST', body: '{}', headers: { 'sec-fetch-site': 'cross-site' } }), db)).status, 403);
});

test('active members move notes without changing their content, authorship or delete authority', async () => {
  const { sql, author, visitor, outsider, send } = await fixture();
  const draft = note({ placement: { x: .1, y: .2, width: .2, height: .3 } });
  assert.equal((await send({ action: 'create', ...author, draft })).status, 201);
  const placement = { x: .5, y: .4, width: .2, height: .3 };
  const moved = await send({ action: 'move', ...visitor, id: draft.id, placement, text: '위조', authorId: visitor.id });
  assert.equal(moved.status, 200);
  assert.deepEqual(moved.body, { entries: [{ ...draft, placement, authorId: author.id, authorName: '이사원', createdAt: start }] });
  assert.equal((await send({ action: 'delete', ...visitor, id: draft.id })).status, 403);
  assert.equal((await send({ action: 'move', code: author.code, token: outsider.token, id: draft.id, placement })).status, 401);
  assert.equal((await send({ action: 'move', ...visitor, id: draft.id, placement }, start + ROOM_SEAT_LEASE_MS + 1)).status, 401);
  for (const invalid of [{ ...placement, x: -.1 }, { ...placement, x: .9 }, { ...placement, height: 0 }, { ...placement, y: NaN }, { ...placement, width: Infinity }, null]) {
    assert.equal((await send({ action: 'move', ...visitor, id: draft.id, placement: invalid })).status, 400);
  }
  assert.equal(sql.prepare('SELECT text FROM office_board_entries').get()!.text, draft.text);
});

test('moving a card cannot resize it or transform a saved full-board drawing', async () => {
  const { author, visitor, send } = await fixture();
  const legacy = note();
  await send({ action: 'create', ...author, draft: legacy });
  const placement = { x: .4, y: .5, width: .215, height: .265 };
  assert.equal((await send({ action: 'move', ...visitor, id: legacy.id, placement })).status, 200);
  assert.equal((await send({ action: 'move', ...visitor, id: legacy.id, placement: { ...placement, width: .3 } })).status, 400);
  const drawing = note({ kind: 'doodle', text: '', strokes: [{ color: 'ink', points: [{ x: .1, y: .1 }] }], placement: { x: 0, y: 0, width: 1, height: 1 } });
  await send({ action: 'create', ...author, draft: drawing }, start + BOARD_CREATE_INTERVAL_MS);
  const moved = await send({ action: 'move', ...visitor, id: drawing.id, placement });
  assert.equal(moved.status, 400);
  const listed = await send({ action: 'list', ...visitor });
  assert.ok('entries' in listed.body);
  assert.deepEqual(listed.body.entries.find(entry => entry.id === drawing.id)?.placement, drawing.placement);
});
