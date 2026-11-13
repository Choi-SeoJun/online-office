export type WeatherRegion = { id?: string; name: string; latitude: number; longitude: number; timezone: string; source: 'default' | 'manual' | 'location' };
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Precipitation = 'none' | 'rain' | 'snow';
export type WeatherForecast = { fetchedAt: number; observedAt: number; temperature: number; code: number; cloud: number; wind: number; timezone: string; days: { date: string; sunrise: number | null; sunset: number | null }[] };
export type EnvironmentFrame = { now: number; daylight: number; sunset: number; cloud: number; precipitation: Precipitation; season: Season; solarAltitude: number; azimuth: number };
export type WeatherStatus = 'loading' | 'live' | 'cached' | 'unavailable';
