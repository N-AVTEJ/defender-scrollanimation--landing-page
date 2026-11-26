import '@fontsource/big-shoulders-display/700';
import '@fontsource/big-shoulders-display/800';
import '@fontsource/instrument-serif/400';
import '@fontsource/instrument-serif/400-italic';
import '@fontsource/ibm-plex-mono/400';
import '@fontsource/ibm-plex-mono/500';

import {
  APP_VERSION,
  ASSET_PATHS,
  AUDIO_CONFIG,
  CAMERA_KEYFRAMES,
  CHAPTERS,
  LIGHTING_CONFIG,
  PALETTE,
  SCROLL_CONFIG,
  SPEC_LINE,
  TYPOGRAPHY,
  VEHICLE_DIMENSIONS,
} from './config/config.js';

/**
 * Initializes the foundation shell tokens, scroll spacer height, loader curtain state,
 * and minimal read-only inspection API for M1 verification.
 */
export function bootFoundation() {
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--scroll-height', `${SCROLL_CONFIG.totalHeightVh}vh`);
  rootStyle.setProperty('--bg-void', PALETTE.bg);
  rootStyle.setProperty('--text-bone', PALETTE.text);
  rootStyle.setProperty('--accent-signal', PALETTE.accent);
  rootStyle.setProperty('--hairline', PALETTE.hairline);
  rootStyle.setProperty('--font-display', TYPOGRAPHY.display);
  rootStyle.setProperty('--font-serif', TYPOGRAPHY.serif);
  rootStyle.setProperty('--font-mono', TYPOGRAPHY.mono);

  const scrollStage = document.getElementById('scroll-stage');
  if (scrollStage) {
    scrollStage.style.height = `${SCROLL_CONFIG.totalHeightVh}vh`;
  }

  const loaderPercent = document.getElementById('loader-percent');
  const loaderBar = document.getElementById('loader-bar');
  const loaderCurtain = document.getElementById('loader-curtain');

  if (loaderPercent) {
    loaderPercent.textContent = '100%';
  }
  if (loaderBar) {
    loaderBar.style.transform = 'scaleX(1)';
  }
  if (loaderCurtain) {
    requestAnimationFrame(() => {
      loaderCurtain.setAttribute('data-loaded', 'true');
      loaderCurtain.setAttribute('aria-hidden', 'true');
    });
  }

  window.__DEFENDER_APP__ = Object.freeze({
    version: APP_VERSION,
    getChapter: () => CHAPTERS[0],
    getConfig: () => ({
      APP_VERSION,
      PALETTE,
      TYPOGRAPHY,
      SPEC_LINE,
      SCROLL_CONFIG,
      VEHICLE_DIMENSIONS,
      CHAPTERS,
      CAMERA_KEYFRAMES,
      LIGHTING_CONFIG,
      AUDIO_CONFIG,
      ASSET_PATHS,
    }),
  });

  console.info(`[Defender V8] Foundation v${APP_VERSION}`, {
    chapters: CHAPTERS.length,
    keyframes: CAMERA_KEYFRAMES.length,
    scrollVh: SCROLL_CONFIG.totalHeightVh,
    redlineRPM: AUDIO_CONFIG.redlineRPM,
    modelAsset: ASSET_PATHS.model,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootFoundation, { once: true });
} else {
  bootFoundation();
}
