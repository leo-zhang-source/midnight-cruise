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
export const T_CAR = 1, T_VAN = 2, T_TRUCK = 3, T_TAXI = 4, T_BLOCK = 5;
export const HALF_L = [0, 2.4, 2.75, 6.2, 2.4, 2.5];
export const HALF_W = [0, 1.05, 1.15, 1.4, 1.05, 2.4];
export const CAR_HL = 2.2, CAR_HW = 0.95;
export const POL_HL = 2.4, POL_HW = 1.05;                  // the pursuit car
// pursuit car modes: on the tail, lining up for a ram, charging, dropping back
export const P_TAIL = 0, P_WARN = 1, P_CHARGE = 2, P_BACK = 3;
const LAT = 1, LON = 2, THREAT = 4, NEAR = 8, PASSED = 16;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function freshGame(seed = 1986, free = 0) {
  return {
    seed, free: free ? 1 : 0, rs: seed | 0, gt: 0, gd: 0,
    veh: new Float64Array(NV * VF), cel: new Float64Array(NC * CF), itm: new Float64Array(NI * IF), nid: 1,
    genU: GAME.firstRow, genI: 0, path: 0, lastPat: 0, itmNext: GAME.nitroFirst,
    score: 0, cells: 0, combo: 0, best: 0, near: 0, smash: 0, passed: 0, vmax: 0, starMax: 1, gear: 0,
    nstock: free ? 1 : 0, nfree: 0,
    heat: 1, heatGt: -1e9, star: 1,
    pcl: 0, stG: 0, slow: 0, brkAcc: 0,                                              // tail-close until, stumble grace until, slowed until
    polM: P_TAIL, polT: 0, polLane: 0, polZ: -GAME.polClose, polX: 0, polF: 0, ramNext: GAME.ramFirst,
    drT: -1, drLane: 0, drHit: 0, drS: 0, drAcc: 0, drNext: 0,
    inv: 0, draft: 0, draftEv: -1e9, goEv: 0, over: 0,
  };
}
export function copyGame(g) { const c = { ...g }; c.veh = g.veh.slice(); c.cel = g.cel.slice(); c.itm = g.itm.slice(); return c; }
export const gameMult = (g) => (1 + Math.min(g.combo, GAME.comboCap) * GAME.comboStep) * (1 + GAME.starBonus * (g.star - 1));
export const gameBase = (g) => GAME.gears[g.gear] + Math.min(GAME.creep[1], Math.max(0, g.gd - GAME.gearAt[5]) / GAME.creep[0]);
// is the pursuit car on the tail right now (opening of a run, after a stumble, or after lingering on the brake)?
export const policeClose = (g) => g.gt < GAME.introClose || g.gt < g.pcl;

function rnd(g) {
  let t = (g.rs = (g.rs + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// u: position in the traffic frame (constant for same-direction traffic); z = u + vTraffic·gt
function spawn(g, type, lane, u, a = 0, b = 0) {
  const veh = g.veh;
  for (let i = 0; i < NV; i++) {
    const o = i * VF; if (veh[o]) continue;
    veh[o] = type; veh[o + 1] = lane; veh[o + 2] = u + GAME.vTraffic * g.gt; veh[o + 3] = GAME.vTraffic; veh[o + 4] = HALF_L[type];
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
function canister(g, lane, u) {
  const itm = g.itm;
  for (let i = 0; i < NI; i++) { const o = i * IF; if (itm[o]) continue; itm[o] = 1; itm[o + 1] = lane; itm[o + 2] = u + GAME.vTraffic * g.gt; return; }
}

// One row of traffic at u = g.genU. `g.path` is a lane the previous row left open; every row leaves a lane
// open within one lane of it, so a route through always exists at the gear's cruising speed.
function genRow(g) {
  const G = GAME, gear = g.gear, u = g.genU, p = g.path, i = g.genI++;
  const w = G.gears[gear] - G.vTraffic;
  const tg = G.rowGap[0] + (G.rowGap[1] - G.rowGap[0]) * (gear / 5);
  const side = () => (rnd(g) < 0.5 ? -1 : 1);
  const adj = (l) => (l === 0 ? side() : 0);                 // a lane next to l
  const third = (a, b) => -(a + b);                           // the lane that is neither a nor b (lanes sum to 0)
  const block = i >= 3 && rnd(g) < G.blockP[g.star];          // a police roadblock instead of traffic
  let len = 5;
  const put = (lane) => {
    if (block) { spawn(g, T_BLOCK, lane, u); return; }
    const r = rnd(g), type = r < 0.46 ? T_CAR : r < 0.72 ? T_VAN : T_TRUCK;
    if (type === T_TRUCK) len = 12.4;
    spawn(g, type, lane, u);
  };
  let f = p, pat;

  const r = rnd(g);
  const wConvoy = 0.10 + 0.05 * gear, wGate = 0.08 + 0.02 * gear, wTaxi = gear >= 1 && !block ? 0.14 : 0, wRest = 0.06;
  const wSingle = 0.40, wDecoy = 0.20;
  let x = r * (wSingle + wConvoy + wDecoy + wGate + wTaxi + wRest);
  if (block) pat = r < 0.6 ? 2 : 4;
  else if (i < 3) pat = i === 0 ? 1 : (r < 0.7 ? 1 : 3);
  else if ((x -= wSingle) < 0) pat = 1;
  else if ((x -= wConvoy) < 0) pat = 2;
  else if ((x -= wDecoy) < 0) pat = 3;
  else if ((x -= wGate) < 0) pat = 4;
  else if ((x -= wTaxi) < 0) pat = 5;
  else pat = 0;
  if ((pat === 3 || pat === 4 || pat === 0) && (g.lastPat === 3 || g.lastPat === 4 || g.lastPat === 0)) pat = block ? 2 : 1;   // never two rows in a row that need no move
  g.lastPat = pat;

  if (pat === 1) {                       // the open lane is blocked: move one lane over
    f = adj(p); put(p);
  } else if (pat === 2) {                // two side by side, one lane left
    f = adj(p); put(p); put(third(p, f));
  } else if (pat === 3) {                // a vehicle in another lane
    put(p === 0 ? side() : (rnd(g) < 0.5 ? 0 : -p));
  } else if (pat === 4) {                // both other lanes blocked
    const a = p === 0 ? -1 : 0, b = p === 0 ? 1 : -p; put(a); put(b);
  } else if (pat === 5) {                // a taxi in the middle lane that cuts to one side as you close in
    const d = side();
    spawn(g, T_TAXI, 0, u, d, 0);
    cellLine(g, p === 0 ? -d : p, u - 26, 4, 6);
    g.path = 0; g.genU = u + 5 + w * tg * 1.25;
    return;
  } else {                               // breather: a zig-zag of cells
    const l2 = adj(p);
    cellLine(g, p, u - 14, 4, 6); cellLine(g, l2, u + 14, 4, 6);
    g.path = p; g.genU = u + 36 + w * tg * 0.6;
    return;
  }
  cellLine(g, f, u - 12, 5, 6);            // cells mark the open lane
  const next = u + len + w * tg * (0.9 + 0.3 * rnd(g));
  // a nitro canister now and then, half-way to the next row, one lane off the straight route when there is room
  if (u >= g.itmNext) {
    g.itmNext = u + G.nitroEvery[0] + rnd(g) * (G.nitroEvery[1] - G.nitroEvery[0]);
    canister(g, f === 0 ? side() : (rnd(g) < 0.5 ? f : 0), (u + len * 0.5 + next) * 0.5);
  }
  g.path = f;
  g.genU = next;
}

function addHeat(g, n) { g.heat = Math.min(3.999, g.heat + n); g.heatGt = g.gt; }
// A stumble: the pursuit car closes in. A second one while it is on the tail ends the run.
function stumble(g, out, by) {
  const gt = g.gt;
  if (gt < g.stG) return false;                              // still reeling from the last one
  g.combo = 0;
  if (gt < g.pcl) { g.over = 2; out.push({ k: 'bust', by }); return true; }
  g.pcl = gt + GAME.closeT; g.stG = gt + GAME.stumbleGrace;
  out.push({ k: 'stumble', by });
  return true;
}
// a taxi ahead that has yet to cut across: the police hold off, so the squeeze is never unfair
function taxiPending(g) {
  const veh = g.veh;
  for (let i = 0; i < NV; i++) { const o = i * VF; if (veh[o] === T_TAXI && veh[o + 6] !== 0 && veh[o + 2] - g.gd > -6) return true; }
  return false;
}
// is lane l clear of traffic around the car for the next `secs` seconds?
function laneClear(g, l, vel, secs) {
  const veh = g.veh, L = ROAD.lane;
  for (let i = 0; i < NV; i++) {
    const o = i * VF, type = veh[o]; if (!type) continue;
    if (Math.abs(veh[o + 1] - l) * L > HALF_W[type] + CAR_HW + 0.4 && !(type === T_TAXI && veh[o + 6] !== 0 && (l === 0 || l === veh[o + 6]))) continue;
    const dz = veh[o + 2] - g.gd, reach = veh[o + 4] + CAR_HL + 1.5, rel = Math.max(1, vel * 1.12 - veh[o + 3]);   // margin for a gear change
    if (dz > -reach && dz < reach + rel * secs) return false;
  }
  return true;
}

// inp: { dt, x (car lateral position), lane (target lane), vel, brk (brake held), nitro (smashing through) }
// out: receives events { k, … }: gear, near, smash, swipe{back,dir}, crash, bust, stumble{by}, star, ramwarn, ram,
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
        addHeat(g, type === T_BLOCK ? 1 : G.heatSmash);
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
      if (lat && type !== T_BLOCK && gap > 0 && gap < clamp(rel * G.draftT, 12, 60)) draft = 1;
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
    cel[o + 2] += G.vTraffic * DT;
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
    itm[o + 2] += G.vTraffic * DT;
    const dz = itm[o + 2] - gd;
    if (dz < -8) { itm[o] = 0; continue; }
    if (Math.abs(dz) < 2.6 && Math.abs(px - itm[o + 1] * L) < 2.1) {
      itm[o] = 0;
      if (g.nstock < G.nitroMax) g.nstock++; else g.score += 500 * mult;
      out.push({ k: 'item', n: g.nstock });
    }
  }

  // ── police: stars ──
  const floor = gd >= G.star3At ? 3 : gd >= G.star2At ? 2 : 1;
  if (g.heat < floor) g.heat = floor;
  else if (g.heat > floor && gt - g.heatGt > G.heatHold) g.heat = Math.max(floor, g.heat - DT / G.heatDecay);
  const star = Math.min(3, Math.floor(g.heat + 1e-9));
  if (star !== g.star) { out.push({ k: 'star', n: star, up: star > g.star ? 1 : 0 }); g.star = star; if (star > g.starMax) g.starMax = star; }

  // lingering on the brake lets the pursuit car catch up
  if (inp.brk) g.brkAcc += DT; else g.brkAcc = Math.max(0, g.brkAcc - 2 * DT);
  if (g.brkAcc > G.brakeLinger && gt >= g.pcl - 1) { if (gt >= g.pcl) out.push({ k: 'tail' }); g.pcl = gt + 1.6; }

  // ── police: the pursuit car (always there; at two stars it rams) ──
  const eK = (tau) => 1 - Math.exp(-DT / tau);
  if (g.polM === P_TAIL) {
    const close = policeClose(g);
    g.polZ += ((close ? -G.polClose : -G.polFar) - g.polZ) * eK(close ? 0.3 : 1.1);
    g.polX += (px - g.polX) * eK(0.3);
    if (g.star >= 2 && gt >= g.ramNext && gt > G.introT + 4 && g.drT < 0 && !inp.nitro && !taxiPending(g)) {
      const l = inp.lane, s = G.ramClear;
      if (laneClear(g, l, inp.vel, G.ramOwn) && ((l > -1 && laneClear(g, l - 1, inp.vel, s)) || (l < 1 && laneClear(g, l + 1, inp.vel, s)))) {
        g.polM = P_WARN; g.polT = gt; g.polLane = l; g.polF = 0;
        out.push({ k: 'ramwarn', lane: l });
      }
    }
  } else {
    const u = gt - g.polT;
    g.polX += (g.polLane * L - g.polX) * eK(0.1);
    if (g.polM === P_WARN) {
      g.polZ += (-(G.polClose + 2) - g.polZ) * eK(0.25);
      if (u >= G.ramWarn) { g.polM = P_CHARGE; g.polT = gt; out.push({ k: 'ram', lane: g.polLane }); }
    } else if (g.polM === P_CHARGE) {
      g.polZ += G.ramV * DT;
      if (g.polZ >= 1.5) { g.polM = P_BACK; g.polT = gt; }
    } else {
      g.polZ -= G.ramBack * DT * Math.min(1, u / 0.25);
      if (g.polZ <= -G.polFar) { g.polM = P_TAIL; g.ramNext = gt + G.ramEvery[0] + rnd(g) * (G.ramEvery[1] - G.ramEvery[0]); }
    }
    // contact with the pursuit car
    const lat = Math.abs(px - g.polX) < POL_HW + CAR_HW - 0.12, lon = Math.abs(g.polZ) < POL_HL + CAR_HL - 0.2;
    if (lat && lon && g.polM !== P_WARN) {
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

  // ── police: drone strikes from three stars ──
  if (g.star >= 3) {
    if (g.drT < 0) {
      if (gt >= g.drNext && g.polM === P_TAIL && !taxiPending(g)) {
        const l = inp.lane, s = G.drClear;
        if ((l > -1 && laneClear(g, l - 1, inp.vel, s)) || (l < 1 && laneClear(g, l + 1, inp.vel, s))) {
          g.drT = gt; g.drLane = l; g.drAcc = 0; g.drHit = 0; g.drS = 0; out.push({ k: 'lock', lane: l });
        }
      }
    } else {
      const u = gt - g.drT;
      if (u >= G.drWarn && !g.drS) { g.drS = 1; out.push({ k: 'strike', lane: g.drLane }); }
      if (u >= G.drWarn && u < G.drWarn + G.drStrike && Math.abs(px - g.drLane * L) < 2.0 && !inp.nitro && gt >= g.inv) {
        g.drAcc += DT;
        if (g.drAcc >= 0.1 && !g.drHit) { g.drHit = 1; g.slow = gt + G.ramSlow; g.inv = gt + G.swipeInv; stumble(g, out, 'emp'); }
      }
      if (u >= G.drWarn + G.drStrike) { g.drT = -1; g.drNext = gt + G.drEvery; }
    }
  } else { g.drT = -1; g.drNext = gt + 3; }

  g.score += inp.vel * DT * G.ptsDist * mult;
}
