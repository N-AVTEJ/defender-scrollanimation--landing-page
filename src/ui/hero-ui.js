/**
 * Hero Lockup: "DEFENDER V8" letter-by-letter reveal & hairline scroll cue.
 */
export function createHeroUI(container, { reducedMotion = false } = {}) {
  if (!container) {
    return { setVisible() {}, dispose() {} };
  }

  container.className = 'hero-root';
  container.setAttribute('data-visible', 'true');

  const titleText = 'DEFENDER V8';
  const lettersHtml = titleText
    .split('')
    .map((ch, i) => {
      if (ch === ' ') {
        return '<span class="hero-letter hero-letter-space" aria-hidden="true">&nbsp;</span>';
      }
      const delay = reducedMotion ? 0 : i * 32;
      return `<span class="hero-letter" style="transition-delay:${delay}ms">${ch}</span>`;
    })
    .join('');

  container.innerHTML = `
    <p class="hero-kicker">EDITION 110 · 5.0L SUPERCHARGED</p>
    <h1 class="hero-title" data-testid="hero-title" aria-label="DEFENDER V8">${lettersHtml}</h1>
    <div class="hero-hairline" data-testid="hairline-rule" aria-hidden="true"></div>
    <div class="scroll-cue" data-testid="scroll-cue">
      <span class="scroll-cue-line" aria-hidden="true"></span>
      <span>Scroll</span>
    </div>
  `;

  const letterEls = container.querySelectorAll('.hero-letter');
  const rafId = requestAnimationFrame(() => {
    for (const el of letterEls) {
      el.classList.add('is-revealed');
    }
  });

  let isVisible = true;

  function setVisible(visible) {
    const next = Boolean(visible);
    if (next === isVisible) return;
    isVisible = next;
    container.setAttribute('data-visible', next ? 'true' : 'false');
  }

  return {
    setVisible,
    dispose() {
      cancelAnimationFrame(rafId);
      container.innerHTML = '';
    },
  };
}
