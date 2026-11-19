import test from 'node:test';
import assert from 'node:assert/strict';
import { regionCatalogSnapshot } from '../game/korea-regions.ts';
import { createRegionCatalogService, type RegionBucket } from './region-catalog-service.ts';

function memoryBucket(initial='') {
  let stored=initial, version=initial?1:0;
  const bucket:RegionBucket={
    get:async()=>{const captured=stored;return captured?{etag:String(version),text:async()=>captured}:null;},
    put:async(_key,value,options)=>{
      if(options?.onlyIf?.etagMatches && options.onlyIf.etagMatches!==String(version))return null;
      if(options?.onlyIf?.etagDoesNotMatch==='*' && stored)return null;
      stored=value;return {etag:String(++version)};
    },
  };
  return {bucket,contents:()=>stored};
}

test('official refresh persists once, coalesces calls and keeps last-good data on failure', async () => {
  let calls=0, clock=Date.parse('2026-11-19T10:00:00Z'), fail=false;
  const {bucket,contents}=memoryBucket();
  const service=createRegionCatalogService({bucket,now:()=>clock,fetchCatalog:async(previous)=>{calls++; if(fail)throw Error('private diagnostics'); return previous;}});
  const results=await Promise.all([service.refresh(),service.refresh()]);
  assert.equal(calls,1); assert.equal(results[0].status,'current'); assert.ok(contents());
  assert.equal((await service.refresh()).checkedAt,clock); assert.equal(calls,1);
  clock+=86400000; fail=true;
  const next=await service.refresh(); assert.equal(next.status,'stale'); assert.equal(next.catalog.regions.length,regionCatalogSnapshot().regions.length);
  assert.ok(!contents().includes('private diagnostics'));
  const reopened=createRegionCatalogService({bucket,now:()=>clock,fetchCatalog:async()=>{throw Error('not due');}});
  assert.equal((await reopened.read()).status,'stale');
  assert.ok(await reopened.resolve('address:4413310400:4413358000'));
  assert.equal(await reopened.resolve('made-up'),null);
});

test('a newer stored catalog is authoritative even when the app bundle is older', async()=>{
  const next=regionCatalogSnapshot(); next.revision='mois-20261120'; next.sourceDate='2026-11-20';
  const base=next.regions.find(r=>r.id==='4413358000')!;
  next.regions.push({...base,id:'4413361000',label:'두정새동',representativePoint:'부성1동'});
  const now=Date.parse('2026-11-20T10:00:00Z');
  const {bucket}=memoryBucket(JSON.stringify({catalog:next,checkedAt:now,lastSuccessAt:now,nextCheckAt:now+86400000,status:'current'}));
  const service=createRegionCatalogService({now:()=>now,bucket,fetchCatalog:async()=>{throw Error('not needed');}});
  assert.equal((await service.resolve('4413361000'))?.name,'충청남도 천안시 서북구 두정새동');
});

test('an older failing isolate cannot overwrite a newer successful catalog between read and write',async()=>{
  const old=regionCatalogSnapshot(), next={...old,revision:'mois-20261120',sourceDate:'2026-11-20'};
  const now=Date.parse('2026-11-20T10:00:00Z');
  const {bucket,contents}=memoryBucket(JSON.stringify({catalog:old,checkedAt:0,lastSuccessAt:0,nextCheckAt:0,status:'current'}));
  let unblock!:()=>void, reached!:()=>void;
  const blocked=new Promise<void>(r=>{unblock=r;}), ready=new Promise<void>(r=>{reached=r;});
  const failingBucket:RegionBucket={...bucket,put:async(key,value,options)=>{reached();await blocked;return bucket.put(key,value,options);}};
  const failing=createRegionCatalogService({bucket:failingBucket,now:()=>now,fetchCatalog:async()=>{throw Error('upstream outage');}});
  const successful=createRegionCatalogService({bucket,now:()=>now,fetchCatalog:async()=>next});
  const failure=failing.refresh(); await ready;
  assert.equal((await successful.refresh()).catalog.sourceDate,'2026-11-20');
  unblock(); const final=await failure;
  assert.equal(JSON.parse(contents()).catalog.sourceDate,'2026-11-20');
  assert.equal(final.catalog.sourceDate,'2026-11-20');
  assert.equal(final.status,'current');
});

test('a first unsuccessful bootstrap recovers after five minutes without bypassing a successful daily check',async()=>{
  let now=Date.parse('2026-11-20T10:00:00Z'),calls=0;
  const catalog=regionCatalogSnapshot();
  const {bucket}=memoryBucket(JSON.stringify({catalog,checkedAt:now,lastSuccessAt:0,nextCheckAt:now+3600000,status:'stale'}));
  const service=createRegionCatalogService({bucket,now:()=>now,fetchCatalog:async(previous)=>{calls++;return previous;}});
  assert.equal((await service.read()).nextCheckAt,now+300000);
  await service.refresh();assert.equal(calls,0);
  now+=300001;assert.equal((await service.refresh()).status,'current');assert.equal(calls,1);
  now+=300001;await service.refresh();assert.equal(calls,1);
});
