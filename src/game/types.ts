export type GameState = 'title' | 'playing' | 'paused' | 'gameover' | 'victory';

export type ItemId = 'key' | 'bulb';

export type ActionType = 'idle' | 'walk' | 'jump' | 'punch' | 'kick' | 'tailwhip' | 'fall';

export type PterodactylPhase = 'cruise' | 'telegraph' | 'diving' | 'ascend' | 'defeated';

export type PterodactylAttackPattern = 'vertical' | 'diag_lr' | 'diag_rl';

export interface WorldItem {
  id: ItemId;
  name: string;
  x: number;
  y: number;
  z: number; // height above ground
  vx: number;
  vy: number;
  vz: number;
  rotation: number;
  vr: number;
  bounces: number;
  collected: boolean;
  spawnTime: number;
}

export interface Particle {
  active: boolean;
  kind: 'dust' | 'leaf' | 'sparkle' | 'shell' | 'ring' | 'smoke' | 'feather';
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  rot: number;
  vrot: number;
  color: string;
}

export interface CloudEntity {
  x: number;
  y: number;
  scale: number;
  speed: number;
  variant: number;
  alpha: number;
}

export interface PterodactylEntity {
  id: number;
  x: number;
  y: number;
  speed: number;
  scale: number;
  isSilhouette: boolean;
  flapPhase: number;
  flapSpeed: number;
  bobAmp: number;
  bobFreq: number;
  variant: number;
  // Combat & AI state
  hp: number;
  maxHp: number;
  phase: PterodactylPhase;
  aggroRolled: boolean;
  telegraphTimer: number;
  attackPattern: PterodactylAttackPattern;
  attackStartX: number;
  attackStartY: number;
  attackTargetX: number;
  attackTargetY: number;
  attackProgress: number;
  didHitThisPass: boolean;
  hitFlashTimer: number;
  hitCooldownTimer: number;
}

export interface DialogueState {
  text: string;
  speaker: string;
  x: number;
  y: number;
  timer: number;
  maxTimer: number;
}

export interface HudSnapshot {
  state: GameState;
  steps: number;
  maxSteps: number;
  inventory: ItemId[];
  elapsedSec: number;
  bestTimeSec: number | null;
  respawnCountdown: number;
  dialogue: string | null;
  speaker: string | null;
  hintPrompt: string | null;
  muted: boolean;
  treeLooted: boolean;
  gateUnlocked: boolean;
  comboWindowActive: boolean;
  deathReason: string | null;
  wingBuffSec: number;
  pteroDefeatedCount: number;
}

export interface InputSnapshot {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  punchPressed: boolean;
  kickPressed: boolean;
}
