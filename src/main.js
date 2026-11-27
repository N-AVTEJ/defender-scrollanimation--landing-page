/**
 * Application Entrypoint — Land Rover Defender V8 Cinematic Showcase
 *
 * Orchestrates:
 * - Self-hosted @fontsource typography & editorial HUD stylesheets
 * - 3D SceneManager (Three.js + HDRLoader/PMREM + EffectComposer)
 * - 5.0L Supercharged V8 EngineAudio (lazy-loaded on user gesture)
 * - Master GSAP + ScrollTrigger + Lenis timeline across 900vh (CH 01–06)
 * - Single unified gsap.ticker rAF loop + full teardown on dispose
 */
import '@fontsource/big-shoulders-display/700';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/instrument-serif/400';
import '@fontsource/instrument-serif/400-italic';
import '@fontsource/ibm-plex-mono/400';
import '@fontsource/ibm-plex-mono/500';

import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/hud.css';

import gsap from 'gsap';
import { LoadingManager } from 'three';

import * as CONFIG from './config/config.js';
import { createSceneManager } from './scene/scene-manager.js';
import { engineAudio } from './audio/engine-audio.js';
import { createScrollTimeline } from './timeline/scroll-timeline.js';
import { createLoaderUI } from './ui/loader-ui.js';
import { createHeroUI } from './ui/hero-ui.js';
import { createChapterOverlay } from './ui/chapter-overlay.js';
import { createProgressRail } from './ui/progress-rail.js';
import { createGaugeUI } from './ui/gauge-ui.js';
import { createRevControl } from './ui/rev-control.js';
import { createSoundControl } from './ui/sound-control.js';
import { createCustomCursor } from './ui/cursor.js';
import { createLicensingModal } from './ui/licensing-modal.js';

let activeApp = null;

async function bootApp() {
  if (activeApp) return activeApp;

  const { APP_VERSION, AUDIO_CONFIG, CHAPTERS, PALETTE, SCROLL_CONFIG, TYPOGRAPHY } = CONFIG;

  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--scroll-height', `${SCROLL_CONFIG.totalHeightVh}vh`);
  rootStyle.setProperty('--bg-void', PALETTE.bg);
  rootStyle.setProperty('--text-bone', PALETTE.text);
  rootStyle.setProperty('--accent-signal', PALETTE.accent);
  rootStyle.setProperty('--hairline', PALETTE.hairline);
  rootStyle.setProperty('--font-display', TYPOGRAPHY.display);
  rootStyle.setProperty('--font-serif', TYPOGRAPHY.serif);
  rootStyle.setProperty('--font-mono', TYPOGRAPHY.mono);

  const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reducedMotion = Boolean(reducedMotionQuery?.matches);

  const loaderUI = createLoaderUI();
  loaderUI.setProgress(0.1);

  const loadingManager = new LoadingManager();
  loadingManager.onProgress = (_url, loaded, total) => {
    if (total > 0) {
      loaderUI.setProgress(0.15 + (loaded / total) * 0.8);
    }
  };

  const canvas = document.getElementById('defender-canvas');
  const sceneManager = await createSceneManager(canvas, CONFIG, loadingManager, {
    rafLoopCount: 1,
  });
  loaderUI.setProgress(0.95);

  const heroUI = createHeroUI(document.getElementById('hero-root'), { reducedMotion });
  const chapterOverlay = createChapterOverlay(document.getElementById('chapter-root'), CHAPTERS);
  const gaugeUI = createGaugeUI(document.getElementById('gauge-root'), { maxRPM: 8000 });
  const soundControl = createSoundControl(document.getElementById('sound-root'), engineAudio);
  const customCursor = createCustomCursor(document.getElementById('cursor-root'), { reducedMotion });
  const licensingModal = createLicensingModal(
    document.getElementById('footer-root'),
    document.getElementById('modal-root')
  );

  const revControl = createRevControl(document.getElementById('rev-root'), {
    redlineRPM: AUDIO_CONFIG.redlineRPM,
    idleRPM: AUDIO_CONFIG.idleRPM,
    reducedMotion,
    onThrottleChange(throttle) {
      if (throttle > 0 && !engineAudio.getState().isRunning) {
        engineAudio.start();
      }
      engineAudio.setThrottle(throttle);
    },
  });

  const timeline = createScrollTimeline({
    config: CONFIG,
    engineAudio,
    reducedMotion,
    onChapterChange(info) {
      chapterOverlay.setChapter(info.chapter);
      progressRail.setActiveChapter(info.chapter.id);
    },
    onProgress(progress, info) {
      heroUI.setVisible(progress < 0.065);
      const rig = timeline.getRigState();
      gaugeUI.setVisible(rig.gaugeVisible);
      revControl.setVisible(rig.revActive && info.chapter.id === '06');
    },
    onIgnitionStart() {
      gaugeUI.triggerSelfTest(reducedMotion);
    },
  });

  const progressRail = createProgressRail(
    document.getElementById('rail-root'),
    CHAPTERS,
    (chapterId) => timeline.scrollToChapter(chapterId)
  );

  // Sync audio RPM callback to gauge & rev UI
  const unsubscribeRpm = engineAudio.onRPM((audioState) => {
    gaugeUI.update(audioState.rpm);
    revControl.update(audioState.rpm);
  });

  // Single unified requestAnimationFrame loop via gsap.ticker
  gsap.ticker.lagSmoothing(0);
  let lastTickSec = performance.now() * 0.001;
  let disposed = false;

  function onTick() {
    if (disposed) return;
    const nowSec = performance.now() * 0.001;
    const rawDt = Math.min(1.0, Math.max(0.001, nowSec - lastTickSec));
    const dt = Math.min(0.05, rawDt);
    lastTickSec = nowSec;

    timeline.lenis.raf(nowSec * 1000);
    // Sub-step audio physics in <= 40ms increments so real-time RPM curves hold even under software WebGL
    let remaining = rawDt;
    while (remaining > 0) {
      const step = Math.min(0.04, remaining);
      engineAudio.update(step);
      remaining -= step;
    }

    const rigState = timeline.getRigState();
    const audioState = engineAudio.getState();
    const ch = timeline.getChapter();

    const fxState = {
      time: nowSec,
      rpm: audioState.rpm,
      normalizedRPM: audioState.rpm / AUDIO_CONFIG.redlineRPM,
      isRunning: audioState.isRunning,
      isLimiting: audioState.isLimiting,
      throttle: audioState.throttle,
      chapterIndex: ch.index,
      chapterId: ch.id,
      reducedMotion,
    };

    sceneManager.update(dt, rigState, fxState);
    sceneManager.render();
    soundControl.sync();
  }

  gsap.ticker.add(onTick);

  function onResize() {
    sceneManager.resize();
    timeline.refresh();
  }

  function onReducedMotionChange(e) {
    reducedMotion = Boolean(e.matches);
  }

  window.addEventListener('resize', onResize, { passive: true });
  reducedMotionQuery?.addEventListener?.('change', onReducedMotionChange);

  // Render initial frame before lifting curtain
  sceneManager.update(1 / 60, timeline.getRigState(), {
    time: 0,
    rpm: 0,
    normalizedRPM: 0,
    isRunning: false,
    isLimiting: false,
    throttle: 0,
    chapterIndex: 0,
    chapterId: '01',
    reducedMotion,
  });
  sceneManager.render();
  canvas?.setAttribute('data-ready', 'true');
  loaderUI.complete();

  function dispose() {
    if (disposed) return;
    disposed = true;
    gsap.ticker.remove(onTick);
    window.removeEventListener('resize', onResize);
    reducedMotionQuery?.removeEventListener?.('change', onReducedMotionChange);
    unsubscribeRpm?.();
    timeline.dispose();
    heroUI.dispose();
    chapterOverlay.dispose();
    progressRail.dispose();
    gaugeUI.dispose();
    revControl.dispose();
    soundControl.dispose();
    customCursor.dispose();
    licensingModal.dispose();
    loaderUI.dispose();
    engineAudio.dispose();
    sceneManager.dispose();
    activeApp = null;
  }

  activeApp = Object.freeze({
    version: APP_VERSION,
    getChapter: () => timeline.getChapter(),
    getRigState: () => timeline.getRigState(),
    getSceneDebug: () => sceneManager.getDebugState(),
    getAudioState: () => engineAudio.getState(),
    getConfig: () => CONFIG,
    scrollToChapter: (id) => timeline.scrollToChapter(id),
    dispose,
  });

  window.__DEFENDER_APP__ = activeApp;
  return activeApp;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    bootApp().catch((err) => console.error('[Defender V8] Boot failed:', err));
  }, { once: true });
} else {
  bootApp().catch((err) => console.error('[Defender V8] Boot failed:', err));
}
