import { isFeedbackAdmin } from './feedback-auth.ts';
import { feedbackObject, listFeedback, parseFeedback, storeFeedback, updateFeedbackStatus, type FeedbackDatabase } from './feedback.ts';

const PAGES_ORIGIN = 'https://choi-seojun.github.io';
const BODY_LIMIT = 12 * 1024;
const INVALID = '입력 내용을 확인해 주세요.';
const UNAVAILABLE = '건의함을 사용할 수 없어요. 잠시 뒤 다시 시도해 주세요.';
const FORBIDDEN = '이 페이지에서 요청할 수 없어요.';

class FeedbackRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function responseHeaders() {
  return new Headers({
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
}

function feedbackError(headers: Headers, status: number, error: string): Response {
  return Response.json({ error }, { status, headers });
}

function methodNotAllowed(headers: Headers, allow: string): Response {
  headers.set('Allow', allow);
  return feedbackError(headers, 405, INVALID);
}

function catchFeedbackError(headers: Headers, error: unknown): Response {
  return error instanceof FeedbackRequestError
    ? feedbackError(headers, error.status, error.message)
    : feedbackError(headers, 503, UNAVAILABLE);
}

async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') throw new FeedbackRequestError(415, INVALID);

  const reader = request.body?.getReader();
  if (!reader) throw new FeedbackRequestError(400, INVALID);

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let body = '';
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) {
        throw new FeedbackRequestError(413, '입력 내용이 너무 길어요.');
      }
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (error instanceof FeedbackRequestError) throw error;
    throw new FeedbackRequestError(400, INVALID);
  } finally {
    reader.releaseLock();
  }
}

function originlessAllowed(fetchSite: string | null): boolean {
  return fetchSite === null || fetchSite === 'same-origin' || fetchSite === 'none';
}

export async function handleFeedbackRequest(
  request: Request,
  db?: FeedbackDatabase,
  rateSecret?: string,
  now = Date.now(),
): Promise<Response> {
  const headers = responseHeaders();
  headers.set('Vary', 'Origin');
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  const sameOrigin = origin === new URL(request.url).origin;
  const allowed = origin === null ? originlessAllowed(fetchSite) : sameOrigin || origin === PAGES_ORIGIN;
  if (!allowed) return feedbackError(headers, 403, FORBIDDEN);
  if (origin !== null) headers.set('Access-Control-Allow-Origin', origin);

  if (request.method === 'OPTIONS') {
    headers.set('Vary', 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
    if (origin === null || request.headers.get('access-control-request-method') !== 'POST') {
      return methodNotAllowed(headers, 'POST, OPTIONS');
    }
    const requestedHeaders = request.headers.get('access-control-request-headers');
    if (requestedHeaders && requestedHeaders.split(',').some(header => header.trim().toLowerCase() !== 'content-type')) {
      return feedbackError(headers, 400, INVALID);
    }
    headers.set('Access-Control-Allow-Methods', 'POST');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') return methodNotAllowed(headers, 'POST, OPTIONS');

  try {
    const submission = parseFeedback(await readJson(request));
    if (!submission) return feedbackError(headers, 400, INVALID);
    if (!db || !rateSecret?.trim()) return feedbackError(headers, 503, UNAVAILABLE);
    // Cloudflare populates this header at the edge. Missing IPs share a fallback bucket.
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    if (!await storeFeedback(db, submission, { secret: rateSecret, ip, now })) {
      return feedbackError(headers, 429, '건의가 너무 자주 접수됐어요. 잠시 뒤 다시 시도해 주세요.');
    }
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    return catchFeedbackError(headers, error);
  }
}

export async function handleAdminFeedbackRequest(
  request: Request,
  db: FeedbackDatabase | undefined,
  user: { userId: string; email: string } | null,
  configuredEmail: string | undefined,
  now = Date.now(),
): Promise<Response> {
  const headers = responseHeaders();
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (!originlessAllowed(fetchSite) || (origin !== null && origin !== url.origin)) {
    return feedbackError(headers, 403, FORBIDDEN);
  }
  if (!isFeedbackAdmin(user, configuredEmail)) return feedbackError(headers, 403, FORBIDDEN);
  if (request.method !== 'GET' && request.method !== 'PATCH') return methodNotAllowed(headers, 'GET, PATCH');
  if (request.method === 'PATCH' && origin !== url.origin) return feedbackError(headers, 403, FORBIDDEN);
  if (!db) return feedbackError(headers, 503, UNAVAILABLE);

  try {
    if (request.method === 'GET') {
      const status = url.searchParams.get('status') ?? 'all';
      const cursor = url.searchParams.get('before');
      const before = cursor === null ? null : Number(cursor);
      if (status !== 'all' && status !== 'new' && status !== 'reviewed') {
        return feedbackError(headers, 400, INVALID);
      }
      if (cursor !== null && (!/^[1-9]\d*$/.test(cursor) || !Number.isSafeInteger(before))) {
        return feedbackError(headers, 400, INVALID);
      }
      return Response.json(await listFeedback(db, status, before), { headers });
    }

    const body = feedbackObject(await readJson(request));
    const id = body?.id;
    const status = body?.status;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || (status !== 'new' && status !== 'reviewed')) {
      return feedbackError(headers, 400, INVALID);
    }
    if (!await updateFeedbackStatus(db, id, status, now)) return feedbackError(headers, 404, '건의를 찾을 수 없어요.');
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    return catchFeedbackError(headers, error);
  }
}
