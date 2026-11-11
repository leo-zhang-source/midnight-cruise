// The police helicopter. One lofted fuselage — nose bubble, cabin, tail boom — with the windows as panels of the same
// surface, plus engine cowl, T-tail, skids, searchlight and gun pods, merged into a single mesh (a part id per face),
// and two blurred rotor discs. There is one of it: it is placed each frame from the sim state.
// Local frame: nose towards −z, y up, y = 0 under the skids, the rotor mast on the y axis.
import * as THREE from '../vendor/three.module.min.js';
import { ENV_GLSL } from './vehicles.js';

const lerp = (a, b, t) => a + (b - a) * t, sat = (x) => Math.max(0, Math.min(1, x)), smooth = (x) => { x = sat(x); return x * x * (3 - 2 * x); };
// a smooth curve through [x, y] keys (Catmull-Rom)
const spline = (keys) => (x) => {
  const n = keys.length; if (x <= keys[0][0]) return keys[0][1]; if (x >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 1; while (keys[i][0] < x) i++;
  const [x1, y1] = keys[i - 1], [x2, y2] = keys[i], h = x2 - x1, t = (x - x1) / h, t2 = t * t, t3 = t2 * t;
  const m1 = i >= 2 ? (y2 - keys[i - 2][1]) / (x2 - keys[i - 2][0]) : (y2 - y1) / h, m2 = i + 1 < n ? (keys[i + 1][1] - y1) / (keys[i + 1][0] - x1) : (y2 - y1) / h;
  return (2 * t3 - 3 * t2 + 1) * y1 + (t3 - 2 * t2 + t) * h * m1 + (3 * t2 - 2 * t3) * y2 + (t3 - t2) * h * m2;
};

// the fuselage outline along s, the distance back from the nose tip: roof line, belly line, half width
const Z0 = -2.5, LEN = 9.5;
const TOP = spline([[0, 1.34], [0.05, 1.5], [0.15, 1.64], [0.35, 1.82], [0.7, 2.03], [1.1, 2.2], [1.5, 2.31], [1.9, 2.36], [2.6, 2.37], [3.2, 2.34], [3.8, 2.27], [4.4, 2.22], [5.0, 2.2], [9.5, 2.16]]);
const BOT = spline([[0, 1.34], [0.05, 1.19], [0.15, 1.07], [0.35, 0.93], [0.7, 0.79], [1.1, 0.72], [1.6, 0.7], [2.7, 0.7], [3.1, 0.78], [3.6, 1.0], [4.1, 1.32], [4.6, 1.58], [5.0, 1.68], [9.5, 1.92]]);
const HW = spline([[0, 0], [0.05, 0.2], [0.15, 0.35], [0.35, 0.53], [0.7, 0.73], [1.1, 0.87], [1.5, 0.95], [1.9, 0.98], [2.7, 0.98], [3.2, 0.88], [3.7, 0.68], [4.2, 0.45], [4.7, 0.3], [5.0, 0.27], [9.5, 0.12]]);
// glass, as ranges of s: the windscreen bubble (and how far its lower panes run), the door and rear side windows
const WS = [0.1, 1.62], CHIN = [0.16, 1.0], DOOR = [1.74, 2.6], REAR = [2.72, 3.3];
const M = 20;                                  // points round a section; strip k = 0 is the keel, 4 | 5 meet at the waist, 9 is the crown

// points of interest, in the local frame (see Heli.at)
export const HELI = {
  lamp: [0, 0.4, -1.48], gunL: [-1.3, 0.64, -1.5], gunR: [1.3, 0.64, -1.5],
  navL: [-1.44, 0.8, -0.25], navR: [1.44, 0.8, -0.25], strobe: [0, 3.5, 7.45], beacon: [0, 0.74, 0.9],
  rotorY: 3.14, rotorR: 4.8, pivot: 2.1,
};

function build() {
  const pos = [], nor = [], part = [];
  const push = (v, n, p) => { pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); part.push(p); };
  // a skin over rings of points that run from the tail (+z) to the nose; panel(k, i) names the part of each strip
  const loft = (rings, panel, caps) => {
    const m = rings[0].length, N = rings.map((r) => r.map(() => new THREE.Vector3()));
    const fn = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < m; j++) {
      const j1 = (j + 1) % m, a = rings[i][j], b = rings[i][j1], c = rings[i + 1][j], d = rings[i + 1][j1];
      fn.copy(e1.subVectors(c, a).cross(e2.subVectors(b, a))).add(e1.subVectors(b, d).cross(e2.subVectors(c, d)));
      for (const n of [N[i][j], N[i][j1], N[i + 1][j], N[i + 1][j1]]) n.add(fn);
    }
    for (const r of N) for (const n of r) n.normalize();
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < m; j++) {
      const j1 = (j + 1) % m, k = j < m / 2 ? j : m - 1 - j, p = panel(k, i);
      for (const [ri, rj] of [[i, j], [i + 1, j], [i, j1], [i, j1], [i + 1, j], [i + 1, j1]]) push(rings[ri][rj], N[ri][rj], p);
    }
    for (const [idx, nz] of caps) {                                          // flat end faces
      const r = rings[idx], c = new THREE.Vector3(0, (r[0].y + r[m / 2].y) / 2, r[0].z), n = new THREE.Vector3(0, 0, nz);
      for (let j = 0; j < m; j++) { const a = r[j], b = r[(j + 1) % m]; for (const v of nz > 0 ? [c, a, b] : [c, b, a]) push(v, n, panel(-1, idx)); }
    }
  };
  // a rounded section: w half width, yb … yt bottom and top, n how square it is (2 = an ellipse), lean = how far the top leans in
  const section = (m, z, w, yb, yt, n, lean = 0) => {
    const yc = (yt + yb) / 2, h = (yt - yb) / 2, e = 2 / n, r = [];
    for (let j = 0; j < m; j++) {
      const th = -Math.PI / 2 + (j / m) * Math.PI * 2, c = Math.cos(th), sn = Math.sin(th);
      const x = Math.abs(c) < 1e-9 ? 0 : w * Math.sign(c) * Math.abs(c) ** e * (1 - lean * Math.max(0, sn) ** 2);
      r.push(new THREE.Vector3(x, yc + h * Math.sign(sn) * Math.abs(sn) ** e, z));
    }
    return r;
  };

  // ── fuselage: stations on every window edge, close together round the nose, sparse along the boom ──
  const S = [0, LEN, ...WS, ...CHIN, ...DOOR, ...REAR];
  const add = (s) => { if (!S.some((q) => Math.abs(q - s) < 0.05)) S.push(s); };
  for (const s of [0.02, 0.05, 0.22, 0.3]) S.push(s);
  for (let s = 0.42; s < 5.0; s += 0.14) add(s);
  for (let s = 5.0; s < LEN; s += 0.5) add(s);
  S.sort((a, b) => b - a);                                                   // tail first
  const sq = (s) => lerp(lerp(2.15, 2.7, smooth(s / 1.2)), 2.0, smooth((s - 3.4) / 1.4));
  const lean = (s) => 0.1 * smooth((s - 0.4) / 1.0) * (1 - smooth((s - 3.3) / 1.2));
  const inR = (r, s) => s > r[0] && s < r[1];
  loft(S.map((s) => section(M, Z0 + s, HW(s), BOT(s), TOP(s), sq(s), lean(s))), (k, i) => {
    if (k < 0) return 0;
    const s = (S[i] + S[i + 1]) / 2;
    if (k >= 5 && inR(WS, s)) return 1;
    if ((k === 3 || k === 4) && inR(CHIN, s)) return 1;
    if ((k === 5 || k === 6) && (inR(DOOR, s) || inR(REAR, s))) return 1;
    return 0;
  }, [[0, 1]]);

  // ── engine cowl on the roof, behind the mast fairing ──
  const CW = spline([[0, 0.06], [0.3, 0.36], [0.9, 0.5], [2.0, 0.5], [2.9, 0.38], [3.65, 0.2]]), CH = spline([[0, 0.03], [0.3, 0.26], [0.9, 0.42], [1.8, 0.45], [2.6, 0.36], [3.65, 0.14]]);
  const U = []; for (let i = 24; i >= 0; i--) U.push(3.65 * i / 24);
  loft(U.map((u) => { const base = TOP(u + 1.75) - 0.16; return section(12, -0.75 + u, CW(u), base - 0.12, base + 0.16 + CH(u), 2.4); }), () => 8, [[0, 1], [U.length - 1, -1]]);

  const merge = (g, p, m) => {
    const g2 = g.index ? g.toNonIndexed() : g; if (m) g2.applyMatrix4(m);
    const a = g2.getAttribute('position').array, n = g2.getAttribute('normal').array;
    for (let i = 0; i < a.length; i += 3) { pos.push(a[i], a[i + 1], a[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); part.push(p); }
  };
  const UP = new THREE.Vector3(0, 1, 0), Q = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1);
  const box = (x, y, z, sx, sy, sz, p) => merge(new THREE.BoxGeometry(sx, sy, sz), p, new THREE.Matrix4().makeTranslation(x, y, z));
  const cyl = (a, b, ra, rb, p, seg = 12) => {                                // a tapered tube from a to b
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    Q.setFromUnitVectors(UP, d.normalize());
    merge(new THREE.CylinderGeometry(rb, ra, len, seg), p, new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), Q, ONE));
  };
  const tube = (pts, r, p) => merge(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q))), 20, r, 6, false), p);
  const shape = (poly) => { const sh = new THREE.Shape(); poly.forEach(([a, b], i) => (i ? sh.lineTo(a, b) : sh.moveTo(a, b))); return sh; };
  // a thin upright plate from an outline in (z, y), centred on x; and a flat one from an outline in (x, z), its top at y
  const fin = (poly, x, th, p) => { const g = new THREE.ExtrudeGeometry(shape(poly), { depth: th, bevelEnabled: false }); g.rotateY(-Math.PI / 2); merge(g, p, new THREE.Matrix4().makeTranslation(x + th / 2, 0, 0)); };
  const wing = (poly, y, th, p) => { const g = new THREE.ExtrudeGeometry(shape(poly), { depth: th, bevelEnabled: false }); g.rotateX(Math.PI / 2); merge(g, p, new THREE.Matrix4().makeTranslation(0, y, 0)); };

  // air intake, exhaust, mast and rotor head
  box(0, 2.6, -0.62, 0.5, 0.2, 0.12, 3);
  cyl([0, 2.43, 2.3], [0, 2.53, 3.02], 0.12, 0.11, 7); cyl([0, 2.527, 3.0], [0, 2.533, 3.04], 0.085, 0.085, 3);
  cyl([0, 2.7, 0], [0, 3.1, 0], 0.09, 0.07, 3); cyl([0, 3.08, 0], [0, 3.18, 0], 0.24, 0.2, 7); cyl([0, 2.86, 0], [0, 2.92, 0], 0.2, 0.2, 7);
  // T-tail: swept fin, ventral fin with its bumper, tailplane with end plates; tail-rotor gearbox and hub
  fin([[6.3, 2.1], [6.9, 3.42], [7.42, 3.42], [7.24, 2.05], [7.28, 1.52], [7.02, 1.52], [6.6, 1.95]], 0, 0.07, 8);
  wing([[-0.95, 7.12], [-0.95, 7.5], [-0.2, 7.6], [0.2, 7.6], [0.95, 7.5], [0.95, 7.12], [0.2, 6.9], [-0.2, 6.9]], 3.46, 0.05, 8);
  for (const sx of [-1, 1]) fin([[7.02, 3.2], [7.2, 3.68], [7.52, 3.68], [7.6, 3.2]], sx * 0.95, 0.04, 8);
  cyl([0.0, 2.04, 6.85], [-0.3, 2.04, 6.85], 0.1, 0.06, 3); cyl([-0.26, 2.04, 6.85], [-0.34, 2.04, 6.85], 0.12, 0.12, 7);
  // skids on two cross tubes
  for (const sx of [-1, 1]) tube([[sx * 1.05, 0.38, -2.3], [sx * 1.05, 0.15, -1.98], [sx * 1.05, 0.05, -1.55], [sx * 1.05, 0.05, 0.4], [sx * 1.05, 0.05, 2.05]], 0.05, 7);
  for (const [z, y] of [[-1.0, 0.76], [1.1, 1.04]]) tube([[-1.05, 0.07, z], [-0.88, 0.07 + (y - 0.07) * 0.45, z], [-0.48, y - 0.05, z], [0, y, z], [0.48, y - 0.05, z], [0.88, 0.07 + (y - 0.07) * 0.45, z], [1.05, 0.07, z]], 0.045, 7);
  // searchlight drum under the nose (its lens is a part of its own), camera ball on the chin
  { const c = [0, 0.5, -1.3], d = [0, -0.5, -0.866], at = (k) => c.map((v, i) => v + d[i] * k);
    cyl(at(-0.18), at(0.17), 0.2, 0.2, 3, 16); cyl(at(0.17), at(0.2), 0.17, 0.17, 4, 16); box(0, 0.7, -1.22, 0.12, 0.14, 0.2, 3); }
  merge(new THREE.SphereGeometry(0.16, 12, 8), 3, new THREE.Matrix4().makeTranslation(0, 0.8, -2.02));
  // gun pods under stub pylons, below the lettering
  for (const sx of [-1, 1]) {
    const x = sx * 1.3;
    wing([[sx * 0.55, -0.52], [sx * 1.46, -0.42], [sx * 1.46, -0.06], [sx * 0.55, 0.06]], 0.83, 0.06, 8);
    cyl([x, 0.64, 0.45], [x, 0.64, -0.85], 0.13, 0.13, 3); cyl([x, 0.64, 0.7], [x, 0.64, 0.45], 0.05, 0.13, 3); cyl([x, 0.64, -0.85], [x, 0.64, -1.05], 0.13, 0.06, 3);
    cyl([x, 0.64, -1.05], [x, 0.64, -1.48], 0.04, 0.04, 7, 8);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  return g;
}

// the lettering on the doors
function lettering() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d'), t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
  const paint = () => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 512, 128); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 124; const font = (s) => `700 ${s}px "Chakra Petch", "Arial Narrow", Arial, sans-serif`;
    g.font = font(size); while (g.measureText('POLICE').width > 490 && size > 40) { size -= 4; g.font = font(size); }
    g.fillText('POLICE', 256, 70); t.needsUpdate = true;
  };
  paint();
  if (document.fonts && document.fonts.load) document.fonts.load('700 80px "Chakra Petch"').then(paint, () => {});
  return t;
}

const AY = new THREE.Vector3(0, 1, 0), QY = new THREE.Quaternion(), QT = new THREE.Quaternion(), EU = new THREE.Euler(), V = new THREE.Vector3();

export class Heli {
  // pal: the palette uniforms the vehicles already keep up to date (sky, horizon, sun, road, fog)
  constructor(pal) {
    const u = this.u = { ...pal, uFade: { value: 1 }, uLamp: { value: new THREE.Vector3(1, 1, 1) }, uMap: { value: lettering() } };
    const body = new THREE.Mesh(build(), new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: /* glsl */`
        attribute float aPart; varying vec3 vN, vW, vL; varying float vPart;
        void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = mat3(modelMatrix) * normal; vPart = aPart; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform vec3 cSky, cTop, cHor, cSun, cGrid, cFog, uLamp; uniform float uFade; uniform sampler2D uMap;
        varying vec3 vN, vW, vL; varying float vPart;
        ${ENV_GLSL}
        void main(){
          vec3 N = normalize(vN), V = normalize(cameraPosition - vW), R = reflect(-V, N);
          float nv = max(dot(N, V), 0.0), fr = 0.04 + 0.96 * pow(1.0 - nv, 5.0), dist = length(vW - cameraPosition), rim = pow(1.0 - nv, 3.0);
          float part = vPart; vec3 col;
          if (part > 0.5 && part < 1.5 && vL.z < -0.86 && abs(vL.x) < 0.028) part = 0.0;       // the windscreen's centre post
          if (part < 0.5 || part > 7.5) {      // paint: white over a navy belly, a blue stripe that sweeps up onto the boom; cowl, fins and pylons navy
            vec3 navy = vec3(0.04, 0.055, 0.14), base = navy;
            if (part < 0.5) {
              float ys = mix(1.36, 1.97, smoothstep(1.0, 2.9, vL.z)) + max(vL.z - 2.9, 0.0) * 0.018;
              base = vL.y < 0.86 + 0.75 * smoothstep(1.2, 2.6, vL.z) && vL.z < 2.6 ? navy : vec3(0.84, 0.86, 0.92);
              if (abs(vL.y - ys) < 0.05 && vL.z > -1.9) base = vec3(0.05, 0.24, 0.95);
              vec2 uv = vec2((vL.z + 1.3) / 2.0, (vL.y - 0.88) / 0.42);
              if (abs(N.x) > 0.45 && uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) { if (vL.x > 0.0) uv.x = 1.0 - uv.x; base = mix(base, navy, texture2D(uMap, uv).r); }
            }
            col = base * (0.36 + 0.34 * max(N.y, 0.0)) + base * cGrid * 0.55 * max(-N.y, 0.0)                 // sky from above, the lit road from below
              + base * cSun * 0.3 * max(dot(N, vec3(0.0, 0.24, -0.97)), 0.0)                                  // the low sun behind it
              + env(R) * (0.05 + 0.95 * fr) * 0.7 + (cHor * 0.5 + base * 0.3) * rim * 0.6;
          } else if (part < 1.5) {             // glass: tinted, reflecting the sky; the instruments light the bottom of the bubble
            col = vec3(0.03, 0.04, 0.07) + cSky * 0.35 + env(R) * (0.1 + 0.9 * fr) * 1.1 + cHor * rim * 0.25;
            col += vec3(0.05, 0.42, 0.34) * 0.3 * smoothstep(1.75, 1.25, vL.y) * step(vL.z, -0.86);
          } else if (part < 3.5) col = vec3(0.016, 0.016, 0.026) + env(R) * 0.06 + cHor * rim * 0.1 + cGrid * 0.05 * max(-N.y, 0.0);   // dark fittings
          else if (part < 4.5) col = uLamp * 3.2;                                                              // the searchlight's lens
          else col = vec3(0.2, 0.21, 0.25) * (0.5 + 0.5 * max(N.y, 0.0)) + env(R) * 0.45 + cHor * rim * 0.3 + cGrid * 0.12 * max(-N.y, 0.0);   // bare metal: skids, exhaust, rotor head
          col = mix(cFog, col, uFade);
          col = mix(col, cFog, (1.0 - exp(-dist / 900.0)) * 0.6);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
    body.frustumCulled = false; body.renderOrder = 5;
    // a spinning rotor is a blur: darker than a bright sky behind it, a little lighter than a dark one
    const disc = (r, spin, blades) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * r, 2 * r), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
        uniforms: { cHor: pal.cHor, uT: { value: 0 }, uFade: u.uFade, uSpin: { value: spin }, uBlades: { value: blades } },
        vertexShader: 'varying vec2 vQ; void main(){ vQ = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */`
          precision highp float;
          uniform vec3 cHor; uniform float uT, uFade, uSpin, uBlades; varying vec2 vQ;
          void main(){
            float r = length(vQ); if (r > 1.0) discard;
            float blade = pow(abs(cos((atan(vQ.y, vQ.x) + uT * uSpin) * uBlades * 0.5)), 7.0);
            float a = (0.08 + 0.46 * blade) * smoothstep(1.0, 0.975, r) * smoothstep(0.03, 0.08, r) * uFade;
            float tip = smoothstep(0.9, 0.94, r) * smoothstep(1.0, 0.97, r);
            vec3 col = vec3(0.07, 0.075, 0.1) + cHor * 0.16 + vec3(1.0, 0.72, 0.18) * tip * 0.55;    // blades catch the horizon; their tips are painted yellow
            gl_FragColor = vec4(col * a, a);
          }`,
      }));
      m.frustumCulled = false; m.renderOrder = 7;
      return m;
    };
    this.main = disc(HELI.rotorR, 21, 3); this.main.rotation.x = -Math.PI / 2; this.main.position.set(0, HELI.rotorY, 0);
    this.tail = disc(0.8, 47, 2); this.tail.rotation.y = Math.PI / 2; this.tail.position.set(-0.32, 2.04, 6.85);
    this.group = new THREE.Group(); this.group.add(body, this.main, this.tail); this.group.visible = false;
  }
  // x, y, z: the point under the skids, below the mast · yaw: 0 = nose away from the camera (−z) · tx, tz: tilt about the world x and z axes
  place(x, y, z, yaw, tx, tz, scale, fade, T, lamp) {
    const g = this.group, piv = HELI.pivot * scale;
    g.visible = true;
    g.quaternion.copy(QT.setFromEuler(EU.set(tx, 0, tz))).multiply(QY.setFromAxisAngle(AY, yaw));
    V.set(0, piv, 0).applyQuaternion(g.quaternion);                          // it tilts about its middle, not about its skids
    g.position.set(x - V.x, y + piv - V.y, z - V.z); g.scale.setScalar(scale); g.updateMatrix();
    this.u.uFade.value = fade; this.u.uLamp.value.set(lamp[0], lamp[1], lamp[2]);
    this.main.material.uniforms.uT.value = T; this.tail.material.uniforms.uT.value = T;
  }
  // a local point (see HELI) in the world, after place()
  at(l, out) { return out.set(l[0], l[1], l[2]).applyMatrix4(this.group.matrix); }
}
