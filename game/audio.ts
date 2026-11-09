import type { GameState } from './types.ts';

/** Original synthesized office sound; no downloads or background timers. */
export function createOfficeAudio() {
  let context: AudioContext | null = null, master: GainNode | null = null, hum: OscillatorNode | null = null;
  let lastEvent = 0, lastTyping = 0, disposed = false;
  function start() {
    if (disposed) return;
    try {
      if (!context) {
        context = new AudioContext(); master = context.createGain(); master.gain.value = 0; master.connect(context.destination);
        hum = context.createOscillator(); hum.frequency.value = 90;
        const level = context.createGain(); level.gain.value = 0.008; hum.connect(level).connect(master); hum.start();
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
  function sync(state: GameState) {
    const audible = state.entered && !state.paused && state.settings.sound && !document.hidden;
    if (master && context) master.gain.setTargetAtTime(audible ? Math.min(1, Math.max(0, state.settings.volume)) : 0, context.currentTime, 0.04);
    if (!audible) { lastEvent = state.event?.id ?? lastEvent; return; }
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
    if (state.elapsed - lastTyping > .43) { lastTyping = state.elapsed; tone(state.deskMode === 'work' ? 1100 : 700, .018, state.deskMode === 'work' ? .025 : .008, 'triangle', 150); }
  }
  return { start, sync, dispose() { disposed = true; hum?.stop(); hum?.disconnect(); master?.disconnect(); if (context) void context.close().catch(() => {}); context = null; master = null; } };
}
