// Levels of the game's sound effects against the music: each one is rendered alone over a cruising run and compared with the
// same stretch without it (peak and RMS of the difference, and of the mix).   node tools/sfx-check.mjs [name,name,…]
import { Synth } from '../js/audio/synth.js';
import { SR } from '../js/cue.js';
const LIST = {
  smash1: ['smash', { v: 0.9, n: 1 }], smash5: ['smash', { v: 0.9, n: 5, tier: 2 }], smash10: ['smash', { v: 1, n: 10, big: 1 }], smash12: ['smash', { v: 1.05, n: 12, big: 1, tier: 4 }],
  bank2: ['bank', { n: 2 }], bank10: ['bank', { n: 10 }], fling: ['fling', { pan: 0.8 }], outrun: ['outrun', { pan: -0.8 }], hit: ['hit', {}],
  tally: ['tally', { n: 3 }], total: ['total', {}], stamp: ['stamp', { g: 3 }], fanfare: ['fanfare', {}],
  near: ['near', {}], wreck: ['wreck', {}], crashfx: ['crashfx', {}], chime: ['chime', {}],
};
const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(LIST);
const T0 = 12, LEN = 1.2;
function render(sfx) {
  const s = new Synth();
  s.event({ type: 'start', t: 1, seed: 7, free: 1 }); s.event({ type: 'skip', t: 1.5 });
  if (sfx) s.event({ type: 'sfx', t: T0, seq: 9999, name: sfx[0], p: sfx[1] });
  const N = Math.round((T0 + LEN) * SR), L = new Float32Array(N), R = new Float32Array(N), bl = new Float32Array(128), br = new Float32Array(128);
  for (let f = 0; f < N; f += 128) { const n = Math.min(128, N - f); s.process(bl, br, n); L.set(bl.subarray(0, n), f); R.set(br.subarray(0, n), f); }
  return { L: L.subarray(Math.round(T0 * SR)), R: R.subarray(Math.round(T0 * SR)) };
}
const db = (x) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf');
const base = render(null);
const stat = (a, b) => { let pk = 0, sq = 0, bad = 0; for (let i = 0; i < a.L.length; i++) { const l = a.L[i] - (b ? b.L[i] : 0), r = a.R[i] - (b ? b.R[i] : 0); if (!Number.isFinite(l) || !Number.isFinite(r)) bad++; pk = Math.max(pk, Math.abs(l), Math.abs(r)); sq += l * l + r * r; } return { pk, rms: Math.sqrt(sq / (2 * a.L.length)), bad }; };
const m = stat(base);
console.log(`music alone      peak ${db(m.pk)} dBFS  rms ${db(m.rms)} dBFS`);
for (const k of only) {
  const r = render(LIST[k]), d = stat(r, base), mix = stat(r);
  // the effect's own level: RMS over its loudest 100 ms
  let best = 0; const W = Math.round(0.1 * SR);
  for (let i = 0; i + W <= r.L.length; i += W >> 1) { let sq = 0; for (let j = i; j < i + W; j++) { const l = r.L[j] - base.L[j], q = r.R[j] - base.R[j]; sq += l * l + q * q; } best = Math.max(best, Math.sqrt(sq / (2 * W))); }
  console.log(`${k.padEnd(10)} effect peak ${db(d.pk).padStart(6)}  loudest 100 ms ${db(best).padStart(6)}  (music ${(20 * Math.log10(best / m.rms)).toFixed(1).padStart(5)} dB)  mix peak ${db(mix.pk).padStart(6)}${d.bad || mix.bad ? '  NaN!' : ''}${mix.pk > 0.999 ? '  CLIPS' : ''}`);
}
