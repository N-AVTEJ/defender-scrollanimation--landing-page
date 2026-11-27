/**
 * Cinematic Postprocessing Pipeline
 *
 * Configures ACES Filmic tone mapping, sRGB output color space, HalfFloat MSAA
 * EffectComposer with subtle UnrealBloomPass, single-pass linear-space
 * VignetteGrainShaderPass (respecting reduced-motion), and OutputPass.
 */

import {
  ACESFilmicToneMapping,
  HalfFloatType,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const VignetteGrainShader = {
  name: 'VignetteGrainShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0.0 },
    uVignetteDarkness: { value: 0.55 },
    uGrainIntensity: { value: 0.035 },
    uReducedMotion: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignetteDarkness;
    uniform float uGrainIntensity;
    uniform float uReducedMotion;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;

      // Subtle editorial radial vignette
      float dist = distance(vUv, vec2(0.5));
      float vig = smoothstep(0.88, 0.24, dist * (0.85 + uVignetteDarkness * 0.45));
      color *= mix(1.0 - uVignetteDarkness * 0.62, 1.0, vig);

      // Film grain in linear HDR space scaled by luminance so #0b0c0a blacks stay deep
      float t = mix(floor(uTime * 24.0) * 0.13, 0.0, uReducedMotion);
      float noise = hash12(vUv * vec2(1280.0, 720.0) + vec2(t * 71.3, t * 37.9)) - 0.5;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float grainScale = (0.14 + 0.86 * clamp(luma, 0.0, 1.0)) * uGrainIntensity * 0.35;
      color += noise * grainScale;

      gl_FragColor = vec4(max(color, vec3(0.0)), texel.a);
    }
  `,
};

/**
 * Creates and owns the postprocessing EffectComposer and its passes.
 *
 * @param {import('three').WebGLRenderer} renderer
 * @param {import('three').Scene} scene
 * @param {import('three').Camera} camera
 * @param {object} lightingConfig
 */
export function createPostprocessing(renderer, scene, camera, lightingConfig) {
  const postCfg = lightingConfig?.postprocessing ?? {
    toneMappingExposure: 1.05,
    bloomStrength: 0.32,
    bloomRadius: 0.45,
    bloomThreshold: 0.88,
    vignetteDarkness: 0.55,
    grainIntensity: 0.035,
  };

  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = postCfg.toneMappingExposure;
  renderer.outputColorSpace = SRGBColorSpace;

  const size = renderer.getSize(new Vector2());
  const logicalWidth = Math.max(1, Math.round(size.x));
  const logicalHeight = Math.max(1, Math.round(size.y));
  const pixelRatio = renderer.getPixelRatio();

  const supportsHalfFloat =
    renderer.extensions.has('EXT_color_buffer_float') ||
    renderer.extensions.has('EXT_color_buffer_half_float');
  const maxSamples = renderer.capabilities.maxSamples || 0;
  const samples = supportsHalfFloat ? Math.min(4, maxSamples) : 0;

  const renderTarget = new WebGLRenderTarget(logicalWidth, logicalHeight, {
    type: supportsHalfFloat ? HalfFloatType : UnsignedByteType,
    samples,
  });

  const composer = new EffectComposer(renderer, renderTarget);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new Vector2(logicalWidth, logicalHeight),
    postCfg.bloomStrength,
    postCfg.bloomRadius,
    postCfg.bloomThreshold
  );
  const vignetteGrainPass = new ShaderPass(VignetteGrainShader);
  vignetteGrainPass.uniforms.uVignetteDarkness.value = postCfg.vignetteDarkness;
  vignetteGrainPass.uniforms.uGrainIntensity.value = postCfg.grainIntensity;
  const outputPass = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(vignetteGrainPass);
  composer.addPass(outputPass);

  // Guard against Three.js EffectComposer(renderer, customRT) double-pixelRatio scaling on addPass()
  composer.setPixelRatio(pixelRatio);
  composer.setSize(logicalWidth, logicalHeight);

  let disposed = false;

  return {
    /**
     * Executes one postprocessed frame.
     * @param {number} [time=0]
     * @param {boolean} [reducedMotion=false]
     */
    render(time = 0, reducedMotion = false) {
      if (disposed) return;
      vignetteGrainPass.uniforms.uTime.value = time;
      vignetteGrainPass.uniforms.uReducedMotion.value = reducedMotion ? 1.0 : 0.0;
      composer.render();
    },

    /**
     * Resizes composer render targets and passes cleanly.
     * @param {number} width
     * @param {number} height
     * @param {number} nextPixelRatio
     */
    setSize(width, height, nextPixelRatio) {
      if (disposed) return;
      composer.setPixelRatio(nextPixelRatio);
      composer.setSize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
    },

    /**
     * Adjusts bloom intensity dynamically if needed.
     * @param {number} strength
     */
    setBloomStrength(strength) {
      if (disposed) return;
      bloomPass.strength = strength;
    },

    /**
     * Disposes all render targets, pass materials, and composer quads cleanly.
     */
    dispose() {
      if (disposed) return;
      disposed = true;
      renderPass.dispose?.();
      bloomPass.materialHighPassFilter?.dispose();
      bloomPass.dispose();
      vignetteGrainPass.dispose();
      outputPass.dispose();
      renderTarget.dispose();
      composer.dispose();
    },
  };
}
