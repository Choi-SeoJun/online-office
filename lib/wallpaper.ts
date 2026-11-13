import { decodeWallpaper, validWallpaperId, wallpaperDataUrl } from '../game/wallpaper.ts';
import { hashRoomToken, ROOM_SEAT_LEASE_MS, type RoomDatabase } from './rooms.ts';

export type WallpaperBucket = {
  put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<unknown>;
};
type Access = { id: string; wallpaper_id: string | null; wallpaper_updated_at: number; expires_at: number };
type Result = { status: number; body: Record<string, unknown> };
const error = (status: number, code: string, message: string): Result => ({ status, body: { code, error: message } });
const invalid = () => error(400, 'INVALID_REQUEST', '모니터 이미지를 확인해 주세요.');
const key = (id: string) => `monitor-wallpapers/${id}.jpg`;

async function discard(db: RoomDatabase, bucket: WallpaperBucket, id: string) {
  // Leave metadata in place on failure so a later request can retry collection.
  try { await bucket.delete(key(id)); await db.prepare('DELETE FROM office_wallpaper_files WHERE id = ?').bind(id).run(); } catch { /* retry later */ }
}

export async function collectWallpaperFiles(db: RoomDatabase, bucket: WallpaperBucket, now: number) {
  const stale = await db.prepare(`SELECT f.id FROM office_wallpaper_files f WHERE f.created_at < ?
    AND (f.expires_at <= ? OR NOT EXISTS (SELECT 1 FROM office_members m WHERE m.wallpaper_id = f.id)) LIMIT 8`)
    .bind(now - 300_000, now).all<{ id: string }>();
  for (const file of stale.results) await discard(db, bucket, file.id);
}

export async function handleWallpaperAction(db: RoomDatabase, bucket: WallpaperBucket, raw: unknown, now = Date.now()): Promise<Result> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid();
  const input = raw as Record<string, unknown>;
  if (typeof input.code !== 'string' || !/^[A-HJ-NP-Z2-9]{8}$/.test(input.code) || !['set', 'remove', 'read'].includes(String(input.action))) return invalid();
  if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) return error(401, 'SESSION_EXPIRED', '다시 입장해 주세요.');
  const code = input.code, tokenHash = await hashRoomToken(input.token), activeAfter = now - ROOM_SEAT_LEASE_MS;
  const access = await db.prepare(`SELECT m.id, m.wallpaper_id, m.wallpaper_updated_at, r.expires_at FROM office_members m
    JOIN office_rooms r ON r.code = m.room_code WHERE m.room_code = ? AND m.token_hash = ? AND m.last_seen >= ? AND r.expires_at > ?`)
    .bind(code, tokenHash, activeAfter, now).first<Access>();
  if (!access) return error(401, 'SESSION_EXPIRED', '참여 정보를 확인할 수 없어요. 다시 입장해 주세요.');

  if (input.action === 'read') {
    if (!validWallpaperId(input.id)) return invalid();
    const visible = await db.prepare('SELECT id FROM office_members WHERE room_code = ? AND wallpaper_id = ? AND last_seen >= ?')
      .bind(code, input.id, activeAfter).first();
    if (!visible) return error(404, 'IMAGE_NOT_FOUND', '배경화면이 변경되었어요.');
    const file = await bucket.get(key(input.id));
    if (!file) return error(404, 'IMAGE_NOT_FOUND', '배경화면을 찾지 못했어요.');
    return { status: 200, body: { id: input.id, image: wallpaperDataUrl(new Uint8Array(await file.arrayBuffer())) } };
  }

  if (access.wallpaper_updated_at > now - 2000) return error(429, 'TOO_FAST', '잠시 뒤 다시 변경해 주세요.');
  const image = input.action === 'set' ? decodeWallpaper(input.image) : null;
  if (input.action === 'set' && !image) return invalid();
  const nextId = image ? crypto.randomUUID() : null;
  if (nextId && image) {
    await db.prepare('INSERT INTO office_wallpaper_files (id, room_code, owner_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(nextId, code, access.id, now, access.expires_at).run();
    try { await bucket.put(key(nextId), image.slice().buffer, { httpMetadata: { contentType: 'image/jpeg' } }); }
    catch { await discard(db, bucket, nextId); return error(503, 'UNAVAILABLE', '이미지를 저장하지 못했어요. 다시 시도해 주세요.'); }
  }
  let changed: D1Result<{ id: string }>;
  try {
    changed = await db.prepare(`UPDATE office_members SET wallpaper_id = ?, wallpaper_updated_at = ?
      WHERE id = ? AND room_code = ? AND token_hash = ? AND last_seen >= ? AND wallpaper_id IS ?
      AND wallpaper_updated_at <= ? AND EXISTS (SELECT 1 FROM office_rooms WHERE code = ? AND expires_at > ?) RETURNING id`)
      .bind(nextId, now, access.id, code, tokenHash, activeAfter, access.wallpaper_id, now - 2000, code, now).all<{ id: string }>();
  } catch (failure) { if (nextId) await discard(db, bucket, nextId); throw failure; }
  if (!changed.results.length) {
    if (nextId) await discard(db, bucket, nextId);
    return error(409, 'IMAGE_CHANGED', '참여 상태나 배경화면이 바뀌었어요. 다시 시도해 주세요.');
  }
  if (access.wallpaper_id) await discard(db, bucket, access.wallpaper_id);
  try { await collectWallpaperFiles(db, bucket, now); } catch { /* collection must not undo a saved image */ }
  return { status: 200, body: { wallpaperId: nextId } };
}
