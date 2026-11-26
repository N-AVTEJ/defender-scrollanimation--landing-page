# Land Rover Defender V8 — Architecture & Choreography Plan

## 1. Architecture Summary

- **Stack**:
  - **Bundler**: Vite `8.x` (Rolldown bundler with `codeSplitting.groups` separating `three` and `motion` (`gsap` + `lenis`) chunks).
  - **3D Engine**: Three.js `0.187.0` (`GLTFLoader` + self-hosted `DRACOLoader`, `KTX2Loader` + Basis transcoder, `MeshoptDecoder`, `HDRLoader` + `PMREMGenerator` — note `HDRLoader` replaces `RGBELoader` in Three.js r180+).
  - **Motion & Scroll**: GSAP `3.15.x` + `ScrollTrigger` (`scrub: 1.2`, `normalizeScroll: false`) synced with Lenis `1.3.x` (`autoRaf: false`) across a `900vh` pinned scroll stage.
  - **Audio**: Lazy-loaded Web Audio API engine (`src/audio/engine-audio.js`) modeling a 5.0L supercharged cross-plane V8 (`1-8-4-3-6-5-7-2`, `650` rpm idle, `7200` rpm redline) with 48 kHz WAV sample crossfading and procedural dual-bank cross-plane V8 synth fallback.
  - **Typography**: Self-hosted `@fontsource/big-shoulders-display`, `@fontsource/instrument-serif`, and `@fontsource/ibm-plex-mono` (zero external CDN requests).
- **Execution Loop**: Single unified `gsap.ticker` `requestAnimationFrame` loop driving `lenis.raf`, `engineAudio.update`, `sceneManager.update`, DOM HUD synchronization (`transform`/`opacity`-only animations), and `composer.render`, with `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))` and full geometry/texture/audio disposal on teardown.
- **Zero-Asset Graceful Fallbacks**: When `/assets/model/defender.glb`, `/assets/hdr/*.hdr`, or `/assets/audio/*.wav` are absent, the app emits clear `console.warn` diagnostics and renders a canonical articulated procedural Defender 110 V8, a procedural studio-mist PMREM environment, and a procedural cross-plane V8 synthesizer.

---

## 2. Canonical Defender 110 V8 Coordinate Specification

All procedural geometry, GLTF normalization, and camera keyframes share a single right-handed Y-up meter frame:

- **Ground Plane**: `y = 0.00`
- **Vehicle Center**: `(0.00, 0.00, 0.00)`
- **Dimensions**: Length `4.76 m` (`z = -2.38` rear bumper/spare to `z = +2.38` front bumper), Width `2.00 m` (`x = -1.00` passenger to `x = +1.00` LHD driver), Height `1.96 m`
- **Wheel Centers (Radius `0.41 m`, Tire Width `0.24 m`)**:
  - `wheel_fl`: `[+0.88, 0.41, +1.48]` | `wheel_fr`: `[-0.88, 0.41, +1.48]`
  - `wheel_rl`: `[+0.88, 0.41, -1.48]` | `wheel_rr`: `[-0.88, 0.41, -1.48]`
- **Driver Door (`door_driver`) Hinge**:
  - **Hinge Pivot**: `[+0.96, 0.90, +0.62]` (A-pillar midpoint, door length `1.02 m` extending to B-pillar `z = -0.40`)
  - **Kinematics**: `doorAngle = 0` (`0°`) closed; `doorAngle = -1.134464 rad` (`-65°`) full open (`door_driver.rotation.y`), swinging rear tip to `(+1.884, 0.90, +0.189)` for unobstructed camera passage at `z = +0.02`.
- **Driver Seat, Steering Wheel & POV**:
  - **Driver Eye POV**: `[+0.42, 1.36, +0.05]` (desktop) / `[+0.42, 1.36, -0.05]` (mobile), looking toward `[+0.42, 1.08, +1.80]`
  - **Steering Wheel (`steering_wheel`)**: `[+0.42, 1.08, +0.56]`, tilted `-22°` (`-0.384 rad` around X)
  - **Driver Seat (`seat`)**: Cushion center `[+0.42, 0.62, -0.18]`, backrest plane at `z = -0.26`
- **Twin-Tip Quad Exhausts (`exhaust`)**:
  - **Left Assembly Center**: `[-0.65, 0.30, -2.36]` (tips at `x = -0.72, -0.58`)
  - **Right Assembly Center**: `[+0.65, 0.30, -2.36]` (tips at `x = +0.58, +0.72`)

---

## 3. Complete File Tree

```text
defender-landing-page/
├── index.html
├── package.json
├── vite.config.js
├── PLAN.md
├── README.md
├── ASSET_CHECKLIST.md
├── scripts/
│   └── copy-decoders.mjs       # Copies Three.js Draco + Basis decoders to public/
├── public/
│   ├── draco/                  # Self-hosted Three.js Draco GLTF decoders
│   ├── basis/                  # Self-hosted Three.js Basis/KTX2 transcoders
│   └── assets/
│       ├── model/              # Optional drop-in: defender.glb
│       │   └── .gitkeep
│       ├── hdr/                # Optional drop-in: studio_mist.hdr (*.hdr)
│       │   └── .gitkeep
│       └── audio/              # Optional drop-in: 48kHz WAV loops + cues
│           └── .gitkeep
├── tests/                      # E2E Playwright & Lighthouse suite
└── src/
    ├── main.js                 # Boot, Fontsource imports, unified rAF loop & teardown
    ├── config/
    │   └── config.js           # Single source of truth for palette, chapters, keyframes & audio
    ├── scene/
    │   ├── asset-probe.js      # Content-Type + magic-byte preflight against Vite SPA fallback
    │   ├── defender-loader.js  # NODE_MAP GLTF/DRACO/KTX2/Meshopt loader + procedural Defender
    │   ├── scene-manager.js    # Lights, HDRLoader + PMREM, camera rig, idle vibration & rattle
    │   ├── postprocessing.js   # EffectComposer (HalfFloat, Bloom, Vignette/Grain, OutputPass)
    │   └── effects.js          # Exhaust heat-haze shader, rear dust particles & ember glow
    ├── audio/
    │   ├── engine-audio.js     # 5.0L V8 sample crossfader, RPM physics & procedural fallback
    │   └── audio-utils.js      # Convolver impulse, waveshaper grit & equal-power helpers
    ├── timeline/
    │   └── scroll-timeline.js  # Master GSAP + ScrollTrigger timeline & direction-aware cues
    └── ui/
        ├── styles/
        │   ├── tokens.css      # CSS custom properties matching PALETTE & TYPOGRAPHY
        │   ├── base.css        # Reset, letterbox layout, grain overlay, reduced-motion rules
        │   └── hud.css         # Editorial chapters, rail, RPM gauge, rev button & modal styles
        ├── loader-ui.js        # Percentage curtain & progress bar
        ├── hero-ui.js          # "DEFENDER V8" letter reveal & hairline scroll cue
        ├── chapter-overlay.js  # Asymmetric CH 01–06 titles, copy & spec line
        ├── progress-rail.js    # Right-hand 01–06 interactive chapter rail
        ├── gauge-ui.js         # Defender-styled SVG RPM gauge & speed readout
        ├── rev-control.js      # Magnetic "REV IT TO 7200 RPM" hold button + SVG arc ring
        ├── sound-control.js    # "Enable sound" unlock overlay & mute toggle
        ├── cursor.js           # Custom crosshair cursor (pointer: fine)
        └── licensing-modal.js  # Footer credits & model/audio licensing modal
```

---

## 4. Master Camera Keyframe Table (`0.000..1.000` across `900vh`)

| Ch | Progress | Beat / Ease | Desktop Pos `[x,y,z]` | Desktop LookAt `[x,y,z]` | D-FOV | Mobile Pos `[x,y,z]` / LookAt / M-FOV | Door (deg / rad) | Int. Light | Headlights | Fog | Cockpit Mix | Gauge / Rev | Cues & FX |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **01** | `0.000` | Start / Hero (`none`) | `[7.80, 2.35, 9.60]` | `[0.00, 0.95, 0.20]` | `42°` | `[9.60, 2.75, 11.80]` / `[0.00, 0.95, 0.20]` / `52°` | `0° / 0.000` | `0.00` | `0.15` | `0.055` | `0.00` | `false / false` | Hero title lockup, dense highland mist |
| **01** | `0.100` | Mid dolly (`power2.inOut`) | `[4.60, 1.65, 5.40]` | `[0.20, 1.00, 0.25]` | `38°` | `[5.75, 1.88, 6.65]` / `[0.20, 1.00, 0.25]` / `49°` | `0° / 0.000` | `0.00` | `0.55` | `0.040` | `0.00` | `false / false` | Fog parallax clears; DRLs brighten |
| **01** | `0.190` | Front-3/4 close (`power3.inOut`) | `[2.45, 1.38, 2.15]` | `[0.35, 1.05, 0.25]` | `34°` | `[3.15, 1.50, 2.75]` / `[0.35, 1.05, 0.25]` / `46°` | `0° / 0.000` | `0.00` | `1.00` | `0.028` | `0.00` | `false / false` | Full beam + DRLs on |
| **02** | `0.245` | Side orbit (`power3.inOut`) | `[2.75, 1.42, 0.20]` | `[0.45, 1.15, 0.20]` | `36°` | `[3.45, 1.52, 0.25]` / `[0.45, 1.15, 0.20]` / `48°` | `0° / 0.000` | `0.15` | `1.00` | `0.024` | `0.10` | `false / false` | `0.250` fwd/rev latch cue (`triggerDoorLatch`) |
| **02** | `0.340` | Door open (`expo.out`) | `[2.30, 1.42, -0.35]` | `[0.42, 1.22, 0.35]` | `38°` | `[2.85, 1.48, -0.45]` / `[0.42, 1.22, 0.35]` / `50°` | `-65° / -1.134` | `1.00` | `0.85` | `0.022` | `0.35` | `false / false` | Cabin dome lights seat & steering wheel |
| **03** | `0.420` | Doorway glide (`power3.inOut`) | `[1.05, 1.38, 0.02]` | `[0.42, 1.20, 1.10]` | `44°` | `[1.15, 1.38, 0.00]` / `[0.42, 1.20, 1.10]` / `54°` | `-65° / -1.134` | `1.00` | `0.85` | `0.020` | `0.70` | `false / false` | Unobstructed pass behind open door (`z=+0.02`) |
| **03** | `0.455` | Inside cabin (`power2.inOut`) | `[0.55, 1.36, 0.04]` | `[0.42, 1.12, 1.55]` | `49°` | `[0.55, 1.36, -0.03]` / `[0.42, 1.19, 1.55]` / `56°` | `-49° / -0.850` | `0.65` | `0.95` | `0.018` | `0.85` | `true / false` | Gauge fades in at `0` RPM; door closing behind |
| **03** | `0.510` | Seated POV (`expo.out`) | `[0.42, 1.36, 0.05]` | `[0.42, 1.08, 1.80]` | `52°` | `[0.42, 1.36, -0.05]` / `[0.42, 1.18, 1.80]` / `58°` | `0° / 0.000` | `0.30` | `1.00` | `0.018` | `0.95` | `true / false` | `0.485` door thunk (`triggerDoorThunk`); breathing sway (`0.22 Hz`) |
| **04** | `0.535` | Ignition sweep (`power2.out`) | `[0.42, 1.35, 0.08]` | `[0.42, 1.06, 1.75]` | `51°` | `[0.42, 1.35, -0.03]` / `[0.42, 1.15, 1.75]` / `56°` | `0° / 0.000` | `0.25` | `1.00` | `0.018` | `0.95` | `true / false` | `0.525` fwd `start()` + gauge sweep `0->7200->0`; `<0.515` rev `stop()` |
| **04** | `0.670` | Lumpy V8 idle (`power2.inOut`) | `[0.42, 1.355, 0.06]` | `[0.42, 1.07, 1.80]` | `51°` | `[0.42, 1.355, -0.04]` / `[0.42, 1.16, 1.80]` / `56°` | `0° / 0.000` | `0.20` | `1.00` | `0.018` | `0.95` | `true / false` | ~650 rpm idle, 2.6 Hz cam/dash vibration + bonnet rattle |
| **05** | `0.700` | Exit prep (`power2.out`) | `[0.85, 1.38, 0.02]` | `[0.38, 1.11, 0.90]` | `44°` | `[0.95, 1.40, 0.00]` / `[0.38, 1.14, 0.90]` / `52°` | `-55° / -0.960` | `0.75` | `1.00` | `0.022` | `0.75` | `false / false` | Door opens (`0.680`); gauge fades out |
| **05** | `0.735` | Step out (`power3.inOut`) | `[2.05, 1.40, -0.15]` | `[0.30, 1.10, 0.25]` | `38°` | `[2.65, 1.48, -0.20]` / `[0.30, 1.10, 0.25]` / `48°` | `-55° / -0.960` | `0.65` | `1.00` | `0.024` | `0.35` | `false / false` | Camera clears open doorway |
| **05** | `0.770` | Door shut / nose (`power2.inOut`) | `[2.60, 1.40, 2.85]` | `[0.15, 1.00, 0.40]` | `36°` | `[3.30, 1.52, 3.45]` / `[0.15, 1.00, 0.40]` / `47°` | `0° / 0.000` | `0.12` | `1.00` | `0.026` | `0.10` | `false / false` | `0.755` door thunk; clears front bumper `+2.38m` |
| **05** | `0.800` | Front nose arc (`none`) | `[-0.85, 1.39, 3.65]` | `[0.00, 0.95, 0.10]` | `36°` | `[-1.10, 1.54, 4.45]` / `[0.00, 0.95, 0.10]` / `47°` | `0° / 0.000` | `0.08` | `1.00` | `0.026` | `0.02` | `false / false` | Collision-free arc `1.27m` ahead of front grille |
| **05** | `0.830` | Flank 3/4 (`power3.inOut`) | `[-3.85, 1.38, 2.40]` | `[0.00, 0.90, -0.20]` | `35°` | `[-4.90, 1.55, 3.10]` / `[0.00, 0.90, -0.20]` / `46°` | `0° / 0.000` | `0.05` | `1.00` | `0.028` | `0.00` | `false / false` | Exterior convolver mix; idle tremor + shimmer |
| **06** | `0.905` | Rear flank arc (`power2.inOut`) | `[-3.15, 0.95, -2.45]` | `[0.00, 0.58, -1.90]` | `35°` | `[-3.95, 1.08, -3.05]` / `[0.00, 0.58, -1.90]` / `46°` | `0° / 0.000` | `0.05` | `1.00` | `0.030` | `0.00` | `false / true` | Clears `-X` rear corner; rev CTA fades in |
| **06** | `0.945` | Low exhaust (`expo.out`) | `[-1.55, 0.62, -4.35]` | `[0.00, 0.48, -2.10]` | `34°` | `[-1.85, 0.72, -5.85]` / `[0.00, 0.48, -2.10]` / `53°` | `0° / 0.000` | `0.05` | `1.00` | `0.032` | `0.00` | `false / true` | Heat haze + rear dust + interactive Rev active |
| **06** | `1.000` | Final tight lock (`power2.out`) | `[-1.45, 0.58, -4.15]` | `[0.00, 0.44, -2.20]` | `33°` | `[-1.75, 0.68, -5.65]` / `[0.00, 0.44, -2.20]` / `52°` | `0° / 0.000` | `0.05` | `1.00` | `0.032` | `0.00` | `false / true` | Hold `"REV IT TO 7200 RPM"` -> glow/haze/shake |
