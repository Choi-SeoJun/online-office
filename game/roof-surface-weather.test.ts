import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoofSurfaceWeather, stepRoofSurfaceWeather } from './roof-surface-weather.ts';
import { isPointerEligible } from './scene.ts';
import { ROOF_BOUNDS, ROOF_REST } from './layout.ts';
import { createRooftop } from './rooftop.ts';
import { prepareCameraCutaways } from './camera-cutaway.ts';
import { batchArchitecture } from './scene.ts';

Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => ({ beginPath() {}, roundRect() {}, fill() {}, fillText() {} }) }),
} });

const settings = { quality: 'high' as const, reducedMotion: false };
const advance = (kind: 'none' | 'rain' | 'snow', seconds: number, state = { snow: 0, wet: 0 }) => {
  for (let i = 0; i < seconds * 10; i++) state = stepRoofSurfaceWeather(state, kind, .1);
  return state;
};

test('snow covers real parapets, stair roof and plants after batching, without obscuring cutaway walls', () => {
  const roof = createRooftop(new THREE.Group(), true), cutaways = prepareCameraCutaways(roof);
  batchArchitecture(roof);
  const effect = createRoofSurfaceWeather(roof);
  cutaways({ x: 12, z: 18 }); effect.update('snow', true, settings, .1);
  for (const side of ['north', 'south', 'east', 'west']) {
    const cap = roof.getObjectByName(`roof-snow-${side}`) as THREE.InstancedMesh;
    assert.ok(cap?.visible && cap.count > 0, `snow covers ${side} parapet`);
    assert.equal(isPointerEligible(cap), false);
  }
  const caps = roof.getObjectByName('roof-snow-objects') as THREE.InstancedMesh;
  assert.ok(caps?.count > 15, 'stairwell, planters and leaf crowns receive snow');
  const fullCount = caps.count;
  const matrix = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), scale = new THREE.Vector3();
  let stair = false, plant = false;
  for (let i = 0; i < caps.count; i++) {
    caps.getMatrixAt(i, matrix); matrix.decompose(p, q, scale);
    if (p.y > 2.92 && p.y < 2.96) stair = true;
    if (p.y > 1.3 && p.y < 1.8 && scale.x < .5) plant = true;
    assert.ok(scale.y <= .16, 'shallow caps must not turn objects into snow walls');
  }
  assert.ok(stair && plant);
  const south = roof.getObjectByName('roof-snow-south') as THREE.Mesh;
  const material = south.material as THREE.MeshStandardMaterial;
  const faded = material.opacity; assert.ok(faded < .2);
  cutaways({ x: -12, z: -18 }); effect.update('snow', true, { ...settings, quality: 'low' }, .1);
  assert.ok(material.opacity > faded * 3); assert.ok(caps.count < fullCount);
  for (let i = 0; i < 1300; i++) effect.update('none', true, settings, .1);
  assert.equal(caps.visible, false);
  effect.dispose(); assert.equal(roof.getObjectByName('roof-snow-objects'), undefined);
});

test('first snowy or rainy frame already has visible cosmetic coverage', () => {
  for (const kind of ['snow', 'rain'] as const) {
    const roof = new THREE.Group(), effect = createRoofSurfaceWeather(roof);
    effect.update('none', true, settings, 0);
    effect.update(kind, true, settings, 0);
    const mesh = roof.getObjectByName(kind === 'snow' ? 'roof-snow-floor' : 'roof-puddles') as THREE.Mesh;
    assert.equal(mesh.visible, true);
    assert.ok((mesh.material as THREE.MeshStandardMaterial).opacity > .2);
    effect.dispose();
  }
});

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
