/**
 * Asymmetric Editorial Chapter Overlay (CH 01–06).
 */
export function createChapterOverlay(container, chapters) {
  if (!container) {
    return { setChapter() {}, dispose() {} };
  }

  const first = chapters?.[0] || {
    id: '01',
    title: 'Approach',
    copy: '',
    spec: '5.0L SUPERCHARGED · 525 PS · 625 Nm · 0–100 IN 5.2 S',
  };

  container.className = 'chapter-overlay';
  container.setAttribute('data-testid', 'chapter-overlay');
  container.setAttribute('data-chapter', first.id);

  container.innerHTML = `
    <div class="chapter-header">
      <span class="chapter-numeral" data-testid="chapter-numeral">${first.id}</span>
      <h2 class="chapter-title" data-testid="chapter-title">${first.title}</h2>
    </div>
    <div class="chapter-rule" aria-hidden="true"></div>
    <p class="chapter-copy" data-testid="chapter-copy">${first.copy}</p>
    <p class="chapter-spec" data-testid="chapter-spec">${first.spec}</p>
  `;

  const numeralEl = container.querySelector('[data-testid="chapter-numeral"]');
  const titleEl = container.querySelector('[data-testid="chapter-title"]');
  const copyEl = container.querySelector('[data-testid="chapter-copy"]');
  const specEl = container.querySelector('[data-testid="chapter-spec"]');

  let currentId = first.id;
  let transitionTimer = 0;

  function setChapter(chapter) {
    if (!chapter || chapter.id === currentId) return;
    currentId = chapter.id;
    container.setAttribute('data-chapter', chapter.id);
    container.classList.add('is-transitioning');

    if (numeralEl) numeralEl.textContent = chapter.id;
    if (titleEl) titleEl.textContent = chapter.title;
    if (copyEl) copyEl.textContent = chapter.copy;
    if (specEl) specEl.textContent = chapter.spec;

    clearTimeout(transitionTimer);
    transitionTimer = window.setTimeout(() => {
      container.classList.remove('is-transitioning');
    }, 120);
  }

  return {
    setChapter,
    dispose() {
      clearTimeout(transitionTimer);
      container.innerHTML = '';
    },
  };
}
