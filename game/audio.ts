import type { GameState } from './types.ts';

/** Original synthesized office sound; no downloads or background timers. */
export function createOfficeAudio() {
  let context: AudioContext | null = null, master: GainNode | null = null, hum: OscillatorNode | null = null, humLevel: GainNode | null = null;
  let keyNoise: AudioBuffer | null = null, currentState: GameState | null = null;
  let lastEvent = 0, nextTyping = 0, burstLeft = 0, directUntil = 0, lastDirect = -Infinity, disposed = false;
  function start() {
    if (disposed) return;
    try {
      if (!context) {
        context = new AudioContext(); master = context.createGain(); master.gain.value = 0; master.connect(context.destination);
        hum = context.createOscillator(); hum.frequency.value = 90;
        humLevel = context.createGain(); humLevel.gain.value = 0.008; hum.connect(humLevel).connect(master); hum.start();
        keyNoise = context.createBuffer(1, Math.ceil(context.sampleRate * .05), context.sampleRate);
        const data = keyNoise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (context.sampleRate * .012));
      }
      if (context.state === 'suspended') void context.resume().catch(() => {});
    } catch { /* Optional sound must not prevent play. */ }
  }
  function tone(frequency: number, duration: number, level: number, type: OscillatorType = 'sine', end = frequency) {
    if (!context || !master || context.state !== 'running') return;
    const t = context.currentTime, oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, t); oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration);
    gain.gain.setValueAtTime(level, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    oscillator.connect(gain).connect(master); oscillator.start(t); oscillator.stop(t + duration);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  const inOffice = (state: GameState) => !('floor' in state) || state.floor !== 'rooftop';
  const audible = (state: GameState) => !disposed && state.entered && !state.paused && state.settings.sound && state.settings.volume > 0 && !document.hidden;
  const working = (state: GameState) => inOffice(state) && state.seat === 'desk' && state.deskMode === 'work' && state.player.pose === 'type' && !state.activity;
  function clickNoise(at: number, level: number, pitch: number) {
    if (!context || !master || !keyNoise) return;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = keyNoise; source.playbackRate.value = pitch;
    filter.type = 'highpass'; filter.frequency.value = 1000; filter.Q.value = .45;
    gain.gain.setValueAtTime(level, at); gain.gain.exponentialRampToValueAtTime(.0001, at + .034);
    source.connect(filter).connect(gain).connect(master); source.start(at); source.stop(at + .045);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
  function keyStroke(key = 'a') {
    if (!context || context.state !== 'running') return;
    const wide = key === ' ' || key === 'Enter', pitch = (wide ? .7 : 1) * (.92 + Math.random() * .17);
    clickNoise(context.currentTime, wide ? .16 : .12, pitch);
    tone(wide ? 130 : 180 + Math.random() * 55, .046, wide ? .055 : .035, 'triangle', 70);
    clickNoise(context.currentTime + .036, .045, pitch * 1.18);
  }
  function typeKey(key: string) {
    const state = currentState;
    if (!state || !audible(state) || !working(state) || !context || context.currentTime - lastDirect < .025) return;
    lastDirect = context.currentTime; directUntil = state.elapsed + .65; keyStroke(key);
  }
  function sync(state: GameState) {
    currentState = state;
    const enabled = audible(state);
    if (master && context) master.gain.setTargetAtTime(enabled ? Math.min(1, Math.max(0, state.settings.volume)) : 0, context.currentTime, 0.04);
    if (humLevel && context) humLevel.gain.setTargetAtTime(inOffice(state) ? .008 : 0, context.currentTime, .15);
    if (!enabled) { lastEvent = state.event?.id ?? lastEvent; nextTyping = state.elapsed + .08; burstLeft = 0; return; }
    if (state.event && state.event.id !== lastEvent) {
      lastEvent = state.event.id;
      switch (state.event.kind) {
        case 'punch': tone(95, .11, .25, 'triangle', 40); break;
        case 'hammer': tone(480, .24, .21, 'sine', 110); tone(145, .11, .12, 'triangle', 50); break;
        case 'fan': tone(300, .12, .1, 'sawtooth', 75); break;
        case 'coffee': tone(160, .4, .06, 'triangle', 80); break;
        case 'snack': tone(950, .09, .05, 'square', 300); break;
        case 'sip': tone(420, .16, .04, 'sine', 620); break;
        case 'caught': tone(340, .23, .06, 'triangle', 180); break;
      }
    }
    if (!working(state)) { nextTyping = state.elapsed + .08; burstLeft = 0; return; }
    if (state.elapsed < directUntil || state.elapsed < nextTyping) return;
    // Schedule one key per animation frame, never a backlog of missed sounds.
    keyStroke();
    if (burstLeft <= 0) burstLeft = 3 + Math.floor(Math.random() * 5);
    burstLeft--;
    nextTyping = state.elapsed + (burstLeft ? .08 + Math.random() * .13 : .35 + Math.random() * .55);
  }
  return { start, sync, typeKey, dispose() { if (disposed) return; disposed = true; currentState = null; hum?.stop(); hum?.disconnect(); humLevel?.disconnect(); master?.disconnect(); if (context) void context.close().catch(() => {}); context = null; master = null; keyNoise = null; } };
}
