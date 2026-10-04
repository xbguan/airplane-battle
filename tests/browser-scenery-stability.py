"""Compare actual scenery sampling against nearest-neighbor during motion/zoom."""
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "index.html").read_text()
DRAW = SOURCE.split("  function drawSceneryAsset(", 1)[1].split("\n  function drawScenery()", 1)[0]
DRAW = "function drawSceneryAsset(" + DRAW

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    page.goto("http://127.0.0.1:8765/index.html")
    page.wait_for_load_state("networkidle")
    results = page.evaluate("""async source => {
      const evidence = document.createElement('div'); evidence.id = 'sampling-evidence';
      evidence.style = 'position:fixed;inset:0;background:white;z-index:99999;display:grid;grid-template-columns:repeat(3,400px);color:black';
      document.body.append(evidence);
      const results = [];
      for (const [key, file, width, height, gain] of [
        ['perspectiveLighthouseReef', 'perspective-lighthouse-reef.png', 176, 132, 1.8],
        ['perspectiveSailboat', 'perspective-sailboat.png', 92, 68, 1.3]
      ]) {
        const image = new Image();
        image.src = 'assets/scenery/' + file;
        await image.decode();
        for (const depth of [.15, .5, .9]) {
          const metrics = {};
          for (const mode of ['nearest', 'smooth', 'actual']) {
            const canvas = document.createElement('canvas');
            canvas.width = 400; canvas.height = 320;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const nativeDraw = ctx.drawImage.bind(ctx);
            ctx.drawImage = (...args) => {
              if (mode !== 'actual') {
                ctx.imageSmoothingEnabled = mode === 'smooth';
                ctx.imageSmoothingQuality = 'high';
              }
              nativeDraw(...args);
            };
            const render = new Function('ctx', 'assets', source + '; return drawSceneryAsset;')(ctx, { [key]: image });
            let previous, beforePrevious, energy = 0;
            for (let frame = 0; frame < 32; frame++) {
              const d = depth + frame * .2 / (720 * .58);
              const scale = .38 + d * .72 + 1.1 * (gain - 1) * d * d;
              ctx.fillStyle = '#238ad1'; ctx.fillRect(0, 0, 400, 320);
              render(key, 200, 150 + frame * .2, width * scale, height * scale);
              const pixels = ctx.getImageData(0, 0, 400, 320).data;
              if (beforePrevious) {
                for (let i = 0; i < pixels.length; i += 4) {
                  for (let c = 0; c < 3; c++) energy += Math.abs(pixels[i+c] - 2 * previous[i+c] + beforePrevious[i+c]);
                }
              }
              beforePrevious = previous; previous = pixels;
            }
            metrics[mode] = energy;
            if (depth === .9) {
              canvas.style.width = '400px';
              const label = document.createElement('div');
              label.textContent = key + ' / ' + mode;
              const cell = document.createElement('div'); cell.append(label, canvas);
              document.querySelector('#sampling-evidence').append(cell);
            }
          }
          results.push({key, depth, ...metrics, ratio: metrics.actual / metrics.nearest});
        }
      }
      return results;
    }""", DRAW)
    page.locator('#sampling-evidence').screenshot(path='/tmp/scenery-sampling-comparison.png')
    browser.close()

print(json.dumps(results, indent=2))
for result in results:
    assert 0 < result['ratio'] < .65, f"Unstable or missing scenery sampling: {result}"
print('Scenery motion/zoom stability passed for both assets at three depths')
