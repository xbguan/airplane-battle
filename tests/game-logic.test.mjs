import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.existsSync(new URL('../index.html', import.meta.url))
  ? fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  : '<script id="game-rules">globalThis.GameRules = {};</script>';
const assetCatalog = fs.readFileSync(new URL('../全部资产清单.html', import.meta.url), 'utf8');
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
  assert.equal(rules.specialWeaponInterval('laser'), 1.5);
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

test('V2.3 remote visuals only map attacks that already exist', () => {
  assert.match(html, /const EnemyProjectileVisuals = \{ wizard: 'wizardMagicOrb', brown: 'orangeBossShell', blue: 'blueBossBolt' \};/);
  assert.match(html, /shootEnemyBullet\([^\n]+EnemyProjectileVisuals\.wizard/);
  assert.match(html, /shootEnemyBullet\([^\n]+EnemyProjectileVisuals\[boss\.variant\]/);
});

test('V2.3 maps each existing weapon and remote projectile to its own hit visual', () => {
  assert.match(html, /const ImpactVisuals = \{ bullet: 'hitMachinegun', homing: 'hitMissile', laser: 'hitLaser', wizardMagicOrb: 'hitMagic', orangeBossShell: 'hitOrangeBoss', blueBossBolt: 'hitBlueBoss' \};/);
  assert.match(html, /function addImpact\(x, y, key\)/);
});

test('all normal enemy body collisions use one kill-and-progress resolver', () => {
  assert.match(html, /function resolveEnemyCollision\(enemy, player\)/);
  assert.match(html, /enemy\.type === 'eagle' \|\| enemy\.type === 'drone' \|\| enemy\.type === 'bat' \|\| enemy\.type === 'wizard'/);
  assert.match(html, /killEnemy\(enemy\)/);
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
  assert.match(html, /'missile-launch': \[120, 310, \.14, \.16, 'saw'\]/);
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

test('clear perspective background uses its own sky without a second cloud overlay', () => {
  assert.doesNotMatch(html, /drawSceneryAsset\('perspectiveSkyClear'/);
  assert.doesNotMatch(html, /drawSceneryAsset\('perspectiveSkyStorm'/);
});

test('machinegun uses a short cached dada cadence and the v2 muzzle asset', () => {
  assert.match(html, /machinegun: \[205, 108, \.052, \.14, 'square'\]/);
  assert.match(html, /playerMuzzleFlashV2/);
  assert.match(html, /Math\.floor\(game\.time \/ \.09\)/);
});

test('combat HUD uses a clear progress icon and compact readable controls', () => {
  assert.match(html, /\.mission-icon::before/);
  assert.match(html, /\.mission-icon::after/);
  assert.doesNotMatch(html, /\.mission-icon \{ transform: rotate\(45deg\)/);
  assert.match(html, /id="homing-fragment"[^>]*><img src="assets\/weapons\/ui-homing-missile\.png"/);
  assert.match(html, /id="laser-fragment"[^>]*><img src="assets\/weapons\/ui-laser-cannon\.png"/);
  assert.match(html, /\.fragment-button \{[^}]*text-shadow: none/s);
  assert.match(html, /#upgrade-attack \.weapon-asset \{[^}]*width: clamp\(34px, 2\.5vw, 46px\)/s);
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

test('runtime asset catalog excludes removed files and retains both full backgrounds', () => {
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
    assert.match(assetCatalog, new RegExp(escaped));
  }
});
