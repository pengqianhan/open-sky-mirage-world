// js/baili-config.js
// 百里府的布局与地面高度（第 17–21 集）。不依赖渲染，world-config.js 和测试都能用。
// 坐标约定：dx = x - BAILI.x，z 用世界坐标。大门朝南，一路向北：
//   大门 → 前院 → 正堂（书房）→ 临水木台 → 栈桥 → 蓝瓦亭 → 横向水廊 → 东岸 → 八角秘殿
// 水面只是比地面略高的一层，所以不用在 8.75 米一格的地形网格上挖湖。

export const BAILI = {
  x: -400,
  gateZ: 215,
  halfX: 82,
  northZ: -22,
  floorY: 1,            // 正堂、木台、栈桥、水廊的地面
  yard: { minZ: 165, maxZ: 215 },
  hall: { halfX: 26, minZ: 135, maxZ: 165, doorS: 5, doorN: 8, wallH: 7.5 },
  stairS: { halfX: 8, minZ: 165, maxZ: 169 },
  deck: { halfX: 22, minZ: 118, maxZ: 135 },
  pier: { halfX: 3.5, minZ: 71, maxZ: 118 },
  lake: { halfX: 60, minZ: 42, maxZ: 135 },
  pavilion: { halfX: 9, minZ: 53, maxZ: 71, dz: 62 },
  walk: { minZ: 59, maxZ: 65 },                       // 横穿水面的回廊
  walkStairs: { from: 60, to: 64 },
  greenIsle: { minDx: 29, maxDx: 43, minZ: 55, maxZ: 69 },
  rock: { halfX: 26, minZ: 18, maxZ: 44 },
  octagon: { dx: 56, z: 6, apothem: 18.5, floor: 2.4, pit: 1.5, pitR: 9, rimR: 12 },
  octStairs: { halfX: 4, minZ: 24.5, maxZ: 33 },
  road: { z: 240, halfWidth: 5 }
};

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const OCT_NORMALS = Array.from({ length: 8 }, (_, i) => [Math.sin(i * Math.PI / 4), Math.cos(i * Math.PI / 4)]);

/** 到八角形中心的「面距」：小于 apothem 就在殿内。 */
export function octagonDistance(dx, z) {
  const o = BAILI.octagon, px = dx - o.dx, pz = z - o.z;
  return Math.max(...OCT_NORMALS.map(([nx, nz]) => px * nx + pz * nz));
}

export const inBailiEstate = (x, z) => Math.abs(x - BAILI.x) <= BAILI.halfX && z >= BAILI.northZ && z <= BAILI.gateZ;

/** 地形要把这里压平：府邸本体和通往南门的官道。1 = 完全平，0 = 不管。 */
export function bailiFlatten(x, z) {
  const dx = Math.abs(x - BAILI.x) - BAILI.halfX;
  const dzEstate = Math.max(BAILI.northZ - z, z - BAILI.road.z);
  const estate = Math.max(dx, dzEstate);
  const onRoad = x <= 30 && x >= BAILI.x - 10 ? Math.abs(z - BAILI.road.z) - 18 : 1e3;
  // 网格一格 8.75 米，多留 12 米再起坡，三角形才不会戳穿墙根和路面
  // 起坡放缓到 200 米开外，山才是能长树的缓坡，不是一堵秃墙
  return 1 - smooth(12, 210, Math.min(estate, onRoad));
}

/** 府内可走的地面高度；不在府内的高台上就是 0。 */
export function bailiHeight(x, z) {
  if (!inBailiEstate(x, z)) return 0;
  const dx = x - BAILI.x, adx = Math.abs(dx), B = BAILI;

  if (octagonDistance(dx, z) <= B.octagon.apothem) {
    const r = Math.hypot(dx - B.octagon.dx, z - B.octagon.z), o = B.octagon;
    return o.pit + (o.floor - o.pit) * Math.min(1, Math.max(0, (r - o.pitR) / (o.rimR - o.pitR)));
  }
  const os = B.octStairs;
  if (Math.abs(dx - B.octagon.dx) <= os.halfX && z >= os.minZ && z <= os.maxZ) return B.octagon.floor * (1 - (z - os.minZ) / (os.maxZ - os.minZ));

  const s = B.stairS;
  if (adx <= s.halfX && z >= s.minZ && z <= s.maxZ) return B.floorY * (1 - (z - s.minZ) / (s.maxZ - s.minZ));
  if (adx <= B.hall.halfX + 1 && z >= B.hall.minZ && z < B.hall.maxZ) return B.floorY;
  if (adx <= B.deck.halfX && z >= B.deck.minZ && z < B.deck.maxZ) return B.floorY;
  if (adx <= B.pier.halfX && z >= B.pier.minZ && z < B.pier.maxZ) return B.floorY;
  if (adx <= B.pavilion.halfX && z >= B.pavilion.minZ && z < B.pavilion.maxZ) return B.floorY;
  const g = B.greenIsle;
  if (dx >= g.minDx && dx <= g.maxDx && z >= g.minZ && z <= g.maxZ) return B.floorY;
  if (z >= B.walk.minZ && z <= B.walk.maxZ) {
    if (adx <= B.walkStairs.from) return B.floorY;
    if (adx <= B.walkStairs.to) return B.floorY * (1 - (adx - B.walkStairs.from) / (B.walkStairs.to - B.walkStairs.from));
  }
  return 0;
}

export function bailiLocationInfo(x, z) {
  if (!inBailiEstate(x, z)) return null;
  const B = BAILI, dx = x - B.x, adx = Math.abs(dx);
  const realm = '百里渊府';
  const at = (street, refKey) => ({ realm, street, kind: 'city', refKey });
  if (octagonDistance(dx, z) <= B.octagon.apothem) return at('八角秘殿', 'bailiOctagon');
  if (z >= B.yard.minZ) return at('前院 · 火盆甲阵', 'bailiWater');
  if (adx <= B.hall.halfX && z >= B.hall.minZ) return at('正堂 · 百里渊书房', 'bailiStudy');
  if (dx >= B.greenIsle.minDx && dx <= B.greenIsle.maxDx && z >= B.greenIsle.minZ && z <= B.greenIsle.maxZ) return at('绿帘水亭', 'bailiWater');
  if (adx <= B.pavilion.halfX && z >= B.pavilion.minZ && z < B.pavilion.maxZ) return at('蓝瓦水亭', 'bailiWater');
  if (adx <= B.lake.halfX && z >= B.lake.minZ && z < B.lake.maxZ) return at('临水栈桥 · 水廊', 'bailiWater');
  return at('后园 · 假山瀑布', 'bailiWater');
}
