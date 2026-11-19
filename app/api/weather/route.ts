import { env } from 'cloudflare:workers';
import { createWeatherHandler } from '../../../lib/weather-http.ts';
import {hostedRegionCatalog} from '../../../lib/hosted-region-catalog.ts';

export const GET = createWeatherHandler({ getApiKey: () => env.KMA_SERVICE_KEY, resolveRegion:hostedRegionCatalog.resolve });
