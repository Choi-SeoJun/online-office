import test from 'node:test';
import assert from 'node:assert/strict';
import { createMultiLayout, isMultiSegmentClear, isMultiWalkable, multiPath } from './multi-layout.ts';

test('capacity produces exactly one stable assigned desk per participant', () => {
  const largest = createMultiLayout(16);
  for (let capacity = 2; capacity <= 16; capacity++) {
    const layout = createMultiLayout(capacity);
    assert.equal(layout.desks.length, capacity);
    for (const desk of layout.desks) assert.deepEqual(desk, largest.desks[desk.index]);
    assert.ok(isMultiWalkable(layout, layout.spawn));
    assert.ok(isMultiWalkable(layout, layout.coffee));
    assert.ok(isMultiWalkable(layout, layout.lounge));
    assert.ok(layout.bounds.maxX <= largest.bounds.maxX && layout.bounds.maxZ <= largest.bounds.maxZ);
  }
  for (const bad of [0, 1, 17, 2.5, NaN, Infinity]) assert.throws(() => createMultiLayout(bad), RangeError);
});

test('paired rows face one another across low partitions', () => {
  const layout = createMultiLayout(16);
  for (let i = 0; i < 16; i += 2) {
    const a = layout.desks[i], b = layout.desks[i + 1];
    assert.equal(a.point.x, b.point.x);
    assert.ok(a.seat.z > a.point.z && b.seat.z < b.point.z);
    assert.equal(a.angle, Math.PI); assert.equal(b.angle, 0);
    assert.ok(isMultiWalkable(layout, a.seat)); assert.ok(isMultiWalkable(layout, b.seat));
  }
});

test('every capacity reaches every desk and amenity without clipping furniture', () => {
  for (let capacity = 2; capacity <= 16; capacity++) {
    const layout = createMultiLayout(capacity); let start = layout.spawn;
    for (const goal of [...layout.desks.map(d => d.seat), layout.coffee, layout.snacks, layout.copier, layout.boss, layout.lounge, layout.spawn]) {
      const path = multiPath(layout, start, goal);
      assert.ok(path.length, `capacity ${capacity}: ${JSON.stringify({ start, goal })}`);
      assert.deepEqual(path.at(-1), goal);
      let previous = start;
      for (const p of path) { assert.ok(isMultiSegmentClear(layout, previous, p)); previous = p; }
      start = goal;
    }
  }
});

test('blocked clicks choose reachable floor and invalid positions cannot route', () => {
  const layout = createMultiLayout(16);
  for (const requested of [layout.desks[7].point, { x: 100, z: -100 }]) {
    const path = multiPath(layout, layout.spawn, requested); assert.ok(path.length);
    assert.ok(isMultiWalkable(layout, path.at(-1)!));
    let previous = layout.spawn; for (const point of path) { assert.ok(isMultiSegmentClear(layout, previous, point)); previous = point; }
  }
  assert.deepEqual(multiPath(layout, layout.spawn, { x: NaN, z: 0 }), []);
  assert.deepEqual(multiPath(layout, layout.desks[0].point, layout.spawn), []);
  assert.equal(isMultiWalkable(layout, { x: Infinity, z: 0 }), false);
  assert.equal(isMultiSegmentClear(layout, layout.desks[0].seat, layout.desks[1].seat), false);
});
