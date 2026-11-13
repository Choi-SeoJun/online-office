import { getPosition, getTimes } from 'suncalc';
import type { EnvironmentFrame, Precipitation, Season, WeatherForecast, WeatherRegion } from './environment-types.ts';

const city = (name: string, latitude: number, longitude: number, timezone = 'Asia/Seoul'): WeatherRegion =>
  ({ name, latitude, longitude, timezone, source: 'manual' });

export const WEATHER_REGIONS = [
  city('서울', 37.57, 126.98), city('부산', 35.18, 129.08), city('인천', 37.46, 126.71),
  city('대구', 35.87, 128.60), city('광주', 35.16, 126.85), city('대전', 36.35, 127.38),
  city('울산', 35.54, 129.31), city('제주', 33.50, 126.53),
  city('런던', 51.51, -0.13, 'Europe/London'), city('뉴욕', 40.71, -74.01, 'America/New_York'),
  city('시드니', -33.87, 151.21, 'Australia/Sydney'),
];
export const DEFAULT_REGION: WeatherRegion = { ...WEATHER_REGIONS[0], source: 'default' };

const labels: ReadonlyMap<number, string> = new Map([
  [0, '맑음'], [1, '대체로 맑음'], [2, '구름 조금'], [3, '흐림'],
  [45, '안개'], [48, '착빙 안개'], [51, '약한 이슬비'], [53, '이슬비'], [55, '강한 이슬비'],
  [56, '약한 어는 이슬비'], [57, '강한 어는 이슬비'], [61, '약한 비'], [63, '비'], [65, '강한 비'],
  [66, '약한 어는 비'], [67, '강한 어는 비'], [71, '약한 눈'], [73, '눈'], [75, '강한 눈'],
  [77, '싸락눈'], [80, '약한 소나기'], [81, '소나기'], [82, '강한 소나기'],
  [85, '약한 눈 소나기'], [86, '강한 눈 소나기'], [95, '뇌우'], [96, '약한 우박을 동반한 뇌우'],
  [99, '강한 우박을 동반한 뇌우'],
]);
const snow = new Set([71, 73, 75, 77, 85, 86]);
const rain = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
export const weatherLabel = (code: number) => labels.get(code) ?? '알 수 없음';
export const validWeatherCode = (code: number) => labels.has(code);
export const MAX_FORECAST_AGE = 2 * 3600000;

const dateFormats = new Map<string, Intl.DateTimeFormat>();
export function localDate(time: number, timezone: string) {
  let format = dateFormats.get(timezone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    if (dateFormats.size >= 32) dateFormats.clear();
    dateFormats.set(timezone, format);
  }
  const parts = Object.fromEntries(format.formatToParts(time).map(({ type, value }) => [type, value]));
  return [parts.year, parts.month, parts.day].join('-');
}

export function validTimezone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length > 64) return false;
  try {
    localDate(0, zone);
    return true;
  } catch {
    return false;
  }
}

export function sunTimes(region: WeatherRegion, now: number) {
  const date = new Date(now);
  const { timeZoneName = 'GMT' } = Object.fromEntries(
    new Intl.DateTimeFormat('en', { timeZone: region.timezone, timeZoneName: 'longOffset' })
      .formatToParts(date).map(({ type, value }) => [type, value]),
  );
  const offset = /^GMT([+-])(\d{2}):(\d{2})$/.exec(timeZoneName);
  const minutes = offset ? (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '-' ? -1 : 1) : 0;
  const { sunrise, sunset } = getTimes(date, region.latitude, region.longitude, 0, minutes);
  return {
    sunrise: sunrise && Number.isFinite(sunrise.getTime()) ? sunrise.getTime() : null,
    sunset: sunset && Number.isFinite(sunset.getTime()) ? sunset.getTime() : null,
  };
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const radians = Math.PI / 180;
const seasons: Season[] = ['winter', 'spring', 'summer', 'autumn'];

export function environmentFrame(region: WeatherRegion, forecast: WeatherForecast | null, now = Date.now()): EnvironmentFrame {
  const { altitude, azimuth } = getPosition(new Date(now), region.latitude, region.longitude);
  const timezone = forecast?.timezone ?? region.timezone;
  const date = localDate(now, timezone);
  const month = Number(date.slice(5, 7));
  const season = seasons[(Math.floor(month / 3) + (region.latitude < 0 ? 2 : 0)) % 4];
  const today = forecast?.days.find(day => day.date === date);
  const sunsetTime = today?.sunset ?? sunTimes({ ...region, timezone }, now).sunset;
  const daylight = clamp((altitude + 7) / 11);
  const sunset = sunsetTime === null ? 0 : clamp(1 - Math.abs(now - sunsetTime) / (60 * 60000));
  const current = forecast && now - forecast.fetchedAt <= MAX_FORECAST_AGE && now - forecast.observedAt <= MAX_FORECAST_AGE ? forecast : null;
  const precipitation: Precipitation = current
    ? snow.has(current.code) ? 'snow' : rain.has(current.code) ? 'rain' : 'none'
    : 'none';
  return { now, daylight, sunset, cloud: current ? current.cloud / 100 : 0, precipitation, season, solarAltitude: altitude * radians, azimuth: azimuth * radians };
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const boundedNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const unix = (value: unknown): value is number => boundedNumber(value, 0, 8.64e12) && Number.isInteger(value);

export function parseWeatherForecast(raw: unknown, now = Date.now()): WeatherForecast | null {
  const { timezone, current, daily } = record(raw);
  const { time: observed, temperature_2m: temperature, weather_code: code, cloud_cover: cloud, wind_speed_10m: wind, is_day: isDay } = record(current);
  const { time, sunrise, sunset } = record(daily);
  if (!validTimezone(timezone) || !unix(observed) || observed * 1000 > now + 30 * 60000 ||
      !boundedNumber(temperature, -150, 100) || !boundedNumber(code, 0, 99) || !validWeatherCode(code) ||
      !boundedNumber(cloud, 0, 100) || !boundedNumber(wind, 0, 500) || (isDay !== 0 && isDay !== 1) ||
      !Array.isArray(time) || !Array.isArray(sunrise) || !Array.isArray(sunset) ||
      time.length < 1 || time.length > 16 || sunrise.length !== time.length || sunset.length !== time.length) return null;
  const days: WeatherForecast['days'] = [];
  for (const [index, timestamp] of time.entries()) {
    const rise: unknown = sunrise[index];
    const set: unknown = sunset[index];
    if (!unix(timestamp) || (rise !== null && !unix(rise)) || (set !== null && !unix(set))) return null;
    const date = localDate(timestamp * 1000, timezone);
    if ((rise !== null && localDate(rise * 1000, timezone) !== date) ||
        (set !== null && localDate(set * 1000, timezone) !== date) ||
        (index > 0 && days[index - 1].date >= date)) return null;
    days.push({ date, sunrise: rise === null ? null : rise * 1000, sunset: set === null ? null : set * 1000 });
  }
  return { fetchedAt: now, observedAt: observed * 1000, temperature, code, cloud, wind, timezone, days };
}
