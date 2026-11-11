// The director: turns (scene time T, event timeline, viewport) into a complete frame
// description. Pure function — no wall clock, no hidden state.
import { IGN, BAR, TURBO, PRESETS, TITLE_EXIT, ROAD, LANE_FEEL, GAME, neonPower, drumPulse } from './cue.js';
import { DT } from './timeline.js';
import { NV, VF, NC, CF, NI, IF, T_TRUCK, T_TAXI, T_BLOCK, T_WEAVE, COMMIT, SIDE, P_WARN, P_CHARGE, P_BACK, P_HOOK, gameMult, policeClose, sCurveD, sCurveA, weave } from './game.js';
import { clamp, lerp, lin, smooth, smoother, easeOutCubic, easeInOutCubic, easeOutExpo, easeInCubic, spring, ring, hash1, vnoise, sat } from './util.js';
import { blendPalette } from './palette.js';

// Catmull-Rom through keys [[t, v], ...] (clamped ends) — C1 camera paths.
function cr(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  const n = keys.length;
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0; while (keys[i + 1][0] < t) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
  const u = (t - k1[0]) / (k2[0] - k1[0]);
  const m1 = (k2[1] - k0[1]) / (k2[0] - k0[0]) * (k2[0] - k1[0]);
  const m2 = (k3[1] - k1[1]) / (k3[0] - k1[0]) * (k2[0] - k1[0]);
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * k1[1] + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * k2[1] + (u3 - u2) * m2;
}

const CAM_X = [[0, -1.6], [1.0, -1.7], [2.2, 0.4], [3.3, 1.5], [4.4, 0.5], [5.5, 0.0], [6, 0]];
const CAM_Y = [[0, 0.62], [1.0, 0.55], [2.5, 1.0], [4.0, 2.2], [5.4, 2.62], [6, 2.65]];
export const CHASE_Y = 2.65;
const FOVK = [[0, 1.08], [1.0, 1.1], [3.8, 1.14], [4.5, 1.08], [5.94, 0.86], [6.0, 0.86]];
export const SUN_EL = 0.068, SUN_R = 0.183;

// Framing is anchored to the frame HEIGHT: sizes are fractions of the height, so a wider screen
// shows more road, palms and mountains at the sides instead of a stretched, bigger scene.
//  · field of view — narrow/tall: hfov 76° (vfov up to 78°) · wide: vfov held at 62° (16:9 → hfov 94°)
//    · ultrawide: hfov capped at 104° so the edges don't stretch (21:9 → vfov 57°)
//  · widescreen composition: horizon at mid-frame, sun ≈ 30 % of the height, car ≈ 15 % tall in the lower half
//  · tall windows / phones: horizon ≈ 60 % down and a smaller, more distant car
// The car's distance is carK / tan(vfov/2), so its size and height on screen hold across fields of view;
// carK and the lens shift blend from the tall values to the wide values with the aspect (k).
// URL tuning hook: ?frame.carKWide=5&frame.shiftWide=0.05 … (see js/main.js).
export const FRAME = { hNarrow: 76, vMax: 78, vWide: 62, hMax: 104, sunFrac: 0.3, carKNarrow: 8.96, carKWide: 5.2, shiftNarrow: 0.2, shiftWide: 0 };
export function layoutFor(w, h) {
  const a = w / h, k = smooth((a - 0.55) / (1.5 - 0.55));
  const D = Math.PI / 180, vFromH = (hd) => 2 * Math.atan(Math.tan((hd / 2) * D) / a) / D;
  let vfov = Math.min(FRAME.vMax, Math.max(FRAME.vWide, vFromH(FRAME.hNarrow)));
  vfov = Math.min(vfov, vFromH(FRAME.hMax));
  const tv = Math.tan((vfov / 2) * D);
  return {
    k, aspect: a, vfov,
    shift: lerp(FRAME.shiftNarrow, FRAME.shiftWide, k),
    sunR: Math.atan(FRAME.sunFrac * tv),
    carZ: -lerp(FRAME.carKNarrow, FRAME.carKWide, k) / tv,
    titleW: lerp(0.92, 0.58, k), titleCap: lerp(0.06, 0.13, k), titleY: lerp(0.46, 0.45, k), titleX: 0,
    neonX: lerp(-250, -6, k), neonY: lerp(-6, -12, k), neonRot: lerp(0.08, 0.1, k), neonS: lerp(1.0, 0.95, k),
    plateX: lerp(0, -255, k), plateY: lerp(-300, -84, k),
  };
}

// Visual time warp: tape hesitation / hit-stop, local to the picture.
export function visualTime(T, ph, tb, reduced) {
  if (reduced) return T;
  if (T < 0.3) return Math.floor(T * 15) / 15;
  if (ph.phase === 'ign') {
    const it = ph.it, s = ph.seg.s;
    if (it >= IGN.step15[0] && it < IGN.step15[1]) return s + Math.floor(it * 15) / 15;
    if (it >= IGN.hitStop[0] && it < IGN.hitStop[1]) return s + IGN.hitStop[0];
    if (it >= IGN.hitStop[1] && it < 6.2) return s + 6.0 + (it - IGN.hitStop[1]) * (0.2 / (6.2 - IGN.hitStop[1]));
  }
  return T;   // while driving the picture tracks the simulation exactly: no tape hesitation on nitro
}

// What the game layer draws and what the HUD shows.
// sim: the simulation state at T · sv: the state being shown (the same, except while a rewind replays the past).
const POP = {
  run: () => ['POLICE! PULL OVER', 'bad'], go: () => ['FLOOR IT', 'good'],
  near: (e) => [`CLOSE CALL +${e.pts}`, 'good'], smash: () => ['SMASH', 'hot'], gear: (e) => [`GEAR ${e.n}`, 'info'],
  star: (e) => (e.up ? [`WANTED LEVEL ${e.n}`, 'bad'] : [`HEAT DOWN · LEVEL ${e.n}`, 'good']),
  stumble: (e) => [(e.by === 'hook' ? 'HOOKED' : e.by === 'ram' ? 'RAMMED' : e.by === 'heli' ? 'HIT FROM THE AIR' : 'SIDESWIPE') + ' · POLICE ON YOUR TAIL', 'bad'],
  tail: () => ['TOO SLOW · POLICE ON YOUR TAIL', 'bad'],
  ramwarn: () => ['GRAPPLER BEHIND · CHANGE LANE', 'bad'], lock: () => ['SEARCHLIGHT LOCK · CHANGE LANE', 'bad'],
  block: () => ['ROLLING ROADBLOCK AHEAD', 'bad'], weave: () => ['CRUISER WEAVING · WATCH ITS LANE', 'bad'],
  tape: () => ['+1 SPARE TAPE', 'good'], item: (e) => [`CANISTER · NITRO ×${e.n}`, 'good'], nitro: () => ['NITRO BOOST', 'hot'],
  draft: () => ['SLIPSTREAM', 'info'], revive: () => ['REWOUND', 'info'], shove: () => ['SHOVED THE POLICE BACK', 'hot'],
};
function gameFrame(tl, T, sim, sv, rew, car, post, ui, reduced) {
  const g = sv.g, G = GAME, L = ROAD.lane;
  const stepping = !sim.over && T >= sim.hold && !sim.paused;
  const back = stepping ? (1 - sim.gf) * DT : 0;          // the state is from the step after T: step positions back
  const far = (dz) => smooth(lin(dz, G.ahead - 2, G.ahead - 60));
  const out = { on: 1, veh: [], cells: [], items: [], bursts: [], pol: null, ram: null, grap: null, heli: null };
  if (g.free) { ui.g = { on: 1, free: 1, run: sim.run, gear: g.gear + 1, nstock: sim.g.nstock, tapes: 0, over: 0, overU: 0, paused: sim.paused, rew: 0, pops: [], star: 0, close: 0, pol: 0 }; return out; }
  const veh = g.veh;
  for (let i = 0; i < NV; i++) {
    const o = i * VF, type = veh[o]; if (!type) continue;
    const v = veh[o + 3], lane = veh[o + 1], dz = veh[o + 2] - g.gd - back * (v - sv.vel);
    const a = veh[o + 6], b = veh[o + 7], fl = veh[o + 5], id = veh[o + 8], gt = g.gt;
    // A car is steered, not slid: its heading follows its path (sideways speed over road speed), the body leans away from
    // the turn and dips under braking. vx, ax: sideways speed and acceleration, in road units.
    let vx = 0, ax = 0, wag = 0, wander = type === T_BLOCK ? 0.5 : 1, sweep = 0, took = 0;
    if (type === T_TAXI && a !== 0) {
      wander = 0;
      if (b > 0) { const m = (gt - b - G.taxiBlink) / G.taxiMove; vx = a * L * sCurveD(m) / G.taxiMove; ax = a * L * sCurveA(m) / (G.taxiMove * G.taxiMove); }
    } else if (type === T_TAXI && b < 0) {             // it has just arrived in its new lane: a wag of the tail as it straightens up
      const u = gt + b; wag = Math.sign(lane) * 0.06 * Math.exp(-u * 4.5) * Math.sin(u * 13); wander = smooth(u / 2.5);
    } else if (type === T_WEAVE) {
      wander = 0;
      if (fl & COMMIT) { const W = G.weaveSnap; vx = b * L; ax = L * (W * W * ((fl & SIDE ? a : 0) - lane) - 2 * W * b); took = (fl & SIDE ? a : 0) * L + 100; }   // took: the x of the lane it picked (+100, so 0 means none)
      else { const ph = gt + b; vx = a * L * weave(ph, 1); ax = a * L * weave(ph, 2); sweep = a; }
    }
    let x = lane * L - back * vx;
    if (wander > 0) {                                    // nobody holds a lane dead straight
      const p1 = gt * 0.55 + id * 2.4, p2 = gt * 1.3 + id * 1.1;
      x += wander * (0.24 * Math.sin(p1) + 0.1 * Math.sin(p2)); vx += wander * (0.132 * Math.cos(p1) + 0.13 * Math.cos(p2));
    }
    const slow = type === T_BLOCK ? sat((G.vTraffic - v) / G.blockSlow) : 0;      // a rolling roadblock on the brakes
    out.veh.push({
      type, x, dz, fade: far(dz), id, sig: type === T_TAXI && a !== 0 && b !== 0 ? a : 0, sweep, took, vx, v,
      yaw: type === T_TRUCK ? 0 : -Math.atan2(vx, v) * 1.2 + wag, roll: clamp(ax * 0.004, -0.12, 0.12),
      pitch: -0.045 * Math.sin(Math.PI * Math.min(slow, 0.999)) - 0.012 * slow, brake: slow > 0.01 && dz > -6 ? 1 : 0,
    });
  }
  const cel = g.cel, rel = back * (G.vTraffic - sv.vel);
  for (let i = 0; i < NC; i++) {
    const o = i * CF, n = cel[o]; if (!n) continue;
    const z0 = cel[o + 2] - g.gd - rel, x = cel[o + 1] * L;
    for (let k = 0; k < n; k++) {
      if (cel[o + 4] & (1 << k)) continue;
      const dz = z0 + k * cel[o + 3];
      if (dz > -8 && dz < G.ahead) out.cells.push({ x, dz, fade: far(dz) });
    }
  }
  for (let i = 0; i < NI; i++) { const o = i * IF; if (g.itm[o]) { const dz = g.itm[o + 2] - g.gd - rel; out.items.push({ x: g.itm[o + 1] * L, dz, fade: far(dz) }); } }
  // the police: pursuit car (dz < 0 = behind us) and its grappler, the lane warning, the helicopter at three stars
  const close = policeClose(g);
  out.pol = { x: g.polX, dz: g.polZ, mode: g.polM, close: close ? 1 : 0, star: g.star };
  if (g.polM === P_WARN) out.ram = { lane: g.polLane, k: sat((g.gt - g.polT) / G.ramWarn) };
  { const u = g.gt - g.polT, m = g.polM;                 // the fork folds out during the warning and back in as the cruiser drops away
    const k = m === P_WARN ? smooth(u / 0.4) : m === P_CHARGE || m === P_HOOK ? 1 : m === P_BACK ? 1 - smooth(u / 0.35) : 0;
    if (k > 0) out.grap = { k, hook: m === P_HOOK ? 1 : 0 }; }
  if (g.ha > 0.01) { const u = g.drT >= 0 ? g.gt - g.drT : -1; out.heli = { x: g.hx, sx: g.sx, sk: g.sk, a: g.ha, bank: g.hb, gt: g.gt, lane: g.drLane, warn: u < 0 ? 0 : sat(u / G.drWarn), strike: u >= G.drWarn ? sat((u - G.drWarn) / G.drStrike) : -1 }; }
  const pops = [];
  for (const e of tl.gameEvents(T - 1.9, T)) {
    const age = T - e.t;
    if (e.k === 'smash' && age < 0.8) out.bursts.push({ x: e.lane * L, dz: e.dz - age * (sv.vel - G.vTraffic), age, type: e.type, seed: e.t * 91.7 });
    else if (e.k === 'crash' && age < 1.2) out.bursts.push({ car: 1, x: sim.x, dz: 0, age, seed: e.t * 53.3 });
    if (e.k === 'stumble' || e.k === 'bust') {               // jolt
      if (!reduced && age < 0.5) post.shake = [ring(age, 60, 0.2) * 0.013, ring(age, 47, 0.22) * 0.009];
      post.rgb = Math.max(post.rgb, 1 + 3 * Math.exp(-age / 0.15));
      post.flash = Math.max(post.flash, (reduced ? 0.03 : 0.1) * Math.exp(-age / 0.05));
    }
    const p = POP[e.k] && POP[e.k](e);
    if (p && age < 1.6) pops.push({ id: e.k + e.t.toFixed(3), text: p[0], tone: p[1], age });
  }
  // invulnerable (after a stumble, a nitro burst or a rewind): the car blinks
  if (stepping && g.inv > g.gt && !sim.nOn) { if (reduced) car.glow *= 0.5; else car.visible = Math.floor(T * 14) % 3 !== 0; }
  car.streak += g.draft * 3; car.glow += g.draft * 0.6;      // slipstream
  if (sim.over) {
    const u = T - sim.overT;
    if (sim.over === 1) {                                     // crashed: the car shatters, the tape glitches
      car.visible = false;
      post.flash = Math.max(post.flash, (reduced ? 0.05 : 0.22) * Math.exp(-u / 0.06));
      if (!reduced && u < 0.6) post.shake = [ring(u, 44, 0.2) * 0.02, ring(u, 37, 0.22) * 0.026];
      post.tracking = Math.max(post.tracking, 0.8 * Math.exp(-u / 0.4)); post.trackY = 0.3 + u * 0.4;
      post.rgb = Math.max(post.rgb, 1 + 5 * Math.exp(-u / 0.3)); post.noise = Math.max(post.noise, 0.3 * Math.exp(-u / 0.5));
    } else {                                                  // busted: boxed in, the car's lights die
      const k = smooth(u / 1.4), fl = hash1(Math.floor(T * 24)) > 0.4 ? 1 : 0.2;
      car.lights = 1 - k; car.glow = (1 - k) * fl; car.tail = 0.85 * (1 - k) * fl; car.exhaust = 0; car.flame = 0;
      post.tracking = Math.max(post.tracking, 0.25 * k); post.noise = Math.max(post.noise, 0.12 * k);
      out.pol.busted = smooth(u / 0.8);
    }
    post.vignette += 0.22 * smooth(u / 1.0);
  }
  if (rew) {                                                  // rewinding: the last seconds run backwards behind tape noise
    ui.osd = 'REW';
    post.tracking = Math.max(post.tracking, reduced ? 0.1 : 0.4); post.trackY = (T * 1.7) % 1;
    post.rgb = Math.max(post.rgb, 2.4); post.noise = Math.max(post.noise, 0.1);
  }
  if (sim.paused) {                                           // VCR pause: a noise bar creeps up the frozen picture
    ui.osd = 'PAUSE';
    if (!reduced) { post.tracking = Math.max(post.tracking, 0.3); post.trackY = (T * 0.07) % 1; }
    post.noise = Math.max(post.noise, 0.08);
  }
  const lg = sim.g;                                           // HUD numbers come from the live state
  ui.g = {
    on: 1, free: 0, run: sim.run, score: Math.floor(lg.score), mult: gameMult(lg), combo: lg.combo, cells: lg.cells, gear: lg.gear + 1,
    star: lg.star, close: stepping && lg.gt < lg.pcl ? sat((lg.pcl - lg.gt) / G.closeT) : 0, pol: stepping && policeClose(lg) ? 1 : 0, nstock: lg.nstock, tapes: sim.tapes,
    over: sim.over, overU: sim.over ? T - sim.overT : 0, paused: sim.paused, rew, draft: lg.draft, pops,
    stats: { dist: lg.gd, vmax: lg.vmax, best: lg.best, near: lg.near, smash: lg.smash, star: lg.starMax },
  };
  return out;
}

export function frameState(tl, T, w, h, opt = {}) {
  const reduced = !!opt.reduced;
  const L = layoutFor(w, h);
  const ph0 = tl.phaseAt(T);
  const tb = ph0.phase === 'cruise' ? tl.turboAt(T) : null;
  const tv = visualTime(T, ph0, tb, reduced);
  const ph = tl.phaseAt(tv);
  const sim = tl.stateAt(tv);
  // while a tape rewind is in progress the picture replays the last seconds backwards: `sv` is the state shown
  let sv = sim, rew = 0;
  if (ph.phase === 'cruise' && T < sim.hold && sim.rwA > sim.rwB) {
    sv = tl.peek(lerp(sim.rwA, sim.rwB, smooth(1 - (sim.hold - T) / GAME.reviveHold))); rew = 1;
  }
  const tbV = rew ? sv.tb : tb;
  const envW = tl.envWeights(T);
  const pal = blendPalette(envW);
  const mus = tl.musicAt(T);
  const s = {
    t: tv, T, phase: ph.phase, it: ph.it ?? null, ct: ph.ct ?? null, reduced, pal, layout: L,
    steer: sv.steer, thr: sv.thr,
  };

  // ── baseline: hero composition ──
  let camX = 0, camY = CHASE_Y, fovK = 1, yaw = 0, roll = 0, pitch = 0;
  const carZ0 = L.carZ, zs = -carZ0 / 8.6;   // zs: distance-relative scale for fore/aft car moves
  const car = { visible: true, x: 0, z: carZ0, yaw: 0, roll: 0, pitch: 0, bob: 0, tail: 0.85, glow: 1, exhaust: 0.1, flame: 0, flameHot: 0, streak: 0, lights: 1, wheel: 0 };
  let sunEl = SUN_EL, sunPow = 1, flare = 0, stars = 1, band = tv * 0.055;
  const title = { blur: 0, visible: true, y: 0, z: 0, sx: 1, sy: 1, rx: 0, rotY: 0, shift: 0, road: 0, sweep: -999, sweepI: 0, gather: 0, dim: 1, flash: 0, letters: null };
  const neon = { prog: 1, pow: 1, surge: 0, glass: 0 };
  const aux = { a: 1, wipe: 1 };
  const post = {
    crt: 0, fgA: 1, tracking: 0, trackY: 0.5, noise: 0.045, rgb: 1, flash: 0, shake: [0, 0], vignette: 0.42, bloom: 1, scan: 1,
    glint: { tx: 0, ty: 0, i: 0, size: 1 }, flare: { tx: 0, ty: 0, i: 0 }, speed: 0, ffwd: 0, rewind: 0, warp: 0,
  };
  const ui = { hint: 0, autoOn: tl.autoOn(T), autoP: 0, osd: null, cassette: 1, cassetteT: 99, controls: 1, start: 0, skip: 0, replay: 0, ready: 1, drive: sim.brkOn && ph.phase === 'cruise' ? 1 : 0, thr: ph.phase === 'cruise' && sim.run && !sim.over && !sim.paused ? 1 - sv.thr : 0, home: 0, preset: tl.envTarget(T), music: mus.on };
  let gridBright = 1, mountBright = 1, trailI = 1, pulse = 0, game = null, trafficI = 1;
  let scenery = ph.seg && ph.seg.quick ? 1 : ph.phase === 'ign' || ph.phase === 'ff' ? smooth(lin(ph.it ?? 0, 2, 5)) : ph.phase === 'rewind' ? 0.5 : ph.phase === 'home' ? 1 : 0;

  // idle micro-motion (also underlies cruise)
  camX += Math.sin(tv * 0.13) * 0.18; yaw += Math.sin(tv * 0.09 + 1) * 0.004;
  title.shift = Math.sin(tv * 0.35) * 0.012;

  // ── load hook (page open) ──
  if (T < 1.9) {
    post.tracking = Math.max(post.tracking, (1 - smooth(T / 0.45)) * 1.0);
    post.trackY = 0.15 + T * 1.6;
    post.noise = Math.max(post.noise, 0.4 * (1 - smooth(T / 0.5)));
    if (T > 0.04 && T < 1.8) ui.osd = 'PLAY';
  }

  if (ph.phase === 'idle' || ph.phase === 'home') {
    ui.start = 1; ui.cassette = 0; ui.controls = 0; ui.replay = 0; ui.skip = 0; ui.ready = 0;
    if (ph.phase === 'home') {            // back from a run: the tape stops, static, then the title screen
      const u = ph.ht;
      ui.home = 1; ui.replay = 1; ui.start = smooth(lin(u, 0.35, 0.7));
      post.tracking = Math.max(post.tracking, 1 - smooth(u / 0.5)); post.trackY = 0.2 + u * 1.4;
      post.noise = Math.max(post.noise, 0.45 * (1 - smooth(u / 0.6))); post.fgA = smooth(lin(u, 0.15, 0.6));
      if (u < 1.4) ui.osd = 'STOP';
    }
    neon.glass = 1; neon.pow = 0; neon.prog = 1;
    car.visible = false;
    // periodic idle glint every 6 s
    const k = (tv % 6) / 6;
    if (k < 0.12) { title.sweep = lerp(-150, 1000, k / 0.12); title.sweepI = 0.8 * Math.sin(Math.PI * k / 0.12); }
    aux.a = 0.75;
  }

  if (ph.phase === 'ign' || ph.phase === 'ff') {
    const ff = ph.phase === 'ff';
    const it = ph.seg.quick ? 7.6 : ff ? Math.max(ph.it, 0) : ph.it;   // a quick start fast-forwards from the finished title
    ui.start = 0; ui.replay = 0; ui.skip = ff ? 0 : 1; ui.ready = 0;
    // camera flight
    camX = cr(CAM_X, it) + (it > 6 ? 0 : Math.sin(it * 1.7) * 0.08);
    camY = cr(CAM_Y, it) + Math.sin(it * 2.3) * 0.03 * (1 - smooth((it - 3.5) / 2));
    const dx = (cr(CAM_X, it + 0.05) - cr(CAM_X, it - 0.05)) / 0.1;
    roll = -dx * 0.022; yaw = -camX * 0.02 - dx * 0.012;
    fovK = cr(FOVK, it);
    if (it >= 6) {
      const u = it - 6;
      fovK = lerp(0.86, 1.0, spring(u, 16, 0.42)) + 0.06 * Math.exp(-u / 0.12);
    }
    // sun rise
    sunEl = lerp(-0.13, SUN_EL, easeInOutCubic(lin(it, IGN.sunRise[0], IGN.sunRise[1])));
    sunPow = lerp(0.65, 1.0, lin(it, 0.5, 4.4));
    stars = lerp(0.5, 1, lin(it, 0, 4));
    gridBright = lerp(0.6, 1, lin(it, 0, 2.5));
    // CRT aperture + tape noise
    post.crt = it < IGN.crtExpand[0] ? 1 : 1 - easeInOutCubic(lin(it, IGN.crtExpand[0], IGN.crtExpand[1]));
    if (reduced) post.crt *= 0.6;
    post.tracking = Math.max(post.tracking, it < IGN.vhsNoise[1] ? 1 - smooth(lin(it, 0.25, IGN.vhsNoise[1])) : 0);
    post.trackY = 0.85 - it * 1.3;
    post.noise = Math.max(post.noise, 0.5 * (1 - smooth(lin(it, 0.1, 0.7))));
    if (it < IGN.osdPlay[1]) ui.osd = 'PLAY';
    // title anticipation → slam
    const A = IGN.gather[0];
    if (reduced) {
      post.fgA = smooth(lin(it, 5.0, 6.2));
      title.visible = it >= 5.0;
      camX *= 0.3; roll = 0; yaw *= 0.3; fovK = lerp(1, fovK, 0.3);
      if (it >= 6) { title.sweep = lerp(-160, 1040, easeInOutCubic(lin(it, 6.2, 7.2))); title.sweepI = 0.6 * Math.sin(Math.PI * lin(it, 6.2, 7.2)); }
    } else if (it < A) title.visible = false;
    else if (it < 6) {
      const p = lin(it, A, 5.76);
      let z = lerp(-9800, -4600, easeOutCubic(p));
      if (it > 5.76) z = lerp(-4600, 260, easeInCubic(lin(it, 5.76, 6.0)));
      title.z = z; title.rx = lerp(0.42, 0.05, smooth(lin(it, A, 6.0)));
      title.gather = smooth(lin(it, A, 6.0));
      title.blur = 1;
      title.dim = lerp(0.55, 1.0, lin(it, A, 6.0));
      title.y = lerp(-40, 0, easeOutCubic(p));
    } else if (!reduced) {
      const u = it - 6;
      const uR = (ph0.phase === 'ign' ? ph0.it : it) - 6;   // post effects run on real time through the hit-stop
      title.z = 260 * (1 - spring(u, 22, 0.38));
      title.sx = 1 + 0.06 * ring(u, 34, 0.3) * (reduced ? 0 : 1);
      title.sy = 1 - 0.09 * ring(u, 34, 0.3) * (reduced ? 0 : 1);
      title.flash = (reduced ? 0.1 : 0.38) * Math.exp(-uR / 0.045);
      title.sweep = lerp(-160, 1040, easeInOutCubic(lin(it, IGN.glint[0], IGN.glint[1])));
      title.sweepI = it < IGN.glint[1] ? 1.6 * Math.sin(Math.PI * lin(it, IGN.glint[0], IGN.glint[1])) : 0;
      post.glint = { tx: lerp(40, 820, easeInOutCubic(lin(it, IGN.glint[0], IGN.glint[1]))), ty: 102, i: it < IGN.glint[1] ? Math.sin(Math.PI * lin(it, IGN.glint[0], IGN.glint[1])) ** 0.7 : 0, size: 1.2 };
      post.flare = { tx: 430, ty: 60, i: uR < 0.95 ? Math.exp(-uR / 0.22) * (1 - uR / 0.95) : 0 };
      post.flash = (reduced ? 0.04 : 0.14) * Math.exp(-uR / 0.04);
      post.rgb = 1 + 2.4 * Math.exp(-uR / 0.18);
      post.tracking = Math.max(post.tracking, 0.35 * Math.exp(-uR / 0.08));
      post.trackY = 0.42;
      flare = 0.6 * Math.exp(-uR / 0.4);
      sunPow *= 1 + 0.22 * Math.exp(-uR / 0.35);
      post.bloom = 1 + 0.25 * Math.exp(-uR / 0.2);
      if (!reduced && uR < IGN.shake[1] - 6) post.shake = [ring(uR, 55, 0.18) * 0.008, ring(uR, 47, 0.2) * 0.011];
      pulse = Math.exp(-uR / 0.2);
    }
    // the car overtakes the camera from behind (on its right), then merges onto the axis in front of it
    if (it < 1.4) car.visible = false;
    else {
      const e = easeOutCubic(lin(it, 1.4, 3.5)), m = easeInOutCubic(lin(it, 1.9, 3.7));
      car.z = lerp(9, carZ0, e);
      car.x = lerp(camX + 2.5, 0, m);
      car.yaw = -0.09 * Math.sin(Math.PI * m);
      car.flame = 0.95 * (1 - e); car.flameHot = 0.5 * (1 - e); car.exhaust = 0.4 + 0.6 * (1 - e);
      car.tail = 0.9 + 0.8 * (1 - e); car.streak = 3.0 * (1 - e);
    }
    if (it >= 6) { const uS = it - 6; car.bob = -0.05 * ring(uS, 30, 0.3); car.pitch = 0.012 * ring(uS, 26, 0.3); car.glow = 1 + 0.8 * Math.exp(-uS / 0.3); }
    // neon write-on
    neon.glass = 0;
    neon.prog = it < IGN.neonWrite[0] ? 0 : sat((lin(it, IGN.neonWrite[0], IGN.neonWrite[1]) * 1.0));
    neon.prog = neon.prog - Math.sin(neon.prog * Math.PI * 2) * 0.03;
    neon.pow = reduced ? smooth(lin(it, 6.2, 7.4)) : neonPower(it);
    // secondary elements
    aux.a = smooth(lin(it, IGN.aux[0], IGN.aux[1]));
    aux.wipe = easeOutCubic(lin(it, IGN.aux[0], IGN.aux[1] - 0.2));
    ui.cassette = it >= IGN.cassette ? 1 : 0; ui.cassetteT = it - IGN.cassette;
    ui.controls = smooth(lin(it, IGN.controls[0], IGN.controls[1]));
    if (ff) {
      const u = ph.u;
      car.visible = true; car.z = carZ0; car.x = 0; car.yaw = 0; car.flame = 0.6; car.streak = 2.5;
      post.ffwd = 1 - smooth(lin(u, 0.25, 0.4));
      title.visible = true; title.z = 0; title.rx = 0; title.dim = 1; title.gather = 0; title.flash = 0; title.sx = 1; title.sy = 1; post.fgA = 1;
      neon.prog = 1; neon.pow = 1; aux.a = 1; aux.wipe = 1; ui.cassette = 1; ui.cassetteT = u; ui.controls = 1;
      camX = lerp(camX, 0, smooth(u / 0.4)); camY = lerp(camY, CHASE_Y, smooth(u / 0.4)); fovK = lerp(fovK, 1.0, smooth(u / 0.4)); roll *= 1 - smooth(u / 0.4); yaw *= 1 - smooth(u / 0.4);
      sunEl = lerp(sunEl, SUN_EL, smooth(u / 0.4)); post.crt = 0; post.tracking = Math.max(post.tracking, 0.5 * (1 - u / 0.4));
      ui.osd = 'FF';
    }
  }

  if (ph.phase === 'rewind') {
    const u = ph.u, k = u / 0.6;
    post.rewind = 1 - smooth(lin(u, 0.45, 0.6));
    // the title already left when cruising started, so the rewind runs on an empty sky
    title.visible = false; neon.pow = 0; aux.a = 0;
    ui.osd = 'REW'; ui.replay = 0; ui.cassette = 1; ui.controls = 1 - smooth(k * 2); ui.skip = 0;
    car.z = lerp(carZ0, 9, easeInCubic(k)); car.tail = 0.5; car.flame = 0;
    sunEl = lerp(SUN_EL, -0.13, easeInCubic(k));
    post.tracking = 0.6; post.trackY = 1 - k * 2;
  }

  if (ph.phase === 'cruise') {
    const ct = ph.ct;
    ui.skip = 0; ui.replay = 0; ui.start = 0;
    ui.ready = tl.turboReady(T);
    ui.hint = sim.run > 1 || sim.over ? 0 : smooth(lin(ct, 2.6, 3.1)) * (1 - smooth(lin(ct, 6.6, 7.2)));   // first run only, after the opening
    if (ph.seg.skip !== null && ct < 0.8) ui.osd = 'FF';
    // lanes: the car tracks the lane spring; the drift is body yaw around a pivot near the front axle (the tail
    // swings out, then a small counter-steer), plus roll with the lateral speed. The camera follows on its own spring.
    const gv = sv.g, brk = 1 - sv.thr, spd = sat((Math.abs(sv.vel) - 45) / 70);
    car.yaw = sv.yaw * (reduced ? 0.4 : 1);
    car.x = sv.x + LANE_FEEL.pivot * Math.sin(car.yaw);
    car.roll = reduced ? 0 : (sv.xv / ROAD.lane) * 0.03;
    const camF = lerp(1.4, 1.0, L.k);   // narrow screens follow the car more closely so the outer lanes stay in frame
    camX += sv.camX * camF;
    yaw += -(sv.camX / ROAD.lane) * 0.025;
    roll += reduced ? 0 : (sv.camX / ROAD.lane) * 0.018 + (sv.xv / ROAD.lane) * 0.003;
    // the police on our tail (the opening of a run, after a stumble, while they line up to ram): the camera lifts and
    // drops back, so the pursuit car is in the picture between us and the lens. It follows the pursuit car's distance.
    const polK = gv.free ? 0 : smooth(lin(-gv.polZ, GAME.polFar - 3, GAME.polClose + 2.5)) * smooth(lin(gv.gt, 0, 0.45));
    const launch = gv.free || gv.gt >= GAME.introT ? 0 : smooth(lin(gv.gt, GAME.introHold, GAME.introHold + 0.2)) * (1 - smooth(lin(gv.gt, 1.7, GAME.introT)));
    car.z = carZ0 * (1 + 0.5 * polK) + brk * 0.9 * zs;
    camY += 1.1 * polK; pitch -= 0.07 * polK; fovK *= 1 + 0.03 * polK;
    car.pitch = brk * 0.03 - 0.035 * launch;                 // the nose dips on the brake, the tail squats at the launch
    car.flame = 0.3 * (1 - brk) + 1.3 * launch; car.flameHot = 0.6 * launch; car.exhaust = 0.3 + 0.45 * (1 - brk) + 0.3 * launch; car.tail = 0.85 + 1.3 * brk;
    if (gv.polM === P_HOOK && !reduced) { const u = gv.gt - gv.polT; car.yaw += 0.1 * Math.sin(u * 15) * Math.exp(-u * 1.6); }   // hooked by the rear wheel: the tail snakes
    car.streak = Math.max(0, Math.abs(sv.vel) - 60) * 0.05;
    if (!reduced) car.bob = vnoise(tv * 13, 9) * 0.006 * (1 + spd);
    title.rotY = -sv.steer * 0.12;
    title.shift += sv.steer * 0.02;
    // title exit: neon flickers out, plate wipes shut, chrome pulls in, then recedes to the horizon
    const X = TITLE_EXIT;
    const nk = lin(ct, X.neon[0], X.neon[1]);
    if (reduced) neon.pow = 1 - smooth(nk);
    else {
      neon.pow = 1 - smooth(lin(nk, 0.55, 1));
      if (nk > 0 && nk < 0.55 && hash1(Math.floor(ct * 30) * 17 + 3) < 0.45) neon.pow *= 0.12;
      if (nk > 0 && nk < 0.2) neon.surge = 0.6 * Math.sin(Math.PI * nk / 0.2);
    }
    const pk = lin(ct, X.plate[0], X.plate[1]);
    aux.wipe = 1 - easeInCubic(pk); aux.a = 1 - smooth(lin(pk, 0.5, 1));
    const ck = lin(ct, X.chrome[0], X.chrome[1]);
    if (ck >= 1) { title.visible = false; neon.pow = 0; aux.a = 0; }
    else if (ck > 0) {
      if (reduced) post.fgA = 1 - smooth(ck);
      else {
        const pull = ck < 0.2 ? Math.sin(Math.PI * ck / 0.2) : 0;   // anticipation toward the camera
        const e = easeInCubic(lin(ck, 0.12, 1));
        title.z = 110 * pull - 9800 * e;
        title.rx = -0.3 * e; title.y = 26 * e;
        title.dim = 1 - 0.45 * e; title.blur = e > 0 ? 1 : 0;
        post.fgA = 1 - smooth(lin(ck, 0.62, 1));
      }
    }
    const titleGone = ck >= 1;
    // speed feel: a touch of colour split and radial blur as the speed climbs; the brake pulls the view in
    fovK *= 1 - 0.045 * brk;
    trailI = 1 + 0.3 * spd;
    post.rgb = 1 + 0.3 * spd;
    post.speed = 0.14 * spd;
    if (!reduced) post.shake = [vnoise(tv * 9, 3) * 0.001 * spd, vnoise(tv * 11, 5) * 0.0013 * spd];
    // music-locked micro-motion: glint on the crash at bars 0/8/16 of the form
    const bar = Math.floor(ct / BAR), bt = ct - bar * BAR, b32 = ((bar % 32) + 32) % 32;
    if (!titleGone && (b32 === 0 || b32 === 8 || b32 === 16) && bt < 0.7) {
      const p = bt / 0.7;
      title.sweep = lerp(-160, 1040, easeInOutCubic(p)); title.sweepI = 1.1 * Math.sin(Math.PI * p);
      post.glint = { tx: lerp(40, 820, easeInOutCubic(p)), ty: 102, i: 0.75 * Math.sin(Math.PI * p), size: 0.85 };
    }
    // rare tracking glitch (seeded schedule)
    const win = Math.floor(ct / 23), gs = win * 23 + 6 + hash1(win * 7 + 1) * 12, gu = ct - gs;
    if (!reduced && gu > 0 && gu < 0.32 && ct > 2) {
      post.tracking = Math.max(post.tracking, 0.32 * Math.sin(Math.PI * gu / 0.32)); post.trackY = 0.2 + hash1(win * 13) * 0.6;
    }
    // neon micro flicker
    const nf = Math.floor(ct / 1.7);
    if (!reduced && hash1(nf * 31 + 4) < 0.07 && (ct % 1.7) < 0.09) neon.pow *= 0.45;
    // turbo
    if (tbV) {
      const tb = tbV;   // (the burst being shown: a past one while a rewind replays it)
      if (tb.a < tb.antic) {
        const k = smooth(tb.a / tb.antic);
        camY += 0.16 * k; fovK *= 1 - 0.09 * k; sunPow *= 1 - 0.28 * k; title.dim *= 1 - 0.3 * k;
        neon.pow *= 1 - 0.4 * k + 0.25 * k * Math.sin(tb.a * 60);
        post.vignette += 0.25 * k; post.warp = k;
        gridBright *= 1 - 0.25 * k;
        title.gather = k * 0.6;
        car.z += 0.4 * k * zs; car.flame = 0.15 * (Math.sin(tb.a * 47) > 0 ? 1 : 0); car.glow = 1 + 0.6 * k;
      } else {
        const u = tb.u;
        const e = u < TURBO.sustain ? easeOutExpo(u / 0.22) : 1 - easeInOutCubic((u - TURBO.sustain) / TURBO.recover);
        const ee = clamp(e, 0, 1);
        fovK *= 1 + (reduced ? 0.05 : 0.3) * ee;
        sunPow *= 1 + 1.1 * ee; flare = Math.max(flare, ee * 0.8 * Math.exp(-u / 1.5));
        neon.surge = 1.3 * Math.exp(-u / 0.55);
        if (!titleGone) {
          title.sweep = lerp(-160, 1040, easeInOutCubic(lin(u, 0, 0.6))); title.sweepI = u < 0.6 ? 1.8 * Math.sin(Math.PI * u / 0.6) : 0;
          title.flash = reduced ? 0 : 0.3 * Math.exp(-u / 0.05);
        }
        post.flash = (reduced ? 0.04 : 0.14) * Math.exp(-u / 0.06);
        post.rgb = Math.max(post.rgb, 1 + 3.2 * Math.exp(-u / 0.25));
        post.speed = Math.max(post.speed, ee);
        post.bloom = 1 + 0.6 * ee;
        if (!titleGone) {
          post.glint = u < 0.6 ? { tx: lerp(40, 820, easeInOutCubic(u / 0.6)), ty: 102, i: Math.sin(Math.PI * u / 0.6), size: 1.1 } : post.glint;
          post.flare = { tx: 430, ty: 60, i: Math.exp(-u / 0.3) * 0.9 };
        }
        if (!reduced && u < 0.5) post.shake = [ring(u, 50, 0.2) * 0.007, ring(u, 41, 0.22) * 0.009];
        pulse = Math.max(pulse, Math.exp(-u / 0.25));
        gridBright *= 1 + 0.4 * ee;
        trailI *= 1 + 0.8 * ee;
        band = tv * 0.055 + 0.4 * Math.min(u, TURBO.sustain);
        car.z -= 1.9 * ee * zs; car.flame = Math.max(car.flame, 1.7 * ee); car.flameHot = ee; car.exhaust = 1;
        car.glow = 1 + 1.2 * ee; car.tail = 1.3; car.streak = Math.max(car.streak, 9 * ee);
        car.pitch -= 0.02 * ee * Math.exp(-u / 0.4);
      }
    }
    game = gameFrame(tl, T, sim, sv, rew, car, post, ui, reduced);
    scenery = 1; trafficI = 1 - smooth(ct / 1.0);
  }

  // drum-locked pulse (grid brightness) while music plays
  if (mus.on && (ph.phase === 'cruise' || ph.phase === 'ign')) {
    const dp = ph.phase === 'ign' ? drumPulse('ign', ph.it) : drumPulse('cruise', ph.ct);
    pulse = Math.max(pulse, Math.exp(-dp.kick / 0.11) * 0.5, Math.exp(-dp.snare / 0.16) * 0.3);
  }
  if (!mus.on && ph.phase === 'cruise') ui.osd = mus.since < 2.5 ? 'MUSIC OFF' : ui.osd;
  // environment change OSD
  const last = tl.lastEnvChange(T);
  if (last && T - last.t < 2.2) ui.osd = `${last.auto ? 'AUTO ' : ''}CH ${last.preset + 1}  ${PRESETS[last.preset]}`;
  if (ph.phase === 'cruise') ui.autoP = tl.autoProgress(T);
  if (reduced) { post.tracking *= 0.2; post.flash *= 0.2; post.noise = Math.min(post.noise, 0.06); }

  const vfov = L.vfov * fovK;
  s.cam = { x: camX, y: camY, pitch, yaw, roll, fov: clamp(vfov, 20, 100), shift: L.shift + post.shake[1], shiftX: post.shake[0] };
  s.sun = { el: sunEl, r: L.sunR, pow: sunPow, band, flare, squash: 0 };
  s.trafficI = trafficI; s.game = game || { on: 0 }; s.envW = envW; s.scenery = scenery; s.stars = stars; s.gridBright = gridBright; s.mountBright = mountBright; s.trailI = trailI; s.pulse = pulse;
  const vel = sv.vel * (rew ? -2.4 : 1) * (reduced ? 0.6 : 1);
  const pos = sv.pos * (reduced ? 0.6 : 1);
  s.road = {
    vel, pos, gridPhase: ((pos % ROAD.lane) + ROAD.lane) % ROAD.lane, palmPhase: ((pos % 6720) + 6720) % 6720, trailPhase: ((pos % 896) + 896) % 896,
    trailLen: 0.25 + Math.abs(vel) * 0.05,
  };
  title.road = (pos / 26) % 1;
  car.wheel = pos / 0.34;
  s.car = car;
  s.title = title; s.neon = neon; s.aux = aux; s.post = post; s.ui = ui;
  return s;
}
