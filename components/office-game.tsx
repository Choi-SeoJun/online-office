'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Armchair, ArrowLeft, ArrowRight, BriefcaseBusiness, Building2, Check, ChevronLeft, ChevronRight, Coffee, Cookie, DoorOpen, Files, Gamepad2, Hand, Headphones, HelpCircle, Leaf, LoaderCircle, Monitor, Moon, MousePointer2, PackageOpen, RotateCcw, Settings2, Shirt, ShoppingBag, Sparkles, Volume2, VolumeX, Wind, X, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createGameEngine } from '@/game/engine';
import { getRoofLean, ROOF_LEAN_DISTANCE } from '@/game/roof-rest';
import { readSavedState, writeSavedState, writeAvatarChoice, writeRankChoice } from '@/game/storage';
import { createOfficeAudio } from '@/game/audio';
import { TodoBoard } from './todo-board';
import { WorkClock } from './work-clock';
import { AvatarPicker } from './avatar-picker';
import { RankPicker } from './rank-picker';
import { employeeLabel, type JobRank } from '@/game/ranks';
import { CameraControls } from './camera-controls';
import { FeedbackDialog } from './feedback-dialog';
import { OfficeBulletinBoard } from './office-bulletin-board';
import { UpdateNews } from './update-news';
import { OfficePlayControls } from './office-play-controls';
import './office-rooftop.css';
import { isRoofTarget, ROOF_WALLS, SNACKS, TARGETS, WEAPONS } from '@/game/layout';
import type { AvatarStyle, Command, DeskMode, GameEngine, GameState, OfficeScene, Snack, TargetId, Weapon } from '@/game/types';

export default function OfficeGame({onMultiplayer}: {onMultiplayer?:()=>void}) {
  const [engine, setEngine] = useState<GameEngine | null>(null);
  useEffect(() => { const saved = readSavedState(); const next = createGameEngine(saved); if (!saved && window.matchMedia('(prefers-reduced-motion: reduce)').matches) next.dispatch({ type: 'settings', value: { reducedMotion: true } }); setEngine(next); return () => next.dispose(); }, []);
  if (!engine) return <main className="boot"><Building2 size={30} /><p>사무실 문을 열고 있어요.</p></main>;
  return <Game engine={engine} onMultiplayer={onMultiplayer} />;
}

function Game({ engine, onMultiplayer }: { engine: GameEngine; onMultiplayer?:()=>void }) {
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const roof = state.floor === 'rooftop';
  const host = useRef<HTMLDivElement>(null), scene = useRef<OfficeScene | null>(null), audio = useRef<ReturnType<typeof createOfficeAudio> | null>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [name, setName] = useState(state.name), [panel, setPanel] = useState<'settings' | 'help' | 'bag' | null>(null);
  const [avatar, setAvatar] = useState<AvatarStyle>(state.player.avatar ?? 'short');
  const [rank, setRank] = useState<JobRank>(state.rank), [bossRank, setBossRank] = useState<JobRank>(state.bossRank);
  const [confirmReset, setConfirmReset] = useState(false), [hints, setHints] = useState(true);
  const panelRef = useRef(panel); panelRef.current = panel;
  const feedbackOpen = useRef(false);
  const boardOpen = useRef(false);
  const newsOpen = useRef(false);
  const syncPause = useCallback(() => {
    engine.dispatch({ type: 'pause', value: document.hidden || feedbackOpen.current || boardOpen.current || newsOpen.current || panelRef.current === 'settings' || panelRef.current === 'help' });
    audio.current?.sync(engine.state);
  }, [engine]);
  const handleFeedbackOpen = (open: boolean) => {
    feedbackOpen.current = open;
    syncPause();
  };
  const handleBoardOpen = (open: boolean) => { boardOpen.current = open; syncPause(); };
  const handleNewsOpen = (open: boolean) => { newsOpen.current = open; syncPause(); };
  const send = useCallback((command: Command) => { if (feedbackOpen.current || boardOpen.current || newsOpen.current) return; if (command.type === 'enter' || (command.type === 'settings' && command.value.sound)) audio.current?.start(); engine.dispatch(command); }, [engine]);
  useEffect(() => { const sound = createOfficeAudio(); audio.current = sound; return () => { sound.dispose(); audio.current = null; }; }, []);
  useEffect(() => {
    let cancelled = false; setReady(false); setError('');
    const fail = (message: string) => { if (cancelled) return; engine.dispatch({ type: 'pause', value: true }); audio.current?.sync(engine.state); setError(message); };
    void import('@/game/scene').then(({ createOfficeScene }) => {
      if (cancelled || !host.current) return;
      try { scene.current = createOfficeScene(host.current, {
        getState: () => engine.state, onFrame: dt => { engine.step(dt); audio.current?.sync(engine.state); },
        onGround: point => { if (engine.state.entered && !panelRef.current && !feedbackOpen.current && !boardOpen.current && !newsOpen.current) { setHints(false); engine.dispatch({ type: 'move', point }); } },
        onTarget: (target, point) => { if (engine.state.entered && !panelRef.current && !feedbackOpen.current && !boardOpen.current && !newsOpen.current) { setHints(false); engine.dispatch({ type: 'select', target, point }); } },
        onReady: () => { if (!cancelled) { syncPause(); setReady(true); } }, onError: message => fail(message || '이 브라우저에서 3D 화면을 열지 못했어요.'),
      }); } catch { fail('3D 화면을 열지 못했어요. 브라우저의 하드웨어 가속을 확인하거나 다른 브라우저로 접속해 주세요.'); }
    }).catch(() => fail('사무실을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.'));
    return () => { cancelled = true; scene.current?.dispose(); scene.current = null; };
  }, [engine, retry, syncPause]);
  useEffect(() => { writeSavedState(state); }, [state.name, state.rank, state.bossRank, state.player.avatar, state.weapon, state.settings.sound, state.settings.volume, state.settings.reducedMotion, state.settings.quality, state.inventory.cookie, state.inventory.choco, state.inventory.cracker]);
  useEffect(() => {
    const keys = new Set<string>();
    const axis = () => { const input = { x: Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')), z: Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup')) }; engine.dispatch({ type: 'axis', ...(scene.current?.screenToWorld(input) ?? input) }); };
    const clear = () => { keys.clear(); axis(); };
    const visibility = () => { clear(); syncPause(); };
    const keydown = (event: KeyboardEvent) => {
      if (feedbackOpen.current || boardOpen.current || newsOpen.current || event.defaultPrevented) { clear(); return; }
      const element = event.target as HTMLElement | null;
      if (panelRef.current === 'settings' || panelRef.current === 'help') {
        if (event.key === 'Escape') { event.preventDefault(); setPanel(null); return; }
        if (event.key === 'Tab') {
          const controls = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"] button:not(:disabled), [role="dialog"] input:not(:disabled), [role="dialog"] select:not(:disabled)'));
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || !element?.closest('[role="dialog"]'))) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && (document.activeElement === last || !element?.closest('[role="dialog"]'))) { event.preventDefault(); first?.focus(); }
        }
        return;
      }
      if (!engine.state.entered || engine.state.transition || element?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (element?.closest('button') && (event.key === ' ' || event.key === 'Enter')) return;
      if (event.key === 'Escape') { event.preventDefault(); setPanel(null); engine.dispatch({ type: 'cancel' }); return; }
      const key = event.key.toLowerCase();
      if (key === ' ' && engine.state.seat === 'desk' && !engine.state.paused) { event.preventDefault(); if (!event.repeat) engine.dispatch({ type: 'desk', mode: 'work' }); return; }
      if (panelRef.current || engine.state.paused) return;
      if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) { event.preventDefault(); keys.add(key); axis(); setHints(false); }
      if (event.repeat) return;
      if (key === 'e') { event.preventDefault(); engine.dispatch({ type: 'interact' }); }
    };
    const keyup = (event: KeyboardEvent) => { if (keys.delete(event.key.toLowerCase())) axis(); };
    const focus = (event: FocusEvent) => { if ((event.target as HTMLElement | null)?.closest('input, textarea, select, [role="dialog"]')) clear(); };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', clear); document.addEventListener('visibilitychange', visibility); document.addEventListener('focusin', focus);
    return () => { clear(); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('focusin', focus); };
  }, [engine, syncPause]);
  useEffect(() => { engine.dispatch({ type: 'axis', x: 0, z: 0 }); syncPause(); }, [engine, panel, syncPause]);
  const select = (target: TargetId) => { setHints(false); setPanel(null); send({ type: 'select', target }); };

  return <main className={`office-app ${state.entered ? 'is-playing' : 'is-welcome'} ${roof ? 'is-rooftop' : ''} ${state.transition ? 'is-travelling' : ''}`}>
    <div ref={host} className="scene-host" aria-label={roof ? '도시가 보이는 3D 옥상. 벤치에 앉거나 벽에 기대 사탕을 물고 쉴 수 있습니다.' : '상사와 동료가 있는 3D 사무실. 장소 버튼으로 이동하고 행동을 선택할 수 있습니다.'} />
    <div className="scene-vignette" />
    <header className="app-header"><div className="brand"><span className="brand-mark"><Building2 size={22} strokeWidth={1.6} /></span><div><h1>온라인 회사<span className="brand-dot">.</span></h1><p>오늘도 적당히</p></div></div><div className="header-tools">{state.entered && <WorkClock/>}
      <FeedbackDialog context={{ mode: 'solo', floor: roof ? 'roof' : 'office' }} onOpenChange={handleFeedbackOpen} />
      <button className="icon-button" aria-label={state.settings.sound ? '소리 끄기' : '소리 켜기'} onClick={() => send({ type: 'settings', value: { sound: !state.settings.sound } })}>{state.settings.sound ? <Volume2 size={20} /> : <VolumeX size={20} />}</button>
      <button className="icon-button" aria-label="이용 방법" onClick={() => setPanel('help')}><HelpCircle size={20} /></button><button className="icon-button" aria-label="설정" onClick={() => setPanel('settings')}><Settings2 size={20} /></button>
    </div></header>
    {!ready && !error && <div className="loading-status"><LoaderCircle className="loading-icon" size={18} />사무실을 준비하고 있어요</div>}
    {!state.entered && !error && <section className="welcome-card rank-entry">{onMultiplayer && <div className="mode-switch" aria-label="플레이 방식"><button aria-pressed="true">혼자 쉬기</button><button onClick={onMultiplayer}>동료들과</button></div>}<div className="eyebrow"><span />혼자만의 작은 회사</div><h2>출근은 했고,<br />일은 <em>모르겠고.</em></h2><p className="welcome-description">일하는 척 딴짓하고, 커피 한 잔 쉬어 가요.<br />이 회사에서는 조금 마음대로 해도 괜찮아요.</p><div className="entry-name"><label htmlFor="employee-name">오늘의 이름</label><input id="employee-name" value={name} maxLength={10} onChange={e => setName(e.target.value)} placeholder="김사원" autoComplete="off" /></div><RankPicker label="나의 직급" value={rank} onChange={value=>{setRank(value);writeRankChoice(value,bossRank);}}/><RankPicker label="나의 상사의 직급은 무엇인가요?" value={bossRank} onChange={value=>{setBossRank(value);writeRankChoice(rank,value);}}/><AvatarPicker value={avatar} onChange={value=>{setAvatar(value);writeAvatarChoice(value);}}/><button className="primary-button enter-button" disabled={!ready} onClick={() => send({ type: 'enter', name: name.trim() || '김사원', avatar, rank, bossRank })}>{ready ? <>출근하기<ArrowRight size={19} /></> : <>문 여는 중<LoaderCircle className="loading-icon" size={18} /></>}</button><div className="entry-footnote"><Leaf size={13} />가입도, 할당량도, 야근도 없어요.</div><UpdateNews context={{mode:'solo',floor:'office'}} placement="card" autoOpenReady={ready && !panel && !state.transition} onOpenChange={handleNewsOpen}/></section>}
    {state.entered && !error && <>
      <div className="employee-card"><span className="status-dot" /><strong>{employeeLabel(state.name,state.rank)}</strong><span>{roof ? '잠깐, 숨 고르기' : '자유시간'}</span></div>
      <CameraControls disabled={!!state.transition} onZoom={delta=>scene.current?.zoom(delta)} />
      {hints && <div className="first-hint"><MousePointer2 size={17} /><span>눌러서 걷기 · 상하좌우 드래그로 시점 조절</span><button aria-label="안내 닫기" onClick={() => setHints(false)}><X size={15} /></button></div>}
      <OfficePlayControls state={state} send={send} panel={panel} setPanel={setPanel} onExit={()=>send({type:"exit"})} onType={key=>audio.current?.typeKey(key)} newsAction={<UpdateNews context={{mode:'solo',floor:roof?'roof':'office'}} autoOpenReady={ready && !panel && !state.transition} onOpenChange={handleNewsOpen}/>} boardAction={<OfficeBulletinBoard name={employeeLabel(state.name,state.rank)} onOpenChange={handleBoardOpen}/>} />
    </>}
    {(panel === 'settings' || panel === 'help') && <div className="modal-backdrop" onClick={() => setPanel(null)}><section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onClick={e => e.stopPropagation()}><div className="panel-title"><h2 id="dialog-title">{panel === 'settings' ? '내 취향대로' : '이 회사에서 노는 법'}</h2><button className="icon-button" aria-label="닫기" autoFocus onClick={() => setPanel(null)}><X size={20} /></button></div>{panel === 'settings' ? <>
      <label className="setting-row"><span><Volume2 size={18} />공간 소리</span><input type="checkbox" checked={state.settings.sound} onChange={e => send({ type: 'settings', value: { sound: e.target.checked } })} /></label>
      <label className="setting-row"><span>소리 크기</span><input aria-label="소리 크기" type="range" min="0" max="1" step="0.05" value={state.settings.volume} onChange={e => send({ type: 'settings', value: { volume: +e.target.value } })} /></label>
      <label className="setting-row"><span><Leaf size={18} />움직임 줄이기</span><input type="checkbox" checked={state.settings.reducedMotion} onChange={e => send({ type: 'settings', value: { reducedMotion: e.target.checked } })} /></label>
      <label className="setting-row"><span>화면 품질</span><select value={state.settings.quality} onChange={e => send({ type: 'settings', value: { quality: e.target.value as GameState['settings']['quality'] } })}><option value="auto">자동</option><option value="low">가볍게</option><option value="high">선명하게</option></select></label><p className="settings-note">이름, 캐릭터, 설정과 간식은 이 브라우저에 저장돼요. 개인 할 일과 출퇴근 시간도 이곳에만 보관돼요.</p>
      {confirmReset ? <div className="reset-confirm"><p>이름과 캐릭터, 설정, 주머니 속 간식을 비우고 처음으로 돌아갈까요? 개인 할 일과 출퇴근 시간은 유지돼요.</p><button className="danger-button" onClick={() => { send({ type: 'reset' }); setName('김사원'); setAvatar('short'); setRank('사원'); setBossRank('부장'); setConfirmReset(false); setPanel(null); }}>처음부터 시작</button><button className="soft-button" onClick={() => setConfirmReset(false)}>취소</button></div> : <button className="text-button" onClick={() => setConfirmReset(true)}>처음부터 시작하기</button>}
    </> : <><p className="help-intro">할 일은 없어요. 하고 싶은 것만 해요.</p><div className="help-row"><MousePointer2 /><div><strong>바닥을 누르면 걸어요</strong><p>PC에서는 WASD와 방향키도 사용할 수 있어요. 화면을 상하좌우로 드래그해 둘러보세요. 위로 끌면 시점이 낮아지고, 아래로 끌면 높아져요. +/− 버튼으로 확대·축소할 수 있어요.</p></div></div><div className="help-row"><Monitor /><div><strong>내 자리에서 눈치껏 딴짓</strong><p>할 일을 적고 완료한 항목을 체크해 보세요. 소리를 켜면 키보드 ASMR이 들려요. 상사가 보면 ‘일하는 척’으로 돌아와요.</p></div></div><div className="help-row"><Zap /><div><strong>상사에게 통쾌한 한 방</strong><p>가까이 다가가 도구를 고르고 ‘한 대 치기’를 눌러요.</p></div></div><div className="help-row"><Coffee /><div><strong>탕비실에서 빈둥거리기</strong><p>커피와 과자를 챙기고 주머니를 열어 맛있게 먹어요.</p></div></div><div className="help-row"><Wind /><div><strong>옥상에서 마음 비우기</strong><p>벽 가까이 가면 ‘여기에 기대기’가 나타나요. 멀리서 ‘벽에 기대기’를 누르면 가장 가까운 벽으로 걸어가요. 벽을 직접 누르면 누른 위치에 기댑니다. ‘사탕 물기’는 따로 누르고, 물고 있는 채로 움직일 수 있어요. 소리를 켜면 잔잔한 바람이 들려요.</p></div></div><p className="settings-note">혼자 플레이하는 공간이에요. 상사와 동료는 게임 속 캐릭터입니다.</p></>}</section></div>}
    {error && <div className="error-backdrop"><section className="error-panel" role="alert"><Building2 size={32} /><h2>사무실 문이 잠깐 닫혔어요.</h2><p>{error}</p><button className="primary-button" onClick={() => { setError(''); setRetry(n => n + 1); }}>다시 열어보기<RotateCcw size={17} /></button></section></div>}
    <div className="office-caption">평범한 회사, 조금 특별한 자유.</div>
  </main>;
}
