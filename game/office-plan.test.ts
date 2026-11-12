import test from 'node:test';
import assert from 'node:assert/strict';
import { BOUNDS, DESKS, OBSTACLES, START, TARGETS } from './layout.ts';
import { SOLO_OFFICE_PLAN, MULTI_OFFICE_PLAN } from './office-plan.ts';
import { createMultiLayout, isMultiSegmentClear, isMultiWalkable, multiPath } from './multi-layout.ts';
import { createGameEngine } from './engine.ts';
import { SOLO_LOUNGE_SEATS } from './rest-seats.ts';

test('both offices place printer then snacks, coffee and lounge along the rear, behind a solid divider', () => {
  for (const plan of [SOLO_OFFICE_PLAN, MULTI_OFFICE_PLAN]) {
    const f = plan.furniture, p = plan.partition;
    assert.ok(f.bossDesk.x < f.copier.x && f.copier.x < p.x && p.x < f.snacks.x);
    assert.ok(f.snacks.x < f.coffee.x && f.coffee.x < f.lounge.x);
    assert.ok(p.height >= 2.3);
  }
  for (const target of ['boss', 'copier', 'snacks', 'coffee', 'lounge'] as const) {
    assert.deepEqual(TARGETS[target].point, SOLO_OFFICE_PLAN.targets[target]);
  }
  assert.ok(OBSTACLES.some(o => o.x === SOLO_OFFICE_PLAN.partition.x && o.z === SOLO_OFFICE_PLAN.partition.z));
  assert.ok(DESKS.every(desk => desk.z >= -.8));
});

test('all room sizes preserve rear amenities and four accessible chairs as desks grow', () => {
  for (let capacity = 2; capacity <= 16; capacity++) {
    const layout = createMultiLayout(capacity);
    assert.deepEqual(layout.furniture, MULTI_OFFICE_PLAN.furniture);
    for (const fixture of Object.values(layout.furniture)) {
      assert.ok(fixture.x - fixture.w / 2 >= layout.bounds.minX);
      assert.ok(fixture.x + fixture.w / 2 <= layout.bounds.maxX);
      assert.ok(fixture.z - fixture.d / 2 >= layout.bounds.minZ);
    }
    assert.ok(!isMultiSegmentClear(layout, layout.boss, layout.coffee), 'divider blocks a direct shortcut from the boss');
    for (const seat of layout.loungeSeats) {
      assert.ok(isMultiWalkable(layout, seat.seat), `seat ${seat.id} at capacity ${capacity}`);
      assert.ok(isMultiWalkable(layout, seat.approach));
      const route = multiPath(layout, layout.boss, seat.approach);
      assert.deepEqual(route.at(-1), seat.approach);
      let from = layout.boss;
      for (const to of route) { assert.ok(isMultiSegmentClear(layout, from, to)); from = to; }
    }
  }
});

test('solo walks around the divider to each rear amenity and every lounge chair', () => {
  const engine = createGameEngine(); engine.dispatch({ type: 'enter' });
  const clear = (x: number, z: number) => x >= BOUNDS.minX + .22 && x <= BOUNDS.maxX - .22
    && z >= BOUNDS.minZ + .22 && z <= BOUNDS.maxZ - .22
    && !OBSTACLES.some(o => Math.abs(x - o.x) < o.w / 2 + .22 - 1e-7 && Math.abs(z - o.z) < o.d / 2 + .22 - 1e-7);
  for (const target of ['copier', 'snacks', 'coffee'] as const) {
    engine.dispatch({ type: 'select', target });
    for (let frame = 0; frame < 400 && (!engine.state.ready || engine.state.player.moving); frame++) {
      engine.step(.1); assert.ok(clear(engine.state.player.x, engine.state.player.z), `clipped on the way to ${target}`);
    }
    assert.ok(engine.state.ready, `reached ${target}`);
    assert.ok(Math.hypot(engine.state.player.x - TARGETS[target].point.x, engine.state.player.z - TARGETS[target].point.z) < .2);
  }
  for (const seat of SOLO_LOUNGE_SEATS) {
    engine.dispatch({ type: 'select', target: 'lounge', point: seat.seat }); engine.step(20);
    assert.ok(engine.state.ready); engine.dispatch({ type: 'interact' });
    assert.equal(engine.state.restSeatId, seat.id); engine.dispatch({ type: 'stand' });
    assert.ok(clear(engine.state.player.x, engine.state.player.z));
  }
  assert.ok(clear(START.x, START.z)); engine.dispose();
});
