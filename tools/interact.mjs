// End-to-end interaction test (GPU headless Chrome): input → timeline → picture/sound state.
// Runs in free mode (?free=1: no traffic), so the controls can be exercised without a crash ending the run.
// The game itself is covered by tools/game-test.mjs (simulation) and tools/game-ui.mjs (browser).
import { chromium } from 'playwright-core';
const W = +(process.argv[2] || 1920), H = +(process.argv[3] || 1080);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: W, height: H } });
const errors = [];
p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 200)); });
const ok = (name, cond, info = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
const st = () => p.evaluate(() => { const T = MC.tl.frontier(); const s = MC.state(); return { T: s.T, phase: s.phase, it: s.it, ct: s.ct, thr: s.thr, steer: s.steer, thrOn: MC.tl.stateAt(MC.tl.frontier()).thrOn, preset: s.ui.preset, music: s.ui.music, audio: window.__audio?.state }; });
await p.goto('http://localhost:8086/?free=1');
await p.waitForFunction(() => window.__ready === true);
const ff = await p.evaluate(() => window.__firstFrameMs);
ok('first WebGL frame', ff < 1500, `${ff.toFixed(0)} ms after module start`);
await p.waitForTimeout(600);
let s = await st(); ok('idle before start', s.phase === 'idle');
await p.click('#start');
const tS = await p.evaluate(() => MC.tl.serialize().find((e) => e.type === 'start').t);
let mono = true, prevT = 0; for (let i = 0; i < 12; i++) { const T = await p.evaluate(() => MC.state().T); if (T < prevT) mono = false; prevT = T; await p.waitForTimeout(30); }
ok('scene clock monotonic through audio start', mono && prevT > tS, `start@${tS.toFixed(3)} now ${prevT.toFixed(3)}`);
const a = await p.evaluate(() => ({ state: MC._audio?.state, sr: MC._audio?.ctx?.sampleRate }));
s = await st(); ok('START → ignition', s.phase === 'ign', `it=${s.it?.toFixed(2)}`);
ok('audio running at 48 kHz after gesture', a.state === 'running' && a.sr === 48000, JSON.stringify(a));
await p.waitForTimeout(1500);
const lv = await p.evaluate(() => ({ level: MC._audio.level, renderT: MC._audio.renderT, T: MC.state().T }));
const clk = await p.evaluate(async () => { const c = MC._audio.ctx, t0 = c.currentTime; await new Promise((r) => setTimeout(r, 500)); return c.currentTime - t0; });
const deviceOk = clk > 0.3;
if (!deviceOk) console.log(`SKIP  worklet signal checks — this machine's audio output device is not running (context clock advanced ${clk.toFixed(3)} s in 0.5 s); the stall is reported on the deck LCD`);
const ns = await p.evaluate(() => MC._audio.samples);
ok('CC0 samples loaded into the worklet', ns === 9, `${ns}/9`);
if (deviceOk) ok('worklet producing signal', lv.level > 0.001, `rms=${lv.level?.toFixed(4)} audioT=${lv.renderT?.toFixed(3)} picT=${lv.T.toFixed(3)}`);
await p.keyboard.press('Space'); // ignored during ignition (no throttle)
await p.waitForTimeout(9000);
s = await st(); ok('ignition → cruise at 10 s', s.phase === 'cruise', `ct=${s.ct?.toFixed(2)}`);
const sync = await p.evaluate(() => { const a = MC._audio; const h = a.heardSceneTime(performance.now()); return { err: h === null ? null : h - MC.state().T, lat: a.lat }; });
if (deviceOk) ok('picture/audio clock agreement', sync.err === null || Math.abs(sync.err) < 0.02, `${sync.err === null ? 'no output timestamp in this browser' : (sync.err * 1000).toFixed(1) + ' ms'}; output latency ${(sync.lat * 1000).toFixed(1)} ms`);
// accelerate with Space
await p.keyboard.down('Space'); await p.waitForTimeout(1800);
s = await st(); ok('hold Space accelerates', s.thr > 0.8 && s.thrOn === 1, `thr=${s.thr.toFixed(2)}`);
await p.keyboard.up('Space'); await p.waitForTimeout(250);
s = await st(); ok('release Space stops throttle', s.thrOn === 0, `thr=${s.thr.toFixed(2)} (decaying)`);
await p.waitForTimeout(2500);
s = await st(); ok('throttle returns to cruise', s.thr < 0.1, `thr=${s.thr.toFixed(3)}`);
// DRIVE button with pointer (hold, then release outside the button)
const d = await p.locator('#drive').boundingBox();
await p.mouse.move(d.x + d.width / 2, d.y + d.height / 2); await p.mouse.down(); await p.waitForTimeout(900);
s = await st(); ok('hold DRIVE accelerates', s.thrOn === 1 && s.thr > 0.5, `thr=${s.thr.toFixed(2)}`);
await p.mouse.move(W / 2, H / 3); await p.mouse.up(); await p.waitForTimeout(200);
s = await st(); ok('release DRIVE (pointer moved away) stops throttle', s.thrOn === 0);
// focus loss while holding Space
await p.keyboard.down('Space'); await p.waitForTimeout(300);
await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await p.waitForTimeout(150);
s = await st(); ok('focus loss cancels acceleration', s.thrOn === 0);
await p.keyboard.up('Space');
// three lanes (s.steer = lateral position in lanes: −1, 0, +1)
const lane = () => p.evaluate(() => MC.tl.stateAt(MC.tl.frontier()).lane);
await p.mouse.move(W * 0.95, H * 0.4); await p.waitForTimeout(500);
await p.mouse.move(W * 0.05, H * 0.4); await p.waitForTimeout(600);
s = await st(); ok('moving the mouse does not change lane', Math.abs(s.steer) < 0.02, `x=${s.steer.toFixed(2)} lanes`);
await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(450);
s = await st(); ok('← moves one lane left, settled within 0.45 s', Math.abs(s.steer + 1) < 0.05, `x=${s.steer.toFixed(2)} lanes`);
await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(300);
ok('stops at the left edge', (await lane()) === -1);
await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(550);
s = await st(); ok('two quick → presses cross two lanes', Math.abs(s.steer - 1) < 0.05, `x=${s.steer.toFixed(2)} lanes`);
await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(700); await p.keyboard.up('ArrowLeft');
ok('holding ← moves only one lane (no key repeat)', (await lane()) === 0);
await p.mouse.click(W * 0.2, H * 0.45); await p.waitForTimeout(100);
ok('click on the left half of the scene → left lane', (await lane()) === -1);
await p.mouse.click(W * 0.8, H * 0.45); await p.waitForTimeout(450);
s = await st(); ok('click on the right half → back to the centre lane', (await lane()) === 0 && Math.abs(s.steer) < 0.05, `x=${s.steer.toFixed(2)} lanes`);
// turbo
await p.click('#turbo');
await p.waitForTimeout(100);
let tb = await p.evaluate(() => { const T = MC.state().T; const t = MC.tl.turboAt(T); return t && { antic: t.antic, onGrid: (() => { const k = (t.I - MC.tl.phaseAt(T).seg.C) / 0.25; return Math.abs(k - Math.round(k)) < 1e-6; })() }; });
ok('NITRO fires, impact quantised to the half-beat', tb && tb.onGrid && tb.antic >= 0.2 - 1e-9 && tb.antic <= 0.45 + 1e-9, JSON.stringify(tb));
await p.click('#turbo', { force: true }); await p.waitForTimeout(50);
const nT = await p.evaluate(() => MC.tl.nitros(MC.state().T).length);
ok('no overlapping nitro', nT === 1, `bursts=${nT}`);
const rdy = await p.evaluate(() => document.getElementById('turbo').dataset.ready);
ok('nitro shows it is not ready while it recharges', rdy === 'false');
const boost = await p.evaluate(async () => { const v0 = MC.state().road.vel; await new Promise((r) => setTimeout(r, 900)); return { v0, v1: MC.state().road.vel }; });
ok('nitro boosts the speed', boost.v1 > boost.v0 * 1.5, `${boost.v0.toFixed(0)} → ${boost.v1.toFixed(0)} u/s`);
ok('free mode hides the game HUD and never ends the run', await p.evaluate(() => getComputedStyle(document.getElementById('ghud')).visibility === 'hidden' && !MC.state().ui.g.over));
// deck starts minimised, its key expands it
ok('deck starts minimised', (await p.getAttribute('#deck', 'data-min')) === 'true');
await p.click('#deck-min'); await p.waitForTimeout(400);
ok('deck expands', (await p.getAttribute('#deck', 'data-min')) === 'false' && await p.locator('.preset[data-p="1"]').isVisible());
// presets
await p.click('.preset[data-p="1"]'); await p.waitForTimeout(300);
s = await st(); ok('preset B selected', s.preset === 1);
// music pause
await p.click('#play'); await p.waitForTimeout(800);
s = await st(); ok('music pause', s.music === false);
await p.click('#play'); await p.waitForTimeout(200);
s = await st(); ok('music resume', s.music === true);
// mute & volume
await p.click('#mute'); const mu = await p.evaluate(() => MC._audio.muted); ok('mute', mu === true); await p.click('#mute');
await p.locator('#vol').fill('40'); const vol = await p.evaluate(() => MC._audio.volume); ok('volume slider', Math.abs(vol - 0.4) < 0.01, `vol=${vol}`);
// drag the deck far outside → settles inside viewport, clear of drive controls
const bar = await p.locator('#deck-bar').boundingBox();
await p.mouse.move(bar.x + 60, bar.y + 12); await p.mouse.down();
for (let i = 1; i <= 12; i++) { await p.mouse.move(bar.x + 60 + i * 180, bar.y + 12 + i * 60); await p.waitForTimeout(16); }
await p.mouse.up(); await p.waitForTimeout(1500);
const dk2 = await p.locator('#deck').boundingBox(); const db = await p.locator('#drivebar').boundingBox();
const inside = dk2.x >= 0 && dk2.y >= 0 && dk2.x + dk2.width <= W + 1 && dk2.y + dk2.height <= H + 1;
const clear = !(dk2.x + dk2.width > db.x && dk2.y + dk2.height > db.y);
ok('deck drag settles inside viewport, clear of drive controls', inside && clear, `deck=${dk2.x.toFixed(0)},${dk2.y.toFixed(0)} ${dk2.width.toFixed(0)}x${dk2.height.toFixed(0)}`);
await p.screenshot({ path: 'renders/test_cruise.png' });
// replay → rewind → ignition, then skip
await p.waitForTimeout(6000);
await p.click('#replay'); await p.waitForTimeout(300);
s = await st(); ok('REPLAY → rewind', s.phase === 'rewind');
await p.waitForTimeout(1500);
s = await st(); ok('rewind → ignition', s.phase === 'ign', `it=${s.it?.toFixed(2)}`);
await p.keyboard.press('Escape'); await p.waitForTimeout(100);
s = await st(); ok('SKIP → fast-forward', s.phase === 'ff' || s.phase === 'cruise');
await p.waitForTimeout(600);
s = await st(); ok('skip lands in cruise', s.phase === 'cruise');
const ign = await p.evaluate(() => { const sg = MC.tl._derive().segs[0]; return sg.end - sg.s; });
ok('ignition length 10.000 s', Math.abs(ign - 10) < 1e-9, ign.toFixed(6));
// frame timing (headless GPU)
const perf = await p.evaluate(async () => { const d = []; let l = performance.now(); await new Promise((r) => { let n = 0; const f = (t) => { d.push(t - l); l = t; if (++n < 240) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); d.sort((a, b) => a - b); return { median: d[120], p95: d[228], tier: MC.tier }; });
console.log('frame ms (headless, rAF cadence):', JSON.stringify(perf));
console.log('console errors/warnings:', errors.length ? '\n  ' + errors.join('\n  ') : 'none');
await b.close();
