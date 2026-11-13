import type { Point } from './types.ts';

export type BoardRoomBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** The left aisle remains clear of workstations as the shared office expands. */
export function boardApproachPoint(bounds: BoardRoomBounds): Point {
  return { x: bounds.minX + .65, z: bounds.minZ + 4.5 };
}
