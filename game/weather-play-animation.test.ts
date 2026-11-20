import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createActor, animateActor } from './models.ts';
import { createGameEngine } from './engine.ts';

Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => ({ beginPath() {}, roundRect() {}, fill() {}, fillText() {} }) }),
} });
const setup = () => {
  const state = createGameEngine().state; state.floor = 'rooftop';
  return { state, rig: createActor(new THREE.Group(), 0, '김사원') };
};

test('both hands stay on separate duck-mold grips throughout pressing and turning', () => {
  const { state, rig } = setup(); state.player.pose = 'snowduck';
  for (const reducedMotion of [false, true]) for (const angle of [0, 1.3]) for (const progress of [.1, .35, .6, .9]) {
    state.settings.reducedMotion = reducedMotion; state.player.angle = angle;
    state.activity = { kind: 'snowduck', duration: 2.4, remaining: (1 - progress) * 2.4 };
    animateActor(rig, state.player, state, 0); rig.root.updateMatrixWorld(true);
    for (const side of ['left', 'right']) {
      const hand = rig.root.getObjectByName(`${side}-hand-grip`), grip = rig.snowDuckMold.getObjectByName(`mold-${side}-grip`);
      assert.ok(hand && grip, 'each hand needs its own mold handle');
      assert.ok(hand.getWorldPosition(new THREE.Vector3()).distanceTo(grip.getWorldPosition(new THREE.Vector3())) < .025);
    }
  }
});

test('held snowball is visible while walking, takes priority over coffee, and disappears after release', () => {
  const { state, rig } = setup(); state.snowballReady = true; state.inventory.coffee = 1;
  for (const pose of ['idle', 'walk', 'sit', 'wallLean'] as const) {
    state.player.pose = pose; state.player.moving = pose === 'walk';
    animateActor(rig, state.player, state, .3);
    assert.equal(rig.heldSnowball.visible, true); assert.equal(rig.mug.visible, false);
  }
  state.player.moving = false; state.player.pose = 'snowball'; state.snowballReady = false;
  state.activity = { kind: 'snowball', duration: 1.6, remaining: .3 };
  animateActor(rig, state.player, state, 1);
  assert.equal(rig.heldSnowball.visible, false);
});

test('splash hops raise both arms outward and both feet; reduced motion keeps feet grounded', () => {
  const { state, rig } = setup(); state.player.pose = 'splash';
  state.activity = { kind: 'splash', duration: 2.7, remaining: 2.7 * .85 };
  animateActor(rig, state.player, state, 0);
  assert.ok(rig.body.position.y > .12, 'a playful hop lifts the body, not just one foot');
  assert.ok(rig.calves.every(leg => leg.rotation.x > .1), 'both knees bend in the air');
  rig.root.updateMatrixWorld(true);
  for (const [side, arm, hand] of [[-1, rig.leftArm, rig.leftHand], [1, rig.rightArm, rig.hand]] as const) {
    const wrist = rig.body.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
    assert.ok(side * (wrist.x - arm.position.x) > .2, 'hands spread outside their shoulders, never across the chest');
    assert.ok(wrist.y > arm.position.y + .1, 'hands rise above shoulder height during the hop');
  }
  state.settings.reducedMotion = true; animateActor(rig, state.player, state, 0);
  assert.equal(rig.body.position.y, 0);
});
