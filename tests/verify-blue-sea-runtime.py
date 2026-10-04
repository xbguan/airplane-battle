from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageStat
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
SCENERY_DIR = ROOT / "assets/scenery"

EXPECTED = {
    "background-perspective.png": ((1672, 941), "RGB"),
    "water-topdown-loop.png": ((1254, 1254), "RGB"),
    "topdown-island-01.png": ((640, 426), "RGBA"),
    "topdown-island-02.png": ((640, 426), "RGBA"),
    "topdown-island-03.png": ((640, 426), "RGBA"),
    "topdown-reef-01.png": ((640, 426), "RGBA"),
    "topdown-reef-02.png": ((640, 426), "RGBA"),
    "topdown-islet-01.png": ((640, 426), "RGBA"),
    "topdown-islet-02.png": ((640, 426), "RGBA"),
    "perspective-water-contact.png": ((1983, 793), "RGBA"),
    "perspective-island-chain.png": ((1774, 887), "RGBA"),
    "perspective-lighthouse-reef.png": ((1536, 1024), "RGBA"),
    "perspective-sailboat.png": ((1402, 1122), "RGBA"),
    "perspective-buoy.png": ((1024, 1536), "RGBA"),
    "perspective-reef.png": ((1536, 1024), "RGBA"),
    "perspective-sea-stack.png": ((1024, 1536), "RGBA"),
    "perspective-cliff-waterfall.png": ((1774, 887), "RGBA"),
}

BASELINE_SHA256 = {
    "background-perspective.png": "e9fe558adb5e3b6ace00687a1aaefa429d5e53ac1649bf82287ab597a9cdc977",
    "water-topdown-loop.png": "d184bef27f7ac826207139b9f9d61c6714371db3867f47e53046c82c6375244f",
    "topdown-island-01.png": "6dee2c9afe9f46ab663ea4254ee4b954968b70f4ccfa369ec7331c1b54b00b74",
    "topdown-island-02.png": "6be3b099df1b99bc66318038b596b2822f37584e7f6800530882b2357220b1f5",
    "topdown-island-03.png": "93dbdf67fdc280363a2107f1dcb7ef1dd8c11469d465d860847a3e55fe601e4a",
    "topdown-reef-01.png": "c4d11d0c1ff4af1161198d115324bb85a82043fdb87930f6dcf46d109e307c6e",
    "topdown-reef-02.png": "d7d43f7a69e5403535381c462e05675bae2809e0ac63d075400b72af41a771db",
    "topdown-islet-01.png": "03dac25a7ff6fa50a9f9f140ae1f44a1fe2572f5da15a423550fbe94d1373b56",
    "topdown-islet-02.png": "098102e13d42a67cbe1ec30ddc933c2854df6a983e6b70394ce2b7b0bbf493ea",
    "perspective-water-contact.png": "ba53e743aa74b3d5a98cac4b3e7ac2f66120494e6f31ca47b73355b9d2508cc4",
    "perspective-island-chain.png": "9e9ff5b994393d39a2ee05678084f693394fe10bd641f026e3b1a40dfa2ca2f1",
    "perspective-lighthouse-reef.png": "5d8a558bffa3ba689f42d373697b7417ee2b5c310e7f9f3124cb90258a24b85f",
    "perspective-sailboat.png": "dc30255fd4b401ff0d9c26f8fc407e4df5457b418487688c7705e2b436eeaf82",
    "perspective-buoy.png": "a0625e8bd9a4bc76936f4af5e8767450f435f18db292e6e82ccc051936671c8d",
    "perspective-reef.png": "62971a14c5613b8be945c443a77a9952fa0f2e136783da673d9340d9cd5a3f56",
    "perspective-sea-stack.png": "6efa2743d03404fcaa2679584a099de86b437518834d991cf1173555d7c01ec0",
    "perspective-cliff-waterfall.png": "7c752ee9412cbd956cbd39ad181ca769a3e6d171196909917682429758b848d2",
}

TOPDOWN = [
    ("topdownIslet02", -780),
    ("topdownIslet01", -570),
    ("topdownReef02", -360),
    ("topdownReef01", -150),
    ("topdownIsland01", 55),
    ("topdownIsland02", 300),
    ("topdownIsland03", 555),
]
PERSPECTIVE = [
    ("perspectiveIslandChain", -120),
    ("perspectiveLighthouseReef", 60),
    ("perspectiveSailboat", 240),
    ("perspectiveBuoy", 420),
    ("perspectiveReef", 600),
    ("perspectiveSeaStack", 780),
    ("perspectiveCliffWaterfall", 960),
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_pngs(expect_replaced: bool) -> None:
    unchanged = []
    for name, (size, mode) in EXPECTED.items():
        path = SCENERY_DIR / name
        with Image.open(path) as image:
            assert image.format == "PNG", f"{name}: expected PNG, got {image.format}"
            assert image.size == size, f"{name}: expected {size}, got {image.size}"
            assert image.mode == mode, f"{name}: expected {mode}, got {image.mode}"
            if mode == "RGBA":
                alpha_min, alpha_max = image.getchannel("A").getextrema()
                assert alpha_min == 0 and alpha_max > 0, (
                    f"{name}: transparent scenery must contain transparent and visible pixels"
                )
        if sha256(path) == BASELINE_SHA256[name]:
            unchanged.append(name)
    if expect_replaced:
        assert not unchanged, f"Assets still match the old baseline: {unchanged}"

    with Image.open(SCENERY_DIR / "water-topdown-loop.png") as image:
        image = image.convert("RGB")
        top = image.crop((0, 0, image.width, 8))
        bottom = image.crop((0, image.height - 8, image.width, image.height))
        edge_delta = sum(ImageStat.Stat(ImageChops.difference(top, bottom)).mean) / 3
        assert edge_delta <= 12, f"Top-down water edge delta too high: {edge_delta:.2f}"


def target_time(anchor_y: int, visible_y: int, sequence_length: int) -> float:
    return ((visible_y - anchor_y) % sequence_length) / 12


def save_contact_sheet(shots: list[tuple[str, Path]], output: Path) -> None:
    panel_size = (480, 270)
    columns = 2
    rows = (len(shots) + columns - 1) // columns
    sheet = Image.new("RGB", (panel_size[0] * columns, panel_size[1] * rows), "white")
    draw = ImageDraw.Draw(sheet)
    for index, (key, path) in enumerate(shots):
        x = index % columns * panel_size[0]
        y = index // columns * panel_size[1]
        image = Image.open(path).convert("RGB").resize(panel_size)
        sheet.paste(image, (x, y))
        draw.rectangle((x, y, x + 300, y + 24), fill=(0, 0, 0))
        draw.text((x + 8, y + 6), key, fill=(255, 255, 255))
    sheet.save(output)


def verify_browser(url: str, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    errors = []
    external_requests = []
    shots = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})

        def expose_render_hook(route):
            response = route.fetch()
            source = response.body().decode("utf-8")
            hook = """
  window.__blueSeaTest = {
    renderAt(theme, time) {
      game.running = false;
      freezeDrawScene = true;
      activeSceneBackground = theme;
      game.time = time;
      window.__renderStats.sceneryDraws = [];
      ctx.clearRect(0, 0, W, H);
      drawBackground();
      return [...window.__renderStats.sceneryDraws];
    },
    renderTopdownWaterAt(time) {
      game.running = false;
      freezeDrawScene = true;
      activeSceneBackground = 'backgroundTopdown';
      game.time = time;
      const entries = TopdownScenerySequence.entries.splice(0);
      const clouds = ['cloudMist01', 'cloudMist02', 'cloudMist03'].map(key => assets[key]);
      ['cloudMist01', 'cloudMist02', 'cloudMist03'].forEach(key => { assets[key] = null; });
      ctx.clearRect(0, 0, W, H);
      drawBackground();
      entries.forEach(entry => TopdownScenerySequence.entries.push(entry));
      ['cloudMist01', 'cloudMist02', 'cloudMist03'].forEach((key, index) => { assets[key] = clouds[index]; });
    }
  };
  const liveDrawScene = drawScene;
  let freezeDrawScene = false;
  drawScene = function() {
    if (!freezeDrawScene) liveDrawScene();
  };
"""
            needle = "  buildSpriteCache();resetGame();preloadAssets();requestAnimationFrame(loop);\n})();"
            assert needle in source, "Unable to install blue-sea render hook"
            source = source.replace(
                needle,
                "  buildSpriteCache();resetGame();preloadAssets();requestAnimationFrame(loop);\n"
                + hook
                + "})();",
            )
            route.fulfill(response=response, body=source.encode("utf-8"))

        context.route("**/index.html", expose_render_hook)
        page = context.new_page()
        page.add_init_script(
            """
            window.__testMode = true;
            window.__renderStats = {
              gradients: 0, pixelSprites: [], assetDraws: [], sceneryDraws: [],
              projectileDraws: [], impactDraws: [], shadowDraws: [], backgroundDraws: []
            };
            window.__assetStats = { expected: [], loaded: [], failed: [], external: [] };
            """
        )
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "console",
            lambda message: errors.append(message.text) if message.type == "error" else None,
        )
        page.on(
            "request",
            lambda request: external_requests.append(request.url)
            if request.url.startswith(("http://", "https://"))
            and not request.url.startswith(("http://127.0.0.1", "http://localhost"))
            else None,
        )
        page.goto(url)
        page.wait_for_load_state("networkidle")
        assets = page.evaluate("window.__assetStats")
        assert set(assets["expected"]) == set(assets["loaded"]), assets
        assert assets["failed"] == [], assets
        assert external_requests == [], external_requests

        page.locator('[data-scene-theme="backgroundTopdown"]').click()
        page.locator("#start-button").click()
        canvas = page.locator("#game-canvas")
        page.wait_for_timeout(100)
        before = canvas.screenshot()
        page.wait_for_timeout(500)
        after = canvas.screenshot(path=str(output_dir / "animated-topdown.png"))
        assert before != after, "Canvas did not animate after asset loading"
        page.add_style_tag(
            content="#hud, #fragments, #weapons, #upgrade-attack, .version { display: none !important; }"
        )

        for theme, entries, visible_y, length in [
            ("backgroundTopdown", TOPDOWN, 300, 1815),
            ("backgroundPerspective", PERSPECTIVE, 350, 1260),
        ]:
            for key, anchor_y in entries:
                draws = page.evaluate(
                    "([theme, time]) => window.__blueSeaTest.renderAt(theme, time)",
                    [theme, target_time(anchor_y, visible_y, length)],
                )
                assert key in draws, f"{key} was not drawn: {draws}"
                if theme == "backgroundPerspective":
                    key_index = draws.index(key)
                    assert key_index > 0 and draws[key_index - 1] == "perspectiveWaterContact", draws
                shot = output_dir / f"{key}.png"
                canvas.screenshot(path=str(shot))
                shots.append((key, shot))

        seam_shots = []
        for label, time in [("before", 59.99), ("after", 60.01)]:
            page.evaluate("time => window.__blueSeaTest.renderTopdownWaterAt(time)", time)
            shot = output_dir / f"topdown-water-wrap-{label}.png"
            canvas.screenshot(path=str(shot))
            seam_shots.append(Image.open(shot).convert("RGB"))
        wrap_delta = sum(ImageStat.Stat(ImageChops.difference(*seam_shots)).mean) / 3
        assert wrap_delta <= 12, f"Top-down browser wrap delta too high: {wrap_delta:.2f}"

        assert not errors, f"Browser errors: {errors}"
        browser.close()

    save_contact_sheet(shots[:7], output_dir / "topdown-7-contact-sheet.png")
    save_contact_sheet(shots[7:], output_dir / "perspective-7-contact-sheet.png")
    print(f"17 PNG checks ok; 14 composite screenshots ok; wrap delta={wrap_delta:.2f}")
    print(f"evidence: {output_dir}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8765/index.html")
    parser.add_argument("--output", type=Path, default=Path("/tmp/blue-sea-runtime-check"))
    parser.add_argument("--expect-replaced", action="store_true")
    args = parser.parse_args()
    verify_pngs(args.expect_replaced)
    verify_browser(args.url, args.output)


if __name__ == "__main__":
    main()
