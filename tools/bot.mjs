// A simple driving bot for the game simulation (no browser). It proves that the generated traffic is always
// passable at each gear's base speed, measures how a run unfolds, and can print the event list of a clean run.
//   node tools/bot.mjs                 fairness soak: several seeds, 4 minutes each (add --secs 300 --seeds 16)
//   node tools/bot.mjs --nitro         also fire nitro canisters as they are picked up
//   node tools/bot.mjs --script 68.95  print the events of a clean run (used for the canonical script)
import { Timeline } from '../js/timeline.js';
import { ROAD, TURBO, GAME } from '../js/cue.js';
import { NI, IF } from '../js/game.js';
import { FS_STEP, threatGrid, searcher } from '../js/foresight.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const val = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? +args[i + 1] : d; };

// Look-ahead planner. It reads the same picture of the road as the police do (js/foresight.js): where each lane will be
// blocked over the next seconds. A search over (time, lane) finds a route that stays clear for `horizon` seconds; a lane
// change takes `tSwitch` seconds during which both lanes must be clear.
const STEP = FS_STEP;
export function plan(st, opt, want) {
  const g = st.g, tSwitch = opt.tSwitch ?? 0.3, M = Math.round(tSwitch / STEP);
  const grid = threatGrid(g, st.vel, { horizon: opt.horizon ?? 4 }), { blocked, K } = grid;
  // nothing can touch the car for opt.safe more seconds (the rest of a nitro burst and the grace after it)
  for (let k = 0, n = Math.min(K, Math.floor((opt.safe || 0) / STEP)); k < n; k++) blocked[0][k] = blocked[1][k] = blocked[2][k] = 0;
  const { go, free } = searcher(grid, M);
  const best = go(0, st.lane);
  // a lane worth being in (a nitro canister ahead): go one lane towards it now if the route from there is just as safe
  if (want !== undefined && want !== st.lane && best.reach >= K) {
    const d = want > st.lane ? 1 : -1, n = st.lane + d;
    const r = free(st.lane, 0, M) && free(n, 0, M) ? go(M, n) : null;      // … and does not need a second move straight after
    if (r && r.reach >= K && !(r.moves.length && r.moves[0].k < M + 10)) return { reach: K, moves: [{ k: 0, d }], K };
  }
  // a careful driver makes the first move of the route as early as it is safe, not at the last moment
  if (!opt.late && best.moves.length && best.moves[0].k > 0) {   // opt.late: a daring driver who moves at the last moment (close calls)
    const d = best.moves[0].d, n = st.lane + d;
    if (free(st.lane, 0, M) && free(n, 0, M)) {
      const r = go(M, n);
      // … unless that commits to a second move straight after it (a dash across two lanes with no slack)
      if (r.reach >= best.reach && r.moves.length + 1 <= best.moves.length && !(r.moves.length && r.moves[0].k < M + 10)) return { reach: best.reach, moves: [{ k: 0, d }], K };
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
  let last = 0, nextNitro = 0, gotT = -1;
  const stats = { swipes: 0, stumbles: 0, over: 0, overT: 0, noRoute: 0 };
  for (let T = C + 0.05; T < end; T += STEP) {
    const st = tl.stateAt(T);
    if (st.over) { stats.over = st.over; stats.overT = T - C; break; }
    if (st.g.nstock > 0) { if (gotT < 0) gotT = T; } else gotT = -1;                       // opt.nitroHold: carry a canister this long before firing it
    if (opt.nitro && st.g.nstock > 0 && T - gotT >= (opt.nitroHold || 0) && T > nextNitro && (!opt.nitroAfter || T > opt.nitroAfter)) { add('turbo', T); nextNitro = T + 6; }
    if (opt.idle && T >= opt.idle[0] && T < opt.idle[1]) continue;      // opt.idle: hands off the wheel for a while (to take a hit on purpose)
    const tb = tl.turboAt(T);
    if ((tb && tb.u < TURBO.sustain - 0.3) || T - last < 0.28) continue;   // smash through during the strong part of a nitro burst
    let want;
    if (opt.seek) for (let i = 0; i < NI; i++) { const o = i * IF, dz = st.g.itm[o + 2] - st.g.gd; if (st.g.itm[o] && dz > 12 && dz < 260) want = st.g.itm[o + 1]; }
    const safe = tb ? Math.max(0, TURBO.sustain + TURBO.recover * GAME.nitroTail + GAME.nitroGrace - tb.u - 0.15) : 0;   // coming out of a burst: plan for where it ends
    const r = plan(st, safe ? { ...opt, safe } : opt, want);
    if (r.reach < r.K) stats.noRoute++;
    if (r.moves.length && r.moves[0].k === 0) { add('lane', T, { dir: r.moves[0].d }); last = T; }
  }
  const st = tl.stateAt(Math.min(end, C + (stats.overT || seconds)));
  for (const e of tl.gameEvents(0, end)) { if (e.k === 'swipe') stats.swipes++; if (e.k === 'stumble') stats.stumbles++; }
  return { tl, ev, stats, g: st.g, st };
}

if (process.argv[1].endsWith("bot.mjs") && flag("script")) {
  // the canonical script: full intro, a clean bot drive with a dab of brake and nitro, the four presets, a music pause
  const secs = val('script', 68);
  const extra = [{ type: 'brk', t: 17, on: true }, { type: 'brk', t: 18.2, on: false },
    { type: 'env', t: 34, preset: 1 }, { type: 'env', t: 44, preset: 2 }, { type: 'env', t: 54, preset: 3 }, { type: 'env', t: 64, preset: 0 },
    { type: 'music', t: 70, on: false }, { type: 'music', t: 73, on: true }];
  const r = play(undefined, secs, { intro: true, nitro: true, nitroAfter: 23, nitroHold: 1.5, seek: true, extra, late: flag('late'), tSwitch: 0.34 });
  r.ev.sort((a, b) => a.t - b.t);
  console.log(`// clean: ${!r.stats.over && r.stats.stumbles === 0} · score ${Math.round(r.g.score)}, gear ${r.g.gear + 1}, stars ${r.g.star}, close calls ${r.g.near}, smashed ${r.g.smash}, nitro bursts ${r.tl.nitros(99).length}`);
  console.log(r.ev.map((e) => { const { type, t, ...d } = e; const x = Object.entries(d).map(([k, v]) => `, ${k}: ${JSON.stringify(v)}`).join(''); return `{ type: '${type}', t: ${t}${x} }`; }).join(', '));
} else if (process.argv[1].endsWith("bot.mjs")) {
  const secs = val('secs', 240), n = val('seeds', 12);
  let fails = 0;
  for (let k = 0; k < n; k++) {
    const seed = 1000 + k * 7919;
    const r = play(seed, secs, { nitro: flag('nitro'), seek: flag('nitro') });
    const g = r.g;
    if (r.stats.over || r.stats.stumbles) fails++;
    const ev = r.tl.gameEvents(0, 1e9), cnt = (k) => ev.filter((e) => e.k === k).length;
    console.log(`${r.stats.over || r.stats.stumbles ? 'FAIL' : 'PASS'}  seed ${seed}  ${r.stats.over ? (r.stats.over === 1 ? 'crashed' : 'busted') + ' at ' + r.stats.overT.toFixed(1) + ' s' : 'survived ' + secs + ' s'}  dist ${Math.round(g.gd)} gear ${g.gear + 1} stars ${g.star} score ${Math.round(g.score)} passed ${g.passed} cells ${g.cells} canisters ${cnt('item')} rams ${cnt('ram')} strikes ${cnt('strike')} stumbles ${r.stats.stumbles} noRoute ${r.stats.noRoute}`);
  }
  console.log(fails ? `${fails} of ${n} runs failed` : `all ${n} runs clean`);
}
