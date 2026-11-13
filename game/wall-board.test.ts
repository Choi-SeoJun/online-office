import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BOUNDS, OBSTACLES } from './layout.ts';
import { createMultiLayout, isMultiWalkable, multiPath } from './multi-layout.ts';
import { boardApproachPoint } from './wall-board-layout.ts';
import { createWallBoard, isBoardHit } from './wall-board.ts';
import { batchArchitecture } from './scene.ts';
import type { BoardEntry } from './board-types.ts';

let fontsReady: (() => void) | undefined;
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  get fonts() { return { ready: new Promise<void>(resolve => { fontsReady = resolve; }) }; },
  createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({
    measureText: (text: string) => ({ width: text.length * 15 }),
  }, { get: (object, key) => key in object ? object[key as keyof typeof object] : () => {} }) }),
} });

test('board approach stays in the clear west aisle in solo and all multiplayer sizes', () => {
  const point = boardApproachPoint(BOUNDS);
  assert.ok(point.x > BOUNDS.minX + .22 && point.x < BOUNDS.maxX - .22);
  assert.ok(!OBSTACLES.some(o => Math.abs(point.x - o.x) < o.w / 2 + .22 && Math.abs(point.z - o.z) < o.d / 2 + .22));
  for (let capacity = 2; capacity <= 16; capacity++) {
    const layout = createMultiLayout(capacity), approach = boardApproachPoint(layout.bounds);
    assert.ok(isMultiWalkable(layout, approach));
    assert.deepEqual(multiPath(layout, layout.spawn, approach).at(-1), approach);
  }
});

test('framed board faces inward from the left wall and keeps its own hit after batching', () => {
  const group = new THREE.Group(), board = createWallBoard(group, BOUNDS, BOUNDS.minX - .4);
  batchArchitecture(group); group.updateMatrixWorld(true);
  const approach = boardApproachPoint(BOUNDS), bounds = new THREE.Box3().setFromObject(board.root);
  assert.ok(bounds.max.x < BOUNDS.minX, 'fixture is on the wall, outside the walking aisle');
  assert.ok(bounds.min.z > BOUNDS.minZ + 2, 'fixture is away from the rear window wall');
  assert.ok(bounds.min.y > .8, 'board never occupies the walking floor');
  const ray = new THREE.Raycaster(new THREE.Vector3(approach.x, 1.95, approach.z), new THREE.Vector3(-1, 0, 0));
  const hit = ray.intersectObject(group, true)[0];
  assert.ok(hit); assert.equal(isBoardHit(hit.object, 'office'), true); assert.equal(isBoardHit(hit.object, 'rooftop'), false);
  group.visible = false; assert.equal(isBoardHit(hit.object, 'office'), false);
  board.dispose();
});

test('board repaints only changed content, refreshes after fonts load and releases its resources', async () => {
  const board = createWallBoard(new THREE.Group(), BOUNDS), texture = board.surface.material.map!;
  const entries: BoardEntry[] = [{ id: '12345678-1234-4123-a123-123456789abc', kind: 'note', color: 'yellow', text: '회의 시간', strokes: [], authorId: 'test', authorName: '동료', createdAt: 1 }];
  board.update(entries); const first = texture.version;
  board.update(entries); board.update(structuredClone(entries)); assert.equal(texture.version, first);
  board.update([{ ...entries[0], text: '회의 장소' }]); assert.ok(texture.version > first);
  const beforeFonts = texture.version; fontsReady?.(); await Promise.resolve(); assert.ok(texture.version > beforeFonts);
  const layout = createMultiLayout(16); board.setBounds(layout.bounds); board.root.updateMatrixWorld(true);
  assert.ok(Math.abs(board.root.position.z - boardApproachPoint(layout.bounds).z) < 1e-8);
  let releases = 0; texture.addEventListener('dispose', () => { releases++; });
  board.dispose(); board.dispose(); assert.equal(releases, 1); assert.equal(board.root.parent, null);
  const released = texture.version; board.update(entries); assert.equal(texture.version, released);
});
