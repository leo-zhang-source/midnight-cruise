// Environment presets. Every preset keeps the canonical synthwave grammar —
// dark violet sky, striped gradient sun, neon grid, chrome — and only re-tunes it.
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const P = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? hex(v) : v]));

export const PALETTES = [
  P({ // SUNSET — canonical
    skyTop: '#05020f', skyMid: '#1d0738', skyLow: '#5a1060', horizon: '#ff3d8b', haze: '#ff6a5c',
    sunTop: '#fff27a', sunMid: '#ff9a3c', sunLow: '#ff2a8a', sunGlow: '#ff4f7a',
    grid: '#ff2fc8', gridAlt: '#3ef4ff', ground: '#0a0214', mountWire: '#38e8ff', mountWire2: '#ff3fc8', mountFill: '#0b0420',
    palm: '#07010d', fog: '#3a0b4a', post: '#3ef4ff', post2: '#ff4fd8', stars: 1.0, sunPower: 1.0,
    chromeSky: '#2a7bff', chromeHi: '#eaf8ff', chromeLow: '#ff4fa0', chromeGround: '#3a0a40', neon: '#ff3fb4',
  }),
  P({ // BLUE HOUR — cooler, starrier, dreamier
    skyTop: '#02030f', skyMid: '#0b0b3a', skyLow: '#2a1a6a', horizon: '#b34dff', haze: '#7a5cff',
    sunTop: '#ffd1f0', sunMid: '#ff6fd0', sunLow: '#8a3dff', sunGlow: '#a44dff',
    grid: '#3ec8ff', gridAlt: '#ff5fe0', ground: '#030418', mountWire: '#ff6fe8', mountWire2: '#5f8bff', mountFill: '#060628',
    palm: '#020210', fog: '#1a1550', post: '#ff6fe8', post2: '#5fe8ff', stars: 1.6, sunPower: 0.85,
    chromeSky: '#4a6bff', chromeHi: '#f2ecff', chromeLow: '#c05cff', chromeGround: '#1a1250', neon: '#ff5fd2',
  }),
  P({ // AFTERGLOW — crimson darksynth
    skyTop: '#070103', skyMid: '#24030f', skyLow: '#5c0a1a', horizon: '#ff3a2a', haze: '#ff5a2a',
    sunTop: '#ffe08a', sunMid: '#ff5a1f', sunLow: '#d8102e', sunGlow: '#ff3a2a',
    grid: '#ff2a3a', gridAlt: '#ff9a2a', ground: '#0c0104', mountWire: '#ff7a2a', mountWire2: '#ff2a5a', mountFill: '#120208',
    palm: '#0a0103', fog: '#40060f', post: '#ffb03a', post2: '#ff3a4a', stars: 0.7, sunPower: 1.15,
    chromeSky: '#ff6a3a', chromeHi: '#fff1e0', chromeLow: '#ff2a4a', chromeGround: '#3a0610', neon: '#ff3a6a',
  }),
  P({ // LAGOON — teal & coral, pastel neon
    skyTop: '#020910', skyMid: '#06263a', skyLow: '#1a4a6a', horizon: '#ff7aa8', haze: '#5fffe0',
    sunTop: '#fff6b0', sunMid: '#ffb08a', sunLow: '#ff5fa8', sunGlow: '#ff8ab0',
    grid: '#2affd8', gridAlt: '#ff6fb0', ground: '#020c12', mountWire: '#ff8ac0', mountWire2: '#2affd8', mountFill: '#04151f',
    palm: '#010a0f', fog: '#0a3040', post: '#2affd8', post2: '#ff8ac0', stars: 1.1, sunPower: 0.95,
    chromeSky: '#2ad8ff', chromeHi: '#effffd', chromeLow: '#ff7ab0', chromeGround: '#063040', neon: '#ff6fb8',
  }),
];

export function blendPalette(w) {
  const out = {};
  for (const k of Object.keys(PALETTES[0])) {
    const v0 = PALETTES[0][k];
    if (Array.isArray(v0)) out[k] = [0, 1, 2].map((i) => PALETTES.reduce((s, p, j) => s + p[k][i] * w[j], 0));
    else out[k] = PALETTES.reduce((s, p, j) => s + p[k] * w[j], 0);
  }
  return out;
}
