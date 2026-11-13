import type { Point } from './types.ts';

export type BoardRoomBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export const WALL_BOARD_WIDTH = 5.76;
export const WALL_BOARD_HEIGHT = 1.92;

/** The left aisle remains clear of workstations as the shared office expands. */
export function boardApproachPoint(bounds: BoardRoomBounds): Point {
  // Keep the boss-side edge in place and extend along the empty wall.
  return { x: bounds.minX + .65, z: bounds.minZ + 4.5 + (WALL_BOARD_WIDTH - 3.2) / 2 };
}

/** The whole board can be approached, including either end of the wider frame. */
export function isNearWallBoard(point: Point, bounds: BoardRoomBounds, distance = 2): boolean {
  const center = boardApproachPoint(bounds);
  const beyondEnd = Math.max(0, Math.abs(point.z - center.z) - WALL_BOARD_WIDTH / 2);
  return Math.hypot(point.x - center.x, beyondEnd) <= distance;
}
