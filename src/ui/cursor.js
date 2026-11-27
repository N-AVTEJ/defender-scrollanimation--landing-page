/**
 * Custom editorial crosshair cursor (pointer: fine devices only).
 */
export function createCustomCursor(container, { reducedMotion = false } = {}) {
  if (!container) {
    return { dispose() {} };
  }

  const isFine =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: fine)').matches;

  if (!isFine || reducedMotion) {
    return { dispose() {} };
  }

  document.documentElement.classList.add('has-custom-cursor');
  container.innerHTML = '<div class="custom-cursor" data-testid="custom-cursor" data-active="false"></div>';
  const cursorEl = container.querySelector('[data-testid="custom-cursor"]');

  function onMove(e) {
    if (!cursorEl) return;
    cursorEl.setAttribute('data-active', 'true');
    cursorEl.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    const hoverTarget = e.target?.closest?.('button, a, [role="button"]');
    cursorEl.setAttribute('data-hover', hoverTarget ? 'true' : 'false');
  }

  function onLeave() {
    if (cursorEl) {
      cursorEl.setAttribute('data-active', 'false');
    }
  }

  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('mouseleave', onLeave);

  return {
    dispose() {
      document.documentElement.classList.remove('has-custom-cursor');
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      container.innerHTML = '';
    },
  };
}
