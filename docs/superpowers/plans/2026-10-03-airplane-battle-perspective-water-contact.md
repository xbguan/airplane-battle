# 斜视海面与接水浪花融合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 降低斜视近海浪峰的视觉冲突，并让 7 类斜视景物通过共享接水浪花层与海面连续融合。

**Architecture:** 保留 `backgroundPerspective` 作为斜视模式唯一海面底图，只覆盖这张 PNG。新增一张透明 `perspectiveWaterContact` 素材，在每个斜视景物之前按同一景深绘制；现有 7 张景物、俯视路径、天气与战斗逻辑不变。

**Tech Stack:** 原生 HTML / Canvas 2D / JavaScript、本地 PNG、Node.js 内置测试、Python Playwright 烟测。

## 实施记录（2026-10-04）

状态：本次融合改动通过 Astra 子代理最终只读验收；完整历史烟测受既有断言阻断。下方任务清单保留原计划，实际执行结果以本节为准。

- 已按确认范围使用内置 imagegen 编辑海面并生成接水浪花。背景为 1672×941 RGB；浪花为 1983×793 RGBA，保留生成器原始透明画布，由渲染尺寸控制其扁平程度，不另行裁切。
- 海面最终提示词：保留原天空、云、蓝色色调和位于图高约 34% 的海平线；仅将海面改为低对比青蓝细波，移除巨型浪峰、粗白浪线和深暗波谷；维持精致 2.5D 卡通像素风，不加入景物、角色或文字。
- 浪花最终提示词：单个低斜视角扁平、不规则、断续的淡青色接水浪花环，稀疏柔白泡沫与半透明水雾，中央和外部真实透明，无海面底板、对象或文字。
- Sol 负责测试与局部接入；主代理负责图像生成、范围核对，Astra 子代理负责最终只读复核。素材已同步到项目路径，未执行 Git。
- 原烟测包含已删除的旧版素材及 HUD 断言；新增 `--perspective-only` 验证本次范围，原模式保留以如实暴露历史问题。
- 验证结果：规则测试 35/35 通过；实际执行绘制函数覆盖 7 类景物在 0–200 秒内的接水顺序、海平线位置和远近透明度。独立斜视烟测通过，画布持续动画、无控制台错误。
- 近景截图：`/tmp/airplane-perspective-water-contact.png`；远景截图：`/tmp/airplane-perspective-water-contact-far.png`。已检查灯塔及远海岛链接水效果。
- 原完整烟测实际执行后，停在 `tests/browser-smoke.py` 的 `assert required <= set(assets["loaded"])`，清单仍要求已经移除的旧素材；本轮未修改这些历史断言，不能标记完整烟测通过。

## Global Constraints

- 只修改斜视海面、新增的接水浪花、直接相关的渲染和测试。
- 不修改现有 7 类斜视景物 PNG，不修改任何俯视素材或风暴素材。
- 不改变战斗数值、输入、碰撞、升级、碎片、武器、缓存和性能上限。
- 素材保持“精致 2.5D 卡通像素素材主图”风格；不引入依赖、框架、CDN 或在线资源。
- 新图在启动时预加载并缓存；主循环不创建 `Image`、渐变、阴影或高频音频节点。
- 不修改 `versions/`，不执行任何 Git 操作。

---

### Task 1: 锁定接水层契约

**Files:**
- Modify: `tests/game-logic.test.mjs:229`
- Test: `tests/game-logic.test.mjs`

**Interfaces:**
- Consumes: `index.html` 中的 `AssetManifest.sceneThemes` 和 `PerspectiveScenerySequence.entries.forEach(...)`。
- Produces: `perspectiveWaterContact` 资源键、素材存在性、接水层先于景物绘制及景深参数的静态契约。

- [ ] **Step 1: 写入失败测试**

  在 `perspective scenery enters from the horizon...` 测试后增加：

  ```js
  test('perspective scenery shares one depth-scaled water contact layer', () => {
    assert.match(html, /perspectiveWaterContact: 'assets\/scenery\/perspective-water-contact\.png'/);
    assert.equal(fs.existsSync(new URL('../assets/scenery/perspective-water-contact.png', import.meta.url)), true);
    const block = html.match(/PerspectiveScenerySequence\.entries\.forEach\(\(\[key, x, y, width, height\]\) => \{[\s\S]*?\n      \}\);/)?.[0] || '';
    assert.match(block, /const sceneryY = horizonY \+ loopY/);
    assert.match(block, /const contactHeight = clamp\(height \* scale \* \.22, 12, 54\)/);
    assert.match(block, /drawSceneryAsset\('perspectiveWaterContact'/);
    assert.ok(block.indexOf("drawSceneryAsset('perspectiveWaterContact'") < block.indexOf('drawSceneryAsset(key'));
  });
  ```

- [ ] **Step 2: 运行定向测试并确认失败**

  Run: `node --test --test-name-pattern='perspective scenery shares one depth-scaled water contact layer' tests/game-logic.test.mjs`

  Expected: FAIL，因为资源键、PNG 和接水绘制不存在。

---

### Task 2: 生成已确认的海面与接水素材

**Files:**
- Modify: `assets/scenery/background-perspective.png`
- Create: `assets/scenery/perspective-water-contact.png`
- Modify: `全部资产清单.html:26-27,45-65`

**Interfaces:**
- Consumes: 当前 `1672×941` 斜视背景、已确认的设计规格和待确认资产条目。
- Produces: 一张保持原尺寸的斜视完整背景、一张带 Alpha 的透明接水浪花 PNG，以及实际预览条目。

- [ ] **Step 1: 编辑斜视完整背景**

  用图像生成工具编辑 `assets/scenery/background-perspective.png`，提示词固定为：

  ```text
  保留原图的精致 2.5D 卡通像素风、蓝天、海平线、色温和 16:9 构图。只细化海面：远海浪纹细密，近海浪纹略大但保持低对比；明显缩小前景浪峰，削弱粗白浪线和大面积深蓝阴影。不添加岛屿、船只、浮标、飞机、武器、文字或 UI。
  ```

  保留成品尺寸 `1672×941`。

- [ ] **Step 2: 生成透明接水浪花**

  用图像生成工具新建 `assets/scenery/perspective-water-contact.png`，透明背景，提示词固定为：

  ```text
  单一不规则扁平椭圆形接水浪花与薄水雾，精致 2.5D 卡通像素风，青蓝半透明水体、柔和暖白泡沫，中央大面积留空，边缘断续自然，可缩放套在岛屿、礁石、灯塔、帆船和浮标底部。只有一个浪花环，不含完整海面、景物、对象、文字、UI 或矩形底板。
  ```

  将最终画布裁切为宽幅透明 PNG，建议尺寸 `1024×256`，不拉伸主体。

- [ ] **Step 3: 把已完成素材转为实际预览条目**

  在 `perspective-background-grid` 中加入：

  ```js
  ['斜视景物接水浪花','斜视景观','透明扁平浪花与水雾，在 7 类景物底部共享并随景深缩放。','assets/scenery/perspective-water-contact.png'],
  ```

  删除 `perspective-improvement-plan-grid` 中“斜视海空完整背景（待调整）”和“斜视景物接水浪花”两条。保留未在本轮实施的晴天云带待确认条目，并把该区说明收窄为“待确认：新增两层可横向循环的晴天白云”。

- [ ] **Step 4: 校验图像和资产清单**

  Run: `sips -g pixelWidth -g pixelHeight -g hasAlpha assets/scenery/background-perspective.png assets/scenery/perspective-water-contact.png`

  Expected: 背景为 `1672×941`；接水浪花为宽幅 PNG 且 `hasAlpha: yes`。

  Run: `rg -n "perspective-water-contact|斜视海空完整背景（待调整）|新增两层" 全部资产清单.html`

  Expected: 接水浪花只作为实际预览条目出现；已完成的背景待调整条目不再出现；晴天云带仍为待确认。

---

### Task 3: 以景深缩放接入接水层

**Files:**
- Modify: `index.html:497-505,1108-1123`
- Test: `tests/game-logic.test.mjs`

**Interfaces:**
- Consumes: `assets/scenery/perspective-water-contact.png`、`depth: number`、`scale: number`、景物宽高和中心坐标。
- Produces: `AssetManifest.sceneThemes.perspectiveWaterContact` 和每个斜视景物之前的接水绘制。

- [ ] **Step 1: 登记预加载资源**

  在 `AssetManifest.sceneThemes` 的斜视景观资源前增加：

  ```js
  perspectiveWaterContact: 'assets/scenery/perspective-water-contact.png',
  ```

- [ ] **Step 2: 在景物之前绘制接水层**

  将斜视景物循环的绘制部分改为：

  ```js
  const depth = clamp(loopY / (H - horizonY), 0, 1);
  const scale = .38 + depth * .72;
  const sceneryY = horizonY + loopY;
  const contactHeight = clamp(height * scale * .22, 12, 54);
  const contactY = sceneryY + height * scale * .34;
  drawSceneryAsset('perspectiveWaterContact', W * x, contactY, width * scale * 1.12, contactHeight, .18 + depth * .34);
  drawSceneryAsset(key, W * x, sceneryY, width * scale, height * scale);
  ```

  不修改 `PerspectiveScenerySequence.entries`、海平线、景物速度、云层或俯视分支。

- [ ] **Step 3: 运行定向测试并确认通过**

  Run: `node --test --test-name-pattern='perspective scenery shares one depth-scaled water contact layer' tests/game-logic.test.mjs`

  Expected: PASS。

---

### Task 4: 回归、浏览器验收与变更记录

**Files:**
- Modify: `tests/browser-smoke.py`
- Modify: `docs/CHANGELOG.md:3`
- Test: `tests/game-logic.test.mjs`
- Test: `tests/browser-smoke.py`

**Interfaces:**
- Consumes: 已预加载和绘制的 `perspectiveWaterContact`。
- Produces: 斜视路径的浏览器证据、全量规则测试结果和变更记录。

- [ ] **Step 1: 增加斜视浏览器断言**

  在 `tests/browser-smoke.py` 现有默认场景检查之后，重新加载页面，使用 `[data-scene-theme="backgroundPerspective"]` 选中斜视模式，再点击 `#start-button`。增加断言：

  ```python
  page.reload()
  page.locator('[data-scene-theme="backgroundPerspective"]').click()
  page.locator('#start-button').click()
  page.wait_for_timeout(500)
  perspective_draws = page.evaluate("window.__renderStats.sceneryDraws")
  assert "backgroundPerspective" in perspective_draws
  assert "perspectiveWaterContact" in perspective_draws
  assert "waterTopdownLoop" not in perspective_draws
  ```

  `page.add_init_script(...)` 会在重新加载时重建 `window.__renderStats`，因此新场景只保留斜视渲染记录。不借机修改其他历史断言。

- [ ] **Step 2: 运行全量规则测试**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: PASS，包含新的接水层契约，俯视和战斗规则仍通过。

- [ ] **Step 3: 运行浏览器烟测**

  先在项目根目录启动 `python3 -m http.server 8765 --bind 127.0.0.1`，再运行：

  Run: `python3 tests/browser-smoke.py`

  Expected: 画布持续动画，无控制台错误、外部请求或素材加载失败；斜视模式绘制 `backgroundPerspective` 和 `perspectiveWaterContact`，不绘制 `waterTopdownLoop`。如果烟测被本轮之前已存在的无关断言阻断，记录确切失败位置，不扩大本轮修改范围，也不报告烟测通过。

- [ ] **Step 4: 进行视觉检查**

  以 `1440×900` 视口打开斜视模式，至少检查一个远景和一个近景：海面浪峰不压过景物；接水浪花贴合底部、不遮住主体；无矩形底板和天空中的浪花。

- [ ] **Step 5: 更新变更记录**

  在 `docs/CHANGELOG.md` 顶部新增“斜视海面与接水浪花 - 2026-10-03”，记录：细化斜视海面、新增共享透明接水浪花、随景深缩放与透明度变化，以及俯视、风暴、战斗规则未改。

- [ ] **Step 6: 检查改动边界**

  Run: `rg -n "perspectiveWaterContact|perspective-water-contact|斜视海面与接水浪花" index.html tests/game-logic.test.mjs tests/browser-smoke.py 全部资产清单.html docs/CHANGELOG.md`

  Expected: 只出现在本计划直接涉及的资源登记、斜视绘制、测试、资产目录和变更记录中。

  不执行 Git 操作；由用户自行管理版本。
