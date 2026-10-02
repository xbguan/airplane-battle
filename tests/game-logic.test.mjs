import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.existsSync(new URL('../index.html', import.meta.url))
  ? fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  : '<script id="game-rules">globalThis.GameRules = {};</script>';
const match = html.match(/<script id="game-rules">([\s\S]*?)<\/script>/);
const context = {};
vm.createContext(context);
vm.runInContext(match?.[1] || 'globalThis.GameRules = {};', context);
const rules = context.GameRules;
const plain = value => JSON.parse(JSON.stringify(value));

test('enemy statistics match the approved combat rules', () => {
  assert.deepEqual(plain(rules.enemyStats), {
    eagle: { hp: 20, damage: 10 },
    drone: { hp: 30, damage: 30 },
    bat: { hp: 10, dps: 10 },
    wizard: { hp: 50, damage: 30 }
  });
});

test('weapon damage and upgrade levels are capped for V2', () => {
  assert.equal(rules.maxAttackLevel(), 5);
  assert.equal(rules.maxWeaponLevel('laser'), 3);
  assert.equal(rules.bulletDamage(0), 2);
  assert.equal(rules.bulletDamage(5), 12);
  assert.equal(rules.bulletDamage(99), 12);
  assert.equal(rules.specialDamage('homing', 1), 45);
  assert.equal(rules.specialDamage('homing', 3), 85);
  assert.equal(rules.specialDamage('laser', 3), 65);
  assert.equal(rules.canUpgrade(5, 3, 'laser'), false);
});

test('V2 boss and enemy difficulty scales by defeated bosses', () => {
  assert.deepEqual(plain(rules.bossHealthRange(1)), [160, 220]);
  assert.deepEqual(plain(rules.bossHealthRange(3)), [336, 463]);
  assert.deepEqual(plain(rules.difficulty(0)), { hp: 1, speed: 1, spawnInterval: 1.55 });
  assert.deepEqual(plain(rules.difficulty(3)), { hp: 1.36, speed: 1.12, spawnInterval: 1.39 });
  assert.deepEqual(plain(rules.bossScale(20)), { speed: 1.28, cooldown: .6 });
});

test('boss entrance finishes once and does not restart below the old threshold', () => {
  const entering = rules.advanceBossEntrance({ y: 110, entered: false, speedScale: 1 }, .1);
  assert.deepEqual(plain(entering), { y: 119, entered: true });
  const cruising = rules.advanceBossEntrance({ y: 98, entered: true, speedScale: 1 }, .1);
  assert.deepEqual(plain(cruising), { y: 98, entered: true });
});

test('fragment upgrades spend five only after acceptance', () => {
  assert.equal(rules.canUpgrade(4), false);
  assert.equal(rules.canUpgrade(5), true);
  assert.deepEqual(plain(rules.applyFragmentUpgrade(7, 2, false)), { fragments: 7, level: 2 });
  assert.deepEqual(plain(rules.applyFragmentUpgrade(7, 2, true)), { fragments: 2, level: 3 });
});

test('boss drops two fragments for the lower-level incomplete weapon', () => {
  assert.equal(rules.chooseFragmentDrop({ homing: 0, laser: 0 }, { homing: 3, laser: 1 }, .2), 'laser');
  assert.equal(rules.chooseFragmentDrop({ homing: 0, laser: 0 }, { homing: 1, laser: 3 }, .8), 'homing');
  assert.equal(rules.chooseFragmentDrop({ homing: 0, laser: 0 }, { homing: 1, laser: 1 }, .2), 'homing');
  assert.equal(rules.chooseFragmentDrop({ homing: 0, laser: 0 }, { homing: 1, laser: 1 }, .8), 'laser');
  assert.equal(rules.chooseFragmentDrop({ homing: 0, laser: 0 }, { homing: 3, laser: 3 }, .5), null);
  assert.deepEqual(plain(rules.applyAttackUpgrade(50, 5)), { xp: 50, level: 5, upgraded: false });
});

test('special weapon cadence prevents continuous laser damage', () => {
  assert.equal(rules.specialWeaponInterval('homing'), 1.5);
  assert.equal(rules.specialWeaponInterval('laser'), 2);
});

test('attack upgrade spends exactly fifty experience', () => {
  assert.deepEqual(plain(rules.applyAttackUpgrade(49, 2)), { xp: 49, level: 2, upgraded: false });
  assert.deepEqual(plain(rules.applyAttackUpgrade(75, 2)), { xp: 25, level: 3, upgraded: true });
});

test('kill rewards and boss trigger use normal-kill progress', () => {
  assert.equal(rules.killExperience('enemy', 999), 5);
  assert.equal(rules.killExperience('boss', 87), 87);
  assert.equal(rules.shouldSpawnBoss(9), false);
  assert.equal(rules.shouldSpawnBoss(10), true);
  assert.equal(rules.shouldSpawnBoss(20), true);
});

test('player coordinates remain inside the logical battlefield', () => {
  assert.deepEqual(plain(rules.clampPoint(-5, 900, 1280, 720, 40)), { x: 40, y: 680 });
  assert.deepEqual(plain(rules.clampPoint(640, 360, 1280, 720, 40)), { x: 640, y: 360 });
});

test('circle collision detects overlap without false positives', () => {
  assert.equal(rules.circlesOverlap({ x: 0, y: 0, r: 10 }, { x: 15, y: 0, r: 6 }), true);
  assert.equal(rules.circlesOverlap({ x: 0, y: 0, r: 10 }, { x: 17, y: 0, r: 6 }), false);
});

test('nearest forward target ignores enemies behind the player', () => {
  const targets = [
    { id: 'behind', x: 95, y: 120 },
    { id: 'far', x: 120, y: 10 },
    { id: 'near', x: 104, y: 70 }
  ];
  assert.equal(rules.nearestForwardTarget({ x: 100, y: 100 }, targets).id, 'near');
  assert.equal(rules.nearestForwardTarget({ x: 100, y: 0 }, targets), null);
});

test('normal kills grant five experience and queue each tenth boss', () => {
  assert.deepEqual(
    plain(rules.awardNormalKill({ xp: 45, normalKills: 9 })),
    { xp: 50, normalKills: 10, bossPending: true }
  );
  assert.deepEqual(
    plain(rules.awardNormalKill({ xp: 10, normalKills: 10 })),
    { xp: 15, normalKills: 11, bossPending: false }
  );
});

test('boss kills grant initial health as experience and two chosen fragments', () => {
  assert.deepEqual(
    plain(rules.awardBossKill({ xp: 20, bosses: 2, fragments: { homing: 1, laser: 4 } }, 87, 'laser')),
    { xp: 107, bosses: 3, fragments: { homing: 1, laser: 6 } }
  );
});

test('normal enemy spawning stops at ten or during a boss fight', () => {
  assert.equal(rules.canSpawnEnemy(9, false), true);
  assert.equal(rules.canSpawnEnemy(10, false), false);
  assert.equal(rules.canSpawnEnemy(0, true), false);
});
