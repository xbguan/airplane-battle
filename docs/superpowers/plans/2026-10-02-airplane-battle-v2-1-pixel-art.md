# 《飞机大战》V2.1 像素风与中前期节奏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将全角色与武器统一成圆润 2.5D 像素风，修复蓝色 BOSS 跳动，并把每次 BOSS 碎片掉落调整为两枚均衡掉落。

**Architecture:** 保持单一 `index.html`：`GameRules` 管理可离线验证的掉落规则与 BOSS 入场状态转换；既有 Canvas 精灵缓存改为低分辨率像素绘制后最近邻放大；主循环继续只绘制缓存精灵。规则测试验证纯规则，浏览器冒烟测试验证真实运行状态、连续入场与像素渲染约束。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Canvas 2D、Node 内置测试运行器、Playwright Python 冒烟测试。

## 全局约束

- 仅修改 `index.html`、`tests/game-logic.test.mjs`、`tests/browser-smoke.py`、`README.md`、`docs/CHANGELOG.md` 和新增 `versions/airplane-battle-v2-1.html`。
- 保持单 HTML、零外部依赖；不得添加图片、音频文件、框架、CDN 或构建步骤。
- 保持 V2 的武器上限、伤害、导弹 1.5 秒、激光 2 秒、敌人/BOSS 成长公式与 HUD 布局。
- 不覆盖 `versions/airplane-battle-v1.html` 或 `versions/airplane-battle-v2.html`。
- 缓存精灵与声效是性能边界：主循环不得新增渐变、阴影或高频音频节点分配。
- 本项目由用户管理 Git：不执行 Git 命令、不提交。

---

### Task 1: 两枚均衡碎片掉落规则

**Files:**
- Modify: `tests/game-logic.test.mjs:52-55,108-112`
- Modify: `index.html:327-337,380-385,788-797`

**Interfaces:**
- Consumes: `GameRules.maxWeaponLevel(type)`、现有 `game.fragments` 与 `game.weaponLevels`。
- Produces: `GameRules.chooseFragmentDrop(fragments, weaponLevels, roll)` 返回未满级且等级更低的武器类型或 `null`；`GameRules.awardBossKill(state, bossHp, fragmentType)` 为选中的类型增加 2 枚碎片。

- [x] **Step 1: 写出失败规则测试**

  将“boss drops only a weapon fragment”测试改为以下断言，并更新 BOSS 击杀奖励预期：

  ```js
  test('boss drops two fragments for the lower-level incomplete weapon', () => {
    assert.equal(rules.chooseFragmentDrop({ homing: 0, laser: 0 }, { homing: 3, laser: 1 }, .2), 'laser');
    assert.equal(rules.chooseFragmentDrop({ homing: 0, laser: 0 }, { homing: 1, laser: 3 }, .8), 'homing');
    assert.equal(rules.chooseFragmentDrop({ homing: 0, laser: 0 }, { homing: 1, laser: 1 }, .2), 'homing');
    assert.equal(rules.chooseFragmentDrop({ homing: 0, laser: 0 }, { homing: 1, laser: 1 }, .8), 'laser');
    assert.equal(rules.chooseFragmentDrop({ homing: 0, laser: 0 }, { homing: 3, laser: 3 }, .5), null);
  });

  assert.deepEqual(
    plain(rules.awardBossKill({ xp: 20, bosses: 2, fragments: { homing: 1, laser: 4 } }, 87, 'laser')),
    { xp: 107, bosses: 3, fragments: { homing: 1, laser: 6 } }
  );
  ```

- [x] **Step 2: 运行测试确认失败**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: FAIL，旧实现只给 1 枚碎片。

- [x] **Step 3: 最小实现掉落与奖励规则**

  保持 `chooseFragmentDrop` 的签名，按等级筛选：先保留未满级武器，再选最低等级；并把奖励常量固定为 `2`：

  ```js
  chooseFragmentDrop(fragments, weaponLevels, roll) {
    const available = ['homing', 'laser'].filter(type => weaponLevels[type] < this.maxWeaponLevel(type));
    if (!available.length) return null;
    const lowest = Math.min(...available.map(type => weaponLevels[type]));
    const candidates = available.filter(type => weaponLevels[type] === lowest);
    return candidates.length === 2 ? candidates[Math.floor(roll * 2)] : candidates[0];
  },
  awardBossKill(state, bossHp, fragmentType) {
    return {
      xp: state.xp + bossHp,
      bosses: state.bosses + 1,
      fragments: fragmentType ? { ...state.fragments, [fragmentType]: state.fragments[fragmentType] + 2 } : state.fragments
    };
  }
  ```

  在 `killEnemy` 的提示文字中将“获得 1 枚”改为“获得 2 枚”；升级条件、5 枚消耗与满级不掉落逻辑不改。

- [x] **Step 4: 运行规则测试确认通过**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: PASS，包含新的均衡掉落与两枚奖励断言。

### Task 2: 蓝色 BOSS 一次性入场状态

**Files:**
- Modify: `tests/game-logic.test.mjs`
- Modify: `index.html:304-337,604-614,688-727`

**Interfaces:**
- Consumes: `GameRules.advanceBossEntrance(boss, dt)` 和 BOSS 的 `entered`、`y`、`speedScale` 字段。
- Produces: `advanceBossEntrance` 返回更新后的 BOSS 状态；仅在首次进入目标高度前移动，完成后永久保留 `entered: true`。

- [x] **Step 1: 写出失败规则测试**

  在 `GameRules` 测试中加入不依赖 Canvas 的入场状态测试：

  ```js
  test('boss entrance finishes once and does not restart below the old threshold', () => {
    const entering = rules.advanceBossEntrance({ y: 110, entered: false, speedScale: 1 }, .1);
    assert.deepEqual(plain(entering), { y: 119, entered: true });
    const cruising = rules.advanceBossEntrance({ y: 98, entered: true, speedScale: 1 }, .1);
    assert.deepEqual(plain(cruising), { y: 98, entered: true });
  });
  ```

- [x] **Step 2: 运行测试确认失败**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: FAIL，`advanceBossEntrance` 尚未定义。

- [x] **Step 3: 实现状态转换并接入 BOSS 更新**

  在 `GameRules` 中添加：

  ```js
  advanceBossEntrance(boss, dt) {
    if (boss.entered) return { y: boss.y, entered: true };
    const y = Math.min(119, boss.y + 90 * boss.speedScale * dt);
    return { y, entered: y >= 119 };
  },
  ```

  创建 BOSS 时添加 `entered: false`。在 `updateBoss` 开头调用规则函数；若返回值仍未入场，则写回 `y` 并 `return`。已入场后才扣除攻击计时器并运行棕色冲撞或蓝色摆动。棕色 BOSS 冲撞离场重置时必须同时设回 `entered: false`，以保留原有回场行为。

- [x] **Step 4: 运行规则测试确认通过**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: PASS，蓝色 BOSS 的低位摆动不再触发入场分支。

### Task 3: 缓存精灵像素化并统一角色/武器表现

**Files:**
- Modify: `index.html:895-1160`
- Modify: `tests/browser-smoke.py:1-220`

**Interfaces:**
- Consumes: `makeSprite(width, height, painter)`、`drawCached(sprite, x, y, rotation, alpha, scale)`、既有 `sprites` 字典。
- Produces: 像素画布缓存的 `player`、`eagle`、`drone`、`bat`、`wizard`、`brownBoss`、`blueBoss`、`fireball`、`missile`；`window.__renderStats.pixelSprites` 记录这些缓存名称，供冒烟测试读取。

- [x] **Step 1: 写出失败浏览器测试**

  在 `page.add_init_script` 中初始化 `window.__renderStats = { gradients: 0, pixelSprites: [] }`；在开始游戏后的断言中加入：

  ```python
  pixel_sprites = page.evaluate("window.__renderStats.pixelSprites")
  assert set(pixel_sprites) >= {
      "player", "eagle", "drone", "bat", "wizard", "brownBoss", "blueBoss", "fireball", "missile"
  }, "All player, enemy, boss, and projectile sprites must use pixel caches"
  ```

  同时把开始页与版本文本预期改为 V2.1（例如 `AIRPLANE BATTLE · V2.1`、`空中玩具战场 · V2.1`）。

- [x] **Step 2: 运行浏览器测试确认失败**

  Run: `python3 -m http.server 8765`（单独终端保持运行），再运行 `python3 tests/browser-smoke.py`

  Expected: FAIL，当前没有 `pixelSprites` 计数，且版本仍为 V2。

- [x] **Step 3: 最小像素缓存实现**

  在 `makeSprite` 内关闭缓存画布插值并递增测试计数：

  ```js
  const spriteContext = sprite.getContext('2d');
  spriteContext.imageSmoothingEnabled = false;
  if (window.__testMode) window.__renderStats.pixelSprites.push(name);
  ```

  用整数矩形、有限色板和 1 像素块替换 `paintPlayer`、`paintEagle`、`paintDrone`、`paintBat`、`paintWizard`、`paintBoss`、`fireball`、`missile` 的渐变与软阴影绘制：

  ```js
  ctx.fillStyle = '#1d4268'; ctx.fillRect(-34, -8, 68, 42); // 深色侧面
  ctx.fillStyle = '#f5fbef'; ctx.fillRect(-30, -38, 60, 34); // 机身高光面
  ctx.fillStyle = '#6de9ff'; ctx.fillRect(-10, -30, 20, 18); // 座舱
  ctx.fillStyle = '#ffcf45'; ctx.fillRect(-55, 12, 12, 8); ctx.fillRect(43, 12, 12, 8); // 两翼炮口
  ```

  将 `makeSprite` 签名扩展为 `makeSprite(name, width, height, painter)`，并让 `buildSpriteCache` 在每次调用时传入对应的 `sprites` 键名。精灵生成与实际绘制时都设置 `imageSmoothingEnabled = false`；保留各对象原尺寸、旋转、缩放、动画参数、碰撞半径和缓存入口，不在 `drawScene` 新建精灵。将 `drawProjectiles` 中的基础弹、导弹与激光换为相同色板的块状形态；激光根据 `laserTimer / 2` 以分段方块显示蓄能。

- [x] **Step 4: 运行浏览器测试确认通过**

  Run: `python3 tests/browser-smoke.py`

  Expected: PASS，9 个指定的角色/武器缓存精灵均已生成，画布持续动画、无控制台错误，渐变计数仍低于既有性能上限。

### Task 4: V2.1 版本文案、快照与回归验证

**Files:**
- Modify: `index.html:263-267`
- Create: `versions/airplane-battle-v2-1.html`
- Modify: `README.md`
- Modify: `docs/CHANGELOG.md`

**Interfaces:**
- Consumes: 已通过的 V2.1 `index.html` 与现有 Pages 试玩链接。
- Produces: V2.1 页面标题/开始页文案、完全一致的 V2.1 快照、README 版本说明和变更记录。

- [x] **Step 1: 更新可见版本文案**

  将页面标题、开始页眉标和任何 V2 可见文案统一改为 V2.1；保留游戏名称、操作方式与现有 HUD 布局。

- [x] **Step 2: 生成 V2.1 快照与文档**

  将完成且已验证的 `index.html` 原样复制为 `versions/airplane-battle-v2-1.html`。在 README 的版本目录说明中增加 V2.1；在 CHANGELOG 新增 V2.1 条目，准确记录圆润像素精灵、双碎片均衡掉落和蓝色 BOSS 入场修复。

- [x] **Step 3: 运行完整验证**

  Run: `node --test tests/game-logic.test.mjs`

  Expected: PASS。

  Run: `node --check <(sed -n '/<script id="game-rules">/,/<\\/script>/p' index.html | sed '1d;$d')`

  Expected: PASS。

  Run: `python3 tests/browser-smoke.py`

  Expected: PASS，画布动画、像素缓存、激光/导弹节奏与控制台错误检查均通过。

  Run: `cmp -s index.html versions/airplane-battle-v2-1.html`

  Expected: exit code 0。

  Run: `cmp -s index.html versions/airplane-battle-v1.html`，再运行 `cmp -s index.html versions/airplane-battle-v2.html`

  Expected: 两次均为 exit code 1，确认旧快照未被覆盖。
