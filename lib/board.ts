import { BOARD_MAX_ENTRIES, boardRecord, parseBoardDraft, parseBoardPlacement, validBoardId, type BoardEntry, type BoardDraft } from '../game/board-types.ts';
import { getBoardPlacement } from '../game/board-render.ts';
import { hashRoomToken, ROOM_SEAT_LEASE_MS, type RoomDatabase } from './rooms.ts';

export const BOARD_CREATE_INTERVAL_MS = 1500;
type BoardResult = { status: number; body: { entries: BoardEntry[] } | { error: string; code: string } };
type BoardRow = {
  id: string; kind: BoardDraft['kind']; color: BoardDraft['color']; text: string; strokes: string;
  author_id: string; author_name: string; created_at: number; placement: string | null;
};
type RoomAccess = { expires_at: number; member_id: string | null };
const error = (status: number, code: string, message: string): BoardResult => ({ status, body: { code, error: message } });
const invalid = () => error(400, 'INVALID_REQUEST', '게시판 내용을 확인해 주세요.');
const noSession = () => error(401, 'SESSION_EXPIRED', '참여 정보를 확인할 수 없어요. 다시 입장해 주세요.');

const activeMember = `SELECT m.id, m.name, r.host_id FROM office_members AS m
  JOIN office_rooms AS r ON r.code = m.room_code
  WHERE m.room_code = ? AND m.token_hash = ? AND m.last_seen >= ? AND r.expires_at > ?`;

export async function handleBoardAction(db: RoomDatabase, raw: unknown, now = Date.now()): Promise<BoardResult> {
  const input = boardRecord(raw);
  if (!input || typeof input.code !== 'string') return invalid();
  const code = input.code.trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) return invalid();
  const { action, token } = input;
  if (action !== 'list' && action !== 'create' && action !== 'delete' && action !== 'move') return invalid();
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return noSession();
  const draft = action === 'create' ? parseBoardDraft(input.draft) : null;
  const id = draft?.id ?? input.id;
  const placement = action === 'move' ? parseBoardPlacement(input.placement) : null;
  if ((action === 'create' && !draft) || ((action === 'delete' || action === 'move') && !validBoardId(id)) || (action === 'move' && !placement)) return invalid();

  const tokenHash = await hashRoomToken(token);
  const accessParams = [code, tokenHash, now - ROOM_SEAT_LEASE_MS, now] as const;
  const statements = [db.prepare(`SELECT r.expires_at, m.id AS member_id FROM office_rooms AS r
    LEFT JOIN office_members AS m ON m.room_code = r.code AND m.token_hash = ? AND m.last_seen >= ?
    WHERE r.code = ?`).bind(tokenHash, now - ROOM_SEAT_LEASE_MS, code)];

  if (draft) {
    // D1 serializes these statements as one transaction. The cap, duplicate ID,
    // current membership and write cooldown are evaluated before each insert.
    statements.push(db.prepare(`WITH member AS (${activeMember})
      INSERT INTO office_board_entries (room_code, id, author_id, author_name, kind, color, text, strokes, created_at, placement)
      SELECT ?, ?, member.id, member.name, ?, ?, ?, ?, ?, ? FROM member
      WHERE (SELECT COUNT(*) FROM office_board_entries WHERE room_code = ?) < ?
        AND NOT EXISTS (SELECT 1 FROM office_rate_limits WHERE key = 'board:' || member.id AND resets_at > ?)
      ON CONFLICT (room_code, id) DO NOTHING
      RETURNING id`).bind(...accessParams, code, draft.id, draft.kind, draft.color, draft.text, JSON.stringify(draft.strokes), now, draft.placement ? JSON.stringify(draft.placement) : null, code, BOARD_MAX_ENTRIES, now));
    statements.push(db.prepare(`WITH member AS (${activeMember})
      INSERT INTO office_rate_limits (key, hits, resets_at)
      SELECT 'board:' || member.id, 1, ? FROM member
      WHERE EXISTS (SELECT 1 FROM office_board_entries WHERE room_code = ? AND id = ? AND author_id = member.id AND created_at = ?)
      ON CONFLICT (key) DO UPDATE SET resets_at = excluded.resets_at`).bind(...accessParams, now + BOARD_CREATE_INTERVAL_MS, code, draft.id, now));
  }
  if (action === 'move' && placement && validBoardId(id)) {
    const fallback = getBoardPlacement({ id, kind: 'note' });
    // Coordinates can cross from the original board to the wider one without
    // changing a card's physical size. Missing metadata is the 1200px canvas.
    const fallbackWidth = fallback.width * (fallback.canvasWidth ?? 1200);
    const requestedWidth = placement.width * (placement.canvasWidth ?? 1200);
    statements.push(db.prepare(`WITH member AS (${activeMember})
      UPDATE office_board_entries SET placement = ? WHERE room_code = ? AND id = ?
      AND EXISTS (SELECT 1 FROM member)
      AND ABS(COALESCE(json_extract(placement, '$.width') * COALESCE(json_extract(placement, '$.canvasWidth'), 1200), ?) - ?) < 0.0000001
      AND ABS(COALESCE(json_extract(placement, '$.height'), ?) - ?) < 0.0000000001
      AND NOT (kind = 'doodle' AND COALESCE(json_extract(placement, '$.width'), 0) = 1
        AND COALESCE(json_extract(placement, '$.height'), 0) = 1)
      RETURNING id`).bind(...accessParams, JSON.stringify(placement), code, id, fallbackWidth, requestedWidth, fallback.height, placement.height));
  }
  if (action === 'delete' && validBoardId(id)) {
    statements.push(db.prepare(`WITH member AS (${activeMember})
      DELETE FROM office_board_entries WHERE room_code = ? AND id = ?
      AND EXISTS (SELECT 1 FROM member WHERE member.id = author_id OR member.id = member.host_id)
      RETURNING id`).bind(...accessParams, code, id));
  }
  statements.push(db.prepare(`WITH member AS (${activeMember})
    SELECT id, author_id, author_name, kind, color, text, strokes, created_at, placement FROM office_board_entries
    WHERE room_code = ? AND EXISTS (SELECT 1 FROM member)
    ORDER BY created_at DESC, id DESC LIMIT ?`).bind(...accessParams, code, BOARD_MAX_ENTRIES));

  const results = await db.batch(statements);
  const access = results[0].results[0] as RoomAccess | undefined;
  if (!access) return error(404, 'ROOM_NOT_FOUND', '이 참여 코드의 회사를 찾지 못했어요.');
  if (access.expires_at <= now) return error(410, 'ROOM_EXPIRED', '이 회사의 하루가 끝났어요. 새 방을 만들어 주세요.');
  if (!access.member_id) return noSession();
  const rows = results[results.length - 1].results as BoardRow[];
  const matching = rows.find(row => row.id === id);
  if (draft && matching?.author_id !== access.member_id) {
    if (matching) return error(409, 'BOARD_CONFLICT', '새 게시물로 다시 작성해 주세요.');
    if (rows.length >= BOARD_MAX_ENTRIES) return error(409, 'BOARD_FULL', '게시판이 가득 찼어요. 기존 게시물을 지운 뒤 다시 시도해 주세요.');
    return error(429, 'RATE_LIMITED', '잠깐 쉬었다가 다시 게시해 주세요.');
  }
  if (action === 'move' && matching && !results[1].results.length) return invalid();
  if (action === 'delete' && matching) return error(403, 'BOARD_FORBIDDEN', '작성자나 방장만 게시물을 지울 수 있어요.');
  const entries = rows.map(row => ({
    id: row.id, authorId: row.author_id, authorName: row.author_name,
    kind: row.kind, color: row.color, text: row.text, strokes: JSON.parse(row.strokes) as BoardEntry['strokes'],
    createdAt: row.created_at, ...(row.placement ? { placement: parseBoardPlacement(JSON.parse(row.placement))! } : {}),
  }));
  return { status: draft && results[1].results.length ? 201 : 200, body: { entries } };
}
