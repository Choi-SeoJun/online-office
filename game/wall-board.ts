import * as THREE from 'three';
import { BOARD_HEIGHT, BOARD_WIDTH, drawBoard } from './board-render.ts';
import type { BoardEntry } from './board-types.ts';
import type { Floor } from './types.ts';
import { boardApproachPoint, WALL_BOARD_HEIGHT, WALL_BOARD_WIDTH, type BoardRoomBounds } from './wall-board-layout.ts';

export { boardApproachPoint } from './wall-board-layout.ts';
const EMPTY_ENTRIES: BoardEntry[] = [];

/** Board clicks are separate from movement targets and only belong to the office. */
export function isBoardHit(object: THREE.Object3D, floor: Floor): boolean {
  if (floor !== 'office') return false;
  let board = false;
  for (let ancestor: THREE.Object3D | null = object; ancestor; ancestor = ancestor.parent) {
    if (!ancestor.visible || ancestor.userData.pointerPassthrough) return false;
    if (ancestor.userData.board) board = true;
  }
  return board;
}

/** Owned resources let the board move to a resized room without being rebuilt. */
export function createWallBoard(parent: THREE.Object3D, bounds: BoardRoomBounds, wallX = bounds.minX) {
  const root = new THREE.Group(); root.name = 'office-wall-board';
  root.userData.board = true; root.userData.dynamic = true; root.rotation.y = Math.PI / 2; parent.add(root);
  const wood = new THREE.MeshStandardMaterial({ color: '#8d6546', roughness: .9 });
  const cork = new THREE.MeshStandardMaterial({ color: '#bda074', roughness: 1 });
  const geometries: THREE.BufferGeometry[] = [];
  const block = (width: number, height: number, depth: number, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const geometry = new THREE.BoxGeometry(width, height, depth); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh;
  };
  const width = WALL_BOARD_WIDTH, height = WALL_BOARD_HEIGHT;
  block(width + .22, height + .22, .08, wood);
  block(width + .10, height + .10, .015, cork, 0, 0, .0475);
  for (const side of [-1, 1]) {
    block(width + .22, .10, .105, wood, 0, side * (height / 2 + .06), .015);
    block(.10, height + .02, .105, wood, side * (width / 2 + .06), 0, .015);
  }
  const canvas = document.createElement('canvas'); canvas.width = BOARD_WIDTH; canvas.height = BOARD_HEIGHT;
  const context = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const face = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const geometry = new THREE.PlaneGeometry(width, height); geometries.push(geometry);
  const surface = new THREE.Mesh(geometry, face); surface.name = 'office-wall-board-content'; surface.position.z = .056; root.add(surface);
  let disposed = false, previous: BoardEntry[] | null = null, fingerprint = '', current = EMPTY_ENTRIES;
  const paint = () => { if (!disposed) { drawBoard(context, current, BOARD_WIDTH, BOARD_HEIGHT); texture.needsUpdate = true; } };
  const update = (entries: BoardEntry[] = EMPTY_ENTRIES) => {
    if (disposed || entries === previous) return;
    previous = entries; current = entries;
    const next = JSON.stringify(entries);
    if (next === fingerprint) return;
    fingerprint = next; paint();
  };
  const setBounds = (next: BoardRoomBounds, nextWallX = next.minX) => {
    const approach = boardApproachPoint(next); root.position.set(nextWallX + .045, 1.90, approach.z);
  };
  setBounds(bounds, wallX); update();
  void document.fonts?.ready.then(paint);
  const dispose = () => {
    if (disposed) return;
    disposed = true; root.removeFromParent(); geometries.forEach(item => item.dispose());
    texture.dispose(); face.dispose(); cork.dispose(); wood.dispose();
  };
  return { root, surface, update, setBounds, dispose };
}
