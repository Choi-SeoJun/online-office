import { createMultiLayout, isMultiWalkable } from '../game/multi-layout.ts';
import type { RoomBoss, RoomBossUpdate, RoomError, RoomPlayerUpdate, RoomPose, RoomResponse, RoomSession, RoomSnapshot, RoomVisualState } from '../game/multi-types.ts';
import type { AvatarStyle, Floor, GameState, Point, Weapon } from '../game/types.ts';
import { ROOF_BOUNDS, ROOF_OBSTACLES, ROOF_REST, WEAPONS } from '../game/layout.ts';
import { getRoofLean } from '../game/roof-rest.ts';
import { MULTI_LOUNGE_SEATS, restSeatAt, restSeatById } from '../game/rest-seats.ts';
import { JOB_RANKS, bossName, employeeLabel, normalizeRank, type JobRank } from '../game/ranks.ts';

export type RoomDatabase = Pick<D1Database, 'prepare' | 'batch'>;
export const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const ROOM_SEAT_LEASE_MS = 120_000;
type RoomRow = { code: string; name: string; capacity: number; host_id: string; created_at: number; expires_at: number; boss_rank: JobRank; boss_state: string | null; boss_hit: string | null; boss_hit_id: number };
type MemberRow = { id: string; room_code: string; token_hash: string; seat_index: number; name: string; rank: JobRank; avatar: AvatarStyle; x: number; z: number; angle: number; pose: RoomPose; moving: number; joined_at: number; last_seen: number; last_sync: number; last_chat: number; last_poke: number; floor: Floor; visual: string | null; last_attack: number };
type MessageRow = { id: number; player_id: string; name: string; text: string; created_at: number };
type NotificationRow = { id: number; sender_id: string; sender_name: string; created_at: number; read_at: number | null };
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
function avatarValue(value: unknown): AvatarStyle {
  if (value === undefined) return 'short';
  if (value !== 'short' && value !== 'ponytail') fail(400, 'INVALID_REQUEST', '캐릭터를 다시 골라 주세요.');
  return value;
}
function rankValue(value: unknown, fallback: JobRank = '사원'): JobRank {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !JOB_RANKS.includes(value as JobRank)) fail(400, 'INVALID_REQUEST', '직급을 다시 골라 주세요.');
  return value as JobRank;
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

const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const releasedRestX = `CASE WHEN floor = 'office' THEN x + CASE COALESCE(json_extract(visual, '$.restSeatId'), 'lounge-south') WHEN 'lounge-south' THEN .8 WHEN 'lounge-north' THEN -.8 ELSE 0 END ELSE x END`;
const releasedRestZ = `CASE WHEN floor = 'rooftop' THEN z + .7 ELSE z + CASE json_extract(visual, '$.restSeatId') WHEN 'lounge-east' THEN -.8 WHEN 'lounge-west' THEN .8 ELSE 0 END END`;
const releasedRestVisual = `json_set(visual, '$.seat', NULL, '$.restSeatId', NULL, '$.roofRest', NULL, '$.roofWallSide', NULL, '$.deskMode', NULL, '$.activity', NULL)`;
const sharedSeatConflict = `json_extract(visual, '$.seat') IN ('lounge', 'roof-bench') AND EXISTS (
  SELECT 1 FROM office_members occupied WHERE occupied.room_code = office_members.room_code AND occupied.id != office_members.id
    AND occupied.last_seen >= ? AND occupied.floor = office_members.floor
    AND json_extract(occupied.visual, '$.seat') = json_extract(office_members.visual, '$.seat')
    AND (json_extract(occupied.visual, '$.restSeatId') = json_extract(office_members.visual, '$.restSeatId')
      OR (ABS(occupied.x - office_members.x) <= .24 AND ABS(occupied.z - office_members.z) <= .24)))`;
// All non-sync heartbeats use the same atomic conflict check. An old request
// that finishes after lease expiry must not revive a chair claimed meanwhile.
const safeRestRenewal = `x = CASE WHEN ${sharedSeatConflict} THEN ${releasedRestX} ELSE x END,
  z = CASE WHEN ${sharedSeatConflict} THEN ${releasedRestZ} ELSE z END,
  pose = CASE WHEN ${sharedSeatConflict} THEN 'idle' ELSE pose END,
  moving = CASE WHEN ${sharedSeatConflict} THEN 0 ELSE moving END,
  visual = CASE WHEN ${sharedSeatConflict} THEN ${releasedRestVisual} ELSE visual END`;
const restRenewalCutoffs = (now: number) => Array<number>(5).fill(now - ROOM_SEAT_LEASE_MS);
const visualDefaults = (floor: Floor = 'office'): RoomVisualState => ({ floor, seat: null, restSeatId: null, deskMode: null, roofRest: null, roofWallSide: null, candyInMouth: false, activity: null, weapon: 'punch', elapsed: 0, lastHit: null, carryingCoffee: false });
function memberVisual(member: MemberRow): RoomVisualState {
  if (member.visual) {
    const visual = { ...visualDefaults(member.floor), ...JSON.parse(member.visual), floor: member.floor } as RoomVisualState;
    if (visual.seat === 'lounge' || visual.seat === 'roof-bench') {
      visual.restSeatId ??= restSeatAt(member, member.floor, MULTI_LOUNGE_SEATS)?.id ?? null;
      // Pre-ID records still refer to the four chairs in the previous layout.
      if (visual.seat === 'lounge' && member.floor === 'office') visual.restSeatId ??= [
        { id: 'lounge-south', x: -4.7, z: 2.7 }, { id: 'lounge-east', x: -3.55, z: 1.55 },
        { id: 'lounge-north', x: -4.7, z: .4 }, { id: 'lounge-west', x: -5.85, z: 1.55 },
      ].find(seat => gap(member, seat) <= .12)?.id ?? null;
    }
    return visual;
  }
  const value = visualDefaults(member.floor);
  // Existing room members keep the meaning of their pre-migration seated pose.
  if (member.floor === 'office' && ['sit', 'type'].includes(member.pose)) { value.seat = 'desk'; value.deskMode = member.pose === 'type' ? 'work' : null; }
  return value;
}
function visualOnly(player: RoomPlayerUpdate): RoomVisualState {
  const { floor, seat, restSeatId, deskMode, roofRest, roofWallSide, candyInMouth, activity, weapon, elapsed, lastHit, carryingCoffee } = player;
  return { floor, seat, restSeatId: restSeatId ?? null, deskMode, roofRest, roofWallSide, candyInMouth, activity, weapon, elapsed, lastHit, carryingCoffee };
}
function sharedBoss(room: RoomRow, now: number): RoomBoss {
  const layout = createMultiLayout(room.capacity), point = layout.boss;
  const rank = normalizeRank(room.boss_rank, '부장');
  const stored = room.boss_state ? JSON.parse(room.boss_state) as RoomBossUpdate & { updatedAt: number } : null;
  const lastHit = room.boss_hit ? { ...JSON.parse(room.boss_hit), id: room.boss_hit_id } as NonNullable<RoomBoss['lastHit']> : null;
  const obstructed = !!stored && !isMultiWalkable(layout, stored.actor);
  const actor = !stored || obstructed ? { id: 'boss', name: bossName(rank), rank, ...point, angle: 0, pose: 'idle' as const, moving: false } : stored.actor;
  const age = lastHit ? now - lastHit.at : Infinity;
  const phase = age < 2000 ? 'hit' : age < 2600 ? 'recover' : obstructed || stored?.phase === 'hit' || stored?.phase === 'recover' ? 'routine' : stored?.phase ?? 'routine';
  return { actor: { ...actor, id: 'boss', name: bossName(rank), rank, ...(phase === 'hit' ? { pose: 'hit', moving: false } : actor.pose === 'hit' ? { pose: 'idle', moving: false } : {}) }, phase,
    lastHit: lastHit ? { id: lastHit.id, playerId: lastHit.playerId, weapon: lastHit.weapon, at: lastHit.at } : null, updatedAt: stored?.updatedAt ?? room.created_at };
}

async function repairRoomLayout(db: RoomDatabase, room: RoomRow, now: number) {
  const layout = createMultiLayout(room.capacity);
  const result = await db.prepare("SELECT * FROM office_members WHERE room_code = ? AND floor = 'office'").bind(room.code).all<MemberRow>();
  const repairs: D1PreparedStatement[] = [];
  for (const member of result.results) {
    const visual = memberVisual(member);
    let point: Point = member, angle = member.angle, pose = member.pose, moving = member.moving, savedVisual = member.visual;
    const seat = visual.seat === 'lounge' ? restSeatById(visual.restSeatId, layout.loungeSeats) : undefined;
    if (seat?.floor === 'office') {
      point = seat.seat; angle = seat.angle; moving = 0; savedVisual = JSON.stringify(visual);
    } else if (!isMultiWalkable(layout, member) || visual.seat === 'lounge') {
      point = layout.spawn; pose = 'idle'; moving = 0;
      savedVisual = JSON.stringify({ ...visual, seat: null, restSeatId: null, deskMode: null, roofRest: null, roofWallSide: null, activity: null });
    }
    if (point.x === member.x && point.z === member.z && angle === member.angle && pose === member.pose && moving === member.moving && savedVisual === member.visual) continue;
    // Never renew a lease or overwrite a move/claim that won while this repair
    // was awaiting D1. The original state and room capacity must still match.
    repairs.push(db.prepare(`UPDATE office_members SET x = ?, z = ?, angle = ?, pose = ?, moving = ?, visual = ?
      WHERE id = ? AND room_code = ? AND floor = 'office' AND x = ? AND z = ? AND angle = ?
        AND pose = ? AND moving = ? AND visual IS ? AND last_seen = ?
        AND EXISTS (SELECT 1 FROM office_rooms WHERE code = ? AND capacity = ?)`)
      .bind(point.x, point.z, angle, pose, moving, savedVisual, member.id, room.code, member.x, member.z, member.angle,
        member.pose, member.moving, member.visual, member.last_seen, room.code, room.capacity));
  }
  if (room.boss_state && !isMultiWalkable(layout, JSON.parse(room.boss_state).actor)) {
    const boss = sharedBoss(room, now);
    repairs.push(db.prepare('UPDATE office_rooms SET boss_state = ? WHERE code = ? AND capacity = ? AND boss_state = ? AND boss_hit_id = ?')
      .bind(JSON.stringify({ actor: boss.actor, phase: boss.phase, updatedAt: now }), room.code, room.capacity, room.boss_state, room.boss_hit_id));
  }
  if (repairs.length) await db.batch(repairs);
  return repairs.length > 0;
}

async function snapshot(db: RoomDatabase, code: string, selfId: string, now: number): Promise<RoomSnapshot> {
  const [rooms, members, messages, notifications] = await db.batch([
    db.prepare('SELECT * FROM office_rooms WHERE code = ?').bind(code),
    db.prepare('SELECT id, name, rank, avatar, seat_index, x, z, angle, pose, moving, last_seen, floor, visual FROM office_members WHERE room_code = ? AND last_seen >= ? ORDER BY seat_index LIMIT 16').bind(code, now - ROOM_SEAT_LEASE_MS),
    db.prepare('SELECT id, player_id, name, text, created_at FROM office_messages WHERE room_code = ? ORDER BY id DESC LIMIT 100').bind(code),
    db.prepare('SELECT id, sender_id, sender_name, created_at, read_at FROM office_notifications WHERE room_code = ? AND recipient_id = ? ORDER BY id DESC LIMIT 100').bind(code, selfId),
  ]);
  const room = rooms.results[0] as RoomRow | undefined;
  if (!room || room.expires_at <= now) fail(410, 'ROOM_EXPIRED', '이 회사의 하루가 끝났어요. 새 방을 만들어 주세요.');
  return {
    room: { code: room.code, name: room.name, capacity: room.capacity, hostId: room.host_id, expiresAt: room.expires_at, bossRank: normalizeRank(room.boss_rank, '부장') }, selfId, serverTime: now,
    players: (members.results as unknown as MemberRow[]).map(m => ({ id: m.id, name: m.name, avatar: m.avatar, seatIndex: m.seat_index, x: m.x, z: m.z, angle: m.angle, pose: m.pose, moving: !!m.moving, lastSeen: m.last_seen, ...memberVisual(m), rank: normalizeRank(m.rank) })),
    boss: sharedBoss(room, now),
    messages: (messages.results as unknown as MessageRow[]).reverse().map(m => ({ id: m.id, playerId: m.player_id, name: m.name, text: m.text, createdAt: m.created_at })),
    notifications: (notifications.results as unknown as NotificationRow[]).map(n => ({ id: n.id, senderId: n.sender_id, senderName: n.sender_name, createdAt: n.created_at, readAt: n.read_at })),
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
  let member = await db.prepare('SELECT * FROM office_members WHERE room_code = ? AND token_hash = ?').bind(code, tokenHash).first<MemberRow>();
  if (!member) fail(401, 'SESSION_EXPIRED', '자리가 비워졌어요. 참여 코드로 다시 입장해 주세요.');
  if (await repairRoomLayout(db, room, now)) {
    member = await db.prepare('SELECT * FROM office_members WHERE room_code = ? AND token_hash = ?').bind(code, tokenHash).first<MemberRow>();
    if (!member) fail(401, 'SESSION_EXPIRED', '자리가 비워졌어요. 참여 코드로 다시 입장해 주세요.');
  }
  // Chat/pokes can renew membership too: a stale client must not revive its old
  // shared chair after another member has taken it during the expired lease.
  if (member.last_seen < now - ROOM_SEAT_LEASE_MS && ['lounge', 'roof-bench'].includes(memberVisual(member).seat ?? '')) {
    await db.prepare(`UPDATE office_members SET x = ${releasedRestX}, z = ${releasedRestZ},
      pose = 'idle', moving = 0, visual = ${releasedRestVisual}
      WHERE id = ? AND last_seen < ? AND json_extract(visual, '$.seat') IN ('lounge', 'roof-bench')`).bind(member.id, now - ROOM_SEAT_LEASE_MS).run();
    member = await db.prepare('SELECT * FROM office_members WHERE room_code = ? AND token_hash = ?').bind(code, tokenHash).first<MemberRow>();
    if (!member) fail(401, 'SESSION_EXPIRED', '자리가 비워졌어요. 참여 코드로 다시 입장해 주세요.');
  }
  return { code, room, member, tokenHash };
}
function playerValue(input: unknown, room: RoomRow, member: MemberRow): RoomPlayerUpdate {
  const value = object(input), { x, z, angle, pose, moving } = value;
  if (typeof x !== 'number' || typeof z !== 'number' || typeof angle !== 'number' || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(angle) || typeof moving !== 'boolean' || !['idle', 'walk', 'sit', 'type', 'sleep', 'drink', 'eat', 'brew', 'take', 'spin', 'lean', 'wallLean', 'hit', 'watch', 'scold', 'candy', 'dance'].includes(String(pose))) fail(400, 'INVALID_REQUEST', '캐릭터 위치를 확인해 주세요.');
  const choice = <T extends string | null>(key: string, options: readonly T[], fallback: T): T => {
    if (value[key] === undefined) return fallback;
    if (!options.includes(value[key] as T)) fail(400, 'INVALID_REQUEST', '캐릭터 동작을 확인해 주세요.');
    return value[key] as T;
  };
  const flag = (key: string) => { if (value[key] !== undefined && typeof value[key] !== 'boolean') fail(400, 'INVALID_REQUEST', '캐릭터 동작을 확인해 주세요.'); return value[key] === true; };
  const floor = choice('floor', ['office', 'rooftop'] as const, 'office');
  const seat = choice('seat', ['desk', 'lounge', 'roof-bench', null] as const, pose === 'sit' || pose === 'type' ? 'desk' : null);
  const deskMode = choice('deskMode', ['work', 'shopping', 'game', 'sleep', null] as const, seat === 'desk' ? 'work' : null);
  const roofRest = choice('roofRest', ['bench', 'wall', null] as const, null);
  const roofWallSide = choice('roofWallSide', ['north', 'south', 'east', 'west', null] as const, null);
  const weapon = choice('weapon', ['punch', 'hammer', 'fan'] as const, 'punch');
  const candyInMouth = flag('candyInMouth'), carryingCoffee = flag('carryingCoffee');
  const elapsed = value.elapsed ?? 0;
  if (typeof elapsed !== 'number' || !Number.isFinite(elapsed) || elapsed < 0 || elapsed > 1e9) fail(400, 'INVALID_REQUEST', '동작 시간을 확인해 주세요.');
  let activity: GameState['activity'] = null, lastHit: GameState['lastHit'] = null;
  if (value.activity != null) {
    const a = object(value.activity);
    if (!['brew', 'take', 'eat', 'drink', 'spin', 'candy', 'dance'].includes(String(a.kind)) || typeof a.duration !== 'number' || !Number.isFinite(a.duration) || a.duration < .1 || a.duration > 10 || typeof a.remaining !== 'number' || !Number.isFinite(a.remaining) || a.remaining < 0 || a.remaining > a.duration || (a.snack !== undefined && !['cookie', 'choco', 'cracker'].includes(String(a.snack)))) fail(400, 'INVALID_REQUEST', '동작 시간을 확인해 주세요.');
    activity = { kind: a.kind as NonNullable<GameState['activity']>['kind'], duration: a.duration, remaining: a.remaining, ...(a.snack === undefined ? {} : { snack: a.snack as 'cookie' | 'choco' | 'cracker' }) };
    if (pose !== activity.kind || (['take', 'eat'].includes(activity.kind) && !activity.snack)) fail(400, 'INVALID_REQUEST', '캐릭터 동작을 확인해 주세요.');
  }
  if (value.lastHit != null) {
    const hit = object(value.lastHit);
    if (typeof hit.id !== 'number' || !Number.isSafeInteger(hit.id) || hit.id < 1 || !['punch', 'hammer', 'fan'].includes(String(hit.weapon)) || typeof hit.at !== 'number' || !Number.isFinite(hit.at) || hit.at < 0 || hit.at > elapsed) fail(400, 'INVALID_REQUEST', '장난 동작을 확인해 주세요.');
    lastHit = { id: hit.id, weapon: hit.weapon as Weapon, at: hit.at };
  }
  const layout = createMultiLayout(room.capacity);
  const sharedSeat = seat === 'lounge' || seat === 'roof-bench';
  const restSeat = sharedSeat ? value.restSeatId == null ? restSeatAt({ x, z }, floor, layout.loungeSeats) : typeof value.restSeatId === 'string' ? restSeatById(value.restSeatId, layout.loungeSeats) : undefined : undefined;
  if (sharedSeat && (!restSeat || restSeat.floor !== floor || moving || gap({ x, z }, restSeat.seat) > .12)
    || !sharedSeat && value.restSeatId != null) fail(400, 'INVALID_REQUEST', '비어 있는 휴식 의자를 골라 주세요.');
  const restSeatId = restSeat?.id ?? null;
  if (floor === 'office') {
    if (!isMultiWalkable(layout, { x, z })) fail(400, 'INVALID_REQUEST', '걸어갈 수 있는 곳을 골라 주세요.');
    if (roofRest || roofWallSide || seat === 'roof-bench' || candyInMouth || pose === 'candy' || pose === 'wallLean') fail(400, 'INVALID_REQUEST', '옥상에서 할 수 있는 동작이에요.');
    if (seat === 'desk' && (moving || gap({ x, z }, layout.desks[member.seat_index].seat) > .12)) fail(400, 'INVALID_REQUEST', '내 자리에 앉아 주세요.');
    if (pose === 'brew' && gap({ x, z }, layout.coffee) > 1.25 || pose === 'take' && gap({ x, z }, layout.snacks) > 1.25) fail(400, 'INVALID_REQUEST', '탕비실 가까이 가 주세요.');
  } else {
    if (seat === 'desk' || seat === 'lounge' || deskMode !== null || ['brew', 'take', 'spin', 'type', 'sleep', 'hit', 'watch', 'scold', 'dance'].includes(String(pose))) fail(400, 'INVALID_REQUEST', '사무실에서 할 수 있는 동작이에요.');
    const b = ROOF_BOUNDS;
    if (x < b.minX + .22 || x > b.maxX - .22 || z < b.minZ + .22 || z > b.maxZ - .22) fail(400, 'INVALID_REQUEST', '옥상 안에서 쉬어 주세요.');
    const atBench = seat === 'roof-bench' && roofRest === 'bench' && !!restSeat && !moving;
    if (seat === 'roof-bench' && !atBench || roofRest === 'bench' && !atBench) fail(400, 'INVALID_REQUEST', '벤치에 앉아 주세요.');
    if (!atBench && ROOF_OBSTACLES.some(o => Math.abs(x - o.x) < o.w / 2 + .22 && Math.abs(z - o.z) < o.d / 2 + .22)) fail(400, 'INVALID_REQUEST', '걸어갈 수 있는 곳을 골라 주세요.');
    if (roofRest === 'wall') {
      const lean = roofWallSide ? getRoofLean({ x, z }, roofWallSide) : null;
      if (moving || !lean || gap({ x, z }, lean.point) > .15 || seat !== null) fail(400, 'INVALID_REQUEST', '벽 가까이에 기대 주세요.');
    } else if (roofWallSide || pose === 'wallLean') fail(400, 'INVALID_REQUEST', '벽 가까이에 기대 주세요.');
  }
  if (deskMode !== null && seat !== 'desk' || ['type', 'sleep', 'spin'].includes(String(pose)) && seat !== 'desk' || ['sit', 'lean'].includes(String(pose)) && seat === null) fail(400, 'INVALID_REQUEST', '먼저 자리에 앉아 주세요.');
  if (pose === 'dance' && (seat !== null || moving || !activity || activity.kind !== 'dance')) fail(400, 'INVALID_REQUEST', '일어서서 잠깐 춤춰 주세요.');
  return { x, z, angle: Math.atan2(Math.sin(angle), Math.cos(angle)), pose: pose as RoomPose, moving, floor, seat, restSeatId, deskMode, roofRest, roofWallSide, candyInMouth, activity, weapon, elapsed, lastHit, carryingCoffee };
}

function bossValue(input: unknown, room: RoomRow, now: number): RoomBossUpdate & { updatedAt: number } {
  const value = object(input), actor = object(value.actor), { x, z, angle, pose, moving } = actor;
  if (typeof x !== 'number' || typeof z !== 'number' || typeof angle !== 'number' || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(angle) || typeof moving !== 'boolean' || !['idle', 'walk', 'sit', 'type', 'watch', 'scold', 'hit'].includes(String(pose)) || !['routine', 'watch', 'scold', 'hit', 'recover'].includes(String(value.phase)) || !isMultiWalkable(createMultiLayout(room.capacity), { x, z })) fail(400, 'INVALID_REQUEST', '상사의 위치를 확인해 주세요.');
  const current = sharedBoss(room, now);
  // A delayed host packet must not undo another member's accepted hit.
  if (current.lastHit && now - current.lastHit.at < 2000) return { actor: current.actor, phase: 'hit', updatedAt: now };
  const rank = normalizeRank(room.boss_rank, '부장');
  return { actor: { id: 'boss', name: bossName(rank), rank, x, z, angle: Math.atan2(Math.sin(angle), Math.cos(angle)), pose: pose as RoomPose, moving }, phase: value.phase as GameState['bossPhase'], updatedAt: now };
}

export async function handleRoomAction(db: RoomDatabase, raw: unknown, context: Context = {}): Promise<Result> {
  const now = context.now ?? Date.now();
  try {
    const input = object(raw), action = input.action;
    if (!['create', 'join', 'sync', 'attack', 'chat', 'poke', 'readNotifications', 'capacity', 'leave'].includes(String(action))) fail(400, 'INVALID_REQUEST', '요청한 행동을 확인해 주세요.');
    if (action === 'create') {
      const name = label(input.name, 10, '이름'), roomName = label(input.roomName, 24, '회사 이름'), capacity = capacityValue(input.capacity), avatar = avatarValue(input.avatar);
      const rank = rankValue(input.rank), bossRank = rankValue(input.bossRank, '부장');
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
            db.prepare('INSERT INTO office_rooms (code, name, capacity, host_id, created_at, expires_at, boss_rank) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(code, roomName, capacity, id, now, now + ROOM_LIFETIME_MS, bossRank),
            db.prepare("INSERT INTO office_members (id, room_code, token_hash, seat_index, name, rank, avatar, x, z, angle, pose, moving, joined_at, last_seen, last_sync, last_chat) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, 0, 'idle', 0, ?, ?, 0, 0)").bind(id, code, tokenHash, name, rank, avatar, spawn.x, spawn.z, now, now),
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
      const code = roomCode(input.code), name = label(input.name, 10, '이름'), avatar = avatarValue(input.avatar), rank = rankValue(input.rank);
      await admissionLimit(db, 'join', context.rateKey ?? 'unknown', now);
      const room = await db.prepare('SELECT * FROM office_rooms WHERE code = ?').bind(code).first<RoomRow>();
      if (!room) fail(404, 'ROOM_NOT_FOUND', '이 참여 코드의 회사를 찾지 못했어요.');
      if (room.expires_at <= now) fail(410, 'ROOM_EXPIRED', '이 회사의 하루가 끝났어요. 새 방을 만들어 주세요.');
      await repairRoomLayout(db, room, now);
      const token = secret(), tokenHash = await hashRoomToken(token), id = crypto.randomUUID(), spawn = createMultiLayout(room.capacity).spawn;
      const results = await db.batch([
        db.prepare('DELETE FROM office_members WHERE room_code = ? AND last_seen < ?').bind(code, now - ROOM_SEAT_LEASE_MS),
        db.prepare(`WITH RECURSIVE seats(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seats WHERE n < 15)
          INSERT INTO office_members (id, room_code, token_hash, seat_index, name, rank, avatar, x, z, angle, pose, moving, joined_at, last_seen, last_sync, last_chat)
          SELECT ?, r.code, ?, seats.n, ?, ?, ?, ?, ?, 0, 'idle', 0, ?, ?, 0, 0 FROM office_rooms r CROSS JOIN seats
          WHERE r.code = ? AND r.expires_at > ? AND seats.n < r.capacity AND NOT EXISTS (SELECT 1 FROM office_members m WHERE m.room_code = r.code AND m.seat_index = seats.n)
          ORDER BY seats.n LIMIT 1 RETURNING id`).bind(id, tokenHash, name, rank, avatar, spawn.x, spawn.z, now, now, code, now),
        transferHost(db, code, now),
      ]);
      if (!results[1].results.length) fail(409, 'ROOM_FULL', '자리가 모두 찼어요. 방장에게 정원을 늘려 달라고 해 주세요.');
      const session: RoomSession = { code, token, playerId: id };
      return { status: 201, body: { session, snapshot: await snapshot(db, code, id, now) } };
    }
    const { code, member, room, tokenHash } = await authenticate(db, input, now);
    if (action === 'sync') {
      const p: RoomPlayerUpdate = input.player === undefined ? { ...member, moving: !!member.moving, ...memberVisual(member) } : playerValue(input.player, room, member);
      if (input.boss !== undefined && room.host_id !== member.id) fail(403, 'NOT_HOST', '상사의 동작을 동기화할 수 없어요.');
      const boss = input.boss === undefined ? null : bossValue(input.boss, room, now);
      const [result] = await db.batch([
        // Occupancy is checked inside the write, never in a separate read. D1
        // serializes this statement so concurrent sit requests have one winner.
        db.prepare(`UPDATE office_members SET x = ?, z = ?, angle = ?, pose = ?, moving = ?, floor = ?, visual = ?, last_seen = ?, last_sync = ?
          WHERE id = ? AND room_code = ? AND token_hash = ? AND last_sync <= ?
          AND EXISTS (SELECT 1 FROM office_rooms WHERE code = ? AND capacity = ?)
          AND (? IS NULL OR NOT EXISTS (SELECT 1 FROM office_members occupied
            WHERE occupied.room_code = ? AND occupied.id != ? AND occupied.last_seen >= ? AND occupied.floor = ?
              AND json_extract(occupied.visual, '$.seat') = ?
              AND (json_extract(occupied.visual, '$.restSeatId') = ? OR
                (json_extract(occupied.visual, '$.restSeatId') IS NULL AND ABS(occupied.x - ?) <= .24 AND ABS(occupied.z - ?) <= .24))))
          RETURNING id`).bind(p.x, p.z, p.angle, p.pose, p.moving ? 1 : 0, p.floor, JSON.stringify(visualOnly(p)), now, now, member.id, code, tokenHash, now - 250, code, room.capacity,
            p.restSeatId ?? null, code, member.id, now - ROOM_SEAT_LEASE_MS, p.floor, p.seat, p.restSeatId ?? null, p.x, p.z),
        ...(boss ? [db.prepare('UPDATE office_rooms SET boss_state = ? WHERE code = ? AND host_id = ? AND boss_hit_id = ? AND EXISTS (SELECT 1 FROM office_members WHERE id = ? AND last_sync = ?)').bind(JSON.stringify(boss), code, member.id, room.boss_hit_id, member.id, now)] : []),
        transferHost(db, code, now),
      ]);
      if (!result.results.length) {
        const current = await db.prepare('SELECT capacity FROM office_rooms WHERE code = ?').bind(code).first<{ capacity: number }>();
        if (current?.capacity !== room.capacity) return { status: 200, body: { snapshot: await snapshot(db, code, member.id, now) } };
        if (p.restSeatId) {
          const occupied = await db.prepare(`SELECT id FROM office_members WHERE room_code = ? AND id != ? AND last_seen >= ? AND floor = ?
            AND json_extract(visual, '$.seat') = ? AND (json_extract(visual, '$.restSeatId') = ? OR
              (json_extract(visual, '$.restSeatId') IS NULL AND ABS(x - ?) <= .24 AND ABS(z - ?) <= .24)) LIMIT 1`)
            .bind(code, member.id, now - ROOM_SEAT_LEASE_MS, p.floor, p.seat, p.restSeatId, p.x, p.z).first();
          if (occupied) fail(409, 'SEAT_TAKEN', '이미 동료가 앉아 있어요. 다른 의자를 골라 주세요.');
        }
        fail(429, 'RATE_LIMITED', '연결을 확인하고 있어요. 잠시만 기다려 주세요.');
      }
    } else if (action === 'attack') {
      if (!['punch', 'hammer', 'fan'].includes(String(input.weapon))) fail(400, 'INVALID_REQUEST', '장난칠 도구를 골라 주세요.');
      const weapon = input.weapon as Weapon;
      const p: RoomPlayerUpdate = input.player === undefined ? { ...member, moving: !!member.moving, ...memberVisual(member) } : playerValue(input.player, room, member);
      const boss = sharedBoss(room, now), distance = gap(p, boss.actor);
      if (p.floor !== 'office' || p.seat !== null || distance < .8 || distance > 2.3) fail(400, 'INVALID_REQUEST', '상사 옆으로 다가가 장난쳐 주세요.');
      const requestId = crypto.randomUUID(), hit = { requestId, playerId: member.id, weapon, at: now };
      const bossState = { actor: { ...boss.actor, angle: Math.atan2(p.x - boss.actor.x, p.z - boss.actor.z), pose: 'hit', moving: false }, phase: 'hit', updatedAt: now };
      const result = await db.batch([
        db.prepare('UPDATE office_members SET x = ?, z = ?, angle = ?, pose = ?, moving = ?, floor = ?, visual = ? WHERE id = ? AND room_code = ? AND token_hash = ?').bind(p.x, p.z, p.angle, p.pose, p.moving ? 1 : 0, p.floor, JSON.stringify(visualOnly(p)), member.id, code, tokenHash),
        db.prepare('UPDATE office_rooms SET boss_state = ?, boss_hit = ?, boss_hit_id = boss_hit_id + 1 WHERE code = ? AND EXISTS (SELECT 1 FROM office_members WHERE id = ? AND room_code = ? AND token_hash = ? AND last_attack <= ?) RETURNING boss_hit_id').bind(JSON.stringify(bossState), JSON.stringify(hit), code, member.id, code, tokenHash, now - Math.round(WEAPONS[weapon].interval * 1000)),
        db.prepare(`UPDATE office_members SET last_attack = ?, last_seen = MAX(last_seen, ?), ${safeRestRenewal} WHERE id = ? AND room_code = ? AND token_hash = ? AND EXISTS (SELECT 1 FROM office_rooms WHERE code = ? AND json_extract(boss_hit, '$.requestId') = ?)`).bind(now, now, ...restRenewalCutoffs(now), member.id, code, tokenHash, code, requestId),
        transferHost(db, code, now),
      ]);
      if (!result[1].results.length) fail(429, 'RATE_LIMITED', '한 박자 쉬고 장난쳐 주세요.');
    } else if (action === 'chat') {
      const text = chatText(input.text), requestId = crypto.randomUUID();
      const result = await db.batch([
        db.prepare('INSERT INTO office_messages (request_id, room_code, player_id, name, text, created_at) SELECT ?, room_code, id, ?, ?, ? FROM office_members WHERE id = ? AND room_code = ? AND token_hash = ? AND last_chat <= ? RETURNING id').bind(requestId, employeeLabel(member.name, normalizeRank(member.rank)), text, now, member.id, code, tokenHash, now - 1000),
        db.prepare(`UPDATE office_members SET last_chat = ?, last_seen = MAX(last_seen, ?), ${safeRestRenewal} WHERE id = ? AND EXISTS (SELECT 1 FROM office_messages WHERE request_id = ?)`).bind(now, now, ...restRenewalCutoffs(now), member.id, requestId),
        db.prepare('DELETE FROM office_messages WHERE room_code = ? AND id NOT IN (SELECT id FROM office_messages WHERE room_code = ? ORDER BY id DESC LIMIT 100)').bind(code, code),
        transferHost(db, code, now),
      ]);
      if (!result[0].results.length) fail(429, 'RATE_LIMITED', '한 박자 쉬고 이야기해 주세요.');
    } else if (action === 'poke') {
      if (typeof input.targetId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.targetId)) fail(400, 'INVALID_REQUEST', '콕 찌를 동료를 골라 주세요.');
      const targetId = input.targetId;
      if (targetId === member.id) fail(400, 'INVALID_REQUEST', '다른 동료를 골라 주세요.');
      const targetPresent = () => db.prepare('SELECT id FROM office_members WHERE id = ? AND room_code = ? AND last_seen >= ?').bind(targetId, code, now - ROOM_SEAT_LEASE_MS).first();
      if (!await targetPresent()) fail(404, 'TARGET_UNAVAILABLE', '지금 같은 회사에 있는 동료를 골라 주세요.');
      const requestId = crypto.randomUUID();
      // D1 batches are atomic: a successful insert alone consumes the sender cooldown.
      const result = await db.batch([
        db.prepare(`INSERT INTO office_notifications (request_id, room_code, recipient_id, sender_id, sender_name, created_at)
          SELECT ?, sender.room_code, target.id, sender.id, ?, ? FROM office_members sender JOIN office_members target ON target.room_code = sender.room_code
          WHERE sender.id = ? AND sender.room_code = ? AND sender.token_hash = ? AND sender.last_poke <= ? AND target.id = ? AND target.last_seen >= ? RETURNING id`).bind(requestId, employeeLabel(member.name, normalizeRank(member.rank)), now, member.id, code, tokenHash, now - 5000, targetId, now - ROOM_SEAT_LEASE_MS),
        db.prepare(`UPDATE office_members SET last_poke = ?, last_seen = MAX(last_seen, ?), ${safeRestRenewal} WHERE id = ? AND room_code = ? AND token_hash = ? AND EXISTS (SELECT 1 FROM office_notifications WHERE request_id = ?)`).bind(now, now, ...restRenewalCutoffs(now), member.id, code, tokenHash, requestId),
        db.prepare('DELETE FROM office_notifications WHERE room_code = ? AND recipient_id = ? AND id NOT IN (SELECT id FROM office_notifications WHERE room_code = ? AND recipient_id = ? ORDER BY id DESC LIMIT 100)').bind(code, targetId, code, targetId),
        transferHost(db, code, now),
      ]);
      if (!result[0].results.length) {
        if (!await targetPresent()) fail(404, 'TARGET_UNAVAILABLE', '지금 같은 회사에 있는 동료를 골라 주세요.');
        fail(429, 'RATE_LIMITED', '5초만 쉬었다가 다시 콕 찔러 주세요.');
      }
    } else if (action === 'readNotifications') {
      const throughId = input.throughId;
      if (typeof throughId !== 'number' || !Number.isSafeInteger(throughId) || throughId < 0) fail(400, 'INVALID_REQUEST', '확인할 알림을 다시 골라 주세요.');
      await db.batch([
        db.prepare('UPDATE office_notifications SET read_at = ? WHERE room_code = ? AND recipient_id = ? AND id <= ? AND read_at IS NULL').bind(now, code, member.id, throughId),
        db.prepare(`UPDATE office_members SET last_seen = MAX(last_seen, ?), ${safeRestRenewal} WHERE id = ? AND room_code = ? AND token_hash = ?`).bind(now, ...restRenewalCutoffs(now), member.id, code, tokenHash),
        transferHost(db, code, now),
      ]);
    } else if (action === 'capacity') {
      const capacity = capacityValue(input.capacity);
      if (room.host_id !== member.id) fail(403, 'NOT_HOST', '정원은 방장만 바꿀 수 있어요.');
      const layout = createMultiLayout(capacity), { bounds, spawn, obstacles } = layout;
      const currentBoss = sharedBoss(room, now);
      const resetBoss = !isMultiWalkable(layout, currentBoss.actor) ? { actor: { ...currentBoss.actor, ...layout.boss, pose: 'idle', moving: false }, phase: 'routine', updatedAt: now } : null;
      // Keep the relocation in the same atomic batch as resizing. One JSON
      // footprint avoids exceeding D1's 100-parameter limit at 16 desks.
      const footprint = JSON.stringify(obstacles.map(o => [o.x, o.z, o.w / 2 + .24, o.d / 2 + .24]));
      const result = await db.batch([
        db.prepare('DELETE FROM office_members WHERE room_code = ? AND last_seen < ? AND id != ?').bind(code, now - ROOM_SEAT_LEASE_MS, member.id),
        db.prepare('UPDATE office_rooms SET capacity = ? WHERE code = ? AND host_id = ? AND NOT EXISTS (SELECT 1 FROM office_members WHERE room_code = ? AND seat_index >= ?) RETURNING code').bind(capacity, code, member.id, code, capacity),
        db.prepare(`UPDATE office_members SET x = ?, z = ?, pose = 'idle', moving = 0, visual = NULL WHERE room_code = ? AND floor = 'office'
          AND (x < ? OR x > ? OR z < ? OR z > ? OR EXISTS (
            SELECT 1 FROM json_each(?) AS obstacle
            WHERE ABS(office_members.x - json_extract(obstacle.value, '$[0]')) < json_extract(obstacle.value, '$[2]')
              AND ABS(office_members.z - json_extract(obstacle.value, '$[1]')) < json_extract(obstacle.value, '$[3]')))
          AND EXISTS (SELECT 1 FROM office_rooms WHERE code = ? AND capacity = ?)`).bind(spawn.x, spawn.z, code, bounds.minX + .24, bounds.maxX - .24, bounds.minZ + .24, bounds.maxZ - .24, footprint, code, capacity),
        db.prepare(`UPDATE office_members SET last_seen = MAX(last_seen, ?), ${safeRestRenewal} WHERE id = ? AND token_hash = ?`).bind(now, ...restRenewalCutoffs(now), member.id, tokenHash),
        ...(resetBoss ? [db.prepare('UPDATE office_rooms SET boss_state = ? WHERE code = ? AND capacity = ?').bind(JSON.stringify(resetBoss), code, capacity)] : []),
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
