import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_REGION, environmentFrame, parseWeatherForecast, sunTimes } from './environment.ts';
import { normalizeRegion, readForecast, requestForecast, saveForecast, saveRegion, usableForecast } from './weather-client.ts';

const noon = Date.parse('2026-06-21T03:00:00Z');
const raw = {
  timezone: 'Asia/Seoul',
  current: { time: noon / 1000, temperature_2m: 23, cloud_cover: 67, wind_speed_10m: 5, weather_code: 61, is_day: 1 },
  daily: { time: [Date.parse('2026-06-20T15:00:00Z') / 1000], sunrise: [noon / 1000 - 25000], sunset: [noon / 1000 + 25000] },
};

test('local daylight and seasonal effects work without a forecast', () => {
  assert.equal(environmentFrame(DEFAULT_REGION, null, noon).daylight, 1);
  assert.equal(environmentFrame(DEFAULT_REGION, null, noon + 12 * 3600000).daylight, 0);
  assert.equal(environmentFrame(DEFAULT_REGION, null, noon).precipitation, 'none');
  assert.equal(environmentFrame({ ...DEFAULT_REGION, latitude: -33.87 }, null, noon).season, 'winter');
  assert.ok(sunTimes(DEFAULT_REGION, noon).sunrise! < noon);
  assert.deepEqual(sunTimes({ ...DEFAULT_REGION, latitude: 89 }, noon), { sunrise: null, sunset: null });
});

test('parses Unix timestamps and rejects invalid current weather', () => {
  const forecast = parseWeatherForecast(raw, noon);
  assert.ok(forecast);
  assert.equal(forecast.days[0].date, '2026-06-21');
  assert.equal(environmentFrame(DEFAULT_REGION, forecast, noon).precipitation, 'rain');
  assert.equal(parseWeatherForecast({ ...raw, current: { ...raw.current, temperature_2m: null } }, noon), null);
  assert.equal(parseWeatherForecast({ ...raw, current: { ...raw.current, weather_code: 99.5 } }, noon), null);
  assert.equal(parseWeatherForecast({ ...raw, daily: { ...raw.daily, sunset: [null] } }, noon)?.days[0].sunset, null);
  assert.equal(usableForecast(forecast, noon + 121 * 60000), null);
  assert.equal(usableForecast({ ...forecast, fetchedAt: noon + 1 }, noon), null);
});

test('location is converted to a domestic representative point before reuse', () => {
  const region = normalizeRegion({ ...DEFAULT_REGION, id: undefined, source: 'location', latitude: 36.7891234, longitude: 127.0045678 });
  assert.equal(region?.name, '충청남도 아산시');
  assert.equal(region?.latitude, 36.79);
  assert.equal(region?.longitude, 127.00);
  assert.equal(normalizeRegion({ ...DEFAULT_REGION, latitude: 90.001 }), null);
});

test('browser cache is bounded, matches the region and stores rounded coordinates', (t) => {
  const entries = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const chosen = { ...DEFAULT_REGION, id: undefined, source: 'location' as const, latitude: 36.7891234, longitude: 127.0045678 };
  saveRegion(chosen);
  const forecast = parseWeatherForecast(raw, noon)!;
  saveForecast(DEFAULT_REGION, forecast);
  assert.ok([...entries.values()].some(value => value.includes('충청남도 아산시')));
  assert.ok([...entries.values()].every(value => !value.includes('36.7891234')));
  assert.equal(readForecast(chosen, noon), null);
  assert.deepEqual(readForecast(DEFAULT_REGION, noon), forecast);
  assert.equal(readForecast(DEFAULT_REGION, noon + 121 * 60000), null);
});

test('weather requests transmit rounded coordinates and omit credentials and referrer', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { href: 'https://example.com/a' } } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  t.mock.method(Date, 'now', () => noon);
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url: URL, options: RequestInit) => {
    assert.equal(url.href, 'https://example.com/api/weather?latitude=36.79&longitude=127.00');
    assert.equal(options.signal, controller.signal);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    return Response.json(raw);
  });
  const forecast = await requestForecast({ ...DEFAULT_REGION, id: undefined, source: 'location', latitude: 36.7891234, longitude: 127.0045678 }, controller.signal);
  assert.equal(forecast.code, 61);
});

test('season and solar events follow the region across a local date boundary', () => {
  const region = { ...DEFAULT_REGION, latitude: -33.87, longitude: 151.21, timezone: 'Australia/Sydney' };
  const utc = Date.parse('2026-11-30T14:00:00Z');
  const { sunrise, sunset } = sunTimes(region, utc);
  assert.ok(sunrise! > utc && sunrise! < sunset!);
  assert.equal(environmentFrame(region, null, utc).season, 'summer');
});
