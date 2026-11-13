import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROOF_BOUNDS, ROOF_OBSTACLES, ROOF_REST } from './layout.ts';
import type { Precipitation } from './environment-types.ts';
import type { Settings } from './types.ts';

type SurfaceState = { snow: number; wet: number };
const elapsed = (dt: number) => Number.isFinite(dt) ? Math.min(.1, Math.max(0, dt)) : 0;
const seed = (n: number) => ((Math.sin(n * 127.1 + 3) * 43758.5453) % 1 + 1) % 1;

/** Cosmetic coverage, not measured snow depth. No wall-clock catch-up on resume. */
export function stepRoofSurfaceWeather(state: SurfaceState, kind: Precipitation, dt: number): SurfaceState {
  const step = elapsed(dt);
  if (!step) return state;
  return {
    snow: THREE.MathUtils.clamp(state.snow + step * (kind === 'snow' ? 1 / 90 : kind === 'rain' ? -1 / 45 : -1 / 110), 0, 1),
    wet: THREE.MathUtils.clamp(state.wet + step * (kind === 'rain' ? 1 / 28 : -1 / 70), 0, 1),
  };
}

// A shallow, irregular mound with a flat edge; all vertices lie inside unit X/Z.
function patchGeometry() {
  const segments = 32, vertices = [0, 1, 0], indices: number[] = [];
  for (const radius of [.35, .72, 1]) for (let i = 0; i < segments; i++) {
    const a = i / segments * Math.PI * 2, edge = .88 + .07 * Math.sin(a * 3) + .04 * Math.cos(a * 7);
    vertices.push(Math.cos(a) * radius * edge, 1 - radius * radius, Math.sin(a) * radius * edge);
  }
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(0, 1 + next, 1 + i);
    for (let ring = 0; ring < 2; ring++) {
      const inner = 1 + ring * segments, outer = inner + segments;
      indices.push(inner + i, outer + next, outer + i, inner + i, inner + next, outer + next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function floorPatches() {
  const points: { x: number; z: number; rx: number; rz: number }[] = [];
  for (let i = 0; i < 300 && points.length < 34; i++) {
    const rx = .7 + seed(i * 4 + 80) * 1.2, rz = .45 + seed(i * 4 + 60) * .75;
    const x = THREE.MathUtils.lerp(ROOF_BOUNDS.minX + rx + .04, ROOF_BOUNDS.maxX - rx - .04, seed(i * 4));
    const z = THREE.MathUtils.lerp(ROOF_BOUNDS.minZ + rz + .04, ROOF_BOUNDS.maxZ - rz - .04, seed(i * 4 + 99));
    if (ROOF_OBSTACLES.some(o => Math.abs(o.x - x) < o.w / 2 + rx && Math.abs(o.z - z) < o.d / 2 + rz)) continue;
    if (points.some(p => Math.hypot(p.x - x, p.z - z) < .7)) continue;
    points.push({ x, z, rx, rz });
  }
  return points;
}

export function createRoofSurfaceWeather(roof: THREE.Group) {
  const root = new THREE.Group(); root.name = 'roof-surface-weather';
  root.userData.pointerPassthrough = true; root.userData.dynamic = true; roof.add(root);
  const patch = patchGeometry(), spots = floorPatches(), pools = spots.filter((_, i) => i % 3 === 1);
  const snowMaterial = new THREE.MeshStandardMaterial({ color: '#f1f5f5', roughness: .94, transparent: true, opacity: 0, depthWrite: false });
  const snowFloor = new THREE.InstancedMesh(patch, snowMaterial, spots.length); snowFloor.name = 'roof-snow-floor';
  const snowBench = new THREE.InstancedMesh(patch, snowMaterial, 7); snowBench.name = 'roof-snow-bench';
  const waterMaterial = new THREE.MeshStandardMaterial({ color: '#9dbdc8', roughness: .14, metalness: .17, transparent: true, opacity: 0, depthWrite: false });
  const puddles = new THREE.InstancedMesh(patch, waterMaterial, pools.length); puddles.name = 'roof-puddles';
  const wetMaterial = new THREE.MeshStandardMaterial({ color: '#526c72', roughness: .25, transparent: true, opacity: 0, depthWrite: false });
  const wetFloor = new THREE.Mesh(new THREE.PlaneGeometry(17.78, 11.78), wetMaterial);
  wetFloor.name = 'roof-wet-floor'; wetFloor.rotation.x = -Math.PI / 2; wetFloor.position.y = .021;
  const dustMaterial = new THREE.MeshStandardMaterial({ color: '#eff4f4', roughness: .98, transparent: true, opacity: 0, depthWrite: false });
  const snowDust = new THREE.Mesh(wetFloor.geometry, dustMaterial); snowDust.name = 'roof-snow-dust';
  snowDust.rotation.x = -Math.PI / 2; snowDust.position.y = .022;
  const bench = ROOF_REST.bench, benchParts: THREE.PlaneGeometry[] = [];
  for (let i = 0; i < 4; i++) benchParts.push(new THREE.PlaneGeometry(3.08, .135).rotateX(-Math.PI / 2)
    .translate(bench.seat.x, bench.seatTop + .005, bench.seat.z - .23 + i * .155));
  for (let i = 0; i < 3; i++) benchParts.push(new THREE.PlaneGeometry(3.08, .125)
    .translate(bench.seat.x, .89 + i * .17, bench.seat.z - .279));
  const benchMaterial = new THREE.MeshStandardMaterial({ color: '#485c5a', roughness: .2, transparent: true, opacity: 0, depthWrite: false });
  const wetBench = new THREE.Mesh(mergeGeometries(benchParts)!, benchMaterial); wetBench.name = 'roof-wet-bench';
  benchParts.forEach(geometry => geometry.dispose());
  root.add(wetFloor, wetBench, puddles, snowDust, snowFloor, snowBench);
  // Transparent instanced meshes sort by a single center; keep the physical
  // layers stable through snow-to-rain transitions at every camera angle, below
  // default-order navigation rings which sit above the shallow covering.
  wetFloor.renderOrder = wetBench.renderOrder = -5;
  puddles.renderOrder = -4; snowDust.renderOrder = -2;
  snowFloor.renderOrder = snowBench.renderOrder = -1;
  for (const mesh of [snowFloor, snowBench, puddles]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
  }
  const ripples = new THREE.Group(); ripples.name = 'roof-ripples'; root.add(ripples);
  const ring = new THREE.RingGeometry(.88, 1, 28);
  for (let i = 0; i < Math.min(6, pools.length); i++) {
    const material = new THREE.MeshBasicMaterial({ color: '#e0eff1', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const mesh = new THREE.Mesh(ring, material); mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = -3;
    mesh.position.set(pools[i].x, .029, pools[i].z); ripples.add(mesh);
  }
  root.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = false; object.receiveShadow = !(object.material instanceof THREE.MeshBasicMaterial); } });
  const transform = new THREE.Object3D();
  const place = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, rx: number, height: number, rz: number) => {
    transform.position.set(x, y, z); transform.scale.set(rx, height, rz); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
  };
  let state: SurfaceState = { snow: 0, wet: 0 }, clock = 0, pending = 0, wasOnRoof = false, lastKind: Precipitation | undefined;
  let disposed = false;
  root.visible = false;
  return {
    update(kind: Precipitation, onRoof: boolean, settings: Pick<Settings, 'quality' | 'reducedMotion'>, dt: number) {
      if (disposed) return;
      const step = elapsed(dt); state = stepRoofSurfaceWeather(state, kind, step);
      root.visible = onRoof && (state.snow > .002 || state.wet > .002);
      const justReturned = onRoof && !wasOnRoof; wasOnRoof = onRoof;
      if (!onRoof) return;
      pending += step;
      if (kind === 'rain' && !settings.reducedMotion) clock += step;
      ripples.visible = kind === 'rain' && state.wet > .12 && !settings.reducedMotion;
      for (let i = 0; i < ripples.children.length; i++) {
        const mesh = ripples.children[i] as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
        mesh.visible = settings.quality !== 'low' || i < 2;
        const phase = (clock * (.62 + seed(i + 900) * .3) + seed(i + 200)) % 1;
        mesh.scale.setScalar(.04 + phase * .30 * state.wet);
        mesh.material.opacity = (1 - phase) * state.wet * .22;
      }
      if (!justReturned && lastKind === kind && pending < .1) return;
      pending = 0; lastKind = kind;
      const { snow, wet } = state, spread = .42 + snow * .58;
      snowDust.visible = snowFloor.visible = snowBench.visible = snow > .002;
      dustMaterial.opacity = snow * .35;
      snowMaterial.opacity = Math.min(1, snow * 1.8);
      spots.forEach((p, i) => place(snowFloor, i, p.x, .020, p.z, p.rx * spread, .004 + snow * .035, p.rz * spread));
      for (let i = 0; i < 7; i++) {
        const seat = i < 4;
        place(snowBench, i, bench.seat.x, seat ? bench.seatTop + .003 : .956 + (i - 4) * .17,
          bench.seat.z + (seat ? -.23 + i * .155 : -.32), 1.55, .002 + snow * .017, (seat ? .073 : .038) * spread);
      }
      wetFloor.visible = wetBench.visible = wet > .002;
      wetMaterial.opacity = wet * .2; benchMaterial.opacity = wet * .38;
      puddles.visible = wet > .12;
      waterMaterial.opacity = Math.max(0, (wet - .12) / .88) * .52;
      pools.forEach((p, i) => place(puddles, i, p.x, .024, p.z, p.rx * (.28 + wet * .52), .0015, p.rz * (.28 + wet * .52)));
      for (const mesh of [snowFloor, snowBench, puddles]) mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent();
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
      root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        if (object instanceof THREE.InstancedMesh) object.dispose();
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
    },
  };
}
