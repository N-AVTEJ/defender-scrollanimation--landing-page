import zlib from 'node:zlib';

export const SPEC_LINE = '5.0L SUPERCHARGED · 525 PS · 625 Nm · 0–100 IN 5.2 S';

export function getLoader(page) {
  return page
    .locator('[role="progressbar"]')
    .or(page.locator('[data-testid="loader"]'))
    .or(page.locator('#loader-curtain'))
    .first();
}

export function getScrollContainer(page) {
  return page
    .locator('main[data-scroll-container]')
    .or(page.locator('[data-testid="scroll-container"]'))
    .or(page.locator('#scroll-stage'))
    .or(page.locator('main'))
    .first();
}

export function getWebGLCanvas(page) {
  return page.locator('canvas[data-testid="webgl-canvas"]').or(page.locator('canvas')).first();
}

export function getHeroTitle(page) {
  return page.getByRole('heading', { name: /defender v8/i }).or(page.locator('[data-testid="hero-title"]')).first();
}

export function getScrollCue(page) {
  return page.locator('[data-testid="scroll-cue"]').or(page.getByText(/^scroll$/i)).first();
}

export function getChapterOverlay(page) {
  return page
    .locator('[data-chapter]')
    .or(page.locator('[data-testid="chapter-overlay"]'))
    .or(page.locator('#chapter-root'))
    .first();
}

export function getProgressRail(page) {
  return page
    .getByRole('navigation', { name: /chapter navigation/i })
    .or(page.locator('[data-testid="progress-rail"]'))
    .or(page.locator('nav#rail-root'))
    .first();
}

export function getRailButton(page, chapterId) {
  return page.locator(`[data-rail-chapter="${chapterId}"]`).first();
}

export function getEnableSoundButton(page) {
  return page
    .getByRole('button', { name: /enable sound|sound on|mute/i })
    .or(page.locator('[data-testid="enable-sound-btn"]'))
    .first();
}

export function getRpmGauge(page) {
  return page.locator('[data-testid="rpm-gauge"]').first();
}

export function getRevButton(page) {
  return page
    .getByRole('button', { name: /rev it to 7200 rpm/i })
    .or(page.locator('[data-testid="rev-button"]'))
    .first();
}

export function getRevReadout(page) {
  return page.locator('[data-testid="rev-rpm-readout"]').first();
}

export function getRevArc(page) {
  return page.locator('[data-testid="rev-arc"]').first();
}

export function getLicensingTrigger(page) {
  return page
    .getByRole('button', { name: /model & audio licensing/i })
    .or(page.locator('[data-testid="licensing-trigger"]'))
    .first();
}

export function getLicensingModal(page) {
  return page.getByRole('dialog').or(page.locator('[data-testid="licensing-modal"]')).first();
}

export function getLicensingClose(page) {
  return page
    .locator('[data-testid="licensing-close"]')
    .or(getLicensingModal(page).getByRole('button', { name: /close/i }))
    .first();
}

export function getLetterboxTop(page) {
  return page.locator('[data-testid="letterbox-top"]').first();
}

export function getLetterboxBottom(page) {
  return page.locator('[data-testid="letterbox-bottom"]').first();
}

export function getGrainOverlay(page) {
  return page.locator('[data-testid="grain-overlay"]').first();
}

export function getCustomCursor(page) {
  return page.locator('[data-testid="custom-cursor"]').first();
}

export async function waitForAppReady(page, timeoutMs = 20000) {
  await page.waitForFunction(
    () => {
      const app = window.__DEFENDER_APP__;
      if (!app || typeof app.getSceneDebug !== 'function') return false;
      const debug = app.getSceneDebug();
      if (!debug || debug.isReady !== true) return false;
      const loader = document.querySelector('[role="progressbar"], [data-testid="loader"], #loader-curtain');
      if (loader && loader.getAttribute('data-loading') === 'true') return false;
      return true;
    },
    null,
    { timeout: timeoutMs }
  );
}

export async function getTelemetry(page) {
  return page.evaluate(() => {
    const app = window.__DEFENDER_APP__;
    if (!app) {
      throw new Error('window.__DEFENDER_APP__ is not defined');
    }
    return {
      chapter: app.getChapter(),
      rig: app.getRigState(),
      scene: app.getSceneDebug(),
      audio: app.getAudioState(),
    };
  });
}

export async function scrollToProgress(
  page,
  targetProgress,
  { minSettleMs = 350, maxWaitMs = 5500, tolerance = 0.01 } = {}
) {
  const clamped = Math.max(0, Math.min(1, targetProgress));
  await page.evaluate((p) => {
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const targetY = Math.round(maxY * p);
    window.scrollTo({ top: targetY, behavior: 'instant' });
    window.dispatchEvent(new Event('scroll'));
  }, clamped);

  const t0 = Date.now();
  let lastProgress = null;
  let stableCount = 0;

  while (Date.now() - t0 < maxWaitMs) {
    await page.waitForTimeout(100);
    const cur = await page.evaluate(() => window.__DEFENDER_APP__.getChapter().progress);
    const elapsed = Date.now() - t0;

    if (
      lastProgress !== null &&
      Math.abs(cur - lastProgress) <= 0.002 &&
      Math.abs(cur - clamped) <= tolerance
    ) {
      stableCount += 1;
    } else {
      stableCount = 0;
    }
    lastProgress = cur;

    if (elapsed >= minSettleMs && stableCount >= 3) {
      break;
    }
    // Re-nudge scroll if Lenis damped away slightly on first frame
    if (elapsed > 350 && Math.abs(cur - clamped) > 0.08 && stableCount === 0) {
      await page.evaluate((p) => {
        const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo({ top: Math.round(maxY * p), behavior: 'instant' });
      }, clamped);
    }
  }

  return getTelemetry(page);
}

export async function waitForChapterSettle(page, expectedId, { timeoutMs = 4500, minSettleMs = 500 } = {}) {
  const t0 = Date.now();
  let lastProgress = null;
  let stableCount = 0;

  while (Date.now() - t0 < timeoutMs) {
    await page.waitForTimeout(100);
    const ch = await page.evaluate(() => window.__DEFENDER_APP__.getChapter());
    const elapsed = Date.now() - t0;

    if (
      ch.id === expectedId &&
      lastProgress !== null &&
      Math.abs(ch.progress - lastProgress) <= 0.002
    ) {
      stableCount += 1;
    } else {
      stableCount = 0;
    }
    lastProgress = ch.progress;

    if (elapsed >= minSettleMs && stableCount >= 3) {
      break;
    }
  }

  return getTelemetry(page);
}

export function analyzePngPixelVariance(pngBuffer) {
  if (!Buffer.isBuffer(pngBuffer) || pngBuffer.length < 33) {
    throw new Error('Invalid PNG buffer');
  }
  const pngSig = '89504e470d0a1a0a';
  if (pngBuffer.subarray(0, 8).toString('hex') !== pngSig) {
    throw new Error('Buffer does not start with PNG signature');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  const idatChunks = [];

  while (offset + 8 <= pngBuffer.length) {
    const length = pngBuffer.readUInt32BE(offset);
    const type = pngBuffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > pngBuffer.length) break;

    if (type === 'IHDR') {
      width = pngBuffer.readUInt32BE(dataStart);
      height = pngBuffer.readUInt32BE(dataStart + 4);
      bitDepth = pngBuffer[dataStart + 8];
      colorType = pngBuffer[dataStart + 9];
    } else if (type === 'IDAT') {
      idatChunks.push(pngBuffer.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  if (width === 0 || height === 0 || idatChunks.length === 0) {
    throw new Error('Missing IHDR or IDAT in PNG');
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  if (bitDepth !== 8 || (bpp !== 3 && bpp !== 4)) {
    // Fallback byte entropy check for non-8bit RGB/RGBA PNGs
    let minB = 255;
    let maxB = 0;
    for (let i = 0; i < raw.length; i += 7) {
      if (raw[i] < minB) minB = raw[i];
      if (raw[i] > maxB) maxB = raw[i];
    }
    return { width, height, minLum: minB, maxLum: maxB, range: maxB - minB, stdDev: (maxB - minB) / 4, nonBlank: maxB - minB > 8 };
  }

  const stride = width * bpp;
  const prevRow = Buffer.alloc(stride);
  const currRow = Buffer.alloc(stride);
  const sampleStepX = Math.max(1, Math.floor(width / 64));
  const sampleStepY = Math.max(1, Math.floor(height / 64));
  const luminances = [];
  let minLum = 255;
  let maxLum = 0;

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  let pos = 0;
  for (let y = 0; y < height; y++) {
    if (pos + 1 + stride > raw.length) break;
    const filter = raw[pos++];
    for (let x = 0; x < stride; x++) {
      const val = raw[pos++];
      const a = x >= bpp ? currRow[x - bpp] : 0;
      const b = prevRow[x];
      const c = x >= bpp ? prevRow[x - bpp] : 0;
      if (filter === 0) currRow[x] = val;
      else if (filter === 1) currRow[x] = (val + a) & 0xff;
      else if (filter === 2) currRow[x] = (val + b) & 0xff;
      else if (filter === 3) currRow[x] = (val + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) currRow[x] = (val + paeth(a, b, c)) & 0xff;
      else currRow[x] = val;
    }

    if (y % sampleStepY === 0) {
      for (let px = 0; px < width; px += sampleStepX) {
        const idx = px * bpp;
        const r = currRow[idx];
        const g = currRow[idx + 1];
        const b = currRow[idx + 2];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        luminances.push(lum);
        if (lum < minLum) minLum = lum;
        if (lum > maxLum) maxLum = lum;
      }
    }
    currRow.copy(prevRow);
  }

  const mean = luminances.reduce((acc, v) => acc + v, 0) / Math.max(1, luminances.length);
  const variance =
    luminances.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / Math.max(1, luminances.length);
  const stdDev = Math.sqrt(variance);
  const range = maxLum - minLum;

  return {
    width,
    height,
    samples: luminances.length,
    minLum: Number(minLum.toFixed(2)),
    maxLum: Number(maxLum.toFixed(2)),
    range: Number(range.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
    nonBlank: range > 12 && stdDev > 2.5,
  };
}
