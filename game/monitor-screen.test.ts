import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMonitorScreen } from './monitor-screen.ts';
test('monitor keeps only the latest image, restores its own default and releases replaced textures', () => {
  const original = new THREE.MeshStandardMaterial(), screen = new THREE.Mesh(new THREE.BoxGeometry(), original);
  const jobs: { image: string; done: (image: HTMLImageElement) => void }[] = [];
  const monitor = createMonitorScreen(screen, (image, done) => jobs.push({ image, done }));
  monitor.set('first'); monitor.set('second'); monitor.set('second'); assert.equal(jobs.length, 2);
  jobs[0].done({} as HTMLImageElement); assert.equal(screen.material, original);
  jobs[1].done({} as HTMLImageElement);
  const replacement = screen.material as unknown as THREE.MeshBasicMaterial;
  assert.ok(replacement.map); assert.equal(replacement.map.colorSpace, THREE.SRGBColorSpace);
  let releases = 0; replacement.addEventListener('dispose', () => releases++); replacement.map.addEventListener('dispose', () => releases++);
  monitor.set(null); assert.equal(screen.material, original); assert.equal(releases, 2);
  monitor.set('third'); monitor.dispose(); jobs[2].done({} as HTMLImageElement); assert.equal(screen.material, original);
  monitor.set('fourth'); assert.equal(jobs.length, 3); monitor.dispose();
});
test('two desks keep independent images and resetting one does not clear its neighbour', () => {
  const a = new THREE.Mesh(), b = new THREE.Mesh(), originalB = b.material;
  const immediate = (source: string, done: (image: HTMLImageElement) => void) => done({ src: source } as HTMLImageElement);
  const first = createMonitorScreen(a, immediate), second = createMonitorScreen(b, immediate);
  first.set('red'); second.set('blue');
  assert.equal(((a.material as THREE.MeshBasicMaterial).map!.image as HTMLImageElement).src, 'red');
  assert.equal(((b.material as THREE.MeshBasicMaterial).map!.image as HTMLImageElement).src, 'blue');
  first.set(null); assert.notEqual(b.material, originalB); first.dispose(); second.dispose();
});
