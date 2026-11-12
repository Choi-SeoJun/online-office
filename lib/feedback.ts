import type { FeedbackList, FeedbackRecord, FeedbackStatus, FeedbackSubmission } from '../game/feedback-types.ts';

export type FeedbackDatabase = Pick<D1Database, 'prepare' | 'batch'>;
const WINDOW_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT = 10;
const PAGE_SIZE = 30;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function feedbackObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function parseFeedback(value: unknown): FeedbackSubmission | null {
  const body = feedbackObject(value);
  const context = feedbackObject(body?.context);
  if (!body || !context) return null;

  const { requestId, category, message } = body;
  const { mode, floor } = context;
  if (typeof requestId !== 'string' || !REQUEST_ID.test(requestId)) return null;
  if (category !== 'bug' && category !== 'idea' && category !== 'other') return null;
  if (mode !== 'solo' && mode !== 'multi') return null;
  if (floor !== 'office' && floor !== 'roof') return null;
  if (typeof message !== 'string') return null;

  const text = message.replace(/\r\n?/g, '\n').trim();
  if (!text || Array.from(text).length > 2000 || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)) return null;
  return { requestId: requestId.toLowerCase(), category, message: text, context: { mode, floor } };
}

async function dailyRateKeys(secret: string, ip: string, now: number): Promise<[string, string]> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const hash = async (day: number) => {
    const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`feedback:${day}:${ip}`));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  };
  const day = Math.floor(now / DAY_MS);
  const cutoffDay = Math.floor((now - WINDOW_MS) / DAY_MS);
  const current = await hash(day);
  return [current, cutoffDay === day ? current : await hash(cutoffDay)];
}

export async function storeFeedback(
  db: FeedbackDatabase,
  submission: FeedbackSubmission,
  { secret, ip, now }: { secret: string; ip: string; now: number },
): Promise<boolean> {
  const [key, previousKey] = await dailyRateKeys(secret, ip, now);
  const { requestId, category, message, context } = submission;
  const cutoff = now - WINDOW_MS;
  // D1 executes the batch in one transaction. Only an inserted message consumes quota.
  const [, insert] = await db.batch([
    db.prepare('DELETE FROM office_feedback_rate WHERE accepted_at <= ?').bind(cutoff),
    db.prepare(`
      INSERT INTO office_feedback (request_id, category, message, mode, floor, created_at)
      SELECT ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM office_feedback_rate WHERE rate_key IN (?, ?) AND accepted_at > ?) < ?
      ON CONFLICT(request_id) DO NOTHING
    `).bind(requestId, category, message, context.mode, context.floor, now, key, previousKey, cutoff, RATE_LIMIT),
    db.prepare('INSERT INTO office_feedback_rate (rate_key, accepted_at) SELECT ?, ? WHERE changes() = 1').bind(key, now),
  ]);
  if (insert.meta.changes === 1) return true;

  const existing = await db.prepare('SELECT id FROM office_feedback WHERE request_id = ?').bind(requestId).all();
  return existing.results.length > 0;
}

export async function listFeedback(
  db: FeedbackDatabase,
  status: FeedbackStatus | 'all',
  before: number | null,
): Promise<FeedbackList> {
  const [page, totals] = await db.batch([
    db.prepare(`
      SELECT id, category, message, mode, floor, status, created_at AS createdAt, reviewed_at AS reviewedAt
      FROM office_feedback
      WHERE (? = 'all' OR status = ?) AND (? IS NULL OR id < ?)
      ORDER BY id DESC LIMIT ?
    `).bind(status, status, before, before, PAGE_SIZE + 1),
    db.prepare('SELECT status, COUNT(*) AS total FROM office_feedback GROUP BY status'),
  ]);
  const rows = page.results as FeedbackRecord[];
  const items = rows.slice(0, PAGE_SIZE);
  const counts = { new: 0, reviewed: 0 };
  for (const row of totals.results as { status: FeedbackStatus; total: number }[]) {
    counts[row.status] = row.total;
  }
  return { items, counts, nextCursor: rows.length > PAGE_SIZE ? items[PAGE_SIZE - 1].id : null };
}

export async function updateFeedbackStatus(
  db: FeedbackDatabase, id: number, status: FeedbackStatus, now: number,
): Promise<boolean> {
  const result = await db.prepare(`
    UPDATE office_feedback
    SET status = ?, reviewed_at = CASE WHEN ? = 'reviewed' THEN COALESCE(reviewed_at, ?) ELSE NULL END
    WHERE id = ?
  `).bind(status, status, now, id).run();
  return result.meta.changes === 1;
}
