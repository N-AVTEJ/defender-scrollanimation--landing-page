/**
 * 3D Scene Manager
 *
 * Owns WebGLRenderer, PerspectiveCamera (near <= 0.08m), HDRLoader + PMREMGenerator
 * with procedural studio-mist reflection fallback, wet-slate ground + soft contact shadow,
 * lights, fog, Defender vehicle rig, VFX controller, and postprocessing EffectComposer.
 */

import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FogExp2,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Scene,
  SpotLight,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { probeHdrAsset } from './asset-probe.js';
import { loadDefender } from './defender-loader.js';
import { createEffects } from './effects.js';
import { createPostprocessing } from './postprocessing.js';

const MAX_PIXEL_RATIO = 2;

/**
 * Generates a procedural soft underbody + 4-tire contact shadow CanvasTexture.
 * @param {object} vehicleDims
 */
function createContactShadowTexture(vehicleDims) {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, w, h);

  // Soft chassis umbra
  const grad = ctx.createRadialGradient(w * 0.5, h * 0.5, 18, w * 0.5, h * 0.5, w * 0.52);
  grad.addColorStop(0.0, 'rgba(3, 4, 3, 0.92)');
  grad.addColorStop(0.55, 'rgba(5, 6, 5, 0.56)');
  grad.addColorStop(1.0, 'rgba(5, 6, 5, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Darker tire contact patches mapped onto the 2.6m x 5.4m shadow plane
  const planeW = 2.6;
  const planeL = 5.4;
  const wheels = vehicleDims?.wheels
    ? Object.values(vehicleDims.wheels)
    : [
        [0.88, 0.41, 1.48],
        [-0.88, 0.41, 1.48],
        [0.88, 0.41, -1.48],
        [-0.88, 0.41, -1.48],
      ];

  for (const [wx, , wz] of wheels) {
    const px = (wx / planeW + 0.5) * w;
    const py = (-wz / planeL + 0.5) * h;
    const tireGrad = ctx.createRadialGradient(px, py, 3, px, py, 24);
    tireGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0.95)');
    tireGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = tireGrad;
    ctx.beginPath();
    ctx.ellipse(px, py, 16, 28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates a procedural studio-mist PMREM cube render target for crisp clearcoat highlights.
 * @param {PMREMGenerator} pmremGenerator
 * @param {object} config
 */
function buildFallbackStudioPMREM(pmremGenerator, config) {
  const studioScene = new Scene();
  const bgHex = config?.PALETTE?.bg ?? '#0b0c0a';
  const boneHex = config?.PALETTE?.text ?? '#e8e2d3';
  const accentHex = config?.PALETTE?.accent ?? '#e0541f';
  studioScene.background = new Color(bgHex);

  const enclosureGeo = new BoxGeometry(30, 30, 30);
  const enclosureMat = new MeshBasicMaterial({ color: bgHex, side: BackSide });
  const enclosure = new Mesh(enclosureGeo, enclosureMat);
  studioScene.add(enclosure);

  const stripGeo = new PlaneGeometry(12, 2.2);
  const overheadMat = new MeshBasicMaterial({ color: new Color('#eef2f5').multiplyScalar(3.2) });
  const overhead = new Mesh(stripGeo, overheadMat);
  overhead.position.set(0, 6.2, 0.6);
  overhead.rotation.x = Math.PI / 2;
  studioScene.add(overhead);

  const frontGeo = new PlaneGeometry(7, 3.2);
  const frontMat = new MeshBasicMaterial({ color: new Color(boneHex).multiplyScalar(2.2) });
  const frontStrip = new Mesh(frontGeo, frontMat);
  frontStrip.position.set(5.0, 2.8, 4.5);
  frontStrip.lookAt(0, 1.0, 0);
  studioScene.add(frontStrip);

  const rimGeo = new PlaneGeometry(8, 2.8);
  const rimMat = new MeshBasicMaterial({ color: new Color('#9fb0c2').multiplyScalar(2.6) });
  const rimStrip = new Mesh(rimGeo, rimMat);
  rimStrip.position.set(-4.2, 3.2, -5.2);
  rimStrip.lookAt(0, 1.0, 0);
  studioScene.add(rimStrip);

  const accentGeo = new PlaneGeometry(3.2, 1.0);
  const accentMat = new MeshBasicMaterial({ color: new Color(accentHex).multiplyScalar(0.35) });
  const accentStrip = new Mesh(accentGeo, accentMat);
  accentStrip.position.set(0, 0.8, -6.5);
  accentStrip.lookAt(0, 0.6, 0);
  studioScene.add(accentStrip);

  const envRT = pmremGenerator.fromScene(studioScene, 0.04, 0.1, 100);

  enclosureGeo.dispose();
  enclosureMat.dispose();
  stripGeo.dispose();
  overheadMat.dispose();
  frontGeo.dispose();
  frontMat.dispose();
  rimGeo.dispose();
  rimMat.dispose();
  accentGeo.dispose();
  accentMat.dispose();

  return envRT;
}

/**
 * Updates emissive materials inside a headlight or taillight group.
 * @param {import('three').Object3D} group
 * @param {number} intensity
 */
function setGroupEmissiveIntensity(group, intensity) {
  if (!group) return;
  group.traverse((obj) => {
    if (obj.isMesh && obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (mat && 'emissiveIntensity' in mat && mat.emissive && mat.emissive.getHex() !== 0) {
          mat.emissiveIntensity = intensity;
        }
      }
    }
  });
}

/**
 * Creates and initializes the 3D WebGL scene manager.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} config
 * @param {import('three').LoadingManager|null} [loadingManager=null]
 * @param {object} [options={}]
 */
export async function createSceneManager(canvas, config, loadingManager = null, options = {}) {
  if (!canvas) {
    throw new Error('createSceneManager requires a valid HTMLCanvasElement');
  }

  function measureViewport() {
    const width = Math.max(1, canvas.clientWidth || window.innerWidth || 1);
    const height = Math.max(1, canvas.clientHeight || window.innerHeight || 1);
    const isMobile = width <= 768;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    return { width, height, isMobile, pixelRatio };
  }

  let viewport = measureViewport();
  let isReady = false;
  let rafLoopCount = options.rafLoopCount ?? 1;
  let lastTime = 0;
  let lastReducedMotion = false;

  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(viewport.pixelRatio);
  renderer.setSize(viewport.width, viewport.height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  const bgHex = config?.PALETTE?.bg ?? '#0b0c0a';
  scene.background = new Color(bgHex);
  const fogBaseDensity = config?.LIGHTING_CONFIG?.fog?.baseDensity ?? 0.055;
  scene.fog = new FogExp2(config?.LIGHTING_CONFIG?.fog?.color ?? bgHex, fogBaseDensity);

  const kf0 = config?.CAMERA_KEYFRAMES?.[0]?.[viewport.isMobile ? 'mobile' : 'desktop'] ?? {
    pos: [7.8, 2.35, 9.6],
    lookAt: [0, 0.95, 0.2],
    fov: 42,
  };
  const camera = new PerspectiveCamera(kf0.fov, viewport.width / viewport.height, 0.06, 120);
  camera.position.set(...kf0.pos);
  camera.lookAt(...kf0.lookAt);

  // Environment via HDRLoader + PMREMGenerator (with studio-mist fallback)
  const pmremGenerator = new PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();

  let envRT = null;
  let isFallbackEnv = false;
  const hdrUrl = config?.ASSET_PATHS?.hdrDefault ?? '/assets/hdr/studio_mist.hdr';
  const hdrProbe = await probeHdrAsset(hdrUrl, loadingManager);

  if (hdrProbe.ok) {
    try {
      const hdrLoader = new HDRLoader(loadingManager || undefined);
      const tex = hdrLoader.createDataTexture(hdrProbe.buffer);
      tex.mapping = EquirectangularReflectionMapping;
      envRT = pmremGenerator.fromEquirectangular(tex);
      tex.dispose();
      isFallbackEnv = false;
    } catch (err) {
      console.warn(
        '[scene-manager] Failed to decode HDR environment; using procedural studio-mist PMREM fallback:',
        err?.message || err
      );
      envRT = buildFallbackStudioPMREM(pmremGenerator, config);
      isFallbackEnv = true;
    }
  } else {
    console.warn(
      `[scene-manager] HDR environment missing or invalid (${hdrProbe.reason}); using procedural studio-mist PMREM fallback.`
    );
    envRT = buildFallbackStudioPMREM(pmremGenerator, config);
    isFallbackEnv = true;
  }

  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.95;
  pmremGenerator.dispose();

  // Matte wet-slate ground plane & procedural soft contact shadow
  const groundY = config?.VEHICLE_DIMENSIONS?.groundY ?? 0.0;
  const groundGeo = new PlaneGeometry(90, 90);
  const groundMat = new MeshStandardMaterial({
    color: '#10120f',
    roughness: 0.72,
    metalness: 0.15,
    envMapIntensity: 0.55,
  });
  const groundMesh = new Mesh(groundGeo, groundMat);
  groundMesh.name = 'ground_plane';
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.position.y = groundY;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  const contactShadowTex = createContactShadowTexture(config?.VEHICLE_DIMENSIONS);
  const contactShadowGeo = new PlaneGeometry(2.6, 5.4);
  const contactShadowMat = new MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const contactShadowMesh = new Mesh(contactShadowGeo, contactShadowMat);
  contactShadowMesh.name = 'contact_shadow';
  contactShadowMesh.rotation.x = -Math.PI / 2;
  contactShadowMesh.position.y = groundY + 0.003;
  contactShadowMesh.renderOrder = 1;
  scene.add(contactShadowMesh);

  // Lighting rig
  const lCfg = config?.LIGHTING_CONFIG;
  const ambientLight = new AmbientLight(
    lCfg?.ambientLight?.color ?? '#232724',
    lCfg?.ambientLight?.intensity ?? 0.45
  );
  scene.add(ambientLight);

  const keyLight = new DirectionalLight(
    lCfg?.keyLight?.color ?? '#eef2f5',
    lCfg?.keyLight?.intensity ?? 2.6
  );
  keyLight.position.set(...(lCfg?.keyLight?.pos ?? [5.5, 8.2, 6.4]));
  keyLight.castShadow = true;
  const shadowSize = lCfg?.shadowMapSize ?? 1024;
  const shadowFrustum = lCfg?.shadowFrustum ?? 4.5;
  keyLight.shadow.mapSize.set(shadowSize, shadowSize);
  keyLight.shadow.camera.left = -shadowFrustum;
  keyLight.shadow.camera.right = shadowFrustum;
  keyLight.shadow.camera.top = shadowFrustum;
  keyLight.shadow.camera.bottom = -shadowFrustum;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 25;
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  const fillLight = new DirectionalLight(
    lCfg?.fillLight?.color ?? '#6b7785',
    lCfg?.fillLight?.intensity ?? 0.75
  );
  fillLight.position.set(...(lCfg?.fillLight?.pos ?? [-6.0, 3.8, -3.2]));
  scene.add(fillLight);

  const rimLight = new DirectionalLight(
    lCfg?.rimLight?.color ?? '#f4f1ea',
    lCfg?.rimLight?.intensity ?? 1.85
  );
  rimLight.position.set(...(lCfg?.rimLight?.pos ?? [-2.8, 4.4, -7.2]));
  scene.add(rimLight);

  const interiorDomeMax = lCfg?.interiorDome?.maxIntensity ?? 2.2;
  const interiorDome = new PointLight(lCfg?.interiorDome?.color ?? '#ffb878', 0, 4.0, 2);
  interiorDome.position.set(...(lCfg?.interiorDome?.pos ?? [0.0, 1.72, 0.15]));
  scene.add(interiorDome);

  const headlightMax = lCfg?.headlights?.maxIntensity ?? 18;
  const headlightColor = lCfg?.headlights?.color ?? '#f4f1ea';
  const initialHl = config?.CAMERA_KEYFRAMES?.[0]?.headlights ?? 0.15;

  const leftHeadlight = new SpotLight(headlightColor, headlightMax * initialHl, 28, 0.42, 0.65, 1.6);
  leftHeadlight.position.set(0.72, 0.88, 2.28);
  leftHeadlight.target.position.set(0.72, 0.25, 14);
  scene.add(leftHeadlight, leftHeadlight.target);

  const rightHeadlight = new SpotLight(headlightColor, headlightMax * initialHl, 28, 0.42, 0.65, 1.6);
  rightHeadlight.position.set(-0.72, 0.88, 2.28);
  rightHeadlight.target.position.set(-0.72, 0.25, 14);
  scene.add(rightHeadlight, rightHeadlight.target);

  // Load Defender vehicle (GLB or procedural fallback)
  const defender = await loadDefender(loadingManager, renderer);
  scene.add(defender.root);

  // Effects & Postprocessing
  const effects = createEffects({ scene, nodes: defender.nodes, config });
  const postprocessing = createPostprocessing(renderer, scene, camera, config?.LIGHTING_CONFIG);

  const lookTarget = new Vector3(...kf0.lookAt);
  let activeShakeAmplitude = 0;
  let exhaustGlow = 0;
  let bonnetRattleActive = false;
  let disposed = false;

  isReady = true;

  return {
    /**
     * Advances scene rig, lighting, fog, camera, and VFX without mutating rigState.
     * @param {number} dt
     * @param {object} rigState
     * @param {object} fxState
     */
    update(dt, rigState = {}, fxState = {}) {
      if (disposed) return;

      const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 1 / 60;
      lastTime = Number.isFinite(fxState?.time) ? fxState.time : lastTime + safeDt;
      lastReducedMotion = Boolean(fxState?.reducedMotion);

      // Door hinge kinematics clamped within [-1.25, 0.05] rad
      const doorAngle = MathUtils.clamp(rigState?.doorAngle ?? 0, -1.25, 0.05);
      if (defender.nodes.door_driver) {
        defender.nodes.door_driver.rotation.y = doorAngle;
      }

      // Interior dome light
      const interiorLevel = MathUtils.clamp(rigState?.interiorLight ?? 0, 0, 1);
      interiorDome.intensity = interiorDomeMax * interiorLevel;
      if (defender.nodes.domeLens?.material && 'emissiveIntensity' in defender.nodes.domeLens.material) {
        defender.nodes.domeLens.material.emissiveIntensity = 0.05 + interiorLevel * 2.4;
      }

      // Headlights & taillights
      const hlLevel = MathUtils.clamp(rigState?.headlights ?? initialHl, 0, 1);
      const spotIntensity = headlightMax * hlLevel;
      leftHeadlight.intensity = spotIntensity;
      rightHeadlight.intensity = spotIntensity;
      setGroupEmissiveIntensity(defender.nodes.headlights, 0.25 + hlLevel * 3.8);
      setGroupEmissiveIntensity(defender.nodes.taillights, 0.2 + hlLevel * 2.2);

      // Fog parallax
      if (scene.fog && Number.isFinite(rigState?.fogDensity)) {
        scene.fog.density = Math.max(0, rigState.fogDensity);
      }

      // VFX & vibration offsets
      const vfx = effects.update(safeDt, rigState, fxState);
      activeShakeAmplitude = vfx.activeShakeAmplitude;
      exhaustGlow = vfx.exhaustGlow;
      bonnetRattleActive = vfx.bonnetRattleActive;

      // Apply camera pose + non-mutating shake/breathing offsets
      const camPos = rigState?.camPos ?? kf0.pos;
      const rigLook = rigState?.lookAt ?? kf0.lookAt;
      const nextFov = Number.isFinite(rigState?.fov) ? rigState.fov : kf0.fov;

      if (Math.abs(camera.fov - nextFov) > 0.001) {
        camera.fov = nextFov;
        camera.updateProjectionMatrix();
      }

      camera.position.set(
        camPos[0] + vfx.cameraOffset.x,
        camPos[1] + vfx.cameraOffset.y,
        camPos[2] + vfx.cameraOffset.z
      );
      lookTarget.set(
        rigLook[0] + vfx.lookAtOffset.x,
        rigLook[1] + vfx.lookAtOffset.y,
        rigLook[2] + vfx.lookAtOffset.z
      );
      camera.lookAt(lookTarget);
    },

    /**
     * Re-measures viewport and resizes camera, renderer, and postprocessing passes cleanly.
     */
    resize() {
      if (disposed) return;
      viewport = measureViewport();
      camera.aspect = viewport.width / viewport.height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(viewport.pixelRatio);
      renderer.setSize(viewport.width, viewport.height, false);
      postprocessing.setSize(viewport.width, viewport.height, viewport.pixelRatio);
    },

    /**
     * Renders the current frame through EffectComposer.
     */
    render() {
      if (disposed) return;
      postprocessing.render(lastTime, lastReducedMotion);
    },

    /**
     * Sets the active requestAnimationFrame loop count reported by telemetry.
     * @param {number} count
     */
    setRafLoopCount(count) {
      rafLoopCount = Number.isFinite(count) ? count : 0;
    },

    /**
     * Returns read-only scene diagnostics matching TEST_INFRA.md § 4.2.
     */
    getDebugState() {
      return {
        isReady,
        isFallbackModel: Boolean(defender?.isFallback),
        isFallbackEnv,
        pixelRatio: viewport.pixelRatio,
        maxPixelRatio: MAX_PIXEL_RATIO,
        viewport: {
          width: viewport.width,
          height: viewport.height,
          isMobile: viewport.isMobile,
        },
        activeShakeAmplitude,
        exhaustGlow,
        bonnetRattleActive,
        rafLoopCount,
      };
    },

    /**
     * Full zero-leak disposal of WebGL resources.
     */
    dispose() {
      if (disposed) return;
      disposed = true;
      isReady = false;
      rafLoopCount = 0;

      effects.dispose();
      postprocessing.dispose();
      defender.dispose();

      groundGeo.dispose();
      groundMat.dispose();
      contactShadowGeo.dispose();
      contactShadowMat.dispose();
      contactShadowTex.dispose();
      envRT?.dispose();

      scene.clear();
      renderer.dispose();
    },
  };
}
