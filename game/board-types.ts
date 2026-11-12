export const BOARD_COLORS = ['yellow', 'pink', 'blue', 'green', 'purple', 'ink'] as const;
export const BOARD_MAX_ENTRIES = 50;
export const BOARD_NOTE_LIMIT = 280;
export const BOARD_TEXT_LIMIT = 2000;
export const BOARD_MAX_STROKES = 32;
export const BOARD_MAX_POINTS = 700;
export const BOARD_BODY_LIMIT = 32 * 1024;

export type BoardKind = 'note' | 'text' | 'doodle';
export type BoardColor = typeof BOARD_COLORS[number];
export type BoardPoint = { x: number; y: number };
export type BoardStroke = { color: BoardColor; points: BoardPoint[] };
export type BoardDraft = { id: string; kind: BoardKind; color: BoardColor; text: string; strokes: BoardStroke[] };
export type BoardEntry = BoardDraft & { authorId: string; authorName: string; createdAt: number };

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const controls = /[\u0000-\u0009\u000b-\u001f\u007f]/;

export function boardRecord(raw: unknown): Record<string, unknown> | null {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
}

export function validBoardId(raw: unknown): raw is string {
  return typeof raw === 'string' && uuid.test(raw);
}

function isColor(raw: unknown): raw is BoardColor {
  return BOARD_COLORS.includes(raw as BoardColor);
}

function isCoordinate(raw: unknown): raw is number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 1;
}

export function parseBoardDraft(raw: unknown): BoardDraft | null {
  const value = boardRecord(raw);
  if (!value) return null;
  const { id, kind, color, strokes } = value;
  if (!validBoardId(id) || (kind !== 'note' && kind !== 'text' && kind !== 'doodle') ||
      !isColor(color) || typeof value.text !== 'string' || !Array.isArray(strokes)) return null;
  const text = value.text.replace(/\r\n?/g, '\n').trim();
  if (controls.test(text) || Array.from(text).length > (kind === 'note' ? BOARD_NOTE_LIMIT : BOARD_TEXT_LIMIT)) return null;
  if (kind !== 'doodle') return text && strokes.length === 0 ? { id, kind, color, text, strokes: [] } : null;
  if (!strokes.length || strokes.length > BOARD_MAX_STROKES) return null;
  const parsed: BoardStroke[] = [];
  let count = 0;
  for (const rawStroke of strokes) {
    const stroke = boardRecord(rawStroke);
    if (!stroke || !isColor(stroke.color) || !Array.isArray(stroke.points) || !stroke.points.length) return null;
    count += stroke.points.length;
    if (count > BOARD_MAX_POINTS) return null;
    const points: BoardPoint[] = [];
    for (const rawPoint of stroke.points) {
      const point = boardRecord(rawPoint);
      if (!point || !isCoordinate(point.x) || !isCoordinate(point.y)) return null;
      points.push({ x: Math.round(point.x * 10000) / 10000, y: Math.round(point.y * 10000) / 10000 });
    }
    parsed.push({ color: stroke.color, points });
  }
  return { id, kind, color, text, strokes: parsed };
}

export function parseBoardEntry(raw: unknown): BoardEntry | null {
  const draft = parseBoardDraft(raw);
  const value = boardRecord(raw);
  if (!draft || !value) return null;
  const { authorId, authorName, createdAt } = value;
  if ((authorId !== 'local' && !validBoardId(authorId)) || typeof authorName !== 'string' ||
      !authorName.trim() || Array.from(authorName).length > 24 || controls.test(authorName) ||
      typeof createdAt !== 'number' || !Number.isSafeInteger(createdAt) || createdAt < 0) return null;
  return { ...draft, authorId, authorName, createdAt };
}
