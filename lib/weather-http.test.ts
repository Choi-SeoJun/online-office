import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherHandler } from './weather-http.ts';

const request = (query = 'latitude=37.56&longitude=126.98', origin = 'https://choi-seojun.github.io') => new Request(`https://office.test/api/weather?${query}`, { headers: { Origin: origin } });
const payload = { timezone: 'Asia/Seoul', current: { temperature_2m: 12 }, daily: { sunrise: [1], sunset: [2] } };

test('known neighborhood IDs select their official grid and share upstream grid work', async () => {
  const urls: URL[] = [];
  const handle = createWeatherHandler({ now: () => Date.parse('2026-11-19T09:47:00Z'), getApiKey: () => 'test-key', fetcher: async input => {
    const url = new URL(input); urls.push(url);
    const base = { baseDate: url.searchParams.get('base_date'), baseTime: url.searchParams.get('base_time'), nx: 62, ny: 110 };
    const item = url.pathname.endsWith('getUltraSrtFcst')
      ? [{ ...base, category: 'SKY', fcstDate: '20261119', fcstTime: '1900', fcstValue: '4' }]
      : Object.entries({ PTY: 3, T1H: 1, WSD: 2 }).map(([category, obsrValue]) => ({ ...base, category, obsrValue: String(obsrValue) }));
    return Response.json({ response: { header: { resultCode: '00' }, body: { items: { item } } } });
  } });
  const results = await Promise.all(['4413356600', '4413356700'].map(id => handle(request(`region=${id}`))));
  assert.ok(results.every(r => r.status === 200));
  assert.equal((await results[0].json() as { current: { weather_code: number } }).current.weather_code, 73);
  assert.equal(urls.length, 2);
  assert.ok(urls.every(u => u.searchParams.get('nx') === '62' && u.searchParams.get('ny') === '110'));
});

test('unknown, duplicate and mixed region selectors cannot spend the private key quota', async () => {
  let calls = 0;
  const handle = createWeatherHandler({ fetcher: async () => { calls++; return Response.json(payload); } });
  for (const query of ['region=unknown', 'region=4413356700&region=4413356600', 'region=4413356700&latitude=37.56&longitude=126.98']) {
    assert.equal((await handle(request(query))).status, 400);
  }
  assert.equal(calls, 0);
});
test('weather uses a fixed upstream, rounded coordinates and only known parameters', async () => {
  let target = '';
  const handle = createWeatherHandler({ fetcher: async (url) => { target = String(url); return Response.json(payload); } });
  const response = await handle(request('latitude=37.56001&longitude=126.98001&url=https://attacker.test'));
  assert.equal(response.status, 200);
  const url = new URL(target);
  assert.equal(url.origin, 'https://api.open-meteo.com');
  assert.equal(url.searchParams.get('latitude'), '37.56');
  assert.equal(url.searchParams.get('longitude'), '126.98');
  assert.equal(url.searchParams.has('url'), false);
  assert.equal(url.searchParams.get('timeformat'), 'unixtime');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://choi-seojun.github.io');
});
test('invalid coordinates and foreign origins never reach upstream', async () => {
  let calls = 0;
  const handle = createWeatherHandler({ fetcher: async () => { calls++; return Response.json(payload); } });
  for (const query of ['', 'latitude=&longitude=127', 'latitude=91&longitude=0', 'latitude=NaN&longitude=0', 'latitude=1&latitude=2&longitude=3', 'latitude=0&longitude=181', 'latitude=0&longitude=0', 'latitude=36.777&longitude=127.123']) assert.equal((await handle(request(query))).status, 400);
  assert.equal((await handle(request(undefined, 'https://evil.test'))).status, 403);
  assert.equal(calls, 0);
});
test('identical concurrent queries share an upstream request and expire after five minutes', async () => {
  let now = 1000, calls = 0;
  const handle = createWeatherHandler({ now: () => now, fetcher: async () => { calls++; return Response.json(payload); } });
  const results = await Promise.all([handle(request()), handle(request())]);
  assert.ok(results.every(r => r.status === 200)); assert.equal(calls, 1);
  await handle(request()); assert.equal(calls, 1);
  now += 300001; await handle(request()); assert.equal(calls, 2);
});
test('provider failure is not cached or exposed as invented weather', async () => {
  let calls = 0, clock = 1000;
  const handle = createWeatherHandler({ now: () => clock, fetcher: async () => { calls++; return new Response('private debug', { status: 429 }); } });
  const response = await handle(request());
  assert.equal(response.status, 503); assert.equal((await response.text()).includes('private debug'), false);
  await handle(request()); assert.equal(calls, 1);
  clock += 30001; await handle(request()); assert.equal(calls, 2);
});

test('configured secret calls KMA and never puts credentials in public responses', async () => {
  const clock = Date.parse('2026-11-19T09:47:00Z'), secret = 'private-key-should-never-leak';
  const urls: URL[] = [];
  const handle = createWeatherHandler({ now: () => clock, getApiKey: () => secret, fetcher: async input => {
    const url = new URL(input); urls.push(url);
    assert.equal(url.searchParams.get('serviceKey'), secret);
    const base = { baseDate: '20261119', baseTime: '1830', nx: 60, ny: 127 };
    const item = url.pathname.endsWith('getUltraSrtFcst')
      ? [{ ...base, category: 'SKY', fcstDate: '20261119', fcstTime: '1900', fcstValue: '4' }]
      : Object.entries({ PTY: 3, T1H: 1, WSD: 2 }).map(([category, obsrValue]) => ({ ...base, category, obsrValue: String(obsrValue) }));
    return Response.json({ response: { header: { resultCode: '00' }, body: { items: { item } } } });
  } });
  const responses = await Promise.all([handle(request()), handle(request())]);
  assert.equal(urls.length, 2);
  const text = await responses[0].text();
  assert.equal(responses[0].status, 200); assert.equal(text.includes(secret), false);
  assert.equal(JSON.parse(text).source, 'kma'); assert.equal(JSON.parse(text).current.weather_code, 73);
  assert.ok(urls.every(u => u.origin === 'https://apis.data.go.kr'));
});

test('key-bearing KMA errors are sanitized and backed off', async () => {
  const failures: unknown[] = []; let calls = 0;
  const handle = createWeatherHandler({ getApiKey: () => 'never-expose-this-key', reportFailure: info => failures.push(info), fetcher: async url => { calls++; throw new Error(url); } });
  const response = await handle(request());
  assert.equal(response.status, 503);
  await handle(request()); assert.equal(calls, 2); // one observation and one sky call; no repeated burst
  assert.equal((await response.text()).includes('never-expose'), false);
  assert.equal(JSON.stringify(failures).includes('never-expose'), false);
});
test('provider failures report their stage and status without private response data', async () => {
  const failures: unknown[] = [];
  const handle = createWeatherHandler({
    fetcher: async () => new Response('private provider diagnostics', { status: 429 }),
    reportFailure: failure => failures.push(failure),
  });
  assert.equal((await handle(request())).status, 503);
  assert.deepEqual(failures, [{ stage: 'response', status: 429 }]);
});
test('weather endpoint accepts same origin and rejects unsupported methods', async () => {
  const handle = createWeatherHandler({ fetcher: async () => Response.json(payload) });
  assert.equal((await handle(request(undefined, 'https://office.test'))).status, 200);
  assert.equal((await handle(new Request('https://office.test/api/weather', { method: 'POST' }))).status, 405);
});
