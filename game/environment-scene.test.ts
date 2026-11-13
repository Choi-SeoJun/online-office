import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { prepareCameraCutaways } from './camera-cutaway.ts';
import { createEnvironmentScene, createOfficeWeather, outdoorParticleCount } from './environment-scene.ts';
import type { EnvironmentFrame } from './environment-types.ts';
import { batchArchitecture, isPointerEligible } from './scene.ts';

test('precipitation is bounded outdoors and honors graphics and motion settings', () => {
  assert.equal(outdoorParticleCount('rain', false, 'high', false), 0);
  assert.equal(outdoorParticleCount('snow', true, 'high', true), 0);
  assert.equal(outdoorParticleCount('none', true, 'high', false), 0);
  assert.ok(outdoorParticleCount('snow', true, 'low', false) > 0);
  assert.ok(outdoorParticleCount('rain', true, 'low', false) < outdoorParticleCount('rain', true, 'high', false));
  assert.ok(outdoorParticleCount('rain', true, 'high', false) <= 160);
});

function stubCanvas() {
  const gradient = { addColorStop() {} };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement() {
      return {
        width: 0, height: 0,
        getContext() {
          return {
            canvas: this,
            createLinearGradient: () => gradient, createRadialGradient: () => gradient,
            fillRect() {}, beginPath() {}, moveTo() {}, arc() {}, ellipse() {}, fill() {},
          };
        },
      };
    },
  } });
}

const night: EnvironmentFrame = {
  now: Date.UTC(2026, 10, 13, 14), daylight: 0, sunset: 0, cloud: .4, precipitation: 'snow',
  season: 'winter', solarAltitude: -.8, azimuth: 4,
};

test('weather window retains its map through cutaways and sunset floor light remains pointer-transparent', () => {
  stubCanvas();
  const office = new THREE.Group();
  const weather = createOfficeWeather();
  weather.addWindow(office, 0, 2, -5.875, 2.52, 1.5);
  const [window, patch] = office.children as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[];
  const texture = window.material.map;
  const cutaways = prepareCameraCutaways(office, true);
  batchArchitecture(office);
  assert.equal(office.children[0], window);
  assert.equal(window.material.map, texture);
  assert.equal(window.castShadow, false);
  assert.equal(isPointerEligible(patch), false);

  weather.update(night);
  assert.equal(patch.visible, false);
  weather.update({ ...night, now: night.now + 10_001, daylight: .45, sunset: .9 });
  assert.ok(patch.material.opacity > .1);
  const version = texture!.version;
  weather.update({ ...night, now: night.now + 10_002, daylight: .45, sunset: .9 });
  assert.equal(texture!.version, version);
  cutaways({ x: 0, z: -10 });
  assert.equal(window.material.opacity, .14);
  cutaways({ x: 0, z: 10 });
  assert.equal(window.material.opacity, 1);
  assert.equal(window.castShadow, false);
});

test('roof effects stay outside, switch precipitation and release their GPU resources', () => {
  stubCanvas();
  const scene = new THREE.Scene(), roof = new THREE.Group();
  const ambient = new THREE.HemisphereLight('#fff8e7', '#a1b5a7', 2.4);
  const sun = new THREE.DirectionalLight('#fff4d9', 3.2);
  const weather = createEnvironmentScene(scene, roof, ambient, sun, new THREE.Color('#e7e9df'), new THREE.Color('#e6d6bf'));
  const settings = { reducedMotion: false, quality: 'low' as const, sound: false, volume: 0 };
  const [rain, snow] = roof.children as [THREE.LineSegments, THREE.Points];
  weather.update(night, false, settings, .016);
  assert.equal(snow.visible, false);
  assert.ok(ambient.intensity >= 2, 'interior remains lit after dark');
  weather.update(night, true, settings, .016);
  assert.equal(snow.visible, true);
  assert.equal(snow.geometry.drawRange.count, 32);
  assert.equal(isPointerEligible(snow), false);
  assert.ok(scene.background instanceof THREE.CanvasTexture);
  weather.update({ ...night, precipitation: 'rain' }, true, settings, .016);
  assert.equal(snow.visible, false);
  assert.equal(rain.visible, true);
  assert.equal(rain.geometry.drawRange.count, 64);
  weather.update(night, true, { ...settings, reducedMotion: true }, .016);
  assert.equal(snow.visible, false);
  const disposed: string[] = [];
  scene.background.addEventListener('dispose', () => disposed.push('sky'));
  snow.geometry.addEventListener('dispose', () => disposed.push('snow'));
  weather.dispose();
  assert.deepEqual(disposed, ['sky', 'snow']);
  assert.equal(roof.children.length, 0);
});
