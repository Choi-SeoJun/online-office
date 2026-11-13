import { WALLPAPER_BODY_LIMIT } from '../game/wallpaper.ts';
import { handleWallpaperAction, type WallpaperBucket } from './wallpaper.ts';
import type { RoomDatabase } from './rooms.ts';

export async function handleWallpaperRequest(request: Request, db?: RoomDatabase, bucket?: WallpaperBucket): Promise<Response> {
  const origin = request.headers.get('origin'), site = request.headers.get('sec-fetch-site');
  const allowed = origin === null ? site === null || site === 'same-origin' || site === 'none'
    : origin === new URL(request.url).origin || origin === 'https://choi-seojun.github.io';
  const headers = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' });
  if (allowed && origin) headers.set('Access-Control-Allow-Origin', origin);
  const error = (status: number, code: string, message: string) => Response.json({ code, error: message }, { status, headers });
  if (!allowed) return error(403, 'BAD_ORIGIN', '회사 화면에서 다시 시도해 주세요.');
  if (request.method === 'OPTIONS') {
    if (request.headers.get('access-control-request-method') !== 'POST' || request.headers.get('access-control-request-headers')?.split(',').some(h => h.trim().toLowerCase() !== 'content-type')) return error(400, 'INVALID_REQUEST', '요청을 확인해 주세요.');
    headers.set('Access-Control-Allow-Methods', 'POST'); headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') { headers.set('Allow', 'POST, OPTIONS'); return error(405, 'INVALID_REQUEST', '요청을 확인해 주세요.'); }
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return error(415, 'INVALID_REQUEST', '이미지 요청을 확인해 주세요.');
  if (!db || !bucket) return error(503, 'UNAVAILABLE', '모니터 설정을 준비 중이에요. 잠시 뒤 다시 시도해 주세요.');
  const tooLarge = () => error(413, 'IMAGE_TOO_LARGE', '이미지가 너무 커요. 다른 이미지를 골라 주세요.');
  if (Number(request.headers.get('content-length')) > WALLPAPER_BODY_LIMIT) return tooLarge();
  try {
    const reader = request.body?.getReader(); if (!reader) return error(400, 'INVALID_REQUEST', '이미지를 확인해 주세요.');
    const bytes = new Uint8Array(WALLPAPER_BODY_LIMIT); let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; if (size + value.length > bytes.length) { await reader.cancel(); return tooLarge(); } bytes.set(value, size); size += value.length; }
    let input: unknown;
    try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size))); }
    catch { return error(400, 'INVALID_REQUEST', '이미지를 확인해 주세요.'); }
    const result = await handleWallpaperAction(db, bucket, input);
    return Response.json(result.body, { status: result.status, headers });
  } catch { return error(503, 'UNAVAILABLE', '배경화면 연결이 잠시 끊겼어요. 다시 시도해 주세요.'); }
}
