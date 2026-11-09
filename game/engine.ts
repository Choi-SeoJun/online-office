import type { Actor, Command, GameEngine, GameEvent, GameState, PersistedState, Point, Pose, Snack } from './types.ts';
import { BOUNDS, DESKS, OBSTACLES, ROOF_BOUNDS, ROOF_REST, ROOF_START, SNACKS, START, TARGETS, WEAPONS, isRoofTarget } from './layout.ts';
import { readSavedState, toPersistedState } from './storage.ts';

const RADIUS = .22;
const BOSS_DISTANCE = 1.4, BOSS_CLEARANCE = 1.12, BOSS_REACH = 1.5 + 1e-6;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const face = (actor: Actor, point: Point) => { actor.angle = Math.atan2(point.x - actor.x, point.z - actor.z); };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const valid = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.z)
  && p.x >= BOUNDS.minX + RADIUS && p.x <= BOUNDS.maxX - RADIUS
  && p.z >= BOUNDS.minZ + RADIUS && p.z <= BOUNDS.maxZ - RADIUS
  && !OBSTACLES.some(o => Math.abs(p.x - o.x) < o.w / 2 + RADIUS && Math.abs(p.z - o.z) < o.d / 2 + RADIUS);
function lineClear(a: Point, b: Point, avoid?: Point) {
  if (!valid(a) || !valid(b)) return false;
  const dx = b.x - a.x, dz = b.z - a.z;
  // Sampling can skip a narrow diagonal intersection with a desk corner.
  // Clip the entire segment against each expanded rectangle instead, so a
  // route and any shorter per-frame portion of it agree on collision safety.
  for (const obstacle of OBSTACLES) {
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
const GRID = .3, NX = 55, NZ = 35;
const nodes: Point[] = Array.from({ length: NX * NZ }, (_, i) => ({ x: -8.1 + (i % NX) * GRID, z: -5.1 + Math.floor(i / NX) * GRID }));
const openNodes = nodes.map(valid);
function nearest(p: Point, visibleFrom?: Point, avoid?: Point): number {
  let best = -1, score = Infinity;
  for (let i = 0; i < nodes.length; i++) if (openNodes[i] && (!avoid || distance(nodes[i], avoid) >= BOSS_CLEARANCE)) {
    const d = distance(p, nodes[i]);
    if (d < score && (!visibleFrom || lineClear(visibleFrom, nodes[i], avoid))) { best = i; score = d; }
  }
  return best;
}
function route(start: Point, requested: Point, avoid?: Point): Point[] {
  if (!Number.isFinite(requested.x) || !Number.isFinite(requested.z)) return [];
  const bounded = { x: clamp(requested.x, BOUNDS.minX + RADIUS, BOUNDS.maxX - RADIUS), z: clamp(requested.z, BOUNDS.minZ + RADIUS, BOUNDS.maxZ - RADIUS) };
  const goalIndex = nearest(bounded, undefined, avoid);
  if (goalIndex < 0) return [];
  const goal = valid(bounded) && (!avoid || distance(bounded, avoid) >= BOSS_CLEARANCE) ? bounded : nodes[goalIndex];
  if (lineClear(start, goal, avoid)) return [{ ...goal }];
  const first = nearest(start, start, avoid), last = nearest(goal, goal, avoid);
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
        while (end > index && !lineClear(from, path[end], avoid)) end--;
        result.push({ ...path[end] }); from = path[end]; index = end + 1;
      }
      return result;
    }
    frontier.delete(current);
    const x = current % NX, z = Math.floor(current / NX);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dz) || x + dx < 0 || x + dx >= NX || z + dz < 0 || z + dz >= NZ) continue;
      const next = current + dx + dz * NX;
      if (!openNodes[next] || (avoid && distance(nodes[next], avoid) < BOSS_CLEARANCE) || !lineClear(nodes[current], nodes[next], avoid)) continue;
      const candidate = cost.get(current)! + Math.hypot(dx, dz) * GRID;
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
    player: actor('player', p?.name ?? '김사원', START), boss: actor('boss', '박부장', TARGETS.boss.point),
    coworkers: DESKS.filter(d => d.owner?.startsWith('colleague')).map((d, i) => actor(d.owner!, ['이대리', '최주임', '정사원'][i], { x: d.x, z: d.z + 1.05 }, i === 1 ? 'sleep' : 'type')),
    target: null, ready: false, destination: null, seat: null, deskMode: null, activity: null, roofRest: null, candyInMouth: false,
    inventory: { cookie: p?.snacks.cookie ?? 0, choco: p?.snacks.choco ?? 0, cracker: p?.snacks.cracker ?? 0, coffee: 0 },
    weapon: p?.weapon ?? 'punch', settings: p?.settings ?? { sound: false, volume: .4, reducedMotion: false, quality: 'auto' },
    warning: 0, scold: 0, bossPhase: 'routine', lastHit: null, event: null, message: '', messageUntil: 0,
  };
}

export function createGameEngine(initial?: PersistedState): GameEngine {
  const state = initialState(initial);
  let snapshot = structuredClone(state), disposed = false, snapshotClock = 0;
  const listeners = new Set<() => void>();
  let path: Point[] = [], bossPath: Point[] = [], axis = { x: 0, z: 0 }, followClock = 0;
  let followedBoss: Point = { ...state.boss };
  let officeReturn: Point = { ...START };
  let pendingRest: 'bench' | 'wall' | null = null;
  let eventId = 0, lastAttack = -Infinity, attackUntil = 0, hitUntil = 0, recoverUntil = 0, immunityUntil = 0;
  let nextObservation = 10, patrolIndex = 0, patrolWait = 0, coworkerPhase = -1, coworkerPath: Point[] = [];
  const patrol: Point[] = [{ x: 3.5, z: 3.25 }, { x: -3.8, z: 4 }, { x: -6, z: -3.55 }, { x: 3.5, z: .3 }];
  const notify = () => {
    if (disposed) return;
    snapshot = structuredClone(state); snapshotClock = 0;
    for (const listener of listeners) listener();
  };
  const event = (text: string, kind: GameEvent['kind'] = 'notice') => {
    state.message = text; state.messageUntil = state.elapsed + 4;
    state.event = { id: ++eventId, kind, text, at: state.elapsed };
  };
  const restorePose = () => {
    const p = state.player;
    p.moving = false;
    p.pose = state.roofRest === 'wall' ? 'wallLean' : state.seat === 'desk' ? state.deskMode === 'sleep' ? 'sleep' : 'type' : state.seat ? 'sit' : 'idle';
    if (state.roofRest) p.angle = ROOF_REST[state.roofRest].angle;
    else if (state.seat) p.angle = Math.PI;
  };
  const endObservation = () => {
    state.warning = 0; state.scold = 0;
    if (state.bossPhase === 'watch' || state.bossPhase === 'scold') { state.bossPhase = 'routine'; state.boss.pose = 'idle'; patrolWait = 2; }
  };
  const stand = () => {
    if (state.seat === 'roof-bench') Object.assign(state.player, ROOF_REST.bench.point);
    state.seat = null; state.roofRest = null; state.deskMode = null; restorePose(); endObservation();
  };
  const cancel = () => { state.activity = null; path = []; pendingRest = null; state.destination = null; axis = { x: 0, z: 0 }; restorePose(); };
  const rest = (place: 'bench' | 'wall') => {
    cancel(); stand(); state.roofRest = place; state.seat = place === 'bench' ? 'roof-bench' : null;
    Object.assign(state.player, place === 'bench' ? ROOF_REST.bench.seat : ROOF_REST.wall.point);
    restorePose(); event(place === 'bench' ? '잠깐 앉아서, 바람만 쐬어요.' : '기대도 괜찮아요. 여기서는 힘 빼고.');
  };
  const canReachBoss = () => {
    const gap = distance(state.player, state.boss);
    const lateralGap = Math.abs(.832 * (state.player.x - state.boss.x) - .555 * (state.player.z - state.boss.z));
    return state.floor === 'office' && !state.transition && gap >= 1.05 && gap <= BOSS_REACH && lateralGap >= .9 && lineClear(state.player, state.boss);
  };
  const ready = () => { state.ready = !state.transition && !!state.target && isRoofTarget(state.target) === (state.floor === 'rooftop') && (state.target === 'boss' ? canReachBoss() : distance(state.player, TARGETS[state.target].point) <= 1.2); };
  const roofValid = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.z) && point.x >= ROOF_BOUNDS.minX + RADIUS && point.x <= ROOF_BOUNDS.maxX - RADIUS && point.z >= ROOF_BOUNDS.minZ + RADIUS && point.z <= ROOF_BOUNDS.maxZ - RADIUS;
  const walk = (point: Point) => {
    cancel(); stand();
    path = state.floor === 'office' ? route(state.player, point) : Number.isFinite(point.x) && Number.isFinite(point.z) ? [{ x: clamp(point.x, ROOF_BOUNDS.minX + RADIUS, ROOF_BOUNDS.maxX - RADIUS), z: clamp(point.z, ROOF_BOUNDS.minZ + RADIUS, ROOF_BOUNDS.maxZ - RADIUS) }] : [];
    state.destination = path.length ? { ...path[path.length - 1] } : null;
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
    if (kind === 'brew') face(state.player, { x: 7.6, z: -4.3 });
    if (kind === 'take') face(state.player, { x: 7.6, z: -1.8 });
  };
  const reset = (saved?: PersistedState) => {
    Object.assign(state, initialState(saved)); path = []; bossPath = []; coworkerPath = []; axis = { x: 0, z: 0 };
    eventId = 0; lastAttack = -Infinity; attackUntil = hitUntil = recoverUntil = immunityUntil = 0;
    nextObservation = 10; patrolIndex = 0; patrolWait = 0; coworkerPhase = -1; followClock = 0; followedBoss = { ...state.boss };
    officeReturn = { ...START }; pendingRest = null;
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
    } else if (command.type === 'pause') { state.paused = command.value; axis = { x: 0, z: 0 }; }
    else if (state.entered && !state.paused) {
      if (state.transition) return;
      switch (command.type) {
        case 'travel': {
          if (command.floor === state.floor) break;
          if (state.floor === 'office') officeReturn = { x: state.player.x, z: state.player.z };
          cancel(); stand(); state.target = null; state.ready = false; state.lastHit = null; state.candyInMouth = false;
          attackUntil = hitUntil = recoverUntil = 0; state.bossPhase = 'routine'; state.boss.pose = 'idle'; state.boss.moving = false;
          bossPath = []; state.message = ''; state.messageUntil = 0;
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
        case 'rest':
          if (state.floor !== 'rooftop') break;
          if (state.roofRest === command.place) break;
          state.target = command.place === 'bench' ? 'roofBench' : 'roofWall';
          walk(ROOF_REST[command.place].point); pendingRest = command.place;
          break;
        case 'select':
          if (isRoofTarget(command.target) !== (state.floor === 'rooftop')) break;
          state.target = command.target;
          if (command.target === 'boss') { cancel(); stand(); followBoss(); }
          else walk(TARGETS[command.target].point);
          break;
        case 'move': state.target = null; walk(command.point); break;
        case 'axis': {
          const x = Number.isFinite(command.x) ? clamp(command.x, -1, 1) : 0, z = Number.isFinite(command.z) ? clamp(command.z, -1, 1) : 0;
          if (x || z) { cancel(); stand(); state.target = null; } axis = { x, z }; break;
        }
        case 'stand': cancel(); stand(); break;
        case 'cancel': cancel(); state.target = null; state.ready = false; break;
        case 'desk':
          if (state.seat !== 'desk') { event('내 자리에 앉으면 바꿀 수 있어요.'); break; }
          // Returning to work is also the immediate escape from an observation.
          // Unfinished food/drink is cancelled before its completion transaction.
          if (command.mode === 'work') cancel();
          else if (busy()) break;
          state.deskMode = command.mode; restorePose(); if (command.mode === 'work') endObservation(); break;
        case 'spin': if (!busy() && state.seat === 'desk') begin('spin', 1.1); break;
        case 'interact':
          if (busy()) break;
          ready();
          if (!state.ready || !state.target) { event('조금 더 가까이 가 주세요.'); break; }
          if (state.target === 'roofBench' || state.target === 'roofWall') rest(state.target === 'roofBench' ? 'bench' : 'wall');
          else if (state.target === 'desk') { cancel(); state.seat = 'desk'; state.deskMode = 'work'; Object.assign(state.player, TARGETS.desk.point); restorePose(); event('자리에 앉았어요. 오늘도 적당히 힘내요.'); }
          else if (state.target === 'coffee') begin('brew', 3.2);
          else if (state.target === 'lounge') {
            if (state.seat === 'lounge') { state.player.pose = state.player.pose === 'lean' ? 'sit' : 'lean'; }
            else { cancel(); stand(); state.seat = 'lounge'; Object.assign(state.player, TARGETS.lounge.point); restorePose(); }
            event('잠깐 쉬어도 괜찮아요.');
          } else if (state.target === 'copier') event('복사기도 잠깐 쉬는 중인가 봐요.');
          else if (state.target === 'snacks') event('먹고 싶은 과자를 골라 주세요.');
          else if (state.target === 'boss') event('도구를 고르고 장난을 쳐 보세요.');
          else if (state.target === 'exit') reset(toPersistedState(state));
          break;
        case 'take':
          if (state.floor !== 'office') break;
          if (busy()) break;
          if (distance(state.player, TARGETS.snacks.point) > 1.2) { event('과자 선반 가까이 가 주세요.'); break; }
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
          event('앗! 장난은 살살 해 주세요.', state.weapon); break;
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
    if (state.target === 'boss' && !state.seat && distance(state.player, state.boss) <= 2.45) {
      // The boss acknowledges an approaching player instead of walking through
      // the encounter. Leaving or cancelling immediately resumes the routine.
      bossPath = []; state.boss.moving = false; state.boss.pose = 'idle'; face(state.boss, state.player); return;
    }
    const slack = state.seat === 'desk' && state.deskMode !== 'work' && !state.player.moving && state.elapsed >= attackUntil;
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
  const updateCoworkers = (dt: number) => {
    const [typing, sleeping, coffee] = state.coworkers;
    typing.pose = state.elapsed % 16 < 12 ? 'type' : 'lean';
    sleeping.pose = state.elapsed % 24 < 19 ? 'sleep' : 'drink';
    const phase = Math.floor(state.elapsed / 12) % 4;
    const home = { x: -2, z: 3.25 };
    // Keep the visiting coworker beside the pantry aisle, leaving the machine
    // approach free so the player's brewing and drinking motions remain visible.
    const points = [home, { x: 5.5, z: -2.9 }, TARGETS.copier.point, home];
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
        const canWalk = state.floor === 'rooftop' ? roofValid : valid;
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
        if (!path.length && pendingRest) rest(pendingRest);
        if (!state.player.moving) {
          state.destination = null; if (state.player.pose !== 'lean' || state.seat !== 'lounge') restorePose();
          if (state.target === 'boss' && !state.seat) face(state.player, state.boss);
        }
      }
    }
    if (state.floor === 'office') { updateBoss(dt); updateCoworkers(dt); }
    ready();
  };
  return {
    state, dispatch,
    step(dt) {
      if (disposed || !state.entered || state.paused || !Number.isFinite(dt) || dt <= 0) return;
      let left = dt;
      while (left > 1e-8) { const delta = Math.min(.05, left); tick(delta); left -= delta; }
      snapshotClock += dt; if (snapshotClock >= .1 - 1e-8) notify();
    },
    getSnapshot: () => snapshot,
    subscribe(listener) { if (disposed) return () => {}; listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { disposed = true; listeners.clear(); },
  };
}
