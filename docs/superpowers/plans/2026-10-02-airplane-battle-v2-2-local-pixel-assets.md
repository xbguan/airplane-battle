# 《飞机大战》V2.2 本地精致像素素材 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以用户确认的精致 2.5D 像素素材主图为标准，使用独立透明 PNG 替换全部 Canvas 方块角色、武器和景观，并将可动对象投影作为独立图层，同时不改变 V2.1 战斗规则。

**Architecture:** 在 `assets/` 中存放分组 PNG，并在 `index.html` 启动时通过固定清单预加载为图片缓存。战斗对象继续使用既有坐标、缩放、旋转、碰撞和更新逻辑，只把绘制来源由 `makeSprite` 改为预加载图片；景观使用天空底图和可重复的前中后景图块维持滚动层次。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Canvas 2D、本地 PNG、Node 内置测试运行器、Python Playwright、ImageGen 原创图片生成。

## 全局约束

- 只使用项目内 `assets/` 的原创本地 PNG；禁止 CDN、远程 URL、框架、构建工具和第三方运行时依赖。
- 角色、武器、景观必须匹配用户确认主图的圆润卡通、粗深色轮廓、多级高光阴影和高细节 2.5D 像素风；禁止退化为扁平方块或 emoji。
- 保留 V2.1 的数值、碎片两枚均衡掉落、激光/导弹间隔、BOSS 成长和蓝色 BOSS 入场修复。
- 图片透明背景用于所有角色、武器和投影；投影只跟随位置、不随角色旋转。天空、草地、水体、山崖与云可使用完整矩形景观图块；场景不得混入角色或武器。
- 所有图片在开始游戏前预加载并缓存；主循环不得创建 `Image`、渐变、阴影或高频音频节点。
- 同时预加载 `background-perspective.png` 与 `background-topdown.png` 两张完整纯场景背景；默认绘制斜视峡谷，俯视河谷仅按用户后续指令切换。两版景观自然不对称，中央航线保持开阔。
- 不覆盖 V1、V2、V2.1 快照；本项目不执行 Git 操作。

---

### Task 1: 固定素材清单与失败的资源加载测试

**Files:**
- Modify: `tests/browser-smoke.py:8-205`
- Modify: `index.html:401-430,1201`

**Interfaces:**
- Produces: `const AssetManifest = { characters: {...}, weapons: {...}, shadows: {...}, scenery: {...} }`，每个值是相对 `assets/` 的本地 PNG 路径。
- Produces: `window.__assetStats = { expected: [], loaded: [], failed: [], external: [] }`，仅在 `window.__testMode` 下用于浏览器断言。
- Consumes: `preloadAssets(manifest)` 返回解析为 `{ key: HTMLImageElement }` 的 Promise。

- [ ] **Step 1: 先写失败浏览器断言**

  在 `page.add_init_script` 添加资源统计对象；在点击“开始出击”前加入：

  ```python
  assets = page.evaluate("window.__assetStats")
  assert set(assets["expected"]) == set(assets["loaded"]), f"Unloaded assets: {assets}"
  assert assets["failed"] == []
  assert assets["external"] == []
  assert len(assets["loaded"]) == 29
  ```

  在 `page.on("request")` 中记录任何 URL 的 host 不为 `127.0.0.1` 或 `localhost` 的请求到 `window.__assetStats.external`。

- [ ] **Step 2: 运行冒烟测试确认失败**

  Run: `python3 -m http.server 8765`（单独终端保持运行），再运行 `python3 tests/browser-smoke.py`

  Expected: FAIL，当前页面未定义 `window.__assetStats`，也没有资源预加载器。

- [ ] **Step 3: 添加固定清单与预加载门禁**

  在游戏脚本顶层声明以下路径清单：

  ```js
  const AssetManifest = {
    characters: {
      player: 'assets/characters/player-fighter.png', orangeBoss: 'assets/characters/boss-orange-white.png',
      blueBoss: 'assets/characters/boss-blue-white.png', owl: 'assets/characters/owl.png',
      drone: 'assets/characters/drone.png', bat: 'assets/characters/bat.png', wizard: 'assets/characters/wizard.png'
    },
    weapons: {
      bullet: 'assets/weapons/player-bullet.png', missile: 'assets/weapons/homing-missile.png', laser: 'assets/weapons/laser-segment.png',
      enemyBullet: 'assets/weapons/enemy-bullet.png', magicOrb: 'assets/weapons/magic-orb.png', homingFragment: 'assets/weapons/fragment-homing.png',
      laserFragment: 'assets/weapons/fragment-laser.png', hitSpark: 'assets/weapons/hit-spark.png', explosion: 'assets/weapons/explosion.png'
    },
    shadows: {
      playerShadow: 'assets/shadows/player-shadow.png', bossShadow: 'assets/shadows/boss-shadow.png', enemyShadow: 'assets/shadows/enemy-shadow.png'
    },
    scenery: {
      sky: 'assets/scenery/sky.png', cloud: 'assets/scenery/cloud-01.png', cliff: 'assets/scenery/cliff-mountain.png', grass: 'assets/scenery/grassland.png',
      water: 'assets/scenery/river-lake.png', waterfall: 'assets/scenery/waterfall.png', pine: 'assets/scenery/pine-tree.png', broadleaf: 'assets/scenery/broadleaf-tree.png', bush: 'assets/scenery/bush-flower.png', rock: 'assets/scenery/rock.png'
    }
  };
  ```

  Flatten the manifest, set the start button disabled during loading, and load each local path exactly once. On success, store by key in `assets`, enable start, and record in test stats. On failure, keep start disabled and put the path in `failed`; never substitute an emoji or Canvas fallback.

- [ ] **Step 4: Run the focused browser test after the placeholder loader exists**

  Run: `python3 tests/browser-smoke.py`

  Expected: FAIL only because the 29 PNG files do not yet exist; the failure output lists the missing local paths and no external URL.

### Task 2: 生成并落位用户确认的本地 PNG 素材

**Files:**
- Create: every PNG declared by `AssetManifest` under `assets/characters/`, `assets/weapons/`, `assets/shadows/`, `assets/scenery/`
- Reference: user-confirmed master material image attached in this conversation

**Interfaces:**
- Produces: 29 loadable PNG files using the exact manifest paths from Task 1.
- Consumes: the user-confirmed master image solely as the style and object reference for original asset generation.

- [ ] **Step 1: 生成角色 PNG**

  Use ImageGen with the confirmed master image as reference and `transparent_background: true`. Generate one asset per output path. The prompt must include the requested mapping and prohibit text/UI/background:

  ```text
  Create an original standalone game sprite matching the supplied reference's polished 2.5D cartoon pixel-art quality: [OBJECT].
  Rounded child-friendly proportions, thick dark pixel outline, rich multi-step highlights and shadows, clear readable silhouette, crisp pixel clusters.
  Transparent background only; one centered object; no text, no UI, no scenery, no collage.
  ```

  Use `[OBJECT]` respectively for the blue-white player fighter, orange-white star-emblem heavy boss, blue-white star-emblem fast boss, owl, one-eyed drone, one-eyed bat, and purple-robed wizard.

- [ ] **Step 2: 生成武器 PNG**

  Use the same reference and transparent-background prompt for all nine weapon paths. The required objects are: orange-white machine-gun bullet, red-white homing missile with blue window and orange flame, blue-white laser segment, blue enemy energy bullet, purple-pink magic orb, orange homing crystal, cyan laser crystal, star-shaped hit spark, and compact orange-blue explosion.

- [ ] **Step 3: 生成景观 PNG**

  Generate the ten scenery paths using the confirmed reference's forest canyon visual language. `cloud-01.png`, `cliff-mountain.png`, `pine-tree.png`, `broadleaf-tree.png`, `bush-flower.png`, and `rock.png` use transparent backgrounds. `sky.png`, `grassland.png`, `river-lake.png`, and `waterfall.png` are opaque rectangular tiles. Do not include any character, weapon, text, HUD, watermark, or external brand.

- [ ] **Step 4: 检查文件清单**

  Run: `rg --files assets | sort`

  Expected: exactly the 29 declared local PNG paths. Three independent transparent shadows are included: player, BOSS and ordinary enemy. Four scene composition paths (`sky`, `grass`, `water`, `waterfall`) count as scenery files; total manifest count is 29 and the browser assertion from Task 1 must use `len(assets["loaded"]) == 29`.

### Task 3: 使用预加载 PNG 重建战斗对象绘制

**Files:**
- Modify: `index.html:895-1150`
- Modify: `tests/browser-smoke.py:70-205`

**Interfaces:**
- Consumes: `assets.player`, `assets.orangeBoss`, `assets.blueBoss`, `assets.owl`, `assets.drone`, `assets.bat`, `assets.wizard`, and weapon image cache from Task 1.
- Produces: `drawAsset(image, x, y, width, height, rotation, alpha)` as the sole player/enemy/BOSS/projectile drawing helper.

- [ ] **Step 1: 写出失败的画面来源测试**

  Add test-only render counters and assertions:

  ```python
  render = page.evaluate("window.__renderStats")
  assert render["assetDraws"]["player"] > 0
  assert render["assetDraws"]["drone"] > 0
  assert render["assetDraws"]["playerBullet"] > 0
  assert render["assetDraws"]["missile"] > 0
  assert render["assetDraws"]["laser"] > 0
  ```

  Equip the existing test target with laser and homing exactly as the current smoke test does; `drawAsset` records counts only in test mode.

- [ ] **Step 2: 运行测试确认失败**

  Run: `python3 tests/browser-smoke.py`

  Expected: FAIL because existing `paintPlayer`, `paintBoss`, and `drawProjectiles` still use Canvas shapes rather than image cache counters.

- [ ] **Step 3: 替换角色和武器绘制**

  Remove the V2.1 rectangle painters and cached shape construction for player, BOSS, owl, drone, bat, wizard, fireball, and missile. Implement one draw helper:

  ```js
  function drawAsset(key, x, y, width, height, rotation = 0, alpha = 1) {
    const image = assets[key];
    if (!image) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(x, y); ctx.rotate(rotation); ctx.globalAlpha = alpha;
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
    if (window.__testMode) window.__renderStats.assetDraws[key] = (window.__renderStats.assetDraws[key] || 0) + 1;
  }
  ```

  Map `eagle` game behavior to the confirmed `owl` image without changing its dive behavior or `enemyStats` key. Map existing brown/blue BOSS variants to `orangeBoss`/`blueBoss`. Render player bullets, missiles, laser segments, enemy bullets, magic orbs, fragments, hit sparks and explosions from their corresponding assets. Existing collision radii and damage code stay unchanged.

- [ ] **Step 4: 运行浏览器测试确认通过**

  Run: `python3 tests/browser-smoke.py`

  Expected: PASS with all required asset-draw counters above zero, 29 local assets loaded, canvas animation, weapon cadence and no console errors.

### Task 4: 使用景观图块替换平面背景和方块景物

**Files:**
- Modify: `index.html:916-950,1035-1075`
- Modify: `tests/browser-smoke.py`

**Interfaces:**
- Consumes: cached `assets.sky`, `assets.cloud`, `assets.cliff`, `assets.grass`, `assets.water`, `assets.waterfall`, `assets.pine`, `assets.broadleaf`, `assets.bush`, `assets.rock`.
- Produces: `drawSceneryAsset(key, x, y, width, height, alpha)` and test-only `renderStats.sceneryDraws` counters.

- [ ] **Step 1: 写出失败景观断言**

  Replace the current color-only lake assertion with:

  ```python
  scenery = page.evaluate("window.__renderStats.sceneryDraws")
  assert all(scenery.get(key, 0) > 0 for key in ["sky", "cloud", "cliff", "grass", "water", "waterfall", "pine", "broadleaf", "bush", "rock"])
  ```

  Keep the canvas animation and no-console-error checks.

- [ ] **Step 2: 运行测试确认失败**

  Update the browser test screenshot path to `/tmp/airplane-battle-v2-2.png`.

  Run: `python3 tests/browser-smoke.py`

  Expected: FAIL because `drawBackground` and `drawScenery` currently use gradient/ellipse/vector scenery.

- [ ] **Step 3: 最小替换景观渲染**

  Do not cut the master composite into arbitrary small background tiles. Draw two same-width opaque sky/grass background strips end-to-end on the vertical scroll axis; when one leaves the bottom, wrap it above the other. Draw cloud/cliff/waterfall as independent middle-distance overlays, then water/pine/broadleaf/bush/rock as transparent foreground props. Use fixed seeded initial positions so the opening frame has visible cloud, cliff, water and plant layers. Retain the existing `updateScenery` depth-based movement; replace `sprites.tree`, `sprites.bush`, and `sprites.lake` only with image keys.

- [ ] **Step 4: 运行浏览器测试确认通过并截图检查**

  Run: `python3 tests/browser-smoke.py`

  Expected: PASS. Inspect `/tmp/airplane-battle-v2-2.png`: forest canyon materials, layered clouds, cliff, grass, water, trees, bushes and rocks are visible; no flat perspective grid remains.

### Task 5: V2.2 文档、快照和最终验证

**Files:**
- Modify: `index.html` visible version strings
- Create: `versions/airplane-battle-v2-2.html`
- Modify: `README.md`
- Modify: `docs/CHANGELOG.md`

**Interfaces:**
- Consumes: final verified `index.html`, `assets/` files and browser test.
- Produces: V2.2 entry point, exact V2.2 snapshot and documented local-assets structure.

- [ ] **Step 1: 更新版本说明**

  Change page title, start page and in-game version label to V2.2. Update README with the `assets/` structure and local-only image loading. Add a V2.2 changelog entry for independent local pixel assets, image preloading and scene replacement.

- [ ] **Step 2: 创建快照**

  Copy the final verified `index.html` to `versions/airplane-battle-v2-2.html`; do not copy the `assets/` directory into `versions/` because the snapshot references the shared immutable asset paths.

- [ ] **Step 3: 运行完整验证**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: PASS.

  Run: `python3 tests/browser-smoke.py`

  Expected: PASS with all 29 local assets loaded, no external request, all combat and scenery draw counters present, preserved cadence checks, continuous canvas animation and no console error.

  Run: `cmp -s index.html versions/airplane-battle-v2-2.html`

  Expected: exit code 0.

  Run: `cmp -s index.html versions/airplane-battle-v1.html`, `cmp -s index.html versions/airplane-battle-v2.html`, and `cmp -s index.html versions/airplane-battle-v2-1.html`

  Expected: each returns exit code 1, proving old snapshots were not overwritten.
