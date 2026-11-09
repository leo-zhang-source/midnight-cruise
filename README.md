# MIDNIGHT CRUISE — 1986

An interactive synthwave title sequence. You press PLAY on an old tape and a 10-second chrome-and-neon ignition sequence plays out. Then the title flies off toward the horizon and the road is yours, indefinitely.

## Play online

### ▶ https://leo-zhang-source.github.io/midnight-cruise/

It opens in a current Chrome, Edge, Safari or Firefox, on desktop or phone, and nothing needs installing. GitHub Pages republishes the site on every push to `main`. A new version is usually live a minute or two after a push, and browsers may keep the previous one for up to 10 minutes, so reload if you don't see a change yet.

**If you hear nothing:**
- Open the page in a normal browser window (Chrome or Safari). An app's built-in preview pane may not play sound.
- When the browser blocks or suspends audio, the deck's LCD shows `NO AUDIO` or `TAP TO RESUME` (expand the deck with the + key on its title bar to see it). Any click or key press resumes audio. Also check that the tab isn't muted and the deck's volume slider isn't at zero.
- `?audio=compat` forces the ScriptProcessor fallback. It runs the same synth on the main thread for browsers without AudioWorklet.

## Controls

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Start (also enables audio) | **START DRIVE** | `Enter` / `Space` |
| Skip the intro | **SKIP INTRO** (top right) | `Esc` / `S` |
| Replay the intro | **REPLAY INTRO** (top right) | `R` |
| Accelerate | hold **DRIVE** | hold `Space` |
| Steer | drag on touch (the mouse does not steer) | `←` `→` or `A` `D` |
| Turbo | **TURBO** (the ring shows when it's ready) | `T` |
| Music play / pause, mute, volume | cassette deck | `M` toggles mute |
| Environment | cassette deck: A SUNSET · B BLUE HOUR · C AFTERGLOW · D LAGOON | `1`–`4` |
| Automatic colour change | cassette deck **AUTO** key (on by default; its bar fills towards the next change) | — |

While you cruise, the environment changes by itself to the next preset every 40 s or 1500 road units, whichever comes first. Accelerating gets you there sooner. You drive the car seen from behind. A live MPH speedometer sits next to TURBO and DRIVE, and control hints appear when cruising starts. The cassette deck starts minimised to its chrome title bar. The key on the right of the bar expands it, and you can drag the deck by that bar. If your OS asks for reduced motion, the site switches to a reduced-motion presentation. You can force it with `?reduced=1` or disable it with `?reduced=0`.

## Inspection and determinism

Every frame is a pure function of scene time, the fixed seed (1986), the viewport and the event timeline. Two layers make use of this.

**URL parameters**

| Parameter | What it does |
|---|---|
| [`?t=7.0&script=canonical`](https://leo-zhang-source.github.io/midnight-cruise/?t=7.0&script=canonical) | Freeze on scene time 7.0 s of the canonical interaction script (START at 1.0 s, so this is ignition time 6.0, the slam) |
| [`?script=canonical`](https://leo-zhang-source.github.io/midnight-cruise/?script=canonical) | Replay the canonical sequence live: start → steer → accelerate → turbo → presets → pause → replay |
| `?events=[…]` | Replay any JSON event list. Export one from the console with `MC.events()` |
| [`?hud=1`](https://leo-zhang-source.github.io/midnight-cruise/?hud=1) | Debug HUD: time, phase, fps, quality tier, audio state |
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
node tools/interact.mjs          # end-to-end input test (mouse, keyboard, focus loss, deck drag, replay/skip …)
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
node tools/build.mjs             # regenerate js/audio/worklet.bundle.js + dist/midnight-cruise(.artifact).html after any code change
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
js/timeline.js        event log + 240 Hz fixed-step simulation (speed, throttle, steering)
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
dist/                 midnight-cruise.html, the single-file build (source of the claude.ai artifact)
vendor/               three.js r169 (MIT)
fonts/                Chakra Petch, VT323 (SIL OFL 1.1) + licences
renders/              contact sheet, loudness.json and analysis plots (WAV, MP4 and full-size keyframes are regenerated by tools/, not committed)
tools/                server, capture, tests, audio render + measurement
```

See **REPORT.md** for the treatment, beat sheet and measurements, and **CREDITS.md** for licences.
