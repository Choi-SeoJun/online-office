import * as THREE from 'three';
import { animateActor, box, chair, createActor, cylinder, desk, disposeModelCaches, mug, plant, plaque, spriteLabel } from './models.ts';
import { batchArchitecture } from './scene.ts';
import { CAMERA_BASE_PITCH, CAMERA_TILT_STEP, CAMERA_TURN_STEP, cameraDragRotation, clampCameraPitch, setCameraOffset, smoothCameraPitch, normalizeCameraAngle, screenAxisToWorld, smoothCameraAngle } from './camera.ts';
import { prepareCameraCutaways } from './camera-cutaway.ts';
import type { Actor, GameState, OfficeScene, Point, RoofWallSide, Settings } from './types.ts';
import type { MultiLayout } from './multi-layout.ts';

export type MultiSceneState = {
  layout: MultiLayout;
  player: Actor;
  players: Actor[];
  settings: Settings;
  seatIndex?: number;
  speeches?: { id: string; text: string; until: number }[];
};
export type MultiSceneCallbacks = {
  getState(): MultiSceneState;
  onFrame(dt: number): void;
  onGround(point: Point): void;
  onSeat(index: number): void;
  onActor?(id: string): void;
  onReady(): void;
  onError(message: string): void;
};

function createArchitecture(layout: MultiLayout) {
  const group = new THREE.Group(); group.name = 'shared-office';
  const b = layout.bounds, w = b.maxX - b.minX, d = b.maxZ - b.minZ, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  box(group, w + .4, .36, d + .4, '#aab6ad', cx, -.25, cz, .12);
  const floor = box(group, w, .12, d, '#c7cec4', cx, -.04, cz); floor.userData.ground = true;
  const nx = Math.ceil(w), nz = Math.ceil(d), tw = w / nx, td = d / nz;
  for (let x = 0; x < nx; x++) for (let z = 0; z < nz; z++) {
    const tile = box(group, tw - .01, .012, td - .01, ['#d3d9ce', '#cdd5ca', '#d8dcd1'][(x + z * 2) % 3], b.minX + tw * (x + .5), .028, b.minZ + td * (z + .5), 0); tile.userData.ground = true;
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
  for (const item of layout.desks) {
    const workstation = new THREE.Group(); workstation.position.set(item.point.x, 0, item.point.z); workstation.rotation.y = item.angle + Math.PI;
    workstation.userData.target = `seat:${item.index}`; group.add(workstation);
    const model = desk(workstation, 0, 0, item.index);
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
  // The left-hand break strip stays fixed as more desk rows are added.
  const coffee = new THREE.Group(); coffee.position.set(-4.7, 0, -1.8); group.add(coffee);
  box(coffee, 1.5, 1, 1.2, '#e4e7dc', 0, .5);
  box(coffee, 1.57, .09, 1.26, '#b69a78', 0, 1.045);
  box(coffee, .58, .56, .44, '#3f5550', -.2, 1.37, -.13, .04);
  box(coffee, .38, .19, .04, '#a7c6bd', -.2, 1.45, .1);
  mug(coffee, -.2, 1.1, .18); mug(coffee, .45, 1.1, .23, '#87aaa1');
  const coffeeLabel = spriteLabel(coffee, '커피 한 잔', '#395b50', 1.08); coffeeLabel.position.set(0, 2.05, 0);
  cylinder(group, .07, .09, .94, '#748a7c', -4.7, .47, 1.55);
  box(group, 1.2, .1, 1.2, '#c6ab84', -4.7, 1, 1.55, .15);
  mug(group, -4.45, 1.06, 1.50, '#799d8d'); chair(group, -4.7, 2.7, '#6a8f81');
  plant(group, b.maxX - .6, b.maxZ - .6, .8);
  plant(group, b.minX + .65, b.minZ + .65, .8);
  const entry = box(group, 1.8, .02, .55, '#6a9387', layout.spawn.x, .055, 3.12, .08); entry.userData.ground = true;
  const initialGeometry = new Set<THREE.BufferGeometry>(); group.traverse(object => { if (object instanceof THREE.Mesh) initialGeometry.add(object.geometry); });
  const cutaways = prepareCameraCutaways(group);
  batchArchitecture(group);
  const release = () => {
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
  return { group, cutaways, release };
}

function animationState(settings: Settings, player: Actor): GameState {
  return { entered: true, paused: false, elapsed: 0, name: player.name, floor: 'office', transition: null,
    player, boss: player, coworkers: [], target: null, ready: false, destination: null, seat: null, deskMode: null,
    roofRest: null, roofWallSide: null, roofLeanPoint: null, candyInMouth: false, activity: null,
    inventory: { coffee: 0, cookie: 0, choco: 0, cracker: 0 }, weapon: 'punch', settings,
    warning: 0, scold: 0, bossPhase: 'routine', lastHit: null, event: null, message: '', messageUntil: 0 };
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
  world.background = new THREE.Color('#e7e9df'); world.add(new THREE.HemisphereLight('#fff8e7', '#a1b5a7', 2.4));
  const sun = new THREE.DirectionalLight('#fff4d9', 3.2); sun.position.set(-4, 20, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -25; sun.shadow.camera.right = 25; sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -25; sun.shadow.normalBias = .035; sun.shadow.bias = -.0002; world.add(sun); world.add(sun.target);
  const actorGroup = new THREE.Group(); world.add(actorGroup);
  const rigs = new Map<string, { rig: ReturnType<typeof createActor>; shown: Actor }>();
  const retired: THREE.Object3D[] = [], bubbles = new Map<string, HTMLDivElement>();
  let initial = callbacks.getState(), architecture = createArchitecture(initial.layout); world.add(architecture.group);
  let capacity = initial.layout.capacity, width = 1, height = 1, zoomLevel = 1, orbit = 0, desiredOrbit = 0, pitch = CAMERA_BASE_PITCH, desiredPitch = CAMERA_BASE_PITCH, elapsed = 0, lastTime = 0, frame = 0, dead = false, lastQuality = '';
  const b = initial.layout.bounds, focus = new THREE.Vector3((b.minX + b.maxX) / 2, .65, (b.minZ + b.maxZ) / 2), desiredFocus = focus.clone();
  const rotatedOffset = new THREE.Vector3(), projection = new THREE.Vector3();
  const playerRing = new THREE.Mesh(new THREE.RingGeometry(.34, .40, 32), new THREE.MeshBasicMaterial({ color: '#477e6e', transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false })); playerRing.rotation.x = -Math.PI / 2; world.add(playerRing);
  const seatRing = new THREE.Mesh(new THREE.RingGeometry(.46, .51, 32), new THREE.MeshBasicMaterial({ color: '#d69b49', transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false })); seatRing.rotation.x = -Math.PI / 2; world.add(seatRing);
  const updateCamera = () => {
    const state = callbacks.getState(), b = state.layout.bounds, aspect = width / height, roomW = b.maxX - b.minX, roomD = b.maxZ - b.minZ, angle = Math.atan2(16, 24) + orbit;
    const projectedW = Math.abs(Math.cos(angle)) * roomW + Math.abs(Math.sin(angle)) * roomD;
    const projectedH = (Math.abs(Math.sin(angle)) * roomW + Math.abs(Math.cos(angle)) * roomD) * Math.sin(pitch);
    const span = (aspect < .85 ? 13.8 : Math.max(12, projectedH + 4.5, (projectedW + 3) / aspect)) * zoomLevel;
    camera.left = -span * aspect / 2; camera.right = span * aspect / 2; camera.top = span / 2; camera.bottom = -span / 2; camera.updateProjectionMatrix();
    setCameraOffset(rotatedOffset, orbit, pitch, 50); camera.position.copy(focus).add(rotatedOffset); camera.lookAt(focus);
    architecture.cutaways(rotatedOffset);
  };
  const resize = () => { if (dead) return; width = Math.max(1, host.clientWidth); height = Math.max(1, host.clientHeight); renderer.setSize(width, height, false); updateCamera(); };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  const zoom = (delta: number) => { zoomLevel = THREE.MathUtils.clamp(zoomLevel * Math.pow(.9, delta), .55, 1.5); updateCamera(); };
  const rotate = (delta: number) => { desiredOrbit = normalizeCameraAngle(desiredOrbit + delta * CAMERA_TURN_STEP); };
  const tilt = (delta: number) => { if (Number.isFinite(delta)) desiredPitch = clampCameraPitch(desiredPitch + delta * CAMERA_TILT_STEP); };
  const resetView = () => { desiredOrbit = 0; desiredPitch = CAMERA_BASE_PITCH; zoomLevel = 1; updateCamera(); };
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let down: { x: number; y: number; id: number; time: number; angle: number; pitch: number; dragging: boolean } | null = null;
  const pointerDown = (event: PointerEvent) => { if (event.button !== 0 || down) return; down = { x: event.clientX, y: event.clientY, id: event.pointerId, time: performance.now(), angle: desiredOrbit, pitch: desiredPitch, dragging: false }; renderer.domElement.setPointerCapture?.(event.pointerId); };
  const pointerMove = (event: PointerEvent) => {
    if (!down || down.id !== event.pointerId) return;
    const delta = cameraDragRotation(event.clientX - down.x, event.clientY - down.y);
    if (delta !== null) down.dragging = true;
    if (down.dragging) { desiredOrbit = normalizeCameraAngle(down.angle - (event.clientX - down.x) * .009); desiredPitch = clampCameraPitch(down.pitch - (event.clientY - down.y) * .006); renderer.domElement.style.cursor = 'grabbing'; }
  };
  const pointerUp = (event: PointerEvent) => {
    const start = down; if (start?.id !== event.pointerId) return; down = null; renderer.domElement.style.cursor = '';
    if (!start || start.id !== event.pointerId || start.dragging || cameraDragRotation(event.clientX - start.x, event.clientY - start.y) !== null || performance.now() - start.time > 650) return;
    const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera(pointer, camera);
    if (callbacks.onActor) {
      const ownId = callbacks.getState().player.id;
      for (const hit of raycaster.intersectObject(actorGroup, true)) {
        let object: THREE.Object3D | null = hit.object;
        while (object) {
          const id = object.userData.actorId;
          if (typeof id === 'string' && id !== ownId) { callbacks.onActor(id); return; }
          object = object.parent;
        }
      }
    }
    for (const hit of raycaster.intersectObject(architecture.group, true)) {
      let object: THREE.Object3D | null = hit.object, passthrough = false, seat: number | null = null;
      while (object) { if (object.userData.pointerPassthrough) passthrough = true; if (typeof object.userData.target === 'string' && object.userData.target.startsWith('seat:')) seat = Number(object.userData.target.slice(5)); object = object.parent; }
      if (passthrough) continue;
      if (seat !== null) { callbacks.onSeat(seat); return; }
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
    callbacks.onFrame(dt); const state = callbacks.getState(); elapsed += dt;
    if (capacity !== state.layout.capacity) { architecture.release(); architecture = createArchitecture(state.layout); world.add(architecture.group); capacity = state.layout.capacity; }
    const quality = `${state.settings.quality}/${devicePixelRatio}`;
    if (quality !== lastQuality) { renderer.setPixelRatio(Math.min(devicePixelRatio || 1, state.settings.quality === 'low' ? 1 : state.settings.quality === 'high' ? 2 : 1.5)); renderer.shadowMap.enabled = state.settings.quality !== 'low'; resize(); lastQuality = quality; }
    orbit = smoothCameraAngle(orbit, desiredOrbit, dt, state.settings.reducedMotion); pitch = smoothCameraPitch(pitch, desiredPitch, dt, state.settings.reducedMotion);
    const b = state.layout.bounds;
    desiredFocus.set(width / height < .85 ? state.player.x : (b.minX + b.maxX) / 2, .65, width / height < .85 ? state.player.z : (b.minZ + b.maxZ) / 2);
    focus.lerp(desiredFocus, state.settings.reducedMotion ? 1 : 1 - Math.exp(-dt * 4)); updateCamera();
    const members = [state.player, ...state.players], ids = new Set(members.map(actor => actor.id)), context = animationState(state.settings, state.player); context.elapsed = elapsed;
    for (const [id, entry] of rigs) if (!ids.has(id)) { entry.rig.root.removeFromParent(); retired.push(entry.rig.root); rigs.delete(id); bubbles.get(id)?.remove(); bubbles.delete(id); }
    members.forEach(actor => {
      let entry = rigs.get(actor.id);
      if (!entry) { const role = [0, 2, 3, 4][Array.from(actor.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4]; entry = { rig: createActor(actorGroup, role, actor.name, actor.avatar), shown: { ...actor } }; entry.rig.root.userData.actorId = actor.id; rigs.set(actor.id, entry); }
      const shown = entry.shown, local = actor.id === state.player.id, amount = local || state.settings.reducedMotion ? 1 : 1 - Math.exp(-dt * 10);
      shown.x += (actor.x - shown.x) * amount; shown.z += (actor.z - shown.z) * amount;
      shown.angle += normalizeCameraAngle(actor.angle - shown.angle) * amount;
      shown.name = actor.name; shown.avatar = actor.avatar; shown.pose = actor.pose; shown.moving = actor.moving || Math.hypot(actor.x - shown.x, actor.z - shown.z) > .08;
      animateActor(entry.rig, shown, context, elapsed);
    });
    const currentSpeech = new Map((state.speeches ?? []).filter(speech => speech.until > Date.now()).map(speech => [speech.id, speech]));
    for (const [id, bubble] of bubbles) if (!currentSpeech.has(id) || !rigs.has(id)) { bubble.remove(); bubbles.delete(id); }
    for (const [id, speech] of currentSpeech) {
      const actor = rigs.get(id)?.shown; if (!actor) continue;
      let bubble = bubbles.get(id);
      if (!bubble) { bubble = document.createElement('div'); bubble.setAttribute('role', 'note'); bubble.style.cssText = 'position:absolute;max-width:min(220px,55vw);width:max-content;padding:9px 12px;border:1px solid #cfdace;border-radius:14px 14px 14px 4px;background:#fffef8;color:#29483d;font:600 13px/1.55 "Malgun Gothic",sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;box-shadow:0 5px 16px #263d3620;transform:translate(-50%,-100%);'; bubbleLayer.appendChild(bubble); bubbles.set(id, bubble); }
      const text = Array.from(speech.text).slice(0, 200).join(''); if (bubble.textContent !== text) bubble.textContent = text;
      projection.set(actor.x, 2.65, actor.z).project(camera);
      bubble.style.display = projection.z < -1 || projection.z > 1 || Math.abs(projection.x) > 1.2 || Math.abs(projection.y) > 1.2 ? 'none' : 'block';
      bubble.style.left = `${(projection.x + 1) * width / 2}px`; bubble.style.top = `${(1 - projection.y) * height / 2}px`;
    }
    playerRing.position.set(state.player.x, .06, state.player.z);
    const ownDesk = state.seatIndex === undefined ? null : state.layout.desks[state.seatIndex]; seatRing.visible = !!ownDesk; if (ownDesk) seatRing.position.set(ownDesk.seat.x, .055, ownDesk.seat.z);
    renderer.render(world, camera);
  };
  try { render(performance.now()); callbacks.onReady(); } catch (error) { callbacks.onError(error instanceof Error ? error.message : '회사를 불러오지 못했어요.'); }
  return { zoom, rotate, tilt, resetView, screenToWorld: point => screenAxisToWorld(point, orbit), dispose() {
    dead = true; cancelAnimationFrame(frame); observer.disconnect();
    renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointermove', pointerMove); renderer.domElement.removeEventListener('pointerup', pointerUp); renderer.domElement.removeEventListener('pointercancel', pointerCancel); renderer.domElement.removeEventListener('lostpointercapture', pointerCancel); renderer.domElement.removeEventListener('wheel', wheel); renderer.domElement.removeEventListener('webglcontextlost', contextLoss); document.removeEventListener('visibilitychange', pointerCancel);
    architecture.release(); retired.forEach(object => world.add(object));
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    world.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) { if (object instanceof THREE.Mesh) geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) { materials.add(material); const texture = (material as THREE.MeshStandardMaterial).map; if (texture) textures.add(texture); } } });
    geometries.forEach(geometry => geometry.dispose()); textures.forEach(texture => texture.dispose()); materials.forEach(material => material.dispose()); sun.shadow.dispose(); renderer.dispose(); renderer.domElement.remove(); bubbleLayer.remove(); disposeModelCaches();
  } };
}
