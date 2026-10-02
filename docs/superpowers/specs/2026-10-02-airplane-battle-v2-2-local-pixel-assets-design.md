# 《飞机大战》V2.2 本地精致像素素材设计

## 已确认的目标

- 以用户确认的“全部资产确认 · 精确像素素材版本”主图为唯一视觉质量标准。
- 全部角色、武器和场景改用独立的本地 PNG 素材；不再用 Canvas 大色块、emoji 或几何图形替代。
- 保持网页静态部署与 GitHub Pages 可玩性；不使用 CDN、网络图片、框架或构建工具。

## 素材目录

```text
assets/
  characters/
    player-fighter.png
    boss-orange-white.png
    boss-blue-white.png
    owl.png
    drone.png
    bat.png
    wizard.png
  weapons/
    player-bullet.png
    homing-missile.png
    laser-segment.png
    enemy-bullet.png
    magic-orb.png
    fragment-homing.png
    fragment-laser.png
    hit-spark.png
    explosion.png
  scenery/
    sky.png
    cloud-01.png
    cliff-mountain.png
    grassland.png
    river-lake.png
    waterfall.png
    pine-tree.png
    broadleaf-tree.png
    bush-flower.png
    rock.png
    background-perspective.png
    background-topdown.png
  shadows/
    player-shadow.png
    boss-shadow.png
    enemy-shadow.png
```

## 素材质量标准

- 角色：圆润卡通比例、大眼或有表情的座舱、粗深色轮廓、至少三层明暗与明确的地面投影。
- 飞机与 BOSS：蓝白玩家机、橙白星徽重装 BOSS、蓝白星徽高速 BOSS，均保留暖色引擎/炮口与金属高光。
- 敌人：猫头鹰、独眼无人机、独眼蝙蝠、紫袍魔法师，外观与确认图对应对象一致。
- 武器：橙白双列机枪弹、红白追踪导弹、蓝白蓄能激光、蓝色能量弹、紫粉魔法球、晶体碎片与爆炸特效。
- 景观：森林峡谷、悬崖岩壁、草地、河流、湖泊、瀑布、云、松树、阔叶树、灌木花草和岩石；具备确认图的细节密度与景深层次。
- 背景版本：保留斜视峡谷与近 90° 俯视河谷两张完整纯场景背景；两版均采用自然不对称的左右景观布局，中央保持清晰飞行走廊。默认启用俯视河谷，后续按用户指令切换。

## 渲染与性能

- 启动页预加载全部本地 PNG；未完成预加载前不允许进入战斗。
- Canvas 仅使用已加载图片对象绘制，保留对象现有的坐标、缩放、旋转、碰撞半径、攻击节奏和战斗数值。
- 角色与武器图片使用透明背景；每个可动角色使用独立透明投影图层，投影只跟随位置、不随角色旋转；景观按远近层进行滚动和缩放，绝不混入角色或武器。
- 背景不从合成主图任意切成小块：远景为可纵向循环的天空/云/远山宽幅图，中景为独立的山崖/河流/瀑布覆盖图，近景为可复用的透明树木、灌木、岩石与花草单体。循环背景始终以两张同宽长图首尾相接，避免可见接缝。
- 不在游戏主循环创建图片对象、渐变、阴影或高频音频节点。

## 验收

- 浏览器测试验证所有声明的图片完成加载，无请求外部网络资源、无控制台错误。
- 截图同状态对照确认：角色/武器不再是扁平方块；场景包含完整的云、山、草、水、树和岩石层。
- 保留 V2.1 的难度、碎片、武器节奏和蓝色 BOSS 入场修复。
