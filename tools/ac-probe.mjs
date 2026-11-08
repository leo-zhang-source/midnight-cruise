// Checks that the browser's audio device clock is running (AudioContext.currentTime advances).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage(); await p.goto('about:blank');
console.log(await p.evaluate(async () => {
  const c = new AudioContext(); await Promise.race([c.resume(), new Promise((r) => setTimeout(r, 2000))]);
  const t0 = c.currentTime; await new Promise((r) => setTimeout(r, 1200));
  return { state: c.state, advanced: +(c.currentTime - t0).toFixed(3), sr: c.sampleRate };
}));
await b.close();
