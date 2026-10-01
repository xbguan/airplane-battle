# Airplane Battle V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, playable, child-friendly 2.5D airplane shooter as one self-contained HTML file and publish a preserved V1 snapshot.

**Architecture:** `index.html` contains the DOM overlays, Canvas renderer, pure rules helpers, entity updates, collisions, progression, and effects. A dependency-free Node test reads and executes the pure `game-rules` script embedded in the HTML. After verification, the exact finished HTML is copied to the immutable V1 snapshot.

**Tech Stack:** HTML5, CSS, Canvas 2D, vanilla JavaScript, Node.js built-in test runner.

## Global Constraints

- Deliver a single playable `index.html` with no framework, build step, external asset, or network dependency.
- Target desktop browsers with a responsive 16:9 stage and mouse controls.
- Use original 2.5D cartoon art drawn with Canvas paths, gradients, shadows, and particles.
- Keep `index.html` as the GitHub Pages entry and preserve releases under `versions/`.
- Show version `V1` on the start screen and HUD.
- Do not add features outside the approved design specification.

---

### Task 1: Rules Contract and Failing Tests

**Files:**
- Create: `tests/game-logic.test.mjs`
- Create: `index.html`

**Interfaces:**
- Produces: global `GameRules` with `enemyStats`, `bossHealthRange`, `bulletDamage`, `specialDamage`, `canUpgrade`, and `applyFragmentUpgrade`.
- Consumes: approved numeric rules from `docs/superpowers/specs/2026-10-01-airplane-battle-design.md`.

- [ ] **Step 1: Create a minimal HTML shell containing an empty `game-rules` script**

```html
<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>飞机大战</title></head>
<body><script id="game-rules">globalThis.GameRules = {};</script></body>
</html>
```

- [ ] **Step 2: Write tests that extract and execute `game-rules`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = html.match(/<script id="game-rules">([\s\S]*?)<\/script>/)[1];
const context = {};
vm.createContext(context);
vm.runInContext(source, context);
const rules = context.GameRules;

test('enemy statistics match the specification', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(rules.enemyStats)), {
    eagle: { hp: 20, damage: 10 },
    drone: { hp: 30, damage: 30 },
    bat: { hp: 10, dps: 10 },
    wizard: { hp: 50, damage: 30 }
  });
});

test('boss health range rises by ten every five bosses', () => {
  assert.deepEqual([...rules.bossHealthRange(1)], [50, 100]);
  assert.deepEqual([...rules.bossHealthRange(6)], [60, 110]);
  assert.deepEqual([...rules.bossHealthRange(11)], [70, 120]);
});

test('basic bullet damage doubles per purchased level', () => {
  assert.equal(rules.bulletDamage(0), 2);
  assert.equal(rules.bulletDamage(3), 16);
});

test('special weapon damage scales by level', () => {
  assert.equal(rules.specialDamage('homing', 1), 200);
  assert.equal(rules.specialDamage('homing', 3), 600);
  assert.equal(rules.specialDamage('laser', 1), 150);
  assert.equal(rules.specialDamage('laser', 3), 450);
});

test('fragment upgrade spends five only when accepted', () => {
  assert.equal(rules.canUpgrade(5), true);
  assert.deepEqual(JSON.parse(JSON.stringify(rules.applyFragmentUpgrade(7, 2, false))), { fragments: 7, level: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(rules.applyFragmentUpgrade(7, 2, true))), { fragments: 2, level: 3 });
});
```

- [ ] **Step 3: Run the tests and verify the intended failure**

Run: `node --test tests/game-logic.test.mjs`

Expected: FAIL because the six rule functions and values do not exist.

### Task 2: Pure Rules and Static Game Shell

**Files:**
- Modify: `index.html`
- Test: `tests/game-logic.test.mjs`

**Interfaces:**
- Produces: the complete `GameRules` contract and DOM IDs `game-shell`, `game-canvas`, `start-screen`, `hud`, `upgrade-modal`, and `game-over`.
- Consumes: interfaces defined in Task 1.

- [ ] **Step 1: Implement the minimal pure rules**

```js
globalThis.GameRules = {
  enemyStats: {
    eagle: { hp: 20, damage: 10 },
    drone: { hp: 30, damage: 30 },
    bat: { hp: 10, dps: 10 },
    wizard: { hp: 50, damage: 30 }
  },
  bossHealthRange(number) {
    const step = Math.floor((number - 1) / 5) * 10;
    return [50 + step, 100 + step];
  },
  bulletDamage(level) { return 2 * (2 ** level); },
  specialDamage(type, level) { return (type === 'homing' ? 200 : 150) * level; },
  canUpgrade(fragments) { return fragments >= 5; },
  applyFragmentUpgrade(fragments, level, accepted) {
    return accepted && fragments >= 5
      ? { fragments: fragments - 5, level: level + 1 }
      : { fragments, level };
  }
};
```

- [ ] **Step 2: Run the rules tests**

Run: `node --test tests/game-logic.test.mjs`

Expected: 5 tests pass.

- [ ] **Step 3: Build the responsive static shell and overlays**

Add a 16:9 `#game-shell`, a full-size `#game-canvas`, child-friendly start/game-over panels, top HUD bars, bottom fragment counters, special weapon buttons, and a paused upgrade modal. Use CSS gradients, thick rounded borders, readable Chinese text, and responsive scaling without external fonts.

- [ ] **Step 4: Check HTML syntax and required IDs**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('index.html','utf8');for(const id of ['game-shell','game-canvas','start-screen','hud','upgrade-modal','game-over'])if(!s.includes('id=\"'+id+'\"'))throw Error(id);console.log('shell ok')"`

Expected: `shell ok`.

### Task 3: Playable Combat Loop

**Files:**
- Modify: `index.html`
- Test: `tests/game-logic.test.mjs`

**Interfaces:**
- Produces: `Game` state, `resetGame()`, `startGame()`, `update(dt)`, `render(ctx)`, entity arrays, collision helpers, and mouse input.
- Consumes: `GameRules` and DOM IDs from Task 2.

- [ ] **Step 1: Add game-state invariants to the test file**

Add source-level checks asserting that `index.html` contains `requestAnimationFrame`, `pointermove`, `spawnEnemy`, `damagePlayer`, `checkCollisions`, `resetGame`, and `startGame`.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/game-logic.test.mjs`

Expected: new source-contract test fails because the combat loop does not exist.

- [ ] **Step 3: Implement the game loop and player**

Create a fixed logical canvas of `1280x720`, scale it through CSS, translate pointer coordinates into logical coordinates, clamp the player to bounds, and stop target updates on pointer leave. Initialize player HP to 100. Auto-fire two closely spaced fireballs at a steady interval using `GameRules.bulletDamage(attackLevel)`.

- [ ] **Step 4: Implement the four enemy behaviors**

Implement eagle orbit/telegraph/dive/claw damage; drone homing, blink warning, contact explosion; bat homing and 10 DPS while attached; wizard lateral movement, trailing cloak animation, and destructible 30-damage magic fireballs.

- [ ] **Step 5: Implement collisions, feedback, and cleanup**

Use circular hit regions. Add brief invulnerability after instant contact damage, damage flashes, floating numbers, explosions, sparks, and camera shake. Remove dead and off-screen objects and cap particles at 240.

- [ ] **Step 6: Implement original 2.5D Canvas art**

Draw the compact blue player fighter, eagle, cyclops drone, cyclops bat, cloaked staff-riding wizard, projectiles, grass/sky background, clouds, and ground path with gradients, highlights, soft shadows, asymmetric poses, and animated motion details.

- [ ] **Step 7: Run tests**

Run: `node --test tests/game-logic.test.mjs`

Expected: all tests pass.

### Task 4: Bosses, Progression, and Special Weapons

**Files:**
- Modify: `index.html`
- Test: `tests/game-logic.test.mjs`

**Interfaces:**
- Produces: `spawnBoss()`, `awardKill()`, `offerFragmentUpgrade(type)`, `upgradeAttack()`, and `setSpecialWeapon(type)`.
- Consumes: combat loop and rule helpers from Tasks 2-3.

- [ ] **Step 1: Add source-contract tests for progression functions**

Require all five public function names and visible labels `追踪弹`, `激光`, `攻击升级`, and `BOSS` in `index.html`.

- [ ] **Step 2: Run tests and verify failure**

Run: `node --test tests/game-logic.test.mjs`

Expected: progression contract fails before implementation.

- [ ] **Step 3: Implement kill, experience, and attack upgrades**

Award 5 XP per normal enemy and boss initial HP per boss. Spawn a boss after every 10 normal kills. Enable the attack button at 50 XP; clicking spends 50 and increments `attackLevel`, permanently doubling basic bullet damage for the current run.

- [ ] **Step 4: Implement both boss variants**

Randomize brown or blue. Brown uses a wide heavy silhouette, fan bullet volleys, and telegraphed slow charges. Blue uses a narrow swept-wing silhouette, rapid horizontal movement, and crossing energy shots. Choose max HP from the inclusive range returned by `bossHealthRange(bossNumber)` and show a boss banner and bar.

- [ ] **Step 5: Implement fragments and modal behavior**

Drop one random homing or laser fragment per boss. At 5 fragments pause the simulation and show accept/defer buttons. Accept spends 5 and adds a level; defer preserves all fragments and leaves a clickable `5/5 可升级` HUD control.

- [ ] **Step 6: Implement special weapons and switching**

Keep basic fireballs active. Homing missiles automatically seek the nearest enemy or boss and deal `200 * level`. Laser continuously targets the nearest forward enemy and deals `150 * level * dt` damage. If both are unlocked, only the highlighted selection fires; clicking either unlocked icon switches freely.

- [ ] **Step 7: Run tests**

Run: `node --test tests/game-logic.test.mjs`

Expected: all tests pass.

### Task 5: Documentation, V1 Snapshot, and Browser Verification

**Files:**
- Create: `README.md`
- Create: `docs/CHANGELOG.md`
- Create: `versions/airplane-battle-v1.html`
- Modify: `index.html`
- Test: `tests/game-logic.test.mjs`

**Interfaces:**
- Produces: user documentation, V1 release record, and an immutable playable snapshot.
- Consumes: the completed and verified `index.html`.

- [ ] **Step 1: Add final source checks**

Assert that the HTML contains `V1`, has no `http://` or `https://` runtime dependencies, and contains accessible button text for start, upgrade, defer, switch, and restart.

- [ ] **Step 2: Run the full tests**

Run: `node --test tests/game-logic.test.mjs`

Expected: all tests pass.

- [ ] **Step 3: Write project documentation**

Document mouse controls, enemy rules, upgrades, local opening, the current `index.html`, archived versions, and future GitHub Pages publication in `README.md`. Record the V1 feature set in `docs/CHANGELOG.md`.

- [ ] **Step 4: Create the V1 snapshot**

Copy the verified bytes of `index.html` to `versions/airplane-battle-v1.html`, then compare their SHA-256 hashes.

Run: `shasum -a 256 index.html versions/airplane-battle-v1.html`

Expected: both hashes are identical.

- [ ] **Step 5: Run browser verification**

Open `index.html` through a local HTTP server. Verify start, pointer tracking, tightly spaced double fireballs, each enemy behavior, destructible wizard fireballs, boss spawning, XP upgrade, fragment accept/defer, both special weapons, switching, game over, restart, resize, and a clean browser console.

- [ ] **Step 6: Run final automated verification**

Run: `node --test tests/game-logic.test.mjs`

Expected: all tests pass with zero failures.

## Execution Note

The directory is not currently a Git repository, so commit steps are intentionally omitted. After repository initialization, add the project files and use the release snapshots and changelog as the version history foundation.
