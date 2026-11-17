// Deterministic frame fingerprints: seeks the canonical script to fixed times and hashes the rendered pixels.
// Two working copies render identically when every line matches.
// Usage: node tools/frame-hash.mjs [query, e.g. "&lite=1"] [outDir to also save PNGs]
import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const q = process.argv[2] || '', out = process.argv[3];
if (out) mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await p.goto(`http://localhost:8086/?script=canonical&capture=1&tier=1${q}`, { timeout: 20000 });
await p.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
for (const T of [0.5, 8, 19, 21, 23.5, 26, 27.2, 33, 36, 48.6, 60, 73.8, 90]) {
  const png = await p.evaluate((T) => { MC.seek(T); return document.getElementById('gl').toDataURL('image/png'); }, T);
  const buf = Buffer.from(png.split(',')[1], 'base64');
  if (out) writeFileSync(`${out}/t${String(T).padStart(5, '0')}.png`, buf);
  console.log(String(T).padEnd(5), createHash('sha1').update(buf).digest('hex').slice(0, 16));
}
await b.close();
