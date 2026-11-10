import type { Point, RoofWallSide } from './types.ts';

export const CAMERA_TURN_STEP = Math.PI / 4;
export const CAMERA_DRAG_THRESHOLD = 8;
export const CAMERA_BASE_ANGLE = Math.atan2(16, 24);
export const CAMERA_BASE_PITCH = Math.atan2(20, Math.hypot(16, 24));
export const CAMERA_MIN_PITCH = Math.PI / 9;
export const CAMERA_MAX_PITCH = Math.PI * 5 / 12;
export const CAMERA_TILT_STEP = Math.PI / 18;

export function clampCameraPitch(pitch: number) {
  return Number.isFinite(pitch) ? Math.max(CAMERA_MIN_PITCH, Math.min(CAMERA_MAX_PITCH, pitch)) : CAMERA_BASE_PITCH;
}

export function smoothCameraPitch(current: number, target: number, dt: number, reducedMotion: boolean) {
  const destination = clampCameraPitch(target);
  return reducedMotion ? destination : clampCameraPitch(current + (destination - current) * (1 - Math.exp(-Math.max(0, dt) * 12)));
}

/** Mutates the reusable camera vector without allocating on every animation frame. */
export function setCameraOffset<T extends {x: number; y: number; z: number}>(out: T, orbit: number, pitch: number, radius: number): T {
  const elevation = clampCameraPitch(pitch), angle = CAMERA_BASE_ANGLE + orbit, horizontal = Math.cos(elevation) * radius;
  out.x = Math.sin(angle) * horizontal; out.y = Math.sin(elevation) * radius; out.z = Math.cos(angle) * horizontal;
  return out;
}

export function normalizeCameraAngle(angle: number) {
  return Number.isFinite(angle) ? Math.atan2(Math.sin(angle), Math.cos(angle)) : 0;
}

export function smoothCameraAngle(current: number, target: number, dt: number, reducedMotion: boolean) {
  return reducedMotion ? normalizeCameraAngle(target) : current + normalizeCameraAngle(target - current) * (1 - Math.exp(-Math.max(0, dt) * 12));
}

/** Null means a tap; once a drag starts, the caller must retain that decision. */
export function cameraDragRotation(dx: number, dy: number): {orbit: number; pitch: number} | null {
  return Math.hypot(dx, dy) > CAMERA_DRAG_THRESHOLD ? {orbit: -dx * .009 + 0, pitch: dy * .006 + 0} : null;
}

export function screenAxisToWorld(axis: Point, orbit: number): Point {
  if (!axis.x && !axis.z) return {x:0,z:0};
  const angle = CAMERA_BASE_ANGLE + orbit, c = Math.cos(angle), s = Math.sin(angle);
  return {x:axis.x*c+axis.z*s,z:-axis.x*s+axis.z*c};
}

export function wallFacesCamera(side: RoofWallSide, offset: Point) {
  return side === 'north' ? offset.z < -.2 : side === 'south' ? offset.z > .2 : side === 'east' ? offset.x > .2 : offset.x < -.2;
}
