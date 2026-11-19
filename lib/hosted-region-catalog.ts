import {env} from 'cloudflare:workers';
import {createRegionCatalogService} from './region-catalog-service.ts';
import {fetchMoisCatalog} from './mois-regions.ts';

export const hostedRegionCatalog=createRegionCatalogService({bucket:{
  get:async key=>{if(!env.BUCKET)throw Error('Region storage unavailable');return env.BUCKET.get(key);},
  put:async(key,value,options)=>{if(!env.BUCKET)throw Error('Region storage unavailable');return env.BUCKET.put(key,value,options);},
},fetchCatalog:async(previous,now)=>{
  try{return await fetchMoisCatalog(previous,now);}
  catch(error){
    // Only our fixed validation messages or standard failure names; no upstream
    // response body, source query strings, credentials or player data in logs.
    const reason=error instanceof Error && error.message.startsWith('MOIS catalog: ')?error.message.slice(0,160):
      error instanceof Error && ['TimeoutError','AbortError','TypeError'].includes(error.name)?error.name:'upstream-unavailable';
    console.error('Weather region refresh unavailable',reason);
    throw error;
  }
}});
