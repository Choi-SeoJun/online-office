import * as THREE from 'three';
import { createAdaptiveQuality } from './render-quality.ts';
import { createQualityApplicator } from './render-quality-renderer.ts';
import { createMonitorScreen } from './monitor-screen.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOUNDS, DESKS, isRoofTarget, ROOF_BOUNDS, roofWallForTarget, TARGETS } from './layout.ts';
import type { Floor, OfficeScene, Point, SceneCallbacks, TargetId } from './types.ts';
import { animateActor, box, chair, createActor, createBossDesk, cylinder, desk, disposeModelCaches, material, mug, plant, plaque, sphere } from './models.ts';
import { createEnvironmentScene, createOfficeWeather } from './environment-scene.ts';
import { animateRooftop, createRooftop, transitionOrbit } from './rooftop.ts';
import { CAMERA_BASE_PITCH, CAMERA_TILT_STEP, CAMERA_TURN_STEP, cameraDragRotation, clampCameraPitch, setCameraOffset, smoothCameraPitch, normalizeCameraAngle, screenAxisToWorld, smoothCameraAngle } from './camera.ts';
import { prepareCameraCutaways } from './camera-cutaway.ts';
import { SOLO_LOUNGE_SEATS, restSeatById } from './rest-seats.ts';
import { chairSpinAngle } from './expression.ts';
import { SOLO_OFFICE_PLAN, type OfficePlan } from './office-plan.ts';
import { createWallBoard, isBoardHit } from './wall-board.ts';

/** Three raycasts hidden descendants; only visible, interactive ancestors may capture a click. */
export function isPointerEligible(object: THREE.Object3D): boolean {
  let ancestor: THREE.Object3D | null = object;
  while (ancestor) {
    if (!ancestor.visible || ancestor.userData.pointerPassthrough) return false;
    ancestor = ancestor.parent;
  }
  return true;
}

export function targetForFloor(object: THREE.Object3D, floor: Floor): TargetId | null {
  if (!isPointerEligible(object)) return null;
  let ancestor: THREE.Object3D | null = object;
  while (ancestor) {
    const target = ancestor.userData.target as TargetId | undefined;
    if (target && target in TARGETS && isRoofTarget(target) === (floor === 'rooftop')) return target;
    ancestor = ancestor.parent;
  }
  return null;
}

export function targetSelectionForHit(hit: Pick<THREE.Intersection, 'object' | 'point'>, floor: Floor): { target: TargetId; point?: Point } | null {
  const target = targetForFloor(hit.object, floor);
  if (!target) return null;
  return roofWallForTarget(target) || target === 'lounge' || target === 'roofBench' ? { target, point: { x: hit.point.x, z: hit.point.z } } : { target };
}

export function batchArchitecture(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const batches = new Map<string, { material: THREE.MeshStandardMaterial; geometries: THREE.BufferGeometry[]; target?: TargetId; ground: boolean; pointerPassthrough: boolean; castShadow: boolean; receiveShadow: boolean }>();
  const originals: THREE.Mesh[] = [];
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial) || object.material.map) return;
    let ancestor: THREE.Object3D | null = object, target: TargetId | undefined;
    while (ancestor) { if (ancestor.userData.dynamic) return; if (ancestor.userData.target) target = ancestor.userData.target as TargetId; ancestor = ancestor.parent; }
    const ground = !!object.userData.ground, pointerPassthrough = !!object.userData.pointerPassthrough;
    const key = `${object.material.uuid}/${target ?? ''}/${ground}/${pointerPassthrough}/${object.castShadow}/${object.receiveShadow}`;
    if (!batches.has(key)) batches.set(key, { material: object.material, geometries: [], target, ground, pointerPassthrough, castShadow: object.castShadow && !ground, receiveShadow: object.receiveShadow });
    let geometry = object.geometry.clone();
    if (geometry.index) { const unindexed = geometry.toNonIndexed(); geometry.dispose(); geometry = unindexed; }
    geometry.applyMatrix4(object.matrixWorld); batches.get(key)!.geometries.push(geometry); originals.push(object);
  });
  batches.forEach(batch => {
    const geometry = mergeGeometries(batch.geometries, false);
    if (geometry) { const mesh = new THREE.Mesh(geometry, batch.material); mesh.castShadow = batch.castShadow; mesh.receiveShadow = batch.receiveShadow; mesh.userData.target = batch.target; mesh.userData.ground = batch.ground; mesh.userData.pointerPassthrough = batch.pointerPassthrough; group.add(mesh); }
    batch.geometries.forEach(g => g.dispose());
  });
  originals.forEach(mesh => mesh.removeFromParent());
}

/** This internal screen stays solid when the exterior camera cutaways fade. */
export function createPantryDivider(parent: THREE.Object3D, partition: OfficePlan['partition']) {
  const { x, z, w, d, height } = partition;
  box(parent, w, height, d, '#e8e1ce', x, height / 2, z, .018);
  box(parent, w + .06, .08, d + .04, '#ac916f', x, height + .04, z, .012);
  box(parent, w + .025, .14, d, '#c6b292', x, .10, z, .01);
}

export function createOfficeScene(host: HTMLElement, callbacks: SceneCallbacks): OfficeScene {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' }); }
  catch { callbacks.onError('3D 사무실을 열 수 없어요. 브라우저의 그래픽 가속을 확인해 주세요.'); return { dispose() {}, zoom() {}, rotate() {}, tilt() {}, resetView() {}, screenToWorld:axis=>axis }; }
  renderer.setClearColor('#e6e5dc'); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;'; renderer.domElement.setAttribute('aria-label', '클릭해서 걸어 다니는 3D 사무실'); host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e6e5dc'); scene.fog = new THREE.Fog('#e6e5dc', 34, 70);
  const camera = new THREE.OrthographicCamera(-14, 14, 10, -10, .1, 90);
  const room = new THREE.Group(); room.name = 'office'; scene.add(room);
  const plan = SOLO_OFFICE_PLAN, furniture = plan.furniture;
  const ambient = new THREE.HemisphereLight('#f5f5e7', '#91a09a', 2.5); scene.add(ambient);
  const sunlight = new THREE.DirectionalLight('#fff2d7', 3.6); sunlight.position.set(-3, 14, -6); sunlight.castShadow = true; sunlight.shadow.mapSize.set(2048, 2048); sunlight.shadow.camera.left = -13; sunlight.shadow.camera.right = 13; sunlight.shadow.camera.top = 11; sunlight.shadow.camera.bottom = -11; sunlight.shadow.normalBias = .035; sunlight.shadow.bias = -.0002; scene.add(sunlight); scene.add(sunlight.target);
  const fill = new THREE.DirectionalLight('#e1eff4', 1.1); fill.position.set(10, 8, 9); scene.add(fill);
  // Floating architectural base, tiny bevels and carpet squares give the room a miniature feel.
  box(room, 18.4, .40, 12.4, '#a8b1a7', 0, -.28, 0, .14);
  const floor = box(room, 18, .12, 12, '#bbbdad', 0, -.04, 0, .025); floor.userData.ground = true;
  for (let x = 0; x < 18; x++) for (let z = 0; z < 12; z++) {
    const pantry = x - 8.5 > plan.partition.x && z - 5.5 < plan.partition.z + plan.partition.d / 2 + .9;
    const color = pantry ? ['#d8c6a6', '#ddccae', '#d2c09f'][(x + z * 3) % 3] : ['#c8cbbd', '#c2c6b7', '#c4c8ba', '#cbd0c2'][(x * 7 + z * 3) % 4];
    const tile = box(room, .992, .012, .992, color, x - 8.5, .028, z - 5.5, 0); tile.userData.ground = true;
  }
  box(room, 18.25, 3.35, .16, '#e9e6d7', 0, 1.65, -6.08);
  box(room, .16, 3.35, 12.15, '#d9dfd1', -9.08, 1.65, 0);
  box(room, 18.2, .17, .10, '#a7b5a6', 0, .15, -5.95); box(room, .10, .17, 12, '#a7b5a6', -8.96, .15);
  box(room, 18.2, .10, .23, '#f8f2df', 0, 3.31, -6.08); box(room, .23, .10, 12.1, '#f8f2df', -9.08, 3.31);
  const officeWeather = callbacks.getEnvironment ? createOfficeWeather() : undefined;
  // The window views sit behind the mullions and above the wooden sills.
  for (const x of [-3.1, .65, 6.35]) {
    box(room, 2.75, 1.73, .07, '#f6f1df', x, 2.18, -5.94);
    if (officeWeather) officeWeather.addWindow(room, x, 2.18, -5.875, 2.52, 1.50);
    else {
      box(room, 2.52, 1.50, .04, '#a9c9cf', x, 2.18, -5.89, .005);
      box(room, 2.53, .55, .015, '#c6ddd8', x, 1.74, -5.86, .002);
      for (let i = 0; i < 8; i++) box(room, .18 + (i % 3) * .06, .17 + (i % 4) * .09, .013, i % 2 ? '#91b0b4' : '#a0bbbd', x - 1.04 + i * .30, 1.68 + (i % 4) * .045, -5.84, 0);
    }
    box(room, .055, 1.53, .07, '#f9f7e8', x, 2.18, -5.81); box(room, 2.75, .09, .25, '#d9c29a', x, 1.31, -5.83);
    for (let i = 0; i < 4; i++) box(room, 2.71, .022, .05, '#d9dfcf', x, 2.78 + i * .055, -5.76, 0);
  }
  // Low open-side balustrades retain the readable cutaway.
  box(room, .10, .46, 9.6, '#e8e4d5', 9, .24, -1.1); box(room, .17, .08, 9.8, '#b6b8a5', 9, .51, -1.1);
  box(room, 9.8, .21, .12, '#d9dccd', -4, .12, 6); box(room, 5.0, .21, .12, '#d9dccd', 6.5, .12, 6);
  // Office identity above the boss desk; the shared board uses the open left wall.
  plaque(room, '온라인 회사', 2.15, .43, -6.15, 2.67, -5.968, '#304e4a');
  plaque(room, '작은 여유, 큰 생산성', 2.0, .24, -6.15, 2.24, -5.967, '#e9e6d7', '#6c7f70');
  // Wall clock, its hands face the room.
  const clock = cylinder(room, .30, .30, .065, '#64766b', 3.28, 2.62, -5.92); clock.rotation.x = Math.PI / 2;
  const face = cylinder(room, .264, .264, .008, '#fff8e6', 3.28, 2.62, -5.88); face.rotation.x = Math.PI / 2;
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; const tick = box(room, .018, .044, .015, '#728276', 3.28 + Math.sin(a) * .217, 2.62 + Math.cos(a) * .217, -5.866, 0); tick.rotation.z = -a; }
  const minute = box(room, .014, .19, .017, '#475c52', 3.28, 2.69, -5.851); minute.rotation.z = -.40;
  const hour = box(room, .022, .13, .018, '#475c52', 3.23, 2.64, -5.841); hour.rotation.z = .95;
  sphere(room, .026, '#a67858', 3.28, 2.62, -5.83, 1, 1, .3);
  // Desks precisely share the collision layout.
  const desks = DESKS.map((d, i) => desk(room, d.x, d.z, i));
  desks[5].group.userData.target = 'desk'; desks[5].chair.userData.target = 'desk';
  desks[5].chair.userData.dynamic = true;
  const ownMonitor = createMonitorScreen(desks[5].screen);
  createBossDesk(room, furniture.bossDesk);
  const rearDeskZ = Math.min(...DESKS.map(item => item.z));
  for (const item of DESKS) {
    const rearRow = item.z === rearDeskZ;
    box(room, 2.55, rearRow ? .54 : .43, .055, rearRow ? '#e0e1d2' : '#dfe0d1', item.x, rearRow ? 1.28 : 1.23, item.z - .59);
    if (rearRow) box(room, 2.57, .035, .065, '#9fae9f', item.x, 1.56, item.z - .59);
  }
  // The solid rear screen hides the pantry while its open front keeps the aisle clear.
  createPantryDivider(room, plan.partition);
  // Coffee cabinet.
  const coffee = new THREE.Group(); coffee.position.set(furniture.coffee.x, 0, furniture.coffee.z); coffee.userData.target = 'coffee'; room.add(coffee);
  box(coffee, furniture.coffee.w, .98, furniture.coffee.d, '#e8e4d4', 0, .50); box(coffee, furniture.coffee.w + .07, .10, furniture.coffee.d + .06, '#b7956e', 0, 1.04);
  for (const x of [-.42, .42]) { box(coffee, .79, .78, .028, '#d8dccd', x, .53, .762); box(coffee, .09, .035, .035, '#809185', x, .77, .791); }
  box(coffee, .64, .61, .48, '#3f4d49', -.18, 1.39, -.15, .05); box(coffee, .55, .11, .52, '#263935', -.18, 1.14, -.10);
  box(coffee, .44, .26, .045, '#9baaa0', -.18, 1.48, .105); box(coffee, .13, .07, .015, '#a0cfc0', -.18, 1.55, .135);
  cylinder(coffee, .075, .075, .10, '#48554c', -.18, 1.34, .13); mug(coffee, -.18, 1.19, .14, '#f0e7cc');
  cylinder(coffee, .135, .13, .28, '#b48a61', .52, 1.23, -.10); cylinder(coffee, .14, .14, .035, '#d9c5a3', .52, 1.39, -.10);
  mug(coffee, .47, 1.10, .43, '#769a8b'); mug(coffee, .68, 1.10, .43, '#e8c38e');
  plaque(coffee, 'COFFEE BREAK', 1.11, .19, 0, .72, .78, '#d8dccd', '#557165');
  // Snack display: open shelves, wrapped bars, jars and cookie trays.
  const snacks = new THREE.Group(); snacks.position.set(furniture.snacks.x, 0, furniture.snacks.z); snacks.userData.target = 'snacks'; room.add(snacks);
  box(snacks, 1.7, .18, 1.5, '#b29974', 0, .14); box(snacks, .08, 1.5, 1.50, '#baa17d', -.81, .87); box(snacks, .08, 1.5, 1.5, '#baa17d', .81, .87); box(snacks, 1.63, 1.46, .07, '#e0dac1', 0, .85, -.715);
  for (const y of [.38, .90, 1.48]) box(snacks, 1.7, .075, 1.5, '#cab08a', 0, y);
  for (let row = 0; row < 2; row++) for (let i = 0; i < 5; i++) { const p = box(snacks, .20, .28, .22, ['#b36f5a', '#d7b65e', '#7c9a7f', '#e7d8b8', '#879fa6'][i], -.59 + i * .29, .56 + row * .52, .19, .018); p.rotation.z = (i % 2 ? .08 : -.08); box(snacks, .12, .075, .008, '#f6ebd0', -.59 + i * .29, .59 + row * .52, .305, .004); }
  for (let i = 0; i < 3; i++) { cylinder(snacks, .13, .13, .24, ['#d8ba85', '#ac8563', '#c9bd94'][i], -.44 + i * .44, 1.65, -.08); cylinder(snacks, .14, .14, .04, '#657c6a', -.44 + i * .44, 1.79, -.08); }
  // Lounge bistro table and upholstered bench aligned with its seat point.
  const lounge = new THREE.Group(); lounge.userData.target = 'lounge'; room.add(lounge);
  const table = furniture.lounge;
  cylinder(lounge, .06, .08, .94, '#718074', table.x, .48, table.z); cylinder(lounge, .45, .45, .08, '#79887b', table.x, .08, table.z);
  box(lounge, table.w, .10, table.d, '#c7aa7c', table.x, 1.0, table.z, .17);
  mug(lounge, table.x - .32, 1.06, table.z + .1, '#e9d9b1'); box(lounge, .36, .022, .45, '#758a76', table.x + .23, 1.064, table.z - .08, .005);
  for (const seat of SOLO_LOUNGE_SEATS) {
    const model = chair(lounge, seat.seat.x, seat.seat.z, '#587c72', seat.angle + Math.PI);
    model.name = seat.id;
  }
  // Copier with tinted display, scan bed, paper drawers and tray stack.
  const copier = new THREE.Group(); copier.position.set(furniture.copier.x, 0, furniture.copier.z); copier.userData.target = 'copier'; room.add(copier);
  box(copier, 1.35, 1.1, 1.15, '#dedfd3', 0, .58, 0, .05); box(copier, 1.30, .13, 1.1, '#525e58', 0, 1.18, 0, .025);
  box(copier, 1.12, .05, .85, '#98b4aa', -.04, 1.265, -.05); box(copier, 1.17, .07, .89, '#eff0e5', -.04, 1.31, -.05);
  const console = box(copier, .52, .10, .27, '#64746c', .30, 1.24, .52); console.rotation.x = .12; box(copier, .29, .012, .15, '#a4d2c1', .25, 1.305, .54);
  for (let i = 0; i < 3; i++) { box(copier, 1.13, .025, .018, '#b4c0b3', 0, .30 + i * .25, .585); box(copier, .23, .045, .023, '#8d9c90', 0, .39 + i * .25, .60); }
  box(copier, .55, .045, .75, '#6b7970', .90, .88, 0); for (let i = 0; i < 5; i++) box(copier, .43, .015, .60, '#f6f2df', .88, .92 + i * .016, 0, .003);
  // Entry mat and polished directional sign occupy the open front edge.
  const entry = box(room, 2.20, .025, .72, '#648377', 1.8, .05, 5.45, .06); entry.userData.target = 'exit';
  const entryText = plaque(room, '출입구  →', 1.45, .24, 1.8, .072, 5.44, '#648377', '#e8efdd'); entryText.rotation.x = -Math.PI / 2; entryText.userData.target = 'exit';
  plant(room, -8.20, -5.25, 1.1); plant(room, 8.15, 4.72, 1.30); plant(room, -8.30, 2.65, .85);
  // Desktop succulent and tasteful desk name plate.
  const succ = plant(desks[5].group, 1.01, .30, .22); succ.position.y = 1.14;
  plaque(desks[5].group, '내 자리', .43, .14, .71, 1.25, .53, '#5c8372');
  // Subtle sunlight rectangles on the carpet.
  if (!officeWeather) for (let i = 0; i < 3; i++) { const ray = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 3.6), new THREE.MeshBasicMaterial({ color: '#fff0bb', transparent: true, opacity: .10, depthWrite: false })); ray.rotation.x = -Math.PI / 2; ray.rotation.z = -.2; ray.position.set(-2.8 + i * 3.7, .049, -3.3); room.add(ray); }
  // Batch the immutable architecture and props by material and interaction tag.
  // This keeps the richly furnished room to a small number of GPU draw calls.
  const officeCutaways = prepareCameraCutaways(room, true); batchArchitecture(room);
  const wallBoard = createWallBoard(room, BOUNDS, -9);
  const roof = createRooftop(scene, !!callbacks.getEnvironment); const roofCutaways = prepareCameraCutaways(roof); batchArchitecture(roof); roof.visible = false;
  const state = callbacks.getState();
  const actors = new Map<string, ReturnType<typeof createActor>>();
  const playerGroup = new THREE.Group(); scene.add(playerGroup);
  actors.set(state.player.id, createActor(playerGroup, 0, state.player.name, state.player.avatar));
  const boss = createActor(room, 1, state.boss.name, state.boss.avatar); boss.root.userData.target = 'boss'; actors.set(state.boss.id, boss);
  state.coworkers.forEach((a, i) => actors.set(a.id, createActor(room, i + 2, a.name, a.avatar)));
  // World-space interaction rings stay below the characters and never capture clicks.
  const selection = new THREE.Mesh(new THREE.RingGeometry(.50, .56, 48), new THREE.MeshBasicMaterial({ color: '#dca45e', transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false })); selection.rotation.x = -Math.PI / 2; selection.position.y = .065; scene.add(selection);
  const destination = new THREE.Mesh(new THREE.RingGeometry(.13, .19, 24), new THREE.MeshBasicMaterial({ color: '#4d9184', transparent: true, opacity: .72, side: THREE.DoubleSide, depthWrite: false })); destination.rotation.x = -Math.PI / 2; destination.position.y = .07; scene.add(destination);
  const playerRing = new THREE.Mesh(new THREE.RingGeometry(.31, .37, 32), new THREE.MeshBasicMaterial({ color: '#467d70', transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false })); playerRing.rotation.x = -Math.PI / 2; playerRing.position.y = .06; scene.add(playerRing);
  let width = 1, height = 1, zoomLevel = 1, dead = false, graphicsLost = false, frame = 0, lastTime = 0, visible = !document.hidden, orbit = 0, userOrbit = 0, targetOrbit = 0, pitch = CAMERA_BASE_PITCH, targetPitch = CAMERA_BASE_PITCH;
  const qualityControl = createAdaptiveQuality(), applyQuality = createQualityApplicator(renderer, sunlight);
  const effectSettings = { ...state.settings };
  let lastFloor = state.floor;
  const officeColor = new THREE.Color('#e6e5dc'), roofColor = new THREE.Color('#e6d6bf');
  const weather = callbacks.getEnvironment ? createEnvironmentScene(scene, roof, ambient, sunlight, officeColor, roofColor, fill) : undefined;
  const focus = new THREE.Vector3(0, .5, 0); const desired = new THREE.Vector3(); const rotatedOffset = new THREE.Vector3();
  const updateCamera = () => {
    const aspect = width / height; const mobile = aspect < .9;
    const span = (mobile ? 15.2 : Math.max(15.6, 23.2 / aspect)) * zoomLevel;
    camera.left = -span * aspect / 2; camera.right = span * aspect / 2; camera.top = span / 2; camera.bottom = -span / 2; camera.updateProjectionMatrix(); setCameraOffset(rotatedOffset, orbit, pitch, 32); camera.position.copy(focus).add(rotatedOffset); camera.lookAt(focus); officeCutaways(rotatedOffset); roofCutaways(rotatedOffset);
  };
  const resize = () => { if (dead) return; qualityControl.reset(); width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight); renderer.setSize(width, height, false); updateCamera(); };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  const adjustZoom = (factor: number) => { if (callbacks.getState().transition) return; zoomLevel = THREE.MathUtils.clamp(zoomLevel * factor, .64, 1.45); updateCamera(); };
  const zoom = (delta: number) => { adjustZoom(Math.pow(.9, delta)); };
  const rotate = (delta: number) => { if (callbacks.getState().transition || !Number.isFinite(delta)) return; targetOrbit = normalizeCameraAngle(targetOrbit + delta * CAMERA_TURN_STEP); };
  const tilt = (delta: number) => { if (callbacks.getState().transition || !Number.isFinite(delta)) return; targetPitch = clampCameraPitch(targetPitch + delta * CAMERA_TILT_STEP); };
  const resetView = () => { if (!callbacks.getState().transition) { targetOrbit = 0; targetPitch = CAMERA_BASE_PITCH; } };
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(); let down: { x: number; y: number; time: number; id: number; orbit:number; pitch:number; dragged:boolean; board:boolean } | null = null;
  const boardAtPointer = (event: PointerEvent) => {
    if (callbacks.getState().floor !== 'office') return false;
    const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([room, playerGroup], true).find(hit => isPointerEligible(hit.object));
    return !!hit && isBoardHit(hit.object, 'office');
  };
  const pointerDown = (e: PointerEvent) => { if (e.button !== 0 || callbacks.getState().transition || down) return; down = { x: e.clientX, y: e.clientY, time: performance.now(), id: e.pointerId, orbit:targetOrbit, pitch:targetPitch, dragged:false, board:boardAtPointer(e) }; renderer.domElement.setPointerCapture?.(e.pointerId); };
  const pointerMove = (e: PointerEvent) => { if (!down || down.board || down.id !== e.pointerId || callbacks.getState().transition) return; const delta = cameraDragRotation(e.clientX-down.x,e.clientY-down.y); if (delta !== null || down.dragged) { down.dragged = true; targetOrbit = normalizeCameraAngle(down.orbit-(e.clientX-down.x)*.009); targetPitch = clampCameraPitch(down.pitch+(e.clientY-down.y)*.006); renderer.domElement.style.cursor='grabbing'; } };
  const pointerUp = (e: PointerEvent) => {
    const start = down; if (start?.id !== e.pointerId) return; down = null; renderer.domElement.style.cursor=''; const current = callbacks.getState(); if (current.transition || !start || start.dragged || cameraDragRotation(e.clientX-start.x,e.clientY-start.y)!==null || performance.now() - start.time > 650) return;
    if (start.board) { if (boardAtPointer(e)) callbacks.onBoard?.(); return; }
    const rect = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
    const onRoof = current.floor === 'rooftop', bounds = onRoof ? ROOF_BOUNDS : BOUNDS;
    // Raycaster does not treat an invisible parent as an interaction boundary.
    // Restrict it to the current floor so hidden desks cannot capture roof taps.
    const hits = raycaster.intersectObjects((onRoof ? roof : room).children, true);
    for (const hit of hits) { if (!isPointerEligible(hit.object)) continue; if (isBoardHit(hit.object, current.floor)) { callbacks.onBoard?.(); return; } const selection = targetSelectionForHit(hit, current.floor); if (selection) { callbacks.onTarget(selection.target, selection.point); return; } if (hit.object.userData.ground) { callbacks.onGround({ x: THREE.MathUtils.clamp(hit.point.x, bounds.minX, bounds.maxX), z: THREE.MathUtils.clamp(hit.point.z, bounds.minZ, bounds.maxZ) }); return; } }
  };
  const pointerCancel = () => { down = null; renderer.domElement.style.cursor=''; }; const wheel = (e: WheelEvent) => { e.preventDefault(); adjustZoom(Math.exp(THREE.MathUtils.clamp(e.deltaY, -300, 300) * .0007)); };
  const contextLoss = (e: Event) => { e.preventDefault(); graphicsLost = true; cancelAnimationFrame(frame); callbacks.onError('그래픽 연결이 잠시 끊겼어요. 다시 열어보기를 누르면 이어서 놀 수 있어요.'); };
  const visibility = () => { visible = !document.hidden; lastTime = 0; qualityControl.reset(); down = null; };
  renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointermove', pointerMove); renderer.domElement.addEventListener('pointerup', pointerUp); renderer.domElement.addEventListener('pointercancel', pointerCancel); renderer.domElement.addEventListener('lostpointercapture', pointerCancel); renderer.domElement.addEventListener('wheel', wheel, { passive: false }); renderer.domElement.addEventListener('webglcontextlost', contextLoss); document.addEventListener('visibilitychange', visibility);
  const render = (now: number) => {
    if (dead || graphicsLost) return; frame = requestAnimationFrame(render); if (!visible) return;
    const dt = lastTime ? Math.min(.05, Math.max(0, (now - lastTime) / 1000)) : 0; lastTime = now;
    callbacks.onFrame(dt); const s = callbacks.getState();
    ownMonitor.set(callbacks.getWallpaper?.() ?? null);
    wallBoard.update(callbacks.getBoardEntries?.());
    const onRoof = s.floor === 'rooftop'; room.visible = !onRoof; roof.visible = onRoof;
    const quality = qualityControl.sample(now, s.settings.quality, !s.transition && lastFloor === s.floor);
    applyQuality(quality, window.devicePixelRatio);
    effectSettings.quality = quality.effects; effectSettings.reducedMotion = s.settings.reducedMotion;
    if (weather) {
      const environment = callbacks.getEnvironment?.();
      weather.update(environment, onRoof, effectSettings, dt);
      if (!onRoof && environment) officeWeather?.update(environment, effectSettings, dt);
    } else {
      const background = onRoof ? roofColor : officeColor;
      (scene.background as THREE.Color).copy(background); (scene.fog as THREE.Fog).color.copy(background);
      ambient.color.set(onRoof ? '#fff0d5' : '#f5f5e7');
    }
    userOrbit = smoothCameraAngle(userOrbit, targetOrbit, dt, s.settings.reducedMotion); orbit = userOrbit + transitionOrbit(s.transition, s.settings.reducedMotion); pitch = smoothCameraPitch(pitch, targetPitch, dt, s.settings.reducedMotion);
    const mobile = width / height < .9;
    desired.set(mobile ? s.player.x * .72 : s.player.x * (onRoof ? .15 : .09), onRoof ? .65 : .5, mobile ? s.player.z * .65 : onRoof ? -.55 + s.player.z * .17 : s.player.z * .05);
    // The midpoint is covered by the UI fade, so reset tracking there rather
    // than sliding across the unrelated old floor after the new one appears.
    if (lastFloor !== s.floor) { focus.copy(desired); lastFloor = s.floor; down = null; }
    else focus.lerp(desired, s.settings.reducedMotion ? 1 : 1 - Math.exp(-dt * 2.5)); updateCamera();
    (onRoof ? [s.player] : [s.player, s.boss, ...s.coworkers]).forEach(a => { const rig = actors.get(a.id); if (rig) animateActor(rig, a, s, s.elapsed); });
    if (onRoof) animateRooftop(roof, s.elapsed, s.settings.reducedMotion);
    desks[5].chair.rotation.y = chairSpinAngle(s);
    selection.visible = !s.transition && s.target !== null && isRoofTarget(s.target) === onRoof; if (s.target && selection.visible) { const p = s.target === 'boss' ? s.boss : roofWallForTarget(s.target) && s.roofLeanPoint ? s.roofLeanPoint : (s.target === 'lounge' || s.target === 'roofBench') ? restSeatById(s.restSeatId)?.approach ?? s.destination ?? (s.ready ? s.player : TARGETS[s.target].point) : TARGETS[s.target].point; selection.position.set(p.x, .065, p.z); selection.scale.setScalar(s.settings.reducedMotion ? 1 : 1 + Math.sin(s.elapsed * 3) * .025); }
    destination.visible = !!s.destination; if (s.destination) destination.position.set(s.destination.x, .07, s.destination.z);
    playerRing.position.set(s.player.x, .065, s.player.z); renderer.render(scene, camera);
  };
  // First render is synchronous so the entry panel can reliably display a ready state.
  try { render(performance.now()); callbacks.onReady(); } catch (e) { callbacks.onError(e instanceof Error ? e.message : '사무실을 불러오지 못했어요.'); }
  return {
    zoom, rotate, tilt, resetView, screenToWorld:axis=>screenAxisToWorld(axis,orbit),
    dispose() {
      dead = true; cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', visibility);
      weather?.dispose(); wallBoard.dispose(); ownMonitor.dispose();
      renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointermove', pointerMove); renderer.domElement.removeEventListener('pointerup', pointerUp); renderer.domElement.removeEventListener('pointercancel', pointerCancel); renderer.domElement.removeEventListener('lostpointercapture', pointerCancel); renderer.domElement.removeEventListener('wheel', wheel); renderer.domElement.removeEventListener('webglcontextlost', contextLoss);
      const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
      scene.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) { if (object instanceof THREE.Mesh) geometries.add(object.geometry); const ms = Array.isArray(object.material) ? object.material : [object.material]; ms.forEach(m => { materials.add(m); const map = (m as THREE.MeshStandardMaterial).map; if (map) textures.add(map); }); } });
      geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); sunlight.shadow.dispose(); renderer.dispose(); renderer.domElement.remove(); disposeModelCaches();
    },
  };
}
