import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficeAudio } from './audio.ts';
import { createGameEngine } from './engine.ts';

// Node has no Web Audio device. This boundary double records emitted voices,
// while the real audio scheduler, mute logic and synthesis run unchanged.
function audioDevice() {
  const voices: { at: number; until: number; kind: string }[] = [];
  type Automation = { method: string; value: number; at: number; timeConstant?: number };
  type Buffer = { data: Float32Array[]; getChannelData(i: number): Float32Array };
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
  class Source extends Node { voice = { at: 0, until: Infinity, kind: '' }; constructor(kind: string) { super(kind); this.voice.kind = kind; } start(at = 0) { this.voice.at = at; voices.push(this.voice); } stop(until = 0) { this.voice.until = until; } }
  class Device { state = 'running'; currentTime = 0; sampleRate = 8000; destination = new Node('destination'); constructor() { contexts.push(this); } createGain() { return new Node('gain'); } createOscillator() { return new Source('tone'); } createBufferSource() { return new Source('noise'); } createBiquadFilter() { return new Node('filter'); } createBuffer(channels: number, length: number) { const data = Array.from({length:channels}, () => new Float32Array(length)); const buffer = { data, getChannelData: (i: number) => data[i] }; buffers.push(buffer); return buffer; } async resume() { this.state = 'running'; } async close() { this.state = 'closed'; } }
  const oldAudio = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext'), oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'AudioContext', { value: Device, configurable: true });
  const document = { hidden: false };
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  return {
    voices, nodes, buffers, contexts, document,
    wind() {
      const source = nodes.find(n => n instanceof Source && n.loop) as Source | undefined;
      assert.ok(source, 'the rooftop needs a reusable looping wind source');
      const highpass = source.connections[0], lowpass = highpass?.connections[0], level = lowpass?.connections[0];
      assert.equal(highpass?.type, 'highpass'); assert.equal(lowpass?.type, 'lowpass'); assert.equal(level?.kind, 'gain');
      return { source, highpass, lowpass, level, master: level.connections[0] };
    },
    restore() { if (oldAudio) Object.defineProperty(globalThis, 'AudioContext', oldAudio); else Reflect.deleteProperty(globalThis, 'AudioContext'); if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document'); }
  };
}

test('keyboard ASMR only plays at the active work desk, with no backlog after pauses', () => {
  const device = audioDevice(), sound = createOfficeAudio(), engine = createGameEngine();
  try {
    engine.dispatch({type:'enter'}); engine.dispatch({type:'settings',value:{sound:true}}); sound.start();
    engine.state.elapsed = 2; sound.sync(engine.state);
    assert.equal(device.voices.length, 1, 'standing in the office must not emit keyboard voices');
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
