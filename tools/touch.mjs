// Touch-input test with an emulated phone (390x844, hasTouch): tap start, tap to change lane, the controls on screen.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const ok = (n, c, i = '') => console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`);
await p.goto('http://localhost:8086/?free=1'); await p.waitForFunction(() => window.__ready === true);   // free mode: controls only
ok('touch hint copy', (await p.textContent('#start-note')).includes('change lane'));
ok('deck starts minimised on phone', (await p.getAttribute('#deck', 'data-min')) === 'true');
await p.tap('#start'); await p.waitForTimeout(300);
ok('tap START → ignition', (await p.evaluate(() => MC.state().phase)) === 'ign');
await p.evaluate(() => { const T = MC.state().T; MC.tl.add('skip', MC.tl.frontier()); });
await p.waitForTimeout(2600);
const ev = (type, x, id = 7, el = '#gl') => p.evaluate(([type, x, id, el]) => document.querySelector(el).dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: id, clientX: x, clientY: 600, bubbles: true, isPrimary: true })), [type, x, id, el]);
await ev('pointerdown', 320); await ev('pointerup', 320); await p.waitForTimeout(450);
let s = await p.evaluate(() => MC.state()); ok('tap on the right half → right lane', Math.abs(s.steer - 1) < 0.05, `x=${s.steer.toFixed(2)} lanes`);
await ev('pointerdown', 60, 8); await ev('pointerup', 60, 8); await ev('pointerdown', 60, 8); await ev('pointerup', 60, 8); await p.waitForTimeout(500);
s = await p.evaluate(() => MC.state()); ok('two taps on the left half → left lane', Math.abs(s.steer + 1) < 0.05, `x=${s.steer.toFixed(2)} lanes`);
ok('no BRAKE control on screen: NITRO is the only drive button', !(await p.$('#brake')) && (await p.locator('#drivebar button').count()) === 1 && (await p.locator('#turbo').isVisible()));
await ev('pointerdown', 320, 9); await ev('pointercancel', 320, 9); await p.waitForTimeout(450);
s = await p.evaluate(() => MC.state()); ok('a lane change is made on the press: a touch the system then cancels has moved one lane, no more, and the car drives on', Math.abs(s.steer) < 0.05 && s.thr > 0.9, `x=${s.steer.toFixed(2)} lanes, drive=${s.thr.toFixed(2)}`);
const tgt = await p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null || getComputedStyle(b).visibility !== 'hidden').map((b) => { const r = b.getBoundingClientRect(); return [b.id || b.className, Math.round(r.width), Math.round(r.height)]; }).filter(([, w, h]) => w > 0 && (w < 44 || h < 24)));
ok('visible touch targets ≥ 44px (minimise bar key exempt)', tgt.every(([n]) => String(n).includes('deck-min')), JSON.stringify(tgt));
await b.close();
