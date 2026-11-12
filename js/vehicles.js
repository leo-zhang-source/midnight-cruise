// Vehicle bodies for traffic and the police, modelled on the Midnight Cruise vehicle studies (02–10; the player's car
// is its own model, js/car.js): MONOLITH saloon, RAZOR coupe, NOMAD estate, FIREFLY taxi, WARDEN police, RELAY van,
// MULE pickup, LEVIATHAN truck, ORBIT coach.
// Each one is built from faceted hulls — flat-shaded lofts through six-cornered sections (sill, waist, roof edge) — plus
// boxes, wheels and lamps, merged into one geometry with a material and a colour on every face, and drawn instanced.
// Per instance: position, heading, lean and dive of the body on its springs, scale, body colour, fade, and its lights.
import * as THREE from '../vendor/three.module.min.js';

// materials: [part, colour]. Parts: 0 paint (the face's own colour) · 1 glass · 2 tail lamp · 3 dark trim, tyres ·
// 4, 5 roof lights left / right · 6 head lamp · 7 wheel cover · 8 marker light (the face's colour, lit) · 9 body paint (the instance's colour)
const M = {
  body: [9, [1, 1, 1]], glass: [1, [0, 0, 0]], clad: [3, [0.045, 0.05, 0.07]], dark: [3, [0.085, 0.09, 0.12]], tyre: [3, [0.018, 0.018, 0.026]],
  cover: [7, [0.2, 0.21, 0.26]], tail: [2, [1, 0, 0]], head: [6, [1, 1, 1]],
  white: [0, [0.8, 0.82, 0.87]], navy: [0, [0.045, 0.055, 0.1]], yellow: [0, [0.95, 0.68, 0.07]], black: [0, [0.03, 0.032, 0.045]],
  beige: [0, [0.7, 0.66, 0.58]], grey: [0, [0.15, 0.16, 0.2]], grey2: [0, [0.22, 0.23, 0.28]], frame: [0, [0.82, 0.34, 0.08]], hazard: [0, [0.95, 0.7, 0.05]],
  cyan: [8, [0.25, 0.95, 1.0]], amber: [8, [1.0, 0.62, 0.08]], violet: [8, [0.6, 0.35, 1.0]], ice: [8, [0.8, 0.92, 1.0]], orange: [8, [1.0, 0.3, 0.02]],
  red: [4, [1.0, 0.08, 0.14]], blue: [5, [0.04, 0.18, 1.0]], signL: [4, [1.0, 0.66, 0.08]], signR: [5, [1.0, 0.66, 0.08]],
};

// A vehicle under construction. Lengths run along s, from the rear bumper (0) to the nose (L); x is across, y up.
function builder(L) {
  const pos = [], nor = [], part = [], col = [], fix = [];
  const zOf = (s) => L / 2 - s;
  const V = (x, y, z) => new THREE.Vector3(x, y, z), e1 = V(0, 0, 0), e2 = V(0, 0, 0), n = V(0, 0, 0);
  const tri = (a, b, c, m, f = 0) => {
    n.copy(e1.subVectors(b, a).cross(e2.subVectors(c, a))).normalize();
    for (const v of [a, b, c]) { pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); part.push(M[m][0]); col.push(...M[m][1]); fix.push(f); }
  };
  const mat = (m, s) => (typeof m === 'function' ? m(s) : m);
  // a faceted hull through sections [s, yBottom, yWaist, yTop, halfWidthBottom, halfWidthWaist, halfWidthTop].
  // mats: low (sill to waist), up (waist to roof edge), top, under, rear, front — a material name, or a function of s
  const hull = (sts, mats) => {
    const R = sts.map(([s, yb, ym, yt, wb, wm, wt]) => [V(wb, yb, zOf(s)), V(wm, ym, zOf(s)), V(wt, yt, zOf(s)), V(-wt, yt, zOf(s)), V(-wm, ym, zOf(s)), V(-wb, yb, zOf(s))]);
    const names = ['low', 'up', 'top', 'up', 'low', 'under'];
    for (let i = 0; i < R.length - 1; i++) for (let j = 0; j < 6; j++) {
      const j1 = (j + 1) % 6, a = R[i][j], b = R[i][j1], c = R[i + 1][j], d = R[i + 1][j1], m = mat(mats[names[j]] || 'clad', (sts[i][0] + sts[i + 1][0]) / 2);
      if (a.distanceToSquared(b) < 1e-8 && c.distanceToSquared(d) < 1e-8) continue;
      tri(a, c, b, m); tri(b, c, d, m);
    }
    const cap = (r, m, flip) => { const c = V(0, (r[0].y + r[2].y) / 2, r[0].z); for (let j = 0; j < 6; j++) { const a = r[j], b = r[(j + 1) % 6]; if (flip) tri(c, b, a, m); else tri(c, a, b, m); } };
    if (mats.rear) cap(R[0], mat(mats.rear, sts[0][0]), false);
    if (mats.front) cap(R[R.length - 1], mat(mats.front, sts[sts.length - 1][0]), true);
  };
  const merge = (g, m, f = 0) => {
    const g2 = g.index ? g.toNonIndexed() : g, a = g2.getAttribute('position').array, nn = g2.getAttribute('normal').array;
    for (let i = 0; i < a.length; i += 3) { pos.push(a[i], a[i + 1], a[i + 2]); nor.push(nn[i], nn[i + 1], nn[i + 2]); part.push(M[m][0]); col.push(...M[m][1]); fix.push(f); }
  };
  // a box centred at (x, y, s), sizes across, up, along; rz / rx tilt it about its long or its cross axis
  const box = (x, y, s, sx, sy, ss, m, rz = 0, rx = 0) => { const g = new THREE.BoxGeometry(sx, sy, ss); if (rz) g.rotateZ(rz); if (rx) g.rotateX(rx); g.translate(x, y, zOf(s)); merge(g, m); };
  const both = (fn) => { fn(-1); fn(1); };
  // a wheel on each side at s: tyre, a flat cover, optionally a ring of light on it
  const wheels = (s, x, r, w = 0.32, ring = null, cover = 'cover') => both((sx) => {
    const t = new THREE.CylinderGeometry(r, r, w, 14); t.rotateZ(Math.PI / 2); t.translate(sx * x, r, zOf(s)); merge(t, 'tyre', 1);
    const c = new THREE.CylinderGeometry(r * 0.7, r * 0.7, 0.05, 12); c.rotateZ(Math.PI / 2); c.translate(sx * (x + w / 2 + 0.005), r, zOf(s)); merge(c, cover, 1);
    if (ring) { const q = new THREE.TorusGeometry(r * 0.78, 0.028, 5, 18); q.rotateY(Math.PI / 2); q.translate(sx * (x + w / 2 + 0.02), r, zOf(s)); merge(q, ring, 1); }
  });
  const ring = (x, y, s, r, m) => { const q = new THREE.TorusGeometry(r, 0.035, 5, 16); q.translate(x, y, zOf(s)); merge(q, m); };
  const done = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1)); g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aFix', new THREE.Float32BufferAttribute(fix, 1));
    return g;
  };
  return { hull, box, both, wheels, ring, done, L };
}
const within = (s, a, b) => s > a && s < b;

const STYLES = {
  // 02 MONOLITH — saloon: a long slab of a car, flat faces, a light bar the full width at each end, two upright slits behind the front wheel
  monolith() {
    const b = builder(5.0), { hull, box, both, wheels } = b, R = -0.02, F = 5.02;
    hull([[0, 0.36, 0.56, 0.96, 0.9, 0.99, 0.95], [0.14, 0.3, 0.54, 1.0, 0.95, 1.01, 0.97], [4.82, 0.3, 0.54, 0.93, 0.95, 1.01, 0.96], [5.0, 0.38, 0.56, 0.86, 0.88, 0.97, 0.91]],
      { low: 'clad', up: 'body', top: 'body', rear: 'body', front: 'body' });
    hull([[1.0, 0.98, 1.0, 1.02, 0.92, 0.92, 0.88], [1.42, 0.98, 1.0, 1.47, 0.93, 0.93, 0.77], [2.95, 0.98, 1.0, 1.47, 0.93, 0.93, 0.77], [3.62, 0.94, 0.96, 0.98, 0.92, 0.92, 0.86]],
      { up: (s) => (within(s, 2.12, 2.24) ? 'body' : 'glass'), top: (s) => (within(s, 1.42, 2.95) ? 'body' : 'glass') });
    box(0, 0.8, R, 1.8, 0.05, 0.04, 'tail'); box(0, 0.62, R, 1.2, 0.12, 0.03, 'clad'); box(0, 0.4, R, 1.86, 0.14, 0.06, 'clad');
    box(0, 0.74, F, 1.2, 0.3, 0.03, 'clad'); box(0, 0.4, F, 1.84, 0.14, 0.06, 'clad');
    both((sx) => { box(sx * 0.76, 0.8, F, 0.3, 0.045, 0.04, 'head'); box(sx * 0.9, 0.72, F, 0.03, 0.2, 0.04, 'head'); box(sx * 1.012, 0.72, 3.25, 0.02, 0.26, 0.035, 'ice'); box(sx * 1.012, 0.72, 3.35, 0.02, 0.26, 0.035, 'ice'); });
    wheels(0.98, 0.84, 0.36, 0.3); wheels(4.02, 0.84, 0.36, 0.3);
    return b.done();
  },
  // 03 RAZOR — coupe: an open-wheeler, a narrow wedge between four big wheels with rings of light, twin air boxes behind the canopy
  razor() {
    const b = builder(4.4), { hull, box, both, wheels } = b, R = -0.02;
    hull([[0, 0.3, 0.5, 0.74, 0.46, 0.6, 0.48], [0.8, 0.24, 0.5, 0.92, 0.56, 0.7, 0.54], [2.0, 0.22, 0.46, 0.86, 0.52, 0.66, 0.46], [3.3, 0.2, 0.38, 0.58, 0.36, 0.46, 0.32], [4.4, 0.2, 0.28, 0.36, 0.16, 0.26, 0.14]],
      { low: 'clad', up: 'body', top: 'body', rear: 'clad', front: 'body' });
    hull([[1.45, 0.86, 0.88, 0.9, 0.4, 0.4, 0.32], [1.9, 0.86, 0.96, 1.2, 0.44, 0.44, 0.28], [2.45, 0.82, 0.94, 1.16, 0.42, 0.42, 0.26], [3.15, 0.6, 0.62, 0.64, 0.34, 0.34, 0.24]], { up: 'glass', top: 'glass', rear: 'body' });
    both((sx) => { box(sx * 0.24, 1.12, 1.1, 0.34, 0.34, 0.8, 'body'); box(sx * 0.24, 1.14, 1.52, 0.26, 0.22, 0.04, 'clad'); box(sx * 0.72, 0.42, 2.0, 0.3, 0.26, 1.3, 'body'); box(sx * 0.72, 0.56, 2.66, 0.3, 0.02, 0.5, 'clad', 0, 0.5); });
    box(0, 1.34, 0.9, 0.06, 0.3, 0.5, 'body');                                                                          // dorsal fin
    both((sx) => { for (const s of [0.75, 3.55]) { box(sx * 0.62, 0.42, s, 0.56, 0.05, 0.07, 'clad'); box(sx * 0.62, 0.52, s + 0.22, 0.56, 0.04, 0.05, 'clad', sx * 0.12); } });   // suspension arms
    both((sx) => { for (const k of [-1, 0, 1]) box(sx * 0.3 + k * 0.07, 0.56, R, 0.035, 0.2, 0.04, 'tail'); box(sx * 0.24, 0.46, 4.36, 0.14, 0.04, 0.05, 'head'); });
    wheels(0.75, 0.9, 0.44, 0.42, 'orange', 'dark'); wheels(3.55, 0.88, 0.4, 0.34, 'orange', 'dark');
    return b.done();
  },
  // 04 NOMAD — estate: a square-cut off-roader on tall tyres, cargo cases on a roof rack, tail lamps like a pair of brackets
  nomad() {
    const b = builder(4.9), { hull, box, both, wheels } = b, R = -0.02, F = 4.92;
    hull([[0, 0.46, 0.72, 1.12, 0.96, 1.03, 1.0], [0.16, 0.4, 0.7, 1.16, 1.0, 1.05, 1.02], [4.55, 0.4, 0.7, 1.08, 1.0, 1.05, 1.0], [4.9, 0.48, 0.72, 0.98, 0.92, 0.98, 0.94]],
      { low: 'clad', up: 'body', top: 'body', rear: 'body', front: 'clad' });
    hull([[0.1, 1.14, 1.16, 1.6, 1.0, 1.0, 0.9], [0.32, 1.14, 1.16, 1.74, 1.0, 1.0, 0.86], [2.75, 1.14, 1.16, 1.74, 1.0, 1.0, 0.86], [3.5, 1.08, 1.1, 1.12, 0.98, 0.98, 0.9]],
      { up: (s) => (within(s, 0.32, 0.5) || within(s, 1.2, 1.3) || within(s, 2.0, 2.1) ? 'body' : 'glass'), top: (s) => (s < 2.75 ? 'body' : 'glass'), rear: 'glass' });
    both((sx) => { box(sx * 0.8, 1.8, 1.5, 0.05, 0.05, 2.5, 'dark'); for (const s of [0.4, 1.5, 2.6]) box(sx * 0.8, 1.77, s, 0.05, 0.08, 0.05, 'dark'); });   // roof rails
    box(-0.34, 1.93, 0.95, 0.8, 0.22, 0.95, 'grey2'); box(0.38, 1.9, 0.75, 0.56, 0.16, 0.6, 'grey'); box(0.1, 1.92, 2.0, 1.1, 0.2, 0.8, 'grey2'); box(0.1, 2.03, 2.0, 0.9, 0.03, 0.5, 'grey');
    both((sx) => { for (const s of [0.95, 3.85]) box(sx * 1.045, 0.84, s, 0.06, 0.34, 1.2, 'clad'); });               // arch cladding
    both((sx) => { box(sx * 0.82, 0.98, R, 0.04, 0.34, 0.04, 'tail'); box(sx * 0.7, 1.13, R, 0.28, 0.04, 0.04, 'tail'); box(sx * 0.7, 0.83, R, 0.28, 0.04, 0.04, 'tail'); });
    box(0, 0.94, R, 1.1, 0.5, 0.03, 'dark'); box(0, 0.52, R, 2.0, 0.2, 0.1, 'clad');
    both((sx) => { box(sx * 0.66, 0.96, F, 0.5, 0.04, 0.04, 'head'); box(sx * 0.3, 1.74, 3.45, 0.2, 0.03, 0.04, 'ice'); });
    box(0, 0.62, F, 2.0, 0.26, 0.14, 'clad'); box(0, 0.86, F, 0.8, 0.12, 0.04, 'dark');
    wheels(0.95, 0.84, 0.46, 0.36, null, 'dark'); wheels(3.85, 0.84, 0.46, 0.36, null, 'dark');
    return b.done();
  },
  // 05 FIREFLY — taxi: a tall rounded pod, yellow shell round black glass, a lit TAXI sign, two rings of red light at the back
  firefly() {
    const b = builder(3.9), { hull, box, both, wheels, ring } = b, R = -0.03, F = 3.92;
    hull([[0, 0.55, 0.92, 1.28, 0.6, 0.8, 0.54], [0.2, 0.38, 0.95, 1.62, 0.84, 0.97, 0.68], [0.8, 0.3, 1.0, 1.84, 0.92, 1.02, 0.74], [1.95, 0.3, 1.0, 1.9, 0.92, 1.02, 0.74],
      [3.0, 0.3, 1.0, 1.82, 0.92, 1.02, 0.72], [3.6, 0.36, 0.92, 1.5, 0.84, 0.95, 0.6], [3.9, 0.52, 0.86, 1.16, 0.56, 0.72, 0.44]],
      { low: 'yellow', up: (s) => (within(s, 0.8, 3.0) ? 'glass' : s < 0.8 ? 'black' : 'glass'), top: (s) => (within(s, 0.8, 3.0) ? 'yellow' : s < 0.8 ? 'black' : 'glass'), rear: 'black', front: 'black' });
    both((sx) => { box(sx * 0.885, 1.44, 0.86, 0.06, 0.94, 0.12, 'yellow', sx * 0.3); box(sx * 0.885, 1.44, 2.95, 0.06, 0.94, 0.12, 'yellow', sx * 0.3); box(sx * 0.89, 1.44, 1.9, 0.03, 0.94, 0.05, 'black', sx * 0.3); });   // door posts, leaning in with the glass
    both((sx) => { ring(sx * 0.36, 0.98, -0.04, 0.13, 'tail'); box(sx * 0.5, 0.86, F - 0.16, 0.34, 0.04, 0.05, 'head'); for (const k of [0, 1, 2]) box(sx * 1.03, 1.06, 1.5 + k * 0.14, 0.02, 0.1, 0.05, 'amber', 0, sx * 0.6); box(sx * 1.03, 1.06, 1.3, 0.02, 0.03, 0.22, 'amber'); });
    box(0, 0.62, R + 0.12, 1.3, 0.2, 0.1, 'yellow'); box(0, 0.5, F - 0.1, 1.2, 0.18, 0.1, 'yellow');
    box(0, 1.94, 1.95, 0.62, 0.05, 0.3, 'black'); box(-0.15, 2.06, 1.95, 0.3, 0.2, 0.2, 'signL'); box(0.15, 2.06, 1.95, 0.3, 0.2, 0.2, 'signR');
    wheels(0.78, 0.82, 0.34, 0.28); wheels(3.1, 0.82, 0.34, 0.28);
    return b.done();
  },
  // 06 WARDEN — police: an armoured cruiser, black with white doors, a red and blue light bar, a push bumper with hazard stripes
  warden() {
    const b = builder(5.0), { hull, box, both, wheels } = b, R = -0.02, F = 5.02;
    const livery = (s) => (within(s, 1.0, 3.35) ? 'white' : 'navy');
    hull([[0, 0.44, 0.72, 1.08, 0.96, 1.04, 1.0], [0.2, 0.36, 0.7, 1.12, 1.02, 1.08, 1.02], [3.3, 0.36, 0.7, 1.1, 1.02, 1.08, 1.02], [4.5, 0.38, 0.7, 0.96, 1.0, 1.06, 0.98], [5.0, 0.48, 0.7, 0.84, 0.9, 0.96, 0.88]],
      { low: 'clad', up: livery, top: 'navy', rear: 'navy', front: 'navy' });
    hull([[0.95, 1.1, 1.12, 1.14, 0.98, 0.98, 0.9], [1.5, 1.1, 1.12, 1.56, 0.99, 0.99, 0.78], [2.95, 1.1, 1.12, 1.56, 0.99, 0.99, 0.78], [3.75, 1.06, 1.08, 1.1, 0.96, 0.96, 0.86]],
      { up: (s) => (within(s, 2.15, 2.3) ? 'white' : 'glass'), top: (s) => (within(s, 1.5, 2.95) ? 'white' : 'glass') });
    box(0, 1.6, 2.3, 1.3, 0.06, 0.34, 'clad'); box(-0.36, 1.7, 2.3, 0.56, 0.15, 0.3, 'red'); box(0.36, 1.7, 2.3, 0.56, 0.15, 0.3, 'blue');
    both((sx) => { for (const s of [0.95, 4.0]) { box(sx * 1.075, 0.9, s, 0.07, 0.36, 1.25, 'clad'); box(sx * 1.08, 0.66, s, 0.05, 0.3, 0.7, 'grey'); } });   // arch armour
    both((sx) => { box(sx * 0.66, 0.92, R, 0.42, 0.16, 0.04, 'tail'); box(sx * 0.6, 0.92, F, 0.4, 0.06, 0.04, 'head'); box(sx * 0.6, 0.82, F, 0.4, 0.03, 0.04, 'ice'); });
    box(0, 0.92, R, 0.66, 0.2, 0.03, 'white'); box(0, 0.52, R, 2.0, 0.22, 0.1, 'clad');
    box(0, 0.6, F + 0.1, 1.5, 0.34, 0.16, 'clad'); both((sx) => { box(sx * 0.5, 0.66, F + 0.2, 0.14, 0.5, 0.1, 'grey'); for (const k of [0, 1, 2]) box(sx * (0.26 + k * 0.22), 0.4, F + 0.2, 0.1, 0.1, 0.06, k % 2 ? 'black' : 'hazard'); });
    wheels(0.95, 0.86, 0.42, 0.34, null, 'dark'); wheels(4.0, 0.86, 0.42, 0.34, null, 'dark');
    return b.done();
  },
  // 07 RELAY — van: a dark wedge of a cab carrying a pale faceted cargo pod, a sensor mast, an arch of red light round the rear doors
  relay() {
    const b = builder(5.4), { hull, box, both, wheels } = b, R = -0.02, F = 5.42;
    hull([[0, 0.34, 0.56, 0.8, 0.98, 1.08, 1.04], [5.0, 0.34, 0.56, 0.8, 0.98, 1.08, 1.04], [5.4, 0.42, 0.6, 0.78, 0.9, 0.98, 0.94]], { low: 'clad', up: 'dark', top: 'dark', rear: 'clad', front: 'clad' });
    hull([[3.3, 0.8, 1.2, 1.74, 1.04, 1.06, 0.9], [4.2, 0.8, 1.2, 1.78, 1.04, 1.06, 0.88], [4.92, 0.8, 1.14, 1.28, 1.02, 1.04, 0.9], [5.38, 0.78, 0.94, 0.98, 0.94, 0.96, 0.9]],
      { low: 'grey', up: (s) => (within(s, 3.6, 4.92) ? 'glass' : 'grey'), top: (s) => (within(s, 4.2, 4.92) ? 'glass' : 'grey'), rear: 'grey', front: 'grey' });
    hull([[0.04, 0.82, 1.5, 2.04, 0.98, 1.1, 0.8], [0.32, 0.8, 1.5, 2.22, 1.04, 1.14, 0.86], [3.0, 0.8, 1.5, 2.22, 1.04, 1.14, 0.86], [3.28, 0.82, 1.5, 2.02, 0.98, 1.08, 0.78]],
      { low: 'beige', up: 'beige', top: 'beige', rear: 'beige', front: 'beige' });
    box(0, 1.34, R, 1.1, 1.0, 0.04, 'dark'); box(0, 1.34, R - 0.01, 0.03, 1.0, 0.04, 'clad');
    both((sx) => { box(sx * 0.6, 1.36, R - 0.02, 0.05, 1.04, 0.04, 'tail'); box(sx * 1.12, 1.3, 1.2, 0.02, 0.14, 0.08, 'cyan'); box(sx * 0.5, 0.5, R, 0.16, 0.04, 0.04, 'cyan'); box(sx * 0.62, 0.92, F, 0.3, 0.1, 0.04, 'head'); });
    box(0, 1.9, R - 0.02, 1.24, 0.05, 0.04, 'tail');
    box(-0.5, 2.02, 4.0, 0.06, 0.5, 0.06, 'clad'); box(-0.5, 2.3, 4.0, 0.3, 0.12, 0.16, 'grey'); box(-0.5, 2.3, 4.09, 0.2, 0.05, 0.02, 'cyan');
    both((sx) => { for (const s of [1.05, 4.3]) box(sx * 1.085, 0.72, s, 0.06, 0.4, 1.2, 'clad'); });
    wheels(1.05, 0.86, 0.4, 0.34, null, 'dark'); wheels(4.3, 0.86, 0.4, 0.34, null, 'dark');
    return b.done();
  },
  // 08 MULE — pickup: a six-wheel utility truck, dark cab, an orange tube frame over the bed and a bull bar to match
  mule() {
    const b = builder(5.6), { hull, box, both, wheels } = b, R = -0.02, F = 5.62;
    hull([[0, 0.5, 0.72, 0.96, 0.98, 1.06, 1.04], [5.2, 0.5, 0.72, 0.96, 0.98, 1.06, 1.04], [5.6, 0.56, 0.74, 0.9, 0.9, 0.96, 0.92]], { low: 'clad', up: 'dark', top: 'dark', rear: 'dark', front: 'clad' });
    hull([[2.9, 0.95, 1.3, 1.8, 1.04, 1.06, 0.9], [3.9, 0.95, 1.3, 1.84, 1.04, 1.06, 0.88], [4.7, 0.95, 1.26, 1.36, 1.02, 1.04, 0.9], [5.42, 0.93, 1.06, 1.1, 0.94, 0.96, 0.9]],
      { low: 'grey', up: (s) => (within(s, 3.2, 4.7) ? 'glass' : 'grey'), top: (s) => (within(s, 3.9, 4.7) ? 'glass' : 'grey'), rear: 'grey', front: 'grey' });
    box(0, 1.2, 2.6, 1.5, 0.5, 0.5, 'grey2'); box(0.5, 1.56, 2.6, 0.12, 0.3, 0.12, 'frame');                             // tool box and stack behind the cab
    both((sx) => { box(sx * 0.98, 1.5, 1.3, 0.07, 0.07, 2.5, 'frame'); box(sx * 0.98, 1.24, 1.3, 0.05, 0.05, 2.5, 'frame'); for (const s of [0.08, 0.9, 1.7, 2.5]) box(sx * 0.98, 1.24, s, 0.07, 0.56, 0.07, 'frame'); });
    for (const s of [0.08, 2.5]) box(0, 1.5, s, 2.0, 0.07, 0.07, 'frame');
    both((sx) => { box(sx * 0.84, 0.96, R, 0.04, 0.3, 0.04, 'tail'); box(sx * 0.74, 1.09, R, 0.24, 0.04, 0.04, 'tail'); box(sx * 0.74, 0.83, R, 0.24, 0.04, 0.04, 'tail'); });
    box(0, 0.92, R, 1.3, 0.4, 0.03, 'clad');
    both((sx) => { box(sx * 0.62, 1.0, F, 0.3, 0.14, 0.04, 'head'); box(sx * 0.5, 0.86, F + 0.14, 0.08, 0.6, 0.08, 'frame'); box(sx * 0.5, 1.86, 3.9, 0.2, 0.05, 0.06, 'amber'); box(sx * 1.07, 1.1, 5.0, 0.02, 0.06, 0.12, 'amber'); });
    for (const y of [0.62, 0.9, 1.14]) box(0, y, F + 0.14, 1.4, 0.08, 0.08, 'frame');
    wheels(0.7, 0.86, 0.46, 0.36, null, 'dark'); wheels(1.72, 0.86, 0.46, 0.36, null, 'dark'); wheels(4.6, 0.86, 0.46, 0.36, null, 'dark');
    return b.done();
  },
  // 09 LEVIATHAN — truck: an angular cab with a visor of cyan light, a dark container in banded segments, two slashes of red at the back
  leviathan() {
    const b = builder(12.2), { hull, box, both, wheels } = b, R = -0.02, F = 12.22;
    hull([[0, 0.6, 0.8, 1.0, 1.1, 1.2, 1.2], [11.8, 0.6, 0.8, 1.0, 1.1, 1.2, 1.2], [12.2, 0.66, 0.84, 0.98, 1.0, 1.1, 1.08]], { low: 'clad', up: 'clad', top: 'clad', rear: 'clad', front: 'clad' });
    hull([[0.05, 0.96, 2.3, 3.5, 1.26, 1.3, 1.2], [9.0, 0.96, 2.3, 3.5, 1.26, 1.3, 1.2]], { low: 'grey', up: 'grey', top: 'grey', rear: 'grey', front: 'grey' });
    for (const s of [0.3, 2.45, 4.6, 6.75, 8.75]) hull([[s - 0.2, 0.92, 2.3, 3.56, 1.31, 1.35, 1.25], [s + 0.2, 0.92, 2.3, 3.56, 1.31, 1.35, 1.25]], { low: 'grey2', up: 'grey2', top: 'grey2', rear: 'grey2', front: 'grey2' });
    hull([[9.25, 0.96, 2.0, 3.3, 1.25, 1.3, 1.1], [10.6, 0.96, 2.0, 3.3, 1.25, 1.3, 1.08], [11.5, 0.96, 1.9, 2.2, 1.24, 1.28, 1.1], [12.18, 0.92, 1.3, 1.42, 1.1, 1.16, 1.1]],
      { low: 'grey', up: (s) => (within(s, 10.6, 11.5) ? 'glass' : 'grey'), top: (s) => (within(s, 10.6, 11.5) ? 'glass' : 'grey'), rear: 'grey', front: 'grey' });
    box(0, 2.82, 11.0, 2.0, 0.06, 0.06, 'cyan', 0, 0.8);                                                                 // the visor
    both((sx) => { box(sx * 0.62, 1.5, R, 0.06, 0.62, 0.04, 'tail', sx * 0.7); box(sx * 1.1, 3.4, R, 0.16, 0.08, 0.04, 'amber'); box(sx * 0.86, 1.14, F, 0.3, 0.08, 0.04, 'head'); });
    box(0, 2.2, R, 0.04, 2.3, 0.03, 'clad'); box(0, 0.76, R, 2.3, 0.2, 0.08, 'clad');
    both((sx) => { for (const s of [3.0, 6.0, 8.6]) box(sx * 1.31, 1.2, s, 0.02, 0.12, 0.06, 'cyan'); for (const s of [1.6, 4.6, 7.4]) box(sx * 1.21, 0.86, s, 0.02, 0.05, 0.3, 'amber'); });
    for (const s of [0.9, 1.95, 3.0, 9.4, 10.4, 11.5]) wheels(s, 0.98, 0.5, 0.4, null, 'dark');
    return b.done();
  },
  // 10 ORBIT — coach: one long smooth volume, a band of dark glass its whole length, lamps stacked up each rear corner
  orbit() {
    const b = builder(12.2), { hull, box, both, wheels } = b, R = -0.02, F = 12.2;
    hull([[0, 0.56, 1.25, 2.9, 1.08, 1.26, 1.02], [0.45, 0.44, 1.25, 3.2, 1.22, 1.3, 1.1], [10.3, 0.44, 1.25, 3.2, 1.22, 1.3, 1.1], [11.5, 0.44, 1.2, 2.6, 1.2, 1.28, 1.0], [12.2, 0.56, 1.0, 1.5, 0.98, 1.1, 0.84]],
      { low: 'body', up: (s) => (within(s, 0.9, 12.2) ? 'glass' : 'body'), top: (s) => (s > 10.3 ? 'glass' : 'body'), rear: 'body', front: 'body' });
    both((sx) => { for (const s of [2.6, 4.5, 6.4, 8.3]) box(sx * 1.2, 2.2, s, 0.03, 1.9, 0.07, 'clad', sx * -0.05); });   // window pillars
    box(0, 2.35, R, 1.7, 0.9, 0.04, 'glass');
    both((sx) => { for (const k of [0, 1, 2]) box(sx * 0.92, 1.1 + k * 0.26, R, 0.12, 0.2, 0.04, 'tail'); box(sx * 0.62, 0.9, F - 0.1, 0.4, 0.07, 0.06, 'head'); for (const s of [2.2, 4.4, 6.6, 8.8]) box(sx * 1.24, 0.56, s, 0.02, 0.04, 0.4, 'violet'); });
    for (const s of [1.5, 2.5, 10.0]) wheels(s, 1.0, 0.5, 0.38);
    return b.done();
  },
};
export const VEHICLE_STYLES = Object.keys(STYLES);

// what a glossy surface reflects: the sky above, the lit road below, the band of light on the horizon, the sun
export const ENV_GLSL = /* glsl */`
      vec3 env(vec3 R){
        float y = R.y;
        vec3 c = y > 0.0 ? mix(cSky * 1.1, cTop, smoothstep(0.05, 0.7, y)) : mix(cHor * 0.25, cGrid * 0.12, smoothstep(-0.02, -0.5, y));
        c += cHor * exp(-abs(y) / 0.04) * 1.1;
        c += cSun * exp(-pow((R.z + 0.98) / 0.08, 2.0)) * exp(-pow((y - 0.07) / 0.1, 2.0)) * 1.4;
        return c;
      }`;

const MAX = 40;
function makeStyle(style, uniforms) {
  const base = STYLES[style]();
  const g = new THREE.InstancedBufferGeometry();
  for (const k of ['position', 'normal', 'aPart', 'aCol', 'aFix']) g.setAttribute(k, base.getAttribute(k));
  const A = {};
  for (const [n, k] of [['aP', 3], ['aS', 4], ['aC', 3], ['aL', 4], ['aR', 2]]) { A[n] = new THREE.InstancedBufferAttribute(new Float32Array(MAX * k), k); A[n].setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, A[n]); }
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      attribute float aPart, aFix; attribute vec3 aP, aC, aCol; attribute vec4 aS, aL; attribute vec2 aR;   // aS: heading, scale, fade, – · aL: tail, roof left, roof right, brake · aR: roll, pitch
      varying vec3 vN, vW, vC, vL; varying float vPart, vFade; varying vec4 vLi;
      vec3 lean(vec3 q){                                                   // roll about the vehicle's long axis, then pitch about the axle line
        float cr = cos(aR.x), sr = sin(aR.x), cp = cos(aR.y), sp = sin(aR.y);
        q = vec3(q.x * cr - q.y * sr, q.x * sr + q.y * cr, q.z);
        return vec3(q.x, q.y * cp - q.z * sp, q.y * sp + q.z * cp);
      }
      void main(){
        vec3 p = position, n = normal;
        vL = p;
        if (aFix < 0.5) { p = lean(p - vec3(0.0, 0.4, 0.0)) + vec3(0.0, 0.4, 0.0); n = lean(n); }   // the body moves on its springs; the wheels stay on the road
        float c = cos(aS.x), s = sin(aS.x);
        mat3 R = mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
        vec3 w = aP + R * (p * aS.y); vW = w; vN = R * n; vPart = aPart; vFade = aS.z; vLi = aL;
        vC = aPart > 8.5 ? aC : aCol;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec3 cSky, cTop, cHor, cSun, cGrid, cFog;
      varying vec3 vN, vW, vC, vL; varying float vPart, vFade; varying vec4 vLi;
      ${ENV_GLSL}
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW), R = reflect(-V, N);
        float nv = max(dot(N, V), 0.0), fr = 0.04 + 0.96 * pow(1.0 - nv, 5.0), dist = length(vW - cameraPosition), rim = pow(1.0 - nv, 3.0);
        float far = mix(1.0, 0.4, smoothstep(60.0, 200.0, dist));
        vec3 col;
        if (vPart < 0.5 || vPart > 8.5) {       // paint: satin, each facet lit by the sky above, the road below and the glow on the horizon
          float light = 0.3 + 0.5 * max(N.y, 0.0) + 0.14 * max(N.z, 0.0) + 0.1 * abs(N.x);
          col = vC * light * mix(0.7, 1.0, smoothstep(0.2, 0.9, vL.y)) + env(R) * (0.03 + 0.4 * fr);
          col += cGrid * vC * 0.25 * max(-N.y, 0.0) + (cHor * 0.35 + vC * 0.25) * rim * 0.5;
        } else if (vPart < 1.5) col = vec3(0.012, 0.014, 0.03) + cSky * 0.22 + env(R) * (0.08 + 0.9 * fr) + cHor * rim * 0.2;     // glass: black, reflecting the sky
        else if (vPart < 2.5) col = vec3(2.2, 0.08, 0.16) * (0.6 + 1.3 * vLi.w) * vLi.x * far;                                    // tail lamps (a soft sprite takes over far away)
        else if (vPart < 3.5) col = vC * (0.5 + 0.5 * max(N.y, 0.0)) + env(R) * 0.05 + cHor * rim * 0.07;                          // dark cladding, tyres
        else if (vPart < 5.5) col = vC * 3.4 * (vPart < 4.5 ? vLi.y : vLi.z) + vC * 0.05;                                         // roof lights: the police bar, the taxi sign
        else if (vPart < 6.5) col = vec3(1.2, 1.5, 1.75) * far;                                                                   // head lamps: cold white
        else if (vPart < 7.5) col = vC * (0.5 + 0.5 * max(N.y, 0.0)) + env(R) * 0.35 + cHor * rim * 0.2;                           // wheel covers
        else col = vC * 2.0 * mix(1.0, 0.6, smoothstep(80.0, 260.0, dist));                                                       // marker lights
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
    this.u = { cSky: { value: new THREE.Vector3() }, cTop: { value: new THREE.Vector3() }, cHor: { value: new THREE.Vector3() }, cSun: { value: new THREE.Vector3() }, cGrid: { value: new THREE.Vector3() }, cFog: { value: new THREE.Vector3() }, uT: { value: 0 } };
    this.group = new THREE.Group();
    this.m = {};
    for (const k of VEHICLE_STYLES) { this.m[k] = makeStyle(k, this.u); this.group.add(this.m[k]); }
  }
  begin(P, T = 0) {
    const u = this.u; u.uT.value = T;
    u.cSky.value.set(...P.skyMid); u.cTop.value.set(...P.skyTop); u.cHor.value.set(...P.horizon); u.cSun.value.set(...P.sunMid); u.cGrid.value.set(...P.grid); u.cFog.value.set(...P.fog);
    for (const k in this.m) this.m[k].userData.n = 0;
  }
  // style: one of VEHICLE_STYLES · col: body colour (monolith, razor, nomad, orbit) · tail / roofL / roofR: light levels · brake: 0..1
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
