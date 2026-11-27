/**
 * Magnetic "REV IT TO 7200 RPM" Hold Control + SVG Progress Arc Ring (CH 06).
 * Supports pointerdown/up, touchstart/touchend, and Spacebar hold/release.
 */
export function createRevControl(
  container,
  { redlineRPM = 7200, idleRPM = 650, onThrottleChange, reducedMotion = false } = {}
) {
  if (!container) {
    return { setVisible() {}, update() {}, isPressed: () => false, dispose() {} };
  }

  container.className = 'rev-panel';
  container.setAttribute('data-visible', 'false');
  container.setAttribute('aria-hidden', 'true');

  const r = 68;
  const circumference = 2 * Math.PI * r;

  container.innerHTML = `
    <div class="rev-readout-wrap">
      <div class="rev-rpm-readout" data-testid="rev-rpm-readout">0650</div>
      <span class="rev-rpm-unit">RPM · 5.0L V8</span>
    </div>
    <div class="rev-button-wrap">
      <svg class="rev-arc-svg" viewBox="0 0 148 148" aria-hidden="true">
        <circle
          cx="74"
          cy="74"
          r="${r}"
          fill="none"
          stroke="rgba(232,226,211,0.14)"
          stroke-width="3"
        />
        <circle
          class="rev-arc-ring"
          data-testid="rev-arc"
          cx="74"
          cy="74"
          r="${r}"
          fill="none"
          stroke="#e0541f"
          stroke-width="3.5"
          stroke-linecap="round"
          stroke-dasharray="${circumference.toFixed(2)}"
          stroke-dashoffset="${circumference.toFixed(2)}"
        />
      </svg>
      <button
        type="button"
        class="rev-button"
        data-testid="rev-button"
        data-pressed="false"
        aria-pressed="false"
      >
        REV IT TO 7200 RPM
      </button>
    </div>
    <span class="rev-hint">HOLD CLICK · TOUCH · SPACE</span>
  `;

  const button = container.querySelector('[data-testid="rev-button"]');
  const readoutEl = container.querySelector('[data-testid="rev-rpm-readout"]');
  const arcEl = container.querySelector('[data-testid="rev-arc"]');

  let isVisible = false;
  let pressed = false;
  let lastDisplayedRpm = -1;

  function setPressed(next) {
    const val = Boolean(next);
    if (val === pressed) return;
    pressed = val;
    if (button) {
      button.setAttribute('data-pressed', val ? 'true' : 'false');
      button.setAttribute('aria-pressed', val ? 'true' : 'false');
    }
    if (typeof onThrottleChange === 'function') {
      onThrottleChange(val ? 1 : 0);
    }
  }

  function onPointerDown(e) {
    if (!isVisible) return;
    e.preventDefault();
    setPressed(true);
  }

  function onPointerRelease() {
    if (pressed) {
      setPressed(false);
    }
  }

  function onPointerMove(e) {
    if (reducedMotion || !isVisible || !button) return;
    const rect = button.getBoundingClientRect();
    const dx = Math.max(-12, Math.min(12, (e.clientX - (rect.left + rect.width / 2)) * 0.16));
    const dy = Math.max(-12, Math.min(12, (e.clientY - (rect.top + rect.height / 2)) * 0.16));
    const scale = pressed ? 0.94 : 1;
    button.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${scale})`;
  }

  function onPointerLeave() {
    if (button) {
      button.style.transform = '';
    }
    onPointerRelease();
  }

  function onKeyDown(e) {
    if (!isVisible || e.code !== 'Space' || e.repeat) return;
    const activeModal = document.querySelector('[data-testid="licensing-modal"][data-open="true"]');
    if (activeModal) return;
    e.preventDefault();
    setPressed(true);
  }

  function onKeyUp(e) {
    if (e.code === 'Space' && pressed) {
      e.preventDefault();
      setPressed(false);
    }
  }

  if (button) {
    button.addEventListener('pointerdown', onPointerDown);
    button.addEventListener('pointermove', onPointerMove);
    button.addEventListener('pointerleave', onPointerLeave);
    button.addEventListener('touchstart', onPointerDown, { passive: false });
    button.addEventListener('touchend', onPointerRelease);
    button.addEventListener('touchcancel', onPointerRelease);
  }
  window.addEventListener('pointerup', onPointerRelease);
  window.addEventListener('pointercancel', onPointerRelease);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onPointerRelease);

  function setVisible(visible) {
    const next = Boolean(visible);
    if (next === isVisible) return;
    isVisible = next;
    container.setAttribute('data-visible', next ? 'true' : 'false');
    container.setAttribute('aria-hidden', next ? 'false' : 'true');
    if (!next && pressed) {
      setPressed(false);
    }
  }

  function update(rpm) {
    const safeRpm = Math.max(0, Math.min(redlineRPM, Number.isFinite(rpm) ? rpm : idleRPM));
    const rounded = Math.round(safeRpm);
    if (readoutEl && rounded !== lastDisplayedRpm) {
      lastDisplayedRpm = rounded;
      readoutEl.textContent = String(rounded).padStart(4, '0');
    }
    if (arcEl) {
      const ratio = Math.max(0, Math.min(1, safeRpm / redlineRPM));
      const offset = circumference * (1 - ratio);
      const offsetStr = offset.toFixed(2);
      arcEl.setAttribute('stroke-dashoffset', offsetStr);
      arcEl.style.strokeDashoffset = offsetStr;
    }
  }

  return {
    setVisible,
    update,
    isPressed: () => pressed,
    dispose() {
      setPressed(false);
      if (button) {
        button.removeEventListener('pointerdown', onPointerDown);
        button.removeEventListener('pointermove', onPointerMove);
        button.removeEventListener('pointerleave', onPointerLeave);
        button.removeEventListener('touchstart', onPointerDown);
        button.removeEventListener('touchend', onPointerRelease);
        button.removeEventListener('touchcancel', onPointerRelease);
      }
      window.removeEventListener('pointerup', onPointerRelease);
      window.removeEventListener('pointercancel', onPointerRelease);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onPointerRelease);
      container.innerHTML = '';
    },
  };
}
