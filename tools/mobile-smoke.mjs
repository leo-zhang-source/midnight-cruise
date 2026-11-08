// Mobile emulation smoke test: iPhone 13 profile on WebKit (Safari's engine) — render, tap START, audio, touch steer.
import { webkit, devices } from 'playwright';
const b = await webkit.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(process.argv[2] || 'http://localhost:8086/');
await p.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
await p.tap('#start'); await p.waitForTimeout(3000);
const r = await p.evaluate(() => ({ vp: `${innerWidth}x${innerHeight}@${devicePixelRatio}`, coarse: matchMedia('(pointer: coarse)').matches, tier: MC.tier, status: MC._audio.status, mode: MC._audio.mode, samples: MC._audio.samples, phase: MC.state().phase, deckMin: document.getElementById('deck').dataset.min, note: document.getElementById('start-note').textContent }));
await p.screenshot({ path: '../renders/strip/iphone13_webkit.png' });
console.log('webkit iPhone 13', JSON.stringify(r), errs.length ? 'errors: ' + errs.join(' | ') : 'no page errors');
await b.close();
