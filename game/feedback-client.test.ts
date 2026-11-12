import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedbackSender } from './feedback-client.ts';

const context = { mode: 'multi', floor: 'roof' } as const;

test('Pages sends only the feedback fields, without cookies, caching or redirects', async t => {
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init: RequestInit) => {
    assert.equal(input, 'https://backend.test/api/feedback');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    assert.ok(init.signal);
    const body = JSON.parse(String(init.body));
    assert.match(body.requestId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(body, { requestId: body.requestId, category: 'idea', message: '첫 줄\n둘째 줄', context });
    return Response.json({ ok: true });
  });
  await createFeedbackSender('https://backend.test/api/feedback')('idea', '첫 줄\n둘째 줄', context);
});

test('a failed submission keeps its UUID, coalesces double submissions and resets on success', async t => {
  const ids: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init: RequestInit) => {
    assert.equal(init.credentials, 'same-origin');
    ids.push(JSON.parse(String(init.body)).requestId);
    if (ids.length === 1) throw new DOMException('aborted', 'TimeoutError');
    return Response.json({ ok: true });
  });
  const send = createFeedbackSender('/api/feedback');
  const first = send('bug', '연결 오류', context);
  assert.equal(send('bug', '연결 오류', context), first);
  await assert.rejects(first, /시간/);
  await send('bug', '연결 오류', { mode: 'multi', floor: 'office' });
  await send('bug', '연결 오류', context);
  assert.equal(ids.length, 3);
  assert.equal(ids[0], ids[1]);
  assert.notEqual(ids[1], ids[2]);
});

test('malformed and rejected responses cannot confirm submission, and changed text gets a new UUID', async t => {
  const ids: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init: RequestInit) => {
    ids.push(JSON.parse(String(init.body)).requestId);
    if (ids.length === 1) return Response.json({ ok: false });
    return new Response(null, { status: 429 });
  });
  const send = createFeedbackSender('/api/feedback');
  await assert.rejects(send('bug', '오류', context), /확인/);
  await assert.rejects(send('bug', '다른 오류', context), /잠시/);
  assert.notEqual(ids[0], ids[1]);
});
