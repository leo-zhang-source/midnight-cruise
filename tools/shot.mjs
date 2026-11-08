import { chromium } from 'playwright-core';
const [url, out, w = 1100, h = 560] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(url); await p.waitForFunction(() => window.__ready === true, null, { timeout: 20000 }); await p.waitForTimeout(100);
await p.screenshot({ path: out }); await b.close(); console.log('ok');
