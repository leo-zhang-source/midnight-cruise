// Development aid: finds moments worth looking at (grappler run, searchlight lock, roadblock, rewind, home …) by
// letting the bot drive, then captures them from the browser.
//   node tools/scenes.mjs <outDir> [WxH] [seed] [only]     only: capture just the shots whose name starts with this
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { play } from './bot.mjs';
import { Timeline } from '../js/timeline.js';
import { NV, VF, T_TAXI, T_BLOCK, T_WEAVE, COMMIT } from '../js/game.js';
import { GAME } from '../js/cue.js';

const [out = 'renders/scenes', size = '1280x720', seedArg = '1000', only = ''] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number), seed = +seedArg;
mkdirSync(out, { recursive: true });

const r = play(seed, 200, { nitro: false });
const gev = r.tl.gameEvents(0, 1e9), first = (k, after = 0) => gev.find((e) => e.k === k && e.t > after);
const shots = [];
const clean = r.ev;
const upTo = (t) => clean.filter((e) => e.t <= t);
shots.push(['intro_0_5', clean, 1.9 + 0.5], ['intro_1_2', clean, 1.9 + 1.2], ['intro_2_0', clean, 1.9 + 2.0], ['intro_2_6', clean, 1.9 + 2.6]);
const item = first('item'); if (item) shots.push(['canister', clean, item.t - 0.7]);
const rw = first('ramwarn'); if (rw) shots.push(['grappler', clean, rw.t + 0.8], ['grappler_miss', clean, rw.t + 1.3]);
shots.push(['traffic_a', clean, 12], ['traffic_b', clean, 21.5], ['traffic_c', clean, 27]);
const lk = first('lock'); if (lk) shots.push(['heli_search', clean, lk.t - 1.5], ['heli_lock', clean, lk.t + 0.8], ['heli_fire', clean, lk.t + 1.4]);
const s3 = gev.find((e) => e.k === 'star' && e.n === 3); if (s3) shots.push(['heli_in_a', clean, s3.t + 0.5], ['heli_in_b', clean, s3.t + 1.0], ['heli_in_c', clean, s3.t + 1.7], ['heli', clean, s3.t + 3]);
// the first vehicle (by id) that satisfies `test` at some moment: when(test) → [T, id] or null
const when = (test, from = 6, id = 0) => { for (let T = from; T < 200; T += 0.02) { const g = r.tl.stateAt(T).g; for (let i = 0; i < NV; i++) { const o = i * VF; if (g.veh[o] && (!id || g.veh[o + 8] === id) && test(g.veh, o, g.veh[o + 2] - g.gd, g)) return [T, g.veh[o + 8]]; } } return null; };
// a taxi steering across a lane: early, half-way, straightening up
{ const m = (v, o, g) => (g.gt - v[o + 7] - GAME.taxiBlink) / GAME.taxiMove, cut = (lo) => (v, o, dz, g) => v[o] === T_TAXI && v[o + 6] !== 0 && v[o + 7] > 0 && m(v, o, g) > lo;
  const a = when(cut(0.3)); if (a) { shots.push(['taxi_cut_a', clean, a[0]]); const b = when(cut(0.5), a[0], a[1]), c = when(cut(0.8), a[0], a[1]); if (b) shots.push(['taxi_cut_b', clean, b[0]]); if (c) shots.push(['taxi_cut_c', clean, c[0]]); } }
// a rolling roadblock: far off, and on the brakes as we come up
{ const a = when((v, o, dz) => v[o] === T_BLOCK && (v[o + 5] & 256) && v[o + 6] === 0 && v[o + 7] === 0 && dz < 85 && dz > 40, 20); if (a) { shots.push(['block_far', clean, a[0]]); const b = when((v, o, dz) => dz < 26, a[0], a[1]); if (b) shots.push(['block_near', clean, b[0]]); } }
// a rolling roadblock in which one cruiser crosses into the open lane: signalling, half-way, done
{ const m = (v, o, g) => (g.gt - v[o + 7] - GAME.taxiBlink) / GAME.taxiMove, a = when((v, o, dz, g) => v[o] === T_BLOCK && v[o + 6] !== 0 && v[o + 7] > 0 && m(v, o, g) > -0.5, 20);
  if (a) { shots.push(['shift_a', clean, a[0]]); const b = when((v, o, dz, g) => v[o + 7] > 0 && m(v, o, g) > 0.5, a[0], a[1]), c = when((v, o) => v[o + 7] < 0, a[0], a[1]); if (b) shots.push(['shift_b', clean, b[0]]); if (c) shots.push(['shift_c', clean, c[0] + 0.15]); } }
// a weaving cruiser: mid-swing, just after it has picked its lane, and as we pass it
{ const a = when((v, o, dz, g) => v[o] === T_WEAVE && dz < 130 && !(v[o + 5] & COMMIT) && Math.abs(v[o + 1]) > 0.35 && Math.abs(v[o + 1]) < 0.65, 20);
  if (a) { shots.push(['weave_a', clean, a[0]]); const b = when((v, o) => v[o + 5] & COMMIT, a[0], a[1]); if (b) shots.push(['weave_b', clean, b[0] + 0.25]); const c = when((v, o, dz) => dz < 16, a[0], a[1]); if (c) shots.push(['weave_c', clean, c[0]]); } }
const mod = (a, n) => ((a % n) + n) % n;
if (s3) for (let T = s3.t + 4, k = 0; T < 200 && k < 3; T += 0.02) {             // the helicopter lifting over a sign gantry
  const d = Math.min(mod(1500 - r.tl.stateAt(T).pos, 4800), mod(3900 - r.tl.stateAt(T).pos, 4800));
  if (d < [130, 62, 20][k] && d > 5) shots.push(['heli_gantry_' + 'abc'[k++], clean, T]);
}
for (let T = 6, sg = 0; T < 200 && !sg; T += 0.05) {             // a roadside sign coming up
  const pos = r.tl.stateAt(T).pos;
  if (!sg && Math.abs(mod(1100 - pos, 4800) - 75) < 4) { shots.push(['roadsign', clean, T]); sg = 1; }
}
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
  if (st0) shots.push(['hooked', ev, st0 + 0.35], ['on_tail', ev, st0 + 2.6]);
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
for (const [name, ev, T] of shots.filter((s) => s[0].startsWith(only))) {
  await p.evaluate(([ev, T]) => { MC.load(ev); MC.seek(T); }, [ev, T]);
  await p.waitForTimeout(120);
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log(name.padEnd(14), 'T', T.toFixed(2));
}
if (logs.length) console.log(logs.slice(0, 12).join('\n'));
await b.close();
