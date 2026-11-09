import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { animateRooftop, createRooftop, transitionOrbit } from './rooftop.ts';
import { batchArchitecture, targetForFloor } from './scene.ts';
import { ROOF_BIN, ROOF_REST, ROOF_WALLS } from './layout.ts';

// Label rasterization is the only browser dependency of the real roof geometry.
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => ({
    beginPath() {}, roundRect() {}, fill() {}, fillText() {},
  }) }),
} });

test('roof walking space reaches real ground without intersecting decoration', () => {
  const roof = createRooftop(new THREE.Group());
  roof.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const x of [-6.58, -4.3, -2.75, 0, 1.2, 2.75, 4, 6.58]) for (const z of [-4.29, -4.08, -2, 0, 2, 4.08]) {
    ray.set(new THREE.Vector3(x, 8, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(roof, true)[0];
    assert.ok(hit?.object.userData.ground, `walking point ${x}, ${z} must stay clear of furniture`);
    assert.ok(Math.abs(hit.point.y) < .1, 'walking surface aligns with character feet');
  }
});

test('bench seat supports the seated player and can be selected from the walking space', () => {
  const roof = createRooftop(new THREE.Group()); roof.updateMatrixWorld(true);
  const seat = ROOF_REST.bench.seat;
  // The seat uses wooden slats: sample the hip footprint, not the gap between slats.
  const ray = new THREE.Raycaster(new THREE.Vector3(seat.x, 2, seat.z + .06), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObject(roof, true)[0];
  assert.ok(hit && Math.abs(hit.point.y - .6175) < .002, 'the player must sit on the real bench seat, not above the floor');
  assert.equal(targetForFloor(hit.object, 'rooftop'), 'roofBench');
  const approach = new THREE.Vector3(1.2, 1.3, -3.95);
  ray.set(approach, new THREE.Vector3(1.2, .58, -4.65).sub(approach).normalize());
  assert.equal(targetForFloor(ray.intersectObject(roof, true)[0].object, 'rooftop'), 'roofBench');
  assert.equal(targetForFloor(hit.object, 'office'), null, 'roof furniture never captures office clicks');
});

test('all four perimeter walls support a resting back and resolve only their own roof target', () => {
  const roof = createRooftop(new THREE.Group()); roof.updateMatrixWorld(true);
  for (const [side, wall] of Object.entries(ROOF_WALLS)) {
    const ray = new THREE.Raycaster(new THREE.Vector3(wall.point.x, 1.35, wall.point.z), new THREE.Vector3(-Math.sin(wall.angle), 0, -Math.cos(wall.angle)));
    const hit = ray.intersectObject(roof, true)[0];
    assert.ok(hit && Math.abs(hit.distance - .4) < .002, `${side} leaning upper back has a wall immediately behind it`);
    assert.equal(targetForFloor(hit.object.parent!, 'rooftop'), wall.target);
    assert.equal(targetForFloor(hit.object, 'office'), null);
    ray.set(new THREE.Vector3(wall.point.x, .3, wall.point.z), new THREE.Vector3(-Math.sin(wall.angle), 0, -Math.cos(wall.angle)));
    assert.equal(targetForFloor(ray.intersectObject(roof, true)[0].object, 'rooftop'), wall.target, `${side} solid wall is clickable`);
    ray.set(new THREE.Vector3(wall.point.x, 4, wall.point.z), new THREE.Vector3(0, -1, 0));
    assert.ok(ray.intersectObject(roof, true)[0].object.userData.ground, `${side} rest point has clear floor beneath it`);
  }
  const officeProp = new THREE.Group(); officeProp.userData.target = 'desk';
  assert.equal(targetForFloor(officeProp, 'rooftop'), null, 'office props cannot become roof targets');
  assert.equal(targetForFloor(officeProp, 'office'), 'desk');
});

test('foreground wall cutaways retain full-height support without hiding the character', () => {
  const roof = createRooftop(new THREE.Group());
  for (const side of ['south', 'east']) {
    const upper = roof.getObjectByName(`${side}-wall-upper`) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    assert.ok(upper, `${side} wall has an upper support panel`);
    assert.equal(upper.material.transparent, true);
    assert.ok(upper.material.opacity <= .2);
    assert.equal(upper.material.depthWrite, false);
    assert.equal(upper.castShadow, false, 'cutaway cannot cast an opaque shadow over the resting character');
    assert.equal(targetForFloor(upper, 'rooftop'), null, 'the cutaway must not intercept floor clicks through the visible panel');
  }
});

test('render batching preserves wall selections and lets taps pass through the foreground cutaway', () => {
  const roof = createRooftop(new THREE.Group()); batchArchitecture(roof); roof.updateMatrixWorld(true);
  for (const [side, wall] of Object.entries(ROOF_WALLS)) {
    const back = new THREE.Vector3(-Math.sin(wall.angle), 0, -Math.cos(wall.angle));
    const ray = new THREE.Raycaster(new THREE.Vector3(wall.point.x, .3, wall.point.z), back);
    assert.equal(targetForFloor(ray.intersectObject(roof, true)[0].object, 'rooftop'), wall.target);
    if (side === 'south' || side === 'east') {
      ray.set(new THREE.Vector3(wall.point.x, 1.35, wall.point.z), back);
      assert.equal(targetForFloor(ray.intersectObject(roof, true)[0].object, 'rooftop'), null);
    }
  }
});

test('a waste bin stands beside the stairwell with an open top and stays within its collision footprint', () => {
  const roof = createRooftop(new THREE.Group()); roof.updateMatrixWorld(true);
  const bin = roof.getObjectByName('rooftop-trashcan');
  assert.ok(bin, 'the rooftop has one recognizable bin');
  assert.equal(bin.position.x, ROOF_BIN.x); assert.equal(bin.position.z, ROOF_BIN.z);
  const bounds = new THREE.Box3().setFromObject(bin), size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.x <= ROOF_BIN.w + .01 && size.z <= ROOF_BIN.d + .01, 'bin decoration agrees with navigation collision bounds');
  assert.ok(size.y > .8 && size.y < 1.1, 'bin is a usable human-scale object');
  const opening = bin.getObjectByName('trashcan-opening') as THREE.Mesh;
  assert.ok(opening && opening.position.y > .8, 'dark top opening reads as a waste bin');
});

test('roof wind detail follows simulation time and becomes still with reduced motion', () => {
  const roof = createRooftop(new THREE.Group());
  const ribbon = roof.getObjectByName('roof-wind-ribbon');
  assert.ok(ribbon, 'a small wind detail makes the quiet rooftop breeze visible');
  animateRooftop(roof, 1.2, false); const first = ribbon.quaternion.clone();
  animateRooftop(roof, 2.5, false);
  assert.ok(first.angleTo(ribbon.quaternion) > .01, 'wind detail gently moves as simulation time advances');
  const paused = ribbon.quaternion.clone(); animateRooftop(roof, 2.5, false);
  assert.ok(paused.angleTo(ribbon.quaternion) < 1e-7, 'paused simulation does not advance the breeze');
  animateRooftop(roof, 4, true); const reduced = ribbon.quaternion.clone();
  animateRooftop(roof, 5, true);
  assert.ok(reduced.angleTo(ribbon.quaternion) < 1e-7, 'reduced motion keeps the detail still');
});

test('floor transition turns in one direction and returns to the original heading', () => {
  const angles = [0, .25, .5, .75, 1].map(progress => transitionOrbit({ duration: 1.6, remaining: 1.6 * (1 - progress) }, false));
  assert.equal(angles[0], 0);
  assert.ok(angles.every((angle, index) => index === 0 || angle > angles[index - 1]));
  assert.ok(Math.abs(angles[4] - 2 * Math.PI) < 1e-8);
  assert.ok(Math.abs(Math.sin(angles[4])) < 1e-8, 'arrival camera matches departure orientation');
  assert.equal(transitionOrbit(null, false), 0);
  assert.equal(transitionOrbit({ duration: .4, remaining: .2 }, true), 0, 'reduced motion never rotates the camera');
});
