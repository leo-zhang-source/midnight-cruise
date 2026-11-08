// Deterministic still capture: renders chosen scene times of the canonical script at a fixed size.
// Usage: node tools/capture.mjs <outDir> <WxH> <t1,t2,...> [extraQuery]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const [out = 'renders/stills', size = '1920x1080', times = '0.3,2,3.5', extra = ''] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
mkdirSync(out, { recursive: true });
const headed = process.env.HEADED === '1';
const b = await chromium.launch({ channel: 'chrome', headless: !headed, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const logs = [];
p.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
for (const t of times.split(',')) {
  const url = `http://localhost:8086/?capture=1&w=${w}&h=${h}&t=${t}&tier=0&${extra || 'script=canonical'}`;
  await p.goto(url);
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await p.waitForTimeout(150);
  const f = `${out}/${size}_t${String(t).replace('.', '_')}${extra.includes('reduced') ? '_rm' : ''}.png`;
  await p.screenshot({ path: f });
  console.log('saved', f);
}
console.log(logs.filter((l) => !l.includes('GPU stall')).slice(0, 30).join('\n'));
await b.close();
