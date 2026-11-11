// Vehicle bodies for traffic and the police (saloon, coupe, estate, van, pickup, coach, truck cab). Each body style is ONE lofted shell — rings of a cross-section from
// the rear bumper to the nose, with the glasshouse as part of the same surface — plus wheels, lamps, mirrors and a
// roof bar, merged into one geometry and drawn instanced. The look is night-city: dark mirror-like metal, each vehicle
// edged in one neon colour (two lines of light down each side, a strip between the head lamps, rings of light for wheels).
// Every face carries a part id (paint, glass, lamp …), so windows, pillars and the roof are real panels of the body.
// Per instance: position, heading, lean and dive of the body on its springs, scale, paint colour, fade, livery,
// and the state of its lights. The wheels stay on the road and their hubs show turning spokes.
import * as THREE from '../vendor/three.module.min.js';

const lerp = (a, b, t) => a + (b - a) * t, sat = (x) => Math.max(0, Math.min(1, x));
const pl = (keys, x) => { if (x <= keys[0][0]) return keys[0][1]; for (let i = 1; i < keys.length; i++) if (x <= keys[i][0]) { const [a, va] = keys[i - 1], [b, vb] = keys[i]; return va + (vb - va) * (x - a) / (b - a); } return keys[keys.length - 1][1]; };
const inAny = (ranges, x) => ranges.some(([a, b]) => x >= a && x <= b);

// parts: 0 paint · 1 glass · 2 tail lamp · 3 dark trim, tyres · 4, 5 roof bar left / right · 6 head lamp · 7 wheel hub · 8 neon line
// s runs from the rear bumper (0) to the nose (L).
//  hw(s)   half width
//  belt    beltline height along s (the top of the doors, bonnet and boot)
//  roof    height of the glasshouse above the beltline along s (0 = none)
//  inset   how far the roof edge leans in from the beltline (tumblehome)
//  side    s ranges of the side windows · screen: s ranges where the sloping roof is glass (windscreen, rear window)
const STYLES = {
  car: {   // a four-door saloon: the size of the player's car, a touch taller
    L: 4.7, bot: 0.25, inset: 0.2, wheel: [0.34, [0.86, 3.72]],
    hw: (s) => 1.0 - 0.08 * Math.max(0, (s - 4.05) / 0.65) ** 1.6 - 0.05 * Math.max(0, (0.25 - s) / 0.25) ** 1.4,
    belt: [[0, 0.8], [0.1, 0.9], [1.0, 0.92], [3.2, 0.89], [4.2, 0.8], [4.62, 0.7], [4.7, 0.62]],
    roof: [[0.72, 0], [1.42, 0.45], [2.5, 0.47], [3.28, 0]],
    side: [[1.14, 1.93], [2.03, 2.9]], screen: [[0.72, 1.42], [2.5, 3.28]], tail: 'bar', mirror: 2.95,
  },
  van: {   // a tall panel van: windows for the cab only
    L: 5.3, bot: 0.28, inset: 0.07, wheel: [0.36, [0.95, 4.2]],
    hw: (s) => 1.1 - 0.07 * Math.max(0, (s - 4.6) / 0.7) ** 1.5 - 0.03 * Math.max(0, (0.15 - s) / 0.15),
    belt: [[0, 1.08], [0.08, 1.15], [4.3, 1.15], [4.8, 1.06], [5.2, 0.96], [5.3, 0.84]],
    roof: [[0, 0.82], [0.14, 0.9], [3.85, 0.9], [4.52, 0]],
    side: [[3.1, 3.82]], screen: [[3.85, 4.52]], tail: 'posts', mirror: 3.9, doors: true,
  },
  coupe: {   // a low two-door fastback
    L: 4.5, bot: 0.22, inset: 0.24, wheel: [0.34, [0.82, 3.55]],
    hw: (s) => 1.0 - 0.1 * Math.max(0, (s - 3.8) / 0.7) ** 1.6 - 0.06 * Math.max(0, (0.3 - s) / 0.3) ** 1.4,
    belt: [[0, 0.72], [0.1, 0.82], [1.0, 0.85], [3.0, 0.8], [4.0, 0.7], [4.42, 0.62], [4.5, 0.56]],
    roof: [[0.4, 0], [1.6, 0.36], [2.3, 0.38], [3.1, 0]],
    side: [[1.45, 2.25]], screen: [[0.4, 1.6], [2.3, 3.1]], tail: 'bar', mirror: 2.75,
  },
  suv: {   // a tall estate: the roof runs all the way back
    L: 4.8, bot: 0.34, inset: 0.1, wheel: [0.4, [0.9, 3.85]],
    hw: (s) => 1.05 - 0.07 * Math.max(0, (s - 4.2) / 0.6) ** 1.6 - 0.03 * Math.max(0, (0.15 - s) / 0.15),
    belt: [[0, 1.0], [0.08, 1.08], [3.3, 1.05], [4.3, 0.98], [4.72, 0.86], [4.8, 0.76]],
    roof: [[0, 0.56], [0.25, 0.68], [2.6, 0.7], [3.4, 0]],
    side: [[0.45, 1.2], [1.32, 2.0], [2.12, 2.6]], screen: [[2.6, 3.4]], tail: 'posts', mirror: 3.05, doors: false, hatch: true,
  },
  pickup: {   // a pickup truck: a cab in the middle, a covered bed behind it
    L: 5.4, bot: 0.34, inset: 0.08, wheel: [0.4, [1.0, 4.35]],
    hw: (s) => 1.08 - 0.07 * Math.max(0, (s - 4.7) / 0.7) ** 1.5 - 0.03 * Math.max(0, (0.15 - s) / 0.15),
    belt: [[0, 0.98], [0.08, 1.05], [4.0, 1.04], [4.9, 0.98], [5.32, 0.86], [5.4, 0.76]],
    roof: [[2.0, 0], [2.28, 0.6], [3.3, 0.64], [3.95, 0]],
    side: [[2.42, 3.25]], screen: [[2.0, 2.28], [3.3, 3.95]], tail: 'bar', mirror: 3.35,
  },
  bus: {   // a coach, as long as a truck and trailer
    L: 12.0, bot: 0.42, inset: 0.05, wheel: [0.5, [2.0, 9.7]],
    hw: (s) => 1.3 - 0.06 * Math.max(0, (s - 11.5) / 0.5) ** 1.5 - 0.03 * Math.max(0, (0.15 - s) / 0.15),
    belt: [[0, 1.3], [11.6, 1.3], [12.0, 1.2]],
    roof: [[0, 1.66], [0.25, 1.8], [11.4, 1.8], [11.95, 0.06]],
    side: [[0.6, 1.9], [2.1, 3.4], [3.6, 4.9], [5.1, 6.4], [6.6, 7.9], [8.1, 9.4], [9.6, 10.9]], screen: [[11.4, 11.95]], tail: 'posts', mirror: 11.3, hatch: true, nose: true,
  },
  cab: {   // a cab-over truck tractor (the trailer is drawn separately)
    L: 3.2, bot: 0.5, inset: 0.05, wheel: [0.5, [0.7, 2.5]],
    hw: (s) => 1.3 - 0.05 * Math.max(0, (s - 2.8) / 0.4) ** 1.5,
    belt: [[0, 1.8], [2.9, 1.8], [3.2, 1.7]],
    roof: [[0, 1.3], [2.62, 1.3], [3.14, 0.02]],
    side: [[1.9, 2.56]], screen: [[2.62, 3.14]], tail: 'none', mirror: 2.6, grille: true,
  },
};

function shell(st) {
  const { L } = st, zOf = (s) => L / 2 - s, pos = [], nor = [], part = [], wheels = [];
  // stations: an even grid plus every key of the outline, so panel edges fall on rings
  const stations = [];
  for (let i = 0; i <= 24; i++) stations.push(L * i / 24);
  for (const k of [...st.belt, ...st.roof]) stations.push(k[0]);
  for (const r of [...st.side, ...st.screen]) stations.push(r[0], r[1]);
  stations.sort((a, b) => a - b);
  const S = stations.filter((s, i) => s >= 0 && s <= L && (i === 0 || s - stations[i - 1] > 0.035));
  const roofH = (s) => (s < st.roof[0][0] || s > st.roof[st.roof.length - 1][0] ? 0 : pl(st.roof, s));
  // the cross-section at s, as a closed loop: bottom centre → right side → top centre → left side
  const HALF = 7;
  const ring = (s) => {
    const hw = st.hw(s), b = st.bot, belt = pl(st.belt, s), h = roofH(s), k = sat(h / 0.18);
    const half = [
      [hw - 0.16, b], [hw - 0.02, b + 0.08], [hw, b + 0.22], [hw, belt - 0.07], [hw - 0.06, belt],
      [hw - 0.06 - st.inset * k, belt + h * 0.84], [hw - 0.06 - (st.inset + 0.15) * k, belt + h],
    ];
    const r = [[0, b], ...half, [0, belt + h + 0.02 * (1 + k)]];
    for (let i = HALF - 1; i >= 0; i--) r.push([-half[i][0], half[i][1]]);
    return r.map(([x, y]) => new THREE.Vector3(x, y, zOf(s)));
  };
  const rings = S.map(ring), M = rings[0].length;
  // smooth normals on the ring grid (face normals summed at each grid point)
  const N = rings.map((r) => r.map(() => new THREE.Vector3()));
  const fn = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < M; j++) {
    const j1 = (j + 1) % M, a = rings[i][j], b = rings[i][j1], c = rings[i + 1][j], d = rings[i + 1][j1];
    fn.copy(e1.subVectors(c, a).cross(e2.subVectors(b, a))).add(e1.subVectors(b, d).cross(e2.subVectors(c, d)));
    for (const n of [N[i][j], N[i][j1], N[i + 1][j], N[i + 1][j1]]) n.add(fn);
  }
  for (const r of N) for (const n of r) n.normalize();
  // which panel is strip k (0 underside … 4 shoulder, 5 glasshouse side, 6 roof edge, 7 roof) between two rings?
  const panel = (k, s) => {
    if (k === 0) return 3;
    if (k === 2 || k === 4) return 8;                        // two lines of light run the length of the body: along the sill and along the shoulder
    const glass = roofH(s) > 0.16;
    if (k === 5) return glass && inAny(st.side, s) ? 1 : 0;
    if (k >= 6) return roofH(s) > 0.05 && inAny(st.screen, s) ? 1 : 0;
    return 0;
  };
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < M; j++) {
    const j1 = (j + 1) % M, k = j <= HALF ? j : M - 1 - j, p = panel(k, (S[i] + S[i + 1]) / 2);
    for (const [ri, rj] of [[i, j], [i + 1, j], [i, j1], [i, j1], [i + 1, j], [i + 1, j1]]) { const v = rings[ri][rj], n = N[ri][rj]; pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); part.push(p); }
  }
  for (const [idx, nz] of [[0, 1], [rings.length - 1, -1]]) {                 // flat end faces
    const r = rings[idx], c = new THREE.Vector3(0, (st.bot + r[HALF + 1].y) / 2, r[0].z);
    for (let j = 0; j < M; j++) { const a = r[j], b = r[(j + 1) % M]; for (const v of nz > 0 ? [c, a, b] : [c, b, a]) { pos.push(v.x, v.y, v.z); nor.push(0, 0, nz); part.push(0); } }
  }
  const merge = (g, x, y, z, p, wr = 0) => {                                  // wr: the radius of the wheel this is part of
    const g2 = g.index ? g.toNonIndexed() : g, a = g2.getAttribute('position').array, n = g2.getAttribute('normal').array;
    if (wr) wheels.push([pos.length / 3, a.length / 3, z, y, wr]);
    for (let i = 0; i < a.length; i += 3) { pos.push(a[i] + x, a[i + 1] + y, a[i + 2] + z); nor.push(n[i], n[i + 1], n[i + 2]); part.push(p); }
  };
  const box = (x, y, z, sx, sy, sz, p) => merge(new THREE.BoxGeometry(sx, sy, sz), x, y, z, p);
  // wheels: tyre and hub
  const [wr, ws] = st.wheel;
  for (const s of ws) for (const sx of [-1, 1]) {
    const wx = st.hw(s) - 0.12;
    const tyre = new THREE.CylinderGeometry(wr, wr, 0.3, 18); tyre.rotateZ(Math.PI / 2); merge(tyre, sx * wx, wr, zOf(s), 3, wr);
    const hub = new THREE.CylinderGeometry(wr * 0.62, wr * 0.62, 0.04, 16); hub.rotateZ(Math.PI / 2); merge(hub, sx * (wx + 0.15), wr, zOf(s), 7, wr);
  }
  const rz = L / 2, fz = -L / 2, hw0 = st.hw(0.05), hwL = st.hw(L), beltR = pl(st.belt, 0), beltF = pl(st.belt, L);
  // rear: lamps, bumper, number plate recess
  if (st.tail === 'bar') { box(0, beltR - 0.14, rz + 0.012, hw0 * 1.78, 0.1, 0.04, 2); box(0, st.bot + 0.11, rz + 0.01, hw0 * 1.86, 0.16, 0.08, 3); box(0, beltR - 0.36, rz + 0.008, 0.52, 0.14, 0.03, 3); }
  else if (st.tail === 'posts') { for (const sx of [-1, 1]) box(sx * (hw0 - 0.1), beltR + 0.13, rz + 0.012, 0.15, 0.72, 0.04, 2); box(0, st.bot + 0.13, rz + 0.01, hw0 * 1.9, 0.18, 0.08, 3); }
  if (st.doors) { box(0, 1.12, rz + 0.006, 0.035, 1.45, 0.02, 3); for (const sx of [-1, 1]) box(sx * 0.5, 1.72, rz + 0.008, 0.72, 0.4, 0.02, 1); }   // van: two rear doors with windows
  if (st.hatch) box(0, beltR + roofH(0.1) * 0.55, rz + 0.008, hw0 * 1.5, roofH(0.1) * 0.6, 0.02, 1);                                                // estate, coach: one rear window
  // the tail is edged in the car's neon too: a line under the lamps and an upright at each corner
  if (st.tail !== 'none') { box(0, st.bot + 0.27, rz + 0.014, hw0 * 1.7, 0.03, 0.03, 8); for (const sx of [-1, 1]) box(sx * (hw0 - 0.03), (st.bot + beltR) / 2 + 0.1, rz + 0.014, 0.03, (beltR - st.bot) * 0.45, 0.03, 8); }
  if (st.nose) box(0, beltF + roofH(L - 0.7) * 0.5, fz - 0.01, hwL * 1.7, roofH(L - 0.7) * 0.62, 0.02, 1);            // coach: an upright windscreen
  // front: head lamps, grille, bumper
  const hy = st.grille ? 0.88 : lerp(st.bot, beltF, 0.68);
  for (const sx of [-1, 1]) box(sx * (hwL - 0.3), hy, fz - 0.012, 0.4, st.grille ? 0.16 : 0.1, 0.04, 6);
  box(0, st.bot + 0.1, fz - 0.01, hwL * 1.9, 0.16, 0.08, 3);
  if (st.grille) { box(0, 1.22, fz - 0.008, hwL * 1.3, 0.62, 0.03, 3); for (let k = 0; k < 4; k++) box(0, 1.0 + k * 0.15, fz - 0.02, hwL * 1.24, 0.03, 0.02, 7); }
  else { box(0, hy, fz - 0.008, (hwL - 0.55) * 2, 0.09, 0.03, 3); box(0, hy, fz - 0.014, (hwL - 0.6) * 2, 0.025, 0.02, 8); }   // a light strip between the head lamps
  // door mirrors
  for (const sx of [-1, 1]) box(sx * (st.hw(st.mirror) + 0.07), pl(st.belt, st.mirror) + 0.1, zOf(st.mirror), 0.17, 0.1, 0.1, st.grille ? 3 : 0);
  // roof bar: left and right halves (taxi sign / police lights), collapsed for plain cars
  const rs = (st.roof[1][0] + st.roof[2][0]) / 2, ry = pl(st.belt, rs) + roofH(rs) + 0.1;
  box(-0.3, ry, zOf(rs), 0.56, 0.15, 0.3, 4); box(0.3, ry, zOf(rs), 0.56, 0.15, 0.3, 5);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  const wh = new Float32Array(pos.length);                                    // per vertex: its wheel's centre (z, y) and radius, or zeros
  for (const [i0, n, cz, cy, r] of wheels) for (let i = i0; i < i0 + n; i++) wh.set([cz, cy, r], i * 3);
  g.setAttribute('aWheel', new THREE.BufferAttribute(wh, 3));
  return g;
}

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
  const base = shell(STYLES[style]);
  const g = new THREE.InstancedBufferGeometry();
  for (const k of ['position', 'normal', 'aPart', 'aWheel']) g.setAttribute(k, base.getAttribute(k));
  const A = {};
  for (const [n, k] of [['aP', 3], ['aS', 4], ['aC', 3], ['aL', 4], ['aR', 2]]) { A[n] = new THREE.InstancedBufferAttribute(new Float32Array(MAX * k), k); A[n].setUsage(THREE.DynamicDrawUsage); g.setAttribute(n, A[n]); }
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      attribute float aPart; attribute vec3 aP, aC, aWheel; attribute vec4 aS, aL; attribute vec2 aR;   // aS: heading, scale, fade, livery (0 plain, 1 taxi, 2 police) · aL: tail, roof left, roof right, brake · aR: roll, pitch
      varying vec3 vN, vW, vC, vL, vWheel; varying float vPart; varying vec4 vS, vLi;
      vec3 lean(vec3 q){                                                   // roll about the car's long axis, then pitch about the axle line
        float cr = cos(aR.x), sr = sin(aR.x), cp = cos(aR.y), sp = sin(aR.y);
        q = vec3(q.x * cr - q.y * sr, q.x * sr + q.y * cr, q.z);
        return vec3(q.x, q.y * cp - q.z * sp, q.y * sp + q.z * cp);
      }
      void main(){
        vec3 p = position, n = normal;
        if (aPart > 3.5 && aPart < 5.5 && aS.w < 0.5) p = vec3(0.0);        // plain cars have no roof bar
        vL = p; vWheel = aWheel;
        if (aWheel.z < 0.01) { p = lean(p - vec3(0.0, 0.36, 0.0)) + vec3(0.0, 0.36, 0.0); n = lean(n); }   // the body moves on its springs; the wheels stay on the road
        float c = cos(aS.x), s = sin(aS.x);
        mat3 R = mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
        vec3 w = aP + R * (p * aS.y); vW = w; vN = R * n; vC = aC; vPart = aPart; vS = aS; vLi = aL;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec3 cSky, cTop, cHor, cSun, cGrid, cFog; uniform float uT;
      varying vec3 vN, vW, vC, vL, vWheel; varying float vPart; varying vec4 vS, vLi;
      ${ENV_GLSL}
      void main(){
        vec3 N = normalize(vN), V = normalize(cameraPosition - vW), R = reflect(-V, N);
        float nv = max(dot(N, V), 0.0), fr = 0.04 + 0.96 * pow(1.0 - nv, 5.0), dist = length(vW - cameraPosition);
        float rim = pow(1.0 - nv, 3.0);
        vec3 col;
        // every vehicle carries one neon colour: its own paint colour at full strength (taxis amber, the police blue)
        vec3 acc = vS.w > 1.5 ? vec3(0.08, 0.3, 1.0) : vS.w > 0.5 ? vec3(1.0, 0.8, 0.1) : vC / max(max(vC.r, vC.g), max(vC.b, 0.25));
        if (vPart < 0.5) {            // body: dark metal with a tint of the colour, mirror-like, edged in its neon
          vec3 base = mix(vec3(0.02, 0.024, 0.045), vC, 0.26);
          if (vS.w > 1.5) base = (vL.z > -0.72 && vL.z < 1.22 && vL.y > 0.3) ? vec3(0.7, 0.74, 0.84) : vec3(0.03, 0.04, 0.11);    // police: pale doors and roof, dark bonnet and boot
          else if (vS.w > 0.5) base = abs(N.y) < 0.5 && abs(vL.y - 0.62) < 0.07 ? (mod(floor(vL.z / 0.14) + floor((vL.y - 0.55) / 0.07), 2.0) < 0.5 ? vec3(0.02) : vec3(0.95)) : vC * 0.62;   // taxi: yellow, chequered stripe
          float light = 0.4 + 0.5 * max(N.y, 0.0) + 0.16 * max(N.z, 0.0);
          col = base * light * mix(0.62, 1.0, smoothstep(0.2, 0.75, vL.y)) + env(R) * (0.08 + 0.62 * fr);
          col += cGrid * 0.2 * smoothstep(0.7, 0.25, vL.y) * max(0.5 - N.y, 0.0) + (cHor * 0.3 + acc * 0.55) * rim * 0.6 + acc * 0.025;
        } else if (vPart < 1.5) col = vec3(0.02, 0.025, 0.05) + cSky * 0.3 + acc * 0.05 + env(R) * (0.1 + 0.9 * fr) * 1.1 + cHor * rim * 0.2;     // glass: near black, reflecting the sky
        else if (vPart < 2.5) col = vec3(2.1, 0.1, 0.2) * (0.6 + 1.3 * vLi.w) * vLi.x * mix(1.0, 0.3, smoothstep(50.0, 170.0, dist));   // tail lamps (a soft sprite takes over far away)
        else if (vPart < 3.5) col = vec3(0.012, 0.012, 0.02) + env(R) * 0.05 + cHor * rim * 0.06;
        else if (vPart < 5.5) {
          float on = vPart < 4.5 ? vLi.y : vLi.z;
          vec3 lc = vS.w > 1.5 ? (vPart < 4.5 ? vec3(4.0, 0.15, 0.3) : vec3(0.2, 0.6, 4.5)) : vec3(2.2, 1.7, 0.25);
          col = lc * on + vec3(0.03);
        } else if (vPart < 6.5) col = vec3(1.1, 1.45, 1.7) * mix(1.0, 0.35, smoothstep(50.0, 170.0, dist));                             // head lamps: cold white
        else if (vPart < 7.5) {
          col = vec3(0.16, 0.17, 0.22) + env(R) * 0.5;                                                                               // grille bars; wheel hubs
          if (vWheel.z > 0.01) {                                                                                                     // a turning wheel: a ring of light with three marks going round
            vec2 q = vec2(vL.z - vWheel.x, vL.y - vWheel.y) / vWheel.z; float r = length(q);
            float mark = smoothstep(0.75, 0.95, abs(fract((atan(q.y, q.x) - uT * 13.0) * 0.4775) - 0.5) * 2.0) * step(r, 0.5);
            col = vec3(0.015, 0.015, 0.03) + acc * (smoothstep(0.09, 0.03, abs(r - 0.52)) * 2.0 + mark * 0.9);
          }
        } else col = acc * 2.2 * mix(1.0, 0.7, smoothstep(80.0, 260.0, dist));                                                         // neon lines
        // far away the car comes out of the haze (no flicker), and the usual distance fog
        col = mix(cFog, col, vS.z);
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
    this.u = { cSky: { value: new THREE.Vector3() }, cTop: { value: new THREE.Vector3() }, cHor: { value: new THREE.Vector3() }, cSun: { value: new THREE.Vector3() }, cGrid: { value: new THREE.Vector3() }, cFog: { value: new THREE.Vector3() }, uT: { value: 0 } };
    this.group = new THREE.Group();
    this.m = {};
    for (const k of Object.keys(STYLES)) { this.m[k] = makeStyle(k, this.u); this.group.add(this.m[k]); }
  }
  begin(P, T = 0) {
    const u = this.u; u.uT.value = T;
    u.cSky.value.set(...P.skyMid); u.cTop.value.set(...P.skyTop); u.cHor.value.set(...P.horizon); u.cSun.value.set(...P.sunMid); u.cGrid.value.set(...P.grid); u.cFog.value.set(...P.fog);
    for (const k in this.m) this.m[k].userData.n = 0;
  }
  // style: 'car' | 'coupe' | 'suv' | 'van' | 'pickup' | 'bus' | 'cab' · livery: 0 plain, 1 taxi, 2 police · tail / roofL / roofR: light levels · brake: 0..1
  // roll: the body leans (+ = its roof towards −x) · pitch: + = nose up
  add(style, x, y, z, yaw, scale, col, fade = 1, livery = 0, tail = 1, roofL = 0, roofR = 0, brake = 0, roll = 0, pitch = 0) {
    const d = this.m[style].userData, i = d.n; if (i >= MAX) return; d.n++;
    d.A.aP.array.set([x, y, z], i * 3); d.A.aS.array.set([yaw, scale, fade, livery], i * 4);
    d.A.aC.array.set(col, i * 3); d.A.aL.array.set([tail, roofL, roofR, brake], i * 4); d.A.aR.array.set([roll, pitch], i * 2);
  }
  end() {
    for (const k in this.m) { const m = this.m[k], d = m.userData; d.g.instanceCount = d.n; m.visible = d.n > 0; for (const a in d.A) d.A[a].needsUpdate = true; }
  }
}
