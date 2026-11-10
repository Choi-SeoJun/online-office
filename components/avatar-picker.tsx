'use client';
import type { AvatarStyle } from '@/game/types';
import './avatar-picker.css';

export function AvatarPortrait({avatar}:{avatar:AvatarStyle}) {
  return <svg viewBox="0 0 76 76" aria-hidden="true"><circle cx="38" cy="38" r="35" fill="#e8eddd"/>{avatar==='ponytail'&&<><path d="M54 24 C72 24 68 48 58 54 C61 42 49 39 54 24Z" fill="#4b352d"/><ellipse cx="56" cy="27" rx="5" ry="4" fill="#a6b89a"/></>}<path d="M18 71V58C18 45 58 45 58 58V71" fill="#7fa694"/><path d="M31 48L38 56L45 48" fill="#f1dec2"/><rect x="32" y="41" width="12" height="13" rx="5" fill="#e5bc91"/><ellipse cx="38" cy="31" rx="17" ry="19" fill="#efcba4"/><path d={avatar==='ponytail'?'M21 31C18 12 36 8 47 14C57 18 57 29 55 34C51 22 44 23 39 18C33 25 27 26 21 31Z':'M20 31C17 16 27 10 41 12C56 12 58 24 55 32L49 24C40 26 33 23 30 21L21 31Z'} fill="#4b352d"/><circle cx="31" cy="32" r="1.7" fill="#4c4135"/><circle cx="45" cy="32" r="1.7" fill="#4c4135"/><path d="M34 41Q38 44 42 41" fill="none" stroke="#a36d50" strokeWidth="1.6" strokeLinecap="round"/><path d="M27 56L32 71M49 56L44 71" stroke="#68937d" strokeWidth="1.6"/></svg>;
}

export function AvatarPicker({value,onChange,disabled=false}:{value:AvatarStyle;onChange:(value:AvatarStyle)=>void;disabled?:boolean}) {
  return <fieldset className="avatar-picker" disabled={disabled}><legend>오늘의 캐릭터</legend><div role="radiogroup" aria-label="캐릭터 선택">{([{value:'short',label:'남성'},{value:'ponytail',label:'여성'}] as const).map(option=><button type="button" role="radio" aria-checked={value===option.value} aria-label={`${option.label} 캐릭터`} key={option.value} onClick={()=>onChange(option.value)}><AvatarPortrait avatar={option.value}/><span><strong>{option.label}</strong></span><i/></button>)}</div></fieldset>;
}
