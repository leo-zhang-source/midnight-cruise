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
| **Cruising** | 24 u/s. Steering is enabled with a 1.4 s blend-in so a key already held when cruising starts never jerks the camera. |
| **Accelerating** | Layered as described above; release eases back. |
| **Turbo** | Anticipation, impact, sustain, recovery, cooldown. |
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
| Ignition reference mix (0–10.000 s, no input) | **−14.0 LUFS integrated, −1.5 dBTP**, LRA 2.3 LU |
| Cruise reference mix (the full 64 s form cycle, SUNSET, cruising speed, no input) | **−14.0 LUFS integrated, −1.5 dBTP**, LRA 1.1 LU |
| Loudest interactive combination (AFTERGLOW + full throttle + two turbos + 24 UI sounds in 12 s; 16 s window) | −12.4 LUFS, **−1.5 dBTP**, limiter peak gain reduction 4.8 dB, ≥1 dB GR 18 % of the time |
| Headroom guarantee | Master chain ends in a 4×-oversampled (16-tap) look-ahead true-peak limiter with a −1.5 dBTP ceiling; volume and mute only attenuate after it |
| Measurement scope | ffmpeg `ebur128=peak=true` (BS.1770-4 gating, 4× true peak) on the offline renders of the same engine (`renders/audio/*.wav`, `loudness.json`). These are not captures of the browser's output device. |
| Picture/sound sync | Heard-sample clock vs. picture clock: 0.3 ms. Output latency is compensated (174 ms in headless Chrome). Rendered onsets are within −5…+2 ms of cue times; the slam's −5 ms is the reverse cymbal cresting into the hit. |
| Audio start-up matrix | `tools/audio-smoke.mjs`: Chrome and WebKit × {http + AudioWorklet, http + ScriptProcessor fallback, file:// standalone}, all running at 48 kHz with 9/9 samples and non-zero signal. Your own Chrome over the non-secure LAN address: fallback mode, running. |
| Interaction tests | `tools/interact.mjs` passes all checks: start and audio unlock, cruise at 10 s, Space/DRIVE hold and release (including release off the button and on focus loss), arrow steering (left, right, re-centre), mouse not steering, turbo quantisation and no overlap, presets, pause/resume, mute, volume, deck drag clamped clear of controls, replay → rewind → ignition, skip → cruise. `tools/touch.mjs`: tap start, drag-steer, touch-cancel recentre, touch-hold DRIVE and cancel, all visible targets ≥ 44 px. Zero console errors or warnings. |
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
