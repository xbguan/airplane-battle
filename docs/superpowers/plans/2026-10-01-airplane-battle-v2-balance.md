# 飞机大战 V2 难度与武器平衡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将无限火力的 V1 调整为前易后难的 V2，使满级武器不能秒杀后期 BOSS。

**Architecture:** 在 `GameRules` 集中定义武器上限、伤害、阶段倍率、BOSS 缩放和碎片选择，运行时只消费这些纯规则。`index.html` 继续是唯一源码；V1 快照保持不变，完成后新增 V2 快照。

**Tech Stack:** 原生 HTML、Canvas 2D、Web Audio API、Node 内置测试、Python Playwright。

## Global Constraints

- 单 HTML、零外部依赖；不拆分文件、不引入构建工具或 CDN。
- V1 快照 `versions/airplane-battle-v1.html` 不得修改。
- 火球最高 5 级，导弹和激光各最高 3 级。
- 激光每 2 秒最多伤害一次；导弹最短发射间隔 1.5 秒。
- 普通怪仍最多 10 只；地景、缓存精灵与音频缓存机制不退化。
- 不执行 Git 操作，由用户自行管理。

---

### Task 1: 建立 V2 平衡纯规则与失败测试

**Files:**
- Modify: `tests/game-logic.test.mjs:25-52`
- Modify: `index.html:298-370`

**Interfaces:**
- Consumes: `GameRules` 当前的升级、伤害和 BOSS 生命接口。
- Produces: `maxAttackLevel()`, `maxWeaponLevel(type)`, `difficulty(bosses)`, `bossScale(number)`，并更新 `bulletDamage(level)`、`specialDamage(type, level)`、`bossHealthRange(number)`、`canUpgrade(fragments, level, type)`、`applyFragmentUpgrade(fragments, level, accepted, type)`、`applyAttackUpgrade(xp, level)`。

- [x] **Step 1: 将旧数值断言替换为 V2 失败断言**

```js
test('weapon damage and upgrade levels are capped for V2', () => {
  assert.equal(rules.maxAttackLevel(), 5);
  assert.equal(rules.maxWeaponLevel('laser'), 3);
  assert.equal(rules.bulletDamage(0), 2);
  assert.equal(rules.bulletDamage(5), 12);
  assert.equal(rules.bulletDamage(99), 12);
  assert.equal(rules.specialDamage('homing', 1), 45);
  assert.equal(rules.specialDamage('homing', 3), 85);
  assert.equal(rules.specialDamage('laser', 3), 65);
  assert.equal(rules.canUpgrade(5, 3, 'laser'), false);
});

test('V2 boss and enemy difficulty scales by defeated bosses', () => {
  assert.deepEqual(plain(rules.bossHealthRange(1)), [160, 220]);
  assert.deepEqual(plain(rules.bossHealthRange(3)), [336, 463]);
  assert.deepEqual(plain(rules.difficulty(0)), { hp: 1, speed: 1, spawnInterval: 1.55 });
  assert.deepEqual(plain(rules.difficulty(3)), { hp: 1.36, speed: 1.12, spawnInterval: 1.39 });
  assert.deepEqual(plain(rules.bossScale(20)), { speed: 1.28, cooldown: .6 });
});
```

- [x] **Step 2: 运行规则测试，确认失败来自 V1 数值**

Run: `node --test tests/game-logic.test.mjs`

Expected: FAIL，旧火球翻倍、特殊武器 200/150 伤害、旧 BOSS 范围或缺失新接口导致失败。

- [x] **Step 3: 以最小规则替换实现**

在 `GameRules` 中实现：

```js
maxAttackLevel() { return 5; },
maxWeaponLevel() { return 3; },
bulletDamage(level) { return 2 + 2 * Math.min(level, this.maxAttackLevel()); },
specialDamage(type, level) {
  const values = type === 'homing' ? [0, 45, 65, 85] : [0, 35, 50, 65];
  return values[Math.min(level, this.maxWeaponLevel(type))];
},
bossHealthRange(number) {
  const multiplier = 1.45 ** (number - 1);
  return [Math.round(160 * multiplier), Math.round(220 * multiplier)];
},
difficulty(bosses) {
  const steps = Math.max(0, bosses - 1);
  return { hp: Number((1 + Math.min(.18 * steps, .9)).toFixed(2)), speed: Number((1 + Math.min(.06 * steps, .3)).toFixed(2)), spawnInterval: Number(Math.max(.5, 1.55 - .08 * steps).toFixed(2)) };
},
bossScale(number) {
  return { speed: 1 + Math.min(.04 * (number - 1), .28), cooldown: Math.max(.6, 1 - .06 * (number - 1)) };
}
```

让两种升级函数在已满级时返回原始经验/碎片与原始等级，且 `upgraded: false`。

- [x] **Step 4: 运行规则测试确认通过**

Run: `node --test tests/game-logic.test.mjs`

Expected: PASS，包含 V1 仍适用的碰撞、经验与刷怪规则测试。

### Task 2: 接入阶段敌人、BOSS 和有限碎片升级

**Files:**
- Modify: `tests/game-logic.test.mjs:43-108`
- Modify: `index.html:566-806,1117-1131`

**Interfaces:**
- Consumes: `GameRules.difficulty`, `GameRules.bossScale`, `GameRules.maxWeaponLevel` 和受限升级函数。
- Produces: 生成时缩放的普通敌人与 BOSS；不会掉落已满级武器碎片的 `chooseFragmentDrop(fragments, weaponLevels, roll)` 规则。

- [x] **Step 1: 添加碎片掉落与满级升级的失败测试**

```js
test('boss drops only a weapon fragment that can still upgrade', () => {
  assert.equal(rules.chooseFragmentDrop({ homing: 0, laser: 0 }, { homing: 3, laser: 1 }, .2), 'laser');
  assert.equal(rules.chooseFragmentDrop({ homing: 0, laser: 0 }, { homing: 1, laser: 3 }, .8), 'homing');
  assert.equal(rules.chooseFragmentDrop({ homing: 0, laser: 0 }, { homing: 3, laser: 3 }, .5), null);
  assert.deepEqual(plain(rules.applyAttackUpgrade(50, 5)), { xp: 50, level: 5, upgraded: false });
});
```

- [x] **Step 2: 运行规则测试，确认新掉落规则缺失而失败**

Run: `node --test tests/game-logic.test.mjs`

Expected: FAIL，`chooseFragmentDrop` 尚未定义。

- [x] **Step 3: 在规则与运行时接入最小实现**

实现：

```js
chooseFragmentDrop(fragments, weaponLevels, roll) {
  const available = ['homing', 'laser'].filter(type => weaponLevels[type] < this.maxWeaponLevel(type));
  return available.length === 2 ? available[Math.floor(roll * 2)] : available[0] || null;
}
```

- 在 `spawnEnemy()` 中取得 `const difficulty = GameRules.difficulty(game.bosses)`，令 `hp` 与 `maxHp` 乘 `difficulty.hp`，并保存 `speedScale: difficulty.speed`。
- 在 `updateEnemy()` 所有移速常量外乘 `enemy.speedScale`，包括老鹰进入/俯冲、无人机、蝙蝠与魔法师。
- 在 `spawnBoss()` 保存 `speedScale` 与 `cooldownScale`；在 `updateBoss()` 的移动速度和重置 `shootTimer` 时应用它们。
- 在 `update()` 使用 `GameRules.difficulty(game.bosses).spawnInterval` 重置普通怪刷新计时器，移除基于 `game.time` 的无限缩短。
- 在 `killEnemy()` 使用 `chooseFragmentDrop`；返回 `null` 时不加碎片、不打开升级窗，提示“装备已满级”。
- 在 `openUpgrade()` 与 `confirmUpgrade()` 前检查是否达到对应武器上限。
- 在 `updateHud()` 中使火球满级按钮显示 `攻击已满级` 并保持禁用。

- [x] **Step 4: 运行规则测试确认通过**

Run: `node --test tests/game-logic.test.mjs`

Expected: PASS，碎片倾斜掉落、两类满级无掉落及火球满级不扣经验均被覆盖。

### Task 3: 将激光改为 2 秒脉冲并降低导弹频率

**Files:**
- Modify: `tests/game-logic.test.mjs:43-70`
- Modify: `tests/browser-smoke.py:11-35,168-180`
- Modify: `index.html:472-492,800-846,1098-1111`

**Interfaces:**
- Consumes: `GameRules.specialDamage` 与已存在的 `game.specialTimer`。
- Produces: `GameRules.specialWeaponInterval(type)`，`game.laserTimer`，以及激光的蓄能/脉冲伤害行为。

- [x] **Step 1: 添加特殊武器节拍的失败规则测试**

```js
test('special weapon cadence prevents continuous laser damage', () => {
  assert.equal(rules.specialWeaponInterval('homing'), 1.5);
  assert.equal(rules.specialWeaponInterval('laser'), 2);
});
```

- [x] **Step 2: 运行规则测试，确认间隔接口缺失而失败**

Run: `node --test tests/game-logic.test.mjs`

Expected: FAIL，`specialWeaponInterval` 尚未定义。

- [x] **Step 3: 接入导弹与激光计时器**

- 在 `resetGame()` 添加 `laserTimer: 0`，在切换特殊武器和目标失效时重置为 `0`。
- `GameRules.specialWeaponInterval(type)` 对 `homing` 返回 `1.5`，对 `laser` 返回 `2`。
- 将 `update()` 中导弹重置值从 `1.05` 改为 `GameRules.specialWeaponInterval('homing')`。
- 在 `updateLaser(dt)` 中保留 `game.laserTarget` 与少量蓄能粒子；只有 `game.laserTimer >= 2` 时调用一次 `damageEnemy(target, GameRules.specialDamage('laser', level), '#7ff8ff')`，随后将计时器归零。
- 目标变更或不存在时将 `laserTimer` 归零，防止跨目标携带蓄能。

- [x] **Step 4: 增加只在浏览器测试启用的节拍探针与断言**

在 `page.add_init_script()` 中加入：

```js
window.__testMode = true;
window.__combatStats = { laserHits: [], homingShots: [] };
```

仅当 `window.__testMode` 为真时，游戏暴露：

```js
window.__gameTest = {
  equip(type, level) { game.weaponLevels[type] = level; game.activeWeapon = type; game.specialTimer = 0; game.laserTimer = 0; },
  addTarget() { game.enemies = [{ id: -1, type: 'drone', x: W / 2, y: 180, r: 25, hp: 100000, maxHp: 100000, dead: false, age: 0, phase: 'enter', shootTimer: 999, baseX: W / 2, targetY: 180, vx: 0, vy: 0, speedScale: 0 }]; }
};
```

在 `fireHoming()` 成功加入子弹时写入 `window.__combatStats?.homingShots.push(performance.now())`；在激光脉冲真正调用 `damageEnemy()` 前写入 `window.__combatStats?.laserHits.push(performance.now())`。浏览器测试先调用 `addTarget()` 与 `equip('laser', 3)`，等待 4.2 秒并断言两次激光时间差至少 1950ms；再调用 `equip('homing', 3)`，等待 3.2 秒并断言相邻导弹时间差至少 1450ms。测试钩子不得在普通页面创建全局对象。

- [x] **Step 5: 运行规则与浏览器测试确认通过**

Run: `node --test tests/game-logic.test.mjs`

Run: `python3 /Users/xbguan/.agents/skills/webapp-testing/scripts/with_server.py --server "python3 -m http.server 8765 --bind 127.0.0.1" --port 8765 -- python3 tests/browser-smoke.py`

Expected: 全部 PASS；浏览器无错误，缓存渐变数仍低于 180。

### Task 4: 发布 V2 与最终验证

**Files:**
- Modify: `index.html:287,1140`
- Create: `versions/airplane-battle-v2.html`
- Modify: `README.md:1-45`
- Modify: `docs/CHANGELOG.md:3-25`

**Interfaces:**
- Consumes: 已验证的 `index.html` V2。
- Produces: V2 当前入口、不可变 V1 快照、完全一致的 V2 快照和用户可见版本说明。

- [x] **Step 1: 先添加版本显示的失败浏览器断言**

在 `tests/browser-smoke.py` 的开始页断言后加入：

```python
assert page.get_by_text("AIRPLANE BATTLE · V2", exact=True).is_visible()
```

- [x] **Step 2: 运行浏览器测试确认 V1 标记导致失败**

Run: `python3 /Users/xbguan/.agents/skills/webapp-testing/scripts/with_server.py --server "python3 -m http.server 8765 --bind 127.0.0.1" --port 8765 -- python3 tests/browser-smoke.py`

Expected: FAIL，版本文本仍为 V1。

- [x] **Step 3: 更新版本文案、README 与变更记录**

- 把 `index.html` 中的版本文本改为 `AIRPLANE BATTLE · V2`。
- README 增加 V2 的难度说明：前期友好、后期阶段成长、三种武器等级上限及激光 2 秒脉冲。
- CHANGELOG 的 V2 小节记录有限武器成长、阶段敌人与 BOSS 成长、激光和导弹节拍调整。

- [x] **Step 4: 创建 V2 快照且保留 V1**

将 `index.html` 完整复制为 `versions/airplane-battle-v2.html`；不得修改 `versions/airplane-battle-v1.html`。

- [x] **Step 5: 完成最终验证**

Run: `node --test tests/game-logic.test.mjs`

Run: `node -e "const fs=require('fs');const source=fs.readFileSync('index.html','utf8');for(const match of source.matchAll(/<script(?: [^>]*)?>([\\s\\S]*?)<\\/script>/g))new Function(match[1]);if(source.includes('https://')||source.includes('http://'))throw Error('external runtime URL');console.log('syntax and offline checks ok')"`

Run: `cmp -s index.html versions/airplane-battle-v2.html`

Run: `cmp -s index.html versions/airplane-battle-v1.html`

Expected: exit code 1，确认 V1 快照未被 V2 覆盖。

Run: `python3 /Users/xbguan/.agents/skills/webapp-testing/scripts/with_server.py --server "python3 -m http.server 8765 --bind 127.0.0.1" --port 8765 -- python3 tests/browser-smoke.py`

Expected: 规则测试、语法/离线检查和浏览器冒烟测试通过；V2 快照与入口一致，V1 快照不同于 V2。
