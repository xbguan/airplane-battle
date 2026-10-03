# 《飞机大战》HUD 清晰度与机枪对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让怪物进度、碎片与攻击升级 HUD 清晰易懂，并让玩家两侧炮口火花、子弹和曳光共用准确枪口基准。

**Architecture:** 保持单文件游戏结构，只在 `GameRules` 增加可测试的玩家枪口锚点，在运行脚本中由发射与绘制共同消费。HUD 使用现有 DOM 和本地资源，通过局部 CSS 与图片引用调整完成，不增加依赖或 PNG。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Node.js `node:test`、Python Playwright 烟测。

## Global Constraints

- `index.html` 仍是唯一可玩源码与 GitHub Pages 入口。
- 不改变伤害、射速、碰撞、升级、碎片、武器、缓存和性能上限。
- 不新增框架、构建工具、CDN、在线资源或图片文件。
- 不同步 `versions/airplane-battle-v1.html`。
- 不执行任何 Git 操作；所有 Git 动作由用户处理。
- 只修改 `index.html`、直接相关测试、设计/计划文档和 `docs/CHANGELOG.md`。

---

## File Map

- `index.html`：HUD 样式与图片引用、可测试枪口锚点、玩家战机/炮口绘制和子弹生成。
- `tests/game-logic.test.mjs`：HUD 结构契约与枪口锚点规则测试。
- `tests/browser-smoke.py`：仅在浏览器可启动时补充紧凑布局和可见性断言。
- `docs/CHANGELOG.md`：记录本次用户可见修复及验证结果。

### Task 1: HUD 图标、文字与攻击升级尺寸

**Files:**
- Modify: `tests/game-logic.test.mjs`
- Modify: `index.html:55-155`
- Modify: `index.html:251-264`

**Interfaces:**
- Consumes: 既有 `.mission-icon`、`.fragment-button`、`#upgrade-attack`、`.weapon-asset` 和对应 DOM ID。
- Produces: 靶心怪物眼 CSS 图标、清晰碎片图标与文字、紧凑攻击升级按钮。

- [ ] **Step 1: 添加失败的 HUD 契约测试**

在 `tests/game-logic.test.mjs` 末尾加入：

```js
test('combat HUD uses a clear progress icon and compact readable controls', () => {
  assert.match(html, /\.mission-icon::before/);
  assert.match(html, /\.mission-icon::after/);
  assert.doesNotMatch(html, /\.mission-icon \{ transform: rotate\(45deg\)/);
  assert.match(html, /id="homing-fragment"[^>]*><img src="assets\/weapons\/ui-homing-missile\.png"/);
  assert.match(html, /id="laser-fragment"[^>]*><img src="assets\/weapons\/ui-laser-cannon\.png"/);
  assert.match(html, /\.fragment-button \{[^}]*text-shadow: none/s);
  assert.match(html, /#upgrade-attack \.weapon-asset \{[^}]*width: clamp\(34px, 2\.5vw, 46px\)/s);
});
```

- [ ] **Step 2: 运行测试并确认正确失败**

Run: `node --test tests/game-logic.test.mjs`

Expected: 新测试失败；失败原因是缺少伪元素靶心、碎片仍引用 `fragment-*.png`，且升级图标仍使用通用 `65%` 规则。

- [ ] **Step 3: 最小修改 HUD CSS**

将 `.mission-icon` 改成不旋转的圆形靶心，使用径向色块表现怪物眼；用两个伪元素画横纵刻度：

```css
.mission-icon {
  overflow: visible;
  border-radius: 50%;
  border-color: #ffe985;
  background: radial-gradient(circle, #fff 0 14%, #173a58 15% 28%, #ffcf46 29% 52%, #d95a4d 53% 100%);
}
.mission-icon::before, .mission-icon::after { content: ''; position: absolute; left: 50%; top: 50%; background: #ffe985; transform: translate(-50%, -50%); }
.mission-icon::before { width: 1.5em; height: .12em; }
.mission-icon::after { width: .12em; height: 1.5em; }
```

为碎片按钮追加清晰文字规则，并为升级按钮设置独立尺寸：

```css
.fragment-button { text-shadow: none; letter-spacing: 0; }
#upgrade-attack { min-height: 0; gap: .5vw; padding: .35vw .72vw; font-size: clamp(11px, .82vw, 15px); }
#upgrade-attack .weapon-asset { width: clamp(34px, 2.5vw, 46px); height: clamp(34px, 2.5vw, 46px); margin: 0; flex: 0 0 auto; }
```

- [ ] **Step 4: 替换碎片按钮图片引用**

```html
<button id="homing-fragment" class="fragment-button"><img src="assets/weapons/ui-homing-missile.png" alt=""><span>追踪碎片</span><span class="fragment-count">0/5</span></button>
<button id="laser-fragment" class="fragment-button"><img src="assets/weapons/ui-laser-cannon.png" alt=""><span>激光碎片</span><span class="fragment-count">0/5</span></button>
```

- [ ] **Step 5: 运行测试确认 HUD 契约通过**

Run: `node --test tests/game-logic.test.mjs`

Expected: 新 HUD 测试与所有既有规则测试通过。

### Task 2: 统一战机、火花和弹道的枪口基准

**Files:**
- Modify: `tests/game-logic.test.mjs`
- Modify: `index.html:315-425`
- Modify: `index.html:844-849`
- Modify: `index.html:1219-1227`

**Interfaces:**
- Produces: `GameRules.playerGunAnchors(): Array<{x: number, y: number}>`，固定返回左右两侧枪口 `[{ x: -16, y: -19 }, { x: 16, y: -19 }]`。
- Consumes: `firePlayer()` 使用 `x` 生成子弹；`drawPlayer()` 使用 `x/y` 绘制炮口火花。

- [ ] **Step 1: 添加失败的共享枪口测试**

在 `tests/game-logic.test.mjs` 增加：

```js
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
```

- [ ] **Step 2: 运行测试并确认正确失败**

Run: `node --test tests/game-logic.test.mjs`

Expected: FAIL，因为 `playerGunAnchors()` 尚不存在，当前子弹使用 `[-13, 13]`，火花使用 `±34`。

- [ ] **Step 3: 在 GameRules 增加唯一枪口锚点**

在 `maxWeaponLevel()` 附近加入：

```js
playerGunAnchors() {
  return [{ x: -16, y: -19 }, { x: 16, y: -19 }];
},
```

- [ ] **Step 4: 让子弹与火花消费同一锚点并补偿战机素材偏心**

将 `firePlayer()` 改为：

```js
function firePlayer() {
  const damage = GameRules.bulletDamage(game.attackLevel);
  for (const gun of GameRules.playerGunAnchors()) {
    game.bullets.push({ id: nextId++, type: 'fire', x: game.player.x + gun.x, y: game.player.y - 34, vx: 0, vy: -720, r: 7, damage, life: 2 });
  }
}
```

将 `drawPlayer()` 中玩家主体与火花改为：

```js
drawAsset('player', player.x + 13, player.y, 116, 85, 0, alpha);
if (game.running && game.time % .09 < .06) {
  for (const gun of GameRules.playerGunAnchors()) {
    drawAsset('playerMuzzleFlashV2', player.x + gun.x, player.y + gun.y, 8, 8, 0, alpha);
  }
}
```

投影仍以 `player.x` 为中心；补偿后战机有效图形与投影、碰撞圆中心一致。

- [ ] **Step 5: 运行完整规则测试**

Run: `node --test tests/game-logic.test.mjs`

Expected: 全部测试通过，既有战斗数值断言不变。

### Task 3: 浏览器布局验证与变更记录

**Files:**
- Modify only if browser reaches page: `tests/browser-smoke.py`
- Modify: `docs/CHANGELOG.md`

**Interfaces:**
- Consumes: Task 1 的 HUD DOM/CSS、Task 2 的共享枪口锚点。
- Produces: 可重复的布局断言与本次变更记录。

- [ ] **Step 1: 启动现有浏览器烟测**

Run: `python3 tests/browser-smoke.py`

Expected: 浏览器能够加载页面并执行断言；若启动前再次出现 Chromium `SIGTRAP`，保存完整错误，不把浏览器验证描述为通过。

- [ ] **Step 2: 浏览器可启动时先添加会失败的紧凑布局断言**

在取得 `upgrade_box`、`fragments_box`、`shell_box` 后加入：

```python
assert upgrade_box["height"] < shell_box["height"] * 0.11
assert upgrade_box["width"] < shell_box["width"] * 0.24
assert page.locator("#homing-fragment img").get_attribute("src") == "assets/weapons/ui-homing-missile.png"
assert page.locator("#laser-fragment img").get_attribute("src") == "assets/weapons/ui-laser-cannon.png"
assert page.locator("#homing-fragment").evaluate(
    "node => getComputedStyle(node).textShadow"
) == "none"
```

先在尚未应用 Task 1 修改的基线上运行时，这些断言应因按钮过高、旧图片引用和文字阴影而失败。若 Task 1 已完成，则通过当前源码与上一版截图确认 RED 证据，不回滚生产代码。

- [ ] **Step 3: 重新运行浏览器烟测**

Run: `python3 tests/browser-smoke.py`

Expected: 页面持续动画、没有控制台错误、新布局断言通过。若测试进入页面后暴露既有陈旧文案断言，只更新与当前 `index.html` 明确不一致的文案选择器，不改游戏行为或其他场景。

- [ ] **Step 4: 更新变更记录**

在 `docs/CHANGELOG.md` 最新日期下记录：

```markdown
- 将本轮进度图标改为明确的靶心怪物眼，提升碎片文字与图标清晰度，并收紧攻击升级按钮尺寸。
- 校正玩家战机素材的绘制中心，统一两侧机枪火花、子弹与曳光的枪口锚点；战斗数值不变。
```

- [ ] **Step 5: 完成前全量验证**

Run:

```bash
node --test tests/game-logic.test.mjs
node -e "const fs=require('fs');const s=fs.readFileSync('index.html','utf8');const scripts=[...s.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]);for(const code of scripts)new Function(code);console.log('inline scripts:',scripts.length,'syntax: ok')"
node -e "const fs=require('fs');const s=fs.readFileSync('index.html','utf8');const paths=[...s.matchAll(/['\"](assets\/[^'\"]+\.png)['\"]/g)].map(m=>m[1]);const missing=[...new Set(paths)].filter(p=>!fs.existsSync(p));console.log('missing:',missing);process.exit(missing.length?1:0)"
python3 tests/browser-smoke.py
```

Expected: 规则测试、脚本语法和资源检查通过；浏览器烟测通过，或明确记录启动前 `SIGTRAP` 环境阻断。
