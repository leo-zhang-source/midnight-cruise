# Credits and licences

## Third-party assets shipped with the site

| Asset | Files | Author | Licence | Source |
|---|---|---|---|---|
| three.js r169 | `vendor/three.module.min.js` | three.js authors | MIT (`vendor/THREE_LICENSE.txt`) | https://cdn.jsdelivr.net/npm/three@0.169.0 |
| Chakra Petch (Regular, Medium, SemiBold, Bold) | `fonts/ChakraPetch-*.ttf` | Cadson Demak / The Chakra Petch Project Authors | SIL Open Font License 1.1 (`fonts/ChakraPetch-OFL.txt`) | https://github.com/google/fonts/tree/main/ofl/chakrapetch |
| VT323 | `fonts/VT323-Regular.ttf` | Peter Hull / The VT323 Project Authors | SIL Open Font License 1.1 (`fonts/VT323-OFL.txt`) | https://github.com/google/fonts/tree/main/ofl/vt323 |

### Sound samples: all CC0 1.0 (public domain dedication), from Freesound

The drums, cymbals and reverse cymbal are real recordings rather than synthesis. Each file is the Freesound high-quality preview (Ogg), unmodified in `assets/src/`. `tools/prepare_samples.py` converts it to the engine's 48 kHz stereo WAV in `assets/samples/` (leading silence trimmed, peak-normalised, tail faded). `assets/src/sources.json` records the provenance. CC0 asks for no attribution; it is given here anyway.

| Engine file | Original title | Author | Source | Licence | Used for |
|---|---|---|---|---|---|
| `gated_snare.wav` | Gated Reverb Snare.aif | HenryRichard | https://freesound.org/people/HenryRichard/sounds/451654/ | CC0 1.0 | Backbeat snare and the slam |
| `crash_f.wav` | CRASH Zildian A Custom 16'' centr F.wav | minorr | https://freesound.org/people/minorr/sounds/104217/ | CC0 1.0 | Crash cymbal (slam, section starts, turbo) |
| `revcrash.wav` | Rpeople_RevCrash2.wav | rhythmpeople | https://freesound.org/people/rhythmpeople/sounds/165154/ | CC0 1.0 | Reverse-cymbal swells into the slam and turbo |
| `kick909.wav` | Classic_TR_909_KICK_JdXi | GRD-music- | https://freesound.org/people/GRD-music-/sounds/414970/ | CC0 1.0 | Kick |
| `hat909_c2.wav` | Classic_TR_909_HatClosed_JdXi_2 | GRD-music- | https://freesound.org/people/GRD-music-/sounds/414966/ | CC0 1.0 | Closed hi-hat |
| `hat909_o4.wav` | Classic_TR_909_HatOpen_JdXi_4 | GRD-music- | https://freesound.org/people/GRD-music-/sounds/414964/ | CC0 1.0 | Open hi-hat |
| `dx_snare3.wav` | DXSnare_03 | oceansonmars | https://freesound.org/people/oceansonmars/sounds/709715/ | CC0 1.0 | Snare fills and rolls |
| `clap808.wav` | FD808A Clap.wav | Uberproduktion | https://freesound.org/people/Uberproduktion/sounds/455632/ | CC0 1.0 | Clap (acceleration layer) |
| `sim_tom1.wav` | stom1b2.WAV | yaplasut1843 | https://freesound.org/people/yaplasut1843/sounds/517933/ | CC0 1.0 | Electronic toms (fills; pitched by resampling) |

Instrument and brand names in the original titles are the uploaders' descriptions. They are reproduced only for provenance, and no brand appears in the experience.

Both fonts are bundled unmodified and are loaded explicitly with `@font-face` and `font-display: block`. Glyph coverage of all on-screen text was verified with fontTools.

## Development tools (not shipped, not needed to run the site)

| Tool | Licence | Use |
|---|---|---|
| Playwright / playwright-core | Apache-2.0 | Drives Google Chrome and Playwright's WebKit for stills, input/audio tests and benchmarks |
| esbuild | MIT | `tools/build.mjs`: bundles the AudioWorklet and the single-file standalone build |
| FFmpeg (`ebur128` filter) | LGPL/GPL | Measures integrated loudness (EBU R128) and true peak of the rendered reference mixes |
| NumPy | BSD-3-Clause | Spectrum and onset analysis scripts |

## Original work created for this project

Everything below was made for this piece and none of it is traced or copied. The only recordings used are the CC0 samples listed above.

- **The “MIDNIGHT” logotype.** Custom chamfered, extended italic letterforms built as polygons on a 100-unit cap grid (`js/title.js`), then extruded with 45° bevels. No font is involved.
- **The chrome material.** A hand-authored GLSL shader: stylised horizon gradient, environment reflections, a scrolling grid reflection, light sweeps and a star glint.
- **The neon “Cruise”.** Hand-plotted cubic Bézier centre-line paths in SVG path syntax (`js/neon.js`), rendered as a luminous tube ribbon.
- **The world.** Procedural sky, stars, striped sun, perspective grid, fbm wireframe mountains, palm silhouettes and roadside light trails. The palms are drawn deterministically to a canvas at load from a seeded RNG (seed 1986).
- **The VHS finishing chain.** RGB split, chroma bleed, tracking and head-switching distortion, scanlines, seeded tape noise and grain, CRT aperture, lens flare and glint (`js/post.js`).
- **The UI.** The cassette illustration (inline SVG), the deck window, the controls and the VCR OSD styling.
- **The music and sound design.** The composition and arrangement are original. Every tonal instrument (saw bass, pads, the big slam chord, lead, arp, plucks, bells) and every sound effect is synthesised in real time by original DSP code in `js/audio/synth.js`, as is the mastering chain. The engine covers PolyBLEP oscillators, zero-delay-feedback filters, FDN and gated reverbs, chorus, ping-pong delay, a glue compressor and a look-ahead true-peak limiter. Drums and cymbals play the CC0 samples listed above through the engine's own sample player. Synthesised drum voices remain as a fallback if the samples fail to load.
- **The car.** An original, procedurally modelled 80s-style wedge coupé (`js/car.js`), designed for this piece. It is not based on any real make or model, and its plate reads “NITE 86”.
- **The invented identity.** “NITE·DECK 86” is an invented product name. No real brands, trademarks or product interfaces are reproduced.
