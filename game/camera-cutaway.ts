import * as THREE from 'three';
import { wallFacesCamera } from './camera.ts';
import type { Point, RoofWallSide } from './types.ts';

/** Clone only boundary surfaces; shared furniture materials are never faded. */
export function prepareCameraCutaways(group: THREE.Group, detectOfficeWalls = false) {
  group.updateMatrixWorld(true);
  const surfaces: {mesh:THREE.Mesh;side:RoofWallSide;material:THREE.Material;castShadow:boolean;receiveShadow:boolean}[] = [];
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    let side = object.userData.cutawaySide as RoofWallSide | undefined;
    if (!side && detectOfficeWalls) {
      object.geometry.computeBoundingBox();
      const bounds = object.geometry.boundingBox?.clone().applyMatrix4(object.matrixWorld);
      if (bounds && bounds.max.y > .65) {
        if (bounds.max.z < -5.7) side = 'north';
        else if (bounds.max.x < -8.65) side = 'west';
      }
    }
    if (!side) return;
    const original = object.material;
    const mat = original.clone(); mat.transparent = true; object.material = mat;
    // Unique roof cutaway materials are replaced; shared model-cache materials
    // remain owned by the model cache and are disposed with the complete scene.
    if (object.userData.cutawaySide && original.transparent) original.dispose();
    object.userData.dynamic = true;
    surfaces.push({mesh:object,side,material:mat,castShadow:true,receiveShadow:true});
  });
  return (offset: Point) => {
    for (const {mesh,side,material,castShadow,receiveShadow} of surfaces) {
      const foreground = wallFacesCamera(side, offset);
      material.opacity = foreground ? .14 : 1;
      material.depthWrite = !foreground;
      mesh.castShadow = !foreground && castShadow;
      mesh.receiveShadow = !foreground && receiveShadow;
      mesh.userData.pointerPassthrough = foreground;
    }
  };
}
