import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdaptiveQuality, AUTO_QUALITY, MANUAL_QUALITY } from './render-quality.ts';

function trace() {
  const control = createAdaptiveQuality();
  let now = 0;
  let profile = control.sample(now, 'auto');
  return { control, get profile() { return profile; },
    run(seconds: number, fps: number, mode: 'auto' | 'low' | 'high' = 'auto', active = true) {
      for (let i = 0; i < seconds * fps; i++) { now += 1000 / fps; profile = control.sample(now, mode, active); }
      return profile;
    },
    pause(ms: number) { now += ms; profile = control.sample(now, 'auto'); },
  };
}

test('sustained low FPS lowers resolution, shadows and effects to bounded fallback', () => {
  const t = trace();
  assert.equal(t.profile, AUTO_QUALITY[2]);
  t.run(6, 35);
  assert.ok(t.profile.dpr < AUTO_QUALITY[2].dpr);
  assert.equal(t.profile.shadows, 0);
  assert.equal(t.profile.effects, 'low');
  assert.equal(t.run(30, 10), AUTO_QUALITY[0]);
});

test('loading hitch or a short slow burst does not degrade quality', () => {
  const t = trace(); t.run(4, 60); t.run(.3, 10); t.run(4, 60);
  assert.equal(t.profile, AUTO_QUALITY[2]);
});

test('sustained healthy FPS slowly recovers and stops at the automatic ceiling', () => {
  const t = trace(); t.run(20, 25);
  assert.equal(t.profile, AUTO_QUALITY[0]);
  t.run(8, 60); assert.equal(t.profile, AUTO_QUALITY[0]);
  t.run(120, 60); assert.equal(t.profile, AUTO_QUALITY[3]);
});

test('unstable cadence does not qualify as sustained recovery', () => {
  const t = trace(); t.run(20, 25);
  for (let i = 0; i < 12; i++) { t.run(4, 60); t.run(1, 40); }
  assert.equal(t.profile, AUTO_QUALITY[0]);
});

test('failed upward probe backs off instead of oscillating every 20 seconds', () => {
  const t = trace(); t.run(20, 25); t.run(26, 60);
  assert.equal(t.profile, AUTO_QUALITY[1]);
  t.run(6, 35); assert.equal(t.profile, AUTO_QUALITY[0]);
  t.run(35, 60); assert.equal(t.profile, AUTO_QUALITY[0]);
  t.run(100, 60); assert.ok(t.profile.dpr > AUTO_QUALITY[0].dpr);
});

test('background time and pauses reset samples without lowering the retained tier', () => {
  const t = trace(); t.run(5, 60); t.run(30, 1, 'auto', false); t.run(4, 60);
  assert.equal(t.profile, AUTO_QUALITY[2]);
  t.pause(60000); t.run(4, 60); assert.equal(t.profile, AUTO_QUALITY[2]);
  t.control.reset(); t.run(1, 10); assert.equal(t.profile, AUTO_QUALITY[2]);
});

test('manual choices stay fixed and returning to auto starts a fresh measurement', () => {
  const t = trace();
  assert.equal(t.run(40, 10, 'high'), MANUAL_QUALITY.high);
  assert.equal(t.run(40, 120, 'low'), MANUAL_QUALITY.low);
  assert.equal(t.run(1, 60), AUTO_QUALITY[2]);
  assert.ok(t.run(10, 15).dpr < AUTO_QUALITY[2].dpr);
});

test('invalid timestamps and high refresh displays do not corrupt the controller', () => {
  const t = trace(); t.control.sample(NaN, 'auto'); t.control.sample(Infinity, 'auto');
  assert.equal(t.run(60, 144), AUTO_QUALITY[3]);
});
