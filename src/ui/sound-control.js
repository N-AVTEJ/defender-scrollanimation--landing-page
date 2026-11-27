/**
 * "Enable sound" user-gesture AudioContext unlock & mute toggle.
 */
export function createSoundControl(container, engineAudio) {
  if (!container) {
    return { sync() {}, dispose() {} };
  }

  container.innerHTML = `
    <button
      type="button"
      class="sound-btn"
      data-testid="enable-sound-btn"
      data-unlocked="false"
      data-muted="true"
      aria-pressed="false"
    >
      <span class="sound-dot" aria-hidden="true"></span>
      <span class="sound-label">Enable sound</span>
    </button>
  `;

  const btn = container.querySelector('[data-testid="enable-sound-btn"]');
  const labelEl = container.querySelector('.sound-label');
  let unlocked = false;
  let muted = true;

  function render() {
    if (!btn || !labelEl) return;
    btn.setAttribute('data-unlocked', unlocked ? 'true' : 'false');
    btn.setAttribute('data-muted', muted ? 'true' : 'false');
    btn.setAttribute('aria-pressed', unlocked && !muted ? 'true' : 'false');

    if (!unlocked) {
      labelEl.textContent = 'Enable sound';
    } else if (muted) {
      labelEl.textContent = 'Sound muted';
    } else {
      labelEl.textContent = 'Sound on';
    }
  }

  async function handleClick() {
    if (!unlocked) {
      await engineAudio?.init?.();
      unlocked = true;
      muted = false;
      engineAudio?.setMuted?.(false);
      render();
      return;
    }

    muted = !muted;
    if (typeof engineAudio?.setMuted === 'function') {
      engineAudio.setMuted(muted);
    } else if (engineAudio?._nodes?.masterGain && engineAudio?._ctx) {
      engineAudio._nodes.masterGain.gain.setTargetAtTime(
        muted ? 0 : 0.9,
        engineAudio._ctx.currentTime,
        0.04
      );
    }
    render();
  }

  if (btn) {
    btn.addEventListener('click', handleClick);
  }

  return {
    sync() {
      const state = engineAudio?.getState?.();
      if (state?.isUnlocked && !unlocked) {
        unlocked = true;
        muted = false;
        render();
      }
    },
    dispose() {
      if (btn) {
        btn.removeEventListener('click', handleClick);
      }
      container.innerHTML = '';
    },
  };
}
