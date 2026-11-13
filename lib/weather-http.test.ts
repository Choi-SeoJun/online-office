import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherHandler } from './weather-http.ts';

const request = (query = 'latitude=37.56789&longitude=126.97891', origin = 'https://choi-seojun.github.io') => new Request(`https://office.test/api/weather?${query}`, { headers: { Origin: origin } });
const payload = { timezone: 'Asia/Seoul', current: { temperature_2m: 12 }, daily: { sunrise: [1], sunset: [2] } };
test('weather uses a fixed upstream, rounded coordinates and only known parameters', async () => {
  let target = '';
  const handle = createWeatherHandler({ fetcher: async (url) => { target = String(url); return Response.json(payload); } });
  const response = await handle(request('latitude=37.56789&longitude=126.97891&url=https://attacker.test'));
  assert.equal(response.status, 200);
  const url = new URL(target);
  assert.equal(url.origin, 'https://api.open-meteo.com');
  assert.equal(url.searchParams.get('latitude'), '37.57');
  assert.equal(url.searchParams.get('longitude'), '126.98');
  assert.equal(url.searchParams.has('url'), false);
  assert.equal(url.searchParams.get('timeformat'), 'unixtime');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://choi-seojun.github.io');
});
test('invalid coordinates and foreign origins never reach upstream', async () => {
  let calls = 0;
  const handle = createWeatherHandler({ fetcher: async () => { calls++; return Response.json(payload); } });
  for (const query of ['', 'latitude=&longitude=127', 'latitude=91&longitude=0', 'latitude=NaN&longitude=0', 'latitude=1&latitude=2&longitude=3', 'latitude=0&longitude=181']) assert.equal((await handle(request(query))).status, 400);
  assert.equal((await handle(request(undefined, 'https://evil.test'))).status, 403);
  assert.equal(calls, 0);
});
test('identical concurrent queries share an upstream request and expire after fifteen minutes', async () => {
  let now = 1000, calls = 0;
  const handle = createWeatherHandler({ now: () => now, fetcher: async () => { calls++; return Response.json(payload); } });
  const results = await Promise.all([handle(request()), handle(request())]);
  assert.ok(results.every(r => r.status === 200)); assert.equal(calls, 1);
  await handle(request()); assert.equal(calls, 1);
  now += 900001; await handle(request()); assert.equal(calls, 2);
});
test('provider failure is not cached or exposed as invented weather', async () => {
  let calls = 0;
  const handle = createWeatherHandler({ fetcher: async () => { calls++; return new Response('private debug', { status: 429 }); } });
  const response = await handle(request());
  assert.equal(response.status, 503); assert.equal((await response.text()).includes('private debug'), false);
  await handle(request()); assert.equal(calls, 2);
});
test('weather endpoint accepts same origin and rejects unsupported methods', async () => {
  const handle = createWeatherHandler({ fetcher: async () => Response.json(payload) });
  assert.equal((await handle(request(undefined, 'https://office.test'))).status, 200);
  assert.equal((await handle(new Request('https://office.test/api/weather', { method: 'POST' }))).status, 405);
});
