export type Point = { x: number; z: number };
export type Floor = 'office' | 'rooftop';
export type RoofWallSide = 'north' | 'south' | 'east' | 'west';
export type TargetId = 'desk' | 'boss' | 'coffee' | 'snacks' | 'lounge' | 'copier' | 'exit' | 'roofBench' | 'roofWall' | 'roofWallSouth' | 'roofWallEast' | 'roofWallWest';
export type Weapon = 'punch' | 'hammer' | 'fan';
export type Snack = 'cookie' | 'choco' | 'cracker';
export type DeskMode = 'work' | 'shopping' | 'game' | 'sleep';
export type Pose = 'idle' | 'walk' | 'sit' | 'type' | 'sleep' | 'drink' | 'eat' | 'brew' | 'take' | 'spin' | 'lean' | 'wallLean' | 'hit' | 'watch' | 'scold' | 'candy';
export type Actor = Point & { id: string; name: string; angle: number; pose: Pose; moving: boolean };
export type Settings = { sound: boolean; volume: number; reducedMotion: boolean; quality: 'auto' | 'low' | 'high' };
export type Inventory = Record<Snack, number> & { coffee: number };
export type Activity = { kind: 'brew' | 'take' | 'eat' | 'drink' | 'spin' | 'candy'; remaining: number; duration: number; snack?: Snack };
export type GameEvent = { id: number; kind: 'notice' | 'step' | 'type' | 'coffee' | 'snack' | 'sip' | 'punch' | 'hammer' | 'fan' | 'caught'; text: string; at: number };
export type GameState = {
  entered: boolean; paused: boolean; elapsed: number; name: string;
  floor: Floor; transition: { from: Floor; to: Floor; remaining: number; duration: number } | null;
  player: Actor; boss: Actor; coworkers: Actor[];
  target: TargetId | null; ready: boolean; destination: Point | null;
  seat: 'desk' | 'lounge' | 'roof-bench' | null; deskMode: DeskMode | null;
  roofRest: 'bench' | 'wall' | null; roofWallSide: RoofWallSide | null; roofLeanPoint: Point | null; candyInMouth: boolean;
  activity: Activity | null; inventory: Inventory; weapon: Weapon; settings: Settings;
  warning: number; scold: number; bossPhase: 'routine' | 'watch' | 'scold' | 'hit' | 'recover';
  lastHit: { id: number; weapon: Weapon; at: number } | null;
  event: GameEvent | null; message: string; messageUntil: number;
};
export type PersistedState = { version: 1; name: string; weapon: Weapon; settings: Settings; snacks: Record<Snack, number> };
export type Command =
  | { type: 'enter'; name?: string } | { type: 'exit' } | { type: 'pause'; value: boolean }
  | { type: 'select'; target: TargetId; point?: Point } | { type: 'move'; point: Point } | { type: 'axis'; x: number; z: number }
  | { type: 'interact' } | { type: 'stand' } | { type: 'cancel' }
  | { type: 'travel'; floor: Floor } | { type: 'candy' } | { type: 'rest'; place: 'bench' | 'wall'; wall?: RoofWallSide }
  | { type: 'desk'; mode: DeskMode } | { type: 'spin' }
  | { type: 'weapon'; weapon: Weapon } | { type: 'attack' }
  | { type: 'take'; snack: Snack } | { type: 'eat'; snack: Snack } | { type: 'drink' }
  | { type: 'settings'; value: Partial<Settings> } | { type: 'reset' };
export interface GameEngine {
  readonly state: GameState;
  dispatch(command: Command): void;
  step(dt: number): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): GameState;
  dispose(): void;
}
export interface SceneCallbacks {
  getState(): GameState; onFrame(dt: number): void; onGround(point: Point): void;
  onTarget(target: TargetId, point?: Point): void; onReady(): void; onError(message: string): void;
}
export interface OfficeScene { dispose(): void; zoom(delta: number): void; }
