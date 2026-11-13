'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Armchair, Building2, Check, Coffee, Copy, DoorOpen, Hand, Link, LoaderCircle, MessageCircle, Monitor, Send, Settings2, Users, Volume2, VolumeX, Wind, X } from 'lucide-react';
import type { RoomPlayer, RoomSession, RoomSnapshot } from '@/game/multi-types';
import type { AvatarStyle, OfficeScene, Point, Settings } from '@/game/types';
import { requestRoom, RoomApiError, readRoomSession, saveRoomSession, clearRoomSession, parseRoomCode, roomInviteUrl } from '@/game/multi-client';
import { createMultiController } from '@/game/multi-controller';
import { isMultiWalkable } from '@/game/multi-layout';
import { readSavedState, writeAvatarChoice, writeRankChoice } from '@/game/storage';
import { CameraControls } from './camera-controls';
import { TodoBoard } from './todo-board';
import { WorkClock } from './work-clock';
import { AvatarPicker, AvatarPortrait } from './avatar-picker';
import { RankPicker } from './rank-picker';
import { normalizeRank, type JobRank } from '@/game/ranks';
import { NotificationCenter } from './notification-center';
import { MultiplayerRoom } from './multiplayer-room';
import { FeedbackDialog } from './feedback-dialog';
import { OfficeSupport } from './office-support';
import './multiplayer-office.css';
import './multiplayer-parity.css';

type Joined = { session: RoomSession; snapshot: RoomSnapshot };
const messageOf=(error:unknown)=>error instanceof Error?error.message:'연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
const isExpired=(error:unknown)=>error instanceof RoomApiError&&['SESSION_EXPIRED','ROOM_EXPIRED','ROOM_NOT_FOUND','INVALID_SESSION','UNAUTHORIZED'].includes(error.code);

export default function MultiplayerOffice({onSolo}:{onSolo:()=>void}) {
  const [joined,setJoined]=useState<Joined|null>(null),[code,setCode]=useState(''),[name,setName]=useState('김사원');
  const [avatar,setAvatar]=useState<AvatarStyle>('short');
  const [rank,setRank]=useState<JobRank>('사원'),[bossRank,setBossRank]=useState<JobRank>('부장');
  const [roomName,setRoomName]=useState('우리 회사'),[capacity,setCapacity]=useState(8),[tab,setTab]=useState<'create'|'join'>('create');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[restoring,setRestoring]=useState(true);
  const mounted=useRef(true),entryAbort=useRef<AbortController|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;entryAbort.current?.abort();};},[]);
  useEffect(()=>{
    const savedProfile=readSavedState();setName(savedProfile?.name??'김사원');setAvatar(savedProfile?.avatar??'short');setRank(normalizeRank(savedProfile?.rank));setBossRank(normalizeRank(savedProfile?.bossRank,'부장'));
    const invited=parseRoomCode(new URLSearchParams(location.search).get('room')??'');
    if(!invited){setRestoring(false);return;}
    setCode(invited);setTab('join');const saved=readRoomSession(invited);
    if(!saved){setRestoring(false);return;}
    const abort=new AbortController();
    requestRoom<{snapshot:RoomSnapshot}>({action:'sync',code:invited,token:saved.token},abort.signal).then(({snapshot})=>setJoined({session:saved,snapshot})).catch(error=>{if(error?.name==='AbortError')return;if(isExpired(error))clearRoomSession(invited);else setError(messageOf(error));}).finally(()=>{if(!abort.signal.aborted)setRestoring(false);});
    return()=>abort.abort();
  },[]);
  const enter=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy)return;setBusy(true);setError('');
    const abort=new AbortController();entryAbort.current=abort;
    try {
      const parsed=tab==='join'?parseRoomCode(code):null;
      if(tab==='join'&&!parsed)throw new Error('8자리 참여 코드 또는 초대 링크를 입력해 주세요.');
      let result:Joined|null=null;
      const saved=parsed?readRoomSession(parsed):null;
      if(saved){try{const restored=await requestRoom<{snapshot:RoomSnapshot}>({action:'sync',code:saved.code,token:saved.token},abort.signal);result={session:saved,snapshot:restored.snapshot};}catch(error){if(!isExpired(error))throw error;clearRoomSession(saved.code);}}
      result??=await requestRoom<Joined>(tab==='create'?{action:'create',name:name.trim()||'김사원',roomName:roomName.trim()||'우리 회사',capacity,avatar,rank,bossRank}:{action:'join',code:parsed,name:name.trim()||'김사원',avatar,rank},abort.signal);
      if(!mounted.current||abort.signal.aborted)return;
      saveRoomSession(result.session);history.replaceState(null,'',`?room=${result.session.code}`);setJoined(result);
    }catch(error){if(mounted.current&&!abort.signal.aborted)setError(messageOf(error));}finally{if(mounted.current)setBusy(false);}
  };
  const exit=()=>{setJoined(null);history.replaceState(null,'','?mode=multi');setError('');};
  if(joined)return <MultiplayerRoom key={joined.session.token} initial={joined} onExit={exit}/>;
  return <main className="multi-lobby rank-entry">
    <header className="multi-brand"><span className="brand-mark"><Building2 size={23}/></span><div><strong>온라인 회사.</strong><small>오늘도, 같이 적당히.</small></div><FeedbackDialog context={{ mode: 'multi', floor: 'office' }} /></header>
    <div className="multi-lobby-art" aria-hidden="true"><div className="office-grid">{Array.from({length:16},(_,i)=><i key={i} className={i%4<2?'desk-top':'desk-bottom'}><b/><em/></i>)}</div><span>같은 공간, 각자의 딴짓.</span></div>
    <section className="multi-lobby-card">
      <div className="mode-switch" aria-label="플레이 방식"><button disabled={busy||restoring} onClick={onSolo}>혼자 쉬기</button><button aria-pressed="true">동료들과</button></div>
      <p className="multi-eyebrow">OUR LITTLE OFFICE</p><h1>같이 출근해요.<br/><em>일 얘기만 말고요.</em></h1><p className="multi-intro">각자 자리에 앉고, 잠깐 수다도 떨고.<br/>초대받은 동료들과 함께 쓰는 작은 회사예요.</p>
      <div className="room-tabs" role="tablist" aria-label="입장 방법"><button role="tab" aria-selected={tab==='create'} onClick={()=>{setTab('create');setError('');}}>회사 만들기</button><button role="tab" aria-selected={tab==='join'} onClick={()=>{setTab('join');setError('');}}>코드로 입장</button></div>
      <form onSubmit={enter}>
        <label className="multi-field">오늘의 이름<input value={name} maxLength={10} onChange={e=>setName(e.target.value)} placeholder="김사원" autoComplete="nickname" required/></label>
        <RankPicker label="나의 직급" value={rank} disabled={busy||restoring} onChange={value=>{setRank(value);writeRankChoice(value);}}/>
        {tab==='create'&&<RankPicker label="우리들의 상사의 직급은 무엇인가요?" value={bossRank} disabled={busy||restoring} onChange={setBossRank}/>}
        <AvatarPicker value={avatar} disabled={busy||restoring} onChange={value=>{setAvatar(value);writeAvatarChoice(value);}}/>
        {tab==='create'?<div className="create-fields"><label className="multi-field">회사 이름<input value={roomName} maxLength={24} onChange={e=>setRoomName(e.target.value)} required/></label><label className="multi-field">정원<select value={capacity} onChange={e=>setCapacity(Number(e.target.value))}>{Array.from({length:15},(_,i)=><option value={i+2} key={i}>{i+2}명</option>)}</select></label></div>:<label className="multi-field">참여 코드 또는 초대 링크<input value={code} onChange={e=>setCode(e.target.value)} placeholder="8자리 코드 / 초대 링크" autoComplete="off" maxLength={500}/></label>}
        {error&&<p className="multi-error" role="alert">{error}</p>}
        <button className="primary-button multi-enter" disabled={busy||restoring}>{busy||restoring?<><LoaderCircle className="loading-icon" size={18}/>{restoring?'이전 자리 확인 중':'문 여는 중'}</>:<>{tab==='create'?'우리 회사 만들기':'동료들에게 합류하기'}<ArrowRight size={18}/></>}</button>
      </form>
      <p className="multi-lobby-note"><Users size={14}/>최대 16명 · 가입 없이 코드로 초대</p><p className="multi-expiry-note">방과 대화는 만든 뒤 24시간 동안 이용할 수 있어요.</p>
      <OfficeSupport context={{mode:'multi',floor:'office'}} placement="card" autoOpenReady={!restoring && !busy} />
    </section>
  </main>;
}
