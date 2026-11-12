import test from 'node:test';
import assert from 'node:assert/strict';
import { createMultiController } from './multi-controller.ts';
import { createMultiLayout, isMultiWalkable } from './multi-layout.ts';
import type { RoomPlayer, RoomSnapshot } from './multi-types.ts';
import { MULTI_LOUNGE_SEATS, ROOF_BENCH_SEATS } from './rest-seats.ts';

const visual = { floor:'office' as const,seat:null,deskMode:null,roofRest:null,roofWallSide:null,candyInMouth:false,activity:null,weapon:'punch' as const,elapsed:0,lastHit:null,carryingCoffee:false };
const member = (capacity: number, seatIndex: number): RoomPlayer => ({...visual,id:'local',name:'김사원',seatIndex,lastSeen:0,...createMultiLayout(capacity).spawn,angle:0,pose:'idle',moving:false});
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
  let sawBrew=false;
  for(let i=0;i<1200;i++){c.step(1/30);sawBrew ||= String(c.player.pose)==='brew';}
  assert.ok(sawBrew);assert.equal(c.player.pose,'idle');assert.equal(c.engine.state.inventory.coffee,3);
  c.engine.dispatch({type:'drink'});assert.equal(c.player.pose,'drink');
  for(let i=0;i<80;i++)c.step(1/30);
  assert.equal(c.engine.state.inventory.coffee,2);assert.equal(c.player.pose,'idle');
});


const advance = (c: ReturnType<typeof createMultiController>, seconds: number) => { for (let time=0;time<seconds;time+=.05)c.step(.05); };
const arrive = (c: ReturnType<typeof createMultiController>, target: 'coffee'|'snacks'|'boss'|'desk'|'lounge'|'copier') => {
  c.engine.dispatch({type:'select',target});
  for(let i=0;i<1800&&!c.engine.state.ready;i++)c.step(.05);
  assert.ok(c.engine.state.ready,`arrive ${target}`);
  while(c.player.moving)c.step(.05);
};
const sharedPlayer = (c: ReturnType<typeof createMultiController>): RoomPlayer => ({...c.player,...c.serializePlayer()});
const roomSnapshot = (host: ReturnType<typeof createMultiController>, guest?: ReturnType<typeof createMultiController>, now=1000): RoomSnapshot => ({
  room:{code:'ABCDEFGH',name:'우리 회사',capacity:host.layout.capacity,hostId:host.player.id,expiresAt:999999},selfId:guest?.player.id??host.player.id,
  players:[sharedPlayer(host),...(guest?[sharedPlayer(guest)]:[])],messages:[],notifications:[],serverTime:now,
  boss:{actor:{...host.engine.state.boss},phase:host.engine.state.bossPhase,lastHit:null,updatedAt:now},
});

test('occupied chairs are avoided and generic rest selects a different free chair', () => {
  const host = createMultiController({ ...member(4, 0), id: 'host' }, 4);
  const guest = createMultiController({ ...member(4, 1), id: 'guest' }, 4);
  arrive(host, 'lounge'); host.engine.dispatch({ type: 'interact' });
  guest.applySnapshot(roomSnapshot(host, guest));
  guest.engine.dispatch({ type: 'select', target: 'lounge', point: MULTI_LOUNGE_SEATS[0].seat });
  advance(guest, 1);
  assert.equal(guest.engine.state.seat, null); assert.match(guest.engine.state.message, /이미 동료/);
  arrive(guest, 'lounge'); guest.engine.dispatch({ type: 'interact' });
  assert.equal(guest.engine.state.restSeatId, 'lounge-east');
  assert.ok(Math.hypot(host.player.x - guest.player.x, host.player.z - guest.player.z) > .7);
});

test('a rejected optimistic seat rolls back beside the chair without cancelling later actions', () => {
  const initial = { ...member(4, 1), id: 'guest' };
  const host = createMultiController({ ...member(4, 0), id: 'host' }, 4), guest = createMultiController(initial, 4);
  for (const controller of [host, guest]) { arrive(controller, 'lounge'); controller.engine.dispatch({ type: 'interact' }); }
  const accepted = roomSnapshot(host); accepted.players.push(initial);
  guest.applySnapshot(accepted);
  assert.equal(guest.engine.state.seat, null); assert.equal(guest.engine.state.restSeatId, null);
  assert.deepEqual({ x: guest.player.x, z: guest.player.z }, MULTI_LOUNGE_SEATS[0].approach);
  assert.ok(Math.hypot(host.player.x - guest.player.x, host.player.z - guest.player.z) >= .79);
  arrive(guest, 'lounge'); guest.engine.dispatch({ type: 'interact' });
  assert.equal(guest.engine.state.restSeatId, 'lounge-east');
  assert.equal(guest.rejectRestSeat('lounge-south'), false);
  assert.equal(guest.engine.state.seat, 'lounge');
  assert.equal(guest.rejectRestSeat('lounge-east'), true);
  assert.deepEqual({ x: guest.player.x, z: guest.player.z }, MULTI_LOUNGE_SEATS[1].approach);
});

test('restored noncentral lounge and roof seats preserve their own location and exit', () => {
  for (const seat of [MULTI_LOUNGE_SEATS[3], ROOF_BENCH_SEATS[2]]) {
    const c = createMultiController({ ...member(4, 0), ...seat.seat, floor: seat.floor, restSeatId: seat.id,
      seat: seat.floor === 'office' ? 'lounge' : 'roof-bench', roofRest: seat.floor === 'rooftop' ? 'bench' : null, pose: 'sit' }, 4);
    assert.equal(c.serializePlayer().restSeatId, seat.id);
    assert.deepEqual({ x: c.player.x, z: c.player.z }, seat.seat);
    c.stand(); assert.deepEqual({ x: c.player.x, z: c.player.z }, seat.approach);
  }
});

test('multiplayer uses the full pantry, desk activities and all three boss tools',()=>{
  const c=createMultiController(member(16,15),16),e=c.engine;
  arrive(c,'coffee');e.dispatch({type:'interact'});advance(c,3.3);assert.equal(e.state.inventory.coffee,3);
  assert.ok(e.state.player.angle<0,'face coffee cabinet to the left');
  arrive(c,'snacks');e.dispatch({type:'take',snack:'choco'});advance(c,1.4);assert.equal(e.state.inventory.choco,1);
  e.dispatch({type:'eat',snack:'choco'});advance(c,1.6);assert.equal(e.state.inventory.choco,0);
  arrive(c,'desk');e.dispatch({type:'interact'});
  for(const mode of ['shopping','game','sleep','work'] as const){e.dispatch({type:'desk',mode});assert.equal(e.state.deskMode,mode);}
  e.dispatch({type:'spin'});assert.equal(e.state.player.pose,'spin');advance(c,2.1);assert.equal(e.state.player.pose,'type');
  arrive(c,'boss');
  for(const weapon of ['punch','hammer','fan'] as const){e.dispatch({type:'weapon',weapon});e.dispatch({type:'attack'});assert.equal(e.state.lastHit?.weapon,weapon);assert.equal(e.state.player.pose,'hit');advance(c,1);}
  const wire=c.serializePlayer();assert.equal('inventory' in wire,false);assert.equal('settings' in wire,false);assert.equal(wire.carryingCoffee,true);
});

test('multiplayer has the same roof bench, four continuous walls, candy and return journey',()=>{
  const c=createMultiController(member(8,3),8),e=c.engine;
  const start={x:c.player.x,z:c.player.z};
  e.dispatch({type:'travel',floor:'rooftop'});advance(c,1.7);assert.equal(e.state.floor,'rooftop');
  e.dispatch({type:'rest',place:'bench'});advance(c,12);assert.equal(e.state.seat,'roof-bench');
  e.dispatch({type:'candy'});advance(c,1.3);assert.equal(e.state.candyInMouth,true);assert.equal(c.serializePlayer().seat,'roof-bench');
  for(const wall of ['north','south','east','west'] as const){e.dispatch({type:'rest',place:'wall',wall});advance(c,25);assert.equal(e.state.roofWallSide,wall);assert.equal(e.state.roofRest,'wall');}
  e.dispatch({type:'travel',floor:'office'});advance(c,1.7);assert.equal(e.state.floor,'office');assert.equal(e.state.candyInMouth,false);
  assert.deepEqual({x:c.player.x,z:c.player.z},start);
});

test('room host keeps the shared boss alive from the roof and a guest can approach and strike',()=>{
  const host=createMultiController({...member(8,0),id:'host'},8),guest=createMultiController({...member(8,1),id:'guest'},8);
  let now=1000;
  const sync=()=>{const snapshot=roomSnapshot(host,guest,now+=200);host.applySnapshot(snapshot);guest.applySnapshot(snapshot);};sync();
  assert.equal(guest.serializeBoss(),undefined);assert.ok(host.serializeBoss());
  host.engine.dispatch({type:'travel',floor:'rooftop'});advance(host,1.7);
  const before={x:host.engine.state.boss.x,z:host.engine.state.boss.z};advance(host,3);
  assert.notDeepEqual({x:host.engine.state.boss.x,z:host.engine.state.boss.z},before);
  sync();guest.engine.dispatch({type:'select',target:'boss'});
  for(let i=0;i<1200&&!guest.engine.state.ready;i++){host.step(.05);guest.step(.05);if(i%13===0)sync();}
  assert.equal(guest.engine.state.ready,true);guest.engine.dispatch({type:'weapon',weapon:'hammer'});guest.engine.dispatch({type:'attack'});
  assert.equal(guest.engine.state.lastHit?.weapon,'hammer');
  const snapshot=roomSnapshot(host,guest,now+200);snapshot.boss.lastHit={id:1,weapon:'hammer',at:now+100,playerId:'guest'};snapshot.boss.phase='hit';
  host.applySnapshot(snapshot);assert.equal(host.engine.state.bossPhase,'hit');assert.equal(host.engine.state.bossHit?.weapon,'hammer');assert.equal(host.engine.state.lastHit,null);
});

test('slacking guest gets the same private warning and can immediately return to work',()=>{
  const host=createMultiController({...member(8,0),id:'host'},8),guest=createMultiController({...member(8,1),id:'guest'},8);
  arrive(guest,'desk');guest.engine.dispatch({type:'interact'});guest.engine.dispatch({type:'desk',mode:'shopping'});
  host.engine.state.elapsed=12;guest.engine.state.elapsed=12;
  Object.assign(host.engine.state.boss,{x:guest.player.x-1.4,z:guest.player.z});
  let snapshot=roomSnapshot(host,guest,12000);host.applySnapshot(snapshot);guest.applySnapshot(snapshot);host.step(.05);
  assert.equal(host.engine.state.bossPhase,'watch');
  snapshot=roomSnapshot(host,guest,12100);guest.applySnapshot(snapshot);guest.step(.05);assert.equal(guest.engine.state.warning,2);
  guest.engine.dispatch({type:'desk',mode:'work'});assert.equal(guest.engine.state.warning,0);assert.equal(guest.engine.state.scold,0);
  snapshot=roomSnapshot(host,guest,12200);host.applySnapshot(snapshot);host.step(.05);assert.equal(host.engine.state.bossPhase,'routine');
});

test('host takeover adopts the shared boss and stale snapshots cannot move it backwards',()=>{
  const host=createMultiController({...member(8,0),id:'host'},8),guest=createMultiController({...member(8,1),id:'guest'},8);
  const older=roomSnapshot(host,guest,1000);guest.applySnapshot(older);
  const takeover=roomSnapshot(host,guest,2000);takeover.room.hostId='guest';takeover.boss.actor.x=-2.6;takeover.boss.actor.z=-3;
  guest.applySnapshot(takeover);assert.ok(guest.serializeBoss());assert.equal(guest.engine.state.boss.z,-3);
  guest.applySnapshot(older);assert.ok(guest.serializeBoss());assert.equal(guest.engine.state.boss.z,-3);
});


test('roof navigation and restored corner positions use the same clearance as solo and room validation',()=>{
  for(const x of [-8.68,8.68])for(const z of [-5.68,5.68]){
    const c=createMultiController({...member(8,0),floor:'rooftop',x,z},8);
    c.engine.dispatch({type:'rest',place:'wall',wall:x<0?'west':'east'});
    advance(c,10);assert.equal(c.engine.state.roofRest,'wall',`rest from ${x},${z}`);
    c.engine.dispatch({type:'move',point:{x,z}});advance(c,10);
    assert.ok(Math.abs(c.player.x-x)<1e-6&&Math.abs(c.player.z-z)<1e-6,`reach legal roof corner ${x},${z}`);
    c.engine.dispatch({type:'axis',x:x<0?1:-1,z:0});advance(c,.1);c.engine.dispatch({type:'axis',x:0,z:0});
    assert.ok(Math.abs(c.player.x)<Math.abs(x),'manual movement also accepts roof edge points');
  }
});
