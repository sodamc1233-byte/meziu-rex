import { createFallbackGameAssets, loadGameAssets, type GameAssets } from './assets';
import { SoundEngine } from './audio';
import {
  BOOK_X,
  BOOK_Y,
  BRIDGE_END_X,
  BRIDGE_MAX_Y,
  BRIDGE_MIN_Y,
  BRIDGE_START_X,
  GATE_X,
  GATE_Y,
  ITEM_METADATA,
  LEFT_TREE_X,
  LEFT_TREE_Y,
  MAX_STEPS,
  NORMAL_GRAVITY,
  PTERODACTYL_MAX_HP,
  PTERODACTYL_TELEGRAPH_SEC,
  REX_KICK_DAMAGE,
  REX_PUNCH_DAMAGE,
  REX_TAILWHIP_DAMAGE,
  RIGHT_TREE_X,
  RIGHT_TREE_Y,
  ROAD_MAX_Y,
  ROAD_MIN_Y,
  START_X,
  START_Y,
  STATUE_X,
  STATUE_Y,
  WING_BUFF_DURATION_SEC,
  WING_GRAVITY,
  WING_SPEED_MULTIPLIER,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  addItemToInventory,
  applyPlayerBite,
  applyPterodactylDamage,
  calculateSteps,
  canUnlockGate,
  checkHitboxOverlap,
  clamp,
  clampRoadPosition,
  evaluatePterodactylAttackHit,
  isOverAbyss,
  pickPterodactylAttackPattern,
  processKickCombo,
  removeItemFromInventory,
  rollPterodactylAggro,
} from './rules';
import type {
  CloudEntity,
  DialogueState,
  GameState,
  HudSnapshot,
  ItemId,
  Particle,
  PterodactylEntity,
  WorldItem,
} from './types';

type HatchPhase = 'idle_egg' | 'wobble' | 'pop' | 'fading' | 'done';

const PARTICLE_POOL_SIZE = 240;

export class MeziuGameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sound = new SoundEngine();
  private assets: GameAssets | null = null;
  private onHudChange: (hud: HudSnapshot) => void;

  private rafId = 0;
  private lastTimestamp = 0;
  private destroyed = false;

  // Game State Machine
  private state: GameState = 'title';
  private elapsedSec = 0;
  private bestTimeSec: number | null = null;
  private respawnCountdown = 0;
  private deathReason: string | null = null;

  // Player state
  private px = START_X;
  private py = START_Y;
  private pz = 0; // vertical jump height above road
  private vz = 0;
  private facingRight = true;
  private vx = 0;
  private vy = 0;
  private walkDistAcc = 0;
  private stepToggle = false;
  private squashX = 1;
  private squashY = 1;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;

  // Combat, Bites & Wing Buff (no visible HP bar)
  private actionTimer = 0;
  private currentAction: 'none' | 'punch' | 'kick' | 'tailwhip' = 'none';
  private spinAngle = 0;
  private kickCount = 0;
  private lastKickTime = -10;
  private simTime = 0;
  private playerBitesTaken = 0;
  private invulnTimer = 0;
  private wingBuffTimer = 0;
  private airFlapsRemaining = 0;
  private pteroDefeatedCount = 0;
  private nextPteroId = 1;

  // Eye tracking & blink
  private gazeX = 1;
  private gazeY = 0;
  private blinkTimer = 2.6;
  private blinkDuration = 0;

  // Fall / defeat animation
  private fallVy = 0;
  private fallRot = 0;
  private fallAlpha = 1;

  // Intro egg hatch
  private hatchPhase: HatchPhase = 'idle_egg';
  private hatchTimer = 0;
  private eggAlpha = 1;
  private eggCrackLevel = 0;

  // World puzzle state
  private leftTreeHits = 0;
  private leftTreeLooted = false;
  private leftTreeShake = 0;
  private rightTreeShake = 0;
  private gateUnlocked = false;
  private gateOpenProgress = 0;
  private gateShake = 0;
  private victoryDelayTimer = 0;
  private inventory: ItemId[] = [];
  private worldItems: WorldItem[] = [];

  // Camera & Juice
  private camX = 0;
  private trauma = 0;
  private hitstopTimer = 0;
  private hitFlashTimer = 0;

  // Dialogue & Contextual prompt
  private dialogue: DialogueState | null = null;
  private hintPrompt: string | null = null;

  // Ambient & Enemy world entities
  private clouds: CloudEntity[] = [];
  private pterodactyls: PterodactylEntity[] = [];
  private particles: Particle[] = [];
  private particleCursor = 0;
  private smokeSpawnTimer = 0;
  private pteroSpawnTimer = 1.6;
  private windDir = 1;

  // Input hub
  private heldKeys = new Set<string>();
  private virtualHeld = { left: false, right: false, up: false, down: false };
  private edgeTriggers = { jump: false, punch: false, kick: false };
  private jumpHeld = false;

  // Resize tracking
  private viewW = 1280;
  private viewH = 720;
  private dpr = 1;
  private resizeObserver: ResizeObserver | null = null;
  private lastHudPushTime = 0;
  private lastHudSignature = '';

  constructor(canvas: HTMLCanvasElement, onHudChange: (hud: HudSnapshot) => void) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2D context unavailable');
    this.ctx = context;
    this.onHudChange = onHudChange;

    try {
      const savedBest = localStorage.getItem('meziu_lv1_best_time');
      if (savedBest) this.bestTimeSec = parseFloat(savedBest);
    } catch {
      // ignore storage failure
    }

    this.initParticlePool();
    this.initAmbientEntities();
    this.bindEvents();
    this.updateCanvasSize();

    loadGameAssets()
      .then((assets) => {
        if (this.destroyed) return;
        this.assets = assets;
      })
      .catch((err) => {
        console.error('Failed to load game assets, using fallback:', err);
        if (this.destroyed) return;
        this.assets = createFallbackGameAssets();
      });

    this.syncBodyState();
    this.sound.startTitleMusic();
    this.pushHud(true);
    this.lastTimestamp = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private initParticlePool(): void {
    this.particles = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
      active: false,
      kind: 'dust',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 4,
      alpha: 1,
      life: 0,
      maxLife: 1,
      rot: 0,
      vrot: 0,
      color: '#cbd1c0',
    }));
  }

  private spawnParticle(opts: Partial<Particle> & { x: number; y: number; kind: Particle['kind'] }): void {
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
    p.active = true;
    p.kind = opts.kind;
    p.x = opts.x;
    p.y = opts.y;
    p.vx = opts.vx ?? 0;
    p.vy = opts.vy ?? 0;
    p.size = opts.size ?? 6;
    p.alpha = opts.alpha ?? 1;
    p.life = 0;
    p.maxLife = opts.maxLife ?? 0.8;
    p.rot = opts.rot ?? 0;
    p.vrot = opts.vrot ?? 0;
    p.color = opts.color ?? '#c8ceb8';
  }

  private createPterodactyl(opts: {
    x: number;
    y: number;
    speed: number;
    scale: number;
    isSilhouette: boolean;
    flapPhase?: number;
    flapSpeed?: number;
    bobAmp?: number;
    bobFreq?: number;
    variant?: number;
  }): PterodactylEntity {
    return {
      id: this.nextPteroId++,
      x: opts.x,
      y: opts.y,
      speed: opts.speed,
      scale: opts.scale,
      isSilhouette: opts.isSilhouette,
      flapPhase: opts.flapPhase ?? Math.random() * Math.PI * 2,
      flapSpeed: opts.flapSpeed ?? (opts.isSilhouette ? 4.2 : 6.0),
      bobAmp: opts.bobAmp ?? (opts.isSilhouette ? 7 : 11),
      bobFreq: opts.bobFreq ?? 1.8,
      variant: opts.variant ?? 0,
      hp: PTERODACTYL_MAX_HP,
      maxHp: PTERODACTYL_MAX_HP,
      phase: 'cruise',
      aggroRolled: false,
      telegraphTimer: 0,
      attackPattern: 'vertical',
      attackStartX: opts.x,
      attackStartY: opts.y,
      attackTargetX: opts.x,
      attackTargetY: START_Y,
      attackProgress: 0,
      didHitThisPass: false,
      hitFlashTimer: 0,
      hitCooldownTimer: 0,
    };
  }

  private initAmbientEntities(): void {
    this.clouds = [
      { x: 180, y: 88, scale: 0.9, speed: 10, variant: 0, alpha: 0.72 },
      { x: 690, y: 125, scale: 0.72, speed: 7, variant: 1, alpha: 0.6 },
      { x: 1210, y: 74, scale: 1.05, speed: 12, variant: 2, alpha: 0.68 },
      { x: 1760, y: 132, scale: 0.82, speed: 8.5, variant: 3, alpha: 0.62 },
      { x: 2150, y: 95, scale: 0.75, speed: 9.5, variant: 4, alpha: 0.58 },
    ];

    this.pterodactyls = [
      this.createPterodactyl({
        x: 420,
        y: 120,
        speed: 44,
        scale: 0.36,
        isSilhouette: true,
        flapPhase: 0.4,
        flapSpeed: 4.5,
        bobAmp: 8,
        bobFreq: 1.6,
        variant: 0,
      }),
      this.createPterodactyl({
        x: 780,
        y: 158,
        speed: 68,
        scale: 0.56,
        isSilhouette: false,
        flapPhase: 1.2,
        flapSpeed: 6.2,
        bobAmp: 12,
        bobFreq: 2.1,
        variant: 0,
      }),
      this.createPterodactyl({
        x: 1380,
        y: 145,
        speed: -64,
        scale: 0.54,
        isSilhouette: false,
        flapPhase: 0.8,
        flapSpeed: 6.4,
        bobAmp: 10,
        bobFreq: 2.0,
        variant: 1,
      }),
      this.createPterodactyl({
        x: 1880,
        y: 95,
        speed: 38,
        scale: 0.32,
        isSilhouette: true,
        flapPhase: 2.1,
        flapSpeed: 4.1,
        bobAmp: 7,
        bobFreq: 1.5,
        variant: 1,
      }),
    ];
  }

  private updateCanvasSize = (): void => {
    const rect = this.canvas.parentElement?.getBoundingClientRect() ?? this.canvas.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width || window.innerWidth));
    const h = Math.max(240, Math.round(rect.height || window.innerHeight));
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.viewW = w;
    this.viewH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
  };

  private handleGlobalFirstGesture = (): void => {
    this.sound.unlock();
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('pointerdown', this.handleGlobalFirstGesture, { passive: true });
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    if (typeof ResizeObserver !== 'undefined' && this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(this.updateCanvasSize);
      this.resizeObserver.observe(this.canvas.parentElement);
    } else {
      window.addEventListener('resize', this.updateCanvasSize);
    }
  }

  private handleWindowBlur = (): void => {
    this.clearInputs();
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.clearInputs();
    }
  };

  public clearInputs(): void {
    this.heldKeys.clear();
    this.virtualHeld = { left: false, right: false, up: false, down: false };
    this.jumpHeld = false;
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
      e.preventDefault();
    }

    if (code === 'KeyM') {
      if (!e.repeat) this.toggleMute();
      return;
    }

    if (this.state === 'title') {
      if (!e.repeat && (code === 'Enter' || code === 'Space')) {
        this.startGame();
      }
      return;
    }

    if (code === 'Escape' || code === 'KeyP') {
      if (!e.repeat) {
        if (this.state === 'playing') this.pauseGame();
        else if (this.state === 'paused') this.resumeGame();
      }
      return;
    }

    if (code === 'KeyR' && !e.repeat) {
      if (this.state === 'playing' || this.state === 'paused' || this.state === 'gameover' || this.state === 'victory') {
        this.restartLevel();
      }
      return;
    }

    if (this.state !== 'playing') {
      if (!e.repeat && code === 'Enter' && (this.state === 'gameover' || this.state === 'victory')) {
        this.restartLevel();
      }
      return;
    }

    this.sound.unlock();

    const wasHeld = this.heldKeys.has(code);
    this.heldKeys.add(code);

    if (!wasHeld) {
      if (code === 'Space') {
        this.edgeTriggers.jump = true;
        this.jumpHeld = true;
      } else if (code === 'KeyJ') {
        this.edgeTriggers.punch = true;
      } else if (code === 'KeyK') {
        this.edgeTriggers.kick = true;
      } else if (code === 'Digit1') {
        this.inspectInventorySlot(0);
      } else if (code === 'Digit2') {
        this.inspectInventorySlot(1);
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
    if (e.code === 'Space') {
      this.jumpHeld = false;
    }
  };

  // Public Controls API for On-Screen D-Pad & Buttons
  public setVirtualDirection(dir: 'left' | 'right' | 'up' | 'down', active: boolean): void {
    this.virtualHeld[dir] = active;
    if (active) this.sound.unlock();
  }

  public triggerJump(pressed: boolean): void {
    this.sound.unlock();
    if (pressed) {
      this.edgeTriggers.jump = true;
      this.jumpHeld = true;
    } else {
      this.jumpHeld = false;
    }
  }

  public triggerPunch(): void {
    this.sound.unlock();
    if (this.state === 'playing') this.edgeTriggers.punch = true;
  }

  public triggerKick(): void {
    this.sound.unlock();
    if (this.state === 'playing') this.edgeTriggers.kick = true;
  }

  public inspectInventorySlot(slotIdx: number): void {
    const item = this.inventory[slotIdx];
    if (!item) return;
    const meta = ITEM_METADATA[item];
    this.showDialogue('Túi đồ', `${meta.label}: ${meta.desc}`, 2.8);
  }

  public toggleMute(): void {
    this.sound.unlock();
    this.sound.setMuted(!this.sound.isMuted());
    this.pushHud(true);
  }

  public startGame(): void {
    this.sound.unlock();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.sound.stopTitleMusic();
    this.resetWorldState(true);
    this.state = 'playing';
    this.syncBodyState();
    this.sound.startMusic();
    this.pushHud(true);
  }

  public restartLevel(): void {
    this.sound.unlock();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.sound.stopTitleMusic();
    this.resetWorldState(true);
    this.state = 'playing';
    this.syncBodyState();
    this.sound.startMusic();
    this.pushHud(true);
  }

  public respawnAtEgg(): void {
    this.sound.unlock();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.sound.stopTitleMusic();
    this.px = START_X;
    this.py = START_Y;
    this.pz = 0;
    this.vz = 0;
    this.vx = 0;
    this.vy = 0;
    this.facingRight = true;
    this.fallVy = 0;
    this.fallRot = 0;
    this.fallAlpha = 1;
    this.deathReason = null;
    this.respawnCountdown = 0;
    this.actionTimer = 0;
    this.currentAction = 'none';
    this.playerBitesTaken = 0;
    this.invulnTimer = 1.0;
    this.wingBuffTimer = 0;
    this.airFlapsRemaining = 0;
    this.squashX = 0.85;
    this.squashY = 1.18;
    // Reset any actively diving pterodactyls back to safe patrol on respawn
    for (const p of this.pterodactyls) {
      if (!p.isSilhouette && p.phase !== 'cruise') {
        p.phase = 'cruise';
        p.y = 135;
        p.aggroRolled = false;
      }
    }
    this.state = 'playing';
    this.syncBodyState();
    this.sound.startMusic();
    this.showDialogue('Meziu Rex', 'Suýt nữa thì mất mạng! Coi chừng cầu ván gỗ và khủng long bay!', 3.2);
    this.pushHud(true);
  }

  public pauseGame(): void {
    if (this.state !== 'playing') return;
    this.clearInputs();
    this.state = 'paused';
    this.sound.stopMusic();
    this.syncBodyState();
    this.pushHud(true);
  }

  public resumeGame(): void {
    if (this.state !== 'paused') return;
    this.clearInputs();
    this.sound.stopTitleMusic();
    this.state = 'playing';
    this.sound.startMusic();
    this.syncBodyState();
    this.pushHud(true);
  }

  public returnToTitle(): void {
    this.clearInputs();
    this.sound.stopMusic();
    this.resetWorldState(false);
    this.state = 'title';
    this.syncBodyState();
    this.sound.startTitleMusic();
    this.pushHud(true);
  }

  private resetWorldState(withHatchIntro: boolean): void {
    this.clearInputs();
    this.px = START_X;
    this.py = START_Y;
    this.pz = 0;
    this.vz = 0;
    this.vx = 0;
    this.vy = 0;
    this.facingRight = true;
    this.squashX = 1;
    this.squashY = 1;
    this.fallVy = 0;
    this.fallRot = 0;
    this.fallAlpha = 1;
    this.elapsedSec = 0;
    this.respawnCountdown = 0;
    this.deathReason = null;
    this.actionTimer = 0;
    this.currentAction = 'none';
    this.spinAngle = 0;
    this.kickCount = 0;
    this.lastKickTime = -10;
    this.playerBitesTaken = 0;
    this.invulnTimer = 0;
    this.wingBuffTimer = 0;
    this.airFlapsRemaining = 0;
    this.pteroDefeatedCount = 0;
    this.leftTreeHits = 0;
    this.leftTreeLooted = false;
    this.leftTreeShake = 0;
    this.rightTreeShake = 0;
    this.gateUnlocked = false;
    this.gateOpenProgress = 0;
    this.gateShake = 0;
    this.victoryDelayTimer = 0;
    this.inventory = [];
    this.worldItems = [];
    this.dialogue = null;
    this.hintPrompt = null;
    this.trauma = 0;
    this.hitstopTimer = 0;
    this.hitFlashTimer = 0;
    this.camX = 0;
    this.initAmbientEntities();

    if (withHatchIntro) {
      this.hatchPhase = 'wobble';
      this.hatchTimer = 0;
      this.eggAlpha = 1;
      this.eggCrackLevel = 0;
      this.sound.playEggCrack();
    } else {
      this.hatchPhase = 'idle_egg';
      this.hatchTimer = 0;
      this.eggAlpha = 1;
      this.eggCrackLevel = 0;
    }
  }

  private syncBodyState(): void {
    if (typeof document === 'undefined') return;
    if (this.state === 'victory' || this.state === 'gameover') {
      document.body.dataset.state = 'gameover';
    } else {
      document.body.dataset.state = this.state;
    }
  }

  private showDialogue(speaker: string, text: string, duration = 3.5): void {
    this.dialogue = {
      speaker,
      text,
      x: this.px,
      y: this.py - 115,
      timer: duration,
      maxTimer: duration,
    };
    this.pushHud(true);
  }

  private loop = (timestamp: number): void => {
    if (this.destroyed) return;
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    const dt = Math.min(Math.max(rawDt, 0), 0.05);

    this.update(dt);
    this.render();

    this.rafId = requestAnimationFrame(this.loop);
  };

  private update(dt: number): void {
    this.simTime += dt;

    // Ambient clouds, distant smoke, and pterodactyls always animate even on title screen!
    if (this.state !== 'paused') {
      this.updateAmbientWorld(dt);
      this.updateParticles(dt);
    }

    // Decay trauma & hit flash in real time
    this.trauma = Math.max(0, this.trauma - dt * 1.85);
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);

    if (this.state === 'title') {
      // Gentle atmospheric title pan framing the mysterious egg & ruined dishes
      const pan = Math.sin(this.simTime * 0.25) * 20 + 20;
      this.camX = pan;
      return;
    }

    if (this.state === 'paused') return;

    if (this.state === 'gameover') {
      // Falling animation continues briefly in gameover
      if (this.fallAlpha > 0) {
        this.fallVy += 1100 * dt;
        this.py += this.fallVy * dt;
        this.fallRot += 3.6 * dt * (this.facingRight ? 1 : -1);
        this.fallAlpha = Math.max(0, this.fallAlpha - dt * 1.4);
      }
      if (this.respawnCountdown > 0) {
        this.respawnCountdown = Math.max(0, this.respawnCountdown - dt);
        if (this.respawnCountdown <= 0) {
          this.respawnAtEgg();
          return;
        }
      }
      this.pushHud(false);
      return;
    }

    if (this.state === 'victory') {
      this.gateOpenProgress = Math.min(1, this.gateOpenProgress + dt * 1.4);
      this.pushHud(false);
      return;
    }

    // Hitstop pauses simulation physics briefly for meaty impact feel
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      return;
    }

    this.elapsedSec += dt;

    // Update intro egg hatching & fading sequence
    this.updateEggHatch(dt);

    // Update wing buff & invulnerability timers
    if (this.invulnTimer > 0) {
      this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    }
    if (this.wingBuffTimer > 0) {
      this.wingBuffTimer = Math.max(0, this.wingBuffTimer - dt);
      if (Math.random() < 0.32) {
        this.spawnParticle({
          kind: 'feather',
          x: this.px + (Math.random() - 0.5) * 26,
          y: this.py - this.pz - 36,
          vx: (Math.random() - 0.5) * 40,
          vy: 15 + Math.random() * 25,
          size: 5 + Math.random() * 3,
          maxLife: 0.65,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 6,
          color: '#e5c158',
        });
      }
    }

    // Update dialogue timer
    if (this.dialogue) {
      this.dialogue.timer -= dt;
      if (this.dialogue.timer <= 0) {
        this.dialogue = null;
      }
    }

    // Update tree & gate shake decay
    this.leftTreeShake = Math.max(0, this.leftTreeShake - dt * 2.5);
    this.rightTreeShake = Math.max(0, this.rightTreeShake - dt * 2.5);
    this.gateShake = Math.max(0, this.gateShake - dt * 3.0);

    // If gate is unlocking, animate door opening and trigger victory
    if (this.gateUnlocked) {
      this.gateOpenProgress = Math.min(1, this.gateOpenProgress + dt * 1.2);
      this.victoryDelayTimer -= dt;
      if (Math.random() < 0.45) {
        this.spawnParticle({
          kind: 'sparkle',
          x: GATE_X + (Math.random() - 0.5) * 70,
          y: GATE_Y - 50 - Math.random() * 80,
          vx: (Math.random() - 0.5) * 40,
          vy: -30 - Math.random() * 60,
          size: 4 + Math.random() * 4,
          maxLife: 0.9,
          color: '#fde68a',
        });
      }
      if (this.victoryDelayTimer <= 0) {
        this.completeLevel1();
        return;
      }
    }

    // Update player only once egg has popped open (at 0.72s)
    if (this.hatchPhase !== 'wobble' && !this.gateUnlocked) {
      this.updatePlayer(dt);
    }

    // Update world dropped items (Key & Lightbulb physics + pickup)
    this.updateWorldItems(dt);

    // Update camera smoothly following Meziu Rex
    this.updateCamera(dt);

    // Update eye gaze & blinking
    this.updateEyes(dt);

    // Contextual hint prompt near landmarks
    this.updateHintPrompt();

    this.pushHud(false);
  }

  private updateEggHatch(dt: number): void {
    if (this.hatchPhase === 'done' || this.hatchPhase === 'idle_egg') return;
    this.hatchTimer += dt;

    if (this.hatchPhase === 'wobble') {
      if (this.hatchTimer > 0.35 && this.eggCrackLevel === 0) {
        this.eggCrackLevel = 1;
        this.sound.playEggCrack();
        this.trauma = Math.min(1, this.trauma + 0.16);
      }
      if (this.hatchTimer >= 0.72) {
        this.hatchPhase = 'pop';
        this.hatchTimer = 0;
        this.eggCrackLevel = 2;
        this.pz = 6;
        this.vz = 260;
        this.squashX = 0.82;
        this.squashY = 1.24;
        this.trauma = Math.min(1, this.trauma + 0.32);
        this.sound.playEggHatchPop();

        // Burst shell chips & dust
        for (let i = 0; i < 12; i++) {
          const ang = -Math.PI * Math.random();
          const spd = 70 + Math.random() * 140;
          this.spawnParticle({
            kind: 'shell',
            x: START_X + (Math.random() - 0.5) * 26,
            y: START_Y - 18,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd - 40,
            size: 5 + Math.random() * 5,
            maxLife: 0.75 + Math.random() * 0.3,
            vrot: (Math.random() - 0.5) * 12,
            color: i % 2 === 0 ? '#dbd5bd' : '#a8a28c',
          });
        }
        this.showDialogue('Meziu Rex', 'Grào...! Nở rồi! Phải tìm cách mở Cánh cổng đá phía đông!', 3.6);
      }
    } else if (this.hatchPhase === 'pop') {
      if (this.hatchTimer >= 1.1) {
        this.hatchPhase = 'fading';
        this.hatchTimer = 0;
      }
    } else if (this.hatchPhase === 'fading') {
      // Eggshell gradually fades out and disappears cleanly
      this.eggAlpha = Math.max(0, 1 - this.hatchTimer / 1.3);
      if (this.eggAlpha <= 0) {
        this.hatchPhase = 'done';
      }
    }
  }

  private updatePlayer(dt: number): void {
    const moveLeft = this.heldKeys.has('ArrowLeft') || this.heldKeys.has('KeyA') || this.virtualHeld.left;
    const moveRight = this.heldKeys.has('ArrowRight') || this.heldKeys.has('KeyD') || this.virtualHeld.right;
    const moveUp = this.heldKeys.has('ArrowUp') || this.heldKeys.has('KeyW') || this.virtualHeld.up;
    const moveDown = this.heldKeys.has('ArrowDown') || this.heldKeys.has('KeyS') || this.virtualHeld.down;

    let ix = (moveRight ? 1 : 0) - (moveLeft ? 1 : 0);
    let iy = (moveDown ? 1 : 0) - (moveUp ? 1 : 0);

    if (ix !== 0 && iy !== 0) {
      const inv = 1 / Math.SQRT2;
      ix *= inv;
      iy *= inv;
    }

    if (ix > 0) this.facingRight = true;
    else if (ix < 0) this.facingRight = false;

    const hasWings = this.wingBuffTimer > 0;
    const speedMult = hasWings ? WING_SPEED_MULTIPLIER : 1;
    const speedX = 255 * speedMult;
    const speedY = 165 * (hasWings ? 1.32 : 1);
    this.vx = ix * speedX;
    this.vy = iy * speedY;

    const nextPos = clampRoadPosition(this.px + this.vx * dt, this.py + this.vy * dt, true);
    this.px = nextPos.x;
    this.py = nextPos.y;

    // Distance-synced walk animation & enhanced multi-layer footsteps
    const movedDist = Math.hypot(this.vx * dt, this.vy * dt);
    if (movedDist > 0.1 && this.pz <= 2) {
      this.walkDistAcc += movedDist;
      if (this.walkDistAcc >= 28) {
        this.walkDistAcc = 0;
        this.stepToggle = !this.stepToggle;
        const onBridge = this.px > BRIDGE_START_X && this.px < BRIDGE_END_X;
        this.sound.playFootstep(onBridge, this.stepToggle);
        this.spawnParticle({
          kind: 'dust',
          x: this.px + (this.facingRight ? -10 : 10),
          y: this.py + 2,
          vx: -this.vx * 0.15 + (Math.random() - 0.5) * 20,
          vy: -12 - Math.random() * 14,
          size: 4 + Math.random() * 3,
          maxLife: 0.35,
          color: onBridge ? '#8d836b' : '#737d65',
        });
      }
    } else if (movedDist <= 0.1) {
      this.walkDistAcc = 0;
    }

    // Coyote time & Jump buffer
    if (this.pz <= 0.5) {
      this.coyoteTimer = 0.1;
      this.airFlapsRemaining = hasWings ? 3 : 0;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    if (this.edgeTriggers.jump) {
      if (this.coyoteTimer > 0) {
        this.jumpBufferTimer = 0.12;
      } else if (hasWings && this.airFlapsRemaining > 0 && this.pz > 2) {
        // Winged mid-air flap extends airtime significantly!
        this.airFlapsRemaining--;
        this.vz = Math.max(this.vz + 120, 300);
        this.squashX = 0.88;
        this.squashY = 1.15;
        this.sound.playWingFlap();
        for (let i = 0; i < 4; i++) {
          this.spawnParticle({
            kind: 'feather',
            x: this.px + (Math.random() - 0.5) * 24,
            y: this.py - this.pz - 24,
            vx: (Math.random() - 0.5) * 80,
            vy: 30 + Math.random() * 40,
            size: 5,
            maxLife: 0.55,
            rot: Math.random() * Math.PI,
            vrot: (Math.random() - 0.5) * 8,
            color: '#facc15',
          });
        }
      } else {
        this.jumpBufferTimer = 0.12;
      }
      this.edgeTriggers.jump = false;
    } else {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.vz = hasWings ? 520 : 470;
      this.pz = Math.max(this.pz, 1);
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.airFlapsRemaining = hasWings ? 3 : 0;
      this.squashX = 0.84;
      this.squashY = 1.2;
      this.sound.playJump();
      for (let i = 0; i < 5; i++) {
        this.spawnParticle({
          kind: 'dust',
          x: this.px + (Math.random() - 0.5) * 24,
          y: this.py + 2,
          vx: (Math.random() - 0.5) * 65,
          vy: -18 - Math.random() * 25,
          size: 5 + Math.random() * 3,
          maxLife: 0.38,
          color: '#9aa18c',
        });
      }
    }

    // Variable jump height cut (wings soften release for longer hang-time)
    if (!this.jumpHeld && this.vz > 140) {
      this.vz *= hasWings ? 0.88 : 0.65;
    }

    // Vertical 2.5D jump physics (5s Wing Buff drastically extends airtime)
    if (this.pz > 0 || this.vz !== 0) {
      const activeGravity = hasWings ? (this.vz < 0 && this.jumpHeld ? 280 : WING_GRAVITY) : NORMAL_GRAVITY;
      this.vz -= activeGravity * dt;
      this.pz += this.vz * dt;
      if (this.pz <= 0) {
        this.pz = 0;
        this.vz = 0;
        this.squashX = 1.22;
        this.squashY = 0.78;
        this.sound.playLand();
        for (let i = 0; i < 5; i++) {
          this.spawnParticle({
            kind: 'dust',
            x: this.px + (Math.random() - 0.5) * 28,
            y: this.py + 2,
            vx: (Math.random() - 0.5) * 80,
            vy: -10 - Math.random() * 18,
            size: 4 + Math.random() * 3,
            maxLife: 0.34,
            color: '#9aa18c',
          });
        }
      }
    }

    // Exponentially damp squash-and-stretch back to 1
    const damp = 1 - Math.exp(-15 * dt);
    this.squashX += (1 - this.squashX) * damp;
    this.squashY += (1 - this.squashY) * damp;

    // Check abyss fall off the narrow plank bridge!
    if (isOverAbyss(this.px, this.py, this.pz)) {
      this.triggerDefeatGameOver('Rơi xuống vực thẳm!', true);
      return;
    }

    // Combat & Combo actions
    if (this.actionTimer > 0) {
      this.actionTimer = Math.max(0, this.actionTimer - dt);
      if (this.currentAction === 'tailwhip') {
        this.spinAngle += dt * 20;
      }
      if (this.actionTimer <= 0) {
        this.currentAction = 'none';
        this.spinAngle = 0;
      }
    }

    if (this.edgeTriggers.punch) {
      this.edgeTriggers.punch = false;
      this.performPunch();
    }

    if (this.edgeTriggers.kick) {
      this.edgeTriggers.kick = false;
      this.performKickCombo();
    }

    // Auto-unlock gate if player walks right up to the stone gate holding the Key
    if (!this.gateUnlocked && canUnlockGate(this.inventory) && checkHitboxOverlap(this.px, this.py, 78, GATE_X, GATE_Y)) {
      this.unlockAncientGate();
    }
  }

  private performPunch(): void {
    this.currentAction = 'punch';
    this.actionTimer = 0.22;
    this.squashX = 1.14;
    this.squashY = 0.9;
    this.sound.playPunch();
    this.resolveInteractionHit(false, REX_PUNCH_DAMAGE);
  }

  private performKickCombo(): void {
    const res = processKickCombo(this.kickCount, this.lastKickTime, this.simTime);
    this.kickCount = res.nextCount;
    this.lastKickTime = this.simTime;

    if (res.isTailWhip) {
      this.currentAction = 'tailwhip';
      this.actionTimer = 0.38;
      this.spinAngle = 0;
      this.squashX = 1.18;
      this.squashY = 0.88;
      const hitAnything = this.resolveInteractionHit(true, REX_TAILWHIP_DAMAGE);
      this.sound.playTailWhip(hitAnything);
      this.trauma = Math.min(1, this.trauma + (hitAnything ? 0.55 : 0.28));
      this.spawnParticle({
        kind: 'ring',
        x: this.px,
        y: this.py - 28 - this.pz,
        size: 18,
        maxLife: 0.32,
        color: '#e5e0b8',
      });
    } else {
      this.currentAction = 'kick';
      this.actionTimer = 0.24;
      this.squashX = 1.12;
      this.squashY = 0.92;
      this.sound.playKick();
      this.resolveInteractionHit(false, REX_KICK_DAMAGE);
    }
  }

  private resolveInteractionHit(isTailWhip: boolean, attackDamage: number): boolean {
    const reachX = this.px + (this.facingRight ? 38 : -38);
    const radius = isTailWhip ? 115 : 88;
    let hit = false;

    // 0. Strike nearby diving / low-flying Pterodactyls (damage = 2 for Kick & Punch!)
    const strikeY = this.py - this.pz - 36;
    for (let i = this.pterodactyls.length - 1; i >= 0; i--) {
      const p = this.pterodactyls[i];
      if (p.isSilhouette || p.phase === 'defeated' || p.hitCooldownTimer > 0) continue;
      const dist = Math.hypot(p.x - reachX, p.y - strikeY);
      const pteroHitRadius = isTailWhip ? 132 : 108;
      if (dist <= pteroHitRadius) {
        hit = true;
        const dmgRes = applyPterodactylDamage(p.hp, attackDamage);
        p.hp = dmgRes.nextHp;
        p.hitFlashTimer = 0.2;
        p.hitCooldownTimer = 0.18;
        this.hitstopTimer = 0.045;
        this.hitFlashTimer = 0.06;
        this.trauma = Math.min(1, this.trauma + 0.32);
        this.sound.playPteroHit();

        for (let f = 0; f < 10; f++) {
          this.spawnParticle({
            kind: 'feather',
            x: p.x + (Math.random() - 0.5) * 28,
            y: p.y + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 160,
            vy: -40 - Math.random() * 90,
            size: 6 + Math.random() * 4,
            maxLife: 0.75,
            rot: Math.random() * Math.PI * 2,
            vrot: (Math.random() - 0.5) * 10,
            color: dmgRes.defeated ? '#fde047' : '#858b73',
          });
        }

        if (dmgRes.defeated) {
          this.pterodactyls.splice(i, 1);
          this.pteroDefeatedCount++;
          this.wingBuffTimer = WING_BUFF_DURATION_SEC;
          this.airFlapsRemaining = 3;
          this.sound.playPteroVictoryWings();
          for (let s = 0; s < 16; s++) {
            this.spawnParticle({
              kind: 'sparkle',
              x: p.x + (Math.random() - 0.5) * 40,
              y: p.y + (Math.random() - 0.5) * 30,
              vx: (Math.random() - 0.5) * 130,
              vy: (Math.random() - 0.5) * 130,
              size: 4 + Math.random() * 4,
              maxLife: 0.85,
              color: '#fde047',
            });
          }
          this.showDialogue('Meziu Rex', 'Thắng rồi! Mọc cánh bay nhanh & nhảy lâu hơn 5 giây!', 3.2);
          this.pushHud(true);
        } else {
          // Knock bird slightly upward on first strike
          p.y = Math.max(85, p.y - 36);
        }
      }
    }

    // 1. Left Coconut Palm Tree
    if (checkHitboxOverlap(reachX, this.py, radius, LEFT_TREE_X, LEFT_TREE_Y)) {
      hit = true;
      this.leftTreeShake = isTailWhip ? 1.0 : 0.55;
      this.spawnTreeLeaves(LEFT_TREE_X, LEFT_TREE_Y - 210, isTailWhip ? 14 : 6);

      if (!this.leftTreeLooted) {
        if (isTailWhip) {
          this.dropLeftTreeLoot();
        } else {
          this.leftTreeHits++;
          if (this.leftTreeHits >= 2) {
            this.dropLeftTreeLoot();
          } else {
            this.showDialogue('Gợi ý', 'Cây dừa rung nhẹ! Hãy bấm Đá (K) 2 lần liên tiếp để Quất đuôi thật mạnh!', 3.2);
          }
        }
      }
    }

    // 2. Right Coconut Palm Tree
    if (checkHitboxOverlap(reachX, this.py, radius, RIGHT_TREE_X, RIGHT_TREE_Y)) {
      hit = true;
      this.rightTreeShake = isTailWhip ? 0.9 : 0.45;
      this.spawnTreeLeaves(RIGHT_TREE_X, RIGHT_TREE_Y - 190, isTailWhip ? 10 : 5);
    }

    // 3. Dino Statue
    if (checkHitboxOverlap(reachX, this.py, radius, STATUE_X, STATUE_Y)) {
      hit = true;
      this.showDialogue('Tượng Khủng Long', 'Bức tượng T-Rex cổ đại... Ánh mắt đá lạnh lẽo như đang dõi theo bước chân ngươi.', 3.6);
    }

    // 4. Old Book
    if (checkHitboxOverlap(reachX, this.py, radius, BOOK_X, BOOK_Y)) {
      hit = true;
      this.showDialogue('Cuốn Sách Cũ', '"Ánh sáng ẩn trên tán dừa cao... Chiếc chìa khóa sẽ mở lối qua cánh cổng cổ."', 4.0);
    }

    // 5. Ancient Locked Gate
    if (checkHitboxOverlap(reachX, this.py, radius + 15, GATE_X, GATE_Y)) {
      hit = true;
      if (!this.gateUnlocked) {
        if (canUnlockGate(this.inventory)) {
          this.unlockAncientGate();
        } else {
          this.gateShake = 0.7;
          this.sound.playLockedRattle();
          this.showDialogue('Cánh Cổng Đá', 'Cửa bị khóa chặt! Hãy quay lại cây dừa bên trái và Quất đuôi (bấm K 2 lần) lấy Chìa khóa.', 4.0);
        }
      }
    }

    if (hit && isTailWhip) {
      this.hitstopTimer = 0.045;
      this.hitFlashTimer = 0.06;
    }

    return hit;
  }

  private spawnTreeLeaves(cx: number, cy: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this.spawnParticle({
        kind: 'leaf',
        x: cx + (Math.random() - 0.5) * 110,
        y: cy + (Math.random() - 0.5) * 55,
        vx: (Math.random() - 0.3) * 75,
        vy: 30 + Math.random() * 45,
        size: 7 + Math.random() * 5,
        maxLife: 1.8 + Math.random() * 0.9,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 4,
        color: i % 2 === 0 ? '#5c7040' : '#43542d',
      });
    }
  }

  private dropLeftTreeLoot(): void {
    this.leftTreeLooted = true;
    this.hitstopTimer = 0.055;
    this.trauma = Math.min(1, this.trauma + 0.65);

    // Drop Key & Glowing Lightbulb from canopy with crisp parabolic bounce arcs
    this.worldItems.push(
      {
        id: 'key',
        name: ITEM_METADATA.key.label,
        x: LEFT_TREE_X + 26,
        y: LEFT_TREE_Y + 6,
        z: 190,
        vx: 72,
        vy: 14,
        vz: 140,
        rotation: -0.5,
        vr: 7.5,
        bounces: 0,
        collected: false,
        spawnTime: this.simTime,
      },
      {
        id: 'bulb',
        name: ITEM_METADATA.bulb.label,
        x: LEFT_TREE_X + 48,
        y: LEFT_TREE_Y - 2,
        z: 180,
        vx: 122,
        vy: -10,
        vz: 175,
        rotation: 0.3,
        vr: -6.2,
        bounces: 0,
        collected: false,
        spawnTime: this.simTime,
      }
    );

    for (let i = 0; i < 16; i++) {
      this.spawnParticle({
        kind: 'sparkle',
        x: LEFT_TREE_X + 25 + (Math.random() - 0.5) * 50,
        y: LEFT_TREE_Y - 200 + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 110,
        vy: (Math.random() - 0.5) * 110,
        size: 4 + Math.random() * 4,
        maxLife: 0.8,
        color: '#fde047',
      });
    }

    this.showDialogue('Thành công!', 'Chìa khóa và Bóng đèn đã rơi xuống! Hãy nhặt cả 2 vào Túi đồ rồi qua cầu ván.', 4.0);
  }

  private updateWorldItems(dt: number): void {
    for (const item of this.worldItems) {
      if (item.collected) continue;

      if (item.z > 0 || item.vz !== 0) {
        item.vz -= 980 * dt;
        item.z += item.vz * dt;
        item.x += item.vx * dt;
        item.y = clamp(item.y + item.vy * dt, ROAD_MIN_Y + 4, ROAD_MAX_Y - 4);
        item.rotation += item.vr * dt;

        if (item.z <= 0) {
          item.z = 0;
          if (item.bounces < 2 && Math.abs(item.vz) > 95) {
            item.vz = -item.vz * 0.45;
            item.vx *= 0.48;
            item.vr *= 0.45;
            item.bounces++;
            this.sound.playItemDrop(item.id);
            this.spawnParticle({
              kind: 'dust',
              x: item.x,
              y: item.y,
              vx: (Math.random() - 0.5) * 35,
              vy: -15,
              size: 4,
              maxLife: 0.3,
              color: '#b4baa6',
            });
          } else {
            item.vz = 0;
            item.vx = 0;
            item.vr = 0;
            item.rotation = item.id === 'key' ? -0.15 : 0;
            this.sound.playItemDrop(item.id);
          }
        }
      }

      // Auto-pickup when player walks over settled/falling item after brief grace delay
      if (this.simTime - item.spawnTime > 0.35 && checkHitboxOverlap(this.px, this.py, 58, item.x, item.y)) {
        const res = addItemToInventory(this.inventory, item.id);
        if (res.added) {
          item.collected = true;
          this.inventory = res.nextSlots;
          this.sound.playPickup();
          for (let i = 0; i < 10; i++) {
            this.spawnParticle({
              kind: 'sparkle',
              x: item.x,
              y: item.y - 18,
              vx: (Math.random() - 0.5) * 90,
              vy: -20 - Math.random() * 80,
              size: 4 + Math.random() * 3,
              maxLife: 0.55,
              color: item.id === 'bulb' ? '#fef08a' : '#d6d3d1',
            });
          }
          const meta = ITEM_METADATA[item.id];
          this.showDialogue('Nhặt vật phẩm', `Đã cất ${meta.label} vào Túi đồ (${this.inventory.length}/2).`, 2.8);
          this.pushHud(true);
        }
      }
    }
  }

  private unlockAncientGate(): void {
    this.gateUnlocked = true;
    this.inventory = removeItemFromInventory(this.inventory, 'key');
    this.gateShake = 1.0;
    this.victoryDelayTimer = 1.15;
    this.trauma = Math.min(1, this.trauma + 0.5);
    this.hitstopTimer = 0.05;
    this.sound.playGateUnlockVictory();
    this.showDialogue('Cánh Cổng Cổ Đại', 'Cạch! Chìa khóa vừa khớp! Cánh cổng dẫn sang Level 2 đang mở ra...', 3.0);
    this.pushHud(true);
  }

  private completeLevel1(): void {
    this.state = 'victory';
    this.clearInputs();
    this.sound.stopMusic();
    if (this.bestTimeSec === null || this.elapsedSec < this.bestTimeSec) {
      this.bestTimeSec = this.elapsedSec;
      try {
        localStorage.setItem('meziu_lv1_best_time', this.bestTimeSec.toFixed(2));
      } catch {
        // ignore
      }
    }
    this.syncBodyState();
    this.pushHud(true);
  }

  private triggerDefeatGameOver(reason: string, fromAbyss = false): void {
    this.state = 'gameover';
    this.deathReason = reason;
    this.respawnCountdown = 2.2;
    this.fallVy = fromAbyss ? 80 : -140;
    this.fallRot = 0;
    this.fallAlpha = 1;
    this.trauma = Math.min(1, this.trauma + 0.52);
    this.clearInputs();
    this.sound.stopMusic();
    if (fromAbyss) {
      this.sound.playFallAbyss();
    }
    this.sound.playAwwDefeat();
    this.syncBodyState();
    this.pushHud(true);
  }

  private updateCamera(dt: number): void {
    const viewWorldW = WORLD_HEIGHT * (this.viewW / this.viewH);
    const lookAhead = this.facingRight ? 95 : -95;
    const targetCamX = clamp(this.px + lookAhead - viewWorldW * 0.45, 0, Math.max(0, WORLD_WIDTH - viewWorldW));
    const lerp = 1 - Math.exp(-6.5 * dt);
    this.camX += (targetCamX - this.camX) * lerp;
  }

  private updateEyes(dt: number): void {
    // Natural blink timer
    if (this.blinkDuration > 0) {
      this.blinkDuration = Math.max(0, this.blinkDuration - dt);
    } else {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkDuration = 0.13;
        this.blinkTimer = 2.5 + Math.random() * 2.4;
      }
    }

    // Look toward nearest attacker, item, or movement direction
    let tx = this.facingRight ? 1 : -1;
    let ty = 0;

    const threateningBird = this.pterodactyls.find(
      (p) => !p.isSilhouette && (p.phase === 'telegraph' || p.phase === 'diving') && Math.abs(p.x - this.px) < 340
    );
    const nearbyItem = this.worldItems.find((it) => !it.collected && Math.abs(it.x - this.px) < 190);
    if (threateningBird) {
      tx = threateningBird.x >= this.px ? (this.facingRight ? 0.8 : -0.8) : (this.facingRight ? -0.8 : 0.8);
      ty = threateningBird.y < this.py - 40 ? -0.9 : 0.1;
    } else if (nearbyItem) {
      tx = nearbyItem.x >= this.px ? (this.facingRight ? 0.7 : -0.7) : (this.facingRight ? -0.7 : 0.7);
      ty = nearbyItem.z > 40 ? -0.85 : 0.65;
    } else if (!this.leftTreeLooted && Math.abs(this.px - LEFT_TREE_X) < 160) {
      tx = 0.35;
      ty = -0.85;
    } else if (Math.abs(this.px - GATE_X) < 180) {
      tx = 0.9;
      ty = -0.25;
    } else if (this.pz > 10) {
      ty = this.vz > 0 ? -0.45 : 0.55;
    }

    const eyeLerp = 1 - Math.exp(-12 * dt);
    this.gazeX += (tx - this.gazeX) * eyeLerp;
    this.gazeY += (ty - this.gazeY) * eyeLerp;
  }

  private updateHintPrompt(): void {
    if (this.gateUnlocked || this.hatchPhase === 'wobble') {
      this.hintPrompt = null;
      return;
    }

    const activeDive = this.pterodactyls.find((p) => !p.isSilhouette && (p.phase === 'telegraph' || p.phase === 'diving'));
    if (activeDive) {
      if (activeDive.phase === 'telegraph') {
        this.hintPrompt = 'Cảnh báo !! Khủng long bay sắp lao xuống — Đánh [J]/Đá [K] hoặc né đòn!';
      } else if (activeDive.attackPattern === 'vertical') {
        this.hintPrompt = 'Bổ nhào thẳng đứng! Né sang Trái hoặc Phải — hoặc Đánh [J]/Đá [K] phản công!';
      } else if (activeDive.attackPattern === 'diag_lr') {
        this.hintPrompt = 'Bay chéo Trái → Phải! Nhảy [Space] + né sang Trái để tránh bị cắn!';
      } else {
        this.hintPrompt = 'Bay chéo Phải → Trái! Di chuyển Nhảy [Space] + né sang Phải!';
      }
      return;
    }

    if (!this.leftTreeLooted && Math.abs(this.px - LEFT_TREE_X) < 105) {
      this.hintPrompt = 'Bấm [K] 2 lần liên tiếp (Quất đuôi) vào cây dừa!';
    } else if (Math.abs(this.px - STATUE_X) < 75) {
      this.hintPrompt = 'Bấm [J] để kiểm tra Tượng Khủng Long';
    } else if (Math.abs(this.px - BOOK_X) < 75) {
      this.hintPrompt = 'Bấm [J] để đọc Cuốn Sách Cũ';
    } else if (Math.abs(this.px - GATE_X) < 110) {
      this.hintPrompt = canUnlockGate(this.inventory)
        ? 'Đang có Chìa khóa — chạm hoặc bấm [J] để mở cổng!'
        : 'Cánh cổng bị khóa · Cần Chìa khóa từ cây dừa bên trái';
    } else if (this.px > BRIDGE_START_X - 40 && this.px < BRIDGE_END_X + 20) {
      this.hintPrompt = 'Đi đúng giữa ván cầu gỗ kẻo rơi xuống vực!';
    } else {
      this.hintPrompt = null;
    }
  }

  private updateAmbientWorld(dt: number): void {
    // Drifting clouds
    for (const c of this.clouds) {
      c.x += c.speed * this.windDir * dt;
      if (c.x > WORLD_WIDTH + 260) c.x = -280;
      if (c.x < -300) c.x = WORLD_WIDTH + 240;
    }

    const activeCombatAllowed = this.state === 'playing' && this.hatchPhase !== 'wobble' && !this.gateUnlocked;
    const activeAttackers = this.pterodactyls.filter((pt) => !pt.isSilhouette && pt.phase !== 'cruise').length;

    // Flying & Attacking Pterodactyls
    for (let i = this.pterodactyls.length - 1; i >= 0; i--) {
      const p = this.pterodactyls[i];
      p.flapPhase += p.flapSpeed * dt;
      if (p.hitFlashTimer > 0) p.hitFlashTimer = Math.max(0, p.hitFlashTimer - dt);
      if (p.hitCooldownTimer > 0) p.hitCooldownTimer = Math.max(0, p.hitCooldownTimer - dt);

      if (p.isSilhouette || p.phase === 'cruise') {
        p.x += p.speed * dt;
        // 1/6 aggro check per foreground bird when entering strike zone near Meziu Rex
        if (
          activeCombatAllowed &&
          !p.isSilhouette &&
          !p.aggroRolled &&
          activeAttackers < 1 &&
          Math.abs(p.x - this.px) < 420 &&
          this.px > 180 &&
          this.px < GATE_X - 90
        ) {
          p.aggroRolled = true;
          if (rollPterodactylAggro(Math.random())) {
            p.phase = 'telegraph';
            p.telegraphTimer = PTERODACTYL_TELEGRAPH_SEC; // 1.0s warning `!!`
            p.flapSpeed = 10.5;
            this.sound.playPteroWarning();
          }
        }

        if (p.x > WORLD_WIDTH + 240 || p.x < -260) {
          this.pterodactyls.splice(i, 1);
        }
      } else if (p.phase === 'telegraph') {
        // Hover & track slightly above arena for 1s with crisp `!!` alert
        const hoverX = clamp(this.px + (p.x >= this.px ? 70 : -70), 90, WORLD_WIDTH - 90);
        p.x += (hoverX - p.x) * Math.min(1, dt * 4);
        p.y += (140 - p.y) * Math.min(1, dt * 5);
        p.telegraphTimer -= dt;

        if (p.telegraphTimer <= 0) {
          p.attackPattern = pickPterodactylAttackPattern(Math.random());
          p.attackTargetX = this.px;
          p.attackTargetY = this.py;
          p.attackProgress = 0;
          p.didHitThisPass = false;

          if (p.attackPattern === 'vertical') {
            p.attackStartX = this.px;
            p.attackStartY = 85;
            p.x = p.attackStartX;
            p.y = p.attackStartY;
          } else if (p.attackPattern === 'diag_lr') {
            p.attackStartX = clamp(this.px - 260, 70, WORLD_WIDTH - 240);
            p.attackStartY = 92;
            p.x = p.attackStartX;
            p.y = p.attackStartY;
            p.speed = Math.abs(p.speed);
          } else {
            // 'diag_rl'
            p.attackStartX = clamp(this.px + 260, 240, WORLD_WIDTH - 70);
            p.attackStartY = 92;
            p.x = p.attackStartX;
            p.y = p.attackStartY;
            p.speed = -Math.abs(p.speed);
          }
          p.phase = 'diving';
          p.flapSpeed = 13.0;
          this.sound.playPteroSwoop();
        }
      } else if (p.phase === 'diving') {
        const diveDuration = 0.92;
        p.attackProgress += dt / diveDuration;
        const t = clamp(p.attackProgress, 0, 1);

        if (p.attackPattern === 'vertical') {
          p.x = p.attackStartX;
          // Dive straight down to road level at t=0.68 then pull up slightly
          if (t < 0.72) {
            const k = t / 0.72;
            p.y = p.attackStartY + (p.attackTargetY - 26 - p.attackStartY) * (k * k);
          } else {
            const k = (t - 0.72) / 0.28;
            p.y = (p.attackTargetY - 26) - k * 46;
          }
        } else {
          // Smooth diagonal arc across Rex's horizontal lane
          const dir = p.attackPattern === 'diag_lr' ? 1 : -1;
          const endX = p.attackTargetX + dir * 240;
          p.x = p.attackStartX + (endX - p.attackStartX) * t;
          const apexY = p.attackTargetY - 24;
          const arc = Math.sin(t * Math.PI);
          p.y = p.attackStartY + (apexY - p.attackStartY) * arc;
          p.speed = dir * 320;
        }

        const pteroZ = Math.max(0, (p.attackTargetY - 18) - p.y);

        // Check bite collision against Meziu Rex during strike window
        if (
          activeCombatAllowed &&
          !p.didHitThisPass &&
          this.invulnTimer <= 0 &&
          t >= 0.25 &&
          t <= 0.85
        ) {
          const hitRex = evaluatePterodactylAttackHit({
            pattern: p.attackPattern,
            pteroX: p.x,
            pteroZ,
            px: this.px,
            pz: this.pz,
            vx: this.vx,
          });
          if (hitRex) {
            p.didHitThisPass = true;
            const biteRes = applyPlayerBite(this.playerBitesTaken);
            this.playerBitesTaken = biteRes.nextBites;
            this.invulnTimer = 1.15;
            this.hitFlashTimer = 0.2;
            this.trauma = Math.min(1, this.trauma + 0.52);
            this.sound.playRexBiteHurt();

            if (biteRes.defeated) {
              this.triggerDefeatGameOver('Bị khủng long bay cắn 3 lần!', false);
              return;
            } else {
              this.showDialogue('Meziu Rex', 'Á! Bị khủng long bay cắn trúng rồi — né hoặc đánh trả [J]/[K]!', 2.4);
            }
          }
        }

        if (p.attackProgress >= 1) {
          if (!p.didHitThisPass) {
            // Missed! Fly back high into the sky and re-select one of 3 attack directions!
            p.phase = 'ascend';
            p.flapSpeed = 9.5;
          } else {
            p.phase = 'cruise';
            p.flapSpeed = 6.2;
            p.speed = (this.facingRight ? 1 : -1) * 140;
          }
        }
      } else if (p.phase === 'ascend') {
        const targetHighX = clamp(this.px + (p.x >= this.px ? 55 : -55), 100, WORLD_WIDTH - 100);
        p.x += (targetHighX - p.x) * Math.min(1, dt * 3.2);
        p.y -= 240 * dt;
        if (p.y <= 98) {
          p.y = 98;
          p.phase = 'telegraph';
          p.telegraphTimer = PTERODACTYL_TELEGRAPH_SEC;
          this.sound.playPteroWarning();
        }
      }
    }

    this.pteroSpawnTimer -= dt;
    if (this.pteroSpawnTimer <= 0 && this.pterodactyls.length < 6) {
      this.pteroSpawnTimer = 3.2 + Math.random() * 3.0;
      const isSil = Math.random() < 0.3;
      const y = isSil ? 60 + Math.random() * 105 : 115 + Math.random() * 125;
      const depthScale = isSil ? 0.28 + Math.random() * 0.12 : 0.48 + Math.random() * 0.14;
      const spawnFromLeft = Math.random() < 0.5;
      const spawnX = spawnFromLeft
        ? Math.max(-160, this.camX - 120)
        : Math.min(WORLD_WIDTH + 160, this.camX + 1400);
      const speedMag = isSil ? 35 + Math.random() * 18 : 65 + Math.random() * 35;
      this.pterodactyls.push(
        this.createPterodactyl({
          x: spawnX,
          y,
          speed: spawnFromLeft ? speedMag : -speedMag,
          scale: depthScale,
          isSilhouette: isSil,
          flapSpeed: isSil ? 4.2 : 6.0 + Math.random() * 1.4,
          bobAmp: isSil ? 6 : 11,
          bobFreq: 1.5 + Math.random() * 0.8,
          variant: Math.floor(Math.random() * 3),
        })
      );
    }

    // Distant rising smoke / canyon mist wisps ("bụi khói phía xa")
    this.smokeSpawnTimer -= dt;
    if (this.smokeSpawnTimer <= 0) {
      this.smokeSpawnTimer = 0.55;
      const smokeSpots = [340, 560, 1180, 1400, 1980];
      const sx = smokeSpots[Math.floor(Math.random() * smokeSpots.length)] + (Math.random() - 0.5) * 90;
      const isAbyssMist = sx > BRIDGE_START_X && sx < BRIDGE_END_X;
      this.spawnParticle({
        kind: 'smoke',
        x: sx,
        y: isAbyssMist ? 650 : 390 + Math.random() * 80,
        vx: 14 * this.windDir + (Math.random() - 0.5) * 8,
        vy: -16 - Math.random() * 14,
        size: isAbyssMist ? 36 + Math.random() * 24 : 22 + Math.random() * 18,
        alpha: isAbyssMist ? 0.28 : 0.18,
        maxLife: 3.4 + Math.random() * 1.5,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.3,
        color: '#9ca694',
      });
    }
  }

  private updateParticles(dt: number): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      if (p.kind === 'leaf' || p.kind === 'feather') {
        // Gentle fluttering sinusoidal fall
        p.vx += Math.sin(this.simTime * 5 + p.rot) * 45 * dt;
        p.vx *= 0.985;
        p.vy = Math.min(85, p.vy + 35 * dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
      } else if (p.kind === 'shell') {
        p.vy += 640 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
      } else if (p.kind === 'ring') {
        p.size += 240 * dt;
      } else if (p.kind === 'smoke') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.size += 10 * dt;
        p.rot += p.vrot * dt;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
      }
    }
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Fill atmospheric base
    ctx.fillStyle = '#5f6a5c';
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    if (!this.assets) {
      ctx.fillStyle = '#d4dac8';
      ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Đang tải thế giới Meziu Rex...', this.viewW / 2, this.viewH / 2);
      ctx.restore();
      return;
    }

    const worldScale = this.viewH / WORLD_HEIGHT;
    const shakeMag = this.trauma * this.trauma * 12;
    const shakeX = shakeMag * (Math.random() * 2 - 1);
    const shakeY = shakeMag * (Math.random() * 2 - 1);

    ctx.save();
    ctx.scale(worldScale, worldScale);
    ctx.translate(-this.camX + shakeX, shakeY);

    // 1. Stitched & cleaned seamless background panorama (visible slice only for crisp 60fps performance)
    const viewWorldW = WORLD_HEIGHT * (this.viewW / this.viewH);
    const sx = clamp(Math.floor(this.camX - 16), 0, WORLD_WIDTH - 1);
    const sw = clamp(Math.ceil(viewWorldW + 32), 1, WORLD_WIDTH - sx);
    ctx.drawImage(this.assets.panorama, sx, 0, sw, WORLD_HEIGHT, sx, 0, sw, WORLD_HEIGHT);

    // 2. Distant smoke wisps behind mid-sky
    this.renderParticlesByKind(ctx, 'smoke');

    // 3. Drifting Clouds & Flying Pterodactyls
    this.renderSkyEntities(ctx);

    // 4. Interactive Left Palm Tree (swaying + hit shake + canopy golden glint!)
    this.renderLeftPalmTree(ctx);

    // 5. Golden portal inside Ancient Stone Gate when unlocked
    if (this.gateUnlocked || this.gateOpenProgress > 0) {
      this.renderGatePortalEffect(ctx);
    }

    // 6. Subtle highlight glint on Dino Statue & Old Book
    this.renderLandmarkHighlights(ctx);

    // 7. Depth-sorted actors & items (Eggshell, World Items, Meziu Rex)
    this.renderDepthSortedActors(ctx);

    // 8. Foreground particles (dust, leaves, feathers, shell chips, sparkles, tail-whip rings)
    this.renderParticlesByKind(ctx, 'dust');
    this.renderParticlesByKind(ctx, 'shell');
    this.renderParticlesByKind(ctx, 'leaf');
    this.renderParticlesByKind(ctx, 'feather');
    this.renderParticlesByKind(ctx, 'sparkle');
    this.renderParticlesByKind(ctx, 'ring');

    // 9. Diegetic speech bubble above character / landmark
    if (this.dialogue && this.state === 'playing') {
      this.renderWorldDialogue(ctx, this.dialogue);
    }

    ctx.restore();
    ctx.restore();
  }

  private renderSkyEntities(ctx: CanvasRenderingContext2D): void {
    const assets = this.assets!;

    // Clouds
    for (const c of this.clouds) {
      const sprite = assets.clouds[c.variant % assets.clouds.length];
      ctx.save();
      ctx.globalAlpha = c.alpha;
      ctx.translate(c.x, c.y);
      ctx.scale(c.scale, c.scale);
      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      ctx.restore();
    }

    // Pterodactyls (ambient + diving attackers with !! warning badge, NO HP bar)
    for (const p of this.pterodactyls) {
      const isCombative = !p.isSilhouette && p.phase !== 'cruise';
      const bobY = isCombative ? 0 : Math.sin(this.simTime * p.bobFreq + p.flapPhase) * p.bobAmp;
      let sprite: HTMLCanvasElement;
      if (p.isSilhouette) {
        const idx = Math.floor((Math.sin(p.flapPhase) + 1) * 1.49) % assets.pterodactylSilhouettes.length;
        sprite = assets.pterodactylSilhouettes[idx];
      } else {
        const idx = Math.floor((p.flapPhase / (Math.PI * 2)) * 4) % 4;
        sprite = assets.pterodactylFlap[idx];
      }

      ctx.save();
      ctx.globalAlpha = p.isSilhouette ? 0.42 : 0.92;
      ctx.translate(p.x, p.y + bobY);

      const dir = isCombative
        ? p.phase === 'diving' && p.attackPattern === 'diag_lr'
          ? 1
          : p.phase === 'diving' && p.attackPattern === 'diag_rl'
            ? -1
            : this.px >= p.x
              ? 1
              : -1
        : p.speed >= 0
          ? 1
          : -1;

      if (p.phase === 'diving') {
        ctx.rotate(p.attackPattern === 'vertical' ? 0.35 * dir : 0.22 * dir);
      }

      ctx.scale(p.scale * dir, p.scale);
      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);

      if (p.hitFlashTimer > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6;
        ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      }
      ctx.restore();

      // Render bold crisp "!!" warning badge for 1s before diving (and swoop aura while diving)
      if (p.phase === 'telegraph') {
        const pulse = 1 + Math.sin(this.simTime * 22) * 0.14;
        ctx.save();
        ctx.translate(p.x, p.y - 36);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = '#181d16';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-16, -15, 32, 26, 7);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fde047';
        ctx.font = '800 16px "Bricolage Grotesque", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!!', 0, -1);
        ctx.restore();
      } else if (p.phase === 'diving') {
        ctx.save();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 34 * p.scale + 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private renderLeftPalmTree(ctx: CanvasRenderingContext2D): void {
    // Pulsing golden glint inside the left palm tree's canopy before looting
    if (!this.leftTreeLooted) {
      const pulse = 0.55 + Math.sin(this.simTime * 4.2) * 0.35;
      const shakeX = this.leftTreeShake > 0 ? Math.sin(this.simTime * 46) * 8 * this.leftTreeShake : 0;
      const gx = LEFT_TREE_X + 106 + shakeX;
      const gy = 112;

      ctx.save();
      ctx.fillStyle = `rgba(254, 240, 138, ${0.28 * pulse})`;
      ctx.beginPath();
      ctx.arc(gx, gy, 28, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(255, 251, 214, ${0.85 * pulse})`;
      ctx.beginPath();
      ctx.arc(gx, gy, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(255, 251, 214, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gx - 14, gy);
      ctx.lineTo(gx + 14, gy);
      ctx.moveTo(gx, gy - 14);
      ctx.lineTo(gx, gy + 14);
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderGatePortalEffect(ctx: CanvasRenderingContext2D): void {
    const open = this.gateOpenProgress;
    const gx = GATE_X + 18 + (this.gateShake > 0 ? Math.sin(this.simTime * 40) * 4 * this.gateShake : 0);
    const gy = GATE_Y - 62;

    ctx.save();
    const glowR = 45 + open * 85;
    const grad = ctx.createRadialGradient(gx, gy, 4, gx, gy, glowR);
    grad.addColorStop(0, `rgba(254, 243, 199, ${0.88 * open})`);
    grad.addColorStop(0.45, `rgba(245, 158, 11, ${0.52 * open})`);
    grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(gx, gy, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private renderLandmarkHighlights(ctx: CanvasRenderingContext2D): void {
    // Subtle interactive cue ring on Statue & Book when Meziu Rex is nearby
    const targets = [
      { x: STATUE_X, y: STATUE_Y - 26, active: Math.abs(this.px - STATUE_X) < 85 },
      { x: BOOK_X, y: BOOK_Y - 12, active: Math.abs(this.px - BOOK_X) < 85 },
    ];
    for (const t of targets) {
      if (!t.active) continue;
      const pulse = 0.4 + Math.sin(this.simTime * 5) * 0.25;
      ctx.save();
      ctx.strokeStyle = `rgba(253, 230, 138, ${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + 18, 28, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderDepthSortedActors(ctx: CanvasRenderingContext2D): void {
    type DrawCmd = { sortY: number; draw: () => void };
    const queue: DrawCmd[] = [];

    // 1. Egg / Fading Cracked Eggshell
    if (this.hatchPhase !== 'done' && this.eggAlpha > 0) {
      queue.push({
        sortY: START_Y - 2,
        draw: () => this.renderEggshell(ctx),
      });
    }

    // 2. Dropped World Items (Key & Bulb)
    for (const item of this.worldItems) {
      if (item.collected) continue;
      queue.push({
        sortY: item.y,
        draw: () => this.renderWorldItem(ctx, item),
      });
    }

    // 3. Meziu Rex (hidden while egg is still wobbling pre-hatch!)
    if (this.hatchPhase !== 'idle_egg' && this.hatchPhase !== 'wobble' && this.fallAlpha > 0) {
      queue.push({
        sortY: this.py,
        draw: () => this.renderMeziuRex(ctx),
      });
    }

    queue.sort((a, b) => a.sortY - b.sortY);
    for (const cmd of queue) cmd.draw();
  }

  private renderEggshell(ctx: CanvasRenderingContext2D): void {
    const eggSprite = this.assets!.eggshell;
    const wobble =
      this.hatchPhase === 'wobble'
        ? Math.sin(this.hatchTimer * 28) * 0.14 * (0.4 + this.hatchTimer)
        : this.hatchPhase === 'idle_egg'
          ? Math.sin(this.simTime * 2.2) * 0.03
          : 0;

    ctx.save();
    ctx.globalAlpha = this.eggAlpha;
    ctx.translate(START_X - 18, START_Y + 4);

    // Shadow
    ctx.fillStyle = 'rgba(15, 20, 14, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 32, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(wobble);
    const scale = 0.72;
    ctx.drawImage(eggSprite, (-eggSprite.width * scale) / 2, -eggSprite.height * scale + 6, eggSprite.width * scale, eggSprite.height * scale);

    // Glowing crack energy during wobble
    if (this.hatchPhase === 'wobble' && this.eggCrackLevel >= 1) {
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-10, -34);
      ctx.lineTo(0, -22);
      ctx.lineTo(12, -32);
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderWorldItem(ctx: CanvasRenderingContext2D, item: WorldItem): void {
    const sprite = item.id === 'key' ? this.assets!.keyItem : this.assets!.bulbItem;
    const bob = item.z <= 0.5 ? Math.sin(this.simTime * 4 + (item.id === 'key' ? 0 : 2)) * 4 : 0;
    const scale = item.id === 'key' ? 0.52 : 0.58;

    ctx.save();
    // Ground shadow
    const shadowScale = clamp(1 - item.z / 260, 0.35, 1);
    ctx.fillStyle = 'rgba(12, 18, 12, 0.35)';
    ctx.beginPath();
    ctx.ellipse(item.x, item.y + 4, 18 * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pickup aura
    if (item.z <= 1) {
      const glowColor = item.id === 'bulb' ? 'rgba(254, 240, 138, 0.45)' : 'rgba(226, 232, 240, 0.32)';
      const grad = ctx.createRadialGradient(item.x, item.y - 16 + bob, 2, item.x, item.y - 16 + bob, 28);
      grad.addColorStop(0, glowColor);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(item.x, item.y - 16 + bob, 28, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.translate(item.x, item.y - item.z - 16 + bob);
    ctx.rotate(item.rotation);
    ctx.drawImage(
      sprite,
      (-sprite.width * scale) / 2,
      (-sprite.height * scale) / 2,
      sprite.width * scale,
      sprite.height * scale
    );
    ctx.restore();
  }

  private renderMeziuRex(ctx: CanvasRenderingContext2D): void {
    const assets = this.assets!;
    let frameIdx = 0;

    if (this.currentAction === 'kick') frameIdx = 2;
    else if (this.currentAction === 'tailwhip') frameIdx = 3;
    else if (this.pz > 6) frameIdx = 2;
    else if (Math.abs(this.vx) > 5 || Math.abs(this.vy) > 5) {
      frameIdx = this.stepToggle ? 1 : 0;
    }

    const frame = assets.rexFrames[frameIdx];
    const eyes = assets.rexEyeCenters[frameIdx];
    const isMoving = Math.abs(this.vx) > 5 || Math.abs(this.vy) > 5;
    const walkBob = isMoving && this.pz <= 1 ? Math.abs(Math.sin(this.walkDistAcc * 0.11)) * 3.5 : Math.sin(this.simTime * 2.6) * 1.2;

    const scale = 0.56;
    const drawW = frame.width * scale;
    const drawH = frame.height * scale;

    ctx.save();
    // Blink briefly during post-bite invulnerability frames
    const invulnBlink = this.invulnTimer > 0 && Math.floor(this.invulnTimer * 18) % 2 === 1 ? 0.48 : 1;
    ctx.globalAlpha = this.fallAlpha * invulnBlink;

    // Ground shadow (stays on road while jumping, disappears when falling into abyss)
    if (this.state !== 'gameover') {
      const shScale = clamp(1 - this.pz / 220, 0.42, 1);
      ctx.fillStyle = 'rgba(12, 18, 12, 0.38)';
      ctx.beginPath();
      ctx.ellipse(this.px, this.py + 3, 28 * shScale, 8 * shScale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tail Whip sweeping wind ribbon around Meziu Rex
    if (this.currentAction === 'tailwhip') {
      const prog = 1 - this.actionTimer / 0.38;
      const fade = Math.max(0, 1 - prog);
      ctx.save();
      ctx.translate(this.px, this.py - 26 - this.pz);
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(38, 44, 34, ${0.42 * fade})`;
      ctx.lineWidth = 8 * (1 - prog * 0.45);
      ctx.beginPath();
      ctx.ellipse(0, 0, 62, 22, 0, this.spinAngle, this.spinAngle + Math.PI * 1.25);
      ctx.stroke();
      ctx.strokeStyle = `rgba(244, 240, 206, ${0.9 * fade})`;
      ctx.lineWidth = 4.2 * (1 - prog * 0.45);
      ctx.beginPath();
      ctx.ellipse(0, 0, 62, 22, 0, this.spinAngle + 0.08, this.spinAngle + Math.PI * 1.22);
      ctx.stroke();
      ctx.restore();
    }

    ctx.translate(this.px, this.py - this.pz + walkBob);

    if (this.state === 'gameover') {
      ctx.rotate(this.fallRot);
    } else if (this.currentAction === 'tailwhip') {
      const spinScaleX = Math.cos(this.spinAngle);
      ctx.scale(spinScaleX >= 0 ? 1 : -1, 1);
    }

    const dir = this.facingRight ? 1 : -1;
    ctx.scale(dir * this.squashX, this.squashY);

    // Draw flapping golden-olive Dino Wings when 5s Wing Buff is active!
    if (this.wingBuffTimer > 0) {
      const wingAlpha = this.wingBuffTimer < 1.0 ? 0.55 + Math.sin(this.simTime * 22) * 0.35 : 1;
      const flapDeg = Math.sin(this.simTime * (this.pz > 2 ? 20 : 9)) * 0.55 - 0.3;
      ctx.save();
      ctx.globalAlpha *= wingAlpha;
      ctx.translate(-14, -44);
      ctx.rotate(flapDeg);
      ctx.fillStyle = '#c9a648';
      ctx.strokeStyle = '#1b2019';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-30, -28, -42, -8);
      ctx.quadraticCurveTo(-28, 2, -20, 12);
      ctx.quadraticCurveTo(-10, 4, 0, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Draw cleaned Meziu Rex sprite anchored at feet center
    ctx.drawImage(frame, -drawW * 0.52, -drawH + 8, drawW, drawH);

    if (this.hitFlashTimer > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25;
      ctx.drawImage(frame, -drawW * 0.52, -drawH + 8, drawW, drawH);
      ctx.restore();
    }

    // Draw live animated pupils & eyelids on both asymmetrical googly eyes!
    this.renderLiveEyes(ctx, eyes, scale, drawW, drawH);

    ctx.restore();
  }

  private renderLiveEyes(
    ctx: CanvasRenderingContext2D,
    eyes: GameAssets['rexEyeCenters'][number],
    scale: number,
    drawW: number,
    drawH: number
  ): void {
    const ox = -drawW * 0.52;
    const oy = -drawH + 8;

    const bx = ox + eyes.big.cx * scale;
    const by = oy + eyes.big.cy * scale;
    const sx = ox + eyes.small.cx * scale;
    const sy = oy + eyes.small.cy * scale;

    const isPanicked =
      this.state === 'gameover' ||
      (this.px > BRIDGE_START_X &&
        this.px < BRIDGE_END_X &&
        (this.py < BRIDGE_MIN_Y + 9 || this.py > BRIDGE_MAX_Y - 9));

    const isFierce = this.currentAction === 'kick' || this.currentAction === 'tailwhip' || this.currentAction === 'punch';

    // Pupils
    const bigPupilR = isPanicked ? 1.5 : 2.2;
    const smallPupilR = isPanicked ? 1.1 : 1.65;

    ctx.fillStyle = '#1b2019';
    ctx.beginPath();
    ctx.arc(bx + this.gazeX * 2.1, by + this.gazeY * 2.1, bigPupilR, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(sx + this.gazeX * 1.4, sy + this.gazeY * 1.3, smallPupilR, 0, Math.PI * 2);
    ctx.fill();

    // Subtle eye specular highlight
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(bx + this.gazeX * 2.1 - 0.7, by + this.gazeY * 2.1 - 0.8, 0.75, 0, Math.PI * 2);
    ctx.fill();

    // Blinking or fierce battle eyelids
    if (this.blinkDuration > 0) {
      ctx.fillStyle = '#5f6850';
      ctx.beginPath();
      ctx.ellipse(bx, by, eyes.big.rx * scale + 0.5, eyes.big.ry * scale + 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sx, sy, eyes.small.rx * scale + 0.5, eyes.small.ry * scale + 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (isFierce) {
      ctx.strokeStyle = '#1b2019';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(bx - 4, by - 4);
      ctx.lineTo(bx + 4, by - 2);
      ctx.stroke();
    }
  }

  private renderParticlesByKind(ctx: CanvasRenderingContext2D, kind: Particle['kind']): void {
    for (const p of this.particles) {
      if (!p.active || p.kind !== kind) continue;
      const t = p.life / p.maxLife;
      const alpha = p.alpha * (1 - t);

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);

      if (kind === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * (1 - t);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (kind === 'leaf' || kind === 'feather') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2c3820';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-p.size * 0.8, 0);
        ctx.lineTo(p.size * 0.8, 0);
        ctx.stroke();
      } else if (kind === 'smoke') {
        ctx.fillStyle = 'rgba(156, 166, 148, 0.35)';
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(176, 185, 168, 0.25)';
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.55, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'sparkle') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * (1 - t * 0.4), 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'shell') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-p.size, -p.size * 0.5);
        ctx.lineTo(p.size, -p.size * 0.2);
        ctx.lineTo(0, p.size * 0.8);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * (1 + t * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private renderWorldDialogue(ctx: CanvasRenderingContext2D, d: DialogueState): void {
    const fade = clamp(d.timer / 0.35, 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;

    ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
    const maxW = 290;
    const words = d.text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      if (ctx.measureText(test).width > maxW - 28) {
        if (current) lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);

    const boxW = maxW;
    const boxH = 32 + lines.length * 18;
    const viewWorldW = WORLD_HEIGHT * (this.viewW / this.viewH);
    const bx = clamp(this.px - boxW / 2, this.camX + 16, this.camX + viewWorldW - boxW - 16);
    const by = Math.max(85, this.py - this.pz - 115 - boxH);

    // World-matched olive-stone plaque
    ctx.fillStyle = 'rgba(26, 32, 25, 0.92)';
    ctx.strokeStyle = 'rgba(180, 190, 158, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e5c158';
    ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(d.speaker, bx + 14, by + 18);

    ctx.fillStyle = '#eef1e6';
    ctx.font = '500 13px "Plus Jakarta Sans", sans-serif';
    lines.forEach((line, idx) => {
      ctx.fillText(line, bx + 14, by + 36 + idx * 18);
    });

    ctx.restore();
  }

  private pushHud(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastHudPushTime < 100) return;

    const steps = calculateSteps(this.px);
    const comboWindowActive = this.kickCount > 0 && this.simTime - this.lastKickTime <= 0.6;
    const wingRounded = Math.ceil(this.wingBuffTimer * 2) / 2;
    const sig = `${this.state}|${steps}|${this.inventory.join(',')}|${Math.floor(this.elapsedSec)}|${this.respawnCountdown.toFixed(1)}|${this.hintPrompt}|${this.sound.isMuted()}|${this.leftTreeLooted}|${this.gateUnlocked}|${comboWindowActive}|${wingRounded}|${this.pteroDefeatedCount}`;
    if (!force && sig === this.lastHudSignature) return;

    this.lastHudSignature = sig;
    this.lastHudPushTime = now;

    this.onHudChange({
      state: this.state,
      steps,
      maxSteps: MAX_STEPS,
      inventory: [...this.inventory],
      elapsedSec: this.elapsedSec,
      bestTimeSec: this.bestTimeSec,
      respawnCountdown: this.respawnCountdown,
      dialogue: this.dialogue?.text ?? null,
      speaker: this.dialogue?.speaker ?? null,
      hintPrompt: this.hintPrompt,
      muted: this.sound.isMuted(),
      treeLooted: this.leftTreeLooted,
      gateUnlocked: this.gateUnlocked,
      comboWindowActive,
      deathReason: this.deathReason,
      wingBuffSec: Math.max(0, this.wingBuffTimer),
      pteroDefeatedCount: this.pteroDefeatedCount,
    });
  }

  public destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.rafId);
    this.sound.stopMusic();
    this.sound.stopTitleMusic();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('pointerdown', this.handleGlobalFirstGesture);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    } else {
      window.removeEventListener('resize', this.updateCanvasSize);
    }
  }
}
