// Development aid: finds moments worth looking at (ram warning, drone lock, roadblock, busted, rewind, home …) by
// letting the bot drive, then captures them from the browser.
//   node tools/scenes.mjs <outDir> [WxH] [seed]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { play } from './bot.mjs';
import { Timeline } from '../js/timeline.js';
import { NV, VF, T_BLOCK } from '../js/game.js';

const [out = 'renders/scenes', size = '1280x720', seedArg = '1000'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number), seed = +seedArg;
mkdirSync(out, { recursive: true });

const r = play(seed, 200, { nitro: false });
const gev = r.tl.gameEvents(0, 1e9), first = (k, after = 0) => gev.find((e) => e.k === k && e.t > after);
const shots = [];
const clean = r.ev;
const upTo = (t) => clean.filter((e) => e.t <= t);
shots.push(['intro_0_5', clean, 1.9 + 0.5], ['intro_1_2', clean, 1.9 + 1.2], ['intro_2_0', clean, 1.9 + 2.0], ['intro_2_6', clean, 1.9 + 2.6]);
const item = first('item'); if (item) shots.push(['canister', clean, item.t - 0.7]);
const rw = first('ramwarn'); if (rw) shots.push(['ramwarn', clean, rw.t + 0.7], ['ram_pass', clean, rw.t + 1.5]);
const lk = first('lock'); if (lk) shots.push(['drone_lock', clean, lk.t + 0.8], ['drone_strike', clean, lk.t + 1.35]);
const s3 = gev.find((e) => e.k === 'star' && e.n === 3); if (s3) shots.push(['heli', clean, s3.t + 3]);
// a roadblock in view
for (let T = 20; T < 200; T += 0.5) {
  const st = r.tl.stateAt(T); let hit = 0;
  for (let i = 0; i < NV; i++) { const o = i * VF; if (st.g.veh[o] === T_BLOCK) { const dz = st.g.veh[o + 2] - st.g.gd; if (dz > 25 && dz < 45) hit = 1; } }
  if (hit) { shots.push(['roadblock', clean, T]); break; }
}
// a roadblock close by, a sign gantry and a billboard coming up
for (let T = 20; T < 200; T += 0.1) {
  const st = r.tl.stateAt(T); let hit = 0;
  for (let i = 0; i < NV; i++) { const o = i * VF; if (st.g.veh[o] === T_BLOCK) { const dz = st.g.veh[o + 2] - st.g.gd; if (dz > 9 && dz < 14) hit = 1; } }
  if (hit) { shots.push(['roadblock_near', clean, T]); break; }
}
const mod = (a, n) => ((a % n) + n) % n;
for (let T = 6, g = 0, bb = 0; T < 200 && !(g && bb); T += 0.05) {
  const pos = r.tl.stateAt(T).pos;
  if (!g && Math.abs(mod(1500 - pos, 4800) - 75) < 4) { shots.push(['gantry', clean, T]); g = 1; }
  if (!bb && T > 30 && Math.abs(mod(2300 - pos, 4800) - 110) < 4) { shots.push(['billboard', clean, T]); bb = 1; }
}
// rammed (no dodge) → police on the tail → crash → EJECT panel → rewind → pause menu → home
if (rw) {
  const ev = upTo(rw.t + 0.05), tl = new Timeline(); tl.load(ev);
  let over = 0, st0 = null;
  for (let T = rw.t; T < rw.t + 40; T += 0.05) { const st = tl.stateAt(T); if (!st0 && tl.gameEvents(rw.t, T).some((e) => e.k === 'stumble')) st0 = T; if (st.over) { over = T; break; } }
  if (st0) shots.push(['on_tail', ev, st0 + 1.2]);
  if (over) {
    shots.push(['over', ev, over + 1.2]);
    const ev2 = [...ev, { type: 'revive', t: over + 1.5 }];
    shots.push(['rewind_a', ev2, over + 1.5 + 0.35], ['rewind_b', ev2, over + 1.5 + 0.9], ['after_rewind', ev2, over + 1.5 + 1.6]);
    const ev3 = [...ev, { type: 'home', t: over + 2 }];
    shots.push(['home_a', ev3, over + 2.25], ['home', ev3, over + 4]);
    const ev4 = [...ev3, { type: 'start', t: over + 5 }];
    shots.push(['run2_ff', ev4, over + 5.2], ['run2_intro', ev4, over + 5.4 + 0.9]);
  }
}
const pz = [...upTo(30), { type: 'pause', t: 30, on: true }];
shots.push(['paused', pz, 31.5]);

const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const logs = [];
p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await p.goto(`http://localhost:8086/?capture=1&w=${w}&h=${h}&t=0.5&tier=0`);
await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
for (const [name, ev, T] of shots) {
  await p.evaluate(([ev, T]) => { MC.load(ev); MC.seek(T); }, [ev, T]);
  await p.waitForTimeout(120);
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log(name.padEnd(14), 'T', T.toFixed(2));
}
if (logs.length) console.log(logs.slice(0, 12).join('\n'));
await b.close();
