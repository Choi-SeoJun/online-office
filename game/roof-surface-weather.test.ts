import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoofSurfaceWeather, stepRoofSurfaceWeather } from './roof-surface-weather.ts';
import { isPointerEligible } from './scene.ts';
import { ROOF_BOUNDS, ROOF_REST } from './layout.ts';

const settings = { quality: 'high' as const, reducedMotion: false };
const advance = (kind: 'none' | 'rain' | 'snow', seconds: number, state = { snow: 0, wet: 0 }) => {
  for (let i = 0; i < seconds * 10; i++) state = stepRoofSurfaceWeather(state, kind, .1);
  return state;
};

test('snow and rain build gradually, stay shallow, and recover after weather clears', () => {
  const first = advance('snow', 5), later = advance('snow', 50);
  assert.ok(first.snow > 0 && first.snow < later.snow && later.snow < 1);
  const full = advance('snow', 240);
  assert.equal(full.snow, 1);
  assert.equal(full.wet, 0);
  const rain = advance('rain', 35, full);
  assert.ok(rain.snow < full.snow && rain.wet > .5);
  const clear = advance('none', 240, rain);
  assert.deepEqual(clear, { snow: 0, wet: 0 });
  for (const dt of [NaN, Infinity, -1]) assert.deepEqual(stepRoofSurfaceWeather(first, 'rain', dt), first);
  assert.deepEqual(stepRoofSurfaceWeather(first, 'rain', 3600), stepRoofSurfaceWeather(first, 'rain', .1));
});

test('roof surface overlays stay shallow, pointer-transparent and own only their resources', () => {
  const roof = new THREE.Group(), existing = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  roof.add(existing);
  const effect = createRoofSurfaceWeather(roof);
  for (let i = 0; i < 1200; i++) effect.update('snow', true, settings, .1);
  const snow = roof.getObjectByName('roof-snow-floor') as THREE.InstancedMesh;
  const caps = roof.getObjectByName('roof-snow-bench') as THREE.InstancedMesh;
  assert.ok(snow.visible && caps.visible);
  assert.equal(isPointerEligible(snow), false);
  assert.equal(isPointerEligible(caps), false);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  for (let i = 0; i < snow.count; i++) {
    snow.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
    assert.ok(position.x - scale.x >= ROOF_BOUNDS.minX && position.x + scale.x <= ROOF_BOUNDS.maxX);
    assert.ok(position.z - scale.z >= ROOF_BOUNDS.minZ && position.z + scale.z <= ROOF_BOUNDS.maxZ);
    assert.ok(position.y + scale.y < .08);
  }
  caps.getMatrixAt(0, matrix); matrix.decompose(position, rotation, scale);
  assert.ok(position.y + scale.y < ROOF_REST.bench.seatTop + .035, 'keep seat caps below the existing seated hips');
  let geometryDisposals = 0, existingDisposals = 0;
  snow.geometry.addEventListener('dispose', () => geometryDisposals++);
  existing.geometry.addEventListener('dispose', () => existingDisposals++);
  effect.dispose(); effect.dispose();
  assert.equal(geometryDisposals, 1);
  assert.equal(existingDisposals, 0);
  assert.deepEqual(roof.children, [existing]);
});

test('rain puddles preserve walking and reduced motion removes ripples; off-roof time still accumulates', () => {
  const roof = new THREE.Group(), effect = createRoofSurfaceWeather(roof);
  for (let i = 0; i < 500; i++) effect.update('rain', false, settings, .1);
  effect.update('rain', true, settings, 0);
  const puddles = roof.getObjectByName('roof-puddles') as THREE.InstancedMesh;
  const ripples = roof.getObjectByName('roof-ripples')!;
  assert.ok(puddles.visible && ripples.visible);
  assert.equal(isPointerEligible(puddles), false);
  effect.update('rain', true, { ...settings, reducedMotion: true }, 0);
  assert.equal(ripples.visible, false);
  assert.equal(puddles.visible, true);
  effect.update('snow', true, settings, .1);
  assert.equal(ripples.visible, false);
  const snow = roof.getObjectByName('roof-snow-floor') as THREE.InstancedMesh;
  const wash = roof.getObjectByName('roof-wet-floor')!;
  assert.ok(wash.renderOrder < puddles.renderOrder && puddles.renderOrder < snow.renderOrder,
    'transparent rain layers must stay beneath snow at every camera angle');
  assert.ok(roof.getObjectByName('roof-wet-bench')!.renderOrder < roof.getObjectByName('roof-snow-bench')!.renderOrder);
  assert.ok(snow.renderOrder < new THREE.Mesh().renderOrder, 'navigation rings at default order stay visible above snow');
  for (let i = 0; i < 2400; i++) effect.update('none', true, settings, .1);
  assert.equal(puddles.visible, false);
  effect.dispose();
});
