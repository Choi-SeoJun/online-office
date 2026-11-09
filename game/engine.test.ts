import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameEngine } from './engine.ts';
import { BOUNDS, DESKS, OBSTACLES } from './layout.ts';
import type { GameEngine, TargetId } from './types.ts';

function advance(e: GameEngine, seconds: number) { for (let t = 0; t < seconds; t += .05) e.step(.05); }
function arrived(e: GameEngine, target: TargetId) { e.dispatch({type:'select',target}); advance(e, 18); assert.equal(e.state.ready,true, target); }
function enter() { const e=createGameEngine(); e.dispatch({type:'enter'}); return e; }
function clear(e:GameEngine) {
  const p=e.state.player;
  assert.ok(p.x >= BOUNDS.minX+.21 && p.x <= BOUNDS.maxX-.21 && p.z >= BOUNDS.minZ+.21 && p.z <= BOUNDS.maxZ-.21);
  for(const o of OBSTACLES) assert.ok(!(Math.abs(p.x-o.x)<o.w/2+.21 && Math.abs(p.z-o.z)<o.d/2+.21),`collision at ${p.x},${p.z}`);
}

test('selection reaches targets around furniture but never seats automatically',()=>{
 const e=enter();
 for(const target of ['desk','coffee','snacks','lounge','copier','desk'] as TargetId[]) {
  e.dispatch({type:'select',target}); for(let i=0;i<400;i++){e.step(.05);clear(e);} assert.equal(e.state.ready,true,target); assert.equal(e.state.seat,null);
 }
 e.dispatch({type:'interact'});assert.equal(e.state.seat,'desk');assert.equal(e.state.player.z,3.25);
 e.dispatch({type:'move',point:{x:2,z:-4}});advance(e,15);clear(e);assert.equal(e.state.seat,null);assert.ok(Math.abs(e.state.player.z+4)<.3);
});
test('distance attack is ignored and weapon intervals prevent repeated hit duplication',()=>{
 const e=enter();e.dispatch({type:'attack'});assert.equal(e.state.lastHit,null);
 arrived(e,'boss');e.dispatch({type:'attack'});assert.equal(e.getSnapshot().lastHit?.id,1);
 e.dispatch({type:'attack'});assert.equal(e.getSnapshot().lastHit?.id,1);advance(e,.35);e.dispatch({type:'attack'});assert.equal(e.getSnapshot().lastHit?.id,2);
 for(let i=0;i<100;i++){advance(e,.31);e.dispatch({type:'attack'});}clear(e);assert.ok(e.state.boss.x>=-8.6&&e.state.boss.x<=8.6);assert.ok(e.state.boss.z>=-5.6&&e.state.boss.z<=5.6);
});
test('boss gives a grace window, work cancels it, and observations have cooldown',()=>{
 const e=enter();arrived(e,'desk');e.dispatch({type:'interact'});e.dispatch({type:'desk',mode:'shopping'});
 for(let i=0;i<600&&!e.state.warning;i++) e.step(.05);
 assert.ok(e.state.warning>0);advance(e,1);assert.equal(e.state.scold,0);
 e.dispatch({type:'desk',mode:'work'});assert.equal(e.state.warning,0);
 e.dispatch({type:'desk',mode:'game'});advance(e,15);assert.equal(e.state.warning,0);assert.equal(e.state.scold,0);
 for(let i=0;i<1000&&!e.state.warning;i++)e.step(.05);
 assert.ok(e.state.warning>0);advance(e,2.1);assert.ok(e.state.scold>0);assert.equal(e.state.event?.kind,'caught');advance(e,3.1);assert.equal(e.state.scold,0);
});
test('hits interrupt observations and grant recovery immunity',()=>{
 const e=enter();arrived(e,'desk');e.dispatch({type:'interact'});e.dispatch({type:'desk',mode:'sleep'});
 for(let i=0;i<600&&!e.state.warning;i++)e.step(.05);
 assert.ok(e.state.warning>0);e.dispatch({type:'attack'});assert.equal(e.state.warning,0);assert.equal(e.state.scold,0);assert.equal(e.state.bossPhase,'hit');
 advance(e,2.1);assert.notEqual(e.state.bossPhase,'hit');advance(e,9);assert.equal(e.state.warning,0);
});
test('coffee and snacks complete once, respect capacity, and cancellation grants nothing',()=>{
 const e=enter();arrived(e,'coffee');e.dispatch({type:'interact'});advance(e,1);e.dispatch({type:'cancel'});advance(e,4);assert.equal(e.state.inventory.coffee,0);
 e.dispatch({type:'select',target:'coffee'});e.dispatch({type:'interact'});advance(e,1);e.dispatch({type:'interact'});advance(e,2.1);assert.equal(e.state.inventory.coffee,3);
 e.dispatch({type:'drink'});e.dispatch({type:'drink'});advance(e,.8);assert.equal(e.state.inventory.coffee,2);assert.equal(e.state.event?.kind,'sip');
 arrived(e,'snacks');for(let i=0;i<7;i++){e.dispatch({type:'take',snack:'cookie'});e.dispatch({type:'take',snack:'cookie'});advance(e,.8);}assert.equal(e.state.inventory.cookie,6);
 e.dispatch({type:'eat',snack:'cookie'});e.dispatch({type:'eat',snack:'cookie'});advance(e,.9);assert.equal(e.state.inventory.cookie,5);
 e.dispatch({type:'take',snack:'choco'});e.dispatch({type:'axis',x:1,z:0});advance(e,1);assert.equal(e.state.inventory.choco,0);
});
test('paused and entry screens never advance; snapshots are cached and subscriptions stop on dispose',()=>{
 const e=createGameEngine();e.step(10);assert.equal(e.state.elapsed,0);e.dispatch({type:'enter'});const a=e.getSnapshot();assert.equal(a,e.getSnapshot());
 let changes=0;e.subscribe(()=>changes++);e.step(.01);assert.equal(a,e.getSnapshot());e.step(.1);assert.notEqual(a,e.getSnapshot());assert.equal(a.elapsed,0);
 e.dispatch({type:'pause',value:true});const elapsed=e.state.elapsed;advance(e,4);assert.equal(e.state.elapsed,elapsed);const count=changes;e.dispose();e.dispatch({type:'pause',value:false});e.step(1);assert.equal(changes,count);
});
test('exit clears transients but keeps choices and snacks; reset clears all choices',()=>{
 const e=enter();e.dispatch({type:'weapon',weapon:'fan'});e.state.inventory.cookie=2;e.state.inventory.coffee=3;e.dispatch({type:'exit'});assert.equal(e.state.entered,false);assert.equal(e.state.inventory.cookie,2);assert.equal(e.state.inventory.coffee,0);assert.equal(e.state.weapon,'fan');
 e.dispatch({type:'reset'});assert.equal(e.state.weapon,'punch');assert.equal(e.state.inventory.cookie,0);assert.equal(e.state.name,'김사원');assert.equal(e.state.event,null);
});
test('boss keeps patrolling while the player works and never observes the pantry',()=>{
 const e=enter();arrived(e,'desk');e.dispatch({type:'interact'});
 let returnedAcrossOffice=false;
 for(let i=0;i<1100;i++){e.step(.05);if(e.state.elapsed>30&&e.state.boss.x < -4)returnedAcrossOffice=true;}
 assert.equal(returnedAcrossOffice,true);
 arrived(e,'lounge');e.dispatch({type:'interact'});advance(e,65);assert.equal(e.state.warning,0);assert.equal(e.state.scold,0);
});
test('manual motion slides along obstacles and remains inside boundaries',()=>{
 const e=enter();
 for(const axis of [{x:0,z:-1},{x:1,z:0},{x:1,z:-1},{x:-1,z:1},{x:0,z:1}]){
  e.dispatch({type:'axis',...axis});for(let i=0;i<400;i++){e.step(.05);clear(e);}
 }
 e.dispatch({type:'axis',x:0,z:0});e.step(.05);assert.equal(e.state.player.moving,false);
});
test('seated actors face their desks and lounge rather than facing away',()=>{
 const e=enter();
 const facesDesk=()=>{
  for(const person of e.state.coworkers){
   const desk=DESKS.find(d=>d.owner===person.id)!;
   assert.ok(Math.sin(person.angle)*(desk.x-person.x)+Math.cos(person.angle)*(desk.z-person.z)>.9,person.id);
  }
 };
 facesDesk();advance(e,.1);facesDesk();
 arrived(e,'desk');e.dispatch({type:'interact'});assert.ok(Math.cos(e.state.player.angle)<-.99);
 e.dispatch({type:'desk',mode:'sleep'});assert.ok(Math.cos(e.state.player.angle)<-.99);
 e.dispatch({type:'spin'});advance(e,1.2);assert.ok(Math.cos(e.state.player.angle)<-.99);
 arrived(e,'lounge');e.dispatch({type:'interact'});assert.ok(Math.cos(e.state.player.angle)<-.99);
 e.dispatch({type:'interact'});advance(e,.1);assert.equal(e.state.player.pose,'lean');assert.ok(Math.cos(e.state.player.angle)<-.99);
});
test('React snapshot and subscription functions work without a receiver',()=>{
 const e=createGameEngine();const {getSnapshot,subscribe}=e;let notifications=0;
 const initial=getSnapshot();const unsubscribe=subscribe(()=>notifications++);
 e.dispatch({type:'enter'});assert.equal(getSnapshot().entered,true);assert.notEqual(getSnapshot(),initial);assert.equal(notifications,1);
 unsubscribe();e.dispatch({type:'pause',value:true});assert.equal(notifications,1);assert.equal(getSnapshot().paused,true);
});
test('cancel clears the selected boss so following cannot restart on a later frame',()=>{
 const e=enter();e.dispatch({type:'select',target:'boss'});advance(e,.3);e.dispatch({type:'cancel'});
 assert.equal(e.state.target,null);assert.equal(e.state.ready,false);assert.equal(e.state.destination,null);
 const stopped={x:e.state.player.x,z:e.state.player.z};advance(e,8);
 assert.deepEqual({x:e.state.player.x,z:e.state.player.z},stopped);assert.equal(e.state.player.moving,false);
});
for(const activity of ['spin','eat','drink'] as const) test(`returning to work interrupts ${activity} during the boss grace window without consuming inventory`,()=>{
 const e=enter();
 if(activity==='eat'){arrived(e,'snacks');e.dispatch({type:'take',snack:'cookie'});advance(e,.8);}
 if(activity==='drink'){arrived(e,'coffee');e.dispatch({type:'interact'});advance(e,3.1);}
 arrived(e,'desk');e.dispatch({type:'interact'});e.dispatch({type:'desk',mode:'game'});
 for(let i=0;i<1200&&!e.state.warning;i++)e.step(.05);assert.ok(e.state.warning>0);
 if(activity==='eat')e.dispatch({type:'eat',snack:'cookie'});else e.dispatch({type:activity});
 advance(e,.1);assert.equal(e.state.activity?.kind,activity);
 e.dispatch({type:'desk',mode:'work'});
 assert.equal(e.state.activity,null);assert.equal(e.state.deskMode,'work');assert.equal(e.state.warning,0);assert.equal(e.state.scold,0);
 advance(e,4);assert.equal(e.state.inventory.cookie,activity==='eat'?1:0);assert.equal(e.state.inventory.coffee,activity==='drink'?3:0);assert.notEqual(e.state.event?.kind,'caught');
});
