'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCheck, ChevronDown, Inbox, LockKeyhole, LogOut, MessageSquareText, RefreshCw, Undo2 } from 'lucide-react';
import type { FeedbackCategory, FeedbackRecord, FeedbackStatus } from '../game/feedback-types';
import './feedback-admin.css';

type Filter = 'all' | FeedbackStatus;
type Listing = { items: FeedbackRecord[]; nextCursor: number | null; counts: { new: number; reviewed: number } };
const categories: Record<FeedbackCategory, string> = { bug: '불편한 점', idea: '개선 제안', other: '기타' };
const signIn = '/signin-with-chatgpt?return_to=%2Fadmin%2Ffeedback';
const signOut = '/signout-with-chatgpt?return_to=%2Fadmin%2Ffeedback';

async function readResponse(response: Response) {
  if (response.status === 401 || response.status === 403) throw new Error('관리자 로그인 상태를 확인해 주세요. 다시 로그인한 뒤 이용할 수 있어요.');
  if (!response.ok) throw new Error('건의함을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
  return response.json();
}

export default function FeedbackAdmin() {
  const [filter, setFilter] = useState<Filter>('new');
  const [data, setData] = useState<Listing>({ items: [], nextCursor: null, counts: { new: 0, reviewed: 0 } });
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false), [pending, setPending] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const activeRequest = useRef<AbortController | null>(null);
  const mutationRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async (selected: Filter, before: number | null = null) => {
    activeRequest.current?.abort();
    const controller = new AbortController(); activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setLoading(true); setError('');
    try {
      const query = new URLSearchParams({ status: selected });
      if (before !== null) query.set('before', String(before));
      const response = await fetch(`/api/admin/feedback?${query}`, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal });
      const next = await readResponse(response) as Listing;
      if (activeRequest.current !== controller || !mounted.current) return;
      setData(previous => ({ ...next, items: before === null ? next.items : [...previous.items, ...next.items.filter(item => !previous.items.some(old => old.id === item.id))] }));
      setLoaded(true);
    } catch (cause) {
      if (activeRequest.current !== controller || !mounted.current) return;
      setError(controller.signal.aborted ? '응답이 늦어지고 있어요. 새로고침을 눌러 다시 시도해 주세요.' : cause instanceof Error ? cause.message : '건의함을 불러오지 못했어요.');
    } finally {
      clearTimeout(timeout);
      if (activeRequest.current === controller && mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; activeRequest.current?.abort(); mutationRequest.current?.abort(); };
  }, []);
  useEffect(() => {
    setData(previous => ({ ...previous, items: [], nextCursor: null })); setLoaded(false); setNotice('');
    void load(filter);
  }, [filter, load]);

  const update = async (item: FeedbackRecord) => {
    if (mutationRequest.current) return;
    const status: FeedbackStatus = item.status === 'new' ? 'reviewed' : 'new';
    const controller = new AbortController(); mutationRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    setPending(item.id); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/feedback', { method: 'PATCH', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, status }) });
      await readResponse(response);
      if (!mounted.current) return;
      setNotice(status === 'reviewed' ? '검토 완료로 표시했어요.' : '새 의견으로 되돌렸어요.');
      await load(filter);
    } catch (cause) {
      if (mounted.current) setError(controller.signal.aborted ? '처리 결과를 확인하지 못했어요. 새로고침 후 상태를 확인해 주세요.' : cause instanceof Error ? cause.message : '상태를 변경하지 못했어요.');
    } finally {
      clearTimeout(timeout); mutationRequest.current = null;
      if (mounted.current) setPending(null);
    }
  };

  return <main className="feedback-admin-shell">
    <div className="feedback-admin-layout">
      <nav className="feedback-admin-top" aria-label="관리자 화면 이동">
        <a href="https://choi-seojun.github.io/online-office/"><ArrowLeft size={16} />회사로 돌아가기</a>
        <a href={signOut} target="_top"><LogOut size={15} />로그아웃</a>
      </nav>
      <header className="feedback-admin-heading">
        <div className="feedback-admin-mark"><Inbox size={29} /></div>
        <div><span className="feedback-admin-eyebrow"><LockKeyhole size={12} />운영자 전용</span><h1>우리 회사 건의함</h1><p>조금 더 쉬어가기 좋은 회사로, 한 이야기씩.</p></div>
      </header>
      <section className="feedback-admin-summary" aria-label="건의 현황">
        <div><MessageSquareText size={19} /><span>새 의견</span><strong>{loaded ? data.counts.new : '—'}</strong></div>
        <div><CheckCheck size={20} /><span>검토 완료</span><strong>{loaded ? data.counts.reviewed : '—'}</strong></div>
      </section>
      <div className="feedback-admin-toolbar">
        <div className="feedback-admin-filters" role="group" aria-label="건의 상태">
          {(['new', 'reviewed', 'all'] as const).map(value => <button key={value} aria-pressed={filter === value} disabled={pending !== null} onClick={() => setFilter(value)}>{value === 'new' ? '새 의견' : value === 'reviewed' ? '검토 완료' : '전체'}</button>)}
        </div>
        <button className="feedback-admin-refresh" disabled={loading || pending !== null} onClick={() => void load(filter)}><RefreshCw size={15} className={loading ? 'feedback-refreshing' : undefined} />새로고침</button>
      </div>
      {error && <div className="feedback-admin-error" role="alert"><p>{error}</p>{/로그인/.test(error) && <a href={signIn} target="_top">관리자 로그인</a>}</div>}
      <p className="feedback-admin-notice" role="status">{notice || (loading ? '건의함을 불러오고 있어요…' : '')}</p>
      <section className="feedback-admin-list" aria-label="접수된 건의" aria-busy={loading}>
        {data.items.map(item => <article className="feedback-admin-card" key={item.id}>
          <header><div className="feedback-admin-badges"><span className={`feedback-category feedback-category-${item.category}`}>{categories[item.category]}</span><span className="feedback-admin-context">{item.mode === 'solo' ? '혼자 쉬기' : '동료들과'} · {item.floor === 'roof' ? '옥상' : '사무실'}</span></div><time dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></header>
          <p className="feedback-admin-message">{item.message}</p>
          <footer><span>{item.status === 'reviewed' ? <><Check size={14} />검토 완료</> : <><span className="feedback-new-dot" />새 의견</>}</span><button disabled={pending !== null || loading} onClick={() => void update(item)}>{item.status === 'reviewed' ? <Undo2 size={15} /> : <Check size={15} />}{pending === item.id ? '처리 중…' : item.status === 'reviewed' ? '새 의견으로 되돌리기' : '검토 완료로 표시'}</button></footer>
        </article>)}
        {!loading && loaded && data.items.length === 0 && <div className="feedback-admin-empty"><Inbox size={34} /><h2>{filter === 'new' ? '새로 도착한 의견이 없어요.' : filter === 'reviewed' ? '아직 검토 완료한 의견이 없어요.' : '첫 이야기를 기다리고 있어요.'}</h2><p>사용자가 건의함에 남긴 이야기가 여기에 모여요.</p></div>}
      </section>
      {data.nextCursor !== null && <button className="feedback-admin-more" disabled={loading || pending !== null} onClick={() => void load(filter, data.nextCursor)}>{loading ? '불러오는 중…' : '이전 의견 더 보기'}<ChevronDown size={16} /></button>}
      <p className="feedback-admin-private"><LockKeyhole size={12} />이 내용은 운영자에게만 보이며, 다른 이용자에게 공개되지 않아요.</p>
    </div>
  </main>;
}
