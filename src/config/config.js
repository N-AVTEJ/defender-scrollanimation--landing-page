/**
 * Centralized Configuration — Land Rover Defender V8 Cinematic Showcase
 *
 * Single source of truth for design tokens, typography, scroll choreography,
 * canonical vehicle geometry coordinates, CH 01–06 camera keyframes (desktop & mobile),
 * lighting/postprocessing settings, 5.0L V8 audio physics, and asset paths.
 */

export const APP_VERSION = '1.0.0';

/**
 * Editorial expedition-luxury color palette.
 */
export const PALETTE = Object.freeze({
  bg: '#0b0c0a',
  surface: '#141512',
  elevated: '#1b1d18',
  text: '#e8e2d3',
  textMuted: '#8d8779',
  accent: '#e0541f',
  fujiWhite: '#f4f1ea',
  hairline: 'rgba(232, 226, 211, 0.16)',
});

/**
 * Self-hosted Fontsource font families.
 */
export const TYPOGRAPHY = Object.freeze({
  display: "'Big Shoulders Display', sans-serif",
  serif: "'Instrument Serif', serif",
  mono: "'IBM Plex Mono', monospace",
});

/**
 * Technical specification lockup displayed across hero and chapters.
 */
export const SPEC_LINE = '5.0L SUPERCHARGED · 525 PS · 625 Nm · 0–100 IN 5.2 S';

/**
 * Master ScrollTrigger + Lenis configuration across ~900vh total scroll travel.
 */
export const SCROLL_CONFIG = Object.freeze({
  totalHeightVh: 900,
  scrub: 1.2,
  normalizeScroll: false,
});

/**
 * Canonical Defender 110 V8 coordinate system (right-handed Y-up, meters).
 * - Ground plane: y = 0.00
 * - Vehicle center: (0, 0, 0)
 * - Longitudinal (+Z forward): -2.38m rear to +2.38m front
 * - Lateral (+X LHD driver side): -1.00m passenger to +1.00m driver
 */
export const VEHICLE_DIMENSIONS = Object.freeze({
  length: 4.76,
  width: 2.0,
  height: 1.96,
  groundY: 0.0,
  wheelRadius: 0.41,
  tireWidth: 0.24,
  doorHinge: Object.freeze([0.96, 0.9, 0.62]),
  doorLength: 1.02,
  doorMaxAngleRad: -1.134464, // -65 degrees around +Y
  driverPOV: Object.freeze({
    desktop: Object.freeze([0.42, 1.36, 0.05]),
    mobile: Object.freeze([0.42, 1.36, -0.05]),
    lookAt: Object.freeze([0.42, 1.08, 1.8]),
  }),
  steeringWheel: Object.freeze({
    pos: Object.freeze([0.42, 1.08, 0.56]),
    tiltRad: -0.384, // -22 degrees around X
  }),
  seat: Object.freeze({
    cushion: Object.freeze([0.42, 0.62, -0.18]),
    backrestZ: -0.26,
  }),
  wheels: Object.freeze({
    fl: Object.freeze([0.88, 0.41, 1.48]),
    fr: Object.freeze([-0.88, 0.41, 1.48]),
    rl: Object.freeze([0.88, 0.41, -1.48]),
    rr: Object.freeze([-0.88, 0.41, -1.48]),
  }),
  exhaust: Object.freeze({
    leftCenter: Object.freeze([-0.65, 0.3, -2.36]),
    rightCenter: Object.freeze([0.65, 0.3, -2.36]),
    tipsX: Object.freeze([-0.72, -0.58, 0.58, 0.72]),
    tipY: 0.3,
    tipZ: -2.36,
  }),
});

/**
 * Six scrub-reversible chapters spanning [0.000..1.000] normalized scroll progress.
 */
export const CHAPTERS = Object.freeze([
  Object.freeze({
    id: '01',
    key: 'approach',
    title: 'Approach',
    copy: 'Out of highland mist—monolithic poise carved in Santorini black and raw steel.',
    spec: SPEC_LINE,
    range: Object.freeze([0.0, 0.19]),
  }),
  Object.freeze({
    id: '02',
    key: 'door-opens',
    title: 'Door Opens',
    copy: 'Exposed hinge geometry swings wide with mechanical certainty into the cabin.',
    spec: SPEC_LINE,
    range: Object.freeze([0.19, 0.34]),
  }),
  Object.freeze({
    id: '03',
    key: 'seated',
    title: 'Seated',
    copy: 'Command driving position: Windsor leather, magnesium beam, zero distraction.',
    spec: SPEC_LINE,
    range: Object.freeze([0.34, 0.51]),
  }),
  Object.freeze({
    id: '04',
    key: 'engine-starts',
    title: 'Engine Starts',
    copy: 'Five-liter supercharged V8 ignites—crank, bark, and settle into a 650 rpm lope.',
    spec: SPEC_LINE,
    range: Object.freeze([0.51, 0.67]),
  }),
  Object.freeze({
    id: '05',
    key: 'get-out',
    title: 'Get Out',
    copy: 'Step back onto wet slate as eight cylinders transmit tremor through the bonnet.',
    spec: SPEC_LINE,
    range: Object.freeze([0.67, 0.83]),
  }),
  Object.freeze({
    id: '06',
    key: 'rear-rev',
    title: 'Rear View + Rev',
    copy: 'Quad tailpipes glowing in dark mist—hold throttle to unleash 7,200 rpm.',
    spec: SPEC_LINE,
    range: Object.freeze([0.83, 1.0]),
  }),
]);

/**
 * Reconciled, collision-free master camera & rig keyframes across 0.000..1.000.
 * - doorAngle is in radians (0 closed, -1.134464 = -65° open).
 * - interiorLight, headlights, and cockpitMix are normalized 0..1.
 */
export const CAMERA_KEYFRAMES = Object.freeze([
  // CH 01 — Approach (0.000 .. 0.190)
  Object.freeze({
    progress: 0.0,
    chapterId: '01',
    label: 'Hero wide mist',
    desktop: Object.freeze({
      pos: Object.freeze([7.8, 2.35, 9.6]),
      lookAt: Object.freeze([0.0, 0.95, 0.2]),
      fov: 42,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([9.6, 2.75, 11.8]),
      lookAt: Object.freeze([0.0, 0.95, 0.2]),
      fov: 52,
    }),
    doorAngle: 0.0,
    interiorLight: 0.0,
    headlights: 0.15,
    fogDensity: 0.055,
    cockpitMix: 0.0,
    gaugeVisible: false,
    revActive: false,
    ease: 'none',
  }),
  Object.freeze({
    progress: 0.1,
    chapterId: '01',
    label: 'Mid dolly approach',
    desktop: Object.freeze({
      pos: Object.freeze([4.6, 1.65, 5.4]),
      lookAt: Object.freeze([0.2, 1.0, 0.25]),
      fov: 38,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([5.75, 1.88, 6.65]),
      lookAt: Object.freeze([0.2, 1.0, 0.25]),
      fov: 49,
    }),
    doorAngle: 0.0,
    interiorLight: 0.0,
    headlights: 0.55,
    fogDensity: 0.04,
    cockpitMix: 0.0,
    gaugeVisible: false,
    revActive: false,
    ease: 'power2.inOut',
  }),
  Object.freeze({
    progress: 0.19,
    chapterId: '01',
    label: 'Front three-quarter close',
    desktop: Object.freeze({
      pos: Object.freeze([2.45, 1.38, 2.15]),
      lookAt: Object.freeze([0.35, 1.05, 0.25]),
      fov: 34,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([3.15, 1.5, 2.75]),
      lookAt: Object.freeze([0.35, 1.05, 0.25]),
      fov: 46,
    }),
    doorAngle: 0.0,
    interiorLight: 0.0,
    headlights: 1.0,
    fogDensity: 0.028,
    cockpitMix: 0.0,
    gaugeVisible: false,
    revActive: false,
    ease: 'power3.inOut',
  }),

  // CH 02 — Door Opens (0.190 .. 0.340)
  Object.freeze({
    progress: 0.245,
    chapterId: '02',
    label: 'Driver side orbit',
    desktop: Object.freeze({
      pos: Object.freeze([2.75, 1.42, 0.2]),
      lookAt: Object.freeze([0.45, 1.15, 0.2]),
      fov: 36,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([3.45, 1.52, 0.25]),
      lookAt: Object.freeze([0.45, 1.15, 0.2]),
      fov: 48,
    }),
    doorAngle: 0.0,
    interiorLight: 0.15,
    headlights: 1.0,
    fogDensity: 0.024,
    cockpitMix: 0.1,
    gaugeVisible: false,
    revActive: false,
    ease: 'power3.inOut',
  }),
  Object.freeze({
    progress: 0.34,
    chapterId: '02',
    label: 'Driver door swung open',
    desktop: Object.freeze({
      pos: Object.freeze([2.3, 1.42, -0.35]),
      lookAt: Object.freeze([0.42, 1.22, 0.35]),
      fov: 38,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([2.85, 1.48, -0.45]),
      lookAt: Object.freeze([0.42, 1.22, 0.35]),
      fov: 50,
    }),
    doorAngle: -1.134464,
    interiorLight: 1.0,
    headlights: 0.85,
    fogDensity: 0.022,
    cockpitMix: 0.35,
    gaugeVisible: false,
    revActive: false,
    ease: 'expo.out',
  }),

  // CH 03 — Seated (0.340 .. 0.510)
  Object.freeze({
    progress: 0.42,
    chapterId: '03',
    label: 'Doorway threshold glide',
    desktop: Object.freeze({
      pos: Object.freeze([1.05, 1.38, 0.02]),
      lookAt: Object.freeze([0.42, 1.2, 1.1]),
      fov: 44,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([1.15, 1.38, 0.0]),
      lookAt: Object.freeze([0.42, 1.2, 1.1]),
      fov: 54,
    }),
    doorAngle: -1.134464,
    interiorLight: 1.0,
    headlights: 0.85,
    fogDensity: 0.02,
    cockpitMix: 0.7,
    gaugeVisible: false,
    revActive: false,
    ease: 'power3.inOut',
  }),
  Object.freeze({
    progress: 0.455,
    chapterId: '03',
    label: 'Inside cabin door closing',
    desktop: Object.freeze({
      pos: Object.freeze([0.55, 1.36, 0.04]),
      lookAt: Object.freeze([0.42, 1.12, 1.55]),
      fov: 49,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([0.55, 1.36, -0.03]),
      lookAt: Object.freeze([0.42, 1.19, 1.55]),
      fov: 56,
    }),
    doorAngle: -0.85,
    interiorLight: 0.65,
    headlights: 0.95,
    fogDensity: 0.018,
    cockpitMix: 0.85,
    gaugeVisible: true,
    revActive: false,
    ease: 'power2.inOut',
  }),
  Object.freeze({
    progress: 0.51,
    chapterId: '03',
    label: 'Seated driver POV',
    desktop: Object.freeze({
      pos: Object.freeze([0.42, 1.36, 0.05]),
      lookAt: Object.freeze([0.42, 1.08, 1.8]),
      fov: 52,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([0.42, 1.36, -0.05]),
      lookAt: Object.freeze([0.42, 1.18, 1.8]),
      fov: 58,
    }),
    doorAngle: 0.0,
    interiorLight: 0.3,
    headlights: 1.0,
    fogDensity: 0.018,
    cockpitMix: 0.95,
    gaugeVisible: true,
    revActive: false,
    ease: 'expo.out',
  }),

  // CH 04 — Engine Starts (0.510 .. 0.670)
  Object.freeze({
    progress: 0.535,
    chapterId: '04',
    label: 'Ignition sweep',
    desktop: Object.freeze({
      pos: Object.freeze([0.42, 1.35, 0.08]),
      lookAt: Object.freeze([0.42, 1.06, 1.75]),
      fov: 51,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([0.42, 1.35, -0.03]),
      lookAt: Object.freeze([0.42, 1.15, 1.75]),
      fov: 56,
    }),
    doorAngle: 0.0,
    interiorLight: 0.25,
    headlights: 1.0,
    fogDensity: 0.018,
    cockpitMix: 0.95,
    gaugeVisible: true,
    revActive: false,
    ease: 'power2.out',
  }),
  Object.freeze({
    progress: 0.67,
    chapterId: '04',
    label: 'Lumpy V8 idle',
    desktop: Object.freeze({
      pos: Object.freeze([0.42, 1.355, 0.06]),
      lookAt: Object.freeze([0.42, 1.07, 1.8]),
      fov: 51,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([0.42, 1.355, -0.04]),
      lookAt: Object.freeze([0.42, 1.16, 1.8]),
      fov: 56,
    }),
    doorAngle: 0.0,
    interiorLight: 0.2,
    headlights: 1.0,
    fogDensity: 0.018,
    cockpitMix: 0.95,
    gaugeVisible: true,
    revActive: false,
    ease: 'power2.inOut',
  }),

  // CH 05 — Get Out (0.670 .. 0.830)
  Object.freeze({
    progress: 0.7,
    chapterId: '05',
    label: 'Cabin exit prep',
    desktop: Object.freeze({
      pos: Object.freeze([0.85, 1.38, 0.02]),
      lookAt: Object.freeze([0.38, 1.11, 0.9]),
      fov: 44,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([0.95, 1.4, 0.0]),
      lookAt: Object.freeze([0.38, 1.14, 0.9]),
      fov: 52,
    }),
    doorAngle: -0.96,
    interiorLight: 0.75,
    headlights: 1.0,
    fogDensity: 0.022,
    cockpitMix: 0.75,
    gaugeVisible: false,
    revActive: false,
    ease: 'power2.out',
  }),
  Object.freeze({
    progress: 0.735,
    chapterId: '05',
    label: 'Step out of doorway',
    desktop: Object.freeze({
      pos: Object.freeze([2.05, 1.4, -0.15]),
      lookAt: Object.freeze([0.3, 1.1, 0.25]),
      fov: 38,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([2.65, 1.48, -0.2]),
      lookAt: Object.freeze([0.3, 1.1, 0.25]),
      fov: 48,
    }),
    doorAngle: -0.96,
    interiorLight: 0.65,
    headlights: 1.0,
    fogDensity: 0.024,
    cockpitMix: 0.35,
    gaugeVisible: false,
    revActive: false,
    ease: 'power3.inOut',
  }),
  Object.freeze({
    progress: 0.77,
    chapterId: '05',
    label: 'Door shut front corner',
    desktop: Object.freeze({
      pos: Object.freeze([2.6, 1.4, 2.85]),
      lookAt: Object.freeze([0.15, 1.0, 0.4]),
      fov: 36,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([3.3, 1.52, 3.45]),
      lookAt: Object.freeze([0.15, 1.0, 0.4]),
      fov: 47,
    }),
    doorAngle: 0.0,
    interiorLight: 0.12,
    headlights: 1.0,
    fogDensity: 0.026,
    cockpitMix: 0.1,
    gaugeVisible: false,
    revActive: false,
    ease: 'power2.inOut',
  }),
  Object.freeze({
    progress: 0.8,
    chapterId: '05',
    label: 'Front nose clearance arc',
    desktop: Object.freeze({
      pos: Object.freeze([-0.85, 1.39, 3.65]),
      lookAt: Object.freeze([0.0, 0.95, 0.1]),
      fov: 36,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([-1.1, 1.54, 4.45]),
      lookAt: Object.freeze([0.0, 0.95, 0.1]),
      fov: 47,
    }),
    doorAngle: 0.0,
    interiorLight: 0.08,
    headlights: 1.0,
    fogDensity: 0.026,
    cockpitMix: 0.02,
    gaugeVisible: false,
    revActive: false,
    ease: 'none',
  }),
  Object.freeze({
    progress: 0.83,
    chapterId: '05',
    label: 'Passenger flank three-quarter',
    desktop: Object.freeze({
      pos: Object.freeze([-3.85, 1.38, 2.4]),
      lookAt: Object.freeze([0.0, 0.9, -0.2]),
      fov: 35,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([-4.9, 1.55, 3.1]),
      lookAt: Object.freeze([0.0, 0.9, -0.2]),
      fov: 46,
    }),
    doorAngle: 0.0,
    interiorLight: 0.05,
    headlights: 1.0,
    fogDensity: 0.028,
    cockpitMix: 0.0,
    gaugeVisible: false,
    revActive: false,
    ease: 'power3.inOut',
  }),

  // CH 06 — Rear View + Rev (0.830 .. 1.000)
  Object.freeze({
    progress: 0.905,
    chapterId: '06',
    label: 'Rear flank corner arc',
    desktop: Object.freeze({
      pos: Object.freeze([-3.15, 0.95, -2.45]),
      lookAt: Object.freeze([0.0, 0.58, -1.9]),
      fov: 35,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([-3.95, 1.08, -3.05]),
      lookAt: Object.freeze([0.0, 0.58, -1.9]),
      fov: 46,
    }),
    doorAngle: 0.0,
    interiorLight: 0.05,
    headlights: 1.0,
    fogDensity: 0.03,
    cockpitMix: 0.0,
    gaugeVisible: false,
    revActive: true,
    ease: 'power2.inOut',
  }),
  Object.freeze({
    progress: 0.945,
    chapterId: '06',
    label: 'Low twin-exhaust stance',
    desktop: Object.freeze({
      pos: Object.freeze([-1.55, 0.62, -4.35]),
      lookAt: Object.freeze([0.0, 0.48, -2.1]),
      fov: 34,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([-1.85, 0.72, -5.85]),
      lookAt: Object.freeze([0.0, 0.48, -2.1]),
      fov: 53,
    }),
    doorAngle: 0.0,
    interiorLight: 0.05,
    headlights: 1.0,
    fogDensity: 0.032,
    cockpitMix: 0.0,
    gaugeVisible: false,
    revActive: true,
    ease: 'expo.out',
  }),
  Object.freeze({
    progress: 1.0,
    chapterId: '06',
    label: 'Final exhaust rev lock',
    desktop: Object.freeze({
      pos: Object.freeze([-1.45, 0.58, -4.15]),
      lookAt: Object.freeze([0.0, 0.44, -2.2]),
      fov: 33,
    }),
    mobile: Object.freeze({
      pos: Object.freeze([-1.75, 0.68, -5.65]),
      lookAt: Object.freeze([0.0, 0.44, -2.2]),
      fov: 52,
    }),
    doorAngle: 0.0,
    interiorLight: 0.05,
    headlights: 1.0,
    fogDensity: 0.032,
    cockpitMix: 0.0,
    gaugeVisible: false,
    revActive: true,
    ease: 'power2.out',
  }),
]);

/**
 * Physically based lighting, fog, and postprocessing configuration.
 */
export const LIGHTING_CONFIG = Object.freeze({
  keyLight: Object.freeze({
    color: '#eef2f5',
    intensity: 2.6,
    pos: Object.freeze([5.5, 8.2, 6.4]),
  }),
  fillLight: Object.freeze({
    color: '#6b7785',
    intensity: 0.75,
    pos: Object.freeze([-6.0, 3.8, -3.2]),
  }),
  rimLight: Object.freeze({
    color: '#f4f1ea',
    intensity: 1.85,
    pos: Object.freeze([-2.8, 4.4, -7.2]),
  }),
  ambientLight: Object.freeze({
    color: '#232724',
    intensity: 0.45,
  }),
  shadowMapSize: 1024,
  shadowFrustum: 4.5,
  interiorDome: Object.freeze({
    color: '#ffb878',
    maxIntensity: 2.2,
    pos: Object.freeze([0.0, 1.72, 0.15]),
  }),
  headlights: Object.freeze({
    color: '#f4f1ea',
    maxIntensity: 18,
  }),
  fog: Object.freeze({
    color: '#0b0c0a',
    baseDensity: 0.055,
  }),
  postprocessing: Object.freeze({
    toneMappingExposure: 1.05,
    bloomStrength: 0.32,
    bloomRadius: 0.45,
    bloomThreshold: 0.88,
    vignetteDarkness: 0.55,
    grainIntensity: 0.035,
  }),
});

/**
 * 5.0L supercharged cross-plane V8 engine audio & physics constants (R4).
 */
export const AUDIO_CONFIG = Object.freeze({
  firingOrder: '1-8-4-3-6-5-7-2',
  idleRPM: 650,
  redlineRPM: 7200,
  limiterMinRPM: 6900,
  limiterMaxRPM: 7200,
  limiterCutMs: 80,
  riseK: 2.2,
  fallK: 1.1,
  tipInStumbleRPM: 1500,
  decelBurbleMinRPM: 3000,
  lopeHz: 10,
  lopeAmp: 0.06,
  huntRPM: 40,
  bands: Object.freeze([
    Object.freeze({ key: 'idle', file: 'idle_loop.wav', baseRPM: 700 }),
    Object.freeze({ key: 'low', file: 'low_loop.wav', baseRPM: 2000 }),
    Object.freeze({ key: 'mid', file: 'mid_loop.wav', baseRPM: 3800 }),
    Object.freeze({ key: 'high', file: 'high_loop.wav', baseRPM: 5500 }),
    Object.freeze({ key: 'limiter', file: 'limiter_loop.wav', baseRPM: 7200 }),
  ]),
  oneShots: Object.freeze({
    crank: 'start_crank.wav',
    fire: 'start_fire.wav',
    burble: 'decel_burble.wav',
    blip: 'blip.wav',
    doorLatch: 'door_latch.wav',
    doorThunk: 'door_thunk.wav',
  }),
  assetBase: '/assets/audio/',
});

/**
 * Optional drop-in and self-hosted decoder asset paths.
 */
export const ASSET_PATHS = Object.freeze({
  model: '/assets/model/defender.glb',
  hdrDir: '/assets/hdr/',
  hdrDefault: '/assets/hdr/studio_mist.hdr',
  draco: '/draco/',
  basis: '/basis/',
});
