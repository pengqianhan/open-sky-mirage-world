// js/baili-mansion.js
// 百里渊府（第 17–21 集）：
// 格扇门 → 临水木台 → 栈桥 → 蓝瓦亭 → 灰色假山瀑布，是全府最重要的一条视线。
// 没有点光源：登州这一层一直没有点光，加了会让全城所有材质变重。室内靠自发光材质和地面光斑。
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Fn, abs, float, floor, fract, mix, mod, normalWorld, positionLocal, positionWorld, sin, smoothstep, step, time, uv, vec3, length } from 'three/tsl';
import { BAILI } from './baili-config.js';
import { worldUniforms, createStoneRoadMaterial } from './tsl-materials.js';
import { createCurvedRoofGeometry } from './architecture.js';
import { getTerrainHeight } from './world-config.js';

const night = worldUniforms.uNightFactor;
const std = (color, roughness = .8, extra = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness, metalness: 0, ...extra });
/** 室内用：一点自发光，相当于烘好的烛光 */
const lit = (color, glow = .32, roughness = .75) => new THREE.MeshStandardNodeMaterial({ color, roughness, metalness: 0, emissive: color, emissiveIntensity: glow });

function tileMaterial(a, b) {
  const m = std(0xffffff, .55);
  m.colorNode = Fn(() => {
    const rib = sin(positionWorld.x.add(positionWorld.z).mul(4)).mul(.5).add(.5);
    const course = smoothstep(0, .22, fract(positionWorld.y.mul(2.4))).mul(.18).add(.82);
    const tile = mix(vec3(...a), vec3(...b), rib).mul(course);
    // 挑檐底面是木椽，不是瓦
    return mix(vec3(.13, .09, .06), tile, smoothstep(-.25, .05, normalWorld.y));
  })();
  return m;
}

function createMaterials() {
  const plank = std(0xffffff, .78);
  plank.colorNode = Fn(() => {
    const v = fract(positionWorld.x.mul(1.3));
    const seam = smoothstep(0, .05, v).mul(smoothstep(1, .95, v));
    const grain = sin(positionWorld.z.mul(2.1).add(floor(positionWorld.x.mul(1.3)).mul(3.7))).mul(.05).add(.95);
    return vec3(.42, .34, .25).mul(seam.mul(.75).add(.25)).mul(grain);
  })();

  // 木格纸窗：夜里纸面透出灯色
  const gridLine = Fn(() => {
    const c = positionWorld.x.add(positionWorld.z);
    const a = fract(c.mul(2.6)), b = fract(positionWorld.y.mul(2.6));
    return step(.8, a).add(step(.8, b)).min(1);
  });
  const lattice = std(0xffffff, .7);
  lattice.colorNode = Fn(() => mix(vec3(.74, .66, .5), vec3(.13, .09, .06), gridLine()))();
  lattice.emissiveNode = Fn(() => vec3(1, .58, .22).mul(float(1).sub(gridLine())).mul(night.mul(.5).add(.02)))();

  // 正堂下半截的淡紫灰菱花板（EP18 走廊）
  const lozenge = std(0xffffff, .7);
  lozenge.colorNode = Fn(() => {
    const c = positionWorld.x.add(positionWorld.z);
    const d = abs(fract(c.mul(.52)).sub(.5)).add(abs(fract(positionWorld.y.mul(.52)).sub(.5)));
    const frame = step(.92, fract(c.mul(.52)).mul(1)).add(step(.94, fract(positionWorld.y.mul(.52)))).min(1);
    return mix(mix(vec3(.62, .58, .62), vec3(.84, .8, .82), step(d, .24)), vec3(.27, .19, .13), frame);
  })();

  // 前院内墙：深色石面上一排浅色菱形花砖（EP21 突围）
  const diamondWall = std(0xffffff, .85);
  diamondWall.colorNode = Fn(() => {
    const c = positionWorld.x.add(positionWorld.z);
    const d = abs(fract(c.mul(.33)).sub(.5)).add(abs(positionWorld.y.sub(2.6).mul(.33)));
    return mix(vec3(.17, .17, .18), vec3(.72, .7, .64), step(d, .28));
  })();

  const water = std(0xffffff, .14, { metalness: .25 });
  water.colorNode = Fn(() => {
    const r = sin(positionWorld.x.mul(.9).add(time.mul(.7))).mul(sin(positionWorld.z.mul(1.2).sub(time.mul(.5))));
    return mix(vec3(.13, .29, .24), vec3(.22, .42, .34), r.mul(.5).add(.5));
  })();

  const rock = std(0xffffff, .95, { flatShading: true });
  rock.colorNode = Fn(() => {
    const strata = sin(positionWorld.y.mul(2.3).add(sin(positionWorld.x.mul(.7)).mul(1.4))).mul(.5).add(.5);
    return mix(vec3(.15, .15, .14), vec3(.33, .33, .3), strata);
  })();

  const fall = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  fall.colorNode = vec3(.92, .97, 1);
  fall.opacityNode = Fn(() => {
    const u = uv();
    const streak = sin(u.x.mul(47)).mul(.5).add(.5).mul(sin(u.y.mul(19).add(time.mul(8)).add(u.x.mul(37))).mul(.5).add(.5));
    // 中间实、两边散，顶端淡入，不要一块方板
    const edge = smoothstep(0, .35, u.x).mul(smoothstep(1, .65, u.x));
    return streak.mul(.5).add(.12).mul(edge).mul(smoothstep(1, .86, u.y));
  })();

  const paper = std(0xf0d596, .6);
  paper.emissiveNode = Fn(() => vec3(1, .6, .22).mul(night.mul(.85).add(.2)))();

  const flame = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.45, .55) });

  const fire = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  fire.positionNode = Fn(() => {
    const p = positionLocal;
    const h = fract(p.y.mul(.6));
    return p.add(vec3(sin(time.mul(11).add(p.y.mul(3)).add(p.z)).mul(.09), 0, sin(time.mul(8).add(p.x.mul(5))).mul(.09)).mul(h));
  })();
  fire.colorNode = Fn(() => mix(vec3(1.9, .95, .2), vec3(1.5, .28, .03), uv().y))();
  fire.opacityNode = float(.9);

  const glowNode = Fn(() => float(1).sub(length(uv().sub(.5)).mul(2)).max(0).pow(2));
  const glowIn = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  glowIn.colorNode = vec3(1, .62, .3);
  glowIn.opacityNode = Fn(() => glowNode().mul(.34))();
  const glowOut = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  glowOut.colorNode = vec3(1, .55, .22);
  glowOut.opacityNode = Fn(() => glowNode().mul(night.mul(.5).add(.03)))();

  const friezeColor = Fn(() => {
    const c = floor(positionWorld.x.add(positionWorld.z).mul(.55)).add(floor(positionWorld.y.mul(.55)));
    return mix(vec3(.62, .42, .17), vec3(.05, .04, .04), mod(c, 2));
  });
  const frieze = std(0xffffff, .85);
  frieze.colorNode = friezeColor();
  frieze.emissiveNode = friezeColor().mul(.5);

  const sandColor = Fn(() => {
    const p = positionWorld.xz.sub(vec3(BAILI.x + BAILI.octagon.dx, BAILI.octagon.z, 0).xy);
    const ring = sin(length(p).mul(7)).mul(.5).add(.5);
    return mix(vec3(.3, .22, .13), vec3(.38, .29, .18), ring);
  });
  const sand = std(0xffffff, 1);
  sand.colorNode = sandColor();
  sand.emissiveNode = sandColor().mul(.45);

  // 水墨蓝山，贴在书房圆窗上（EP18 12:30）
  const inkWindow = new THREE.MeshBasicNodeMaterial();
  inkWindow.colorNode = Fn(() => {
    const u = uv();
    const ridge = sin(u.x.mul(9)).mul(.07).add(sin(u.x.mul(23).add(1.3)).mul(.03)).add(.42);
    const ridge2 = sin(u.x.mul(14).add(2)).mul(.05).add(.28);
    const sky = mix(vec3(.72, .78, .8), vec3(.42, .56, .66), u.y);
    return mix(mix(sky, vec3(.22, .36, .5), step(u.y, ridge)), vec3(.1, .2, .3), step(u.y, ridge2));
  })();

  return {
    plank, lattice, lozenge, diamondWall, water, rock, fall, paper, flame, fire, glowIn, glowOut, frieze, sand, inkWindow,
    wood: std(0x33251a, .72),
    woodMid: std(0x5d4631, .7),
    teal: std(0x63857a, .62),
    plaster: std(0xcfc9ba, .9),
    stone: std(0x8b8a82, .9),
    stoneDark: std(0x56554f, .92),
    tileWhite: tileMaterial([.24, .26, .27], [.5, .52, .52]),
    tileBlue: tileMaterial([.08, .2, .38], [.2, .38, .6]),
    tileDark: tileMaterial([.16, .17, .19], [.28, .29, .31]),
    bronze: std(0x4f4432, .45, { metalness: .75 }),
    gold: std(0xd0a24a, .32, { metalness: .85 }),
    celadon: std(0x7fa89a, .3),
    clothBrown: std(0x4a2f24, .9),
    clothRed: std(0x7a3a34, .9),
    curtain: new THREE.MeshStandardNodeMaterial({ color: 0xbcd9c6, emissive: 0xbcd9c6, emissiveIntensity: .18, roughness: .85, metalness: 0, side: THREE.DoubleSide }),
    banner: std(0x1f2a3a, .85, { side: THREE.DoubleSide }),
    inWood: lit(0x5a3f2a, .34),
    inDark: lit(0x3d2a1c, .42),
    inFloor: lit(0x6b4c33, .3),
    inPlaster: lit(0x8d7a5e, .3),
    inStone: lit(0x5b5344, .4, .9),
    inStoneBoth: new THREE.MeshStandardNodeMaterial({ color: 0x5b5344, emissive: 0x5b5344, emissiveIntensity: .32, roughness: .9, metalness: 0, side: THREE.DoubleSide }),
    inBronze: lit(0x6d5a3a, .3, .5),
    inCloth: lit(0x6c4a2a, .34, .95),
    inDrape: lit(0xa97f4b, .4, .95),
    inGold: lit(0xc69a48, .45, .4),
    books: new THREE.MeshStandardNodeMaterial({ roughness: .9, metalness: 0, vertexColors: true, emissive: 0x1c130b, emissiveIntensity: .8 }),
    leaf: new THREE.MeshStandardNodeMaterial({ roughness: .9, metalness: 0, vertexColors: true, flatShading: true })
  };
}

export function buildBailiMansion(scene) {
  const root = new THREE.Group();
  root.name = 'BailiMansion';
  root.position.x = BAILI.x;
  const M = createMaterials();
  const buckets = new Map();
  const colliders = [];
  const blocks = [];

  const add = (mat, g) => {
    const out = g.index ? g.toNonIndexed() : g;
    if (!buckets.has(mat)) buckets.set(mat, []);
    buckets.get(mat).push(out);
    return out;
  };
  const place = (g, x, y, z, ry = 0) => { if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };
  /** 按上下界放一个方块 */
  const bx = (mat, x0, x1, y0, y1, z0, z1) => add(mat, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
  const cy = (mat, rt, rb, h, x, y, z, seg = 10, open = false) => add(mat, new THREE.CylinderGeometry(rt, rb, h, seg, 1, open).translate(x, y + h / 2, z));
  const orb = (mat, r, x, y, z, seg = 6) => add(mat, new THREE.SphereGeometry(r, seg, Math.max(3, seg - 2)).translate(x, y, z));
  const solid = (x0, x1, z0, z1, y0 = -6, y1 = 40) => colliders.push({ minX: BAILI.x + x0, maxX: BAILI.x + x1, minZ: z0, maxZ: z1, minY: y0, maxY: y1 });
  const post = (x, z, r = .5) => solid(x - r, x + r, z - r, z + r);

  const Y = BAILI.floorY;

  // ------------------------------------------------------------ 组件
  function roof(mat, w, d, h, x, y, z, ridge = mat, ry = 0) {
    add(mat, place(createCurvedRoofGeometry(w, d, h, .55, .5), x, y + h / 2, z, ry));
    const len = w * .52;
    const g = new THREE.BoxGeometry(len, h * .16, Math.max(.4, d * .035));
    add(M.tileDark, place(g, x, y + h * .98, z, ry));
    for (const s of [-1, 1]) {
      const c = new THREE.ConeGeometry(h * .13, h * .4, 5);
      c.rotateZ(-s * .3);
      c.translate(s * len / 2, 0, 0);
      add(M.tileDark, place(c, x, y + h * 1.12, z, ry));
    }
  }

  /** 轴向栏杆，顺手加碰撞 */
  function rail(x0, z0, x1, z1, y = Y, blocked = true) {
    const len = Math.hypot(x1 - x0, z1 - z0), along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const n = Math.max(1, Math.round(len / 2.4));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      bx(M.wood, x - .07, x + .07, y - .1, y + 1.05, z - .07, z + .07);
    }
    for (const h of [.5, 1]) {
      if (along) bx(M.woodMid, Math.min(x0, x1), Math.max(x0, x1), y + h - .04, y + h + .04, z0 - .05, z0 + .05);
      else bx(M.woodMid, x0 - .05, x0 + .05, y + h - .04, y + h + .04, Math.min(z0, z1), Math.max(z0, z1));
    }
    if (blocked) {
      if (along) solid(Math.min(x0, x1), Math.max(x0, x1), z0 - .2, z0 + .2);
      else solid(x0 - .2, x0 + .2, Math.min(z0, z1), Math.max(z0, z1));
    }
  }

  /** 方形纸灯：立杆加一盏圆筒灯（EP17 水面两旁） */
  function lampPost(x, z, y = Y, h = 4.2) {
    cy(M.wood, .07, .09, h, x, y, z, 6);
    cy(M.paper, .5, .5, 1.1, x, y + h - .25, z, 10);
    cy(M.wood, .54, .54, .08, x, y + h - .29, z, 10);
    cy(M.wood, .54, .54, .08, x, y + h + .85, z, 10);
    glow(M.glowOut, x, y + .04, z, 5);
  }

  function glow(mat, x, y, z, r) {
    const g = new THREE.CircleGeometry(r, 18);
    g.rotateX(-Math.PI / 2);
    g.translate(x, y, z);
    add(mat, g);
  }

  function hangingLantern(x, y, z) {
    cy(M.inGold, .012, .012, 1.2, x, y + .9, z, 4);
    cy(M.paper, .42, .42, .9, x, y, z, 10);
    cy(M.inDark, .46, .46, .06, x, y - .05, z, 10);
    cy(M.inDark, .46, .46, .06, x, y + .9, z, 10);
  }

  /** 枝形烛树（书房与秘殿都有） */
  function candleTree(x, y, z, h = 3, mat = M.inBronze) {
    cy(mat, .2, .32, .14, x, y, z, 8);
    cy(mat, .05, .07, h, x, y, z, 6);
    for (const [ly, r, n] of [[h * .55, .62, 6], [h * .8, .42, 4], [h, 0, 1]]) {
      for (let i = 0; i < n; i++) {
        const a = i / n * 6.283 + ly, cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
        if (r) {
          const arm = new THREE.BoxGeometry(r, .03, .03);
          arm.translate(r / 2, 0, 0); arm.rotateY(-a);
          add(mat, arm.translate(x, y + ly, z));
        }
        cy(M.paper, .035, .04, .22, cx, y + ly, cz, 6);
        orb(M.flame, .055, cx, y + ly + .3, cz, 5);
      }
    }
    glow(M.glowIn, x, y + .05, z, 6);
  }

  function bonsai(x, y, z) {
    cy(M.celadon, .3, .22, .24, x, y, z, 8);
    cy(M.woodMid, .03, .05, .36, x, y + .22, z, 5);
    for (const [ox, oy, oz, r] of [[0, .68, 0, .3], [.18, .56, .1, .18], [-.16, .6, -.08, .2]]) orb(M.leaf, r, x + ox, y + oy, z + oz, 6);
  }

  /** 博古架：木格里放盆景和瓷瓶（EP17 水台两侧） */
  function displayShelf(x, y, z, ry = 0) {
    const w = 3.2, h = 2.1, d = .55;
    const piece = (g) => { add(M.woodMid, place(g, x, y, z, ry)); };
    for (const s of [-1, 1]) piece(new THREE.BoxGeometry(.1, h, d).translate(s * w / 2, h / 2, 0));
    for (const t of [.06, .75, 1.45, 2.05]) piece(new THREE.BoxGeometry(w, .08, d).translate(0, t, 0));
    piece(new THREE.BoxGeometry(.08, .68, d).translate(0, .4, 0));
    piece(new THREE.BoxGeometry(.08, .68, d).translate(-.7, 1.1, 0));
    const c = Math.cos(ry), s = Math.sin(ry);
    bonsai(x - .8 * c, y + .8, z + .8 * s);
    bonsai(x + .9 * c, y + 1.5, z - .9 * s);
    cy(M.celadon, .12, .2, .55, x + .8 * c, y + .1, z - .8 * s, 8);
  }

  function roundTable(x, y, z, cloth = M.clothBrown, seats = 3, indoor = false) {
    cy(cloth, .95, 1.25, .92, x, y, z, 16);
    cy(indoor ? M.inGold : M.gold, .05, .1, .14, x, y + .92, z, 6);
    orb(M.flame, .05, x, y + 1.12, z, 5);
    cy(M.celadon, .11, .14, .16, x + .4, y + .92, z - .2, 8);
    for (let i = 0; i < seats; i++) {
      const a = i / seats * 6.283 + .7, sx = x + Math.cos(a) * 1.65, sz = z + Math.sin(a) * 1.65;
      cy(indoor ? M.inDark : M.wood, .28, .24, .46, sx, y, sz, 8);
    }
    post(x, z, 1.5);
  }

  /** 二层木楼（EP18 水亭背后层层叠叠的那些） */
  function woodHouse(x, z, w, d, ry = 0) {
    const hw = w / 2, hd = d / 2;
    bx(M.stone, x - hw - .4, x + hw + .4, 0, .5, z - hd - .4, z + hd + .4);
    bx(M.lattice, x - hw, x + hw, .5, 4.2, z - hd, z + hd);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cy(M.teal, .2, .22, 8.2, x + sx * (hw + .1), .3, z + sz * (hd + .1), 8);
    roof(M.tileWhite, w + 5, d + 5, 1.5, x, 4.1, z, M.tileWhite, ry);
    bx(M.lozenge, x - hw + 1.4, x + hw - 1.4, 5.5, 8, z - hd + 1.4, z + hd - 1.4);
    for (const s of [-1, 1]) bx(M.woodMid, x - hw, x + hw, 5.55, 5.65, z + s * hd - .1, z + s * hd + .1);
    roof(M.tileWhite, w + 3, d + 3, 2.8, x, 7.9, z, M.tileWhite, ry);
    solid(x - hw - .4, x + hw + .4, z - hd - .4, z + hd + .4);
    blocks.push({ minX: BAILI.x + x - hw, maxX: BAILI.x + x + hw, minZ: z - hd, maxZ: z + hd });
  }

  // ------------------------------------------------------------ 围墙与大门
  function plasterWall(x0, x1, z0, z1, h = 5.4, mat = M.plaster) {
    bx(M.stone, x0 - .1, x1 + .1, 0, .8, z0 - .1, z1 + .1);
    bx(mat, x0, x1, .8, h, z0, z1);
    const along = x1 - x0 > z1 - z0;
    add(M.tileDark, new THREE.BoxGeometry(along ? x1 - x0 + 1 : 2.2, .35, along ? 2.2 : z1 - z0 + 1).translate((x0 + x1) / 2, h + .12, (z0 + z1) / 2));
    add(M.tileWhite, new THREE.BoxGeometry(along ? x1 - x0 + 1 : 1.2, .3, along ? 1.2 : z1 - z0 + 1).translate((x0 + x1) / 2, h + .42, (z0 + z1) / 2));
    solid(x0, x1, z0, z1);
  }
  const { halfX, gateZ, northZ } = BAILI;
  plasterWall(-halfX - .6, -halfX + .6, northZ, gateZ);
  plasterWall(halfX - .6, halfX + .6, northZ, gateZ);
  plasterWall(-halfX, halfX, northZ - .6, northZ + .6);
  plasterWall(-halfX, -6, gateZ - .6, gateZ + .6);
  plasterWall(6, halfX, gateZ - .6, gateZ + .6);
  // 前院北墙：浅色菱砖（EP21）
  plasterWall(-halfX, -BAILI.hall.halfX - 1, BAILI.hall.maxZ - .6, BAILI.hall.maxZ + .6, 5.4, M.diamondWall);
  plasterWall(BAILI.hall.halfX + 1, halfX, BAILI.hall.maxZ - .6, BAILI.hall.maxZ + .6, 5.4, M.diamondWall);

  // 大门
  for (const s of [-1, 1]) {
    cy(M.teal, .42, .46, 8, s * 6.6, 0, gateZ, 10);
    bx(M.stone, s * 6.6 - 1, s * 6.6 + 1, 0, .9, gateZ - 1, gateZ + 1);
    // 门扇向内开着
    add(M.lattice, new THREE.BoxGeometry(.25, 6.6, 5.4).translate(s * 5.7, 3.4, gateZ - 2.9));
    solid(s * 5.7 - .3, s * 5.7 + .3, gateZ - 5.6, gateZ - .2);
    // 门前石狮的位置换成一对火盆
    brazier(s * 10, gateZ + 5);
  }
  bx(M.wood, -7.4, 7.4, 7.2, 8, gateZ - .5, gateZ + .5);
  roof(M.tileWhite, 19, 9, 3, 0, 8, gateZ);
  addPlaque();

  function addPlaque() {
    bx(M.wood, -3, 3, 5.9, 7.1, gateZ + .38, gateZ + .55);
    if (typeof document === 'undefined') return;
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#1b2230'; x.fillRect(0, 0, 512, 128);
    x.fillStyle = '#d9b566'; x.font = '84px "Songti SC","Noto Serif SC",serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('百里将军府', 256, 66);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.05), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(0, 6.5, gateZ + .57);
    root.add(sign);
  }

  function brazier(x, z) {
    cy(M.bronze, .2, .36, 1.1, x, 0, z, 8);
    cy(M.bronze, .78, .36, .42, x, 1.1, z, 10);
    for (const [ox, oz, h, r] of [[0, 0, 1.5, .42], [.22, .12, 1.05, .26], [-.2, -.14, 1.15, .28]]) {
      add(M.fire, new THREE.ConeGeometry(r, h, 7).translate(x + ox, 1.5 + h / 2, z + oz));
    }
    glow(M.glowOut, x, .06, z, 9);
    post(x, z, .75);
  }

  // ------------------------------------------------------------ 前院
  const yardPave = new THREE.PlaneGeometry(halfX * 2 - 1.2, BAILI.yard.maxZ - BAILI.yard.minZ - 1);
  yardPave.rotateX(-Math.PI / 2);
  const yard = new THREE.Mesh(yardPave, createStoneRoadMaterial(false));
  yard.position.set(0, .05, (BAILI.yard.minZ + BAILI.yard.maxZ) / 2);
  yard.receiveShadow = true;
  root.add(yard);
  for (const s of [-1, 1]) for (const z of [176, 191, 206]) brazier(s * 13, z);
  for (const s of [-1, 1]) for (const x of [34, 58]) {
    const px = s * x, pz = BAILI.yard.minZ + 1.6;
    cy(M.wood, .07, .09, 7, px, 0, pz, 6);
    bx(M.banner, px - .02, px + .02, 3, 6.8, pz + .02, pz + 1.7);
  }
  // 兵器架
  for (const s of [-1, 1]) {
    const x = s * 68;
    bx(M.wood, x - 2.4, x + 2.4, 1.5, 1.62, 198, 198.2);
    for (const k of [-2, -1, 0, 1, 2]) {
      const g = new THREE.CylinderGeometry(.03, .03, 2.8, 5);
      g.rotateX(.14);
      add(M.woodMid, g.translate(x + k, 1.4, 198.1));
      add(M.bronze, new THREE.ConeGeometry(.07, .4, 4).translate(x + k, 2.95, 198.3));
    }
    solid(x - 2.5, x + 2.5, 197.6, 198.8);
  }

  // ------------------------------------------------------------ 正堂（书房）
  const H = BAILI.hall, top = Y + H.wallH;
  bx(M.stone, -H.halfX - 1, H.halfX + 1, 0, Y - .02, H.minZ, H.maxZ);
  bx(M.inFloor, -H.halfX, H.halfX, Y - .1, Y, H.minZ, H.maxZ);
  // 南门台阶
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    bx(M.stone, -BAILI.stairS.halfX, BAILI.stairS.halfX, 0, Y * (1 - t), H.maxZ, H.maxZ + 1 + i);
  }
  // 南立面：菱花板在下，格扇在上
  for (const s of [-1, 1]) {
    const a = s > 0 ? H.doorS : -H.halfX, b = s > 0 ? H.halfX : -H.doorS;
    bx(M.lozenge, a, b, Y, Y + 2.8, H.maxZ - .25, H.maxZ + .25);
    bx(M.lattice, a, b, Y + 2.8, top, H.maxZ - .25, H.maxZ + .25);
    bx(M.woodMid, a, b, Y + 2.8, Y + 2.95, H.maxZ - .3, H.maxZ + .3);
    solid(a, b, H.maxZ - .4, H.maxZ + .4);
    // 室内这面贴一层暖色，纸面不至于发白
    bx(M.inPlaster, a, b, Y, top, H.maxZ - .3, H.maxZ - .26);
  }
  bx(M.lattice, -H.doorS, H.doorS, Y + 5.2, top, H.maxZ - .25, H.maxZ + .25);
  // 北立面
  for (const s of [-1, 1]) {
    const a = s > 0 ? H.doorN : -H.halfX, b = s > 0 ? H.halfX : -H.doorN;
    bx(M.lattice, a, b, Y, top, H.minZ - .25, H.minZ + .25);
    solid(a, b, H.minZ - .4, H.minZ + .4);
    bx(M.inPlaster, a, b, Y, top, H.minZ + .26, H.minZ + .3);
    // 北门两扇向内开（EP17 10:00 那个框景）
    bx(M.wood, s * (H.doorN + .15) - .12, s * (H.doorN + .15) + .12, Y, Y + 6.2, H.minZ + .2, H.minZ + 4.8);
    bx(M.lattice, s * (H.doorN + .15) - .15, s * (H.doorN + .15) + .15, Y + .9, Y + 5.6, H.minZ + .5, H.minZ + 4.5);
    solid(s * (H.doorN + .15) - .3, s * (H.doorN + .15) + .3, H.minZ, H.minZ + 4.9);
  }
  bx(M.lattice, -H.doorN, H.doorN, Y + 6.4, top, H.minZ - .25, H.minZ + .25);
  // 东西山墙
  for (const s of [-1, 1]) {
    bx(M.plaster, s * H.halfX - .3, s * H.halfX + .3, Y, top, H.minZ, H.maxZ);
    bx(M.inPlaster, s * (H.halfX - .32) - .02, s * (H.halfX - .32) + .02, Y, top, H.minZ, H.maxZ);
    solid(s * H.halfX - .5, s * H.halfX + .5, H.minZ, H.maxZ);
    // 外立柱
    for (const z of [H.minZ, (H.minZ + H.maxZ) / 2, H.maxZ]) cy(M.teal, .3, .34, H.wallH + .6, s * H.halfX, Y - .4, z, 10);
    // 圆窗：EP18 那扇水墨蓝山
    const disc = new THREE.CircleGeometry(4.2, 40);
    disc.rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2);
    add(M.inkWindow, disc.translate(s * (H.halfX - .36), Y + 4.2, 150));
    const ringG = new THREE.TorusGeometry(4.3, .24, 8, 40);
    ringG.rotateY(Math.PI / 2);
    add(M.inWood, ringG.translate(s * (H.halfX - .4), Y + 4.2, 150));
  }
  // 正面的青绿立柱与灯（EP18 走廊）
  for (const x of [-26, -17, -5.4, 5.4, 17, 26]) {
    cy(M.teal, .3, .34, H.wallH + .4, x, Y - .2, H.maxZ + .5, 10);
    bx(M.woodMid, x - .34, x + .34, top - .4, top + .2, H.maxZ + .2, H.maxZ + .8);
  }
  for (const x of [-11.4, 11.4]) {
    cy(M.wood, .01, .01, 1, x, top - 1, H.maxZ + .5, 4);
    cy(M.paper, .42, .42, 1.1, x, top - 2.1, H.maxZ + .5, 8);
    bx(M.wood, x - .55, x + .55, top - 1.05, top - .98, H.maxZ - .05, H.maxZ + 1.05);
    bx(M.wood, x - .55, x + .55, top - 2.2, top - 2.13, H.maxZ - .05, H.maxZ + 1.05);
  }
  bx(M.woodMid, -H.halfX - .4, H.halfX + .4, top - .1, top + .35, H.maxZ + .2, H.maxZ + .8);
  bx(M.woodMid, -H.halfX - .4, H.halfX + .4, top - .1, top + .35, H.minZ - .8, H.minZ - .2);
  bx(M.inDark, -H.halfX, H.halfX, top - .05, top + .1, H.minZ, H.maxZ);
  for (let z = H.minZ + 3; z < H.maxZ; z += 6) bx(M.inWood, -H.halfX, H.halfX, top - .42, top - .05, z - .2, z + .2);
  roof(M.tileWhite, 66, 44, 3.2, 0, top + .1, (H.minZ + H.maxZ) / 2);
  roof(M.tileWhite, 46, 28, 5, 0, top + 3.2, (H.minZ + H.maxZ) / 2);
  blocks.push({ minX: BAILI.x - H.halfX, maxX: BAILI.x + H.halfX, minZ: H.minZ, maxZ: H.maxZ, landmark: true });

  // 书房陈设
  function bookcase(x0, x1, z0, z1, h = 6) {
    const along = x1 - x0 > z1 - z0;
    const len = along ? x1 - x0 : z1 - z0;
    bx(M.inWood, x0, x1, Y, Y + h, z0, z1);
    const cols = Math.max(2, Math.round(len / 1.6)), rows = 5, front = along ? (z0 < 140 ? z1 : z0) : (x0 < 0 ? x1 : x0);
    const dir = along ? (z0 < 140 ? 1 : -1) : (x0 < 0 ? 1 : -1);
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const cellS = len / cols, u = (along ? x0 : z0) + (c + .5) * cellS, y = Y + .25 + r * (h - .4) / rows;
      // 空格：深色背板 + 成捆的书卷
      const shade = new THREE.Color().setHSL(.07 + ((c * 7 + r * 3) % 5) * .012, .55, .025 + ((c + r * 2) % 4) * .03);
      const gw = cellS * .8, gh = (h - .4) / rows * .72;
      const g = along ? new THREE.BoxGeometry(gw, gh, .06).translate(u, y + gh / 2, front + dir * .03) : new THREE.BoxGeometry(.06, gh, gw).translate(front + dir * .03, y + gh / 2, u);
      const n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([shade.r, shade.g, shade.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      add(M.books, g);
    }
    solid(x0, x1, z0, z1);
  }
  const hx = H.halfX - .5;
  bookcase(-hx, -hx + 1.3, H.minZ + .5, 144.5);
  bookcase(-hx, -hx + 1.3, 155.5, H.maxZ - .5);
  bookcase(hx - 1.3, hx, H.minZ + .5, 144.5);
  bookcase(hx - 1.3, hx, 155.5, H.maxZ - .5);
  bookcase(-hx + 1.4, -H.doorN - .6, H.minZ + .4, H.minZ + 1.6);
  bookcase(H.doorN + .6, hx - 1.4, H.minZ + .4, H.minZ + 1.6);

  // 百里渊的书案，正对圆窗
  bx(M.inDark, -21.6, -18.6, Y, Y + 1, 146.5, 153.5);
  bx(M.inWood, -22, -18.2, Y + 1, Y + 1.14, 146, 154);
  cy(M.celadon, .2, .28, .7, -20, Y + 1.14, 147, 8);
  for (const z of [149.6, 150.3, 151, 151.7]) {
    const g = new THREE.CylinderGeometry(.07, .07, 1.3, 6);
    g.rotateZ(Math.PI / 2);
    add(M.inPlaster, g.translate(-20.1, Y + 1.22, z));
  }
  cy(M.inDark, .42, .38, .95, -23, Y, 150, 8);
  solid(-22, -18.2, 146, 154);
  // 地毯
  const rug = new THREE.CircleGeometry(7.6, 40);
  rug.rotateX(-Math.PI / 2);
  add(M.inCloth, rug.translate(0, Y + .03, 150));
  const rugRing = new THREE.RingGeometry(6.4, 6.9, 40);
  rugRing.rotateX(-Math.PI / 2);
  add(M.inGold, rugRing.translate(0, Y + .045, 150));
  // 东侧议事的圆桌
  roundTable(18, Y, 144, M.inCloth, 4, true);
  roundTable(18, Y, 157, M.inCloth, 4, true);
  for (const [x, z] of [[-13, 140], [13, 140], [-13, 160], [13, 160]]) { candleTree(x, Y, z, 3.1); post(x, z, .4); }
  for (const [x, z] of [[-7, 145], [7, 145], [-7, 156], [7, 156]]) hangingLantern(x, top - 2.2, z);
  // 北门上方的赭色帷幔
  for (const s of [-1, 1]) {
    const d = new THREE.CylinderGeometry(4.1, 4.1, .4, 12, 1, true, 0, Math.PI);
    d.rotateZ(Math.PI / 2); d.scale(1, .34, .45);
    add(M.inDrape, d.translate(s * 4, Y + 6.3, H.minZ + .6));
  }
  bx(M.inDrape, -8, 8, Y + 6.1, Y + 6.5, H.minZ + .4, H.minZ + .55);
  bonsai(-11, Y, H.minZ + 2.4); bonsai(11, Y, H.minZ + 2.4);

  // ------------------------------------------------------------ 水面与木构
  const L = BAILI.lake;
  const waterGeo = new THREE.PlaneGeometry(L.halfX * 2, L.maxZ - L.minZ);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMesh = new THREE.Mesh(waterGeo, M.water);
  waterMesh.position.set(0, .22, (L.minZ + L.maxZ) / 2);
  root.add(waterMesh);
  // 岸沿
  for (const s of [-1, 1]) {
    bx(M.stone, s * L.halfX - .5, s * L.halfX + .5, 0, .6, L.minZ, L.maxZ);
    solid(s * L.halfX - .35, s * L.halfX + .35, L.minZ, BAILI.walk.minZ - .05);
    solid(s * L.halfX - .35, s * L.halfX + .35, BAILI.walk.maxZ + .05, L.maxZ);
    bx(M.stone, s > 0 ? H.halfX : -L.halfX, s > 0 ? L.halfX : -H.halfX, 0, .6, L.maxZ - .5, L.maxZ + .5);
    solid(s > 0 ? H.halfX : -L.halfX, s > 0 ? L.halfX : -H.halfX, L.maxZ - .4, L.maxZ + .4);
  }
  bx(M.stone, -L.halfX, L.halfX, 0, .6, L.minZ - .5, L.minZ + .5);
  solid(-L.halfX, L.halfX, L.minZ - .4, L.minZ + .4);

  function boardwalk(x0, x1, z0, z1) {
    bx(M.plank, x0, x1, Y - .22, Y, z0, z1);
    const n = Math.max(1, Math.round(Math.max(x1 - x0, z1 - z0) / 6));
    for (let i = 0; i <= n; i++) for (const s of [0, 1]) {
      const along = x1 - x0 > z1 - z0;
      const x = along ? x0 + (x1 - x0) * i / n : (s ? x1 - .2 : x0 + .2);
      const z = along ? (s ? z1 - .2 : z0 + .2) : z0 + (z1 - z0) * i / n;
      cy(M.wood, .13, .13, Y, x, 0, z, 6);
    }
  }

  const D = BAILI.deck, P = BAILI.pier, PV = BAILI.pavilion, W = BAILI.walk, G = BAILI.greenIsle;
  boardwalk(-D.halfX, D.halfX, D.minZ, D.maxZ);
  boardwalk(-P.halfX, P.halfX, P.minZ, P.maxZ);
  boardwalk(-PV.halfX, PV.halfX, PV.minZ, PV.maxZ);
  boardwalk(G.minDx, G.maxDx, G.minZ, G.maxZ);
  boardwalk(-L.halfX, -PV.halfX, W.minZ, W.maxZ);
  boardwalk(PV.halfX, G.minDx, W.minZ, W.maxZ);
  boardwalk(G.maxDx, L.halfX, W.minZ, W.maxZ);

  // 木台栏杆，留出栈桥口
  rail(-D.halfX, D.minZ, -P.halfX, D.minZ); rail(P.halfX, D.minZ, D.halfX, D.minZ);
  rail(-D.halfX, D.minZ, -D.halfX, D.maxZ); rail(D.halfX, D.minZ, D.halfX, D.maxZ);
  // 栈桥两边
  rail(-P.halfX, P.minZ, -P.halfX, P.maxZ); rail(P.halfX, P.minZ, P.halfX, P.maxZ);
  // 蓝瓦亭平台：南留栈桥口，东西留水廊口
  rail(-PV.halfX, PV.maxZ, -P.halfX, PV.maxZ); rail(P.halfX, PV.maxZ, PV.halfX, PV.maxZ);
  rail(-PV.halfX, PV.minZ, PV.halfX, PV.minZ);
  for (const s of [-1, 1]) {
    rail(s * PV.halfX, PV.minZ, s * PV.halfX, W.minZ);
    rail(s * PV.halfX, W.maxZ, s * PV.halfX, PV.maxZ);
  }
  // 水廊
  for (const z of [W.minZ, W.maxZ]) {
    rail(-L.halfX, z, -PV.halfX, z);
    rail(PV.halfX, z, G.minDx, z);
    rail(G.maxDx, z, L.halfX, z);
  }
  // 绿帘亭平台
  rail(G.minDx, G.minZ, G.maxDx, G.minZ); rail(G.minDx, G.maxZ, G.maxDx, G.maxZ);
  for (const x of [G.minDx, G.maxDx]) { rail(x, G.minZ, x, W.minZ); rail(x, W.maxZ, x, G.maxZ); }
  // 水廊两端下岸的台阶
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const a = BAILI.walkStairs.from + i, h = Y * (1 - (i + .5) / 4);
    const x0 = s > 0 ? a : -a - 1, x1 = s > 0 ? a + 1 : -a;
    bx(M.stone, x0, x1, 0, h, W.minZ, W.maxZ);
  }

  // 木台陈设（EP17 10:00）
  displayShelf(-13, Y, 130.5); displayShelf(13, Y, 130.5);
  solid(-14.7, -11.3, 130.2, 130.8); solid(11.3, 14.7, 130.2, 130.8);
  roundTable(0, Y, 124, M.clothRed, 3);
  for (const [x, z] of [[-20, 120], [20, 120], [-5, 112], [5, 112], [-5, 96], [5, 96], [-5, 80], [5, 80]]) lampPost(x, z, Y, 3.6);
  for (const x of [-48, -28, 22, 52]) { lampPost(x, W.minZ - .6, Y, 3.2); lampPost(x, W.maxZ + .6, Y, 3.2); }

  // 蓝瓦水亭
  const pz = PV.dz;
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
    cy(M.wood, .24, .28, 5, x, Y, pz + z, 8);
    post(x, pz + z, .4);
  }
  bx(M.wood, -6.3, 6.3, Y + 4.8, Y + 5.2, pz - 6.3, pz + 6.3);
  roof(M.tileBlue, 19, 19, 3.8, 0, Y + 5.1, pz);
  orb(M.gold, .4, 0, Y + 9.5, pz, 8);
  for (const [x, z] of [[-3.8, -4], [3.8, -4]]) {
    cy(M.stone, .28, .42, .95, x, Y, pz + z, 8);
    post(x, pz + z, .45);
  }
  for (const [x, z] of [[-5.8, 5.8], [5.8, 5.8], [-5.8, -5.8], [5.8, -5.8]]) cy(M.paper, .32, .32, .7, x, Y + 3.6, pz + z, 8);

  // 绿帘水亭（EP18 33:45）
  const gx = (G.minDx + G.maxDx) / 2, gz = (G.minZ + G.maxZ) / 2;
  for (const [x, z] of [[-5.6, -5.6], [5.6, -5.6], [-5.6, 5.6], [5.6, 5.6], [0, 5.6]]) {
    if (x === 0) continue;
    cy(M.teal, .26, .3, 5.2, gx + x, Y, gz + z, 10);
    post(gx + x, gz + z, .4);
    // 束起的纱帘
    // 束在柱边的纱帘：上宽下收，在腰部系住
    for (const [ox, oz] of [[Math.sign(x) * -.42, 0], [0, Math.sign(z) * -.42]]) {
      const top = new THREE.CylinderGeometry(.42, .13, 2.3, 8, 1, true);
      add(M.curtain, top.translate(gx + x + ox, Y + 3.55, gz + z + oz));
      const low = new THREE.CylinderGeometry(.13, .3, 2.4, 8, 1, true);
      add(M.curtain, low.translate(gx + x + ox, Y + 1.2, gz + z + oz));
      cy(M.gold, .15, .15, .08, gx + x + ox, Y + 2.38, gz + z + oz, 8);
    }
  }
  bx(M.wood, gx - 5.9, gx + 5.9, Y + 5, Y + 5.35, gz - 5.9, gz + 5.9);
  // 四面檐下的帘头，一段段垂下来
  for (const [dx, dz, w, d] of [[0, -5.6, 11.2, .05], [0, 5.6, 11.2, .05], [-5.6, 0, .05, 11.2], [5.6, 0, .05, 11.2]]) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const t = (i + .5) / n - .5, sw = (w > d ? w : d) / n;
      const px = gx + dx + (w > d ? t * w : 0), pz = gz + dz + (w > d ? 0 : t * d);
      const swag = new THREE.CylinderGeometry(sw / 2, sw / 2, w > d ? d + .9 : w + .9, 10, 1, true, 0, Math.PI);
      swag.rotateX(Math.PI / 2);
      if (w < d) swag.rotateY(Math.PI / 2);
      swag.scale(1, .7, 1);
      add(M.curtain, swag.translate(px, Y + 4.95, pz));
    }
  }
  roof(M.tileWhite, 18, 18, 3.4, gx, Y + 5.3, gz);
  roundTable(gx - 1.6, Y, gz + 2.4, M.clothRed, 3);
  // 棋盘（EP18）
  bx(M.woodMid, gx + .8, gx + 3.6, Y, Y + .78, gz - 3.8, gz - 1);
  bx(M.gold, gx + .9, gx + 3.5, Y + .78, Y + .84, gz - 3.7, gz - 1.1);
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4, r = .25 + i * .04;
    orb(i % 2 ? M.plaster : M.tileDark, .055, gx + 2.2 + Math.cos(a) * r, Y + .86, gz - 2.4 + Math.sin(a) * r, 5);
  }
  post(gx + 2.2, gz - 2.4, 1.4);

  // ------------------------------------------------------------ 假山瀑布（EP17 10:00 视线的终点）
  const R = BAILI.rock;
  const rockCentre = (R.minZ + R.maxZ) / 2 - 2;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) {
    const a = rnd() * 6.283, d = Math.sqrt(rnd()), rx = d * R.halfX * .95, rz = d * 13;
    const peak = 1 - d * .8;
    const size = 3.4 + rnd() * 6 * (1 - d * .4);
    const g = new THREE.IcosahedronGeometry(size, 1);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const n = 1 + Math.sin(p.getX(k) * 1.7 + i) * Math.cos(p.getZ(k) * 1.3 + i * .7) * .22;
      p.setXYZ(k, p.getX(k) * n, p.getY(k) * n * 1.25, p.getZ(k) * n);
    }
    g.computeVertexNormals();
    add(M.rock, g.translate(Math.cos(a) * rx, rnd() * (4 + 27 * peak), rockCentre + Math.sin(a) * rz));
  }
  for (const [x, w, tall] of [[-13, 4, 15], [-1, 7, 25], [11, 3.5, 13]]) {
    const f = new THREE.PlaneGeometry(w, tall);
    add(M.fall, f.translate(x, tall / 2 + .2, R.maxZ + 1.1));
    const pool = new THREE.CircleGeometry(w * .75, 14);
    pool.rotateX(-Math.PI / 2);
    add(M.plaster, pool.scale(1, 1, .45).translate(x, .26, R.maxZ + 1.7));
  }
  solid(-R.halfX, R.halfX, R.minZ, L.minZ);
  blocks.push({ minX: BAILI.x - R.halfX, maxX: BAILI.x + R.halfX, minZ: R.minZ, maxZ: R.maxZ });

  // ------------------------------------------------------------ 木楼
  woodHouse(-71, 82, 18, 20);
  woodHouse(-71, 118, 18, 22);
  woodHouse(-71, 150, 18, 18);
  woodHouse(71, 92, 18, 22);
  woodHouse(71, 128, 18, 22);
  woodHouse(44, 150, 26, 16);
  woodHouse(-44, 150, 26, 16);

  // ------------------------------------------------------------ 八角秘殿（EP21）
  const O = BAILI.octagon, a = O.apothem, side = 2 * a * Math.tan(Math.PI / 8), wallTop = O.floor + 9;
  const oShape = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const t = Math.PI / 8 + i * Math.PI / 4, r = a / Math.cos(Math.PI / 8);
    const px = Math.sin(t) * r, py = Math.cos(t) * r;
    if (i) oShape.lineTo(px, py); else oShape.moveTo(px, py);
  }
  oShape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, O.rimR, 0, Math.PI * 2, true);
  oShape.holes.push(hole);
  const oFloor = new THREE.ShapeGeometry(oShape, 32);
  oFloor.rotateX(-Math.PI / 2);
  add(M.inStone, oFloor.translate(O.dx, O.floor, O.z));
  // 下沉的三级台阶
  const riser = (O.floor - O.pit) / 3;
  for (const [outer, inner, k] of [[12, 11, 2], [11, 10, 1], [10, 9, 0]]) {
    const y = O.pit + riser * k + .03;
    const r = new THREE.RingGeometry(inner, outer, 48);
    r.rotateX(-Math.PI / 2);
    add(M.inStone, r.translate(O.dx, y, O.z));
    add(M.inStoneBoth, new THREE.CylinderGeometry(outer, outer, riser, 48, 1, true).translate(O.dx, y + riser / 2, O.z));
  }
  add(M.inStoneBoth, new THREE.CylinderGeometry(9, 9, .05, 48, 1, true).translate(O.dx, O.pit + .025, O.z));
  const sandDisc = new THREE.CircleGeometry(9, 48);
  sandDisc.rotateX(-Math.PI / 2);
  add(M.sand, sandDisc.translate(O.dx, O.pit, O.z));
  // 外层台基（只要侧面，顶面就是上面的石地）
  const base = new THREE.CylinderGeometry(a / Math.cos(Math.PI / 8) + .1, a / Math.cos(Math.PI / 8) + .5, O.floor, 8, 1, true);
  base.rotateY(Math.PI / 8);
  add(M.stone, base.translate(O.dx, O.floor / 2, O.z));

  const wallGeo = (w, h) => new THREE.BoxGeometry(w, h, .9);
  const DOOR = BAILI.octStairs.halfX;
  for (let i = 0; i < 8; i++) {
    const t = i * Math.PI / 4, nx = Math.sin(t), nz = Math.cos(t), cx = O.dx + nx * a, cz = O.z + nz * a;
    const piece = (mat, w, h, offset, y) => {
      const g = wallGeo(w, h);
      g.translate(offset, y, 0);
      g.rotateY(t);
      add(mat, g.translate(cx, 0, cz));
    };
    if (i === 0) {
      const w = (side - DOOR * 2) / 2 + .2;
      for (const s of [-1, 1]) {
        piece(M.inStone, w, 6, s * (DOOR + w / 2), O.floor + 3);
        const ext = new THREE.BoxGeometry(w, 6, .12);
        ext.translate(s * (DOOR + w / 2), O.floor + 3, .5); ext.rotateY(t);
        add(M.plaster, ext.translate(cx, 0, cz));
      }
    } else {
      piece(M.inStone, side + .2, 6, 0, O.floor + 3);
      const ext = new THREE.BoxGeometry(side + .2, 6, .12);
      ext.translate(0, O.floor + 3, .5); ext.rotateY(t);
      add(M.plaster, ext.translate(cx, 0, cz));
    }
    piece(M.frieze, side + .2, 2.2, 0, O.floor + 7.1 + .0);
    // 碰撞：沿墙切成小方块
    const n = Math.ceil(side / 1.2), tx = Math.cos(t), tz = -Math.sin(t);
    for (let k = 0; k <= n; k++) {
      const off = -side / 2 + side * k / n;
      if (i === 0 && Math.abs(off) < DOOR) continue;
      const x = cx + tx * off, z = cz + tz * off;
      solid(x - .75, x + .75, z - .75, z + .75);
    }
  }
  // 门口
  for (const s of [-1, 1]) cy(M.teal, .34, .38, 7, O.dx + s * (DOOR + .2), O.floor, O.z + a + .55, 10);
  bx(M.wood, O.dx - DOOR - .6, O.dx + DOOR + .6, O.floor + 6.3, O.floor + 7.1, O.z + a + .2, O.z + a + 1.1);
  // 石阶
  for (let i = 0; i < 8; i++) {
    const t = i / 8, os = BAILI.octStairs;
    bx(M.stone, O.dx - os.halfX, O.dx + os.halfX, 0, O.floor * (1 - t) , os.minZ, os.minZ + (os.maxZ - os.minZ) * (t + 1 / 8));
  }
  // 屋顶
  bx(M.inDark, O.dx - 19.5, O.dx + 19.5, wallTop + .1, wallTop + .2, O.z - 19.5, O.z + 19.5);
  // 藻井：八根梁汇到中央的吊灯
  for (let i = 0; i < 8; i++) {
    const t = i * Math.PI / 4 + Math.PI / 8;
    const beam = new THREE.BoxGeometry(.5, .55, 19);
    beam.translate(0, 0, 9.5); beam.rotateY(t);
    add(M.inWood, beam.translate(O.dx, wallTop - .2, O.z));
  }
  cy(M.inWood, 7, 7, .25, O.dx, wallTop - .45, O.z, 8, true);
  const lampRing = new THREE.TorusGeometry(4.4, .09, 6, 24);
  lampRing.rotateX(Math.PI / 2);
  add(M.inGold, lampRing.translate(O.dx, wallTop - 2.6, O.z));
  for (let i = 0; i < 12; i++) {
    const t = i / 12 * 6.283, x = O.dx + Math.cos(t) * 4.4, z = O.z + Math.sin(t) * 4.4;
    cy(M.paper, .05, .05, .24, x, wallTop - 2.55, z, 6);
    orb(M.flame, .08, x, wallTop - 2.2, z, 5);
    if (i % 3 === 0) cy(M.inGold, .012, .012, 2.2, x, wallTop - 2.6, z, 4);
  }
  const oRoof = new THREE.CylinderGeometry(3.5, a / Math.cos(Math.PI / 8) + 3.4, 7.5, 8, 1);
  oRoof.rotateY(Math.PI / 8);
  add(M.tileDark, oRoof.translate(O.dx, wallTop + 3.7, O.z));
  cy(M.tileDark, .6, 3.6, 2.4, O.dx, wallTop + 7.4, O.z, 8);
  orb(M.gold, .55, O.dx, wallTop + 10, O.z, 8);
  // 青铜香炉，一左一右立在下沉台阶边（EP21 15:00）
  function censer(x, z) {
    const pts = [[0, 0], [.75, 0], [.6, .25], [.26, .5], [.3, 1.1], [.82, 1.7], [.82, 2.25], [.36, 2.65], [.3, 3.1], [.08, 3.6], [0, 3.6]].map(([r, y]) => new THREE.Vector2(r, y));
    const g = new THREE.LatheGeometry(pts, 12);
    add(M.inBronze, g.translate(x, O.floor, z));
    for (let i = 0; i < 3; i++) {
      const ang = i * 2.094, leg = new THREE.BoxGeometry(.1, 1.1, .1);
      leg.rotateZ(.3); leg.rotateY(ang);
      add(M.inBronze, leg.translate(x + Math.cos(ang) * .9, O.floor + 1.7, z + Math.sin(ang) * .9));
    }
    post(x, z, .9);
  }
  censer(O.dx - 9, O.z + 12.2);
  censer(O.dx + 9, O.z + 12.2);
  censer(O.dx - 12.6, O.z - 9.5);
  censer(O.dx + 12.6, O.z - 9.5);
  for (const [x, z] of [[-6, 3.4], [6, 3.4], [-6, -3.6], [6, -3.6]]) { candleTree(O.dx + x, O.pit, O.z + z, 3.3); post(O.dx + x, O.z + z, .4); }
  for (const [x, z] of [[-14, 3], [14, 3], [-14, -3], [14, -3]]) candleTree(O.dx + x, O.floor, O.z + z, 2.8);
  // 北端的案台与审问架（EP21）
  bx(M.inDark, O.dx - 3.2, O.dx + 3.2, O.pit, O.pit + 1, O.z - 7.6, O.z - 5.8);
  bx(M.inWood, O.dx - 3.5, O.dx + 3.5, O.pit + 1, O.pit + 1.12, O.z - 7.8, O.z - 5.6);
  cy(M.inGold, .14, .2, .4, O.dx + 1.8, O.pit + 1.12, O.z - 6.6, 8);
  solid(O.dx - 3.5, O.dx + 3.5, O.z - 7.8, O.z - 5.6);
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(.24, 5.4, .24);
    g.rotateZ(s * .42);
    add(M.inDark, g.translate(O.dx - 12 + s * .1, O.floor + 2.4, O.z - 14));
  }
  // 北墙暗门：替身倒下后，真身从这里走出来
  bx(M.inDark, O.dx - 2.4, O.dx + 2.4, O.floor, O.floor + 5.6, O.z - a + .45, O.z - a + .6);
  bx(M.inGold, O.dx - .12, O.dx + .12, O.floor, O.floor + 5.6, O.z - a + .6, O.z - a + .64);
  blocks.push({ minX: BAILI.x + O.dx - a, maxX: BAILI.x + O.dx + a, minZ: O.z - a, maxZ: O.z + a, landmark: true });
  // 东岸通往秘殿的石径
  const pathG = new THREE.PlaneGeometry(6, 28);
  pathG.rotateX(-Math.PI / 2);
  add(M.stone, pathG.translate(O.dx + 10, .05, 47));
  const pathT = new THREE.PlaneGeometry(14, 6);
  pathT.rotateX(-Math.PI / 2);
  add(M.stone, pathT.translate(O.dx + 5, .05, 34.5));
  lampPost(O.dx + 13.5, 40, 0, 3.6);
  lampPost(O.dx - 5.6, 36, 0, 3.6);

  // ------------------------------------------------------------ 树：院内阔叶，墙外把山坡盖绿
  const treeParts = [];
  const paint = (g, hex) => {
    const c = new THREE.Color(hex), out = g.index ? g.toNonIndexed() : g, n = out.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return out;
  };
  treeParts.push(paint(new THREE.CylinderGeometry(.22, .36, 4, 6).translate(0, 2, 0), 0x3a2c20));
  for (const [x, y, z, r, c] of [[0, 5.6, 0, 2.6, 0x3f6e35], [1.7, 4.8, .5, 1.9, 0x4c7f3d], [-1.5, 5, -.6, 2, 0x35602f], [.2, 7, -.3, 1.8, 0x568a43]]) {
    treeParts.push(paint(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), c));
  }
  const treeGeo = mergeGeometries(treeParts);
  const spots = [];
  const inside = [[-58, -24, -14, 8], [-78, -62, 44, 66], [-58, -30, 20, 38], [30, 36, -16, -8], [62, 78, 66, 76], [-58, -30, 138, 141], [30, 58, 138, 141], [-78, 78, -18, -10]];
  for (const [x0, x1, z0, z1] of inside) {
    const n = Math.max(2, Math.round((x1 - x0) * (z1 - z0) / 70));
    for (let i = 0; i < n; i++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (Math.hypot(x - O.dx, z - O.z) < a + 4) continue;
      spots.push([x, z, .9 + rnd() * .6]);
      post(x, z, .45);
    }
  }
  for (let i = 0; i < 320; i++) {
    const t = rnd() * 6.283, x = Math.cos(t) * (100 + rnd() * 130), z = 95 + Math.sin(t) * (135 + rnd() * 110);
    if (Math.abs(x) < halfX + 6 && z < BAILI.road.z + 12 && z > northZ - 6) continue;
    if (z > BAILI.road.z - 12 && z < BAILI.road.z + 12) continue;
    spots.push([x, z, 1.2 + rnd() * 1.2, true]);
  }
  const trees = new THREE.InstancedMesh(treeGeo, M.leaf, spots.length);
  const dummy = new THREE.Object3D();
  spots.forEach(([x, z, s], i) => {
    dummy.position.set(x, getTerrainHeight(BAILI.x + x, z) - .2, z); dummy.rotation.y = i * 1.7; dummy.scale.setScalar(s); dummy.updateMatrix();
    trees.setMatrixAt(i, dummy.matrix);
  });
  trees.castShadow = true;
  trees.frustumCulled = false;
  trees.userData.outsideTrees = spots.filter((s) => s[3]).length;
  root.add(trees);

  // ------------------------------------------------------------ 合并
  const NO_SHADOW = new Set([M.fire, M.glowIn, M.glowOut, M.fall, M.flame, M.inkWindow]);
  for (const [mat, list] of buckets) {
    for (const g of list) { if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); }
    const merged = mergeGeometries(list);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = !NO_SHADOW.has(mat) && !mat.transparent;
    mesh.receiveShadow = !NO_SHADOW.has(mat);
    if (mat === M.glowIn || mat === M.glowOut) mesh.renderOrder = 3;
    root.add(mesh);
  }

  scene.add(root);
  return { root, colliders, blocks };
}
