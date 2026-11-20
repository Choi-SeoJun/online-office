import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKmaWeather, kmaGrid, kmaCycle } from './kma-weather.ts';
import { koreaRegionById } from '../game/korea-regions.ts';
import { environmentFrame, parseWeatherForecast } from '../game/environment.ts';

const region = koreaRegionById('4413000000')!;
const now = Date.parse('2026-11-19T09:47:00Z');
const key = 'test/secret+only=server';
function payload(url: URL, pty = 3, sky = 4) {
  const base = { baseDate: url.searchParams.get('base_date'), baseTime: url.searchParams.get('base_time'), nx: Number(url.searchParams.get('nx')), ny: Number(url.searchParams.get('ny')) };
  const forecast = url.pathname.endsWith('getUltraSrtFcst');
  return { response: { header: { resultCode: '00', resultMsg: 'NORMAL_SERVICE' }, body: { items: { item: forecast
    ? [{ ...base, category: 'SKY', fcstDate: '20261119', fcstTime: '1900', fcstValue: String(sky) }]
    : Object.entries({ PTY: pty, T1H: -1.1, WSD: 2.3, RN1: 0 }).map(([category, value]) => ({ ...base, category, obsrValue: String(value) })) } } } };
}
test('KMA grid conversion uses the documented Lambert grid', () => {
  assert.deepEqual(kmaGrid(37.5665, 126.9780), { nx: 60, ny: 127 });
  // The bundled city point averages Dongnam-gu (110) and Seobuk-gu (112).
  assert.deepEqual(kmaGrid(region.latitude, region.longitude), { nx: 63, ny: 111 });
});
test('KST cycles allow ten-minute observation delay and cross midnight safely', () => {
  assert.deepEqual(kmaCycle(now, 'observation'), { date: '20261119', time: '1830' });
  assert.deepEqual(kmaCycle(Date.parse('2026-11-19T15:05:00Z'), 'observation'), { date: '20261119', time: '2350' });
  assert.deepEqual(kmaCycle(Date.parse('2026-11-19T15:40:00Z'), 'sky'), { date: '20261119', time: '2330' });
  assert.deepEqual(kmaCycle(now, 'sky'), { date: '20261119', time: '1830' });
});
test('observed snow overrides cloudy sky and zero hourly precipitation without exposing the key', async () => {
  const calls: URL[] = [];
  const load = createKmaWeather({ now: () => now, fetcher: async (url, options) => {
    calls.push(new URL(url));
    // Workers reject redirect:error before making any network request.
    assert.equal(options?.redirect, 'manual');
    return Response.json(payload(new URL(url)));
  } });
  const raw = await load(region, key);
  const forecast = parseWeatherForecast(raw, now)!;
  assert.equal(forecast.source, 'kma'); assert.equal(forecast.kmaPty, 3);
  assert.equal(forecast.observedAt, Date.parse('2026-11-19T09:30:00Z'));
  assert.equal(environmentFrame(region, forecast, now).precipitation, 'snow');
  assert.equal(forecast.temperature, -1.1);
  assert.ok(forecast.days[0].sunrise! < forecast.days[0].sunset!);
  assert.equal(JSON.stringify(raw).includes('secret'), false);
  assert.ok(calls.every(u => u.origin === 'https://apis.data.go.kr' && u.searchParams.get('serviceKey') === key));
});
test('KMA redirects are refused without following a key-bearing request', async () => {
  let calls = 0;
  const load = createKmaWeather({ now: () => now, fetcher: async (_input, options) => {
    calls++;
    assert.equal(options?.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://unexpected.test/' } });
  } });
  await assert.rejects(load(region, key));
  assert.equal(calls, 2); // Only the original observation and forecast requests.
});
test('PTY maps rain, mixed precipitation, snow and cessation from observations', async () => {
  for (const [pty, expected] of [[0,'none'],[1,'rain'],[2,'snow'],[3,'snow'],[4,'rain'],[5,'rain'],[6,'snow'],[7,'snow']] as const) {
    const load = createKmaWeather({ now: () => now, fetcher: async url => Response.json(payload(new URL(url), pty)) });
    assert.equal(environmentFrame(region, parseWeatherForecast(await load(region, key), now), now).precipitation, expected);
  }
});
test('no-data retries one earlier ten-minute cycle and shares successful cycle requests', async () => {
  let clock = now, obs = 0, sky = 0;
  const load = createKmaWeather({ now: () => clock, fetcher: async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('getUltraSrtFcst')) { sky++; return Response.json(payload(url)); }
    obs++;
    if (url.searchParams.get('base_time') === '1830') return Response.json({ response: { header: { resultCode: '03' } } });
    return Response.json(payload(url));
  } });
  const raw = await load(region, key);
  assert.equal(parseWeatherForecast(raw, clock)?.observedAt, Date.parse('2026-11-19T09:20:00Z'));
  clock += 60000; await load(region, key);
  assert.equal(obs, 2); assert.equal(sky, 1);
});
test('missing sky keeps observed precipitation and explicitly marks sky unknown', async () => {
  const load = createKmaWeather({ now: () => now, fetcher: async url => url.includes('getUltraSrtFcst') ? new Response('', { status: 503 }) : Response.json(payload(new URL(url), 0)) });
  const forecast = parseWeatherForecast(await load(region, key), now)!;
  assert.equal(forecast.kmaPty, 0); assert.equal(forecast.skyKnown, false);
  assert.equal(environmentFrame(region, forecast, now).precipitation, 'none');
});
test('observation failure waits for the shared sky request before ending the worker request', async () => {
  let finishSky!: () => void, finished = false, obsCalls = 0, skyCalls = 0;
  const skyReady = new Promise<void>(resolve => { finishSky = resolve; });
  const load = createKmaWeather({ now: () => now, fetcher: async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('getUltraSrtFcst')) { skyCalls++; await skyReady; }
    else if (++obsCalls === 1) return new Response('', { status: 503 });
    return Response.json(payload(url));
  } });
  const failed = load(region, key).then(() => { finished = true; }, () => { finished = true; });
  // Drain the failed observation while the sky response is deliberately pending.
  await new Promise(resolve => setImmediate(resolve));
  try { assert.equal(finished, false, 'ending early abandons shared sky I/O in Workers'); }
  finally { finishSky(); await failed; }
  assert.equal((await load(region, key)).source, 'kma');
  assert.equal(obsCalls, 2); assert.equal(skyCalls, 1);
});
test('accepts KMA sky response normalized to the hour while preserving strict observation times', async () => {
  const load = createKmaWeather({ now: () => now, fetcher: async input => {
    const url = new URL(input), data = payload(url, 0);
    if (url.pathname.endsWith('getUltraSrtFcst')) for (const item of data.response.body.items.item) item.baseTime = '1800';
    return Response.json(data);
  } });
  const forecast = parseWeatherForecast(await load(region, key), now)!;
  assert.equal(forecast.skyKnown, true);
  assert.equal(forecast.cloud, 100);
});
test('conflicting observation rows never turn reported snow into dry weather in either order', async () => {
  for (const reverse of [false, true]) {
    const load = createKmaWeather({ now: () => now, fetcher: async input => {
      const url = new URL(input), data = payload(url, 3, 1);
      if (url.pathname.endsWith('getUltraSrtNcst')) {
        const items: Array<Record<string, unknown>> = data.response.body.items.item;
        items.push({ ...items[0], obsrValue: '0' });
        if (reverse) items.reverse();
      }
      return Response.json(data);
    } });
    await assert.rejects(load(region, key));
  }
});
for (const kind of ['missing', 'sentinel', 'old', 'wrong-grid', 'oversize', 'denied'] as const) {
  test(`rejects ${kind} observations without inventing current weather or leaking provider data`, async () => {
    let obs = 0;
    const load = createKmaWeather({ now: () => now, fetcher: async input => {
      const url = new URL(input);
      if (url.pathname.endsWith('getUltraSrtFcst')) return Response.json(payload(url));
      obs++;
      if (kind === 'oversize') return new Response('x'.repeat(64001));
      if (kind === 'denied') return Response.json({ response: { header: { resultCode: '30', resultMsg: key } } });
      const body = payload(url);
      const items = body.response.body.items.item;
      if (kind === 'missing') items.splice(0, 1);
      if (kind === 'sentinel') Object.assign(items[0], { obsrValue: '-999' });
      if (kind === 'old') for (const item of items) item.baseDate = '20261118';
      if (kind === 'wrong-grid') for (const item of items) item.nx = 1;
      return Response.json(body);
    } });
    await assert.rejects(load(region, key), error => error instanceof Error && !error.message.includes(key));
    if (kind === 'denied') assert.equal(obs, 1);
  });
}
