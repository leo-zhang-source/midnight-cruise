// "Cruise" — hand-authored single-line neon script. The path is an SVG path (M/C/L),
// flattened into a ribbon whose shader renders a luminous tube with a write-on head.
import * as THREE from '../vendor/three.module.min.js';

// Authored in SVG space (y down). Baseline y≈200, x-height y≈140, cap y≈40.
export const CRUISE_PATH = [
  // C
  'M 172,78 C 176,54 152,38 124,44 C 82,52 44,100 42,146 C 40,188 66,214 104,210 C 134,207 158,190 174,170',
  // r
  'C 182,160 188,150 194,141 C 197,147 201,150 206,147 C 210,141 217,137 222,142 C 226,152 219,186 224,200 C 226,206 232,204 237,195',
  // u
  'C 241,182 245,162 249,140 C 244,166 240,196 258,201 C 272,204 284,182 292,140 C 288,166 284,196 300,201',
  // i
  'C 310,203 318,180 324,140 C 320,166 316,196 332,201',
  // s
  'C 341,201 347,174 353,138 C 362,150 374,165 373,182 C 372,199 356,207 345,199 C 351,207 367,204 380,195',
  // e + swash
  'C 392,188 408,176 414,162 C 420,146 406,136 396,146 C 382,160 380,196 402,201 C 424,205 446,188 462,168',
  'C 480,144 498,148 488,176 C 476,214 420,236 300,238 C 210,239 130,234 72,224',
].join(' ');
export const DOT_PATH = 'M 331,112 L 339,108';

function parse(d) {
  const toks = d.match(/[MCL]|-?\d*\.?\d+/g);
  const strokes = []; let cur = null, i = 0, p = [0, 0];
  const num = () => +toks[i++];
  while (i < toks.length) {
    const c = toks[i++];
    if (c === 'M') { p = [num(), num()]; cur = [p.slice()]; strokes.push(cur); }
    else if (c === 'L') { const q = [num(), num()]; for (let k = 1; k <= 6; k++) cur.push([p[0] + (q[0] - p[0]) * k / 6, p[1] + (q[1] - p[1]) * k / 6]); p = q; }
    else if (c === 'C') {
      const a = [num(), num()], b = [num(), num()], e = [num(), num()];
      const len = Math.hypot(a[0] - p[0], a[1] - p[1]) + Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(e[0] - b[0], e[1] - b[1]);
      const n = Math.max(8, Math.ceil(len / 2.5));
      for (let k = 1; k <= n; k++) {
        const t = k / n, u = 1 - t;
        cur.push([u * u * u * p[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * e[0], u * u * u * p[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * e[1]]);
      }
      p = e;
    }
  }
  return strokes;
}

export function cruiseStrokes() { return [...parse(CRUISE_PATH), ...parse(DOT_PATH)]; }

// Build a ribbon mesh for all strokes. halfW in path units. Arc length is normalised over all strokes.
function ribbon(strokes, halfW) {
  const pos = [], s = [], q = [], idx = [];
  let total = 0;
  const lens = strokes.map((st) => { let L = 0; for (let k = 1; k < st.length; k++) L += Math.hypot(st[k][0] - st[k - 1][0], st[k][1] - st[k - 1][1]); return L; });
  const gapLen = 40; // the dot is written after a short pause
  total = lens.reduce((a, b) => a + b, 0) + gapLen * (strokes.length - 1);
  let acc = 0;
  strokes.forEach((st, si) => {
    const base = pos.length / 3;
    let L = 0;
    const pts = st;
    // extended caps
    const n = pts.length;
    // tangent = bisector of incoming/outgoing directions; at cusps (direction reversal) keep the incoming one
    const dir = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
    const tan = (k) => {
      const din = k > 0 ? dir(pts[k - 1], pts[k]) : null, dout = k < n - 1 ? dir(pts[k], pts[k + 1]) : null;
      if (!din) return dout; if (!dout) return din;
      const sx = din[0] + dout[0], sy = din[1] + dout[1], l = Math.hypot(sx, sy);
      return l < 0.35 ? din : [sx / l, sy / l];
    };
    const verts = [];
    const t0 = tan(0), t1 = tan(n - 1);
    verts.push({ p: [pts[0][0] - t0[0] * halfW, pts[0][1] - t0[1] * halfW], t: t0, L: 0, e: -1 });
    for (let k = 0; k < n; k++) { if (k > 0) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); verts.push({ p: pts[k], t: tan(k), L, e: 0 }); }
    verts.push({ p: [pts[n - 1][0] + t1[0] * halfW, pts[n - 1][1] + t1[1] * halfW], t: t1, L, e: 1 });
    verts.forEach((v, k) => {
      const nx = -v.t[1], ny = v.t[0];
      for (const sg of [-1, 1]) {
        pos.push(v.p[0] + nx * halfW * sg, v.p[1] + ny * halfW * sg, 0);
        s.push((acc + v.L) / total, v.e, si);
        q.push(sg, (acc / total), ((acc + lens[si]) / total));
      }
      if (k > 0) { const a = base + (k - 1) * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
    });
    acc += lens[si] + gapLen;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(s, 3));
  g.setAttribute('aQ', new THREE.Float32BufferAttribute(q, 3));
  g.setIndex(idx);
  return { geo: g, total, gaps: crossings(strokes, total, gapLen) };
}

// Neon-sign blockout: where the tube crosses itself, the pass written LATER goes behind and gets a
// short unlit gap either side of the front tube (as a glass bender would paint it out).
function crossings(strokes, total, gapLen) {
  const segs = []; let acc = 0;
  strokes.forEach((st) => {
    for (let k = 1; k < st.length; k++) {
      const a = st[k - 1], b = st[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segs.push({ a, b, s0: acc, s1: acc + l }); acc += l;
    }
    acc += gapLen;
  });
  const hits = [];
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const A = segs[i], B = segs[j];
    if (B.s0 - A.s1 < 30) continue;                     // neighbours along the tube are not crossings
    const d1x = A.b[0] - A.a[0], d1y = A.b[1] - A.a[1], d2x = B.b[0] - B.a[0], d2y = B.b[1] - B.a[1];
    const den = d1x * d2y - d1y * d2x; if (Math.abs(den) < 1e-9) continue;
    const ex = B.a[0] - A.a[0], ey = B.a[1] - A.a[1];
    const t = (ex * d2y - ey * d2x) / den, u = (ex * d1y - ey * d1x) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      const sb = B.s0 + u * (B.s1 - B.s0);
      if (!hits.some((h) => Math.abs(h - sb) < 20)) hits.push(sb);
    }
  }
  return hits.slice(0, 8).map((sb) => [(sb - 9) / total, (sb + 9) / total]);
}

const VERT = /* glsl */`
  attribute vec3 aS; attribute vec3 aQ;
  varying float vS; varying float vA; varying float vE; varying float vS0; varying float vS1;
  void main(){ vS = aS.x; vE = aS.y; vA = aQ.x; vS0 = aQ.y; vS1 = aQ.z; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export class Neon {
  constructor() {
    const strokes = cruiseStrokes();
    const core = ribbon(strokes, 6.2), glow = ribbon(strokes, 32);
    this.total = core.total;
    const uniforms = {
      uProg: { value: 0 }, uPow: { value: 1 }, uSurge: { value: 0 }, uGlass: { value: 0 },
      uCol: { value: new THREE.Vector3(1, 0.25, 0.7) }, uHot: { value: new THREE.Vector3(1, 0.86, 0.95) }, uTime: { value: 0 },
      uGaps: { value: Array.from({ length: 8 }, (_, k) => new THREE.Vector2(...(core.gaps[k] || [2, 2]))) },
    };
    this.gaps = core.gaps;
    const frag = (isGlow) => /* glsl */`
      precision highp float;
      uniform float uProg, uPow, uSurge, uGlass, uTime; uniform vec3 uCol, uHot; uniform vec2 uGaps[8];
      varying float vS, vA, vE, vS0, vS1;
      void main(){
        float gap = 1.0;
        for (int k = 0; k < 8; k++) gap *= 1.0 - smoothstep(-0.0012, 0.0012, min(vS - uGaps[k].x, uGaps[k].y - vS));
        // capsule ends
        float a = abs(vA);
        float r = vE != 0.0 ? length(vec2(abs(vE), a)) : a;
        if (r > 1.0) discard;
        // write-on: visible up to the pen head, energised behind it
        float drawn = vS <= uProg ? 1.0 : 0.0;
        float head = exp(-pow((uProg - vS) * 220.0, 2.0)) * step(vS, uProg + 0.002) * step(uProg, 0.999) * step(0.0005, uProg);
        float pw = uPow * (1.0 + uSurge);
        ${isGlow ? `
        float g = exp(-r * r * 4.2) * 0.42 + exp(-r * r * 22.0) * 0.55;
        vec3 col = uCol * g * (pw * drawn + head * 2.0) * mix(0.35, 1.0, gap);
        gl_FragColor = vec4(col, 0.0);` : `
        float tube = smoothstep(1.0, 0.5, r);
        float hot = exp(-r * r * 26.0);
        vec3 lit = uCol * tube * 1.6 + uHot * hot * 0.75;
        vec3 glass = uCol * 0.05 * smoothstep(1.0, 0.7, r) * (1.0 - smoothstep(0.3, 0.7, r) * 0.6);
        vec3 col = (lit * pw * drawn + (uHot * 3.0 + uCol * 2.0) * head * smoothstep(1.0, 0.0, r) + glass * uGlass) * gap;
        gl_FragColor = vec4(col, 0.0);`}
      }`;
    const mk = (geo, glowFlag) => new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms, vertexShader: VERT, fragmentShader: frag(glowFlag), transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    }));
    this.glow = mk(glow.geo, true); this.core = mk(core.geo, false);
    this.glow.renderOrder = 20; this.core.renderOrder = 21;
    this.group = new THREE.Group();
    this.group.add(this.glow, this.core);
    this.uniforms = uniforms;
    // Rendered into its own light buffer (added on top of chrome in the composite). Glow and core both use
    // MAX blending, so tight bends and cusps never double up into hot spots.
    this.scene = new THREE.Scene();
    this.scene.add(this.group);
  }
}
