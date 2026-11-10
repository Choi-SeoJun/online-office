import test from 'node:test';
import assert from 'node:assert/strict';
import { publicAssetPath } from './hosting.ts';
import { requestRoom, roomInviteUrl } from './multi-client.ts';

test('asset paths honor the deployment prefix and preserve the Sites root default', () => {
  assert.equal(publicAssetPath('audio/hit.mp3'), '/audio/hit.mp3');
  Object.defineProperty(globalThis, '__OFFICE_ASSET_BASE__', {value:'/online-office/',configurable:true});
  try { assert.equal(publicAssetPath('/audio/hit.mp3'), '/online-office/audio/hit.mp3'); }
  finally { Reflect.deleteProperty(globalThis, '__OFFICE_ASSET_BASE__'); }
});

test('Pages sends room actions to its fixed backend without browser cookies or redirects', async () => {
  const oldFetch=globalThis.fetch;
  Object.defineProperty(globalThis, '__OFFICE_ROOM_ENDPOINT__', {value:'https://backend.test/api/rooms',configurable:true});
  try {
    globalThis.fetch=async(input,init)=>{
      assert.equal(input,'https://backend.test/api/rooms');
      assert.equal(init?.credentials,'omit');assert.equal(init?.redirect,'error');
      assert.deepEqual(JSON.parse(String(init?.body)),{action:'sync',code:'ABCD2345',token:'private-session'});
      return Response.json({ok:true});
    };
    assert.deepEqual(await requestRoom({action:'sync',code:'ABCD2345',token:'private-session'}),{ok:true});
    assert.equal(roomInviteUrl('ABCD2345','https://choi-seojun.github.io/online-office/?mode=multi#temporary'),'https://choi-seojun.github.io/online-office/?room=ABCD2345');
  } finally {globalThis.fetch=oldFetch;Reflect.deleteProperty(globalThis,'__OFFICE_ROOM_ENDPOINT__');}
});
