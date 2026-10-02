# 飞机大战项目指引

## 项目事实

- `index.html` 是当前唯一的可玩源码与 GitHub Pages 入口。
- `versions/airplane-battle-v1.html` 是 V1 完整快照；明确要求同步 V1 时，必须与 `index.html` 内容完全一致。
- 游戏为原生 HTML/CSS/JavaScript，零第三方依赖；允许使用项目内 `assets/` 的原创本地 PNG 素材，不引入框架、构建工具、CDN 或在线资源。
- `tests/game-logic.test.mjs` 覆盖战斗规则，`tests/browser-smoke.py` 覆盖浏览器交互、性能和画面结构。
- 设计目标、计划和变更记录分别在 `docs/superpowers/specs/`、`docs/superpowers/plans/` 和 `docs/CHANGELOG.md`。

## 修改原则

- 只改需求直接涉及的文件与代码；不重构、不格式化、不改变无关玩法。
- 修改玩法、输入、渲染或 HUD 前，先添加能复现目标的测试并确认其失败；最小改动后再验证通过。
- 不改变既有战斗数值、升级、碎片、武器、缓存和性能上限，除非需求明确要求。
- 视觉工作以用户确认的“精致 2.5D 卡通像素素材主图”为唯一标准：圆润表情、粗深轮廓、多级高光与阴影、丰富景观图块；禁止将其降级为扁平方块或 emoji 替代。
- `assets/characters/`、`assets/weapons/`、`assets/shadows/` 与 `assets/scenery/` 分别放置角色、武器、投影和景观 PNG；角色/武器必须透明背景，投影独立跟随但不旋转，场景不得混入可动对象素材。渲染时预加载并缓存，主循环不得重复创建 `Image`、渐变、阴影或高频音频节点。

## 验证与交付

- 常规验证：`node --test tests/game-logic.test.mjs`。
- 浏览器验证：使用 `tests/browser-smoke.py` 和本地 HTTP 服务；确认画布持续动画、无控制台错误。
- 同步 V1 前，验证 `cmp -s index.html versions/airplane-battle-v1.html`。
- 修改完成后更新必要的变更记录；不要执行 Git 操作，交由用户自行管理。
