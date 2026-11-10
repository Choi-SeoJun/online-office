import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraDragAngle, normalizeCameraAngle, screenAxisToWorld, smoothCameraAngle, wallFacesCamera } from './camera.ts';
import * as THREE from 'three';
import { prepareCameraCutaways } from './camera-cutaway.ts';

test('camera angles wrap and easing takes the short path across a full turn', () => {
  assert.ok(Math.abs(normalizeCameraAngle(Math.PI * 6 + .2) - .2) < 1e-10);
  const next = smoothCameraAngle(Math.PI - .05, -Math.PI + .05, .016, false);
  assert.ok(next > Math.PI - .05);
  assert.equal(smoothCameraAngle(0, 1, .016, true), 1);
  assert.equal(normalizeCameraAngle(Infinity), 0);
});

test('drag threshold separates walking clicks from camera gestures', () => {
  assert.equal(cameraDragAngle(6, 3), null);
  assert.ok(Math.abs(cameraDragAngle(30, 0)! + .27) < 1e-10);
  assert.equal(cameraDragAngle(0, 20), 0);
});

test('screen movement follows the camera on every quarter turn', () => {
  const initial = screenAxisToWorld({x: 1, z: 0}, 0);
  const turned = screenAxisToWorld({x: 1, z: 0}, Math.PI / 2);
  assert.ok(Math.abs(initial.x - 24 / Math.hypot(16,24)) < 1e-10);
  assert.ok(Math.abs(turned.x - initial.z) < 1e-10);
  assert.ok(Math.abs(turned.z + initial.x) < 1e-10);
  assert.deepEqual(screenAxisToWorld({x:0,z:0}, 2), {x:0,z:0});
});

test('foreground wall changes with camera position', () => {
  assert.equal(wallFacesCamera('north', {x:16,z:24}), false);
  assert.equal(wallFacesCamera('east', {x:16,z:24}), true);
  assert.equal(wallFacesCamera('south', {x:-16,z:-24}), false);
  assert.equal(wallFacesCamera('west', {x:-16,z:-24}), true);
});

test('wall cutaways follow rotation without fading shared furniture materials', () => {
  const group=new THREE.Group(), shared=new THREE.MeshStandardMaterial({color:'#eeeeee'});
  const wall=new THREE.Mesh(new THREE.BoxGeometry(18,3,.2),shared); wall.position.set(0,1.5,-6); group.add(wall);
  const furniture=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),shared); group.add(furniture);
  const update=prepareCameraCutaways(group,true);
  assert.notEqual(wall.material,furniture.material);
  update({x:0,z:-30});
  assert.equal(wall.material.opacity,.14); assert.equal(wall.userData.pointerPassthrough,true);
  assert.equal(furniture.material.opacity,1);
  update({x:0,z:30});
  assert.equal(wall.material.opacity,1); assert.equal(wall.userData.pointerPassthrough,false);
});
