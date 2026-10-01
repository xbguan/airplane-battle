# 飞机大战 V1 UI 视觉优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 V1 改造成已确认的“甜酷野战 × 小小战斗队员”界面，同时保持现有玩法、单文件和性能机制。

**Architecture:** 仅改 `index.html` 的 CSS、HUD 文案结构和精灵缓存绘制，不拆分单文件，也不更改 `GameRules` 与战斗状态。`versions/airplane-battle-v1.html` 是 V1 发布快照，完成并验证后与 `index.html` 保持完全一致。

**Tech Stack:** 原生 HTML、CSS、Canvas 2D、Web Audio API 缓存、Node 内置测试、Playwright。

## Global Constraints

- 单文件、零依赖，支持直接在现代桌面浏览器打开。
- 不修改怪物属性、经验、BOSS 血量、升级、碎片或武器规则。
- 保持鼠标直连跟随、12 个以内循环地景、缓存精灵、缓存声效与粒子上限。
- `index.html` 与 `versions/airplane-battle-v1.html` 最终内容一致；不执行 Git 操作，由用户自行管理。

---

### Task 1: 为确认后的 A 方案建立视觉回归断言

**Files:**
- Modify: `tests/browser-smoke.py:46-86`
- Modify: `index.html:7-225`

**Interfaces:**
- Consumes: `#hud`、`#upgrade-attack`、`#fragments`、`#weapons` 和 `.hud-chip` 的现有 DOM 标识。
- Produces: 针对 HUD 顶部、升级底部中央、武器右下和无重叠的浏览器断言。

- [x] **Step 1: 写入失败的视觉结构测试**

在 `tests/browser-smoke.py` 的开始游戏断言后加入：

```python
assert page.locator("#hud .hud-chip").count() == 3
assert "237, 123, 53" in page.locator("#upgrade-attack").evaluate("node => getComputedStyle(node).backgroundImage")
assert page.locator("#weapons").bounding_box()["x"] > shell_box["x"] + shell_box["width"] * 0.7
```

- [x] **Step 2: 运行测试，确认当前视觉结构至少有一项不符合新断言**

Run: `python3 /Users/xbguan/.agents/skills/webapp-testing/scripts/with_server.py --server "python3 -m http.server 8765 --bind 127.0.0.1" --port 8765 -- python3 tests/browser-smoke.py`

Expected: FAIL，`#upgrade-attack` 当前黄色渐变不包含 `237, 123, 53`，失败信息指向新增断言。

- [x] **Step 3: 添加最小的 DOM 辅助标识**

不需要新增 DOM 标识：测试已使用稳定 ID。保持现有 ID 和事件绑定不变。

- [x] **Step 4: 重跑，确认断言已进入稳定选择器路径**

Run: `python3 /Users/xbguan/.agents/skills/webapp-testing/scripts/with_server.py --server "python3 -m http.server 8765 --bind 127.0.0.1" --port 8765 -- python3 tests/browser-smoke.py`

Expected: 仅视觉样式相关断言仍失败，既有玩法断言继续通过。

### Task 2: 重绘 HUD、按钮与开始/弹窗面板

**Files:**
- Modify: `index.html:7-224`
- Test: `tests/browser-smoke.py:46-86`

**Interfaces:**
- Consumes: 现有 `#hud`、`.hud-chip`、`#upgrade-attack`、`#fragments`、`#weapons`、`.panel` 和 `.screen`。
- Produces: 顶部奶油白信息牌、底部橙色升级按钮、左下碎片和右下装备格的 A 方案布局。

- [x] **Step 1: 让新增测试在当前样式下失败**

确认 Task 1 Step 1 的升级按钮橙色渐变断言失败，不增加任何行为测试。

- [x] **Step 2: 以最小 CSS 替换视觉令牌**

在 `:root` 将面板颜色更新为奶油白和低饱和蓝，收窄 `.hud-chip` 的边框与阴影；把 `#upgrade-attack` 改为橙色渐变、浅色描边和短距离悬浮动画；将 `.weapon-button` 设为浅色装备格，`.weapon-button.active` 使用黄色描边。保留现有绝对定位锚点和所有 ID。

```css
--panel: rgba(255, 253, 242, .94);
#upgrade-attack { background: linear-gradient(#ffbd52, #ed7b35); }
.weapon-button { background: #fffdf0; color: #47657a; }
```

- [x] **Step 3: 调整开始页、升级弹窗和结束页的层次**

将 `.screen` 的蒙层改为较淡的蓝色，`.panel` 改为奶油白渐变和柔和短阴影；保留标题、按钮文本、可访问性属性和事件 ID。

- [x] **Step 4: 运行浏览器测试**

Run: `python3 /Users/xbguan/.agents/skills/webapp-testing/scripts/with_server.py --server "python3 -m http.server 8765 --bind 127.0.0.1" --port 8765 -- python3 tests/browser-smoke.py`

Expected: PASS；升级按钮仍在底部中央，且不与左右控件重叠。

### Task 3: 重绘缓存角色精灵与地景细节

**Files:**
- Modify: `index.html:857-1033`
- Test: `tests/browser-smoke.py:119-133`

**Interfaces:**
- Consumes: `buildSpriteCache()`、`sprites`、`drawCached()`、`drawPlayer()`、`drawEagle()`、`drawDrone()`、`drawWizard()`、`drawBoss()` 和现有敌人状态字段。
- Produces: 不新增每帧渐变的战机、老鹰、无人机、斗篷魔法师、BOSS 和地景缓存精灵。

- [x] **Step 1: 增加缓存视觉回归断言**

在现有 `window.__renderStats.gradients < 180` 后加入：

```python
assert page.locator("#game-canvas").is_visible()
assert page.evaluate("window.__renderStats.gradients") < 180
```

- [x] **Step 2: 重画玩家战机缓存**

在 `buildSpriteCache()` 中保留玩家精灵缓存键，使用机翼、金属机身、青蓝座舱、圆形队徽和小尾焰组成小小战斗队员战机。尺寸不得大于当前缓存画布尺寸；`drawPlayer()` 继续只调用 `drawCached()`。

- [x] **Step 3: 重画敌人与 BOSS 缓存**

老鹰增加分层翅膀与利爪；无人机增加倾斜外壳、旋翼和红灯；魔法师增加飘动斗篷、帽檐、法杖和魔法球；棕/蓝 BOSS 保持各自轮廓与主色。所有渐变、阴影只在 `buildSpriteCache()` 创建。

- [x] **Step 4: 丰富既有地景缓存**

保留现有不超过 12 个循环对象，为树木、草丛和湖泊增加高光、暗面和边缘，不新增动态数组，不改视差速度。

- [x] **Step 5: 运行浏览器性能回归**

Run: `python3 /Users/xbguan/.agents/skills/webapp-testing/scripts/with_server.py --server "python3 -m http.server 8765 --bind 127.0.0.1" --port 8765 -- python3 tests/browser-smoke.py`

Expected: PASS；截图持续动画、无浏览器错误、渐变总数仍低于 180。

### Task 4: 同步 V1 快照并做最终验证

**Files:**
- Modify: `index.html`
- Modify: `versions/airplane-battle-v1.html`
- Modify: `docs/CHANGELOG.md`

**Interfaces:**
- Consumes: 已验证的 `index.html`。
- Produces: 内容一致的 V1 入口与快照，以及可追溯的视觉优化记录。

- [x] **Step 1: 写入变更记录**

在 `docs/CHANGELOG.md` 的 V1 小节增加一条：`UI：采用“甜酷野战 × 小小战斗队员”视觉，优化 HUD、装备按钮与缓存角色精灵，不改变玩法规则。`

- [x] **Step 2: 同步快照**

将已验证的 `index.html` 完整内容同步到 `versions/airplane-battle-v1.html`，不修改其他版本文件。

- [x] **Step 3: 验证规则、语法、离线与快照一致性**

Run:

```bash
node --test tests/game-logic.test.mjs
node -e "const fs=require('fs');const s=fs.readFileSync('index.html','utf8');for(const m of s.matchAll(/<script(?: [^>]*)?>([\\s\\S]*?)<\\/script>/g))new Function(m[1]);if(s.includes('https://')||s.includes('http://'))throw Error('external runtime URL');console.log('syntax and offline checks ok')"
cmp -s index.html versions/airplane-battle-v1.html
```

Expected: 13/13 规则测试通过；语法和离线检查通过；`cmp` 返回 0。

- [x] **Step 4: 做最终浏览器验证**

Run: `python3 /Users/xbguan/.agents/skills/webapp-testing/scripts/with_server.py --server "python3 -m http.server 8765 --bind 127.0.0.1" --port 8765 -- python3 tests/browser-smoke.py`

Expected: PASS，且输出 `/tmp/airplane-battle-v1.png`。
