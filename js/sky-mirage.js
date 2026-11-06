import { createLeadCharacter } from './lead-characters.js';
// js/sky-mirage.js
// 构建空中蜃景（高家渡 / 重生之城 / 天外母舰）：
// 包含倒锥形浮空岩岛(ep04_01)、水平条纹海市蜃楼虚影层(ep01_12)、旋涡云海与底部云洞(ep23_01)、
// 青砖城垣与重檐城门(ep23_03)、内城团花钟鼓楼与石板广场(ep23_05)、左四层塔/中三层主殿/右三层塔(ep17_01)、
// 球形力场护盾(ep17_01)及天外母舰环形推进器与青色幻象光束(ep19_01, ep19_03)

import * as THREE from 'three/webgpu';
import { MIRAGE_CONFIG, valueNoise2D } from './world-config.js';
import {
  createStoneRoadMaterial,
  createFloatingRockMaterial,
  createMirageWaveGhostMaterial,
  createVortexCloudMaterial,
  createForcefieldDomeMaterial,
  createCyanBeamMaterial,
  createMirageSwirlWallMaterial,
  createMedicalPodCircuitMaterial,
  createMiragePortholeGlowMaterial
} from './tsl-materials.js';
import {
  getSharedArchMaterials,
  buildBatteredWallSegment,
  buildPalaceHall,
  buildMirageCourtyardTower,
  buildPagoda
} from './architecture.js';

export function buildSkyMirage(scene) {
  const root = new THREE.Group();
  root.name = 'SkyMirage';
  const { centerX, baseY, centerZ, radiusX, radiusZ, wallHalfX, wallHalfZ, rockDepth } = MIRAGE_CONFIG;
  root.position.set(centerX, baseY, centerZ);

  const colliders = [];
  const mats = getSharedArchMaterials();

  // 辅助函数：将蜃景局部碰撞盒转换到世界坐标
  function addMirageCollider(minLX, maxLX, minLZ, maxLZ, minLY, maxLY) {
    colliders.push({
      minX: centerX + minLX,
      maxX: centerX + maxLX,
      minZ: centerZ + minLZ,
      maxZ: centerZ + maxLZ,
      minY: baseY + minLY,
      maxY: baseY + maxLY
    });
  }

  // ---------------------------------------------------------------------------
  // 1. 倒锥形浮空风化岩岛底座 (复刻 ep04_01 与 ep19_02)
  // ---------------------------------------------------------------------------
  const rockMat = createFloatingRockMaterial();
  const rockGroup = new THREE.Group();

  // 主浮岛倒置多棱锥体（顶面平坦承托城池，侧面与底部嶙峋突起）
  const radialSegs = 48;
  const heightSegs = 14;
  const coneGeo = new THREE.CylinderGeometry(1.0, 0.08, rockDepth, radialSegs, heightSegs, false);
  coneGeo.translate(0, -rockDepth * 0.5, 0);
  const cPos = coneGeo.attributes.position;

  for (let i = 0; i < cPos.count; i++) {
    let x = cPos.getX(i);
    let y = cPos.getY(i);
    let z = cPos.getZ(i);

    const depthRatio = Math.max(0, Math.min(1, -y / rockDepth)); // 0 (顶面) -> 1 (底尖)
    if (depthRatio < 0.02) {
      // 顶面保持平整椭圆台面，承托城墙与石板广场
      x *= radiusX;
      z *= radiusZ;
      y = -0.15;
    } else {
      const angle = Math.atan2(z, x);
      const n1 = valueNoise2D(Math.cos(angle) * 3.8 + 2.1, depthRatio * 6.5);
      const n2 = valueNoise2D(Math.sin(angle) * 7.5 - 1.4, depthRatio * 12.0);
      // 阶梯状风化断层剖面 (贴合 ep04_01 宽扁岩石底座)
      const profile = Math.pow(1.0 - depthRatio, 0.58) * (0.76 + 0.34 * n1 + 0.14 * n2);
      x *= radiusX * profile / Math.max(0.08, 1.0 - depthRatio * 0.92);
      z *= radiusZ * profile / Math.max(0.08, 1.0 - depthRatio * 0.92);
      // 底部垂悬岩锥
      y -= Math.pow(depthRatio, 1.4) * (n2 - 0.5) * 9.0;
    }
    cPos.setXYZ(i, x, y, z);
  }
  coneGeo.computeVertexNormals();

  const mainRockMesh = new THREE.Mesh(coneGeo, rockMat);
  mainRockMesh.castShadow = true;
  mainRockMesh.receiveShadow = true;
  rockGroup.add(mainRockMesh);

  // 两侧悬浮护卫子岩岛（复刻 ep19_01 母舰两侧外伸翼岛与 ep19_02 浮石）
  const outriggerGeo = new THREE.ConeGeometry(16, 28, 9);
  outriggerGeo.rotateX(Math.PI);
  for (const sign of [-1, 1]) {
    const subIsland = new THREE.Group();
    subIsland.position.set(sign * (radiusX + 26), -14, 8);

    const subRock = new THREE.Mesh(outriggerGeo, rockMat);
    subRock.scale.set(1.2, 1.0, 0.9);
    subIsland.add(subRock);

    const subTower = buildPagoda(2, 6.5);
    subTower.position.y = 14;
    subIsland.add(subTower);

    // 连接主岛与子岛的岩石/母舰横梁
    const bridgeArm = new THREE.Mesh(
      new THREE.BoxGeometry(28, 4.5, 7.5),
      rockMat
    );
    bridgeArm.position.set(-sign * 18, 6, 0);
    subIsland.add(bridgeArm);

    rockGroup.add(subIsland);
  }
  root.add(rockGroup);

  // ---------------------------------------------------------------------------
  // 2. 蜃景内城湿润反光青石板大广场与主殿须弥高台 (复刻 ep23_05)
  // ---------------------------------------------------------------------------
  const plazaMat = createStoneRoadMaterial(true);
  const plazaGeo = new THREE.PlaneGeometry(wallHalfX * 2 + 16, wallHalfZ * 2 + 22);
  plazaGeo.rotateX(-Math.PI * 0.5);
  const plazaMesh = new THREE.Mesh(plazaGeo, plazaMat);
  plazaMesh.position.set(0, 0.05, 2);
  plazaMesh.receiveShadow = true;
  root.add(plazaMesh);

  // 主殿北侧崇台 (高 4.2m, 位于局部 z = -22.5..-65.5，南立面严丝合缝退至石阶顶端 -22.5，彻底消除台阶突兀断崖)
  const terraceH = 4.2;
  const terraceGeo = new THREE.BoxGeometry(68, terraceH, 43.0);
  const terraceMesh = new THREE.Mesh(terraceGeo, mats.mirageWall);
  terraceMesh.position.set(0, terraceH * 0.5, -44.0);
  terraceMesh.receiveShadow = true;
  terraceMesh.castShadow = true;
  root.add(terraceMesh);

  // 中轴御道宽阔登殿雕花石阶 (局部 z = -9.3..-22.5, 共 24 级青白石挑沿踏面与卷草云纹浮雕踢脚面，直达 5.4m 主殿门廊, 复刻 ep23_50m15s / ep23_50m45s)
  const palaceFloorY = terraceH + 1.2; // 5.4m
  const stairStartZ = -9.3;
  const stairEndZ = -22.5;
  const stairRun = stairStartZ - stairEndZ; // 13.2m
  const stepCount = 24;
  const riserH = palaceFloorY / stepCount; // 0.225m 标准人体工学踏步高度
  const treadD = stairRun / stepCount;     // 0.55m 宽绰御道踏步深度
  const stairWidth = 22.4;

  const treadStoneMat = new THREE.MeshStandardNodeMaterial({
    color: 0x8d959e,
    roughness: 0.64,
    metalness: 0.08
  });
  const riserCarvedMat = new THREE.MeshStandardNodeMaterial({
    color: 0x565e68,
    roughness: 0.78,
    metalness: 0.12
  });
  const reliefStoneMat = new THREE.MeshStandardNodeMaterial({
    color: 0xa2aab4,
    roughness: 0.58,
    metalness: 0.10
  });

  const stairGroup = new THREE.Group();
  stairGroup.name = 'GrandPalaceCarvedStaircase';

  const treadGeo = new THREE.BoxGeometry(stairWidth, 0.058, treadD + 0.055);
  const reliefGeo = new THREE.BoxGeometry(2.35, riserH * 0.52, 0.028);

  for (let i = 0; i < stepCount; i++) {
    const stepTopY = (i + 1) * riserH;
    const stepFrontZ = stairStartZ - i * treadD;
    const stepCenterZ = stepFrontZ - treadD * 0.5;

    // 1. 阶梯承重石基与暗色内凹踢脚面 (延伸至后方防止任何透光缝隙)
    const bodyDepth = treadD + 0.24;
    const bodyH = stepTopY - 0.055;
    const stepBody = new THREE.Mesh(
      new THREE.BoxGeometry(stairWidth - 0.16, bodyH, bodyDepth),
      riserCarvedMat
    );
    stepBody.position.set(0, bodyH * 0.5, stepCenterZ - 0.08);
    stepBody.receiveShadow = true;
    stepBody.castShadow = true;
    stairGroup.add(stepBody);

    // 2. 青白石挑沿踏板 (前缘挑出 3cm 形成清晰阴影线，彻底区分每一级台阶)
    const treadMesh = new THREE.Mesh(treadGeo, treadStoneMat);
    treadMesh.position.set(0, stepTopY - 0.029, stepCenterZ + 0.025);
    treadMesh.receiveShadow = true;
    treadMesh.castShadow = true;
    stairGroup.add(treadMesh);

    // 3. 踢脚面如意卷草云纹浮雕石框 (复刻 ep23_50m15s / ep23_50m45s 每级石阶正面的雕花纹饰)
    const reliefY = stepTopY - riserH * 0.56;
    for (let k = -3; k <= 3; k++) {
      const plaque = new THREE.Mesh(reliefGeo, reliefStoneMat);
      plaque.position.set(k * 3.05, reliefY, stepFrontZ + 0.008);
      stairGroup.add(plaque);
    }
  }

  // 殿前顶部宽敞青白石月台檐廊 (连接第 24 级台阶 z = -22.5 至六扇格扇门 z = -24.5)
  const verandaDeck = new THREE.Mesh(
    new THREE.BoxGeometry(stairWidth + 1.2, 0.08, 2.4),
    treadStoneMat
  );
  verandaDeck.position.set(0, palaceFloorY - 0.02, -23.5);
  verandaDeck.receiveShadow = true;
  stairGroup.add(verandaDeck);

  // 登殿石阶两侧青白石垂带斜墙 + 朱红描金寻杖栏杆与黑底描金卷草纹栏板 (精确复刻 ep23_50m15s 左侧斜向雕花护栏)
  const slopeLen = Math.hypot(stairRun, palaceFloorY);
  const slopeAngle = Math.atan2(palaceFloorY, stairRun);
  const slopeMidZ = (stairStartZ + stairEndZ) * 0.5;

  for (const xSign of [-1, 1]) {
    const railX = xSign * (stairWidth * 0.5 + 0.18);
    const railGroup = new THREE.Group();

    // 斜向青白石垂带底座 (完全封住台阶侧面阶齿)
    const cheekCurb = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.36, slopeLen + 0.4),
      treadStoneMat
    );
    cheekCurb.position.set(railX, palaceFloorY * 0.5 + 0.06, slopeMidZ);
    cheekCurb.rotation.x = slopeAngle;
    cheekCurb.castShadow = true;
    cheekCurb.receiveShadow = true;
    railGroup.add(cheekCurb);

    // 顶部朱红圆木寻杖扶手与下部平盘斗横梁
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, slopeLen + 0.5), mats.redWood);
    topRail.position.set(railX, palaceFloorY * 0.5 + 1.04, slopeMidZ);
    topRail.rotation.x = slopeAngle;
    railGroup.add(topRail);

    const bottomRail = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.12, slopeLen + 0.3), mats.redWood);
    bottomRail.position.set(railX, palaceFloorY * 0.5 + 0.30, slopeMidZ);
    bottomRail.rotation.x = slopeAngle;
    railGroup.add(bottomRail);

    // 黑底描金绦环栏板 (复刻 ep23_50m15s 护栏中间黑底金框雕花板)
    const subPanel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.48, slopeLen), mats.darkWood);
    subPanel.position.set(railX, palaceFloorY * 0.5 + 0.66, slopeMidZ);
    subPanel.rotation.x = slopeAngle;
    railGroup.add(subPanel);

    const goldTrim = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, slopeLen - 0.6), mats.goldRoof);
    goldTrim.position.set(railX, palaceFloorY * 0.5 + 0.66, slopeMidZ);
    goldTrim.rotation.x = slopeAngle;
    railGroup.add(goldTrim);

    // 7 根斜列朱红蜀柱与鎏金莲花望柱头
    const postCount = 6;
    for (let p = 0; p <= postCount; p++) {
      const pt = p / postCount;
      const pz = stairStartZ - pt * stairRun;
      const py = pt * palaceFloorY;

      const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.18, 0.26), mats.redWood);
      post.position.set(railX, py + 0.58, pz);
      post.castShadow = true;
      railGroup.add(post);

      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), mats.goldRoof);
      cap.position.set(railX, py + 1.22, pz);
      railGroup.add(cap);
    }

    // 崇台南侧左右两翼水平护栏与防跌落碰撞体 (x = ±11.4..±33.8, z = -22.5)
    const wingW = 33.8 - (stairWidth * 0.5 + 0.2);
    const wingCenterX = xSign * (stairWidth * 0.5 + 0.2 + wingW * 0.5);
    const wingTopRail = new THREE.Mesh(new THREE.BoxGeometry(wingW, 0.18, 0.24), mats.redWood);
    wingTopRail.position.set(wingCenterX, palaceFloorY + 1.02, stairEndZ + 0.15);
    railGroup.add(wingTopRail);

    const wingPanel = new THREE.Mesh(new THREE.BoxGeometry(wingW, 0.52, 0.14), mats.darkWood);
    wingPanel.position.set(wingCenterX, palaceFloorY + 0.58, stairEndZ + 0.15);
    railGroup.add(wingPanel);

    for (let wp = 0; wp <= 4; wp++) {
      const wx = xSign * (stairWidth * 0.5 + 0.2 + (wp / 4) * wingW);
      const wPost = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.15, 0.26), mats.redWood);
      wPost.position.set(wx, palaceFloorY + 0.56, stairEndZ + 0.15);
      railGroup.add(wPost);
      const wCap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), mats.goldRoof);
      wCap.position.set(wx, palaceFloorY + 1.18, stairEndZ + 0.15);
      railGroup.add(wCap);
    }

    // 台阶两侧护栏与崇台南翼挡墙碰撞体，引导角色自然沿御道石阶上下
    addMirageCollider(railX - 0.35, railX + 0.35, stairEndZ, stairStartZ, 0, palaceFloorY + 2.0);
    addMirageCollider(
      xSign > 0 ? stairWidth * 0.5 + 0.2 : -34.0,
      xSign > 0 ? 34.0 : -(stairWidth * 0.5 + 0.2),
      stairEndZ - 0.6,
      stairEndZ + 0.6,
      0,
      palaceFloorY + 2.0
    );

    stairGroup.add(railGroup);
  }

  root.add(stairGroup);

  // ---------------------------------------------------------------------------
  // 3. 蜃景四面青砖收分城墙与南天门三层重檐城楼 (复刻 ep04_02, ep17_01, ep23_03)
  // ---------------------------------------------------------------------------
  const wallH = 15.0;
  const wallThick = 7.5;
  const gateHalfOpen = 7.5;
  const frontSideLen = wallHalfX - gateHalfOpen; // 74.5m

  // 南立面城墙（正面朝向登州，铁索在此衔接）
  for (const sign of [-1, 1]) {
    const seg = buildBatteredWallSegment(frontSideLen, wallH, wallThick, {
      whiteWashed: false,
      batterRatio: 0.74,
      crenellations: true
    });
    seg.position.set(sign * (gateHalfOpen + frontSideLen * 0.5), 0, wallHalfZ);
    root.add(seg);

    addMirageCollider(
      sign > 0 ? gateHalfOpen : -wallHalfX,
      sign > 0 ? wallHalfX : -gateHalfOpen,
      wallHalfZ - 4.5,
      wallHalfZ + 4.5,
      0,
      wallH + 3
    );
  }

  // 南天门巨型收分城台（带竖向壁柱凹槽，复刻 ep04_03 与 ep23_03 特写！）
  const gateBastionW = 38;
  const gateBastionD = 13.5;
  const gatePierW = (gateBastionW - gateHalfOpen * 2) * 0.5;
  for (const sign of [-1, 1]) {
    const pier = buildBatteredWallSegment(gatePierW, wallH + 2.2, gateBastionD, {
      whiteWashed: false,
      batterRatio: 0.74,
      crenellations: true
    });
    pier.position.set(sign * (gateHalfOpen + gatePierW * 0.5), 0, wallHalfZ);
    root.add(pier);

    // 城门壁柱浮雕竖条 (ep04_03 / ep23_03 标志性立面构成)
    for (const px of [-3.2, 0, 3.2]) {
      const pilaster = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, wallH * 0.85, 0.85),
        mats.stoneBase
      );
      pilaster.position.set(sign * (gateHalfOpen + gatePierW * 0.5) + px, wallH * 0.42, wallHalfZ + gateBastionD * 0.42);
      root.add(pilaster);
    }
  }

  // 南天门门楣过梁
  const gateLintel = new THREE.Mesh(
    new THREE.BoxGeometry(gateHalfOpen * 2 + 1.0, 6.2, gateBastionD * 0.82),
    mats.mirageWall
  );
  gateLintel.position.set(0, wallH + 2.2 - 3.1, wallHalfZ);
  root.add(gateLintel);

  // 南天门上方三层重檐城门楼 (复刻 ep04_03 与 ep23_03)
  const southGateHall = buildPalaceHall({
    width: 30,
    depth: 13,
    stories: 3,
    storyHeight: 4.4,
    basePlatformH: 0.6,
    goldenRoof: false,
    hasBalcony: true
  });
  southGateHall.position.set(0, wallH + 2.2, wallHalfZ);
  root.add(southGateHall);

  // 北城墙与东西两侧城墙
  const northWall = buildBatteredWallSegment(wallHalfX * 2, wallH, wallThick, {
    whiteWashed: false,
    batterRatio: 0.74
  });
  northWall.position.set(0, 0, -wallHalfZ);
  root.add(northWall);
  addMirageCollider(-wallHalfX, wallHalfX, -wallHalfZ - 4, -wallHalfZ + 4, 0, wallH + 3);

  for (const sign of [-1, 1]) {
    const ewWall = buildBatteredWallSegment(wallHalfZ * 2, wallH, wallThick, {
      whiteWashed: false,
      batterRatio: 0.74
    });
    ewWall.rotation.y = Math.PI * 0.5;
    ewWall.position.set(sign * wallHalfX, 0, 0);
    root.add(ewWall);
    addMirageCollider(sign * wallHalfX - 4, sign * wallHalfX + 4, -wallHalfZ, wallHalfZ, 0, wallH + 3);
  }

  // 四角城楼
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const ct = buildPalaceHall({
        width: 12,
        depth: 12,
        stories: 2,
        storyHeight: 3.8,
        basePlatformH: 0.4
      });
      ct.position.set(sx * wallHalfX, wallH, sz * wallHalfZ);
      root.add(ct);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. 蜃景核心建筑群：
  //    - 中轴北端：三层重檐大殿【重生主殿】(ep04_02, ep17_01, ep23_05)
  //    - 左侧高耸：四层宝塔 (ep04_02, ep17_01)
  //    - 右侧呼应：三层配塔 (ep04_02, ep17_01)
  //    - 内廷广场：对称梯形白墙团花钟鼓楼 + 东西黄琉璃剪边配殿 + 青铜灯柱阵 (ep23_05)
  // ---------------------------------------------------------------------------

  // 4.1 中央三层重檐主殿外壳 + 内部【林寒守护的天外母舰中枢石殿】(复刻 ep23_41m15s..50m45s & ep24_05m04s..28m24s)
  const grandPalace = buildPalaceHall({
    width: 44,
    depth: 38,
    stories: 3,
    storyHeight: 6.6,
    basePlatformH: 1.2,
    goldenRoof: true,
    hasBalcony: true,
    hollowInterior: true
  });
  grandPalace.position.set(0, terraceH, -43);
  root.add(grandPalace);

  // 构建主殿内部中枢石殿、六扇格扇大门与门前守护的林寒
  const coreChamberData = buildMirageCoreChamber(mats, addMirageCollider, palaceFloorY);
  root.add(coreChamberData.group);

  // 4.2 左侧四层浮屠宝塔 & 右侧三层配塔 (复刻 ep04_02 与 ep17_01 标准正立面天际线比例！)
  const leftPagoda = buildPagoda(4, 13.5);
  leftPagoda.position.set(-46, 0, -5);
  root.add(leftPagoda);
  addMirageCollider(-53, -39, -12, 2, 0, 28);

  const rightTower = buildPagoda(3, 12.0);
  rightTower.position.set(44, 0, -2);
  root.add(rightTower);
  addMirageCollider(37, 51, -9, 5, 0, 24);

  // 4.3 内城广场两侧【梯形白墙团花钟鼓楼】(复刻 ep23_05 镜头前景与远景共 4 座对称角楼)
  const courtyardTowerCoords = [
    [-22, 34], [22, 34],
    [-22, -6], [22, -6]
  ];
  for (const [tx, tz] of courtyardTowerCoords) {
    const ct = buildMirageCourtyardTower();
    ct.position.set(tx, 0, tz);
    root.add(ct);
    addMirageCollider(tx - 4.6, tx + 4.6, tz - 4.6, tz + 4.6, 0, 15);
  }

  // 4.4 东西两侧黄琉璃瓦脊配殿 (复刻 ep23_05 广场左右两侧长庑配殿)
  for (const sign of [-1, 1]) {
    const sideHall = buildPalaceHall({
      width: 34,
      depth: 13,
      stories: 1,
      storyHeight: 5.2,
      basePlatformH: 0.9,
      goldenRoof: true,
      hasBalcony: false
    });
    sideHall.rotation.y = sign * Math.PI * 0.5;
    sideHall.position.set(sign * 36, 0, 14);
    root.add(sideHall);
    addMirageCollider(sign * 36 - 7, sign * 36 + 7, -3, 31, 0, 10);
  }

  // 4.5 广场中轴对称青铜礼器灯柱与垂帐宫灯阵 (复刻 ep23_05 镜头中央序列感极强的灯台)
  const lampGroup = new THREE.Group();
  for (const zPos of [48, 36, 24, 12, 0]) {
    for (const xSign of [-1, 1]) {
      // 矮座青铜五枝烛台 (ep23_05 近景)
      const stand = new THREE.Group();
      stand.position.set(xSign * 9.5, 0, zPos);

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.48, 2.2, 8), mats.bronze);
      post.position.y = 1.1;
      stand.add(post);

      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.22, 0.45), mats.bronze);
      crossbar.position.y = 2.2;
      stand.add(crossbar);

      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.26, 6, 6), mats.goldLantern);
      flame.position.y = 2.55;
      stand.add(flame);
      lampGroup.add(stand);

      // 高杆红纱垂幡宫灯 (ep23_05 两侧高挑灯幡)
      const tallPole = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.14, 7.2, 6), mats.bronze);
      tallPole.position.set(xSign * 14.5, 3.6, zPos);
      lampGroup.add(tallPole);

      const canopyLantern = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.55, 2.6, 8), mats.redLantern);
      canopyLantern.position.set(xSign * 14.5, 5.2, zPos);
      lampGroup.add(canopyLantern);
    }
  }
  root.add(lampGroup);

  // ---------------------------------------------------------------------------
  // 5. 海市蜃楼光学与世界观特效层 (Shader & Lore VFX)
  // ---------------------------------------------------------------------------
  const vfxGroup = new THREE.Group();

  // 5.1 底部水平条纹状水波折射虚影层 (核心复刻 ep01_12 星空下水平切片水波海市蜃楼虚影！)
  const ghostMat = createMirageWaveGhostMaterial();
  const ghostCurtainGeo = new THREE.CylinderGeometry(radiusX * 0.86, radiusX * 0.32, 46, 40, 1, true);
  const ghostCurtain = new THREE.Mesh(ghostCurtainGeo, ghostMat);
  ghostCurtain.position.y = -48;
  vfxGroup.add(ghostCurtain);

  // 多层水平悬浮折射波纹盘（位于岩岛中下部过渡带）
  for (let i = 0; i < 4; i++) {
    const rScale = 0.88 - i * 0.14;
    const ringGeo = new THREE.RingGeometry(radiusX * rScale * 0.42, radiusX * rScale, 40);
    ringGeo.rotateX(-Math.PI * 0.5);
    const ringMesh = new THREE.Mesh(ringGeo, ghostMat);
    ringMesh.position.y = -32 - i * 11.5;
    vfxGroup.add(ringMesh);
  }

  // 5.2 环绕浮岛底座与城墙根部的翻滚旋涡云海 + 底部正中心旋涡云洞 (复刻 ep23_01, ep23_03, ep23_04)
  const cloudMat = createVortexCloudMaterial(0.58);
  const vortexRings = [];

  for (let rIdx = 0; rIdx < 3; rIdx++) {
    const ringGroup = new THREE.Group();
    const ringRadius = (radiusX * 0.88) + rIdx * 18;
    const ringY = -4 - rIdx * 16;
    const puffCount = 14 + rIdx * 4;
    const puffGeo = new THREE.SphereGeometry(19 + rIdx * 3, 16, 12);

    for (let p = 0; p < puffCount; p++) {
      const a = (p / puffCount) * Math.PI * 2;
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      puff.position.set(
        Math.cos(a) * ringRadius,
        ringY + Math.sin(a * 3.0) * 3.0,
        Math.sin(a) * (ringRadius * 0.88)
      );
      puff.scale.set(1.55, 0.36, 1.15);
      puff.rotation.y = -a;
      ringGroup.add(puff);
    }
    vfxGroup.add(ringGroup);
    vortexRings.push({ group: ringGroup, speed: (rIdx % 2 === 0 ? 1 : -1) * (0.045 - rIdx * 0.01) });
  }

  // 5.3 笼罩整座蜃景城池的半透明球形力场/云气护盾穹顶 (复刻 ep17_01 与 ep23_01)
  const domeGeo = new THREE.SphereGeometry(radiusX * 1.14, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.72);
  const domeMesh = new THREE.Mesh(domeGeo, createForcefieldDomeMaterial());
  domeMesh.position.y = -8;
  vfxGroup.add(domeMesh);

  // 5.4 天外母舰底部环形推进器核心与向登州投射的青色幻象体积光束 (复刻 ep19_01 与 ep19_03)
  const mothershipGroup = new THREE.Group();
  mothershipGroup.position.y = -rockDepth + 12;

  const hullMat = new THREE.MeshStandardNodeMaterial({
    color: 0x162228,
    roughness: 0.25,
    metalness: 0.90
  });
  const reactorMat = createCyanBeamMaterial();

  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(28, 3.8, 12, 36), hullMat);
  outerRing.rotation.x = Math.PI * 0.5;
  mothershipGroup.add(outerRing);

  const coreRing = new THREE.Mesh(new THREE.RingGeometry(8, 22, 32), reactorMat);
  coreRing.rotation.x = Math.PI * 0.5;
  coreRing.position.y = -1.5;
  mothershipGroup.add(coreRing);

  // 向下投射的青色体积光束群 (ep19_03)
  const beamGeo = new THREE.ConeGeometry(26, 260, 16, 1, true);
  beamGeo.translate(0, -130, 0);
  const beamAngles = [
    [0, 0],
    [0.32, 0.18],
    [-0.32, 0.18],
    [0.42, -0.12],
    [-0.42, -0.12]
  ];
  for (const [rx, rz] of beamAngles) {
    const beam = new THREE.Mesh(beamGeo, reactorMat);
    beam.rotation.set(rx, 0, rz);
    mothershipGroup.add(beam);
  }
  vfxGroup.add(mothershipGroup);

  root.add(vfxGroup);
  scene.add(root);

  function update(elapsed) {
    for (const vr of vortexRings) {
      vr.group.rotation.y = elapsed * vr.speed;
    }
    mothershipGroup.rotation.y = elapsed * 0.18;
    if (coreChamberData && coreChamberData.update) {
      coreChamberData.update(elapsed);
    }
  }

  return { root, colliders, update };
}

/**
 * 构建林寒3D 守门侠女模型：
 * 还原 EP23 @ 45:15 / 50:15 / 50:45 左白右黑交领战袍、银扣束腰封、高马尾银冠与金吞口长柄斩马刀
 */
function buildLinHanGuardian(mats) {
  const group = new THREE.Group();
  group.name = 'LinHanGuardian';

  const whiteSilkMat = new THREE.MeshStandardNodeMaterial({
    color: 0xeef1f6,
    roughness: 0.62,
    metalness: 0.05
  });
  const blackRobeMat = new THREE.MeshStandardNodeMaterial({
    color: 0x14161c,
    roughness: 0.55,
    metalness: 0.12
  });
  const skinMat = new THREE.MeshStandardNodeMaterial({
    color: 0xf0d2be,
    roughness: 0.52,
    metalness: 0.02
  });
  const silverMat = new THREE.MeshStandardNodeMaterial({
    color: 0xc8d2dc,
    roughness: 0.25,
    metalness: 0.85
  });
  const steelBladeMat = new THREE.MeshStandardNodeMaterial({
    color: 0xe8f0f8,
    roughness: 0.14,
    metalness: 0.94,
    emissive: 0x1b2838
  });

  // 1. 白色百褶内裙 + 玄黑分叉外袍下摆 (复刻 ep23_50m15s 黑白相间飘逸裙摆)
  const innerSkirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.42, 0.96, 14),
    whiteSilkMat
  );
  innerSkirt.position.y = 0.48;
  innerSkirt.castShadow = true;
  group.add(innerSkirt);

  for (const xSign of [-1, 1]) {
    const outerPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.94, 0.36),
      blackRobeMat
    );
    outerPanel.position.set(xSign * 0.21, 0.49, 0.02);
    outerPanel.rotation.z = -xSign * 0.08;
    outerPanel.castShadow = true;
    group.add(outerPanel);
  }

  // 2. 左白右黑交领上身战袍 (复刻 ep23_50m45s 标志性不对称左白银纹、右玄黑交领)
  const torsoRightBlack = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.23, 0.56, 12),
    blackRobeMat
  );
  torsoRightBlack.position.set(-0.04, 1.18, 0);
  torsoRightBlack.castShadow = true;
  group.add(torsoRightBlack);

  const torsoLeftWhite = new THREE.Mesh(
    new THREE.CylinderGeometry(0.215, 0.23, 0.55, 12, 1, false, 0, Math.PI * 1.05),
    whiteSilkMat
  );
  torsoLeftWhite.position.set(0.05, 1.18, 0.01);
  group.add(torsoLeftWhite);

  // 白色交领内衬领口
  const collarV = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.26, 0.24),
    whiteSilkMat
  );
  collarV.position.set(0.02, 1.36, 0.08);
  collarV.rotation.z = 0.28;
  group.add(collarV);

  // 3. 嵌银甲片宽束腰封与中央圆形兽首银扣 (复刻 ep23_50m45s 腰部特写)
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.235, 0.245, 0.20, 14),
    blackRobeMat
  );
  belt.position.y = 0.96;
  group.add(belt);

  const beltBuckle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.04, 12),
    silverMat
  );
  beltBuckle.rotation.x = Math.PI * 0.5;
  beltBuckle.position.set(0, 0.96, 0.23);
  group.add(beltBuckle);

  // 4. 左袖（白底银纹宽袖垂落）与右臂（玄黑窄袖持长柄大刀）
  const leftArm = new THREE.Group();
  leftArm.position.set(0.28, 1.36, 0);
  leftArm.rotation.z = -0.18;
  const leftSleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.16, 0.56, 10),
    whiteSilkMat
  );
  leftSleeve.position.y = -0.24;
  leftArm.add(leftSleeve);
  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), skinMat);
  leftHand.position.y = -0.54;
  leftArm.add(leftHand);
  group.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(-0.27, 1.36, 0.04);
  rightArm.rotation.z = 0.48;
  rightArm.rotation.x = -0.25;
  const rightSleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.07, 0.52, 10),
    blackRobeMat
  );
  rightSleeve.position.y = -0.22;
  rightArm.add(rightSleeve);
  const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), skinMat);
  rightHand.position.y = -0.50;
  rightArm.add(rightHand);
  group.add(rightArm);

  // 5. 头部、精致五官、鬓发、高束黑发马尾与雕花银发冠 (复刻 ep23_50m45s)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.14, 10), skinMat);
  neck.position.y = 1.50;
  group.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 14), skinMat);
  head.scale.set(0.92, 1.08, 0.95);
  head.position.y = 1.64;
  group.add(head);

  // 面部五官细节（朝向 +Z 南侧台阶）：剑眉、双眸、鼻梁与朱唇
  const lipMat = new THREE.MeshBasicNodeMaterial({ color: 0xb84848 });
  for (const sx of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.008, 0.012), blackRobeMat);
    brow.position.set(sx * 0.045, 1.685, 0.122);
    brow.rotation.z = -sx * 0.14;
    group.add(brow);

    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), whiteSilkMat);
    eyeWhite.scale.set(1.3, 0.75, 0.5);
    eyeWhite.position.set(sx * 0.045, 1.662, 0.122);
    group.add(eyeWhite);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), blackRobeMat);
    pupil.position.set(sx * 0.045, 1.662, 0.129);
    group.add(pupil);

    // 额前两侧侠女垂鬓
    const sideLock = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.24, 6), blackRobeMat);
    sideLock.position.set(sx * 0.115, 1.58, 0.05);
    sideLock.rotation.z = sx * 0.12;
    group.add(sideLock);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.045, 6), skinMat);
  nose.position.set(0, 1.638, 0.132);
  nose.rotation.x = Math.PI * 0.35;
  group.add(nose);

  const lips = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.009, 0.012), lipMat);
  lips.position.set(0, 1.598, 0.122);
  group.add(lips);

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.144, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    blackRobeMat
  );
  hairCap.position.set(0, 1.66, -0.01);
  group.add(hairCap);

  const hairCrown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048, 0.055, 0.08, 10),
    silverMat
  );
  hairCrown.position.set(0, 1.81, -0.03);
  group.add(hairCrown);

  const ponytail = new THREE.Mesh(
    new THREE.ConeGeometry(0.055, 0.42, 8),
    blackRobeMat
  );
  ponytail.position.set(0, 1.62, -0.14);
  ponytail.rotation.x = 0.35;
  group.add(ponytail);

  // 6. 金吞口长柄斩马刀 / 偃月长刀 (复刻 ep23_50m45s 竖立于身侧的雪亮宽刃长刀)
  const polearm = new THREE.Group();
  polearm.position.set(-0.46, 0, 0.14);

  // 玄铁长柄
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.028, 1.65, 10),
    blackRobeMat
  );
  shaft.position.y = 0.825;
  polearm.add(shaft);

  // 鎏金雕刻套筒与金吞口护手
  const goldFerrule = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.032, 0.28, 10),
    mats.goldRoof
  );
  goldFerrule.position.y = 1.48;
  polearm.add(goldFerrule);

  const goldCollar = new THREE.Mesh(
    new THREE.SphereGeometry(0.058, 10, 10),
    mats.goldRoof
  );
  goldCollar.scale.set(1.0, 1.45, 0.85);
  goldCollar.position.y = 1.66;
  polearm.add(goldCollar);

  // 雪亮弧形宽刃刀身 + 刀背钩刺 (复刻 ep23_50m45s 特写)
  const bladeMain = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.78, 0.022),
    steelBladeMat
  );
  bladeMain.position.set(0.01, 2.08, 0);
  bladeMain.rotation.z = -0.06;
  polearm.add(bladeMain);

  const bladeTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.24, 4),
    steelBladeMat
  );
  bladeTip.position.set(0.03, 2.52, 0);
  bladeTip.rotation.y = Math.PI * 0.25;
  bladeTip.rotation.z = -0.15;
  polearm.add(bladeTip);

  const spineHook = new THREE.Mesh(
    new THREE.ConeGeometry(0.045, 0.14, 4),
    steelBladeMat
  );
  spineHook.position.set(0.08, 2.30, 0);
  spineHook.rotation.z = -1.1;
  polearm.add(spineHook);

  group.add(polearm);

  // 稍微放大至剧照英雄比例 (身高约 1.85m)
  group.scale.setScalar(1.08);

  return { group, ponytail, polearm };
}

/**
 * 构建蜃景主殿内部 · 林寒守护的天外母舰中枢石殿 (复刻 EP23 41:15..45:45 & EP24 05:04..28:24)
 */
function buildMirageCoreChamber(mats, addMirageCollider, floorY) {
  const group = new THREE.Group();
  group.name = 'MirageCoreChamber';

  const swirlWallMat = createMirageSwirlWallMaterial();
  const podCircuitMat = createMedicalPodCircuitMaterial();
  const portholeGlowMat = createMiragePortholeGlowMaterial();

  const darkBasaltMat = new THREE.MeshStandardNodeMaterial({
    color: 0x262e3a,
    emissive: 0x101824,
    roughness: 0.62,
    metalness: 0.28,
    flatShading: true
  });
  const crystalPrismMat = new THREE.MeshStandardNodeMaterial({
    color: 0x16202c,
    emissive: 0x0d1b2a,
    roughness: 0.18,
    metalness: 0.78,
    flatShading: true
  });
  const carapaceHelmMat = new THREE.MeshStandardNodeMaterial({
    color: 0x7c8898,
    emissive: 0x182432,
    roughness: 0.36,
    metalness: 0.32
  });
  const cyanNodeMat = new THREE.MeshBasicNodeMaterial({
    color: 0xd8f8ff
  });
  const ricePaperGlowMat = new THREE.MeshBasicNodeMaterial({
    color: 0xdce6f2
  });

  // ---------------------------------------------------------------------------
  // 1. 地面深色玄武岩石板、中央圆形比武/中枢石台、两侧高台与北端双层操控台 (ep23_43m15s, ep24_25m24s, ep24_28m00s)
  // ---------------------------------------------------------------------------
  const chamberFloor = new THREE.Mesh(
    new THREE.BoxGeometry(41.2, 0.24, 38.2),
    darkBasaltMat
  );
  chamberFloor.position.set(0, floorY - 0.10, -43.0);
  chamberFloor.receiveShadow = true;
  group.add(chamberFloor);

  // 中央圆形低矮石台 (半径 6.2m, 高 0.32m, 边缘镶嵌粗粝玄武岩块, 复刻 ep23_43m15s / ep24_28m00s)
  const centerDais = new THREE.Mesh(
    new THREE.CylinderGeometry(6.15, 6.30, 0.32, 36),
    mats.stoneBase
  );
  centerDais.position.set(0, floorY + 0.16, -43.0);
  centerDais.receiveShadow = true;
  group.add(centerDais);

  const curbCount = 28;
  const curbGeo = new THREE.BoxGeometry(1.38, 0.34, 0.48);
  for (let i = 0; i < curbCount; i++) {
    const a = (i / curbCount) * Math.PI * 2;
    const curb = new THREE.Mesh(curbGeo, darkBasaltMat);
    curb.position.set(
      Math.cos(a) * 6.18,
      floorY + 0.17,
      -43.0 + Math.sin(a) * 6.18
    );
    curb.rotation.y = -a + Math.PI * 0.5;
    group.add(curb);
  }

  // 东西两侧流线圆窗走廊石台 (高 0.34m, 复刻 ep24_28m00s 医疗榻所在侧台)
  for (const xSign of [-1, 1]) {
    const sidePlatform = new THREE.Mesh(
      new THREE.BoxGeometry(8.2, 0.34, 27.5),
      darkBasaltMat
    );
    sidePlatform.position.set(xSign * 15.8, floorY + 0.17, -39.5);
    sidePlatform.receiveShadow = true;
    group.add(sidePlatform);

    // 侧台弧形过渡石阶条
    const sideStep = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.22, 11.5),
      mats.stoneBase
    );
    sideStep.position.set(xSign * 11.2, floorY + 0.11, -42.5);
    group.add(sideStep);
  }

  // 北侧双层操控高台 (复刻 ep24_07m29s / ep24_25m24s 能量舵柱所在两级石台)
  const northStageLower = new THREE.Mesh(
    new THREE.BoxGeometry(36.0, 0.36, 9.8),
    darkBasaltMat
  );
  northStageLower.position.set(0, floorY + 0.18, -56.8);
  group.add(northStageLower);

  const northStageUpper = new THREE.Mesh(
    new THREE.BoxGeometry(24.0, 0.68, 8.2),
    mats.stoneBase
  );
  northStageUpper.position.set(0, floorY + 0.34, -57.4);
  group.add(northStageUpper);

  // ---------------------------------------------------------------------------
  // 2. 南立面入口墙体与【六扇朱墨木格扇大门 · 中央两扇向内敞开】(复刻 ep23_45m15s / ep23_45m45s / ep24_28m00s)
  // ---------------------------------------------------------------------------
  const southWallZ = -24.2;
  const wallHeight = 10.6;
  const doorOpenHalfW = 5.45;

  // 南壁左右两侧石墙（外侧为传统朱红宫墙配青绿描金横披，内侧为深色玄武岩壁）
  for (const xSign of [-1, 1]) {
    const segW = 20.2 - doorOpenHalfW;
    const segX = xSign * (doorOpenHalfW + segW * 0.5);
    const wallSeg = new THREE.Mesh(
      new THREE.BoxGeometry(segW, wallHeight, 0.85),
      swirlWallMat
    );
    wallSeg.position.set(segX, floorY + wallHeight * 0.5, southWallZ);
    wallSeg.castShadow = true;
    wallSeg.receiveShadow = true;
    group.add(wallSeg);

    // 外立面青绿描金彩画额枋 (复刻 ep23_50m45s 主殿背景门楣横披)
    const frieze = new THREE.Mesh(
      new THREE.BoxGeometry(segW - 0.6, 0.95, 0.16),
      mats.bronze
    );
    frieze.position.set(segX, floorY + 4.65, southWallZ + 0.48);
    group.add(frieze);
  }

  // 格扇门上方门楣石墙
  const southTransom = new THREE.Mesh(
    new THREE.BoxGeometry(doorOpenHalfW * 2, wallHeight - 5.2, 0.85),
    swirlWallMat
  );
  southTransom.position.set(0, floorY + 5.2 + (wallHeight - 5.2) * 0.5, southWallZ);
  group.add(southTransom);

  // 六扇朱墨木格扇门组件 (复刻 ep23_45m45s 铜包角、双十字棂条、白宣纸透光格心与裙板)
  const doorFrameGroup = new THREE.Group();
  doorFrameGroup.position.set(0, floorY, southWallZ);

  const frameLintel = new THREE.Mesh(
    new THREE.BoxGeometry(11.2, 0.34, 0.48),
    mats.darkWood
  );
  frameLintel.position.y = 5.15;
  doorFrameGroup.add(frameLintel);

  for (const xSign of [-1, 1]) {
    const jamb = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 5.2, 0.48),
      mats.darkWood
    );
    jamb.position.set(xSign * 5.44, 2.6, 0);
    doorFrameGroup.add(jamb);
  }

  function createLatticeDoorLeaf() {
    const leaf = new THREE.Group();
    const leafW = 1.72;
    const leafH = 4.96;

    // 外框左右立颊与上下抹头
    for (const sx of [-1, 1]) {
      const stile = new THREE.Mesh(new THREE.BoxGeometry(0.11, leafH, 0.12), mats.darkWood);
      stile.position.set(sx * (leafW * 0.5 - 0.055), leafH * 0.5, 0);
      leaf.add(stile);
    }
    for (const sy of [0.08, 1.35, 4.90]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(leafW, 0.14, 0.12), mats.darkWood);
      rail.position.set(0, sy, 0);
      leaf.add(rail);
    }

    // 下部雕花裙板
    const dado = new THREE.Mesh(
      new THREE.BoxGeometry(leafW - 0.18, 1.15, 0.08),
      mats.redWood
    );
    dado.position.set(0, 0.72, 0);
    leaf.add(dado);

    // 上部透光白宣纸格心 (使内殿回望大门时呈现 ep23_45m15s / ep24_28m00s 的明亮剪影效果)
    const paperPane = new THREE.Mesh(
      new THREE.BoxGeometry(leafW - 0.20, 3.42, 0.03),
      ricePaperGlowMat
    );
    paperPane.position.set(0, 3.12, 0);
    leaf.add(paperPane);

    // 竖向与横向格扇棂条
    for (const vx of [-0.36, -0.12, 0.12, 0.36]) {
      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 3.42, 0.06), mats.darkWood);
      vBar.position.set(vx, 3.12, 0);
      leaf.add(vBar);
    }
    for (let hy = 1.75; hy <= 4.55; hy += 0.46) {
      const hBar = new THREE.Mesh(new THREE.BoxGeometry(leafW - 0.20, 0.035, 0.06), mats.darkWood);
      hBar.position.set(0, hy, 0);
      leaf.add(hBar);
    }

    // 金铜包角与中央铺首铜饰 (复刻 ep23_45m45s 特写中的亮金色包角)
    for (const cx of [-1, 1]) {
      for (const cy of [0.16, 1.35, 4.82]) {
        const cornerPlate = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.18, 0.135),
          mats.goldRoof
        );
        cornerPlate.position.set(cx * (leafW * 0.5 - 0.13), cy, 0);
        leaf.add(cornerPlate);
      }
    }
    const lockPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.68, 0.14),
      mats.goldRoof
    );
    lockPlate.position.set(0, 2.55, 0);
    leaf.add(lockPlate);

    return leaf;
  }

  // 外侧四扇闭合 (i = 0, 1, 4, 5)，中央两扇 (i = 2, 3) 向殿内(-Z)敞开 74°
  const closedPositions = [-4.42, -2.66, 2.66, 4.42];
  for (const lx of closedPositions) {
    const leaf = createLatticeDoorLeaf();
    leaf.position.set(lx, 0, 0);
    doorFrameGroup.add(leaf);
  }

  for (const xSign of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(xSign * 1.78, 0, 0);
    const openLeaf = createLatticeDoorLeaf();
    openLeaf.position.set(-xSign * 0.86, 0, 0);
    pivot.add(openLeaf);
    // 向内殿 (-Z) 旋转敞开
    pivot.rotation.y = xSign * 1.28;
    doorFrameGroup.add(pivot);
  }
  group.add(doorFrameGroup);

  // 殿门前石阶顶部守护的【林寒】(立于第 23 级雕花青石阶上，靴底严丝合缝贴合踏面，复刻 ep23_50m15s / ep23_50m45s)
  const linHan = createLeadCharacter('linhan');
  linHan.group.position.set(-1.25, floorY - 0.225, -21.95);
  group.add(linHan.group);

  // ---------------------------------------------------------------------------
  // 3. 四根纵向沟槽玄武岩巨柱与两道横跨巨石拱梁 (复刻 ep23_41m15s / ep24_25m24s)
  // ---------------------------------------------------------------------------
  function buildFlutedBasaltPillar(x, z, height = 10.2) {
    const pGroup = new THREE.Group();
    pGroup.position.set(x, floorY, z);

    // 阶梯状石柱底座
    const base1 = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.6, 0.45, 10), darkBasaltMat);
    base1.position.y = 0.22;
    pGroup.add(base1);

    const base2 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.4, 2.8), darkBasaltMat);
    base2.position.y = 1.4;
    pGroup.add(base2);

    // 核心柱体 + 12 道纵向流线岩肋 (复刻剧照中雕塑感极强的竖向条纹石柱)
    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(1.32, 1.45, height, 12),
      swirlWallMat
    );
    core.position.y = height * 0.5;
    core.castShadow = true;
    core.receiveShadow = true;
    pGroup.add(core);

    const fluteCount = 12;
    for (let i = 0; i < fluteCount; i++) {
      const a = (i / fluteCount) * Math.PI * 2;
      const rib = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.30, height - 0.8, 6),
        darkBasaltMat
      );
      rib.position.set(Math.cos(a) * 1.32, height * 0.5 + 0.2, Math.sin(a) * 1.32);
      rib.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.03;
      pGroup.add(rib);
    }

    return pGroup;
  }

  const pillarCoords = [
    [-11.2, -34.5], [11.2, -34.5],
    [-10.2, -51.2], [10.2, -51.2]
  ];
  for (const [px, pz] of pillarCoords) {
    group.add(buildFlutedBasaltPillar(px, pz, 10.4));
    addMirageCollider(px - 1.8, px + 1.8, pz - 1.8, pz + 1.8, floorY, floorY + 10);
  }

  // 前后两道巨型粗粝玄武岩横跨石拱梁 (复刻 ep23_41m15s 与 ep24_25m24s 极具压迫感的顶部棱角石拱桥)
  for (const archZ of [-34.5, -51.2]) {
    const archGroup = new THREE.Group();
    archGroup.position.set(0, floorY, archZ);
    const blockCount = 15;
    for (let i = 0; i < blockCount; i++) {
      const u = (i / (blockCount - 1)) * 2 - 1; // -1 .. 1
      const bx = u * 16.5;
      const archCurve = (1.0 - u * u) * 1.85;
      const by = 6.35 + archCurve;
      const block = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.55 + (1.0 - Math.abs(u)) * 0.45, 0),
        darkBasaltMat
      );
      block.scale.set(1.45, 0.68, 0.82);
      block.position.set(bx, by, (i % 2 === 0 ? 0.18 : -0.18));
      block.rotation.set(u * 0.18, i * 0.65, -u * 0.28);
      block.castShadow = true;
      archGroup.add(block);
    }
    group.add(archGroup);
  }

  // ---------------------------------------------------------------------------
  // 4. 倾斜生长的六棱柱状玄武岩晶簇 (复刻 ep24_05m04s / ep24_07m29s / ep24_25m00s / ep24_26m36s)
  // ---------------------------------------------------------------------------
  function buildHexCrystalCluster(x, y, z, count, tiltSignX, maxH = 3.2) {
    const cGroup = new THREE.Group();
    cGroup.position.set(x, y, z);

    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 5);
      const col = (i % 5) - 2;
      const h = (0.85 + ((i * 37) % 100) / 100 * 0.85) * maxH * (1.0 - row * 0.12);
      const r = 0.20 + ((i * 19) % 10) * 0.014;

      const prismGroup = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 6), crystalPrismMat);
      shaft.position.y = h * 0.5;
      prismGroup.add(shaft);

      const tip = new THREE.Mesh(new THREE.ConeGeometry(r, r * 1.15, 6), crystalPrismMat);
      tip.position.y = h + r * 0.55;
      prismGroup.add(tip);

      prismGroup.position.set(
        col * 0.52 + (row % 2) * 0.22,
        0,
        (row - 1.5) * 0.48
      );
      prismGroup.rotation.z = tiltSignX * (0.18 + ((i * 13) % 10) * 0.025);
      prismGroup.rotation.x = (((i * 29) % 10) - 5) * 0.03;
      prismGroup.castShadow = true;
      cGroup.add(prismGroup);
    }
    return cGroup;
  }

  // 四根主石柱根部的倾斜六棱晶簇 (复刻 ep24_25m00s / ep24_28m00s 前景与中景晶簇)
  group.add(buildHexCrystalCluster(-9.2, floorY + 0.1, -33.0, 12, 1, 2.2));
  group.add(buildHexCrystalCluster(9.2, floorY + 0.1, -33.0, 12, -1, 2.2));
  group.add(buildHexCrystalCluster(-8.5, floorY + 0.2, -49.8, 12, 1, 2.4));
  group.add(buildHexCrystalCluster(8.5, floorY + 0.2, -49.8, 12, -1, 2.4));

  // 北侧操控台能量舵柱左右两侧的大型六棱玄武岩晶簇屏风 (复刻 ep24_05m04s / ep24_07m29s / ep24_26m36s)
  group.add(buildHexCrystalCluster(-4.6, floorY + 0.68, -56.2, 20, 0.85, 3.6));
  group.add(buildHexCrystalCluster(4.6, floorY + 0.68, -56.2, 20, -0.85, 3.6));

  // ---------------------------------------------------------------------------
  // 5. 东西两侧【螺旋流线涡纹石壁】与【8 扇内凹发光圆舷窗】(复刻 ep24_25m48s / ep24_27m12s / ep24_27m30s / ep24_28m00s)
  // ---------------------------------------------------------------------------
  const portholeZList = [-30.5, -38.0, -45.5, -53.0];
  const beamConeMat = new THREE.MeshBasicNodeMaterial({
    color: 0x90d8ff,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });

  for (const xSign of [-1, 1]) {
    const wallX = xSign * 20.0;
    const sideWall = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, wallHeight, 38.2),
      swirlWallMat
    );
    sideWall.position.set(wallX, floorY + wallHeight * 0.5, -43.0);
    sideWall.receiveShadow = true;
    group.add(sideWall);

    // 墙面浮雕流线波浪石肋
    for (let r = 0; r < 7; r++) {
      const waveRib = new THREE.Mesh(
        new THREE.TorusGeometry(4.8, 0.36, 8, 24, Math.PI * 0.85),
        swirlWallMat
      );
      waveRib.rotation.y = xSign * Math.PI * 0.5;
      waveRib.rotation.z = 0.25 + (r % 2) * 0.35;
      waveRib.position.set(wallX - xSign * 0.35, floorY + 2.2 + (r % 3) * 1.4, -28.0 - r * 4.8);
      group.add(waveRib);
    }

    // 每侧 4 扇螺旋涡纹发光圆舷窗
    for (const pz of portholeZList) {
      const phGroup = new THREE.Group();
      phGroup.position.set(wallX - xSign * 0.42, floorY + 3.25, pz);
      phGroup.rotation.y = -xSign * Math.PI * 0.5;

      // 螺旋交织窗套 (3 层错位圆环还原 ep24_25m48s 漩涡状石窗框)
      for (let k = 0; k < 3; k++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1.32 + k * 0.34, 0.26 + k * 0.06, 10, 24),
          swirlWallMat
        );
        ring.scale.set(0.92, 1.12, 1.0);
        ring.position.z = k * 0.14;
        ring.rotation.z = k * 0.42;
        phGroup.add(ring);
      }

      // 发光圆舷窗核心
      const glowDisc = new THREE.Mesh(
        new THREE.CircleGeometry(1.25, 24),
        portholeGlowMat
      );
      glowDisc.scale.set(0.88, 1.10, 1.0);
      glowDisc.position.z = 0.05;
      phGroup.add(glowDisc);

      // 舷窗下方的地面柔光漫射光斑 (替代硬边圆锥，贴合 ep24_27m12s / ep24_28m00s 石地反光)
      const floorPool = new THREE.Mesh(
        new THREE.CircleGeometry(2.8, 20),
        beamConeMat
      );
      floorPool.rotation.x = -Math.PI * 0.5;
      floorPool.position.set(0, -2.88, 2.4);
      phGroup.add(floorPool);

      group.add(phGroup);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. 北端背景圣坛墙：【中央拱形天幕视窗】、【上方四眼柳叶天窗】与【全息符文阵列】(复刻 ep24_07m29s / ep24_20m12s / ep24_24m12s)
  // ---------------------------------------------------------------------------
  const northWallZ = -61.5;
  const northWall = new THREE.Mesh(
    new THREE.BoxGeometry(41.2, wallHeight, 1.0),
    swirlWallMat
  );
  northWall.position.set(0, floorY + wallHeight * 0.5, northWallZ);
  group.add(northWall);

  // 北壁中央高耸拱形天幕视窗 (复刻 ep24_07m29s / ep24_24m12s 舵柱正后方的云海天幕拱门)
  const archPortalGroup = new THREE.Group();
  archPortalGroup.position.set(0, floorY + 0.68, northWallZ + 0.58);

  const portalGlowRect = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 5.2),
    portholeGlowMat
  );
  portalGlowRect.position.y = 2.6;
  archPortalGroup.add(portalGlowRect);

  const portalGlowArch = new THREE.Mesh(
    new THREE.CircleGeometry(2.1, 24, 0, Math.PI),
    portholeGlowMat
  );
  portalGlowArch.position.y = 5.2;
  archPortalGroup.add(portalGlowArch);

  // 拱门两侧垂幔状沟槽石柱框 (复刻 ep24_24m12s 窗框垂幔石雕)
  for (const xSign of [-1, 1]) {
    const draperyPillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.72, 6.8, 10),
      swirlWallMat
    );
    draperyPillar.position.set(xSign * 2.35, 3.4, 0.15);
    archPortalGroup.add(draperyPillar);
  }
  const archHood = new THREE.Mesh(
    new THREE.TorusGeometry(2.35, 0.48, 10, 24, Math.PI),
    swirlWallMat
  );
  archHood.position.set(0, 5.2, 0.18);
  archPortalGroup.add(archHood);
  group.add(archPortalGroup);

  // 拱门上方扇形对称排列的【4 枚柳叶眼形发光天窗】(核心复刻 ep24_07m29s 与 ep24_25m24s 标志性穹顶四眼天窗！)
  const eyeSkylightConfigs = [
    { x: -5.4, y: 5.5, z: -57.2, rotZ: -0.36, scaleX: 1.45 },
    { x: -2.0, y: 6.1, z: -56.8, rotZ: -0.42, scaleX: 1.85 },
    { x:  2.0, y: 6.1, z: -56.8, rotZ:  0.42, scaleX: 1.85 },
    { x:  5.4, y: 5.5, z: -57.2, rotZ:  0.36, scaleX: 1.45 }
  ];
  for (const cfg of eyeSkylightConfigs) {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(cfg.x, floorY + cfg.y, cfg.z);
    eyeGroup.rotation.x = 0.52;
    eyeGroup.rotation.z = cfg.rotZ;

    const eyeGlow = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 20),
      portholeGlowMat
    );
    eyeGlow.scale.set(cfg.scaleX, 0.52, 1.0);
    eyeGroup.add(eyeGlow);

    const eyeRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.98, 0.22, 8, 24),
      swirlWallMat
    );
    eyeRim.scale.set(cfg.scaleX, 0.54, 1.0);
    eyeGroup.add(eyeRim);

    group.add(eyeGroup);
  }

  // 左上方全息金黄投影视窗 + 2×5 外星符文发光按键阵列 (复刻 ep24_07m29s / ep24_20m12s / ep24_24m12s)
  const holoMat = new THREE.MeshBasicNodeMaterial({
    color: 0xe8b85c,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  const holoOval = new THREE.Mesh(new THREE.CircleGeometry(1.45, 24), holoMat);
  holoOval.scale.set(1.45, 0.92, 1.0);
  holoOval.position.set(-4.6, floorY + 5.85, northWallZ + 0.72);
  group.add(holoOval);

  const glyphGroup = new THREE.Group();
  glyphGroup.position.set(-6.8, floorY + 3.4, northWallZ + 0.65);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      const btn = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.28, 0.06),
        cyanNodeMat
      );
      btn.position.set((col - 2) * 0.44, (0.5 - row) * 0.46, 0);
      glyphGroup.add(btn);
    }
  }
  group.add(glyphGroup);

  // ---------------------------------------------------------------------------
  // 7. 北侧高台中央：【天外母舰中枢操控台 / 能量舵柱】(精确复刻 ep24_05m04s / ep24_20m36s / ep24_24m12s)
  // ---------------------------------------------------------------------------
  const helmGroup = new THREE.Group();
  helmGroup.position.set(0, floorY + 0.68, -54.5);

  // 流线型根部底座
  const helmBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.58, 0.92, 0.85, 16),
    carapaceHelmMat
  );
  helmBase.scale.set(1.15, 1.0, 0.82);
  helmBase.position.y = 0.42;
  helmGroup.add(helmBase);

  // 眼镜蛇兜帽状弧形操控主盘 (复刻 ep24_20m36s_helm_pillar_closeup.png)
  const helmHood = new THREE.Mesh(
    new THREE.SphereGeometry(0.68, 20, 16),
    carapaceHelmMat
  );
  helmHood.scale.set(1.08, 1.38, 0.48);
  helmHood.position.y = 1.18;
  helmGroup.add(helmHood);

  // 中央竖向双列共 6 颗发光能量孔 + 中缝凹槽
  const centerGroove = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.95, 0.36),
    darkBasaltMat
  );
  centerGroove.position.set(0, 1.28, 0.02);
  helmGroup.add(centerGroove);

  for (const xSign of [-1, 1]) {
    for (let ny = 0; ny < 3; ny++) {
      const node = new THREE.Mesh(
        new THREE.SphereGeometry(0.048, 10, 10),
        cyanNodeMat
      );
      node.position.set(xSign * 0.11, 1.05 + ny * 0.19, 0.31);
      helmGroup.add(node);
    }
    // 左右两侧呈肋骨状排列的 8 道发光弧形灯条 (复刻 ep24_20m36s)
    for (let r = 0; r < 8; r++) {
      const angle = -0.55 + (r / 7) * 1.15;
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.032, 0.06),
        cyanNodeMat
      );
      bar.position.set(
        xSign * (0.36 + Math.cos(angle) * 0.18),
        1.04 + Math.sin(angle) * 0.36,
        0.28
      );
      bar.rotation.z = xSign * angle * 0.65;
      helmGroup.add(bar);
    }
  }
  group.add(helmGroup);
  addMirageCollider(-1.0, 1.0, -55.5, -53.5, floorY, floorY + 3.5);

  // ---------------------------------------------------------------------------
  // 8. 西侧高台：【天外医疗床 / 重生石榻】与顶部垂落能量缆线 (复刻 ep24_08m05s / ep24_20m00s / ep24_27m24s / ep24_27m30s)
  // ---------------------------------------------------------------------------
  const podGroup = new THREE.Group();
  podGroup.position.set(-14.8, floorY + 0.34, -42.5);
  podGroup.rotation.y = 0.12;

  // 雕塑感石质底座
  const podPedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.25, 0.58, 16),
    carapaceHelmMat
  );
  podPedestal.scale.set(0.95, 1.0, 1.85);
  podPedestal.position.y = 0.29;
  podGroup.add(podPedestal);

  // 流线型石榻床体
  const podCradle = new THREE.Mesh(
    new THREE.BoxGeometry(1.52, 0.28, 3.45),
    carapaceHelmMat
  );
  podCradle.position.y = 0.68;
  podCradle.rotation.x = 0.08;
  podGroup.add(podCradle);

  // 发光金色同心圆与平行流光脉络床垫面 (使用 TSL createMedicalPodCircuitMaterial 复刻 ep24_27m24s 俯拍特写！)
  const podMattress = new THREE.Mesh(
    new THREE.PlaneGeometry(1.26, 3.15),
    podCircuitMat
  );
  podMattress.rotation.x = -Math.PI * 0.5 + 0.08;
  podMattress.position.set(0, 0.83, 0);
  podGroup.add(podMattress);

  // 床头卷云纹护栏与两侧弧形扶手 (复刻 ep24_08m05s / ep24_27m30s 侧面轮廓)
  for (const xSign of [-1, 1]) {
    const sideGuard = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.42, 1.65),
      carapaceHelmMat
    );
    sideGuard.position.set(xSign * 0.72, 0.92, -0.65);
    sideGuard.rotation.x = 0.12;
    podGroup.add(sideGuard);

    const headScroll = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 0.16, 16),
      carapaceHelmMat
    );
    headScroll.rotation.z = Math.PI * 0.5;
    headScroll.position.set(xSign * 0.72, 1.05, -1.35);
    podGroup.add(headScroll);
  }

  // 从穹顶垂落连接至医疗床头的黑色能量脐带缆线 (复刻 ep24_27m30s / ep24_28m00s 标志性垂直缆线)
  const cableBundle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.055, 8.8, 8),
    darkBasaltMat
  );
  cableBundle.position.set(-0.62, 5.2, -1.15);
  podGroup.add(cableBundle);

  group.add(podGroup);
  addMirageCollider(-16.2, -13.4, -44.5, -40.5, floorY, floorY + 2.5);

  // ---------------------------------------------------------------------------
  // 9. 穹顶粗粝岩石封顶与内外墙碰撞体（南壁中央留出 3.8m 敞开格扇门通道供玩家自由进出！）
  // ---------------------------------------------------------------------------
  const ceilingSlab = new THREE.Mesh(
    new THREE.BoxGeometry(42.0, 1.2, 39.0),
    darkBasaltMat
  );
  ceilingSlab.position.set(0, floorY + wallHeight + 0.4, -43.0);
  group.add(ceilingSlab);

  // 南壁左侧碰撞盒 (-21 .. -1.9) 与右侧碰撞盒 (1.9 .. 21)，中间 [-1.9, 1.9] 完全敞开可步入！
  addMirageCollider(-21.5, -1.9, -24.8, -23.4, floorY - 1.0, floorY + 12.0);
  addMirageCollider(1.9, 21.5, -24.8, -23.4, floorY - 1.0, floorY + 12.0);
  // 北壁与东西侧壁碰撞盒
  addMirageCollider(-21.5, 21.5, -62.5, -60.5, floorY - 1.0, floorY + 12.0);
  addMirageCollider(-21.5, -19.2, -62.0, -24.0, floorY - 1.0, floorY + 12.0);
  addMirageCollider(19.2, 21.5, -62.0, -24.0, floorY - 1.0, floorY + 12.0);

  function update(elapsed) {
    // 林寒微风拂动马尾与呼吸律动
    linHan.pose('idle', elapsed);
    linHan.group.position.y = floorY - 0.225;
  }

  return { group, update };
}
