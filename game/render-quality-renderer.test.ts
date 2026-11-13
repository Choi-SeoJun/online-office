import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createQualityApplicator } from './render-quality-renderer.ts';
import { AUTO_QUALITY, MANUAL_QUALITY } from './render-quality.ts';

test('only reallocates on actual resolution or shadow changes and releases old targets', () => {
  let ratio = 1, changes = 0, disposals = 0;
  const renderer = { getPixelRatio: () => ratio, setPixelRatio(value: number) { ratio = value; changes++; },
    shadowMap: { enabled: true, needsUpdate: false } };
  const light = new THREE.DirectionalLight();
  light.shadow.map = new THREE.WebGLRenderTarget(2048, 2048);
  light.shadow.map.addEventListener('dispose', () => disposals++);
  const apply = createQualityApplicator(renderer, light);
  apply(AUTO_QUALITY[2], 2);
  assert.equal(ratio, 1.25); assert.equal(light.shadow.mapSize.x, 512);
  assert.equal(light.castShadow, true);
  assert.equal(disposals, 1); assert.equal(light.shadow.map, null);
  for (let i = 0; i < 100; i++) apply(AUTO_QUALITY[2], 2);
  assert.equal(changes, 1); assert.equal(disposals, 1);
  apply(AUTO_QUALITY[0], 2);
  assert.equal(ratio, .75); assert.equal(renderer.shadowMap.enabled, false);
  assert.equal(light.castShadow, false);
  apply(MANUAL_QUALITY.high, 2);
  assert.equal(ratio, 2); assert.equal(light.shadow.mapSize.x, 2048);
  assert.equal(renderer.shadowMap.enabled, true);
  assert.equal(light.castShadow, true);
  apply(MANUAL_QUALITY.high, 1); assert.equal(ratio, 1);
  apply(MANUAL_QUALITY.high, NaN); assert.equal(ratio, 1);
});
