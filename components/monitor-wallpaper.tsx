'use client';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { ImagePlus, LoaderCircle, Monitor, RotateCcw, Upload, X } from 'lucide-react';
import type { RoomSession } from '@/game/multi-types';
import { prepareWallpaper, saveRoomWallpaper } from '@/game/wallpaper-client';
import { writeWallpaper } from '@/game/wallpaper';
import './monitor-wallpaper.css';

export function MonitorWallpaper({ image, session, onApplied, onOpenChange }: {
  image: string | null; session?: RoomSession; onApplied: (image: string | null) => void; onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false), [preview, setPreview] = useState<string | null>(null);
  const [fit, setFit] = useState<'contain' | 'cover'>('contain'), [busy, setBusy] = useState(false), [preparing, setPreparing] = useState(false), [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null), file = useRef<File | null>(null), revision = useRef(0), locked = useRef(false), alive = useRef(true);
  const callbacks = useRef({ onApplied, onOpenChange }); callbacks.current = { onApplied, onOpenChange };
  useEffect(() => { alive.current = true; return () => { alive.current = false; revision.current++; callbacks.current.onOpenChange(false); }; }, []);
  const changeOpen = (value: boolean) => {
    if (locked.current) return;
    revision.current++; setPreparing(false); setError('');
    if (value) { setPreview(image); file.current = null; setFit('contain'); }
    setOpen(value); callbacks.current.onOpenChange(value);
  };
  const prepare = async (chosen: File, placement: 'contain' | 'cover') => {
    const version = ++revision.current; setPreparing(true); setError('');
    try { const next = await prepareWallpaper(chosen, placement); if (alive.current && version === revision.current) setPreview(next); }
    catch (failure) { if (alive.current && version === revision.current) { setPreview(null); setError(failure instanceof Error ? failure.message : '이미지를 읽지 못했어요.'); } }
    finally { if (alive.current && version === revision.current) setPreparing(false); }
  };
  const apply = async (next: string | null) => {
    if (locked.current || preparing) return;
    locked.current = true; setBusy(true); setError('');
    try {
      if (session) await saveRoomWallpaper(session, next);
      else if (!writeWallpaper(next)) throw new Error('브라우저에 저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.');
      if (!alive.current) return;
      callbacks.current.onApplied(next); locked.current = false; changeOpen(false);
    } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : '저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  };
  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild><button type="button" className="tool" aria-label="모니터 배경화면 설정"><ImagePlus size={20} strokeWidth={1.65}/><span>배경화면</span></button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="wallpaper-overlay"/><Dialog.Content className="wallpaper-dialog" onKeyDown={event => event.stopPropagation()}>
      <header><div><span className="eyebrow">MY MONITOR</span><Dialog.Title>모니터 배경화면</Dialog.Title></div><Dialog.Close asChild><button type="button" className="icon-button" disabled={busy} aria-label="배경화면 설정 닫기"><X size={20}/></button></Dialog.Close></header>
      <Dialog.Description>{session ? '내 자리의 모니터를 꾸며 보세요. 같은 방의 동료들에게도 보여요.' : '내 자리의 모니터를 꾸며 보세요. 이 브라우저에 저장돼요.'}</Dialog.Description>
      <div className="wallpaper-preview">{preview ? <img src={preview} alt="모니터 배경화면 미리보기"/> : <div><Monitor size={40} strokeWidth={1.3}/><span>나만의 풍경을 담아 보세요</span></div>}{preparing && <span className="wallpaper-preparing"><LoaderCircle className="loading-icon" size={22}/>이미지 준비 중…</span>}</div>
      <div className="wallpaper-options"><button type="button" className="soft-button" disabled={busy || preparing} onClick={() => input.current?.click()}><Upload size={16}/>이미지 선택</button><div role="group" aria-label="이미지 맞춤">{(['contain', 'cover'] as const).map(value => <button type="button" key={value} aria-pressed={fit === value} disabled={!file.current || busy || preparing} onClick={() => { setFit(value); if (file.current) void prepare(file.current, value); }}>{value === 'contain' ? '전체 보기' : '화면 채우기'}</button>)}</div></div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="모니터 배경화면 이미지" onChange={event => { const chosen = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (chosen) { file.current = chosen; void prepare(chosen, fit); } }}/>
      <p className="wallpaper-help">JPG · PNG · WebP, 최대 10MB{session && ' · 이 회사 방에서 유지돼요.'}</p>
      {error && <p className="wallpaper-error" role="alert">{error}</p>}
      <footer><button type="button" className="soft-button" disabled={busy || preparing || !image} onClick={() => void apply(null)}><RotateCcw size={15}/>기본 화면</button><button type="button" className="primary-button" disabled={busy || preparing || !preview} onClick={() => void apply(preview)}>{busy ? <><LoaderCircle size={17} className="loading-icon"/>저장 중…</> : '모니터에 적용'}</button></footer>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}
