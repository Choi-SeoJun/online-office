import type { Point, TargetId } from './types.ts';

export const BOUNDS = { minX: -8.6, maxX: 8.6, minZ: -5.6, maxZ: 5.6 };
export const START: Point = { x: 1.8, z: 5.0 };
export const ROOF_BOUNDS = { minX: -6.8, maxX: 6.8, minZ: -4.3, maxZ: 4.3 };
export const ROOF_START: Point = { x: 0, z: 2.4 };
export const DESKS = [
  { x: -6, z: -1.2, owner: 'colleague-0' },
  { x: -2, z: -1.2, owner: 'colleague-1' },
  { x: 2, z: -1.2, owner: null },
  { x: -6, z: 2.2, owner: null },
  { x: -2, z: 2.2, owner: 'colleague-2' },
  { x: 2, z: 2.2, owner: 'player' },
] as const;
export type Obstacle = { x: number; z: number; w: number; d: number };
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
};
export const WEAPONS = {
  punch: { label: '펀치', interval: 0.55 }, hammer: { label: '뿅망치', interval: 0.85 }, fan: { label: '서류 부채', interval: 0.7 },
} as const;
export const SNACKS = { cookie: '쿠키', choco: '초코바', cracker: '크래커' } as const;
