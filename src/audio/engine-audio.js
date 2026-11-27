/**
 * 5.0L Supercharged Cross-Plane V8 Audio Engine (`1-8-4-3-6-5-7-2`, 650–7200 RPM).
 *
 * Implements:
 * - Strict lazy initialization (`init()` / `unlock()` only on user gesture; zero eager fetches or AudioContext)
 * - Pure-JS non-linear RPM physics running even before audio unlock (`update(dt)`)
 * - Primary 48 kHz WAV sample crossfader (`idle`, `low`, `mid`, `high`, `limiter`) with
 *   equal-power band crossfades and playbackRate pitch tracking
 * - Procedural dual-bank cross-plane V8 synthesizer fallback with supercharger whine,
 *   band-limited pink combustion noise, WaveShaper grit, and clear `console.warn` diagnostics
 * - Shared post-engine RPM-scaled lowpass, parallel exterior tarmac convolver vs muffled
 *   bass-heavy cockpit mix (`setMix`), and master DynamicsCompressor
 * - Mechanical door latch and heavy cabin door thunk cues
 */

import { AUDIO_CONFIG } from '../config/config.js';
import {
  clamp,
  createCrossPlaneBankWaves,
  createPinkNoiseBuffer,
  createSoftClipCurve,
  createTarmacImpulseBuffer,
  equalPowerGains,
  loadAudioBuffer,
  playProceduralBlip,
  playProceduralBurble,
  playProceduralCrank,
  playProceduralDoorLatch,
  playProceduralDoorThunk,
  playProceduralFire,
} from './audio-utils.js';

export class EngineAudio {
  constructor(config = AUDIO_CONFIG) {
    this.config = config || AUDIO_CONFIG;

    // Pure-JS simulation state (runs regardless of Web Audio unlock)
    this._rpm = 0;
    this._targetRPM = 0;
    this._throttle = 0;
    this._prevThrottle = 0;
    this._mix = 0;
    this._isRunning = false;
    this._isUnlocked = false;
    this._isCranking = false;
    this._isLimiting = false;
    this._mode = 'uninitialized';

    // Physics timers & latches
    this._crankElapsed = 0;
    this._fireTriggered = false;
    this._stumbleArmed = false;
    this._stumbleTimer = 0;
    this._limiterEngaged = false;
    this._fuelCutTimer = 0;
    this._burbleTimer = 0;
    this._blipCooldown = 0;
    this._simTime = 0;

    // Listeners & Web Audio handles
    this._listeners = new Set();
    this._ctx = null;
    this._initPromise = null;
    this._isDisposed = false;
    this._activeBands = [];
    this._oneShotBuffers = {
      crank: null,
      fire: null,
      burble: null,
      blip: null,
      doorLatch: null,
      doorThunk: null,
    };
    this._nodes = null;
    this._persistentSources = [];
  }

  /**
   * Lazily creates/resumes AudioContext, probes `/assets/audio/*.wav` with SPA HTML-trap
   * guard, and builds either the sample crossfade graph or procedural cross-plane V8 synth.
   * Safe and idempotent across concurrent or repeated calls.
   *
   * @param {{ audioContext?: BaseAudioContext }} [options]
   * @returns {Promise<ReturnType<EngineAudio['getState']>>}
   */
  async init(options = {}) {
    if (this._isUnlocked && this._ctx && !this._isDisposed) {
      if (typeof this._ctx.resume === 'function' && this._ctx.state === 'suspended') {
        try {
          await this._ctx.resume();
        } catch {
          // Ignore resume errors on OfflineAudioContext or restricted contexts
        }
      }
      return this.getState();
    }

    if (this._initPromise) {
      return this._initPromise;
    }

    this._isDisposed = false;

    this._initPromise = (async () => {
      try {
        let ctx = options?.audioContext || null;
        if (!ctx) {
          const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;
          if (!AudioCtx) {
            console.warn('[EngineAudio] Web Audio API is unavailable in this environment.');
            return this.getState();
          }
          ctx = new AudioCtx({ latencyHint: 'interactive' });
        }

        this._ctx = ctx;

        const isOffline =
          typeof globalThis.OfflineAudioContext !== 'undefined' &&
          ctx instanceof globalThis.OfflineAudioContext;

        if (!isOffline && typeof ctx.resume === 'function' && ctx.state === 'suspended') {
          try {
            await ctx.resume();
          } catch {
            // Keep going; contextState will reflect actual state
          }
        }

        const assetBase = this.config.assetBase || '/assets/audio/';
        const bandDefs = Array.isArray(this.config.bands) ? this.config.bands : [];
        const oneShotDefs = this.config.oneShots || {};

        const [bandResults, oneShotResults] = await Promise.all([
          Promise.all(
            bandDefs.map(async (band) => ({
              ...band,
              buffer: await loadAudioBuffer(ctx, `${assetBase}${band.file}`),
            }))
          ),
          Promise.all(
            Object.entries(oneShotDefs).map(async ([key, file]) => [
              key,
              await loadAudioBuffer(ctx, `${assetBase}${file}`),
            ])
          ),
        ]);

        if (this._isDisposed) {
          return this.getState();
        }

        for (const [key, buffer] of oneShotResults) {
          this._oneShotBuffers[key] = buffer;
        }

        this._buildSharedGraph(ctx);

        const loadedBands = bandResults
          .filter((b) => b.buffer !== null)
          .sort((a, b) => a.baseRPM - b.baseRPM);

        if (loadedBands.length > 0) {
          if (loadedBands.length < bandDefs.length) {
            const missing = bandResults
              .filter((b) => b.buffer === null)
              .map((b) => b.file)
              .join(', ');
            console.warn(
              `[EngineAudio] Missing engine loop WAV(s) (${missing}); crossfading across ${loadedBands.length} loaded band(s).`
            );
          }
          this._buildSamplePath(ctx, loadedBands);
          this._mode = 'samples';
        } else {
          console.warn(
            `[EngineAudio] Audio WAV assets unavailable under ${assetBase}; activating procedural cross-plane V8 synthesizer.`
          );
          this._buildProceduralPath(ctx);
          this._mode = 'procedural';
        }

        this._isUnlocked = true;
        this._syncAudioGraph(true);

        return this.getState();
      } catch (err) {
        console.warn('[EngineAudio] Audio initialization fallback error:', err?.message || err);
        this._initPromise = null;
        return this.getState();
      }
    })();

    return this._initPromise;
  }

  /**
   * Alias for `init()` matching UI unlock naming.
   */
  async unlock(options = {}) {
    return this.init(options);
  }

  _buildSharedGraph(ctx) {
    const pinkNoiseBuffer = createPinkNoiseBuffer(ctx, 2);
    const impulseBuffer = createTarmacImpulseBuffer(ctx, 0.85);

    const engineBus = ctx.createGain();
    engineBus.gain.value = 1.0;

    const lopeGain = ctx.createGain();
    lopeGain.gain.value = 1.0;

    const engineRunGain = ctx.createGain();
    engineRunGain.gain.value = this._isRunning ? 1.0 : 0.0;

    const rpmLowpass = ctx.createBiquadFilter();
    rpmLowpass.type = 'lowpass';
    rpmLowpass.Q.value = 0.85;
    rpmLowpass.frequency.value = 600;

    // Exterior path: wide lowpass + tarmac/mist convolver reverb
    const extLPF = ctx.createBiquadFilter();
    extLPF.type = 'lowpass';
    extLPF.Q.value = 0.7;
    extLPF.frequency.value = 3200;

    const extDryGain = ctx.createGain();
    extDryGain.gain.value = 0.78;

    const extWetGain = ctx.createGain();
    extWetGain.gain.value = 0.28;

    const convolver = ctx.createConvolver();
    convolver.buffer = impulseBuffer;

    const [initExt, initCockpit] = equalPowerGains(this._mix);

    const extMixGain = ctx.createGain();
    extMixGain.gain.value = initExt;

    // Cockpit path: muffled cabin lowpass + warm 95 Hz bass shelf
    const cockpitLPF = ctx.createBiquadFilter();
    cockpitLPF.type = 'lowpass';
    cockpitLPF.Q.value = 0.7;
    cockpitLPF.frequency.value = 440;

    const cockpitShelf = ctx.createBiquadFilter();
    cockpitShelf.type = 'lowshelf';
    cockpitShelf.frequency.value = 95;
    cockpitShelf.gain.value = 5.0;

    const cockpitMixGain = ctx.createGain();
    cockpitMixGain.gain.value = initCockpit;

    // Master bus
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.85;

    // Shared supercharger whine overlay
    const scOsc1 = ctx.createOscillator();
    scOsc1.type = 'triangle';
    scOsc1.frequency.value = 950;

    const scOsc2 = ctx.createOscillator();
    scOsc2.type = 'triangle';
    scOsc2.frequency.value = 950 * 1.007;

    const scFilter = ctx.createBiquadFilter();
    scFilter.type = 'bandpass';
    scFilter.Q.value = 6.5;
    scFilter.frequency.value = 950;

    const scGain = ctx.createGain();
    scGain.gain.value = 0.0;

    scOsc1.connect(scFilter);
    scOsc2.connect(scFilter);
    scFilter.connect(scGain);
    scGain.connect(engineBus);

    scOsc1.start(ctx.currentTime);
    scOsc2.start(ctx.currentTime);
    this._persistentSources.push(scOsc1, scOsc2);

    // Routing topology
    engineBus.connect(lopeGain);
    lopeGain.connect(engineRunGain);
    engineRunGain.connect(rpmLowpass);

    rpmLowpass.connect(extLPF);
    extLPF.connect(extDryGain);
    extDryGain.connect(extMixGain);
    extLPF.connect(convolver);
    convolver.connect(extWetGain);
    extWetGain.connect(extMixGain);
    extMixGain.connect(compressor);

    rpmLowpass.connect(cockpitLPF);
    cockpitLPF.connect(cockpitShelf);
    cockpitShelf.connect(cockpitMixGain);
    cockpitMixGain.connect(compressor);

    compressor.connect(masterGain);
    masterGain.connect(ctx.destination);

    this._nodes = {
      pinkNoiseBuffer,
      engineBus,
      lopeGain,
      engineRunGain,
      rpmLowpass,
      extLPF,
      extDryGain,
      extWetGain,
      convolver,
      extMixGain,
      cockpitLPF,
      cockpitShelf,
      cockpitMixGain,
      compressor,
      masterGain,
      scOsc1,
      scOsc2,
      scFilter,
      scGain,
      procedural: null,
    };
  }

  _buildSamplePath(ctx, loadedBands) {
    const now = ctx.currentTime;
    this._activeBands = loadedBands.map((band, index) => {
      const source = ctx.createBufferSource();
      source.buffer = band.buffer;
      source.loop = true;

      const gainNode = ctx.createGain();
      gainNode.gain.value = index === 0 ? 1 : 0;

      source.connect(gainNode);
      gainNode.connect(this._nodes.engineBus);

      const offset = band.buffer.duration > 0.2 ? (index * 0.17) % band.buffer.duration : 0;
      source.start(now, offset);
      this._persistentSources.push(source);

      return {
        key: band.key,
        baseRPM: band.baseRPM,
        source,
        gainNode,
      };
    });
  }

  _buildProceduralPath(ctx) {
    const now = ctx.currentTime;
    const { bankA, bankB } = createCrossPlaneBankWaves(ctx);

    const shaperDrive = ctx.createGain();
    shaperDrive.gain.value = 1.0;

    const waveShaper = ctx.createWaveShaper();
    waveShaper.curve = createSoftClipCurve(2.4, 2048);
    waveShaper.oversample = '2x';

    const shaperPostGain = ctx.createGain();
    shaperPostGain.gain.value = 0.55;

    shaperDrive.connect(waveShaper);
    waveShaper.connect(shaperPostGain);
    shaperPostGain.connect(this._nodes.engineBus);

    // Dual cross-plane bank oscillators
    const bankAOsc = ctx.createOscillator();
    bankAOsc.setPeriodicWave(bankA);
    bankAOsc.frequency.value = 5.4;

    const bankAGain = ctx.createGain();
    bankAGain.gain.value = 0.48;
    bankAOsc.connect(bankAGain);
    bankAGain.connect(shaperDrive);

    const bankBOsc = ctx.createOscillator();
    bankBOsc.setPeriodicWave(bankB);
    bankBOsc.frequency.value = 5.4 * 1.006;

    const bankBGain = ctx.createGain();
    bankBGain.gain.value = 0.48;
    bankBOsc.connect(bankBGain);
    bankBGain.connect(shaperDrive);

    // Firing frequency sub & harmonic stack
    const fireSubOsc = ctx.createOscillator();
    fireSubOsc.type = 'triangle';
    fireSubOsc.frequency.value = 43.3;

    const fireSubGain = ctx.createGain();
    fireSubGain.gain.value = 0.42;
    fireSubOsc.connect(fireSubGain);
    fireSubGain.connect(shaperDrive);

    const fireHarm2Osc = ctx.createOscillator();
    fireHarm2Osc.type = 'sawtooth';
    fireHarm2Osc.frequency.value = 86.6;

    const fireHarm2Gain = ctx.createGain();
    fireHarm2Gain.gain.value = 0.12;
    fireHarm2Osc.connect(fireHarm2Gain);
    fireHarm2Gain.connect(shaperDrive);

    const fireHarm3Osc = ctx.createOscillator();
    fireHarm3Osc.type = 'triangle';
    fireHarm3Osc.frequency.value = 130;

    const fireHarm3Gain = ctx.createGain();
    fireHarm3Gain.gain.value = 0.06;
    fireHarm3Osc.connect(fireHarm3Gain);
    fireHarm3Gain.connect(shaperDrive);

    // Band-limited pink combustion noise
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = this._nodes.pinkNoiseBuffer;
    noiseSource.loop = true;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.Q.value = 1.8;
    noiseFilter.frequency.value = 260;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.1;

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(shaperDrive);

    bankAOsc.start(now);
    bankBOsc.start(now);
    fireSubOsc.start(now);
    fireHarm2Osc.start(now);
    fireHarm3Osc.start(now);
    noiseSource.start(now);

    this._persistentSources.push(
      bankAOsc,
      bankBOsc,
      fireSubOsc,
      fireHarm2Osc,
      fireHarm3Osc,
      noiseSource
    );

    this._nodes.procedural = {
      shaperDrive,
      waveShaper,
      shaperPostGain,
      bankAOsc,
      bankAGain,
      bankBOsc,
      bankBGain,
      fireSubOsc,
      fireSubGain,
      fireHarm2Osc,
      fireHarm2Gain,
      fireHarm3Osc,
      fireHarm3Gain,
      noiseSource,
      noiseFilter,
      noiseGain,
    };
  }

  /**
   * Starts the engine (crank -> fire flare -> 650 rpm idle). Idempotent when already running.
   */
  start() {
    if (this._isRunning) return;
    this._isRunning = true;
    this._isCranking = true;
    this._crankElapsed = 0;
    this._fireTriggered = false;
    this._limiterEngaged = false;
    this._fuelCutTimer = 0;

    if (this._canPlayAudio()) {
      this._playOneShot('crank');
      this._syncAudioGraph(false);
    }
  }

  /**
   * Stops the engine cleanly without calling .stop() on persistent oscillator/loop nodes.
   */
  stop() {
    this._isRunning = false;
    this._isCranking = false;
    this._throttle = 0;
    this._prevThrottle = 0;
    this._isLimiting = false;
    this._limiterEngaged = false;
    this._fuelCutTimer = 0;
    this._stumbleArmed = false;
    this._stumbleTimer = 0;
    this._targetRPM = 0;

    if (this._nodes && this._ctx) {
      const now = this._ctx.currentTime;
      this._nodes.engineRunGain.gain.setTargetAtTime(0, now, 0.045);
    }
  }

  /**
   * Sets normalized throttle input in [0, 1].
   */
  setThrottle(val) {
    const next = clamp(Number(val), 0, 1);
    const prev = this._throttle;
    this._prevThrottle = prev;
    this._throttle = next;

    // Arm tip-in stumble when snapping throttle up below the 1500 rpm stumble band
    if (prev < 0.08 && next > 0.35 && this._rpm < this.config.tipInStumbleRPM + 50) {
      this._stumbleArmed = true;
      if (this._isRunning && !this._isCranking && this._blipCooldown <= 0 && this._canPlayAudio()) {
        this._blipCooldown = 0.25;
        this._playOneShot('blip');
      }
    }

    if (next < 0.08) {
      this._stumbleArmed = false;
      this._stumbleTimer = 0;
      this._limiterEngaged = false;
    }
  }

  /**
   * Sets exterior (0) vs muffled cockpit (1) mix crossfade.
   */
  setMix(cockpit) {
    this._mix = clamp(Number(cockpit), 0, 1);
    if (this._nodes && this._ctx) {
      const now = this._ctx.currentTime;
      const [extG, cockG] = equalPowerGains(this._mix);
      this._nodes.extMixGain.gain.setTargetAtTime(extG, now, 0.06);
      this._nodes.cockpitMixGain.gain.setTargetAtTime(cockG, now, 0.06);
    }
  }

  /**
   * Plays a mechanical door latch click/ping (no-op before audio unlock).
   */
  triggerDoorLatch(isOpening = true) {
    if (!this._canPlayAudio()) return;
    const buf = this._oneShotBuffers.doorLatch;
    if (buf) {
      this._playBuffer(buf, this._nodes.compressor, 0.72, isOpening ? 1.0 : 1.06);
    } else {
      playProceduralDoorLatch(
        this._ctx,
        this._nodes.compressor,
        Boolean(isOpening),
        this._nodes.pinkNoiseBuffer
      );
    }
  }

  /**
   * Plays a heavy damped cabin door-close thunk (no-op before audio unlock).
   */
  triggerDoorThunk() {
    if (!this._canPlayAudio()) return;
    const buf = this._oneShotBuffers.doorThunk;
    if (buf) {
      this._playBuffer(buf, this._nodes.compressor, 0.85, 1.0);
    } else {
      playProceduralDoorThunk(this._ctx, this._nodes.compressor, this._nodes.pinkNoiseBuffer);
    }
  }

  /**
   * Unified door cue dispatcher supporting string cues ('latch', 'thunk') or boolean opening flag.
   */
  playDoorCue(type = 'latch', isOpening = true) {
    if (type === 'thunk' || type === 'close-thunk') {
      this.triggerDoorThunk();
      return;
    }
    this.triggerDoorLatch(typeof type === 'boolean' ? type : isOpening);
  }

  /**
   * Registers an RPM callback. Returns an unsubscribe function.
   * Callback receives `(rpm, snapshot)`.
   */
  onRPM(cb) {
    if (typeof cb !== 'function') return () => {};
    this._listeners.add(cb);
    return () => {
      this._listeners.delete(cb);
    };
  }

  /**
   * Advances pure-JS RPM physics and updates Web Audio graph parameters.
   */
  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const stepDt = Math.min(0.05, dt);
    this._simTime += stepDt;

    if (this._blipCooldown > 0) {
      this._blipCooldown = Math.max(0, this._blipCooldown - stepDt);
    }

    if (!this._isRunning) {
      this._isCranking = false;
      this._isLimiting = false;
      this._targetRPM = 0;
      this._rpm += (0 - this._rpm) * 3.0 * stepDt;
      if (this._rpm < 4) this._rpm = 0;
    } else if (this._isCranking) {
      this._crankElapsed += stepDt;

      // Allow immediate throttle override out of crank phase
      if (this._throttle > 0.25) {
        this._crankElapsed = 0.65;
      }

      if (this._crankElapsed < 0.45) {
        const osc = 45 * Math.sin(this._crankElapsed * Math.PI * 2 * 5.5);
        this._targetRPM = 285 + osc;
        this._rpm += (this._targetRPM - this._rpm) * 6.0 * stepDt;
      } else {
        this._isCranking = false;
        if (!this._fireTriggered) {
          this._fireTriggered = true;
          if (this._canPlayAudio()) {
            this._playOneShot('fire');
          }
        }
        this._targetRPM = 1350;
        this._rpm += (this._targetRPM - this._rpm) * 7.5 * stepDt;
      }
    } else if (this._crankElapsed < 0.65 && this._throttle <= 0.25) {
      // Short ignition bark flare (~200ms)
      this._crankElapsed += stepDt;
      this._targetRPM = 1350;
      this._rpm += (this._targetRPM - this._rpm) * 7.5 * stepDt;
    } else {
      // Advance crankElapsed out of startup flare window
      if (this._crankElapsed < 2.0) {
        this._crankElapsed += stepDt;
      }

      const prevRpm = this._rpm;

      // Trigger armed tip-in stumble as RPM crosses into ~1500 rpm band
      if (this._stumbleArmed && this._rpm >= 1400 && this._throttle > 0.35) {
        this._stumbleArmed = false;
        this._stumbleTimer = 0.06;
      }

      // Trigger 80ms fuel-cut limiter bounce at 7180+ rpm
      if (
        this._rpm >= this.config.limiterMaxRPM - 20 &&
        this._throttle > 0.65 &&
        this._fuelCutTimer <= 0
      ) {
        this._limiterEngaged = true;
        this._fuelCutTimer = (this.config.limiterCutMs || 80) / 1000;
        if (this._canPlayAudio()) {
          this._playOneShot('burble', 0.9);
        }
      }

      if (this._fuelCutTimer > 0) {
        const cutDt = Math.min(stepDt, this._fuelCutTimer);
        this._fuelCutTimer = Math.max(0, this._fuelCutTimer - stepDt);
        this._rpm += (0 - this._rpm) * 0.44 * cutDt;
        this._rpm = Math.max(this.config.limiterMinRPM, this._rpm);
        this._targetRPM = this.config.limiterMinRPM;
        this._isLimiting = true;
      } else {
        const maxTarget = this._limiterEngaged ? 7450 : 7215;
        let effTarget =
          this.config.idleRPM + this._throttle * (maxTarget - this.config.idleRPM);

        // Slow +-40 rpm idle hunt when near idle
        if (this._throttle < 0.05 && this._rpm < 950) {
          const hunt =
            (0.6 * Math.sin(this._simTime * 2.8) + 0.4 * Math.sin(this._simTime * 7.1)) *
            this.config.huntRPM;
          effTarget = this.config.idleRPM + hunt;
        }

        let k;
        if (this._stumbleTimer > 0) {
          this._stumbleTimer = Math.max(0, this._stumbleTimer - stepDt);
          effTarget = Math.max(this.config.idleRPM, this._rpm - 180);
          k = 0.55;
        } else if (effTarget > this._rpm) {
          k = this.config.riseK;
        } else if (this._crankElapsed < 1.4 && this._throttle < 0.05) {
          // Post-ignition IAC flare settle so idle stabilizes within ~1.15s
          k = 4.2;
        } else {
          k =
            this._rpm < 2200
              ? this.config.fallK + 0.35 * (1 - this._rpm / 2200)
              : this.config.fallK;
        }

        this._targetRPM = effTarget;
        this._rpm = clamp(
          this._rpm + (effTarget - this._rpm) * k * stepDt,
          0,
          this.config.redlineRPM
        );

        if (this._throttle <= 0.65 || this._rpm < 6850) {
          this._isLimiting = false;
          this._limiterEngaged = false;
        } else if (this._rpm >= this.config.limiterMinRPM) {
          this._isLimiting = true;
        }
      }

      // Overrun decel burble above 3000 rpm
      const dRPM = (this._rpm - prevRpm) / stepDt;
      if (
        this._throttle < 0.12 &&
        this._rpm > this.config.decelBurbleMinRPM &&
        dRPM < -350
      ) {
        this._burbleTimer -= stepDt;
        if (this._burbleTimer <= 0) {
          if (this._canPlayAudio()) {
            this._playOneShot('burble', 0.65 + 0.35 * clamp((this._rpm - 3000) / 4200, 0, 1));
          }
          this._burbleTimer = 0.07 + Math.random() * 0.09;
        }
      } else {
        this._burbleTimer = Math.min(this._burbleTimer, 0.04);
      }
    }

    if (this._nodes && this._ctx) {
      this._syncAudioGraph(false);
    }

    if (this._listeners.size > 0) {
      const snapshot = {
        rpm: this._rpm,
        targetRPM: this._targetRPM,
        normalizedRPM: clamp(this._rpm / this.config.redlineRPM, 0, 1),
        throttle: this._throttle,
        mix: this._mix,
        isRunning: this._isRunning,
        isLimiting: this._isLimiting,
        isCranking: this._isCranking,
        mode: this._mode,
      };
      for (const cb of this._listeners) {
        try {
          cb(this._rpm, snapshot);
        } catch {
          // Isolate listener exceptions from rAF simulation
        }
      }
    }
  }

  _canPlayAudio() {
    if (!this._isUnlocked || !this._ctx || !this._nodes || this._isDisposed) return false;
    const isOffline =
      typeof globalThis.OfflineAudioContext !== 'undefined' &&
      this._ctx instanceof globalThis.OfflineAudioContext;
    return isOffline || this._ctx.state === 'running';
  }

  _syncAudioGraph(immediate = false) {
    const ctx = this._ctx;
    const nodes = this._nodes;
    if (!ctx || !nodes) return;

    const now = ctx.currentTime;
    const rpm = Math.max(0, this._rpm);
    const normRPM = clamp(rpm / this.config.redlineRPM, 0, 1);

    const setParam = (param, value, tau = 0.02) => {
      if (!Number.isFinite(value)) return;
      if (immediate) {
        param.setValueAtTime(value, now);
      } else {
        param.setTargetAtTime(value, now, tau);
      }
    };

    // Run gate & 10 Hz +-6% idle lope / fuel-cut ducking
    setParam(nodes.engineRunGain.gain, this._isRunning ? 1.0 : 0.0, 0.035);

    const idleBlend = this._isRunning && !this._isCranking ? clamp(1 - (rpm - 750) / 550, 0, 1) : 0;
    const lopeWave =
      1 +
      idleBlend *
        this.config.lopeAmp *
        Math.sin(this._simTime * Math.PI * 2 * this.config.lopeHz);
    const fuelCutMult = this._fuelCutTimer > 0 ? 0.15 : 1.0;
    setParam(nodes.lopeGain.gain, lopeWave * fuelCutMult, 0.008);

    // RPM-scaled main lowpass filter
    const mainLPFFreq = clamp(280 + normRPM * 5200 + this._throttle * 1400, 220, 11000);
    setParam(nodes.rpmLowpass.frequency, mainLPFFreq, 0.025);

    // Exterior vs cockpit mix filters and equal-power crossfade
    const [extG, cockG] = equalPowerGains(this._mix);
    setParam(nodes.extMixGain.gain, extG, 0.06);
    setParam(nodes.cockpitMixGain.gain, cockG, 0.06);
    setParam(nodes.extLPF.frequency, clamp(2200 + normRPM * 7600, 1800, 12000), 0.03);
    setParam(nodes.cockpitLPF.frequency, clamp(340 + normRPM * 480, 300, 900), 0.03);

    // Supercharger whine overlay
    const scFreq = 950 + normRPM * 3800;
    const scLevel =
      (this._mode === 'samples' ? 0.07 : 0.14) *
      (0.15 + 0.85 * this._throttle) *
      Math.pow(normRPM, 1.4);
    setParam(nodes.scOsc1.frequency, scFreq, 0.02);
    setParam(nodes.scOsc2.frequency, scFreq * 1.007, 0.02);
    setParam(nodes.scFilter.frequency, scFreq, 0.02);
    setParam(nodes.scGain.gain, this._isRunning ? scLevel : 0, 0.025);

    // Path-specific updates
    if (this._mode === 'samples' && this._activeBands.length > 0) {
      const bands = this._activeBands;
      const weights = new Array(bands.length).fill(0);

      if (bands.length === 1 || rpm <= bands[0].baseRPM) {
        weights[0] = 1;
      } else if (rpm >= bands[bands.length - 1].baseRPM) {
        weights[bands.length - 1] = 1;
      } else {
        for (let i = 0; i < bands.length - 1; i += 1) {
          const low = bands[i].baseRPM;
          const high = bands[i + 1].baseRPM;
          if (rpm >= low && rpm <= high) {
            const u = high > low ? (rpm - low) / (high - low) : 0;
            const [wA, wB] = equalPowerGains(u);
            weights[i] = wA;
            weights[i + 1] = wB;
            break;
          }
        }
      }

      const effectiveRPM = Math.max(250, rpm);
      for (let i = 0; i < bands.length; i += 1) {
        const band = bands[i];
        const rate = clamp(effectiveRPM / band.baseRPM, 0.35, 2.5);
        setParam(band.source.playbackRate, rate, 0.015);
        setParam(band.gainNode.gain, weights[i], 0.02);
      }
    } else if (this._mode === 'procedural' && nodes.procedural) {
      const p = nodes.procedural;
      const effRpm = Math.max(240, rpm);
      const fCycle = effRpm / 120;
      const fFire = (effRpm / 60) * 4;

      setParam(p.bankAOsc.frequency, fCycle, 0.015);
      setParam(p.bankBOsc.frequency, fCycle * 1.006, 0.015);
      setParam(p.fireSubOsc.frequency, fFire, 0.015);
      setParam(p.fireHarm2Osc.frequency, fFire * 2, 0.015);
      setParam(p.fireHarm3Osc.frequency, fFire * 3, 0.015);

      setParam(p.fireHarm2Gain.gain, 0.12 + this._throttle * 0.18, 0.025);
      setParam(p.fireHarm3Gain.gain, 0.06 + this._throttle * 0.14, 0.025);
      setParam(p.noiseFilter.frequency, clamp(180 + effRpm * 0.28, 160, 2600), 0.025);
      setParam(p.noiseGain.gain, 0.1 + this._throttle * 0.32, 0.025);
      setParam(p.shaperDrive.gain, 1.0 + this._throttle * 2.2, 0.025);
    }
  }

  _playOneShot(type, intensity = 0.75) {
    if (!this._canPlayAudio()) return;
    const ctx = this._ctx;
    const dest = this._nodes.engineBus;
    const buf = this._oneShotBuffers[type];

    if (buf) {
      const gain = type === 'burble' ? 0.55 * intensity : 0.78;
      const rate = type === 'burble' ? 0.92 + Math.random() * 0.16 : 1.0;
      this._playBuffer(buf, dest, gain, rate);
      return;
    }

    const noise = this._nodes.pinkNoiseBuffer;
    switch (type) {
      case 'crank':
        playProceduralCrank(ctx, dest, 0.45, noise);
        break;
      case 'fire':
        playProceduralFire(ctx, dest, noise);
        break;
      case 'burble':
        playProceduralBurble(ctx, dest, intensity, noise);
        break;
      case 'blip':
        playProceduralBlip(ctx, dest, noise);
        break;
      default:
        break;
    }
  }

  _playBuffer(buffer, dest, gainVal = 0.8, playbackRate = 1.0) {
    if (!this._ctx || !dest || !buffer) return;
    const now = this._ctx.currentTime;
    const src = this._ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.setValueAtTime(playbackRate, now);

    const g = this._ctx.createGain();
    g.gain.setValueAtTime(gainVal, now);

    src.connect(g);
    g.connect(dest);
    src.start(now);
  }

  /**
   * Returns a plain snapshot of the engine audio state matching the `__DEFENDER_APP__.getAudioState()` contract.
   */
  getState() {
    return {
      rpm: Math.round(this._rpm),
      targetRPM: Math.round(this._targetRPM),
      throttle: this._throttle,
      mix: this._mix,
      isRunning: this._isRunning,
      isUnlocked: this._isUnlocked,
      isCranking: this._isCranking,
      isLimiting: this._isLimiting,
      mode: this._mode,
      contextState: this._ctx ? this._ctx.state : 'none',
    };
  }

  /**
   * Tears down all Web Audio nodes, closes the AudioContext, and resets listeners/state.
   */
  dispose() {
    this._isDisposed = true;
    this._isRunning = false;
    this._isCranking = false;
    this._isLimiting = false;
    this._throttle = 0;
    this._prevThrottle = 0;
    this._listeners.clear();

    for (const src of this._persistentSources) {
      try {
        src.stop();
      } catch {
        // Ignore already-stopped nodes
      }
      try {
        src.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }
    this._persistentSources = [];

    if (this._nodes) {
      const disconnectSafe = (node) => {
        if (node && typeof node.disconnect === 'function') {
          try {
            node.disconnect();
          } catch {
            // Ignore
          }
        }
      };

      const n = this._nodes;
      for (const node of [
        n.engineBus,
        n.lopeGain,
        n.engineRunGain,
        n.rpmLowpass,
        n.extLPF,
        n.extDryGain,
        n.extWetGain,
        n.convolver,
        n.extMixGain,
        n.cockpitLPF,
        n.cockpitShelf,
        n.cockpitMixGain,
        n.compressor,
        n.masterGain,
        n.scFilter,
        n.scGain,
      ]) {
        disconnectSafe(node);
      }
      if (n.procedural) {
        for (const pNode of Object.values(n.procedural)) {
          disconnectSafe(pNode);
        }
      }
      this._nodes = null;
    }

    for (const band of this._activeBands) {
      try {
        band.gainNode.disconnect();
      } catch {
        // Ignore
      }
    }
    this._activeBands = [];
    this._oneShotBuffers = {
      crank: null,
      fire: null,
      burble: null,
      blip: null,
      doorLatch: null,
      doorThunk: null,
    };

    if (this._ctx && typeof this._ctx.close === 'function') {
      try {
        this._ctx.close().catch(() => {});
      } catch {
        // Ignore close errors
      }
    }

    this._ctx = null;
    this._initPromise = null;
    this._isUnlocked = false;
    this._mode = 'uninitialized';
    this._rpm = 0;
    this._targetRPM = 0;
  }
}

export const engineAudio = new EngineAudio();
export default engineAudio;
