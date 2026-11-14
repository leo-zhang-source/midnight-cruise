// DOM layer: accessible controls, input → timeline events, and per-frame UI state.
// All UI motion (pop-in, drag, settle) is evaluated from the timeline, not CSS transitions.
import { PRESETS, IGN, GAME, drumPulse } from './cue.js';
import { clamp, lerp, smooth, spring, ring, sat } from './util.js';

const $ = (id) => document.getElementById(id);
const CIRC = 282.74;
const WIN_HZ = 240, WDT = 1 / WIN_HZ;

export class UI {
  constructor(app) {
    this.app = app;
    this.el = {
      osd: $('osd'), osdText: $('osd-text'), osdClock: $('osd-clock'), startWrap: $('start-wrap'), start: $('start'),
      skip: $('skip'), drivebar: $('drivebar'), turbo: $('turbo'), turboRing: $('turbo-ring'), turboState: $('turbo-state'),
      deck: $('deck'), deckBar: $('deck-bar'), deckMin: $('deck-min'), play: $('play'), mute: $('mute'), vol: $('vol'), auto: $('auto'), autoFill: $('auto-fill'),
      lcdName: $('lcd-name'), lcdLed: $('lcd-led'), lcdMeter: $('lcd-meter'), lcdCount: $('lcd-count'), reelL: $('reel-l'), reelR: $('reel-r'),
      presets: [...document.querySelectorAll('.preset')], canvas: $('gl'), spd: $('spd'), spdBar: $('spd-bar'), hints: $('hints'),
      ghud: $('ghud'), gScore: $('g-score'), gMult: $('g-mult'), gCells: $('g-cells'), gStars: $('g-stars'), gTail: $('g-tail'), gTailBar: $('g-tail-bar'), gTailText: $('g-tail-text'), gLives: $('g-lives'), gTapes: $('g-tapes'), gear: $('gear'),
      homeScore: $('home-score'), hsLast: $('hs-last'), hsBest: $('hs-best'), home: $('home'), home2: $('home2'), restart: $('restart'), ovRk: document.querySelector('.ov-rk'), ovSmash: $('ov-smash'), ovStar: $('ov-star'), gLv: $('g-lv'),
      gpops: $('gpops'), pops: [...$('gpops').children], police: $('police'), pause: $('pause'), paused: $('paused'), resume: $('resume'), over: $('over'), overTitle: $('over-title'), revive: $('revive'), live: $('g-live'),
      ovScore: $('ov-score'), ovBest: $('ov-best'), ovBestL: $('ov-best-l'), ovDist: $('ov-dist'), ovSpeed: $('ov-speed'), ovCombo: $('ov-combo'), ovNear: $('ov-near'), ovTapes: $('ov-tapes'),
    };
    this.best = 0; this.last = -1;      // best score (kept in this browser) and the last run's score, for the home screen
    try { this.best = +localStorage.getItem('mc86.best') || 0; } catch (_) { /* storage unavailable: best score lasts for this visit */ }
    this.el.lcdMeter.innerHTML = '<i></i>'.repeat(8);
    this.meterBars = [...this.el.lcdMeter.children];
    this.el.spdBar.innerHTML = '<i></i>'.repeat(14);
    this.spdSegs = [...this.el.spdBar.children];
    this.win = { n: 0, ei: 0, st: null };
    this.cache = {};
    this.bind();
  }

  ev(type, data = {}) { return this.app.addEvent(type, data); }
  sfx(name) { this.ev('sfx', { name }); }

  phase() { return this.app.tl.phaseAt(this.app.now()).phase; }

  bind() {
    const E = this.el;
    E.start.addEventListener('click', () => this.app.start());
    E.skip.addEventListener('click', () => this.skip());
    E.turbo.addEventListener('pointerdown', (e) => e.preventDefault());   // a pointer press must not leave the focus here (Space would then press the button again)
    E.turbo.addEventListener('click', () => this.turbo());
    E.pause.addEventListener('click', () => this.pause(true));
    E.resume.addEventListener('click', () => this.pause(false));
    E.restart.addEventListener('click', () => this.restart());
    E.home.addEventListener('click', () => this.home());
    E.home2.addEventListener('click', () => this.home());
    E.revive.addEventListener('click', () => this.revive());
    E.play.addEventListener('click', () => { const on = this.app.tl.musicAt(this.app.now()).on; this.ev('music', { on: !on }); this.sfx('clunk'); });
    E.mute.addEventListener('click', () => { const m = !this.app.audio.muted; this.app.audio.setMuted(m); this.ev('mute', { on: m }); this.sfx('click'); E.mute.setAttribute('aria-pressed', String(m)); E.mute.setAttribute('aria-label', m ? 'Unmute' : 'Mute'); });
    E.auto.addEventListener('click', () => { const on = !this.app.tl.autoOn(this.app.now()); this.ev('auto', { on }); this.sfx('click'); });
    E.vol.addEventListener('input', () => { const v = E.vol.value / 100; this.app.audio.setVolume(v); clearTimeout(this._vt); this._vt = setTimeout(() => this.ev('vol', { v }), 120); });
    E.presets.forEach((b) => b.addEventListener('click', () => { const p = +b.dataset.p; if (this.app.tl.envTarget(this.app.now()) !== p) { this.ev('env', { preset: p }); this.sfx('select'); } }));
    E.deckMin.addEventListener('click', () => { const m = E.deck.dataset.min !== 'true'; this.setMin(m); this.ev('deckmin', { on: m }); this.sfx('tick'); });
    // deck drag
    E.deckBar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.deck-min')) return;
      e.preventDefault(); E.deckBar.setPointerCapture(e.pointerId); this.dragging = true;
      this.ev('win', { act: 'down', x: e.clientX, y: e.clientY }); this.sfx('tick');
    });
    E.deckBar.addEventListener('pointermove', (e) => { if (this.dragging) this.pendingWin = { x: e.clientX, y: e.clientY }; });
    const wUp = (e) => { if (!this.dragging) return; this.dragging = false; this.flushWin(); this.ev('win', { act: 'up', x: e.clientX ?? 0, y: e.clientY ?? 0 }); };
    E.deckBar.addEventListener('pointerup', wUp); E.deckBar.addEventListener('pointercancel', wUp); E.deckBar.addEventListener('lostpointercapture', wUp);
    // lane change: ← → / A D, or a tap / click on the left or right half of the scene (fires on press, no wait)
    const cv = E.canvas;
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      this.lane(e.clientX < innerWidth / 2 ? -1 : 1);
    });
    // keyboard
    const interactive = (t) => t && t !== document.body && t.matches && t.matches('button, input, a, [tabindex]');
    addEventListener('keydown', (e) => {
      const k = e.key, down = k === 'ArrowDown', space = k === ' ' || e.code === 'Space';
      if (space || down) {                                   // Space starts and resumes (the car has no brake: it drives flat out)
        if (space && interactive(document.activeElement)) return;      // a focused button takes Space itself
        e.preventDefault();
        if (e.repeat) return;
        const ph = this.phase();
        if (ph === 'idle' || ph === 'home') { if (space) this.app.start(); return; }
        if (this.isPaused()) { if (space) this.pause(false); return; }
        return;
      }
      if (e.repeat) return;
      const ph = this.phase();
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); this.lane(-1); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); this.lane(1); }
      else if (k === 't' || k === 'T' || k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); this.turbo(); }
      else if (k === 'p' || k === 'P') this.pause(!this.isPaused());
      else if (k === 'Escape') { if (ph === 'ign' || ph === 'rewind') this.skip(); else this.pause(!this.isPaused()); }
      else if (k === 's' || k === 'S') this.skip();
      else if (k === 'r' || k === 'R') { if (this.overState()) this.revive(); else if (this.isPaused()) this.restart(); }
      else if (k === 'h' || k === 'H') this.home();
      else if (k === 'm' || k === 'M') E.mute.click();
      else if (k === 'Enter' && !interactive(document.activeElement)) {
        const st = this.overState();
        if (ph === 'idle' || ph === 'home') this.app.start(); else if (this.isPaused()) this.pause(false); else if (st) { if (st.tapes > 0) this.revive(); else this.home(); }
      }
      else if (/^[1-4]$/.test(k) && ph !== 'idle' && ph !== 'home') E.presets[+k - 1].click();
    });
    const release = () => { this.pause(true, true); if (this.dragging) { this.dragging = false; this.ev('win', { act: 'up', x: 0, y: 0 }); } };
    addEventListener('blur', release);
    document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
    this.setMin(true);   // the deck starts minimised; its title-bar key expands it
    if (matchMedia('(pointer: coarse)').matches) { $('start-note').textContent = 'Sound on · Tap left / right to change lane · Nitro when you carry a canister'; document.body.classList.add('touch'); }
  }

  setMin(m) {
    const E = this.el;
    E.deck.dataset.min = String(m);
    E.deckMin.setAttribute('aria-expanded', String(!m));
    E.deckMin.setAttribute('aria-label', m ? 'Expand cassette deck' : 'Minimise cassette deck');
  }

  // one lane left (−1) or right (+1); only while cruising
  lane(dir) {
    if (this.phase() !== 'cruise' || this.overState()) return;
    this.ev('lane', { dir });
  }
  // the run is over (crashed or busted): returns the simulation state once the panel accepts input
  overState() {
    const tl = this.app.tl, st = tl.stateAt(tl.frontier());
    return st.over && this.app.now() - st.overT >= GAME.overLock ? st : null;
  }
  isPaused() { const tl = this.app.tl; return !!tl.stateAt(tl.frontier()).paused; }
  // Pause or resume the run. auto: the window lost focus or the tab was hidden — only a live run with traffic pauses.
  pause(on, auto = false) {
    if (this.phase() !== 'cruise') return;
    const tl = this.app.tl, st = tl.stateAt(tl.frontier());
    if (!st.run || st.over || this.app.now() < st.hold || !!st.paused === !!on || (auto && st.g.free)) return;
    this.ev('pause', { on: !!on }); this.sfx('clunk');
  }
  // remember the score of the run that is ending (and the best one, in this browser)
  commit(st) {
    if (st.g.free) return;
    this.last = Math.floor(st.g.score);
    if (this.last > this.best) { this.best = this.last; try { localStorage.setItem('mc86.best', String(this.best)); } catch (_) { /* not stored */ } }
  }
  // which menu is open: the pause menu or the EJECT panel (null while driving)
  menu() {
    if (this.phase() !== 'cruise') return null;
    const tl = this.app.tl, st = tl.stateAt(tl.frontier());
    if (!st.run) return null;
    if (st.over) return this.app.now() - st.overT >= GAME.overLock ? st : null;
    return st.paused ? st : null;
  }
  // back to the home screen — from the pause menu, or after a crash (a new run always starts from there)
  home() { const st = this.menu(); if (!st) return; this.commit(st); this.ev('home'); this.sfx('clunk'); }
  // a new run right away — from the pause menu only
  restart() { const st = this.menu(); if (!st || st.over) return; this.commit(st); this.ev('restart'); this.sfx('clunk'); }
  skip() { const ph = this.phase(); if (ph === 'ign' || ph === 'rewind') this.ev('skip'); }      // the intro opens every start; this cuts it short
  revive() { const st = this.overState(); if (st && st.tapes > 0) this.ev('revive'); }
  // Sounds for what the simulation just derived (close calls, crashes …). Only the picture's timeline announces:
  // it never runs ahead of the visitor's input, so a sound is never played for something that is then avoided.
  announce(T) {
    if (this.annT === undefined || T < this.annT || T - this.annT > 0.5) { this.annT = T; return; }
    const evs = this.app.tl.gameEvents(this.annT, T); this.annT = T;
    for (const e of evs) {
      const k = e.k;
      if (k === 'near') this.sfx('near');
      else if (k === 'pass') this.sfx('pass' + (e.big ? 'B' : '') + (e.side < 0 ? 'L' : 'R'));
      else if (k === 'smash' || k === 'wreck') this.sfx('smash');
      else if (k === 'shake') this.sfx('chime');
      else if (k === 'swipe') this.sfx('swipe');
      else if (k === 'over') { this.sfx(e.kind === 2 ? 'bust' : 'crashfx'); this.el.live.textContent = (e.kind === 2 ? 'Busted.' : 'Crashed.') + ' Press R to rewind the tape, or H for the home screen.'; }
      else if (k === 'gear') this.sfx('gear');
      else if (k === 'star') { if (e.up) this.sfx('siren'); }
      else if (k === 'stumble' || k === 'run') { if (e.by === 'hook') this.sfx('hook'); this.sfx('siren'); }
      else if (k === 'ramwarn' || k === 'lock' || k === 'ictell') this.sfx('lock');
      else if (k === 'block' || k === 'weave') this.sfx('siren');
      else if (k === 'icwarn') this.sfx('yelp');
      else if (k === 'slam' || k === 'mirror') this.sfx('skid');
      else if (k === 'level') { if (e.n) this.sfx('alert'); }
      else if (k === 'clear') this.sfx('chime');
      else if (k === 'strike') this.sfx('burst');
      else if (k === 'shove') this.sfx('smash');
      else if (k === 'go') this.sfx('whoosh');
      else if (k === 'item') { this.sfx('chime'); this.sfx('gear'); }
      else if (k === 'tape' || k === 'full') this.sfx('chime');
      else if (k === 'revive') this.sfx('rewindlong');
    }
  }

  turbo() {
    const T = this.app.now();
    if (this.app.tl.turboReady(T) >= 1) { this.ev('turbo'); this.fireT = T; }
  }

  flushWin() { if (this.pendingWin) { this.ev('win', { act: 'move', ...this.pendingWin }); this.pendingWin = null; } }

  // per-frame: emit coalesced continuous inputs (deck drag) as timestamped events
  pump() {
    if (this.dragging) this.flushWin();
  }

  // ── deterministic window physics from 'win' events ──
  dock(w, h, dw, dh) {
    if (w < 720 || h > w) {
      const c = document.getElementById('corner').getBoundingClientRect();
      return { x: (w - dw) / 2, y: Math.max(12, (c.height ? c.bottom : 60) + 10) };
    }
    const g = Math.max(16, w * 0.05);
    const stamp = this.el.osd.querySelector('.osd-stamp').getBoundingClientRect();
    const bottom = stamp.height ? stamp.top - 18 : h - Math.max(20, h * 0.046) - 70;
    return { x: g, y: clamp(bottom - dh, h * 0.3, h - dh - 16) };
  }
  clampWin(x, y, w, h, dw, dh) {
    const m = 12;
    x = clamp(x, m, Math.max(m, w - dw - m)); y = clamp(y, m, Math.max(m, h - dh - m));
    // keep clear of the drive controls
    const db = this.el.drivebar.getBoundingClientRect();
    if (db.width && x + dw > db.left - 10 && y + dh > db.top - 10) {
      const up = db.top - 10 - dh, left = db.left - 10 - dw;
      if (up >= m && (y - up) < (x - left)) y = up; else if (left >= m) x = left; else y = Math.max(m, up);
    }
    return { x, y };
  }
  winState(T, w, h, dw, dh) {
    const tl = this.app.tl, evs = tl._derive().wins;
    const dock = this.dock(w, h, dw, dh);
    const key = `${w}x${h}x${dw}x${dh}`;
    if (!this.win.st || this.win.key !== key || this.win.T > T + 1e-6 || this.win.count > evs.length) {
      this.win = { key, T: evs.length ? evs[0].t : T, ei: 0, count: evs.length, st: { x: dock.x, y: dock.y, vx: 0, vy: 0, rot: 0, rv: 0, drag: false, gx: 0, gy: 0, tx: dock.x, ty: dock.y, rest: dock } };
    }
    const W = this.win, st = W.st;
    W.count = evs.length;
    let guard = 0;
    while (W.T < T && guard++ < WIN_HZ * 4) {
      while (W.ei < evs.length && evs[W.ei].t <= W.T) {
        const e = evs[W.ei++];
        if (e.act === 'down') { st.drag = true; st.gx = e.x - st.x; st.gy = e.y - st.y; st.tx = st.x; st.ty = st.y; }
        else if (e.act === 'move' && st.drag) { st.tx = e.x - st.gx; st.ty = e.y - st.gy; }
        else if (e.act === 'up' && st.drag) { st.drag = false; const c = this.clampWin(st.tx, st.ty, w, h, dw, dh); st.tx = c.x; st.ty = c.y; st.rest = c; }
      }
      const wk = st.drag ? 30 : 15, z = st.drag ? 0.8 : 0.42;
      const ax = wk * wk * (st.tx - st.x) - 2 * z * wk * st.vx, ay = wk * wk * (st.ty - st.y) - 2 * z * wk * st.vy;
      st.vx += ax * WDT; st.vy += ay * WDT; st.x += st.vx * WDT; st.y += st.vy * WDT;
      const rt = st.drag ? clamp(st.vx * 0.00011, -0.1, 0.1) : 0;
      const ra = 22 * 22 * (rt - st.rot) - 2 * 0.35 * 22 * st.rv;
      st.rv += ra * WDT; st.rot += st.rv * WDT;
      W.T += WDT;
    }
    if (guard >= WIN_HZ * 4) W.T = T;
    const c = st.drag ? { x: st.x, y: st.y } : this.clampWin(st.x, st.y, w, h, dw, dh);
    return { x: c.x, y: c.y, rot: st.rot, drag: st.drag };
  }

  update(s, T, w, h) {
    const E = this.el, U = s.ui, C = this.cache;
    const set = (k, v, fn) => { if (C[k] !== v) { C[k] = v; fn(v); } };
    // OSD
    let icon = '', text = '';
    if (U.osd === 'PLAY') { icon = 'play'; text = 'PLAY'; }
    else if (U.osd === 'PAUSE') { icon = 'pause'; text = 'PAUSE'; }
    else if (U.osd === 'FF') { icon = 'ff'; text = 'FF'; }
    else if (U.osd === 'REW') { icon = 'rew'; text = 'REW'; }
    else if (U.osd) { icon = 'ch'; text = U.osd; }
    set('icon', icon, (v) => { if (v) E.osd.dataset.icon = v; else delete E.osd.dataset.icon; });
    set('osdText', text, (v) => { E.osdText.textContent = v; });
    const mins = Math.floor(T / 60) % 60;
    set('clock', mins, (m) => { E.osdClock.textContent = `AM 12:${String(m).padStart(2, '0')}`; });
    // start (first load and the home screen)
    const st = s.phase === 'ign' ? Math.max(0, 1 - s.it / 0.25) : +U.start;
    set('startA', st.toFixed(3), () => { E.startWrap.style.opacity = st; E.startWrap.style.visibility = st > 0 ? 'visible' : 'hidden'; E.startWrap.style.pointerEvents = st > 0.6 ? 'auto' : 'none'; E.startWrap.style.transform = `translate(-50%, calc(-50% + ${(1 - st) * 14}px)) scale(${1 + (1 - st) * 0.06})`; });
    set('homeS', U.home && this.last >= 0 ? this.last + '|' + this.best : '', (v) => { E.homeScore.hidden = !v; if (v) { E.hsLast.textContent = this.last.toLocaleString('en-US'); E.hsBest.textContent = this.best.toLocaleString('en-US'); } });
    set('homeF', U.home && st > 0.9 ? 1 : 0, (v) => { if (v) { try { E.start.focus({ preventScroll: true }); } catch (_) { /* focus is a convenience */ } } });
    set('skip', U.skip, (v) => E.skip.classList.toggle('on', !!v));
    // drive controls: the nitro button shows how many canisters are aboard
    const ca = U.controls;
    set('ctrl', ca.toFixed(3), () => { E.drivebar.style.opacity = ca; E.drivebar.style.visibility = ca > 0.01 ? 'visible' : 'hidden'; E.drivebar.style.transform = `translateY(${(1 - ca) * 28}px)`; E.drivebar.style.pointerEvents = ca > 0.6 ? 'auto' : 'none'; });
    const active = s.phase === 'cruise', Gq = U.g;
    const stock = active && Gq && Gq.on ? Gq.nstock : 0, ready = active && U.ready >= 1;
    const boosting = active && Gq && Gq.on && this.app.tl.turboAt(T) ? 1 : 0;
    set('trb', stock, (n) => { E.turboRing.style.strokeDashoffset = CIRC * (1 - Math.min(1, n / GAME.nitroMax)); E.turbo.dataset.n = n; });
    set('trbR', `${ready}|${boosting}|${stock}|${active}`, () => { E.turbo.dataset.ready = String(ready); E.turbo.setAttribute('aria-disabled', ready ? 'false' : 'true'); E.turboState.textContent = boosting ? 'BOOST' : ready ? 'READY · T' : stock ? 'WAIT' : active ? 'EMPTY' : 'STANDBY'; });
    set('trbF', this.fireT !== undefined && T - this.fireT < 0.18 ? 'true' : 'false', (v) => { E.turbo.dataset.fire = v; });
    // speedometer (MPH from the simulated road speed) and the control hints
    const mph = Math.round(Math.abs(s.road.vel) * GAME.mph);
    set('spd', mph, (v) => { E.spd.textContent = String(Math.min(999, v)).padStart(3, '0'); });
    const segs = Math.round(Math.min(1, Math.abs(s.road.vel) / 180) * 14);
    set('spdSeg', segs, (n) => this.spdSegs.forEach((g, i) => { g.className = i < n ? (i >= 10 ? 'on hot' : 'on') : ''; }));
    const ha = U.hint;
    set('hint', ha.toFixed(2), () => { E.hints.style.visibility = ha > 0.01 ? 'visible' : 'hidden'; E.hints.style.opacity = ha; E.hints.style.transform = `translateX(-50%) translateY(${(1 - ha) * 10}px)`; });
    // deck: pop-in, drag, settle
    const vis = U.cassette > 0;
    const ds = (w < 720 || h > w) ? 1 : clamp(Math.min((h / 1080) * 1.12, (w / 1500) * 1.2), 0.74, 1);
    const dw = (E.deck.offsetWidth || 320) * ds, dh = (E.deck.offsetHeight || 380) * ds;
    const pos = this.winState(T, w, h, dw, dh);
    let sc = 1, rot = pos.rot, op = 1;
    if (vis && U.cassetteT < 1.2) {
      const u = U.cassetteT;
      sc = s.reduced ? 1 : lerp(0.55, 1, spring(u, 17, 0.42));
      rot += s.reduced ? 0 : -0.06 * ring(u, 15, 0.35);
      op = smooth(u / (s.reduced ? 0.4 : 0.12));
    }
    if (s.phase === 'rewind') op *= 1;
    const px = pos.x + dw * (1 - sc) / 2;
    const tr = `translate(${px.toFixed(1)}px, ${pos.y.toFixed(1)}px) rotate(${rot.toFixed(4)}rad) scale(${(sc * ds).toFixed(4)})`;
    set('deckT', tr + vis + op.toFixed(3), () => { E.deck.style.transform = tr; E.deck.style.visibility = vis ? 'visible' : 'hidden'; E.deck.style.opacity = op; });
    if (vis) {
      const as = this.app.audio.status;
      const lcd = as === 'failed' ? 'NO AUDIO' : as === 'suspended' ? 'TAP TO RESUME' : as === 'stalled' ? 'NO AUDIO OUT' : `${String.fromCharCode(65 + U.preset)} · ${PRESETS[U.preset]}`;
      set('lcd', lcd, (v) => { E.lcdName.textContent = v; });
      set('preset', U.preset, (p) => { E.presets.forEach((b, i) => b.setAttribute('aria-checked', String(i === p))); });
      set('auto', U.autoOn, (on) => { E.auto.setAttribute('aria-pressed', String(on)); E.auto.setAttribute('aria-label', on ? 'Automatic colour change: on' : 'Automatic colour change: off'); });
      set('autoP', U.autoP.toFixed(3), (v) => { E.autoFill.style.width = (+v * 100).toFixed(1) + '%'; });
      set('music', U.music, (m) => { E.play.setAttribute('aria-pressed', String(m)); E.play.setAttribute('aria-label', m ? 'Pause music' : 'Play music'); });
      set('led', U.music && as === 'running', (on) => E.lcdLed.classList.toggle('on', on));
      // reels (music-locked) and meter (from the cue sheet)
      const mt = U.music ? T : (C.pausedAt ?? T);
      if (U.music) C.pausedAt = undefined; else if (C.pausedAt === undefined) C.pausedAt = T;
      const ang = (mt * 2.4 + s.road.pos * 0.004) % (Math.PI * 2);
      E.reelL.setAttribute('transform', `translate(98 76) rotate(${(ang * 57.2958).toFixed(1)})`);
      E.reelR.setAttribute('transform', `translate(202 76) rotate(${(ang * 57.2958 * 1.3).toFixed(1)})`);
      let k = 0, sn = 0;
      if (U.music && (s.phase === 'cruise' || s.phase === 'ign')) {
        const dp = s.phase === 'ign' ? drumPulse('ign', s.it) : drumPulse('cruise', s.ct);
        k = Math.exp(-dp.kick / 0.12); sn = Math.exp(-dp.snare / 0.18);
      }
      const sx = (T * 8) % 1;
      this.meterBars.forEach((b, i) => {
        const f = i / 7;
        const v = U.music ? clamp(0.25 + 0.55 * k * (1 - f) + 0.6 * sn * f + 0.15 * Math.sin(T * 9 + i * 1.7) * (0.5 + U.thr) + 0.2 * U.thr, 0.08, 1) : 0.06;
        const hpx = Math.round(2 + v * 14);
        if (b._h !== hpx) { b._h = hpx; b.style.height = hpx + 'px'; }
      });
      const cnt = s.phase === 'cruise' ? Math.floor(s.ct) % 1000 : s.phase === 'ign' ? 0 : 0;
      set('cnt', cnt, (v) => { E.lcdCount.textContent = String(v).padStart(3, '0'); });
    }
    document.body.classList.toggle('steer', s.phase === 'cruise');
    this.updateGame(s, T);
  }

  // game HUD, pop-up callouts, police lights and the run-over panel — all derived from the frame state
  updateGame(s, T) {
    const E = this.el, C = this.cache, Gm = s.ui.g;
    const set = (k, v, fn) => { if (C[k] !== v) { C[k] = v; fn(v); } };
    const on = Gm && Gm.on && !Gm.free ? 1 : 0;
    set('gOn', on, (v) => { E.ghud.style.visibility = v ? 'visible' : 'hidden'; });
    set('gear', Gm && Gm.on ? Gm.gear : 0, (g) => { E.gear.textContent = g ? 'G' + g : ''; });
    if (on) {
      set('gScore', Gm.score, (v) => { E.gScore.textContent = v.toLocaleString('en-US'); });
      set('gMult', Gm.mult.toFixed(1), (v) => { E.gMult.textContent = '×' + v; });
      set('gCells', Gm.cells, (v) => { E.gCells.textContent = v; });
      set('gStars', Gm.star + (Gm.lives < 2 ? 'h' : ''), () => { E.gStars.dataset.n = Gm.star; E.gStars.dataset.hot = Gm.lives < 2 ? '1' : '0'; });
      set('gLv', Gm.level, (v) => { E.gLv.textContent = 'LV ' + v; E.gLv.dataset.hot = v >= 6 ? '2' : v >= 3 ? '1' : '0'; });
      set('gTapes', Gm.tapes, (v) => { E.gTapes.dataset.n = v; });
      set('gLives', Gm.over ? 0 : Gm.lives, (v) => { E.gLives.dataset.n = v; });
    }
    // callouts: the three most recent, newest on top; they rise and fade with their age
    set('popLow', on && s.phase === 'cruise' && s.ct < GAME.introT ? 1 : 0, (v) => E.gpops.classList.toggle('low', !!v));   // below the title while it leaves
    const pops = on ? Gm.pops.slice(-3).reverse() : [];
    for (let i = 0; i < 3; i++) {
      const el = E.pops[i], p = pops[i], key = 'pop' + i;
      if (!p) { set(key, '', () => { el.style.visibility = 'hidden'; }); continue; }
      const a = Math.min(1, p.age / 0.08) * (1 - smooth((p.age - 1.1) / 0.5));
      const sc = s.reduced ? 1 : 1 + 0.35 * Math.exp(-p.age / 0.07);
      set(key, p.id + '|' + a.toFixed(2) + '|' + i + '|' + sc.toFixed(2), () => {
        if (el.textContent !== p.text) el.textContent = p.text;
        el.dataset.tone = p.tone; el.style.visibility = a > 0.01 ? 'visible' : 'hidden'; el.style.opacity = a * (1 - i * 0.28);
        el.style.transform = `translate(-50%, ${(i * 1.6).toFixed(2)}em) scale(${sc.toFixed(3)})`;   // newest on top, older ones below it
      });
    }
    // the police on the tail: for good once a life is gone (until nitro shakes them off), or for a moment after lingering on the brake
    // … and, for a few seconds after a hit, what to do about it. After that the hearts and the nitro button carry it.
    const hint = on && !Gm.over && Gm.hint > 0.01 ? Gm.hint : 0, tail = hint > 0 ? hint : on && !Gm.over && Gm.close > 0.001 ? Gm.close : 0;
    set('tailText', hint > 0 ? 1 : 0, (v) => { E.gTailText.textContent = v ? 'NITRO SHAKES THEM OFF' : 'POLICE ON YOUR TAIL'; E.gTail.dataset.hint = v; });
    set('tailA', (hint > 0 ? hint : 1).toFixed(2), (v) => { E.gTail.style.opacity = v; });
    set('trbS', on && !Gm.over && Gm.lives < 2 && Gm.nstock > 0 ? '1' : '0', (v) => { E.turbo.dataset.shake = v; });       // a canister in stock on the last life: the nitro button wears a pink ring
    set('tail', tail.toFixed(3), () => { E.gTail.style.visibility = tail > 0 ? 'visible' : 'hidden'; E.gTailBar.style.transform = `scaleX(${(hint > 0 ? 0 : tail).toFixed(3)})`; });
    // police lights at the bottom corners, alternating red and blue: faint while they hang back, strong on the tail
    // (steady when motion is reduced)
    const lvl = !on || Gm.paused || Gm.rew ? 0 : Gm.over === 2 ? 1 : Gm.over ? 0 : Gm.pol ? 0.85 : 0.16 + 0.07 * Gm.star;
    const ph = s.reduced ? 0.5 : (T * (lvl > 0.5 ? 2.6 : 1.3)) % 1;
    let l = s.reduced ? lvl * 0.5 : lvl * (ph < 0.5 ? 1 : 0.12), r = s.reduced ? lvl * 0.5 : lvl * (ph < 0.5 ? 0.12 : 1);
    if (lvl && Gm.ic) { const fl = s.reduced ? 0.7 : (T * 6) % 1 < 0.5 ? 1 : 0.2; if (Gm.ic < 0) l = Math.max(l, fl); else r = Math.max(r, fl); }   // an interceptor on that shoulder: that corner flashes fast
    set('pol', lvl ? l.toFixed(2) + r.toFixed(2) : '', (v) => { E.police.style.visibility = v ? 'visible' : 'hidden'; if (v) { E.police.children[0].style.opacity = l; E.police.children[1].style.opacity = r; } });
    // run over
    const show = on && Gm.over && Gm.overU >= GAME.overLock ? Gm.run * 10 + Gm.over : 0;
    set('over', show, (v) => {
      E.over.hidden = !v;
      if (!v) return;
      const S = Gm.stats, best = Math.max(this.best, Gm.score), isNew = Gm.score > this.best && Gm.score > 0;
      this.last = Gm.score;
      if (isNew) { this.best = Gm.score; try { localStorage.setItem('mc86.best', String(this.best)); } catch (_) { /* not stored */ } }
      E.overTitle.textContent = Gm.over === 2 ? 'BUSTED' : 'WRECKED';
      E.ovScore.textContent = Gm.score.toLocaleString('en-US'); E.ovBest.textContent = best.toLocaleString('en-US'); E.ovBestL.textContent = isNew ? 'NEW BEST' : 'BEST';
      E.ovDist.textContent = (S.dist / 1000).toFixed(2) + ' KM'; E.ovSpeed.textContent = Math.round(S.vmax * GAME.mph) + ' MPH';
      E.ovCombo.textContent = S.best; E.ovNear.textContent = S.near; E.ovSmash.textContent = S.smash + ' · ' + S.dodges; E.ovStar.textContent = '★'.repeat(S.star) + '☆'.repeat(5 - S.star) + ' LV' + S.level;
      const can = Gm.tapes > 0;
      E.ovTapes.textContent = Gm.tapes === 1 ? '1 TAPE' : Gm.tapes + ' TAPES'; E.revive.disabled = !can; E.ovRk.hidden = !can;
      try { (can ? E.revive : E.home).focus({ preventScroll: true }); } catch (_) { /* focus is a convenience */ }
    });
    const pz = Gm && Gm.on && Gm.paused && !Gm.over ? 1 : 0;
    set('paused', pz, (v) => { E.paused.hidden = !v; if (v) { try { E.resume.focus({ preventScroll: true }); } catch (_) { /* focus is a convenience */ } } });
    set('pauseBtn', Gm && Gm.on && !Gm.over && !Gm.paused && !Gm.rew ? 1 : 0, (v) => E.pause.classList.toggle('on', !!v));
  }
}
