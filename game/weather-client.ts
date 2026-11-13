import { boundedNumber, DEFAULT_REGION, MAX_FORECAST_AGE, parseWeatherForecast, validTimezone, validWeatherCode, WEATHER_REGIONS } from './environment.ts';
import type { WeatherForecast, WeatherRegion } from './environment-types.ts';
import { roomEndpoint } from './hosting.ts';

export const WEATHER_CACHE_AGE = 15 * 60000;
const REGION_KEY = 'office-weather-region-v1';
const CACHE_KEY = 'office-weather-forecast-v1';

export function normalizeRegion(value: unknown): WeatherRegion | null {
  if (!value || typeof value !== 'object') return null;
  const { latitude, longitude, source, timezone } = value as Partial<WeatherRegion>;
  if (!boundedNumber(latitude, -90, 90) || !boundedNumber(longitude, -180, 180) || !validTimezone(timezone)) return null;
  if (source === 'default') return DEFAULT_REGION;
  if (source === 'manual') return WEATHER_REGIONS.find(city => city.latitude === latitude && city.longitude === longitude) ?? null;
  if (source !== 'location') return null;
  return { name: '현재 위치', latitude: Math.round(latitude * 100) / 100, longitude: Math.round(longitude * 100) / 100, timezone, source };
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

export async function requestForecast(region: WeatherRegion, signal: AbortSignal) {
  const normalized = normalizeRegion(region);
  if (!normalized) throw new Error('Invalid weather region');
  const url = new URL('/api/weather', new URL(roomEndpoint(), window.location.href));
  url.searchParams.set('latitude', normalized.latitude.toFixed(2));
  url.searchParams.set('longitude', normalized.longitude.toFixed(2));
  const response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('Weather request failed');
  const now = Date.now();
  const forecast = usableForecast(parseWeatherForecast(await response.json(), now), now);
  if (!forecast) throw new Error('Invalid or expired weather');
  return forecast;
}
