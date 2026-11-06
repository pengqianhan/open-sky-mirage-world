// js/tsl-materials.js
// 基于 Three.js WebGPURenderer 与 TSL (Three.js Shading Language) 的程序化材质系统
// 涵盖：登州白墙黛瓦、青石板湿润反光、浮空岛风化岩层、水平条纹海市蜃楼虚影、旋涡云海与天外母舰青色光束

import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec2,
  vec3,
  vec4,
  color,
  uniform,
  attribute,
  positionLocal,
  positionWorld,
  normalWorld,
  cameraPosition,
  uv,
  time,
  sin,
  cos,
  abs,
  floor,
  fract,
  min,
  max,
  clamp,
  mix,
  step,
  smoothstep,
  dot,
  length,
  normalize,
  pow
} from 'three/tsl';

export const worldUniforms = {
  uSunColor: uniform(new THREE.Color(0xffca92)),
  uSkyTopColor: uniform(new THREE.Color(0x2c568c)),
  uSkyHorizonColor: uniform(new THREE.Color(0xebd1b5)),
  uSkySunDir: uniform(new THREE.Vector3(-0.44, 0.58, -0.68).normalize()),
  uInteriorGlow: uniform(0.55),
  uRoadWetness: uniform(0.35),
  uMirageShimmer: uniform(0.75),
  uAlienReveal: uniform(0.0),
  uNightFactor: uniform(0.0)
};

// 快速 2D 哈希与平滑价值噪声 (TSL)
export const hash2D = Fn(([p]) => {
  return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
});

export const noise2D = Fn(([p]) => {
  const pv = vec2(p).toVar();
  const i = floor(pv).toVar();
  const f = fract(pv).toVar();
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0))).toVar();
  const a = hash2D(i);
  const b = hash2D(i.add(vec2(1.0, 0.0)));
  const c = hash2D(i.add(vec2(0.0, 1.0)));
  const d = hash2D(i.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

/**
 * 1. 登州盆地与群山地形材质（支持草甸、苍翠山林、陡峭岩壁、护城河湿泥与官道融合）
 */
export function createTerrainMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({
    roughness: 0.88,
    metalness: 0.02
  });

  mat.colorNode = Fn(() => {
    const wp = positionWorld;
    const nw = normalWorld;
    const nLarge = noise2D(wp.xz.mul(0.018));
    const nDetail = noise2D(wp.xz.mul(0.14));
    const nMicro = noise2D(wp.xz.mul(0.65));

    // 森林深绿与草甸嫩绿（参考 ep01_05 盆地翠林）
    const meadowCol = mix(vec3(0.16, 0.25, 0.12), vec3(0.24, 0.33, 0.16), nLarge);
    const forestCol = mix(vec3(0.09, 0.17, 0.09), vec3(0.14, 0.22, 0.12), nDetail);
    const baseGreen = mix(meadowCol, forestCol, smoothstep(8.0, 65.0, wp.y));

    // 陡坡裸露苍青岩石（登云崖与远山峭壁）
    const slope = float(1.0).sub(clamp(nw.y, 0.0, 1.0));
    const cliffRock = mix(vec3(0.32, 0.34, 0.35), vec3(0.45, 0.46, 0.44), nDetail.mul(0.7).add(nMicro.mul(0.3)));
    const rockMask = smoothstep(0.16, 0.42, slope).max(smoothstep(52.0, 88.0, wp.y).mul(0.55));

    // 护城河底湿沙石
    const moatMask = smoothstep(-0.2, -1.8, wp.y);
    const moatMud = vec3(0.18, 0.21, 0.20);

    // 进城官道与城门旷野夯土色（参考 ep01_06 城门外广场）
    const gatePlazaMask = smoothstep(42.0, 14.0, abs(wp.x)).mul(
      smoothstep(165.0, 178.0, wp.z).mul(smoothstep(265.0, 235.0, wp.z))
    );
    const earthRoad = mix(vec3(0.38, 0.34, 0.29), vec3(0.46, 0.42, 0.36), nDetail);

    const col = mix(baseGreen, cliffRock, rockMask).toVar();
    col.assign(mix(col, earthRoad, gatePlazaMask));
    col.assign(mix(col, moatMud, moatMask));
    return col.mul(float(0.92).add(nMicro.mul(0.16)));
  })();

  return mat;
}

/**
 * 2. 青石板街道与蜃景千步广场材质（参考 ep01_08 长街与 ep23_05 蜃景湿润反光石板广场）
 */
export function createStoneRoadMaterial(isMiragePlaza = false) {
  const mat = new THREE.MeshStandardNodeMaterial({
    metalness: isMiragePlaza ? 0.18 : 0.08
  });

  const slabEval = Fn(() => {
    const wp = positionWorld;
    const scale = float(isMiragePlaza ? 0.45 : 0.65);
    const p = wp.xz.mul(scale).toVar();
    const row = floor(p.y);
    const staggeredX = p.x.add(fract(row.mul(0.5)).mul(0.5));
    const cell = floor(vec2(staggeredX, p.y));
    const localUV = fract(vec2(staggeredX, p.y));

    const gap = smoothstep(0.0, 0.045, localUV.x)
      .mul(smoothstep(1.0, 0.955, localUV.x))
      .mul(smoothstep(0.0, 0.045, localUV.y))
      .mul(smoothstep(1.0, 0.955, localUV.y));

    const tileRand = hash2D(cell);
    const puddleNoise = noise2D(wp.xz.mul(0.08));
    return vec3(gap, tileRand, puddleNoise);
  });

  mat.colorNode = Fn(() => {
    const info = slabEval();
    const gap = info.x;
    const tileRand = info.y;
    const puddle = info.z;

    const baseTint = isMiragePlaza
      ? vec3(0.33, 0.37, 0.40) // 蜃景青灰石板
      : vec3(0.39, 0.39, 0.38); // 登州长街石板

    const slabCol = baseTint.mul(float(0.88).add(tileRand.mul(0.24)));
    const mortarCol = baseTint.mul(0.52);
    const dryCol = mix(mortarCol, slabCol, gap);

    // 雨后积水变深
    const wetMask = smoothstep(0.42, 0.72, puddle).mul(worldUniforms.uRoadWetness);
    return mix(dryCol, dryCol.mul(0.68), wetMask);
  })();

  mat.roughnessNode = Fn(() => {
    const info = slabEval();
    const puddle = info.z;
    const wetMask = smoothstep(0.38, 0.72, puddle).mul(worldUniforms.uRoadWetness);
    const baseRough = float(isMiragePlaza ? 0.36 : 0.58);
    return mix(baseRough, float(0.12), wetMask);
  })();

  return mat;
}

/**
 * 3. 城墙与城台材质（支持登州白灰收分城墙 ep01_06 与 蜃景沧桑青砖城垣 ep04_02 / ep23_03）
 */
export function createCityWallMaterial(isWhiteWashed = false) {
  const mat = new THREE.MeshStandardNodeMaterial({
    roughness: isWhiteWashed ? 0.76 : 0.72,
    metalness: 0.04
  });

  mat.colorNode = Fn(() => {
    const wp = positionWorld;
    const brickU = wp.x.add(wp.z).mul(0.8);
    const brickV = wp.y.mul(1.8);
    const row = floor(brickV);
    const colIdx = floor(brickU.add(fract(row.mul(0.5)).mul(0.5)));
    const f = fract(vec2(brickU.add(fract(row.mul(0.5)).mul(0.5)), brickV));

    const mortar = smoothstep(0.0, 0.06, f.x)
      .mul(smoothstep(1.0, 0.94, f.x))
      .mul(smoothstep(0.0, 0.08, f.y))
      .mul(smoothstep(1.0, 0.92, f.y));

    const bRand = hash2D(vec2(colIdx, row));
    const weatherStreak = noise2D(vec2(wp.x.add(wp.z).mul(0.18), wp.y.mul(0.06)));

    const baseWall = isWhiteWashed
      ? vec3(0.74, 0.76, 0.78) // 登州城门高纯度灰白大墙 (ep01_06)
      : vec3(0.45, 0.49, 0.50); // 蜃景青灰色巨石城垣 (ep04_02, ep23_03)

    const brickTone = baseWall.mul(float(0.93).add(bRand.mul(0.12)));
    const mortarTone = baseWall.mul(isWhiteWashed ? 0.84 : 0.68);
    const wallCol = mix(mortarTone, brickTone, mortar);

    // 纵向风雨侵蚀水痕
    return wallCol.mul(float(0.86).add(weatherStreak.mul(0.24)));
  })();

  return mat;
}

/**
 * 4. 古建白墙木构立面与夜间暖色纸窗材质（参考 ep01_08 望楼与酒楼立面）
 */
export function createTimberFacadeMaterial(seed = 1.0) {
  const mat = new THREE.MeshStandardNodeMaterial({
    roughness: 0.68,
    metalness: 0.05
  });

  const evalFacade = Fn(() => {
    const wp = positionWorld;
    // 使用世界坐标划分开间与楼层，确保任何尺寸楼阁的木柱、窗格比例严谨统一
    const bayU = wp.x.add(wp.z).mul(0.42);
    const floorV = wp.y.mul(0.34);
    const u = vec2(bayU, floorV).toVar();
    const cell = floor(u);
    const f = fract(u);

    // 深褐色木柱与横梁框架
    const borderX = smoothstep(0.0, 0.13, f.x).mul(smoothstep(1.0, 0.87, f.x));
    const borderY = smoothstep(0.0, 0.16, f.y).mul(smoothstep(1.0, 0.84, f.y));
    const isPanel = borderX.mul(borderY);

    // 窗格区域 (居中)
    const winX = smoothstep(0.24, 0.28, f.x).mul(smoothstep(0.76, 0.72, f.x));
    const winY = smoothstep(0.26, 0.30, f.y).mul(smoothstep(0.82, 0.78, f.y));
    const isWindow = winX.mul(winY);

    // 窗棂细格
    const latX = smoothstep(0.20, 0.32, abs(sin(f.x.mul(31.4159))));
    const latY = smoothstep(0.20, 0.32, abs(sin(f.y.mul(25.1327))));
    const lattice = latX.mul(latY);
    const winGlass = isWindow.mul(mix(float(0.35), float(1.0), lattice));

    const cellRand = hash2D(cell.add(vec2(seed, seed * 1.7)));
    const litMask = step(0.28, cellRand).mul(winGlass);

    return vec3(isPanel, winGlass, litMask);
  });

  mat.colorNode = Fn(() => {
    const info = evalFacade();
    const isPanel = info.x;
    const winGlass = info.y;

    const timberCol = vec3(0.18, 0.11, 0.08);     // 深胡桃木梁柱架构
    const plasterCol = vec3(0.84, 0.82, 0.78);    // 登州白灰墙面 (ep01_08)
    const darkWinCol = vec3(0.22, 0.18, 0.15);    // 日间木格支摘窗

    const wall = mix(timberCol, plasterCol, isPanel);
    return mix(wall, darkWinCol, winGlass);
  })();

  mat.emissiveNode = Fn(() => {
    const info = evalFacade();
    const litMask = info.z;
    const warmCandle = vec3(1.0, 0.62, 0.22);
    return warmCandle.mul(litMask).mul(worldUniforms.uInteriorGlow).mul(1.8);
  })();

  return mat;
}

/**
 * 5. 古建黛瓦筒瓦屋顶材质（支持青黛色瓦垄与蜃景宫殿鎏金琉璃剪边 ep23_05）
 */
export function createRoofTileMaterial(hasGoldenTrim = false) {
  const mat = new THREE.MeshStandardNodeMaterial({
    roughness: 0.48,
    metalness: 0.14
  });

  mat.colorNode = Fn(() => {
    const wp = positionWorld;
    const u = uv();
    // 瓦垄高频条纹
    const rib = sin(wp.x.add(wp.z).mul(9.5)).mul(0.5).add(0.5);
    const tileCourse = fract(wp.y.mul(3.2));
    const stepShade = smoothstep(0.0, 0.25, tileCourse).mul(0.12).add(0.88);

    const darkSlate = vec3(0.13, 0.16, 0.19);
    const lightSlate = vec3(0.22, 0.26, 0.30);
    const baseTile = mix(darkSlate, lightSlate, rib).mul(stepShade);

    if (!hasGoldenTrim) {
      return baseTile;
    }

    // 蜃景内廷配殿黄色琉璃瓦脊剪边 (参考 ep23_05)
    const edgeMask = smoothstep(0.14, 0.02, min(min(u.x, float(1.0).sub(u.x)), min(u.y, float(1.0).sub(u.y))));
    const goldGlaze = vec3(0.76, 0.62, 0.24).mul(float(0.85).add(rib.mul(0.25)));
    return mix(baseTile, goldGlaze, edgeMask.mul(0.85));
  })();

  return mat;
}

/**
 * 6. 朱漆/乌木梁柱与斗拱材质
 */
export function createPaintedWoodMaterial(hexColor = 0x5c1f18, roughnessVal = 0.52) {
  const base = new THREE.Color(hexColor);
  const mat = new THREE.MeshStandardNodeMaterial({
    roughness: roughnessVal,
    metalness: 0.06
  });

  mat.colorNode = Fn(() => {
    const wp = positionWorld;
    const grain = noise2D(vec2(wp.x.add(wp.z).mul(1.5), wp.y.mul(4.0)));
    return color(base).mul(float(0.88).add(grain.mul(0.22)));
  })();

  return mat;
}

/**
 * 7. 空中蜃景倒锥形浮空岩岛材质（参考 ep04_01 晴空特写与 ep19_02 浮空岩岛）
 *    包含垂直风化岩层纹理 + 底部云雾消散过渡 + 天外母舰模式下的青色科技裂隙发光
 */
export function createFloatingRockMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({
    roughness: 0.84,
    metalness: 0.12
  });

  mat.colorNode = Fn(() => {
    const wp = positionWorld;
    // 垂直风化裂隙与水平沉积岩层交织
    const vertStrata = noise2D(vec2(wp.x.add(wp.z).mul(0.16), wp.y.mul(0.04)));
    const horizBand = sin(wp.y.mul(0.55).add(vertStrata.mul(3.2))).mul(0.5).add(0.5);
    const fineNoise = noise2D(wp.xz.mul(0.35));

    const darkRock = vec3(0.22, 0.26, 0.30);
    const paleRock = vec3(0.48, 0.52, 0.56);
    const rockCol = mix(darkRock, paleRock, vertStrata.mul(0.65).add(horizBand.mul(0.35))).mul(
      float(0.85).add(fineNoise.mul(0.25))
    );

    // 底部被云雾包裹泛白（参考 ep01_09 / ep23_01）
    const mistBlend = smoothstep(232.0, 175.0, wp.y);
    const mistCol = mix(worldUniforms.uSkyHorizonColor, vec3(0.78, 0.84, 0.90), 0.5);
    return mix(rockCol, mistCol, mistBlend.mul(0.58));
  })();

  mat.emissiveNode = Fn(() => {
    const wp = positionWorld;
    // 在【天外真身 (Alien Reveal)】模式下，岩岛底部裂隙透出母舰青色能量微光 (参考 ep19_01)
    const seamX = smoothstep(0.028, 0.006, abs(sin(wp.x.mul(0.22).add(wp.z.mul(0.15)))));
    const seamY = smoothstep(0.025, 0.005, abs(sin(wp.y.mul(0.32).add(time.mul(1.2)))));
    const lowerMask = smoothstep(225.0, 175.0, wp.y);
    const pulse = max(seamX, seamY).mul(lowerMask);
    return vec3(0.12, 0.88, 0.95).mul(pulse).mul(worldUniforms.uAlienReveal).mul(0.55);
  })();

  return mat;
}

/**
 * 8. 海市蜃楼水平水波折射虚影层材质（核心复刻 ep01_12 星空下水平条纹状水波折射过渡层！）
 */
export function createMirageWaveGhostMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });

  mat.colorNode = Fn(() => {
    const u = uv();
    const t = time.mul(0.85);
    // 多频水平条纹波浪 (ep01_12 特有的水平切片折射效果)
    const wave1 = sin(u.y.mul(52.0).sub(t.mul(2.4)).add(sin(u.x.mul(12.0).add(t)).mul(1.5))).mul(0.5).add(0.5);
    const wave2 = sin(u.y.mul(110.0).add(t.mul(1.7))).mul(0.5).add(0.5);
    const stripes = smoothstep(0.45, 0.92, wave1.mul(0.7).add(wave2.mul(0.3)));

    const cyanTint = vec3(0.36, 0.64, 0.86);
    const goldTint = worldUniforms.uSunColor;
    const baseCol = mix(goldTint, cyanTint, float(0.65).add(worldUniforms.uNightFactor.mul(0.35)));
    return baseCol.mul(stripes).mul(1.35);
  })();

  mat.opacityNode = Fn(() => {
    const u = uv();
    const edgeX = smoothstep(0.0, 0.25, u.x).mul(smoothstep(1.0, 0.75, u.x));
    const edgeY = smoothstep(0.0, 0.28, u.y).mul(smoothstep(1.0, 0.55, u.y));
    const wave = sin(u.y.mul(56.0).sub(time.mul(2.2))).mul(0.5).add(0.5);
    return edgeX.mul(edgeY).mul(wave).mul(worldUniforms.uMirageShimmer).mul(0.24);
  })();

  return mat;
}

/**
 * 9. 旋涡云海与流云材质（参考 ep23_01 正下方旋涡云洞与 ep23_03 翻滚云墙）
 */
export function createVortexCloudMaterial(opacityScale = 0.55) {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false
  });

  mat.colorNode = Fn(() => {
    const wp = positionWorld;
    const nw = normalize(normalWorld);
    const n = noise2D(wp.xz.mul(0.025).add(vec2(time.mul(0.03), time.mul(-0.02))));
    const topLit = mix(worldUniforms.uSkyHorizonColor, vec3(0.97, 0.98, 1.0), 0.72);
    const bottomShadow = mix(worldUniforms.uSkyTopColor, vec3(0.64, 0.72, 0.84), 0.58);
    const upShade = nw.y.mul(0.5).add(0.5);
    return mix(bottomShadow, topLit, upShade.mul(0.75).add(n.mul(0.25)));
  })();

  mat.opacityNode = Fn(() => {
    const wp = positionWorld;
    const nw = normalize(normalWorld);
    const viewDir = normalize(cameraPosition.sub(wp));
    // 3D 云团边缘视线衰减：中心饱满、边缘柔和消散，彻底消除多边形硬边
    const centerSoft = pow(abs(dot(nw, viewDir)), 1.75);
    const swirl = noise2D(wp.xz.mul(0.035).add(vec2(time.mul(0.04), 0.0)));
    return centerSoft.mul(float(0.45).add(swirl.mul(0.55))).mul(opacityScale).mul(0.52);
  })();

  return mat;
}

/**
 * 10. 蜃景透明球形力场/云气穹顶材质（参考 ep17_01 与 ep23_01 笼罩整座城池的半透明巨型光罩）
 */
export function createForcefieldDomeMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });

  mat.colorNode = Fn(() => {
    const wp = positionWorld;
    const cloudDrift = noise2D(wp.xz.mul(0.03).add(vec2(time.mul(0.05), time.mul(0.03))));
    const normalCol = mix(vec3(0.62, 0.82, 0.96), vec3(0.92, 0.96, 1.0), cloudDrift);
    const alienCol = vec3(0.18, 0.92, 0.98);
    return mix(normalCol, alienCol, worldUniforms.uAlienReveal);
  })();

  mat.opacityNode = Fn(() => {
    const wp = positionWorld;
    const nw = normalize(normalWorld);
    const viewDir = normalize(cameraPosition.sub(wp));
    // 菲涅尔边缘薄雾光晕，贴合 ep17_01 穹顶轮廓且不遮挡城池内部细节
    const fresnel = pow(float(1.0).sub(abs(dot(nw, viewDir))), 4.0);
    const upperMask = smoothstep(205.0, 245.0, wp.y);
    const shimmer = noise2D(wp.xz.mul(0.04).add(vec2(time.mul(0.08), 0.0)));
    const baseAlpha = fresnel.mul(0.065).add(shimmer.mul(0.012)).mul(upperMask);
    return baseAlpha.mul(float(1.0).add(worldUniforms.uAlienReveal.mul(2.2)));
  })();

  return mat;
}

/**
 * 11. 天外母舰环形推进器与青色幻象体积光束材质（参考 ep19_01 与 ep19_03）
 */
export function createCyanBeamMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });

  mat.colorNode = Fn(() => {
    const u = uv();
    const pulse = sin(u.y.mul(18.0).add(time.mul(4.5))).mul(0.2).add(0.8);
    return vec3(0.15, 0.95, 0.98).mul(pulse);
  })();

  mat.opacityNode = Fn(() => {
    const u = uv();
    // 顶部亮，向下渐隐
    const verticalFade = smoothstep(0.0, 0.15, u.y).mul(smoothstep(1.0, 0.25, u.y));
    const coreGlow = sin(u.x.mul(Math.PI));
    const active = worldUniforms.uAlienReveal;
    return verticalFade.mul(coreGlow).mul(active).mul(0.45);
  })();

  return mat;
}

/**
 * 12. 登云玄铁长索材质（带有冷冽金属光泽与微妙灵力流光，在云海中依然清晰可见）
 */
export function createIronChainMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({
    roughness: 0.32,
    metalness: 0.88
  });

  mat.colorNode = Fn(() => {
    const wp = positionWorld;
    const linkPattern = sin(wp.y.add(wp.z).mul(3.5)).mul(0.5).add(0.5);
    const darkIron = vec3(0.18, 0.19, 0.22);
    const bronzeHighlight = vec3(0.52, 0.42, 0.28);
    return mix(darkIron, bronzeHighlight, linkPattern.mul(0.55));
  })();

  mat.emissiveNode = Fn(() => {
    const wp = positionWorld;
    // 沿铁索向上流动的微光脉冲，指引攀爬方向
    const wave = smoothstep(0.82, 0.99, sin(wp.y.mul(0.18).sub(time.mul(2.8))));
    const glowCol = mix(vec3(0.85, 0.58, 0.20), vec3(0.25, 0.92, 0.95), worldUniforms.uAlienReveal);
    return glowCol.mul(wave).mul(0.55);
  })();

  return mat;
}

/**
 * 13. 红白绸布灯笼自发光材质（参考 ep01_08 / ep01_10 满街灯笼）
 */
export function createLanternMaterial(hexColor = 0xc82218) {
  const baseCol = new THREE.Color(hexColor);
  const mat = new THREE.MeshStandardNodeMaterial({
    roughness: 0.55,
    metalness: 0.04
  });

  mat.colorNode = Fn(() => {
    const u = uv();
    const ribs = sin(u.x.mul(36.0)).mul(0.08).add(0.92);
    return color(baseCol).mul(ribs);
  })();

  mat.emissiveNode = Fn(() => {
    const u = uv();
    const core = sin(u.y.mul(Math.PI));
    const intensity = float(0.18).add(worldUniforms.uInteriorGlow.mul(1.25));
    return color(baseCol).mul(float(0.65).add(core.mul(0.55))).mul(intensity);
  })();

  return mat;
}

/**
 * 14. 蜃景主殿内部 · 螺旋流线涡纹玄武岩内壁材质（参考 ep24_25m48s / ep24_27m30s 盘旋交织的流线型石壁）
 */
export function createMirageSwirlWallMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({
    roughness: 0.68,
    metalness: 0.22
  });

  mat.colorNode = Fn(() => {
    const wp = positionWorld;
    // 交织的波浪状流线岩纹 (模拟剧照中雕塑感极强的螺旋纤维石壁)
    const warp = noise2D(wp.zy.mul(0.28)).mul(3.2);
    const wave1 = sin(wp.z.mul(1.65).add(wp.y.mul(1.35)).add(warp)).mul(0.5).add(0.5);
    const wave2 = sin(wp.z.mul(3.8).sub(wp.y.mul(2.4)).add(warp.mul(1.4))).mul(0.5).add(0.5);
    const fineRibs = smoothstep(0.22, 0.85, wave1.mul(0.62).add(wave2.mul(0.38)));

    const deepBasalt = vec3(0.08, 0.10, 0.13);
    const slateRidge = vec3(0.20, 0.24, 0.30);
    const coolHighlight = vec3(0.28, 0.35, 0.44);

    const base = mix(deepBasalt, slateRidge, fineRibs);
    return mix(base, coolHighlight, pow(fineRibs, 3.0).mul(0.45));
  })();

  mat.emissiveNode = Fn(() => {
    const wp = positionWorld;
    const pulse = sin(wp.z.mul(0.45).add(time.mul(1.6))).mul(0.5).add(0.5);
    const seam = smoothstep(0.90, 0.99, sin(wp.y.mul(2.6).add(noise2D(wp.xz.mul(0.35)).mul(4.0))));
    return vec3(0.12, 0.55, 0.78).mul(seam).mul(pulse).mul(float(0.08).add(worldUniforms.uAlienReveal.mul(0.35)));
  })();

  return mat;
}

/**
 * 15. 天外医疗床 / 重生石榻发光脉络材质（精确复刻 ep24_27m24s 金色同心圆与平行流光电路 / ep24_20m00s 绯红预警态）
 */
export function createMedicalPodCircuitMaterial() {
  const mat = new THREE.MeshStandardNodeMaterial({
    roughness: 0.30,
    metalness: 0.35
  });

  const circuitPattern = Fn(() => {
    const u = uv();
    // 头部同心圆区域 (位于 u.y = 0.26 附近)
    const center = vec2(0.5, 0.26);
    const dVec = vec2(u.x.sub(center.x).mul(1.35), u.y.sub(center.y).mul(2.1));
    const dist = length(dVec);

    const ringWave = abs(fract(dist.mul(11.0)).sub(0.5)).mul(2.0);
    const rings = smoothstep(0.72, 0.95, ringWave).mul(smoothstep(0.46, 0.08, dist));
    const coreDot = smoothstep(0.10, 0.02, dist);

    // 向下延伸的 6 道平行流光脉络 (位于 u.y = 0.32 .. 0.88)
    const xCentered = abs(u.x.sub(0.5));
    const laneWave = abs(fract(u.x.mul(9.0)).sub(0.5)).mul(2.0);
    const lanes = smoothstep(0.76, 0.96, laneWave)
      .mul(smoothstep(0.34, 0.28, xCentered))
      .mul(smoothstep(0.26, 0.34, u.y))
      .mul(smoothstep(0.90, 0.80, u.y));

    // 外围石榻轮廓发光边线
    const borderX = smoothstep(0.34, 0.38, xCentered).mul(smoothstep(0.43, 0.39, xCentered));
    const borderY = smoothstep(0.10, 0.88, u.y).mul(smoothstep(0.92, 0.84, u.y));
    const border = borderX.mul(borderY).mul(0.75);

    return max(max(rings, coreDot), max(lanes, border));
  });

  mat.colorNode = Fn(() => {
    const pat = circuitPattern();
    const stoneBed = vec3(0.28, 0.30, 0.34);
    const goldTrace = vec3(0.98, 0.82, 0.38);
    const redTrace = vec3(0.98, 0.22, 0.36);
    const traceCol = mix(goldTrace, redTrace, worldUniforms.uAlienReveal);
    return mix(stoneBed, traceCol, pat);
  })();

  mat.emissiveNode = Fn(() => {
    const u = uv();
    const pat = circuitPattern();
    const flow = sin(u.y.mul(14.0).sub(time.mul(3.2))).mul(0.25).add(0.85);
    const goldEmit = vec3(1.0, 0.76, 0.22);
    const redEmit = vec3(1.0, 0.15, 0.32);
    const emitCol = mix(goldEmit, redEmit, worldUniforms.uAlienReveal);
    return emitCol.mul(pat).mul(flow).mul(1.65);
  })();

  return mat;
}

/**
 * 16. 蜃景内殿圆形舷窗、柳叶天窗与拱形天幕视窗发光材质（参考 ep24_07m29s / ep24_24m12s / ep24_27m12s）
 */
export function createMiragePortholeGlowMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial({
    side: THREE.DoubleSide
  });

  mat.colorNode = Fn(() => {
    const u = uv();
    const wp = positionWorld;
    const cloud = noise2D(wp.xy.mul(0.14).add(vec2(time.mul(0.08), time.mul(0.04))));
    const radial = float(1.0).sub(length(u.sub(vec2(0.5, 0.5))).mul(1.15));
    const skyCyan = vec3(0.55, 0.82, 0.98);
    const brightCore = vec3(0.94, 0.98, 1.0);
    return mix(skyCyan, brightCore, smoothstep(0.15, 0.85, cloud.mul(0.45).add(radial.mul(0.65))));
  })();

  return mat;
}
