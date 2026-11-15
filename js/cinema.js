// ─────────────────────────────────────────────────────────────────────────────
// THE OPENING — a short film in six shots, cut on the bar lines of its score (js/cue.js: CINE, ignitionBar).
//
//   0 s  ROAD     the empty beltway, a lens on the asphalt. The PHANTOM goes through the frame; two cruisers after it.
//   4 s  TRACK    alongside at speed on a long lens: the car, the police behind it, a truck wiping the frame.
//   8 s  AIR      from above the helicopter: its searchlight hunts across the lanes and finds him.
//  12 s  BUMPER   from the bonnet of the cruiser on his tail, through the traffic.
//  16 s  FRONT    head on, long lens: him, and everything that is after him, stacked up behind.
//  20 s  TITLE    the title lands; he lifts off, the cruiser closes on his bumper. The drive starts from there.
//
// Every shot is a pure function of the time since START: where the lens is, where the car and every other vehicle are,
// what the lights do. The world is only ever built ahead of the lens, so the head-on shot is staged the other way
// round: everything in it faces the lens and the road runs backwards under it.
// ─────────────────────────────────────────────────────────────────────────────
import { CINE, CINE_AT, ROAD } from './cue.js';
import { lerp, lin, smooth, smoother, sat, ring, vnoise } from './util.js';

const L = ROAD.lane, V = 150, PI = Math.PI;
const LAMP = [1.0, 0.95, 0.8], COLD = [0.85, 0.93, 1.0], RED = [1, 0.1, 0.2], BLUE = [0.15, 0.4, 1];

// The vertical field of view (degrees) for a lens given as it frames a 16:9 picture. A narrower screen keeps most of the
// width of the shot, so what matters stays in frame, and gets the extra height.
function lens(v169, aspect) {
  if (aspect >= 1.6) return v169;
  const D = PI / 180, h = 2 * Math.atan(Math.tan(v169 * D / 2) * 16 / 9), he = h * lerp(0.72, 1, sat((aspect - 0.5) / 1.1));
  return Math.min(92, 2 * Math.atan(Math.tan(he / 2) / aspect) / D);
}
// A car steered from lane to lane: keys [[time of the middle of the move, lane it goes to], …] after the lane it starts in.
// Returns where it is across the road and how fast it is going sideways.
function steer(lane0, keys, t, dur = 0.55) {
  let x = lane0 * L, vx = 0, from = lane0;
  for (const [tm, to] of keys) {
    const u = (t - (tm - dur / 2)) / dur;
    if (u <= 0) break;
    if (u >= 1) { x = to * L; vx = 0; } else { x = lerp(from, to, u * u * (3 - 2 * u)) * L; vx = (to - from) * L * 6 * u * (1 - u) / dur; }
    from = to;
  }
  return { x, vx };
}
const heading = (vx, v = V) => -Math.atan2(vx, v) * 1.6, lean = (vx) => Math.max(-0.07, Math.min(0.07, vx * 0.004));
const actor = (kind, x, z, o) => ({ kind, x, z, yaw: 0, roll: 0, pitch: 0, id: 0, v: 60, ...o });
const strobe = (T, phase = 0) => (Math.floor(T * 5 + phase) % 2 === 0 ? RED : BLUE);
const base = () => ({
  cam: { x: 0, y: 1, pitch: 0, yaw: 0, roll: 0, fov: 50 }, car: { visible: true, x: 0, z: -10, yaw: 0, roll: 0, pitch: 0, bob: 0, tail: 0.9, glow: 1, exhaust: 0.4, flame: 0.4, flameHot: 0.2, streak: 2, lights: 1 },
  road: { vel: V, pos: 0 }, actors: [], pools: [], sprites: [], heli: null, sunEl: null, sunPow: 1, stars: 1,
  fx: { flash: 0, tint: [0, 0, 0], shake: [0, 0], rgb: 1, speed: 0, vignette: 0.5, bloom: 1, noise: 0 },
});
const wash = (s, c, k) => { s.fx.tint[0] += c[0] * k; s.fx.tint[1] += c[1] * k; s.fx.tint[2] += c[2] * k; };

// ── 0 s · ROAD ──
function road(it, T, a, calm) {
  const s = base(), A = CINE_AT, pass = (tp, v) => (tp - it) * v;          // where something is that passes the lens at tp
  const hz = pass(A.hero, 128), c1 = pass(A.cop1, 138), c2 = pass(A.cop2, 138);
  const jolt = (tp, k) => (it > tp && !calm ? ring(it - tp, 44, 0.22) * k : 0);
  const after = it > A.hero ? Math.exp(-(it - A.hero) / 0.6) : 0;
  s.cam = { x: -2.5, y: 0.36 + 0.05 * smooth(it / 4), pitch: 0.085 - 0.012 * after, yaw: -0.035 - 0.05 * after, roll: -0.04 + 0.012 * after, fov: lens(62, a) };
  s.road = { vel: 2.5, pos: 3990 + 2.5 * it };
  s.car = { ...s.car, visible: hz < 4, x: 0.2, z: hz, flame: 1.1, flameHot: 0.7, exhaust: 1, tail: 1.5, streak: 5, glow: 1.3 };
  if (hz > -30 && hz < 40) s.pools.push([0.2, hz - 14, 2.4, 13, LAMP, 0.5 * smooth(lin(hz, 40, 8))]);      // his lamps reach the lens before he does
  s.actors.push(actor('warden', -5, c1, { id: 0, v: 138, head: 0 }), actor('warden', 0.4, c2, { id: 1, v: 138 }));
  for (const [x, z] of [[-5, c1], [0.4, c2]]) if (z > -40 && z < 40) s.pools.push([x, z - 14, 2.4, 13, COLD, 0.45 * smooth(lin(z, 40, 8))]);
  // the cruisers' lights wash over the frame as they go through
  for (const [z, ph] of [[c1, 0], [c2, 1]]) wash(s, strobe(T, ph), 0.16 * Math.exp(-Math.abs(z + 8) / 26));
  s.fx.shake = [jolt(A.hero, 0.012) + jolt(A.cop1, 0.008) + jolt(A.cop2, 0.008), jolt(A.hero + 0.01, 0.016) + jolt(A.cop1, 0.01) + jolt(A.cop2 + 0.01, 0.01)];
  s.fx.rgb = 1 + 2.5 * after * after; s.fx.vignette = 0.62;
  return s;
}

// ── 4 s · TRACK ──
function track(it, T, a, calm) {
  const s = base(), u = it - CINE.track, A = CINE_AT;
  const away = smooth(lin(it, 7.15, 8.0));                                   // he drops a gear and goes
  const h = steer(1, [[6.6, 0]], it), hz = -27 + 6 * smooth(u / 3) - 30 * away * away;
  const cx = -6.6, cy = 0.74;
  const aimX = h.x - cx, aimZ = -(hz + 3.4 - 5 * away);
  s.cam = { x: cx, y: cy, pitch: 0.012, yaw: -Math.atan2(aimX, aimZ), roll: 0.018, fov: lens(18.5, a) };
  if (!calm) { s.cam.y += vnoise(it * 7, 1) * 0.02; s.cam.yaw += vnoise(it * 5, 2) * 0.004; s.cam.roll += vnoise(it * 4, 3) * 0.006; s.fx.shake = [vnoise(it * 13, 4) * 0.0025, vnoise(it * 15, 5) * 0.003]; }
  s.road = { vel: V, pos: 5200 + V * u };
  s.car = { ...s.car, x: h.x, z: hz, yaw: heading(h.vx), roll: lean(h.vx), flame: 0.5 + 1.2 * away, flameHot: 0.2 + 0.8 * away, exhaust: 0.6 + 0.4 * away, tail: 1.0, streak: 3 + 6 * away, glow: 1 + away, pitch: -0.03 * away };
  // the police: one on his line, one a lane across, closing
  const p1 = steer(1, [[7.0, 0]], it), p2 = steer(1, [[5.2, 2]], it);        // (the second runs wide of the first: half a lane out, on the shoulder side)
  s.actors.push(actor('warden', p1.x, hz + 13 - 3 * smooth(u / 3.5) + 30 * away * away * 0.35, { id: 0, yaw: heading(p1.vx), roll: lean(p1.vx), v: 140 }));
  s.actors.push(actor('warden', 5 + 0.0 * p2.x, hz + 24 - 6 * smooth(u / 3.5) + 30 * away * away * 0.35, { id: 1, v: 140 }));
  // a truck in the middle lane wipes the frame; the saloon he goes round
  s.actors.push(actor('leviathan', 0, -14.5 + 30 * (it - A.wipe), { id: 1, v: 120 }));
  s.actors.push(actor('monolith', 5, -30 + 26 * (it - 6.6), { id: 2, v: 124 }));
  s.actors.push(actor('nomad', -5, -150 + 34 * u, { id: 1, v: 116 }));
  wash(s, strobe(T), 0.035); s.fx.speed = 0.1; s.fx.rgb = 1.3; s.fx.vignette = 0.6;
  return s;
}

// ── 8 s · AIR ──
function air(it, T, a, calm) {
  const s = base(), u = it - CINE.air, A = CINE_AT, k = smooth(u / 4);
  s.cam = { x: 7.5 - 2.5 * k, y: 37 - 3 * k, pitch: -0.79 + 0.02 * k, yaw: 0.125 - 0.03 * k, roll: 0.07 - 0.04 * k, fov: lens(25 - 1.5 * k, a) };
  if (!calm) { s.cam.roll += vnoise(it * 3, 7) * 0.008; s.fx.shake = [vnoise(it * 17, 8) * 0.0016, vnoise(it * 19, 9) * 0.0016]; }
  s.road = { vel: V, pos: 5900 + V * u };
  const h = steer(0, [[9.1, -1], [10.7, 0]], it), hz = -37 - 3 * k;
  s.car = { ...s.car, x: h.x, z: hz, yaw: heading(h.vx), roll: lean(h.vx), flame: 0.9, flameHot: 0.4, streak: 7, tail: 1.6, glow: 1.8 };
  const slow = (lane, tp, kind, id) => s.actors.push(actor(kind, lane * L, hz + (it - tp) * 55, { id, v: 95 }));   // traffic he comes up on: level with him at tp
  slow(0, 9.55, 'monolith', 0); slow(-1, 11.25, 'relay', 1); slow(1, 8.1, 'orbit', 0); slow(1, 10.25, 'firefly', 0); slow(0, 12.4, 'nomad', 3); slow(1, 11.5, 'mule', 1);
  const p1 = steer(0, [[9.45, -1], [11.05, 0]], it), p2 = steer(-1, [[11.0, 0]], it, 0.7);
  s.actors.push(actor('warden', p1.x, hz + 15, { id: 0, yaw: heading(p1.vx), roll: lean(p1.vx), v: 150 }), actor('warden', p2.x, hz + 25, { id: 1, yaw: heading(p2.vx), v: 150 }));
  // the helicopter below the lens; its light sweeps the lanes, then has him
  const lock = smooth(lin(it, A.lock - 1.5, A.lock)), sw = Math.sin(u * 2.1);
  const sx = lerp(-9 + 7 * sw, h.x, lock), sz = lerp(-66 + 10 * Math.cos(u * 1.3), hz, lock);
  const hx = -1.2 + 1.2 * Math.sin(u * 0.7), bank = 0.09 * Math.cos(u * 0.7);
  s.heli = { x: hx, y: 17.5, z: -13.6 - 1.0 * k, yaw: 0.1 * Math.sin(u * 0.5), tx: 0.1, tz: -bank, scale: 0.8, lamp: COLD, sx, sz, beam: 0.75 + 0.35 * lock, wd: 2.2, pool: 0.8 + 0.5 * lock };
  if (it > A.lock) { const f = Math.exp(-(it - A.lock) / 0.12); s.fx.flash = 0.1 * f; s.car.glow = 1 + 1.5 * lock; }
  wash(s, strobe(T), 0.02); s.fx.vignette = 0.66; s.fx.rgb = 1.2;
  return s;
}

// ── 12 s · BUMPER ──
function bumper(it, T, a, calm) {
  const s = base(), u = it - CINE.bumper, [s1, s2, s3] = CINE_AT.swerve;
  const keys = [[s1, 1], [s2, 0], [s3, -1]];
  const h = steer(0, keys, it, 0.5), c = steer(0, keys.map(([t, l]) => [t + 0.3, l]), it, 0.6);
  const hz = -10.5 + 0.9 * Math.sin(u * 1.4) + 1.6 * smooth(lin(it, 15.2, 16));
  s.cam = { x: c.x * 0.94, y: 1.24, pitch: -0.025, yaw: -(h.x - c.x * 0.94) * 0.022 - c.vx * 0.0016, roll: -c.vx * 0.0042, fov: lens(52, a) };
  if (!calm) {
    s.cam.y += vnoise(it * 9, 11) * 0.03; s.cam.roll += vnoise(it * 6, 12) * 0.008;
    s.fx.shake = [vnoise(it * 19, 13) * 0.004, vnoise(it * 23, 14) * 0.005];
  }
  s.road = { vel: V, pos: 6600 + V * u };
  s.car = { ...s.car, x: h.x, z: hz, yaw: heading(h.vx) * 1.3, roll: lean(h.vx) * 1.4, flame: 0.7, flameHot: 0.3, exhaust: 0.8, streak: 4, tail: 1.1 };
  const slow = (lane, tp, kind, id) => s.actors.push(actor(kind, lane * L, hz + (it - tp) * 62, { id, v: 88 }));
  slow(0, s1 + 0.22, 'relay', 0); slow(1, s2 + 0.22, 'leviathan', 0); slow(0, s3 + 0.25, 'nomad', 2); slow(-1, 13.55, 'orbit', 1); slow(-1, 16.75, 'monolith', 1); slow(1, 12.2, 'firefly', 0); slow(1, 16.3, 'mule', 0);
  // our own light bar on the road ahead and on his tail; every near thing punches the lens
  const col = strobe(T);
  s.pools.push([s.cam.x, -4.5, 3.6, 5.5, col, 0.55]); wash(s, col, 0.05);
  for (const tp of [s1 + 0.38, s2 + 0.4, s3 + 0.42]) if (it > tp) { const f = Math.exp(-(it - tp) / 0.1); s.cam.fov *= 1 + 0.035 * f; s.fx.rgb = Math.max(s.fx.rgb, 1 + 3 * f); if (!calm) { s.fx.shake[0] += ring(it - tp, 50, 0.16) * 0.008; s.fx.shake[1] += ring(it - tp, 41, 0.18) * 0.01; } }
  s.fx.speed = 0.22; s.fx.rgb = Math.max(s.fx.rgb, 1.35); s.fx.vignette = 0.6;
  return s;
}

// ── 16 s · FRONT (staged facing the lens: +z is the way they are all going) ──
function front(it, T, a, calm) {
  const s = base(), u = it - CINE.front, k = smooth(u / 4), A = CINE_AT;
  const hz = -36 + 8 * k, hx = 0.5 * Math.sin(u * 1.2), hvx = 0.6 * Math.cos(u * 1.2);
  s.cam = { x: 0.35, y: 0.82 + 0.1 * k, pitch: 0.012, yaw: 0.004, roll: 0.006 * Math.sin(u * 0.9), fov: lens(15 - 2 * k, a) };
  if (!calm) s.fx.shake = [vnoise(it * 11, 21) * 0.0012, vnoise(it * 13, 22) * 0.0014];
  s.road = { vel: -V, pos: 7400 - V * u };
  s.sunEl = -0.3; s.sunPow = 0.4; s.stars = 1;
  s.car = { ...s.car, x: hx, z: hz, yaw: PI + heading(hvx) * 2, roll: -lean(hvx) * 2, flame: 0, flameHot: 0, exhaust: 0, streak: 0, tail: 0.2, glow: 1.5, bob: calm ? 0 : vnoise(it * 12, 23) * 0.012 };
  for (const sx of [-1, 1]) s.sprites.push([hx + sx * 0.68, 0.6, hz + 2.2, 0.75, LAMP, 0.85]);
  s.pools.push([hx, hz + 9, 2.2, 7, LAMP, 0.4]);
  // traffic he has just gone by slides back through the frame, and the police go round it
  const slow = (lane, tp, kind, id) => s.actors.push(actor(kind, lane * L, -(it - tp) * 55, { id, yaw: PI, v: 0 }));
  slow(-1, 16.85, 'monolith', 3); slow(1, 18.1, 'leviathan', 1); slow(-1, 19.0, 'firefly', 0); slow(1, 15.6, 'nomad', 0);
  const p1 = steer(-1, [[17.35, 0], [18.3, -1]], it, 0.6), p2 = steer(1, [[18.75, 0]], it, 0.6);
  s.actors.push(actor('warden', p1.x, hz - 13 + 3 * k, { id: 0, yaw: PI + heading(p1.vx), roll: lean(p1.vx), head: 1, v: 0 }));
  s.actors.push(actor('warden', p2.x, hz - 23 + 5 * k, { id: 1, yaw: PI + heading(p2.vx), roll: lean(p2.vx), head: 1, v: 0 }));
  s.actors.push(actor('warden', 0.8, hz - 48 + 8 * k, { id: 2, yaw: PI, head: 1, v: 0 }));
  // the helicopter behind and above them all, its light on him; in the last half second it swings into the lens
  const fl = smooth(lin(it, A.flare, CINE.title));
  s.heli = { x: -4 + 2.5 * Math.sin(u * 0.8), y: 8.2 - 1.2 * k, z: hz - 92 + 14 * k, yaw: PI + 0.12 * Math.sin(u * 0.6), tx: -0.16, tz: 0.05 * Math.cos(u * 0.8), scale: 2, lamp: COLD,
    sx: lerp(hx, s.cam.x, fl), sz: lerp(hz - 1, -3, fl), beam: 0.8 + 0.6 * fl, wd: 2.4, pool: 1.0, glare: 1 + 5 * fl };
  s.fx.flash = calm ? 0.25 * fl * fl : 0.85 * fl * fl; s.fx.bloom = 1 + 0.8 * fl;
  wash(s, strobe(T), 0.045); wash(s, COLD, 0.25 * fl);
  s.fx.rgb = 1.25 + 2 * fl; s.fx.vignette = 0.7 - 0.3 * fl;
  return s;
}

// The five shots before the title. Returns everything the picture needs for the moment `it` (seconds from START).
export function cinemaShot(it, T, aspect, calm) {
  const C = CINE;
  const s = it < C.track ? road(it, T, aspect, calm) : it < C.air ? track(it, T, aspect, calm) : it < C.bumper ? air(it, T, aspect, calm) : it < C.front ? bumper(it, T, aspect, calm) : front(it, T, aspect, calm);
  // each cut lands with a jolt of the tape: a frame of colour split
  const cut = [C.track, C.air, C.bumper, C.front].reduce((m, t) => (it >= t ? t : m), -1);
  if (cut >= 0 && it - cut < 0.12 && !calm) s.fx.rgb = Math.max(s.fx.rgb, 1 + 5 * (1 - (it - cut) / 0.12));
  return s;
}

// From the title on the lens is the game's own. What else is in the picture: the cruiser that settles on his bumper (where the
// drive finds it), the second one dropping back, the helicopter going over and away. cz: where the car is ahead of the lens.
export function cinemaTail(it, T, cz) {
  const s = { actors: [], pools: [], sprites: [], heli: null }, u = it - CINE.title;
  const x1 = -L * (1 - smooth(lin(it, 22.0, 24.3))), z1 = cz + lerp(10.5, 6.5, smooth(lin(it, 20.6, 25.0)));
  const vx1 = (-L * (1 - smooth(lin(it + 0.05, 22.0, 24.3))) - x1) / 0.05;
  s.actors.push(actor('warden', x1, z1, { id: 0, yaw: heading(vx1, 60), roll: lean(vx1), v: 60 }));
  const z2 = cz + 4.5 + 16 * smooth(lin(it, 21.2, 23.8));
  if (z2 < 9) s.actors.push(actor('warden', L, z2, { id: 1, v: 60 }));
  const out = smooth(lin(it, 22.6, 24.4));
  if (out < 1) {
    const on = 1 - smooth(lin(it, 21.2, 22.2));
    s.heli = { x: 7 - 2.5 * u, y: 24 + 5 * u, z: cz - 26 - 46 * u, yaw: -0.25, tx: 0.2, tz: 0.1, scale: 2, lamp: COLD, fade: 1 - out, sx: 0, sz: cz - 2, beam: 0.7 * on, wd: 2.4, pool: 0.9 * on };
  }
  return s;
}

// The letterbox, and the lines typed over the picture: where and when, then what the radio says.
const CAPS = [[1.0, 3.75, 'NEON CITY BELTWAY\nNOV. 8 1986 · 12:00 AM'], [8.35, 11.75, 'AIR-7: VISUAL ON THE PHANTOM'], [16.35, 19.4, 'ALL UNITS: BOX HIM IN']];
export function cinemaUI(it) {
  const bars = smooth(lin(it, 0.5, 1.0)) * (1 - smoother(lin(it, 22.4, 24.0)));
  let cap = '';
  for (const [t0, t1, text] of CAPS) if (it >= t0 && it < t1) { const n = Math.floor((it - t0) * 30); cap = text.slice(0, n) + (n < text.length || Math.floor(it * 3) % 2 ? '▌' : ''); }
  return { bars, cap };
}
