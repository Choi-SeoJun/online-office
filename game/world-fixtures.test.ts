import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGameEngine } from './engine.ts';
import { createMultiLayout } from './multi-layout.ts';
import { createMultiArchitecture } from './multi-scene.ts';
import { createRooftop } from './rooftop.ts';
import { animateActor, createActor } from './models.ts';
import { ROOF_WALLS } from './layout.ts';

const painted: string[] = [];
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({
    fillText(text: string) { painted.push(text); }, measureText: (text: string) => ({ width: text.length * 20 }),
  }, { get: (object, key) => key in object ? object[key as keyof typeof object] : () => {} }) }),
} });

test('office fixtures have no floating labels while actors retain readable identity labels', () => {
  const architecture = createMultiArchitecture(createMultiLayout(16));
  const labels: THREE.Sprite[] = []; architecture.group.traverse(object => { if (object instanceof THREE.Sprite) labels.push(object); });
  assert.equal(labels.length, 0, 'furniture must be recognizable from its model without a bubble');
  const rig = createActor(new THREE.Group(), 0, '동료');
  assert.ok(rig.label instanceof THREE.Sprite); assert.ok(rig.label.visible);
  architecture.release();
});

test('boss label preserves the supplied honorific without appending the rank again', () => {
  const game = createGameEngine().state; game.boss.name = '부장님'; game.boss.rank = '부장';
  const rig = createActor(new THREE.Group(), 1, game.boss.name);
  animateActor(rig, game.boss, game, 0);
  assert.equal(rig.lastName, '부장님');
  game.player.name = '민수'; game.player.rank = '사원';
  const employee = createActor(new THREE.Group(), 0, game.player.name); animateActor(employee, game.player, game, 0);
  assert.equal(employee.lastName, '민수 사원');
});

test('roof phrase is transparent wall lettering facing inward with ordinary depth', () => {
  const roof = createRooftop(new THREE.Group()); roof.updateMatrixWorld(true);
  const sign = roof.getObjectByName('rooftop-sign');
  assert.ok(sign instanceof THREE.Mesh, 'painted text is a fixed wall plane');
  const material = sign.material as THREE.MeshBasicMaterial;
  assert.equal(material.transparent, true); assert.equal(material.depthTest, true);
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(sign.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(normal.z > .999, 'north-wall lettering faces the room');
  const position = sign.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(position.z - ROOF_WALLS.north.front) < .01);
  assert.ok(position.y < ROOF_WALLS.north.height, 'text belongs on the wall, not floating above it');
  assert.ok((material.map!.image as HTMLCanvasElement).width >= 1024, 'lettering keeps a readable raster');
  assert.ok(painted.includes('잠깐, 숨 돌리는 곳'));
});
