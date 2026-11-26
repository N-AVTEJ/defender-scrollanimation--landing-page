import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, assert } from './lib/runner.mjs';
import { findChromeExecutable, findEdgeExecutable, SWIFTSHADER_WEBGL_ARGS } from './lib/browser.mjs';

async function resolvePackageEsm(pkgName, rootDir) {
  const pkgJson = path.join(rootDir, 'package.json');
  if (fs.existsSync(pkgJson)) {
    try {
      const req = createRequire(pkgJson);
      const resolved = req.resolve(pkgName);
      const mod = await import(pathToFileURL(resolved).href);
      return mod.default || mod;
    } catch {
      // Fallback to standard resolution
    }
  }
  const mod = await import(pkgName);
  return mod.default || mod;
}

export function evaluateLighthouseMetrics(metrics) {
  assert(
    typeof metrics.performance === 'number' && metrics.performance > 0.85,
    `Lighthouse Performance must be > 0.85, got ${metrics.performance}`
  );
  assert(
    typeof metrics.cls === 'number' && metrics.cls <= 0.1,
    `Lighthouse CLS must be <= 0.1, got ${metrics.cls}`
  );
  return true;
}

export async function runLighthouseAudit({
  url,
  rootDir = process.cwd(),
  outDir = path.join(rootDir, 'tests', 'artifacts'),
  mock = false,
} = {}) {
  await fsp.mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'lighthouse-report.json');
  const htmlPath = path.join(outDir, 'lighthouse-report.html');

  if (mock) {
    const mockReport = {
      lighthouseVersion: 'mock-13.6.0',
      requestedUrl: url || 'http://127.0.0.1:0',
      finalDisplayedUrl: url || 'http://127.0.0.1:0',
      categories: {
        performance: { score: 0.94 },
        accessibility: { score: 0.98 },
        'best-practices': { score: 0.96 },
      },
      audits: {
        'cumulative-layout-shift': { numericValue: 0.004 },
        'largest-contentful-paint': { numericValue: 1320 },
        'total-blocking-time': { numericValue: 45 },
        'first-contentful-paint': { numericValue: 640 },
      },
    };
    const summary = {
      status: 'PASS',
      mock: true,
      performance: mockReport.categories.performance.score,
      accessibility: mockReport.categories.accessibility.score,
      bestPractices: mockReport.categories['best-practices'].score,
      cls: mockReport.audits['cumulative-layout-shift'].numericValue,
      lcpMs: mockReport.audits['largest-contentful-paint'].numericValue,
      tbtMs: mockReport.audits['total-blocking-time'].numericValue,
      fcpMs: mockReport.audits['first-contentful-paint'].numericValue,
      reportJsonPath: path.relative(rootDir, jsonPath).replace(/\\/g, '/'),
      reportHtmlPath: path.relative(rootDir, htmlPath).replace(/\\/g, '/'),
    };
    evaluateLighthouseMetrics(summary);
    await fsp.writeFile(jsonPath, JSON.stringify(mockReport, null, 2), 'utf8');
    await fsp.writeFile(
      htmlPath,
      `<!doctype html><meta charset="utf-8"><title>Mock Lighthouse Report</title><pre>${JSON.stringify(summary, null, 2)}</pre>`,
      'utf8'
    );
    return summary;
  }

  assert(url, 'runLighthouseAudit requires --url=<target> when not in --mock mode');

  const lighthouse = await resolvePackageEsm('lighthouse', rootDir);
  const chromeLauncher = await resolvePackageEsm('chrome-launcher', rootDir);

  const chromePath = findChromeExecutable() || findEdgeExecutable();
  const chromeFlags = [
    '--headless=new',
    '--no-sandbox',
    ...SWIFTSHADER_WEBGL_ARGS,
  ];

  const launchOpts = { chromeFlags };
  if (chromePath) {
    launchOpts.chromePath = chromePath;
  }

  const chrome = await chromeLauncher.launch(launchOpts);
  try {
    const runnerResult = await lighthouse(url, {
      port: chrome.port,
      output: ['json', 'html'],
      onlyCategories: ['performance', 'accessibility', 'best-practices'],
      logLevel: 'error',
    });

    const [jsonReport, htmlReport] = Array.isArray(runnerResult.report)
      ? runnerResult.report
      : [JSON.stringify(runnerResult.lhr, null, 2), ''];

    await fsp.writeFile(jsonPath, jsonReport, 'utf8');
    if (htmlReport) {
      await fsp.writeFile(htmlPath, htmlReport, 'utf8');
    }

    const lhr = runnerResult.lhr;
    const summary = {
      status: 'PASS',
      mock: false,
      performance: Number((lhr.categories?.performance?.score ?? 0).toFixed(3)),
      accessibility: Number((lhr.categories?.accessibility?.score ?? 0).toFixed(3)),
      bestPractices: Number((lhr.categories?.['best-practices']?.score ?? 0).toFixed(3)),
      cls: Number((lhr.audits?.['cumulative-layout-shift']?.numericValue ?? 1).toFixed(4)),
      lcpMs: Math.round(lhr.audits?.['largest-contentful-paint']?.numericValue ?? 0),
      tbtMs: Math.round(lhr.audits?.['total-blocking-time']?.numericValue ?? 0),
      fcpMs: Math.round(lhr.audits?.['first-contentful-paint']?.numericValue ?? 0),
      reportJsonPath: path.relative(rootDir, jsonPath).replace(/\\/g, '/'),
      reportHtmlPath: path.relative(rootDir, htmlPath).replace(/\\/g, '/'),
    };

    try {
      evaluateLighthouseMetrics(summary);
    } catch (err) {
      summary.status = 'FAIL';
      summary.error = err.message;
    }
    return summary;
  } finally {
    try {
      await chrome.kill();
    } catch {
      // Ignore cleanup race
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const outDir = args.out ? path.resolve(rootDir, args.out) : path.join(rootDir, 'tests', 'artifacts');
  const res = await runLighthouseAudit({
    url: args.url,
    rootDir,
    outDir,
    mock: args.mock,
  });
  console.log(`[${res.status}] T4-SCN-06 Lighthouse: perf=${res.performance}, cls=${res.cls}, lcpMs=${res.lcpMs}`);
  if (res.status !== 'PASS') {
    console.error(res.error || 'Lighthouse thresholds failed');
    process.exit(1);
  }
}
