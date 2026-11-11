// The game layer and the sci-fi scenery, drawn into the world scene (so they pass through the same VHS finish):
//  · solids — instanced neon-edged boxes: maglev trucks, holo taxis, oncoming cars, barrier pylons, debris
//  · glows  — instanced additive quads: lights, energy cells, the hard-light police barrier, drone searchlight,
//             warning signs, holographic roadside billboards
//  · skyline — a procedural megastructure city on the horizon (BLUE HOUR and LAGOON regions)
// Everything is rebuilt each frame from the frame state: no hidden state, so seeking and replays stay exact.
import * as THREE from '../vendor/three.module.min.js';
import { ROAD } from './cue.js';
import { T_TRUCK, T_TAXI, T_ONC, T_WALL } from './game.js';
import { hash1 } from './util.js';

const MAXB = 520, MAXG = 420;
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
      attribute vec3 aP, aS, aC; attribute vec4 aM;   // aM: kind (0 body, 1 emissive, 2 holo), fade, seed, ribs
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
        if (vM.x < 0.5) {             // dark body with neon edges
          float lw = max(0.05, px * 1.1);
          float e = 1.0 - smoothstep(lw, lw + px * 1.3, d);
          float ribs = 0.0;
          if (vM.w > 0.5 && an.x > 0.5) { float r = abs(fract(q.x / 1.5) - 0.5) * 1.5; ribs = (1.0 - smoothstep(0.035, 0.035 + px, r)) * 0.22; }
          vec3 fill = uGround * 1.5 + vC * 0.03 + uSky * 0.22 * step(0.5, vN.y);
          col = fill + vC * (e * 1.9 + ribs);
        } else if (vM.x < 1.5) {      // emissive
          col = vC;
        } else {                      // hologram: scanline fill, bright edges
          float lw = max(0.045, px * 1.1);
          float e = 1.0 - smoothstep(lw, lw + px * 1.3, d);
          float scan = 0.5 + 0.5 * sin(vW.y * 42.0 - uT * 7.0);
          col = vC * (0.09 + 0.11 * scan) + vC * e * 2.3;
        }
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
          vec2 p = q * vHS, s = vec2(1.0, 1.7320508), h = p / 0.5;
          vec2 a1 = mod(h, s) - s * 0.5, b1 = mod(h - s * 0.5, s) - s * 0.5;
          vec2 gq = dot(a1, a1) < dot(b1, b1) ? a1 : b1;
          float hd = max(abs(gq.x), dot(abs(gq), vec2(0.5, 0.8660254)));
          float line = smoothstep(0.38, 0.47, hd);
          float sweep = 0.5 + 0.5 * sin(p.y * 2.4 - uT * 9.0 + vM.z * 6.0);
          float rail = smoothstep(0.84, 0.97, abs(q.y)), edge = smoothstep(0.93, 1.0, abs(q.x));
          a = line * (0.5 + 0.5 * sweep) + 0.12 + rail * 1.3 + edge * 0.9;
        } else if (t < 2.5) {                        // 2 · soft rectangle (ground glow)
          vec2 d = smoothstep(vec2(1.0), vec2(0.2), abs(q)); a = d.x * d.y;
        } else if (t < 3.5) {                        // 3 · holographic billboard
          float box = max(abs(q.x), abs(q.y));
          float frame = smoothstep(0.88, 0.91, box) * smoothstep(1.0, 0.97, box);
          vec2 uv = q * 0.5 + 0.5; float sd = vM.z;
          float glyph = 0.0;
          vec2 gp = (uv - vec2(0.36, 0.14)) * vec2(8.0, 3.4), gid = floor(gp), gf = fract(gp);
          if (gp.x > 0.0 && gid.x < 5.0 && gp.y > 0.0 && gid.y < 2.0 && h21(gid + sd * 31.0) > 0.12) {
            vec2 c = floor(gf * vec2(4.0, 6.0));
            glyph = step(c.x, 2.5) * step(c.y, 4.5) * step(0.42, h21(c + gid * 7.3 + sd * 91.0));
          }
          vec2 lp = (uv - vec2(0.19, 0.5)) * vec2(vHS.x / vHS.y, 1.0);
          float lr = length(lp), kind = h11(sd * 5.0 + 1.0);
          float logo = kind < 0.5 ? smoothstep(0.04, 0.0, abs(lr - 0.24)) + step(lr, 0.1)
                                  : step(max(abs(lp.x) * 1.5 + lp.y, -lp.y) , 0.26) * step(0.14, max(abs(lp.x) * 1.5 + lp.y, -lp.y + 0.1));
          float bar = step(abs(uv.y - 0.84), 0.02) * step(0.36, uv.x) * step(uv.x, 0.36 + 0.5 * fract(uT * 0.21 + sd));
          float scan = 0.72 + 0.28 * sin(uv.y * 80.0 + uT * 6.0);
          float flick = 0.82 + 0.18 * step(0.9, h21(vec2(floor(uT * 14.0), sd * 7.0)));
          a = (frame * 1.2 + (glyph + logo + bar) * 0.95 + 0.07 * step(box, 0.9)) * scan * flick;
        } else if (t < 4.5) {                        // 4 · energy cell (diamond)
          float dd = abs(q.x) + abs(q.y);
          a = smoothstep(1.0, 0.93, dd) * (0.3 + 0.7 * smoothstep(0.5, 0.9, dd)) + exp(-dd * dd * 6.0) * 0.7;
        } else if (t < 5.5) {                        // 5 · warning triangle
          vec2 p = vec2(q.x, q.y + 0.12);
          float tri = max(abs(p.x) * 1.732 + p.y, -p.y - 0.6);
          float outer = smoothstep(0.96, 0.9, tri), inner = smoothstep(0.72, 0.66, tri);
          float bang = step(abs(p.x), 0.085) * step(-0.2, p.y) * step(p.y, 0.42) + step(length(p - vec2(0.0, -0.4)), 0.1);
          a = (outer - inner) + bang * inner + inner * 0.12;
        } else if (t < 6.5) {                        // 6 · searchlight on the lane
          float box = max(abs(q.x), abs(q.y));
          float outline = smoothstep(0.8, 0.9, box) * smoothstep(1.0, 0.94, box);
          float stripes = step(0.5, fract(q.y * 3.0 + uT * 2.5)) * smoothstep(0.9, 0.6, box) * 0.3;
          a = outline + stripes + smoothstep(0.9, 0.0, box) * 0.14;
        } else if (t < 7.5) {                        // 7 · chevrons pointing along +U
          float c1 = abs(fract(q.x * 1.4 - abs(q.y) * 0.9 - uT * 2.6) - 0.5);
          a = smoothstep(0.2, 0.1, c1) * smoothstep(1.0, 0.8, abs(q.y)) * smoothstep(1.0, 0.6, abs(q.x));
        } else {                                     // 8 · beam
          a = smoothstep(1.0, 0.0, abs(q.x)) * (0.2 + 0.8 * smoothstep(-1.0, 1.0, q.y)) * 0.5;
        }
        gl_FragColor = vec4(col * a * vM.y * exp(-vD / 750.0), 1.0);
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 8;
  m.userData = { A, g };
  return m;
}

// Megastructure skyline: tall towers left and right of the sun's valley, lit windows, neon bands, beacons.
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
          // beacon on the tallest towers
          vec2 bp = vec2((fx - 0.5) * bw, y - top - 6.0);
          if (r > 0.72 && open > 0.5) { float bk = exp(-dot(bp, bp) / 30.0); col += vec3(1.0, 0.15, 0.2) * bk * (0.5 + 0.5 * sin(uT * 2.2 + id)) * 1.6; a = max(a, bk); }
        }
        col = mix(col, cFog, smoothstep(260.0, 0.0, y) * 0.6);
        gl_FragColor = vec4(col, a * uA);
      }`,
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 1;
  return m;
}

const RED = [3.3, 0.22, 0.34], AMBER = [2.6, 1.3, 0.1], WHITE = [5.0, 4.8, 4.2], YELLOW = [1.0, 0.82, 0.12], CELL = [0.72, 1.0, 0.2];

export class GameView {
  constructor() {
    this.solids = makeSolids(); this.glows = makeGlows(); this.skyline = makeSkyline();
    this.group = new THREE.Group(); this.group.add(this.skyline, this.solids, this.glows);
    this.nb = 0; this.ng = 0;
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

  update(s) {
    this.nb = 0; this.ng = 0;
    const P = s.pal, T = s.T, G = s.game, L = ROAD.lane;
    const edge = P.gridAlt, edge2 = P.post2;

    // ── scenery: holographic billboards along the road ──
    const S = 250, N = 6, span = S * N, pos = s.road.pos, bi = s.scenery ?? 1;
    for (let side = -1; side <= 1; side += 2) for (let i = 0; i < N; i++) {
      const z0 = i * S + (side > 0 ? S * 0.5 : 0);
      const d = (((z0 - pos) % span) + span) % span, z = 24 - d;
      const k = bi * Math.min(1, (span - d) / 260) * Math.min(1, (d + 30) / 60);
      const id = i * 2 + (side > 0 ? 1 : 0);
      const c = id % 3 === 0 ? P.post : id % 3 === 1 ? P.post2 : P.neon;
      const x = side * 17.5, w = 5.4, h = 2.9, y = 9.2, yaw = side * 0.42;
      this.glow(x, y, z, w * Math.cos(yaw), 0, w * Math.sin(yaw), 0, h, 0, c, 3, 1.5 * k, id * 0.173 + 0.11);
      this.glow(x, (y - h) * 0.5, z, 0.22, 0, 0, 0, (y - h) * 0.5, 0, c, 8, 0.8 * k);
      this.glow(x, 0.05, z, 1.6, 0, 0, 0, 0, 1.6, c, 0, 0.55 * k);
    }

    // ── skyline ──
    const su = this.skyline.material.uniforms, wgt = s.envW || [1, 0, 0, 0];
    su.uA.value = Math.min(1, wgt[1] + 0.55 * wgt[3]) * (s.skyline ?? 1); su.uT.value = T;
    this.skyline.visible = su.uA.value > 0.003;
    su.cFill.value.set(...P.mountFill).multiplyScalar(1.4); su.cFog.value.set(...P.fog); su.cA.value.set(...P.post); su.cB.value.set(...P.post2);

    if (G && G.on) {
      const cz = s.car.z;
      // ── traffic ──
      for (const v of G.veh) {
        const x = v.x, z = cz - v.dz, f = v.fade;
        if (v.type === T_TRUCK) {
          this.box(x, 1.75, z, 2.4, 2.5, 9.0, edge, 0, f, 1, 1);
          this.box(x, 0.95, z + 4.52, 2.0, 0.15, 0.06, RED, 1, f);
          this.box(x - 1.0, 2.88, z + 4.52, 0.2, 0.1, 0.05, AMBER, 1, f); this.box(x + 1.0, 2.88, z + 4.52, 0.2, 0.1, 0.05, AMBER, 1, f);
          this.box(x - 1.12, 0.5, z, 0.08, 0.06, 8.6, edge, 1, f, 2.2); this.box(x + 1.12, 0.5, z, 0.08, 0.06, 8.6, edge, 1, f, 2.2);
          this.glow(x, 0.04, z, 1.9, 0, 0, 0, 0, 5.4, edge, 2, 0.55 * f);
          this.sprite(x, 0.95, z + 4.6, 1.5 + v.dz * 0.012, RED, 0.5 * f);
        } else if (v.type === T_TAXI) {
          this.box(x, 0.62, z, 1.9, 0.6, 4.3, YELLOW, 2, f); this.box(x, 1.13, z + 0.2, 1.5, 0.45, 2.1, YELLOW, 2, f);
          this.box(x, 1.5, z + 0.2, 0.7, 0.2, 0.26, YELLOW, 1, f, 3.0);
          this.box(x - 0.7, 0.72, z + 2.17, 0.4, 0.1, 0.05, RED, 1, f); this.box(x + 0.7, 0.72, z + 2.17, 0.4, 0.1, 0.05, RED, 1, f);
          this.glow(x, 0.04, z, 1.5, 0, 0, 0, 0, 2.8, YELLOW, 2, 0.4 * f);
          if (v.sig) {
            const on = Math.floor(T * 5) % 2 === 0;
            if (on) { this.box(x + v.sig * 0.92, 0.74, z + 2.18, 0.22, 0.18, 0.06, AMBER, 1, f, 1.6); this.sprite(x + v.sig * 0.92, 0.74, z + 2.3, 0.9 + v.dz * 0.01, AMBER, 1.2 * f); }
            this.glow(x + v.sig * 2.2, 2.3, z, v.sig * 1.5, 0, 0, 0, 0.55, 0, AMBER, 7, 1.3 * f);
          }
        } else if (v.type === T_ONC) {
          const c = [1.0, 0.3, 0.22];
          this.box(x, 0.62, z, 1.9, 0.6, 4.3, c, 0, f); this.box(x, 1.12, z - 0.2, 1.5, 0.45, 2.0, c, 0, f);
          for (const sx of [-0.66, 0.66]) { this.box(x + sx, 0.68, z + 2.17, 0.36, 0.15, 0.05, WHITE, 1, f); this.sprite(x + sx, 0.68, z + 2.3, 0.9 + v.dz * 0.022, [1, 0.96, 0.85], 2.2 * f); }
          this.glow(x, 0.04, z + 9, 1.3, 0, 0, 0, 0, 7, [1, 0.95, 0.85], 2, 0.32 * f);
          this.glow(x, 3.0 + v.dz * 0.012, z, 0.9 + v.dz * 0.012, 0, 0, 0, 0.9 + v.dz * 0.012, 0, [1.0, 0.16, 0.12], 5, (Math.floor(T * 6) % 2 ? 2.4 : 1.2) * f);
        } else if (v.type === T_WALL) {
          const ph = Math.floor(T * 4 + v.x) % 2 === 0, c = ph ? [1.0, 0.12, 0.2] : [0.2, 0.4, 1.0];
          this.glow(x, 1.55, z, 2.0, 0, 0, 0, 1.5, 0, c, 1, 1.7 * f, v.id * 0.31);
          for (const sx of [-1.95, 1.95]) { this.box(x + sx, 1.6, z, 0.26, 3.2, 0.26, c, 0, f); this.box(x + sx, 3.3, z, 0.34, 0.16, 0.34, c, 1, f, 3.2); }
          this.box(x, 0.07, z, 4.0, 0.05, 0.14, c, 1, f, 2.4);
          this.glow(x, 0.04, z, 2.0, 0, 0, 0, 0, 2.6, c, 2, 0.6 * f);
        }
      }
      // ── energy cells ──
      const bob = Math.sin(T * 5.0) * 0.08;
      for (const c of G.cells) this.glow(c.x, 0.95 + bob, cz - c.dz, 0.36, 0, 0, 0, 0.5, 0, CELL, 4, 1.9 * c.fade);
      // ── oncoming-traffic warning above the lane ──
      for (let l = -1; l <= 1; l++) {
        const w = G.warn[l + 1]; if (w <= 0) continue;
        this.glow(l * L, 3.1, cz - 20, 1.0, 0, 0, 0, 1.0, 0, [1.0, 0.16, 0.12], 5, (Math.floor(T * 7) % 2 ? 2.6 : 1.0) * Math.min(1, w * 2));
      }
      // ── police drone: searchlight locks a lane, then strikes ──
      if (G.drone) {
        const d = G.drone, x = d.lane * L, c = d.strike ? [1.0, 0.1, 0.12] : [1.0, 0.72, 0.15], k = d.strike ? 1.5 : 0.55 + 0.25 * Math.sin(T * 14);
        this.glow(x, 0.05, cz - 7, 1.9, 0, 0, 0, 0, 9, c, 6, k);
        this.glow(x, 4.3, cz - 9, 1.2, 0, 0, 0, 4.3, 0, c, 8, 0.4 * k);
        this.box(x, 8.8, cz - 9, 1.3, 0.28, 1.3, c, 0); this.box(x, 8.62, cz - 9, 0.5, 0.1, 0.5, c, 1, 1, 3);
        this.sprite(x - 0.7, 8.9, cz - 9, 0.6, [1, 0.1, 0.15], Math.floor(T * 6) % 2 ? 2 : 0.2); this.sprite(x + 0.7, 8.9, cz - 9, 0.6, [0.15, 0.3, 1], Math.floor(T * 6) % 2 ? 0.2 : 2);
      }
      // ── debris: smashed vehicles and the wrecked car shatter into shards of light ──
      for (const b of G.bursts) {
        const n = b.car ? 26 : 16, life = b.car ? 1.1 : 0.7, a = b.age;
        if (a >= life) continue;
        const cA = b.car ? P.neon : b.type === T_TAXI ? YELLOW : b.type === T_WALL ? [1, 0.15, 0.2] : edge, cB = b.car ? P.gridAlt : edge2;
        for (let k = 0; k < n; k++) {
          const h1 = hash1(b.seed + k * 13.1), h2 = hash1(b.seed + k * 7.7 + 3), h3 = hash1(b.seed + k * 3.3 + 9);
          const ang = h1 * Math.PI * 2, sp = 5 + 13 * h2;
          const x = b.x + Math.cos(ang) * sp * a * 0.7, y = 0.8 + (2 + 7 * h3) * a - 9 * a * a, z = cz - b.dz + Math.sin(ang) * sp * a * 0.5;
          if (y < 0.05) continue;
          const sz = (0.22 + 0.4 * h3) * (1 - a / life);
          this.box(x, y, z, sz, sz, sz * (1 + 2 * h2), k % 2 ? cA : cB, 1, 1 - a / life, 2.4);
        }
        this.sprite(b.x, 1.0, cz - b.dz, 3 + 10 * a, b.car ? P.neon : cA, Math.max(0, 1.8 - a * 5));
      }
    }

    const sm = this.solids.material.uniforms;
    sm.uT.value = T; sm.uFog.value.set(...P.fog); sm.uGround.value.set(...P.ground); sm.uSky.value.set(...P.skyMid);
    this.glows.material.uniforms.uT.value = T;
    for (const [m, n] of [[this.solids, this.nb], [this.glows, this.ng]]) {
      m.userData.g.instanceCount = n; m.visible = n > 0;
      for (const k in m.userData.A) m.userData.A[k].needsUpdate = true;
    }
  }
}
