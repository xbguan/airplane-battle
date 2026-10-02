# 《飞机大战》V2.3 战斗特效与无缝背景 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变既有战斗数值与攻击方式的前提下，为已有远程攻击补齐专属视觉素材、七类角色投影，并以多区块无缝背景替代完整背景的上下重复。

**Architecture:** `index.html` 继续作为唯一入口，在既有预加载缓存之上扩展固定素材清单。敌方远程弹增加纯视觉 `visualKey`，不改速度、伤害、半径或碰撞；背景改为“水面底图 + 固定地形序列 + 云雾层”的三层绘制，区块序列完整循环后才重头开始。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Canvas 2D、本地 PNG、Node 内置测试、Python Playwright。

## 全局约束

- 只使用 `assets/` 下原创本地 PNG；不使用 CDN、外链、框架或构建工具。
- 不改变现有伤害、发射频率、升级、碎片、碰撞半径或敌人行为。
- 不给猫头鹰、独眼无人机、独眼蝙蝠新增远程攻击。
- 所有可动对象、投影与特效为透明 PNG；投影跟随位置但不旋转。
- 两套完整背景保留，俯视河谷继续为默认主题；不得把同一张完整背景上下直接拼接。
- 不执行 Git 操作。

---

### Task 1: 固定特效、投影与区块背景清单

**Files:**
- Modify: `tests/browser-smoke.py:16-92`
- Modify: `index.html:430-475`
- Create: `assets/weapons/player-muzzle-flash.png`
- Create: `assets/weapons/player-bullet-core.png`
- Create: `assets/weapons/player-bullet-trail.png`
- Create: `assets/weapons/missile-exhaust-01.png`, `assets/weapons/missile-exhaust-02.png`, `assets/weapons/missile-exhaust-03.png`
- Create: `assets/weapons/missile-smoke-01.png`, `assets/weapons/missile-smoke-02.png`, `assets/weapons/missile-smoke-03.png`
- Create: `assets/weapons/wizard-magic-orb.png`, `assets/weapons/boss-orange-shell.png`, `assets/weapons/boss-blue-bolt.png`
- Create: `assets/weapons/hit-machinegun.png`, `assets/weapons/hit-missile.png`, `assets/weapons/hit-laser.png`, `assets/weapons/hit-magic.png`, `assets/weapons/hit-orange-boss.png`, `assets/weapons/hit-blue-boss.png`
- Create: `assets/shadows/player-wing-shadow.png`, `assets/shadows/owl-wing-shadow.png`, `assets/shadows/drone-body-shadow.png`, `assets/shadows/bat-wing-shadow.png`, `assets/shadows/wizard-robes-shadow.png`, `assets/shadows/boss-orange-engine-shadow.png`, `assets/shadows/boss-blue-thruster-shadow.png`
- Create: `assets/scenery/water-perspective-loop.png`, `assets/scenery/water-topdown-loop.png`
- Create: `assets/scenery/perspective-segment-01.png` through `perspective-segment-06.png`
- Create: `assets/scenery/topdown-segment-01.png` through `topdown-segment-06.png`
- Create: `assets/scenery/cloud-mist-01.png`, `assets/scenery/cloud-mist-02.png`, `assets/scenery/cloud-mist-03.png`

**Interfaces:**
- Produces: `AssetManifest.effects`, `AssetManifest.characterShadows`, `AssetManifest.backgrounds`.
- Produces: `window.__renderStats = { ..., projectileDraws: [], impactDraws: [], shadowDraws: [], backgroundDraws: [] }` in test mode.
- Consumes: paths declared by the manifest only; every entry must resolve to one local PNG.

- [ ] **Step 1: 写失败的资源与绘制来源断言**

  In `page.add_init_script`, extend the render stats:

  ```js
  window.__renderStats = {
    gradients: 0, pixelSprites: [], assetDraws: [], sceneryDraws: [],
    projectileDraws: [], impactDraws: [], shadowDraws: [], backgroundDraws: []
  };
  ```

  After the initial preload assertions, add:

  ```python
  required = {
      "assets/weapons/player-muzzle-flash.png",
      "assets/weapons/wizard-magic-orb.png",
      "assets/weapons/boss-orange-shell.png",
      "assets/weapons/boss-blue-bolt.png",
      "assets/shadows/player-wing-shadow.png",
      "assets/shadows/boss-blue-thruster-shadow.png",
      "assets/scenery/water-topdown-loop.png",
      "assets/scenery/topdown-segment-01.png",
      "assets/scenery/topdown-segment-06.png",
  }
  assert required <= set(assets["loaded"])
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `python3 tests/browser-smoke.py`

  Expected: FAIL at the new required-assets assertion because the V2.3 paths are not yet in `AssetManifest`.

- [ ] **Step 3: 声明新增素材并维持预加载门禁**

  Add three manifest groups, preserving existing groups:

  ```js
  effects: {
    muzzleFlash: 'assets/weapons/player-muzzle-flash.png', bulletCore: 'assets/weapons/player-bullet-core.png', bulletTrail: 'assets/weapons/player-bullet-trail.png',
    exhaust01: 'assets/weapons/missile-exhaust-01.png', exhaust02: 'assets/weapons/missile-exhaust-02.png', exhaust03: 'assets/weapons/missile-exhaust-03.png',
    smoke01: 'assets/weapons/missile-smoke-01.png', smoke02: 'assets/weapons/missile-smoke-02.png', smoke03: 'assets/weapons/missile-smoke-03.png',
    wizardOrb: 'assets/weapons/wizard-magic-orb.png', orangeShell: 'assets/weapons/boss-orange-shell.png', blueBolt: 'assets/weapons/boss-blue-bolt.png',
    hitMachinegun: 'assets/weapons/hit-machinegun.png', hitMissile: 'assets/weapons/hit-missile.png', hitLaser: 'assets/weapons/hit-laser.png',
    hitMagic: 'assets/weapons/hit-magic.png', hitOrangeBoss: 'assets/weapons/hit-orange-boss.png', hitBlueBoss: 'assets/weapons/hit-blue-boss.png'
  },
  characterShadows: {
    playerWingShadow: 'assets/shadows/player-wing-shadow.png', owlWingShadow: 'assets/shadows/owl-wing-shadow.png', droneBodyShadow: 'assets/shadows/drone-body-shadow.png', batWingShadow: 'assets/shadows/bat-wing-shadow.png',
    wizardRobesShadow: 'assets/shadows/wizard-robes-shadow.png', orangeEngineShadow: 'assets/shadows/boss-orange-engine-shadow.png', blueThrusterShadow: 'assets/shadows/boss-blue-thruster-shadow.png'
  },
  backgrounds: {
    perspectiveWater: 'assets/scenery/water-perspective-loop.png', topdownWater: 'assets/scenery/water-topdown-loop.png',
    perspectiveSegment01: 'assets/scenery/perspective-segment-01.png', perspectiveSegment02: 'assets/scenery/perspective-segment-02.png', perspectiveSegment03: 'assets/scenery/perspective-segment-03.png', perspectiveSegment04: 'assets/scenery/perspective-segment-04.png', perspectiveSegment05: 'assets/scenery/perspective-segment-05.png', perspectiveSegment06: 'assets/scenery/perspective-segment-06.png',
    topdownSegment01: 'assets/scenery/topdown-segment-01.png', topdownSegment02: 'assets/scenery/topdown-segment-02.png', topdownSegment03: 'assets/scenery/topdown-segment-03.png', topdownSegment04: 'assets/scenery/topdown-segment-04.png', topdownSegment05: 'assets/scenery/topdown-segment-05.png', topdownSegment06: 'assets/scenery/topdown-segment-06.png',
    cloudMist01: 'assets/scenery/cloud-mist-01.png', cloudMist02: 'assets/scenery/cloud-mist-02.png', cloudMist03: 'assets/scenery/cloud-mist-03.png'
  }
  ```

  Keep `preloadAssets()` unchanged except for flattening the new groups; do not create image objects from the game loop.

- [ ] **Step 4: 制作并检查素材文件**

  Create each named PNG in the directory above. Effects and shadows must have alpha; water and terrain segments are opaque; cloud-mist images have alpha. Terrain segments must have water-only top and bottom margins and a central open flight corridor.

  Run:

  ```bash
  python3 - <<'PY'
  from pathlib import Path
  from PIL import Image
  required = [line.strip(" ',") for line in Path('index.html').read_text().splitlines() if "assets/" in line and ".png" in line]
  print('Use browser manifest assertion for exact paths; inspect new files with PIL.')
  for path in sorted(Path('assets').rglob('*.png')):
      Image.open(path).verify()
  PY
  ```

  Expected: every local PNG is readable; alpha is present on effects, shadows and cloud mist.

---

### Task 2: 不改变攻击逻辑的专属攻击与命中特效

**Files:**
- Modify: `tests/browser-smoke.py:80-220`
- Modify: `index.html:684-889,1130-1185`

**Interfaces:**
- Consumes: `shot.visualKey` from `shootEnemyBullet()` and effect images declared in Task 1.
- Produces: `drawProjectileEffect()` and `drawImpactEffect()` that draw cached assets only.
- Produces: `spawnImpactEffect(key, x, y)` storing short-lived visual state in `game.impactEffects`.

- [ ] **Step 1: 写失败的攻击映射测试**

  Add test helpers inside `window.__gameTest`:

  ```js
  addWizardShot() { game.enemyBullets = [{ id: -2, x: W / 2, y: 160, vx: 0, vy: 0, r: 13, damage: 30, destructible: true, life: 2, visualKey: 'wizardOrb' }]; },
  addBossShots() { game.enemyBullets = [{ id: -3, x: 420, y: 160, vx: 0, vy: 0, r: 8, damage: 15, destructible: false, life: 2, visualKey: 'orangeShell' }, { id: -4, x: 620, y: 160, vx: 0, vy: 0, r: 8, damage: 15, destructible: false, life: 2, visualKey: 'blueBolt' }]; }
  ```

  Then assert after each helper runs:

  ```python
  projectile_draws = page.evaluate("window.__renderStats.projectileDraws")
  assert {"bulletCore", "muzzleFlash", "missile", "wizardOrb", "orangeShell", "blueBolt"} <= set(projectile_draws)
  ```

- [ ] **Step 2: 运行测试确认失败**

  Run: `python3 tests/browser-smoke.py`

  Expected: FAIL because no projectile draw records or `visualKey` mapping exists.

- [ ] **Step 3: 以视觉键标记现有远程攻击**

  Change the signature without changing numeric arguments:

  ```js
  function shootEnemyBullet(x, y, angle, speed, damage, color = '#ff724d', destructible = false, visualKey = 'enemyBullet') {
    game.enemyBullets.push({ id: nextId++, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: destructible ? 13 : 8, damage, color, destructible, life: 7, visualKey });
  }
  ```

  Supply only existing attackers with these final arguments:

  ```js
  // wizard
  shootEnemyBullet(enemy.x - 12, enemy.y + 13, angle, 165, 30, '#8b62ff', true, 'wizardOrb');
  // orange BOSS fan
  shootEnemyBullet(boss.x, boss.y + 48, base + i * .18, 175, 15, '#ff6a45', false, 'orangeShell');
  // blue BOSS pair
  shootEnemyBullet(boss.x - 55, boss.y + 30, base - .09, 240, 15, '#55e8ff', false, 'blueBolt');
  shootEnemyBullet(boss.x + 55, boss.y + 30, base + .09, 240, 15, '#55e8ff', false, 'blueBolt');
  ```

  Do not add any `shootEnemyBullet()` call to eagle, drone or bat.

- [ ] **Step 4: 绘制玩家与敌方特效**

  Add these helpers beside `drawProjectiles()`:

  ```js
  function drawProjectileEffect(key, x, y, width, height, rotation = 0) {
    if (window.__testMode) window.__renderStats.projectileDraws.push(key);
    drawAsset(key, x, y, width, height, rotation);
  }
  function spawnImpactEffect(key, x, y) {
    game.impactEffects.push({ key, x, y, life: .22, maxLife: .22 });
  }
  ```

  Initialize `impactEffects: []` in `resetGame()`, decrement `life` in `updateParticles()`, and filter expired effects there. Draw the following mappings: player fire uses `muzzleFlash`, `bulletTrail`, `bulletCore`; homing uses `missile`, one cycling `exhaust01`–`exhaust03`, and one cycling `smoke01`–`smoke03`; laser uses `laser` plus `hitLaser`; enemy bullet uses `shot.visualKey`. On collision call only the matching impact key: `hitMachinegun`, `hitMissile`, `hitMagic`, `hitOrangeBoss`, or `hitBlueBoss`.

- [ ] **Step 5: 运行攻击测试与战斗规则测试**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: PASS, unchanged 15 combat rules.

  Run: `python3 tests/browser-smoke.py`

  Expected: PASS with the six required projectile keys drawn; no projectile key from owl, drone or bat.

---

### Task 3: 七类角色投影与无缝三层背景

**Files:**
- Modify: `tests/browser-smoke.py:80-220`
- Modify: `index.html:530-615,960-1005,1130-1200`

**Interfaces:**
- Consumes: Task 1 background and shadow asset keys.
- Produces: `SceneTheme` entries with `{ water, segments, mist }`, `drawInfiniteBackground(theme)`, and `drawCharacterShadow(key, x, y, width, height)`.

- [ ] **Step 1: 写失败的背景序列与投影断言**

  Add a test helper and assertions:

  ```js
  sceneSequence() { return getBackgroundSegmentKeys(activeSceneTheme); }
  ```

  ```python
  sequence = page.evaluate("window.__gameTest.sceneSequence()")
  assert sequence == ["topdownSegment01", "topdownSegment02", "topdownSegment03", "topdownSegment04", "topdownSegment05", "topdownSegment06"]
  shadows = page.evaluate("window.__renderStats.shadowDraws")
  assert {"playerWingShadow", "droneBodyShadow"} <= set(shadows)
  background = page.evaluate("window.__renderStats.backgroundDraws")
  assert {"topdownWater", "topdownSegment01", "cloudMist01"} <= set(background)
  ```

  Remove the old `bottom_center_is_grass` and `foreground_lake_pixels` assertions because their flat-grass opening frame no longer exists.

- [ ] **Step 2: 运行测试确认失败**

  Run: `python3 tests/browser-smoke.py`

  Expected: FAIL because the current implementation repeats one complete image and has only three generic shadow keys.

- [ ] **Step 3: 定义固定背景主题与连续区块绘制**

  Add static theme data near `activeSceneBackground`:

  ```js
  const SceneThemes = {
    perspective: { water: 'perspectiveWater', segments: ['perspectiveSegment01', 'perspectiveSegment02', 'perspectiveSegment03', 'perspectiveSegment04', 'perspectiveSegment05', 'perspectiveSegment06'], mist: ['cloudMist01', 'cloudMist02', 'cloudMist03'] },
    topdown: { water: 'topdownWater', segments: ['topdownSegment01', 'topdownSegment02', 'topdownSegment03', 'topdownSegment04', 'topdownSegment05', 'topdownSegment06'], mist: ['cloudMist01', 'cloudMist02', 'cloudMist03'] }
  };
  const activeSceneTheme = 'topdown';
  ```

  `drawInfiniteBackground(theme)` must draw the water tile first. Let `segmentHeight = H * 1.35` and `scroll = game.time * 34`; draw the current segment and enough following segments to cover the viewport. Select keys with `(Math.floor((scroll + y) / segmentHeight) % theme.segments.length + theme.segments.length) % theme.segments.length`, so the six-key sequence repeats only after all six segments. Draw `mist` at `scroll * .18`, `scroll * .26`, and `scroll * .34` with alpha below `.42`.

- [ ] **Step 4: 用角色轮廓投影替换通用投影**

  Map these exact keys in current draw functions:

  ```js
  drawPlayer -> 'playerWingShadow'
  drawEagle -> 'owlWingShadow'
  drawDrone -> 'droneBodyShadow'
  drawBat -> 'batWingShadow'
  drawWizard -> 'wizardRobesShadow'
  drawBoss brown -> 'orangeEngineShadow'
  drawBoss blue -> 'blueThrusterShadow'
  ```

  Keep `drawCharacterShadow()` unrotated; render it before the matching role asset. Do not alter movement, collision circles or enemy update functions.

- [ ] **Step 5: 运行完整验证并截图检查**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: PASS.

  Run: `python3 tests/browser-smoke.py`

  Expected: PASS with no external request, six top-down segment keys exposed in order, visible water/segment/mist draw records, unrotated role-shadow draw records, continuous animation and no console error.

  Inspect: `/tmp/airplane-battle-v2-3.png`

  Expected: open central water corridor, non-mirrored terrain, no direct full-background repetition and no old flat grass/runway layer.

---

### Task 4: 资产规则页、版本记录与最终完整性检查

**Files:**
- Modify: `全部资产清单.html`
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/superpowers/specs/2026-10-02-airplane-battle-v2-3-combat-effects-and-seamless-background-design.md`

**Interfaces:**
- Consumes: final asset paths and attack/shadow/background mappings.
- Produces: a readable V2.3 asset rule page with all final files, usages and exclusions.

- [ ] **Step 1: 更新资产规则页**

  Add sections for player firing, missile exhaust/smoke frames, magic orb, orange BOSS shell, blue BOSS bolt, six impact effects, seven character-shaped shadows and the two six-segment scene sets. State explicitly that owl, drone and bat have no ranged projectile.

- [ ] **Step 2: 更新变更记录与设计文档状态**

  Add a V2.3 changelog entry stating that remote behavior is unchanged, dedicated visual keys were added only for existing remote attacks, and the top-down theme uses six terrain segments. Change the design document title status from planned to implemented only after both automated checks pass.

- [ ] **Step 3: 最终素材完整性检查**

  Run:

  ```bash
  python3 - <<'PY'
  import re
  from pathlib import Path
  source = Path('index.html').read_text()
  paths = sorted(set(re.findall(r"assets/[A-Za-z0-9_./-]+\\.png", source)))
  missing = [path for path in paths if not Path(path).is_file()]
  assert not missing, missing
  print(f"manifest assets ok: {len(paths)}")
  PY
  node --test tests/game-logic.test.mjs
  python3 tests/browser-smoke.py
  ```

  Expected: all manifest assets exist; Node and browser checks pass; no Git command is run.
