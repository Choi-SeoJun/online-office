import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { DEFAULT_REGION } from './environment.ts';
import { requestForecast } from './weather-client.ts';

const now = Date.parse('2026-11-19T05:45:00Z');
const payload = {
  timezone: 'Asia/Seoul',
  current: { time: now / 1000, temperature_2m: 4.6, weather_code: 51, cloud_cover: 55, wind_speed_10m: 4.64, is_day: 1 },
  daily: { time: [now / 1000], sunrise: [now / 1000 - 20000], sunset: [now / 1000 + 10000] },
};
function setup(t: TestContext) {
  t.mock.method(Date, 'now', () => now);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { href: 'https://office.test/' } } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); });
}

test('KMA server is preferred so model cloud cannot override observed snow', async t => {
  setup(t);
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: URL) => {
    calls.push(url.origin);
    return Response.json({ ...payload, source: 'kma', kmaPty: 3, skyKnown: true, current: { ...payload.current, weather_code: 73 } });
  });
  assert.equal((await requestForecast(DEFAULT_REGION, new AbortController().signal)).temperature, 4.6);
  assert.deepEqual(calls, ['https://office.test']);
});

for (const failure of ['network', 'unavailable', 'invalid', 'stale'] as const) {
  test(`${failure} KMA response falls back to the model once with source attribution`, async t => {
    setup(t);
    const calls: URL[] = [];
    t.mock.method(globalThis, 'fetch', async (url: URL, options: RequestInit) => {
      calls.push(url);
      assert.equal(options.credentials, 'omit');
      assert.equal(options.referrerPolicy, 'no-referrer');
      if (calls.length > 1) return Response.json(payload);
      if (failure === 'network') throw new TypeError('Failed to fetch');
      if (failure === 'unavailable') return new Response(null, { status: 503 });
      if (failure === 'invalid') return Response.json({ current: {} });
      return Response.json({ ...payload, current: { ...payload.current, time: now / 1000 - 3 * 3600 } });
    });
    assert.equal((await requestForecast(DEFAULT_REGION, new AbortController().signal)).code, 51);
    assert.equal(calls[0].href, 'https://office.test/api/weather?latitude=37.56&longitude=126.98');
    assert.equal(calls[1].origin, 'https://api.open-meteo.com');
    assert.equal(calls.length, 2);
  });
}

test('KMA timeout leaves time for the public model fallback', async t => {
  setup(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: URL, options: RequestInit) => {
    if (++calls === 2) return Response.json(payload);
    return new Promise<Response>((_resolve, reject) => options.signal!.addEventListener('abort', () => reject(options.signal!.reason), { once: true }));
  });
  const job = requestForecast(DEFAULT_REGION, new AbortController().signal);
  t.mock.timers.tick(8500);
  assert.equal((await job).temperature, 4.6);
  assert.equal(calls, 2);
});

test('changing region aborts the old request without launching a fallback', async t => {
  setup(t);
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: URL, options: RequestInit) => {
    calls++;
    controller.abort();
    assert.ok(options.signal!.aborted);
    throw options.signal!.reason;
  });
  await assert.rejects(requestForecast(DEFAULT_REGION, controller.signal));
  assert.equal(calls, 1);
});

test('a visitor rate limit is respected without retrying through another route', async t => {
  setup(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(null, { status: 429 }); });
  await assert.rejects(requestForecast(DEFAULT_REGION, new AbortController().signal));
  assert.equal(calls, 1);
});

test('an errored 429 body cannot turn a provider limit into a server retry', async t => {
  setup(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    const body = new ReadableStream({ start(controller) { controller.error(new Error('Connection closed')); } });
    return new Response(body, { status: 429 });
  });
  await assert.rejects(requestForecast(DEFAULT_REGION, new AbortController().signal));
  assert.equal(calls, 1);
});

test('two unavailable routes fail without inventing a forecast or retrying in a loop', async t => {
  setup(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response(null, { status: 503 }); });
  await assert.rejects(requestForecast(DEFAULT_REGION, new AbortController().signal));
  assert.equal(calls, 2);
});
