import { createMultiLayout, isMultiWalkable } from '../game/multi-layout.ts';
import type { RoomError, RoomPlayerUpdate, RoomPose, RoomResponse, RoomSession, RoomSnapshot } from '../game/multi-types.ts';

export type RoomDatabase = Pick<D1Database, 'prepare' | 'batch'>;
export const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const ROOM_SEAT_LEASE_MS = 120_000;
type RoomRow = { code: string; name: string; capacity: number; host_id: string; created_at: number; expires_at: number };
type MemberRow = { id: string; room_code: string; token_hash: string; seat_index: number; name: string; x: number; z: number; angle: number; pose: RoomPose; moving: number; joined_at: number; last_seen: number; last_sync: number; last_chat: number };
type MessageRow = { id: number; player_id: string; name: string; text: string; created_at: number };
type Context = { now?: number; rateKey?: string };
type Result = { status: number; body: RoomResponse | RoomError };

class RoomFailure extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
function fail(status: number, code: string, message: string): never { throw new RoomFailure(status, code, message); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'INVALID_REQUEST', '입력 내용을 확인해 주세요.');
  return value as Record<string, unknown>;
}
function label(value: unknown, max: number, field: string): string {
  if (typeof value !== 'string') fail(400, 'INVALID_REQUEST', `${field}을 확인해 주세요.`);
  const text = value.trim();
  if (!text || Array.from(text).length > max || /[\u0000-\u001f\u007f]/.test(text)) fail(400, 'INVALID_REQUEST', `${field}은 1~${max}자로 입력해 주세요.`);
  return text;
}
function chatText(value: unknown): string {
  if (typeof value !== 'string') fail(400, 'INVALID_REQUEST', '대화 내용을 확인해 주세요.');
  const text = value.replace(/\r\n?/g, '\n').trim();
  if (!text || Array.from(text).length > 200 || /[\u0000-\u0009\u000b-\u001f\u007f]/.test(text)) fail(400, 'INVALID_REQUEST', '대화는 1~200자로 입력해 주세요.');
  return text;
}
function capacityValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 2 || value > 16) fail(400, 'INVALID_REQUEST', '정원은 2~16명 사이로 골라 주세요.');
  return value;
}
function roomCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-HJ-NP-Z2-9]{8}$/.test(value.trim().toUpperCase())) fail(400, 'INVALID_REQUEST', '8자리 참여 코드를 확인해 주세요.');
  return value.trim().toUpperCase();
}
export async function hashRoomToken(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function secret(): string { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); }
function newCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => alphabet[byte % alphabet.length]).join('');
}
const transferHost = (db: RoomDatabase, code: string, now: number) => db.prepare(`UPDATE office_rooms SET host_id = COALESCE((SELECT id FROM office_members WHERE room_code = ? AND last_seen >= ? ORDER BY joined_at, seat_index LIMIT 1), '') WHERE code = ? AND NOT EXISTS (SELECT 1 FROM office_members WHERE room_code = ? AND id = office_rooms.host_id AND last_seen >= ?)`).bind(code, now - ROOM_SEAT_LEASE_MS, code, code, now - ROOM_SEAT_LEASE_MS);

async function snapshot(db: RoomDatabase, code: string, selfId: string, now: number): Promise<RoomSnapshot> {
  const [rooms, members, messages] = await db.batch([
    db.prepare('SELECT * FROM office_rooms WHERE code = ?').bind(code),
    db.prepare('SELECT id, name, seat_index, x, z, angle, pose, moving, last_seen FROM office_members WHERE room_code = ? AND last_seen >= ? ORDER BY seat_index LIMIT 16').bind(code, now - ROOM_SEAT_LEASE_MS),
    db.prepare('SELECT id, player_id, name, text, created_at FROM office_messages WHERE room_code = ? ORDER BY id DESC LIMIT 100').bind(code),
  ]);
  const room = rooms.results[0] as RoomRow | undefined;
  if (!room || room.expires_at <= now) fail(410, 'ROOM_EXPIRED', '이 회사의 하루가 끝났어요. 새 방을 만들어 주세요.');
  return {
    room: { code: room.code, name: room.name, capacity: room.capacity, hostId: room.host_id, expiresAt: room.expires_at }, selfId, serverTime: now,
    players: (members.results as unknown as MemberRow[]).map(m => ({ id: m.id, name: m.name, seatIndex: m.seat_index, x: m.x, z: m.z, angle: m.angle, pose: m.pose, moving: !!m.moving, lastSeen: m.last_seen })),
    messages: (messages.results as unknown as MessageRow[]).reverse().map(m => ({ id: m.id, playerId: m.player_id, name: m.name, text: m.text, createdAt: m.created_at })),
  };
}
async function admissionLimit(db: RoomDatabase, action: 'create' | 'join', key: string, now: number) {
  const window = action === 'create' ? 3_600_000 : 60_000, maximum = action === 'create' ? 10 : 60;
  const rate = await db.prepare(`INSERT INTO office_rate_limits (key, hits, resets_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET hits = CASE WHEN resets_at <= ? THEN 1 ELSE hits + 1 END, resets_at = CASE WHEN resets_at <= ? THEN ? ELSE resets_at END RETURNING hits`).bind(`${action}:${key}`, now + window, now, now, now + window).first<{ hits: number }>();
  if (!rate || rate.hits > maximum) fail(429, 'RATE_LIMITED', '잠깐 쉬었다가 다시 시도해 주세요.');
}
async function authenticate(db: RoomDatabase, input: Record<string, unknown>, now: number) {
  const code = roomCode(input.code);
  if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) fail(401, 'SESSION_EXPIRED', '참여 정보를 확인할 수 없어요. 다시 입장해 주세요.');
  const room = await db.prepare('SELECT * FROM office_rooms WHERE code = ?').bind(code).first<RoomRow>();
  if (!room) fail(404, 'ROOM_NOT_FOUND', '이 참여 코드의 회사를 찾지 못했어요.');
  if (room.expires_at <= now) fail(410, 'ROOM_EXPIRED', '이 회사의 하루가 끝났어요. 새 방을 만들어 주세요.');
  const tokenHash = await hashRoomToken(input.token);
  const member = await db.prepare('SELECT * FROM office_members WHERE room_code = ? AND token_hash = ?').bind(code, tokenHash).first<MemberRow>();
  if (!member) fail(401, 'SESSION_EXPIRED', '자리가 비워졌어요. 참여 코드로 다시 입장해 주세요.');
  return { code, room, member, tokenHash };
}
function playerValue(input: unknown, room: RoomRow, member: MemberRow): RoomPlayerUpdate {
  const value = object(input), { x, z, angle, pose, moving } = value;
  if (typeof x !== 'number' || typeof z !== 'number' || typeof angle !== 'number' || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(angle) || typeof moving !== 'boolean' || !['idle', 'walk', 'sit', 'type', 'drink'].includes(String(pose))) fail(400, 'INVALID_REQUEST', '캐릭터 위치를 확인해 주세요.');
  const layout = createMultiLayout(room.capacity);
  if (!isMultiWalkable(layout, { x, z })) fail(400, 'INVALID_REQUEST', '걸어갈 수 있는 곳을 골라 주세요.');
  const seated = pose === 'sit' || pose === 'type', seat = layout.desks[member.seat_index].seat;
  if (seated && (moving || Math.hypot(x - seat.x, z - seat.z) > .12)) fail(400, 'INVALID_REQUEST', '내 자리에 앉아 주세요.');
  return { x, z, angle: Math.atan2(Math.sin(angle), Math.cos(angle)), pose: pose as RoomPose, moving };
}

export async function handleRoomAction(db: RoomDatabase, raw: unknown, context: Context = {}): Promise<Result> {
  const now = context.now ?? Date.now();
  try {
    const input = object(raw), action = input.action;
    if (!['create', 'join', 'sync', 'chat', 'capacity', 'leave'].includes(String(action))) fail(400, 'INVALID_REQUEST', '요청한 행동을 확인해 주세요.');
    if (action === 'create') {
      const name = label(input.name, 10, '이름'), roomName = label(input.roomName, 24, '회사 이름'), capacity = capacityValue(input.capacity);
      await admissionLimit(db, 'create', context.rateKey ?? 'unknown', now);
      await db.batch([
        db.prepare('DELETE FROM office_rooms WHERE code IN (SELECT code FROM office_rooms WHERE expires_at <= ? LIMIT 20)').bind(now),
        db.prepare('DELETE FROM office_rate_limits WHERE key IN (SELECT key FROM office_rate_limits WHERE resets_at <= ? LIMIT 20)').bind(now),
      ]);
      const token = secret(), tokenHash = await hashRoomToken(token), id = crypto.randomUUID(), spawn = createMultiLayout(capacity).spawn;
      for (let retry = 0; retry < 4; retry++) {
        const code = newCode();
        if (await db.prepare('SELECT code FROM office_rooms WHERE code = ?').bind(code).first()) continue;
        try {
          await db.batch([
            db.prepare('INSERT INTO office_rooms (code, name, capacity, host_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)').bind(code, roomName, capacity, id, now, now + ROOM_LIFETIME_MS),
            db.prepare("INSERT INTO office_members (id, room_code, token_hash, seat_index, name, x, z, angle, pose, moving, joined_at, last_seen, last_sync, last_chat) VALUES (?, ?, ?, 0, ?, ?, ?, 0, 'idle', 0, ?, ?, 0, 0)").bind(id, code, tokenHash, name, spawn.x, spawn.z, now, now),
          ]);
        } catch (error) {
          if (String(error).includes('office_rooms.code') && retry < 3) continue;
          throw error;
        }
        return { status: 201, body: { session: { code, token, playerId: id }, snapshot: await snapshot(db, code, id, now) } };
      }
      fail(503, 'TRY_AGAIN', '방을 준비하지 못했어요. 한 번 더 시도해 주세요.');
    }
    if (action === 'join') {
      const code = roomCode(input.code), name = label(input.name, 10, '이름');
      await admissionLimit(db, 'join', context.rateKey ?? 'unknown', now);
      const room = await db.prepare('SELECT * FROM office_rooms WHERE code = ?').bind(code).first<RoomRow>();
      if (!room) fail(404, 'ROOM_NOT_FOUND', '이 참여 코드의 회사를 찾지 못했어요.');
      if (room.expires_at <= now) fail(410, 'ROOM_EXPIRED', '이 회사의 하루가 끝났어요. 새 방을 만들어 주세요.');
      const token = secret(), tokenHash = await hashRoomToken(token), id = crypto.randomUUID(), spawn = createMultiLayout(room.capacity).spawn;
      const results = await db.batch([
        db.prepare('DELETE FROM office_members WHERE room_code = ? AND last_seen < ?').bind(code, now - ROOM_SEAT_LEASE_MS),
        db.prepare(`WITH RECURSIVE seats(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seats WHERE n < 15)
          INSERT INTO office_members (id, room_code, token_hash, seat_index, name, x, z, angle, pose, moving, joined_at, last_seen, last_sync, last_chat)
          SELECT ?, r.code, ?, seats.n, ?, ?, ?, 0, 'idle', 0, ?, ?, 0, 0 FROM office_rooms r CROSS JOIN seats
          WHERE r.code = ? AND r.expires_at > ? AND seats.n < r.capacity AND NOT EXISTS (SELECT 1 FROM office_members m WHERE m.room_code = r.code AND m.seat_index = seats.n)
          ORDER BY seats.n LIMIT 1 RETURNING id`).bind(id, tokenHash, name, spawn.x, spawn.z, now, now, code, now),
        transferHost(db, code, now),
      ]);
      if (!results[1].results.length) fail(409, 'ROOM_FULL', '자리가 모두 찼어요. 방장에게 정원을 늘려 달라고 해 주세요.');
      const session: RoomSession = { code, token, playerId: id };
      return { status: 201, body: { session, snapshot: await snapshot(db, code, id, now) } };
    }
    const { code, member, room, tokenHash } = await authenticate(db, input, now);
    if (action === 'sync') {
      const p = input.player === undefined ? member : playerValue(input.player, room, member);
      const [result] = await db.batch([
        db.prepare('UPDATE office_members SET x = ?, z = ?, angle = ?, pose = ?, moving = ?, last_seen = ?, last_sync = ? WHERE id = ? AND room_code = ? AND token_hash = ? AND last_sync <= ? AND EXISTS (SELECT 1 FROM office_rooms WHERE code = ? AND capacity = ?) RETURNING id').bind(p.x, p.z, p.angle, p.pose, p.moving ? 1 : 0, now, now, member.id, code, tokenHash, now - 250, code, room.capacity),
        transferHost(db, code, now),
      ]);
      if (!result.results.length) {
        const current = await db.prepare('SELECT capacity FROM office_rooms WHERE code = ?').bind(code).first<{ capacity: number }>();
        if (current?.capacity !== room.capacity) return { status: 200, body: { snapshot: await snapshot(db, code, member.id, now) } };
        fail(429, 'RATE_LIMITED', '연결을 확인하고 있어요. 잠시만 기다려 주세요.');
      }
    } else if (action === 'chat') {
      const text = chatText(input.text), requestId = crypto.randomUUID();
      const result = await db.batch([
        db.prepare('INSERT INTO office_messages (request_id, room_code, player_id, name, text, created_at) SELECT ?, room_code, id, name, ?, ? FROM office_members WHERE id = ? AND room_code = ? AND token_hash = ? AND last_chat <= ? RETURNING id').bind(requestId, text, now, member.id, code, tokenHash, now - 1000),
        db.prepare('UPDATE office_members SET last_chat = ?, last_seen = ? WHERE id = ? AND EXISTS (SELECT 1 FROM office_messages WHERE request_id = ?)').bind(now, now, member.id, requestId),
        db.prepare('DELETE FROM office_messages WHERE room_code = ? AND id NOT IN (SELECT id FROM office_messages WHERE room_code = ? ORDER BY id DESC LIMIT 100)').bind(code, code),
        transferHost(db, code, now),
      ]);
      if (!result[0].results.length) fail(429, 'RATE_LIMITED', '한 박자 쉬고 이야기해 주세요.');
    } else if (action === 'capacity') {
      const capacity = capacityValue(input.capacity);
      if (room.host_id !== member.id) fail(403, 'NOT_HOST', '정원은 방장만 바꿀 수 있어요.');
      const { bounds, spawn, obstacles } = createMultiLayout(capacity);
      // The same footprint validates movement and relocates anyone beneath a new desk.
      const blocked = obstacles.map(() => '(ABS(x - ?) < ? AND ABS(z - ?) < ?)').join(' OR ');
      const obstacleValues = obstacles.flatMap(o => [o.x, o.w / 2 + .24, o.z, o.d / 2 + .24]);
      const result = await db.batch([
        db.prepare('DELETE FROM office_members WHERE room_code = ? AND last_seen < ? AND id != ?').bind(code, now - ROOM_SEAT_LEASE_MS, member.id),
        db.prepare('UPDATE office_rooms SET capacity = ? WHERE code = ? AND host_id = ? AND NOT EXISTS (SELECT 1 FROM office_members WHERE room_code = ? AND seat_index >= ?) RETURNING code').bind(capacity, code, member.id, code, capacity),
        db.prepare(`UPDATE office_members SET x = ?, z = ?, pose = 'idle', moving = 0 WHERE room_code = ? AND (x < ? OR x > ? OR z < ? OR z > ? OR ${blocked}) AND EXISTS (SELECT 1 FROM office_rooms WHERE code = ? AND capacity = ?)`).bind(spawn.x, spawn.z, code, bounds.minX + .24, bounds.maxX - .24, bounds.minZ + .24, bounds.maxZ - .24, ...obstacleValues, code, capacity),
        db.prepare('UPDATE office_members SET last_seen = ? WHERE id = ? AND token_hash = ?').bind(now, member.id, tokenHash),
      ]);
      if (!result[1].results.length) fail(409, 'CAPACITY_OCCUPIED', '사용 중인 자리가 있어요. 빈 자리만 줄일 수 있어요.');
    } else if (action === 'leave') {
      await db.batch([db.prepare('DELETE FROM office_members WHERE id = ? AND room_code = ? AND token_hash = ?').bind(member.id, code, tokenHash), transferHost(db, code, now)]);
      return { status: 200, body: { left: true } };
    }
    return { status: 200, body: { snapshot: await snapshot(db, code, member.id, now) } };
  } catch (error) {
    if (error instanceof RoomFailure) return { status: error.status, body: { error: error.message, code: error.code } };
    throw error;
  }
}
