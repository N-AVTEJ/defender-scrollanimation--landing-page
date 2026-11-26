# Asset Drop-In Checklist

All files below are **optional**. When absent, the showcase automatically falls back to a procedural Defender 110 V8, procedural studio-mist PMREM lighting, and a procedural cross-plane V8 synthesizer with `console.warn` notices.

## 3D Model (`public/assets/model/`)

- [ ] `public/assets/model/defender.glb` — Binary GLB (`+Z` forward, `+Y` up, `+X` LHD driver side, `y = 0` ground plane). Draco, KTX2/Basis, and Meshopt supported via self-hosted decoders in `public/draco/` and `public/basis/`.
- [ ] Verify GLB node hierarchy matches `NODE_MAP` in `src/scene/defender-loader.js` (`body`, `door_driver` pivoted at A-pillar hinge, `steering_wheel`, `seat`, `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`, `interior`, `exhaust`, plus optional `bonnet`, `headlights`, `taillights`).

## HDR Environment (`public/assets/hdr/`)

- [ ] `public/assets/hdr/studio_mist.hdr` — Equirectangular `.hdr` (Radiance RGBE), loaded via Three.js `HDRLoader` + `PMREMGenerator`.

## Engine & Door Audio (`public/assets/audio/`)

All WAV files should be **48 kHz PCM `.wav`** (seamless zero-crossing loops for bands; tight trimmed clips for one-shots):

- [ ] `public/assets/audio/idle_loop.wav` — ~700 RPM seamless loop
- [ ] `public/assets/audio/low_loop.wav` — ~2000 RPM seamless loop
- [ ] `public/assets/audio/mid_loop.wav` — ~3800 RPM seamless loop
- [ ] `public/assets/audio/high_loop.wav` — ~5500 RPM seamless loop
- [ ] `public/assets/audio/limiter_loop.wav` — ~7200 RPM seamless loop
- [ ] `public/assets/audio/start_crank.wav` — Starter crank one-shot
- [ ] `public/assets/audio/start_fire.wav` — V8 ignition fire-up one-shot
- [ ] `public/assets/audio/decel_burble.wav` — Overrun exhaust crackle one-shot (`>3000 RPM`)
- [ ] `public/assets/audio/blip.wav` — Throttle tip-in blip one-shot
- [ ] `public/assets/audio/door_latch.wav` — *(Optional)* Exterior door latch release cue
- [ ] `public/assets/audio/door_thunk.wav` — *(Optional)* Heavy door close thunk cue
