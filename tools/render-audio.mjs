// Offline reference renders of the exact same engine that runs in the AudioWorklet.
// Usage: node tools/render-audio.mjs [outDir]
// Writes 48 kHz / 24-bit stereo WAVs and measures them with ffmpeg's EBU R128 meter
// (integrated loudness + 4x-oversampled true peak).
import { Synth } from '../js/audio/synth.js';
import { SR } from '../js/cue.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { SAMPLE_FILES } from '../js/audio/samples.js';

// Load the CC0 sample set exactly as the browser does (48 kHz stereo 16-bit WAV → Float32).
function readWav(path) {
  const b = readFileSync(path); let o = 12, fmt = null, data = null;
  while (o < b.length) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4); if (id === 'fmt ') fmt = { ch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) }; if (id === 'data') data = b.subarray(o + 8, o + 8 + sz); o += 8 + sz + (sz & 1); }
  const n = data.length / (2 * fmt.ch), L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = data.readInt16LE(i * 2 * fmt.ch) / 32768; R[i] = fmt.ch > 1 ? data.readInt16LE(i * 2 * fmt.ch + 2) / 32768 : L[i]; }
  return { L, R };
}
const SAMPLES = Object.fromEntries(SAMPLE_FILES.map((n) => [n, readWav(fileURLToPath(new URL(`../assets/samples/${n}.wav`, import.meta.url)))]));

const out = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null) || fileURLToPath(new URL('../renders/audio', import.meta.url));
mkdirSync(out, { recursive: true });

function render(events, from, to) {
  const s = new Synth();
  for (const [n, b] of Object.entries(SAMPLES)) s.setSample(n, b.L, b.R);
  for (const e of events) s.event(e);
  const N = Math.round((to - 0) * SR), start = Math.round(from * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  const bl = new Float32Array(128), br = new Float32Array(128);
  let grMax = 0, grOver1 = 0, grN = 0;
  const t0 = performance.now();
  for (let f = 0; f < N; f += 128) {
    const n = Math.min(128, N - f);
    s.process(bl, br, n);
    L.set(bl.subarray(0, n), f); R.set(br.subarray(0, n), f);
    if (f >= start) { const g = s.lim.g ?? 1; const db = -20 * Math.log10(g); grMax = Math.max(grMax, db); if (db > 1) grOver1 += n; grN += n; }
  }
  const ms = performance.now() - t0;
  return { L: L.subarray(start), R: R.subarray(start), rtf: (to / (ms / 1000)), grMax, grPct: 100 * grOver1 / grN };
}
function wav24(path, L, R) {
  const n = L.length, buf = Buffer.alloc(44 + n * 6);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 6, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 6, 28); buf.writeUInt16LE(6, 32); buf.writeUInt16LE(24, 34); buf.write('data', 36); buf.writeUInt32LE(n * 6, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (const c of [L[i], R[i]]) {
    const v = Math.max(-8388608, Math.min(8388607, Math.round(c * 8388607)));
    buf.writeIntLE(v, o, 3); o += 3;
  }
  writeFileSync(path, buf);
}
function measure(path) {
  let txt = '';
  try { execFileSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] }); }
  catch (e) { txt = String(e.stderr || ''); }
  const res = execFileSync('sh', ['-c', `ffmpeg -hide_banner -nostats -i "${path}" -af ebur128=peak=true:framelog=quiet -f null - 2>&1 | tail -14`]).toString();
  const I = +(/I:\s+(-?[\d.]+) LUFS/.exec(res) || [])[1];
  const LRA = +(/LRA:\s+(-?[\d.]+) LU/.exec(res) || [])[1];
  const TP = +(/Peak:\s+(-?[\d.]+) dBFS/.exec(res) || [])[1];
  return { I, LRA, TP };
}

const START = 1.0;
// --segment <from> <to> <out.wav>: render the canonical START-at-1.0 timeline for a span (used by export-video).
const segIdx = process.argv.indexOf('--segment');
if (segIdx > 0) {
  const [from, to, outPath] = [+process.argv[segIdx + 1], +process.argv[segIdx + 2], process.argv[segIdx + 3]];
  const r = render([{ type: 'start', t: START }], from, to);
  wav24(outPath, r.L, r.R);
  console.log('segment', from, to, '→', outPath, JSON.stringify(measure(outPath)));
  process.exit(0);
}
const scenarios = {
  // 1) The authored ignition: exactly 10.000 s from START DRIVE.
  ignition: { events: [{ type: 'start', t: START }], from: START, to: START + 10 },
  // 2) Reference cruise mix: one full 64 s form cycle at cruising speed, SUNSET preset, no input.
  cruise_ref: { events: [{ type: 'start', t: START }], from: START + 10, to: START + 10 + 64 },
  // 3) Loudest interactive combination: full throttle + turbo + AFTERGLOW (heaviest preset) + UI SFX bursts.
  loudest: {
    events: [
      { type: 'start', t: START }, { type: 'env', t: START + 10.5, preset: 2 },
      { type: 'thr', t: START + 11, on: true }, { type: 'turbo', t: START + 14.2 }, { type: 'turbo', t: START + 21.3 },
      ...Array.from({ length: 24 }, (_, k) => ({ type: 'sfx', t: START + 14 + k * 0.5, name: ['click', 'clunk', 'select', 'chime'][k % 4] })),
    ],
    from: START + 12, to: START + 28,
  },
};

const report = {};
for (const [name, sc] of Object.entries(scenarios)) {
  const r = render(sc.events, sc.from, sc.to);
  const p = join(out, `${name}.wav`);
  wav24(p, r.L, r.R);
  const m = measure(p);
  report[name] = { seconds: +(r.L.length / SR).toFixed(3), ...m, renderSpeed: `${r.rtf.toFixed(1)}x realtime`, limiterMaxGRdB: +r.grMax.toFixed(2), limiterOver1dBPct: +r.grPct.toFixed(1) };
  console.log(name.padEnd(11), JSON.stringify(report[name]));
}
writeFileSync(join(out, 'loudness.json'), JSON.stringify(report, null, 2));
