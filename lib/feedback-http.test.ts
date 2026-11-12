import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test, type TestContext } from 'node:test';
import { isFeedbackAdmin } from './feedback-auth.ts';
import { handleAdminFeedbackRequest, handleFeedbackRequest } from './feedback-http.ts';
import type { FeedbackList } from '../game/feedback-types.ts';
import type { FeedbackDatabase } from './feedback.ts';

const site = 'https://office.example';
const pages = 'https://choi-seojun.github.io';
const owner = { userId: 'owner', email: 'owner@example.test' };
const secret = 'test-secret';
const now = Date.UTC(2026, 10, 12, 23, 59);

function setup(t: TestContext) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  const migrations = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  type Params = (string | number | null)[];
  function prepare(sql: string, params: Params = []) {
    const statement = {
      execute: () => sql.trimStart().startsWith('SELECT') ? statement.all() : statement.run(),
      bind: (...values: Params) => prepare(sql, values),
      run: () => {
        const result = sqlite.prepare(sql).run(...params);
        return { meta: { changes: result.changes } };
      },
      all: () => ({ results: sqlite.prepare(sql).all(...params) }),
    };
    return statement;
  }
  const db = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(statement.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as FeedbackDatabase;
  return { sqlite, db };
}

const submission = () => ({
  requestId: crypto.randomUUID(),
  category: 'idea',
  message: '제안\n<script>alert(1)</script>',
  context: { mode: 'solo', floor: 'roof' },
});

function post(body: unknown, origin = pages, ip = '192.0.2.7') {
  return new Request(site + '/api/feedback', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
}

test('accepts private feedback from Pages and keeps retries idempotent', async t => {
  const { db, sqlite } = setup(t);
  const body = submission();
  const responses = await Promise.all([body, body].map(item => handleFeedbackRequest(post(item), db, secret, now)));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(response.headers.get('access-control-allow-origin'), pages);
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
  }
  const rows = sqlite.prepare('SELECT * FROM office_feedback').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].message, body.message);
  assert.equal(rows[0].status, 'new');
  assert.equal(rows[0].mode, 'solo');
  assert.equal(rows[0].floor, 'roof');
  assert.ok(!JSON.stringify(rows).includes('192.0.2.7'));
});

test('validates request, exact origin and streamed size before persisting', async t => {
  const { db, sqlite } = setup(t);
  for (const body of [
    { ...submission(), requestId: 'bad' },
    { ...submission(), message: '  ' },
    { ...submission(), message: '🙂'.repeat(2001) },
    { ...submission(), category: 'unknown' },
    { ...submission(), context: { mode: 'multi', floor: 'secret' } },
  ]) {
    assert.equal((await handleFeedbackRequest(post(body), db, secret, now)).status, 400);
  }
  const opaque = await handleFeedbackRequest(post(submission(), pages + '.example'), db, secret, now);
  assert.equal(opaque.status, 403);
  assert.equal(opaque.headers.get('access-control-allow-origin'), null);
  const oversized = await handleFeedbackRequest(post({ ...submission(), message: 'a'.repeat(13_000) }), db, secret, now);
  assert.equal(oversized.status, 413);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS total FROM office_feedback').get()?.total, 0);
  assert.equal((await handleFeedbackRequest(post({ ...submission(), message: '🙂'.repeat(2000) }), db, secret, now)).status, 200);
});

test('preflights only JSON POST from approved origins and requires the rate secret for writes', async t => {
  const { db, sqlite } = setup(t);
  const preflight = (origin: string, method = 'POST', header = 'content-type') => handleFeedbackRequest(
    new Request(site + '/api/feedback', {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': method, 'access-control-request-headers': header },
    }),
  );
  const response = await preflight(pages);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), pages);
  assert.equal(response.headers.get('access-control-allow-methods'), 'POST');
  assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type');
  assert.equal((await preflight('null')).status, 403);
  assert.equal((await preflight(pages, 'GET')).status, 405);
  assert.equal((await preflight(pages, 'POST', 'authorization')).status, 400);
  assert.equal((await handleFeedbackRequest(post(submission()), db, undefined, now)).status, 503);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS total FROM office_feedback').get()?.total, 0);
});

test('enforces a sliding rate limit across midnight and exempts exact retry IDs', async t => {
  const { db } = setup(t);
  const bodies = Array.from({ length: 10 }, submission);
  for (const body of bodies) {
    assert.equal((await handleFeedbackRequest(post(body), db, secret, now)).status, 200);
  }
  assert.equal((await handleFeedbackRequest(post(submission()), db, secret, now + 120_000)).status, 429);
  assert.equal((await handleFeedbackRequest(post(bodies[0]), db, secret, now + 120_000)).status, 200);
  assert.equal((await handleFeedbackRequest(post(submission(), pages, '192.0.2.8'), db, secret, now)).status, 200);
  assert.equal((await handleFeedbackRequest(post(submission()), db, secret, now + 600_000)).status, 200);
});

test('checks authenticated owner and origin on every read and status change', async t => {
  const { db, sqlite } = setup(t);
  assert.ok(isFeedbackAdmin(owner, ' OWNER@example.test '));
  assert.ok(!isFeedbackAdmin({ ...owner, userId: ' ' }, owner.email));
  await handleFeedbackRequest(post(submission()), db, secret, now);
  for (const method of ['GET', 'PATCH']) {
    for (const [user, configuredEmail, origin] of [
      [null, owner.email, site],
      [{ ...owner, email: 'other@example.test' }, owner.email, site],
      [owner, undefined, site],
      [owner, owner.email, pages],
    ] as const) {
      const request = new Request(site + '/api/admin/feedback', {
        method,
        headers: { origin, 'content-type': 'application/json', 'oai-authenticated-user-email': owner.email },
        body: method === 'PATCH' ? '{"id":1,"status":"reviewed"}' : undefined,
      });
      const response = await handleAdminFeedbackRequest(request, db, user, configuredEmail, now);
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
  }
  assert.equal(sqlite.prepare('SELECT status FROM office_feedback').get()?.status, 'new');
});

test('paginates newest records, filters, and updates review state and global counts', async t => {
  const { db } = setup(t);
  for (let i = 0; i < 32; i++) {
    const response = await handleFeedbackRequest(post(submission(), pages, '192.0.2.' + i), db, secret, now);
    assert.equal(response.status, 200);
  }
  const url = site + '/api/admin/feedback';
  const admin = (query = '', init?: RequestInit) => handleAdminFeedbackRequest(new Request(url + query, init), db, owner, owner.email, now);
  const first = await (await admin()).json() as FeedbackList;
  assert.deepEqual(first.counts, { new: 32, reviewed: 0 });
  assert.equal(first.items.length, 30);
  assert.equal(first.items[0].id, 32);
  assert.ok(!Object.hasOwn(first.items[0], 'requestId'));
  assert.equal(first.nextCursor, 3);
  const second = await (await admin('?status=new&before=3')).json() as FeedbackList;
  assert.deepEqual(second.items.map((item: { id: number }) => item.id), [2, 1]);
  assert.equal(second.nextCursor, null);
  const patch = (status: string) => admin('', {
    method: 'PATCH', headers: { origin: site, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 32, status }),
  });
  assert.deepEqual(await (await patch('reviewed')).json(), { ok: true });
  const reviewed = await (await admin('?status=reviewed')).json() as FeedbackList;
  assert.deepEqual(reviewed.counts, { new: 31, reviewed: 1 });
  assert.equal(reviewed.items[0].reviewedAt, now);
  await patch('new');
  const restored = await (await admin()).json() as FeedbackList;
  assert.equal(restored.items[0].reviewedAt, null);
});
