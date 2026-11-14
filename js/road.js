// ─────────────────────────────────────────────────────────────────────────────
// The shape of the highway. The game itself is played in road coordinates (x across the lanes, z along the road),
// where the road is straight and flat. The picture bends it: the centre line swings left and right and the surface
// rises and falls as a function of the distance driven in a run. Each is a sum of a few sine waves of unrelated
// lengths, so the road never repeats and always comes back to the line that leads to the sun.
// The same functions exist here in JS (camera, the player's car) and as GLSL (every vertex of the world).
// ─────────────────────────────────────────────────────────────────────────────
// [amplitude (units), wavelength (units), phase]: sweeps of the centre line, and the rises of the surface
export const SWEEP = [[44, 2300, 0.6], [22, 1310, 2.1], [7, 760, 4.4]];
export const RISE = [[10, 2900, 1.2], [2.4, 1170, 3.3]];
export const STRAIGHT = [140, 900];           // a run starts on a straight; the bends fade in between these distances
const TAU = Math.PI * 2;
const env = (s) => { const t = Math.max(0, Math.min(1, (s - STRAIGHT[0]) / (STRAIGHT[1] - STRAIGHT[0]))); return t * t * (3 - 2 * t); };
const envD = (s) => { const t = (s - STRAIGHT[0]) / (STRAIGHT[1] - STRAIGHT[0]); return t <= 0 || t >= 1 ? 0 : 6 * t * (1 - t) / (STRAIGHT[1] - STRAIGHT[0]); };
const sum = (W, s) => { let v = 0; for (const [a, l, p] of W) v += a * Math.sin(TAU * s / l + p); return v; };
const sumD = (W, s) => { let v = 0; for (const [a, l, p] of W) v += a * TAU / l * Math.cos(TAU * s / l + p); return v; };
const sumDD = (W, s) => { let v = 0; for (const [a, l, p] of W) v -= a * (TAU / l) * (TAU / l) * Math.sin(TAU * s / l + p); return v; };
// centre line offset, heading (dx/ds) and curvature at run distance s; height and slope
export const roadX = (s) => env(s) * sum(SWEEP, s);
export const roadDX = (s) => envD(s) * sum(SWEEP, s) + env(s) * sumD(SWEEP, s);
export const roadK = (s) => env(s) * sumDD(SWEEP, s);
export const roadY = (s) => env(s) * sum(RISE, s);
export const roadDY = (s) => envD(s) * sum(RISE, s) + env(s) * sumD(RISE, s);

// One set of uniforms shared by every material of the world: uRoadA = (run distance at the camera, X there, Y there, strength),
// uRoadP = the phases of the five waves at the camera (kept small, so they stay exact however long the run)
export const ROAD_U = { uRoadA: { value: [0, 0, 0, 0] }, uRoadP: { value: [0, 0, 0, 0, 0] } };
const N = SWEEP.length + RISE.length, ALL = [...SWEEP, ...RISE];
export function setRoad(s0, k) {
  const a = ROAD_U.uRoadA.value, p = ROAD_U.uRoadP.value;
  a[0] = s0; a[1] = roadX(s0); a[2] = roadY(s0); a[3] = k;
  for (let i = 0; i < N; i++) { const [, l, ph] = ALL[i]; p[i] = (TAU * (s0 % l) / l + ph) % TAU; }
}
// where a point of the flat road at distance d ahead of the camera ends up: [dx, dy]
export function bendAt(d) {
  const a = ROAD_U.uRoadA.value;
  return [(roadX(a[0] + d) - a[1]) * a[3], (roadY(a[0] + d) - a[2]) * a[3]];
}
const f = (v) => v.toFixed(6);
export const ROAD_GLSL = /* glsl */`
  uniform vec4 uRoadA; uniform float uRoadP[${N}];
  vec3 bend(vec3 p){
    float d = -p.z, s = uRoadA.x + d;
    float e = clamp((s - ${f(STRAIGHT[0])}) / ${f(STRAIGHT[1] - STRAIGHT[0])}, 0.0, 1.0); e = e * e * (3.0 - 2.0 * e);
    float x = ${SWEEP.map(([a, l], i) => `${f(a)} * sin(uRoadP[${i}] + d * ${f(TAU / l)})`).join(' + ')};
    float y = ${RISE.map(([a, l], i) => `${f(a)} * sin(uRoadP[${i + SWEEP.length}] + d * ${f(TAU / l)})`).join(' + ')};
    return p + vec3(e * x - uRoadA.y, e * y - uRoadA.z, 0.0) * uRoadA.w;
  }
`;
