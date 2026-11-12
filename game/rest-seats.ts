import type { Floor, Point } from './types.ts';

export type RestSeat = { id: string; floor: Floor; seat: Point; approach: Point; angle: number };

const loungeSeats = (x: number, z: number, offset: number): RestSeat[] => [
  { id: 'lounge-south', floor: 'office', seat: { x, z: z + offset }, approach: { x: x + .8, z: z + offset }, angle: Math.PI },
  { id: 'lounge-east', floor: 'office', seat: { x: x + offset, z }, approach: { x: x + offset, z: z - .8 }, angle: -Math.PI / 2 },
  { id: 'lounge-north', floor: 'office', seat: { x, z: z - offset }, approach: { x: x - .8, z: z - offset }, angle: 0 },
  { id: 'lounge-west', floor: 'office', seat: { x: x - offset, z }, approach: { x: x - offset, z: z + .8 }, angle: Math.PI / 2 },
];

/** Stable IDs and positions are shared by scene geometry, navigation and server validation. */
export const SOLO_LOUNGE_SEATS = loungeSeats(6.8, 2.1, 1.3);
export const MULTI_LOUNGE_SEATS = loungeSeats(-4.7, 1.55, 1.15);
export const ROOF_BENCH_SEATS: RestSeat[] = [0, -.9, .9].map((offset, index) => ({
  id: ['roof-middle', 'roof-left', 'roof-right'][index], floor: 'rooftop',
  seat: { x: 1.2 + offset, z: -4.65 }, approach: { x: 1.2 + offset, z: -3.95 }, angle: 0,
}));

export function restSeatById(id: string | null | undefined, lounge = SOLO_LOUNGE_SEATS): RestSeat | undefined {
  return [...lounge, ...ROOF_BENCH_SEATS].find(seat => seat.id === id);
}

export function restSeatAt(point: Point, floor: Floor, lounge = SOLO_LOUNGE_SEATS): RestSeat | undefined {
  const seats = floor === 'rooftop' ? ROOF_BENCH_SEATS : lounge;
  return seats.find(candidate => Math.hypot(candidate.seat.x - point.x, candidate.seat.z - point.z) <= .12);
}
