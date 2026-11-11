// The game layer and the highway scenery, drawn into the world scene (so they pass through the same VHS finish):
//  · vehicles — lofted car / van / truck-cab shells, instanced (js/vehicles.js): traffic, taxis, the police
//  · solids   — instanced neon-edged boxes: trailers, pylons, gantries, the helicopter, debris
//  · glows    — instanced additive quads: lights, energy cells, nitro canisters, the hard-light roadblock,
//               ram and drone warnings, searchlights
//  · scenery  — the megastructure city on the horizon, overhead sign gantries, and a big billboard now and then
// Everything is rebuilt each frame from the frame state: no hidden state, so seeking and replays stay exact.
import * as THREE from '../vendor/three.module.min.js';
import { ROAD } from './cue.js';
import { T_CAR, T_VAN, T_TRUCK, T_TAXI, T_BLOCK } from './game.js';
import { Vehicles } from './vehicles.js';
import { hash1 } from './util.js';

const MAXB = 560, MAXG = 420;
const HASH = /* glsl */`
  float h11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
  float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`;

function makeSolids() {
  const base = new THREE.BoxGeometry(1, 1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.getAttribute('position')); g.setAttribute('normal', base.getAttribute('normal'));
  const A = {};
  for (const [n, k] of [['aP', 3], ['aS', 3], ['aC', 3], ['aM', 4]]) { A[n] = new THREE.InstancedBufferAttribute(new Float32Array(MAXB * k), k); A[n].setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, A[n]); }
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uFog: { value: new THREE.Vector3() }, uGround: { value: new THREE.Vector3() }, uSky: { value: new THREE.Vector3() } },
    vertexShader: /* glsl */`
      attribute vec3 aP, aS, aC; attribute vec4 aM;   // aM: kind (0 neon-edged body, 1 emissive, 3 plain structure), fade, seed, ribs
      varying vec3 vL, vS, vC, vN, vW; varying vec4 vM;
      void main(){ vL = position; vS = aS; vC = aC; vM = aM; vN = normal; vec3 p = aP + position * aS; vW = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uT; uniform vec3 uFog, uGround, uSky;
      varying vec3 vL, vS, vC, vN, vW; varying vec4 vM;
      ${HASH}
      void main(){
        // dissolve (far fade-in, debris fade-out): a tape-noise dither instead of alpha
        if (vM.y < 0.995 && h21(floor(gl_FragCoord.xy) + floor(uT * 30.0) * 7.0) > vM.y) discard;
        vec3 an = abs(vN); vec2 q, hs;
        if (an.x > 0.5) { q = vL.zy * vS.zy; hs = vS.zy * 0.5; }
        else if (an.y > 0.5) { q = vL.xz * vS.xz; hs = vS.xz * 0.5; }
        else { q = vL.xy * vS.xy; hs = vS.xy * 0.5; }
        vec2 d2 = hs - abs(q);
        float d = min(d2.x, d2.y), px = max(fwidth(d), 1e-4);
        float dist = length(vW - cameraPosition);
        vec3 col;
        if (vM.x < 0.5) {             // dark body with neon edges (trailers, pylons)
          float lw = max(0.05, px * 1.1);
          float e = 1.0 - smoothstep(lw, lw + px * 1.3, d);
          float ribs = 0.0;
          if (vM.w > 0.5 && an.x > 0.5) { float r = abs(fract(q.x / 1.5) - 0.5) * 1.5; ribs = (1.0 - smoothstep(0.035, 0.035 + px, r)) * 0.2; }
          if (vM.w > 0.5 && an.z > 0.5) ribs += (1.0 - smoothstep(0.02, 0.02 + px, abs(q.x))) * 0.3;     // door split on the rear face
          vec3 fill = uGround * 1.5 + vC * 0.03 + uSky * 0.22 * step(0.5, vN.y);
          col = fill + vC * (e * 1.5 + ribs);
        } else if (vM.x < 1.5) col = vC;                                                                   // emissive
        else col = uGround * 1.6 + uSky * (0.16 * step(0.5, vN.y) + 0.07 * an.x) + vC * 0.05;              // plain dark structure
        col = mix(col, uFog, (1.0 - exp(-dist / 900.0)) * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
    extensions: { derivatives: true },
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 5;
  m.userData = { A, g };
  return m;
}

function makeGlows() {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.getAttribute('position'));
  const A = {};
  for (const [n, k] of [['aP', 3], ['aU', 3], ['aV', 3], ['aC', 3], ['aM', 4]]) { A[n] = new THREE.InstancedBufferAttribute(new Float32Array(MAXG * k), k); A[n].setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, A[n]); }
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 aP, aU, aV, aC; attribute vec4 aM;   // aM: type, intensity, seed, parameter
      varying vec2 vQ, vHS; varying vec3 vC; varying vec4 vM; varying float vD;
      void main(){ vQ = position.xy * 2.0; vC = aC; vM = aM; vHS = vec2(length(aU), length(aV));
        vec3 p = aP + aU * vQ.x + aV * vQ.y; vD = length(cameraPosition - p);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uT;
      varying vec2 vQ, vHS; varying vec3 vC; varying vec4 vM; varying float vD;
      ${HASH}
      void main(){
        vec2 q = vQ; float t = vM.x, a = 0.0; vec3 col = vC;
        if (t < 0.5) {                               // 0 · soft light
          float r2 = dot(q, q); a = exp(-r2 * 4.5) * 0.65 + exp(-r2 * 46.0);
        } else if (t < 1.5) {                        // 1 · hard-light barrier: hexagonal lattice
          vec2 p = q * vHS, s = vec2(1.0, 1.7320508), h = p / 0.42;
          vec2 a1 = mod(h, s) - s * 0.5, b1 = mod(h - s * 0.5, s) - s * 0.5;
          vec2 gq = dot(a1, a1) < dot(b1, b1) ? a1 : b1;
          float hd = max(abs(gq.x), dot(abs(gq), vec2(0.5, 0.8660254)));
          float line = smoothstep(0.38, 0.47, hd);
          float sweep = 0.5 + 0.5 * sin(p.y * 2.4 - uT * 9.0 + vM.z * 6.0);
          float rail = smoothstep(0.8, 0.96, abs(q.y)), edge = smoothstep(0.95, 1.0, abs(q.x));
          a = line * (0.5 + 0.5 * sweep) + 0.1 + rail * 1.3 + edge * 0.9;
        } else if (t < 2.5) {                        // 2 · soft rectangle (ground glow)
          vec2 d = smoothstep(vec2(1.0), vec2(0.2), abs(q)); a = d.x * d.y;
        } else if (t < 3.5) {                        // 3 · rotor disc
          float r = length(q); a = smoothstep(1.0, 0.9, r) * (0.25 + 0.75 * pow(abs(sin(atan(q.y, q.x) * 2.0 + uT * 38.0)), 6.0)) * 0.6;
        } else if (t < 4.5) {                        // 4 · energy cell (diamond)
          float dd = abs(q.x) + abs(q.y);
          a = smoothstep(1.0, 0.93, dd) * (0.3 + 0.7 * smoothstep(0.5, 0.9, dd)) + exp(-dd * dd * 6.0) * 0.7;
        } else if (t < 5.5) {                        // 5 · warning triangle
          vec2 p = vec2(q.x, q.y + 0.12);
          float tri = max(abs(p.x) * 1.732 + p.y, -p.y - 0.6);
          float outer = smoothstep(0.96, 0.9, tri), inner = smoothstep(0.72, 0.66, tri);
          float bang = step(abs(p.x), 0.085) * step(-0.2, p.y) * step(p.y, 0.42) + step(length(p - vec2(0.0, -0.4)), 0.1);
          a = (outer - inner) + bang * inner + inner * 0.12;
        } else if (t < 6.5) {                        // 6 · target on the lane: outline, moving stripes, cross-hairs
          float box = max(abs(q.x), abs(q.y));
          float outline = smoothstep(0.8, 0.9, box) * smoothstep(1.0, 0.94, box);
          float stripes = step(0.5, fract(q.y * 3.0 + uT * 2.5)) * smoothstep(0.9, 0.6, box) * 0.3;
          float cross = (smoothstep(0.05, 0.02, abs(q.x)) + smoothstep(0.012, 0.004, abs(q.y))) * 0.5 * step(box, 0.8);
          a = outline + stripes + cross + smoothstep(0.9, 0.0, box) * 0.14;
        } else if (t < 7.5) {                        // 7 · chevrons running along +U
          float c1 = abs(fract(q.x * 2.2 - abs(q.y) * 0.8 - uT * 3.0) - 0.5);
          a = smoothstep(0.22, 0.1, c1) * smoothstep(1.0, 0.8, abs(q.y)) * smoothstep(1.0, 0.5, abs(q.x));
        } else if (t < 8.5) {                        // 8 · beam
          a = smoothstep(1.0, 0.0, abs(q.x)) * (0.2 + 0.8 * smoothstep(-1.0, 1.0, q.y)) * 0.5;
        } else {                                     // 9 · nitro canister: a ring with a double chevron
          float r = length(q);
          float ring = smoothstep(0.1, 0.04, abs(r - 0.82));
          vec2 p = q * 1.35; float ch = 0.0;
          for (int k = 0; k < 2; k++) { float x = p.x + 0.42 - float(k) * 0.62; float d = abs(x - (0.34 - abs(p.y) * 0.62)); ch += smoothstep(0.14, 0.06, d) * step(abs(p.y), 0.56); }
          a = ring + ch * step(r, 0.74) + exp(-r * r * 3.0) * 0.25;
        }
        gl_FragColor = vec4(col * a * vM.y * exp(-vD / 750.0), 1.0);
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 8;
  m.userData = { A, g };
  return m;
}

// The city the road leads to: megastructure towers left and right of the sun's valley, lit windows, neon bands, beacons.
function makeSkyline() {
  const geo = new THREE.PlaneGeometry(5600, 1400); geo.translate(0, 680, -1900);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, cFill: { value: new THREE.Vector3() }, cFog: { value: new THREE.Vector3() }, cA: { value: new THREE.Vector3() }, cB: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uT, uA; uniform vec3 cFill, cFog, cA, cB; varying vec3 vW;
      ${HASH}
      void main(){
        float x = vW.x, y = vW.y, open = smoothstep(360.0, 1000.0, abs(x));
        vec3 col = vec3(0.0); float a = 0.0;
        for (int L = 0; L < 2; L++) {
          float fl = float(L), bw = mix(170.0, 105.0, fl), u = x / bw + fl * 0.37;
          float id = floor(u), fx = fract(u), r = h11(id * 1.37 + fl * 17.0 + 3.0);
          float hgt = (0.32 + 0.68 * r * r) * mix(1180.0, 700.0, fl) * open;
          float w = 0.5 + 0.42 * h11(id * 7.1 + 1.0), cx = abs(fx - 0.5);
          float top = hgt * (cx < w * 0.5 ? 1.0 : 0.0) + (cx < w * 0.24 && h11(id * 3.3) > 0.45 ? hgt * 0.16 : 0.0);
          if (y < top && cx < w * 0.5) {
            float near = mix(0.5, 1.0, fl);
            vec3 body = mix(cFog, cFill, 0.55 + 0.4 * near);
            vec2 wp = vec2((fx - 0.5) * bw / 9.0, y / 14.0), wc = floor(wp), wf = fract(wp);
            float lit = step(0.7, h21(wc + id * 13.0 + fl * 5.0)) * step(0.25, wf.x) * step(wf.x, 0.75) * step(0.3, wf.y) * step(wf.y, 0.68);
            vec3 wcol = mix(cA, cB, step(0.55, h21(wc.yx + id)));
            float band = step(0.972, fract(y / 131.0 + r)) * step(0.3, r);
            float edge = smoothstep(w * 0.5 - 0.02, w * 0.5, cx) * 0.35;
            col = body + (wcol * lit * 1.1 + cB * band * 1.3 + cA * edge * 0.3) * near;
            a = 1.0;
          }
          vec2 bp = vec2((fx - 0.5) * bw, y - top - 6.0);                 // beacon on the tallest towers
          if (r > 0.72 && open > 0.5) { float bk = exp(-dot(bp, bp) / 30.0); col += vec3(1.0, 0.15, 0.2) * bk * (0.5 + 0.5 * sin(uT * 2.2 + id)) * 1.6; a = max(a, bk); }
        }
        col = mix(col, cFog, smoothstep(260.0, 0.0, y) * 0.6);
        gl_FragColor = vec4(col, a * uA);
      }`,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 1;
  return m;
}

// ── roadside advertising and road signs: drawn once to canvas (fictional brands) ──
const ADS = [
  { a: '#3ef4ff', b: '#0b1e3a', big: 'NEO CITY', small: 'CORE DISTRICT  12 KM  ·  WELCOME HOME', icon: 'city' },
  { a: '#ff4fa8', b: '#3a0730', big: 'SYNTH COLA', small: 'TASTE THE NIGHT', icon: 'sun' },
  { a: '#ffd23f', b: '#2a1a05', big: 'ARCADIA TOWERS', small: 'LIVE ABOVE THE CLOUDS  ·  NOW LEASING', icon: 'tower' },
  { a: '#b8ff2e', b: '#0d2410', big: 'NITE 86 FM', small: 'ALL NIGHT  ·  NO STATIC', icon: 'wave' },
  { a: '#ff8a3c', b: '#33100a', big: 'HYPERLINE', small: 'COAST TO CORE IN 9 MINUTES', icon: 'speed' },
];
function canvasTexture(W, H, draw) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
  const paint = () => { g.clearRect(0, 0, W, H); draw(g, W, H); t.needsUpdate = true; };
  paint();
  if (document.fonts && document.fonts.load) Promise.all([document.fonts.load('700 80px "Chakra Petch"'), document.fonts.load('40px "VT323"')]).then(paint, () => {});   // again once the faces are in
  return t;
}
const adTexture = (ad) => canvasTexture(1024, 432, (g, W, H) => {
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, ad.b); bg.addColorStop(1, '#05030c');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = ad.a; g.lineWidth = 6; g.strokeRect(18, 18, W - 36, H - 36);
  g.globalAlpha = 0.35; g.lineWidth = 2; g.strokeRect(32, 32, W - 64, H - 64); g.globalAlpha = 1;
  const cx = 190, cy = H / 2;                                                // pictogram on the left
  g.strokeStyle = ad.a; g.fillStyle = ad.a; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
  if (ad.icon === 'sun') { for (let k = 0; k < 6; k++) { const y = cy - 92 + k * 34, hw = Math.sqrt(Math.max(0, 110 * 110 - (y + 10 - cy) ** 2)); g.fillRect(cx - hw, y, hw * 2, 20 - k * 2); } }
  else if (ad.icon === 'city') { [[-90, 150], [-52, 220], [-14, 110], [24, 250], [62, 170]].forEach(([x, h]) => g.fillRect(cx + x, cy + 120 - h, 30, h)); }
  else if (ad.icon === 'tower') { g.beginPath(); g.moveTo(cx - 60, cy + 115); g.lineTo(cx - 18, cy - 125); g.lineTo(cx + 18, cy - 125); g.lineTo(cx + 60, cy + 115); g.stroke(); for (let k = 0; k < 6; k++) { const y = cy - 90 + k * 38, w = 22 + k * 7; g.beginPath(); g.moveTo(cx - w, y); g.lineTo(cx + w, y); g.stroke(); } }
  else if (ad.icon === 'wave') { g.beginPath(); for (let x = -105; x <= 105; x += 3) { const y = cy + Math.sin(x * 0.085) * 62 * Math.exp(-((x / 105) ** 2) * 1.6); if (x === -105) g.moveTo(cx + x, y); else g.lineTo(cx + x, y); } g.stroke(); g.beginPath(); g.arc(cx, cy, 118, 0, Math.PI * 2); g.stroke(); }
  else { for (let k = 0; k < 5; k++) { const y = cy - 80 + k * 40; g.beginPath(); g.moveTo(cx - 100 + k * 16, y); g.lineTo(cx + 40, y); g.stroke(); } g.beginPath(); g.moveTo(cx + 62, cy - 104); g.lineTo(cx + 124, cy); g.lineTo(cx + 62, cy + 104); g.stroke(); }
  g.textBaseline = 'middle'; g.textAlign = 'left';                           // brand and tag line
  let size = 132; const font = (s) => `italic 700 ${s}px "Chakra Petch", "Arial Narrow", sans-serif`;
  g.font = font(size); while (g.measureText(ad.big).width > 600 && size > 56) { size -= 4; g.font = font(size); }
  const tg = g.createLinearGradient(0, cy - 110, 0, cy + 20); tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, ad.a);
  g.fillStyle = tg; g.shadowColor = ad.a; g.shadowBlur = 26; g.fillText(ad.big, 372, cy - 42); g.shadowBlur = 0;
  g.fillStyle = ad.a; g.fillRect(372, cy + 36, 600, 4);
  g.fillStyle = '#f4eeff'; size = 46; const mono = (s) => `${s}px "VT323", monospace`;
  g.font = mono(size); while (g.measureText(ad.small).width > 600 && size > 24) { size -= 2; g.font = mono(size); }
  g.fillText(ad.small, 372, cy + 84);
});
const gantryTexture = () => canvasTexture(1536, 240, (g) => {
  [['COAST RD', 'EXIT 4'], ['NEO CITY', '12 KM'], ['CORE', '9 KM']].forEach(([name, sub], i) => {
    const x = i * 512 + 26;
    g.fillStyle = '#062a33'; g.fillRect(x, 16, 460, 208);
    g.strokeStyle = '#7ff6ff'; g.lineWidth = 6; g.strokeRect(x + 9, 25, 442, 190);
    g.fillStyle = '#eafcff'; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.font = '700 70px "Chakra Petch", "Arial Narrow", sans-serif'; g.fillText(name, x + 34, 92);
    g.font = '56px "VT323", monospace'; g.fillStyle = '#7ff6ff'; g.fillText(sub, x + 36, 168);
    g.strokeStyle = '#eafcff'; g.lineWidth = 12; g.lineCap = 'round'; g.lineJoin = 'round';     // lane arrow
    g.beginPath(); g.moveTo(x + 392, 176); g.lineTo(x + 392, 70); g.moveTo(x + 360, 104); g.lineTo(x + 392, 66); g.lineTo(x + 424, 104); g.stroke();
  });
});
// a lit panel: canvas artwork, fogged and dissolved like the rest of the scene
function makePanel(w, h, tex) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uK: { value: 1 }, uFade: { value: 1 }, uT: { value: 0 }, uFog: { value: new THREE.Vector3() } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D map; uniform float uK, uFade, uT; uniform vec3 uFog; varying vec2 vUv; varying vec3 vW;
      ${HASH}
      void main(){
        if (uFade < 0.995 && h21(floor(gl_FragCoord.xy) + floor(uT * 30.0) * 7.0) > uFade) discard;
        vec4 c = texture2D(map, vUv); if (c.a < 0.05) discard;
        vec3 col = c.rgb * uK * (0.93 + 0.07 * sin(vUv.y * 420.0));                     // faint lamp rows
        gl_FragColor = vec4(mix(col, uFog, (1.0 - exp(-length(vW - cameraPosition) / 900.0)) * 0.6), 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.frustumCulled = false; m.renderOrder = 6; m.visible = false;
  return m;
}

const RED = [3.3, 0.22, 0.34], AMBER = [2.6, 1.3, 0.1], CELL = [0.72, 1.0, 0.2], NITRO = [0.35, 0.85, 1.0];
const POLICE = [0.52, 0.56, 0.7], TAXI = [0.8, 0.56, 0.03], DARK = [0.2, 0.2, 0.3];
const PAINT = [[0.5, 0.05, 0.09], [0.05, 0.28, 0.4], [0.36, 0.36, 0.42], [0.46, 0.2, 0.03], [0.2, 0.07, 0.42], [0.08, 0.3, 0.12], [0.05, 0.05, 0.08], [0.42, 0.08, 0.3]];
const BB_SPAN = 4800, BB = [{ z0: 700, side: 1 }, { z0: 2300, side: -1 }, { z0: 3900, side: 1 }];      // a billboard every 1600 units
const GA_SPAN = 4800, GA = [1500, 3900];                                                              // a sign gantry every 2400
const mod = (a, n) => ((a % n) + n) % n;

export class GameView {
  constructor() {
    this.solids = makeSolids(); this.glows = makeGlows(); this.skyline = makeSkyline(); this.veh = new Vehicles();
    this.group = new THREE.Group(); this.group.add(this.skyline, this.solids, this.veh.group, this.glows);
    this.nb = 0; this.ng = 0;
    this.ads = ADS.map(adTexture);
    this.boards = BB.map(() => { const m = makePanel(21.3, 9, this.ads[0]); this.group.add(m); return m; });
    const gt = gantryTexture();
    this.signs = GA.map(() => { const m = makePanel(15.4, 2.4, gt); this.group.add(m); return m; });
  }
  box(x, y, z, sx, sy, sz, c, kind = 0, fade = 1, k = 1, ribs = 0) {
    const i = this.nb; if (i >= MAXB) return; this.nb++;
    const A = this.solids.userData.A;
    A.aP.array.set([x, y, z], i * 3); A.aS.array.set([sx, sy, sz], i * 3); A.aC.array.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
    A.aM.array.set([kind, fade, i * 0.37, ribs], i * 4);
  }
  // quad centred at (x, y, z) with half-extent vectors U and V
  glow(x, y, z, ux, uy, uz, vx, vy, vz, c, type, inten, seed = 0, par = 0) {
    const i = this.ng; if (i >= MAXG || inten <= 0.002) return; this.ng++;
    const A = this.glows.userData.A;
    A.aP.array.set([x, y, z], i * 3); A.aU.array.set([ux, uy, uz], i * 3); A.aV.array.set([vx, vy, vz], i * 3); A.aC.array.set(c, i * 3);
    A.aM.array.set([type, inten, seed, par], i * 4);
  }
  sprite(x, y, z, r, c, inten) { this.glow(x, y, z, r, 0, 0, 0, r, 0, c, 0, inten); }
  // a police cruiser with its light bar flashing
  cruiser(x, z, yaw, fade, T, phase = 0) {
    const on = Math.floor(T * 5 + phase) % 2 === 0;
    this.veh.add('car', x, 0, z, yaw, 1.06, POLICE, fade, 2, 0.7, on ? 1 : 0.06, on ? 0.06 : 1);
    this.sprite(x - 0.35, 1.62, z, 1.7, [1, 0.1, 0.2], (on ? 1.5 : 0.1) * fade); this.sprite(x + 0.35, 1.62, z, 1.7, [0.15, 0.4, 1], (on ? 0.1 : 1.5) * fade);
    this.glow(x, 0.04, z, 3.2, 0, 0, 0, 0, 4.2, on ? [1, 0.1, 0.2] : [0.15, 0.4, 1], 2, 0.5 * fade);
  }

  update(s) {
    this.nb = 0; this.ng = 0;
    const P = s.pal, T = s.T, G = s.game, L = ROAD.lane, R = ROAD.rail;
    const edge = P.gridAlt, edge2 = P.post2;
    this.veh.begin(P, T);
    const pos = s.road.pos, sc = s.scenery ?? 1;

    // ── scenery: the city ahead ──
    const su = this.skyline.material.uniforms;
    su.uA.value = sc; su.uT.value = T; this.skyline.visible = sc > 0.003;
    su.cFill.value.set(...P.mountFill).multiplyScalar(1.4); su.cFog.value.set(...P.fog); su.cA.value.set(...P.post); su.cB.value.set(...P.post2);

    // ── scenery: overhead sign gantries ──
    const gx = R + 1.1;
    GA.forEach((z0, i) => {
      const d = mod(z0 - pos, GA_SPAN), z = 30 - d, m = this.signs[i], f = Math.min(1, (1500 - d) / 300) * sc;
      m.visible = f > 0.01;
      if (!m.visible) return;
      for (const sx of [-1, 1]) { this.box(sx * gx, 4.6, z, 0.5, 9.2, 0.5, DARK, 3, f); this.box(sx * gx, 0.5, z, 0.9, 1.0, 0.9, DARK, 3, f); }
      this.box(0, 9.25, z, gx * 2 + 0.5, 0.5, 0.5, DARK, 3, f); this.box(0, 6.75, z, gx * 2, 0.16, 0.16, DARK, 3, f);
      for (let k = -4; k <= 4; k++) this.box(k * gx / 4.5, 8.0, z, 0.1, 2.4, 0.1, DARK, 3, f);
      const u = m.material.uniforms;
      m.position.set(0, 8.0, z + 0.36); u.uK.value = 1.2; u.uFade.value = f; u.uT.value = T; u.uFog.value.set(...P.fog);
      for (const sx of [-1, 1]) this.sprite(sx * gx, 9.75, z, 0.9, [1, 0.2, 0.25], (0.6 + 0.4 * Math.sin(T * 3 + i)) * f);
      for (const l of [-1, 0, 1]) this.box(l * L, 6.6, z + 0.2, 0.9, 0.09, 0.2, [0.2, 1, 0.5], 1, f, 1.4);     // green lane lamps
    });

    // ── scenery: a big billboard now and then ──
    BB.forEach((b, i) => {
      const d = mod(b.z0 - pos, BB_SPAN), z = 40 - d, m = this.boards[i], f = Math.min(1, (1700 - d) / 300) * sc;
      m.visible = f > 0.01;
      if (!m.visible) return;
      const cyc = Math.floor((pos + BB_SPAN - b.z0) / BB_SPAN), u = m.material.uniforms;
      u.map.value = this.ads[mod(i * 2 + cyc * 3, ADS.length)];
      const x = b.side * 27, y = 22, yaw = b.side * -0.42, cs = Math.cos(yaw), sn = Math.sin(yaw);
      m.position.set(x, y, z); m.rotation.set(0, yaw, 0); u.uK.value = 1.3; u.uFade.value = f; u.uT.value = T; u.uFog.value.set(...P.fog);
      for (const o of [-6.5, 6.5]) this.box(x + o * cs, (y - 4.5) / 2, z - o * sn - 0.7, 0.9, y - 4.5, 0.9, DARK, 3, f);
      for (const o of [-9.6, -4.8, 0, 4.8, 9.6]) {                                    // frame, catwalk and lamps
        this.box(x + o * cs, y - 5.0, z - o * sn + 0.5, 0.35, 0.3, 1.4, DARK, 3, f);
        this.sprite(x + o * cs, y - 4.7, z - o * sn + 1.1, 0.8, [1, 0.95, 0.8], 1.2 * f);
      }
      this.sprite(x, y + 5.4, z, 0.9, [1, 0.15, 0.2], (0.5 + 0.5 * Math.sin(T * 2.4 + i * 2)) * 1.6 * f);
    });

    if (G && G.on && G.veh) {
      const cz = s.car.z;
      // ── traffic ──
      for (const v of G.veh) {
        const x = v.x, z = cz - v.dz, f = v.fade, id = v.id | 0;
        if (v.type === T_CAR || v.type === T_TAXI) {
          const taxi = v.type === T_TAXI;
          this.veh.add('car', x, 0, z, 0, 1.06, taxi ? TAXI : PAINT[id % PAINT.length], f, taxi ? 1 : 0, 1, 1, 1);
          this.sprite(x, 0.76, z + 2.6, 1.3 + v.dz * 0.012, RED, 0.5 * f);
          if (taxi && v.sig) {
            if (Math.floor(T * 5) % 2 === 0) { this.box(x + v.sig * 0.98, 0.82, z + 2.52, 0.2, 0.16, 0.06, AMBER, 1, f, 1.6); this.sprite(x + v.sig * 0.98, 0.82, z + 2.6, 1.0 + v.dz * 0.01, AMBER, 1.3 * f); }
            this.glow(x + v.sig * 2.6, 2.4, z, v.sig * 1.6, 0, 0, 0, 0.6, 0, AMBER, 7, 1.4 * f);
          }
        } else if (v.type === T_VAN) {
          this.veh.add('van', x, 0, z, 0, 1.06, PAINT[(id * 3 + 2) % PAINT.length], f);
          for (const sx of [-1, 1]) this.sprite(x + sx, 1.35, z + 2.9, 1.0 + v.dz * 0.01, RED, 0.4 * f);
        } else if (v.type === T_TRUCK) {
          const c = id % 2 ? edge : edge2, zt = z + 1.7;                              // a 9-long trailer behind a 3.2 cab
          this.veh.add('cab', x, 0, z - 4.6, 0, 1.0, PAINT[(id * 5 + 1) % PAINT.length], f);
          this.box(x, 2.3, zt, 2.8, 3.5, 9.0, c, 0, f, 1, 1);
          this.box(x, 0.5, zt + 4.45, 2.6, 0.14, 0.12, [0.5, 0.5, 0.6], 3, f);                    // under-run bar
          for (const sx of [-1.15, 1.15]) { this.box(x + sx, 1.5, zt + 4.52, 0.18, 0.9, 0.05, RED, 1, f); this.box(x + sx * 0.96, 0.5, zt + 3.0, 0.45, 1.0, 2.6, DARK, 3, f); }
          for (const sx of [-1.0, 0, 1.0]) this.box(x + sx, 4.0, zt + 4.52, 0.2, 0.08, 0.05, AMBER, 1, f);
          this.box(x, 0.62, zt + 4.52, 2.2, 0.07, 0.04, RED, 1, f, 0.5);
          this.sprite(x, 1.5, zt + 4.7, 2.2 + v.dz * 0.014, RED, 0.45 * f);
        } else if (v.type === T_BLOCK) {                                                // roadblock: a cruiser across the lane behind a hard-light barrier
          const ph = Math.floor(T * 4 + x) % 2 === 0, c = ph ? [1.0, 0.12, 0.2] : [0.2, 0.4, 1.0];
          this.cruiser(x, z - 0.4, x >= 0 ? 0.95 : -0.95, f, T, x);
          this.glow(x, 0.95, z + 2.55, 2.45, 0, 0, 0, 0.95, 0, c, 1, 1.6 * f, id * 0.31);
          for (const sx of [-2.42, 2.42]) { this.box(x + sx, 1.05, z + 2.55, 0.22, 2.1, 0.22, c, 0, f); this.box(x + sx, 2.16, z + 2.55, 0.3, 0.14, 0.3, c, 1, f, 3.2); }
          this.box(x, 0.06, z + 2.55, 4.9, 0.05, 0.14, c, 1, f, 2.4);
        }
      }
      // ── energy cells and nitro canisters ──
      const bob = Math.sin(T * 5.0) * 0.08;
      for (const c of G.cells) this.glow(c.x, 0.95 + bob, cz - c.dz, 0.36, 0, 0, 0, 0.5, 0, CELL, 4, 1.9 * c.fade);
      for (const c of G.items) {
        const z = cz - c.dz, k = c.fade;
        this.glow(c.x, 1.7 + bob, z, 1.5, 0, 0, 0, 1.5, 0, NITRO, 9, 2.8 * k);
        this.glow(c.x, 7, z, 0.7, 0, 0, 0, 7, 0, NITRO, 8, 1.1 * k); this.glow(c.x, 0.05, z, 2.3, 0, 0, 0, 0, 2.3, NITRO, 2, 0.6 * k);
        this.box(c.x, 1.7 + bob, z, 0.42, 1.0, 0.42, NITRO, 1, k, 1.6); this.box(c.x, 2.3 + bob, z, 0.2, 0.2, 0.2, [1, 1, 1], 1, k, 1.4);
      }
      // ── the police ──
      const pol = G.pol;
      if (pol) {
        let px = pol.x, pz = cz - pol.dz, yaw = 0;
        if (pol.busted) {                                                    // busted: it swings round us and stops across our nose
          const k = pol.busted, side = s.car.x > 0.5 ? -1 : 1;
          pz = cz - (pol.dz + (7.5 - pol.dz) * k); px = pol.x + (s.car.x - pol.x) * k + side * 3.4 * Math.sin(Math.PI * k) * (1 - 0.4 * k); yaw = side * -1.2 * k * k;
        }
        if (pz < 4) this.cruiser(px, pz, yaw, 1, T);
        if (G.ram) {                                                         // ramming run: chevrons race up the lane from behind, a warning sign on our tail
          const x = G.ram.lane * L, k = G.ram.k, c = [1.0, 0.14, 0.16], blink = Math.floor(T * 8) % 2 ? 1 : 0.45;
          this.glow(x, 0.05, cz + 1, 0, 0, -8, 1.9, 0, 0, c, 7, 1.3 + 1.5 * k);
          this.glow(x, 2.3, cz - 5, 1.0, 0, 0, 0, 1.0, 0, c, 5, 2.8 * blink);
          if (pz < 4) for (const sx of [-0.7, 0.7]) this.sprite(px + sx, 0.72, pz - 2.62, 1.2, [1, 0.95, 0.85], 0.8 + 0.8 * k);                    // its headlights on full beam
        }
      }
      if (G.drone) {                                                         // drone: a target on the lane, then the strike
        const d = G.drone, x = d.lane * L, c = d.strike ? [1.0, 0.1, 0.12] : [1.0, 0.72, 0.15], k = d.strike ? 1.6 : 0.6 + 0.3 * Math.sin(T * 14);
        this.glow(x, 0.05, cz - 4, 2.2, 0, 0, 0, 0, 9, c, 6, k);
        this.box(x, 10.5, cz - 6, 1.4, 0.3, 1.4, c, 0); this.box(x, 10.3, cz - 6, 0.5, 0.12, 0.5, c, 1, 1, 3);
        const fl = Math.floor(T * 6) % 2;
        this.sprite(x - 0.8, 10.6, cz - 6, 0.6, [1, 0.1, 0.15], fl ? 2 : 0.2); this.sprite(x + 0.8, 10.6, cz - 6, 0.6, [0.15, 0.3, 1], fl ? 0.2 : 2);
        if (d.strike) { this.glow(x, 5.2, cz - 2, 1.6, 0, 0, 0, 5.2, 0, [1, 0.25, 0.25], 8, 3.2); this.sprite(x, 0.2, cz - 2, 6, [1, 0.3, 0.3], 2.2); }
        else this.glow(x, 5.2, cz - 5, 0.35, 0, 0, 0, 5.2, 0, c, 8, 0.5);
      }
      if (G.heli) {                                                          // helicopter pacing us up ahead, searchlight on the road
        const hx = Math.sin(T * 0.37) * 7 + Math.sin(T * 0.9) * 1.5, hy = 15 + Math.sin(T * 0.6) * 0.8, hz = cz - 46, H = [0.3, 0.32, 0.45];
        this.box(hx, hy, hz, 2.3, 1.7, 4.6, H, 3); this.box(hx, hy + 0.2, hz + 4.4, 0.5, 0.5, 4.4, H, 3); this.box(hx, hy + 1.0, hz + 6.4, 0.2, 1.6, 0.8, H, 3);
        for (const sx of [-1, 1]) this.box(hx + sx * 1.0, hy - 1.25, hz, 0.14, 0.14, 3.6, H, 3);
        this.glow(hx, hy + 1.1, hz, 5.2, 0, 0, 0, 0, 5.2, [0.8, 0.85, 1.0], 3, 0.5);
        this.sprite(hx - 1.2, hy, hz + 2, 0.7, [1, 0.1, 0.15], Math.floor(T * 3) % 2 ? 2.4 : 0.3); this.sprite(hx + 1.2, hy, hz + 2, 0.7, [0.2, 1, 0.3], 1.6); this.sprite(hx, hy + 1.2, hz + 6.4, 0.6, [1, 1, 1], Math.floor(T * 2.3) % 2 ? 2.2 : 0);
        const lx = Math.sin(T * 0.8) * L * 1.2, lz = cz - 30;
        this.glow((hx + lx) / 2, hy / 2, (hz + lz) / 2, 1.4, 0, 0, (lx - hx) / 2, -hy / 2, (lz - hz) / 2, [0.9, 0.95, 1.0], 8, 0.32);
        this.sprite(lx, 0.06, lz, 5.5, [0.9, 0.95, 1.0], 0.5);
      }
      // ── debris: smashed vehicles and the wrecked car shatter into shards of light ──
      for (const b of G.bursts) {
        const n = b.car ? 26 : 18, life = b.car ? 1.1 : 0.7, a = b.age;
        if (a >= life) continue;
        const cA = b.car ? P.neon : b.type === T_TAXI ? [1, 0.82, 0.12] : b.type === T_BLOCK ? [1, 0.15, 0.2] : edge, cB = b.car ? P.gridAlt : b.type === T_BLOCK ? [0.2, 0.4, 1] : edge2;
        for (let k = 0; k < n; k++) {
          const h1 = hash1(b.seed + k * 13.1), h2 = hash1(b.seed + k * 7.7 + 3), h3 = hash1(b.seed + k * 3.3 + 9);
          const ang = h1 * Math.PI * 2, sp = 5 + 13 * h2;
          const x = b.x + Math.cos(ang) * sp * a * 0.7, y = 0.8 + (2 + 7 * h3) * a - 9 * a * a, z = cz - b.dz + Math.sin(ang) * sp * a * 0.5;
          if (y < 0.05) continue;
          const sz = (0.24 + 0.42 * h3) * (1 - a / life);
          this.box(x, y, z, sz, sz, sz * (1 + 2 * h2), k % 2 ? cA : cB, 1, 1 - a / life, 2.4);
        }
        this.sprite(b.x, 1.0, cz - b.dz, 3 + 10 * a, b.car ? P.neon : cA, Math.max(0, 1.8 - a * 5));
      }
    }

    this.veh.end();
    const sm = this.solids.material.uniforms;
    sm.uT.value = T; sm.uFog.value.set(...P.fog); sm.uGround.value.set(...P.ground); sm.uSky.value.set(...P.skyMid);
    this.glows.material.uniforms.uT.value = T;
    for (const [m, n] of [[this.solids, this.nb], [this.glows, this.ng]]) {
      m.userData.g.instanceCount = n; m.visible = n > 0;
      for (const k in m.userData.A) m.userData.A[k].needsUpdate = true;
    }
  }
}
