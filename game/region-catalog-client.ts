import {applyRegionCatalog} from './korea-regions.ts';
import {roomEndpoint} from './hosting.ts';

const CACHE='office-public-regions-v1';
let nextAttempt=0, pending:Promise<boolean>|null=null;
const url=()=>new URL('/api/weather-regions',new URL(roomEndpoint(),window.location.href)).toString();
async function readBounded(response:Response){
  if(!response.ok||!response.body)throw Error('Catalog unavailable');
  const reader=response.body.getReader(), decoder=new TextDecoder(); let size=0,text='';
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8_000_000)throw Error('Oversize catalog');text+=decoder.decode(value,{stream:true});}return JSON.parse(text+decoder.decode());}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

/** Public data cache avoids consuming personal settings/wallpaper storage quota. */
export async function hydrateRegionCatalog():Promise<boolean>{
  try{if(typeof caches==='undefined')return false;const response=await(await caches.open(CACHE)).match(url());return !!response&&applyRegionCatalog((await readBounded(response)).catalog);}
  catch{return false;}
}

export async function refreshRegionCatalog(force=false):Promise<boolean>{
  if(pending)return pending;
  if(!force&&Date.now()<nextAttempt)return false;
  nextAttempt=Date.now()+300000;
  pending=(async()=>{
    try{
      const response=await fetch(url(),{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});
      const data=await readBounded(response);
      if(!applyRegionCatalog(data.catalog))return false;
      nextAttempt=Date.now()+(data.nextCheckAt>Date.now()?1800000:60000);
      try{if(typeof caches!=='undefined')await(await caches.open(CACHE)).put(url(),Response.json(data));}catch{/* Cache can be unavailable in private browsing. */}
      return true;
    }catch{return false;}
  })();
  try{return await pending;}finally{pending=null;}
}
