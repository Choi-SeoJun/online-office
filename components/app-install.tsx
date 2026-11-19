'use client';

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { Check, Copy, Download, LoaderCircle, Share, Smartphone, X } from 'lucide-react';
import { createAppInstallController, type InstallResult, type InstallSnapshot } from '../game/app-install';
import { publicAssetPath } from '../game/hosting';
import { restoreCollapsedMenuFocus } from './office-dialog-focus';
import './app-install.css';

type Controller = ReturnType<typeof createAppInstallController>;
const initial: InstallSnapshot = { platform: 'desktop', installed: false, canPrompt: false, pending: false, ready: false };
const initialSnapshot = () => initial;
const noSubscription = () => () => {};
const unavailable = async (): Promise<InstallResult> => 'unavailable';
const InstallContext = createContext({ state: initial, install: unavailable });

/** Mounted above mode selection so a captured browser prompt is not lost when
 * entering a room, leaving a game, or switching between solo and multiplayer. */
export function AppInstallProvider({ children }: { children: ReactNode }) {
  const [controller, setController] = useState<Controller | null>(null);
  useEffect(() => {
    const next = createAppInstallController({
      events: window,
      display: window.matchMedia('(display-mode: standalone), (display-mode: minimal-ui), (display-mode: fullscreen)'),
      navigator,
    });
    setController(next);
    return () => next.dispose();
  }, []);
  const state = useSyncExternalStore(controller?.subscribe ?? noSubscription, controller?.getSnapshot ?? initialSnapshot, initialSnapshot);
  return <InstallContext.Provider value={{ state, install: controller?.install ?? unavailable }}>{children}</InstallContext.Provider>;
}

export function AppInstall({ placement = 'tool', onOpenChange }: {
  placement?: 'card' | 'tool'; onOpenChange?: (open: boolean) => void;
}) {
  const { state, install } = useContext(InstallContext);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<InstallResult | null>(null);
  const [copied, setCopied] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [address, setAddress] = useState('');
  const openRef = useRef(false), notify = useRef(onOpenChange);
  notify.current = onOpenChange;
  function changeOpen(next: boolean) {
    openRef.current = next; setOpen(next); notify.current?.(next);
    if (!next) { setCopied('idle'); setResult(null); }
  }
  useEffect(() => { setAddress(new URL(publicAssetPath(''), location.origin).href); }, []);
  useEffect(() => () => { if (openRef.current) notify.current?.(false); }, []);
  useEffect(() => {
    if (state.installed && openRef.current) {
      openRef.current = false; setOpen(false); notify.current?.(false);
    }
  }, [state.installed]);

  async function startInstall() {
    const request = install(); // Synchronous native prompt during the user gesture.
    setResult(null); changeOpen(true);
    const next = await request;
    if (openRef.current) setResult(next);
  }
  async function copyAddress() {
    try { await navigator.clipboard.writeText(address); if (openRef.current) setCopied('copied'); }
    catch { if (openRef.current) setCopied('manual'); }
  }
  if (!state.ready || state.installed) return null;
  const ios = state.platform === 'ios';
  const title = ios ? '홈 화면에 추가' : '앱 설치';
  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild>
      <button type="button" className={`install-trigger placement-${placement}`} aria-label={title} disabled={state.pending}
        onClick={event => { if (state.canPrompt) { event.preventDefault(); void startInstall(); } }}>
        <Smartphone size={17} aria-hidden="true" /><span>{title}</span>
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="install-overlay" />
      <Dialog.Content className="install-dialog" onCloseAutoFocus={restoreCollapsedMenuFocus}>
        <header className="install-header">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Close asChild><button type="button" className="install-close" aria-label="앱 설치 안내 닫기"><X size={20} /></button></Dialog.Close>
        </header>
        <div className="install-body">
          <div className="install-identity"><img src={publicAssetPath('icons/office-192.png')} width="60" height="60" alt="" /><div><strong>온라인 회사</strong><span>오늘도 적당히, 잠깐 쉬어 가요.</span></div></div>
          <Dialog.Description className="install-description">홈 화면에서 한 번에 출근해요. 아이콘을 누르면 앱처럼 게임이 열려요.</Dialog.Description>
          {state.canPrompt || state.pending ? <button type="button" className="install-primary" disabled={state.pending} onClick={() => void startInstall()}>{state.pending ? <LoaderCircle className="loading-icon" size={18} /> : <Download size={18} />}<span>{state.pending ? '설치창을 확인해 주세요' : '설치하기'}</span></button> : null}
          <p className="install-status" role="status">{result === 'dismissed' ? '설치를 취소했어요. 원할 때 브라우저 메뉴에서 다시 설치할 수 있어요.' : result === 'error' ? '설치창을 열지 못했어요. 아래 방법으로 설치해 주세요.' : result === 'accepted' ? '설치 요청을 보냈어요. 설치가 끝나면 홈 화면에서 온라인 회사를 열어 주세요.' : ''}</p>
          {ios ? <section className="install-steps">
            <h3>아이폰 · 아이패드</h3>
            <ol>
              <li><strong>Safari</strong>에서 이 페이지를 열어 주세요.</li>
              <li><Share size={16} aria-hidden="true" /> <strong>공유</strong> 메뉴에서 <strong>홈 화면에 추가</strong>를 눌러 주세요. 보이지 않으면 메뉴를 더 내려 보세요.</li>
              <li><strong>웹 앱으로 열기</strong>가 보이면 켠 뒤 <strong>추가</strong>를 눌러 주세요.</li>
            </ol>
          </section> : <section className="install-steps">
            <h3>{state.platform === 'android' ? '안드로이드에서 직접 설치하기' : '브라우저에서 직접 설치하기'}</h3>
            {state.platform === 'android' ? <ol>
              <li>이 페이지를 <strong>Chrome</strong>에서 열어 주세요.</li>
              <li>오른쪽 위 <strong>⋮ 메뉴</strong>에서 <strong>홈 화면에 추가</strong> 또는 <strong>앱 설치</strong>를 선택해 주세요.</li>
              <li><strong>설치</strong>를 누른 뒤 홈 화면의 온라인 회사 아이콘을 열어 주세요.</li>
            </ol> : <p>Chrome·Edge의 주소창 설치 아이콘이나 브라우저 메뉴의 <strong>앱 설치</strong>를 이용해 주세요. 메뉴 이름은 브라우저에 따라 다를 수 있어요.</p>}
            {!state.canPrompt && !state.pending && <p className="install-hint">설치 버튼이 바로 나타나지 않을 수 있어요. 이미 설치했다면 홈 화면의 아이콘으로 열어 주세요.</p>}
          </section>}
          <div className="install-copy"><label htmlFor={`install-address-${placement}`}>다른 브라우저에서 열 때</label><div><input id={`install-address-${placement}`} aria-label="게임 설치 주소" value={address} readOnly onFocus={event => event.currentTarget.select()} /><button type="button" onClick={() => void copyAddress()}>{copied === 'copied' ? <Check size={16} /> : <Copy size={16} />}<span>{copied === 'copied' ? '복사 완료' : '주소 복사'}</span></button></div><span role="status">{copied === 'manual' ? '주소를 길게 눌러 직접 복사해 주세요.' : copied === 'copied' ? '주소를 복사했어요.' : ''}</span></div>
          <p className="install-footnote">설치 후에도 인터넷 연결이 필요해요.</p>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
