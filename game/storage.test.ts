import test from 'node:test';
import assert from 'node:assert/strict';
import { readSavedState, writeSavedState, toPersistedState, STORAGE_KEY } from './storage.ts';
import { createGameEngine } from './engine.ts';
test('corrupt and incompatible saved records safely return defaults or no save',()=>{
 for(const raw of ['{','null','[]','{"version":2}'])assert.equal(readSavedState({getItem:()=>raw}),undefined);
 const p=readSavedState({getItem:()=>JSON.stringify({version:1,name:'  아주긴이름입니다열글자초과  ',weapon:'laser',settings:{sound:'true',volume:Infinity,reducedMotion:true,quality:'ultra'},snacks:{cookie:-1,choco:20,cracker:1.5}})})!;
 assert.equal(p.name.length,10);assert.equal(p.weapon,'punch');assert.deepEqual(p.settings,{sound:false,volume:.4,reducedMotion:true,quality:'auto'});assert.deepEqual(p.snacks,{cookie:0,choco:6,cracker:0});
});
test('storage access failures never escape and persisted data excludes transient coffee and positions',()=>{
 assert.equal(readSavedState({getItem(){throw Error('denied')}}),undefined);
 const e=createGameEngine();assert.equal(writeSavedState(e.state,{setItem(){throw Error('quota')}}),false);
 e.state.inventory.cookie=2;e.state.inventory.coffee=3;e.dispatch({type:'weapon',weapon:'hammer'});let saved='';
 assert.equal(writeSavedState(e.state,{setItem(key,value){assert.equal(key,STORAGE_KEY);saved=value}}),true);
 assert.deepEqual(JSON.parse(saved),toPersistedState(e.state));assert.deepEqual(JSON.parse(saved).snacks,{cookie:2,choco:0,cracker:0});assert.equal('player' in JSON.parse(saved),false);assert.equal('coffee' in JSON.parse(saved).snacks,false);
 const loaded=createGameEngine(readSavedState({getItem:()=>saved}));assert.equal(loaded.state.weapon,'hammer');assert.equal(loaded.state.inventory.coffee,0);assert.equal(loaded.state.inventory.cookie,2);
});
