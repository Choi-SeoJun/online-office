import type { Point, RoofWallSide } from './types.ts';

export const CAMERA_TURN_STEP = Math.PI / 4;
export const CAMERA_DRAG_THRESHOLD = 8;
export const CAMERA_BASE_ANGLE = Math.atan2(16, 24);

export function normalizeCameraAngle(angle: number) {
  return Number.isFinite(angle) ? Math.atan2(Math.sin(angle), Math.cos(angle)) : 0;
}

export function smoothCameraAngle(current: number, target: number, dt: number, reducedMotion: boolean) {
  return reducedMotion ? normalizeCameraAngle(target) : current + normalizeCameraAngle(target - current) * (1 - Math.exp(-Math.max(0, dt) * 12));
}

/** Null means a tap; once a drag starts, the caller must retain that decision. */
export function cameraDragAngle(dx: number, dy: number): number | null {
  return Math.hypot(dx, dy) > CAMERA_DRAG_THRESHOLD ? -dx * .009 + 0 : null;
}

export function screenAxisToWorld(axis: Point, orbit: number): Point {
  if (!axis.x && !axis.z) return {x:0,z:0};
  const angle = CAMERA_BASE_ANGLE + orbit, c = Math.cos(angle), s = Math.sin(angle);
  return {x:axis.x*c+axis.z*s,z:-axis.x*s+axis.z*c};
}

export function wallFacesCamera(side: RoofWallSide, offset: Point) {
  return side === 'north' ? offset.z < -.2 : side === 'south' ? offset.z > .2 : side === 'east' ? offset.x > .2 : offset.x < -.2;
}
