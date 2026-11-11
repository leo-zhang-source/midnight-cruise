// Development aid: the fairness soak with some constants overridden.   node tools/vary.mjs '{"shiftP":[0,0,0,0]}' [seeds] [secs]
import { GAME } from '../js/cue.js';
import { play } from './bot.mjs';
const [json = '{}', n = '16', secs = '300', nitro = ''] = process.argv.slice(2);
Object.assign(GAME, JSON.parse(json));
let fails = 0; const by = {};
for (let k = 0; k < +n; k++) {
  const r = play(1000 + k * 7919, +secs, { nitro: !!nitro, seek: !!nitro });
  const ev = r.tl.gameEvents(0, 1e9), first = ev.find((e) => e.k === 'stumble' || e.k === 'crash' || e.k === 'bust');
  if (r.stats.over || r.stats.stumbles) { fails++; process.stdout.write(`[seed ${1000 + k * 7919} @${first ? first.t.toFixed(1) : "?"}] `); const key = first ? first.k + ':' + (first.by || '') : '?'; by[key] = (by[key] || 0) + 1; }
}
console.log(json, `${fails}/${n} failed`, JSON.stringify(by));
