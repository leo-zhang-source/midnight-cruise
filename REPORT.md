# MIDNIGHT CRUISE — 1986 · Report

## Revision 2: after the first listen

Your feedback was that the slam chord sounded like noise and that the site played no sound.

- **No sound.** The dev server ran inside my sandbox, so your browser could not reach it. Separately, opening `index.html` from disk breaks ES modules and the AudioWorklet. Fixes:
  - The server now listens on IPv4 and IPv6.
  - A single-file standalone build (`dist/midnight-cruise.html`) works from disk with sound, and `index.html` opened from disk redirects to it.
  - The worklet ships as an import-free bundle, loaded from a `data:` URL when offline.
  - The context re-resumes on any gesture, and the deck's LCD shows `NO AUDIO` or `TAP TO RESUME` instead of failing silently.
  - Audio start-up is verified in Chrome and WebKit (Safari's engine), both served and from disk.
  - **Follow-up: it was still silent.** Tested in your own Chrome, the real cause showed itself. On a non-secure origin the browser provides no AudioWorklet at all, so the engine failed before START. Your Chrome refused connections to `localhost`, leaving the LAN address, which is non-secure; embedded app previews are a similar case. The engine now falls back automatically to a ScriptProcessorNode running the same `Synth`, with a worklet-compatible message port, so the timeline, samples and clock mapping are unchanged. Verified in your Chrome over the LAN address: context running at 48 kHz, 9/9 samples, signal flowing, audio clock within 0.1 ms of the picture. Both modes are also verified in Chrome and WebKit, served (`?audio=compat` forces the fallback) and from disk.
- **The noisy slam.** The noise came from synthesised white-noise layers: the crash, the "impact" burst, the noise snare and a noisy riser. Fixes:
  - Drums and cymbals now come from a CC0 library (Freesound, listed in CREDITS.md): a LinnDrum gated-reverb snare, a real Zildjian crash, a real reverse cymbal, 909 kick and hats, Oberheim DX fills, Simmons-style toms and an 808 clap.
  - The impact noise burst is now a clean low thump.
  - The Fmaj9 slam chord is re-voiced: 2 saws per note at ±6 c (was ±11), a softer filter, a sine sub, and chorus width.
  - The riser is mostly tonal.
  - Measured over the 0.8 s after the slam, spectral flatness fell from 0.68 to 0.55 (0 = tonal, 1 = noise) and energy above 4 kHz from 13.6 % to 4.9 %.
  - The previous render is kept as `renders/audio/ignition_v1_synth_only.wav` for A/B comparison.

## Revision 34: sound, impact and the feel of the chase

The brief was the sensory side, with the judgement left to me. What was weak, judged from the code, from measurements of every sound and from frames of the key moments:

| Where | What it was | Why it fell short |
|---|---|---|
| Ramming a car in a nitro burst | a click and two sine sweeps, 0.3 s, centred at 480 Hz | the most rewarding moment in the game sounded like a menu button |
| The helicopter's guns | six descending sine blips, −29 dB, 320 Hz | not gunfire; quieter than a passing car |
| Attack warnings | three identical 1.9 kHz blips at −39 dB for every unit | nearly inaudible, the same for all three units, and no sense of how long until the hit |
| A hit that costs a life | a random shake, a white flash | no direction, no weight, nothing that marked it as the moment it went wrong |
| The last life | a line of text and red stars | the most tense state in the game felt like any other |
| Speed | radial blur, fixed field of view | 550 MPH looked much like 250 |
| Nitro | flame, field of view, a musical stinger | no physical sense of firing |
| The music | the same at one star and at five | the chase escalates and the soundtrack does not notice |

### What was built

**Sound** (`js/audio/synth.js`; all synthesised)

| Sound | Now | Level over its first 0.3 s (was) |
|---|---|---|
| Smash | **Crunch**: body thump, noise crack, seven inharmonic metal modes with their own decays, glass tinkles, debris rattle in clumps; panned to the lane; heavier for trucks and cruisers | −19 dB (−23) |
| Ploughing through a vehicle (a life lost) | the big crunch plus a sub boom | −13 dB (it played the smash) |
| Crash (run over) | the big crunch, an impact, the tape squeal | −13 dB (−17) |
| Sideswipe, grappler, interceptor slam | **Scrape**: band-noise grind swept about, sparks crackling in it, a squeal, a thump | −19 dB (−22) |
| Helicopter strike | **Gunfire**: 22 rounds a second for the length of the strike, crack + thud + body, ricochets, room; panned | −25 dB (−29); brightness 6.1 kHz (0.3) |
| Attack warnings | **Countdown**: beeps accelerating from 0.17 s apart to 0.04, rising in pitch, ending exactly at the strike; grappler 1.25 kHz, interceptor 1.55, helicopter 1.9 | −31 dB (−39) |
| Gear change | blow-off hiss and gearbox clunk | −29 dB |
| Dodge | a short air swish | −32 dB (was silent) |
| Canister | a short charge, then the chime | −33 dB |
| Threat level up | the three tones plus a sub boom and a cymbal | |
| Nitro burst | a sustained jet roar and rumble, following the boost, crackling | (new) |
| Engine at speed | a turbo whine rising with speed | (new) |
| Last life | a lub-dub heartbeat on every beat of the music; the music low-passed to 2.6 kHz | (new) |
| Music under big hits | ducked by 2.5 to 8 dB for the length of the hit, back over 0.35 s | (new) |

**Music that follows the chase** (`cruiseBar` in `js/cue.js`): from ★★★ a low 16th-note pulse on the chord root; from ★★★★ a tom run into every fourth bar; at ★★★★★ a brass stab on every other downbeat and a high root–fifth alarm on the beat (left out under the lead hook). Loudness stays within 1.4 dB from one star to five (the glue compressor holds it): the music gets denser, not louder. The limiter does at most 3 dB of gain reduction in a full five-star run, over 1 dB in 2.4 % of blocks.

**Impact** (`js/director.js`, `js/gameview.js`, `js/post.js`)

| | |
|---|---|
| Hit-stop | the picture holds and catches up: smash 35 + 60 ms, hit 90 + 140 ms, crash 140 + 200 ms (sound is not delayed). It re-simulates from the last checkpoint while it holds: 0.6 ms a frame on average, 1.6 at worst |
| Camera | a decaying kick towards the side of the hit; gunfire within a lane and a half rattles it; field of view punches in 4.5 % on a smash, out 6 % on a hit; opens up to 8 % with speed |
| Flashes | tinted by cause: amber smash, red police hit, white-hot crash, magenta level-up, red and blue alternating on a new star, cyan on a canister and a dodge |
| Sparks | streaks drawn along their flight, with gravity: 30 from a smash (40 from the car), 26 along your flank on a sideswipe, 22 from the grappler or a helicopter hit |
| Smash light | the grid under the wreck lit for 0.1 s, a ring running out to 19 units |
| Nitro | a shockwave ring over the grid, 73 units out in 0.7 s, with a white inner ring |
| Last life | red edges pulsing lub-dub with the heartbeat; the car trailing smoke and shedding sparks |
| Speed | 44 streaks of light at the roadside and overhead, turned to face the camera, longer and brighter from 290 MPH up |
| Score | jumps by up to 22 % and goes warm on a smash, a close call or a dodge |

### Checked

| Check | Result |
|---|---|
| Every new sound measured (level, length, brightness) and in a full five-star run (loudness by wanted level, limiter load) | as above |
| Hit-stop: picture time against real time around a hit | holds 5 frames at 60 fps, catches up over 9 |
| Frame cost, 1920×1080 | 6 to 10 ms (as before) |
| `tools/game-test.mjs` | 82 pass |
| Browser suites | game-ui 43, interact 41, touch 8, auto-env-test 7, all pass; no console errors |
| Smoke tests | the three built pages pass at a five-star moment; the audio smoke test finds the worklet running with signal |
| Looked at | a nitro burst and three smashes, a hit from the helicopter, the last life, a crash, top speed |

A 30-second render of a five-star stretch with all its sounds is in the session folder as `five-star-sound-check.wav`.

### Not checked, and known limits

- **I have not heard any of it.** The levels are set against the existing effects and the music by measurement. The crunch in particular is synthesis: whether it reads as metal and glass or as noise is for an ear to say.
- **The countdown beeps are one more sound** at five stars, where up to three attacks can overlap; the three pitches are there to keep them apart.
- **Hit-stop delays the picture, not the input.** A lane change pressed during a 90 ms hold happens on time and shows when the picture catches up.
- **The speed streaks are faint** on the two warm colour presets.

## Revision 33: a third more top speed, denser traffic later, random swerves

Three things were asked for: more traffic later in a run, a higher chance of ordinary vehicles swerving, and a third more top speed. All three are done.

| | Revision 32 | Now |
|---|---|---|
| Top speed | 413 MPH (172 u/s) | 550 MPH (229 u/s), a third more |
| … reached | about 3 min in | about 5 min in (41.5 km): the car keeps gaining the whole run |
| Speed at 1 / 2 / 3 / 4 / 5 min (measured) | — | 243 / 310 / 379 / 463 / 546 MPH |
| Rows of traffic in top gear | 0.85 s apart throughout | 0.85 s, closing up 1.5 % a level to 0.68 s from level 14 |
| Vehicles passed in the next lane, per minute (1st … 5th minute, measured) | 37 41 41 39 42 | 37 44 45 51 59 |
| Swerves (a sudden swerve towards a lane line and back) | none | each vehicle, every 2 s: a 4 % chance at level 0, 55 % from level 17 |
| … how big, how quick | — | 0.6 units in 0.8 s at first, 1.2 units in 0.45 s at the most |
| Share of time a vehicle is mid-swerve | — | 1.3 % at the start, 8 % after five minutes |
| Grace after a nitro burst | 0.7 s | 1.0 s |

**Swerves** are decided per vehicle and per two-second window from a hash, so they are the same however the timeline is stepped, rewound or replayed. With the wander, a vehicle is at most 2.2 units off its lane centre: its body then reaches 0.7 units into the next lane, and a car there is still 0.8 units clear of it. The forecast now always counts a vehicle in the lane it belongs to, however far it is swerving.

**Density had to be capped at 20 %.** Rows 30 % closer cost one run in 120 (a weaving cruiser followed by a row that a lane change had left nowhere to go). 0.68 s in top gear is the closest rows have ever been and stayed passable.

**Denser traffic leaves less room for everything else.** Cut-ins and police attacks need gaps, and denser rows have fewer:

| Per minute, 3rd … 5th minute (40 runs) | Revision 32 | Now |
|---|---|---|
| Cut-ins aimed at you | 8.3 10.5 10.6 | 7.4 6.7 6.3 |
| Police attacks | 17.8 19.3 22.8 | 16.1 14.9 15.8 |
| Vehicles passed close by | 41 39 42 | 45 51 59 |

So late in a run there is more traffic and it is faster and swervier, with somewhat fewer deliberate incidents. A tighter planning margin (half the slack) gave back nearly all the cut-ins and attacks, but lost one run in 120 and one in 40 with nitro, so it was not kept.

**The nitro grace.** A burst at the new top speed peaks at about 1,000 MPH (the speedometer stops at 999). Coming out of it, the car needs longer to settle than before: with 0.7 s of grace the nitro bot was hit in one run in 40. With 1.0 s, none in 80.

### Checked

| Check | Result |
|---|---|
| Bot, no nitro, 120 seeds × 5 minutes | no hit in any run |
| Bot, no nitro, 12 seeds × 10 minutes | no hit in any run |
| Bot firing every canister, 80 seeds × 5 minutes | no hit in any run |
| `tools/game-test.mjs` | 82 pass (new: random swerves; the wander test split from it) |
| Browser suites | game-ui 43, interact 41, touch 8, auto-env-test 7, all pass; no console errors |
| Smoke test on the built pages | passes at a five-star moment on all three |
| Audio thread (runs the same simulation, now with up to 64 vehicles) | 99.9 % of blocks under 0.5 ms of the 2.67 ms each has, late in a run |
| Looked at | frames at 455 and 543 MPH, level 11 and 14, with a car mid-swerve beside the player |

### Not checked, and known limits

- **Not played by hand.** 550 MPH is fast: whether the grid and the traffic still read at that speed is for a person to judge. The road speed is `gears` + `creep` in `js/cue.js`.
- **Cut-ins are down** late in a run, as above. If the deliberate blocking matters more than the density, `dens` is the number to lower.
- **The speedometer stops at 999** in a nitro burst at top speed.

## Revision 32: no brake, the grid back, traffic that turns on you, a much steeper climb

Six things were asked for after Revision 31. All six are done.

| Asked for | What was done |
|---|---|
| Remove the brake | Gone: the button, the Space and ↓ keys while driving (Space still starts and resumes), the rule that lingering on it brought the police up, the hint line, the control row. The car drives flat out. |
| The road surface back to the neon grid | The asphalt, lane dashes, shoulder and guardrail of Revision 31 are removed. The road is three cells of the grid between the bright rails again, with the reflector posts on the rails. The bends and rises stay: the grid bends with the road. |
| The pass-by sound cannot be heard | Rebuilt and raised by 10.6 dB (measured below). |
| Still too easy, and it gets harder too slowly | The threat level now rises every 20 s instead of 40, its effects run further, stars come sooner, and three units may attack at once late on (table below). |
| Traffic that is always moving, more and more; less and less reaction time; vehicles that deliberately block you, more and more suddenly | New: every vehicle wanders in its lane, vehicles change lane all the time, and some cut in on you on purpose. All three grow with the level, and the time you are given to react falls to 0.28 s. |
| The helicopter's three-lane attack: the order cannot be read | It now lights and fires on one lane at a time, quickly, and chevrons across the road show which way it is going. |

### The traffic

Until now traffic was rows of vehicles that held their lanes, apart from a taxi or a merging car at a planned moment. Now:

| | Level 0 | Level 7 (2 min 20 s) | Level 15 (5 min) |
|---|---|---|---|
| Wander across the lane, either way | 0.2 units | 0.6 units | 1.0 unit (the most; a car is 2 wide, a lane 5) |
| A lane change: signal, then the move | 0.45 s, 0.85 s | 0.30 s, 0.69 s | 0.12 s, 0.50 s |
| Lane changes around you, per minute (measured in the first, third and fifth minute) | 11 | 21 | 35 |
| … of which cut-ins aimed at you | 4.4 | 8.1 | 9.9 |
| Time from a cut-in's signal to reaching it (measured) | 2.81 s | 2.19 s | 1.67 s |
| Reaction time everything allows you | 0.72 s | 0.48 s | 0.28 s (the floor, from level 13) |

**Cut-ins.** A vehicle in the lane beside yours waits until its moment and cuts into your lane; or, if the forecast says you are about to change lane, a vehicle beside that lane cuts into it instead. It picks the latest moment that still leaves you the reaction time, plus a margin that shrinks with the level. It is marked: red chevrons, larger the further away it is, and a horn. 63 % of cut-ins went into the lane the car was in, the rest into the lane it needed next.

**Why they are fair.** A lane change is a decision like a police attack: it is laid over the forecast and made only if a driver given the reaction time for the level, a slightly slow lane change and a tenth of a second of slack still has a way through. One thing is new in that test: the way through must end in the lane the next row of traffic was laid out to count on. Without that, a vehicle changing lane far ahead could leave you on the wrong side of a row that had not been laid out yet.

**What it cost.** Rows of traffic are a little further apart (1.1 to 0.85 s, was 1.05 to 0.68 s). With the old spacing there was no room for anything to change lane fairly: cut-ins were 16 in five minutes. With the new spacing they are 41, and every police unit attacks more often as well, because their attacks need the same room.

Two things had to be fixed before cut-ins grew with the level rather than dying away:

1. The vehicles drifting between lanes for no reason were using up the ones that could have cut in: a vehicle that has just moved cannot move again at once. In the last minute of a run only ten free vehicles a minute came into range. Drifting is now done far enough ahead to be over before a vehicle's chance to cut in comes.
2. Making cut-ins later narrows the window in which one can start, down to a third of a second at the top level, where almost none found room. The margin now stops shrinking at 0.8 s.

### The climb

| | Revision 31 | Now |
|---|---|---|
| Threat level rises every | 40 s | 20 s |
| Stars arrive after | 1.4, 3.4, 6.4, 10.4 km | 1, 2.4, 4.4, 7 km |
| The bot reaches ★★ / ★★★ / ★★★★ / ★★★★★ at | 22 / 45 / 74 / 109 s | 16 / 34 / 55 / 78 s |
| Warnings | 1.20 s falling to 0.87 s over 6 min | 1.17 s falling to 0.73 s over 4 min 20 s |
| Least pause between attacks | 0.6 s | 0.35 s |
| A unit's own interval at its shortest | half | a third (level 20) |
| Attacks at once | two at five stars | two at five stars, three from level 14 |
| Least wanted level | ★★ from 2 min, ★★★ from 4 min | ★★ from 80 s, ★★★ from 160 s, ★★★★ from 280 s |
| Top speed | 374 MPH | 413 MPH, reached sooner |
| Nitro canisters at their scarcest | 50 % further apart | 60 % |

What a five-minute run holds (bot without nitro, 40 runs):

| | Revision 31 | Now |
|---|---|---|
| Grappler runs | 25.6 | 35.3 |
| Helicopter attacks | 13.0 (6.5 / 2.8 / 3.7 by kind) | 27.3 (12.2 one lane / 7.1 twin / 8.0 barrage) |
| Interceptor swerves | 4.6 | 8.4 |
| Cruisers that cut you off | 9.3 | 11.1 |
| Two or three attacks at once | 6.0 | 18.1 |
| Cut-ins by traffic | — | 41.1 |
| Other lane changes around you | about 4 (taxis and merges) | 79.7 |
| Police attacks dodged | 42.7 | 70.3 |
| Share of the run at five stars | 63 % | 73 % |
| Distance | 36.6 km | 39.6 km |

### The barrage

Before: all three lanes were lit from the start, with targets that differed only in how fast they blinked, and the strikes came 1.15 s apart. Now: only the lane about to be hit is lit; the next lights the moment that one is fired on; the strikes are 0.35 s long and 1.05 s apart; chevrons across the road ahead run the way the barrage is walking; the call-out says BARRAGE LEFT → RIGHT or RIGHT → LEFT. Twin searchlights are unchanged.

The gap between strikes could not be made shorter than this. With 0.6 s between the end of one and the start of the next there was no opening at all in forty five-minute runs: a driver has to wait for the lane behind the barrage to be clear, change into it and be out of the next one in that time. 0.7 s is the least that works.

### The pass-by sound

| | Revision 31 | Now |
|---|---|---|
| Level over its first 0.3 s | −34.3 dB | −23.7 dB |
| Against the music in its own bands | not measured (below it) | 5.1 dB above at 2 kHz, 6.7 dB above at 3.15 kHz |
| Peak | 0.11 | 0.44 |
| Shape | a low rush, 0.26 s | brighter, a clearer fall in pitch, 0.34 s (a truck 0.55 s and lower) |

For scale: the coin that could be heard was 9 dB above the music in its band; the music as a whole is at −15.7 dB. The horn on a cut-in is at −28 dB, the level of the near-miss sound.

### Checked

| Check | Result |
|---|---|
| Bot, no nitro, 40 seeds × 5 minutes (to level 15) | no hit in any run |
| Bot, no nitro, 12 seeds × 10 minutes (to level 30, everything at its limit) | no hit in any run |
| Bot using nitro, 40 seeds × 5 minutes | no hit in any run |
| `tools/game-test.mjs` | 81 pass. New or rewritten: no brake, the wander, lane changes steered and across in time, lane changes getting more sudden, cut-ins into our lane and getting later, the reaction floor, every attack and cut-in re-checked for a way through |
| Browser suites | game-ui 43, interact 41, touch 8, auto-env-test 7, all pass (fewer than before: the brake's checks are gone); no console errors |
| Smoke test on the built pages | passes at a five-star moment on all three |
| Looked at | a cut-in and the barrage frame by frame at 960×540; the grid road in a bend |

Two faults found and fixed on the way: with the reaction time at its floor the helicopter never attacked again (its warning was one twentieth of a second too short for the planner's own arithmetic, so it stopped after about four minutes in every long run); and a vehicle finishing a lane change jumped sideways by the width of its wander for one step.

### Not checked, and known limits

- **I have not played it or heard it.** The levels above are measurements. Whether 0.28 s is survivable for a person is exactly the kind of thing only play shows; the bot reads every signal the instant it appears. If the top is now too hard or still too easy, the two numbers that matter are `react` (how little time you get) and `lvEvery` (how fast the level rises) in `js/cue.js`.
- **Cut-ins stop growing after about four minutes** (10 a minute): by then the window in which one can start fairly is as short as it can usefully be.
- **Traffic further than 5.6 s ahead does not change lane**, only wanders. Far off it still looks like rows.
- **The chevrons that show the barrage's direction are orange on an orange road in two of the four colour presets** and are easy to miss there; the lit lane and the call-out carry the order.
- **Rows are further apart than before.** If the road now feels emptier between incidents, `rowGap` is the number; closing it up costs cut-ins.
- **The wander is steady, not a reaction to you**: a vehicle drifting towards your lane is not about to enter it unless it signals.

## Revision 31: a real road, a game that keeps getting harder, police that plan

Four things were asked for: the coin sound off, difficulty that grows markedly and across the board with time, enemies with real intelligence and varied attacks, and much more realistic highway driving. This revision does all four. The numbers below are from `tools/bot.mjs` unless said otherwise.

### 1. The coin sound is off

Taking an energy cell makes no sound. The `Coin` voice and its trigger are removed from `js/audio/synth.js` and `js/ui.js`; cells still score and still earn tapes.

### 2. The road

The game was played on three cells of a neon grid, dead straight and dead flat. It is now a road.

| | Before | Now |
|---|---|---|
| Surface | grid cells, cross lines every 5 units | asphalt: a grain drawn out along the direction of travel, patches of wear, an expansion joint every 30 units |
| Lane lines | grid lines | white dashes, 5 units long every 15, blurred by speed; they brighten in the car's headlamps |
| Edges | bright grid lines | solid edge lines, a 3-unit hard shoulder each side, a steel guardrail on posts every 15 units beyond it, reflectors on every other post (amber left, white right) |
| Shape | straight, flat | sweeps left and right (up to 16° of heading, tightest radius about 760 units) and rises and falls over crests (±12 units) |
| Camera | fixed heading | looks 30 units along the road, so it turns into each bend; leans slightly into it; pitches with the gradient |
| Car | upright | sits on the gradient, leans out of the bend, points along the road |
| Sun, city, mountains | fixed on screen | swing across as the road turns and come back |

How the shape is done (`js/road.js`): the game itself is unchanged, still three straight lanes. The picture bends it. The centre line is a sum of three sine waves of unrelated lengths (2,300, 1,310 and 760 units) and the height a sum of two (2,900 and 1,170), so it never repeats and always returns to the line that leads to the sun. Every vertex of the world is moved by that function of its distance (one shared GLSL chunk in the ground, palms, vehicles, helicopter, lights, signs), the ground became a strip of 230 rows so it can follow, and the camera turns to the tangent. The first 140 units of a run are straight, so the roadside opening is as before. With reduced motion the road stays straight.

Driving feel:

- **The car accelerates all the way.** The road speed used to step up at each gear. It now rises without a step: 139 MPH off the line, 269 MPH as top gear engages 6.4 km in, and on to 374 MPH (was 336).
- **The engine works through its gears.** Its note follows the revs: it climbs through each gear and falls back at the change, with a short glide so the change is heard as one.
- **The car has weight.** It gains speed at no more than 34 units/s² (80 off the line, 170 in a nitro burst) and sheds it at no more than 64. Braking to 55 % takes about a second and getting the speed back about two; both used to be near instant.
- **Traffic goes by with a sound.** A vehicle passed in the next lane is heard on its side; a truck is lower and longer.
- **Ordinary traffic changes lane.** Cars and vans signal and merge from a side lane into the middle, timed like the taxi.
- **Traffic is visible sooner.** It is laid out 6.6 s of driving ahead (it was 340 units, 4 s at top speed).

### 3. Difficulty grows with time

Two clocks now run. The wanted level has five stars instead of three and still follows the road since the heat was last cooled. The **threat level** is new: one more every 40 seconds, never down, shown as LV beside the stars.

| With each threat level | Level 0 | Level 5 (3 min 20 s) | Level 10 |
|---|---|---|---|
| Length of every warning | 1.20 s | 1.03 s | 0.87 s (the floor, reached at level 9.4) |
| Pause between attacks at the least | 1.8 s | 1.2 s | 0.6 s |
| A unit's own interval | × 1 | × 0.67 | × 0.5 |
| Helicopter attacks per visit | 3 | 4 | 5 |
| Rows that are police (at five stars) | 31 % | 35 % | 39 % |
| Weight of single-vehicle rows in the mix (the rest are pairs, convoys, lane-changers) | 0.40 | 0.31 | 0.22 |
| Nitro canisters | every 30–45 s | 25 % further apart | 50 % further apart |
| Least wanted level | ★ | ★★ (from level 3) | ★★★ (from level 6) |

Stars arrive after 1.4, 3.4, 6.4 and 10.4 km of road. The bot reaches ★★ 22 s into a run, ★★★ at 45 s, ★★★★ at 74 s and ★★★★★ at 109 s, and spends 63 % of a five-minute run at five stars. The third nitro burst used to wipe the heat to one star; it now cools it by two.

What a five-minute run holds (average of 120 runs, bot without nitro):

| | Revision 29 | Now |
|---|---|---|
| Distance | 34.6 km | 36.6 km |
| Grappler runs | 2–3 | 25.6 |
| Helicopter attacks | about 6, one kind | 13.0, three kinds (6.5 one lane, 2.8 twin, 3.7 barrage) |
| Interceptor | — | 12.9 visits, 4.6 swerves |
| Cruisers that cut you off | — | 9.3 |
| Two attacks at once | never | 6.0 |
| Police rows ahead | 43 | 43 (32.0 roadblocks, 11.3 weavers), plus the 9.3 above |
| Attacks dodged | — | 42.7 |

### 4. Police that plan

Before, each unit attacked on its own timer whenever a lane beside you was clear. Now there is one shared picture of the road and every decision is made on it.

**The forecast** (`js/foresight.js`). A grid of three lanes by time, in steps of 0.05 s, 5.8 s ahead: where each lane will be blocked by every vehicle (with its lane speed, a roadblock's braking, a weaving cruiser followed step by step, a lane-changer's signal and move) and by every attack already under way.

**The decision.** Twenty times a second, each unit that is ready lays its attack over the forecast and asks: would a driver in your lane still have a way through? The driver it assumes is slower than the car: he needs the reaction time for the level before his first move, 0.4 s for a lane change (the car takes 0.3) and 0.2 s in the new lane before the next, and everything on the forecast is taken to last 0.1 s longer at either end. If there is no way through, the unit waits. If there are several ways to attack, it takes the one that leaves the hardest way out.

**The units and their attacks**

| Unit | From | Attack | The way out |
|---|---|---|---|
| Pursuit cruiser | ★★ | the grappler: lunges up your lane from behind | change lane |
| Helicopter | ★★★ | one lane | change lane |
| | ★★★★ | twin searchlights: your lane and the one beside it that leaves the harder escape | the dark lane, which may be two lanes over |
| | ★★★★★ | walking barrage: all three lanes, one after the other, 1.15 s apart | out of each lane before its turn, back into the wake |
| Interceptor (new) | ★★★★ | comes up the hard shoulder on your side, rides level, signals, swerves into your lane: one lane from the shoulder, or straight across a side lane into the middle | the other way |
| Cruiser ahead (new) | ★★★★ | waits in the middle lane until you are 1.8 s away, then cuts into whichever lane you are in | the lane it left |
| Any two | ★★★★★ | pincer: a second attack while the first is under way, checked against it | whatever the two leave |

**What makes it more than timers**

- **They take turns**, longest-waiting unit first, and an interceptor on its way goes before the others. Without this the grappler, which is the easiest attack to find room for, took most of the openings.
- **They learn which way you dodge.** Each dodge moves a running average. Past ±0.15 the interceptor comes up that shoulder and the twin searchlights take that lane first.
- **They have the traffic held back for set pieces.** The interceptor's swerve, twin searchlights and the barrage are asked for 3.4 s ahead; the traffic leaves 1.5 to 3.1 s of empty road, strung with cells, and the attack comes when the gap does. Without this the barrage found an opening about 0.4 times in five minutes; with it, about 3.6.
- **They hold off near anything unsettled.** A cruiser still weaving and a cruiser waiting to cut you off have not picked a lane, so no plan can be made round them. An attack must be over 2 s before you reach one, or 0.8 s if the attack drives you into the middle lane, from where either can still be dealt with. And no such cruiser is sent into an attack that will still be going on when you reach it.

- **A hit calls the others off.** With two units attacking at five stars, being hit by one could have meant losing the second life to the other a second later. A warning or a lock still running when you are hit is dropped, and nothing new starts for 2.5 s.

Each dodge of a police attack scores 300 × the multiplier and is called out (DODGED).

### Checked

| Check | Result |
|---|---|
| Bot, no nitro, 120 seeds × 5 minutes (to level 7) | no hit in any run |
| Bot, no nitro, 16 seeds × 10 minutes (to level 15) | no hit in any run |
| Bot using nitro, 40 seeds × 5 minutes | no hit in any run (it was 1 in 16 before) |
| `tools/game-test.mjs` | 77 pass, 16 more than before: stars, threat level, each new unit, the barrage's order, "every attack leaves a way through" re-checked at the moment of each of the attacks in a run, warnings shortening, the car's weight, ignoring the interceptor |
| Browser suites | game-ui 45, interact 46, touch 9, auto-env-test 8, all pass; no console errors |
| Smoke test on the built pages | passes at a five-star moment |
| Frame cost, 1920×1080 | 6 to 9 ms a frame (16.7 available); phone size 5 ms |
| Audio thread, which runs the same simulation | 9.5 % of one core; 99.9 % of blocks under 0.5 ms of the 2.67 ms each has, late in a five-star run |
| Looked at | 58 captured scenes at 1280×720 (every unit and attack, panels, home, rewind), three phone frames, one reduced-motion frame |

Three things the soak found and that were fixed on the way, because they say what the margins are:

1. **Attacks longer than the view.** The barrage lasts nearly 4 s; at top speed traffic was only visible 4 s ahead, so a row could appear after the attack was committed and need the lane the barrage had driven you out of. Traffic is now laid out 6.6 s ahead.
2. **Ways through with no room to spare.** A forecast is a tenth of a second off now and then (a cruiser dropping back eases off for a moment first). Plans that depended on the exact tenth failed 3 runs in 40. The slack described above is what cured it.
3. **The two-lane dash.** After a set piece that leaves you on one side, a roadblock that leaves only the far lane asks for two lane changes in under a second. The police's assumed driver now pauses 0.2 s between lane changes, which rules those out.

### Not checked, and known limits

- **I have not played it by hand or heard it.** Sound levels were measured, not listened to: the pass-by sound is at the level of the existing siren and gear sounds (−34 dB over its first 0.3 s, the music is at −16 dB), the tyre squeal 4 dB above it, the engine with wind and siren together at −32 dB. Whether the difficulty curve feels right to a person is a judgement only play can make; the bot does not tire or misread.
- **The bot is the bar, and the bot is good.** "No hit" means a way through always exists for a driver who reads every warning at once. The reaction time the police allow (0.75 s at level 0, 0.42 s from level 9) is the knob if it proves too hard or too easy: `react` in `js/cue.js`.
- **The interceptor often comes and goes without swerving** (4.6 swerves in 12.9 visits): it swerves only at a driver it can reach with a way out left. Staying on the far side of the road is a real defence against it.
- **On a phone held upright the interceptor on the shoulder can be off the side of the screen** when you are in the middle lane. The call-out, the flashing corner, the warning over your lane and the chevrons across it are all on screen.
- **Bends are in the picture only.** The car does not drift outward in a bend and nothing in the game depends on the road's shape.
- **Hills never hide traffic in these captures**, but the rises were set by calculation (the far side of a crest drops at most 4 units in 250), not by looking at every crest.
- The chevrons over a signalling vehicle used to point backwards (the point trailed the motion). They now lead it. This changes how the taxi's and the cruisers' signals have looked since they were added.

## Revision 30: the coin as a real square wave, loud enough to hear

(The coin sound was switched off altogether in Revision 31.)

The Revision 29 coin could not be heard in play. Measured inside a run it explains itself: the music and engine sit at −15 dB RMS, with −31 dB in the third-octave band around the coin's first note, and the coin's first note was −30 dB, so it was level with the music it had to be heard over. It was also a softened tone (three harmonics), not the sound the name promises.

`Coin` in `js/audio/synth.js` is now the classic one, written out again from its pattern (no recording of another game is used):

| | Revision 29 | Revision 30 |
|---|---|---|
| Wave | first three odd harmonics | a plain square wave, edges rounded so it does not alias, top taken off above 10 kHz |
| Notes | B5 for 55 ms, then E6 | B5 for 60 ms, then E6 (unchanged in pitch) |
| Second note | fades in about 0.3 s | fades over 0.8 s |
| First note, RMS | −30 dB | −21 dB |
| First note against the music in its band | about level | 9 dB above |
| Peak, one coin / a line of them | 0.05 / 0.056 | 0.11 / 0.14 |

For comparison the Revision 28 chime that was too loud peaked at 0.16 for one and piled up in a line, because nothing cut it off. This one still plays one at a time: the next pickup cuts the last.

**Checked:** rendered offline inside the canonical run (one coin, then five 0.12 s apart): pitches 980 and 1320 Hz, silent after 0.87 s, and the music's low band moves 0.2 dB while coins play, so the limiter is not ducking the music for them. The suites pass (game-test 61, game-ui 44, interact 44, touch 9, auto-env-test 8) and so does the smoke test on the built pages. In `interact` the two checks of the live worklet's signal were skipped this time, because this machine's audio output was not running; the offline render above runs the same synth code. No game rule changed, so the bot soak was not rerun.

**Not checked:** I have not listened to it. The level is set from measurement, halfway (in dB above the music) between the one that was too loud and the one that was inaudible.

## Revision 29: faster and harder, fewer nitro canisters, and a quieter coin

You asked for more difficulty and a higher top speed; then said the pickup sound of Revision 28 was too loud and not pleasant, and to model it on the sounds of good games; then asked for fewer nitro canisters, so that the player is not always quickly back at one star. The game values are in `GAME` in `js/cue.js`.

**Speed.**

| | Before | Now |
|---|---|---|
| Gear 1 → gear 6 | 130 → 230 MPH (54 → 96 units/s) | 139 → 269 MPH (58 → 112 units/s) |
| Past gear 6 | creeps up to 278 MPH (+1 unit/s per 1,000 units, up to +20) | creeps up to 336 MPH (+1 per 800 units, up to +28) |
| Gears engage at | 0.8, 2.0, 3.6, 5.6, 8.0 km | 0.6, 1.5, 2.8, 4.4, 6.4 km |
| Top gear reached (bot, mean of 8 runs) | 111 s into the run | 79 s |
| Distance covered in 5 minutes (bot) | 27.9 km | 34.6 km |

A nitro burst is still ×1.85 on top of that. Traffic still drives at 46 % of your cruising speed, so it is faster too (64 → 124 MPH).

**Difficulty.**

| | Before | Now |
|---|---|---|
| Time between rows of traffic (gear 1 → 6) | 1.10 → 0.72 s | 1.05 → 0.68 s |
| Two stars after | 3 km (49 s for the bot) | 2 km (30 s) |
| Three stars after | 7.5 km (105 s) | 5 km (65 s) |
| Share of rows that are police, at ★★ / ★★★ | 12 % / 18 % | 18 % / 26 % |
| Of those, weaving cruisers | 40 % / 50 % | 50 % / 60 % |
| Police rows met in 5 minutes (bot) | 26 | 43 |
| Grappler runs come every | 3.5 to 5.5 s | 3 to 4.8 s |
| Helicopter | 2 attacks a visit, back after 14 to 22 s | up to 3 a visit, back after 10 to 16 s |

**Nitro canisters.** The third burst clears the heat, so how often canisters come decides how often you are back at one star. The first one still comes about 15 s into a run (it is the second chance after a hit). After that they are twice as far apart: one every 1,800 to 2,700 units gained on the traffic (was 900 to 1,500), which in top gear is one every 30 to 45 s.

Measured with the bot that takes every canister and fires it at once, 12 runs of 5 minutes, both at the new speeds:

| | Canisters every 900–1,500 | Now, every 1,800–2,700 |
|---|---|---|
| Canisters picked up in 5 minutes | 9.2 | 5.0 |
| Heat cleared in 5 minutes | 2.7 times | 1.4 times |
| Time at ★ / ★★ / ★★★ | 17 % / 30 % / 53 % | 12 % / 23 % / 66 % |

**What stays fair.** The bar is unchanged: the bot (no nitro) drives 40 different roads for 5 minutes each without a single hit. Tightening the rows further failed that bar (0.64 s in top gear: 4 of 40 runs took a hit; 0.60 s: 8 of 40), so 0.68 s is where it stops.

**The pickup sound, again** (`Coin` in `js/audio/synth.js`). (Replaced once more in Revision 30: this one could not be heard in play.) The chime of Revision 28 is gone: it peaked at 0.16 of full scale, a sine with a metallic attack, a new note on top of the last one five to seven times a second, climbing a scale. The new one follows the pattern of the classic arcade coin:

| What | How |
|---|---|
| The notes | A short B5 (55 ms), then a jump up a fourth to E6 that rings out over about 0.17 s. The same two notes every time. |
| The tone | A softened square wave: the first three odd harmonics, no metallic attack. |
| One at a time | The next pickup cuts the one before off within 6 ms, so a line of cells is a row of clean pings with only the last one ringing out. |
| The level | Peak 0.05 of full scale (0.056 at the instant one cuts another off), about 10 dB below the chime it replaces and level with the other small effects. |

It is synthesised here, written after that pattern; no audio from another game is used, since those recordings are not free to copy.

**Other changes that follow from the speed.**

- The colour presets change every 40 s or 3,500 road units (was 2,900), so the moods keep their pace at the higher speeds.
- `CANONICAL`, the reference run, is recorded again on the new traffic (clean, two nitro bursts, three stars).
- `tools/game-test.mjs`: the traffic-pace check now allows for a gear step of 12 units/s (it was written for steps of 9).

**Checks.**

| Check | Result |
|---|---|
| Bot soak, no nitro, 40 seeds × 300 s | 40/40 without a hit |
| Bot soak firing nitro, 40 seeds × 300 s | 36/40 without a hit (38/40 before this revision). The nitro bot is not the bar: it fires blind and then has to find its way at ×1.85. |
| `tools/game-test.mjs` | 61/61. The canister check now drives 240 s instead of 150, since canisters are further apart. |
| `tools/game-ui.mjs`, `interact.mjs`, `touch.mjs`, `auto-env-test.mjs` | 44/44, 46/46, 9/9 and 8/8; no console errors. |
| Smoke test of the built pages | The Pages build and both single files load and replay a run to three stars without errors. |
| Looked at | Three in-game frames at 293 to 300 MPH in gear 6 with three stars: road, traffic, police, helicopter and HUD draw as before. |

**Limits.**

- The helicopter and the grappler are allowed to attack more often, but in the bot's runs they did not: about 6 searchlight locks in 5 minutes before and after, and 2 grappler warnings against 3. They wait for a moment when a lane beside you is clear, and with more police ahead there are fewer such moments. The extra difficulty you will feel is the speed, the earlier gears and stars, and the police on the road ahead.
- How hard it feels to a person is not something the bot measures. I did not play it by hand.
- I measured the pickup sound (level, pitch, that one cuts the other off) but did not listen to it.

## Revision 28: the roadside phone removed, a chime for the cells

You pointed at the yellow post beside the road and asked for it to go, and asked for a sound when a diamond is picked up.

**The yellow post is gone.** It was the orange emergency phone that stood left of the rail every 640 units (a dark box with lit edges and a glowing cap). Nothing replaces it; the reflector posts, the roadside signs, the gantries and the billboards stay.

**The cells now ring.** (This chime was replaced in Revision 29: too loud, not pleasant.) There was a sound for them before, but you could not hear it: a 35 ms blip at a third of the level of the other effects. It is replaced (`Coin` in `js/audio/synth.js`):

| What | How |
|---|---|
| The sound | A glassy ping with a struck attack: a sine with a short burst of frequency modulation, an octave partial that dies quickly, about 0.1 s of decay. |
| The pitch | Each cell of a line sounds the next note up the A minor pentatonic scale, the key of the track: A5, C6, D6, E6, G6. A line of five is a rising figure; changing lane into the middle of a line picks the figure up where that cell stands. |
| The level | Peak 0.16 of full scale, about the level of the other game effects (the old blip peaked at 0.035). It alternates slightly left and right from note to note. |
| Where the note comes from | The simulation's `cell` event now carries the cell's place in its line. The rules, the traffic and the scores are unchanged. |

**Checks.**

| Check | Result |
|---|---|
| Offline render of five chimes through the synth | Notes measured at 880, 1060, 1180, 1320 and 1580 Hz (A5 to G6, within the 20 Hz step of the measurement), peak 0.16. |
| `tools/game-test.mjs` | 61/61 |
| `tools/game-ui.mjs` | 44/44, with a new check: taking cells in a run writes one chime per cell, the notes climbing along a line. |
| `tools/interact.mjs`, `tools/touch.mjs`, `tools/auto-env-test.mjs` | 46/46, 9/9 and 8/8; no console errors. |
| Looked at | Six in-game frames over 14 s of a bot run: no orange post beside the road in any of them (one stood in view almost all the time before). |

**Limits.**

- I measured the chime but did not listen to it; whether its level sits well against the music is for your ears.
- I did not play the game by hand.

## Revision 27: the vehicles remodelled, with metal and glass

You asked for the RAZOR to go, and for the other vehicles to be modelled to the standard of the player's car and of the study sheets, with metal and glass that look like metal and glass. The player's car is untouched.

**The RAZOR is gone.** A car in traffic is now a MONOLITH or a NOMAD, in four paints each. Eight vehicles remain.

**The models** (`js/vehicles.js`, rewritten again). Revision 26 built each vehicle from a few six-cornered boxes, 300 to 600 flat faces. Each is now 4,500 to 11,500 triangles, built the way the sheets are drawn:

| What | How it is made now |
|---|---|
| Bodies | Hulls lofted through sections with a sill, dark cladding, a crease at the waist and a chamfered shoulder. The wheel arches are cut out of the section, so you look into a wheel well. |
| Round bodies | The FIREFLY and the ORBIT are smooth: fifty to seventy sections each, shaded round, with crisp edges only where the sheet has them. |
| Arches | Flat-faced flares stand proud of the flank on the NOMAD, WARDEN, RELAY, MULE and LEVIATHAN; a thin lip on the MONOLITH; yellow bulges on the FIREFLY. |
| Wheels | Turned on a lathe: a tyre with shoulders and a tread groove, a bright rim lip, then a flat cover (MONOLITH, FIREFLY, ORBIT), six heavy spokes and a lugged tyre (NOMAD, WARDEN, MULE) or a deep dish round a hub (RELAY, LEVIATHAN). They turn as the vehicle drives. |
| Details | Chamfered blocks for bumpers, lamp bezels, mirrors, roof cases and light pods; round tube for the MULE's frame and bull bar; shut lines for doors, bonnets and cargo panels; slats, vents, door handles, lock rods. |
| Lettering | POLICE along both sides of the WARDEN and across its tail, TAXI on the FIREFLY's sign, hazard stripes under the WARDEN's push bumper and on the RELAY's coupling. |

What each one gained, against its sheet:

- **02 MONOLITH**: round arches, flat wheel covers, grille in a frame between the bracket lamps, the light bar set in a slot, door lines and handles.
- **04 NOMAD**: flared arches, lugged tyres, slats over the rear quarter glass, rails and three strapped cases on the roof, corner-bracket tail lamps in bezels, a heavy bumper each end.
- **05 FIREFLY**: a rounded pod with yellow hoops round the door glass and the windscreen, a black tail panel with the two red rings, the arrow and chevrons on the doors, the lit TAXI sign.
- **06 WARDEN**: a wedge with grey arch armour, white doors with POLICE and three slashes, a red pod and a blue pod, fins on the rear deck, twin red bars either side of POLICE on the tail, the push bumper over hazard stripes.
- **07 RELAY**: an eight-sided pale pod with drawn-in ends, the red arch split by the door seam, wheel pods on a low chassis, a wedge cab with square headlamps, the sensor mast.
- **08 MULE**: six lugged wheels, the orange tube frame round a ribbed bed, the headboard hoop, a generator with its pipe, the bull bar, square-bracket tail lamps on corner posts.
- **09 LEVIATHAN**: five raised bands round the container, lock rods and the two red slashes on the doors, amber top corners, side skirts and markers, a cab with a cyan visor, vents and steps, twelve wheels.
- **10 ORBIT**: one smooth volume, the glass band wrapping into the windscreen, stacked red lamps in bezels, mirrors on arms, and a lit cabin behind the glass.

**The materials** (one shader, a material on every face):

| Material | What it does |
|---|---|
| Metallic paint | The paint's own colour lit by the sky; a clear coat that mirrors the sky, the horizon's glow and the road's lines, more strongly at glancing angles; the same scene reflected again tinted by the metal; flake that sparkles towards the horizon; a soft sheen so dark paints keep their shape. This is the paint model of the player's car. |
| Glass | Black, mirroring the sky more the flatter you look along it. On the ORBIT and the FIREFLY a lit cabin sits behind it: seat backs and, in the coach, amber strips under the ceiling, placed half a metre inside so they shift as you pass. |
| Satin trim, bright metal, rubber | Cladding and bumpers with a faint sheen; rim lips and wheel covers that mirror the scene; tyres that only catch light at the edges. |
| Lamps | Tail lamps, head lamps, markers, police pods and the taxi sign, set in dark bezels. |

Recesses (wheel wells, shut lines, the undersides) are shaded darker, and every body darkens towards the road.

**Checks**

| Check | Result |
|---|---|
| Studio views (`tools/vehicle-preview.html`) | all eight looked at from the front quarter, the side, the rear quarter and behind, and compared with the sheets |
| In-game frames (`tools/seq.mjs`, `tools/scenes.mjs`) | MONOLITH, NOMAD, FIREFLY, RELAY, MULE, LEVIATHAN and the WARDEN seen on the road at 1600×900, near and far |
| `tools/game-test.mjs` | 61/61 (the rules are untouched) |
| `tools/game-ui.mjs`, `tools/interact.mjs`, `tools/touch.mjs`, `tools/auto-env-test.mjs` | 43/43, 46/46, 9/9, 8/8, no console errors |
| `tools/perf.mjs`, 1920×1080 | traffic 6.0 ms median, 9.0 ms 95th percentile per frame (6.3 / 8.0 before) |
| Building the eight models at start-up | about 0.2 s on this machine |
| `tools/smoke.mjs` | the Pages build and both single files load a three-star moment without errors |

**Limits**

- These are still models built in code, not sculpted ones. They follow the sheets in silhouette, proportions, colours, lights and the main details; the sheets' fine surface work (weathering, bolts, the panel breakup on every face, seats modelled behind the glass) is not there.
- The LEVIATHAN's cab is the least like its sheet: simpler in the nose and the side window.
- The wheels all turn at one pace, not each at its vehicle's own speed.
- The ORBIT was not seen in the in-game frames I captured, only in the studio views.
- Start-up on a phone will take longer than the 0.2 s measured here; I did not measure it on one.
- Not played by me.

## Revision 26: the vehicles from the studies

You sent two sheets of vehicle studies (01–10) and said the player's car stays as it is. The nine others replace everything I had on the road, including the neon-edged look of Revision 25.

| Study | In the game as | What I kept from the sheet |
|---|---|---|
| 02 MONOLITH — saloon | a car | Long flat-sided slab, upright glasshouse, dark lower cladding; a bar of red light the full width of the tail; bracket-shaped lamps at the front corners; two upright slits of light behind the front wheel. |
| 03 RAZOR — coupe | a car | Open-wheeler: narrow wedge body, canopy, twin air boxes and a fin behind it, side pods, suspension arms, four big exposed wheels with rings of orange light; two clusters of three upright red bars at the back. |
| 04 NOMAD — estate | a car | Square off-roader on tall tyres, arch cladding, roof rails with three cargo cases; tail lamps like a pair of brackets; thin light bars in front. |
| 05 FIREFLY — taxi | the taxi | Tall pod, yellow shell round black glass, leaning door posts, lit TAXI sign, amber arrows on the doors; two rings of red light at the back. |
| 06 WARDEN — police | every police car | Black with white doors and roof, red and blue light bar, arch armour, push bumper with hazard stripes; red block lamps either side of a white plate. |
| 07 RELAY — van | a van | Dark wedge cab, pale faceted cargo pod, sensor mast with a cyan light; an arch of red light round the rear doors; cyan markers. |
| 08 MULE — pickup | a van | Six wheels, dark cab, tool box, orange tube frame round the bed and an orange bull bar; bracket tail lamps; amber markers. |
| 09 LEVIATHAN — truck | a long vehicle | Angular cab with a visor of cyan light, dark container in five banded segments, six axles; two slashes of red at the back, amber corner lamps. |
| 10 ORBIT — coach | one long vehicle in three | One long lilac volume, dark glass its whole length with pillars, raked nose; three red lamps stacked up each rear corner; violet markers along the skirt. |

**How they are built** (`js/vehicles.js`, rewritten). Each vehicle is a handful of faceted hulls: flat-shaded lofts through six-cornered sections (sill, waist, roof edge), which is what gives the cut-stone surfaces of the sheets. Boxes, wheels and lamps are added, and everything is merged into one mesh in which every face has its own material and colour, so one vehicle can be black and white, or dark with a pale pod. The paint is satin, not mirror. The saloon, coupe, estate and coach come in three or four paints each; the others keep the colours of the sheet.

**In the scene.** Each vehicle throws a little of its signature colour on the road (ice white, orange, amber, cyan, violet). The truck is now one modelled vehicle; the neon-edged box trailer is gone. The police pursuit car, the rolling roadblock and the weaving cruiser are all the WARDEN.

**Checks**

| Check | Result |
|---|---|
| Turntable (`tools/vehicle-preview.html`) | all nine looked at from the front quarter, behind and the rear quarter, and compared with the sheets |
| In-game frames (`tools/seq.mjs`) | taxi, police pair, van, truck and coach seen on the road |
| `tools/game-test.mjs` | 61/61 (the rules are untouched) |
| `tools/game-ui.mjs`, `tools/interact.mjs`, `tools/touch.mjs`, `tools/auto-env-test.mjs` | 43/43, 46/46, 9/9, 8/8, no console errors |
| `tools/perf.mjs`, 1920×1080 | traffic 6.3 ms median, 8.0 ms 95th percentile per frame |
| `tools/smoke.mjs` | the Pages build and both single files load a three-star moment without errors |

**Limits**

- These are low-polygon readings of the sheets, a few hundred flat faces each. The silhouettes, colours and light signatures follow them; the fine surface detail (panel lines, vents, seats behind the glass, the lettering on the police car and the taxi sign) is not there.
- The FIREFLY is more angular than the sheet's rounded pod: its section has six corners.
- The RAZOR and the FIREFLY are smaller than the lane they block; a hit registers on the same box as any other car.
- The studies show three-quarter front views; in the game you mostly see tails. I matched each tail to the small rear view on its sheet.
- Not played by me.

## Revision 25: fewer police, a helicopter that comes and goes, slower stars, neon traffic

Five requests after Revision 24.

### Fewer police cruisers

| | Before | Now |
|---|---|---|
| Share of rows that are police, at ★★ / ★★★ | 30 % / 40 % | 12 % / 18 % |
| Rolling roadblocks where the middle cruiser crosses over | 70 % / 90 % | 50 % / 60 % |

A roadblock with a crossing cruiser no longer brakes as well: one thing at a time.

### The helicopter comes and goes

It used to arrive at three stars and stay. Now it makes visits: it flies in from one side, settles for 2.5 s, makes two attacks 3.5 s apart, then turns away and climbs out on the other side. It is back 14 to 22 s later, from the side it left by. The rotor sound comes and goes with it. If the wanted level drops below three it leaves at once.

### Stars

- **Three nitro bursts clear the heat.** The third one takes the wanted level back to one star, whatever it was. The call-out for each burst counts them: NITRO 1/3 TO CLEAR THE HEAT, 2/3, then HEAT CLEARED. This replaces "each burst takes one star off for 20 s".
- **Stars come more slowly.** Two stars after 3 km of road and three after 7.5 km (before: 1.5 km and 4 km), counted from the last time the heat was cleared, so clearing it buys that whole stretch again.
- A hit adds half a star instead of a whole one. So does ramming a cruiser in a nitro burst.

### Lane changes are signalled later

| | Before | Now |
|---|---|---|
| A taxi or crossing cruiser starts to signal | 2.4 s before you reach it | 1.8 s |
| Signals for, then steers across in | 0.7 s, 0.9 s | 0.45 s, 0.85 s |
| In its new lane | 0.8 s ahead of you | about 0.5 s (0.42 s at the least in the test run) |

The warning is also timed for the gear you will be in two seconds on, so a gear change on the way in cannot shorten it.

### Traffic: neon, and more of it

- **The look.** Every vehicle is dark mirror-like metal with a tint of its colour, edged in one neon colour: two lines of light down each side (sill and shoulder), a strip between cold-white head lamps, a line under the tail lamps with an upright at each corner, and rings of light for wheels with three marks going round. Its neon also lights the road under it. Taxis are amber with their chequered stripe, the police pale and navy with blue neon.
- **More kinds.** Car-sized: saloon, coupe (a low fastback), estate. Van-sized: panel van, pickup. Long: truck with trailer, coach. Before there were three bodies; now seven. Which one a vehicle is does not change how much lane it blocks.

**Checks**

| Check | Result |
|---|---|
| `tools/game-test.mjs` | 61/61 (new: three bursts clear the heat and the stars come back after another 3 km; a roadblock with a crossing cruiser holds its speed) |
| `tools/game-ui.mjs`, `tools/interact.mjs`, `tools/touch.mjs`, `tools/auto-env-test.mjs` | 43/43, 46/46, 9/9, 8/8 |
| `tools/bot.mjs` fairness soak, no nitro | 40 seeds × 300 s: not one hit (1–7 grappler runs and 4–10 helicopter strikes dodged per run) |
| The same with nitro | 16 seeds: 2 runs take a hit |
| `tools/smoke.mjs` | the Pages build and both single files load a three-star moment without errors |
| Turntable (`tools/vehicle-preview.html`) | all seven bodies and the taxi and police liveries looked at from six sides |

**Limits**

- Not played by me.
- Much of this revision was already in the working tree from a session that was cut off; I reviewed it line by line and tested it before building on it.
- The new bodies come from the same outline description as the old ones, so they are variations in proportion (low coupe, tall estate, pickup with a bed, long coach), not new kinds of machine. No motorbikes or hover vehicles: a narrow one would not match the lane it blocks.
- In the scene the dark bodies pick up a lot of the pink and violet of the sky; against a bright preset they read lighter than on the turntable.
- With half a star per hit and 3 km to the second star, a clean driver sees no police ahead for almost a minute. If that is too quiet, the thresholds are the knob.
- A taxi now leaves you about half a second. The bot copes; I have not tried it on people.

## Revision 24: a quiet hint, nitro cools the heat, the intro on every start, no bridges or lamps

Five requests after Revision 23.

- **The hint that nitro shakes the police off.** ONE LIFE LEFT · NITRO SHAKES THEM OFF used to sit under the stars for as long as you were on your last life. Now:
  - NITRO SHAKES THEM OFF shows there for four seconds after the hit, then fades. No bar, nothing else.
  - A canister picked up on the last life says CANISTER · FIRE IT TO SHAKE THEM OFF for the usual second and a half.
  - While you hold a canister on the last life, the nitro button wears a pink ring instead of its green one. Nothing blinks.
  - The single heart and the red stars still show the state itself.
- **Nitro lowers the wanted level.** Firing a canister takes one star off at once. Stars also come from distance (two from 1.5 km, three from 4 km), which would have put the star straight back, so for 20 s after a burst the level your distance has earned counts one lower too, and two lower if you fire again inside that time. Then it returns, with the usual WANTED LEVEL call-out.
- **Smashing traffic in a burst no longer adds heat.** It used to add a third of a star per vehicle, which would have undone the above within one burst. Ramming a police cruiser still costs a whole star.
- **The intro is part of every start.** It used to play once, on the first START; later starts from the home screen cut straight to the run, and the home screen carried a separate REPLAY INTRO button. Now every START from the home screen rewinds the tape (0.6 s) and plays the ten-second intro into the run, and the REPLAY INTRO button is gone.
  - SKIP INTRO (or `S` / `Esc`) still cuts it to a 0.4 s fast-forward, and now also works while the tape is rewinding.
  - RESTART in the pause menu opens with it as well (confirmed afterwards; it first kept its instant start).
- **Overpasses and street lamps are gone.** Reflector posts, roadside signs and the emergency phones stay. (The phones went in Revision 28.)

**Checks**

| Check | Result |
|---|---|
| `tools/game-test.mjs` | 59/59 (new: nitro takes a star off and the distance level counts lower for 20 s; every start from home rewinds and plays the intro; SKIP during the rewind) |
| `tools/game-ui.mjs`, `tools/interact.mjs`, `tools/touch.mjs`, `tools/auto-env-test.mjs` | 43/43, 46/46, 9/9, 8/8 |
| `tools/bot.mjs` fairness soak | 40 seeds × 300 s without nitro: not one hit. 16 seeds with nitro: not one hit |
| `tools/smoke.mjs` | the Pages build and both single files load a three-star moment without errors |

The new UI check caught one real fault before release: the hint faded to nothing but its line stayed on screen, because the last fraction of the fade rounded to the same value as "gone". Fixed.

**Limits**

- Not played by me.
- With nitro now dropping a star for 20 s, a player who keeps a canister flowing spends less time at three stars. If that makes it too easy again, shorten `nitroCool` or let a burst take the star without lowering the distance level.
- Ten seconds of intro before every run is long for a game this hard. It can be skipped each time, but if you find yourself always skipping, a shorter cut for the second start onwards would be the next step.
- The pink ring is the only standing reminder. If it is still too much, or not enough, say which.

## Revision 23: harder again, a distant helicopter, a furnished highway

Four requests after Revision 22: harder still; the helicopter farther off and at a real height; no text when police cruisers block the road; more highway furniture.

### Harder

I pushed every number as far as it would go while the bot still takes no hit in 40 five-minute runs.

| What | Revision 22 | Now |
|---|---|---|
| Seconds between rows, gear 1 → 6 | 1.3 → 0.8 | 1.1 → 0.72 |
| Gear changes at (km) | 1, 2.5, 4.5, 7, 10 | 0.8, 2, 3.6, 5.6, 8 |
| Two stars / three stars by distance | 2.5 km / 6 km | 1.5 km / 4 km |
| Grappler runs | first after 5 s, then every 5–7.5 s | 4 s, then every 3.5–5.5 s (40 % sooner on the last life, was 30 %) |
| Searchlight locks | every 5 s | every 3.5 s |
| Share of rows that are police, at ★★ / ★★★ | 24 % / 34 % | 30 % / 40 % |
| Of those, weaving cruisers | 35 % / 45 % | 40 % / 50 % |
| Rolling roadblocks where a cruiser crosses over | 50 % / 70 % | 70 % / 90 % of those with a cruiser in the middle |
| Police hold off around a crossing or weaving vehicle | 3.5 s | 3 s |
| Respite after a hit | 3 s | 2.5 s |
| Nitro canisters (your way to get a life back), in top gear | about every 14–24 s | about every 17–29 s |

Attacks actually carried out per five minutes: 0–6 grappler runs (was 2–7) and 4–12 helicopter strikes (was 4–10). The grappler figure did not rise: it only runs when you have a way out, and with rows this close that is less often. The pressure comes from the road and the helicopter.

**One rule changed to make room for this.** A crossing cruiser used to be whichever one stood next to the open lane, so the lane that opened could be a side lane, two lanes from a car on the far side with a truck in between. That was the one case where the bot was hit. Now it is always the cruiser in the middle lane that crosses, into the open side lane: the middle becomes the way through, one move from anywhere.

**Where it stops.** Rows at 1.05 → 0.66 s cost the bot a hit in 3 runs of 24. Stars at 1.5 km / 4 km and 30 % / 40 % police were each a hit in 1 of 24 until the rule above went in.

### The helicopter

- It now holds station about 130 units ahead and 38 up. Before it hung 22 ahead and 6 up, lifting over each gantry; it no longer needs to.
- That is as high as it can go and stay in the picture below the score. A real one would fly several times higher still.
- It is drawn at twice life size so it stays readable at that distance: a small aircraft above the horizon, with a long searchlight beam down to the road.
- Its lights and the muzzle flashes are larger to match. The lock, the lane target and the tracer fire work as before.

### No call-outs for police ahead

ROLLING ROADBLOCK AHEAD and CRUISER WEAVING · WATCH ITS LANE are gone. The cruisers still announce themselves in the scene: light bars, a warning sign over each, chevrons for one that is steering across, and a siren chirp. The call-outs for the grappler and the searchlight lock are still there, since those come from where you are not looking; say so if you want them gone too.

### Highway furniture

- **Street lamps** on both sides every 80 units, staggered left and right, each with a pool of sodium light on the road.
- **Reflector posts** on both rails every 30 units, amber on the left and white on the right.
- **An overpass** every 2,400 units, half-way between the sign gantries: deck, parapets, piers, lamps under the deck.
- **Roadside signs** on two posts: NEO CITY / CORE DISTRICT 9 KM, REST AREA / FUEL · DINER 2 KM, SPEED CHECKED BY AIRCRAFT.
- **An emergency phone** in orange on the left every 640 units.

All of it stands still, so it streams past at your full speed while the traffic does not. That contrast is one more thing that makes the traffic read as driving.

**Checks**

| Check | Result |
|---|---|
| `tools/game-test.mjs` | 54/54 |
| `tools/game-ui.mjs`, `tools/interact.mjs`, `tools/touch.mjs`, `tools/auto-env-test.mjs` | 40/40, 46/46, 9/9, 8/8 |
| `tools/bot.mjs` fairness soak, no nitro | 40 seeds × 300 s: not one hit (0–6 grappler runs and 4–12 helicopter strikes dodged per run) |
| The same with nitro | 16 seeds: 1 run takes a hit |
| `tools/perf.mjs`, 1920×1080 | traffic 7.3 ms median, 9.1 ms 95th percentile per frame (6.1 / 9.0 before the furniture) |
| `tools/smoke.mjs` | the Pages build and both single files load a three-star moment without errors |
| Stills (`tools/scenes.mjs`) | overpass far and near, roadside sign, gantry, helicopter searching, locked, firing and flying in |

**Limits**

- Not played by me. The bot is far better than a person, so "the bot is never hit" says the road is always passable, not that it is comfortable.
- The run now reaches three stars after about 65 s and top gear after about 110 s (before: about 90 s and 140 s). If that is too much too soon, the distance thresholds are the gentlest knob to turn back.
- At its new distance the helicopter is about 75 pixels across at 720p. That is what far away looks like; it was 280 in Revision 20.
- The furniture is drawn from the same boxes and glows as the gantries. No new models.
- Canisters being rarer makes losing a life cost more. That is deliberate, and it is also the knob to turn if the last life feels hopeless.

## Revision 22: two lives, a harder road, and nobody abreast

Two messages after Revision 21: the traffic still read as close to static, with every row perfectly abreast and the police standing still while they intercept; and the game was too easy, to be changed to two lives with a permanent chase after the first is lost, then made harder.

### Two lives

| Rule | How it works now |
|---|---|
| Two lives | Every run starts with two (the hearts beside the stars). |
| Every hit takes one | Driving into a vehicle, a sideswipe, the grappler, the helicopter. Driving into the back of a vehicle used to end the run at once; on the first life you now plough through it and lose speed for a second. |
| After the first is gone | The pursuit car closes in and stays, off your rear quarter where you can see it. Before, it dropped back after 6 s. Its grappler runs come 30 % sooner. |
| Until | You fire a nitro canister, which shakes it off and gives the life back, or you take a second hit, which ends the run (wrecked by a vehicle, busted by the police). |
| A breather | Nothing attacks for 3 s after a hit. Without that the grappler came in the same second as a crash. |
| Rewind | A spare tape still rewinds three seconds, and now hands back both lives. |

A canister is therefore your second chance as well as your score: burn it on a line of traffic and you have nothing to shake the police with.

### Harder

| What | Before | Now |
|---|---|---|
| Seconds between rows, gear 1 → 6 | 1.5 → 0.9 | 1.3 → 0.8 |
| Two stars / three stars by distance | 3.5 km / 8 km | 2.5 km / 6 km |
| Grappler runs | first after 6 s, then every 6–9 s | 5 s, then every 5–7.5 s (30 % sooner on the last life) |
| Searchlight locks | every 6 s | every 5 s |
| Share of rows that are police, at ★★ / ★★★ | 20 % / 30 % | 24 % / 34 % |
| Rolling roadblocks whose open lane moves | none | 50 % / 70 % |

Attacks actually carried out per five minutes went from 2–6 grappler runs and 4–9 strikes to 2–7 and 4–10; most of the rise in difficulty is in the road itself.

### Nobody abreast, and police that move

- **Lanes at different speeds.** At cruising speed the left lane is 3 units a second (about 7 MPH) faster than the middle, the right lane 3 slower, so cars overtake each other all the time you can see them. A row appears strung out over about 35 units and closes up as you reach it.
- **Rows arrive staggered.** The vehicles of a row sit 3.5 to 6.5 units ahead of or behind the row's line, alternately, so two of them pass you 2.5 to 16 units apart, never side by side. Police pairs drive in echelon the same way.
- **Traffic keeps pace with you.** It drives at 46 % of your cruising speed in every gear (60 MPH in gear 1, 106 in gear 6) and picks the speed up after each gear change. In Revision 21 it was 62 MPH throughout, barely a quarter of your top speed.
- **A cruiser holding a lane snakes across it** (three quarters of a unit each way, about three times in four seconds) and its nose follows.
- **A rolling roadblock can close the door.** In half of them at two stars, and 70 % at three, the cruiser beside the open lane signals with chevrons, then steers across into it, timed like a taxi. Its own lane is the open one from then on, and the energy cells already mark that lane.
- **The chasing cruiser is a moving thing now too**: it stays in the picture for as long as you are on your last life.

### What keeps it fair

- Each vehicle starts behind or ahead of its place by what its lane will gain or lose, and the speed difference between lanes follows how fast you are closing. So the row closes up exactly as you arrive, on the brake or in a nitro burst as well. With fixed lane speeds the bot's nitro runs went from 2 crashes in 16 to 5; tied to closing speed they did not.
- Rows are spaced for the speed you are really doing (past gear 6 the old spacing shrank in time) plus room for the stagger.
- An attack only starts when there is a way out: a lane beside you clear while it lasts, and afterwards either that lane or your own open. The old rule only asked for a lane beside you; with rows this close that could box you in two lanes from the next opening.
- The grappler and the helicopter hold off while a taxi, a crossing cruiser or a weaver is within 3.5 s.

**Checks**

| Check | Result |
|---|---|
| `tools/game-test.mjs` | 54/54 (new: a hit costs a life and the police stay, nitro gives it back, the breather after a hit, lane speeds, staggered rows that close up on time under braking and nitro) |
| `tools/game-ui.mjs`, `tools/interact.mjs`, `tools/touch.mjs`, `tools/auto-env-test.mjs` | 40/40, 46/46, 9/9, 8/8 |
| `tools/bot.mjs` fairness soak, no nitro | 40 seeds × 300 s: not one hit (2–7 grappler runs and 4–10 helicopter strikes dodged per run) |
| The same with nitro | 16 seeds: 1 run takes a hit (Revision 21: 2 of 16 crashed) |
| `tools/perf.mjs`, 1920×1080 | traffic 6.1 ms median, 9.0 ms 95th percentile per frame |
| `tools/smoke.mjs` | the Pages build and both single files load a three-star moment without errors |

**Limits**

- Judged from numbers and frame strips again, not by playing. "Still static?" and "hard enough?" are both yours to answer.
- The bot never takes a hit in 40 runs, so it cannot tell me how hard this is for a person. `tools/vary.mjs` reruns the soak with any constant changed, which is how the numbers above were chosen; there is room to go further (rows at 1.2 → 0.75 s, for one).
- Driving into a vehicle on the first life removes that vehicle. It is the simplest way not to leave your car inside it.
- On the brake the lanes run at almost the same speed, and in a nitro burst they pull apart about two and a half times as fast. That is the price of rows that always close up on time.
- Traffic at 106 MPH in top gear is fast for traffic; the ratio to your speed is what the eye reads.
- Still no sound for a car passed, and your own car is still untouched.

## Revision 21: traffic that drives, police that move

Your three points after playing Revision 20.

### 1. The other cars looked parked

Three causes, all real:

- They drove at 12 units a second, 29 on the speedometer, against your 130 to 230. At that ratio a moving car closes on you almost exactly as fast as a palm tree does.
- Nothing on them moved. No wheel turned, no body leaned, nobody strayed a hand's width from the lane centre.
- Every vehicle held exactly the same speed, so a row of traffic came at you as one rigid block.

What changed:

- **Traffic drives at 26 units a second (62 MPH).** Cars now travel along the road and past the palms while you catch them. Row spacing was already defined in seconds, so rows arrive as often as before; the traffic is closer together on the road. The first row and the nitro canisters were re-timed to arrive when they used to.
- **Each car, van and truck eases up to 1.5 units ahead of and behind its place**, on its own period of 6 to 10 s, so two vehicles side by side creep past each other.
- **Everyone drifts about 0.3 units from side to side in the lane.**
- **Wheels turn** (five blurred spokes), and **bodies lean and dip on their springs** while the wheels stay on the road.
- **Tail lamps streak the road behind each vehicle**, longer the faster it goes.
- A vehicle you have passed holds your speed if you brake below its own, so it cannot run into your tail.

### 2. The taxi slid sideways

It did: its lane position eased across in 0.6 s while the body kept pointing straight ahead.

- The move is now the curve a steered car follows (a sine ramp: no sideways speed and no sideways acceleration at either end), over 0.9 s.
- The nose follows the path: up to about 28° off the road's direction half-way across.
- The body leans out of the turn, up to 7°, and the tail wags once as it straightens up.
- It signals 2.4 s before you reach it (was 2.2) and is in its new lane at least 0.8 s before you arrive.
- All warnings are now timed for the speed you would be doing flat out. Before, coming up on the brake and then letting go could make a taxi cut across later than promised.

### 3. The static roadblock

The hard-light barrier with a cruiser parked across the lane is gone. It moved along at traffic speed while looking parked, which is what made everything near it look parked too. Two kinds of police now work ahead of you, both driving:

- **Rolling roadblock.** Two cruisers abreast, light bars on, a warning sign over each, one lane left open. They drive with the traffic and brake when you are 1.3 s away (26 → 17 units a second): brake lights, noses down.
- **Weaving cruiser.** One cruiser swinging between the middle lane and one side, a swing every 1.85 s, steering and leaning as it goes. Chevrons over the two lanes run the way it is steering. 1.25 s before you reach it, it takes the lane it is heading for, and a warning triangle marks that lane. At three stars a second cruiser may hold the third lane, so the only way through is the lane the weaver gives up.

Rules that keep it fair:

- The weaver works the side you are on, so whichever lane it takes, a free one is at most one lane away.
- The row after a weaver always leaves the middle lane open, because you may come out of it in any lane.
- The grappler and the helicopter hold off while a weaver is within 3 s.
- Ramming a cruiser with nitro still costs a whole star.

Call-outs: ROLLING ROADBLOCK AHEAD and CRUISER WEAVING · WATCH ITS LANE, each with a siren chirp.

### The bot

`tools/bot.mjs` had to learn the new road. It now takes its timing margins from the gear schedule, follows a rolling roadblock's braking and a weaver's path step by step, and no longer makes an early lane change that commits it to a second one straight after (that habit crashed it once the traffic sat closer together).

**Checks**

| Check | Result |
|---|---|
| `tools/game-test.mjs` | 48/48 (new: traffic speed and easing, the taxi's steering curve, a taxi's warning distance on the brake, the rolling roadblock's braking, the weaving cruiser's lane and notice) |
| `tools/game-ui.mjs`, `tools/interact.mjs`, `tools/touch.mjs`, `tools/auto-env-test.mjs` | 39/39, 46/46, 9/9, 8/8 |
| `tools/bot.mjs` fairness soak, no nitro | 16 seeds × 300 s: no stumble (2–6 grappler runs and 4–9 helicopter strikes dodged per run, among rolling roadblocks and weaving cruisers) |
| The same with nitro | 2 of 16 crash, after 175 s and 281 s (Revision 20: 3 of 16) |
| `tools/perf.mjs`, 1920×1080 | traffic 7.3 ms median, 9.3 ms 95th percentile per frame |
| `tools/smoke.mjs` | the Pages build and both single files load a three-star moment without errors |

**Limits**

- I judged the motion from strips of frames (`tools/seq.mjs`), not by playing. Whether the traffic now feels like it is driving is yours to say.
- Wheels only show when a vehicle is beside you; from straight behind you see the tyres' backs.
- Trucks do not steer or lean: the trailer is one rigid box.
- Passing traffic still makes no sound of its own.
- When it takes its lane, the weaver moves sideways at up to 3 lanes a second, quicker than a real car could.
- The three-star case (weaver plus a second cruiser) leaves you about 1.2 s to read the lane. The bot manages; it has not been tried on people.

## Revision 20: the helicopter, rebuilt

Revision 19 left the helicopter as a handful of boxes, about 35 pixels wide at 720p under a 130-pixel rotor glow, seen from behind. It is now a modelled police helicopter that faces you: about 85 pixels wide nose-on and 130 to 170 side-on, under a 280-pixel rotor disc.

- **The model** (`js/heli.js`). One lofted shell runs from the nose bubble through the cabin into the tail boom, the same method as the cars. The windscreen, chin panes, door and rear windows are panels of that surface. Added on top of it: an engine cowl with intake and exhaust, mast and rotor head, a swept fin with a T-tailplane, skids on two cross tubes, a searchlight drum under the nose, a camera ball on the chin, and a gun pod under a stub pylon on each side.
- **Livery.** White over a navy belly, a blue stripe that sweeps up from the doors onto the boom, navy cowl and fins, and POLICE on both doors.
- **Rotors.** Each rotor is a blurred disc with three (tail: two) soft blades and yellow tips. It darkens a bright sky behind it and lightens a dark one, so it shows both against the sun and against the night.
- **Where it is and how it moves.**
  - It hangs 22 m ahead of your car and about 6 m up, 1.5 times life size, nose towards you. Before, it was 34 m ahead and 12 m up.
  - While the searchlight hunts, it sits three-quarter on, swinging slowly from one side to the other, and banks into its sideways drift.
  - On a lock it squares up to your car and slides over your lane; the nose follows you if you change lane.
  - At three stars it flies in from high on the right over about two seconds. When the heat drops it climbs away the same way. Before, it appeared and vanished in one frame.
  - It lifts over every sign gantry and settles again.
- **Lights.** The searchlight is now a visible cone from the lamp to its pool on the road, narrow and bright at the lamp. Red and green navigation lights sit on the pylon tips, a white double strobe on the tail and a red beacon under the belly. Tracer fire leaves the two gun pods alternately, with a muzzle flash on each.
- **Rules.** Nothing about the attack changed: the same lock every 6 s, 1.2 s of warning, 0.45 s of fire, dodged by changing lane. The sim gained two values that only the picture reads (how far the helicopter has arrived, and its bank).

**Checks**

| Check | Result |
|---|---|
| `tools/game-test.mjs` | 42/42 |
| `tools/game-ui.mjs`, `tools/touch.mjs`, `tools/auto-env-test.mjs` | 39/39, 9/9, 8/8 |
| `tools/interact.mjs` | 44 passed; its 2 worklet-signal checks were skipped because this machine's audio output was not running during the run (nothing in this revision touches sound) |
| `tools/bot.mjs` fairness soak, no nitro | 16 seeds × 300 s: no stumble (4–9 grappler runs and 5–13 helicopter strikes dodged per run) |
| Stills (`tools/scenes.mjs … heli`) | search, lock, fire, fly-in, gantry hop, at 1280×720, 1920×1080 and 420×860 portrait |

**Limits**

- The helicopter flies backwards ahead of you at your speed with its nose towards you. That is a game pose; a real one would not.
- The lettering is about 12 pixels tall at 720p: it reads as POLICE at 1080p and as a marking below that.
- The searchlight drum does not swivel; only the beam moves.
- Your own car is still untouched.

## Revision 19: grappler, helicopter fire, readable cars

Four points after playing Revision 18.

- **The air attack is the helicopter's now.** The drone is gone. At three stars the helicopter hangs ahead of you and its searchlight sweeps the road. Every 6 s the light swings onto your lane and locks: the beam and its pool turn amber, then flash red, and a target marks the lane. 1.2 s after the lock the helicopter fires down the beam and tracer rounds walk along that lane for 0.45 s. The timings are the drone's; only who does it and how it looks changed. A rotor chop joins the siren at three stars.
- **The cruiser uses a grappler instead of ramming.** I took "the towing tool police really use" to mean the grappler bumper: a fork that folds out ahead of the push bar with a net across its mouth, which snags a rear wheel and tethers the car. During the 1.1 s warning the cruiser lines up behind you and the yellow fork unfolds. Then it lunges. If you are still in its lane, the net takes your rear wheel: the cruiser hangs on for a second, you lose 30 % of your speed and the tail snakes, then the strap lets go. That is a stumble, as the ram was. If you changed lane, it shoots past and drops back.
- **Cars are easier to see, and their lights are calm.**
  - What flickered: far vehicles faded in through a noise dither that changed 30 times a second, and thin tail-light bars shimmered at a distance under bloom. Vehicles now come out of the haze by colour, with no dither anywhere, and a tail lamp far away is one small steady glow.
  - Tail lamps are about half as bright. The lamp glows no longer swell with distance until they hide the car.
  - Paint is brighter, bodies get a rim of horizon light, and each car throws a faint pool of its own colour on the road, plus a headlamp pool ahead.
- **The car models are rebuilt** (`js/vehicles.js`). Looking at them on a turntable (`tools/vehicle-preview.html`) showed real faults:
  - the end faces were wound the wrong way round, so the tail and nose were see-through;
  - the van's and the truck cab's upper halves were one black "glasshouse" open at the back;
  - no car had head lamps, a grille or visible wheels.

  Each body is now a single closed shell whose faces are panels: side windows with pillars, windscreen, rear window, painted roof. Added: head lamps, bumpers, grille, door mirrors, wheel hubs. The van is a panel van with cab windows and two rear doors. The police cruiser is black and white. The taxi has a chequered stripe.

**Checks**

| Check | Result |
|---|---|
| `tools/game-test.mjs` | 42/42 (new: hooked → the cruiser hangs on, then lets go) |
| `tools/game-ui.mjs`, `tools/interact.mjs`, `tools/touch.mjs`, `tools/auto-env-test.mjs` | 39/39, 46/46, 9/9, 8/8 |
| `tools/bot.mjs` fairness soak | 16 seeds × 300 s: no stumble (4–9 grappler runs and 5–13 helicopter strikes dodged per run). With nitro: 3 of 16 crash after 220 s or more, as before |

**Limits**

- The grappler reading of "towing tool" was a guess when this was built; the user has since confirmed it is the tool they meant.
- The helicopter is still built from boxes and is small on screen.
- Your own car was not touched. If the modelling remark was about it, I need to know what looks wrong.

## Revision 18: a police chase on a highway into the city

Your eleven points after playing the first version, and what changed for each.

| # | You asked for | What it is now |
|---|---|---|
| 1 | Pause, restart and home buttons; after a failure, go back to the home screen first | The pause key opens a menu: RESUME, RESTART, HOME. The crash panel offers REWIND (a spare tape) or HOME, and no direct retry. The home screen shows the title, last and best score, START DRIVE and REPLAY INTRO. |
| 2 | "I can't feel the police chasing me" | Every run opens with a cruiser on your bumper ("POLICE! PULL OVER"), then you floor it. For the rest of the run a siren follows you and red and blue light flickers at the bottom of the screen. Whenever the cruiser closes in, the camera lifts and drops back so the cruiser is in the picture behind your car. |
| 3 | Obstacles that fit a road into a future city, such as slower cars | All traffic drives your way, slower than you: cars, vans, trucks with trailers, taxis that pull over. Oncoming cars are gone. |
| 4 | Bigger obstacle vehicles, a wider road | Lanes are 5.0 units wide (were 4.0), the road 15 (was 12). A traffic car is 5.0 × 2.1, against your 4.4 × 1.9; a truck is 12.4 long. |
| 5, 6 | The holo signs were ugly, too frequent and out of place; a high-tech highway into the city with an occasional big billboard | The roadside holograms are removed. A billboard on tall posts comes up every 1,600 units, alternating sides (five fictional brands), and a sign gantry spans the road every 2,400. |
| 7 | The same elements in every region; a region change is only a change of mood or of time | The city skyline, gantries, billboards and palms are the same in all four presets. The presets change colour only. |
| 8 | GTA-style stars: one star, a police car always follows; two, roadblocks and ramming from behind; three, a helicopter and a drone attacking from the air. The exact penalty rules still to be designed | Built as you described. The rules I designed are below. |
| 9 | Reviving is a tape rewind: time runs backwards, cars drive in reverse | REWIND plays the last three seconds backwards for 1.3 s: road, traffic, your lane changes, the police. Then the run continues from that moment. |
| 10 | Nitro is a pickup on the road, usable only once collected, and it can be stored | Canisters appear every 1,100–1,900 units in an open lane. You carry up to three; the NITRO key shows them as pips. |
| 11 | Hold-to-drive becomes a brake; the car always drives flat out | Done. BRAKE (Space or ↓) slows to 55 %. |

**The star rules** (the part you left to me). The idea is Subway Surfers' inspector: one mistake brings the police close, a second one while they are close ends the run.

- You start at one star. A sideswipe adds a star. Each vehicle smashed with nitro adds a third of a star. Distance sets a floor: two stars from 3.5 km, three from 8 km.
- Heat cools by one star every 12 s after 10 s without an incident, down to the distance floor.
- A **stumble** is a sideswipe, being rammed, or a drone hit. It puts the cruiser on your tail for 6 s (0.9 s of grace first, so one accident cannot count twice). A second stumble inside that window is **busted**.
- Braking for more than 2.2 s also brings the cruiser onto your tail, for as long as you keep braking.
- **Two stars:** roadblocks replace 20 % of the rows. Every 6–9 s the cruiser makes a ramming run: it lines up in your lane, 1.1 s of warning, then charges. A hit is a stumble and costs 30 % of your speed for a second.
- **Three stars:** roadblocks replace 30 % of the rows. A helicopter appears. Every 6 s a drone locks your lane, and 1.2 s later it strikes that lane for 0.45 s. A hit is a stumble.
- Rams and drone locks only start when a neighbouring lane is clear, and never both at once.
- Nitro makes you immune to all of it and shoves the cruiser back.

**How it was built**

- **Simulation** (`js/game.js`, `js/timeline.js`). New events `brk`, `home`, `restart`; `retry` and the throttle are gone. The pursuit car is simulated (tail, warning, charge, drop back), so the bot, the audio thread and the picture agree on it.
- **Rewind.** The simulation keeps a checkpoint per second. REWIND restores the one about 3 s before the crash, including the road position. While the rewind plays, the picture asks the timeline for past states on a scratch copy (`peek`), from the crash time back to the checkpoint.
- **Vehicles** (`js/vehicles.js`). Car, van and truck-cab bodies are lofted from cross-sections, like your own car, and drawn instanced with paint, glass, tail lights and a roof bar (taxi sign or police lights).
- **Sound.** A two-tone siren runs in the synth for the whole chase: quiet and slow while the cruiser hangs back, louder and faster when it is on your tail. The rewind has a longer tape squeal. Since the car is now always flat out, the cruise mix came out 0.9 dB louder, so its trim was lowered to keep −14 LUFS.
- **A fix found by the tests.** A brake press and release inside one frame left the brake stuck on. The UI now compares with the last brake event it sent.

**Checks**

| Check | Result |
|---|---|
| `tools/game-test.mjs` (simulation) | 41/41: determinism under any query order and late events, audio-thread parity, crash, home, restart, rewind, sideswipe, busted, ram, drone, nitro stock, stars, brake, pause |
| `tools/game-ui.mjs` (browser, desktop and phone) | 39/39: run opening, brake, crash panel, rewind running backwards, home screen, new run, pause menu, restart, sideswipe → tail timer → busted, nitro stock, phone layout |
| `tools/interact.mjs`, `tools/touch.mjs`, `tools/auto-env-test.mjs` | 46/46, 9/9, 8/8 |
| `tools/bot.mjs` fairness soak | 16 seeds × 300 s: no stumble in any run (4–9 ramming runs and 5–13 drone strikes dodged per run). With nitro: 3 of 16 runs crash, after 220 s or more |
| `tools/perf.mjs` | 6.5–8.3 ms median per frame at 1920×1080, 9–10 ms at 3724×2095 (M3 Max) |
| Loudness (`tools/render-audio.mjs`) | ignition −14.1 LUFS, cruise −13.9, a full chase with siren and nitro −13.7; true peak −1.5 dBTP in all |

**Limits of this version**

- Nobody but the bot has played these rules for long. The numbers above (6 s on the tail, ram every 6–9 s, drone every 6 s) are first guesses.
- When you are busted, the cruiser cuts in front of your car, but the result panel covers most of it.
- The helicopter and the drone are built from boxes. The police car is the traffic car body in police paint.
- The siren is a plain two-tone synth.
- The best score is kept in this browser only.

## Revision 17: the game (first playable version)

The free cruise became a lane racer: weave through traffic, build a combo, charge nitro, keep the wanted level down. README.md describes the rules; this section records how it was built and checked.

- **Architecture.** The game runs inside the existing deterministic timeline, in `js/game.js`, at 240 Hz. The picture, the audio thread and Node all run the same code from the same event log.
  - New events: `retry`, `revive`, and a seed on `start`. Nitro bursts, sideswipe bounces, the wanted level and every game event are derived by the simulation.
  - **Rewind-revive** restores the game from the simulation's own one-second checkpoints, about 3 s before the crash, while scene time keeps moving forward.
  - **Pause** is a timeline event too: the game clock stops, the car coasts to a halt and scene time carries on, so picture and sound never lose sync. A hidden tab or a window that loses focus pauses the run.
  - Sounds for game events are triggered by the picture's timeline only. It never runs ahead of the player's input, so a crash that is dodged at the last moment never makes a sound.
- **Traffic generator.** Rows are generated 280 units ahead from a seeded generator.
  - All same-direction traffic moves at 9 u/s, so formations never close up.
  - Every row leaves a lane open within one lane of the previous opening.
  - Oncoming cars only use an outer lane, and the middle lane is kept clear until they have passed.
  - Row spacing shrinks from 1.5 s to 0.9 s of closing time between gear 1 and gear 6.
- **Speeds.** Base speed 36 → 64 u/s over six gears (130 → 230 MPH on the speedometer), DRIVE ×1.5, nitro ×2.6. The old turbo became the nitro: wind-up 0.2–0.45 s to the next half-beat, 2.2 s of full boost, 1.4 s of recovery.
- **Sci-fi neon layer** (`js/gameview.js`), drawn into the world scene so it passes through the same VHS finish:
  - maglev trucks with neon edges, holographic taxis, oncoming cars with headlight glare and a warning sign;
  - the police hard-light barrier (hexagonal lattice), the drone searchlight, debris that shatters into shards of light;
  - holographic billboards along the road, and a procedural megastructure skyline in BLUE HOUR and LAGOON.
- **Checks.**

  | Check | Result |
  |---|---|
  | `tools/game-test.mjs` (simulation) | 31/31: determinism under any query order and late events, audio-thread parity, crash, retry, rewind-revive, sideswipe, busted, nitro, gears, tapes, free mode, replay, pause |
  | `tools/game-ui.mjs` (browser, desktop and phone) | 23/23: HUD, EJECT panel, rewind, retry, pause (key, button, hidden tab), sideswipe → police lights, panel and HUD fit a 390×844 screen |
  | `tools/bot.mjs` fairness soak | 16 seeds × 300 s without DRIVE: all clean, 18,300 units each. With DRIVE held, 3 of 8 runs crash in gear 6 after 150 s or more |
  | `tools/interact.mjs`, `tools/touch.mjs` (free mode) | 40/40 and 8/8: the controls behave as before |
  | `tools/perf.mjs` | with traffic, barriers and nitro on screen: about 8 ms per frame at 1920×1080 and 11 ms at 3724×2095 (M3 Max) |

- **Not built yet** (from the design): boost rings, glitch zones, wanted levels 4–5 (EMP strips, interceptors), power-ups (shield, magnet, score doubler, hover), a dedicated look for the AFTERGLOW and LAGOON regions, missions and unlockable cars.
- **Limits of this version.**
  - Balance is tuned by a bot and by reading frames; nobody has played it for long yet.
  - Game sounds are short synthesized blips and thumps. There is no engine-pitch model for the gears and no looping siren.
  - Trucks, taxis and oncoming cars are built from boxes.
  - The best score is kept in this browser only.

## Revision 16: three lanes with drift (lane-runner controls)

- **Road.** The road is now three lanes, each 4 units wide, so each holds one car (a car is about 2 wide).
  - The grid is offset so its lines fall on the lane edges (±2), and the cyan rails moved back to ±6. The dashed lane dividers were tried and then removed at the user's request, so the lanes are marked only by the regular grid lines.
  - Traffic tail lights run outside the rails (±7.8), so they never meet the player's car.
  - Layout constants are in `ROAD` in `js/cue.js`.
- **Controls.** `←` `→` / `A` `D` move one lane per press; holding a key does not repeat. A tap or click on the left or right half of the scene does the same, firing on press with no wait. The mouse still does not steer by moving.
- **Feel.** Constants are in `LANE_FEEL` in `js/cue.js`; everything is simulated at 240 Hz and is deterministic.
  - **Lateral move:** a critically damped spring on a lightly smoothed lane target. It reaches 90 % in 0.22 s, with peak lateral speed at 74 ms.
  - **Quick presses:** a second press mid-move retargets with the velocity the car already has, so quick double presses and zig-zags stay crisp. Two presses 80 ms apart cross two lanes and settle in about 0.24 s.
  - **Drift (visual only, so it never slows the move):**
    - Body yaw follows the lateral speed through an under-damped spring, peaking at about 9° mid-move and capped at 0.16 rad. A two-lane dash peaks at about 12°.
    - It settles with a 1.4° counter-steer.
    - The tail swings out around a pivot 1.25 units ahead of centre.
    - The body rolls with the lateral speed.
  - **Camera:** follows on its own spring, more closely on narrow screens so the outer lanes stay in frame on phones.
- **Tests.** `tools/interact.mjs` and `tools/touch.mjs` cover these cases:
  - one lane per press, settled within 0.45 s
  - the car stops at the edge lane
  - two quick presses cross two lanes
  - a held key moves only one lane
  - click / tap on each half of the scene
  - moving the mouse never changes lane

## Revision 15: sharp picture, and the sky bug behind "the sky is in the wrong place"

- **Sky bug.**
  - The sky shader rebuilt its view rays from `gl_FragCoord / uRes`, with `uRes` set to the output size. Whenever the scene rendered below native resolution, the sky was mapped to the wrong place: the sun sat high above the horizon and a flat band separated sky from ground. That happens on any Retina screen larger than about 3.2 MP, or after an adaptive quality step-down.
  - Captures at 1× never showed it, because there the two sizes are equal.
  - `uRes` is now the render-target size. Checked at quality tiers 0, 2 and 4 on a 1728×1117 @2× viewport, where the sky and ground line up at every scale.
- **Resolution.** Tier 0 now renders a full Retina laptop screen natively, up to 7.8 MP (was 3.2 MP, about 64 % of native on a 16-inch MacBook Pro). Two lower tiers keep the adaptive step-down path.
- **Frame cost.** Measured on M3 Max at 3724×2095: cruise 10.8 ms median and 13.7 ms p95. The title-flight motion blur uses 5 sub-frames instead of 8 above 4 MP.
- **Crisper VHS finish.** Transients (slam, throttle, turbo) keep the same size of kick.

  | Effect | Before | Now |
  |---|---|---|
  | RGB split at rest | 1.5 px | 0.6 px |
  | Chroma bleed | 3 taps × 2.2 px, 85 % mix | 2 taps × 1.6 px, 50 % mix |
  | Scanline depth | 16 % | 9 % |
  | Grain | 0.022 | 0.014 |

  A luma-only sharpening step restores edge contrast without colour halos.

## Revision 14: widescreen framing anchored to the frame height

- **Problem.** The camera held a fixed 76° horizontal field of view, so each extra bit of screen width cost vertical view.
  - On 16:9 the vertical view was only 47°. The car filled about a quarter of the height and sat close to the lens, and the sun and palms were oversized.
  - On 21:9 the car was cut off at the bottom.
- **Framing by height.** The framing is now anchored to the frame height. Sizes are fractions of the height, and a wider screen sees more road, palms and mountains at the sides instead of a stretched, bigger scene.
- **Field of view by aspect.**

  | Screen shape | Field of view |
  |---|---|
  | Narrow / tall | 76° horizontal, up to 78° vertical (unchanged) |
  | Wide | 62° vertical (16:9 → 94° horizontal) |
  | Ultrawide | horizontal capped at 104° so the edges don't stretch (21:9 → 57° vertical) |

- **Widescreen composition.** This was chosen from four rendered options (option B).
  - The horizon sits at mid-frame, as in the original wide layout, with the sky and the road each taking half.
  - The sun is about 30 % of the height.
  - The car is about 15 % tall in the lower half.
  - The control hints moved up to 56 % so they sit between the horizon and the car.
- **Tall windows and phones** keep the horizon about 60 % down and a smaller, more distant car.
- **Implementation.**
  - The car's distance is `carK / tan(vfov/2)`, so its size and height on screen hold across fields of view.
  - `carK` and the lens shift blend from the tall values to the wide values with the aspect.
  - Fore/aft car moves (throttle, turbo) scale with the distance.
  - All constants are in `FRAME` in `js/director.js`. `?frame.<name>=<value>` overrides any of them for tuning.

## Revision 13: reliable live site

- **Problem.** On the GitHub Pages link the page could stay on its static first-paint poster, with a START button that did nothing. The site was served as dozens of separate files, each cached by the browser for 10 minutes. A file that failed to download during deployment, or a mix of cached old and new modules after an update, stopped the JavaScript before its first frame. Nothing told the visitor.
- **One file.** Pages now serves `docs/`: the single-file build (all code, fonts, samples and the worklet inlined) as `index.html`, plus `version.json`. `tools/build.mjs` writes both.
- **Version check.** The page carries its build id. On open it fetches `version.json` uncached and reloads once if a newer build is live. A sessionStorage guard prevents reload loops.
- **Boot watchdog.** A small classic script catches load and start-up errors. If the first frame has not been rendered 12 s after `load`, or 3 s after an error, it replaces START with the reason and a RELOAD button. The DRIVE / TURBO / speedometer cluster stays hidden until the app is running, so a stalled page no longer looks like a frozen UI.
- **Tested.** With `js/director.js` blocked, the panel shows "A file failed to load". A normal load raises no false alarm. The single-file `docs/` build plays and starts audio.
- **WebGL switched off.** On one Mac the panel reported "Error creating WebGL context": Chrome had been running for days with its GPU process in `--use-gl=disabled` mode, a fallback after a GPU failure that a browser restart clears. When WebGL 2 can't be created, the panel now explains the fix: restart the browser, check that graphics acceleration is on, or use Safari.

## Revision 12: no mouse steering

- The mouse no longer steers. Steering is now `←` `→` / `A` `D` on a keyboard, or a horizontal drag on a touch screen, which is unchanged.
- The crosshair steering cursor over the scene is gone, so the mouse is only for the on-screen controls: DRIVE, TURBO, the deck, SKIP and REPLAY.
- `tools/interact.mjs` checks that moving the mouse across the whole scene leaves steering at 0. It also checks that each arrow key steers its way and that releasing it re-centres the car.

## Revision 11: wider driving range

- **Lateral reach.** At full lock the car now reaches ±4.2 road units, up from ±2.6 (+62 %). Lateral distance per unit of steering is larger, so yaw and bank are scaled up to keep the turn-in believable, and the chase camera follows a little less (0.58, was 0.62) so the move reads on screen.
- **Arrow keys** now reach full lock; they previously stopped at 85 %. Pointer and touch mapping is unchanged.
- **Road layout, so the wider reach never drives through traffic.**
  - The cyan rails moved from ±6 to the ±8 grid lines.
  - Traffic tail lights moved from ±4.9 to ±6.3, so at full lock the car body still clears passing traffic by about 0.3 units.
  - The roadside light trails moved from ±7.4 to ±9.4, and the first palm row from 9.5–12.5 to 10.8–13.8.
  - All these values are in `ROAD` in `js/cue.js`.

## Revision 10: deck starts minimised

- The NITE·DECK cassette player now starts minimised on every screen size. Before, this applied to phones only. It shows just its chrome title bar above the timestamp, and the key on the right of the bar expands it.
- Keyboard shortcuts (`1`–`4`, `M`) work whether the deck is open or not, and automatic colour change runs either way.
- `tools/interact.mjs` checks the deck starts minimised and that its key expands it.

## Revision 9: the title leaves after the intro

- **What it does.** Once the 10 s ignition ends, the title clears the road. The neon "Cruise" flickers twice and dies, the 1986 plate wipes shut from the edges, and the chrome MIDNIGHT pulls briefly toward the camera (anticipation) before receding to the horizon with sub-frame motion blur, fading over its last third. The road is clear 1.35 s into cruising and stays clear. Timings are in `TITLE_EXIT` in `js/cue.js`.
- **Skip and replay.** SKIP INTRO lands on the finished title, which then leaves the same way. REPLAY INTRO rewinds over an empty sky, and the ignition brings the title back as before.
- **Reduced motion.** The chrome fades in place instead of flying, and the neon fades without flickering.
- **Title-bound effects.** While cruising, effects tied to the title no longer play once it has gone: the music-locked chrome glints, and TURBO's title glint, lens flare and chrome flash. TURBO keeps its sun flare, bloom, RGB split, shake and car effects.

## Revision 8: automatic colour change

- **What it does.** While cruising, the environment moves to the next preset (SUNSET → BLUE HOUR → AFTERGLOW → LAGOON → …) after **40 s or 1500 road units, whichever comes first**. At full throttle that is about 27 s after the press, so driving fast changes colours sooner. It uses the same 1.6 s crossfade as a manual change, covering sky, sun, grid, mountains, chrome, neon and music layers, and the OSD shows “AUTO CH n NAME”.
- **Controls.**
  - Choosing a preset by hand restarts the countdown, and the cycle continues from your choice.
  - The intro, a replay or a skip resets it.
  - The deck has an **AUTO** key with an LED, on by default, and a thin bar that fills towards the next change.
- **How it stays deterministic.** The switch times are derived inside the 240 Hz fixed-step simulation from scene time and integrated road distance; they are not generated by the UI. The picture, the AudioWorklet's copy of the timeline and any replay therefore compute identical switch times.
- **Tests.** `tools/auto-env-test.mjs` passes 7/7:
  - switching by time, and by distance when accelerating;
  - manual reset, AUTO off/on, and the reset on replay;
  - identical results whatever order the timeline is queried in;
  - the audio engine crossfades too.

## Revision 7: refined car, higher camera, original mountains

- **The car is rebuilt as a sculpted loft instead of an extruded slab.** Smooth cross-sections run nose to tail: flared rear hips, tumblehome, a tapered nose and a crowned deck, so the clear-coat reflections of the sky, horizon, sun and grid flow over it. Details:
  - Rear glass and wing: a glasshouse with a louvred fastback, and an airfoil rear wing with endplates and a third brake light.
  - Rear fascia: a recessed tail-light bezel with fine louvres and chrome dividers, chrome trim lines, a chrome bumper strip, a finned diffuser, chrome-ringed exhausts, and a “NITE 86” plate.
  - Sides: 80s side strakes, black wheel-arch lips and mirrors.
  - Wheels: five-spoke rims with chrome lips.
  - Neon: a magenta beltline tube, a cyan sill line, and a cyan wing edge.
  - Paint: candy-purple with a subtle metallic flake.
- **A Forza Horizon-style chase camera.** The camera sits higher (2.65 m) and further back, looking down onto the roof and louvres with more road ahead. The horizon moved to mid-screen; the title, sun and neon recompose above it, and the car sits in the lower centre.
- **Mountains restored.** At your request, the smooth wireframe-grid ranges from Revision 3 are back in place of the low-poly version.
- **Robustness found while testing.** During this round the Mac's audio device stopped delivering frames to Chrome: the context said “running” but its clock was frozen, even on a blank page. Two fixes:
  - The engine now detects this after 1.5 s and the deck LCD shows `NO AUDIO OUT` instead of failing silently.
  - The picture clock follows the audio clock only while that clock advances at a believable real-time rate, so a stalled device can no longer slow the visuals down.
  - The interaction test skips its two audio-signal checks when the device is frozen, and all 31 remaining checks pass.

## Revision 6: you drive a car now

- **The player's car.** An original low 80s-style wedge coupé (no real make or model), built procedurally in `js/car.js`:
  - Body and glasshouse: an extruded body and a narrower glasshouse with a louvred fastback.
  - Rear details: a full-width louvred HDR tail-light bar, a “NITE 86” plate, a rear wing, a diffuser, and twin exhausts.
  - Materials and neon: candy-purple paint and glass that reflect the sky, horizon and sun, with neon edge trim and side stripes.
  - Road effects: a magenta underglow pool, a contact shadow, and spinning wheels.
- **A chase camera.** The camera now sits behind and above the car (eye height 1.95 m), with the car in the classic outrun spot under the title. In the ignition the car is not shown at first. At about 1.9 s it blasts past the camera on the right with a flame burst and light streaks, then merges onto the axis by 3.7 s, and it bounces with the slam at 6.0 s. REPLAY reverses it back out of shot.
- **It answers every input.**
  - Steering slides the car across the lane (±2.6 m) with yaw into the turn and body roll; the camera follows at 62 %.
  - Acceleration squats the car, pulls it slightly ahead, lights the exhaust flames, and adds tail-light streaks above about 120 MPH.
  - Turbo pulls the car back during the anticipation (with sputtering flames), then lurches it forward with blue-white flames and long streaks.
  - The traffic tail lights moved to the outer lanes so you overtake them cleanly.
- **A cockpit readout.** A live MPH speedometer (a Y2K LCD with a 14-segment bar that turns pink at the top end) sits beside TURBO and DRIVE. It reads 86 MPH cruising, about 200 at full throttle and about 280+ on turbo.
- **Control hints.** When cruising begins, an OSD-style strip shows “SPACE hold to accelerate · ◀▶ steer · T turbo” (touch devices see “Drive / drag to steer”). It fades after 9 s or as soon as you first accelerate, which the timeline determines.
- **Verification.** All 33 interaction checks, the touch checks and the iPhone 13 WebKit emulation still pass. Frame cost is about 6–8 ms at 1080p.

## Revision 5: tried, then reverted

At your request, the visual changes of this round are rolled back. Those were the staggered 1986 / control / LCD-boot entrances, the CRT scanlines on the deck's LCD, and a 9° slant on “Cruise”. The project is back to its Revision 4 look. What stays is test coverage only: iPhone 13 emulation on WebKit (`tools/mobile-smoke.mjs`) passes. It renders, a tap starts audio with 9/9 samples, and it uses the touch layout. Firefox still could not be launched here and remains untested.

## Revision 4: mountains to your reference

The wireframe mountains are rebuilt in the low-poly style of the reference image:
- A jittered vertex grid with ridged multifractal heights, plus a relaxation pass that turns single-vertex needles into pyramid peaks.
- Flat-shaded triangles with the wireframe drawn on every triangle edge, diagonals included, using barycentric anti-aliasing at a stable ~1.3 px.
- Cyan ridge lines blending to magenta at the base, dark faceted faces lit softly from the sky, and the foot of the range dissolving into the horizon glow.
- Two ranges: a 150×11 far range with a low valley for the sun, and 96×10 near flanks. They follow every preset.

Frame cost is unchanged (about 7 ms at 1080p). The video, keyframes and standalone file are regenerated.

## Revision 3: the remaining improvements

- **Title motion blur.** While the title flies (anticipation, whip, rewind), the chrome layer is rendered as 8 sub-frames across a 180° shutter (1/120 s) and averaged. This is true temporal motion blur, so the whip now streaks into the hit-stop, while the hit-stop frame itself stays sharp. Reduced-motion mode skips it.
- **Neon lettering.** The *r* now has a proper notch and shoulder, and the *s* a pointed top with a fuller belly. Tube crossings are found automatically from the path, and the pass written later gets a short unlit blockout gap, as a glass bender would paint it. A tangent bug at stroke reversals made the wide glow ribbon fold into star-shaped spikes at the tips of the u, i and s. It is fixed, and both glow and core now use MAX blending so bends never double up.
- **The slam frame is no longer blown out.** Screen flash 0.26 → 0.14, chrome flash 0.7 → 0.38, sun surge +50 % → +22 %, the sky flare scaled by 0.6, and a short bloom lift instead. Turbo is toned down the same way.
- **Traffic.** Six cars' red tail-light pairs sit in the outer lanes. Each is closed-form, at its own speed relative to your integrated road position, so you overtake them when you accelerate. Their streak length follows the relative speed, and they fade with distance. This also fixed a latent NaN, a `pow()` of a slightly negative base at a streak edge, that showed up as a black octagon once the bloom spread it.
- **Video export.** `tools/export-video.mjs` seeks every frame of the canonical timeline at 1920×1080, 60 fps, and muxes it with the offline render of the same audio engine. Output: `renders/video/midnight-cruise_ignition_1080p60.mp4` (scene 0.5–12.0 s: idle, the full 10 s ignition, then cruising; the audio segment measures −14.1 LUFS, −1.5 dBTP before AAC encoding).

## Concept

You find a VHS tape of the perfect 1986 night drive and press PLAY. The tape catches, and a chrome-and-neon title sequence slams onto a sunset highway. When the titles end the tape keeps rolling and the road is yours: cruise, floor it, or punch TURBO, and the soundtrack shifts with every move.

**Treatment in one line.** The *hook* (0–0.5 s) is a tracking-noise tape engage, a PLAY ▶ OSD and a 4:3 CRT frame. The *escalation* (1–6 s) is a low pass over the grid as the sun rises and the bass arpeggio and drums build, then a held breath. The *hero moment* is at 6.000 s, 60 % of the way in: the chrome title slams with a 4-frame hit-stop, star glint, lens flare and a big Fmaj9 chord and crash, then the neon writes itself. The *composed end state* (8.8–10 s) holds the full poster frame for 1.2 s while the road keeps moving.

## Beat sheet: one cue sheet for picture and sound (`js/cue.js`)

Tempo is 120 BPM: a beat is 0.5 s, a bar is 2 s, and one 32nd-note tick is 3000 samples at 48 kHz. The ignition is exactly 5 bars, so cruising begins on a downbeat with the musical phase intact.

| Time (s from START DRIVE) | Picture | Sound |
|---|---|---|
| 0.000 | Tape engage. VHS tracking noise (to 0.62 s), **PLAY ▶** OSD (to 1.75 s), rounded 4:3 CRT aperture, picture stepped at 15 fps (to 0.5 s) | Cassette clunk and motor spin-up, tape hiss with tracking chirps |
| 0.500 | CRT aperture expands to the full viewport (0.5–1.0 s) | **First pulse**: kick, sub drop and an Am9 pad swell |
| 1.000 | Low camera flight over the grid; sun rises (0.55–4.4 s); palms pass at three depths | Saw-bass 16th arpeggio enters, its filter opening |
| 2.000 | Speed builds | Four-on-the-floor kick, gated-reverb snare on 2 & 4, hats |
| 4.000 | **Anticipation**: the title appears far off and approaches while reflection bands gather; the camera settles onto the axis | Drums drop out; noise riser and reverse crash begin |
| 4.50–5.94 | FOV tightens | Bass filter closes |
| 5.500 | The breath | Everything drops except a Simmons-style tom fill (5.5 / 5.625 / 5.75 / 5.875 s) |
| 5.76–6.00 | Title whips toward the camera | Reverse crash swells |
| **6.000** | **SLAM**: chrome title hits with overshoot and squash; 4-frame hit-stop (6.000–6.067 s); flash; RGB-split spike; camera shake (to 6.6 s); anamorphic lens flare (to 6.95 s) | **Real crash cymbal, LinnDrum gated snare, kick, clean sub drop and low thump, and a wide Fmaj9 polysynth chord** |
| 6.06–6.72 | Star glint sweeps the top bevels with a face light sweep | Groove continues |
| 6.125–7.000 | Neon **“Cruise”** writes on as a tube, partly energised | Transformer hum follows the write |
| 7.000–7.375 | Ignition flicker, then stable illumination | Spark crackles on each flicker step (same `neonPower()` function) |
| 7.5–8.6 | “— 1 9 8 6 —” wipes in | |
| 7.625 | Cassette deck pops in (spring with overshoot) | UI “pop” |
| 8.0–8.8 | DRIVE and TURBO controls rise in | |
| 8.8–10.0 | **Hero hold**: road travel, chrome micro-drift, grain, glow | Snare fill (9.5–10 s) |
| **10.000** | Cruising, interactive; camera unchanged. Title exit: neon flickers out (+0.20–0.62 s), 1986 plate wipes shut (+0.25–0.70 s), chrome pulls in and recedes to the horizon (+0.30–1.35 s) | Cruise form bar 0 (Am) |

Measured onsets in the rendered ignition (`tools/onsets.py`): first pulse +1 ms, drums −1 ms, tom fill +1 ms, slam −4 ms. The −4 ms at the slam is the reverse cymbal cresting into the hit. Resolution is 1 ms.

**Interactive hit times**, all derived from the same timeline:

- **TURBO.** Press at *p*. The impact *I* is quantised to the next beat at least 0.75 s later, so anticipation lasts 0.75–1.25 s. *Anticipation*: camera lifts, FOV −9 %, sun and chrome dim, the neon sputters, two tape-hesitation frames; in the audio a 20 kHz→350 Hz low-pass sweep with a riser and reverse crash. *Impact at I*: FOV punch (+30 %), 0.27 s of 15 fps stepping, a flash, a radial speed blur that leaves the title sharp, a chrome sweep, a neon surge and a sun flare; in the audio a crash, sub, impact, whoosh, a stab on the current chord, and the filter snapping open. *Sustain*: 1.8 s at 3.7× speed. *Recovery*: 2.7 s. *Ready* at p + 7.0 s, signalled by a ring fill, an acid-green state and a chime. Overlapping turbos are rejected inside the timeline itself, not only by the UI.
- **Accelerate.** The throttle has a rise τ of 0.42 s and a release τ of 0.95 s, plus 0.12 s of smoothing. It drives speed (×2.35), FOV (+12 %), camera height, trail length, RGB split, and the music layers: kicks on 2 & 4, 16th hats, a clap, an arp (an octave higher above 60 %), the bass cutoff (×3.6) and pad brightness. Road position is the integral of velocity in a 240 Hz fixed-step simulation, so the grid never jumps.
- **Environment.** Palette and music-layer weights crossfade over 1.6 s, and the OSD shows a channel change (“CH 2  BLUE HOUR”).
- **Music pause.** A 0.5 s varispeed tape-stop. Resume fades in over 0.15 s with the beat phase preserved.
- **Skip.** A 0.4 s fast-forward (FF OSD, tape squeal, tearing), then cruise bar 0 with a crash.
- **Replay.** A 0.6 s rewind (REW OSD, squeal, the road runs backwards, the title flies away, the neon un-writes), then the full ignition again.
- **Cruise micro-events.** A seeded tracking glitch every ~23 s. The title has left by then (Revision 9), so the title glints of earlier revisions no longer play while cruising.

## Experience states

| State | What happens |
|---|---|
| **Visual idle** | The poster frame in gentle motion, audio off. The world drifts at 5.5 u/s, the unlit glass tube of “Cruise” is faintly visible, a glint sweeps every 6 s, and the START DRIVE pill invites interaction. Page load opens with a 0.45 s tracking disturbance and the PLAY ▶ OSD. |
| **Ignition** | The authored 10.000 s sequence. SKIP INTRO is available. |
| **Run** | The chase (Revision 18): flat out at the gear's base speed, 54 → 96 u/s; brake to 55 %; nitro when a canister is aboard (anticipation, impact, sustain, recovery). |
| **Paused / crashed / home** | Pause menu, EJECT panel (rewind or home), and the home screen with the title and START DRIVE. |
| **Reduced motion** | Follows `prefers-reduced-motion` or `?reduced=1`. The title fades in instead of flying and slamming; there is no hit-stop, frame stepping, shake, speed blur or camera banking; flashes and tracking are ×0.2; the neon fades up smoothly; turbo becomes a glow surge; road speed is ×0.6. Artwork, typography and every control are preserved. |

## How each signature feature is realised

| Feature | Where | How |
|---|---|---|
| One-point perspective grid | `world.js` grid shader | Analytic, anti-aliased lines with a world width and a ≥1.3 px screen minimum (stable thickness, no shimmer). A tight ~3 px glow per line; lines fade into the horizon haze once they are denser than the pixels (controlled detail at the vanishing point). Cross-lines get energy-conserving motion blur proportional to speed. Cyan road rails. A glossy floor with a broken sun-reflection streak. |
| Striped sun | sky shader | An angular disc with a yellow→orange→magenta gradient and horizontal cut-outs that thicken toward the bottom and drift downward; derivative-AA edges; a two-layer glow. It rises during ignition and flares at the slam and on turbo. |
| Deep-purple sky | sky shader | A three-stop gradient, horizon glow, haze, and two seeded twinkling star layers. |
| Wireframe mountains | `world.js` | Low-poly jagged ranges: a jittered grid with ridged multifractal peaks, flat-shaded faceted triangles, and a wireframe on every triangle edge (barycentric AA, ~1.3 px). Cyan ridges fade to magenta at the base, which dissolves into the horizon glow. Real 3D, so they parallax against steering. |
| Palms | `world.js` | Four procedural silhouettes drawn deterministically to a canvas atlas, on instanced billboards in three depth rows with distance fog, a sun-side rim light and a slight sway. Closed-form positions wrap with the road. |
| Light trails | `world.js`, `car.js` | Roadside light streaks whose length is proportional to speed (0.25 + 0.05·v units), view-aligned and additive. There are also traffic tail lights you overtake, and the player car's own tail-light streaks at high speed and on turbo. |
| The player's car | `car.js` | An original procedural 80s wedge coupé seen from a chase camera. Its louvred tail-light bar, neon trim, underglow and exhaust flames respond to steering, acceleration and turbo. |
| Double glow | neon and grid shaders, plus `post.js` | A tight core glow is authored per element (≈3–4 px at 1080p). The wide bloom (~30 px) comes from a six-level dual-filter pyramid with a soft threshold. |
| Chrome typography | `title.js` | **Real extruded geometry** from custom chamfered italic glyph polygons, with 45° single-segment bevels and flat-shaded facets. The face carries the classic horizon gradient (deep blue → white glare → dark horizon line → hot pink → peach) plus a perspective grid reflection that **scrolls with the road**. Bevels reflect a procedural environment, so top facets catch sky and lower facets catch ground; there is a specular key. Steering tilts the word up to ±7° to show depth and shift the reflections. Each preset tints the reflections coherently. |
| Star glint and lens flare | `post.js` | A four-point star with diagonal spikes travels along the projected top bevel. An anamorphic streak plus four chromatic ghost rings fire on the slam and on turbo. |
| Neon handwriting | `neon.js` | “Cruise” is authored as SVG path data, a single continuous stroke plus the i-dot, and flattened into a tube ribbon. It renders a white-hot core, a saturated tube body, a tight glow and an atmospheric bloom. Write-on runs by arc length with a hot pen head. The authored flicker table is shared with the audio. MAX blending keeps tight bends from doubling, and an unlit glass state shows in idle. |
| VHS chain | `post.js` final pass | ±1.5 px R/B split (scaled to resolution, spiking on hits); chroma bleed (sharp luma, chroma smeared right); tracking band with jitter; head-switching noise at the bottom; ~2 px scanlines (≥2 device px, no moiré); seeded dropouts and grain at 30 fps; a vignette; a rounded CRT aperture with barrel curvature at the opening; FF and REW tearing; triangular dither against banding. |
| Tape hesitation | `director.js` `visualTime()` | The picture steps at 15 fps for 0–0.5 s and for 0.27 s after turbo impact; there are two reversed frames at turbo press and the 4-frame hit-stop at the slam. Post effects keep running on real time, so the picture never freezes. |
| VCR OSD | DOM | VT323 with a chroma-fringed text shadow: PLAY ▶, PAUSE, FF, REW, channel changes, SP, and a camcorder date stamp “AM 12:mm / NOV. 8 1986” that ticks with scene time. This is the restrained secondary use of 1986. |
| Y2K interaction | `ui.js` and the deck | A chrome title bar, tactile 3D keys, an acid-green LCD with LED, preset name, a meter driven by the cue sheet and a tape counter, reels that spin with the music, and a pop-in spring. Drag lag and tilt follow drag velocity; on release a spring settles with overshoot, clamped inside the viewport and clear of the drive controls. There is a custom reticle cursor while steering. |

## Technical route and why

- **Three.js r169 with fully custom GLSL**, rendered into half-float MSAA targets. Three.js handles geometry and cameras; every material and the post chain are hand-written so the look is controlled rather than defaulted.
- **The title is real extruded geometry, not a canvas texture.** Bevel facets give genuine, view-dependent highlights that react to steering, the slam can be a true 3D move, and edges stay crisp at any resolution.
- **Neon is a WebGL ribbon built from SVG path data, not DOM SVG.** This is a deliberate deviation from the suggested route. The path stays SVG-authored and fully controllable, but rendering it in WebGL sends the tube through the same bloom and VHS chain as the world. It also avoids per-frame SVG filter cost and keeps it deterministic.
- **The DOM handles the UI and OSD** for accessibility, crisp text and real focus states. A real VCR's OSD is also drawn *over* the tape image, which is exactly how it composites here.
- **Audio is a hybrid engine in an AudioWorklet that shares one code path with the offline renderer.** Tonal instruments, sound effects and mastering are synthesised. Drums and cymbals are CC0 one-shot samples played by the engine's own sample player, which is sample-accurate on the same tick grid. The same JavaScript produces the live audio and the measured reference mixes, so the reported numbers describe exactly what plays. Music is sample-locked to the cue sheet: ticks are integer sample positions and the picture is slaved to the audio clock (measured agreement 0.3 ms). Interactive layers are continuous parameters, not crossfaded files. The worklet ships as an import-free bundle (`js/audio/worklet.bundle.js`) so Safari and Firefox load it, and a single-file standalone build works without a server.
- **One master timeline.** Every input becomes a timestamped event; a 240 Hz fixed-step simulation (with checkpoints for seeking) integrates throttle, steering and speed. `director.js` is a pure function from (T, events, viewport) to the frame. There is no wall-clock animation, no unseeded randomness, no frame-count dependence, and no CSS transitions used as animation logic.
- **Adaptive quality** has four tiers: pixel budget, MSAA 4/4/2/0 and DPR cap. It is chosen by device class and adjusted from the measured frame time.

## Check numbers

| Check | Result |
|---|---|
| Ignition duration | **10.000000 s** (timeline segment length; audio render 480 000 samples) |
| First frame | A CSS poster rendition of the scene at first paint; first WebGL frame 46–206 ms after module start, opening into a tracking disturbance. No black frame. |
| Tested viewports | 1920×1080, 2560×1440, 2560×1080, 1366×768, 1024×768, 768×1024, 390×844 (DPR 1, 2, 3) |
| Frame cost during the motion-blurred title flight (8 sub-frames) | 1920×1080: 8.9 ms median, 11.8 ms p95; 3840×2160 output: 11.6 ms median, 13.8 ms p95 |
| Frame cost, GPU-synchronised (render + readPixels fence), Apple M3 Max, Chrome 156 | 1920×1080 tier 0 (MSAA 4): **7.0–7.6 ms median, ≤ 9.7 ms p95** in slam, cruise, accelerate and turbo. 3840×2160 output (internal 2385×1342): 7.7–9.4 ms median, ≤ 10.5 ms p95. Tier 3: 5.6 ms. Phone 390×844 @3×: 5.3 ms. Live rAF cadence 16.7 ms median, 16.8 ms p95 (60 Hz vsync-locked). |
| Audio format | Stereo, **48 000 Hz**, AudioWorklet (context requested at 48 kHz); CC0 samples stored as 48 kHz WAV; reference renders are 24-bit WAV |
| Ignition reference mix (0–10.000 s, no input) | **−14.1 LUFS integrated, −1.5 dBTP**, LRA 2.3 LU |
| Cruise reference mix (the full 64 s form cycle, SUNSET, free cruise, no input) | **−13.9 LUFS integrated, −1.5 dBTP**, LRA 0.9 LU |
| A full chase (the canonical script: siren, two nitro bursts, presets, a music pause; 69 s) | −13.7 LUFS, −1.5 dBTP, LRA 1.3 LU |
| Loudest interactive combination (AFTERGLOW + two nitro bursts + 24 UI sounds in 12 s; 16 s window) | −13.1 LUFS, **−1.5 dBTP**, limiter peak gain reduction 4.0 dB, ≥1 dB GR 9 % of the time |
| Headroom guarantee | Master chain ends in a 4×-oversampled (16-tap) look-ahead true-peak limiter with a −1.5 dBTP ceiling; volume and mute only attenuate after it |
| Measurement scope | ffmpeg `ebur128=peak=true` (BS.1770-4 gating, 4× true peak) on the offline renders of the same engine (`renders/audio/*.wav`, `loudness.json`). These are not captures of the browser's output device. |
| Picture/sound sync | Heard-sample clock vs. picture clock: 0.3 ms. Output latency is compensated (174 ms in headless Chrome). Rendered onsets are within −5…+2 ms of cue times; the slam's −5 ms is the reverse cymbal cresting into the hit. |
| Audio start-up matrix | `tools/audio-smoke.mjs`: Chrome and WebKit × {http + AudioWorklet, http + ScriptProcessor fallback, file:// standalone}, all running at 48 kHz with 9/9 samples and non-zero signal. Your own Chrome over the non-secure LAN address: fallback mode, running. |
| Interaction tests | `tools/interact.mjs` passes all checks: start and audio unlock, cruise at 10 s, Space/BRAKE hold and release (including release off the button and on focus loss), lane changes by key and click, mouse not steering, nitro quantisation and no overlap, presets, music pause/resume, mute, volume, deck drag clamped clear of controls, pause menu → home → replay → rewind → ignition, skip → cruise, start from home. `tools/touch.mjs`: tap start, tap to change lane, touch-hold BRAKE and cancel, a quick tap not sticking, all visible targets ≥ 44 px. Zero console errors or warnings. |
| Fonts | All on-screen glyphs verified present in the packaged fonts (fontTools); icons are SVG, not glyphs |
| Banding | Half-float pipeline and ±1 LSB triangular dither on output |

## Browsers and input methods tested

- **Google Chrome 156, macOS (Apple M3 Max, ANGLE/Metal)**, automated through Playwright: mouse, keyboard, and emulated touch (390×844, `hasTouch`, coarse pointer). Served over http and opened from disk.
- **WebKit (Playwright's build of Safari's engine), macOS**: page renders and audio starts (context running at 48 kHz, 9/9 samples, signal present), served over http and opened from disk (`tools/audio-smoke.mjs`). Also **iPhone 13 emulation** on WebKit with touch (`tools/mobile-smoke.mjs`).
- **The Claude desktop app's built-in Chromium browser**: visual and audio-engine checks.
- **Not tested:** Firefox (headless Firefox would not launch in this environment), the Safari application itself as opposed to the WebKit engine build, and real iOS or Android hardware. Fallbacks exist for a missing `EXT_color_buffer_float` (8-bit targets) and a missing AudioWorklet (the page stays usable and the LCD shows NO AUDIO).

## Honest scores

| Criterion | Score | Why |
|---|---|---|
| Style fidelity | **8** | Grid, striped sun, chrome, neon, palms, wireframe mountains, VHS chain and Y2K deck all present and correctly executed; an expert names it instantly. |
| Concept wow | **7** | The VHS-tape framing (PLAY / REW / FF / tape-stop as real transport) is a coherent idea, but the world is the canonical synthwave image rather than a surprising reinvention. |
| Motion craft | **8** | Anticipation, a motion-blurred whip, hit-stop, overshoot and settle on the slam; a flowing camera spline; a deliberate turbo sequence; traffic adds mid-cruise life. The secondary-element entrances are still simple. |
| Interaction craft | **8** | Immediate feedback, satisfying ease-in and ease-out on the throttle, controlled steering with parallax, a beat-quantised turbo, and robust release handling. |
| Design & typography | **8** | A custom logotype with real bevels, clear hierarchy, safe margins, and responsive recomposition down to phone portrait. The neon lettering is good rather than great. |
| Finish & texture | **8** | Restrained scanlines, chroma bleed and grain, no banding or shimmer, good preset coherence, a controlled impact flash, and artefact-free neon tubes. |
| Sound & sync | **6** | Genre-correct structure (gated snare, saw-bass arp, pads, brass stab, tom fill, tape-stop), sample-locked sync and an on-spec master. It has only been verified by measurement: no one has listened critically in this session, so tone and balance are unproven to the ear. |
| Technical execution | **8** | A deterministic single timeline for picture and sound, seekable renders, measured loudness, an automated test suite, a 7 ms frame at 1080p. |

## Top three weaknesses

1. **The audio still lacks my own listening pass.** Your first listen exposed the noisy slam, so ears clearly catch what my measurements miss. The drums are now real CC0 recordings, but the tonal synths (pads, lead, brass chord) are still simple, and the samples are Freesound's high-quality lossy previews (Ogg), not the lossless originals.
2. **The lettering is good, not master-class.** The “Cruise” script is still hand-plotted Bézier work. The *r* and *s* are improved and crossings are blacked out like a real sign, but a professional letterer would still refine stroke rhythm and the C's proportions.
3. **Cross-browser coverage is still thin.** Chrome and the WebKit engine are verified on one Apple Silicon machine. Firefox, the Safari application, iOS and Android, and the adaptive-quality heuristics on weak hardware, are untested.

**With more time:** a critical listening and re-voicing pass on real monitors; a lettering artist's pass on the script; more elaborate entrances for the secondary elements; and testing in the Safari application, Firefox and on real mobile hardware.
