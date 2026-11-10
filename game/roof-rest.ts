import { ROOF_OBSTACLES, ROOF_WALLS } from './layout.ts';
import type { Obstacle } from './layout.ts';
import type { Point, RoofWallSide } from './types.ts';

export const ROOF_LEAN_DISTANCE = .9;
export type RoofLean = { wall: RoofWallSide; point: Point; distance: number };

const RADIUS = .22, BACK_INSET = .4, CLEARANCE = .0001;
const SIDES: RoofWallSide[] = ['north', 'south', 'east', 'west'];
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

/** The nearest usable point along a wall, rather than a preselected rest spot. */
export function getRoofLean(point: Point, preferredWall?: RoofWallSide, obstacles: readonly Obstacle[] = ROOF_OBSTACLES): RoofLean | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  if (preferredWall && !SIDES.includes(preferredWall)) return null;
  let best: RoofLean | null = null;
  for (const wall of preferredWall ? [preferredWall] : SIDES) {
    const horizontal = wall === 'north' || wall === 'south';
    const normal = ROOF_WALLS[wall].front + (wall === 'north' || wall === 'west' ? BACK_INSET : -BACK_INSET);
    // At corners, both sides retain the same head/shoulder clearance.
    const min = horizontal ? ROOF_WALLS.west.front + BACK_INSET : ROOF_WALLS.north.front + BACK_INSET;
    const max = horizontal ? ROOF_WALLS.east.front - BACK_INSET : ROOF_WALLS.south.front - BACK_INSET;
    const requested = horizontal ? point.x : point.z;
    const blocked = obstacles.filter(obstacle => Math.abs(normal - (horizontal ? obstacle.z : obstacle.x)) < (horizontal ? obstacle.d : obstacle.w) / 2 + RADIUS)
      .map(obstacle => {
        const center = horizontal ? obstacle.x : obstacle.z, half = (horizontal ? obstacle.w : obstacle.d) / 2 + RADIUS;
        return { min: center - half, max: center + half };
      });
    // A blocked projection is closest to one of the obstacle interval ends.
    // Considering every end also handles touching/overlapping obstacles.
    const tangents = [requested, ...blocked.flatMap(interval => [interval.min - CLEARANCE, interval.max + CLEARANCE])];
    for (const value of tangents) {
      const tangent = clamp(value, min, max);
      if (blocked.some(interval => tangent > interval.min && tangent < interval.max)) continue;
      const destination = horizontal ? { x: tangent, z: normal } : { x: normal, z: tangent };
      const distance = Math.hypot(point.x - destination.x, point.z - destination.z);
      if (!best || distance < best.distance - 1e-8) best = { wall, point: destination, distance };
    }
  }
  return best;
}
