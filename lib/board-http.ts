import { BOARD_BODY_LIMIT } from '../game/board-types.ts';
import { handleBoardAction } from './board.ts';
import type { RoomDatabase } from './rooms.ts';

const pagesOrigin = 'https://choi-seojun.github.io';

export async function handleBoardRequest(request: Request, db?: RoomDatabase): Promise<Response> {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  const allowed = origin === null
    ? fetchSite === null || fetchSite === 'same-origin' || fetchSite === 'none'
    : origin === new URL(request.url).origin || origin === pagesOrigin;
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    Vary: 'Origin',
  });
  if (allowed && origin !== null) headers.set('Access-Control-Allow-Origin', origin);
  const error = (status: number, code: string, message: string) => Response.json({ error: message, code }, { status, headers });
  const invalid = (status = 400) => error(status, 'INVALID_REQUEST', '게시판 내용을 확인해 주세요.');
  if (!allowed) return error(403, 'BAD_ORIGIN', '이 페이지에서 다시 시도해 주세요.');
  if (request.method === 'OPTIONS') {
    if (request.headers.get('access-control-request-method') !== 'POST') return invalid(405);
    const requestedHeaders = request.headers.get('access-control-request-headers');
    if (requestedHeaders?.split(',').some(header => header.trim().toLowerCase() !== 'content-type')) return invalid();
    headers.set('Access-Control-Allow-Methods', 'POST');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') {
    headers.set('Allow', 'POST, OPTIONS');
    return invalid(405);
  }
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return invalid(415);
  if (!db) return error(503, 'UNAVAILABLE', '게시판을 준비 중이에요. 잠시 뒤 다시 시도해 주세요.');
  const tooLarge = () => error(413, 'INVALID_REQUEST', '게시물 내용이 너무 길어요.');
  if (Number(request.headers.get('content-length')) > BOARD_BODY_LIMIT) return tooLarge();
  try {
    const reader = request.body?.getReader();
    if (!reader) return invalid();
    const bytes = new Uint8Array(BOARD_BODY_LIMIT);
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > BOARD_BODY_LIMIT) {
        await reader.cancel();
        return tooLarge();
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size))); }
    catch { return invalid(); }
    const result = await handleBoardAction(db, body);
    return Response.json(result.body, { status: result.status, headers });
  } catch {
    return error(503, 'UNAVAILABLE', '게시판 연결이 잠시 끊겼어요. 잠시 뒤 다시 시도해 주세요.');
  }
}
