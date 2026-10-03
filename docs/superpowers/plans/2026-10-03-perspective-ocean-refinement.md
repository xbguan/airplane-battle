# 斜视海面细化与晴天云层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以更细腻的斜视海面消除景物割裂感，并为晴天增加两层持续横移的白云。

**Architecture:** 保留 `backgroundPerspective` 作为斜视模式唯一海面底图，仅覆盖该 PNG；新增两张透明晴天云图。`index.html` 预加载新云图，并在斜视晴天按不同速度循环绘制；现有风暴云、景物序列与俯视路径不改。

**Tech Stack:** 原生 HTML、Canvas 2D、JavaScript、Node.js 内置测试、Python 浏览器烟测、本地 PNG。

## 晴天云层续作（2026-10-04）

用户已确认生成并接入两层晴天云。本次仅执行云层部分：海面已由后续的接水融合任务完成，不再次覆盖背景或接水素材。

- 内置 imagegen 生成两张 2172×724 RGBA：`assets/scenery/perspective-clear-cloud-far.png`、`assets/scenery/perspective-clear-cloud-near.png`，保留真实透明背景。
- 最终生成提示：远云是宽幅、稀疏、细小的晴天白云与薄云丝；近云是三朵分离的轻薄蓬松白云。两者均为精致 2.5D 卡通像素、暖白高光与浅蓝阴影，有充分透明间隙，无天空底板、海面、地面、文字或对象。
- 实现时以绘制宽度作为循环周期，保留素材约 3:1 比例，在天空范围内平铺；替代旧示例中按 W 循环却使用 1.8W/2.1W 云宽的方案，避免重叠跳变及过度拉伸。
- 远近速度为每秒 1.5/2.7 像素，基础透明度 .24/.32，并乘以 `1 - weather.storm`。晴天显示，风暴平滑淡出。
- 两项转为实际预览后，删除资产清单待确认节及对应导航；俯视、战斗与风暴素材保持原状。
- 实际显示宽度分别为 W×.45 / W×.55，高度为对应宽度的三分之一；在 H×.16 处平铺，保持天空内完整显示。
- 2026-10-04：主代理运行规则测试 36/36 通过，Astra 只读复核代码及 `/tmp/airplane-clear-clouds.png` 画面通过；清单待确认节、导航和数据分组均已移除。
- 晴云独立浏览器烟测 `python3 tests/browser-smoke.py --perspective-only` 通过，验证两图加载、实际绘制、画布动画和无控制台错误。完整旧烟测的历史断言不在本次修改范围，未宣称完整烟测通过。

## Global Constraints

- 只涉及斜视素材；不修改任何俯视素材、俯视绘制路径、战斗数值或风暴素材。
- 所有素材均为项目内原创 PNG，不引入依赖、框架、CDN 或在线资源。
- 新图必须预加载缓存；主循环不得创建 `Image`、渐变、阴影或高频音频节点。
- 不执行 Git 操作。

---

### Task 1: 锁定晴天云渲染契约

**Files:**
- Modify: `tests/game-logic.test.mjs:216-243`

**Interfaces:**
- Consumes: `AssetPaths.sceneThemes` 与 `drawBackground()` 的斜视分支。
- Produces: 对 `perspectiveClearCloudFar`、`perspectiveClearCloudNear`、`PerspectiveClearCloudLayers` 和晴天透明度的静态契约。

- [ ] **Step 1: 写入失败测试**

  在“perspective background has a seamless sky weather cycle”测试之后新增：

  ```js
  test('clear perspective weather preloads and drifts two local cloud layers', () => {
    for (const [key, filename] of [
      ['perspectiveClearCloudFar', 'perspective-clear-cloud-far.png'],
      ['perspectiveClearCloudNear', 'perspective-clear-cloud-near.png']
    ]) {
      assert.match(html, new RegExp(`${key}: 'assets/scenery/${filename.replace('.', '\\\\.')}'`));
      assert.equal(fs.existsSync(new URL(`../assets/scenery/${filename}`, import.meta.url)), true);
    }
    assert.match(html, /const PerspectiveClearCloudLayers = \\{/);
    assert.match(html, /perspectiveClearCloudFar/);
    assert.match(html, /perspectiveClearCloudNear/);
    assert.match(html, /const clearAlpha = 1 - weather\\.storm/);
    assert.match(html, /drawSceneryAsset\\(key, W \\/ 2 \\+ drift/);
  });
  ```

- [ ] **Step 2: 运行失败测试**

  Run: `node --test --test-name-pattern='clear perspective weather preloads' tests/game-logic.test.mjs`

  Expected: FAIL，缺少两项资源映射和 `PerspectiveClearCloudLayers`。

### Task 2: 生成并登记确认的斜视素材

**Files:**
- Modify: `assets/scenery/background-perspective.png`
- Create: `assets/scenery/perspective-clear-cloud-far.png`
- Create: `assets/scenery/perspective-clear-cloud-near.png`
- Modify: `全部资产清单.html:26-28,45-65`

**Interfaces:**
- Consumes: 已确认的三项待确认条目；现有完整背景尺寸 `1672×941`。
- Produces: 一张 RGB 斜视完整背景和两张 RGBA 透明晴天云图；资产清单将三项从待确认转为可预览条目。

- [ ] **Step 1: 生成斜视完整背景**

  使用图像生成工具覆盖 `assets/scenery/background-perspective.png`，尺寸为 `1672×941`。提示词必须明确：精致 2.5D 卡通像素主图；保留蓝天和清晰海平线；远海浪纹细密、低对比；近海只有柔和的小幅波纹和少量浅色泡沫，不得有巨型浪峰、粗白色网格浪线或船只、岛屿、角色、武器。

- [ ] **Step 2: 生成两张透明晴天云图**

  使用图像生成工具创建两个透明背景 PNG：`perspective-clear-cloud-far.png`（宽幅、稀疏小白云、低对比）和 `perspective-clear-cloud-near.png`（宽幅、较大但仍轻薄的白云）。两图都不含海面、海平线、地面、角色或文字；保持精致 2.5D 卡通像素风。

- [ ] **Step 3: 更新资产清单**

  将三项移入 `perspective-background-grid`，说明其实际用途和路径；删除 `perspective-improvement-plan` 区段与 `perspective-improvement-plan-grid`。俯视清单条目不改。

- [ ] **Step 4: 校验成品与清单**

  Run: `file assets/scenery/background-perspective.png assets/scenery/perspective-clear-cloud-far.png assets/scenery/perspective-clear-cloud-near.png`

  Expected: 完整背景为 PNG RGB；两张云图为 PNG RGBA。打开 `全部资产清单.html` 后三项均显示实际预览，无“待确认”区段。

### Task 3: 以缓存云图驱动晴天横移

**Files:**
- Modify: `index.html:497-505,1086-1130`
- Test: `tests/game-logic.test.mjs:216-243`

**Interfaces:**
- Consumes: `perspectiveClearCloudFar`、`perspectiveClearCloudNear` 两张预加载资源与 `GameRules.perspectiveWeather(time)` 的 `storm` 值。
- Produces: `PerspectiveClearCloudLayers` 常量；晴天时两层不同速度的横移云图，过渡时透明度由 `1 - weather.storm` 平滑控制。

- [ ] **Step 1: 登记预加载资源**

  在 `AssetPaths.sceneThemes` 中紧邻现有斜视天气资源增加：

  ```js
  perspectiveClearCloudFar: 'assets/scenery/perspective-clear-cloud-far.png',
  perspectiveClearCloudNear: 'assets/scenery/perspective-clear-cloud-near.png',
  ```

- [ ] **Step 2: 定义并绘制两层云**

  在 `PerspectiveCloudLayers` 之前增加：

  ```js
  const PerspectiveClearCloudLayers = {
    far: ['perspectiveClearCloudFar', .025, H * .16, W * 1.8, H * .19, .24],
    near: ['perspectiveClearCloudNear', .045, H * .24, W * 2.1, H * .25, .32]
  };
  ```

  在斜视 `drawBackground()` 分支中，绘制完整背景后、风暴天空前插入：

  ```js
  const clearAlpha = 1 - weather.storm;
  for (const [key, speed, y, width, height, alpha] of Object.values(PerspectiveClearCloudLayers)) {
    const drift = ((game.time * speed * 60) % W) - W / 2;
    drawSceneryAsset(key, W / 2 + drift, y, width, height, clearAlpha * alpha);
    drawSceneryAsset(key, W / 2 + drift - W, y, width, height, clearAlpha * alpha);
    drawSceneryAsset(key, W / 2 + drift + W, y, width, height, clearAlpha * alpha);
  }
  ```

- [ ] **Step 3: 运行契约测试**

  Run: `node --test --test-name-pattern='clear perspective weather preloads' tests/game-logic.test.mjs`

  Expected: PASS。

### Task 4: 全量验证与变更记录

**Files:**
- Modify: `docs/CHANGELOG.md:3`
- Test: `tests/game-logic.test.mjs`
- Test: `tests/browser-smoke.py`

**Interfaces:**
- Consumes: 完成后的素材和斜视绘制逻辑。
- Produces: 可追溯变更记录与验证结果。

- [ ] **Step 1: 运行全量规则测试**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: PASS，包含新的晴天云契约，既有俯视和战斗规则测试仍通过。

- [ ] **Step 2: 运行浏览器烟测**

  Run: `python3 tests/browser-smoke.py`

  Expected: 画布持续动画、无控制台错误、无外部资源请求；斜视模式下晴天云横向移动且海面与景物融合。若浏览器在页面加载前启动失败，记录该阻断，不报告浏览器测试通过。

- [ ] **Step 3: 记录变更**

  在 `docs/CHANGELOG.md` 顶部加入“斜视海面细化与晴天云层 - 2026-10-03”：写明重绘完整斜视海面、两层本地透明晴天云、不同速率横移；明确俯视素材与风暴素材未改。
