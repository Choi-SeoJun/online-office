import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createActor, animateActor } from './models.ts';
import { createGameEngine } from './engine.ts';
import { readSavedState, toPersistedState, writeAvatarChoice } from './storage.ts';
import { ROOF_WALLS } from './layout.ts';

Object.defineProperty(globalThis, 'document', { configurable:true, value:{createElement:()=>({width:0,height:0,getContext:()=>({beginPath(){},roundRect(){},fill(){},fillText(){}})})} });

test('ponytail has a tied long section behind the head and follows head transforms',()=>{
  const rig=createActor(new THREE.Group(),0,'이사원','ponytail');
  const tail=rig.root.getObjectByName('ponytail-hair');
  assert.ok(tail?.visible,'ponytail selected');
  assert.equal(tail.parent,rig.head);
  assert.ok(tail.getObjectByName('ponytail-tie'));
  rig.root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(tail),headPosition=rig.head.getWorldPosition(new THREE.Vector3());
  assert.ok(bounds.min.z < headPosition.z-.55,'tail visibly extends behind the head');
  assert.ok(bounds.min.y < headPosition.y-.4,'tail hangs to shoulder level, not a small bun');
  const tip=tail.getObjectByName('ponytail-tip')!,before=tip.getWorldPosition(new THREE.Vector3());
  rig.head.rotation.y=.8;rig.root.updateMatrixWorld(true);
  assert.ok(tip.getWorldPosition(new THREE.Vector3()).distanceTo(before)>.2,'tail follows the head');
});

test('legacy actors default to short hair and live avatar changes toggle without growing geometry',()=>{
  const state=createGameEngine().state,rig=createActor(new THREE.Group(),0,state.name);
  const tail=rig.root.getObjectByName('ponytail-hair')!,short=rig.root.getObjectByName('short-hair')!;
  assert.equal(tail.visible,false);assert.equal(short.visible,true);
  const children=rig.head.children.length;
  state.player.avatar='ponytail';animateActor(rig,state.player,state,0);
  assert.equal(tail.visible,true);assert.equal(short.visible,false);
  state.player.avatar='short';animateActor(rig,state.player,state,1);
  assert.equal(tail.visible,false);assert.equal(short.visible,true);assert.equal(rig.head.children.length,children);
});

test('solo choice persists across reload, old records default short, and reset clears the choice',()=>{
  const engine=createGameEngine();assert.equal(engine.state.player.avatar,'short');
  engine.dispatch({type:'enter',name:'이사원',avatar:'ponytail'});
  assert.equal(engine.state.player.avatar,'ponytail');
  const saved=toPersistedState(engine.state);assert.equal(saved.avatar,'ponytail');
  assert.equal(createGameEngine(saved).state.player.avatar,'ponytail');
  const legacy=readSavedState({getItem:()=>JSON.stringify({version:1,name:'김사원'})});
  assert.equal(createGameEngine(legacy).state.player.avatar,'short');
  const invalid=readSavedState({getItem:()=>JSON.stringify({version:1,avatar:'unexpected'})});
  assert.equal(invalid?.avatar,'short');
  engine.dispatch({type:'reset'});assert.equal(engine.state.player.avatar,'short');
});

test('avatar picker preserves the saved work settings and creates valid defaults for new players',()=>{
  let text=JSON.stringify({version:1,name:'박대리',weapon:'hammer',settings:{sound:true,volume:.7},snacks:{cookie:2}});
  const storage={getItem:()=>text,setItem:(_key:string,value:string)=>{text=value;}};
  assert.equal(writeAvatarChoice('ponytail',storage),true);
  let saved=readSavedState(storage)!;
  assert.equal(saved.avatar,'ponytail');assert.equal(saved.name,'박대리');assert.equal(saved.settings.volume,.7);assert.equal(saved.snacks.cookie,2);
  text='';assert.equal(writeAvatarChoice('ponytail',storage),true);saved=readSavedState(storage)!;
  assert.equal(saved.name,'김사원');assert.equal(saved.avatar,'ponytail');assert.equal(saved.settings.sound,false);
  assert.equal(writeAvatarChoice('short',{getItem:()=>null,setItem:()=>{throw new Error('full');}}),false);
});

test('ponytail rests over the shoulder while leaning against any wall and returns behind the head when walking',()=>{
  const state=createGameEngine().state;state.player.avatar='ponytail';state.floor='rooftop';state.roofRest='wall';state.player.pose='wallLean';state.candyInMouth=true;
  const rig=createActor(new THREE.Group(),0,state.name,'ponytail');
  for(const wall of Object.values(ROOF_WALLS))for(const reduced of [false,true]){
    Object.assign(state.player,wall.point);state.player.angle=wall.angle;state.settings.reducedMotion=reduced;
    animateActor(rig,state.player,state,1);rig.root.updateMatrixWorld(true);
    const inward=new THREE.Vector3(Math.sin(wall.angle),0,Math.cos(wall.angle));
    const plane=new THREE.Vector3(wall.center.x,0,wall.center.z).dot(inward)+wall.depth/2;
    const bounds=new THREE.Box3().setFromObject(rig.head,true);
    const nearest=Math.abs(inward.x)>.5?inward.x>0?bounds.min.x:-bounds.max.x:inward.z>0?bounds.min.z:-bounds.max.z;
    assert.ok(nearest>=plane-.015,`${wall.label}: hair does not intersect wall`);
  }
  state.roofRest=null;state.player.pose='walk';state.player.moving=true;state.player.angle=0;
  animateActor(rig,state.player,state,2);rig.root.updateMatrixWorld(true);
  assert.ok(new THREE.Box3().setFromObject(rig.hairStyles.ponytail).min.z<rig.head.getWorldPosition(new THREE.Vector3()).z-.55);
});
