import type { Settings } from './types.ts';

export type RenderQuality = Readonly<{ dpr: number; shadows: number; effects: Settings['quality'] }>;
export const AUTO_QUALITY: readonly RenderQuality[] = [
  { dpr: .75, shadows: 0, effects: 'low' },
  { dpr: 1, shadows: 0, effects: 'low' },
  { dpr: 1.25, shadows: 512, effects: 'auto' },
  { dpr: 1.5, shadows: 1024, effects: 'auto' },
];
export const MANUAL_QUALITY: Record<'low' | 'high', RenderQuality> = {
  low: { dpr: 1, shadows: 0, effects: 'low' },
  high: { dpr: 2, shadows: 2048, effects: 'high' },
};

/** Measures delivered RAF cadence, before the game's simulation delta is clamped. */
export function createAdaptiveQuality() {
  let mode: Settings['quality'] = 'auto', tier = 2, previous: number | null = null;
  let warmup = 2000, duration = 0, frames = 0, slow = 0, healthy = 0;
  let lastRise = -Infinity, recoveryDelay = 20000;
  const reset = () => { previous = null; warmup = 2000; duration = frames = slow = healthy = 0; };
  const profile = () => mode === 'auto' ? AUTO_QUALITY[tier] : MANUAL_QUALITY[mode];
  return {
    reset,
    sample(now: number, preference: Settings['quality'], active = true): RenderQuality {
      if (preference !== mode) { mode = preference; reset(); }
      if (!active || !Number.isFinite(now)) { reset(); return profile(); }
      const delta = previous === null ? 0 : now - previous; previous = now;
      if (mode !== 'auto') return profile();
      // Suspension/debugger pauses are not evidence of slow rendering. Ordinary
      // long frames remain in the window, including sustained single-digit FPS.
      if (delta < 0 || delta > 2000) { reset(); previous = now; return profile(); }
      if (delta === 0) return profile();
      if (warmup > 0) { warmup -= delta; return profile(); }
      duration += delta; frames++;
      if (duration < 1000) return profile();
      const fps = frames * 1000 / duration;
      slow = fps < 50 ? slow + duration : 0;
      healthy = fps > 57 ? healthy + duration : 0;
      const lower = tier > 0 && (fps < 30 || slow >= 2000);
      const higher = tier < AUTO_QUALITY.length - 1 && healthy >= recoveryDelay;
      duration = frames = 0;
      if (lower || higher) {
        if (lower) {
          if (now - lastRise < 10000) recoveryDelay = Math.min(120000, Math.max(60000, recoveryDelay * 2));
          tier--;
        } else { tier++; lastRise = now; }
        reset(); previous = now;
      }
      return profile();
    },
  };
}
