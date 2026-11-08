// ─────────────────────────────────────────────────────────────────────────────
// Master timeline: a timestamped event log + a fixed-step (240 Hz) simulation.
// Everything visible or audible is a pure function of (scene time T, events).
// The same class runs on the main thread, inside the AudioWorklet and in Node.
// ─────────────────────────────────────────────────────────────────────────────
import { IGNITION, SKIP_FF, REWIND, BEAT, TURBO, ENV_XFADE, THROTTLE, AUTO_ENV } from './cue.js';
import { smooth, easeInOutCubic, lerp } from './util.js';

export const SIM_HZ = 240;
export const DT = 1 / SIM_HZ;

const freshState = () => ({ pos: 0, vel: 5.5, thrOn: 0, thrA: 0, thr: 0, steerIn: 0, steer: 0, steerV: 0, cur: 0, autoOn: 1, autoT0: 0, autoPos0: 0 });
const copy = (s) => ({ ...s });

export function ignitionSpeed(it) {
  if (it < 0.5) return 2;
  if (it < 1) return lerp(2, 8, (it - 0.5) / 0.5);
  if (it < 4) return 8 + 30 * smooth((it - 1) / 3);
  if (it < 6) return lerp(38, 17, easeInOutCubic((it - 4) / 1.9));
  return 24 + 22 * Math.exp(-(it - 6) / 0.55);
}

export class Timeline {
  constructor() {
    this.events = [];
    this.seq = 0;
    this._autoSw = [];
    this._invalidate(-Infinity);
  }

  // ── event log ────────────────────────────────────────────────────────────
  add(type, t, data = {}) {
    const ev = { type, t, seq: this.seq++, ...data };
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].t > t) i--;
    this.events.splice(i, 0, ev);
    this._derived = null;
    // Events take effect at the first simulation step that starts at or after t,
    // so only events older than the last completed step force a re-simulation.
    if (t <= this._T - DT + 1e-12) this._invalidate(t);
    return ev;
  }
  load(list) { for (const e of list) this.add(e.type, e.t, e); }
  serialize() { return this.events.map(({ seq, ...e }) => e); }
  frontier() { return this._T; }

  _invalidate(t) {
    this._derived = null;
    if (!this._ck || t === -Infinity) {
      this._ck = [{ T: 0, st: freshState(), ei: 0 }];
    } else {
      while (this._ck.length > 1 && this._ck[this._ck.length - 1].T >= t) this._ck.pop();
    }
    const c = this._ck[this._ck.length - 1];
    this._T = c.T; this._st = copy(c.st); this._prev = copy(c.st); this._ei = c.ei; this._n = 0;
    this._autoSw = (this._autoSw || []).filter((a) => a.t < c.T);
  }

  // ── derived structure (segments, turbos, env changes) ─────────────────────
  _derive() {
    if (this._derived) return this._derived;
    const segs = [], turbos = [], envs = [], music = [], wins = [], autos = [];
    const phaseIn = (T) => phaseFrom(segs, T);
    let lastTurbo = -Infinity;
    for (const e of this.events) {
      const cur = segs[segs.length - 1];
      switch (e.type) {
        case 'start':
          if (!segs.length) segs.push({ rew: null, s: e.t, end: e.t + IGNITION, C: e.t + IGNITION, skip: null, until: Infinity });
          break;
        case 'replay':
          if (cur && e.t >= cur.C) {
            cur.until = e.t;
            const s = e.t + REWIND;
            segs.push({ rew: e.t, s, end: s + IGNITION, C: s + IGNITION, skip: null, until: Infinity });
          }
          break;
        case 'skip':
          if (cur && e.t >= cur.s && e.t < cur.end && cur.skip === null) { cur.skip = e.t; cur.end = e.t; cur.C = e.t + SKIP_FF; }
          break;
        case 'turbo': {
          const ph = phaseIn(e.t);
          if (ph.phase === 'cruise' && e.t >= lastTurbo + TURBO.cooldown) {
            const C = ph.seg.C;
            const I = C + Math.ceil((e.t + TURBO.minAntic - C) / BEAT - 1e-9) * BEAT;
            turbos.push({ p: e.t, I, seg: ph.seg });
            lastTurbo = e.t;
          }
          break;
        }
        case 'env': if (segs.length) envs.push(e); break;
        case 'music': music.push(e); break;
        case 'win': wins.push(e); break;
        case 'auto': autos.push(e); break;
      }
    }
    this._derived = { segs, turbos, envs, music, wins, autos };
    return this._derived;
  }

  phaseAt(T) { return phaseFrom(this._derive().segs, T); }

  // Turbo envelope (null when inactive). a: since press, u: since impact.
  turboAt(T) {
    const { turbos } = this._derive();
    for (let i = turbos.length - 1; i >= 0; i--) {
      const tb = turbos[i];
      if (tb.p > T) continue;
      if (T - tb.p >= TURBO.cooldown || T >= tb.seg.until) return null;
      return { p: tb.p, I: tb.I, a: T - tb.p, u: T - tb.I, antic: tb.I - tb.p };
    }
    return null;
  }
  lastTurbo(T) {
    const { turbos } = this._derive();
    for (let i = turbos.length - 1; i >= 0; i--) if (turbos[i].p <= T) return turbos[i];
    return null;
  }
  turboReady(T) {
    const ph = this.phaseAt(T);
    if (ph.phase !== 'cruise') return 0;
    const lt = this.lastTurbo(T);
    return lt ? Math.min(1, (T - lt.p) / TURBO.cooldown) : 1;
  }
  turboMul(T) {
    const tb = this.turboAt(T);
    if (!tb) return 1;
    if (T < tb.I) return 1 - 0.18 * smooth(tb.a / tb.antic);
    const u = T - tb.I;
    if (u < TURBO.sustain) return 1 + 2.7 * (1 - Math.exp(-u / 0.1));
    return 1 + 2.7 * (1 - easeInOutCubic((u - TURBO.sustain) / TURBO.recover));
  }

  // All environment changes up to T: the visitor's choices plus automatic switches derived by the simulation.
  envChanges(T) {
    if (this._T < T) this.stateAt(T);
    const man = this._derive().envs, auto = this._autoSw;
    if (!auto.length) return man;
    return man.concat(auto).sort((a, b) => a.t - b.t);
  }
  // Environment preset weights [4], blended over ENV_XFADE seconds.
  envWeights(T) {
    const envs = this.envChanges(T);
    let from = [1, 0, 0, 0], to = 0, t0 = -1e9;
    const mix = (f, idx, k) => f.map((v, i) => lerp(v, i === idx ? 1 : 0, k));
    for (const e of envs) {
      if (e.t > T) break;
      const k = smooth((e.t - t0) / ENV_XFADE);
      from = mix(from, to, k); to = e.preset; t0 = e.t;
    }
    return mix(from, to, smooth((T - t0) / ENV_XFADE));
  }
  envTarget(T) { let p = 0; for (const e of this.envChanges(T)) if (e.t <= T) p = e.preset; return p; }
  lastEnvChange(T) { let l = null; for (const e of this.envChanges(T)) if (e.t <= T) l = e; return l; }
  autoOn(T) { let on = true; for (const e of this._derive().autos) { if (e.t > T) break; on = !!e.on; } return on; }
  // progress (0..1) towards the next automatic change, for the deck display
  autoProgress(T) {
    const st = this.stateAt(T);
    if (!st.autoOn) return 0;
    return Math.max(Math.min(1, (T - st.autoT0) / AUTO_ENV.time), Math.min(1, (st.pos - st.autoPos0) / AUTO_ENV.dist));
  }

  // Music transport: { on, since }
  musicAt(T) {
    const { music } = this._derive();
    let on = true, since = -1e9;
    for (const e of music) { if (e.t > T) break; on = e.on; since = e.t; }
    return { on, since: T - since };
  }

  // ── fixed-step simulation ────────────────────────────────────────────────
  baseSpeed(ph) {
    switch (ph.phase) {
      case 'idle': return 5.5;
      case 'rewind': return -70;
      case 'ff': return 95;
      case 'ign': return ignitionSpeed(ph.it);
      default: return 24;
    }
  }
  _step() {
    const T = this._T, st = this._st, ev = this.events;
    while (this._ei < ev.length && ev[this._ei].t <= T) {
      const e = ev[this._ei++];
      if (e.type === 'thr') st.thrOn = e.on ? 1 : 0;
      else if (e.type === 'env') { st.cur = e.preset; st.autoT0 = T; st.autoPos0 = st.pos; }
      else if (e.type === 'auto') { st.autoOn = e.on ? 1 : 0; st.autoT0 = T; st.autoPos0 = st.pos; }
      else if (e.type === 'steer') st.steerIn = Math.max(-1, Math.min(1, e.x));
    }
    const ph = this.phaseAt(T);
    const cruise = ph.phase === 'cruise';
    // automatic environment change: after AUTO_ENV.time seconds or AUTO_ENV.dist road units of cruising
    if (!cruise || !st.autoOn) { st.autoT0 = T; st.autoPos0 = st.pos; }
    else if (T - st.autoT0 >= AUTO_ENV.time || st.pos - st.autoPos0 >= AUTO_ENV.dist) {
      st.cur = (st.cur + 1) % 4;
      this._autoSw.push({ type: 'env', t: T, preset: st.cur, auto: true });
      st.autoT0 = T; st.autoPos0 = st.pos;
    }
    const thrT = cruise && st.thrOn ? 1 : 0;
    const tau = thrT > st.thrA ? THROTTLE.rise : THROTTLE.fall;
    st.thrA += (thrT - st.thrA) * (1 - Math.exp(-DT / tau));
    st.thr += (st.thrA - st.thr) * (1 - Math.exp(-DT / 0.12));
    const en = cruise ? smooth(ph.ct / 1.4) : 0;
    const w = 6.2;
    const acc = w * w * (st.steerIn * en - st.steer) - 2 * w * st.steerV;
    st.steerV += acc * DT; st.steer += st.steerV * DT;
    const vt = this.baseSpeed(ph) * (1 + 1.35 * st.thr) * this.turboMul(T);
    const tauV = ph.phase === 'cruise' ? 0.2 : 0.09;
    st.vel += (vt - st.vel) * (1 - Math.exp(-DT / tauV));
    st.pos += st.vel * DT;
    this._T = T + DT;
    if (++this._n % SIM_HZ === 0) this._ck.push({ T: this._T, st: copy(st), ei: this._ei });
  }

  // Interpolated simulation state at scene time T.
  stateAt(T) {
    if (T < this._T - DT - 1e-9) {
      let i = this._ck.length - 1;
      while (i > 0 && this._ck[i].T > T) i--;
      const c = this._ck[i];
      this._ck.length = i + 1;
      this._T = c.T; this._st = copy(c.st); this._prev = copy(c.st); this._ei = c.ei; this._n = Math.round(c.T * SIM_HZ);
      this._autoSw = this._autoSw.filter((a) => a.t < c.T);
    }
    let guard = 0;
    while (this._T < T) {
      this._prev = copy(this._st);
      this._step();
      if (++guard > SIM_HZ * 7200) break;
    }
    const a = this._prev, b = this._st;
    const f = Math.max(0, Math.min(1, 1 - (this._T - T) / DT));
    if (this._T === 0) return copy(b);
    return {
      pos: lerp(a.pos, b.pos, f), vel: lerp(a.vel, b.vel, f), thr: lerp(a.thr, b.thr, f),
      steer: lerp(a.steer, b.steer, f), steerV: lerp(a.steerV, b.steerV, f), thrOn: b.thrOn, steerIn: b.steerIn,
      cur: b.cur, autoOn: b.autoOn, autoT0: b.autoT0, autoPos0: b.autoPos0,
    };
  }
}

export function phaseFrom(segs, T) {
  let i = segs.length - 1;
  while (i >= 0 && (segs[i].rew ?? segs[i].s) > T) i--;
  if (i < 0) return { phase: 'idle', t: T };
  const seg = segs[i];
  if (seg.rew !== null && T < seg.s) return { phase: 'rewind', u: T - seg.rew, seg, prev: segs[i - 1] };
  if (T < seg.end) return { phase: 'ign', it: T - seg.s, seg };
  if (T < seg.C) return { phase: 'ff', u: T - seg.skip, it: T - seg.s, seg };
  return { phase: 'cruise', ct: T - seg.C, seg };
}

// Canonical interaction script used for inspection renders, replays and the audio reference.
export const CANONICAL = [
  { type: 'start', t: 1.0 },
  { type: 'steer', t: 13.0, x: -0.6 }, { type: 'steer', t: 14.5, x: 0.7 }, { type: 'steer', t: 16.0, x: 0 },
  { type: 'thr', t: 17.0, on: true }, { type: 'thr', t: 20.5, on: false },
  { type: 'turbo', t: 24.3 },
  { type: 'env', t: 34.0, preset: 1 }, { type: 'env', t: 44.0, preset: 2 }, { type: 'env', t: 54.0, preset: 3 }, { type: 'env', t: 64.0, preset: 0 },
  { type: 'thr', t: 40.0, on: true }, { type: 'turbo', t: 41.2 }, { type: 'thr', t: 45.0, on: false },
  { type: 'music', t: 70.0, on: false }, { type: 'music', t: 73.0, on: true },
  { type: 'replay', t: 80.0 },
];
