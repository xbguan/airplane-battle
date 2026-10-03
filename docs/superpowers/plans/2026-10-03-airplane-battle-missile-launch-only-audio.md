# 导弹仅发射音 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除追踪导弹飞行持续声，仅保留发射瞬间的缓存点火声。

**Architecture:** `playSound('missile-launch')` 继续复用既有 `AudioBuffer` 缓存路径。删除仅服务于飞行推进音的 `missileEngines` Map、两个辅助函数、发射调用、死亡清理与重开清理；导弹对象和视觉渲染不变。

**Tech Stack:** 原生 HTML/JavaScript、Web Audio API、Node.js `node:test`。

## Global Constraints

- 不改变导弹伤害、1.5 秒发射间隔、追踪路径、尾焰或烟雾 PNG 视觉。
- 保留一次 `missile-launch` 缓存点火声，不创建持续振荡器或增益节点。
- 不修改素材、V1 或 Git；仅改直接相关源码、测试和变更记录。

---

## File Map

- `tests/game-logic.test.mjs`：确认仅保留点火声且不存在飞行音节点代码。
- `index.html`：删除持续推进音的状态、函数和调用。
- `docs/CHANGELOG.md`：记录杂音修复。

### Task 1: 删除导弹持续推进声

**Files:**
- Modify: `tests/game-logic.test.mjs`
- Modify: `index.html:499-617,886-914`

**Interfaces:**
- Consumes: `fireHoming()` 中的 `playSound('missile-launch')`。
- Produces: 仅有一次性缓存点火声；源码不存在 `missileEngines`、`startMissileEngine` 或 `stopMissileEngine`。

- [x] **Step 1: 写入失败的仅发射声测试**

将现有导弹音频测试替换为：

```js
test('homing missiles play only the cached launch sound without a flight engine', () => {
  assert.match(html, /'missile-launch': \[120, 310, \.14, \.16, 'saw'\]/);
  assert.match(html, /playSound\('missile-launch'\);/);
  assert.doesNotMatch(html, /missileEngines/);
  assert.doesNotMatch(html, /startMissileEngine/);
  assert.doesNotMatch(html, /stopMissileEngine/);
});
```

- [x] **Step 2: 运行测试并确认失败**

Run: `node --test tests/game-logic.test.mjs`

Expected: FAIL，因为当前源码仍包含 `missileEngines` 与持续推进函数。

- [x] **Step 3: 删除持续节点状态与函数**

从 `soundBuffers` 附近删除：

```js
const missileEngines = new Map();
```

并删除完整的 `startMissileEngine(id)` 与 `stopMissileEngine(id)` 函数；`missile-launch` 的定义和 `playSound` 冷却保持不变。

- [x] **Step 4: 删除所有持续节点调用**

在 `resetGame()` 删除：

```js
for (const id of [...missileEngines.keys()]) stopMissileEngine(id);
```

在 `fireHoming()` 删除：

```js
startMissileEngine(bullet.id);
```

在 `updateBullets()` 删除：

```js
if (bullet.dead) stopMissileEngine(bullet.id);
```

保留 `playSound('missile-launch');`、`bullet` 对象、导弹死亡判断和过滤逻辑。

- [x] **Step 5: 运行完整规则测试与脚本解析**

Run: `node --test tests/game-logic.test.mjs` and `node --check <(sed -n '/<script>/,/<\/script>/p' index.html | sed '1d;$d')`

Expected: 所有测试通过，脚本解析成功。

### Task 2: 记录与最终验证

**Files:**
- Modify: `docs/CHANGELOG.md`

**Interfaces:**
- Consumes: Task 1 的仅发射音实现。
- Produces: 用户可追溯的修复记录。

- [x] **Step 1: 更新变更记录**

在 `docs/CHANGELOG.md` 顶部加入：

```markdown
## 导弹音效降噪 - 2026-10-03

- 取消追踪导弹飞行期间的持续推进声，仅保留发射瞬间的缓存点火声，消除杂音；导弹伤害、间隔和视觉不变。
```

- [x] **Step 2: 执行最终验证**

Run: `node --test tests/game-logic.test.mjs`

Expected: 全部测试通过。
