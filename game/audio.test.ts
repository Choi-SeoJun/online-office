import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficeAudio } from './audio.ts';
import { createGameEngine } from './engine.ts';
import { WEAPON_IMPACT, WEAPONS } from './layout.ts';
import type { GameState, Weapon } from './types.ts';

// Node has no Web Audio device. This boundary double records emitted voices,
// while the real audio scheduler, mute logic and synthesis run unchanged.
function audioDevice(load?: (url: string) => Promise<ArrayBuffer>) {
  const voices: { at: number; until: number; kind: string; offset: number }[] = [], requests: string[] = [];
  type Automation = { method: string; value: number; at: number; timeConstant?: number };
  type Buffer = { data: Float32Array[]; duration: number; asset?: string; getChannelData(i: number): Float32Array };
  const nodes: Node[] = [], buffers: Buffer[] = [], contexts: Device[] = [];
  class Param {
    value = 0; schedule: Automation[] = [];
    setValueAtTime(value: number, at: number) { this.value = value; this.schedule.push({method:'set',value,at}); }
    exponentialRampToValueAtTime(value: number, at: number) { this.value = value; this.schedule.push({method:'exponential',value,at}); }
    linearRampToValueAtTime(value: number, at: number) { this.value = value; this.schedule.push({method:'linear',value,at}); }
    setTargetAtTime(value: number, at: number, timeConstant: number) { this.value = value; this.schedule.push({method:'target',value,at,timeConstant}); }
    cancelScheduledValues(at: number) { this.schedule.push({method:'cancel',value:this.value,at}); }
  }
  class Node {
    gain = new Param(); frequency = new Param(); Q = new Param(); playbackRate = new Param(); type = ''; buffer: Buffer | null = null;
    onended: (() => void) | null = null; connections: Node[] = []; disconnected = false; loop = false;
    kind: string; constructor(kind = 'node') { this.kind = kind; nodes.push(this); }
    connect(other: Node) { this.connections.push(other); return other; }
    disconnect() { this.disconnected = true; }
  }
  class Source extends Node { voice = { at: 0, until: Infinity, kind: '', offset: 0 }; constructor(kind: string) { super(kind); this.voice.kind = kind; } start(at = 0, offset = 0) { this.voice.at = at; this.voice.offset = offset; if(this.buffer?.asset)this.voice.kind='sample'; voices.push(this.voice); } stop(until = 0) { this.voice.until = until; } }
  class Device { state = 'running'; currentTime = 0; sampleRate = 8000; destination = new Node('destination'); constructor() { contexts.push(this); } createGain() { return new Node('gain'); } createOscillator() { return new Source('tone'); } createBufferSource() { return new Source('noise'); } createBiquadFilter() { return new Node('filter'); } createBuffer(channels: number, length: number): Buffer { const data = Array.from({length:channels}, () => new Float32Array(length)); const buffer = { data, duration:length/this.sampleRate, getChannelData: (i: number) => data[i] }; buffers.push(buffer); return buffer; } async decodeAudioData(bytes:ArrayBuffer) { const buffer=this.createBuffer(1,this.sampleRate);buffer.asset=new TextDecoder().decode(bytes);return buffer; } async resume() { this.state = 'running'; } async close() { this.state = 'closed'; } }
  const oldAudio = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext'), oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document'), oldFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => { requests.push(url);return {ok:true,arrayBuffer:()=>load?load(url):Promise.resolve(new TextEncoder().encode(url).buffer)}; }) as typeof fetch;
  Object.defineProperty(globalThis, 'AudioContext', { value: Device, configurable: true });
  const document = { hidden: false };
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  return {
    voices, nodes, buffers, contexts, document, requests,
    wind() {
      const source = nodes.find(n => n instanceof Source && n.loop) as Source | undefined;
      assert.ok(source, 'the rooftop needs a reusable looping wind source');
      const highpass = source.connections[0], lowpass = highpass?.connections[0], level = lowpass?.connections[0];
      assert.equal(highpass?.type, 'highpass'); assert.equal(lowpass?.type, 'lowpass'); assert.equal(level?.kind, 'gain');
      return { source, highpass, lowpass, level, master: level.connections[0] };
    },
    restore() { globalThis.fetch=oldFetch;if (oldAudio) Object.defineProperty(globalThis, 'AudioContext', oldAudio); else Reflect.deleteProperty(globalThis, 'AudioContext'); if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document'); }
  };
}

test('keyboard ASMR only plays at the active work desk, with no backlog after pauses', () => {
  const device = audioDevice(), sound = createOfficeAudio(), engine = createGameEngine();
  try {
    engine.dispatch({type:'enter'}); engine.dispatch({type:'settings',value:{sound:true}}); sound.start();
    engine.state.elapsed = 2; sound.sync(engine.state);
    assert.equal(device.voices.length, 0, 'standing in the office must remain silent');
    engine.state.seat = 'desk'; engine.state.deskMode = 'work'; engine.state.player.pose = 'type';
    engine.state.elapsed += 1; sound.sync(engine.state);
    assert.ok(device.voices.some(v => v.kind === 'noise'), 'typing needs a mechanical click, not only an oscillator beep');
    const count = device.voices.length; engine.state.paused = true; engine.state.elapsed += 100; sound.sync(engine.state);
    sound.typeKey('a'); assert.equal(device.voices.length, count);
    engine.state.paused = false; engine.state.deskMode = 'sleep'; engine.state.elapsed += 100; sound.sync(engine.state);
    assert.equal(device.voices.length, count);
    engine.state.deskMode = 'work'; engine.state.elapsed += .05; sound.sync(engine.state);
    assert.ok(device.voices.length - count <= 4, 'resuming must not schedule all missed keys');
    assert.ok(device.voices.filter(v => Number.isFinite(v.until)).every(v => v.until - v.at < .2));
  } finally { sound.dispose(); device.restore(); }
});

test('entering, walking and returning to the office never start a background tone', () => {
  const device = audioDevice(), sound = createOfficeAudio(), engine = createGameEngine();
  try {
    engine.state.settings.sound = true;
    sound.start(); sound.sync(engine.state);
    assert.equal(device.voices.length, 0, 'opening the audio device must not start a pitched loop');
    for (let visit = 0; visit < 3; visit++) {
      engine.dispatch({type:'enter'}); sound.start();
      for (let frame = 0; frame < 600; frame++) {
        engine.state.elapsed += 1 / 60; device.contexts[0].currentTime += 1 / 60;
        engine.state.player.pose = frame < 300 ? 'idle' : 'walk';
        engine.state.player.moving = frame >= 300;
        sound.sync(engine.state);
      }
      assert.equal(device.voices.length, 0, 'idle and movement frames do not create recurring tones');
      engine.dispatch({type:'exit'}); sound.sync(engine.state);
    }
    assert.equal(device.contexts.length, 1, 'returning reuses the existing audio device');
  } finally { sound.dispose(); device.restore(); }
});

test('automatic keyboard sound pauses with the visible sigh and resumes without a backlog', () => {
  const device = audioDevice(), sound = createOfficeAudio(), engine = createGameEngine();
  try {
    engine.dispatch({type:'enter'}); engine.state.settings.sound = true;
    engine.state.seat = 'desk'; engine.state.deskMode = 'work'; engine.state.player.pose = 'type'; sound.start();
    engine.state.elapsed = 3; sound.sync(engine.state); const before = device.voices.length;
    for (let time = 12; time < 16; time += .1) { engine.state.elapsed = time; sound.sync(engine.state); }
    assert.equal(device.voices.length, before, 'hands resting at the monitor do not produce automatic key taps');
    engine.state.elapsed = 18; sound.sync(engine.state);
    assert.ok(device.voices.length > before && device.voices.length <= before + 3);
  } finally { sound.dispose(); device.restore(); }
});

test('direct worksheet keys respect sound, volume, hidden pages and disposal', () => {
  const device = audioDevice(), sound = createOfficeAudio(), engine = createGameEngine();
  try {
    engine.dispatch({type:'enter'}); engine.state.seat = 'desk'; engine.state.deskMode = 'work'; engine.state.player.pose = 'type'; sound.start();
    sound.sync(engine.state); const silentCount = device.voices.length; sound.typeKey('a'); assert.equal(device.voices.length, silentCount);
    engine.state.settings.sound = true; sound.sync(engine.state); const before = device.voices.length; sound.typeKey('Enter'); assert.ok(device.voices.length > before);
    engine.state.settings.volume = 0; sound.sync(engine.state); const quietCount = device.voices.length; sound.typeKey(' '); assert.equal(device.voices.length, quietCount);
    engine.state.settings.volume = .4; device.document.hidden = true; sound.sync(engine.state); sound.typeKey('Backspace'); assert.equal(device.voices.length, quietCount);
    sound.dispose(); sound.typeKey('x'); assert.equal(device.voices.length, quietCount);
  } finally { sound.dispose(); device.restore(); }
});

test('wind starts softly only on an entered, audible and settled rooftop', () => {
  const device = audioDevice(), sound = createOfficeAudio(), engine = createGameEngine();
  try {
    sound.start(); engine.state.settings.sound = true;
    sound.sync(engine.state);
    engine.dispatch({type:'enter'}); sound.sync(engine.state);
    assert.equal(device.nodes.some(n => n.loop), false, 'the office has no active wind loop');
    engine.state.floor = 'rooftop'; engine.state.transition = {from:'office',to:'rooftop',remaining:.5,duration:1}; sound.sync(engine.state);
    assert.equal(device.nodes.some(n => n.loop), false, 'the floor midpoint is still a transition');
    engine.state.transition = null; engine.state.settings.sound = false; sound.sync(engine.state);
    assert.equal(device.nodes.some(n => n.loop), false);
    engine.state.settings.sound = true; engine.state.paused = true; sound.sync(engine.state);
    assert.equal(device.nodes.some(n => n.loop), false);
    engine.state.paused = false; device.document.hidden = true; sound.sync(engine.state);
    assert.equal(device.nodes.some(n => n.loop), false);
    device.document.hidden = false; engine.state.settings.volume = 0; sound.sync(engine.state);
    assert.equal(device.nodes.some(n => n.loop), false);
    engine.state.settings.volume = .4; engine.state.entered = false; sound.sync(engine.state);
    assert.equal(device.nodes.some(n => n.loop), false);
    engine.state.entered = true; sound.sync(engine.state);
    const wind = device.wind(), fade = wind.level.gain.schedule.at(-1)!;
    assert.equal(fade.method, 'target'); assert.ok(fade.value > 0 && fade.value <= .12); assert.ok(fade.timeConstant! >= .5, 'enter with a soft fade');
    assert.equal(wind.master.gain.schedule.at(-1)?.value, .4, 'wind uses the existing volume control');
    assert.ok(wind.lowpass.frequency.value < 1500, 'wind should not be a bright hiss');
    const data = wind.source.buffer!.data;
    assert.equal(data.length, 2, 'a stereo breeze gives the rooftop some space');
    assert.ok(data[0].length >= device.contexts[0].sampleRate * 4);
    assert.ok(data[0].some((sample, i) => sample !== data[1][i]), 'the two channels must not be identical');
    for (const channel of data) {
      assert.ok(channel.every(value => Number.isFinite(value) && Math.abs(value) <= 1));
      assert.ok(Math.abs(channel[0] - channel.at(-1)!) < .0001, 'the loop seam must not click');
    }
  } finally { sound.dispose(); device.restore(); }
});

test('wind gently fades on travel and quickly silences for mute, pause, exit and hidden tabs', () => {
  const device = audioDevice(), sound = createOfficeAudio(), engine = createGameEngine();
  try {
    engine.dispatch({type:'enter'}); engine.state.floor = 'rooftop'; engine.state.settings.sound = true;
    sound.start(); sound.sync(engine.state);
    const {level, master} = device.wind();
    const assertQuiet = (fast: boolean) => {
      const fade = level.gain.schedule.at(-1)!;
      assert.equal(fade.method, 'target'); assert.equal(fade.value, 0);
      assert.ok(fade.timeConstant! > 0 && fade.timeConstant! <= (fast ? .05 : .2));
      if (fast) assert.equal(master.gain.schedule.at(-1)?.value, 0);
    };
    const enableAgain = () => { device.contexts[0].currentTime += 1; sound.sync(engine.state); assert.ok(level.gain.schedule.at(-1)!.value > 0); };
    engine.state.transition = {from:'rooftop',to:'office',remaining:1,duration:1}; sound.sync(engine.state); assertQuiet(false);
    engine.state.transition = null; enableAgain();
    engine.state.floor = 'office'; sound.sync(engine.state); assertQuiet(false);
    engine.state.floor = 'rooftop'; enableAgain();
    engine.state.settings.sound = false; sound.sync(engine.state); assertQuiet(true);
    engine.state.settings.sound = true; enableAgain();
    engine.state.settings.volume = 0; sound.sync(engine.state); assertQuiet(true);
    engine.state.settings.volume = .4; enableAgain();
    engine.state.paused = true; sound.sync(engine.state); assertQuiet(true);
    engine.state.paused = false; enableAgain();
    device.document.hidden = true; sound.sync(engine.state); assertQuiet(true);
    device.document.hidden = false; enableAgain();
    engine.state.entered = false; sound.sync(engine.state); assertQuiet(true);
  } finally { sound.dispose(); device.restore(); }
});

test('wind gusts stay calm, reuse resources on round trips and stop on disposal', () => {
  const device = audioDevice(), sound = createOfficeAudio(), engine = createGameEngine();
  try {
    engine.dispatch({type:'enter'}); engine.state.floor = 'rooftop'; engine.state.settings.sound = true;
    sound.start(); sound.sync(engine.state);
    const wind = device.wind(), nodeCount = device.nodes.length, bufferCount = device.buffers.length;
    for (let frame = 1; frame <= 1800; frame++) {
      engine.state.elapsed = frame / 60; device.contexts[0].currentTime = frame / 60; sound.sync(engine.state);
    }
    const levels = wind.level.gain.schedule.filter(item => item.method === 'target');
    assert.ok(levels.length > 10 && levels.length <= 125, 'wind modulation is gently paced, not rescheduled every frame');
    assert.ok(levels.every(item => item.value >= .035 && item.value <= .12));
    assert.ok(Math.max(...levels.map(item => item.value)) - Math.min(...levels.map(item => item.value)) > .015, 'the breeze should rise and fall slowly');
    for (let visit = 0; visit < 20; visit++) {
      engine.state.floor = 'office'; sound.sync(engine.state);
      engine.state.floor = 'rooftop'; sound.start(); sound.sync(engine.state);
    }
    assert.equal(device.nodes.length, nodeCount, 'travel reuses the same nodes'); assert.equal(device.buffers.length, bufferCount);
    assert.equal(device.voices.filter(voice => voice.kind === 'noise').length, 1, 'only one wind source is started');
    sound.dispose();
    assert.ok(Number.isFinite(wind.source.voice.until));
    assert.ok([wind.source, wind.highpass, wind.lowpass, wind.level, wind.master].every(node => node.disconnected));
    assert.equal(device.contexts[0].state, 'closed');
    sound.start(); sound.sync(engine.state); assert.equal(device.nodes.length, nodeCount);
  } finally { sound.dispose(); device.restore(); }
});

function hit(state: GameState, weapon: Weapon, id = 1) {
  state.player.pose = 'hit'; state.lastHit = {id,weapon,at:state.elapsed};
  state.event = {id,kind:weapon,text:'타격',at:state.elapsed};
}

test('each supplied weapon sample sounds once at visible contact, not during windup', async () => {
  for (const weapon of Object.keys(WEAPONS) as Weapon[]) {
    const device=audioDevice(), sound=createOfficeAudio(), engine=createGameEngine();
    try {
      engine.dispatch({type:'enter'});engine.state.settings.sound=true;await sound.start();sound.sync(engine.state);
      const before=device.voices.length;hit(engine.state,weapon);sound.sync(engine.state);
      assert.equal(device.voices.length,before,'starting the swing is not its impact');
      engine.state.elapsed=WEAPONS[weapon].interval*WEAPON_IMPACT-.002;sound.sync(engine.state);
      assert.equal(device.voices.length,before);
      engine.state.elapsed+=.004;device.contexts[0].currentTime=engine.state.elapsed;sound.sync(engine.state);
      const impact=device.voices.slice(before);assert.equal(impact.length,1,'play only the provided recording, without synthesized layers');
      assert.equal(impact[0].kind,'sample');assert.equal(impact[0].at,device.contexts[0].currentTime);
      const expected={fan:['/audio/ribhavagrawal-hit-by-a-wood-230542.mp3',.048],hammer:['/audio/bithuh-villager-hit-4-hd-402179.mp3',.035],punch:['/audio/soraatwod-punch-416719.mp3',.375]}[weapon];
      const source=device.nodes.find(n=>n.buffer?.asset&&n.onended)!;
      assert.equal(source.buffer!.asset,expected[0]);assert.equal(impact[0].offset,expected[1]);assert.equal(source.loop,false);
      assert.equal(source.connections[0].connections[0],device.nodes.find(n=>n.kind==='gain'),'recordings use the existing master volume');
      const after=device.voices.length;for(let i=0;i<20;i++)sound.sync(engine.state);
      assert.equal(device.voices.length,after,'render frames cannot replay a hit');
      engine.state.elapsed=WEAPONS[weapon].interval+.1;engine.state.player.pose='idle';sound.sync(engine.state);
      assert.equal(device.voices.length,after,'completed strikes cannot replay');
    } finally {sound.dispose();device.restore();}
  }
});

test('interrupted impacts never catch up after mute, pause, travel, cancellation or a hidden tab', async () => {
  const interruptions: {name:string;on:(state:GameState,doc:{hidden:boolean})=>void;off:(state:GameState,doc:{hidden:boolean})=>void}[]=[
    {name:'mute',on:s=>{s.settings.sound=false;},off:s=>{s.settings.sound=true;}},
    {name:'volume',on:s=>{s.settings.volume=0;},off:s=>{s.settings.volume=.4;}},
    {name:'pause',on:s=>{s.paused=true;},off:s=>{s.paused=false;}},
    {name:'hidden tab',on:(_,d)=>{d.hidden=true;},off:(_,d)=>{d.hidden=false;}},
    {name:'transition',on:s=>{s.transition={from:'office',to:'rooftop',remaining:1,duration:1};},off:s=>{s.transition=null;}},
    {name:'exit',on:s=>{s.entered=false;},off:s=>{s.entered=true;}},
    {name:'cancel',on:s=>{s.player.pose='idle';},off:s=>{s.player.pose='hit';}},
  ];
  for(const interruption of interruptions){
    const device=audioDevice(),sound=createOfficeAudio(),engine=createGameEngine();
    try{
      engine.dispatch({type:'enter'});engine.state.settings.sound=true;await sound.start();sound.sync(engine.state);
      hit(engine.state,'fan');sound.sync(engine.state);const before=device.voices.length;
      interruption.on(engine.state,device.document);sound.sync(engine.state);
      engine.state.elapsed=WEAPONS.fan.interval*WEAPON_IMPACT+.01;interruption.off(engine.state,device.document);sound.sync(engine.state);
      assert.equal(device.voices.length,before,interruption.name);
      engine.state.elapsed+=1;hit(engine.state,'fan',2);sound.sync(engine.state);
      engine.state.elapsed+=WEAPONS.fan.interval*WEAPON_IMPACT+.01;sound.sync(engine.state);
      assert.ok(device.voices.length>before,'a later deliberate hit still works');
      const sources=device.nodes.filter(n=>n.onended);interruption.on(engine.state,device.document);sound.sync(engine.state);
      assert.ok(sources.every(n=>n.disconnected),'an interruption releases active impact voices');
    }finally{sound.dispose();device.restore();}
  }
});

test('supplied samples are cached, finish naturally and release their voice chains', async () => {
  const device=audioDevice(),sound=createOfficeAudio(),engine=createGameEngine();
  try{
    engine.dispatch({type:'enter'});engine.state.settings.sound=true;await sound.start();sound.sync(engine.state);
    const profiles: string[]=[];
    for(const [index,weapon] of (Object.keys(WEAPONS) as Weapon[]).entries()){
      engine.state.elapsed=index*2;hit(engine.state,weapon,index+1);sound.sync(engine.state);
      const first=device.nodes.length;engine.state.elapsed+=WEAPONS[weapon].interval*WEAPON_IMPACT+.01;sound.sync(engine.state);
      const nodes=device.nodes.slice(first);
      profiles.push(nodes.find(n=>n.buffer?.asset)!.buffer!.asset!);
      const sources=nodes.filter(n=>n.onended);assert.equal(sources.length,1);
      engine.state.elapsed=index*2+WEAPONS[weapon].interval+.01;engine.state.player.pose='idle';sound.sync(engine.state);
      assert.ok(!sources[0].disconnected,'ordinary animation completion preserves the recording tail');
      for(const source of sources)source.onended?.();assert.ok(nodes.every(n=>n.disconnected),'natural completion releases the entire voice chain');
    }
    assert.equal(new Set(profiles).size,3,'each object has its own material sound');
    const bufferCount=device.buffers.length;
    for(let i=0;i<20;i++){
      engine.state.elapsed+=2;hit(engine.state,'fan',i+10);sound.sync(engine.state);
      engine.state.elapsed+=WEAPONS.fan.interval*WEAPON_IMPACT+.01;sound.sync(engine.state);
      for(const node of device.nodes)node.onended?.();
    }
    assert.equal(device.buffers.length,bufferCount,'hits reuse decoded recordings');
    await sound.start();assert.equal(device.requests.length,3,'repeated gestures do not download the samples again');
    engine.dispatch({type:'reset'});sound.sync(engine.state);
    engine.dispatch({type:'enter'});engine.state.settings.sound=true;hit(engine.state,'fan');sound.sync(engine.state);
    const before=device.voices.length;engine.state.elapsed+=WEAPONS.fan.interval*WEAPON_IMPACT+.01;sound.sync(engine.state);
    assert.ok(device.voices.length>before,'resetting hit IDs must not suppress a fresh game');
    const live=device.nodes.filter(n=>n.onended&&!n.disconnected);sound.dispose();assert.ok(live.every(n=>n.disconnected));
  }finally{sound.dispose();device.restore();}
});


test('late sample loading never plays a missed impact and still serves the next hit', async () => {
  let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});
  const device=audioDevice(async url=>{await wait;return new TextEncoder().encode(url).buffer;}),sound=createOfficeAudio(),engine=createGameEngine();
  try{
    engine.dispatch({type:'enter'});engine.state.settings.sound=true;const loading=sound.start();
    hit(engine.state,'punch');sound.sync(engine.state);engine.state.elapsed=.25;sound.sync(engine.state);
    release();await loading;sound.sync(engine.state);assert.equal(device.voices.length,0,'load completion must not replay an old contact');
    engine.state.elapsed=2;hit(engine.state,'punch',2);sound.sync(engine.state);engine.state.elapsed+=.25;sound.sync(engine.state);
    assert.equal(device.voices.length,1);assert.equal(device.voices[0].kind,'sample');
  }finally{release();sound.dispose();device.restore();}
});

test('missing audio files and disposal during loading do not interrupt the game', async () => {
  const device=audioDevice(async()=>{throw new Error('offline');}),sound=createOfficeAudio(),engine=createGameEngine();
  try{
    engine.dispatch({type:'enter'});engine.state.settings.sound=true;await sound.start();hit(engine.state,'hammer');engine.state.elapsed=.4;
    assert.doesNotThrow(()=>sound.sync(engine.state));assert.equal(device.voices.length,0);
    sound.dispose();await sound.start();assert.equal(device.requests.length,3);
  }finally{sound.dispose();device.restore();}
  let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});
  const delayed=audioDevice(async url=>{await wait;return new TextEncoder().encode(url).buffer;}),closed=createOfficeAudio();
  try{const loading=closed.start();closed.dispose();release();await loading;assert.equal(delayed.voices.length,0);assert.equal(delayed.contexts[0].state,'closed');}
  finally{release();closed.dispose();delayed.restore();}
});
