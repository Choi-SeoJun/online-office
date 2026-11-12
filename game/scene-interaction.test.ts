import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { isPointerEligible, targetForFloor } from './scene.ts';
import { createDanceEffects } from './dance-effects.ts';
import { createActor } from './models.ts';

Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => ({
    beginPath() {}, roundRect() {}, fill() {}, fillText() {},
  }) }),
} });

test('a target under an invisible ancestor cannot intercept scene clicks', () => {
  const hidden = new THREE.Group(); hidden.visible = false;
  const actor = new THREE.Group(); actor.userData.target = 'boss'; hidden.add(actor);
  const body = new THREE.Mesh(new THREE.BoxGeometry(.5, 1, .3), new THREE.MeshBasicMaterial()); actor.add(body);
  hidden.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, -1));
  const hit = ray.intersectObject(hidden, true)[0];
  assert.ok(hit, 'Three still raycasts descendants of an invisible group');
  assert.equal(targetForFloor(hit.object, 'office'), null, 'visibility must be checked beyond the nearest target ancestor');
});

for (const active of [false, true]) test(`${active ? 'active' : 'hidden'} dance stage passes raycasts through to the ground`, () => {
  const scene = new THREE.Group(), actor = new THREE.Group(); actor.userData.actorId = 'peer'; scene.add(actor);
  const effect = createDanceEffects(actor); effect.group.visible = active;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  ground.rotation.x = -Math.PI / 2; ground.userData.ground = true; scene.add(ground); scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(.8, 4, 0), new THREE.Vector3(0, -1, 0));
  const raw = ray.intersectObject(scene, true);
  assert.ok(raw.some(hit => hit.object !== ground), 'the actual cone or pool is intersected before the floor');
  const eligible = raw.filter(hit => isPointerEligible(hit.object));
  assert.ok(eligible.length); assert.equal(eligible[0].object, ground, 'stage geometry must not capture a colleague selection');
});

test('a visible actor body remains selectable through its stage, while hidden props and name labels pass through', () => {
  const scene = new THREE.Group(), rig = createActor(scene, 0, '동료'); rig.root.userData.actorId = 'peer';
  rig.dance.group.visible = true; scene.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, .94, 4); camera.lookAt(0, .94, 0); camera.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, .94, 4), new THREE.Vector3(0, 0, -1)); ray.camera = camera;
  const hits = ray.intersectObject(rig.root, true), selected = hits.find(hit => isPointerEligible(hit.object));
  assert.ok(selected, 'actor torso is still interactive');
  let ancestor: THREE.Object3D | null = selected.object;
  while (ancestor && !ancestor.userData.actorId) ancestor = ancestor.parent;
  assert.equal(ancestor?.userData.actorId, 'peer');
  assert.equal(isPointerEligible(rig.label), false, 'new name sprites do not capture the floor below them');
  rig.root.visible = false; assert.ok(hits.every(hit => !isPointerEligible(hit.object)), 'hidden whole actors cannot be selected');
});
