# E2E Verification Report — PASS

- **Run ID**: `2026-11-26T12-39-05-360Z`
- **Mode**: `smoke-mock`
- **Target URL**: `mock://ephemeral`
- **Node / Platform**: `v24.13.0` / `win32`
- **Browser**: `chrome (C:\Program Files\Google\Chrome\Application\chrome.exe)`
- **WebGL Renderer**: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`
- **Summary**: **78/78 PASS**, 0 FAIL, 0 SKIP (183830 ms)

## Tier Breakdown
| Tier | Passed | Failed | Skipped |
|---|---:|---:|---:|
| static | 3 | 0 | 0 |
| tier1 | 35 | 0 | 0 |
| tier2 | 25 | 0 | 0 |
| tier3 | 9 | 0 | 0 |
| tier4 | 6 | 0 | 0 |

## Lighthouse Audit
| Metric | Value | Threshold | Status |
|---|---|---|---|
| Performance | 0.94 | > 0.85 | PASS |
| CLS | 0.004 | <= 0.1 | PASS |
| Accessibility | 0.98 | — | INFO |
| Best Practices | 0.96 | — | INFO |

## Screenshots
| Name | Chapter | Viewport | Path | Bytes |
|---|---|---|---|---:|
| 00-hero | 01 | 1440x900 | `tests/artifacts/smoke/screenshots/00-hero.png` | 221456 |
| 01-ch01-approach | 01 | 1440x900 | `tests/artifacts/smoke/screenshots/01-ch01-approach.png` | 272005 |
| 02-ch02-door-opens | 02 | 1440x900 | `tests/artifacts/smoke/screenshots/02-ch02-door-opens.png` | 286734 |
| 03-ch03-seated | 03 | 1440x900 | `tests/artifacts/smoke/screenshots/03-ch03-seated.png` | 292667 |
| 04-ch04-engine-starts | 04 | 1440x900 | `tests/artifacts/smoke/screenshots/04-ch04-engine-starts.png` | 297204 |
| 05-ch05-get-out | 05 | 1440x900 | `tests/artifacts/smoke/screenshots/05-ch05-get-out.png` | 291820 |
| 06-ch06-rear-view | 06 | 1440x900 | `tests/artifacts/smoke/screenshots/06-ch06-rear-view.png` | 302435 |
| 07-ch06-rev-active | 06 | 1440x900 | `tests/artifacts/smoke/screenshots/07-ch06-rev-active.png` | 311281 |
| 08-mobile-hero | 01 | 375x812 | `tests/artifacts/smoke/screenshots/08-mobile-hero.png` | 93933 |
| 09-mobile-ch06 | 06 | 375x812 | `tests/artifacts/smoke/screenshots/09-mobile-ch06.png` | 116011 |

## Console & Error Audit
- **Page Errors**: 0
- **Console Errors**: 0
- **Fallback Warnings**: 186

## All Checks
| ID | Tier | Feature | Name | Status | Duration (ms) |
|---|---|---|---|---|---:|
| SMOKE-01 | static | Syntax Check | node --check passed on all 10 .mjs files | PASS | 0 |
| SMOKE-02 | static | Runner Self-Test | TestRunner accurately detects both PASS and intentional FAIL assertions | PASS | 0 |
| SMOKE-03 | static | Static Rule Engine | static-checks catches TODO, RGBELoader, Inter, and purple gradients, and passes clean fixtures | PASS | 0 |
| T1-F1-05 | 1 | #1 Preview Boot | Server serves HTTP 200, app mounts cleanly with zero errors | PASS | 2069 |
| T1-F2-04 | 1 | #2 Scroll Height | Scroll container configures 900vh height | PASS | 567 |
| T1-F3-03 | 1 | #3 Clean Fallback Boot | Booting without optional assets emits zero pageerror or console.error | PASS | 1089 |
| T1-F3-04 | 1 | #3 Fallback Warnings | Console captures explicit console.warn messages for missing model/HDR fallbacks | PASS | 507 |
| T1-F3-05 | 1 | #3 Debug Flags | getSceneDebug reports isReady, isFallbackModel, isFallbackEnv | PASS | 607 |
| T1-F4-01 | 1 | #4 Non-Blank WebGL | WebGL canvas renders non-blank multi-tone pixels at Hero | PASS | 1415 |
| T1-F4-02 | 1 | #4 Headlight Ramp | Headlights ramp from dim DRL at 0.00 to full intensity by CH 01 end | PASS | 1539 |
| T1-F4-03 | 1 | #4 Driver Door Hinge | door_driver opens to <= -1.0 rad (~-65 deg) in CH 02 and closes in CH 03 | PASS | 1518 |
| T1-F4-04 | 1 | #4 Interior Light | interiorLight ramps up (>= 0.65) in CH 02 when door opens | PASS | 1539 |
| T1-F4-05 | 1 | #4 Fog Parallax | fogDensity clears between Hero (0.00) and close front-quarter (~0.18) | PASS | 1559 |
| T1-F5-01 | 1 | #5 Pixel Ratio Cap | Renderer caps pixelRatio <= 2 | PASS | 614 |
| T1-F5-02 | 1 | #5 Postprocessing Clean | Zero WebGL shader/program errors across all chapters | PASS | 3820 |
| T1-F5-03 | 1 | #5 Bonnet Rattle | CH 04 engine idle activates bonnetRattleActive under normal motion | PASS | 1076 |
| T1-F5-04 | 1 | #5 Exhaust Glow | CH 06 active rev increases exhaustGlow above CH 06 idle baseline | PASS | 3812 |
| T1-F5-05 | 1 | #5 Clean Teardown | Navigating away triggers clean teardown with zero unhandled errors | PASS | 1108 |
| T1-F6-01 | 1 | #6 Lazy Audio Gate | Zero /assets/audio/* requests prior to clicking Enable sound | PASS | 1097 |
| T1-F6-02 | 1 | #6 Audio Unlock | Clicking Enable sound resumes AudioContext and activates procedural fallback with warn | PASS | 1120 |
| T1-F6-03 | 1 | #6 CH 04 Idle | Entering CH 04 starts engine and settles around ~650 RPM idle | PASS | 1866 |
| T1-F6-04 | 1 | #6 Cockpit vs Exterior Mix | mix is cockpit-muffled in CH 03-04 and exterior in CH 05-06 | PASS | 2190 |
| T1-F6-05 | 1 | #6 Rev & Release | Holding REV IT TO 7200 RPM reaches limiter and releasing decelerates | PASS | 6639 |
| T1-F7-01 | 1 | #7 Editorial Palette | Computed styles enforce #0b0c0a bg, #e8e2d3 text, and #e0541f accent | PASS | 561 |
| T1-F7-02 | 1 | #7 Typography & Gradients | Computed fonts match editorial trio with zero Inter/Roboto/Arial or purple gradients | PASS | 585 |
| T1-F7-03 | 1 | #7 Letterbox & Grain | Letterbox bars, 1px hairline rules, and non-blocking grain overlay render | PASS | 636 |
| T1-F7-04 | 1 | #7 Mobile Zero Overflow | Mobile 375x812 viewport has zero horizontal overflow | PASS | 494 |
| T1-F7-05 | 1 | #7 Reduced-Motion CSS | prefers-reduced-motion: reduce disables custom cursor activation | PASS | 617 |
| T1-F8-01 | 1 | #8 Loading Curtain | Loading curtain renders percentage and dismisses cleanly on ready | PASS | 663 |
| T1-F8-02 | 1 | #8 Hero Reveal & Scroll Cue | DEFENDER V8 hero renders with per-character spans and Scroll cue | PASS | 632 |
| T1-F8-03 | 1 | #8 Chapter Overlay & Spec | Chapter overlay updates numeral, title, copy, and exact SPEC_LINE | PASS | 1017 |
| T1-F8-04 | 1 | #8 Progress Rail | Right-hand progress rail renders 01-06 and click-scrolls to chapter | PASS | 1265 |
| T1-F8-05 | 1 | #8 Gauge, Rev & Licensing | RPM gauge in CH 03-04, rev control in CH 06, and licensing modal work | PASS | 1823 |
| T1-F9-01 | 1 | #9 Pinned Canvas | WebGL canvas stays pinned to viewport across entire scroll range | PASS | 2557 |
| T1-F9-02 | 1 | #9 Forward Choreography | Forward scroll transitions sequentially 01->02->03->04->05->06 with changing camera | PASS | 3310 |
| T1-F9-03 | 1 | #9 Single rAF Loop | Application runs within a single unified requestAnimationFrame loop | PASS | 491 |
| T1-F9-04 | 1 | #9 GPU-Only DOM Motion | Animated HUD overlays avoid layout-thrashing top/left/width/height transitions | PASS | 523 |
| T1-F9-05 | 1 | #9 Reduced-Motion Shake | prefers-reduced-motion: reduce keeps activeShakeAmplitude at 0 | PASS | 3935 |
| T2-SCR-01 | 2 | #9 Scroll Boundaries | Extrema 0.0 and 1.0 produce finite telemetry locked to CH 01 and CH 06 | PASS | 1378 |
| T2-SCR-02 | 2 | #9 Snap Jumps | Instant snap jump 0.0 -> 1.0 -> 0.0 resets rig and HUD state cleanly | PASS | 1476 |
| T2-SCR-03 | 2 | #9 Reverse Scrub | Reverse scrub 06->01 re-opens door in CH 02, closes in CH 01, stops engine | PASS | 2199 |
| T2-SCR-04 | 2 | #9 Oscillation Stability | Rapid oscillation across CH 02 latch and CH 04 ignition completes cleanly | PASS | 4959 |
| T2-SCR-05 | 2 | #2 Transition Edges | Chapter transition edge values resolve cleanly with non-empty copy | PASS | 2869 |
| T2-REV-01 | 2 | #6 Short Tap Blip | Short 120ms tap blips RPM briefly without engaging limiter | PASS | 2087 |
| T2-REV-02 | 2 | #6 Limiter Bounce | Sustained 3200ms hold reaches 6900-7200 RPM limiter bounce | PASS | 4654 |
| T2-REV-03 | 2 | #6 Decel Physics | Releasing from limiter decelerates smoothly back toward ~650 RPM | PASS | 7395 |
| T2-REV-04 | 2 | #8 Input Parity & Abort | Pointer, touch, and Space reach >= 6850 RPM; pointercancel/blur drop throttle to 0 | PASS | 8171 |
| T2-REV-05 | 2 | #8 Spacebar Scope | Space in CH 01-05 does not rev; Space in CH 06 does not scroll page | PASS | 2403 |
| T2-AST-01 | 2 | #3 Vite HTML Trap (GLB) | 200-OK text/html response for defender.glb activates fallback model without crashing | PASS | 517 |
| T2-AST-02 | 2 | #3 Vite HTML Trap (HDR) | 200-OK text/html response for HDR activates fallback environment without crashing | PASS | 546 |
| T2-AST-03 | 2 | #3 Corrupt GLB Guard | Corrupt binary GLB falls back cleanly to procedural Defender with console.warn | PASS | 515 |
| T2-AST-04 | 2 | #6 Vite HTML Trap (Audio) | 200-OK text/html response for WAV falls back to procedural V8 synth cleanly | PASS | 991 |
| T2-AST-05 | 2 | #6 Pre-Unlock Silence | Scrolling CH 01->06 before sound unlock issues zero /assets/audio requests | PASS | 1985 |
| T2-RSP-01 | 2 | #7 Live Resize | Resizing desktop -> mobile -> desktop adapts viewport flag and keeps zero overflow | PASS | 1067 |
| T2-RSP-02 | 2 | #7 Extreme Viewports | Small mobile 320x568 and wide 1920x1080 render without horizontal overflow | PASS | 1042 |
| T2-RSP-03 | 2 | #5 High-DPR Cap | deviceScaleFactor=3 enforces pixelRatio <= 2 | PASS | 629 |
| T2-RSP-04 | 2 | #9 Live Reduced-Motion Toggle | Toggling prefers-reduced-motion mid-session zeros shake amplitude | PASS | 1371 |
| T2-RSP-05 | 2 | #8 Idempotent Sound & Modal Esc | Double-clicking Enable sound and closing licensing modal with Escape leave clean state | PASS | 1334 |
| T2-VFX-01 | 2 | #2 Desktop vs Mobile FOV | Mobile framing uses adapted FOV compared to desktop in CH 01 and CH 06 | PASS | 2920 |
| T2-VFX-02 | 2 | #5 Exhaust Glow Range | exhaustGlow stays low in CH 01-05 and peaks in CH 06 rev | PASS | 4452 |
| T2-VFX-03 | 2 | #5 Bonnet Rattle Scope | bonnetRattleActive is false in CH 01-03 and under reducedMotion | PASS | 1921 |
| T2-VFX-04 | 2 | #5 Shake Amplitude Bounds | activeShakeAmplitude is 0 in CH 01-03 and > 0 during CH 06 active rev | PASS | 3835 |
| T2-VFX-05 | 2 | #4 Door Angle Bounds | doorAngle remains cleanly clamped within [-1.25, 0.05] rad across all chapters | PASS | 4239 |
| T3-CMB-01 | 3 | #6+#9 Scroll + Audio Mix | Audio unlock at Hero + CH 03-04 cockpit mix + CH 05-06 exterior mix + reverse | PASS | 2152 |
| T3-CMB-02 | 3 | #5+#6+#8 CH06 Rev Telemetry + HUD + VFX | CH 06 rev simultaneously drives RPM readout, SVG arc offset, exhaustGlow, and camera shake | PASS | 4301 |
| T3-CMB-03 | 3 | #7+#8+#9 Mobile + Touch Rev + FOV | Mobile 375x812 touch scroll + adapted FOV + touch rev + zero overflow | PASS | 5034 |
| T3-CMB-04 | 3 | #5+#7+#9 Reduced Motion Full Flow | Reduced-motion full scroll + CH 04 idle + CH 06 rev without shake/rattle | PASS | 4615 |
| T3-CMB-05 | 3 | #8+#9 Rail Click-to-Scroll Sync | Progress rail clicks sync Lenis, ScrollTrigger, 3D rig, and HUD | PASS | 2764 |
| T3-CMB-06 | 3 | #4+#6+#9 Ignition + Reverse Stop | CH 04 ignition engages idle & gauge; reversing to CH 02 stops engine & opens door | PASS | 2228 |
| T3-CMB-07 | 3 | #4+#9 Door Open + Light + Reverse Close | CH 02 door opens with interior light; reverse scroll to CH 01 closes door | PASS | 1352 |
| T3-CMB-08 | 3 | #3+#4+#5 Fallback Full Scroll + Teardown | Fallback Defender + studio mist survive full forward/reverse scroll and clean close | PASS | 1574 |
| T3-CMB-09 | 3 | #6+#8 Late Audio Unlock + Space Rev + Modal | Silent scroll to CH 06 -> late sound unlock -> Space rev -> licensing modal | PASS | 4523 |
| T4-SCN-01 | 4 | #10 Full Desktop Journey | Complete desktop visitor journey CH 01->06->rev->modal->reverse CH 01 | PASS | 9478 |
| T4-SCN-02 | 4 | #11 Rubric Screenshot Suite | Capture 10 deterministic PNG screenshots across Hero, CH 01-06, active rev, and mobile | PASS | 11050 |
| T4-SCN-03 | 4 | #6 Silent Explorer | Silent visitor scrolls CH 01->06 with 0 audio requests, unlocks at CH 06, Space revs | PASS | 4341 |
| T4-SCN-04 | 4 | #7+#8 Mobile Visitor Journey | Mobile 390x844 visitor unlocks sound, navigates CH 01->06, touch-revs without overflow | PASS | 4120 |
| T4-SCN-05 | 4 | #7+#8 Keyboard Accessibility | Reduced-motion keyboard-only journey across rail, sound, modal, and Space rev | PASS | 4106 |
| T4-SCN-06 | 4 | Lighthouse Mock | Lighthouse threshold & report serialization verified | PASS | 0 |
