import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameEngine } from './engine.ts';
import { ROOF_BOUNDS, ROOF_OBSTACLES, ROOF_REST, ROOF_WALLS } from './layout.ts';
import { getRoofLean } from './roof-rest.ts';
import type { RoofWallSide } from './types.ts';

const enter = () => { const e = createGameEngine(); e.dispatch({type:'enter'}); return e; };
test('floor travel swaps once at midpoint, locks commands and returns to the departure point', () => {
  const e=enter(), start={x:e.state.player.x,z:e.state.player.z};
  e.state.inventory.cookie=2;e.state.inventory.coffee=3;
  e.dispatch({type:'travel',floor:'rooftop'});
  assert.equal(e.state.floor,'office');assert.ok(e.state.transition);
  e.dispatch({type:'travel',floor:'office'});e.dispatch({type:'select',target:'boss'});e.dispatch({type:'axis',x:1,z:0});
  e.step(.7);assert.equal(e.state.floor,'office');assert.equal(e.state.target,null);
  e.step(.2);assert.equal(e.state.floor,'rooftop');assert.deepEqual({x:e.state.player.x,z:e.state.player.z},{x:0,z:2.4});
  e.step(1);assert.equal(e.state.transition,null);
  const boss=structuredClone(e.state.boss);e.step(12);assert.deepEqual(e.state.boss,boss);
  e.dispatch({type:'travel',floor:'office'});e.step(2);
  assert.equal(e.state.floor,'office');assert.deepEqual({x:e.state.player.x,z:e.state.player.z},start);
  assert.equal(e.state.inventory.cookie,2);assert.equal(e.state.inventory.coffee,3);
});
test('roof travel pauses, cancels unfinished consumption and resets cleanly on exit', () => {
  const e=enter();e.state.inventory.cookie=1;e.dispatch({type:'eat',snack:'cookie'});e.step(.3);
  e.dispatch({type:'travel',floor:'rooftop'});assert.equal(e.state.activity,null);assert.equal(e.state.inventory.cookie,1);
  const remaining=e.state.transition!.remaining;e.dispatch({type:'pause',value:true});e.step(10);
  assert.equal(e.state.transition!.remaining,remaining);e.dispatch({type:'pause',value:false});e.step(2);
  e.dispatch({type:'travel',floor:'office'});e.dispatch({type:'exit'});
  assert.equal(e.state.floor,'office');assert.equal(e.state.transition,null);assert.equal(e.state.entered,false);
});
test('roof rejects office interactions, allows a candy break and keeps movement inside railings', () => {
  const e=enter();e.dispatch({type:'candy'});assert.equal(e.state.activity,null);
  e.dispatch({type:'travel',floor:'rooftop'});e.step(2);
  e.dispatch({type:'select',target:'coffee'});e.dispatch({type:'take',snack:'cookie'});e.dispatch({type:'attack'});
  assert.equal(e.state.target,null);assert.equal(e.state.activity,null);assert.equal(e.state.lastHit,null);
  e.dispatch({type:'candy'});assert.equal(e.state.player.pose,'candy');assert.equal(e.getSnapshot().activity?.duration,1.2);
  e.step(1.3);assert.equal(e.state.activity,null);assert.equal(e.state.player.pose,'idle');assert.equal(e.state.candyInMouth,true);assert.match(e.state.message,/사탕|마음|오늘/);
  e.dispatch({type:'move',point:{x:100,z:-100}});e.step(30);
  assert.ok(e.state.player.x<=ROOF_BOUNDS.maxX-.22+1e-8 && e.state.player.z>=ROOF_BOUNDS.minZ+.22-1e-8);
  e.dispatch({type:'axis',x:1,z:-1});e.step(30);
  assert.ok(e.state.player.x<=ROOF_BOUNDS.maxX-.22+1e-8 && e.state.player.z>=ROOF_BOUNDS.minZ+.22-1e-8);
  e.dispatch({type:'candy'});e.dispatch({type:'cancel'});assert.equal(e.state.activity,null);
});

const rooftop = () => { const e=enter(); e.dispatch({type:'travel',floor:'rooftop'});e.step(2);return e; };
test('generic leaning uses the nearest wall and preserves the current position along its full edge', () => {
  const e=rooftop();e.dispatch({type:'candy'});e.step(1.3);
  const samples=[{x:-3,z:-4.8,wall:'north'},{x:4,z:-4.8,wall:'north'},{x:3,z:4.8,wall:'south'},{x:-5,z:4.8,wall:'south'},{x:8.2,z:-3,wall:'east'},{x:8.2,z:1,wall:'east'},{x:-8.2,z:3,wall:'west'}] as const;
  for(const sample of samples){
    e.dispatch({type:'move',point:sample});e.step(20);
    const expected=getRoofLean(e.state.player)!;assert.equal(expected.wall,sample.wall);
    e.dispatch({type:'rest',place:'wall'});e.step(20);
    assert.equal(e.state.roofWallSide,sample.wall);assert.deepEqual(e.state.roofLeanPoint,expected.point);
    assert.deepEqual({x:e.state.player.x,z:e.state.player.z},expected.point);assert.equal(e.state.candyInMouth,true);
  }
});

test('clicking two places on the same wall preserves each clicked coordinate and cancels safely', () => {
  const e=rooftop();
  for(const x of [-5,2,6]){
    e.dispatch({type:'select',target:'roofWall',point:{x,z:-6}});e.step(20);
    assert.equal(e.state.player.x,x);assert.equal(e.state.player.z,-5.51);assert.equal(e.state.roofWallSide,'north');
  }
  e.dispatch({type:'select',target:'roofWallSouth',point:{x:-3,z:6}});e.step(.3);
  const destination=structuredClone(e.state.destination);e.dispatch({type:'pause',value:true});e.step(3);assert.deepEqual(e.state.destination,destination);
  e.dispatch({type:'pause',value:false});e.dispatch({type:'move',point:{x:0,z:0}});e.step(20);
  assert.equal(e.state.roofRest,null);assert.equal(e.state.roofLeanPoint,null);
  e.dispatch({type:'select',target:'roofWallEast',point:{x:NaN,z:1}});e.step(2);assert.equal(e.state.roofRest,null);
});

test('nearby interaction leans locally without selecting a direction and distant E never teleports', () => {
  const e=rooftop();e.dispatch({type:'move',point:{x:4,z:-4.9}});e.step(15);
  assert.equal(e.state.target,null);e.dispatch({type:'interact'});e.step(1);
  assert.equal(e.state.roofWallSide,'north');assert.equal(e.state.player.x,4);assert.equal(e.state.player.z,-5.51);
  e.dispatch({type:'stand'});assert.equal(e.state.roofLeanPoint,null);
  e.dispatch({type:'move',point:{x:0,z:0}});e.step(10);e.dispatch({type:'interact'});e.step(1);
  assert.equal(e.state.roofRest,null);assert.equal(e.state.destination,null);
});
test('bench and wall rest are reachable independent actions and candy persists between them', () => {
  const e=rooftop();
  e.dispatch({type:'rest',place:'bench'});assert.equal(e.state.roofRest,null);assert.ok(e.state.destination);
  e.step(5);assert.equal(e.state.roofRest,'bench');assert.equal(e.state.seat,'roof-bench');assert.equal(e.state.player.pose,'sit');
  assert.deepEqual({x:e.state.player.x,z:e.state.player.z},ROOF_REST.bench.seat);assert.equal(e.state.candyInMouth,false);
  e.dispatch({type:'candy'});e.step(.6);e.dispatch({type:'pause',value:true});e.step(3);
  assert.equal(e.state.candyInMouth,false);assert.equal(e.state.roofRest,'bench');
  e.dispatch({type:'pause',value:false});e.step(.7);assert.equal(e.state.candyInMouth,true);assert.equal(e.state.player.pose,'sit');
  e.dispatch({type:'rest',place:'wall'});assert.equal(e.state.seat,null);assert.equal(e.state.candyInMouth,true);
  e.step(5);assert.equal(e.state.roofRest,'wall');assert.equal(e.state.player.pose,'wallLean');assert.equal(e.state.player.angle,0);
  assert.deepEqual({x:e.state.player.x,z:e.state.player.z},{x:ROOF_REST.bench.seat.x,z:-5.51});
  e.dispatch({type:'candy'});assert.equal(e.state.candyInMouth,false);assert.equal(e.state.player.pose,'wallLean');
  e.dispatch({type:'candy'});e.step(1.3);assert.equal(e.state.candyInMouth,true);assert.equal(e.state.player.pose,'wallLean');
  e.dispatch({type:'stand'});assert.equal(e.state.roofRest,null);assert.equal(e.state.player.pose,'idle');assert.equal(e.state.candyInMouth,true);
});

test('bench exit always returns to a walkable approach and pending rest cancels on movement', () => {
  const e=rooftop();e.dispatch({type:'rest',place:'bench'});e.step(5);
  e.dispatch({type:'axis',x:1,z:0});assert.deepEqual({x:e.state.player.x,z:e.state.player.z},ROOF_REST.bench.point);
  e.step(.3);assert.ok(e.state.player.x>ROOF_REST.bench.point.x);assert.equal(e.state.seat,null);
  e.dispatch({type:'rest',place:'wall'});e.step(.3);e.dispatch({type:'move',point:{x:0,z:0}});e.step(6);
  assert.equal(e.state.roofRest,null);assert.equal(e.state.player.pose,'idle');
  e.dispatch({type:'rest',place:'bench'});e.dispatch({type:'cancel'});e.step(6);assert.equal(e.state.roofRest,null);
});

test('roof objects can be selected and interacted with only on their own floor', () => {
  const e=enter();e.dispatch({type:'select',target:'roofBench'});e.dispatch({type:'rest',place:'wall'});
  assert.equal(e.state.target,null);assert.equal(e.state.roofRest,null);
  e.dispatch({type:'travel',floor:'rooftop'});e.step(2);
  for(const [target,place] of [['roofBench','bench'],['roofWall','wall']] as const){
    e.dispatch({type:'select',target});e.step(5);assert.equal(e.state.ready,true);assert.equal(e.state.roofRest,place==='wall'?'wall':null);
    e.dispatch({type:'interact'});assert.equal(e.state.roofRest,place);
  }
});

test('all four outer walls are reachable without crossing rooftop furniture and keep held candy', () => {
  const e=rooftop(); e.dispatch({type:'candy'});e.step(1.3);
  const sides=Object.keys(ROOF_WALLS) as RoofWallSide[];
  for (const from of sides) for(const to of sides){
    e.dispatch({type:'rest',place:'wall',wall:from});e.step(15);
    const expected=getRoofLean(e.state.player,to)!;
    e.dispatch({type:'rest',place:'wall',wall:to});
    for(let i=0;i<300;i++){
      e.step(.05);const p=e.state.player;
      assert.ok(!ROOF_OBSTACLES.some(o=>Math.abs(p.x-o.x)<o.w/2+.22-1e-6&&Math.abs(p.z-o.z)<o.d/2+.22-1e-6),`${from} -> ${to} must not cross furniture at ${p.x},${p.z}`);
    }
    assert.equal(e.state.roofRest,'wall');assert.equal(e.state.roofWallSide,to);assert.equal(e.state.player.pose,'wallLean');
    assert.equal(e.state.player.angle,ROOF_WALLS[to].angle);assert.equal(e.state.candyInMouth,true);
    assert.deepEqual({x:e.state.player.x,z:e.state.player.z},expected.point);
  }
  e.dispatch({type:'stand'});assert.equal(e.state.roofWallSide,null);
  e.dispatch({type:'travel',floor:'office'});e.step(2);e.dispatch({type:'rest',place:'wall',wall:'east'});
  assert.equal(e.state.roofWallSide,null);assert.equal(e.state.destination,null);
});

test('every wall click walks and leans, while manual motion and floor travel clear wall selection', () => {
  const e=rooftop();
  for(const side of Object.keys(ROOF_WALLS) as RoofWallSide[]){
    e.dispatch({type:'select',target:ROOF_WALLS[side].target});e.step(15);
    assert.equal(e.state.roofWallSide,side);assert.equal(e.state.ready,true);
    e.dispatch({type:'axis',x:.2,z:.2});e.step(.1);e.dispatch({type:'axis',x:0,z:0});
    assert.equal(e.state.roofRest,null);assert.equal(e.state.roofWallSide,null);
  }
  e.dispatch({type:'rest',place:'wall',wall:'south'});e.step(.2);e.dispatch({type:'travel',floor:'office'});e.step(2);
  assert.equal(e.state.roofRest,null);assert.equal(e.state.roofWallSide,null);
});

test('walking into the narrow outer planter corridor can still route back to every rest spot', () => {
  const e=rooftop();
  for (const side of ['west','east'] as const) {
    e.dispatch({type:'rest',place:'wall',wall:side});e.step(15);
    e.dispatch({type:'axis',x:side==='west'?-1:1,z:0});e.step(.06);
    e.dispatch({type:'axis',x:0,z:-1});e.step(.7);e.dispatch({type:'axis',x:0,z:0});
    assert.ok(Math.abs(e.state.player.x)>8.6);assert.ok(Number.isFinite(e.state.player.z));
    e.dispatch({type:'rest',place:'wall',wall:'south'});assert.ok(e.state.destination,'outer corridor must connect to navigation');
    e.step(20);assert.equal(e.state.roofWallSide,'south');
    e.dispatch({type:'rest',place:'bench'});e.step(20);assert.equal(e.state.seat,'roof-bench');
  }
  for (const direction of [-1,1]) {
    e.dispatch({type:'move',point:{x:0,z:4}});e.step(20);
    e.dispatch({type:'rest',place:'wall',wall:'south'});e.step(20);
    e.dispatch({type:'axis',x:0,z:1});e.step(.06);
    e.dispatch({type:'axis',x:direction,z:0});e.step(3);e.dispatch({type:'axis',x:0,z:0});
    assert.ok(e.state.player.z>5.62);assert.ok(Math.abs(e.state.player.x)>7.7);
    e.dispatch({type:'rest',place:'wall',wall:'north'});assert.ok(e.state.destination,'corridor below the last planter row must connect');
    e.step(20);assert.equal(e.state.roofWallSide,'north');
  }
});

test('unfinished candy cancels, food clears the mouth, and leaving or resetting clears roof state', () => {
  const e=rooftop();e.dispatch({type:'rest',place:'wall'});e.step(5);
  e.dispatch({type:'candy'});e.step(.4);e.dispatch({type:'cancel'});e.step(2);
  assert.equal(e.state.candyInMouth,false);assert.equal(e.state.roofRest,'wall');assert.equal(e.state.player.pose,'wallLean');
  e.dispatch({type:'candy'});e.step(1.3);e.state.inventory.cookie=1;e.dispatch({type:'eat',snack:'cookie'});
  assert.equal(e.state.candyInMouth,false);e.step(1.6);assert.equal(e.state.roofRest,'wall');
  e.dispatch({type:'candy'});e.step(1.3);e.dispatch({type:'travel',floor:'office'});
  assert.equal(e.state.candyInMouth,false);assert.equal(e.state.roofRest,null);assert.equal(e.state.seat,null);
  e.step(2);assert.equal(e.state.floor,'office');e.dispatch({type:'rest',place:'bench'});assert.equal(e.state.destination,null);
  e.dispatch({type:'travel',floor:'rooftop'});e.step(2);e.dispatch({type:'rest',place:'bench'});e.step(5);
  e.dispatch({type:'candy'});e.step(1.3);e.dispatch({type:'reset'});
  assert.equal(e.state.candyInMouth,false);assert.equal(e.state.roofRest,null);assert.equal(e.state.seat,null);
});
test('reduced-motion travel completes quickly and repeated visits keep inventory and floor consistent', () => {
  const e=enter();e.dispatch({type:'settings',value:{reducedMotion:true}});
  for(let i=0;i<4;i++){
    e.dispatch({type:'travel',floor:'rooftop'});assert.equal(e.state.transition?.duration,.4);e.step(.5);
    assert.equal(e.state.floor,'rooftop');assert.equal(e.state.transition,null);
    e.dispatch({type:'travel',floor:'office'});e.step(.5);assert.equal(e.state.floor,'office');
  }
  assert.equal(e.state.inventory.cookie,0);assert.equal(e.state.seat,null);
});
