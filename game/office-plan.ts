import type { Point } from './types.ts';

export type OfficeFixture = Point & { w: number; d: number };
export type OfficePlan = {
  furniture: Record<'bossDesk' | 'copier' | 'snacks' | 'coffee' | 'lounge', OfficeFixture>;
  targets: Record<'boss' | 'copier' | 'snacks' | 'coffee' | 'lounge', Point>;
  partition: OfficeFixture & { height: number };
  loungeOffset: number;
};

// One source of truth for what players see, where they walk and where they sit.
export const SOLO_OFFICE_PLAN: OfficePlan = {
  furniture: {
    bossDesk: { x: -6.3, z: -4.7, w: 3, d: 1.2 },
    copier: { x: -3.3, z: -4.7, w: 1.35, d: 1.15 },
    snacks: { x: 0, z: -4.7, w: 1.7, d: 1.5 },
    coffee: { x: 2.8, z: -4.7, w: 1.7, d: 1.5 },
    lounge: { x: 6.7, z: -3.8, w: 1.5, d: 1.4 },
  },
  targets: {
    boss: { x: -6.3, z: -3.25 }, copier: { x: -3.3, z: -3.25 },
    snacks: { x: 0, z: -3.25 }, coffee: { x: 2.8, z: -3.25 },
    lounge: { x: 7.5, z: -2.5 },
  },
  partition: { x: -1.7, z: -4.25, w: .2, d: 3.1, height: 2.35 },
  loungeOffset: 1.3,
};

const shifted = <T extends Point>(point: T): T => ({ ...point, x: point.x + 2.4, z: point.z - 1.4 });
export const MULTI_OFFICE_PLAN: OfficePlan = {
  furniture: {
    bossDesk: { ...shifted(SOLO_OFFICE_PLAN.furniture.bossDesk), w: 2.55 },
    copier: shifted(SOLO_OFFICE_PLAN.furniture.copier),
    snacks: { ...shifted(SOLO_OFFICE_PLAN.furniture.snacks), w: 1.2 },
    coffee: { ...shifted(SOLO_OFFICE_PLAN.furniture.coffee), w: 1.5, d: 1.2 },
    lounge: { ...shifted(SOLO_OFFICE_PLAN.furniture.lounge), w: 1.2, d: 1.2 },
  },
  targets: {
    boss: shifted(SOLO_OFFICE_PLAN.targets.boss), copier: shifted(SOLO_OFFICE_PLAN.targets.copier),
    snacks: shifted(SOLO_OFFICE_PLAN.targets.snacks), coffee: shifted(SOLO_OFFICE_PLAN.targets.coffee),
    lounge: shifted(SOLO_OFFICE_PLAN.targets.lounge),
  },
  partition: shifted(SOLO_OFFICE_PLAN.partition),
  loungeOffset: 1.3,
};
