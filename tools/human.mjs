// How long does a run last for a driver with human limits? The bot (tools/bot.mjs) reacts at once and never slips, so it only
// shows that the road is passable. This driver plans the same way but: sees a limited stretch of road ahead, acts `lag` seconds
// after deciding, and now and then is late by a good deal more (a lapse). It fires the nitro when it has lost a life (to get it
// back) or when the stock is full, and spends its spare tapes when the run ends.
//   node tools/human.mjs ['{"nitroCells":110}'] [seeds=10] [secs=600] [skills=average,skilled,expert] [lv=0]
// Prints, per skill: when the first run-ending hit comes, when the run is finally over (tapes spent), and what did it.
import { Timeline } from '../js/timeline.js';
import { GAME } from '../js/cue.js';
import { TURBO } from '../js/cue.js';
import { FS_STEP } from '../js/foresight.js';
import { plan } from './bot.mjs';

export const SKILL = {
  novice: { lag: 0.42, lapse: 0.10, late: [0.3, 0.9], horizon: 1.6 },
  average: { lag: 0.32, lapse: 0.05, late: [0.3, 0.8], horizon: 2.2 },
  skilled: { lag: 0.25, lapse: 0.02, late: [0.25, 0.7], horizon: 3.0 },
  expert: { lag: 0.21, lapse: 0.008, late: [0.2, 0.6], horizon: 4.0 },
};
const rng32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function drive(seed, secs, sk, opt = {}) {
  const tl = new Timeline(), C = 1.9, end = C + secs, rnd = rng32(seed * 2654435761 + 17);
  tl.add('start', 1, { seed, ...(opt.lv ? { lv: opt.lv } : {}) }); tl.add('skip', 1.5);
  let pend = null, last = 0, fireAt = 0, firstOver = null, final = null, rewinds = 0, reviveAt = 0;
  for (let T = C + 0.05; T < end; T += FS_STEP) {
    const st = tl.stateAt(T);
    if (st.over) {
      if (firstOver === null) firstOver = st.overT - C;
      if (st.tapes > 0) { if (!reviveAt) reviveAt = st.overT + 1.2; if (T >= reviveAt) { tl.add('revive', T); rewinds++; reviveAt = 0; pend = null; } continue; }
      final = st.overT - C; break;
    }
    if (T < st.hold) continue;
    const g = st.g, tb = tl.turboAt(T);
    // the nitro: to get a lost life back, or because the stock is full
    if (!tb && g.nstock > 0 && (g.lives < 2 || g.nstock >= GAME.nitroMax)) { if (!fireAt) fireAt = T + sk.lag + 0.15; if (T >= fireAt) { tl.add('turbo', T); fireAt = 0; } } else fireAt = 0;
    if (pend) { if (T >= pend.t) { tl.add('lane', T, { dir: pend.d }); pend = null; last = T; } continue; }
    if ((tb && tb.u < TURBO.sustain - 0.3) || T - last < 0.28) continue;            // (a burst smashes through: no steering needed)
    const safe = tb ? Math.max(0, TURBO.sustain + TURBO.recover * GAME.nitroTail + GAME.nitroGrace - tb.u - 0.15) : 0;
    const r = plan(st, { horizon: sk.horizon, tSwitch: 0.34, ...(safe ? { safe } : {}) });
    if (r.moves.length && r.moves[0].k === 0) pend = { t: T + sk.lag + (rnd() - 0.5) * 0.06 + (rnd() < sk.lapse ? sk.late[0] + rnd() * (sk.late[1] - sk.late[0]) : 0), d: r.moves[0].d };
  }
  const ev = tl.gameEvents(0, end), g = tl.stateAt(Math.min(end, C + (final ?? secs))).g;
  const hits = ev.filter((e) => e.k === 'stumble' || e.k === 'crash' || e.k === 'bust');
  return { firstOver, final, rewinds, hits: hits.map((e) => e.by || e.k), nitros: ev.filter((e) => e.k === 'nitro').length, charges: g.charges, cells: g.cells, score: g.score, lv: g.lvN, star: g.starMax };
}

if (process.argv[1].endsWith('human.mjs')) {
  const [json = '{}', n = '10', secs = '600', skills = 'average,skilled,expert', lv = '0'] = process.argv.slice(2);
  Object.assign(GAME, JSON.parse(json));
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
  const mmss = (t) => (t >= +secs ? `${Math.floor(+secs / 60)}:00+` : `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`);
  console.log(`${json}  ·  ${n} seeds, ${secs} s cap, start level ${lv}`);
  for (const name of skills.split(',')) {
    const R = []; for (let k = 0; k < +n; k++) R.push(drive(1000 + k * 7919, +secs, SKILL[name], { lv: +lv }));
    const first = R.map((r) => r.firstOver ?? +secs), fin = R.map((r) => r.final ?? +secs), by = {};
    for (const r of R) for (const h of r.hits) by[h] = (by[h] || 0) + 1;
    const perMin = (k) => (R.reduce((a, r) => a + r[k], 0) / (R.reduce((a, r) => a + (r.final ?? +secs), 0) / 60)).toFixed(2);
    console.log(`${name.padEnd(8)} first run-ending hit: median ${mmss(med(first))} (${mmss(Math.min(...first))}–${mmss(Math.max(...first))})  ·  final: median ${mmss(med(fin))} (${mmss(Math.min(...fin))}–${mmss(Math.max(...fin))}), ${R.filter((r) => r.final === null).length}/${n} never ended  ·  hits/min ${(R.reduce((a, r) => a + r.hits.length, 0) / (R.reduce((a, r) => a + (r.final ?? +secs), 0) / 60)).toFixed(2)}, nitro/min ${perMin('nitros')}  ·  median score ${Math.round(med(R.map((r) => r.score)) / 1000)}k  ·  ${JSON.stringify(by)}`);
  }
}
