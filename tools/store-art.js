// Store art uses a replayed game frame and the game's own title renderer.
// Framing and logo layout are adjusted; no vehicles, effects or scenery are added.
import * as THREE from '../vendor/three.module.min.js';
import { SEED } from '../js/cue.js';
import { Timeline } from '../js/timeline.js';
import { frameState } from '../js/director.js';
import { World } from '../js/world.js';
import { Title } from '../js/title.js';
import { Post } from '../js/post.js';

const q = new URLSearchParams(location.search);
const w = Number(q.get('w')) || 1260, h = Number(q.get('h')) || 1000;
let time = Number(q.get('t')) || 7.5;
const banner = q.get('layout') === 'banner';
const replayScene = q.get('scene') !== 'opening';
await document.fonts.load('600 64px "Chakra Petch"');
const canvas = document.getElementById('art');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.autoClear = false;
renderer.setPixelRatio(1);
renderer.setSize(w, h, false);
const world = new World(SEED), title = new Title(), post = new Post(renderer);
post.setSize(w, h, 1, 4);
const timeline = new Timeline();
timeline.load([{ type: 'start', t: 1, seed: 2024 }]);
const logo = frameState(timeline, 25.6, w, h, { reduced: false });
if (replayScene) {
  const replay = await (await fetch('./store-art-events.json')).json();
  timeline.events.length = 0;
  timeline._invalidate(-Infinity);
  timeline.load(replay.events);
  time = Number(q.get('t')) || replay.time;
}
const scene = frameState(timeline, time, w, h, { reduced: false });
// Use the original vehicles, world, colour and effects; the camera is reframed below.
scene.title = logo.title;
scene.neon = logo.neon;
scene.aux = logo.aux;
scene.post.fgA = 1;
Object.assign(scene.layout, banner
  ? { titleW: 0.40, titleCap: 0.14, titleY: 0.67, titleX: -0.48, neonX: -220, neonY: -60, neonS: 0.80, neonRot: 0.02, plateX: 0, plateY: -290 }
  : { titleW: 0.72, titleCap: 0.085, titleY: 0.79, titleX: 0, neonX: -220, neonY: -60, neonS: 0.80, neonRot: 0.02, plateX: 0, plateY: -290 });
// Optical reframing is equivalent to cropping a game frame; vehicle and world state stay intact.
scene.cam.fov *= q.has('zoom') ? Number(q.get('zoom')) : replayScene && !banner ? 0.94 : 1;
scene.cam.shift += Number(q.get('shift')) || 0;
scene.cam.shiftX += q.has('xshift') ? Number(q.get('xshift')) : replayScene && !banner ? -0.45 : 0;
if (q.get('logo') === '0') { scene.title.visible = false; scene.neon.pow = 0; scene.aux.a = 0; }
world.update(scene, w, h, post.W, post.H);
title.update(scene, w, h);
title.scene.updateMatrixWorld(true);
const half = title.width / 2;
const glint = title.project(scene.post.glint.tx - half, scene.post.glint.ty - 50);
const flare = title.project(scene.post.flare.tx - half, scene.post.flare.ty - 50);
post.render(world, title, scene, glint, flare, null);
const download = document.getElementById('download');
download.href = canvas.toDataURL('image/png');
download.download = `midnight-cruise-${banner ? 'banner' : 'cover'}-${w}x${h}.png`;
download.hidden = false;
document.getElementById('status').textContent = `Game frame at ${time.toFixed(2)} s · ${w} × ${h} · original game scene and title`;
