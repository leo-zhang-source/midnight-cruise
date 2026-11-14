// The game layer and the highway scenery, drawn into the world scene (so they pass through the same VHS finish):
//  · vehicles — faceted bodies after the vehicle studies, instanced (js/vehicles.js): traffic, taxis, the police
//  · helicopter — one lofted body with blurred rotor discs (js/heli.js), from three stars
//  · solids   — instanced neon-edged boxes: trailers, pylons, gantries, debris
//  · glows    — instanced additive quads: lights, energy cells, nitro canisters, the grappler's net,
//               the grappler and searchlight warnings, beams, tracer fire
//  · scenery  — the megastructure city on the horizon, overhead sign gantries, a big billboard now and then, and the
//               highway's own furniture: reflector posts, roadside signs
// Everything is rebuilt each frame from the frame state: no hidden state, so seeking and replays stay exact.
import * as THREE from '../vendor/three.module.min.js';
import { ROAD } from './cue.js';
import { T_VAN, T_TRUCK, T_TAXI, T_BLOCK, T_WEAVE } from './game.js';
import { Vehicles } from './vehicles.js';
import { Heli, HELI } from './heli.js';
import { hash1, lerp, smooth } from './util.js';
import { ROAD_U, ROAD_GLSL } from './road.js';

const MAXB = 720, MAXG = 900;
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
    uniforms: { ...ROAD_U, uT: { value: 0 }, uFog: { value: new THREE.Vector3() }, uGround: { value: new THREE.Vector3() }, uSky: { value: new THREE.Vector3() } },
    vertexShader: /* glsl */`
      attribute vec3 aP, aS, aC; attribute vec4 aM;   // aM: kind (0 neon-edged body, 1 emissive, 3 plain structure), fade, heading, ribs
      varying vec3 vL, vS, vC, vN, vW; varying vec4 vM;
      ${ROAD_GLSL}
      void main(){ vL = position; vS = aS; vC = aC; vM = aM; vN = normal;
        vec3 q = position * aS; float c = cos(aM.z), s = sin(aM.z);
        vec3 p = bend(aP + vec3(c * q.x + s * q.z, q.y, c * q.z - s * q.x)); vW = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uT; uniform vec3 uFog, uGround, uSky;
      varying vec3 vL, vS, vC, vN, vW; varying vec4 vM;
      ${HASH}
      void main(){
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
        else if (vM.x > 3.5) {                                                                              // galvanised steel: the guardrail's beam, two ridges catching the sky
          float rid = an.x > 0.5 ? smoothstep(0.07, 0.0, abs(abs(q.y) - 0.085)) : 0.0;
          col = uGround * 2.4 + uSky * (0.5 * step(0.5, vN.y) + 0.2 * an.x + 0.55 * rid) + vC * 0.06;
        }
        else col = uGround * 1.6 + uSky * (0.16 * step(0.5, vN.y) + 0.07 * an.x) + vC * 0.05;              // plain dark structure
        // fade: far things come out of the haze, lights and debris dim (no dither: nothing flickers)
        if (vM.x > 0.5 && vM.x < 1.5) col *= vM.y; else col = mix(uFog, col, vM.y);
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
    uniforms: { ...ROAD_U, uT: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec3 aP, aU, aV, aC; attribute vec4 aM;   // aM: type, intensity, seed, parameter
      varying vec2 vQ, vHS; varying vec3 vC; varying vec4 vM; varying float vD;
      ${ROAD_GLSL}
      void main(){ vQ = position.xy * 2.0; vC = aC; vM = aM; vHS = vec2(length(aU), length(aV));
        vec3 p = bend(aP + aU * vQ.x + aV * vQ.y); vD = length(cameraPosition - p);
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
        } else if (t < 1.5) {                        // 1 · hexagonal lattice (the grappler's net)
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
        } else if (t < 9.5) {                        // 9 · nitro canister: a ring with a double chevron
          float r = length(q);
          float ring = smoothstep(0.1, 0.04, abs(r - 0.82));
          vec2 p = q * 1.35; float ch = 0.0;
          for (int k = 0; k < 2; k++) { float x = p.x + 0.42 - float(k) * 0.62; float d = abs(x - (0.34 - abs(p.y) * 0.62)); ch += smoothstep(0.14, 0.06, d) * step(abs(p.y), 0.56); }
          a = ring + ch * step(r, 0.74) + exp(-r * r * 3.0) * 0.25;
        } else {                                     // 10 · searchlight cone from −V (the lamp) to +V (the road): narrow and bright, then wide and thin
          float v = q.y * 0.5 + 0.5, w = mix(0.07, 1.0, v), x = abs(q.x) / w;
          a = (smoothstep(1.0, 0.0, x) * 0.7 + smoothstep(1.0, 0.82, x) * 0.3) * mix(1.0, 0.3, v) * smoothstep(0.0, 0.03, v);
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
// roadside signs on two posts
const SIGNS = [
  { bg: '#0b3d2e', fg: '#eafff4', line: '#7dffc0', big: 'NEO CITY', small: 'CORE DISTRICT  9 KM', arrow: 1 },
  { bg: '#0c2a5a', fg: '#eaf2ff', line: '#8ab8ff', big: 'REST AREA', small: 'FUEL · DINER  2 KM', arrow: 0 },
  { bg: '#3a2a05', fg: '#fff6da', line: '#ffd23f', big: 'SPEED CHECKED', small: 'BY AIRCRAFT', arrow: 0 },
];
const signTexture = (sg) => canvasTexture(640, 320, (g, W, H) => {
  g.fillStyle = sg.bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = sg.line; g.lineWidth = 8; g.strokeRect(14, 14, W - 28, H - 28);
  g.fillStyle = sg.fg; g.textBaseline = 'middle'; g.textAlign = 'left';
  let size = 104; const font = (z) => `700 ${z}px "Chakra Petch", "Arial Narrow", sans-serif`, room = sg.arrow ? 440 : 560;
  g.font = font(size); while (g.measureText(sg.big).width > room && size > 40) { size -= 4; g.font = font(size); }
  g.fillText(sg.big, 40, 122);
  g.fillStyle = sg.line; size = 60; g.font = `${size}px "VT323", monospace`; while (g.measureText(sg.small).width > 560 && size > 24) { size -= 2; g.font = `${size}px "VT323", monospace`; }
  g.fillText(sg.small, 42, 226);
  if (sg.arrow) { g.strokeStyle = sg.fg; g.lineWidth = 16; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(552, 176); g.lineTo(552, 70); g.moveTo(512, 112); g.lineTo(552, 66); g.lineTo(592, 112); g.stroke(); }
});
// a lit panel: canvas artwork, fogged and dissolved like the rest of the scene
function makePanel(w, h, tex) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...ROAD_U, map: { value: tex }, uK: { value: 1 }, uFade: { value: 1 }, uT: { value: 0 }, uFog: { value: new THREE.Vector3() } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; ${ROAD_GLSL} void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = bend(w.xyz); gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D map; uniform float uK, uFade, uT; uniform vec3 uFog; varying vec2 vUv; varying vec3 vW;
      ${HASH}
      void main(){
        vec4 c = texture2D(map, vUv); if (c.a < 0.05) discard;
        vec3 col = mix(uFog, c.rgb * uK * (0.93 + 0.07 * sin(vUv.y * 420.0)), uFade);   // faint lamp rows; far away it comes out of the haze
        gl_FragColor = vec4(mix(col, uFog, (1.0 - exp(-length(vW - cameraPosition) / 900.0)) * 0.6), 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.frustumCulled = false; m.renderOrder = 6; m.visible = false;
  return m;
}

const RED = [2.2, 0.14, 0.22], TAIL = [1.5, 0.1, 0.16], AMBER = [2.2, 1.1, 0.1], CELL = [0.72, 1.0, 0.2], NITRO = [0.35, 0.85, 1.0], LAMP = [1.0, 0.95, 0.8];
const DARK = [0.2, 0.2, 0.3], STEEL = [0.5, 0.55, 0.7];
const GRAP = [1.0, 0.8, 0.1], NET = [0.9, 1.0, 0.2];
const BB_SPAN = 4800, BB = [{ z0: 700, side: 1 }, { z0: 2300, side: -1 }, { z0: 3900, side: 1 }];      // a billboard every 1600 units
const GA_SPAN = 4800, GA = [1500, 3900];                                                              // a sign gantry every 2400
const SG_SPAN = 4800, SG = [{ z0: 1100, side: 1, k: 0 }, { z0: 3250, side: 1, k: 1 }, { z0: 4450, side: -1, k: 2 }];   // roadside signs
const POST_S = 15;                                                                                    // reflector posts on the rails
const mod = (a, n) => ((a % n) + n) % n, V1 = new THREE.Vector3();
// each body: where its tail lamps are (tz behind its middle, ty up, tx = 0: one bar across; else a lamp each side), how much road
// it lights and in what colour, and the paints it comes in (the fixed-colour ones take none)
const BODY = {
  monolith: { tz: 2.52, ty: 0.8, tx: 0, w: 1.35, glow: [0.6, 0.8, 1.0], paint: [[0.62, 0.64, 0.7], [0.3, 0.36, 0.5], [0.68, 0.6, 0.48], [0.17, 0.18, 0.23]] },
  nomad: { tz: 2.47, ty: 1.02, tx: 0.82, w: 1.4, glow: [0.7, 0.9, 0.8], paint: [[0.2, 0.4, 0.32], [0.5, 0.44, 0.3], [0.28, 0.32, 0.42], [0.45, 0.2, 0.16]] },
  firefly: { tz: 1.98, ty: 0.98, tx: 0.36, w: 1.3, glow: [1.0, 0.72, 0.1] },
  warden: { tz: 2.52, ty: 0.93, tx: 0.68, w: 1.4, glow: [0.3, 0.5, 1.0] },
  relay: { tz: 2.72, ty: 1.4, tx: 0.55, w: 1.45, glow: [0.25, 0.9, 1.0] },
  mule: { tz: 2.82, ty: 1.1, tx: 0.95, w: 1.45, glow: [1.0, 0.6, 0.1] },
  leviathan: { tz: 6.1, ty: 1.48, tx: 0.86, w: 1.75, glow: [0.25, 0.9, 1.0] },
  orbit: { tz: 6.12, ty: 1.28, tx: 0.95, w: 1.75, glow: [0.6, 0.35, 1.0], paint: [[0.62, 0.56, 0.82], [0.5, 0.74, 0.72], [0.8, 0.8, 0.85]] },
};
const WHITE = [1, 1, 1];

export class GameView {
  constructor() {
    this.solids = makeSolids(); this.glows = makeGlows(); this.skyline = makeSkyline(); this.veh = new Vehicles(); this.heli = new Heli(this.veh.u);
    this.group = new THREE.Group(); this.group.add(this.skyline, this.solids, this.veh.group, this.heli.group, this.glows);
    this.nb = 0; this.ng = 0;
    this.ads = ADS.map(adTexture);
    this.boards = BB.map(() => { const m = makePanel(21.3, 9, this.ads[0]); this.group.add(m); return m; });
    const gt = gantryTexture();
    this.signs = GA.map(() => { const m = makePanel(15.4, 2.4, gt); this.group.add(m); return m; });
    this.roadSigns = SG.map((sg) => { const m = makePanel(5.6, 2.8, signTexture(SIGNS[sg.k])); this.group.add(m); return m; });
  }
  box(x, y, z, sx, sy, sz, c, kind = 0, fade = 1, k = 1, ribs = 0, yaw = 0) {
    const i = this.nb; if (i >= MAXB) return; this.nb++;
    const A = this.solids.userData.A;
    A.aP.array.set([x, y, z], i * 3); A.aS.array.set([sx, sy, sz], i * 3); A.aC.array.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
    A.aM.array.set([kind, fade, yaw, ribs], i * 4);
  }
  // quad centred at (x, y, z) with half-extent vectors U and V
  glow(x, y, z, ux, uy, uz, vx, vy, vz, c, type, inten, seed = 0, par = 0) {
    const i = this.ng; if (i >= MAXG || inten <= 0.002) return; this.ng++;
    const A = this.glows.userData.A;
    A.aP.array.set([x, y, z], i * 3); A.aU.array.set([ux, uy, uz], i * 3); A.aV.array.set([vx, vy, vz], i * 3); A.aC.array.set(c, i * 3);
    A.aM.array.set([type, inten, seed, par], i * 4);
  }
  sprite(x, y, z, r, c, inten) { this.glow(x, y, z, r, 0, 0, 0, r, 0, c, 0, inten); }
  // a police cruiser (the WARDEN) with its light bar flashing
  cruiser(x, z, yaw, fade, T, phase = 0, roll = 0, pitch = 0, brake = 0) {
    const on = Math.floor(T * 5 + phase) % 2 === 0, cs = Math.cos(yaw), sn = Math.sin(yaw);
    this.veh.add('warden', x, 0, z, yaw, 1, WHITE, fade, 0.7, on ? 1 : 0.06, on ? 0.06 : 1, brake, roll, pitch);
    this.sprite(x - 0.5 * cs - 0.3 * sn, 1.72, z + 0.5 * sn - 0.3 * cs, 1.25, [1, 0.1, 0.2], (on ? 1.1 : 0.08) * fade); this.sprite(x + 0.5 * cs - 0.3 * sn, 1.72, z - 0.5 * sn - 0.3 * cs, 1.25, [0.15, 0.4, 1], (on ? 0.08 : 1.1) * fade);
    this.glow(x, 0.04, z, 3.2, 0, 0, 0, 0, 4.2, on ? [1, 0.1, 0.2] : [0.15, 0.4, 1], 2, 0.4 * fade);
    if (brake) this.sprite(x + sn * 2.6, 0.93, z + cs * 2.6, 1.5, RED, 0.75 * fade);
  }

  update(s) {
    this.nb = 0; this.ng = 0;
    const P = s.pal, T = s.T, G = s.game, L = ROAD.lane, R = ROAD.rail;
    const edge = P.gridAlt, edge2 = P.post2;
    this.veh.begin(P, T); this.heli.group.visible = false;
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

    // ── scenery: the highway's furniture. A steel guardrail beyond each hard shoulder: a post every POST_S, the beam between
    //    them, a reflector on every other post (amber on the left, white on the right) ──
    if (sc > 0.003) {
      const n0 = Math.ceil(pos / POST_S);
      for (const side of [-1, 1]) for (let k = 0; k < 30; k++) {
        const d = mod(-pos, POST_S) + k * POST_S, z = 30 - d, f = smooth((440 - d) / 110) * sc;
        if (f < 0.01) continue;
        const x = side * (ROAD.trail + 0.14);
        this.box(x + side * 0.1, 0.4, z, 0.12, 0.8, 0.14, DARK, 3, f); this.box(x, 0.6, z + POST_S / 2, 0.07, 0.32, POST_S, STEEL, 4, f);
        if ((n0 + k) % 2 === 0) this.sprite(x - side * 0.08, 0.86, z, 0.28, side < 0 ? [1, 0.72, 0.2] : [1, 1, 1], 0.8 * f);
      }
    }
    // ── scenery: roadside signs on two posts ──
    SG.forEach((sg, i) => {
      const d = mod(sg.z0 - pos, SG_SPAN), z = 30 - d, m = this.roadSigns[i], f = Math.min(1, (1200 - d) / 250) * sc;
      m.visible = f > 0.01;
      if (!m.visible) return;
      const x = sg.side * (R + 4.6), u = m.material.uniforms;
      for (const o of [-2.1, 2.1]) this.box(x + o, 2.3, z, 0.18, 4.6, 0.18, DARK, 3, f);
      m.position.set(x, 4.9, z + 0.14); m.rotation.set(0, sg.side * -0.22, 0); u.uK.value = 1.1; u.uFade.value = f; u.uT.value = T; u.uFog.value.set(...P.fog);
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
      // ── traffic: everyone is driving — headings follow their paths, bodies lean, wheels turn ──
      for (const v of G.veh) {
        const x = v.x, z = cz - v.dz, f = v.fade, id = v.id | 0, far = 0.8 + v.dz * 0.0045;   // lamp glows grow a little with distance, so a far car stays a steady dot
        const yaw = v.yaw, cs = Math.cos(yaw), sn = Math.sin(yaw), at = (lx, lz) => [x + cs * lx + sn * lz, z - sn * lx + cs * lz];   // a point of the car's plan, in the world
        // tail lamps streak the road behind a moving car: as long as it is fast, laid along the way it came
        const trail = (lz, w, k) => { const [px, pz] = at(0, lz), len = v.v * 0.3; this.glow(px - v.vx * 0.15, 0.045, pz + len / 2, w, 0, 0, v.vx * 0.15, 0, -len / 2, TAIL, 8, k * f); };
        if (v.type !== T_BLOCK && v.type !== T_WEAVE) {
          // which of the studies it is: a car is a MONOLITH or a NOMAD; a van a RELAY or a MULE; a long one a LEVIATHAN or,
          // one in three, an ORBIT; a taxi is always a FIREFLY
          const taxi = v.type === T_TAXI, long = v.type === T_TRUCK;
          const style = taxi ? 'firefly' : v.type === T_VAN ? (id % 2 ? 'mule' : 'relay') : long ? (id % 3 === 0 ? 'orbit' : 'leviathan') : (id % 2 ? 'nomad' : 'monolith'), B = BODY[style];
          const col = B.paint ? B.paint[(id >> 2) % B.paint.length] : WHITE, y8 = long ? 0 : yaw;
          this.veh.add(style, x, 0, z, y8, 1, col, f, 1, taxi ? 1 : 0, taxi ? 1 : 0, 0, long ? 0 : v.roll, long ? 0 : v.pitch);
          for (const sx of B.tx ? [-1, 1] : [0]) { const [tx, tz] = long ? [x + sx * B.tx, z + B.tz] : at(sx * B.tx, B.tz); this.sprite(tx, B.ty, tz, far * (B.tx ? 0.8 : 1) * (long ? 1.2 : 1), TAIL, (B.tx ? 0.26 : 0.3) * f); }
          trail(B.tz - 0.26, B.w - 0.2, 0.55);
          const [hx, hz] = at(0, -B.tz - 2.0);
          this.glow(x, 0.03, z, B.w, 0, 0, 0, 0, B.tz + 0.4, B.glow, 2, 0.4 * f); this.glow(hx, 0.03, hz, 1.2, 0, 0, 0, 0, 2.2, LAMP, 2, 0.16 * f);   // its lights on the road under it, headlamp pool ahead
          if (taxi) this.sprite(x, 2.1, z, 0.9, [1, 0.7, 0.1], 0.5 * f);                                                                     // the lit TAXI sign
          if (v.sig) {                                                       // signalling a lane change: its indicator blinks, chevrons over it run the way it is going
            if (Math.floor(T * 3.2) % 2 === 0) { const [bx, bz] = at(v.sig * 0.8, B.tz); this.box(bx, 1.2, bz, 0.2, 0.14, 0.06, AMBER, 1, f, 1.2, 0, yaw); this.sprite(bx, 1.2, bz + 0.08, far, AMBER, 0.6 * f); }
            this.glow(x + v.sig * 2.6, 2.6, z, v.sig * 1.6, 0, 0, 0, 0.6, 0, AMBER, 7, 1.2 * f);
          }
        } else if (v.type === T_BLOCK || v.type === T_WEAVE) {                         // police ahead: a rolling roadblock (it brakes as we come up), or a cruiser weaving across two lanes
          this.cruiser(x, z, yaw, f, T, id, v.roll, v.pitch, v.brake); trail(2.3, 1.15, v.brake ? 1.2 : 0.55);
          const c = [1.0, 0.14, 0.16];
          if (v.sweep) {                                                               // weaving: the two lanes it sweeps are washed in its lights, chevrons above them run the way it is steering
            const ph = Math.floor(T * 5 + id) % 2 === 0, mx = v.sweep * L * 0.5, dir = Math.abs(v.vx) > 0.4 ? Math.sign(v.vx) : 0;
            this.glow(mx, 0.035, z + 1, L * 0.5 + 2.3, 0, 0, 0, 0, 7.5, ph ? [1, 0.1, 0.2] : [0.15, 0.4, 1], 2, 0.4 * f);
            if (dir) this.glow(mx, 3.0, z, dir * (L * 0.5 + 1.6), 0, 0, 0, 0.62, 0, c, 7, 1.5 * f);
            else this.glow(x, 3.0, z, 1.0, 0, 0, 0, 1.0, 0, c, 5, 1.5 * f);
          } else if (v.sig) this.glow(x + v.sig * 2.6, 3.0, z, v.sig * 1.9, 0, 0, 0, 0.62, 0, c, 7, 1.7 * f);                                         // a roadblock cruiser crossing into the open lane: chevrons the way it goes
          else if (v.took) this.glow(v.took - 100, 3.0, z, 1.0, 0, 0, 0, 1.0, 0, c, 5, (Math.floor(T * 8) % 2 ? 2.2 : 1.1) * f);   // it has picked this lane: a warning sign over it
          else if (v.type === T_BLOCK && v.dz > 12) this.glow(x, 3.0, z, 0.8, 0, 0, 0, 0.8, 0, c, 5, 1.2 * f);                              // a rolling roadblock: a sign over each cruiser
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
        const gr = G.grap;
        if (gr && gr.k > 0.01 && pz < 6) {                                   // the grappler: a yellow fork folds out ahead of the bumper, a net across its mouth
          const k = gr.k, zn = pz - 2.82, tip = zn - 1.75 * k, w0 = 0.34, w1 = 0.34 + 0.64 * k;
          for (const sx of [-1, 1]) {
            const ax = px + sx * w0, bx = px + sx * w1, len = Math.hypot(bx - ax, tip - zn);
            this.box((ax + bx) / 2, 0.37 - 0.04 * k, (zn + tip) / 2, 0.1, 0.1, len, GRAP, 1, 1, 0.6, 0, Math.atan2(bx - ax, tip - zn));
          }
          this.box(px, 0.4, zn + 0.05, 0.9, 0.16, 0.14, GRAP, 1, 1, 0.45);                      // the mount on the push bar
          this.box(px, 0.33, tip, w1 * 2 + 0.1, 0.07, 0.07, GRAP, 1, 1, 0.75);                  // the strap across the mouth …
          this.glow(px, 0.31, tip + 0.03, w1, 0, 0, 0, 0.24, 0, NET, 1, 1.2 * k, 0.4);          // … and the net hanging from it
          if (gr.hook) {                                                      // it has our rear wheel: webbing round the tyre, sparks
            const wx = s.car.x - 0.8, wz = cz + 1.55, fl = 0.5 + 0.5 * hash1(Math.floor(T * 40));
            this.glow(wx, 0.36, wz, 0.5, 0, 0, 0, 0.4, 0, NET, 1, 2.0, 0.7); this.sprite(wx, 0.2, wz + 0.3, 0.9, [1, 0.8, 0.35], 1.6 * fl);
            this.box((px + wx) / 2, 0.34, (tip + wz) / 2, 0.05, 0.05, Math.hypot(wx - px, wz - tip), NET, 1, 1, 0.9, 0, Math.atan2(wx - px, wz - tip));
          }
        }
        if (G.ram) {                                                         // the warning: chevrons race up the lane from behind, a sign ahead of us
          const x = G.ram.lane * L, k = G.ram.k, c = [1.0, 0.14, 0.16], blink = Math.floor(T * 8) % 2 ? 1 : 0.45;
          this.glow(x, 0.05, cz + 1, 0, 0, -8, 1.9, 0, 0, c, 7, 1.3 + 1.5 * k);
          this.glow(x, 2.3, cz - 5, 1.0, 0, 0, 0, 1.0, 0, c, 5, 2.4 * blink);
          if (pz < 4) for (const sx of [-0.7, 0.7]) this.sprite(px + sx, 0.72, pz - 2.62, 1.0, LAMP, 0.5 + 0.5 * k);                    // its headlights on full beam
        }
      }
      const h = G.heli;
      if (h) {
        // The helicopter holds station well ahead of us and high up, nose towards us: three-quarter on while its searchlight hunts,
        // squared up to us once it has our lane, then it fires down the beam. It comes and goes: in from high on one side, and after
        // its attacks it turns away and climbs out on the other.
        const e = 1 - h.a, e2 = e * e, sk = h.sk, fire = h.strike >= 0, f = smooth(h.a * 3);
        const hx = h.x * lerp(2.4, 1, sk) + h.side * 80 * e2, hy = 38 + Math.sin(T * 0.6) * 0.6 + 45 * e2, hz = cz - 130 - 190 * e2;
        const yaw = Math.PI + lerp(0.8 * Math.tanh(2.5 * Math.cos(h.gt * 0.37)), Math.atan2(s.car.x - hx, cz - hz), sk) - h.side * (h.on ? 0.9 : 2.2) * e;
        const hot = sk > 0.5 && (fire || Math.floor(T * (4 + 8 * h.warn)) % 2 === 0);
        const c = fire ? [1.0, 0.16, 0.14] : sk > 0.5 ? (hot ? [1.0, 0.3, 0.12] : [1.0, 0.75, 0.2]) : [0.9, 0.95, 1.0];
        this.heli.place(hx, hy, hz, yaw, -0.05 + 0.2 * sk - 0.25 * e + (fire ? 0.012 * Math.sin(T * 95) : 0), h.side * (h.on ? 0.3 : -0.4) * e - h.bank, 2.0, f, T, c);
        const at = (k) => { this.heli.at(HELI[k], V1); return [V1.x, V1.y, V1.z]; };
        const [nlx, nly, nlz] = at('navL'), [nrx, nry, nrz] = at('navR'), [stx, sty, stz] = at('strobe'), [bx, by, bz] = at('beacon');
        this.sprite(nlx, nly, nlz, 1.0, [1, 0.1, 0.15], 1.3 * f); this.sprite(nrx, nry, nrz, 1.0, [0.2, 1, 0.3], 1.1 * f);        // red to port, green to starboard
        this.sprite(stx, sty, stz, 1.4, [1, 1, 1], ((T * 1.1) % 1 < 0.07 || (T * 1.1 + 0.16) % 1 < 0.07 ? 2.6 : 0) * f);               // the tail strobe's double flash
        this.sprite(bx, by, bz, 1.0, [1, 0.1, 0.15], (Math.floor(T * 1.6) % 2 ? 1.5 : 0.15) * f);
        const [lx, ly, lz] = at('lamp'), sx = h.sx, sz = cz - (15 - 14 * sk), wd = 2.5 + 0.6 * sk;
        this.glow((lx + sx) / 2, ly / 2, (lz + sz) / 2, wd, 0, 0, (sx - lx) / 2, -ly / 2, (sz - lz) / 2, c, 10, (0.55 + 0.35 * sk) * f);    // the beam
        this.glow(sx, 0.05, sz, 3.0 + sk, 0, 0, 0, 0, 4.6 + 1.5 * sk, c, 0, (0.55 + 0.5 * sk) * f); this.sprite(lx, ly, lz, 2.6 + 1.2 * sk, c, 1.7 * f);   // its pool on the road, the lamp's glare
        // the lock: a target on every lane it has lit. The one being fired on is red; the next one blinks faster as its time comes; with two
        // lanes lit at once a second beam falls on the other
        const AMB = [1.0, 0.75, 0.2], HOT = [1.0, 0.3, 0.12], FIRE = [1.0, 0.16, 0.14];
        for (const q of h.lanes) {
          if (q.strike >= 2) continue;
          const fq = q.strike >= 0, bl = fq || Math.floor(T * (4 + 8 * q.warn)) % 2 === 0, cq = fq ? FIRE : bl ? HOT : AMB;
          if (sk > 0.3) this.glow(q.lane * L, 0.06, cz - 2, 2.25, 0, 0, 0, 0, 7.5, cq, 6, (fq ? 1.6 : 0.45 + 0.75 * q.warn) * sk);
          if (q.lane !== h.lane && q.warn > 0.999 === (h.warn > 0.999) && sk > 0.3) {              // (twin: struck together with the lane the main beam is on)
            const qx = q.lane * L; this.glow((lx + qx) / 2, ly / 2, (lz + sz) / 2, wd, 0, 0, (qx - lx) / 2, -ly / 2, (sz - lz) / 2, cq, 10, 0.7 * sk * f);
            this.glow(qx, 0.05, sz, 3.6, 0, 0, 0, 0, 5.6, cq, 0, 0.8 * sk * f);
          }
          if (!fq) continue;                                                 // tracer fire from both gun pods walks down the lane
          const guns = [at('gunL'), at('gunR')];
          for (let i = 0; i < 5; i++) {
            const ph = (q.strike * 1.5 + i / 5) % 1, ix = q.lane * L + (hash1(i * 7 + Math.floor(T * 30)) - 0.5) * 1.6, iz = cz - 15 + 22 * ph, [gx, gy, gz] = guns[i % 2];
            if (Math.floor(T * 30 + i) % 2) this.glow((gx + ix) / 2, gy / 2, (gz + iz) / 2, 0.14, 0, 0, (ix - gx) / 2, -gy / 2, (iz - gz) / 2, [1, 0.85, 0.45], 8, 2.6);
            this.sprite(ix, 0.3, iz, 1.3, [1, 0.6, 0.25], 1.8); this.glow(ix, 0.05, iz, 1.6, 0, 0, 0, 0, 1.6, [1, 0.4, 0.2], 0, 1.2);
          }
          guns.forEach(([gx, gy, gz], i) => this.sprite(gx, gy, gz, 2.4, [1, 0.8, 0.4], (Math.floor(T * 30) + i) % 2 ? 2.4 : 0.5));
        }
      }
      // ── the interceptor: a second cruiser, up the hard shoulder. Its light bar double-flashes, its headlamps are on full beam. While it
      //    signals a swerve, chevrons run from it into the lane it is going for and a warning stands over that lane ──
      const ic = G.ic;
      if (ic && ic.fade > 0.01) {
        const x = ic.x, z = cz - ic.dz, f = ic.fade, yaw = -Math.atan2(ic.vx, Math.max(40, Math.abs(s.road.vel))) * 1.3, c = [1.0, 0.14, 0.16];
        this.cruiser(x, z, yaw, f, T * 1.8, 0.5, Math.max(-0.12, Math.min(0.12, ic.ax * 0.004)), 0, ic.leaving);
        for (const sx of [-0.7, 0.7]) this.sprite(x + sx, 0.72, z - 2.62, 1.0, LAMP, 0.9 * f);
        this.glow(x, 0.04, z - 8, 1.6, 0, 0, 0, 0, 6, LAMP, 2, 0.35 * f);
        if (ic.to !== null) {
          const tx = ic.to * L, dir = Math.sign(tx - x) || -ic.side, k = ic.tell < 0 ? 1 : ic.tell, blink = Math.floor(T * (5 + 7 * k)) % 2 ? 1 : 0.4;
          if (ic.tell >= 0) {
            this.glow((x + tx) / 2, 2.7, z, dir * (Math.abs(tx - x) / 2 + 1.2), 0, 0, 0, 0.66, 0, c, 7, 1.9 * f);                    // over it: which way it is going
            this.glow((x + tx) / 2, 0.05, z, dir * (Math.abs(tx - x) / 2 + 1.6), 0, 0, 0, 0, 3.2, c, 7, (0.9 + 1.2 * k) * f);         // on the road: across into the lane
            if (Math.floor(T * 3.2) % 2 === 0) this.sprite(x + dir * 0.8, 1.0, z + 2.5, 0.9, AMBER, 0.9 * f);                         // its indicator
          }
          this.glow(tx, 2.3, cz - 5, 1.0, 0, 0, 0, 1.0, 0, c, 5, 2.4 * blink * f);                                                       // the warning over the lane it takes
          this.glow(tx, 0.05, cz - 1, 2.2, 0, 0, 0, 0, 5.5, c, 2, (0.25 + 0.35 * k) * f);
        }
      }
      // ── debris: smashed vehicles and the wrecked car shatter into shards of light ──
      for (const b of G.bursts) {
        const n = b.car ? 26 : 18, life = b.car ? 1.1 : 0.7, a = b.age;
        if (a >= life) continue;
        const cA = b.car ? P.neon : b.type === T_TAXI ? [1, 0.82, 0.12] : b.type >= T_BLOCK ? [1, 0.15, 0.2] : edge, cB = b.car ? P.gridAlt : b.type >= T_BLOCK ? [0.2, 0.4, 1] : edge2;
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
