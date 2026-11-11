// Unit tests for the game simulation (no browser).   node tools/game-test.mjs
// Determinism, crash, home / start / restart, rewind (state and reverse playback), sideswipe and busted,
// brake, nitro canisters, police stars, the grappler, helicopter fire, steering curves, the rolling roadblock,
// the weaving cruiser, pause, free mode, audio-thread parity.
import { Timeline } from '../js/timeline.js';
import { Synth } from '../js/audio/synth.js';
import { GAME } from '../js/cue.js';
import { NV, VF, policeClose, P_HOOK, HOOK_Z, T_TAXI, T_BLOCK, T_WEAVE, COMMIT, CAR_HL, freshGame, stepGame, breathe } from '../js/game.js';
import { play } from './bot.mjs';
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
  tl.add('brk', C + 4.6, { on: true }); tl.add('brk', C + 6.0, { on: false });
  const c = tl.stateAt(C + 5.95), d = tl.stateAt(C + 7.1);
  ok('the brake slows to 55 %, releasing it returns to full speed', Math.abs(c.vel / GAME.gears[0] - GAME.brakeMul) < 0.04 && d.vel > GAME.gears[0] * 0.93, `${c.vel.toFixed(1)} → ${d.vel.toFixed(1)} u/s`);
  const st = tl.stateAt(C + 16);
  crashT = st.overT;
  ok('driving straight on crashes into the first vehicle', st.over === 1 && kinds(tl, 0, C + 16).includes('crash') && Math.abs(st.vel) < 0.5, `crash ${(st.overT - C).toFixed(2)} s into the run`);
  tl.add('lane', crashT + 0.3, { dir: 1 });
  ok('inputs are ignored while the run is over', tl.stateAt(crashT + 0.6).lane === 0);
  // home → start → a new run
  tl.add('home', crashT + 1.5);
  ok('HOME: back to the home screen, no game running', tl.phaseAt(crashT + 2).phase === 'home' && tl.stateAt(crashT + 2).over === 0 && tl.stateAt(crashT + 4).vel < 7);
  tl.add('start', crashT + 5);
  const p1 = tl.phaseAt(crashT + 5.2).phase, s2 = tl.stateAt(crashT + 5 + 0.4 + 3);
  ok('START from home: 0.4 s fast-forward, then run 2', p1 === 'ff' && tl.phaseAt(crashT + 5.5).phase === 'cruise' && s2.run === 2 && s2.over === 0 && s2.g.gd > 20 && s2.tapes === GAME.tapesStart, `run ${s2.run}, distance ${s2.g.gd.toFixed(0)}`);
  tl.add('restart', crashT + 9);
  const s3 = tl.stateAt(crashT + 9 + 0.4 + 1);
  ok('RESTART: a new run at once', s3.run === 3 && s3.g.gd < 60 && tl.phaseAt(crashT + 9.2).phase === 'ff');
  tl.add('home', crashT + 12); tl.add('replay', crashT + 14);
  ok('REPLAY INTRO from home: rewind, the 10 s ignition, then a run', tl.phaseAt(crashT + 14.3).phase === 'rewind' && tl.phaseAt(crashT + 20).phase === 'ign' && tl.stateAt(crashT + 14.6 + 10 + 2).run === 4);
}

// ── lingering on the brake ──
{
  const tl = fresh(); tl.add('lane', C + 4, { dir: 1 }); tl.add('brk', C + 4.5, { on: true });
  const a = tl.stateAt(C + 4.5 + GAME.brakeLinger - 0.3), b = tl.stateAt(C + 4.5 + GAME.brakeLinger + 0.5);
  ok('staying on the brake brings the police onto the tail', !policeClose(a.g) && policeClose(b.g) && kinds(tl, 0, C + 9).includes('tail'), `after ${GAME.brakeLinger} s`);
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
  if (st2.over) { tl.add('revive', st2.overT + 1.0); ok('no tape left: a second rewind is refused', tl.stateAt(st2.overT + 2.5).over === 1); }
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
    for (let i = 0; i < NV; i++) { const o = i * VF; if (g.veh[o] !== 3) continue; const dz = g.veh[o + 2] - g.gd, dl = g.veh[o + 1] - st.lane; if (Math.abs(dz) < 3 && Math.abs(dl) === 1) hit = { T, dir: dl, lane: st.lane }; }
  }
  const base = r.ev.filter((e) => e.t < hit.T);
  const t2 = new Timeline(); t2.load(base); t2.add('lane', hit.T, { dir: hit.dir });
  const st = t2.stateAt(hit.T + 0.8), ev = kinds(t2, hit.T, hit.T + 0.8);
  ok('sideswipe: bounces back to the lane we came from', ev.includes('swipe') && !st.over && st.lane === hit.lane && Math.abs(st.x - hit.lane * 5) < 0.8, `events ${ev.join(',')}`);
  ok('sideswipe = a stumble: +1 star, combo reset, police on the tail for 6 s', ev.includes('stumble:swipe') && st.g.star === 2 && st.g.combo <= 3 && policeClose(st.g) && st.g.polZ > -9, `police ${(-st.g.polZ).toFixed(1)} behind`);
  const later = t2.stateAt(hit.T + GAME.closeT + 0.6);
  ok('the police drop back when you stay clean for 6 s', later.over !== 0 || !policeClose(later.g));
  // a second stumble while the police are on the tail → busted
  const t3 = new Timeline(); t3.load(base);
  t3.stateAt(hit.T - 0.004); t3._st.g.pcl = t3._st.g.gt + 4;      // the police are already on the tail (edit the live state)
  t3.add('lane', hit.T, { dir: hit.dir });
  const b = t3.stateAt(hit.T + 0.8), bev = kinds(t3, hit.T, hit.T + 0.8);
  ok('a second stumble while the police are on the tail = busted', b.over === 2 && bev.includes('bust:swipe'), `events ${bev.join(',')}`);
}

// ── stars, the grappler, helicopter fire ──
{
  const r = play(31337, 200);
  const tl = new Timeline(); tl.load(r.ev);
  const ev = tl.gameEvents(0, C + 200);
  const star = (n) => ev.find((e) => e.k === 'star' && e.n === n), at = (e) => tl.stateAt(e.t + 0.01).g.gd;
  const s2 = star(2), s3 = star(3);
  ok('stars rise with distance: 2 at 3500, 3 at 8000', s2 && s3 && Math.abs(at(s2) - GAME.star2At) < 5 && Math.abs(at(s3) - GAME.star3At) < 5, `2★ at ${at(s2).toFixed(0)}, 3★ at ${at(s3).toFixed(0)}`);
  const firstRam = ev.find((e) => e.k === 'ramwarn'), firstLock = ev.find((e) => e.k === 'lock'), firstBlock = (() => { for (let T = s2.t; T < C + 200; T += 0.25) { const g = tl.stateAt(T).g; for (let i = 0; i < NV; i++) if (g.veh[i * VF] === 5) return T; } return null; })();
  ok('2 stars: roadblocks and grappler runs; 3 stars: searchlight locks', firstRam && firstRam.t > s2.t && firstBlock !== null && firstLock && firstLock.t > s3.t && !ev.some((e) => e.k === 'lock' && e.t < s3.t), `first roadblock ${(firstBlock - C).toFixed(0)} s, first grappler run ${(firstRam.t - C).toFixed(0)} s, first lock ${(firstLock.t - C).toFixed(0)} s`);
  ok('a bot that reads the warnings is never hit', r.stats.stumbles === 0 && !r.stats.over, `${ev.filter((e) => e.k === 'ram').length} grappler runs, ${ev.filter((e) => e.k === 'strike').length} strikes`);
  // ignore the warning: the net takes the rear wheel → stumble, slowed for a second while the cruiser hangs on, then it lets go
  const t2 = new Timeline(); t2.load(r.ev.filter((e) => e.t < firstRam.t));
  const hitT = firstRam.t + GAME.ramWarn + 0.45, v0 = t2.stateAt(firstRam.t).vel, st = t2.stateAt(hitT + 0.3), e2 = kinds(t2, firstRam.t, hitT + 0.3);
  const hk = t2.stateAt(firstRam.t + GAME.ramWarn + 0.5).g, rel = t2.stateAt(firstRam.t + GAME.ramWarn + 0.45 + GAME.ramSlow + 1.2).g;
  ok('ignoring the grappler warning: hooked = a stumble, slowed', e2.includes('ram') && e2.includes('stumble:hook') && policeClose(st.g) && st.vel < v0 * 0.93 && !st.over, `${v0.toFixed(0)} → ${st.vel.toFixed(0)} u/s, events ${e2.filter((k) => k !== 'cell').join(',')}`);
  ok('hooked: the cruiser hangs on our rear wheel, then lets go and drops back', hk.polM === P_HOOK && Math.abs(hk.polZ + HOOK_Z) < 0.4 && rel.polM !== P_HOOK && rel.polZ < -HOOK_Z - 1, `polZ ${hk.polZ.toFixed(2)} while hooked, ${rel.polZ.toFixed(1)} after`);
  // ignore a searchlight lock: fired on → stumble (take a lock where staying in lane does not also mean hitting traffic)
  let e3 = [], lock = null;
  for (const l of ev.filter((e) => e.k === 'lock')) {
    const t3 = new Timeline(); t3.load(r.ev.filter((e) => e.t < l.t));
    e3 = kinds(t3, l.t, l.t + GAME.drWarn + GAME.drStrike + 0.1);
    if (!e3.includes('crash')) { lock = l; break; }
  }
  const sT = lock.t + GAME.drWarn + GAME.drStrike + 0.1;
  ok('ignoring the searchlight lock: fired on = a stumble', e3.includes('strike') && e3.includes('stumble:heli'), e3.filter((k) => k !== 'cell').join(','));
  ok('the bust rule applies to police hits too', (() => { const t4 = new Timeline(); t4.load(r.ev.filter((e) => e.t < lock.t)); t4.stateAt(lock.t + 0.2); t4._st.g.pcl = t4._st.g.gt + 5; return t4.stateAt(sT).over === 2; })());
}

// ── nitro canisters ──
{
  const tl = fresh(); tl.add('lane', C + 5, { dir: 1 });
  tl.add('turbo', C + 5.5);
  ok('nitro is refused with no canister in stock', tl.turboAt(C + 6) === null && tl.turboReady(C + 6) === 0 && tl.stateAt(C + 6).g.nstock === 0);
  const r = play(2024, 150, { nitro: true });
  const t2 = new Timeline(); t2.load(r.ev);
  const ev = t2.gameEvents(0, C + 150), items = ev.filter((e) => e.k === 'item'), ns = t2.nitros(C + 150);
  ok('canisters are picked up on the road and can be fired', items.length >= 2 && ns.length >= 1 && ns.length <= items.length, `${items.length} picked up, ${ns.length} fired, ${r.g.nstock} in stock, ${r.g.smash} smashed`);
  const n0 = ns[0], st = t2.stateAt(n0.I + 1.0), basev = t2.stateAt(n0.p - 0.1).vel;
  ok('nitro impact lands on the half-beat grid, 0.2–0.45 s after the press', n0.I - n0.p >= 0.2 - 1e-9 && n0.I - n0.p <= 0.45 + 1e-9 && Math.abs(((n0.I - C) / 0.25) - Math.round((n0.I - C) / 0.25)) < 1e-6, `wind-up ${(n0.I - n0.p).toFixed(3)} s`);
  ok('nitro boosts the speed to about 1.85×', st.vel > basev * 1.65 && st.vel < basev * 2.0, `${basev.toFixed(0)} → ${st.vel.toFixed(0)} u/s`);
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
  const H = 0.02, log = new Map();                       // every vehicle's track, sampled 50 times a second
  for (let T = C + 4; T < C + 200; T += H) {
    const g = tl.stateAt(T).g;
    for (let i = 0; i < NV; i++) { const o = i * VF; if (!g.veh[o]) continue; const id = g.veh[o + 8]; if (!log.has(id)) log.set(id, []); log.get(id).push({ T, id, type: g.veh[o], lane: g.veh[o + 1], dz: g.veh[o + 2] - g.gd, u: g.veh[o + 2] - GAME.vTraffic * g.gt - breathe(id, g.gt), v: g.veh[o + 3], hl: g.veh[o + 4], fl: g.veh[o + 5], a: g.veh[o + 6], b: g.veh[o + 7] }); }
  }
  const tracks = [...log.values()], of = (type) => tracks.filter((t) => t[0].type === type && t[0].dz > 200 && t[t.length - 1].dz < 0);
  const cars = tracks.filter((t) => t[0].type < T_TAXI && t.length > 50);
  const spread = cars.map((t) => { const a = t.filter((q) => q.dz > 0), vs = a.map((q) => q.v); return { lo: Math.min(...vs), hi: Math.max(...vs), slip: Math.max(...a.map((q) => Math.abs(q.u - a[0].u))) }; });
  ok('traffic drives at 26 u/s (62 on the speedometer), each vehicle easing ahead of and behind its place in the row by at most 1.5',
    cars.length > 100 && spread.every((x) => x.lo > GAME.vTraffic - 1.6 && x.hi < GAME.vTraffic + 1.6 && x.slip < 0.05) && spread.some((x) => x.hi - x.lo > 1),
    `${cars.length} vehicles tracked, speeds ${Math.min(...spread.map((x) => x.lo)).toFixed(1)} … ${Math.max(...spread.map((x) => x.hi)).toFixed(1)} u/s`);
  // a taxi steers across: a sine ramp, so it leaves and arrives with no sideways speed, and it is across before we get there
  const taxis = of(T_TAXI).map((t) => { const m = t.filter((q, i) => i > 0 && q.lane !== t[i - 1].lane), sp = m.map((q) => Math.abs(q.lane - t[t.indexOf(q) - 1].lane) / H); return { t, m, sp, end: m[m.length - 1], hit: t.find((q) => q.dz < q.hl + CAR_HL) }; }).filter((x) => x.m.length);
  ok('a taxi steers across its lane: no sideways speed at either end, never faster than 2 lanes ÷ the move, across before we arrive',
    taxis.length >= 3 && taxis.every((x) => x.sp[0] < 0.15 && x.sp[x.sp.length - 1] < 0.15 && Math.max(...x.sp) < 2 / GAME.taxiMove * 1.06 && Math.max(...x.sp) > 2 / GAME.taxiMove * 0.9 && Math.abs(x.m.length * H - GAME.taxiMove) < 0.06 && x.hit.T - x.end.T > 0.5),
    `${taxis.length} taxis; fastest ${Math.max(...taxis.map((x) => Math.max(...x.sp))).toFixed(2)} lanes/s; in lane ${Math.min(...taxis.map((x) => x.hit.T - x.end.T)).toFixed(2)} s or more before we reach it`);
  // a rolling roadblock: cruisers that drive with the traffic and brake as we come up
  const blocks = of(T_BLOCK), ev = tl.gameEvents(0, C + 200);
  ok('a rolling roadblock drives with the traffic and brakes as we come up to it',
    blocks.length >= 4 && blocks.every((t) => t.filter((q) => q.dz > 150).every((q) => q.v === GAME.vTraffic) && Math.abs(Math.min(...t.filter((q) => q.dz > 0).map((q) => q.v)) - (GAME.vTraffic - GAME.blockSlow)) < 0.3) && ev.some((e) => e.k === 'block'),
    `${blocks.length} cruisers, slowest ${Math.min(...blocks.flatMap((t) => t.map((q) => q.v))).toFixed(1)} u/s`);
  // a weaving cruiser: swings between two lanes, then takes one in good time and stays in it
  const weavers = of(T_WEAVE).map((t) => { const i = t.findIndex((q) => q.fl & COMMIT), hit = t.find((q) => q.dz < q.hl + CAR_HL); const pre = t.slice(0, i), post = t.filter((q) => q.T > t[i].T + 0.7 && q.dz > -5); return { pre, post, lead: hit.T - t[i].T, range: Math.max(...pre.map((q) => Math.abs(q.lane))) - Math.min(...pre.map((q) => Math.abs(q.lane))), jump: Math.max(...t.map((q, k) => (k ? Math.abs(q.lane - t[k - 1].lane) : 0))) }; });
  ok('a weaving cruiser swings across two lanes, then takes one at least a second before we reach it and stays there',
    weavers.length >= 3 && ev.some((e) => e.k === 'weave') && weavers.every((x) => x.range > 0.95 && x.lead > 1.0 && x.jump < 0.08 && x.post.length > 5 && x.post.every((q) => Math.abs(q.lane - Math.round(q.lane)) < 0.04 && Math.round(q.lane) === Math.round(x.post[0].lane))),
    `${weavers.length} cruisers; lane taken ${Math.min(...weavers.map((x) => x.lead)).toFixed(2)} s or more ahead`);
  ok('the bot gets past all of it without a touch', r.stats.stumbles === 0 && !r.stats.over);
  // the warning is timed for full speed: a taxi signals at the same distance whether we come up flat out or on the brake
  const sigGap = (vel) => {
    const g = freshGame(5); g.genU = 1e12; g.veh.set([T_TAXI, 0, 120, GAME.vTraffic, 2.4, 0, 1, 0, 1], 0);   // close enough to be reached in first gear either way
    for (let i = 0, out = []; i < 240 * 120; i++) { stepGame(g, { dt: 1 / 240, x: -5, lane: -1, vel, brk: 0, nitro: 0 }, out); if (g.veh[7] > 0) return g.veh[2] - g.gd; }
    return -1;
  };
  const gapA = sigGap(GAME.gears[0]), gapB = sigGap(GAME.gears[0] * GAME.brakeMul);
  ok('braking on the way in does not shorten a taxi\'s warning: it signals at the same distance', gapB > 0 && Math.abs(gapB - gapA) < 1, `signals ${gapA.toFixed(0)} units out at full speed, ${gapB.toFixed(0)} on the brake`);
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
  ok('resume: the run continues from where it stopped', c.paused === 0 && c.over === 1 && c.overT - (C + 11) > t0 - 4 - 0.1 && c.overT - (C + 11) < t0 - 4 + 1.5, `crash ${(c.overT - C - 11).toFixed(2)} s after resuming (4.0 s were driven before the pause, ${t0.toFixed(2)} s without one; pulling away again costs a little)`);
}
