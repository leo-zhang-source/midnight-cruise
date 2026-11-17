// Staged moments for looking at how hits, the smash chain and the results screen play: each is a deterministic event list
// found with the bot, rendered as a run of frames around the moment.
//   node tools/juice.mjs <outDir> [WxH] [names: chain,fling,outrun,crash,swipe,results,idle] [dpr]   (needs the dev server on :8086)
// Also exports scenarios() for the tests.
import { play } from './bot.mjs';
import { Timeline } from '../js/timeline.js';

const C = 1.9;
const replay = (ev) => { const tl = new Timeline(); tl.load(ev); return tl; };
const upTo = (ev, t) => ev.filter((e) => e.t <= t);

export function scenarios(want = null) {
  const out = {}, need = (k) => !want || want.includes(k);
  // a smash chain: the bot fires nitro as it gets it and holds its lane through the burst
  if (need('chain') || need('results')) {
    let best = null;
    for (const [seed, lv] of [[2024, 8], [77, 10], [5, 12], [2031, 6]]) {
      const r = play(seed, 100, { nitro: true, seek: true, lv });
      const g = r.tl.gameEvents(0, 1e9), ends = g.filter((e) => e.k === 'chainend');
      const top = ends.sort((a, b) => b.n - a.n)[0];
      if (top && (!best || top.n > best.top.n)) best = { r, top, g };
    }
    if (best) {
      const links = best.g.filter((e) => e.k === 'smash' && e.t <= best.top.t && e.t > best.top.t - 12).slice(-best.top.n);
      out.chain = { ev: best.r.ev, at: links.map((e) => e.t), end: best.top.t, n: best.top.n, note: `chain ×${best.top.n}, ${best.top.pts} pts` };
    }
  }
  // the interceptor swerves in while a nitro burst is on: thrown off the road
  if (need('fling') || need('outrun')) {
    for (const [seed, lv] of [[11, 14], [23, 14], [42, 15], [7, 16], [99, 14], [1234, 15]]) {
      const r = play(seed, 110, { seek: true, lv });           // no nitro: canisters are kept
      const g = r.tl.gameEvents(0, 1e9);
      for (const tell of g.filter((e) => e.k === 'ictell')) {
        if (out.fling) break;
        if (r.tl.stateAt(tell.t).g.nstock < 1) continue;
        const ev = [...upTo(r.ev, tell.t), { type: 'turbo', t: +(tell.t + Math.max(0.05, tell.w - 0.5)).toFixed(3) }];
        const tl = replay(ev), sh = tl.gameEvents(tell.t, tell.t + 4).find((e) => e.k === 'shove' && e.ic);
        if (sh) out.fling = { ev, at: [sh.t], tell: tell.t, note: `interceptor thrown ${sh.dir > 0 ? 'right' : 'left'}, ${sh.pts} pts` };
      }
      for (const warn of g.filter((e) => e.k === 'icwarn')) {
        if (out.outrun) break;
        if (r.tl.stateAt(warn.t + 1.6).g.nstock < 1) continue;
        const ev = [...upTo(r.ev, warn.t + 1.6), { type: 'turbo', t: +(warn.t + 1.6).toFixed(3) }];
        const tl = replay(ev), o = tl.gameEvents(warn.t, warn.t + 4).find((e) => e.k === 'outrun' && e.who === 'ic');
        if (o) out.outrun = { ev, at: [o.t], note: 'interceptor left behind' };
      }
      if (out.fling && out.outrun) break;
    }
  }
  // hands off the wheel: a hit that costs a life, then the one that ends the run
  if (need('crash') || need('swipe') || need('results')) {
    const r = play(2024, 60, { seek: true, idle: [C + 14, 1e9] });
    const g = r.tl.gameEvents(0, 1e9), st = g.find((e) => e.k === 'stumble'), over = g.find((e) => e.k === 'over');
    if (st) out.swipe = { ev: r.ev, at: [st.t], note: 'first hit: ' + st.by };
    if (over) out.crash = { ev: r.ev, at: [over.t], note: 'run over, kind ' + over.kind };
  }
  // a good run that ends: for the results screen (the chain run, then hands off)
  if (need('results') && out.chain) {
    const base = out.chain.ev, T0 = out.chain.end + 3;
    const tl = replay(upTo(base, T0)); let over = null;
    for (let T = T0; T < T0 + 40 && !over; T += 0.25) { const s = tl.stateAt(T); if (s.over) over = s.overT; }
    if (over) out.results = { ev: upTo(base, T0), at: [over], note: 'results after a chain run' };
  }
  return out;
}

if (process.argv[1].endsWith('juice.mjs')) {
  const { chromium } = await import('playwright-core');
  const { mkdirSync } = await import('node:fs');
  const [out = 'renders/juice', size = '1280x720', names = '', dprArg = '1'] = process.argv.slice(2);
  const [w, h] = size.split('x').map(Number), want = names ? names.split(',') : null;
  mkdirSync(out, { recursive: true });
  const S = scenarios(want && want.filter((n) => n !== 'idle'));
  const offs = { chain: [-0.05, 0.02, 0.06, 0.12, 0.2, 0.32, 0.5], fling: [-0.3, 0.02, 0.07, 0.14, 0.25, 0.4, 0.6, 0.9, 1.3], outrun: [-0.2, 0.1, 0.4, 0.8, 1.3], crash: [-0.1, 0.03, 0.08, 0.16, 0.3, 0.5], swipe: [-0.1, 0.03, 0.08, 0.16, 0.3, 0.5], results: [0.75, 1.2, 1.8, 2.6, 3.6, 5.0, 7.0] };
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: +dprArg, ...(w < 700 || h < 500 ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage(); const logs = [];
  p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') logs.push('[console] ' + m.text()); });
  await p.goto(`http://localhost:8086/?capture=1&t=0.5&tier=1`);
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const shot = async (name, ev, T) => { await p.evaluate(([ev, T]) => { MC.load(ev); MC.seek(T); }, [ev, T]); await p.waitForTimeout(60); await p.screenshot({ path: `${out}/${name}.png` }); };
  if (!want || want.includes('idle')) for (const T of [0.6, 1.0, 1.6, 3, 9.3]) await shot(`idle_${String(T).replace('.', '_')}`, [], T);
  for (const [name, sc] of Object.entries(S)) {
    if (want && !want.includes(name)) continue;
    console.log(name.padEnd(8), sc.note, '· at', sc.at.map((t) => t.toFixed(2)).join(' '));
    if (name === 'chain') {                                                   // every link at its moment, then the last one's aftermath and the banking
      for (let i = 0; i < sc.at.length; i++) await shot(`chain_${String(i + 1).padStart(2, '0')}`, sc.ev, sc.at[i] + 0.05);
      for (const o of offs.chain) await shot(`chain_last_${o < 0 ? 'm' : ''}${Math.abs(o).toFixed(2).replace('.', '_')}`, sc.ev, sc.at[sc.at.length - 1] + o);
      for (const o of [0.05, 0.4, 1.0]) await shot(`chain_bank_${o.toFixed(2).replace('.', '_')}`, sc.ev, sc.end + o);
    } else for (const o of offs[name]) await shot(`${name}_${o < 0 ? 'm' : ''}${Math.abs(o).toFixed(2).replace('.', '_')}`, sc.ev, sc.at[0] + o);
  }
  if (logs.length) console.log(logs.slice(0, 12).join('\n'));
  await b.close();
}
