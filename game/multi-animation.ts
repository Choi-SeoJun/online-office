import type { GameState } from './types.ts';
import type { RoomPlayer } from './multi-types.ts';
import { SPLASH_LANDINGS } from './weather-play-motion.ts';

/** Reconstruct only what a colleague can see, without sharing their inventory or work. */
export function remoteAnimationState(game: GameState, player: RoomPlayer, serverNow: number): GameState {
  const age = Math.max(0, Math.min(30, (serverNow - player.lastSeen) / 1000));
  const weatherAge = Math.max(0, (serverNow - player.lastSeen) / 1000);
  const activity = player.activity ? { ...player.activity, remaining: Math.max(0, player.activity.remaining - age) } : null;
  const actor = { ...player };
  let snowballReady = !!player.snowballReady;
  let weatherEffect = player.weatherEffect && player.weatherEffect.remaining > weatherAge ? { ...player.weatherEffect, remaining: player.weatherEffect.remaining - weatherAge } : null;
  // Room updates arrive less often than a water burst lasts. Advance the same
  // action timeline locally so colleagues see every footfall and ball release.
  const action = player.floor === 'rooftop' && !player.moving && !player.seat ? player.activity : null;
  if (action) {
    const elapsed = action.duration - action.remaining + weatherAge;
    if (action.kind === 'make-snowball' && elapsed >= action.duration) snowballReady = true;
    if (action.kind === 'snowball' && elapsed >= action.duration * .55) snowballReady = false;
    if (!weatherEffect && (action.kind === 'splash' || action.kind === 'snowball')) {
      const landings = action.kind === 'splash' ? SPLASH_LANDINGS : [.55];
      const duration = action.kind === 'splash' ? .65 : .9;
      const release = [...landings].reverse().find(progress => elapsed >= action.duration * progress);
      const remaining = release === undefined ? 0 : duration - (elapsed - action.duration * release);
      if (remaining > 0) weatherEffect = { id: 1, kind: action.kind, duration, remaining, x: player.x, z: player.z, angle: player.angle };
    }
  }
  if (activity && activity.remaining === 0) {
    actor.pose = player.roofRest === 'wall' ? 'wallLean' : player.seat === 'desk' ? player.deskMode === 'sleep' ? 'sleep' : 'type' : player.seat ? 'sit' : 'idle';
  }
  return {
    ...game,
    name: player.name, player: actor, floor: player.floor, transition: null,
    elapsed: player.elapsed + age, target: null, ready: false,
    seat: player.seat, restSeatId: player.restSeatId ?? null, deskMode: player.deskMode,
    roofRest: player.roofRest, roofWallSide: player.roofWallSide,
    roofLeanPoint: player.roofRest === 'wall' ? { x: player.x, z: player.z } : null,
    candyInMouth: player.candyInMouth || !!(activity?.kind === 'candy' && !activity.remaining),
    snowballReady,
    activity: activity?.remaining ? activity : null,
    weatherCreations: (player.weatherCreations ?? []).map(creation => ({ ...creation, remaining: creation.remaining - weatherAge })).filter(creation => creation.remaining > 0),
    weatherEffect,
    inventory: { coffee: player.carryingCoffee ? 1 : 0, cookie: 0, choco: 0, cracker: 0 },
    weapon: player.weapon, lastHit: player.lastHit, warning: 0, scold: 0,
    destination: null, event: null, message: '', messageUntil: 0,
  };
}
