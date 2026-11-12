import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGameEngine } from './engine.ts';
import { animateActor, createActor, spriteLabel } from './models.ts';
import { remoteAnimationState } from './multi-animation.ts';
import { chairSpinAngle } from './expression.ts';
import type { RoomPlayer } from './multi-types.ts';

Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => ({
    beginPath() {}, roundRect() {}, fill() {}, fillText() {},
  }) }),
} });

test('spin phase follows activity progress instead of unrelated observer clocks', () => {
  const state = createGameEngine().state;
  state.seat = 'desk'; state.player.pose = 'spin';
  state.activity = { kind: 'spin', duration: 2, remaining: 1 };
  const rig = createActor(new THREE.Group(), 0, state.player.name);
  animateActor(rig, state.player, state, 18);
  const rotation = rig.body.rotation.y;
  animateActor(rig, state.player, state, 103);
  assert.ok(Math.abs(rig.body.rotation.y - rotation) < 1e-8, 'same activity progress must give the same seated angle');
  assert.ok(Math.abs(rotation - Math.PI) < 1e-8, 'half of one complete turn');
});

test('room spin expires for the same rendered avatar and seated state', () => {
  const state = createGameEngine().state;
  const peer: RoomPlayer = { ...state.player, id: 'peer', seatIndex: 1, lastSeen: 10000, floor: 'office', seat: 'desk', deskMode: 'work', roofRest: null, roofWallSide: null, candyInMouth: false, activity: { kind: 'spin', duration: 2, remaining: .1 }, weapon: 'punch', elapsed: 30, lastHit: null, carryingCoffee: false, pose: 'spin' };
  const context = remoteAnimationState(state, peer, 10400);
  const rig = createActor(new THREE.Group(), 0, peer.name);
  animateActor(rig, context.player, context, context.elapsed);
  assert.equal(context.player.pose, 'type'); assert.equal(context.activity, null);
  assert.equal(rig.body.rotation.y, 0);
  assert.equal(chairSpinAngle(context), rig.body.rotation.y, 'expired chair and actor stop in one frame');
  peer.activity!.remaining = 1.4;
  const active = remoteAnimationState(state, peer, 10400);
  animateActor(rig, active.player, active, active.elapsed);
  assert.ok(rig.body.rotation.y > 0);
  assert.equal(chairSpinAngle(active), rig.body.rotation.y, 'the remote chair and avatar share a phase');
});

test('dance stands up, has a bounded duration, and cancels on travel or movement', () => {
  const e = createGameEngine(); e.dispatch({ type: 'enter' });
  e.state.seat = 'desk'; e.state.deskMode = 'work';
  e.dispatch({ type: 'dance' });
  assert.equal(e.state.seat, null); assert.equal(e.state.player.pose, 'dance');
  assert.equal(e.state.activity?.duration, 8);
  e.step(8.1); assert.equal(e.state.activity, null); assert.equal(e.state.player.pose, 'idle');
  e.dispatch({ type: 'dance' }); e.dispatch({ type: 'axis', x: 1, z: 0 });
  assert.equal(e.state.activity, null);
  e.dispatch({ type: 'dance' }); e.dispatch({ type: 'travel', floor: 'rooftop' });
  assert.equal(e.state.activity, null); assert.notEqual(e.state.player.pose, 'dance');
});

test('work animation pauses hands and slumps toward the monitor then resumes', () => {
  const state = createGameEngine().state;
  state.seat = 'desk'; state.deskMode = 'work'; state.player.pose = 'type';
  const rig = createActor(new THREE.Group(), 0, state.player.name);
  animateActor(rig, state.player, state, 2); const typingHead = rig.head.rotation.x;
  animateActor(rig, state.player, state, 13.2); const sighHead = rig.head.rotation.x;
  assert.ok(sighHead > typingHead + .1, 'head visibly slumps during the sigh');
  animateActor(rig, state.player, state, 18);
  assert.ok(Math.abs(rig.head.rotation.x - typingHead) < .05, 'typing resumes after the sigh');
});

test('floating scene labels remain visible through walls and never block clicks', () => {
  const label = spriteLabel(new THREE.Group(), '잠깐 쉬어가요');
  assert.equal(label.material.depthTest, false);
  assert.equal(label.material.depthWrite, false);
  assert.ok(label.renderOrder >= 1000);
  assert.equal(label.userData.pointerPassthrough, true);
});

test('dance scene includes its mirrorball and spotlight only while the actor dances', () => {
  const state = createGameEngine().state;
  state.player.pose = 'dance'; state.activity = { kind: 'dance', duration: 8, remaining: 6 };
  const rig = createActor(new THREE.Group(), 0, state.player.name);
  animateActor(rig, state.player, state, 2);
  const effect = rig.root.getObjectByName('dance-stage');
  assert.ok(effect?.visible, 'a dancing actor gets a visible stage');
  const mirrorball = effect.getObjectByName('dance-mirrorball');
  assert.ok(mirrorball); assert.ok(effect.getObjectByName('dance-spotlight'));
  const angle = mirrorball.rotation.y;
  animateActor(rig, state.player, state, 2.2); assert.notEqual(mirrorball.rotation.y, angle);
  state.settings.reducedMotion = true;
  animateActor(rig, state.player, state, 4); const still = mirrorball.rotation.y;
  animateActor(rig, state.player, state, 6); assert.equal(mirrorball.rotation.y, still);
  state.player.pose = 'idle'; state.activity = null;
  animateActor(rig, state.player, state, 7); assert.equal(effect.visible, false);
});
