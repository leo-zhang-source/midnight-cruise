// The player's car: an original low 80s-style wedge coupé (no real make or model).
// Body and glasshouse are lofted from cross-sections (flared rear hips, tumblehome, tapered nose,
// crowned deck) so the clear-coat reflections flow; detailed rear fascia, airfoil wing, side strakes,
// five-spoke wheels, metallic-flake paint with panel seams, underglow and exhaust flames.
import * as THREE from '../vendor/three.module.min.js';

const L = 4.4;                                    // length; rear bumper at z = +L/2, nose at −L/2
const zOf = (s) => L / 2 - s;                     // s = distance from the rear (0) to the nose (L)
const lerp = (a, b, t) => a + (b - a) * t;
const bump = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
// piecewise-linear lookup
const pl = (keys, x) => { if (x <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (x <= keys[i][0]) { const [a, va] = keys[i - 1], [b, vb] = keys[i]; return va + (vb - va) * (x - a) / (b - a); } return keys[keys.length - 1][1]; };

// ── body form ──
const TOP = [[0, 0.80], [0.07, 0.845], [0.2, 0.865], [0.9, 0.875], [1.15, 0.878], [2.2, 0.85], [3.05, 0.785], [3.7, 0.66], [4.15, 0.55], [4.38, 0.45], [4.44, 0.36]];
const BOT = [[0, 0.27], [0.12, 0.215], [4.2, 0.215], [4.44, 0.26]];
const halfW = (s) => 0.915 + 0.075 * bump(s, 0.95, 0.75) + 0.035 * bump(s, 3.55, 0.55) - 0.1 * Math.max(0, (s - 3.9) / 0.54) ** 1.6 - 0.03 * Math.max(0, (0.12 - s) / 0.12);
const topY = (s) => pl(TOP, s), botY = (s) => pl(BOT, s);
const beltY = (s) => Math.min(0.63, topY(s) - 0.1);
// glasshouse (s from 1.0 to 3.16): rear glass, roof, windscreen
const ROOF = [[1.0, 0.0], [1.78, 1.115], [2.42, 1.125], [3.16, 0.0]];

function bodySection(s) {
  const hw = halfW(s), t = topY(s), b = botY(s), bl = beltY(s);
  const half = [
    [hw - 0.12, b], [hw - 0.03, b + 0.04], [hw, b + 0.14], [hw + 0.006, bl - 0.06], [hw - 0.006, bl + 0.02],
    [hw - 0.05, lerp(bl, t, 0.62)], [hw - 0.11, t - 0.012], [hw - 0.24, t + 0.002], [hw * 0.45, t + 0.012],
  ];
  // closed ring: bottom centre → right side → top centre → left side (mirrored)
  const ring = [[0, b]];
  for (const p of half) ring.push(p);
  ring.push([0, t + 0.016]);
  for (let i = half.length - 1; i >= 0; i--) ring.push([-half[i][0], half[i][1]]);
  return ring;
}
function cabinSection(s) {
  const base = topY(s) - 0.004;
  // roof height along s: fastback rear glass → flat roof → windscreen
  let r;
  if (s < 1.78) r = lerp(base, 1.115, (s - 1.0) / 0.78);
  else if (s < 2.42) r = lerp(1.115, 1.125, (s - 1.78) / 0.64);
  else r = lerp(1.125, base, (s - 2.42) / 0.74);
  r = Math.max(r, base + 0.004);
  const hb = halfW(s) - 0.2, hr = hb - 0.2;
  const half = [[hb, base], [hb - 0.07, lerp(base, r, 0.55)], [hr, r - 0.025], [hr - 0.12, r]];
  const ring = [];
  for (const p of half) ring.push(p);
  ring.push([0, r + 0.008]);
  for (let i = half.length - 1; i >= 0; i--) ring.push([-half[i][0], half[i][1]]);
  return ring;
}
// Loft rings along s into a smooth indexed mesh; optional fan caps at both ends.
function loft(sectionFn, s0, s1, n, caps) {
  const pos = [], idx = [];
  let m = 0;
  for (let i = 0; i <= n; i++) {
    const s = lerp(s0, s1, i / n), ring = sectionFn(s); m = ring.length;
    for (const [x, y] of ring) pos.push(x, y, zOf(s));
  }
  const closed = caps;                       // body rings are closed loops; cabin rings are open arcs
  const segs = closed ? m : m - 1;
  for (let i = 0; i < n; i++) for (let j = 0; j < segs; j++) {
    const a = i * m + j, b = i * m + ((j + 1) % m), c = a + m, d = b + m;
    idx.push(a, c, b, b, c, d);
  }
  if (caps) {
    for (const [ri, flip] of [[0, true], [n, false]]) {
      let cx = 0, cy = 0; for (let j = 0; j < m; j++) { cx += pos[(ri * m + j) * 3]; cy += pos[(ri * m + j) * 3 + 1]; }
      const ci = pos.length / 3; pos.push(cx / m, cy / m, pos[ri * m * 3 + 2]);
      for (let j = 0; j < m; j++) { const a = ri * m + j, b = ri * m + ((j + 1) % m); flip ? idx.push(ci, b, a) : idx.push(ci, a, b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

const PAINT_VERT = /* glsl */`
  varying vec3 vN; varying vec3 vW; varying vec3 vL;
  void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const ENV = /* glsl */`
  uniform vec3 cSky, cTop, cHor, cSun, cGrid;
  vec3 env(vec3 R){
    float y = R.y;
    vec3 up = mix(cSky * 1.1, cTop, smoothstep(0.05, 0.7, y));
    vec3 dn = mix(cHor * 0.28, cGrid * 0.1, smoothstep(-0.02, -0.5, y));
    // the reflected road grid streaks across lower panels
    dn += cGrid * 0.35 * smoothstep(0.92, 1.0, abs(sin(R.x / max(-y, 0.05) * 9.0))) * smoothstep(-0.02, -0.25, y);
    vec3 c = y > 0.0 ? up : dn;
    c += cHor * exp(-abs(y) / 0.035) * 1.25;
    c += cSun * exp(-pow((R.z + 0.98) / 0.07, 2.0)) * exp(-pow((R.y - 0.07) / 0.09, 2.0)) * 1.6;   // the sun ahead
    return c;
  }
  float h31(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }`;

function paintMat(base, refl, uniforms, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uBase: { value: new THREE.Vector3(...base) }, uRefl: { value: refl }, uFlake: { value: opts.flake ?? 0 }, uSeams: { value: opts.seams ?? 0 } },
    vertexShader: PAINT_VERT,
    fragmentShader: /* glsl */`
      precision highp float; varying vec3 vN; varying vec3 vW; varying vec3 vL;
      uniform vec3 uBase; uniform float uRefl, uGlow, uFlake, uSeams;
      ${ENV}
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW), R = reflect(-V, N);
        float ndv = max(dot(N, V), 0.0), fr = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
        // candy base: richer on surfaces facing the sky, dark in the lower body (fake occlusion)
        vec3 col = uBase * (0.5 + 0.5 * max(N.y, 0.0)) * mix(0.45, 1.0, smoothstep(0.22, 0.5, vL.y));
        // clear coat
        col += env(R) * (0.1 + 0.9 * fr) * uRefl;
        // metallic flake sparkling toward the sun and the horizon glow
        float fl = step(0.994, h31(floor(vL * 260.0)));
        float glint = pow(max(dot(R, normalize(vec3(0.0, 0.12, -1.0))), 0.0), 24.0);
        col += (cSun * 0.6 + cHor * 0.4) * fl * uFlake * glint * 0.5 + uBase * 0.25 * uFlake * (h31(floor(vL * 90.0)) - 0.5) * 0.15;
        // panel seams: trunk lid on the rear deck, door shut lines on the flanks
        if (uSeams > 0.5) {
          float az = abs(vL.x);
          float lid = (vL.y > 0.78 && N.y > 0.5) ? min(abs(az - 0.74), min(abs(vL.z - 2.12), abs(vL.z - 1.24))) : 1.0;
          if (az > 0.74 || vL.z > 2.12 || vL.z < 1.24) lid = (vL.y > 0.78 && N.y > 0.5 && az < 0.76 && vL.z > 1.22 && vL.z < 2.14) ? lid : 1.0;
          float door = (abs(N.x) > 0.6 && vL.y > 0.26 && vL.y < 0.84) ? min(abs(vL.z - 1.08), abs(vL.z + 0.42)) : 1.0;
          float seam = min(lid, door);
          col *= mix(0.25, 1.0, smoothstep(0.003, 0.009, seam));
        }
        // underglow bounce on lower panels
        col += cGrid * uGlow * 0.32 * smoothstep(0.5, 0.22, vL.y) * max(-N.y + 0.45, 0.0);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function plateTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 80;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 80); gr.addColorStop(0, '#f4f0fb'); gr.addColorStop(1, '#cfc8e4');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 80);
  g.strokeStyle = '#2a1a4a'; g.lineWidth = 4; g.strokeRect(5, 5, 246, 70);
  g.fillStyle = '#6a2cd8'; g.font = '600 13px "Chakra Petch"'; g.textAlign = 'center'; g.fillText('MIDNIGHT  STATE', 128, 20);
  g.fillStyle = '#1a0f33'; g.font = '700 44px "Chakra Petch"'; g.textBaseline = 'middle'; g.fillText('NITE 86', 128, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return t;
}
const QUAD_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';

export class Car {
  constructor() {
    this.group = new THREE.Group();
    this.body = new THREE.Group();          // pitch / roll / bob pivot
    this.group.add(this.body);
    const U = this.u = {
      cSky: { value: new THREE.Vector3() }, cTop: { value: new THREE.Vector3() }, cHor: { value: new THREE.Vector3() },
      cSun: { value: new THREE.Vector3() }, cGrid: { value: new THREE.Vector3() }, uGlow: { value: 1 },
    };
    const paint = paintMat([0.2, 0.05, 0.3], 1.1, U, { flake: 1, seams: 1 });
    const glass = paintMat([0.008, 0.008, 0.025], 1.35, U);
    const satin = paintMat([0.03, 0.025, 0.05], 0.35, U);          // black trim with a faint sheen
    const chrome = paintMat([0.2, 0.2, 0.26], 1.6, U);
    const black = new THREE.MeshBasicMaterial({ color: 0x05030a });
    const add = (m, x, y, z, rx = 0) => { m.position.set(x, y, z); m.rotation.x = rx; this.body.add(m); return m; };

    // ── sculpted body + glasshouse ──
    this.body.add(new THREE.Mesh(loft(bodySection, 0, 4.44, 80, true), paint));
    this.body.add(new THREE.Mesh(loft(cabinSection, 1.0, 3.16, 40, false), glass));
    // painted roof skin + thin roof rails
    const roofG = new THREE.BoxGeometry(1.0, 0.012, 0.6); add(new THREE.Mesh(roofG, paint), 0, 1.13, zOf(2.1));
    // rear-window louvres following the fastback
    const slope = Math.atan2(1.115 - 0.875, 1.78 - 1.0), segLen = Math.hypot(0.78, 0.24) / 7;
    for (let k = 0; k < 7; k++) {
      const f = (k + 0.5) / 7, sx = 1.0 + 0.78 * f, y = lerp(0.875, 1.115, f) + 0.014;
      add(new THREE.Mesh(new THREE.BoxGeometry((halfW(sx) - 0.4) * 2 - 0.02, 0.016, segLen * 0.52), satin), 0, y, zOf(sx), slope);
    }
    // ── rear fascia ──
    const REAR = L / 2 + 0.004;
    const tailW = 1.66;
    add(new THREE.Mesh(new THREE.PlaneGeometry(tailW + 0.1, 0.24), black), 0, 0.655, REAR + 0.001);                 // recessed bezel
    this.tailU = { uI: { value: 1 }, uCol: { value: new THREE.Vector3(1, 0.05, 0.16) } };
    add(new THREE.Mesh(new THREE.PlaneGeometry(tailW, 0.15), new THREE.ShaderMaterial({ uniforms: this.tailU, vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */`precision highp float; uniform float uI; uniform vec3 uCol; varying vec2 vUv;
        void main(){
          float lv = smoothstep(0.32, 0.5, fract(vUv.y * 6.0)) * smoothstep(0.98, 0.8, fract(vUv.y * 6.0));      // fine horizontal louvres
          float cell = fract(vUv.x * 12.0); float div = smoothstep(0.0, 0.03, cell) * smoothstep(1.0, 0.97, cell);  // chrome dividers
          float mid = smoothstep(0.36, 0.34, abs(vUv.x - 0.5));                                                       // centre reflector section
          float hot = exp(-pow((vUv.y - 0.5) / 0.32, 2.0));
          vec3 lamp = uCol * (0.3 + 0.7 * lv) * (1.15 + 1.5 * hot) * uI;
          vec3 refl = uCol * 0.35 * (0.6 + 0.4 * lv) * (0.5 + 0.5 * uI);
          vec3 c = mix(lamp, refl, mid * 0.0) + vec3(1.0, 0.55, 0.65) * hot * lv * 0.3 * uI;
          c = mix(vec3(0.5, 0.48, 0.6) * 0.5, c, div);
          gl_FragColor = vec4(c, 1.0); }` })), 0, 0.655, REAR + 0.004);
    // chrome bezel lines above/below the lights, chrome bumper strip
    for (const y of [0.778, 0.532]) add(new THREE.Mesh(new THREE.BoxGeometry(tailW + 0.1, 0.012, 0.01), chrome), 0, y, REAR + 0.003);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.03, 0.04), chrome), 0, 0.33, REAR - 0.005);
    // plate recess + plate
    add(new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.18), black), 0, 0.435, REAR + 0.002);
    add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.155), new THREE.MeshBasicMaterial({ map: plateTexture(), color: 0xb9b2d2 })), 0, 0.435, REAR + 0.006);
    // diffuser with vertical fins
    add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.34), black), 0, 0.255, REAR - 0.17);
    for (let k = -3; k <= 3; k++) add(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.1, 0.3), satin), k * 0.21, 0.25, REAR - 0.12);
    // twin exhausts: chrome rings, glowing cores, flame bursts
    this.exU = { uI: { value: 0 } };
    this.flames = [];
    for (const x of [-0.52, 0.52]) {
      add(new THREE.Mesh(new THREE.RingGeometry(0.058, 0.082, 28), chrome), x, 0.29, REAR + 0.012);
      add(new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), new THREE.ShaderMaterial({ uniforms: this.exU, vertexShader: QUAD_VERT,
        fragmentShader: 'precision highp float; uniform float uI; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(mix(vec3(0.02), vec3(1.0, 0.45, 0.15) * (0.6 + 2.0 * uI), smoothstep(1.0, 0.3, r) * (0.2 + uI)), 1.0); }' })), x, 0.29, REAR + 0.008);
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uLen: { value: 0 }, uT: { value: 0 }, uHot: { value: 0 }, uSeed: { value: x } },
        vertexShader: /* glsl */`uniform float uLen; varying vec2 vQ; void main(){ vQ = position.xy * 2.0;
          float sz = 0.15 + uLen * 0.42; vec3 p = vec3(position.x * sz * 1.5, position.y * sz, 0.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
        fragmentShader: /* glsl */`precision highp float; uniform float uLen, uT, uHot, uSeed; varying vec2 vQ;
          void main(){ float r = length(vQ * vec2(0.8, 1.0)); float fl = 0.7 + 0.3 * sin(uT * 57.0 + uSeed * 9.0) * sin(uT * 23.0 + uSeed);
            float a = exp(-r * r * 4.0) * step(0.02, uLen);
            vec3 c = mix(vec3(1.0, 0.38, 0.1), vec3(0.5, 0.75, 1.0), uHot) * a * 1.8 + vec3(1.0, 0.9, 0.8) * exp(-r * r * 22.0) * 1.2 * a;
            gl_FragColor = vec4(c * fl * min(uLen * 1.6, 1.4), 1.0); }`,
      }));
      this.flames.push(add(fl, x, 0.29, REAR + 0.05));
    }
    // ── airfoil wing with endplates and a third brake light ──
    const af = new THREE.Shape();
    af.moveTo(0.19, 0); af.bezierCurveTo(0.12, 0.05, -0.08, 0.055, -0.19, 0.012); af.lineTo(-0.19, 0.0); af.bezierCurveTo(-0.08, 0.02, 0.1, 0.012, 0.19, 0);
    const wingG = new THREE.ExtrudeGeometry(af, { depth: 1.84, bevelEnabled: false, curveSegments: 10 });
    wingG.rotateY(-Math.PI / 2); wingG.translate(0.92, 0, 0); wingG.computeVertexNormals();
    const wing = add(new THREE.Mesh(wingG, paint), 0, 1.06, L / 2 - 0.2, -0.06);
    for (const x of [-0.93, 0.93]) add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.13, 0.42), satin), x, 1.05, L / 2 - 0.2);
    for (const x of [-0.6, 0.6]) add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.2, 0.1), satin), x, 0.96, L / 2 - 0.2);
    this.brakeU = { uI: { value: 1 } };
    add(new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.018), new THREE.ShaderMaterial({ uniforms: this.brakeU, vertexShader: QUAD_VERT,
      fragmentShader: 'precision highp float; uniform float uI; void main(){ gl_FragColor = vec4(vec3(1.0, 0.08, 0.2) * 1.6 * uI, 1.0); }' })), 0, 1.075, L / 2 - 0.01);
    // neon accents: wing leading edge (cyan), side stripes (magenta), lower sills (cyan)
    this.neonA = new THREE.MeshBasicMaterial({ color: 0x3ef4ff }); this.neonB = new THREE.MeshBasicMaterial({ color: 0xff3fc8 });
    add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.008, 0.008), this.neonA), 0, 1.068, L / 2 - 0.39);
    for (const sgn of [-1, 1]) {
      // stripe hugging the flank at the beltline, sill line just above the rocker
      const pts = [], sill = [];
      for (let k = 0; k <= 24; k++) { const s = lerp(0.25, 4.0, k / 24); pts.push(new THREE.Vector3(sgn * (halfW(s) + 0.012), beltY(s) - 0.075, zOf(s))); sill.push(new THREE.Vector3(sgn * (halfW(s) - 0.006), botY(s) + 0.1, zOf(s))); }
      this.body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.009, 5), this.neonB));
      this.body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sill), 48, 0.006, 5), this.neonA));
      // 80s side strakes on the doors/rear quarters
      for (let k = 0; k < 5; k++) {
        const y = 0.36 + k * 0.05, s0 = 1.15, s1 = 2.35;
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.022, s1 - s0), satin);
        st.position.set(sgn * (halfW((s0 + s1) / 2) + 0.004), y, zOf((s0 + s1) / 2)); this.body.add(st);
      }
      // wheel arches: black lips around the wheels
      for (const sw of [0.86, 3.58]) {
        const arch = new THREE.Mesh(new THREE.RingGeometry(0.37, 0.43, 32, 1, 0, Math.PI), satin);
        arch.rotation.y = sgn * Math.PI / 2; arch.position.set(sgn * (halfW(sw) + 0.007), 0.34, zOf(sw)); this.body.add(arch);
      }
      // mirrors
      add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.12), paint), sgn * (halfW(2.9) - 0.12), 0.9, zOf(2.9));
    }
    // tail-light streaks (speed trails from the light bar back towards the camera)
    this.streakU = { uLen: { value: 0 }, uCol: { value: new THREE.Vector3(1, 0.08, 0.2) } };
    for (const x of [-0.7, 0.7]) {
      add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.streakU,
        vertexShader: 'uniform float uLen; varying vec2 vQ; void main(){ vQ = vec2(position.x * 2.0, position.y + 0.5); vec3 p = vec3(position.x * 0.5, 0.0, (position.y + 0.5) * uLen); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
        fragmentShader: 'precision highp float; uniform vec3 uCol; uniform float uLen; varying vec2 vQ; void main(){ float a = exp(-vQ.x * vQ.x * 6.0) * pow(max(1.0 - vQ.y, 0.0), 1.5) * step(0.05, uLen); gl_FragColor = vec4(uCol * a * 1.4, 1.0); }',
      })), x, 0.655, REAR + 0.03);
    }
    // ── wheels: tyre with sidewall, five-spoke rim with a chrome lip (outside the body pivot) ──
    this.wheels = [];
    const tyre = new THREE.CylinderGeometry(0.34, 0.34, 0.29, 32, 1); tyre.rotateZ(Math.PI / 2);
    const rimMat = new THREE.ShaderMaterial({ uniforms: { uRot: { value: 0 } },
      vertexShader: 'varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */`precision highp float; uniform float uRot; varying vec3 vP; varying vec3 vN;
        void main(){
          float r = length(vP.yz);
          if (abs(vN.x) < 0.5) { float tread = 0.5 + 0.5 * step(0.5, fract(atan(vP.z, vP.y) * 6.0)); gl_FragColor = vec4(vec3(0.03, 0.025, 0.04) * (0.8 + 0.2 * tread), 1.0); return; }
          float a = atan(vP.z, vP.y) + uRot;
          float spoke = smoothstep(0.28, 0.12, abs(fract(a * 5.0 / 6.2831853) - 0.5) * 2.0 * r * 2.5);
          float face = smoothstep(0.25, 0.235, r);
          float lip = smoothstep(0.235, 0.245, r) * smoothstep(0.27, 0.255, r);
          float hub = smoothstep(0.06, 0.05, r);
          vec3 c = vec3(0.025, 0.02, 0.035);
          c = mix(c, vec3(0.32, 0.3, 0.42) * (0.5 + 0.5 * spoke), face * max(spoke, hub));
          c += vec3(0.75, 0.72, 0.9) * lip * (0.6 + 0.4 * sin(a * 2.0));
          gl_FragColor = vec4(c, 1.0); }` });
    for (const [x, sw] of [[-0.85, 0.86], [0.85, 0.86], [-0.85, 3.58], [0.85, 3.58]]) {
      const wm = new THREE.Mesh(tyre, rimMat); wm.position.set(x, 0.34, zOf(sw)); this.group.add(wm); this.wheels.push(wm);
    }
    this.rimMat = rimMat;
    // ── underglow pool + contact shadow ──
    this.glowU = { uI: { value: 1 }, uCol: { value: new THREE.Vector3(1, 0.25, 0.8) } };
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 6.4), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.glowU, vertexShader: QUAD_VERT,
      fragmentShader: 'precision highp float; uniform float uI; uniform vec3 uCol; varying vec2 vUv; void main(){ vec2 q = (vUv - 0.5) * 2.0; float d = length(q); float a = exp(-d * d * 3.2); gl_FragColor = vec4(uCol * a * 0.55 * uI, 1.0); }',
    }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.012; this.group.add(glow);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 4.8), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: {}, vertexShader: QUAD_VERT,
      fragmentShader: 'precision highp float; varying vec2 vUv; void main(){ vec2 q = (vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.5, max(abs(q.x), abs(q.y) * 0.96)); gl_FragColor = vec4(0.0, 0.0, 0.0, a * 0.75); }',
    }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.008; this.group.add(shadow);
    this.group.traverse((o) => { o.frustumCulled = false; });
  }

  update(s) {
    const C = s.car, P = s.pal;
    this.group.visible = C.visible;
    if (!C.visible) return;
    this.group.position.set(C.x + (C.bx || 0), C.by || 0, C.z);
    this.group.rotation.set(C.slope || 0, C.yaw, 0);          // (on a rise or a dip the whole car follows the road)
    this.body.position.y = C.bob;
    this.body.rotation.set(C.pitch, 0, C.roll);
    const u = this.u;
    u.cSky.value.set(...P.skyMid); u.cTop.value.set(...P.skyTop); u.cHor.value.set(...P.horizon); u.cSun.value.set(...P.sunMid); u.cGrid.value.set(...P.grid);
    u.uGlow.value = C.glow;
    this.neonA.color.setRGB(...P.gridAlt).multiplyScalar(0.8 + 0.6 * C.lights);
    this.neonB.color.setRGB(...P.grid).multiplyScalar(1.0 + 0.8 * C.lights);
    this.tailU.uI.value = C.tail; this.brakeU.uI.value = C.tail;
    this.glowU.uI.value = C.glow; this.glowU.uCol.value.set(...P.neon);
    this.exU.uI.value = C.exhaust;
    for (const f of this.flames) { const fu = f.material.uniforms; fu.uLen.value = C.flame; fu.uT.value = s.t; fu.uHot.value = C.flameHot; }
    this.streakU.uLen.value = C.streak;
    this.rimMat.uniforms.uRot.value = C.wheel;
    for (const w of this.wheels) w.rotation.x = -C.wheel;
  }
}
