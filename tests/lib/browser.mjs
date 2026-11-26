import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const SWIFTSHADER_WEBGL_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--disable-gpu-sandbox',
];

export async function resolvePlaywright(rootDir = process.cwd()) {
  const pkgPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const req = createRequire(pkgPath);
      const resolved = req.resolve('playwright');
      const mod = await import(pathToFileURL(resolved).href);
      return mod.default || mod;
    } catch {
      // Fallback to standard ESM resolution (e.g., ancestor node_modules)
    }
  }
  const mod = await import('playwright');
  return mod.default || mod;
}

function findCachedPlaywrightChromium() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;
  const msPlaywrightDir = path.join(localAppData, 'ms-playwright');
  if (!fs.existsSync(msPlaywrightDir)) return null;

  let entries = [];
  try {
    entries = fs.readdirSync(msPlaywrightDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const mFull = /^chromium-(\d+)$/.exec(entry.name);
    if (mFull) {
      const rev = Number(mFull[1]);
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe']) {
        const p = path.join(msPlaywrightDir, entry.name, rel);
        if (fs.existsSync(p)) {
          candidates.push({ rev, path: p, kind: 'chromium' });
        }
      }
    }
    const mHeadless = /^chromium_headless_shell-(\d+)$/.exec(entry.name);
    if (mHeadless) {
      const rev = Number(mHeadless[1]);
      const p = path.join(msPlaywrightDir, entry.name, 'chrome-headless-shell-win64/chrome-headless-shell.exe');
      if (fs.existsSync(p)) {
        candidates.push({ rev, path: p, kind: 'headless_shell' });
      }
    }
  }

  candidates.sort((a, b) => b.rev - a.rev || (a.kind === 'chromium' ? -1 : 1));
  return candidates.length > 0 ? candidates[0].path : null;
}

export function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function findEdgeExecutable() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function buildChromiumLaunchStrategies(chromium) {
  const strategies = [];

  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && fs.existsSync(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH)) {
    strategies.push({
      label: `env PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH (${process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH})`,
      options: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    });
  }

  try {
    const defaultPath = chromium.executablePath();
    if (defaultPath && fs.existsSync(defaultPath)) {
      strategies.push({
        label: `playwright default (${defaultPath})`,
        options: { executablePath: defaultPath },
      });
    }
  } catch {
    // Ignore if executablePath() throws
  }

  const chromePath = findChromeExecutable();
  if (chromePath) {
    const useExecPath = process.env.CHROME_PATH && chromePath === process.env.CHROME_PATH;
    strategies.push({
      label: `chrome (${chromePath})`,
      options: useExecPath ? { executablePath: chromePath } : { channel: 'chrome' },
    });
  }

  const edgePath = findEdgeExecutable();
  if (edgePath) {
    strategies.push({
      label: `msedge (${edgePath})`,
      options: { channel: 'msedge' },
    });
  }

  const cachedPath = findCachedPlaywrightChromium();
  if (cachedPath) {
    strategies.push({
      label: `cached ms-playwright (${cachedPath})`,
      options: { executablePath: cachedPath },
    });
  }

  if (strategies.length === 0) {
    strategies.push({
      label: 'playwright fallback default',
      options: {},
    });
  }

  return strategies;
}

export async function launchBrowser(rootDir = process.cwd(), { headless = true, extraArgs = [] } = {}) {
  const playwright = await resolvePlaywright(rootDir);
  const { chromium } = playwright;
  const strategies = buildChromiumLaunchStrategies(chromium);

  // IMPORTANT: Never include --autoplay-policy=no-user-gesture-required;
  // tests must prove Web Audio unlocks strictly on user gesture.
  const args = [...SWIFTSHADER_WEBGL_ARGS, ...extraArgs];
  let lastError = null;

  for (const strategy of strategies) {
    try {
      const browser = await chromium.launch({
        headless,
        args,
        ...strategy.options,
      });
      return {
        playwright,
        browser,
        browserLabel: strategy.label,
        close: async () => {
          try {
            await browser.close();
          } catch {
            // Ignore close errors
          }
        },
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`Failed to launch Chromium via all fallback strategies. Last error: ${lastError?.message || lastError}`);
}
