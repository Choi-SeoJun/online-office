import * as THREE from 'three';
import { createMonitorScreen } from './monitor-screen.ts';
import { animateActor, box, chair, createActor, createBossDesk, cylinder, desk, disposeModelCaches, mug, plant, plaque } from './models.ts';
import { batchArchitecture, createPantryDivider, isPointerEligible, targetSelectionForHit } from './scene.ts';
import { animateRooftop, createRooftop, transitionOrbit } from './rooftop.ts';
import { ROOF_BOUNDS, isRoofTarget, roofWallForTarget } from './layout.ts';
import { remoteAnimationState } from './multi-animation.ts';
import { chairSpinAngle } from './expression.ts';
import { CAMERA_BASE_PITCH, CAMERA_TILT_STEP, CAMERA_TURN_STEP, cameraDragRotation, clampCameraPitch, setCameraOffset, smoothCameraPitch, normalizeCameraAngle, screenAxisToWorld, smoothCameraAngle } from './camera.ts';
import { prepareCameraCutaways } from './camera-cutaway.ts';
import type { Actor, GameState, OfficeScene, Point, RoofWallSide, TargetId } from './types.ts';
import type { MultiLayout } from './multi-layout.ts';
import type { RoomPlayer } from './multi-types.ts';
import { restSeatById } from './rest-seats.ts';
import type { BoardEntry } from './board-types.ts';
import { createWallBoard, isBoardHit } from './wall-board.ts';

export type MultiSceneState = {
  layout: MultiLayout;
  game: GameState;
  players: RoomPlayer[];
  seatIndex?: number;
  serverNow?: number;
  speeches?: { id: string; text: string; until: number }[];
};
export type MultiSceneCallbacks = {
  getState(): MultiSceneState;
  onFrame(dt: number): void;
  onGround(point: Point): void;
  onSeat(index: number): void;
  onTarget(target: TargetId, point?: Point): void;
  onActor?(id: string): void;
  getWallpapers?(): ReadonlyMap<number, string>;
  getBoardEntries?(): BoardEntry[];
  onBoard?(): void;
  onReady(): void;
  onError(message: string): void;
};

export function createMultiArchitecture(layout: MultiLayout) {
  const group = new THREE.Group(); group.name = 'shared-office';
  const { partition, furniture } = layout;
  const b = layout.bounds, w = b.maxX - b.minX, d = b.maxZ - b.minZ, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  box(group, w + .4, .36, d + .4, '#aab6ad', cx, -.25, cz, .12);
  const floor = box(group, w, .12, d, '#c7cec4', cx, -.04, cz); floor.userData.ground = true;
  const nx = Math.ceil(w), nz = Math.ceil(d), tw = w / nx, td = d / nz;
  for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) {
    const px = b.minX + tw * (x + .5), pz = b.minZ + td * (z + .5);
    const pantry = px > partition.x && pz < partition.z + partition.d / 2 + .9;
    const color = (pantry ? ['#d8c6a6', '#ddccae', '#d2c09f'] : ['#d3d9ce', '#cdd5ca', '#d8dcd1'])[(x + z * 2) % 3];
    const tile = box(group, tw - .01, .012, td - .01, color, px, .028, pz, 0); tile.userData.ground = true;
  }
  const walls: { side: RoofWallSide; x: number; z: number; w: number; d: number }[] = [
    { side: 'north', x: cx, z: b.minZ - .07, w: w + .16, d: .14 },
    { side: 'south', x: cx, z: b.maxZ + .07, w: w + .16, d: .14 },
    { side: 'west', x: b.minX - .07, z: cz, w: .14, d: d + .16 },
    { side: 'east', x: b.maxX + .07, z: cz, w: .14, d: d + .16 },
  ];
  for (const wall of walls) {
    box(group, wall.w, .42, wall.d, '#c2ccc1', wall.x, .21, wall.z);
    const upper = box(group, wall.w, 2.5, wall.d, '#e7ece1', wall.x, 1.65, wall.z); upper.userData.cutawaySide = wall.side;
    const cap = box(group, wall.w + .02, .08, wall.d + .06, '#f8f5e8', wall.x, 2.94, wall.z); cap.userData.cutawaySide = wall.side;
  }
  for (let x = b.minX + 2; x < b.maxX - 1; x += 3.1) {
    const window = box(group, 2.3, 1.32, .035, '#a8c5cc', x, 1.95, b.minZ + .018, .01); window.userData.cutawaySide = 'north';
    const sill = box(group, 2.4, .08, .18, '#f5f4e8', x, 1.28, b.minZ + .07); sill.userData.cutawaySide = 'north';
    const divider = box(group, .05, 1.35, .05, '#f5f4e8', x, 1.95, b.minZ + .05); divider.userData.cutawaySide = 'north';
  }
  const chairs = new Map<number, THREE.Group>();
  const monitors = new Map<number, ReturnType<typeof createMonitorScreen>>();
  for (const item of layout.desks) {
    const workstation = new THREE.Group(); workstation.position.set(item.point.x, 0, item.point.z); workstation.rotation.y = item.angle + Math.PI;
    workstation.userData.target = `seat:${item.index}`; group.add(workstation);
    const model = desk(workstation, 0, 0, item.index);
    monitors.set(item.index, createMonitorScreen(model.screen));
    model.chair.userData.dynamic = true; chairs.set(item.index, model.chair);
    // Pale surfaces and blue-green fabric partitions echo a shared cubicle office.
    box(workstation, 2.51, .025, 1.12, '#ebece3', 0, 1.142);
    box(workstation, 2.62, .61, .075, '#aebfbd', 0, 1.34, -.625);
    box(workstation, 2.66, .045, .095, '#e6eae2', 0, 1.665, -.625);
    for (const side of [-1, 1]) {
      box(workstation, .06, .48, 1.2, '#b4c4c2', side * 1.30, 1.30);
      box(workstation, .08, .035, 1.24, '#e6eae2', side * 1.30, 1.56);
    }
    const number = plaque(model.group, `${String(item.index + 1).padStart(2, '0')}번 자리`, .6, .16, .78, 1.28, .55, '#607f76');
    number.userData.target = `seat:${item.index}`; number.userData.uniqueGeometry = true;
  }
  // Shared amenities fill the rear row; the front of the privacy screen stays open.
  createPantryDivider(group, partition);
  const coffee = new THREE.Group(); coffee.name = 'shared-coffee'; coffee.userData.target = 'coffee'; coffee.position.set(layout.furniture.coffee.x, 0, layout.furniture.coffee.z); group.add(coffee);
  box(coffee, furniture.coffee.w, 1, furniture.coffee.d, '#e4e7dc', 0, .5);
  box(coffee, furniture.coffee.w + .07, .09, furniture.coffee.d + .06, '#b69a78', 0, 1.045);
  const machine = new THREE.Group(); coffee.add(machine);
  box(machine, .58, .56, .44, '#3f5550', -.2, 1.37, -.13, .04);
  box(machine, .38, .19, .04, '#a7c6bd', -.2, 1.45, .1);
  mug(machine, -.2, 1.1, .18); mug(machine, .45, 1.1, .23, '#87aaa1');
  const snacks = new THREE.Group(); snacks.name = 'shared-snacks'; snacks.userData.target = 'snacks';
  snacks.position.set(layout.furniture.snacks.x, 0, layout.furniture.snacks.z); group.add(snacks);
  box(snacks, 1.2, .18, 1.5, '#b29974', 0, .14);
  box(snacks, .07, 1.5, 1.5, '#baa17d', -.565, .87); box(snacks, .07, 1.5, 1.5, '#baa17d', .565, .87);
  box(snacks, 1.14, 1.46, .07, '#e0dac1', 0, .85, -.715);
  for (const y of [.38, .90, 1.48]) box(snacks, 1.2, .075, 1.5, '#cab08a', 0, y);
  for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
    const packet = box(snacks, .19, .28, .22, ['#b36f5a', '#d7b65e', '#7c9a7f', '#879fa6'][i], -.39 + i * .26, .56 + row * .52, .19, .018);
    packet.rotation.z = i % 2 ? .08 : -.08; box(snacks, .12, .075, .008, '#f6ebd0', -.39 + i * .26, .59 + row * .52, .305, .004);
  }
  for (let i = 0; i < 3; i++) { cylinder(snacks, .12, .12, .24, ['#d8ba85', '#ac8563', '#c9bd94'][i], -.34 + i * .34, 1.65, -.08); cylinder(snacks, .13, .13, .04, '#657c6a', -.34 + i * .34, 1.79, -.08); }
  const lounge = new THREE.Group(); lounge.name = 'shared-lounge'; lounge.userData.target = 'lounge'; group.add(lounge);
  const table = layout.furniture.lounge;
  cylinder(lounge, .07, .09, .94, '#748a7c', table.x, .47, table.z);
  box(lounge, table.w, .1, table.d, '#c6ab84', table.x, 1, table.z, .15);
  mug(lounge, table.x + .25, 1.06, table.z - .05, '#799d8d');
  for (const seat of layout.loungeSeats) {
    const model = chair(lounge, seat.seat.x, seat.seat.z, '#6a8f81', seat.angle + Math.PI); model.name = seat.id;
  }
  const copier = new THREE.Group(); copier.name = 'shared-copier'; copier.userData.target = 'copier'; copier.position.set(layout.furniture.copier.x, 0, layout.furniture.copier.z); group.add(copier);
  box(copier, 1.35, 1.1, 1.15, '#dedfd3', 0, .58, 0, .05); box(copier, 1.30, .13, 1.1, '#525e58', 0, 1.18, 0, .025);
  box(copier, 1.12, .05, .85, '#98b4aa', -.04, 1.265, -.05); box(copier, 1.17, .07, .89, '#eff0e5', -.04, 1.31, -.05);
  box(copier, .52, .10, .27, '#64746c', .30, 1.24, .52); box(copier, .29, .012, .15, '#a4d2c1', .25, 1.305, .54);
  for (let i = 0; i < 3; i++) { box(copier, 1.13, .025, .018, '#b4c0b3', 0, .30 + i * .25, .585); box(copier, .23, .045, .023, '#8d9c90', 0, .39 + i * .25, .60); }
  const { group: chief } = createBossDesk(group, furniture.bossDesk); chief.name = 'shared-boss-desk';
  plant(group, b.maxX - .6, b.maxZ - .6, .8);
  plant(group, b.minX + .65, b.minZ + .65, .8);
  const entry = box(group, 1.8, .02, .55, '#6a9387', layout.spawn.x, .055, layout.spawn.z + .42, .08); entry.userData.target = 'exit';
  const initialGeometry = new Set<THREE.BufferGeometry>(); group.traverse(object => { if (object instanceof THREE.Mesh) initialGeometry.add(object.geometry); });
  const cutaways = prepareCameraCutaways(group);
  batchArchitecture(group);
  const release = () => {
    monitors.forEach(monitor => monitor.dispose());
    const disposed = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    group.traverse(object => {
      if (object instanceof THREE.Mesh && (!initialGeometry.has(object.geometry) || object.userData.uniqueGeometry)) object.geometry.dispose();
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          const texture = (material as THREE.MeshStandardMaterial).map;
          if (texture) { textures.add(texture); disposed.add(material); }
          if (object.userData.cutawaySide) disposed.add(material);
        }
      }
    });
    textures.forEach(texture => texture.dispose()); disposed.forEach(material => material.dispose()); group.removeFromParent();
  };
  return { group, cutaways, release, chairs, monitors };
}

export function createMultiScene(host: HTMLElement, callbacks: MultiSceneCallbacks): OfficeScene {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
  catch { callbacks.onError('3D 회사를 열 수 없어요. 브라우저의 그래픽 가속을 확인해 주세요.'); return { dispose() {}, zoom() {}, rotate() {}, tilt() {}, resetView() {}, screenToWorld: point => point }; }
  renderer.setClearColor('#e7e9df'); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;';
  renderer.domElement.setAttribute('aria-label', '동료와 함께하는 3D 회사. 바닥을 눌러 이동하고 화면을 끌어 돌릴 수 있습니다.'); host.appendChild(renderer.domElement);
  const bubbleLayer = document.createElement('div'); bubbleLayer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2;'; host.appendChild(bubbleLayer);
  const world = new THREE.Scene(), camera = new THREE.OrthographicCamera(-14, 14, 10, -10, .1, 150);
  const officeColor = new THREE.Color('#e7e9df'), roofColor = new THREE.Color('#e6d6bf');
  const ambient = new THREE.HemisphereLight('#fff8e7', '#a1b5a7', 2.4);
  world.background = officeColor.clone(); world.add(ambient);
  const sun = new THREE.DirectionalLight('#fff4d9', 3.2); sun.position.set(-4, 20, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -25; sun.shadow.camera.right = 25; sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25; sun.shadow.normalBias = .035; sun.shadow.bias = -.0002; world.add(sun); world.add(sun.target);
  const actorGroup = new THREE.Group(); world.add(actorGroup);
  const rigs = new Map<string, { rig: ReturnType<typeof createActor>; shown: Actor; floor: GameState['floor'] }>();
  const retired: THREE.Object3D[] = [], bubbles = new Map<string, HTMLDivElement>();
  const initial = callbacks.getState(); let architecture = createMultiArchitecture(initial.layout); world.add(architecture.group);
  const wallBoard = createWallBoard(architecture.group, initial.layout.bounds);
  const roof = createRooftop(world), roofCutaways = prepareCameraCutaways(roof); batchArchitecture(roof); roof.visible = false;
  let capacity = initial.layout.capacity, width = 1, height = 1, zoomLevel = 1, orbit = 0, userOrbit = 0, desiredOrbit = 0, pitch = CAMERA_BASE_PITCH, desiredPitch = CAMERA_BASE_PITCH, elapsed = 0, lastTime = 0, frame = 0, dead = false, lastQuality = '', lastFloor = initial.game.floor;
  const b = initial.layout.bounds, focus = new THREE.Vector3((b.minX + b.maxX) / 2, .65, (b.minZ + b.maxZ) / 2), desiredFocus = focus.clone();
  const rotatedOffset = new THREE.Vector3(), projection = new THREE.Vector3();
  const playerRing = new THREE.Mesh(new THREE.RingGeometry(.34, .40, 32), new THREE.MeshBasicMaterial({ color: '#477e6e', transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false })); playerRing.rotation.x = -Math.PI / 2; world.add(playerRing);
  const seatRing = new THREE.Mesh(new THREE.RingGeometry(.46, .51, 32), new THREE.MeshBasicMaterial({ color: '#d69b49', transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false })); seatRing.rotation.x = -Math.PI / 2; world.add(seatRing);
  const selection = new THREE.Mesh(new THREE.RingGeometry(.50, .56, 40), new THREE.MeshBasicMaterial({ color: '#dca45e', transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false })); selection.rotation.x = -Math.PI / 2; world.add(selection);
  const destination = new THREE.Mesh(new THREE.RingGeometry(.13, .19, 24), new THREE.MeshBasicMaterial({ color: '#4d9184', transparent: true, opacity: .72, side: THREE.DoubleSide, depthWrite: false })); destination.rotation.x = -Math.PI / 2; world.add(destination);
  const updateCamera = () => {
    const state = callbacks.getState(), b = state.game.floor === 'rooftop' ? ROOF_BOUNDS : state.layout.bounds, aspect = width / height, roomW = b.maxX - b.minX, roomD = b.maxZ - b.minZ, angle = Math.atan2(16, 24) + orbit;
    const projectedW = Math.abs(Math.cos(angle)) * roomW + Math.abs(Math.sin(angle)) * roomD;
    const projectedH = (Math.abs(Math.sin(angle)) * roomW + Math.abs(Math.cos(angle)) * roomD) * Math.sin(pitch);
    const span = (aspect < .85 ? 13.8 : Math.max(12, projectedH + 4.5, (projectedW + 3) / aspect)) * zoomLevel;
    camera.left = -span * aspect / 2; camera.right = span * aspect / 2; camera.top = span / 2; camera.bottom = -span / 2; camera.updateProjectionMatrix();
    setCameraOffset(rotatedOffset, orbit, pitch, 50); camera.position.copy(focus).add(rotatedOffset); camera.lookAt(focus);
    architecture.cutaways(rotatedOffset); roofCutaways(rotatedOffset);
  };
  const resize = () => { if (dead) return; width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight); renderer.setSize(width, height, false); updateCamera(); };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  const zoom = (delta: number) => { if (callbacks.getState().game.transition) return; zoomLevel = THREE.MathUtils.clamp(zoomLevel * Math.pow(.9, delta), .55, 1.5); updateCamera(); };
  const rotate = (delta: number) => { if (!callbacks.getState().game.transition) desiredOrbit = normalizeCameraAngle(desiredOrbit + delta * CAMERA_TURN_STEP); };
  const tilt = (delta: number) => { if (!callbacks.getState().game.transition && Number.isFinite(delta)) desiredPitch = clampCameraPitch(desiredPitch + delta * CAMERA_TILT_STEP); };
  const resetView = () => { if (callbacks.getState().game.transition) return; desiredOrbit = 0; desiredPitch = CAMERA_BASE_PITCH; zoomLevel = 1; updateCamera(); };
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let down: { x: number; y: number; id: number; time: number; angle: number; pitch: number; dragging: boolean; board: boolean } | null = null;
  const boardAtPointer = (event: PointerEvent) => {
    if (callbacks.getState().game.floor !== 'office') return false;
    const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([actorGroup, architecture.group], true).find(hit => isPointerEligible(hit.object));
    return !!hit && isBoardHit(hit.object, 'office');
  };
  const pointerDown = (event: PointerEvent) => { if (event.button !== 0 || down || callbacks.getState().game.transition) return; down = { x: event.clientX, y: event.clientY, id: event.pointerId, time: performance.now(), angle: desiredOrbit, pitch: desiredPitch, dragging: false, board: boardAtPointer(event) }; renderer.domElement.setPointerCapture?.(event.pointerId); };
  const pointerMove = (event: PointerEvent) => {
    if (!down || down.board || down.id !== event.pointerId || callbacks.getState().game.transition) return;
    const delta = cameraDragRotation(event.clientX - down.x, event.clientY - down.y);
    if (delta !== null) down.dragging = true;
    if (down.dragging) { desiredOrbit = normalizeCameraAngle(down.angle - (event.clientX - down.x) * .009); desiredPitch = clampCameraPitch(down.pitch + (event.clientY - down.y) * .006); renderer.domElement.style.cursor = 'grabbing'; }
  };
  const pointerUp = (event: PointerEvent) => {
    const start = down; if (start?.id !== event.pointerId) return; down = null; renderer.domElement.style.cursor = '';
    if (!start || start.id !== event.pointerId || start.dragging || callbacks.getState().game.transition || cameraDragRotation(event.clientX - start.x, event.clientY - start.y) !== null || performance.now() - start.time > 650) return;
    if (start.board) { if (boardAtPointer(event)) callbacks.onBoard?.(); return; }
    const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
    const game = callbacks.getState().game, ownId = game.player.id;
    for (const hit of raycaster.intersectObject(actorGroup, true)) {
      if (!isPointerEligible(hit.object)) continue;
      let object: THREE.Object3D | null = hit.object;
      while (object) {
        if (object.userData.target === 'boss') { callbacks.onTarget('boss'); return; }
        const id = object.userData.actorId;
        if (typeof id === 'string' && id !== ownId && callbacks.onActor) { callbacks.onActor(id); return; }
        object = object.parent;
      }
    }
    // Intersect just the active floor; Three also raycasts children of invisible parents.
    for (const hit of raycaster.intersectObject(game.floor === 'rooftop' ? roof : architecture.group, true)) {
      if (!isPointerEligible(hit.object)) continue;
      if (isBoardHit(hit.object, game.floor)) { callbacks.onBoard?.(); return; }
      let object: THREE.Object3D | null = hit.object, seat: number | null = null;
      while (object) { if (typeof object.userData.target === 'string' && object.userData.target.startsWith('seat:')) seat = Number(object.userData.target.slice(5)); object = object.parent; }
      if (seat !== null) { callbacks.onSeat(seat); return; }
      const selected = targetSelectionForHit(hit, game.floor);
      if (selected) { callbacks.onTarget(selected.target, selected.point); return; }
      if (hit.object.userData.ground) { callbacks.onGround({ x: hit.point.x, z: hit.point.z }); return; }
    }
  };
  const pointerCancel = () => { down = null; renderer.domElement.style.cursor = ''; };
  const wheel = (event: WheelEvent) => { event.preventDefault(); zoom(-THREE.MathUtils.clamp(event.deltaY, -300, 300) / 150); };
  const contextLoss = (event: Event) => { event.preventDefault(); callbacks.onError('그래픽 연결이 잠시 끊겼어요. 방을 다시 열어 주세요.'); };
  renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointermove', pointerMove); renderer.domElement.addEventListener('pointerup', pointerUp); renderer.domElement.addEventListener('pointercancel', pointerCancel); renderer.domElement.addEventListener('lostpointercapture', pointerCancel); renderer.domElement.addEventListener('wheel', wheel, { passive: false }); renderer.domElement.addEventListener('webglcontextlost', contextLoss); document.addEventListener('visibilitychange', pointerCancel);
  const render = (now: number) => {
    if (dead) return; frame = requestAnimationFrame(render);
    const dt = lastTime ? Math.min(.06, Math.max(0, (now - lastTime) / 1000)) : 0; lastTime = now;
    if (document.hidden) return;
    callbacks.onFrame(dt); const state = callbacks.getState(), game = state.game, settings = game.settings, onRoof = game.floor === 'rooftop'; elapsed += dt;
    if (capacity !== state.layout.capacity) { wallBoard.root.removeFromParent(); architecture.release(); architecture = createMultiArchitecture(state.layout); architecture.group.add(wallBoard.root); wallBoard.setBounds(state.layout.bounds); world.add(architecture.group); capacity = state.layout.capacity; }
    wallBoard.update(callbacks.getBoardEntries?.());
    architecture.group.visible = !onRoof; roof.visible = onRoof;
    (world.background as THREE.Color).copy(onRoof ? roofColor : officeColor); ambient.color.set(onRoof ? '#fff0d5' : '#fff8e7');
    const quality = `${settings.quality}/${devicePixelRatio}`;
    if (quality !== lastQuality) { renderer.setPixelRatio(Math.min(devicePixelRatio || 1, settings.quality === 'low' ? 1 : settings.quality === 'high' ? 2 : 1.5)); renderer.shadowMap.enabled = settings.quality !== 'low'; resize(); lastQuality = quality; }
    userOrbit = smoothCameraAngle(userOrbit, desiredOrbit, dt, settings.reducedMotion);
    orbit = userOrbit + transitionOrbit(game.transition, settings.reducedMotion); pitch = smoothCameraPitch(pitch, desiredPitch, dt, settings.reducedMotion);
    const b = onRoof ? ROOF_BOUNDS : state.layout.bounds;
    desiredFocus.set(width / height < .85 ? game.player.x : (b.minX + b.maxX) / 2, .65, width / height < .85 ? game.player.z : (b.minZ + b.maxZ) / 2);
    if (lastFloor !== game.floor) { focus.copy(desiredFocus); lastFloor = game.floor; down = null; }
    else focus.lerp(desiredFocus, settings.reducedMotion ? 1 : 1 - Math.exp(-dt * 4)); updateCamera();
    const members = [
      { actor: game.player, context: game, floor: game.floor, boss: false },
      { actor: game.boss, context: game, floor: 'office' as const, boss: true },
      ...state.players.filter(player => player.id !== game.player.id).map(player => {
        const context = remoteAnimationState(game, player, state.serverNow ?? Date.now());
        return { actor: context.player, context, floor: player.floor, boss: false };
      }),
    ];
    const ids = new Set(members.map(({ actor }) => actor.id));
    for (const [id, entry] of rigs) if (!ids.has(id)) { entry.rig.root.removeFromParent(); retired.push(entry.rig.root); rigs.delete(id); bubbles.get(id)?.remove(); bubbles.delete(id); }
    members.forEach(({ actor, context, floor, boss }) => {
      let entry = rigs.get(actor.id);
      if (!entry) {
        const role = boss ? 1 : actor.id === game.player.id ? 0 : [0, 2, 3, 4][Array.from(actor.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4];
        entry = { rig: createActor(actorGroup, role, actor.name, actor.avatar), shown: { ...actor }, floor };
        if (boss) entry.rig.root.userData.target = 'boss'; else entry.rig.root.userData.actorId = actor.id;
        rigs.set(actor.id, entry);
      }
      if (floor !== game.floor) { entry.rig.root.removeFromParent(); entry.floor = floor; return; }
      const justArrived = entry.rig.root.parent !== actorGroup || entry.floor !== floor;
      if (entry.rig.root.parent !== actorGroup) actorGroup.add(entry.rig.root);
      entry.floor = floor;
      const shown = entry.shown, local = actor.id === game.player.id, amount = local || justArrived || settings.reducedMotion ? 1 : 1 - Math.exp(-dt * 10);
      shown.x += (actor.x - shown.x) * amount; shown.z += (actor.z - shown.z) * amount;
      shown.angle += normalizeCameraAngle(actor.angle - shown.angle) * amount;
      shown.name = actor.name; shown.rank = actor.rank; shown.avatar = actor.avatar; shown.pose = actor.pose; shown.moving = actor.moving || Math.hypot(actor.x - shown.x, actor.z - shown.z) > .08;
      animateActor(entry.rig, shown, context, context.elapsed);
    });
    const currentSpeech = new Map((state.speeches ?? []).filter(speech => speech.until > Date.now()).map(speech => [speech.id, speech]));
    for (const [id, bubble] of bubbles) if (!currentSpeech.has(id) || rigs.get(id)?.rig.root.parent !== actorGroup) { bubble.remove(); bubbles.delete(id); }
    for (const [id, speech] of currentSpeech) {
      const entry = rigs.get(id); if (!entry || entry.rig.root.parent !== actorGroup) continue; const actor = entry.shown;
      let bubble = bubbles.get(id);
      if (!bubble) { bubble = document.createElement('div'); bubble.setAttribute('role', 'note'); bubble.style.cssText = 'position:absolute;max-width:min(220px,55vw);width:max-content;padding:9px 12px;border:1px solid #cfdace;border-radius:14px 14px 14px 4px;background:#fffef8;color:#29483d;font:600 13px/1.55 "Malgun Gothic",sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;box-shadow:0 5px 16px #263d3620;transform:translate(-50%,-100%);'; bubbleLayer.appendChild(bubble); bubbles.set(id, bubble); }
      const text = Array.from(speech.text).slice(0, 200).join(''); if (bubble.textContent !== text) bubble.textContent = text;
      projection.set(actor.x, 2.65, actor.z).project(camera);
      bubble.style.display = projection.z < -1 || projection.z > 1 || Math.abs(projection.x) > 1.2 || Math.abs(projection.y) > 1.2 ? 'none' : 'block';
      bubble.style.left = `${(projection.x + 1) * width / 2}px`; bubble.style.top = `${(1 - projection.y) * height / 2}px`;
    }
    playerRing.position.set(game.player.x, .06, game.player.z);
    const ownDesk = state.seatIndex === undefined ? null : state.layout.desks[state.seatIndex]; seatRing.visible = !!ownDesk && !onRoof; if (ownDesk) seatRing.position.set(ownDesk.seat.x, .055, ownDesk.seat.z);
    const wallpapers = callbacks.getWallpapers?.();
    architecture.monitors.forEach((monitor, index) => monitor.set(wallpapers?.get(index) ?? null));
    for (const [index, chair] of architecture.chairs) {
      const occupant = index === state.seatIndex ? game.player : state.players.find(player => player.seatIndex === index && player.floor === 'office');
      const visual = occupant ? members.find(member => member.actor.id === occupant.id)?.context : null;
      chair.rotation.y = visual ? chairSpinAngle(visual) : 0;
    }
    selection.visible = !game.transition && game.target !== null && isRoofTarget(game.target) === onRoof;
    if (game.target && selection.visible) {
      const point = game.target === 'boss' ? game.boss : roofWallForTarget(game.target) && game.roofLeanPoint ? game.roofLeanPoint : game.target === 'desk' && ownDesk ? ownDesk.seat : (game.target === 'lounge' || game.target === 'roofBench') ? restSeatById(game.restSeatId, state.layout.loungeSeats)?.approach ?? game.destination ?? (game.ready ? game.player : state.layout.targets[game.target].point) : state.layout.targets[game.target].point;
      selection.position.set(point.x, .065, point.z);
    }
    destination.visible = !!game.destination; if (game.destination) destination.position.set(game.destination.x, .07, game.destination.z);
    if (onRoof) animateRooftop(roof, game.elapsed, settings.reducedMotion);
    renderer.render(world, camera);
  };
  try { render(performance.now()); callbacks.onReady(); } catch (error) { callbacks.onError(error instanceof Error ? error.message : '회사를 불러오지 못했어요.'); }
  return { zoom, rotate, tilt, resetView, screenToWorld: point => screenAxisToWorld(point, orbit), dispose() {
    dead = true; cancelAnimationFrame(frame); observer.disconnect();
    wallBoard.dispose();
    renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointermove', pointerMove); renderer.domElement.removeEventListener('pointerup', pointerUp); renderer.domElement.removeEventListener('pointercancel', pointerCancel); renderer.domElement.removeEventListener('lostpointercapture', pointerCancel); renderer.domElement.removeEventListener('wheel', wheel); renderer.domElement.removeEventListener('webglcontextlost', contextLoss); document.removeEventListener('visibilitychange', pointerCancel);
    architecture.release(); retired.forEach(object => world.add(object)); rigs.forEach(({ rig }) => { if (!rig.root.parent) world.add(rig.root); });
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    world.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) { if (object instanceof THREE.Mesh) geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) { materials.add(material); const texture = (material as THREE.MeshStandardMaterial).map; if (texture) textures.add(texture); } } });
    geometries.forEach(geometry => geometry.dispose()); textures.forEach(texture => texture.dispose()); materials.forEach(material => material.dispose()); sun.shadow.dispose(); renderer.dispose(); renderer.domElement.remove(); bubbleLayer.remove(); disposeModelCaches();
  } };
}
