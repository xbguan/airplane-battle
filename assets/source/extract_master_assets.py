"""从已确认主图中逐对象提取透明角色 PNG。

主图是拼贴图，不是规则精灵表：绝不能按网格切图。每个 source/rect
只围住一个完整角色，GrabCut 仅保留该角色前景。
"""

from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(__file__).with_name("master-pixel-assets.png")
JOBS = {
    "characters/player-fighter.png": (300, 535, 260, 190, (15, 10, 230, 170)),
    "characters/boss-orange-white.png": (0, 0, 700, 315, (30, 5, 650, 300)),
    "characters/boss-blue-white.png": (755, 0, 420, 300, (45, 10, 340, 285)),
    "characters/owl.png": (1180, 0, 356, 285, (8, 8, 340, 265)),
    "characters/wizard.png": (780, 285, 275, 235, (8, 8, 255, 220)),
    "characters/drone.png": (1050, 280, 195, 230, (6, 8, 180, 215)),
    "characters/bat.png": (1240, 280, 296, 230, (6, 8, 285, 215)),
    "weapons/player-bullet.png": (785, 525, 80, 45, (5, 5, 70, 35)),
    "weapons/homing-missile.png": (1245, 475, 210, 125, (8, 8, 190, 110)),
    "weapons/laser-segment.png": (885, 580, 285, 100, (5, 8, 275, 82)),
    "weapons/enemy-bullet.png": (1110, 510, 85, 85, (8, 8, 68, 68)),
    "weapons/magic-orb.png": (785, 335, 62, 62, (8, 8, 46, 46)),
    "weapons/fragment-homing.png": (1175, 590, 95, 135, (8, 6, 78, 118)),
    "weapons/fragment-laser.png": (1258, 590, 95, 135, (8, 6, 78, 118)),
    "weapons/hit-spark.png": (795, 520, 45, 45, (4, 4, 36, 36)),
    "weapons/explosion.png": (1140, 490, 105, 100, (4, 6, 90, 86)),
    "scenery/cloud-01.png": (1350, 455, 186, 175, (4, 4, 178, 162)),
}
SHADOWS = {
    "shadows/player-shadow.png": (110, 28),
    "shadows/boss-shadow.png": (220, 48),
    "shadows/enemy-shadow.png": (82, 22),
}


def extract(image, crop, rect):
    x, y, width, height = crop
    subject = image[y : y + height, x : x + width].copy()
    mask = np.full(subject.shape[:2], cv2.GC_PR_BGD, np.uint8)
    bg_model = np.zeros((1, 65), np.float64)
    fg_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(subject, mask, rect, bg_model, fg_model, 10, cv2.GC_INIT_WITH_RECT)
    alpha = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8) * 255
    output = cv2.cvtColor(subject, cv2.COLOR_BGR2BGRA)
    output[:, :, 3] = alpha
    return output


def make_shadow(width, height):
    shadow = np.zeros((height, width, 4), np.uint8)
    center = (width // 2, height // 2)
    for scale, alpha in ((1.0, 46), (0.78, 70), (0.56, 92)):
        cv2.ellipse(
            shadow,
            center,
            (max(1, int(width * scale / 2)), max(1, int(height * scale / 2))),
            0,
            0,
            360,
            (20, 36, 47, alpha),
            -1,
            cv2.LINE_AA,
        )
    return shadow


def main():
    master = cv2.imread(str(SOURCE), cv2.IMREAD_COLOR)
    if master is None:
        raise FileNotFoundError(SOURCE)
    for relative_path, (*crop, rect) in JOBS.items():
        target = ROOT / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        if not cv2.imwrite(str(target), extract(master, crop, rect)):
            raise OSError(f"Could not write {target}")
    for relative_path, size in SHADOWS.items():
        target = ROOT / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        if not cv2.imwrite(str(target), make_shadow(*size)):
            raise OSError(f"Could not write {target}")


if __name__ == "__main__":
    main()
