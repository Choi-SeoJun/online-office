// Shared provider contract for browser requests and the server fallback.
// Callers supply representative regional coordinates, never raw GPS positions.
export function weatherProviderUrl(latitude: number, longitude: number) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(Math.round(latitude * 100) / 100),
    longitude: String(Math.round(longitude * 100) / 100),
    current: 'temperature_2m,weather_code,cloud_cover,wind_speed_10m,is_day',
    daily: 'sunrise,sunset', timezone: 'auto', timeformat: 'unixtime',
    forecast_days: '2', wind_speed_unit: 'ms',
  }).toString();
  return url;
}
