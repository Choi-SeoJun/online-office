'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, Hand, X } from 'lucide-react';
import type { RoomNotification } from '@/game/multi-types';
import { newestNotificationId, pokeMessage, unreadNotifications } from '@/game/notifications';
import './notification-center.css';

export function NotificationCenter({items,onRead}:{items:RoomNotification[];onRead:(throughId:number)=>Promise<unknown>}) {
  const [open,setOpen]=useState(false),[error,setError]=useState('');
  const bell=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLElement>(null);
  const newest=newestNotificationId(items),unread=unreadNotifications(items);
  const [dismissedThrough,setDismissedThrough]=useState(newest),reading=useRef(0);
  const incoming=newest>dismissedThrough?items.find(item=>item.id===newest):undefined;
  useEffect(()=>{
    if(!open)return;
    const returnFocus=bell.current;
    const focusDialog=()=>dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const containFocus=(event:FocusEvent)=>{if(event.target instanceof Node&&!dialog.current?.contains(event.target))focusDialog();};
    focusDialog();document.addEventListener('focusin',containFocus);
    return()=>{document.removeEventListener('focusin',containFocus);returnFocus?.focus();};
  },[open]);
  useEffect(()=>{
    if(newest<=dismissedThrough)return;
    const timer=setTimeout(()=>setDismissedThrough(id=>Math.max(id,newest)),6000);
    return()=>clearTimeout(timer);
  },[newest,dismissedThrough]);
  const markRead=useCallback(async(id:number)=>{
    reading.current=id;setError('');
    try{await onRead(id);}catch{if(reading.current===id){reading.current=0;setError('읽음 표시를 저장하지 못했어요. 다시 시도해 주세요.');}}
  },[onRead]);
  useEffect(()=>{if(open&&unread&&newest>reading.current)void markRead(newest);},[open,unread,newest,markRead]);
  return <>
    <button ref={bell} className="icon-button notification-bell" aria-label={unread?`알림, 읽지 않은 알림 ${unread}개`:'알림'} aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setOpen(true);setDismissedThrough(newest);}}><Bell size={19}/>{unread>0&&<span>{unread>99?'99+':unread}</span>}</button>
    {incoming&&createPortal(<button className="poke-toast" role="status" onClick={()=>{setOpen(true);setDismissedThrough(newest);}}><span><Hand size={19}/></span><div><strong>콕!</strong><p>{pokeMessage(incoming.senderName)}</p></div><Bell size={15}/></button>,document.body)}
    {open&&createPortal(<div className="notification-backdrop" onClick={()=>setOpen(false)} onKeyDown={event=>{
      event.stopPropagation();if(event.key==='Escape'){event.preventDefault();setOpen(false);}
      if(event.key==='Tab'){
        const nodes=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[tabindex="0"]');if(!nodes?.length)return;
        const first=nodes[0],last=nodes[nodes.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    }}><section ref={dialog} className="notification-panel" role="dialog" aria-modal="true" aria-label="알림함" onClick={event=>event.stopPropagation()}><header><div><Bell size={21}/><h2>나에게 온 알림</h2></div><button aria-label="알림함 닫기" onClick={()=>setOpen(false)}><X size={20}/></button></header><p className="notification-description">동료가 건넨 작은 신호들을 모아뒀어요.</p>{error&&<div className="notification-error" role="alert">{error}<button onClick={()=>void markRead(newest)}>다시 시도</button></div>}{!items.length?<div className="notification-empty"><Hand size={34}/><strong>아직 조용한 회사예요.</strong><p>동료가 콕! 찌르면 여기에 알려드릴게요.</p></div>:<ol tabIndex={0} aria-label="받은 알림 목록">{items.map(item=><li key={item.id} className={item.readAt===null?'unread':''}><span className="notification-glyph"><Hand size={18}/></span><div><p>{pokeMessage(item.senderName)}</p><time>{new Date(item.createdAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></div>{item.readAt!==null&&<Check size={14} aria-label="읽음"/>}</li>)}</ol>}<footer>이 알림은 나에게만 보여요.</footer></section></div>,document.body)}
  </>;
}
