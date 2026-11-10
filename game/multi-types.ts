import type { Actor, AvatarStyle } from './types.ts';

export type RoomPose = 'idle' | 'walk' | 'sit' | 'type' | 'drink';
export type RoomPlayer = Omit<Actor, 'pose'> & { pose: RoomPose; seatIndex: number; lastSeen: number };
export type RoomMessage = { id: number; playerId: string; name: string; text: string; createdAt: number };
export type RoomNotification = { id: number; senderId: string; senderName: string; createdAt: number; readAt: number | null };
export type RoomSession = { code: string; token: string; playerId: string };
export type RoomSnapshot = {
  room: { code: string; name: string; capacity: number; hostId: string; expiresAt: number };
  selfId: string;
  players: RoomPlayer[];
  messages: RoomMessage[];
  notifications: RoomNotification[];
  serverTime: number;
};
export type RoomPlayerUpdate = Pick<RoomPlayer, 'x' | 'z' | 'angle' | 'pose' | 'moving'>;
export type RoomRequest =
  | { action: 'create'; name: string; roomName: string; capacity: number; avatar?: AvatarStyle }
  | { action: 'join'; code: string; name: string; avatar?: AvatarStyle }
  | ({ code: string; token: string } & (
    | { action: 'sync'; player?: RoomPlayerUpdate }
    | { action: 'chat'; text: string }
    | { action: 'poke'; targetId: string }
    | { action: 'readNotifications'; throughId: number }
    | { action: 'capacity'; capacity: number }
    | { action: 'leave' }
  ));
export type RoomResponse = { session: RoomSession; snapshot: RoomSnapshot } | { snapshot: RoomSnapshot } | { left: true };
export type RoomError = { error: string; code: string };
