# 运行资产清理与清单重整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 33 个不再使用的历史 PNG，保留两个完整背景，并让《全部资产清单》只展示当前运行资产。

**Architecture:** 先用静态回归测试锁定“删除后不得存在或被引用”的精确路径。随后从 `index.html` 的资源清单、磁盘和资产目录页同步移除这些路径；当前渲染、预加载、两个完整背景和提取脚本维持不变。

**Tech Stack:** 原生 HTML、JavaScript、Node.js 内置测试、项目内 PNG 资源。

## Global Constraints

- 仅删除已确认的 33 个 PNG；保留 `assets/source/extract_master_assets.py`。
- 必须保留 `assets/scenery/background-topdown.png` 与 `assets/scenery/background-perspective.png`，并继续在 `AssetManifest` 和资产清单中展示。
- 不改变战斗规则、HUD、背景循环、角色行为或任何保留图片的内容。
- `全部资产清单.html` 仅展示当前运行资产；不保留历史或已删除资产区。
- 不执行 Git 操作；由用户自行管理版本控制。

## File Structure

- `index.html`：从 `AssetManifest` 删除旧资源键和路径，其他游戏逻辑不改。
- `全部资产清单.html`：重组为角色、武器与 HUD、独立投影、俯视背景层、斜视背景层和完整背景六类。
- `tests/game-logic.test.mjs`：验证删除路径不再存在或被引用，两个完整背景仍保留。
- `assets/source/master-pixel-assets.png`：删除。
- `assets/scenery/`：删除 22 个旧场景 PNG。
- `assets/shadows/`：删除 3 个旧投影 PNG。
- `assets/weapons/`：删除 7 个旧武器 PNG。
- `docs/CHANGELOG.md`：记录资产清理和清单重整。

---

### Task 1: 建立删除与保留的回归测试

**Files:**
- Modify: `tests/game-logic.test.mjs:1-12, 文件末尾`

**Interfaces:**
- Consumes: 精确删除路径集合 `removedAssetPaths` 与完整背景路径集合 `retainedBackgroundPaths`。
- Produces: `runtime asset catalog excludes removed files` 测试，供删除和清单重整共同使用。

- [x] **Step 1: 写出会失败的资源清理测试**

  在测试文件顶部定义：

  ```js
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
  ```

  在文件末尾新增：

  ```js
  test('runtime asset catalog excludes removed files and retains both full backgrounds', () => {
    for (const path of removedAssetPaths) {
      const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.equal(fs.existsSync(new URL(`../${path}`, import.meta.url)), false, `${path} must be deleted`);
      assert.doesNotMatch(html, new RegExp(escaped));
      assert.doesNotMatch(assetCatalog, new RegExp(escaped));
    }
    for (const path of retainedBackgroundPaths) {
      assert.equal(fs.existsSync(new URL(`../${path}`, import.meta.url)), true, `${path} must remain`);
      assert.match(html, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.match(assetCatalog, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  });
  ```

- [x] **Step 2: 运行测试确认失败**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: FAIL，首个失败为 `assets/source/master-pixel-assets.png must be deleted`；现有战斗规则测试保持通过。

### Task 2: 删除确认的 PNG 并清理预加载清单

**Files:**
- Modify: `index.html:473-498`
- Delete: `assets/source/master-pixel-assets.png`
- Delete: `assets/scenery/topdown-segment-01.png` 至 `topdown-segment-06.png`
- Delete: `assets/scenery/perspective-segment-01.png` 至 `perspective-segment-06.png`
- Delete: `assets/scenery/sky.png`, `cloud-01.png`, `cliff-mountain.png`, `grassland.png`, `river-lake.png`, `waterfall.png`, `pine-tree.png`, `broadleaf-tree.png`, `bush-flower.png`, `rock.png`
- Delete: `assets/shadows/player-shadow.png`, `boss-shadow.png`, `enemy-shadow.png`
- Delete: `assets/weapons/player-bullet.png`, `magic-orb.png`, `fragment-homing.png`, `fragment-laser.png`, `hit-spark.png`, `explosion.png`, `player-muzzle-flash.png`

**Interfaces:**
- Consumes: `removedAssetPaths` 的 33 项精确目标。
- Produces: 不含历史键的 `AssetManifest`；保留的 `backgroundTopdown` 和 `backgroundPerspective` 资源键。

- [x] **Step 1: 从 `AssetManifest` 移除旧资源声明**

  删除 `weapons` 中的 `bullet`、`magicOrb`、`homingFragment`、`laserFragment`、`hitSpark`、`explosion`、`muzzleFlash`；删除 `shadows` 中的 `playerShadow`、`bossShadow`、`enemyShadow`；删除整个旧 `scenery` 资源组；删除 `sceneThemes` 中 12 个 `topdownSegment*`、`perspectiveSegment*` 键。保留 `sceneThemes.backgroundTopdown` 和 `sceneThemes.backgroundPerspective`。

- [x] **Step 2: 删除 33 个已确认 PNG**

  使用精确文件路径删除，不使用通配符或递归删除；删除后保留 `assets/source/extract_master_assets.py`。

- [x] **Step 3: 运行逻辑测试确认通过**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: PASS；删除路径既不存在也不再出现在运行 HTML 或资产清单中，两个完整背景仍存在。

### Task 3: 重整《全部资产清单》与记录变更

**Files:**
- Modify: `全部资产清单.html:资产导航、groups、planned 数据和渲染逻辑`
- Modify: `docs/CHANGELOG.md:3-8`
- Test: `tests/game-logic.test.mjs`

**Interfaces:**
- Consumes: Task 2 保留的运行资产路径。
- Produces: 只包含当前运行资产的六类资产目录。

- [x] **Step 1: 重组资产目录数据**

  移除 `scenery-grid` 中的 10 项旧场景小图，移除 `background-plan-grid` 中的 12 项旧地形区块，并删除所有对应条目。将运行中景观显式分为两个新网格：

  ```js
  'topdown-background-grid': [
    ['俯视循环水面', '俯视背景', '纯水面底图。', 'assets/scenery/water-topdown-loop.png'],
    ['俯视云雾 01', '俯视背景', '低速漂移云雾。', 'assets/scenery/cloud-mist-01.png'],
    ['俯视透明岛屿 01', '俯视景观', '瀑布岩岛。', 'assets/scenery/topdown-island-01.png']
  ],
  'perspective-background-grid': [
    ['斜视循环水面', '斜视背景', '纯水面底图。', 'assets/scenery/water-perspective-loop.png'],
    ['斜视透明峡谷 01', '斜视景观', '独立前景峡谷。', 'assets/scenery/perspective-island-01.png']
  ]
  ```

  补全俯视网格的 3 个云雾和 7 项俯视景观、斜视网格的 3 项斜视景观；角色、当前武器/HUD、当前独立投影保持原有卡片形式。两个完整背景仍保留在 `backgrounds` 区。

- [x] **Step 2: 更新导航和运行时渲染目标映射**

  导航替换“景观图块”为“俯视背景层”和“斜视背景层”。删除 `planned` 对旧背景区块的聚合逻辑，直接将所有保留资产放入 `groups`，使每张卡片引用其实际路径。

- [x] **Step 3: 更新变更记录**

  在 `docs/CHANGELOG.md` 顶部增加“运行资产清理与清单重整 - 2026-10-03”，记录删除 33 个旧 PNG、保留两个完整背景及提取脚本、资产清单仅展示运行资产。

- [x] **Step 4: 完成验证**

  Run:

  ```bash
  node --test tests/game-logic.test.mjs
  node -e 'const fs=require("fs"); const html=fs.readFileSync("index.html","utf8"); const scripts=[...html.matchAll(/<script(?: id="[^"]+")?>([\s\S]*?)<\/script>/g)].map(match=>match[1]); for (const script of scripts) new Function(script); console.log("inline scripts parsed: " + scripts.length);'
  ```

  Expected: Node 测试全绿；两段 `index.html` 内联脚本可解析；资产清单和运行 HTML 无已删除路径。
