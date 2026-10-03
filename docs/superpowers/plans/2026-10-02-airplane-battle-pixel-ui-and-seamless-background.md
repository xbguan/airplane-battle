# 飞机大战像素 UI 与无缝背景 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将游戏弹框、HUD、武器操作区、机枪反馈和两套背景升级为统一的本地 2.5D 卡通像素风，并消除背景拼贴硬边。

**Architecture:** 所有可动 UI 图标、炮口火花和景观层均为项目内预加载 PNG，由现有 `AssetManifest` 缓存后在 DOM 或 Canvas 使用。背景渲染保持水面底层循环，但停止绘制矩形场景片段，改为透明景观层的非对称序列循环；不改战斗规则与数据结构。

**Tech Stack:** 原生 HTML、CSS、JavaScript、Canvas 2D、本地 PNG、Node 内置测试。

## Global Constraints

- `index.html` 是唯一可玩源码；不引入依赖、构建工具、CDN 或外部字体。
- 不改变伤害、升级、碎片、武器冷却、缓存和性能上限。
- 角色、武器和 UI 素材透明背景；场景素材不含角色、武器或 HUD。
- 新增资源预加载并缓存；主循环不创建 `Image`、渐变、阴影或高频音频节点。
- 新增资源必须合并列入 `全部资产清单.html`。
- 不执行 Git 操作。

---

### Task 1: 建立视觉契约测试与素材清单入口

**Files:**
- Modify: `tests/game-logic.test.mjs`
- Modify: `全部资产清单.html`

**Interfaces:**
- Consumes: `index.html` 的 HTML 源文本和 `AssetManifest`。
- Produces: 失败后转绿的静态契约测试；资产清单中可追加的“UI 与武器图标”“景观图块”条目数组。

- [x] **Step 1: 写失败的 UI 与背景契约测试**

  在 `tests/game-logic.test.mjs` 添加：

  ```js
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
    assert.match(html, /perspectiveIsland0[1-3]/);
    assert.doesNotMatch(html, /const prefix = topdown \? 'topdownSegment' : 'perspectiveSegment';/);
  });
  ```

- [x] **Step 2: 运行测试，确认失败**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: 新增测试因缺少新清单键、仍存在 `.version` 和旧 `prefix` 而失败。

- [x] **Step 3: 为新增资产预留清单条目**

  在 `全部资产清单.html` 的已有动态 `planned` / 分组数据中添加上述 5 个 UI 与武器 PNG，以及两套各 3 个透明岛屿景观 PNG。每项显示真实文件名、用途和透明背景/无角色约束；不新增 V2.x 独立分区。

- [x] **Step 4: 复跑测试，确认仍只因游戏尚未接入而失败**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: 既有规则测试继续通过；新增静态契约仍失败，失败原因仅为 `index.html` 尚未接入。

### Task 2: 制作并验证透明像素 UI、炮口与景观素材

**Files:**
- Create: `assets/weapons/player-muzzle-flash-v2.png`
- Create: `assets/weapons/ui-attack-upgrade.png`
- Create: `assets/weapons/ui-machinegun.png`
- Create: `assets/weapons/ui-homing-missile.png`
- Create: `assets/weapons/ui-laser-cannon.png`
- Create: `assets/scenery/topdown-island-01.png`
- Create: `assets/scenery/topdown-island-02.png`
- Create: `assets/scenery/topdown-island-03.png`
- Create: `assets/scenery/perspective-island-01.png`
- Create: `assets/scenery/perspective-island-02.png`
- Create: `assets/scenery/perspective-island-03.png`

**Interfaces:**
- Consumes: 用户确认的精致 2.5D 卡通像素主图标准、`assets/characters/player-fighter.png`、水面循环底图。
- Produces: 可被 `AssetManifest` 直接预加载的透明 PNG；所有景观边缘为透明或水面过渡。

- [x] **Step 1: 生成炮口与操作区素材**

  生成黄白四角短火花、炮弹加上箭头、双列机枪、追踪导弹、激光发射器 5 张独立 PNG。炮口火花画布必须紧凑，只含火花本体，不含战机或留白裁切；其他图标按 1:1 武器格设计。

- [x] **Step 2: 生成两套透明景观层**

  每套生成 3 张自然不对称的岛屿/峡谷 PNG。俯视组为近 90° 河谷岛屿；斜视组为前后层级明显的峡谷岛屿。禁止矩形底板、圆角面板、角色、武器和文字。

- [x] **Step 3: 校验素材透明度与独立性**

  Run: `sips -g hasAlpha assets/weapons/player-muzzle-flash-v2.png assets/weapons/ui-attack-upgrade.png assets/weapons/ui-machinegun.png assets/weapons/ui-homing-missile.png assets/weapons/ui-laser-cannon.png assets/scenery/topdown-island-01.png assets/scenery/topdown-island-02.png assets/scenery/topdown-island-03.png assets/scenery/perspective-island-01.png assets/scenery/perspective-island-02.png assets/scenery/perspective-island-03.png`

  Expected: 所有结果为 `hasAlpha: yes`；目视检查每张移动物件仅含一个完整对象，景观层无矩形水面底板。

### Task 3: 接入小弹框、像素文字与素材化 HUD

**Files:**
- Modify: `index.html:1-306`
- Modify: `index.html:428-463`
- Test: `tests/game-logic.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `ui*` PNG 和既有 `player`、`homingFragment`、`laserFragment` 资产键。
- Produces: `.modal-fighter`、`.pixel-copy`、`.ui-asset-icon` CSS 类和 UI 资产映射。

- [x] **Step 1: 在 `AssetManifest` 加入 UI PNG 键**

  将 5 个文件加入 `weapons` 映射：`playerMuzzleFlashV2`、`uiAttackUpgrade`、`uiMachinegun`、`uiHomingMissile`、`uiLaserCannon`。删除旧 `muzzleFlash` 的渲染引用前保留文件本身，避免删除无关资产。

- [x] **Step 2: 收紧开始与结算弹框**

  将 `.panel` 最大宽度从 `650px / 64vw` 收至 `500px / 48vw`，缩小内边距。把 `.plane-mark` 替换为使用 `player-fighter.png` 的 `<img class="modal-fighter">`；开始与结算面板各加入 `<p class="panel-version pixel-copy">飞机大战 · V2.2</p>`。删除 `<div class="version">`。

- [x] **Step 3: 替换 HUD 操作区的文字和 CSS 图标**

  让两个碎片按钮在文字前放置对应既有 `<img>`；攻击升级按钮内放置 `uiAttackUpgrade`；右下三个格分别使用 `uiMachinegun`、`uiHomingMissile`、`uiLaserCannon`。`updateHud()` 只更新独立的文本节点，不用 `textContent` 覆盖图标。

- [x] **Step 4: 将所有新文字样式接入像素模拟字**

  添加 `.pixel-copy` 和按钮文本的局部样式：等宽系统字体、1px/2px 阶梯深色阴影、字距 `.04em`；不影响 Canvas 浮字、敌人血条或战斗数值。

- [x] **Step 5: 运行测试，确认 UI 契约转绿**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: 新增 UI 契约通过，既有 20 项战斗测试继续通过。

### Task 4: 修复机枪炮口与“哒哒哒”音效

**Files:**
- Modify: `index.html:500-580`
- Modify: `index.html:1204-1212`
- Test: `tests/game-logic.test.mjs`

**Interfaces:**
- Consumes: `assets.playerMuzzleFlashV2` 和现有 `playSound(name)` 缓存音频机制。
- Produces: `machinegun` 音色定义与左、右枪口固定渲染位置。

- [x] **Step 1: 写失败的机枪契约测试**

  添加：

  ```js
  test('machinegun uses a short cached dada cadence and the v2 muzzle asset', () => {
    assert.match(html, /'machinegun':/);
    assert.match(html, /playerMuzzleFlashV2/);
    assert.match(html, /Math\.floor\(game\.time \/ \.09\)/);
  });
  ```

- [x] **Step 2: 运行测试，确认失败**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: 缺少 `machinegun` 音色与 `.09` 节奏，测试失败。

- [x] **Step 3: 最小接入机枪音效与炮口火花**

  在既有缓存音色定义增加低频噪声加短脉冲的 `machinegun`；以 `.09` 秒槽位限频调用。`drawPlayer()` 仅在当前槽位的短开火窗绘制 `playerMuzzleFlashV2`，位置以玩家资产两侧枪管末端为基准，宽高不超过 `8 × 8` 逻辑像素。

- [x] **Step 4: 复跑测试，确认转绿**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: 机枪新契约与全部既有测试通过。

### Task 5: 用透明景观层替换矩形背景区块

**Files:**
- Modify: `index.html:428-463`
- Modify: `index.html:1021-1044`
- Test: `tests/game-logic.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `topdownIsland01..03`、`perspectiveIsland01..03` 与既有水面/云雾键。
- Produces: `BackgroundLayouts`，值为两种主题的非相邻重复景观序列；`drawBackground()` 仅绘制水面、透明景观与云雾。

- [x] **Step 1: 将六个景观 PNG 加入 `AssetManifest.scenery`**

  映射键为 `topdownIsland01` 到 `topdownIsland03`、`perspectiveIsland01` 到 `perspectiveIsland03`，路径与 Task 2 文件严格一致。

- [x] **Step 2: 定义非对称布局并替换旧区块循环**

  在 `drawBackground()` 之前新增：

  ```js
  const BackgroundLayouts = {
    backgroundTopdown: [
      ['topdownIsland01', .18, 45, 292, 208],
      ['topdownIsland02', .78, 270, 270, 198],
      ['topdownIsland03', .42, 510, 308, 220]
    ],
    backgroundPerspective: [
      ['perspectiveIsland01', .22, 65, 314, 216],
      ['perspectiveIsland02', .80, 320, 282, 204],
      ['perspectiveIsland03', .47, 590, 326, 228]
    ]
  };
  ```

  水面按既有方式连续循环；按主题读取布局，使用不同速度偏移循环景观。删除绘制 `topdownSegment01..06` / `perspectiveSegment01..06` 的旧 `prefix` 和 6 项位置循环。

- [x] **Step 3: 运行完整静态、逻辑与资源验证**

  Run: `node --test tests/game-logic.test.mjs && node -e "const fs=require('fs');const s=fs.readFileSync('index.html','utf8');for(const code of [...s.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)].map(m=>m[1]))new Function(code);console.log('inline scripts: syntax ok')" && node -e "const fs=require('fs');const s=fs.readFileSync('index.html','utf8');const paths=[...s.matchAll(/['\\\"](assets\\/[^'\\\"]+\\.png)['\\\"]/g)].map(m=>m[1]);const missing=[...new Set(paths)].filter(p=>!fs.existsSync(p));console.log('missing:',missing);process.exit(missing.length)"`

  Expected: 全部测试通过、脚本语法正确、缺失资源列表为空。

### Task 6: 更新交付文档与浏览器验证

**Files:**
- Modify: `全部资产清单.html`
- Modify: `docs/CHANGELOG.md`
- Test: `tests/browser-smoke.py`

**Interfaces:**
- Consumes: 已接入的所有新增资源及验证结果。
- Produces: 可读资产规则页和准确的变更记录。

- [x] **Step 1: 完整核对资产清单**

  打开 `全部资产清单.html`，确认 5 个 UI/武器图标和 6 个景观层各有缩略图、路径、用途；不显示“V2.3”独立分区或旧数量统计。

- [x] **Step 2: 追加变更记录**

  在 `docs/CHANGELOG.md` 顶部以日期记录：小弹框、弹框内版本字、素材化 HUD、机枪火花/音效、无缝透明景观层及资产清单同步；明确战斗数值未变。

- [x] **Step 3: 运行浏览器烟测**

  Run: `python3 tests/browser-smoke.py`

  Expected: 画布持续动画、无控制台错误；若 Playwright 在页面加载前被 macOS Chromium `SIGTRAP` 阻断，记录完整错误但不得称浏览器验证通过。

- [x] **Step 4: 交付前重复完整验证**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: 所有测试通过；最终报告静态、资源和浏览器验证的实际结果。
