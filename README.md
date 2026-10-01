# 飞机大战

面向小学生的 2.5D 卡通网页射击游戏。不需要安装依赖，使用现代桌面浏览器打开 `index.html` 即可游玩。

## 操作

- 移动鼠标：控制战斗机。
- 双列火球会自动发射。
- 场上同时最多存在 10 只普通怪物，必须击杀 10 只才会进入 BOSS 战。
- 经验值达到 50 后，点击“攻击升级”消耗 50 经验，火球伤害翻倍。
- 每击杀 10 只普通怪物出现 1 只 BOSS。
- BOSS 会随机掉落追踪弹或激光碎片。同类碎片集齐 5 枚可解锁或升级武器。
- 两种特殊武器都解锁后，点击右下角图标切换。
- 游戏内置火球、命中、爆炸、受伤、升级和 BOSS 登场声效，不需要外部音频文件。
- 地面树木、草丛和湖泊会随飞行向下视差移动，增强速度与立体感。

## 本地运行

可直接双击 `index.html`，也可在项目目录启动本地服务：

```bash
python3 -m http.server 8000
```

然后访问 `http://localhost:8000/`。

## 版本结构

- `index.html`：当前最新可玩版本，也是 GitHub Pages 默认入口。
- `versions/airplane-battle-v1.html`：V1 完整单文件快照。
- `docs/CHANGELOG.md`：版本变更记录。
- `docs/superpowers/specs/`：设计规格。
- `docs/superpowers/plans/`：实施计划。
- `tests/`：规则测试与浏览器冒烟测试。

## GitHub Pages

创建 GitHub 仓库并推送项目后，在仓库的 **Settings → Pages** 中选择从主分支根目录发布。GitHub Pages 会直接加载根目录的 `index.html`。

## 验证

```bash
node --test tests/game-logic.test.mjs
```

浏览器冒烟测试需要 Python Playwright，通过本地 HTTP 服务执行 `tests/browser-smoke.py`。

冒烟测试同时检查长时间高频声效创建、Canvas 渐变分配、HUD 区域鼠标跟随和飞机边界。
# airplane-battle
