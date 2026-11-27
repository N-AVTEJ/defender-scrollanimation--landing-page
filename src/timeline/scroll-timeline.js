/**
 * Master GSAP + ScrollTrigger + Lenis Timeline (900vh, CH 01–06).
 * Scrub-reversible across 0.000..1.000 with direction-aware door & ignition cues.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

/**
 * Resolves the active chapter object and local progress for normalized scroll progress.
 * @param {Array} chapters
 * @param {number} progress
 */
export function resolveChapter(chapters, progress) {
  const p = Math.max(0, Math.min(1, progress));
  let index = 0;
  for (let i = 0; i < chapters.length; i++) {
    const [start, end] = chapters[i].range;
    if (p >= start && (p < end || i === chapters.length - 1)) {
      index = i;
      break;
    }
  }
  const ch = chapters[index];
  const span = Math.max(0.001, ch.range[1] - ch.range[0]);
  const localProgress = Math.max(0, Math.min(1, (p - ch.range[0]) / span));
  return { index, chapter: ch, localProgress };
}

/**
 * Creates the Lenis + ScrollTrigger master timeline.
 */
export function createScrollTimeline({
  config,
  engineAudio,
  reducedMotion = false,
  onProgress,
  onChapterChange,
  onIgnitionStart,
} = {}) {
  const { CHAPTERS, CAMERA_KEYFRAMES, SCROLL_CONFIG } = config;
  const scrollStage = document.getElementById('scroll-stage');
  if (scrollStage) {
    scrollStage.style.height = `${SCROLL_CONFIG.totalHeightVh}vh`;
  }

  // Explicitly ensure normalizeScroll is off per scroll architecture spec
  if (typeof ScrollTrigger.normalizeScroll === 'function') {
    ScrollTrigger.normalizeScroll(SCROLL_CONFIG.normalizeScroll);
  }

  const lenis = new Lenis({
    autoRaf: false,
    smoothWheel: !reducedMotion,
    syncTouch: false,
    lerp: reducedMotion ? 1 : 0.1,
  });

  lenis.on('scroll', ScrollTrigger.update);

  const kf0 = CAMERA_KEYFRAMES[0];
  const tweenState = {
    dPosX: kf0.desktop.pos[0],
    dPosY: kf0.desktop.pos[1],
    dPosZ: kf0.desktop.pos[2],
    dLookX: kf0.desktop.lookAt[0],
    dLookY: kf0.desktop.lookAt[1],
    dLookZ: kf0.desktop.lookAt[2],
    dFov: kf0.desktop.fov,

    mPosX: kf0.mobile.pos[0],
    mPosY: kf0.mobile.pos[1],
    mPosZ: kf0.mobile.pos[2],
    mLookX: kf0.mobile.lookAt[0],
    mLookY: kf0.mobile.lookAt[1],
    mLookZ: kf0.mobile.lookAt[2],
    mFov: kf0.mobile.fov,

    doorAngle: kf0.doorAngle,
    interiorLight: kf0.interiorLight,
    headlights: kf0.headlights,
    fogDensity: kf0.fogDensity,
    cockpitMix: kf0.cockpitMix,
    gaugeVisible: kf0.gaugeVisible ? 1 : 0,
    revActive: kf0.revActive ? 1 : 0,
  };

  let currentProgress = 0;
  let prevProgress = 0;
  let currentChapterInfo = resolveChapter(CHAPTERS, 0);
  let isInitialized = false;

  function evaluateDirectionCues(prevP, nextP) {
    if (Math.abs(nextP - prevP) < 1e-5) return;
    const forward = nextP > prevP;

    // CH 02 door latch sound (forward at 0.250, reverse at 0.240)
    if (forward && prevP < 0.25 && nextP >= 0.25) {
      engineAudio?.triggerDoorLatch?.();
    } else if (!forward && prevP > 0.24 && nextP <= 0.24) {
      engineAudio?.triggerDoorLatch?.();
    }

    // CH 03 & CH 05 door shut heavy thunk
    if (forward && prevP < 0.485 && nextP >= 0.485) {
      engineAudio?.triggerDoorThunk?.();
    }
    if (forward && prevP < 0.755 && nextP >= 0.755) {
      engineAudio?.triggerDoorThunk?.();
    }

    // CH 04 engine ignition start / reverse stop
    if (forward && prevP < 0.525 && nextP >= 0.525) {
      engineAudio?.start?.();
      onIgnitionStart?.();
    } else if (!forward && prevP >= 0.515 && nextP < 0.515) {
      engineAudio?.stop?.();
    }
  }

  const masterTl = gsap.timeline({
    onUpdate() {
      if (!isInitialized) return;
      prevProgress = currentProgress;
      currentProgress = masterTl.progress();

      evaluateDirectionCues(prevProgress, currentProgress);
      engineAudio?.setMix?.(tweenState.cockpitMix);

      const nextInfo = resolveChapter(CHAPTERS, currentProgress);
      const chapterChanged = nextInfo.chapter.id !== currentChapterInfo.chapter.id;
      currentChapterInfo = nextInfo;

      if (chapterChanged) {
        onChapterChange?.(nextInfo);
      }
      onProgress?.(currentProgress, nextInfo);
    },
    scrollTrigger: {
      trigger: scrollStage || document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: reducedMotion ? 0.05 : SCROLL_CONFIG.scrub,
      invalidateOnRefresh: true,
    },
  });

  // Build piecewise-eased timeline segments matching CAMERA_KEYFRAMES
  for (let i = 1; i < CAMERA_KEYFRAMES.length; i++) {
    const prevKf = CAMERA_KEYFRAMES[i - 1];
    const nextKf = CAMERA_KEYFRAMES[i];
    const duration = Math.max(0.001, nextKf.progress - prevKf.progress);

    masterTl.to(
      tweenState,
      {
        dPosX: nextKf.desktop.pos[0],
        dPosY: nextKf.desktop.pos[1],
        dPosZ: nextKf.desktop.pos[2],
        dLookX: nextKf.desktop.lookAt[0],
        dLookY: nextKf.desktop.lookAt[1],
        dLookZ: nextKf.desktop.lookAt[2],
        dFov: nextKf.desktop.fov,

        mPosX: nextKf.mobile.pos[0],
        mPosY: nextKf.mobile.pos[1],
        mPosZ: nextKf.mobile.pos[2],
        mLookX: nextKf.mobile.lookAt[0],
        mLookY: nextKf.mobile.lookAt[1],
        mLookZ: nextKf.mobile.lookAt[2],
        mFov: nextKf.mobile.fov,

        doorAngle: nextKf.doorAngle,
        interiorLight: nextKf.interiorLight,
        headlights: nextKf.headlights,
        fogDensity: nextKf.fogDensity,
        cockpitMix: nextKf.cockpitMix,
        gaugeVisible: nextKf.gaugeVisible ? 1 : 0,
        revActive: nextKf.revActive ? 1 : 0,

        duration,
        ease: reducedMotion ? 'none' : nextKf.ease || 'none',
      },
      prevKf.progress
    );
  }

  ScrollTrigger.refresh();
  isInitialized = true;

  let liveReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rmMql =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
  const onRmChange = (e) => {
    liveReducedMotion = Boolean(e.matches);
  };
  rmMql?.addEventListener?.('change', onRmChange);

  function getRigState() {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    const chId = currentChapterInfo.chapter.id;
    return {
      camPos: isMobile
        ? [tweenState.mPosX, tweenState.mPosY, tweenState.mPosZ]
        : [tweenState.dPosX, tweenState.dPosY, tweenState.dPosZ],
      lookAt: isMobile
        ? [tweenState.mLookX, tweenState.mLookY, tweenState.mLookZ]
        : [tweenState.dLookX, tweenState.dLookY, tweenState.dLookZ],
      fov: isMobile ? tweenState.mFov : tweenState.dFov,
      doorAngle: tweenState.doorAngle,
      interiorLight: tweenState.interiorLight,
      headlights: tweenState.headlights,
      fogDensity: tweenState.fogDensity,
      cockpitMix: tweenState.cockpitMix,
      gaugeVisible: tweenState.gaugeVisible >= 0.5 || chId === '03' || chId === '04',
      revActive: tweenState.revActive >= 0.5 || chId === '06',
      reducedMotion: reducedMotion || liveReducedMotion,
      scrollHeightVh: SCROLL_CONFIG.totalHeightVh,
    };
  }

  function getChapter() {
    return {
      index: currentChapterInfo.index,
      id: currentChapterInfo.chapter.id,
      title: currentChapterInfo.chapter.title,
      progress: Number(currentProgress.toFixed(4)),
      localProgress: Number(currentChapterInfo.localProgress.toFixed(4)),
    };
  }

  function scrollToChapter(chapterId) {
    const ch = CHAPTERS.find((c) => c.id === chapterId);
    if (!ch) return;
    const targetP = (ch.range[0] + ch.range[1]) * 0.5;
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const targetY = Math.round(maxY * targetP);
    if (reducedMotion) {
      window.scrollTo({ top: targetY, behavior: 'instant' });
    } else {
      lenis.scrollTo(targetY, { duration: 1.1 });
    }
  }

  return {
    lenis,
    getRigState,
    getChapter,
    getProgress: () => currentProgress,
    scrollToChapter,
    refresh() {
      ScrollTrigger.refresh();
    },
    dispose() {
      rmMql?.removeEventListener?.('change', onRmChange);
      masterTl.scrollTrigger?.kill();
      masterTl.kill();
      lenis.destroy();
    },
  };
}
