// The synthwave world: sky + striped sun, wireframe mountains, neon grid, palms, light trails.
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32 } from './util.js';
import { Car } from './car.js';
import { ROAD } from './cue.js';

const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

const COMMON = /* glsl */`
  float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
  // anti-aliased grid line with a minimum on-screen width (px) and a tight glow
  vec2 gridLine(float c, float halfW, float minPx, float glowPx){
    float fw = max(fwidth(c), 1e-5);
    float d = abs(fract(c - 0.5) - 0.5);
    float w = max(halfW, fw * minPx * 0.5);
    float core = 1.0 - smoothstep(w - fw * 0.75, w + fw * 0.75, d);
    float energy = clamp(halfW / w, 0.0, 1.0);
    float glow = exp(-d / (fw * glowPx)) ;
    float dens = smoothstep(0.08, 0.32, fw);       // lines denser than pixels → fade to average
    return vec2(mix(core * mix(energy, 1.0, 0.6), 0.06, dens), glow * (1.0 - dens));
  }
`;

// ── Sky & sun ─────────────────────────────────────────────────────────────
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false,
    uniforms: {
      uInvVP: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() }, uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 }, uSunEl: { value: 0.06 }, uSunR: { value: 0.18 }, uSunPow: { value: 1 }, uBand: { value: 0 },
      uSunSquash: { value: 0 }, uStars: { value: 1 }, uFlare: { value: 0 },
      skyTop: { value: new THREE.Vector3() }, skyMid: { value: new THREE.Vector3() }, skyLow: { value: new THREE.Vector3() },
      horizon: { value: new THREE.Vector3() }, haze: { value: new THREE.Vector3() }, fog: { value: new THREE.Vector3() },
      sunTop: { value: new THREE.Vector3() }, sunMid: { value: new THREE.Vector3() }, sunLow: { value: new THREE.Vector3() }, sunGlow: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */`void main(){ gl_Position = vec4(position.xy, 1.0, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform mat4 uInvVP; uniform vec3 uCam; uniform vec2 uRes; uniform float uTime, uSunEl, uSunR, uSunPow, uBand, uStars, uSunSquash, uFlare;
      uniform vec3 skyTop, skyMid, skyLow, horizon, haze, fog, sunTop, sunMid, sunLow, sunGlow;
      ${COMMON}
      float starLayer(vec2 p, float scale, float px, float seed){
        vec2 g = p * scale; vec2 id = floor(g); vec2 f = fract(g);
        float s = 0.0;
        for (int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
          vec2 o = vec2(i,j); vec2 cid = id + o;
          float h = hash12(cid + seed);
          if (h > 0.82) {
            vec2 pos = o + hash22(cid + seed * 1.7) ;
            float d = length((f - pos)) / (px * scale);
            float b = pow((h - 0.82) / 0.18, 4.0) * 0.55;
            float tw = 0.65 + 0.35 * sin(uTime * (1.3 + 3.0 * h) + h * 40.0);
            s += b * tw * exp(-d * d * 0.9);
          }
        }
        return s;
      }
      void main(){
        vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
        vec4 w = uInvVP * vec4(ndc, 1.0, 1.0); vec3 dir = normalize(w.xyz / w.w - uCam);
        float el = asin(clamp(dir.y, -1.0, 1.0));
        float az = atan(dir.x, -dir.z);
        float pxAng = 2.0 * length(dFdx(dir)) + 1e-6;
        // sky gradient
        vec3 col = mix(skyLow, skyMid, smoothstep(0.0, 0.22, el));
        col = mix(col, skyTop, smoothstep(0.16, 0.85, el));
        // stars
        if (el > 0.02) {
          vec2 sp = vec2(az, el);
          float st = starLayer(sp, 70.0, pxAng * 1.1, 3.0) + 0.6 * starLayer(sp, 140.0, pxAng * 0.9, 11.0);
          col += vec3(0.85, 0.9, 1.0) * st * uStars * smoothstep(0.03, 0.2, el);
        }
        // sun
        vec2 sd = vec2(az * cos(el), (el - uSunEl) * (1.0 + uSunSquash));
        float d = length(sd);
        float v = (el - uSunEl) / uSunR;                     // -1 bottom .. 1 top
        vec3 sc = mix(sunLow, sunMid, smoothstep(-0.95, 0.05, v));
        sc = mix(sc, sunTop, smoothstep(0.05, 0.95, v));
        float edge = 1.0 - smoothstep(uSunR - pxAng, uSunR + pxAng, d);
        float s = v * 7.5 + uBand;
        float fs = fwidth(s);
        float gap = clamp((0.42 - v) * 0.5, 0.0, 0.62);
        float bandMask = smoothstep(gap - fs, gap + fs, fract(s));
        if (gap <= 0.0) bandMask = 1.0;
        float sunA = edge * bandMask;
        col += sunGlow * (exp(-max(d - uSunR, 0.0) / 0.035) * 0.32 + exp(-d / 0.3) * 0.16) * uSunPow;
        col = mix(col, sc * (0.98 + 0.5 * uFlare) * uSunPow, sunA);
        // horizon glow and haze
        float h = max(el, 0.0);
        col += horizon * exp(-h / 0.022) * 0.6 + haze * exp(-h / 0.1) * 0.14;
        if (el < 0.0) col = horizon * 0.42 + fog * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

// ── Ground grid ───────────────────────────────────────────────────────────
function makeGrid() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uPos: { value: 0 }, uVel: { value: 0 }, uCamX: { value: 0 }, uTime: { value: 0 }, uPulse: { value: 0 },
      uSunEl: { value: 0.06 }, uSunPow: { value: 1 }, uBright: { value: 1 }, uShutter: { value: 1 / 120 },
      grid: { value: new THREE.Vector3() }, gridAlt: { value: new THREE.Vector3() }, ground: { value: new THREE.Vector3() },
      horizon: { value: new THREE.Vector3() }, sunLow: { value: new THREE.Vector3() }, sunMid: { value: new THREE.Vector3() }, fog: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */`
      varying vec3 vW; uniform float uCamX;
      void main(){ vec3 p = position; p.x += uCamX; vW = p; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vW;
      uniform float uPos, uVel, uTime, uPulse, uSunEl, uSunPow, uBright, uShutter;
      uniform vec3 grid, gridAlt, ground, horizon, sunLow, sunMid, fog;
      ${COMMON}
      void main(){
        const float S = 4.0;
        vec3 v = vW - cameraPosition; float dist = length(v); vec3 dir = v / dist;
        float gx = (vW.x - ${(ROAD.lane / 2).toFixed(2)}) / S;   // lines on the lane edges
        float gz = (vW.z - uPos) / S;
        // motion blur along z for the cross lines (energy conserving)
        float blur = abs(uVel) * uShutter / S;
        float fwz = max(fwidth(gz), 1e-5);
        float dz = abs(fract(gz - 0.5) - 0.5);
        float hw = 0.0045;
        float wz = max(hw, fwz * 0.65) + blur * 0.5;
        float cz = (1.0 - smoothstep(wz - fwz * 0.75, wz + fwz * 0.75, dz)) * clamp((max(hw, fwz * 0.65)) / wz, 0.0, 1.0);
        float densz = smoothstep(0.08, 0.32, fwz);
        cz = mix(cz * mix(clamp(hw / max(hw, fwz*0.65),0.,1.), 1.0, 0.6), 0.06, densz);
        float gzGlow = exp(-max(dz - blur * 0.5, 0.0) / (fwz * 3.0)) * (1.0 - densz);
        vec2 lx = gridLine(gx, 0.0045, 1.3, 3.0);
        // road edges (x = ±ROAD.rail) — brighter cyan rails
        float re = abs(abs(vW.x) - ${ROAD.rail.toFixed(2)});
        float fwr = max(fwidth(vW.x), 1e-4);
        float rail = 1.0 - smoothstep(max(0.025, fwr * 0.7) - fwr, max(0.025, fwr * 0.7) + fwr, re);
        float railGlow = exp(-re / (fwr * 5.0 + 0.05));
        float fade = exp(-dist / 380.0);
        float near = smoothstep(0.0, 6.0, dist);
        float lines = max(lx.x, cz);
        float glow = max(lx.y, gzGlow) * 0.22;
        // floor: dark glossy, picks up the horizon and a sun streak
        float graze = pow(1.0 - abs(dir.y), 6.0);
        vec3 col = ground + horizon * graze * 0.32;
        float az = atan(dir.x, -dir.z);
        float streak = exp(-pow(az / (0.04 + 0.07 * graze), 2.0)) * pow(graze, 1.5);
        float ripple = 0.55 + 0.45 * sin(log(dist + 1.0) * 26.0 - uPos * 0.0) * sin(vW.x * 0.9 + log(dist + 1.0) * 7.0);
        col += mix(sunLow, sunMid, graze) * streak * 0.16 * uSunPow * (0.6 + 0.4 * ripple);
        vec3 lc = mix(grid, mix(grid, horizon, 0.35), smoothstep(150.0, 900.0, dist));
        float pulse = 1.0 + uPulse * 0.25;
        col += lc * (lines * 1.05 + glow) * fade * near * uBright * pulse;
        col += gridAlt * (rail * 1.2 + railGlow * 0.18) * exp(-dist / 600.0) * near * uBright;
        col = mix(col, horizon * 0.42 + fog * 0.35, smoothstep(250.0, 3000.0, dist));
        gl_FragColor = vec4(col, 1.0);
      }`,
    extensions: { derivatives: true },
  });
  const geo = new THREE.PlaneGeometry(30000, 16000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -8000 + 8);
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 0;
  return m;
}

// ── Wireframe mountains ───────────────────────────────────────────────────
function makeMountains(seed) {
  // Smooth wireframe ranges: seeded fbm heightfields drawn as anti-aliased grid lines on a dark fill.
  const rnd = mulberry32(seed);
  const perm = Array.from({ length: 512 }, () => rnd());
  const n1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return perm[i & 511] * (1 - u) + perm[(i + 1) & 511] * u; };
  const n2 = (x, z) => { const i = Math.floor(z), f = z - i, u = f * f * (3 - 2 * f); return n1(x + i * 37.1) * (1 - u) + n1(x + (i + 1) * 37.1) * u; };
  const fbm = (x, z) => { let a = 0.5, s = 0, f = 1; for (let o = 0; o < 5; o++) { s += a * n2(x * f, z * f); f *= 2.03; a *= 0.5; } return s; };

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uBright: { value: 1 }, fill: { value: new THREE.Vector3() }, wire: { value: new THREE.Vector3() }, wire2: { value: new THREE.Vector3() },
      horizon: { value: new THREE.Vector3() }, fog: { value: new THREE.Vector3() }, sunGlow: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */`
      attribute vec2 aGrid; attribute float aH;
      varying vec2 vG; varying float vH; varying vec3 vW;
      void main(){ vG = aGrid; vH = aH; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec2 vG; varying float vH; varying vec3 vW;
      uniform float uBright; uniform vec3 fill, wire, wire2, horizon, fog, sunGlow;
      ${COMMON}
      void main(){
        float dist = length(vW - cameraPosition);
        vec2 a = gridLine(vG.x, 0.03, 1.0, 2.5), b = gridLine(vG.y, 0.03, 1.0, 2.5);
        float l = max(a.x, b.x), g = max(a.y, b.y) * 0.3;
        vec3 wc = mix(wire2, wire, smoothstep(0.05, 0.8, vH));
        float far = smoothstep(500.0, 1150.0, dist);
        vec3 col = fill + horizon * 0.10 * (1.0 - vH);
        col += wc * (l * 0.85 + g * 0.6) * mix(1.0, 0.35, far) * uBright * (0.45 + 0.55 * vH);
        // ridge rim catching the sun glow
        col += sunGlow * smoothstep(0.82, 1.0, vH) * 0.12;
        col = mix(col, mix(fog, horizon, 0.35), far * 0.6 + smoothstep(0.25, 0.0, vH) * 0.35);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  const group = new THREE.Group();
  const build = (opt) => {
    const { x0, x1, z0, z1, cols, rows, height, env } = opt;
    const pos = [], grid = [], hs = [], idx = [];
    let hmax = 0;
    const H = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const u = i / cols, v = j / rows;
      const x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * v;
      const e = env(x) * Math.sin(Math.PI * Math.min(1, v * 1.15)) ** 0.8;
      const h = Math.max(0, height * e * (0.55 + 0.9 * fbm(x * opt.fx + opt.ox, v * 3.0)) - 2);
      H.push(h); hmax = Math.max(hmax, h);
      pos.push(x, h, z); grid.push(i * opt.gx, j * opt.gz);
    }
    for (const h of H) hs.push(h / hmax);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aGrid', new THREE.Float32BufferAttribute(grid, 2));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(hs, 1));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false;
    return m;
  };
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // far range: low valley for the sun, peaks to the sides
  group.add(build({ x0: -1500, x1: 1500, z0: -720, z1: -1150, cols: 110, rows: 14, height: 150, fx: 0.006, ox: 3.1, gx: 1, gz: 1,
    env: (x) => 0.22 + 0.78 * sstep(80, 420, Math.abs(x)) }));
  // near flanks framing the road
  group.add(build({ x0: -620, x1: 620, z0: -170, z1: -470, cols: 90, rows: 12, height: 70, fx: 0.011, ox: 17.0, gx: 1, gz: 1,
    env: (x) => sstep(110, 320, Math.abs(x)) }));
  group.userData.mat = mat;
  return group;
}

// ── Palm silhouettes (procedural canvas atlas) ────────────────────────────
function palmAtlas(seed) {
  const cw = 512, ch = 768, n = 4;
  const cv = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(cw * n, ch) : Object.assign(document.createElement('canvas'), { width: cw * n, height: ch });
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cw * n, ch);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let k = 0; k < n; k++) {
    const r = mulberry32(seed + k * 101);
    const ox = k * cw, bx = ox + cw * (0.5 + (r() - 0.5) * 0.1), by = ch - 2;
    const lean = (r() - 0.5) * 120 + (k % 2 ? 45 : -45);
    const top = 250 + r() * 40;
    const cx = bx + lean, cy = top;
    // trunk: tapered quadratic with ring notches
    const segs = 40;
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs, t1 = (s + 1) / segs;
      const P = (t) => { const mx = bx + lean * 0.15, my = (by + cy) / 2; return [(1 - t) * (1 - t) * bx + 2 * (1 - t) * t * mx + t * t * cx, (1 - t) * (1 - t) * by + 2 * (1 - t) * t * my + t * t * cy]; };
      const [x0, y0] = P(t0), [x1, y1] = P(t1);
      g.lineWidth = 26 - 14 * t0 + (s % 3 === 0 ? 2.5 : 0);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    // fronds
    const nf = 9 + Math.floor(r() * 3);
    for (let f = 0; f < nf; f++) {
      const ang = -Math.PI / 2 + (f / (nf - 1) - 0.5) * Math.PI * 1.75 + (r() - 0.5) * 0.25;
      const len = 150 + r() * 70;
      const droop = 0.55 + r() * 0.5;
      const ex = cx + Math.cos(ang) * len, ey = cy + Math.sin(ang) * len * 0.6 + len * droop * 0.55;
      const mx = cx + Math.cos(ang) * len * 0.55, my = cy + Math.sin(ang) * len * 0.55 - 25;
      const Q = (t) => [(1 - t) * (1 - t) * cx + 2 * (1 - t) * t * mx + t * t * ex, (1 - t) * (1 - t) * cy + 2 * (1 - t) * t * my + t * t * ey];
      g.lineWidth = 5; g.beginPath(); g.moveTo(cx, cy); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
      const nl = 26;
      for (let l = 2; l < nl; l++) {
        const t = l / nl, [px, py] = Q(t), [qx, qy] = Q(Math.min(1, t + 0.02));
        const tx = qx - px, ty = qy - py, tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl, ny = tx / tl;
        const ll = (1 - t) * 58 + 10;
        for (const sgn of [-1, 1]) {
          const lx = px + (nx * sgn * 0.75 + tx / tl * 0.55) * ll, ly = py + (ny * sgn * 0.75 + ty / tl * 0.55) * ll + ll * 0.45;
          g.beginPath(); g.moveTo(px - tx / tl * 4, py - ty / tl * 4); g.lineTo(lx, ly); g.lineTo(px + tx / tl * 7, py + ty / tl * 7); g.closePath(); g.fill();
        }
      }
    }
    // coconut cluster
    for (let c = 0; c < 5; c++) { g.beginPath(); g.arc(cx + (r() - 0.5) * 26, cy + 10 + r() * 14, 8 + r() * 3, 0, Math.PI * 2); g.fill(); }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 4;
  return tex;
}

function makePalms(seed) {
  const tex = palmAtlas(seed);
  const rows = [
    { x: [10.8, 13.8], S: 48, N: 14, h: [12, 15] },
    { x: [21, 30], S: 70, N: 12, h: [14, 18] },
    { x: [42, 72], S: 112, N: 10, h: [16, 22] },
  ];
  const rnd = mulberry32(seed + 7);
  const inst = [];
  for (const side of [-1, 1]) rows.forEach((r, ri) => {
    for (let i = 0; i < r.N; i++) inst.push({
      x: side * (r.x[0] + rnd() * (r.x[1] - r.x[0])), z0: i * r.S + rnd() * r.S * 0.6 + (side > 0 ? r.S * 0.5 : 0), span: r.S * r.N,
      h: r.h[0] + rnd() * (r.h[1] - r.h[0]), v: Math.floor(rnd() * 4), flip: rnd() < 0.5 ? -1 : 1, seed: rnd(),
    });
  });
  const base = new THREE.PlaneGeometry(1, 1);
  base.translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.getAttribute('position')); g.setAttribute('uv', base.getAttribute('uv'));
  const A = (k, n) => new THREE.InstancedBufferAttribute(new Float32Array(inst.flatMap(k)), n);
  g.setAttribute('aX', A((p) => [p.x, p.z0, p.span], 3));
  g.setAttribute('aH', A((p) => [p.h, p.v, p.flip, p.seed], 4));
  g.instanceCount = inst.length;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uTex: { value: tex }, uPos: { value: 0 }, uTime: { value: 0 }, uCamX: { value: 0 },
      palm: { value: new THREE.Vector3() }, fog: { value: new THREE.Vector3() }, horizon: { value: new THREE.Vector3() }, rim: { value: new THREE.Vector3() },
    },
    vertexShader: /* glsl */`
      attribute vec3 aX; attribute vec4 aH; uniform float uPos, uTime;
      varying vec2 vUv; varying float vDist; varying float vFade; varying float vVar; varying float vSide;
      void main(){
        float span = aX.z;
        float z = 8.0 - mod(8.0 - (-aX.y) - uPos, span);
        vec3 p = vec3(aX.x, 0.0, z);
        float h = aH.x, w = h * 0.6667;
        vec3 off = vec3(position.x * w * aH.z, position.y * h, 0.0);
        float sway = sin(uTime * (0.6 + aH.w * 0.5) + aH.w * 20.0) * 0.012 * position.y * position.y;
        off.x += sway * h;
        vec4 wp = vec4(p + off, 1.0);
        vec4 mv = viewMatrix * wp;
        vDist = -mv.z; vUv = vec2(aH.y * 0.25 + uv.x * 0.25, uv.y); vVar = aH.y;
        vFade = (1.0 - smoothstep(span * 0.72, span * 0.95, -z)) * smoothstep(-1.0, 3.0, -z + 6.0);
        vSide = sign(aX.x) * aH.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform sampler2D uTex; uniform vec3 palm, fog, horizon, rim;
      varying vec2 vUv; varying float vDist, vFade, vVar, vSide;
      void main(){
        float a = texture2D(uTex, vUv).r;
        if (a < 0.02) discard;
        // rim light from the sun side (towards screen centre)
        vec2 o = vec2(-vSide * 0.0035, -0.004);
        float a2 = texture2D(uTex, vUv + o).r;
        float rimK = clamp(a - a2, 0.0, 1.0);
        float f = smoothstep(30.0, 900.0, vDist);
        vec3 col = mix(palm, mix(fog, horizon, 0.45), f * 0.9);
        col += rim * rimK * (1.0 - f) * 0.9;
        gl_FragColor = vec4(col * a, a * vFade);
      }`,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 5;
  return m;
}

// ── Roadside light trails ─────────────────────────────────────────────────
function makeTrails() {
  const N = 64, S = 14;
  const base = new THREE.PlaneGeometry(1, 1); // x: along, y: across
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.getAttribute('position'));
  const data = [];
  for (const side of [-1, 1]) for (let i = 0; i < N; i++) data.push(side * ROAD.trail, i * S + (side > 0 ? S / 2 : 0), side);
  g.setAttribute('aP', new THREE.InstancedBufferAttribute(new Float32Array(data), 3));
  g.instanceCount = N * 2;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPos: { value: 0 }, uLen: { value: 1 }, uI: { value: 1 }, cA: { value: new THREE.Vector3() }, cB: { value: new THREE.Vector3() } },
    vertexShader: /* glsl */`
      attribute vec3 aP; uniform float uPos, uLen;
      varying vec2 vQ; varying float vD; varying float vSide;
      void main(){
        float span = ${(N * S).toFixed(1)};
        float z = 8.0 - mod(8.0 - (-aP.y) - uPos, span);
        vec3 c = vec3(aP.x, 0.55, z);
        float along = (position.x + 0.5);                // 0 head .. 1 tail
        vec3 p = c + vec3(0.0, 0.0, along * uLen);
        vec3 toCam = normalize(cameraPosition - p);
        vec3 side = normalize(cross(vec3(0.0, 0.0, 1.0), toCam));
        float dist = length(cameraPosition - p);
        float wdt = 0.09 + dist * 0.0016;
        p += side * position.y * wdt * 2.0;
        vQ = vec2(along, position.y * 2.0); vD = dist; vSide = aP.z;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uI; uniform vec3 cA, cB; varying vec2 vQ; varying float vD, vSide;
      void main(){
        float across = exp(-vQ.y * vQ.y * 9.0);
        float core = exp(-vQ.y * vQ.y * 60.0);
        float lenK = smoothstep(0.0, 0.08, vQ.x) * pow(max(1.0 - vQ.x, 0.0), 1.6);
        float fade = exp(-vD / 260.0) * smoothstep(2.0, 8.0, vD);
        vec3 c = vSide < 0.0 ? cA : cB;
        vec3 col = (c * across * 1.6 + vec3(1.0) * core * 0.9) * lenK * fade * uI;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 6;
  m.userData.span = N * S;
  return m;
}

// ── Traffic: tail-light pairs of cars in the outer lanes (closed-form: car i at its own speed) ──
const CARS = [
  { x: -ROAD.traffic, v: 17, z0: 120, span: 1500 }, { x: ROAD.traffic, v: 21, z0: 520, span: 1500 }, { x: -ROAD.traffic, v: 15, z0: 860, span: 1500 },
  { x: ROAD.traffic, v: 19, z0: 1230, span: 1500 }, { x: -ROAD.traffic, v: 23, z0: 300, span: 2100 }, { x: ROAD.traffic, v: 13, z0: 1650, span: 2100 },
];
function makeTraffic() {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.getAttribute('position'));
  const n = CARS.length * 2;
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); attr.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aC', attr); g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uCol: { value: new THREE.Vector3(1, 0.12, 0.16) } },
    vertexShader: /* glsl */`
      attribute vec4 aC;   // x, z, streak length, intensity
      varying vec2 vQ; varying float vD; varying float vI;
      void main(){
        vec3 c = vec3(aC.x, 0.72, aC.y);
        float along = position.x + 0.5;
        vec3 p = c + vec3(0.0, 0.0, -along * aC.z);       // streak trails back along the car's motion
        vec3 toCam = normalize(cameraPosition - p);
        vec3 side = normalize(cross(vec3(0.0, 0.0, 1.0), toCam));
        float dist = length(cameraPosition - p);
        p += side * position.y * (0.11 + dist * 0.0018) * 2.0;
        vQ = vec2(along, position.y * 2.0); vD = dist; vI = aC.w;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      precision highp float; uniform vec3 uCol; varying vec2 vQ; varying float vD, vI;
      void main(){
        float across = exp(-vQ.y * vQ.y * 8.0), core = exp(-vQ.y * vQ.y * 50.0);
        float lenK = smoothstep(0.0, 0.06, vQ.x) * pow(max(1.0 - vQ.x, 0.0), 1.4);
        float fade = exp(-vD / 420.0) * smoothstep(1.5, 6.0, vD);
        gl_FragColor = vec4((uCol * across * 2.2 + vec3(1.0, 0.75, 0.75) * core) * lenK * fade * vI, 1.0);
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 7;
  m.userData.attr = attr;
  return m;
}

export class World {
  constructor(seed) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(56, 16 / 9, 0.1, 20000);
    this.camera.rotation.order = 'YXZ';
    this.sky = makeSky(); this.grid = makeGrid(); this.mount = makeMountains(seed); this.palms = makePalms(seed); this.trails = makeTrails(); this.traffic = makeTraffic(); this.car = new Car();
    this.scene.add(this.sky, this.mount, this.grid, this.trails, this.traffic, this.palms, this.car.group);
    this._m = new THREE.Matrix4();
  }
  // s: frame state from the director · w, h: output size (aspect) · rw, rh: size of the render target the sky is drawn into
  update(s, w, h, rw = w, rh = h) {
    const cam = this.camera, P = s.pal;
    cam.fov = s.cam.fov; cam.aspect = w / h; cam.near = 0.1; cam.far = 20000;
    cam.position.set(s.cam.x, s.cam.y, 0);
    cam.rotation.set(s.cam.pitch, s.cam.yaw, s.cam.roll);
    cam.updateProjectionMatrix();
    cam.projectionMatrix.elements[9] = s.cam.shift;
    cam.projectionMatrix.elements[8] = s.cam.shiftX || 0;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.updateMatrixWorld(true);
    const su = this.sky.material.uniforms;
    this._m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).invert();
    su.uInvVP.value.copy(this._m); su.uCam.value.copy(cam.position); su.uRes.value.set(rw, rh);   // gl_FragCoord is in render-target pixels, which are fewer than output pixels when the scene renders below native
    su.uTime.value = s.t; su.uSunEl.value = s.sun.el; su.uSunR.value = s.sun.r; su.uSunPow.value = s.sun.pow * P.sunPower; su.uBand.value = s.sun.band;
    su.uStars.value = s.stars * P.stars; su.uFlare.value = s.sun.flare; su.uSunSquash.value = s.sun.squash || 0;
    for (const k of ['skyTop', 'skyMid', 'skyLow', 'horizon', 'haze', 'fog', 'sunTop', 'sunMid', 'sunLow', 'sunGlow']) su[k].value.set(...P[k]);
    const gu = this.grid.material.uniforms;
    gu.uPos.value = s.road.gridPhase; gu.uVel.value = s.road.vel; gu.uCamX.value = s.cam.x; gu.uTime.value = s.t; gu.uPulse.value = s.pulse;
    gu.uSunEl.value = s.sun.el; gu.uSunPow.value = s.sun.pow * P.sunPower; gu.uBright.value = s.gridBright;
    for (const k of ['grid', 'gridAlt', 'ground', 'horizon', 'sunLow', 'sunMid', 'fog']) gu[k].value.set(...P[k]);
    const mu = this.mount.userData.mat.uniforms;
    mu.fill.value.set(...P.mountFill); mu.wire.value.set(...P.mountWire); mu.wire2.value.set(...P.mountWire2);
    mu.horizon.value.set(...P.horizon); mu.fog.value.set(...P.fog); mu.sunGlow.value.set(...P.sunGlow); mu.uBright.value = s.mountBright;
    const pu = this.palms.material.uniforms;
    pu.uPos.value = s.road.palmPhase; pu.uTime.value = s.t;
    pu.palm.value.set(...P.palm); pu.fog.value.set(...P.fog); pu.horizon.value.set(...P.horizon); pu.rim.value.set(...P.sunGlow);
    const tu = this.trails.material.uniforms;
    tu.uPos.value = s.road.trailPhase; tu.uLen.value = s.road.trailLen; tu.uI.value = s.trailI;
    tu.cA.value.set(...P.post); tu.cB.value.set(...P.post2);
    // traffic: relative position = our travelled distance − the car's own (deterministic in t and pos)
    const a = this.traffic.userData.attr, arr = a.array;
    CARS.forEach((c, i) => {
      const rel = s.road.pos - c.v * s.t;
      const z = 8 - ((((8 + c.z0 - rel) % c.span) + c.span) % c.span);
      const relV = s.road.vel - c.v;
      const len = 0.18 + Math.abs(relV) * 0.05;
      const fadeFar = 1 - Math.min(1, Math.max(0, (-z - c.span * 0.7) / (c.span * 0.25)));
      for (const side of [-0.8, 0.8]) { const k = (i * 2 + (side > 0 ? 1 : 0)) * 4; arr[k] = c.x + side; arr[k + 1] = z; arr[k + 2] = len; arr[k + 3] = fadeFar * s.trafficI; }
    });
    a.needsUpdate = true;
    this.car.update(s);
  }
}
