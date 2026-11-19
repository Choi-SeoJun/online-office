import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameEngine } from './engine.ts';
import type { Command } from './types.ts';

const rooftop = () => {
  const e = createGameEngine(); e.dispatch({ type: 'enter' });
  e.dispatch({ type: 'travel', floor: 'rooftop' }); e.step(2); return e;
};

test('local weather gates rooftop play, including paused changes and office rejection', () => {
  const e = createGameEngine();
  e.dispatch({ type: 'weather', precipitation: 'snow' });
  assert.equal(e.state.weatherKind, 'snow');
  e.dispatch({ type: 'weather-play', kind: 'snowman' }); assert.equal(e.state.activity, null);
  e.dispatch({ type: 'enter' }); e.dispatch({ type: 'weather-play', kind: 'snowman' });
  assert.equal(e.state.activity, null);
  e.dispatch({ type: 'travel', floor: 'rooftop' }); e.step(2);
  e.dispatch({ type: 'weather-play', kind: 'splash' }); assert.equal(e.state.activity, null);
  e.dispatch({ type: 'weather-play', kind: 'snowman' }); assert.equal(e.state.player.pose, 'snowman');
  e.dispatch({ type: 'pause', value: true }); const remaining = e.state.activity!.remaining;
  e.step(5); assert.equal(e.state.activity!.remaining, remaining);
  e.dispatch({ type: 'weather', precipitation: 'rain' });
  assert.equal(e.state.activity, null); assert.equal(e.state.player.pose, 'idle');
  e.dispatch({ type: 'weather-play', kind: 'splash' }); assert.equal(e.state.activity, null);
  e.dispatch({ type: 'pause', value: false });
  e.dispatch({ type: 'weather-play', kind: 'splash' }); assert.equal(e.state.player.pose, 'splash');
});

test('snow crafts complete once, remain bounded and expire without blocking navigation', () => {
  const e = rooftop(); e.dispatch({ type: 'weather', precipitation: 'snow' });
  for (let i = 0; i < 9; i++) {
    e.dispatch({ type: 'weather-play', kind: i % 2 ? 'snowduck' : 'snowman' });
    assert.equal(e.state.weatherCreations.length, Math.min(i, 6)); e.step(4);
  }
  assert.equal(e.state.weatherCreations.length, 6);
  assert.equal(new Set(e.state.weatherCreations.map(c => c.id)).size, 6);
  assert.ok(e.state.weatherCreations.some(c => c.kind === 'snowduck'));
  assert.ok(e.state.weatherCreations.some(c => c.kind === 'snowman'));
  for (let i = 0; i < e.state.weatherCreations.length; i++) for (const other of e.state.weatherCreations.slice(i + 1)) {
    assert.ok(Math.hypot(e.state.weatherCreations[i].x - other.x, e.state.weatherCreations[i].z - other.z) >= .7, 'repeated crafts should remain individually visible');
  }
  const point = e.state.weatherCreations[0];
  e.dispatch({ type: 'move', point }); e.step(10);
  assert.ok(Math.hypot(e.state.player.x - point.x, e.state.player.z - point.z) < .1);
  e.step(121); assert.deepEqual(e.state.weatherCreations, []);
});

test('moving, cancelling, standing and travel interrupt crafting without phantom completion', () => {
  const commands: Command[] = [{ type: 'move', point: { x: 0, z: 0 } }, { type: 'axis', x: 1, z: 0 },
    { type: 'cancel' }, { type: 'stand' }, { type: 'travel', floor: 'office' }, { type: 'rest', place: 'bench' }];
  for (const command of commands) {
    const e = rooftop(); e.dispatch({ type: 'weather', precipitation: 'snow' });
    e.dispatch({ type: 'weather-play', kind: 'snowman' }); e.step(.5); e.dispatch(command); e.step(5);
    assert.equal(e.state.activity, null); assert.deepEqual(e.state.weatherCreations, []);
    assert.notEqual(e.state.player.pose, 'snowman');
  }
});

test('weather play stands from the bench and release effects clear on cancellation and weather change', () => {
  const e = rooftop(); e.dispatch({ type: 'weather', precipitation: 'snow' });
  e.dispatch({ type: 'rest', place: 'bench' }); e.step(10);
  assert.equal(e.state.seat, 'roof-bench');
  e.dispatch({ type: 'weather-play', kind: 'snowball' });
  assert.equal(e.state.seat, null); assert.equal(e.state.roofRest, null);
  assert.equal(e.state.weatherEffect, null); e.step(1);
  assert.equal(e.getSnapshot().weatherEffect?.kind, 'snowball');
  e.dispatch({ type: 'cancel' }); assert.equal(e.state.weatherEffect, null);
  e.dispatch({ type: 'weather', precipitation: 'rain' });
  e.dispatch({ type: 'weather-play', kind: 'splash' }); e.step(.8);
  assert.equal(e.getSnapshot().weatherEffect?.kind, 'splash');
  e.dispatch({ type: 'weather', precipitation: 'none' });
  assert.equal(e.state.weatherEffect, null); assert.equal(e.state.activity, null);
  e.dispose(); e.dispatch({ type: 'weather', precipitation: 'snow' });
  assert.equal(e.state.weatherKind, 'none');
});
