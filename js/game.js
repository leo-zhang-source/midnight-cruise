// ─────────────────────────────────────────────────────────────────────────────
// The game simulation: traffic, cells, collisions, score, nitro charge, wanted level.
// Pure and deterministic: stepGame(g, input, out) advances the state object `g` by one fixed step.
// No DOM, no three.js — it runs on the main thread, in the AudioWorklet and in Node (tools/bot.mjs).
// Coordinates: z runs along the road, the player's car is at z = g.gd; x = lane × ROAD.lane.
// ─────────────────────────────────────────────────────────────────────────────
import { GAME, ROAD } from './cue.js';

export const NV = 28, VF = 9;      // vehicle pool: [type, lane, z, v, halfLen, flags, a, b, id]
export const NC = 16, CF = 5;      // cell lines:   [count, lane, z0, spacing, takenMask]
export const T_TRUCK = 1, T_TAXI = 2, T_ONC = 3, T_WALL = 4;
export const HALF_W = [0, 1.2, 1.0, 1.0, 2.0];
export const CAR_HL = 2.2, CAR_HW = 0.95;
const LAT = 1, LON = 2, THREAT = 4, NEAR = 8, PASSED = 16;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function freshGame(seed = 1986, free = 0) {
  return {
    seed, free: free ? 1 : 0, rs: seed | 0, gt: 0, gd: 0,
    veh: new Float64Array(NV * VF), cel: new Float64Array(NC * CF), nid: 1,
    genU: GAME.firstRow, genI: 0, path: 0, lastPat: 0, oncLane: 0, oncUntil: 0, oncNext: GAME.oncEvery[1],
    score: 0, cells: 0, combo: 0, best: 0, near: 0, smash: 0, passed: 0, vmax: 0, heatMax: 0,
    nitro: free ? 1 : GAME.nitroStart, nf: free ? 1 : 0, heat: 0, heatGt: -1e9, lvl: 0, gear: 0,
    drT: -1, drLane: 0, drHit: 0, drAcc: 0, drNext: 0,
    inv: 0, draft: 0, draftEv: -1e9, over: 0,
  };
}
export function copyGame(g) { const c = { ...g }; c.veh = g.veh.slice(); c.cel = g.cel.slice(); return c; }
export const gameLevel = (g) => g.lvl;
export const gameMult = (g) => (1 + Math.min(g.combo, GAME.comboCap) * GAME.comboStep) * (1 + GAME.heatBonus * g.lvl);
export const gameBase = (g) => GAME.gears[g.gear] + Math.min(GAME.creep[1], Math.max(0, g.gd - GAME.gearAt[5]) / GAME.creep[0]);

function rnd(g) {
  let t = (g.rs = (g.rs + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// u: position in the traffic frame (constant for same-direction traffic); z = u + vTraffic·gt
function spawn(g, type, lane, u, v, hl, a = 0, b = 0) {
  const veh = g.veh;
  for (let i = 0; i < NV; i++) {
    const o = i * VF; if (veh[o]) continue;
    veh[o] = type; veh[o + 1] = lane; veh[o + 2] = u + GAME.vTraffic * g.gt; veh[o + 3] = v; veh[o + 4] = hl;
    veh[o + 5] = 0; veh[o + 6] = a; veh[o + 7] = b; veh[o + 8] = g.nid++;
    return i;
  }
  return -1;
}
function cellLine(g, lane, u0, n, sp) {
  const cel = g.cel;
  for (let i = 0; i < NC; i++) {
    const o = i * CF; if (cel[o]) continue;
    cel[o] = n; cel[o + 1] = lane; cel[o + 2] = u0 + GAME.vTraffic * g.gt; cel[o + 3] = sp; cel[o + 4] = 0;
    return;
  }
}

// One row of traffic at u = g.genU. `g.path` is a lane the previous row left open; every row leaves a lane
// open within one lane of it, so a route through always exists at the gear's base speed.
function genRow(g) {
  const G = GAME, gear = g.gear, u = g.genU, p = g.path, i = g.genI++;
  const w = G.gears[gear] - G.vTraffic;
  const tg = G.rowGap[0] + (G.rowGap[1] - G.rowGap[0]) * (gear / 5);
  const side = () => (rnd(g) < 0.5 ? -1 : 1);
  const adj = (l) => (l === 0 ? side() : 0);                 // a lane next to l
  const third = (a, b) => -(a + b);                           // the lane that is neither a nor b (lanes sum to 0)
  const wall = g.lvl >= 3 && rnd(g) < G.wallP;
  const block = (lane, type = wall ? T_WALL : T_TRUCK) => spawn(g, type, lane, u, G.vTraffic, type === T_WALL ? 0.6 : type === T_TRUCK ? 4.5 : 2.2);
  let len = 9, f = p, pat;

  // an oncoming car is planned: keep its outer lane and the middle lane clear until it has been launched
  if (g.oncLane !== 0) {
    if (u >= g.oncUntil) {
      spawn(g, T_ONC, g.oncLane, u, G.vOncoming, 2.2);
      g.oncLane = 0; g.oncNext = u + G.oncEvery[0] + rnd(g) * (G.oncEvery[1] - G.oncEvery[0]);
      g.genU = u + 30; g.path = 0;
      return;
    }
    const far = -g.oncLane;
    if (rnd(g) < 0.7) block(far, T_TRUCK);
    cellLine(g, 0, u - 10, 5, 5);
    g.path = 0; g.genU = u + len + w * tg * (0.9 + 0.3 * rnd(g));
    return;
  }
  if (gear >= G.oncFrom && u >= g.oncNext && !wall) {
    g.oncLane = side(); g.oncUntil = u + G.ahead * 0.62; g.path = 0;
    cellLine(g, 0, u - 10, 5, 5);
    g.genU = u + 14;
    return;
  }

  // pattern weights by gear
  const r = rnd(g);
  const wConvoy = 0.10 + 0.05 * gear, wGate = 0.08 + 0.02 * gear, wTaxi = gear >= 1 && !wall ? 0.14 : 0, wRest = 0.06;
  const wSingle = 0.40, wDecoy = 0.20;
  const tot = wSingle + wConvoy + wDecoy + wGate + wTaxi + wRest;
  let x = r * tot;
  if (i < 3) pat = i === 0 ? 1 : (r < 0.7 ? 1 : 3);
  else if ((x -= wSingle) < 0) pat = 1;
  else if ((x -= wConvoy) < 0) pat = 2;
  else if ((x -= wDecoy) < 0) pat = 3;
  else if ((x -= wGate) < 0) pat = 4;
  else if ((x -= wTaxi) < 0) pat = 5;
  else pat = 0;
  if ((pat === 3 || pat === 4 || pat === 0) && (g.lastPat === 3 || g.lastPat === 4 || g.lastPat === 0)) pat = 1;   // never two rows in a row that need no move
  g.lastPat = pat;

  if (pat === 1) {                       // block the open lane: move one lane over
    f = adj(p); block(p);
    if (rnd(g) < 0.35) cellLine(g, p, u - 26, 3, 5);          // slipstream bait behind the truck
  } else if (pat === 2) {                // convoy: two side by side, one lane left
    f = adj(p); block(p); block(third(p, f));
  } else if (pat === 3) {                // decoy: a truck in another lane
    block(p === 0 ? side() : (rnd(g) < 0.5 ? 0 : -p));
  } else if (pat === 4) {                // gate: both other lanes blocked
    const a = p === 0 ? -1 : 0, b = p === 0 ? 1 : -p; block(a); block(b);
  } else if (pat === 5) {                // taxi in the middle lane that cuts to one side as you close in
    const d = side();
    spawn(g, T_TAXI, 0, u, G.vTraffic, 2.2, d, 0);
    f = 0; len = 4.4;
    cellLine(g, p === 0 ? -d : p, u - 22, 4, 5);
    g.path = 0; g.genU = u + len + w * tg * 1.25;
    return;
  } else {                               // breather: a zig-zag of cells
    const l2 = adj(p);
    cellLine(g, p, u - 12, 4, 5); cellLine(g, l2, u + 12, 4, 5);
    g.path = p; g.genU = u + 30 + w * tg * 0.6;
    return;
  }
  cellLine(g, f, u - 10, 5, 5);            // cells mark the open lane
  g.path = f;
  g.genU = u + len + w * tg * (0.9 + 0.3 * rnd(g));
}

// inp: { dt, x (car lateral position), lane (target lane), vel, thr, nitro (smashing through) }
// out: receives events { k, … }: gear, near, smash, swipe{back,dir}, crash, bust, heat, lock, scan, draft, full, cell, tape
export function stepGame(g, inp, out) {
  const DT = inp.dt, G = GAME, L = ROAD.lane;
  g.gt += DT; g.gd += inp.vel * DT;
  const gt = g.gt, gd = g.gd, px = inp.x;
  let gear = g.gear; while (gear < 5 && gd >= G.gearAt[gear + 1]) gear++;
  if (gear !== g.gear) { g.gear = gear; out.push({ k: 'gear', n: gear + 1 }); }
  if (g.gt > 1.5 && inp.vel > g.vmax) g.vmax = inp.vel;   // ignore the hand-over from the intro
  if (g.free) {
    g.nitro = Math.min(1, g.nitro + G.nitroFree * DT);
    if (g.nitro >= 1 && !g.nf) { g.nf = 1; out.push({ k: 'full' }); }
    g.score += inp.vel * DT * G.ptsDist * (1 + inp.thr);
    return;
  }
  const up = gd - G.vTraffic * gt;
  for (let n = 0; g.genU < up + G.ahead && n < 6; n++) genRow(g);
  let mult = gameMult(g);

  // ── vehicles ──
  const veh = g.veh; let draft = 0;
  for (let i = 0; i < NV; i++) {
    const o = i * VF, type = veh[o]; if (!type) continue;
    if (type === T_TAXI && veh[o + 6] !== 0) {       // a: side it will cut to, b: time it started signalling
      if (veh[o + 7] === 0) {
        const gap0 = veh[o + 2] - gd - (veh[o + 4] + CAR_HL);
        if (gap0 < (inp.vel - veh[o + 3]) * G.taxiAt) veh[o + 7] = gt;
      } else {
        const m = (gt - veh[o + 7] - G.taxiBlink) / G.taxiMove;
        if (m >= 1) { veh[o + 1] = veh[o + 6]; veh[o + 6] = 0; }
        else if (m > 0) veh[o + 1] = veh[o + 6] * (m * m * (3 - 2 * m));
      }
    }
    veh[o + 2] += veh[o + 3] * DT;
    const dz = veh[o + 2] - gd, reach = veh[o + 4] + CAR_HL;
    if (dz < -G.despawn) { veh[o] = 0; continue; }
    const vx = veh[o + 1] * L, dx = Math.abs(px - vx);
    const lat = dx < HALF_W[type] + CAR_HW - 0.12, lon = Math.abs(dz) < reach - 0.2;
    let fl = veh[o + 5];
    const rel = inp.vel - veh[o + 3], gap = dz - reach;
    if (lat && lon) {
      if (inp.nitro) {
        veh[o] = 0; g.smash++; g.combo++; g.score += G.ptsSmash * mult;
        g.heat = Math.min(3, g.heat + G.heatSmash); g.heatGt = gt;
        out.push({ k: 'smash', lane: veh[o + 1], dz, type });
        continue;
      }
      if (gt >= g.inv) {
        const wasLon = fl & LON, wasLat = fl & LAT;
        if (type !== T_ONC && (wasLon ? !wasLat : !wasLat)) {
          // sideswipe: we moved into a vehicle that was already alongside (or cut the corner): bounce back
          const dir = px < vx ? -1 : 1;
          const back = clamp(Math.round(veh[o + 1]) + dir, -1, 1);
          g.combo = 0; g.inv = gt + G.swipeInv;
          if (g.heat >= 3 - 1e-9) { g.over = 2; out.push({ k: 'bust' }); }
          else { g.heat = Math.min(3, Math.floor(g.heat + 1e-9) + 1); g.heatGt = gt; }
          out.push({ k: 'swipe', back, dir, lane: veh[o + 1] });
        } else {
          g.over = 1; out.push({ k: 'crash', type, lane: veh[o + 1] });
        }
      }
    } else {
      const nearD = clamp(rel * G.nearT, 4, 30);
      if (lat && gap > 0 && gap < nearD) fl |= THREAT;
      if ((fl & THREAT) && !(fl & NEAR) && !lat && gap < nearD && dz > -reach) {
        fl |= NEAR; g.near++; g.combo += G.comboNear; g.score += G.ptsNear * mult;
        g.nitro = Math.min(1, g.nitro + G.nitroNear);
        out.push({ k: 'near', lane: veh[o + 1], pts: Math.round(G.ptsNear * mult) });
      }
      if (!(fl & PASSED) && dz < -reach) { fl |= PASSED; g.passed++; g.combo++; g.score += G.ptsPass * mult; }
      if (lat && type <= T_TAXI && gap > 0 && gap < clamp(rel * G.draftT, 10, 45)) draft = 1;
    }
    veh[o + 5] = (fl & ~(LAT | LON)) | (lat ? LAT : 0) | (lon ? LON : 0);
  }
  if (g.combo > g.best) g.best = g.combo;
  mult = gameMult(g);

  // ── slipstream and nitro charge ──
  g.draft += (draft - g.draft) * (1 - Math.exp(-DT / 0.15));
  if (draft) {
    g.nitro = Math.min(1, g.nitro + G.nitroDraft * DT);
    if (gt - g.draftEv > 2.5) { g.draftEv = gt; out.push({ k: 'draft' }); }
  }
  g.nitro = Math.min(1, g.nitro + G.nitroIdle * DT);
  if (g.nitro >= 1) { if (!g.nf) { g.nf = 1; out.push({ k: 'full' }); } } else g.nf = 0;

  // ── cells ──
  const cel = g.cel;
  for (let i = 0; i < NC; i++) {
    const o = i * CF, n = cel[o]; if (!n) continue;
    cel[o + 2] += G.vTraffic * DT;
    const z0 = cel[o + 2], sp = cel[o + 3];
    if (z0 + (n - 1) * sp < gd - 6) { cel[o] = 0; continue; }
    if (Math.abs(px - cel[o + 1] * L) > 1.7) continue;
    const k = Math.round((gd - z0) / sp);
    if (k < 0 || k >= n || Math.abs(z0 + k * sp - gd) > 2.0) continue;
    const bit = 1 << k;
    if (cel[o + 4] & bit) continue;
    cel[o + 4] |= bit; g.cells++; g.score += G.ptsCell * mult;
    g.nitro = Math.min(1, g.nitro + G.nitroCell);
    out.push({ k: 'cell' });
    if (g.cells % G.tapeEvery === 0) out.push({ k: 'tape' });
  }

  // ── wanted level and the police drone ──
  if (g.heat > 0 && gt - g.heatGt > G.heatHold) g.heat = Math.max(0, g.heat - DT / G.heatDecay);
  let lvl = Math.min(3, Math.ceil(g.heat - 1e-9));
  if (lvl >= 2) {
    if (g.drT < 0) {
      if (gt >= g.drNext) { g.drT = gt; g.drLane = inp.lane; g.drAcc = 0; g.drHit = 0; out.push({ k: 'lock', lane: inp.lane }); }
    } else {
      const u = gt - g.drT;
      if (u >= G.drWarn && u < G.drWarn + G.drStrike && Math.abs(px - g.drLane * L) < 1.7) {
        g.drAcc += DT;
        if (g.drAcc >= 0.12 && !g.drHit) {
          g.drHit = 1; g.heat = Math.min(3, Math.floor(g.heat + 1e-9) + 1); g.heatGt = gt;
          lvl = Math.min(3, Math.ceil(g.heat - 1e-9));
          out.push({ k: 'scan' });
        }
      }
      if (u >= G.drWarn + G.drStrike) { g.drT = -1; g.drNext = gt + G.drEvery; }
    }
  } else { g.drT = -1; g.drNext = gt + 2.5; }
  if (lvl !== g.lvl) { out.push({ k: 'heat', n: lvl, up: lvl > g.lvl ? 1 : 0 }); g.lvl = lvl; if (lvl > g.heatMax) g.heatMax = lvl; }

  g.score += inp.vel * DT * G.ptsDist * (1 + inp.thr) * mult;
}
