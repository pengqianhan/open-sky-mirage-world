// js/architecture.js
// 参数化中国古建筑与场景道具建模库（遵循 kimi_tutorial.pdf 参数化建模规范）
// 支持：飞檐歇山顶、收分城墙与雉堞、白墙木构望楼(ep01_08)、收分团花钟鼓楼(ep23_05)、多层宝塔(ep04_02)、重檐主殿与神机飞爪台

import * as THREE from 'three/webgpu';
import {
  createCityWallMaterial,
  createTimberFacadeMaterial,
  createRoofTileMaterial,
  createPaintedWoodMaterial,
  createLanternMaterial
} from './tsl-materials.js';

// 全局共享材质缓存（大幅减少 WebGPU 管线编译批次）
let _materials = null;
export function getSharedArchMaterials() {
  if (_materials) return _materials;
  _materials = {
    dengzhouWall: createCityWallMaterial(true),       // 登州灰白收分大墙 (ep01_06)
    mirageWall: createCityWallMaterial(false),        // 蜃景沧桑青砖城垣 (ep04_02, ep23_03)
    facadeA: createTimberFacadeMaterial(1.1),         // 白墙木构立面 A
    facadeB: createTimberFacadeMaterial(3.7),         // 白墙木构立面 B
    roofSlate: createRoofTileMaterial(false),         // 青黛筒瓦屋顶
    roofImperial: createRoofTileMaterial(true),       // 鎏金琉璃剪边屋顶 (ep23_05)
    redWood: createPaintedWoodMaterial(0x631f19, 0.50),   // 朱漆木柱与斗拱
    darkWood: createPaintedWoodMaterial(0x281a12, 0.62),  // 乌木梁架与栏杆
    bronze: new THREE.MeshStandardNodeMaterial({
      color: 0x3a352a,
      roughness: 0.36,
      metalness: 0.78
    }),
    goldAccent: new THREE.MeshStandardNodeMaterial({
      color: 0xd9a848,
      roughness: 0.28,
      metalness: 0.85
    }),
    stoneBase: new THREE.MeshStandardNodeMaterial({
      color: 0x6b7075,
      roughness: 0.80,
      metalness: 0.05
    }),
    stoneMedallion: new THREE.MeshStandardNodeMaterial({
      color: 0x9ca09e,
      roughness: 0.65,
      metalness: 0.08
    }),
    redLantern: createLanternMaterial(0xe63926),
    whiteLantern: createLanternMaterial(0xd8e2dc),
    goldLantern: createLanternMaterial(0xf4b942),
    blossomPink: new THREE.MeshStandardNodeMaterial({
      color: 0xf4a7b9,
      roughness: 0.75,
      metalness: 0.02
    }),
    pineGreen: new THREE.MeshStandardNodeMaterial({
      color: 0x1e3822,
      roughness: 0.85,
      metalness: 0.02
    }),
    bannerGold: new THREE.MeshStandardNodeMaterial({
      color: 0xc89b58,
      roughness: 0.72,
      side: THREE.DoubleSide
    }),
    bannerWhite: new THREE.MeshStandardNodeMaterial({
      color: 0xdce2e6,
      roughness: 0.72,
      side: THREE.DoubleSide
    }),
    canopyRed: new THREE.MeshStandardNodeMaterial({
      color: 0x9e2822,
      roughness: 0.68,
      side: THREE.DoubleSide
    })
  };
  return _materials;
}

/**
 * 构建带有反宇弧度与飞檐翘角的参数化中国古典屋顶网格
 */
export function createCurvedRoofGeometry(width, depth, height, eaveCurve = 0.42, topRatio = 0.46) {
  const segX = 10;
  const segZ = 8;
  const geom = new THREE.BoxGeometry(width, height, depth, segX, 1, segZ);
  const pos = geom.attributes.position;
  const halfW = width * 0.5;
  const halfD = depth * 0.5;
  const halfH = height * 0.5;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const nx = Math.abs(x) / halfW; // 0 (中轴) -> 1 (翼角)
    const nz = Math.abs(z) / halfD;
    const radialCorner = Math.pow(nx * nz, 1.35);

    if (y > 0) {
      // 屋顶上表面：收拢形成歇山/庑殿坡面，并在四角向上翘起（飞檐）
      x *= topRatio + (1.0 - topRatio) * (1.0 - Math.pow(nz, 1.2) * 0.65);
      z *= 0.25 + 0.75 * (1.0 - Math.pow(nx, 1.4) * 0.55);
      // 反宇下凹曲线
      const sag = (1.0 - Math.max(nx, nz)) * height * 0.22;
      y = halfH - sag + radialCorner * eaveCurve * height * 0.55;
    } else {
      // 屋檐底面：四角优雅上翘
      y = -halfH + radialCorner * eaveCurve * height * 0.95;
    }

    pos.setXYZ(i, x, y, z);
  }

  geom.computeVertexNormals();
  return geom;
}

/**
 * 创建带正脊、垂脊与鸱吻瑞兽的完整古典屋顶组件
 */
export function buildClassicalRoof(width, depth, height, options = {}) {
  const mats = getSharedArchMaterials();
  const {
    goldenTrim = false,
    eaveCurve = 0.48,
    topRatio = 0.48
  } = options;

  const group = new THREE.Group();
  const roofGeo = createCurvedRoofGeometry(width, depth, height, eaveCurve, topRatio);
  const roofMesh = new THREE.Mesh(roofGeo, goldenTrim ? mats.roofImperial : mats.roofSlate);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  group.add(roofMesh);

  // 正脊横梁与两端鸱吻翘角
  const ridgeLen = width * topRatio * 1.06;
  const ridgeGeo = new THREE.BoxGeometry(ridgeLen, height * 0.22, Math.max(0.45, depth * 0.06));
  const ridgeMesh = new THREE.Mesh(ridgeGeo, goldenTrim ? mats.goldAccent : mats.roofSlate);
  ridgeMesh.position.y = height * 0.50;
  group.add(ridgeMesh);

  // 鸱吻 (两端装饰兽头)
  const hornGeo = new THREE.ConeGeometry(height * 0.18, height * 0.55, 4);
  for (const sign of [-1, 1]) {
    const horn = new THREE.Mesh(hornGeo, goldenTrim ? mats.goldAccent : mats.roofSlate);
    horn.position.set(sign * (ridgeLen * 0.5), height * 0.68, 0);
    horn.rotation.z = -sign * 0.28;
    group.add(horn);
  }

  return group;
}

/**
 * 构建带收分（上窄下宽）与顶层雉堞垛口的城墙段
 */
export function buildBatteredWallSegment(length, height, thickness, options = {}) {
  const mats = getSharedArchMaterials();
  const {
    whiteWashed = false,
    batterRatio = 0.76,
    crenellations = true
  } = options;

  const group = new THREE.Group();
  const wallMat = whiteWashed ? mats.dengzhouWall : mats.mirageWall;

  // 收分墙体几何
  const wallGeo = new THREE.BoxGeometry(length, height, thickness, 1, 1, 1);
  const pos = wallGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      pos.setZ(i, pos.getZ(i) * batterRatio);
    }
  }
  wallGeo.computeVertexNormals();

  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.position.y = height * 0.5;
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // 顶部两侧女儿墙与雉堞垛口
  if (crenellations) {
    const topThick = thickness * batterRatio;
    const merlonW = 1.65;
    const merlonGap = 0.85;
    const step = merlonW + merlonGap;
    const count = Math.max(2, Math.floor((length - 1.0) / step));
    const merlonGeo = new THREE.BoxGeometry(merlonW, 1.15, 0.55);

    for (const side of [-1, 1]) {
      const zOff = side * (topThick * 0.5 - 0.32);
      for (let i = 0; i < count; i++) {
        const xOff = -((count - 1) * step) * 0.5 + i * step;
        const merlon = new THREE.Mesh(merlonGeo, wallMat);
        merlon.position.set(xOff, height + 0.55, zOff);
        merlon.castShadow = true;
        group.add(merlon);
      }
    }
  }

  return group;
}

/**
 * 构建多层重檐大殿/城楼（用于登州城门楼 ep01_06、鼓楼、州衙及蜃景三层重檐主殿 ep04_02/ep17_01）
 */
export function buildPalaceHall(options = {}) {
  const mats = getSharedArchMaterials();
  const {
    width = 28,
    depth = 18,
    stories = 2,
    storyHeight = 5.2,
    basePlatformH = 1.6,
    goldenRoof = false,
    hasBalcony = true,
    hollowInterior = false
  } = options;

  const group = new THREE.Group();
  let curY = 0;

  // 1. 须弥座石台基
  if (basePlatformH > 0) {
    const baseDepth = hollowInterior ? depth + 1.0 : depth + 3.2;
    const baseGeo = new THREE.BoxGeometry(width + 3.2, basePlatformH, baseDepth);
    const baseMesh = new THREE.Mesh(baseGeo, mats.stoneBase);
    baseMesh.position.y = basePlatformH * 0.5;
    baseMesh.receiveShadow = true;
    baseMesh.castShadow = true;
    group.add(baseMesh);

    // 正面踏道台阶（若为挑空主殿则由外部 24 级雕花御道石阶直接衔接，避免突兀单块方石）
    if (!hollowInterior) {
      const stairGeo = new THREE.BoxGeometry(width * 0.32, basePlatformH, 2.8);
      const stairMesh = new THREE.Mesh(stairGeo, mats.stoneBase);
      stairMesh.position.set(0, basePlatformH * 0.45, (depth + 3.2) * 0.5 + 1.1);
      group.add(stairMesh);
    }

    curY += basePlatformH;
  }

  // 2. 逐层构建殿身、回廊红柱、平座栏杆与飞檐屋顶
  for (let s = 0; s < stories; s++) {
    const scale = Math.pow(0.84, s);
    const w = width * scale;
    const d = depth * scale;
    const h = hollowInterior && s === 0
      ? storyHeight * 1.68
      : storyHeight * (s === 0 ? 1.0 : 0.88);

    // 殿身木构白墙体（若 hollowInterior 为 true，则 0/1 层留空给内部天外母舰石殿）
    if (!hollowInterior || s >= 2) {
      const coreGeo = new THREE.BoxGeometry(w * 0.86, h, d * 0.84);
      const coreMesh = new THREE.Mesh(coreGeo, s % 2 === 0 ? mats.facadeA : mats.facadeB);
      coreMesh.position.y = curY + h * 0.5;
      coreMesh.castShadow = true;
      coreMesh.receiveShadow = true;
      group.add(coreMesh);
    }

    // 外圈檐柱
    const colRadius = 0.28 * scale;
    const colGeo = new THREE.CylinderGeometry(colRadius, colRadius * 1.08, h, 8);
    const colsX = Math.max(4, Math.round(w / 4.2));
    for (let i = 0; i < colsX; i++) {
      const x = -w * 0.46 + (i / (colsX - 1)) * (w * 0.92);
      for (const zSign of [-1, 1]) {
        if (hollowInterior && s === 0 && zSign === 1 && Math.abs(x) < 4.6) continue;
        const col = new THREE.Mesh(colGeo, mats.redWood);
        col.position.set(x, curY + h * 0.5, zSign * d * 0.46);
        col.castShadow = true;
        group.add(col);
      }
    }

    // 斗拱挑檐层与平座木栏杆 (参考 ep01_06 / ep04_03)
    if (hasBalcony && s > 0) {
      const railW = w * 0.98;
      const railD = d * 0.98;
      const railGeoX = new THREE.BoxGeometry(railW, 0.95, 0.22);
      const railGeoZ = new THREE.BoxGeometry(0.22, 0.95, railD);
      for (const sign of [-1, 1]) {
        const rx = new THREE.Mesh(railGeoX, mats.darkWood);
        rx.position.set(0, curY + 0.5, sign * railD * 0.5);
        group.add(rx);
        const rz = new THREE.Mesh(railGeoZ, mats.darkWood);
        rz.position.set(sign * railW * 0.5, curY + 0.5, 0);
        group.add(rz);
      }
    }

    // 本层重檐/屋顶
    const roofW = w * 1.30;
    const roofD = d * 1.32;
    const roofH = (s === stories - 1) ? h * 0.72 : h * 0.46;
    const roof = buildClassicalRoof(roofW, roofD, roofH, {
      goldenTrim: goldenRoof,
      eaveCurve: s === stories - 1 ? 0.52 : 0.38,
      topRatio: s === stories - 1 ? 0.46 : 0.68
    });
    roof.position.y = curY + h + roofH * 0.32;
    group.add(roof);

    // 檐角悬挂灯笼
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const lantern = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.28, 0.75, 8),
          goldenRoof ? mats.goldLantern : mats.redLantern
        );
        lantern.position.set(sx * roofW * 0.44, curY + h - 0.2, sz * roofD * 0.44);
        group.add(lantern);
      }
    }

    curY += h + roofH * 0.22;
  }

  return group;
}

/**
 * 构建登州长街白墙木格望楼（精确还原 ep01_08 街道两侧高耸木构望楼！）
 */
export function buildDengzhouWatchtower(height = 17.5) {
  const mats = getSharedArchMaterials();
  const group = new THREE.Group();

  const baseW = 6.8;
  const topW = 5.4;
  const towerH = height * 0.72;

  // 收分塔身（白灰墙面）
  const bodyGeo = new THREE.BoxGeometry(baseW, towerH, baseW, 1, 3, 1);
  const pos = bodyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y + towerH * 0.5) / towerH;
    const s = 1.0 - t * (1.0 - topW / baseW);
    pos.setX(i, pos.getX(i) * s);
    pos.setZ(i, pos.getZ(i) * s);
  }
  bodyGeo.computeVertexNormals();

  const bodyMesh = new THREE.Mesh(bodyGeo, mats.facadeA);
  bodyMesh.position.y = towerH * 0.5;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // 顶部挑出平座木栏杆与望亭（参考 ep01_08 右侧高塔）
  const deckY = towerH;
  const deckW = topW * 1.32;
  const deckGeo = new THREE.BoxGeometry(deckW, 0.55, deckW);
  const deckMesh = new THREE.Mesh(deckGeo, mats.darkWood);
  deckMesh.position.y = deckY;
  group.add(deckMesh);

  // 栏杆
  const railGeo = new THREE.BoxGeometry(deckW, 1.05, 0.18);
  for (const s of [-1, 1]) {
    const rFront = new THREE.Mesh(railGeo, mats.darkWood);
    rFront.position.set(0, deckY + 0.65, s * deckW * 0.48);
    group.add(rFront);
    const rSide = new THREE.Mesh(railGeo, mats.darkWood);
    rSide.rotation.y = Math.PI * 0.5;
    rSide.position.set(s * deckW * 0.48, deckY + 0.65, 0);
    group.add(rSide);
  }

  // 顶层瞭望亭与歇山顶
  const cabinH = height * 0.24;
  const cabinGeo = new THREE.BoxGeometry(topW * 0.88, cabinH, topW * 0.88);
  const cabinMesh = new THREE.Mesh(cabinGeo, mats.darkWood);
  cabinMesh.position.y = deckY + cabinH * 0.5;
  group.add(cabinMesh);

  const roof = buildClassicalRoof(deckW * 1.28, deckW * 1.28, 3.2, {
    eaveCurve: 0.55,
    topRatio: 0.25
  });
  roof.position.y = deckY + cabinH + 1.1;
  group.add(roof);

  // 望楼四角宫灯
  const lanternGeo = new THREE.CylinderGeometry(0.35, 0.30, 0.85, 8);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const l = new THREE.Mesh(lanternGeo, mats.goldLantern);
      l.position.set(sx * deckW * 0.56, deckY + cabinH - 0.15, sz * deckW * 0.56);
      group.add(l);
    }
  }

  return group;
}

/**
 * 构建蜃景内城收分白墙团花钟鼓角楼（精确还原 ep23_05 广场两侧极具辨识度的梯形白底团花钟鼓楼！）
 */
export function buildMirageCourtyardTower() {
  const mats = getSharedArchMaterials();
  const group = new THREE.Group();

  const baseW = 9.2;
  const topW = 6.6;
  const baseH = 7.5;

  // 1. 梯形收分高台底座（白色边框 + 深灰梯形内嵌面 + 中央圆形石雕团花）
  const baseGeo = new THREE.BoxGeometry(baseW, baseH, baseW);
  const pos = baseGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      pos.setX(i, pos.getX(i) * (topW / baseW));
      pos.setZ(i, pos.getZ(i) * (topW / baseW));
    }
  }
  baseGeo.computeVertexNormals();
  const baseMesh = new THREE.Mesh(baseGeo, mats.dengzhouWall);
  baseMesh.position.y = baseH * 0.5;
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // 四面梯形深灰镶板与圆形浮雕团花 (ep23_05 标志性细节)
  const medallionGeo = new THREE.CylinderGeometry(1.45, 1.45, 0.28, 16);
  medallionGeo.rotateX(Math.PI * 0.5);
  const slopeAngle = Math.atan2((baseW - topW) * 0.5, baseH);

  for (let side = 0; side < 4; side++) {
    const faceGroup = new THREE.Group();
    faceGroup.rotation.y = side * Math.PI * 0.5;

    const panelGeo = new THREE.BoxGeometry(baseW * 0.62, baseH * 0.68, 0.18);
    const panel = new THREE.Mesh(panelGeo, mats.stoneBase);
    panel.position.set(0, baseH * 0.5, (baseW + topW) * 0.25);
    panel.rotation.x = -slopeAngle;
    faceGroup.add(panel);

    const med = new THREE.Mesh(medallionGeo, mats.stoneMedallion);
    med.position.set(0, baseH * 0.5, (baseW + topW) * 0.25 + 0.08);
    med.rotation.x = -slopeAngle;
    faceGroup.add(med);

    group.add(faceGroup);
  }

  // 2. 顶层朱漆木构钟鼓亭与飞檐歇山顶
  const pavilion = buildPalaceHall({
    width: topW * 0.92,
    depth: topW * 0.92,
    stories: 1,
    storyHeight: 4.2,
    basePlatformH: 0.4,
    goldenRoof: false,
    hasBalcony: true
  });
  pavilion.position.y = baseH;
  group.add(pavilion);

  return group;
}

/**
 * 构建多层宝塔（精确还原 ep04_02 / ep17_01 蜃景城池左侧四层宝塔与右侧三层配塔）
 */
export function buildPagoda(tiers = 4, baseWidth = 11.0) {
  const mats = getSharedArchMaterials();
  const group = new THREE.Group();

  let curY = 0;
  // 台基
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(baseWidth * 1.25, 2.2, baseWidth * 1.25),
    mats.stoneBase
  );
  plinth.position.y = 1.1;
  group.add(plinth);
  curY += 2.2;

  for (let t = 0; t < tiers; t++) {
    const scale = Math.pow(0.82, t);
    const w = baseWidth * scale;
    const h = 4.2 * Math.pow(0.90, t);

    const core = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.78, h, w * 0.78),
      mats.facadeB
    );
    core.position.y = curY + h * 0.5;
    core.castShadow = true;
    group.add(core);

    const roof = buildClassicalRoof(w * 1.38, w * 1.38, 2.2 * scale, {
      eaveCurve: 0.56,
      topRatio: 0.32
    });
    roof.position.y = curY + h + 0.7 * scale;
    group.add(roof);

    curY += h + 1.1 * scale;
  }

  // 塔刹金顶
  const spire = new THREE.Mesh(
    new THREE.ConeGeometry(0.65, 4.2, 8),
    mats.goldAccent
  );
  spire.position.y = curY + 2.0;
  group.add(spire);

  return group;
}

/**
 * 构建登云崖【神机飞爪发射台】（铁索地面起点锚座，参考 ep23_02）
 */
export function buildGrapplingLaunchpad() {
  const mats = getSharedArchMaterials();
  const group = new THREE.Group();

  // 八角石筑发射基座
  const padGeo = new THREE.CylinderGeometry(8.5, 10.5, 2.6, 8);
  const padMesh = new THREE.Mesh(padGeo, mats.stoneBase);
  padMesh.position.y = 1.3;
  padMesh.receiveShadow = true;
  group.add(padMesh);

  // 巨型玄铁绞盘与神机弩架
  const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.2, 5.5), mats.darkWood);
  frameLeft.position.set(-2.2, 3.6, 0);
  frameLeft.rotation.x = 0.45;
  group.add(frameLeft);

  const frameRight = frameLeft.clone();
  frameRight.position.x = 2.2;
  group.add(frameRight);

  // 铜铁绞盘滚筒
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 5.2, 12),
    mats.bronze
  );
  drum.rotation.z = Math.PI * 0.5;
  drum.position.set(0, 3.4, 0.8);
  group.add(drum);

  // 四角引路火盆灯柱
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 4.5, 6), mats.stoneBase);
      pillar.position.set(sx * 6.2, 4.5, sz * 6.2);
      group.add(pillar);

      const brazier = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), mats.goldLantern);
      brazier.position.set(sx * 6.2, 7.0, sz * 6.2);
      group.add(brazier);
    }
  }

  return group;
}
