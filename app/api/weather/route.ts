import { env, waitUntil } from 'cloudflare:workers';
import { createWeatherHandler } from '../../../lib/weather-http.ts';
import {hostedRegionCatalog} from '../../../lib/hosted-region-catalog.ts';

const handle = createWeatherHandler({ getApiKey: () => env.KMA_SERVICE_KEY, resolveRegion:hostedRegionCatalog.resolve });

export function GET(request: Request) {
  const job = handle(request);
  // Region changes cancel browser requests. Keep shared catalog/KMA I/O alive
  // until it settles so later requests cannot inherit an abandoned promise.
  waitUntil(job.then(() => {}, () => {}));
  return job;
}
