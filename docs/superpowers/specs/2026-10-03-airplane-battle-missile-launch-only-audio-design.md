# 《飞机大战》导弹仅发射音设计

## 目标

消除追踪导弹飞行期间的持续杂音，仅保留发射瞬间的短促点火声。

## 行为

- `fireHoming()` 成功生成导弹时继续调用既有缓存音效 `playSound('missile-launch')`。
- 删除每枚导弹对应的持续振荡器、增益节点与 `Map` 生命周期管理。
- 导弹伤害、1.5 秒发射间隔、追踪路径、尾焰与烟雾 PNG 视觉不变。

## 文件范围与验证

- 修改 `index.html`：删除持续推进音实现与调用，保留发射声定义、冷却和调用。
- 修改 `tests/game-logic.test.mjs`：从“发射与持续推进生命周期”改为“仅发射声且无持续节点”。
- 更新 `docs/CHANGELOG.md`；不修改素材、V1 或 Git。
- 先让测试因现有 `missileEngines`/`startMissileEngine()` 而失败；删除后运行 `node --test tests/game-logic.test.mjs` 和脚本解析检查。
