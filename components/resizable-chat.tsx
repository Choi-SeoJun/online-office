'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode, PointerEvent, KeyboardEvent } from 'react';
import { MoveDiagonal2 } from 'lucide-react';

type Size = { width: number; height: number };
const STORAGE_KEY = 'office-chat-size-v1';
function fit(size: Size): Size {
  const maxWidth = Math.max(120, window.innerWidth - 28);
  const maxHeight = Math.max(120, window.innerHeight - (window.innerHeight<=600&&window.innerWidth>760?150:205));
  return { width: Math.max(Math.min(280,maxWidth),Math.min(size.width,maxWidth)), height:Math.max(Math.min(270,maxHeight),Math.min(size.height,maxHeight)) };
}

export function ResizableChat({children}:{children:ReactNode}) {
  const element=useRef<HTMLElement>(null), drag=useRef<{id:number;x:number;y:number;size:Size}|null>(null);
  const [size,setSize]=useState<Size|null>(null),[resizing,setResizing]=useState(false);
  useEffect(()=>{
    try { const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'); if(Number.isFinite(saved?.width)&&Number.isFinite(saved?.height))setSize(fit(saved)); } catch {}
    const resize=()=>setSize(value=>value?fit(value):value);
    window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);
  },[]);
  const save=useCallback((next:Size)=>{const fitted=fit(next);setSize(fitted);try{localStorage.setItem(STORAGE_KEY,JSON.stringify(fitted));}catch{}},[]);
  const start=(event:PointerEvent<HTMLButtonElement>)=>{
    if(event.button!==0||!element.current)return;
    event.preventDefault();event.stopPropagation();const rect=element.current.getBoundingClientRect();
    drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,size:{width:rect.width,height:rect.height}};
    event.currentTarget.setPointerCapture(event.pointerId);setResizing(true);
  };
  const move=(event:PointerEvent<HTMLButtonElement>)=>{
    const start=drag.current;if(!start||start.id!==event.pointerId)return;
    save({width:start.size.width+start.x-event.clientX,height:start.size.height+start.y-event.clientY});
  };
  const end=(event:PointerEvent<HTMLButtonElement>)=>{
    if(drag.current?.id!==event.pointerId)return;drag.current=null;setResizing(false);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const key=(event:KeyboardEvent<HTMLButtonElement>)=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||!element.current)return;
    event.preventDefault();event.stopPropagation();const rect=element.current.getBoundingClientRect(),step=event.shiftKey?40:20;
    save({width:rect.width+(event.key==='ArrowLeft'?step:event.key==='ArrowRight'?-step:0),height:rect.height+(event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0)});
  };
  return <aside ref={element} className={`room-chat${resizing?' is-resizing':''}`} aria-label="동료들과 대화" style={size?{width:size.width,height:size.height}:undefined}>
    <button type="button" className="chat-resize-handle" aria-label="대화창 크기 조절" title="모서리를 끌어 크기 조절 · 방향키로도 조절" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={()=>{drag.current=null;setResizing(false);}} onKeyDown={key}><MoveDiagonal2 size={15}/></button>
    {children}
  </aside>;
}
