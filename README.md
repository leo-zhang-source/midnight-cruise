# MIDNIGHT CRUISE — 1986

A synthwave highway chase on a 1986 videotape. You press PLAY, a 10-second chrome-and-neon ignition sequence plays out, the title flies off toward the horizon, and then you run from the police on a three-lane highway that sweeps and rolls its way into the neon city, through slower traffic, until they catch you or you wreck the car. The longer you last the harder it gets, and the police plan their attacks: every one is checked against the road ahead so that it leaves you a way out, but only just.

## Play online

### ▶ https://leo-zhang-source.github.io/midnight-cruise/

It opens in a current Chrome, Edge, Safari or Firefox, on desktop or phone, and nothing needs installing.

- **One file.** The live site is a single self-contained page, `docs/index.html`, with all code, fonts and samples inlined. A browser can't end up with a mix of old and new files.
- **Always the latest version.** GitHub Pages republishes it on every push to `main`, usually within a minute or two. Each time the page opens, it compares its build id with `version.json`, which is fetched uncached. If a newer build is live, the page reloads itself once.
- **If it can't start**, for example because a download was cut off or WebGL is unavailable, the page shows the reason and a RELOAD button in place of an unresponsive START.

**If you hear nothing:**
- Open the page in a normal browser window (Chrome or Safari). An app's built-in preview pane may not play sound.
- When the browser blocks or suspends audio, the deck's LCD shows `NO AUDIO` or `TAP TO RESUME` (expand the deck with the + key on its title bar to see it). Any click or key press resumes audio. Also check that the tab isn't muted and the deck's volume slider isn't at zero.
- `?audio=compat` forces the ScriptProcessor fallback. It runs the same synth on the main thread for browsers without AudioWorklet.

## Controls

The car drives flat out by itself. You steer, brake and fire nitro.

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Start (also enables audio) | **START DRIVE** | `Enter` / `Space` |
| Skip the intro (it opens every start) | **SKIP INTRO** (top right) | `Esc` / `S` |
| Change lane (three lanes) | tap or click the left / right half of the scene | `←` `→` or `A` `D`, one lane per press |
| Brake (slows to 55 %; the car has weight, so it takes about a second) | hold **BRAKE** | hold `Space` or `↓` |
| Nitro, when a canister is aboard | **NITRO** (its pips show how many you carry) | `T`, `↑` or `W` |
| Pause | the pause key (top right) | `P` or `Esc` |
| In the pause menu | **RESUME** · **RESTART** · **HOME** | `P` / `Enter` · `R` · `H` |
| After a crash | **REWIND 3 S** (needs a spare tape) · **HOME** | `R` · `H` |
| On the home screen | **START DRIVE** | `Enter` / `Space` |
| Music play / pause, mute, volume | cassette deck | `M` toggles mute |
| Colours | cassette deck: A SUNSET · B BLUE HOUR · C AFTERGLOW · D LAGOON | `1`–`4` |
| Automatic colour change | cassette deck **AUTO** key (on by default; its bar fills towards the next change) | — |

The cassette deck starts minimised to its chrome title bar. The key on the right of the bar expands it, and you can drag the deck by that bar. If your OS asks for reduced motion, the site switches to a reduced-motion presentation. You can force it with `?reduced=1` or disable it with `?reduced=0`.

## The game

**How a run goes.** Every run opens with a police cruiser on your bumper ("POLICE! PULL OVER"). After a second you floor it and the cruiser drops back, but it follows you for the whole run: you hear its siren and see its lights at the bottom of the screen. All traffic drives in your direction at a little under half your cruising speed (64 MPH at the start, 124 as top gear engages), and each lane has its own pace: the left lane is about 7 MPH faster than the middle, the right lane 7 slower, so cars overtake each other all the way to the horizon. A row of traffic starts out strung along the road and closes up as you reach it, but nobody drives exactly abreast: the vehicles of a row arrive a car length or two apart. Everyone is driving: cars drift a little in their lanes, steer into lane changes and lean as they do, their wheels turn, and their tail lamps streak the road behind them. Each press moves the car one lane, in about 0.2 s.

**What is on the road**

| Thing | What it does |
|---|---|
| MONOLITH saloon, NOMAD estate | Car-sized: blocks a lane. The saloon is a long flat-sided slab with a bar of red light across its tail and bracket lamps at its front corners; the estate a square off-roader on lugged tyres with flared arches and cargo on its roof. Four paints each. |
| RELAY van, MULE pickup | A little longer and taller: a dark cab carrying a pale cargo pod with an arch of red light round its doors, and a six-wheel utility truck with an orange tube frame. |
| LEVIATHAN truck, ORBIT coach | Twelve units long: blocks a lane for longer. A dark banded container behind an angular cab with a visor of cyan light, or a lilac coach with glass its whole length. |
| FIREFLY taxi | A tall yellow pod round black glass, a lit TAXI sign, two rings of red light at the back. Drives in the middle lane, signals for 0.45 s, then steers across to one side as you close in (0.85 s, nose first, leaning out of the turn). It starts 1.8 s before you reach it and is in its new lane about half a second ahead of you. |
| Merging car or van | From third gear, and more often as the threat level rises: a car or van in a side lane signals and merges into the middle as you close in, timed like the taxi. |
| Rolling roadblock | From two stars: two police cruisers in echelon, lights on, snaking across their lanes, a warning sign over each. They brake as you come up. One lane is left — and when a cruiser is in the middle lane it usually (half the time at two stars, 60 % from three; that pair does not brake) signals with chevrons and steers across into that open side lane, so the middle becomes the way through. |
| Weaving cruiser | From two stars: one cruiser swinging between the middle lane and one side; chevrons over the two lanes show which way it is steering. About 1.2 s before you reach it, it takes the lane it is heading for and the sign over that lane turns into a warning triangle. At three stars a second cruiser may hold the third lane. |
| Cruiser that cuts you off | From four stars: a single cruiser in the middle lane that waits until you are 1.8 s away, looks which lane you are in, and cuts across into it (CRUISER CUTTING YOU OFF). The lane it leaves is your way round. If you are behind it in the middle it stays and brakes. |
| Energy cells | Mark the open lane. Each adds score (silently); 100 of them earn a spare tape (up to 3). |
| Nitro canister | A blue ring with a light pillar: the first about 15 s into a run, then one every 30 to 45 s in top gear, and up to half as far apart again as the threat level rises. Drive through it to take it aboard; you can carry three. |

**Two lives**

- You start every run with two lives (the hearts beside the stars).
- **Any hit takes one**: driving into the back of a vehicle (you plough through it and lose speed), a sideswipe (you bounce back to your lane), the grappler, the interceptor, the helicopter.
- With one life left the pursuit car sits off your rear quarter **for good**, its grappler runs come sooner, and the next hit ends the run: wrecked if it was a vehicle, busted if it was the police.
- **A nitro burst shakes it off and gives the life back.** So a canister in stock is your second chance: spend it on points, or keep it. The game says so once, quietly: NITRO SHAKES THEM OFF shows under the stars for four seconds after the hit, a canister picked up on the last life says FIRE IT TO SHAKE THEM OFF, and the nitro button wears a pink ring while you hold one.
- After a hit nothing attacks you for two and a half seconds.
- Holding the brake for more than about 2 s brings the pursuit car onto your bumper for a moment, without costing a life.

**After a crash** the tape is ejected and the panel offers two things: **REWIND** spends a spare tape (you start with one) and runs the last three seconds backwards, road, traffic and all, then gives you 2 s of invulnerability and both lives. **HOME** goes back to the home screen. A new run always starts from the home screen, and every start opens the same way: the tape rewinds and the ten-second intro plays, into the run. **SKIP INTRO** cuts it to a 0.4 s fast-forward. **RESTART** in the pause menu opens the same way.

**Wanted level: five stars**

| Stars | You get there by | What the police add |
|---|---|---|
| ★ | every run starts here | One cruiser follows you. |
| ★★ | hits (a sideswipe, a crash or ramming a cruiser with nitro is half a star each), or 1.4 km of road since the heat was last cooled | Police appear ahead of you: rolling roadblocks and weaving cruisers. The cruiser behind comes up with its grappler, a yellow fork with a net ahead of its bumper: chevrons race up your lane from behind for the length of a warning, then it lunges. Change lane. If the net takes your rear wheel, the cruiser hangs on for a second, you lose speed and a life. |
| ★★★ | more of the same, or 3.4 km | A police helicopter comes and goes. It flies in from one side, holds station far ahead and high up, side-on, sweeping the road with its searchlight, makes three or more attacks, then turns away and climbs out on the other side; it is back 10 to 16 s later. For an attack it turns to face you and the light locks the lane you are in (the beam turns amber, then red, with a target on the lane); a warning later it fires down that lane from its two gun pods. |
| ★★★★ | 6.4 km | **The interceptor**: a second, faster cruiser comes up the hard shoulder on your side (INTERCEPTOR ON THE LEFT SHOULDER, and that corner of the screen flashes), draws level and waits for its moment. Then it signals, with chevrons running from it into your lane and a warning over the lane, and swerves into you: from the shoulder into the side lane, or, if you are in the middle, straight across the side lane into it. Go the other way. **Twin searchlights**: the helicopter lights two lanes at once, yours and the one beside it that leaves you the harder way out; take the dark lane. **The cruiser that cuts you off** (see above). |
| ★★★★★ | 10.4 km | **The walking barrage**: the helicopter fires down all three lanes one after the other, 1.15 s apart. Get out of each lane before its turn and back into the wake. **Pincers**: two units may now attack at the same time, for example the grappler from behind while the helicopter has the lane beside you. |

Heat from hits cools by one star every 12 s once 10 s pass without an incident, but never below the level the road has earned. **The third nitro burst cools the heat by two stars**, and the road count for the next star carries on from there. The call-out for each burst counts them (NITRO 1/3 TO COOL THE HEAT).

**The threat level** (LV beside the stars) is the other clock. It rises by one every 40 seconds of a run and never comes down:

- **Speed.** The car accelerates for the whole run (see below), so everything arrives sooner.
- **Warnings shorten.** Every warning lasts the reaction time the police allow you plus 0.45 s: 1.2 s at level 0, about 0.03 s less per level, never under 0.87 s.
- **Attacks come sooner.** The pauses between attacks shrink with every level (intervals ÷ (1 + 0.1 × level)), and the helicopter stays for more attacks.
- **Traffic thickens.** More rows are pairs and convoys, more cars change lane, more rows are police.
- **Nitro gets scarce.** Canisters are up to 50 % further apart.
- **The heat has a floor.** From level 3 (two minutes) the wanted level never drops below two stars, from level 6 (four minutes) never below three.

**How the police think.** They do not attack on a timer. Twenty times a second each unit that is ready looks at a forecast of the road for the next 5.8 s (where every vehicle, every lane change and every attack already under way will block each lane, with a tenth of a second of slack added around all of it) and lays its attack over that. It goes ahead only if a driver in your lane, given the reaction time for the level and a slightly slow lane change, would still have a way through. Among the ways it could attack it picks the one that leaves the hardest way out. Other things they do:

- **They take turns.** The unit that has waited longest goes first; an interceptor on its way goes before the others.
- **They learn which way you dodge.** Every dodge is counted. If you favour one side, the interceptor comes up that shoulder and the twin searchlights take that lane.
- **They have the traffic held back for set pieces.** An interceptor's swerve, twin searchlights and the barrage are asked for a few seconds ahead: the traffic leaves a gap, strung with cells, and the attack comes when the gap does.
- **They hold off near anything unsettled.** A cruiser still weaving, or one waiting to cut you off, has not picked its lane yet; an attack must be over well before you reach it.

**Scoring and speed**

- **Distance** scores points all the time.
- **Overtakes** add 1 to the combo, **close calls** (leaving a lane just before you would hit) add 3. **Dodging a police attack** scores 300 × the multiplier (DODGED). The multiplier is ×1 + 0.1 per combo step, up to ×5, plus 25 % per star above the first.
- **The car accelerates all the way.** It pulls steadily through six gears, from 139 MPH off the line to 269 MPH as top gear engages (after 6.4 km, about 80 s), and in top gear it keeps gaining, up to 374 MPH. You hear it: the engine note climbs through each gear and falls back at the change. It has weight: braking sheds speed at a fixed rate and so does getting it back, so a dab of brake costs you about two seconds.
- **Nitro** is a 3.6 s burst at 1.85× speed during which you smash through traffic and police cruisers (a cruiser costs a whole star), and shove the pursuit car back if it is in your way. Each vehicle smashed scores points. Every third burst cools the wanted level by two stars. A burst also rams the interceptor off for 14 s.
- **Slipstream**: staying close behind a vehicle before you pull out scores a bonus.

**The road.** One highway into the city for the whole run, and it is a road now, not a grid: three lanes of asphalt with dashed lane lines, solid edge lines, a hard shoulder each side and a steel guardrail on posts beyond it (amber reflectors on the left, white on the right); the neon grid is the plain it crosses. It is not straight or flat. After the opening straight it sweeps left and right in long bends and rises and falls over crests, the camera looks into each bend, the car leans, and the sun and the city swing across the windscreen and come back: the road always returns to the line that leads to them. The bends are in the picture only; the game is still three lanes. On the horizon the megastructure towers, over the road a sign gantry every 2,400 units and a big billboard every 1,600, beside it roadside signs on posts. Traffic passing in the next lane goes by with a rush of air on that side. The four colour presets only change the mood, like the time of the evening; they switch every 40 s or 5,200 road units, whichever comes first.

**Fairness.** Every row leaves a lane open within one lane of the previous opening, and rows are spaced for the speed you are really doing, with room for their stagger. The lanes run at different speeds, so each vehicle starts behind or ahead of its place by what its lane will gain or lose, and the speed difference between lanes follows how fast you are closing: a row closes up to its planned stagger when you reach it whether you come in on the brake, at cruising speed or in a nitro burst. A taxi or a crossing cruiser is in its new lane at least 0.8 s before you arrive; a weaving cruiser takes its lane at least 1.2 s before, and the row after it leaves the middle lane open. Warnings are timed for the speed you would be doing flat out, so braking on the way in never shortens one. No police attack starts unless the forecast of the road leaves a way through it (see *How the police think*), and traffic is laid out 6.6 s of driving ahead, so the forecast covers the whole of even the longest attack. `tools/bot.mjs`, which drives by the same forecast but is told nothing in advance, drives 40 different seeds for 5 minutes each (to threat level 7, most of it at five stars) without taking a single hit, with or without nitro. That is the bar for every change to the numbers.

**Pause.** `P` pauses the run like a VCR: the game clock stops and the music carries on, muffled. The run also pauses by itself when the tab is hidden or the window loses focus, and stays paused until you resume.

Each visit gets its own traffic. `?seed=7` pins it, and `?free=1` is the plain cruise with no traffic and no police.

## Inspection and determinism

Every frame is a pure function of scene time, the seed, the viewport and the event timeline. That includes the game: traffic, collisions, score and the rewind are simulated at 240 Hz from the event log. Two layers make use of this.

**URL parameters**

| Parameter | What it does |
|---|---|
| `?t=7.0&script=canonical` | Freeze on scene time 7.0 s of the canonical interaction script (START at 1.0 s, so this is ignition time 6.0, the slam) |
| `?script=canonical` | Replay the canonical sequence live: the intro, a recorded clean drive with a nitro canister picked up and fired, the four presets, a music pause, then the home screen and a second start, which opens with the intro again |
| `?seed=7` | Pin the traffic seed (each visit otherwise gets a random one, stored in its start event) |
| `?free=1` | Free cruise: no traffic, no police and no game over; a nitro canister is refilled 7 s after you use one |
| `?events=[…]` | Replay any JSON event list. Export one from the console with `MC.events()` |
| `?hud=1` | Debug HUD: time, phase, fps, quality tier, audio state |
| `?frame.carKWide=5.2&frame.shiftWide=0` | Override a framing constant (`FRAME` in `js/director.js`) for tuning |
| `?tier=0..3` | Pin a quality tier. Without it, tiers adapt to the measured frame time |
| `?w=1920&h=1080&capture=1` | Fixed-size render target for stills |

**Console API**

- `MC.seek(T)` and `MC.play()` freeze on and resume from a scene time.
- `MC.state(T)` returns the full frame description.
- `MC.events()` returns the recorded live timeline.

## Tools (development only)

These scripts are for checking a working copy before pushing. The browser tests drive a copy served by `python3 tools/serve.py`.

```bash
cd tools && npm install          # playwright-core, used with your installed Google Chrome
```

```bash
node tools/render-audio.mjs      # offline reference renders (48 kHz/24-bit) + EBU R128 / true-peak via ffmpeg
```

```bash
node tools/capture.mjs renders/keyframes 1920x1080 7.0,11.5   # deterministic stills
```

```bash
node tools/interact.mjs          # end-to-end input test in free mode (mouse, keyboard, focus loss, deck drag, start/skip …)
```

```bash
node tools/game-test.mjs         # game simulation unit tests: determinism, crash, home / restart, rewind, sideswipe, busted, grappler, helicopter, steering curves, rolling roadblock, weaving cruiser, nitro stock, stars, pause
```

```bash
node tools/game-ui.mjs           # browser test of the game flow: run opening, brake, EJECT panel, rewind, home, pause menu, busted, nitro stock, phone layout
```

```bash
node tools/bot.mjs               # fairness soak: a look-ahead bot drives several seeds (add --nitro, --secs 300, --seeds 16)
```

```bash
node tools/scenes.mjs renders/scenes 1280x720   # stills of the moments worth checking: grappler run, searchlight lock, roadblock, rewind, menus …
node tools/scenes.mjs renders/scenes 1280x720 1000 heli   # only the shots whose name starts with "heli"
node tools/seq.mjs renders/scenes/seq 42.1 43.6 6   # a strip of frames from a bot run, to judge motion (a lane change, a weave, a pass)
node tools/vary.mjs '{"rowGap":[1.2,0.75]}' 40 300   # the fairness soak with some constants overridden: how hard can it get before the bot takes hits?
node tools/smoke.mjs             # after a build: the Pages build and both single files load a three-star moment without errors
```

Open `http://localhost:8086/tools/vehicle-preview.html` to see the traffic and police bodies on a studio floor (`&rows=0,3` picks vehicles, `&views=6,2,1` the angles, `&paint=1` another colour, `&t=0.4` turns the wheels), and `http://localhost:8086/tools/heli-preview.html` for the helicopter from eight sides.

```bash
node tools/touch.mjs             # emulated-touch test at 390×844
```

```bash
node tools/perf.mjs              # GPU-synchronised frame cost at several sizes and tiers
```

```bash
node tools/audio-smoke.mjs webkit https://leo-zhang-source.github.io/midnight-cruise/   # audio start-up check in chromium | webkit | firefox
```

```bash
node tools/mobile-smoke.mjs      # iPhone 13 emulation on WebKit: render, tap START, audio, touch layout
```

```bash
node tools/export-video.mjs      # deterministic 1920×1080 60 fps MP4 of the ignition with its audio → renders/video/
```

```bash
node tools/build.mjs             # after any code change: regenerate js/audio/worklet.bundle.js, docs/ (the Pages site) and dist/
```

```bash
python3 tools/fetch_samples.py && python3 tools/prepare_samples.py   # re-download and re-prepare the CC0 samples
```

```bash
python3 tools/spectrum.py renders/audio/cruise_ref.wav ; python3 tools/onsets.py renders/audio/ignition.wav
```

The tools need Node 18+, Google Chrome, Python 3 with numpy, and ffmpeg (for the loudness measurement). For the WebKit and Firefox checks, also run `npx playwright install webkit firefox` from `tools/`.

## Files

```
index.html            semantic shell, controls, cassette deck, VCR OSD
css/style.css         UI styling (no CSS transitions drive animation)
js/cue.js             THE cue sheet: timecodes, harmony, patterns — read by picture and sound
js/timeline.js        event log + 240 Hz fixed-step simulation (speed, brake, lanes, runs, home / restart, rewind)
js/game.js            the game simulation: traffic generator, pickups, collisions, score, stars, the pursuit car and its grappler, the helicopter
js/gameview.js        game layer and highway scenery: traffic, police, grappler, roadblock, helicopter, pickups, debris, city, gantries, billboards
js/vehicles.js        the eight traffic and police vehicles after the vehicle studies: lofted hulls with cut wheel arches, chamfered blocks, tube frames, turned wheels that spin, lettering; metallic paint, glass, trim and lamp materials; one instanced mesh each
js/heli.js            the police helicopter: one lofted body (bubble, cabin, boom) with T-tail, skids, searchlight, gun pods and blurred rotor discs
js/director.js        pure choreography: (T, events, viewport) → frame description
js/world.js           sky/sun, grid, wireframe mountains, palms, light trails (GLSL)
js/title.js           extruded chamfered logotype + chrome material, 1986 plate
js/neon.js            “Cruise” as an SVG path → luminous tube ribbon
js/post.js            MSAA half-float pipeline, bloom pyramid, VHS finishing pass
js/ui.js              inputs → timeline events, deterministic window physics, OSD
js/audio/synth.js     the synthesizer, sequencer, FX and mastering chain (pure JS DSP)
js/audio/samples.js   the CC0 sample manifest
js/audio/worklet.js   AudioWorklet host (worklet.bundle.js = generated, import-free build of it)
js/audio/engine.js    main-thread audio: worklet loading, sample decoding, clock mapping, volume/mute
assets/samples/       the 9 CC0 one-shots (48 kHz WAV); assets/src/ = untouched Freesound downloads + sources.json
docs/                 the GitHub Pages site: the single-file build as index.html + version.json (generated by tools/build.mjs)
dist/                 generated, not committed: standalone build + claude.ai artifact variant
vendor/               three.js r169 (MIT)
fonts/                Chakra Petch, VT323 (SIL OFL 1.1) + licences
renders/              contact sheet, loudness.json and analysis plots (WAV, MP4 and full-size keyframes are regenerated by tools/, not committed)
tools/                server, capture, tests, audio render + measurement
```

See **REPORT.md** for the treatment, beat sheet and measurements, and **CREDITS.md** for licences.
