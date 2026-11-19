import { parseRegionCatalog, type RegionCatalog } from '../game/region-catalog.ts';
import { regionCatalogSnapshot, type KoreaRegion } from '../game/korea-regions.ts';

export type RegionBucket = {
  get(key:string):Promise<{etag:string;text():Promise<string>}|null>;
  put(key:string,value:string,options?:{httpMetadata:{contentType:string};onlyIf?:{etagMatches?:string;etagDoesNotMatch?:string}}):Promise<unknown>;
};
export type CatalogStatus = { catalog:RegionCatalog; checkedAt:number; lastSuccessAt:number; nextCheckAt:number; status:'bundled'|'current'|'stale' };
const STORAGE_KEY='public-weather/regions-v1.json';
const day=86400000;
const retryAt=(status:CatalogStatus)=>status.status==='stale' && !status.lastSuccessAt ? Math.min(status.nextCheckAt,status.checkedAt+300000) : status.nextCheckAt;
function nextCheck(now:number) { const offset=6*3600000; return Math.floor((now+offset)/day)*day+day-offset; } // next 03:00 KST

export function createRegionCatalogService({bucket,now=Date.now,fetchCatalog}:{bucket:RegionBucket;now?:()=>number;fetchCatalog:(previous:RegionCatalog,now:number)=>Promise<RegionCatalog>}) {
  let memory:CatalogStatus|null=null, loadedAt=0;
  let reading:Promise<CatalogStatus>|null=null, updating:Promise<CatalogStatus>|null=null;
  let indexCatalog:RegionCatalog|null=null, index=new Map<string,KoreaRegion>();
  async function read():Promise<CatalogStatus> {
    if (memory && now()-loadedAt<60000) return memory;
    if (reading) return reading;
    reading=(async()=>{
      try {
        const file=await bucket.get(STORAGE_KEY);
        if(file){
          const text=await file.text();
          if(text.length>8_000_000)throw Error('Oversize catalog');
          const data=JSON.parse(text), catalog=parseRegionCatalog(data.catalog,now());
          if(catalog && (!memory || catalog.sourceDate>=memory.catalog.sourceDate) && ['current','stale'].includes(data.status) &&
              [data.checkedAt,data.lastSuccessAt,data.nextCheckAt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0) && data.checkedAt<=now()+60000 && data.nextCheckAt<=now()+day+3600000) memory={catalog,checkedAt:data.checkedAt,lastSuccessAt:data.lastSuccessAt,nextCheckAt:data.nextCheckAt,status:data.status};
        }
      } catch { /* A storage outage must not remove the working catalog. */ }
      memory ??= {catalog:regionCatalogSnapshot(),checkedAt:0,lastSuccessAt:0,nextCheckAt:0,status:'bundled'};
      memory.nextCheckAt=retryAt(memory);
      loadedAt=now(); return memory;
    })();
    try{return await reading;}finally{reading=null;}
  }
  async function refresh():Promise<CatalogStatus> {
    if(updating)return updating;
    updating=(async()=>{
      const previous=await read(), timestamp=now();
      if(timestamp<previous.nextCheckAt)return previous;
      let result:CatalogStatus;
      try{
        const next=parseRegionCatalog(await fetchCatalog(previous.catalog,timestamp),timestamp);
        if(!next || next.sourceDate<previous.catalog.sourceDate)throw Error('Invalid revision');
        result={catalog:next,checkedAt:timestamp,lastSuccessAt:timestamp,nextCheckAt:nextCheck(timestamp),status:'current'};
      }catch{
        result={...previous,checkedAt:timestamp,nextCheckAt:timestamp+(previous.lastSuccessAt?3600000:300000),status:'stale'};
      }
      try{
        // Compare-and-swap prevents a slower isolate from replacing newer data,
        // including the first write when the bucket does not yet have a catalog.
        let saved=false;
        for(let attempt=0;attempt<3;attempt++) {
          const file=await bucket.get(STORAGE_KEY);
          if(file){
            const persisted=JSON.parse(await file.text());
            if(persisted.catalog?.sourceDate>result.catalog.sourceDate ||
                (persisted.catalog?.sourceDate===result.catalog.sourceDate &&
                  (persisted.checkedAt>result.checkedAt || persisted.lastSuccessAt>result.lastSuccessAt))){
              loadedAt=0;memory=null;return await read();
            }
          }
          const written=await bucket.put(STORAGE_KEY,JSON.stringify(result),{
            httpMetadata:{contentType:'application/json'},
            onlyIf:file?{etagMatches:file.etag}:{etagDoesNotMatch:'*'},
          });
          if(written!==null){saved=true;break;}
        }
        if(!saved){loadedAt=0;memory=null;return await read();}
      }catch{result={...result,status:'stale',nextCheckAt:timestamp+3600000};}
      memory=result;loadedAt=now();return result;
    })();
    try{return await updating;}finally{updating=null;}
  }
  async function resolve(id:unknown):Promise<KoreaRegion|null>{
    if(typeof id!=='string'||id.length>45)return null;
    const {catalog}=await read();
    if(indexCatalog!==catalog){
      index=new Map(catalog.regions.map(p=>[p.id,{...p,name:p.label,district:p.level==='province'?null:p.label.split(' (')[0],timezone:'Asia/Seoul',source:'manual'} as KoreaRegion]));
      for(const p of index.values()){const labels:string[]=[];for(let part:KoreaRegion|undefined=p;part;part=part.parentId?index.get(part.parentId):undefined)labels.unshift(part.label);p.name=labels.join(' ');}
      indexCatalog=catalog;
    }
    return index.get(id)??null;
  }
  return {read,refresh,resolve};
}
