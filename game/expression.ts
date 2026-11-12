import type { GameState } from './types.ts';

/** One turn belongs to the activity, never to the viewer's render clock. */
export function chairSpinAngle(state: Pick<GameState, 'player' | 'activity' | 'settings' | 'seat'>): number {
  const activity = state.activity;
  if (state.settings.reducedMotion || state.seat !== 'desk' || state.player.pose !== 'spin' || activity?.kind !== 'spin' || activity.remaining <= 0) return 0;
  const progress = Math.max(0, Math.min(1, 1 - activity.remaining / activity.duration));
  return progress * progress * (3 - 2 * progress) * Math.PI * 2;
}

/** An occasional shared pause keeps the worker's hands and keyboard sound in step. */
export function workExpression(time: number) {
  const phase = ((time % 18) + 18) % 18;
  const smooth = (x: number) => { const value = Math.max(0, Math.min(1, x)); return value * value * (3 - 2 * value); };
  const sigh = smooth((phase - 11.4) / 1.2) * (1 - smooth((phase - 14.6) / 1.6));
  return { typing: phase < 11.4 || phase >= 16.2, sigh };
}
