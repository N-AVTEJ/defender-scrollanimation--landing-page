/**
 * Audio DSP & Asset Preflight Utilities for the 5.0L Supercharged V8 Audio Engine.
 *
 * Provides Vite SPA 200-HTML fallback protection (`probeWavAsset`, `loadAudioBuffer`),
 * equal-power crossfading, soft-clipping waveshaper curve generation, stereo
 * tarmac/mist convolver impulse synthesis, seamless Paul Kellet pink noise,
 * cross-plane V8 bank PeriodicWave synthesis, and procedural one-shot cues.
 */

export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Fetches an audio asset and validates HTTP status, Content-Type (rejecting Vite's
 * 200 OK text/html SPA fallback), minimum header length, and RIFF/WAVE magic bytes
 * before any buffer reaches `AudioContext.decodeAudioData()`.
 *
 * @param {string} url
 * @param {RequestInit} [fetchOptions]
 * @returns {Promise<{ ok: boolean, buffer: ArrayBuffer | null, reason: string }>}
 */
export async function probeWavAsset(url, fetchOptions = {}) {
  try {
    const res = await fetch(url, fetchOptions);
    if (!res.ok) {
      return { ok: false, buffer: null, reason: `HTTP ${res.status}` };
    }

    const contentType = (res.headers?.get?.('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      return { ok: false, buffer: null, reason: 'SPA HTML fallback returned instead of audio' };
    }

    const buffer = await res.arrayBuffer();
    if (!buffer || buffer.byteLength < 44) {
      return {
        ok: false,
        buffer: null,
        reason: `Buffer too short (${buffer ? buffer.byteLength : 0} bytes)`,
      };
    }

    const bytes = new Uint8Array(buffer, 0, 12);
    const isRiff =
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
    const isWave =
      bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;

    if (!isRiff || !isWave) {
      return { ok: false, buffer: null, reason: 'Missing RIFF/WAVE magic header' };
    }

    return { ok: true, buffer, reason: 'ok' };
  } catch (err) {
    return {
      ok: false,
      buffer: null,
      reason: err?.message || 'Fetch error',
    };
  }
}

/**
 * Probes and decodes a WAV URL cleanly without throwing EncodingError or logging console.error.
 *
 * @param {BaseAudioContext} ctx
 * @param {string} url
 * @param {RequestInit} [fetchOptions]
 * @returns {Promise<AudioBuffer | null>}
 */
export async function loadAudioBuffer(ctx, url, fetchOptions = {}) {
  if (!ctx || typeof ctx.decodeAudioData !== 'function') return null;
  const probe = await probeWavAsset(url, fetchOptions);
  if (!probe.ok || !probe.buffer) return null;

  try {
    return await ctx.decodeAudioData(probe.buffer.slice(0));
  } catch {
    return null;
  }
}

/**
 * Computes equal-power crossfade gains [gA, gB] for t clamped to [0, 1].
 * Satisfies gA^2 + gB^2 === 1.
 *
 * @param {number} t
 * @returns {[number, number]}
 */
export function equalPowerGains(t) {
  const c = clamp(t, 0, 1);
  const angle = c * Math.PI * 0.5;
  return [Math.cos(angle), Math.sin(angle)];
}

/**
 * Generates a normalized hyperbolic-tangent soft-clipping curve for WaveShaperNode exhaust grit.
 *
 * @param {number} [drive=2.4]
 * @param {number} [samples=2048]
 * @returns {Float32Array}
 */
export function createSoftClipCurve(drive = 2.4, samples = 2048) {
  const count = Math.max(64, Math.floor(samples));
  const curve = new Float32Array(count);
  const safeDrive = Math.max(0.1, drive);
  const norm = Math.tanh(safeDrive) || 1;

  for (let i = 0; i < count; i += 1) {
    const x = (i * 2) / (count - 1) - 1;
    curve[i] = Math.tanh(x * safeDrive) / norm;
  }
  return curve;
}

/**
 * Generates a stereo tarmac & highland-mist impulse response (~0.85s) with pre-delay,
 * early ground-bounce reflections, and an exponentially decaying low-passed mist tail.
 *
 * @param {BaseAudioContext} ctx
 * @param {number} [duration=0.85]
 * @returns {AudioBuffer}
 */
export function createTarmacImpulseBuffer(ctx, duration = 0.85) {
  const sampleRate = ctx.sampleRate || 48000;
  const length = Math.max(1, Math.round(sampleRate * duration));
  const buffer = ctx.createBuffer(2, length, sampleRate);
  const preDelaySamples = Math.round(sampleRate * 0.018);

  const earlyReflections = [
    { time: 0.022, gainL: 0.62, gainR: 0.54 },
    { time: 0.038, gainL: 0.42, gainR: 0.48 },
    { time: 0.059, gainL: 0.31, gainR: 0.27 },
    { time: 0.084, gainL: 0.22, gainR: 0.24 },
  ];

  // Deterministic LCG PRNG for reproducible stereo decorrelation
  let seed = 0x51a7e109;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 0xffffffff) * 2 - 1;
  };

  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    let lpState = 0;
    const lpCoeff = 0.72;

    for (let i = preDelaySamples; i < length; i += 1) {
      const t = (i - preDelaySamples) / sampleRate;
      const decay = Math.exp(-t * 5.2);
      const raw = nextRand() * decay;
      lpState = lpState * lpCoeff + raw * (1 - lpCoeff);
      data[i] = lpState * 0.45;
    }

    for (const ref of earlyReflections) {
      const idx = Math.round((ref.time + (ch === 1 ? 0.0025 : 0)) * sampleRate);
      if (idx >= 0 && idx < length) {
        data[idx] += ch === 0 ? ref.gainL : ref.gainR;
      }
    }

    let maxAbs = 0;
    for (let i = 0; i < length; i += 1) {
      const a = Math.abs(data[i]);
      if (a > maxAbs) maxAbs = a;
    }
    if (maxAbs > 0.85) {
      const scale = 0.85 / maxAbs;
      for (let i = 0; i < length; i += 1) {
        data[i] *= scale;
      }
    }
  }

  return buffer;
}

/**
 * Generates a seamless loopable Paul Kellet pink-noise AudioBuffer.
 *
 * @param {BaseAudioContext} ctx
 * @param {number} [seconds=2]
 * @returns {AudioBuffer}
 */
export function createPinkNoiseBuffer(ctx, seconds = 2) {
  const sampleRate = ctx.sampleRate || 48000;
  const length = Math.max(1024, Math.round(sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;

  let seed = 0x13579bdf;
  const nextWhite = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 0xffffffff) * 2 - 1;
  };

  // Warm up filter state before recording into buffer
  for (let i = 0; i < 512; i += 1) {
    const w = nextWhite();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    b6 = w * 0.115926;
  }

  const xfade = Math.min(256, Math.floor(length / 8));
  const extra = new Float32Array(xfade);

  for (let i = 0; i < length + xfade; i += 1) {
    const white = nextWhite();
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;

    if (i < length) {
      data[i] = pink;
    } else {
      extra[i - length] = pink;
    }
  }

  // Seamless crossfade wrap across loop boundary
  for (let i = 0; i < xfade; i += 1) {
    const t = i / xfade;
    data[i] = data[i] * t + extra[i] * (1 - t);
  }

  let peak = 0;
  for (let i = 0; i < length; i += 1) {
    const a = Math.abs(data[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0.95) {
    const scale = 0.95 / peak;
    for (let i = 0; i < length; i += 1) {
      data[i] *= scale;
    }
  }

  return buffer;
}

/**
 * Builds dual PeriodicWaves for a 5.0L cross-plane V8 (firing order 1-8-4-3-6-5-7-2).
 * Bank A (cyls 1,3,5,7 at [0, 270, 450, 540] crank deg) and Bank B (cyls 8,4,6,2 at
 * [90, 180, 360, 630] crank deg) incorporate physical scavenging/runner weight and phase
 * asymmetries so odd and non-multiple harmonics (n = 1,2,3,5,6,7) remain active for
 * authentic cross-plane V8 burble without algebraic cancellation.
 *
 * @param {BaseAudioContext} ctx
 * @returns {{ bankA: PeriodicWave, bankB: PeriodicWave }}
 */
export function createCrossPlaneBankWaves(ctx) {
  const harmonics = 28;

  const buildBankWave = (anglesDeg, weights, phaseOffsetsDeg) => {
    const real = new Float32Array(harmonics + 1);
    const imag = new Float32Array(harmonics + 1);

    for (let n = 1; n <= harmonics; n += 1) {
      const rolloff = 1 / (1 + Math.pow(n / 10, 1.6));
      let re = 0;
      let im = 0;
      for (let k = 0; k < anglesDeg.length; k += 1) {
        // 720 crank degrees = 1 four-stroke cycle (2*PI radians)
        const theta = ((anglesDeg[k] + phaseOffsetsDeg[k]) * Math.PI) / 360;
        re += weights[k] * Math.cos(n * theta) * rolloff;
        im += weights[k] * Math.sin(n * theta) * rolloff;
      }
      real[n] = re * 0.25;
      imag[n] = im * 0.25;
    }

    return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  };

  const bankA = buildBankWave([0, 270, 450, 540], [1.0, 0.75, 1.28, 0.55], [0, 8, -5, 14]);
  const bankB = buildBankWave([90, 180, 360, 630], [0.58, 1.25, 0.92, 0.78], [12, -4, 6, -9]);

  return { bankA, bankB };
}

export const createCrossPlaneV8Wave = createCrossPlaneBankWaves;

function getOrCreateNoiseBuffer(ctx, cachedBuffer, seconds = 0.5) {
  if (cachedBuffer) return cachedBuffer;
  return createPinkNoiseBuffer(ctx, seconds);
}

/**
 * Synthesizes a two-stage mechanical door latch click/ping cue.
 */
export function playProceduralDoorLatch(ctx, dest, isOpening = true, noiseBuffer = null) {
  if (!ctx || !dest) return;
  const now = ctx.currentTime;
  const buf = getOrCreateNoiseBuffer(ctx, noiseBuffer, 0.25);

  const stages = isOpening
    ? [
        { offset: 0, freq: 1900, gain: 0.42 },
        { offset: 0.045, freq: 1350, gain: 0.34 },
      ]
    : [
        { offset: 0, freq: 1500, gain: 0.36 },
        { offset: 0.045, freq: 2100, gain: 0.45 },
      ];

  for (const stage of stages) {
    const t0 = now + stage.offset;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(stage.freq, t0);
    filter.Q.setValueAtTime(3.2, t0);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(stage.gain, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.02);

    src.connect(filter);
    filter.connect(g);
    g.connect(dest);
    src.start(t0);
    src.stop(t0 + 0.025);
  }

  // Subtle metallic striker ping
  const ping = ctx.createOscillator();
  ping.type = 'triangle';
  ping.frequency.setValueAtTime(isOpening ? 950 : 1120, now + 0.045);
  ping.frequency.exponentialRampToValueAtTime(620, now + 0.11);

  const pingGain = ctx.createGain();
  pingGain.gain.setValueAtTime(0.0001, now + 0.045);
  pingGain.gain.linearRampToValueAtTime(0.14, now + 0.048);
  pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

  ping.connect(pingGain);
  pingGain.connect(dest);
  ping.start(now + 0.045);
  ping.stop(now + 0.13);
}

/**
 * Synthesizes a heavy damped cabin door-close thunk (~65 -> 38 Hz thump + 110 Hz thud + latch).
 */
export function playProceduralDoorThunk(ctx, dest, noiseBuffer = null) {
  if (!ctx || !dest) return;
  const now = ctx.currentTime;
  const buf = getOrCreateNoiseBuffer(ctx, noiseBuffer, 0.25);

  // Damped cabin air-pressure thump
  const thumpOsc = ctx.createOscillator();
  thumpOsc.type = 'sine';
  thumpOsc.frequency.setValueAtTime(65, now);
  thumpOsc.frequency.exponentialRampToValueAtTime(38, now + 0.14);

  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(0.0001, now);
  thumpGain.gain.linearRampToValueAtTime(0.72, now + 0.006);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

  thumpOsc.connect(thumpGain);
  thumpGain.connect(dest);
  thumpOsc.start(now);
  thumpOsc.stop(now + 0.2);

  // Low-passed body thud
  const thudSrc = ctx.createBufferSource();
  thudSrc.buffer = buf;
  const thudLPF = ctx.createBiquadFilter();
  thudLPF.type = 'lowpass';
  thudLPF.frequency.setValueAtTime(110, now);
  thudLPF.Q.setValueAtTime(0.9, now);

  const thudGain = ctx.createGain();
  thudGain.gain.setValueAtTime(0.0001, now);
  thudGain.gain.linearRampToValueAtTime(0.55, now + 0.004);
  thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);

  thudSrc.connect(thudLPF);
  thudLPF.connect(thudGain);
  thudGain.connect(dest);
  thudSrc.start(now);
  thudSrc.stop(now + 0.09);

  // +15ms subtle latch engagement click
  const latchSrc = ctx.createBufferSource();
  latchSrc.buffer = buf;
  const latchBPF = ctx.createBiquadFilter();
  latchBPF.type = 'bandpass';
  latchBPF.frequency.setValueAtTime(1250, now + 0.015);
  latchBPF.Q.setValueAtTime(2.6, now + 0.015);

  const latchGain = ctx.createGain();
  latchGain.gain.setValueAtTime(0.0001, now + 0.015);
  latchGain.gain.linearRampToValueAtTime(0.16, now + 0.017);
  latchGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.036);

  latchSrc.connect(latchBPF);
  latchBPF.connect(latchGain);
  latchGain.connect(dest);
  latchSrc.start(now + 0.015);
  latchSrc.stop(now + 0.045);
}

/**
 * Synthesizes rhythmic starter motor cranking + compression pulses.
 */
export function playProceduralCrank(ctx, dest, duration = 0.45, noiseBuffer = null) {
  if (!ctx || !dest) return;
  const now = ctx.currentTime;
  const safeDur = clamp(duration, 0.15, 1.2);
  const buf = getOrCreateNoiseBuffer(ctx, noiseBuffer, 0.5);

  // Starter solenoid & gear whine
  const starterOsc = ctx.createOscillator();
  starterOsc.type = 'sawtooth';
  starterOsc.frequency.setValueAtTime(380, now);
  starterOsc.frequency.linearRampToValueAtTime(460, now + safeDur);

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(5.5, now);

  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(42, now);
  lfo.connect(lfoGain);
  lfoGain.connect(starterOsc.frequency);

  const starterBPF = ctx.createBiquadFilter();
  starterBPF.type = 'bandpass';
  starterBPF.frequency.setValueAtTime(480, now);
  starterBPF.Q.setValueAtTime(2.4, now);

  const starterGain = ctx.createGain();
  starterGain.gain.setValueAtTime(0.0001, now);
  starterGain.gain.linearRampToValueAtTime(0.18, now + 0.03);
  starterGain.gain.setValueAtTime(0.16, now + Math.max(0.04, safeDur - 0.05));
  starterGain.gain.exponentialRampToValueAtTime(0.0001, now + safeDur);

  starterOsc.connect(starterBPF);
  starterBPF.connect(starterGain);
  starterGain.connect(dest);
  starterOsc.start(now);
  lfo.start(now);
  starterOsc.stop(now + safeDur + 0.02);
  lfo.stop(now + safeDur + 0.02);

  // Compression chug pulses
  const pulseInterval = 0.145;
  for (let offset = 0.02; offset < safeDur - 0.03; offset += pulseInterval) {
    const t0 = now + offset;
    const chug = ctx.createBufferSource();
    chug.buffer = buf;
    const chugFilter = ctx.createBiquadFilter();
    chugFilter.type = 'bandpass';
    chugFilter.frequency.setValueAtTime(145, t0);
    chugFilter.Q.setValueAtTime(1.8, t0);

    const chugGain = ctx.createGain();
    chugGain.gain.setValueAtTime(0.0001, t0);
    chugGain.gain.linearRampToValueAtTime(0.32, t0 + 0.015);
    chugGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.095);

    chug.connect(chugFilter);
    chugFilter.connect(chugGain);
    chugGain.connect(dest);
    chug.start(t0);
    chug.stop(t0 + 0.11);
  }
}

/**
 * Synthesizes V8 ignition fire-up bark flare.
 */
export function playProceduralFire(ctx, dest, noiseBuffer = null) {
  if (!ctx || !dest) return;
  const now = ctx.currentTime;
  const buf = getOrCreateNoiseBuffer(ctx, noiseBuffer, 0.5);

  const osc1 = ctx.createOscillator();
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(150, now);
  osc1.frequency.exponentialRampToValueAtTime(58, now + 0.34);

  const osc2 = ctx.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(300, now);
  osc2.frequency.exponentialRampToValueAtTime(116, now + 0.34);

  const lpf = ctx.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.setValueAtTime(1400, now);
  lpf.frequency.exponentialRampToValueAtTime(320, now + 0.36);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(0.45, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

  osc1.connect(lpf);
  osc2.connect(lpf);
  lpf.connect(g);
  g.connect(dest);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.4);
  osc2.stop(now + 0.4);

  const burst = ctx.createBufferSource();
  burst.buffer = buf;
  const burstBPF = ctx.createBiquadFilter();
  burstBPF.type = 'bandpass';
  burstBPF.frequency.setValueAtTime(540, now);
  burstBPF.frequency.exponentialRampToValueAtTime(210, now + 0.28);
  burstBPF.Q.setValueAtTime(1.5, now);

  const burstGain = ctx.createGain();
  burstGain.gain.setValueAtTime(0.0001, now);
  burstGain.gain.linearRampToValueAtTime(0.36, now + 0.015);
  burstGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

  burst.connect(burstBPF);
  burstBPF.connect(burstGain);
  burstGain.connect(dest);
  burst.start(now);
  burst.stop(now + 0.34);
}

/**
 * Synthesizes an overrun/limiter exhaust burble & crackle pop.
 */
export function playProceduralBurble(ctx, dest, intensity = 0.7, noiseBuffer = null) {
  if (!ctx || !dest) return;
  const now = ctx.currentTime;
  const level = clamp(intensity, 0.2, 1.0);
  const buf = getOrCreateNoiseBuffer(ctx, noiseBuffer, 0.25);

  const popFreq = 260 + Math.random() * 380;
  const crackle = ctx.createBufferSource();
  crackle.buffer = buf;
  const bpf = ctx.createBiquadFilter();
  bpf.type = 'bandpass';
  bpf.frequency.setValueAtTime(popFreq, now);
  bpf.Q.setValueAtTime(2.2, now);

  const crackleGain = ctx.createGain();
  crackleGain.gain.setValueAtTime(0.0001, now);
  crackleGain.gain.linearRampToValueAtTime(0.34 * level, now + 0.004);
  crackleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

  crackle.connect(bpf);
  bpf.connect(crackleGain);
  crackleGain.connect(dest);
  crackle.start(now);
  crackle.stop(now + 0.065);

  const subPop = ctx.createOscillator();
  subPop.type = 'sine';
  subPop.frequency.setValueAtTime(98, now);
  subPop.frequency.exponentialRampToValueAtTime(46, now + 0.05);

  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.0001, now);
  subGain.gain.linearRampToValueAtTime(0.28 * level, now + 0.003);
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

  subPop.connect(subGain);
  subGain.connect(dest);
  subPop.start(now);
  subPop.stop(now + 0.065);
}

/**
 * Synthesizes a crisp throttle tip-in induction snap / blip.
 */
export function playProceduralBlip(ctx, dest, noiseBuffer = null) {
  if (!ctx || !dest) return;
  const now = ctx.currentTime;
  const buf = getOrCreateNoiseBuffer(ctx, noiseBuffer, 0.25);

  const intake = ctx.createBufferSource();
  intake.buffer = buf;
  const bpf = ctx.createBiquadFilter();
  bpf.type = 'bandpass';
  bpf.frequency.setValueAtTime(320, now);
  bpf.frequency.exponentialRampToValueAtTime(860, now + 0.08);
  bpf.Q.setValueAtTime(1.9, now);

  const intakeGain = ctx.createGain();
  intakeGain.gain.setValueAtTime(0.0001, now);
  intakeGain.gain.linearRampToValueAtTime(0.25, now + 0.01);
  intakeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.095);

  intake.connect(bpf);
  bpf.connect(intakeGain);
  intakeGain.connect(dest);
  intake.start(now);
  intake.stop(now + 0.11);
}
