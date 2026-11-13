'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ClipboardList, LoaderCircle, Move, PaintBucket, Pencil, Plus, RefreshCw, Save, StickyNote, Trash2, Undo2, X } from 'lucide-react';
import type { RoomSession } from '@/game/multi-types';
import { BOARD_COLORS, BOARD_MAX_ENTRIES, BOARD_MAX_POINTS, BOARD_MAX_STROKES, BOARD_NOTE_LIMIT, BOARD_TEXT_LIMIT, parseBoardDraft, type BoardColor, type BoardEntry, type BoardPlacement, type BoardPoint, type BoardStroke } from '@/game/board-types';
import { createBoardEntry, deleteBoardEntry, listBoard, loadLocalBoard, moveBoardEntry, saveLocalBoard } from '@/game/board-client';
import { BOARD_HEIGHT, BOARD_INK, BOARD_WIDTH, drawBoard, getBoardPaintOrder, getBoardPlacement, isBoardDrawing, newBoardPlacement } from '@/game/board-render';
import './office-bulletin-board.css';

const colorNames: Record<BoardColor, string> = { yellow: '노랑', pink: '분홍', blue: '파랑', green: '초록', purple: '보라', ink: '먹색' };
const fullBoard: BoardPlacement = { x: 0, y: 0, width: 1, height: 1, canvasWidth: BOARD_WIDTH };
const previewId = '00000000-0000-4000-8000-000000000000';
type Drag = { id: string; pointer: number; start: BoardPoint; placement: BoardPlacement; next: BoardPlacement };

export function OfficeBulletinBoard({ name, session, hostId, onOpenChange, openRequest = 0, onEntriesChange }: {
  name: string; session?: RoomSession; hostId?: string; onOpenChange?: (open: boolean) => void;
  openRequest?: number; onEntriesChange?: (entries: BoardEntry[]) => void;
}) {
  const [open, setOpen] = useState(false), [entries, setEntries] = useState<BoardEntry[]>([]);
  const [kind, setKind] = useState<'note' | 'text'>('note'), [color, setColor] = useState<BoardColor>('yellow');
  const [tool, setTool] = useState<'move' | 'pen' | 'fill'>('move'), [pen, setPen] = useState<BoardColor>('ink'), [penWidth, setPenWidth] = useState(4);
  const [text, setText] = useState(''), [strokes, setStrokes] = useState<BoardStroke[]>([]);
  const [composing, setComposing] = useState(false), [loading, setLoading] = useState(false), [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [selectedId, setSelectedId] = useState(''), [confirmDelete, setConfirmDelete] = useState(false);
  const [dragPreview, setDragPreview] = useState<{ id: string; placement: BoardPlacement } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null), surface = useRef<HTMLDivElement>(null), drag = useRef<Drag | null>(null);
  const lock = useRef(false), revision = useRef(0), requestId = useRef(''), drawingId = useRef(''), activePointer = useRef<number | null>(null);
  const strokesRef = useRef(strokes); strokesRef.current = strokes;
  const currentSession = useRef(session); currentSession.current = session;
  const callbacks = useRef({ onOpenChange, onEntriesChange }); callbacks.current = { onOpenChange, onEntriesChange };
  const lastOpenRequest = useRef(openRequest);
  const length = Array.from(text).length, limit = kind === 'note' ? BOARD_NOTE_LIMIT : BOARD_TEXT_LIMIT;
  const pointCount = strokes.reduce((total, stroke) => total + stroke.points.length, 0);
  const selected = entries.find(entry => entry.id === selectedId);
  const full = entries.length >= BOARD_MAX_ENTRIES;
  const visibleEntries = getBoardPaintOrder(dragPreview ? entries.map(entry => entry.id === dragPreview.id ? { ...entry, placement: dragPreview.placement } : entry) : entries);

  const changeOpen = useCallback((value: boolean) => {
    activePointer.current = null; drag.current = null; setDragPreview(null);
    setOpen(value); setConfirmDelete(false); callbacks.current.onOpenChange?.(value);
  }, []);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (lock.current || drag.current || activePointer.current !== null) return;
    const version = ++revision.current;
    setLoading(true);
    try {
      const next = currentSession.current ? await listBoard(currentSession.current, signal) : loadLocalBoard();
      if (signal?.aborted || version !== revision.current) return;
      setEntries(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next); setLoaded(true);
    } catch (failure) {
      if (!signal?.aborted && version === revision.current) setError(failure instanceof Error ? failure.message : '게시판을 불러오지 못했어요.');
    } finally { if (!signal?.aborted && version === revision.current) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setEntries([]); setLoaded(false); setSelectedId('');
    void refresh(controller.signal);
    const timer = setInterval(() => { if (!document.hidden) void refresh(controller.signal); }, 5000);
    const storage = () => { if (!currentSession.current) void refresh(controller.signal); };
    window.addEventListener('storage', storage);
    return () => { ++revision.current; controller.abort(); clearInterval(timer); window.removeEventListener('storage', storage); };
  }, [session?.code, session?.token, refresh]);
  useEffect(() => { callbacks.current.onEntriesChange?.(entries); }, [entries]);
  useEffect(() => {
    if (openRequest > lastOpenRequest.current) { lastOpenRequest.current = openRequest; changeOpen(true); }
  }, [openRequest, changeOpen]);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const context = canvas.current?.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      const painted = dragPreview ? entries.map(entry => entry.id === dragPreview.id ? { ...entry, placement: dragPreview.placement } : entry) : entries;
      const preview: BoardEntry = { id: previewId, kind: 'doodle', color: 'ink', text: '', strokes, placement: fullBoard, authorId: 'local', authorName: name, createdAt: Number.MAX_SAFE_INTEGER };
      drawBoard(context, strokes.length ? [...painted, preview] : painted, BOARD_WIDTH, BOARD_HEIGHT);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, entries, strokes, dragPreview, name]);

  function updateStrokes(next: BoardStroke[]) { drawingId.current = ''; setNotice(''); strokesRef.current = next; setStrokes(next); }
  function point(event: PointerEvent<HTMLElement>): BoardPoint {
    const rect = surface.current!.getBoundingClientRect();
    return { x: Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * 10000) / 10000,
      y: Math.round(Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) * 10000) / 10000 };
  }
  function beginDraw(event: PointerEvent<HTMLCanvasElement>) {
    if (tool === 'move' || busy || !loaded || full || activePointer.current !== null || event.button !== 0) return;
    if (strokesRef.current.length >= BOARD_MAX_STROKES || pointCount >= BOARD_MAX_POINTS) { setNotice('그림이 꽉 찼어요. 저장하거나 한 단계 되돌려 주세요.'); return; }
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); activePointer.current = event.pointerId;
    ++revision.current; setLoading(false);
    updateStrokes([...strokesRef.current, { tool, width: penWidth, color: pen, points: [point(event)] }]);
  }
  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== event.pointerId || busy) return;
    event.preventDefault(); event.stopPropagation();
    const current = strokesRef.current, last = current.at(-1), next = point(event);
    if (!last || last.tool === 'fill' || current.reduce((n, s) => n + s.points.length, 0) >= BOARD_MAX_POINTS) return;
    const previous = last.points.at(-1)!;
    if (Math.hypot((next.x - previous.x) * BOARD_WIDTH, (next.y - previous.y) * BOARD_HEIGHT) < 2) return;
    updateStrokes([...current.slice(0, -1), { ...last, points: [...last.points, next] }]);
  }
  function endDraw(event: PointerEvent<HTMLCanvasElement>) {
    if (activePointer.current !== event.pointerId) return;
    event.stopPropagation(); activePointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  async function save(drawing: boolean) {
    if (lock.current || !loaded) return;
    const idRef = drawing ? drawingId : requestId;
    idRef.current ||= crypto.randomUUID();
    const draftKind = drawing ? 'doodle' : kind;
    const draft = parseBoardDraft({ id: idRef.current, kind: draftKind, color: drawing ? 'ink' : color, text: drawing ? '' : text,
      strokes: drawing ? strokesRef.current : [], placement: drawing ? fullBoard : newBoardPlacement({ id: idRef.current, kind: draftKind }) });
    if (!draft) { setError(drawing ? '보드에 그린 뒤 저장해 주세요.' : `내용을 ${limit}자 안으로 적어 주세요.`); return; }
    lock.current = true; ++revision.current; setBusy(true); setLoading(false); setError('');
    try {
      let next: BoardEntry[];
      if (session) next = await createBoardEntry(session, draft);
      else {
        const previous = loadLocalBoard();
        if (previous.length >= BOARD_MAX_ENTRIES) throw new Error('게시판이 꽉 찼어요. 오래된 글을 정리해 주세요.');
        next = [{ ...draft, authorId: 'local', authorName: name, createdAt: Date.now() }, ...previous];
        if (!saveLocalBoard(next)) throw new Error('이 브라우저에 저장하지 못했어요. 내용은 지우지 않았어요.');
      }
      setEntries(next); setSelectedId(draft.id);
      if (drawing) { updateStrokes([]); setTool('move'); } else { setText(''); setComposing(false); }
      idRef.current = ''; setNotice(drawing ? '보드에 그림을 저장했어요.' : '메모를 붙였어요. 원하는 곳으로 옮겨 보세요.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function move(id: string, placement: BoardPlacement) {
    if (lock.current) return;
    lock.current = true; ++revision.current; setBusy(true); setLoading(false); setError('');
    try {
      let next: BoardEntry[];
      if (session) next = await moveBoardEntry(session, id, placement);
      else { next = loadLocalBoard().map(entry => entry.id === id ? { ...entry, placement } : entry); if (!saveLocalBoard(next)) throw new Error('위치를 저장하지 못했어요.'); }
      setEntries(next); setNotice('메모 위치를 저장했어요.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '옮기지 못했어요.'); }
    finally { setDragPreview(null); lock.current = false; setBusy(false); }
  }
  function translated(placement: BoardPlacement, dx: number, dy: number): BoardPlacement {
    return { ...placement, x: Math.max(0, Math.min(1 - placement.width, placement.x + dx)), y: Math.max(0, Math.min(1 - placement.height, placement.y + dy)) };
  }
  function beginMove(event: PointerEvent<HTMLButtonElement>, entry: BoardEntry) {
    if (busy || tool !== 'move' || event.button !== 0 || drag.current) return;
    event.preventDefault(); event.stopPropagation(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    const placement = getBoardPlacement(entry);
    drag.current = { id: entry.id, pointer: event.pointerId, start: point(event), placement, next: placement };
    ++revision.current; setLoading(false); setSelectedId(entry.id); setConfirmDelete(false);
  }
  function dragMove(event: PointerEvent<HTMLButtonElement>) {
    const moving = drag.current;
    if (!moving || moving.pointer !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation(); const next = point(event);
    moving.next = translated(moving.placement, next.x - moving.start.x, next.y - moving.start.y);
    setDragPreview({ id: moving.id, placement: moving.next });
  }
  function endMove(event: PointerEvent<HTMLButtonElement>, cancel = false) {
    const moving = drag.current;
    if (!moving || moving.pointer !== event.pointerId) return;
    event.stopPropagation(); drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancel && (moving.next.x !== moving.placement.x || moving.next.y !== moving.placement.y)) void move(moving.id, moving.next);
    else setDragPreview(null);
  }
  function keyMove(event: KeyboardEvent<HTMLButtonElement>, entry: BoardEntry) {
    const direction = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[event.key];
    if (!direction) return;
    event.preventDefault(); event.stopPropagation();
    if (!busy) void move(entry.id, translated(getBoardPlacement(entry), direction[0] * (event.shiftKey ? .05 : .01), direction[1] * (event.shiftKey ? .05 : .01)));
  }
  async function remove() {
    if (lock.current || !selected) return;
    lock.current = true; ++revision.current; setBusy(true); setLoading(false); setError('');
    try {
      let next: BoardEntry[];
      if (session) next = await deleteBoardEntry(session, selected.id);
      else { next = loadLocalBoard().filter(entry => entry.id !== selected.id); if (!saveLocalBoard(next)) throw new Error('변경을 저장하지 못했어요.'); }
      setEntries(next); setSelectedId(''); setConfirmDelete(false); setNotice('게시물을 떼어냈어요.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '떼어내지 못했어요.'); }
    finally { lock.current = false; setBusy(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void save(false); }

  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild><button type="button" className="bulletin-trigger" aria-label="게시판 열기"><ClipboardList size={17} /><span>게시판</span></button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="bulletin-overlay" />
      <Dialog.Content className="bulletin-dialog" onKeyDown={event => event.stopPropagation()} onKeyUp={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}>
        <header className="bulletin-header"><div><span className="bulletin-eyebrow">우리의 작은 흔적</span><Dialog.Title>{session ? '우리 회사 게시판' : '나만의 게시판'}</Dialog.Title></div><Dialog.Close asChild><button className="bulletin-icon" aria-label="게시판 닫기"><X size={20} /></button></Dialog.Close></header>
        <Dialog.Description className="bulletin-description">{session ? '같은 방의 동료들과 함께 쓰는 벽 게시판이에요. 방이 열려 있는 동안 보관돼요.' : '벽에 메모를 붙이고 자유롭게 그려요. 이 브라우저에 저장해 두고 다시 볼 수 있어요.'}</Dialog.Description>
        <div className="bulletin-toolbar"><span>{entries.length} / {BOARD_MAX_ENTRIES}개</span><div><button className="bulletin-icon" aria-label="게시판 새로고침" disabled={loading || busy} onClick={() => { setError(''); void refresh(); }}><RefreshCw size={16} className={loading ? 'loading-icon' : ''} /></button><button className="bulletin-add" disabled={busy || !loaded || full} aria-expanded={composing} onClick={() => { setComposing(v => !v); setTool('move'); }}><Plus size={16} />{composing ? '작성창 접기' : '메모 붙이기'}</button></div></div>
        <div className="bulletin-tools" aria-label="게시판 도구">
          <div className="bulletin-tool-group">{([{ id: 'move', name: '선택·이동', icon: Move }, { id: 'pen', name: '펜', icon: Pencil }, { id: 'fill', name: '채우기', icon: PaintBucket }] as const).map(item => <button key={item.id} type="button" aria-pressed={tool === item.id} disabled={busy || !loaded || (item.id !== 'move' && full)} onClick={() => { setTool(item.id); setConfirmDelete(false); }}><item.icon size={16} />{item.name}</button>)}</div>
          <div className="bulletin-pen-row" aria-label="그림 색상">{BOARD_COLORS.map(c => <button key={c} type="button" style={{ background: BOARD_INK[c] }} aria-label={`${colorNames[c]} 그림 색`} aria-pressed={pen === c} disabled={busy} onClick={() => setPen(c)} />)}</div>
          <label className="bulletin-width">굵기<select value={penWidth} disabled={busy} onChange={event => setPenWidth(Number(event.target.value))}><option value={2}>얇게</option><option value={4}>보통</option><option value={8}>굵게</option><option value={16}>아주 굵게</option></select></label>
          <div className="bulletin-tool-group bulletin-draft-tools"><button type="button" aria-label="마지막 그리기 되돌리기" disabled={busy || !strokes.length} onClick={() => updateStrokes(strokesRef.current.slice(0, -1))}><Undo2 size={16} /></button><button type="button" aria-label="저장 전 그림 모두 지우기" disabled={busy || !strokes.length} onClick={() => updateStrokes([])}><Trash2 size={16} /></button><button type="button" className="bulletin-add" disabled={busy || !strokes.length || full} onClick={() => void save(true)}>{busy ? <LoaderCircle className="loading-icon" size={16} /> : <Save size={16} />}그림 저장</button></div>
        </div>
        {error && <p className="bulletin-error" role="alert">{error}</p>}
        {notice && <p className="bulletin-notice" role="status"><Check size={14} />{notice}</p>}
        <div className="bulletin-body">
          <section className="bulletin-workspace" aria-label="확대된 벽 게시판" aria-busy={loading && !loaded}>
            <div className="bulletin-board-scroll" tabIndex={0} aria-label="게시판 가로 스크롤 영역">
            <div className={`bulletin-surface tool-${tool}`} ref={surface} style={{ aspectRatio: `${BOARD_WIDTH} / ${BOARD_HEIGHT}` }}>
              <canvas ref={canvas} width={BOARD_WIDTH} height={BOARD_HEIGHT} className="bulletin-canvas" aria-label="벽 게시판 그리기 영역. 펜으로 그리거나 채우기로 선 안쪽을 눌러 주세요." onPointerDown={beginDraw} onPointerMove={draw} onPointerUp={endDraw} onPointerCancel={endDraw} onLostPointerCapture={() => { activePointer.current = null; }} />
              {visibleEntries.filter(entry => !isBoardDrawing(entry)).map(entry => { const p = getBoardPlacement(entry); return <button key={entry.id} type="button" className={`bulletin-note-handle ${entry.id === selectedId ? 'is-selected' : ''}`} style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.width * 100}%`, height: `${p.height * 100}%` }} aria-label={`${entry.authorName}의 ${entry.kind === 'doodle' ? '낙서' : '메모'}: ${entry.text || '그림'}. 선택 후 방향키로 이동`} tabIndex={tool === 'move' ? 0 : -1} disabled={busy} onClick={() => { setSelectedId(entry.id); setConfirmDelete(false); }} onKeyDown={event => keyMove(event, entry)} onPointerDown={event => beginMove(event, entry)} onPointerMove={dragMove} onPointerUp={event => endMove(event)} onPointerCancel={event => endMove(event, true)} onLostPointerCapture={event => endMove(event, true)} />; })}
            </div>
            </div>
            <p className="bulletin-hint"><span>넓은 게시판은 가로로 스크롤해요</span>{tool === 'move' ? '메모를 끌어 옮겨요 · 선택한 메모는 방향키로도 이동해요' : tool === 'fill' ? '같은 색으로 이어진 곳을 채워요 · 닫힌 선 안쪽을 눌러 보세요' : '보드 위에 바로 그려요 · 완성한 뒤 그림 저장을 눌러 주세요'}{strokes.length > 0 && <strong>저장 전 {strokes.length}/{BOARD_MAX_STROKES}획 · {pointCount}/{BOARD_MAX_POINTS}점</strong>}</p>
          </section>
          <aside className="bulletin-inspector">
            {composing ? <form className="bulletin-compose" onSubmit={submit}><fieldset disabled={busy}><legend>새 메모</legend><div className="bulletin-kinds"><button type="button" aria-pressed={kind === 'note'} onClick={() => { requestId.current = ''; setKind('note'); }}>포스트잇</button><button type="button" aria-pressed={kind === 'text'} onClick={() => { requestId.current = ''; setKind('text'); }}>정보 공유</button></div><div className="bulletin-palette"><span>종이 색</span>{BOARD_COLORS.filter(c => c !== 'ink').map(c => <button key={c} type="button" className={`paper-${c}`} aria-label={`${colorNames[c]} 종이`} aria-pressed={color === c} onClick={() => { requestId.current = ''; setColor(c); }}>{color === c && <Check size={13} />}</button>)}</div><label htmlFor="bulletin-text">{kind === 'note' ? '짧게 남기는 한마디' : '나누고 싶은 정보'}</label><textarea id="bulletin-text" value={text} rows={6} maxLength={limit * 2} placeholder="오늘도 무사히 퇴근합시다 ☘" onChange={event => { requestId.current = ''; setText(event.target.value); }} /><div className="bulletin-compose-foot"><span className={length > limit ? 'over-limit' : ''}>{length}/{limit}</span><button className="bulletin-add" type="submit" disabled={full || length > limit || !text.trim()}><StickyNote size={16} />붙이기</button></div></fieldset></form> : <>
              <label htmlFor="bulletin-selection">게시물 살펴보기</label><select id="bulletin-selection" value={selected?.id ?? ''} onChange={event => { setSelectedId(event.target.value); setConfirmDelete(false); }}><option value="">{entries.length ? '게시물을 선택하세요' : '첫 메모를 남겨 보세요'}</option>{entries.map(entry => <option key={entry.id} value={entry.id}>{entry.authorName} · {entry.text.slice(0, 18) || '보드 그림'}</option>)}</select>
              {selected ? <article className="bulletin-entry-detail"><strong>{selected.authorName}</strong><time dateTime={new Date(selected.createdAt).toISOString()}>{new Date(selected.createdAt).toLocaleDateString('ko-KR')}</time>{selected.text && <p>{selected.text}</p>}{isBoardDrawing(selected) ? <p>보드에 직접 그린 그림이에요.</p> : <><p className="bulletin-detail-hint">메모를 드래그하거나 아래 버튼으로 옮겨요.</p><div className="bulletin-nudge" aria-label="선택한 메모 이동">{([{ icon: ArrowLeft, label: '왼쪽', dx: -.03, dy: 0 }, { icon: ArrowUp, label: '위', dx: 0, dy: -.03 }, { icon: ArrowDown, label: '아래', dx: .0, dy: .03 }, { icon: ArrowRight, label: '오른쪽', dx: .03, dy: 0 }]).map(item => <button key={item.label} type="button" disabled={busy} aria-label={`메모를 ${item.label}${item.dx ? '으로' : '로'} 이동`} onClick={() => void move(selected.id, translated(getBoardPlacement(selected), item.dx, item.dy))}><item.icon size={17} /></button>)}</div></>}
                {(!session || selected.authorId === session.playerId || hostId === session.playerId) && (confirmDelete ? <div className="bulletin-delete-confirm"><span>이 게시물을 떼어낼까요?</span><div><button disabled={busy} onClick={() => void remove()}>떼어내기</button><button disabled={busy} onClick={() => setConfirmDelete(false)}>유지하기</button></div></div> : <button className="bulletin-remove" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={14} />게시물 떼어내기</button>)}
              </article> : <p className="bulletin-empty-hint">메모 붙이기로 생각을 남기고,<br />펜과 채우기로 보드를 꾸며요.</p>}
            </>}
          </aside>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
