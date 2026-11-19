import test from 'node:test';
import assert from 'node:assert/strict';
import {readRegionPreference} from './weather-client.ts';
import {regionCatalogSnapshot,applyRegionCatalog} from './korea-regions.ts';

test('an uncached new saved region waits for its catalog instead of silently using Seoul',()=>{
  const prior=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  const saved={id:'4413361000',name:'충청남도 천안시 서북구 두정새동',source:'manual',latitude:0,longitude:0};
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify(saved)}});
  try{
    assert.deepEqual(readRegionPreference(),{region:null,pendingName:saved.name});
    const catalog=regionCatalogSnapshot(),base=catalog.regions.find(p=>p.id==='4413358000')!;
    catalog.regions.push({...base,id:saved.id,label:'두정새동',representativePoint:'부성1동'});
    assert.equal(applyRegionCatalog(catalog),true);
    const restored=readRegionPreference();
    assert.equal(restored.pendingName,null);
    assert.equal(restored.region?.id,saved.id);
    assert.equal(restored.region?.latitude,base.latitude);
  }finally{if(prior)Object.defineProperty(globalThis,'localStorage',prior);else Reflect.deleteProperty(globalThis,'localStorage');}
});
