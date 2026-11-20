import { ROOF_BOUNDS, ROOF_OBSTACLES } from './layout.ts';
import type { Point, WeatherPlayKind } from './types.ts';
import type { Precipitation } from './environment-types.ts';

export const WEATHER_CREATION_LIMIT = 6;
export const WEATHER_CREATION_LIFETIME = 120;
export const WEATHER_PLAY_DURATIONS: Record<WeatherPlayKind, number> = { snowman: 3.2, snowduck: 2.4, 'make-snowball': 1.8, snowball: 1.6, splash: 2.7 };
export function isWeatherPlay(kind: unknown): kind is WeatherPlayKind {
  return kind === 'snowman' || kind === 'snowduck' || kind === 'make-snowball' || kind === 'snowball' || kind === 'splash';
}
export const weatherAllowsPlay = (weather: Precipitation, kind: WeatherPlayKind) => weather === (kind === 'splash' ? 'rain' : 'snow');
export function isWeatherPlayPoint(point: Point) {
  const b = ROOF_BOUNDS, margin = .46;
  return Number.isFinite(point.x) && Number.isFinite(point.z)
    && point.x >= b.minX + margin && point.x <= b.maxX - margin && point.z >= b.minZ + margin && point.z <= b.maxZ - margin
    && !ROOF_OBSTACLES.some(o => Math.abs(o.x - point.x) < o.w / 2 + margin && Math.abs(o.z - point.z) < o.d / 2 + margin);
}
/** Pick a nearby open patch, turning inward when a player rests at the parapet. */
export function weatherPlayPoint(actor: Point & { angle: number }, reach = 1.05): Point | null {
  for (const turn of [0, .5, -.5, 1, -1, 1.5, -1.5, Math.PI]) {
    const point = { x: actor.x + Math.sin(actor.angle + turn) * reach, z: actor.z + Math.cos(actor.angle + turn) * reach };
    if (isWeatherPlayPoint(point)) return point;
  }
  return null;
}

export function weatherCraftPoint(actor: Point & { angle: number }, creations: readonly Point[]): Point | null {
  for (const reach of [1.05, 1.8, 2.5]) for (let i = 0; i < 12; i++) {
    const angle = actor.angle + Math.ceil(i / 2) * Math.PI / 6 * (i % 2 ? 1 : -1);
    const point = { x: actor.x + Math.sin(angle) * reach, z: actor.z + Math.cos(angle) * reach };
    if (isWeatherCraftPointFree(point, creations)) return point;
  }
  return null;
}

export const isWeatherCraftPointFree = (point: Point, occupied: readonly Point[]) => isWeatherPlayPoint(point)
  && occupied.every(other => Math.hypot(other.x - point.x, other.z - point.z) >= .75);
