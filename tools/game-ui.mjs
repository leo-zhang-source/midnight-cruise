// Browser test of the game flow (GPU headless Chrome): HUD, crash → EJECT panel, rewind with a spare tape,
// retry, nitro button state, wanted-level lights, and the phone layout.   node tools/game-ui.mjs
// The traffic seed is pinned (?seed=7), so the run is the same every time.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ok = (n, c, i = '') => console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const logs = [];
const open = async (ctxOpt) => {
  const ctx = await b.newContext(ctxOpt); const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 240)); });
  p.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await p.goto('http://localhost:8086/?seed=7&tier=0');
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  return p;
};
const gs = (p) => p.evaluate(() => {
  const s = MC.state(), g = s.ui.g || {}, vis = (id) => getComputedStyle(document.getElementById(id)).visibility;
  return { phase: s.phase, on: g.on, over: g.over, score: g.score, gear: g.gear, tapes: g.tapes, run: g.run, lvl: g.lvl, veh: s.game.veh ? s.game.veh.length : 0, cells: s.game.cells ? s.game.cells.length : 0,
    hud: vis('ghud'), hudScore: document.getElementById('g-score').textContent, gearTxt: document.getElementById('gear').textContent, nitro: document.getElementById('turbo').dataset.ready,
    panel: !document.getElementById('over').hidden, title: document.getElementById('over-title').textContent, ovScore: document.getElementById('ov-score').textContent,
    reviveOff: document.getElementById('revive').disabled, focus: document.activeElement && document.activeElement.id, police: vis('police') };
});

// ── desktop ──
{
  const p = await open({ viewport: { width: 1600, height: 900 } });
  let s = await gs(p); ok('no game HUD before the drive starts', s.hud === 'hidden' && !s.panel);
  await p.click('#start'); await p.waitForTimeout(500); await p.click('#skip'); await p.waitForTimeout(1600);
  s = await gs(p); ok('cruise: HUD on, traffic and cells on the road, gear shown', s.on === 1 && s.hud === 'visible' && s.veh > 0 && s.cells > 0 && s.gearTxt === 'G1', JSON.stringify({ veh: s.veh, cells: s.cells, gear: s.gearTxt }));
  ok('nitro is not ready at the start of a run', s.nitro === 'false');
  await p.waitForTimeout(5200);
  s = await gs(p); ok('driving straight on: crash → EJECT panel with the score, RETRY focused', s.over === 1 && s.panel && s.title === 'CRASHED' && s.ovScore === s.hudScore && s.ovScore !== '0' && s.focus === 'retry', `score ${s.ovScore}`);
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(150);
  ok('lane keys do nothing while the run is over', await p.evaluate(() => MC.tl.stateAt(MC.tl.frontier()).lane === 0));
  await p.keyboard.press('KeyR'); await p.waitForTimeout(400);
  s = await gs(p); ok('R rewinds with the spare tape: panel hides, tape spent', s.over === 0 && !s.panel && s.tapes === 0);
  ok('rewind shows the REW transition', await p.evaluate(() => document.getElementById('osd').dataset.icon === 'rew'));
  await p.waitForTimeout(1300); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(3500);
  s = await gs(p); ok('after the rewind, one lane change clears the truck', s.over === 0 && s.phase === 'cruise', `score ${s.score}`);
  // steer into the lane of the nearest vehicle ahead until the run ends again
  for (let i = 0; i < 150 && !(await gs(p)).over; i++) {
    const d = await p.evaluate(() => { const st = MC.tl.stateAt(MC.tl.frontier()), g = st.g; let best = null, bd = 1e9; for (let k = 0; k < g.veh.length / 9; k++) { const o = k * 9; if (!g.veh[o]) continue; const dz = g.veh[o + 2] - g.gd; if (dz > 25 && dz < bd) { bd = dz; best = Math.round(g.veh[o + 1]); } } return best === null ? 0 : Math.sign(best - st.lane); });
    if (d) await p.keyboard.press(d > 0 ? 'ArrowRight' : 'ArrowLeft');
    await p.waitForTimeout(200);
  }
  await p.waitForTimeout(1000);   // the panel appears 0.7 s after the crash
  s = await gs(p); ok('second crash: no tape left, REWIND disabled', s.over >= 1 && s.panel && s.reviveOff, JSON.stringify({ over: s.over, panel: s.panel, tapes: s.tapes }));
  await p.keyboard.press('KeyR'); await p.waitForTimeout(300);
  ok('R does nothing without a tape', (await gs(p)).over >= 1);
  await p.keyboard.press('Enter'); await p.waitForTimeout(900);
  s = await gs(p); ok('Enter retries: run 2, panel hidden, score reset', s.over === 0 && !s.panel && s.run === 2 && s.score < 300, `run ${s.run}, score ${s.score}`);
  // pause: P, the pause button, and losing the tab
  await p.keyboard.press('KeyP'); await p.waitForTimeout(300);
  const pz = () => p.evaluate(() => ({ paused: MC.tl.stateAt(MC.tl.frontier()).paused, panel: !document.getElementById('paused').hidden, osd: document.getElementById('osd-text').textContent, vel: MC.state().road.vel, focus: document.activeElement && document.activeElement.id }));
  let z = await pz(); ok('P pauses: PAUSED panel, VCR PAUSE on screen, RESUME focused', z.paused === 1 && z.panel && z.osd === 'PAUSE' && z.focus === 'resume', JSON.stringify(z));
  await p.waitForTimeout(1500);
  z = await pz(); ok('paused: the car has stopped and the run is still alive', Math.abs(z.vel) < 1 && !(await gs(p)).over);
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  z = await pz(); ok('Enter resumes', z.paused === 0 && !z.panel);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(200);
  z = await pz(); ok('hiding the tab pauses the run', z.paused === 1);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(200);
  ok('coming back leaves it paused until you resume', (await pz()).paused === 1);
  await p.click('#resume'); await p.waitForTimeout(300);
  ok('the RESUME button resumes', (await pz()).paused === 0);
  // sideswipe on purpose: find a truck alongside, steer into it → wanted level and police lights
  let hit = false;
  for (let i = 0; i < 400 && !hit; i++) {
    const side = await p.evaluate(() => { const st = MC.tl.stateAt(MC.tl.frontier()), g = st.g; if (st.over) return 9; for (let k = 0; k < g.veh.length / 9; k++) { const o = k * 9; if (g.veh[o] !== 1) continue; const dz = g.veh[o + 2] - g.gd, dl = g.veh[o + 1] - st.lane; if (Math.abs(dz) < 2.5 && Math.abs(dl) === 1) return dl; if (dz > 0 && dz < 30 && dl === 0) return 5; } return 0; });
    if (side === 9) break;
    if (side === 5) { const l = await p.evaluate(() => MC.tl.stateAt(MC.tl.frontier()).lane); await p.keyboard.press(l <= 0 ? 'ArrowRight' : 'ArrowLeft'); await p.waitForTimeout(350); continue; }
    if (side === 1 || side === -1) { await p.keyboard.press(side > 0 ? 'ArrowRight' : 'ArrowLeft'); hit = true; }
    await p.waitForTimeout(40);
  }
  await p.waitForTimeout(350);
  s = await gs(p); ok('sideswipe: wanted level 1, police lights on, run continues', hit && s.lvl === 1 && s.police === 'visible' && s.over === 0, JSON.stringify({ hit, lvl: s.lvl, police: s.police, over: s.over }));
  await p.click('#replay'); await p.waitForTimeout(400);
  s = await gs(p); ok('REPLAY INTRO leaves the game (HUD and lights off)', s.phase === 'rewind' && s.hud === 'hidden' && s.police === 'hidden' && !s.panel);
  await p.context().close();
}
// ── phone (touch) ──
{
  const p = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  await p.tap('#start'); await p.waitForTimeout(300);
  await p.evaluate(() => MC.tl.add('skip', MC.tl.frontier())); await p.waitForTimeout(7200);
  let s = await gs(p); ok('phone: crash → panel fits the screen, buttons are touch-sized', s.over === 1 && s.panel && await p.evaluate(() => { const r = document.getElementById('over').getBoundingClientRect(), a = document.getElementById('retry').getBoundingClientRect(), c = document.getElementById('revive').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && a.height >= 44 && c.height >= 44; }));
  const hud = await p.evaluate(() => { const h = document.getElementById('ghud').getBoundingClientRect(), d = document.getElementById('deck').getBoundingClientRect(), c = document.getElementById('corner').getBoundingClientRect(); return { top: h.top, left: h.left, right: h.right, deckBottom: d.bottom, cornerBottom: c.bottom }; });
  ok('phone: HUD sits below the deck bar, inside the screen', hud.top >= hud.deckBottom - 1 && hud.left >= 0 && hud.right <= 390, JSON.stringify(hud));
  await p.tap('#revive'); await p.waitForTimeout(500);
  s = await gs(p); ok('phone: tapping REWIND revives', s.over === 0 && !s.panel);
  await p.waitForTimeout(900);
  await p.touchscreen.tap(320, 520); await p.waitForTimeout(500);
  ok('phone: tap on the right half changes lane', await p.evaluate(() => MC.tl.stateAt(MC.tl.frontier()).lane === 1));
  await p.context().close();
}
console.log('console errors/warnings:', logs.length ? '\n  ' + logs.join('\n  ') : 'none');
await b.close();
