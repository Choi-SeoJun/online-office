import test from 'node:test';
import assert from 'node:assert/strict';
import { createMultiController } from './multi-controller.ts';
import { createMultiLayout, isMultiWalkable } from './multi-layout.ts';
import type { RoomPlayer } from './multi-types.ts';

const member = (capacity: number, seatIndex: number): RoomPlayer => ({id:'local',name:'김사원',seatIndex,lastSeen:0,...createMultiLayout(capacity).spawn,angle:0,pose:'idle',moving:false});
test('every room size can walk to its own assigned seat and type without crossing furniture',()=>{
  for(let capacity=2;capacity<=16;capacity++) for(let seat=0;seat<capacity;seat++) {
    const c=createMultiController(member(capacity,seat),capacity); c.sit(true);
    for(let i=0;i<1800;i++) { c.step(1/30); assert.ok(isMultiWalkable(c.layout,c.player),`collision ${capacity}/${seat}`); if(c.player.pose==='type') break; }
    assert.equal(c.player.pose,'type',`arrive ${capacity}/${seat}`);
    assert.ok(Math.hypot(c.player.x-c.layout.desks[seat].seat.x,c.player.z-c.layout.desks[seat].seat.z)<.05);
  }
});
test('manual movement cancels seat arrival and does not walk through room bounds',()=>{
  const c=createMultiController(member(8,0),8); c.sit(); c.setAxis({x:-1,z:0});
  for(let i=0;i<400;i++) { c.step(.05); assert.ok(isMultiWalkable(c.layout,c.player)); }
  c.setAxis({x:0,z:0});c.step(.05); assert.equal(c.player.pose,'idle');
});
test('capacity change preserves valid player location and seat assignment',()=>{
  const c=createMultiController(member(4,1),4), before={x:c.player.x,z:c.player.z};
  c.setLayout(16,1); assert.deepEqual({x:c.player.x,z:c.player.z},before); assert.equal(c.layout.capacity,16); assert.equal(c.player.seatIndex,1);
});
test('restoring a transient coffee pose never leaves the avatar drinking forever',()=>{
  const c=createMultiController({...member(8,0),pose:'drink'},8);
  for(let i=0;i<600;i++)c.step(1/30);
  assert.equal(c.player.pose,'idle');
  c.coffee();
  let sawDrink=false;
  for(let i=0;i<1200;i++){c.step(1/30);sawDrink ||= String(c.player.pose)==='drink';}
  assert.ok(sawDrink);assert.equal(c.player.pose,'idle');
});
