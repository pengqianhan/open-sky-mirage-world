// js/lighting.js
// 大气天空、日间与夜间两种光照、满月星穹与空气透视雾效

import * as THREE from 'three/webgpu';
import { HOME_WEATHER, homeLightId } from './homeworld-config.js';
import {
  Fn,
  float,
  vec3,
  vec4,
  uniform,
  mix
} from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { worldUniforms } from './tsl-materials.js';
import { MIRAGE_CONFIG } from './world-config.js';

export const TIME_PRESETS = {
  day: {
    id: 'day',
    sunDir: new THREE.Vector3(-0.38, 0.76, 0.52).normalize(), // 晴空顺光展现蜃景立体结构 (复刻 ep04_01)
    sunColor: 0xfff5e8,
    sunIntensity: 3.6,
    hemiSky: 0xaad2ff,
    hemiGround: 0x9c8b78,
    hemiIntensity: 1.25,
    skyTop: 0x225ea8,
    skyHorizon: 0xc8dff5,
    fogColor: 0xc2d8ee,
    fogDensity: 0.00032,
    interiorGlow: 0.04,
    roadWetness: 0.22,
    mirageShimmer: 0.55,
    alienReveal: 0.0,
    turbidity: 4.8,
    rayleigh: 2.1,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.84,
    cloudCoverage: 0.28,
    cloudDensity: 0.30,
    skyExposure: 0.135,
    nightFactor: 0.0,
    nightSkyHex: 0x0b1528
  },
  night: {
    id: 'night',
    sunDir: new THREE.Vector3(0.28, 0.62, 0.73).normalize(), // 暗夜月光与满月剪影 (复刻 ep01_12 / ep24_02)
    sunColor: 0xa8c4f0,
    sunIntensity: 2.6,
    hemiSky: 0x5f7fb8,
    hemiGround: 0x4a4258,
    hemiIntensity: 2.3,
    skyTop: 0x0c1a36,
    skyHorizon: 0x2c4a78,
    fogColor: 0x1a2a4a,
    fogDensity: 0.00045,
    interiorGlow: 0.8, // 登州满城红灯笼与暖窗点亮
    roadWetness: 0.62,
    mirageShimmer: 1.45, // 突出 ep01_12 星空下水平水波折射虚影
    alienReveal: 0.0,
    turbidity: 4.0,
    rayleigh: 1.5,
    mieCoefficient: 0.004,
    mieDirectionalG: 0.80,
    cloudCoverage: 0.22,
    cloudDensity: 0.25,
    skyExposure: 0.03,
    nightFactor: 0.88,
    nightSkyHex: 0x12264a
  },
};

// 母星五种天象：只有日光、半球光与雾参与，物理天空在母星上是隐藏的
for (const [key, { light }] of Object.entries(HOME_WEATHER)) {
  const id = homeLightId(key);
  TIME_PRESETS[id] = {
    ...light,
    id,
    sunDir: new THREE.Vector3(...light.sunDir).normalize(),
    skyTop: 0x2a1518,
    skyHorizon: 0x8c5032,
    interiorGlow: 0,
    roadWetness: 0,
    mirageShimmer: 0,
    alienReveal: 0,
    turbidity: 6.0,
    rayleigh: 2.0,
    mieCoefficient: 0.008,
    mieDirectionalG: 0.88,
    cloudCoverage: 0.2,
    cloudDensity: 0.2,
    skyExposure: 0.1,
    nightFactor: 0,
    nightSkyHex: 0x120a0a
  };
}

export class LightingSystem {
  constructor(scene, renderer = null) {
    this.scene = scene;
    this.activePresetId = 'day';

    this.scene.fog = new THREE.FogExp2(0xd8b89c, 0.00052);
    this.scene.background = null;

    // 物理 Preetham SkyMesh + 动态云层
    this.sky = new SkyMesh();
    this.sky.scale.setScalar(20000);
    this.sky.cloudScale.value = 0.00022;
    this.sky.cloudSpeed.value = 0.000025;
    this.sky.cloudElevation.value = 0.50;

    this.uSkyExposure = uniform(0.145);
    this.uNightFactor = uniform(0.0);
    this.uNightSkyColor = uniform(new THREE.Color(0x0b1528));
    const rawSkyNode = this.sky.material.colorNode;
    this.sky.material.colorNode = Fn(() => {
      const raw = rawSkyNode;
      const dayCol = raw.rgb.mul(this.uSkyExposure);
      const finalSky = mix(dayCol, this.uNightSkyColor, this.uNightFactor);
      return vec4(finalSky, float(1.0));
    })();

    this.scene.add(this.sky);

    // 主方向光（太阳/月光）
    this.sunLight = new THREE.DirectionalLight(0xffb870, 4.8);
    this.sunLight.position.copy(TIME_PRESETS.day.sunDir).multiplyScalar(420);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 950;
    const d = 230;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // 半球环境漫反射光
    this.hemiLight = new THREE.HemisphereLight(0x8ca8d6, 0xb87e56, 1.35);
    this.hemiLight.position.set(0, 350, 0);
    this.scene.add(this.hemiLight);

    // 暗夜满月与星穹背景层（复刻 ep01_12 星空特写与 ep24_02 满月前的蜃景剪影）
    this.celestialGroup = this.buildCelestialObjects();
    this.scene.add(this.celestialGroup);

    this.applyPreset('day', true);
  }

  buildCelestialObjects() {
    const group = new THREE.Group();
    group.name = 'CelestialNight';

    // 皎洁满月（位于空中蜃景右后上方，复刻 ep24_02 满月与蜃景同框构图）
    const moonMat = new THREE.MeshBasicNodeMaterial({
      color: 0xfff8e7,
      transparent: true
    });
    const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(36, 24, 24), moonMat);
    moonMesh.position.set(55, MIRAGE_CONFIG.baseY + 85, MIRAGE_CONFIG.centerZ - 320);
    group.add(moonMesh);

    return group;
  }

  applyPreset(presetId, force = false) {
    const p = TIME_PRESETS[presetId] || TIME_PRESETS.day;
    if (!force && this.activePresetId === p.id) return;
    this.activePresetId = p.id;

    this.sunLight.color.setHex(p.sunColor);
    this.sunLight.intensity = p.sunIntensity;

    this.hemiLight.color.setHex(p.hemiSky);
    this.hemiLight.groundColor.setHex(p.hemiGround);
    this.hemiLight.intensity = p.hemiIntensity;

    this.scene.fog.color.setHex(p.fogColor);
    this.scene.fog.density = p.fogDensity;

    this.sky.turbidity.value = p.turbidity;
    this.sky.rayleigh.value = p.rayleigh;
    this.sky.mieCoefficient.value = p.mieCoefficient;
    this.sky.mieDirectionalG.value = p.mieDirectionalG;
    this.sky.cloudCoverage.value = p.cloudCoverage;
    this.sky.cloudDensity.value = p.cloudDensity;
    this.sky.sunPosition.value.copy(p.sunDir);

    this.uSkyExposure.value = p.skyExposure;
    this.uNightFactor.value = p.nightFactor;
    this.uNightSkyColor.value.setHex(p.nightSkyHex);

    worldUniforms.uSunColor.value.setHex(p.sunColor);
    worldUniforms.uSkyTopColor.value.setHex(p.skyTop);
    worldUniforms.uSkyHorizonColor.value.setHex(p.skyHorizon);
    worldUniforms.uSkySunDir.value.copy(p.sunDir);
    worldUniforms.uInteriorGlow.value = p.interiorGlow;
    worldUniforms.uRoadWetness.value = p.roadWetness;
    worldUniforms.uMirageShimmer.value = p.mirageShimmer;
    worldUniforms.uAlienReveal.value = p.alienReveal;
    worldUniforms.uNightFactor.value = p.nightFactor;

    this.celestialGroup.visible = p.nightFactor > 0.4;
  }

  update(focusPos) {
    const p = TIME_PRESETS[this.activePresetId] || TIME_PRESETS.day;
    this.sunLight.target.position.set(focusPos.x, focusPos.y, focusPos.z);
    this.sunLight.position.set(
      focusPos.x + p.sunDir.x * 420,
      focusPos.y + p.sunDir.y * 420,
      focusPos.z + p.sunDir.z * 420
    );
  }
}
