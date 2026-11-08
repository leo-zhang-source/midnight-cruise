// Deterministic video export: seeks every frame of the canonical timeline (START at 1.0 s) at 1920×1080,
// muxes it with the offline render of the same engine. Usage: node tools/export-video.mjs [from] [to] [fps]
import { chromium } from 'playwright-core';
import { mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const [from = 0.5, to = 12.0, fps = 60] = process.argv.slice(2).map(Number);
const R = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const frames = R('renders/video/frames'); rmSync(frames, { recursive: true, force: true }); mkdirSync(frames, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await p.goto(`http://localhost:8086/?capture=1&w=1920&h=1080&t=${from}&tier=0&script=canonical`);
await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const n = Math.round((to - from) * fps);
const t0 = Date.now();
for (let f = 0; f < n; f++) {
  await p.evaluate((T) => MC.seek(T), from + f / fps);
  await p.screenshot({ path: `${frames}/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 93 });
  if (f % 120 === 0) console.log(`frame ${f}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await b.close();
const wav = R('renders/video/audio.wav');
execFileSync('node', [R('tools/render-audio.mjs'), '--segment', String(from), String(to), wav], { stdio: 'inherit' });
const out = R('renders/video/midnight-cruise_ignition_1080p60.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${frames}/%05d.jpg`, '-i', wav,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', out], { stdio: 'inherit' });
rmSync(frames, { recursive: true, force: true }); rmSync(wav, { force: true });
console.log('wrote', out);
