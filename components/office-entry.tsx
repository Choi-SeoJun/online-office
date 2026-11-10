'use client';
import { lazy, Suspense, useEffect, useState } from 'react';
import OfficeGame from './office-game';
import './multiplayer-office.css';
const MultiplayerOffice = lazy(()=>import('./multiplayer-office'));

export default function OfficeEntry() {
  const [mode,setMode]=useState<'solo'|'multi'|null>(null);
  useEffect(()=>{const read=()=>setMode(new URLSearchParams(location.search).has('room')||new URLSearchParams(location.search).get('mode')==='multi'?'multi':'solo');read();window.addEventListener('popstate',read);return()=>window.removeEventListener('popstate',read);},[]);
  const change=(next:'solo'|'multi')=>{history.pushState(null,'',next==='multi'?`${location.pathname}?mode=multi`:location.pathname);setMode(next);};
  if(!mode) return <main className="boot">사무실 문을 열고 있어요.</main>;
  return mode==='solo'?<OfficeGame onMultiplayer={()=>change('multi')}/>:<Suspense fallback={<main className="boot">동료들의 회사를 준비하고 있어요.</main>}><MultiplayerOffice onSolo={()=>change('solo')}/></Suspense>;
}
