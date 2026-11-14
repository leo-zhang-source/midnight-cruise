// Smoke test for the built pages: each one must load, replay a bot run into a five-star moment
// (the helicopter's barrage or the interceptor's swerve, with the pursuit car and traffic on screen) and log no errors.
//   node tools/smoke.mjs [url …]      default: the Pages build and both single-file builds
import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { play } from './bot.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const file = (f) => pathToFileURL(root + f).href;
const urls = process.argv.length > 2 ? process.argv.slice(2) : ['http://localhost:8086/docs/', file('dist/midnight-cruise.html'), file('dist/midnight-cruise.artifact.html')];
const r = play(1000, 240, { nitro: false }), gev = r.tl.gameEvents(0, 1e9), s5 = gev.find((e) => e.k === 'star' && e.n === 5);
const lock = gev.find((e) => e.t > s5.t && ((e.k === 'lock' && e.pat === 2) || e.k === 'ictell'));
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const url of urls) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }), errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(url + (url.includes('?') ? '&' : '?') + 'capture=1&w=1280&h=720&t=0.5&tier=0');
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const star = await p.evaluate(([ev, T]) => { MC.load(ev); MC.seek(T); return document.querySelector('#g-stars')?.dataset.n; }, [r.ev, lock.t + 0.8]);
  await p.waitForTimeout(200);
  const ok = !errs.length && star === '5'; if (!ok) bad++;
  console.log(ok ? 'PASS ' : 'FAIL ', url.replace(/^.*\/(docs|dist)\//, '$1/'), `stars ${star}`, errs.slice(0, 3).join(' | '));
  await p.close();
}
await b.close();
process.exit(bad ? 1 : 0);
