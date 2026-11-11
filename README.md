# MIDNIGHT CRUISE — 1986

A synthwave highway chase on a 1986 videotape. You press PLAY, a 10-second chrome-and-neon ignition sequence plays out, the title flies off toward the horizon, and then you run from the police on a three-lane highway into the neon city, through slower traffic, until they catch you or you wreck the car.

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
| Skip the intro | **SKIP INTRO** (top right) | `Esc` / `S` |
| Change lane (three lanes) | tap or click the left / right half of the scene | `←` `→` or `A` `D`, one lane per press |
| Brake (slows to 55 %) | hold **BRAKE** | hold `Space` or `↓` |
| Nitro, when a canister is aboard | **NITRO** (its pips show how many you carry) | `T`, `↑` or `W` |
| Pause | the pause key (top right) | `P` or `Esc` |
| In the pause menu | **RESUME** · **RESTART** · **HOME** | `P` / `Enter` · `R` · `H` |
| After a crash | **REWIND 3 S** (needs a spare tape) · **HOME** | `R` · `H` |
| On the home screen | **START DRIVE** · **REPLAY INTRO** (top right) | `Enter` / `Space` · `R` |
| Music play / pause, mute, volume | cassette deck | `M` toggles mute |
| Colours | cassette deck: A SUNSET · B BLUE HOUR · C AFTERGLOW · D LAGOON | `1`–`4` |
| Automatic colour change | cassette deck **AUTO** key (on by default; its bar fills towards the next change) | — |

The cassette deck starts minimised to its chrome title bar. The key on the right of the bar expands it, and you can drag the deck by that bar. If your OS asks for reduced motion, the site switches to a reduced-motion presentation. You can force it with `?reduced=1` or disable it with `?reduced=0`.

## The game

**How a run goes.** Every run opens with a police cruiser on your bumper ("POLICE! PULL OVER"). After a second you floor it and the cruiser drops back, but it follows you for the whole run: you hear its siren and see its lights at the bottom of the screen. All traffic drives in your direction, slower than you, so the road comes at you in rows. Each press moves the car one lane, in about 0.2 s.

**What is on the road**

| Thing | What it does |
|---|---|
| Car, van | Blocks a lane. Each is at least as big as your car. |
| Truck | A cab and a long trailer: blocks a lane for longer. |
| Taxi | Drives in the middle lane, signals, then pulls over to one side as you close in. |
| Roadblock | From two stars: a police cruiser parked across a lane behind a hard-light barrier, usually two lanes wide. |
| Energy cells | Mark the open lane. Each adds score; 100 of them earn a spare tape (up to 3). |
| Nitro canister | A blue ring with a light pillar, now and then. Drive through it to take it aboard; you can carry three. |

**Mistakes**

- Driving into the back of a vehicle or a roadblock **wrecks** the car. The run is over.
- Changing lane into a vehicle that is alongside is a **sideswipe**: the car bounces back, the combo resets, you gain a star, and the police close in.
- A **stumble** (a sideswipe, being rammed, a drone hit) puts the pursuit car on your tail for 6 s. The camera pulls back so you see it, and a timer bar counts down under the stars. A second stumble while it is there and you are **busted**.
- Holding the brake for more than about 2 s also brings the pursuit car onto your tail.

**After a crash** the tape is ejected and the panel offers two things: **REWIND** spends a spare tape (you start with one) and runs the last three seconds backwards, road, traffic and all, then gives you 2 s of invulnerability. **HOME** goes back to the home screen. A new run always starts from the home screen.

**Wanted level: three stars**

| Stars | You get there by | What the police do |
|---|---|---|
| ★ | every run starts here | One cruiser follows you. |
| ★★ | a sideswipe (+1 star), three vehicles smashed with nitro (+⅓ each), or 3.5 km driven | Roadblocks appear. The cruiser makes ramming runs: chevrons race up your lane from behind for 1.1 s, then it charges. Change lane. If it hits, it shoves you and you lose speed for a second. |
| ★★★ | more of the same, or 8 km driven | A helicopter paces you with its searchlight. A drone locks the lane you are in (amber target), and 1.2 s later it strikes that lane. More roadblocks. |

Heat cools by one star every 12 s once 10 s pass without an incident, but never below the level your distance has earned.

**Scoring and speed**

- **Distance** scores points all the time.
- **Overtakes** add 1 to the combo, **close calls** (leaving a lane just before you would hit) add 3. The multiplier is ×1 + 0.1 per combo step, up to ×5, plus 25 % per star above the first.
- **Gears** engage with distance: the base speed rises from 130 MPH in gear 1 to 230 MPH in gear 6, and rows come closer together.
- **Nitro** is a 3.6 s burst at 1.85× speed during which you smash through traffic and roadblocks, and shove the pursuit car back if it is in your way. Each vehicle smashed scores points and adds a third of a star.
- **Slipstream**: staying close behind a vehicle before you pull out scores a bonus.

**The road.** One highway into the city for the whole run: megastructure towers on the horizon, a sign gantry over the road every 2,400 units, and a big billboard every 1,600. The four colour presets only change the mood, like the time of the evening; they switch every 40 s or 2,900 road units, whichever comes first.

**Fairness.** All traffic moves at one speed, so a row that had an open lane when it appeared keeps it, and every row leaves a lane open within one lane of the previous opening. A ramming run or a drone lock only starts when a neighbouring lane is clear. `tools/bot.mjs` drives 16 different seeds for 5 minutes each without a single stumble (4–9 ramming runs and 5–13 drone strikes dodged per run). With nitro the same bot crashes in 3 of 16 runs, after 220 s or more: coming out of a burst into dense gear-6 traffic is the risk you take for the points.

**Pause.** `P` pauses the run like a VCR: the game clock stops and the music carries on, muffled. The run also pauses by itself when the tab is hidden or the window loses focus, and stays paused until you resume.

Each visit gets its own traffic. `?seed=7` pins it, and `?free=1` is the plain cruise with no traffic and no police.

## Inspection and determinism

Every frame is a pure function of scene time, the seed, the viewport and the event timeline. That includes the game: traffic, collisions, score and the rewind are simulated at 240 Hz from the event log. Two layers make use of this.

**URL parameters**

| Parameter | What it does |
|---|---|
| `?t=7.0&script=canonical` | Freeze on scene time 7.0 s of the canonical interaction script (START at 1.0 s, so this is ignition time 6.0, the slam) |
| `?script=canonical` | Replay the canonical sequence live: the intro, a recorded clean drive with two nitro canisters picked up and fired, the four presets, a music pause, then the home screen and a replay of the intro |
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
node tools/interact.mjs          # end-to-end input test in free mode (mouse, keyboard, focus loss, deck drag, replay/skip …)
```

```bash
node tools/game-test.mjs         # game simulation unit tests: determinism, crash, home / restart, rewind, sideswipe, busted, ram, drone, nitro stock, stars, pause
```

```bash
node tools/game-ui.mjs           # browser test of the game flow: run opening, brake, EJECT panel, rewind, home, pause menu, busted, nitro stock, phone layout
```

```bash
node tools/bot.mjs               # fairness soak: a look-ahead bot drives several seeds (add --nitro, --secs 300, --seeds 16)
```

```bash
node tools/scenes.mjs renders/scenes 1280x720   # stills of the moments worth checking: ram warning, drone, roadblock, rewind, menus …
```

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
js/game.js            the game simulation: traffic generator, pickups, collisions, score, stars, the pursuit car, drone
js/gameview.js        game layer and highway scenery: traffic, police, roadblock, drone, helicopter, pickups, debris, city, gantries, billboards
js/vehicles.js        instanced car / van / truck-cab bodies lofted from cross-sections
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
