import { handleRoomAction, hashRoomToken, type RoomDatabase } from './rooms.ts';
import { OFFICE_LAYOUT_VERSION } from '../game/office-version.ts';

const pagesOrigin = 'https://choi-seojun.github.io';

export async function handleRoomRequest(request: Request, db?: RoomDatabase): Promise<Response> {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  const allowed = origin === null
    ? fetchSite === null || fetchSite === 'same-origin' || fetchSite === 'none'
    : origin === new URL(request.url).origin || origin === pagesOrigin;
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
  });
  if (allowed && origin !== null) headers.set('Access-Control-Allow-Origin', origin);
  const error = (status: number, code: string, message: string) => Response.json({ error: message, code }, { status, headers });
  if (!allowed) return error(403, 'BAD_ORIGIN', '이 페이지에서 다시 시도해 주세요.');
  if (request.method === 'OPTIONS') {
    if (request.headers.get('access-control-request-method') !== 'POST') {
      headers.set('Allow', 'POST, OPTIONS');
      return error(405, 'INVALID_REQUEST', '요청 형식을 확인해 주세요.');
    }
    const requestedHeaders = request.headers.get('access-control-request-headers');
    if (requestedHeaders && requestedHeaders.split(',').some(header => header.trim().toLowerCase() !== 'content-type')) {
      return error(400, 'INVALID_REQUEST', '요청 형식을 확인해 주세요.');
    }
    headers.set('Access-Control-Allow-Methods', 'POST');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return new Response(null, { status: 204, headers });
  }
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') return error(415, 'INVALID_REQUEST', '요청 형식을 확인해 주세요.');
  if (!db) return error(503, 'UNAVAILABLE', '멀티 회사를 준비 중이에요. 잠시 뒤 다시 시도해 주세요.');
  try {
    const reader = request.body?.getReader();
    if (!reader) return error(400, 'INVALID_REQUEST', '입력 내용을 확인해 주세요.');
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return error(413, 'INVALID_REQUEST', '입력 내용이 너무 길어요.'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return error(400, 'INVALID_REQUEST', '입력 내용을 확인해 주세요.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return error(400, 'INVALID_REQUEST', '입력 내용을 확인해 주세요.');
    if ((body as Record<string, unknown>).layoutVersion !== OFFICE_LAYOUT_VERSION) {
      return error(409, 'ROOM_EXPIRED', '사무실 배치가 바뀌었어요. 화면을 새로고침한 뒤 다시 입장해 주세요.');
    }
    // Cloudflare sets this header at its trusted edge. Persist only a daily hash.
    const rateKey = await hashRoomToken(`${Math.floor(Date.now() / 86400000)}:${request.headers.get('cf-connecting-ip') ?? 'local'}`);
    const result = await handleRoomAction(db, body, { rateKey });
    return Response.json(result.body, { status: result.status, headers });
  } catch {
    return error(503, 'UNAVAILABLE', '회사 연결이 잠시 끊겼어요. 잠시 뒤 다시 시도해 주세요.');
  }
}
