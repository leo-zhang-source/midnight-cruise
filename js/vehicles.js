// Vehicle bodies for traffic and the police: shells lofted from cross-sections (the same method as the player's
// car), merged with wheels, lights and a roof bar into ONE geometry per body style and drawn instanced.
// Per instance: position, heading, scale, paint colour, fade, and the state of its lights.
import * as THREE from '../vendor/three.module.min.js';

const lerp = (a, b, t) => a + (b - a) * t;
const pl = (keys, x) => { if (x <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (x <= keys[i][0]) { const [a, va] = keys[i - 1], [b, vb] = keys[i]; return va + (vb - va) * (x - a) / (b - a); } return keys[keys.length - 1][1]; };

// Body styles. s runs from the rear bumper (0) to the nose (L). top/bot: body outline, hw: half width,
// cab: [s0, s1] and roof: glasshouse height along s (0 = meets the body).
const STYLES = {
  car: {   // a low four-door: the size of the player's car, a touch taller
    L: 4.7, hw: (s) => 1.0 - 0.07 * Math.max(0, (s - 4.0) / 0.7) ** 1.5 - 0.04 * Math.max(0, (0.2 - s) / 0.2),
    top: [[0, 0.78], [0.08, 0.9], [1.0, 0.93], [3.1, 0.9], [4.1, 0.76], [4.6, 0.6], [4.7, 0.46]], bot: 0.24,
    cab: [0.75, 3.35], roof: [[0.75, 0], [1.45, 0.44], [2.55, 0.46], [3.35, 0]], inset: 0.16, tail: 'bar',
  },
  van: {   // a tall box van
    L: 5.3, hw: (s) => 1.1 - 0.06 * Math.max(0, (s - 4.6) / 0.7) ** 1.5,
    top: [[0, 1.0], [0.06, 1.12], [4.2, 1.12], [4.7, 1.0], [5.2, 0.86], [5.3, 0.6]], bot: 0.28,
    cab: [0.04, 4.45], roof: [[0.04, 0.82], [0.2, 0.93], [3.5, 0.93], [4.45, 0]], inset: 0.06, tail: 'posts',
  },
  cab: {   // truck tractor (the trailer is drawn separately)
    L: 3.2, hw: (s) => 1.3 - 0.08 * Math.max(0, (s - 2.5) / 0.7) ** 1.5,
    top: [[0, 1.5], [2.3, 1.5], [2.9, 1.35], [3.2, 0.9]], bot: 0.45,
    cab: [0.1, 2.75], roof: [[0.1, 1.5], [0.3, 1.62], [1.9, 1.62], [2.75, 0]], inset: 0.05, tail: 'none',
  },
};

function shell(st) {
  const { L } = st, zOf = (s) => L / 2 - s, pos = [], part = [];
  const topY = (s) => pl(st.top, s);
  const quad = (a, b, c, d, p) => { for (const v of [a, c, b, b, c, d]) { pos.push(...v); part.push(p); } };
  // body: closed rings
  const ring = (s) => {
    const hw = st.hw(s), t = topY(s), b = st.bot, r = [];
    const half = [[hw - 0.14, b], [hw - 0.02, b + 0.07], [hw, b + 0.2], [hw, lerp(b, t, 0.62)], [hw - 0.06, t - 0.05], [hw - 0.2, t], [hw * 0.45, t + 0.012]];
    r.push([0, b]); for (const p of half) r.push(p); r.push([0, t + 0.018]);
    for (let i = half.length - 1; i >= 0; i--) r.push([-half[i][0], half[i][1]]);
    return r.map(([x, y]) => [x, y, zOf(s)]);
  };
  const n = 26; let prev = ring(0);
  for (let i = 1; i <= n; i++) {
    const cur = ring(L * i / n), m = cur.length;
    for (let j = 0; j < m; j++) quad(prev[j], prev[(j + 1) % m], cur[j], cur[(j + 1) % m], 0);
    prev = cur;
  }
  for (const [s, flip] of [[0, true], [L, false]]) {            // end caps
    const r = ring(s), m = r.length, c = [0, (st.bot + topY(s)) / 2, zOf(s)];
    for (let j = 0; j < m; j++) { const a = r[j], b = r[(j + 1) % m]; for (const v of flip ? [c, b, a] : [c, a, b]) { pos.push(...v); part.push(0); } }
  }
  // glasshouse: open arcs, glass on the ends and sides, painted roof
  const [c0, c1] = st.cab;
  const arc = (s) => {
    const base = topY(s) - 0.01, r = Math.max(base + 0.004, base + pl(st.roof, s)), hb = st.hw(s) - st.inset, hr = hb - 0.16;
    const half = [[hb, base], [hb - 0.04, lerp(base, r, 0.6)], [hr, r - 0.03], [hr - 0.14, r]];
    const a = half.slice(); a.push([0, r + 0.01]); for (let i = half.length - 1; i >= 0; i--) a.push([-half[i][0], half[i][1]]);
    return a.map(([x, y]) => [x, y, zOf(s)]);
  };
  const nc = 18; prev = arc(c0);
  for (let i = 1; i <= nc; i++) {
    const s = lerp(c0, c1, i / nc), cur = arc(s), m = cur.length, flat = Math.abs(pl(st.roof, s) - pl(st.roof, lerp(c0, c1, (i - 1) / nc))) < 0.012;
    for (let j = 0; j < m - 1; j++) quad(prev[j], prev[j + 1], cur[j], cur[j + 1], flat && j >= 2 && j <= m - 4 ? 0 : 1);
    prev = cur;
  }
  const box = (x, y, z, sx, sy, sz, p) => {
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed(), a = g.getAttribute('position').array;
    for (let i = 0; i < a.length; i += 3) { pos.push(a[i] + x, a[i + 1] + y, a[i + 2] + z); part.push(p); }
  };
  // wheels
  const wr = st === STYLES.cab ? 0.5 : 0.36, wy = wr, wx = st.hw(L * 0.5) - 0.13;
  for (const s of [L * 0.19, L * 0.8]) for (const sx of [-1, 1]) {
    const g = new THREE.CylinderGeometry(wr, wr, 0.3, 14).toNonIndexed(); g.rotateZ(Math.PI / 2);
    const a = g.getAttribute('position').array;
    for (let i = 0; i < a.length; i += 3) { pos.push(a[i] + sx * wx, a[i + 1] + wy, a[i + 2] + zOf(s)); part.push(3); }
  }
  // rear lights
  const rz = L / 2 + 0.012, hw0 = st.hw(0.05), ty = topY(0.3);
  if (st.tail === 'bar') { box(0, ty - 0.2, rz, hw0 * 1.72, 0.1, 0.04, 2); box(0, st.bot + 0.12, rz - 0.02, hw0 * 1.8, 0.08, 0.06, 3); }
  else if (st.tail === 'posts') { for (const sx of [-1, 1]) box(sx * (hw0 - 0.1), 1.25, rz, 0.14, 0.75, 0.04, 2); box(0, st.bot + 0.14, rz - 0.02, hw0 * 1.85, 0.1, 0.06, 3); }
  // roof bar: left and right halves (taxi sign / police lights), collapsed for plain cars
  const rs = lerp(c0, c1, 0.5), ry = topY(rs) + pl(st.roof, rs) + 0.09;
  box(-0.3, ry, zOf(rs), 0.56, 0.15, 0.3, 4); box(0.3, ry, zOf(rs), 0.56, 0.15, 0.3, 5);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.computeVertexNormals();
  return g;
}

const MAX = 40;
function makeStyle(style, uniforms) {
  const base = shell(STYLES[style]);
  const g = new THREE.InstancedBufferGeometry();
  for (const k of ['position', 'normal', 'aPart']) g.setAttribute(k, base.getAttribute(k));
  const A = {};
  for (const [n, k] of [['aP', 3], ['aS', 4], ['aC', 3], ['aL', 4]]) { A[n] = new THREE.InstancedBufferAttribute(new Float32Array(MAX * k), k); A[n].setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, A[n]); }
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      attribute float aPart; attribute vec3 aP, aC; attribute vec4 aS, aL;   // aS: heading, scale, fade, roof bar (0 none, 1 taxi, 2 police) · aL: tail, roof left, roof right, brake
      varying vec3 vN, vW, vC, vL; varying float vPart; varying vec4 vS, vLi;
      void main(){
        vec3 p = position;
        if (aPart > 3.5 && aS.w < 0.5) p = vec3(0.0);                     // plain cars have no roof bar
        float c = cos(aS.x), s = sin(aS.x);
        mat3 R = mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
        vL = p; vec3 w = aP + R * (p * aS.y); vW = w; vN = R * normal; vC = aC; vPart = aPart; vS = aS; vLi = aL;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uT; uniform vec3 cSky, cTop, cHor, cSun, cGrid, cFog;
      varying vec3 vN, vW, vC, vL; varying float vPart; varying vec4 vS, vLi;
      float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      vec3 env(vec3 R){
        float y = R.y;
        vec3 c = y > 0.0 ? mix(cSky * 1.1, cTop, smoothstep(0.05, 0.7, y)) : mix(cHor * 0.25, cGrid * 0.12, smoothstep(-0.02, -0.5, y));
        c += cHor * exp(-abs(y) / 0.04) * 1.1;
        c += cSun * exp(-pow((R.z + 0.98) / 0.08, 2.0)) * exp(-pow((y - 0.07) / 0.1, 2.0)) * 1.4;
        return c;
      }
      void main(){
        if (vS.z < 0.995 && h21(floor(gl_FragCoord.xy) + floor(uT * 30.0) * 7.0) > vS.z) discard;
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW), R = reflect(-V, N);
        float fr = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 col;
        if (vPart < 0.5) {            // paint: candy colour, clear-coat reflection, neon bounce from the road
          col = vC * (0.42 + 0.58 * max(N.y, 0.0)) * mix(0.5, 1.0, smoothstep(0.25, 0.7, vL.y)) + env(R) * (0.08 + 0.92 * fr) * 0.9;
          col += cGrid * 0.22 * smoothstep(0.6, 0.25, vL.y) * max(0.4 - N.y, 0.0);
        } else if (vPart < 1.5) col = vec3(0.006, 0.006, 0.02) + env(R) * (0.12 + 0.88 * fr) * 1.2;
        else if (vPart < 2.5) col = vec3(3.0, 0.16, 0.28) * (0.75 + 1.6 * vLi.w) * vLi.x;
        else if (vPart < 3.5) col = vec3(0.012, 0.01, 0.02) + env(R) * 0.04;
        else {
          float on = vPart < 4.5 ? vLi.y : vLi.z;
          vec3 lc = vS.w > 1.5 ? (vPart < 4.5 ? vec3(4.0, 0.15, 0.3) : vec3(0.2, 0.6, 4.5)) : vec3(2.6, 2.0, 0.3);
          col = lc * on + vec3(0.03);
        }
        float dist = length(vW - cameraPosition);
        col = mix(col, cFog, (1.0 - exp(-dist / 900.0)) * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 5;
  m.userData = { A, g, n: 0, len: STYLES[style].L };
  return m;
}

export class Vehicles {
  constructor() {
    this.u = { uT: { value: 0 }, cSky: { value: new THREE.Vector3() }, cTop: { value: new THREE.Vector3() }, cHor: { value: new THREE.Vector3() }, cSun: { value: new THREE.Vector3() }, cGrid: { value: new THREE.Vector3() }, cFog: { value: new THREE.Vector3() } };
    this.group = new THREE.Group();
    this.m = {};
    for (const k of Object.keys(STYLES)) { this.m[k] = makeStyle(k, this.u); this.group.add(this.m[k]); }
  }
  begin(P, T) {
    const u = this.u;
    u.uT.value = T; u.cSky.value.set(...P.skyMid); u.cTop.value.set(...P.skyTop); u.cHor.value.set(...P.horizon); u.cSun.value.set(...P.sunMid); u.cGrid.value.set(...P.grid); u.cFog.value.set(...P.fog);
    for (const k in this.m) this.m[k].userData.n = 0;
  }
  // style: 'car' | 'van' | 'cab' · bar: 0 none, 1 taxi sign, 2 police · tail / roofL / roofR: light levels · brake: 0..1
  add(style, x, y, z, yaw, scale, col, fade = 1, bar = 0, tail = 1, roofL = 0, roofR = 0, brake = 0) {
    const d = this.m[style].userData, i = d.n; if (i >= MAX) return; d.n++;
    d.A.aP.array.set([x, y, z], i * 3); d.A.aS.array.set([yaw, scale, fade, bar], i * 4);
    d.A.aC.array.set(col, i * 3); d.A.aL.array.set([tail, roofL, roofR, brake], i * 4);
  }
  end() {
    for (const k in this.m) { const m = this.m[k], d = m.userData; d.g.instanceCount = d.n; m.visible = d.n > 0; for (const a in d.A) d.A[a].needsUpdate = true; }
  }
}
