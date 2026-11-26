import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GATE_X,
  MAX_STEPS,
  PTERODACTYL_AGGRO_CHANCE,
  PTERODACTYL_MAX_HP,
  REX_KICK_DAMAGE,
  REX_PUNCH_DAMAGE,
  START_X,
  addItemToInventory,
  applyPlayerBite,
  applyPterodactylDamage,
  calculateSteps,
  canUnlockGate,
  checkHitboxOverlap,
  clampRoadPosition,
  evaluatePterodactylAttackHit,
  isOverAbyss,
  pickPterodactylAttackPattern,
  processKickCombo,
  rollPterodactylAggro,
} from './rules.ts';

test('step counter maps start to 0 and gate to 50', () => {
  assert.equal(calculateSteps(START_X), 0);
  assert.equal(calculateSteps(GATE_X), MAX_STEPS);
  assert.equal(calculateSteps(START_X - 50), 0);
  assert.equal(calculateSteps(GATE_X + 200), MAX_STEPS);
});

test('2.5D road clamping keeps player within cliff road bounds', () => {
  const clampedStart = clampRoadPosition(10, 400, false);
  assert.equal(clampedStart.x, 62);
  assert.equal(clampedStart.y, 528);

  const clampedRight = clampRoadPosition(2600, 650, false);
  assert.equal(clampedRight.x, GATE_X - 18);
  assert.equal(clampedRight.y, 590);
});

test('abyss detection triggers only off-plank while grounded on bridge span', () => {
  assert.equal(isOverAbyss(1150, 558, 0), false);
  assert.equal(isOverAbyss(1150, 520, 0), true);
  assert.equal(isOverAbyss(1150, 595, 0), true);
  assert.equal(isOverAbyss(1150, 520, 35), false);
  assert.equal(isOverAbyss(750, 520, 0), false);
});

test('kick -> tail whip combo triggers on 2nd press within 0.6s window', () => {
  const first = processKickCombo(0, -10, 1.0);
  assert.deepEqual(first, { nextCount: 1, isTailWhip: false });

  const secondFast = processKickCombo(first.nextCount, 1.0, 1.45);
  assert.deepEqual(secondFast, { nextCount: 0, isTailWhip: true });

  const secondLate = processKickCombo(first.nextCount, 1.0, 1.75);
  assert.deepEqual(secondLate, { nextCount: 1, isTailWhip: false });
});

test('inventory enforces 2-slot limit and drops oldest item on overflow', () => {
  const r1 = addItemToInventory([], 'key');
  assert.deepEqual(r1, { nextSlots: ['key'], droppedItem: null, added: true });

  const r2 = addItemToInventory(r1.nextSlots, 'bulb');
  assert.deepEqual(r2, { nextSlots: ['key', 'bulb'], droppedItem: null, added: true });

  const dup = addItemToInventory(r2.nextSlots, 'key');
  assert.equal(dup.added, false);

  assert.equal(canUnlockGate(r2.nextSlots), true);
  assert.equal(canUnlockGate(['bulb']), false);
});

test('hitbox overlap checks 2.5D interaction radius accurately', () => {
  assert.equal(checkHitboxOverlap(771, 548, 100, 810, 555), true);
  assert.equal(checkHitboxOverlap(771, 548, 80, 950, 555), false);
});

test('pterodactyl 1/6 aggro roll and 3 attack pattern selection work accurately', () => {
  assert.equal(rollPterodactylAggro(0.05), true);
  assert.equal(rollPterodactylAggro(PTERODACTYL_AGGRO_CHANCE - 0.001), true);
  assert.equal(rollPterodactylAggro(PTERODACTYL_AGGRO_CHANCE + 0.01), false);
  assert.equal(rollPterodactylAggro(0.9), false);

  assert.equal(pickPterodactylAttackPattern(0.1), 'vertical');
  assert.equal(pickPterodactylAttackPattern(0.45), 'diag_lr');
  assert.equal(pickPterodactylAttackPattern(0.85), 'diag_rl');
});

test('pterodactyl 3-way dodge rules & 2-damage / 3-bite combat resolve accurately', () => {
  // Vertical: standing under column hits, stepping left/right dodges
  assert.equal(evaluatePterodactylAttackHit({ pattern: 'vertical', pteroX: 600, pteroZ: 20, px: 600, pz: 0, vx: 0 }), true);
  assert.equal(evaluatePterodactylAttackHit({ pattern: 'vertical', pteroX: 600, pteroZ: 20, px: 645, pz: 0, vx: 200 }), false);

  // Diagonal left-to-right: jumping & dodging left avoids hit
  assert.equal(evaluatePterodactylAttackHit({ pattern: 'diag_lr', pteroX: 600, pteroZ: 20, px: 600, pz: 0, vx: 0 }), true);
  assert.equal(evaluatePterodactylAttackHit({ pattern: 'diag_lr', pteroX: 600, pteroZ: 20, px: 600, pz: 24, vx: -180 }), false);

  // Diagonal right-to-left: jumping & moving right avoids hit
  assert.equal(evaluatePterodactylAttackHit({ pattern: 'diag_rl', pteroX: 600, pteroZ: 20, px: 600, pz: 0, vx: 0 }), true);
  assert.equal(evaluatePterodactylAttackHit({ pattern: 'diag_rl', pteroX: 600, pteroZ: 20, px: 600, pz: 24, vx: 180 }), false);

  // Damage 2 on punch & kick defeats 4-HP pterodactyl in 2 hits
  const hit1 = applyPterodactylDamage(PTERODACTYL_MAX_HP, REX_PUNCH_DAMAGE);
  assert.deepEqual(hit1, { nextHp: 2, defeated: false });
  const hit2 = applyPterodactylDamage(hit1.nextHp, REX_KICK_DAMAGE);
  assert.deepEqual(hit2, { nextHp: 0, defeated: true });

  // Player defeated on 3rd bite
  assert.deepEqual(applyPlayerBite(0), { nextBites: 1, defeated: false });
  assert.deepEqual(applyPlayerBite(1), { nextBites: 2, defeated: false });
  assert.deepEqual(applyPlayerBite(2), { nextBites: 3, defeated: true });
});
