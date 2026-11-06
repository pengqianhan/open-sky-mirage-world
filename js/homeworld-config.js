// js/homeworld-config.js
// 天外母星（EP19 童童讲述）的坐标、地形高度与地点识别。纯数据，无渲染依赖。

export const HOME = { x: 6000, z: 0, radius: 640, threshold: 4000 };
export const HOME_PORTAL = { x: 6000, y: 6.2, z: 190 };      // 母星侧虫洞环（返回登州）
export const MIRAGE_PORTAL = { x: 15.6, y: 245.74, z: -423 }; // 中枢石殿东侧虫洞环（前往母星）

export const isHomeworld = (x) => x > HOME.threshold;
// 天外旧都：母星尚未毁掉时的城，在世界坐标里是单独一块
export const PAST = { x: 12000, z: 0, threshold: 9000, avenue: 72, street: 56, extent: 432, hero: -150, parkZ: 196, mirrorZ: 320 };
export const isPast = (x) => x > PAST.threshold;

const fract = (v) => v - Math.floor(v);
const hash = (x, z) => fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453);
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function fbm(x, z) { let v = 0, a = 0.5; for (let i = 0; i < 4; i++) { v += a * noise(x, z); x *= 2.03; z *= 2.03; a *= 0.5; } return v; }

// 弹坑（局部坐标）：[x, z, 半径]
export const CRATERS = [[-46, 118, 22], [58, 96, 30], [-22, 58, 16], [84, 28, 24], [-80, 8, 20], [34, 150, 13], [-120, 150, 26], [130, 120, 28]];
// 辐射池：落在部分弹坑里
export const RAD_POOLS = [1, 3, 6];

export const PLAZA = { x: 0, z: -95, radius: 66, plinthX: -30, plinthZ: -88, cageX: 34, cageZ: -92 }; // 甄选广场
export const DECK = { x: 0, z: -95, y: 132, radius: 60, padZ: -44 };   // 权贵空城甲板（局部坐标，悬在广场正上方）
export const YARD = { x: 0, z: -345, radius: 84 };             // 蜃景船坞

/** 局部坐标高度：步行、地形网格共用，保证脚下与画面一致 */
export function homeHeight(lx, lz) {
  let h = (fbm(lx * 0.012 + 9, lz * 0.012 + 4) - 0.5) * 9 + (fbm(lx * 0.07, lz * 0.07) - 0.5) * 1.2;
  const r = Math.hypot(lx, lz);
  h += sstep(430, 640, r) * 46 * fbm(lx * 0.006, lz * 0.006);

  // 主路带略平整：车辙走廊
  const road = 1 - sstep(10, 24, Math.abs(lx + Math.sin(lz * 0.012) * 6));
  if (lz > -440 && lz < 190) h *= 1 - 0.75 * road;

  for (const [cx, cz, cr] of CRATERS) {
    const d = Math.hypot(lx - cx, lz - cz) / cr;
    if (d < 1.35) h += -5.5 * (1 - sstep(0.2, 1, d)) + 2.2 * Math.exp(-((d - 1) ** 2) / 0.03);
  }

  // 虫洞台
  const dPad = Math.hypot(lx - 0, lz - 178);
  h = h * sstep(30, 44, dPad) + 0;
  if (dPad < 30) h = 2.4;
  else if (dPad < 44) h = Math.max(h, 2.4 * (1 - sstep(30, 44, dPad)));

  // 甄选广场夯平
  h *= sstep(PLAZA.radius - 2, PLAZA.radius + 16, Math.hypot(lx - PLAZA.x, lz - PLAZA.z));

  // 船坞夯平
  const dYard = Math.hypot(lx - YARD.x, lz - YARD.z);
  h *= sstep(YARD.radius + 30, YARD.radius + 70, dYard);
  return h;
}

const onDeck = (lx, lz, y) => y > DECK.y - 22 && Math.hypot(lx - DECK.x, lz - DECK.z) < DECK.radius + 1;

/** 站在空城上就踩甲板，否则踩地面：飞到船底下不会被甲板顶上去 */
export function worldHomeHeight(x, z, y = 0) {
  if (isPast(x)) return 0;
  const lx = x - HOME.x, lz = z - HOME.z;
  return onDeck(lx, lz, y) ? DECK.y : homeHeight(lx, lz);
}

export function homeLocationInfo(x, y, z) {
  if (isPast(x)) {
    const lz = z - PAST.z, d = Math.hypot(x - PAST.x, lz - PAST.hero);
    return { realm: '天外旧都 · 镜中的往日', kind: 'homeworld', refKey: 'homePast',
      street: Math.hypot(x - PAST.x, lz - PAST.mirrorZ) < 8 ? '星图镜 · 走进去，回到废墟' : d < 110 ? '主塔广场 · 技法飞速提升的年代' : lz > PAST.parkZ ? '南郊 · 蘑菇平台' : d < 260 ? '高架环线之下 · 中心城' : '街区 · 还没有战争的日子' };
  }
  const lx = x - HOME.x, lz = z - HOME.z;
  const out = (street) => ({ realm: '天外母星 · 童童口中的故土', street, kind: 'homeworld', refKey: 'homeworld' });
  if (Math.hypot(lx, lz - 178) < 44) return out('归墟虫洞台 · 魂魄来去之门');
  if (onDeck(lx, lz, y)) return out('权贵空城 · 活在云上的人');
  if (Math.hypot(lx - PLAZA.x, lz - PLAZA.z) < PLAZA.radius + 4) return { ...out(Math.hypot(lx - PLAZA.x, lz - PLAZA.z) < 8 ? '登天光柱 · 走进去，升上空城' : '甄选广场 · 戴绿项圈的底层人'), refKey: 'homePlaza' };
  if (Math.hypot(lx - YARD.x, lz - YARD.z) < YARD.radius + 12) return out('蜃景船坞 · 姊妹舰');
  if (lz < -170) return out('魂舱阵 · 等待迁徙的魂魄');
  if (lx < -80 && lz > 0 && lz < 130) return out('奴隶营 · 底层人的棚屋');
  if (Math.hypot(lx, lz) > 330) return out('废都 · 曾与人间相似的城');
  return out('焦土古战场');
}

// 母星的日间与夜间，与顶栏两个按钮对应。光照、雾、天幕和调色都从这里取。
// sky 内的颜色是线性空间 RGB；sun 是天幕上日轮的强度。光从玩家身后斜上方来，主路一路看得清。
const LIGHT_DIR = [0.42, 0.72, 0.55];
export const HOME_WEATHER = {
  day: { // 尘幕下的白昼：仍没有蓝天，但一切清楚
    light: { sunDir: LIGHT_DIR, sunColor: 0xffe6c4, sunIntensity: 4.2, hemiSky: 0xe0c4a4, hemiGround: 0x9a7c64, hemiIntensity: 3.0, fogColor: 0xb89878, fogDensity: 0.0013 },
    sky: { zenith: [0.34, 0.26, 0.2], horizon: [0.66, 0.5, 0.36], haze: [0.12, 0.09, 0.07], sunDir: [-0.55, 0.3, -0.78], sunTint: [3, 2.0, 1.2], sun: 0.8, stars: 0, cloud: 0, cloudColor: [0.5, 0.42, 0.34], wormhole: 0.7 },
    mood: { energy: 0.8, windows: 0.3, lift: 0.22, ash: 0.45 },
    look: { exposure: 1.0, contrast: 1.08, saturation: 0.95, balance: [1.02, 1.0, 0.96], bloom: 0.18, threshold: 1.2 }
  },
  night: { // 碎月照明：冷光勾出形体，窗灯和青光是点缀而非唯一光源
    light: { sunDir: LIGHT_DIR, sunColor: 0xb4c8f0, sunIntensity: 2.8, hemiSky: 0x6880b4, hemiGround: 0x4c4458, hemiIntensity: 2.6, fogColor: 0x202a44, fogDensity: 0.0016 },
    sky: { zenith: [0.012, 0.018, 0.04], horizon: [0.05, 0.07, 0.13], haze: [0.02, 0.025, 0.04], sunDir: [-0.55, 0.3, -0.78], sunTint: [0, 0, 0], sun: 0, stars: 1, cloud: 0, cloudColor: [0.02, 0.02, 0.03], wormhole: 0.95 },
    mood: { energy: 1.2, windows: 1.6, lift: 0.2, ash: 0.35 },
    look: { exposure: 1.2, contrast: 1.06, saturation: 1.0, balance: [0.97, 1.0, 1.05], bloom: 0.3, threshold: 1.0 }
  },
  // 镜中旧都：还是干净的天，两轮月亮都完好
  pastDay: {
    light: { sunDir: [0.4, 0.72, 0.56], sunColor: 0xfff4e4, sunIntensity: 4.0, hemiSky: 0xc9dcec, hemiGround: 0x8a8f86, hemiIntensity: 2.6, fogColor: 0xc2d2dc, fogDensity: 0.00095 },
    sky: { zenith: [0.14, 0.28, 0.5], horizon: [0.56, 0.68, 0.76], haze: [0.08, 0.09, 0.1], sunDir: [-0.5, 0.42, -0.76], sunTint: [3, 2.8, 2.4], sun: 0.7, stars: 0, cloud: 0, cloudColor: [0.8, 0.84, 0.88], wormhole: 0, bigMoon: 1 },
    mood: { energy: 1, windows: 0.1, lift: 0.2, ash: 0 },
    look: { exposure: 1.0, contrast: 1.08, saturation: 1.02, balance: [1.0, 1.0, 1.0], bloom: 0.16, threshold: 1.25 }
  },
  pastNight: {
    light: { sunDir: [0.4, 0.72, 0.56], sunColor: 0xb7c9ee, sunIntensity: 2.4, hemiSky: 0x5f7ab4, hemiGround: 0x4a4a62, hemiIntensity: 2.4, fogColor: 0x1b2746, fogDensity: 0.001 },
    sky: { zenith: [0.012, 0.02, 0.05], horizon: [0.05, 0.08, 0.16], haze: [0.02, 0.03, 0.05], sunDir: [-0.5, 0.42, -0.76], sunTint: [0, 0, 0], sun: 0, stars: 1, cloud: 0, cloudColor: [0.02, 0.02, 0.03], wormhole: 0, bigMoon: 0.34 },
    mood: { energy: 1.2, windows: 1.05, lift: 0.18, ash: 0 },
    look: { exposure: 1.16, contrast: 1.08, saturation: 1.1, balance: [0.97, 1.0, 1.05], bloom: 0.26, threshold: 1.05 }
  }
};
export const homeLightId = (timeId) => `homeworld_${HOME_WEATHER[timeId] ? timeId : 'day'}`;
export const pastWeatherKey = (timeId) => (timeId === 'night' ? 'pastNight' : 'pastDay');
