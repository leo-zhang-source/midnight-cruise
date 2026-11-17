// How hard each kind of hit shakes the picture: the peak lens shift (as a share of the screen's height), camera roll and hit-stop,
// from the director's own frames around staged moments.   node tools/shake-check.mjs
import { scenarios } from './juice.mjs';
import { Timeline } from '../js/timeline.js';
import { frameState } from '../js/director.js';
const S = scenarios();
const row = (name, ev, t, reduced = false) => {
  const tl = new Timeline(); tl.load(ev);
  const base = frameState(tl, t - 0.05, 1280, 720, { reduced });
  let sx = 0, sy = 0, roll = 0, hold = 0, last = null;
  for (let u = 0.002; u < 0.9; u += 1 / 120) {
    const s = frameState(tl, t + u, 1280, 720, { reduced });
    sx = Math.max(sx, Math.abs(s.cam.shiftX)); sy = Math.max(sy, Math.abs(s.cam.shift - base.cam.shift)); roll = Math.max(roll, Math.abs(s.cam.roll - base.cam.roll));
    if (last !== null && s.t - last < 0.004) hold += 1 / 120; last = s.t;
  }
  // lens shift is in NDC: 1 = half the screen
  console.log(`${name.padEnd(34)} sideways ${(sx * 50).toFixed(1).padStart(5)} %   up/down ${(sy * 50).toFixed(1).padStart(5)} %   roll ${(roll * 57.3).toFixed(1).padStart(4)}°   picture held ${(hold * 1000).toFixed(0).padStart(3)} ms`);
  return { sx, sy, roll, hold };
};
const R = {};
R.smash1 = row('nitro smash, first link', S.chain.ev, S.chain.at[0]);
R.smashN = row(`nitro smash, link ${S.chain.n}`, S.chain.ev, S.chain.at[S.chain.at.length - 1]);
R.fling = row('interceptor thrown off', S.fling.ev, S.fling.at[0]);
R.hit = row(`first hit (${S.swipe.note.split(': ')[1]})`, S.swipe.ev, S.swipe.at[0]);
R.crash = row('the crash that ends the run', S.crash.ev, S.crash.at[0]);
R.crashR = row('… with reduced motion', S.crash.ev, S.crash.at[0], true);
const ok = (n, c) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}`); if (!c) process.exitCode = 1; };
ok('a crash throws the picture at least 6 % of its height and rolls it over 2°', Math.max(R.crash.sx, R.crash.sy) * 50 >= 6 && R.crash.roll * 57.3 >= 2);
ok('a hit that costs a life shakes at least 3 % of the height', Math.max(R.hit.sx, R.hit.sy) * 50 >= 3);
ok('a smash shakes less than a hit, a later link more than the first', Math.max(R.smash1.sx, R.smash1.sy) < Math.max(R.hit.sx, R.hit.sy) && Math.max(R.smashN.sx, R.smashN.sy) > Math.max(R.smash1.sx, R.smash1.sy));
ok('reduced motion: under half the shake', Math.max(R.crashR.sx, R.crashR.sy) < 0.5 * Math.max(R.crash.sx, R.crash.sy));
