'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Armchair, Building2, Check, Coffee, Copy, DoorOpen, Hand, Link, LoaderCircle, MessageCircle, Monitor, Send, Settings2, Users, Volume2, VolumeX, Wind, X } from 'lucide-react';
import type { RoomPlayer, RoomSession, RoomSnapshot } from '@/game/multi-types';
import type { AvatarStyle, OfficeScene, Point, Settings } from '@/game/types';
import { requestRoom, RoomApiError, readRoomSession, saveRoomSession, clearRoomSession, parseRoomCode, roomInviteUrl } from '@/game/multi-client';
import { createMultiController } from '@/game/multi-controller';
import { isMultiWalkable } from '@/game/multi-layout';
import { readSavedState, writeAvatarChoice } from '@/game/storage';
import { CameraControls } from './camera-controls';
import { TodoBoard } from './todo-board';
import { WorkClock } from './work-clock';
import { AvatarPicker, AvatarPortrait } from './avatar-picker';
import { NotificationCenter } from './notification-center';
import './multiplayer-office.css';

type Joined = { session: RoomSession; snapshot: RoomSnapshot };
const messageOf=(error:unknown)=>error instanceof Error?error.message:'연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
const isExpired=(error:unknown)=>error instanceof RoomApiError&&['SESSION_EXPIRED','ROOM_EXPIRED','ROOM_NOT_FOUND','INVALID_SESSION','UNAUTHORIZED'].includes(error.code);

export default function MultiplayerOffice({onSolo}:{onSolo:()=>void}) {
  const [joined,setJoined]=useState<Joined|null>(null),[code,setCode]=useState(''),[name,setName]=useState('김사원');
  const [avatar,setAvatar]=useState<AvatarStyle>('short');
  const [roomName,setRoomName]=useState('우리 회사'),[capacity,setCapacity]=useState(8),[tab,setTab]=useState<'create'|'join'>('create');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[restoring,setRestoring]=useState(true);
  const mounted=useRef(true),entryAbort=useRef<AbortController|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;entryAbort.current?.abort();};},[]);
  useEffect(()=>{
    const savedProfile=readSavedState();setName(savedProfile?.name??'김사원');setAvatar(savedProfile?.avatar??'short');
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
      result??=await requestRoom<Joined>(tab==='create'?{action:'create',name:name.trim()||'김사원',roomName:roomName.trim()||'우리 회사',capacity,avatar}:{action:'join',code:parsed,name:name.trim()||'김사원',avatar},abort.signal);
      if(!mounted.current||abort.signal.aborted)return;
      saveRoomSession(result.session);history.replaceState(null,'',`?room=${result.session.code}`);setJoined(result);
    }catch(error){if(mounted.current&&!abort.signal.aborted)setError(messageOf(error));}finally{if(mounted.current)setBusy(false);}
  };
  const exit=()=>{setJoined(null);history.replaceState(null,'','?mode=multi');setError('');};
  if(joined)return <Room key={joined.session.token} initial={joined} onExit={exit}/>;
  return <main className="multi-lobby">
    <header className="multi-brand"><span className="brand-mark"><Building2 size={23}/></span><div><strong>온라인 회사.</strong><small>오늘도, 같이 적당히.</small></div></header>
    <div className="multi-lobby-art" aria-hidden="true"><div className="office-grid">{Array.from({length:16},(_,i)=><i key={i} className={i%4<2?'desk-top':'desk-bottom'}><b/><em/></i>)}</div><span>같은 공간, 각자의 딴짓.</span></div>
    <section className="multi-lobby-card">
      <div className="mode-switch" aria-label="플레이 방식"><button disabled={busy||restoring} onClick={onSolo}>혼자 쉬기 <span>솔로</span></button><button aria-pressed="true">동료들과 <span>멀티</span></button></div>
      <p className="multi-eyebrow">OUR LITTLE OFFICE</p><h1>같이 출근해요.<br/><em>일 얘기만 말고요.</em></h1><p className="multi-intro">각자 자리에 앉고, 잠깐 수다도 떨고.<br/>초대받은 동료들과 함께 쓰는 작은 회사예요.</p>
      <div className="room-tabs" role="tablist" aria-label="입장 방법"><button role="tab" aria-selected={tab==='create'} onClick={()=>{setTab('create');setError('');}}>회사 만들기</button><button role="tab" aria-selected={tab==='join'} onClick={()=>{setTab('join');setError('');}}>코드로 입장</button></div>
      <form onSubmit={enter}>
        <label className="multi-field">오늘의 이름<input value={name} maxLength={10} onChange={e=>setName(e.target.value)} placeholder="김사원" autoComplete="nickname" required/></label>
        <AvatarPicker value={avatar} disabled={busy||restoring} onChange={value=>{setAvatar(value);writeAvatarChoice(value);}}/>
        {tab==='create'?<div className="create-fields"><label className="multi-field">회사 이름<input value={roomName} maxLength={24} onChange={e=>setRoomName(e.target.value)} required/></label><label className="multi-field">정원<select value={capacity} onChange={e=>setCapacity(Number(e.target.value))}>{Array.from({length:15},(_,i)=><option value={i+2} key={i}>{i+2}명</option>)}</select></label></div>:<label className="multi-field">참여 코드 또는 초대 링크<input value={code} onChange={e=>setCode(e.target.value)} placeholder="8자리 코드 / 초대 링크" autoComplete="off" maxLength={500}/></label>}
        {error&&<p className="multi-error" role="alert">{error}</p>}
        <button className="primary-button multi-enter" disabled={busy||restoring}>{busy||restoring?<><LoaderCircle className="loading-icon" size={18}/>{restoring?'이전 자리 확인 중':'문 여는 중'}</>:<>{tab==='create'?'우리 회사 만들기':'동료들에게 합류하기'}<ArrowRight size={18}/></>}</button>
      </form>
      <p className="multi-lobby-note"><Users size={14}/>최대 16명 · 가입 없이 코드로 초대</p><p className="multi-expiry-note">방과 대화는 만든 뒤 24시간 동안 이용할 수 있어요.</p>
    </section>
  </main>;
}

function Room({initial,onExit}:{initial:Joined;onExit:()=>void}) {
  const {session}=initial;
  const initialPlayer=initial.snapshot.players.find(p=>p.id===session.playerId)!;
  const [snapshot,setSnapshot]=useState(initial.snapshot),snapshotRef=useRef(snapshot);
  const controller=useRef<ReturnType<typeof createMultiController>>(null!);
  if(!controller.current)controller.current=createMultiController(initialPlayer,initial.snapshot.room.capacity);
  const serverOffset=useRef(Date.now()-initial.snapshot.serverTime);
  const host=useRef<HTMLDivElement>(null),scene=useRef<OfficeScene|null>(null),keys=useRef(new Set<string>());
  const [ready,setReady]=useState(false),[sceneError,setSceneError]=useState(''),[retry,setRetry]=useState(0);
  const [connection,setConnection]=useState<'live'|'connecting'>('connecting'),[fatal,setFatal]=useState(''),[notice,setNotice]=useState('');
  const [chatOpen,setChatOpen]=useState(false),[membersOpen,setMembersOpen]=useState(false),[sheetOpen,setSheetOpen]=useState(false),[inviteOpen,setInviteOpen]=useState(false);
  const [chat,setChat]=useState(''),[sending,setSending]=useState(false),[leaving,setLeaving]=useState(false),[resizing,setResizing]=useState(false),[newCapacity,setNewCapacity]=useState(snapshot.room.capacity);
  const [selectedCoworker,setSelectedCoworker]=useState<string|null>(null),[poking,setPoking]=useState(false),[pokeCooldown,setPokeCooldown]=useState(false);
  const pokeLock=useRef(false),pokeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [copied,setCopied]=useState(''),[pose,setPose]=useState(initialPlayer.pose),[seenMessage,setSeenMessage]=useState(0);
  const [settings,setSettings]=useState<Settings>(()=>readSavedState()?.settings??{sound:false,volume:.4,quality:'auto',reducedMotion:false});
  const settingsRef=useRef(settings),inputRef=useRef<HTMLTextAreaElement>(null),chatEnd=useRef<HTMLDivElement>(null);
  const audioRef=useRef<AudioContext|null>(null),lastPose=useRef(pose),disposed=useRef(false);
  const latestMessage=snapshot.messages.at(-1)?.id??0;
  settingsRef.current=settings;
  const apply=useCallback((next:RoomSnapshot)=>{
    if(disposed.current||next.serverTime<snapshotRef.current.serverTime)return;
    const self=next.players.find(p=>p.id===session.playerId);if(!self)return;
    const resized=controller.current.layout.capacity!==next.room.capacity;
    controller.current.setLayout(next.room.capacity,self.seatIndex);
    if(resized&&isMultiWalkable(controller.current.layout,self))Object.assign(controller.current.player,{x:self.x,z:self.z,angle:self.angle,pose:self.pose==='drink'?'idle':self.pose,moving:false});
    serverOffset.current=Date.now()-next.serverTime;snapshotRef.current=next;setSnapshot(next);setConnection('live');
  },[session.playerId]);
  const request=useCallback(async(action:string,extra:Record<string,unknown>={})=>{
    const response=await requestRoom<{snapshot:RoomSnapshot}>({action,code:session.code,token:session.token,...extra});apply(response.snapshot);return response.snapshot;
  },[session,apply]);
  useEffect(()=>{disposed.current=false;return()=>{disposed.current=true;if(pokeTimer.current)clearTimeout(pokeTimer.current);void audioRef.current?.close();};},[]);
  useEffect(()=>{
    let stopped=false,inFlight=false,timer:ReturnType<typeof setTimeout>;const abort=new AbortController();
    const sync=async()=>{
      if(stopped||inFlight)return;inFlight=true;
      try{
        const {x,z,angle,pose,moving}=controller.current.player;
        let result:{snapshot:RoomSnapshot};
        try{result=await requestRoom({action:'sync',code:session.code,token:session.token,player:{x,z,angle,pose,moving}},abort.signal);}
        catch(error){
          // A host may resize while this client is walking in the old layout.
          // Fetch the new geometry before sending another position.
          if(!(error instanceof RoomApiError)||error.code!=='INVALID_REQUEST')throw error;
          result=await requestRoom({action:'sync',code:session.code,token:session.token},abort.signal);
        }
        if(!stopped)apply(result.snapshot);
      }
      catch(error){if(stopped)return;if(isExpired(error)){setFatal(messageOf(error));clearRoomSession(session.code);return;}setConnection('connecting');}
      finally{inFlight=false;}
      if(!stopped)timer=setTimeout(sync,document.hidden?20_000:controller.current.player.moving?650:1400);
    };
    const resume=()=>{if(!document.hidden){clearTimeout(timer);void sync();}};
    document.addEventListener('visibilitychange',resume);void sync();
    return()=>{stopped=true;abort.abort();clearTimeout(timer);document.removeEventListener('visibilitychange',resume);};
  },[session,apply]);
  useEffect(()=>{
    let cancelled=false;setReady(false);setSceneError('');
    void import('@/game/multi-scene').then(({createMultiScene})=>{
      if(cancelled||!host.current)return;
      scene.current=createMultiScene(host.current,{
        getState:()=>{const s=snapshotRef.current;return{layout:controller.current.layout,player:controller.current.player,seatIndex:controller.current.player.seatIndex,players:s.players.filter(p=>p.id!==session.playerId),settings:settingsRef.current,speeches:s.messages.filter(m=>s.serverTime-m.createdAt<9000).map(m=>({id:m.playerId,text:m.text,until:m.createdAt+9000+serverOffset.current}))};},
        onFrame:dt=>{if(document.hidden||disposed.current)return;const k=keys.current;const axis={x:Number(k.has('d')||k.has('arrowright'))-Number(k.has('a')||k.has('arrowleft')),z:Number(k.has('s')||k.has('arrowdown'))-Number(k.has('w')||k.has('arrowup'))};controller.current.setAxis(scene.current?.screenToWorld(axis)??axis);controller.current.step(dt);if(lastPose.current!==controller.current.player.pose){lastPose.current=controller.current.player.pose;setPose(lastPose.current);}},
        onActor:id=>{if(id!==session.playerId){setSelectedCoworker(id);setMembersOpen(false);}},
        onGround:point=>{controller.current.move(point);setSheetOpen(false);},
        onSeat:index=>{if(index===controller.current.player.seatIndex){controller.current.sit();setSheetOpen(false);}else setNotice(`${index+1}번은 동료의 자리예요. 내 자리 버튼을 눌러 주세요.`);},
        onReady:()=>{if(!cancelled)setReady(true);},onError:message=>{if(!cancelled)setSceneError(message);},
      });
    }).catch(()=>{if(!cancelled)setSceneError('화면을 불러오지 못했어요. 다시 열어 주세요.');});
    return()=>{cancelled=true;scene.current?.dispose();scene.current=null;};
  },[session.playerId,retry]);
  useEffect(()=>{
    const clear=()=>{keys.current.clear();controller.current.setAxis({x:0,z:0});};
    const down=(event:KeyboardEvent)=>{
      if((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')||event.ctrlKey||event.metaKey||event.altKey)return;
      const key=event.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){event.preventDefault();keys.current.add(key);setSheetOpen(false);}
      if(key==='escape'){clear();setChatOpen(false);setMembersOpen(false);setInviteOpen(false);setSheetOpen(false);controller.current.stand();}
    };
    const up=(event:KeyboardEvent)=>keys.current.delete(event.key.toLowerCase());
    const focused=(event:FocusEvent)=>{if((event.target as HTMLElement)?.closest('input,textarea,select,[role="dialog"]'))clear();};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',clear);document.addEventListener('visibilitychange',clear);document.addEventListener('focusin',focused);
    return()=>{clear();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',clear);document.removeEventListener('focusin',focused);};
  },[]);
  useEffect(()=>{if(chatOpen){setSeenMessage(latestMessage);chatEnd.current?.scrollIntoView({block:'nearest'});}},[latestMessage,chatOpen]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),5000);return()=>clearTimeout(timer);},[notice]);
  const poke=async(targetId:string)=>{
    if(pokeLock.current||pokeCooldown||targetId===session.playerId)return;
    pokeLock.current=true;setPoking(true);
    const target=snapshotRef.current.players.find(p=>p.id===targetId);
    try{await request('poke',{targetId});setNotice(`${target?.name??'동료'}님에게 콕! 신호를 보냈어요.`);setPokeCooldown(true);pokeTimer.current=setTimeout(()=>{setPokeCooldown(false);},5000);}catch(error){setNotice(messageOf(error));}finally{pokeLock.current=false;setPoking(false);}
  };
  const copy=async(value:string,label:string)=>{try{await navigator.clipboard.writeText(value);setCopied(label);setTimeout(()=>setCopied(''),2000);}catch{setNotice('복사할 내용을 길게 누르거나 선택해 복사해 주세요.');setInviteOpen(true);}};
  const sendChat=async(event:React.FormEvent)=>{
    event.preventDefault();if(!chat.trim()||sending)return;setSending(true);
    try{await request('chat',{text:chat.trim()});setChat('');inputRef.current?.focus();}catch(error){setNotice(messageOf(error));}finally{setSending(false);}
  };
  const leave=async()=>{if(leaving)return;setLeaving(true);try{await requestRoom({action:'leave',code:session.code,token:session.token});clearRoomSession(session.code);onExit();}catch(error){if(isExpired(error)){clearRoomSession(session.code);onExit();}else{setNotice(messageOf(error));setLeaving(false);}}};
  const resize=async()=>{setResizing(true);try{await request('capacity',{capacity:newCapacity});setNotice('새 정원에 맞춰 책상을 준비했어요.');}catch(error){setNotice(messageOf(error));}finally{setResizing(false);}};
  const keySound=(key:string)=>{
    if(!settings.sound)return;const context=audioRef.current??=new AudioContext();void context.resume();
    const osc=context.createOscillator(),gain=context.createGain();osc.type='triangle';osc.frequency.setValueAtTime(key==='Enter'?130:210+Math.random()*65,context.currentTime);gain.gain.setValueAtTime(settings.volume*.12,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.055);osc.connect(gain);gain.connect(context.destination);osc.start();osc.stop(context.currentTime+.06);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  };
  const player=controller.current.player,isHost=snapshot.room.hostId===session.playerId;
  const coworker=snapshot.players.find(p=>p.id===selectedCoworker&&p.id!==session.playerId);
  const invite=typeof location==='undefined'?'':roomInviteUrl(session.code,location.href);
  const poseLabel=pose==='type'?'일하는 척':pose==='sit'?'내 자리에서 쉬는 중':pose==='drink'?'커피 한 모금':pose==='walk'?'산책 중':'자유시간';
  return <main className={`multi-room ${chatOpen?'chat-is-open':''}`}>
    <div ref={host} className="scene-host" aria-label="동료들과 함께 있는 멀티 사무실"/>
    <header className="room-header"><div className="room-title"><Building2 size={24}/><div><h1>{snapshot.room.name}</h1><span><i className={connection==='live'?'live-dot':'connecting-dot'}/>{connection==='live'?'함께 근무 중':'다시 연결하는 중'} · 멀티</span></div></div><div className="room-header-actions"><WorkClock/><NotificationCenter items={snapshot.notifications??[]} onRead={throughId=>request('readNotifications',{throughId})}/><button className="icon-button" aria-label={settings.sound?'소리 끄기':'소리 켜기'} onClick={()=>setSettings(s=>({...s,sound:!s.sound}))}>{settings.sound?<Volume2 size={19}/>:<VolumeX size={19}/>}</button><button className="room-members-button" aria-label={`동료 ${snapshot.players.length}명, 정원 ${snapshot.room.capacity}명`} onClick={()=>{setMembersOpen(true);setNewCapacity(snapshot.room.capacity);}}><Users size={17}/>{snapshot.players.length}<span>/{snapshot.room.capacity}</span></button><button className="room-invite-button" aria-label="동료 초대" onClick={()=>setInviteOpen(true)}><Link size={16}/><span>동료 초대</span></button></div></header>
    <div className="room-self"><span className="status-dot"/><strong>{player.name}</strong><span>{player.seatIndex+1}번 자리 · {poseLabel}</span></div>
    <div className="room-navigation"><button onClick={()=>{controller.current.sit();setSheetOpen(false);}}><Monitor size={17}/><span>내 자리</span></button><button onClick={()=>{controller.current.coffee();setSheetOpen(false);}}><Coffee size={17}/><span>커피</span></button><button onClick={()=>{controller.current.rest();setSheetOpen(false);}}><Wind size={17}/><span>잠깐 산책</span></button></div>
    {!ready&&!sceneError&&<div className="loading-status"><LoaderCircle className="loading-icon" size={18}/>책상을 준비하고 있어요</div>}
    {notice&&<div className="room-notice" role="status">{notice}</div>}
    <CameraControls onZoom={delta=>scene.current?.zoom(delta)} onRotate={delta=>scene.current?.rotate(delta)} onReset={()=>scene.current?.resetView()}/>
    <footer className="room-dock"><div className="room-dock-main"><button className={pose==='type'?'active':''} onClick={()=>{controller.current.sit(true);setSheetOpen(true);setChatOpen(false);}}><Monitor size={18}/><span>업무 보기</span></button><button className={pose==='sit'?'active':''} onClick={()=>{controller.current.sit();setSheetOpen(false);}}><Armchair size={18}/><span>잠깐 쉬기</span></button><button onClick={()=>{controller.current.stand();setSheetOpen(false);}}><ArrowRight size={18}/><span>일어나기</span></button></div><button className="room-chat-toggle" aria-expanded={chatOpen} onClick={()=>{if(!chatOpen)setSheetOpen(false);setChatOpen(v=>!v);}}><MessageCircle size={19}/><span>대화</span>{!chatOpen&&latestMessage>seenMessage&&<i/>}</button><button className="room-leave" aria-label="회사 나가기" disabled={leaving} onClick={leave}><DoorOpen size={18}/></button></footer>
    {sheetOpen&&pose==='type'&&<TodoBoard onClose={()=>setSheetOpen(false)} onType={keySound}/>}
    {coworker&&!membersOpen&&!chatOpen&&!sheetOpen&&<section className="coworker-poke-card" aria-label="선택한 동료"><AvatarPortrait avatar={coworker.avatar??'short'}/><div><strong>{coworker.name}</strong><span>{coworker.seatIndex+1}번 자리 · 잠깐 불러볼까요?</span></div><button className="poke-button" disabled={poking||pokeCooldown} onClick={()=>void poke(coworker.id)}><Hand size={16}/>{poking?'보내는 중':pokeCooldown?'잠깐만요':'콕!'}</button><button className="poke-close" aria-label="동료 선택 닫기" onClick={()=>setSelectedCoworker(null)}><X size={16}/></button></section>}
    {chatOpen&&<aside className="room-chat" aria-label="동료들과 대화"><header><div><MessageCircle size={18}/><strong>우리 회사 수다</strong><span>{snapshot.players.length}명</span></div><button aria-label="대화창 닫기" onClick={()=>setChatOpen(false)}><X size={18}/></button></header><div className="chat-messages" role="log" aria-live="polite" aria-relevant="additions">{!snapshot.messages.length&&<div className="chat-empty"><Coffee size={27}/><strong>잠깐, 이야기할까요?</strong><span>첫 인사를 건네 보세요.<br/>대화는 캐릭터 위에도 나타나요.</span></div>}{snapshot.messages.map(m=><article key={m.id} className={m.playerId===session.playerId?'chat-message mine':'chat-message'}><div><strong>{m.name}</strong><time>{new Date(m.createdAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</time></div><p>{m.text}</p></article>)}<div ref={chatEnd}/></div><form onSubmit={sendChat}><textarea ref={inputRef} value={chat} maxLength={200} onChange={e=>setChat(e.target.value)} placeholder="동료들에게 한마디…" aria-label="대화 내용" rows={2} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/><div><small>{chat.length}/200 · Enter 전송</small><button type="submit" aria-label="대화 보내기" disabled={!chat.trim()||sending}>{sending?<LoaderCircle className="loading-icon" size={17}/>:<Send size={17}/>}</button></div></form></aside>}
    {inviteOpen&&<div className="multi-modal-backdrop" onClick={()=>setInviteOpen(false)}><section className="multi-modal" role="dialog" aria-modal="true" aria-label="동료 초대" onClick={e=>e.stopPropagation()}><header><h2>같이 출근할 동료에게</h2><button aria-label="초대창 닫기" onClick={()=>setInviteOpen(false)}><X size={20}/></button></header><p>링크나 코드를 보내면 같은 회사에 들어와요.</p><div className="invite-code"><strong>{session.code}</strong><button onClick={()=>copy(session.code,'code')}>{copied==='code'?<Check size={19}/>:<Copy size={19}/>}<span>코드 복사</span></button></div><label className="multi-field">초대 링크<input readOnly value={invite} onFocus={e=>e.currentTarget.select()}/></label><button className="primary-button multi-enter" onClick={()=>copy(invite,'link')}>{copied==='link'?<Check size={18}/>:<Link size={18}/>}초대 링크 복사</button><p className="multi-expiry-note">이 회사는 {new Date(snapshot.room.expiresAt).toLocaleString('ko-KR',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})}까지 열려요.</p></section></div>}
    {membersOpen&&<div className="multi-modal-backdrop" onClick={()=>setMembersOpen(false)}><section className="multi-modal" role="dialog" aria-modal="true" aria-label="근무 중인 동료" onClick={e=>e.stopPropagation()}><header><h2>오늘 함께하는 동료</h2><button aria-label="동료 목록 닫기" onClick={()=>setMembersOpen(false)}><X size={20}/></button></header><ul className="room-members">{snapshot.players.map(p=><li key={p.id}><span>{p.seatIndex+1}</span><strong>{p.name}{p.id===session.playerId&&<small>나</small>}</strong><em>{p.id===snapshot.room.hostId?'방장':snapshot.serverTime-p.lastSeen>20_000?'잠깐 자리 비움':'함께 근무 중'}</em>{p.id!==session.playerId&&<button className="poke-button" aria-label={`${p.name} 콕! 찌르기`} disabled={poking||pokeCooldown} onClick={()=>void poke(p.id)}><Hand size={14}/>{pokeCooldown?'잠깐':'콕!'}</button>}</li>)}</ul>{isHost&&<div className="room-capacity"><label>회사 정원<select value={newCapacity} onChange={e=>setNewCapacity(Number(e.target.value))}>{Array.from({length:15},(_,i)=><option key={i} value={i+2}>{i+2}명</option>)}</select></label><button className="primary-button" disabled={resizing||newCapacity===snapshot.room.capacity} onClick={resize}>{resizing?'준비 중':'정원 변경'}</button><p>인원에 맞춰 책상과 사무실이 늘어나요.<br/>사용 중인 자리를 없애는 변경은 할 수 없어요.</p></div>}</section></div>}
    {(fatal||sceneError)&&<div className="multi-modal-backdrop"><section className="multi-modal" role="alert"><h2>{fatal?'회사에 다시 들어와 주세요':'화면을 준비하지 못했어요'}</h2><p>{fatal||sceneError}</p><button className="primary-button multi-enter" onClick={()=>fatal?onExit():setRetry(v=>v+1)}>{fatal?'입장 화면으로':'다시 시도'}</button></section></div>}
  </main>;
}
