import { BOARD_MAX_ENTRIES, boardRecord, parseBoardDraft, parseBoardEntry, parseBoardPlacement, validBoardId, type BoardDraft, type BoardEntry, type BoardPlacement } from './board-types.ts';
import { requestRoom, RoomApiError } from './multi-client.ts';
import type { RoomSession } from './multi-types.ts';

const localKey = 'office-personal-board-v1';
type BoardSession = Pick<RoomSession, 'code' | 'token'>;

function parseEntries(raw: unknown, local: boolean): BoardEntry[] | null {
  if (!Array.isArray(raw) || raw.length > BOARD_MAX_ENTRIES) return null;
  const entries: BoardEntry[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    const entry = parseBoardEntry(item);
    if (!entry || ids.has(entry.id) || local !== (entry.authorId === 'local')) return null;
    ids.add(entry.id);
    entries.push(entry);
  }
  return entries;
}

async function requestBoard(session: BoardSession, operation: { action: 'list' } | { action: 'create'; draft: BoardDraft } | { action: 'delete'; id: string } | { action: 'move'; id: string; placement: BoardPlacement }, signal?: AbortSignal) {
  const result = await requestRoom<unknown>({ ...operation, code: session.code, token: session.token }, signal, 'board');
  const entries = parseEntries(boardRecord(result)?.entries, false);
  if (!entries) throw new RoomApiError('INVALID_RESPONSE', 200, '게시판을 불러오지 못했어요. 다시 시도해 주세요.');
  return entries;
}

export function listBoard(session: BoardSession, signal?: AbortSignal) {
  return requestBoard(session, { action: 'list' }, signal);
}

export async function createBoardEntry(session: BoardSession, draft: BoardDraft, signal?: AbortSignal) {
  const entry = parseBoardDraft(draft);
  if (!entry) throw new RoomApiError('INVALID_REQUEST', 400, '게시물 내용을 확인해 주세요.');
  return requestBoard(session, { action: 'create', draft: entry }, signal);
}

export async function deleteBoardEntry(session: BoardSession, id: string, signal?: AbortSignal) {
  if (!validBoardId(id)) throw new RoomApiError('INVALID_REQUEST', 400, '게시물을 확인해 주세요.');
  return requestBoard(session, { action: 'delete', id }, signal);
}

export async function moveBoardEntry(session: BoardSession, id: string, placement: BoardPlacement, signal?: AbortSignal) {
  const position = parseBoardPlacement(placement);
  if (!validBoardId(id) || !position) throw new RoomApiError('INVALID_REQUEST', 400, '게시물 위치를 확인해 주세요.');
  return requestBoard(session, { action: 'move', id, placement: position }, signal);
}

export function loadLocalBoard(storage?: Pick<Storage, 'getItem'>): BoardEntry[] {
  try {
    const saved = (storage ?? globalThis.localStorage)?.getItem(localKey);
    return saved ? parseEntries(JSON.parse(saved), true) ?? [] : [];
  } catch {
    return [];
  }
}

export function saveLocalBoard(entries: BoardEntry[], storage?: Pick<Storage, 'setItem'>): boolean {
  const validated = parseEntries(entries, true);
  if (!validated) return false;
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    target.setItem(localKey, JSON.stringify(validated));
    return true;
  } catch {
    return false;
  }
}
