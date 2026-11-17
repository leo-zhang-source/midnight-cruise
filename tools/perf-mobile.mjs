// Phone-like frame cost: landscape phone viewport (844×390 @3x, touch), CPU throttled ×N, GPU-synchronised work per frame
// plus the CPU split between director, world, title and the render passes.
// Usage: node tools/perf-mobile.mjs [cpuThrottle=4] [extra query, e.g. "&tier=3" or "&lite=0"]
import { chromium } from 'playwright-core';
const thr = +(process.argv[2] || 4), q = process.argv[3] || '';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const [vw, vh, vd] = (process.env.VP || '844x390x3').split('x').map(Number);   // VP=1920x1080x2 to amplify GPU cost on a fast Mac
const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: vd, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await p.goto(`http://localhost:8086/?script=canonical&perf=1${q}`, { timeout: 20000 });
await p.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: thr });
const r = await p.evaluate(async () => {
  const T = {};
  const wrap = (o, k, n) => { const f = o[k].bind(o); o[k] = (...a) => { const t = performance.now(); const v = f(...a); T[n] = (T[n] || 0) + performance.now() - t; return v; }; };
  wrap(MC._world, 'update', 'world'); wrap(MC._title, 'update', 'title'); wrap(MC._post, 'render', 'post');
  const out = {};
  for (const [name, at] of [['opening', 19.0], ['run start', 27.2], ['traffic', 36], ['nitro', 48.6], ['2 stars', 73.8]]) {
    MC.seek(at); MC.play(); MC.stats.work.length = 0; MC.stats.dts.length = 0; for (const k in T) T[k] = 0;
    await new Promise((res) => setTimeout(res, 2500));
    const n = Math.max(1, MC.stats.work.length), d = MC.stats.work.slice(3).sort((a, b) => a - b), dt = MC.stats.dts.slice(3).sort((a, b) => a - b);
    const md = (a) => (a.length ? a[a.length >> 1].toFixed(1) : '-');
    let st = performance.now(); for (let i = 0; i < 20; i++) MC.state(at + i / 60); st = (performance.now() - st) / 20;
    out[name] = `director ${st.toFixed(1)}ms  work ${md(d)}ms  frame ${md(dt)}ms  | cpu: world ${((T.world || 0) / n).toFixed(1)}  title ${((T.title || 0) / n).toFixed(1)}  post ${((T.post || 0) / n).toFixed(1)}`;
  }
  return { out, tier: MC.tier, res: `${MC._post.outW}x${MC._post.outH} → ${MC._post.W}x${MC._post.H} MSAA${MC._post.rtScene.samples}` };
});
console.log(`cpu×${thr} ${q || '(default)'}  tier ${r.tier}  ${r.res}`);
for (const k in r.out) console.log('  ', k.padEnd(10), r.out[k]);
await b.close();
