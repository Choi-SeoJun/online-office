'use client';

import { useCallback, useRef, useState, type ComponentProps } from 'react';
import { UpdateNews } from './update-news';
import { FaqDialog } from './faq-dialog';

/** Entry cards and both game modes share the same news/help entry points. */
export function OfficeSupport({ onOpenChange, ...props }: ComponentProps<typeof UpdateNews>) {
  const open = useRef({ news: false, faq: false }), notifyParent = useRef(onOpenChange);
  const [faqOpen, setFaqOpen] = useState(false);
  notifyParent.current = onOpenChange;
  const changeNews = useCallback((next: boolean) => {
    open.current.news = next; notifyParent.current?.(next || open.current.faq);
  }, []);
  const changeFaq = useCallback((next: boolean) => {
    open.current.faq = next; setFaqOpen(next); notifyParent.current?.(next || open.current.news);
  }, []);
  return <>
    <UpdateNews {...props} autoOpenReady={props.autoOpenReady !== false && !faqOpen} onOpenChange={changeNews} />
    <FaqDialog placement={props.placement} onOpenChange={changeFaq} />
  </>;
}
