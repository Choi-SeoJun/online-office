import test from 'node:test';
import assert from 'node:assert/strict';
import { clearRoomSession, parseRoomCode, readRoomSession, requestRoom, RoomApiError, roomInviteUrl, saveRoomSession } from './multi-client.ts';
import { OFFICE_LAYOUT_VERSION } from './office-version.ts';

const session={code:'ABCD2345',token:'a'.repeat(64),playerId:'b8a2fb2d-16e9-4ef5-aec0-ec568be5e967'};
const memory=()=>{const data=new Map<string,string>();return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);},data};};

test('room codes accept normalized codes and invitation URLs only',()=>{
  assert.equal(parseRoomCode(' abcd2345 '),'ABCD2345');
  assert.equal(parseRoomCode('https://office.test/?room=abcd2345'),'ABCD2345');
  for(const value of ['ABCD1234','ABCD234','ABCD23456','javascript:alert(1)','https://office.test/?token=ABCD2345','https://office.test/?room=ABCD2345&room=EFGH2345']) assert.equal(parseRoomCode(value),null);
});

test('invite URLs contain the code without private session or navigation data',()=>{
  const url=roomInviteUrl('abcd2345','https://user:secret@office.test/game?token=private&debug=true#fragment');
  assert.equal(url,'https://office.test/game?room=ABCD2345');
  assert.throws(()=>roomInviteUrl('invalid','https://office.test/'),RoomApiError);
  assert.throws(()=>roomInviteUrl('ABCD2345','javascript:alert(1)'),RoomApiError);
});

test('sessions are isolated by room, versioned and allowlisted',()=>{
  const store=memory();
  assert.equal(saveRoomSession({...session,extra:'not stored'} as typeof session,store),true);
  assert.deepEqual(readRoomSession('abcd2345',store),session);
  assert.equal(readRoomSession('EFGH2345',store),null);
  const saved=[...store.data.values()][0];
  assert.deepEqual(JSON.parse(saved),{version:1,...session});
  assert.equal(clearRoomSession(session.code,store),true);
  assert.equal(readRoomSession(session.code,store),null);
});

test('corrupt, mismatched and inaccessible room storage fails closed',()=>{
  for(const value of ['{','null','[]',JSON.stringify({version:2,...session}),JSON.stringify({version:1,...session,code:'EFGH2345'}),JSON.stringify({version:1,...session,token:'x'}),JSON.stringify({version:1,...session,playerId:'bad'})]) assert.equal(readRoomSession(session.code,{getItem:()=>value}),null);
  const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');},removeItem(){throw Error('denied');}};
  assert.equal(readRoomSession(session.code,denied),null);
  assert.equal(saveRoomSession(session,denied),false);
  assert.equal(clearRoomSession(session.code,denied),false);
});

test('room requests stay same-origin and convert server errors without including the token',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async(input,init)=>{assert.equal(input,'/api/rooms');assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');assert.equal(JSON.parse(String(init?.body)).token,session.token);return Response.json({error:'방이 가득 찼어요.',code:'ROOM_FULL'},{status:409});};
    await assert.rejects(requestRoom({action:'join',token:session.token}),(error:unknown)=>error instanceof RoomApiError&&error.code==='ROOM_FULL'&&error.status===409&&!error.message.includes(session.token));
    globalThis.fetch=async()=>Response.json({snapshot:{players:[]}});
    assert.deepEqual(await requestRoom({action:'sync'}),{snapshot:{players:[]}});
  } finally {globalThis.fetch=original;}
});

test('request failures and cancellation are bounded and do not echo request data',async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>{throw Error(session.token);};
    await assert.rejects(requestRoom({token:session.token}),(error:unknown)=>error instanceof RoomApiError&&error.code==='NETWORK_ERROR'&&!error.message.includes(session.token));
    globalThis.fetch=async()=>new Response('<html>unavailable</html>',{status:502});
    await assert.rejects(requestRoom({}),(error:unknown)=>error instanceof RoomApiError&&error.code==='INVALID_RESPONSE'&&error.status===502);
    const controller=new AbortController();controller.abort();
    await assert.rejects(requestRoom({},controller.signal),(error:unknown)=>error instanceof Error&&error.name==='AbortError');
  } finally {globalThis.fetch=original;}
});

test('room requests stamp the current layout while board requests retain their own payload', async t => {
  const sent: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (_input: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body))); return Response.json({ snapshot: { players: [] } });
  });
  const original = { action: 'sync', ...session, layoutVersion: -1 };
  await requestRoom(original);
  await requestRoom({ action: 'list', ...session }, undefined, 'board');
  assert.equal(sent[0].layoutVersion, OFFICE_LAYOUT_VERSION);
  assert.equal(original.layoutVersion, -1);
  assert.equal('layoutVersion' in sent[1], false);
});

test('layout mismatch responses retain the refresh message for old-room fatal handling', async t => {
  const message = '사무실 배치가 바뀌었어요. 화면을 새로고침한 뒤 다시 입장해 주세요.';
  t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 'ROOM_EXPIRED', error: message }, { status: 409 }));
  await assert.rejects(requestRoom({ action: 'sync', ...session }), error => error instanceof RoomApiError
    && error.code === 'ROOM_EXPIRED' && error.status === 409 && error.message === message);
});

test('slow room requests abort after twelve seconds and caller cancellation stays distinct',async context=>{
  const original=globalThis.fetch;
  context.mock.timers.enable({apis:['setTimeout']});
  try {
    globalThis.fetch=async(_input,init)=>new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
    const timeout=assert.rejects(requestRoom({action:'sync'}),(error:unknown)=>error instanceof RoomApiError&&error.code==='TIMEOUT');
    context.mock.timers.tick(12_000);await timeout;
    const controller=new AbortController();
    const cancelled=assert.rejects(requestRoom({action:'sync'},controller.signal),(error:unknown)=>error instanceof Error&&error.name==='AbortError');
    controller.abort();await cancelled;
  } finally {globalThis.fetch=original;context.mock.timers.reset();}
});
