import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficeAudio } from './audio.ts';
import { createGameEngine } from './engine.ts';

// Node has no Web Audio device. This boundary double records emitted voices,
// while the real audio scheduler, mute logic and synthesis run unchanged.
function audioDevice() {
  const voices: { at: number; until: number; kind: string }[] = [];
  class Param { value = 0; setValueAtTime(v: number) { this.value = v; } exponentialRampToValueAtTime(v: number) { this.value = v; } linearRampToValueAtTime(v: number) { this.value = v; } setTargetAtTime(v: number) { this.value = v; } cancelScheduledValues() {} }
  class Node { gain = new Param(); frequency = new Param(); Q = new Param(); playbackRate = new Param(); type = ''; buffer: unknown; onended: (() => void) | null = null; connect(other: unknown) { return other; } disconnect() {} }
  class Source extends Node { voice = { at: 0, until: Infinity, kind: '' }; constructor(kind: string) { super(); this.voice.kind = kind; } start(at = 0) { this.voice.at = at; voices.push(this.voice); } stop(until = 0) { this.voice.until = until; } }
  class Device { state = 'running'; currentTime = 0; sampleRate = 8000; destination = new Node(); createGain() { return new Node(); } createOscillator() { return new Source('tone'); } createBufferSource() { return new Source('noise'); } createBiquadFilter() { return new Node(); } createBuffer(channels: number, length: number) { const data = Array.from({length:channels}, () => new Float32Array(length)); return { getChannelData: (i: number) => data[i] }; } async resume() { this.state = 'running'; } async close() { this.state = 'closed'; } }
  const oldAudio = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext'), oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'AudioContext', { value: Device, configurable: true });
  const document = { hidden: false };
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  return { voices, document, restore() { if (oldAudio) Object.defineProperty(globalThis, 'AudioContext', oldAudio); else Reflect.deleteProperty(globalThis, 'AudioContext'); if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document'); } };
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
