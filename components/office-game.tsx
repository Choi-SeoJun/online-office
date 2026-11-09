'use client';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Armchair, ArrowLeft, ArrowRight, BriefcaseBusiness, Building2, Check, ChevronLeft, ChevronRight, Coffee, Cookie, DoorOpen, Gamepad2, Hand, Headphones, HelpCircle, Leaf, LoaderCircle, Minus, Monitor, Moon, MousePointer2, PackageOpen, Plus, RotateCcw, Settings2, Shirt, ShoppingBag, Sparkles, Volume2, VolumeX, Wind, X, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createGameEngine } from '@/game/engine';
import { readSavedState, writeSavedState } from '@/game/storage';
import { createOfficeAudio } from '@/game/audio';
import { WorkSheet } from './work-sheet';
import { resetWorkSheet } from '@/game/worksheet';
import './office-rooftop.css';
import { SNACKS, TARGETS, WEAPONS } from '@/game/layout';
import type { Command, DeskMode, GameEngine, GameState, OfficeScene, Snack, TargetId, Weapon } from '@/game/types';

const targetIcons: Record<TargetId, LucideIcon> = { desk: Monitor, boss: BriefcaseBusiness, coffee: Coffee, snacks: Cookie, lounge: Armchair, copier: PackageOpen, exit: DoorOpen, roofBench: Armchair, roofWall: Building2 };
const weaponIcons: Record<Weapon, LucideIcon> = { punch: Hand, hammer: Zap, fan: Wind };
const deskModes: { id: DeskMode; label: string; icon: LucideIcon }[] = [{ id: 'work', label: '일하는 척', icon: Monitor }, { id: 'shopping', label: '쇼핑', icon: ShoppingBag }, { id: 'game', label: '게임', icon: Gamepad2 }, { id: 'sleep', label: '졸기', icon: Moon }];

function ToolButton({ icon: Icon, label, onClick, active, disabled }: { icon: LucideIcon; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return <button type="button" className={`tool ${active ? 'selected' : ''}`} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}><Icon size={20} strokeWidth={1.65} /><span>{label}</span></button>;
}
export default function OfficeGame() {
  const [engine, setEngine] = useState<GameEngine | null>(null);
  useEffect(() => { const saved = readSavedState(); const next = createGameEngine(saved); if (!saved && window.matchMedia('(prefers-reduced-motion: reduce)').matches) next.dispatch({ type: 'settings', value: { reducedMotion: true } }); setEngine(next); return () => next.dispose(); }, []);
  if (!engine) return <main className="boot"><Building2 size={30} /><p>사무실 문을 열고 있어요.</p></main>;
  return <Game engine={engine} />;
}

function Game({ engine }: { engine: GameEngine }) {
  const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  const host = useRef<HTMLDivElement>(null), scene = useRef<OfficeScene | null>(null), audio = useRef<ReturnType<typeof createOfficeAudio> | null>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [name, setName] = useState(state.name), [panel, setPanel] = useState<'settings' | 'help' | 'bag' | null>(null);
  const [confirmReset, setConfirmReset] = useState(false), [hints, setHints] = useState(true);
  const panelRef = useRef(panel); panelRef.current = panel;
  const send = useCallback((command: Command) => { if (command.type === 'enter' || (command.type === 'settings' && command.value.sound)) audio.current?.start(); engine.dispatch(command); }, [engine]);
  useEffect(() => { const sound = createOfficeAudio(); audio.current = sound; return () => { sound.dispose(); audio.current = null; }; }, []);
  useEffect(() => {
    let cancelled = false; setReady(false); setError('');
    const fail = (message: string) => { if (cancelled) return; engine.dispatch({ type: 'pause', value: true }); audio.current?.sync(engine.state); setError(message); };
    void import('@/game/scene').then(({ createOfficeScene }) => {
      if (cancelled || !host.current) return;
      try { scene.current = createOfficeScene(host.current, {
        getState: () => engine.state, onFrame: dt => { engine.step(dt); audio.current?.sync(engine.state); },
        onGround: point => { if (engine.state.entered && !panelRef.current) { setHints(false); engine.dispatch({ type: 'move', point }); } },
        onTarget: target => { if (engine.state.entered && !panelRef.current) { setHints(false); engine.dispatch({ type: 'select', target }); } },
        onReady: () => { if (!cancelled) { engine.dispatch({ type: 'pause', value: document.hidden || panelRef.current === 'settings' || panelRef.current === 'help' }); setReady(true); } }, onError: message => fail(message || '이 브라우저에서 3D 화면을 열지 못했어요.'),
      }); } catch { fail('3D 화면을 열지 못했어요. 브라우저의 하드웨어 가속을 확인하거나 다른 브라우저로 접속해 주세요.'); }
    }).catch(() => fail('사무실을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.'));
    return () => { cancelled = true; scene.current?.dispose(); scene.current = null; };
  }, [engine, retry]);
  useEffect(() => { writeSavedState(state); }, [state.name, state.weapon, state.settings.sound, state.settings.volume, state.settings.reducedMotion, state.settings.quality, state.inventory.cookie, state.inventory.choco, state.inventory.cracker]);
  useEffect(() => {
    const keys = new Set<string>();
    const axis = () => engine.dispatch({ type: 'axis', x: Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')), z: Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup')) });
    const clear = () => { keys.clear(); axis(); };
    const visibility = () => { clear(); engine.dispatch({ type: 'pause', value: document.hidden || panelRef.current === 'settings' || panelRef.current === 'help' }); audio.current?.sync(engine.state); };
    const keydown = (event: KeyboardEvent) => {
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
    const focus = (event: FocusEvent) => { if ((event.target as HTMLElement | null)?.closest('input, textarea, select')) clear(); };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', clear); document.addEventListener('visibilitychange', visibility); document.addEventListener('focusin', focus);
    return () => { clear(); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', visibility); document.removeEventListener('focusin', focus); };
  }, [engine]);
  useEffect(() => { engine.dispatch({ type: 'axis', x: 0, z: 0 }); engine.dispatch({ type: 'pause', value: document.hidden || panel === 'settings' || panel === 'help' }); audio.current?.sync(engine.state); }, [engine, panel]);
  const select = (target: TargetId) => { setHints(false); setPanel(null); send({ type: 'select', target }); };
  const count = state.inventory.cookie + state.inventory.choco + state.inventory.cracker;
  const target = state.target ? TARGETS[state.target] : null;
  const TargetIcon = state.target ? targetIcons[state.target] : MousePointer2;
  const activityLabels = { brew: '커피 내리는 중', take: '아무도 못 봤겠지?', eat: '잠깐, 한 입만', drink: '커피 한 모금', spin: '의자도 기분 전환', candy: '사탕 하나, 입에 쏙' };
  const roof = state.floor === 'rooftop';
  const travelProgress = state.transition ? 1 - state.transition.remaining / state.transition.duration : 0;
  const travelFade = state.transition ? Math.max(0, 1 - Math.abs(travelProgress - .5) / .3) : 0;

  return <main className={`office-app ${state.entered ? 'is-playing' : 'is-welcome'} ${roof ? 'is-rooftop' : ''} ${state.transition ? 'is-travelling' : ''}`}>
    <div ref={host} className="scene-host" aria-label={roof ? '도시가 보이는 3D 옥상. 벤치에 앉거나 벽에 기대 사탕을 물고 쉴 수 있습니다.' : '상사와 동료가 있는 3D 사무실. 장소 버튼으로 이동하고 행동을 선택할 수 있습니다.'} />
    <div className="scene-vignette" />
    <header className="app-header"><div className="brand"><span className="brand-mark"><Building2 size={22} strokeWidth={1.6} /></span><div><h1>온라인 회사<span className="brand-dot">.</span></h1><p>오늘도 적당히</p></div></div><div className="header-tools">
      <button className="icon-button" aria-label={state.settings.sound ? '소리 끄기' : '소리 켜기'} onClick={() => send({ type: 'settings', value: { sound: !state.settings.sound } })}>{state.settings.sound ? <Volume2 size={20} /> : <VolumeX size={20} />}</button>
      <button className="icon-button" aria-label="이용 방법" onClick={() => setPanel('help')}><HelpCircle size={20} /></button><button className="icon-button" aria-label="설정" onClick={() => setPanel('settings')}><Settings2 size={20} /></button>
    </div></header>
    {!ready && !error && <div className="loading-status"><LoaderCircle className="loading-icon" size={18} />사무실을 준비하고 있어요</div>}
    {!state.entered && !error && <section className="welcome-card"><div className="eyebrow"><span />혼자만의 작은 회사</div><h2>출근은 했고,<br />일은 <em>모르겠고.</em></h2><p className="welcome-description">일하는 척 딴짓하고, 커피 한 잔 쉬어 가요.<br />이 회사에서는 조금 마음대로 해도 괜찮아요.</p><div className="entry-name"><label htmlFor="employee-name">오늘의 이름</label><input id="employee-name" value={name} maxLength={10} onChange={e => setName(e.target.value)} placeholder="김사원" autoComplete="off" /><span>사원</span></div><button className="primary-button enter-button" disabled={!ready} onClick={() => send({ type: 'enter', name: name.trim() || '김사원' })}>{ready ? <>출근하기<ArrowRight size={19} /></> : <>문 여는 중<LoaderCircle className="loading-icon" size={18} /></>}</button><div className="entry-footnote"><Leaf size={13} />가입도, 할당량도, 야근도 없어요.</div><div className="welcome-tags"><span><Monitor size={14} />눈치껏 딴짓</span><span><Zap size={14} />통쾌한 한 방</span><span><Coffee size={14} />커피 한 잔</span></div></section>}
    {state.entered && !error && <>
      <div className="employee-card"><span className="status-dot" /><strong>{state.name}</strong><span>{roof ? '잠깐, 숨 고르기' : '자유시간'}</span></div>
      <button className="floor-travel-button" disabled={!!state.transition} onClick={() => { setPanel(null); setHints(false); send({type:'travel',floor:roof ? 'office' : 'rooftop'}); }}>{roof ? <Building2 size={17} /> : <Wind size={17} />}<span>{roof ? '사무실로' : '옥상으로'}</span><ArrowRight size={15} /></button>
      {!roof && <nav className="location-nav" aria-label="사무실 장소">{(['desk','boss','coffee','snacks','lounge'] as TargetId[]).map(id => { const Icon = targetIcons[id]; return <button key={id} disabled={!!state.transition} className={state.target === id ? 'active' : ''} onClick={() => select(id)} aria-label={`${TARGETS[id].label}로 이동`}><Icon size={17} /><span>{id === 'coffee' ? '커피' : id === 'snacks' ? '과자' : TARGETS[id].label}</span></button>; })}</nav>}
      {roof && !state.activity && !state.transition && <div className="rooftop-note"><span>ROOFTOP BREAK</span><strong>오늘 삼킨 말은<br />달게 녹여 보내요.</strong><p>{state.settings.sound ? '바람 소리에, 잠깐 멍하니.' : '소리를 켜면 바람이 들려요.'}</p></div>}
      <div className="view-controls"><button className="icon-button" aria-label="확대" onClick={() => scene.current?.zoom(1)}><Plus size={17} /></button><button className="icon-button" aria-label="축소" onClick={() => scene.current?.zoom(-1)}><Minus size={17} /></button></div>
      {hints && <div className="first-hint"><MousePointer2 size={17} /><span>바닥을 눌러 걷거나, 장소를 골라요.</span><button aria-label="안내 닫기" onClick={() => setHints(false)}><X size={15} /></button></div>}
      {state.message && state.elapsed < state.messageUntil && <div className={`game-toast ${state.scold > 0 ? 'scold' : ''}`} role="status"><Sparkles size={16} /><span>{state.message}</span></div>}
      {state.warning > 0 && <div className="boss-warning" role="alert"><span className="warning-dot" /><div><strong>상사가 보고 있어요!</strong><span>지금 업무로 돌아가면 괜찮아요.</span></div><button onClick={() => send({ type: 'desk', mode: 'work' })}>업무로 전환 <kbd>Space</kbd></button><div className="warning-progress" style={{ width: `${state.warning / 2 * 100}%` }} /></div>}
      {state.seat === 'desk' && <MonitorPanel mode={state.deskMode || 'work'} reducedMotion={state.settings.reducedMotion} onType={key => audio.current?.typeKey(key)} />}
      <div className="bottom-area"><div className="bottom-meta"><span>{roof ? 'RF' : '1F'} <i />{roof ? '옥상 · 잠깐의 여유' : state.seat === 'desk' ? '내 자리' : state.target && state.ready ? TARGETS[state.target].label : '사무실'}</span><button onClick={() => { send({ type: 'exit' }); setPanel(null); }}><DoorOpen size={14} />퇴근하기</button></div>
        <section className={`action-dock ${roof && !state.activity ? 'roof-dock' : ''}`} aria-label="현재 가능한 행동">
          {state.activity ? <div className="activity-card"><span className="activity-icon">{state.activity.kind === 'candy' ? <Sparkles size={22} /> : <Coffee size={22} />}</span><div><strong>{activityLabels[state.activity.kind]}</strong><div className="activity-track" role="progressbar" aria-label={activityLabels[state.activity.kind]} aria-valuenow={Math.round((1 - state.activity.remaining / state.activity.duration) * 100)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${(1 - state.activity.remaining / state.activity.duration) * 100}%` }} /></div></div><button className="soft-button" onClick={() => send({ type: 'cancel' })}>취소</button></div>
           : roof ? <><div className="roof-rest-status"><span><Wind size={14} />{state.roofRest === 'bench' ? '벤치에서 쉬는 중' : state.roofRest === 'wall' ? '벽에 기대 쉬는 중' : state.destination && (state.target === 'roofBench' || state.target === 'roofWall') ? `${state.target === 'roofBench' ? '벤치로' : '벽으로'} 걸어가는 중` : '잠깐, 힘 빼고 쉬어가요.'}</span>{state.roofRest && <button onClick={() => send({type:'stand'})}>{state.roofRest === 'bench' ? '일어나기' : '기대기 그만'}<ArrowRight size={12} /></button>}</div><div className="roof-rest-tools"><ToolButton icon={Armchair} label="벤치에 앉기" active={state.roofRest === 'bench'} disabled={!!state.transition} onClick={() => {setPanel(null);send({type:'rest',place:'bench'});}} /><ToolButton icon={Building2} label="벽에 기대기" active={state.roofRest === 'wall'} disabled={!!state.transition} onClick={() => {setPanel(null);send({type:'rest',place:'wall'});}} /><button className={`primary-button candy-button ${state.candyInMouth ? 'holding' : ''}`} aria-pressed={state.candyInMouth} disabled={!!state.transition} onClick={() => {setPanel(null);send({type:'candy'});}}><Sparkles size={18} />{state.candyInMouth ? '사탕 빼기' : '사탕 물기'}</button></div></>
          : state.seat === 'desk' ? <><div className="dock-tools">{deskModes.map(item => <ToolButton key={item.id} icon={item.icon} label={item.label} active={state.deskMode === item.id} onClick={() => send({ type: 'desk', mode: item.id })} />)}<ToolButton icon={RotateCcw} label="의자 돌리기" onClick={() => send({ type: 'spin' })} /></div><div className="dock-divider" /><ToolButton icon={ArrowLeft} label="일어나기" onClick={() => send({ type: 'stand' })} /></>
          : state.target === 'boss' ? <><div className="dock-tools">{(Object.keys(WEAPONS) as Weapon[]).map(weapon => <ToolButton key={weapon} icon={weaponIcons[weapon]} label={WEAPONS[weapon].label} active={state.weapon === weapon} onClick={() => send({ type: 'weapon', weapon })} />)}</div><button className="hit-button" disabled={!state.ready} onClick={() => send({ type: 'attack' })}><Zap size={20} />{state.ready ? '한 대 치기' : '다가가는 중…'}</button></>
          : state.target === 'snacks' && state.ready ? <><div className="dock-caption"><Cookie size={22} /><strong>살짝 챙겨둘까요?</strong><span>주머니 {count}/6</span></div><div className="dock-tools">{(Object.keys(SNACKS) as Snack[]).map(snack => <ToolButton key={snack} icon={snack === 'cookie' ? Cookie : PackageOpen} label={SNACKS[snack]} disabled={count >= 6} onClick={() => send({ type: 'take', snack })} />)}</div></>
          : state.seat === 'lounge' ? <><div className="dock-caption"><Armchair size={22} /><strong>아무것도 안 해도 괜찮아요.</strong></div><ToolButton icon={Wind} label={state.player.pose === 'lean' ? '앉아 쉬기' : '기대기'} onClick={() => send({ type: 'interact' })} /><ToolButton icon={ArrowLeft} label="일어나기" onClick={() => send({ type: 'stand' })} /></>
          : target ? <><div className="dock-caption"><span className="target-glyph"><TargetIcon size={24} /></span><div><strong>{target.label}</strong><span>{state.ready ? '잠깐, 나만의 시간' : '천천히 걸어가는 중'}</span></div></div><button className="primary-button interact-button" disabled={!state.ready} onClick={() => send({ type: 'interact' })}>{state.ready ? target.action : <><LoaderCircle size={16} className="loading-icon" />이동 중</>}{state.ready && <kbd>E</kbd>}</button></>
          : <><div className="dock-caption"><MousePointer2 size={23} /><div><strong>오늘은 뭘 해볼까요?</strong><span>내 자리에 앉거나, 탕비실로 슬쩍 가보세요.</span></div></div><button className="primary-button" onClick={() => select('desk')}>내 자리로<ArrowRight size={17} /></button></>}
        </section><button className={`bag-button ${panel === 'bag' ? 'active' : ''}`} aria-label={`주머니 열기, 간식 ${count}개, 커피 ${state.inventory.coffee}모금`} onClick={() => setPanel(panel === 'bag' ? null : 'bag')}><ShoppingBag size={21} /><span>주머니</span><b>{count}</b>{state.inventory.coffee > 0 && <Coffee size={16} />}</button>
      </div>
    </>}
    {panel === 'bag' && state.entered && state.activity?.kind !== 'drink' && state.activity?.kind !== 'eat' && <aside className="bag-panel"><div className="panel-title"><div><span className="eyebrow">잠깐의 행복</span><h2>내 주머니 <small>{count}/6</small></h2></div><button className="icon-button" aria-label="주머니 닫기" onClick={() => setPanel(null)}><X size={19} /></button></div><div className="bag-coffee"><Coffee size={25} /><div><strong>{state.inventory.coffee ? '아직 따뜻한 커피' : '커피가 생각날 때'}</strong><span>{state.inventory.coffee ? `${state.inventory.coffee}모금 남았어요` : '탕비실에서 한 잔 내려요.'}</span></div><button disabled={!state.inventory.coffee || !!state.activity} onClick={() => send({ type: 'drink' })}>한 모금</button></div>{(Object.keys(SNACKS) as Snack[]).map(snack => <div className="bag-item" key={snack}><Cookie size={18} /><span>{SNACKS[snack]}</span><b>{state.inventory[snack]}</b><button disabled={!state.inventory[snack] || !!state.activity} onClick={() => send({ type: 'eat', snack })}>먹기</button></div>)}{count === 0 && <p className="bag-empty">과자 선반에서 슬쩍 챙겨 와요.</p>}</aside>}
    {(panel === 'settings' || panel === 'help') && <div className="modal-backdrop" onClick={() => setPanel(null)}><section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onClick={e => e.stopPropagation()}><div className="panel-title"><h2 id="dialog-title">{panel === 'settings' ? '내 취향대로' : '이 회사에서 노는 법'}</h2><button className="icon-button" aria-label="닫기" autoFocus onClick={() => setPanel(null)}><X size={20} /></button></div>{panel === 'settings' ? <>
      <label className="setting-row"><span><Volume2 size={18} />공간 소리</span><input type="checkbox" checked={state.settings.sound} onChange={e => send({ type: 'settings', value: { sound: e.target.checked } })} /></label>
      <label className="setting-row"><span>소리 크기</span><input aria-label="소리 크기" type="range" min="0" max="1" step="0.05" value={state.settings.volume} onChange={e => send({ type: 'settings', value: { volume: +e.target.value } })} /></label>
      <label className="setting-row"><span><Leaf size={18} />움직임 줄이기</span><input type="checkbox" checked={state.settings.reducedMotion} onChange={e => send({ type: 'settings', value: { reducedMotion: e.target.checked } })} /></label>
      <label className="setting-row"><span>화면 품질</span><select value={state.settings.quality} onChange={e => send({ type: 'settings', value: { quality: e.target.value as GameState['settings']['quality'] } })}><option value="auto">자동</option><option value="low">가볍게</option><option value="high">선명하게</option></select></label><p className="settings-note">이름, 설정, 간식과 업무 시트는 지금 사용하는 브라우저에 저장돼요.</p>
      {confirmReset ? <div className="reset-confirm"><p>이름과 설정, 업무 시트, 주머니 속 간식을 비우고 처음으로 돌아갈까요?</p><button className="danger-button" onClick={() => { resetWorkSheet(); send({ type: 'reset' }); setName('김사원'); setConfirmReset(false); setPanel(null); }}>처음부터 시작</button><button className="soft-button" onClick={() => setConfirmReset(false)}>취소</button></div> : <button className="text-button" onClick={() => setConfirmReset(true)}>처음부터 시작하기</button>}
    </> : <><p className="help-intro">할 일은 없어요. 하고 싶은 것만 해요.</p><div className="help-row"><MousePointer2 /><div><strong>바닥을 누르면 걸어요</strong><p>PC에서는 WASD와 방향키도 사용할 수 있어요.</p></div></div><div className="help-row"><Monitor /><div><strong>내 자리에서 눈치껏 딴짓</strong><p>셀을 눌러 내용을 입력해 보세요. 소리를 켜면 키보드 ASMR이 들려요. 상사가 보면 ‘일하는 척’으로 돌아와요.</p></div></div><div className="help-row"><Zap /><div><strong>상사에게 통쾌한 한 방</strong><p>가까이 다가가 도구를 고르고 ‘한 대 치기’를 눌러요.</p></div></div><div className="help-row"><Coffee /><div><strong>탕비실에서 빈둥거리기</strong><p>커피와 과자를 챙기고 주머니를 열어 맛있게 먹어요.</p></div></div><div className="help-row"><Wind /><div><strong>옥상에서 마음 비우기</strong><p>벤치에 앉거나 벽에 기대 쉬어요. ‘사탕 물기’는 따로 누르고, 물고 있는 채로 움직일 수 있어요. 소리를 켜면 잔잔한 바람이 들려요.</p></div></div><p className="settings-note">혼자 플레이하는 공간이에요. 상사와 동료는 게임 속 캐릭터입니다.</p></>}</section></div>}
    {error && <div className="error-backdrop"><section className="error-panel" role="alert"><Building2 size={32} /><h2>사무실 문이 잠깐 닫혔어요.</h2><p>{error}</p><button className="primary-button" onClick={() => { setError(''); setRetry(n => n + 1); }}>다시 열어보기<RotateCcw size={17} /></button></section></div>}
    {state.transition && <div className="floor-transition" role="status" aria-live="polite" style={{backgroundColor:`rgba(240, 233, 220, ${travelFade})`}}><span style={{opacity:travelFade}}><Wind size={25} />{state.transition.to === 'rooftop' ? '바람 쐬러 가는 길' : '다시, 오늘의 사무실로'}</span></div>}
    <div className="office-caption">평범한 회사, 조금 특별한 자유.</div>
  </main>;
}

function MonitorPanel({ mode, reducedMotion, onType }: { mode: DeskMode; reducedMotion: boolean; onType: (key: string) => void }) {
  const [product, setProduct] = useState(0), [wish, setWish] = useState<number[]>([]), [cell, setCell] = useState(4), [gameMessage, setGameMessage] = useState('반짝이는 칸을 톡 눌러보세요.');
  const products = [{ icon: Headphones, name: '아무 말도 안 들리는 헤드폰', note: '오늘의 위시리스트', color: 'lavender' }, { icon: Armchair, name: '퇴근이 기다려지는 의자', note: '앉아서 더 잘 쉬는 법', color: 'sage' }, { icon: Shirt, name: '아무 생각 없는 주말 셔츠', note: '마음만은 벌써 주말', color: 'peach' }];
  const ProductIcon = products[product].icon;
  return <section className={`monitor-panel mode-${mode}`} aria-label="내 모니터"><div className="monitor-chrome"><span className="window-dots"><i /><i /><i /></span><span>{mode === 'work' ? '월간 업무 현황.xlsx' : mode === 'shopping' ? '작은 장바구니' : mode === 'game' ? '업무 중 아닙니다' : '잠시 자리 비움'}</span><Monitor size={13} /></div>
    {mode === 'work' ? <WorkSheet onType={onType} />
    : mode === 'shopping' ? <div className="shopping-view"><span className="tiny-heading">사고 싶은 건 많은데</span><div className={`product-art ${products[product].color}`}><ProductIcon size={68} strokeWidth={1} /></div><strong>{products[product].name}</strong><p>{products[product].note}</p><div className="product-controls"><button aria-label="이전 상품" onClick={() => setProduct((product + 2) % 3)}><ChevronLeft size={18} /></button><button className={wish.includes(product) ? 'wished' : ''} onClick={() => setWish(wish.includes(product) ? wish.filter(p => p !== product) : [...wish, product])}>{wish.includes(product) ? <><Check size={13} />마음에 담았어요</> : <><ShoppingBag size={13} />마음에 담기</>}</button><button aria-label="다음 상품" onClick={() => setProduct((product + 1) % 3)}><ChevronRight size={18} /></button></div></div>
    : mode === 'game' ? <div className="mini-game"><span className="tiny-heading">아주 작은 딴짓</span><div className="game-grid">{Array.from({ length: 9 }, (_, i) => <button key={i} aria-label={cell === i ? '반짝이는 칸 누르기' : `빈 칸 ${i + 1}`} className={cell === i ? 'lit' : ''} onClick={() => { if (cell === i) { setCell((cell + 1 + Math.floor(Math.random() * 7)) % 9); setGameMessage(['아주 생산적인 딴짓이에요.','손끝은 바쁘게, 마음은 느긋하게.','한 번 더? 아무도 몰라요.'][i % 3]); } }}>{cell === i ? <Sparkles size={23} /> : <span />}</button>)}</div><p aria-live="polite">{gameMessage}</p></div>
    : <div className={`sleep-view ${reducedMotion ? 'still' : ''}`}><Moon size={38} strokeWidth={1.3} /><span className="sleep-z">z z Z</span><strong>눈만 잠깐 감는 중…</strong><p>생각은 열심히 하고 있습니다.</p></div>}
    <div className="monitor-foot"><span className={mode === 'work' ? 'work-dot' : 'slack-dot'} />{mode === 'work' ? '누가 봐도 업무 중' : '상사 접근 표시를 살짝 살펴요.'}</div></section>;
}
