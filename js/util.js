// Small deterministic math helpers shared by picture, sound and tools.
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sat = (x) => clamp(x, 0, 1);
export const lin = (t, a, b) => sat((t - a) / (b - a));           // 0..1 progress inside [a,b]
export const smooth = (x) => { x = sat(x); return x * x * (3 - 2 * x); };
export const smoother = (x) => { x = sat(x); return x * x * x * (x * (x * 6 - 15) + 10); };
export const easeOutCubic = (x) => 1 - Math.pow(1 - sat(x), 3);
export const easeInCubic = (x) => Math.pow(sat(x), 3);
export const easeInOutCubic = (x) => { x = sat(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * sat(x)));
export const easeInExpo = (x) => (x <= 0 ? 0 : Math.pow(2, 10 * sat(x) - 10));
export const easeOutBack = (x, s = 1.70158) => { x = sat(x) - 1; return 1 + (s + 1) * x * x * x + s * x * x; };
// Damped spring step response, closed form: 0 → 1 with overshoot.
export const spring = (t, w = 18, z = 0.32) => {
  if (t <= 0) return 0;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
};
// Decaying oscillation 0 → peak → 0 (used for shake / settle impulses).
export const ring = (t, w = 30, z = 0.25) => (t <= 0 ? 0 : Math.exp(-z * w * t) * Math.sin(w * Math.sqrt(1 - z * z) * t));

// Hash-based, seedable noise. Pure functions of their inputs.
export function hash1(n) { // n: number → [0,1)
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
export function hash2(a, b) { return hash1((a | 0) * 73856093 ^ (b | 0) * 19349663); }
export function vnoise(t, seed = 0) { // smooth value noise, period-free
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  return lerp(hash2(i, seed), hash2(i + 1, seed), u) * 2 - 1;
}
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
