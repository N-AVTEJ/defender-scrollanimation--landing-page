/**
 * Scene VFX Subsystem
 *
 * Manages exhaust heat-haze shader planes, GPU-animated rear dust particles
 * (zero per-frame BufferAttribute uploads), bonnet rattle micro-oscillation,
 * exponentially damped exhaust ember glow, and camera breathing/idle/rev
 * vibration offsets — strictly respecting prefers-reduced-motion.
 */

import * as THREE from 'three';

const TAU = Math.PI * 2;

const HeatHazeShader = {
  uniforms: {
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uTurbulence: { value: 1 },
    uColor: { value: new THREE.Color('#e0541f') },
    uCoolColor: { value: new THREE.Color('#e8e2d3') },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform float uIntensity;
    uniform float uTurbulence;
    uniform vec3 uColor;
    uniform vec3 uCoolColor;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float amp = 0.55;
      for (int i = 0; i < 3; i++) {
        v += amp * valueNoise(p);
        p *= 2.05;
        amp *= 0.5;
      }
      return v;
    }

    void main() {
      vec2 centered = (vUv - 0.5) * vec2(1.0, 1.25);
      float radial = 1.0 - smoothstep(0.14, 0.5, length(centered));
      float flow = uTime * (1.8 + uIntensity * 2.2) * uTurbulence;
      float plume = fbm(vec2(vUv.x * 5.2, vUv.y * 4.5 - flow));
      float wisps = smoothstep(0.32, 0.85, plume) * radial;
      float bottomFade = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.68, 1.0, vUv.y));
      float alpha = wisps * bottomFade * uIntensity * 0.42;
      vec3 col = mix(uCoolColor, uColor, clamp(uIntensity * 0.85, 0.0, 1.0));
      gl_FragColor = vec4(col, alpha);
    }
  `,
};

const DustParticleShader = {
  uniforms: {
    uScrollOffset: { value: 0 },
    uSpan: { value: 1.95 },
    uZMin: { value: -4.2 },
    uOpacity: { value: 0 },
    uPixelRatio: { value: 1 },
    uColor: { value: new THREE.Color('#8d8779') },
  },
  vertexShader: /* glsl */ `
    attribute float aSize;
    attribute float aSeed;
    uniform float uScrollOffset;
    uniform float uSpan;
    uniform float uZMin;
    uniform float uPixelRatio;
    varying float vAlpha;

    void main() {
      vec3 pos = position;
      float relZ = mod((pos.z - uZMin) - uScrollOffset * (0.75 + 0.5 * aSeed), uSpan);
      pos.z = uZMin + relZ;
      pos.y += sin(uScrollOffset * 1.6 + aSeed * 6.2831) * 0.03;

      float normZ = relZ / uSpan;
      vAlpha = smoothstep(0.0, 0.2, normZ) * (1.0 - smoothstep(0.7, 1.0, normZ));

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = clamp(aSize * uPixelRatio * (180.0 / max(-mvPosition.z, 0.5)), 1.5, 14.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uOpacity;
    uniform vec3 uColor;
    varying float vAlpha;

    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      float soft = 1.0 - smoothstep(0.15, 0.5, d);
      float alpha = soft * vAlpha * uOpacity;
      if (alpha < 0.005) discard;
      gl_FragColor = vec4(uColor, alpha);
    }
  `,
};

/**
 * Deterministic PRNG for procedural dust particle positions so tests/frames stay consistent.
 * @param {number} seed
 */
function seededRandom(seed) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Creates the scene VFX controller.
 *
 * @param {{ scene: import('three').Scene, nodes: object, config: object }} params
 */
export function createEffects({ scene, nodes, config }) {
  const accentHex = config?.PALETTE?.accent ?? '#e0541f';
  const boneHex = config?.PALETTE?.text ?? '#e8e2d3';
  const exhaustCfg = config?.VEHICLE_DIMENSIONS?.exhaust ?? {
    leftCenter: [-0.65, 0.3, -2.36],
    rightCenter: [0.65, 0.3, -2.36],
  };

  const vfxGroup = new THREE.Group();
  vfxGroup.name = 'defender_vfx';
  scene.add(vfxGroup);

  // 1. Exhaust heat-haze shader planes behind tailpipes (z < -2.36)
  const hazeGeo = new THREE.PlaneGeometry(0.42, 0.34, 1, 1);
  const hazeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uTurbulence: { value: 1 },
      uColor: { value: new THREE.Color(accentHex) },
      uCoolColor: { value: new THREE.Color(boneHex) },
    },
    vertexShader: HeatHazeShader.vertexShader,
    fragmentShader: HeatHazeShader.fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  const leftHaze = new THREE.Mesh(hazeGeo, hazeMat);
  leftHaze.name = 'exhaust_haze_left';
  leftHaze.position.set(exhaustCfg.leftCenter[0], exhaustCfg.leftCenter[1] + 0.06, exhaustCfg.leftCenter[2] - 0.16);
  leftHaze.frustumCulled = true;
  leftHaze.visible = false;

  const rightHaze = new THREE.Mesh(hazeGeo, hazeMat);
  rightHaze.name = 'exhaust_haze_right';
  rightHaze.position.set(exhaustCfg.rightCenter[0], exhaustCfg.rightCenter[1] + 0.06, exhaustCfg.rightCenter[2] - 0.16);
  rightHaze.frustumCulled = true;
  rightHaze.visible = false;

  vfxGroup.add(leftHaze, rightHaze);

  // 2. GPU-animated rear dust Points (zero per-frame BufferAttribute uploads)
  const particleCount = 96;
  const positions = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const seeds = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i += 1) {
    const rx = seededRandom(i * 3 + 1);
    const ry = seededRandom(i * 3 + 2);
    const rz = seededRandom(i * 3 + 3);
    positions[i * 3 + 0] = -1.25 + rx * 2.5;
    positions[i * 3 + 1] = 0.05 + ry * 0.6;
    positions[i * 3 + 2] = -4.2 + rz * 1.95;
    sizes[i] = 0.08 + seededRandom(i * 7 + 5) * 0.14;
    seeds[i] = seededRandom(i * 11 + 9);
  }

  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  dustGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  dustGeo.computeBoundingSphere();

  const dustMat = new THREE.ShaderMaterial({
    uniforms: {
      uScrollOffset: { value: 0 },
      uSpan: { value: 1.95 },
      uZMin: { value: -4.2 },
      uOpacity: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      uColor: { value: new THREE.Color(config?.PALETTE?.textMuted ?? '#8d8779') },
    },
    vertexShader: DustParticleShader.vertexShader,
    fragmentShader: DustParticleShader.fragmentShader,
    transparent: true,
    depthWrite: false,
  });

  const dustPoints = new THREE.Points(dustGeo, dustMat);
  dustPoints.name = 'rear_dust_particles';
  dustPoints.frustumCulled = true;
  dustPoints.visible = false;
  vfxGroup.add(dustPoints);

  // Capture base transforms of animated vehicle nodes
  const bonnetNode = nodes?.bonnet || null;
  const steeringNode = nodes?.steering_wheel || null;
  const interiorNode = nodes?.interior || null;
  const exhaustGlowMeshes = Array.isArray(nodes?.exhaustGlowMeshes) ? nodes.exhaustGlowMeshes : [];

  const baseBonnetPos = bonnetNode ? bonnetNode.position.clone() : new THREE.Vector3();
  const baseBonnetRot = bonnetNode ? bonnetNode.rotation.clone() : new THREE.Euler();
  const baseSteeringRot = steeringNode ? steeringNode.rotation.clone() : new THREE.Euler();
  const baseInteriorPos = interiorNode ? interiorNode.position.clone() : new THREE.Vector3();

  // Reusable output vectors (never mutate caller's rigState.camPos / lookAt)
  const cameraOffset = new THREE.Vector3();
  const lookAtOffset = new THREE.Vector3();

  let exhaustGlow = 0;
  let activeShakeAmplitude = 0;
  let bonnetRattleActive = false;
  let dustScroll = 0;
  let elapsed = 0;
  let disposed = false;

  const baseGlowColor = new THREE.Color(accentHex);
  const hotGlowColor = new THREE.Color('#ff823b');
  const workingColor = new THREE.Color();

  function resetNodeTransforms() {
    if (bonnetNode) {
      bonnetNode.position.copy(baseBonnetPos);
      bonnetNode.rotation.copy(baseBonnetRot);
    }
    if (steeringNode) {
      steeringNode.rotation.copy(baseSteeringRot);
    }
    if (interiorNode) {
      interiorNode.position.copy(baseInteriorPos);
    }
  }

  return {
    /**
     * Advances VFX simulation by dt seconds without mutating rigState.
     *
     * @param {number} dt
     * @param {object} rigState
     * @param {object} fxState
     */
    update(dt, rigState = {}, fxState = {}) {
      if (disposed) {
        cameraOffset.set(0, 0, 0);
        lookAtOffset.set(0, 0, 0);
        return {
          cameraOffset,
          lookAtOffset,
          activeShakeAmplitude: 0,
          exhaustGlow: 0,
          bonnetRattleActive: false,
        };
      }

      const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 1 / 60;
      elapsed = Number.isFinite(fxState?.time) ? fxState.time : elapsed + safeDt;

      const reduced = Boolean(fxState?.reducedMotion);
      const chapterIndex = Number.isFinite(fxState?.chapterIndex) ? fxState.chapterIndex : 0;
      const running = Boolean(fxState?.isRunning);
      const normRPM = THREE.MathUtils.clamp(fxState?.normalizedRPM ?? 0, 0, 1);
      const throttle = THREE.MathUtils.clamp(fxState?.throttle ?? 0, 0, 1);
      const isLimiting = Boolean(fxState?.isLimiting);
      const effectiveNormRPM = Math.max(normRPM, throttle * 0.85);

      // 1. Exponentially damped exhaust ember glow
      let targetGlow = 0;
      if (chapterIndex <= 2) {
        targetGlow = 0;
      } else if (chapterIndex === 3 || chapterIndex === 4) {
        targetGlow = running ? 0.1 + 0.08 * normRPM : 0.06;
      } else {
        targetGlow =
          0.15 +
          0.85 * Math.pow(effectiveNormRPM, 1.35) +
          (isLimiting && !reduced ? 0.08 * (0.5 + 0.5 * Math.sin(elapsed * 28)) : 0);
      }
      targetGlow = THREE.MathUtils.clamp(targetGlow, 0, 1);
      const dampAlpha = 1 - Math.exp(-8 * safeDt);
      exhaustGlow += (targetGlow - exhaustGlow) * dampAlpha;
      if (chapterIndex <= 2 && exhaustGlow < 0.001) {
        exhaustGlow = 0;
      }

      for (let i = 0; i < exhaustGlowMeshes.length; i += 1) {
        const mesh = exhaustGlowMeshes[i];
        const mat = mesh?.material;
        if (mat && 'emissiveIntensity' in mat) {
          mat.emissiveIntensity = 0.04 + exhaustGlow * 3.4;
          if (mat.emissive) {
            workingColor.copy(baseGlowColor).lerp(hotGlowColor, Math.min(1, exhaustGlow * 0.85));
            mat.emissive.copy(workingColor);
          }
        }
      }

      // 2. Heat-haze planes (active in CH 04–06 when engine is running/revving)
      const hazeIntensity =
        chapterIndex >= 3
          ? THREE.MathUtils.clamp(
              chapterIndex >= 5 ? 0.22 + 0.78 * effectiveNormRPM : running ? 0.18 + 0.2 * normRPM : 0.14,
              0,
              1
            )
          : 0;
      const showHaze = hazeIntensity > 0.01;
      leftHaze.visible = showHaze;
      rightHaze.visible = showHaze;
      if (showHaze) {
        hazeMat.uniforms.uTime.value = elapsed;
        hazeMat.uniforms.uIntensity.value = hazeIntensity;
        hazeMat.uniforms.uTurbulence.value = reduced ? 0.0 : 1.0;
      }

      // 3. GPU-animated rear dust particles (visible in CH 05–06 under normal motion)
      const showDust = !reduced && chapterIndex >= 4;
      dustPoints.visible = showDust;
      if (showDust) {
        const speed = 0.35 + effectiveNormRPM * 1.95;
        dustScroll += safeDt * speed;
        dustMat.uniforms.uScrollOffset.value = dustScroll;
        dustMat.uniforms.uOpacity.value = chapterIndex === 5 ? 0.18 + 0.36 * effectiveNormRPM : 0.12;
      }

      // 4. Bonnet rattle (CH 04–05 idle under normal motion; strictly false in CH 01–03 and reducedMotion)
      bonnetRattleActive = !reduced && (chapterIndex === 3 || chapterIndex === 4);

      if (bonnetNode) {
        if (bonnetRattleActive) {
          bonnetNode.position.set(
            baseBonnetPos.x,
            baseBonnetPos.y +
              Math.sin(elapsed * 2.6 * TAU) * 0.0011 +
              Math.sin(elapsed * 10.0 * TAU) * 0.0005,
            baseBonnetPos.z
          );
          bonnetNode.rotation.set(
            baseBonnetRot.x + Math.cos(elapsed * 2.8 * TAU) * 0.0007,
            baseBonnetRot.y,
            baseBonnetRot.z + Math.sin(elapsed * 5.2 * TAU) * 0.0014
          );
        } else {
          bonnetNode.position.copy(baseBonnetPos);
          bonnetNode.rotation.copy(baseBonnetRot);
        }
      }

      // 5. Camera breathing, idle vibration, and rev micro-shake
      cameraOffset.set(0, 0, 0);
      lookAtOffset.set(0, 0, 0);

      if (reduced) {
        activeShakeAmplitude = 0;
        resetNodeTransforms();
      } else if (chapterIndex <= 1) {
        activeShakeAmplitude = 0;
        if (steeringNode) steeringNode.rotation.copy(baseSteeringRot);
        if (interiorNode) interiorNode.position.copy(baseInteriorPos);
      } else if (chapterIndex === 2) {
        // CH 03: subtle handheld breathing sway while activeShakeAmplitude stays strictly 0
        activeShakeAmplitude = 0;
        const swayY = Math.sin(elapsed * 0.22 * TAU) * 0.0035;
        const swayX = Math.cos(elapsed * 0.14 * TAU) * 0.0022;
        cameraOffset.set(swayX, swayY, 0);
        lookAtOffset.set(swayX * 0.4, swayY * 0.4, 0);
        if (steeringNode) steeringNode.rotation.copy(baseSteeringRot);
        if (interiorNode) interiorNode.position.copy(baseInteriorPos);
      } else if (chapterIndex === 3 || chapterIndex === 4) {
        // CH 04–05: 2–3 Hz + 10 Hz V8 idle lope tremor
        activeShakeAmplitude = 0.0018 + 0.0012 * normRPM;
        const vibY =
          (Math.sin(elapsed * 2.6 * TAU) * 0.65 + Math.sin(elapsed * 10.0 * TAU) * 0.35) *
          activeShakeAmplitude;
        const vibX = Math.cos(elapsed * 3.1 * TAU) * activeShakeAmplitude * 0.6;
        cameraOffset.set(vibX, vibY, 0);
        lookAtOffset.set(vibX * 0.35, vibY * 0.35, 0);

        if (steeringNode) {
          steeringNode.rotation.set(
            baseSteeringRot.x,
            baseSteeringRot.y,
            baseSteeringRot.z + Math.sin(elapsed * 10.0 * TAU) * 0.0045
          );
        }
        if (interiorNode) {
          interiorNode.position.set(
            baseInteriorPos.x + vibX * 0.4,
            baseInteriorPos.y + vibY * 0.5,
            baseInteriorPos.z
          );
        }
      } else {
        // CH 06: rev micro-shake scaling with RPM and limiter bounce
        const hasActivity = running || throttle > 0.01 || normRPM > 0.01;
        activeShakeAmplitude = hasActivity
          ? 0.0008 + Math.pow(effectiveNormRPM, 1.4) * 0.0075 + (isLimiting ? 0.0035 : 0)
          : 0.0008;
        const shakeX =
          (Math.sin(elapsed * 18.5 * TAU) * 0.6 + Math.cos(elapsed * 24.3 * TAU) * 0.4) *
          activeShakeAmplitude;
        const shakeY =
          (Math.cos(elapsed * 21.1 * TAU) * 0.65 + Math.sin(elapsed * 26.7 * TAU) * 0.35) *
          activeShakeAmplitude;
        cameraOffset.set(shakeX, shakeY, 0);
        lookAtOffset.set(shakeX * 0.3, shakeY * 0.3, 0);
        if (steeringNode) steeringNode.rotation.copy(baseSteeringRot);
        if (interiorNode) interiorNode.position.copy(baseInteriorPos);
      }

      return {
        cameraOffset,
        lookAtOffset,
        activeShakeAmplitude,
        exhaustGlow,
        bonnetRattleActive,
      };
    },

    getDebugMetrics() {
      return {
        activeShakeAmplitude,
        exhaustGlow,
        bonnetRattleActive,
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      resetNodeTransforms();
      scene.remove(vfxGroup);
      hazeGeo.dispose();
      hazeMat.dispose();
      dustGeo.dispose();
      dustMat.dispose();
    },
  };
}
