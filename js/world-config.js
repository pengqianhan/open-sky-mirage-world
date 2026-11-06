// js/world-config.js
// 《海市蜃楼》世界空间布局、地形高度场、登州城街区、空中蜃景坐标与登云铁索悬链线配置

import { isHomeworld, worldHomeHeight, homeLocationInfo, HOME, DECK, PAST } from './homeworld-config.js';
import { BAILI, bailiFlatten, bailiHeight, bailiLocationInfo } from './baili-config.js';

export const DENGZHOU_BOUNDS = {
  minX: -170,
  maxX: 170,
  minZ: -170,
  maxZ: 170,
  wallHeight: 13.5,
  wallThickness: 7.0
};

// 第 10–11 集【顾府】（顾廷美与顾老爷宅第，位于登州城东南坊，正门南向临南顺城街）
export const GU_MANSION = {
  x: 78,
  z: 104,
  minX: 48,
  maxX: 108,
  minZ: 82,
  maxZ: 125,
  gateZ: 124.5,
  hallZ: 89
};
export const inGuMansion = (x, z) => x >= GU_MANSION.minX && x <= GU_MANSION.maxX && z >= GU_MANSION.minZ && z <= GU_MANSION.maxZ + 4;

// 第 1 集 18:24–24:15【清风楼】（位于登州城西南坊，正门南向临南顺城街，与东南坊顾府东西相对：
// 牌楼门悬「清風樓」横匾与十三盏竖棱纸灯笼，伙计【东子】只站在门口迎客；内设太湖石假山池院落与正北二层酒楼【驚鶴堂】）
export const QINGFENG_TOWER = {
  x: -78,
  z: 104,
  minX: -108,
  maxX: -48,
  minZ: 82,
  maxZ: 125,
  gateZ: 124.5,
  hallZ: 89,
  dongziX: -73.7,
  dongziZ: 125.65
};
export const inQingfengTower = (x, z) => x >= QINGFENG_TOWER.minX && x <= QINGFENG_TOWER.maxX && z >= QINGFENG_TOWER.minZ && z <= QINGFENG_TOWER.maxZ + 4;

export const MIRAGE_CONFIG = {
  centerX: 0,
  baseY: 240,       // 蜃景城内石板广场海拔高度 (m)
  centerZ: -380,    // 位于登州城北偏上空，从南城门与长街北望正好高悬天际
  radiusX: 105,     // 浮空城横向半径
  radiusZ: 92,      // 浮空城纵向半径
  wallHalfX: 82,    // 蜃景外城墙半宽
  wallHalfZ: 72,    // 蜃景外城墙半深
  gateZ: -308,      // 蜃景南天门 Z 坐标 (-380 + 72)
  rockDepth: 78     // 倒锥形浮空岩岛向下延伸深度
};

// 登云铁索（连接登州城北【登云崖·神机飞爪台】与【空中蜃景·南天城门】）
export const IRON_CHAIN_CONFIG = {
  start: { x: 0, y: 62.5, z: -208 },   // 登州北山登云崖飞爪台锚点
  end:   { x: 0, y: 241.0, z: -306 },  // 空中蜃景南城门前悬崖锚点
  sag: 14.0,                           // 悬链线自然垂度 (m)
  linkCount: 280                       // 巨型玄铁锁环数量
};

/**
 * 自动上索的两处：走进这里就挂上铁索，W 总是朝「另一头」走。
 * 下端在飞爪台石台脚下（石台本身是实心的，走不进去）；上端是城门洞里飞爪钉住的地方。
 */
export const CHAIN_ZONES = [
  { id: 'low', minX: -11, maxX: 11, minZ: -219, maxZ: -197, minY: 35, maxY: 75, t: .02, dir: 1, exit: { x: 0, z: -195.5, heading: 0, y: 40 }, say: '挂上铁索 · 按住 W 攀向蜃景' },
  { id: 'high', minX: -10, maxX: 10, minZ: -308, maxZ: -304, minY: 235, maxY: 248, t: .98, dir: -1, exit: { x: 0, z: -311, heading: Math.PI, y: 240.2 }, say: '挂上铁索 · 按住 W 滑回登州' }
];
export const chainZoneAt = (x, y, z) => CHAIN_ZONES.find((c) => x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && y >= c.minY && y <= c.maxY) || null;

/**
 * 计算铁索参数曲线上的点 t ∈ [0, 1]
 */
export function getChainPoint(t, elapsed = 0) {
  const u = Math.max(0, Math.min(1, t));
  const { start, end, sag } = IRON_CHAIN_CONFIG;
  const xBase = start.x + (end.x - start.x) * u;
  const yBase = start.y + (end.y - start.y) * u;
  const zBase = start.z + (end.z - start.z) * u;

  // 抛物线近似悬链线垂度 + 高空风吹微幅摆动
  const catenary = -4.0 * sag * u * (1.0 - u);
  const windSwayX = elapsed > 0 ? Math.sin(u * Math.PI) * Math.sin(elapsed * 1.6 + u * 5.0) * 0.45 : 0;
  const windSwayY = elapsed > 0 ? Math.sin(u * Math.PI) * Math.cos(elapsed * 2.1 + u * 3.5) * 0.22 : 0;

  return {
    x: xBase + windSwayX,
    y: yBase + catenary + windSwayY,
    z: zBase
  };
}

/**
 * 计算铁索在 t 处的单位切向量（朝向蜃景方向）
 */
export function getChainTangent(t) {
  const eps = 0.002;
  const p0 = getChainPoint(Math.max(0, t - eps));
  const p1 = getChainPoint(Math.min(1, t + eps));
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dz = p1.z - p0.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / len, y: dy / len, z: dz / len };
}

/**
 * 将任意三维坐标投影到铁索上，返回最近的参数 t 与距离
 */
export function projectOntoChain(x, y, z) {
  let bestT = 0;
  let bestDistSq = Infinity;
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = getChainPoint(t);
    const dSq = (x - p.x) ** 2 + (y - p.y) ** 2 + (z - p.z) ** 2;
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestT = t;
    }
  }
  return { t: bestT, distance: Math.sqrt(bestDistSq), point: getChainPoint(bestT) };
}

/**
 * 确定性 2D 伪随机噪声函数（用于群山与盆地地形生成）
 */
function fract(v) {
  return v - Math.floor(v);
}

function hash2(x, z) {
  return fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453123);
}

export function valueNoise2D(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm2D(x, z, octaves = 4) {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    val += amp * valueNoise2D(x * freq, z * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return val;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * 第二集 (EP02 @ 38:45) 道具屏风《登州城之圖》（底图源自南宋《咸淳临安志·京城图》）
 * 城内山川、穿城河渠、名井古桥、官署坊巷与「引水淹城」朱笔暗渠管网数据
 */
export const DENGZHOU_MAP_FEATURES = {
  hills: [
    { id: 'fengshan', name: '鳳山 · 八蟠嶺', x: -112, z: -130, rx: 28, rz: 21, height: 14.5 },
    { id: 'wansongling', name: '萬松嶺', x: -144, z: -136, rx: 18, rz: 16, height: 11.0 },
    { id: 'yueyan', name: '月岩', x: -138, z: -108, rx: 11, rz: 9, height: 6.2 },
    { id: 'baoyueshan', name: '寶月山', x: -146, z: -26, rx: 13, rz: 22, height: 6.0 },
    { id: 'qibaoshan', name: '七寶山', x: -145, z: -60, rx: 12, rz: 14, height: 5.2 },
    { id: 'shifoshan', name: '石佛山', x: -146, z: 20, rx: 12, rz: 16, height: 4.8 }
  ],
  canals: [
    // 清湖河（西北山麓引水横渠 z = -94，折向东侧纵渠 x = 138 穿南垣水门入大江）
    { id: 'qinghu_north', name: '清湖河 (北渠)', points: [[-104, -94], [138, -94]], width: 5.2 },
    { id: 'qinghu_east', name: '清湖河 (东渠)', points: [[138, -94], [138, 195]], width: 5.6 }
  ],
  bridges: [
    { id: 'dashiqiao', name: '大石橋', x: -68, z: -94, rotY: Math.PI * 0.5 },
    { id: 'sanshengqiao', name: '三聖橋', x: 138, z: -68, rotY: 0 },
    { id: 'wangxianqiao', name: '望仙橋', x: 138, z: 0, rotY: 0 },
    { id: 'heijinqiao', name: '黑津橋', x: 138, z: 56, rotY: 0 },
    { id: 'shuimenqiao', name: '水門橋', x: 138, z: 132, rotY: 0 }
  ],
  wells: [
    { id: 'xiangguojing', name: '相國井', x: -34, z: -60, eyes: 1, hasPavilion: true },
    { id: 'bayanjing', name: '八眼井', x: -106, z: -24, eyes: 8, hasPavilion: false },
    { id: 'sijing', name: '四井', x: -104, z: -80, eyes: 4, hasPavilion: false }
  ],
  gates: [
    { id: 'chaotianmen', name: '朝天門', x: 0, z: -42 },
    { id: 'shuimen', name: '水門 (保安水门)', x: 138, z: 170 },
    { id: 'xiaoyanmen', name: '小堰門', x: -170, z: 112 }
  ],
  redNodes: [
    { id: 'node_xiangguo', name: '相国井·引水总枢', sub: 'EP02 朱笔红点 · 清湖河与相国井交汇水源口', x: -34, z: -68 },
    { id: 'node_fuzhi', name: '府治前街·北枢水闸', sub: 'EP02 朱笔红点 · 登州府治正门十字暗渠闸', x: 0, z: -68 },
    { id: 'node_chaotian', name: '朝天门·御街水闸', sub: 'EP02 朱笔红点 · 御街朝天门折角中枢闸', x: 0, z: -42 },
    { id: 'node_taijian', name: '臺諫坊·西街水闸', sub: 'EP02 朱笔红点 · 臺諫公廨东侧十字暗渠闸', x: -34, z: -16 },
    { id: 'node_gulou_east', name: '鼓楼东街·中枢水闸', sub: 'EP02 朱笔红点 · 东西大街东侧十字总闸', x: 34, z: 0 },
    { id: 'node_taohua', name: '桃花坊·东市水闸', sub: 'EP02 朱笔红点 · 桃花酒肆街口并排大闸', x: 34, z: 56 },
    { id: 'node_shuimen', name: '镇海门内·大江引水总闸', sub: 'EP02 朱笔红点 · 连通城外大江与城内暗渠主干', x: 0, z: 132 }
  ],
  redLines: [
    // 1. 大江穿墙入城主干暗渠（底部最粗红线：大江 -> 南门 -> 御街 -> 桃花坊 -> 鼓楼东 -> 朝天门 -> 府治）
    { main: true, points: [[0, 204], [0, 170], [0, 132], [0, 76], [34, 56], [34, 0], [0, -18], [0, -42], [0, -68], [0, -100]] },
    // 2. 水门入城支线与西坊环线（水门 -> 南顺城街 -> 西坊 -> 臺諫 -> 相国井 -> 府治）
    { main: false, points: [[138, 198], [138, 170], [138, 132], [0, 132], [-34, 132], [-34, 56], [-34, -16], [-34, -68], [0, -68]] },
    // 3. 凤山与清湖河山水引流线（凤山八蟠岭 -> 四井 -> 清湖河 -> 相国井 -> 三圣桥 -> 黑津桥 -> 桃花坊）
    { main: false, points: [[-112, -124], [-104, -94], [-34, -94], [-34, -68], [34, -68], [138, -68], [138, 56], [34, 56]] },
    // 4. 宝月山与八眼井西支线（八眼井 -> 臺諫西街闸 -> 鼓楼 -> 望仙桥）
    { main: false, points: [[-106, -24], [-34, -16], [0, 0], [34, 0], [138, 0]] },
    // 5. 东西坊市漫灌支线
    { main: false, points: [[-122, 56], [-34, 56], [34, 56], [100, 56]] },
    { main: false, points: [[-85, -16], [-34, -16]] }
  ],
  wardLabels: [
    { text: '萬松嶺', x: -146, z: -144, kind: 'hill' },
    { text: '八蟠嶺', x: -86, z: -115, kind: 'hill' },
    { text: '月岩', x: -138, z: -106, kind: 'hill' },
    { text: '七寶山', x: -146, z: -60, kind: 'hill' },
    { text: '寶月山', x: -148, z: -26, kind: 'hill' },
    { text: '石佛山', x: -148, z: 20, kind: 'hill' },
    { text: '府治', x: 26, z: -112, kind: 'box' },
    { text: '臺諫', x: -56, z: -52, kind: 'box' },
    { text: '相國井', x: -34, z: -60, kind: 'box' },
    { text: '朝天門', x: 24, z: -42, kind: 'box' },
    { text: '顧府', x: 78, z: 104, kind: 'box' },
    { text: '清風樓', x: -78, z: 104, kind: 'box' },
    { text: '白馬院', x: -92, z: -52, kind: 'ward' },
    { text: '黑津巷', x: 92, z: 26, kind: 'ward' },
    { text: '四井', x: -104, z: -70, kind: 'well' },
    { text: '釣臺', x: -88, z: -83, kind: 'water' },
    { text: '清湖河', x: 56, z: -101, kind: 'water' },
    { text: '清湖河', x: 151, z: -28, kind: 'water' },
    { text: '大石橋', x: -64, z: -103, kind: 'bridge' },
    { text: '望仙橋', x: 118, z: -7, kind: 'bridge' },
    { text: '黑津橋', x: 118, z: 64, kind: 'bridge' },
    { text: '小堰頭', x: -202, z: 146, kind: 'outer' },
    { text: '包家山', x: -206, z: 108, kind: 'hill' },
    { text: '大江', x: 58, z: 197, kind: 'water' },
    { text: '大江', x: -62, z: 197, kind: 'water' }
  ]
};

/**
 * 计算城内西北【鳳山·八蟠嶺·萬松嶺】与城西【寶月山·石佛山】的局部地形高度
 */
export function getInnerCityHillHeight(x, z) {
  if (Math.abs(x) > 166 || Math.abs(z) > 166) return 0;
  let h = 0;
  // 仅在西北内山区域 (x < -74, z < -98) 与西垣山岗区 (x < -130, z ∈ [-78, 42]) 隆起，完全避开街道与建筑
  if (x < -72 && z < -96) {
    for (const hill of DENGZHOU_MAP_FEATURES.hills) {
      if (hill.z > -90) continue;
      const dx = (x - hill.x) / hill.rx;
      const dz = (z - hill.z) / hill.rz;
      const d = Math.hypot(dx, dz);
      if (d < 1.25) {
        const core = Math.max(0, 1.0 - d / 1.25);
        let hillY = hill.height * smoothstep(0, 1, core);
        // 鳳山顶 (x=-112, z=-130) 平整出八蟠亭台基 (半径 6.5m)
        if (hill.id === 'fengshan') {
          const rTop = Math.hypot(x - hill.x, z - hill.z);
          if (rTop < 8.5) {
            const flat = 1.0 - smoothstep(4.5, 8.5, rTop);
            hillY = hillY * (1.0 - flat) + hill.height * flat;
          }
        }
        h = Math.max(h, hillY);
      }
    }
    // 从 (x=-90, z=-98) 拾级而上通往鳳山八蟠亭 (x=-112, z=-130) 的登山步道坡面
    const px0 = -90, pz0 = -98, px1 = -112, pz1 = -130;
    const vx = px1 - px0, vz = pz1 - pz0;
    const vLenSq = vx * vx + vz * vz;
    const u = Math.max(0, Math.min(1, ((x - px0) * vx + (z - pz0) * vz) / vLenSq));
    const projX = px0 + u * vx, projZ = pz0 + u * vz;
    const distToPath = Math.hypot(x - projX, z - projZ);
    if (distToPath < 5.5) {
      const pathY = 14.5 * smoothstep(0, 1, u);
      const blend = 1.0 - smoothstep(2.2, 5.5, distToPath);
      h = Math.max(h, pathY * blend);
    }
  } else if (x < -129 && z >= -78 && z <= 42) {
    for (const hill of DENGZHOU_MAP_FEATURES.hills) {
      if (hill.z <= -90) continue;
      const dx = (x - hill.x) / hill.rx;
      const dz = (z - hill.z) / hill.rz;
      const d = Math.hypot(dx, dz);
      if (d < 1.2) {
        const core = Math.max(0, 1.0 - d / 1.2);
        h = Math.max(h, hill.height * smoothstep(0, 1, core));
      }
    }
  }
  return h;
}

/**
 * 登州盆地、护城河、登云崖与外围群山的连续地面高度场 (m)
 */
export function getTerrainHeight(x, z) {
  // 1. 登州城内与城门大道保持平坦基准高度 (0m)
  const inCityX = Math.abs(x);
  const inCityZ = Math.abs(z);
  const cityDist = Math.max(inCityX - 182, inCityZ - 182);

  // 2. 护城河环绕城外 (185m ~ 206m)，南北城门及北山栈道架设石桥处除外
  const moatBand = 1.0 - Math.abs((Math.max(inCityX, inCityZ) - 195) / 11);
  const onNorthSouthBridge = Math.abs(x) < 15.0;
  const onEastWestBridge = Math.abs(z) < 14.0;
  let moatDip = 0;
  if (moatBand > 0 && !onNorthSouthBridge && !onEastWestBridge) {
    moatDip = -2.6 * smoothstep(0, 1, moatBand);
  }

  // 3. 北侧【登云崖】山脊突起：从北城门外 (z = -175) 拾级而上直达飞爪台 (x=0, z=-208, y=60m)
  const cliffDx = x / 42.0;
  const cliffDz = (z - (-214)) / 36.0;
  const cliffRadial = Math.hypot(cliffDx, cliffDz);
  let cliffHeight = 0;
  if (cliffRadial < 1.8) {
    const core = Math.max(0, 1.0 - cliffRadial / 1.45);
    cliffHeight = 60.0 * Math.pow(core, 1.55);
    // 飞爪台顶部平整台面
    if (Math.hypot(x, z - (-208)) < 14.0) {
      const flatBlend = 1.0 - smoothstep(6.0, 14.0, Math.hypot(x, z - (-208)));
      cliffHeight = cliffHeight * (1 - flatBlend) + 60.0 * flatBlend;
    }
  }
  // 从北门桥头 (z=-172, y=0) 到登云崖顶 (z=-208, y=60) 的登山御道斜坡
  if (Math.abs(x) < 9.5 && z <= -170 && z >= -208) {
    const rampT = (-170 - z) / 38.0;
    const rampY = 60.0 * smoothstep(0, 1, rampT);
    const xBlend = 1.0 - smoothstep(4.5, 9.5, Math.abs(x));
    cliffHeight = Math.max(cliffHeight, rampY * xBlend);
  }

  // 4. 外围群山环抱（参考 ep01_05 盆地群山环绕）
  const r = Math.hypot(x, z);
  const mountainMask = smoothstep(215, 520, r);
  // 南门外留出进城旷野与官道走廊 (x ≈ 0, z > 170)
  const southRoadClearance = z > 150 ? (1.0 - 0.82 * Math.exp(-(x * x) / (55 * 55))) : 1.0;

  let mountainH = 0;
  if (mountainMask > 0) {
    const n1 = fbm2D(x * 0.0055 + 3.1, z * 0.0055 + 7.4, 4);
    const n2 = fbm2D(x * 0.014 - 1.9, z * 0.014 + 2.2, 3);
    const ridge = Math.pow(Math.abs(n1 * 2.0 - 1.0), 0.78);
    mountainH = mountainMask * southRoadClearance * (42.0 + n1 * 95.0 + ridge * 65.0 + n2 * 22.0);
  }

  // 城市内部基准归零，叠加城内西北【鳳山·八蟠嶺】与城西【寶月山】地形
  const outsideCityMask = smoothstep(-5, 18, cityDist);
  const innerHillH = getInnerCityHillHeight(x, z);
  // 百里府和通往它的官道：在群山里压出一片平谷
  mountainH *= 1 - bailiFlatten(x, z);
  return outsideCityMask * (moatDip + mountainH) + cliffHeight + innerHillH;
}

/**
 * 考虑登州地面与空中蜃景双层世界的行走高度查询
 */
export function getWorldGroundHeight(x, z, currentY = 0) {
  if (isHomeworld(x)) return worldHomeHeight(x, z, currentY);
  // 若角色处于高空且在空中蜃景范围内，则采样蜃景城池地面与台阶高度
  const mx = x - MIRAGE_CONFIG.centerX;
  const mz = z - MIRAGE_CONFIG.centerZ;
  const inMirageFootprint =
    Math.abs(mx) <= MIRAGE_CONFIG.wallHalfX + 12 &&
    Math.abs(mz) <= MIRAGE_CONFIG.wallHalfZ + 14;

  if (currentY > 175 && inMirageFootprint) {
    let h = MIRAGE_CONFIG.baseY;
    // 蜃景主殿 24 级雕花御道石阶（位于 mz = -9.3..-22.5, 宽 22.4m）与北侧崇台内殿地坪（mz <= -22.5）
    if (Math.abs(mx) < 11.45 && mz < -9.3 && mz > -22.5) {
      const stepT = Math.max(0, Math.min(1, (-9.3 - mz) / 13.2));
      const stepFloat = stepT * 24;
      const stepIdx = Math.floor(stepFloat);
      const frac = stepFloat - stepIdx;
      const smoothStep = frac * frac * (3.0 - 2.0 * frac);
      const blendedT = stepT * 0.72 + ((stepIdx + smoothStep) / 24) * 0.28;
      h += Math.min(1, blendedT) * 5.4;
    } else if (Math.abs(mx) < 34 && mz <= -22.5 && mz > -66) {
      // 进入三层重檐主殿月台与内部 · 天外母舰中枢石殿地坪 (5.4m)
      h += 5.4;
      // 中央圆形比武/中枢石台 (半径 6.2m, 位于 mz = -43.0)
      const distCenterDais = Math.hypot(mx, mz - (-43.0));
      if (distCenterDais < 6.2) {
        h += 0.32;
      } else if (mz < -52.2 && Math.abs(mx) < 16.0) {
        // 北端双层石阶操控高台 (舵柱与六棱晶簇区)
        h += 0.68;
      } else if (Math.abs(mx) > 11.6 && Math.abs(mx) < 20.5 && mz < -26.0 && mz > -52.2) {
        // 东西两侧涡纹圆窗与天外医疗榻石台
        h += 0.34;
      }
    }
    return h;
  }

  return getTerrainHeight(x, z) + bailiHeight(x, z);
}

// 登州与蜃景核心道路网（用于小地图、全屏舆图与行人路径）
export const ROADS = [
  { name: '朱雀长街 (南门御街)', points: [[0, 260], [0, -170]], width: 18, main: true },
  { name: '登云栈道 (北山飞爪径)', points: [[0, -170], [0, -210]], width: 9, main: true },
  { name: '鼓楼横街 (东西大街)', points: [[-162, 0], [162, 0]], width: 15, main: true },
  { name: '桃花酒肆巷 (东市花街)', points: [[18, 56], [145, 56]], width: 11, main: false },
  { name: '望楼西巷 (西市坊巷)', points: [[-145, 56], [-18, 56]], width: 11, main: false },
  { name: '州衙前街 (北坊街)', points: [[-140, -68], [140, -68]], width: 11, main: false },
  { name: '东顺城街', points: [[122, -145], [122, 145]], width: 9, main: false },
  { name: '西顺城街', points: [[-122, -94], [-122, 145]], width: 9, main: false },
  { name: '南顺城街', points: [[-145, 132], [145, 132]], width: 9, main: false },
  { name: '凤山八蟠石阶', points: [[-90, -96], [-112, -130]], width: 5, main: false },
  { name: '蜃景·天街中轴', points: [[0, -306], [0, -435]], width: 22, mirage: true },
  { name: '蜃景·钟鼓横廊', points: [[-65, -365], [65, -365]], width: 14, mirage: true }
];

// 母星路线与地标：局部地图跟随玩家，所以进入母星后小地图依然有内容
ROADS.push(
  { name: '母星·焦土大道', points: [[6000, 170], [6000, -161]], width: 12, main: true },
  { name: '旧都·中央大道', points: [[12000, 320], [12000, -432]], width: 14, main: true },
  { name: '母星·魂舱中轴', points: [[6000, -170], [6000, -270]], width: 10, main: true },
  { name: '南门外官道', points: [[0, 218], [0, BAILI.road.z]], width: BAILI.road.halfWidth * 2, main: false },
  { name: '百里官道', points: [[0, BAILI.road.z], [BAILI.x, BAILI.road.z]], width: BAILI.road.halfWidth * 2, main: false },
  { name: '百里府门前', points: [[BAILI.x, BAILI.road.z], [BAILI.x, BAILI.gateZ]], width: 12, main: false }
);

// 地标列表（用于地图标注、搜索与位置识别）
export const WORLD_LANDMARKS = [
  { id: 'southGate', name: '登州南城门', realm: '登州城', x: 0, y: 0, z: 170 },
  { id: 'watchtowers', name: '长街双望楼', realm: '登州城', x: 0, y: 0, z: 98 },
  { id: 'blossomMarket', name: '桃花红灯闹市', realm: '登州城', x: 58, y: 0, z: 56 },
  { id: 'drumTower', name: '登州中心鼓楼', realm: '登州城', x: 0, y: 0, z: 0 },
  { id: 'chaotianmen', name: '御街·朝天门牌坊', realm: '登州城', x: 0, y: 0, z: -42 },
  { id: 'yamen', name: '登州府治 (州衙大堂)', realm: '登州城', x: 0, y: 0, z: -105 },
  { id: 'dengzhouMapScreen', name: '府治·《登州城之圖》屏风', realm: '登州城', x: 0, y: 0, z: -95 },
  { id: 'xiangguojing', name: '相国井 (暗渠北源)', realm: '登州城', x: -34, y: 0, z: -60 },
  { id: 'taijian', name: '臺諫 · 捉刀人公廨', realm: '登州城', x: -56, y: 0, z: -52 },
  { id: 'bayanjing', name: '宝月山 · 八眼井', realm: '登州城', x: -106, y: 0, z: -24 },
  { id: 'fengshan', name: '凤山 · 八蟠岭亭', realm: '登州城', x: -112, y: 14.5, z: -130 },
  { id: 'qinghuCanal', name: '清湖河 · 三圣桥', realm: '登州城', x: 138, y: 0, z: -68 },
  { id: 'shuimen', name: '水门 (大江引水口)', realm: '登州城', x: 138, y: 0, z: 170 },
  { id: 'xiaoyanmen', name: '西垣 · 小堰门', realm: '登州城', x: -170, y: 0, z: 112 },
  { id: 'gufuGate', name: '顾府 (顾廷美宅)', realm: '登州城', x: GU_MANSION.x, y: 0, z: 112 },
  { id: 'qingfengGate', name: '清风楼 · 惊鹤堂', realm: '登州城', x: QINGFENG_TOWER.x, y: 0, z: 112 },
  { id: 'bailiGate', name: '百里府大门', realm: '百里渊府', x: BAILI.x, y: 0, z: BAILI.gateZ },
  { id: 'bailiWater', name: '百里府水亭', realm: '百里渊府', x: BAILI.x, y: 1, z: 62 },
  { id: 'bailiOctagon', name: '八角秘殿', realm: '百里渊府', x: BAILI.x + BAILI.octagon.dx, y: 2.4, z: BAILI.octagon.z },
  { id: 'cliffAnchor', name: '登云崖·神机飞爪台', realm: '铁索凌云', x: 0, y: 60, z: -206 },
  { id: 'midChain', name: '登云铁索·云海段', realm: '铁索凌云', x: 0, y: 145, z: -257 },
  { id: 'mirageGate', name: '空中蜃景·南天城门', realm: '空中蜃景', x: 0, y: 240, z: -306 },
  { id: 'mirageCourtyard', name: '蜃景·钟鼓石板广场', realm: '空中蜃景', x: 0, y: 240, z: -362 },
  { id: 'linhanGuard', name: '重生主殿门前·林寒守门', realm: '空中蜃景', x: 0, y: 245.4, z: -402 },
  { id: 'mirageCoreChamber', name: '蜃景主殿内·林寒守护的中枢石殿', realm: '空中蜃景', x: 0, y: 245.7, z: -423 },
  { id: 'homeWormhole', name: '归墟虫洞台', realm: '空中蜃景', x: 6000, y: 2, z: 178 },
  { id: 'homePlaza', name: '甄选广场 · 权贵空城', realm: '空中蜃景', x: 6000, y: 0, z: -95 },
  { id: 'homeYard', name: '蜃景船坞', realm: '空中蜃景', x: 6000, y: 0, z: -345 },
  { id: 'pastCity', name: '天外旧都（星图镜内）', realm: '空中蜃景', x: 12000, y: 0, z: -150 },
  { id: 'homeCamp', name: '奴隶营', realm: '登州城', x: 5870, y: 0, z: 62 },
  { id: 'miragePagoda', name: '蜃景·四层浮屠宝塔', realm: '空中蜃景', x: -46, y: 240, z: -385 }
];

// 传送目的地配置
export const TELEPORT_LOCATIONS = {
  southGate: {
    name: '登州南城门外',
    sub: 'EP01 @ 09:13 · 城门仰望天际蜃景',
    x: 0, y: 0, z: 218, heading: Math.PI, mode: 'person'
  },
  yamenStreet: {
    name: '州衙前街',
    sub: '铁甲人与甲士把守，可以开打',
    x: 0, y: 0, z: -30, heading: Math.PI, mode: 'person'
  },
  gufuGate: {
    name: '东市南坊 · 顾府大门',
    sub: 'EP10 @ 38:40 · 顾府护院把守，Boss 顾廷美在院内',
    x: GU_MANSION.x, y: 0, z: 131, heading: Math.PI, mode: 'person'
  },
  qingfengGate: {
    name: '西市南坊 · 清风楼大门',
    sub: 'EP01 @ 18:24 · 东子门口迎客，恶霸与 Boss 三爷在楼内',
    x: QINGFENG_TOWER.x, y: 0, z: 131, heading: Math.PI, mode: 'person'
  },
  bailiGate: {
    name: '百里府 · 大门',
    sub: 'EP17 · 甲士把守的前院',
    x: BAILI.x, y: 0, z: BAILI.gateZ + 16, heading: Math.PI, mode: 'person'
  },
  westMarket: {
    name: '西市 · 望楼巷',
    sub: '无形怪物出没，先站在它们察觉不到的巷口',
    x: -40, y: 0, z: 56, heading: -Math.PI / 2, mode: 'person'
  },
  cliffAnchor: {
    name: '登云崖·神机飞爪台 (铁索起点)',
    sub: 'EP23 @ 19:07 · 往前走到石台下就会挂上铁索',
    x: 0, z: -195.5, heading: Math.PI, mode: 'person'
  },
  mirageGate: {
    name: '空中蜃景·南天城门 (铁索终点)',
    sub: 'EP23 @ 19:58 · 云海城垣与重檐城楼',
    x: 0, y: 240.2, z: -312, heading: Math.PI, mode: 'person'
  },
  homeworld: {
    name: '天外母星 · 归墟虫洞台',
    sub: 'EP19 · 童童讲述的天外故土',
    x: HOME.x, y: 2.4, z: 168, heading: Math.PI, mode: 'person'
  },
  pastCity: {
    name: '天外旧都 · 镜中的往日',
    sub: 'EP19 @ 04:20 · 后来各方面技法飞速提升',
    x: PAST.x, y: 0, z: PAST.mirrorZ - 16, heading: Math.PI, mode: 'person'
  },
  homePlaza: {
    name: '天外母星 · 甄选广场',
    sub: 'EP19 @ 11:00 · 兜帽权贵与绿项圈',
    x: HOME.x, y: 0, z: -40, heading: Math.PI, mode: 'person'
  },
  homeSkyCity: {
    name: '天外母星 · 权贵空城',
    sub: 'EP19 @ 04:45 · 权贵们生活在空中的城池里',
    x: HOME.x, y: DECK.y, z: -52, heading: Math.PI, mode: 'person'
  }
};

/**
 * 根据世界坐标返回当前所处区域与街道牌匾文案
 */
export function getLocationInfo(x, y, z, mode = 'person') {
  if (isHomeworld(x)) return homeLocationInfo(x, y, z);
  const baili = mode !== 'chain' && y < 60 ? bailiLocationInfo(x, z) : null;
  if (baili) return baili;
  if (mode === 'chain') {
    const proj = projectOntoChain(x, y, z);
    const pct = Math.round(proj.t * 100);
    return {
      realm: '登云铁索 · 凌云飞渡',
      street: `玄铁长索 (${pct}% 往蜃景)`,
      kind: 'chain',
      refKey: 'chainClimb'
    };
  }

  if (y > 180) {
    const mx = x - MIRAGE_CONFIG.centerX;
    const mz = z - MIRAGE_CONFIG.centerZ;
    let spot = '浮空岩岛外围';
    let refKey = 'clearMirage';
    if (mz > 55) {
      spot = '南天城门 · 云海城垣';
      refKey = 'cloudWall';
    } else if (mz > -14) {
      spot = '千步石板广场 · 钟鼓楼';
      refKey = 'innerCourtyard';
    } else if (mz > -24.2) {
      spot = '重生主殿石阶 · 林寒守门处';
      refKey = 'linhanGuard';
    } else if (Math.abs(mx) < 22 && mz >= -64) {
      if (mx < -8 && mz > -50 && mz < -36) {
        spot = '中枢石殿 · 天外重生医疗榻';
        refKey = 'medicalPod';
      } else if (mz < -50) {
        spot = '中枢石殿 · 母舰能量舵柱高台';
        refKey = 'coreChamber';
      } else {
        spot = '中枢石殿 · 林寒守护之终局内殿';
        refKey = 'coreChamber';
      }
    } else {
      spot = '三层重檐主殿 · 重生殿外廊';
      refKey = 'linhanGuard';
    }
    return {
      realm: '空中蜃景 · 重生之城',
      street: spot,
      kind: 'mirage',
      refKey
    };
  }

  if (z < -175) {
    return {
      realm: '登州北山 · 登云崖',
      street: y > 35 ? '神机飞爪台 · 铁索锚点' : '登云石阶古道',
      kind: 'chain',
      refKey: 'chainClimb'
    };
  }

  if (Math.abs(x) > 175 || z > 178) {
    return {
      realm: '登州城外 · 苍山盆地',
      street: z > 178 ? (x > 100 ? '城外大江 · 水门外河道' : '南门官道 · 护城大江') : (x < -175 && z > 80 ? '小堰头 · 包家山麓' : '护城翠谷'),
      kind: 'dengzhou',
      refKey: 'valleyWide'
    };
  }

  // EP02《登州城之圖》新增核心地标识别
  if (x < -74 && z < -96) {
    return {
      realm: '登州城 · 凤山八蟠岭',
      street: y > 8 ? '凤山八蟠亭 · 万松岭巅' : '八蟠岭石阶 · 四井与钓台',
      kind: 'dengzhou',
      refKey: 'dengzhouMap'
    };
  }

  if (Math.abs(x) < 18 && z < -80 && z > -126) {
    return {
      realm: '登州城 · 登州府治',
      street: '州衙大堂 · 《登州城之圖》屏风',
      kind: 'dengzhou',
      refKey: 'dengzhouMap'
    };
  }

  if (Math.hypot(x - (-34), z - (-62)) < 20) {
    return {
      realm: '登州城 · 北坊水源枢',
      street: '相国井亭 · 引水暗渠总枢',
      kind: 'dengzhou',
      refKey: 'dengzhouMap'
    };
  }

  if (x < -94 && Math.abs(z - (-24)) < 26) {
    return {
      realm: '登州城 · 城西宝月山',
      street: '宝月山麓 · 八眼古井群',
      kind: 'dengzhou',
      refKey: 'dengzhouMap'
    };
  }

  if (Math.abs(x - 138) < 16) {
    return {
      realm: '登州城 · 清湖河穿城水系',
      street: z > 145 ? '保安水门 · 大江入城水闸' : (z < -40 ? '清湖河 · 三圣桥' : '清湖河 · 望仙桥与黑津桥'),
      kind: 'dengzhou',
      refKey: 'dengzhouMap'
    };
  }

  if (inGuMansion(x, z)) {
    return {
      realm: '登州城 · 顾府',
      street: z < 96 ? '笃行致远堂 · 顾家正堂' : (z > 122 ? '顾府大门 · 石栏桥廊' : '顾府前院 · 顾廷美'),
      kind: 'dengzhou',
      refKey: 'gufuGate'
    };
  }

  if (inQingfengTower(x, z)) {
    return {
      realm: '登州城 · 清风楼',
      street: z < 97 ? '惊鹤堂 · 清风楼正厅' : (z > 121 ? '清风楼门口 · 东子迎客' : '清风楼前院 · 太湖石假山池'),
      kind: 'dengzhou',
      refKey: 'qingfengGate'
    };
  }

  if (x > 22 && Math.abs(z - 56) < 36) {
    return {
      realm: '登州城 · 东市繁华坊',
      street: '桃花红灯街 · 太白仙酒楼',
      kind: 'dengzhou',
      refKey: 'blossomMarket'
    };
  }

  if (Math.abs(x) < 28 && z > 60) {
    return {
      realm: '登州城 · 朱雀御街',
      street: z > 120 ? '镇海门内 · 大江引水总闸' : '南门长街 · 双望楼夹道',
      kind: 'dengzhou',
      refKey: 'streetLookup'
    };
  }

  if (Math.abs(x) < 24 && z < -30 && z >= -55) {
    return {
      realm: '登州城 · 御街中轴',
      street: '朝天门跨街牌坊 · 暗渠中枢闸',
      kind: 'dengzhou',
      refKey: 'dengzhouMap'
    };
  }

  if (Math.abs(x) < 35 && Math.abs(z) <= 45) {
    return {
      realm: '登州城 · 中心十字街',
      street: '镇海鼓楼广场',
      kind: 'dengzhou',
      refKey: 'streetLookup'
    };
  }

  if (z < -55) {
    return {
      realm: '登州城 · 北坊官署区',
      street: x < -40 ? '臺諫公廨 · 白马院坊' : '登州府治前街 · 清湖河渠',
      kind: 'dengzhou',
      refKey: 'dengzhouMap'
    };
  }

  return {
    realm: '登州城 · 坊巷街市',
    street: x < 0 ? '西市望楼坊 · 臺諫街' : '东市黑津巷 · 绸缎坊',
    kind: 'dengzhou',
    refKey: 'streetLookup'
  };
}

export function isTypingInField(e) {
  const t = e.target;
  if (!t || !(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
}
