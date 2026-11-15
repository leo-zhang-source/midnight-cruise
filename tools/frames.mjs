// Development aid: capture frames at given scene times.
//   node tools/frames.mjs <outDir> <WxH> <mode> <t1,t2,…> [crop=x,y,w,h] [query]
//   mode: intro (START at 1.0; times are seconds into the intro) | item (the bot's drive; times are seconds before a canister is taken)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const [out, size = '1280x720', mode = 'intro', list = '1', crop = '', query = ''] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
mkdirSync(out, { recursive: true });
let ev = [{ type: 'start', t: 1, seed: 1000 }], base = 1;
if (mode === 'item') { const { play } = await import('./bot.mjs'); const r = play(1000, 260, { nitro: false }); ev = r.ev; base = r.tl.gameEvents(0, 1e9).find((e) => e.k === 'item').t; }
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const logs = [];
p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await p.goto(`http://localhost:8086/?capture=1&w=${w}&h=${h}&t=0.5&tier=0${query ? '&' + query : ''}`);
await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const clip = crop ? (([x, y, cw, ch]) => ({ x, y, width: cw, height: ch }))(crop.split(',').map(Number)) : undefined;
for (const t of list.split(',').map(Number)) {
  const T = mode === 'item' ? base - t : base + t;
  await p.evaluate(([ev, T]) => { MC.load(ev); MC.seek(T); }, [ev, T]);
  await p.waitForTimeout(120);
  await p.screenshot({ path: `${out}/${mode}_${t.toFixed(2)}.png`, clip });
}
if (logs.length) console.log(logs.slice(0, 12).join('\n'));
await b.close(); console.log('ok');
