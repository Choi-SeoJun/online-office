import { env } from 'cloudflare:workers';
import { createWeatherHandler } from '../../../lib/weather-http.ts';

export const GET = createWeatherHandler({ getApiKey: () => env.KMA_SERVICE_KEY });
