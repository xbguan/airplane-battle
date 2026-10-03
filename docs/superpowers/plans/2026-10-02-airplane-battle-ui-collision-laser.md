# 飞机大战 UI、碰撞与激光反馈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一游戏 UI 风格，修复普通怪撞机结算，并将激光改为两秒一次的瞬发视觉。

**Architecture:** 所有改动限定在单文件 `index.html`：CSS 管理 UI 风格，游戏状态增加背景选择和短寿命激光闪现，既有更新/渲染循环负责碰撞、音效与绘制。规则测试在 `tests/game-logic.test.mjs` 以静态契约覆盖新增结算和激光状态。

**Tech Stack:** 原生 HTML、CSS、JavaScript、Node.js test runner；不增加依赖。

## Global Constraints

- 不修改既有武器伤害、升级上限、碎片与 BOSS 数值。
- 不增加猫头鹰、无人机、蝙蝠的远程攻击。
- 所有音效使用现有缓存 AudioBuffer 模式，禁止主循环创建高频 AudioNode。
- 不执行 Git 操作。

---

### Task 1: 普通怪撞机统一结算

**Files:**
- Modify: `tests/game-logic.test.mjs`
- Modify: `index.html`

**Interfaces:**
- Consumes: `GameRules.enemyStats`, `damagePlayer(amount)`, `killEnemy(enemy)`。
- Produces: `resolveEnemyCollision(enemy, player)`，返回碰撞是否已结算。

- [ ] **Step 1: 写失败测试**

```js
test('all normal enemy body collisions use one kill-and-progress resolver', () => {
  assert.match(html, /function resolveEnemyCollision\(enemy, player\)/);
  assert.match(html, /enemy\.type === 'eagle' \|\| enemy\.type === 'drone' \|\| enemy\.type === 'bat' \|\| enemy\.type === 'wizard'/);
  assert.match(html, /killEnemy\(enemy\)/);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/game-logic.test.mjs`  
Expected: 新测试失败，找不到 `resolveEnemyCollision`。

- [ ] **Step 3: 实现最小结算函数**

```js
function resolveEnemyCollision(enemy, player) {
  if (enemy.dead || !GameRules.circlesOverlap(enemy, player)) return false;
  const damage = enemy.type === 'bat' ? GameRules.enemyStats.bat.dps : GameRules.enemyStats[enemy.type].damage;
  if (!damagePlayer(damage)) return false;
  killEnemy(enemy);
  return true;
}
```

在 `updateEnemy` 中让 eagle、drone、bat、wizard 都调用此函数；移除 bat 的贴身持续扣血分支。BOSS 碰撞逻辑不动。

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test tests/game-logic.test.mjs`  
Expected: 全部通过。

### Task 2: 瞬发激光与远程发射音

**Files:**
- Modify: `tests/game-logic.test.mjs`
- Modify: `index.html`

**Interfaces:**
- Consumes: `GameRules.specialWeaponInterval('laser')`, `EnemyProjectileVisuals`。
- Produces: `game.laserFlash`（`{x,y,rotation,length,life,maxLife}` 或 `null`）、`playSound('wizard-shot'|'orange-shot'|'blue-shot')`。

- [ ] **Step 1: 写失败测试**

```js
test('laser is rendered only through a short flash state after the two-second hit', () => {
  assert.match(html, /laserFlash: null/);
  assert.match(html, /game\.laserFlash = \{ x: game\.player\.x/);
  assert.match(html, /if \(game\.laserFlash\)/);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/game-logic.test.mjs`  
Expected: 新测试失败。

- [ ] **Step 3: 实现瞬发射线与音效**

在 `updateLaser` 到达两秒结算时设置 `laserFlash`，寿命 `.14` 秒；`drawProjectiles` 只在 `laserFlash` 存在时绘制射线，充能阶段改为绘制小型锁定标记。`updateParticles` 递减并清除 `laserFlash`。

在 `createSoundBuffer` 中新增 `wizard-shot`、`orange-shot`、`blue-shot` 三个定义；在 wizard 与两个 BOSS 的既有 `shootEnemyBullet` 调用前播放对应声音。每种声音设置不低于 120ms 冷却。

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test tests/game-logic.test.mjs`  
Expected: 全部通过且激光规则测试的两秒间隔保持不变。

### Task 3: 机库弹框、HUD 与背景选择

**Files:**
- Modify: `tests/game-logic.test.mjs`
- Modify: `index.html`

**Interfaces:**
- Consumes: `activeSceneBackground`, `startGame()`。
- Produces: `setSceneTheme(theme)`；开始页背景选择按钮 `data-scene-theme`。

- [ ] **Step 1: 写失败测试**

```js
test('start screen exposes both retained scene themes and HUD avoids emoji labels', () => {
  assert.match(html, /data-scene-theme="backgroundTopdown"/);
  assert.match(html, /data-scene-theme="backgroundPerspective"/);
  assert.match(html, /function setSceneTheme\(theme\)/);
  assert.doesNotMatch(html, /❤️|🎯|⭐/);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `node --test tests/game-logic.test.mjs`  
Expected: 新测试失败。

- [ ] **Step 3: 最小 UI 实现**

将 `activeSceneBackground` 改为可赋值变量，新增 `setSceneTheme` 验证两个保留主题并更新选择状态。开始页插入两张背景选择卡，并绑定点击；默认俯视主题。

重写 `.panel`、`.hud-chip`、`.meter`、主按钮相关 CSS 为深蓝金属边、像素内高光、玻璃槽和橙色主按钮；开始与结算页共用同一面板样式。将 HUD 的三个 emoji 替换为 CSS 像素图标元素。

将 `drawPlayer` 的炮口闪光缩至 `10×12`，移动至两侧枪管口坐标。

- [ ] **Step 4: 运行测试，确认通过**

Run: `node --test tests/game-logic.test.mjs`  
Expected: 全部通过。

### Task 4: 全量验证与记录

**Files:**
- Modify: `docs/CHANGELOG.md`

- [ ] **Step 1: 运行逻辑与语法验证**

Run:

```bash
node --test tests/game-logic.test.mjs
node --check <(sed -n '/^<script>$/,/^<\/script>$/p' index.html | sed '1d;$d')
```

Expected: 测试全绿，脚本语法无输出。

- [ ] **Step 2: 验证素材清单与 Manifest**

Run a local path check over every `assets/...png` referenced by `index.html`; expected missing list is empty.

- [ ] **Step 3: 更新记录**

在 `docs/CHANGELOG.md` 顶部添加一条当前日期记录：UI 统一、两背景选择、普通怪撞机结算、瞬发激光、远程发射音。

- [ ] **Step 4: 浏览器验证**

Run: `python3 tests/browser-smoke.py`。若 Chromium 在启动前 SIGTRAP，记录其为本机环境限制，不将其误报为页面失败。
