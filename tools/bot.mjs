// A simple driving bot for the game simulation (no browser). It proves that the generated traffic is always
// passable at each gear's base speed, measures how a run unfolds, and can print the event list of a clean run.
//   node tools/bot.mjs                 fairness soak: several seeds, 4 minutes each (add --secs 300 --seeds 16)
//   node tools/bot.mjs --nitro         also fire nitro canisters as they are picked up
//   node tools/bot.mjs --script 68.95  print the events of a clean run (used for the canonical script)
import { Timeline } from '../js/timeline.js';
import { ROAD, TURBO, GAME } from '../js/cue.js';
import { NV, VF, NI, IF, T_TAXI, T_BLOCK, T_WEAVE, HALF_W, CAR_HL, CAR_HW, POL_HL, P_TAIL, P_WARN, P_CHARGE, COMMIT, SIDE, weave, breathe, gameBase, laneV, laneRate, crossing } from '../js/game.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const val = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? +args[i + 1] : d; };

// Look-ahead planner. Each vehicle blocks the lanes it covers for the interval in which it overlaps the car
// (constant speeds assumed, except a rolling roadblock, which brakes as we come up to it; a weaving cruiser blocks
// whichever lanes it is over at each moment of the pass). A search over (time, lane) finds a route that stays
// clear for `horizon` seconds; a lane change takes `tSwitch` seconds during which both lanes must be clear.
const STEP = 0.05;
export function plan(st, opt, want) {
  const g = st.g, horizon = opt.horizon ?? 4, K = Math.round(horizon / STEP), tSwitch = opt.tSwitch ?? 0.3, M = Math.round(tSwitch / STEP);
  const blocked = [new Uint8Array(K + 1), new Uint8Array(K + 1), new Uint8Array(K + 1)];
  // how soon the car can be `d` ahead of where it is relative to a vehicle doing v: at the speed it is settling to, and
  // faster once the next gear comes in; and how late: at the slower of its speed now and its cruising speed
  const base = gameBase(g), vFast = Math.max(st.vel, base), vSlow = Math.max(1, Math.min(st.vel, base));
  const nextAt = g.gear < 5 ? (GAME.gearAt[g.gear + 1] - g.gd) / vFast : Infinity, vNext = g.gear < 5 ? GAME.gears[g.gear + 1] : vFast;
  const soonest = (d, v) => { const r = Math.max(1, vFast - v); return d <= 0 ? d / r : d / r <= nextAt ? d / r : nextAt + (d - r * nextAt) / Math.max(1, vNext - v); };
  for (let i = 0; i < NV; i++) {
    const o = i * VF, type = g.veh[o]; if (!type) continue;
    // ordinary traffic eases a little ahead of and behind its place in the row: plan with that place and allow for the drift
    const ease = type < T_TAXI, drift = ease ? GAME.breathe : 0, lv = laneV(g.veh[o + 1]), v = ease ? g.vt + lv * laneRate(g, vFast) : g.veh[o + 3];
    const dz = g.veh[o + 2] - g.gd - (ease ? breathe(g.veh[o + 8], g.gt) : 0), reach = g.veh[o + 4] + CAR_HL + 0.6 + drift;
    if (vSlow - v <= 0 || dz < -reach) continue;
    let t0 = soonest(dz - reach, v), t1 = (dz + reach) / Math.max(1, vSlow - (ease ? g.vt + lv * laneRate(g, vSlow) : v));
    if (type === T_BLOCK && dz > reach) {               // step through its braking: it is reached sooner than its speed now suggests
      let z = dz, vb = v, t = 0; const h = 0.01, vL = g.vt + lv * laneRate(g, vFast), relT = Math.max(1, vFast - g.vt);
      for (; t < horizon + 1 && z > reach; t += h) {
        const gap = z - (reach - 0.6), tv = vL - (gap > 0 && gap < relT * GAME.blockAt ? GAME.blockSlow : 0);
        vb += Math.max(-GAME.blockDecel * h, Math.min(GAME.blockDecel * h, tv - vb)); z -= (vFast - vb) * h;
      }
      t0 = Math.min(t0, t); t1 = Math.max(t1, t + 2 * reach / Math.max(1, vSlow - vL));
    }
    if (t0 > horizon) continue;
    const k0 = Math.max(0, Math.floor(t0 / STEP)), k1 = Math.min(K, Math.ceil(t1 / STEP));
    if (type === T_WEAVE) {
      // follow it step by step, as the simulation moves it: weaving until we are weaveLock from it, then onto the lane it picked
      let x = g.veh[o + 1], xv = g.veh[o + 7], fl = g.veh[o + 5], z = dz;
      const a = g.veh[o + 6], W = GAME.weaveSnap, h = 0.01, hl = g.veh[o + 4] + CAR_HL, relT = Math.max(1, vFast - g.vt), n = Math.round(STEP / h);
      for (let k = 0; k <= k1; k++) {
        if (k >= k0 - 1) for (let l = -1; l <= 1; l++) if (Math.abs(x - l) * ROAD.lane < HALF_W[type] + CAR_HW + 0.3) { blocked[l + 1][k] = 1; if (k > 0) blocked[l + 1][k - 1] = 1; if (k < K) blocked[l + 1][k + 1] = 1; }
        for (let j = 0; j < n; j++) {
          const t = k * STEP + j * h;
          if (fl & COMMIT) { const tgt = fl & SIDE ? a : 0; xv += (W * W * (tgt - x) - 2 * W * xv) * h; x += xv * h; }
          else {
            const ph = g.gt + t + g.veh[o + 7]; x = a * weave(ph);
            if (z - hl < relT * GAME.weaveLock) { const vv = weave(ph, 1); fl |= COMMIT | ((vv !== 0 ? vv > 0 : weave(ph) > 0.5) ? SIDE : 0); xv = a * vv; }
          }
          z -= (vFast - v) * h;
        }
      }
      continue;
    }
    const cover = [];
    const lf = g.veh[o + 1];
    for (let l = -1; l <= 1; l++) if (Math.abs(lf - l) * ROAD.lane < HALF_W[type] + CAR_HW + 0.3) cover.push(l);
    // a vehicle that will steer across a lane (a taxi, a cruiser of a rolling roadblock): the lane it is heading for is taken
    // for the whole pass, the lane it leaves only until its move is over
    const cr = crossing(g.veh, o); let kEnd = K;
    if (cr) {
      const b = g.veh[o + 7], gap = dz - (g.veh[o + 4] + CAR_HL), tSig = b > 0 ? b - g.gt : Math.max(0, (gap - (vFast - g.vt) * GAME.taxiAt) / Math.max(1, vFast - v));
      kEnd = Math.ceil((tSig + GAME.taxiBlink + GAME.taxiMove + 0.1) / STEP);
      for (let k = k0; k <= k1; k++) { blocked[cr[1] + 1][k] = 1; if (k <= kEnd) blocked[cr[0] + 1][k] = 1; }
      continue;
    }
    for (const l of cover) for (let k = k0; k <= k1; k++) blocked[l + 1][k] = 1;
  }
  // the police: a ramming pursuit car takes its lane from the end of the warning until it has dropped back;
  // a drone strike takes its lane for the length of the strike
  const mark = (l, t0, t1) => { for (let k = Math.max(0, Math.floor(t0 / STEP)); k <= Math.min(K, Math.ceil(t1 / STEP)); k++) blocked[l + 1][k] = 1; };
  const reachP = POL_HL + CAR_HL + 0.8, tBack = (1.5 + reachP) / GAME.ramBack + 0.2;   // time the pursuit car needs to drop clear
  if (g.polM === P_WARN) { const left = GAME.ramWarn - (g.gt - g.polT); mark(g.polLane, left + 0.05, left + (GAME.polClose + 3.5) / GAME.ramV + tBack); }
  else if (g.polM === P_CHARGE) mark(g.polLane, 0, (1.5 - g.polZ) / GAME.ramV + tBack);
  else if (g.polM !== P_TAIL && g.polZ > -reachP) mark(g.polLane, 0, (g.polZ + reachP) / GAME.ramBack + 0.15);
  if (g.drT >= 0) { const u = g.gt - g.drT; mark(g.drLane, GAME.drWarn - u - 0.1, GAME.drWarn + GAME.drStrike - u + 0.05); }
  // nothing can touch the car for opt.safe more seconds (the rest of a nitro burst and the grace after it)
  for (let k = 0, n = Math.min(K, Math.floor((opt.safe || 0) / STEP)); k < n; k++) blocked[0][k] = blocked[1][k] = blocked[2][k] = 0;
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
