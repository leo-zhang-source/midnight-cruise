// The director: turns (scene time T, event timeline, viewport) into a complete frame
// description. Pure function — no wall clock, no hidden state.
import { IGN, BAR, TURBO, PRESETS, TITLE_EXIT, ROAD, LANE_FEEL, neonPower, drumPulse } from './cue.js';
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
  if (tb) {
    if (tb.a >= 0 && tb.a < 4 / 15) return tb.p - (Math.floor(tb.a * 15) % 2) / 15;
    if (tb.u >= 0 && tb.u < 0.27) return tb.I + Math.floor(tb.u * 15) / 15;
  }
  return T;
}

export function frameState(tl, T, w, h, opt = {}) {
  const reduced = !!opt.reduced;
  const L = layoutFor(w, h);
  const ph0 = tl.phaseAt(T);
  const tb = ph0.phase === 'cruise' ? tl.turboAt(T) : null;
  const tv = visualTime(T, ph0, tb, reduced);
  const ph = tl.phaseAt(tv);
  const sim = tl.stateAt(tv);
  const pal = blendPalette(tl.envWeights(T));
  const mus = tl.musicAt(T);
  const s = {
    t: tv, T, phase: ph.phase, it: ph.it ?? null, ct: ph.ct ?? null, reduced, pal, layout: L,
    steer: sim.steer, thr: sim.thr,
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
  const ui = { hint: 0, autoOn: tl.autoOn(T), autoP: 0, osd: null, cassette: 1, cassetteT: 99, controls: 1, start: 0, skip: 0, replay: 1, ready: 1, drive: sim.thrOn && ph.phase === 'cruise' ? 1 : 0, thr: sim.thr, preset: tl.envTarget(T), music: mus.on };
  let gridBright = 1, mountBright = 1, trailI = 1, pulse = 0;

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

  if (ph.phase === 'idle') {
    ui.start = 1; ui.cassette = 0; ui.controls = 0; ui.replay = 0; ui.skip = 0; ui.ready = 0;
    neon.glass = 1; neon.pow = 0; neon.prog = 1;
    car.visible = false;
    // periodic idle glint every 6 s
    const k = (tv % 6) / 6;
    if (k < 0.12) { title.sweep = lerp(-150, 1000, k / 0.12); title.sweepI = 0.8 * Math.sin(Math.PI * k / 0.12); }
    aux.a = 0.75;
  }

  if (ph.phase === 'ign' || ph.phase === 'ff') {
    const it = ph.phase === 'ff' ? Math.max(ph.it, 0) : ph.it;
    const ff = ph.phase === 'ff';
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
    ui.skip = 0; ui.replay = 1; ui.start = 0;
    ui.ready = tl.turboReady(T);
    const firstThr = tl.events.find((e) => e.type === 'thr' && e.on && e.t >= ph.seg.C);
    const hintEnd = Math.min(9, firstThr ? firstThr.t - ph.seg.C + 0.6 : 9);
    ui.hint = smooth(lin(ct, 0.3, 0.8)) * (1 - smooth(lin(ct, hintEnd - 0.5, hintEnd)));
    if (ph.seg.skip !== null && ct < 0.8) ui.osd = 'FF';
    // lanes: the car tracks the lane spring; the drift is body yaw around a pivot near the front axle (the tail
    // swings out, then a small counter-steer), plus roll with the lateral speed. The camera follows on its own spring.
    car.yaw = sim.yaw * (reduced ? 0.4 : 1);
    car.x = sim.x + LANE_FEEL.pivot * Math.sin(car.yaw);
    car.roll = reduced ? 0 : (sim.xv / ROAD.lane) * 0.03;
    const camF = lerp(1.4, 1.0, L.k);   // narrow screens follow the car more closely so the outer lanes stay in frame
    camX += sim.camX * camF;
    yaw += -(sim.camX / ROAD.lane) * 0.025;
    roll += reduced ? 0 : (sim.camX / ROAD.lane) * 0.018 + (sim.xv / ROAD.lane) * 0.003;
    car.z = carZ0 - sim.thr * 0.6 * zs;
    car.pitch = -sim.thr * 0.018;
    car.flame = sim.thr * 0.65; car.exhaust = 0.1 + 0.9 * sim.thr; car.tail = 0.85 + 0.3 * sim.thr;
    car.streak = Math.max(0, sim.vel - 34) * 0.07;
    if (!reduced) car.bob = vnoise(tv * 13, 9) * 0.006 * (1 + 2 * sim.thr);
    title.rotY = -sim.steer * 0.12;
    title.shift += sim.steer * 0.02;
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
    // acceleration
    fovK *= 1 + 0.12 * sim.thr;
    camY -= 0.12 * sim.thr;
    trailI = 1 + 0.4 * sim.thr;
    post.rgb = 1 + 0.6 * sim.thr;
    post.speed = sim.thr * 0.35;
    if (!reduced) post.shake = [vnoise(tv * 9, 3) * 0.0012 * sim.thr, vnoise(tv * 11, 5) * 0.0016 * sim.thr];
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
    if (tb) {
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
  }

  // drum-locked pulse (grid brightness) while music plays
  if (mus.on && (ph.phase === 'cruise' || ph.phase === 'ign')) {
    const dp = ph.phase === 'ign' ? drumPulse('ign', ph.it) : drumPulse('cruise', ph.ct);
    pulse = Math.max(pulse, Math.exp(-dp.kick / 0.11) * 0.5, Math.exp(-dp.snare / 0.16) * 0.3);
  }
  if (!mus.on && ph.phase === 'cruise') ui.osd = mus.since < 2.5 ? 'PAUSE' : ui.osd;
  // environment change OSD
  const last = tl.lastEnvChange(T);
  if (last && T - last.t < 2.2) ui.osd = `${last.auto ? 'AUTO ' : ''}CH ${last.preset + 1}  ${PRESETS[last.preset]}`;
  if (ph.phase === 'cruise') ui.autoP = tl.autoProgress(T);
  if (reduced) { post.tracking *= 0.2; post.flash *= 0.2; post.noise = Math.min(post.noise, 0.06); }

  const vfov = L.vfov * fovK;
  s.cam = { x: camX, y: camY, pitch, yaw, roll, fov: clamp(vfov, 20, 100), shift: L.shift + post.shake[1], shiftX: post.shake[0] };
  s.sun = { el: sunEl, r: L.sunR, pow: sunPow, band, flare, squash: 0 };
  s.trafficI = 1; s.stars = stars; s.gridBright = gridBright; s.mountBright = mountBright; s.trailI = trailI; s.pulse = pulse;
  const vel = sim.vel * (reduced ? 0.6 : 1);
  const pos = sim.pos * (reduced ? 0.6 : 1);
  s.road = {
    vel, pos, gridPhase: ((pos % 4) + 4) % 4, palmPhase: ((pos % 6720) + 6720) % 6720, trailPhase: ((pos % 896) + 896) % 896,
    trailLen: 0.25 + Math.abs(vel) * 0.05,
  };
  title.road = (pos / 26) % 1;
  car.wheel = (sim.pos * (reduced ? 0.6 : 1)) / 0.34;
  s.car = car;
  s.title = title; s.neon = neon; s.aux = aux; s.post = post; s.ui = ui;
  return s;
}
