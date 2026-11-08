// Audio smoke test across engines and load modes: click START, verify the worklet runs, samples load, signal flows.
// Usage: node audio-smoke.mjs <chromium|webkit|firefox> <url>
import * as pw from 'playwright';
const [engine = 'chromium', url = 'http://localhost:8086/'] = process.argv.slice(2);
const launch = engine === 'chromium' ? { channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] } : {};
const b = await pw[engine].launch({ headless: true, ...launch });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 160)); });
await p.goto(url);
await p.waitForFunction(() => window.__ready === true, null, { timeout: 30000 }).catch(() => errs.push('never rendered a frame'));
await p.click('#start').catch((e) => errs.push('click: ' + e.message));
await p.waitForTimeout(3500);
const r = await p.evaluate(() => { const a = window.MC && MC._audio; return a ? { status: a.status, mode: a.mode, ctx: a.ctx && a.ctx.state, sr: a.ctx && a.ctx.sampleRate, samples: a.samples, level: +(a.level || 0).toFixed(4), err: a.error, phase: MC.state().phase } : null; }).catch((e) => ({ evalError: e.message }));
console.log(`${engine.padEnd(9)} ${url.startsWith('file') ? 'file://' : 'http   '}  ${JSON.stringify(r)}`);
if (errs.length) console.log('   ' + errs.slice(0, 6).join('\n   '));
await b.close();
