import test from 'node:test';
import assert from 'node:assert/strict';
import {regionCatalogSnapshot,searchKoreaRegions} from './korea-regions.ts';
import {hydrateRegionCatalog,refreshRegionCatalog} from './region-catalog-client.ts';
import {normalizeRegion} from './weather-client.ts';

test('cached catalogs restore new saved IDs offline and invalid remote data cannot replace them',async()=>{
  const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),originalCaches=Object.getOwnPropertyDescriptor(globalThis,'caches'),originalFetch=globalThis.fetch;
  const c=regionCatalogSnapshot(),base=c.regions.find(r=>r.id==='4413358000')!;
  c.regions.push({...base,id:'4413361000',label:'새동네',representativePoint:base.label});
  Object.defineProperty(globalThis,'window',{configurable:true,value:{location:{href:'https://office.test/'}}});
  Object.defineProperty(globalThis,'caches',{configurable:true,value:{open:async()=>({match:async()=>Response.json({catalog:c}),put:async()=>{}})}});
  globalThis.fetch=async()=>Response.json({catalog:{schema:1,regions:[]}});
  try{
    assert.equal(await hydrateRegionCatalog(),true);
    assert.ok(searchKoreaRegions('천안 새동네').items.length);
    assert.equal(normalizeRegion({...base,id:'4413361000',source:'manual'})?.id,'4413361000');
    assert.equal(await refreshRegionCatalog(true),false);
    assert.ok(searchKoreaRegions('천안 새동네').items.length);
  }finally{
    globalThis.fetch=originalFetch;
    if(originalWindow)Object.defineProperty(globalThis,'window',originalWindow);else Reflect.deleteProperty(globalThis,'window');
    if(originalCaches)Object.defineProperty(globalThis,'caches',originalCaches);else Reflect.deleteProperty(globalThis,'caches');
  }
});
