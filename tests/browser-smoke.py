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
        else "/tmp/airplane-battle-v3.png"
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
            window.__renderCacheStats = { sources: {} };
            window.__assetStats = { expected: [], loaded: [], failed: [], external: [] };
            const renderAssetIds = new WeakMap();
            let nextRenderAssetId = 1;
            const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
            CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
              const source = image?.dataset?.assetSrc;
              if (source) {
                const marker = '/assets/';
                const path = source.includes(marker) ? `assets/${source.split(marker)[1]}` : source;
                if (!renderAssetIds.has(image)) renderAssetIds.set(image, nextRenderAssetId++);
                const id = renderAssetIds.get(image);
                const entry = window.__renderCacheStats.sources[path] ||= { ids: [], width: image.width, height: image.height, draws: 0 };
                if (!entry.ids.includes(id)) entry.ids.push(id);
                entry.draws += 1;
              }
              return originalDrawImage.call(this, image, ...args);
            };
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
        stray_pixels = page.evaluate("""async () => {
            const bat = new Image();
            bat.src = 'assets/characters/bat.png';
            await bat.decode();
            const canvas = document.createElement('canvas');
            canvas.width = bat.naturalWidth; canvas.height = bat.naturalHeight;
            const context = canvas.getContext('2d');
            context.drawImage(bat, 0, 0);
            const pixels = context.getImageData(41, 218, 14, 5).data;
            let opaque = 0;
            for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) opaque++;
            return opaque;
        }""")
        assert stray_pixels == 0, f"Bat lower-left stray pixels remain: {stray_pixels}"

        def snapshot():
            return page.evaluate("window.__gameTest.snapshot()")

        def assert_inside(selector):
            shell = page.locator("#game-shell").bounding_box()
            panel = page.locator(selector).bounding_box()
            assert shell and panel
            assert panel["x"] >= shell["x"] - 1 and panel["y"] >= shell["y"] - 1
            assert panel["x"] + panel["width"] <= shell["x"] + shell["width"] + 1
            assert panel["y"] + panel["height"] <= shell["y"] + shell["height"] + 1
            assert page.locator(selector).evaluate("node => node.scrollWidth <= node.clientWidth + 1")

        def spawn_and_defeat(number, variant="brown"):
            page.evaluate("([number, variant]) => { window.__gameTest.setState({bosses: number - 1}); window.__gameTest.spawnBoss(number, variant); window.__gameTest.defeatBoss(); }", [number, variant])
            assert page.locator("#growth-modal").is_visible()
            assert snapshot()["paused"]

        # Real buttons drive every transition; hooks only prepare deterministic combat.
        for width, height in ((1280, 720), (1440, 900)):
            for theme in ("backgroundTopdown", "backgroundPerspective"):
                if perspective_only and theme != "backgroundPerspective":
                    continue
                page.set_viewport_size({"width": width, "height": height})
                page.reload()
                page.wait_for_load_state("networkidle")
                assert_inside("#start-screen .panel")
                scene = page.locator(f'[data-scene-theme="{theme}"]')
                scene.click()
                assert "selected" in scene.get_attribute("class")
                assert "scene-preview-" in scene.evaluate("node => getComputedStyle(node, '::before').backgroundImage")
                page.locator("#start-button").click()
                assert page.locator("#start-screen").is_hidden()
                part_icons = page.locator("#weapon-parts img")
                assert part_icons.count() == 2
                assert part_icons.nth(0).get_attribute("src").endswith("ui-homing-missile.png")
                assert part_icons.nth(1).get_attribute("src").endswith("ui-laser-cannon.png")
                assert page.locator("#weapon-parts .fragment-count").count() == 1
                assert_inside("#weapon-parts")
                initial = snapshot()
                assert initial["player"]["hp"] == 100
                assert initial["attackLevel"] == 0 and initial["weaponParts"] == 0
                assert initial["normalKills"] == 0 and initial["bosses"] == 0
                assert initial["highestBoss"] == 0
                assert page.locator("#growth-modal").is_hidden()
                box = page.locator("#game-canvas").bounding_box()
                page.mouse.move(box["x"] + box["width"] * .72, box["y"] + box["height"] * .7)
                assert abs(snapshot()["player"]["x"] - 1280 * .72) < 2
                assert abs(snapshot()["player"]["y"] - 720 * .7) < 2
                page.mouse.move(box["x"] + 25, box["y"] + box["height"] - 25)
                assert snapshot()["player"]["x"] == 105
                assert snapshot()["player"]["y"] == 615
                page.evaluate("window.__gameTest.setState({xp: 1000, weaponParts: 10})")
                page.evaluate("window.__gameTest.upgrade('attack'); window.__gameTest.upgrade('homing')")
                assert snapshot()["attackLevel"] == 0 and snapshot()["weaponLevels"]["homing"] == 0
                page.evaluate("window.__gameTest.setState({xp: 0, weaponParts: 0})")

                # Collision destroys the normal enemy without awarding experience/progress.
                before = snapshot()
                page.evaluate("window.__gameTest.collideEnemy('drone')")
                after = snapshot()
                assert after["xp"] == before["xp"] and after["normalKills"] == before["normalKills"]
                assert after["player"]["hp"] == 70
                page.evaluate("window.__gameTest.collideEnemy('bat')")
                assert snapshot()["player"]["hp"] == 70
                page.evaluate("window.__gameTest.setState({player: {hp: 100, invulnerable: 999}})")

                # Actual kill resolver opens growth, even before special weapons are affordable.
                spawn_and_defeat(1)
                assert snapshot()["xp"] == 70 and snapshot()["weaponParts"] == 3
                assert_inside("#growth-modal .panel")
                assert page.locator("#growth-modal .panel").evaluate("node => getComputedStyle(node).clipPath !== 'none'")
                growth_buttons = page.locator("#growth-modal .button-row button")
                boxes = [growth_buttons.nth(i).bounding_box() for i in range(4)]
                assert max(b["width"] for b in boxes) - min(b["width"] for b in boxes) <= 1
                assert max(b["x"] for b in boxes) - min(b["x"] for b in boxes) <= 1
                growth_icon_files = {
                    "attack": "ui-attack-upgrade.png",
                    "homing": "ui-homing-missile-upgrade.png",
                    "laser": "ui-laser-upgrade.png",
                }
                for kind, filename in growth_icon_files.items():
                    icon = page.locator(f"#growth-{kind} img")
                    assert icon.get_attribute("src").endswith(filename)
                    assert icon.evaluate("node => node.complete && node.naturalWidth > 0")
                    assert float(page.locator(f"#growth-{kind}").evaluate("node => parseFloat(getComputedStyle(node).borderRadius)")) <= 3
                assert "grayscale" in page.locator("#growth-homing img").evaluate("node => getComputedStyle(node).filter")
                assert page.locator("#growth-modal button img").count() == 3
                if width == 1440:
                    page.locator("#growth-modal .panel").screenshot(path=f"/tmp/airplane-v3-growth-ready-{theme}.png")
                frozen = snapshot()["time"]
                page.wait_for_timeout(150)
                assert snapshot()["time"] == frozen
                assert page.locator("#growth-homing").is_disabled()
                assert float(page.locator("#growth-homing").evaluate("node => getComputedStyle(node).opacity")) < 1
                page.locator("#growth-attack").click()
                assert snapshot()["attackLevel"] == 1 and snapshot()["xp"] == 20
                assert page.locator("#growth-modal").is_visible()
                page.locator("#growth-continue").click()
                assert not snapshot()["paused"]

                spawn_and_defeat(2, "blue")
                assert snapshot()["weaponParts"] == 6
                page.locator("#growth-homing").click()
                assert snapshot()["weaponLevels"]["homing"] == 1
                assert snapshot()["weaponParts"] == 1
                assert page.locator("#growth-laser").is_disabled()
                page.locator("#growth-continue").click()

                # One growth visit permits all affordable levels, and immediately converts XP.
                page.evaluate("window.__gameTest.setState({xp: 1000, weaponParts: 10})")
                spawn_and_defeat(3)
                for _ in range(4):
                    page.locator("#growth-attack").click()
                assert snapshot()["attackLevel"] == 5
                assert snapshot()["xp"] == 85
                assert snapshot()["weaponParts"] == 18
                page.locator("#growth-homing").click()
                page.locator("#growth-homing").click()
                page.locator("#growth-laser").click()
                assert snapshot()["weaponLevels"] == {"homing": 3, "laser": 1}
                assert snapshot()["weaponParts"] == 3
                assert page.locator("#growth-modal button img").count() == 3
                if width == 1440:
                    page.locator("#growth-modal .panel").screenshot(path=f"/tmp/airplane-v3-growth-{theme}.png")
                page.locator("#growth-continue").click()
                page.locator("#laser-weapon").click()
                assert snapshot()["activeWeapon"] == "laser"
                page.locator("#homing-weapon").click()
                assert snapshot()["activeWeapon"] == "homing"

                spawn_and_defeat(4)
                page.locator("#growth-continue").click()
                spawn_and_defeat(5, "blue")
                saved = snapshot()
                page.locator("#growth-continue").click()
                assert page.locator("#victory-screen").is_visible()
                assert_inside("#victory-screen .panel")
                primary_box = page.locator("#victory-endless").bounding_box()
                secondary_box = page.locator("#victory-end").bounding_box()
                assert abs(primary_box["width"] - secondary_box["width"]) <= 1
                assert abs(primary_box["height"] - secondary_box["height"]) <= 1
                assert float(page.locator("#victory-end").evaluate("node => parseFloat(getComputedStyle(node).borderRadius)")) <= 3
                assert snapshot()["paused"]
                if width == 1440:
                    page.locator("#victory-screen .panel").screenshot(path=f"/tmp/airplane-v3-victory-{theme}.png")
                page.locator("#victory-endless").click()
                continued = snapshot()
                for key in ("xp", "weaponParts", "attackLevel", "weaponLevels", "normalKills", "bosses"):
                    assert continued[key] == saved[key], f"Endless reset {key}"
                assert continued["player"]["hp"] == saved["player"]["hp"]
                assert continued["endless"] and not continued["paused"]
                spawn_and_defeat(6)
                page.locator("#growth-continue").click()
                assert page.locator("#victory-screen").is_hidden()
                assert not snapshot()["paused"]

                page.evaluate("window.__gameTest.finish(60, 6, 5)")
                assert page.locator("#game-over").is_visible()
                assert "无尽" in page.locator("#game-over").inner_text()
                assert_inside("#game-over .panel")
                assert page.locator("#result-copy .result-stat").count() >= 7
                if width == 1440:
                    page.locator("#game-over .panel").screenshot(path=f"/tmp/airplane-v3-result-{theme}.png")
                page.locator("#restart-button").click()
                fresh = snapshot()
                assert fresh["player"]["hp"] == 100 and fresh["weaponParts"] == 0 and fresh["xp"] == 0
                assert fresh["attackLevel"] == 0 and fresh["weaponLevels"] == {"homing": 0, "laser": 0}
                assert fresh["bosses"] == 0 and fresh["highestBoss"] == 0 and not fresh["endless"]
                assert fresh["activeWeapon"] is None
                assert page.locator("#victory-screen").is_hidden()
                assert page.locator("#growth-modal").is_hidden()
                assert page.locator("#boss-panel").is_hidden()

                cache_before_restart = page.evaluate("JSON.parse(JSON.stringify(window.__renderCacheStats.sources))")
                page.evaluate("window.__gameTest.restart(); window.__gameTest.setState({player: {invulnerable: 999}})")
                page.wait_for_timeout(50)
                cache_after_restart = page.evaluate("window.__renderCacheStats.sources")
                for path, entry in cache_before_restart.items():
                    assert cache_after_restart[path]["ids"] == entry["ids"], (path, entry, cache_after_restart[path])

                expected_cached_sizes = {
                    "assets/characters/player-fighter.png": (256, 187),
                    **({"assets/scenery/water-topdown-loop.png": (1280, 720)} if theme == "backgroundTopdown" else {
                        "assets/scenery/background-perspective.png": (1280, 720),
                        "assets/scenery/perspective-clear-cloud-far.png": (576, 192),
                        "assets/scenery/perspective-clear-cloud-near.png": (704, 235),
                    }),
                }
                for path, size in expected_cached_sizes.items():
                    entry = cache_after_restart.get(path)
                    assert entry and tuple((entry["width"], entry["height"])) == size, (path, entry)
                    assert len(entry["ids"]) == 1, (path, entry)

                # Special MAX alone must not stop machinegun XP; its last upgrade turns XP into MAX.
                page.evaluate("window.__gameTest.setState({attackLevel: 4, weaponLevels: {homing: 3, laser: 3}, xp: 200, weaponParts: 7})")
                spawn_and_defeat(5)
                assert snapshot()["xp"] == 350 and snapshot()["weaponParts"] == 7
                page.locator("#growth-attack").click()
                assert snapshot()["attackLevel"] == 5 and snapshot()["weaponParts"] == 7
                assert page.locator("#xp-text").inner_text() == "MAX"
                assert page.locator("#growth-attack").is_disabled()
                assert page.locator("#growth-homing").is_disabled()
                assert page.locator("#growth-laser").is_disabled()
                # Victory's other action ends the run instead of starting endless mode.
                page.locator("#growth-continue").click()
                page.locator("#victory-end").click()
                assert not snapshot()["running"]
                assert not snapshot()["endless"]
                page.locator("#restart-button").click()
                page.evaluate("window.__gameTest.addTarget(); window.__gameTest.setState({player: {invulnerable: 999}})")
                canvas = page.locator("#game-canvas")
                before_frame = canvas.screenshot()
                page.wait_for_timeout(500)
                assert canvas.screenshot() != before_frame
                if width == 1440:
                    canvas.screenshot(path=f"/tmp/airplane-v3-play-{theme}.png")
                # Observe real canvas draw calls for every actor above/at/below the horizon.
                for actor_y in (120, 720 * .34 - 1, 720 * .34, 500):
                    shadow_keys = page.evaluate("""async y => {
                        const context = document.querySelector('#game-canvas').getContext('2d');
                        const original = context.drawImage;
                        const keys = [];
                        context.drawImage = function(image, ...args) {
                            const source = image.src || image.dataset?.assetSrc;
                            if (source && source.includes('/assets/shadows/')) keys.push(source.split('/').pop());
                            return original.call(this, image, ...args);
                        };
                        const types = ['eagle', 'drone', 'bat', 'wizard', 'boss', 'boss'];
                        const enemies = types.map((type, i) => ({id: i + 100, type, x: 270 + i * 174,
                            y, age: 0, phase: 'enter', variant: i === 5 ? 'blue' : 'brown',
                            hp: 100, maxHp: 100, r: 25, charging: false, dead: false}));
                        window.__gameTest.setState({paused: true, enemies, boss: null, bullets: [],
                            enemyBullets: [], particles: [], impacts: [], floaters: [], damageEffects: [],
                            laserFlash: null, shake: 0, player: {x: 100, y, invulnerable: 0}});
                        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                        context.drawImage = original;
                        return [...new Set(keys)];
                    }""", actor_y)
                    expected_count = 0 if theme == "backgroundPerspective" and actor_y < 720 * .34 else 7
                    assert len(shadow_keys) == expected_count, (theme, actor_y, shadow_keys)
                    if width == 1440 and actor_y in (120, 500):
                        page.locator("#game-canvas").screenshot(path=f"/tmp/airplane-shadows-{theme}-{actor_y}.png")
                page.evaluate("window.__gameTest.restart(); window.__gameTest.setState({player: {invulnerable: 999}})")
                assert not errors, f"Browser errors: {errors}"

        if not modal_only:
            # Execute production boss behavior with reproducible combat inputs.
            for variant, expected in (("brown", 7), ("blue", 3)):
                page.evaluate("""variant => {
                    const t = window.__gameTest;
                    t.spawnBoss(7, variant);
                    const boss = t.snapshot().boss;
                    Object.assign(boss, {entered: true, y: 120, shootTimer: 0, actionTimer: 99,
                        baseAttackCount: variant === 'brown' ? 2 : 11, hp: boss.maxHp * .49});
                    t.setState({boss, enemies: [boss], enemyBullets: [], delayedAttacks: [], bullets: [],
                        activeWeapon: null, player: {x: 640, y: 615, invulnerable: 999}});
                    t.step(.01);
                }""", variant)
                state = snapshot()
                assert len(state["enemyBullets"]) == expected, (variant, state)
                if variant == "blue":
                    assert state["boss"]["baseAttackCount"] == 12
                    assert len(state["delayedAttacks"]) == 1
                    page.evaluate("window.__gameTest.step(.35)")
                    state = snapshot()
                    assert len(state["enemyBullets"]) == 5
                    assert state["boss"]["baseAttackCount"] == 12
                page.locator("#game-canvas").screenshot(path=f"/tmp/airplane-v3-boss-{variant}.png")
            page.evaluate("window.__gameTest.restart(); window.__gameTest.setState({player: {invulnerable: 999}})")
            page.evaluate("window.__gameTest.addTarget(); window.__gameTest.equip('laser', 3); window.__combatStats.laserHits = []")
            page.wait_for_timeout(3400)
            laser_hits = page.evaluate("window.__combatStats.laserHits")
            assert len(laser_hits) >= 2
            assert all(b - a >= 1450 for a, b in zip(laser_hits, laser_hits[1:])), laser_hits
            page.evaluate("window.__gameTest.equip('homing', 3); window.__combatStats.homingShots = []")
            page.wait_for_timeout(3400)
            homing_shots = page.evaluate("window.__combatStats.homingShots")
            assert len(homing_shots) >= 2
            assert all(b - a >= 1450 for a, b in zip(homing_shots, homing_shots[1:])), homing_shots
            assert page.evaluate("window.__audioStats.bufferStarts") >= 3
            assert page.evaluate("window.__renderStats.gradients") < 180
            draws = page.evaluate("window.__renderStats.sceneryDraws")
            assert "backgroundPerspective" in draws
            assert "perspectiveClearCloudFar" in draws and "perspectiveWaterContact" in draws
        assert not errors, f"Browser errors: {errors}"
        assert not external_requests, f"Unexpected network requests: {external_requests}"
        browser.close()
    print("V3 browser smoke passed: growth, victory, endless, restart, two viewports and scenes, animation, assets, errors")


if __name__ == "__main__":
    main()
