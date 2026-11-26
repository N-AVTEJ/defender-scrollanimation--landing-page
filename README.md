# Land Rover Defender V8 — Cinematic WebGL Showcase

A scroll-driven, single-page editorial showcase for the **5.0L Supercharged Land Rover Defender 110 V8** (`525 PS · 625 Nm · 0–100 IN 5.2 S`), built with Vite, Vanilla ES Modules, Three.js, GSAP + ScrollTrigger, Lenis, Web Audio API, and self-hosted Fontsource typography.

---

## Quick Start

```bash
npm install
npm run dev
```

To build and preview the production bundle:

```bash
npm run build
npm run preview
```

### Graceful Zero-Asset Fallback Mode

The repository ships **without** binary `.glb`, `.hdr`, or `.wav` assets inside `public/assets/`. When optional assets are not present, the application never crashes:
- Missing `defender.glb` → renders a canonical, articulated procedural Defender 110 V8 (`body`, hinged `door_driver`, `steering_wheel`, `seat`, 4 `wheels`, `interior`, `bonnet`, `exhaust`, `headlights`, `taillights`) and emits a clear `console.warn`.
- Missing `.hdr` → generates a procedural studio-mist PMREM environment map and logs a warning.
- Missing `.wav` files → switches to a procedural dual-bank cross-plane V8 synthesizer (`1-8-4-3-6-5-7-2` firing order) with non-linear RPM physics, limiter bounce, idle lope, and overrun burble while logging a warning.

---

## Architecture & Three.js r180+ Notes

- **Three.js `HDRLoader` (r180+):** Three.js `0.187.0` deprecated `RGBELoader` in favor of `HDRLoader`:
  ```js
  import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
  ```
  All HDR environment loading uses `HDRLoader` paired with `THREE.PMREMGenerator`.
- **Self-Hosted Decoders:** `scripts/copy-decoders.mjs` runs automatically on `postinstall`, `prebuild`, and `dev`, copying Three.js GLTF Draco decoders into `public/draco/` and Basis/KTX2 transcoders into `public/basis/` so offline/air-gapped deployments never depend on external CDNs.
- **Self-Hosted Fonts:** `@fontsource/big-shoulders-display`, `@fontsource/instrument-serif`, and `@fontsource/ibm-plex-mono` are bundled directly by Vite with zero Google Fonts requests.
- **Vite 8 / Rolldown Chunking:** `vite.config.js` uses `build.rolldownOptions.output.codeSplitting.groups` to isolate `three` and `motion` (`gsap` + `lenis`) vendor chunks cleanly.

---

## Optional Drop-In Asset Paths

Place production assets in `public/assets/` using these exact filenames:

### 1. 3D Vehicle Model
- `public/assets/model/defender.glb` (loaded at `/assets/model/defender.glb`)
  - Binary GLB format (`+Z` forward, `+Y` up, `+X` left-hand-drive driver side, ground at `y = 0`).
  - Supports Draco compression, KTX2/Basis textures, and Meshopt compression.

### 2. HDR Environment Map
- `public/assets/hdr/studio_mist.hdr` (loaded at `/assets/hdr/studio_mist.hdr`)
  - Equirectangular `.hdr` (Radiance RGBE) environment map.

### 3. Engine & Mechanical Audio (`public/assets/audio/`)
All audio files must be **48 kHz WAV** (seamless loops for RPM bands; short trimmed clips for one-shots) and are lazy-loaded only after user interaction (`"Enable sound"`):

| Filename | Type | Purpose / Base RPM |
|---|---|---|
| `idle_loop.wav` | Seamless Loop | `~700 RPM` idle loop |
| `low_loop.wav` | Seamless Loop | `~2000 RPM` low-load pull |
| `mid_loop.wav` | Seamless Loop | `~3800 RPM` mid-range V8 growl |
| `high_loop.wav` | Seamless Loop | `~5500 RPM` upper-range supercharged scream |
| `limiter_loop.wav` | Seamless Loop | `~7200 RPM` redline / fuel-cut band |
| `start_crank.wav` | One-Shot | Starter motor crank sequence |
| `start_fire.wav` | One-Shot | Initial V8 ignition bark |
| `decel_burble.wav` | One-Shot | Overrun exhaust crackle (`>3000 RPM` decel) |
| `blip.wav` | One-Shot | Throttle tip-in / rev blip |
| `door_latch.wav` | One-Shot *(optional)* | Mechanical exterior latch release |
| `door_thunk.wav` | One-Shot *(optional)* | Heavy Defender door shut thunk |

---

## Exact `NODE_MAP` Model Node Names

`src/scene/defender-loader.js` maps GLTF scene nodes using `NODE_MAP`. If your GLB uses different names, update `NODE_MAP` at the top of `defender-loader.js` (the loader automatically logs the full GLTF scene graph when expected nodes are missing):

```js
export const NODE_MAP = {
  body: ['body', 'Body', 'defender_body', 'chassis'],
  door_driver: ['door_driver', 'Door_Driver', 'door_fl', 'Door_FL'],
  steering_wheel: ['steering_wheel', 'Steering_Wheel', 'steer'],
  seat: ['seat', 'seat_driver', 'Seat_FL'],
  wheels: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'],
  interior: ['interior', 'Interior', 'dashboard', 'cockpit'],
  exhaust: ['exhaust', 'Exhaust', 'tailpipes'],
  bonnet: ['bonnet', 'hood', 'Bonnet'],
  headlights: ['headlights', 'Headlights'],
  taillights: ['taillights', 'Taillights'],
};
```

- **Door Pivot Requirement:** `door_driver` must have its origin at the A-pillar hinge (`[+0.96, 0.90, +0.62]` in canonical scale) so rotating `rotation.y` from `0` to `-1.134 rad` (`-65°`) swings the door cleanly outward toward `+X`.

---

## Timeline, Camera & Audio Tweaking Guide

All choreography, colors, lighting, and V8 physics live in **`src/config/config.js`**:

1. **Scroll Pacing (`SCROLL_CONFIG`)**:
   - Adjust `totalHeightVh` (default `900`) to lengthen or shorten total scroll travel.
   - Adjust `scrub` (default `1.2`) to tune GSAP ScrollTrigger inertia.
2. **Chapter Boundaries (`CHAPTERS`)**:
   - Edit each chapter's `range: [start, end]` (`0.000`–`1.000`), `title`, `copy`, or `spec`. Keep ranges contiguous (`CHAPTERS[i].range[1] === CHAPTERS[i + 1].range[0]`).
3. **Camera Keyframes (`CAMERA_KEYFRAMES`)**:
   - Each keyframe specifies `progress`, `chapterId`, `desktop: { pos, lookAt, fov }`, `mobile: { pos, lookAt, fov }`, `doorAngle` (radians), `interiorLight`, `headlights`, `fogDensity`, `cockpitMix`, `gaugeVisible`, `revActive`, and `ease`.
   - Maintain monotonic `progress` values from `0.000` to `1.000` and ensure CH 05 exterior waypoints stay clear of the `[-1.0..+1.0, 0..1.96, -2.38..+2.38]` vehicle bounding volume.
4. **Engine Audio Physics (`AUDIO_CONFIG`)**:
   - Tune `idleRPM` (`650`), `redlineRPM` (`7200`), `limiterMinRPM`/`limiterMaxRPM` (`6900`–`7200`), `limiterCutMs` (`80`), `riseK` (`2.2`), `fallK` (`1.1`), `tipInStumbleRPM` (`1500`), `decelBurbleMinRPM` (`3000`), `lopeHz` (`10`), `lopeAmp` (`0.06`), and `huntRPM` (`40`).

---

## Model, Audio & Dependency Licensing Notes

- **Vehicle Trademarks & 3D Geometry:** "Land Rover" and "Defender" are trademarks of Jaguar Land Rover Limited. This project is a technical showcase; obtain appropriate rights and 3D model licenses before commercial distribution.
- **HDR Environments:** Use CC0-licensed equirectangular HDRIs (e.g., Poly Haven) or studio-authored HDR captures.
- **Audio Recordings:** Supply royalty-free or properly licensed 48 kHz WAV recordings for production deployments.
- **Open-Source Dependencies:**
  - `three` (`MIT`)
  - `lenis` (`MIT`)
  - `@fontsource/big-shoulders-display`, `@fontsource/instrument-serif`, `@fontsource/ibm-plex-mono` (`SIL OFL 1.1`)
  - `gsap` (`GreenSock Standard "No Charge" License` — verify commercial licensing if distributed inside a paid product or template)
