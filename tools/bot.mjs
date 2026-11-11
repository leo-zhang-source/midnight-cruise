// A simple driving bot for the game simulation (no browser). It proves that the generated traffic is always
// passable at each gear's base speed, measures how a run unfolds, and can print the event list of a clean run.
//   node tools/bot.mjs                 fairness soak: several seeds, 4 minutes each, without DRIVE
//   node tools/bot.mjs --drive         same with DRIVE held (not guaranteed fair: this is the risk/reward mode)
//   node tools/bot.mjs --script 70     print the events of a clean 70 s run (used for the canonical script)
import { Timeline } from '../js/timeline.js';
import { ROAD, TURBO } from '../js/cue.js';
import { NV, VF, T_TAXI, HALF_W, CAR_HL, CAR_HW } from '../js/game.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const val = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? +args[i + 1] : d; };

// Look-ahead planner. Each vehicle blocks the lanes it covers for the interval in which it overlaps the car
// (constant speeds assumed). A search over (time, lane) finds a route that stays clear for `horizon` seconds;
// a lane change takes `tSwitch` seconds during which both lanes must be clear.
const STEP = 0.05;
function plan(st, opt) {
  const g = st.g, horizon = opt.horizon ?? 4, K = Math.round(horizon / STEP), tSwitch = opt.tSwitch ?? 0.3, M = Math.round(tSwitch / STEP);
  const blocked = [new Uint8Array(K + 1), new Uint8Array(K + 1), new Uint8Array(K + 1)];
  for (let i = 0; i < NV; i++) {
    const o = i * VF, type = g.veh[o]; if (!type) continue;
    const dz = g.veh[o + 2] - g.gd, reach = g.veh[o + 4] + CAR_HL + 0.6, rel = st.vel - g.veh[o + 3];
    if (rel <= 0 || dz < -reach) continue;
    const t0 = (dz - reach) / rel, t1 = (dz + reach) / rel;
    if (t0 > horizon) continue;
    const cover = [];
    const lf = g.veh[o + 1];
    for (let l = -1; l <= 1; l++) if (Math.abs(lf - l) * ROAD.lane < HALF_W[type] + CAR_HW + 0.3) cover.push(l);
    if (type === T_TAXI && g.veh[o + 6] !== 0) { for (const l of [0, g.veh[o + 6]]) if (!cover.includes(l)) cover.push(l); }
    const k0 = Math.max(0, Math.floor(t0 / STEP)), k1 = Math.min(K, Math.ceil(t1 / STEP));
    for (const l of cover) for (let k = k0; k <= k1; k++) blocked[l + 1][k] = 1;
  }
  // Search with memo: from (k, lane), how long can we survive (up to the horizon) and with how few lane changes?
  const memo = new Map();
  const free = (l, k0, k1) => { for (let k = k0; k <= Math.min(K, k1); k++) if (blocked[l + 1][k]) return false; return true; };
  const better = (a, b) => !b || a.reach > b.reach || (a.reach === b.reach && a.moves.length < b.moves.length);
  const go = (k, l) => {
    if (k >= K) return { reach: K, moves: [] };
    const key = k * 4 + l + 1;
    if (memo.has(key)) return memo.get(key);
    let res = { reach: k, moves: [] };
    if (!blocked[l + 1][k + 1]) { const r = go(k + 1, l); if (better(r, res)) res = r; }
    for (const d of (l === 0 ? [-1, 1] : [-l])) {
      const n = l + d;
      if (!free(l, k, k + M) || !free(n, k, k + M)) continue;
      const r = go(k + M, n);
      const c = { reach: r.reach, moves: [{ k, d }, ...r.moves] };
      if (better(c, res)) res = c;
    }
    memo.set(key, res);
    return res;
  };
  const best = go(0, st.lane);
  // a careful driver makes the first move of the route as early as it is safe, not at the last moment
  if (!opt.late && best.moves.length && best.moves[0].k > 0) {   // opt.late: a daring driver who moves at the last moment (close calls)
    const d = best.moves[0].d, n = st.lane + d;
    if (free(st.lane, 0, M) && free(n, 0, M)) {
      const r = go(M, n);
      if (r.reach >= best.reach && r.moves.length + 1 <= best.moves.length) return { reach: best.reach, moves: [{ k: 0, d }], K };
    }
  }
  return { ...best, K };
}

export function play(seed, seconds, opt = {}) {
  const tl = new Timeline();
  // opt.intro: play the full 10 s ignition (cruise at 11 s) instead of skipping it; opt.extra: other events to weave in
  const C = opt.intro ? 11 : 1.9, end = C + seconds, ev = [];
  const add = (type, t, data = {}) => { tl.add(type, t, data); ev.push({ type, t: +t.toFixed(3), ...data }); };
  add('start', 1, seed === undefined ? {} : { seed }); if (!opt.intro) add('skip', 1.5);
  for (const e of opt.extra || []) { const { type, t, ...d } = e; add(type, t, d); }
  if (opt.drive) add('thr', C + 2, { on: true });
  let last = 0, nextNitro = 0;
  const stats = { swipes: 0, over: 0, overT: 0, noRoute: 0 };
  for (let T = C + 0.05; T < end; T += STEP) {
    const st = tl.stateAt(T);
    if (st.over) { stats.over = st.over; stats.overT = T - C; break; }
    if (opt.nitro && st.g.nitro >= 1 && T > nextNitro && (!opt.nitroAfter || T > opt.nitroAfter)) { add('turbo', T); nextNitro = T + 6; }
    const tb = tl.turboAt(T);
    if ((tb && tb.u < TURBO.sustain - 0.3) || T - last < 0.28) continue;   // smash through during the strong part of a nitro burst
    const r = plan(st, opt);
    if (r.reach < r.K) stats.noRoute++;
    if (r.moves.length && r.moves[0].k === 0) { add('lane', T, { dir: r.moves[0].d }); last = T; }
  }
  const st = tl.stateAt(Math.min(end, C + (stats.overT || seconds)));
  for (const e of tl.gameEvents(0, end)) { if (e.k === 'swipe') stats.swipes++; }
  return { tl, ev, stats, g: st.g, st };
}

if (process.argv[1].endsWith("bot.mjs") && flag("script")) {
  // the canonical script: full intro, a clean bot drive with DRIVE and nitro, the four presets, a music pause
  const secs = val('script', 68);
  const extra = [{ type: 'thr', t: 17, on: true }, { type: 'thr', t: 20.5, on: false }, { type: 'thr', t: 40, on: true }, { type: 'thr', t: 45, on: false },
    { type: 'env', t: 34, preset: 1 }, { type: 'env', t: 44, preset: 2 }, { type: 'env', t: 54, preset: 3 }, { type: 'env', t: 64, preset: 0 },
    { type: 'music', t: 70, on: false }, { type: 'music', t: 73, on: true }];
  const r = play(undefined, secs, { intro: true, nitro: true, nitroAfter: 23, extra, late: flag('late'), tSwitch: 0.34 });
  r.ev.sort((a, b) => a.t - b.t);
  console.log(`// clean: ${!r.stats.over && r.stats.swipes === 0} · score ${Math.round(r.g.score)}, gear ${r.g.gear + 1}, close calls ${r.g.near}, smashed ${r.g.smash}, nitro bursts ${r.tl.nitros(99).length}`);
  console.log(r.ev.map((e) => { const { type, t, ...d } = e; const x = Object.entries(d).map(([k, v]) => `, ${k}: ${JSON.stringify(v)}`).join(''); return `{ type: '${type}', t: ${t}${x} }`; }).join(', '));
} else if (process.argv[1].endsWith("bot.mjs")) {
  const secs = val('secs', 240), n = val('seeds', 12);
  let fails = 0;
  for (let k = 0; k < n; k++) {
    const seed = 1000 + k * 7919;
    const r = play(seed, secs, { drive: flag('drive'), nitro: flag('nitro') });
    const g = r.g;
    if (r.stats.over || r.stats.swipes) fails++;
    console.log(`${r.stats.over || r.stats.swipes ? 'FAIL' : 'PASS'}  seed ${seed}  ${r.stats.over ? (r.stats.over === 1 ? 'crashed' : 'busted') + ' at ' + r.stats.overT.toFixed(1) + ' s' : 'survived ' + secs + ' s'}  dist ${Math.round(g.gd)} gear ${g.gear + 1} score ${Math.round(g.score)} near ${g.near} passed ${g.passed} cells ${g.cells} swipes ${r.stats.swipes} noRoute ${r.stats.noRoute}`);
  }
  console.log(fails ? `${fails} of ${n} runs failed` : `all ${n} runs clean`);
}
