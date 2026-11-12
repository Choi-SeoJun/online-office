import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameEngine } from './engine.ts';
import { createMultiLayout, isMultiWalkable, multiPath } from './multi-layout.ts';
import { MULTI_LOUNGE_SEATS, ROOF_BENCH_SEATS, SOLO_LOUNGE_SEATS } from './rest-seats.ts';

test('each pantry chair has its own reachable position and facing in both modes', () => {
  for (const seat of SOLO_LOUNGE_SEATS) {
    const engine = createGameEngine(); engine.dispatch({ type: 'enter' });
    engine.dispatch({ type: 'select', target: 'lounge', point: seat.seat }); engine.step(20); engine.dispatch({ type: 'interact' });
    assert.equal(engine.state.restSeatId, seat.id);
    assert.equal(engine.state.seat, 'lounge');
    assert.deepEqual({ x: engine.state.player.x, z: engine.state.player.z }, seat.seat);
    assert.equal(engine.state.player.angle, seat.angle);
    engine.dispatch({ type: 'stand' }); assert.equal(engine.state.restSeatId, null);
    engine.dispose();
  }
  for (let capacity = 2; capacity <= 16; capacity++) {
    const layout = createMultiLayout(capacity);
    assert.equal(layout.loungeSeats.length, 4);
    for (const seat of MULTI_LOUNGE_SEATS) {
      assert.ok(isMultiWalkable(layout, seat.approach));
      assert.deepEqual(multiPath(layout, layout.spawn, seat.approach).at(-1), seat.approach);
    }
  }
});

test('three separate roof bench positions sit on the bench and exit at their own approach', () => {
  const engine = createGameEngine(); engine.dispatch({ type: 'enter' });
  engine.dispatch({ type: 'travel', floor: 'rooftop' }); engine.step(2);
  for (const seat of ROOF_BENCH_SEATS) {
    engine.dispatch({ type: 'rest', place: 'bench', restSeatId: seat.id }); engine.step(20);
    assert.equal(engine.state.seat, 'roof-bench'); assert.equal(engine.state.restSeatId, seat.id);
    assert.deepEqual({ x: engine.state.player.x, z: engine.state.player.z }, seat.seat);
    engine.dispatch({ type: 'stand' });
    assert.deepEqual({ x: engine.state.player.x, z: engine.state.player.z }, seat.approach);
  }
  engine.dispose();
});

test('returning from the roof stands beside a released lounge chair instead of inside its next occupant', () => {
  const engine = createGameEngine(), seat = SOLO_LOUNGE_SEATS[1]; engine.dispatch({ type: 'enter' });
  engine.dispatch({ type: 'select', target: 'lounge', point: seat.seat }); engine.step(20); engine.dispatch({ type: 'interact' });
  engine.dispatch({ type: 'travel', floor: 'rooftop' }); engine.step(2);
  assert.equal(engine.state.restSeatId, null);
  engine.dispatch({ type: 'travel', floor: 'office' }); engine.step(2);
  assert.deepEqual({ x: engine.state.player.x, z: engine.state.player.z }, seat.approach);
  assert.equal(engine.state.seat, null); engine.dispose();
});
