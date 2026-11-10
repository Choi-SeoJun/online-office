import type { GameState } from './types.ts';
import type { RoomPlayer } from './multi-types.ts';

/** Reconstruct only what a colleague can see, without sharing their inventory or work. */
export function remoteAnimationState(game: GameState, player: RoomPlayer, serverNow: number): GameState {
  const age = Math.max(0, Math.min(30, (serverNow - player.lastSeen) / 1000));
  const activity = player.activity ? { ...player.activity, remaining: Math.max(0, player.activity.remaining - age) } : null;
  const actor = { ...player };
  if (activity && activity.remaining === 0) {
    actor.pose = player.roofRest === 'wall' ? 'wallLean' : player.seat === 'desk' ? player.deskMode === 'sleep' ? 'sleep' : 'type' : player.seat ? 'sit' : 'idle';
  }
  return {
    ...game,
    name: player.name, player: actor, floor: player.floor, transition: null,
    elapsed: player.elapsed + age, target: null, ready: false,
    seat: player.seat, deskMode: player.deskMode,
    roofRest: player.roofRest, roofWallSide: player.roofWallSide,
    roofLeanPoint: player.roofRest === 'wall' ? { x: player.x, z: player.z } : null,
    candyInMouth: player.candyInMouth || !!(activity?.kind === 'candy' && !activity.remaining),
    activity: activity?.remaining ? activity : null,
    inventory: { coffee: player.carryingCoffee ? 1 : 0, cookie: 0, choco: 0, cracker: 0 },
    weapon: player.weapon, lastHit: player.lastHit, warning: 0, scold: 0,
    destination: null, event: null, message: '', messageUntil: 0,
  };
}
