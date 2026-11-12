import type { Point, RoofWallSide, TargetId } from './types.ts';
import { ROOF_BENCH_SEATS } from './rest-seats.ts';

export const BOUNDS = { minX: -8.6, maxX: 8.6, minZ: -5.6, maxZ: 5.6 };
export const START: Point = { x: 1.8, z: 5.0 };
export const ROOF_BOUNDS = { minX: -8.9, maxX: 8.9, minZ: -5.9, maxZ: 5.9 };
export const ROOF_START: Point = { x: 0, z: 2.4 };
export const ROOF_WALLS = {
  north: { target: 'roofWall', label: '뒤쪽 벽', point: { x: -4.3, z: -5.51 }, center: { x: 0, z: -6 }, width: 18.1, depth: .18, height: 1.8, front: -5.91, angle: 0 },
  south: { target: 'roofWallSouth', label: '앞쪽 벽', point: { x: 0, z: 5.51 }, center: { x: 0, z: 6 }, width: 18.1, depth: .18, height: 1.8, front: 5.91, angle: Math.PI },
  east: { target: 'roofWallEast', label: '오른쪽 벽', point: { x: 8.51, z: .4 }, center: { x: 9, z: 0 }, width: 12.1, depth: .18, height: 1.8, front: 8.91, angle: -Math.PI / 2 },
  west: { target: 'roofWallWest', label: '왼쪽 벽', point: { x: -8.51, z: .4 }, center: { x: -9, z: 0 }, width: 12.1, depth: .18, height: 1.8, front: -8.91, angle: Math.PI / 2 },
} as const;
export const roofWallForTarget = (target: TargetId): RoofWallSide | null => (Object.keys(ROOF_WALLS) as RoofWallSide[]).find(side => ROOF_WALLS[side].target === target) ?? null;
export const ROOF_BIN = { x: -7.8, z: -2.9, w: .66, d: .66 };
// Leave a continuous walking and leaning strip around the entire perimeter.
export const ROOF_STAIRS = { x: -6.9, z: -4.15, w: 1.78, d: 1.74 };
export const ROOF_PLANTERS = [-7.2, 7.2].flatMap(x => [-1.3, 2.2, 4].map(z => ({ x, z, w: 1.05, d: 1.2 })));
export const ROOF_REST = {
  bench: { point: ROOF_BENCH_SEATS[0].approach, seat: ROOF_BENCH_SEATS[0].seat, seatTop: 0.6175, angle: 0 },
  wall: ROOF_WALLS.north,
} as const;
export const isRoofTarget = (target: TargetId) => target === 'roofBench' || roofWallForTarget(target) !== null;
export const DESKS = [
  { x: -6, z: -1.2, owner: 'colleague-0' },
  { x: -2, z: -1.2, owner: 'colleague-1' },
  { x: 2, z: -1.2, owner: null },
  { x: -6, z: 2.2, owner: null },
  { x: -2, z: 2.2, owner: 'colleague-2' },
  { x: 2, z: 2.2, owner: 'player' },
] as const;
export type Obstacle = { x: number; z: number; w: number; d: number };
export const ROOF_OBSTACLES: Obstacle[] = [
  ROOF_STAIRS,
  { x: 1.2, z: -4.65, w: 3.1, d: .7 },
  ...ROOF_PLANTERS,
  ROOF_BIN,
];
export const OBSTACLES: Obstacle[] = [
  ...DESKS.map(d => ({ x: d.x, z: d.z, w: 2.55, d: 1.2 })),
  { x: -6, z: -4.7, w: 3.0, d: 1.2 },
  { x: 7.6, z: -4.3, w: 1.7, d: 1.5 },
  { x: 7.6, z: -1.8, w: 1.7, d: 1.5 },
  { x: 6.8, z: 2.1, w: 1.5, d: 1.4 },
  { x: -7.8, z: 4.6, w: 1.35, d: 1.15 },
  { x: 4.3, z: -3.0, w: 0.18, d: 4.6 },
];
export const TARGETS: Record<TargetId, { label: string; point: Point; action: string }> = {
  desk: { label: '내 자리', point: { x: 2, z: 3.25 }, action: '앉기' },
  boss: { label: '상사', point: { x: -6, z: -3.55 }, action: '골탕먹이기' },
  coffee: { label: '커피 머신', point: { x: 6.0, z: -4.1 }, action: '커피 내리기' },
  snacks: { label: '과자 선반', point: { x: 6.0, z: -1.8 }, action: '과자 챙기기' },
  lounge: { label: '탕비실', point: { x: 6.8, z: 3.4 }, action: '잠깐 앉기' },
  copier: { label: '복사기', point: { x: -6.4, z: 4.6 }, action: '구경하기' },
  exit: { label: '출입구', point: START, action: '퇴근하기' },
  roofBench: { label: '옥상 벤치', point: ROOF_REST.bench.point, action: '벤치에 앉기' },
  roofWall: { label: '뒤쪽 벽', point: ROOF_WALLS.north.point, action: '벽에 기대기' },
  roofWallSouth: { label: '앞쪽 벽', point: ROOF_WALLS.south.point, action: '벽에 기대기' },
  roofWallEast: { label: '오른쪽 벽', point: ROOF_WALLS.east.point, action: '벽에 기대기' },
  roofWallWest: { label: '왼쪽 벽', point: ROOF_WALLS.west.point, action: '벽에 기대기' },
};
export const WEAPONS = {
  punch: { label: '펀치', interval: 0.55 }, hammer: { label: '뿅망치', interval: 0.85 }, fan: { label: '서류 뭉치', interval: 0.9 },
} as const;
export const WEAPON_IMPACT = .43;
export const SNACKS = { cookie: '쿠키', choco: '초코바', cracker: '크래커' } as const;
