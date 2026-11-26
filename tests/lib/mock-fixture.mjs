import http from 'node:http';

const MOCK_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DEFENDER V8 — Mock Verification Fixture</title>
  <link rel="icon" href="data:," />
  <style>
    :root {
      --bg: #0b0c0a;
      --surface: #141512;
      --text: #e8e2d3;
      --muted: #8d8779;
      --accent: #e0541f;
      --hairline: rgba(232, 226, 211, 0.16);
      --font-display: 'Big Shoulders Display', 'Barlow Condensed', Impact, sans-serif;
      --font-serif: 'Instrument Serif', Georgia, serif;
      --font-mono: 'IBM Plex Mono', Consolas, monospace;
    }
    * { box-sizing: border-box; }
    button { font-family: inherit; }
    html, body {
      margin: 0;
      padding: 0;
      background-color: #0b0c0a;
      color: #e8e2d3;
      font-family: var(--font-serif);
      overflow-x: hidden;
    }
    main[data-scroll-container] {
      position: relative;
      width: 100%;
      height: 900vh;
    }
    canvas[data-testid="webgl-canvas"] {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      display: block;
      z-index: 1;
    }
    [data-testid="letterbox-top"],
    [data-testid="letterbox-bottom"] {
      position: fixed;
      left: 0;
      width: 100%;
      height: 28px;
      background: #0b0c0a;
      z-index: 5;
      pointer-events: none;
    }
    [data-testid="letterbox-top"] { top: 0; border-bottom: 1px solid var(--hairline); }
    [data-testid="letterbox-bottom"] { bottom: 0; border-top: 1px solid var(--hairline); }
    [data-testid="grain-overlay"] {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 6;
      opacity: 0.04;
      background-image: radial-gradient(rgba(232, 226, 211, 0.35) 1px, transparent 0);
      background-size: 3px 3px;
    }
    [data-testid="loader"] {
      position: fixed;
      inset: 0;
      background: #0b0c0a;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 30;
      font-family: var(--font-mono);
      transition: opacity 0.25s ease;
    }
    [data-testid="loader"][data-loading="false"] {
      opacity: 0;
      pointer-events: none;
    }
    .hud {
      position: fixed;
      inset: 0;
      z-index: 10;
      pointer-events: none;
      padding: 44px 36px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .hud button, .hud nav, .hud a { pointer-events: auto; }
    h1[data-testid="hero-title"] {
      margin: 0;
      font-family: var(--font-display);
      font-size: clamp(2.8rem, 8vw, 6.4rem);
      letter-spacing: -0.02em;
      line-height: 0.9;
      text-transform: uppercase;
      color: #e8e2d3;
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    h1[data-testid="hero-title"] span {
      display: inline-block;
      transition: transform 0.3s ease, opacity 0.3s ease;
    }
    [data-testid="scroll-cue"] {
      font-family: var(--font-mono);
      font-size: 0.75rem;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #e8e2d3;
      border-left: 1px solid var(--accent);
      padding-left: 10px;
      margin-top: 10px;
      transition: opacity 0.25s ease;
    }
    [data-testid="hairline-rule"] {
      height: 1px;
      width: 180px;
      background: var(--hairline);
      margin: 12px 0;
    }
    [data-chapter] {
      max-width: min(460px, 85vw);
      transition: opacity 0.25s ease, transform 0.25s ease;
    }
    [data-testid="chapter-numeral"] {
      font-family: var(--font-display);
      font-size: 3.5rem;
      line-height: 1;
      color: #e0541f;
    }
    [data-testid="chapter-title"] {
      font-family: var(--font-display);
      font-size: 2rem;
      text-transform: uppercase;
      margin: 4px 0;
    }
    [data-testid="chapter-copy"] {
      font-family: var(--font-serif);
      font-size: 1.05rem;
      margin: 4px 0 8px;
    }
    [data-testid="chapter-spec"] {
      font-family: var(--font-mono);
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      color: #e8e2d3;
      opacity: 0.85;
    }
    nav[aria-label="Chapter navigation"] {
      position: fixed;
      right: 20px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 15;
    }
    nav[aria-label="Chapter navigation"] button {
      background: transparent;
      border: 1px solid var(--hairline);
      color: #e8e2d3;
      font-family: var(--font-mono);
      font-size: 0.7rem;
      padding: 4px 7px;
      cursor: pointer;
    }
    nav[aria-label="Chapter navigation"] button[aria-current="step"] {
      border-color: #e0541f;
      color: #e0541f;
    }
    .controls-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }
    [data-testid="enable-sound-btn"],
    [data-testid="rev-button"],
    [data-testid="licensing-trigger"] {
      font-family: var(--font-mono);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 10px 16px;
      border: 1px solid var(--hairline);
      background: rgba(11, 12, 10, 0.86);
      color: #e8e2d3;
      cursor: pointer;
    }
    [data-testid="rev-button"] {
      border-color: #e0541f;
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    [data-testid="rev-button"][data-visible="false"] {
      opacity: 0;
      pointer-events: none;
    }
    [data-testid="rpm-gauge"] {
      position: fixed;
      left: 36px;
      bottom: 84px;
      padding: 12px 16px;
      border: 1px solid var(--hairline);
      background: rgba(11, 12, 10, 0.86);
      font-family: var(--font-mono);
      z-index: 12;
      transition: opacity 0.25s ease;
    }
    [data-testid="rpm-gauge"][data-visible="false"] {
      opacity: 0;
      pointer-events: none;
    }
    [data-testid="gauge-needle"] {
      width: 44px;
      height: 2px;
      background: #e0541f;
      transform-origin: left center;
      transform: rotate(-120deg);
      margin: 8px 0;
      transition: transform 0.12s linear;
    }
    footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: var(--font-mono);
      font-size: 0.72rem;
      color: #8d8779;
    }
    [data-testid="licensing-modal"] {
      position: fixed;
      inset: 0;
      background: rgba(11, 12, 10, 0.88);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 40;
    }
    [data-testid="licensing-modal"][hidden] { display: none; }
    .modal-card {
      background: #141512;
      border: 1px solid var(--hairline);
      padding: 24px;
      max-width: 440px;
      width: 90%;
      font-family: var(--font-mono);
      color: #e8e2d3;
    }
    [data-testid="custom-cursor"] {
      position: fixed;
      width: 14px;
      height: 14px;
      border: 1px solid #e0541f;
      border-radius: 50%;
      pointer-events: none;
      z-index: 50;
      transform: translate(-50%, -50%);
    }
    [data-testid="custom-cursor"][data-enabled="false"] {
      display: none;
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition-duration: 0.01ms !important; }
    }
  </style>
</head>
<body>
  <div data-testid="letterbox-top"></div>
  <div data-testid="letterbox-bottom"></div>
  <div data-testid="grain-overlay"></div>
  <div data-testid="custom-cursor" data-enabled="true"></div>

  <div role="progressbar" data-testid="loader" data-loading="true" data-progress="0" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
    <span data-testid="loader-percent">000%</span>
  </div>

  <main data-scroll-container data-testid="scroll-container" data-scroll-height-vh="900">
    <canvas data-testid="webgl-canvas" data-ready="false"></canvas>
  </main>

  <nav aria-label="Chapter navigation" data-testid="progress-rail">
    <button type="button" data-rail-chapter="01" aria-current="step">01</button>
    <button type="button" data-rail-chapter="02">02</button>
    <button type="button" data-rail-chapter="03">03</button>
    <button type="button" data-rail-chapter="04">04</button>
    <button type="button" data-rail-chapter="05">05</button>
    <button type="button" data-rail-chapter="06">06</button>
  </nav>

  <div class="hud">
    <div>
      <h1 data-testid="hero-title" data-hero-revealed="true">
        <span>D</span><span>E</span><span>F</span><span>E</span><span>N</span><span>D</span><span>E</span><span>R</span><span>&nbsp;</span><span>V</span><span>8</span>
      </h1>
      <div data-testid="scroll-cue">Scroll</div>
      <div data-testid="hairline-rule"></div>
      <section data-chapter="01" data-testid="chapter-overlay">
        <div data-testid="chapter-numeral">01</div>
        <h2 data-testid="chapter-title">Approach</h2>
        <p data-testid="chapter-copy">Out of dark highland mist, the Defender V8 emerges.</p>
        <div data-testid="chapter-spec">5.0L SUPERCHARGED · 525 PS · 625 Nm · 0–100 IN 5.2 S</div>
      </section>
    </div>

    <div data-testid="rpm-gauge" data-visible="false">
      <div data-testid="gauge-needle"></div>
      <div data-testid="gauge-rpm">0 RPM</div>
      <div data-testid="gauge-speed">0 KM/H</div>
    </div>

    <div>
      <div class="controls-row">
        <button type="button" data-testid="enable-sound-btn" data-audio-unlocked="false">Enable sound</button>
        <button type="button" data-testid="rev-button" data-visible="false" data-revving="false">
          <span>REV IT TO 7200 RPM</span>
          <span data-testid="rev-rpm-readout">650 RPM</span>
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
            <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(232,226,211,0.2)" stroke-width="2" />
            <circle data-testid="rev-arc" cx="14" cy="14" r="11" fill="none" stroke="#e0541f" stroke-width="2" stroke-dasharray="69.115" stroke-dashoffset="69.115" />
          </svg>
        </button>
      </div>
      <footer>
        <span>DEFENDER 110 V8 EXPEDITION SHOWCASE</span>
        <button type="button" data-testid="licensing-trigger">Model &amp; audio licensing</button>
      </footer>
    </div>
  </div>

  <div role="dialog" aria-modal="true" data-testid="licensing-modal" data-open="false" hidden>
    <div class="modal-card">
      <h3>Model &amp; Audio Licensing</h3>
      <p>Procedural fallback active when optional /assets/model, /assets/hdr, and /assets/audio files are omitted.</p>
      <button type="button" data-testid="licensing-close">Close</button>
    </div>
  </div>

  <script type="module">
    const CHAPTERS = [
      { id: '01', title: 'Approach', copy: 'Out of dark highland mist, the Defender V8 emerges.', start: 0.0, end: 0.19 },
      { id: '02', title: 'Door Opens', copy: 'Heavy aluminum door swings wide into the cabin.', start: 0.19, end: 0.34 },
      { id: '03', title: 'Seated', copy: 'First-person command of wheel, gauges, and leather.', start: 0.34, end: 0.51 },
      { id: '04', title: 'Engine Starts', copy: '5.0L supercharged V8 cranks and settles into a lumpy idle.', start: 0.51, end: 0.67 },
      { id: '05', title: 'Get Out', copy: 'Step outside into crisp night air as exhaust shimmer rises.', start: 0.67, end: 0.83 },
      { id: '06', title: 'Rear View + Rev', copy: 'Twin quad tailpipes ready for 7200 RPM redline.', start: 0.83, end: 1.01 },
    ];

    const state = {
      progress: 0,
      chapterIndex: 0,
      isReady: false,
      isFallbackModel: false,
      isFallbackEnv: false,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      audioUnlocked: false,
      audioCtx: null,
      audioMode: 'uninitialized',
      throttle: 0,
      rpm: 0,
      targetRPM: 0,
      isRunning: false,
      isCranking: false,
      isLimiting: false,
      limiterCutUntil: 0,
      exhaustGlow: 0.1,
      activeShakeAmplitude: 0,
      bonnetRattleActive: false,
      doorAngle: 0,
      interiorLight: 0.05,
      headlights: 0.15,
      fogDensity: 0.055,
      cockpitMix: 0,
      gaugeVisible: false,
      revActive: false,
      camPos: [6, 2.2, 8],
      lookAt: [0, 0.9, 0],
      fov: 42,
      rafLoopCount: 1,
    };

    const rmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncReducedMotion = () => {
      state.reducedMotion = rmQuery.matches;
      const cursor = document.querySelector('[data-testid="custom-cursor"]');
      if (cursor) cursor.setAttribute('data-enabled', state.reducedMotion ? 'false' : 'true');
    };
    rmQuery.addEventListener('change', syncReducedMotion);
    syncReducedMotion();

    // Asset probe (tests Vite 200-HTML fallback & binary magic headers)
    async function probeAsset(url, expectedMagic) {
      try {
        const res = await fetch(url);
        if (!res.ok) return { ok: false, reason: 'HTTP ' + res.status };
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html')) return { ok: false, reason: 'Vite 200-HTML fallback' };
        const buf = new Uint8Array(await res.arrayBuffer());
        const head = String.fromCharCode(...buf.slice(0, expectedMagic.length));
        if (head !== expectedMagic) return { ok: false, reason: 'Invalid magic header' };
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: err.message };
      }
    }

    const [glbRes, hdrRes] = await Promise.all([
      probeAsset('/assets/model/defender.glb', 'glTF'),
      probeAsset('/assets/hdr/studio_mist.hdr', '#?'),
    ]);
    if (!glbRes.ok) {
      console.warn('[defender-loader] Using procedural Defender fallback:', glbRes.reason);
      state.isFallbackModel = true;
    }
    if (!hdrRes.ok) {
      console.warn('[scene-manager] Using procedural studio-mist PMREM fallback:', hdrRes.reason);
      state.isFallbackEnv = true;
    }

    // WebGL2 canvas rendering
    const canvas = document.querySelector('[data-testid="webgl-canvas"]');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    function resizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    let program = null;
    if (gl) {
      const vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, 'attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }');
      gl.compileShader(vs);
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, 'precision mediump float; varying vec2 vUv; uniform float uHead; uniform float uGlow; uniform float uProg; void main(){ float d = length(vUv - vec2(0.5, 0.48)); vec3 base = mix(vec3(0.043,0.047,0.039), vec3(0.18,0.16,0.14), smoothstep(0.65, 0.1, d)); vec3 accent = vec3(0.88, 0.33, 0.12) * (0.25 + uGlow * 0.65) * smoothstep(0.28, 0.02, length(vUv - vec2(0.5 + sin(uProg * 6.28)*0.15, 0.45))); vec3 beam = vec3(0.95,0.92,0.85) * uHead * 0.35 * smoothstep(0.35, 0.05, length(vUv - vec2(0.35, 0.52))); gl_FragColor = vec4(base + accent + beam, 1.0); }');
      gl.compileShader(fs);
      program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }

    // Scroll & chapter mapping
    function updateFromScroll() {
      const maxY = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const p = Math.max(0, Math.min(1, window.scrollY / maxY));
      state.progress = p;

      let idx = CHAPTERS.findIndex((c) => p >= c.start && p < c.end);
      if (idx === -1) idx = CHAPTERS.length - 1;
      state.chapterIndex = idx;
      const ch = CHAPTERS[idx];
      const isMobile = window.innerWidth < 768;

      state.headlights = p < 0.19 ? 0.15 + (p / 0.19) * 0.85 : 1.0;
      state.fogDensity = p < 0.19 ? 0.055 - (p / 0.19) * 0.027 : 0.028;
      state.doorAngle = idx === 1 ? -1.134 : 0;
      state.interiorLight = idx === 1 || idx === 2 ? 0.85 : 0.1;
      state.cockpitMix = idx === 2 || idx === 3 ? 0.92 : 0.06;
      state.gaugeVisible = idx === 2 || idx === 3;
      state.revActive = idx === 5;
      state.isRunning = p >= 0.51;

      const baseFov = isMobile ? 54 : 38;
      state.fov = idx === 0 ? baseFov - (p / 0.19) * 4 : idx === 5 ? baseFov + 4 : baseFov;
      state.camPos = [
        Number((4.5 * Math.cos(p * Math.PI * 1.6)).toFixed(3)),
        Number((1.6 + (idx === 2 || idx === 3 ? -0.35 : 0.25)).toFixed(3)),
        Number((6.2 - p * 8.4).toFixed(3)),
      ];
      state.lookAt = [0, idx === 5 ? 0.65 : 1.0, idx === 2 || idx === 3 ? 0.4 : 0];

      // DOM sync
      const overlay = document.querySelector('[data-chapter]');
      overlay.setAttribute('data-chapter', ch.id);
      document.querySelector('[data-testid="chapter-numeral"]').textContent = ch.id;
      document.querySelector('[data-testid="chapter-title"]').textContent = ch.title;
      document.querySelector('[data-testid="chapter-copy"]').textContent = ch.copy;

      for (const btn of document.querySelectorAll('[data-rail-chapter]')) {
        if (btn.getAttribute('data-rail-chapter') === ch.id) {
          btn.setAttribute('aria-current', 'step');
        } else {
          btn.removeAttribute('aria-current');
        }
      }

      document.querySelector('[data-testid="rpm-gauge"]').setAttribute('data-visible', state.gaugeVisible ? 'true' : 'false');
      document.querySelector('[data-testid="rev-button"]').setAttribute('data-visible', state.revActive ? 'true' : 'false');
      if (!state.revActive && state.throttle > 0) {
        state.throttle = 0;
        document.querySelector('[data-testid="rev-button"]').setAttribute('data-revving', 'false');
      }
    }

    window.addEventListener('scroll', updateFromScroll, { passive: true });
    for (const btn of document.querySelectorAll('[data-rail-chapter]')) {
      btn.addEventListener('click', () => {
        const ch = CHAPTERS.find((c) => c.id === btn.getAttribute('data-rail-chapter'));
        if (!ch) return;
        const mid = (ch.start + Math.min(1, ch.end)) / 2;
        const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo({ top: Math.round(maxY * mid), behavior: 'instant' });
        updateFromScroll();
      });
    }

    // Audio unlock (lazy load ONLY on gesture)
    const soundBtn = document.querySelector('[data-testid="enable-sound-btn"]');
    soundBtn.addEventListener('click', async () => {
      if (!state.audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        state.audioCtx = AC ? new AC() : null;
      }
      if (state.audioCtx && state.audioCtx.state === 'suspended') {
        await state.audioCtx.resume();
      }
      if (!state.audioUnlocked) {
        const wavRes = await probeAsset('/assets/audio/idle_loop.wav', 'RIFF');
        if (!wavRes.ok) {
          console.warn('[engine-audio] Using procedural cross-plane V8 synth fallback:', wavRes.reason);
          state.audioMode = 'procedural';
        } else {
          state.audioMode = 'samples';
        }
      }
      state.audioUnlocked = true;
      soundBtn.setAttribute('data-audio-unlocked', 'true');
      soundBtn.textContent = 'Sound on';
    });

    // Rev controls (pointer, touch, Space, cancel/blur)
    const revBtn = document.querySelector('[data-testid="rev-button"]');
    const setThrottle = (val) => {
      state.throttle = state.revActive ? val : 0;
      revBtn.setAttribute('data-revving', state.throttle > 0 ? 'true' : 'false');
    };
    revBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); setThrottle(1); });
    revBtn.addEventListener('pointerup', () => setThrottle(0));
    revBtn.addEventListener('pointercancel', () => setThrottle(0));
    revBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setThrottle(1); }, { passive: false });
    revBtn.addEventListener('touchend', () => setThrottle(0));
    revBtn.addEventListener('touchcancel', () => setThrottle(0));
    window.addEventListener('blur', () => setThrottle(0));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && state.revActive) {
        e.preventDefault();
        setThrottle(1);
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && state.throttle > 0) {
        setThrottle(0);
      }
    });

    // Licensing modal
    const modal = document.querySelector('[data-testid="licensing-modal"]');
    const openModal = () => { modal.hidden = false; modal.setAttribute('data-open', 'true'); };
    const closeModal = () => { modal.hidden = true; modal.setAttribute('data-open', 'false'); };
    document.querySelector('[data-testid="licensing-trigger"]').addEventListener('click', openModal);
    document.querySelector('[data-testid="licensing-close"]').addEventListener('click', closeModal);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.getAttribute('data-open') === 'true') closeModal();
    });

    // Single rAF loop
    let lastTs = performance.now();
    function tick(now) {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      if (!state.isRunning) {
        state.targetRPM = 0;
        state.rpm += (0 - state.rpm) * 3.0 * dt;
        state.isLimiting = false;
      } else if (state.throttle > 0) {
        const t = now / 1000;
        if (now < state.limiterCutUntil) {
          state.targetRPM = 6880;
          state.isLimiting = true;
        } else {
          state.targetRPM = 7400;
          if (state.rpm >= 7180) {
            state.limiterCutUntil = now + 80;
            state.isLimiting = true;
          } else {
            state.isLimiting = state.rpm >= 6900;
          }
        }
        const k = state.rpm < 1650 && state.rpm > 1250 ? 1.35 : 2.25;
        state.rpm = Math.min(7200, state.rpm + (state.targetRPM - state.rpm) * k * dt);
      } else {
        state.isLimiting = false;
        const lope = Math.sin((now / 1000) * Math.PI * 2 * 10) * 18;
        state.targetRPM = 650 + lope;
        state.rpm += (state.targetRPM - state.rpm) * 1.15 * dt;
      }

      const normRpm = Math.max(0, Math.min(1, state.rpm / 7200));
      state.exhaustGlow = state.revActive ? 0.25 + normRpm * 1.45 : state.isRunning ? 0.18 : 0.05;
      state.bonnetRattleActive = !state.reducedMotion && state.chapterIndex === 3;
      state.activeShakeAmplitude = state.reducedMotion
        ? 0
        : state.revActive && state.throttle > 0
          ? 0.004 + normRpm * 0.018
          : state.chapterIndex === 3 || state.chapterIndex === 4
            ? 0.002
            : 0;

      // Update gauge & rev HUD
      const rpmRounded = Math.round(state.rpm);
      document.querySelector('[data-testid="gauge-rpm"]').textContent = rpmRounded + ' RPM';
      document.querySelector('[data-testid="gauge-needle"]').style.transform = 'rotate(' + (-120 + normRpm * 240).toFixed(1) + 'deg)';
      document.querySelector('[data-testid="rev-rpm-readout"]').textContent = rpmRounded + ' RPM';
      const arc = document.querySelector('[data-testid="rev-arc"]');
      arc.setAttribute('stroke-dashoffset', (69.115 * (1 - normRpm)).toFixed(2));

      if (gl && program) {
        gl.useProgram(program);
        gl.uniform1f(gl.getUniformLocation(program, 'uHead'), state.headlights);
        gl.uniform1f(gl.getUniformLocation(program, 'uGlow'), state.exhaustGlow);
        gl.uniform1f(gl.getUniformLocation(program, 'uProg'), state.progress);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      requestAnimationFrame(tick);
    }

    window.__DEFENDER_APP__ = {
      getChapter() {
        const ch = CHAPTERS[state.chapterIndex];
        const span = Math.max(0.001, ch.end - ch.start);
        return {
          index: state.chapterIndex,
          id: ch.id,
          title: ch.title,
          progress: Number(state.progress.toFixed(4)),
          localProgress: Number(Math.max(0, Math.min(1, (state.progress - ch.start) / span)).toFixed(4)),
        };
      },
      getRigState() {
        return {
          camPos: [...state.camPos],
          lookAt: [...state.lookAt],
          fov: state.fov,
          doorAngle: state.doorAngle,
          interiorLight: state.interiorLight,
          headlights: state.headlights,
          fogDensity: state.fogDensity,
          cockpitMix: state.cockpitMix,
          gaugeVisible: state.gaugeVisible,
          revActive: state.revActive,
          reducedMotion: state.reducedMotion,
          scrollHeightVh: 900,
        };
      },
      getSceneDebug() {
        return {
          isReady: state.isReady,
          isFallbackModel: state.isFallbackModel,
          isFallbackEnv: state.isFallbackEnv,
          pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          maxPixelRatio: 2,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            isMobile: window.innerWidth < 768,
          },
          activeShakeAmplitude: state.activeShakeAmplitude,
          exhaustGlow: Number(state.exhaustGlow.toFixed(4)),
          bonnetRattleActive: state.bonnetRattleActive,
          rafLoopCount: state.rafLoopCount,
        };
      },
      getAudioState() {
        return {
          rpm: Math.round(state.rpm),
          targetRPM: Math.round(state.targetRPM),
          throttle: state.throttle,
          mix: state.cockpitMix,
          isRunning: state.isRunning,
          isUnlocked: state.audioUnlocked,
          isCranking: false,
          isLimiting: state.isLimiting,
          mode: state.audioMode,
          contextState: state.audioCtx ? state.audioCtx.state : 'none',
        };
      },
    };

    // Ready transition
    const loader = document.querySelector('[data-testid="loader"]');
    loader.setAttribute('data-progress', '100');
    loader.setAttribute('aria-valuenow', '100');
    document.querySelector('[data-testid="loader-percent"]').textContent = '100%';
    loader.setAttribute('data-loading', 'false');
    canvas.setAttribute('data-ready', 'true');
    state.isReady = true;
    updateFromScroll();
    requestAnimationFrame(tick);
  </script>
</body>
</html>`;

export async function startMockFixtureServer(port = 0, host = '127.0.0.1') {
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];
    if (urlPath === '/' || urlPath === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(MOCK_HTML);
      return;
    }
    if (urlPath === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    // Emulate Vite SPA fallback (200 OK text/html) for missing /assets/* paths
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(MOCK_HTML);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port, host }, resolve);
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  const url = `http://${host}:${actualPort}`;

  return {
    url,
    port: actualPort,
    close: async () => {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
