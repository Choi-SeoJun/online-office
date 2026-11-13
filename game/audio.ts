import type { GameState, Weapon } from './types.ts';
import { WEAPON_IMPACT, WEAPONS } from './layout.ts';
import { publicAssetPath } from './hosting.ts';
import { workExpression } from './expression.ts';
import type { Precipitation } from './environment-types.ts';

const IMPACT_SAMPLES: Record<Weapon, { url: string; offset: number }> = {
  fan: { url: publicAssetPath('audio/ribhavagrawal-hit-by-a-wood-230542.mp3'), offset: .048 },
  hammer: { url: publicAssetPath('audio/bithuh-villager-hit-4-hd-402179.mp3'), offset: .035 },
  punch: { url: publicAssetPath('audio/soraatwod-punch-416719.mp3'), offset: .375 },
};

function rainBuffer(context: AudioContext) {
  const rate = context.sampleRate, length = Math.ceil(rate * 16);
  const buffer = context.createBuffer(2, length, rate);
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  const smoothing = Math.exp(-2 * Math.PI * 2700 / rate);
  const dropDecay = Math.exp(-1 / (rate * .018));
  let common = 0, leftDrop = 0, rightDrop = 0;
  for (let i = 0; i < length; i++) {
    const noise = Math.random() * 2 - 1;
    common = smoothing * common + (1 - smoothing) * noise;
    leftDrop *= dropDecay;
    rightDrop *= dropDecay;
    // Independent soft splashes are bursts of noise with short, irregular tails.
    const drop = Math.random() * rate;
    if (drop < 18) leftDrop += .19 * (1 - drop / 18);
    else if (drop < 36) rightDrop += .19 * (1 - (drop - 18) / 18);
    left[i] = common * .36 + (Math.random() * 2 - 1) * (.09 + leftDrop);
    right[i] = common * .36 + (Math.random() * 2 - 1) * (.09 + rightDrop);
  }
  for (const channel of [left, right]) {
    // Match the endpoints with a slow correction removed by the high-pass.
    const drift = channel[length - 1] - channel[0];
    let peak = 0;
    for (let i = 0; i < length; i++) {
      channel[i] -= drift * i / (length - 1);
      peak = Math.max(peak, Math.abs(channel[i]));
    }
    if (peak > .8) for (let i = 0; i < length; i++) channel[i] *= .8 / peak;
  }
  return buffer;
}

/** Uploaded impact recordings and synthesized keyboard, wind and rain. */
export function createOfficeAudio() {
  let context: AudioContext | null = null, master: GainNode | null = null;
  let keyNoise: AudioBuffer | null = null, currentState: GameState | null = null;
  let wind: AudioBufferSourceNode | null = null, windHighpass: BiquadFilterNode | null = null, windLowpass: BiquadFilterNode | null = null, windLevel: GainNode | null = null;
  let windActive = false, nextWindUpdate = 0;
  let rain: { source: AudioBufferSourceNode; highpass: BiquadFilterNode; lowpass: BiquadFilterNode; level: GainNode } | null = null;
  let rainTarget = 0;
  const impactBuffers = new Map<Weapon, AudioBuffer>(), sampleRequest = new AbortController();
  let impactLoading: Promise<void> | null = null;
  let hitKey: string | null = null, impactDone = false;
  const impactVoices = new Set<() => void>();
  let lastEvent = 0, nextTyping = 0, burstLeft = 0, directUntil = 0, lastDirect = -Infinity, disposed = false;
  async function start() {
    if (disposed) return;
    try {
      if (!context) {
        context = new AudioContext(); master = context.createGain(); master.gain.value = 0; master.connect(context.destination);
        keyNoise = context.createBuffer(1, Math.ceil(context.sampleRate * .05), context.sampleRate);
        const data = keyNoise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (context.sampleRate * .012));
      }
      if (context.state === 'suspended') void context.resume().catch(() => {});
      impactLoading ??= loadImpacts(context);
      await impactLoading;
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
  async function loadImpacts(device: AudioContext) {
    await Promise.all((Object.keys(IMPACT_SAMPLES) as Weapon[]).map(async weapon => {
      try {
        const response = await fetch(IMPACT_SAMPLES[weapon].url, { signal: sampleRequest.signal });
        if (!response.ok || disposed) return;
        const bytes = await response.arrayBuffer();
        if (disposed) return;
        const buffer = await device.decodeAudioData(bytes);
        if (!disposed && context === device) impactBuffers.set(weapon, buffer);
      } catch { /* Missing optional audio must not prevent an attack or start a late one. */ }
    }));
  }
  function stopImpacts() { for (const stop of [...impactVoices]) stop(); }
  function impact(weapon: Weapon) {
    const buffer = impactBuffers.get(weapon);
    if (!context || !master || !buffer) return;
    const source = context.createBufferSource(), level = context.createGain();
    source.buffer = buffer; level.gain.value = .8;
    source.connect(level).connect(master);
    let ended = false;
    const cleanup = () => {
      if (ended) return;
      ended = true; source.disconnect(); level.disconnect(); impactVoices.delete(stop);
    };
    const stop = () => { if (!ended) { source.stop(); cleanup(); } };
    impactVoices.add(stop); source.onended = cleanup;
    // Keep the original recordings; skip measured leading silence at playback only.
    const offset = Math.min(IMPACT_SAMPLES[weapon].offset, buffer.duration);
    source.start(context.currentTime, offset);
  }
  function syncImpact(state: GameState, enabled: boolean) {
    const hit = state.lastHit, key = hit ? `${hit.id}:${hit.at}:${hit.weapon}` : null;
    if (key !== hitKey) { stopImpacts(); hitKey = key; impactDone = false; }
    const age = hit ? state.elapsed - hit.at : 0, duration = hit ? WEAPONS[hit.weapon].interval : 0;
    const finishedSwing = !!hit && age >= duration && state.player.pose === 'idle';
    const active = enabled && inOffice(state) && !state.transition && (state.player.pose === 'hit' || finishedSwing) && !state.activity && context?.state === 'running';
    if (!active) { if (hit) impactDone = true; stopImpacts(); return; }
    if (!hit || impactDone) return;
    if (age < 0 || age >= duration) { impactDone = true; return; }
    // Consume only the current contact. No wall-clock timers or missed-hit backlog.
    if (age + 1e-8 >= duration * WEAPON_IMPACT) { impactDone = true; impact(hit.weapon); }
  }
  const inOffice = (state: GameState) => !('floor' in state) || state.floor !== 'rooftop';
  const audible = (state: GameState) => !disposed && state.entered && !state.paused && state.settings.sound && state.settings.volume > 0 && !document.hidden;
  const working = (state: GameState) => inOffice(state) && state.seat === 'desk' && state.deskMode === 'work' && state.player.pose === 'type' && !state.activity;
  function prepareWind() {
    if (wind || !context || !master) return;
    // Allocate once on the first audible rooftop visit. Correlated stereo noise
    // is softened before filtering so the breeze has width without sharp hiss.
    const length = Math.ceil(context.sampleRate * 8), buffer = context.createBuffer(2, length, context.sampleRate);
    const left = buffer.getChannelData(0), right = buffer.getChannelData(1), smoothing = Math.exp(-2 * Math.PI * 650 / context.sampleRate);
    let common = 0, sideLeft = 0, sideRight = 0;
    for (let i = 0; i < length; i++) {
      common = smoothing * common + (1 - smoothing) * (Math.random() * 2 - 1);
      sideLeft = smoothing * sideLeft + (1 - smoothing) * (Math.random() * 2 - 1);
      sideRight = smoothing * sideRight + (1 - smoothing) * (Math.random() * 2 - 1);
      left[i] = common * .7 + sideLeft * .3; right[i] = common * .7 + sideRight * .3;
    }
    for (const data of [left, right]) {
      // Remove the endpoint drift across the full loop rather than cutting at
      // a random sample. The high-pass removes this inaudible slow correction.
      const drift = data[length - 1] - data[0]; let peak = 0;
      for (let i = 0; i < length; i++) { data[i] -= drift * i / (length - 1); peak = Math.max(peak, Math.abs(data[i])); }
      if (peak > .8) for (let i = 0; i < length; i++) data[i] *= .8 / peak;
    }
    wind = context.createBufferSource(); wind.buffer = buffer; wind.loop = true;
    windHighpass = context.createBiquadFilter(); windHighpass.type = 'highpass'; windHighpass.frequency.value = 90; windHighpass.Q.value = .5;
    windLowpass = context.createBiquadFilter(); windLowpass.type = 'lowpass'; windLowpass.frequency.value = 800; windLowpass.Q.value = .5;
    windLevel = context.createGain(); windLevel.gain.value = 0;
    wind.connect(windHighpass).connect(windLowpass).connect(windLevel).connect(master); wind.start();
  }
  function syncWind(state: GameState, enabled: boolean) {
    const active = enabled && !inOffice(state) && !state.transition;
    if (active) prepareWind();
    if (!context || !windLevel || !windLowpass) return;
    const at = context.currentTime, changed = active !== windActive;
    if (!changed && (!active || at < nextWindUpdate)) return;
    if (changed) windLevel.gain.cancelScheduledValues(at);
    const gust = .08 + Math.sin(state.elapsed * .31) * .025 + Math.sin(state.elapsed * .73 + 1.4) * .01;
    windLevel.gain.setTargetAtTime(active ? gust : 0, at, active ? .7 : enabled ? .16 : .04);
    if (active) windLowpass.frequency.setTargetAtTime(800 + Math.sin(state.elapsed * .23) * 180, at, 1.2);
    windActive = active; nextWindUpdate = at + .25;
  }
  function syncRain(state: GameState, enabled: boolean, precipitation: Precipitation) {
    if (!context || !master || context.state !== 'running') return;
    const indoors = inOffice(state);
    const target = enabled && !state.transition && precipitation === 'rain' ? (indoors ? .055 : .125) : 0;
    if (target === rainTarget) return;
    const cutoff = indoors ? 950 : 3200;
    if (!rain) {
      const source = context.createBufferSource();
      source.buffer = rainBuffer(context);
      source.loop = true;
      const highpass = context.createBiquadFilter(), lowpass = context.createBiquadFilter();
      highpass.type = 'highpass'; highpass.frequency.value = 170; highpass.Q.value = .5;
      lowpass.type = 'lowpass'; lowpass.frequency.value = cutoff; lowpass.Q.value = .5;
      const level = context.createGain();
      level.gain.value = 0;
      source.connect(highpass).connect(lowpass).connect(level).connect(master);
      source.start();
      rain = { source, highpass, lowpass, level };
    }
    const at = context.currentTime;
    if (target) rain.lowpass.frequency.setTargetAtTime(cutoff, at, .35);
    rain.level.gain.setTargetAtTime(target, at, target ? .45 : enabled ? .24 : .04);
    rainTarget = target;
  }
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
  function sync(state: GameState, precipitation: Precipitation = 'none') {
    currentState = state;
    const enabled = audible(state);
    if (master && context) master.gain.setTargetAtTime(enabled ? Math.min(1, Math.max(0, state.settings.volume)) : 0, context.currentTime, 0.04);
    syncWind(state, enabled);
    syncRain(state, enabled, precipitation);
    syncImpact(state, enabled);
    if (!enabled) { lastEvent = state.event?.id ?? lastEvent; nextTyping = state.elapsed + .08; burstLeft = 0; return; }
    if (state.event && state.event.id !== lastEvent) {
      lastEvent = state.event.id;
      switch (state.event.kind) {
        case 'coffee': tone(160, .4, .06, 'triangle', 80); break;
        case 'snack': tone(950, .09, .05, 'square', 300); break;
        case 'sip': tone(420, .16, .04, 'sine', 620); break;
        case 'caught': tone(340, .23, .06, 'triangle', 180); break;
      }
    }
    if (!working(state) || !workExpression(state.elapsed).typing) { nextTyping = state.elapsed + .08; burstLeft = 0; return; }
    if (state.elapsed < directUntil || state.elapsed < nextTyping) return;
    // Schedule one key per animation frame, never a backlog of missed sounds.
    keyStroke();
    if (burstLeft <= 0) burstLeft = 3 + Math.floor(Math.random() * 5);
    burstLeft--;
    nextTyping = state.elapsed + (burstLeft ? .08 + Math.random() * .13 : .35 + Math.random() * .55);
  }
  return { start, sync, typeKey, dispose() {
    if (disposed) return;
    disposed = true; currentState = null; sampleRequest.abort(); impactBuffers.clear(); stopImpacts();
    wind?.stop(); wind?.disconnect(); windHighpass?.disconnect(); windLowpass?.disconnect(); windLevel?.disconnect();
    if (rain) {
      rain.source.stop();
      rain.source.disconnect(); rain.highpass.disconnect(); rain.lowpass.disconnect(); rain.level.disconnect();
      rain = null;
    }
    master?.disconnect(); if (context) void context.close().catch(() => {});
    context = null; master = null; keyNoise = null; wind = null; windHighpass = null; windLowpass = null; windLevel = null;
  } };
}
