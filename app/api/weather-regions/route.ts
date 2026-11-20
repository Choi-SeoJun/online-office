import {waitUntil} from 'cloudflare:workers';
import {hostedRegionCatalog} from '../../../lib/hosted-region-catalog.ts';

export function GET(request:Request){
  const job=handle(request);
  // Other requests share this catalog read/refresh, even if its client leaves.
  waitUntil(job.then(()=>{},()=>{}));
  return job;
}

async function handle(request:Request){
  const url=new URL(request.url), origin=request.headers.get('origin');
  const allowed=!origin||origin===url.origin||origin==='https://choi-seojun.github.io';
  const headers=new Headers({'Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'});
  if(!allowed)return Response.json({error:'허용되지 않은 요청이에요.'},{status:403,headers});
  if(origin)headers.set('Access-Control-Allow-Origin',origin);
  // Fixed public source, server-enforced cadence: query parameters cannot select
  // an upstream or force repeated downloads. No key or player data is involved.
  const status=url.searchParams.get('refresh')==='1'?await hostedRegionCatalog.refresh():await hostedRegionCatalog.read();
  if(url.searchParams.get('refresh')!=='1'&&Date.now()>=status.nextCheckAt)waitUntil(hostedRegionCatalog.refresh());
  const {catalog,...info}=status;
  return Response.json(url.searchParams.get('summary')==='1'?{...info,revision:catalog.revision,sourceDate:catalog.sourceDate,sourceUrl:catalog.sourceUrl,regions:catalog.regions.length}:{...info,catalog},{headers});
}
