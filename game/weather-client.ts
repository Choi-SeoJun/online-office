import { boundedNumber, DEFAULT_REGION, MAX_FORECAST_AGE, parseWeatherForecast, validTimezone, validWeatherCode, WEATHER_REGIONS } from './environment.ts';
import type { WeatherForecast, WeatherRegion } from './environment-types.ts';
import { roomEndpoint } from './hosting.ts';
import { koreaRegionById, legacyKoreaRegion, nearestKoreaRegion } from './korea-regions.ts';
import { weatherProviderUrl } from './weather-request.ts';
import { WEATHER_REFRESH_INTERVAL } from './weather-refresh.ts';

export const WEATHER_CACHE_AGE = WEATHER_REFRESH_INTERVAL;
const REGION_KEY = 'office-weather-region-v1';
const CACHE_KEY = 'office-weather-forecast-v1';

export function normalizeRegion(value: unknown): WeatherRegion | null {
  if (!value || typeof value !== 'object') return null;
  const { id, name, latitude, longitude, source } = value as Partial<WeatherRegion>;
  if (!boundedNumber(latitude, -90, 90) || !boundedNumber(longitude, -180, 180)) return null;
  if (source === 'default') return DEFAULT_REGION;
  if (source !== 'manual' && source !== 'location') return null;
  const region = id !== undefined ? koreaRegionById(id) : source === 'location' ? nearestKoreaRegion(latitude, longitude)
    : legacyKoreaRegion(name) ?? WEATHER_REGIONS.find(city => city.latitude === latitude && city.longitude === longitude);
  return region ? { ...region, source } : null;
}

export function usableForecast(forecast: WeatherForecast | null, now: number) {
  return forecast && boundedNumber(now - forecast.fetchedAt, 0, MAX_FORECAST_AGE) &&
    boundedNumber(now - forecast.observedAt, -30 * 60000, MAX_FORECAST_AGE) ? forecast : null;
}

function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage may be disabled. */ }
}

export const readRegion = () => normalizeRegion(read(REGION_KEY)) ?? DEFAULT_REGION;

export function saveRegion(region: WeatherRegion) {
  const normalized = normalizeRegion(region);
  if (normalized) write(REGION_KEY, normalized);
}

export const regionKey = (region: WeatherRegion) => [region.latitude.toFixed(2), region.longitude.toFixed(2)].join(',');

export function readForecast(region: WeatherRegion, now: number) {
  const cached = read(CACHE_KEY) as { region?: unknown; forecast?: Partial<WeatherForecast> } | null;
  const forecast = cached?.forecast;
  if (forecast?.source !== undefined && forecast.source !== 'kma' && forecast.source !== 'open-meteo') return null;
  if (forecast?.source === 'kma' && (!boundedNumber(forecast.kmaPty, 0, 7) || !Number.isInteger(forecast.kmaPty) || typeof forecast.skyKnown !== 'boolean')) return null;
  if (cached?.region !== regionKey(region) || !forecast ||
      !boundedNumber(forecast.fetchedAt, 0, now) || !boundedNumber(forecast.observedAt, 0, now + 30 * 60000) ||
      !boundedNumber(forecast.temperature, -150, 100) || !boundedNumber(forecast.code, 0, 99) || !validWeatherCode(forecast.code) ||
      !boundedNumber(forecast.cloud, 0, 100) || !boundedNumber(forecast.wind, 0, 500) || !validTimezone(forecast.timezone) ||
      !Array.isArray(forecast.days) || forecast.days.length < 1 || forecast.days.length > 16 ||
      !forecast.days.every(day => day && typeof day.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day.date) &&
        (day.sunrise === null || boundedNumber(day.sunrise, 0, 8.64e15)) &&
        (day.sunset === null || boundedNumber(day.sunset, 0, 8.64e15)))) return null;
  return usableForecast(forecast as WeatherForecast, now);
}

export function saveForecast(region: WeatherRegion, forecast: WeatherForecast) {
  write(CACHE_KEY, { region: regionKey(region), forecast });
}

class WeatherRateLimitError extends Error {}

async function fetchForecast(url: URL, signal: AbortSignal, timeout: number) {
  signal.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Weather request timed out')), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      if (response.status === 429) throw new WeatherRateLimitError('Weather rate limit');
      throw new Error('Weather request failed');
    }
    const data: unknown = await response.json();
    controller.signal.throwIfAborted();
    const now = Date.now();
    const forecast = usableForecast(parseWeatherForecast(data, now), now);
    if (!forecast) throw new Error('Invalid or expired weather');
    return forecast;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}

export async function requestForecast(region: WeatherRegion, signal: AbortSignal) {
  const normalized = normalizeRegion(region);
  if (!normalized) throw new Error('Invalid weather region');
  // KMA observations must win over model weather. Its key stays on the Worker.
  const url = new URL('/api/weather', new URL(roomEndpoint(), window.location.href));
  url.searchParams.set('latitude', normalized.latitude.toFixed(2));
  url.searchParams.set('longitude', normalized.longitude.toFixed(2));
  try {
    return await fetchForecast(url, signal, 8500);
  } catch (error) {
    signal.throwIfAborted();
    // Respect a server rate limit; ordinary upstream failures are returned as 503.
    if (error instanceof WeatherRateLimitError) throw error;
    return fetchForecast(weatherProviderUrl(normalized.latitude, normalized.longitude), signal, 6000);
  }
}
