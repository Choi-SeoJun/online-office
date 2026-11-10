import { env } from 'cloudflare:workers';
import { handleRoomAction, hashRoomToken } from '../../../lib/rooms.ts';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const error = (status: number, code: string, message: string) => Response.json({ error: message, code }, { status, headers });

export async function POST(request: Request) {
  const url = new URL(request.url), origin = request.headers.get('origin');
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return error(403, 'BAD_ORIGIN', '이 페이지에서 다시 시도해 주세요.');
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return error(415, 'INVALID_REQUEST', '요청 형식을 확인해 주세요.');
  if (!env.DB) return error(503, 'UNAVAILABLE', '멀티 회사를 준비 중이에요. 잠시 뒤 다시 시도해 주세요.');
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
    // Cloudflare sets this header at its trusted edge. Persist only a daily hash.
    const rateKey = await hashRoomToken(`${Math.floor(Date.now() / 86400000)}:${request.headers.get('cf-connecting-ip') ?? 'local'}`);
    const result = await handleRoomAction(env.DB, body, { rateKey });
    return Response.json(result.body, { status: result.status, headers });
  } catch {
    return error(503, 'UNAVAILABLE', '회사 연결이 잠시 끊겼어요. 잠시 뒤 다시 시도해 주세요.');
  }
}
