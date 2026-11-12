import type { Actor, AvatarStyle, GameState, Pose, Weapon } from './types.ts';

export type RoomPose = Pose;
/** Only the visible activity crosses the network; inventory and personal work stay private. */
export type RoomVisualState = Pick<GameState, 'floor' | 'seat' | 'restSeatId' | 'deskMode' | 'roofRest' | 'roofWallSide' | 'candyInMouth' | 'activity' | 'weapon' | 'elapsed' | 'lastHit'> & { carryingCoffee: boolean };
export type RoomPlayer = Actor & RoomVisualState & { seatIndex: number; lastSeen: number };
export type RoomBossUpdate = { actor: Actor; phase: GameState['bossPhase'] };
export type RoomBoss = RoomBossUpdate & { lastHit: { id: number; weapon: Weapon; at: number; playerId: string } | null; updatedAt: number };
export type RoomMessage = { id: number; playerId: string; name: string; text: string; createdAt: number };
export type RoomNotification = { id: number; senderId: string; senderName: string; createdAt: number; readAt: number | null };
export type RoomSession = { code: string; token: string; playerId: string };
export type RoomSnapshot = {
  room: { code: string; name: string; capacity: number; hostId: string; expiresAt: number };
  selfId: string;
  players: RoomPlayer[];
  boss: RoomBoss;
  messages: RoomMessage[];
  notifications: RoomNotification[];
  serverTime: number;
};
export type RoomPlayerUpdate = Pick<RoomPlayer, 'x' | 'z' | 'angle' | 'pose' | 'moving'> & RoomVisualState;
export type RoomRequest =
  | { action: 'create'; name: string; roomName: string; capacity: number; avatar?: AvatarStyle }
  | { action: 'join'; code: string; name: string; avatar?: AvatarStyle }
  | ({ code: string; token: string } & (
    | { action: 'sync'; player?: RoomPlayerUpdate; boss?: RoomBossUpdate }
    | { action: 'attack'; weapon: Weapon; player?: RoomPlayerUpdate }
    | { action: 'chat'; text: string }
    | { action: 'poke'; targetId: string }
    | { action: 'readNotifications'; throughId: number }
    | { action: 'capacity'; capacity: number }
    | { action: 'leave' }
  ));
export type RoomResponse = { session: RoomSession; snapshot: RoomSnapshot } | { snapshot: RoomSnapshot } | { left: true };
export type RoomError = { error: string; code: string };
