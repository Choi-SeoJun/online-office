import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoofLean, ROOF_LEAN_DISTANCE } from './roof-rest.ts';
import { ROOF_OBSTACLES, ROOF_WALLS } from './layout.ts';
import type { RoofWallSide } from './types.ts';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);
const clear = (point: { x: number; z: number }) => !ROOF_OBSTACLES.some(o => Math.abs(point.x - o.x) < o.w / 2 + .22 && Math.abs(point.z - o.z) < o.d / 2 + .22);

test('nearby leaning preserves every tangent position instead of using a fixed wall anchor', () => {
  for (const side of Object.keys(ROOF_WALLS) as RoofWallSide[]) {
    const horizontal = side === 'north' || side === 'south';
    for (const tangent of [-4.25, -1.7, .35, 3.65, 4.9]) {
      const source = horizontal ? { x: tangent, z: side === 'north' ? -5.1 : 5.1 } : { x: side === 'west' ? -8.1 : 8.1, z: tangent };
      const result = getRoofLean(source, side);
      assert.ok(result); assert.equal(result.wall, side);
      close(horizontal ? result.point.x : result.point.z, tangent);
      close(result.distance, .41);
      assert.ok(result.distance < ROOF_LEAN_DISTANCE);
    }
  }
});

test('far leaning picks the nearest wall and projects the current position onto it', () => {
  for (const [source, side, destination] of [
    [{ x: -2.3, z: -3 }, 'north', { x: -2.3, z: -5.51 }],
    [{ x: 3.25, z: 3.2 }, 'south', { x: 3.25, z: 5.51 }],
    [{ x: 6.7, z: 1.1 }, 'east', { x: 8.51, z: 1.1 }],
    [{ x: -6.5, z: -.3 }, 'west', { x: -8.51, z: -.3 }],
  ] as const) {
    const result = getRoofLean(source);
    assert.ok(result); assert.equal(result.wall, side);
    close(result.point.x, destination.x); close(result.point.z, destination.z);
    assert.ok(result.distance > ROOF_LEAN_DISTANCE);
  }
  assert.equal(getRoofLean({ x: 0, z: 0 })?.wall, 'north', 'equal distances use a stable side');
});

test('clicking a wall keeps the requested side and bounds corners inside both walls', () => {
  const opposite = getRoofLean({ x: 8, z: 1.37 }, 'west');
  assert.ok(opposite); assert.equal(opposite.wall, 'west'); close(opposite.point.x, -8.51); close(opposite.point.z, 1.37);
  for (const x of [-20, 20]) for (const z of [-20, 20]) for (const side of Object.keys(ROOF_WALLS) as RoofWallSide[]) {
    const result = getRoofLean({ x, z }, side);
    assert.ok(result); assert.ok(Math.abs(result.point.x) <= 8.51 + 1e-8); assert.ok(Math.abs(result.point.z) <= 5.51 + 1e-8);
    assert.ok(clear(result.point));
  }
});

test('the full usable length of all four walls stays clear after moving rooftop furniture inward', () => {
  for (const side of Object.keys(ROOF_WALLS) as RoofWallSide[]) {
    const horizontal = side === 'north' || side === 'south', limit = horizontal ? 8.51 : 5.51;
    for (let i = 0; i <= 200; i++) {
      const tangent = -limit + 2 * limit * i / 200;
      const source = horizontal ? { x: tangent, z: side === 'north' ? -5.51 : 5.51 } : { x: side === 'west' ? -8.51 : 8.51, z: tangent };
      const result = getRoofLean(source, side);
      assert.ok(result); assert.ok(clear(result.point), `${side} must be free at ${tangent}`);
      close(result.distance, 0); close(horizontal ? result.point.x : result.point.z, tangent);
    }
  }
});

test('an obstructed projection chooses the closest clear point rather than placing the player inside furniture', () => {
  const obstacles = [{ x: 1, z: -5.5, w: 2, d: 1 }];
  const result = getRoofLean({ x: .8, z: -4.7 }, 'north', obstacles);
  assert.ok(result); assert.equal(result.wall, 'north');
  assert.ok(result.point.x < -.22 && result.point.x > -.221);
  close(result.point.z, -5.51);
  assert.equal(getRoofLean({ x: 0, z: -4 }, 'north', [{ x: 0, z: -5.5, w: 30, d: 1 }]), null);
  assert.notEqual(getRoofLean({ x: 0, z: -4 }, undefined, [{ x: 0, z: -5.5, w: 30, d: 1 }])?.wall, 'north');
});

test('invalid positions cannot produce a resting destination', () => {
  for (const source of [{ x: NaN, z: 1 }, { x: Infinity, z: 0 }, { x: 0, z: -Infinity }]) assert.equal(getRoofLean(source), null);
});
