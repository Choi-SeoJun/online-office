import type { GameState, PersistedState, Settings, Snack, Weapon } from './types.ts';

export const STORAGE_KEY = 'office-playground-v1';
const defaults: Settings = { sound: false, volume: .4, reducedMotion: false, quality: 'auto' };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function normalize(value: unknown): PersistedState | undefined {
  const data = record(value);
  if (data.version !== 1) return undefined;
  const s = record(data.settings), amounts = record(data.snacks);
  const snacks = { cookie: 0, choco: 0, cracker: 0 };
  let room = 6;
  for (const key of ['cookie', 'choco', 'cracker'] as Snack[]) {
    const n = amounts[key];
    snacks[key] = typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? Math.min(n, room) : 0;
    room -= snacks[key];
  }
  return {
    version: 1,
    name: typeof data.name === 'string' ? data.name.trim().slice(0, 10) || '김사원' : '김사원',
    weapon: (['punch', 'hammer', 'fan'].includes(data.weapon as string) ? data.weapon : 'punch') as Weapon,
    settings: {
      sound: typeof s.sound === 'boolean' ? s.sound : defaults.sound,
      volume: typeof s.volume === 'number' && Number.isFinite(s.volume) ? Math.max(0, Math.min(1, s.volume)) : defaults.volume,
      reducedMotion: typeof s.reducedMotion === 'boolean' ? s.reducedMotion : defaults.reducedMotion,
      quality: s.quality === 'low' || s.quality === 'high' ? s.quality : 'auto',
    }, snacks,
  };
}

export function readSavedState(storage?: Pick<Storage, 'getItem'>): PersistedState | undefined {
  try {
    const source = storage ?? globalThis.localStorage;
    const text = source?.getItem(STORAGE_KEY);
    return text ? normalize(JSON.parse(text)) : undefined;
  } catch { return undefined; }
}

export function toPersistedState(state: GameState): PersistedState {
  return normalize({ version: 1, name: state.name, weapon: state.weapon, settings: state.settings,
    snacks: { cookie: state.inventory.cookie, choco: state.inventory.choco, cracker: state.inventory.cracker } })!;
}

export function writeSavedState(state: GameState, storage?: Pick<Storage, 'setItem'>): boolean {
  try {
    const destination = storage ?? globalThis.localStorage;
    if (!destination) return false;
    destination.setItem(STORAGE_KEY, JSON.stringify(toPersistedState(state)));
    return true;
  } catch { return false; }
}
