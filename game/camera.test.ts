import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_BASE_PITCH, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH, clampCameraPitch, smoothCameraPitch, setCameraOffset, cameraDragRotation, normalizeCameraAngle, screenAxisToWorld, smoothCameraAngle, wallFacesCamera } from './camera.ts';
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
  assert.equal(cameraDragRotation(6, 3), null);
  assert.ok(Math.abs(cameraDragRotation(30, 0)!.orbit + .27) < 1e-10);
  assert.equal(cameraDragRotation(0, -20)!.orbit, 0);
  assert.ok(cameraDragRotation(0, -20)!.pitch < 0);
  assert.ok(cameraDragRotation(30, 20)!.pitch > 0);
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


test('vertical orbit preserves the default view and distance while clamping above the floor', () => {
  for(const radius of [32,50]) {
    const offset=setCameraOffset({x:0,y:0,z:0},0,CAMERA_BASE_PITCH,radius);
    const old=new THREE.Vector3(16,20,24).normalize().multiplyScalar(radius);
    assert.ok(new THREE.Vector3(offset.x,offset.y,offset.z).distanceTo(old)<1e-10);
    for(const pitch of [-20,CAMERA_MIN_PITCH,CAMERA_MAX_PITCH,20]) {
      const next=setCameraOffset(offset,Math.PI/2,pitch,radius);
      assert.equal(next,offset);
      assert.ok(Math.abs(Math.hypot(next.x,next.y,next.z)-radius)<1e-10);
      assert.ok(next.y>0 && Math.hypot(next.x,next.z)>radius*.2);
    }
  }
  assert.equal(clampCameraPitch(-20),CAMERA_MIN_PITCH);
  assert.equal(clampCameraPitch(20),CAMERA_MAX_PITCH);
  assert.equal(clampCameraPitch(NaN),CAMERA_BASE_PITCH);
});

test('vertical easing is bounded and reduced motion reaches the requested height immediately', () => {
  const next=smoothCameraPitch(CAMERA_BASE_PITCH,CAMERA_MAX_PITCH,.016,false);
  assert.ok(next>CAMERA_BASE_PITCH && next<CAMERA_MAX_PITCH);
  assert.equal(smoothCameraPitch(CAMERA_MIN_PITCH,CAMERA_BASE_PITCH,.016,true),CAMERA_BASE_PITCH);
  assert.equal(smoothCameraPitch(CAMERA_MAX_PITCH,20,.016,true),CAMERA_MAX_PITCH);
});
