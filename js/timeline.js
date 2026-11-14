// ─────────────────────────────────────────────────────────────────────────────
// Master timeline: a timestamped event log + a fixed-step (240 Hz) simulation.
// Everything visible or audible is a pure function of (scene time T, events).
// The same class runs on the main thread, inside the AudioWorklet and in Node.
// ─────────────────────────────────────────────────────────────────────────────
import { IGNITION, SKIP_FF, REWIND, TURBO, ENV_XFADE, THROTTLE, AUTO_ENV, ROAD, LANE_FEEL, GAME, SEED } from './cue.js';
import { smooth, easeInOutCubic, lerp } from './util.js';
import { freshGame, copyGame, stepGame, gameBase, P_TAIL } from './game.js';

export const SIM_HZ = 240;
export const DT = 1 / SIM_HZ;

const freshState = () => ({
  pos: 0, vel: 5.5, brkOn: 0, thrA: 0, thr: 0, lane: 0, laneS: 0, x: 0, xv: 0, yaw: 0, yawV: 0, camX: 0, camXv: 0, steer: 0, steerV: 0,
  cur: 0, autoOn: 1, autoT0: 0, autoPos0: 0,
  // the game: run counter, the cruise segment it belongs to, game-over kind (1 crashed, 2 busted) and time,
  // rewind in progress until `hold` (replaying scene time rwA back to rwB), spare tapes, revives used this run,
  // nitro smashing flag, game state
  run: 0, segC: -1, runT: 0, over: 0, overT: 0, hold: 0, rwA: 0, rwB: 0, paused: 0, tapes: GAME.tapesStart, rev: 0, nOn: 0, g: freshGame(SEED, 1),
});
const copy = (s) => { const c = { ...s }; c.g = copyGame(s.g); return c; };
const runSeed = (seed, run) => (Math.imul((seed | 0) ^ 0x9E3779B9, 0x85EBCA6B) + Math.imul(run, 0xC2B2AE35)) | 0;

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
    this._autoSw = []; this._gev = []; this._nitros = []; this._out = [];
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
    this._prune(c.T);
  }
  // drop everything the simulation derived at or after time T (it will be derived again)
  _prune(T) {
    this._autoSw = (this._autoSw || []).filter((a) => a.t < T);
    this._gev = (this._gev || []).filter((a) => a.t < T);
    this._nitros = (this._nitros || []).filter((a) => a.s < T);
    for (const n of this._nitros) if (n.until >= T) n.until = Infinity;
  }

  // ── derived structure (segments, turbos, env changes) ─────────────────────
  _derive() {
    if (this._derived) return this._derived;
    const segs = [], envs = [], music = [], wins = [], autos = [], opts = { seed: SEED, free: 0 };
    // every start after the first opens the same way: the tape rewinds, then the intro plays into the run
    const again = (t) => segs.push({ rew: t, s: t + REWIND, end: t + REWIND + IGNITION, C: t + REWIND + IGNITION, skip: null, until: Infinity });
    for (const e of this.events) {
      const cur = segs[segs.length - 1];
      switch (e.type) {
        case 'start':
          if (!segs.length) {            // first start: the full ignition
            segs.push({ rew: null, s: e.t, end: e.t + IGNITION, C: e.t + IGNITION, skip: null, until: Infinity });
            if (Number.isFinite(e.seed)) opts.seed = e.seed | 0;
            opts.free = e.free ? 1 : 0;
          } else if (cur.home !== undefined && e.t >= cur.home) again(e.t);   // from the home screen
          break;
        case 'home':                     // back to the home screen (title and START)
          if (cur && e.t >= cur.C && cur.until === Infinity) { cur.until = e.t; cur.home = e.t; }
          break;
        case 'restart':                  // a new run from the pause menu
          if (cur && e.t >= cur.C && cur.until === Infinity) { cur.until = e.t; again(e.t); }
          break;
        case 'replay':                   // rewind and play the intro again (from a run or from the home screen)
          if (cur && e.t >= cur.C && (cur.until === Infinity || (cur.home !== undefined && e.t >= cur.home))) {
            cur.until = Math.min(cur.until, e.t);
            const s = e.t + REWIND;
            segs.push({ rew: e.t, s, end: s + IGNITION, C: s + IGNITION, skip: null, until: Infinity });
          }
          break;
        case 'skip':
          if (cur && e.t >= cur.s && e.t < cur.end && cur.skip === null) { cur.skip = e.t; cur.end = e.t; cur.C = e.t + SKIP_FF; }
          else if (cur && cur.rew !== null && e.t >= cur.rew && e.t < cur.s && cur.skip === null) { cur.skip = cur.s; cur.end = cur.s; cur.C = cur.s + SKIP_FF; }   // pressed while the tape is still rewinding
          break;
        case 'env': if (segs.length) envs.push(e); break;
        case 'music': music.push(e); break;
        case 'win': wins.push(e); break;
        case 'auto': autos.push(e); break;
      }
    }
    this._derived = { segs, envs, music, wins, autos, opts };
    return this._derived;
  }

  phaseAt(T) { return phaseFrom(this._derive().segs, T); }

  // Nitro bursts are accepted by the simulation (they need a full charge), so every query first makes sure
  // the simulation has reached T. Envelope: a = time since the press, u = time since the impact.
  turboAt(T) {
    if (this._T < T) this.stateAt(T);
    const ns = this._nitros;
    for (let i = ns.length - 1; i >= 0; i--) {
      const tb = ns[i];
      if (tb.p > T) continue;
      if (T - tb.p >= TURBO.cooldown || T >= tb.until) return null;
      return { p: tb.p, I: tb.I, a: T - tb.p, u: T - tb.I, antic: tb.I - tb.p };
    }
    return null;
  }
  nitros(T) { if (this._T < T) this.stateAt(T); return this._nitros; }
  // 1 when a nitro canister can be fired now
  turboReady(T) {
    if (this.phaseAt(T).phase !== 'cruise') return 0;
    const st = this.stateAt(T);
    if (!st.run || st.over || st.paused || T < st.hold || this.turboAt(T)) return 0;
    return st.g.nstock > 0 ? 1 : 0;
  }
  turboMul(T) {
    const tb = this.turboAt(T);
    if (!tb) return 1;
    if (T < tb.I) return 1 - 0.12 * smooth(tb.a / tb.antic);
    const u = T - tb.I, B = GAME.nitroBoost;
    if (u < TURBO.sustain) return 1 + B * (1 - Math.exp(-u / 0.1));
    return 1 + B * (1 - easeInOutCubic((u - TURBO.sustain) / TURBO.recover));
  }
  // Game events the simulation derived in (T0, T1]: { t, k, … } (see stepGame), plus run / nitro / over / revive.
  gameEvents(T0, T1) {
    if (this._T < T1) this.stateAt(T1);
    const ev = this._gev, out = [];
    for (let i = ev.length - 1; i >= 0 && ev[i].t > T0; i--) if (ev[i].t <= T1) out.push(ev[i]);
    return out.reverse();
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
      case 'idle': case 'home': return 5.5;
      case 'rewind': return -70;
      case 'ff': return 95;
      case 'ign': return ignitionSpeed(ph.it);
      default: return 24;
    }
  }
  _newRun(st, T, seg) {
    const o = this._derive().opts;
    st.run++; st.segC = seg.C; st.runT = T;
    st.over = 0; st.overT = 0; st.rev = 0; st.hold = 0; st.paused = 0; st.nOn = 0; st.lane = 0;
    st.g = freshGame(runSeed(o.seed, st.run), o.free);
    this._endNitro(T);
    this._gev.push({ t: T, k: 'run', n: st.run });
  }
  _endNitro(T) {
    const n = this._nitros[this._nitros.length - 1];
    if (n && n.until > T && T - n.p < TURBO.cooldown) n.until = T;
  }
  // Rewind the tape: restore the game — and the road — as they were about three seconds before the crash (from the
  // simulation's own one-second checkpoints). While `hold` lasts the picture plays scene time rwA → rwB backwards.
  _revive(st, T) {
    // latest checkpoint of this run (and this revive lineage) at least rewindSec before the crash;
    // failing that, the earliest one of the lineage
    let src = null, first = null;
    for (let i = this._ck.length - 1; i >= 0; i--) {
      const c = this._ck[i];
      if (c.st.run !== st.run || c.st.rev !== st.rev) break;
      if (c.st.over || c.T < c.st.hold || c.st.paused) continue;
      first = c;
      if (!src && c.T <= st.overT - GAME.rewindSec) src = c;
    }
    src = src || first;
    st.rwA = st.overT; st.rwB = st.overT;
    if (src) {
      const o = src.st;
      st.g = copyGame(o.g); st.rwB = src.T;
      st.lane = o.lane; st.laneS = o.laneS; st.x = o.x; st.camX = o.camX;
      st.pos = o.pos; st.vel = o.vel; st.thr = o.thr; st.thrA = o.thrA;
    } else {
      const o = this._derive().opts, keep = st.g;
      st.g = freshGame(runSeed(o.seed, st.run), o.free);
      st.g.cells = keep.cells; st.lane = 0;
    }
    st.xv = 0; st.yaw = 0; st.yawV = 0; st.camXv = 0;
    const g = st.g;
    g.over = 0; g.inv = g.gt + GAME.reviveInv; g.combo = 0; g.pcl = 0; g.stG = 0; g.slow = 0; g.brkAcc = 0; g.lives = 2;
    g.polM = P_TAIL; g.polZ = Math.min(g.polZ, -GAME.polFar + 2); g.drT = -1; g.drNext = g.gt + 4; g.ramNext = Math.max(g.ramNext, g.gt + 5);
    g.icM = 0; g.icZ = -60; g.icNext = Math.max(g.icNext, g.gt + 6); g.aiNext = 0; g.atkGap = g.gt + 3; g.drWant = -1;
    st.over = 0; st.tapes--; st.rev++; st.hold = T + GAME.reviveHold; st.nOn = 0;
    this._endNitro(T);
    this._gev.push({ t: T, k: 'revive' });
  }
  // The simulation state at an earlier time T, computed on a scratch copy: the live simulation is not disturbed.
  // Used to play the last seconds backwards during a rewind.
  peek(T) {
    if (this._pk && this._pk.T === T && this._pk.n === this.events.length) return this._pk.st;
    const k = { T: this._T, st: this._st, prev: this._prev, ei: this._ei, n: this._n, ck: this._ck, gev: this._gev, nit: this._nitros, aut: this._autoSw };
    let i = k.ck.length - 1; while (i > 0 && k.ck[i].T > T) i--;
    const c = k.ck[i];
    this._ck = k.ck.slice(0, i + 1);
    this._T = c.T; this._st = copy(c.st); this._prev = copy(c.st); this._ei = c.ei; this._n = Math.round(c.T * SIM_HZ);
    this._gev = k.gev.filter((a) => a.t < c.T); this._autoSw = k.aut.filter((a) => a.t < c.T);
    this._nitros = k.nit.filter((a) => a.s < c.T).map((a) => ({ ...a, until: a.until >= c.T ? Infinity : a.until }));
    const r = this.stateAt(Math.max(T, c.T));
    const out = { ...r, tb: this.turboAt(T) };
    this._T = k.T; this._st = k.st; this._prev = k.prev; this._ei = k.ei; this._n = k.n; this._ck = k.ck; this._gev = k.gev; this._nitros = k.nit; this._autoSw = k.aut;
    this._pk = { T, n: this.events.length, st: out };
    return out;
  }
  _step() {
    const T = this._T, st = this._st, ev = this.events;
    const ph = this.phaseAt(T);
    const cruise = ph.phase === 'cruise';
    if (cruise && st.segC !== ph.seg.C) this._newRun(st, T, ph.seg);
    if (!cruise) { st.over = 0; st.hold = 0; st.paused = 0; st.lane = 0; }
    while (this._ei < ev.length && ev[this._ei].t <= T) {
      const e = ev[this._ei++];
      const ok = cruise && !st.over && T >= st.hold && !st.paused;
      if (e.type === 'brk') st.brkOn = e.on ? 1 : 0;
      else if (e.type === 'env') { st.cur = e.preset; st.autoT0 = T; st.autoPos0 = st.pos; }
      else if (e.type === 'auto') { st.autoOn = e.on ? 1 : 0; st.autoT0 = T; st.autoPos0 = st.pos; }
      else if (e.type === 'lane') { if (ok) st.lane = Math.max(-1, Math.min(1, st.lane + (e.dir > 0 ? 1 : -1))); }
      else if (e.type === 'turbo') {
        if (ok && st.g.nstock > 0 && !this.turboAt(T)) {
          const C = ph.seg.C, q = TURBO.grid;
          const I = C + Math.ceil((e.t + TURBO.minAntic - C) / q - 1e-9) * q;
          this._nitros.push({ p: e.t, I, s: T, until: Infinity });
          st.g.nstock--; st.g.nfree = 0;
          this._gev.push({ t: T, k: 'nitro', p: e.t, I, left: st.g.nstock });
        }
      } else if (e.type === 'pause') {
        // VCR pause: the game clock stops and the car coasts to a halt; scene time (and the music) carry on
        const on = e.on ? 1 : 0;
        if (cruise && st.run > 0 && !st.over && T >= st.hold && on !== st.paused) { st.paused = on; if (on) this._endNitro(T); this._gev.push({ t: T, k: 'pause', on }); }
      }
      else if (e.type === 'revive') { if (cruise && st.over && st.tapes > 0 && T - st.overT >= GAME.overLock) this._revive(st, T); }
    }
    const live = cruise && st.run > 0 && !st.over && T >= st.hold && !st.paused;
    // automatic environment change: after AUTO_ENV.time seconds or AUTO_ENV.dist road units of driving
    if (!live || !st.autoOn) { st.autoT0 = T; st.autoPos0 = st.pos; }
    else if (T - st.autoT0 >= AUTO_ENV.time || st.pos - st.autoPos0 >= AUTO_ENV.dist) {
      st.cur = (st.cur + 1) % 4;
      this._autoSw.push({ type: 'env', t: T, preset: st.cur, auto: true });
      st.autoT0 = T; st.autoPos0 = st.pos;
    }
    if (!(cruise && T < st.hold)) {           // (frozen during a rewind)
      const thrT = live && !st.brkOn ? 1 : 0;   // drive amount: 1 = flat out, falls while the brake is held
      const tau = thrT > st.thrA ? THROTTLE.rise : THROTTLE.fall;
      st.thrA += (thrT - st.thrA) * (1 - Math.exp(-DT / tau));
      st.thr += (st.thrA - st.thr) * (1 - Math.exp(-DT / 0.12));
    }
    // three-lane driving: lateral spring on a lightly smoothed lane target; drift yaw and camera follow as springs
    if (!st.over) {
      const F = LANE_FEEL, L = ROAD.lane;
      st.laneS += (st.lane * L - st.laneS) * (1 - Math.exp(-DT / F.tauIn));
      const ax = F.w * F.w * (st.laneS - st.x) - 2 * F.w * st.xv;
      st.xv += ax * DT; st.x += st.xv * DT;
      const yT = Math.max(-F.yawMax, Math.min(F.yawMax, -st.xv * F.yawK));
      const ay = F.yawW * F.yawW * (yT - st.yaw) - 2 * F.yawZ * F.yawW * st.yawV;
      st.yawV += ay * DT; st.yaw += st.yawV * DT;
      const ac = F.camW * F.camW * (st.x * F.camK - st.camX) - 2 * F.camW * st.camXv;
      st.camXv += ac * DT; st.camX += st.camXv * DT;
      st.steer = st.x / L; st.steerV = st.xv / L;
    }
    // the game: traffic, collisions, score. Nitro smashes through traffic while its boost is strong.
    const tb = cruise ? this.turboAt(T) : null;
    const nOn = !!tb && tb.u < TURBO.sustain + TURBO.recover * GAME.nitroTail;
    if (live) {
      const g = st.g;
      if (st.nOn && !nOn) g.inv = Math.max(g.inv, g.gt + GAME.nitroGrace);
      st.nOn = nOn ? 1 : 0;
      const out = this._out; out.length = 0;
      stepGame(g, { dt: DT, x: st.x, lane: st.lane, vel: st.vel, brk: st.brkOn, nitro: nOn }, out);
      for (const o of out) {
        o.t = T; this._gev.push(o);
        if (o.k === 'swipe') { st.lane = o.back; st.xv = o.dir * GAME.swipeKick; }
        else if (o.k === 'tape') st.tapes = Math.min(GAME.maxTapes, st.tapes + 1);
      }
      if (g.over) { st.over = g.over; st.overT = T; this._endNitro(T); this._gev.push({ t: T, k: 'over', kind: g.over }); }
    }
    if (!(cruise && T < st.hold)) {         // during a rewind the road is replayed from the past: nothing moves here
      let vt, tauV;
      if (!cruise) { vt = this.baseSpeed(ph); tauV = ph.phase === 'home' ? 0.5 : 0.09; }
      else if (st.over) { vt = 0; tauV = st.over === 2 ? 0.7 : 0.3; }
      else if (st.paused) { vt = 0; tauV = 0.1; }
      else {
        const g = st.g, tm = this.turboMul(T), dm = GAME.brakeMul + (1 - GAME.brakeMul) * st.thr;
        let k = tm > 1 ? Math.max(dm, tm) : dm * tm;
        if (g.gt < g.slow) k *= GAME.ramSlowMul;
        const intro = !g.free && g.gt < GAME.introHold;       // the police have you at the roadside; then you floor it
        vt = intro ? GAME.introV : gameBase(g) * k; tauV = intro ? 0.12 : g.gt < GAME.introT ? 0.5 : 0.2;
      }
      let dv = (vt - st.vel) * (1 - Math.exp(-DT / tauV));
      if (cruise && !st.over && !st.paused && st.run > 0 && (st.g.free || st.g.gt >= GAME.introHold)) {       // … but it has weight: the engine and the brakes can only do so much
        const up = (nOn || (tb && T >= tb.I) ? GAME.nitroAccel : st.vel < GAME.gears[0] ? GAME.launch : GAME.accel) * DT;
        dv = Math.max(-(tb ? 400 : GAME.brake) * DT, Math.min(up, dv));       // (a nitro burst dies away as fast as it came: the car is back at road speed by the time it can be hit again)
      }
      st.vel += dv;
      st.pos += st.vel * DT;
    }
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
      this._prune(c.T);
    }
    let guard = 0;
    while (this._T < T) {
      if (this._T + DT >= T) this._prev = copy(this._st);   // only the last step before T is needed for interpolation
      this._step();
      if (++guard > SIM_HZ * 7200) break;
    }
    const a = this._prev, b = this._st;
    const f = Math.max(0, Math.min(1, 1 - (this._T - T) / DT));
    if (this._T === 0) return copy(b);
    return {
      pos: lerp(a.pos, b.pos, f), vel: lerp(a.vel, b.vel, f), thr: lerp(a.thr, b.thr, f),
      steer: lerp(a.steer, b.steer, f), steerV: lerp(a.steerV, b.steerV, f), brkOn: b.brkOn, lane: b.lane,
      x: lerp(a.x, b.x, f), xv: lerp(a.xv, b.xv, f), yaw: lerp(a.yaw, b.yaw, f), yawV: lerp(a.yawV, b.yawV, f), camX: lerp(a.camX, b.camX, f),
      cur: b.cur, autoOn: b.autoOn, autoT0: b.autoT0, autoPos0: b.autoPos0,
      // the game: `g` is a copy of the game state, `gf` how far T is between the last two steps
      run: b.run, runT: b.runT, over: b.over, overT: b.overT, hold: b.hold, rwA: b.rwA, rwB: b.rwB, paused: b.paused, tapes: b.tapes, rev: b.rev, nOn: b.nOn, g: copyGame(b.g), gf: f,
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
  if (seg.home !== undefined && T >= seg.home) return { phase: 'home', ht: T - seg.home, seg };
  return { phase: 'cruise', ct: T - seg.C, seg };
}

// Canonical interaction script used for inspection renders, replays and the audio reference: the full intro, then
// a clean drive recorded from tools/bot.mjs (`node tools/bot.mjs --script 68.95 --late`, default seed) with a dab of
// brake, two nitro canisters picked up and fired, the four presets and a music pause; then the home screen and
// a second start, which opens with the intro again.
export const CANONICAL = [
  { type: 'start', t: 1 }, { type: 'brk', t: 17, on: true }, { type: 'lane', t: 17.8, dir: -1 }, { type: 'brk', t: 18.2, on: false }, { type: 'lane', t: 21.95, dir: 1 }, { type: 'lane', t: 23.15, dir: -1 }, { type: 'lane', t: 24, dir: 1 }, { type: 'lane', t: 27.9, dir: 1 }, { type: 'lane', t: 28.75, dir: -1 }, { type: 'lane', t: 29.6, dir: 1 }, { type: 'turbo', t: 30.9 }, { type: 'env', t: 34, preset: 1 }, { type: 'lane', t: 35.3, dir: -1 }, { type: 'lane', t: 36.5, dir: -1 }, { type: 'lane', t: 38.1, dir: 1 }, { type: 'lane', t: 40.7, dir: -1 }, { type: 'lane', t: 42.05, dir: 1 }, { type: 'lane', t: 43.35, dir: 1 }, { type: 'env', t: 44, preset: 2 }, { type: 'lane', t: 46.15, dir: -1 }, { type: 'lane', t: 48.55, dir: -1 }, { type: 'lane', t: 51.65, dir: 1 }, { type: 'env', t: 54, preset: 3 }, { type: 'lane', t: 54.15, dir: -1 }, { type: 'lane', t: 55.65, dir: 1 }, { type: 'lane', t: 58.55, dir: 1 }, { type: 'lane', t: 62.05, dir: -1 }, { type: 'env', t: 64, preset: 0 }, { type: 'lane', t: 64.5, dir: -1 }, { type: 'lane', t: 65.2, dir: 1 }, { type: 'lane', t: 66.65, dir: -1 }, { type: 'lane', t: 69, dir: 1 }, { type: 'music', t: 70, on: false }, { type: 'lane', t: 70.75, dir: -1 }, { type: 'turbo', t: 71.05 }, { type: 'music', t: 73, on: true }, { type: 'lane', t: 79.45, dir: 1 },
  { type: 'home', t: 80.0 }, { type: 'start', t: 83.0 },
];
