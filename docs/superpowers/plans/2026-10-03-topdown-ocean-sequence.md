# 俯视海洋景观序列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变原有俯视构图和战斗规则的前提下，将俯视海洋景观扩展为已确认的 7 项，并以单一连续序列消除独立重置造成的突兀跳变。

**Architecture:** 先只在《全部资产清单》中建立 4 项新增素材的待确认条目，此阶段是硬性停点。用户确认后，生成透明 PNG 并将待确认条目转为可预览资产；随后为俯视背景单独使用固定锚点、统一滚动偏移和完整序列长度，斜视背景与水面、云雾逻辑保持原状。

**Tech Stack:** 原生 HTML、CSS、JavaScript Canvas、Node.js 内置测试、Playwright Python 冒烟测试、本地 PNG 素材。

## Global Constraints

- 只改本计划列出的文件；不改变战斗数值、升级、碎片、武器、缓存与性能上限。
- 所有新增或修改 PNG 必须先形成 `全部资产清单.html` 的待确认条目；用户确认前，不生成/替换 PNG，不接入 `index.html`。
- 新增素材必须是项目内原创透明 PNG，放在 `assets/scenery/`；不引入框架、CDN、在线资源或第三方依赖。
- 保留原有俯视海面的自然错位感觉；不设置中央禁布区、固定留白比例或直视航道。
- 预加载并缓存新增素材；主循环不创建 `Image`、渐变、阴影或高频音频节点。
- 不执行 Git 操作；由用户自行管理版本控制。

## File Structure

- `全部资产清单.html`：先呈现 4 项待确认景观，确认后转为实际预览条目。
- `assets/scenery/topdown-reef-01.png`：确认后新增的弯月形浅海珊瑚礁透明 PNG。
- `assets/scenery/topdown-reef-02.png`：确认后新增的分散小礁群与海草透明 PNG。
- `assets/scenery/topdown-islet-01.png`：确认后新增的小型岩石孤岛与单棵松树透明 PNG。
- `assets/scenery/topdown-islet-02.png`：确认后新增的低矮沙洲、礁石与小花透明 PNG。
- `index.html`：登记、预加载和渲染新增景观；俯视景观改为统一偏移的完整循环序列。
- `tests/game-logic.test.mjs`：验证待确认清单、7 项俯视序列和统一循环数学。
- `tests/browser-smoke.py`：验证新增资产均加载、画布持续动画且控制台无错误。
- `docs/CHANGELOG.md`：记录本轮景观扩充和循环修复。

---

### Task 1: 建立可确认的素材清单（硬性停点）

**Files:**
- Modify: `全部资产清单.html:125-143`
- Modify: `tests/game-logic.test.mjs:1-12, 200-230`

**Interfaces:**
- Consumes: 已确认的文件名 `topdown-reef-01.png`、`topdown-reef-02.png`、`topdown-islet-01.png`、`topdown-islet-02.png`。
- Produces: `pending-background-plan-grid`，四条只供审阅的条目；条目字段为 `[中文名称, 分类, 用途, 目标路径]`。

- [x] **Step 1: 写出会失败的清单测试**

  在 `tests/game-logic.test.mjs` 读取 `全部资产清单.html`，再加入以下测试：

  ```js
  const assetCatalog = fs.readFileSync(new URL('../全部资产清单.html', import.meta.url), 'utf8');

  test('new top-down scenery is catalogued for approval before it is rendered', () => {
    assert.match(assetCatalog, /id="pending-background-plan-grid"/);
    assert.match(assetCatalog, /待确认素材/);
    for (const filename of [
      'topdown-reef-01.png', 'topdown-reef-02.png',
      'topdown-islet-01.png', 'topdown-islet-02.png'
    ]) assert.match(assetCatalog, new RegExp(filename.replace('.', '\\.')));
    assert.doesNotMatch(html, /topdownReef01|topdownReef02|topdownIslet01|topdownIslet02/);
  });
  ```

- [x] **Step 2: 运行测试确认失败**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: FAIL，提示缺少 `pending-background-plan-grid`；其余既有测试不受影响。

- [x] **Step 3: 最小化实现待确认清单**

  在 `全部资产清单.html` 增加一个标题为“待确认素材”的独立网格和四张不引用不存在图片的文字预览卡。卡片固定登记：

  ```js
  [
    ['弯月形浅海珊瑚礁', '俯视背景', '透明边缘的浅海礁盘与珊瑚，不含水面底板。', 'assets/scenery/topdown-reef-01.png'],
    ['分散小礁群与海草', '俯视背景', '透明边缘的小型礁石、珊瑚与海草组合。', 'assets/scenery/topdown-reef-02.png'],
    ['岩石孤岛与松树', '俯视背景', '透明边缘的小型岩岛、单棵松树与投影。', 'assets/scenery/topdown-islet-01.png'],
    ['低矮沙洲与小花', '俯视背景', '透明边缘的沙洲、礁石与小花，不含水面矩形。', 'assets/scenery/topdown-islet-02.png']
  ]
  ```

  文字预览必须明确标注“待确认；未生成、未接入游戏”，不创建 PNG，不改 `index.html`。

- [x] **Step 4: 运行测试确认通过**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: PASS；新测试确认四个目标路径只存在于待确认清单，尚未在游戏资源清单中出现。

- [x] **Step 5: 停止并请求用户确认素材清单**

  向用户展示 `全部资产清单.html` 中的 4 项待确认条目并等待明确确认。未获确认，不执行 Task 2、Task 3 或 Task 4。

### Task 2: 生成并校验四项已确认的透明景观

**Files:**
- Create: `assets/scenery/topdown-reef-01.png`
- Create: `assets/scenery/topdown-reef-02.png`
- Create: `assets/scenery/topdown-islet-01.png`
- Create: `assets/scenery/topdown-islet-02.png`
- Modify: `全部资产清单.html:待确认素材和背景计划数据区`

**Interfaces:**
- Consumes: 用户对 Task 1 清单的明确确认。
- Produces: 四张 640×426 的透明 PNG；清单中四项由待确认状态转为含 `<img>` 的实际可预览条目。

- [x] **Step 1: 复核确认与素材契约**

  确认用户已批准 Task 1 的四项名称、用途和路径。使用图像生成能力前，读取并遵循其图像生成工作指引；每张素材固定为俯视、精致 2.5D 卡通像素风、透明外部区域、无文字、无 HUD、无角色、无武器、无水面矩形。

- [x] **Step 2: 生成并保存四张透明 PNG**

  分别生成以下成品，目标画布为 640×426：

  ```text
  topdown-reef-01.png: 俯视弯月形浅海珊瑚礁，青绿礁盘、少量暖色珊瑚和岩石，高光与投影，画布外部透明。
  topdown-reef-02.png: 俯视分散小礁群与海草，多个小岩礁和珊瑚簇，留出大面积透明外部区域。
  topdown-islet-01.png: 俯视小型岩石孤岛，一棵松树、草地和岩石，边缘透明。
  topdown-islet-02.png: 俯视低矮沙洲，沙地、礁石、小花和少量植被，边缘透明。
  ```

- [x] **Step 3: 将确认清单转换为可预览资产条目**

  移除这四项的“待确认；未生成、未接入游戏”状态；将它们合并到 `background-plan-grid`，沿用现有卡片渲染结构，使每项用实际 `<img src="assets/scenery/...">` 显示缩略图、中文名称、用途和路径。

- [x] **Step 4: 校验文件与透明画布**

  Run: `sips -g pixelWidth -g pixelHeight assets/scenery/topdown-reef-01.png assets/scenery/topdown-reef-02.png assets/scenery/topdown-islet-01.png assets/scenery/topdown-islet-02.png`

  Expected: 四个文件均存在，尺寸均为 `640 × 426`。随后在浏览器中打开《全部资产清单》，确认四个缩略图可见，外部区域呈现页面底色而非蓝色或矩形底板。

### Task 3: 用统一偏移渲染完整的俯视景观序列

**Files:**
- Modify: `index.html:322-415`（纯循环数学）
- Modify: `index.html:488-498`（资源清单）
- Modify: `index.html:1044-1062`（背景布局与绘制）
- Modify: `tests/game-logic.test.mjs:200-255`

**Interfaces:**
- Consumes: 四个新增资源键 `topdownReef01`、`topdownReef02`、`topdownIslet01`、`topdownIslet02` 以及四张已确认 PNG。
- Produces: `GameRules.sequenceLoopY(anchorY, offset, sequenceLength, reentryMargin)`；`TopdownScenerySequence` 包含 `length: 1815` 和七个 `[key, xRatio, anchorY, width, height]` 条目。

- [x] **Step 1: 写出会失败的连续序列测试**

  在 `tests/game-logic.test.mjs` 新增：

  ```js
  test('top-down scenery uses one seven-item sequence and returns outside the viewport', () => {
    assert.equal(rules.sequenceLoopY(55, 0, 1815, 260), 55);
    assert.equal(rules.sequenceLoopY(55, 1815, 1815, 260), 55);
    assert.equal(rules.sequenceLoopY(-150, 150, 1815, 260), 0);
    assert.equal(rules.sequenceLoopY(55, 1500, 1815, 260), -260);
    for (const key of ['topdownIsland01', 'topdownIsland02', 'topdownIsland03', 'topdownReef01', 'topdownReef02', 'topdownIslet01', 'topdownIslet02']) {
      assert.match(html, new RegExp(`\\['${key}'`));
    }
    assert.match(html, /TopdownScenerySequence\.entries\.forEach\(\(\[key, x, y, width, height\]\) =>/);
    assert.match(html, /GameRules\.sequenceLoopY\(y, landscapeOffset, TopdownScenerySequence\.length, 260\)/);
  });
  ```

- [x] **Step 2: 运行测试确认失败**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: FAIL，`sequenceLoopY` 未定义且新增四个序列键尚未登记。

- [x] **Step 3: 实现最小化的统一循环**

  在 `GameRules` 中加入：

  ```js
  sequenceLoopY(anchorY, offset, sequenceLength, reentryMargin) {
    return ((anchorY + offset + reentryMargin) % sequenceLength) - reentryMargin;
  }
  ```

  在 `AssetManifest.sceneThemes` 登记四个新键及其本地路径。新增 `TopdownScenerySequence`，固定顺序和锚点如下：

  ```js
  const TopdownScenerySequence = {
    length: 1815,
    entries: [
      ['topdownIslet02', .31, -780, 236, 156],
      ['topdownIslet01', .64, -570, 220, 176],
      ['topdownReef02', .23, -360, 246, 164],
      ['topdownReef01', .72, -150, 258, 150],
      ['topdownIsland01', .18, 55, 292, 208],
      ['topdownIsland02', .79, 300, 270, 198],
      ['topdownIsland03', .42, 555, 308, 220]
    ]
  };
  ```

  仅当 `activeSceneBackground === 'backgroundTopdown'` 时，以 `game.time * 12` 的一个共同偏移和 `sequenceLoopY(..., 1815, 260)` 绘制七项。保留斜视背景现有 `BackgroundLayouts.backgroundPerspective`、水面循环与三层云雾的代码和速度，不在本轮重构它们。

- [x] **Step 4: 运行逻辑测试确认通过**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: PASS；七项序列使用同一个周期，在 `-260` 的画布外重入；原有战斗规则测试全部通过。

### Task 4: 浏览器验证与变更记录

**Files:**
- Modify: `tests/browser-smoke.py:70-120`
- Modify: `docs/CHANGELOG.md:3-8`

**Interfaces:**
- Consumes: Task 2 的四张可加载 PNG 与 Task 3 的预加载资源键。
- Produces: 冒烟测试对新增资产加载和俯视景观绘制的回归保护；变更记录。

- [x] **Step 1: 写出会失败的浏览器资产断言**

  在 `required` 集合中加入：

  ```py
  "assets/scenery/topdown-reef-01.png",
  "assets/scenery/topdown-reef-02.png",
  "assets/scenery/topdown-islet-01.png",
  "assets/scenery/topdown-islet-02.png",
  ```

  并在启动俯视背景后断言 `window.__renderStats.sceneryDraws` 包含七个俯视景观键中的至少前三个初始项，且不包含加载失败项。

- [x] **Step 2: 运行浏览器测试确认失败**

  在一个终端运行 `python3 -m http.server 8765`，另一个终端运行：

  ```bash
  python3 tests/browser-smoke.py
  ```

  Expected: 在 Task 3 前因四个新增路径未加载而失败。

- [ ] **Step 3: 完成浏览器验证**

  Task 3 完成后重跑相同命令。检查生成的画布截图：水面连续、景观无矩形蓝色底板，构图保持原有俯视自然错位。

- [ ] **Step 4: 更新变更记录并作最终验证**

  在 `docs/CHANGELOG.md` 的顶部增加“俯视海洋景观序列 - 2026-10-03”，记录 4 项新增透明景观、7 项统一循环、资产清单先确认后接入，以及斜视背景与战斗规则未改动。

  Run:

  ```bash
  node --test tests/game-logic.test.mjs
  python3 tests/browser-smoke.py
  ```

  Expected: Node 测试全绿；浏览器测试确认全部资源加载、Canvas 持续动画且无控制台错误。若当前主机 Chromium 在页面加载前发生宿主级崩溃，记录该限制，并用可用浏览器会话完成同等的资源加载、控制台和截图检查。
