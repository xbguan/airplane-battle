import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.existsSync(new URL('../index.html', import.meta.url))
  ? fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  : '<script id="game-rules">globalThis.GameRules = {};</script>';
const assetCatalog = fs.readFileSync(new URL('../全部资产清单.html', import.meta.url), 'utf8');
const foleyManifest = JSON.parse(fs.readFileSync(new URL('../docs/superpowers/specs/previews/foley-audio/manifest.json', import.meta.url), 'utf8'));
const removedAssetPaths = [
  'assets/source/master-pixel-assets.png',
  ...Array.from({ length: 6 }, (_, index) => `assets/scenery/topdown-segment-0${index + 1}.png`),
  ...Array.from({ length: 6 }, (_, index) => `assets/scenery/perspective-segment-0${index + 1}.png`),
  'assets/scenery/sky.png', 'assets/scenery/cloud-01.png', 'assets/scenery/cliff-mountain.png',
  'assets/scenery/grassland.png', 'assets/scenery/river-lake.png', 'assets/scenery/waterfall.png',
  'assets/scenery/pine-tree.png', 'assets/scenery/broadleaf-tree.png', 'assets/scenery/bush-flower.png', 'assets/scenery/rock.png',
  'assets/shadows/player-shadow.png', 'assets/shadows/boss-shadow.png', 'assets/shadows/enemy-shadow.png',
  'assets/weapons/player-bullet.png', 'assets/weapons/magic-orb.png', 'assets/weapons/fragment-homing.png',
  'assets/weapons/fragment-laser.png', 'assets/weapons/hit-spark.png', 'assets/weapons/explosion.png', 'assets/weapons/player-muzzle-flash.png'
];
const retainedBackgroundPaths = [
  'assets/scenery/background-topdown.png', 'assets/scenery/background-perspective.png'
];
const match = html.match(/<script id="game-rules">([\s\S]*?)<\/script>/);
const context = {};
vm.createContext(context);
vm.runInContext(match?.[1] || 'globalThis.GameRules = {};', context);
const rules = context.GameRules;
const plain = value => JSON.parse(JSON.stringify(value));

function createAudioRuntime(sampleRate = 44100) {
  const buffers = [];
  const sources = [];
  let now = 200;
  const audio = {
    sampleRate,
    destination: {},
    createBuffer(channels, length, rate) {
      const data = new Float32Array(length);
      const buffer = { channels, length, sampleRate: rate, getChannelData: () => data };
      buffers.push(buffer);
      return buffer;
    },
    createBufferSource() {
      const source = {
        buffer: null, connected: false, started: false, disconnected: false,
        connect(destination) { this.connected = destination === audio.destination; },
        start() { this.started = true; },
        disconnect() { this.disconnected = true; }
      };
      sources.push(source);
      return source;
    }
  };
  const runtime = vm.createContext({
    audioContext: audio,
    soundBuffers: {},
    soundCooldowns: {},
    machinegunSoundIndex: 0,
    window: {},
    performance: { now: () => now }
  });
  for (const name of ['ensureAudio', 'createFoleySamples', 'synthesizeFirearmSound', 'synthesizeMechanicalSound', 'createSoundBuffer', 'playSound']) {
    const start = html.indexOf(`  function ${name}(`);
    assert.ok(start >= 0, `Missing production function: ${name}`);
    vm.runInContext(html.slice(start, html.indexOf('\n  function ', start + 1)), runtime);
  }
  return { runtime, buffers, sources, setNow(value) { now = value; } };
}

function decodeMonoPcm16Wav(fileUrl) {
  const wav = fs.readFileSync(fileUrl);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt16LE(34), 16);
  const samples = new Float32Array((wav.length - 44) / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = wav.readInt16LE(44 + i * 2) / 32768;
  return { sampleRate: wav.readUInt32LE(24), samples };
}

function legacySoundSamples([startFrequency, endFrequency, duration, volume, wave], sampleRate) {
  const length = Math.ceil(sampleRate * duration);
  const samples = new Float32Array(length);
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const progress = i / length;
    phase += Math.PI * 2 * (startFrequency + (endFrequency - startFrequency) * progress) / sampleRate;
    const envelope = (1 - progress) ** 2;
    const sample = wave === 'square'
      ? (Math.sin(phase) >= 0 ? 1 : -1)
      : wave === 'saw'
        ? ((phase / Math.PI) % 2) - 1
        : Math.asin(Math.sin(phase)) * 2 / Math.PI;
    samples[i] = sample * envelope * volume;
  }
  return samples;
}

test('missile launch buffer matches the approved 0.4 second preview', () => {
  const { runtime } = createAudioRuntime();
  const approved = decodeMonoPcm16Wav(new URL('../docs/superpowers/specs/previews/missile-audio/candidate.wav', import.meta.url));
  const actual = vm.runInContext(`createSoundBuffer('missile-launch').getChannelData(0)`, runtime);
  assert.equal(approved.sampleRate, 44100);
  assert.equal(actual.length, 17640);
  assert.equal(actual.length, approved.samples.length);
  for (let i = 0; i < actual.length; i++) {
    assert.ok(Math.abs(actual[i] - approved.samples[i]) <= 1 / 32768 + 1e-7, `PCM differs at sample ${i}`);
  }
});

test('playing missile launch reuses its cached buffer and disconnects ended sources', () => {
  const { runtime, buffers, sources, setNow } = createAudioRuntime();
  vm.runInContext(`playSound('missile-launch')`, runtime);
  setNow(400);
  vm.runInContext(`playSound('missile-launch')`, runtime);
  assert.equal(buffers.length, 1);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].buffer, sources[1].buffer);
  assert.equal(sources.every(source => source.connected && source.started), true);
  sources[0].onended();
  sources[1].onended();
  assert.equal(sources.every(source => source.disconnected), true);
});

test('foley synthesis leaves the retained laser, wizard, blue and boss buffers unchanged', () => {
  const { runtime } = createAudioRuntime();
  for (const [name, definition] of [
    ['laser', [760, 1050, .11, .13, 'saw']],
    ['wizard-shot', [420, 760, .18, .16, 'triangle']],
    ['blue-shot', [820, 1280, .13, .16, 'saw']],
    ['boss', [95, 40, .58, .3, 'saw']]
  ]) {
    const actual = vm.runInContext(`createSoundBuffer('${name}').getChannelData(0)`, runtime);
    const expected = legacySoundSamples(definition, 44100);
    assert.deepEqual(Array.from(actual), Array.from(expected));
  }
});

test('all confirmed foley buffers match their approved PCM previews', () => {
  const { runtime } = createAudioRuntime();
  for (const item of [...foleyManifest.main, ...foleyManifest.variants].filter(item => !['weapon-switch', 'hurt'].includes(item.key))) {
    const approved = decodeMonoPcm16Wav(new URL(`../docs/superpowers/specs/previews/foley-audio/${item.file}`, import.meta.url));
    const actual = vm.runInContext(`createSoundBuffer('${item.key}').getChannelData(0)`, runtime);
    assert.equal(approved.sampleRate, 44100);
    assert.equal(actual.length, approved.samples.length, `${item.key} length`);
    for (let i = 0; i < actual.length; i++) {
      assert.ok(Math.abs(actual[i] - approved.samples[i]) <= 1 / 32768 + 1e-7, `${item.key} PCM differs at sample ${i}`);
    }
  }
});

test('foley synthesis stays finite and closes cleanly at 44.1 and 48 kHz', () => {
  for (const sampleRate of [44100, 48000]) {
    const { runtime } = createAudioRuntime(sampleRate);
    for (const item of [...foleyManifest.main, ...foleyManifest.variants]) {
      const samples = vm.runInContext(`createFoleySamples('${item.key}', ${sampleRate})`, runtime);
      assert.equal(samples.length, Math.ceil(item.duration * sampleRate), `${item.key} length at ${sampleRate}`);
      assert.equal(samples[0], 0, `${item.key} first sample at ${sampleRate}`);
      assert.equal(samples.at(-1), 0, `${item.key} last sample at ${sampleRate}`);
      assert.equal(Array.from(samples).every(Number.isFinite), true, `${item.key} finite at ${sampleRate}`);
    }
  }
});

test('machinegun rotates three cached variants while preserving cooldown and source cleanup', () => {
  const { runtime, buffers, sources, setNow } = createAudioRuntime();
  for (const now of [200, 300, 400]) {
    setNow(now);
    vm.runInContext(`playSound('machinegun')`, runtime);
  }
  setNow(450);
  vm.runInContext(`playSound('machinegun')`, runtime);
  setNow(500);
  vm.runInContext(`playSound('machinegun')`, runtime);
  assert.equal(buffers.length, 3);
  assert.equal(sources.length, 4);
  assert.notEqual(sources[0].buffer, sources[1].buffer);
  assert.notEqual(sources[1].buffer, sources[2].buffer);
  assert.equal(sources[0].buffer, sources[3].buffer);
  assert.equal(sources.every(source => source.connected && source.started), true);
  sources.forEach(source => source.onended());
  assert.equal(sources.every(source => source.disconnected), true);
});

test('magic break sound is rate limited for clustered projectile hits', () => {
  const { runtime, sources, setNow } = createAudioRuntime();
  setNow(200);
  vm.runInContext(`playSound('magic-break')`, runtime);
  setNow(250);
  vm.runInContext(`playSound('magic-break')`, runtime);
  setNow(310);
  vm.runInContext(`playSound('magic-break')`, runtime);
  assert.equal(sources.length, 2);
});

function runProductionFunctions(runtime, names) {
  for (const name of names) {
    const start = html.indexOf(`  function ${name}(`);
    assert.ok(start >= 0, `Missing production function: ${name}`);
    vm.runInContext(html.slice(start, html.indexOf('\n  function ', start + 1)), runtime);
  }
}

test('enemy hit sounds follow impact type instead of display color', () => {
  const sounds = [];
  const runtime = vm.createContext({
    game: { running: true, stage: 'combat' },
    ImpactVisuals: { bullet: 'hitMachinegun', homing: 'hitMissile', laser: 'hitLaser' },
    playSound: name => sounds.push(name), addFloater() {}, addImpact() {}, killEnemy() {}
  });
  runProductionFunctions(runtime, ['damageEnemy']);
  for (const [impactKey, color] of [['hitMissile', '#fff'], ['hitLaser', '#fff'], ['hitMachinegun', '#7ff8ff']]) {
    runtime.enemy = { hp: 100, dead: false, x: 0, y: 0, r: 1 };
    runtime.impactKey = impactKey;
    runtime.color = color;
    vm.runInContext('damageEnemy(enemy, 1, color, impactKey)', runtime);
  }
  assert.deepEqual(sounds, ['missile-hit', 'laser', 'hit']);
});

test('enemy deaths use body-specific sounds and parts sound only when awarded', () => {
  const sounds = [];
  const runtime = vm.createContext({
    game: { running: true, stage: 'combat', xp: 0, bosses: 0, normalKills: 0, weaponParts: 0, weaponLevels: { homing: 0, laser: 0 }, shake: 0, boss: null, enemyBullets: [], delayedAttacks: [] },
    GameRules: {
      awardBossKill: state => ({ xp: state.xp + 70, bosses: state.bosses + 1, weaponParts: state.weaponParts + 3 }),
      awardNormalKill: state => ({ xp: state.xp + 5, normalKills: state.normalKills + 1, bossPending: false }),
      canUpgrade: () => false
    },
    ui: { 'boss-panel': { classList: { add() {} } } },
    playSound: name => sounds.push(name), addParticle() {}, showToast() {}, updateHud() {}, spawnBoss() {}, openGrowth() {}
  });
  runProductionFunctions(runtime, ['killEnemy']);
  for (const type of ['drone', 'eagle', 'bat', 'wizard']) {
    runtime.enemy = { type, x: 0, y: 0, initialHp: 20, dead: false };
    vm.runInContext('killEnemy(enemy)', runtime);
  }
  runtime.enemy = { type: 'boss', x: 0, y: 0, initialHp: 100, dead: false };
  vm.runInContext('killEnemy(enemy)', runtime);
  runtime.game.stage = 'combat';
  runtime.GameRules.awardBossKill = state => ({ xp: state.xp + 90, bosses: state.bosses + 1, weaponParts: state.weaponParts });
  runtime.enemy = { type: 'boss', x: 0, y: 0, initialHp: 100, dead: false };
  vm.runInContext('killEnemy(enemy)', runtime);
  assert.deepEqual(sounds, ['explode-mechanical', 'explode-soft', 'explode-soft', 'explode-soft', 'boss-explode', 'fragment', 'boss-explode']);
});

test('game over sound plays only on the first effective end transition', () => {
  const sounds = [];
  const runtime = vm.createContext({
    game: { running: true, paused: true, normalKills: 2, bosses: 1, highestBoss: 1, attackLevel: 3, weaponLevels: { homing: 1, laser: 0 }, weaponParts: 2, endless: false, delayedAttacks: [], enemyBullets: [] },
    GameRules: { bulletDamage: () => 8 }, playSound: name => sounds.push(name),
    ui: {
      'result-title': {}, 'result-monsters': {}, 'result-bosses': {}, 'result-highest-boss': {}, 'result-damage': {}, 'result-homing': {}, 'result-laser': {}, 'result-parts': {},
      'game-over': { classList: { remove() {} } }
    }
  });
  runProductionFunctions(runtime, ['updateResults', 'endGame']);
  vm.runInContext('endGame(); endGame();', runtime);
  assert.deepEqual(sounds, ['game-over']);
});

test('ending a completed campaign does not play the defeat sound', () => {
  const sounds = [];
  const runtime = vm.createContext({
    game: { running: true, paused: true, normalKills: 50, bosses: 5, highestBoss: 5, attackLevel: 3, weaponLevels: { homing: 1, laser: 1 }, weaponParts: 4, endless: false, delayedAttacks: [], enemyBullets: [] },
    GameRules: { bulletDamage: () => 8 }, playSound: name => sounds.push(name),
    ui: {
      'result-title': {}, 'result-monsters': {}, 'result-bosses': {}, 'result-highest-boss': {}, 'result-damage': {}, 'result-homing': {}, 'result-laser': {}, 'result-parts': {},
      'game-over': { classList: { remove() {} } }
    }
  });
  runProductionFunctions(runtime, ['updateResults', 'endGame']);
  vm.runInContext(`endGame('victory')`, runtime);
  assert.deepEqual(sounds, []);
});

test('brown boss charge sound fires once when charging starts', () => {
  const sounds = [];
  const runtime = vm.createContext({
    game: { player: { x: 640, y: 600 } }, H: 720, W: 1280,
    GameRules: { advanceBossEntrance: boss => ({ y: boss.y, entered: true }), circlesOverlap: () => false },
    playSound: name => sounds.push(name), damagePlayer() {}, shootEnemyBullet() {},
    EnemyProjectileVisuals: { brown: 'orangeBossShell' }, random: (min, max) => (min + max) / 2
  });
  runProductionFunctions(runtime, ['aimAngle', 'updateBoss']);
  runtime.boss = { type: 'boss', variant: 'brown', age: 0, speedScale: 1, x: 640, y: 120, entered: true, shootTimer: 5, actionTimer: 0, charging: false, vx: 0, vy: 0, cooldownScale: 1 };
  vm.runInContext('updateBoss(boss, .016); updateBoss(boss, .016);', runtime);
  assert.equal(runtime.boss.charging, true);
  assert.deepEqual(sounds, ['boss-charge']);
});

test('blue boss in the lower activity band retreats only to that band top when the player enters the upper half', () => {
  const runtime = vm.createContext({
    game: { time: 10, player: { x: 640, y: 300 }, enemyBullets: [], delayedAttacks: [] }, H: 720, W: 1280,
    GameRules: { advanceBossEntrance: boss => ({ y: boss.y, entered: true }), circlesOverlap: () => false },
    playSound() {}, damagePlayer() {}, shootEnemyBullet() {}, EnemyProjectileVisuals: { blue: 'blueBossBolt' }
  });
  runProductionFunctions(runtime, ['aimAngle', 'fireBlueVolley', 'updateBoss']);
  runtime.boss = { id: 1, type: 'boss', variant: 'blue', number: 7, mechanismLevel: 3, age: 0, speedScale: 1, x: 640, y: 250, r: 60, hp: 100, maxHp: 100, entered: true, shootTimer: 99, actionTimer: 99, cooldownScale: 1, baseAttackCount: 0, blueBand: 'lower', bandTimer: 5 };
  vm.runInContext('updateBoss(boss, 1);', runtime);
  assert.ok(runtime.boss.y >= 720 * .26, `lower-band boss escaped to y=${runtime.boss.y}`);
  assert.ok(runtime.boss.y < 250);
});

test('boss age advances exactly once per updateEnemy call', () => {
  const runtime = vm.createContext({
    game: { time: 0, player: { x: 640, y: 600 }, enemyBullets: [], delayedAttacks: [] }, H: 720, W: 1280,
    GameRules: { advanceBossEntrance: boss => ({ y: boss.y, entered: false }), circlesOverlap: () => false },
    playSound() {}, damagePlayer() {}, shootEnemyBullet() {}, EnemyProjectileVisuals: {}
  });
  runProductionFunctions(runtime, ['aimAngle', 'fireBrownVolley', 'fireBlueVolley', 'updateBoss', 'updateEnemy']);
  runtime.boss = { type: 'boss', variant: 'brown', age: 0, speedScale: 1.18, x: 640, y: -100, entered: false };
  vm.runInContext('updateEnemy(boss, .5);', runtime);
  assert.equal(runtime.boss.age, .59);
});

test('dead bosses never run another update or fire a ghost attack', () => {
  const shots = [];
  const runtime = vm.createContext({
    game: { time: 0, player: { x: 640, y: 600 }, enemyBullets: [], delayedAttacks: [] }, H: 720, W: 1280,
    GameRules: { advanceBossEntrance: boss => ({ y: boss.y, entered: true }), circlesOverlap: () => false },
    playSound() {}, damagePlayer() {}, shootEnemyBullet(...args) { shots.push(args); }, EnemyProjectileVisuals: { brown: 'orangeBossShell' }
  });
  runProductionFunctions(runtime, ['aimAngle', 'fireBrownVolley', 'fireBlueVolley', 'updateBoss', 'updateEnemy']);
  runtime.boss = { dead: true, type: 'boss', variant: 'brown', age: 2, speedScale: 1, x: 640, y: 119, entered: true, charging: false, shootTimer: 0, actionTimer: 99, cooldownScale: 1, baseAttackCount: 0, mechanismLevel: 0 };
  vm.runInContext('updateEnemy(boss, .5);', runtime);
  assert.equal(runtime.boss.age, 2);
  assert.equal(shots.length, 0);
});

test('brown boss reenters from the top after charging out through any battlefield edge', () => {
  for (const [label, position, velocity] of [
    ['top', { x: 640, y: -101 }, { vx: 0, vy: -270 }],
    ['left', { x: -101, y: 360 }, { vx: -270, vy: 0 }],
    ['bottom', { x: 640, y: 821 }, { vx: 0, vy: 270 }]
  ]) {
    const runtime = vm.createContext({
      game: { time: 0, player: { x: 640, y: 600 }, enemyBullets: [], delayedAttacks: [] }, H: 720, W: 1280,
      GameRules: { advanceBossEntrance: boss => ({ y: boss.y, entered: true }), circlesOverlap: () => false },
      playSound() {}, damagePlayer() {}, shootEnemyBullet() {}, EnemyProjectileVisuals: { brown: 'orangeBossShell' }, random: (min, max) => (min + max) / 2
    });
    runProductionFunctions(runtime, ['aimAngle', 'fireBrownVolley', 'updateBoss']);
    runtime.boss = { id: 1, type: 'boss', variant: 'brown', number: 1, mechanismLevel: 0, age: 0, speedScale: 1, ...position, r: 60, hp: 200, maxHp: 200, entered: true, charging: true, ...velocity, shootTimer: 99, actionTimer: 99, cooldownScale: 1, baseAttackCount: 0 };
    vm.runInContext('updateBoss(boss, .01);', runtime);
    assert.equal(runtime.boss.charging, false, label);
    assert.equal(runtime.boss.entered, false, label);
    assert.equal(runtime.boss.y, -80, label);
  }
});

test('brown boss mechanisms add a five-shot reentry volley and make each third base volley seven shots', () => {
  const shots = [];
  const runtime = vm.createContext({
    game: { time: 0, player: { x: 640, y: 600 }, enemyBullets: [], delayedAttacks: [] }, H: 720, W: 1280,
    GameRules: { advanceBossEntrance: boss => ({ y: 119, entered: true }), circlesOverlap: () => false },
    playSound() {}, damagePlayer() {}, shootEnemyBullet(...args) { shots.push(args); }, EnemyProjectileVisuals: { brown: 'orangeBossShell' }, random: (min, max) => (min + max) / 2
  });
  runProductionFunctions(runtime, ['aimAngle', 'fireBrownVolley', 'updateBoss']);
  runtime.boss = { id: 1, type: 'boss', variant: 'brown', number: 7, mechanismLevel: 3, age: 0, speedScale: 1, x: 640, y: -80, r: 60, hp: 400, maxHp: 800, entered: false, reentered: true, charging: false, shootTimer: 99, actionTimer: 99, cooldownScale: 1, baseAttackCount: 2 };
  vm.runInContext('updateBoss(boss, .01);', runtime);
  assert.equal(shots.length, 5);
  assert.equal(runtime.boss.baseAttackCount, 2);
  shots.length = 0; runtime.boss.shootTimer = 0;
  vm.runInContext('updateBoss(boss, .01);', runtime);
  assert.equal(shots.length, 7);
  assert.equal(runtime.boss.baseAttackCount, 3);
});

test('blue boss mechanisms add a center shot and schedule a nonrecursive delayed pair only below half health', () => {
  const shots = [];
  const runtime = vm.createContext({
    game: { time: 12, player: { x: 640, y: 600 }, enemyBullets: [], delayedAttacks: [] }, H: 720, W: 1280,
    GameRules: { advanceBossEntrance: boss => ({ y: boss.y, entered: true }), circlesOverlap: () => false },
    playSound() {}, damagePlayer() {}, shootEnemyBullet(...args) { shots.push(args); }, EnemyProjectileVisuals: { blue: 'blueBossBolt' }
  });
  runProductionFunctions(runtime, ['aimAngle', 'fireBlueVolley', 'updateBoss']);
  runtime.boss = { id: 1, type: 'boss', variant: 'blue', number: 7, mechanismLevel: 3, age: 0, speedScale: 1, x: 640, y: 120, r: 60, hp: 500, maxHp: 1000, entered: true, shootTimer: 0, actionTimer: 99, cooldownScale: 1, baseAttackCount: 2, blueBand: 'upper', bandTimer: 5 };
  vm.runInContext('updateBoss(boss, .01);', runtime);
  assert.equal(shots.length, 3);
  assert.equal(runtime.game.delayedAttacks.length, 0);
  shots.length = 0; runtime.boss.hp = 499; runtime.boss.baseAttackCount = 3; runtime.boss.shootTimer = 0;
  vm.runInContext('updateBoss(boss, .01);', runtime);
  assert.equal(shots.length, 2);
  assert.deepEqual(plain(runtime.game.delayedAttacks), [{ kind: 'blue-double', due: 12.35, bossId: 1 }]);
  assert.equal(runtime.boss.baseAttackCount, 4);
});

test('experience conversion plays a parts reward sound when an upgrade creates parts', () => {
  const sounds = [];
  const runtime = vm.createContext({
    game: { stage: 'growth', xp: 425, attackLevel: 4, weaponParts: 1, weaponLevels: { homing: 2, laser: 3 } },
    GameRules: rules, playSound: name => sounds.push(name), showToast() {}, updateGrowth() {}, updateHud() {}
  });
  runProductionFunctions(runtime, ['upgradeAttack']);
  vm.runInContext('upgradeAttack()', runtime);
  assert.equal(runtime.game.attackLevel, 5);
  assert.equal(runtime.game.xp, 25);
  assert.equal(runtime.game.weaponParts, 3);
  assert.deepEqual(sounds, ['upgrade', 'fragment']);
});

test('breaking a destructible magic projectile plays once while other shots stay silent', () => {
  const sounds = [];
  const runtime = vm.createContext({
    game: { bullets: [], enemyBullets: [], enemies: [] },
    GameRules: { circlesOverlap: () => true },
    playSound: name => sounds.push(name), addParticle() {}, damageEnemy() {}, ImpactVisuals: {}
  });
  runProductionFunctions(runtime, ['checkCollisions']);
  runtime.game.bullets = [{ dead: false }];
  runtime.game.enemyBullets = [{ dead: false, destructible: true, x: 1, y: 2 }];
  vm.runInContext('checkCollisions()', runtime);
  runtime.game.bullets = [{ dead: false }];
  runtime.game.enemyBullets = [{ dead: false, destructible: false, x: 1, y: 2 }];
  vm.runInContext('checkCollisions()', runtime);
  assert.deepEqual(sounds, ['magic-break']);
});

test('weapon switch sound requires an unlocked change while same-weapon clicks still reset timers', () => {
  const sounds = [];
  const runtime = vm.createContext({
    game: { activeWeapon: 'homing', weaponLevels: { homing: 1, laser: 1 }, specialTimer: 8, laserTimer: 9, laserTargetId: 2 },
    playSound: name => sounds.push(name), showToast() {}, updateHud() {}
  });
  runProductionFunctions(runtime, ['setSpecialWeapon']);
  vm.runInContext(`setSpecialWeapon('homing')`, runtime);
  assert.equal(runtime.game.specialTimer, 0);
  assert.equal(runtime.game.laserTimer, 0);
  assert.equal(runtime.game.laserTargetId, null);
  assert.deepEqual(sounds, []);
  runtime.game.specialTimer = 8;
  vm.runInContext(`setSpecialWeapon('laser')`, runtime);
  assert.equal(runtime.game.activeWeapon, 'laser');
  assert.deepEqual(sounds, ['weapon-switch']);
  runtime.game.weaponLevels.homing = 0;
  vm.runInContext(`setSpecialWeapon('homing')`, runtime);
  assert.equal(runtime.game.activeWeapon, 'laser');
  assert.deepEqual(sounds, ['weapon-switch']);
});

for (const [name, actor] of [
  ['drawEagle', { phase: 'dive' }],
  ['drawBoss', { variant: 'brown', charging: true }]
]) {
  test(`${name} faces its travel direction during a downward charge`, () => {
    let rotation;
    const runtime = vm.createContext({
      drawShadow() {},
      drawAsset(key, x, y, width, height, angle) { rotation = angle; }
    });
    const start = html.indexOf(`  function ${name}(`);
    assert.ok(start >= 0);
    vm.runInContext(html.slice(start, html.indexOf('\n  function ', start + 1)), runtime);
    for (const [vx, vy] of [[0, 1], [-1, 1], [1, 1]]) {
      runtime.actor = { ...actor, x: 640, y: 120, vx, vy };
      vm.runInContext(`${name}(actor);`, runtime);
      // Both source images face down: rotating (0, 1) must align with velocity.
      const length = Math.hypot(vx, vy);
      assert.ok(Math.abs(-Math.sin(rotation) - vx / length) < 1e-10, `Wrong horizontal facing for ${vx}, ${vy}`);
      assert.ok(Math.abs(Math.cos(rotation) - vy / length) < 1e-10, `Wrong vertical facing for ${vx}, ${vy}`);
    }
  });
}

for (const variant of ['blue', 'brown']) {
  test(`${variant} boss HUD is hidden after death and restart, then reappears for the next boss`, () => {
    const elements = new Map();
    const makeElement = () => {
      const classes = new Set(['hidden']);
      return {
        style: {}, textContent: '',
        classList: {
          add: name => classes.add(name),
          remove: name => classes.delete(name),
          contains: name => classes.has(name),
          toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }
        },
        querySelector: makeElement
      };
    };
    const ui = new Proxy({}, { get(_, id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    } });
    const runtime = vm.createContext({
      ui, window: {}, performance: { now: () => 0 }, W: 1280, H: 720,
      nextId: 1, assetsReady: true, lastTime: 0, game: null,
      createScenery: () => ({}), drawScene() {}, playSound() {}, showToast() {},
      addParticle() {}, addFloater() {}, random: (min, max) => (min + max) / 2
    });
    vm.runInContext(match[1], runtime);
    for (const name of ['resetGame', 'startGame', 'spawnBoss', 'damagePlayer', 'updateHud', 'updateResults', 'endGame']) {
      const start = html.indexOf(`  function ${name}(`);
      assert.ok(start >= 0, `Missing production function: ${name}`);
      vm.runInContext(html.slice(start, html.indexOf('\n  function ', start + 1)), runtime);
    }
    vm.runInContext(`Math.random = () => ${variant === 'blue' ? '.75' : '.25'}; startGame(); spawnBoss(); game.boss.hp = game.boss.maxHp * .4; updateHud();`, runtime);
    assert.equal(runtime.game.boss.variant, variant);
    assert.equal(ui['boss-panel'].classList.contains('hidden'), false);
    assert.equal(ui['boss-fill'].style.width, '40%');
    vm.runInContext('damagePlayer(100);', runtime);
    assert.equal(runtime.game.running, false);
    vm.runInContext('startGame();', runtime);
    assert.equal(runtime.game.boss, null);
    assert.equal(runtime.game.enemies.length, 0);
    assert.equal(ui['boss-panel'].classList.contains('hidden'), true);
    vm.runInContext('spawnBoss(); updateHud();', runtime);
    assert.equal(ui['boss-panel'].classList.contains('hidden'), false);
    assert.equal(ui['boss-fill'].style.width, '100%');
  });
}

test('enemy statistics use collision damage names for all four normal enemies', () => {
  assert.deepEqual(plain(rules.enemyStats), {
    eagle: { hp: 20, damage: 10 },
    drone: { hp: 30, damage: 30 },
    bat: { hp: 10, damage: 10 },
    wizard: { hp: 50, damage: 30 }
  });
});

test('weapon damage and upgrade levels keep their approved caps in V3', () => {
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

test('V3 boss health is linear while speed and cooldown have explicit caps', () => {
  assert.deepEqual(plain(rules.bossHealthRange(1)), [180, 220]);
  assert.deepEqual(plain(rules.bossHealthRange(3)), [380, 460]);
  assert.deepEqual(plain(rules.bossHealthRange(8)), [880, 1060]);
  assert.deepEqual(plain(rules.difficulty(0)), { hp: 1, speed: 1, spawnInterval: 1.55 });
  assert.deepEqual(plain(rules.difficulty(3)), { hp: 1.36, speed: 1.12, spawnInterval: 1.39 });
  assert.deepEqual(plain(rules.bossScale(20)), { speed: 1.18, cooldown: .8 });
});

test('V3 boss mechanism levels change every two bosses and cap at three', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 20].map(rules.bossMechanismLevel), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('boss entrance finishes once and does not restart below the old threshold', () => {
  const entering = rules.advanceBossEntrance({ y: 110, entered: false, speedScale: 1 }, .1);
  assert.deepEqual(plain(entering), { y: 119, entered: true });
  const cruising = rules.advanceBossEntrance({ y: 98, entered: true, speedScale: 1 }, .1);
  assert.deepEqual(plain(cruising), { y: 98, entered: true });
});

test('universal weapon parts spend five only after an accepted special upgrade', () => {
  assert.equal(rules.canUpgrade(4), false);
  assert.equal(rules.canUpgrade(5), true);
  assert.deepEqual(plain(rules.applyPartsUpgrade(7, 2, false)), { parts: 7, level: 2, upgraded: false });
  assert.deepEqual(plain(rules.applyPartsUpgrade(7, 2, true)), { parts: 2, level: 3, upgraded: true });
});

test('machinegun upgrades use the V3 increasing cost sequence', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(rules.attackUpgradeCost), [50, 75, 100, 150, 200, null]);
  assert.deepEqual(plain(rules.applyAttackUpgrade(99, 2)), { xp: 99, level: 2, upgraded: false });
  assert.deepEqual(plain(rules.applyAttackUpgrade(100, 2)), { xp: 0, level: 3, upgraded: true });
  assert.deepEqual(plain(rules.applyAttackUpgrade(200, 5)), { xp: 200, level: 5, upgraded: false });
  assert.equal([0, 1, 2, 3, 4].reduce((sum, level) => sum + rules.attackUpgradeCost(level), 0), 575);
});

test('maxed machinegun converts each hundred experience to one universal part', () => {
  assert.deepEqual(plain(rules.convertMaxedExperience(225, { homing: 2, laser: 3 }, 4, 4)), { xp: 225, parts: 4 });
  assert.deepEqual(plain(rules.convertMaxedExperience(225, { homing: 2, laser: 3 }, 5, 4)), { xp: 25, parts: 6 });
  assert.deepEqual(plain(rules.convertMaxedExperience(225, { homing: 3, laser: 3 }, 5, 4)), { xp: 225, parts: 4 });
});

test('special weapon cadence prevents continuous laser damage', () => {
  assert.equal(rules.specialWeaponInterval('homing'), 1.5);
  assert.equal(rules.specialWeaponInterval('laser'), 1.5);
});

test('kill rewards decouple boss experience from health and cap at two hundred', () => {
  assert.equal(rules.killExperience('enemy', 999), 5);
  assert.equal(rules.killExperience('boss', 1), 70);
  assert.equal(rules.killExperience('boss', 5), 150);
  assert.equal(rules.killExperience('boss', 8), 200);
  assert.equal(rules.killExperience('boss', 20), 200);
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
    plain(rules.awardNormalKill({ xp: 45, normalKills: 9, attackLevel: 0, weaponLevels: { homing: 0, laser: 0 }, weaponParts: 0 })),
    { xp: 50, normalKills: 10, bossPending: true, weaponParts: 0 }
  );
  assert.deepEqual(
    plain(rules.awardNormalKill({ xp: 10, normalKills: 10, attackLevel: 0, weaponLevels: { homing: 0, laser: 0 }, weaponParts: 0 })),
    { xp: 15, normalKills: 11, bossPending: false, weaponParts: 0 }
  );
});

test('boss kills grant independent experience and three universal parts while useful', () => {
  assert.deepEqual(
    plain(rules.awardBossKill({ xp: 20, bosses: 2, attackLevel: 0, weaponLevels: { homing: 1, laser: 3 }, weaponParts: 4 })),
    { xp: 130, bosses: 3, weaponParts: 7 }
  );
  assert.deepEqual(
    plain(rules.awardBossKill({ xp: 20, bosses: 7, attackLevel: 0, weaponLevels: { homing: 3, laser: 3 }, weaponParts: 4 })),
    { xp: 220, bosses: 8, weaponParts: 4 }
  );
  assert.deepEqual(
    plain(rules.awardBossKill({ xp: 25, bosses: 7, attackLevel: 5, weaponLevels: { homing: 2, laser: 3 }, weaponParts: 4 })),
    { xp: 25, bosses: 8, weaponParts: 9 }
  );
});

test('normal enemy spawning stops at ten or during a boss fight', () => {
  assert.equal(rules.canSpawnEnemy(9, false), true);
  assert.equal(rules.canSpawnEnemy(10, false), false);
  assert.equal(rules.canSpawnEnemy(0, true), false);
});

test('V2.3 remote visuals only map attacks that already exist', () => {
  assert.match(html, /const EnemyProjectileVisuals = \{ wizard: 'wizardMagicOrb', brown: 'orangeBossShell', blue: 'blueBossBolt' \};/);
  assert.match(html, /shootEnemyBullet\([^\n]+EnemyProjectileVisuals\.wizard/);
  assert.match(html, /shootEnemyBullet\([^\n]+EnemyProjectileVisuals\[boss\.variant\]/);
});

test('V2.3 maps each existing weapon and remote projectile to its own hit visual', () => {
  assert.match(html, /const ImpactVisuals = \{ bullet: 'hitMachinegun', homing: 'hitMissile', laser: 'hitLaser', wizardMagicOrb: 'hitMagic', orangeBossShell: 'hitOrangeBoss', blueBossBolt: 'hitBlueBoss' \};/);
  assert.match(html, /function addImpact\(x, y, key, target = null\)/);
});

test('normal enemy body collisions use a collision resolver that does not award a kill', () => {
  assert.match(html, /function resolveEnemyCollision\(enemy, player\)/);
  assert.match(html, /enemy\.type === 'eagle' \|\| enemy\.type === 'drone' \|\| enemy\.type === 'bat' \|\| enemy\.type === 'wizard'/);
  assert.match(html, /destroyEnemy\(enemy\)/);
  assert.doesNotMatch(html.match(/function resolveEnemyCollision[\s\S]*?\n  }/)?.[0] || '', /killEnemy\(enemy\)/);
});

test('laser flash and impact follow the hit target without repeating damage or retargeting', () => {
  const target = { id: 1, x: 640, y: 180, hp: 200, r: 25, dead: false };
  const game = {
    running: true, stage: 'combat',
    player: { x: 640, y: 600 }, activeWeapon: 'laser', weaponLevels: { laser: 1 },
    laserTargetId: 1, laserTimer: 1.49, enemies: [target], particles: [], impacts: [], floaters: []
  };
  const runtime = vm.createContext({
    game, window: {}, ImpactVisuals: { laser: 'hitLaser' },
    playSound() {}, addFloater() {}, addParticle() {}, random: () => 0,
    killEnemy(enemy) { enemy.dead = true; }
  });
  vm.runInContext(match[1], runtime);
  for (const name of ['addImpact', 'damageEnemy', 'updateLaser', 'updateParticles']) {
    const start = html.indexOf(`  function ${name}(`);
    vm.runInContext(html.slice(start, html.indexOf('\n  function ', start + 1)), runtime);
  }
  const endpoint = () => [
    game.laserFlash.x + Math.cos(game.laserFlash.rotation) * game.laserFlash.length,
    game.laserFlash.y + Math.sin(game.laserFlash.rotation) * game.laserFlash.length
  ];
  const checkPoint = (actual, expected) => actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-8));
  vm.runInContext('updateLaser(.02);', runtime);
  assert.equal(target.hp, 165);
  target.x = 720; target.y = 220;
  game.player.x = 580; game.player.y = 620;
  const other = { id: 2, x: 580, y: 500, hp: 200, dead: false };
  game.enemies.push(other);
  vm.runInContext('updateLaser(.02); updateParticles(.02);', runtime);
  checkPoint(endpoint(), [720, 220]);
  checkPoint([game.laserFlash.x, game.laserFlash.y], [580, 582]);
  checkPoint([game.impacts[0].x, game.impacts[0].y], [720, 220]);
  assert.equal(target.hp, 165);
  assert.equal(other.hp, 200);
  target.x = 750; target.dead = true;
  vm.runInContext('updateParticles(.02);', runtime);
  checkPoint(endpoint(), [750, 220]);
  target.x = 900;
  vm.runInContext('updateParticles(.02);', runtime);
  checkPoint(endpoint(), [750, 220]);
  checkPoint([game.impacts[0].x, game.impacts[0].y], [750, 220]);
  vm.runInContext('updateParticles(.21);', runtime);
  assert.equal(game.laserFlash, null);
  assert.equal(game.impacts.length, 0);
  assert.equal(target.hp, 165);
  target.hp = 20; target.dead = false;
  game.enemies = [target]; game.laserTargetId = target.id; game.laserTimer = 1.49;
  vm.runInContext('updateLaser(.02); updateParticles(.02);', runtime);
  assert.equal(target.dead, true);
  checkPoint(endpoint(), [900, 220]);
  target.x = 1000;
  vm.runInContext('updateParticles(.02);', runtime);
  checkPoint(endpoint(), [900, 220]);
  checkPoint([game.impacts[0].x, game.impacts[0].y], [900, 220]);
});

test('laser is rendered only through a short flash state after the 1.5-second hit', () => {
  assert.match(html, /laserFlash: null/);
  assert.match(html, /game\.laserFlash = \{ x: game\.player\.x/);
  assert.match(html, /if \(game\.laserFlash\)/);
  assert.match(html, /life: \.18, maxLife: \.18/);
  assert.match(html, /flash\.length, 34, flash\.rotation/);
});

test('blue boss bolt keeps its dedicated high-contrast local asset', () => {
  assert.match(html, /blueBossBolt: 'assets\/weapons\/boss-blue-bolt\.png'/);
  assert.match(html, /const EnemyProjectileVisuals = \{ wizard: 'wizardMagicOrb', brown: 'orangeBossShell', blue: 'blueBossBolt' \};/);
  assert.match(assetCatalog, /蓝白 BOSS 能量弹（调整版）/);
  assert.equal(fs.existsSync(new URL('../assets/weapons/boss-blue-bolt.png', import.meta.url)), true);
});

test('damage state uses smoke below 65 percent and fire below 35 percent', () => {
  assert.equal(rules.damageState(65, 100), 'none');
  assert.equal(rules.damageState(64, 100), 'smoke');
  assert.equal(rules.damageState(35, 100), 'smoke');
  assert.equal(rules.damageState(34, 100), 'fire');
  assert.match(html, /damageEffects: \[\]/);
  assert.match(html, /game\.damageEffects\.length < 18/);
});

test('homing missiles play only the cached launch sound without a flight engine', () => {
  assert.match(html, /playSound\('missile-launch'\);/);
  assert.doesNotMatch(html, /missileEngines/);
  assert.doesNotMatch(html, /startMissileEngine/);
  assert.doesNotMatch(html, /stopMissileEngine/);
});

test('start screen exposes both retained scene themes and HUD avoids emoji labels', () => {
  assert.match(html, /data-scene-theme="backgroundTopdown"/);
  assert.match(html, /data-scene-theme="backgroundPerspective"/);
  assert.match(html, /function setSceneTheme\(theme\)/);
  assert.doesNotMatch(html, /❤️|🎯|⭐/);
});

test('pixel UI uses local assets and gameplay has no floating version label', () => {
  assert.match(html, /playerMuzzleFlashV2: 'assets\/weapons\/player-muzzle-flash-v2\.png'/);
  assert.match(html, /uiAttackUpgrade: 'assets\/weapons\/ui-attack-upgrade\.png'/);
  assert.match(html, /uiMachinegun: 'assets\/weapons\/ui-machinegun\.png'/);
  assert.match(html, /uiHomingMissile: 'assets\/weapons\/ui-homing-missile\.png'/);
  assert.match(html, /uiLaserCannon: 'assets\/weapons\/ui-laser-cannon\.png'/);
  assert.doesNotMatch(html, /<div class="version">/);
});

test('background uses transparent landscape layers instead of rectangular segments', () => {
  assert.match(html, /topdownIsland0[1-3]/);
  assert.match(html, /perspectiveIslandChain/);
  assert.doesNotMatch(html, /const prefix = topdown \? 'topdownSegment' : 'perspectiveSegment';/);
});

test('perspective background keeps clear weather and seven perspective scenery types', () => {
  assert.doesNotMatch(html, /perspectiveWeather/);
  assert.doesNotMatch(html, /PerspectiveCloudLayers/);
  assert.doesNotMatch(html, /perspectiveSkyStorm|perspectiveCloudBankFar|perspectiveCloudBankNear/);
  assert.match(html, /const PerspectiveScenerySequence = \{/);
  for (const key of ['perspectiveIslandChain', 'perspectiveLighthouseReef', 'perspectiveSailboat', 'perspectiveBuoy', 'perspectiveReef', 'perspectiveSeaStack', 'perspectiveCliffWaterfall']) assert.match(html, new RegExp(key));
  assert.doesNotMatch(html, /BackgroundLayouts\.backgroundPerspective/);
});

test('clear perspective weather preloads and drifts two seamless sky-only cloud layers', () => {
  for (const [key, filename] of [
    ['perspectiveClearCloudFar', 'perspective-clear-cloud-far.png'],
    ['perspectiveClearCloudNear', 'perspective-clear-cloud-near.png']
  ]) {
    assert.ok(html.includes(`${key}: 'assets/scenery/${filename}'`));
    assert.equal(fs.existsSync(new URL(`../assets/scenery/${filename}`, import.meta.url)), true);
  }

  const clearCloudLayers = html.match(/  const PerspectiveClearCloudLayers = \{[\s\S]*?\n  \};/)?.[0] || '';
  const scenerySequence = html.match(/  const PerspectiveScenerySequence = \{[\s\S]*?\n  \};/)?.[0] || '';
  const drawBackground = html.match(/  function drawBackground\(\) \{[\s\S]*?\n  \}(?=\n\n  function drawSceneryAsset)/)?.[0] || '';
  const calls = [];
  const renderContext = {
    W: 1280, H: 720, activeSceneBackground: 'backgroundPerspective',
    GameRules: rules,
    game: { time: 0 }, clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    drawSceneryAsset: (...args) => calls.push(args)
  };
  vm.createContext(renderContext);
  vm.runInContext(`${clearCloudLayers}\n${scenerySequence}\n${drawBackground}`, renderContext);

  const drawAt = time => {
    calls.length = 0;
    renderContext.game.time = time;
    renderContext.drawBackground();
    return calls.filter(call => call[0].startsWith('perspectiveClearCloud'));
  };
  const clearAtZero = drawAt(0);
  const clearAtOneSecond = drawAt(1);
  for (const [key, speed, alpha] of [
    ['perspectiveClearCloudFar', 1.5, .24],
    ['perspectiveClearCloudNear', 2.7, .32]
  ]) {
    const initial = clearAtZero.filter(call => call[0] === key);
    const moved = clearAtOneSecond.filter(call => call[0] === key);
    assert.ok(initial.length >= 2, `${key} must tile across the viewport`);
    assert.ok(Math.abs(initial[0][1] - moved[0][1] - speed) < 1e-9, `${key} must drift at ${speed}px per second`);
    assert.equal(initial[0][5], alpha);
    assert.ok(initial.every(call => call[2] + call[4] / 2 <= 720 * .34), `${key} must remain above the real horizon`);
    const period = initial[1][1] - initial[0][1];
    assert.equal(period, initial[0][3], `${key} must tile using its rendered width`);
    const looped = drawAt(period / speed).filter(call => call[0] === key);
    assert.equal(looped.length, initial.length);
    looped.forEach((call, index) => assert.ok(Math.abs(call[1] - initial[index][1]) < 1e-9, `${key} loop boundary must be continuous`));
    for (const time of [0, 42.5, 50, 87.5]) {
      assert.ok(drawAt(time).filter(call => call[0] === key).every(call => call[5] === alpha), `${key} alpha must stay constant at ${time}s`);
    }
  }
});

test('perspective scenery enters from the horizon and does not use a second water layer', () => {
  assert.doesNotMatch(html, /drawSceneryAsset\('waterPerspectiveLoop'/);
  assert.match(html, /const horizonY = H \* \.42/);
  assert.match(html, /if \(loopY < 0\) return/);
  assert.match(html, /horizonY \+ loopY/);
});

test('perspective scenery draws one depth-scaled water contact before each asset', () => {
  assert.match(html, /perspectiveWaterContact: 'assets\/scenery\/perspective-water-contact\.png'/);
  assert.equal(fs.existsSync(new URL('../assets/scenery/perspective-water-contact.png', import.meta.url)), true);
  const clearCloudLayers = html.match(/  const PerspectiveClearCloudLayers = \{[\s\S]*?\n  \};/)?.[0] || '';
  const scenerySequence = html.match(/  const PerspectiveScenerySequence = \{[\s\S]*?\n  \};/)?.[0] || '';
  const drawBackground = html.match(/  function drawBackground\(\) \{[\s\S]*?\n  \}(?=\n\n  function drawSceneryAsset)/)?.[0] || '';
  const calls = [];
  const renderContext = {
    W: 1280, H: 720, activeSceneBackground: 'backgroundPerspective', GameRules: rules,
    game: { time: 0 }, clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    drawSceneryAsset: (...args) => calls.push(args)
  };
  vm.createContext(renderContext);
  vm.runInContext(`${clearCloudLayers}\n${scenerySequence}\n${drawBackground}`, renderContext);
  for (let time = 0; time <= 200; time += 5) {
    renderContext.game.time = time;
    renderContext.drawBackground();
  }
  const sceneryKeys = [
    'perspectiveIslandChain', 'perspectiveLighthouseReef', 'perspectiveSailboat', 'perspectiveBuoy',
    'perspectiveReef', 'perspectiveSeaStack', 'perspectiveCliffWaterfall'
  ];
  const pairs = [];
  calls.forEach((call, index) => {
    if (!sceneryKeys.includes(call[0])) return;
    const contact = calls[index - 1];
    assert.equal(contact[0], 'perspectiveWaterContact', `${call[0]} must follow its water contact`);
    assert.ok(contact[2] > 720 * .42, `${call[0]} contact must stay below the horizon`);
    assert.ok(call[2] >= 720 * .42, `${call[0]} must stay at or below the horizon`);
    pairs.push({ key: call[0], y: call[2], alpha: contact[5] });
  });
  for (const key of sceneryKeys) {
    const samples = pairs.filter(pair => pair.key === key).sort((a, b) => a.y - b.y);
    assert.ok(samples.length > 1, `${key} must be drawn at multiple depths`);
    assert.ok(samples[0].alpha < samples.at(-1).alpha, `${key} contact alpha must increase toward the foreground`);
  }
});

test('perspective foreground grows by asset while retaining distant size and source detail', () => {
  const declarations = html.match(/  const PerspectiveClearCloudLayers = \{[\s\S]*?(?=  const TopdownScenerySequence)/)[0];
  const draw = html.match(/  function drawBackground\(\) \{[\s\S]*?\n  \}(?=\n\n  function drawSceneryAsset)/)[0];
  const calls = [];
  const renderer = { W: 1280, H: 720, activeSceneBackground: 'backgroundPerspective',
    GameRules: { sequenceLoopY: () => renderer.depth * 720 * .58 },
    game: { time: 0 }, clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    drawSceneryAsset: (...args) => calls.push(args) };
  vm.createContext(renderer);
  vm.runInContext(`${declarations}\n${draw}`, renderer);
  const entries = vm.runInContext('PerspectiveScenerySequence.entries', renderer);
  for (const depth of [0, .5, 1, 1.2]) {
    renderer.depth = depth;
    calls.length = 0;
    renderer.drawBackground();
    for (const [key, , , width, height] of entries) {
      const call = calls.find(item => item[0] === key);
      const scale = call[3] / width;
      if (depth === 0) assert.ok(Math.abs(scale - .38) < 1e-9, `${key}: retain horizon size`);
      if (depth >= 1) {
        const small = ['perspectiveSailboat', 'perspectiveBuoy'].includes(key);
        assert.ok(scale + 1e-9 >= 1.1 * (small ? 1.2 : 1.5), `${key}: foreground needs more volume`);
        assert.ok(scale <= 1.1 * (small ? 1.4 : 1.8), `${key}: keep foreground bounded`);
      }
      assert.ok(Math.abs(call[4] / height - scale) < 1e-9, `${key}: preserve proportions`);
      const assetPath = html.match(new RegExp(`${key}: '([^']+)'`))[1];
      const png = fs.readFileSync(new URL(`../${assetPath}`, import.meta.url));
      assert.ok(call[3] <= png.readUInt32BE(16) && call[4] <= png.readUInt32BE(20), `${key}: do not upscale source pixels`);
    }
  }
});

test('perspective sequence keeps two or three scenery centers on screen throughout a loop', () => {
  const declaration = html.match(/  const PerspectiveScenerySequence = \{[\s\S]*?\n  \};/)[0];
  const sequence = vm.runInNewContext(`${declaration}\nPerspectiveScenerySequence`);
  for (let offset = 0; offset < sequence.length; offset++) {
    const visible = sequence.entries.filter(([, , y]) => {
      const position = rules.sequenceLoopY(y, offset, sequence.length, 260);
      return position >= 0 && position < 720 * .58;
    });
    assert.ok(visible.length >= 2 && visible.length <= 3, `offset ${offset}: ${visible.length} scenery centers`);
  }
});

test('clear perspective background uses its own sky without a second cloud overlay', () => {
  assert.doesNotMatch(html, /drawSceneryAsset\('perspectiveSkyClear'/);
  assert.doesNotMatch(html, /drawSceneryAsset\('perspectiveSkyStorm'/);
});

test('machinegun keeps its 0.09 second firing cadence and the v2 muzzle asset', () => {
  assert.match(html, /playerMuzzleFlashV2/);
  assert.match(html, /Math\.floor\(game\.time \/ \.09\)/);
});

test('combat HUD uses a clear progress icon and compact readable controls', () => {
  assert.match(html, /\.mission-icon::before/);
  assert.match(html, /\.mission-icon::after/);
  assert.doesNotMatch(html, /\.mission-icon \{ transform: rotate\(45deg\)/);
  assert.match(html, /id="weapon-parts"[^>]*><img src="assets\/weapons\/ui-homing-missile\.png"/);
  assert.equal((html.match(/class="fragment-count"/g) || []).length, 1);
  assert.match(html, /\.fragment-button \{[^}]*text-shadow: none/s);
  assert.match(html, /#upgrade-attack \.weapon-asset \{[^}]*width: clamp\(34px, 2\.5vw, 46px\)/s);
});

test('growth choices make unavailable upgrades visibly disabled', () => {
  assert.match(html, /#growth-modal button:disabled \{[^}]*opacity: \.78;[^}]*cursor: default;/s);
});

test('player machinegun bullets and flashes share the aircraft gun anchors', () => {
  assert.deepEqual(plain(rules.playerGunAnchors()), [
    { x: -16, y: -19 },
    { x: 16, y: -19 }
  ]);
  assert.equal((html.match(/GameRules\.playerGunAnchors\(\)/g) || []).length, 2);
  assert.match(html, /x: game\.player\.x \+ gun\.x, y: game\.player\.y - 34/);
  assert.match(html, /drawAsset\('player', player\.x \+ 13, player\.y, 116, 85/);
  assert.match(html, /drawAsset\('playerMuzzleFlashV2', player\.x \+ gun\.x, player\.y \+ gun\.y, 8, 8/);
});

test('player aircraft variants are preloaded through the production asset loader', async () => {
  const manifestStart = html.indexOf('  const AssetManifest = {');
  const manifestEnd = html.indexOf('\n  const soundCooldowns', manifestStart);
  const preloadStart = html.indexOf('  function preloadAssets()');
  const preloadEnd = html.indexOf('\n  function setSceneTheme', preloadStart);
  assert.ok(manifestStart >= 0 && manifestEnd > manifestStart && preloadStart >= 0 && preloadEnd > preloadStart);

  class LoadedImage {
    set src(path) { this.path = path; this.onload(); }
  }
  const runtime = vm.createContext({
    Image: LoadedImage,
    assets: {},
    assetsReady: false,
    ui: { 'start-button': { disabled: false, textContent: '' } },
    window: { __testMode: true, __assetStats: { expected: [], loaded: [], failed: [] } }
  });
  vm.runInContext(`${html.slice(manifestStart, manifestEnd)}\n${html.slice(preloadStart, preloadEnd)}\nglobalThis.runPreload = preloadAssets;`, runtime);
  await runtime.runPreload();

  assert.equal(runtime.assets.playerLaser.path, 'assets/characters/player-fighter-laser.png');
  assert.equal(runtime.assets.playerMissile.path, 'assets/characters/player-fighter-missile.png');
  assert.equal(runtime.assetsReady, true);
});

test('drawPlayer selects only unlocked aircraft variants while preserving shared effects', () => {
  const calls = [];
  const runtime = vm.createContext({
    game: { running: true, time: 0, activeWeapon: null, weaponLevels: { homing: 0, laser: 0 } },
    GameRules: { playerGunAnchors: () => [{ x: -16, y: -19 }, { x: 16, y: -19 }] },
    drawShadow(...args) { calls.push(['shadow', ...args]); },
    drawAsset(...args) { calls.push(['asset', ...args]); }
  });
  const start = html.indexOf('  function drawPlayer(');
  assert.ok(start >= 0);
  vm.runInContext(html.slice(start, html.indexOf('\n  function ', start + 1)), runtime);

  const draw = (activeWeapon, weaponLevels, invulnerable = 0) => {
    calls.length = 0;
    runtime.game.activeWeapon = activeWeapon;
    runtime.game.weaponLevels = weaponLevels;
    runtime.player = { x: 640, y: 600, invulnerable };
    vm.runInContext('drawPlayer(player);', runtime);
    return structuredClone(calls);
  };

  for (const [activeWeapon, weaponLevels] of [
    [null, { homing: 0, laser: 0 }],
    ['laser', { homing: 0, laser: 0 }],
    ['homing', { homing: 0, laser: 0 }]
  ]) {
    const draws = draw(activeWeapon, weaponLevels);
    assert.deepEqual(draws[0], ['shadow', 'playerWingShadow', 640, 636, 74, 22, 1, 600]);
    assert.deepEqual(draws[1], ['asset', 'player', 653, 600, 116, 85, 0, 1]);
  }

  const laserDraws = draw('laser', { homing: 0, laser: 1 }, .5);
  assert.deepEqual(laserDraws[0], ['shadow', 'playerWingShadow', 640, 636, 74, 22, .35, 600]);
  assert.deepEqual(laserDraws[1], ['asset', 'playerLaser', 640, 588, 93, 68, 0, .35]);
  assert.deepEqual(laserDraws.slice(2), [
    ['asset', 'playerMuzzleFlashV2', 624, 581, 8, 8, 0, .35],
    ['asset', 'playerMuzzleFlashV2', 656, 581, 8, 8, 0, .35]
  ]);

  const missileDraws = draw('homing', { homing: 1, laser: 0 });
  assert.deepEqual(missileDraws[0], ['shadow', 'playerWingShadow', 640, 636, 74, 22, 1, 600]);
  assert.deepEqual(missileDraws[1], ['asset', 'playerMissile', 640, 592, 108, 79, 0, 1]);
  assert.deepEqual(missileDraws.slice(2).map(call => call.slice(0, 4)), [
    ['asset', 'playerMuzzleFlashV2', 624, 581],
    ['asset', 'playerMuzzleFlashV2', 656, 581]
  ]);
});

test('confirmed top-down scenery is listed as previewable assets before it is rendered', () => {
  assert.doesNotMatch(assetCatalog, /id="pending-background-plan-grid"/);
  assert.match(assetCatalog, /id="topdown-background"/);
  assert.match(assetCatalog, /'topdown-background-grid'/);
  for (const name of [
    '俯视弯月形浅海珊瑚礁', '俯视分散小礁群与海草',
    '俯视岩石孤岛与松树', '俯视低矮沙洲与小花'
  ]) assert.match(assetCatalog, new RegExp(name));
  for (const filename of [
    'topdown-reef-01.png', 'topdown-reef-02.png',
    'topdown-islet-01.png', 'topdown-islet-02.png'
  ]) assert.match(assetCatalog, new RegExp(filename.replace('.', '\\.')));
});

test('top-down scenery uses one seven-item sequence and returns outside the viewport', () => {
  assert.equal(rules.sequenceLoopY(55, 0, 1815, 260), 55);
  assert.equal(rules.sequenceLoopY(55, 1815, 1815, 260), 55);
  assert.equal(rules.sequenceLoopY(-150, 150, 1815, 260), 0);
  assert.equal(rules.sequenceLoopY(55, 1500, 1815, 260), -260);
  assert.match(html, /length: 1815/);
  assert.match(html, /\['topdownReef01', \.72, -150, 258, 150\]/);
  assert.match(html, /\['topdownReef02', \.23, -360, 246, 164\]/);
  assert.match(html, /\['topdownIslet01', \.64, -570, 220, 176\]/);
  assert.match(html, /\['topdownIslet02', \.31, -780, 236, 156\]/);
  for (const key of [
    'topdownIsland01', 'topdownIsland02', 'topdownIsland03', 'topdownReef01',
    'topdownReef02', 'topdownIslet01', 'topdownIslet02'
  ]) assert.match(html, new RegExp(`\\['${key}'`));
  assert.match(html, /TopdownScenerySequence\.entries\.forEach\(\(\[key, x, y, width, height\]\) =>/);
  assert.match(html, /GameRules\.sequenceLoopY\(y, landscapeOffset, TopdownScenerySequence\.length, 260\)/);
});

test('runtime asset catalog excludes removed and inactive entries while preserving background files', () => {
  for (const path of removedAssetPaths) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.equal(fs.existsSync(new URL(`../${path}`, import.meta.url)), false, `${path} must be deleted`);
    assert.doesNotMatch(html, new RegExp(escaped));
    assert.doesNotMatch(assetCatalog, new RegExp(escaped));
  }
  for (const path of retainedBackgroundPaths) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.equal(fs.existsSync(new URL(`../${path}`, import.meta.url)), true, `${path} must remain`);
    assert.match(html, new RegExp(escaped));
  }
  assert.match(assetCatalog, /assets\/scenery\/background-perspective\.png/);
  for (const path of [
    'assets/scenery/background-topdown.png', 'assets/scenery/water-perspective-loop.png',
    'assets/scenery/perspective-sky-clear.png', 'assets/weapons/enemy-bullet.png',
    'blue-calm-topdown-sample.png', 'blue-calm-perspective-sample.png',
    'battle-original', 'battle-candidate', 'events-showcase'
  ]) assert.equal(assetCatalog.includes(path), false, `${path} must not appear in the runtime catalog`);
  assert.doesNotMatch(assetCatalog, /历史对照|sound-optimization-plan/);
});


test('firearm upgrade and switch match approved previews and cache at both sample rates', () => {
  for (const rate of [44100, 48000]) {
    const { runtime, buffers, sources, setNow } = createAudioRuntime(rate);
    for (const [key, duration] of [['upgrade', .72], ['weapon-switch', .32]]) {
      vm.runInContext(`playSound('${key}')`, runtime);
      const first = sources.at(-1);
      const samples = first.buffer.getChannelData(0);
      assert.equal(samples.length, Math.ceil(rate * duration), `${key} duration`);
      assert.equal(samples[0], 0);
      assert.equal(samples.at(-1), 0);
      assert.ok(samples.every(value => Number.isFinite(value) && Math.abs(value) < 1));
      if (rate === 44100) {
        const approved = decodeMonoPcm16Wav(new URL(`../docs/superpowers/specs/previews/firearm-audio/${key}.wav`, import.meta.url));
        for (let i = 0; i < samples.length; i++) assert.ok(Math.abs(samples[i] - approved.samples[i]) <= 1 / 32768 + 1e-7, `${key} sample ${i}`);
      }
      setNow(1000);
      vm.runInContext(`playSound('${key}')`, runtime);
      assert.equal(first.buffer, sources.at(-1).buffer);
    }
    assert.equal(buffers.length, 2);
    assert.equal(sources.length, 4);
    for (const source of sources) source.onended();
    assert.ok(sources.every(source => source.disconnected));
  }
});

test('mechanical start and hurt match approved previews and cache at both sample rates', () => {
  for (const rate of [44100, 48000]) {
    const { runtime, buffers, sources, setNow } = createAudioRuntime(rate);
    for (const [key, duration] of [['start', 1.05], ['hurt', .24]]) {
      vm.runInContext(`playSound('${key}')`, runtime);
      const first = sources.at(-1);
      const samples = first.buffer.getChannelData(0);
      assert.equal(samples.length, Math.ceil(rate * duration), `${key} duration`);
      assert.equal(samples[0], 0);
      assert.equal(samples.at(-1), 0);
      assert.ok(samples.every(value => Number.isFinite(value) && Math.abs(value) < 1));
      if (rate === 44100) {
        const approved = decodeMonoPcm16Wav(new URL(`../docs/superpowers/specs/previews/mechanical-audio/${key}.wav`, import.meta.url));
        for (let i = 0; i < samples.length; i++) assert.ok(Math.abs(samples[i] - approved.samples[i]) <= 1 / 32768 + 1e-7, `${key} sample ${i}`);
      }
      setNow(1000);
      vm.runInContext(`playSound('${key}')`, runtime);
      assert.equal(first.buffer, sources.at(-1).buffer);
    }
    assert.equal(buffers.length, 2);
    assert.equal(sources.length, 4);
    for (const source of sources) source.onended();
    assert.ok(sources.every(source => source.disconnected));
  }
});


test('growth refresh preserves weapon pictures while updating the text and availability', () => {
  const labels = {};
  const ui = { 'growth-copy': {} };
  for (const type of ['attack', 'homing', 'laser']) {
    labels[type] = { textContent: '' };
    ui[`growth-${type}`] = {
      querySelector(selector) { assert.equal(selector, '.growth-label'); return labels[type]; },
      set textContent(value) { assert.fail('Replacing button text removes its weapon image'); }
    };
  }
  const game = { xp: 120, attackLevel: 0, weaponParts: 3, weaponLevels: { homing: 0, laser: 0 } };
  const runtime = vm.createContext({ game, ui, GameRules: rules });
  runProductionFunctions(runtime, ['updateGrowth']);
  vm.runInContext('updateGrowth()', runtime);
  assert.match(labels.attack.textContent, /50 经验/);
  assert.equal(ui['growth-attack'].disabled, false);
  assert.equal(ui['growth-homing'].disabled, true);
  game.attackLevel = 5; game.weaponParts = 5;
  vm.runInContext('updateGrowth()', runtime);
  assert.match(labels.attack.textContent, /MAX/);
  assert.equal(ui['growth-attack'].disabled, true);
  assert.equal(ui['growth-homing'].disabled, false);
  for (const [type, file] of [['attack', 'ui-attack-upgrade.png'], ['homing', 'ui-homing-missile-upgrade.png'], ['laser', 'ui-laser-upgrade.png']]) {
    const button = html.match(new RegExp(`<button id="growth-${type}"[^>]*>([\\s\\S]*?)</button>`));
    assert.ok(button?.[1].includes(file), `Missing ${type} picture`);
  }
});

test('perspective actors cast shadows only when their centers reach the sea; topdown keeps shadows', () => {
  const shadows = [];
  const keys = ['playerWingShadow', 'owlWingShadow', 'droneBodyShadow', 'batWingShadow', 'wizardRobesShadow', 'bossOrangeEngineShadow', 'bossBlueThrusterShadow'];
  const runtime = vm.createContext({
    H: 720, activeSceneBackground: 'backgroundPerspective',
    assets: Object.fromEntries(keys.map(key => [key, key])),
    ctx: { save() {}, restore() {}, drawImage(...args) { shadows.push(args); } },
    game: { running: false, activeWeapon: null, weaponLevels: { homing: 0, laser: 0 } },
    drawAsset() {}
  });
  runProductionFunctions(runtime, ['drawShadow', 'drawPlayer', 'drawEagle', 'drawDrone', 'drawBat', 'drawWizard', 'drawBoss']);
  for (const scene of ['backgroundPerspective', 'backgroundTopdown']) {
    runtime.activeSceneBackground = scene;
    for (const y of [120, 720 * .34 - 1, 720 * .34, 600]) {
      for (const [name, extra] of [['drawPlayer', {}], ['drawEagle', {}], ['drawDrone', {}], ['drawBat', {}], ['drawWizard', {}], ['drawBoss', { variant: 'brown' }], ['drawBoss', { variant: 'blue' }]]) {
        shadows.length = 0;
        runtime.actor = { x: 640, y, age: 0, invulnerable: 0, ...extra };
        vm.runInContext(`${name}(actor)`, runtime);
        const expected = scene === 'backgroundTopdown' || y >= 720 * .34 ? 1 : 0;
        assert.equal(shadows.length, expected, `${scene} ${name} y=${y}`);
        if (name === 'drawBoss' && expected) {
          assert.deepEqual(shadows[0].slice(3), [128, 27], `${scene} ${extra.variant} shadow size`);
        }
      }
    }
  }
});

test('universal parts HUD shows both existing special weapon icons with one count', () => {
  const hud = html.match(/<div id="weapon-parts"[\s\S]*?<\/div>/)?.[0] || '';
  assert.ok(hud.includes('ui-homing-missile.png'));
  assert.ok(hud.includes('ui-laser-cannon.png'));
  assert.equal((hud.match(/class="fragment-count"/g) || []).length, 1);
});
