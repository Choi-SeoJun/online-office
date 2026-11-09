import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRooftop, transitionOrbit } from './rooftop.ts';

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
  for (const x of [-6.58, -4, 0, 4, 6.58]) for (const z of [-4.08, -2, 0, 2, 4.08]) {
    ray.set(new THREE.Vector3(x, 8, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(roof, true)[0];
    assert.ok(hit?.object.userData.ground, `walking point ${x}, ${z} must stay clear of furniture`);
    assert.ok(Math.abs(hit.point.y) < .1, 'walking surface aligns with character feet');
  }
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
