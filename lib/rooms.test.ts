import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { handleRoomAction, type RoomDatabase } from './rooms.ts';
import { createMultiLayout } from '../game/multi-layout.ts';
import type { RoomSession, RoomSnapshot } from '../game/multi-types.ts';
import { ROOF_REST, ROOF_WALLS } from '../game/layout.ts';
import { createMultiController } from '../game/multi-controller.ts';
import type { Command, TargetId } from '../game/types.ts';
import { MULTI_LOUNGE_SEATS, ROOF_BENCH_SEATS } from '../game/rest-seats.ts';

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('../drizzle', import.meta.url)).filter(x => x.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const wrap = (query: string, values: (string | number | null)[] = []) => ({
    query,
    bind(...next: (string | number | null)[]) { assert.ok(next.length <= 100, `D1 permits at most 100 bound parameters; query used ${next.length}`); return wrap(query, next); },
    async all() { return { success: true, results: sql.prepare(query).all(...values), meta: { changes: Number(sql.prepare('SELECT changes() AS n').get()!.n) } }; },
    async first() { return sql.prepare(query).get(...values) ?? null; },
    async run() { const result = sql.prepare(query).run(...values); return { success: true, results: [], meta: { changes: Number(result.changes) } }; },
    execute() { return { success: true, results: sql.prepare(query).all(...values), meta: { changes: Number(sql.prepare('SELECT changes() AS n').get()!.n) } }; },
  });
  let interleaving: { query: string; run: () => Promise<void> } | null = null;
  const db = { prepare: wrap, async batch(statements: ReturnType<typeof wrap>[]) {
    if (interleaving && statements.some(statement => statement.query.includes(interleaving!.query))) {
      const run = interleaving.run; interleaving = null; await run();
    }
    sql.exec('BEGIN'); try { const results = statements.map(s => s.execute()); sql.exec('COMMIT'); return results; } catch (error) { sql.exec('ROLLBACK'); throw error; }
  } } as unknown as RoomDatabase;
  let now = 1_000_000;
  const send = (input: unknown, key = 'visitor') => handleRoomAction(db, input, { now, rateKey: key });
  const advance = (ms: number) => { now += ms; };
  const create = async (capacity = 4) => {
    const r = await send({ action: 'create', name: '김사원', roomName: '우리 회사', capacity });
    assert.equal(r.status, 201); return r.body as { session: RoomSession; snapshot: RoomSnapshot };
  };
  return { sql, send, advance, create, beforeNextBatch(query: string, run: () => Promise<void>) { interleaving = { query, run }; } };
}

test('concurrent lounge occupancy admits one member and rejects the other atomically', async () => {
  const f = fixture(), host = await f.create();
  const guest = (await f.send({ action: 'join', code: host.session.code, name: '이사원' })).body as { session: RoomSession; snapshot: RoomSnapshot };
  const seated = { ...host.snapshot.players[0], ...createMultiLayout(4).lounge, seat: 'lounge', restSeatId: 'lounge-south', pose: 'sit' };
  const results = await Promise.all([host, guest].map(({ session }) => f.send({ action: 'sync', ...session, player: seated })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal((results.find(result => result.status === 409)!.body as { code: string }).code, 'SEAT_TAKEN');
  const rows = f.sql.prepare("SELECT id FROM office_members WHERE json_extract(visual, '$.seat') = 'lounge'").all();
  assert.equal(rows.length, 1);
});

test('distinct rest seats coexist, release on standing or departure, and remain room-local', async () => {
  const f = fixture(), host = await f.create(4);
  const guest = (await f.send({ action: 'join', code: host.session.code, name: '이사원' })).body as { session: RoomSession; snapshot: RoomSnapshot };
  const otherRoom = await f.create(4);
  const seated = (seat = MULTI_LOUNGE_SEATS[0]) => ({ ...host.snapshot.players[0], ...seat.seat, angle: seat.angle,
    floor: seat.floor, seat: seat.floor === 'office' ? 'lounge' : 'roof-bench', restSeatId: seat.id,
    roofRest: seat.floor === 'rooftop' ? 'bench' : null, pose: 'sit' });
  assert.equal((await f.send({ action: 'sync', ...host.session, player: seated() })).status, 200);
  assert.equal((await f.send({ action: 'sync', ...guest.session, player: seated(MULTI_LOUNGE_SEATS[1]) })).status, 200);
  assert.equal((await f.send({ action: 'sync', ...otherRoom.session, player: seated() })).status, 200);
  f.advance(300);
  assert.equal((await f.send({ action: 'sync', ...guest.session, player: seated() })).status, 409);
  assert.equal((await f.send({ action: 'sync', ...host.session, player: host.snapshot.players[0] })).status, 200);
  assert.equal((await f.send({ action: 'sync', ...guest.session, player: seated() })).status, 200);
  assert.equal((await f.send({ action: 'leave', ...guest.session })).status, 200);
  f.advance(300);
  assert.equal((await f.send({ action: 'sync', ...host.session, player: seated() })).status, 200);
  f.advance(300);
  const roof = seated(ROOF_BENCH_SEATS[1]);
  assert.equal((await f.send({ action: 'sync', ...host.session, player: roof })).status, 200);
  const third = (await f.send({ action: 'join', code: host.session.code, name: '박사원' })).body as { session: RoomSession; snapshot: RoomSnapshot };
  assert.equal((await f.send({ action: 'sync', ...third.session, player: roof })).status, 409);
  assert.equal((await f.send({ action: 'sync', ...third.session, player: seated(ROOF_BENCH_SEATS[2]) })).status, 200);
  f.advance(300);
  assert.equal((await f.send({ action: 'sync', ...host.session, player: { ...roof, restSeatId: 'lounge-south' } })).status, 400);
  assert.equal((await f.send({ action: 'sync', ...host.session, player: { ...roof, x: 0 } })).status, 400);
});

test('legacy clients infer the seat identity and cannot omit it to bypass occupancy', async () => {
  const f = fixture(), host = await f.create();
  const guest = (await f.send({ action: 'join', code: host.session.code, name: '이사원' })).body as { session: RoomSession; snapshot: RoomSnapshot };
  const seated = { ...host.snapshot.players[0], ...MULTI_LOUNGE_SEATS[0].seat, seat: 'lounge', restSeatId: undefined, pose: 'sit' };
  const accepted = await f.send({ action: 'sync', ...host.session, player: seated });
  assert.equal(accepted.status, 200);
  assert.equal((accepted.body as { snapshot: RoomSnapshot }).snapshot.players[0].restSeatId, 'lounge-south');
  assert.equal((await f.send({ action: 'sync', ...guest.session, player: seated })).status, 409);
});

test('expired chair leases release safely even when an earlier chat renews after the new claim', async () => {
  for (const seat of [MULTI_LOUNGE_SEATS[0], ROOF_BENCH_SEATS[1]]) {
    const f = fixture(), host = await f.create();
    const guest = (await f.send({ action: 'join', code: host.session.code, name: '이사원' })).body as { session: RoomSession; snapshot: RoomSnapshot };
    const seated = { ...host.snapshot.players[0], ...seat.seat, angle: seat.angle, floor: seat.floor,
      seat: seat.floor === 'office' ? 'lounge' : 'roof-bench', restSeatId: seat.id, roofRest: seat.floor === 'rooftop' ? 'bench' : null, pose: 'sit' };
    assert.equal((await f.send({ action: 'sync', ...host.session, player: seated })).status, 200);
    f.advance(119_999);
    f.beforeNextBatch('INSERT INTO office_messages', async () => {
      f.advance(2);
      assert.equal((await f.send({ action: 'sync', ...guest.session, player: seated })).status, 200);
    });
    const delayed = await f.send({ action: 'chat', ...host.session, text: '조금 늦게 도착한 인사' });
    assert.equal(delayed.status, 200);
    const players = (delayed.body as { snapshot: RoomSnapshot }).snapshot.players;
    const revived = players.find(player => player.id === host.session.playerId)!;
    assert.equal(revived.seat, null); assert.equal(revived.restSeatId, null); assert.equal(revived.pose, 'idle');
    assert.deepEqual({ x: revived.x, z: revived.z }, seat.approach);
    assert.equal(players.filter(player => player.restSeatId === seat.id).length, 1);
    assert.equal((await f.send({ action: 'sync', ...host.session, player: seated })).status, 409);
  }
});

test('shared office keeps full rooftop and pantry visual state without private inventories', async () => {
  const f=fixture(),host=await f.create();
  const own=host.snapshot.players[0];
  assert.equal(own.floor,'office');
  assert.equal(host.snapshot.boss.actor.name,'박부장');
  const roof={...own,...ROOF_REST.bench.seat,floor:'rooftop',pose:'sit',seat:'roof-bench',roofRest:'bench',candyInMouth:true,elapsed:12,inventory:{coffee:3,cookie:6},todos:['비밀 업무']};
  const result=await f.send({action:'sync',...host.session,player:roof});
  assert.equal(result.status,200);
  const remote=(result.body as {snapshot:RoomSnapshot}).snapshot.players[0];
  assert.equal(remote.floor,'rooftop');assert.equal(remote.roofRest,'bench');assert.equal(remote.candyInMouth,true);
  assert.equal('inventory' in remote,false);assert.equal('todos' in remote,false);
  f.advance(300);
  const wall={...roof,x:ROOF_WALLS.east.point.x,z:2.5,pose:'wallLean',seat:null,roofRest:'wall',roofWallSide:'east'};
  assert.equal((await f.send({action:'sync',...host.session,player:wall})).status,200);
  f.advance(300);
  assert.equal((await f.send({action:'sync',...host.session,player:{...wall,x:0}})).status,400);
  assert.equal((await f.send({action:'sync',...host.session,player:{...roof,z:0}})).status,400);
  const pantry={...own,...createMultiLayout(4).coffee,pose:'brew',activity:{kind:'brew',duration:3.2,remaining:1.7},elapsed:20,carryingCoffee:true};
  assert.equal((await f.send({action:'sync',...host.session,player:pantry})).status,200);
  f.advance(300);
  assert.equal((await f.send({action:'sync',...host.session,player:{...pantry,activity:{kind:'brew',duration:3.2,remaining:50}}})).status,400);
});

test('office resizing leaves rooftop visitors at their bench',async()=>{
  const f=fixture(),host=await f.create(16),own=host.snapshot.players[0];
  await f.send({action:'sync',...host.session,player:{...own,...ROOF_REST.bench.seat,floor:'rooftop',pose:'sit',seat:'roof-bench',roofRest:'bench',candyInMouth:true}});
  const resized=await f.send({action:'capacity',...host.session,capacity:2});
  assert.equal(resized.status,200);
  const player=(resized.body as {snapshot:RoomSnapshot}).snapshot.players[0];
  assert.equal(player.floor,'rooftop');assert.equal(player.seat,'roof-bench');assert.equal(player.z,ROOF_REST.bench.seat.z);
});

test('every supported capacity can be created and resized within D1 parameter limits',async()=>{
  const f=fixture(),host=await f.create(8);
  for(const capacity of [16,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,2]){
    const resized=await f.send({action:'capacity',...host.session,capacity});
    assert.equal(resized.status,200,`resize to ${capacity}`);
    assert.equal((resized.body as {snapshot:RoomSnapshot}).snapshot.room.capacity,capacity);
  }
  const minimum=await fixture().create(2),maximum=await fixture().create(16);
  assert.equal(minimum.snapshot.room.capacity,2);assert.equal(maximum.snapshot.room.capacity,16);
});

test('boss is host-owned but every nearby office member can trigger one shared reaction',async()=>{
  const f=fixture(),host=await f.create();
  const guest=(await f.send({action:'join',code:host.session.code,name:'이사원'})).body as {session:RoomSession;snapshot:RoomSnapshot};
  const boss=host.snapshot.boss,actor={...boss.actor,x:boss.actor.x+.3};
  assert.equal((await f.send({action:'sync',...guest.session,boss:{actor,phase:'routine'}})).status,403);
  const updated=await f.send({action:'sync',...host.session,boss:{actor:{...actor,name:'위조',id:'other'},phase:'routine'}});
  assert.equal(updated.status,200);
  const authoritative=(updated.body as {snapshot:RoomSnapshot}).snapshot.boss;
  assert.equal(authoritative.actor.id,'boss');assert.equal(authoritative.actor.name,'박부장');assert.equal(authoritative.actor.x,actor.x);
  const self=guest.snapshot.players.find(p=>p.id===guest.session.playerId)!;
  const attack={action:'attack',...guest.session,weapon:'hammer',player:{...self,x:actor.x+1.4,z:actor.z}};
  const hit=await f.send(attack);assert.equal(hit.status,200);
  const reaction=(hit.body as {snapshot:RoomSnapshot}).snapshot.boss;
  assert.equal(reaction.lastHit?.playerId,guest.session.playerId);assert.equal(reaction.lastHit?.weapon,'hammer');assert.equal(reaction.phase,'hit');
  assert.equal((await f.send(attack)).status,429);
  f.advance(900);
  const next=await f.send({...attack,weapon:'fan'});assert.equal(next.status,200);
  const nextBoss=(next.body as {snapshot:RoomSnapshot}).snapshot.boss;
  assert.equal(nextBoss.lastHit?.id,(reaction.lastHit?.id??0)+1);
  f.advance(300);
  const observed=(await f.send({action:'sync',...host.session})).body as {snapshot:RoomSnapshot};
  assert.equal(observed.snapshot.boss.lastHit?.id,nextBoss.lastHit?.id);
  assert.equal((await f.send({...attack,player:{...self,floor:'rooftop',x:0,z:0}})).status,400);
  assert.equal((await f.send({...attack,player:self})).status,400);
});

test('shared boss survives host travel and transfers authority when that host leaves',async()=>{
  const f=fixture(),host=await f.create();
  const guest=(await f.send({action:'join',code:host.session.code,name:'이사원'})).body as {session:RoomSession;snapshot:RoomSnapshot};
  const actor={...host.snapshot.boss.actor,z:host.snapshot.boss.actor.z+.4};
  const own=host.snapshot.players[0];
  const roof=await f.send({action:'sync',...host.session,player:{...own,floor:'rooftop',x:0,z:2.4},boss:{actor,phase:'routine'}});
  assert.equal(roof.status,200);assert.equal((roof.body as {snapshot:RoomSnapshot}).snapshot.boss.actor.z,actor.z);
  await f.send({action:'leave',...host.session});
  f.advance(300);
  const inherited=await f.send({action:'sync',...guest.session,boss:{actor:{...actor,x:actor.x+.2},phase:'watch'}});
  assert.equal(inherited.status,200);
  const snapshot=(inherited.body as {snapshot:RoomSnapshot}).snapshot;
  assert.equal(snapshot.room.hostId,guest.session.playerId);assert.equal(snapshot.boss.phase,'watch');
});

test('simultaneous attacks enforce one sender cooldown and preserve accepted boss hits against host packets',async()=>{
  const f=fixture(),host=await f.create();
  const own=host.snapshot.players[0],boss=host.snapshot.boss;
  const player={...own,x:boss.actor.x+1.4,z:boss.actor.z};
  const hits=await Promise.all([1,2].map(()=>f.send({action:'attack',...host.session,weapon:'hammer',player})));
  assert.deepEqual(hits.map(hit=>hit.status).sort(),[200,429]);
  const accepted=(hits.find(hit=>hit.status===200)!.body as {snapshot:RoomSnapshot}).snapshot.boss;
  f.advance(300);
  const oldHostPacket=await f.send({action:'sync',...host.session,boss:{actor:{...boss.actor,x:boss.actor.x+.6},phase:'routine'}});
  assert.equal(oldHostPacket.status,200);
  const after=(oldHostPacket.body as {snapshot:RoomSnapshot}).snapshot.boss;
  assert.equal(after.actor.x,accepted.actor.x);assert.equal(after.lastHit?.id,accepted.lastHit?.id);assert.equal(after.phase,'hit');
});

test('parity migration preserves existing rooms, sessions, chat, and notification records',()=>{
  const sql=new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for(const file of ['0000_flat_ezekiel_stane.sql','0001_breezy_prowler.sql'])sql.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
  sql.prepare('INSERT INTO office_rooms (code,name,capacity,host_id,created_at,expires_at) VALUES (?,?,?,?,?,?)').run('ABCDEFGH','기존 회사',2,'existing',1,100_000);
  sql.prepare("INSERT INTO office_members (id,room_code,token_hash,seat_index,name,x,z,angle,pose,moving,joined_at,last_seen) VALUES (?,?,?,?,?,?,?,?,'idle',0,?,?)").run('existing','ABCDEFGH','existing-token',0,'기존사원',1,2,0,1,1);
  sql.prepare('INSERT INTO office_messages (request_id,room_code,player_id,name,text,created_at) VALUES (?,?,?,?,?,?)').run('old-message','ABCDEFGH','existing','기존사원','안녕하세요',1);
  sql.prepare('INSERT INTO office_notifications (request_id,room_code,recipient_id,sender_id,sender_name,created_at) VALUES (?,?,?,?,?,?)').run('old-poke','ABCDEFGH','existing','sender','동료',1);
  sql.exec(readFileSync(new URL('../drizzle/0002_shocking_maelstrom.sql',import.meta.url),'utf8'));
  assert.deepEqual({...sql.prepare('SELECT token_hash,floor,visual,last_attack FROM office_members').get()!},{token_hash:'existing-token',floor:'office',visual:null,last_attack:0});
  assert.equal(sql.prepare('SELECT boss_hit_id FROM office_rooms').get()!.boss_hit_id,0);
  assert.equal(sql.prepare('SELECT text FROM office_messages').get()!.text,'안녕하세요');
  assert.equal(sql.prepare('SELECT sender_name FROM office_notifications').get()!.sender_name,'동료');
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);sql.close();
});

test('real shared-engine desk, pantry, and rooftop actions remain accepted by room synchronization',async()=>{
  const f=fixture(),host=await f.create(16),own=host.snapshot.players[0];
  const controller=createMultiController(own,16);controller.applySnapshot(host.snapshot);
  const engine=controller.engine;
  const sync=async()=>{
    f.advance(500);
    const result=await f.send({action:'sync',...host.session,player:controller.serializePlayer(),boss:controller.serializeBoss()});
    assert.equal(result.status,200,JSON.stringify({pose:engine.state.player.pose,floor:engine.state.floor,player:controller.serializePlayer(),response:result.body}));
    controller.applySnapshot((result.body as {snapshot:RoomSnapshot}).snapshot);
  };
  const tick=async(seconds=.5)=>{for(let t=0;t<seconds-1e-8;t+=.5){controller.step(Math.min(.5,seconds-t));await sync();}};
  const command=async(value:Command)=>{engine.dispatch(value);await sync();};
  const approach=async(target:TargetId)=>{
    await command({type:'select',target});
    for(let tries=0;tries<60&&!engine.state.ready;tries++)await tick();
    assert.equal(engine.state.ready,true,`reach ${target}`);
    await command({type:'interact'});
  };
  await approach('desk');await command({type:'desk',mode:'shopping'});await command({type:'desk',mode:'game'});await command({type:'desk',mode:'sleep'});
  await command({type:'spin'});await tick(1.5);await command({type:'stand'});
  await approach('coffee');await tick(3.5);await command({type:'drink'});await tick(2);
  await approach('snacks');await command({type:'take',snack:'choco'});await tick(1.5);await command({type:'eat',snack:'choco'});await tick(1.5);
  await approach('lounge');await command({type:'interact'});await command({type:'stand'});
  await approach('boss');engine.dispatch({type:'weapon',weapon:'fan'});engine.dispatch({type:'attack'});
  const attacked=await f.send({action:'attack',...host.session,weapon:'fan',player:controller.serializePlayer()});
  assert.equal(attacked.status,200);controller.applySnapshot((attacked.body as {snapshot:RoomSnapshot}).snapshot);await tick(1);
  await command({type:'travel',floor:'rooftop'});await tick(2);
  await command({type:'rest',place:'bench'});await tick(6);assert.equal(engine.state.seat,'roof-bench');
  await command({type:'candy'});await tick(1.5);assert.equal(engine.state.candyInMouth,true);
  await command({type:'stand'});await command({type:'rest',place:'wall'});await tick(6);assert.equal(engine.state.roofRest,'wall');
  await command({type:'travel',floor:'office'});await tick(2);assert.equal(engine.state.floor,'office');
  engine.dispose();
});

test('avatar choice survives room snapshots while old clients default to short hair', async () => {
  const f=fixture(), host=await f.create();
  assert.equal(host.snapshot.players[0].avatar,'short');
  const joined=await f.send({action:'join',code:host.session.code,name:'이사원',avatar:'ponytail'});
  assert.equal(joined.status,201);
  const guest=joined.body as {session:RoomSession;snapshot:RoomSnapshot};
  assert.equal(guest.snapshot.players.find(p=>p.id===guest.session.playerId)?.avatar,'ponytail');
  const own=guest.snapshot.players.find(p=>p.id===guest.session.playerId)!;
  const synced=(await f.send({action:'sync',...guest.session,player:{...own,avatar:'short'}})).body as {snapshot:RoomSnapshot};
  assert.equal(synced.snapshot.players.find(p=>p.id===guest.session.playerId)?.avatar,'ponytail');
  const before=f.sql.prepare('SELECT count(*) AS n FROM office_members').get()!.n;
  assert.equal((await f.send({action:'join',code:host.session.code,name:'위조',avatar:'other'})).status,400);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM office_members').get()!.n,before);
  assert.equal((await f.send({action:'create',name:'김사원',roomName:'회사',capacity:2,avatar:{style:'ponytail'}})).status,400);
});

test('additive notification migration preserves existing member data and defaults their avatar',()=>{
  const sql=new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  sql.exec(readFileSync(new URL('../drizzle/0000_flat_ezekiel_stane.sql',import.meta.url),'utf8'));
  sql.prepare('INSERT INTO office_rooms (code,name,capacity,host_id,created_at,expires_at) VALUES (?,?,?,?,?,?)').run('ABCDEFGH','기존 회사',2,'existing',1,100_000);
  sql.prepare("INSERT INTO office_members (id,room_code,token_hash,seat_index,name,x,z,angle,pose,moving,joined_at,last_seen) VALUES (?,?,?,?,?,?,?,?,'idle',0,?,?)").run('existing','ABCDEFGH','existing-token',0,'기존사원',1,2,0,1,1);
  sql.exec(readFileSync(new URL('../drizzle/0001_breezy_prowler.sql',import.meta.url),'utf8'));
  const member=sql.prepare('SELECT id,name,x,z,avatar,last_poke FROM office_members').get()!;
  assert.deepEqual({...member},{id:'existing',name:'기존사원',x:1,z:2,avatar:'short',last_poke:0});
  assert.equal(sql.prepare('SELECT name FROM office_rooms').get()!.name,'기존 회사');
  assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
  sql.close();
});

test('pokes reach only their recipient with server-owned sender identity and time', async () => {
  const f=fixture(), host=await f.create(4);
  const guest=(await f.send({action:'join',code:host.session.code,name:'이사원'})).body as {session:RoomSession;snapshot:RoomSnapshot};
  const bystander=(await f.send({action:'join',code:host.session.code,name:'최사원'})).body as {session:RoomSession;snapshot:RoomSnapshot};
  const poke=await f.send({action:'poke',...host.session,targetId:guest.session.playerId,senderId:bystander.session.playerId,senderName:'위조',createdAt:0});
  assert.equal(poke.status,200);assert.deepEqual((poke.body as {snapshot:RoomSnapshot}).snapshot.notifications,[]);
  const received=(await f.send({action:'sync',...guest.session})).body as {snapshot:RoomSnapshot};
  assert.equal(received.snapshot.notifications.length,1);
  const notification=received.snapshot.notifications[0];
  assert.equal(notification.senderId,host.session.playerId);assert.equal(notification.senderName,'김사원');
  assert.equal(notification.createdAt,1_000_000);assert.equal(notification.readAt,null);
  assert.deepEqual(((await f.send({action:'sync',...bystander.session})).body as {snapshot:RoomSnapshot}).snapshot.notifications,[]);
  const second=await f.create(2);f.advance(5000);
  assert.equal((await f.send({action:'poke',...host.session,targetId:second.session.playerId})).status,404);
  assert.equal((await f.send({action:'poke',...host.session,targetId:host.session.playerId})).status,400);
  assert.equal((await f.send({action:'poke',...host.session,targetId:guest.session.playerId,token:second.session.token})).status,401);
  assert.equal((await f.send({action:'poke',...host.session,targetId:crypto.randomUUID()})).status,404);
  for(const targetId of [undefined,null,5,''])assert.equal((await f.send({action:'poke',...host.session,targetId})).status,400);
});

test('simultaneous pokes obey one atomic five-second sender cooldown', async () => {
  const f=fixture(), host=await f.create(3);
  const first=(await f.send({action:'join',code:host.session.code,name:'첫째'})).body as {session:RoomSession};
  const second=(await f.send({action:'join',code:host.session.code,name:'둘째'})).body as {session:RoomSession};
  const results=await Promise.all([first,second].map(g=>f.send({action:'poke',...host.session,targetId:g.session.playerId})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM office_notifications').get()!.n,1);
  f.advance(4999);assert.equal((await f.send({action:'poke',...host.session,targetId:first.session.playerId})).status,429);
  f.advance(1);assert.equal((await f.send({action:'poke',...host.session,targetId:first.session.playerId})).status,200);
});

test('notification reads affect only the caller through the last seen id', async () => {
  const f=fixture(), host=await f.create(3);
  const first=(await f.send({action:'join',code:host.session.code,name:'첫째'})).body as {session:RoomSession};
  const second=(await f.send({action:'join',code:host.session.code,name:'둘째'})).body as {session:RoomSession};
  await f.send({action:'poke',...first.session,targetId:host.session.playerId});
  const initial=(await f.send({action:'sync',...host.session})).body as {snapshot:RoomSnapshot};
  const throughId=initial.snapshot.notifications[0].id;
  await f.send({action:'poke',...second.session,targetId:host.session.playerId});
  f.advance(300);
  const read=(await f.send({action:'readNotifications',...host.session,throughId})).body as {snapshot:RoomSnapshot};
  assert.equal(read.snapshot.notifications.length,2);
  assert.equal(read.snapshot.notifications[0].readAt,null);
  assert.equal(read.snapshot.notifications[1].readAt,1_000_300);
  await f.send({action:'readNotifications',...first.session,throughId:read.snapshot.notifications[0].id,recipientId:host.session.playerId});
  f.advance(300);
  assert.equal(((await f.send({action:'sync',...host.session})).body as {snapshot:RoomSnapshot}).snapshot.notifications[0].readAt,null);
  for(const invalid of [-1,NaN,Infinity,1.5,'2',Number.MAX_SAFE_INTEGER+1])assert.equal((await f.send({action:'readNotifications',...host.session,throughId:invalid})).status,400);
});

test('a read racing with a new poke never consumes the unseen notification',async()=>{
  const f=fixture(),host=await f.create(3);
  const first=(await f.send({action:'join',code:host.session.code,name:'첫째'})).body as {session:RoomSession};
  const second=(await f.send({action:'join',code:host.session.code,name:'둘째'})).body as {session:RoomSession};
  assert.equal((await f.send({action:'poke',...first.session,targetId:host.session.playerId})).status,200);
  const visible=((await f.send({action:'sync',...host.session})).body as {snapshot:RoomSnapshot}).snapshot.notifications;
  const raced=await Promise.all([
    f.send({action:'poke',...second.session,targetId:host.session.playerId}),
    f.send({action:'readNotifications',...host.session,throughId:visible[0].id}),
  ]);
  assert.deepEqual(raced.map(r=>r.status),[200,200]);
  f.advance(300);
  const after=((await f.send({action:'sync',...host.session})).body as {snapshot:RoomSnapshot}).snapshot.notifications;
  assert.equal(after[0].senderId,second.session.playerId);assert.equal(after[0].readAt,null);
  assert.equal(after[1].id,visible[0].id);assert.equal(after[1].readAt,1_000_000);
});

test('stale or departed poke targets are rejected without spending the sender cooldown',async()=>{
  const f=fixture(),host=await f.create(3);
  const first=(await f.send({action:'join',code:host.session.code,name:'첫째'})).body as {session:RoomSession};
  f.advance(120_001);
  assert.equal((await f.send({action:'poke',...host.session,targetId:first.session.playerId})).status,404);
  // The still-valid session can reconnect while its seat has not been reclaimed.
  await f.send({action:'sync',...first.session});
  assert.equal((await f.send({action:'poke',...host.session,targetId:first.session.playerId})).status,200);
  await f.send({action:'leave',...first.session});f.advance(5000);
  assert.equal((await f.send({action:'poke',...host.session,targetId:first.session.playerId})).status,404);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM office_notifications').get()!.n,0);
});

test('notification history is bounded per recipient and survives sender departure',async()=>{
  const f=fixture(),host=await f.create(2);
  const guest=(await f.send({action:'join',code:host.session.code,name:'동료'})).body as {session:RoomSession};
  for(let i=0;i<103;i++){
    f.advance(5000);await f.send({action:'sync',...guest.session});
    assert.equal((await f.send({action:'poke',...host.session,targetId:guest.session.playerId})).status,200);
  }
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM office_notifications').get()!.n,100);
  await f.send({action:'leave',...host.session});f.advance(300);
  const remaining=((await f.send({action:'sync',...guest.session})).body as {snapshot:RoomSnapshot}).snapshot.notifications;
  assert.equal(remaining.length,100);assert.ok(remaining[0].id>remaining[99].id);assert.equal(remaining[0].senderName,'김사원');
});

test('creates a private member session and joins with unique server-owned seats', async () => {
  const f = fixture(), first = await f.create(2);
  assert.equal(first.snapshot.players[0].seatIndex, 0);
  assert.equal(first.snapshot.room.hostId, first.session.playerId);
  assert.match(first.session.code, /^[A-Z2-9]{8}$/);
  assert.ok(first.session.token.length >= 40);
  assert.ok(!JSON.stringify(first.snapshot).includes(first.session.token));
  const stored = f.sql.prepare('SELECT token_hash FROM office_members').get()!;
  assert.notEqual(stored.token_hash, first.session.token);
  const joined = await f.send({ action: 'join', code: first.session.code.toLowerCase(), name: '이대리' });
  assert.equal(joined.status, 201);
  assert.equal((joined.body as { snapshot: RoomSnapshot }).snapshot.players[1].seatIndex, 1);
  const full = await f.send({ action: 'join', code: first.session.code, name: '최주임' });
  assert.equal(full.status, 409);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM office_members').get()!.n, 2);
});

test('concurrent admission never exceeds the configured capacity', async () => {
  const f = fixture(), owner = await f.create(4);
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => f.send({ action: 'join', code: owner.session.code, name: `동료${i}` }, `joiner${i}`)));
  assert.equal(results.filter(r => r.status === 201).length, 3);
  const rows = f.sql.prepare('SELECT seat_index FROM office_members').all();
  assert.equal(rows.length, 4); assert.equal(new Set(rows.map(r => r.seat_index)).size, 4);
});

test('rejects another room token, malformed inputs, and impossible positions', async () => {
  const f = fixture(), a = await f.create(), b = await f.create();
  const wrong = await f.send({ action: 'sync', code: a.session.code, token: b.session.token });
  assert.equal(wrong.status, 401);
  for (const input of [null, { action: 'create', capacity: 17, name: 'a', roomName: 'x' }, { action: 'join', code: '../x', name: 'a' }]) assert.equal((await f.send(input)).status, 400);
  const auth = { code: a.session.code, token: a.session.token };
  for (const x of [Infinity, NaN, 9999]) {
    const r = await f.send({ action: 'sync', ...auth, player: { x, z: 0, angle: 0, pose: 'walk', moving: true } }); assert.equal(r.status, 400);
  }
  const seat = createMultiLayout(4).desks[1].seat;
  assert.equal((await f.send({ action: 'sync', ...auth, player: { ...seat, angle: 0, pose: 'sit', moving: false } })).status, 400);
});

test('synchronizes positions and chat with server identity, limits spam and keeps only 100 messages', async () => {
  const f = fixture(), a = await f.create(), auth = { code: a.session.code, token: a.session.token };
  const seat = createMultiLayout(4).desks[0].seat;
  f.advance(300);
  const sync = await f.send({ action: 'sync', ...auth, player: { ...seat, angle: Math.PI, pose: 'type', moving: false } });
  assert.equal(sync.status, 200); assert.equal((sync.body as { snapshot: RoomSnapshot }).snapshot.players[0].pose, 'type');
  assert.equal((await f.send({ action: 'sync', ...auth })).status, 429);
  const sent = await f.send({ action: 'chat', ...auth, text: '<b>점심 먹을까요?</b>', name: '위장' });
  assert.equal(sent.status, 200);
  const message = (sent.body as { snapshot: RoomSnapshot }).snapshot.messages[0];
  assert.equal(message.name, '김사원'); assert.equal(message.text, '<b>점심 먹을까요?</b>');
  assert.equal((await f.send({ action: 'chat', ...auth, text: '또' })).status, 429);
  assert.equal((await f.send({ action: 'chat', ...auth, text: '가'.repeat(201) })).status, 400);
  for (let i = 0; i < 103; i++) { f.advance(1001); assert.equal((await f.send({ action: 'chat', ...auth, text: `대화${i}` })).status, 200); }
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM office_messages').get()!.n, 100);
});

test('only the host can resize and occupied seats cannot be removed', async () => {
  const f = fixture(), a = await f.create(3);
  const b = (await f.send({ action: 'join', code: a.session.code, name: '둘째' })).body as { session: RoomSession };
  const c = (await f.send({ action: 'join', code: a.session.code, name: '셋째' })).body as { session: RoomSession };
  assert.equal((await f.send({ action: 'capacity', ...b.session, capacity: 16 })).status, 403);
  assert.equal((await f.send({ action: 'capacity', ...a.session, capacity: 2 })).status, 409);
  assert.equal((await f.send({ action: 'leave', ...c.session })).status, 200);
  assert.equal((await f.send({ action: 'capacity', ...a.session, capacity: 2 })).status, 200);
  assert.equal((await f.send({ action: 'capacity', ...a.session, capacity: 16 })).status, 200);
});

test('reserves disconnected seats for 120 seconds, reclaims safely and transfers host ownership', async () => {
  const f = fixture(), a = await f.create(2);
  const b = (await f.send({ action: 'join', code: a.session.code, name: '둘째' })).body as { session: RoomSession };
  f.advance(119_000);
  assert.equal((await f.send({ action: 'sync', ...b.session })).status, 200);
  assert.equal((await f.send({ action: 'join', code: a.session.code, name: '셋째' })).status, 409);
  f.advance(2000);
  const c = await f.send({ action: 'join', code: a.session.code, name: '셋째' });
  assert.equal(c.status, 201);
  const state = (c.body as { snapshot: RoomSnapshot }).snapshot;
  assert.equal(state.room.hostId, b.session.playerId);
  assert.equal((await f.send({ action: 'sync', ...a.session })).status, 401);
  const left = await f.send({ action: 'leave', ...b.session }); assert.deepEqual(left.body, { left: true });
});

test('rooms expire after 24 hours and public admission has a persistent request limit', async () => {
  const f = fixture(), a = await f.create();
  for (let i = 0; i < 9; i++) assert.equal((await f.send({ action: 'create', name: '사원', roomName: '방', capacity: 2 })).status, 201);
  assert.equal((await f.send({ action: 'create', name: '사원', roomName: '방', capacity: 2 })).status, 429);
  f.advance(24 * 60 * 60 * 1000 + 1);
  const expired = await f.send({ action: 'sync', ...a.session }); assert.equal(expired.status, 410);
  assert.equal((expired.body as { code: string }).code, 'ROOM_EXPIRED');
});

test('expanding desks moves an obstructed visitor to the safe entrance', async () => {
  const f = fixture(), a = await f.create(2);
  f.advance(300);
  assert.equal((await f.send({ action: 'sync', ...a.session, player: { x: 2.4, z: .66, angle: 0, pose: 'idle', moving: false } })).status, 200);
  const expanded = await f.send({ action: 'capacity', ...a.session, capacity: 4 });
  assert.equal(expanded.status, 200);
  const own = (expanded.body as { snapshot: RoomSnapshot }).snapshot.players[0];
  assert.deepEqual({ x: own.x, z: own.z }, createMultiLayout(4).spawn);
});

test('simultaneous chat and sync requests cannot bypass member cooldowns', async () => {
  const f = fixture(), a = await f.create();
  f.advance(300);
  const syncs = await Promise.all(Array.from({ length: 4 }, () => f.send({ action: 'sync', ...a.session })));
  assert.equal(syncs.filter(x => x.status === 200).length, 1);
  const chats = await Promise.all(Array.from({ length: 4 }, () => f.send({ action: 'chat', ...a.session, text: '동시 전송' })));
  assert.equal(chats.filter(x => x.status === 200).length, 1);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM office_messages').get()!.n, 1);
});

test('leaving the host role skips disconnected members whose leases elapsed', async () => {
  const f = fixture(), host = await f.create(3);
  await f.send({ action: 'join', code: host.session.code, name: '자리비움' });
  const active = (await f.send({ action: 'join', code: host.session.code, name: '남은동료' })).body as { session: RoomSession };
  f.advance(121_000);
  assert.equal((await f.send({ action: 'sync', ...active.session })).status, 200);
  assert.equal((await f.send({ action: 'leave', ...host.session })).status, 200);
  assert.equal(f.sql.prepare('SELECT host_id FROM office_rooms').get()!.host_id, active.session.playerId);
});

test('chat preserves plain multiline text while rejecting non-line-break control characters', async () => {
  const f = fixture(), a = await f.create();
  const result = await f.send({ action: 'chat', ...a.session, text: '  <b>점심</b>\r\n같이 먹어요\r좋아요?  ' });
  assert.equal(result.status, 200);
  assert.equal((result.body as { snapshot: RoomSnapshot }).snapshot.messages[0].text, '<b>점심</b>\n같이 먹어요\n좋아요?');
  for (const control of ['\t', '\u0000', '\u000b', '\u001f', '\u007f']) {
    assert.equal((await f.send({ action: 'chat', ...a.session, text: `안녕${control}동료` })).status, 400);
  }
});

test('a remaining active member inherits an expired host lease on sync and can resize', async () => {
  const f = fixture(), host = await f.create(3);
  const active = (await f.send({ action: 'join', code: host.session.code, name: '남은동료' })).body as { session: RoomSession };
  f.advance(121_000);
  const response = await f.send({ action: 'sync', ...active.session });
  assert.equal(response.status, 200);
  const state = (response.body as { snapshot: RoomSnapshot }).snapshot;
  assert.equal(state.players.length, 1);
  assert.equal(state.room.hostId, active.session.playerId);
  assert.equal((await f.send({ action: 'capacity', ...active.session, capacity: 6 })).status, 200);
});

test('chat also renews membership before assigning a disconnected host role', async () => {
  const f = fixture(), host = await f.create(3);
  const active = (await f.send({ action: 'join', code: host.session.code, name: '남은동료' })).body as { session: RoomSession };
  f.advance(121_000);
  const response = await f.send({ action: 'chat', ...active.session, text: '누구 계세요?' });
  assert.equal(response.status, 200);
  assert.equal((response.body as { snapshot: RoomSnapshot }).snapshot.room.hostId, active.session.playerId);
});
