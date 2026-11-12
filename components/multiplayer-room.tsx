'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Building2, Check, Coffee, Copy, Hand, Leaf, Link, LoaderCircle, MessageCircle, Send, Settings2, Users, Volume2, VolumeX, X } from 'lucide-react';
import type { RoomSession, RoomSnapshot } from '@/game/multi-types';
import type { Command, OfficeScene } from '@/game/types';
import { requestRoom, RoomApiError, clearRoomSession, roomInviteUrl } from '@/game/multi-client';
import { createMultiController } from '@/game/multi-controller';
import { readSavedState, writeSavedState } from '@/game/storage';
import { createOfficeAudio } from '@/game/audio';
import { OfficePlayControls, type PlayPanel } from './office-play-controls';
import { CameraControls } from './camera-controls';
import { FeedbackDialog } from './feedback-dialog';
import { OfficeBulletinBoard } from './office-bulletin-board';
import { UpdateNews } from './update-news';
import { WorkClock } from './work-clock';
import { AvatarPortrait } from './avatar-picker';
import { NotificationCenter } from './notification-center';
import { ResizableChat } from './resizable-chat';

const messageOf=(error:unknown)=>error instanceof Error?error.message:'연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
const isExpired=(error:unknown)=>error instanceof RoomApiError&&['SESSION_EXPIRED','ROOM_EXPIRED','ROOM_NOT_FOUND','INVALID_SESSION','UNAUTHORIZED'].includes(error.code);

type JoinedRoom={session:RoomSession;snapshot:RoomSnapshot};
type Controller=ReturnType<typeof createMultiController>;
export function MultiplayerRoom({initial,onExit}:{initial:JoinedRoom;onExit:()=>void}) {
  const [controller,setController]=useState<Controller|null>(null);
  useEffect(()=>{
    const self=initial.snapshot.players.find(p=>p.id===initial.session.playerId)!;
    const next=createMultiController(self,initial.snapshot.room.capacity,readSavedState());
    next.applySnapshot(initial.snapshot);setController(next);
    return()=>next.engine.dispose();
  },[initial]);
  if(!controller)return <main className="boot"><Building2 size={30}/><p>동료들의 회사를 준비하고 있어요.</p></main>;
  return <RoomGame initial={initial} onExit={onExit} controller={controller}/>;
}

function RoomGame({initial,onExit,controller}:{initial:JoinedRoom;onExit:()=>void;controller:Controller}) {
  const {session}=initial;
  const engine=controller.engine;
  const state=useSyncExternalStore(engine.subscribe,engine.getSnapshot,engine.getSnapshot);
  const [snapshot,setSnapshot]=useState(initial.snapshot),snapshotRef=useRef(snapshot);
  const serverOffset=useRef(Date.now()-initial.snapshot.serverTime);
  const host=useRef<HTMLDivElement>(null),scene=useRef<OfficeScene|null>(null),keys=useRef(new Set<string>());
  const audio=useRef<ReturnType<typeof createOfficeAudio>|null>(null),disposed=useRef(false);
  const [ready,setReady]=useState(false),[sceneError,setSceneError]=useState(''),[retry,setRetry]=useState(0);
  const [connection,setConnection]=useState<'live'|'connecting'>('connecting'),[fatal,setFatal]=useState(''),[notice,setNotice]=useState('');
  const [chatOpen,setChatOpen]=useState(false),[membersOpen,setMembersOpen]=useState(false),[inviteOpen,setInviteOpen]=useState(false),[monitorOpen,setMonitorOpen]=useState(true);
  const [panel,setPanel]=useState<PlayPanel>(null),modalRef=useRef(false);
  const feedbackOpen = useRef(false);
  const boardOpen = useRef(false), syncNow = useRef<() => void>(() => {});
  const newsOpen = useRef(false);
  modalRef.current=membersOpen||inviteOpen||panel==='settings'||feedbackOpen.current||boardOpen.current||newsOpen.current;
  const syncPause = useCallback(() => {
    keys.current.clear();
    controller.setAxis({x:0,z:0});
    engine.dispatch({type:'pause',value:document.hidden||feedbackOpen.current||boardOpen.current||newsOpen.current});
    audio.current?.sync(engine.state);
  }, [controller,engine]);
  const handleFeedbackOpen = (open: boolean) => {
    feedbackOpen.current = open;
    modalRef.current = open||boardOpen.current||newsOpen.current||membersOpen||inviteOpen||panel==='settings';
    syncPause();
  };
  const handleBoardOpen = (open: boolean) => {
    boardOpen.current = open;
    modalRef.current = open||feedbackOpen.current||newsOpen.current||membersOpen||inviteOpen||panel==='settings';
    syncPause();
  };
  const [chat,setChat]=useState(''),[sending,setSending]=useState(false),[leaving,setLeaving]=useState(false),[resizing,setResizing]=useState(false),[newCapacity,setNewCapacity]=useState(snapshot.room.capacity);
  const handleNewsOpen = (open: boolean) => {
    newsOpen.current = open;
    modalRef.current = open||feedbackOpen.current||boardOpen.current||membersOpen||inviteOpen||panel==='settings';
    syncPause();
  };
  const [selectedCoworker,setSelectedCoworker]=useState<string|null>(null),[poking,setPoking]=useState(false),[pokeCooldown,setPokeCooldown]=useState(false);
  const pokeLock=useRef(false),pokeTimer=useRef<ReturnType<typeof setTimeout>|null>(null),attackLock=useRef(false),leaveRef=useRef<()=>void>(()=>{});
  const [copied,setCopied]=useState(''),[seenMessage,setSeenMessage]=useState(0);
  const inputRef=useRef<HTMLTextAreaElement>(null),chatEnd=useRef<HTMLDivElement>(null);
  const latestMessage=snapshot.messages.at(-1)?.id??0;
  const apply=useCallback((next:RoomSnapshot)=>{
    if(disposed.current||next.serverTime<snapshotRef.current.serverTime)return;
    if(!next.players.some(p=>p.id===session.playerId))return;
    controller.applySnapshot(next);
    serverOffset.current=Date.now()-next.serverTime;snapshotRef.current=next;setSnapshot(next);setConnection('live');
  },[controller,session.playerId]);
  const request=useCallback(async(action:string,extra:Record<string,unknown>={})=>{
    const response=await requestRoom<{snapshot:RoomSnapshot}>({action,code:session.code,token:session.token,...extra});apply(response.snapshot);return response.snapshot;
  },[session,apply]);
  const send=useCallback((command:Command)=>{
    if(feedbackOpen.current||boardOpen.current||newsOpen.current)return;
    audio.current?.start();
    if(command.type==='exit'||(command.type==='interact'&&engine.state.target==='exit'&&engine.state.ready)){leaveRef.current();return;}
    if(command.type==='attack'&&attackLock.current)return;
    const before=engine.state.lastHit;
    engine.dispatch(command);
    if(command.type==='desk'||command.type==='interact'||(command.type==='select'&&command.target==='desk')){setMonitorOpen(true);setChatOpen(false);}
    if(command.type==='travel'){setPanel(null);setSelectedCoworker(null);}
    if(command.type==='attack'&&engine.state.lastHit!==before){
      attackLock.current=true;
      void request('attack',{weapon:engine.state.weapon,player:controller.serializePlayer()}).catch(error=>setNotice(messageOf(error))).finally(()=>{attackLock.current=false;});
    }
  },[engine,controller,request]);
  useEffect(()=>{
    disposed.current=false;const sound=createOfficeAudio();audio.current=sound;
    return()=>{disposed.current=true;if(pokeTimer.current)clearTimeout(pokeTimer.current);sound.dispose();audio.current=null;};
  },[engine]);
  useEffect(()=>{writeSavedState(state);},[state.name,state.player.avatar,state.weapon,state.settings.sound,state.settings.volume,state.settings.reducedMotion,state.settings.quality,state.inventory.cookie,state.inventory.choco,state.inventory.cracker]);
  useEffect(()=>{
    let stopped=false,inFlight=false,queued=false,lastStarted=0,timer:ReturnType<typeof setTimeout>;const abort=new AbortController();
    const sync=async()=>{
      if(stopped)return;
      if(inFlight){queued=true;return;}
      const wait=280-(Date.now()-lastStarted);
      if(wait>0){clearTimeout(timer);timer=setTimeout(sync,wait);return;}
      inFlight=true;queued=false;lastStarted=Date.now();
      const submitted=controller.serializePlayer();
      try{
        let result:{snapshot:RoomSnapshot};
        try{result=await requestRoom({action:'sync',code:session.code,token:session.token,player:submitted,boss:controller.serializeBoss()},abort.signal);}
        catch(error){
          if(error instanceof RoomApiError && error.code==='SEAT_TAKEN'){
            controller.rejectRestSeat(submitted.restSeatId);setNotice(error.message);queued=true;
          }else if(!(error instanceof RoomApiError)||!['INVALID_REQUEST','HOST_ONLY','NOT_HOST','RATE_LIMITED'].includes(error.code))throw error;
          result=await requestRoom({action:'sync',code:session.code,token:session.token},abort.signal);
        }
        if(!stopped)apply(result.snapshot);
      }catch(error){if(stopped)return;if(isExpired(error)){setFatal(messageOf(error));clearRoomSession(session.code);return;}setConnection('connecting');}
      finally{inFlight=false;}
      if(!stopped)timer=setTimeout(sync,queued?280:document.hidden?20_000:650);
    };
    const resume=()=>{if(!document.hidden){clearTimeout(timer);void sync();}};
    syncNow.current=resume;
    document.addEventListener('visibilitychange',resume);void sync();
    return()=>{stopped=true;syncNow.current=()=>{};abort.abort();clearTimeout(timer);document.removeEventListener('visibilitychange',resume);};
  },[session,controller,apply]);
  useEffect(()=>{syncNow.current();},[state.restSeatId,state.seat,state.floor,state.activity?.kind]);
  useEffect(()=>{
    let cancelled=false;setReady(false);setSceneError('');
    void import('@/game/multi-scene').then(({createMultiScene})=>{
      if(cancelled||!host.current)return;
      scene.current=createMultiScene(host.current,{
        getState:()=>{const s=snapshotRef.current;return{layout:controller.layout,game:engine.state,seatIndex:controller.player.seatIndex,players:s.players.filter(p=>p.id!==session.playerId),serverNow:Date.now()-serverOffset.current,speeches:s.messages.filter(m=>s.serverTime-m.createdAt<9000).map(m=>({id:m.playerId,text:m.text,until:m.createdAt+9000+serverOffset.current}))};},
        onFrame:dt=>{
          if(document.hidden||disposed.current)return;
          const k=keys.current,axis=modalRef.current?{x:0,z:0}:{x:Number(k.has('d')||k.has('arrowright'))-Number(k.has('a')||k.has('arrowleft')),z:Number(k.has('s')||k.has('arrowdown'))-Number(k.has('w')||k.has('arrowup'))};
          controller.setAxis(scene.current?.screenToWorld(axis)??axis);controller.step(dt);audio.current?.sync(engine.state);
        },
        onActor:id=>{if(!modalRef.current&&id!==session.playerId){setSelectedCoworker(id);setMembersOpen(false);}},
        onGround:point=>{if(!modalRef.current){setPanel(null);send({type:'move',point});}},
        onTarget:(target,point)=>{if(!modalRef.current){setPanel(null);send({type:'select',target,point});}},
        onSeat:index=>{if(modalRef.current)return;if(index===controller.player.seatIndex){setPanel(null);send({type:'select',target:'desk'});}else setNotice(`${index+1}번은 동료의 자리예요. 내 자리 버튼을 눌러 주세요.`);},
        onReady:()=>{if(!cancelled)setReady(true);},onError:message=>{if(!cancelled)setSceneError(message);},
      });
    }).catch(()=>{if(!cancelled)setSceneError('화면을 불러오지 못했어요. 다시 열어 주세요.');});
    return()=>{cancelled=true;scene.current?.dispose();scene.current=null;};
  },[session.playerId,controller,engine,send,retry]);
  useEffect(()=>{
    const clear=()=>{keys.current.clear();controller.setAxis({x:0,z:0});};
    const visibility=syncPause;
    const down=(event:KeyboardEvent)=>{
      if(feedbackOpen.current||boardOpen.current||newsOpen.current||event.defaultPrevented)return;
      if((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"],.chat-resize-handle')||event.ctrlKey||event.metaKey||event.altKey)return;
      const key=event.key.toLowerCase();
      if(key==='escape'){clear();setChatOpen(false);setMembersOpen(false);setInviteOpen(false);setPanel(null);setMonitorOpen(false);send({type:'cancel'});return;}
      if(modalRef.current)return;
      if((event.target as HTMLElement)?.closest('button')&&(key===' '||key==='enter'))return;
      if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){event.preventDefault();keys.current.add(key);}
      if(!event.repeat&&key==='e'){event.preventDefault();send({type:'interact'});}
      if(!event.repeat&&key===' '&&engine.state.seat==='desk'){event.preventDefault();send({type:'desk',mode:'work'});}
    };
    const up=(event:KeyboardEvent)=>keys.current.delete(event.key.toLowerCase());
    const focused=(event:FocusEvent)=>{if((event.target as HTMLElement)?.closest('input,textarea,select,[role="dialog"],.chat-resize-handle'))clear();};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',clear);document.addEventListener('visibilitychange',visibility);document.addEventListener('focusin',focused);
    return()=>{clear();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('focusin',focused);};
  },[controller,engine,send,syncPause]);
  useEffect(()=>{if(chatOpen){setSeenMessage(latestMessage);chatEnd.current?.scrollIntoView({block:'nearest'});}},[latestMessage,chatOpen]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),5000);return()=>clearTimeout(timer);},[notice]);
  const poke=async(targetId:string)=>{
    if(pokeLock.current||pokeCooldown||targetId===session.playerId)return;
    pokeLock.current=true;setPoking(true);const target=snapshotRef.current.players.find(p=>p.id===targetId);
    try{await request('poke',{targetId});setNotice(`${target?.name??'동료'}님에게 콕! 신호를 보냈어요.`);setPokeCooldown(true);pokeTimer.current=setTimeout(()=>setPokeCooldown(false),5000);}catch(error){setNotice(messageOf(error));}finally{pokeLock.current=false;setPoking(false);}
  };
  const copy=async(value:string,label:string)=>{try{await navigator.clipboard.writeText(value);setCopied(label);setTimeout(()=>setCopied(''),2000);}catch{setNotice('복사할 내용을 길게 누르거나 선택해 복사해 주세요.');setInviteOpen(true);}};
  const sendChat=async(event:React.FormEvent)=>{
    event.preventDefault();if(!chat.trim()||sending)return;setSending(true);
    try{await request('chat',{text:chat.trim()});setChat('');inputRef.current?.focus();}catch(error){setNotice(messageOf(error));}finally{setSending(false);}
  };
  const leave=async()=>{if(leaving)return;setLeaving(true);try{await requestRoom({action:'leave',code:session.code,token:session.token});clearRoomSession(session.code);onExit();}catch(error){if(isExpired(error)){clearRoomSession(session.code);onExit();}else{setNotice(messageOf(error));setLeaving(false);}}};
  leaveRef.current=()=>{void leave();};
  const resize=async()=>{setResizing(true);try{await request('capacity',{capacity:newCapacity});setNotice('새 정원에 맞춰 책상을 준비했어요.');}catch(error){setNotice(messageOf(error));}finally{setResizing(false);}};
  const isHost=snapshot.room.hostId===session.playerId,roof=state.floor==='rooftop';
  const coworker=snapshot.players.find(p=>p.id===selectedCoworker&&p.id!==session.playerId&&p.floor===state.floor);
  const invite=typeof location==='undefined'?'':roomInviteUrl(session.code,location.href);
  return <main className={`multi-room office-app is-playing ${chatOpen?'chat-is-open':''} ${roof?'is-rooftop':''} ${state.transition?'is-travelling':''}`}>
    <div ref={host} className="scene-host" aria-label={roof?'동료들과 쉬는 3D 옥상':'동료들과 함께 있는 3D 사무실'}/>
    <header className="room-header"><div className="room-title"><Building2 size={24}/><div><h1>{snapshot.room.name}</h1><span><i className={connection==='live'?'live-dot':'connecting-dot'}/>{connection==='live'?'함께 근무 중':'다시 연결하는 중'}</span></div></div><div className="room-header-actions"><WorkClock/><FeedbackDialog context={{ mode: 'multi', floor: roof ? 'roof' : 'office' }} onOpenChange={handleFeedbackOpen} /><NotificationCenter items={snapshot.notifications??[]} onRead={throughId=>request('readNotifications',{throughId})}/><button className="icon-button" aria-label={state.settings.sound?'소리 끄기':'소리 켜기'} onClick={()=>send({type:'settings',value:{sound:!state.settings.sound}})}>{state.settings.sound?<Volume2 size={19}/>:<VolumeX size={19}/>}</button><button className="icon-button" aria-label="설정" onClick={()=>setPanel('settings')}><Settings2 size={19}/></button><button className="room-members-button" aria-label={`동료 ${snapshot.players.length}명, 정원 ${snapshot.room.capacity}명`} onClick={()=>{setMembersOpen(true);setNewCapacity(snapshot.room.capacity);}}><Users size={17}/>{snapshot.players.length}<span>/{snapshot.room.capacity}</span></button><button className="room-invite-button" aria-label="동료 초대" onClick={()=>setInviteOpen(true)}><Link size={16}/><span>동료 초대</span></button></div></header>
    <div className="room-self"><span className="status-dot"/><strong>{state.name}</strong><span>{roof?'옥상 · 잠깐, 숨 고르기':`${controller.player.seatIndex+1}번 자리 · 오늘도 적당히`}</span></div>
    {!ready&&!sceneError&&<div className="loading-status"><LoaderCircle className="loading-icon" size={18}/>회사를 준비하고 있어요</div>}
    {notice&&<div className="room-notice" role="status">{notice}</div>}
    <CameraControls disabled={!!state.transition} onZoom={delta=>scene.current?.zoom(delta)}/>
    <OfficePlayControls state={state} send={send} panel={panel} setPanel={setPanel} onExit={()=>{if(!leaving)void leave();}} onType={key=>audio.current?.typeKey(key)} showMonitor={monitorOpen&&!chatOpen} newsAction={<UpdateNews context={{mode:'multi',floor:roof?'roof':'office'}} onOpenChange={handleNewsOpen}/>} boardAction={<OfficeBulletinBoard name={state.name} session={session} hostId={snapshot.room.hostId} onOpenChange={handleBoardOpen}/>} onMonitorClose={()=>setMonitorOpen(false)} extraActions={<button className="room-chat-toggle" aria-label="동료들과 대화" aria-expanded={chatOpen} onClick={()=>{setPanel(null);setChatOpen(v=>!v);}}><MessageCircle size={20}/><span>대화</span>{!chatOpen&&latestMessage>seenMessage&&<i/>}</button>}/>
    {coworker&&!membersOpen&&!chatOpen&&!(state.seat==='desk'&&monitorOpen)&&<section className="coworker-poke-card" aria-label="선택한 동료"><AvatarPortrait avatar={coworker.avatar??'short'}/><div><strong>{coworker.name}</strong><span>{coworker.seatIndex+1}번 자리 · 잠깐 불러볼까요?</span></div><button className="poke-button" disabled={poking||pokeCooldown} onClick={()=>void poke(coworker.id)}><Hand size={16}/>{poking?'보내는 중':pokeCooldown?'잠깐만요':'콕!'}</button><button className="poke-close" aria-label="동료 선택 닫기" onClick={()=>setSelectedCoworker(null)}><X size={16}/></button></section>}
    {chatOpen&&<ResizableChat><header><div><MessageCircle size={18}/><strong>우리 회사 수다</strong><span>{snapshot.players.length}명</span></div><button aria-label="대화창 닫기" onClick={()=>setChatOpen(false)}><X size={18}/></button></header><div className="chat-messages" role="log" aria-live="polite" aria-relevant="additions">{!snapshot.messages.length&&<div className="chat-empty"><Coffee size={27}/><strong>잠깐, 이야기할까요?</strong><span>첫 인사를 건네 보세요.<br/>대화는 캐릭터 위에도 나타나요.</span></div>}{snapshot.messages.map(m=><article key={m.id} className={m.playerId===session.playerId?'chat-message mine':'chat-message'}><div><strong>{m.name}</strong><time>{new Date(m.createdAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</time></div><p>{m.text}</p></article>)}<div ref={chatEnd}/></div><form onSubmit={sendChat}><textarea ref={inputRef} value={chat} maxLength={200} onChange={e=>setChat(e.target.value)} placeholder="동료들에게 한마디…" aria-label="대화 내용" rows={2} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/><div><small>{chat.length}/200 · Enter 전송</small><button type="submit" aria-label="대화 보내기" disabled={!chat.trim()||sending}>{sending?<LoaderCircle className="loading-icon" size={17}/>:<Send size={17}/>}</button></div></form></ResizableChat>}
    {panel==='settings'&&<div className="multi-modal-backdrop" onClick={()=>setPanel(null)}><section className="multi-modal" role="dialog" aria-modal="true" aria-label="내 취향대로" onClick={e=>e.stopPropagation()}><header><h2>내 취향대로</h2><button aria-label="설정 닫기" onClick={()=>setPanel(null)}><X size={20}/></button></header><label className="setting-row"><span><Volume2 size={18}/>공간 소리</span><input type="checkbox" checked={state.settings.sound} onChange={e=>send({type:'settings',value:{sound:e.target.checked}})}/></label><label className="setting-row"><span>소리 크기</span><input aria-label="소리 크기" type="range" min="0" max="1" step=".05" value={state.settings.volume} onChange={e=>send({type:'settings',value:{volume:+e.target.value}})}/></label><label className="setting-row"><span><Leaf size={18}/>움직임 줄이기</span><input type="checkbox" checked={state.settings.reducedMotion} onChange={e=>send({type:'settings',value:{reducedMotion:e.target.checked}})}/></label><label className="setting-row"><span>화면 품질</span><select value={state.settings.quality} onChange={e=>send({type:'settings',value:{quality:e.target.value as 'auto'|'low'|'high'}})}><option value="auto">자동</option><option value="low">가볍게</option><option value="high">선명하게</option></select></label><p>할 일과 출퇴근 시간, 주머니 속 간식은 이 브라우저에만 보관돼요. 동료에게는 움직임과 대화, 같은 방 게시판만 보여요.</p></section></div>}
    {inviteOpen&&<div className="multi-modal-backdrop" onClick={()=>setInviteOpen(false)}><section className="multi-modal" role="dialog" aria-modal="true" aria-label="동료 초대" onClick={e=>e.stopPropagation()}><header><h2>같이 출근할 동료에게</h2><button aria-label="초대창 닫기" onClick={()=>setInviteOpen(false)}><X size={20}/></button></header><p>링크나 코드를 보내면 같은 회사에 들어와요.</p><div className="invite-code"><strong>{session.code}</strong><button onClick={()=>copy(session.code,'code')}>{copied==='code'?<Check size={19}/>:<Copy size={19}/>}<span>코드 복사</span></button></div><label className="multi-field">초대 링크<input readOnly value={invite} onFocus={e=>e.currentTarget.select()}/></label><button className="primary-button multi-enter" onClick={()=>copy(invite,'link')}>{copied==='link'?<Check size={18}/>:<Link size={18}/>}초대 링크 복사</button><p className="multi-expiry-note">이 회사는 {new Date(snapshot.room.expiresAt).toLocaleString('ko-KR',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})}까지 열려요.</p></section></div>}
    {membersOpen&&<div className="multi-modal-backdrop" onClick={()=>setMembersOpen(false)}><section className="multi-modal" role="dialog" aria-modal="true" aria-label="근무 중인 동료" onClick={e=>e.stopPropagation()}><header><h2>오늘 함께하는 동료</h2><button aria-label="동료 목록 닫기" onClick={()=>setMembersOpen(false)}><X size={20}/></button></header><ul className="room-members">{snapshot.players.map(p=><li key={p.id}><span>{p.seatIndex+1}</span><strong>{p.name}{p.id===session.playerId&&<small>나</small>}</strong><em>{p.id===snapshot.room.hostId?'방장':snapshot.serverTime-p.lastSeen>20_000?'잠깐 자리 비움':'함께 근무 중'}</em>{p.id!==session.playerId&&<button className="poke-button" aria-label={`${p.name} 콕! 찌르기`} disabled={poking||pokeCooldown} onClick={()=>void poke(p.id)}><Hand size={14}/>{pokeCooldown?'잠깐':'콕!'}</button>}</li>)}</ul>{isHost&&<div className="room-capacity"><label>회사 정원<select value={newCapacity} onChange={e=>setNewCapacity(Number(e.target.value))}>{Array.from({length:15},(_,i)=><option key={i} value={i+2}>{i+2}명</option>)}</select></label><button className="primary-button" disabled={resizing||newCapacity===snapshot.room.capacity} onClick={resize}>{resizing?'준비 중':'정원 변경'}</button><p>인원에 맞춰 책상과 사무실이 늘어나요.<br/>사용 중인 자리를 없애는 변경은 할 수 없어요.</p></div>}</section></div>}
    {(fatal||sceneError)&&<div className="multi-modal-backdrop"><section className="multi-modal" role="alert"><h2>{fatal?'회사에 다시 들어와 주세요':'화면을 준비하지 못했어요'}</h2><p>{fatal||sceneError}</p><button className="primary-button multi-enter" onClick={()=>fatal?onExit():setRetry(v=>v+1)}>{fatal?'입장 화면으로':'다시 시도'}</button></section></div>}

  </main>;
}
