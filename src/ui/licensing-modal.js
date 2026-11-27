/**
 * Footer credits bar & accessible "Model & audio licensing" modal.
 */
export function createLicensingModal(footerContainer, modalContainer) {
  if (footerContainer) {
    footerContainer.className = 'footer-bar';
    footerContainer.innerHTML = `
      <span class="footer-credits">LAND ROVER DEFENDER 110 V8 · WEBGL / GSAP / WEB AUDIO SHOWCASE</span>
      <button
        type="button"
        class="licensing-trigger"
        data-testid="licensing-trigger"
        aria-haspopup="dialog"
      >
        Model &amp; audio licensing
      </button>
    `;
  }

  if (!modalContainer) {
    return { open() {}, close() {}, dispose() {} };
  }

  modalContainer.innerHTML = `
    <div
      class="licensing-modal"
      data-testid="licensing-modal"
      data-open="false"
      role="dialog"
      aria-modal="true"
      aria-labelledby="licensing-modal-title"
      aria-hidden="true"
    >
      <div class="licensing-card">
        <div class="licensing-card-head">
          <h2 class="licensing-card-title" id="licensing-modal-title">Model &amp; audio licensing</h2>
          <button
            type="button"
            class="licensing-close"
            data-testid="licensing-close"
            aria-label="Close licensing dialog"
          >
            Close
          </button>
        </div>
        <div class="licensing-body">
          <p>
            This open-source WebGL showcase includes zero proprietary Land Rover CAD geometry or
            commercial engine recordings. When drop-in assets under <code>/public/assets/</code> are
            absent, it renders an original procedural Defender 110 silhouette and synthesizes a
            5.0L cross-plane V8 soundtrack in real time via Web Audio API.
          </p>
          <p>
            To supply your own licensed GLB model (<code>/assets/model/defender.glb</code>), HDRI
            environment (<code>/assets/hdr/studio_mist.hdr</code>), and 48 kHz WAV engine loops
            (<code>/assets/audio/*.wav</code>), follow the schema in <code>README.md</code> and
            <code>ASSET_CHECKLIST.md</code>.
          </p>
        </div>
      </div>
    </div>
  `;

  const triggerBtn = footerContainer?.querySelector('[data-testid="licensing-trigger"]');
  const modalEl = modalContainer.querySelector('[data-testid="licensing-modal"]');
  const closeBtn = modalContainer.querySelector('[data-testid="licensing-close"]');

  let isOpen = false;

  function open() {
    if (!modalEl || isOpen) return;
    isOpen = true;
    modalEl.setAttribute('data-open', 'true');
    modalEl.setAttribute('aria-hidden', 'false');
    closeBtn?.focus();
  }

  function close() {
    if (!modalEl || !isOpen) return;
    isOpen = false;
    modalEl.setAttribute('data-open', 'false');
    modalEl.setAttribute('aria-hidden', 'true');
    triggerBtn?.focus();
  }

  function onBackdropClick(e) {
    if (e.target === modalEl) {
      close();
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape' && isOpen) {
      close();
    }
  }

  triggerBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  modalEl?.addEventListener('click', onBackdropClick);
  window.addEventListener('keydown', onKeyDown);

  return {
    open,
    close,
    dispose() {
      triggerBtn?.removeEventListener('click', open);
      closeBtn?.removeEventListener('click', close);
      modalEl?.removeEventListener('click', onBackdropClick);
      window.removeEventListener('keydown', onKeyDown);
      if (footerContainer) footerContainer.innerHTML = '';
      modalContainer.innerHTML = '';
    },
  };
}
