import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, summarizeByTier, writeReports } from './lib/runner.mjs';
import { startViteServer } from './lib/server.mjs';
import { startMockFixtureServer } from './lib/mock-fixture.mjs';
import { runStaticChecks } from './static-checks.mjs';
import { runE2ESuite } from './e2e.spec.mjs';
import { runLighthouseAudit } from './lighthouse.mjs';

export async function runAll(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const rootDir = process.cwd();
  const outDir = args.out ? path.resolve(rootDir, args.out) : path.join(rootDir, 'tests', 'artifacts');
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const startedAt = Date.now();

  const allChecks = [];
  let staticResult = null;
  let e2eResult = null;
  let lighthouseResult = null;
  let targetUrl = args.url;
  let serverStop = null;

  try {
    if (!args.skipStatic && !args.mock) {
      console.log('=== Step 1: Running Static Checks ===');
      staticResult = await runStaticChecks(rootDir, {
        skipBuild: args.skipBuild,
        ids: args.ids,
      });
      for (const c of staticResult.checks) {
        console.log(`[${c.status}] ${c.id}: ${c.name}${c.error ? ' -> ' + c.error : ''}`);
      }
      allChecks.push(...staticResult.checks);

      const buildCheck = staticResult.checks.find((c) => c.id === 'T1-F1-02');
      if (buildCheck && buildCheck.status === 'FAIL' && args.serve === 'preview' && !args.url) {
        throw new Error(`Skipping browser suite because npm run build failed: ${buildCheck.error}`);
      }
    }

    if (!targetUrl) {
      if (args.mock) {
        console.log('=== Step 2: Starting Mock Fixture Server ===');
        const srv = await startMockFixtureServer(0, '127.0.0.1');
        targetUrl = srv.url;
        serverStop = srv.close;
      } else {
        console.log(`=== Step 2: Starting Vite (${args.serve}) Server ===`);
        const srv = await startViteServer({
          rootDir,
          mode: args.serve,
          port: args.port,
          strictPort: args.strictPort,
        });
        targetUrl = srv.url;
        serverStop = srv.stop;
      }
      console.log(`Target URL ready: ${targetUrl}`);
    }

    console.log('=== Step 3: Running Playwright E2E Suite ===');
    e2eResult = await runE2ESuite({
      url: targetUrl,
      rootDir,
      outDir,
      tiers: args.tiers,
      ids: args.ids,
      headed: args.headed,
      mock: false,
      onResult: (c) => console.log(`[${c.status}] ${c.id}: ${c.name} (${c.durationMs}ms)${c.error ? ' -> ' + c.error : ''}`),
    });
    allChecks.push(...e2eResult.checks);

    const runLighthouseTier =
      !args.skipLighthouse &&
      (!args.tiers || args.tiers.includes(4)) &&
      (!args.ids || args.ids.includes('T4-SCN-06'));

    if (runLighthouseTier) {
      console.log('=== Step 4: Running Lighthouse Audit (T4-SCN-06) ===');
      const t0 = Date.now();
      try {
        lighthouseResult = await runLighthouseAudit({
          url: targetUrl,
          rootDir,
          outDir,
          mock: args.mock,
        });
        allChecks.push({
          id: 'T4-SCN-06',
          tier: 4,
          feature: '#11 Lighthouse Audit',
          name: 'Lighthouse Performance > 0.85 and CLS <= 0.1',
          status: lighthouseResult.status,
          durationMs: Date.now() - t0,
          metrics: {
            performance: lighthouseResult.performance,
            cls: lighthouseResult.cls,
            accessibility: lighthouseResult.accessibility,
          },
          ...(lighthouseResult.error ? { error: lighthouseResult.error } : {}),
        });
        console.log(
          `[${lighthouseResult.status}] T4-SCN-06: perf=${lighthouseResult.performance}, cls=${lighthouseResult.cls}`
        );
      } catch (err) {
        allChecks.push({
          id: 'T4-SCN-06',
          tier: 4,
          feature: '#11 Lighthouse Audit',
          name: 'Lighthouse Performance > 0.85 and CLS <= 0.1',
          status: 'FAIL',
          durationMs: Date.now() - t0,
          error: err.message,
        });
        console.log(`[FAIL] T4-SCN-06: ${err.message}`);
      }
    }
  } catch (err) {
    allChecks.push({
      id: 'HARNESS-ABORT',
      tier: 4,
      feature: '#10 Harness Orchestration',
      name: 'Master suite execution',
      status: 'FAIL',
      durationMs: Date.now() - startedAt,
      error: err.message,
    });
    console.error(`[FAIL] Harness aborted: ${err.message}`);
  } finally {
    if (serverStop) {
      await serverStop();
    }
  }

  const passed = allChecks.filter((c) => c.status === 'PASS').length;
  const failed = allChecks.filter((c) => c.status === 'FAIL').length;
  const skipped = allChecks.filter((c) => c.status === 'SKIP').length;

  const report = {
    schemaVersion: '1.0.0',
    runId,
    mode: args.mock ? 'mock' : 'live',
    targetUrl: targetUrl || null,
    environment: {
      node: process.version,
      platform: process.platform,
      browser: e2eResult?.environment?.browser || 'N/A',
      webglRenderer: e2eResult?.environment?.webglRenderer || 'N/A',
    },
    summary: {
      status: failed === 0 ? 'PASS' : 'FAIL',
      total: allChecks.length,
      passed,
      failed,
      skipped,
      durationMs: Date.now() - startedAt,
    },
    tiers: summarizeByTier(allChecks),
    checks: allChecks,
    ...(lighthouseResult ? { lighthouse: lighthouseResult } : {}),
    screenshots: e2eResult?.screenshots || [],
    consoleAudit: e2eResult?.consoleAudit || { pageErrors: [], consoleErrors: [], fallbackWarningsCount: 0 },
  };

  const { jsonPath, mdPath } = await writeReports(outDir, report);
  console.log(`\nReport written to:\n  - ${jsonPath}\n  - ${mdPath}`);
  console.log(`FINAL STATUS: ${report.summary.status} (${passed}/${allChecks.length} PASS, ${failed} FAIL, ${skipped} SKIP)`);

  return report;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const report = await runAll(process.argv.slice(2));
  process.exit(report.summary.failed === 0 ? 0 : 1);
}
