// ─────────────────────────────────────────────────────────────────────────────
// The game simulation: highway traffic, pickups, collisions, score, and the police.
// Pure and deterministic: stepGame(g, input, out) advances the state object `g` by one fixed step.
// No DOM, no three.js — it runs on the main thread, in the AudioWorklet and in Node (tools/bot.mjs).
// Coordinates: z runs along the road, the player's car is at z = g.gd; x = lane × ROAD.lane.
// ─────────────────────────────────────────────────────────────────────────────
import { GAME, ROAD } from './cue.js';

export const NV = 28, VF = 9;      // vehicle pool: [type, lane, z, v, halfLen, flags, a, b, id]
export const NC = 16, CF = 5;      // cell lines:   [count, lane, z0, spacing, takenMask]
export const NI = 4, IF = 3;       // nitro canisters: [active, lane, z]
// T_BLOCK: a cruiser of a rolling roadblock · T_WEAVE: a cruiser weaving between the middle lane and one side
export const T_CAR = 1, T_VAN = 2, T_TRUCK = 3, T_TAXI = 4, T_BLOCK = 5, T_WEAVE = 6;
export const HALF_L = [0, 2.4, 2.75, 6.2, 2.4, 2.4, 2.4];
export const HALF_W = [0, 1.05, 1.15, 1.4, 1.05, 1.05, 1.05];
export const CAR_HL = 2.2, CAR_HW = 0.95;
export const POL_HL = 2.4, POL_HW = 1.05;                  // the pursuit car
// pursuit car modes: on the tail, lining up with the grappler out, lunging, dropping back, hooked onto our rear wheel
export const P_TAIL = 0, P_WARN = 1, P_CHARGE = 2, P_BACK = 3, P_HOOK = 4;
// the grappler (a net on a fork ahead of the cruiser's bumper) reaches our rear wheel at this distance, within this offset
export const HOOK_Z = POL_HL + CAR_HL + 1.25, HOOK_W = 1.7;
const LAT = 1, LON = 2, THREAT = 4, NEAR = 8, PASSED = 16, WARNED = 32;
export const COMMIT = 64, SIDE = 128;      // a weaving cruiser has picked its lane (SIDE: the side lane, else the middle)
const ANN = 256;                           // the cruiser of a rolling roadblock that announces it
// A vehicle that will steer across one lane as we close in (a taxi; a cruiser of a rolling roadblock): a = which way,
// b = when it began to signal (0: not yet; negative: when it finished), and the lane it starts from is kept in its flags.
export const fromLane = (fl) => ((fl >> 9) & 3) - 1;
const crosses = (veh, o) => (veh[o] === T_TAXI || veh[o] === T_BLOCK) && veh[o + 6] !== 0;
// the lanes it takes up between now and the end of its move, or null
export const crossing = (veh, o) => (crosses(veh, o) ? [fromLane(veh[o + 5]), fromLane(veh[o + 5]) + veh[o + 6]] : null);
// A lane change the way a car steers it: m = 0..1 through the move → 0..1 across the lane, with no sideways speed or
// acceleration at either end (a sine ramp). sCurveD is its slope, sCurveA its curvature.
const TAU = Math.PI * 2;
export const sCurve = (m) => (m <= 0 ? 0 : m >= 1 ? 1 : m - Math.sin(TAU * m) / TAU);
export const sCurveD = (m) => (m <= 0 || m >= 1 ? 0 : 1 - Math.cos(TAU * m));
export const sCurveA = (m) => (m <= 0 || m >= 1 ? 0 : TAU * Math.sin(TAU * m));
// The weaving cruiser, t seconds into its cycle: 0 = in the middle lane, 1 = in the side lane. k: 0 position, 1 speed (per s), 2 acceleration.
export function weave(t, k = 0) {
  const D = GAME.weaveHold, M = GAME.weaveMove, P = 2 * (D + M); let u = t % P; if (u < 0) u += P;
  let m, s = 1;
  if (u < D) return 0; else if (u < D + M) m = (u - D) / M; else if (u < 2 * D + M) return k ? 0 : 1; else { m = (u - 2 * D - M) / M; s = -1; }
  return k === 0 ? (s > 0 ? sCurve(m) : 1 - sCurve(m)) : k === 1 ? s * sCurveD(m) / M : s * sCurveA(m) / (M * M);
}
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function freshGame(seed = 1986, free = 0) {
  return {
    seed, free: free ? 1 : 0, rs: seed | 0, gt: 0, gd: 0,
    veh: new Float64Array(NV * VF), cel: new Float64Array(NC * CF), itm: new Float64Array(NI * IF), nid: 1,
    genU: GAME.firstRow, genI: 0, path: 0, lastPat: 0, mid: 0, itmNext: GAME.nitroFirst,
    vt: GAME.trafficK * GAME.gears[0], tr: 0,                                         // the traffic's speed now, and how far it has carried the rows
    score: 0, cells: 0, combo: 0, best: 0, near: 0, smash: 0, passed: 0, vmax: 0, starMax: 1, gear: 0,
    nstock: free ? 1 : 0, nfree: 0,
    heat: 1, heatGt: -1e9, star: 1, coolT: 0, coolN: 0,                              // nitro has cooled the heat by coolN stars until coolT
    lives: 2, nz: 0,                                                                 // lives left (1 = the pursuit car is on our tail until nitro shakes it off); nitro was on last step
    pcl: 0, stG: 0, slow: 0, brkAcc: 0,                                              // tail-close until (lingering on the brake), stumble grace until, slowed until
    polM: P_TAIL, polT: 0, polLane: 0, polZ: -GAME.polClose, polX: 0, polF: 0, ramNext: GAME.ramFirst,
    drT: -1, drLane: 0, drHit: 0, drS: 0, drAcc: 0, drNext: 0,                      // helicopter: lock time (−1 = searching), locked lane, …
    hx: 0, sx: 0, sk: 0, ha: 0, hb: 0,                                               // helicopter x, searchlight spot x, how locked the light is (0..1), how far it has arrived (0..1), its bank
    inv: 0, draft: 0, draftEv: -1e9, goEv: 0, blkEv: -1e9, over: 0,
  };
}
export function copyGame(g) { const c = { ...g }; c.veh = g.veh.slice(); c.cel = g.cel.slice(); c.itm = g.itm.slice(); return c; }
export const gameMult = (g) => (1 + Math.min(g.combo, GAME.comboCap) * GAME.comboStep) * (1 + GAME.starBonus * (g.star - 1));
export const gameBase = (g) => GAME.gears[g.gear] + Math.min(GAME.creep[1], Math.max(0, g.gd - GAME.gearAt[5]) / GAME.creep[0]);
// is the pursuit car on the tail right now (opening of a run, after a stumble, or after lingering on the brake)?
export const policeClose = (g) => g.gt < GAME.introClose || g.gt < g.pcl || g.lives < 2;

function rnd(g) {
  let t = (g.rs = (g.rs + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// Nobody holds a speed exactly: a car, van or truck drifts up to GAME.breathe ahead of and behind its place in the row,
// each in its own time (a period of 6 to 10 s). k = 0: that offset, k = 1: its rate of change.
export function breathe(id, gt, k = 0) { const w = 0.6 + 0.07 * (id % 7), p = w * gt + id * 2.4; return GAME.breathe * (k ? w * Math.cos(p) : Math.sin(p)); }
// how much faster than the middle lane a vehicle in `lane` drives while we cruise (lanes: −1 left, 0, +1 right) …
export const laneV = (lane) => -lane * GAME.laneDv;
// … and by how much that is scaled at the speed we are doing: in step with how fast we close on the traffic (1 at cruising speed)
export const laneRate = (g, vel) => clamp((vel - g.vt) / Math.max(1, gameBase(g) - g.vt), 0, 3);
// u: a row's position in the traffic frame, which moves at the middle lane's speed: z = u + g.tr. A vehicle in a faster or
// slower lane (mean lane `lm`) starts behind or ahead of its row by what it will gain or lose before we get there.
function spawn(g, type, lane, u, a = 0, b = 0, lm = lane) {
  const veh = g.veh, eta = Math.max(0, (u + g.tr - g.gd) / Math.max(1, gameBase(g) - g.vt));
  for (let i = 0; i < NV; i++) {
    const o = i * VF; if (veh[o]) continue;
    veh[o] = type; veh[o + 1] = lane; veh[o + 2] = u + g.tr - laneV(lm) * eta; veh[o + 3] = g.vt + laneV(lane); veh[o + 4] = HALF_L[type];
    veh[o + 5] = (Math.round(lane) + 1) << 9; veh[o + 6] = a; veh[o + 7] = b; veh[o + 8] = g.nid++;
    if (type < T_TAXI) veh[o + 2] += breathe(veh[o + 8], g.gt);
    return i;
  }
  return -1;
}
function cellLine(g, lane, u0, n, sp) {
  const cel = g.cel;
  for (let i = 0; i < NC; i++) {
    const o = i * CF; if (cel[o]) continue;
    cel[o] = n; cel[o + 1] = lane; cel[o + 2] = u0 + g.tr; cel[o + 3] = sp; cel[o + 4] = 0;
    return;
  }
}
function canister(g, lane, u) {
  const itm = g.itm;
  for (let i = 0; i < NI; i++) { const o = i * IF; if (itm[o]) continue; itm[o] = 1; itm[o + 1] = lane; itm[o + 2] = u + g.tr; return; }
}

// One row of traffic at u = g.genU. `g.path` is a lane the previous row left open; every row leaves a lane
// open within one lane of it, so a route through always exists at the gear's cruising speed.
function genRow(g) {
  const G = GAME, gear = g.gear, u = g.genU, p = g.path, i = g.genI++;
  const w = gameBase(g) * (1 - G.trafficK), room = 2 * G.stagger[1];   // closing speed at cruise; room for the stagger of this row and the next
  const tg = G.rowGap[0] + (G.rowGap[1] - G.rowGap[0]) * (gear / 5);
  const side = () => (rnd(g) < 0.5 ? -1 : 1);
  const adj = (l) => (l === 0 ? side() : 0);                 // a lane next to l
  const third = (a, b) => -(a + b);                           // the lane that is neither a nor b (lanes sum to 0)
  const block = i >= 3 && rnd(g) < G.blockP[g.star];          // police ahead instead of traffic: a rolling roadblock or a weaving cruiser
  const weaver = block && rnd(g) < G.weaveP[g.star];
  let len = 5, first = 1, sgn = side();
  // nobody drives exactly abreast: each vehicle of a row sits a little ahead of or behind the row's line, alternately
  const off = (range) => { sgn = -sgn; return sgn * (range[0] + rnd(g) * (range[1] - range[0])); };
  const put = (lane, cross = 0) => {
    if (block) { const k = spawn(g, T_BLOCK, lane, u + off(G.echelon), cross, 0); if (first && k >= 0) g.veh[k * VF + 5] |= ANN; first = 0; return; }
    const r = rnd(g), type = r < 0.46 ? T_CAR : r < 0.72 ? T_VAN : T_TRUCK;
    if (type === T_TRUCK) len = 12.4;
    spawn(g, type, lane, u + off(G.stagger));
  };
  let f = p, pat;

  const r = rnd(g);
  const wConvoy = 0.10 + 0.05 * gear, wGate = 0.08 + 0.02 * gear, wTaxi = gear >= 1 && !block ? 0.14 : 0, wRest = 0.06;
  const wSingle = 0.40, wDecoy = 0.20;
  let x = r * (wSingle + wConvoy + wDecoy + wGate + wTaxi + wRest);
  if (weaver) pat = 6;
  else if (block) pat = r < 0.6 ? 2 : 4;
  else if (i < 3) pat = i === 0 ? 1 : (r < 0.7 ? 1 : 3);
  else if ((x -= wSingle) < 0) pat = 1;
  else if ((x -= wConvoy) < 0) pat = 2;
  else if ((x -= wDecoy) < 0) pat = 3;
  else if ((x -= wGate) < 0) pat = 4;
  else if ((x -= wTaxi) < 0) pat = 5;
  else pat = 0;
  const mid = g.mid, shift = block && !mid && rnd(g) < G.shiftP[g.star];   // a rolling roadblock in which one cruiser crosses into the open lane
  if (g.mid) { g.mid = 0; pat = block || r < 0.5 ? 4 : 3; }   // after a weaving cruiser we may be in any lane: this row leaves the middle open
  if ((pat === 3 || pat === 4 || pat === 0) && (g.lastPat === 3 || g.lastPat === 4 || g.lastPat === 0)) pat = block ? 2 : 1;   // never two rows in a row that need no move
  g.lastPat = pat;

  if (pat === 1) {                       // the open lane is blocked: move one lane over
    f = adj(p); put(p);
  } else if (pat === 2) {                // two side by side, one lane left
    f = adj(p);
    if (shift && p === 0) { put(p, f - p); put(third(p, f)); f = p; }   // … until the middle cruiser crosses into it and leaves the middle lane free (one move from anywhere)
    else { put(p); put(third(p, f)); }
  } else if (pat === 3) {                // a vehicle in another lane
    put(p === 0 ? side() : (rnd(g) < 0.5 ? 0 : -p));
  } else if (pat === 4) {                // both other lanes blocked
    const a = p === 0 ? -1 : 0, b = p === 0 ? 1 : -p;
    if (shift && p !== 0) { put(0, p); put(-p); f = 0; }   // the middle cruiser crosses into the open side lane: the middle is the way through
    else { put(a); put(b); }
  } else if (pat === 5) {                // a taxi in the middle lane that cuts to one side as you close in
    const d = side();
    spawn(g, T_TAXI, 0, u + off(G.stagger) * 0.5, d, 0);
    cellLine(g, p === 0 ? -d : p, u - 26, 4, 6);
    g.path = 0; g.genU = u + 5 + room + w * tg * 1.25;
    return;
  } else if (pat === 6) {                // a cruiser weaving across the middle lane and one side, then taking one of the two
    const d = p !== 0 ? p : side();      // (the side we are on: whichever lane it takes, the free one is at most one lane away)
    spawn(g, T_WEAVE, 0, u, d, rnd(g) * 2 * (G.weaveHold + G.weaveMove), d * 0.5);
    if (g.star >= 3 && rnd(g) < 0.5) spawn(g, T_BLOCK, -d, u + off(G.echelon));       // … and a second one may hold the third lane
    g.path = 0; g.mid = 1; g.genU = u + 5 + room + w * tg * 1.25;
    return;
  } else {                               // breather: a zig-zag of cells
    const l2 = adj(p);
    cellLine(g, p, u - 14, 4, 6); cellLine(g, l2, u + 14, 4, 6);
    g.path = p; g.genU = u + 36 + w * tg * 0.6;
    return;
  }
  cellLine(g, f, u - 12, 5, 6);            // cells mark the open lane
  const next = u + len + room + w * tg * (0.9 + 0.3 * rnd(g));
  // a nitro canister now and then, half-way to the next row, one lane off the straight route when there is room
  if (u >= g.itmNext) {
    g.itmNext = u + G.nitroEvery[0] + rnd(g) * (G.nitroEvery[1] - G.nitroEvery[0]);
    canister(g, f === 0 ? side() : (rnd(g) < 0.5 ? f : 0), (u + len * 0.5 + next) * 0.5);
  }
  g.path = f;
  g.genU = next;
}

function addHeat(g, n) { g.heat = Math.min(3.999, g.heat + n); g.heatGt = g.gt; }
// A hit takes a life: the pursuit car closes in and stays there. A hit while it is on the tail ends the run.
function stumble(g, out, by) {
  const gt = g.gt;
  if (gt < g.stG) return false;                              // still reeling from the last one
  g.combo = 0;
  if (g.lives < 2) { g.over = by === 'crash' ? 1 : 2; out.push({ k: by === 'crash' ? 'crash' : 'bust', by }); return true; }
  g.lives = 1; g.stG = gt + GAME.stumbleGrace;
  g.ramNext = Math.max(g.ramNext, gt + GAME.hitRest); g.drNext = Math.max(g.drNext, gt + GAME.hitRest);   // a moment to recover before the next attack
  out.push({ k: 'stumble', by });
  return true;
}
// a taxi or cruiser that will steer across, or a weaving cruiser, that we reach within holdOff seconds: the pursuit car and
// the helicopter hold off, so the squeeze is never unfair
function hazardPending(g, vel) {
  const veh = g.veh;
  for (let i = 0; i < NV; i++) {
    const o = i * VF, dz = veh[o + 2] - g.gd; if (dz <= -6) continue;
    if ((crosses(veh, o) || veh[o] === T_WEAVE) && dz < Math.max(1, vel - veh[o + 3]) * GAME.holdOff) return true;
  }
  return false;
}
// is lane l clear of traffic around the car for the next `secs` seconds (from t0 seconds from now)?
function laneClear(g, l, vel, secs, t0 = 0) {
  const veh = g.veh, L = ROAD.lane;
  for (let i = 0; i < NV; i++) {
    const o = i * VF, type = veh[o]; if (!type) continue;
    const cr = crossing(veh, o);
    if (Math.abs(veh[o + 1] - l) * L > HALF_W[type] + CAR_HW + 0.4 && !(type === T_WEAVE && (l === 0 || l === veh[o + 6])) && !(cr && (l === cr[0] || l === cr[1]))) continue;
    const dz = veh[o + 2] - g.gd, reach = veh[o + 4] + CAR_HL + 1.5, rel = Math.max(1, vel * 1.12 - veh[o + 3]);   // margin for a gear change
    if (dz > -reach + Math.max(1, vel - veh[o + 3]) * t0 && dz < reach + rel * (t0 + secs)) return false;
  }
  return true;
}
// Can an attack on lane l be dodged without being boxed in? A lane beside it must stay clear while the attack lasts, and then
// either stay clear a while longer or leave time to come back to lane l once the attack is over.
function wayOut(g, l, vel, during, after) {
  for (const e of [l - 1, l + 1]) {
    if (e < -1 || e > 1 || !laneClear(g, e, vel, during)) continue;
    if (laneClear(g, e, vel, during + after) || laneClear(g, l, vel, after, during)) return true;
  }
  return false;
}

// inp: { dt, x (car lateral position), lane (target lane), vel, brk (brake held), nitro (smashing through) }
// out: receives events { k, … }: gear, near, smash, wreck, swipe{back,dir}, crash, bust, stumble{by}, shake, star, block, weave, ramwarn, ram,
//      lock, strike, tail, draft, cell, tape, item, full
export function stepGame(g, inp, out) {
  const DT = inp.dt, G = GAME, L = ROAD.lane;
  g.gt += DT; g.gd += inp.vel * DT;
  const gt = g.gt, gd = g.gd, px = inp.x;
  let gear = g.gear; while (gear < 5 && gd >= G.gearAt[gear + 1]) gear++;
  if (gear !== g.gear) { g.gear = gear; out.push({ k: 'gear', n: gear + 1 }); }
  if (gt > G.introT && inp.vel > g.vmax) g.vmax = inp.vel;
  if (g.free) {                                              // free cruise: no traffic, no police, a canister every few seconds
    if (g.nstock < 1) { g.nfree += DT; if (g.nfree >= G.nitroFree) { g.nstock = 1; g.nfree = 0; out.push({ k: 'full' }); } }
    g.score += inp.vel * DT * G.ptsDist;
    return;
  }
  if (!g.goEv && gt >= G.introHold) { g.goEv = 1; out.push({ k: 'go' }); }
  // a nitro burst shakes the pursuit car off, gives the lost life back, and takes a star off the wanted level
  if (inp.nitro && !g.nz) {
    if (g.lives < 2) { g.lives = 2; g.pcl = 0; out.push({ k: 'shake' }); }
    g.coolN = Math.min(2, (gt < g.coolT ? g.coolN : 0) + 1); g.coolT = gt + G.nitroCool;
    g.heat = Math.max(1, Math.floor(g.heat + 1e-9) - 1); g.heatGt = gt;
  }
  g.nz = inp.nitro ? 1 : 0;
  g.vt += (G.trafficK * gameBase(g) - g.vt) * (1 - Math.exp(-DT / G.trafficEase)); g.tr += g.vt * DT;   // the traffic picks up speed with the road
  const up = gd - g.tr;
  for (let n = 0; g.genU < up + G.ahead && n < 6; n++) genRow(g);
  let mult = gameMult(g);

  // ── vehicles ──
  // Warnings are timed for the speed we would be doing flat out, so easing off the brake never shortens one.
  const veh = g.veh, vFull = Math.max(inp.vel, gameBase(g)), lr = laneRate(g, inp.vel); let draft = 0;
  for (let i = 0; i < NV; i++) {
    const o = i * VF, type = veh[o]; if (!type) continue;
    if (crosses(veh, o)) {                            // a taxi, or a cruiser of a rolling roadblock, that steers across one lane as we close in
      const from = fromLane(veh[o + 5]);
      if (veh[o + 7] === 0) {
        const gap0 = veh[o + 2] - gd - (veh[o + 4] + CAR_HL);
        if (gap0 < (vFull - g.vt) * G.taxiAt) veh[o + 7] = gt;
      } else {
        const m = (gt - veh[o + 7] - G.taxiBlink) / G.taxiMove;
        if (m >= 1) { veh[o + 1] = from + veh[o + 6]; veh[o + 6] = 0; veh[o + 7] = -gt; }     // b < 0: when it finished (the picture lets it settle)
        else if (m > 0) veh[o + 1] = from + veh[o + 6] * sCurve(m);
      }
    }
    let fl = veh[o + 5];
    if (type !== T_BLOCK) veh[o + 3] = g.vt + laneV(veh[o + 1]) * lr + (type < T_TAXI ? breathe(veh[o + 8], gt, 1) : 0);   // each lane has its speed; a taxi or a weaving cruiser picks it up as it crosses
    if (type === T_WEAVE) {              // a: the side it weaves to · b: where in its cycle it started; once it has picked a lane, its sideways speed
      if (fl & COMMIT) {
        const W = G.weaveSnap, tgt = fl & SIDE ? veh[o + 6] : 0;
        veh[o + 7] += (W * W * (tgt - veh[o + 1]) - 2 * W * veh[o + 7]) * DT; veh[o + 1] += veh[o + 7] * DT;
      } else {
        const ph = gt + veh[o + 7]; veh[o + 1] = veh[o + 6] * weave(ph);
        if (veh[o + 2] - gd - (veh[o + 4] + CAR_HL) < (vFull - g.vt) * G.weaveLock) {   // we are close: it takes the lane it is heading for
          const v = weave(ph, 1);
          fl |= COMMIT | ((v !== 0 ? v > 0 : weave(ph) > 0.5) ? SIDE : 0); veh[o + 7] = veh[o + 6] * v;
        }
      }
    }
    if (type === T_BLOCK || type === T_WEAVE) {
      const gap0 = veh[o + 2] - gd - (veh[o + 4] + CAR_HL), rel0 = vFull - g.vt;
      if (type === T_BLOCK) {                          // a rolling roadblock brakes as we come up to it
        const tv = g.vt + laneV(veh[o + 1]) * lr - (gap0 > 0 && gap0 < rel0 * G.blockAt ? G.blockSlow : 0);
        veh[o + 3] += clamp(tv - veh[o + 3], -G.blockDecel * DT, G.blockDecel * DT);
      }
      if (!(fl & WARNED) && gap0 < rel0 * G.weaveWarn && (type === T_WEAVE || (fl & ANN))) {
        fl |= WARNED; if (gt - g.blkEv > 2.5) { g.blkEv = gt; out.push({ k: type === T_WEAVE ? 'weave' : 'block', lane: veh[o + 1] }); }   // one call-out at a time
      }
    }
    veh[o + 2] += ((fl & PASSED) && veh[o + 3] > inp.vel ? inp.vel : veh[o + 3]) * DT;    // traffic we have passed does not run into our tail when we slow
    const dz = veh[o + 2] - gd, reach = veh[o + 4] + CAR_HL;
    if (dz < -G.despawn) { veh[o] = 0; continue; }
    const vx = veh[o + 1] * L, dx = Math.abs(px - vx);
    const lat = dx < HALF_W[type] + CAR_HW - 0.12, lon = Math.abs(dz) < reach - 0.2;
    const rel = inp.vel - veh[o + 3], gap = dz - reach;
    if (lat && lon) {
      if (inp.nitro) {
        veh[o] = 0; g.smash++; g.combo++; g.score += G.ptsSmash * mult;
        addHeat(g, type >= T_BLOCK ? 1 : G.heatSmash);
        out.push({ k: 'smash', lane: veh[o + 1], dz, type });
        continue;
      }
      if (gt >= g.inv) {
        if (!(fl & LAT)) {
          // sideswipe: we moved into a vehicle that was already alongside (or cut its corner): bounce back
          const dir = px < vx ? -1 : 1;
          g.inv = gt + G.swipeInv; addHeat(g, G.heatSwipe);
          stumble(g, out, 'swipe');
          out.push({ k: 'swipe', back: clamp(Math.round(veh[o + 1]) + dir, -1, 1), dir, lane: veh[o + 1] });
        } else if (g.lives > 1) {
          // first life: we plough through it, lose speed, and the police are on us
          veh[o] = 0; g.inv = gt + G.hitInv; g.slow = gt + G.ramSlow; addHeat(g, G.heatSwipe);
          out.push({ k: 'wreck', lane: veh[o + 1], dz, type }); stumble(g, out, 'crash');
          continue;
        } else {
          g.over = 1; out.push({ k: 'crash', type, lane: veh[o + 1] });
        }
      }
    } else {
      const nearD = clamp(rel * G.nearT, 4, 30);
      if (lat && gap > 0 && gap < nearD) fl |= THREAT;
      if ((fl & THREAT) && !(fl & NEAR) && !lat && gap < nearD && dz > -reach) {
        fl |= NEAR; g.near++; g.combo += G.comboNear; g.score += G.ptsNear * mult;
        out.push({ k: 'near', lane: veh[o + 1], pts: Math.round(G.ptsNear * mult) });
      }
      if (!(fl & PASSED) && dz < -reach) { fl |= PASSED; g.passed++; g.combo++; g.score += G.ptsPass * mult; }
      if (lat && type < T_BLOCK && gap > 0 && gap < clamp(rel * G.draftT, 12, 60)) draft = 1;
    }
    veh[o + 5] = (fl & ~(LAT | LON)) | (lat ? LAT : 0) | (lon ? LON : 0);
  }
  if (g.combo > g.best) g.best = g.combo;
  mult = gameMult(g);

  // ── slipstream: points for tucking in behind a vehicle ──
  g.draft += (draft - g.draft) * (1 - Math.exp(-DT / 0.15));
  if (draft) {
    g.score += G.ptsDraft * mult * DT;
    if (gt - g.draftEv > 2.5) { g.draftEv = gt; out.push({ k: 'draft' }); }
  }

  // ── cells and nitro canisters ──
  const cel = g.cel;
  for (let i = 0; i < NC; i++) {
    const o = i * CF, n = cel[o]; if (!n) continue;
    cel[o + 2] += g.vt * DT;
    const z0 = cel[o + 2], sp = cel[o + 3];
    if (z0 + (n - 1) * sp < gd - 6) { cel[o] = 0; continue; }
    if (Math.abs(px - cel[o + 1] * L) > 1.9) continue;
    const k = Math.round((gd - z0) / sp);
    if (k < 0 || k >= n || Math.abs(z0 + k * sp - gd) > 2.2) continue;
    const bit = 1 << k;
    if (cel[o + 4] & bit) continue;
    cel[o + 4] |= bit; g.cells++; g.score += G.ptsCell * mult;
    out.push({ k: 'cell' });
    if (g.cells % G.tapeEvery === 0) out.push({ k: 'tape' });
  }
  const itm = g.itm;
  for (let i = 0; i < NI; i++) {
    const o = i * IF; if (!itm[o]) continue;
    itm[o + 2] += g.vt * DT;
    const dz = itm[o + 2] - gd;
    if (dz < -8) { itm[o] = 0; continue; }
    if (Math.abs(dz) < 2.6 && Math.abs(px - itm[o + 1] * L) < 2.1) {
      itm[o] = 0;
      if (g.nstock < G.nitroMax) g.nstock++; else g.score += 500 * mult;
      out.push({ k: 'item', n: g.nstock, l: g.lives });
    }
  }

  // ── police: stars ──
  const earned = gd >= G.star3At ? 3 : gd >= G.star2At ? 2 : 1, floor = gt < g.coolT ? Math.max(1, earned - g.coolN) : earned;
  if (g.heat < floor) g.heat = floor;
  else if (g.heat > floor && gt - g.heatGt > G.heatHold) g.heat = Math.max(floor, g.heat - DT / G.heatDecay);
  const star = Math.min(3, Math.floor(g.heat + 1e-9));
  if (star !== g.star) { out.push({ k: 'star', n: star, up: star > g.star ? 1 : 0 }); g.star = star; if (star > g.starMax) g.starMax = star; }

  // lingering on the brake lets the pursuit car catch up
  if (inp.brk) g.brkAcc += DT; else g.brkAcc = Math.max(0, g.brkAcc - 2 * DT);
  if (g.brkAcc > G.brakeLinger && gt >= g.pcl - 1) { if (gt >= g.pcl) out.push({ k: 'tail' }); g.pcl = gt + 1.6; }

  // ── police: the pursuit car (always there; from two stars it comes up with the grappler) ──
  const eK = (tau) => 1 - Math.exp(-DT / tau);
  if (g.polM === P_TAIL) {
    const close = policeClose(g);
    const near = gt < G.introClose || gt < g.pcl || gt < g.stG + 1.5;                // right on the bumper: the opening, lingering on the brake, just after a hit
    g.polZ += ((close ? (near ? -G.polClose : -G.chaseZ) : -G.polFar) - g.polZ) * eK(close ? (near ? 0.3 : 0.9) : 1.1);
    g.polX += (px + (close && !near ? (px > 0.5 ? -G.chaseX : G.chaseX) : 0) - g.polX) * eK(close && !near ? 0.5 : 0.3);   // on a long chase it sits off our rear quarter, on the side with more road
    if (g.star >= 2 && gt >= g.ramNext && gt > G.introT + 4 && g.drT < 0 && !inp.nitro && !hazardPending(g, inp.vel)) {
      const l = inp.lane;
      if (laneClear(g, l, inp.vel, G.ramOwn) && wayOut(g, l, inp.vel, G.ramClear, G.clearAfter)) {
        g.polM = P_WARN; g.polT = gt; g.polLane = l; g.polF = 0;
        out.push({ k: 'ramwarn', lane: l });
      }
    }
  } else {
    const u = gt - g.polT;
    g.polX += ((g.polM === P_HOOK ? px : g.polLane * L) - g.polX) * eK(g.polM === P_HOOK ? 0.07 : 0.1);
    if (g.polM === P_HOOK) {                               // the net has our wheel: it hangs on and brakes, then the strap lets go
      g.polZ += (-HOOK_Z - g.polZ) * eK(0.05);
      if (u >= G.ramSlow) { g.polM = P_BACK; g.polT = gt; }
    } else if (g.polM === P_WARN) {
      g.polZ += (-(G.polClose + 2) - g.polZ) * eK(0.25);
      if (u >= G.ramWarn) { g.polM = P_CHARGE; g.polT = gt; out.push({ k: 'ram', lane: g.polLane }); }
    } else if (g.polM === P_CHARGE) {
      g.polZ += G.ramV * DT;
      if (g.polZ >= -HOOK_Z && g.polZ < -(POL_HL + CAR_HL) && Math.abs(px - g.polX) < HOOK_W && !inp.nitro && gt >= g.inv) {
        g.inv = gt + G.swipeInv; g.slow = gt + G.ramSlow; g.polM = P_HOOK; g.polT = gt;      // still in its lane: hooked
        stumble(g, out, 'hook');
      } else if (g.polZ >= 1.5) { g.polM = P_BACK; g.polT = gt; }
    } else {
      g.polZ -= G.ramBack * DT * Math.min(1, u / 0.25);
      if (g.polZ <= -G.polFar) { g.polM = P_TAIL; g.ramNext = gt + (G.ramEvery[0] + rnd(g) * (G.ramEvery[1] - G.ramEvery[0])) * (g.lives < 2 ? G.chaseRam : 1); }
    }
    // contact with the pursuit car
    const lat = Math.abs(px - g.polX) < POL_HW + CAR_HW - 0.12, lon = Math.abs(g.polZ) < POL_HL + CAR_HL - 0.2;
    if (lat && lon && g.polM !== P_WARN && g.polM !== P_HOOK) {
      if (inp.nitro) { g.polM = P_BACK; g.polT = gt; addHeat(g, 0.5); out.push({ k: 'shove' }); }
      else if (gt >= g.inv) {
        g.inv = gt + G.swipeInv;
        if (g.polF & LAT) {                                  // it came up behind us in our lane
          g.slow = gt + G.ramSlow; stumble(g, out, 'ram');
          g.polM = P_BACK; g.polT = gt;
        } else {                                             // we steered into it
          const dir = px < g.polX ? -1 : 1;
          addHeat(g, G.heatSwipe); stumble(g, out, 'swipe');
          out.push({ k: 'swipe', back: clamp(g.polLane + dir, -1, 1), dir, lane: g.polLane });
        }
      }
    }
    g.polF = lat ? LAT : 0;
  }

  // ── police: the helicopter, from three stars. Its searchlight locks the lane we are in, then it fires down the beam ──
  if (g.star >= 3) {
    if (g.drT < 0) {
      if (gt >= g.drNext && g.polM === P_TAIL && !hazardPending(g, inp.vel)) {
        const l = inp.lane;
        if (wayOut(g, l, inp.vel, G.drClear, G.clearAfter)) {
          g.drT = gt; g.drLane = l; g.drAcc = 0; g.drHit = 0; g.drS = 0; out.push({ k: 'lock', lane: l });
        }
      }
    } else {
      const u = gt - g.drT;
      if (u >= G.drWarn && !g.drS) { g.drS = 1; out.push({ k: 'strike', lane: g.drLane }); }
      if (u >= G.drWarn && u < G.drWarn + G.drStrike && Math.abs(px - g.drLane * L) < 2.0 && !inp.nitro && gt >= g.inv) {
        g.drAcc += DT;
        if (g.drAcc >= 0.1 && !g.drHit) { g.drHit = 1; g.slow = gt + G.ramSlow; g.inv = gt + G.swipeInv; stumble(g, out, 'heli'); }
      }
      if (u >= G.drWarn + G.drStrike) { g.drT = -1; g.drNext = gt + G.drEvery; }
    }
  } else { g.drT = -1; g.drNext = gt + 3; }
  // where the helicopter hangs and where its searchlight falls: wandering while it searches, on the lane once locked
  const lk = g.drT >= 0, hT = lk ? g.drLane * L : Math.sin(gt * 0.37) * 6;
  g.hb += (clamp((hT - g.hx) * 0.045, -0.3, 0.3) - g.hb) * eK(0.2);          // it banks into its sideways moves
  g.hx += (hT - g.hx) * eK(lk ? 0.3 : 0.9);
  g.ha += ((g.star >= 3 ? 1 : 0) - g.ha) * eK(g.star >= 3 ? 0.8 : 0.5);      // it flies in at three stars and climbs away when the heat drops
  g.sx += ((lk ? g.drLane * L : px + Math.sin(gt * 0.9) * L * 1.1) - g.sx) * eK(lk ? 0.09 : 0.45);
  g.sk += ((lk ? 1 : 0) - g.sk) * eK(lk ? 0.1 : 0.25);

  g.score += inp.vel * DT * G.ptsDist * mult;
}
