'use client';
import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { appUpdateUrl, canAutoApplyUpdate, watchAppVersion } from '../game/app-updates';
import { publicAssetPath } from '../game/hosting';
import './app-update-notice.css';

declare const __OFFICE_BUILD_ID__: string | undefined;

export function AppUpdateNotice() {
  const [version, setVersion] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (typeof __OFFICE_BUILD_ID__ === 'undefined') return;
    const address = new URL(location.href);
    if (address.searchParams.get('__office_build') === __OFFICE_BUILD_ID__) {
      address.searchParams.delete('__office_build');
      history.replaceState(history.state, '', address.href);
    }
    let interacted = false;
    const interact = () => { interacted = true; };
    window.addEventListener('pointerdown', interact, { capture: true });
    window.addEventListener('keydown', interact, { capture: true });
    const stop = watchAppVersion({
      version: __OFFICE_BUILD_ID__, url: new URL(publicAssetPath('app-version.json'), location.origin).href, window, document,
      onUpdate: (next, initial) => {
        if (next && canAutoApplyUpdate({ initial, interacted, hidden: document.hidden, href: location.href, version: next })) {
          location.replace(appUpdateUrl(location.href, next));
          return;
        }
        setVersion(next); setCollapsed(false);
      },
    });
    return () => {
      stop();
      window.removeEventListener('pointerdown', interact, { capture: true });
      window.removeEventListener('keydown', interact, { capture: true });
    };
  }, []);
  if (!version) return null;
  if (collapsed) return <button type="button" className="app-update-chip" onClick={() => setCollapsed(false)}><RefreshCw size={16}/><span>새 버전</span></button>;
  return <section className="app-update-notice" aria-label="게임 업데이트" role="status">
    <div><strong>새 버전이 준비됐어요</strong><p>작성 중인 내용을 저장한 뒤 적용해 주세요.<br/>앱을 다시 설치할 필요는 없어요.</p></div>
    <button type="button" className="app-update-apply" onClick={() => location.replace(appUpdateUrl(location.href, version))}><RefreshCw size={16}/><span>업데이트 적용</span></button>
    <button type="button" className="app-update-collapse" aria-label="업데이트 안내 접기" onClick={() => setCollapsed(true)}><X size={18}/></button>
  </section>;
}
