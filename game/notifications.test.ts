import test from 'node:test';
import assert from 'node:assert/strict';
import { newestNotificationId, pokeMessage, unreadNotifications } from './notifications.ts';

test('poke messages identify the sender without doubling the employee suffix',()=>{
  assert.equal(pokeMessage('서준'),'서준 사원이 당신을 콕! 찔렀어요');
  assert.equal(pokeMessage('김사원'),'김사원이 당신을 콕! 찔렀어요');
});
test('unread notifications and read cursor do not depend on list ordering',()=>{
  const base={senderId:'one',senderName:'민지',createdAt:0};
  const items=[{...base,id:8,readAt:null},{...base,id:10,readAt:1},{...base,id:9,readAt:null}];
  assert.equal(unreadNotifications(items),2);assert.equal(newestNotificationId(items),10);
  assert.equal(newestNotificationId([]),0);
});
