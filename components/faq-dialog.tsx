'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowUpRight, Check, Copy, HelpCircle, Monitor, X } from 'lucide-react';
import './faq-dialog.css';

const CHROME_SYSTEM_ADDRESS = 'chrome://settings/system';

export function FaqDialog({ placement = 'tool', onOpenChange }: {
  placement?: 'card' | 'tool'; onOpenChange?: (open: boolean) => void;
}) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const openRef = useRef(false), notifyParent = useRef(onOpenChange);
  notifyParent.current = onOpenChange;
  useEffect(() => () => { if (openRef.current) notifyParent.current?.(false); }, []);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(CHROME_SYSTEM_ADDRESS);
      if (openRef.current) setCopyStatus('copied');
    } catch {
      if (openRef.current) setCopyStatus('manual');
    }
  }

  return <Dialog.Root onOpenChange={open => {
    openRef.current = open; setCopyStatus('idle'); notifyParent.current?.(open);
  }}>
    <Dialog.Trigger asChild>
      <button type="button" className={`faq-trigger placement-${placement}`} aria-label="자주 들어오는 문의사항">
        <HelpCircle size={17} aria-hidden="true" /><span>{placement === 'card' ? '자주 들어오는 문의사항' : '자주 묻는 질문'}</span>
        {placement === 'card' && <ArrowUpRight size={15} aria-hidden="true" />}
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="faq-overlay" />
      <Dialog.Content className="faq-dialog">
        <header className="faq-header">
          <div><span className="faq-eyebrow">조금 더 편안한 회사 생활</span><Dialog.Title>자주 들어오는 문의사항</Dialog.Title></div>
          <Dialog.Close asChild><button type="button" className="faq-close" aria-label="문의사항 닫기"><X size={20} /></button></Dialog.Close>
        </header>
        <Dialog.Description className="faq-intro">이용하면서 궁금했던 점을 여기서 확인해 보세요.</Dialog.Description>
        <div className="faq-body">
          <article className="faq-answer">
            <span className="faq-platform"><Monitor size={14} aria-hidden="true" />PC용 Chrome</span>
            <h3><span aria-hidden="true">Q.</span> 크롬으로 실행하면 렉이 너무 심하게 걸려요!</h3>
            <p>그래픽 가속을 켜면 컴퓨터의 그래픽 처리 기능을 활용해 더 부드럽게 플레이하는 데 도움이 될 수 있어요.</p>
            <ol>
              <li>아래 주소를 복사해 <strong>Chrome 주소창</strong>에 붙여 넣고 Enter를 눌러 주세요.<div className="faq-address"><input aria-label="Chrome 시스템 설정 주소" readOnly value={CHROME_SYSTEM_ADDRESS} onFocus={event => event.currentTarget.select()} spellCheck={false} /><button type="button" onClick={() => void copyAddress()}>{copyStatus === 'copied' ? <Check size={16} /> : <Copy size={16} />}<span>{copyStatus === 'copied' ? '복사 완료' : '주소 복사'}</span></button></div><span className="faq-alternative">또는 Chrome의 ⋮ 메뉴 → 설정 → 시스템으로 들어가세요.</span><span className="faq-copy-status" role="status">{copyStatus === 'copied' ? '주소를 복사했어요. Chrome 주소창에 붙여 넣어 주세요.' : copyStatus === 'manual' ? '주소를 선택해서 직접 복사해 주세요.' : ''}</span></li>
              <li><strong>‘가능한 경우 그래픽 가속 사용’</strong>을 켜 주세요.</li>
              <li><strong>‘다시 시작’</strong> 버튼을 눌러 Chrome을 재실행한 뒤, 회사에 다시 접속해 주세요.</li>
            </ol>
            <div className="faq-tip">게임 안의 <strong>설정 → 화면 품질 → 자동</strong>도 함께 사용해 보세요. 성능에 맞춰 화질과 효과가 조절돼요.</div>
            <a className="faq-source" href="https://support.google.com/meet/answer/9302964?hl=ko" target="_blank" rel="noopener noreferrer">Google 공식 그래픽 가속 안내<ArrowUpRight size={13} aria-hidden="true" /></a>
          </article>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
