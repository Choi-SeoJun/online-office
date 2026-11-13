// Fixed upstream: clients can choose approximate coordinates, never a URL or API key.
const TTL = 15 * 60_000;
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
export function createWeatherHandler({ fetcher = fetch, now = Date.now }: { fetcher?: Fetcher; now?: () => number } = {}) {
  const cache = new Map<string, { until: number; body: string }>();
  const pending = new Map<string, Promise<string>>();
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
    const latitude = coordinate('latitude', 90), longitude = coordinate('longitude', 180);
    if (latitude === null || longitude === null) return fail(400);
    const key = `${latitude},${longitude}`;
    try {
      let body = cache.get(key);
      if (body && body.until <= now()) { cache.delete(key); body = undefined; }
      if (!body) {
        let job = pending.get(key);
        if (!job) {
          if (pending.size >= 20) return fail(503);
          const upstream = new URL('https://api.open-meteo.com/v1/forecast');
          upstream.search = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), current: 'temperature_2m,weather_code,cloud_cover,wind_speed_10m,is_day', daily: 'sunrise,sunset', timezone: 'auto', timeformat: 'unixtime', forecast_days: '2', wind_speed_unit: 'ms' }).toString();
          job = (async () => {
            const options: RequestInit & { cf: { cacheTtl: number; cacheEverything: boolean } } = { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' }, cf: { cacheTtl: 900, cacheEverything: true } };
            const response = await fetcher(upstream.toString(), options);
            if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Weather unavailable'); }
            const reader = response.body.getReader(); let size = 0, text = ''; const decoder = new TextDecoder();
            try {
              while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 64_000) throw new Error('Oversize weather'); text += decoder.decode(value, { stream: true }); }
              text += decoder.decode();
            } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
            const data = JSON.parse(text);
            if (!data || typeof data !== 'object' || !data.current || !data.daily || typeof data.timezone !== 'string') throw new Error('Invalid weather');
            // No coordinates or provider diagnostics need to be returned to the UI.
            const result = JSON.stringify({ timezone: data.timezone, current: data.current, daily: data.daily });
            if (cache.size >= 256) cache.delete(cache.keys().next().value!);
            cache.set(key, { until: now() + TTL, body: result });
            return result;
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
export const handleWeatherRequest = createWeatherHandler();
