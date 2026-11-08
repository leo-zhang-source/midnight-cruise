// Unit test for automatic environment switching (time OR distance), determinism and audio parity.
import { Timeline } from '../js/timeline.js';
import { Synth } from '../js/audio/synth.js';
const ok = (n, c, i = '') => console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const auto = (tl, T) => tl.envChanges(T).filter((e) => e.auto).map((e) => `${e.t.toFixed(2)}→${e.preset}`);
// 1) cruising only: the time rule fires first (cruise starts at 11 s)
let tl = new Timeline(); tl.add('start', 1);
let a = auto(tl, 140); ok('time rule: switches every 40 s of cruising', a.length === 3 && Math.abs(parseFloat(a[0]) - 51) < 0.01, a.join(' '));
// 2) full throttle: the distance rule fires first
tl = new Timeline(); tl.add('start', 1); tl.add('thr', 12, { on: true });
a = auto(tl, 60); ok('distance rule: accelerating switches sooner', a.length >= 1 && parseFloat(a[0]) < 45, a.join(' '));
// 3) a manual choice restarts the countdown and the cycle continues from it
tl = new Timeline(); tl.add('start', 1); tl.add('env', 30, { preset: 2 });
a = auto(tl, 75); ok('manual preset restarts the countdown', a.length === 1 && Math.abs(parseFloat(a[0]) - 70) < 0.01 && a[0].endsWith('→3'), a.join(' '));
// 4) AUTO off stops switching; back on restarts the timer
tl = new Timeline(); tl.add('start', 1); tl.add('auto', 20, { on: false }); tl.add('auto', 80, { on: true });
a = auto(tl, 125); ok('AUTO off pauses, on resumes with a fresh timer', a.length === 1 && Math.abs(parseFloat(a[0]) - 120) < 0.01, a.join(' '));
// 5) no switching during ignition / rewind; replay resets
tl = new Timeline(); tl.add('start', 1); tl.add('replay', 45);
a = auto(tl, 100); ok('ignition and replay reset the countdown', a.length === 1 && Math.abs(parseFloat(a[0]) - (45.6 + 10 + 40)) < 0.02, a.join(' '));
// 6) determinism: same events → same switches, regardless of query order
const ev = [{ type: 'start', t: 1 }, { type: 'thr', t: 14, on: true }, { type: 'thr', t: 30, on: false }, { type: 'turbo', t: 40 }];
const t1 = new Timeline(); t1.load(ev); const t2 = new Timeline(); t2.load(ev);
t2.stateAt(90); t2.stateAt(20); t2.stateAt(55);
ok('deterministic regardless of seek order', JSON.stringify(auto(t1, 200)) === JSON.stringify(auto(t2, 200)), auto(t1, 200).join(' '));
// 7) the audio engine sees the same switch (music layers follow)
const s = new Synth(); s.event({ type: 'start', t: 1 });
const L = new Float32Array(128), R = new Float32Array(128);
for (let f = 0; f < Math.round(53.5 * 48000 / 128); f++) s.process(L, R, 128);
const w = s.tl.envWeights(53.5).map((v) => +v.toFixed(2));
ok('audio timeline crossfades to the next preset', w[1] > 0.99, JSON.stringify(w));
