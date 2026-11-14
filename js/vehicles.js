// Vehicle bodies for traffic and the police, modelled on the Midnight Cruise vehicle studies (the player's car is its own
// model, js/car.js): 02 MONOLITH saloon, 04 NOMAD estate, 05 FIREFLY taxi, 06 WARDEN police, 07 RELAY van, 08 MULE pickup,
// 09 LEVIATHAN truck, 10 ORBIT coach.
// Each is modelled the way the sheets are drawn: hulls lofted through many-cornered sections with the wheel arches cut out of
// the sill line, chamfered blocks, arch flares, tube frames, lathe-turned wheels that spin, lamps set in bezels, panel seams.
// Everything is merged into one geometry per vehicle with a material on every face, and drawn instanced.
// Materials: clear-coated metallic paint, dark glass that mirrors the sky (some with a lit cabin behind it), satin trim,
// bright metal, rubber, lamps, and painted lettering.
// Per instance: position, heading, lean and dive of the body on its springs, scale, body colour, fade, and its lights.
import * as THREE from '../vendor/three.module.min.js';
import { ROAD_U, ROAD_GLSL } from './road.js';

const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const within = (s, a, b) => s > a && s < b;
// piecewise-linear lookup, and a smooth curve through the same kind of keys
const pl = (K, x) => { if (x <= K[0][0]) return K[0][1]; for (let i = 1; i < K.length; i++) if (x <= K[i][0]) { const [a, va] = K[i - 1], [b, vb] = K[i]; return b - a < 1e-6 ? vb : va + (vb - va) * (x - a) / (b - a); } return K[K.length - 1][1]; };
const spl = (K) => (x) => {
  const n = K.length; if (x <= K[0][0]) return K[0][1]; if (x >= K[n - 1][0]) return K[n - 1][1];
  let i = 0; while (K[i + 1][0] < x) i++;
  const [x0, y0] = K[i], [x1, y1] = K[i + 1], h = x1 - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
  const m = (j) => { const a = K[Math.max(0, j - 1)], b = K[Math.min(n - 1, j + 1)]; return (b[1] - a[1]) / (b[0] - a[0]) * h; };
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m(i) + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m(i + 1);
};
const uniq = (a) => { a.sort((p, q) => p - q); return a.filter((v, i) => !i || v - a[i - 1] > 2e-4); };
const ks = (...lists) => lists.flat().map((k) => (typeof k === 'number' ? k : k[0]));          // the stations a set of keyed lines needs
const steps = (a, b, d) => { const n = Math.max(1, Math.round((b - a) / d)), r = []; for (let i = 0; i <= n; i++) r.push(a + (b - a) * i / n); return r; };
// wheel arches as part of the sill line: [s, y] keys. Cut with flat faces, or round
const hexArch = (c, a, base, top) => [[c - a, base], [c - a + 0.05, lerp(base, top, 0.55)], [c - a * 0.56, top], [c + a * 0.56, top], [c + a - 0.05, lerp(base, top, 0.55)], [c + a, base]];
const roundArch = (c, r, base, cy, n = 10) => { const p = [[c - r - 0.015, base]]; for (let i = 0; i <= n; i++) { const f = Math.PI * i / n; p.push([c - r * Math.cos(f), cy + r * Math.sin(f)]); } p.push([c + r + 0.015, base]); return p; };

// materials: [part, colour, shade (1 = in the open, less in recesses), picture co-ordinates]. Parts:
// 0 paint · 1 glass (colour = the light of the cabin behind it) · 2 tail lamp · 3 satin trim · 4, 5 roof lights left / right · 6 head lamp ·
// 7 bright metal · 8 marker light · 9 body paint (the instance's colour × this one) · 10 rubber · 11 paint with black lettering ·
// 12 lit sign with black lettering · 13 trim with white lettering · 14 hazard stripes
const M = {
  body: [9, [1, 1, 1]], body2: [9, [0.66, 0.66, 0.66]],
  glass: [1, [0, 0, 0]], glassCab: [1, [0.42, 0.27, 0.14], 1, [1.22, 0]], glassCoach: [1, [1.0, 0.55, 0.15], 1, [2.02, 2.62]],
  clad: [3, [0.06, 0.065, 0.088]], trim: [3, [0.02, 0.022, 0.03]], seam: [3, [0.006, 0.006, 0.01], 0.5], under: [3, [0.01, 0.01, 0.016], 0.4],
  tyre: [10, [0.02, 0.02, 0.028]], tread: [10, [0.034, 0.034, 0.044]],
  rim: [7, [0.2, 0.21, 0.26]], rimDark: [7, [0.045, 0.047, 0.065], 0.7], rimLip: [7, [0.5, 0.52, 0.6]], cover: [7, [0.24, 0.25, 0.31]], chrome: [7, [0.6, 0.62, 0.7]],
  tail: [2, [1, 0, 0]], head: [6, [1, 1, 1]],
  white: [0, [0.82, 0.84, 0.9]], navy: [0, [0.04, 0.045, 0.078]], yellow: [0, [0.98, 0.69, 0.05]], beige: [0, [0.72, 0.68, 0.6]], beige2: [0, [0.58, 0.55, 0.49]],
  dark: [0, [0.11, 0.116, 0.15]], grey: [0, [0.15, 0.16, 0.2]], grey2: [0, [0.22, 0.23, 0.285]], steel: [0, [0.3, 0.31, 0.37]], frame: [0, [0.86, 0.36, 0.07]],
  cyan: [8, [0.25, 0.95, 1.0]], amber: [8, [1.0, 0.42, 0.03]], violet: [8, [0.6, 0.35, 1.0]], ice: [8, [0.8, 0.92, 1.0]],
  red: [4, [1.0, 0.08, 0.14]], blue: [5, [0.04, 0.18, 1.0]], signLamp: [4, [1.0, 0.66, 0.08]],
  inkOnWhite: [11, [0.82, 0.84, 0.9]], signInk: [12, [1.0, 0.66, 0.08]], inkOnTrim: [13, [0.02, 0.022, 0.03]], hazard: [14, [0.95, 0.7, 0.05]],
};
const POLICE = [0.04, 0.53, 0.96, 0.97], TAXI = [0.2, 0.03, 0.8, 0.47], ZERO = [0, 0], SEAM = 0.008;

// A vehicle under construction. Lengths run along s, from the rear bumper (0) to the nose (L); x is across, y up.
function builder(L) {
  const pos = [], nor = [], part = [], col = [], hubs = [], shade = [], uv = [], area = [];
  const zOf = (s) => L / 2 - s;
  const V = (x, y, z) => new THREE.Vector3(x, y, z), e1 = V(0, 0, 0), e2 = V(0, 0, 0), n = V(0, 0, 0), fN = V(0, 0, 0), cen = V(0, 0, 0);
  let hub = null;                                                             // set while a wheel is being built: [its radius, the z of its axle]
  const tri = (a, b, c, m, uvs) => {
    const mm = M[m]; if (!mm) throw new Error('no material ' + m);
    n.copy(e1.subVectors(b, a).cross(e2.subVectors(c, a))); const ar = n.length(); if (ar < 1e-9) return; n.multiplyScalar(1 / ar);
    [a, b, c].forEach((v, i) => {
      pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); part.push(mm[0]); col.push(mm[1][0], mm[1][1], mm[1][2]); shade.push(mm[2] ?? 1); area.push(ar);
      hubs.push(hub ? hub[0] : 0, hub ? hub[1] : 0); const q = uvs ? uvs[i] : mm[3] || ZERO; uv.push(q[0], q[1]);
    });
  };
  // a flat polygon, turned to face the way `hint` points (or away from the point `ref`)
  const poly = (P, m, flip, uvs) => { for (let i = 1; i < P.length - 1; i++) flip ? tri(P[0], P[i + 1], P[i], m, uvs && [uvs[0], uvs[i + 1], uvs[i]]) : tri(P[0], P[i], P[i + 1], m, uvs && [uvs[0], uvs[i], uvs[i + 1]]); };
  const newell = (P) => { fN.set(0, 0, 0); for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; fN.x += (a.y - b.y) * (a.z + b.z); fN.y += (a.z - b.z) * (a.x + b.x); fN.z += (a.x - b.x) * (a.y + b.y); } return fN; };
  const faceTo = (P, m, hint, uvs) => poly(P, m, newell(P).dot(hint) < 0, uvs);
  const face = (P, m, ref, uvs) => { cen.set(0, 0, 0); for (const p of P) cen.add(p); cen.multiplyScalar(1 / P.length).sub(ref); poly(P, m, newell(P).dot(cen) < 0, uvs); };
  // round off the shading where neighbouring faces meet at less than `deg`; sharper edges stay crisp
  const soften = (from, deg) => {
    const cosT = Math.cos(deg * Math.PI / 180), groups = new Map(), nV = pos.length / 3, fn = nor.slice(from * 3);
    for (let v = from; v < nV; v++) { const k = Math.round(pos[v * 3] * 2000) + ',' + Math.round(pos[v * 3 + 1] * 2000) + ',' + Math.round(pos[v * 3 + 2] * 2000); let g = groups.get(k); if (!g) groups.set(k, g = []); g.push(v); }
    for (const g of groups.values()) for (const v of g) {
      const o = (v - from) * 3, ax = fn[o], ay = fn[o + 1], az = fn[o + 2]; let x = 0, y = 0, z = 0;
      for (const u of g) { const p = (u - from) * 3; if (ax * fn[p] + ay * fn[p + 1] + az * fn[p + 2] >= cosT) { x += fn[p] * area[u]; y += fn[p + 1] * area[u]; z += fn[p + 2] * area[u]; } }
      const l = Math.hypot(x, y, z) || 1; nor[v * 3] = x / l; nor[v * 3 + 1] = y / l; nor[v * 3 + 2] = z / l;
    }
  };
  // A hull lofted along s. ring(s) gives the right-hand half of the section from the sill up to the centre line (its last
  // point has x = 0); it is mirrored. mat(s, j, side) names the material of strip j (0 = lowest; the floor is 'under').
  // seams: [s, j0, j1] — a dark shut line across strips j0..j1 at s. rear / front: materials of the end faces.
  const loft = ({ at, ring, mat, seams = [], rear, front, smooth = 0, open = false }) => {
    const S = uniq([...at, ...seams.flatMap(([s]) => [s - SEAM, s + SEAM])]), from = pos.length / 3;
    const R = S.map((s) => { const h = ring(s), z = zOf(s), r = h.map(([x, y]) => V(x, y, z)); for (let j = h.length - 2; j >= 0; j--) r.push(V(-h[j][0], h[j][1], z)); return r; });
    const nr = R[0].length, nh = (nr + 1) / 2;
    for (let i = 0; i < S.length - 1; i++) {
      const sm = (S[i] + S[i + 1]) / 2, seam = seams.find(([s]) => Math.abs(s - sm) < SEAM);
      for (let k = 0; k < nr; k++) {
        if (k === nr - 1 && open) continue;
        const k1 = (k + 1) % nr, j = k === nr - 1 ? -1 : k < nh - 1 ? k : nr - 2 - k, a = R[i][k], b = R[i][k1], c = R[i + 1][k], d = R[i + 1][k1];
        const m = j < 0 ? 'under' : seam && j >= seam[1] && j <= (seam[2] ?? seam[1]) ? 'seam' : mat(sm, j, k < nh - 1 ? 1 : -1);
        tri(a, c, b, m); tri(b, c, d, m);
      }
    }
    const cap = (r, m, flip) => { const c = V(0, 0, r[0].z); for (const p of r) c.y += p.y / r.length; for (let j = 0; j < r.length; j++) { const a = r[j], b = r[(j + 1) % r.length]; if (flip) tri(c, b, a, m); else tri(c, a, b, m); } };
    if (rear) cap(R[0], rear, false);
    if (front) cap(R[R.length - 1], front, true);
    if (smooth) soften(from, smooth);
  };
  // a block centred at (x, y, s), sizes across, up, along, its edges chamfered by bev; rz / rx / ry turn it about its long, cross and upright axes
  const mtx = new THREE.Matrix4(), eul = new THREE.Euler();
  const cbox = (x, y, s, sx, sy, ss, m, bev = 0.02, rz = 0, rx = 0, ry = 0) => {
    const hx = sx / 2, hy = sy / 2, hz = ss / 2, bv = Math.min(bev, hx * 0.49, hy * 0.49, hz * 0.49), c = V(x, y, zOf(s));
    mtx.makeRotationFromEuler(eul.set(rx, ry, rz, 'XYZ'));
    const P = (px, py, pz) => V(px, py, pz).applyMatrix4(mtx).add(c);
    const X = (i, j, k) => P(i * hx, j * (hy - bv), k * (hz - bv)), Y = (i, j, k) => P(i * (hx - bv), j * hy, k * (hz - bv)), Z = (i, j, k) => P(i * (hx - bv), j * (hy - bv), k * hz);
    for (const i of [-1, 1]) {
      face([X(i, -1, -1), X(i, 1, -1), X(i, 1, 1), X(i, -1, 1)], m, c); face([Y(-1, i, -1), Y(1, i, -1), Y(1, i, 1), Y(-1, i, 1)], m, c); face([Z(-1, -1, i), Z(1, -1, i), Z(1, 1, i), Z(-1, 1, i)], m, c);
      if (bv > 0) for (const j of [-1, 1]) {
        face([X(i, j, -1), X(i, j, 1), Y(i, j, 1), Y(i, j, -1)], m, c); face([X(i, -1, j), X(i, 1, j), Z(i, 1, j), Z(i, -1, j)], m, c); face([Y(-1, i, j), Y(1, i, j), Z(1, i, j), Z(-1, i, j)], m, c);
        for (const k of [-1, 1]) face([X(i, j, k), Y(i, j, k), Z(i, j, k)], m, c);
      }
    }
  };
  const box = (x, y, s, sx, sy, ss, m, rz = 0, rx = 0, ry = 0) => cbox(x, y, s, sx, sy, ss, m, 0, rz, rx, ry);
  // a convex outline pushed through from A to B
  const slab = (A, B, m, me = m) => { const c = V(0, 0, 0); for (const p of A) c.add(p); for (const p of B) c.add(p); c.multiplyScalar(0.5 / A.length); face(A, m, c); face(B, m, c); for (let i = 0; i < A.length; i++) { const j = (i + 1) % A.length; face([A[i], A[j], B[j], B[i]], me, c); } };
  const slabX = (P, x0, x1, m, me) => slab(P.map(([s, y]) => V(x0, y, zOf(s))), P.map(([s, y]) => V(x1, y, zOf(s))), m, me);   // outline in the side view, pushed across
  const slabS = (P, s0, s1, m, me) => slab(P.map(([x, y]) => V(x, y, zOf(s0))), P.map(([x, y]) => V(x, y, zOf(s1))), m, me);   // outline in the end view, pushed along
  const both = (fn) => { fn(-1); fn(1); };
  // a flare standing proud of the flank round a wheel arch: the arch line [s, y], widened away from the point o
  const flare = (sx, x, pts, o, wide, thick, m) => {
    const q = pts.map(([s, y]) => { const d = Math.hypot(s - o[0], y - o[1]) || 1; return [s + (s - o[0]) / d * wide, y + (y - o[1]) / d * wide]; });
    const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)], at = (p, x) => V(sx * x, p[1], zOf(p[0]));
    for (let i = 0; i < pts.length - 1; i++) {
      const A = [pts[i], pts[i + 1], q[i + 1], q[i]], B = [mix(pts[i], q[i], 0.14), mix(pts[i + 1], q[i + 1], 0.14), mix(q[i + 1], pts[i + 1], 0.2), mix(q[i], pts[i], 0.2)];
      slab(A.map((p) => at(p, x - 0.03)), B.map((p) => at(p, x + thick)), m);
    }
  };
  const merge = (g, m) => {
    const mm = M[m], g2 = g.index ? g.toNonIndexed() : g, a = g2.getAttribute('position').array, nn = g2.getAttribute('normal').array;
    for (let i = 0; i < a.length; i += 3) { pos.push(a[i], a[i + 1], a[i + 2]); nor.push(nn[i], nn[i + 1], nn[i + 2]); part.push(mm[0]); col.push(...mm[1]); shade.push(mm[2] ?? 1); area.push(1); hubs.push(hub ? hub[0] : 0, hub ? hub[1] : 0); uv.push(0, 0); }
  };
  // a round tube through the points [x, y, s]
  const UP = V(0, 1, 0), qt = new THREE.Quaternion();
  const tube = (P, r, m, seg = 8) => {
    const W = P.map(([x, y, s]) => V(x, y, zOf(s)));
    for (let i = 0; i < W.length; i++) {
      const j = new THREE.SphereGeometry(r, seg, 5); j.translate(W[i].x, W[i].y, W[i].z); merge(j, m);
      if (i === W.length - 1) break;
      const d = e1.subVectors(W[i + 1], W[i]), len = d.length(), g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
      g.applyQuaternion(qt.setFromUnitVectors(UP, d.clone().normalize())); g.translate((W[i].x + W[i + 1].x) / 2, (W[i].y + W[i + 1].y) / 2, (W[i].z + W[i + 1].z) / 2); merge(g, m);
    }
  };
  const ring = (x, y, s, r, t, m) => { const q = new THREE.TorusGeometry(r, t, 6, 24); q.translate(x, y, zOf(s)); merge(q, m); };
  // a shape turned about an axle across the car: prof = [radius, how far out along the axle], listed from the inside face round to the hub
  const lathe = (xc, sx, cy, cz, prof, mats, seg = 22) => {
    const from = pos.length / 3, hint = V(0, 0, 0), P = (r, a, f) => V(xc + sx * a, cy + r * Math.cos(f), cz + r * Math.sin(f));
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, a0] = prof[i], [r1, a1] = prof[i + 1];
      for (let k = 0; k < seg; k++) {
        const f0 = k / seg * Math.PI * 2, f1 = (k + 1) / seg * Math.PI * 2, fm = (f0 + f1) / 2;
        hint.set(sx * -(r1 - r0), (a1 - a0) * Math.cos(fm), (a1 - a0) * Math.sin(fm));
        faceTo([P(r0, a0, f0), P(r1, a1, f0), P(r1, a1, f1), P(r0, a0, f1)], mats[i], hint);
      }
    }
    soften(from, 38);
  };
  // a wheel on each side at s. kind: 'disc' a flat cover · 'block' six heavy spokes and a lugged tyre · 'truck' a deep dish round a hub
  const wheel = (s, x, r, w, kind) => both((sx) => {
    const cz = zOf(s), xc = sx * x, o = w / 2, rr = r * (kind === 'disc' ? 0.74 : kind === 'truck' ? 0.56 : 0.6), ch = kind === 'disc' ? 0.04 : 0.075;
    const spot = (rho, f, a) => [xc + sx * a, r + rho * Math.cos(f), L / 2 - (cz + rho * Math.sin(f))];
    hub = [r, cz];
    lathe(xc, sx, r, cz, [[rr * 0.7, -o], [r - ch, -o], [r, -o + ch], [r, -0.03], [r - 0.015, 0], [r, 0.03], [r, o - ch], [r - ch, o], [rr + 0.02, o - 0.012], [rr, o - 0.03]], ['tyre', 'tyre', 'tread', 'tread', 'tread', 'tread', 'tyre', 'tyre', 'tyre']);
    if (kind === 'disc') {
      lathe(xc, sx, r, cz, [[rr, o - 0.03], [rr - 0.025, o], [rr - 0.06, o + 0.004], [rr * 0.42, o + 0.02], [rr * 0.3, o + 0.012], [0, o + 0.016]], ['rimLip', 'rimLip', 'cover', 'rimDark', 'cover']);
      for (let k = 0; k < 5; k++) { const f = k / 5 * Math.PI * 2; cbox(...spot(rr * 0.66, f, o + 0.012), 0.02, rr * 0.28, 0.035, 'rimDark', 0.006, 0, f); }
    } else {
      const deep = kind === 'truck' ? 0.13 : 0.1, out = kind === 'truck' ? 0.05 : 0;
      lathe(xc, sx, r, cz, [[rr, o - 0.03], [rr - 0.03, o - 0.015], [rr - 0.05, o - deep], [rr * 0.44, o - deep], [rr * 0.36, o - 0.02 + out], [0, o - 0.01 + out]], ['rimLip', 'rimDark', 'rimDark', 'rim', 'rim']);
      if (kind === 'block') {
        for (let k = 0; k < 6; k++) { const f = k / 6 * Math.PI * 2; cbox(...spot(rr * 0.64, f, o - 0.055), 0.07, rr * 0.62, 0.085, 'rim', 0.018, 0, f); }
        for (let k = 0; k < 14; k++) { const f = (k + 0.5) / 14 * Math.PI * 2; box(...spot(r - 0.012, f, o - 0.05), 0.11, 0.06, 0.1, 'tyre', 0, f); }
      } else for (let k = 0; k < 8; k++) { const f = k / 8 * Math.PI * 2; box(...spot(rr * 0.62, f, o - deep + 0.012), 0.03, 0.03, 0.03, 'rimLip', 0, f); }
    }
    hub = null;
  });
  // flat signs with a picture on them: facing the rear (dir 1) or the nose (−1) at s, or on a flank at x. pic = [u0, v0, u1, v1]
  const plateS = (x0, x1, y0, y1, s, dir, m, [u0, v0, u1, v1]) => { const z = zOf(s), a = dir > 0 ? u0 : u1, b = dir > 0 ? u1 : u0; faceTo([V(x0, y0, z), V(x1, y0, z), V(x1, y1, z), V(x0, y1, z)], m, V(0, 0, dir), [[a, v0], [b, v0], [b, v1], [a, v1]]); };
  const plateX = (s0, s1, y0, y1, x, m, [u0, v0, u1, v1]) => { const a = x > 0 ? u0 : u1, b = x > 0 ? u1 : u0; faceTo([V(x, y0, zOf(s0)), V(x, y0, zOf(s1)), V(x, y1, zOf(s1)), V(x, y1, zOf(s0))], m, V(x, 0, 0), [[a, v0], [b, v0], [b, v1], [a, v1]]); };
  const done = () => {
    const g = new THREE.BufferGeometry(), F = (a, k) => new THREE.Float32BufferAttribute(a, k);
    g.setAttribute('position', F(pos, 3)); g.setAttribute('normal', F(nor, 3)); g.setAttribute('aPart', F(part, 1)); g.setAttribute('aCol', F(col, 3));
    g.setAttribute('aHub', F(hubs, 2)); g.setAttribute('aShade', F(shade, 1)); g.setAttribute('aUv', F(uv, 2));
    return g;
  };
  return { loft, cbox, box, slabX, slabS, both, flare, tube, ring, wheel, plateS, plateX, done, L };
}

// the section of a slab-sided body: sill, dark cladding up to cl, a crease at the waist wa, a chamfered shoulder at ys
const slabRing = (yb, ys, wm, cl, wa, ch = 0.04, crown = 0.012) => {
  const ym = Math.min(Math.max(wa, yb + 0.13), ys - ch - 0.012), yc = Math.min(Math.max(cl, yb + 0.1), ym - 0.012);
  return [[wm - 0.11, yb], [wm - 0.015, yb + 0.045], [wm, yc], [wm + 0.012, ym], [wm - 0.008, ys - ch], [wm - 0.008 - ch, ys], [0, ys + crown]];
};
// a wheel arch cut out of a section: everything below y moves to where the cut crosses the outline, so the panels above keep their planes
const cutRing = (h, y) => {
  let k = 0; while (k < h.length - 1 && h[k][1] < y - 1e-6) k++;
  if (!k) return h;
  const a = h[k - 1], b = h[k], t = clamp((y - a[1]) / Math.max(b[1] - a[1], 1e-6), 0, 1), c = [lerp(a[0], b[0], t), y];
  return h.map((q, i) => (i < k ? c : q));
};
// the section of a glasshouse standing on the deck: h = 0 where it meets the deck, 1 at full height
const cabRing = (base, h, roof, rail, wB, wG, wr) => [[wB, base], [lerp(wB, wG, h), lerp(base, roof - rail, h)], [lerp(wB - 0.03, wG - wr, h), lerp(base, roof, h)], [0, lerp(base, roof + 0.015, h)]];

const STYLES = {
  // 02 MONOLITH — saloon: a long slab of a car, flat faces and cut corners, a bar of red light the full width of its tail,
  // bracket lamps at the front corners, two upright slits of light behind the front wheel, flat wheel covers
  monolith() {
    const L = 5.0, b = builder(L), { loft, cbox, box, both, wheel, flare } = b, WH = [0.98, 4.02], r = 0.36;
    const A = WH.map((c) => roundArch(c, 0.44, 0.27, r + 0.02)), SL = [[0, 0.37], [0.14, 0.27], [L - 0.14, 0.27], [L, 0.37]], YB = [[0, 0], ...A[0], ...A[1], [L, 0]];
    const YS = [[0, 0.95], [0.1, 1.0], [1.0, 1.01], [3.6, 0.99], [4.86, 0.93], [L, 0.86]], WM = [[0, 0.93], [0.16, 1.0], [L - 0.16, 1.0], [L, 0.93]];
    loft({ at: ks(YB, SL, YS, WM), mat: (s, j) => (j < 2 ? 'clad' : 'body'), rear: 'body', front: 'body',
      seams: [[1.72, 2, 3], [2.5, 2, 3], [3.34, 2, 3], [0.94, 5], [3.58, 5], [0.3, 2, 4], [4.68, 2, 4]],
      ring: (s) => cutRing(slabRing(pl(SL, s), pl(YS, s), pl(WM, s), 0.5, 0.74), pl(YB, s)) });
    both((sx) => A.forEach((a, i) => flare(sx, 1.004, a.slice(1, -1), [WH[i], 0.3], 0.05, 0.014, 'clad')));
    const RF = [[1.04, 0], [1.5, 1], [2.95, 1], [3.78, 0]];
    loft({ at: [...ks(RF), 1.66, 2.27, 2.35], open: true,
      mat: (s, j) => (j === 1 ? 'body' : j === 0 ? (s < 1.66 ? 'body' : within(s, 2.27, 2.35) ? 'trim' : 'glass') : within(s, 1.5, 2.95) ? 'body' : 'glass'),
      ring: (s) => cabRing(pl(YS, s) - 0.004, pl(RF, s), 1.46, 0.07, 0.94, 0.81, 0.07) });
    for (const c of WH) box(0, 0.5, c, 1.36, 0.62, 0.9, 'under');
    // tail: the light bar in its slot, the dark lower panel
    cbox(0, 0.8, -0.004, 1.84, 0.085, 0.03, 'trim', 0.01); box(0, 0.8, -0.022, 1.78, 0.036, 0.012, 'tail');
    cbox(0, 0.5, -0.006, 1.8, 0.26, 0.04, 'clad', 0.02); cbox(0, 0.52, -0.03, 0.52, 0.13, 0.012, 'trim', 0.004);
    both((sx) => box(sx * 0.62, 0.9, -0.002, 0.012, 0.11, 0.01, 'seam'));
    // nose: the grille in its frame, bracket lamps, the lower lip
    cbox(0, 0.64, L + 0.004, 1.5, 0.42, 0.03, 'trim', 0.012); for (const y of [0.52, 0.62, 0.72]) box(0, y, L + 0.02, 1.36, 0.03, 0.012, 'clad');
    both((sx) => { box(sx * 0.77, 0.86, L + 0.02, 0.3, 0.032, 0.02, 'head'); box(sx * 0.905, 0.72, L + 0.02, 0.032, 0.31, 0.02, 'head'); });
    cbox(0, 0.36, L - 0.03, 1.8, 0.1, 0.12, 'clad', 0.03);
    both((sx) => {
      for (const s of [3.4, 3.49]) box(sx * 1.015, 0.72, s, 0.012, 0.22, 0.03, 'ice');                 // the slits behind the front wheel
      cbox(sx * 1.0, 1.07, 3.46, 0.17, 0.07, 0.11, 'body', 0.02); for (const s of [1.98, 2.78]) box(sx * 1.014, 0.86, s, 0.012, 0.022, 0.15, 'trim');
    });
    wheel(WH[0], 0.84, r, 0.3, 'disc'); wheel(WH[1], 0.84, r, 0.3, 'disc');
    return b.done();
  },
  // 04 NOMAD — estate: a square-cut off-roader on tall lugged tyres, flared arches, slatted rear quarter windows, cargo cases
  // on a roof rack, tail lamps like a pair of corner brackets
  nomad() {
    const L = 4.9, b = builder(L), { loft, cbox, box, both, wheel, flare } = b, WH = [0.95, 3.85], r = 0.46;
    const A = WH.map((c) => hexArch(c, 0.64, 0.42, 1.0));
    const SL = [[0, 0.52], [0.16, 0.42], [L - 0.18, 0.42], [L, 0.54]], YB = [[0, 0], ...A[0], ...A[1], [L, 0]];
    const YS = [[0, 1.1], [0.08, 1.14], [3.46, 1.14], [3.56, 1.12], [4.78, 1.07], [L, 0.98]], WM = [[0, 0.97], [0.14, 1.03], [L - 0.16, 1.03], [L, 0.95]];
    loft({ at: ks(YB, SL, YS, WM), mat: (s, j) => (j < 2 ? 'clad' : 'body'), rear: 'body', front: 'clad', seams: [[1.4, 2, 3], [2.32, 2, 3], [3.3, 2, 3], [3.5, 5], [4.6, 2, 5]],
      ring: (s) => cutRing(slabRing(pl(SL, s), pl(YS, s), pl(WM, s), 0.66, 0.9, 0.05), pl(YB, s)) });
    both((sx) => A.forEach((a, i) => flare(sx, 1.03, a, [WH[i], 0.42], 0.14, 0.075, 'clad')));
    const RF = [[0.05, 0], [0.3, 1], [2.75, 1], [3.52, 0]];
    loft({ at: [...ks(RF), 0.36, 1.3, 1.42, 2.27, 2.37], open: true,
      mat: (s, j) => (j === 1 ? 'body' : j === 0 ? (s < 0.36 || within(s, 1.3, 1.42) ? 'body' : within(s, 2.27, 2.37) ? 'trim' : 'glass') : within(s, 0.3, 2.75) ? 'body' : 'glass'),
      ring: (s) => cabRing(pl(YS, s) - 0.004, pl(RF, s), 1.78, 0.07, 1.0, 0.9, 0.06) });
    for (const c of WH) box(0, 0.62, c, 1.3, 0.7, 1.2, 'under');
    both((sx) => {
      for (let k = 0; k < 5; k++) cbox(sx * 0.955, 1.43, 0.47 + k * 0.18, 0.035, 0.5, 0.08, 'body', 0.01, sx * 0.177);      // slats over the quarter glass
      cbox(sx * 0.8, 1.855, 1.5, 0.05, 0.045, 2.5, 'trim', 0.012); for (const s of [0.4, 1.5, 2.6]) cbox(sx * 0.8, 1.82, s, 0.07, 0.06, 0.1, 'trim', 0.012);   // roof rails
      cbox(sx * 1.02, 0.44, 2.4, 0.2, 0.06, 1.5, 'clad', 0.02);                                                             // running board
      cbox(sx * 1.09, 1.25, 3.3, 0.15, 0.17, 0.09, 'clad', 0.025); for (const s of [1.75, 2.75]) box(sx * 1.046, 0.98, s, 0.012, 0.024, 0.16, 'trim');
      box(sx * 0.62, 1.8, 2.82, 0.22, 0.03, 0.05, 'ice'); box(sx * 0.8, 1.72, 0.16, 0.2, 0.05, 0.04, 'ice');             // marker lights on the roof corners
      // tail: a bracket of red light each side, in a dark bezel
      cbox(sx * 0.76, 1.0, -0.004, 0.36, 0.42, 0.03, 'trim', 0.012); box(sx * 0.87, 0.99, -0.024, 0.045, 0.33, 0.012, 'tail'); box(sx * 0.755, 1.135, -0.024, 0.275, 0.045, 0.012, 'tail');
      // nose: a thin bar of light each side of the grille
      box(sx * 0.7, 0.99, L + 0.012, 0.46, 0.035, 0.02, 'head'); cbox(sx * 0.6, 0.62, L + 0.14, 0.3, 0.2, 0.1, 'grey', 0.02);
    });
    for (const s of [0.4, 1.5, 2.6]) cbox(0, 1.855, s, 1.66, 0.035, 0.05, 'trim', 0.01);
    cbox(-0.34, 1.985, 0.95, 0.8, 0.22, 0.95, 'grey2', 0.035); cbox(-0.34, 2.1, 0.95, 0.6, 0.02, 0.7, 'grey', 0.008); cbox(0.4, 1.955, 0.75, 0.56, 0.16, 0.6, 'grey', 0.03);
    cbox(0.1, 1.975, 2.0, 1.1, 0.2, 0.8, 'grey2', 0.035); cbox(0.1, 2.08, 2.0, 0.9, 0.03, 0.5, 'grey', 0.01); for (const x of [-0.25, 0.45]) box(x, 1.98, 2.0, 0.05, 0.21, 0.81, 'trim');
    cbox(0, 0.93, -0.008, 1.12, 0.52, 0.03, 'body2', 0.012); box(0, 0.93, -0.024, 0.012, 0.5, 0.004, 'seam'); cbox(0, 0.56, -0.03, 2.02, 0.22, 0.2, 'clad', 0.04); cbox(0, 0.56, -0.14, 0.9, 0.12, 0.04, 'grey', 0.012);
    cbox(0, 0.9, L + 0.0, 0.88, 0.2, 0.04, 'trim', 0.012); for (const y of [0.85, 0.95]) box(0, y, L + 0.022, 0.8, 0.025, 0.01, 'clad');
    cbox(0, 0.62, L + 0.03, 2.02, 0.26, 0.2, 'clad', 0.045); cbox(0, 0.47, L + 0.0, 0.9, 0.1, 0.2, 'grey', 0.02);
    cbox(0, 1.11, 4.12, 0.9, 0.04, 0.95, 'body', 0.015, 0, -0.045);                                                        // the raised centre of the bonnet
    wheel(WH[0], 0.86, r, 0.36, 'block'); wheel(WH[1], 0.86, r, 0.36, 'block');
    return b.done();
  },
  // 05 FIREFLY — taxi: a tall rounded pod, yellow hoops round black glass, a lit TAXI sign, arrows on the sliding doors,
  // two rings of red light on a black tail panel
  firefly() {
    const L = 3.9, b = builder(L), { loft, cbox, box, both, wheel, flare, ring, slabS, plateS } = b, WH = [0.78, 3.1], r = 0.34;
    const A = WH.map((c) => roundArch(c, 0.42, 0.32, r + 0.02));
    const SL = [[0, 0.56], [0.12, 0.4], [0.28, 0.32], [3.6, 0.32], [3.78, 0.4], [L, 0.5]], YB = [[0, 0], ...A[0], ...A[1], [L, 0]];
    const YT = spl([[0, 1.5], [0.1, 1.68], [0.3, 1.82], [0.8, 1.91], [1.95, 1.93], [2.7, 1.88], [3.2, 1.68], [3.55, 1.36], [3.8, 1.05], [L, 0.9]]);
    const W = spl([[0, 0.8], [0.2, 0.94], [0.7, 1.02], [3.0, 1.02], [3.45, 0.95], [3.75, 0.82], [L, 0.7]]);
    const F = [0, 0.045, 0.26, 0.56, 0.82, 0.889, 0.947, 0.986, 1], WF = [0.84, 0.96, 1, 0.995, 0.93, 0.897, 0.804, 0.665, 0.5];
    const zone = (s) => (s < 0.34 ? 0 : s < 0.66 ? 1 : s < 2.96 ? 2 : s < 3.22 ? 1 : 3);            // tail · a hoop · the doors · the windscreen
    loft({ at: [...steps(0, L, 0.1), ...ks(YB, SL), 0.34, 0.66, 2.96, 3.22], smooth: 72, rear: 'yellow', front: 'trim', seams: [[1.24, 2, 3], [1.81, 2, 3], [2.38, 2, 3]],
      mat: (s, j) => { const z = zone(s); return j < 2 ? 'yellow' : z === 3 ? 'glassCab' : z === 2 && j < 4 ? 'glassCab' : 'yellow'; },
      ring: (s) => { const yb = pl(SL, s), yt = YT(s), w = W(s), h = F.map((f, i) => [w * WF[i], lerp(yb, yt, f)]); h.push([0, yt + 0.02]); return cutRing(h, pl(YB, s)); } });
    for (const c of WH) box(0, 0.5, c, 1.36, 0.6, 0.86, 'under');
    both((sx) => {
      A.forEach((a, i) => flare(sx, 0.99, a.slice(1, -1), [WH[i], 0.36], 0.11, 0.05, 'yellow'));
      ring(sx * 0.36, 0.98, -0.03, 0.13, 0.022, 'tail');
      box(sx * 0.42, 0.72, L + 0.006, 0.28, 0.028, 0.02, 'head');
      // on the door: an arrow and three chevrons, the way it slides
      box(sx * 1.032, 1.0, 2.05, 0.012, 0.03, 0.2, 'amber');
      for (const s of [1.84, 1.7, 1.56]) for (const u of [-1, 1]) box(sx * 1.032, 1.0 + u * 0.034, s, 0.012, 0.03, 0.115, 'amber', 0, u * 0.6);
    });
    slabS([[-0.66, 0.74], [0.66, 0.74], [0.7, 0.8], [0.7, 1.34], [0.6, 1.46], [-0.6, 1.46], [-0.7, 1.34], [-0.7, 0.8]], 0.03, -0.014, 'glass', 'trim');   // the black tail panel
    cbox(0, 0.62, -0.012, 1.24, 0.09, 0.07, 'cover', 0.02); cbox(0, 0.5, L - 0.04, 1.1, 0.1, 0.14, 'yellow', 0.03);
    cbox(0, 1.95, 1.95, 0.62, 0.05, 0.34, 'trim', 0.015); cbox(0, 2.07, 1.95, 0.56, 0.2, 0.22, 'signLamp', 0.03);
    plateS(-0.24, 0.24, 1.985, 2.155, 1.95 - 0.122, 1, 'signInk', TAXI); plateS(-0.24, 0.24, 1.985, 2.155, 1.95 + 0.122, -1, 'signInk', TAXI);
    wheel(WH[0], 0.82, r, 0.28, 'disc'); wheel(WH[1], 0.82, r, 0.28, 'disc');
    return b.done();
  },
  // 06 WARDEN — police: an armoured wedge, black with white doors, POLICE along them and across the tail, a red and a blue
  // light pod on the roof, arch armour, a push bumper over hazard stripes
  warden() {
    const L = 5.0, b = builder(L), { loft, cbox, box, both, wheel, flare, plateS, plateX } = b, WH = [0.95, 4.0], r = 0.42;
    const A = WH.map((c) => hexArch(c, 0.6, 0.36, 0.95));
    const SL = [[0, 0.46], [0.18, 0.36], [4.8, 0.36], [L, 0.44]], YB = [[0, 0], ...A[0], ...A[1], [L, 0]];
    const YS = [[0, 1.0], [0.12, 1.08], [0.9, 1.1], [3.6, 1.08], [4.55, 0.9], [4.9, 0.8], [L, 0.72]], WM = [[0, 0.98], [0.2, 1.06], [3.4, 1.06], [4.6, 1.03], [L, 0.9]];
    loft({ at: [...ks(YB, SL, YS, WM), 1.58, 3.38, 4.45], rear: 'navy', front: 'navy', seams: [[1.58, 2, 3], [2.28, 2, 3], [3.38, 2, 3], [3.66, 5], [0.86, 5]],
      mat: (s, j) => (j < 2 ? 'clad' : j < 4 && within(s, 1.58, 3.38) ? 'white' : j === 3 && within(s, 3.38, 4.45) ? 'white' : 'navy'),
      ring: (s) => cutRing(slabRing(pl(SL, s), pl(YS, s), pl(WM, s), 0.62, 0.86, 0.05), pl(YB, s)) });
    both((sx) => A.forEach((a, i) => flare(sx, 1.06, a, [WH[i], 0.36], 0.16, 0.085, 'grey')));
    const RF = [[0.9, 0], [1.5, 1], [2.9, 1], [3.8, 0]];
    loft({ at: [...ks(RF), 1.2, 2.2, 2.3], open: true,
      mat: (s, j) => (j === 1 ? 'navy' : j === 0 ? (s < 1.2 || within(s, 2.2, 2.3) ? 'navy' : 'glass') : within(s, 1.5, 2.9) ? 'navy' : 'glass'),
      ring: (s) => cabRing(pl(YS, s) - 0.004, pl(RF, s), 1.54, 0.08, 0.96, 0.82, 0.08) });
    for (const c of WH) box(0, 0.58, c, 1.3, 0.7, 1.14, 'under');
    // the light bar: a red pod and a blue one
    cbox(0, 1.585, 2.2, 1.5, 0.05, 0.3, 'trim', 0.015); cbox(-0.5, 1.69, 2.2, 0.46, 0.16, 0.36, 'red', 0.045); cbox(0.5, 1.69, 2.2, 0.46, 0.16, 0.36, 'blue', 0.045); cbox(0, 1.67, 2.2, 0.4, 0.1, 0.24, 'trim', 0.02);
    cbox(0, 1.13, 0.1, 1.9, 0.05, 0.22, 'navy', 0.015);
    both((sx) => {
      cbox(sx * 0.93, 1.2, 0.4, 0.05, 0.2, 0.66, 'navy', 0.015);                                                           // fins on the rear deck
      box(sx * 0.68, 0.985, -0.024, 0.44, 0.055, 0.012, 'tail'); box(sx * 0.68, 0.885, -0.024, 0.44, 0.055, 0.012, 'tail');
      plateX(2.02, 3.1, 0.7, 0.98, sx * 1.084, 'inkOnWhite', POLICE);
      for (let k = 0; k < 3; k++) box(sx * 1.078, 0.84, 1.68 + k * 0.1, 0.012, 0.27, 0.045, 'navy', 0, sx * -0.5);       // slashes behind the lettering
      cbox(sx * 1.05, 1.2, 3.42, 0.16, 0.08, 0.12, 'navy', 0.02); for (const s of [1.9, 2.95]) box(sx * 1.076, 1.02, s, 0.012, 0.024, 0.16, 'trim');
      for (const x of [0.5, 0.74]) box(sx * x, 0.64, L + 0.012, 0.2, 0.07, 0.02, 'head');
      cbox(sx * 0.42, 0.68, L + 0.2, 0.15, 0.44, 0.15, 'grey', 0.035); plateS(sx * 0.42 - 0.2, sx * 0.42 + 0.2, 0.3, 0.44, L + 0.294, -1, 'hazard', [0, 0, 3, 1]); cbox(sx * 0.42, 0.37, L + 0.21, 0.42, 0.16, 0.15, 'clad', 0.02);
      cbox(sx * 0.4, 0.99, 4.1, 0.34, 0.02, 0.5, 'trim', 0.006, 0, -0.19);                                                 // bonnet vents
    });
    cbox(0, 0.935, -0.006, 1.92, 0.3, 0.03, 'trim', 0.012); plateS(-0.38, 0.38, 0.86, 1.02, -0.034, 1, 'inkOnTrim', POLICE);
    cbox(0, 0.56, -0.03, 2.0, 0.22, 0.16, 'clad', 0.04); cbox(0, 0.5, -0.1, 1.0, 0.14, 0.06, 'grey', 0.02);
    cbox(0, 0.74, L + 0.2, 1.3, 0.12, 0.1, 'clad', 0.025); cbox(0, 0.5, L + 0.06, 1.7, 0.2, 0.18, 'clad', 0.04);
    wheel(WH[0], 0.88, r, 0.34, 'block'); wheel(WH[1], 0.88, r, 0.34, 'block');
    return b.done();
  },
  // 07 RELAY — van: a dark wedge of a cab, a pale cargo pod with cut corners riding behind it on a low chassis with faceted
  // wheel pods, a sensor mast, an arch of red light round the rear doors
  relay() {
    const L = 5.4, b = builder(L), { loft, cbox, box, both, wheel, flare, slabS, plateX } = b, WH = [1.05, 4.3], r = 0.4;
    const A = WH.map((c) => hexArch(c, 0.5, 0.34, 0.62));
    const SL = [[0, 0.44], [0.15, 0.34], [5.2, 0.34], [L, 0.46]], YB = [[0, 0], ...A[0], ...A[1], [L, 0]], WC = [[0, 1.0], [0.15, 1.06], [5.15, 1.06], [L, 0.94]];
    loft({ at: ks(YB, SL, WC), mat: (s, j) => (j < 3 ? 'clad' : 'dark'), rear: 'clad', front: 'clad',
      ring: (s) => { const yb = pl(SL, s), w = pl(WC, s); return cutRing([[w - 0.1, yb], [w - 0.01, yb + 0.05], [w + 0.02, 0.64], [w, 0.78], [w - 0.04, 0.82], [0, 0.82]], pl(YB, s)); } });
    both((sx) => A.forEach((a, i) => flare(sx, 1.07, a, [WH[i], 0.3], 0.26, 0.09, 'clad')));
    // the cab
    const CT = [[3.35, 1.76], [4.2, 1.8], [5.05, 1.22], [5.3, 1.1], [L, 1.04]], CW = [[3.35, 1.04], [5.0, 1.04], [L, 0.95]];
    loft({ at: [...ks(CT, CW), 3.8, 4.95], rear: 'dark', front: 'dark', seams: [[3.74, 0, 2]],
      mat: (s, j) => (j === 1 && within(s, 3.8, 4.95) ? 'glass' : j === 3 && within(s, 4.2, 5.05) ? 'glass' : 'dark'),
      ring: (s) => { const yt = pl(CT, s), w = pl(CW, s), yb = Math.min(1.2, yt - 0.1), yg = Math.max(yb + 0.02, yt - 0.07), t = clamp((yt - 1.2) / 0.6, 0, 1); return [[w, 0.8], [w, yb], [w - 0.12 * t, yg], [w - 0.12 * t - 0.06, yt], [0, yt + 0.012]]; } });
    both((sx) => {
      cbox(sx * 0.62, 0.93, L + 0.004, 0.42, 0.2, 0.03, 'trim', 0.012); box(sx * 0.62, 0.93, L + 0.022, 0.34, 0.14, 0.012, 'head');
      cbox(sx * 1.1, 1.3, 4.95, 0.12, 0.22, 0.08, 'trim', 0.02); box(sx * 0.8, 0.5, L + 0.01, 0.05, 0.1, 0.02, 'cyan');
      plateX(3.21, 3.34, 0.98, 1.2, sx * 1.0, 'hazard', [0, 0, 1.2, 2]);
    });
    cbox(0, 0.56, L - 0.02, 1.9, 0.2, 0.16, 'clad', 0.04); cbox(0, 1.25, 3.27, 1.96, 0.86, 0.15, 'trim', 0.03);
    // the pod: eight-sided, its ends drawn in
    const K = [[0.04, 0.88], [0.3, 1], [2.94, 1], [3.2, 0.88]];
    loft({ at: ks(K), mat: () => 'beige', rear: 'beige', front: 'beige', seams: [[1.1, 0, 3], [2.15, 0, 3]],
      ring: (s) => { const k = pl(K, s); return [[0.92, 0.84], [1.12, 1.06], [1.12, 1.74], [0.8, 2.2], [0, 2.2]].map(([x, y]) => [x * k, 1.5 + (y - 1.5) * k]); } });
    both((sx) => {
      cbox(sx * 1.125, 1.5, 0.7, 0.012, 0.3, 0.22, 'beige2', 0.004); box(sx * 1.13, 1.3, 1.6, 0.012, 0.12, 0.07, 'cyan'); for (let k = 0; k < 3; k++) box(sx * 1.126, 1.62, 2.5 + k * 0.08, 0.012, 0.1, 0.03, 'trim');
      // the arch of red light, split by the door seam
      box(sx * 0.55, 1.39, 0.006, 0.045, 0.84, 0.014, 'tail'); box(sx * 0.482, 1.892, 0.006, 0.045, 0.225, 0.014, 'tail', sx * 0.66); box(sx * 0.235, 1.975, 0.006, 0.4, 0.045, 0.014, 'tail');
      box(sx * 0.5, 0.52, -0.086, 0.14, 0.05, 0.012, 'cyan');
    });
    slabS([[-0.7, 0.96], [0.7, 0.96], [0.7, 1.82], [0.5, 2.06], [-0.5, 2.06], [-0.7, 1.82]], 0.05, 0.022, 'dark', 'trim'); box(0, 1.5, 0.02, 0.014, 1.08, 0.008, 'seam');
    cbox(0, 0.54, -0.02, 2.0, 0.26, 0.12, 'clad', 0.04);
    cbox(-0.5, 2.0, 3.62, 0.07, 0.5, 0.07, 'trim', 0.015); cbox(-0.5, 2.3, 3.62, 0.34, 0.12, 0.18, 'grey2', 0.03); box(-0.42, 2.3, 3.62 - 0.092, 0.14, 0.05, 0.012, 'cyan'); box(-0.5, 2.3, 3.62 + 0.092, 0.2, 0.05, 0.012, 'cyan');
    wheel(WH[0], 0.84, r, 0.32, 'truck'); wheel(WH[1], 0.84, r, 0.32, 'truck');
    return b.done();
  },
  // 08 MULE — pickup: a six-wheel utility truck on lugged tyres, dark cab, a generator behind it, an orange tube frame round
  // the bed and an orange bull bar, tail lamps like a pair of square brackets
  mule() {
    const L = 5.6, b = builder(L), { loft, cbox, box, both, wheel, flare, tube } = b, WH = [0.7, 1.72, 4.6], r = 0.46;
    const AR = [[0.06, 0.5], [0.12, 0.78], [0.38, 1.0], [2.04, 1.0], [2.3, 0.78], [2.36, 0.5]], AF = hexArch(4.6, 0.64, 0.5, 1.02);
    const SL = [[0, 0.5], [5.42, 0.5], [L, 0.58]], YB = [[0, 0], ...AR, ...AF, [L, 0]], WC = [[0, 1.02], [0.1, 1.05], [5.3, 1.05], [L, 0.96]];
    const YS = [[0, 1.08], [2.92, 1.08], [5.5, 1.08], [L, 1.02]];
    loft({ at: ks(YB, SL, WC, YS), mat: (s, j) => (j < 2 ? 'clad' : 'dark'), rear: 'dark', front: 'clad', ring: (s) => cutRing(slabRing(pl(SL, s), pl(YS, s), pl(WC, s), 0.74, 0.9, 0.035, 0), pl(YB, s)) });
    both((sx) => { flare(sx, 1.05, AR, [1.21, 0.4], 0.13, 0.07, 'clad'); flare(sx, 1.05, AF, [4.6, 0.5], 0.14, 0.075, 'clad'); });
    box(0, 0.66, 1.21, 1.3, 0.6, 2.2, 'under'); box(0, 0.66, 4.6, 1.3, 0.6, 1.2, 'under');
    // the cab
    const CT = [[2.95, 1.84], [3.95, 1.88], [4.72, 1.36], [5.5, 1.22], [L, 1.16]], CW = [[2.95, 1.04], [4.9, 1.04], [L, 0.96]];
    loft({ at: [...ks(CT, CW), 3.3], rear: 'dark', front: 'trim', seams: [[3.24, 0, 2], [4.6, 0, 0]],
      mat: (s, j) => (j === 1 && within(s, 3.3, 4.72) ? 'glass' : j === 3 && within(s, 3.95, 4.72) ? 'glass' : 'dark'),
      ring: (s) => { const yt = pl(CT, s), w = pl(CW, s), yb = Math.min(1.36, yt - 0.06), yg = Math.max(yb + 0.02, yt - 0.07), t = clamp((yt - 1.36) / 0.5, 0, 1); return [[w, 1.06], [w, yb], [w - 0.13 * t, yg], [w - 0.13 * t - 0.06, yt], [0, yt + 0.012]]; } });
    both((sx) => {
      cbox(sx * 0.66, 0.9, L + 0.004, 0.38, 0.22, 0.03, 'trim', 0.012); box(sx * 0.66, 0.9, L + 0.022, 0.3, 0.15, 0.012, 'head');
      cbox(sx * 1.1, 1.46, 4.66, 0.12, 0.24, 0.08, 'trim', 0.02); box(sx * 1.052, 1.16, 5.2, 0.012, 0.06, 0.12, 'amber'); box(sx * 0.62, 1.2, L + 0.006, 0.12, 0.05, 0.012, 'amber');
      cbox(sx * 0.96, 0.74, 3.35, 0.2, 0.34, 0.9, 'grey', 0.04);                                                           // tanks under the cab
      // the bed's tube frame
      tube([[sx * 0.98, 1.1, 0.1], [sx * 0.98, 1.55, 0.1], [sx * 0.98, 1.55, 2.3], [sx * 0.98, 1.1, 2.3]], 0.04, 'frame'); tube([[sx * 0.98, 1.33, 0.1], [sx * 0.98, 1.33, 2.3]], 0.03, 'frame');
      for (const s of [0.83, 1.57]) tube([[sx * 0.98, 1.1, s], [sx * 0.98, 1.55, s]], 0.03, 'frame');
      // tail: a square bracket of red light on each corner post
      cbox(sx * 0.93, 1.1, 0.07, 0.24, 0.58, 0.16, 'clad', 0.03); box(sx * 0.99, 1.1, -0.016, 0.042, 0.37, 0.012, 'tail'); for (const y of [0.935, 1.265]) box(sx * 0.915, y, -0.016, 0.19, 0.042, 0.012, 'tail');
      // the bull bar's stays
      tube([[sx * 0.78, 0.82, L + 0.24], [sx * 0.78, 0.82, L - 0.04]], 0.035, 'frame');
    });
    for (const k of [-1, 0, 1]) box(k * 0.36, 1.9, 3.96, 0.16, 0.045, 0.07, 'amber');
    cbox(0, 0.9, L + 0.002, 0.86, 0.26, 0.03, 'trim', 0.012); for (const y of [0.83, 0.9, 0.97]) box(0, y, L + 0.02, 0.78, 0.025, 0.01, 'clad');
    cbox(0, 0.64, L - 0.02, 1.96, 0.2, 0.2, 'clad', 0.04);
    tube([[-0.78, 0.5, L + 0.24], [-0.78, 1.14, L + 0.24], [0.78, 1.14, L + 0.24], [0.78, 0.5, L + 0.24], [-0.78, 0.5, L + 0.24]], 0.045, 'frame');
    tube([[-0.78, 0.82, L + 0.24], [0.78, 0.82, L + 0.24]], 0.04, 'frame'); for (const x of [-0.36, 0.36]) tube([[x, 0.5, L + 0.24], [x, 1.14, L + 0.24]], 0.035, 'frame');
    // the generator behind the cab, its pipe and stack
    cbox(0, 1.46, 2.62, 1.6, 0.74, 0.56, 'grey2', 0.04); both((sx) => { for (let k = 0; k < 4; k++) box(sx * 0.805, 1.34 + k * 0.08, 2.62, 0.012, 0.03, 0.36, 'trim'); box(sx * 0.81, 1.72, 2.5, 0.012, 0.07, 0.07, 'amber'); });
    tube([[0.5, 1.8, 2.52], [0.5, 2.02, 2.52], [0.5, 2.02, 2.8], [0.5, 1.9, 2.92]], 0.045, 'frame'); cbox(-0.55, 2.0, 2.6, 0.12, 0.44, 0.12, 'trim', 0.03);
    // the bed, its headboard hoop and tailgate
    cbox(0, 1.1, 1.2, 2.04, 0.06, 2.3, 'dark', 0.015); for (let k = -4; k <= 4; k++) box(k * 0.2, 1.135, 1.2, 0.05, 0.014, 2.1, 'grey');
    tube([[-0.98, 1.55, 2.3], [-0.72, 1.96, 2.3], [0.72, 1.96, 2.3], [0.98, 1.55, 2.3]], 0.04, 'frame'); tube([[-0.98, 1.55, 0.1], [0.98, 1.55, 0.1]], 0.035, 'frame');
    cbox(0, 1.27, 0.05, 1.62, 0.34, 0.07, 'dark', 0.02); for (const y of [1.18, 1.27, 1.36]) box(0, y, 0.012, 1.5, 0.02, 0.012, 'grey'); cbox(0, 0.68, -0.02, 2.0, 0.2, 0.18, 'clad', 0.04); cbox(0, 0.68, -0.115, 0.7, 0.1, 0.03, 'grey', 0.01);
    for (const s of WH) wheel(s, 0.88, r, 0.38, 'block');
    return b.done();
  },
  // 09 LEVIATHAN — truck: an angular cab with a visor of cyan light, a dark container in banded segments on six axles,
  // amber lamps at its top corners and two slashes of red low on the doors
  leviathan() {
    const L = 12.2, b = builder(L), { loft, cbox, box, both, wheel, flare } = b, WH = [0.9, 1.95, 3.0, 8.3, 9.35, 11.3], r = 0.5;
    box(0, 0.8, 5.2, 1.5, 0.36, 10.0, 'under');
    loft({ at: [0.05, 9.0], mat: () => 'grey', rear: 'grey', front: 'grey', seams: [[1.36, 0, 3], [3.48, 0, 3], [5.62, 0, 3], [7.72, 0, 3]], ring: () => [[1.25, 1.0], [1.3, 1.07], [1.3, 3.42], [1.22, 3.5], [0, 3.5]] });
    for (const s of [0.3, 2.42, 4.55, 6.68, 8.75]) {                                                                      // the bands round the container
      const p = [[s - 0.24, 0], [s - 0.18, 0.07], [s + 0.18, 0.07], [s + 0.24, 0]];
      loft({ at: ks(p), mat: () => 'grey2', ring: (q) => { const k = pl(p, q); return [[1.24 + k, 0.99 - k * 0.3], [1.3 + k, 1.07], [1.3 + k, 3.42 + k * 0.3], [1.22 + k * 0.6, 3.5 + k], [0, 3.5 + k]]; } });
    }
    both((sx) => {
      cbox(sx * 1.2, 0.8, 5.65, 0.08, 0.42, 3.9, 'clad', 0.025); for (const s of [4.3, 5.65, 7.0]) box(sx * 1.244, 0.93, s, 0.012, 0.04, 0.3, 'amber');
      for (const s of [2.86, 5.0, 7.12]) { cbox(sx * 1.305, 1.26, s, 0.012, 0.2, 0.12, 'trim', 0.004); box(sx * 1.312, 1.26, s, 0.012, 0.13, 0.07, 'cyan'); }
      box(sx * 1.0, 0.62, 0.3, 0.46, 0.5, 0.025, 'under'); cbox(sx * 1.0, 1.05, 1.95, 0.5, 0.06, 3.2, 'clad', 0.02);
      // tail: lock rods on the doors, amber at the top corners, a slash of red
      for (const x of [0.22, 0.62]) cbox(sx * x, 2.25, 0.036, 0.035, 2.3, 0.03, 'grey2', 0.008);
      box(sx * 1.08, 3.38, 0.04, 0.22, 0.07, 0.02, 'amber'); box(sx * 0.86, 1.48, 0.036, 0.055, 0.62, 0.016, 'tail', sx * 0.62);
    });
    box(0, 2.25, 0.044, 0.014, 2.36, 0.008, 'seam'); cbox(0, 0.64, 0.1, 2.4, 0.14, 0.1, 'clad', 0.03); for (const x of [-0.7, 0.7]) cbox(x, 0.82, 0.12, 0.08, 0.3, 0.08, 'clad', 0.02);
    // the cab
    const CT = [[9.22, 3.46], [10.25, 3.46], [10.95, 3.02], [11.72, 1.98], [12.12, 1.5], [L, 1.34]], CW = [[9.22, 1.27], [11.5, 1.27], [L, 1.12]];
    loft({ at: [...ks(CT, CW), 10.55], rear: 'grey', front: 'clad', seams: [[10.45, 0, 2], [11.78, 0, 3]],
      mat: (s, j) => (j === 1 && within(s, 10.55, 11.72) ? 'glass' : j === 3 && within(s, 10.95, 11.72) ? 'glass' : 'grey'),
      ring: (s) => { const yt = pl(CT, s), w = pl(CW, s), yb = Math.min(1.95, yt - 0.12), yg = Math.max(yb + 0.02, Math.min(2.8, yt - 0.07)), t = clamp((yg - 1.95) / 0.85, 0, 1); return [[w, 0.98], [w, yb], [w - 0.1 * t, yg], [w - 0.1 * t - 0.08, yt], [0, yt + 0.012]]; } });
    box(0, 0.8, 10.7, 1.5, 0.4, 2.8, 'under');
    cbox(0, 3.02, 10.96, 2.2, 0.06, 0.06, 'cyan', 0.01);                                                                   // the visor
    both((sx) => {
      box(sx * 1.13, 2.99, 10.8, 0.02, 0.05, 0.34, 'cyan', 0, 0.56);
      box(sx * 0.86, 1.36, L - 0.03, 0.36, 0.07, 0.04, 'head', sx * -0.22);
      for (let k = 0; k < 5; k++) box(sx * 1.275, 2.5 + k * 0.13, 9.8, 0.012, 0.05, 0.6, 'trim');                           // vents behind the window
      cbox(sx * 1.27, 2.3, 9.3, 0.05, 2.3, 0.26, 'grey2', 0.015); cbox(sx * 1.12, 0.74, 10.2, 0.3, 0.42, 1.0, 'grey2', 0.06); cbox(sx * 1.2, 0.62, 11.95, 0.2, 0.2, 0.4, 'clad', 0.03);
      cbox(sx * 1.38, 2.5, 11.55, 0.1, 0.36, 0.1, 'trim', 0.025);
      flare(sx, 1.25, hexArch(11.3, 0.66, 0.9, 1.1), [11.3, 0.7], 0.14, 0.06, 'clad');
    });
    cbox(0, 0.76, L - 0.1, 2.36, 0.5, 0.3, 'clad', 0.06); cbox(0, 1.12, L - 0.0, 1.3, 0.3, 0.04, 'trim', 0.012); for (const y of [1.04, 1.12, 1.2]) box(0, y, L + 0.022, 1.2, 0.025, 0.01, 'clad');
    for (const s of WH) wheel(s, 1.0, r, 0.44, 'truck');
    return b.done();
  },
  // 10 ORBIT — coach: one long smooth volume, dark glass its whole length with the cabin lit behind it, a raked nose,
  // red lamps stacked up each rear corner, violet markers along the skirt
  orbit() {
    const L = 12.2, b = builder(L), { loft, cbox, box, both, wheel, slabS } = b, WH = [1.45, 2.65, 10.0], r = 0.5;
    const A = WH.map((c) => roundArch(c, 0.57, 0.44, r + 0.02));
    const SL = [[0, 0.6], [0.2, 0.44], [11.9, 0.44], [L, 0.62]], YB = [[0, 0], ...A[0], ...A[1], ...A[2], [L, 0]];
    const YT = spl([[0, 2.78], [0.15, 3.05], [0.5, 3.18], [2, 3.2], [9.6, 3.2], [10.6, 3.08], [11.3, 2.6], [11.8, 1.9], [12.1, 1.35], [L, 1.1]]);
    const W = spl([[0, 1.12], [0.25, 1.26], [0.8, 1.3], [10.6, 1.3], [11.4, 1.22], [11.9, 1.05], [L, 0.8]]);
    loft({ at: [...steps(0, 10.4, 0.2), ...steps(10.4, L, 0.1), ...steps(0, 0.8, 0.1), ...ks(YB, SL), 0.7, 10.5], smooth: 72, rear: 'body', front: 'body',
      seams: [[2.05, 3, 4], [3.9, 3, 4], [5.5, 3, 4], [7.1, 3, 4], [8.7, 3, 4], [10.52, 3, 4], [4.2, 0, 2], [6.6, 0, 2], [9.1, 0, 2]],
      mat: (s, j) => (j < 3 ? 'body' : j < 5 ? (s < 0.7 ? 'body' : 'glassCoach') : s > 10.5 ? 'glassCoach' : 'body'),      // strips: 0–2 the lower body · 3, 4 the band of glass · 5… the roof, which is windscreen at the nose
      ring: (s) => {
        const yb = pl(SL, s), yt = YT(s), w = W(s), yA = Math.min(1.3, lerp(yb, yt, 0.42)), yB = Math.min(2.72, lerp(yb, yt, 0.9)), y1 = yb + 0.07;
        return cutRing([[w - 0.14, yb], [w - 0.02, y1], [w, lerp(y1, yA, 0.5)], [w, yA], [w * 0.97, lerp(yA, yB, 0.5)], [w * 0.93, yB], [w * 0.897, lerp(yB, yt, 0.383)], [w * 0.804, lerp(yB, yt, 0.707)], [w * 0.665, lerp(yB, yt, 0.924)], [w * 0.5, yt], [0, yt + 0.03]], pl(YB, s));
      } });
    box(0, 0.62, 2.05, 1.9, 0.7, 2.3, 'under'); box(0, 0.62, 10.0, 1.9, 0.7, 1.12, 'under');
    slabS([[-0.9, 1.74], [0.9, 1.74], [0.96, 1.82], [0.96, 2.5], [0.84, 2.66], [-0.84, 2.66], [-0.96, 2.5], [-0.96, 1.82]], 0.05, -0.012, 'glassCoach', 'trim');     // the rear window
    cbox(0, 0.74, -0.004, 1.5, 0.13, 0.04, 'trim', 0.02);
    both((sx) => {
      for (const k of [0, 1]) { cbox(sx * 0.95, 1.13 + k * 0.31, -0.004, 0.17, 0.29, 0.03, 'trim', 0.03); cbox(sx * 0.95, 1.13 + k * 0.31, -0.016, 0.115, 0.235, 0.02, 'tail', 0.03); }
      box(sx * 0.6, 0.98, L - 0.02, 0.34, 0.05, 0.05, 'head');
      for (const s of [3.6, 5.4, 7.2, 9.0]) box(sx * 1.305, 0.56, s, 0.012, 0.035, 0.45, 'violet');
      cbox(sx * 1.36, 2.3, 11.25, 0.26, 0.06, 0.07, 'trim', 0.02); cbox(sx * 1.47, 2.14, 11.25, 0.07, 0.36, 0.1, 'trim', 0.025);            // mirrors on their arms
    });
    for (const s of WH) wheel(s, 1.02, r, 0.4, 'disc');
    return b.done();
  },
};
export const VEHICLE_STYLES = Object.keys(STYLES);

// what a glossy surface reflects: the sky above, the lit road below with its lane lines, the band of light on the horizon, the sun
export const ENV_GLSL = /* glsl */`
      vec3 env(vec3 R){
        float y = R.y;
        vec3 c = y > 0.0 ? mix(cSky * 1.1, cTop, smoothstep(0.05, 0.7, y)) : mix(cHor * 0.25, cGrid * 0.12, smoothstep(-0.02, -0.5, y));
        c += cGrid * 0.16 * smoothstep(0.92, 1.0, abs(sin(R.x / max(-y, 0.05) * 9.0))) * smoothstep(-0.05, -0.3, y);   // the road's lines streak across lower panels
        c += cHor * exp(-abs(y) / 0.04) * 1.1;
        c += cSun * exp(-pow((R.z + 0.98) / 0.08, 2.0)) * exp(-pow((y - 0.07) / 0.1, 2.0)) * 1.4;
        return c;
      }`;

// the lettering painted on the police cars and the taxi sign: white on black, read as a mask
function lettering() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d'), t = new THREE.CanvasTexture(c);
  const draw = () => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 512, 256); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '700 112px "Chakra Petch", "Arial Black", "Helvetica Neue", Arial, sans-serif'; g.fillText('POLICE', 256, 68, 460); g.fillText('TAXI', 256, 196, 300); t.needsUpdate = true;
  };
  t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; draw();
  if (document.fonts && document.fonts.load) document.fonts.load('700 112px "Chakra Petch"').then(draw, () => {});
  return t;
}

const MAX = 56;
function makeStyle(style, uniforms) {
  const base = STYLES[style]();
  const g = new THREE.InstancedBufferGeometry();
  for (const k of ['position', 'normal', 'aPart', 'aCol', 'aHub', 'aShade', 'aUv']) g.setAttribute(k, base.getAttribute(k));
  const A = {};
  for (const [n, k] of [['aP', 3], ['aS', 4], ['aC', 3], ['aL', 4], ['aR', 2]]) { A[n] = new THREE.InstancedBufferAttribute(new Float32Array(MAX * k), k); A[n].setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, A[n]); }
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      uniform float uSpin;
      attribute float aPart, aShade; attribute vec2 aHub, aUv, aR; attribute vec3 aP, aC, aCol; attribute vec4 aS, aL;   // aS: heading, scale, fade, – · aL: tail, roof left, roof right, brake · aR: roll, pitch
      varying vec3 vN, vW, vC, vL; varying float vPart, vFade, vShade; varying vec4 vLi; varying vec2 vUv, vYaw;
      ${ROAD_GLSL}
      vec3 lean(vec3 q){                                                   // roll about the vehicle's long axis, then pitch about the axle line
        float cr = cos(aR.x), sr = sin(aR.x), cp = cos(aR.y), sp = sin(aR.y);
        q = vec3(q.x * cr - q.y * sr, q.x * sr + q.y * cr, q.z);
        return vec3(q.x, q.y * cp - q.z * sp, q.y * sp + q.z * cp);
      }
      void main(){
        vec3 p = position, n = normal;
        vL = p;
        if (aHub.x > 0.0) {                                                // a wheel turns about its axle and stays on the road …
          float a = -uSpin / aHub.x, ca = cos(a), sa = sin(a); vec2 d = p.yz - aHub;
          p.yz = aHub + vec2(d.x * ca - d.y * sa, d.x * sa + d.y * ca); n.yz = vec2(n.y * ca - n.z * sa, n.y * sa + n.z * ca);
        } else { p = lean(p - vec3(0.0, 0.4, 0.0)) + vec3(0.0, 0.4, 0.0); n = lean(n); }   // … the body moves on its springs
        float c = cos(aS.x), s = sin(aS.x);
        mat3 R = mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
        vec3 w = bend(aP + R * (p * aS.y)); vW = w; vN = R * n; vPart = aPart; vFade = aS.z; vLi = aL; vShade = aShade; vUv = aUv; vYaw = vec2(c, s);
        vC = aPart > 8.5 && aPart < 9.5 ? aC * aCol : aCol;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec3 cSky, cTop, cHor, cSun, cGrid, cFog; uniform sampler2D uInk;
      varying vec3 vN, vW, vC, vL; varying float vPart, vFade, vShade; varying vec4 vLi; varying vec2 vUv, vYaw;
      ${ENV_GLSL}
      float h31(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
      vec3 toCar(vec3 v){ return vec3(vYaw.x * v.x - vYaw.y * v.z, v.y, vYaw.y * v.x + vYaw.x * v.z); }
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW), R = reflect(-V, N), E = env(R);
        float nv = max(dot(N, V), 0.0), fr = 0.04 + 0.96 * pow(1.0 - nv, 5.0), dist = length(vW - cameraPosition);
        float far = mix(1.0, 0.4, smoothstep(60.0, 200.0, dist)), p = vPart;
        float low = mix(0.5, 1.0, smoothstep(0.15, 0.85, vL.y)) * vShade, sky = 0.5 + 0.5 * max(N.y, 0.0);   // darker towards the road and in recesses; brighter facing the sky
        float ink = p > 10.5 && p < 13.5 ? texture2D(uInk, vUv).r : 0.0;
        vec3 col;
        if (p < 0.5 || (p > 8.5 && p < 9.5) || (p > 10.5 && p < 11.5) || p > 13.5) {
          // metallic paint under a clear coat: its own colour lit by the sky, the scene mirrored in the lacquer and, tinted, in the metal
          vec3 base = p > 13.5 ? mix(vec3(0.025), vC, step(0.5, fract(vUv.x + vUv.y))) : mix(vC, vec3(0.02, 0.022, 0.03), ink);
          col = base * sky * low * 0.9 + E * (0.09 + 0.91 * fr) * 1.05 * (0.35 + 0.65 * low) + E * base * 0.55;
          col += (vec3(0.022, 0.026, 0.042) + cSky * 0.22) * (0.25 + 0.75 * max(N.y, 0.0)) * low + cHor * pow(1.0 - nv, 3.0) * 0.1 * low;   // the sheen of the lacquer: soft light from above, the horizon's glow along the edges
          float glint = pow(max(dot(R, normalize(vec3(0.0, 0.12, -1.0))), 0.0), 24.0);                    // flake sparkling towards the horizon glow
          col += (cSun * 0.6 + cHor * 0.4) * step(0.993, h31(floor(vL * 240.0))) * glint * 0.45 * base * 2.0;
          col += cGrid * base * 0.3 * max(0.35 - N.y, 0.0) * smoothstep(0.95, 0.25, vL.y);                 // the lit road on the lower panels
        } else if (p < 1.5) {
          // glass: black, mirroring the sky more the flatter you look along it; some have a lit cabin behind
          col = vec3(0.008, 0.01, 0.024) + E * (0.1 + 0.9 * fr) * 1.3;
          if (vC.r > 0.01) {
            vec3 D = toCar(-V), Nc = toCar(N); bool side = abs(Nc.x) > abs(Nc.z);
            vec3 q = vL + D * (0.5 / max(side ? abs(D.x) : abs(D.z), 0.2));                                // where the eye's ray is half a metre inside
            float along = side ? q.z : q.x;
            float fs = abs(fract(along / 0.86 + 0.5) - 0.5), top = vUv.x - 0.5 * smoothstep(0.1, 0.24, fs);          // seat backs with rounded shoulders
            float seat = smoothstep(0.25, 0.2, fs) * smoothstep(top, top - 0.1, q.y);
            float lamp = vUv.y > 0.0 ? smoothstep(0.05, 0.02, abs(q.y - vUv.y)) * smoothstep(0.3, 0.26, abs(fract(along / 1.72 + 0.31) - 0.5)) : 0.0;
            float wash = vUv.y > 0.0 ? smoothstep(1.3, 0.0, vUv.y - q.y) : 0.5;                                    // the cabin is brightest under its ceiling
            col += vC * (0.03 + 0.07 * wash - 0.06 * seat * wash + 1.6 * lamp) * (1.0 - fr) * far;
          }
        } else if (p < 2.5) col = vec3(2.2, 0.08, 0.16) * (0.6 + 1.3 * vLi.w) * vLi.x * far;                 // tail lamps (a soft sprite takes over far away)
        else if (p < 3.5) col = vC * sky * low + E * (0.02 + 0.5 * fr) * 0.4 + (vec3(0.01, 0.012, 0.02) + cSky * 0.1) * max(N.y, 0.0) * low;   // satin trim, cladding
        else if (p < 5.5) col = vC * 3.4 * (p < 4.5 ? vLi.y : vLi.z) + vC * 0.06;                          // roof lights: the police pods, the taxi sign
        else if (p < 6.5) col = vec3(1.2, 1.5, 1.75) * far;                                                // head lamps: cold white
        else if (p < 7.5) col = vC * 0.25 * low + E * (vC * 1.5 + 0.12) * (0.45 + 0.55 * fr) * (0.4 + 0.6 * vShade);   // bright metal
        else if (p < 8.5) col = vC * 2.0 * mix(1.0, 0.6, smoothstep(80.0, 260.0, dist));                   // marker lights
        else if (p < 10.5) col = vC * sky * (0.6 + 0.4 * low) + E * fr * 0.12;                             // rubber
        else if (p < 12.5) col = vC * (3.0 * vLi.y + 0.06) * (1.0 - 0.95 * ink);                           // the lit sign, its lettering dark
        else col = mix(vC, vec3(0.9, 0.92, 0.96), ink) * sky * low + E * (0.02 + 0.5 * fr) * 0.4;          // white lettering on trim
        // far away the vehicle comes out of the haze (no flicker), and the usual distance fog
        col = mix(cFog, col, vFade);
        col = mix(col, cFog, (1.0 - exp(-dist / 900.0)) * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 5;
  m.userData = { A, g, n: 0 };
  return m;
}

export class Vehicles {
  constructor() {
    const v3 = () => ({ value: new THREE.Vector3() });
    this.u = { ...ROAD_U, cSky: v3(), cTop: v3(), cHor: v3(), cSun: v3(), cGrid: v3(), cFog: v3(), uT: { value: 0 }, uSpin: { value: 0 }, uInk: { value: lettering() } };
    this.group = new THREE.Group();
    this.m = {};
    for (const k of VEHICLE_STYLES) { this.m[k] = makeStyle(k, this.u); this.group.add(this.m[k]); }
  }
  begin(P, T = 0) {
    const u = this.u; u.uT.value = T; u.uSpin.value = (T * 30) % 3000;         // wheels turn as if at traffic's pace
    u.cSky.value.set(...P.skyMid); u.cTop.value.set(...P.skyTop); u.cHor.value.set(...P.horizon); u.cSun.value.set(...P.sunMid); u.cGrid.value.set(...P.grid); u.cFog.value.set(...P.fog);
    for (const k in this.m) this.m[k].userData.n = 0;
  }
  // style: one of VEHICLE_STYLES · col: body colour (monolith, nomad, orbit) · tail / roofL / roofR: light levels · brake: 0..1
  // roll: the body leans (+ = its roof towards −x) · pitch: + = nose up
  add(style, x, y, z, yaw, scale, col, fade = 1, tail = 1, roofL = 0, roofR = 0, brake = 0, roll = 0, pitch = 0) {
    const d = this.m[style].userData, i = d.n; if (i >= MAX) return; d.n++;
    d.A.aP.array.set([x, y, z], i * 3); d.A.aS.array.set([yaw, scale, fade, 0], i * 4);
    d.A.aC.array.set(col, i * 3); d.A.aL.array.set([tail, roofL, roofR, brake], i * 4); d.A.aR.array.set([roll, pitch], i * 2);
  }
  end() {
    for (const k in this.m) { const m = this.m[k], d = m.userData; d.g.instanceCount = d.n; m.visible = d.n > 0; for (const a in d.A) d.A[a].needsUpdate = true; }
  }
}
