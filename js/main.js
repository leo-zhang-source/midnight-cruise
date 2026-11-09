// MIDNIGHT CRUISE — 1986 · boot, master clock, render loop, inspection API.
import * as THREE from '../vendor/three.module.min.js';
import { SEED } from './cue.js';
import { Timeline, CANONICAL } from './timeline.js';
import { World } from './world.js';
import { Title } from './title.js';
import { Post } from './post.js';
import { frameState, FRAME } from './director.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio/engine.js';

const Q = new URLSearchParams(location.search);
// framing tuning hook: ?frame.vWide=58&frame.carKWide=6 … overrides FRAME (js/director.js)
for (const [k, v] of Q) if (k.startsWith('frame.') && k.slice(6) in FRAME && isFinite(+v)) FRAME[k.slice(6)] = +v;
const reducedMQ = matchMedia('(prefers-reduced-motion: reduce)');
const app = { reduced: Q.get('reduced') === '1' || (Q.get('reduced') !== '0' && reducedMQ.matches) };
reducedMQ.addEventListener?.('change', (e) => { if (!Q.has('reduced')) app.reduced = e.matches; });

const canvas = document.getElementById('gl');
const fixedW = +Q.get('w') || 0, fixedH = +Q.get('h') || 0;
if (fixedW && fixedH) { Object.assign(canvas.style, { width: fixedW + 'px', height: fixedH + 'px' }); document.documentElement.style.cssText += `;width:${fixedW}px;height:${fixedH}px`; }

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: Q.has('capture') });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.autoClear = false;

const fontsReady = Promise.race([
  Promise.all(['600 64px "Chakra Petch"', '700 16px "Chakra Petch"', '400 20px "VT323"'].map((f) => document.fonts.load(f))),
  new Promise((r) => setTimeout(r, 1500)),
]);
await fontsReady;

const tl = new Timeline();
const world = new World(SEED);
const title = new Title();
const post = new Post(renderer);
const audio = new AudioEngine();
audio.prepare();

// ── master clock ──────────────────────────────────────────────────────────
const t0 = performance.now();
let drift = 0, frozen = Q.has('t'), frozenT = +Q.get('t') || 0;
const perfScene = (p = performance.now()) => (p - t0) / 1000 + drift;
const now = () => (frozen ? frozenT : perfScene());
let lastHeard = null, syncP = null, goodRate = 0;
function syncClock(p) {
  const heard = audio.heardSceneTime(p);
  if (heard === null || frozen || audio.status !== 'running') { lastHeard = null; goodRate = 0; return; }
  // follow the audio clock only while it advances at a believable real-time rate
  if (lastHeard !== null && p - syncP > 5) {
    const rate = (heard - lastHeard) / ((p - syncP) / 1000);
    goodRate = rate > 0.95 && rate < 1.05 ? Math.min(goodRate + 1, 30) : 0;
  }
  lastHeard = heard; syncP = p;
  if (goodRate < 10) return;
  // Slew (never jump) the picture clock towards the audio clock; ignore implausible readings.
  const err = heard - perfScene(p);
  if (Math.abs(err) < 0.2) drift += Math.max(-0.001, Math.min(0.001, err * 0.05));
}

app.tl = tl; app.audio = audio; app.now = now;
app.addEvent = (type, data = {}) => {
  const t = Math.max(now(), tl.frontier() - 1e-6);
  const ev = tl.add(type, t, data);
  audio.send(ev);
  return ev;
};
app.start = () => {
  if (tl.phaseAt(now()).phase !== 'idle') return;
  app.addEvent('start');
  audio.start(perfScene, () => tl.serialize());
};

if (Q.get('script') === 'canonical') tl.load(CANONICAL);
else if (Q.get('events')) { try { tl.load(JSON.parse(Q.get('events'))); } catch (e) { console.warn(e); } }

const ui = new UI(app);
for (const t of ['pointerdown', 'keydown', 'touchend']) addEventListener(t, () => audio.resume(), { capture: true, passive: true });

// ── sizing & adaptive quality ─────────────────────────────────────────────
const TIERS = [
  { budget: 3.2e6, msaa: 4, dpr: 2 },
  { budget: 2.1e6, msaa: 4, dpr: 1.5 },
  { budget: 1.3e6, msaa: 2, dpr: 1.25 },
  { budget: 0.75e6, msaa: 0, dpr: 1 },
];
const mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 600;
let tier = Q.has('tier') ? +Q.get('tier') : mobile ? 2 : 0;
let cssW = 0, cssH = 0, outW = 0, outH = 0;
function resize() {
  cssW = fixedW || innerWidth; cssH = fixedH || innerHeight;
  const T = TIERS[tier];
  const dpr = Q.has('capture') ? 1 : Math.min(devicePixelRatio || 1, T.dpr);
  renderer.setPixelRatio(dpr);
  renderer.setSize(cssW, cssH, false);
  outW = Math.round(cssW * dpr); outH = Math.round(cssH * dpr);
  const scale = Math.min(1, Math.sqrt(T.budget / (outW * outH)));
  post.setSize(outW, outH, scale, T.msaa);
}
addEventListener('resize', resize);
resize();

let ema = 16.7, lastP = 0, calm = 0, hot = 0, frames = 0;
function adapt(dt) {
  if (Q.has('capture') || Q.has('tier')) return;
  ema += (dt - ema) * 0.05;
  if (ema > 21) { hot += dt; calm = 0; } else if (ema < 12.5) { calm += dt; hot = 0; } else { hot = Math.max(0, hot - dt); calm = 0; }
  if (hot > 1200 && tier < TIERS.length - 1) { tier++; hot = 0; ema = 16; resize(); }
  if (calm > 6000 && tier > (mobile ? 1 : 0)) { tier--; calm = 0; resize(); }
}

// ── frame ─────────────────────────────────────────────────────────────────
const poster = document.getElementById('poster');
const hud = document.getElementById('hud');
if (Q.has('hud')) hud.hidden = false;
let firstFrame = true;
const stats = { frames: 0, dts: [], work: [] };
const syncPx = new Uint8Array(4);

function render(T) {
  const s = frameState(tl, T, outW, outH, { reduced: app.reduced });
  world.update(s, outW, outH);
  title.update(s, outW, outH);
  title.scene.updateMatrixWorld(true);
  const W2 = title.width / 2;
  const g = title.project(s.post.glint.tx - W2, s.post.glint.ty - 50);
  const f = title.project(s.post.flare.tx - W2, s.post.flare.ty - 50);
  // 180° shutter: while the title is flying, average 8 sub-frames across half a frame
  let subs = null;
  if (s.title.blur && !app.reduced) { const N = 8, SH = 1 / 120; subs = []; for (let k = 0; k < N; k++) subs.push(frameState(tl, T - (k * SH) / (N - 1), outW, outH, { reduced: false })); }
  post.render(world, title, s, g, f, subs);
  ui.update(s, T, cssW, cssH);
  return s;
}

function frame(p) {
  const dt = lastP ? p - lastP : 16.7; lastP = p;
  syncClock(p);
  if (!frozen) ui.pump();
  const T = now();
  let s;
  if (Q.has('perf')) {
    const a = performance.now(); s = render(T);
    const gl = renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPx);
    stats.work.push(performance.now() - a);
  } else s = render(T);
  if (firstFrame) { firstFrame = false; poster.remove(); window.__firstFrameMs = performance.now() - t0; }
  adapt(dt);
  if (Q.has('perf')) { stats.frames++; stats.dts.push(dt); }
  if (!hud.hidden && (frames++ % 6 === 0)) hud.textContent = `T ${T.toFixed(3)}  ${s.phase}${s.it !== null ? ' it ' + s.it.toFixed(3) : ''}${s.ct !== null ? ' ct ' + s.ct.toFixed(2) : ''}\nfps ${(1000 / ema).toFixed(0)}  tier ${tier}  ${outW}x${outH} → ${post.W}x${post.H}\nthr ${s.thr.toFixed(2)} steer ${s.steer.toFixed(2)} v ${s.road.vel.toFixed(1)}  audio ${audio.state}  ev ${tl.events.length}`;
  window.__ready = true;
  if (!Q.has('capture')) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ── inspection API (deterministic seek / replay / capture) ────────────────
window.MC = {
  tl, CANONICAL,
  seek(T) { frozen = true; frozenT = T; render(T); return T; },
  play() { frozen = false; drift = frozenT - (performance.now() - t0) / 1000; if (Q.has('capture')) requestAnimationFrame(frame); },
  events: () => tl.serialize(),
  load(list) { tl.events.length = 0; tl._invalidate(-Infinity); tl.load(list); },
  _r: renderer, _post: post, _world: world, _title: title, _audio: audio,
  stats, state: (T) => frameState(tl, T ?? now(), outW, outH, { reduced: app.reduced }),
  get tier() { return tier; },
};
