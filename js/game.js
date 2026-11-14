// ─────────────────────────────────────────────────────────────────────────────
// The game simulation: highway traffic, pickups, collisions, score, and the police.
// Pure and deterministic: stepGame(g, input, out) advances the state object `g` by one fixed step.
// No DOM, no three.js — it runs on the main thread, in the AudioWorklet and in Node (tools/bot.mjs).
// Coordinates: z runs along the road, the player's car is at z = g.gd; x = lane × ROAD.lane.
// ─────────────────────────────────────────────────────────────────────────────
import { GAME, ROAD } from './cue.js';
import { threatGrid, markCells, copyGrid, widen, wayThrough } from './foresight.js';

export const NV = 44, VF = 9;      // vehicle pool: [type, lane, z, v, halfLen, flags, a, b, id]
export const NC = 30, CF = 5;      // cell lines:   [count, lane, z0, spacing, takenMask]
export const NI = 4, IF = 3;       // nitro canisters: [active, lane, z]
// T_BLOCK: a cruiser of a rolling roadblock · T_WEAVE: a cruiser weaving between the middle lane and one side
export const T_CAR = 1, T_VAN = 2, T_TRUCK = 3, T_TAXI = 4, T_BLOCK = 5, T_WEAVE = 6;
export const HALF_L = [0, 2.4, 2.75, 6.2, 2.4, 2.4, 2.4];
export const HALF_W = [0, 1.05, 1.15, 1.4, 1.05, 1.05, 1.05];
export const CAR_HL = 2.2, CAR_HW = 0.95;
export const POL_HL = 2.4, POL_HW = 1.05;                  // the pursuit car
// pursuit car modes: on the tail, lining up with the grappler out, lunging, dropping back, hooked onto our rear wheel
export const P_TAIL = 0, P_WARN = 1, P_CHARGE = 2, P_BACK = 3, P_HOOK = 4;
// the interceptor: away, coming up beside us, riding level, slamming across, holding the lane it took, dropping back
export const I_OFF = 0, I_COME = 1, I_PACE = 2, I_TELL = 3, I_SLAM = 4, I_HOLD = 5, I_LEAVE = 6;
export const H_LANE = 0, H_TWIN = 1, H_WALK = 2;           // the helicopter's attacks
// the grappler (a net on a fork ahead of the cruiser's bumper) reaches our rear wheel at this distance, within this offset
export const HOOK_Z = POL_HL + CAR_HL + 1.25, HOOK_W = 1.7;
const LAT = 1, LON = 2, THREAT = 4, NEAR = 8, PASSED = 16, WARNED = 32;
export const COMMIT = 64, SIDE = 128;      // a weaving cruiser has picked its lane (SIDE: the side lane, else the middle)
const ANN = 256; export const STEADY = 2048, MIRROR = 4096;            // the cruiser of a rolling roadblock that announces it · a roadblock that does not brake (one of its cruisers is crossing over)
// A vehicle that will steer across one lane as we close in (a taxi; a car or van merging; a cruiser): a = which way,
// b = when it began to signal (0: not yet; negative: when it finished), and the lane it starts from is kept in its flags.
export const fromLane = (fl) => ((fl >> 9) & 3) - 1;
const crosses = (veh, o) => veh[o] !== T_TRUCK && veh[o] !== T_WEAVE && veh[o + 6] !== 0;
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
    lvN: 0, aiNext: 0, atkGap: 0, bias: 0, dodges: 0,                                 // threat level reached · the police's next decision, earliest next attack · which way this driver dodges (−1 left … +1 right)
    heat: 1, heatGt: -1e9, star: 1, nUse: 0, wd0: 0,                                 // nitro bursts since the heat was last cleared, and the road position where it was
    lives: 2, nz: 0,                                                                 // lives left (1 = the pursuit car is on our tail until nitro shakes it off); nitro was on last step
    pcl: 0, stG: 0, slow: 0, brkAcc: 0,                                              // tail-close until (lingering on the brake), stumble grace until, slowed until
    polM: P_TAIL, polT: 0, polLane: 0, polZ: -GAME.polClose, polX: 0, polF: 0, ramNext: GAME.ramFirst,
    drT: -1, drLane: 0, drHit: 0, drS: 0, drAcc: 0, drNext: 0, drPat: 0, drB: 0, drWant: -1, drW: 1.2, polW: 1.2,   // … its attack (pattern, second lane or direction), the length of its warning; of the pursuit car's
    // the interceptor: mode, since when, its side, where it is (z ahead of us, x in lanes), the move it is making (from, to, its warning, 1 = into our lane)
    icM: I_OFF, icT: 0, icA: 1, icZ: -60, icX: 0, icFrom: 0, icTo: 0, icW: 1, icNext: 0, icF: 0,                      // helicopter: lock time (−1 = searching), locked lane, …
    hOn: 0, hNext: 0, hLeft: 0, hSide: 1,                                            // helicopter visits: on station, when it is next due, attacks left this visit, which side it flies in from
    hx: 0, sx: 0, sk: 0, ha: 0, hb: 0,                                               // helicopter x, searchlight spot x, how locked the light is (0..1), how far it has arrived (0..1), its bank
    inv: 0, draft: 0, draftEv: -1e9, goEv: 0, blkEv: -1e9, over: 0,
  };
}
export function copyGame(g) { const c = { ...g }; c.veh = g.veh.slice(); c.cel = g.cel.slice(); c.itm = g.itm.slice(); return c; }
export const gameMult = (g) => (1 + Math.min(g.combo, GAME.comboCap) * GAME.comboStep) * (1 + GAME.starBonus * (g.star - 1));
// The road speed at run distance d. The car accelerates all the way: through the gears (GAME.gears[i] is the speed at which
// gear i engages, at GAME.gearAt[i]) and, in top gear, on towards its top speed.
export const baseAt = (d) => {
  const A = GAME.gearAt, V = GAME.gears;
  if (d >= A[5]) return V[5] + Math.min(GAME.creep[1], (d - A[5]) / GAME.creep[0]);
  let i = 0; while (d >= A[i + 1]) i++;
  return V[i] + (V[i + 1] - V[i]) * Math.max(0, d - A[i]) / (A[i + 1] - A[i]);
};
// how far up its rev range the engine is (0 = just after a gear change, 1 = about to change up; over 1 in a nitro burst)
export const revs = (g, vel) => { const i = g.gear, V = GAME.gears, lo = i ? V[i] : V[0] * 0.55, hi = i < 5 ? V[i + 1] : V[5] + GAME.creep[1]; return (vel - lo) / (hi - lo); };
export const gameBase = (g) => baseAt(g.gd);
// how far ahead of the car the traffic is laid out: at least GAME.ahead, and as far as the car will close in GAME.aheadT seconds
// (the police plan their longer attacks on what can be seen, so it has to be seen early enough)
export const aheadFor = (g) => Math.max(GAME.ahead, (gameBase(g) - g.vt) * GAME.aheadT);
// The helicopter's strikes for an attack: [lane, from, to] in seconds after the lock. W: the length of the warning; b: the second lane (twin)
// or the direction (barrage).
export function heliStrikes(pat, l, b, W) {
  const G = GAME, S = G.drStrike, P = S + G.drGap;
  if (pat === H_TWIN) return [[l, W, W + S], [b, W, W + S]];
  if (pat === H_WALK) return [[-b, W, W + S], [0, W + P, W + P + S], [b, W + 2 * P, W + 2 * P + S]];
  return [[l, W, W + S]];
}
const REACH_P = POL_HL + CAR_HL + 0.8;
export const ramLen = (W) => W + (GAME.polClose + 3.5) / GAME.ramV + (1.5 + REACH_P) / GAME.ramBack + 0.2;     // a grappler run, from the warning to the cruiser dropping clear
// The interceptor's lanes and times, [lane, from, to] from now. It swerves from the shoulder (x = ±icShoulder lanes: not a lane) into the lane
// beside it, or straight across that lane into the middle one. The lane it goes to is taken from the end of its warning (`left` seconds off)
// until it has dropped back; a lane it crosses on the way, while it is crossing.
const isLane = (x) => Math.abs(x) < 1.2;
export const icMoveT = (from, to) => GAME.icMove * (Math.abs(to - from) > 1.2 ? 1.7 : 1);
export function icMoveCells(from, to, left) {
  const G = GAME, T = icMoveT(from, to), out = [[to, left + 0.05, left + T + G.icHold + (REACH_P + G.icZp) / G.icBack + 0.15]];
  if (Math.abs(to - from) > 1.2) out.push([Math.sign(from), left + T * 0.12, left + T * 0.85]);
  return out;
}
export function icCells(g) {
  const G = GAME, u = g.gt - g.icT, tOut = (REACH_P + g.icZ) / G.icBack + 0.15;
  if (g.icM === I_TELL) return icMoveCells(g.icFrom, g.icTo, g.icW - u);
  if (g.icM === I_SLAM) return icMoveCells(g.icFrom, g.icTo, -u);
  if (g.icM === I_HOLD) return [[Math.round(g.icX), 0, G.icHold - u + tOut]];
  if (g.icM === I_LEAVE && isLane(g.icX) && g.icZ > -REACH_P) return [[Math.round(g.icX), 0, tOut]];
  return [];
}
// The police's committed attacks, as lanes and times: mark(lane, from, to) in seconds from now. Used by foresight (js/foresight.js).
export function policeCells(g, mark) {
  const G = GAME;
  // a lunging pursuit car takes its lane from the end of the warning until it has dropped back
  const tBack = (1.5 + REACH_P) / G.ramBack + 0.2;   // time the pursuit car needs to drop clear
  if (g.polM === P_WARN) { const left = g.polW - (g.gt - g.polT); mark(g.polLane, left + 0.05, left + (G.polClose + 3.5) / G.ramV + tBack); }
  else if (g.polM === P_CHARGE) mark(g.polLane, 0, (1.5 - g.polZ) / G.ramV + tBack);
  else if (g.polM !== P_TAIL && g.polZ > -REACH_P) mark(g.polLane, 0, (g.polZ + REACH_P) / G.ramBack + 0.15);
  // the helicopter's strikes take their lanes while they last
  if (g.drT >= 0) { const u = g.gt - g.drT; for (const [l, t0, t1] of heliStrikes(g.drPat, g.drLane, g.drB, g.drW)) if (t1 + 0.05 > u) mark(l, t0 - u - 0.1, t1 - u + 0.05); }
  // the interceptor: the lane it is in, the lane it is moving into
  if (g.icM !== I_OFF) for (const [l, t0, t1] of icCells(g)) mark(l, t0, t1);
}
// seconds until every attack now under way is over (0: none)
export function busyFor(g) {
  let t = 0;
  if (g.polM === P_WARN) t = ramLen(g.polW) - (g.gt - g.polT); else if (g.polM !== P_TAIL) t = 1;
  if (g.drT >= 0) { const S = heliStrikes(g.drPat, g.drLane, g.drB, g.drW); t = Math.max(t, S[S.length - 1][2] - (g.gt - g.drT)); }
  for (const c of icCells(g)) t = Math.max(t, c[2]);
  return t;
}
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
  const G = GAME, gear = g.gear, p = g.path, i = g.genI++; let u = g.genU;
  const w = gameBase(g) * (1 - G.trafficK), room = 2 * G.stagger[1];   // closing speed at cruise; room for the stagger of this row and the next
  const kf = clamp((gameBase(g) - G.gears[0]) / (G.gears[5] - G.gears[0]), 0, 1);   // how far through the gears we are, 0..1
  const tg = G.rowGap[0] + (G.rowGap[1] - G.rowGap[0]) * kf;
  const side = () => (rnd(g) < 0.5 ? -1 : 1);
  const adj = (l) => (l === 0 ? side() : 0);                 // a lane next to l
  const third = (a, b) => -(a + b);                           // the lane that is neither a nor b (lanes sum to 0)
  const lv = Math.min(12, g.gt / G.lvEvery);                  // the threat level: with it more police ahead, more pairs and convoys, more lane-changers
  const block = i >= 3 && rnd(g) < Math.min(0.4, G.blockP[g.star] + (g.star >= 2 ? G.blockLv * lv : 0));   // police ahead instead of traffic
  // (a cruiser whose lane is not settled until we are close is not sent into an attack that will still be going on when we reach it)
  const eta = (u + g.tr - g.gd) / Math.max(1, gameBase(g) - g.vt + G.blockSlow), calm = eta > busyFor(g) + G.weaveFree + 0.3;
  const weaver = block && rnd(g) < G.weaveP[g.star] && calm;
  const mirror = block && !weaver && rnd(g) < G.mirrorP[g.star] && calm;
  if (block) u += w * G.blockRoom;                            // (police ahead brake as we come up: they are met sooner than traffic, so they are set a little further on)
  let len = 5, first = 1, sgn = side();
  // nobody drives exactly abreast: each vehicle of a row sits a little ahead of or behind the row's line, alternately
  const off = (range) => { sgn = -sgn; return sgn * (range[0] + rnd(g) * (range[1] - range[0])); };
  const put = (lane, cross = 0) => {
    if (block) { const k = spawn(g, T_BLOCK, lane, u + off(G.echelon), cross, 0); if (k >= 0) g.veh[k * VF + 5] |= (first ? ANN : 0) | (crossRow ? STEADY : 0); first = 0; return; }
    const r = rnd(g), type = r < 0.46 ? T_CAR : r < 0.72 ? T_VAN : T_TRUCK;
    if (type === T_TRUCK) len = 16.2;
    spawn(g, type, lane, u + off(G.stagger) + (type === T_TRUCK ? 3.8 : 0));     // (a truck sits further on, so its tail is where a car's would be)
  };
  let f = p, pat;

  const r = rnd(g);
  const wConvoy = 0.10 + 0.25 * kf + 0.012 * lv, wGate = 0.08 + 0.10 * kf + 0.008 * lv, wTaxi = gear >= 1 && !block ? 0.14 : 0, wRest = 0.06;
  const wMerge = gear >= 2 && !block ? Math.min(G.mergeP[2], G.mergeP[0] + G.mergeP[1] * lv) : 0;
  const wSingle = Math.max(0.22, 0.40 - 0.018 * lv), wDecoy = 0.20;
  let x = r * (wSingle + wConvoy + wDecoy + wGate + wTaxi + wMerge + wRest);
  if (weaver) pat = 6;
  else if (mirror) pat = 8;
  else if (block) pat = r < 0.6 ? 2 : 4;
  else if (i < 3) pat = i === 0 ? 1 : (r < 0.7 ? 1 : 3);
  else if ((x -= wSingle) < 0) pat = 1;
  else if ((x -= wConvoy) < 0) pat = 2;
  else if ((x -= wDecoy) < 0) pat = 3;
  else if ((x -= wGate) < 0) pat = 4;
  else if ((x -= wTaxi) < 0) pat = 5;
  else if ((x -= wMerge) < 0) pat = 7;
  else pat = 0;
  let crossRow = 0;
  const mid = g.mid, shift = block && !mid && rnd(g) < G.shiftP[g.star];   // a rolling roadblock in which one cruiser crosses into the open lane
  if (g.mid) { g.mid = 0; pat = block || r < 0.5 ? 4 : 3; }   // after a weaving cruiser we may be in any lane: this row leaves the middle open
  if ((pat === 3 || pat === 4 || pat === 0) && (g.lastPat === 3 || g.lastPat === 4 || g.lastPat === 0)) pat = block ? 2 : 1;   // never two rows in a row that need no move
  g.lastPat = pat;

  if (pat === 1) {                       // the open lane is blocked: move one lane over
    f = adj(p); put(p);
  } else if (pat === 2) {                // two side by side, one lane left
    f = adj(p);
    if (shift && p === 0) { crossRow = 1; put(p, f - p); put(third(p, f)); f = p; }   // … until the middle cruiser crosses into it and leaves the middle lane free (one move from anywhere)
    else { put(p); put(third(p, f)); }
  } else if (pat === 3) {                // a vehicle in another lane
    put(p === 0 ? side() : (rnd(g) < 0.5 ? 0 : -p));
  } else if (pat === 4) {                // both other lanes blocked
    const a = p === 0 ? -1 : 0, b = p === 0 ? 1 : -p;
    if (shift && p !== 0) { crossRow = 1; put(0, p); put(-p); f = 0; }   // the middle cruiser crosses into the open side lane: the middle is the way through
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
  } else if (pat === 7) {                // a car or van in a side lane that signals and merges into the middle as you close in
    const d = side();
    spawn(g, rnd(g) < 0.6 ? T_CAR : T_VAN, d, u + off(G.stagger) * 0.5, -d, 0);
    cellLine(g, -d, u - 26, 4, 6);
    g.path = 0; g.mid = 1; g.genU = u + 5 + room + w * tg * 1.25;       // (afterwards we may be on either side: the next row leaves the middle open)
    return;
  } else if (pat === 8) {                // a cruiser in the middle lane that waits to see which lane you are in, then cuts across into it
    const k = spawn(g, T_BLOCK, 0, u, 0, 0); if (k >= 0) g.veh[k * VF + 5] |= ANN | MIRROR;
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
    g.itmNext = u + (G.nitroEvery[0] + rnd(g) * (G.nitroEvery[1] - G.nitroEvery[0])) * Math.min(G.nitroLvMax, 1 + G.nitroLv * lv);
    canister(g, f === 0 ? side() : (rnd(g) < 0.5 ? f : 0), (u + len * 0.5 + next) * 0.5);
  }
  g.path = f;
  g.genU = next;
}

function addHeat(g, n) { g.heat = Math.min(5.999, g.heat + n); g.heatGt = g.gt; }
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
// Two things ahead cannot be planned round, because which lane they take is not settled yet: a cruiser still weaving, and a cruiser
// waiting to cut us off. An attack that lasts `dur` seconds must be over well before we reach one (weaveFree s before a weaver,
// and before the other makes up its mind), so a driver is never caught out of position by something he could not have known.
// toMid: the attack drives us into the middle lane, from where either can still be dealt with: then it need only be over shortly before.
function hazardPending(g, vel, dur, toMid) {
  const veh = g.veh, G = GAME;
  for (let i = 0; i < NV; i++) {
    const o = i * VF, dz = veh[o + 2] - g.gd; if (!veh[o] || dz <= -6) continue;
    const eta = (dz - veh[o + 4] - CAR_HL) / Math.max(1, Math.max(vel, gameBase(g)) - veh[o + 3] + (veh[o] === T_BLOCK ? G.blockSlow : 0));
    if (veh[o] === T_WEAVE && !(veh[o + 5] & COMMIT) && eta < dur + (toMid ? 0.8 : G.weaveFree)) return true;
    if ((veh[o + 5] & MIRROR) && eta < dur + (toMid ? 1.3 : G.taxiAt + 0.4)) return true;
  }
  return false;
}
// will lane l be clear of traffic beside the car from t0 to t1 seconds from now? (room for a unit to cut across it)
function laneWin(g, l, vel, t0, t1) {
  const veh = g.veh, L = ROAD.lane, base = gameBase(g), vF = Math.max(vel, baseAt(g.gd + vel * t1)) * 1.02, vS = Math.max(1, Math.min(vel, base));
  for (let i = 0; i < NV; i++) {
    const o = i * VF, type = veh[o]; if (!type) continue;
    const cr = crossing(veh, o);
    if (Math.abs(veh[o + 1] - l) * L > HALF_W[type] + POL_HW + 0.5 && !(type === T_WEAVE && (l === 0 || l === veh[o + 6])) && !(cr && (l === cr[0] || l === cr[1])) && !((veh[o + 5] & MIRROR) && l !== 0)) continue;
    const dz = veh[o + 2] - g.gd, reach = veh[o + 4] + POL_HL + 2.5 + (type < T_TAXI ? GAME.breathe : 0), v = veh[o + 3] - (type === T_BLOCK ? GAME.blockSlow : 0);
    if (dz - Math.max(1, vS - veh[o + 3]) * t0 < -reach || dz - Math.max(1, vF - v) * t1 > reach) continue;     // gone by before it starts, or not here until it is over
    return false;
  }
  return true;
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
  // a nitro burst shakes the pursuit car off and gives the lost life back; the third one clears the heat
  if (inp.nitro && !g.nz) {
    if (g.lives < 2) { g.lives = 2; g.pcl = 0; out.push({ k: 'shake' }); }
    if (++g.nUse >= G.nitroClear) { g.nUse = 0; const to = Math.max(1, g.star - G.clearDrop); g.heat = to; g.heatGt = gt; g.wd0 = gd - G.starAt[to - 1]; out.push({ k: 'clear', n: to }); }
    else out.push({ k: 'nuse', n: g.nUse });
  }
  g.nz = inp.nitro ? 1 : 0;
  g.vt += (G.trafficK * gameBase(g) - g.vt) * (1 - Math.exp(-DT / G.trafficEase)); g.tr += g.vt * DT;   // the traffic picks up speed with the road
  const up = gd - g.tr;
  for (let n = 0; g.genU < up + aheadFor(g) && n < 6; n++) genRow(g);
  let mult = gameMult(g);

  // ── the police think. The threat level sets how hard: how soon they attack again, and how little time they leave a driver ──
  const lv = gt / G.lvEvery, react = Math.max(G.react[1], G.react[0] - G.react[2] * lv), warn = react + G.warn, cad = 1 / (1 + G.cadence * Math.min(lv, 12));
  // Their picture of the road for the next seconds (js/foresight.js). An attack is laid over it as [lane, from, to] cells, and it only goes
  // ahead if a driver in our lane, given `react` seconds to see it, still has a way through: fair(cells) → 0 if not, else 1 + the lane changes needed.
  let grid0 = null;
  // (the picture is the forecast with everything on it lasting a little longer at either end, so a way through is one with room to spare;
  //  the attack itself is laid on it as it is: its own timing is exact)
  const fair = (cells) => { const c = copyGrid(grid0 || (grid0 = widen(threatGrid(g, inp.vel, { horizon: G.fairAhead }), G.fairSlack))); for (const [l, t0, t1] of cells) markCells(c, l, t0, t1); return wayThrough(c, inp.lane, react, G.fairSwitch); };

  // ── vehicles ──
  // Warnings are timed for the speed we would be doing flat out, so easing off the brake never shortens one.
  // (… and for the speed we will be doing two seconds on, so the car's own acceleration does not shorten one either)
  const veh = g.veh, vFull = Math.max(inp.vel, baseAt(gd + 2 * inp.vel)), lr = laneRate(g, inp.vel); let draft = 0;
  for (let i = 0; i < NV; i++) {
    const o = i * VF, type = veh[o]; if (!type) continue;
    if (type === T_BLOCK && (veh[o + 5] & MIRROR) && veh[o + 2] - gd - (veh[o + 4] + CAR_HL) < (vFull - g.vt) * G.taxiAt) {
      // the cruiser that cuts us off: now it looks which lane we are in, and goes for it — if that leaves us a way round
      veh[o + 5] &= ~MIRROR;
      const q = inp.lane;
      if (q !== 0) {
        veh[o + 6] = q; veh[o + 7] = gt; veh[o + 5] |= STEADY;
        if (wayThrough(widen(threatGrid(g, inp.vel, { horizon: G.fairAhead }), G.fairSlack), q, react, G.fairSwitch)) { grid0 = null; g.blkEv = gt; out.push({ k: 'mirror', lane: q }); }
        else { veh[o + 6] = 0; veh[o + 7] = 0; veh[o + 5] &= ~STEADY; }
      }
    }
    if (crosses(veh, o)) {                            // a taxi, a merging car, or a cruiser, that steers across one lane as we close in
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
        const tv = g.vt + laneV(veh[o + 1]) * lr - (!(fl & STEADY) && gap0 > 0 && gap0 < rel0 * G.blockAt ? G.blockSlow : 0);
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
        addHeat(g, type >= T_BLOCK ? G.heatCruiser : G.heatSmash);
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
      if (!(fl & PASSED) && dz < -reach) {
        fl |= PASSED; g.passed++; g.combo++; g.score += G.ptsPass * mult;
        if (dx < L * 1.5) out.push({ k: 'pass', side: Math.sign(vx - px), big: type === T_TRUCK ? 1 : 0 });   // it goes by in the next lane: you hear it
      }
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

  // ── police: threat level and stars ──
  const lvN = Math.floor(lv);
  if (lvN !== g.lvN) { g.lvN = lvN; out.push({ k: 'level', n: lvN }); }
  const wd = gd - g.wd0; let floor = 1; while (floor < 5 && wd >= G.starAt[floor]) floor++;
  floor = Math.max(floor, lv >= G.starFloorLv[2] ? 3 : lv >= G.starFloorLv[1] ? 2 : 1);
  if (g.heat < floor) g.heat = floor;
  else if (g.heat > floor && gt - g.heatGt > G.heatHold) g.heat = Math.max(floor, g.heat - DT / G.heatDecay);
  const star = Math.min(5, Math.floor(g.heat + 1e-9));
  if (star !== g.star) { out.push({ k: 'star', n: star, up: star > g.star ? 1 : 0 }); g.star = star; if (star > g.starMax) g.starMax = star; }

  // lingering on the brake lets the pursuit car catch up
  if (inp.brk) g.brkAcc += DT; else g.brkAcc = Math.max(0, g.brkAcc - 2 * DT);
  if (g.brkAcc > G.brakeLinger && gt >= g.pcl - 1) { if (gt >= g.pcl) out.push({ k: 'tail' }); g.pcl = gt + 1.6; }

  // ── police: who may attack now. They decide twenty times a second; never while we are between lanes; one attack at a time until
  //    five stars, then two (each one checked against the other: together they must still leave a way through) ──
  const think = gt >= g.aiNext; if (think) g.aiNext = gt + 0.05;
  let act = (g.polM !== P_TAIL ? 1 : 0) + (g.drT >= 0 ? 1 : 0) + (g.icM === I_TELL || g.icM === I_SLAM || g.icM === I_HOLD ? 1 : 0);
  const settled = Math.abs(px - inp.lane * L) < 1.0, maxAtk = star >= 5 ? 2 : 1;
  const may = (dur, toMid) => think && settled && act < maxAtk && gt >= g.atkGap && !inp.nitro && gt > G.introT + 4 && !hazardPending(g, inp.vel, dur, toMid);
  const go = (k, e) => { if (act) out.push({ k: 'pincer' }); act++; g.atkGap = gt + 0.9; grid0 = null; out.push({ k, ...e }); };
  const rest = () => { g.atkGap = Math.max(g.atkGap, gt + Math.max(G.rest[1], G.rest[0] - G.rest[2] * lv)); };      // an attack is over: a breath before the next
  // whose turn: the unit that has been ready longest. One that has waited two seconds without finding its moment lets the next one try as well.
  const due = [];
  if (star >= 2 && g.polM === P_TAIL) due.push(g.ramNext);
  if (star >= 3 && g.hOn && g.drT < 0) due.push(g.drNext);
  if (star >= 4 && g.icM === I_OFF) due.push(g.icNext); else if (g.icM === I_PACE || g.icM === I_COME) due.push(g.icT);     // (an interceptor on its way, or riding level, goes before the others)
  const turn = (t) => { if (gt < t) return false; for (const d of due) if (d < t - 1e-9 && gt - d < 2) return false; return true; };
  const learn = (from) => { const d = Math.sign(inp.lane - from); if (d) { g.bias += (d - g.bias) * 0.35; g.dodges++; g.score += G.ptsDodge * mult; out.push({ k: 'dodge', pts: Math.round(G.ptsDodge * mult) }); } };   // which way this driver dodges

  // ── police: the pursuit car (always there; from two stars it comes up with the grappler) ──
  const eK = (tau) => 1 - Math.exp(-DT / tau);
  if (g.polM === P_TAIL) {
    const close = policeClose(g);
    const near = gt < G.introClose || gt < g.pcl || gt < g.stG + 1.5;                // right on the bumper: the opening, lingering on the brake, just after a hit
    g.polZ += ((close ? (near ? -G.polClose : -G.chaseZ) : -G.polFar) - g.polZ) * eK(close ? (near ? 0.3 : 0.9) : 1.1);
    g.polX += (px + (close && !near ? (px > 0.5 ? -G.chaseX : G.chaseX) : 0) - g.polX) * eK(close && !near ? 0.5 : 0.3);   // on a long chase it sits off our rear quarter, on the side with more road
    const tRam = ramLen(warn);
    if (star >= 2 && turn(g.ramNext) && may(tRam, inp.lane !== 0)) {
      const l = inp.lane;
      if (fair([[l, warn + 0.05, tRam]])) {
        g.polM = P_WARN; g.polT = gt; g.polLane = l; g.polF = 0; g.polW = warn;
        go('ramwarn', { lane: l });
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
      if (u >= g.polW) { g.polM = P_CHARGE; g.polT = gt; learn(g.polLane); out.push({ k: 'ram', lane: g.polLane }); }
    } else if (g.polM === P_CHARGE) {
      g.polZ += G.ramV * DT;
      if (g.polZ >= -HOOK_Z && g.polZ < -(POL_HL + CAR_HL) && Math.abs(px - g.polX) < HOOK_W && !inp.nitro && gt >= g.inv) {
        g.inv = gt + G.swipeInv; g.slow = gt + G.ramSlow; g.polM = P_HOOK; g.polT = gt;      // still in its lane: hooked
        stumble(g, out, 'hook'); rest();
      } else if (g.polZ >= 1.5) { g.polM = P_BACK; g.polT = gt; rest(); }
    } else {
      g.polZ -= G.ramBack * DT * Math.min(1, u / 0.25);
      if (g.polZ <= -G.polFar) { g.polM = P_TAIL; g.ramNext = gt + (G.ramEvery[0] + rnd(g) * (G.ramEvery[1] - G.ramEvery[0])) * (g.lives < 2 ? G.chaseRam : 1) * cad; }
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

  // ── police: the interceptor, from four stars. It comes up the hard shoulder on the side we are on (from the middle lane: on the side this
  //    driver usually dodges to, so the usual way out is the one it takes away), draws level, and works its way across towards us a lane at
  //    a time. Each move is signalled for the length of a warning and only made if it leaves us a way through. ──
  if (g.icM === I_OFF) {
    if (star >= 4 && turn(g.icNext) && think && gt > G.introT + 4) {
      g.icA = inp.lane !== 0 ? inp.lane : g.bias > 0.15 ? 1 : g.bias < -0.15 ? -1 : g.hSide;
      g.icM = I_COME; g.icT = gt; g.icZ = G.icZ0; g.icX = g.icA * G.icShoulder; g.icF = 0;
      out.push({ k: 'icwarn', side: g.icA });
    }
  } else {
    const u = gt - g.icT, m0 = g.icM, a = g.icA;
    if (g.icM === I_COME) {
      g.icZ = Math.min(G.icZp, g.icZ + G.icV * DT);
      if (g.icZ >= G.icZp) { g.icM = I_PACE; g.icT = gt; }
    } else if (g.icM === I_PACE) {
      const p = inp.lane;
      if (u > G.icWait || star < 4) { g.icM = I_LEAVE; g.icT = gt; }                 // no opening, or called off: it drops back
      else if (u >= G.icPace && think && p !== -a) {                                   // our lane is the one beside it, or the middle one: it can reach us
        const cells = icMoveCells(g.icX, p, warn), T = icMoveT(g.icX, p);
        if (may(cells[0][2], p === a) && (p === a || laneWin(g, a, inp.vel, warn + T * 0.12 - 0.1, warn + T * 0.85 + 0.1)) && fair(cells)) {
          g.icM = I_TELL; g.icT = gt; g.icFrom = g.icX; g.icTo = p; g.icW = warn;
          go('ictell', { lane: p, side: a });
        }
      }
    } else if (g.icM === I_TELL) {
      if (u >= g.icW) { g.icM = I_SLAM; g.icT = gt; learn(g.icTo); out.push({ k: 'slam', lane: g.icTo, side: a }); }
    } else if (g.icM === I_SLAM) {
      const m = u / icMoveT(g.icFrom, g.icTo); g.icX = g.icFrom + (g.icTo - g.icFrom) * sCurve(m);
      if (m >= 1) { g.icX = g.icTo; g.icT = gt; g.icM = I_HOLD; }
    } else if (g.icM === I_HOLD) {
      if (u >= G.icHold) { g.icM = I_LEAVE; g.icT = gt; rest(); }
    } else {
      g.icZ -= G.icBack * DT * Math.min(1, u / 0.25);
      if (g.icZ <= G.icZ0 - 2) { g.icM = I_OFF; g.icZ = -60; g.icNext = Math.max(g.icNext, gt + (G.icEvery[0] + rnd(g) * (G.icEvery[1] - G.icEvery[0])) * cad); }
    }
    // contact with the interceptor
    const ix = g.icX * L, lat = Math.abs(px - ix) < POL_HW + CAR_HW - 0.12, lon = Math.abs(g.icZ) < POL_HL + CAR_HL - 0.2;
    if (lat && lon) {
      if (inp.nitro) { if (g.icM !== I_LEAVE) rest(); g.icM = I_LEAVE; g.icT = gt; g.icNext = gt + G.icOut; g.smash++; g.score += G.ptsSmash * mult; addHeat(g, G.heatCruiser); out.push({ k: 'shove', ic: 1 }); }
      else if (gt >= g.inv) {
        g.inv = gt + G.swipeInv; addHeat(g, G.heatSwipe);
        const dir = px < ix ? -1 : 1, back = clamp(Math.round(g.icX) + dir, -1, 1);
        if (m0 === I_SLAM || (g.icF & LAT)) { g.slow = gt + G.ramSlow; stumble(g, out, 'slam'); }      // it drove into us
        else stumble(g, out, 'swipe');                                                                    // we steered into it
        out.push({ k: 'swipe', back, dir, lane: Math.round(g.icX) });
        if (g.icM !== I_LEAVE) { g.icM = I_LEAVE; g.icT = gt; g.icX = Math.round(g.icX); rest(); }
      }
    }
    g.icF = lat ? LAT : 0;
  }

  // ── police: the helicopter, from three stars. It comes and goes: flies in, settles, attacks a few times, flies off, and is back a while
  //    later. Its searchlight locks a lane, then it fires down the beam. From four stars it may light two lanes at once: ours and the one
  //    beside it that leaves us the harder way out (and, between equals, the side we usually dodge to). At five it may walk a barrage
  //    across all three lanes, one after the other: the way out is back into its wake. ──
  if (star >= 3) {
    if (!g.hOn && g.drT < 0 && gt >= g.hNext) { g.hOn = 1; g.hLeft = G.heliPasses + Math.min(2, Math.floor(lv / 4)); g.hSide = -g.hSide; g.drNext = gt + G.heliSettle; g.drWant = -1; }
  } else if (g.hOn) { g.hOn = 0; g.hNext = gt + 4; }
  if (star >= 3 && (g.hOn || g.drT >= 0)) {
    if (g.drT < 0) {
      if (turn(g.drNext) && think) {
        if (g.drWant < 0) { const r = rnd(g), P = G.heliPat[star]; g.drWant = r < P[0] ? H_TWIN : r < P[0] + P[1] ? H_WALK : H_LANE; }   // what it means to do this time
        const l = inp.lane, want = gt > g.drNext + 2.5 ? H_LANE : g.drWant, side = g.bias > 0.15 ? 1 : g.bias < -0.15 ? -1 : g.hSide;
        let pick = null, hard = 0;
        // it tries each way of doing it, firing on time or a little late, and takes the one that leaves a way through but the hardest one
        const tryIt = (pat, ln, b) => { for (const late of (pat ? G.drLate : [0])) { const S = heliStrikes(pat, ln, b, warn + 0.1 + late); if (!may(S[S.length - 1][2], pat === H_LANE && ln !== 0)) return; const n = fair(S.map(([x, t0, t1]) => [x, t0 - 0.1, t1 + 0.05])); if (n > hard) { hard = n; pick = [pat, ln, b, warn + 0.1 + late]; } } };
        if (want === H_TWIN) { for (const b of (l === 0 ? [side, -side] : [0])) tryIt(H_TWIN, l, b); }
        else if (want === H_WALK) { for (const b of [side, -side]) tryIt(H_WALK, -b, b); }
        else tryIt(H_LANE, l, 0);
        if (pick) {
          g.drT = gt; g.drPat = pick[0]; g.drLane = pick[1]; g.drB = pick[2]; g.drW = pick[3]; g.drAcc = 0; g.drHit = 0; g.drS = 0; g.drWant = -1;
          go('lock', { lane: pick[1], pat: pick[0], b: pick[2] });
        }
      }
    } else {
      const u = gt - g.drT, S = heliStrikes(g.drPat, g.drLane, g.drB, g.drW), end = S[S.length - 1][2];
      let n = 0, on = 0;
      for (const [ln, t0, t1] of S) { if (u >= t0) n++; if (u >= t0 && u < t1 && Math.abs(px - ln * L) < 2.0) on = 1; }
      if (n > g.drS) { if (!g.drS) learn(g.drLane); g.drS = n; g.drAcc = 0; out.push({ k: 'strike', lane: S[n - 1][0] }); }
      if (on && !inp.nitro && gt >= g.inv) {
        g.drAcc += DT;
        if (g.drAcc >= 0.1 && !g.drHit) { g.drHit = 1; g.slow = gt + G.ramSlow; g.inv = gt + G.swipeInv; stumble(g, out, 'heli'); }
      }
      if (u >= end) {
        g.drT = -1; g.drNext = gt + G.drEvery * cad; rest();
        if (--g.hLeft <= 0) { g.hOn = 0; g.hNext = gt + (G.heliAway[0] + rnd(g) * (G.heliAway[1] - G.heliAway[0])) * cad; }   // done for now: it flies off
      }
    }
  } else { g.drT = -1; g.drNext = gt + 3; }
  // where the helicopter hangs and where its searchlight falls: wandering while it searches, on the lane once locked
  // (what it aims at: the lane it is firing on or will fire on next; with two lanes lit at once, the one we are in)
  let aim = g.drLane;
  if (g.drT >= 0 && g.drPat === H_WALK) { const u = gt - g.drT; for (const [ln, , t1] of heliStrikes(g.drPat, g.drLane, g.drB, g.drW)) { aim = ln; if (u < t1) break; } }
  const lk = g.drT >= 0, hT = lk ? aim * L : Math.sin(gt * 0.37) * 6;
  g.hb += (clamp((hT - g.hx) * 0.045, -0.3, 0.3) - g.hb) * eK(0.2);          // it banks into its sideways moves
  g.hx += (hT - g.hx) * eK(lk ? 0.3 : 0.9);
  g.ha += (g.hOn - g.ha) * eK(g.hOn ? 0.8 : 1.0);                            // flying in, or flying off
  g.sx += ((lk ? aim * L : px + Math.sin(gt * 0.9) * L * 1.1) - g.sx) * eK(lk ? 0.09 : 0.45);
  g.sk += ((lk ? 1 : 0) - g.sk) * eK(lk ? 0.1 : 0.25);

  g.score += inp.vel * DT * G.ptsDist * mult;
}
