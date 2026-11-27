/**
 * Percentage loading curtain controller.
 */
export function createLoaderUI() {
  const curtain = document.getElementById('loader-curtain');
  const percentEl = document.getElementById('loader-percent');
  const barEl = document.getElementById('loader-bar');

  let current = 0;

  function setProgress(ratio) {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    current = Math.max(current, clamped);
    const pct = Math.round(current * 100);

    if (percentEl) {
      percentEl.textContent = `${String(pct).padStart(3, '0')}%`;
    }
    if (barEl) {
      barEl.style.transform = `scaleX(${current.toFixed(4)})`;
    }
    if (curtain) {
      curtain.setAttribute('data-progress', String(pct));
      curtain.setAttribute('aria-valuenow', String(pct));
    }
  }

  function complete() {
    setProgress(1);
    if (curtain) {
      curtain.setAttribute('data-loaded', 'true');
      curtain.setAttribute('data-loading', 'false');
      curtain.setAttribute('aria-hidden', 'true');
    }
  }

  return {
    setProgress,
    complete,
    dispose() {},
  };
}
