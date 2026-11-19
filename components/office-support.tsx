'use client';

import { useCallback, useRef, useState, type ComponentProps } from 'react';
import { UpdateNews } from './update-news';
import { FaqDialog } from './faq-dialog';
import { AppInstall } from './app-install';

/** Entry cards and both game modes share the same news/help entry points. */
export function OfficeSupport({ onOpenChange, ...props }: ComponentProps<typeof UpdateNews>) {
  const open = useRef({ news: false, faq: false, install: false }), notifyParent = useRef(onOpenChange);
  const [faqOpen, setFaqOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  notifyParent.current = onOpenChange;
  const changeNews = useCallback((next: boolean) => {
    open.current.news = next; notifyParent.current?.(next || open.current.faq || open.current.install);
  }, []);
  const changeFaq = useCallback((next: boolean) => {
    open.current.faq = next; setFaqOpen(next); notifyParent.current?.(next || open.current.news || open.current.install);
  }, []);
  const changeInstall = useCallback((next: boolean) => {
    open.current.install = next; setInstallOpen(next); notifyParent.current?.(next || open.current.news || open.current.faq);
  }, []);
  return <>
    <UpdateNews {...props} autoOpenReady={props.autoOpenReady !== false && !faqOpen && !installOpen} onOpenChange={changeNews} />
    <FaqDialog placement={props.placement} onOpenChange={changeFaq} />
    <AppInstall placement={props.placement} onOpenChange={changeInstall} />
  </>;
}
