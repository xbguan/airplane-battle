# 战斗反馈增强 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持既有战斗数值的边界内，提升激光、蓝白 BOSS 能量弹、受损状态和导弹音效的可读性与反馈。

**Architecture:** 保持单文件 Canvas 游戏。激光仅调整 `GameRules` 的射击间隔和已有短闪参数；受损效果通过固定上限的粒子记录跟随玩家或 BOSS；导弹音频节点按子弹 ID 保存与清理。蓝白能量弹仍使用 `blueBossBolt` 键，先在资产清单确认素材后才修改 PNG。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Canvas、Web Audio API、Node.js `node:test`、Python Playwright 烟测。

## Global Constraints

- `index.html` 是唯一可玩源码与 GitHub Pages 入口；不修改 V1 快照。
- 激光单发伤害、三级上限、锁定目标模型不变；间隔固定为 1.5 秒。
- 导弹伤害、敌方伤害、碰撞、背景、碎片和升级规则不变。
- 仅使用本地原创 PNG；蓝白 BOSS 弹保持透明背景与现有 `blueBossBolt` 资源键。
- 运行时预加载缓存资源；主循环不得重复创建 Image、渐变、阴影或高频音频节点。
- 不执行 Git 操作；由用户自行管理版本。

---

## File Map

- `全部资产清单.html`：标注将调整的蓝白 BOSS 能量弹及其视觉规格，作为用户素材确认页面。
- `assets/weapons/boss-blue-bolt.png`：确认后就地更新的透明能量弹 PNG。
- `tests/game-logic.test.mjs`：激光节奏/短闪、资源键、受损档位与导弹音频生命周期的回归契约。
- `index.html`：规则、激光绘制、受损粒子和导弹 Web Audio 生命周期。
- `docs/CHANGELOG.md`：用户可见的本轮变化与验证。

### Task 1: 蓝白 BOSS 能量弹素材确认关口

**Files:**
- Modify: `全部资产清单.html`

**Interfaces:**
- Consumes: 既有 `assets/weapons/boss-blue-bolt.png` 与 `blueBossBolt` 资源键。
- Produces: 清单中可审阅的“蓝白 BOSS 能量弹（调整版）”条目；不改变游戏代码或 PNG。

- [x] **Step 1: 在武器/命中特效区添加调整说明**

在现有 `boss-blue-bolt.png` 素材卡片下写入：

```html
<p class="asset-note">蓝白 BOSS 能量弹（调整版）：暖白核心、靛蓝外圈、紫蓝拖尾、深色像素描边；透明背景，用于海面场景提升可读性。</p>
```

- [x] **Step 2: 校验清单仍指向既有文件**

Run: `test -f assets/weapons/boss-blue-bolt.png && rg -n '蓝白 BOSS 能量弹（调整版）|boss-blue-bolt.png' 全部资产清单.html`

Expected: 文件存在，清单同时包含素材路径和调整说明。

- [x] **Step 3: 停止并请求用户确认素材方向**

向用户展示清单链接；在获得“确认”前，不生成或覆盖 `assets/weapons/boss-blue-bolt.png`，也不改动 `index.html`。

### Task 2: 更新能量弹 PNG，并锁定激光与素材契约

**Files:**
- Modify: `assets/weapons/boss-blue-bolt.png`
- Modify: `tests/game-logic.test.mjs`
- Modify: `index.html:320-410, 948-965, 1276-1285`

**Interfaces:**
- Produces: `GameRules.specialWeaponInterval('laser') === 1.5`；`game.laserFlash = { ..., life: .18, maxLife: .18 }`；光束使用 `34` 高度；蓝 BOSS 继续经 `EnemyProjectileVisuals.blue === 'blueBossBolt'` 绘制。
- Consumes: Task 1 的确认素材和现有 `blueBossBolt` 预加载键。

- [x] **Step 1: 添加失败的激光/能量弹契约测试**

在 `tests/game-logic.test.mjs` 增加：

```js
test('laser flashes more clearly every 1.5 seconds and blue boss bolts keep their dedicated asset', () => {
  assert.equal(rules.specialWeaponInterval('laser'), 1.5);
  assert.match(html, /life: \.18, maxLife: \.18/);
  assert.match(html, /flash\.length, 34, flash\.rotation/);
  assert.match(html, /blueBossBolt: 'assets\/weapons\/boss-blue-bolt\.png'/);
  assert.match(html, /const EnemyProjectileVisuals = \{ wizard: 'wizardMagicOrb', brown: 'orangeBossShell', blue: 'blueBossBolt' \};/);
});
```

- [x] **Step 2: 运行测试并确认失败**

Run: `node --test tests/game-logic.test.mjs`

Expected: FAIL，因为当前间隔是 2、短闪是 `.14` 且宽度是 `24`。

- [x] **Step 3: 生成并覆盖已确认的透明 PNG**

以 Task 1 清单说明为准确提示，生成一张透明背景的 2.5D 像素风 PNG，覆盖：

```
assets/weapons/boss-blue-bolt.png
```

不得新增资源键、文件名或在线依赖；生成后检查透明通道与实际像素尺寸。

- [x] **Step 4: 最小调整激光规则与绘制**

将 `GameRules.specialWeaponInterval('laser')` 的返回值由 `2` 改为 `1.5`，并在 `updateLaser()` 中设置：

```js
game.laserFlash = { x: game.player.x, y, rotation: Math.atan2(dy, dx), length: Math.hypot(dx, dy), life: .18, maxLife: .18 };
```

将 `drawProjectiles()` 的激光短闪改为：

```js
drawAsset('laser', flash.x + Math.cos(flash.rotation) * flash.length / 2, flash.y + Math.sin(flash.rotation) * flash.length / 2, flash.length, 34, flash.rotation, flash.life / flash.maxLife);
```

- [x] **Step 5: 运行完整规则测试**

Run: `node --test tests/game-logic.test.mjs`

Expected: 全部通过，且既有伤害与等级断言不变。

### Task 3: 可控的双方受损烟火

**Files:**
- Modify: `tests/game-logic.test.mjs`
- Modify: `index.html:590-620, 893-915, 973-1020, 1290-1310`

**Interfaces:**
- Produces: `GameRules.damageState(hp, maxHp): 'none' | 'smoke' | 'fire'`，阈值为 `< .65` 和 `< .35`；`game.damageEffects` 最多 18 个元素，每个对象为 `{ ownerId, kind, x, y, vx, vy, life, maxLife }`。
- Consumes: `game.player`（`id: 'player'`）和 BOSS 的 `id/hp/maxHp`；现有 `random()`、`clamp()`、`ellipse()`。

- [x] **Step 1: 添加失败的损伤状态测试**

```js
test('damage state uses smoke below 65 percent and fire below 35 percent', () => {
  assert.equal(rules.damageState(65, 100), 'none');
  assert.equal(rules.damageState(64, 100), 'smoke');
  assert.equal(rules.damageState(35, 100), 'smoke');
  assert.equal(rules.damageState(34, 100), 'fire');
  assert.match(html, /damageEffects: \[\]/);
  assert.match(html, /game\.damageEffects\.length < 18/);
});
```

- [x] **Step 2: 运行测试并确认失败**

Run: `node --test tests/game-logic.test.mjs`

Expected: FAIL，因为 `damageState` 和 `damageEffects` 尚不存在。

- [x] **Step 3: 添加纯规则与状态容器**

在 `GameRules` 加入：

```js
damageState(hp, maxHp) {
  const ratio = maxHp > 0 ? hp / maxHp : 1;
  if (ratio < .35) return 'fire';
  if (ratio < .65) return 'smoke';
  return 'none';
},
```

在 `resetGame()` 中为玩家增加 `id: 'player', maxHp: 100`，并新增 `damageEffects: []`。

- [x] **Step 4: 低频生成、更新与绘制损伤特效**

在 `update()` 中、`updateParticles(dt)` 前调用 `updateDamageEffects(dt)`。实现时每 0.18 秒最多新增一个效果、总数最多 18；对玩家和当前 BOSS 调用 `GameRules.damageState()`：

```js
const state = GameRules.damageState(owner.hp, owner.maxHp);
const kind = state === 'fire' && Math.random() < .42 ? 'fire' : 'smoke';
game.damageEffects.push({ ownerId: owner.id, kind, x: owner.x + random(-18, 18), y: owner.y + random(-14, 16), vx: random(-9, 9), vy: kind === 'fire' ? random(-25, -12) : random(-38, -20), life: kind === 'fire' ? .42 : .7, maxLife: kind === 'fire' ? .42 : .7 });
```

更新位置与生命后删除过期元素；在 `drawEffects()` 中绘制灰烟（灰蓝半透明圆）和火苗（橙红小圆加黄色内芯）。不创建 Image、渐变或音频节点。

- [x] **Step 5: 运行完整规则测试**

Run: `node --test tests/game-logic.test.mjs`

Expected: 全部通过；边界值 65%/35% 不提前触发。

### Task 4: 导弹点火与推进声的生命周期

**Files:**
- Modify: `tests/game-logic.test.mjs`
- Modify: `index.html:493-590, 855-890, 975-1020`

**Interfaces:**
- Produces: `startMissileEngine(id)`、`stopMissileEngine(id)`；`missileEngines` 为 `Map<Number, { oscillator: OscillatorNode, gain: GainNode }>`。
- Consumes: `ensureAudio()`、`fireHoming()` 生成的 `bullet.id`、`updateBullets()` 标记的 `bullet.dead`。

- [x] **Step 1: 添加失败的导弹音频生命周期契约测试**

```js
test('homing missiles have an ignition and a disposable engine sound lifecycle', () => {
  assert.match(html, /const missileEngines = new Map\(\);/);
  assert.match(html, /function startMissileEngine\(id\)/);
  assert.match(html, /function stopMissileEngine\(id\)/);
  assert.match(html, /playSound\('missile-launch'\);/);
  assert.match(html, /startMissileEngine\(bullet\.id\);/);
  assert.match(html, /if \(bullet\.dead\) stopMissileEngine\(bullet\.id\);/);
  assert.match(html, /oscillator\.disconnect\(\);/);
  assert.match(html, /gain\.disconnect\(\);/);
});
```

- [x] **Step 2: 运行测试并确认失败**

Run: `node --test tests/game-logic.test.mjs`

Expected: FAIL，因为导弹目前没有独立的发射/推进声音与清理逻辑。

- [x] **Step 3: 添加点火缓冲声**

在 `createSoundBuffer()` 的 `definitions` 加入：

```js
'missile-launch': [120, 310, .14, .16, 'saw'],
```

并在 `playSound()` 的 `limits` 加入：

```js
'missile-launch': 120,
```

- [x] **Step 4: 添加每枚导弹一个推进音节点与清理函数**

在 `soundBuffers` 旁新增 `const missileEngines = new Map();`；实现：

```js
function startMissileEngine(id) {
  const audio = ensureAudio();
  if (!audio || missileEngines.has(id)) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'sawtooth';
  oscillator.frequency.value = 92;
  gain.gain.value = .028;
  oscillator.connect(gain); gain.connect(audio.destination);
  oscillator.start();
  missileEngines.set(id, { oscillator, gain });
}
function stopMissileEngine(id) {
  const engine = missileEngines.get(id);
  if (!engine) return;
  engine.oscillator.stop(); engine.oscillator.disconnect(); engine.gain.disconnect();
  missileEngines.delete(id);
}
```

- [x] **Step 5: 绑定发射和死亡时机**

在 `fireHoming()` 的 `game.bullets.push(...)` 后调用：

```js
playSound('missile-launch');
startMissileEngine(bullet.id);
```

将推入对象先赋给 `const bullet`，再推入 `game.bullets`，保持字段不变。`updateBullets()` 在每枚子弹标记 `dead` 后调用 `if (bullet.dead) stopMissileEngine(bullet.id);`，并在 `resetGame()` 开始时遍历当前 `missileEngines.keys()` 停止所有残留节点。

- [x] **Step 6: 运行完整规则测试**

Run: `node --test tests/game-logic.test.mjs`

Expected: 全部通过；测试源码包含发射、推进和停止/断开契约。

### Task 5: 静态校验、浏览器验收与记录

**Files:**
- Modify: `docs/CHANGELOG.md`
- Modify only if browser reaches page: `tests/browser-smoke.py`

**Interfaces:**
- Consumes: Tasks 1–4 的最终源码、PNG 和测试。
- Produces: 可追溯验证结果与变更记录。

- [x] **Step 1: 验证内嵌 JavaScript 可解析与资产路径存在**

Run: `node --check <(sed -n '/<script>/,/<\\/script>/p' index.html | sed '1d;$d')` 并执行现有资源路径检查脚本；若 shell 不支持进程替换，则以临时文件执行同等 `node --check`。

Expected: 解析成功；`assets/weapons/boss-blue-bolt.png` 存在且 `AssetManifest` 的所有 PNG 路径存在。

- [x] **Step 2: 运行浏览器烟测**

Run: `python3 tests/browser-smoke.py`

Expected: 如浏览器可启动，画布持续动画、无控制台错误，激光在 1.5 秒节奏出现，海面上的蓝白弹可辨，玩家/BOSS 损伤效果跟随目标，导弹消失后无残留 Web Audio 节点。若 Chromium 在加载前 SIGTRAP，仅记录该阻断，不报告为通过。

- [x] **Step 3: 更新变更记录**

在 `docs/CHANGELOG.md` 顶部加入：

```markdown
## 战斗反馈增强 - 2026-10-03

- 激光锁定闪击调整为每 1.5 秒一次，并加粗、延长短闪；伤害与等级上限不变。
- 调整蓝白 BOSS 能量弹的高对比像素素材；玩家与 BOSS 在 65%/35% 损伤阈值显示烟雾/火焰。
- 导弹新增点火与飞行推进声，导弹结束时释放对应 Web Audio 节点。
```

- [x] **Step 4: 最终回归**

Run: `node --test tests/game-logic.test.mjs`

Expected: 全部测试通过；仅报告已实际执行的浏览器验证状态。
