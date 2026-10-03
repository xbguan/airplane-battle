# 《飞机大战》运行资产清理与清单重整设计

## 目标

删除当前运行路径不再使用的历史 PNG，移除对应的预加载声明，并将 `全部资产清单.html` 收敛为当前游戏实际使用的资产目录。两个完整背景必须保留：`background-topdown.png` 与 `background-perspective.png`。

不修改战斗规则、HUD、背景循环、角色行为或图片内容；不删除 `assets/source/extract_master_assets.py`。

## 保留范围

- 所有仍由 `index.html` 实际渲染、投影、HUD 或背景循环使用的角色、武器、特效、独立投影、水面、云雾、7 项俯视景观和 3 项斜视景观。
- 两个完整背景：`assets/scenery/background-topdown.png`、`assets/scenery/background-perspective.png`。
- `assets/source/extract_master_assets.py`，即使其源图被删除也不在本轮移除。

## 已确认删除范围

删除以下 33 个 PNG，并从 `AssetManifest` 和《全部资产清单》中移除其条目：

| 分类 | 文件 |
|---|---|
| 素材源 | `assets/source/master-pixel-assets.png` |
| 旧地形区块 | `assets/scenery/topdown-segment-01.png` 至 `topdown-segment-06.png`；`assets/scenery/perspective-segment-01.png` 至 `perspective-segment-06.png` |
| 旧场景小图 | `assets/scenery/sky.png`、`cloud-01.png`、`cliff-mountain.png`、`grassland.png`、`river-lake.png`、`waterfall.png`、`pine-tree.png`、`broadleaf-tree.png`、`bush-flower.png`、`rock.png` |
| 旧投影 | `assets/shadows/player-shadow.png`、`boss-shadow.png`、`enemy-shadow.png` |
| 旧武器图 | `assets/weapons/player-bullet.png`、`magic-orb.png`、`fragment-homing.png`、`fragment-laser.png`、`hit-spark.png`、`explosion.png`、`player-muzzle-flash.png` |

## 清单结构

`全部资产清单.html` 改为只展示以下运行中分类：

1. 角色与 BOSS；
2. 武器、命中特效与 HUD 图标；
3. 当前独立投影；
4. 俯视背景层：循环水面、云雾和 7 项俯视岛屿/礁群；
5. 斜视背景层：循环水面和 3 项斜视峡谷；
6. 完整背景：保留的两张背景图。

不保留“历史素材”“待删除素材”或已删除路径的展示区，避免清单再与磁盘和运行清单脱节。

## 验收

- 上述 33 个 PNG 不存在，保留的提取脚本仍存在。
- `AssetManifest` 不含任何已删除资产路径，预加载过程没有资源加载失败。
- 《全部资产清单》不含任何已删除文件名；其余条目均对应实际存在的运行资产。
- 两个完整背景仍存在、仍在 `AssetManifest` 中，且可在资产清单中预览。
- `node --test tests/game-logic.test.mjs` 通过；浏览器验证确认无控制台资源加载错误。
