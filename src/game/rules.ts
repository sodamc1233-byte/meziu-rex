import type { ItemId, PterodactylAttackPattern } from './types';

export const WORLD_WIDTH = 2330;
export const WORLD_HEIGHT = 698;

export const START_X = 148;
export const START_Y = 558;
export const GATE_X = 2135;
export const GATE_Y = 556;
export const MAX_STEPS = 50;

export const ROAD_MIN_Y = 528;
export const ROAD_MAX_Y = 590;

export const BRIDGE_START_X = 895;
export const BRIDGE_END_X = 1542;
export const BRIDGE_MIN_Y = 536;
export const BRIDGE_MAX_Y = 580;

export const LEFT_TREE_X = 771;
export const LEFT_TREE_Y = 548;

export const RIGHT_TREE_X = 1763;
export const RIGHT_TREE_Y = 550;

export const STATUE_X = 1835;
export const STATUE_Y = 552;

export const BOOK_X = 1968;
export const BOOK_Y = 572;

export const COMBO_WINDOW_SEC = 0.6;
export const MAX_INVENTORY_SLOTS = 2;

// Pterodactyl combat & Wing Buff rules
export const PTERODACTYL_AGGRO_CHANCE = 1 / 6;
export const PTERODACTYL_TELEGRAPH_SEC = 1.0;
export const PTERODACTYL_MAX_HP = 4; // 2 hits of Punch or Kick (damage = 2 each)
export const REX_PUNCH_DAMAGE = 2;
export const REX_KICK_DAMAGE = 2;
export const REX_TAILWHIP_DAMAGE = 2;
export const MAX_PLAYER_BITES = 3; // 3rd bite = defeat (no visible HP bar)
export const WING_BUFF_DURATION_SEC = 5.0;
export const WING_SPEED_MULTIPLIER = 1.42;
export const NORMAL_GRAVITY = 1280;
export const WING_GRAVITY = 480;

export const ITEM_METADATA: Record<ItemId, { label: string; desc: string }> = {
  key: {
    label: 'Chìa khóa cổ',
    desc: 'Mở cánh cổng đá cuối Level 1',
  },
  bulb: {
    label: 'Bóng đèn sáng',
    desc: 'Nguồn sáng bí ẩn từ cựu thế giới',
  },
};

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function calculateSteps(x: number): number {
  const progress = (x - START_X) / (GATE_X - START_X);
  return clamp(Math.round(progress * MAX_STEPS), 0, MAX_STEPS);
}

export function clampRoadPosition(x: number, y: number, allowBridgeAbyss = true): { x: number; y: number } {
  const clampedX = clamp(x, 62, GATE_X - 18);
  if (allowBridgeAbyss && clampedX > BRIDGE_START_X && clampedX < BRIDGE_END_X) {
    return { x: clampedX, y: clamp(y, ROAD_MIN_Y - 35, ROAD_MAX_Y + 35) };
  }
  return {
    x: clampedX,
    y: clamp(y, ROAD_MIN_Y, ROAD_MAX_Y),
  };
}

export function isOverAbyss(x: number, y: number, zHeight: number): boolean {
  if (x <= BRIDGE_START_X || x >= BRIDGE_END_X) return false;
  if (zHeight > 8) return false;
  return y < BRIDGE_MIN_Y || y > BRIDGE_MAX_Y;
}

export function processKickCombo(
  kickCount: number,
  lastKickTime: number,
  now: number
): { nextCount: number; isTailWhip: boolean } {
  const withinWindow = kickCount > 0 && now - lastKickTime <= COMBO_WINDOW_SEC;
  const count = withinWindow ? kickCount + 1 : 1;
  if (count >= 2) {
    return { nextCount: 0, isTailWhip: true };
  }
  return { nextCount: 1, isTailWhip: false };
}

export function addItemToInventory(
  slots: readonly ItemId[],
  item: ItemId
): { nextSlots: ItemId[]; droppedItem: ItemId | null; added: boolean } {
  if (slots.includes(item)) {
    return { nextSlots: [...slots], droppedItem: null, added: false };
  }
  if (slots.length < MAX_INVENTORY_SLOTS) {
    return { nextSlots: [...slots, item], droppedItem: null, added: true };
  }
  const droppedItem = slots[0];
  const nextSlots = [...slots.slice(1), item];
  return { nextSlots, droppedItem, added: true };
}

export function removeItemFromInventory(slots: readonly ItemId[], item: ItemId): ItemId[] {
  return slots.filter((id) => id !== item);
}

export function canUnlockGate(slots: readonly ItemId[]): boolean {
  return slots.includes('key');
}

export function checkHitboxOverlap(
  ax: number,
  ay: number,
  radius: number,
  tx: number,
  ty: number
): boolean {
  const dx = ax - tx;
  const dy = (ay - ty) * 1.15;
  return dx * dx + dy * dy <= radius * radius;
}

export function rollPterodactylAggro(rngValue: number): boolean {
  return rngValue >= 0 && rngValue < PTERODACTYL_AGGRO_CHANCE;
}

export function pickPterodactylAttackPattern(rngValue: number): PterodactylAttackPattern {
  const clamped = clamp(rngValue, 0, 0.999999);
  const idx = Math.floor(clamped * 3);
  if (idx === 0) return 'vertical';
  if (idx === 1) return 'diag_lr';
  return 'diag_rl';
}

/**
 * Evaluates whether a diving Pterodactyl hits Meziu Rex given its attack pattern,
 * position, height above ground (`pteroZ`), and player position/jump/velocity.
 *
 * Dodge rules:
 * - 'vertical': dodge left or right out of the dive column
 * - 'diag_lr' (top-left -> bottom-right): jump & dodge left avoids hit
 * - 'diag_rl' (top-right -> bottom-left): jump & dodge right avoids hit
 */
export function evaluatePterodactylAttackHit(params: {
  pattern: PterodactylAttackPattern;
  pteroX: number;
  pteroZ: number;
  px: number;
  pz: number;
  vx: number;
}): boolean {
  const { pattern, pteroX, pteroZ, px, pz, vx } = params;

  // Bird must be swooping near Rex's vertical strike altitude
  if (Math.abs(pteroZ - pz) > 48) return false;

  const dx = px - pteroX;
  if (Math.abs(dx) > 40) return false;

  if (pattern === 'vertical') {
    // Straight downward dive: stepping left or right clears the column (> 36px)
    return Math.abs(dx) <= 36;
  }

  if (pattern === 'diag_lr') {
    // Diagonal left-to-right swoop: jumping high or jumping + moving left evades cleanly
    if (pz >= 44) return false;
    if (pz >= 16 && vx < -15) return false;
    return Math.abs(dx) <= 38;
  }

  // 'diag_rl': Diagonal right-to-left swoop: jumping + moving right evades cleanly
  if (pz >= 44) return false;
  if (pz >= 16 && vx > 15) return false;
  return Math.abs(dx) <= 38;
}

export function applyPterodactylDamage(
  hp: number,
  damage: number
): { nextHp: number; defeated: boolean } {
  const nextHp = Math.max(0, hp - damage);
  return { nextHp, defeated: nextHp <= 0 };
}

export function applyPlayerBite(
  bitesTaken: number
): { nextBites: number; defeated: boolean } {
  const nextBites = bitesTaken + 1;
  return { nextBites, defeated: nextBites >= MAX_PLAYER_BITES };
}
