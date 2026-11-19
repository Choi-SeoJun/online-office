import { weatherProviderUrl } from '../game/weather-request.ts';
import { WEATHER_REFRESH_INTERVAL } from '../game/weather-refresh.ts';
import { KOREA_LEGACY_REGIONS, koreaRegionById } from '../game/korea-regions.ts';
import { createKmaWeather } from './kma-weather.ts';

// Fixed upstream: known region IDs (or legacy city coordinates), never a URL or API key.
const TTL = WEATHER_REFRESH_INTERVAL;
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type WeatherFailure = { stage: 'fetch' | 'response' | 'decode' | 'kma'; status: number | null };
export function createWeatherHandler({ fetcher = fetch, now = Date.now, getApiKey = () => undefined, reportFailure = failure => console.error('weather_fetch_failed', failure) }: { fetcher?: Fetcher; now?: () => number; getApiKey?: () => string | undefined; reportFailure?: (failure: WeatherFailure) => void } = {}) {
  const cache = new Map<string, { until: number; body: string }>();
  const pending = new Map<string, Promise<string>>();
  const failedUntil = new Map<string, number>();
  const loadKma = createKmaWeather({ fetcher, now });
  return async function handleWeather(request: Request): Promise<Response> {
    const url = new URL(request.url), origin = request.headers.get('origin');
    const allowed = origin === null || origin === url.origin || origin === 'https://choi-seojun.github.io';
    const headers = new Headers({ 'Cache-Control': 'private, no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' });
    if (allowed && origin) headers.set('Access-Control-Allow-Origin', origin);
    const fail = (status: number) => Response.json({ error: '날씨를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }, { status, headers });
    if (!allowed) return fail(403);
    if (request.method !== 'GET') { headers.set('Allow', 'GET'); return fail(405); }
    const coordinate = (key: string, limit: number) => {
      const values = url.searchParams.getAll(key);
      if (values.length !== 1 || !/^-?\d+(\.\d+)?$/.test(values[0])) return null;
      const value = Number(values[0]);
      return Number.isFinite(value) && Math.abs(value) <= limit ? Math.round(value * 100) / 100 : null;
    };
    const ids = url.searchParams.getAll('region');
    if (ids.length > 1 || (ids.length && (url.searchParams.has('latitude') || url.searchParams.has('longitude')))) return fail(400);
    const oldLatitude = coordinate('latitude', 90), oldLongitude = coordinate('longitude', 180);
    const oldRegion = ids.length ? null : KOREA_LEGACY_REGIONS.find(region => region.latitude === oldLatitude && region.longitude === oldLongitude);
    const region = koreaRegionById(ids.length ? ids[0] : oldRegion?.id);
    if (!region) return fail(400);
    const { latitude, longitude } = region;
    const key = region.id;
    if ((failedUntil.get(key) ?? 0) > now()) return fail(503);
    failedUntil.delete(key);
    try {
      let body = cache.get(key);
      if (body && body.until <= now()) { cache.delete(key); body = undefined; }
      if (!body) {
        let job = pending.get(key);
        if (!job) {
          if (pending.size >= 20) return fail(503);
          const upstream = weatherProviderUrl(latitude, longitude);
          job = (async () => {
            const failure: WeatherFailure = { stage: 'fetch', status: null };
            try {
              const apiKey = getApiKey()?.trim();
              if (apiKey) {
                failure.stage = 'kma';
                const result = JSON.stringify(await loadKma(region, apiKey));
                if (cache.size >= 256) cache.delete(cache.keys().next().value!);
                cache.set(key, { until: now() + TTL, body: result });
                return result;
              }
              const options: RequestInit & { cf: { cacheTtl: number; cacheEverything: boolean } } = { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' }, cf: { cacheTtl: TTL / 1000, cacheEverything: true } };
              const response = await fetcher(upstream.toString(), options);
              failure.stage = 'response'; failure.status = response.status;
              if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Weather unavailable'); }
              failure.stage = 'decode';
              const reader = response.body.getReader(); let size = 0, text = ''; const decoder = new TextDecoder();
              try {
                while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 64_000) throw new Error('Oversize weather'); text += decoder.decode(value, { stream: true }); }
                text += decoder.decode();
              } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
              const data = JSON.parse(text);
              if (!data || typeof data !== 'object' || !data.current || !data.daily || typeof data.timezone !== 'string') throw new Error('Invalid weather');
              // No coordinates or provider diagnostics need to be returned to the UI.
              const result = JSON.stringify({ source: 'open-meteo', timezone: data.timezone, current: data.current, daily: data.daily });
              if (cache.size >= 256) cache.delete(cache.keys().next().value!);
              cache.set(key, { until: now() + TTL, body: result });
              return result;
            } catch (error) {
              // Never log coordinates, request headers or provider response bodies.
              reportFailure(failure);
              if (failedUntil.size >= 256) failedUntil.delete(failedUntil.keys().next().value!);
              failedUntil.set(key, now() + 30000);
              throw error;
            }
          })();
          pending.set(key, job);
          void job.finally(() => pending.delete(key)).catch(() => {});
        }
        const result = await job;
        return new Response(result, { headers: new Headers([...headers, ['Content-Type', 'application/json; charset=utf-8']]) });
      }
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return new Response(body.body, { headers });
    } catch { return fail(503); }
  };
}
