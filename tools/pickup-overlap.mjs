// How often a pickup (energy cell or nitro canister) overlaps a vehicle on the road ahead, in bot runs.
//   node tools/pickup-overlap.mjs [--seeds 8] [--secs 240]
import { play } from './bot.mjs';
import { NV, VF, NC, CF, NI, IF, HALF_L, HALF_W, T_BLOCK, T_WEAVE, aheadFor } from '../js/game.js';
import { ROAD } from '../js/cue.js';
const args = process.argv.slice(2), val = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? +args[i + 1] : d; };
const L = ROAD.lane, CELL_R = 0.45, CAN_R = 1.0;
export function overlaps(g) {
  const hits = [], veh = g.veh, ahead = aheadFor(g);
  const test = (kind, key, x, z, r) => {
    const dz = z - g.gd; if (dz < -8 || dz > ahead) return;
    for (let i = 0; i < NV; i++) {
      const o = i * VF, t = veh[o]; if (!t) continue;
      const w = HALF_W[t] + (t === T_BLOCK || t === T_WEAVE ? 0.75 : 0);
      if (Math.abs(veh[o + 1] * L - x) < w + r && Math.abs(veh[o + 2] - z) < HALF_L[t] + r) hits.push({ kind, key, veh: veh[o + 8], type: t, moving: veh[o + 6] !== 0, dz });
    }
  };
  for (let i = 0; i < NC; i++) { const o = i * CF, n = g.cel[o]; if (!n) continue; for (let k = 0; k < n; k++) if (!(g.cel[o + 4] & (1 << k)) || ((g.cel[o + 8] & (1 << k)) && g.gt - g.cel[o + 7] < 0.15)) test('cell', i + ':' + Math.round(g.cel[o + 2] - g.tr) + ':' + k, ((g.cel[o + 4] & (1 << k)) ? g.cel[o + 9] : g.cel[o + 1]) * L, g.cel[o + 2] + k * g.cel[o + 3], CELL_R); }
  for (let i = 0; i < NI; i++) { const o = i * IF; if (g.itm[o] === 1 && (!g.itm[o + 5] || g.gt - g.itm[o + 5] < 0.15)) test('canister', i + ':' + Math.round(g.itm[o + 2] - g.tr), g.itm[o + 1] * L, g.itm[o + 2], CAN_R); }
  return hits;
}
if (process.argv[1].endsWith('pickup-overlap.mjs')) {
  const seeds = val('seeds', 8), secs = val('secs', 240);
  const last = new Map(), moves = { slideNear: 0, snapFar: 0, fadeNear: 0, cellLines: new Set(), cans: new Set() };
  const track = (k, v) => { (k.includes('/c') ? moves.cellLines : moves.cans).add(k); const p = last.get(k); last.set(k, v); if (p === undefined || p === v) return;
    const near = v.endsWith('!'), a = p.replace('!', ''), b = v.replace('!', ''); if (a === b) return; if (b.startsWith('gone')) moves.fadeNear += near ? 1 : 0; else if (near) moves.slideNear++; else moves.snapFar++; };
  let total = { cell: 0, canister: 0, frames: 0 }, episodes = new Map();
  for (let s = 0; s < seeds; s++) {
    const seed = 1000 + s * 7919, r = play(seed, secs, { nitro: args.includes('--nitro'), seek: args.includes('--nitro') });
    for (let T = 2; T < 1.9 + secs; T += 1 / 60) {
      const st = r.tl.stateAt(T); if (st.over) break;
      for (const h of overlaps(st.g)) { total[h.kind]++; const k = seed + '/' + h.kind + '/' + h.key + '/' + h.veh; if (!episodes.has(k)) episodes.set(k, { ...h, seed, T: +(T - 1.9).toFixed(2) }); }
      total.frames++;
      const g = st.g;
      for (let i = 0; i < NC; i++) { const o = i * CF; if (!g.cel[o]) continue; const k = seed + '/c' + i + ':' + Math.round(g.cel[o + 2] - g.tr); const v = (g.cel[o + 8] ? 'gone' + g.cel[o + 8] : g.cel[o + 5]) + (g.cel[o + 2] - g.gd > aheadFor(g) - 40 ? '' : '!'); track(k, v); }
      for (let i = 0; i < NI; i++) { const o = i * IF; if (!g.itm[o]) continue; const k = seed + '/n' + i + ':' + Math.round(g.itm[o + 2] - g.tr); const v = (g.itm[o + 5] ? 'gone' : g.itm[o + 3]) + (g.itm[o + 2] - g.gd > aheadFor(g) - 40 ? '' : '!'); track(k, v); }
    }
  }
  const eps = [...episodes.values()];
  console.log(`frames ${total.frames} · overlapping frames: cells ${total.cell}, canisters ${total.canister} · episodes ${eps.length} (cells ${eps.filter((e) => e.kind === 'cell').length}, canisters ${eps.filter((e) => e.kind === 'canister').length}, by a car changing lanes ${eps.filter((e) => e.moving).length})`);
  console.log(`pickups: cell lines ${moves.cellLines.size}, canisters ${moves.cans.size} · slid across in view ${moves.slideNear}, moved out at the horizon ${moves.snapFar}, faded out in view ${moves.fadeNear}`);
  for (const e of eps.slice(0, 12)) console.log(JSON.stringify(e));
  process.exitCode = eps.length ? 1 : 0;
}
