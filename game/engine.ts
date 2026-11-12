import type { Actor, Command, Floor, GameEvent, GameState, PersistedState, Point, Pose, RoofWallSide, Snack } from './types.ts';
import { BOUNDS, DESKS, OBSTACLES, ROOF_BOUNDS, ROOF_OBSTACLES, ROOF_REST, ROOF_START, ROOF_WALLS, SNACKS, START, TARGETS, WEAPONS, isRoofTarget, roofWallForTarget } from './layout.ts';
import { readSavedState, toPersistedState } from './storage.ts';
import { getRoofLean, ROOF_LEAN_DISTANCE } from './roof-rest.ts';
import { ROOF_BENCH_SEATS, SOLO_LOUNGE_SEATS, restSeatById, type RestSeat } from './rest-seats.ts';

const BOSS_DISTANCE = 1.4, BOSS_CLEARANCE = 1.12, BOSS_REACH = 1.5 + 1e-6;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const face = (actor: Actor, point: Point) => { actor.angle = Math.atan2(point.x - actor.x, point.z - actor.z); };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export type OfficeEnvironment = {
  bounds: typeof BOUNDS; obstacles: { x: number; z: number; w: number; d: number }[];
  start: Point; targets: typeof TARGETS; deskAngle: number; loungeAngle: number;
  coffeeFacing: Point; snacksFacing: Point; patrol: Point[];
  loungeSeats?: RestSeat[];
};
export type GameEnvironment = {
  getOffice(): OfficeEnvironment; coworkers?: boolean;
  bossAuthority?: () => boolean; continueBossOnRoof?: boolean;
  getPeers?: () => { actor: Actor; floor: Floor; seat: GameState['seat']; restSeatId?: string | null; deskMode: GameState['deskMode'] }[];
};
const SOLO_OFFICE: OfficeEnvironment = { bounds: BOUNDS, obstacles: OBSTACLES, start: START, targets: TARGETS, deskAngle: Math.PI, loungeAngle: Math.PI,
  coffeeFacing: { x: 7.6, z: -4.3 }, snacksFacing: { x: 7.6, z: -1.8 },
  patrol: [{ x: 3.5, z: 3.25 }, { x: -3.8, z: 4 }, { x: -6, z: -3.55 }, { x: 3.5, z: .3 }] };
function createNavigation(office: OfficeEnvironment) {
const RADIUS = office === SOLO_OFFICE ? .22 : .24;
const valid = (p: Point, floor: Floor = 'office') => {
  const RADIUS = floor === 'rooftop' ? .22 : office === SOLO_OFFICE ? .22 : .24;
  const bounds = floor === 'rooftop' ? ROOF_BOUNDS : office.bounds, obstacles = floor === 'rooftop' ? ROOF_OBSTACLES : office.obstacles;
  return Number.isFinite(p.x) && Number.isFinite(p.z)
    && p.x >= bounds.minX + RADIUS && p.x <= bounds.maxX - RADIUS
    && p.z >= bounds.minZ + RADIUS && p.z <= bounds.maxZ - RADIUS
    && !obstacles.some(o => Math.abs(p.x - o.x) < o.w / 2 + RADIUS && Math.abs(p.z - o.z) < o.d / 2 + RADIUS);
};
function lineClear(a: Point, b: Point, avoid?: Point, floor: Floor = 'office') {
  if (!valid(a, floor) || !valid(b, floor)) return false;
  const RADIUS = floor === 'rooftop' ? .22 : office === SOLO_OFFICE ? .22 : .24;
  const dx = b.x - a.x, dz = b.z - a.z;
  // Sampling can skip a narrow diagonal intersection with a desk corner.
  // Clip the entire segment against each expanded rectangle instead, so a
  // route and any shorter per-frame portion of it agree on collision safety.
  for (const obstacle of floor === 'rooftop' ? ROOF_OBSTACLES : office.obstacles) {
    let enter = 0, leave = 1, intersects = true;
    for (const [origin, delta, min, max] of [
      [a.x, dx, obstacle.x - obstacle.w / 2 - RADIUS, obstacle.x + obstacle.w / 2 + RADIUS],
      [a.z, dz, obstacle.z - obstacle.d / 2 - RADIUS, obstacle.z + obstacle.d / 2 + RADIUS],
    ]) {
      if (Math.abs(delta) < 1e-12) {
        if (origin <= min || origin >= max) { intersects = false; break; }
      } else {
        const first = (min - origin) / delta, last = (max - origin) / delta;
        enter = Math.max(enter, Math.min(first, last)); leave = Math.min(leave, Math.max(first, last));
        if (leave - enter <= 1e-10) { intersects = false; break; }
      }
    }
    if (intersects && leave - enter > 1e-10) return false;
  }
  if (avoid) {
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared ? clamp(((avoid.x - a.x) * dx + (avoid.z - a.z) * dz) / lengthSquared, 0, 1) : 0;
    const closest = { x: a.x + t * dx, z: a.z + t * dz };
    const clearance = Math.min(BOSS_CLEARANCE, distance(a, avoid));
    if (distance(closest, avoid) < clearance - 1e-8) return false;
  }
  return true;
}

// Coworkers never block navigation. Only a selected boss adds temporary
// encounter clearance, so the player cannot approach through the boss's body.
const GRID = .3;
const NX = office === SOLO_OFFICE ? 55 : Math.ceil((office.bounds.maxX - office.bounds.minX - RADIUS * 2) / GRID) + 1;
const NZ = office === SOLO_OFFICE ? 35 : Math.ceil((office.bounds.maxZ - office.bounds.minZ - RADIUS * 2) / GRID) + 1;
const nodes: Point[] = Array.from({ length: NX * NZ }, (_, i) => office === SOLO_OFFICE
  ? { x: -8.1 + (i % NX) * GRID, z: -5.1 + Math.floor(i / NX) * GRID }
  : { x: office.bounds.minX + RADIUS + (i % NX) * (office.bounds.maxX - office.bounds.minX - RADIUS * 2) / (NX - 1),
      z: office.bounds.minZ + RADIUS + Math.floor(i / NX) * (office.bounds.maxZ - office.bounds.minZ - RADIUS * 2) / (NZ - 1) });
// The expanded roof includes slim corridors outside the planters. Its grid
// reaches those corridors; the office keeps its established furniture grid.
const roofNX = 87, roofNZ = 57;
const roofNodes = Array.from({ length: roofNX * roofNZ }, (_, i) => {
  const x = i % roofNX, z = Math.floor(i / roofNX);
  return { x: x === 0 ? -8.66 : x === roofNX - 1 ? 8.66 : -8.6 + x * .2,
    z: z === 0 ? -5.66 : z === roofNZ - 1 ? 5.66 : -5.6 + z * .2 };
});
const navigation = {
  office: { nodes, NX, NZ, open: nodes.map(p => valid(p)) },
  rooftop: { nodes: roofNodes, NX: roofNX, NZ: roofNZ, open: roofNodes.map(p => valid(p, 'rooftop')) },
};
function nearest(p: Point, visibleFrom?: Point, avoid?: Point, floor: Floor = 'office'): number {
  let best = -1, score = Infinity;
  const { nodes, open: openNodes } = navigation[floor];
  for (let i = 0; i < nodes.length; i++) if (openNodes[i] && (!avoid || distance(nodes[i], avoid) >= BOSS_CLEARANCE)) {
    const d = distance(p, nodes[i]);
    if (d < score && (!visibleFrom || lineClear(visibleFrom, nodes[i], avoid, floor))) { best = i; score = d; }
  }
  return best;
}
function route(start: Point, requested: Point, avoid?: Point, floor: Floor = 'office'): Point[] {
  if (!Number.isFinite(requested.x) || !Number.isFinite(requested.z)) return [];
  const RADIUS = floor === 'rooftop' ? .22 : office === SOLO_OFFICE ? .22 : .24;
  const bounds = floor === 'rooftop' ? ROOF_BOUNDS : office.bounds;
  const { nodes, NX, NZ, open: openNodes } = navigation[floor];
  const bounded = { x: clamp(requested.x, bounds.minX + RADIUS, bounds.maxX - RADIUS), z: clamp(requested.z, bounds.minZ + RADIUS, bounds.maxZ - RADIUS) };
  const goalIndex = nearest(bounded, undefined, avoid, floor);
  if (goalIndex < 0) return [];
  const goal = valid(bounded, floor) && (!avoid || distance(bounded, avoid) >= BOSS_CLEARANCE) ? bounded : nodes[goalIndex];
  if (lineClear(start, goal, avoid, floor)) return [{ ...goal }];
  const first = nearest(start, start, avoid, floor), last = nearest(goal, goal, avoid, floor);
  if (first < 0 || last < 0) return [];
  const cost = new Map<number, number>([[first, 0]]), previous = new Map<number, number>();
  const frontier = new Set([first]);
  while (frontier.size) {
    let current = -1, best = Infinity;
    for (const index of frontier) { const f = cost.get(index)! + distance(nodes[index], nodes[last]); if (f < best) { best = f; current = index; } }
    if (current === last) {
      const path = [goal];
      let cursor = last;
      while (cursor !== first) { path.unshift(nodes[cursor]); cursor = previous.get(cursor)!; }
      path.unshift(nodes[first]);
      // Remove unnecessary grid corners without cutting through furniture.
      const result: Point[] = [];
      let from = start, index = 0;
      while (index < path.length) {
        let end = path.length - 1;
        while (end > index && !lineClear(from, path[end], avoid, floor)) end--;
        result.push({ ...path[end] }); from = path[end]; index = end + 1;
      }
      return result;
    }
    frontier.delete(current);
    const x = current % NX, z = Math.floor(current / NX);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dz) || x + dx < 0 || x + dx >= NX || z + dz < 0 || z + dz >= NZ) continue;
      const next = current + dx + dz * NX;
      if (!openNodes[next] || (avoid && distance(nodes[next], avoid) < BOSS_CLEARANCE) || !lineClear(nodes[current], nodes[next], avoid, floor)) continue;
      const candidate = cost.get(current)! + distance(nodes[current], nodes[next]);
      if (candidate < (cost.get(next) ?? Infinity)) { cost.set(next, candidate); previous.set(next, current); frontier.add(next); }
    }
  }
  return [];
}
function bossApproach(player: Point, boss: Point): Point[] {
  // Prefer a gap across the fixed camera's horizontal axis, not a position
  // directly behind the boss. Try reachable alternatives beside furniture.
  const candidates = Array.from({ length: 24 }, (_, index) => {
    const angle = Math.atan2(.832, -.555) + index * Math.PI / 12;
    const dx = Math.sin(angle) * BOSS_DISTANCE, dz = Math.cos(angle) * BOSS_DISTANCE;
    const point = { x: boss.x + dx, z: boss.z + dz };
    const lateralGap = Math.abs(.832 * dx - .555 * dz);
    return { point, score: distance(player, point) * .35 + (BOSS_DISTANCE - lateralGap) * 2 };
  }).filter(({ point }) => valid(point) && lineClear(boss, point)).sort((a, b) => a.score - b.score);
  for (const { point } of candidates) {
    const path = route(player, point, boss);
    if (path.length && distance(path[path.length - 1], point) < .05) return path;
  }
  return [];
}
  return { valid, lineClear, route, bossApproach };
}
function travel(actor: Actor, path: Point[], speed: number, dt: number) {
  let remaining = speed * dt;
  actor.moving = false;
  while (path.length && remaining > 0) {
    const goal = path[0], d = distance(actor, goal);
    if (d < .001) { path.shift(); continue; }
    actor.angle = Math.atan2(goal.x - actor.x, goal.z - actor.z);
    const step = Math.min(d, remaining);
    actor.x += (goal.x - actor.x) * step / d; actor.z += (goal.z - actor.z) * step / d;
    remaining -= step; actor.moving = true;
    if (step >= d) path.shift();
  }
  if (actor.moving) actor.pose = 'walk';
}
function actor(id: string, name: string, point: Point, pose: Pose = 'idle'): Actor { return { id, name, ...point, angle: pose === 'type' || pose === 'sleep' ? Math.PI : 0, pose, moving: false }; }
function initialState(saved?: PersistedState): GameState {
  const p = saved && readSavedState({ getItem: () => JSON.stringify(saved) });
  return {
    entered: false, paused: false, elapsed: 0, name: p?.name ?? '김사원',
    floor: 'office', transition: null,
    player: { ...actor('player', p?.name ?? '김사원', START), avatar: p?.avatar ?? 'short' }, boss: actor('boss', '박부장', TARGETS.boss.point),
    coworkers: DESKS.filter(d => d.owner?.startsWith('colleague')).map((d, i) => actor(d.owner!, ['이대리', '최주임', '정사원'][i], { x: d.x, z: d.z + 1.05 }, i === 1 ? 'sleep' : 'type')),
    target: null, ready: false, destination: null, seat: null, restSeatId: null, deskMode: null, activity: null, roofRest: null, roofWallSide: null, roofLeanPoint: null, candyInMouth: false,
    inventory: { cookie: p?.snacks.cookie ?? 0, choco: p?.snacks.choco ?? 0, cracker: p?.snacks.cracker ?? 0, coffee: 0 },
    weapon: p?.weapon ?? 'punch', settings: p?.settings ?? { sound: false, volume: .4, reducedMotion: false, quality: 'auto' },
    warning: 0, scold: 0, bossPhase: 'routine', lastHit: null, bossHit: null, event: null, message: '', messageUntil: 0,
  };
}

export function createGameEngine(initial?: PersistedState, environment?: GameEnvironment) {
  let office = environment?.getOffice() ?? SOLO_OFFICE;
  let navigation = createNavigation(office);
  const valid = (point: Point, floor: Floor = 'office') => navigation.valid(point, floor);
  const lineClear = (a: Point, b: Point, avoid?: Point, floor: Floor = 'office') => navigation.lineClear(a, b, avoid, floor);
  const route = (a: Point, b: Point, avoid?: Point, floor: Floor = 'office') => navigation.route(a, b, avoid, floor);
  const bossApproach = (player: Point, boss: Point) => navigation.bossApproach(player, boss);
  const state = initialState(initial);
  const applyEnvironment = () => {
    Object.assign(state.player, office.start); Object.assign(state.boss, office.targets.boss.point);
    if (environment?.coworkers === false) state.coworkers = [];
  };
  applyEnvironment();
  let snapshot = structuredClone(state), disposed = false, snapshotClock = 0;
  const listeners = new Set<() => void>();
  let path: Point[] = [], bossPath: Point[] = [], axis = { x: 0, z: 0 }, followClock = 0;
  let followedBoss: Point = { ...state.boss };
  let officeReturn: Point = { ...office.start };
  let pendingRest: { place: 'bench' | 'wall'; wall?: RoofWallSide; point: Point } | null = null;
  let selectedRestSeat: RestSeat | null = null;
  let eventId = 0, lastAttack = -Infinity, attackUntil = 0, hitUntil = 0, recoverUntil = 0, immunityUntil = 0;
  let nextObservation = 10, patrolIndex = 0, patrolWait = 0, coworkerPhase = -1, coworkerPath: Point[] = [];
  let observedPeer: string | null = null, peerObservationUntil = 0;
  let patrol = office.patrol;
  const notify = () => {
    if (disposed) return;
    snapshot = structuredClone(state); snapshotClock = 0;
    for (const listener of listeners) listener();
  };
  const event = (text: string, kind: GameEvent['kind'] = 'notice') => {
    state.message = text; state.messageUntil = state.elapsed + 4;
    state.event = { id: ++eventId, kind, text, at: state.elapsed };
  };
  const currentRestSeat = () => restSeatById(state.restSeatId, office.loungeSeats ?? SOLO_LOUNGE_SEATS);
  const seatAvailable = (seat: RestSeat) => !(environment?.getPeers?.() ?? []).some(peer =>
    peer.floor === seat.floor && (peer.seat === 'lounge' || peer.seat === 'roof-bench')
    && (peer.restSeatId === seat.id || distance(peer.actor, seat.seat) < .5));
  const pickRestSeat = (floor: Floor, id?: string, point?: Point): RestSeat | null => {
    const seats = floor === 'rooftop' ? ROOF_BENCH_SEATS : office.loungeSeats ?? SOLO_LOUNGE_SEATS;
    const selected = id ? seats.find(seat => seat.id === id) : point
      ? [...seats].sort((a, b) => distance(a.seat, point) - distance(b.seat, point))[0]
      : seats.find(seatAvailable);
    if (!selected || !seatAvailable(selected)) { event('이미 동료가 앉아 있어요. 다른 의자를 골라 주세요.'); return null; }
    return selected;
  };
  const restorePose = () => {
    const p = state.player;
    p.moving = false;
    p.pose = state.roofRest === 'wall' ? 'wallLean' : state.seat === 'desk' ? state.deskMode === 'sleep' ? 'sleep' : 'type' : state.seat ? 'sit' : 'idle';
    if (state.roofRest) p.angle = state.roofRest === 'wall' ? ROOF_WALLS[state.roofWallSide ?? 'north'].angle : currentRestSeat()?.angle ?? ROOF_REST.bench.angle;
    else if (state.seat) p.angle = state.seat === 'desk' ? office.deskAngle : currentRestSeat()?.angle ?? office.loungeAngle;
  };
  const endObservation = () => {
    state.warning = 0; state.scold = 0;
    if ((environment?.bossAuthority?.() ?? true) && !observedPeer && (state.bossPhase === 'watch' || state.bossPhase === 'scold')) { state.bossPhase = 'routine'; state.boss.pose = 'idle'; patrolWait = 2; }
  };
  const stand = () => {
    if (state.seat === 'roof-bench' || state.seat === 'lounge') Object.assign(state.player, currentRestSeat()?.approach ?? (state.seat === 'roof-bench' ? ROOF_REST.bench.point : office.targets.lounge.point));
    state.seat = null; state.restSeatId = null; state.roofRest = null; state.roofWallSide = null; state.deskMode = null; restorePose(); endObservation();
  };
  const cancel = () => { state.activity = null; path = []; pendingRest = null; selectedRestSeat = null; state.destination = null; state.roofLeanPoint = null; axis = { x: 0, z: 0 }; restorePose(); };
  const rest = (place: 'bench' | 'wall', wall: RoofWallSide = 'north', point?: Point) => {
    const seat = place === 'bench' ? selectedRestSeat ?? pickRestSeat('rooftop') : null;
    if (place === 'bench' && (!seat || !seatAvailable(seat))) { cancel(); state.target = null; event('이미 동료가 앉아 있어요. 다른 의자를 골라 주세요.'); return; }
    cancel(); stand(); state.roofRest = place; state.seat = place === 'bench' ? 'roof-bench' : null;
    state.restSeatId = seat?.id ?? null; selectedRestSeat = seat;
    state.roofWallSide = place === 'wall' ? wall : null;
    state.roofLeanPoint = place === 'wall' && point ? { ...point } : null;
    Object.assign(state.player, place === 'bench' ? seat!.seat : point);
    restorePose(); event(place === 'bench' ? '잠깐 앉아서, 바람만 쐬어요.' : '기대도 괜찮아요. 여기서는 힘 빼고.');
  };
  const canReachBoss = () => {
    const gap = distance(state.player, state.boss);
    const lateralGap = Math.abs(.832 * (state.player.x - state.boss.x) - .555 * (state.player.z - state.boss.z));
    return state.floor === 'office' && !state.transition && gap >= 1.05 && gap <= BOSS_REACH && lateralGap >= .9 && lineClear(state.player, state.boss);
  };
  const ready = () => {
    const targetSeat = selectedRestSeat ?? currentRestSeat();
    const point = state.target && roofWallForTarget(state.target) ? state.roofLeanPoint : (state.target === 'lounge' || state.target === 'roofBench') && targetSeat ? targetSeat.approach : state.target ? office.targets[state.target].point : null;
    state.ready = !state.transition && !!state.target && isRoofTarget(state.target) === (state.floor === 'rooftop') && (state.target === 'boss' ? canReachBoss() : !!point && distance(state.player, point) <= 1.2);
  };
  const walk = (point: Point) => {
    cancel(); stand();
    path = route(state.player, point, undefined, state.floor);
    state.destination = path.length ? { ...path[path.length - 1] } : null;
  };
  const approachWall = (origin: Point = state.player, wall?: RoofWallSide) => {
    const lean = getRoofLean(origin, wall);
    if (!lean) return;
    if (state.roofRest === 'wall' && state.roofWallSide === lean.wall && distance(state.player, lean.point) < .001) return;
    state.target = ROOF_WALLS[lean.wall].target;
    walk(lean.point);
    if (path.length && distance(path[path.length - 1], lean.point) < .001) {
      state.roofLeanPoint = { ...lean.point };
      pendingRest = { place: 'wall', wall: lean.wall, point: { ...lean.point } };
    }
  };
  const followBoss = () => {
    path = bossApproach(state.player, state.boss); followedBoss = { x: state.boss.x, z: state.boss.z }; followClock = .35;
    state.destination = path.length ? { ...path[path.length - 1] } : null;
  };
  const busy = () => { if (!state.activity) return false; event('지금 하던 일을 마치거나 취소해 주세요.'); return true; };
  const begin = (kind: NonNullable<GameState['activity']>['kind'], duration: number, snack?: Snack) => {
    if (kind === 'drink' || kind === 'eat') state.candyInMouth = false;
    state.activity = { kind, duration, remaining: duration, ...(snack ? { snack } : {}) };
    path = []; pendingRest = null; axis = { x: 0, z: 0 }; state.destination = null; state.player.moving = false;
    state.player.pose = kind === 'drink' ? 'drink' : kind;
    if (kind === 'brew') face(state.player, office.coffeeFacing);
    if (kind === 'take') face(state.player, office.snacksFacing);
  };
  const reset = (saved?: PersistedState) => {
    Object.assign(state, initialState(saved)); applyEnvironment(); path = []; bossPath = []; coworkerPath = []; axis = { x: 0, z: 0 };
    eventId = 0; lastAttack = -Infinity; attackUntil = hitUntil = recoverUntil = immunityUntil = 0;
    nextObservation = 10; patrolIndex = 0; patrolWait = 0; coworkerPhase = -1; followClock = 0; followedBoss = { ...state.boss };
    officeReturn = { ...office.start }; pendingRest = null;
  };
  const dispatch = (command: Command) => {
    if (disposed) return;
    if (command.type === 'reset') reset();
    else if (command.type === 'exit') reset(toPersistedState(state));
    else if (command.type === 'settings') {
      state.settings = readSavedState({ getItem: () => JSON.stringify({ ...toPersistedState(state), settings: { ...state.settings, ...command.value } }) })!.settings;
    } else if (command.type === 'weapon') {
      if (command.weapon in WEAPONS) state.weapon = command.weapon;
    } else if (command.type === 'enter') {
      state.name = command.name?.trim().slice(0, 10) || state.name; state.player.name = state.name; state.entered = true; state.paused = false;
      if (command.avatar === 'short' || command.avatar === 'ponytail') state.player.avatar = command.avatar;
    } else if (command.type === 'pause') { state.paused = command.value; axis = { x: 0, z: 0 }; }
    else if (state.entered && !state.paused) {
      if (state.transition) return;
      switch (command.type) {
        case 'travel': {
          if (command.floor === state.floor) break;
          if (state.floor === 'office') officeReturn = state.seat === 'lounge' && currentRestSeat()
            ? { ...currentRestSeat()!.approach } : { x: state.player.x, z: state.player.z };
          cancel(); stand(); state.target = null; state.ready = false; state.lastHit = null; state.candyInMouth = false;
          attackUntil = 0;
          if (!environment) { hitUntil = recoverUntil = 0; state.bossPhase = 'routine'; state.boss.pose = 'idle'; state.boss.moving = false; bossPath = []; } state.message = ''; state.messageUntil = 0;
          const duration = state.settings.reducedMotion ? .4 : 1.6;
          state.transition = { from: state.floor, to: command.floor, duration, remaining: duration };
          break;
        }
        case 'candy':
          if (state.floor === 'rooftop' && !busy()) {
            if (state.candyInMouth) { state.candyInMouth = false; event('사탕은 잠깐 내려놓고.'); }
            else { begin('candy', 1.2); if (!state.roofRest) state.player.angle = .3; }
          }
          break;
        case 'rest': {
          if (state.floor !== 'rooftop') break;
          if (command.place === 'wall') { approachWall(state.player, command.wall); break; }
          if (state.seat === 'roof-bench' && (!command.restSeatId || command.restSeatId === state.restSeatId)) break;
          const seat = pickRestSeat('rooftop', command.restSeatId); if (!seat) break;
          state.target = 'roofBench'; walk(seat.approach); selectedRestSeat = seat;
          if (path.length) pendingRest = { place: 'bench', point: { ...seat.approach } };
          break;
        }
        case 'select': {
          if (isRoofTarget(command.target) !== (state.floor === 'rooftop')) break;
          const wall = roofWallForTarget(command.target);
          if (wall) { approachWall(command.point ?? state.player, wall); break; }
          if (command.target === 'lounge' || command.target === 'roofBench') {
            const seat = pickRestSeat(state.floor, command.restSeatId, command.point); if (!seat) break;
            state.target = command.target; walk(seat.approach); selectedRestSeat = seat; break;
          }
          state.target = command.target;
          if (command.target === 'boss') { cancel(); stand(); followBoss(); }
          else walk(office.targets[command.target].point);
          break;
        }
        case 'move': state.target = null; walk(command.point); break;
        case 'axis': {
          const x = Number.isFinite(command.x) ? clamp(command.x, -1, 1) : 0, z = Number.isFinite(command.z) ? clamp(command.z, -1, 1) : 0;
          if (x || z) { cancel(); stand(); state.target = null; } axis = { x, z }; break;
        }
        case 'stand': cancel(); stand(); if (state.target && roofWallForTarget(state.target)) state.target = null; break;
        case 'cancel': cancel(); state.target = null; state.ready = false; break;
        case 'desk':
          if (state.seat !== 'desk') { event('내 자리에 앉으면 바꿀 수 있어요.'); break; }
          // Returning to work is also the immediate escape from an observation.
          // Unfinished food/drink is cancelled before its completion transaction.
          if (command.mode === 'work') cancel();
          else if (busy()) break;
          state.deskMode = command.mode; restorePose(); if (command.mode === 'work') endObservation(); break;
        case 'spin': if (!busy() && state.seat === 'desk') begin('spin', 2); break;
        case 'dance':
          if (state.floor === 'office' && !busy()) {
            cancel(); stand(); state.target = null; state.ready = false;
            begin('dance', 8); event('부장님 몰래, 여기는 잠깐 나의 무대.');
          }
          break;
        case 'interact':
          if (busy()) break;
          if (state.floor === 'rooftop' && !state.roofRest) {
            const near = getRoofLean(state.player);
            if (near && near.distance <= ROOF_LEAN_DISTANCE) { approachWall(); break; }
          }
          ready();
          if (!state.ready || !state.target) { event('조금 더 가까이 가 주세요.'); break; }
          if (state.target === 'roofBench') rest('bench');
          else if (roofWallForTarget(state.target)) approachWall(state.roofLeanPoint ?? state.player, roofWallForTarget(state.target)!);
          else if (state.target === 'desk') { cancel(); stand(); state.seat = 'desk'; state.deskMode = 'work'; Object.assign(state.player, office.targets.desk.point); restorePose(); event('자리에 앉았어요. 오늘도 적당히 힘내요.'); }
          else if (state.target === 'coffee') begin('brew', 3.2);
          else if (state.target === 'lounge') {
            if (state.seat === 'lounge') { state.player.pose = state.player.pose === 'lean' ? 'sit' : 'lean'; }
            else {
              const seat = selectedRestSeat ?? pickRestSeat('office');
              if (!seat || !seatAvailable(seat)) { event('이미 동료가 앉아 있어요. 다른 의자를 골라 주세요.'); break; }
              cancel(); stand(); state.seat = 'lounge'; state.restSeatId = seat.id; selectedRestSeat = seat;
              Object.assign(state.player, seat.seat); restorePose();
            }
            event('잠깐 쉬어도 괜찮아요.');
          } else if (state.target === 'copier') event('복사기도 잠깐 쉬는 중인가 봐요.');
          else if (state.target === 'snacks') event('먹고 싶은 과자를 골라 주세요.');
          else if (state.target === 'boss') event('도구를 고르고 장난을 쳐 보세요.');
          else if (state.target === 'exit') reset(toPersistedState(state));
          break;
        case 'take':
          if (state.floor !== 'office') break;
          if (busy()) break;
          if (distance(state.player, office.targets.snacks.point) > 1.2) { event('과자 선반 가까이 가 주세요.'); break; }
          if (state.inventory.cookie + state.inventory.choco + state.inventory.cracker >= 6) { event('과자는 여섯 개까지 챙길 수 있어요.'); break; }
          begin('take', 1.3, command.snack); break;
        case 'eat':
          if (!busy()) { if (state.inventory[command.snack] > 0) begin('eat', 1.5, command.snack); else event('먼저 과자를 챙겨 주세요.'); } break;
        case 'drink':
          if (!busy()) { if (state.inventory.coffee > 0) begin('drink', 1.6); else event('먼저 커피를 내려 주세요.'); } break;
        case 'attack':
          if (busy()) break;
          if (!canReachBoss()) { event('상사 옆으로 다가가 간격을 두고 장난쳐 주세요.'); break; }
          if (state.elapsed + 1e-8 < attackUntil || state.elapsed - lastAttack + 1e-8 < WEAPONS[state.weapon].interval) break;
          path = []; axis = { x: 0, z: 0 }; state.destination = null; state.player.moving = false;
          face(state.player, state.boss); face(state.boss, state.player);
          lastAttack = state.elapsed; attackUntil = state.elapsed + WEAPONS[state.weapon].interval; state.player.pose = 'hit';
          state.warning = state.scold = 0; state.bossPhase = 'hit'; state.boss.pose = 'hit'; state.boss.moving = false; bossPath = [];
          hitUntil = state.elapsed + 2; state.lastHit = { id: (state.lastHit?.id ?? 0) + 1, weapon: state.weapon, at: state.elapsed };
          if (environment) state.bossHit = { ...state.lastHit };
          event(state.weapon === 'fan' ? '나 안 해! 오늘의 서류는 여기까지.' : '앗! 장난은 살살 해 주세요.', state.weapon); break;
      }
    }
    ready(); notify();
  };
  const updateBoss = (dt: number) => {
    if (state.bossPhase === 'hit') {
      if (state.elapsed < hitUntil) return;
      state.bossPhase = 'recover'; state.boss.pose = 'idle'; recoverUntil = state.elapsed + .6; immunityUntil = state.elapsed + 10.6;
      nextObservation = Math.max(nextObservation, immunityUntil); return;
    }
    if (state.bossPhase === 'recover') { if (state.elapsed < recoverUntil) return; state.bossPhase = 'routine'; }
    const peers = environment?.getPeers?.().filter(peer => peer.floor === 'office') ?? [];
    const approachingPeer = peers.find(peer => !peer.seat && distance(peer.actor, state.boss) >= 1.05 && distance(peer.actor, state.boss) <= 2.45);
    if ((state.floor === 'office' && state.target === 'boss' && !state.seat && distance(state.player, state.boss) <= 2.45) || approachingPeer) {
      // The boss acknowledges an approaching player instead of walking through
      // the encounter. Leaving or cancelling immediately resumes the routine.
      bossPath = []; state.boss.moving = false; state.boss.pose = 'idle'; face(state.boss, approachingPeer?.actor ?? state.player); return;
    }
    const slack = state.floor === 'office' && state.seat === 'desk' && state.deskMode !== 'work' && !state.player.moving && state.elapsed >= attackUntil;
    const slackingPeers = peers.filter(peer => peer.seat === 'desk' && peer.deskMode !== 'work' && !peer.actor.moving);
    if (observedPeer) {
      const peer = slackingPeers.find(peer => peer.actor.id === observedPeer);
      if (peer && state.elapsed < peerObservationUntil) {
        state.bossPhase = state.elapsed < peerObservationUntil - 3 ? 'watch' : 'scold';
        state.boss.pose = state.bossPhase; state.boss.moving = false; face(state.boss, peer.actor); return;
      }
      observedPeer = null; state.bossPhase = 'routine'; state.boss.pose = 'idle'; patrolWait = 2;
    }
    if ((state.warning || state.scold) && !slack) endObservation();
    if (state.warning > 0) {
      state.warning = Math.max(0, state.warning - dt);
      if (!state.warning) { state.scold = 3; state.bossPhase = 'scold'; state.boss.pose = 'scold'; event('잠깐, 화면이 업무 같지는 않은데요? 괜찮아요, 다시 해 봐요.', 'caught'); }
      return;
    }
    if (state.scold > 0) { state.scold = Math.max(0, state.scold - dt); if (!state.scold) endObservation(); return; }
    if (state.elapsed >= nextObservation && state.elapsed >= immunityUntil && slack && distance(state.boss, state.player) <= BOSS_REACH) {
      state.warning = 2; state.bossPhase = 'watch'; state.boss.pose = 'watch'; state.boss.moving = false; bossPath = [];
      nextObservation = state.elapsed + 30; event('부장님이 화면을 보고 있어요. 업무로 돌아갈 시간!'); return;
    }
    const peerToObserve = slackingPeers.sort((a, b) => distance(state.boss, a.actor) - distance(state.boss, b.actor))[0];
    if (state.elapsed >= nextObservation && state.elapsed >= immunityUntil && peerToObserve) {
      if (distance(state.boss, peerToObserve.actor) <= BOSS_REACH) {
        observedPeer = peerToObserve.actor.id; peerObservationUntil = state.elapsed + 5;
        state.bossPhase = 'watch'; state.boss.pose = 'watch'; state.boss.moving = false; bossPath = [];
        nextObservation = state.elapsed + 30; face(state.boss, peerToObserve.actor); return;
      }
      if (!bossPath.length) bossPath = bossApproach(state.boss, peerToObserve.actor);
      travel(state.boss, bossPath, 1.65, dt); return;
    }
    if (patrolWait > 0) { patrolWait -= dt; state.boss.pose = 'idle'; state.boss.moving = false; return; }
    if (!bossPath.length) {
      // A pending observation brings the boss to the desk, even if the player was away on the last pass.
      if (state.elapsed >= nextObservation && slack) patrolIndex = 0;
      bossPath = route(state.boss, patrol[patrolIndex]);
      if (distance(state.boss, patrol[patrolIndex]) < .1) {
        patrolWait = patrolIndex === 0 ? 7 : 3; patrolIndex = (patrolIndex + 1) % patrol.length;
        state.boss.pose = 'idle'; state.boss.moving = false; return;
      }
    }
    travel(state.boss, bossPath, 1.65, dt);
  };
  const updateGuestObservation = (dt: number) => {
    const slack = state.floor === 'office' && state.seat === 'desk' && state.deskMode !== 'work' && !state.player.moving;
    if (!slack) { state.warning = 0; state.scold = 0; return; }
    if (state.warning > 0) {
      state.warning = Math.max(0, state.warning - dt);
      if (!state.warning) { state.scold = 3; event('잠깐, 화면이 업무 같지는 않은데요? 괜찮아요, 다시 해 봐요.', 'caught'); }
    } else if (state.scold > 0) state.scold = Math.max(0, state.scold - dt);
    else if (state.elapsed >= nextObservation && state.bossPhase === 'watch' && distance(state.boss, state.player) <= BOSS_REACH) {
      state.warning = 2; nextObservation = state.elapsed + 30; event('부장님이 화면을 보고 있어요. 업무로 돌아갈 시간!');
    }
  };
  const updateCoworkers = (dt: number) => {
    if (state.coworkers.length < 3) return;
    const [typing, sleeping, coffee] = state.coworkers;
    typing.pose = state.elapsed % 16 < 12 ? 'type' : 'lean';
    sleeping.pose = state.elapsed % 24 < 19 ? 'sleep' : 'drink';
    const phase = Math.floor(state.elapsed / 12) % 4;
    const home = { x: -2, z: 3.25 };
    // Keep the visiting coworker beside the pantry aisle, leaving the machine
    // approach free so the player's brewing and drinking motions remain visible.
    const points = [home, { x: 5.5, z: -2.9 }, office.targets.copier.point, home];
    if (phase !== coworkerPhase) { coworkerPhase = phase; coworkerPath = route(coffee, points[phase]); }
    travel(coffee, coworkerPath, 1.3, dt);
    if (!coffee.moving) { coffee.pose = phase === 1 ? 'drink' : phase === 2 ? 'idle' : 'type'; coffee.angle = coffee.pose === 'type' ? Math.PI : 0; }
  };
  const tick = (dt: number) => {
    state.elapsed += dt;
    if (state.transition) {
      const transition = state.transition;
      transition.remaining = Math.max(0, transition.remaining - dt);
      if (transition.remaining <= transition.duration / 2 && state.floor !== transition.to) {
        state.floor = transition.to;
        Object.assign(state.player, state.floor === 'rooftop' ? ROOF_START : officeReturn);
        state.player.angle = state.floor === 'rooftop' ? .3 : 0; restorePose();
      }
      if (transition.remaining < 1e-8) { state.transition = null; event(state.floor === 'rooftop' ? '여기서는 잠깐, 회사 생각 내려놓기.' : '다시 사무실. 오늘도 적당히 해요.'); }
      return;
    }
    if (state.activity) {
      state.activity.remaining = Math.max(0, state.activity.remaining - dt);
      if (state.activity.remaining < 1e-8) {
        const a = state.activity; state.activity = null;
        if (a.kind === 'brew') { state.inventory.coffee = 3; event('따뜻한 커피가 준비됐어요.', 'coffee'); }
        else if (a.kind === 'drink') { state.inventory.coffee = Math.max(0, state.inventory.coffee - 1); event('커피 한 모금, 잠깐의 여유.', 'sip'); }
        else if (a.kind === 'take' && a.snack) { state.inventory[a.snack]++; event(`${SNACKS[a.snack]}를 챙겼어요.`, 'snack'); }
        else if (a.kind === 'eat' && a.snack) { state.inventory[a.snack] = Math.max(0, state.inventory[a.snack] - 1); event('맛있는 휴식이었어요.', 'snack'); }
        else if (a.kind === 'candy') { state.candyInMouth = true; event('사탕 하나 물고, 잠깐 아무 생각 없이.', 'sip'); }
        restorePose();
      }
    }
    if (!state.activity && state.elapsed >= attackUntil) {
      if (axis.x || axis.z) {
        const length = Math.max(1, Math.hypot(axis.x, axis.z)), dx = axis.x / length * 2.6 * dt, dz = axis.z / length * 2.6 * dt;
        const p = state.player, old = { x: p.x, z: p.z };
        const canWalk = (point: Point) => valid(point, state.floor);
        if (canWalk({ x: p.x + dx, z: p.z })) p.x += dx;
        if (canWalk({ x: p.x, z: p.z + dz })) p.z += dz;
        p.moving = distance(old, p) > .00001;
        if (p.moving) { p.angle = Math.atan2(p.x - old.x, p.z - old.z); p.pose = 'walk'; } else restorePose();
      } else {
        if (state.target === 'boss' && !state.seat) {
          followClock -= dt;
          const dx = state.player.x - state.boss.x, dz = state.player.z - state.boss.z;
          const moved = distance(followedBoss, state.boss) > .2;
          const blocked = path.length > 0 && !lineClear(state.player, path[0], state.boss);
          const needsGap = !canReachBoss() || Math.abs(.832 * dx - .555 * dz) < .9;
          if (blocked || (followClock <= 0 && (moved || (!path.length && needsGap)))) followBoss();
        }
        travel(state.player, path, 2.6, dt);
        if (!path.length && pendingRest) {
          const pending = pendingRest;
          if (distance(state.player, pending.point) < .05) rest(pending.place, pending.wall, pending.point);
          else pendingRest = null;
        }
        if (!state.player.moving) {
          state.destination = null; if (state.player.pose !== 'lean' || state.seat !== 'lounge') restorePose();
          if (state.target === 'boss' && !state.seat) face(state.player, state.boss);
        }
      }
    }
    if ((state.floor === 'office' || environment?.continueBossOnRoof) && (environment?.bossAuthority?.() ?? true)) updateBoss(dt);
    else if (environment?.bossAuthority && !environment.bossAuthority()) updateGuestObservation(dt);
    if (state.floor === 'office') updateCoworkers(dt);
    ready();
  };
  return {
    state, dispatch,
    rejectRestSeat(expectedId?: string | null) {
      if (!state.restSeatId || expectedId !== undefined && state.restSeatId !== expectedId) return false;
      cancel(); stand(); state.target = null; state.ready = false;
      event('이미 동료가 앉아 있어요. 다른 의자를 골라 주세요.'); notify(); return true;
    },
    refreshEnvironment() {
      const next = environment?.getOffice() ?? SOLO_OFFICE;
      office = next; navigation = createNavigation(office); patrol = office.patrol;
      path = []; bossPath = []; pendingRest = null; state.destination = null; axis = { x: 0, z: 0 };
      if (!valid(officeReturn)) officeReturn = { ...office.start };
      if (state.floor === 'office' && !valid(state.player)) { cancel(); stand(); Object.assign(state.player, office.start); }
      if (!valid(state.boss)) Object.assign(state.boss, office.targets.boss.point);
      if (state.seat === 'desk') { Object.assign(state.player, office.targets.desk.point); restorePose(); }
      ready(); notify();
    },
    applyBossState(actor: Actor, phase: GameState['bossPhase'], hit: GameState['lastHit'], replacePosition = true) {
      if (replacePosition) { Object.assign(state.boss, actor, { id: 'boss', name: '박부장' }); bossPath = []; }
      if (hit) {
        state.bossHit = { ...hit }; hitUntil = Math.max(hitUntil, hit.at + 2);
        if (state.elapsed < hitUntil) { state.bossPhase = 'hit'; state.boss.pose = 'hit'; state.boss.moving = false; bossPath = []; }
      }
      if (replacePosition && (state.elapsed >= hitUntil || phase === 'hit')) state.bossPhase = phase;
      ready(); notify();
    },
    step(dt: number) {
      if (disposed || !state.entered || state.paused || !Number.isFinite(dt) || dt <= 0) return;
      let left = dt;
      while (left > 1e-8) { const delta = Math.min(.05, left); tick(delta); left -= delta; }
      snapshotClock += dt; if (snapshotClock >= .1 - 1e-8) notify();
    },
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { if (disposed) return () => {}; listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { disposed = true; listeners.clear(); },
  };
}
