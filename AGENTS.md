# 飞机大战项目指引

## 项目事实

- `index.html` 是当前唯一的可玩源码与 GitHub Pages 入口。
- `versions/airplane-battle-v1.html` 是 V1 完整快照；明确要求同步 V1 时，必须与 `index.html` 内容完全一致。
- 游戏为原生 HTML/CSS/JavaScript，零第三方依赖；允许使用项目内 `assets/` 的原创本地 PNG 素材，不引入框架、构建工具、CDN 或在线资源。
- `tests/game-logic.test.mjs` 覆盖战斗规则，`tests/browser-smoke.py` 覆盖浏览器交互、性能和画面结构。
- `docs/游戏规则基线.adoc` 是 V2 当前游戏规则的维护文档；修改玩法、数值、角色、阶段或难度时，必须同步更新对应测试和该文档。若文档与当前实现冲突，以 `index.html` 和现有测试为准。
- 设计目标、计划和变更记录分别在 `docs/superpowers/specs/`、`docs/superpowers/plans/` 和 `docs/CHANGELOG.md`。
- 项目知识库目录为 `/Users/xbguan/project/codex-knowledge-base/飞机大战游戏`；先读取 `sources/INDEX.md` 定位相关纪要与成果，再按需打开对应文件，禁止一次性扫描整个知识库。知识库只记录当前日期之前的历史信息，不包含当日对话与改动；当日事实以当前对话和仓库现状为准。

## 事实判定与历史文档

- `docs/superpowers/specs/` 与 `docs/superpowers/plans/` 是分阶段历史记录，可能被后续需求覆盖；当前行为以 `index.html`、现有测试和最新 `docs/CHANGELOG.md` 为准，禁止依据旧规格恢复已变更的数值或表现。
- `versions/` 下所有文件均为只读历史快照；除非用户明确要求同步某一版本，否则不得修改或覆盖。
- `全部资产清单.html` 是当前运行资产目录：新增或修改素材先登记为“待确认”，确认后才能生成、替换或接入；完成后转为实际预览条目，不保留已删除资产。

## 产品基线

- 面向小学生和现代桌面浏览器，保持 16:9 横屏、鼠标控制和自动射击；除非明确要求，不新增键盘、触屏或移动端玩法。

## 修改原则

- 只改需求直接涉及的文件与代码；不重构、不格式化、不改变无关玩法。
- 修改玩法、输入、渲染或 HUD 前，先添加能复现目标的测试并确认其失败；最小改动后再验证通过。
- 不改变既有战斗数值、升级、碎片、武器、缓存和性能上限，除非需求明确要求。
- 视觉工作以用户确认的“精致 2.5D 卡通像素素材主图”为唯一标准：圆润表情、粗深轮廓、多级高光与阴影、丰富景观图块；禁止将其降级为扁平方块或 emoji 替代。
- `assets/characters/`、`assets/weapons/`、`assets/shadows/` 与 `assets/scenery/` 分别放置角色、武器、投影和景观 PNG；角色/武器必须透明背景，投影独立跟随但不旋转，场景不得混入可动对象素材。渲染时预加载并缓存，主循环不得重复创建 `Image`、渐变、阴影或高频音频节点。
- 涉及素材修改、新增等工作，需要先写在“全部资产清单.html“，给我确认，我确认后，才可执行后续的工作。素材变化后，也要同步维护“全部资产清单.html“。

## 验证与交付

- 常规验证：`node --test tests/game-logic.test.mjs`。
- 浏览器验证：使用 `tests/browser-smoke.py` 和本地 HTTP 服务；确认画布持续动画、无控制台错误。
- 同步 V1 前，验证 `cmp -s index.html versions/airplane-battle-v1.html`。
- 修改完成后更新必要的变更记录；不要执行 Git 操作，交由用户自行管理。
