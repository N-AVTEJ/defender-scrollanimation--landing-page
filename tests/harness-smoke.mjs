import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { TestRunner, parseArgs, assert, assertEqual, summarizeByTier, writeReports } from './lib/runner.mjs';
import { resolvePlaywright } from './lib/browser.mjs';
import { runStaticChecks } from './static-checks.mjs';
import { runE2ESuite } from './e2e.spec.mjs';
import { runLighthouseAudit } from './lighthouse.mjs';

function collectMjsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'artifacts' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectMjsFiles(full));
    } else if (entry.name.endsWith('.mjs')) {
      out.push(full);
    }
  }
  return out;
}

async function createScratchProject(dir, { dirty = false } = {}) {
  await fsp.mkdir(path.join(dir, 'src/config'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'src/scene'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'src/audio'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'src/ui'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'src/timeline'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'public/assets'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'public/draco'), { recursive: true });

  await fsp.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'scratch-defender',
      type: 'module',
      dependencies: {
        three: '^0.187.0',
        gsap: '^3.15.0',
        lenis: '^1.3.0',
        '@fontsource/big-shoulders-display': '^5.0.0',
        '@fontsource/instrument-serif': '^5.0.0',
        '@fontsource/ibm-plex-mono': '^5.0.0',
      },
      devDependencies: { vite: '^8.0.0' },
    }),
    'utf8'
  );
  await fsp.writeFile(path.join(dir, 'PLAN.md'), '# Plan\n' + 'Camera keyframe table CH 01 FOV '.repeat(15), 'utf8');
  await fsp.writeFile(path.join(dir, 'README.md'), '# README\n' + 'defender.glb NODE_MAP door_driver licensing timeline '.repeat(12), 'utf8');
  await fsp.writeFile(path.join(dir, 'ASSET_CHECKLIST.md'), '# Checklist\n' + 'defender.glb studio_mist.hdr idle_loop.wav '.repeat(8), 'utf8');
  await fsp.writeFile(
    path.join(dir, 'index.html'),
    '<!doctype html><html><head><title>Test</title></head><body></body></html>',
    'utf8'
  );
  await fsp.writeFile(
    path.join(dir, 'src/config/config.js'),
    `// Config\nexport const PALETTE = { bg: '#0b0c0a', text: '#e8e2d3', accent: '#e0541f' };\nexport const SPEC_LINE = '5.0L SUPERCHARGED · 525 PS · 625 Nm · 0–100 IN 5.2 S';\nexport const SCROLL_CONFIG = { totalHeightVh: 900, scrub: 1.2, normalizeScroll: false };\nexport const CHAPTERS = [\n  { id: '01', range: [0.0, 0.19] },\n  { id: '02', range: [0.19, 0.34] },\n  { id: '03', range: [0.34, 0.51] },\n  { id: '04', range: [0.51, 0.67] },\n  { id: '05', range: [0.67, 0.83] },\n  { id: '06', range: [0.83, 1.0] },\n];\nexport const CAMERA_KEYFRAMES = Array.from({ length: 6 }, (_, i) => ({ desktop: { pos: [i, 1, 5], fov: 40 }, mobile: { pos: [i, 1, 6], fov: 54 } }));\nexport const AUDIO_CONFIG = { firingOrder: '1-8-4-3-6-5-7-2', idleRPM: 650, redlineRPM: 7200, limiterMinRPM: 6900, limiterMaxRPM: 7200, riseK: 2.2, fallK: 1.1, bands: [1,2,3,4,5] };\n`,
    'utf8'
  );
  await fsp.writeFile(
    path.join(dir, 'src/scene/defender-loader.js'),
    `export const NODE_MAP = { body: [], door_driver: [], steering_wheel: [], seat: [], wheels: [], interior: [], exhaust: [] };\n${dirty ? 'import { RGBELoader } from "three/addons/loaders/RGBELoader.js";\n// TODO: finish loader\n' : ''}const loaders = ['GLTFLoader', 'DRACOLoader', '/draco/', 'KTX2Loader', 'MeshoptDecoder', 'HDRLoader'];\nexport { loaders };\n`,
    'utf8'
  );
  await fsp.writeFile(
    path.join(dir, 'src/ui/tokens.css'),
    dirty
      ? `body { font-family: 'Inter', sans-serif; background: linear-gradient(135deg, #8b5cf6, purple); }`
      : `h1 { font-family: 'Big Shoulders Display', sans-serif; } p { font-family: 'Instrument Serif', serif; } code { font-family: 'IBM Plex Mono', monospace; }`,
    'utf8'
  );
}

async function runSmoke() {
  const rootDir = process.cwd();
  const testsDir = path.join(rootDir, 'tests');
  const smokeOutDir = path.join(testsDir, 'artifacts', 'smoke');
  const scratchBase = path.join(smokeOutDir, '_scratch_fixture');
  await fsp.mkdir(smokeOutDir, { recursive: true });

  const smokeChecks = [];
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const startedAt = Date.now();

  // 1. node --check on all .mjs files under tests/
  const mjsFiles = collectMjsFiles(testsDir);
  for (const file of mjsFiles) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
  smokeChecks.push({
    id: 'SMOKE-01',
    tier: 'static',
    feature: 'Syntax Check',
    name: `node --check passed on all ${mjsFiles.length} .mjs files`,
    status: 'PASS',
    durationMs: 0,
    metrics: { files: mjsFiles.length },
  });
  console.log(`[PASS] SMOKE-01: node --check passed on ${mjsFiles.length} .mjs files`);

  // 2. TestRunner & CLI parseArgs self-test
  const parsedCli = parseArgs(['--tier=1,2', '--id=T1-F1-05', '--port=4175', '--url=http://127.0.0.1:4175', '--mock', '--out=tests/artifacts/smoke']);
  assertEqual(JSON.stringify(parsedCli.tiers), '[1,2]', 'parseArgs tiers');
  assertEqual(JSON.stringify(parsedCli.ids), '["T1-F1-05"]', 'parseArgs ids');
  assertEqual(parsedCli.port, 4175, 'parseArgs port');
  assertEqual(parsedCli.mock, true, 'parseArgs mock');
  assertEqual(parsedCli.out, 'tests/artifacts/smoke', 'parseArgs out');

  const testRunner = new TestRunner();
  testRunner.add({ id: 'SYN-PASS', tier: 1, feature: 'Runner', name: 'Pass check', fn: async () => assertEqual(1 + 1, 2) });
  testRunner.add({ id: 'SYN-FAIL', tier: 1, feature: 'Runner', name: 'Intentional fail', fn: async () => assert(false, 'Intentional boom') });
  const runnerRes = await testRunner.run();
  assertEqual(runnerRes.summary.passed, 1, 'Runner passed count');
  assertEqual(runnerRes.summary.failed, 1, 'Runner failed count');
  assertEqual(runnerRes.summary.status, 'FAIL', 'Runner failure status');
  assert(runnerRes.checks[1].error.includes('Intentional boom'), 'Runner error capture');
  smokeChecks.push({
    id: 'SMOKE-02',
    tier: 'static',
    feature: 'Runner Self-Test',
    name: 'TestRunner accurately detects both PASS and intentional FAIL assertions',
    status: 'PASS',
    durationMs: 0,
  });
  console.log('[PASS] SMOKE-02: TestRunner pass & intentional failure detection');

  // 3. static-checks negative & positive fixture tests (with guaranteed cleanup)
  try {
    const dirtyDir = path.join(scratchBase, 'dirty');
    const cleanDir = path.join(scratchBase, 'clean');
    await createScratchProject(dirtyDir, { dirty: true });
    await createScratchProject(cleanDir, { dirty: false });

    const dirtyRes = await runStaticChecks(dirtyDir, { skipBuild: true });
    const failedIds = new Set(dirtyRes.checks.filter((c) => c.status === 'FAIL').map((c) => c.id));
    for (const expectedFail of ['T1-F1-04', 'T1-F3-02', 'T1-F7-02-STATIC']) {
      assert(failedIds.has(expectedFail), `Expected dirty fixture to trigger ${expectedFail}, got [${[...failedIds].join(', ')}]`);
    }

    const cleanRes = await runStaticChecks(cleanDir, { skipBuild: true });
    assertEqual(cleanRes.summary.failed, 0, `Clean fixture had unexpected failures: ${JSON.stringify(cleanRes.checks.filter((c) => c.status === 'FAIL'))}`);
  } finally {
    await fsp.rm(scratchBase, { recursive: true, force: true });
  }
  smokeChecks.push({
    id: 'SMOKE-03',
    tier: 'static',
    feature: 'Static Rule Engine',
    name: 'static-checks catches TODO, RGBELoader, Inter, and purple gradients, and passes clean fixtures',
    status: 'PASS',
    durationMs: 0,
  });
  console.log('[PASS] SMOKE-03: static-checks negative & positive scratch fixtures');

  // 4. e2e.spec.mjs --mock + lighthouse.mjs --mock
  let e2eOut = null;
  let lhOut = null;
  let playwrightAvailable = true;
  try {
    await resolvePlaywright(rootDir);
  } catch {
    playwrightAvailable = false;
  }

  if (playwrightAvailable) {
    e2eOut = await runE2ESuite({
      rootDir,
      outDir: smokeOutDir,
      mock: true,
      onResult: (c) => {
        console.log(`[${c.status}] ${c.id}: ${c.name} (${c.durationMs}ms)${c.error ? ' -> ' + c.error : ''}`);
      },
    });
    smokeChecks.push(...e2eOut.checks);
    console.log(
      `[${e2eOut.summary.failed === 0 ? 'PASS' : 'FAIL'}] SMOKE-04: Mock E2E suite (${e2eOut.summary.passed}/${e2eOut.summary.total} PASS, screenshots=${e2eOut.screenshots.length})`
    );
    assertEqual(e2eOut.summary.failed, 0, 'Mock E2E suite failures');
    const revShot = path.join(smokeOutDir, 'screenshots', '07-ch06-rev-active.png');
    assert(fs.existsSync(revShot), `Missing smoke screenshot ${revShot}`);
  } else {
    smokeChecks.push({
      id: 'SMOKE-04',
      tier: 4,
      feature: 'Mock E2E Suite',
      name: 'Playwright browser smoke skipped (playwright package not installed)',
      status: 'SKIP',
      durationMs: 0,
    });
    console.log('[SKIP] SMOKE-04: playwright package not installed');
  }

  lhOut = await runLighthouseAudit({
    url: 'http://127.0.0.1:0',
    rootDir,
    outDir: smokeOutDir,
    mock: true,
  });
  assertEqual(lhOut.status, 'PASS', 'Mock Lighthouse status');
  smokeChecks.push({
    id: 'T4-SCN-06',
    tier: 4,
    feature: 'Lighthouse Mock',
    name: 'Lighthouse threshold & report serialization verified',
    status: 'PASS',
    durationMs: 0,
    metrics: { performance: lhOut.performance, cls: lhOut.cls },
  });
  console.log(`[PASS] SMOKE-05: Lighthouse --mock audit (perf=${lhOut.performance}, cls=${lhOut.cls})`);

  const passed = smokeChecks.filter((c) => c.status === 'PASS').length;
  const failed = smokeChecks.filter((c) => c.status === 'FAIL').length;
  const skipped = smokeChecks.filter((c) => c.status === 'SKIP').length;

  const report = {
    schemaVersion: '1.0.0',
    runId,
    mode: 'smoke-mock',
    targetUrl: 'mock://ephemeral',
    environment: e2eOut?.environment || { node: process.version, platform: process.platform },
    summary: {
      status: failed === 0 ? 'PASS' : 'FAIL',
      total: smokeChecks.length,
      passed,
      failed,
      skipped,
      durationMs: Date.now() - startedAt,
    },
    tiers: summarizeByTier(smokeChecks),
    checks: smokeChecks,
    lighthouse: lhOut,
    screenshots: e2eOut?.screenshots || [],
    consoleAudit: e2eOut?.consoleAudit || { pageErrors: [], consoleErrors: [], fallbackWarningsCount: 0 },
  };

  const { jsonPath, mdPath } = await writeReports(smokeOutDir, report);
  // Ensure smoke run never pre-populates live artifacts outside tests/artifacts/smoke/
  const liveArtifacts = ['report.json', 'report.md', 'lighthouse-report.json', 'lighthouse-report.html', 'screenshots'];
  for (const name of liveArtifacts) {
    const p = path.join(testsDir, 'artifacts', name);
    assert(!fs.existsSync(p), `Smoke run must not create live artifact: ${p}`);
  }
  console.log(`Smoke report written to:\n  - ${jsonPath}\n  - ${mdPath}`);
  console.log(`SMOKE SUMMARY: ${report.summary.status} (${passed}/${smokeChecks.length} PASS, ${failed} FAIL, ${skipped} SKIP)`);
  if (failed > 0) process.exit(1);
}

await runSmoke();
