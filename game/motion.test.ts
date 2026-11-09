import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createActor, animateActor } from './models.ts';
import { createGameEngine } from './engine.ts';
import { WEAPONS } from './layout.ts';
import type { Activity, GameState, Snack, Weapon } from './types.ts';

// Only label rasterization needs a DOM; geometry, transforms and props stay real.
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ width: 0, height: 0, getContext: () => ({
    beginPath() {}, roundRect() {}, fill() {}, fillText() {},
  }) }),
} });

function setup() {
  const state = createGameEngine().state;
  state.entered = true; state.player.angle = 0; state.elapsed = 12;
  const rig = createActor(new THREE.Group(), 0, state.player.name);
  const render = () => { animateActor(rig, state.player, state, state.elapsed); rig.root.updateMatrixWorld(true); };
  return { state, rig, render };
}
function activity(state: GameState, kind: Activity['kind'], progress: number, snack?: Snack) {
  state.player.pose = kind; state.activity = { kind, duration: 2, remaining: 2 * (1 - progress), snack };
}
function position(object: THREE.Object3D) { return object.getWorldPosition(new THREE.Vector3()); }

test('leaning in the pantry keeps seated legs and visibly reclines instead of standing through the chair', () => {
  const { state, rig, render } = setup();
  state.seat = 'lounge'; state.player.pose = 'sit'; render();
  const seatedLeg = rig.legs[0].rotation.x;
  state.player.pose = 'lean'; render();
  assert.equal(rig.legs[0].rotation.x, seatedLeg);
  assert.ok(rig.body.rotation.x < -.1, 'lean visibly tilts backward');
  state.seat = null; state.player.pose = 'idle'; render();
  assert.equal(rig.body.rotation.x, 0); assert.equal(rig.legs[0].rotation.x, 0);
});

test('brewing reaches for the machine, presents a cup, then resets its reach on cancellation', () => {
  const { state, rig, render } = setup();
  activity(state, 'brew', .10); render(); const earlyArm = rig.rightArm.rotation.x;
  activity(state, 'brew', .55); render();
  assert.equal(rig.mug.visible, true, 'cup must be visible during brewing');
  assert.ok(Math.abs(rig.rightArm.rotation.x - earlyArm) > .2, 'brewing has progress-driven phases');
  state.activity = null; state.player.pose = 'idle'; render();
  assert.equal(rig.mug.visible, false); assert.equal(rig.rightArm.rotation.x, 0);
});

test('taking each snack shows the chosen item, brings it toward the pocket and clears it on cancellation', () => {
  const { state, rig, render } = setup();
  for (const snack of ['cookie', 'choco', 'cracker'] as Snack[]) {
    activity(state, 'take', .45, snack); render();
    const item = rig.root.getObjectByName(`held-${snack}`);
    assert.ok(item?.visible, `${snack} is visible at the hand`);
    const reached = position(item);
    activity(state, 'take', .85, snack); render();
    assert.ok(position(item).distanceTo(reached) > .15, 'item travels from shelf toward the body');
    state.activity = null; state.player.pose = 'idle'; render();
    assert.equal(item.visible, false, 'cancelled item must not remain floating');
  }
});

test('drinking raises the cup toward the mouth and lowers it while keeping seated legs', () => {
  const { state, rig, render } = setup();
  state.seat = 'lounge'; state.inventory.coffee = 3;
  activity(state, 'drink', .03); render(); const low = position(rig.mug);
  const mouth = position(rig.head).add(new THREE.Vector3(0, -.1, .3));
  activity(state, 'drink', .5); render(); const sip = position(rig.mug);
  assert.ok(sip.distanceTo(mouth) < low.distanceTo(mouth) - .15, 'cup lifts toward mouth');
  assert.ok(rig.legs[0].rotation.x < -1, 'drinking remains seated');
  activity(state, 'drink', .98); render();
  assert.ok(position(rig.mug).distanceTo(sip) > .15, 'cup lowers after sip');
});

test('eating shows the selected snack near the mouth and leaves no snack or crumbs after completion', () => {
  const { state, rig, render } = setup();
  activity(state, 'eat', .55, 'cookie'); render();
  const cookie = rig.root.getObjectByName('held-cookie');
  assert.ok(cookie?.visible, 'eating needs an actual snack');
  assert.ok(position(cookie).distanceTo(position(rig.head)) < .6, 'snack reaches face');
  state.activity = null; state.player.pose = 'idle'; render();
  assert.equal(cookie.visible, false);
  const crumbs = rig.root.getObjectByName('snack-crumbs');
  assert.ok(crumbs && !crumbs.visible);
});

test('the cup rim and every snack biting edge meet the mouth, not an eye or ear', () => {
  const { state, rig, render } = setup();
  for (const reduced of [false, true]) for (const seat of [null, 'desk', 'lounge'] as const) for (const angle of [0, 1.2, Math.PI]) {
    state.settings.reducedMotion = reduced; state.seat = seat; state.player.angle = angle;
    activity(state, 'drink', .5); render();
    const mouth = rig.head.localToWorld(new THREE.Vector3(0, -.12, .304));
    const rim = rig.mug.localToWorld(new THREE.Vector3(0, .143, -.061));
    assert.ok(rim.distanceTo(mouth) < .035, `cup rim must touch lips; distance ${rim.distanceTo(mouth)}`);
    const handle = rig.mug.localToWorld(new THREE.Vector3(.09, .075, 0));
    assert.ok(handle.distanceTo(position(rig.hand)) < .015, 'cup handle stays in the hand while its rim touches the lips');
    for (const snack of ['cookie', 'choco', 'cracker'] as Snack[]) for (const progress of [.4, .6]) {
      activity(state, 'eat', progress, snack); render();
      const lip = rig.head.localToWorld(new THREE.Vector3(0, -.12, .304));
      const edge = rig.snacks[snack].localToWorld(new THREE.Vector3(0, snack === 'cracker' ? .115 : .135, 0));
      assert.ok(edge.distanceTo(lip) < .035, `${snack} biting edge must touch lips; distance ${edge.distanceTo(lip)}`);
      const grip = rig.snacks[snack].localToWorld(new THREE.Vector3(0, -.045, 0));
      assert.ok(grip.distanceTo(position(rig.hand)) < .015, 'the snack remains gripped before and after a bite');
    }
  }
});

test('the toy hammer crosses sideways into its strike instead of chopping in one vertical plane', () => {
  const { state, rig, render } = setup();
  state.player.x = state.player.z = 0; state.player.angle = 0; state.player.pose = 'hit'; state.boss.x = 0; state.boss.z = 1.4;
  state.lastHit = { id: 1, at: 12, weapon: 'hammer' };
  state.elapsed = 12 + WEAPONS.hammer.interval * .23; render();
  const windup = new THREE.Box3().setFromObject(rig.weapons.hammer).getCenter(new THREE.Vector3());
  state.elapsed = 12 + WEAPONS.hammer.interval * .43; render();
  const impact = new THREE.Box3().setFromObject(rig.weapons.hammer).getCenter(new THREE.Vector3());
  assert.ok(Math.abs(impact.x - windup.x) > .22, 'hammer needs a readable diagonal side sweep');
});

test('a rooftop candy unwraps, meets the lips from every facing, lowers and clears on cancellation', () => {
  const { state, rig, render } = setup();
  activity(state, 'candy', .05); render();
  const candy = rig.root.getObjectByName('held-candy');
  const wrapper = rig.root.getObjectByName('candy-wrapper');
  assert.ok(candy?.visible && wrapper?.visible, 'the first beat shows a wrapped lollipop');
  const low = position(candy);
  for (const reduced of [false, true]) for (const angle of [0, .7, Math.PI, 4.2]) {
    state.settings.reducedMotion = reduced; state.player.angle = angle;
    activity(state, 'candy', .55); render();
    assert.equal(wrapper.visible, false, 'the wrapper is gone before sucking');
    const sweet = candy.localToWorld(new THREE.Vector3(0, .16, -.04));
    const mouth = rig.head.localToWorld(new THREE.Vector3(0, -.12, .304));
    assert.ok(sweet.distanceTo(mouth) < .035, 'the candy touches the mouth instead of an eye or ear');
    const grip = candy.localToWorld(new THREE.Vector3(0, -.04, 0));
    assert.ok(grip.distanceTo(position(rig.hand)) < .015, 'the stick stays held during the sucking pose');
  }
  state.player.angle = 0; activity(state, 'candy', .55); render(); const held = position(candy);
  assert.ok(held.distanceTo(low) > .15, 'the candy visibly lifts from the hand');
  activity(state, 'candy', .99); render(); assert.ok(position(candy).distanceTo(held) > .15, 'the candy lowers at the end');
  state.activity = null; state.player.pose = 'idle'; render();
  assert.equal(candy.visible, false); assert.equal(wrapper.visible, false);
  assert.equal(rig.rightArm.scale.y, 1, 'relaxed candy reach must not leak into walking');
});

test('all weapons stay visible through their full swing and reset after recovery', () => {
  const { state, rig, render } = setup();
  for (const weapon of ['punch', 'hammer', 'fan'] as Weapon[]) {
    const duration = WEAPONS[weapon].interval;
    state.player.pose = 'hit'; state.lastHit = { id: 1, at: 12, weapon };
    state.elapsed = 12 + duration * .72; render();
    assert.equal(rig.weapons[weapon].visible, true, `${weapon} remains visible through recovery`);
    state.elapsed = 12 + duration + .05; state.player.pose = 'idle'; render();
    assert.equal(Object.values(rig.weapons).some(item => item.visible), false);
    assert.equal(rig.rightArm.scale.y, 1, 'arm extension cannot leak into idle');
  }
});

test('chosen props are readable while waiting beside the boss and clear when leaving or starting another action', () => {
  const { state, rig, render } = setup();
  state.target = 'boss'; state.ready = true; state.floor = 'office'; state.player.pose = 'idle';
  const cameraDirection = new THREE.Vector3(16, 20, 24).normalize();
  for (const weapon of ['hammer', 'fan'] as Weapon[]) for (const angle of [0, 1.2, Math.PI, 4.2]) {
    state.weapon = weapon; state.player.angle = angle; render();
    assert.ok(rig.weapons[weapon].visible, 'selected tool remains visible before the next hit');
    if (weapon === 'fan') {
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.weapons.fan.getWorldQuaternion(new THREE.Quaternion()));
      assert.ok(Math.abs(normal.dot(cameraDirection)) > .9, 'the broad paper face is readable from both approach sides');
    }
  }
  for (const condition of ['leaving', 'moving', 'seated', 'activity', 'rooftop', 'transition'] as const) {
    state.target = 'boss'; state.ready = true; state.player.moving = false; state.seat = null; state.activity = null; state.floor = 'office'; state.transition = null;
    if (condition === 'leaving') state.target = 'coffee';
    if (condition === 'moving') state.player.moving = true;
    if (condition === 'seated') state.seat = 'desk';
    if (condition === 'activity') state.activity = { kind: 'drink', duration: 2, remaining: 1 };
    if (condition === 'rooftop') state.floor = 'rooftop';
    if (condition === 'transition') state.transition = { from: 'office', to: 'rooftop', duration: 1, remaining: .5 };
    render(); assert.equal(Object.values(rig.weapons).some(item => item.visible), false, `${condition} clears the held preview`);
  }
});

test('the actual folded paper surface reaches the boss with reduced motion at maximum attack range', () => {
  const { state, rig, render } = setup();
  const bossRig = createActor(new THREE.Group(), 1, state.boss.name);
  state.player.x = state.player.z = 0; state.player.angle = 0; state.player.pose = 'hit';
  state.boss.x = 0; state.boss.z = 1.5; state.boss.angle = Math.PI; state.boss.pose = 'hit';
  state.settings.reducedMotion = true; state.lastHit = { id: 1, at: 12, weapon: 'fan' };
  const sphere = bossRig.head.children.find(object => object instanceof THREE.Mesh && object.geometry.type === 'SphereGeometry') as THREE.Mesh<THREE.SphereGeometry>;
  const zero = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), closest = new THREE.Vector3(), triangle = new THREE.Triangle();
  let contact = false;
  for (let sample = 1; sample < 100 && !contact; sample++) {
    state.elapsed = 12 + WEAPONS.fan.interval * sample / 100; render();
    animateActor(bossRig, state.boss, state, state.elapsed); bossRig.root.updateMatrixWorld(true);
    const inverse = sphere.matrixWorld.clone().invert();
    rig.weapons.fan.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const transform = inverse.clone().multiply(object.matrixWorld), points = object.geometry.attributes.position, index = object.geometry.index;
      for (let i = 0; i < (index ? index.count : points.count); i += 3) {
        a.fromBufferAttribute(points, index ? index.getX(i) : i).applyMatrix4(transform);
        b.fromBufferAttribute(points, index ? index.getX(i + 1) : i + 1).applyMatrix4(transform);
        c.fromBufferAttribute(points, index ? index.getX(i + 2) : i + 2).applyMatrix4(transform);
        triangle.set(a, b, c).closestPointToPoint(zero, closest);
        contact ||= closest.length() <= sphere.geometry.parameters.radius;
      }
    });
  }
  assert.ok(contact, 'visible paper geometry must touch the actual head, not merely its bounding box');
});

test('reduced motion preserves informative cup/snack poses without drifting while simulation is paused', () => {
  const { state, rig, render } = setup();
  state.settings.reducedMotion = true; state.paused = true;
  activity(state, 'eat', .55, 'cracker'); render();
  const snack = rig.root.getObjectByName('held-cracker'); assert.ok(snack?.visible);
  const before = position(snack); render(); assert.deepEqual(position(snack), before);
  const crumbs = rig.root.getObjectByName('snack-crumbs'); assert.ok(crumbs && !crumbs.visible);
  activity(state, 'brew', .55); render(); assert.equal(rig.mug.visible, true);
});

test('a coworker drinking at the coffee machine stays standing while a coworker at their desk stays seated', () => {
  const { state } = setup(); const actor = state.coworkers[1]; actor.pose = 'drink';
  const rig = createActor(new THREE.Group(), 3, actor.name);
  animateActor(rig, actor, state, state.elapsed); assert.ok(rig.legs[0].rotation.x < -1);
  actor.x = 6; actor.z = -4.1;
  animateActor(rig, actor, state, state.elapsed); assert.equal(rig.legs[0].rotation.x, 0);
});

test('punch reaches the boss at the impact phase without overlapping the character centers', () => {
  const { state, rig, render } = setup();
  const bossRig = createActor(new THREE.Group(), 1, state.boss.name);
  state.player.x = state.player.z = 0; state.player.angle = 0; state.player.pose = 'hit';
  state.boss.x = 0; state.boss.angle = Math.PI; state.boss.pose = 'hit';
  state.lastHit = { id: 1, at: 12, weapon: 'punch' };
  for (const reduced of [false, true]) for (const gap of [1.25, 1.4, 1.5]) {
    state.settings.reducedMotion = reduced;
    state.boss.z = gap; state.elapsed = 12 + WEAPONS.punch.interval * .43; render();
    animateActor(bossRig, state.boss, state, state.elapsed); bossRig.root.updateMatrixWorld(true);
    const fist = new THREE.Box3().setFromObject(rig.weapons.punch);
    const head = new THREE.Box3().setFromObject(bossRig.head);
    assert.ok(fist.intersectsBox(head), `fist reaches head across ${gap} units`);
    assert.ok(gap - rig.body.position.z > .8, 'lunge must keep body centers apart');
  }
});

test('each weapon connects across the maximum attack gap with reduced motion as well as full motion', () => {
  const { state, rig, render } = setup();
  const bossRig = createActor(new THREE.Group(), 1, state.boss.name);
  state.player.x = state.player.z = 0; state.player.angle = 0; state.player.pose = 'hit';
  state.boss.x = 0; state.boss.z = 1.5; state.boss.angle = Math.PI; state.boss.pose = 'hit';
  for (const reduced of [false, true]) for (const weapon of ['punch', 'hammer', 'fan'] as Weapon[]) {
    state.settings.reducedMotion = reduced; state.lastHit = { id: 1, at: 12, weapon };
    let connected = false;
    for (let sample = 1; sample < 100; sample++) {
      state.elapsed = 12 + WEAPONS[weapon].interval * sample / 100; render();
      animateActor(bossRig, state.boss, state, state.elapsed); bossRig.root.updateMatrixWorld(true);
      const tool = new THREE.Box3().setFromObject(rig.weapons[weapon]);
      const head = new THREE.Box3().setFromObject(bossRig.head);
      connected ||= tool.intersectsBox(head);
      assert.ok(1.5 - rig.body.position.z > .8, 'tool contact must not require overlapping bodies');
    }
    assert.ok(connected, `${weapon} must visibly connect with reduced motion ${reduced}`);
  }
});
