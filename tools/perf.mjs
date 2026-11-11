// GPU-synchronised frame cost: each frame = director + all render passes + readPixels sync (measured in-page).
import { chromium } from 'playwright-core';
const cases = process.argv[2] === 'quick' ? [[1920, 1080, 1, 0], [1920, 1080, 2, 0]] : [[1920, 1080, 1, 0], [1920, 1080, 2, 0], [2560, 1440, 1, 0], [1920, 1080, 1, 1], [1920, 1080, 1, 2], [1920, 1080, 1, 3], [390, 844, 3, 2]];
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [w, h, dpr, tier] of cases) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  await p.goto(`http://localhost:8086/?script=canonical&perf=1&tier=${tier}`);
  await p.waitForFunction(() => window.__ready === true);
  await p.waitForTimeout(500);
  const r = await p.evaluate(async () => {
    const out = {};
    for (const [name, T] of [['title flight, 8 sub-frames', 5.4], ['slam', 7.0], ['run opening, police close', 11.2], ['traffic', 20], ['nitro', 32.6], ['two stars, ramming run', 73.8]]) {
      MC.seek(T); MC.play(); MC.stats.work.length = 0;
      await new Promise((res) => setTimeout(res, 2500));
      const d = MC.stats.work.slice(10).sort((a, b) => a - b);
      out[name] = `${d[d.length >> 1].toFixed(1)}/${d[Math.floor(d.length * 0.95)].toFixed(1)}ms`;
    }
    return { out, render: `${MC._post.outW}x${MC._post.outH} internal ${MC._post.W}x${MC._post.H} MSAA${MC._post.rtScene.samples}` };
  });
  console.log(`${w}x${h}@${dpr}x tier${tier} [${r.render}]  median/p95  ${JSON.stringify(r.out)}`);
  await p.close();
}
await b.close();
