// Browser test of the game flow (GPU headless Chrome): HUD and controls, the police at the start of a run,
// crash → EJECT panel → rewind → home screen → new run, the pause menu (resume / restart / home), nitro stock,
// a sideswipe and being busted, and the phone layout.   node tools/game-ui.mjs
// The traffic seed is pinned (?seed=7). Where the test needs to stay alive it drives with the planner from tools/bot.mjs.
import { chromium } from 'playwright-core';
import { plan } from './bot.mjs';
import { Timeline, CANONICAL } from '../js/timeline.js';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const ok = (n, c, i = '') => console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
const logs = [];
const open = async (ctxOpt, query = 'seed=7&tier=0') => {
  const ctx = await b.newContext(ctxOpt); const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 240)); });
  p.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
  await p.goto('http://localhost:8086/?' + query);
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  return p;
};
const gs = (p) => p.evaluate(() => {
  const s = MC.state(), g = s.ui.g || {}, el = (id) => document.getElementById(id), vis = (id) => getComputedStyle(el(id)).visibility;
  return { phase: s.phase, ct: s.ct, on: g.on, over: g.over, score: g.score, gear: g.gear, tapes: g.tapes, run: g.run, star: g.star, close: g.close, pol: g.pol, rew: g.rew, nstock: g.nstock, vel: s.road.vel,
    veh: s.game.veh ? s.game.veh.length : 0, cells: s.game.cells ? s.game.cells.length : 0, polDz: s.game.pol ? s.game.pol.dz : null,
    hud: vis('ghud'), hudScore: el('g-score').textContent, gearTxt: el('gear').textContent, nitro: el('turbo').dataset.ready, nitroN: el('turbo').dataset.n, nitroTxt: el('turbo-state').textContent, stars: el('g-stars').dataset.n, tail: vis('g-tail'), lives: el('g-lives').dataset.n, tailTxt: el('g-tail-text').textContent,
    panel: !el('over').hidden, title: el('over-title').textContent, ovScore: el('ov-score').textContent, reviveOff: el('revive').disabled, focus: document.activeElement && document.activeElement.id,
    police: vis('police'), paused: !el('paused').hidden, pauseBtn: el('pause').classList.contains('on'), start: vis('start-wrap'), replay: !!el('replay'), homeScore: el('home-score').hidden ? null : el('hs-last').textContent, osd: el('osd-text').textContent, brake: el('brake').getAttribute('aria-pressed') };
});
// the simulation state, as plain data for the planner
const sim = (p) => p.evaluate(() => { const st = MC.tl.stateAt(MC.tl.frontier()), g = st.g; return { ...st, g: { ...g, veh: Array.from(g.veh), cel: Array.from(g.cel), itm: Array.from(g.itm) } }; });
const steer = (p, d, touch) => (touch ? p.evaluate((d) => MC.tl.add('lane', MC.tl.frontier(), { dir: d }), d) : p.keyboard.press(d > 0 ? 'ArrowRight' : 'ArrowLeft'));
// drive cleanly for `ms` (or until `until(st)` says stop); returns the last state
async function drive(p, ms, { until, touch } = {}) {
  const t0 = Date.now(); let last = 0, st;
  while (Date.now() - t0 < ms) {
    st = await sim(p);
    if (st.over || (until && until(st))) break;
    if (Date.now() - last > 280 && st.run && !st.paused) { const r = plan(st, {}); if (r.moves.length && r.moves[0].k === 0) { await steer(p, r.moves[0].d, touch); last = Date.now(); } }
    await p.waitForTimeout(30);
  }
  return st;
}
// steer into the back of the nearest vehicle ahead until the run ends
// steers into the nearest vehicle ahead until the run is over — or, with `once`, until the first life is gone
async function wreck(p, touch, once) {
  for (let i = 0; i < 400; i++) {
    const st = await sim(p); if (st.over) break; if (once && st.g.lives < 2) return true;
    let best = null, bd = 1e9;
    for (let k = 0; k < st.g.veh.length / 9; k++) { const o = k * 9; if (!st.g.veh[o]) continue; const dz = st.g.veh[o + 2] - st.g.gd; if (dz > 22 && dz < bd) { bd = dz; best = Math.round(st.g.veh[o + 1]); } }
    if (best !== null && best !== st.lane && bd < 140) await steer(p, best > st.lane ? 1 : -1, touch);
    await p.waitForTimeout(120);
  }
  await p.waitForTimeout(1000);   // the panel appears 0.7 s after the crash
}

// ── desktop ──
{
  const p = await open({ viewport: { width: 1600, height: 900 } });
  let s = await gs(p); ok('no game HUD before the drive starts', s.hud === 'hidden' && !s.panel && s.start === 'visible' && s.homeScore === null);
  await p.click('#start'); await p.waitForTimeout(500); await p.click('#skip'); await p.waitForTimeout(1100);
  s = await gs(p); ok('a run opens with the police on the bumper: lights on, one star, pursuit car close', s.on === 1 && s.hud === 'visible' && s.stars === '1' && s.pol === 1 && s.police === 'visible' && s.polDz > -8 && s.polDz < -5, JSON.stringify({ star: s.stars, pol: s.pol, dz: s.polDz, ct: s.ct }));
  ok('nitro is empty at the start of a run', s.nitro === 'false' && s.nitroN === '0' && s.nitroTxt === 'EMPTY');
  let st = await drive(p, 3200);
  s = await gs(p); ok('flooring it: the pursuit car drops back but keeps following', !s.over && s.pol === 0 && s.polDz < -15 && s.police === 'visible' && s.vel > 50, JSON.stringify({ dz: s.polDz, v: Math.round(s.vel) }));
  ok('traffic and cells on the road, gear shown, pause key shown', s.veh > 0 && s.cells > 0 && s.gearTxt === 'G1' && s.pauseBtn, JSON.stringify({ veh: s.veh, cells: s.cells, gear: s.gearTxt }));
  // brake
  await p.keyboard.down('Space'); st = await drive(p, 900); s = await gs(p);
  ok('holding Space brakes (the car slows, the BRAKE key lights)', s.brake === 'true' && s.vel < 40 && !s.over, `v=${Math.round(s.vel)}`);
  await p.keyboard.up('Space'); st = await drive(p, 1500); s = await gs(p);
  ok('releasing it returns to full speed', s.brake === 'false' && s.vel > 50 && !s.over, `v=${Math.round(s.vel)}`);
  // the pickup sound: one per cell taken
  const chimes = async () => p.evaluate(() => MC.events().filter((e) => e.type === 'sfx' && e.name === 'cell').map((e) => +e.t.toFixed(2)));
  let ce = await chimes(); for (let i = 0; i < 8 && ce.length < 6; i++) { await drive(p, 1000); ce = await chimes(); }
  ok('taking cells plays the pickup sound, one for each', ce.length >= 6 && ce.every((t, i) => i === 0 || t > ce[i - 1]), `${ce.length} sounds, at ${ce.slice(0, 8).join(' ')} s`);
  // crash → EJECT panel → rewind
  await wreck(p);
  s = await gs(p); ok('driving into a vehicle: WRECKED panel with the score, REWIND focused', s.over === 1 && s.panel && s.title === 'WRECKED' && s.ovScore === s.hudScore && s.ovScore !== '0' && s.focus === 'revive' && !s.pauseBtn, `score ${s.ovScore}`);
  const laneBefore = await p.evaluate(() => MC.tl.stateAt(MC.tl.frontier()).lane);
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(150);
  ok('lane keys do nothing while the run is over', await p.evaluate((l) => MC.tl.stateAt(MC.tl.frontier()).lane === l, laneBefore));
  const posCrash = await p.evaluate(() => MC.state().road.pos);
  await p.keyboard.press('KeyR'); await p.waitForTimeout(450);
  s = await gs(p); const mid = await p.evaluate(() => ({ pos: MC.state().road.pos, vel: MC.state().road.vel }));
  ok('R rewinds with the spare tape: panel hides, tape spent, REW on screen', s.over === 0 && !s.panel && s.tapes === 0 && s.rew === 1 && s.osd === 'REW');
  ok('the picture runs backwards during the rewind', mid.vel < -20 && mid.pos < posCrash, `road ${posCrash.toFixed(0)} → ${mid.pos.toFixed(0)}, v=${mid.vel.toFixed(0)}`);
  await p.waitForTimeout(1000);
  st = await drive(p, 3000);
  s = await gs(p); ok('after the rewind the run carries on', s.over === 0 && s.phase === 'cruise' && s.rew === 0, `score ${s.score}`);
  await wreck(p);
  s = await gs(p); ok('second crash: no tape left, REWIND disabled, HOME focused', s.over >= 1 && s.panel && s.reviveOff && s.focus === 'home', JSON.stringify({ over: s.over, tapes: s.tapes, focus: s.focus }));
  await p.keyboard.press('KeyR'); await p.waitForTimeout(300);
  ok('R does nothing without a tape', (await gs(p)).over >= 1);
  const lastScore = (await gs(p)).ovScore;
  await p.keyboard.press('Enter'); await p.waitForTimeout(1300);
  s = await gs(p); ok('Enter on HOME → home screen: START, last and best score, no replay-intro button; no HUD', s.phase === 'home' && s.start === 'visible' && s.homeScore === lastScore && !s.replay && s.hud === 'hidden' && !s.panel && s.police === 'hidden' && s.focus === 'start', JSON.stringify({ phase: s.phase, last: s.homeScore, focus: s.focus }));
  await p.keyboard.press('Enter'); await p.waitForTimeout(900);
  s = await gs(p); ok('START from home → the intro plays again', s.phase === 'ign' && s.hud === 'hidden', s.phase);
  await p.keyboard.press('KeyS'); await p.waitForTimeout(900);
  s = await gs(p); ok('S skips it → run 2, score reset, police on the bumper again', s.phase === 'cruise' && s.over === 0 && s.run === 2 && s.score < 300 && s.pol === 1 && s.tapes === 0, `run ${s.run}, score ${s.score}, ct ${s.ct.toFixed(2)}`);
  st = await drive(p, 3500);
  // pause menu
  await p.keyboard.press('KeyP'); await p.waitForTimeout(300);
  const pz = () => p.evaluate(() => ({ paused: MC.tl.stateAt(MC.tl.frontier()).paused, panel: !document.getElementById('paused').hidden, osd: document.getElementById('osd-text').textContent, vel: MC.state().road.vel, focus: document.activeElement && document.activeElement.id }));
  let z = await pz(); ok('P pauses: PAUSED menu, VCR PAUSE on screen, RESUME focused', z.paused === 1 && z.panel && z.osd === 'PAUSE' && z.focus === 'resume', JSON.stringify(z));
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
  st = await drive(p, 1200);
  await p.click('#pause'); await p.waitForTimeout(300); await p.click('#restart'); await p.waitForTimeout(900);
  s = await gs(p); ok('pause key, then RESTART → the intro plays', s.phase === 'ign' && s.hud === 'hidden' && (await pz()).panel === false, s.phase);
  await p.click('#skip'); await p.waitForTimeout(900);
  s = await gs(p); ok('SKIP INTRO → run 3 from the top', s.phase === 'cruise' && s.run === 3 && s.score < 300 && !s.paused && (await pz()).paused === 0, `run ${s.run}, score ${s.score}`);
  // a hit takes a life and puts the police on the tail for good → a second hit ends the run
  st = await drive(p, 3200);
  let hit = await wreck(p, false, true);
  s = await gs(p); ok('a hit: one heart left, the NITRO SHAKES THEM OFF hint, pursuit car on the tail, run continues', hit === true && s.lives === '1' && s.tail === 'visible' && /NITRO SHAKES THEM OFF/.test(s.tailTxt) && s.pol === 1 && s.over === 0, JSON.stringify({ hit, lives: s.lives, stars: s.stars, tail: s.tail, txt: s.tailTxt, close: s.close, over: s.over }));
  await p.waitForTimeout(1500);
  s = await gs(p); ok('… and the police stay there', s.over !== 0 || (s.lives === '1' && s.pol === 1));
  if (!s.over) { for (let i = 0; i < 16 && !s.over && s.tail !== 'hidden'; i++) { await drive(p, 500); s = await gs(p); }     // the hint lasts four seconds of game time
    ok('the hint is gone a few seconds later; the hearts still show one life', s.over !== 0 || (s.tail === 'hidden' && s.lives === '1' && s.pol === 1), JSON.stringify({ tail: s.tail, txt: s.tailTxt, close: s.close, lives: s.lives, over: s.over })); }
  else ok('the hint is gone a few seconds later; the hearts still show one life', true, 'skipped: the run ended first');
  await wreck(p);
  s = await gs(p); ok('a second hit ends the run: WRECKED or BUSTED, no hearts left', s.over !== 0 && s.panel && (s.title === 'BUSTED' || s.title === 'WRECKED') && s.lives === '0', JSON.stringify({ over: s.over, title: s.title, lives: s.lives }));
  await p.screenshot({ path: 'renders/test_busted.png' });
  await p.click('#home'); await p.waitForTimeout(1200);
  s = await gs(p); ok('the HOME button → home screen', s.phase === 'home' && s.start === 'visible');
  await p.click('#start'); await p.waitForTimeout(400);
  s = await gs(p); ok('START from the home screen rewinds the tape to the intro', s.phase === 'rewind' && s.hud === 'hidden' && !s.panel);
  await p.context().close();
}
// ── nitro stock (deterministic: the canonical script picks up two canisters and fires them) ──
{
  const tl = new Timeline(); tl.load(CANONICAL);
  const gev = tl.gameEvents(0, 80), item = gev.find((e) => e.k === 'item'), fire = gev.find((e) => e.k === 'nitro' && e.t > item.t);
  const p = await open({ viewport: { width: 1280, height: 720 } }, `script=canonical&capture=1&w=1280&h=720&t=${(item.t + 0.6).toFixed(2)}&tier=0`);
  let s = await gs(p); ok('a picked-up canister is stored: NITRO shows one pip and READY', fire.t - item.t > 1 && s.nstock === 1 && s.nitroN === '1' && s.nitro === 'true' && s.nitroTxt === 'READY · T', JSON.stringify({ n: s.nitroN, txt: s.nitroTxt, picked: +item.t.toFixed(2), fired: +fire.t.toFixed(2) }));
  await p.evaluate((T) => MC.seek(T), fire.t + 1.1); await p.waitForTimeout(100);
  s = await gs(p); ok('firing it spends the canister: BOOST, stock back to 0, speed up', s.nstock === 0 && s.nitroN === '0' && s.nitroTxt === 'BOOST' && s.vel > 80, JSON.stringify({ n: s.nitroN, txt: s.nitroTxt, v: Math.round(s.vel) }));
  await p.evaluate(() => MC.seek(81.5)); await p.waitForTimeout(100);
  s = await gs(p); ok('canonical script ends on the home screen', s.phase === 'home' && s.start === 'visible');
  await p.context().close();
}
// ── phone (touch) ──
{
  const p = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  await p.tap('#start'); await p.waitForTimeout(300);
  await p.evaluate(() => MC.tl.add('skip', MC.tl.frontier())); await p.waitForTimeout(900);
  await drive(p, 3000, { touch: true });
  const bk = await p.locator('#brake').boundingBox();
  const pev = (type, id = 9) => p.evaluate(([type, x, y, id]) => document.getElementById('brake').dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: true })), [type, bk.x + bk.width / 2, bk.y + bk.height / 2, id]);
  await pev('pointerdown'); await drive(p, 700, { touch: true });
  let s = await gs(p); ok('phone: holding BRAKE slows the car', s.brake === 'true' && s.vel < 42, `v=${Math.round(s.vel)}`);
  await pev('pointerup'); await p.waitForTimeout(100);
  ok('phone: lifting the finger releases it', (await gs(p)).brake === 'false');
  await wreck(p, true);
  s = await gs(p); ok('phone: crash → panel fits the screen, buttons are touch-sized', s.over === 1 && s.panel && await p.evaluate(() => { const r = document.getElementById('over').getBoundingClientRect(), a = document.getElementById('home').getBoundingClientRect(), c = document.getElementById('revive').getBoundingClientRect(); return r.left >= 0 && r.right <= 390 && r.top >= 0 && r.bottom <= 844 && a.height >= 44 && c.height >= 44; }));
  const hud = await p.evaluate(() => { const h = document.getElementById('ghud').getBoundingClientRect(), d = document.getElementById('deck').getBoundingClientRect(), c = document.getElementById('corner').getBoundingClientRect(); return { top: h.top, left: h.left, right: h.right, deckBottom: d.bottom, cornerBottom: c.bottom }; });
  ok('phone: HUD sits below the deck bar, inside the screen', hud.top >= hud.deckBottom - 1 && hud.left >= 0 && hud.right <= 390, JSON.stringify(hud));
  await p.tap('#revive'); await p.waitForTimeout(500);
  s = await gs(p); ok('phone: tapping REWIND revives', s.over === 0 && !s.panel);
  await p.waitForTimeout(1100);
  const l0 = await p.evaluate(() => MC.tl.stateAt(MC.tl.frontier()).lane);
  await p.touchscreen.tap(l0 < 1 ? 320 : 60, 520); await p.waitForTimeout(400);
  ok('phone: a tap on the left / right half changes lane', await p.evaluate((l0) => MC.tl.stateAt(MC.tl.frontier()).lane === (l0 < 1 ? l0 + 1 : l0 - 1), l0));
  await p.tap('#pause'); await p.waitForTimeout(300);
  ok('phone: the pause menu fits and its buttons are touch-sized', await p.evaluate(() => { const r = document.getElementById('paused').getBoundingClientRect(); return !document.getElementById('paused').hidden && r.left >= 0 && r.right <= 390 && ['resume', 'restart', 'home2'].every((id) => document.getElementById(id).getBoundingClientRect().height >= 44); }));
  await p.tap('#home2'); await p.waitForTimeout(1200);
  s = await gs(p); ok('phone: HOME → home screen', s.phase === 'home' && s.start === 'visible');
  await p.tap('#start'); await p.waitForTimeout(900); await p.tap('#skip'); await p.waitForTimeout(900);
  s = await gs(p); ok('phone: START, then SKIP INTRO → a new run', s.phase === 'cruise' && s.run === 2);
  await p.context().close();
}
console.log('console errors/warnings:', logs.length ? '\n  ' + logs.join('\n  ') : 'none');
await b.close();
