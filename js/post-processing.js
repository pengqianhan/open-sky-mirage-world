// js/post-processing.js
// 线性空间色彩分级 (Color Grading)、泛光 (Bloom) 与 ACES 电影色调映射

import * as THREE from 'three/webgpu';
import { HOME_WEATHER, homeLightId } from './homeworld-config.js';
import {
  Fn,
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  dot,
  mix,
  min,
  max,
  pow,
  smoothstep,
  length,
  screenUV,
  screenSize
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

const LOOKS = {
  day:   { exposure: 1.00, contrast: 1.08, saturation: 1.08, balance: [1.01, 1.00, 0.99], bloom: 0.16, threshold: 1.30 },
  night: { exposure: 1.28, contrast: 1.06, saturation: 1.08, balance: [0.97, 1.00, 1.05], bloom: 0.28, threshold: 1.05 }
};

for (const [key, { look }] of Object.entries(HOME_WEATHER)) LOOKS[homeLightId(key)] = look;

export function createPostProcessing(renderer, sceneColor) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const exposure = uniform(1.05);
  const contrast = uniform(1.12);
  const saturation = uniform(1.10);
  const balance = uniform(new THREE.Vector3(1.05, 1.0, 0.94));
  const exposed = max(sceneColor.rgb, vec3(0)).mul(exposure).mul(balance);

  const peak = max(max(exposed.r, exposed.g), exposed.b);
  const bloomInput = vec4(exposed.mul(float(8.0).div(max(peak, 8.0))), 1.0);
  const bloomPass = bloom(bloomInput, 0.26, 0.42, 1.15);
  bloomPass.smoothWidth.value = 0.30;
  bloomPass.setResolutionScale(0.5);

  const outputNode = Fn(() => {
    const color = exposed.add(bloomPass.rgb).toVar();
    const luma = dot(color, vec3(0.2126, 0.7152, 0.0722)).toVar();

    const shadows = mix(vec3(0.96, 1.00, 1.05), vec3(1), smoothstep(0.02, 0.60, luma));
    const highlights = mix(vec3(1), vec3(1.04, 1.01, 0.96), smoothstep(0.60, 3.0, luma));
    color.mulAssign(shadows.mul(highlights));

    color.mulAssign(pow(max(luma, 0.0001).div(0.18), contrast.sub(1.0)));
    const gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
    const chroma = max(max(color.r, color.g), color.b).sub(min(min(color.r, color.g), color.b));
    const vibrance = float(0.10).mul(float(1).sub(chroma.div(max(max(max(color.r, color.g), color.b), 0.0001))));
    color.assign(max(mix(vec3(gray), color, saturation.add(vibrance)), vec3(0)));

    const aspect = screenSize.x.div(screenSize.y);
    const radius = length(screenUV.sub(0.5).mul(vec2(aspect, 1))).div(length(vec2(aspect, 1).mul(0.5)));
    const vignette = float(1).sub(smoothstep(0.35, 1.0, radius).mul(0.14));
    return vec4(color.mul(vignette), 1.0);
  })();

  function applyPreset(id) {
    const look = LOOKS[id] || LOOKS.day;
    exposure.value = look.exposure;
    contrast.value = look.contrast;
    saturation.value = look.saturation;
    balance.value.set(...look.balance);
    bloomPass.strength.value = look.bloom;
    bloomPass.threshold.value = look.threshold;
  }

  applyPreset('day');
  return { outputNode, applyPreset };
}
