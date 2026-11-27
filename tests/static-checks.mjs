import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { TestRunner, assert, assertEqual, summarizeByTier } from './lib/runner.mjs';

const FORBIDDEN_UI_FRAMEWORKS = ['react', 'vue', 'angular', '@angular/core', 'svelte', 'tailwindcss'];
const FORBIDDEN_FONT_REGEX = /(?:font-family\s*:[^;]*(?:\bInter\b|\bRoboto\b|\bArial\b)|@fontsource\/(?:inter|roboto)\b|fonts\.googleapis\.com[^\s"']*(?:Inter|Roboto))/i;
const PURPLE_GRADIENT_REGEX = /(?:linear|radial|conic)-gradient\([^)]*(?:purple|violet|indigo|#8b5cf6|#a855f7|#9333ea|#7c3aed|#6366f1|rgb\(\s*128\s*,\s*0\s*,\s*128\s*\))[^)]*\)/i;
const STUB_MARKER_REGEX = /(?:\b(?:TODO|FIXME|XXX|STUB)\b|\/\/[^\n]*\b(?:todo|fixme|stub)\b|\/\*[\s\S]*?\b(?:todo|fixme|stub)\b[\s\S]*?\*\/)/;

function walkFiles(dir, exts) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, exts));
    } else if (!exts || exts.some((e) => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

function parseSemverMajorMinor(rangeStr) {
  if (typeof rangeStr !== 'string') return null;
  const m = /(\d+)\.(\d+)/.exec(rangeStr);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]) };
}

async function importConfigFresh(configPath) {
  const url = `${pathToFileURL(configPath).href}?t=${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return import(url);
}

function extractNodeMapBody(content) {
  let stripped = '';
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    const next = content[i + 1];
    if (ch === '/' && next === '/') {
      while (i < content.length && content[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      const quote = ch;
      stripped += ch;
      i++;
      while (i < content.length) {
        const sc = content[i];
        stripped += sc;
        if (sc === '\\' && i + 1 < content.length) {
          i++;
          stripped += content[i];
        } else if (sc === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    stripped += ch;
    i++;
  }

  const m = /\bNODE_MAP\s*=\s*(?:[A-Za-z_$][\w$.]*\s*\(\s*)?\{/.exec(stripped);
  if (!m) return null;
  const openIdx = stripped.indexOf('{', m.index);
  let depth = 0;
  for (let j = openIdx; j < stripped.length; j++) {
    const c = stripped[j];
    if (c === '\'' || c === '"' || c === '`') {
      const quote = c;
      j++;
      while (j < stripped.length) {
        if (stripped[j] === '\\') {
          j += 2;
          continue;
        }
        if (stripped[j] === quote) break;
        j++;
      }
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        return stripped.slice(openIdx, j + 1);
      }
    }
  }
  return null;
}

function runNpmBuild(rootDir) {
  if (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) {
    return spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'build'], {
      cwd: rootDir,
      encoding: 'utf8',
      windowsHide: true,
    });
  }
  if (process.platform === 'win32') {
    return spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], {
      cwd: rootDir,
      encoding: 'utf8',
      windowsHide: true,
    });
  }
  return spawnSync('npm', ['run', 'build'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
}

export async function runStaticChecks(rootDir = process.cwd(), { skipBuild = false, ids = null } = {}) {
  const runner = new TestRunner();

  runner.add({
    id: 'T1-F1-01',
    tier: 'static',
    feature: '#1 Stack & Deps',
    name: 'package.json declares required stack without heavy UI frameworks',
    fn: async () => {
      const pkgFile = path.join(rootDir, 'package.json');
      assert(fs.existsSync(pkgFile), `Missing ${pkgFile}`);
      const pkg = JSON.parse(await fsp.readFile(pkgFile, 'utf8'));
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      assert(allDeps.three, 'Missing dependency: three');
      const threeVer = parseSemverMajorMinor(allDeps.three);
      assert(
        threeVer && (threeVer.major > 0 || threeVer.minor >= 160),
        `three version must be >= 0.160, got ${allDeps.three}`
      );
      assert(allDeps.gsap, 'Missing dependency: gsap');
      assert(allDeps.lenis, 'Missing dependency: lenis');
      assert(allDeps.vite, 'Missing dependency: vite');
      assert(allDeps['@fontsource/big-shoulders-display'], 'Missing @fontsource/big-shoulders-display');
      assert(allDeps['@fontsource/instrument-serif'], 'Missing @fontsource/instrument-serif');
      assert(allDeps['@fontsource/ibm-plex-mono'], 'Missing @fontsource/ibm-plex-mono');

      for (const fw of FORBIDDEN_UI_FRAMEWORKS) {
        assert(!allDeps[fw], `Forbidden heavy UI framework present in package.json: ${fw}`);
      }
      return { metrics: { three: allDeps.three, gsap: allDeps.gsap, lenis: allDeps.lenis } };
    },
  });

  runner.add({
    id: 'T1-F1-02',
    tier: 'static',
    feature: '#1 Build',
    name: 'npm run build succeeds cleanly and produces dist/index.html',
    fn: async () => {
      if (skipBuild) {
        return { skipped: true, metrics: { reason: '--skip-build' } };
      }
      const res = runNpmBuild(rootDir);
      assert(
        res.status === 0,
        `npm run build failed (exit ${res.status}): ${(res.stderr || res.stdout || '').slice(0, 800)}`
      );
      const distIndex = path.join(rootDir, 'dist', 'index.html');
      assert(fs.existsSync(distIndex), 'dist/index.html missing after build');
      const distAssets = path.join(rootDir, 'dist', 'assets');
      assert(fs.existsSync(distAssets) && fs.readdirSync(distAssets).length > 0, 'dist/assets/ is empty');
      return { metrics: { distAssetsCount: fs.readdirSync(distAssets).length } };
    },
  });

  runner.add({
    id: 'T1-F1-03',
    tier: 'static',
    feature: '#1 Structure & Docs',
    name: 'Required directories, PLAN.md, README.md, and ASSET_CHECKLIST.md exist and are populated',
    fn: async () => {
      const requiredDirs = [
        'src/scene',
        'src/audio',
        'src/ui',
        'src/timeline',
        'src/config',
        'public/assets',
        'public/draco',
      ];
      for (const rel of requiredDirs) {
        const p = path.join(rootDir, rel);
        assert(fs.existsSync(p) && fs.statSync(p).isDirectory(), `Missing required directory: ${rel}`);
      }

      const planPath = path.join(rootDir, 'PLAN.md');
      const readmePath = path.join(rootDir, 'README.md');
      const checklistPath = path.join(rootDir, 'ASSET_CHECKLIST.md');
      for (const doc of [planPath, readmePath, checklistPath]) {
        assert(fs.existsSync(doc), `Missing required document: ${path.basename(doc)}`);
      }

      const planText = await fsp.readFile(planPath, 'utf8');
      assert(planText.length > 200, 'PLAN.md appears empty or incomplete');
      assert(/camera|keyframe|fov/i.test(planText) && /01|CH\s*01/i.test(planText), 'PLAN.md must include camera keyframe table per chapter');

      const readmeText = await fsp.readFile(readmePath, 'utf8');
      assert(readmeText.length > 200, 'README.md appears empty or incomplete');
      assert(/defender\.glb/i.test(readmeText) && /NODE_MAP|door_driver/i.test(readmeText), 'README.md must document asset names and model node names');
      assert(/licens/i.test(readmeText), 'README.md must include licensing notes');

      const checklistText = await fsp.readFile(checklistPath, 'utf8');
      assert(checklistText.length > 80, 'ASSET_CHECKLIST.md appears empty');
    },
  });

  runner.add({
    id: 'T1-F1-04',
    tier: 'static',
    feature: '#1 Zero Stubs',
    name: 'Zero TODO, FIXME, XXX, or STUB markers in src/ and index.html',
    fn: async () => {
      const files = [...walkFiles(path.join(rootDir, 'src'), ['.js', '.mjs', '.css', '.html'])];
      const idx = path.join(rootDir, 'index.html');
      if (fs.existsSync(idx)) files.push(idx);
      assert(files.length > 0, 'No source files found under src/');

      const violations = [];
      for (const file of files) {
        const content = await fsp.readFile(file, 'utf8');
        const m = STUB_MARKER_REGEX.exec(content);
        if (m) {
          violations.push(`${path.relative(rootDir, file)}: "${m[0].trim()}"`);
        }
      }
      assert(violations.length === 0, `Found forbidden TODO/STUB markers: ${violations.join('; ')}`);
      return { metrics: { filesScanned: files.length } };
    },
  });

  runner.add({
    id: 'T1-F2-01',
    tier: 'static',
    feature: '#2 Config Exports',
    name: 'src/config/config.js is commented and exports required contracts',
    fn: async () => {
      const cfgPath = path.join(rootDir, 'src', 'config', 'config.js');
      assert(fs.existsSync(cfgPath), 'Missing src/config/config.js');
      const raw = await fsp.readFile(cfgPath, 'utf8');
      assert(/\/\/|\/\*/.test(raw), 'src/config/config.js must contain explanatory comments');

      const cfg = await importConfigFresh(cfgPath);
      assert(cfg.PALETTE, 'config.js missing PALETTE export');
      assertEqual(String(cfg.PALETTE.bg).toLowerCase(), '#0b0c0a', 'PALETTE.bg');
      assertEqual(String(cfg.PALETTE.text).toLowerCase(), '#e8e2d3', 'PALETTE.text');
      assertEqual(String(cfg.PALETTE.accent).toLowerCase(), '#e0541f', 'PALETTE.accent');
      assert(typeof cfg.SPEC_LINE === 'string' && cfg.SPEC_LINE.includes('525 PS'), 'config.js missing valid SPEC_LINE');
      assert(cfg.SCROLL_CONFIG, 'config.js missing SCROLL_CONFIG');
      assertEqual(cfg.SCROLL_CONFIG.totalHeightVh, 900, 'SCROLL_CONFIG.totalHeightVh');
      assertEqual(cfg.SCROLL_CONFIG.scrub, 1.2, 'SCROLL_CONFIG.scrub');
      assertEqual(cfg.SCROLL_CONFIG.normalizeScroll, false, 'SCROLL_CONFIG.normalizeScroll');
      assert(Array.isArray(cfg.CHAPTERS) && cfg.CHAPTERS.length === 6, 'CHAPTERS must have 6 entries');
      assert(Array.isArray(cfg.CAMERA_KEYFRAMES) && cfg.CAMERA_KEYFRAMES.length >= 6, 'CAMERA_KEYFRAMES must cover CH 01-06');
      assert(cfg.AUDIO_CONFIG, 'config.js missing AUDIO_CONFIG');
    },
  });

  runner.add({
    id: 'T1-F2-02',
    tier: 'static',
    feature: '#2 Chapter Continuity',
    name: 'CHAPTERS ranges span 0.00 to 1.00 contiguously across 01–06',
    fn: async () => {
      const cfg = await importConfigFresh(path.join(rootDir, 'src', 'config', 'config.js'));
      const chapters = cfg.CHAPTERS;
      assertEqual(chapters.length, 6, 'CHAPTERS length');
      assert(Math.abs(chapters[0].range[0] - 0.0) < 1e-6, `First chapter must start at 0, got ${chapters[0].range[0]}`);
      assert(Math.abs(chapters[5].range[1] - 1.0) < 1e-6, `Last chapter must end at 1, got ${chapters[5].range[1]}`);

      for (let i = 0; i < chapters.length; i++) {
        const expectedId = String(i + 1).padStart(2, '0');
        assertEqual(chapters[i].id, expectedId, `Chapter ${i} id`);
        assert(chapters[i].range[1] > chapters[i].range[0], `Chapter ${expectedId} end must exceed start`);
        if (i > 0) {
          assert(
            Math.abs(chapters[i].range[0] - chapters[i - 1].range[1]) < 1e-4,
            `Gap/overlap between CH ${chapters[i - 1].id} and CH ${expectedId}`
          );
        }
      }
    },
  });

  runner.add({
    id: 'T1-F2-03',
    tier: 'static',
    feature: '#2 Audio Constants',
    name: 'AUDIO_CONFIG specifies 5.0L V8 firing order and non-linear RPM parameters',
    fn: async () => {
      const cfg = await importConfigFresh(path.join(rootDir, 'src', 'config', 'config.js'));
      const a = cfg.AUDIO_CONFIG;
      assertEqual(a.firingOrder, '1-8-4-3-6-5-7-2', 'AUDIO_CONFIG.firingOrder');
      assertEqual(a.idleRPM, 650, 'AUDIO_CONFIG.idleRPM');
      assertEqual(a.redlineRPM, 7200, 'AUDIO_CONFIG.redlineRPM');
      assertEqual(a.limiterMinRPM, 6900, 'AUDIO_CONFIG.limiterMinRPM');
      assertEqual(a.limiterMaxRPM, 7200, 'AUDIO_CONFIG.limiterMaxRPM');
      assert(Math.abs(a.riseK - 2.2) < 0.05, `AUDIO_CONFIG.riseK expected ~2.2, got ${a.riseK}`);
      assert(Math.abs(a.fallK - 1.1) < 0.05, `AUDIO_CONFIG.fallK expected ~1.1, got ${a.fallK}`);
      assert(Array.isArray(a.bands) && a.bands.length >= 5, 'AUDIO_CONFIG.bands must include idle/low/mid/high/limiter');
    },
  });

  runner.add({
    id: 'T1-F2-05',
    tier: 'static',
    feature: '#2 Keyframe Parity',
    name: 'CAMERA_KEYFRAMES defines distinct desktop and mobile poses and FOV',
    fn: async () => {
      const cfg = await importConfigFresh(path.join(rootDir, 'src', 'config', 'config.js'));
      const kf = cfg.CAMERA_KEYFRAMES;
      assert(Array.isArray(kf) && kf.length >= 6, 'CAMERA_KEYFRAMES length');
      let diffCount = 0;
      for (const frame of kf) {
        assert(frame.desktop && Array.isArray(frame.desktop.pos) && typeof frame.desktop.fov === 'number', 'Invalid desktop keyframe');
        assert(frame.mobile && Array.isArray(frame.mobile.pos) && typeof frame.mobile.fov === 'number', 'Invalid mobile keyframe');
        if (
          frame.desktop.fov !== frame.mobile.fov ||
          JSON.stringify(frame.desktop.pos) !== JSON.stringify(frame.mobile.pos)
        ) {
          diffCount += 1;
        }
      }
      assert(diffCount >= 3, `Expected distinct desktop vs mobile camera framing across chapters, found ${diffCount}`);
    },
  });

  runner.add({
    id: 'T1-F3-01',
    tier: 'static',
    feature: '#3 NODE_MAP',
    name: 'src/scene/defender-loader.js declares NODE_MAP at the top of the file',
    fn: async () => {
      const loaderPath = path.join(rootDir, 'src', 'scene', 'defender-loader.js');
      assert(fs.existsSync(loaderPath), 'Missing src/scene/defender-loader.js');
      const content = await fsp.readFile(loaderPath, 'utf8');
      const lines = content.split(/\r?\n/);
      const nodeMapLineIdx = lines.findIndex((l) => /NODE_MAP\s*=/.test(l));
      assert(nodeMapLineIdx !== -1, 'NODE_MAP declaration missing in defender-loader.js');
      assert(nodeMapLineIdx < 60, `NODE_MAP must be declared near top of defender-loader.js (found at line ${nodeMapLineIdx + 1})`);

      const nodeMapSlice = extractNodeMapBody(content);
      assert(nodeMapSlice, 'NODE_MAP object literal missing or unclosed in defender-loader.js');

      for (const requiredKey of ['body', 'door_driver', 'steering_wheel', 'seat', 'wheels', 'interior', 'exhaust']) {
        assert(
          new RegExp(`(?:^|[{,\\s])${requiredKey}\\s*:`).test(nodeMapSlice) ||
            new RegExp(`["']${requiredKey}["']\\s*:`).test(nodeMapSlice),
          `NODE_MAP missing required node key: ${requiredKey}`
        );
      }
    },
  });

  runner.add({
    id: 'T1-F3-02',
    tier: 'static',
    feature: '#3 Three Loaders',
    name: 'Scene loader uses GLTFLoader, DRACOLoader, KTX2Loader, MeshoptDecoder, and HDRLoader (zero RGBELoader)',
    fn: async () => {
      const sceneFiles = walkFiles(path.join(rootDir, 'src', 'scene'), ['.js', '.mjs']);
      assert(sceneFiles.length > 0, 'No files found under src/scene/');
      const allSrcFiles = walkFiles(path.join(rootDir, 'src'), ['.js', '.mjs']);

      let combinedScene = '';
      for (const f of sceneFiles) {
        combinedScene += '\n' + (await fsp.readFile(f, 'utf8'));
      }

      for (const loaderName of ['GLTFLoader', 'DRACOLoader', 'KTX2Loader', 'MeshoptDecoder', 'HDRLoader']) {
        assert(combinedScene.includes(loaderName), `src/scene/ missing required loader reference: ${loaderName}`);
      }
      assert(combinedScene.includes('/draco'), 'src/scene/ must configure DRACOLoader path (/draco/)');

      for (const f of allSrcFiles) {
        const text = await fsp.readFile(f, 'utf8');
        assert(!/\bRGBELoader\b/.test(text), `Deprecated RGBELoader found in ${path.relative(rootDir, f)} (must use HDRLoader)`);
      }
    },
  });

  runner.add({
    id: 'T1-F7-02-STATIC',
    tier: 'static',
    feature: '#7 Approved Typography & Palette',
    name: 'Source CSS/JS/HTML enforces approved fonts and zero forbidden fonts or purple gradients',
    fn: async () => {
      const files = [...walkFiles(path.join(rootDir, 'src'), ['.js', '.mjs', '.css', '.html'])];
      const idx = path.join(rootDir, 'index.html');
      if (fs.existsSync(idx)) files.push(idx);
      assert(files.length > 0, 'No source files found');

      let combined = '';
      for (const f of files) {
        const txt = await fsp.readFile(f, 'utf8');
        combined += '\n' + txt;
        assert(!FORBIDDEN_FONT_REGEX.test(txt), `Forbidden font (Inter/Roboto/Arial) found in ${path.relative(rootDir, f)}`);
        assert(!PURPLE_GRADIENT_REGEX.test(txt), `Forbidden purple/violet gradient found in ${path.relative(rootDir, f)}`);
      }

      assert(
        /Big Shoulders Display|Barlow Condensed/i.test(combined),
        'Approved display font (Big Shoulders Display / Barlow Condensed) not referenced in source'
      );
      assert(/Instrument Serif/i.test(combined), 'Approved serif font (Instrument Serif) not referenced in source');
      assert(/IBM Plex Mono/i.test(combined), 'Approved mono font (IBM Plex Mono) not referenced in source');
    },
  });

  const result = await runner.run({ ids });
  return {
    ...result,
    tiers: summarizeByTier(result.checks),
  };
}

// CLI entrypoint
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const skipBuild = process.argv.includes('--skip-build');
  const rootDir = process.cwd();
  const out = await runStaticChecks(rootDir, { skipBuild });
  for (const c of out.checks) {
    console.log(`[${c.status}] ${c.id}: ${c.name}${c.error ? ' -> ' + c.error : ''}`);
  }
  console.log(`Static Summary: ${out.summary.passed}/${out.summary.total} PASS, ${out.summary.failed} FAIL, ${out.summary.skipped} SKIP`);
  process.exit(out.summary.failed === 0 ? 0 : 1);
}
