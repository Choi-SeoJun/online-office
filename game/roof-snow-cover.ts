import * as THREE from 'three';
import type { RoofWallSide } from './types.ts';

type SnowSurface = { x: number; y: number; z: number; rx: number; rz: number; leaf: boolean; wall?: RoofWallSide };

/** Preserve small receiver footprints before static architecture is merged. */
export function captureRoofSnowSurfaces(roof: THREE.Group) {
  roof.updateMatrixWorld(true);
  const inverse = roof.matrixWorld.clone().invert(), surfaces: SnowSurface[] = [];
  roof.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !object.userData.snowReceiver) return;
    object.geometry.computeBoundingBox();
    const bounds = object.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    const leaf = object.userData.snowReceiver === 'leaf';
    surfaces.push({ x: center.x, y: bounds.max.y + .003, z: center.z,
      rx: size.x * (leaf ? .40 : .54), rz: size.z * (leaf ? .43 : .54), leaf,
      ...(object.userData.cutawaySide ? { wall: object.userData.cutawaySide } : {}) });
  });
  roof.userData.snowSurfaces = surfaces;
}

/** All caps share the existing snow geometry; quality reduces leaf detail. */
export function createRoofSnowCover(parent: THREE.Group, roof: THREE.Group, geometry: THREE.BufferGeometry, snowMaterial: THREE.MeshStandardMaterial) {
  const surfaces = (roof.userData.snowSurfaces ?? []) as SnowSurface[];
  const batches = [undefined, 'north', 'south', 'east', 'west'].map(side => {
    const points = surfaces.filter(p => p.wall === side);
    const material = side ? snowMaterial.clone() : snowMaterial;
    const mesh = new THREE.InstancedMesh(geometry, material, points.length);
    mesh.name = side ? `roof-snow-${side}` : 'roof-snow-objects';
    mesh.frustumCulled = false; mesh.renderOrder = -1;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); parent.add(mesh);
    const cap = side ? roof.getObjectByName(`roof-parapet-cap-${side}`) as THREE.Mesh | undefined : undefined;
    return { mesh, points, material, cap };
  });
  const transform = new THREE.Object3D(); let previousSnow = -1, previousLow = false;
  return (snow: number, low: boolean) => {
    const unchanged = low === previousLow && (snow === previousSnow || (snow > 0 && snow < 1 && Math.abs(snow - previousSnow) < .001));
    for (const { mesh, points, material, cap } of batches) {
      mesh.visible = snow > .002;
      if (cap) material.opacity = snowMaterial.opacity * (cap.material as THREE.Material).opacity;
      if (unchanged) continue;
      let index = 0;
      points.forEach((p, i) => {
        if (low && p.leaf && i % 2) return;
        transform.position.set(p.x, p.y, p.z);
        transform.scale.set(p.rx * (.8 + snow * .2), .012 + snow * (p.leaf ? .055 : .09), p.rz * (.8 + snow * .2));
        transform.updateMatrix(); mesh.setMatrixAt(index++, transform.matrix);
      });
      mesh.count = index; mesh.instanceMatrix.needsUpdate = true;
    }
    if (!unchanged) { previousSnow = snow; previousLow = low; }
  };
}
