import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { handleRoomRequest } from './room-http.ts';
import type { RoomDatabase } from './rooms.ts';
import type { RoomError, RoomSession, RoomSnapshot } from '../game/multi-types.ts';

const pagesOrigin = 'https://choi-seojun.github.io';
const apiOrigin = 'https://office.example';
function request(headers: Record<string, string> = {}) {
  return new Request(`${apiOrigin}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });
}
function assertCors(response: Response, origin: string | null) {
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('vary'), 'Origin');
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
}

test('the approved GitHub Pages origin can read backend availability errors', async () => {
  const response = await handleRoomRequest(request({ origin: pagesOrigin, 'sec-fetch-site': 'cross-site' }));
  assert.equal(response.status, 503);
  assert.equal((await response.json() as RoomError).code, 'UNAVAILABLE');
  assertCors(response, pagesOrigin);
});

test('same-origin requests and originless server requests keep working', async () => {
  const cases: Record<string, string>[] = [{ origin: apiOrigin, 'sec-fetch-site': 'same-origin' }, {}, { 'sec-fetch-site': 'none' }, { 'sec-fetch-site': 'same-origin' }];
  for (const headers of cases) {
    const response = await handleRoomRequest(request(headers));
    assert.equal(response.status, 503);
    assertCors(response, headers.origin ?? null);
  }
});

test('arbitrary, opaque, and lookalike origins are rejected without a CORS grant', async () => {
  for (const origin of ['https://other.github.io', 'http://choi-seojun.github.io', 'https://choi-seojun.github.io.attacker.example', `${pagesOrigin}:444`, `${pagesOrigin}/online-office`, 'null', '']) {
    const response = await handleRoomRequest(request({ origin }));
    assert.equal(response.status, 403, origin);
    assert.equal((await response.json() as RoomError).code, 'BAD_ORIGIN');
    assertCors(response, null);
  }
});

test('originless browser requests with suspicious fetch metadata are rejected', async () => {
  for (const site of ['cross-site', 'same-site', 'unexpected']) {
    const response = await handleRoomRequest(request({ 'sec-fetch-site': site }));
    assert.equal(response.status, 403, site);
    assertCors(response, null);
  }
});

function preflight(headers: Record<string, string> = {}) {
  return new Request(`${apiOrigin}/api/rooms`, { method: 'OPTIONS', headers: {
    origin: pagesOrigin,
    'sec-fetch-site': 'cross-site',
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'content-type',
    ...headers,
  } });
}

test('preflight permits only POST and Content-Type without requiring a database', async () => {
  for (const origin of [pagesOrigin, apiOrigin]) {
    const response = await handleRoomRequest(preflight({ origin, 'access-control-request-headers': 'Content-Type' }));
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    assertCors(response, origin);
    assert.equal(response.headers.get('access-control-allow-methods'), 'POST');
    assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type');
  }
});

test('preflight rejects unsupported methods and request headers without granting them', async () => {
  const cases: { headers: Record<string, string>; status: number }[] = [
    { headers: { 'access-control-request-method': 'DELETE' }, status: 405 },
    { headers: { 'access-control-request-method': 'GET' }, status: 405 },
    { headers: { 'access-control-request-method': '' }, status: 405 },
    { headers: { 'access-control-request-headers': 'content-type, authorization' }, status: 400 },
    { headers: { 'access-control-request-headers': 'x-client-secret' }, status: 400 },
  ];
  for (const { headers, status } of cases) {
    const response = await handleRoomRequest(preflight(headers));
    assert.equal(response.status, status);
    assertCors(response, pagesOrigin);
    assert.equal(response.headers.get('access-control-allow-methods'), null);
    assert.equal(response.headers.get('access-control-allow-headers'), null);
  }
});

test('preflight cannot admit an arbitrary or opaque origin', async () => {
  for (const origin of ['https://other.github.io', 'null']) {
    const response = await handleRoomRequest(preflight({ origin }));
    assert.equal(response.status, 403);
    assertCors(response, null);
    assert.equal(response.headers.get('access-control-allow-methods'), null);
  }
});

function database(t: TestContext) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => { if (sql.isOpen) sql.close(); });
  sql.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../drizzle', import.meta.url)).filter(file => file.endsWith('.sql')).sort()) {
    sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  }
  const statement = (query: string, values: (string | number | null)[] = []) => ({
    bind(...next: (string | number | null)[]) { return statement(query, next); },
    async first() { return sql.prepare(query).get(...values) ?? null; },
    async all() { return this.execute(); },
    execute() {
      const results = sql.prepare(query).all(...values);
      return { success: true, results, meta: { changes: Number(sql.prepare('SELECT changes() AS n').get()!.n) } };
    },
  });
  const db = {
    prepare: statement,
    async batch(statements: ReturnType<typeof statement>[]) {
      sql.exec('BEGIN');
      try { const results = statements.map(query => query.execute()); sql.exec('COMMIT'); return results; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  } as unknown as RoomDatabase;
  return { db, sql };
}

const createBody = JSON.stringify({ action: 'create', name: '김사원', roomName: '공유 회사', capacity: 4, layoutVersion: 2 });
function jsonRequest(body: string | null = createBody, headers: Record<string, string> = {}) {
  return new Request(`${apiOrigin}/api/rooms`, { method: 'POST', headers: {
    'content-type': 'application/json', origin: pagesOrigin, 'cf-connecting-ip': '192.0.2.7', ...headers,
  }, body });
}

test('Pages room creation and same-origin room creation share the real room service', async t => {
  const { db } = database(t);
  for (const origin of [pagesOrigin, apiOrigin]) {
    const response = await handleRoomRequest(jsonRequest(createBody, { origin }), db);
    assert.equal(response.status, 201);
    const body = await response.json() as { session: RoomSession; snapshot: RoomSnapshot };
    assert.equal(body.snapshot.room.name, '공유 회사');
    assert.equal(body.snapshot.players[0].name, '김사원');
    assert.match(body.session.token, /^[a-f0-9]{64}$/);
    assertCors(response, origin);
  }
});

test('invalid bodies and content types remain readable to the approved origin', async t => {
  const { db } = database(t);
  for (const body of [null, '', '{broken', 'null', '[]', '{"action":"unknown","layoutVersion":2}']) {
    const response = await handleRoomRequest(jsonRequest(body), db);
    assert.equal(response.status, 400);
    assert.equal((await response.json() as RoomError).code, 'INVALID_REQUEST');
    assertCors(response, pagesOrigin);
  }
  for (const type of ['text/plain', 'application/jsonp', 'application/json-invalid']) {
    const response = await handleRoomRequest(jsonRequest(createBody, { 'content-type': type }), db);
    assert.equal(response.status, 415, type);
    assert.equal((await response.json() as RoomError).code, 'INVALID_REQUEST');
    assertCors(response, pagesOrigin);
  }
  assert.equal((await handleRoomRequest(jsonRequest(createBody, { 'content-type': 'Application/JSON; charset=utf-8' }), db)).status, 201);
});

test('the 8 KB body limit counts streamed bytes even with a false Content-Length', async t => {
  const { db, sql } = database(t);
  const bodyBytes = new TextEncoder().encode(createBody).length;
  const exactLimit = createBody + ' '.repeat(8192 - bodyBytes);
  const accepted = await handleRoomRequest(jsonRequest(exactLimit), db);
  assert.equal(accepted.status, 201);
  for (const body of [exactLimit + ' ', JSON.stringify({ action: 'create', padding: '가'.repeat(2731) })]) {
    const response = await handleRoomRequest(jsonRequest(body, { 'content-length': '1' }), db);
    assert.equal(response.status, 413);
    assert.equal((await response.json() as RoomError).code, 'INVALID_REQUEST');
    assertCors(response, pagesOrigin);
  }
  assert.equal(sql.prepare('SELECT count(*) AS n FROM office_rooms').get()!.n, 1);
});

test('a permitted origin still needs a valid room session', async t => {
  const { db } = database(t);
  const created = await handleRoomRequest(jsonRequest(), db);
  const { session } = await created.json() as { session: RoomSession; snapshot: RoomSnapshot };
  const token = (session.token[0] === '0' ? '1' : '0') + session.token.slice(1);
  const response = await handleRoomRequest(jsonRequest(JSON.stringify({ action: 'sync', ...session, token, layoutVersion: 2 })), db);
  assert.equal(response.status, 401);
  assert.equal((await response.json() as RoomError).code, 'SESSION_EXPIRED');
  assertCors(response, pagesOrigin);
});

test('the room admission rate limit remains shared across allowed origins', async t => {
  const { db, sql } = database(t);
  for (let i = 0; i < 10; i++) {
    const response = await handleRoomRequest(jsonRequest(createBody, { origin: i % 2 ? apiOrigin : pagesOrigin }), db);
    assert.equal(response.status, 201);
  }
  const response = await handleRoomRequest(jsonRequest(), db);
  assert.equal(response.status, 429);
  assert.equal((await response.json() as RoomError).code, 'RATE_LIMITED');
  assertCors(response, pagesOrigin);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM office_rooms').get()!.n, 10);
  const rate = sql.prepare('SELECT key, hits FROM office_rate_limits').get()!;
  assert.match(String(rate.key), /^create:[a-f0-9]{64}$/);
  assert.equal(rate.hits, 11);
  assert.equal((await handleRoomRequest(jsonRequest(createBody, { 'cf-connecting-ip': '192.0.2.8' }), db)).status, 201);
});

test('backend faults become a readable unavailable response', async t => {
  const { db, sql } = database(t);
  sql.close();
  const response = await handleRoomRequest(jsonRequest(), db);
  assert.equal(response.status, 503);
  assert.equal((await response.json() as RoomError).code, 'UNAVAILABLE');
  assertCors(response, pagesOrigin);
});

test('missing, older and future layout clients must refresh without changing rooms or messages', async t => {
  const { db, sql } = database(t);
  const created = await handleRoomRequest(jsonRequest(), db);
  assert.equal(created.status, 201);
  const { session } = await created.json() as { session: RoomSession };
  const chat = await handleRoomRequest(jsonRequest(JSON.stringify({ action: 'chat', ...session, text: '기존 대화', layoutVersion: 2 })), db);
  assert.equal(chat.status, 200);
  const before = sql.prepare('SELECT * FROM office_members').get();
  for (const layoutVersion of [undefined, 1, 3, '2']) {
    for (const action of ['sync', 'create', 'join']) {
      const response = await handleRoomRequest(jsonRequest(JSON.stringify({ ...JSON.parse(createBody), ...session, action, layoutVersion })), db);
      assert.equal(response.status, 409, `${action} version ${layoutVersion}`);
      const error = await response.json() as RoomError;
      assert.equal(error.code, 'ROOM_EXPIRED');
      assert.match(error.error, /새로고침/);
      assertCors(response, pagesOrigin);
    }
  }
  assert.deepEqual(sql.prepare('SELECT * FROM office_members').get(), before);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM office_rooms').get()!.n, 1);
  assert.equal(sql.prepare('SELECT text FROM office_messages').get()!.text, '기존 대화');
  const restored = await handleRoomRequest(jsonRequest(JSON.stringify({ action: 'sync', ...session, layoutVersion: 2 })), db);
  assert.equal(restored.status, 200);
});
