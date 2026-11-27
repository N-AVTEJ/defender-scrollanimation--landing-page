/**
 * Defender-styled SVG RPM Gauge & Speed Readout (CH 03–04).
 * Needle sweeps -125 deg (0 RPM) to +125 deg (8000 RPM).
 */
export function createGaugeUI(container, { maxRPM = 8000 } = {}) {
  if (!container) {
    return { setVisible() {}, triggerSelfTest() {}, update() {}, dispose() {} };
  }

  container.className = 'rpm-gauge';
  container.setAttribute('data-testid', 'rpm-gauge');
  container.setAttribute('data-visible', 'false');
  container.setAttribute('aria-hidden', 'true');

  // 250-degree arc length on r=68: (250/360) * 2 * pi * 68 = 296.7
  const arcRadius = 68;
  const arcTotal = (250 / 360) * 2 * Math.PI * arcRadius;

  container.innerHTML = `
    <svg class="rpm-gauge-svg" viewBox="0 0 180 142" aria-hidden="true">
      <circle
        cx="90"
        cy="90"
        r="${arcRadius}"
        fill="none"
        stroke="rgba(232,226,211,0.16)"
        stroke-width="4"
        stroke-dasharray="${arcTotal.toFixed(1)} 999"
        transform="rotate(145 90 90)"
        stroke-linecap="round"
      />
      <circle
        class="rpm-gauge-fill"
        cx="90"
        cy="90"
        r="${arcRadius}"
        fill="none"
        stroke="#e0541f"
        stroke-width="4"
        stroke-dasharray="0 999"
        transform="rotate(145 90 90)"
        stroke-linecap="round"
      />
      <g class="rpm-needle" data-testid="rpm-needle">
        <line x1="90" y1="90" x2="90" y2="30" stroke="#e0541f" stroke-width="2.5" stroke-linecap="round" />
        <circle cx="90" cy="90" r="5" fill="#e8e2d3" />
      </g>
      <text x="90" y="128" text-anchor="middle" fill="#8d8779" font-family="'IBM Plex Mono', monospace" font-size="8" letter-spacing="2">RPM x1000</text>
    </svg>
    <div class="rpm-gauge-meta">
      <span class="rpm-gauge-value" data-testid="gauge-rpm-value">0000 RPM</span>
      <span class="rpm-gauge-speed" data-testid="gauge-speed-value">0 KM/H</span>
    </div>
  `;

  const needleEl = container.querySelector('.rpm-needle');
  const fillEl = container.querySelector('.rpm-gauge-fill');
  const rpmEl = container.querySelector('[data-testid="gauge-rpm-value"]');

  let isVisible = false;
  let selfTestTimer = 0;
  let isSelfTesting = false;
  let lastDisplayRpm = -1;

  function applyRpmVisual(rpm) {
    const clamped = Math.max(0, Math.min(maxRPM, rpm));
    const ratio = clamped / maxRPM;
    const deg = -125 + ratio * 250;
    if (needleEl) {
      needleEl.style.transform = `rotate(${deg.toFixed(1)}deg)`;
    }
    if (fillEl) {
      fillEl.setAttribute('stroke-dasharray', `${(ratio * arcTotal).toFixed(1)} 999`);
    }
    const rounded = Math.round(clamped);
    if (rpmEl && rounded !== lastDisplayRpm) {
      lastDisplayRpm = rounded;
      rpmEl.textContent = `${String(rounded).padStart(4, '0')} RPM`;
    }
  }

  function setVisible(visible) {
    const next = Boolean(visible);
    if (next === isVisible) return;
    isVisible = next;
    container.setAttribute('data-visible', next ? 'true' : 'false');
    container.setAttribute('aria-hidden', next ? 'false' : 'true');
  }

  function triggerSelfTest(reducedMotion = false) {
    if (reducedMotion || isSelfTesting) return;
    isSelfTesting = true;
    const start = performance.now();
    const duration = 900;

    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      // Triangle sweep 0 -> 7200 -> 650
      const sweepRpm = t < 0.5 ? (t / 0.5) * 7200 : 7200 - ((t - 0.5) / 0.5) * 6550;
      applyRpmVisual(sweepRpm);
      if (t < 1 && isSelfTesting) {
        selfTestTimer = requestAnimationFrame(step);
      } else {
        isSelfTesting = false;
      }
    }

    selfTestTimer = requestAnimationFrame(step);
  }

  function update(rpm) {
    if (isSelfTesting) return;
    applyRpmVisual(rpm);
  }

  return {
    setVisible,
    triggerSelfTest,
    update,
    dispose() {
      isSelfTesting = false;
      cancelAnimationFrame(selfTestTimer);
      container.innerHTML = '';
    },
  };
}
