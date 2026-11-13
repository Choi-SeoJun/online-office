import type { Actor, Command, GameState, PersistedState, Point } from './types.ts';
import type { RoomBossUpdate, RoomPlayer, RoomPlayerUpdate, RoomSnapshot } from './multi-types.ts';
import { createMultiLayout, isMultiWalkable } from './multi-layout.ts';
import { createGameEngine, type OfficeEnvironment } from './engine.ts';
import { ROOF_REST, ROOF_WALLS } from './layout.ts';
import { restSeatAt, restSeatById } from './rest-seats.ts';
import { normalizeRank } from './ranks.ts';

/** The same simulation drives both play modes; rooms only add shared presence. */
export function createMultiController(initial: RoomPlayer, capacity: number, saved?: PersistedState) {
  let layout = createMultiLayout(capacity), seatIndex = initial.seatIndex;
  let hostAuthority = true, initializedBoss = false, latestSnapshot: RoomSnapshot | null = null;
  let lastAppliedTime = -Infinity, lastBossHit = 0;
  let axis: Point = { x: 0, z: 0 }, autoInteract: 'desk' | 'coffee' | null = null;
  const office = (): OfficeEnvironment => {
    const desk = layout.desks[seatIndex] ?? layout.desks[0];
    // First patrol point observes the local desk; remaining aisle points keep
    // the shared boss moving through every row without entering desk solids.
    const besideDesk = { x: desk.seat.x - 1.4, z: desk.seat.z };
    const first = isMultiWalkable(layout, besideDesk) ? besideDesk : { x: layout.spawn.x, z: desk.seat.z };
    return {
      bounds: layout.bounds, obstacles: layout.obstacles, start: layout.spawn,
      targets: { ...layout.targets, desk: { ...layout.targets.desk, point: desk.seat } },
      deskAngle: desk.angle, loungeAngle: Math.PI,
      bossSeat: { x: layout.furniture.bossDesk.x - 1.05, z: layout.furniture.bossDesk.z, angle: Math.PI / 2 },
      loungeSeats: layout.loungeSeats,
      coffeeFacing: layout.furniture.coffee, snacksFacing: layout.furniture.snacks,
      patrol: [first, { x: layout.spawn.x, z: layout.bounds.maxZ - .9 }, layout.boss,
        { x: layout.bounds.maxX - .65, z: Math.max(...layout.desks.map(desk => desk.seat.z)) + .6 }],
    };
  };
  const engine = createGameEngine(saved, {
    getOffice: office, coworkers: false, bossAuthority: () => hostAuthority, continueBossOnRoof: true,
    getPeers: () => latestSnapshot?.players.filter(p => p.id !== initial.id).map(actor => ({ actor, floor: actor.floor, seat: actor.seat, restSeatId: actor.restSeatId, deskMode: actor.deskMode })) ?? [],
  });
  const state = engine.state;
  Object.assign(state.player, { id: initial.id, name: initial.name, rank: normalizeRank(initial.rank), avatar: initial.avatar ?? saved?.avatar ?? 'short', x: initial.x, z: initial.z, angle: initial.angle, pose: 'idle', moving: false });
  state.floor = initial.floor ?? 'office';
  if (initial.seat === 'desk' && state.floor === 'office') {
    state.seat = 'desk'; state.deskMode = initial.deskMode ?? 'work';
    Object.assign(state.player, layout.desks[seatIndex].seat, { angle: layout.desks[seatIndex].angle, pose: state.deskMode === 'sleep' ? 'sleep' : 'type' });
  } else if (initial.seat === 'lounge' && state.floor === 'office') {
    const seat = restSeatById(initial.restSeatId, layout.loungeSeats) ?? restSeatAt(initial, 'office', layout.loungeSeats) ?? layout.loungeSeats[0];
    state.seat = 'lounge'; state.restSeatId = seat.id; Object.assign(state.player, seat.seat, { angle: seat.angle, pose: initial.pose === 'lean' ? 'lean' : 'sit' });
  } else if (initial.seat === 'roof-bench' && state.floor === 'rooftop') {
    const seat = restSeatById(initial.restSeatId, layout.loungeSeats) ?? restSeatAt(initial, 'rooftop', layout.loungeSeats);
    state.seat = 'roof-bench'; state.restSeatId = seat?.id ?? 'roof-middle'; state.roofRest = 'bench'; Object.assign(state.player, seat?.seat ?? ROOF_REST.bench.seat, { angle: seat?.angle ?? ROOF_REST.bench.angle, pose: 'sit' });
  } else if (initial.roofRest === 'wall' && initial.roofWallSide && state.floor === 'rooftop') {
    state.roofRest = 'wall'; state.roofWallSide = initial.roofWallSide; state.roofLeanPoint = { x: initial.x, z: initial.z };
    state.player.pose = 'wallLean'; state.player.angle = ROOF_WALLS[initial.roofWallSide].angle;
  }
  state.candyInMouth = state.floor === 'rooftop' && !!initial.candyInMouth;
  if (initial.carryingCoffee) state.inventory.coffee = 1;
  if (state.floor === 'office' && !isMultiWalkable(layout, state.player)) engine.refreshEnvironment();
  engine.dispatch({ type: 'enter', name: initial.name, avatar: initial.avatar, rank: normalizeRank(initial.rank) });
  // Keep stable membership metadata on the public actor for existing callers.
  const player = state.player as Actor & { seatIndex: number; lastSeen: number };
  player.seatIndex = seatIndex; player.lastSeen = initial.lastSeen;
  const setLayout = (nextCapacity: number, nextSeat: number) => {
    const changed = layout.capacity !== nextCapacity || seatIndex !== nextSeat;
    seatIndex = nextSeat; player.seatIndex = nextSeat;
    if (!changed) return;
    layout = createMultiLayout(nextCapacity); autoInteract = null; axis = { x: 0, z: 0 };
    engine.refreshEnvironment();
  };
  const serializePlayer = (): RoomPlayerUpdate => ({
    x: player.x, z: player.z, angle: player.angle, pose: player.pose, moving: player.moving,
    floor: state.floor, seat: state.seat, restSeatId: state.restSeatId ?? null, deskMode: state.deskMode, roofRest: state.roofRest, roofWallSide: state.roofWallSide,
    candyInMouth: state.candyInMouth, activity: state.activity ? { ...state.activity } : null, weapon: state.weapon,
    elapsed: state.elapsed, lastHit: state.lastHit ? { ...state.lastHit } : null, carryingCoffee: state.inventory.coffee > 0,
  });
  const dispatch = (command: Command) => { autoInteract = null; engine.dispatch(command); };
  return {
    engine, player, get layout() { return layout; }, setLayout, serializePlayer,
    rejectRestSeat: (expectedId?: string | null) => engine.rejectRestSeat(expectedId),
    serializeBoss(): RoomBossUpdate | undefined {
      return hostAuthority ? { actor: { ...state.boss }, phase: state.bossPhase } : undefined;
    },
    applySnapshot(snapshot: RoomSnapshot) {
      if (snapshot.serverTime < lastAppliedTime) return;
      lastAppliedTime = snapshot.serverTime;
      const self = snapshot.players.find(p => p.id === initial.id); if (!self) return;
      const wasHost = hostAuthority;
      hostAuthority = snapshot.room.hostId === initial.id; latestSnapshot = snapshot;
      setLayout(snapshot.room.capacity, self.seatIndex);
      if (state.floor === 'office' && !isMultiWalkable(layout, player)) {
        engine.refreshEnvironment();
        if (self.floor === 'office' && !self.seat && isMultiWalkable(layout, self)) Object.assign(player, { x: self.x, z: self.z });
      }
      if (state.restSeatId && snapshot.players.some(peer => peer.id !== initial.id && peer.floor === state.floor
        && (peer.seat === 'lounge' || peer.seat === 'roof-bench')
        && (peer.restSeatId === state.restSeatId || Math.hypot(peer.x - player.x, peer.z - player.z) < .5))) engine.rejectRestSeat(state.restSeatId);
      player.lastSeen = self.lastSeen; player.rank = state.rank = normalizeRank(self.rank);
      player.name = state.name = self.name; player.avatar = self.avatar ?? 'short';
      const shared = snapshot.boss;
      if (!shared) return;
      const newHit = shared.lastHit && shared.lastHit.id !== lastBossHit;
      const hit = newHit && shared.lastHit ? { id: shared.lastHit.id, weapon: shared.lastHit.weapon,
        at: state.elapsed - Math.max(0, snapshot.serverTime - shared.lastHit.at) / 1000 } : null;
      if (newHit && shared.lastHit) lastBossHit = shared.lastHit.id;
      // A host keeps its responsive local patrol, but adopts the exact shared
      // point on takeover or an accepted hit, which also freezes that patrol.
      const replacePosition = !initializedBoss || !hostAuthority || !wasHost || !!newHit;
      const sharedActor = isMultiWalkable(layout, shared.actor) ? shared.actor : { ...shared.actor, ...layout.boss, pose: 'idle' as const, moving: false };
      engine.applyBossState({ ...sharedActor, rank: normalizeRank(snapshot.room.bossRank ?? sharedActor.rank, '부장') }, shared.phase, hit, replacePosition);
      initializedBoss = true;
    },
    move(point: Point) { dispatch({ type: 'move', point }); },
    sit(_work = false) { dispatch({ type: 'select', target: 'desk' }); autoInteract = 'desk'; },
    stand() { dispatch({ type: 'stand' }); },
    coffee() { dispatch({ type: 'select', target: 'coffee' }); autoInteract = 'coffee'; },
    rest() { dispatch({ type: 'select', target: 'lounge' }); },
    setAxis(next: Point) {
      if (next.x === axis.x && next.z === axis.z) return;
      axis = { ...next }; if (axis.x || axis.z) autoInteract = null;
      engine.dispatch({ type: 'axis', x: next.x, z: next.z });
    },
    step(dt: number) {
      engine.step(dt);
      if (autoInteract && state.target === autoInteract && state.ready && !state.player.moving) {
        autoInteract = null; engine.dispatch({ type: 'interact' });
      }
    },
  };
}
