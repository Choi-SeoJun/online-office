import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGameEngine } from './engine.ts';
import { createMultiLayout } from './multi-layout.ts';
import { createMultiArchitecture } from './multi-scene.ts';
import { animateActor, createActor } from './models.ts';
import { remoteAnimationState } from './multi-animation.ts';
import type { RoomPlayer } from './multi-types.ts';

Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => ({
    beginPath() {}, roundRect() {}, fill() {}, fillText() {}, fillRect() {},
  }) }),
} });

function player(): RoomPlayer {
  return { id: 'room-member-123', name: '동료', x: 1, z: 2, angle: 0, pose: 'idle', moving: false, avatar: 'ponytail',
    seatIndex: 1, lastSeen: 10_000, floor: 'office', seat: null, deskMode: null, roofRest: null, roofWallSide: null,
    candyInMouth: false, activity: null, weapon: 'punch', elapsed: 20, lastHit: null, carryingCoffee: false };
}

test('colleague animation advances visible activity without copying private work or inventory', () => {
  const game = createGameEngine().state; game.inventory.cookie = 5; game.inventory.coffee = 3;
  const colleague = player(); colleague.pose = 'eat'; colleague.activity = { kind: 'eat', duration: 1.5, remaining: 1.4, snack: 'choco' };
  const visual = remoteAnimationState(game, colleague, 10_400);
  assert.equal(visual.player.id, colleague.id); assert.equal(visual.elapsed, 20.4);
  assert.ok(Math.abs(visual.activity!.remaining - 1) < 1e-8);
  assert.deepEqual(visual.inventory, { coffee: 0, cookie: 0, choco: 0, cracker: 0 });
  assert.equal(colleague.activity.remaining, 1.4, 'received snapshot is not mutated');
  const complete = remoteAnimationState(game, colleague, 12_000);
  assert.equal(complete.activity, null); assert.equal(complete.player.pose, 'idle');
});

test('a real room identity gets mouth candy, seated rooftop pose and held tools', () => {
  const game = createGameEngine().state, colleague = player(); colleague.floor = 'rooftop';
  colleague.seat = 'roof-bench'; colleague.roofRest = 'bench'; colleague.candyInMouth = true; colleague.pose = 'sit';
  const visual = remoteAnimationState(game, colleague, 10_000);
  const rig = createActor(new THREE.Group(), 0, colleague.name, colleague.avatar);
  animateActor(rig, visual.player, visual, visual.elapsed);
  assert.equal(rig.mouthCandy.visible, true);
  assert.ok(Math.abs(rig.legs[0].rotation.x + Math.PI / 2) < 1e-8);
  colleague.floor = 'office'; colleague.seat = null; colleague.roofRest = null; colleague.candyInMouth = false;
  colleague.pose = 'hit'; colleague.weapon = 'fan'; colleague.lastHit = { id: 1, weapon: 'fan', at: 19.8 };
  const hit = remoteAnimationState(game, colleague, 10_000);
  animateActor(rig, hit.player, hit, hit.elapsed);
  assert.equal(rig.weapons.fan.visible, true);
  assert.equal(rig.weapons.hammer.visible, false);
});

test('a different colleague hitting the boss never swaps the local attacking tool', () => {
  const game = createGameEngine().state; game.entered = true; game.elapsed = 5;
  game.player.id = 'local-room-player'; game.player.pose = 'hit';
  game.lastHit = { id: 1, weapon: 'fan', at: 4.8 }; game.bossHit = { id: 7, weapon: 'hammer', at: 4.5 };
  const ownRig = createActor(new THREE.Group(), 0, '나');
  animateActor(ownRig, game.player, game, game.elapsed);
  assert.equal(ownRig.weapons.fan.visible, true); assert.equal(ownRig.weapons.hammer.visible, false);
  const bossRig = createActor(new THREE.Group(), 1, '부장');
  animateActor(bossRig, game.boss, game, game.elapsed);
  assert.equal(bossRig.effect.visible, true);
});

test('every office size includes selectable amenities and moving chairs without changing seat positions', () => {
  for (const capacity of [2, 8, 16]) {
    const layout = createMultiLayout(capacity), architecture = createMultiArchitecture(layout);
    assert.equal(architecture.chairs.size, capacity);
    for (const [name, target, anchor] of [
      ['shared-coffee', 'coffee', layout.furniture.coffee], ['shared-snacks', 'snacks', layout.furniture.snacks],
      ['shared-copier', 'copier', layout.furniture.copier], ['shared-boss-desk', 'boss', layout.furniture.bossDesk],
    ] as const) {
      const prop = architecture.group.getObjectByName(name); assert.ok(prop);
      assert.equal(prop.userData.target, target); assert.equal(prop.position.x, anchor.x); assert.equal(prop.position.z, anchor.z);
    }
    architecture.group.updateMatrixWorld(true);
    layout.desks.forEach((desk, index) => {
      const chair = architecture.chairs.get(index)!;
      const position = chair.getWorldPosition(new THREE.Vector3());
      assert.ok(Math.abs(position.x - desk.seat.x) < 1e-8 && Math.abs(position.z - desk.seat.z) < 1e-8);
      assert.equal(chair.userData.dynamic, true, 'chair is not baked into static furniture');
    });
    architecture.release();
  }
});
