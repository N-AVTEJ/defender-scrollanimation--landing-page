import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TestRunner,
  parseArgs,
  assert,
  assertEqual,
  assertRange,
  summarizeByTier,
} from './lib/runner.mjs';
import { launchBrowser } from './lib/browser.mjs';
import { startMockFixtureServer } from './lib/mock-fixture.mjs';
import {
  SPEC_LINE,
  getLoader,
  getScrollContainer,
  getWebGLCanvas,
  getHeroTitle,
  getScrollCue,
  getChapterOverlay,
  getProgressRail,
  getRailButton,
  getEnableSoundButton,
  getRpmGauge,
  getRevButton,
  getRevReadout,
  getRevArc,
  getLicensingTrigger,
  getLicensingModal,
  getLicensingClose,
  getLetterboxTop,
  getLetterboxBottom,
  getGrainOverlay,
  getCustomCursor,
  waitForAppReady,
  getTelemetry,
  scrollToProgress,
  waitForChapterSettle,
  analyzePngPixelVariance,
} from './lib/selectors.mjs';

const CH_MIDPOINTS = {
  '01': 0.10,
  '02': 0.32,
  '03': 0.49,
  '04': 0.59,
  '05': 0.75,
  '06': 0.94,
};

function dist3(a, b) {
  return Math.hypot((a[0] || 0) - (b[0] || 0), (a[1] || 0) - (b[1] || 0), (a[2] || 0) - (b[2] || 0));
}

export async function runE2ESuite({
  url,
  rootDir = process.cwd(),
  outDir = path.join(rootDir, 'tests', 'artifacts'),
  tiers = null,
  ids = null,
  headed = false,
  mock = false,
  onResult = null,
} = {}) {
  let mockServer = null;
  let targetUrl = url;
  if (mock && !targetUrl) {
    mockServer = await startMockFixtureServer(0, '127.0.0.1');
    targetUrl = mockServer.url;
  }
  assert(targetUrl, 'runE2ESuite requires url or --mock');

  const screenshotsDir = path.join(outDir, 'screenshots');
  await fsp.mkdir(screenshotsDir, { recursive: true });

  const { browser, browserLabel, close: closeBrowser } = await launchBrowser(rootDir, {
    headless: !headed,
  });

  const consoleAudit = {
    pageErrors: [],
    consoleErrors: [],
    fallbackWarningsCount: 0,
  };
  const screenshots = [];
  let webglRenderer = 'unknown';

  async function withPage(
    {
      viewport = { width: 1440, height: 900 },
      hasTouch = false,
      deviceScaleFactor = 1,
      reducedMotion = 'no-preference',
      setupRoutes = null,
      skipAutoWait = false,
      checkErrors = true,
    } = {},
    fn
  ) {
    const context = await browser.newContext({
      viewport,
      hasTouch,
      deviceScaleFactor,
      reducedMotion,
    });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    const warnings = [];
    const audioRequests = [];

    page.on('pageerror', (err) => {
      const msg = err?.message || String(err);
      pageErrors.push(msg);
      consoleAudit.pageErrors.push(msg);
    });
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        consoleErrors.push(text);
        consoleAudit.consoleErrors.push(text);
      } else if (type === 'warning') {
        warnings.push(text);
        consoleAudit.fallbackWarningsCount += 1;
      }
    });
    page.on('request', (req) => {
      if (req.url().includes('/assets/audio/')) {
        audioRequests.push({ url: req.url(), ts: Date.now() });
      }
    });

    try {
      if (typeof setupRoutes === 'function') {
        await setupRoutes(page);
      }
      const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      if (!skipAutoWait) {
        await waitForAppReady(page, 20000);
      }
      if (webglRenderer === 'unknown') {
        webglRenderer = await page.evaluate(() => {
          const c = document.querySelector('canvas');
          const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
          if (!gl) return 'no-webgl';
          const dbg = gl.getExtension('WEBGL_debug_renderer_info');
          return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
        });
      }
      const res = await fn(page, { response, pageErrors, consoleErrors, warnings, audioRequests });
      if (checkErrors) {
        assertEqual(pageErrors.length, 0, `Uncaught pageerrors: ${pageErrors.join(' | ')}`);
        assertEqual(consoleErrors.length, 0, `Console errors: ${consoleErrors.join(' | ')}`);
      }
      return res;
    } finally {
      await context.close();
    }
  }

  async function holdRevAndSample(page, { durationMs = 3200, method = 'pointer' } = {}) {
    const revBtn = getRevButton(page);
    await revBtn.waitFor({ state: 'visible', timeout: 5000 });
    const box = await revBtn.boundingBox();
    assert(box, 'Rev button has no bounding box');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    let cdp = null;
    if (method === 'pointer') {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
    } else if (method === 'touch') {
      cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: Math.round(cx), y: Math.round(cy), id: 1 }],
      });
    } else if (method === 'space') {
      await page.keyboard.down('Space');
    }

    const samples = [];
    const t0 = Date.now();
    try {
      while (Date.now() - t0 < durationMs) {
        await page.waitForTimeout(70);
        const s = await page.evaluate(() => ({
          audio: window.__DEFENDER_APP__.getAudioState(),
          scene: window.__DEFENDER_APP__.getSceneDebug(),
        }));
        samples.push({ t: Date.now() - t0, ...s });
      }
    } finally {
      if (method === 'pointer') {
        await page.mouse.up();
      } else if (method === 'touch' && cdp) {
        try {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchEnd',
            touchPoints: [],
          });
        } finally {
          await cdp.detach().catch(() => {});
        }
      } else if (method === 'space') {
        await page.keyboard.up('Space');
      }
    }

    const maxRPM = Math.max(...samples.map((s) => s.audio.rpm));
    const sawLimiting = samples.some((s) => s.audio.isLimiting || s.audio.rpm >= 6900);
    return { samples, maxRPM, sawLimiting };
  }

  const runner = new TestRunner();

  // ======================== TIER 1: FEATURE COVERAGE ========================
  runner.add({
    id: 'T1-F1-05',
    tier: 1,
    feature: '#1 Preview Boot',
    name: 'Server serves HTTP 200, app mounts cleanly with zero errors',
    fn: async () =>
      withPage({}, async (page, audit) => {
        assert(audit.response && audit.response.status() === 200, `Expected HTTP 200, got ${audit.response?.status()}`);
        const t = await getTelemetry(page);
        assertEqual(t.scene.isReady, true, 'scene.isReady');
        return { metrics: { httpStatus: audit.response.status() } };
      }),
  });

  runner.add({
    id: 'T1-F2-04',
    tier: 1,
    feature: '#2 Scroll Height',
    name: 'Scroll container configures 900vh height',
    fn: async () =>
      withPage({}, async (page) => {
        const t = await getTelemetry(page);
        assertEqual(t.rig.scrollHeightVh, 900, 'rig.scrollHeightVh');
        const ratio = await page.evaluate(() => document.documentElement.scrollHeight / window.innerHeight);
        assertRange(ratio, 8.5, 9.5, 'scrollHeight/innerHeight ratio');
        return { metrics: { ratio: Number(ratio.toFixed(2)) } };
      }),
  });

  runner.add({
    id: 'T1-F3-03',
    tier: 1,
    feature: '#3 Clean Fallback Boot',
    name: 'Booting without optional assets emits zero pageerror or console.error',
    fn: async () =>
      withPage({}, async (page, audit) => {
        await scrollToProgress(page, 0.5, { minSettleMs: 500 });
        assertEqual(audit.pageErrors.length, 0, 'pageErrors');
        assertEqual(audit.consoleErrors.length, 0, 'consoleErrors');
      }),
  });

  runner.add({
    id: 'T1-F3-04',
    tier: 1,
    feature: '#3 Fallback Warnings',
    name: 'Console captures explicit console.warn messages for missing model/HDR fallbacks',
    fn: async () =>
      withPage({}, async (_page, audit) => {
        assert(
          audit.warnings.length >= 1,
          `Expected >= 1 console.warn fallback message, got ${audit.warnings.length}`
        );
        const joined = audit.warnings.join(' | ').toLowerCase();
        assert(
          joined.includes('fallback') || joined.includes('procedural') || joined.includes('defender') || joined.includes('hdr'),
          `Expected fallback-related warning, got: ${joined}`
        );
        return { metrics: { warningsCount: audit.warnings.length } };
      }),
  });

  runner.add({
    id: 'T1-F3-05',
    tier: 1,
    feature: '#3 Debug Flags',
    name: 'getSceneDebug reports isReady, isFallbackModel, isFallbackEnv',
    fn: async () =>
      withPage({}, async (page) => {
        const t = await getTelemetry(page);
        assertEqual(t.scene.isReady, true, 'isReady');
        assertEqual(t.scene.isFallbackModel, true, 'isFallbackModel');
        assertEqual(t.scene.isFallbackEnv, true, 'isFallbackEnv');
      }),
  });

  runner.add({
    id: 'T1-F4-01',
    tier: 1,
    feature: '#4 Non-Blank WebGL',
    name: 'WebGL canvas renders non-blank multi-tone pixels at Hero',
    fn: async () =>
      withPage({}, async (page) => {
        const canvas = getWebGLCanvas(page);
        await canvas.waitFor({ state: 'visible' });
        let png;
        await page.evaluate(() => {
          const target = document.querySelector('canvas[data-testid="webgl-canvas"]') || document.querySelector('canvas');
          if (target) {
            let cur = target;
            while (cur && cur.nodeType === 1) {
              cur.setAttribute('data-tw-canvas-keep', 'true');
              cur = cur.parentElement;
            }
          }
          const style = document.createElement('style');
          style.id = '__tw_isolate_canvas__';
          style.textContent = [
            'body *:not([data-tw-canvas-keep="true"]) { visibility: hidden !important; opacity: 0 !important; }',
            '[data-tw-canvas-keep="true"]::before, [data-tw-canvas-keep="true"]::after { content: none !important; display: none !important; }',
            'canvas[data-tw-canvas-keep="true"] { visibility: visible !important; opacity: 1 !important; }',
          ].join('\n');
          document.head.appendChild(style);
          return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        try {
          png = await canvas.screenshot();
        } finally {
          await page.evaluate(() => {
            document.getElementById('__tw_isolate_canvas__')?.remove();
            for (const el of document.querySelectorAll('[data-tw-canvas-keep]')) {
              el.removeAttribute('data-tw-canvas-keep');
            }
          });
        }
        const stats = analyzePngPixelVariance(png);
        assert(stats.nonBlank, `Canvas appears blank/flat: ${JSON.stringify(stats)}`);
        return { metrics: stats };
      }),
  });

  runner.add({
    id: 'T1-F4-02',
    tier: 1,
    feature: '#4 Headlight Ramp',
    name: 'Headlights ramp from dim DRL at 0.00 to full intensity by CH 01 end',
    fn: async () =>
      withPage({}, async (page) => {
        const startT = await scrollToProgress(page, 0.0, { minSettleMs: 400 });
        const endT = await scrollToProgress(page, 0.18);
        assert(startT.rig.headlights <= 0.4, `Expected dim DRL at start, got ${startT.rig.headlights}`);
        assert(endT.rig.headlights >= 0.85, `Expected full headlights at CH01 end, got ${endT.rig.headlights}`);
        assert(endT.rig.headlights > startT.rig.headlights, 'Headlights must increase along CH 01');
        return { metrics: { start: startT.rig.headlights, end: endT.rig.headlights } };
      }),
  });

  runner.add({
    id: 'T1-F4-03',
    tier: 1,
    feature: '#4 Driver Door Hinge',
    name: 'door_driver opens to <= -1.0 rad (~-65 deg) in CH 02 and closes in CH 03',
    fn: async () =>
      withPage({}, async (page) => {
        const ch2 = await scrollToProgress(page, CH_MIDPOINTS['02']);
        assert(ch2.rig.doorAngle <= -0.95, `Expected open doorAngle <= -0.95 rad in CH02, got ${ch2.rig.doorAngle}`);
        const ch3 = await scrollToProgress(page, CH_MIDPOINTS['03']);
        assert(Math.abs(ch3.rig.doorAngle) <= 0.15, `Expected closed doorAngle in CH03, got ${ch3.rig.doorAngle}`);
        return { metrics: { ch2Door: ch2.rig.doorAngle, ch3Door: ch3.rig.doorAngle } };
      }),
  });

  runner.add({
    id: 'T1-F4-04',
    tier: 1,
    feature: '#4 Interior Light',
    name: 'interiorLight ramps up (>= 0.65) in CH 02 when door opens',
    fn: async () =>
      withPage({}, async (page) => {
        const ch1 = await scrollToProgress(page, 0.02, { minSettleMs: 400 });
        const ch2 = await scrollToProgress(page, CH_MIDPOINTS['02']);
        assert(ch2.rig.interiorLight >= 0.65, `Expected interiorLight >= 0.65 in CH02, got ${ch2.rig.interiorLight}`);
        assert(ch2.rig.interiorLight > ch1.rig.interiorLight, 'interiorLight should rise in CH02');
      }),
  });

  runner.add({
    id: 'T1-F4-05',
    tier: 1,
    feature: '#4 Fog Parallax',
    name: 'fogDensity clears between Hero (0.00) and close front-quarter (~0.18)',
    fn: async () =>
      withPage({}, async (page) => {
        const hero = await scrollToProgress(page, 0.0, { minSettleMs: 400 });
        const near = await scrollToProgress(page, 0.18);
        assert(near.rig.fogDensity < hero.rig.fogDensity, `Expected fogDensity to drop (${hero.rig.fogDensity} -> ${near.rig.fogDensity})`);
        return { metrics: { heroFog: hero.rig.fogDensity, nearFog: near.rig.fogDensity } };
      }),
  });

  runner.add({
    id: 'T1-F5-01',
    tier: 1,
    feature: '#5 Pixel Ratio Cap',
    name: 'Renderer caps pixelRatio <= 2',
    fn: async () =>
      withPage({ deviceScaleFactor: 2 }, async (page) => {
        const t = await getTelemetry(page);
        assert(t.scene.pixelRatio <= 2 && t.scene.pixelRatio <= t.scene.maxPixelRatio, `pixelRatio=${t.scene.pixelRatio}`);
      }),
  });

  runner.add({
    id: 'T1-F5-02',
    tier: 1,
    feature: '#5 Postprocessing Clean',
    name: 'Zero WebGL shader/program errors across all chapters',
    fn: async () =>
      withPage({}, async (page, audit) => {
        for (const p of [0.05, 0.28, 0.45, 0.60, 0.76, 0.95]) {
          await scrollToProgress(page, p, { minSettleMs: 450 });
        }
        assertEqual(audit.consoleErrors.length, 0, 'WebGL/console errors');
      }),
  });

  runner.add({
    id: 'T1-F5-03',
    tier: 1,
    feature: '#5 Bonnet Rattle',
    name: 'CH 04 engine idle activates bonnetRattleActive under normal motion',
    fn: async () =>
      withPage({}, async (page) => {
        const t = await scrollToProgress(page, CH_MIDPOINTS['04']);
        assertEqual(t.scene.bonnetRattleActive, true, 'bonnetRattleActive in CH 04');
      }),
  });

  runner.add({
    id: 'T1-F5-04',
    tier: 1,
    feature: '#5 Exhaust Glow',
    name: 'CH 06 active rev increases exhaustGlow above CH 06 idle baseline',
    fn: async () =>
      withPage({}, async (page) => {
        const idleT = await scrollToProgress(page, CH_MIDPOINTS['06']);
        const baseGlow = idleT.scene.exhaustGlow;
        const { samples } = await holdRevAndSample(page, { durationMs: 2600 });
        const peakGlow = Math.max(...samples.map((s) => s.scene.exhaustGlow));
        assert(peakGlow > baseGlow, `Expected exhaustGlow to rise (${baseGlow} -> ${peakGlow})`);
        return { metrics: { baseGlow, peakGlow } };
      }),
  });

  runner.add({
    id: 'T1-F5-05',
    tier: 1,
    feature: '#5 Clean Teardown',
    name: 'Navigating away triggers clean teardown with zero unhandled errors',
    fn: async () =>
      withPage({}, async (page, audit) => {
        await scrollToProgress(page, 0.5, { minSettleMs: 400 });
        await page.goto('about:blank');
        assertEqual(audit.pageErrors.length, 0, 'pageErrors on teardown');
      }),
  });

  runner.add({
    id: 'T1-F6-01',
    tier: 1,
    feature: '#6 Lazy Audio Gate',
    name: 'Zero /assets/audio/* requests prior to clicking Enable sound',
    fn: async () =>
      withPage({}, async (page, audit) => {
        await scrollToProgress(page, 0.65, { minSettleMs: 500 });
        const t = await getTelemetry(page);
        assertEqual(t.audio.isUnlocked, false, 'isUnlocked before click');
        assertEqual(audit.audioRequests.length, 0, 'Audio requests before unlock');
      }),
  });

  runner.add({
    id: 'T1-F6-02',
    tier: 1,
    feature: '#6 Audio Unlock',
    name: 'Clicking Enable sound resumes AudioContext and activates procedural fallback with warn',
    fn: async () =>
      withPage({}, async (page, audit) => {
        await getEnableSoundButton(page).click();
        await page.waitForTimeout(250);
        const t = await getTelemetry(page);
        assertEqual(t.audio.isUnlocked, true, 'isUnlocked');
        assertEqual(t.audio.contextState, 'running', 'contextState');
        assert(t.audio.mode === 'procedural' || t.audio.mode === 'samples', `Unexpected audio mode: ${t.audio.mode}`);
        if (t.audio.mode === 'procedural') {
          assert(audit.warnings.length >= 1, 'Expected console.warn when procedural audio fallback activates');
        }
      }),
  });

  runner.add({
    id: 'T1-F6-03',
    tier: 1,
    feature: '#6 CH 04 Idle',
    name: 'Entering CH 04 starts engine and settles around ~650 RPM idle',
    fn: async () =>
      withPage({}, async (page) => {
        await getEnableSoundButton(page).click();
        await scrollToProgress(page, CH_MIDPOINTS['04']);
        await page.waitForFunction(
          () => {
            const a = window.__DEFENDER_APP__?.getAudioState?.();
            return Boolean(a && a.isRunning === true && !a.isCranking && a.rpm >= 520 && a.rpm <= 820);
          },
          null,
          { timeout: 4500 }
        );
        await page.waitForTimeout(300);
        const t = await getTelemetry(page);
        assertEqual(t.audio.isRunning, true, 'isRunning in CH 04');
        assertEqual(t.audio.isCranking, false, 'isCranking settled in CH 04');
        assertRange(t.audio.rpm, 520, 820, 'CH 04 idle RPM');
        return { metrics: { idleRPM: t.audio.rpm } };
      }),
  });

  runner.add({
    id: 'T1-F6-04',
    tier: 1,
    feature: '#6 Cockpit vs Exterior Mix',
    name: 'mix is cockpit-muffled in CH 03-04 and exterior in CH 05-06',
    fn: async () =>
      withPage({}, async (page) => {
        await getEnableSoundButton(page).click();
        const ch3 = await scrollToProgress(page, CH_MIDPOINTS['03']);
        const ch4 = await scrollToProgress(page, CH_MIDPOINTS['04']);
        const ch6 = await scrollToProgress(page, CH_MIDPOINTS['06']);
        assert(ch3.audio.mix >= 0.75, `CH03 mix expected >= 0.75, got ${ch3.audio.mix}`);
        assert(ch4.audio.mix >= 0.75, `CH04 mix expected >= 0.75, got ${ch4.audio.mix}`);
        assert(ch6.audio.mix <= 0.25, `CH06 mix expected <= 0.25, got ${ch6.audio.mix}`);
        return { metrics: { ch3Mix: ch3.audio.mix, ch4Mix: ch4.audio.mix, ch6Mix: ch6.audio.mix } };
      }),
  });

  runner.add({
    id: 'T1-F6-05',
    tier: 1,
    feature: '#6 Rev & Release',
    name: 'Holding REV IT TO 7200 RPM reaches limiter and releasing decelerates',
    fn: async () =>
      withPage({}, async (page) => {
        await getEnableSoundButton(page).click();
        await scrollToProgress(page, CH_MIDPOINTS['06']);
        const { maxRPM } = await holdRevAndSample(page, { durationMs: 3200 });
        assert(maxRPM >= 6850, `Expected maxRPM >= 6850, got ${maxRPM}`);
        await page.waitForFunction(
          () => {
            const a = window.__DEFENDER_APP__?.getAudioState?.();
            return Boolean(a && a.throttle === 0 && a.rpm < 1500);
          },
          null,
          { timeout: 4500 }
        );
        const after = await getTelemetry(page);
        assertEqual(after.audio.throttle, 0, 'throttle after release');
        assert(
          after.audio.rpm < 1500 && after.audio.rpm < maxRPM,
          `Expected decelerated rpm < 1500 and below peak (${maxRPM}), got ${after.audio.rpm}`
        );
        return { metrics: { peakRPM: maxRPM, releasedRPM: after.audio.rpm } };
      }),
  });

  runner.add({
    id: 'T1-F7-01',
    tier: 1,
    feature: '#7 Editorial Palette',
    name: 'Computed styles enforce #0b0c0a bg, #e8e2d3 text, and #e0541f accent',
    fn: async () =>
      withPage({}, async (page) => {
        const colors = await page.evaluate(() => {
          const bodyStyle = getComputedStyle(document.body);
          const htmlStyle = getComputedStyle(document.documentElement);
          const bg = bodyStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' ? bodyStyle.backgroundColor : htmlStyle.backgroundColor;
          const fg = bodyStyle.color;
          const accentEl = document.querySelector('[data-testid="chapter-numeral"], [aria-current="step"], [data-testid="rev-button"]');
          const accentStyles = accentEl ? getComputedStyle(accentEl) : null;
          const cssText = Array.from(document.styleSheets)
            .map((s) => {
              try { return Array.from(s.cssRules).map((r) => r.cssText).join('\n'); } catch { return ''; }
            })
            .join('\n');
          return {
            bg,
            fg,
            accentColor: accentStyles?.color || '',
            accentBorder: accentStyles?.borderColor || '',
            hasAccentToken: /#e0541f|rgb\(224,\s*84,\s*31\)/i.test(cssText),
          };
        });
        assertEqual(colors.bg, 'rgb(11, 12, 10)', 'Body backgroundColor');
        assertEqual(colors.fg, 'rgb(232, 226, 211)', 'Body text color');
        assert(
          colors.hasAccentToken ||
            colors.accentColor === 'rgb(224, 84, 31)' ||
            colors.accentBorder === 'rgb(224, 84, 31)',
          `Signal orange accent #e0541f not detected: ${JSON.stringify(colors)}`
        );
      }),
  });

  runner.add({
    id: 'T1-F7-02',
    tier: 1,
    feature: '#7 Typography & Gradients',
    name: 'Computed fonts match editorial trio with zero Inter/Roboto/Arial or purple gradients',
    fn: async () =>
      withPage({}, async (page) => {
        const auditFonts = await page.evaluate(() => {
          const hero = document.querySelector('h1, [data-testid="hero-title"]');
          const copy = document.querySelector('[data-testid="chapter-copy"], [data-chapter] p');
          const mono = document.querySelector('[data-testid="chapter-spec"], [data-testid="loader"]');
          const forbiddenFonts = [];
          const purpleGradients = [];
          const els = document.querySelectorAll('body, h1, h2, h3, p, span, button, div, section, nav, footer');
          for (const el of els) {
            const st = getComputedStyle(el);
            if (/\b(Inter|Roboto|Arial)\b/i.test(st.fontFamily)) {
              forbiddenFonts.push(`${el.tagName}:${st.fontFamily}`);
            }
            if (/gradient\([^)]*(purple|violet|indigo|128,\s*0,\s*128|139,\s*92,\s*246|168,\s*85,\s*247)/i.test(st.backgroundImage)) {
              purpleGradients.push(`${el.tagName}:${st.backgroundImage}`);
            }
          }
          return {
            heroFont: hero ? getComputedStyle(hero).fontFamily : '',
            copyFont: copy ? getComputedStyle(copy).fontFamily : '',
            monoFont: mono ? getComputedStyle(mono).fontFamily : '',
            forbiddenFonts,
            purpleGradients,
          };
        });
        assert(/Big Shoulders Display|Barlow Condensed/i.test(auditFonts.heroFont), `Hero font: ${auditFonts.heroFont}`);
        assert(/Instrument Serif/i.test(auditFonts.copyFont), `Copy font: ${auditFonts.copyFont}`);
        assert(/IBM Plex Mono/i.test(auditFonts.monoFont), `Mono font: ${auditFonts.monoFont}`);
        assertEqual(auditFonts.forbiddenFonts.length, 0, `Forbidden fonts: ${auditFonts.forbiddenFonts.join(', ')}`);
        assertEqual(auditFonts.purpleGradients.length, 0, `Purple gradients: ${auditFonts.purpleGradients.join(', ')}`);
      }),
  });

  runner.add({
    id: 'T1-F7-03',
    tier: 1,
    feature: '#7 Letterbox & Grain',
    name: 'Letterbox bars, 1px hairline rules, and non-blocking grain overlay render',
    fn: async () =>
      withPage({}, async (page) => {
        await getLetterboxTop(page).waitFor({ state: 'attached' });
        await getLetterboxBottom(page).waitFor({ state: 'attached' });
        const grain = getGrainOverlay(page);
        await grain.waitFor({ state: 'attached' });
        const pe = await grain.evaluate((el) => getComputedStyle(el).pointerEvents);
        assertEqual(pe, 'none', 'grain-overlay pointer-events');
      }),
  });

  runner.add({
    id: 'T1-F7-04',
    tier: 1,
    feature: '#7 Mobile Zero Overflow',
    name: 'Mobile 375x812 viewport has zero horizontal overflow',
    fn: async () =>
      withPage({ viewport: { width: 375, height: 812 }, hasTouch: true }, async (page) => {
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }));
        assert(overflow.scrollWidth <= overflow.innerWidth, `Horizontal overflow: ${JSON.stringify(overflow)}`);
      }),
  });

  runner.add({
    id: 'T1-F7-05',
    tier: 1,
    feature: '#7 Reduced-Motion CSS',
    name: 'prefers-reduced-motion: reduce disables custom cursor activation',
    fn: async () =>
      withPage({ reducedMotion: 'reduce' }, async (page) => {
        const cursor = getCustomCursor(page);
        const count = await cursor.count();
        if (count > 0) {
          const enabled = await cursor.getAttribute('data-enabled');
          const display = await cursor.evaluate((el) => getComputedStyle(el).display);
          assert(enabled === 'false' || display === 'none', `Expected custom cursor disabled, enabled=${enabled}, display=${display}`);
        }
      }),
  });

  runner.add({
    id: 'T1-F8-01',
    tier: 1,
    feature: '#8 Loading Curtain',
    name: 'Loading curtain renders percentage and dismisses cleanly on ready',
    fn: async () =>
      withPage({}, async (page) => {
        const loader = getLoader(page);
        const text = (await loader.textContent()) || '';
        assert(/%/.test(text), `Loader missing % indicator: ${text}`);
        const dataLoading = await loader.getAttribute('data-loading');
        const pe = await loader.evaluate((el) => getComputedStyle(el).pointerEvents);
        const hidden = await loader.isHidden();
        assert(dataLoading === 'false' || pe === 'none' || hidden, 'Loader must not block interaction after ready');
      }),
  });

  runner.add({
    id: 'T1-F8-02',
    tier: 1,
    feature: '#8 Hero Reveal & Scroll Cue',
    name: 'DEFENDER V8 hero renders with per-character spans and Scroll cue',
    fn: async () =>
      withPage({}, async (page) => {
        const hero = getHeroTitle(page);
        await hero.waitFor({ state: 'visible' });
        const text = (await hero.textContent()) || '';
        assert(/DEFENDER\s*V8/i.test(text), `Unexpected hero text: ${text}`);
        const spanCount = await hero.locator('span').count();
        assert(spanCount >= 8, `Expected per-character spans in hero title, got ${spanCount}`);
        const cue = getScrollCue(page);
        await cue.waitFor({ state: 'visible' });
      }),
  });

  runner.add({
    id: 'T1-F8-03',
    tier: 1,
    feature: '#8 Chapter Overlay & Spec',
    name: 'Chapter overlay updates numeral, title, copy, and exact SPEC_LINE',
    fn: async () =>
      withPage({}, async (page) => {
        await scrollToProgress(page, CH_MIDPOINTS['02']);
        const overlay = getChapterOverlay(page);
        const chAttr = await overlay.getAttribute('data-chapter');
        assertEqual(chAttr, '02', 'data-chapter');
        const txt = (await overlay.textContent()) || '';
        assert(txt.includes('525 PS') && txt.includes('625 Nm'), `Overlay missing SPEC_LINE: ${txt}`);
        assert(txt.includes(SPEC_LINE) || txt.replace(/\s+/g, ' ').includes('5.0L SUPERCHARGED'), 'SPEC_LINE mismatch');
      }),
  });

  runner.add({
    id: 'T1-F8-04',
    tier: 1,
    feature: '#8 Progress Rail',
    name: 'Right-hand progress rail renders 01-06 and click-scrolls to chapter',
    fn: async () =>
      withPage({}, async (page) => {
        const rail = getProgressRail(page);
        await rail.waitFor({ state: 'visible' });
        for (const id of ['01', '02', '03', '04', '05', '06']) {
          assertEqual(await getRailButton(page, id).count(), 1, `Rail button ${id}`);
        }
        await getRailButton(page, '05').click();
        const t = await waitForChapterSettle(page, '05');
        assertEqual(t.chapter.id, '05', 'Chapter after clicking rail 05');
      }),
  });

  runner.add({
    id: 'T1-F8-05',
    tier: 1,
    feature: '#8 Gauge, Rev & Licensing',
    name: 'RPM gauge in CH 03-04, rev control in CH 06, and licensing modal work',
    fn: async () =>
      withPage({}, async (page) => {
        await scrollToProgress(page, CH_MIDPOINTS['03']);
        const gauge = getRpmGauge(page);
        assertEqual(await gauge.getAttribute('data-visible'), 'true', 'gauge visible in CH03');
        assert(/0\s*KM\/H/i.test((await gauge.textContent()) || ''), 'Gauge shows 0 KM/H');

        await scrollToProgress(page, CH_MIDPOINTS['06']);
        await getRevButton(page).waitFor({ state: 'visible' });
        await getRevArc(page).waitFor({ state: 'attached' });

        await getLicensingTrigger(page).click();
        const modal = getLicensingModal(page);
        await modal.waitFor({ state: 'visible' });
        await getLicensingClose(page).click();
        await modal.waitFor({ state: 'hidden' });
      }),
  });

  runner.add({
    id: 'T1-F9-01',
    tier: 1,
    feature: '#9 Pinned Canvas',
    name: 'WebGL canvas stays pinned to viewport across entire scroll range',
    fn: async () =>
      withPage({}, async (page) => {
        const vp = page.viewportSize() || { width: 1440, height: 900 };
        for (const p of [0.0, 0.35, 0.72, 1.0]) {
          await scrollToProgress(page, p, { minSettleMs: 400 });
          const box = await getWebGLCanvas(page).boundingBox();
          assert(
            box && Math.abs(box.y) <= 2 && box.width >= vp.width - 10 && box.height >= vp.height - 10,
            `Canvas unpinned at ${p}: ${JSON.stringify(box)}`
          );
        }
      }),
  });

  runner.add({
    id: 'T1-F9-02',
    tier: 1,
    feature: '#9 Forward Choreography',
    name: 'Forward scroll transitions sequentially 01->02->03->04->05->06 with changing camera',
    fn: async () =>
      withPage({}, async (page) => {
        const positions = [];
        for (const id of ['01', '02', '03', '04', '05', '06']) {
          const t = await scrollToProgress(page, CH_MIDPOINTS[id]);
          assertEqual(t.chapter.id, id, `Expected chapter ${id}`);
          positions.push(t.rig.camPos);
        }
        assert(dist3(positions[0], positions[2]) > 0.5, 'Camera did not move between CH01 and CH03');
        assert(dist3(positions[2], positions[5]) > 0.5, 'Camera did not move between CH03 and CH06');
      }),
  });

  runner.add({
    id: 'T1-F9-03',
    tier: 1,
    feature: '#9 Single rAF Loop',
    name: 'Application runs within a single unified requestAnimationFrame loop',
    fn: async () =>
      withPage({}, async (page) => {
        const t = await getTelemetry(page);
        assertEqual(t.scene.rafLoopCount, 1, 'rafLoopCount');
      }),
  });

  runner.add({
    id: 'T1-F9-04',
    tier: 1,
    feature: '#9 GPU-Only DOM Motion',
    name: 'Animated HUD overlays avoid layout-thrashing top/left/width/height transitions',
    fn: async () =>
      withPage({}, async (page) => {
        const badTransitions = await page.evaluate(() => {
          const selectors = [
            '[data-chapter]',
            '[data-testid="rpm-gauge"]',
            '[data-testid="rev-button"]',
            '[data-testid="loader"]',
            'h1',
          ];
          const bad = [];
          for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const tp = getComputedStyle(el).transitionProperty;
            if (/\b(top|left|right|bottom|width|height|margin|padding)\b/i.test(tp)) {
              bad.push(`${sel}:${tp}`);
            }
          }
          return bad;
        });
        assertEqual(badTransitions.length, 0, `Layout transitions detected: ${badTransitions.join(', ')}`);
      }),
  });

  runner.add({
    id: 'T1-F9-05',
    tier: 1,
    feature: '#9 Reduced-Motion Shake',
    name: 'prefers-reduced-motion: reduce keeps activeShakeAmplitude at 0',
    fn: async () =>
      withPage({ reducedMotion: 'reduce' }, async (page) => {
        await getEnableSoundButton(page).click();
        await scrollToProgress(page, CH_MIDPOINTS['04']);
        const ch4 = await getTelemetry(page);
        assertEqual(ch4.scene.activeShakeAmplitude, 0, 'CH04 shake under reducedMotion');

        await scrollToProgress(page, CH_MIDPOINTS['06']);
        const { samples } = await holdRevAndSample(page, { durationMs: 2000 });
        assert(samples.every((s) => s.scene.activeShakeAmplitude === 0), 'Shake must stay 0 during CH06 rev under reducedMotion');
      }),
  });

  // ======================== TIER 2: BOUNDARY & CORNER CASES ========================
  runner.add({
    id: 'T2-SCR-01',
    tier: 2,
    feature: '#9 Scroll Boundaries',
    name: 'Extrema 0.0 and 1.0 produce finite telemetry locked to CH 01 and CH 06',
    fn: async () =>
      withPage({}, async (page) => {
        for (const [p, expectedId] of [[0.0, '01'], [1.0, '06']]) {
          const t = await scrollToProgress(page, p);
          assertEqual(t.chapter.id, expectedId, `Chapter at ${p}`);
          assert(t.rig.camPos.every(Number.isFinite), `Non-finite camPos at ${p}`);
          assert(Number.isFinite(t.rig.fov) && Number.isFinite(t.rig.doorAngle), `Non-finite rig scalar at ${p}`);
        }
      }),
  });

  runner.add({
    id: 'T2-SCR-02',
    tier: 2,
    feature: '#9 Snap Jumps',
    name: 'Instant snap jump 0.0 -> 1.0 -> 0.0 resets rig and HUD state cleanly',
    fn: async () =>
      withPage({}, async (page) => {
        await scrollToProgress(page, 1.0);
        const resetT = await scrollToProgress(page, 0.0);
        assertEqual(resetT.chapter.id, '01', 'chapter after 1.0->0.0 snap');
        assert(Math.abs(resetT.rig.doorAngle) <= 0.15, `doorAngle=${resetT.rig.doorAngle}`);
        assertEqual(resetT.rig.gaugeVisible, false, 'gaugeVisible');
        assertEqual(resetT.rig.revActive, false, 'revActive');
      }),
  });

  runner.add({
    id: 'T2-SCR-03',
    tier: 2,
    feature: '#9 Reverse Scrub',
    name: 'Reverse scrub 06->01 re-opens door in CH 02, closes in CH 01, stops engine',
    fn: async () =>
      withPage({}, async (page) => {
        await getEnableSoundButton(page).click();
        await scrollToProgress(page, CH_MIDPOINTS['06']);
        const ch2Rev = await scrollToProgress(page, CH_MIDPOINTS['02']);
        assert(ch2Rev.rig.doorAngle <= -0.95, `Reverse CH02 doorAngle=${ch2Rev.rig.doorAngle}`);
        assertEqual(ch2Rev.audio.isRunning, false, 'Engine must stop below CH 04');
        const ch1Rev = await scrollToProgress(page, 0.02);
        assert(Math.abs(ch1Rev.rig.doorAngle) <= 0.15, `Reverse CH01 doorAngle=${ch1Rev.rig.doorAngle}`);
      }),
  });

  runner.add({
    id: 'T2-SCR-04',
    tier: 2,
    feature: '#9 Oscillation Stability',
    name: 'Rapid oscillation across CH 02 latch and CH 04 ignition completes cleanly',
    fn: async () =>
      withPage({}, async (page) => {
        await getEnableSoundButton(page).click();
        for (const p of [0.23, 0.27, 0.23, 0.28, 0.49, 0.54, 0.49, 0.56]) {
          await scrollToProgress(page, p, { minSettleMs: 180, maxWaitMs: 900 });
        }
        const t = await scrollToProgress(page, CH_MIDPOINTS['04']);
        assertEqual(t.chapter.id, '04', 'Final chapter after oscillation');
        assertEqual(t.audio.isRunning, true, 'isRunning after oscillation');
      }),
  });

  runner.add({
    id: 'T2-SCR-05',
    tier: 2,
    feature: '#2 Transition Edges',
    name: 'Chapter transition edge values resolve cleanly with non-empty copy',
    fn: async () =>
      withPage({}, async (page) => {
        for (const p of [0.19, 0.34, 0.51, 0.67, 0.83]) {
          const t = await scrollToProgress(page, p, { minSettleMs: 350 });
          assert(['01', '02', '03', '04', '05', '06'].includes(t.chapter.id), `Invalid chapter id ${t.chapter.id}`);
          const copyText = (await getChapterOverlay(page).textContent()) || '';
          assert(copyText.trim().length > 10, `Empty chapter copy at edge ${p}`);
        }
      }),
  });

  runner.add({
    id: 'T2-REV-01',
    tier: 2,
    feature: '#6 Short Tap Blip',
    name: 'Short 120ms tap blips RPM briefly without engaging limiter',
    fn: async () =>
      withPage({}, async (page) => {
        await getEnableSoundButton(page).click();
        await scrollToProgress(page, CH_MIDPOINTS['06']);
        await page.waitForTimeout(700);
        const { maxRPM, samples } = await holdRevAndSample(page, { durationMs: 140 });
        assert(maxRPM < 3500, `Short tap should stay below 3500 RPM, got ${maxRPM}`);
        assert(samples.every((s) => !s.audio.isLimiting), 'Short tap must not trigger limiter');
      }),
  });

  runner.add({
    id: 'T2-REV-02',
    tier: 2,
    feature: '#6 Limiter Bounce',
    name: 'Sustained 3200ms hold reaches 6900-7200 RPM limiter bounce',
    fn: async () =>
      withPage({}, async (page) => {
        await getEnableSoundButton(page).click();
        await scrollToProgress(page, CH_MIDPOINTS['06']);
        const { maxRPM, sawLimiting, samples } = await holdRevAndSample(page, { durationMs: 3400 });
        assert(maxRPM >= 6900, `Expected limiter peak >= 6900, got ${maxRPM}`);
        assert(sawLimiting, 'Expected isLimiting or >=6900 RPM limiter bounce observed');
        const tail = samples.slice(-10).map((s) => s.audio.rpm);
        assert(Math.max(...tail) <= 7250, `RPM overshot 7200 redline: ${Math.max(...tail)}`);
        return { metrics: { maxRPM } };
      }),
  });

  runner.add({
    id: 'T2-REV-03',
    tier: 2,
    feature: '#6 Decel Physics',
    name: 'Releasing from limiter decelerates smoothly back toward ~650 RPM',
    fn: async () =>
      withPage({}, async (page) => {
        await getEnableSoundButton(page).click();
        await scrollToProgress(page, CH_MIDPOINTS['06']);
        const { maxRPM } = await holdRevAndSample(page, { durationMs: 3000 });
        assert(maxRPM >= 6500, `Expected peak RPM >= 6500 before release, got ${maxRPM}`);
        await page.waitForFunction(
          () => {
            const a = window.__DEFENDER_APP__?.getAudioState?.();
            return Boolean(a && a.throttle === 0 && a.rpm < 3000);
          },
          null,
          { timeout: 3200 }
        );
        const mid = await getTelemetry(page);
        assert(mid.audio.rpm < 3000 && mid.audio.rpm < maxRPM, `Expected mid decel rpm < 3000, got ${mid.audio.rpm}`);
        await page.waitForFunction(
          () => {
            const a = window.__DEFENDER_APP__?.getAudioState?.();
            return Boolean(a && a.throttle === 0 && a.rpm < 950);
          },
          null,
          { timeout: 3500 }
        );
        const settled = await getTelemetry(page);
        assert(
          settled.audio.rpm < 950 && settled.audio.rpm < mid.audio.rpm,
          `Expected settled rpm < 950 (mid=${mid.audio.rpm}), got ${settled.audio.rpm}`
        );
        return { metrics: { peakRPM: maxRPM, midRPM: mid.audio.rpm, settledRPM: settled.audio.rpm } };
      }),
  });

  runner.add({
    id: 'T2-REV-04',
    tier: 2,
    feature: '#8 Input Parity & Abort',
    name: 'Pointer, touch, and Space reach >= 6850 RPM; pointercancel/blur drop throttle to 0',
    fn: async () =>
      withPage({ hasTouch: true }, async (page) => {
        await getEnableSoundButton(page).click();
        await scrollToProgress(page, CH_MIDPOINTS['06']);

        const touchRes = await holdRevAndSample(page, { durationMs: 2800, method: 'touch' });
        assert(touchRes.maxRPM >= 6850, `Touch rev maxRPM=${touchRes.maxRPM}`);
        await page.waitForTimeout(800);

        const spaceRes = await holdRevAndSample(page, { durationMs: 2800, method: 'space' });
        assert(spaceRes.maxRPM >= 6850, `Space rev maxRPM=${spaceRes.maxRPM}`);

        // Pointercancel & window blur abort safety
        const revBtn = getRevButton(page);
        await revBtn.evaluate((btn) => {
          btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          btn.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, cancelable: true }));
        });
        await page.waitForTimeout(80);
        const aborted = await getTelemetry(page);
        assertEqual(aborted.audio.throttle, 0, 'throttle after pointercancel');

        await revBtn.evaluate((btn) => {
          btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
          window.dispatchEvent(new Event('blur'));
        });
        await page.waitForTimeout(80);
        const blurred = await getTelemetry(page);
        assertEqual(blurred.audio.throttle, 0, 'throttle after window blur');
      }),
  });

  runner.add({
    id: 'T2-REV-05',
    tier: 2,
    feature: '#8 Spacebar Scope',
    name: 'Space in CH 01-05 does not rev; Space in CH 06 does not scroll page',
    fn: async () =>
      withPage({}, async (page) => {
        await getEnableSoundButton(page).click();
        await scrollToProgress(page, CH_MIDPOINTS['04']);
        await page.keyboard.down('Space');
        await page.waitForTimeout(300);
        const ch4 = await getTelemetry(page);
        await page.keyboard.up('Space');
        assertEqual(ch4.audio.throttle, 0, 'Space must not throttle in CH 04');

        await scrollToProgress(page, CH_MIDPOINTS['06']);
        const yBefore = await page.evaluate(() => window.scrollY);
        await page.keyboard.down('Space');
        await page.waitForTimeout(300);
        await page.keyboard.up('Space');
        const yAfter = await page.evaluate(() => window.scrollY);
        assert(Math.abs(yAfter - yBefore) < 5, `Space scrolled page in CH 06 (${yBefore} -> ${yAfter})`);
      }),
  });

  runner.add({
    id: 'T2-AST-01',
    tier: 2,
    feature: '#3 Vite HTML Trap (GLB)',
    name: '200-OK text/html response for defender.glb activates fallback model without crashing',
    fn: async () =>
      withPage(
        {
          setupRoutes: async (page) => {
            await page.route('**/assets/model/**', (route) =>
              route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><body>SPA</body></html>' })
            );
          },
        },
        async (page, audit) => {
          const t = await getTelemetry(page);
          assertEqual(t.scene.isFallbackModel, true, 'isFallbackModel on 200-HTML GLB');
          assert(audit.warnings.length >= 1, 'Expected console.warn on 200-HTML GLB trap');
        }
      ),
  });

  runner.add({
    id: 'T2-AST-02',
    tier: 2,
    feature: '#3 Vite HTML Trap (HDR)',
    name: '200-OK text/html response for HDR activates fallback environment without crashing',
    fn: async () =>
      withPage(
        {
          setupRoutes: async (page) => {
            await page.route('**/assets/hdr/**', (route) =>
              route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><body>SPA</body></html>' })
            );
          },
        },
        async (page, audit) => {
          const t = await getTelemetry(page);
          assertEqual(t.scene.isFallbackEnv, true, 'isFallbackEnv on 200-HTML HDR');
          assert(audit.warnings.length >= 1, 'Expected console.warn on 200-HTML HDR trap');
        }
      ),
  });

  runner.add({
    id: 'T2-AST-03',
    tier: 2,
    feature: '#3 Corrupt GLB Guard',
    name: 'Corrupt binary GLB falls back cleanly to procedural Defender with console.warn',
    fn: async () =>
      withPage(
        {
          setupRoutes: async (page) => {
            await page.route('**/assets/model/**', (route) =>
              route.fulfill({ status: 200, contentType: 'model/gltf-binary', body: Buffer.from([0x00, 0xff, 0x00, 0xff, 0xde, 0xad]) })
            );
          },
        },
        async (page, audit) => {
          const t = await getTelemetry(page);
          assertEqual(t.scene.isFallbackModel, true, 'isFallbackModel on corrupt GLB');
          assert(audit.warnings.length >= 1, 'Expected console.warn on corrupt GLB');
        }
      ),
  });

  runner.add({
    id: 'T2-AST-04',
    tier: 2,
    feature: '#6 Vite HTML Trap (Audio)',
    name: '200-OK text/html response for WAV falls back to procedural V8 synth cleanly',
    fn: async () =>
      withPage(
        {
          setupRoutes: async (page) => {
            await page.route('**/assets/audio/**', (route) =>
              route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><body>SPA</body></html>' })
            );
          },
        },
        async (page, audit) => {
          await getEnableSoundButton(page).click();
          await page.waitForTimeout(250);
          const t = await getTelemetry(page);
          assertEqual(t.audio.mode, 'procedural', 'audio.mode on 200-HTML WAV');
          assert(audit.warnings.length >= 1, 'Expected console.warn on 200-HTML WAV trap');
        }
      ),
  });

  runner.add({
    id: 'T2-AST-05',
    tier: 2,
    feature: '#6 Pre-Unlock Silence',
    name: 'Scrolling CH 01->06 before sound unlock issues zero /assets/audio requests',
    fn: async () =>
      withPage({}, async (page, audit) => {
        for (const p of [0.2, 0.55, 0.92]) {
          await scrollToProgress(page, p, { minSettleMs: 350 });
        }
        assertEqual(audit.audioRequests.length, 0, 'Pre-unlock audio requests');
      }),
  });

  runner.add({
    id: 'T2-RSP-01',
    tier: 2,
    feature: '#7 Live Resize',
    name: 'Resizing desktop -> mobile -> desktop adapts viewport flag and keeps zero overflow',
    fn: async () =>
      withPage({ viewport: { width: 1440, height: 900 } }, async (page) => {
        const d1 = await getTelemetry(page);
        assertEqual(d1.scene.viewport.isMobile, false, 'desktop isMobile');

        await page.setViewportSize({ width: 375, height: 812 });
        await page.waitForTimeout(250);
        const m = await getTelemetry(page);
        assertEqual(m.scene.viewport.isMobile, true, 'mobile isMobile');
        const ov = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        assert(ov, 'Horizontal overflow after resize to 375x812');

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(250);
        const d2 = await getTelemetry(page);
        assertEqual(d2.scene.viewport.isMobile, false, 'restored desktop isMobile');
      }),
  });

  runner.add({
    id: 'T2-RSP-02',
    tier: 2,
    feature: '#7 Extreme Viewports',
    name: 'Small mobile 320x568 and wide 1920x1080 render without horizontal overflow',
    fn: async () => {
      await withPage({ viewport: { width: 320, height: 568 }, hasTouch: true }, async (page) => {
        const ov = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        assert(ov, 'Horizontal overflow at 320x568');
      });
      await withPage({ viewport: { width: 1920, height: 1080 } }, async (page) => {
        const ov = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        assert(ov, 'Horizontal overflow at 1920x1080');
      });
    },
  });

  runner.add({
    id: 'T2-RSP-03',
    tier: 2,
    feature: '#5 High-DPR Cap',
    name: 'deviceScaleFactor=3 enforces pixelRatio <= 2',
    fn: async () =>
      withPage({ deviceScaleFactor: 3 }, async (page) => {
        const t = await getTelemetry(page);
        assert(t.scene.pixelRatio <= 2, `pixelRatio exceeded cap 2: ${t.scene.pixelRatio}`);
      }),
  });

  runner.add({
    id: 'T2-RSP-04',
    tier: 2,
    feature: '#9 Live Reduced-Motion Toggle',
    name: 'Toggling prefers-reduced-motion mid-session zeros shake amplitude',
    fn: async () =>
      withPage({}, async (page) => {
        await scrollToProgress(page, CH_MIDPOINTS['04']);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.waitForTimeout(250);
        const t = await getTelemetry(page);
        assertEqual(t.rig.reducedMotion, true, 'rig.reducedMotion after emulateMedia');
        assertEqual(t.scene.activeShakeAmplitude, 0, 'activeShakeAmplitude after emulateMedia');
      }),
  });

  runner.add({
    id: 'T2-RSP-05',
    tier: 2,
    feature: '#8 Idempotent Sound & Modal Esc',
    name: 'Double-clicking Enable sound and closing licensing modal with Escape leave clean state',
    fn: async () =>
      withPage({}, async (page) => {
        const soundBtn = getEnableSoundButton(page);
        await soundBtn.click();
        await soundBtn.click();
        await page.waitForTimeout(150);
        const t = await getTelemetry(page);
        assertEqual(t.audio.isUnlocked, true, 'isUnlocked');

        await getLicensingTrigger(page).click();
        const modal = getLicensingModal(page);
        await modal.waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
        await modal.waitFor({ state: 'hidden' });
      }),
  });

  runner.add({
    id: 'T2-VFX-01',
    tier: 2,
    feature: '#2 Desktop vs Mobile FOV',
    name: 'Mobile framing uses adapted FOV compared to desktop in CH 01 and CH 06',
    fn: async () => {
      let deskCh1 = 0;
      let deskCh6 = 0;
      let mobCh1 = 0;
      let mobCh6 = 0;
      await withPage({ viewport: { width: 1440, height: 900 } }, async (page) => {
        deskCh1 = (await scrollToProgress(page, 0.0, { minSettleMs: 350 })).rig.fov;
        deskCh6 = (await scrollToProgress(page, CH_MIDPOINTS['06'])).rig.fov;
      });
      await withPage({ viewport: { width: 375, height: 812 }, hasTouch: true }, async (page) => {
        mobCh1 = (await scrollToProgress(page, 0.0, { minSettleMs: 350 })).rig.fov;
        mobCh6 = (await scrollToProgress(page, CH_MIDPOINTS['06'])).rig.fov;
      });
      assert(mobCh1 > deskCh1, `Expected wider mobile CH01 FOV (${mobCh1}) than desktop (${deskCh1})`);
      assert(mobCh6 > deskCh6, `Expected wider mobile CH06 FOV (${mobCh6}) than desktop (${deskCh6})`);
    },
  });

  runner.add({
    id: 'T2-VFX-02',
    tier: 2,
    feature: '#5 Exhaust Glow Range',
    name: 'exhaustGlow stays low in CH 01-05 and peaks in CH 06 rev',
    fn: async () =>
      withPage({}, async (page) => {
        const ch1 = await scrollToProgress(page, CH_MIDPOINTS['01']);
        const ch4 = await scrollToProgress(page, CH_MIDPOINTS['04']);
        await scrollToProgress(page, CH_MIDPOINTS['06']);
        const { samples } = await holdRevAndSample(page, { durationMs: 2400 });
        const maxGlow = Math.max(...samples.map((s) => s.scene.exhaustGlow));
        assert(ch1.scene.exhaustGlow <= 0.35, `CH01 exhaustGlow=${ch1.scene.exhaustGlow}`);
        assert(maxGlow > ch4.scene.exhaustGlow, `Peak glow (${maxGlow}) should exceed CH04 (${ch4.scene.exhaustGlow})`);
      }),
  });

  runner.add({
    id: 'T2-VFX-03',
    tier: 2,
    feature: '#5 Bonnet Rattle Scope',
    name: 'bonnetRattleActive is false in CH 01-03 and under reducedMotion',
    fn: async () => {
      await withPage({}, async (page) => {
        const ch1 = await scrollToProgress(page, CH_MIDPOINTS['01']);
        assertEqual(ch1.scene.bonnetRattleActive, false, 'CH01 bonnetRattleActive');
      });
      await withPage({ reducedMotion: 'reduce' }, async (page) => {
        const ch4 = await scrollToProgress(page, CH_MIDPOINTS['04']);
        assertEqual(ch4.scene.bonnetRattleActive, false, 'CH04 bonnetRattleActive under reducedMotion');
      });
    },
  });

  runner.add({
    id: 'T2-VFX-04',
    tier: 2,
    feature: '#5 Shake Amplitude Bounds',
    name: 'activeShakeAmplitude is 0 in CH 01-03 and > 0 during CH 06 active rev',
    fn: async () =>
      withPage({}, async (page) => {
        const ch1 = await scrollToProgress(page, CH_MIDPOINTS['01']);
        assertEqual(ch1.scene.activeShakeAmplitude, 0, 'CH01 shake');
        await scrollToProgress(page, CH_MIDPOINTS['06']);
        const { samples } = await holdRevAndSample(page, { durationMs: 2200 });
        const maxShake = Math.max(...samples.map((s) => s.scene.activeShakeAmplitude));
        assert(maxShake > 0, 'Expected activeShakeAmplitude > 0 during CH06 rev');
      }),
  });

  runner.add({
    id: 'T2-VFX-05',
    tier: 2,
    feature: '#4 Door Angle Bounds',
    name: 'doorAngle remains cleanly clamped within [-1.25, 0.05] rad across all chapters',
    fn: async () =>
      withPage({}, async (page) => {
        for (const p of [0, 0.19, 0.27, 0.34, 0.5, 0.67, 0.83, 1.0]) {
          const t = await scrollToProgress(page, p, { minSettleMs: 300 });
          assertRange(t.rig.doorAngle, -1.25, 0.05, `doorAngle at ${p}`);
        }
      }),
  });

  // ======================== TIER 3: PAIRWISE COMBINATIONS ========================
  runner.add({
    id: 'T3-CMB-01',
    tier: 3,
    feature: '#6+#9 Scroll + Audio Mix',
    name: 'Audio unlock at Hero + CH 03-04 cockpit mix + CH 05-06 exterior mix + reverse',
    fn: async () =>
      withPage({}, async (page) => {
        await getEnableSoundButton(page).click();
        const ch4 = await scrollToProgress(page, CH_MIDPOINTS['04']);
        assert(ch4.audio.isRunning && ch4.audio.mix >= 0.75, `CH04: ${JSON.stringify(ch4.audio)}`);
        const ch6 = await scrollToProgress(page, CH_MIDPOINTS['06']);
        assert(ch6.audio.mix <= 0.25, `CH06 mix=${ch6.audio.mix}`);
        const ch3 = await scrollToProgress(page, CH_MIDPOINTS['03']);
        assert(ch3.audio.mix >= 0.75, `Reverse CH03 mix=${ch3.audio.mix}`);
      }),
  });

  runner.add({
    id: 'T3-CMB-02',
    tier: 3,
    feature: '#5+#6+#8 CH06 Rev Telemetry + HUD + VFX',
    name: 'CH 06 rev simultaneously drives RPM readout, SVG arc offset, exhaustGlow, and camera shake',
    fn: async () =>
      withPage({}, async (page) => {
        await getEnableSoundButton(page).click();
        await scrollToProgress(page, CH_MIDPOINTS['06']);
        const arcBefore = Number(await getRevArc(page).getAttribute('stroke-dashoffset'));
        const { maxRPM, samples } = await holdRevAndSample(page, { durationMs: 3000 });
        const readout = (await getRevReadout(page).textContent()) || '';
        const arcDuring = Number(await getRevArc(page).getAttribute('stroke-dashoffset'));
        const maxGlow = Math.max(...samples.map((s) => s.scene.exhaustGlow));
        const maxShake = Math.max(...samples.map((s) => s.scene.activeShakeAmplitude));

        assert(maxRPM >= 6850, `maxRPM=${maxRPM}`);
        assert(/\d{3,4}/.test(readout), `Invalid readout: ${readout}`);
        if (Number.isFinite(arcBefore) && Number.isFinite(arcDuring)) {
          assert(arcDuring < arcBefore, `Expected SVG arc dashoffset to fill (${arcBefore} -> ${arcDuring})`);
        }
        assert(maxGlow > 0.3 && maxShake > 0, `VFX inactive: glow=${maxGlow}, shake=${maxShake}`);
      }),
  });

  runner.add({
    id: 'T3-CMB-03',
    tier: 3,
    feature: '#7+#8+#9 Mobile + Touch Rev + FOV',
    name: 'Mobile 375x812 touch scroll + adapted FOV + touch rev + zero overflow',
    fn: async () =>
      withPage({ viewport: { width: 375, height: 812 }, hasTouch: true }, async (page) => {
        await getEnableSoundButton(page).tap();
        for (const id of ['01', '03', '06']) {
          await scrollToProgress(page, CH_MIDPOINTS[id]);
          const ov = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
          assert(ov, `Overflow at mobile CH ${id}`);
        }
        const ch6 = await getTelemetry(page);
        assert(ch6.rig.fov >= 44, `Expected adapted mobile FOV >= 44, got ${ch6.rig.fov}`);
        const { maxRPM } = await holdRevAndSample(page, { durationMs: 2800, method: 'touch' });
        assert(maxRPM >= 6850, `Mobile touch rev maxRPM=${maxRPM}`);
      }),
  });

  runner.add({
    id: 'T3-CMB-04',
    tier: 3,
    feature: '#5+#7+#9 Reduced Motion Full Flow',
    name: 'Reduced-motion full scroll + CH 04 idle + CH 06 rev without shake/rattle',
    fn: async () =>
      withPage({ reducedMotion: 'reduce' }, async (page) => {
        await getEnableSoundButton(page).click();
        const ch4 = await scrollToProgress(page, CH_MIDPOINTS['04']);
        assertEqual(ch4.scene.activeShakeAmplitude, 0, 'CH04 shake');
        assertEqual(ch4.scene.bonnetRattleActive, false, 'CH04 bonnetRattle');
        await scrollToProgress(page, CH_MIDPOINTS['06']);
        const { maxRPM, samples } = await holdRevAndSample(page, { durationMs: 2800 });
        assert(maxRPM >= 6850, `Reduced-motion rev maxRPM=${maxRPM}`);
        assert(samples.every((s) => s.scene.activeShakeAmplitude === 0), 'Shake stayed 0');
      }),
  });

  runner.add({
    id: 'T3-CMB-05',
    tier: 3,
    feature: '#8+#9 Rail Click-to-Scroll Sync',
    name: 'Progress rail clicks sync Lenis, ScrollTrigger, 3D rig, and HUD',
    fn: async () =>
      withPage({}, async (page) => {
        await getRailButton(page, '03').click();
        const ch3 = await waitForChapterSettle(page, '03');
        assertEqual(ch3.chapter.id, '03', 'rail 03 chapter');
        assert(ch3.rig.cockpitMix >= 0.65, `rail 03 cockpitMix=${ch3.rig.cockpitMix}`);

        await getRailButton(page, '06').click();
        const ch6 = await waitForChapterSettle(page, '06');
        assertEqual(ch6.chapter.id, '06', 'rail 06 chapter');
        assertEqual(ch6.rig.revActive, true, 'rail 06 revActive');
        assertEqual(ch6.rig.gaugeVisible, false, 'rail 06 gaugeVisible');

        await getRailButton(page, '01').click();
        const ch1 = await waitForChapterSettle(page, '01');
        assertEqual(ch1.chapter.id, '01', 'rail 01 chapter');
        assertEqual(ch1.rig.revActive, false, 'rail 01 revActive');
      }),
  });

  runner.add({
    id: 'T3-CMB-06',
    tier: 3,
    feature: '#4+#6+#9 Ignition + Reverse Stop',
    name: 'CH 04 ignition engages idle & gauge; reversing to CH 02 stops engine & opens door',
    fn: async () =>
      withPage({}, async (page) => {
        await getEnableSoundButton(page).click();
        await scrollToProgress(page, 0.48);
        const ch4 = await scrollToProgress(page, 0.59);
        assertEqual(ch4.rig.gaugeVisible, true, 'CH04 gaugeVisible');
        assertEqual(ch4.audio.isRunning, true, 'CH04 isRunning');

        const ch2 = await scrollToProgress(page, CH_MIDPOINTS['02']);
        assertEqual(ch2.audio.isRunning, false, 'CH02 reverse isRunning');
        assertEqual(ch2.rig.gaugeVisible, false, 'CH02 reverse gaugeVisible');
        assert(ch2.rig.doorAngle <= -0.95, `CH02 reverse doorAngle=${ch2.rig.doorAngle}`);
      }),
  });

  runner.add({
    id: 'T3-CMB-07',
    tier: 3,
    feature: '#4+#9 Door Open + Light + Reverse Close',
    name: 'CH 02 door opens with interior light; reverse scroll to CH 01 closes door',
    fn: async () =>
      withPage({}, async (page) => {
        const ch2 = await scrollToProgress(page, CH_MIDPOINTS['02']);
        assert(ch2.rig.doorAngle <= -0.95 && ch2.rig.interiorLight >= 0.65, `CH02: ${JSON.stringify(ch2.rig)}`);
        const ch1 = await scrollToProgress(page, 0.05);
        assert(Math.abs(ch1.rig.doorAngle) <= 0.15, `CH01 reverse doorAngle=${ch1.rig.doorAngle}`);
      }),
  });

  runner.add({
    id: 'T3-CMB-08',
    tier: 3,
    feature: '#3+#4+#5 Fallback Full Scroll + Teardown',
    name: 'Fallback Defender + studio mist survive full forward/reverse scroll and clean close',
    fn: async () =>
      withPage({}, async (page) => {
        const t0 = await getTelemetry(page);
        assertEqual(t0.scene.isFallbackModel, true, 'isFallbackModel');
        assertEqual(t0.scene.isFallbackEnv, true, 'isFallbackEnv');
        await scrollToProgress(page, 0.96);
        await scrollToProgress(page, 0.0);
        await page.goto('about:blank');
      }),
  });

  runner.add({
    id: 'T3-CMB-09',
    tier: 3,
    feature: '#6+#8 Late Audio Unlock + Space Rev + Modal',
    name: 'Silent scroll to CH 06 -> late sound unlock -> Space rev -> licensing modal',
    fn: async () =>
      withPage({}, async (page, audit) => {
        await scrollToProgress(page, CH_MIDPOINTS['06']);
        assertEqual(audit.audioRequests.length, 0, 'No pre-unlock audio requests');
        await getEnableSoundButton(page).click();
        await page.waitForTimeout(200);
        const { maxRPM } = await holdRevAndSample(page, { durationMs: 2800, method: 'space' });
        assert(maxRPM >= 6850, `Late Space rev maxRPM=${maxRPM}`);
        await getLicensingTrigger(page).click();
        await getLicensingModal(page).waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
      }),
  });

  // ======================== TIER 4: REAL-WORLD SCENARIOS ========================
  runner.add({
    id: 'T4-SCN-01',
    tier: 4,
    feature: '#10 Full Desktop Journey',
    name: 'Complete desktop visitor journey CH 01->06->rev->modal->reverse CH 01',
    fn: async () =>
      withPage({}, async (page) => {
        await getHeroTitle(page).waitFor({ state: 'visible' });
        await getEnableSoundButton(page).click();
        for (const id of ['01', '02', '03', '04', '05', '06']) {
          const t = await scrollToProgress(page, CH_MIDPOINTS[id]);
          assertEqual(t.chapter.id, id, `Forward step ${id}`);
        }
        const { maxRPM } = await holdRevAndSample(page, { durationMs: 3100 });
        assert(maxRPM >= 6850, `Journey rev maxRPM=${maxRPM}`);
        await page.waitForTimeout(2000);
        await getLicensingTrigger(page).click();
        await getLicensingModal(page).waitFor({ state: 'visible' });
        await getLicensingClose(page).click();
        const rev1 = await scrollToProgress(page, 0.02);
        assertEqual(rev1.chapter.id, '01', 'Return to CH 01');
      }),
  });

  runner.add({
    id: 'T4-SCN-02',
    tier: 4,
    feature: '#11 Rubric Screenshot Suite',
    name: 'Capture 10 deterministic PNG screenshots across Hero, CH 01-06, active rev, and mobile',
    fn: async () => {
      const desktopShots = [
        { name: '00-hero', progress: 0.0, chapter: '01' },
        { name: '01-ch01-approach', progress: 0.14, chapter: '01' },
        { name: '02-ch02-door-opens', progress: 0.32, chapter: '02' },
        { name: '03-ch03-seated', progress: 0.49, chapter: '03' },
        { name: '04-ch04-engine-starts', progress: 0.63, chapter: '04' },
        { name: '05-ch05-get-out', progress: 0.79, chapter: '05' },
        { name: '06-ch06-rear-view', progress: 0.94, chapter: '06' },
      ];

      await withPage({ viewport: { width: 1440, height: 900 } }, async (page) => {
        await getEnableSoundButton(page).click();
        for (const s of desktopShots) {
          await scrollToProgress(page, s.progress);
          const filePath = path.join(screenshotsDir, `${s.name}.png`);
          const buf = await page.screenshot({ path: filePath });
          assert(buf.length > 1000, `Screenshot ${s.name} too small`);
          screenshots.push({
            name: s.name,
            chapter: s.chapter,
            viewport: '1440x900',
            path: path.relative(rootDir, filePath).replace(/\\/g, '/'),
            bytes: buf.length,
          });
        }

        // 07-ch06-rev-active.png captured while rev is actively held near redline
        await scrollToProgress(page, 0.95);
        const btn = getRevButton(page);
        await btn.waitFor({ state: 'visible', timeout: 5000 });
        const box = await btn.boundingBox();
        assert(box, 'Rev button has no bounding box in T4-SCN-02');
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        try {
          await page.waitForFunction(() => window.__DEFENDER_APP__.getAudioState().rpm >= 6500, null, { timeout: 5000 });
          const activePath = path.join(screenshotsDir, '07-ch06-rev-active.png');
          const buf = await page.screenshot({ path: activePath });
          assert(buf.length > 1000, '07-ch06-rev-active.png too small');
          screenshots.push({
            name: '07-ch06-rev-active',
            chapter: '06',
            viewport: '1440x900',
            path: path.relative(rootDir, activePath).replace(/\\/g, '/'),
            bytes: buf.length,
          });
        } finally {
          await page.mouse.up();
        }
      });

      await withPage({ viewport: { width: 375, height: 812 }, hasTouch: true }, async (page) => {
        for (const s of [
          { name: '08-mobile-hero', progress: 0.0, chapter: '01' },
          { name: '09-mobile-ch06', progress: 0.95, chapter: '06' },
        ]) {
          await scrollToProgress(page, s.progress);
          const filePath = path.join(screenshotsDir, `${s.name}.png`);
          const buf = await page.screenshot({ path: filePath });
          assert(buf.length > 1000, `Screenshot ${s.name} too small`);
          screenshots.push({
            name: s.name,
            chapter: s.chapter,
            viewport: '375x812',
            path: path.relative(rootDir, filePath).replace(/\\/g, '/'),
            bytes: buf.length,
          });
        }
      });

      return { metrics: { screenshotCount: screenshots.length } };
    },
  });

  runner.add({
    id: 'T4-SCN-03',
    tier: 4,
    feature: '#6 Silent Explorer',
    name: 'Silent visitor scrolls CH 01->06 with 0 audio requests, unlocks at CH 06, Space revs',
    fn: async () =>
      withPage({}, async (page, audit) => {
        await scrollToProgress(page, CH_MIDPOINTS['06']);
        assertEqual(audit.audioRequests.length, 0, 'Zero audio requests before unlock');
        await getEnableSoundButton(page).click();
        await page.waitForTimeout(200);
        const { maxRPM } = await holdRevAndSample(page, { durationMs: 2800, method: 'space' });
        assert(maxRPM >= 6850, `Silent explorer late rev maxRPM=${maxRPM}`);
      }),
  });

  runner.add({
    id: 'T4-SCN-04',
    tier: 4,
    feature: '#7+#8 Mobile Visitor Journey',
    name: 'Mobile 390x844 visitor unlocks sound, navigates CH 01->06, touch-revs without overflow',
    fn: async () =>
      withPage({ viewport: { width: 390, height: 844 }, hasTouch: true }, async (page) => {
        await getEnableSoundButton(page).tap();
        await scrollToProgress(page, CH_MIDPOINTS['06']);
        const ov = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        assert(ov, 'Mobile 390x844 horizontal overflow');
        const { maxRPM } = await holdRevAndSample(page, { durationMs: 2800, method: 'touch' });
        assert(maxRPM >= 6850, `Mobile visitor rev maxRPM=${maxRPM}`);
      }),
  });

  runner.add({
    id: 'T4-SCN-05',
    tier: 4,
    feature: '#7+#8 Keyboard Accessibility',
    name: 'Reduced-motion keyboard-only journey across rail, sound, modal, and Space rev',
    fn: async () =>
      withPage({ reducedMotion: 'reduce' }, async (page) => {
        await getEnableSoundButton(page).focus();
        await page.keyboard.press('Enter');
        await getRailButton(page, '06').focus();
        await page.keyboard.press('Enter');
        await waitForChapterSettle(page, '06');
        const { maxRPM, samples } = await holdRevAndSample(page, { durationMs: 2800, method: 'space' });
        assert(maxRPM >= 6850, `Keyboard Space rev maxRPM=${maxRPM}`);
        assert(samples.every((s) => s.scene.activeShakeAmplitude === 0), 'Shake disabled under reducedMotion');

        await getLicensingTrigger(page).focus();
        await page.keyboard.press('Enter');
        await getLicensingModal(page).waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
        await getLicensingModal(page).waitFor({ state: 'hidden' });
      }),
  });

  try {
    const result = await runner.run({ tiers, ids, onResult });
    return {
      ...result,
      tiers: summarizeByTier(result.checks),
      environment: {
        node: process.version,
        platform: process.platform,
        browser: browserLabel,
        webglRenderer,
      },
      screenshots,
      consoleAudit,
    };
  } finally {
    await closeBrowser();
    if (mockServer) {
      await mockServer.close();
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const outDir = args.out ? path.resolve(rootDir, args.out) : path.join(rootDir, 'tests', 'artifacts');
  const out = await runE2ESuite({
    url: args.url,
    rootDir,
    outDir,
    tiers: args.tiers,
    ids: args.ids,
    headed: args.headed,
    mock: args.mock,
    onResult: (c) => console.log(`[${c.status}] ${c.id}: ${c.name} (${c.durationMs}ms)${c.error ? ' -> ' + c.error : ''}`),
  });
  console.log(`E2E Summary: ${out.summary.passed}/${out.summary.total} PASS, ${out.summary.failed} FAIL`);
  process.exit(out.summary.failed === 0 ? 0 : 1);
}
