# 斜视海空天气背景 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将“斜视峡谷”升级为含天空、海平线、透视海面、七类斜视景物和左右横移天气云层的无缝海空战场。

**Architecture:** 保留俯视背景路径不动。斜视模式独立使用一个完整背景、循环海面、透明远中近景物序列和两层横向云层；`PerspectiveWeather` 根据 90 秒循环生成晴空/过渡/风暴强度，渲染时只叠加透明层和色调，不切换整张背景。

**Tech Stack:** 原生 HTML/Canvas/JavaScript、本地透明 PNG、Node.js `node:test`、Python Playwright 烟测。

## Global Constraints

- 保留 `assets/scenery/background-topdown.png` 与 `assets/scenery/background-perspective.png` 两个完整背景；仅更新后者为真正斜视海空背景。
- 新增或修改的所有场景 PNG 放入 `assets/scenery/`，在名称和《全部资产清单》明确标注“斜视”。
- 素材确认前不得生成、覆盖或接入 PNG，也不得修改 `index.html`。
- 晴空/风暴各 40 秒，双向天气过渡各 5 秒；乌云从左右进入/散开，不整屏硬切。
- 不改变战斗数值、输入、碰撞、敌人、武器、HUD、俯视背景或性能上限。
- 不执行 Git 操作。

---

## File Map

- `全部资产清单.html`：先列出 13 个确认项及全部斜视用途。
- `assets/scenery/background-perspective.png`：更新后的第二张完整斜视海空背景。
- `assets/scenery/water-perspective-loop.png`：更新后的透视海面循环层。
- `assets/scenery/perspective-sky-clear.png`、`perspective-sky-storm.png`：晴空/风暴天空与海平线层。
- `assets/scenery/perspective-cloud-bank-far.png`、`perspective-cloud-bank-near.png`：透明左右横移云层。
- `assets/scenery/perspective-island-chain.png`、`perspective-lighthouse-reef.png`、`perspective-sailboat.png`、`perspective-buoy.png`、`perspective-reef.png`、`perspective-sea-stack.png`、`perspective-cliff-waterfall.png`：七类透明斜视景物。
- `tests/game-logic.test.mjs`：天气时序、云层、景物清单、统一序列和旧布局移除契约。
- `index.html`：资源清单、天气规则、斜视背景渲染。
- `docs/CHANGELOG.md`：变更与验证记录。

### Task 1: 斜视素材清单确认关口

**Files:**
- Modify: `全部资产清单.html`

**Interfaces:**
- Produces: `perspective-background-grid` 中 13 项明确标记“斜视”的预览计划；当前 PNG 与游戏源码不变。

- [x] **Step 1: 更新斜视背景区的说明**

将小节说明改为：

```html
<p class="section-note">待确认：真正斜视海空战场。天空、海平线、透视海面、左右横移云层及 7 类斜视景物；确认前不接入游戏。</p>
```

- [x] **Step 2: 以计划卡片列出 13 个斜视素材**

在 `perspective-background-grid` 依次列出以下路径和用途：

```text
background-perspective.png          第二个完整背景，更新为斜视海空
water-perspective-loop.png          斜视透视海面循环层
perspective-sky-clear.png           斜视晴空、海平线和远白云
perspective-sky-storm.png           斜视风暴天空、海平线和远雾
perspective-cloud-bank-far.png      斜视远层乌云，从左右缓慢进入
perspective-cloud-bank-near.png     斜视近层乌云，从左右较快进入
perspective-island-chain.png        斜视远海岛链
perspective-lighthouse-reef.png     斜视灯塔礁岛
perspective-sailboat.png            斜视小帆船
perspective-buoy.png                斜视红白航标
perspective-reef.png                斜视浮上海礁
perspective-sea-stack.png           斜视海蚀石柱
perspective-cliff-waterfall.png     斜视近景峭壁与瀑布礁岸
```

对于尚未生成的路径，以计划状态卡呈现，不添加 `img` 标签，避免显示失效图片；原有三张 `perspective-island-*.png` 留在磁盘但不再列入运行清单，待最终接入后再依用户授权清理。

- [x] **Step 3: 校验清单可解析并请求用户确认**

Run: `node --check <(sed -n '/<script>/,/<\/script>/p' 全部资产清单.html | sed '1d;$d')`

Expected: 脚本解析成功。向用户提供清单链接；未收到确认前停止。

### Task 2: 生成确认后的斜视 PNG

**Files:**
- Modify: `assets/scenery/background-perspective.png`
- Modify: `assets/scenery/water-perspective-loop.png`
- Create: 11 个 Task 1 中的 `perspective-*.png` 文件

**Interfaces:**
- Produces: 13 个可预加载的斜视背景层；天空/云层/景物透明，完整背景和水面循环层覆盖画面。
- Consumes: 用户确认的 Task 1 清单与既有 2.5D 卡通像素视觉基准。

- [x] **Step 1: 生成完整斜视海空背景和透视海面**

更新完整背景：上方蓝天/远云、中上部清晰海平线、下方由细到粗的透视海面；无角色、敌人、武器、文字或 UI。更新水面循环层：仅透视浪纹和远近明暗，无岛屿和天空，便于垂直循环。

- [x] **Step 2: 生成四个天空与云层 PNG**

生成晴空天空、风暴天空、远层乌云和近层乌云。两张云层均为透明背景、横向长幅；云团从左右边缘可无缝续接，中央不预先遮满。

- [x] **Step 3: 生成七类斜视景物 PNG**

逐个生成 Task 1 列明的七类景物。每张透明背景；岛链最小、峭壁瀑布最大；均使用正面/斜视体积和侧面阴影，不得使用俯视岛屿、矩形画布背景或可动战斗对象。

- [x] **Step 4: 检查素材透明度与存在性**

Run: `sips -g hasAlpha` 对全部透明层，及 `test -f` 对 13 条路径。

Expected: 所有文件存在；云层与七类景物具有 Alpha 通道。

### Task 3: 测试先行的天气与斜视序列规则

**Files:**
- Modify: `tests/game-logic.test.mjs`
- Modify: `index.html:315-430,1077-1117`

**Interfaces:**
- Produces: `GameRules.perspectiveWeather(time): { storm: number, phase: 'clear' | 'darken' | 'storm' | 'clearUp' }`；`PerspectiveScenerySequence` 至少含 7 个景物定义；`PerspectiveCloudLayers` 含 `far` 与 `near` 两层。

- [x] **Step 1: 添加失败的天气/景物契约测试**

```js
test('perspective background has a seamless sky weather cycle and seven perspective scenery types', () => {
  assert.deepEqual(plain(rules.perspectiveWeather(0)), { phase: 'clear', storm: 0 });
  assert.equal(rules.perspectiveWeather(42.5).phase, 'darken');
  assert.deepEqual(plain(rules.perspectiveWeather(50)), { phase: 'storm', storm: 1 });
  assert.equal(rules.perspectiveWeather(87.5).phase, 'clearUp');
  assert.match(html, /const PerspectiveCloudLayers = \{/);
  assert.match(html, /perspectiveCloudBankFar/);
  assert.match(html, /perspectiveCloudBankNear/);
  assert.match(html, /const PerspectiveScenerySequence = \{/);
  for (const key of ['perspectiveIslandChain', 'perspectiveLighthouseReef', 'perspectiveSailboat', 'perspectiveBuoy', 'perspectiveReef', 'perspectiveSeaStack', 'perspectiveCliffWaterfall']) assert.match(html, new RegExp(key));
  assert.doesNotMatch(html, /BackgroundLayouts\.backgroundPerspective/);
});
```

- [x] **Step 2: 运行测试并确认失败**

Run: `node --test tests/game-logic.test.mjs`

Expected: FAIL，因为天气规则、云层与七类序列尚不存在，旧 `BackgroundLayouts.backgroundPerspective` 仍在使用。

- [x] **Step 3: 添加天气纯规则**

在 `GameRules` 增加：

```js
perspectiveWeather(time) {
  const cycle = ((time % 90) + 90) % 90;
  if (cycle < 40) return { phase: 'clear', storm: 0 };
  if (cycle < 45) return { phase: 'darken', storm: (cycle - 40) / 5 };
  if (cycle < 85) return { phase: 'storm', storm: 1 };
  return { phase: 'clearUp', storm: 1 - (cycle - 85) / 5 };
},
```

- [x] **Step 4: 替换斜视资源键和旧三景布局**

在 `AssetManifest.sceneThemes` 增加 13 个 Task 1 对应键；删除 `perspectiveIsland01`、`perspectiveIsland02`、`perspectiveIsland03` 的运行时键。用以下常量替换 `BackgroundLayouts.backgroundPerspective`：

```js
const PerspectiveCloudLayers = {
  far: ['perspectiveCloudBankFar', 0.09, 1450, 260, 126],
  near: ['perspectiveCloudBankNear', 0.16, 1620, 360, 188]
};
const PerspectiveScenerySequence = {
  length: 2360,
  entries: [
    ['perspectiveIslandChain', .52, -120, 220, 88], ['perspectiveLighthouseReef', .21, 180, 176, 132],
    ['perspectiveSailboat', .76, 420, 92, 68], ['perspectiveBuoy', .39, 660, 42, 78],
    ['perspectiveReef', .63, 900, 164, 96], ['perspectiveSeaStack', .15, 1180, 214, 178],
    ['perspectiveCliffWaterfall', .82, 1500, 360, 270]
  ]
};
```

- [x] **Step 5: 渲染天空、透视海面、景物与左右云层**

在 `drawBackground()` 的斜视分支：先绘制 `backgroundPerspective`，再按 `weather.storm` 叠加晴空/风暴天空和透视水面；使用 `GameRules.sequenceLoopY()` 绘制统一景物序列。云层每层各绘制左右镜像入口位置，但素材自身不镜像；`far` 和 `near` 用不同横向速度，在 `weather.storm` 作为 alpha 进入或散开。只叠加，不替换整张画面。

- [x] **Step 6: 运行规则测试**

Run: `node --test tests/game-logic.test.mjs`

Expected: 所有测试通过；俯视景观序列既有测试保持通过。

### Task 4: 收尾验证和记录

**Files:**
- Modify: `docs/CHANGELOG.md`
- Modify only if browser reaches page: `tests/browser-smoke.py`

- [x] **Step 1: 验证脚本、资源和资产清单**

Run: `node --check` 对 `index.html` 和 `全部资产清单.html`；检查 `AssetManifest` 与清单引用的 PNG 均存在。

Expected: 两个脚本解析成功，所有运行和清单路径可读取。

- [x] **Step 2: 尝试浏览器烟测**

Run: `python3 tests/browser-smoke.py`

Expected: 若浏览器能启动，切换“斜视海空”后可见天空、海平线、透视海面及至少七类景物；等待跨天气阶段，云层从两侧进入/散开而不硬切。若 Chromium 启动前 SIGTRAP，记录未完成。

- [x] **Step 3: 更新变更记录与最终规则回归**

在 `docs/CHANGELOG.md` 记录斜视海空背景、13 个斜视素材、左右横移云层天气、七景物序列以及保留两完整背景；运行 `node --test tests/game-logic.test.mjs`。

Expected: 全部测试通过。
