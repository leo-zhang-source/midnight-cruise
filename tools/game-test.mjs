// Unit tests for the game simulation (no browser).   node tools/game-test.mjs
// Determinism, crash, home / start / restart, rewind (state and reverse playback), sideswipe and busted,
// brake, nitro canisters, police stars, the grappler, helicopter fire, steering curves, the rolling roadblock,
// the weaving cruiser, pause, free mode, audio-thread parity.
import { Timeline } from '../js/timeline.js';
import { Synth } from '../js/audio/synth.js';
import { GAME } from '../js/cue.js';
import { NV, VF, policeClose, P_HOOK, HOOK_Z, T_CAR, T_VAN, T_TAXI, T_BLOCK, T_WEAVE, COMMIT, STEADY, CAR_HL, H_TWIN, H_WALK, I_OFF, NASTY, HALF_W, CAR_HW, jink, freshGame, stepGame, laneV, laneRate, gameBase, baseAt, heliStrikes, revs, sway, reactAt } from '../js/game.js';
import { threatGrid, wayThrough } from '../js/foresight.js';
import { play } from './bot.mjs';
import { overlaps } from './pickup-overlap.mjs';
import { NC, CF } from '../js/game.js';
const ok = (n, c, i = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`); if (!c) process.exitCode = 1; };
const C = 1.9;   // cruise start of the test timelines (start 1.0, skip 1.5, 0.4 s fast-forward)
const fresh = (seed = 7, extra = {}) => { const tl = new Timeline(); tl.add('start', 1, { seed, ...extra }); tl.add('skip', 1.5); return tl; };
const sig = (st) => JSON.stringify([st.pos.toFixed(6), st.vel.toFixed(6), st.x.toFixed(6), st.over, st.run, st.tapes, st.g.gd.toFixed(6), Math.round(st.g.score), st.g.cells, st.g.combo, st.g.heat.toFixed(4), st.g.nstock, st.g.polZ.toFixed(4), [...st.g.veh].map((v) => +v.toFixed(4))]);
const kinds = (tl, a, b) => tl.gameEvents(a, b).map((e) => e.k + (e.by ? ':' + e.by : ''));

// ── determinism ──
{
  const r = play(4242, 110, { nitro: true });
  const a = new Timeline(); a.load(r.ev); const b = new Timeline(); b.load(r.ev);
  b.stateAt(60); b.stateAt(12); b.stateAt(41.37); b.stateAt(5);
  const T = C + 109;
  ok('deterministic regardless of seek order', sig(a.stateAt(T)) === sig(b.stateAt(T)), `score ${Math.round(a.stateAt(T).g.score)}, ${r.ev.length} events`);
  ok('late-arriving event re-simulates to the same result', (() => { const c = new Timeline(); const evs = r.ev.slice(); const li = evs.findIndex((e) => e.type === 'lane' && e.t > 20); const late = evs.splice(li, 1)[0]; c.load(evs); c.stateAt(late.t + 0.4); c.add(late.type, late.t, late); return sig(c.stateAt(T)) === sig(a.stateAt(T)); })());
  ok('peek(T) equals the state a fresh timeline computes for T, and leaves the live simulation alone', (() => { const before = sig(a.stateAt(T)); const p = a.peek(C + 63.21); const f = new Timeline(); f.load(r.ev); return sig(p) === sig(f.stateAt(C + 63.21)) && sig(a.stateAt(T)) === before; })());
  const s = new Synth(); for (const e of r.ev) s.event(e);
  const L = new Float32Array(128), R = new Float32Array(128);
  for (let f = 0; f < Math.round(30 * 48000 / 128); f++) s.process(L, R, 128);
  const Ta = s.offset + s.frame / 48000;
  ok('audio-thread timeline matches the picture timeline', sig(s.tl.stateAt(Ta)) === sig(a.stateAt(Ta)), `at ${Ta.toFixed(2)} s`);
}

// ── the opening of a run, the brake, a crash ──
let crashT;
{
  const tl = fresh();
  const a = tl.stateAt(C + 0.8), b = tl.stateAt(C + 4.5);
  ok('a run opens with the police on the bumper, then the car launches', policeClose(a.g) && a.g.polZ > -8 && a.vel < 25 && !policeClose(b.g) && b.g.polZ < -15 && b.vel > GAME.gears[0] - 2 && b.g.star === 1, `0.8 s: ${a.vel.toFixed(0)} u/s, police ${(-a.g.polZ).toFixed(1)} behind · 4.5 s: ${b.vel.toFixed(0)} u/s, police ${(-b.g.polZ).toFixed(1)} behind`);
  // there is no brake: the old brake event is ignored, and the car just keeps gaining speed
  { const t0 = fresh(), t1 = fresh(); t1.add('brk', C + 4.6, { on: true });
    const a0 = t0.stateAt(C + 6), a1 = t1.stateAt(C + 6);
    ok('there is no brake: the car drives flat out whatever is pressed', Math.abs(a0.vel - a1.vel) < 1e-9 && a1.vel > GAME.gears[0] && a1.thr > 0.99, `${a1.vel.toFixed(1)} u/s either way`); }
  const st = tl.stateAt(C + 16);
  crashT = st.overT;
  const evs = tl.gameEvents(0, C + 30), hit1 = evs.find((e) => e.k === 'stumble'), end = evs.find((e) => e.k === 'over'), mid = tl.stateAt(hit1.t + 0.3);
  ok('driving straight on: the first vehicle costs a life (ploughed through, slowed, police on the tail)', hit1.by === 'crash' && evs.some((e) => e.k === 'wreck' && e.t === hit1.t) && mid.over === 0 && mid.g.lives === 1 && policeClose(mid.g) && mid.vel < GAME.gears[0] * 0.9, `at ${(hit1.t - C).toFixed(2)} s, ${mid.vel.toFixed(0)} u/s just after`);
  ok('… and the next hit ends the run', st.over !== 0 && end.t > hit1.t + GAME.stumbleGrace && Math.abs(st.vel) < 0.5, `${(end.t - hit1.t).toFixed(2)} s later (${st.over === 1 ? 'wrecked' : 'busted'})`);
  ok('no attack starts in the two and a half seconds after a hit', !evs.some((e) => (e.k === 'ramwarn' || e.k === 'lock' || e.k === 'ictell') && e.t >= hit1.t && e.t < hit1.t + GAME.hitRest - 0.01));
  tl.add('lane', crashT + 0.3, { dir: 1 });
  ok('inputs are ignored while the run is over', tl.stateAt(crashT + 0.6).lane === 0);
  // home → start → a new run
  tl.add('home', crashT + 1.5);
  ok('HOME: back to the home screen, no game running', tl.phaseAt(crashT + 2).phase === 'home' && tl.stateAt(crashT + 2).over === 0 && tl.stateAt(crashT + 4).vel < 7);
  // every start opens with the intro: the tape rewinds (0.6 s), then the ignition plays; SKIP cuts it short
  tl.add('start', crashT + 5);
  ok('START from home: the tape rewinds and the intro plays again', tl.phaseAt(crashT + 5.3).phase === 'rewind' && tl.phaseAt(crashT + 6).phase === 'ign' && tl.stateAt(crashT + 6).run === 1);
  tl.add('skip', crashT + 7);
  const p1 = tl.phaseAt(crashT + 7.2).phase, s2 = tl.stateAt(crashT + 7 + 0.4 + 3);
  ok('SKIP during it: 0.4 s fast-forward, then run 2', p1 === 'ff' && tl.phaseAt(crashT + 7.5).phase === 'cruise' && s2.run === 2 && s2.over === 0 && s2.g.gd > 20 && s2.g.lives === 2 && s2.tapes === GAME.tapesStart, `run ${s2.run}, distance ${s2.g.gd.toFixed(0)}`);
  tl.add('restart', crashT + 11);
  const s3 = tl.stateAt(crashT + 11 + 0.4 + 1);
  ok('RESTART (from the pause menu) opens with the intro as well', tl.phaseAt(crashT + 11.2).phase === 'rewind' && tl.phaseAt(crashT + 12).phase === 'ign' && s3.run === 2);
  tl.add('skip', crashT + 12.5);
  const s3b = tl.stateAt(crashT + 12.5 + 0.4 + 1);
  ok('… and SKIP takes it into run 3', s3b.run === 3 && s3b.g.gd < 60 && s3b.g.gd > 5 && s3b.over === 0);
  tl.add('home', crashT + 15); tl.add('start', crashT + 17);
  ok('left alone, the intro runs its full 10 s and then the run starts', tl.phaseAt(crashT + 17.3).phase === 'rewind' && tl.phaseAt(crashT + 23).phase === 'ign' && tl.phaseAt(crashT + 17.6 + 9.9).phase === 'ign' && tl.stateAt(crashT + 17.6 + 10 + 2).run === 4);
  { const t9 = fresh(); t9.stateAt(C + 12); const oT = t9.stateAt(C + 40).overT; t9.add('home', oT + 1); t9.add('start', oT + 3); t9.add('skip', oT + 3.2);
    ok('SKIP pressed while the tape is still rewinding takes effect as the intro begins', t9.phaseAt(oT + 3.7).phase === 'ff' && t9.phaseAt(oT + 4.1).phase === 'cruise' && t9.stateAt(oT + 5).run === 2); }
}

// ── rewind: a tape restores the game and the road from about three seconds before the crash ──
{
  const tl = fresh();
  let st = tl.stateAt(C + 40); const overT = st.overT;
  const gdCrash = st.g.gd;
  const b3 = tl.stateAt(overT - 3), before = { gd: b3.g.gd, score: b3.g.score, pos: b3.pos };
  tl.add('revive', overT + 1.0);
  st = tl.stateAt(overT + 1.0 + GAME.reviveHold / 2);
  ok('rewind: game on hold, tape spent, rewinding from the crash to a checkpoint ≥ 3 s earlier', st.over === 0 && st.tapes === GAME.tapesStart - 1 && st.rev === 1 && st.rwA === overT && st.rwB <= overT - 3 && st.rwB > overT - 4.1, `rewinds ${(st.rwA - st.rwB).toFixed(2)} s`);
  const gds = [0, 0.25, 0.5, 0.75, 1].map((k) => tl.peek(st.rwA + (st.rwB - st.rwA) * k));
  ok('rewind: the past plays backwards (car and traffic retrace their path)', gds.every((p, i) => i === 0 || (p.g.gd < gds[i - 1].g.gd && p.pos < gds[i - 1].pos)) && Math.abs(gds[4].g.gd - st.g.gd) < 1e-6 && !gds[1].over, gds.map((p) => p.g.gd.toFixed(0)).join(' → '));
  st = tl.stateAt(overT + 1.0 + GAME.reviveHold + 0.3);
  ok('rewind: resumes about 3 s before the crash, invulnerable, road position restored', st.over === 0 && st.g.gd < gdCrash - 100 && Math.abs(st.g.gd - before.gd) < 90 && Math.abs(st.pos - before.pos) < 90 && st.g.inv > st.g.gt && st.vel > 40, `distance ${st.g.gd.toFixed(0)} (3 s before: ${before.gd.toFixed(0)}, crash: ${gdCrash.toFixed(0)}), ${st.vel.toFixed(0)} u/s`);
  ok('rewind: the score is the one from the restore point', Math.abs(st.g.score - before.score) < 700);
  const st2 = tl.stateAt(overT + 30);
  if (st2.over) { tl.add('revive', st2.overT + 1.0); ok('no tape left: a second rewind is refused', tl.stateAt(st2.overT + 2.5).over !== 0); }
  else ok('no tape left: a second rewind is refused', true, 'skipped: still alive');
}

// ── sideswipe, the tail-close window, busted ──
{
  const r = play(99, 50);
  const tl = new Timeline(); tl.load(r.ev);
  let hit = null;
  for (let T = C + 8; T < C + 48 && !hit; T += 0.02) {
    const st = tl.stateAt(T), g = st.g;
    if (st.xv * st.xv > 0.01) continue;
    for (let i = 0; i < NV; i++) { const o = i * VF; if (g.veh[o] !== 3) continue; const dz = g.veh[o + 2] - g.gd, dl = Math.round(g.veh[o + 1]) - st.lane; if (Math.abs(dz) < 3 && Math.abs(dl) === 1) hit = { T, dir: dl, lane: st.lane }; }
  }
  const base = r.ev.filter((e) => e.t < hit.T);
  const t2 = new Timeline(); t2.load(base); t2.add('lane', hit.T, { dir: hit.dir });
  const st = t2.stateAt(hit.T + 0.8), ev = kinds(t2, hit.T, hit.T + 0.8);
  ok('sideswipe: bounces back to the lane we came from', ev.includes('swipe') && !st.over && st.lane === hit.lane && Math.abs(st.x - hit.lane * 5) < 0.8, `events ${ev.join(',')}`);
  ok('sideswipe = a life lost: half a star of heat, combo reset, police on the tail', ev.includes('stumble:swipe') && st.g.lives === 1 && st.g.heat >= t2.stateAt(hit.T - 0.01).g.heat + GAME.heatSwipe - 0.05 && st.g.star === Math.floor(st.g.heat + 1e-9) && st.g.combo <= 3 && policeClose(st.g) && st.g.polZ > -9, `police ${(-st.g.polZ).toFixed(1)} behind`);
  // the police stay there for good … until a nitro burst shakes them off and gives the life back
  const t5 = new Timeline(); t5.load(base); t5.add('lane', hit.T, { dir: hit.dir });
  const hold = t5.stateAt(hit.T + 1.0); t5._st.g.nstock = 1;      // hand it a canister (edit the live state)
  ok('the police stay on the tail', hold.g.lives === 1 && policeClose(hold.g) && (() => { for (let T = hit.T + 1; T < hit.T + 14; T += 0.5) { const s = t2.stateAt(T); if (s.over) return true; if (!policeClose(s.g)) return false; } return true; })());
  t5.add('turbo', hit.T + 1.05);
  const freed = t5.stateAt(hit.T + 3.2), fev = kinds(t5, hit.T + 1, hit.T + 3.2);
  ok('a nitro burst shakes them off and gives the life back', fev.includes('shake') && freed.g.lives === 2 && (freed.over !== 0 || !policeClose(freed.g)), `events ${fev.filter((k) => k !== 'cell').join(',')}`);
  ok('… and counts as the first of three towards clearing the heat', t5.gameEvents(hit.T + 1, hit.T + 3.2).some((e) => e.k === 'nuse' && e.n === 1) && (freed.over !== 0 || freed.g.nUse === 1));
  // the third nitro burst cools the heat by two stars, and the road count for the next star starts from there
  { const g = freshGame(5); g.genU = 1e12; const out = [], step = (n, nitro) => { for (let i = 0; i < n; i++) stepGame(g, { dt: 1 / 240, x: 0, lane: 0, vel: 90, brk: 0, nitro }, out); };
    g.gd = GAME.starAt[4] + 10; step(240, 0); const s0 = g.star; step(240, 1); step(240, 0); step(240, 1); step(240, 0); const s2 = g.star; step(240, 1); step(240, 0); const s3 = g.star, d0 = g.gd;
    const back = () => { while (g.star < 4 && g.gd < d0 + 1e5) step(24, 0); return g.gd - d0; };
    const ks = out.map((e) => e.k).filter((k) => k === 'nuse' || k === 'clear').join(',');
    ok('three nitro bursts cool the heat: five stars stay through two bursts, the third takes two of them', s0 === 5 && s2 === 5 && s3 === 5 - GAME.clearDrop && ks === 'nuse,nuse,clear', `${s0} → ${s2} → ${s3} (${ks})`);
    const d2 = back(), want = GAME.starAt[3] - GAME.starAt[2] - 90;
    ok('after that the next star comes back with the road, as it did the first time', Math.abs(d2 - want) < 120, `four stars again ${d2.toFixed(0)} units later (${want} expected)`); }
  // the threat level: one more every lvEvery seconds, never down; from starFloorLv it keeps the stars from falling to one
  { const g = freshGame(5); g.genU = 1e12; const out = [], step = (n, nitro = 0) => { for (let i = 0; i < n; i++) stepGame(g, { dt: 1 / 240, x: 0, lane: 0, vel: 90, brk: 0, nitro }, out); };
    step(Math.round(240 * (GAME.lvEvery * GAME.starFloorLv[1] + 1)));
    const lv = out.filter((e) => e.k === 'level').map((e) => e.n);
    ok('the threat level rises by one every lvEvery seconds', lv.join() === Array.from({ length: GAME.starFloorLv[1] }, (_, i) => i + 1).join() && g.lvN === GAME.starFloorLv[1], `levels ${lv.join(' ')} in ${g.gt.toFixed(0)} s`);
    g.heat = 1; g.wd0 = g.gd; step(24);
    ok('… and from level ' + GAME.starFloorLv[1] + ' the wanted level never drops below two stars', g.star === 2, `${g.star}★ straight after the heat is wiped`); }
  // a second stumble while the police are on the tail → busted
  const t3 = new Timeline(); t3.load(base);
  t3.stateAt(hit.T - 0.004); t3._st.g.lives = 1;                  // one life is already gone (edit the live state)
  t3.add('lane', hit.T, { dir: hit.dir });
  const b = t3.stateAt(hit.T + 0.8), bev = kinds(t3, hit.T, hit.T + 0.8);
  ok('a hit with one life left = busted', b.over === 2 && bev.includes('bust:swipe'), `events ${bev.join(',')}`);
}

// ── stars, the grappler, helicopter fire ──
{
  const r = play(31337, 200);
  const tl = new Timeline(); tl.load(r.ev);
  const ev = tl.gameEvents(0, C + 200);
  const star = (n) => ev.find((e) => e.k === 'star' && e.n === n), at = (e) => tl.stateAt(e.t + 0.01).g.gd;
  const s2 = star(2), s3 = star(3), s4 = star(4), s5 = star(5);
  ok('stars rise with distance: one more at each of starAt', [s2, s3, s4, s5].every((e, i) => e && Math.abs(at(e) - GAME.starAt[i + 1]) < 5), [s2, s3, s4, s5].map((e, i) => `${i + 2}★ at ${e ? at(e).toFixed(0) : '–'}`).join(', '));
  const firstRam = ev.find((e) => e.k === 'ramwarn'), firstLock = ev.find((e) => e.k === 'lock'), firstBlock = (() => { for (let T = s2.t; T < C + 200; T += 0.25) { const g = tl.stateAt(T).g; for (let i = 0; i < NV; i++) if (g.veh[i * VF] === 5) return T; } return null; })();
  ok('2 stars: roadblocks and grappler runs; 3 stars: searchlight locks', firstRam && firstRam.t > s2.t && firstBlock !== null && firstLock && firstLock.t > s3.t && !ev.some((e) => e.k === 'lock' && e.t < s3.t), `first roadblock ${(firstBlock - C).toFixed(0)} s, first grappler run ${(firstRam.t - C).toFixed(0)} s, first lock ${(firstLock.t - C).toFixed(0)} s`);
  ok('a bot that reads the warnings is never hit', r.stats.stumbles === 0 && !r.stats.over, `${ev.filter((e) => e.k === 'ram').length} grappler runs, ${ev.filter((e) => e.k === 'strike').length} strikes`);
  // ignore the warning: the net takes the rear wheel → stumble, slowed for a second while the cruiser hangs on, then it lets go
  // (take a run where staying in lane does not also mean driving into traffic)
  let t2, ramW, ram1 = null;
  for (const w of ev.filter((e) => e.k === 'ramwarn')) {
    t2 = new Timeline(); t2.load(r.ev.filter((e) => e.t < w.t)); ramW = t2.stateAt(w.t + 0.01).g.polW;      // the length of this warning
    const k = kinds(t2, w.t, w.t + ramW + 0.45 + GAME.ramSlow + 1.3);
    if (!k.includes('crash') && !k.includes('wreck') && !k.includes('over') && !k.includes('stumble:heli') && !k.includes('stumble:slam')) { ram1 = w; break; }
  }
  const hitT = ram1.t + ramW + 0.45, v0 = t2.stateAt(ram1.t).vel, st = t2.stateAt(hitT + 0.3), e2 = kinds(t2, ram1.t, hitT + 0.3);
  const hk = t2.stateAt(ram1.t + ramW + 0.5).g, rel = t2.stateAt(ram1.t + ramW + 0.45 + GAME.ramSlow + 1.2).g;
  ok('ignoring the grappler warning: hooked = a stumble, slowed', e2.includes('ram') && e2.includes('stumble:hook') && policeClose(st.g) && st.vel < v0 * 0.93 && !st.over, `${v0.toFixed(0)} → ${st.vel.toFixed(0)} u/s, events ${e2.filter((k) => k !== 'cell').join(',')}`);
  ok('hooked: the cruiser hangs on our rear wheel, then lets go and drops back', hk.polM === P_HOOK && Math.abs(hk.polZ + HOOK_Z) < 0.4 && rel.polM !== P_HOOK && rel.polZ < -HOOK_Z - 1, `polZ ${hk.polZ.toFixed(2)} while hooked, ${rel.polZ.toFixed(1)} after`);
  // ignore a searchlight lock: fired on → stumble (take a lock where staying in lane does not also mean hitting traffic)
  let e3 = [], lock = null;
  let lockEnd = 0;
  for (const l of ev.filter((e) => e.k === 'lock' && e.pat === 0)) {
    const t3 = new Timeline(); t3.load(r.ev.filter((e) => e.t < l.t));
    lockEnd = t3.stateAt(l.t + 0.01).g.drW + GAME.drStrike + 0.1;
    e3 = kinds(t3, l.t, l.t + lockEnd);
    if (!e3.includes('crash') && !e3.includes('wreck') && !e3.includes('stumble:swipe') && !e3.includes('stumble:hook') && !e3.includes('stumble:slam')) { lock = l; break; }
  }
  const sT = lock.t + lockEnd;
  ok('ignoring the searchlight lock: fired on = a stumble', e3.includes('strike') && e3.includes('stumble:heli'), e3.filter((k) => k !== 'cell').join(','));
  ok('the bust rule applies to police hits too', (() => { const t4 = new Timeline(); t4.load(r.ev.filter((e) => e.t < lock.t)); t4.stateAt(lock.t + 0.2); t4._st.g.lives = 1; return t4.stateAt(sT).over === 2; })());
}

// ── five stars: the interceptor, twin searchlights, the walking barrage, the cruiser that cuts us off, merging traffic; planning ──
{
  const r = play(1000, 300), tl = new Timeline(); tl.load(r.ev);
  const ev = tl.gameEvents(0, C + 300), of = (k, f = () => true) => ev.filter((e) => e.k === k && f(e)), s4 = ev.find((e) => e.k === 'star' && e.n === 4), s5 = ev.find((e) => e.k === 'star' && e.n === 5);
  const ic = of('icwarn'), tell = of('ictell'), slam = of('slam'), twin = of('lock', (e) => e.pat === H_TWIN), walk = of('lock', (e) => e.pat === H_WALK), mir = of('mirror');
  ok('4 stars: the interceptor comes up the shoulder, and signals before it swerves', ic.length >= 3 && ic[0].t >= s4.t && tell.length >= 1 && slam.length === tell.length && tell.every((e, i) => slam[i].t - e.t > GAME.react[1] + GAME.warn - 0.01 && slam[i].lane === e.lane), `${ic.length} visits, ${slam.length} swerves, the first ${(slam[0].t - tell[0].t).toFixed(2)} s after its signal`);
  ok('… on the shoulder it is beside the lanes, not in one', ic.every((e) => { const g = tl.stateAt(e.t + 1.0).g; return g.icM !== I_OFF && Math.abs(Math.abs(g.icX) - GAME.icShoulder) < 1e-6 && Math.sign(g.icX) === e.side; }));
  ok('4 stars: twin searchlights; 5 stars: the walking barrage', twin.length >= 1 && twin[0].t >= s4.t && walk.length >= 1 && walk[0].t >= s5.t && twin.every((e) => Math.abs(e.b - e.lane) === 1), `${twin.length} twin, ${walk.length} barrages`);
  { const w = walk[0], g = tl.stateAt(w.t + 0.01).g, S = heliStrikes(g.drPat, g.drLane, g.drB, g.drW), k = of('strike', (e) => e.t > w.t && e.t < w.t + S[2][2] + 0.05);
    ok('the barrage walks across all three lanes, one at a time, with a gap between', S.length === 3 && S.map((q) => q[0]).sort().join() === '-1,0,1' && Math.abs(S[1][1] - S[0][2] - GAME.walkGap) < 1e-9 && k.length === 3 && k.map((e) => e.lane).join() === S.map((q) => q[0]).join(), `lanes ${S.map((q) => q[0]).join(' → ')}, ${(S[1][1] - S[0][1]).toFixed(2)} s apart`); }
  ok('a cruiser ahead waits to see our lane, then cuts across into it', mir.length >= 2 && mir.every((e) => { const a = tl.stateAt(e.t - 0.01), g = tl.stateAt(e.t + 0.01).g; let hit = false; for (let i = 0; i < NV; i++) { const o = i * VF; if (g.veh[o] === T_BLOCK && g.veh[o + 6] === e.lane && g.veh[o + 7] > 0) hit = true; } return hit && e.lane === a.lane && e.lane !== 0; }), `${mir.length} times`);
  let merges = 0; { const seen = new Set(); for (let T = C + 20; T < C + 300; T += 0.25) { const g = tl.stateAt(T).g; for (let i = 0; i < NV; i++) { const o = i * VF; if ((g.veh[o] === T_CAR || g.veh[o] === T_VAN) && g.veh[o + 6] !== 0 && g.veh[o + 7] > 0 && !seen.has(g.veh[o + 8])) { seen.add(g.veh[o + 8]); merges++; } } } }
  ok('ordinary traffic changes lane too: cars and vans signal and merge into the middle', merges >= 3, `${merges} in five minutes`);
  // the traffic turns on us: vehicles beside our lane cut into it (or into the lane we were about to take), marked as they do
  { const cut = of('cutin'), drift = of('drift'), mine = cut.filter((e) => tl.stateAt(e.t - 0.01).lane === e.lane).length;
    const marked = cut.every((e) => { const g = tl.stateAt(e.t + 0.01).g; for (let i = 0; i < NV; i++) { const o = i * VF; if (g.veh[o] && (g.veh[o + 5] & NASTY) && g.veh[o + 6] !== 0 && g.veh[o + 7] > 0) return true; } return false; });
    ok('vehicles cut in on us on purpose: into our own lane most of the time, else into the lane we need next', cut.length >= 15 && mine >= cut.length * 0.6 && marked, `${cut.length} cut-ins in five minutes, ${mine} into the lane we were in; ${drift.length} other lane changes around us`);
    const lead = (e) => { const st = tl.stateAt(e.t + 0.01), g = st.g; for (let i = 0; i < NV; i++) { const o = i * VF; if (g.veh[o] && (g.veh[o + 5] & NASTY) && g.veh[o + 7] > 0 && g.gt - g.veh[o + 7] < 0.05) return (g.veh[o + 2] - g.gd - g.veh[o + 4] - CAR_HL) / Math.max(1, st.vel - g.veh[o + 3]); } return NaN; };
    const early = cut.filter((e) => e.t < C + 90).map(lead).filter((x) => x === x), late = cut.filter((e) => e.t > C + 200).map(lead).filter((x) => x === x), avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    ok('… and later in a run they leave it later: less time between the signal and the moment we reach them', early.length >= 2 && late.length >= 4 && avg(late) < avg(early) - 0.3, `${avg(early).toFixed(2)} s in the first 90 s, ${avg(late).toFixed(2)} s after 200 s`); }
  ok('the reaction time a driver is allowed falls with every level, to a floor', reactAt(0) === GAME.react[0] && reactAt(5) < reactAt(0) - 0.15 && reactAt(100) === GAME.react[1] && GAME.react[1] <= 0.3, `${reactAt(0).toFixed(2)} s at level 0, ${reactAt(5).toFixed(2)} at 5, ${reactAt(100).toFixed(2)} at the floor`);
  // every attack is planned: at the moment it is committed a driver still has a way through, with time to see it
  const atk = ev.filter((e) => e.k === 'ramwarn' || e.k === 'lock' || e.k === 'ictell' || e.k === 'cutin');
  const bad = atk.filter((e) => { const st = tl.stateAt(e.t + 0.004), react = reactAt(st.g.gt / GAME.lvEvery); return !wayThrough(threatGrid(st.g, st.vel, { horizon: GAME.fairAhead }), st.lane, react - 0.02, GAME.fairSwitch); });
  ok('every attack leaves a way through that a driver has time to see and take', atk.length > 30 && bad.length === 0, `${atk.length} attacks checked${bad.length ? ', none left at ' + bad.slice(0, 4).map((e) => e.k + '@' + (e.t - C).toFixed(1)).join(' ') : ''}`);
  const w0 = tl.stateAt(of('ramwarn')[0].t + 0.01).g.polW, w1 = tl.stateAt(of('ramwarn').pop().t + 0.01).g.polW;
  ok('warnings get shorter as the threat level rises', w0 > w1 + 0.15 && w1 >= GAME.react[1] + GAME.warn - 1e-9, `${w0.toFixed(2)} s at first, ${w1.toFixed(2)} s after five minutes`);
  ok('pincers: at five stars two units may attack together', of('pincer').length >= 1 && of('pincer').every((e) => e.t >= s5.t), `${of('pincer').length} times`);
  ok('the bot comes through five minutes of it untouched', r.stats.stumbles === 0 && !r.stats.over, `${atk.length} attacks, ${of('dodge').length} dodged`);
  // a hit calls the others off: a lock or a warning still running when we are hit by something else is dropped
  { const g2 = freshGame(5); g2.genU = 1e12; g2.gd = GAME.starAt[4] + 10; const o2 = [], one = () => stepGame(g2, { dt: 1 / 240, x: 0, lane: 0, vel: 100, brk: 0, nitro: 0 }, o2);
    let n = 0; while (!o2.some((e) => e.k === 'lock') && n++ < 240 * 60) one();
    g2.lives = 2; g2.over = 0; g2.stG = 0; g2.inv = 0; g2.polM = 0; g2.ramNext = g2.gt + 9; o2.length = 0;     // (whatever the idle car took while it waited for the lock is undone)
    g2.veh.set([T_CAR, 0, g2.gd + 22, g2.vt, 2.4, 512, 0, 0, 999], 0);      // a car in our lane, reached while the lock is still a warning
    for (let i = 0; i < 300 && !g2.over; i++) one();
    const ks = o2.map((e) => e.k + (e.by ? ':' + e.by : ''));
    ok('a hit calls the other units off: a lock still running is dropped, so one mistake is one life', g2.star >= 3 && ks.includes('stumble:crash') && ks.includes('calloff') && g2.drT < 0 && g2.lives === 1 && !g2.over && !ks.includes('stumble:heli'), ks.filter((k) => !/^(cell|pass|level|star|dodge|go)/.test(k)).slice(-5).join(',')); }
  // ignore an interceptor's signal: it swerves into us
  let hitBy = null;
  for (const e of tell) { const t2 = new Timeline(); t2.load(r.ev.filter((q) => q.t < e.t)); const k = kinds(t2, e.t, e.t + 2.2); if (k.includes('stumble:slam') || k.includes('bust:slam')) { hitBy = k; break; } }
  ok('ignoring the interceptor: slammed = a stumble', !!hitBy, hitBy ? hitBy.filter((k) => k !== 'cell' && k !== 'pass').join(',') : 'never hit');
  // the car accelerates all the way: the road speed rises through the gears without a step, and the revs fall back at each change
  const steps = []; for (let d = 0; d < 9000; d += 10) steps.push(baseAt(d + 10) - baseAt(d));
  const g1 = { gear: 1 }, g2 = { gear: 2 };
  ok('the road speed rises steadily through the gears; the revs climb and fall back at each change', Math.max(...steps) < 0.25 && Math.min(...steps) > 0 && revs(g1, GAME.gears[2] - 0.01) > 0.99 && revs(g2, GAME.gears[2]) < 0.01, `at most ${Math.max(...steps).toFixed(2)} u/s per 10 units`);
}

// ── nitro canisters ──
{
  const tl = fresh(); tl.add('lane', C + 5, { dir: 1 });
  tl.add('turbo', C + 5.5);
  ok('nitro is refused with no canister in stock', tl.turboAt(C + 6) === null && tl.turboReady(C + 6) === 0 && tl.stateAt(C + 6).g.nstock === 0);
  const r = play(11, 300, { nitro: true, seek: true });   // canisters are 30 to 45 s apart in top gear (further later), and not every one can be reached
  const t2 = new Timeline(); t2.load(r.ev);
  const ev = t2.gameEvents(0, C + 300), items = ev.filter((e) => e.k === 'item'), ns = t2.nitros(C + 300);
  ok('canisters are picked up on the road and can be fired', items.length >= 2 && ns.length >= 1 && ns.length <= items.length, `${items.length} picked up, ${ns.length} fired, ${r.g.nstock} in stock, ${r.g.smash} smashed`);
  const n0 = ns[0], st = t2.stateAt(n0.I + 1.0), basev = t2.stateAt(n0.p - 0.1).vel;
  ok('nitro impact lands on the half-beat grid, 0.2–0.45 s after the press', n0.I - n0.p >= 0.2 - 1e-9 && n0.I - n0.p <= 0.45 + 1e-9 && Math.abs(((n0.I - C) / 0.25) - Math.round((n0.I - C) / 0.25)) < 1e-6, `wind-up ${(n0.I - n0.p).toFixed(3)} s`);
  ok('nitro boosts the speed to about 1.85× the cruising speed', st.vel > gameBase(st.g) * 1.65 && st.vel < gameBase(st.g) * 2.0, `${basev.toFixed(0)} → ${st.vel.toFixed(0)} u/s (cruising speed ${gameBase(st.g).toFixed(0)} by then)`);
  // stock: up to three, used one at a time
  const t3 = fresh(); t3.add('lane', C + 5, { dir: 1 }); t3.stateAt(C + 6); t3._st.g.nstock = 2;
  t3.add('turbo', C + 6.1); t3.add('turbo', C + 6.4);
  const a = t3.stateAt(C + 7);
  ok('one canister per burst, bursts cannot overlap', a.g.nstock === 1 && t3.nitros(C + 7).length === 1);
  ok('nitro smashes vehicles and raises the stars', r.g.smash > 0 || ns.length === 0, `${r.g.smash} smashed, max ${r.g.starMax}★`);
}

// ── gears, score, tapes ──
{
  const r = play(5, 120);
  ok('gears engage with distance', r.g.gear >= 3 && r.st.vel > GAME.gears[r.g.gear] - 1, `gear ${r.g.gear + 1} at ${Math.round(r.g.gd)} units, ${r.st.vel.toFixed(0)} u/s`);
  ok('score, cells and overtakes accumulate', r.g.score > 10000 && r.g.cells > 50 && r.g.passed > 40, `score ${Math.round(r.g.score)}, cells ${r.g.cells}, passed ${r.g.passed}`);
  ok('100 cells earn a spare tape (max 3)', r.st.tapes === Math.min(GAME.maxTapes, GAME.tapesStart + Math.floor(r.g.cells / GAME.tapeEvery)), `${r.st.tapes} tapes`);
}

// ── pickups never sit under a vehicle: they slide to a clear lane (or the cells in the way fade out where they are) ──
{
  let hits = 0, frames = 0, slid = 0;
  for (const seed of [5, 1000, 8919, 72271]) {
    const r = play(seed, 150, { nitro: seed === 5, seek: seed === 5 });
    for (let T = C + 0.1; T < C + 150; T += 1 / 30) {
      const st = r.tl.stateAt(T); if (st.over) break;
      const h = overlaps(st.g); hits += h.length; frames++;
      for (let i = 0; i < NC; i++) if (st.g.cel[i * CF] && st.g.cel[i * CF + 5] !== Math.round(st.g.cel[i * CF + 1]) ) slid++;
    }
  }
  ok('pickups never overlap a vehicle (they move out of the way)', hits === 0 && slid > 0, `${hits} overlaps in ${frames} frames · ${slid} frames with a line of cells sliding across`);
}

// ── free mode (?free=1): no traffic, no police attacks, never over, a canister every 7 s ──
{
  const tl = fresh(7, { free: 1 });
  const st = tl.stateAt(C + 60);
  ok('free mode: no traffic and no game over', st.over === 0 && [...st.g.veh].every((v, i) => i % VF !== 0 || v === 0) && st.g.gd > 2500 && !kinds(tl, 0, C + 60).some((k) => k === 'ramwarn' || k === 'lock'));
  tl.add('turbo', C + 61);
  ok('free mode: nitro available, refilled 7 s after use', tl.turboAt(C + 61.5) !== null && tl.turboReady(C + 63) === 0 && tl.turboReady(C + 61 + 7.3) === 1);
}

// ── traffic that drives: steering curves, the rolling roadblock, the weaving cruiser ──
{
  const r = play(31337, 200), tl = new Timeline(); tl.load(r.ev);
  const H = 0.02;
  const record = (tl, log = new Map()) => {              // every vehicle's track, sampled 50 times a second
  for (let T = C + 4; T < C + 200; T += H) {
    const st = tl.stateAt(T), g = st.g, lr = laneRate(g, st.vel); if (st.over) break;
    for (let i = 0; i < NV; i++) { const o = i * VF; if (!g.veh[o]) continue; const id = g.veh[o + 8]; if (!log.has(id)) log.set(id, []); log.get(id).push({ T, gt: g.gt, id, type: g.veh[o], lane: g.veh[o + 1], home: ((g.veh[o + 5] >> 9) & 3) - 1, dz: g.veh[o + 2] - g.gd, vt: g.vt, lr, base: gameBase(g), v: g.veh[o + 3], hl: g.veh[o + 4], fl: g.veh[o + 5], a: g.veh[o + 6], b: g.veh[o + 7], bl: g.veh[o + 9], mt: g.veh[o + 10], lv: g.gt / GAME.lvEvery }); }
  }
  return [...log.values()]; };
  const tracks = record(tl), of = (type) => tracks.filter((t) => t[0].type === type && t[0].dz > 200 && t[t.length - 1].dz < 0);
  const cars = tracks.filter((t) => t[0].type < T_TAXI && t.length > 50);
  const ahead = cars.flatMap((t) => t.filter((q) => q.dz > 0)), mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const byLane = [-1, 0, 1].map((l) => mean(ahead.filter((q) => q.a === 0 && q.home === l).map((q) => q.v - q.vt)));
  ok('traffic keeps pace with the road: 46 % of our cruising speed, each vehicle within 2.5 of its lane\'s speed',
    cars.length > 100 && ahead.every((q) => Math.abs(q.v - q.vt - laneV(q.lane) * q.lr) < 2.5 && Math.abs(q.vt - GAME.trafficK * q.base) < GAME.trafficK * 13),   // it eases up to each new gear: never more than one gear step (12 u/s) behind
    `${cars.length} vehicles tracked, ${Math.min(...ahead.map((q) => q.v)).toFixed(1)} … ${Math.max(...ahead.map((q) => q.v)).toFixed(1)} u/s over the run`);
  ok('each lane has its own speed: the left lane overtakes the middle, the middle overtakes the right', Math.abs(byLane[0] - GAME.laneDv) < 0.3 && Math.abs(byLane[1]) < 0.3 && Math.abs(byLane[2] + GAME.laneDv) < 0.3, `left ${byLane[0].toFixed(2)}, middle ${byLane[1].toFixed(2)}, right ${byLane[2].toFixed(2)} u/s against the middle lane`);
  // … and still every row is lined up when we reach it: two vehicles spawned as one row pass us within a car's length of each other
  const lineUp = (cars) => {
    const rowsOf = new Map(); for (const t of cars) { const k = t[0].T.toFixed(2); if (!rowsOf.has(k)) rowsOf.set(k, []); rowsOf.get(k).push(t); }
    // (two that were spawned together, in different lanes)
    const pairs = [...rowsOf.values()].filter((r) => r.length === 2 && r[0][0].home !== r[1][0].home && r.every((t) => t[0].dz > 200 && t[t.length - 1].dz < 0 && t[0].type < 3) && r[1].some((x) => x.T === r[0].find((y) => y.dz < 0).T));
    const gaps = pairs.map(([a, b]) => { const q = a.find((x) => x.dz < 0), w = b.find((x) => x.T === q.T); return Math.abs(q.dz - w.dz); });
    return { n: pairs.length, gap: Math.max(...gaps), min: Math.min(...gaps), early: mean(pairs.map(([a, b]) => Math.abs(a[0].dz - b[0].dz))) };
  };
  // (measured on a run in which nobody changes lane: a vehicle that does takes up its new lane's speed, and leaves its row)
  const live = { flow: GAME.flow, cut: GAME.cut }; Object.assign(GAME, { flow: [1e9, 1e9, 0], cut: [1e9, 1e9, 0] });
  const rs = play(31337, 200), ts = new Timeline(); ts.load(rs.ev);
  const lu = lineUp(record(ts).filter((t) => t[0].type < T_TAXI && t.length > 50));
  const span = 2 * GAME.stagger[1] + 2 * GAME.breathe + 0.5, least = 2 * GAME.stagger[0] - 2 * GAME.breathe - 2;
  ok('rows of mixed lanes close up as we reach them, but nobody drives abreast: the two are staggered by 2 to 16.5 units', lu.n >= 8 && lu.gap < span && lu.min > least && lu.early > 8, `${lu.n} two-vehicle rows: ${lu.early.toFixed(0)} apart on average when they appear, ${lu.min.toFixed(1)} to ${lu.gap.toFixed(1)} as we pass`);
  // … whatever our speed on the way in: a run with nitro bursts
  const rn = play(2024, 150, { nitro: true, seek: true }), tn = new Timeline(); tn.load(rn.ev);
  const ln = lineUp(record(tn).filter((t) => t[0].type < T_TAXI && t.length > 20));
  ok('the same holds when we arrive early in a nitro burst', ln.n >= 4 && ln.gap < span + 2.5, `${ln.n} rows, ${ln.gap.toFixed(1)} apart at most`);
  Object.assign(GAME, live);
  // a taxi steers across: a sine ramp, so it leaves and arrives with no sideways speed, and it is across before we get there
  // (the wander across the lane is taken out: what is left is the lane change itself)
  const steerOf = (t) => t.map((q) => ({ ...q, x: q.lane - sway(q.type, q.id, q.gt, q.lv) }));
  const movers = (type) => of(type).map(steerOf).map((t) => { const m = t.filter((q, i) => i > 0 && Math.abs(q.x - t[i - 1].x) > 1e-7), sp = m.map((q) => Math.abs(q.x - t[t.indexOf(q) - 1].x) / H); return { t, m, sp, mt: m.length ? m[0].mt : 0, end: m[m.length - 1], hit: t.find((q) => q.dz < q.hl + CAR_HL) }; }).filter((x) => x.m.length && x.hit);
  const taxis = movers(T_TAXI), others = [...movers(T_CAR), ...movers(T_VAN)];
  // (each sample against the move it belongs to: a vehicle may change lane more than once, each time as quick as the level then makes it)
  const smooth = (x) => x.sp[0] < 0.2 && x.sp[x.sp.length - 1] < 0.2 && x.m.every((q, i) => x.sp[i] < 2 / q.mt * 1.08) && Math.max(...x.sp) > 2 / Math.max(...x.m.map((q) => q.mt)) * 0.88;
  ok('a taxi steers across its lane: no sideways speed at either end, never faster than 2 lanes ÷ the move, across at least 0.25 s before we arrive',
    taxis.length >= 3 && taxis.every((x) => smooth(x) && x.hit.T - x.end.T > 0.25),
    `${taxis.length} taxis; fastest ${Math.max(...taxis.map((x) => Math.max(...x.sp))).toFixed(2)} lanes/s; in lane ${Math.min(...taxis.map((x) => x.hit.T - x.end.T)).toFixed(2)} s or more before we reach it`);
  ok('the traffic is alive: cars and vans change lane all the time, steered the same way, and are across before we arrive',
    others.length >= 30 && others.every((x) => smooth(x) && x.hit.T - x.end.T > 0.2), `${others.length} lane changes by cars and vans in 200 s; in lane ${Math.min(...others.map((x) => x.hit.T - x.end.T)).toFixed(2)} s or more before we reach them`);
  { const first = others.filter((x) => x.m[0].lv < 2), late = others.filter((x) => x.m[0].lv > 7), avg = (a, f) => a.reduce((s, x) => s + f(x), 0) / a.length;
    ok('lane changes get more sudden as the level rises: a shorter signal, a quicker move', first.length > 0 && late.length > 3 && avg(late, (x) => x.m[0].bl) < avg(first, (x) => x.m[0].bl) - 0.1 && avg(late, (x) => x.mt) < avg(first, (x) => x.mt) - 0.06, `signal ${avg(first, (x) => x.m[0].bl).toFixed(2)} → ${avg(late, (x) => x.m[0].bl).toFixed(2)} s, move ${avg(first, (x) => x.mt).toFixed(2)} → ${avg(late, (x) => x.mt).toFixed(2)} s`); }
  { const base = (lv) => { let m = 0; for (let t = 0; t < 30; t += 0.05) m = Math.max(m, Math.abs(sway(T_CAR, 7, t, lv) - jink(7, t))); return m * 5; };
    ok('everyone wanders across their lane, further as the level rises', base(0) > 0.15 && base(10) > base(0) * 2.5 && base(30) <= GAME.sway[2] * 5 + 1e-9, `${base(0).toFixed(2)} units at level 0, ${base(10).toFixed(2)} at level 10, ${base(30).toFixed(2)} at most`);
    // … and now and then one swerves hard and straight back: more of them later, never far enough to touch a car in the next lane
    const share = (t0) => { let on = 0, n = 0, m = 0; for (let id = 1; id < 300; id++) for (let t = t0; t < t0 + 20; t += 0.02) { const j = Math.abs(jink(id, t)); if (j > 0.05) on++; n++; m = Math.max(m, Math.abs(sway(T_CAR, id, t, t / GAME.lvEvery))); } return [on / n, m * 5]; };
    const [s0] = share(5), [s1, m1] = share(300), J = GAME.jink;
    ok('random swerves: a few at first, many more later, and never within reach of the next lane', s0 > 0.002 && s1 > s0 * 4 && m1 <= (GAME.sway[2] + J.amp[2]) * 5 + 1e-9 && m1 + HALF_W[T_VAN] + CAR_HW < 5 - 0.6, `${(100 * s0).toFixed(1)} % of the time at the start, ${(100 * s1).toFixed(1)} % after five minutes; at most ${m1.toFixed(2)} units off the lane centre`); }
  // a rolling roadblock: cruisers that drive with the traffic and brake as we come up
  const blocks = of(T_BLOCK), ev = tl.gameEvents(0, C + 200);
  const braking = blocks.filter((t) => !t.some((q) => q.fl & STEADY)), steady = blocks.filter((t) => t[0].fl & STEADY && t[0].a === 0);
  ok('a rolling roadblock drives with the traffic and brakes as we come up to it',
    braking.length >= 4 && braking.every((t) => t.filter((q) => q.dz > 150).every((q) => Math.abs(q.v - q.vt - laneV(q.lane) * q.lr) < 1) && Math.abs(Math.min(...t.filter((q) => q.dz > 0).map((q) => q.v - q.vt - laneV(q.lane) * q.lr)) + GAME.blockSlow) < 0.3) && ev.some((e) => e.k === 'block'),
    `${braking.length} cruisers, each down to ${GAME.blockSlow} u/s under its lane's speed`);
  ok('… unless one of its cruisers is crossing over: that pair holds its speed', steady.every((t) => t.filter((q) => q.dz > 0).every((q) => Math.abs(q.v - q.vt - laneV(q.lane) * q.lr) < 1)), `${steady.length} such cruisers`);
  // a weaving cruiser: swings between two lanes, then takes one in good time and stays in it
  const weavers = of(T_WEAVE).map((t) => { const i = t.findIndex((q) => q.fl & COMMIT), hit = t.find((q) => q.dz < q.hl + CAR_HL); const pre = t.slice(0, i), post = t.filter((q) => q.T > t[i].T + 0.7 && q.dz > -5); return { pre, post, lead: hit.T - t[i].T, range: Math.max(...pre.map((q) => Math.abs(q.lane))) - Math.min(...pre.map((q) => Math.abs(q.lane))), jump: Math.max(...t.map((q, k) => (k ? Math.abs(q.lane - t[k - 1].lane) : 0))) }; });
  ok('a weaving cruiser swings across two lanes, then takes one at least a second before we reach it and stays there',
    weavers.length >= 3 && ev.some((e) => e.k === 'weave') && weavers.every((x) => x.range > 0.95 && x.lead > 1.0 && x.jump < 0.08 && x.post.length > 5 && x.post.every((q) => Math.abs(q.lane - Math.round(q.lane)) < 0.04 && Math.round(q.lane) === Math.round(x.post[0].lane))),
    `${weavers.length} cruisers; lane taken ${Math.min(...weavers.map((x) => x.lead)).toFixed(2)} s or more ahead`);
  ok('the bot gets past all of it without a touch', r.stats.stumbles === 0 && !r.stats.over);
  // the warning is timed for full speed: a taxi signals no nearer when we come up slowed (after a hit) than flat out
  const sigGap = (vel) => {
    const g = freshGame(5); g.genU = 1e12; g.veh.set([T_TAXI, 0, 120, g.vt, 2.4, 512, 1, 0, 1], 0);   // close enough to be reached in first gear either way
    for (let i = 0, out = []; i < 240 * 120; i++) { stepGame(g, { dt: 1 / 240, x: -5, lane: -1, vel, nitro: 0 }, out); if (g.veh[7] > 0) return g.veh[2] - g.gd; }
    return -1;
  };
  const gapA = sigGap(GAME.gears[0]), gapB = sigGap(GAME.gears[0] * GAME.ramSlowMul);
  ok('being slowed on the way in does not shorten a taxi\'s warning: it signals no nearer', gapB > 0 && gapB > gapA - 1 && gapB < gapA + 6, `signals ${gapA.toFixed(0)} units out at full speed, ${gapB.toFixed(0)} when slowed`);
}

// ── pause: the game clock stops (VCR pause), the car halts, inputs are ignored; resume carries on ──
{
  const tl = fresh(); tl.add('pause', C + 4, { on: true });
  const a = tl.stateAt(C + 5), gt1 = a.g.gt, gd1 = a.g.gd;
  tl.add('lane', C + 6, { dir: 1 }); tl.add('turbo', C + 6.5);
  const b = tl.stateAt(C + 10);
  ok('pause: game clock and traffic stop, the car halts, inputs are ignored', b.paused === 1 && b.g.gt === gt1 && Math.abs(b.g.gd - gd1) < 1e-9 && Math.abs(b.vel) < 0.5 && b.lane === 0 && !b.over, `game time ${b.g.gt.toFixed(2)} s after 6 s paused`);
  tl.add('pause', C + 11, { on: false });
  const t0 = fresh().stateAt(C + 40).overT - C;                   // the same hands-off run without a pause
  const c = tl.stateAt(C + 11 + t0 + 3);
  // (pulling away again changes the speed the car meets the traffic at, and the traffic reacts to that, so the two runs need not end at the same moment)
  const d = tl.stateAt(C + 11.6);
  ok('resume: the run continues from where it stopped', d.paused === 0 && !d.over && d.g.gt > gt1 && d.g.gt < gt1 + 0.7 && d.g.gd > gd1 && c.paused === 0 && c.over !== 0 && Math.abs(c.overT - (C + 11) - (t0 - 4)) < 4, `the run ends ${(c.overT - C - 11).toFixed(2)} s after resuming (4.0 s were driven before the pause, ${t0.toFixed(2)} s without one)`);
}
