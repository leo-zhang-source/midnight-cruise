// The five designs for the energy-cell pickup sound, rendered with the game's own audio engine so they can be compared:
// each one alone, and in a run with the music, the engine and the road wind.
//   node tools/cell-sounds.mjs [outDir]   → <outDir>/cell-<k>-solo.wav, cell-<k>-game.wav (48 kHz stereo) and their levels
import { Synth, CELL_SOUNDS } from '../js/audio/synth.js';
import { SR } from '../js/cue.js';
import { SAMPLE_FILES } from '../js/audio/samples.js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { play } from './bot.mjs';

const out = process.argv[2] || fileURLToPath(new URL('../renders/cell-sounds', import.meta.url));
mkdirSync(out, { recursive: true });
function readWav(path) {
  const b = readFileSync(path); let o = 12, fmt = null, data = null;
  while (o < b.length) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4); if (id === 'fmt ') fmt = { ch: b.readUInt16LE(o + 10) }; if (id === 'data') data = b.subarray(o + 8, o + 8 + sz); o += 8 + sz + (sz & 1); }
  const n = data.length / (2 * fmt.ch), L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = data.readInt16LE(i * 2 * fmt.ch) / 32768; R[i] = fmt.ch > 1 ? data.readInt16LE(i * 2 * fmt.ch + 2) / 32768 : L[i]; }
  return { L, R };
}
const SAMPLES = Object.fromEntries(SAMPLE_FILES.map((n) => [n, readWav(fileURLToPath(new URL(`../assets/samples/${n}.wav`, import.meta.url)))]));
function wav16(path, L, R) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4); buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4); }
  writeFileSync(path, buf);
}
// the pattern: two single cells, a line of five as they come at cruising speed, a line of five at nitro speed, and one more
const PATTERN = [0, 0.7, ...[0, 1, 2, 3, 4].map((i) => 1.5 + i * 0.12), ...[0, 1, 2, 3, 4].map((i) => 2.7 + i * 0.07), ...[0, 1, 2, 3, 4].map((i) => 3.4 + i * 0.07), 4.3];
const LEN = 5.2;
function render(events, from, sfx) {
  const s = new Synth();
  for (const [n, b] of Object.entries(SAMPLES)) s.setSample(n, b.L, b.R);
  for (const e of events) s.event(e);
  let q = 90000; for (const e of sfx) s.event({ ...e, seq: q++ });
  const N = Math.round((from + LEN) * SR), L = new Float32Array(N), R = new Float32Array(N), bl = new Float32Array(128), br = new Float32Array(128);
  for (let f = 0; f < N; f += 128) { const n = Math.min(128, N - f); s.process(bl, br, n); L.set(bl.subarray(0, n), f); R.set(br.subarray(0, n), f); }
  const a = Math.round(from * SR); return { L: L.subarray(a), R: R.subarray(a) };
}
const cells = (k, at) => PATTERN.map((t, i) => ({ type: 'sfx', t: at + 0.4 + t, name: 'cell', p: { k, pan: i % 2 ? 0.18 : -0.18 } }));
const db = (x) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf');
const peak = (a) => { let m = 0; for (let i = 0; i < a.L.length; i++) m = Math.max(m, Math.abs(a.L[i]), Math.abs(a.R[i])); return m; };
const loud = (a) => { let best = 0; const W = Math.round(0.05 * SR); for (let i = 0; i + W <= a.L.length; i += W >> 1) { let sq = 0; for (let j = i; j < i + W; j++) sq += a.L[j] * a.L[j] + a.R[j] * a.R[j]; best = Math.max(best, Math.sqrt(sq / (2 * W))); } return best; };
// in the game: a clean bot run, 40 s in (third gear, the music going)
const run = play(2024, 50, {}), GAME_AT = 1.9 + 40;
const musicOnly = render(run.ev, GAME_AT, []);
let rms = 0; for (let i = 0; i < musicOnly.L.length; i++) rms += musicOnly.L[i] ** 2 + musicOnly.R[i] ** 2; rms = Math.sqrt(rms / (2 * musicOnly.L.length));
wav16(`${out}/game-without.wav`, musicOnly.L, musicOnly.R);
console.log(`the game without it: ${db(rms)} dB RMS`);
for (const k of Object.keys(CELL_SOUNDS)) {
  const solo = render([], 0.2, cells(k, 0.2)), game = render(run.ev, GAME_AT, cells(k, GAME_AT));
  wav16(`${out}/cell-${k}-solo.wav`, solo.L, solo.R); wav16(`${out}/cell-${k}-game.wav`, game.L, game.R);
  console.log(`${k} · ${CELL_SOUNDS[k].padEnd(8)} alone: peak ${db(peak(solo)).padStart(6)} dB, loudest 50 ms ${db(loud(solo)).padStart(6)} dB (${(20 * Math.log10(loud(solo) / rms)).toFixed(1)} dB against the game) · in the game: peak ${db(peak(game))} dB`);
}
