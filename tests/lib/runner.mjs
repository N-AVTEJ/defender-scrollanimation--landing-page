import fs from 'node:fs/promises';
import path from 'node:path';

export function parseArgs(argv = process.argv.slice(2)) {
  const opts = {
    tiers: null,
    ids: null,
    url: null,
    port: 4173,
    strictPort: false,
    serve: 'preview',
    out: null,
    mock: false,
    headed: false,
    skipBuild: false,
    skipStatic: false,
    skipLighthouse: false,
  };

  for (const arg of argv) {
    if (arg === '--mock') opts.mock = true;
    else if (arg === '--headed') opts.headed = true;
    else if (arg === '--skip-build') opts.skipBuild = true;
    else if (arg === '--skip-static') opts.skipStatic = true;
    else if (arg === '--skip-lighthouse') opts.skipLighthouse = true;
    else if (arg === '--strict-port') opts.strictPort = true;
    else if (arg.startsWith('--tier=')) {
      const rawVal = arg.slice('--tier='.length).trim();
      const val = rawVal.toLowerCase();
      if (val !== 'all' && val !== '') {
        const tokens = rawVal.split(',').map((s) => s.trim());
        const parsedTiers = [];
        for (const tok of tokens) {
          if (!/^\d+$/.test(tok)) {
            throw new Error(`Invalid --tier token "${tok}" in "${arg}". Expected integer tier(s) (1..4) or "all".`);
          }
          const n = Number(tok);
          if (n < 1 || n > 4) {
            throw new Error(`Invalid --tier value ${n} in "${arg}". Expected tier in 1..4.`);
          }
          parsedTiers.push(n);
        }
        opts.tiers = parsedTiers;
      }
    } else if (arg.startsWith('--id=')) {
      const val = arg.slice('--id='.length).trim();
      if (val) {
        opts.ids = val.split(',').map((s) => s.trim()).filter(Boolean);
      }
    } else if (arg.startsWith('--url=')) {
      opts.url = arg.slice('--url='.length).trim();
    } else if (arg.startsWith('--port=')) {
      const p = Number(arg.slice('--port='.length).trim());
      if (Number.isFinite(p) && p > 0) opts.port = p;
    } else if (arg.startsWith('--serve=')) {
      const mode = arg.slice('--serve='.length).trim();
      if (mode === 'preview' || mode === 'dev') opts.serve = mode;
    } else if (arg.startsWith('--out=')) {
      opts.out = arg.slice('--out='.length).trim();
    }
  }
  return opts;
}

export function assert(condition, message = 'Assertion failed') {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    const prefix = message ? `${message}: ` : '';
    throw new Error(`${prefix}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertRange(value, min, max, label = 'value') {
  if (typeof value !== 'number' || Number.isNaN(value) || value < min || value > max) {
    throw new Error(`${label} expected in [${min}, ${max}], got ${JSON.stringify(value)}`);
  }
}

export function assertMatch(str, regex, message = '') {
  if (typeof str !== 'string' || !regex.test(str)) {
    const prefix = message ? `${message}: ` : '';
    throw new Error(`${prefix}expected string matching ${regex}, got ${JSON.stringify(str)}`);
  }
}

export class TestRunner {
  constructor() {
    this.tests = [];
  }

  add({ id, tier, feature, name, fn }) {
    this.tests.push({ id, tier, feature, name, fn });
  }

  async run({ tiers = null, ids = null, onResult = null } = {}) {
    const selected = this.tests.filter((t) => {
      if (ids && ids.length > 0 && !ids.includes(t.id)) return false;
      if (tiers && tiers.length > 0 && !tiers.includes(t.tier)) return false;
      return true;
    });

    const startedAt = Date.now();
    const checks = [];

    for (const testCase of selected) {
      const t0 = Date.now();
      let status = 'PASS';
      let error = null;
      let metrics = {};

      try {
        const res = await testCase.fn();
        if (res && typeof res === 'object') {
          if (res.skipped) {
            status = 'SKIP';
          }
          if (res.metrics && typeof res.metrics === 'object') {
            metrics = res.metrics;
          }
        }
      } catch (err) {
        status = 'FAIL';
        error = err instanceof Error ? err.message : String(err);
      }

      const durationMs = Date.now() - t0;
      const entry = {
        id: testCase.id,
        tier: testCase.tier,
        feature: testCase.feature,
        name: testCase.name,
        status,
        durationMs,
        ...(Object.keys(metrics).length > 0 ? { metrics } : {}),
        ...(error ? { error } : {}),
      };
      checks.push(entry);
      if (typeof onResult === 'function') {
        onResult(entry);
      }
    }

    const total = checks.length;
    const passed = checks.filter((c) => c.status === 'PASS').length;
    const failed = checks.filter((c) => c.status === 'FAIL').length;
    const skipped = checks.filter((c) => c.status === 'SKIP').length;
    const durationMs = Date.now() - startedAt;

    return {
      summary: {
        status: failed === 0 ? 'PASS' : 'FAIL',
        total,
        passed,
        failed,
        skipped,
        durationMs,
      },
      checks,
    };
  }
}

export function summarizeByTier(checks) {
  const buckets = {
    static: { passed: 0, failed: 0, skipped: 0 },
    tier1: { passed: 0, failed: 0, skipped: 0 },
    tier2: { passed: 0, failed: 0, skipped: 0 },
    tier3: { passed: 0, failed: 0, skipped: 0 },
    tier4: { passed: 0, failed: 0, skipped: 0 },
  };

  for (const c of checks) {
    const key =
      c.tier === 'static' || c.tier === 0
        ? 'static'
        : `tier${c.tier}`;
    if (!buckets[key]) buckets[key] = { passed: 0, failed: 0, skipped: 0 };
    if (c.status === 'PASS') buckets[key].passed += 1;
    else if (c.status === 'FAIL') buckets[key].failed += 1;
    else buckets[key].skipped += 1;
  }
  return buckets;
}

export async function writeReports(outDir, report) {
  await fs.mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'report.json');
  const mdPath = path.join(outDir, 'report.md');

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');

  const lines = [];
  lines.push(`# E2E Verification Report — ${report.summary?.status || 'UNKNOWN'}`);
  lines.push('');
  lines.push(`- **Run ID**: \`${report.runId}\``);
  lines.push(`- **Mode**: \`${report.mode}\``);
  lines.push(`- **Target URL**: \`${report.targetUrl || 'N/A'}\``);
  lines.push(`- **Node / Platform**: \`${report.environment?.node || process.version}\` / \`${report.environment?.platform || process.platform}\``);
  if (report.environment?.browser) lines.push(`- **Browser**: \`${report.environment.browser}\``);
  if (report.environment?.webglRenderer) lines.push(`- **WebGL Renderer**: \`${report.environment.webglRenderer}\``);
  lines.push(`- **Summary**: **${report.summary.passed}/${report.summary.total} PASS**, ${report.summary.failed} FAIL, ${report.summary.skipped} SKIP (${report.summary.durationMs} ms)`);
  lines.push('');

  lines.push('## Tier Breakdown');
  lines.push('| Tier | Passed | Failed | Skipped |');
  lines.push('|---|---:|---:|---:|');
  for (const [tierKey, stats] of Object.entries(report.tiers || {})) {
    lines.push(`| ${tierKey} | ${stats.passed} | ${stats.failed} | ${stats.skipped} |`);
  }
  lines.push('');

  if (report.lighthouse) {
    lines.push('## Lighthouse Audit');
    lines.push('| Metric | Value | Threshold | Status |');
    lines.push('|---|---|---|---|');
    lines.push(`| Performance | ${report.lighthouse.performance} | > 0.85 | ${report.lighthouse.performance > 0.85 ? 'PASS' : 'FAIL'} |`);
    lines.push(`| CLS | ${report.lighthouse.cls} | <= 0.1 | ${report.lighthouse.cls <= 0.1 ? 'PASS' : 'FAIL'} |`);
    if (report.lighthouse.accessibility !== undefined) {
      lines.push(`| Accessibility | ${report.lighthouse.accessibility} | — | INFO |`);
    }
    if (report.lighthouse.bestPractices !== undefined) {
      lines.push(`| Best Practices | ${report.lighthouse.bestPractices} | — | INFO |`);
    }
    lines.push('');
  }

  if (Array.isArray(report.screenshots) && report.screenshots.length > 0) {
    lines.push('## Screenshots');
    lines.push('| Name | Chapter | Viewport | Path | Bytes |');
    lines.push('|---|---|---|---|---:|');
    for (const shot of report.screenshots) {
      lines.push(`| ${shot.name} | ${shot.chapter || '-'} | ${shot.viewport || '-'} | \`${shot.path}\` | ${shot.bytes} |`);
    }
    lines.push('');
  }

  if (report.consoleAudit) {
    lines.push('## Console & Error Audit');
    lines.push(`- **Page Errors**: ${report.consoleAudit.pageErrors?.length ?? 0}`);
    lines.push(`- **Console Errors**: ${report.consoleAudit.consoleErrors?.length ?? 0}`);
    lines.push(`- **Fallback Warnings**: ${report.consoleAudit.fallbackWarningsCount ?? 0}`);
    lines.push('');
  }

  const failures = (report.checks || []).filter((c) => c.status === 'FAIL');
  if (failures.length > 0) {
    lines.push('## Failed Checks');
    for (const f of failures) {
      lines.push(`- **${f.id}** (${f.name}): \`${f.error}\``);
    }
    lines.push('');
  }

  lines.push('## All Checks');
  lines.push('| ID | Tier | Feature | Name | Status | Duration (ms) |');
  lines.push('|---|---|---|---|---|---:|');
  for (const c of report.checks || []) {
    lines.push(`| ${c.id} | ${c.tier} | ${c.feature} | ${c.name} | ${c.status} | ${c.durationMs} |`);
  }
  lines.push('');

  await fs.writeFile(mdPath, lines.join('\n'), 'utf8');
  return { jsonPath, mdPath };
}
