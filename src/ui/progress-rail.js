/**
 * Right-hand 01–06 Interactive Chapter Progress Rail.
 */
export function createProgressRail(container, chapters, onSelectChapter) {
  if (!container) {
    return { setActiveChapter() {}, dispose() {} };
  }

  container.className = 'progress-rail';
  container.setAttribute('data-testid', 'progress-rail');
  container.setAttribute('aria-label', 'Chapter navigation');

  container.innerHTML = (chapters || [])
    .map(
      (ch, idx) => `
      <button
        type="button"
        class="rail-btn"
        data-rail-chapter="${ch.id}"
        aria-label="Jump to Chapter ${ch.id}: ${ch.title}"
        ${idx === 0 ? 'aria-current="step"' : ''}
      >
        <span>${ch.id}</span>
        <span class="rail-tick" aria-hidden="true"></span>
      </button>
    `
    )
    .join('');

  const buttons = Array.from(container.querySelectorAll('[data-rail-chapter]'));
  let activeId = chapters?.[0]?.id ?? '01';

  function handleClick(e) {
    const btn = e.target.closest('[data-rail-chapter]');
    if (!btn) return;
    const id = btn.getAttribute('data-rail-chapter');
    if (id && typeof onSelectChapter === 'function') {
      onSelectChapter(id);
    }
  }

  container.addEventListener('click', handleClick);

  function setActiveChapter(chapterId) {
    if (!chapterId || chapterId === activeId) return;
    activeId = chapterId;
    for (const btn of buttons) {
      if (btn.getAttribute('data-rail-chapter') === chapterId) {
        btn.setAttribute('aria-current', 'step');
      } else {
        btn.removeAttribute('aria-current');
      }
    }
  }

  return {
    setActiveChapter,
    dispose() {
      container.removeEventListener('click', handleClick);
      container.innerHTML = '';
    },
  };
}
