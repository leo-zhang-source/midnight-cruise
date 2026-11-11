// Development aid: a strip of frames from a bot run, to judge motion (a lane change, a weave, a pass).
//   node tools/seq.mjs <outDir> <T0> <T1> [frames] [WxH] [seed] [idleFrom,idleTo]      → <outDir>/seq_00.png …
//   idleFrom,idleTo: the bot takes its hands off the wheel between these times (to take a hit on purpose)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { play } from './bot.mjs';

const [out = 'renders/scenes/seq', t0 = '40', t1 = '42', nArg = '6', size = '1280x720', seedArg = '1000', idle = ''] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number), n = +nArg, T0 = +t0, T1 = +t1;
mkdirSync(out, { recursive: true });
const r = play(+seedArg, T1 + 2, { nitro: false, idle: idle ? idle.split(',').map(Number) : null });
console.log(r.tl.gameEvents(0, 1e9).filter((e) => ['stumble', 'wreck', 'bust', 'crash', 'shake', 'over'].includes(e.k)).map((e) => `${e.k}${e.by ? ':' + e.by : ''}@${e.t.toFixed(2)}`).join(' '));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('[pageerror] ' + e.message));
await p.goto(`http://localhost:8086/?capture=1&w=${w}&h=${h}&t=0.5&tier=0`);
await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
for (let i = 0; i < n; i++) {
  const T = T0 + (T1 - T0) * i / Math.max(1, n - 1);
  await p.evaluate(([ev, T]) => { MC.load(ev); MC.seek(T); }, [r.ev, T]);
  await p.waitForTimeout(100);
  await p.screenshot({ path: `${out}/seq_${String(i).padStart(2, '0')}.png` });
}
console.log(`${n} frames, T ${T0} … ${T1}`);
await b.close();
