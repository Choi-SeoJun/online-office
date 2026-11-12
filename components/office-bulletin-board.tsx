'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import { Dialog } from 'radix-ui';
import { Check, ClipboardList, FileText, LoaderCircle, Pencil, Plus, RefreshCw, StickyNote, Trash2, Undo2, X } from 'lucide-react';
import type { RoomSession } from '@/game/multi-types';
import { BOARD_COLORS, BOARD_MAX_ENTRIES, BOARD_MAX_POINTS, BOARD_MAX_STROKES, BOARD_NOTE_LIMIT, BOARD_TEXT_LIMIT, parseBoardDraft, type BoardColor, type BoardEntry, type BoardKind, type BoardPoint, type BoardStroke } from '@/game/board-types';
import { createBoardEntry, deleteBoardEntry, listBoard, loadLocalBoard, saveLocalBoard } from '@/game/board-client';
import './office-bulletin-board.css';

const ink: Record<BoardColor, string> = { yellow: '#b78918', pink: '#c66681', blue: '#4784aa', green: '#54866b', purple: '#8d6ba6', ink: '#354b45' };
const colorNames: Record<BoardColor, string> = { yellow: '노랑', pink: '분홍', blue: '파랑', green: '초록', purple: '보라', ink: '먹색' };
const kinds = [{ id: 'note' as const, name: '포스트잇', icon: StickyNote }, { id: 'text' as const, name: '정보 공유', icon: FileText }, { id: 'doodle' as const, name: '낙서', icon: Pencil }];

function Drawing({ strokes }: { strokes: BoardStroke[] }) {
  return <>{strokes.map((stroke, index) => stroke.points.length === 1
    ? <circle key={index} cx={stroke.points[0].x * 400} cy={stroke.points[0].y * 240} r="2" fill={ink[stroke.color]} />
    : <polyline key={index} points={stroke.points.map(p => `${p.x * 400},${p.y * 240}`).join(' ')} fill="none" stroke={ink[stroke.color]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}</>;
}

export function OfficeBulletinBoard({ name, session, hostId, onOpenChange }: {
  name: string; session?: RoomSession; hostId?: string; onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false), [entries, setEntries] = useState<BoardEntry[]>([]);
  const [kind, setKind] = useState<BoardKind>('note'), [color, setColor] = useState<BoardColor>('yellow');
  const [pen, setPen] = useState<BoardColor>('ink'), [text, setText] = useState(''), [strokes, setStrokes] = useState<BoardStroke[]>([]);
  const [composing, setComposing] = useState(false), [loading, setLoading] = useState(false), [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const lock = useRef(false), revision = useRef(0), requestId = useRef(''), activePointer = useRef<number | null>(null);
  const strokesRef = useRef(strokes); strokesRef.current = strokes;
  const currentSession = useRef(session); currentSession.current = session;
  const length = Array.from(text).length, limit = kind === 'note' ? BOARD_NOTE_LIMIT : BOARD_TEXT_LIMIT;
  const pointCount = strokes.reduce((total, stroke) => total + stroke.points.length, 0);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (lock.current) return;
    const version = ++revision.current;
    setLoading(true);
    try {
      const next = currentSession.current ? await listBoard(currentSession.current, signal) : loadLocalBoard();
      if (signal?.aborted || version !== revision.current) return;
      setEntries(next); setLoaded(true); setError('');
    } catch (failure) {
      if (!signal?.aborted && version === revision.current) setError(failure instanceof Error ? failure.message : '게시판을 불러오지 못했어요.');
    } finally { if (!signal?.aborted && version === revision.current) setLoading(false); }
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = setInterval(() => { if (!document.hidden) void refresh(controller.signal); }, 5000);
    const storage = () => { if (!currentSession.current) void refresh(controller.signal); };
    window.addEventListener('storage', storage);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('storage', storage); };
  }, [open, refresh]);

  function changeDraft() { requestId.current = ''; setNotice(''); }
  function updateStrokes(next: BoardStroke[]) { changeDraft(); strokesRef.current = next; setStrokes(next); }
  function point(event: PointerEvent<SVGSVGElement>): BoardPoint {
    const transform = event.currentTarget.getScreenCTM();
    const local = transform ? new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse()) : { x: 200, y: 120 };
    return { x: Math.round(Math.max(0, Math.min(1, local.x / 400)) * 10000) / 10000,
      y: Math.round(Math.max(0, Math.min(1, local.y / 240)) * 10000) / 10000 };
  }
  function beginDraw(event: PointerEvent<SVGSVGElement>) {
    if (busy || activePointer.current !== null || event.button !== 0) return;
    if (strokesRef.current.length >= BOARD_MAX_STROKES || pointCount >= BOARD_MAX_POINTS) { setNotice('그림이 꽉 찼어요. 되돌리거나 붙여 주세요.'); return; }
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); activePointer.current = event.pointerId;
    updateStrokes([...strokesRef.current, { color: pen, points: [point(event)] }]);
  }
  function draw(event: PointerEvent<SVGSVGElement>) {
    if (activePointer.current !== event.pointerId || busy) return;
    const current = strokesRef.current, last = current.at(-1), next = point(event);
    if (!last || current.reduce((n, s) => n + s.points.length, 0) >= BOARD_MAX_POINTS) return;
    const previous = last.points.at(-1)!;
    if (Math.hypot(next.x - previous.x, next.y - previous.y) < .004) return;
    updateStrokes([...current.slice(0, -1), { ...last, points: [...last.points, next] }]);
  }
  function endDraw(event: PointerEvent<SVGSVGElement>) {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !loaded) return;
    requestId.current ||= crypto.randomUUID();
    const draft = parseBoardDraft({ id: requestId.current, kind, color, text, strokes: kind === 'doodle' ? strokesRef.current : [] });
    if (!draft) { setError(kind === 'doodle' && !strokes.length ? '낙서를 그린 뒤 붙여 주세요.' : `내용을 ${limit}자 안으로 적어 주세요.`); return; }
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
      setEntries(next); setText(''); updateStrokes([]); requestId.current = ''; setComposing(false); setNotice('게시판에 붙였어요.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '붙이지 못했어요. 다시 시도해 주세요.'); }
    finally { lock.current = false; setBusy(false); }
  }

  async function remove(id: string) {
    if (lock.current) return;
    lock.current = true; ++revision.current; setBusy(true); setLoading(false); setError('');
    try {
      let next: BoardEntry[];
      if (session) next = await deleteBoardEntry(session, id);
      else { next = loadLocalBoard().filter(entry => entry.id !== id); if (!saveLocalBoard(next)) throw new Error('변경을 저장하지 못했어요.'); }
      setEntries(next); setConfirmDelete(null); setNotice('게시물을 떼어냈어요.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : '떼어내지 못했어요.'); }
    finally { lock.current = false; setBusy(false); }
  }

  return <Dialog.Root open={open} onOpenChange={value => { setOpen(value); setConfirmDelete(null); onOpenChange?.(value); }}>
    <Dialog.Trigger asChild><button type="button" className="bulletin-trigger" aria-label="게시판 열기"><ClipboardList size={17} /><span>게시판</span></button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="bulletin-overlay" />
      <Dialog.Content className="bulletin-dialog">
        <header className="bulletin-header"><div><span className="bulletin-eyebrow">우리의 작은 흔적</span><Dialog.Title>{session ? '우리 회사 게시판' : '나만의 게시판'}</Dialog.Title></div><Dialog.Close asChild><button className="bulletin-icon" aria-label="게시판 닫기"><X size={20} /></button></Dialog.Close></header>
        <Dialog.Description className="bulletin-description">{session ? '같은 방의 동료들과 글, 포스트잇, 낙서를 나눠요. 방이 열려 있는 동안 보관돼요.' : '생각나는 말도, 끄적인 그림도. 이 브라우저에 저장해 두고 다시 볼 수 있어요.'}</Dialog.Description>
        <div className="bulletin-toolbar"><span>{entries.length} / {BOARD_MAX_ENTRIES}개</span><div><button className="bulletin-icon" aria-label="게시판 새로고침" disabled={loading || busy} onClick={() => void refresh()}><RefreshCw size={16} className={loading ? 'loading-icon' : ''} /></button><button className="bulletin-add" disabled={busy || !loaded || entries.length >= BOARD_MAX_ENTRIES} aria-expanded={composing} onClick={() => setComposing(v => !v)}><Plus size={16} />{composing ? '작성창 접기' : '새로 붙이기'}</button></div></div>
        {error && <p className="bulletin-error" role="alert">{error}</p>}
        {notice && <p className="bulletin-notice" role="status"><Check size={14} />{notice}</p>}
        <div className={`bulletin-body ${composing ? 'is-composing' : ''}`}>
          {composing && <form className="bulletin-compose" onSubmit={submit}>
            <fieldset disabled={busy}><legend className="sr-only">게시물 작성</legend>
              <div className="bulletin-kinds" aria-label="게시물 종류">{kinds.map(item => <button key={item.id} type="button" aria-pressed={kind === item.id} onClick={() => { changeDraft(); setKind(item.id); }}><item.icon size={16} />{item.name}</button>)}</div>
              <div className="bulletin-palette"><span>종이 색</span>{BOARD_COLORS.filter(c => c !== 'ink').map(c => <button key={c} type="button" className={`paper-${c}`} aria-label={`${colorNames[c]} 종이`} aria-pressed={color === c} onClick={() => { changeDraft(); setColor(c); }}>{color === c && <Check size={13} />}</button>)}</div>
              {kind === 'doodle' && <div className="bulletin-sketch"><div className="bulletin-pen-row"><span>펜</span>{BOARD_COLORS.map(c => <button key={c} type="button" style={{ background: ink[c] }} aria-label={`${colorNames[c]} 펜`} aria-pressed={pen === c} onClick={() => setPen(c)} />)}<button type="button" className="sketch-tool" aria-label="마지막 선 되돌리기" disabled={!strokes.length} onClick={() => updateStrokes(strokesRef.current.slice(0, -1))}><Undo2 size={16} /></button><button type="button" className="sketch-tool" aria-label="그림 지우기" disabled={!strokes.length} onClick={() => updateStrokes([])}><Trash2 size={16} /></button></div><svg className="bulletin-canvas" viewBox="0 0 400 240" role="img" aria-label="낙서 그리기 영역. 마우스나 손가락으로 그려 주세요." onPointerDown={beginDraw} onPointerMove={draw} onPointerUp={endDraw} onPointerCancel={endDraw} onLostPointerCapture={() => { activePointer.current = null; }}><Drawing strokes={strokes} />{!strokes.length && <text x="200" y="125" textAnchor="middle" fill="#a6afa2" fontSize="14">여기에 자유롭게 끄적여요</text>}</svg><small>마우스나 손가락으로 그려요 · {pointCount}/{BOARD_MAX_POINTS}</small></div>}
              <label className="bulletin-text-label" htmlFor="bulletin-text">{kind === 'doodle' ? '한마디 덧붙이기 (선택)' : kind === 'text' ? '나누고 싶은 정보' : '짧게 남기는 한마디'}</label>
              <textarea id="bulletin-text" value={text} rows={kind === 'text' ? 7 : 4} maxLength={limit * 2} placeholder={kind === 'note' ? '오늘도 무사히 퇴근합시다 ☘' : kind === 'text' ? '동료에게 알려주고 싶은 내용을 적어 주세요.' : '이 그림의 제목은…'} onChange={event => { changeDraft(); setText(event.target.value); }} />
              <div className="bulletin-compose-foot"><span className={length > limit ? 'over-limit' : ''}>{length}/{limit}</span><button className="bulletin-add" type="submit" disabled={length > limit || (kind === 'doodle' ? !strokes.length : !text.trim())}>{busy ? <LoaderCircle className="loading-icon" size={16} /> : <StickyNote size={16} />}붙이기</button></div>
            </fieldset>
          </form>}
          <section className="bulletin-cork" aria-label="게시물 목록" aria-busy={loading && !loaded}>
            {!entries.length && <div className="bulletin-empty"><StickyNote size={38} strokeWidth={1.2} /><strong>{loading && !loaded ? '게시판을 열고 있어요' : '아직 아무도 안 붙였네요'}</strong><p>점심 메뉴 추천, 작은 응원,<br />아무 뜻 없는 낙서도 좋아요.</p>{!composing && <button className="bulletin-add" disabled={!loaded} onClick={() => setComposing(true)}>첫 포스트잇 붙이기<Plus size={15} /></button>}</div>}
            <div className="bulletin-cards">{entries.map(entry => <article key={entry.id} className={`bulletin-card paper-${entry.color} kind-${entry.kind}`}><i className="bulletin-pin" /><header><span>{kinds.find(k => k.id === entry.kind)?.name}</span>{(!session || entry.authorId === session.playerId || hostId === session.playerId) && <button className="bulletin-card-remove" disabled={busy} aria-label={`${entry.authorName}의 게시물 떼어내기`} onClick={() => setConfirmDelete(entry.id)}><X size={14} /></button>}</header>{entry.kind === 'doodle' && <svg viewBox="0 0 400 240" className="bulletin-drawing" role="img" aria-label={`${entry.authorName}의 낙서`}><Drawing strokes={entry.strokes} /></svg>}{entry.text && <p>{entry.text}</p>}<footer><strong>{entry.authorName}</strong><time dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}</time></footer>{confirmDelete === entry.id && <div className="bulletin-delete-confirm"><span>이 게시물을 떼어낼까요?</span><div><button disabled={busy} onClick={() => void remove(entry.id)}>떼어내기</button><button disabled={busy} onClick={() => setConfirmDelete(null)}>유지하기</button></div></div>}</article>)}</div>
          </section>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
