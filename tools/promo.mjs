// Marketing stills: renders candidate moments (opening shots, nitro bursts, the helicopter, roadblocks, each colour preset)
// from deterministic timelines at a fixed size.   node tools/promo.mjs <outDir> [WxH] [seed]   (needs the dev server on :8086)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { play } from './bot.mjs';
import { IGNITION } from '../js/cue.js';

const [out = 'renders/promo', size = '1920x1080', seedArg = '2024', onlyArg = ''] = process.argv.slice(2);
const only = onlyArg ? new Set(onlyArg.split(',')) : null;     // render just these shot names
const [w, h] = size.split('x').map(Number), seed = +seedArg;
mkdirSync(out, { recursive: true });
const shots = [];
// the opening film (full intro, no skip)
const intro = play(seed, 40, { intro: true });
for (const t of [2.6, 5.2, 6.5, 9.5, 11, 13.2, 14.6, 17.5, 19.2, 21.0, 21.8, 22.6, 23.4, 23.8, 24.0, 24.2, 24.6]) shots.push(['open_' + String(t).replace('.', '_'), intro.ev, 1 + t]);
// gameplay with nitro, from several starting levels and colour presets
const C = 1.9;
for (const [lv, preset] of [[0, 0], [6, 1], [10, 2], [14, 3]]) {
  const env = preset ? [{ type: 'env', t: C + 0.5, preset }] : [];
  const r = play(seed + lv, 150, { nitro: true, seek: true, lv, extra: env });
  const gev = r.tl.gameEvents(0, 1e9), all = (k) => gev.filter((e) => e.k === k);
  const tag = `lv${lv}_p${preset}`;
  r.tl.nitros(C + 150).slice(0, 2).forEach((n, i) => shots.push([`${tag}_nitro${i}_a`, r.ev, n.I + 0.15], [`${tag}_nitro${i}_b`, r.ev, n.I + 0.6], [`${tag}_nitro${i}_c`, r.ev, n.I + 1.6]));
  all('lock').slice(0, 2).forEach((e, i) => shots.push([`${tag}_lock${i}`, r.ev, e.t + 0.6], [`${tag}_fire${i}`, r.ev, e.t + 1.3]));
  all('block').slice(0, 2).forEach((e, i) => shots.push([`${tag}_block${i}`, r.ev, e.t + 0.4]));
  all('smash').slice(0, 2).forEach((e, i) => shots.push([`${tag}_smash${i}`, r.ev, e.t + 0.05]));
  all('ictell').slice(0, 1).forEach((e) => shots.push([`${tag}_ic`, r.ev, e.t + 0.6]));
  all('charge').slice(0, 1).forEach((e) => shots.push([`${tag}_charge`, r.ev, e.t + 0.25]));
  for (const t of [30, 60, 90, 120]) shots.push([`${tag}_cruise${t}`, r.ev, C + t]);
}
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const logs = [];
p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await p.goto(`http://localhost:8086/?capture=1&w=${w}&h=${h}&t=0.5&tier=0`);
await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const hide = ['#skip', '#corner', ...(process.env.PROMO_HIDE ? process.env.PROMO_HIDE.split(',') : [])].map((q) => 'body.promo-clean ' + q).join(', ');   // PROMO_HIDE=#osd,#drivebar for a cover
await p.addStyleTag({ content: hide + ' { visibility: hidden !important; }' });
for (const [name, ev, T] of shots.filter((s) => !only || only.has(s[0]))) {
  await p.evaluate(([ev, T, clean]) => { document.body.classList.toggle('promo-clean', clean); MC.load(ev); MC.seek(T); }, [ev, T, name.startsWith('open_') || !!process.env.PROMO_CLEAN]);
  await p.waitForTimeout(150);
  await p.screenshot({ path: `${out}/${name}.png` });
}
console.log(shots.length, 'shots'); if (logs.length) console.log(logs.slice(0, 12).join('\n'));
await b.close();
