// ─────────────────────────────────────────────────────────────────────────────
// MIDNIGHT CRUISE — 1986 · THE CUE SHEET
// One file, read by picture (main thread), sound (AudioWorklet) and the offline
// renderer (Node). Every timecode and every note lives here.
// ─────────────────────────────────────────────────────────────────────────────

export const SR = 48000;
export const BPM = 120;
export const BEAT = 60 / BPM;            // 0.5 s
export const BAR = BEAT * 4;             // 2.0 s
export const TICK = BEAT / 8;            // 32nd note = 0.0625 s = 3000 samples
export const TPB = 32;                   // ticks per bar
export const IGNITION = 10.0;            // exact length of the authored ignition
export const SKIP_FF = 0.4;              // fast-forward transition after SKIP INTRO
export const REWIND = 0.6;               // rewind transition before a replayed ignition
export const SEED = 1986;

// Ignition timecodes (seconds from START DRIVE). Picture and sound both read these.
export const IGN = {
  vhsNoise: [0.0, 0.62],
  osdPlay: [0.0, 1.75],
  step15: [0.0, 0.5],          // tape hesitation: picture steps at 15 fps
  crtHold: [0.0, 0.5],
  crtExpand: [0.5, 1.0],
  firstPulse: 0.5,
  bassIn: 1.0,
  drumsIn: 2.0,
  fly: [1.0, 4.0],
  sunRise: [0.55, 4.4],
  settle: [4.0, 6.0],
  fovTighten: [4.5, 5.94],
  gather: [4.0, 6.0],
  breath: [5.5, 6.0],
  slam: 6.0,
  hitStop: [6.0, 6.067],
  glint: [6.06, 6.72],
  flare: [6.0, 6.95],
  shake: [6.0, 6.6],
  neonWrite: [6.125, 7.0],
  neonFlicker: [7.0, 7.375],
  aux: [7.5, 8.6],
  cassette: 7.625,
  controls: [8.0, 8.8],
  hold: [8.8, 10.0],
};

// Nitro (the TURBO button): a short wind-up to the next half-beat, a sustained boost, then recovery.
// `cooldown` is the full length of one burst; a new one needs a full charge (see GAME).
export const TURBO = { minAntic: 0.2, grid: BEAT / 2, sustain: 2.2, recover: 1.4, cooldown: 4.2 };
export const ENV_XFADE = 1.6;
// Automatic environment change while cruising: whichever comes first (scene seconds / road units).
export const AUTO_ENV = { time: 40, dist: 3500 };
// ── The game: a police chase down the highway into the city (all values in road units and seconds) ──
// Same-direction traffic shares ONE speed, so formations never close up and a row that was passable when it was
// generated stays passable. The car always drives flat out; the brake buys reaction time but lets the police close in.
export const GAME = {
  mph: 2.4,                                      // speedometer: road units per second → MPH
  // Traffic keeps pace with the road: it drives at trafficK of your cruising speed (64 MPH in gear 1, 124 in gear 6), and
  // each lane has its own speed — the left lane laneDv faster than the middle, the right lane laneDv slower — so cars
  // overtake each other all the time. A vehicle starts behind or ahead of its row by what its lane will gain or lose, and the
  // lanes' speed difference follows how fast you are closing, so every row is lined up when you reach it — on the brake,
  // at cruising speed or in a nitro burst alike.
  trafficK: 0.46, laneDv: 3, trafficEase: 2,
  breathe: 1.5,                                  // … give or take: each car, van and truck eases this far ahead of and behind its place, in its own time
  gears: [58, 67, 77, 88, 100, 112],             // cruising speed per gear
  gearAt: [0, 600, 1500, 2800, 4400, 6400],    // run distance at which each gear engages
  creep: [800, 28],                              // past the last gear: +1 u/s per 800 units, up to +28
  brakeMul: 0.55, brakeLinger: 2.2,              // braking: 55 % speed; on the brake for 2.2 s and the police are on your tail
  // nitro: canisters picked up on the road, up to three in stock; one burst is ×1.85 speed and smashes traffic
  nitroBoost: 0.85, nitroTail: 0.55, nitroGrace: 0.7, nitroMax: 3, nitroFirst: 480, nitroEvery: [1800, 2700], nitroFree: 7,   // (distances measured against the traffic: the first after about 15 s, then one every 30 to 45 s in top gear)
  ahead: 340, firstRow: 175, despawn: 30,        // spawn distance ahead of the car, first row of a run (reached about 6 s in), cull distance behind
  rowGap: [1.05, 0.68],                           // seconds between rows at the gear's closing speed (gear 1 → 6)
  nearT: 0.32, draftT: 0.9,                      // close-call and slipstream windows, in seconds of closing time
  taxiAt: 1.8, taxiBlink: 0.45, taxiMove: 0.85,  // a taxi (or a crossing cruiser) signals 1.8 s before you reach it, then steers across one lane: in place 0.5 s ahead of you
  introT: 2.8, introHold: 1.1, introClose: 1.7, introV: 16,   // every run opens with the police on your bumper, then you floor it
  swipeInv: 0.5, swipeKick: 9, reviveInv: 2.0,
  // police. Stars: 1 = a pursuit car behind you (always), 2 = roadblocks and the grappler, 3 = the helicopter's searchlight and fire.
  // You have two lives. Any hit (driving into a vehicle, a sideswipe, the grappler, the helicopter) takes one: the pursuit car
  // closes in and stays on your tail until you fire a nitro canister, which shakes it off and gives the life back. A hit while
  // it is on your tail ends the run. hitInv: seconds nothing can touch you after ploughing through a vehicle on the first life.
  // (ram… = the grappler run: warning, lunge speed, drop-back speed, how long a hook slows us; dr… = the helicopter lock and strike)
  // Wanted level. Stars come slowly: two after star2At of road, three after star3At, counted from the last time the heat was
  // cleared; a hit adds half a star (so does ramming a cruiser in a nitro burst). The third nitro burst clears the heat: back to
  // one star, and the road count starts again. Heat from hits cools by a star every heatDecay s once heatHold s pass quietly.
  star2At: 2000, star3At: 5000, nitroClear: 3,
  heatSwipe: 0.5, heatSmash: 0, heatCruiser: 0.5, heatHold: 10, heatDecay: 12,
  stumbleGrace: 1.2, hitInv: 1.0, hitRest: 2.5, polClose: 6.5, polFar: 19, chaseZ: 8.5, chaseX: 2.4, chaseRam: 0.6,   // chaseZ, chaseX: where it sits for the long chase: behind and half a lane to the side, so it does not hide your car;   // chaseRam: grappler runs come this much sooner while it is on your tail
  ramFirst: 4, ramEvery: [3, 4.8], ramWarn: 1.1, ramV: 26, ramBack: 34, ramSlow: 1.0, ramSlowMul: 0.7, ramClear: 2.5, ramOwn: 1.8, clearAfter: 1.3, holdOff: 3,   // an attack only starts when a lane beside you stays clear while it lasts (ramClear, drClear) and, for clearAfter s more, that lane or your own is open again
  blockP: [0, 0, 0.18, 0.26],                      // share of rows that are police units ahead of you, by star
  // a rolling roadblock (two cruisers abreast) brakes when you are blockAt s away; the other kind is one cruiser weaving
  // across two lanes: it holds each lane for weaveHold s and steers across in weaveMove s, and weaveLock s before you
  // reach it, it commits to the lane it is heading for and stays there. At three stars a second cruiser may hold the third lane.
  // stagger: nobody drives exactly abreast: vehicles of one row sit this far ahead of or behind the row's line (police: echelon).
  // shiftP: share of rolling roadblocks (of those with a cruiser in the middle lane), by star, in which that cruiser steers across into
  // the open side lane as you close in, timed like a taxi: the middle lane becomes the way through
  stagger: [3.5, 6.5], echelon: [3, 5], shiftP: [0, 0, 0.5, 0.6],
  blockAt: 1.3, blockSlow: 9, blockDecel: 14, weaveP: [0, 0, 0.5, 0.6], weaveHold: 0.45, weaveMove: 1.4, weaveLock: 1.25, weaveSnap: 8, weaveWarn: 3,
  // the helicopter comes and goes: it flies in, settles for heliSettle s, makes heliPasses attacks drEvery s apart, flies off,
  // and is back heliAway s later
  heliPasses: 3, heliSettle: 2.5, heliAway: [10, 16],
  drEvery: 3.5, drWarn: 1.2, drStrike: 0.45, drClear: 2.1,
  ptsDist: 1, ptsNear: 150, ptsPass: 25, ptsCell: 10, ptsSmash: 200, ptsDraft: 80,
  comboNear: 3, comboCap: 40, comboStep: 0.1, starBonus: 0.25,
  tapeEvery: 100, tapesStart: 1, maxTapes: 3,    // spare tapes: one per 100 cells; a tape rewinds the crash
  overLock: 0.7, rewindSec: 3, reviveHold: 1.3,
};
// Road layout (world units, x across): a three-lane highway. Lanes are `lane` wide (a car is ~2 wide, a truck ~2.8),
// centred on −lane, 0, +lane. The grid cell equals the lane width, so grid lines fall on the lane edges and on the
// cyan rails (±1.5·lane). `traffic`: the ambient tail lights of the intro sit in the outer lanes.
export const ROAD = { lane: 5.0, rail: 7.5, shoulder: 9.3, traffic: 5.0, trail: 9.7 };   // shoulder: where the asphalt ends; the guardrail stands at `trail`
// Lane change feel (sim, 240 Hz): the lateral move is a critically damped spring on a lightly smoothed target
// (≈ 0.21 s to 90 %), so a second press mid-move retargets with the velocity it already has. The drift is
// visual only: body yaw follows the lateral speed (capped at yawMax, so a two-lane dash stays slight) through an
// under-damped spring (lag, then a small counter-steer), the tail swings out around a pivot near the front axle,
// and the body rolls with the lateral speed.
export const LANE_FEEL = { w: 20, tauIn: 0.02, yawK: 0.0046, yawMax: 0.16, yawW: 19, yawZ: 0.36, pivot: 1.25, camK: 0.6, camW: 10 };
// Title exit once cruising starts (cruise time, s): the neon flickers out, the 1986 plate wipes shut,
// the chrome word pulls toward the camera and then recedes to the horizon. After that the road stays clear.
export const TITLE_EXIT = { neon: [0.2, 0.62], plate: [0.25, 0.7], chrome: [0.3, 1.35] };
export const THROTTLE = { rise: 0.32, fall: 0.2 };   // drive amount: back to full speed after braking / brake bites

export const PRESETS = ['SUNSET', 'BLUE HOUR', 'AFTERGLOW', 'LAGOON'];

// Neon ignition flicker: authored on/off pattern, shared by the picture and the buzz SFX.
// Returns 0..1 power for the tube relative to the ignition clock.
const FLICK = [ // [time, level] steps
  [7.000, 0.0], [7.035, 1.0], [7.07, 0.15], [7.11, 0.9], [7.135, 0.0], [7.19, 1.0],
  [7.215, 0.35], [7.25, 1.0], [7.29, 0.6], [7.315, 1.0],
];
export function neonPower(it) {
  const [a, b] = IGN.neonWrite;
  if (it < a) return 0;
  if (it < b) return 0.55;                       // being written: partially energised
  if (it >= IGN.neonFlicker[1]) return 1;
  let v = 0.55;
  for (const [t, l] of FLICK) if (it >= t) v = l;
  return v;
}

// ── Harmony ────────────────────────────────────────────────────────────────
// Key: A minor. Bass roots in octave 1, pads mid register with smooth voice leading.
export const CHORDS = {
  Am: { root: 33, pad: [60, 64, 67, 71], arp: [69, 72, 76, 79] },
  F: { root: 29, pad: [57, 60, 64, 67], arp: [65, 69, 72, 76] },
  C: { root: 36, pad: [55, 59, 64, 67], arp: [67, 72, 76, 79] },
  G: { root: 31, pad: [55, 59, 62, 64], arp: [67, 71, 74, 79] },
  Gs: { root: 31, pad: [55, 60, 62, 67], arp: [67, 72, 74, 79] },
  Em: { root: 28, pad: [59, 62, 64, 67], arp: [64, 67, 71, 74] },
};
export const SLAM_CHORD = [41, 53, 57, 60, 64, 67, 72];   // Fmaj9, spread

// ── Patterns (16 steps per bar; '.' rest) ──────────────────────────────────
const P = (s) => [...s].map((c) => c !== '.');
const KICK_A = P('x.......x.......');
const KICK_B = P('x.......x.x.....');
const SNARE = P('....x.......x...');
const HAT8 = P('x.x.x.x.x.x.x.x.');
const BASS1 = [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 0, 12, 0, 12];
const BASS2 = [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 7, 12];
const ARP_ORDER = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 3, 2, 1, 2];

// Lead hook over Am F C G (8 bars, steps of 16ths): [step, midi, lenSteps]
const HOOK = [
  [0, 76, 6], [6, 74, 2], [8, 72, 4], [12, 71, 4],
  [16, 69, 10], [26, 67, 2], [28, 69, 4],
  [32, 72, 6], [38, 74, 2], [40, 76, 4], [44, 72, 4],
  [48, 69, 12], [60, 72, 4],
  [64, 71, 6], [70, 72, 2], [72, 74, 4], [76, 76, 4],
  [80, 79, 8], [88, 76, 4], [92, 74, 4],
  [96, 74, 6], [102, 72, 2], [104, 71, 8],
  [112, 74, 4], [116, 71, 4], [120, 67, 8],
];
const HOOK_B = [ // answer phrase for odd cycles over the lift
  [0, 81, 4], [4, 79, 4], [8, 76, 8], [16, 74, 4], [20, 76, 4], [24, 72, 8],
  [32, 77, 4], [36, 76, 4], [40, 72, 8], [48, 74, 16],
];

// Cruise form: 32-bar cycle (64 s).
const CRUISE_CHORDS = [
  'Am', 'Am', 'F', 'F', 'C', 'C', 'G', 'G',
  'Am', 'Am', 'F', 'F', 'C', 'C', 'G', 'G',
  'F', 'F', 'G', 'G', 'Em', 'Em', 'Am', 'Am',
  'Am', 'Am', 'F', 'F', 'C', 'C', 'G', 'G',
];
export function cruiseSection(bar) {
  const b = ((bar % 32) + 32) % 32;
  return b < 8 ? 'A' : b < 16 ? 'A2' : b < 24 ? 'B' : 'L';
}
export function cruiseChord(bar) { return CRUISE_CHORDS[((bar % 32) + 32) % 32]; }
const IGN_CHORDS = ['Am', 'C', 'Gs', 'F', 'G'];

// ── Note generation ───────────────────────────────────────────────────────
// emit(t, note): t = tick offset inside the bar (0..31, may be fractional);
// ctx = { thr, w:[4 preset weights] } — only used for interactive layers.

function drumsBar(emit, kick, snare, hat, opts = {}) {
  const v = opts.v ?? 1;
  for (let s = 0; s < 16; s++) {
    const tk = s * 2;
    if (kick && kick[s]) emit(tk, { i: 'kick', v: (s === 0 ? 1 : 0.88) * v });
    if (snare && snare[s]) emit(tk, { i: 'snare', v: 0.95 * v });
    if (hat && hat[s]) emit(tk, { i: 'hat', v: (s % 4 === 2 ? 0.75 : 0.5) * v * (opts.hv ?? 1) });
  }
}
function bassBar(emit, chord, pat, v = 1, from = 0, to = 16, vel = null) {
  const r = CHORDS[chord].root;
  for (let s = from; s < to; s++) {
    const acc = s % 4 === 0 ? 1 : 0.8;
    emit(s * 2, { i: 'bass', n: r + pat[s], v: v * acc * (vel ? vel(s) : 1), d: 0.1 });
  }
}
function padChord(emit, chord, dur, v = 0.8) { emit(0, { i: 'pad', notes: CHORDS[chord].pad, d: dur, v }); }
function arpBar(emit, chord, v, oct = 0) {
  const a = CHORDS[chord].arp;
  for (let s = 0; s < 16; s++) emit(s * 2, { i: 'arp', n: a[ARP_ORDER[s]] + oct, v: v * (s % 4 === 0 ? 1 : 0.75), d: 0.09 });
}
function phrase(emit, notes, bar, barsLong, oct = 0, v = 0.8) {
  const lo = bar * 16, hi = lo + 16;
  for (const [st, n, len] of notes) if (st >= lo && st < hi) emit((st - lo) * 2, { i: 'lead', n: n + oct, d: len * TICK * 2 * 0.92, v });
}

export function ignitionBar(bar, emit) {
  const ch = IGN_CHORDS[bar];
  switch (bar) {
    case 0:
      emit(0, { i: 'tape' }); emit(0, { i: 'vhs', d: 0.62 });
      emit(8, { i: 'kick', v: 1.05 }); emit(8, { i: 'sub', v: 0.85 }); emit(8, { i: 'pad', notes: CHORDS.Am.pad, d: 3.4, v: 0.75, slow: 1 });
      emit(24, { i: 'kick', v: 0.7 });
      bassBar(emit, 'Am', BASS1, 0.85, 8, 16, (s) => 0.55 + (s - 8) * 0.05);
      break;
    case 1:
      drumsBar(emit, P('x...x...x...x...'), SNARE, P('..........x.x.x.'), { v: 0.92 });
      bassBar(emit, ch, BASS1, 0.95);
      padChord(emit, ch, 2.0, 0.7);
      break;
    case 2:
      emit(0, { i: 'riser', d: 2.0 }); emit(0, { i: 'revcrash', d: 2.0 });
      bassBar(emit, ch, BASS2, 0.9, 0, 12, (s) => 1 - s * 0.045);
      emit(0, { i: 'pad', notes: CHORDS.Gs.pad, d: 1.4, v: 0.6 });
      for (let s = 0; s < 8; s++) emit(s * 2 + 1, { i: 'hat', v: 0.22 + s * 0.02 });
      // the breath (5.5–6.0): only a Simmons tom fill remains
      emit(24, { i: 'tom', n: 52, v: 0.8 }); emit(26, { i: 'tom', n: 47, v: 0.85 });
      emit(28, { i: 'tom', n: 43, v: 0.9 }); emit(30, { i: 'tom', n: 38, v: 1.0 });
      break;
    case 3: // THE SLAM at 6.000 s
      emit(0, { i: 'crash', v: 1.0 }); emit(0, { i: 'sub', v: 1.0 }); emit(0, { i: 'stab', notes: SLAM_CHORD, d: 1.7, v: 1.0 });
      emit(0, { i: 'impact', v: 1.0 });
      drumsBar(emit, KICK_A, SNARE, HAT8, { v: 1 });
      emit(0, { i: 'snare', v: 0.9 });
      bassBar(emit, ch, BASS1, 1.0);
      emit(0, { i: 'pad', notes: CHORDS.F.pad, d: 2.0, v: 0.75 });
      emit(2, { i: 'buzz', d: 1.3 });               // neon write-on hum at 6.125
      emit(26, { i: 'pop' });                        // cassette window enters at 7.625
      break;
    case 4:
      drumsBar(emit, KICK_B, SNARE, HAT8, { v: 1 });
      bassBar(emit, ch, BASS1, 1.0);
      emit(0, { i: 'pad', notes: CHORDS.G.pad, d: 2.0, v: 0.75 });
      for (let s = 12; s < 16; s++) emit(s * 2, { i: 'snare', v: 0.45 + (s - 12) * 0.12, fill: 1 });
      emit(28, { i: 'hat', open: 1, v: 0.6 });
      break;
  }
}

export function cruiseBar(bar, cycle, emit, ctx) {
  const b = ((bar % 32) + 32) % 32;
  const sec = cruiseSection(b);
  const ch = CRUISE_CHORDS[b];
  const w = ctx.w, thr = ctx.thr;
  const calm = w[1], dark = w[2], lagoon = w[3];
  const dv = 1 - 0.35 * calm;                     // BLUE HOUR plays the kit softer
  const hv = (1 - 0.75 * calm) * (1 + 0.15 * lagoon);
  // Drums
  if (b === 0 || b === 8 || b === 16) emit(0, { i: 'crash', v: b === 0 ? 0.9 : 0.7 });
  if (sec === 'L' && b < 28) {
    drumsBar(emit, P('x.........x.....'), P('........x.......'), HAT8, { v: 0.9 * dv, hv });
  } else {
    drumsBar(emit, b % 2 ? KICK_B : KICK_A, SNARE, HAT8, { v: dv * (1 + 0.12 * dark), hv });
    if (b % 2 === 1) emit(28, { i: 'hat', open: 1, v: 0.5 * hv });
  }
  if (b === 23) { emit(24, { i: 'tom', n: 50, v: 0.8 }); emit(26, { i: 'tom', n: 45, v: 0.85 }); emit(28, { i: 'tom', n: 41, v: 0.9 }); emit(30, { i: 'tom', n: 36, v: 1 }); }
  if (b === 31) {
    for (let s = 8; s < 16; s++) emit(s * 2, { i: 'snare', v: 0.35 + (s - 8) * 0.08, fill: 1 });
    emit(29, { i: 'snare', v: 0.8, fill: 1 }); emit(31, { i: 'snare', v: 0.95, fill: 1 });
  }
  // Interactive acceleration layers (velocity follows the throttle)
  if (thr > 0.04) {
    emit(8, { i: 'kick', v: 0.8 * thr * dv }); emit(24, { i: 'kick', v: 0.8 * thr * dv });
    for (let s = 1; s < 16; s += 2) emit(s * 2, { i: 'hat', v: 0.32 * thr * hv });
    emit(8, { i: 'clap', v: 0.55 * thr }); emit(24, { i: 'clap', v: 0.55 * thr });
  }
  // Bass
  const bpat = (sec === 'B' || (sec === 'A2' && cycle % 2 === 1)) ? BASS2 : BASS1;
  bassBar(emit, ch, bpat, 1.0);
  // Pads every chord change
  if (b % 2 === 0) padChord(emit, ch, 4.0, 0.72);
  // Arp: section B always, everywhere with the throttle, LAGOON adds a softer pluck
  const arpV = Math.max(sec === 'B' ? 0.55 : sec === 'L' && b < 28 ? 0.42 : 0.26, 0.6 * thr);
  if (arpV > 0.03) arpBar(emit, ch, arpV, thr > 0.6 ? 12 : 0);
  if (lagoon > 0.05) for (let s = 0; s < 16; s += 2) emit(s * 2 + 1, { i: 'pluck', n: CHORDS[ch].arp[(s / 2) % 4] - 12, v: 0.5 * lagoon, d: 0.2 });
  if (calm > 0.05) for (let s = 0; s < 16; s += 3) emit(s * 2, { i: 'bell', n: CHORDS[ch].arp[(s / 3) % 4] + 12, v: 0.45 * calm, d: 0.9 });
  // Lead
  if (sec === 'A2') phrase(emit, HOOK, b - 8, 8, cycle % 2 ? 12 : 0, 0.75);
  if (sec === 'L' && b >= 28 && cycle % 2 === 1) phrase(emit, HOOK_B, b - 28, 4, 0, 0.7);
}

// Turbo stinger, relative to the impact time (seconds): picture reads the same offsets.
export function turboNotes(chordName, emitAt) {
  emitAt(0, { i: 'crash', v: 1.0 });
  emitAt(0, { i: 'sub', v: 1.0 });
  emitAt(0, { i: 'impact', v: 0.9 });
  emitAt(0, { i: 'whoosh', v: 1.0 });
  emitAt(0, { i: 'stab', notes: CHORDS[chordName].pad.map((n) => n - 12).concat([CHORDS[chordName].root + 12]), d: 1.2, v: 0.85 });
  emitAt(0, { i: 'snare', v: 1.0 });
}

// Visual helpers: time since the latest kick / snare hit for a section clock.
export function drumPulse(sec, localTime, cycleBars = 0) {
  // sec: 'ign' | 'cruise'. Returns {kick, snare} seconds since last hit (Infinity if none in 1 bar).
  let kick = Infinity, snare = Infinity;
  if (localTime < 0) return { kick, snare };
  const bar = Math.floor(localTime / BAR);
  const ctx = { thr: 0, w: [1, 0, 0, 0] };
  for (let bb = bar; bb >= Math.max(0, bar - 1); bb--) {
    const t0 = bb * BAR;
    const take = (tk, n) => {
      const t = t0 + tk * TICK;
      if (t > localTime) return;
      const d = localTime - t;
      if (n.i === 'kick' && d < kick) kick = d;
      if (n.i === 'snare' && !n.fill && d < snare) snare = d;
    };
    if (sec === 'ign') { if (bb <= 4) ignitionBar(bb, take); }
    else cruiseBar(bb, Math.floor(bb / 32), take, ctx);
    if (kick < Infinity && snare < Infinity) break;
  }
  return { kick, snare };
}
