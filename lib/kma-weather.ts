import { localDate, sunTimes } from '../game/environment.ts';
import type { WeatherRegion } from '../game/environment-types.ts';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type Cycle = { date: string; time: string };
type Grid = { nx: number; ny: number };
type Row = Record<string, unknown>;
const MINUTE = 60000, HOUR = 60 * MINUTE, KST = 9 * HOUR;
const asRecord = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const numeric = (value: unknown) => typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
const range = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max;

/** KMA's Lambert conformal conic projection, 5 km grid. */
export function kmaGrid(latitude: number, longitude: number): Grid {
  const rad = Math.PI / 180, re = 6371.00877 / 5;
  const slat1 = 30 * rad, slat2 = 60 * rad;
  const sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(Math.tan(Math.PI / 4 + slat2 / 2) / Math.tan(Math.PI / 4 + slat1 / 2));
  const sf = Math.pow(Math.tan(Math.PI / 4 + slat1 / 2), sn) * Math.cos(slat1) / sn;
  const ro = re * sf / Math.pow(Math.tan(Math.PI / 4 + 38 * rad / 2), sn);
  const ra = re * sf / Math.pow(Math.tan(Math.PI / 4 + latitude * rad / 2), sn);
  const theta = (longitude - 126) * rad * sn;
  return { nx: Math.floor(ra * Math.sin(theta) + 43.5), ny: Math.floor(ro - ra * Math.cos(theta) + 136.5) };
}

function format(time: number): Cycle {
  const iso = new Date(time + KST).toISOString();
  return { date: iso.slice(0, 10).replaceAll('-', ''), time: iso.slice(11, 16).replace(':', '') };
}
function timestamp(date: unknown, time: unknown): number {
  if (typeof date !== 'string' || typeof time !== 'string' || !/^\d{8}$/.test(date) || !/^\d{4}$/.test(time)) return NaN;
  const value = Date.UTC(+date.slice(0,4), +date.slice(4,6)-1, +date.slice(6,8), +time.slice(0,2), +time.slice(2,4)) - KST;
  const roundtrip = format(value);
  return roundtrip.date === date && roundtrip.time === time ? value : NaN;
}

// October 2026 data.go.kr guide: observations in ten-minute units; allow
// ten minutes for publication. Hourly :30 sky forecasts are available at :45.
export function kmaCycle(now: number, kind: 'observation' | 'sky'): Cycle {
  return format(kind === 'observation' ? Math.floor((now - 10 * MINUTE) / (10 * MINUTE)) * 10 * MINUTE
    : Math.floor((now - 45 * MINUTE) / HOUR) * HOUR + 30 * MINUTE);
}

async function boundedJson(response: Response) {
  if (!response.ok || !response.body) { await response.body?.cancel().catch(() => {}); throw new Error('KMA unavailable'); }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 64000) throw new Error('KMA response too large');
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } catch { throw new Error('Invalid KMA response'); }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function rows(raw: unknown, cycle: Cycle, grid: Grid, sky: boolean): Row[] | null {
  const response = asRecord(asRecord(raw).response), header = asRecord(response.header);
  if (header.resultCode === '03') return null;
  if (header.resultCode !== '00') throw new Error('KMA service unavailable');
  const items = asRecord(asRecord(response.body).items).item;
  if (!Array.isArray(items) || items.length > 1000) throw new Error('Invalid KMA items');
  if (!items.length) return null;
  const result = items.map(asRecord);
  // The live forecast endpoint can normalize a requested :30 base to :00.
  // Accept that bounded normalization only for sky forecasts, never observations.
  if (!result.every(item => (sky
      ? range(timestamp(cycle.date, cycle.time) - timestamp(item.baseDate, item.baseTime), 0, 30 * MINUTE)
      : item.baseDate === cycle.date && item.baseTime === cycle.time) &&
      numeric(item.nx) === grid.nx && numeric(item.ny) === grid.ny)) throw new Error('KMA data mismatch');
  return result;
}

function observation(items: Row[], cycle: Cycle, now: number) {
  const values = new Map<string, number>();
  for (const item of items) {
    if (typeof item.category !== 'string' || !['PTY','T1H','WSD'].includes(item.category)) continue;
    const value = numeric(item.obsrValue);
    if (values.has(item.category) && values.get(item.category) !== value) throw new Error('Conflicting KMA observations');
    values.set(item.category, value);
  }
  const pty = values.get('PTY')!, temperature = values.get('T1H')!, wind = values.get('WSD')!;
  const observed = timestamp(cycle.date, cycle.time);
  if (!Number.isInteger(pty) || !range(pty, 0, 7) || !range(temperature, -80, 60) || !range(wind, 0, 150) ||
      !range(now - observed, 0, 90 * MINUTE)) throw new Error('Invalid KMA observation');
  return { pty, temperature, wind, observed };
}
function skyValue(items: Row[] | null, now: number) {
  const candidates = (items ?? []).filter(item => item.category === 'SKY')
    .map(item => ({ value: numeric(item.fcstValue), time: timestamp(item.fcstDate, item.fcstTime) }))
    .filter(item => [1,3,4].includes(item.value) && range(item.time - now, -HOUR, HOUR))
    .sort((a,b) => Math.abs(a.time-now) - Math.abs(b.time-now) || a.time-b.time);
  return candidates[0]?.value ?? null;
}

export function createKmaWeather({ fetcher = fetch, now = Date.now }: { fetcher?: Fetcher; now?: () => number } = {}) {
  const cache = new Map<string, { until: number; data: Row[] | null }>();
  const pending = new Map<string, Promise<Row[] | null>>();
  let activeKey: string | undefined;
  async function query(operation: 'getUltraSrtNcst' | 'getUltraSrtFcst', cycle: Cycle, grid: Grid, serviceKey: string) {
    const id = `${operation}:${cycle.date}:${cycle.time}:${grid.nx}:${grid.ny}`;
    const hit = cache.get(id); if (hit && hit.until > now()) return hit.data;
    const inFlight = pending.get(id); if (inFlight) return inFlight;
    if (pending.size >= 32) throw new Error('KMA busy');
    const job = (async () => {
      const url = new URL(`https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/${operation}`);
      url.search = new URLSearchParams({ serviceKey, dataType: 'JSON', pageNo: '1', numOfRows: '1000',
        base_date: cycle.date, base_time: cycle.time, nx: String(grid.nx), ny: String(grid.ny) }).toString();
      try {
        const raw = await boundedJson(await fetcher(url.toString(), { headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(4000), redirect: 'manual' }));
        const data = rows(raw, cycle, grid, operation === 'getUltraSrtFcst');
        if (cache.size >= 512) cache.delete(cache.keys().next().value!);
        cache.set(id, { data, until: now() + (data ? 70 * MINUTE : 2 * MINUTE) });
        return data;
      } catch { throw new Error('KMA weather unavailable'); } // Never propagate a key-bearing fetch URL or provider diagnostics.
    })();
    pending.set(id, job);
    try { return await job; } finally { pending.delete(id); }
  }
  return async function load(region: WeatherRegion, serviceKey: string) {
    if (!serviceKey.trim()) throw new Error('KMA not configured');
    if (activeKey !== serviceKey) { cache.clear(); activeKey = serviceKey; }
    const time = now(), grid = kmaGrid(region.latitude, region.longitude);
    const currentCycle = kmaCycle(time, 'observation'), skyCycle = kmaCycle(time, 'sky');
    const obsJob = (async () => {
      let cycle = currentCycle, items = await query('getUltraSrtNcst', cycle, grid, serviceKey);
      if (!items) {
        cycle = format(timestamp(cycle.date, cycle.time) - 10 * MINUTE);
        items = await query('getUltraSrtNcst', cycle, grid, serviceKey);
      }
      if (!items) throw new Error('No KMA observation');
      return observation(items, cycle, time);
    })();
    const [obs, sky] = await Promise.all([obsJob, query('getUltraSrtFcst', skyCycle, grid, serviceKey).then(items => skyValue(items, time)).catch(() => null)]);
    const cloud = sky === 1 ? 10 : sky === 3 ? 70 : sky === 4 ? 100 : 50;
    const dryCode = sky === 1 ? 0 : sky === 3 ? 2 : 3;
    const code = [dryCode,61,73,73,80,51,71,71][obs.pty];
    const times = sunTimes(region, time), date = localDate(time, 'Asia/Seoul');
    return {
      source: 'kma', kmaPty: obs.pty, skyKnown: sky !== null, timezone: 'Asia/Seoul',
      current: { time: obs.observed / 1000, temperature_2m: obs.temperature, wind_speed_10m: obs.wind,
        weather_code: code, cloud_cover: cloud, is_day: times.sunrise !== null && times.sunset !== null && time >= times.sunrise && time < times.sunset ? 1 : 0 },
      daily: { time: [Date.parse(`${date}T00:00:00+09:00`) / 1000], sunrise: [times.sunrise === null ? null : Math.floor(times.sunrise/1000)], sunset: [times.sunset === null ? null : Math.floor(times.sunset/1000)] },
    };
  };
}
