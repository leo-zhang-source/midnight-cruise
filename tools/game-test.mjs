// Unit tests for the game simulation (no browser): determinism, crash, retry, rewind-revive, sideswipe,
// nitro, wanted level, free mode and audio-thread parity.   node tools/game-test.mjs
import { Timeline } from '../js/timeline.js';
import { Synth } from '../js/audio/synth.js';
import { GAME } from '../js/cue.js';
import { NV, VF } from '../js/game.js';
import { play } from './bot.mjs';
const ok = (n, c, i = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`); if (!c) process.exitCode = 1; };
const C = 1.9;   // cruise start of the test timelines (start 1.0, skip 1.5, 0.4 s fast-forward)
const fresh = (seed = 7, extra = {}) => { const tl = new Timeline(); tl.add('start', 1, { seed, ...extra }); tl.add('skip', 1.5); return tl; };
const sig = (st) => JSON.stringify([st.pos.toFixed(6), st.vel.toFixed(6), st.x.toFixed(6), st.over, st.run, st.tapes, st.g.gd.toFixed(6), Math.round(st.g.score), st.g.cells, st.g.combo, st.g.heat.toFixed(4), [...st.g.veh].map((v) => +v.toFixed(4))]);

// 1 · determinism: the same events give the same game, whatever order the timeline is queried in
{
  const r = play(4242, 75, { nitro: true });
  const a = new Timeline(); a.load(r.ev); const b = new Timeline(); b.load(r.ev);
  b.stateAt(60); b.stateAt(12); b.stateAt(41.37); b.stateAt(5);
  const T = C + 74;
  ok('deterministic regardless of seek order', sig(a.stateAt(T)) === sig(b.stateAt(T)), `score ${Math.round(a.stateAt(T).g.score)}, ${r.ev.length} events`);
  ok('late-arriving event re-simulates to the same result', (() => { const c = new Timeline(); const evs = r.ev.slice(); const lateIdx = evs.findIndex((e) => e.type === 'lane' && e.t > 20); const late = evs.splice(lateIdx, 1)[0]; c.load(evs); c.stateAt(late.t + 0.4); c.add(late.type, late.t, late); return sig(c.stateAt(T)) === sig(a.stateAt(T)); })());
  // 9 · the audio thread runs the same simulation
  const s = new Synth(); for (const e of r.ev) s.event(e);
  const L = new Float32Array(128), R = new Float32Array(128);
  for (let f = 0; f < Math.round(30 * 48000 / 128); f++) s.process(L, R, 128);
  const Ta = s.offset + s.frame / 48000;
  ok('audio-thread timeline matches the picture timeline', sig(s.tl.stateAt(Ta)) === sig(a.stateAt(Ta)), `at ${Ta.toFixed(2)} s`);
}

// 2 · no input: the first truck is in our lane → crash; 3 · retry starts run 2
{
  const tl = fresh();
  let st = tl.stateAt(C + 12);
  const ev = tl.gameEvents(0, C + 12).map((e) => e.k);
  ok('driving straight on crashes into the first truck', st.over === 1 && ev.includes('crash'), `over at ${(st.overT - C).toFixed(2)} s, speed now ${st.vel.toFixed(2)}`);
  ok('the car stops after a crash', Math.abs(st.vel) < 0.5 && st.thr < 0.05);
  const overT = st.overT, score = st.g.score;
  tl.add('lane', overT + 0.3, { dir: 1 }); tl.add('thr', overT + 0.3, { on: true });
  ok('inputs are ignored while the run is over', tl.stateAt(overT + 0.6).lane === 0 && tl.stateAt(overT + 0.6).thr < 0.05);
  tl.add('retry', overT + 0.2);
  ok('retry is locked for the first 0.7 s', tl.stateAt(overT + 0.6).over === 1);
  tl.add('thr', overT + 0.9, { on: false }); tl.add('retry', overT + 1.0);
  st = tl.stateAt(overT + 3);
  ok('retry starts a fresh run', st.over === 0 && st.run === 2 && st.g.score < score && st.g.gd > 30 && st.tapes === GAME.tapesStart, `run ${st.run}, distance ${st.g.gd.toFixed(0)}`);
}

// 4 · rewind-revive: a tape restores the game from about three seconds before the crash
{
  const tl = fresh();
  for (const [t, d] of [[3.0, 1], [5.2, -1]]) tl.add('lane', C + t, { dir: d });   // dodge the first truck, then drift back
  let st = tl.stateAt(C + 40); const overT = st.overT;
  ok('setup: the run ends in a crash after a few rows', st.over === 1 && overT - C > 5, `crash at ${(overT - C).toFixed(2)} s`);
  const gdCrash = st.g.gd;
  const b3 = tl.stateAt(overT - 3), before = { gd: b3.g.gd, score: b3.g.score };   // copy: the returned game state is live
  tl.add('revive', overT + 1.0);
  st = tl.stateAt(overT + 1.0 + GAME.reviveHold / 2);
  ok('revive: rewind transition (road runs backwards, game on hold)', st.over === 0 && st.vel < -20 && st.tapes === GAME.tapesStart - 1 && st.rev === 1);
  st = tl.stateAt(overT + 1.0 + GAME.reviveHold + 0.3);
  ok('revive: resumes about 3 s before the crash, invulnerable', st.over === 0 && st.g.gd < gdCrash - 60 && Math.abs(st.g.gd - before.gd) < 60 && st.g.inv > st.g.gt, `distance ${st.g.gd.toFixed(0)} (3 s before: ${before.gd.toFixed(0)}, at the crash: ${gdCrash.toFixed(0)}), over ${st.over}, inv ${(st.g.inv - st.g.gt).toFixed(2)} s`);
  ok('revive: the score is kept from the restore point', Math.abs(st.g.score - before.score) < 600);
  const st2 = tl.stateAt(overT + 30);
  if (st2.over) { tl.add('revive', st2.overT + 1.0); ok('no tape left: a second revive is refused', tl.stateAt(st2.overT + 2.5).over === 1); }
  else ok('no tape left: a second revive is refused', true, 'skipped: still alive');
}

// 5 · sideswipe: changing lane into a vehicle alongside bounces back and raises the wanted level
{
  const r = play(99, 60);
  const tl = new Timeline(); tl.load(r.ev);
  let hit = null;
  for (let T = C + 6; T < C + 58 && !hit; T += 0.02) {
    const st = tl.stateAt(T), g = st.g;
    if (st.xv * st.xv > 0.01) continue;
    for (let i = 0; i < NV; i++) { const o = i * VF; if (g.veh[o] !== 1) continue; const dz = g.veh[o + 2] - g.gd, dl = g.veh[o + 1] - st.lane; if (Math.abs(dz) < 2 && Math.abs(dl) === 1) hit = { T, dir: dl, lane: st.lane }; }
  }
  const t2 = new Timeline(); t2.load(r.ev.filter((e) => e.t < hit.T)); t2.add('lane', hit.T, { dir: hit.dir });
  const st = t2.stateAt(hit.T + 0.8), ev = t2.gameEvents(hit.T, hit.T + 0.8).map((e) => e.k);
  ok('sideswipe bounces back to the lane we came from', ev.includes('swipe') && !st.over && st.lane === hit.lane && Math.abs(st.x - hit.lane * 4) < 0.6, `events ${ev.join(',')}`);
  ok('sideswipe raises the wanted level and resets the combo', st.g.lvl === 1 && st.g.combo <= 3 && ev.includes('heat'));
  const cool = t2.stateAt(hit.T + GAME.heatHold + GAME.heatDecay + 1.5);
  ok('wanted level cools down when nothing happens', cool.over !== 0 || cool.g.lvl === 0, `heat ${cool.g.heat.toFixed(2)}`);
  // four sideswipes in a row → busted
  const t3 = new Timeline(); t3.load(r.ev.filter((e) => e.t < hit.T));
  t3.stateAt(hit.T - 0.004); t3._st.g.heat = 3; t3._st.g.heatGt = t3._st.g.gt;   // put the run at wanted level 3
  t3.add('lane', hit.T, { dir: hit.dir });
  const b = t3.stateAt(hit.T + 0.8), bev = t3.gameEvents(hit.T, hit.T + 0.8).map((e) => e.k);
  ok('a sideswipe at wanted level 3 ends the run (busted)', b.over === 2 && bev.includes('bust'), `over kind ${b.over}, events ${bev.join(',')}`);
}

// 6 · nitro: needs a full charge, smashes through traffic, speed boost
{
  const tl = fresh();
  tl.add('turbo', C + 2.0);
  ok('nitro is refused without a full charge', tl.turboAt(C + 2.5) === null && tl.turboReady(C + 2.5) < 1);
  const r = play(31337, 90, { nitro: true });
  const t2 = new Timeline(); t2.load(r.ev);
  const ns = t2.nitros(C + 90);
  ok('nitro fires once charged (bot run)', ns.length >= 1, `${ns.length} bursts, ${r.g.smash} smashed`);
  if (ns.length) {
    const n0 = ns[0], st = t2.stateAt(n0.I + 1.0), base = t2.stateAt(n0.p - 0.1).vel;
    ok('nitro impact lands on the half-beat grid, 0.2–0.45 s after the press', n0.I - n0.p >= 0.2 - 1e-9 && n0.I - n0.p <= 0.45 + 1e-9 && Math.abs(((n0.I - C) / 0.25) - Math.round((n0.I - C) / 0.25)) < 1e-6, `wind-up ${(n0.I - n0.p).toFixed(3)} s`);
    ok('nitro boosts the speed to about 2.6×', st.vel > base * 2.2, `${base.toFixed(0)} → ${st.vel.toFixed(0)} u/s`);
    ok('charge is spent and nitro cannot overlap', t2.turboReady(n0.I + 0.5) === 0);
  }
  ok('nitro smashes vehicles instead of crashing', r.g.smash > 0 && !r.stats.over, `${r.g.smash} smashed, heat max ${r.g.heatMax}`);
}

// 7 · gears and score
{
  const r = play(5, 120);
  ok('gears engage with distance', r.g.gear >= 3 && r.st.vel > GAME.gears[r.g.gear] - 1, `gear ${r.g.gear + 1} at ${Math.round(r.g.gd)} units, ${r.st.vel.toFixed(0)} u/s`);
  ok('score, cells and overtakes accumulate', r.g.score > 10000 && r.g.cells > 50 && r.g.passed > 40, `score ${Math.round(r.g.score)}, cells ${r.g.cells}, passed ${r.g.passed}`);
  const tapes = r.st.tapes;
  ok('100 cells earn a spare tape (max 3)', tapes === Math.min(GAME.maxTapes, GAME.tapesStart + Math.floor(r.g.cells / GAME.tapeEvery)), `${tapes} tapes`);
}

// 8 · free mode (?free=1): no traffic, never over, nitro recharges on a timer
{
  const tl = fresh(7, { free: 1 });
  const st = tl.stateAt(C + 60);
  ok('free mode: no traffic and no game over', st.over === 0 && [...st.g.veh].every((v, i) => i % VF !== 0 || v === 0) && st.g.gd > 1500);
  tl.add('turbo', C + 61);
  ok('free mode: nitro available and recharging', tl.turboAt(C + 61.5) !== null && tl.turboReady(C + 61.5) === 0 && tl.turboReady(C + 66) < 1 && tl.turboReady(C + 61 + 7.2) >= 1 - 1e-9);
}

// 10 · REPLAY INTRO starts a new run at the next cruise
{
  const tl = fresh();
  tl.add('replay', C + 8);
  const mid = tl.stateAt(C + 8 + 5), st = tl.stateAt(C + 8 + 0.6 + 10 + 2);
  ok('replay: no game during the intro, a new run after it', mid.over === 0 && st.run === 2 && st.over === 0 && st.g.gd > 20 && st.g.gd < 120, `run ${st.run}, distance ${st.g.gd.toFixed(0)}`);
}

// 11 · pause: the game clock stops (VCR pause), the car halts, inputs are ignored; resume carries on
{
  const tl = fresh(); tl.add('pause', C + 2, { on: true });
  const a = tl.stateAt(C + 3), gt1 = a.g.gt, gd1 = a.g.gd;
  tl.add('lane', C + 4, { dir: 1 }); tl.add('turbo', C + 4.5);
  const b = tl.stateAt(C + 8);
  ok('pause: game clock and traffic stop, the car halts, inputs are ignored', b.paused === 1 && b.g.gt === gt1 && Math.abs(b.g.gd - gd1) < 1e-9 && Math.abs(b.vel) < 0.5 && b.lane === 0 && !b.over, `game time ${b.g.gt.toFixed(2)} s after 6 s paused`);
  tl.add('pause', C + 9, { on: false });
  const c = tl.stateAt(C + 9 + 5);
  ok('resume: the run continues from where it stopped', c.paused === 0 && c.over === 1 && c.overT - (C + 9) > 2.5 && c.overT - (C + 9) < 4.5, `crash ${(c.overT - C - 9).toFixed(2)} s after resuming (2.0 s were driven before the pause)`);
}
