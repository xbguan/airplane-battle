"""Sustained combat/input probe. Start the local server on port 8765 first.

Example: python3 tests/browser-performance.py --seconds 60 --cpu-rate 4
Optional --baseline points to an unchanged index.html for sequential comparison.
Instrumentation is injected into the response; production test-mode logs stay off.
"""
import argparse
import json
from pathlib import Path
import time
from playwright.sync_api import sync_playwright

INSTRUMENTATION = r"""
  const perfSamples = [];
  let pointerAt = null;
  let pointerHandledAt = null;
  let previousFrame = null;
  let updateElapsed = 0;
  const originalUpdate = update;
  const originalDrawScene = drawScene;
  update = function(dt) {
    const start = performance.now(); originalUpdate(dt);
    updateElapsed = performance.now() - start;
  };
  drawScene = function() {
    const start = performance.now(); originalDrawScene();
    const end = performance.now();
    if (previousFrame !== null) perfSamples.push([
      start - previousFrame, updateElapsed, end - start,
      pointerAt === null ? null : end - pointerAt,
      pointerHandledAt === null ? null : end - pointerHandledAt
    ]);
    previousFrame = start; pointerAt = null; pointerHandledAt = null;
  };
  shell.addEventListener('pointermove', event => {
    pointerAt = event.timeStamp; pointerHandledAt = performance.now();
  });
  const assetIdentity = new Set();
  window.__perfProbe = {
    prepare() {
      game.time = 20; game.player.invulnerable = 9999;
      game.spawnTimer = Infinity; game.weaponLevels.homing = 3;
      game.activeWeapon = 'homing'; game.shake = 0;
      game.bullets=[];game.enemyBullets=[];game.particles=[];game.impacts=[];game.floaters=[];
      game.fireTimer=0;game.specialTimer=0;
      game.enemies = Array.from({length: 8}, (_, i) => ({
        id: -i-1, type: 'drone', x: 170+i*130, y: 180, r: 25,
        hp: 100000, maxHp: 100000, dead: false, age: 0,
        phase: 'hover', shootTimer: 9999, baseX: 170+i*130,
        targetY: 180, vx: 0, vy: 0, speedScale: .0001
      }));
      Object.values(assets).forEach(asset => assetIdentity.add(asset));
      perfSamples.length = 0; previousFrame = null;
    },
    resetWindow() {
      perfSamples.length = 0; previousFrame = null; pointerAt = null; pointerHandledAt = null;
    },
    sample() {
      const rows = perfSamples.splice(0);
      const percentile = (values, p) => {
        values.sort((a,b) => a-b);
        return values.length ? values[Math.floor((values.length-1)*p)] : null;
      };
      return {
        gameTime: game.time, frames: rows.length,
        frameP95: percentile(rows.map(r => r[0]), .95),
        drawP95: percentile(rows.map(r => r[2]), .95),
        updateP95: percentile(rows.map(r => r[1]), .95),
        inputP95: percentile(rows.map(r => r[3]).filter(v => v !== null), .95),
        handledInputP95: percentile(rows.map(r => r[4]).filter(v => v !== null), .95),
        inputSamples: rows.filter(r => r[3] !== null).length,
        longFrames: rows.filter(r => r[0] > 33.5).length,
        counts: Object.fromEntries(['enemies','bullets','enemyBullets','particles','impacts','floaters','delayedAttacks'].map(k => [k,game[k].length])),
        soundBuffers: Object.keys(soundBuffers).length,
        playerPosition: [game.player.x, game.player.y],
        assetsReused: Object.values(assets).length === assetIdentity.size && Object.values(assets).every(asset => assetIdentity.has(asset)),
        renderCacheCount: Object.values(assets).filter(asset => asset instanceof HTMLCanvasElement).length,
        renderCachePixels: Object.values(assets).filter(asset => asset instanceof HTMLCanvasElement).reduce((n,a) => n+a.width*a.height,0)
      };
    },
    fixture() {
      game.paused = true; game.time = 20; game.shake = 0;
      game.player.x = 640; game.player.y = 580; game.player.invulnerable = 0;
      game.enemies = ['eagle','drone','bat','wizard','boss','boss'].map((type,i) => ({
        id: i+10, type, x: 130+i*200, y: 280, r: 25, age: 0,
        variant: i === 5 ? 'blue' : 'brown', hp: 100, maxHp: 100,
        phase: 'enter', charging: false, dead: false
      }));
      game.bullets = [{type:'fire',x:624,y:450,vx:0,vy:-720}, {type:'homing',x:850,y:450,vx:0,vy:-420}];
      game.enemyBullets = ['wizardMagicOrb','orangeBossShell','blueBossBolt'].map((visualKey,i) => ({visualKey,x:250+i*200,y:390,r:13}));
      game.impacts = ['hitMachinegun','hitMissile','hitLaser'].map((key,i) => ({key,x:250+i*200,y:470,life:.2,maxLife:.26}));
      game.particles=[];game.damageEffects=[];game.floaters=[];game.laserTarget=null;
      game.laserFlash={x:640,y:542,rotation:-Math.PI/2,length:250,life:.15,maxLife:.18};
      drawScene();
    }
  };
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seconds', type=float, default=60)
    parser.add_argument('--cpu-rate', type=float, default=1)
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--output', type=Path, default=Path('/tmp/airplane-performance'))
    args = parser.parse_args()
    assert args.seconds >= 10 and args.cpu_rate >= 1
    args.output.mkdir(parents=True, exist_ok=True)
    versions = [('current', Path(__file__).resolve().parent.parent / 'index.html')]
    if args.baseline:
        versions.insert(0, ('baseline', args.baseline))
    results = []
    with sync_playwright() as playwright:
        for label, path in versions:
            browser = playwright.chromium.launch(headless=True)
            source = path.read_text()
            anchor = '  buildSpriteCache();resetGame();preloadAssets();requestAnimationFrame(loop);'
            assert source.count(anchor) == 1, 'Update the probe injection point to match the game entrypoint'
            source = source.replace(anchor, INSTRUMENTATION + '\n' + anchor)
            for theme in ('backgroundTopdown', 'backgroundPerspective'):
                page = browser.new_page(viewport={'width': 1280, 'height': 720})
                page.add_init_script("""window.__canvasAllocations = 0;
                    const createElement = document.createElement.bind(document);
                    document.createElement = function(tag, ...args) {
                        if (tag.toLowerCase() === 'canvas') window.__canvasAllocations++;
                        return createElement(tag, ...args);
                    };""")
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
                page.route('**/index.html', lambda route: route.fulfill(body=source, content_type='text/html'))
                cdp = page.context.new_cdp_session(page)
                cdp.send('Performance.enable')
                cdp.send('Emulation.setCPUThrottlingRate', {'rate': args.cpu_rate})
                page.goto('http://127.0.0.1:8765/index.html')
                page.wait_for_load_state('networkidle')
                page.locator(f'[data-scene-theme="{theme}"]').click()
                page.locator('#start-button').click()
                page.evaluate('window.__perfProbe.prepare()')
                page.wait_for_timeout(10000)
                page.evaluate('window.__perfProbe.prepare()')
                initial_allocations = page.evaluate('window.__canvasAllocations')
                initial_cache = page.evaluate('window.__perfProbe.sample()')
                page.evaluate('window.__perfProbe.resetWindow()')
                started = time.monotonic()
                checkpoint = started + 10
                i = 0
                while time.monotonic() - started < args.seconds:
                    page.mouse.move(350 + (i % 40) * 15, 580)
                    page.wait_for_timeout(50)
                    i += 1
                    if time.monotonic() >= checkpoint:
                        sample = page.evaluate('window.__perfProbe.sample()')
                        cdp.send('HeapProfiler.collectGarbage')
                        metrics = {m['name']: m['value'] for m in cdp.send('Performance.getMetrics')['metrics']}
                        sample.update(version=label, theme=theme, elapsed=round(time.monotonic()-started,1), heapMB=round(metrics['JSHeapUsedSize']/1024/1024,2))
                        assert sample['frames'] > 0 and sample['assetsReused']
                        assert sample['inputSamples'] >= 20 and sample['inputP95'] is not None
                        assert sample['renderCacheCount'] == initial_cache['renderCacheCount']
                        assert sample['renderCachePixels'] == initial_cache['renderCachePixels']
                        assert page.evaluate('window.__canvasAllocations') == initial_allocations
                        if label == 'current':
                            assert sample['renderCacheCount'] > 0, 'Runtime still draws uncached large images'
                        assert sample['counts']['enemies'] == 8
                        assert sample['counts']['bullets'] < 60
                        assert sample['counts']['particles'] <= 180 and sample['counts']['impacts'] <= 24
                        assert sample['playerPosition'] == [350 + ((i-1) % 40) * 15, 580], sample['playerPosition']
                        results.append(sample)
                        print(json.dumps(sample), flush=True)
                        page.evaluate('window.__perfProbe.resetWindow()')
                        checkpoint += 10
                page.evaluate('window.__perfProbe.fixture()')
                page.locator('#game-canvas').screenshot(path=str(args.output / f'{label}-{theme}.png'))
                assert not errors, errors
                page.close()
            browser.close()
    (args.output / 'metrics.json').write_text(json.dumps(results, indent=2))
    print(f'Performance probe passed; measurements and screenshots: {args.output}')


if __name__ == '__main__':
    main()
