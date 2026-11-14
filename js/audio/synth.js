// ─────────────────────────────────────────────────────────────────────────────
// MIDNIGHT CRUISE — deterministic synthwave engine.
// Pure JavaScript DSP. Runs unchanged inside an AudioWorklet (live) and in Node
// (offline reference renders + loudness measurement). Output is a pure function
// of the sample index and the event timeline.
// ─────────────────────────────────────────────────────────────────────────────
import { SR, TICK, TPB, IGN, TURBO, BAR, BEAT, GAME, ignitionBar, cruiseBar, turboNotes, cruiseChord, neonPower } from '../cue.js';
import { Timeline } from '../timeline.js';
import { policeClose, revs } from '../game.js';
import { REVCRASH_PEAK } from './samples.js';

const TAU = Math.PI * 2;
const TICK_S = Math.round(TICK * SR);              // 3000 samples
const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
const cents = (c) => Math.pow(2, c / 1200);
const panL = (p) => Math.cos((p + 1) * Math.PI / 4);
const panR = (p) => Math.sin((p + 1) * Math.PI / 4);
const exp = Math.exp, sin = Math.sin, tanh = Math.tanh;

// Mastering trims (dB) — set from measured reference renders (tools/render-audio.mjs).
export const MASTER = { ignTrimDb: -0.55, cruiseTrimDb: -1.4, ceilingDbtp: -1.5 };

class RNG {
  constructor(s) { this.s = (s >>> 0) || 0x9e3779b9; }
  next() { let x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.s = x >>> 0; return this.s / 2147483648 - 1; }
}
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
class Saw {
  constructor(ph = 0) { this.ph = ph; }
  run(f) { const dt = f / SR; let p = this.ph + dt; if (p >= 1) p -= 1; this.ph = p; return 2 * p - 1 - blep(p, dt); }
}
// Zero-delay-feedback state-variable filter (Cytomic / Simper).
class SVF {
  constructor() { this.ic1 = 0; this.ic2 = 0; this.a1 = 1; this.a2 = 0; this.a3 = 0; this.k = 1; }
  set(fc, q) {
    const g = Math.tan(Math.PI * Math.min(fc, SR * 0.46) / SR);
    this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
  }
  _s(v0) {
    const v3 = v0 - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2; this.v1 = v1; this.v2 = v2; return v0;
  }
  lp(x) { this._s(x); return this.v2; }
  bp(x) { this._s(x); return this.v1; }
  hp(x) { this._s(x); return x - this.k * this.v1 - this.v2; }
}

// ── Voices ────────────────────────────────────────────────────────────────
class Voice {
  constructor(syn, o) { this.syn = syn; this.n = -o; }
  run(B, N) {
    for (let i = 0; i < N; i++) {
      if (this.n < 0) { this.n++; continue; }
      if (!this.tick(B, i, this.n / SR)) return false;
      this.n++;
    }
    return true;
  }
}

class Kick extends Voice {
  constructor(s, o, v) { super(s, o); this.v = v; this.ph = 0; this.r = new RNG(s.seed()); }
  tick(B, i, t) {
    const f = 44 + 120 * exp(-t / 0.03) + 380 * exp(-t / 0.0025);
    this.ph += f / SR; if (this.ph > 1) this.ph -= 1;
    let a = exp(-t / 0.4); if (t < 0.0015) a *= t / 0.0015;
    const y = tanh(1.7 * (sin(TAU * this.ph) * a + this.r.next() * 0.22 * exp(-t / 0.002))) * 0.6 * this.v * this.syn.p.kickMul;
    B.L[i] += y; B.R[i] += y; B.rev[i] += y * 0.025;
    return t < 0.9;
  }
}
class Snare extends Voice {
  constructor(s, o, v, fill) {
    super(s, o); this.v = v; this.fill = fill; this.p1 = 0; this.p2 = 0; this.r = new RNG(s.seed());
    this.bp = new SVF(); this.bp.set(2700, 0.9); this.hp = new SVF(); this.hp.set(850, 0.7);
    s.openGate(o, fill ? 0.12 : 0.26);
  }
  tick(B, i, t) {
    this.p1 += 186 * (1 + 0.3 * exp(-t / 0.012)) / SR; this.p2 += 332 * (1 + 0.2 * exp(-t / 0.01)) / SR;
    const body = (sin(TAU * this.p1) * 0.65 + sin(TAU * this.p2) * 0.35) * exp(-t / 0.07);
    const nz = this.r.next();
    const n = this.hp.hp(this.bp.bp(nz) * 1.6 + nz * 0.35) * exp(-t / 0.15);
    const y = tanh((body * 0.85 + n) * 1.2) * 0.5 * this.v;
    B.L[i] += y * 0.96; B.R[i] += y; B.gate[i] += y * (this.fill ? 0.45 : 1.0); B.rev[i] += y * 0.08;
    return t < 0.5;
  }
}
class Clap extends Voice {
  constructor(s, o, v) { super(s, o); this.v = v; this.r = new RNG(s.seed()); this.bp = new SVF(); this.bp.set(1150, 1.3); s.openGate(o, 0.18); }
  tick(B, i, t) {
    let e = 0; for (const tk of [0, 0.011, 0.022]) if (t >= tk) e += exp(-(t - tk) / 0.004);
    if (t >= 0.022) e += 0.6 * exp(-(t - 0.022) / 0.1);
    const y = this.bp.bp(this.r.next()) * e * 0.55 * this.v;
    B.L[i] += y * 0.9; B.R[i] += y * 1.05; B.gate[i] += y * 0.5; B.rev[i] += y * 0.08;
    return t < 0.4;
  }
}
const METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
class Hat extends Voice {
  constructor(s, o, v, open) {
    super(s, o); this.v = v; this.open = open; this.ph = METAL.map((_, k) => k * 0.137); this.r = new RNG(s.seed());
    this.bp = new SVF(); this.bp.set(10000, 0.9); this.hp = new SVF(); this.hp.set(7200, 0.7);
  }
  tick(B, i, t) {
    let sq = 0;
    for (let k = 0; k < 6; k++) { let p = this.ph[k] + METAL[k] * 1.42 / SR; if (p >= 1) p -= 1; this.ph[k] = p; sq += p < 0.5 ? 1 : -1; }
    const env = this.open ? exp(-t / 0.28) : exp(-t / 0.038);
    const y = this.hp.hp(this.bp.bp(sq * 0.18 + this.r.next() * 0.5)) * env * 0.42 * this.v * this.syn.p.hatMul;
    B.L[i] += y * 0.8; B.R[i] += y * 1.1; B.rev[i] += y * 0.03;
    return t < (this.open ? 1.2 : 0.22);
  }
}
class Crash extends Voice {
  constructor(s, o, v, rev = 0, dur = 0) {
    super(s, o); this.v = v; this.revd = rev; this.dur = dur; this.ph = METAL.map((_, k) => k * 0.21);
    this.rl = new RNG(s.seed()); this.rr = new RNG(s.seed());
    this.hl = new SVF(); this.hl.set(4200, 0.7); this.hr = new SVF(); this.hr.set(4400, 0.7);
  }
  tick(B, i, t) {
    let sq = 0;
    for (let k = 0; k < 6; k++) { let p = this.ph[k] + METAL[k] * 2.37 / SR; if (p >= 1) p -= 1; this.ph[k] = p; sq += p < 0.5 ? 1 : -1; }
    let env;
    if (this.revd) env = t < this.dur ? Math.pow(t / this.dur, 2.6) : exp(-(t - this.dur) / 0.018);
    else env = (t < 0.003 ? t / 0.003 : 1) * (exp(-t / 1.5) + 0.5 * exp(-t / 0.05));
    const m = sq * 0.08;
    const yl = this.hl.hp(this.rl.next() * 0.5 + m) * env * 0.3 * this.v;
    const yr = this.hr.hp(this.rr.next() * 0.5 + m) * env * 0.3 * this.v;
    const L = this.revd ? B.fxL : B.L, R = this.revd ? B.fxR : B.R;
    L[i] += yl; R[i] += yr; B.rev[i] += (yl + yr) * 0.08;
    return this.revd ? t < this.dur + 0.1 : t < 4.0;
  }
}
class Tom extends Voice {
  constructor(s, o, n, v) { super(s, o); this.f = mtof(n); this.v = v; this.ph = 0; this.r = new RNG(s.seed()); this.pan = Math.max(-0.7, Math.min(0.7, (n - 45) / -12)); s.openGate(o, 0.2); }
  tick(B, i, t) {
    this.ph += this.f * (1 + 0.6 * exp(-t / 0.05)) / SR;
    const y = (sin(TAU * this.ph) * exp(-t / 0.3) + this.r.next() * 0.25 * exp(-t / 0.008)) * 0.5 * this.v;
    B.L[i] += y * panL(this.pan) * 1.2; B.R[i] += y * panR(this.pan) * 1.2; B.gate[i] += y * 0.55; B.rev[i] += y * 0.08;
    return t < 0.9;
  }
}
class Sub extends Voice {
  constructor(s, o, v) { super(s, o); this.v = v; this.ph = 0; }
  tick(B, i, t) {
    this.ph += (30 + 34 * exp(-t / 0.22)) / SR;
    const y = sin(TAU * this.ph) * exp(-t / 0.85) * Math.min(1, t / 0.005) * 0.62 * this.v;
    B.fxL[i] += y; B.fxR[i] += y;
    return t < 3;
  }
}
class Impact extends Voice {
  constructor(s, o, v) { super(s, o); this.v = v; this.rl = new RNG(s.seed()); this.rr = new RNG(s.seed()); this.fl = new SVF(); this.fr = new SVF(); this.ph = 0; }
  tick(B, i, t) {
    if ((this.n & 15) === 0) { const c = 120 + 1800 * exp(-t / 0.05); this.fl.set(c, 0.7); this.fr.set(c * 1.07, 0.7); }
    this.ph += (40 + 30 * exp(-t / 0.1)) / SR;
    const a = exp(-t / 0.45) * Math.min(1, t / 0.002);
    const th = sin(TAU * this.ph) * exp(-t / 0.35) * 0.5;
    const air = (this.fl.lp(this.rl.next()) + this.fr.lp(this.rr.next())) * 0.04 * exp(-t / 0.03);
    const y = (th * 1.2 + air) * a * 0.55 * this.v;
    B.fxL[i] += y; B.fxR[i] += y; B.rev[i] += y * 0.08;
    return t < 2.2;
  }
}
class Riser extends Voice {
  constructor(s, o, d, v = 1) { super(s, o); this.d = d; this.v = v; this.rl = new RNG(s.seed()); this.rr = new RNG(s.seed()); this.bl = new SVF(); this.br = new SVF(); this.saw = new Saw(); this.lp = new SVF(); this.lp.set(3500, 0.8); }
  tick(B, i, t) {
    const x = Math.min(1, t / this.d);
    if ((this.n & 15) === 0) { const c = 280 * Math.pow(22, x); this.bl.set(c, 2.2); this.br.set(c * 1.12, 2.2); }
    const a = (t < this.d ? x * x : exp(-(t - this.d) / 0.01)) * 0.36 * this.v;
    const s = this.lp.lp(this.saw.run(110 * Math.pow(4, x))) * 0.25;
    const yl = (this.bl.bp(this.rl.next()) * 0.35 + s * 1.6) * a, yr = (this.br.bp(this.rr.next()) * 0.35 + s * 1.6) * a;
    B.fxL[i] += yl; B.fxR[i] += yr; B.rev[i] += (yl + yr) * 0.1;
    return t < this.d + 0.08;
  }
}
class Whoosh extends Voice {
  constructor(s, o, v) { super(s, o); this.v = v; this.rl = new RNG(s.seed()); this.rr = new RNG(s.seed()); this.bl = new SVF(); this.br = new SVF(); }
  tick(B, i, t) {
    if ((this.n & 15) === 0) { const c = 300 + 4200 * exp(-t / 0.3); this.bl.set(c, 1.4); this.br.set(c * 0.9, 1.4); }
    const a = Math.min(1, t / 0.02) * exp(-t / 0.4) * 0.5 * this.v;
    const p = Math.min(1, t / 0.8) * 2 - 1;
    B.fxL[i] += this.bl.bp(this.rl.next()) * a * panL(p); B.fxR[i] += this.br.bp(this.rr.next()) * a * panR(p);
    return t < 1.6;
  }
}
class Bass extends Voice {
  constructor(s, o, n, v, d) {
    super(s, o); this.f = mtof(n); this.v = v; this.d = d;
    this.a = new Saw(0.1); this.b = new Saw(0.6); this.ph = 0; this.l1 = new SVF(); this.l2 = new SVF(); this.rel = 1;
  }
  tick(B, i, t) {
    const p = this.syn.p;
    if ((this.n & 15) === 0) { const c = p.bassCut * (1 + 2.4 * exp(-t / 0.07)); this.l1.set(c, 0.9); this.l2.set(c, 1.25); }
    this.ph += this.f / SR; if (this.ph > 1) this.ph -= 1;
    const osc = this.a.run(this.f * 0.9966) + this.b.run(this.f * 1.0034) + sin(TAU * this.ph) * 0.4;
    let e;
    if (t < 0.003) e = t / 0.003;
    else if (t < this.d) { e = 0.72 + 0.28 * exp(-t / 0.05); this.rel = e; }
    else e = this.rel * exp(-(t - this.d) / 0.03);
    const y = tanh(this.l2.lp(this.l1.lp(osc)) * p.bassDrive) * e * 0.3 * this.v;
    B.L[i] += y; B.R[i] += y; B.rev[i] += y * 0.015;
    return t < this.d + 0.22;
  }
}
class Pad extends Voice {
  constructor(s, o, notes, d, v, slow) {
    super(s, o); this.v = v; this.d = d; this.atk = slow ? 1.4 : 0.35;
    this.osc = []; const det = [-9, 0, 8], pans = [-0.65, 0, 0.65];
    notes.forEach((n, k) => det.forEach((c, j) => this.osc.push({ s: new Saw((k * 0.31 + j * 0.17) % 1), f: mtof(n) * cents(c + (k % 2 ? 2 : -2)), l: panL(pans[(j + k) % 3]), r: panR(pans[(j + k) % 3]) })));
    this.fl = new SVF(); this.fr = new SVF();
  }
  tick(B, i, t) {
    const p = this.syn.p;
    const env = t < this.d ? Math.min(1, t / this.atk) : exp(-(t - this.d) / 0.9);
    if ((this.n & 31) === 0) { const c = p.padCut * (0.55 + 0.45 * Math.min(1, t / (this.atk * 1.5))); this.fl.set(c, 0.75); this.fr.set(c * 1.04, 0.75); }
    let l = 0, r = 0;
    for (const o of this.osc) { const y = o.s.run(o.f); l += y * o.l; r += y * o.r; }
    const g = env * 0.075 * this.v * p.padMul;
    const yl = this.fl.lp(l) * g, yr = this.fr.lp(r) * g;
    B.choL[i] += yl; B.choR[i] += yr; B.rev[i] += (yl + yr) * 0.28;
    return t < this.d + 4.5;
  }
}
class Stab extends Voice { // the big chord: polysynth brass, clean and wide (2 saws/note ±6 c + soft square sub)
  constructor(s, o, notes, d, v) {
    super(s, o); this.v = v; this.d = d; this.osc = [];
    notes.forEach((n, k) => [-6, 6].forEach((c, j) => { const pn = ((k / Math.max(1, notes.length - 1)) * 2 - 1) * 0.75 * (j ? 1 : -1); this.osc.push({ s: new Saw((k * 0.23 + j * 0.5) % 1), f: mtof(n) * cents(c), l: panL(pn), r: panR(pn) }); }));
    this.sub = mtof(notes[0]) / 2; this.sph = 0;
    this.fl = new SVF(); this.fr = new SVF(); this.rel = 1;
  }
  tick(B, i, t) {
    if ((this.n & 15) === 0) { const c = 1500 + 3600 * (1 - exp(-t / 0.02)) * exp(-t / 0.45); this.fl.set(c, 0.62); this.fr.set(c * 1.04, 0.62); }
    let e; if (t < 0.012) e = t / 0.012; else if (t < this.d) { e = 0.62 + 0.38 * exp(-t / 0.5); this.rel = e; } else e = this.rel * exp(-(t - this.d) / 0.9);
    let l = 0, r = 0; for (const o of this.osc) { const y = o.s.run(o.f); l += y * o.l; r += y * o.r; }
    this.sph += this.sub / SR; if (this.sph > 1) this.sph -= 1;
    const sq = sin(TAU * this.sph) * 0.9;
    const g = e * 0.075 * this.v;
    const yl = this.fl.lp(l) * g + sq * g, yr = this.fr.lp(r) * g + sq * g;
    B.choL[i] += yl * 0.55; B.choR[i] += yr * 0.55; B.L[i] += yl * 0.45; B.R[i] += yr * 0.45;
    B.rev[i] += (yl + yr) * 0.3; B.dly[i] += (yl + yr) * 0.05;
    return t < this.d + 4;
  }
}
class Lead extends Voice {
  constructor(s, o, n, d, v) { super(s, o); this.f = mtof(n); this.d = d; this.v = v; this.a = new Saw(0.3); this.b = new Saw(0.8); this.lp = new SVF(); this.rel = 1; }
  tick(B, i, t) {
    if ((this.n & 15) === 0) this.lp.set(2400 + 2000 * exp(-t / 0.14), 1.25);
    const vib = 1 + 0.0075 * sin(TAU * 5.4 * t) * Math.min(1, Math.max(0, (t - 0.28) / 0.3));
    const f = this.f * vib;
    const osc = this.a.run(f * 0.997) + this.b.run(f * 1.003) * 0.8;
    let e; if (t < 0.012) e = t / 0.012; else if (t < this.d) { e = 0.85 + 0.15 * exp(-t / 0.1); this.rel = e; } else e = this.rel * exp(-(t - this.d) / 0.12);
    const y = this.lp.lp(osc) * e * 0.13 * this.v;
    B.L[i] += y * 1.05; B.R[i] += y * 0.9; B.dly[i] += y * 0.36; B.rev[i] += y * 0.22;
    return t < this.d + 0.8;
  }
}
class Arp extends Voice {
  constructor(s, o, n, d, v, pan) { super(s, o); this.f = mtof(n); this.d = d; this.v = v; this.a = new Saw(); this.b = new Saw(0.3); this.lp = new SVF(); this.l = panL(pan); this.r = panR(pan); }
  tick(B, i, t) {
    if ((this.n & 15) === 0) this.lp.set(this.syn.p.arpCut * (1 + 1.2 * exp(-t / 0.03)), 1.1);
    const osc = this.a.run(this.f) - this.b.run(this.f);
    const e = Math.min(1, t / 0.002) * exp(-t / 0.11) * (t < this.d ? 1 : exp(-(t - this.d) / 0.02));
    const y = this.lp.lp(osc) * e * 0.12 * this.v;
    B.L[i] += y * this.l; B.R[i] += y * this.r; B.dly[i] += y * 0.3; B.rev[i] += y * 0.1;
    return t < this.d + 0.3;
  }
}
class Pluck extends Voice {
  constructor(s, o, n, v) { super(s, o); this.f = mtof(n); this.v = v; this.a = new Saw(); this.b = new Saw(0.5); this.lp = new SVF(); }
  tick(B, i, t) {
    if ((this.n & 15) === 0) this.lp.set(800 + 3200 * exp(-t / 0.05), 1.0);
    const y = this.lp.lp(this.a.run(this.f * 0.996) + this.b.run(this.f * 1.004)) * exp(-t / 0.3) * Math.min(1, t / 0.002) * 0.08 * this.v;
    B.choL[i] += y; B.choR[i] += y * 0.8; B.rev[i] += y * 0.2; B.dly[i] += y * 0.15;
    return t < 1.4;
  }
}
class Bell extends Voice {
  constructor(s, o, n, v) { super(s, o); this.f = mtof(n); this.v = v; this.pc = 0; this.pm = 0; this.pan = ((n % 5) / 2 - 1) * 0.6; }
  tick(B, i, t) {
    this.pm += this.f * 3.5 / SR; this.pc += this.f / SR;
    const y = sin(TAU * this.pc + sin(TAU * this.pm) * 2.4 * exp(-t / 0.25)) * exp(-t / 0.9) * Math.min(1, t / 0.003) * 0.1 * this.v;
    B.L[i] += y * panL(this.pan); B.R[i] += y * panR(this.pan); B.rev[i] += y * 0.45; B.dly[i] += y * 0.3;
    return t < 4;
  }
}

// Sample playback (CC0 one-shots): linear interpolation, rate, pan, offset, sends.
class Smp extends Voice {
  constructor(syn, o, buf, opt) {
    super(syn, o); this.L = buf.L; this.R = buf.R; this.len = buf.L.length;
    this.g = opt.gain ?? 1; this.rate = opt.rate ?? 1; this.pos = (opt.start ?? 0) * SR;
    const p = opt.pan ?? 0; this.pl = panL(p) * Math.SQRT2; this.pr = panR(p) * Math.SQRT2;
    this.rev = opt.rev ?? 0; this.gate = opt.gate ?? 0; this.dly = opt.dly ?? 0; this.fx = opt.bus === 'fx';
    this.cut = opt.cut ?? Infinity;          // hard stop (s) with a 10 ms fade
  }
  tick(B, i, t) {
    const p = this.pos; if (p >= this.len - 1) return false;
    const k = p | 0, f = p - k;
    let l = this.L[k] + (this.L[k + 1] - this.L[k]) * f, r = this.R[k] + (this.R[k + 1] - this.R[k]) * f;
    let g = this.g;
    if (t > this.cut) { g *= Math.max(0, 1 - (t - this.cut) / 0.01); if (g <= 0) return false; }
    l *= g * this.pl; r *= g * this.pr;
    if (this.fx) { B.fxL[i] += l; B.fxR[i] += r; } else { B.L[i] += l; B.R[i] += r; }
    const m = (l + r) * 0.5;
    if (this.rev) B.rev[i] += m * this.rev;
    if (this.gate) B.gate[i] += m * this.gate;
    if (this.dly) B.dly[i] += m * this.dly;
    this.pos = p + this.rate;
    return true;
  }
}

// ── SFX ───────────────────────────────────────────────────────────────────
class Tape extends Voice { // cassette engage + motor spin-up
  constructor(s, o) { super(s, o); this.saw = new Saw(); this.lp = new SVF(); this.r = new RNG(s.seed()); this.nl = new SVF(); this.nl.set(1400, 0.7); this.ph = 0; }
  tick(B, i, t) {
    if ((this.n & 31) === 0) this.lp.set(180 + 900 * Math.min(1, t / 0.4), 0.9);
    const f = 32 + 85 * (1 - exp(-t / 0.18));
    this.ph += 88 / SR;
    const motor = this.lp.lp(this.saw.run(f)) * Math.min(1, t / 0.05) * exp(-t / 0.5) * 0.18;
    const clunk = (this.nl.lp(this.r.next()) * exp(-t / 0.018) + sin(TAU * this.ph) * exp(-t / 0.05)) * 0.35;
    const y = motor + clunk;
    B.sfxL[i] += y; B.sfxR[i] += y;
    return t < 1.6;
  }
}
class Vhs extends Voice { // tracking hiss + chirps for the opening
  constructor(s, o, d) { super(s, o); this.d = d; this.rl = new RNG(s.seed()); this.rr = new RNG(s.seed()); this.hl = new SVF(); this.hl.set(2600, 0.7); this.hr = new SVF(); this.hr.set(2900, 0.7); this.ph = 0; this.hum = 0; }
  tick(B, i, t) {
    const env = Math.min(1, t / 0.01) * (t < this.d - 0.08 ? 1 : Math.max(0, (this.d - t) / 0.08));
    const k = Math.floor(t * 23); const chirpOn = ((k * 2654435761) >>> 0) % 3 === 0;
    const cf = 1200 + (((k * 40503) >>> 0) % 3800);
    this.ph += cf / SR; this.hum += 59.94 / SR;
    const chirp = chirpOn ? sin(TAU * this.ph) * 0.12 * exp(-(t * 23 - k) * 3) : 0;
    const hum = sin(TAU * this.hum) * 0.05;
    B.sfxL[i] += (this.hl.hp(this.rl.next()) * 0.11 + chirp + hum) * env;
    B.sfxR[i] += (this.hr.hp(this.rr.next()) * 0.11 + chirp * 0.7 + hum) * env;
    return t < this.d;
  }
}
class Buzz extends Voice { // neon tube: transformer hum + ignition sparks, follows neonPower()
  constructor(s, o, d) { super(s, o); this.d = d; this.ph = 0; this.bp = new SVF(); this.bp.set(760, 2.5); this.r = new RNG(s.seed()); this.last = 0; this.spark = -1; this.hp = new SVF(); this.hp.set(3000, 0.7); }
  tick(B, i, t) {
    const it = IGN.neonWrite[0] + t;
    const pw = neonPower(it);
    if (pw > this.last + 0.4) this.spark = t; this.last = pw;
    this.ph += 120 / SR; if (this.ph > 1) this.ph -= 1;
    const sq = (this.ph < 0.5 ? 1 : -1) * 0.6 + sin(TAU * this.ph * 2) * 0.4;
    const fade = it < IGN.neonFlicker[1] ? 1 : exp(-(it - IGN.neonFlicker[1]) / 0.35);
    let y = this.bp.bp(sq) * pw * 0.11 * fade;
    if (this.spark >= 0 && t - this.spark < 0.03) y += this.hp.hp(this.r.next()) * exp(-(t - this.spark) / 0.006) * 0.16;
    B.sfxL[i] += y * 0.9; B.sfxR[i] += y * 1.1;
    return t < this.d + 1.2;
  }
}
class Blip extends Voice { // generic UI tone: freq sweep f0→f1, decay
  constructor(s, o, f0, f1, dur, amp, pan = 0, delay = 0) { super(s, o); this.f0 = f0; this.f1 = f1; this.dur = dur; this.amp = amp; this.ph = 0; this.l = panL(pan); this.r = panR(pan); this.dl = delay; }
  tick(B, i, t) {
    const u = t - this.dl; if (u < 0) return true;
    this.ph += (this.f1 + (this.f0 - this.f1) * exp(-u / (this.dur * 0.4))) / SR;
    const y = sin(TAU * this.ph) * exp(-u / this.dur) * Math.min(1, u / 0.001) * this.amp;
    B.sfxL[i] += y * this.l; B.sfxR[i] += y * this.r;
    return u < this.dur * 7;
  }
}
class Click extends Voice { // mechanical button: noise tick + body thump
  constructor(s, o, amp = 1, heavy = 0) { super(s, o); this.amp = amp; this.heavy = heavy; this.r = new RNG(s.seed()); this.lp = new SVF(); this.lp.set(heavy ? 1600 : 5200, 0.8); this.ph = 0; }
  tick(B, i, t) {
    this.ph += (this.heavy ? 88 : 150) / SR;
    let y = this.lp.lp(this.r.next()) * exp(-t / (this.heavy ? 0.014 : 0.0025)) * 0.45 + sin(TAU * this.ph) * exp(-t / (this.heavy ? 0.06 : 0.018)) * 0.3;
    if (this.heavy && t > 0.028) y += this.lp.lp(this.r.next()) * exp(-(t - 0.028) / 0.01) * 0.3;
    y *= this.amp;
    B.sfxL[i] += y; B.sfxR[i] += y;
    return t < 0.3;
  }
}
class Pass extends Voice { // a vehicle goes by in the next lane: a rush of air on that side, its pitch falling as it passes.
  // Loud enough to be heard over the music: it sits where the mix is thin (1 to 3 kHz) and is well clear of it there.
  constructor(s, o, side, big) { super(s, o); this.big = big; this.r = new RNG(s.seed()); this.f = new SVF(); this.g = new SVF(); this.l = panL(side * 0.85); this.rg = panR(side * 0.85); }
  tick(B, i, t) {
    const d = this.big ? 0.55 : 0.34;
    if ((this.n & 15) === 0) { const c = (this.big ? 380 : 650) + (this.big ? 1500 : 2500) * exp(-t / (d * 0.4)); this.f.set(c, 1.7); this.g.set(c * 0.5, 0.9); }
    const x = this.r.next(), env = Math.min(1, t / 0.035) * exp(-t / (d * 0.5));
    const y = (this.f.bp(x) + this.g.bp(x) * 0.5) * env * (this.big ? 0.5 : 0.48);
    B.sfxL[i] += y * this.l; B.sfxR[i] += y * this.rg;
    return t < d * 3;
  }
}
class Horn extends Voice { // a car horn, as something cuts in ahead: two reedy notes a third apart, its pitch falling a little as we close on it
  constructor(s, o) { super(s, o); this.a = new Saw(0); this.b = new Saw(0.3); this.f = new SVF(); this.f.set(2400, 0.9); }
  tick(B, i, t) {
    const d = 0.3, bend = 1 - 0.035 * Math.min(1, t / d), env = Math.min(1, t / 0.012) * (t < d ? 1 : exp(-(t - d) / 0.045));
    const y = this.f.lp(this.a.run(415 * bend) + this.b.run(523 * bend)) * 0.05 * env;
    B.sfxL[i] += y; B.sfxR[i] += y;
    return t < d + 0.3;
  }
}
class Skid extends Voice { // tyres: a cruiser swerving hard across a lane
  constructor(s, o) { super(s, o); this.r = new RNG(s.seed()); this.f = new SVF(); this.ph = 0; }
  tick(B, i, t) {
    if ((this.n & 15) === 0) this.f.set(1250 - 380 * t / 0.45 + 60 * sin(TAU * 23 * t), 7);
    this.ph += (1180 - 300 * t / 0.45) / SR;
    const env = Math.min(1, t / 0.025) * (t < 0.3 ? 1 : exp(-(t - 0.3) / 0.07));
    const y = (this.f.bp(this.r.next()) * 0.085 + sin(TAU * this.ph) * 0.006) * env;
    B.sfxL[i] += y; B.sfxR[i] += y;
    return t < 0.65;
  }
}
// ── Game impacts and weapons ─────────────────────────────────────────────────
// Everything here is drawn from noise, sines and a few resonances: no samples. Each takes a pan (−1 left … +1 right) so a hit
// is heard where it happened, and the big ones duck the music for a moment (see Synth.duck).
const rnd01 = (r) => r.next() * 0.5 + 0.5;
class Crunch extends Voice { // a vehicle hit hard: a body thump, a crack, sheet metal ringing, glass, debris rattling down
  constructor(s, o, v = 1, pan = 0, big = 0) {
    super(s, o); this.v = v; this.big = big; this.l = panL(pan * 0.75); this.r = panR(pan * 0.75);
    const R = this.rn = new RNG(s.seed());
    this.hp = new SVF(); this.hp.set(big ? 1400 : 2000, 0.7); this.lp = new SVF(); this.lp.set(big ? 700 : 1100, 0.8); this.ph = 0; this.gate = 1;
    // the metal: inharmonic modes, each with its own decay (sheet steel and plastic, a little lower and longer for the big one)
    const base = [312, 517, 788, 1144, 1690, 2380, 3210];
    this.md = base.map((f) => [f * (0.82 + 0.36 * rnd01(R)) * (big ? 0.78 : 1), (0.05 + 0.22 * rnd01(R)) * (big ? 1.7 : 1), 0.5 + 0.5 * rnd01(R), rnd01(R) * TAU]);
    // the glass: a few tinkles, spread over the first moments
    this.gl = []; for (let k = 0; k < (big ? 11 : 6); k++) this.gl.push([0.015 + Math.pow(rnd01(R), 1.6) * (big ? 0.7 : 0.32), 2600 + 5200 * rnd01(R), 0.4 + 0.6 * rnd01(R)]);
    this.len = big ? 2.4 : 1.1;
  }
  tick(B, i, t) {
    const R = this.rn, big = this.big, n = R.next();
    this.ph += ((big ? 58 : 74) * (0.55 + 0.45 * exp(-t / 0.09))) / SR;
    const thump = sin(TAU * this.ph) * exp(-t / (big ? 0.34 : 0.17)) * Math.min(1, t / 0.0015) * (big ? 0.9 : 0.62);
    const crack = this.hp.hp(n) * exp(-t / (big ? 0.022 : 0.011)) * (big ? 0.8 : 0.65);
    if ((this.n & 511) === 0) this.gate = 0.25 + 0.75 * rnd01(R);                  // debris: the rattle comes in clumps
    const crumble = this.lp.lp(n) * exp(-t / (big ? 0.6 : 0.28)) * this.gate * (big ? 0.5 : 0.32);
    let metal = 0;
    for (const m of this.md) metal += sin(TAU * m[0] * t * (1 - 0.02 * Math.min(1, t / 0.15)) + m[3]) * m[2] * exp(-t / m[1]);
    metal *= Math.min(1, t / 0.002) * (big ? 0.075 : 0.06);
    let glass = 0;
    for (const g of this.gl) { const u = t - g[0]; if (u > 0 && u < 0.12) glass += sin(TAU * g[1] * u) * exp(-u / 0.028) * g[2]; }
    const y = (thump + crack + crumble + metal + glass * 0.07) * this.v * 0.62;
    B.sfxL[i] += y * this.l; B.sfxR[i] += y * this.r; B.rev[i] += (crack + metal + glass * 0.07) * this.v * 0.05;
    return t < this.len;
  }
}
class Scrape extends Voice { // metal dragged along metal: a sideswipe, the grappler's net, a cruiser slamming in. Sparks crackle in it.
  constructor(s, o, d = 0.42, v = 1, pan = 0) { super(s, o); this.d = d; this.v = v; this.l = panL(pan * 0.75); this.r = panR(pan * 0.75); this.rn = new RNG(s.seed()); this.f = new SVF(); this.g = new SVF(); this.g.set(5200, 1.2); this.ph = 0; this.sp = 0; this.ph2 = 0; }
  tick(B, i, t) {
    const R = this.rn, n = R.next(), d = this.d;
    if ((this.n & 31) === 0) this.f.set(1500 + 900 * Math.sin(t * 37) + 500 * R.next(), 4.5);
    if (R.next() > 0.9985) this.sp = 1;                                           // a spark
    this.sp *= 0.996;
    const env = Math.min(1, t / 0.006) * (t < d ? 1 - 0.35 * t / d : exp(-(t - d) / 0.05));
    this.ph += (2650 + 140 * Math.sin(t * 190)) / SR; this.ph2 += (88 * exp(-t / 0.05) + 40) / SR;
    const grind = this.f.bp(n) * 0.5 * (0.6 + 0.4 * Math.abs(Math.sin(t * 61))) + this.g.bp(n) * this.sp * 0.9;
    const squeal = sin(TAU * this.ph) * 0.05, hit = sin(TAU * this.ph2) * exp(-t / 0.06) * 0.5;
    const y = ((grind + squeal) * env + hit) * this.v * 0.55;
    B.sfxL[i] += y * this.l; B.sfxR[i] += y * this.r;
    return t < d + 0.3;
  }
}
class Gunfire extends Voice { // the helicopter's guns down one lane: a round every 1/22 s while the strike lasts, each a crack, a thud and a
  // little room; now and then a ricochet whines off the road
  constructor(s, o, d = 0.45, v = 1, pan = 0) {
    super(s, o); this.d = d; this.v = v; this.l = panL(pan * 0.8); this.r = panR(pan * 0.8);
    const R = this.rn = new RNG(s.seed()); this.hp = new SVF(); this.hp.set(2600, 0.7); this.bp = new SVF(); this.bp.set(620, 1.4);
    this.shots = []; for (let t = 0; t < d; t += 1 / 22) this.shots.push([t + 0.004 * R.next(), 0.75 + 0.25 * rnd01(R), rnd01(R) < 0.3 ? 0.03 + 0.06 * rnd01(R) : -1, 3400 + 1400 * rnd01(R)]);
  }
  tick(B, i, t) {
    const n = this.rn.next(); let c = 0, b = 0, w = 0, body = 0;
    for (const [t0, a, ric, rf] of this.shots) {
      const u = t - t0; if (u < 0) break;
      if (u < 0.06) { const e = exp(-u / 0.0035) * a; c += e; b += exp(-u / 0.03) * a; body += sin(TAU * (150 - 400 * u) * u) * exp(-u / 0.022) * a; }
      const ur = u - (ric > 0 ? ric : 99); if (ur > 0 && ur < 0.12) w += sin(TAU * (rf - 9000 * ur) * ur) * exp(-ur / 0.05) * 0.5;
    }
    const y = (this.hp.hp(n) * c * 0.9 + this.bp.bp(n) * b * 0.35 + body * 0.45 + w * 0.08) * this.v * 0.5;
    B.sfxL[i] += y * this.l; B.sfxR[i] += y * this.r; B.rev[i] += y * 0.12;
    return t < this.d + 0.25;
  }
}
class Shift extends Voice { // a gear change: the blow-off valve's hiss and the gearbox's clunk
  constructor(s, o) { super(s, o); this.rn = new RNG(s.seed()); this.hp = new SVF(); this.hp.set(2200, 0.8); this.lp = new SVF(); this.lp.set(6500, 0.7); this.ph = 0; }
  tick(B, i, t) {
    this.ph += 95 / SR;
    const y = this.lp.lp(this.hp.hp(this.rn.next())) * Math.min(1, t / 0.01) * exp(-t / 0.11) * 0.075 + sin(TAU * this.ph) * exp(-t / 0.03) * 0.22 * (t < 0.12 ? 1 : 0);
    B.sfxL[i] += y * 0.9; B.sfxR[i] += y;
    return t < 0.5;
  }
}
class Squeal extends Voice { // tape rewind / fast-forward chatter
  constructor(s, o, d, up) { super(s, o); this.d = d; this.up = up; this.p = [0, 0, 0]; this.r = new RNG(s.seed()); this.hp = new SVF(); this.hp.set(2500, 0.7); }
  tick(B, i, t) {
    const x = t / this.d, base = this.up ? 1800 + 2600 * x : 4200 - 1600 * x;
    let y = 0; [1, 1.5, 2.02].forEach((m, k) => { this.p[k] += base * m * (1 + 0.04 * sin(TAU * 31 * t + k)) / SR; y += sin(TAU * this.p[k]) / (k + 1); });
    const env = Math.min(1, t / 0.02) * (t < this.d - 0.05 ? 1 : Math.max(0, (this.d - t) / 0.05));
    y = (y * 0.05 + this.hp.hp(this.r.next()) * 0.06) * env;
    B.sfxL[i] += y; B.sfxR[i] += y;
    return t < this.d;
  }
}

// ── Effects ───────────────────────────────────────────────────────────────
class FDN {
  constructor(lens, rt60, dampHz, diff) {
    this.lines = lens.map((l) => { let s = 1; while (s < l + 2) s <<= 1; return { b: new Float32Array(s), m: s - 1, l, g: Math.pow(10, -3 * l / (SR * rt60)), z: 0 }; });
    this.w = 0; this.damp = 1 - exp(-TAU * dampHz / SR);
    this.ap = diff.map((l) => ({ b: new Float32Array(l), i: 0 }));
  }
  process(x) {
    for (const a of this.ap) { const d = a.b[a.i]; const v = x + 0.6 * d; a.b[a.i] = v; a.i = (a.i + 1) % a.b.length; x = d - 0.6 * v; }
    const L = this.lines, w = this.w;
    let sum = 0;
    const o0 = L[0].b[(w - L[0].l) & L[0].m], o1 = L[1].b[(w - L[1].l) & L[1].m], o2 = L[2].b[(w - L[2].l) & L[2].m], o3 = L[3].b[(w - L[3].l) & L[3].m];
    const o4 = L[4].b[(w - L[4].l) & L[4].m], o5 = L[5].b[(w - L[5].l) & L[5].m], o6 = L[6].b[(w - L[6].l) & L[6].m], o7 = L[7].b[(w - L[7].l) & L[7].m];
    sum = (o0 + o1 + o2 + o3 + o4 + o5 + o6 + o7) * 0.25;
    const os = [o0, o1, o2, o3, o4, o5, o6, o7];
    for (let k = 0; k < 8; k++) {
      const ln = L[k]; const v = os[k] - sum;
      ln.z += this.damp * (v - ln.z);
      ln.b[w & ln.m] = (k & 1 ? -x : x) + ln.z * ln.g;
    }
    this.w = w + 1;
    this.oL = o0 - o2 + o4 - o6; this.oR = o1 - o3 + o5 - o7;
  }
}
class PingPong {
  constructor(d, fb) { this.s = 1 << 16; this.m = this.s - 1; this.l = new Float32Array(this.s); this.r = new Float32Array(this.s); this.d = d; this.fb = fb; this.w = 0; this.zl = 0; this.zr = 0; this.hl = 0; }
  process(x) {
    const w = this.w, dl = this.l[(w - this.d) & this.m], dr = this.r[(w - this.d) & this.m];
    this.zl += 0.35 * (dr - this.zl); this.hl += 0.004 * (this.zl - this.hl);
    this.l[w & this.m] = x + (this.zl - this.hl) * this.fb;
    this.zr += 0.35 * (dl - this.zr);
    this.r[w & this.m] = this.zr * this.fb;
    this.w = w + 1; this.oL = dl; this.oR = dr;
  }
}
class Chorus {
  constructor() { this.s = 4096; this.m = 4095; this.l = new Float32Array(this.s); this.r = new Float32Array(this.s); this.w = 0; this.ph = 0; }
  process(xl, xr) {
    const w = this.w; this.l[w & this.m] = xl; this.r[w & this.m] = xr;
    this.ph += 0.45 / SR; if (this.ph > 1) this.ph -= 1;
    const tri = Math.abs(this.ph * 4 - 2) - 1;
    const rd = (b, del) => { const p = w - del, i = Math.floor(p), f = p - i; return b[i & this.m] * (1 - f) + b[(i + 1) & this.m] * f; };
    const dA = (0.0068 + 0.0024 * tri) * SR, dB = (0.0068 - 0.0024 * tri) * SR;
    this.oL = xl * 0.75 + rd(this.l, dA) * 0.6; this.oR = xr * 0.75 + rd(this.r, dB) * 0.6;
    this.w = w + 1;
  }
}
// Look-ahead true-peak limiter: 4× Lanczos intersample estimate, windowed minimum + box smoothing.
class Limiter {
  constructor(ceilDb) {
    this.ceil = Math.pow(10, ceilDb / 20); this.W = 64; this.D = this.W - 1 + 8;
    this.hl = new Float32Array(128); this.hr = new Float32Array(128); this.hi = 0;
    this.q = new Float64Array(this.W); this.qi = 0; this.dq = []; this.n = 0;
    this.box = new Float64Array(this.W); this.bi = 0; this.bsum = this.W; this.box.fill(1);
    this.hold = 1; this.rel = 1 - exp(-1 / (0.12 * SR)); this.gr = 0;
    const lz = (z) => (z === 0 ? 1 : Math.abs(z) >= 8 ? 0 : (8 * sin(Math.PI * z) * sin(Math.PI * z / 8)) / (Math.PI * Math.PI * z * z));
    this.c = [1, 2, 3].map((p) => { const t = 7 + p / 4; return Array.from({ length: 16 }, (_, j) => lz(t - j)); });
    this.dqv = new Float64Array(this.W + 8); this.dqi = new Int32Array(this.W + 8);
    this.head = 0; this.tail = 0;
  }
  process(xl, xr) {
    const hi = this.hi; this.hl[hi & 127] = xl; this.hr[hi & 127] = xr;
    // peak around samples (hi-4 .. hi-3)
    let p = Math.max(Math.abs(this.hl[(hi - 8) & 127]), Math.abs(this.hr[(hi - 8) & 127]), Math.abs(this.hl[(hi - 7) & 127]), Math.abs(this.hr[(hi - 7) & 127]));
    for (let k = 0; k < 3; k++) {
      const c = this.c[k]; let sl = 0, sr = 0;
      for (let j = 0; j < 16; j++) { const idx = (hi - 15 + j) & 127; sl += this.hl[idx] * c[j]; sr += this.hr[idx] * c[j]; }
      p = Math.max(p, Math.abs(sl), Math.abs(sr));
    }
    const gt = p > this.ceil ? this.ceil / p : 1;
    // sliding window minimum (monotonic deque, ring indices)
    const n = this.n++, cap = this.W + 8;
    while (this.tail > this.head && this.dqv[(this.tail - 1) % cap] >= gt) this.tail--;
    this.dqv[this.tail % cap] = gt; this.dqi[this.tail % cap] = n; this.tail++;
    while (this.dqi[this.head % cap] <= n - this.W) this.head++;
    const wmin = this.dqv[this.head % cap];
    this.hold = Math.min(wmin, this.hold + (1 - this.hold) * this.rel);
    this.bsum += this.hold - this.box[this.bi]; this.box[this.bi] = this.hold; this.bi = (this.bi + 1) % this.W;
    const g = Math.min(1, this.bsum / this.W);
    this.gr = Math.max(this.gr * 0.9999, 1 - g);
    this.hi = hi + 1;
    const di = (hi - this.D) & 127;
    this.g = g; this.oL = this.hl[di] * g; this.oR = this.hr[di] * g;
  }
}

// ── The engine ────────────────────────────────────────────────────────────
const BUS = ['L', 'R', 'rev', 'gate', 'dly', 'choL', 'choR', 'fxL', 'fxR', 'sfxL', 'sfxR'];

export class Synth {
  constructor() {
    this.tl = new Timeline();
    this.frame = 0;                 // samples rendered
    this.offset = 0;                // scene time of sample 0
    this.voices = [];
    this._seed = 1986;
    this.B = {}; for (const k of BUS) this.B[k] = new Float32Array(128);
    this.rev = new FDN([1381, 1601, 1867, 2053, 2287, 2551, 2797, 3089], 2.6, 6500, [225, 341, 441, 556]);
    this.grev = new FDN([557, 641, 733, 829, 919, 1013, 1103, 1201], 1.7, 7500, [113, 167, 229, 293]);
    this.pre = new Float32Array(2048); this.prei = 0;
    this.dly = new PingPong(18000, 0.42);
    this.cho = new Chorus();
    this.lim = new Limiter(MASTER.ceilingDbtp);
    this.lpL = new SVF(); this.lpR = new SVF(); this.lpC = 20000; this.lpOn = false;
    this.hpL = new SVF(); this.hpR = new SVF(); this.hpL.set(28, 0.6); this.hpR.set(28, 0.6);
    this.ring = [new Float32Array(1 << 17), new Float32Array(1 << 17)];
    this.gateUntil = -1; this.gateEnv = 0;
    this.duckUntil = -1; this.duckDepth = 0; this.duckE = 0;
    this.abG = 0; this.abL = new SVF(); this.abR = new SVF(); this.abN = [new RNG(501), new RNG(502)]; this.abP = 0;   // the afterburner of a nitro burst
    this.hbG = 0;                                                                                                      // the heartbeat on the last life
    this.comp = 0;
    this.fired = new Set();
    this.arpPan = 0;
    this.p = { bassCut: 600, bassDrive: 1.3, padCut: 2000, padMul: 1, arpCut: 3600, kickMul: 1, hatMul: 1 };
    // ambience
    this.sirG = 0; this.sirP = 0; this.sirW = 0;   // police siren: level, oscillator phase, wail phase
    this.heliG = 0; this.heliP = 0; this.heliF = new SVF(); this.heliR = new RNG(91);   // helicopter rotor: level, blade phase, noise
    this.eng = [new Saw(0), new Saw(0.5), new Saw(0.25)]; this.engF = 60; this.engLp = new SVF(); this.windL = new SVF(); this.windR = new SVF(); this.wr = [new RNG(77), new RNG(78)];
    this.levels = { music: 0, peak: 0 };
    this.smp = {};
  }
  setSample(name, L, R) { this.smp[name] = { L, R: R || L }; }
  seed() { this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0; return this._seed; }
  // the music steps back under a big hit: down by `depth` (0..1) within 8 ms, held for `hold` s, back over 0.35 s
  duck(o, depth, hold) { const u = this.frame + o + Math.round(hold * SR); if (u > this.duckUntil || depth > this.duckDepth) { this.duckUntil = Math.max(this.duckUntil, u); this.duckDepth = Math.max(this.frame + o < this.duckUntil ? this.duckDepth : 0, depth); } }
  openGate(o, dur) { this.gateUntil = Math.max(this.gateUntil, this.frame + o + Math.round(dur * SR)); }
  event(e) { this.tl.add(e.type, e.t, e); }

  trigger(n, o) {
    const s = this; let v;
    const S = this.smp;
    const play = (name, opt) => { this.voices.push(new Smp(s, o, S[name], opt)); };
    switch (n.i) {
      case 'kick': if (S.kick909) { play('kick909', { gain: 0.78 * n.v * this.p.kickMul, rev: 0.02 }); return; } break;
      case 'snare': if (S.gated_snare) {
        if (n.fill && S.dx_snare3) play('dx_snare3', { gain: 0.5 * n.v, gate: 0.35, rev: 0.05, pan: 0.1 });
        else play('gated_snare', { gain: 0.62 * n.v, rev: 0.06 });
        return; } break;
      case 'clap': if (S.clap808) { play('clap808', { gain: 0.42 * n.v, pan: -0.15, gate: 0.25, rev: 0.05 }); return; } break;
      case 'hat': if (S.hat909_c2) { play(n.open ? 'hat909_o4' : 'hat909_c2', { gain: (n.open ? 0.26 : 0.3) * n.v * this.p.hatMul, pan: 0.28, rev: 0.02 }); return; } break;
      case 'crash': if (S.crash_f) { play('crash_f', { gain: 0.42 * n.v, rev: 0.06 }); return; } break;
      case 'revcrash': if (S.revcrash) { const d = Math.min(n.d, REVCRASH_PEAK); play('revcrash', { gain: 0.36 * (n.v ?? 0.8), start: REVCRASH_PEAK - d, cut: d, bus: 'fx', rev: 0.05 }); return; } break;
      case 'tom': if (S.sim_tom1) { play('sim_tom1', { gain: 0.62 * n.v, rate: Math.pow(2, (n.n - 45) / 12), pan: Math.max(-0.6, Math.min(0.6, (n.n - 45) / -12)), gate: 0.4, rev: 0.06 }); return; } break;
    }
    switch (n.i) {
      case 'kick': v = new Kick(s, o, n.v); break;
      case 'snare': v = new Snare(s, o, n.v, n.fill); break;
      case 'clap': v = new Clap(s, o, n.v); break;
      case 'hat': v = new Hat(s, o, n.v, n.open); break;
      case 'crash': v = new Crash(s, o, n.v); break;
      case 'revcrash': v = new Crash(s, o, n.v ?? 0.8, 1, n.d); break;
      case 'tom': v = new Tom(s, o, n.n, n.v); break;
      case 'sub': v = new Sub(s, o, n.v); break;
      case 'impact': v = new Impact(s, o, n.v); break;
      case 'riser': v = new Riser(s, o, n.d, n.v ?? 1); break;
      case 'whoosh': v = new Whoosh(s, o, n.v ?? 1); break;
      case 'bass': v = new Bass(s, o, n.n, n.v, n.d); break;
      case 'pad': v = new Pad(s, o, n.notes, n.d, n.v, n.slow); break;
      case 'stab': v = new Stab(s, o, n.notes, n.d, n.v); break;
      case 'lead': v = new Lead(s, o, n.n, n.d, n.v); break;
      case 'arp': v = new Arp(s, o, n.n, n.d, n.v, (this.arpPan++ & 1) ? 0.5 : -0.5); break;
      case 'pluck': v = new Pluck(s, o, n.n, n.v); break;
      case 'bell': v = new Bell(s, o, n.n, n.v); break;
      case 'tape': v = new Tape(s, o); break;
      case 'vhs': v = new Vhs(s, o, n.d); break;
      case 'buzz': v = new Buzz(s, o, n.d); break;
      case 'pop': v = new Blip(s, o, 1150, 380, 0.05, 0.16, 0.3); this.voices.push(new Blip(s, o, 1700, 900, 0.03, 0.07, 0.4, 0.06)); break;
      case 'click': v = new Click(s, o, 0.55); break;
      case 'clunk': v = new Click(s, o, 0.8, 1); break;
      case 'tick': v = new Blip(s, o, 3200, 2600, 0.006, 0.08); break;
      case 'chime': v = new Blip(s, o, 1320, 1318.5, 0.25, 0.06, -0.2); this.voices.push(new Blip(s, o, 1980, 1975.5, 0.3, 0.05, 0.2, 0.09)); break;
      case 'select': v = new Click(s, o, 0.6, 1); this.voices.push(new Blip(s, o, 880, 520, 0.06, 0.06, 0, 0.05)); break;
      case 'rewind': v = new Squeal(s, o, n.d ?? 0.6, false); break;
      case 'rewindlong': v = new Squeal(s, o, 1.25, false); break;
      // game
      case 'passL': v = new Pass(s, o, -1, 0); break;
      case 'passR': v = new Pass(s, o, 1, 0); break;
      case 'passBL': v = new Pass(s, o, -1, 1); break;
      case 'passBR': v = new Pass(s, o, 1, 1); break;
      case 'skid': v = new Skid(s, o); break;
      case 'dodge': return;
      case 'pickup': v = new Riser(s, o, 0.2, 0.4); this.voices.push(new Blip(s, o, 1320, 1318.5, 0.25, 0.05, -0.2, 0.2), new Blip(s, o, 1980, 1975.5, 0.3, 0.045, 0.2, 0.26)); break;   // a nitro canister: it charges, then rings
      case 'horn': v = new Horn(s, o); break;
      case 'yelp': v = new Blip(s, o, 1250, 900, 0.09, 0.05, 0.5); for (let k = 1; k < 8; k++) this.voices.push(new Blip(s, o, k % 2 ? 900 : 1250, k % 2 ? 1250 : 900, 0.09, 0.05, k % 2 ? -0.5 : 0.5, k * 0.13)); break;   // the interceptor's siren: a fast yelp
      case 'alert': v = new Blip(s, o, 392, 388, 0.13, 0.08); this.voices.push(new Blip(s, o, 392, 388, 0.13, 0.08, 0, 0.2), new Blip(s, o, 523, 518, 0.3, 0.085, 0, 0.4), new Blip(s, o, 196, 194, 0.5, 0.07, 0, 0.4), new Sub(s, o, 0.4)); if (S.crash_f) play('crash_f', { gain: 0.26, rev: 0.08 }); this.duck(o, 0.2, 0.15); break;   // the threat level rises: three tones, a low boom, a cymbal   // the threat level rises
      case 'near': v = new Whoosh(s, o, 0.45); this.voices.push(new Blip(s, o, 880, 1320, 0.07, 0.07, -0.2), new Blip(s, o, 1320, 1980, 0.07, 0.06, 0.2, 0.07)); break;
      case 'smash': v = new Crunch(s, o, n.v ?? 0.9, n.pan || 0, 0); this.duck(o, 0.32, 0.12); break;                    // a vehicle rammed in a nitro burst
      case 'swipe': v = new Scrape(s, o, 0.36, 1, n.pan || 0); this.voices.push(new Click(s, o, 0.9, 1)); this.duck(o, 0.25, 0.1); break;
      case 'crashfx': v = new Crunch(s, o, 1.25, 0, 1); this.voices.push(new Impact(s, o, 0.9), new Squeal(s, o, 0.5, false)); this.duck(o, 0.6, 0.35); break;   // the run ends against a vehicle
      case 'wreck': v = new Crunch(s, o, 1.1, n.pan || 0, 1); this.voices.push(new Sub(s, o, 0.45)); this.duck(o, 0.5, 0.22); break;   // ploughed through one: a life gone
      case 'bust': v = new Blip(s, o, 620, 610, 0.16, 0.09); this.voices.push(new Blip(s, o, 470, 465, 0.16, 0.09, 0, 0.18), new Blip(s, o, 310, 300, 0.4, 0.1, 0, 0.36)); break;
      case 'gear': v = new Shift(s, o); break;
      case 'siren': v = new Blip(s, o, 780, 1040, 0.16, 0.05, -0.4); this.voices.push(new Blip(s, o, 1040, 780, 0.16, 0.05, 0.4, 0.26), new Blip(s, o, 780, 1040, 0.16, 0.05, -0.4, 0.52), new Blip(s, o, 1040, 780, 0.2, 0.05, 0.4, 0.78)); break;
      case 'lock': return;                                                       // (attack warnings are silent: the picture carries them)
      case 'zap': v = new Blip(s, o, 2600, 180, 0.12, 0.1); this.voices.push(new Click(s, o, 0.8)); break;
      case 'burst': v = new Gunfire(s, o, n.d || 0.45, 1, n.pan || 0); this.duck(o, 0.22, n.d || 0.45); break;   // the helicopter opens fire down a lane
      case 'hook': v = new Scrape(s, o, 0.9, 0.8, 0); this.voices.push(new Click(s, o, 1.2, 1), new Blip(s, o, 210, 70, 0.3, 0.13, 0, 0.05)); this.duck(o, 0.3, 0.2); break;   // the grappler net bites
      case 'ffwd': v = new Squeal(s, o, n.d ?? 0.4, true); break;
      default: return;
    }
    this.voices.push(v);
  }

  // Sample index (relative to this.frame origin) of scene time t.
  _sx(t) { return (t - this.offset) * SR; }

  _schedule(N, ph) {
    const f0 = this.frame, f1 = f0 + N, tl = this.tl, d = tl._derive();
    const st = this._st;
    const w = this._w;
    // Sequencer — integer sample grid per clock anchor.
    const runClock = (anchor, kmin, kmax, fn) => {
      const a = this._sx(anchor);
      let k = Math.max(kmin, Math.ceil((f0 - a) / TICK_S));
      for (; k < kmax; k++) {
        const x = a + k * TICK_S; if (x >= f1) break; if (x < f0) continue;
        const o = Math.min(N - 1, Math.max(0, Math.round(x - f0)));
        const bar = Math.floor(k / TPB), tk = k - bar * TPB;
        fn(bar, (t, note) => { if (Math.floor(t) === tk) this.trigger(note, o); });
      }
    };
    const segs = d.segs;
    for (let si = Math.max(0, segs.length - 2); si < segs.length; si++) {
      const sg = segs[si];
      const ignTicks = Math.round((sg.end - sg.s) / TICK);
      runClock(sg.s, 0, Math.min(160, ignTicks), (bar, emit) => ignitionBar(bar, emit));
      if (sg.C < sg.until) {
        const maxK = sg.until === Infinity ? 1e12 : Math.round((sg.until - sg.C) / TICK);
        runClock(sg.C, 0, maxK, (bar, emit) => cruiseBar(bar, Math.floor(bar / 32), emit, { thr: st.thr, w, heat: ph.phase === 'cruise' && st.run > 0 && st.g && !st.g.free && !st.over ? st.g.star : 0, edge: ph.phase === 'cruise' && st.g && !st.g.free && st.g.lives < 2 && !st.over ? 1 : 0 }));
      }
      // automatic transport SFX
      if (sg.rew !== null) this._once('rew' + si, sg.rew, f0, f1, (o) => this.trigger({ i: 'rewind', d: 0.6 }, o));
      if (sg.skip !== null) this._once('ff' + si, sg.skip, f0, f1, (o) => { this.trigger({ i: 'ffwd', d: 0.4 }, o); });
      if (sg.skip !== null) this._once('ffc' + si, sg.C, f0, f1, (o) => this.trigger({ i: 'crash', v: 0.8 }, o));
    }
    // Nitro: a short riser from the press, the stinger at the quantised impact (bursts are accepted by the simulation).
    for (const tb of tl.nitros(this.offset + f1 / SR)) {
      this._once('ta' + tb.p, tb.p, f0, f1, (o) => { const dd = tb.I - tb.p; this.trigger({ i: 'riser', d: dd, v: 0.9 }, o); this.trigger({ i: 'revcrash', d: dd, v: 0.9 }, o); });
      if (tb.until > tb.I) this._once('ti' + tb.p, tb.I, f0, f1, (o) => {
        const pi = tl.phaseAt(tb.I);
        const bar = pi.phase === 'cruise' ? Math.floor((tb.I - pi.seg.C + 1e-6) / BAR) : 0;
        turboNotes(cruiseChord(bar), (dt, note) => this.trigger(note, o));
      });
    }
    // UI / interaction sound effects
    for (const e of tl.events) {
      if (e.type !== 'sfx') continue;
      if (this._sx(e.t) >= f1) break;
      this._once('s' + e.seq, e.t, f0, f1, (o) => this.trigger({ ...(e.p || {}), i: e.name }, o));
    }
  }
  _once(key, t, f0, f1, fn) {
    if (this.fired.has(key)) return;
    const x = this._sx(t);
    if (x >= f1) return;
    if (x < f0 - 0.3 * SR) { this.fired.add(key); return; }   // too late: drop silently
    this.fired.add(key);
    fn(Math.min(f1 - f0 - 1, Math.max(0, Math.round(x - f0))));
  }

  _params(T, ph) {
    const st = this._st, w = this._w, p = this.p;
    let bc = 760 * (1 + 2.6 * st.thr);
    if (ph.phase === 'ign') {
      const it = ph.it;
      if (it < 4) bc = 260 + 900 * Math.min(1, Math.max(0, (it - 1) / 3));
      else if (it < 6) bc = 1160 - 820 * Math.min(1, (it - 4) / 1.5);
      else bc = 760 + 1100 * exp(-(it - 6) / 0.6);
    }
    p.bassCut = bc * (1 - 0.25 * w[1]) * (1 + 0.2 * w[3]);
    p.bassDrive = 1.3 + 2.4 * w[2] + 0.6 * st.thr;
    p.padCut = (2900 + 1600 * st.thr) * (1 - 0.45 * w[2]) * (1 + 0.25 * w[1] + 0.3 * w[3]);
    p.padMul = 1 + 0.25 * w[1];
    p.arpCut = 3000 + 3000 * st.thr;
    p.kickMul = 1 + 0.2 * w[2];
    p.hatMul = 1;
    // master low-pass: turbo anticipation sweep, transport transitions
    let lp = 20000;
    const tb = this.tl.turboAt(T);
    if (tb && T < tb.I) lp = 20000 * Math.pow(350 / 20000, Math.pow(Math.min(1, tb.a / tb.antic), 1.4));
    if (ph.phase === 'rewind') lp = 900;
    if (ph.phase === 'cruise' && (st.over || st.paused || T < st.hold)) lp = Math.min(lp, T < st.hold ? 900 : 1100);
    if (ph.phase === 'ff') lp = 2200;
    if (ph.phase === 'cruise' && st.run > 0 && st.g && !st.g.free && st.g.lives < 2 && !st.over) lp = Math.min(lp, 2600);   // the last life: the music goes muffled under the heartbeat
    this._lpT = lp;
    // trims
    const ign = MASTER.ignTrimDb, cru = MASTER.cruiseTrimDb;
    let trim = cru;
    if (ph.phase === 'ign') trim = ph.it < 8 ? ign : ign + (cru - ign) * ((ph.it - 8) / 2);
    this._trim = Math.pow(10, trim / 20);
  }

  process(outL, outR, N) {
    const T = this.offset + this.frame / SR;
    const tl = this.tl;
    const ph = tl.phaseAt(T);
    this._st = tl.stateAt(T);
    this._w = tl.envWeights(T);
    this._params(T, ph);
    this._schedule(N, ph);
    const B = this.B;
    for (const k of BUS) B[k].fill(0, 0, N);
    // voices
    const vs = this.voices;
    for (let j = vs.length - 1; j >= 0; j--) if (!vs[j].run(B, N)) vs.splice(j, 1);
    // music transport
    const mus = tl.musicAt(T);
    const active = ph.phase !== 'idle' && ph.phase !== 'home';
    // ambience (engine + wind), follows speed
    const vel = Math.abs(this._st.vel), thr = this._st.thr;
    const ambG = active ? 1 : 0;
    // On a run the engine works through its gears: its note climbs with the revs and falls back at each change (a short glide, so
    // the change is heard as one), and it is louder and brighter the harder it is working.
    let ef = 46 + vel * 0.42, eg = 0.016 * (0.5 + thr) * ambG, ec = 140 + vel * 2.2;
    if (ph.phase === 'cruise' && this._st.run > 0 && !this._st.over) {
      const rv = Math.max(-0.25, Math.min(1.15, revs(this._st.g, vel)));
      this.engF += (50 * (1 + 1.1 * rv) - this.engF) * (1 - exp(-(N / SR) / 0.06));
      ef = this.engF; eg = (0.019 + 0.013 * Math.max(0, rv)) * (0.45 + 0.55 * thr); ec = 170 + vel * 1.5 + 520 * Math.max(0, rv) * thr;
    } else this.engF = ef;
    this.engLp.set(ec, 0.9);
    this.windL.set(250 + vel * 22, 0.7); this.windR.set(280 + vel * 24, 0.7);
    const wg = 0.0009 * Math.pow(vel, 1.1) * ambG, whF = 700 + vel * 8, whG = ph.phase === 'cruise' ? 0.007 * Math.pow(Math.min(1.3, vel / 230), 2.5) * ambG : 0;   // and at speed a turbo whine
    // the police siren, behind us for the whole run: distant while they hang back, loud and fast when they are on the tail
    {
      const st = this._st, g = st.g, run = ph.phase === 'cruise' && st.run > 0 && !g.free && !st.paused && T >= st.hold && st.over !== 1;
      const close = run && (st.over === 2 || policeClose(g));
      const tgt = !run ? 0 : close ? 0.034 : 0.006 + 0.003 * Math.min(4, g.star), rate = close ? 3.1 : 0.62;
      if (tgt > 0 || this.sirG > 1e-5) {
        const kA = 1 - exp(-1 / (0.25 * SR));
        for (let i = 0; i < N; i++) {
          this.sirG += (tgt - this.sirG) * kA;
          this.sirW += rate / SR; if (this.sirW >= 1) this.sirW -= 1;
          const wail = this.sirW < 0.5 ? this.sirW * 2 : 2 - this.sirW * 2;                     // triangle 0..1
          this.sirP += (640 + 520 * wail * wail * (3 - 2 * wail)) / SR; if (this.sirP >= 1) this.sirP -= 1;
          const a = this.sirP * TAU, y = (Math.sin(a) + 0.35 * Math.sin(2 * a) + 0.12 * Math.sin(3 * a)) * this.sirG;
          B.sfxL[i] += y * 0.8; B.sfxR[i] += y;
        }
      }
    }
    // the helicopter at three stars: rotor chop (noise through a low filter, pulsed at the blade rate)
    {
      const st = this._st, g = st.g, on = ph.phase === 'cruise' && st.run > 0 && !g.free && !st.paused && T >= st.hold && !st.over && g.ha > 0.02;
      const tgt = on ? (0.05 + 0.03 * g.sk) * g.ha : 0;       // louder as it comes in, gone when it has flown off
      if (tgt > 0 || this.heliG > 1e-5) {
        const kA = 1 - exp(-1 / (0.6 * SR)); this.heliF.set(190, 0.8);
        for (let i = 0; i < N; i++) {
          this.heliG += (tgt - this.heliG) * kA;
          this.heliP += 11.5 / SR; if (this.heliP >= 1) this.heliP -= 1;
          const env = Math.pow(0.5 + 0.5 * Math.cos(this.heliP * TAU), 4), y = this.heliF.lp(this.heliR.next()) * (0.25 + env) * this.heliG;
          B.sfxL[i] += y; B.sfxR[i] += y * 0.85;
        }
      }
    }
    // a nitro burst roars: a jet of filtered noise and a low rumble, following the boost
    {
      const tb = ph.phase === 'cruise' ? tl.turboAt(T) : null, k = tb ? Math.max(0, Math.min(1, (tl.turboMul(T) - 1) / GAME.nitroBoost)) : 0;
      if (k > 0 || this.abG > 1e-5) {
        const kA = 1 - exp(-1 / (0.04 * SR)), kR = 1 - exp(-1 / (0.35 * SR)); this.abL.set(260 + 1500 * k, 0.9); this.abR.set(300 + 1600 * k, 0.9);
        for (let i = 0; i < N; i++) {
          this.abG += (k - this.abG) * (k > this.abG ? kA : kR);
          this.abP += (38 + 22 * this.abG) / SR; if (this.abP >= 1) this.abP -= 1;
          const g = this.abG, rum = Math.sin(this.abP * TAU) * 0.5, cr = Math.abs(this.abN[0].next()) > 0.997 ? 0.6 : 0;   // (and it crackles)
          B.sfxL[i] += (this.abL.lp(this.abN[0].next()) * 0.55 + rum + cr * 0.3) * g * 0.16; B.sfxR[i] += (this.abR.lp(this.abN[1].next()) * 0.55 + rum + cr * 0.3) * g * 0.16;
        }
      }
    }
    // the last life: a heartbeat on every beat of the music, lub-dub, low and close
    {
      const st = this._st, g = st.g, on = ph.phase === 'cruise' && st.run > 0 && !g.free && !st.paused && T >= st.hold && !st.over && g.lives < 2 ? 1 : 0;
      if (on || this.hbG > 1e-5) {
        const kA = 1 - exp(-1 / (0.3 * SR)), c0 = T - ph.seg.C;
        for (let i = 0; i < N; i++) {
          this.hbG += (on - this.hbG) * kA;
          const u = ((c0 + i / SR) % BEAT + BEAT) % BEAT, th = (x) => (x > 0 ? (Math.sin(TAU * 54 * x) + 0.35 * Math.sin(TAU * 108 * x) * exp(-x / 0.025)) * exp(-x / 0.075) * Math.min(1, x / 0.004) : 0);
          const y = (th(u) + 0.65 * th(u - 0.17)) * 0.26 * this.hbG;
          B.sfxL[i] += y; B.sfxR[i] += y;
        }
      }
    }
    const lpOn = this._lpT < 19000 || this.lpC < 19000;
    const ring = this.ring, rm = (1 << 17) - 1;
    const gA = 1 - exp(-1 / (0.0005 * SR)), gR = 1 - exp(-1 / (0.02 * SR));
    let sumsq = 0;
    for (let i = 0; i < N; i++) {
      const gf = this.frame + i;
      // effects
      this.pre[this.prei & 2047] = B.rev[i];
      this.rev.process(this.pre[(this.prei - 960) & 2047]); this.prei++;
      this.grev.process(B.gate[i]);
      const gt = gf < this.gateUntil ? 1 : 0;
      this.gateEnv += (gt - this.gateEnv) * (gt > this.gateEnv ? gA : gR);
      this.dly.process(B.dly[i]);
      this.cho.process(B.choL[i], B.choR[i]);
      let mL = B.L[i] + this.cho.oL + this.rev.oL * 0.32 + this.grev.oL * 0.42 * this.gateEnv + this.dly.oL * 0.55;
      let mR = B.R[i] + this.cho.oR + this.rev.oR * 0.32 + this.grev.oR * 0.42 * this.gateEnv + this.dly.oR * 0.55;
      // master LPF (log-smoothed cutoff)
      if (lpOn) {
        if ((i & 15) === 0) { this.lpC = Math.exp(Math.log(this.lpC) + (Math.log(this._lpT) - Math.log(this.lpC)) * 0.25); this.lpL.set(this.lpC, 1.05); this.lpR.set(this.lpC, 1.05); }
        const fl = this.lpL.lp(mL), fr = this.lpR.lp(mR);
        if (this.lpC < 19000) { mL = fl; mR = fr; }
      }
      // tape-stop on music pause (varispeed read from a ring buffer)
      ring[0][gf & rm] = mL; ring[1][gf & rm] = mR;
      if (!mus.on) {
        const s = mus.since + i / SR;
        if (s >= 0.5) { mL = 0; mR = 0; }
        else {
          const lag = SR * (s * s); // read pos = start + SR*(s - s^2) → lag grows as s^2
          const rp = gf - lag, ri = Math.floor(rp), fr = rp - ri;
          const g = 1 - (s / 0.5) * (s / 0.5);
          mL = (ring[0][ri & rm] * (1 - fr) + ring[0][(ri + 1) & rm] * fr) * g;
          mR = (ring[1][ri & rm] * (1 - fr) + ring[1][(ri + 1) & rm] * fr) * g;
        }
      } else if (mus.since + i / SR < 0.15) { const g = (mus.since + i / SR) / 0.15; mL *= g; mR *= g; }
      // ambience
      this.whP = (this.whP || 0) + whF / SR; if (this.whP >= 1) this.whP -= 1;
      const eo = Math.sin(this.whP * TAU) * whG + this.engLp.lp(this.eng[0].run(ef) + this.eng[1].run(ef * 1.01) + this.eng[2].run(ef * 0.5) * 0.7) * eg;
      const wl = this.windL.bp(this.wr[0].next()) * wg, wr = this.windR.bp(this.wr[1].next()) * wg;
      // the music ducks under a big hit
      { const tg = gf < this.duckUntil ? this.duckDepth : 0; this.duckE += (tg - this.duckE) * (tg > this.duckE ? 0.0026 : 0.00006); if (gf >= this.duckUntil && this.duckE < 1e-4) this.duckDepth = 0; const dg = 1 - this.duckE; mL *= dg; mR *= dg; }
      let xL = this.hpL.hp(mL + B.fxL[i] + eo + wl), xR = this.hpR.hp(mR + B.fxR[i] + eo + wr);
      // glue compressor (stereo linked, gentle)
      const pk = Math.max(Math.abs(xL), Math.abs(xR));
      const lv = 20 * Math.log10(pk + 1e-9), over = lv + 9;
      let gr = over <= -3 ? 0 : over >= 3 ? over * 0.55 : 0.55 * (over + 3) * (over + 3) / 12;
      this.comp += (gr - this.comp) * (gr > this.comp ? 0.0045 : 0.00012);
      const cg = Math.pow(10, -this.comp / 20) * this._trim;
      xL *= cg; xR *= cg;
      sumsq += xL * xL + xR * xR;
      xL += B.sfxL[i]; xR += B.sfxR[i];
      this.lim.process(xL, xR);
      outL[i] = this.lim.oL; outR[i] = this.lim.oR;
    }
    this.levels.music = Math.sqrt(sumsq / (2 * N));
    this.frame += N;
  }
}
