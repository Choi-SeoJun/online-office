'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowUpRight, CalendarDays, ChevronDown, Heart, Megaphone, MessageSquarePlus, Sparkles, Wrench, X } from 'lucide-react';
import { formatUpdateDate, hasUnreadUpdates, markUpdatesRead, publishedUpdateDays, nextUpdateReleaseTime } from '@/game/updates';
import type { FeedbackContext } from '@/game/feedback-types';
import { FeedbackDialog } from './feedback-dialog';
import './update-news.css';

export function UpdateNews({ context, placement = 'tool', autoOpenReady = true, onOpenChange }: {
  context: FeedbackContext; placement?: 'card' | 'tool'; autoOpenReady?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const [days, setDays] = useState<ReturnType<typeof publishedUpdateDays>>([]);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const openRef = useRef(false);
  const notifyParent = useRef(onOpenChange);
  notifyParent.current = onOpenChange;

  // Automatic and manual opening share acknowledgement and game-pause behavior.
  const changeOpen = useCallback((next: boolean) => {
    if (next) {
      const published = publishedUpdateDays(Date.now());
      setDays(published);
      if (published[0]) markUpdatesRead(published[0].date);
      setUnread(false);
    }
    openRef.current = next;
    setOpen(next);
    notifyParent.current?.(next);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const now = Date.now();
      const published = publishedUpdateDays(now);
      const latest = published[0]?.date;
      const pending = !!latest && hasUnreadUpdates(latest);
      setUnread(pending);
      // Keep an open notice stable; a new release can be read after closing it.
      if (!openRef.current) setDays(published);
      const blocked = !autoOpenReady || document.hidden || !!document.querySelector('[role="dialog"], [role="alertdialog"]');
      if (pending && !openRef.current && !blocked) changeOpen(true);
      const nextRelease = nextUpdateReleaseTime(now);
      const untilRelease = nextRelease === undefined ? 60_000 : Math.max(1, nextRelease - now);
      // Retry quietly after another dialog closes; also handle a changed device clock.
      timer = setTimeout(refresh, Math.min(untilRelease, pending && !document.hidden ? 1_000 : 60_000));
    };
    // Let restoration/render effects settle before acknowledging an automatic notice.
    timer = setTimeout(refresh, 0);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [autoOpenReady, changeOpen]);

  useEffect(() => () => {
    if (openRef.current) notifyParent.current?.(false);
  }, []);

  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild>
      <button type="button" className={`update-news-trigger placement-${placement}`} aria-label="최근 업데이트 소식" title={unread ? '읽지 않은 업데이트 소식이 있어요' : '날짜별 업데이트 소식'}>
        <Megaphone size={17} /><span>{placement === 'card' ? '최근 업데이트 소식' : '업데이트 소식'}</span>
        {unread && <span className="updates-new">새 소식</span>}
        {placement === 'card' && <ArrowUpRight size={15} />}
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="updates-overlay" />
      <Dialog.Content className="updates-dialog">
        <header className="updates-header"><div><span className="updates-eyebrow">조금씩 좋아지는 우리 회사</span><Dialog.Title>최근 업데이트 소식</Dialog.Title></div><Dialog.Close asChild><button className="updates-close" aria-label="업데이트 소식 닫기"><X size={21} /></button></Dialog.Close></header>
        <Dialog.Description className="updates-intro">새로 생긴 즐거움과 더 편해진 점을 모았어요.<br />새 공지는 매일 오전 4시(한국 시간)에 공개돼요.</Dialog.Description>
        <div className="updates-scroll">
          {days.length === 0 && <p className="updates-empty">아직 공개된 업데이트 소식이 없어요.</p>}
          {days.map((day, index) => <details key={day.date} className="updates-day" open={index === 0}>
            <summary><div><CalendarDays size={18} /><h3><time dateTime={day.date}>{formatUpdateDate(day.date)}</time><span> 업데이트 내용</span></h3></div><ChevronDown size={17} /></summary>
            <div className="updates-day-content">
              {day.added.length > 0 && <section aria-label="추가된 기능"><h4><Sparkles size={15} />추가된 기능</h4><ul>{day.added.map(item => <li key={item}>{item}</li>)}</ul></section>}
              {day.fixed.length > 0 && <section aria-label="수정 및 개선"><h4><Wrench size={15} />수정 및 개선</h4><ul>{day.fixed.map(item => <li key={item}>{item}</li>)}</ul></section>}
            </div>
          </details>)}
          <footer className="updates-invitation"><Heart size={21} strokeWidth={1.5} /><strong>여러분의 소중한 의견<br className="updates-mobile-break" /> 마구마구 남겨주세요!</strong><p>작은 불편도, 엉뚱한 아이디어도 좋아요.<br />남겨주신 이야기는 관리자만 확인해요.</p><FeedbackDialog context={context} trigger={<button type="button" className="updates-feedback"><MessageSquarePlus size={17} />의견 남기기<ArrowUpRight size={16} /></button>} /></footer>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
