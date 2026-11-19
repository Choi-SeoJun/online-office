import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { prepareCameraCutaways } from './camera-cutaway.ts';
import { createEnvironmentScene, createOfficeWeather, outdoorParticleCount } from './environment-scene.ts';
import type { EnvironmentFrame } from './environment-types.ts';
import { batchArchitecture, isPointerEligible } from './scene.ts';
import { DEFAULT_REGION, environmentFrame } from './environment.ts';
import { requestForecast } from './weather-client.ts';
import { watchLocalWeather } from './weather-refresh.ts';

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
            drawImage() {}, lineTo() {}, stroke() {}, save() {}, restore() {},
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

test('window precipitation animates without replacing its shared texture, and dry weather stops uploads', () => {
  stubCanvas();
  const group = new THREE.Group(), weather = createOfficeWeather();
  weather.addWindow(group, 0, 2, -5.875, 2.52, 1.5);
  weather.addWindow(group, 3, 2, -5.875, 2.52, 1.5);
  const pane = group.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  const other = group.children[2] as typeof pane;
  const texture = pane.material.map!;
  assert.equal(other.material.map, texture);
  const settings = { quality: 'auto' as const, reducedMotion: false };
  const rainy = { ...night, precipitation: 'rain' as const };
  weather.update(rainy, settings, .05);
  let version = texture.version;
  weather.update(rainy, settings, .05);
  assert.ok(texture.version > version, 'rain behind the pane and beads must advance');
  weather.update(night, settings, .05);
  version = texture.version;
  weather.update(night, settings, .05);
  assert.ok(texture.version > version, 'snow beyond the pane must advance');
  weather.update({ ...night, precipitation: 'none' }, settings, .05);
  version = texture.version;
  weather.update({ ...night, precipitation: 'none' }, settings, .05);
  assert.equal(texture.version, version, 'clear weather does not continuously upload a canvas');
  assert.equal(pane.material.map, texture);
});

test('window weather freezes for reduced motion and throttles low quality while reacting immediately to changes', () => {
  stubCanvas();
  const group = new THREE.Group(), weather = createOfficeWeather();
  weather.addWindow(group, 0, 2, -5.875, 2.52, 1.5);
  const texture = (group.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material.map!;
  const settings = { quality: 'low' as const, reducedMotion: false };
  weather.update(night, settings, 0);
  let version = texture.version;
  weather.update(night, settings, .016);
  assert.equal(texture.version, version, 'low quality is not refreshed every frame');
  for (let i = 0; i < 10; i++) weather.update(night, settings, .016);
  assert.ok(texture.version > version);
  weather.update(night, { ...settings, reducedMotion: true }, .05);
  version = texture.version;
  for (let i = 0; i < 15; i++) weather.update(night, { ...settings, reducedMotion: true }, .05);
  assert.equal(texture.version, version, 'reduced motion retains a still weather image');
  weather.update({ ...night, precipitation: 'rain' }, { ...settings, reducedMotion: true }, 0);
  assert.ok(texture.version > version, 'weather changes do not wait for an animation tick');
});

test('automatic forecast refreshes start and stop office and roof precipitation without recreating either scene', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: Date.parse('2026-11-19T03:00:00Z') });
  stubCanvas();
  const codes = [0, 61, 0, 71, 0];
  let code = 0, calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    const time = Date.now() / 1000;
    return Response.json({ source: 'kma', kmaPty: code === 61 ? 1 : code === 71 ? 7 : 0, skyKnown: true, timezone: 'Asia/Seoul',
      current: { time, temperature_2m: 2, cloud_cover: code ? 90 : 10, wind_speed_10m: 2, weather_code: code, is_day: 1 },
      daily: { time: [time], sunrise: [time - 20_000], sunset: [time + 20_000] },
    });
  });
  const scene = new THREE.Scene(), roof = new THREE.Group(), office = new THREE.Group();
  const outdoors = createEnvironmentScene(scene, roof, new THREE.HemisphereLight(), new THREE.DirectionalLight(), new THREE.Color(), new THREE.Color());
  const indoors = createOfficeWeather();
  indoors.addWindow(office, 0, 2, -5.875, 2.52, 1.5);
  const pane = office.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  const texture = pane.material.map!;
  const [rain, snow] = roof.children as [THREE.LineSegments, THREE.Points];
  const settings = { quality: 'low' as const, reducedMotion: false, sound: false, volume: 0 };
  const attempt = { lastAttempt: Date.now(), failures: 0, inFlight: false };
  const window = Object.assign(new EventTarget(), { navigator: { onLine: true }, location: { href: 'https://office.test/' } });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
  t.after(() => { if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window'); });
  const document = Object.assign(new EventTarget(), { hidden: false });
  let pending = Promise.resolve();
  const stop = watchLocalWeather({ window, document, getAttempt: () => attempt, onTick() {}, onRefresh() {
    attempt.inFlight = true;
    pending = requestForecast(DEFAULT_REGION, new AbortController().signal).then(forecast => {
      attempt.lastAttempt = Date.now();
      const frame = environmentFrame(DEFAULT_REGION, forecast, Date.now());
      indoors.update(frame, settings, .05);
      outdoors.update(frame, true, settings, .05);
    }).finally(() => { attempt.inFlight = false; });
  } });
  t.after(() => { stop(); texture.dispose(); outdoors.dispose(); });
  for (const next of codes) {
    code = next;
    const version = texture.version;
    t.mock.timers.tick(5 * 60_000);
    await pending;
    assert.equal(rain.visible, code === 61);
    assert.equal(snow.visible, code === 71);
    assert.ok(texture.version > version, 'the existing office pane receives each new forecast');
    assert.equal(pane.material.map, texture, 'weather changes reuse the scene texture');
  }
  assert.equal(calls, 5, 'the running game fetches automatically once per interval');
});
