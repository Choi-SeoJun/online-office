import type { Point, TargetId } from './types.ts';
import { TARGETS } from './layout.ts';

export type MultiObstacle = Point & { w: number; d: number };
export type MultiDesk = { index: number; point: Point; angle: number; seat: Point };
export type MultiLayout = {
  capacity: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  desks: MultiDesk[];
  obstacles: MultiObstacle[];
  spawn: Point;
  coffee: Point;
  lounge: Point;
  snacks: Point;
  copier: Point;
  boss: Point;
  furniture: { coffee: Point; snacks: Point; copier: Point; lounge: Point; bossDesk: Point };
  targets: Record<TargetId, { label: string; point: Point; action: string }>;
};

export const MULTI_RADIUS = .24;
const PITCH_X = 2.72, PITCH_Z = 6.2, GRID = .34;
const finitePoint = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.z);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);

/** Seat numbers retain their coordinates when the host expands the office. */
export function createMultiLayout(capacity: number): MultiLayout {
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 16) throw new RangeError('회사 정원은 2명부터 16명까지예요.');
  const pairs = Math.ceil(capacity / 2), columns = Math.min(4, pairs), rows = Math.ceil(pairs / 4);
  const desks = Array.from({ length: capacity }, (_, index) => {
    const pair = Math.floor(index / 2), side = index % 2 ? -1 : 1;
    const point = { x: pair % 4 * PITCH_X, z: Math.floor(pair / 4) * PITCH_Z + side * .66 };
    return { index, point, angle: side === 1 ? Math.PI : 0, seat: { x: point.x, z: point.z + side * 1.05 } };
  });
  const bounds = { minX: -6.2, maxX: (columns - 1) * PITCH_X + 2.8, minZ: -7.2, maxZ: (rows - 1) * PITCH_Z + 3.6 };
  const spawn = { x: -2.6, z: 2.7 }, coffee = { x: -3.45, z: -1.8 }, lounge = { x: -4.7, z: 2.7 };
  const snacks = { x: -3.45, z: -4.6 }, copier = { x: .1, z: -4.7 }, boss = { x: -2.6, z: -4.65 };
  const furniture = { coffee: { x: -4.7, z: -1.8 }, snacks: { x: -4.7, z: -4.6 }, copier: { x: .1, z: -6.1 }, lounge: { x: -4.7, z: 1.55 }, bossDesk: { x: -2.6, z: -6.1 } };
  return {
    capacity,
    bounds,
    desks,
    obstacles: [...desks.map(desk => ({ ...desk.point, w: 2.55, d: 1.2 })), { ...furniture.coffee, w: 1.5, d: 1.2 }, { ...furniture.lounge, w: 1.2, d: 1.2 },
      { ...furniture.snacks, w: 1.5, d: 1.2 }, { ...furniture.copier, w: 1.35, d: 1.15 }, { ...furniture.bossDesk, w: 2.55, d: 1.2 },
      { x: bounds.maxX - .6, z: bounds.maxZ - .6, w: .42, d: .42 }, { x: bounds.minX + .65, z: bounds.minZ + .65, w: .42, d: .42 }],
    spawn, coffee, lounge, snacks, copier, boss, furniture,
    targets: { ...TARGETS, desk: { ...TARGETS.desk, point: desks[0].seat }, boss: { ...TARGETS.boss, point: boss },
      coffee: { ...TARGETS.coffee, point: coffee }, snacks: { ...TARGETS.snacks, point: snacks }, lounge: { ...TARGETS.lounge, point: lounge },
      copier: { ...TARGETS.copier, point: copier }, exit: { ...TARGETS.exit, point: spawn } },
  };
}

export function isMultiWalkable(layout: MultiLayout, point: Point) {
  const b = layout.bounds;
  return finitePoint(point) && point.x >= b.minX + MULTI_RADIUS && point.x <= b.maxX - MULTI_RADIUS
    && point.z >= b.minZ + MULTI_RADIUS && point.z <= b.maxZ - MULTI_RADIUS
    && !layout.obstacles.some(o => Math.abs(point.x - o.x) < o.w / 2 + MULTI_RADIUS && Math.abs(point.z - o.z) < o.d / 2 + MULTI_RADIUS);
}

export function isMultiSegmentClear(layout: MultiLayout, start: Point, end: Point) {
  if (!isMultiWalkable(layout, start) || !isMultiWalkable(layout, end)) return false;
  for (const o of layout.obstacles) {
    let enter = 0, leave = 1, intersects = true;
    for (const [origin, delta, min, max] of [
      [start.x, end.x - start.x, o.x - o.w / 2 - MULTI_RADIUS, o.x + o.w / 2 + MULTI_RADIUS],
      [start.z, end.z - start.z, o.z - o.d / 2 - MULTI_RADIUS, o.z + o.d / 2 + MULTI_RADIUS],
    ]) {
      if (Math.abs(delta) < 1e-12) {
        if (origin <= min || origin >= max) { intersects = false; break; }
      } else {
        const a = (min - origin) / delta, b = (max - origin) / delta;
        enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
        if (leave - enter <= 1e-10) { intersects = false; break; }
      }
    }
    if (intersects && leave - enter > 1e-10) return false;
  }
  return true;
}

type Navigation = { nodes: Point[]; open: boolean[]; nx: number; nz: number };
const navigationCache = new WeakMap<MultiLayout, Navigation>();
function navigationFor(layout: MultiLayout) {
  const cached = navigationCache.get(layout); if (cached) return cached;
  const b = layout.bounds, nx = Math.ceil((b.maxX - b.minX - MULTI_RADIUS * 2) / GRID) + 1, nz = Math.ceil((b.maxZ - b.minZ - MULTI_RADIUS * 2) / GRID) + 1;
  const nodes = Array.from({ length: nx * nz }, (_, i) => ({
    x: b.minX + MULTI_RADIUS + i % nx * (b.maxX - b.minX - MULTI_RADIUS * 2) / (nx - 1),
    z: b.minZ + MULTI_RADIUS + Math.floor(i / nx) * (b.maxZ - b.minZ - MULTI_RADIUS * 2) / (nz - 1),
  }));
  const result = { nodes, open: nodes.map(p => isMultiWalkable(layout, p)), nx, nz };
  navigationCache.set(layout, result); return result;
}

/** A blocked click resolves to a nearby floor point, never through a desk. */
export function multiPath(layout: MultiLayout, start: Point, requested: Point): Point[] {
  if (!finitePoint(requested) || !isMultiWalkable(layout, start)) return [];
  const { nodes, open, nx, nz } = navigationFor(layout), b = layout.bounds;
  const bounded = { x: Math.max(b.minX + MULTI_RADIUS, Math.min(b.maxX - MULTI_RADIUS, requested.x)), z: Math.max(b.minZ + MULTI_RADIUS, Math.min(b.maxZ - MULTI_RADIUS, requested.z)) };
  const nearest = (point: Point, visibleFrom?: Point) => {
    let best = -1, score = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const candidate = distance(nodes[i], point);
      if (open[i] && candidate < score && (!visibleFrom || isMultiSegmentClear(layout, visibleFrom, nodes[i]))) { best = i; score = candidate; }
    }
    return best;
  };
  const closest = nearest(bounded); if (closest < 0) return [];
  const goal = isMultiWalkable(layout, bounded) ? bounded : nodes[closest];
  if (isMultiSegmentClear(layout, start, goal)) return [{ ...goal }];
  const first = nearest(start, start), last = nearest(goal, goal); if (first < 0 || last < 0) return [];
  const frontier = new Set([first]), costs = new Map([[first, 0]]), previous = new Map<number, number>();
  while (frontier.size) {
    let current = -1, best = Infinity;
    for (const index of frontier) { const score = costs.get(index)! + distance(nodes[index], nodes[last]); if (score < best) { best = score; current = index; } }
    if (current === last) {
      const path = [goal]; let cursor = last;
      while (cursor !== first) { path.unshift(nodes[cursor]); cursor = previous.get(cursor)!; }
      path.unshift(nodes[first]);
      const result: Point[] = []; let from = start, i = 0;
      while (i < path.length) { let end = path.length - 1; while (end > i && !isMultiSegmentClear(layout, from, path[end])) end--; result.push({ ...path[end] }); from = path[end]; i = end + 1; }
      return result;
    }
    frontier.delete(current); const x = current % nx, z = Math.floor(current / nx);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dz) || x + dx < 0 || x + dx >= nx || z + dz < 0 || z + dz >= nz) continue;
      const next = current + dx + dz * nx;
      if (!open[next] || !isMultiSegmentClear(layout, nodes[current], nodes[next])) continue;
      const candidate = costs.get(current)! + distance(nodes[current], nodes[next]);
      if (candidate < (costs.get(next) ?? Infinity)) { costs.set(next, candidate); previous.set(next, current); frontier.add(next); }
    }
  }
  return [];
}
