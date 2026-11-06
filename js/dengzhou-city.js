// js/dengzhou-city.js
// 构建地面世界：登州群山盆地、护城河、白灰收分城门(ep01_06)、双望楼长街(ep01_08)、桃花红灯闹市(ep01_10)与北山登云崖飞爪台(ep23_02)

import * as THREE from 'three/webgpu';
import {
  DENGZHOU_BOUNDS,
  DENGZHOU_MAP_FEATURES,
  GU_MANSION,
  QINGFENG_TOWER,
  ROADS,
  getTerrainHeight,
  valueNoise2D
} from './world-config.js';
import { createLeadCharacter } from './lead-characters.js';
import { bailiFlatten } from './baili-config.js';
import {
  createTerrainMaterial,
  createStoneRoadMaterial
} from './tsl-materials.js';
import {
  getSharedArchMaterials,
  buildBatteredWallSegment,
  buildPalaceHall,
  buildDengzhouWatchtower,
  buildClassicalRoof,
  buildGrapplingLaunchpad
} from './architecture.js';

export function buildDengzhouCity(scene) {
  const root = new THREE.Group();
  root.name = 'DengzhouCity';
  const colliders = [];
  const allBlocks = [];
  const mats = getSharedArchMaterials();

  // ---------------------------------------------------------------------------
  // 1. 盆地与群山连续高度场地形 (1400m × 1400m)
  // ---------------------------------------------------------------------------
  const terrainSize = 1400;
  const terrainSegs = 220;
  const terrainGeo = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegs, terrainSegs);
  terrainGeo.rotateX(-Math.PI * 0.5);
  const tPos = terrainGeo.attributes.position;
  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i);
    const z = tPos.getZ(i);
    tPos.setY(i, getTerrainHeight(x, z));
  }
  terrainGeo.computeVertexNormals();

  const terrainMesh = new THREE.Mesh(terrainGeo, createTerrainMaterial());
  terrainMesh.receiveShadow = true;
  root.add(terrainMesh);

  // 护城河水面环带
  const waterMat = new THREE.MeshStandardNodeMaterial({
    color: 0x1b3b42,
    roughness: 0.16,
    metalness: 0.35
  });
  const waterGeo = new THREE.PlaneGeometry(430, 430);
  waterGeo.rotateX(-Math.PI * 0.5);
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.y = -0.85;
  root.add(waterMesh);

  // ---------------------------------------------------------------------------
  // 2. 城内青石板街道网络与登云崖/凤山石阶古道
  // ---------------------------------------------------------------------------
  const roadMat = createStoneRoadMaterial(false);
  const roadGroup = new THREE.Group();
  for (const r of ROADS) {
    if (r.mirage) continue;
    const [[x0, z0], [x1, z1]] = r.points;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const cx = (x0 + x1) * 0.5;
    const cz = (z0 + z1) * 0.5;

    if (r.name.includes('登云栈道') || r.name.includes('凤山八蟠石阶')) {
      // 登山石阶坡道（北门登云崖 或 城内西北凤山八蟠岭）
      const steps = r.name.includes('登云栈道') ? 36 : 26;
      const stepLen = len / steps;
      const angleY = Math.atan2(dx, dz);
      for (let s = 0; s < steps; s++) {
        const u = (s + 0.5) / steps;
        const sx = x0 + u * dx;
        const sz = z0 + u * dz;
        const y = getTerrainHeight(sx, sz);
        const stepMesh = new THREE.Mesh(
          new THREE.BoxGeometry(r.width, 0.8, stepLen * 1.15),
          mats.stoneBase
        );
        stepMesh.position.set(sx, y + 0.12, sz);
        stepMesh.rotation.y = angleY;
        stepMesh.receiveShadow = true;
        roadGroup.add(stepMesh);
      }
      continue;
    }

    const rGeo = new THREE.PlaneGeometry(
      Math.abs(dx) > Math.abs(dz) ? len : r.width,
      Math.abs(dx) > Math.abs(dz) ? r.width : len
    );
    rGeo.rotateX(-Math.PI * 0.5);
    const rMesh = new THREE.Mesh(rGeo, roadMat);
    rMesh.position.set(cx, 0.06, cz);
    rMesh.receiveShadow = true;
    roadGroup.add(rMesh);
  }
  root.add(roadGroup);

  // ---------------------------------------------------------------------------
  // 3. 登州四面收分城墙、四座城门与角楼 (精确复刻 ep01_06 登州南城门与 ep01_07 城门洞框景)
  // ---------------------------------------------------------------------------
  const wallGroup = new THREE.Group();
  const { minX, maxX, minZ, maxZ, wallHeight, wallThickness } = DENGZHOU_BOUNDS;
  const halfSpan = maxX; // 170m
  const gateOpeningHalf = 7.5; // 城门通道宽 15m，方便策马与步行进出
  const sideWallLen = halfSpan - gateOpeningHalf; // 162.5m

  function addCityGateAndWall(dirName, rotY) {
    const sideGroup = new THREE.Group();
    sideGroup.rotation.y = rotY;

    // 左右两翼城墙
    for (const sign of [-1, 1]) {
      const seg = buildBatteredWallSegment(sideWallLen, wallHeight, wallThickness, {
        whiteWashed: true,
        batterRatio: 0.78,
        crenellations: true
      });
      seg.position.set(sign * (gateOpeningHalf + sideWallLen * 0.5), 0, halfSpan);
      sideGroup.add(seg);
    }

    // 中央城门收分主墩台（留出中央门洞供穿行与仰望框景 ep01_07）
    const bastionW = 38;
    const bastionD = 12;
    const pierW = (bastionW - gateOpeningHalf * 2) * 0.5; // 11.5m
    for (const sign of [-1, 1]) {
      const pier = buildBatteredWallSegment(pierW, wallHeight + 1.8, bastionD, {
        whiteWashed: true,
        batterRatio: 0.76,
        crenellations: true
      });
      pier.position.set(sign * (gateOpeningHalf + pierW * 0.5), 0, halfSpan);
      sideGroup.add(pier);
    }

    // 城门洞上方过梁与“登州城”石匾额
    const lintelH = wallHeight + 1.8 - 8.2;
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(gateOpeningHalf * 2 + 0.6, lintelH, bastionD * 0.85),
      mats.dengzhouWall
    );
    lintel.position.set(0, 8.2 + lintelH * 0.5, halfSpan);
    lintel.castShadow = true;
    lintel.receiveShadow = true;
    sideGroup.add(lintel);

    // 城门深色木质门框与城门匾额 (参考 ep01_06)
    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 1.65, 0.5),
      mats.stoneBase
    );
    plaque.position.set(0, 11.2, halfSpan + bastionD * 0.43);
    sideGroup.add(plaque);

    // 城楼（双层歇山顶重檐城门楼）
    const gateTower = buildPalaceHall({
      width: 26,
      depth: 11,
      stories: 2,
      storyHeight: 4.5,
      basePlatformH: 0.6,
      goldenRoof: false,
      hasBalcony: true
    });
    gateTower.position.set(0, wallHeight + 1.8, halfSpan);
    sideGroup.add(gateTower);

    // 城墙垛口旌旗 (参考 ep01_06 城墙上的黑色/红色竖旗)
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.10, 5.5, 6);
    const flagGeo = new THREE.PlaneGeometry(1.2, 3.2);
    for (const fx of [-65, -35, 35, 65]) {
      const pole = new THREE.Mesh(poleGeo, mats.darkWood);
      pole.position.set(fx, wallHeight + 2.6, halfSpan);
      sideGroup.add(pole);

      const flag = new THREE.Mesh(flagGeo, mats.canopyRed);
      flag.position.set(fx + 0.65, wallHeight + 3.4, halfSpan);
      sideGroup.add(flag);
    }

    wallGroup.add(sideGroup);
  }

  addCityGateAndWall('South', 0);
  addCityGateAndWall('North', Math.PI);
  addCityGateAndWall('East', Math.PI * 0.5);
  addCityGateAndWall('West', -Math.PI * 0.5);

  // 四角城垣角楼
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cornerTower = buildPalaceHall({
        width: 12,
        depth: 12,
        stories: 2,
        storyHeight: 4.0,
        basePlatformH: 0.5,
        goldenRoof: false
      });
      cornerTower.position.set(sx * halfSpan, wallHeight, sz * halfSpan);
      wallGroup.add(cornerTower);
    }
  }
  root.add(wallGroup);

  // 为四面城墙注册碰撞体（留出 15m 宽的四座城门洞口）
  // 南城墙 (z = 170) & 北城墙 (z = -170)
  for (const zSign of [-1, 1]) {
    const zC = zSign * halfSpan;
    for (const xSign of [-1, 1]) {
      colliders.push({
        minX: xSign > 0 ? gateOpeningHalf : -halfSpan,
        maxX: xSign > 0 ? halfSpan : -gateOpeningHalf,
        minZ: zC - 5.5,
        maxZ: zC + 5.5,
        minY: 0,
        maxY: wallHeight + 4
      });
    }
  }
  // 东城墙 (x = 170) & 西城墙 (x = -170)
  for (const xSign of [-1, 1]) {
    const xC = xSign * halfSpan;
    for (const zSign of [-1, 1]) {
      colliders.push({
        minX: xC - 5.5,
        maxX: xC + 5.5,
        minZ: zSign > 0 ? gateOpeningHalf : -halfSpan,
        maxZ: zSign > 0 ? halfSpan : -gateOpeningHalf,
        minY: 0,
        maxY: wallHeight + 4
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 4. 朱雀长街双望楼走廊、中心鼓楼、州衙大堂与北山登云崖飞爪台
  // ---------------------------------------------------------------------------
  const landmarkGroup = new THREE.Group();

  // 4.1 朱雀长街两侧标志性白墙木构望楼 (复刻 ep01_08 镜头透视走廊)
  const watchtowerCoords = [
    [-14.5, 118], [14.5, 118],
    [-14.5, 76],  [14.5, 76],
    [-14.5, -42], [14.5, -42]
  ];
  for (const [wx, wz] of watchtowerCoords) {
    const wt = buildDengzhouWatchtower(18.0);
    wt.position.set(wx, 0, wz);
    landmarkGroup.add(wt);
    colliders.push({
      minX: wx - 3.6, maxX: wx + 3.6,
      minZ: wz - 3.6, maxZ: wz + 3.6,
      minY: 0, maxY: 19
    });
    allBlocks.push({ minX: wx - 3.6, maxX: wx + 3.6, minZ: wz - 3.6, maxZ: wz + 3.6, landmark: true });
  }

  // 4.2 登州中心十字街【镇海鼓楼】（底部十字穿心门洞，四通八达）
  const drumTowerGroup = new THREE.Group();
  const dtPierW = 4.6;
  const dtPierOffset = 6.2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pier = new THREE.Mesh(
        new THREE.BoxGeometry(dtPierW, 7.5, dtPierW),
        mats.dengzhouWall
      );
      pier.position.set(sx * dtPierOffset, 3.75, sz * dtPierOffset);
      pier.castShadow = true;
      pier.receiveShadow = true;
      drumTowerGroup.add(pier);
      colliders.push({
        minX: sx * dtPierOffset - dtPierW * 0.5,
        maxX: sx * dtPierOffset + dtPierW * 0.5,
        minZ: sz * dtPierOffset - dtPierW * 0.5,
        maxZ: sz * dtPierOffset + dtPierW * 0.5,
        minY: 0,
        maxY: 8.0
      });
    }
  }
  const dtPlatform = new THREE.Mesh(
    new THREE.BoxGeometry(18.5, 2.2, 18.5),
    mats.dengzhouWall
  );
  dtPlatform.position.y = 8.4;
  drumTowerGroup.add(dtPlatform);

  const dtPavilion = buildPalaceHall({
    width: 15.5,
    depth: 15.5,
    stories: 2,
    storyHeight: 4.5,
    basePlatformH: 0.4,
    goldenRoof: true
  });
  dtPavilion.position.y = 9.5;
  drumTowerGroup.add(dtPavilion);
  landmarkGroup.add(drumTowerGroup);
  allBlocks.push({ minX: -9.2, maxX: 9.2, minZ: -9.2, maxZ: 9.2, landmark: true });

  // 4.3 北坊【登州州衙 / 捉刀人公廨】建筑群
  const yamenMain = buildPalaceHall({
    width: 34,
    depth: 18,
    stories: 2,
    storyHeight: 5.2,
    basePlatformH: 1.8,
    goldenRoof: false
  });
  yamenMain.position.set(0, 0, -112);
  landmarkGroup.add(yamenMain);
  colliders.push({ minX: -18, maxX: 18, minZ: -122, maxZ: -101, minY: 0, maxY: 16 });
  allBlocks.push({ minX: -18, maxX: 18, minZ: -122, maxZ: -101, landmark: true });

  // 4.4 北山【登云崖·神机飞爪发射台】(铁索下端起点 x=0, y=60, z=-208)
  const launchpad = buildGrapplingLaunchpad();
  launchpad.position.set(0, 60.0, -208);
  landmarkGroup.add(launchpad);
  allBlocks.push({ minX: -9, maxX: 9, minZ: -217, maxZ: -199, landmark: true });

  // ---------------------------------------------------------------------------
  // 4.5 第二集《登州城之圖》(EP02 @ 38:45) 专属地标与城建细节
  //     包含：府治《登州城之圖》木框屏风、朝天门跨街牌坊、凤山八蟠亭与万松亭、
  //     穿城清湖河水渠与五座古桥、水门铁闸与小堰门、相国井亭、宝月山八眼井、四井及 7 处引水暗渠水闸
  // ---------------------------------------------------------------------------

  // (a) 登州府治前庭 · 立地木框竹编《登州城之圖》屏风与楹联展台 (x=0, z=-95)
  const mapScreenGroup = new THREE.Group();
  mapScreenGroup.position.set(0, 0, -95);

  // 青石基座
  const screenPedestal = new THREE.Mesh(
    new THREE.BoxGeometry(8.6, 0.42, 2.6),
    mats.stoneBase
  );
  screenPedestal.position.y = 0.21;
  screenPedestal.receiveShadow = true;
  mapScreenGroup.add(screenPedestal);

  // 主屏风外框（高 4.2m, 宽 4.8m）与两侧格栅耳屏
  const frameW = 4.8, frameH = 4.0, frameY = 2.45;
  const barThick = 0.16;
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(frameW, barThick, barThick), mats.darkWood);
  topBar.position.set(0, frameY + frameH * 0.5, 0);
  const botBar = new THREE.Mesh(new THREE.BoxGeometry(frameW, barThick, barThick), mats.darkWood);
  botBar.position.set(0, frameY - frameH * 0.5, 0);
  mapScreenGroup.add(topBar, botBar);

  for (const sx of [-1, 1]) {
    // 主立柱
    const mainPost = new THREE.Mesh(new THREE.BoxGeometry(barThick, frameH + 0.5, barThick), mats.darkWood);
    mainPost.position.set(sx * (frameW * 0.5), frameY - 0.15, 0);
    mapScreenGroup.add(mainPost);

    // 两侧矮立柱与菱形格栅耳屏 (复刻 EP02 屏风左右护翼)
    const wingPost = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.18), mats.darkWood);
    wingPost.position.set(sx * (frameW * 0.5 + 0.72), 1.5, 0);
    mapScreenGroup.add(wingPost);

    const finial = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.24), mats.goldAccent);
    finial.position.set(sx * (frameW * 0.5 + 0.72), 2.9, 0);
    mapScreenGroup.add(finial);

    for (const wy of [0.65, 2.45]) {
      const wingRail = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.10, 0.12), mats.darkWood);
      wingRail.position.set(sx * (frameW * 0.5 + 0.36), wy, 0);
      mapScreenGroup.add(wingRail);
    }

    // 屏风底座抱鼓墩
    const footBase = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.35, 1.45), mats.darkWood);
    footBase.position.set(sx * (frameW * 0.5 + 0.36), 0.55, 0);
    mapScreenGroup.add(footBase);

    // 两侧古松盆景与高几（复刻剧照屏风左右两盆迎客松盆景）
    const standX = sx * 3.75;
    const bonsaiStand = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.15, 0.85), mats.darkWood);
    bonsaiStand.position.set(standX, 0.98, 0.15);
    mapScreenGroup.add(bonsaiStand);

    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.26, 0.42, 6), mats.stoneBase);
    pot.position.set(standX, 1.76, 0.15);
    mapScreenGroup.add(pot);

    const foliage = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 1), mats.pineGreen);
    foliage.scale.set(1.25, 0.75, 0.95);
    foliage.position.set(standX, 2.25, 0.15);
    mapScreenGroup.add(foliage);

    // 屏风后侧楹联立柱（左「時時聞說有…」右「山河破碎風飄絮 / 卻是平流無…」）
    const scrollPillar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3.8, 0.12), mats.darkWood);
    scrollPillar.position.set(sx * 3.6, 2.4, -0.65);
    mapScreenGroup.add(scrollPillar);
    const scrollPaper = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 3.2), mats.bannerWhite);
    scrollPaper.position.set(sx * 3.6, 2.4, -0.58);
    mapScreenGroup.add(scrollPaper);
  }

  // 屏风内框交叉斜绷藤绳（复刻剧照中拉紧羊皮地图的交叉细绳网）
  const cordGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.95, 4);
  for (let i = -8; i <= 8; i++) {
    const cx = i * 0.26;
    for (const sy of [-1, 1]) {
      const cordA = new THREE.Mesh(cordGeo, mats.bannerGold);
      cordA.position.set(cx, frameY + sy * (frameH * 0.41), 0);
      cordA.rotation.z = 0.36;
      mapScreenGroup.add(cordA);

      const cordB = new THREE.Mesh(cordGeo, mats.bannerGold);
      cordB.position.set(cx, frameY + sy * (frameH * 0.41), 0);
      cordB.rotation.z = -0.36;
      mapScreenGroup.add(cordB);
    }
  }

  // 张挂中央《登州城之圖》羊皮卷（正反双面可见）。素色羊皮
  const mapMat = new THREE.MeshStandardNodeMaterial({
    color: 0xd8c38e,
    roughness: 0.72,
    metalness: 0.04,
    side: THREE.DoubleSide
  });
  const mapPlane = new THREE.Mesh(new THREE.PlaneGeometry(3.85, 3.05), mapMat);
  mapPlane.position.set(0, frameY, 0);
  mapPlane.castShadow = true;
  mapScreenGroup.add(mapPlane);

  // 屏风两侧照明宫灯
  for (const sx of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.65, 8), mats.goldLantern);
    l.position.set(sx * 2.85, 3.85, 0.35);
    mapScreenGroup.add(l);
  }

  landmarkGroup.add(mapScreenGroup);
  colliders.push({ minX: -4.2, maxX: 4.2, minZ: -96.2, maxZ: -93.8, minY: 0, maxY: 4.8 });
  allBlocks.push({ minX: -4.2, maxX: 4.2, minZ: -96.2, maxZ: -93.8, landmark: true });

  // (b) 御街中轴【朝天門】四柱三间跨街牌坊 (x=0, z=-42，中央留出 14m 净宽供车马行人穿行)
  const chaotianGroup = new THREE.Group();
  chaotianGroup.position.set(0, 0, -42);
  const archPillarsX = [-10.8, -6.8, 6.8, 10.8];
  for (const px of archPillarsX) {
    const isInner = Math.abs(px) < 8;
    const pH = isInner ? 10.5 : 8.4;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, pH, 8), mats.redWood);
    pillar.position.set(px, pH * 0.5, 0);
    pillar.castShadow = true;
    chaotianGroup.add(pillar);

    const drumStone = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.2, 1.5), mats.stoneBase);
    drumStone.position.set(px, 0.6, 0);
    chaotianGroup.add(drumStone);

    colliders.push({
      minX: px - 0.6, maxX: px + 0.6,
      minZ: -42.8, maxZ: -41.2,
      minY: 0, maxY: pH
    });
  }
  // 主间横梁、额枋与飞檐楼顶
  const mainBeam = new THREE.Mesh(new THREE.BoxGeometry(22.4, 0.85, 0.85), mats.redWood);
  mainBeam.position.set(0, 7.8, 0);
  chaotianGroup.add(mainBeam);
  const upperBeam = new THREE.Mesh(new THREE.BoxGeometry(14.6, 1.1, 0.9), mats.goldAccent);
  upperBeam.position.set(0, 9.6, 0);
  chaotianGroup.add(upperBeam);
  const centerRoof = buildClassicalRoof(16.2, 4.2, 2.4, { goldenTrim: true, eaveCurve: 0.52 });
  centerRoof.position.set(0, 11.2, 0);
  chaotianGroup.add(centerRoof);
  for (const sx of [-1, 1]) {
    const sideRoof = buildClassicalRoof(5.6, 3.6, 1.8, { goldenTrim: false, eaveCurve: 0.46 });
    sideRoof.position.set(sx * 8.8, 8.9, 0);
    chaotianGroup.add(sideRoof);
  }
  landmarkGroup.add(chaotianGroup);
  allBlocks.push({ minX: -11.2, maxX: 11.2, minZ: -43.5, maxZ: -40.5, landmark: true });

  // (c) 城内西北【鳳山 · 八蟠嶺亭】、【萬松亭】与【月岩奇石】
  const fengshanPavilion = buildPalaceHall({
    width: 11.5,
    depth: 11.5,
    stories: 2,
    storyHeight: 3.8,
    basePlatformH: 0.8,
    goldenRoof: true,
    hasBalcony: true
  });
  fengshanPavilion.position.set(-112, getTerrainHeight(-112, -130), -130);
  landmarkGroup.add(fengshanPavilion);
  colliders.push({ minX: -118, maxX: -106, minZ: -136, maxZ: -124, minY: 13, maxY: 26 });
  allBlocks.push({ minX: -118, maxX: -106, minZ: -136, maxZ: -124, landmark: true });

  const wansongPavilion = buildPalaceHall({
    width: 8.2,
    depth: 8.2,
    stories: 1,
    storyHeight: 3.6,
    basePlatformH: 0.6,
    goldenRoof: false,
    hasBalcony: false
  });
  wansongPavilion.position.set(-144, getTerrainHeight(-144, -136), -136);
  landmarkGroup.add(wansongPavilion);
  allBlocks.push({ minX: -148.5, maxX: -139.5, minZ: -140.5, maxZ: -131.5, landmark: true });

  // 月岩太湖奇石群 (x=-138, z=-108)
  const rockGeo = new THREE.DodecahedronGeometry(2.2, 1);
  for (const [rx, rz, sy, sc] of [[-138, -108, 2.2, 1.3], [-134, -110, 1.5, 0.9], [-141, -105, 1.7, 1.0]]) {
    const rk = new THREE.Mesh(rockGeo, mats.stoneBase);
    rk.position.set(rx, getTerrainHeight(rx, rz) + sy * 0.8, rz);
    rk.scale.set(sc, sy, sc * 0.85);
    rk.castShadow = true;
    landmarkGroup.add(rk);
  }

  // (d) 穿城水系【清湖河】石砌河渠、五座青石拱桥与【釣臺水榭】
  const canalGroup = new THREE.Group();
  for (const c of DENGZHOU_MAP_FEATURES.canals) {
    const [[x0, z0], [x1, z1]] = c.points;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const isHoriz = Math.abs(dx) > Math.abs(dz);
    const len = Math.hypot(dx, dz);
    const cx = (x0 + x1) * 0.5;
    const cz = (z0 + z1) * 0.5;

    const wPlane = new THREE.PlaneGeometry(isHoriz ? len : c.width, isHoriz ? c.width : len);
    wPlane.rotateX(-Math.PI * 0.5);
    const wMesh = new THREE.Mesh(wPlane, waterMat);
    wMesh.position.set(cx, 0.08, cz);
    canalGroup.add(wMesh);

    // 河岸两侧青石驳岸条石
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(isHoriz ? len : 0.48, 0.28, isHoriz ? 0.48 : len),
        mats.stoneBase
      );
      curb.position.set(
        isHoriz ? cx : cx + side * (c.width * 0.5 + 0.24),
        0.14,
        isHoriz ? cz + side * (c.width * 0.5 + 0.24) : cz
      );
      canalGroup.add(curb);
    }
  }

  // 五座跨渠青石古桥（大石桥、三圣桥、望仙桥、黑津桥、水门桥）
  for (const br of DENGZHOU_MAP_FEATURES.bridges) {
    const bGroup = new THREE.Group();
    bGroup.position.set(br.x, 0, br.z);
    bGroup.rotation.y = br.rotY;

    const deck = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.36, 7.6), mats.stoneBase);
    deck.position.y = 0.22;
    deck.receiveShadow = true;
    bGroup.add(deck);

    for (const sz of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.85, 0.32), mats.dengzhouWall);
      rail.position.set(0, 0.72, sz * 3.6);
      bGroup.add(rail);
      for (const px of [-3.8, 0, 3.8]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.44, 1.25, 0.44), mats.stoneMedallion);
        post.position.set(px, 0.88, sz * 3.6);
        bGroup.add(post);
      }
    }
    canalGroup.add(bGroup);
    allBlocks.push({ minX: br.x - 4.2, maxX: br.x + 4.2, minZ: br.z - 3.8, maxZ: br.z + 3.8, landmark: true });
  }

  // 釣臺临水木榭 (x=-88, z=-94)
  const diaotai = buildPalaceHall({
    width: 7.4,
    depth: 6.2,
    stories: 1,
    storyHeight: 3.4,
    basePlatformH: 0.5,
    goldenRoof: false,
    hasBalcony: true
  });
  diaotai.position.set(-88, 0, -94);
  canalGroup.add(diaotai);
  allBlocks.push({ minX: -92, maxX: -84, minZ: -97.5, maxZ: -90.5, landmark: true });
  landmarkGroup.add(canalGroup);

  // (e) 南垣【水門 (保安水门)】(x=138, z=170) 与西垣【小堰門】(x=-170, z=112)
  const shuimenGroup = new THREE.Group();
  shuimenGroup.position.set(138, 0, 170);
  // 穿墙石券水门墩台（突出城墙内外两侧，清晰呈现水门券洞与玄铁水闸）
  const shuimenBastion = new THREE.Mesh(new THREE.BoxGeometry(11.6, wallHeight + 0.3, 8.8), mats.dengzhouWall);
  shuimenBastion.position.y = (wallHeight + 0.3) * 0.5;
  shuimenBastion.castShadow = true;
  shuimenBastion.receiveShadow = true;
  shuimenGroup.add(shuimenBastion);

  // 水门暗渠穿墙水洞与水面延伸
  const shuimenArchVoid = new THREE.Mesh(new THREE.BoxGeometry(5.6, 5.2, 9.2), mats.gateVoid);
  shuimenArchVoid.position.y = 2.6;
  shuimenGroup.add(shuimenArchVoid);

  const shuimenWater = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.28, 12.0), waterMat);
  shuimenWater.position.y = 0.08;
  shuimenGroup.add(shuimenWater);

  // 水门城墙内侧与外侧玄铁水闸栏杆 + 绞盘横梁
  for (const zSide of [-4.55, 4.55]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.45, 0.45), mats.darkWood);
    beam.position.set(0, 5.1, zSide);
    shuimenGroup.add(beam);
    for (let gx = -2.4; gx <= 2.4; gx += 0.8) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 5.2, 6), mats.bronze);
      bar.position.set(gx, 2.6, zSide);
      shuimenGroup.add(bar);
    }
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.95, 0.22), mats.redWood);
    plaque.position.set(0, 6.4, zSide);
    shuimenGroup.add(plaque);
  }

  const shuimenTower = buildPalaceHall({
    width: 12,
    depth: 9,
    stories: 1,
    storyHeight: 4.2,
    basePlatformH: 0.5,
    goldenRoof: false
  });
  shuimenTower.position.y = wallHeight;
  shuimenGroup.add(shuimenTower);
  landmarkGroup.add(shuimenGroup);
  allBlocks.push({ minX: 132, maxX: 144, minZ: 165, maxZ: 175, landmark: true });

  const xiaoyanGroup = new THREE.Group();
  xiaoyanGroup.position.set(-170, 0, 112);
  xiaoyanGroup.rotation.y = Math.PI * 0.5;
  const xiaoyanTower = buildPalaceHall({
    width: 11,
    depth: 8.5,
    stories: 1,
    storyHeight: 4.0,
    basePlatformH: 0.5,
    goldenRoof: false
  });
  xiaoyanTower.position.y = wallHeight;
  xiaoyanGroup.add(xiaoyanTower);
  landmarkGroup.add(xiaoyanGroup);
  allBlocks.push({ minX: -175, maxX: -165, minZ: 106, maxZ: 118, landmark: true });

  // (f) 古图名井：【相國井】(x=-34, z=-60)、【寶月山·八眼井】(x=-106, z=-24) 与【四井】(x=-104, z=-80)
  function buildWellCluster({ x, z, rows, cols, hasPavilion = false }) {
    const wg = new THREE.Group();
    wg.position.set(x, 0, z);
    const platW = cols * 2.4 + 2.4;
    const platD = rows * 2.4 + 2.4;
    const plat = new THREE.Mesh(new THREE.BoxGeometry(platW, 0.32, platD), mats.stoneBase);
    plat.position.y = 0.16;
    plat.receiveShadow = true;
    wg.add(plat);

    const ringGeo = new THREE.CylinderGeometry(0.68, 0.74, 0.62, 10);
    const innerWaterGeo = new THREE.CylinderGeometry(0.54, 0.54, 0.64, 10);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = (c - (cols - 1) * 0.5) * 2.2;
        const wz = (r - (rows - 1) * 0.5) * 2.2;
        const ring = new THREE.Mesh(ringGeo, mats.stoneMedallion);
        ring.position.set(wx, 0.52, wz);
        ring.castShadow = true;
        wg.add(ring);

        const wInner = new THREE.Mesh(innerWaterGeo, waterMat);
        wInner.position.set(wx, 0.53, wz);
        wg.add(wInner);
      }
    }

    if (hasPavilion) {
      // 相国井专属朱柱飞檐井亭
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.20, 3.8, 8), mats.redWood);
          col.position.set(sx * 2.1, 2.1, sz * 2.1);
          col.castShadow = true;
          wg.add(col);
        }
      }
      const pRoof = buildClassicalRoof(6.2, 6.2, 2.1, { goldenTrim: true, eaveCurve: 0.52 });
      pRoof.position.y = 4.6;
      wg.add(pRoof);
    } else {
      // 古井木制辘轳架与石碑
      const stele = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.1, 0.28), mats.stoneBase);
      stele.position.set(-platW * 0.42, 1.2, 0);
      wg.add(stele);
    }

    landmarkGroup.add(wg);
    allBlocks.push({ minX: x - platW * 0.5, maxX: x + platW * 0.5, minZ: z - platD * 0.5, maxZ: z + platD * 0.5, landmark: true });
  }

  buildWellCluster({ x: -34, z: -60, rows: 1, cols: 1, hasPavilion: true });  // 相国井
  buildWellCluster({ x: -106, z: -24, rows: 2, cols: 4, hasPavilion: false }); // 宝月山八眼井
  buildWellCluster({ x: -104, z: -80, rows: 2, cols: 2, hasPavilion: false }); // 凤山麓四井

  // (g) 第二集「引水淹城」7 处朱砂水闸枢纽 (DENGZHOU_MAP_FEATURES.redNodes)
  //     平铺于街面十字路口的八角形暗渠铁箅水井 + 朱砂封条界石（不阻挡角色与马匹通行）
  const sluiceOuterGeo = new THREE.CylinderGeometry(2.3, 2.4, 0.10, 8);
  const sluiceWaterGeo = new THREE.CylinderGeometry(1.75, 1.75, 0.11, 8);
  const sluiceRingGeo = new THREE.TorusGeometry(2.05, 0.10, 6, 16);
  sluiceRingGeo.rotateX(Math.PI * 0.5);
  for (const node of DENGZHOU_MAP_FEATURES.redNodes) {
    const sg = new THREE.Group();
    sg.position.set(node.x, 0, node.z);

    const rim = new THREE.Mesh(sluiceOuterGeo, mats.stoneBase);
    rim.position.y = 0.05;
    rim.receiveShadow = true;
    sg.add(rim);

    const pool = new THREE.Mesh(sluiceWaterGeo, waterMat);
    pool.position.y = 0.055;
    sg.add(pool);

    // 铁箅水闸横纵格栅
    for (const d of [-0.9, -0.3, 0.3, 0.9]) {
      const barX = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.04, 0.10), mats.bronze);
      barX.position.set(0, 0.11, d);
      sg.add(barX);
      const barZ = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.04, 3.2), mats.bronze);
      barZ.position.set(d, 0.11, 0);
      sg.add(barZ);
    }

    // 朱砂红环标记（呼应《登州城之圖》上的 7 个大红点）
    const redRing = new THREE.Mesh(sluiceRingGeo, mats.redLantern);
    redRing.position.y = 0.11;
    sg.add(redRing);

    landmarkGroup.add(sg);
  }

  root.add(landmarkGroup);

  // ---------------------------------------------------------------------------
  // 5. 登州坊巷酒楼、商铺与院落生成（含桃花红灯闹市 ep01_10 与酒楼飞檐 ep01_11）
  // ---------------------------------------------------------------------------
  const blocksGroup = new THREE.Group();

  function addBuildingLot(cx, cz, w, d, stories = 2, rotY = 0, isTavern = false) {
    const lotGroup = new THREE.Group();
    lotGroup.position.set(cx, 0, cz);
    lotGroup.rotation.y = rotY;

    const storyH = 3.9;
    let curY = 0;

    for (let s = 0; s < stories; s++) {
      const scale = s === 0 ? 1.0 : 0.92;
      const bw = w * scale;
      const bd = d * scale;

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(bw, storyH, bd),
        (Math.abs(cx + cz) + s) % 2 === 0 ? mats.facadeA : mats.facadeB
      );
      body.position.y = curY + storyH * 0.5;
      body.castShadow = true;
      body.receiveShadow = true;
      lotGroup.add(body);

      const roof = buildClassicalRoof(bw * 1.24, bd * 1.24, s === stories - 1 ? 2.6 : 1.5, {
        goldenTrim: isTavern && s === stories - 1,
        eaveCurve: 0.45,
        topRatio: s === stories - 1 ? 0.42 : 0.72
      });
      roof.position.y = curY + storyH + 0.65;
      lotGroup.add(roof);

      curY += storyH + 0.35;
    }

    blocksGroup.add(lotGroup);

    const halfX = (Math.abs(Math.cos(rotY)) * w + Math.abs(Math.sin(rotY)) * d) * 0.5;
    const halfZ = (Math.abs(Math.sin(rotY)) * w + Math.abs(Math.cos(rotY)) * d) * 0.5;
    colliders.push({
      minX: cx - halfX,
      maxX: cx + halfX,
      minZ: cz - halfZ,
      maxZ: cz + halfZ,
      minY: 0,
      maxY: curY + 2
    });
    allBlocks.push({
      minX: cx - halfX,
      maxX: cx + halfX,
      minZ: cz - halfZ,
      maxZ: cz + halfZ
    });
  }

  // 朱雀长街两侧连排酒楼与商铺 (z = 22..152)
  const mainStreetLots = [
    [-22, 142, 14, 20, 2, true],  [22, 142, 14, 20, 2, true],
    [-22, 96,  14, 22, 2, false], [22, 96,  14, 22, 2, true],
    [-22, 42,  14, 18, 2, false], [22, 42,  15, 18, 3, true],
    [-22, -24, 14, 18, 2, false], [22, -24, 14, 18, 2, false],
    [-22, -80, 14, 16, 2, false], [22, -80, 14, 16, 2, false]
  ];
  for (const [x, z, w, d, st, tav] of mainStreetLots) {
    addBuildingLot(x, z, w, d, st, 0, tav);
  }

  // 桃花酒肆巷与东西大街商铺群 (复刻 ep01_10 / ep01_11 及 EP02 臺諫、白馬院、黑津巷坊院)
  const districtLots = [
    // 东市桃花红灯街两侧
    [45, 72, 18, 12, 2, true],   [72, 72, 20, 13, 3, true],   [100, 72, 16, 12, 2, false],
    [45, 40, 18, 12, 2, true],   [72, 40, 18, 12, 2, false],  [100, 40, 16, 12, 2, true],
    // 西市望楼巷两侧
    [-45, 72, 18, 12, 2, false], [-72, 72, 18, 13, 2, true],  [-100, 72, 16, 12, 2, false],
    [-45, 40, 18, 12, 2, false], [-72, 40, 18, 12, 2, false], [-100, 40, 16, 12, 1, false],
    // 鼓楼东西大街两侧（含东侧黑津巷与西侧臺諫前坊）
    [52, 16, 20, 13, 2, true],   [85, 16, 18, 13, 2, false],  [52, -16, 20, 13, 2, false],  [85, -16, 18, 13, 2, true],
    [-52, 16, 20, 13, 2, false], [-85, 16, 18, 13, 2, true],  [-52, -16, 20, 13, 2, false], [-85, -16, 18, 13, 2, false],
    // 南坊与北坊官署院落（含臺諫 -56,-52 与白馬院 -92,-52；东南坊 [48..108, 82..125] 留给【顾府】，西南坊 [-108..-48, 82..125] 留给【清风楼】）
    [56, -52, 20, 16, 2, false], [92, -52, 20, 16, 1, false], [-56, -52, 20, 16, 2, true],  [-92, -52, 20, 16, 1, false],
    [56, -112, 22, 18, 2, false], [-56, -112, 22, 18, 2, false]
  ];
  for (const [x, z, w, d, st, tav] of districtLots) {
    addBuildingLot(x, z, w, d, st, 0, tav);
  }
  root.add(blocksGroup);

  // ---------------------------------------------------------------------------
  // 5.5 第 10–11 集【顾府】（顾廷美与顾老爷宅第，位于登州东南坊 x=78, z=82..125）
  //     精确还原：门前青石栏桥与一对灰白石雕方灯、「府 顧」黑底金字大门牌匾与《道德经》楹联、
  //     东西抄手游廊、黄油纸大伞石桌、落地木框庭院灯、打翻的竹提食盒，以及正堂「遠致行篤」大堂
  // ---------------------------------------------------------------------------
  const guGroup = new THREE.Group();
  guGroup.name = 'GuMansion';
  const gx = GU_MANSION.x;
  const gateZ = GU_MANSION.gateZ; // 124.5
  const hallZ = GU_MANSION.hallZ; // 89

  function makeHorizontalPlaque(text, w, h, opts = {}) {
    const bg = opts.bg || '#181412';
    const border = opts.border || '#cfa34a';
    const fg = opts.fg || '#e0b85c';
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.22), mats.darkWood);
    g.add(board);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.16), mats.goldAccent);
    rim.position.z = -0.02;
    g.add(rim);
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 192;
      const ctx = c.getContext('2d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 512, 192);
      ctx.strokeStyle = border;
      ctx.lineWidth = 8;
      ctx.strokeRect(10, 10, 492, 172);
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, 472, 152);
      ctx.fillStyle = fg;
      ctx.font = 'bold 92px "Songti SC", "Noto Serif SC", "Kaiti SC", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 98);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(w - 0.12, h - 0.12),
        new THREE.MeshBasicMaterial({ map: tex })
      );
      face.position.z = 0.12;
      g.add(face);
    }
    return g;
  }

  function makeVerticalCouplet(text, w, h, opts = {}) {
    const bg = opts.bg || '#181412';
    const border = opts.border || '#cfa34a';
    const fg = opts.fg || '#dfc686';
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.10), mats.darkWood);
    g.add(board);
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 768;
      const ctx = c.getContext('2d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 128, 768);
      ctx.strokeStyle = border;
      ctx.lineWidth = 5;
      ctx.strokeRect(8, 8, 112, 752);
      ctx.fillStyle = fg;
      const chars = Array.from(text);
      const fontSize = Math.min(58, Math.floor(660 / Math.max(1, chars.length)));
      ctx.font = `bold ${fontSize}px "Songti SC", "Noto Serif SC", "Kaiti SC", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const stepY = 680 / chars.length;
      chars.forEach((ch, idx) => {
        ctx.fillText(ch, 64, 44 + stepY * (idx + 0.5));
      });
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(w - 0.04, h - 0.06),
        new THREE.MeshBasicMaterial({ map: tex })
      );
      face.position.z = 0.06;
      g.add(face);
    }
    return g;
  }

  // (a) 顾府青石板院落地面 (x ∈ [48, 108], z ∈ [82, 126])
  const guFloorGeo = new THREE.PlaneGeometry(59.2, 43.2);
  guFloorGeo.rotateX(-Math.PI * 0.5);
  const guFloor = new THREE.Mesh(guFloorGeo, roadMat);
  guFloor.position.set(gx, 0.07, 103.6);
  guFloor.receiveShadow = true;
  guGroup.add(guFloor);

  // (b) 四周院墙（西墙 x=48、东墙 x=108、北墙 z=82、南墙两侧 x=48..64 与 92..108）
  const wallH = 3.8;
  const wallSegs = [
    // 西院墙
    [48, 103.25, 0.9, 42.5],
    // 东院墙
    [108, 103.25, 0.9, 42.5],
    // 北后墙
    [78, 82, 60.8, 0.9],
    // 南侧左右院墙（衔接中央三间门厅 x=64..92）
    [56, gateZ, 16.0, 0.9],
    [100, gateZ, 16.0, 0.9]
  ];
  for (const [wx, wz, ww, wd] of wallSegs) {
    const wMesh = new THREE.Mesh(new THREE.BoxGeometry(ww, wallH, wd), mats.dengzhouWall);
    wMesh.position.set(wx, wallH * 0.5, wz);
    wMesh.castShadow = true;
    wMesh.receiveShadow = true;
    guGroup.add(wMesh);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.35, 0.36, wd + 0.35), mats.roofSlate);
    cap.position.set(wx, wallH + 0.18, wz);
    guGroup.add(cap);

    colliders.push({
      minX: wx - ww * 0.5, maxX: wx + ww * 0.5,
      minZ: wz - wd * 0.5, maxZ: wz + wd * 0.5,
      minY: 0, maxY: wallH + 1
    });
  }

  // (c) 顾府三间大门门厅 (x=64..92, z=121.8..124.8)，中央留出 7.6m 宽敞通道 (x=74.2..81.8)
  const gateOpenHalf = 3.8;
  for (const side of [-1, 1]) {
    // 门厅左右耳房实体
    const wingW = 10.2;
    const wingCx = gx + side * (gateOpenHalf + wingW * 0.5);
    const wingBody = new THREE.Mesh(new THREE.BoxGeometry(wingW, 4.6, 3.4), mats.facadeA);
    wingBody.position.set(wingCx, 2.3, gateZ - 1.1);
    wingBody.castShadow = true;
    wingBody.receiveShadow = true;
    guGroup.add(wingBody);

    colliders.push({
      minX: wingCx - wingW * 0.5, maxX: wingCx + wingW * 0.5,
      minZ: gateZ - 2.8, maxZ: gateZ + 0.6,
      minY: 0, maxY: 6.5
    });

    // 大门立柱与抱鼓石
    const pillarX = gx + side * gateOpenHalf;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.30, 4.8, 10), mats.darkWood);
    pillar.position.set(pillarX, 2.4, gateZ + 0.25);
    pillar.castShadow = true;
    guGroup.add(pillar);

    const drumBase = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.52, 12), mats.stoneMedallion);
    drumBase.position.set(pillarX, 0.26, gateZ + 0.25);
    guGroup.add(drumBase);

    // 柱顶木框檐灯 (EP10 @ 38:40)
    const eaveLamp = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.88, 0.68), mats.darkWood);
    eaveLamp.position.set(pillarX, 4.35, gateZ + 0.55);
    guGroup.add(eaveLamp);
    const lampCore = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.48), mats.goldLantern);
    lampCore.position.set(pillarX, 4.35, gateZ + 0.55);
    guGroup.add(lampCore);

    // 门前灰白石雕方灯 (精准复刻 EP10 @ 38:40 大门左右两侧石灯台)
    const stoneLampX = gx + side * 5.2;
    const stoneLampZ = gateZ + 1.85;
    const slGroup = new THREE.Group();
    slGroup.position.set(stoneLampX, 0, stoneLampZ);
    const slPedestal = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.36, 1.15), mats.stoneBase);
    slPedestal.position.y = 0.18;
    const slShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.95, 8), mats.stoneMedallion);
    slShaft.position.y = 0.82;
    const slTray = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.16, 1.10), mats.stoneBase);
    slTray.position.y = 1.36;
    const slChamber = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.72, 0.76), mats.stoneMedallion);
    slChamber.position.y = 1.80;
    const slLight = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.52, 0.54), mats.whiteLantern);
    slLight.position.y = 1.80;
    const slCap = new THREE.Mesh(new THREE.ConeGeometry(0.82, 0.52, 4), mats.stoneBase);
    slCap.rotation.y = Math.PI * 0.25;
    slCap.position.y = 2.42;
    slGroup.add(slPedestal, slShaft, slTray, slChamber, slLight, slCap);
    guGroup.add(slGroup);

    // 门前青石桥廊栏杆 (复刻 EP10 @ 38:12 谢景棠借刀处的石栏桥廊)
    const railX = gx + side * 6.4;
    const railWall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.88, 3.2), mats.stoneMedallion);
    railWall.position.set(railX, 0.44, gateZ + 2.4);
    guGroup.add(railWall);
    for (const rz of [gateZ + 0.9, gateZ + 2.4, gateZ + 3.9]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.22, 0.46), mats.stoneBase);
      post.position.set(railX, 0.61, rz);
      guGroup.add(post);
    }
  }

  // 大门横梁、白墙上额与黛瓦飞檐屋顶
  const gateUpperWall = new THREE.Mesh(new THREE.BoxGeometry(gateOpenHalf * 2 + 0.8, 1.45, 3.0), mats.dengzhouWall);
  gateUpperWall.position.set(gx, 4.15, gateZ - 1.1);
  guGroup.add(gateUpperWall);
  const gateBeam = new THREE.Mesh(new THREE.BoxGeometry(28.6, 0.42, 3.5), mats.darkWood);
  gateBeam.position.set(gx, 3.45, gateZ - 1.1);
  guGroup.add(gateBeam);
  const gateRoof = buildClassicalRoof(30.5, 6.2, 2.5, { goldenTrim: false, eaveCurve: 0.48, topRatio: 0.48 });
  gateRoof.position.set(gx, 5.45, gateZ - 1.1);
  guGroup.add(gateRoof);

  // 「府 顧」大门黑底金字牌匾 (EP10 @ 38:40) 与《道德经》楹联
  const guGatePlaque = makeHorizontalPlaque('府   顧', 3.4, 1.25);
  guGatePlaque.position.set(gx, 4.35, gateZ + 0.46);
  guGroup.add(guGatePlaque);

  const guGatePlaqueBack = makeHorizontalPlaque('府   顧', 3.2, 1.15);
  guGatePlaqueBack.rotation.y = Math.PI;
  guGatePlaqueBack.position.set(gx, 4.35, gateZ - 2.65);
  guGroup.add(guGatePlaqueBack);

  // 大门右联（东柱上联）：天下難事必作于易；左联（西柱下联）：天下大事必作于細
  const gateCoupletR = makeVerticalCouplet('天下難事必作于易', 0.42, 2.75);
  gateCoupletR.position.set(gx + gateOpenHalf, 2.05, gateZ + 0.56);
  guGroup.add(gateCoupletR);
  const gateCoupletL = makeVerticalCouplet('天下大事必作于細', 0.42, 2.75);
  gateCoupletL.position.set(gx - gateOpenHalf, 2.05, gateZ + 0.56);
  guGroup.add(gateCoupletL);

  // (d) 东西两侧抄手游廊 (EP10 @ 39:05 / 42:30 俯拍长廊与廊灯)
  for (const side of [-1, 1]) {
    const verandaX = gx + side * 26.8;
    const verandaRoof = buildClassicalRoof(4.6, 26.5, 1.45, { goldenTrim: false, eaveCurve: 0.36, topRatio: 0.68 });
    verandaRoof.position.set(verandaX, 4.1, 108);
    guGroup.add(verandaRoof);

    const railBeam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 25.0), mats.darkWood);
    railBeam.position.set(gx + side * 24.8, 0.45, 108);
    guGroup.add(railBeam);

    for (let vz = 96; vz <= 120; vz += 4.8) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.20, 3.5, 8), mats.darkWood);
      col.position.set(gx + side * 24.8, 1.75, vz);
      col.castShadow = true;
      guGroup.add(col);

      // 游廊木框挂灯
      const vLamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.42), mats.goldLantern);
      vLamp.position.set(gx + side * 24.8, 3.05, vz + 2.4);
      guGroup.add(vLamp);
    }
  }

  // (e) 前院四座落地木框庭院灯台 (复刻 EP10 @ 38:52 / EP11 @ 05:40 正堂前木灯台)
  for (const lx of [gx - 6.8, gx + 6.8]) {
    for (const lz of [99.5, 112.5]) {
      const wl = new THREE.Group();
      wl.position.set(lx, 0, lz);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.24, 0.92), mats.redWood);
      base.position.y = 0.12;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.05, 0.42), mats.redWood);
      post.position.y = 0.72;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.68, 0.76), mats.redWood);
      head.position.y = 1.56;
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.48, 0.56), mats.goldLantern);
      glow.position.y = 1.56;
      const roofCap = new THREE.Mesh(new THREE.ConeGeometry(0.68, 0.38, 4), mats.darkWood);
      roofCap.rotation.y = Math.PI * 0.25;
      roofCap.position.y = 2.08;
      wl.add(base, post, head, glow, roofCap);
      guGroup.add(wl);
    }
  }

  // (f) 院西黄色油纸大伞与青石圆桌石鼓凳 (精准复刻 EP10 @ 38:49 / 40:00 / 42:30 标志性黄伞)
  const umbX = gx - 11.2, umbZ = 110.5;
  const umbGroup = new THREE.Group();
  umbGroup.position.set(umbX, 0, umbZ);
  const stoneTable = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.95, 0.78, 12), mats.stoneMedallion);
  stoneTable.position.y = 0.39;
  stoneTable.castShadow = true;
  umbGroup.add(stoneTable);
  for (let i = 0; i < 3; i++) {
    const a = i * (Math.PI * 2 / 3) + 0.4;
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.45, 10), mats.stoneBase);
    stool.position.set(Math.cos(a) * 1.75, 0.225, Math.sin(a) * 1.75);
    umbGroup.add(stool);
  }
  const umbPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.4, 8), mats.darkWood);
  umbPole.position.set(-0.6, 1.7, -0.4);
  umbPole.rotation.z = -0.10;
  const umbCanopy = new THREE.Mesh(new THREE.ConeGeometry(2.65, 0.75, 12), mats.bannerGold);
  umbCanopy.position.set(-0.4, 3.25, -0.4);
  umbCanopy.rotation.z = -0.10;
  umbCanopy.castShadow = true;
  umbGroup.add(umbPole, umbCanopy);
  guGroup.add(umbGroup);
  colliders.push({ minX: umbX - 1.3, maxX: umbX + 1.3, minZ: umbZ - 1.3, maxZ: umbZ + 1.3, minY: 0, maxY: 3.5 });

  // (g) 谢景棠一剑劈翻的竹提食盒与散落柑橘 (EP10 @ 38:54 细节彩蛋)
  const basketGroup = new THREE.Group();
  basketGroup.position.set(gx - 2.6, 0.08, 115.2);
  for (const [bx, bz, rot] of [[0, 0, 0.3], [-0.55, 0.35, 1.1], [0.48, -0.28, -0.7]]) {
    const tier = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 10), mats.redWood);
    tier.position.set(bx, 0.08, bz);
    tier.rotation.z = rot * 0.3;
    basketGroup.add(tier);
  }
  for (const [ox, oz] of [[0.2, 0.35], [-0.25, -0.2], [0.65, 0.15], [-0.4, 0.6], [0.1, -0.45]]) {
    const orange = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 6), mats.goldLantern);
    orange.position.set(ox, 0.06, oz);
    basketGroup.add(orange);
  }
  guGroup.add(basketGroup);

  // (h) 院内苍翠松柏与青瓷盆栽 (分列东西两侧，留出中央宽阔比武庭院)
  for (const [tx, tz, sc] of [
    [gx - 18.5, 118, 1.05], [gx + 18.5, 118, 1.15],
    [gx - 19.5, 101, 0.95], [gx + 19.5, 101, 1.10]
  ]) {
    const tree = new THREE.Group();
    tree.position.set(tx, 0, tz);
    const trk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 2.8, 7), mats.darkWood);
    trk.position.y = 1.4;
    tree.add(trk);
    for (const [ox, oy, oz, r] of [[0, 3.6, 0, 2.1], [-1.0, 2.9, 0.6, 1.5], [1.0, 3.1, -0.5, 1.6]]) {
      const cr = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), mats.pineGreen);
      cr.position.set(ox, oy, oz);
      cr.castShadow = true;
      tree.add(cr);
    }
    guGroup.add(tree);
  }

  // (i) 北侧正堂【篤行致遠】大堂 (x=58..98, z=83.5..95)，中央敞厅 (x=72.4..83.6) 可直接步入
  const hallW = 40;
  const hallD = 11.5;
  const hallOpenHalf = 5.6;

  // 正堂浅石阶台基（高 0.16m，保证角色与 Boss 无障碍平顺进出）
  const hallPlinth = new THREE.Mesh(new THREE.BoxGeometry(hallW + 2.4, 0.16, hallD + 2.2), mats.stoneBase);
  hallPlinth.position.set(gx, 0.08, hallZ);
  hallPlinth.receiveShadow = true;
  guGroup.add(hallPlinth);

  // 左右两侧厢房实体与格扇窗
  const hallWingW = (hallW - hallOpenHalf * 2) * 0.5; // 14.4m
  for (const side of [-1, 1]) {
    const wCx = gx + side * (hallOpenHalf + hallWingW * 0.5);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(hallWingW, 5.4, hallD), mats.facadeB);
    wing.position.set(wCx, 2.7, hallZ);
    wing.castShadow = true;
    wing.receiveShadow = true;
    guGroup.add(wing);

    colliders.push({
      minX: wCx - hallWingW * 0.5, maxX: wCx + hallWingW * 0.5,
      minZ: hallZ - hallD * 0.5, maxZ: hallZ + hallD * 0.5,
      minY: 0, maxY: 8.5
    });
  }

  // 正堂后墙（北壁）与顶部额墙
  const hallBackWall = new THREE.Mesh(new THREE.BoxGeometry(hallOpenHalf * 2 + 0.6, 5.4, 0.9), mats.facadeA);
  hallBackWall.position.set(gx, 2.7, hallZ - hallD * 0.5 + 0.45);
  guGroup.add(hallBackWall);
  colliders.push({
    minX: gx - hallOpenHalf - 0.5, maxX: gx + hallOpenHalf + 0.5,
    minZ: hallZ - hallD * 0.5 - 0.2, maxZ: hallZ - hallD * 0.5 + 0.9,
    minY: 0, maxY: 8.5
  });

  const hallHeaderWall = new THREE.Mesh(new THREE.BoxGeometry(hallOpenHalf * 2 + 0.4, 1.6, hallD), mats.dengzhouWall);
  hallHeaderWall.position.set(gx, 4.8, hallZ);
  guGroup.add(hallHeaderWall);

  // 正堂前廊双立柱与抱鼓柱础
  for (const side of [-1, 1]) {
    const px = gx + side * hallOpenHalf;
    const pz = hallZ + hallD * 0.5 - 0.2;
    const hCol = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.34, 5.4, 10), mats.darkWood);
    hCol.position.set(px, 2.7, pz);
    hCol.castShadow = true;
    guGroup.add(hCol);

    const hBase = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.56, 0.55, 12), mats.stoneMedallion);
    hBase.position.set(px, 0.28, pz);
    guGroup.add(hBase);
  }

  // 正堂重檐歇山大屋顶
  const hallRoofLower = buildClassicalRoof(hallW + 4.2, hallD + 3.6, 2.4, { goldenTrim: false, eaveCurve: 0.46, topRatio: 0.56 });
  hallRoofLower.position.set(gx, 5.8, hallZ);
  guGroup.add(hallRoofLower);
  const hallRoofUpper = buildClassicalRoof(hallW * 0.72, hallD * 0.78, 2.6, { goldenTrim: true, eaveCurve: 0.52, topRatio: 0.44 });
  hallRoofUpper.position.set(gx, 7.6, hallZ);
  guGroup.add(hallRoofUpper);

  // 「遠致行篤」正堂黑底金字横匾与《道德经》楹联 (EP10 @ 38:49 / EP11 @ 06:40)
  const hallFrontZ = hallZ + hallD * 0.5 + 0.08;
  const hallPlaque = makeHorizontalPlaque('遠 致 行 篤', 4.6, 1.35);
  hallPlaque.position.set(gx, 4.85, hallFrontZ);
  guGroup.add(hallPlaque);

  // 正堂右联（东柱上联）：失道而後德失德而後仁；左联（西柱下联）：失仁而後義失義而後禮
  const hallCoupletR = makeVerticalCouplet('失道而後德失德而後仁', 0.44, 3.2);
  hallCoupletR.position.set(gx + hallOpenHalf, 2.35, hallFrontZ);
  guGroup.add(hallCoupletR);
  const hallCoupletL = makeVerticalCouplet('失仁而後義失義而後禮', 0.44, 3.2);
  hallCoupletL.position.set(gx - hallOpenHalf, 2.35, hallFrontZ);
  guGroup.add(hallCoupletL);

  // 正堂内陈设：顾老爷主座太师椅、中堂屏风与「顾家黑幕账本」案几 (EP11 @ 01:10)
  const desk = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.88, 1.2), mats.redWood);
  desk.position.set(gx, 0.52, hallZ - 2.6);
  guGroup.add(desk);
  const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.45), mats.bannerWhite);
  ledger.position.set(gx + 0.35, 1.0, hallZ - 2.45);
  ledger.rotation.y = 0.22;
  guGroup.add(ledger);
  const hallScreen = new THREE.Mesh(new THREE.BoxGeometry(4.8, 3.2, 0.22), mats.darkWood);
  hallScreen.position.set(gx, 1.75, hallZ - 4.1);
  guGroup.add(hallScreen);

  root.add(guGroup);
  allBlocks.push(
    { minX: GU_MANSION.minX, maxX: GU_MANSION.maxX, minZ: GU_MANSION.minZ, maxZ: GU_MANSION.maxZ, landmark: true },
    { minX: gx - 20, maxX: gx + 20, minZ: hallZ - 5.8, maxZ: hallZ + 5.8, landmark: true }
  );

  // ---------------------------------------------------------------------------
  // 5.6 第 1 集 18:24–24:15【清风楼】（位于登州西南坊 x=-78, z=82..125，与东南坊顾府东西相对）
  //     精确还原：
  //     - 牌楼正门：深褐雕花木匾「樓 風 清」（青绿字）、梁下悬 13 盏竖棱白纸灯笼与两侧立柱各 3 盏竖挂灯笼、
  //       蓝带竹帘、黑底青字抱柱楹联「晴明天氣琉璃色 / 何處峯頭帶雨還」，西侧立「福記茶葉」招幌；
  //     - 门口伙计【东子】：身穿米褐短袖外褂与浅青白长衫、左肩搭白迎客巾，只站在清风楼门口迎客；
  //     - 前院：青石铺地、对称太湖石假山盆池、青石方灯与东西游廊；
  //     - 正北二层重檐酒楼【驚鶴堂】：圆窗格扇门、内悬「堂 鶴 驚」横匾、二楼木雕回廊、中央多层白纱灯笼大吊灯、
  //       东西八仙桌椅与兵器架（三爷与清风楼恶霸盘踞于此）。
  // ---------------------------------------------------------------------------
  const qfGroup = new THREE.Group();
  qfGroup.name = 'QingfengTower';
  const qx = QINGFENG_TOWER.x;         // -78
  const qGateZ = QINGFENG_TOWER.gateZ; // 124.5
  const qHallZ = QINGFENG_TOWER.hallZ; // 89

  // 清风楼专属材质：竖棱白纸灯笼、青绿匾额与竹帘
  const creamLanternMat = new THREE.MeshStandardNodeMaterial({
    color: 0xfff5dc,
    emissive: 0xffd28a,
    emissiveIntensity: 0.78,
    roughness: 0.42
  });
  const bambooBlindMat = new THREE.MeshStandardNodeMaterial({
    color: 0xc8b282,
    roughness: 0.78
  });
  const blindStripeMat = new THREE.MeshStandardNodeMaterial({
    color: 0x5c859e,
    roughness: 0.65
  });
  const taihuRockMat = new THREE.MeshStandardNodeMaterial({
    color: 0x8a9094,
    roughness: 0.82
  });

  // 5.6.1 院落青石地面与中轴迎宾石道
  const qfFloor = new THREE.Mesh(new THREE.BoxGeometry(58, 0.14, 41), roadMat);
  qfFloor.position.set(qx, 0.04, 103.5);
  qfFloor.receiveShadow = true;
  qfGroup.add(qfFloor);

  const qfWalkway = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.16, 36), mats.stoneBase);
  qfWalkway.position.set(qx, 0.06, 112.5);
  qfWalkway.receiveShadow = true;
  qfGroup.add(qfWalkway);

  // 5.6.2 四周院墙与围合碰撞体（南墙中央留出 9.6m 宽清风楼牌楼大门通道）
  const qfWallH = 4.4;
  const qfGateOpenHalf = 4.8; // 中央通道 x ∈ [-82.8, -73.2] 完全畅通
  function addQfWall(x1, z1, x2, z2, hasCollider = true) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const cx = (x1 + x2) * 0.5;
    const cz = (z1 + z2) * 0.5;
    const alongX = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
    const sx = alongX ? len : 0.75;
    const sz = alongX ? 0.75 : len;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, qfWallH, sz), mats.dengzhouWall);
    wall.position.set(cx, qfWallH * 0.5, cz);
    wall.castShadow = true;
    wall.receiveShadow = true;
    qfGroup.add(wall);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.28, 0.36, sz + 0.28), mats.greyTileRoof);
    cap.position.set(cx, qfWallH + 0.16, cz);
    qfGroup.add(cap);

    if (hasCollider) {
      colliders.push({
        minX: cx - sx * 0.5 - 0.15,
        maxX: cx + sx * 0.5 + 0.15,
        minZ: cz - sz * 0.5 - 0.15,
        maxZ: cz + sz * 0.5 + 0.15,
        minY: 0,
        maxY: qfWallH + 1.5
      });
    }
  }

  addQfWall(QINGFENG_TOWER.minX, QINGFENG_TOWER.minZ, QINGFENG_TOWER.maxX, QINGFENG_TOWER.minZ); // 北院墙
  addQfWall(QINGFENG_TOWER.minX, QINGFENG_TOWER.minZ, QINGFENG_TOWER.minX, qGateZ);               // 西院墙
  addQfWall(QINGFENG_TOWER.maxX, QINGFENG_TOWER.minZ, QINGFENG_TOWER.maxX, qGateZ);               // 东院墙
  addQfWall(QINGFENG_TOWER.minX, qGateZ, qx - qfGateOpenHalf, qGateZ);                            // 南墙西段
  addQfWall(qx + qfGateOpenHalf, qGateZ, QINGFENG_TOWER.maxX, qGateZ);                            // 南墙东段

  // 5.6.3 清风楼牌楼正门（EP01 @ 18:24–18:28：四柱三间牌楼式门屋、13 盏竖棱白灯笼、蓝条竹帘與青字横匾楹联）
  const qfGatePillarsX = [-4.6, -3.1, 3.1, 4.6]; // 中央 6.2m 净宽通道完全无阻挡
  for (const dx of qfGatePillarsX) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 5.4, 10), mats.darkWood);
    col.position.set(qx + dx, 2.7, qGateZ);
    col.castShadow = true;
    qfGroup.add(col);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.46, 10), mats.stoneBase);
    base.position.set(qx + dx, 0.23, qGateZ);
    qfGroup.add(base);
  }

  // 牌楼横梁、额枋与飞檐灰瓦屋顶
  const gateBeamLower = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.38, 1.1), mats.darkWood);
  gateBeamLower.position.set(qx, 4.45, qGateZ);
  qfGroup.add(gateBeamLower);

  const gateBeamUpper = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.42, 1.3), mats.redWood);
  gateBeamUpper.position.set(qx, 5.25, qGateZ);
  qfGroup.add(gateBeamUpper);

  const qfGateRoof = buildClassicalRoof(12.2, 4.6, 2.1, { goldenTrim: false, eaveCurve: 0.44, topRatio: 0.56 });
  qfGateRoof.position.set(qx, 6.25, qGateZ);
  qfGroup.add(qfGateRoof);

  // 门楣卷起的竹帘（缀两条浅蓝竖带，高于头顶 y=4.15 不挡视线与通行）
  const gateBlind = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.62, 0.08), bambooBlindMat);
  gateBlind.position.set(qx, 4.08, qGateZ + 0.32);
  qfGroup.add(gateBlind);
  for (const sx of [-1.45, 1.45]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.64, 0.10), blindStripeMat);
    stripe.position.set(qx + sx, 4.08, qGateZ + 0.32);
    qfGroup.add(stripe);
  }

  // 「樓 風 清」深褐底青绿字雕花横匾 (EP01 @ 18:24 frame_0553.jpg)
  const qfPlaqueStyle = { bg: '#221712', border: '#8c6940', fg: '#74cfc6' };
  const qfGatePlaque = makeHorizontalPlaque('樓 風 清', 3.5, 1.18, qfPlaqueStyle);
  qfGatePlaque.position.set(qx, 5.05, qGateZ + 0.58);
  qfGroup.add(qfGatePlaque);

  // 抱柱黑底青绿字楹联（右柱上联：晴明天氣琉璃色；左柱下联：何處峯頭帶雨還）
  const qfCoupletR = makeVerticalCouplet('晴明天氣琉璃色', 0.38, 2.85, qfPlaqueStyle);
  qfCoupletR.position.set(qx + 3.1, 2.25, qGateZ + 0.34);
  qfGroup.add(qfCoupletR);
  const qfCoupletL = makeVerticalCouplet('何處峯頭帶雨還', 0.38, 2.85, qfPlaqueStyle);
  qfCoupletL.position.set(qx - 3.1, 2.25, qGateZ + 0.34);
  qfGroup.add(qfCoupletL);

  // 门梁下横排 13 盏竖棱白纸灯笼 + 两侧外柱各 3 盏竖挂灯笼 (EP01 @ 18:24 frame_0553.jpg)
  const qfLanternGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.46, 10);
  const qfCapGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.06, 10);
  function addRibbedLantern(lx, ly, lz) {
    const lg = new THREE.Group();
    lg.position.set(lx, ly, lz);
    const body = new THREE.Mesh(qfLanternGeo, creamLanternMat);
    lg.add(body);
    const topCap = new THREE.Mesh(qfCapGeo, mats.darkWood);
    topCap.position.y = 0.24;
    lg.add(topCap);
    const botCap = new THREE.Mesh(qfCapGeo, mats.darkWood);
    botCap.position.y = -0.24;
    lg.add(botCap);
    qfGroup.add(lg);
  }
  for (let i = 0; i < 13; i++) {
    const lx = qx - 3.9 + i * 0.65;
    addRibbedLantern(lx, 4.16, qGateZ + 0.52);
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      addRibbedLantern(qx + side * 4.6, 3.45 - k * 0.62, qGateZ + 0.42);
    }
  }

  // 门外西侧「福記茶葉」立式木牌招幌 (EP01 @ 18:24 frame_0553.jpg)
  const teaStand = new THREE.Group();
  teaStand.position.set(qx - 5.8, 0, qGateZ + 1.25);
  const teaPost = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.1, 0.16), mats.darkWood);
  teaPost.position.y = 1.05;
  teaStand.add(teaPost);
  const teaFoot = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.14, 0.55), mats.darkWood);
  teaFoot.position.y = 0.07;
  teaStand.add(teaFoot);
  const teaSign = makeVerticalCouplet('福記茶葉', 0.48, 1.65, { bg: '#2b1d14', border: '#9c7a4c', fg: '#e8d9b5' });
  teaSign.position.set(0, 1.18, 0.08);
  teaStand.add(teaSign);
  qfGroup.add(teaStand);

  // 5.6.4 【东子】—— 只站在清风楼门口迎客 (EP01 @ 18:28 frame_0555.jpg)
  const dongziRig = createLeadCharacter('dongzi');
  dongziRig.group.name = 'qingfeng-gate-dongzi';
  dongziRig.group.position.set(QINGFENG_TOWER.dongziX, 0, QINGFENG_TOWER.dongziZ);
  dongziRig.group.rotation.y = 0; // 面向正南 (+Z) 南顺城街迎客
  dongziRig.pose('idle', 0, 0, 1);
  dongziRig.group.userData = {
    ...dongziRig.group.userData,
    characterId: 'dongzi',
    name: '东子',
    role: '清风楼门前迎客伙计',
    fixedAtQingfengGate: true,
    spawnX: QINGFENG_TOWER.dongziX,
    spawnZ: QINGFENG_TOWER.dongziZ
  };
  qfGroup.add(dongziRig.group);

  // 5.6.5 清风楼前院：对称太湖石假山盆池、青石方灯与东西游廊 (EP01 @ 18:36 / 19:14)
  for (const side of [-1, 1]) {
    const bx = qx + side * 6.8;
    const bz = 110.5;
    const basinRim = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.56, 2.8), mats.stoneBase);
    basinRim.position.set(bx, 0.28, bz);
    basinRim.castShadow = true;
    qfGroup.add(basinRim);

    const basinWater = new THREE.Mesh(
      new THREE.BoxGeometry(3.3, 0.42, 2.3),
      new THREE.MeshStandardNodeMaterial({ color: 0x2c5854, roughness: 0.2, metalness: 0.1 })
    );
    basinWater.position.set(bx, 0.30, bz);
    qfGroup.add(basinWater);

    // 盆内嶙峋太湖石假山叠石
    for (const [rx, ry, rz, sx, sy, sz] of [
      [0, 1.05, 0, 0.85, 1.35, 0.65],
      [-0.65, 0.82, 0.2, 0.58, 0.92, 0.52],
      [0.68, 0.88, -0.18, 0.62, 1.04, 0.54]
    ]) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 1), taihuRockMat);
      rock.position.set(bx + rx, ry, bz + rz);
      rock.scale.set(sx, sy, sz);
      rock.castShadow = true;
      qfGroup.add(rock);
    }

    // 东西抄手游廊与廊下酒桌
    const verX = qx + side * 24.5;
    const verRoof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.42, 28), mats.greyTileRoof);
    verRoof.position.set(verX, 3.65, 106.5);
    qfGroup.add(verRoof);
    for (let vz = 94; vz <= 118; vz += 6) {
      const vCol = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 3.6, 8), mats.darkWood);
      vCol.position.set(verX - side * 1.6, 1.8, vz);
      qfGroup.add(vCol);
      addRibbedLantern(verX - side * 1.6, 3.15, vz);
    }

    // 院道两侧青石方灯
    for (const lz of [103.5, 116.5]) {
      const slX = qx + side * 4.6;
      const slPost = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.45, 0.32), mats.stoneBase);
      slPost.position.set(slX, 0.72, lz);
      qfGroup.add(slPost);
      const slLight = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), creamLanternMat);
      slLight.position.set(slX, 1.62, lz);
      qfGroup.add(slLight);
      const slCap = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.36, 4), mats.greyTileRoof);
      slCap.position.set(slX, 1.98, lz);
      slCap.rotation.y = Math.PI * 0.25;
      qfGroup.add(slCap);
    }
  }

  // 5.6.6 正北二层重檐酒楼正厅【驚鶴堂】(EP01 @ 19:26–22:20 frame_0585.jpg, frame_0672.jpg)
  const qfHallW = 38.0;
  const qfHallD = 13.0;
  const qfHallOpenHalf = 6.2; // 正门中央 12.4m 敞开式格扇门大入口

  // 台基与前阶（高度平缓，不阻挡步行进出）
  const qfPlinth = new THREE.Mesh(new THREE.BoxGeometry(qfHallW + 1.8, 0.24, qfHallD + 1.6), mats.stoneBase);
  qfPlinth.position.set(qx, 0.12, qHallZ);
  qfPlinth.receiveShadow = true;
  qfGroup.add(qfPlinth);

  // 正厅后墙与东西山墙（注册实体碰撞）
  const qfBackWall = new THREE.Mesh(new THREE.BoxGeometry(qfHallW, 8.6, 0.8), mats.dengzhouWall);
  qfBackWall.position.set(qx, 4.3, qHallZ - qfHallD * 0.5 + 0.4);
  qfBackWall.castShadow = true;
  qfGroup.add(qfBackWall);
  colliders.push({
    minX: qx - qfHallW * 0.5, maxX: qx + qfHallW * 0.5,
    minZ: qHallZ - qfHallD * 0.5 - 0.2, maxZ: qHallZ - qfHallD * 0.5 + 0.9,
    minY: 0, maxY: 9.0
  });

  for (const side of [-1, 1]) {
    const swX = qx + side * (qfHallW * 0.5 - 0.4);
    const sideWall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.6, qfHallD), mats.dengzhouWall);
    sideWall.position.set(swX, 4.3, qHallZ);
    sideWall.castShadow = true;
    qfGroup.add(sideWall);
    colliders.push({
      minX: swX - 0.55, maxX: swX + 0.55,
      minZ: qHallZ - qfHallD * 0.5, maxZ: qHallZ + qfHallD * 0.5,
      minY: 0, maxY: 9.0
    });

    // 南立面左右两翼木格扇墙（含圆窗洞装饰，留出中央 12.4m 大敞口）
    const wingW = (qfHallW - qfHallOpenHalf * 2) * 0.5;
    const wingX = qx + side * (qfHallOpenHalf + wingW * 0.5);
    const frontZ = qHallZ + qfHallD * 0.5 - 0.35;
    const frontWing = new THREE.Mesh(new THREE.BoxGeometry(wingW, 8.2, 0.55), mats.darkWood);
    frontWing.position.set(wingX, 4.1, frontZ);
    frontWing.castShadow = true;
    qfGroup.add(frontWing);

    // 格扇圆窗外圈铜环装饰 (frame_0585.jpg)
    const roundWin = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.08, 8, 20), mats.goldAccent);
    roundWin.position.set(wingX, 2.35, frontZ + 0.3);
    qfGroup.add(roundWin);

    colliders.push({
      minX: wingX - wingW * 0.5, maxX: wingX + wingW * 0.5,
      minZ: frontZ - 0.4, maxZ: frontZ + 0.4,
      minY: 0, maxY: 8.5
    });
  }

  // 二楼外立面横额与二楼内部回廊围栏（谢景棠在二楼俯瞰大堂处）
  const qfUpperFascia = new THREE.Mesh(new THREE.BoxGeometry(qfHallOpenHalf * 2 + 0.6, 1.4, 0.6), mats.darkWood);
  qfUpperFascia.position.set(qx, 5.2, qHallZ + qfHallD * 0.5 - 0.35);
  qfGroup.add(qfUpperFascia);

  // 二楼内部回廊木平台与雕花栏杆（高 y=4.6，不阻碍一楼战斗）
  const balconyBack = new THREE.Mesh(new THREE.BoxGeometry(qfHallW - 1.6, 0.26, 3.2), mats.darkWood);
  balconyBack.position.set(qx, 4.6, qHallZ - qfHallD * 0.5 + 2.0);
  qfGroup.add(balconyBack);
  const balconyRail = new THREE.Mesh(new THREE.BoxGeometry(qfHallW - 2.0, 0.95, 0.16), mats.redWood);
  balconyRail.position.set(qx, 5.15, qHallZ - qfHallD * 0.5 + 3.5);
  qfGroup.add(balconyRail);

  // 正厅重檐歇山大屋顶
  const qfRoofLower = buildClassicalRoof(qfHallW + 4.4, qfHallD + 3.8, 2.5, { goldenTrim: false, eaveCurve: 0.48, topRatio: 0.58 });
  qfRoofLower.position.set(qx, 5.8, qHallZ);
  qfGroup.add(qfRoofLower);
  const qfRoofUpper = buildClassicalRoof(qfHallW * 0.76, qfHallD * 0.80, 2.7, { goldenTrim: true, eaveCurve: 0.54, topRatio: 0.46 });
  qfRoofUpper.position.set(qx, 8.2, qHallZ);
  qfGroup.add(qfRoofUpper);

  // 正厅门楣与堂内「堂 鶴 驚」横匾 (EP01 @ 22:24 frame_0672.jpg)
  const qfHallFrontZ = qHallZ + qfHallD * 0.5 + 0.12;
  const jingheOuterPlaque = makeHorizontalPlaque('堂 鶴 驚', 4.6, 1.32);
  jingheOuterPlaque.position.set(qx, 5.15, qfHallFrontZ);
  qfGroup.add(jingheOuterPlaque);

  const jingheInnerPlaque = makeHorizontalPlaque('堂 鶴 驚', 4.8, 1.38);
  jingheInnerPlaque.position.set(qx, 5.65, qHallZ - qfHallD * 0.5 + 0.95);
  qfGroup.add(jingheInnerPlaque);

  // 大堂中央多层白纱灯笼大吊灯 (EP01 @ 19:28 frame_0585.jpg)
  const chandelier = new THREE.Group();
  chandelier.position.set(qx, 6.35, qHallZ);
  const chanRod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), mats.darkWood);
  chanRod.position.y = 0.8;
  chandelier.add(chanRod);
  for (const [tierY, radius, count] of [[0.55, 1.65, 8], [-0.15, 1.15, 6], [-0.75, 0.55, 4]]) {
    const ringFrame = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.05, 8, 24), mats.goldAccent);
    ringFrame.rotation.x = Math.PI * 0.5;
    ringFrame.position.y = tierY;
    chandelier.add(ringFrame);
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      const lamp = new THREE.Mesh(qfLanternGeo, creamLanternMat);
      lamp.position.set(Math.cos(a) * radius, tierY - 0.25, Math.sin(a) * radius);
      chandelier.add(lamp);
    }
  }
  qfGroup.add(chandelier);

  // 堂内东西两翼八仙酒桌、长条凳、酒坛与西侧兵器架（中央留出宽敞打斗区供三爷与恶霸交手）
  for (const side of [-1, 1]) {
    for (const [dx, dz] of [[8.8, -1.8], [8.8, 2.4], [13.6, 0.2]]) {
      const tx = qx + side * dx;
      const tz = qHallZ + dz;
      const table = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.82, 1.65), mats.redWood);
      table.position.set(tx, 0.52, tz);
      table.castShadow = true;
      qfGroup.add(table);

      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.36, 8), mats.darkWood);
      jar.position.set(tx - 0.25, 1.1, tz + 0.15);
      qfGroup.add(jar);

      for (const bSide of [-1, 1]) {
        const bench = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.46, 0.36), mats.darkWood);
        bench.position.set(tx, 0.34, tz + bSide * 1.12);
        qfGroup.add(bench);
      }
    }
  }

  // 堂内西壁木制兵器架 (EP01 @ 19:28 frame_0585.jpg)
  const weaponRack = new THREE.Group();
  weaponRack.position.set(qx - 16.2, 0.2, qHallZ - 3.6);
  const rackFrame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.85, 0.45), mats.darkWood);
  rackFrame.position.y = 0.92;
  weaponRack.add(rackFrame);
  for (let s = -2; s <= 2; s++) {
    const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 2.6, 6), mats.redWood);
    spear.position.set(s * 0.38, 1.3, 0);
    weaponRack.add(spear);
  }
  qfGroup.add(weaponRack);

  root.add(qfGroup);
  allBlocks.push(
    { minX: QINGFENG_TOWER.minX, maxX: QINGFENG_TOWER.maxX, minZ: QINGFENG_TOWER.minZ, maxZ: QINGFENG_TOWER.maxZ, landmark: true },
    { minX: qx - 19, maxX: qx + 19, minZ: qHallZ - 6.5, maxZ: qHallZ + 6.5, landmark: true }
  );

  // ---------------------------------------------------------------------------
  // 6. 街头细节：跨街红白灯笼串(ep01_08/ep01_10)、酒旗招幌(“酒”、“大德”)、天幕绸带与桃花树
  // ---------------------------------------------------------------------------
  const streetDecorGroup = new THREE.Group();

  // 6.1 跨街灯笼串与红金绸带天幕
  const lanternGeo = new THREE.CylinderGeometry(0.32, 0.28, 0.72, 8);
  const ribbonGeo = new THREE.PlaneGeometry(18, 1.35);
  ribbonGeo.rotateX(Math.PI * 0.46);

  // 朱雀长街跨街灯笼串 (z = 40..145)
  let rowIdx = 0;
  for (let z = 44; z <= 144; z += 14, rowIdx++) {
    let colIdx = 0;
    for (let x = -11; x <= 11; x += 2.75, colIdx++) {
      const isRed = (rowIdx + colIdx) % 3 !== 0;
      const sag = -Math.cos((x / 12) * Math.PI * 0.5) * 1.1;
      const l = new THREE.Mesh(lanternGeo, isRed ? mats.redLantern : mats.whiteLantern);
      l.position.set(x, 8.6 + sag, z);
      streetDecorGroup.add(l);
    }
  }

  // 桃花红灯闹市跨街红灯笼与绸布天幕 (x = 28..108, z = 56) (复刻 ep01_10)
  for (let x = 30; x <= 106; x += 9) {
    const canopy = new THREE.Mesh(ribbonGeo, x % 18 === 0 ? mats.canopyRed : mats.bannerGold);
    canopy.rotation.z = Math.PI * 0.5;
    canopy.position.set(x, 8.8, 56);
    streetDecorGroup.add(canopy);

    for (let zOff = -8; zOff <= 8; zOff += 2.6) {
      const sag = -Math.cos((zOff / 9) * Math.PI * 0.5) * 0.85;
      const l = new THREE.Mesh(lanternGeo, mats.redLantern);
      l.position.set(x, 7.8 + sag, 56 + zOff);
      streetDecorGroup.add(l);
    }
  }

  // 6.2 酒肆招幌旗杆与竖幅幌子 (复刻 ep01_08 “大德” 与 ep01_10 “酒” 字招幌)
  const bannerPositions = [
    [-11.5, 108, false], [11.5, 88, true],
    [32, 62, true],      [62, 62, true],
    [32, 49, false],     [84, 62, true]
  ];
  for (const [bx, bz, isWine] of bannerPositions) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 7.5, 6), mats.darkWood);
    pole.position.set(bx, 3.75, bz);
    streetDecorGroup.add(pole);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), mats.darkWood);
    arm.position.set(bx + (bx < 0 ? 1.0 : -1.0), 7.1, bz);
    streetDecorGroup.add(arm);

    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 3.8),
      isWine ? mats.bannerGold : mats.bannerWhite
    );
    banner.position.set(bx + (bx < 0 ? 1.0 : -1.0), 5.0, bz);
    streetDecorGroup.add(banner);
  }

  // 6.3 桃花树群（粉色繁花树冠，点缀东市桃花街与朱雀街角 ep01_10）
  const blossomCoords = [
    [35, 62], [55, 62], [78, 62], [48, 49], [88, 49],
    [-12, 130], [12, 62], [-34, 62], [34, 18], [-34, 18]
  ];
  const trunkGeo = new THREE.CylinderGeometry(0.24, 0.38, 3.4, 7);
  const crownGeo = new THREE.DodecahedronGeometry(2.4, 1);

  for (const [tx, tz] of blossomCoords) {
    const tree = new THREE.Group();
    tree.position.set(tx, 0, tz);

    const trunk = new THREE.Mesh(trunkGeo, mats.darkWood);
    trunk.position.y = 1.7;
    trunk.castShadow = true;
    tree.add(trunk);

    for (const [ox, oy, oz, sc] of [[0, 4.0, 0, 1.15], [-1.3, 3.4, 0.8, 0.85], [1.2, 3.5, -0.7, 0.9]]) {
      const crown = new THREE.Mesh(crownGeo, mats.blossomPink);
      crown.position.set(ox, oy, oz);
      crown.scale.setScalar(sc);
      crown.castShadow = true;
      tree.add(crown);
    }
    streetDecorGroup.add(tree);
  }
  root.add(streetDecorGroup);

  // ---------------------------------------------------------------------------
  // 7. 盆地、远山与城内【鳳山·萬松嶺·寶月山】苍翠松柏林 (InstancedMesh 1660 棵)
  // ---------------------------------------------------------------------------
  const innerHillPines = [
    [-102, -138], [-122, -142], [-126, -120], [-98, -118], [-134, -128],
    [-152, -144], [-150, -126], [-136, -148], [-118, -108], [-146, -116],
    [-148, -36],  [-144, -16],  [-152, -26],  [-146, -64],  [-148, 16],  [-144, 28]
  ];
  const treeCount = 1600 + innerHillPines.length;
  const pineGeo = new THREE.ConeGeometry(3.2, 9.5, 6);
  pineGeo.translate(0, 4.75, 0);
  const pineInstanced = new THREE.InstancedMesh(pineGeo, mats.pineGreen, treeCount);
  pineInstanced.castShadow = true;
  pineInstanced.receiveShadow = true;

  const dummy = new THREE.Object3D();
  let placed = 0;

  // 先在城内西北【鳳山·萬松嶺】与城西【寶月山】山坡栽种古松（呼应《登州城之圖》山顶松林）
  for (let i = 0; i < innerHillPines.length; i++) {
    const [px, pz] = innerHillPines[i];
    const py = getTerrainHeight(px, pz);
    const sc = 0.72 + (i % 4) * 0.14;
    dummy.position.set(px, py - 0.25, pz);
    dummy.rotation.y = i * 0.75;
    dummy.scale.set(sc, sc * 0.95, sc);
    dummy.updateMatrix();
    pineInstanced.setMatrixAt(placed++, dummy.matrix);
  }

  let attempt = 0;
  while (placed < treeCount && attempt < 9000) {
    attempt++;
    const rx = (valueNoise2D(attempt * 1.13, 0.7) - 0.5) * 1160;
    const rz = (valueNoise2D(0.3, attempt * 1.79) - 0.5) * 1160;

    // 避开城池内部、南门官道走廊及北山登云栈道
    if (Math.abs(rx) < 205 && Math.abs(rz) < 205) continue;
    if (Math.abs(rx) < 24 && rz > -235 && rz < 285) continue;
    // 百里府平谷与官道上不长松树（府内的树在 baili-mansion.js 里）
    if (bailiFlatten(rx, rz) > 0.9) continue;

    const ty = getTerrainHeight(rx, rz);
    if (ty < -0.1 || ty > 155) continue;

    const scale = 0.65 + valueNoise2D(rx * 0.1, rz * 0.1) * 0.95;
    dummy.position.set(rx, ty - 0.3, rz);
    dummy.rotation.y = (attempt % 12) * 0.52;
    dummy.scale.set(scale, scale * (0.85 + (attempt % 5) * 0.1), scale);
    dummy.updateMatrix();
    pineInstanced.setMatrixAt(placed++, dummy.matrix);
  }
  pineInstanced.count = placed;
  pineInstanced.instanceMatrix.needsUpdate = true;
  root.add(pineInstanced);

  scene.add(root);
  return {
    root,
    colliders,
    allBlocks,
    dongzi: dongziRig,
    update(elapsed = 0) {
      // 东子只站在清风楼门口迎客，始终保持原位与待机迎客姿态
      dongziRig.group.position.set(QINGFENG_TOWER.dongziX, 0, QINGFENG_TOWER.dongziZ);
      dongziRig.group.rotation.set(0, 0, 0);
      dongziRig.pose('idle', elapsed, 0, 1 / 60);
    }
  };
}
