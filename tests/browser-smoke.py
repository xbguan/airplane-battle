from pathlib import Path
import sys
from playwright.sync_api import sync_playwright


def main():
    perspective_only = "--perspective-only" in sys.argv
    modal_only = "--modal-only" in sys.argv
    errors = []
    external_requests = []
    preview_responses = []
    screenshot = Path(
        "/tmp/airplane-modal-ui.png"
        if modal_only
        else "/tmp/airplane-clear-clouds.png"
        if perspective_only
        else "/tmp/airplane-battle-v1.png"
    )

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.add_init_script(
            """
            window.__audioStats = { starts: 0, fireOscillators: 0, bufferStarts: 0 };
            window.__testMode = true;
            window.__combatStats = { laserHits: [], homingShots: [] };
            window.__renderStats = {
              gradients: 0, pixelSprites: [], assetDraws: [], sceneryDraws: [],
              projectileDraws: [], impactDraws: [], shadowDraws: [], backgroundDraws: []
            };
            window.__assetStats = { expected: [], loaded: [], failed: [], external: [] };
            const originalLinearGradient = CanvasRenderingContext2D.prototype.createLinearGradient;
            const originalRadialGradient = CanvasRenderingContext2D.prototype.createRadialGradient;
            CanvasRenderingContext2D.prototype.createLinearGradient = function(...args) {
              window.__renderStats.gradients += 1;
              return originalLinearGradient.apply(this, args);
            };
            CanvasRenderingContext2D.prototype.createRadialGradient = function(...args) {
              window.__renderStats.gradients += 1;
              return originalRadialGradient.apply(this, args);
            };
            class TestAudioParam {
              constructor() { this.value = 0; }
              setValueAtTime(value) { this.value = value; }
              exponentialRampToValueAtTime() {}
              linearRampToValueAtTime() {}
            }
            class TestAudioNode {
              constructor() { this.frequency = new TestAudioParam(); this.gain = new TestAudioParam(); this.type = ''; }
              connect() { return this; }
              disconnect() {}
              start() {
                window.__audioStats.starts += 1;
                if (this.frequency.value === 650) window.__audioStats.fireOscillators += 1;
              }
              stop() { if (this.onended) this.onended(); }
            }
            class TestBufferSource extends TestAudioNode {
              start() { window.__audioStats.starts += 1; window.__audioStats.bufferStarts += 1; }
            }
            class TestAudioContext {
              constructor() { this.currentTime = 0; this.destination = new TestAudioNode(); this.state = 'running'; }
              createOscillator() { return new TestAudioNode(); }
              createGain() { return new TestAudioNode(); }
              createBuffer(channels, length) {
                const data = new Float32Array(length);
                return { getChannelData() { return data; } };
              }
              createBufferSource() { return new TestBufferSource(); }
              resume() { return Promise.resolve(); }
            }
            window.AudioContext = TestAudioContext;
            window.webkitAudioContext = TestAudioContext;
            """
        )
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "console",
            lambda message: errors.append(message.text)
            if message.type == "error"
            else None,
        )
        page.on(
            "request",
            lambda request: external_requests.append(request.url)
            if request.url.startswith(("http://", "https://"))
            and not request.url.startswith(("http://127.0.0.1", "http://localhost"))
            else None,
        )
        page.on(
            "response",
            lambda response: preview_responses.append(response.url)
            if "scene-preview-" in response.url and response.ok
            else None,
        )
        page.goto("http://127.0.0.1:8765/index.html")
        page.wait_for_load_state("networkidle")

        assets = page.evaluate("window.__assetStats")
        assert set(assets["expected"]) == set(assets["loaded"]), f"Unloaded assets: {assets}"
        assert assets["failed"] == []
        assert assets["external"] == []
        assert external_requests == []
        assert {"assets/scenery/background-perspective.png", "assets/scenery/background-topdown.png"} <= set(assets["loaded"])
        assert {
            "assets/scenery/perspective-sky-storm.png",
            "assets/scenery/perspective-cloud-bank-far.png",
            "assets/scenery/perspective-cloud-bank-near.png",
        }.isdisjoint(assets["expected"]), f"Removed storm assets must not load: {assets}"
        if modal_only:
            def assert_inside(selector):
                shell = page.locator("#game-shell").bounding_box()
                panel = page.locator(selector).bounding_box()
                assert shell and panel
                assert panel["x"] >= shell["x"]
                assert panel["y"] >= shell["y"]
                assert panel["x"] + panel["width"] <= shell["x"] + shell["width"]
                assert panel["y"] + panel["height"] <= shell["y"] + shell["height"]

            for width, height in ((1280, 720), (1440, 900)):
                page.set_viewport_size({"width": width, "height": height})
                page.reload()
                page.wait_for_load_state("networkidle")
                assert page.get_by_role("button", name="海岛俯瞰 俯视").is_visible()
                assert page.get_by_role("button", name="海天远航 斜视").is_visible()
                topdown_preview = page.get_by_role("button", name="海岛俯瞰 俯视").evaluate(
                    "node => getComputedStyle(node, '::before').backgroundImage"
                )
                perspective_preview = page.get_by_role("button", name="海天远航 斜视").evaluate(
                    "node => getComputedStyle(node, '::before').backgroundImage"
                )
                assert "scene-preview-topdown.png" in topdown_preview
                assert "scene-preview-perspective.png" in perspective_preview
                assert any(url.endswith("/assets/scenery/scene-preview-topdown.png") for url in preview_responses)
                assert any(url.endswith("/assets/scenery/scene-preview-perspective.png") for url in preview_responses)
                page.get_by_role("button", name="海天远航 斜视").click()
                assert "selected" in page.get_by_role("button", name="海天远航 斜视").get_attribute("class")
                assert "selected" not in page.get_by_role("button", name="海岛俯瞰 俯视").get_attribute("class")
                selected_border = page.get_by_role("button", name="海天远航 斜视").evaluate(
                    "node => getComputedStyle(node).borderColor"
                )
                idle_border = page.get_by_role("button", name="海岛俯瞰 俯视").evaluate(
                    "node => getComputedStyle(node).borderColor"
                )
                assert selected_border != idle_border, "Selected scene needs a distinct gold border"
                page.keyboard.press("Tab")
                page.keyboard.press("Shift+Tab")
                assert page.get_by_role("button", name="海天远航 斜视").evaluate(
                    "node => node.matches(':focus-visible')"
                )
                assert float(page.get_by_role("button", name="海天远航 斜视").evaluate(
                    "node => parseFloat(getComputedStyle(node).outlineWidth)"
                )) >= 4, "Keyboard focus needs a clear outline"
                if width == 1440:
                    page.locator("#start-screen .panel").screenshot(path="/tmp/airplane-modal-focus.png")
                page.evaluate("document.activeElement.blur()")
                assert_inside("#start-screen .panel")
                lead_lines = page.locator("#start-screen .lead").evaluate(
                    "node => Math.round(node.scrollHeight / parseFloat(getComputedStyle(node).lineHeight))"
                )
                assert lead_lines == 2, f"Start instructions should use two lines, got {lead_lines}"
                assert page.locator("#start-screen .panel").evaluate(
                    "node => getComputedStyle(node).clipPath !== 'none'"
                )
                assert float(page.locator("#upgrade-modal .panel").evaluate(
                    "node => parseFloat(getComputedStyle(node).borderRadius)"
                )) >= 20, "Upgrade modal must retain its rounded panel style"
                if width == 1440:
                    page.locator("#start-screen .panel").screenshot(path="/tmp/airplane-modal-start.png")

                page.locator("#start-button").click()
                assert page.locator("#start-screen").is_hidden()
                page.evaluate("window.__gameTest.finish(12, 2, 3)")
                assert page.locator("#game-over").is_visible()
                assert_inside("#game-over .panel")
                result_items = page.locator("#result-copy .result-stat")
                assert result_items.count() == 3
                assert result_items.nth(0).inner_text() == "怪物\n12"
                assert result_items.nth(1).inner_text() == "BOSS\n2"
                assert result_items.nth(2).inner_text() == "火球伤害\n8"
                if width == 1440:
                    page.locator("#game-over .panel").screenshot(path=str(screenshot))
                page.locator("#restart-button").click()
                assert page.locator("#game-over").is_hidden()
                assert page.locator("#hud").is_visible()

            assert not errors, f"Browser errors: {errors}"
            browser.close()
            print(f"modal browser smoke ok: {screenshot}")
            return
        if perspective_only:
            assert {
                "assets/scenery/perspective-clear-cloud-far.png",
                "assets/scenery/perspective-clear-cloud-near.png",
            } <= set(assets["loaded"])
            page.locator('[data-scene-theme="backgroundPerspective"]').click()
            page.evaluate("window.__renderStats.sceneryDraws = []")
            page.locator("#start-button").click()
            page.wait_for_timeout(500)
            canvas = page.locator("#game-canvas")
            before = canvas.screenshot()
            page.wait_for_timeout(1000)
            after = canvas.screenshot(path=str(screenshot))
            assert before != after, "Perspective canvas should animate after the game starts"
            page.wait_for_timeout(8500)
            canvas.screenshot(path="/tmp/airplane-perspective-water-contact-far.png")
            perspective_draws = page.evaluate("window.__renderStats.sceneryDraws")
            assert "backgroundPerspective" in perspective_draws
            assert "perspectiveClearCloudFar" in perspective_draws
            assert "perspectiveClearCloudNear" in perspective_draws
            assert "perspectiveWaterContact" in perspective_draws
            assert "waterTopdownLoop" not in perspective_draws
            assert not errors, f"Browser errors: {errors}"
            browser.close()
            print(f"perspective browser smoke ok: {screenshot}")
            return
        required = {
            "assets/weapons/player-muzzle-flash.png",
            "assets/weapons/wizard-magic-orb.png",
            "assets/weapons/boss-orange-shell.png",
            "assets/weapons/boss-blue-bolt.png",
            "assets/shadows/player-wing-shadow.png",
            "assets/shadows/boss-blue-thruster-shadow.png",
            "assets/scenery/water-topdown-loop.png",
            "assets/scenery/topdown-segment-01.png",
            "assets/scenery/topdown-segment-06.png",
            "assets/scenery/topdown-reef-01.png",
            "assets/scenery/topdown-reef-02.png",
            "assets/scenery/topdown-islet-01.png",
            "assets/scenery/topdown-islet-02.png",
        }
        assert required <= set(assets["loaded"])
        assert page.get_by_text("AIRPLANE BATTLE · V2.1", exact=True).is_visible()
        assert page.get_by_role("button", name="🚀 开始出击").is_visible()
        assert page.get_by_text("空中玩具战场 · V2.1").is_visible()
        page.get_by_role("button", name="🚀 开始出击").click()
        page.wait_for_timeout(300)

        assert page.locator("#hud").is_visible()
        asset_draws = page.evaluate("window.__renderStats.assetDraws")
        assert {"player", "drone"} <= set(asset_draws), "Visible player and enemy must use local PNG assets"
        scenery_draws = page.evaluate("window.__renderStats.sceneryDraws")
        assert {
            "waterTopdownLoop", "topdownIsland01", "topdownIsland02", "topdownIsland03",
            "topdownReef01", "topdownReef02", "topdownIslet01", "topdownIslet02",
        } <= set(scenery_draws), "Top-down background must draw the complete seven-item scenery sequence"
        assert page.get_by_text("战机耐久", exact=True).is_visible()
        assert page.get_by_text("作战经验", exact=True).is_visible()
        assert page.get_by_text("本轮进度", exact=True).is_visible()
        assert page.locator("#hp-text").inner_text() == "100"
        assert page.locator("#kill-text").inner_text() == "0/10"
        assert page.locator("#upgrade-attack").is_disabled()
        assert "0/5" in page.locator("#homing-fragment").inner_text()
        assert page.locator("#base-weapon").is_visible()
        upgrade_box = page.locator("#upgrade-attack").bounding_box()
        weapons_box = page.locator("#weapons").bounding_box()
        fragments_box = page.locator("#fragments").bounding_box()
        version_box = page.locator(".version").bounding_box()
        shell_box = page.locator("#game-shell").bounding_box()
        assert page.locator("#hud .hud-chip").count() == 3
        assert "237, 123, 53" in page.locator("#upgrade-attack").evaluate(
            "node => getComputedStyle(node).backgroundImage"
        )
        assert weapons_box["x"] > shell_box["x"] + shell_box["width"] * 0.7
        assert upgrade_box["y"] > shell_box["y"] + shell_box["height"] * 0.75
        assert upgrade_box["x"] > fragments_box["x"] + fragments_box["width"]
        assert upgrade_box["x"] + upgrade_box["width"] < weapons_box["x"]
        overlaps = not (
            version_box["x"] + version_box["width"] <= weapons_box["x"]
            or weapons_box["x"] + weapons_box["width"] <= version_box["x"]
            or version_box["y"] + version_box["height"] <= weapons_box["y"]
            or weapons_box["y"] + weapons_box["height"] <= version_box["y"]
        )
        assert not overlaps, "Version label must not overlap special weapon controls"

        canvas = page.locator("#game-canvas")
        box = canvas.bounding_box()
        page.mouse.move(box["x"] + box["width"] * 0.72, box["y"] + box["height"] * 0.7)
        page.wait_for_timeout(35)
        player_red_pixels = page.evaluate(
            """() => {
              const context = document.querySelector('#game-canvas').getContext('2d');
              const pixels = context.getImageData(850, 455, 145, 145).data;
              let count = 0;
              for (let i = 0; i < pixels.length; i += 4) {
                if (pixels[i] > 155 && pixels[i + 1] < 115 && pixels[i + 2] < 130 && pixels[i + 3] > 180) count++;
              }
              return count;
            }"""
        )
        assert player_red_pixels > 35, "Player should reach the pointer without visible lag"
        page.mouse.move(
            upgrade_box["x"] + upgrade_box["width"] / 2,
            upgrade_box["y"] + upgrade_box["height"] / 2,
        )
        page.wait_for_timeout(35)
        hud_pointer_red_pixels = page.evaluate(
            """() => {
              const context = document.querySelector('#game-canvas').getContext('2d');
              const pixels = context.getImageData(560, 590, 160, 130).data;
              let count = 0;
              for (let i = 0; i < pixels.length; i += 4) {
                if (pixels[i] > 155 && pixels[i + 1] < 115 && pixels[i + 2] < 130 && pixels[i + 3] > 180) count++;
              }
              return count;
            }"""
        )
        assert hud_pointer_red_pixels > 35, "Player should follow the pointer over HUD controls"
        clipped_plane_pixels = page.evaluate(
            """() => {
              const context = document.querySelector('#game-canvas').getContext('2d');
              const pixels = context.getImageData(0, 710, 1280, 10).data;
              let count = 0;
              for (let i = 0; i < pixels.length; i += 4) {
                const red = pixels[i] > 155 && pixels[i + 1] < 115 && pixels[i + 2] < 130;
                const blue = pixels[i] < 85 && pixels[i + 1] < 145 && pixels[i + 2] > 95;
                if ((red || blue) && pixels[i + 3] > 180) count++;
              }
              return count;
            }"""
        )
        assert clipped_plane_pixels < 5, "Player aircraft should remain fully inside the canvas"
        bottom_center_is_grass = page.evaluate(
            """() => {
              const pixel = document.querySelector('#game-canvas')
                .getContext('2d').getImageData(640, 680, 1, 1).data;
              return pixel[1] > pixel[0] + 20 && pixel[1] > pixel[2] + 15;
            }"""
        )
        assert bottom_center_is_grass, "The oversized center runway should be replaced by open grassland"
        foreground_lake_pixels = page.evaluate(
            """() => {
              const pixels = document.querySelector('#game-canvas')
                .getContext('2d').getImageData(130, 490, 140, 100).data;
              let count = 0;
              for (let index = 0; index < pixels.length; index += 4) {
                if (pixels[index + 2] > pixels[index + 1] + 20 && pixels[index + 1] > pixels[index] + 70) count++;
              }
              return count;
            }"""
        )
        assert foreground_lake_pixels > 500, "The opening grassland should retain the left foreground lake"
        page.evaluate("""() => {
          window.__gameTest.addTarget();
          window.__gameTest.equip('laser', 3);
        }""")
        page.wait_for_timeout(4200)
        laser_hits = page.evaluate("window.__combatStats.laserHits")
        assert len(laser_hits) >= 2, f"Laser should damage a locked target more than once; hits={laser_hits}"
        assert all(b - a >= 1950 for a, b in zip(laser_hits, laser_hits[1:])), "Laser damage must be spaced by two seconds"
        page.evaluate("window.__gameTest.equip('homing', 3)")
        page.wait_for_timeout(3200)
        homing_shots = page.evaluate("window.__combatStats.homingShots")
        assert len(homing_shots) >= 2, "Homing weapon should fire repeatedly at a target"
        assert all(b - a >= 1450 for a, b in zip(homing_shots, homing_shots[1:])), "Homing shots must be spaced by 1.5 seconds"
        before = canvas.screenshot()
        page.wait_for_timeout(2000)
        after = canvas.screenshot(path=str(screenshot))
        assert before != after, "Canvas should animate after the game starts"
        audio_stats = page.evaluate("window.__audioStats")
        assert audio_stats["fireOscillators"] <= 6, "Bullet sound should not create a new oscillator for every salvo"
        assert audio_stats["bufferStarts"] >= 3, "Cached Web Audio buffers should produce game sounds"
        assert page.evaluate("window.__renderStats.gradients") < 180, "Gradients should be cached instead of recreated every frame"
        assert not errors, f"Browser errors: {errors}"
        browser.close()

    print(f"browser smoke ok: {screenshot}")


if __name__ == "__main__":
    main()
