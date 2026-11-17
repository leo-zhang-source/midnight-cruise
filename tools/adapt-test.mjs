// Lite adaptive quality on a slow device: a phone viewport under heavy CPU throttling should step down to the lowest
// lite tier within a few seconds and stay there; a desktop page must never enter the lite-only tiers.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
let fail = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fail++; };
{
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
  await p.goto('http://localhost:8086/?script=canonical&t=36', { timeout: 20000 });
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  const t0 = await p.evaluate(() => ({ lite: MC.lite, tier: MC.tier }));
  ok(t0.lite && t0.tier === 3, `phone starts lite at tier 3 (${JSON.stringify(t0)})`);
  await p.evaluate(() => MC.play());
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 40 });
  const seen = [];
  for (let i = 0; i < 16; i++) { await p.waitForTimeout(1000); seen.push(await p.evaluate(() => MC.tier)); }
  ok(seen.at(-1) === 6, `slow phone reaches tier 6 (tiers over 16 s: ${seen.join(' ')})`);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await p.waitForTimeout(8000);
  const t1 = await p.evaluate(() => MC.tier);
  ok(t1 === 6, `…and stays at the lowest working tier once it runs smoothly (tier ${t1})`);
  await ctx.close();
}
{
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const cdp = await p.context().newCDPSession(p);
  await p.goto('http://localhost:8086/?script=canonical&t=36', { timeout: 20000 });
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  ok(await p.evaluate(() => !MC.lite && MC.tier === 0), 'desktop: no lite, tier 0');
  await p.evaluate(() => MC.play());
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 40 });
  await p.waitForTimeout(14000);
  const t = await p.evaluate(() => MC.tier);
  ok(t <= 4, `desktop never goes below tier 4 (tier ${t})`);
}
await b.close();
console.log(fail ? `${fail} FAILED` : 'adapt: all passed');
process.exit(fail ? 1 : 0);
