import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameEngine } from './engine.ts';

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
  e.dispatch({type:'candy'});assert.equal(e.state.player.pose,'candy');assert.equal(e.getSnapshot().activity?.duration,5);
  e.step(5.1);assert.equal(e.state.activity,null);assert.equal(e.state.player.pose,'idle');assert.match(e.state.message,/사탕|마음|오늘/);
  e.dispatch({type:'move',point:{x:100,z:-100}});e.step(30);
  assert.ok(e.state.player.x<=6.58+1e-8 && e.state.player.z>=-4.08-1e-8);
  e.dispatch({type:'axis',x:1,z:-1});e.step(30);
  assert.ok(e.state.player.x<=6.58+1e-8 && e.state.player.z>=-4.08-1e-8);
  e.dispatch({type:'candy'});e.dispatch({type:'cancel'});assert.equal(e.state.activity,null);
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
