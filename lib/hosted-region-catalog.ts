import {env} from 'cloudflare:workers';
import {createRegionCatalogService} from './region-catalog-service.ts';
import {fetchMoisCatalog} from './mois-regions.ts';

export const hostedRegionCatalog=createRegionCatalogService({bucket:{
  get:async key=>{if(!env.BUCKET)throw Error('Region storage unavailable');return env.BUCKET.get(key);},
  put:async(key,value,options)=>{if(!env.BUCKET)throw Error('Region storage unavailable');return env.BUCKET.put(key,value,options);},
},fetchCatalog:fetchMoisCatalog});
