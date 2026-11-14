// ─────────────────────────────────────────────────────────────────────────────
// Foresight: where the road will be blocked over the next few seconds, and whether a driver can still get through.
// One model, two users. The police use it to plan (js/game.js): before a unit commits to an attack it lays the attack
// over this picture of the road and only goes ahead if a way through is left that a driver has time to see and take.
// The test bot drives by it (tools/bot.mjs). Because both read the same picture, what the police consider "a way out"
// is exactly what the bot can drive.
// The picture is a grid: three lanes by time, in steps of FS_STEP seconds from now. A cell is blocked if the car, in that
// lane at that time, would be overlapping something.
// ─────────────────────────────────────────────────────────────────────────────
import { GAME, ROAD } from './cue.js';
import { NV, VF, T_TAXI, T_BLOCK, T_WEAVE, HALF_W, CAR_HL, CAR_HW, COMMIT, SIDE, STEADY, weave, breathe, gameBase, baseAt, laneV, laneRate, crossing, policeCells, lvOf, blinkAt, moveAt, taxiAtFor } from './game.js';

export const FS_STEP = 0.05;
// g: game state · vel: the car's speed now · opt.horizon: seconds to look ahead (4) · opt.police: include the police's
// committed attacks (default yes)
export function threatGrid(g, vel, opt = {}) {
  const STEP = FS_STEP, horizon = opt.horizon ?? 4, K = Math.round(horizon / STEP);
  const blocked = [new Uint8Array(K + 2), new Uint8Array(K + 2), new Uint8Array(K + 2)];
  // how soon the car can be `d` ahead of where it is relative to a vehicle doing v: at the fastest it will go inside the
  // horizon (the road speed rises with distance); and how late: at the slower of its speed now and its cruising speed
  const base = gameBase(g), vFast = Math.max(vel, baseAt(g.gd + Math.max(vel, base) * horizon)), vSlow = Math.max(1, Math.min(vel, base)), lvNow = lvOf(g);
  for (let i = 0; i < NV; i++) {
    const o = i * VF, type = g.veh[o]; if (!type) continue;
    // ordinary traffic eases a little ahead of and behind its place in the row: plan with that place and allow for the drift
    const ease = type < T_TAXI, drift = ease ? GAME.breathe : 0, lv = laneV(g.veh[o + 1]), v = ease ? g.vt + lv * laneRate(g, vFast) : g.veh[o + 3];
    const dz = g.veh[o + 2] - g.gd - (ease ? breathe(g.veh[o + 8], g.gt) : 0), reach = g.veh[o + 4] + CAR_HL + 0.6 + drift;
    if (vSlow - v <= 0 || dz < -reach) continue;
    let t0 = (dz - reach) / Math.max(1, vFast - v), t1 = (dz + reach) / Math.max(1, vSlow - (ease ? g.vt + lv * laneRate(g, vSlow) : v));
    if (type === T_BLOCK && dz > reach && !(g.veh[o + 5] & STEADY)) {               // step through its braking: it is reached sooner than its speed now suggests
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
    // a vehicle that will steer across a lane (a taxi, a merging car, a cruiser): the lane it is heading for is taken
    // for the whole pass, the lane it leaves only until its move is over
    const cr = crossing(g.veh, o);
    if (cr) {
      // (one already signalling carries its own times; one still to start will use the times of the level then, about those of now)
      const b = g.veh[o + 7], gap = dz - (g.veh[o + 4] + CAR_HL), tSig = b > 0 ? b - g.gt : Math.max(0, (gap - (Math.max(vFast, baseAt(g.gd + 2 * vel)) - g.vt) * taxiAtFor(lvNow)) / Math.max(1, vFast - v));
      const kEnd = Math.ceil((tSig + (b > 0 ? g.veh[o + 9] + g.veh[o + 10] * 0.6 : blinkAt(lvNow) + moveAt(lvNow) * 0.6) + 0.05) / STEP);                     // it is clear of the lane it leaves a little past half-way across
      for (let k = k0; k <= k1; k++) { blocked[cr[1] + 1][k] = 1; if (k <= kEnd) blocked[cr[0] + 1][k] = 1; }
      continue;
    }
    const lf = g.veh[o + 1];
    for (let l = -1; l <= 1; l++) if (Math.abs(lf - l) * ROAD.lane < HALF_W[type] + CAR_HW + 0.3) for (let k = k0; k <= k1; k++) blocked[l + 1][k] = 1;
  }
  const grid = { blocked, K };
  if (opt.police !== false) policeCells(g, (l, t0, t1) => markCells(grid, l, t0, t1));
  return grid;
}
// block lane l from t0 to t1 seconds from now
export function markCells(grid, l, t0, t1) {
  const b = grid.blocked[l + 1], K = grid.K;
  for (let k = Math.max(0, Math.floor(t0 / FS_STEP)); k <= Math.min(K, Math.ceil(t1 / FS_STEP)); k++) b[k] = 1;
}
export function copyGrid(grid) { return { blocked: grid.blocked.map((b) => b.slice()), K: grid.K }; }
// Everything that blocks a lane, made to last n steps longer at either end. The police plan on this wider picture: a way through it is
// a way through with room to spare, so it is still there when things turn out a tenth of a second off the forecast.
export function widen(grid, n) {
  for (const b of grid.blocked) {
    const src = b.slice();
    for (let k = 0; k <= grid.K; k++) if (src[k]) for (let j = Math.max(0, k - n); j <= Math.min(grid.K, k + n); j++) b[j] = 1;
  }
  return grid;
}
// A search over (time, lane): from (k, lane), how long can a driver survive (up to the horizon) and with how few lane changes?
// A lane change takes M steps, during which both lanes must be clear. hold: no lane change may start before this step
// (the time a driver needs to see what is coming and react). pause: after a lane change, this many steps in the new lane
// before the next one may start (nobody dashes across two lanes without a breath between).
export function searcher(grid, M, hold = 0, pause = 0, end = null) {
  const { blocked, K } = grid, memo = new Map();
  const free = (l, k0, k1) => { for (let k = k0; k <= Math.min(K, k1); k++) if (blocked[l + 1][k]) return false; return true; };
  const better = (a, b) => !b || a.reach > b.reach || (a.reach === b.reach && a.moves.length < b.moves.length);
  const go = (k, l) => {
    if (k >= K) return { reach: end === null || l === end ? K : K - 1, moves: [] };       // (end: the lane to finish in, if it matters)
    const key = k * 4 + l + 1;
    if (memo.has(key)) return memo.get(key);
    let res = { reach: k, moves: [] };
    if (!blocked[l + 1][k + 1]) { const r = go(k + 1, l); if (better(r, res)) res = r; }
    if (k >= hold) for (const d of (l === 0 ? [-1, 1] : [-l])) {
      const n = l + d;
      if (!free(l, k, k + M) || !free(n, k, k + M + pause)) continue;
      const r = go(Math.min(K, k + M + pause), n);
      const c = { reach: r.reach, moves: [{ k, d }, ...r.moves] };
      if (better(c, res)) res = c;
    }
    memo.set(key, res);
    return res;
  };
  return { go, free, K };
}
// Is there a way through from `lane`, given react seconds before the first move and tSwitch seconds per lane change?
// → 0 if not; else 1 + the number of lane changes it takes (so 1 = stay where you are)
export function wayThrough(grid, lane, react, tSwitch = 0.34, pause = 0, end = null) {
  const s = searcher(grid, Math.round(tSwitch / FS_STEP), Math.round(react / FS_STEP), Math.round(pause / FS_STEP), end), r = s.go(0, lane);
  return r.reach >= grid.K ? 1 + r.moves.length : 0;
}
