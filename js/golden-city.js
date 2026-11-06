// js/golden-city.js
// 天外旧都：EP19 04:20 动画“后来各方面技法飞速提升”里那座科技鼎盛的城，由星图镜进入（它早已不存在）。
// 造型依动画：棱角主塔、穿城的黑色高架环线、飞船、蘑菇平台、远处的圆筒塔。街区网格、整数贴墙的窗格加 fwidth 抗闪、
// 实例按格切块剔除的做法，参考 mrdoob/slop-newyork（MIT）；代码是针对这里重写的，没有用它的地理数据。

import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, attribute, uv, positionWorld, normalGeometry, abs, fract, floor, mix, smoothstep, step, sin, time,
  max, min, fwidth
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2D, noise2D } from './tsl-materials.js';
import { mood as homeMood, createStarMirror } from './homeworld.js';
import { PAST } from './homeworld-config.js';

const { avenue: AVE, street: STR, extent: EXT, hero: HERO, parkZ: PARK } = PAST;
let seed = 91;
const rnd = (a = 0, b = 1) => { seed = (seed * 16807) % 2147483647; return a + (b - a) * ((seed - 1) / 2147483646); };
const merged = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, x = 0, y = 0, z = 0, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);
const local = () => positionWorld.xz.sub(vec2(PAST.x, PAST.z));

// ---------------------------------------------------------------- 立面
/** 窗格按 iSize（周长、高、种子）取整贴墙；格子小到一两个像素时，淡成亮窗的平均值，远处不闪 */
function facadeMaterial(wallHex, glassHex) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.42, metalness: 0.2 });
  const size = attribute('iSize', 'vec3');
  const wall = new THREE.Color(wallHex), glass = new THREE.Color(glassHex);
  const side = () => smoothstep(0.5, 0.2, abs(normalGeometry.y));
  const grid = () => vec2(uv().x.mul(floor(size.x.div(2.4).add(0.5))), uv().y.mul(floor(size.y.div(3.8).add(0.5))));
  const near = () => { const w = fwidth(grid()); return smoothstep(0.7, 0.25, max(w.x, w.y)); };
  const opening = () => {
    const f = fract(grid());
    // 细框幕墙：绝大部分是玻璃，每层一道窗下墙
    return smoothstep(0.03, 0.07, f.x).mul(smoothstep(0.97, 0.93, f.x)).mul(smoothstep(0.1, 0.16, f.y)).mul(smoothstep(0.97, 0.92, f.y));
  };
  const coverage = () => mix(float(0.78), opening(), near());
  const lit = () => mix(float(0.24), smoothstep(0.74, 0.8, hash2D(floor(grid()).add(size.z.mul(41)))), near());
  m.colorNode = Fn(() => {
    // 每隔几列一道竖肋：高塔的主要轮廓语言
    const rib = smoothstep(0.86, 0.9, fract(uv().x.mul(floor(size.x.div(14).add(1))))).mul(side());
    // 玻璃映着天：越高越亮，每栋楼色调略有差别
    const sky = mix(vec3(glass.r, glass.g, glass.b), vec3(0.42, 0.56, 0.68), uv().y.mul(0.55).add(noise2D(vec2(size.z.mul(97), floor(uv().x.mul(12)))).mul(0.25)));
    const base = mix(sky, vec3(wall.r, wall.g, wall.b), float(1).sub(coverage().mul(side())));
    return mix(base, vec3(wall.r, wall.g, wall.b).mul(1.1), rib).mul(size.z.mul(0.25).add(0.86));
  })();
  m.emissiveNode = Fn(() => vec3(1.0, 0.88, 0.66).mul(coverage()).mul(lit()).mul(side()).mul(homeMood.windows))();
  return m;
}

function flatPrism(seg, rot = 0) {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, seg, 1).rotateY(rot).translate(0, 0.5, 0).toNonIndexed();
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- 切块实例：每格一个 InstancedMesh，三个都能被视锥和距离剔除
function chunked(root, geometry, material, items, cell, cullAt, { shadow = true, attr = null } = {}) {
  const cells = new Map();
  for (const it of items) {
    const key = `${Math.floor(it.x / cell)},${Math.floor(it.z / cell)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(it);
  }
  const chunks = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const list of cells.values()) {
    const g = attr ? geometry.clone() : geometry;
    if (attr) g.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(list.flatMap(attr)), 3));
    const im = new THREE.InstancedMesh(g, material, list.length);
    list.forEach((it, i) => {
      e.set(it.rx || 0, it.ry || 0, it.rz || 0);
      m.compose(new THREE.Vector3(it.x, it.y || 0, it.z), q.setFromEuler(e), new THREE.Vector3(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1));
      im.setMatrixAt(i, m);
    });
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = false; im.receiveShadow = shadow;
    root.add(im);
    chunks.push({ mesh: im, center: im.boundingSphere.center.clone(), radius: im.boundingSphere.radius, cullAt, shadow });
  }
  return chunks;
}

// ---------------------------------------------------------------- 地面：一张着色器画完的街区
function buildGround(root) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.8 });
  const distance = () => {
    const p = local();
    return vec2(abs(fract(p.x.div(AVE).add(0.5)).sub(0.5)).mul(AVE), abs(fract(p.y.div(STR).add(0.5)).sub(0.5)).mul(STR));
  };
  m.colorNode = Fn(() => {
    const p = local(), d = distance();
    const n = noise2D(p.mul(0.6)).mul(0.5).add(noise2D(p.mul(2.1)).mul(0.5));
    const urban = smoothstep(PARK + 4, PARK - 4, p.y);
    const road = max(smoothstep(7.2, 7, d.x), smoothstep(5.2, 5, d.y).mul(urban));
    const walk = max(smoothstep(10.2, 10, d.x), smoothstep(8.2, 8, d.y).mul(urban));
    const dash = smoothstep(0.16, 0.1, d.x).mul(step(0.5, fract(p.y.div(7)))).mul(smoothstep(5.4, 5.6, d.y));
    const dashZ = smoothstep(0.14, 0.09, d.y).mul(step(0.5, fract(p.x.div(7)))).mul(smoothstep(7.4, 7.6, d.x)).mul(urban);
    const tile = smoothstep(0.03, 0.07, fract(p.x.div(4))).mul(smoothstep(0.03, 0.07, fract(p.y.div(4)))).mul(0.14).add(0.86);
    const block = mix(mix(vec3(0.1, 0.3, 0.16), vec3(0.22, 0.46, 0.2), n), vec3(0.56, 0.58, 0.58).mul(tile), urban);
    const walkCol = vec3(0.68, 0.7, 0.7).mul(tile);
    const asphalt = mix(vec3(0.05, 0.06, 0.075), vec3(0.09, 0.1, 0.12), n);
    return mix(mix(block, walkCol, walk), asphalt, road).add(vec3(0.75, 0.82, 0.86).mul(max(dash, dashZ).mul(road)));
  })();
  // 路面里的导引灯带，夜里才看得出
  m.emissiveNode = Fn(() => {
    const d = distance();
    return vec3(0.25, 0.85, 1).mul(smoothstep(6.95, 6.8, d.x).mul(smoothstep(6.6, 6.75, d.x))).mul(homeMood.windows).mul(0.5);
  })();
  const g = new THREE.Mesh(new THREE.PlaneGeometry(EXT * 3, EXT * 3).rotateX(-Math.PI / 2), m);
  g.receiveShadow = true;
  root.add(g);
}

// ---------------------------------------------------------------- 主塔：棱角分段、两侧立肋一路落到地面，再接台基（动画画面中央）
function buildHeroTower(root, colliders) {
  const dark = new THREE.MeshStandardNodeMaterial({ roughness: 0.32, metalness: 0.35 });
  const band = () => {
    const a = fract(positionWorld.x.add(positionWorld.z).mul(0.34));
    const b = fract(positionWorld.y.mul(0.24));
    return smoothstep(0.1, 0.16, a).mul(smoothstep(0.9, 0.84, a)).mul(smoothstep(0.24, 0.3, b)).mul(smoothstep(0.8, 0.74, b));
  };
  dark.colorNode = Fn(() => mix(vec3(0.16, 0.17, 0.2), vec3(0.04, 0.06, 0.09), band()))();
  dark.emissiveNode = Fn(() => {
    const id = vec2(floor(positionWorld.x.add(positionWorld.z).mul(0.34)), floor(positionWorld.y.mul(0.24)));
    return vec3(0.9, 0.96, 1).mul(band()).mul(smoothstep(0.58, 0.64, hash2D(id))).mul(homeMood.windows.add(0.12));
  })();
  const pale = new THREE.MeshStandardMaterial({ color: 0x74787e, roughness: 0.42, metalness: 0.35 });

  const chamfered = (w, d, h, y, c) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + c, -d / 2); s.lineTo(w / 2 - c, -d / 2); s.lineTo(w / 2, -d / 2 + c); s.lineTo(w / 2, d / 2 - c);
    s.lineTo(w / 2 - c, d / 2); s.lineTo(-w / 2 + c, d / 2); s.lineTo(-w / 2, d / 2 - c); s.lineTo(-w / 2, -d / 2 + c);
    return new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y, 0);
  };
  const tiers = [[62, 46, 92, 12], [52, 38, 92, 11], [42, 32, 74, 9], [32, 24, 56, 7], [20, 15, 30, 5]];
  const core = []; let y = 10;
  tiers.forEach(([w, d, h, c]) => { core.push(chamfered(w, d, h, y, c)); y += h; });
  const towerTop = y;
  const tower = new THREE.Mesh(merged(core), dark);
  tower.castShadow = true;
  const group = new THREE.Group();
  group.position.set(0, 0, HERO);
  root.add(group);
  group.add(tower);
  // 每段顶上的浅色压檐与外层“肩甲”
  const shells = [];
  y = 10;
  tiers.forEach(([w, d, h, c], i) => {
    shells.push(chamfered(w + 3, d + 3, 1.6, y + h - 0.8, c + 1));
    for (const sx of [-1, 1]) shells.push(box(5, h * 0.72, d * 0.56, sx * (w / 2 + 1.4), y + h * 0.42, 0), box(w * 0.3, h * 0.5, 2.4, sx * w * 0.16, y + h * 0.35, d / 2 + 0.8), box(w * 0.3, h * 0.5, 2.4, sx * w * 0.16, y + h * 0.35, -d / 2 - 0.8));
    y += h;
  });
  // 立肋：剖面是一条 S 线，从塔腰扫到地面，像动画里抱着塔身的那几道长弧
  const fin = new THREE.Shape();
  fin.moveTo(0, 0); fin.lineTo(30, 0); fin.bezierCurveTo(24, 26, 6, 40, 3, 96); fin.lineTo(3, 170); fin.lineTo(-1, 170); fin.lineTo(-1, 96);
  fin.bezierCurveTo(-1, 50, 8, 26, 0, 0);
  const finG = new THREE.ExtrudeGeometry(fin, { depth: 4.5, bevelEnabled: false }).translate(0, 0, -2.25);
  const clones = [[31, 12, 0], [31, -12, 0], [-31, 12, Math.PI], [-31, -12, Math.PI], [12, 23, -Math.PI / 2], [-12, 23, -Math.PI / 2], [12, -23, Math.PI / 2], [-12, -23, Math.PI / 2]];
  clones.forEach(([x, z, r]) => shells.push(finG.clone().rotateY(r).translate(x, 0, z)));
  const shell = new THREE.Mesh(merged(shells), pale);
  shell.castShadow = true;
  group.add(shell);
  // 台基：层层外展的平台，南面一道大坡
  const base = [cyl(66, 72, 3.5, 0, 1.75, 0, 8), cyl(56, 62, 3.5, 0, 5, 0, 8), cyl(46, 52, 3.5, 0, 8.3, 0, 8)];
  group.add(new THREE.Mesh(merged(base), new THREE.MeshStandardMaterial({ color: 0x8c9094, roughness: 0.7 })));
  const antenna = new THREE.Mesh(cyl(0.3, 1.6, 44, 0, towerTop + 22, 0, 8), pale);
  group.add(antenna);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 2.6, 3) }));
  beacon.position.y = towerTop + 45;
  group.add(beacon);
  colliders.push({ minX: PAST.x - 70, maxX: PAST.x + 70, minZ: HERO - 70, maxZ: HERO + 70, minY: -5, maxY: 400 });
}

// ---------------------------------------------------------------- 楼群
function buildTowers(root, colliders, roads) {
  const chunks = [];
  const groups = [
    { geo: flatPrism(8, Math.PI / 8), mat: facadeMaterial(0x8c9196, 0x16222e), items: [] }, // 切角
    { geo: flatPrism(4, Math.PI / 4), mat: facadeMaterial(0x565d66, 0x0e1a26), items: [] }, // 方楼
    { geo: new THREE.CylinderGeometry(0.5, 0.5, 1, 26, 1).translate(0, 0.5, 0), mat: facadeMaterial(0xc4c8ca, 0x1f3548), items: [] } // 动画里远处的圆筒塔
  ];
  const nearRoad = (x, z, r) => roads.some((p) => Math.hypot(p[0] - x, p[1] - z) < r);
  const rim = [];
  const place = (x, z, w, d, h, groupIndex) => {
    const g = groups[groupIndex], s = rnd();
    const peri = groupIndex === 2 ? Math.PI * w : (w + d) * 2;
    let y = 0, tw = w, td = d, left = h;
    const tiers = h > 120 ? 3 : h > 60 ? 2 : 1;
    for (let t = 0; t < tiers; t++) {
      const th = t === tiers - 1 ? left : left * rnd(0.45, 0.62);
      g.items.push({ x, y, z, sx: tw, sy: th, sz: td, peri: peri * (tw / w), h: th, s });
      y += th; left -= th; tw *= 0.74; td *= 0.74;
      rim.push({ x, y, z, sx: tw / 0.74 + 0.7, sy: 0.7, sz: td / 0.74 + 0.7 });
    }
    const pad = groupIndex === 2 ? 0.42 : 0.5;
    colliders.push({ minX: PAST.x + x - w * pad, maxX: PAST.x + x + w * pad, minZ: z - d * pad, maxZ: z + d * pad, minY: -5, maxY: h + 2 });
    return y;
  };
  const inner = [AVE - 22, STR - 18];
  const spires = [];
  for (let ax = -Math.ceil(EXT / AVE); ax < Math.ceil(EXT / AVE); ax++) for (let sz = -Math.ceil(EXT / STR); sz < Math.ceil(EXT / STR); sz++) {
    const bx = (ax + 0.5) * AVE, bz = (sz + 0.5) * STR;
    if (Math.abs(bx) > EXT || bz > PARK - 26 || bz < -EXT) continue;
    const dHero = Math.hypot(bx, bz - HERO);
    if (dHero < 92 || nearRoad(bx, bz, 26)) continue;
    const hTarget = 26 + 200 * Math.exp(-((dHero / 210) ** 2));
    const r = rnd();
    if (r < 0.45) {
      const gi = rnd() < 0.34 ? 2 : Math.floor(rnd(0, 2));
      const w = rnd(0.6, 0.95) * Math.min(...inner), d = gi === 2 ? w : rnd(0.7, 1) * inner[1];
      const top = place(bx, bz, w, d, hTarget * rnd(0.6, 1.25), gi);
      if (top > 150) spires.push({ x: bx, y: top, z: bz, sy: rnd(10, 26) });
    } else {
      for (const o of [-1, 1]) {
        const gi = Math.floor(rnd(0, 3)), w = inner[0] * rnd(0.34, 0.46), d = gi === 2 ? w : inner[1] * rnd(0.7, 0.96);
        place(bx + o * inner[0] * 0.26, bz + rnd(-2, 2), w, d, hTarget * rnd(0.3, 0.8), gi);
      }
    }
  }
  groups.forEach((g) => chunks.push(...chunked(root, g.geo, g.mat, g.items, 150, 1400, { attr: (it) => [it.peri, it.h, it.s] })));
  const trim = new THREE.MeshStandardMaterial({ color: 0xd7dadb, roughness: 0.55 });
  chunks.push(...chunked(root, new THREE.BoxGeometry(1, 1, 1), trim, rim.map((r) => ({ ...r, sx: r.sx * 0.72, sz: r.sz * 0.72 })), 150, 700));
  chunks.push(...chunked(root, cyl(0.12, 0.5, 1, 0, 0.5, 0, 6), trim, spires, 150, 900));
  return chunks;
}

// ---------------------------------------------------------------- 高架环线（黑色长弧）、桥墩、车流
function makeRibbon(curve, width, n = 320) {
  const pos = [], idx = [], p = new THREE.Vector3(), t = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), r = new THREE.Vector3();
  const profile = [[-1, -0.9], [-1, 0], [-0.92, 0.5], [-0.88, 0], [0.88, 0], [0.92, 0.5], [1, 0], [1, -0.9]];
  for (let i = 0; i <= n; i++) {
    curve.getPointAt(i / n, p); curve.getTangentAt(i / n, t);
    r.crossVectors(t, up).normalize();
    for (const [a, b] of profile) pos.push(p.x + r.x * a * width, p.y + b, p.z + r.z * a * width);
  }
  const m = profile.length;
  for (let i = 0; i < n; i++) for (let k = 0; k < m - 1; k++) {
    const a = i * m + k, b = a + m;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

function buildHighways(root, colliders) {
  const ring = new THREE.CatmullRomCurve3(Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * 232, 52 + Math.sin(a * 3) * 7, HERO + Math.sin(a) * 188);
  }), true);
  // 动画里那条从左上方落下、擦着主塔、再扬向右上方的长弧
  const sweep = new THREE.CatmullRomCurve3([[-620, 170, 240], [-400, 112, 90], [-190, 72, -40], [0, 58, HERO + 104], [190, 72, -40], [400, 112, 90], [620, 170, 240]].map((v) => new THREE.Vector3(...v)));
  const sweep2 = new THREE.CatmullRomCurve3([[620, 120, -520], [320, 92, -420], [90, 78, HERO - 110], [-90, 78, HERO - 110], [-320, 92, -420], [-620, 120, -520]].map((v) => new THREE.Vector3(...v)));
  const curves = [ring, sweep, sweep2];
  const deckMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, side: THREE.DoubleSide });
  deckMat.colorNode = vec3(0.035, 0.038, 0.045);
  curves.forEach((c) => { const m = new THREE.Mesh(makeRibbon(c, 7), deckMat); m.castShadow = true; root.add(m); });

  const pierItems = [], roads = [];
  const v = new THREE.Vector3();
  curves.forEach((c) => {
    const len = c.getLength(), step = Math.round(len / 34);
    for (let i = 0; i <= step; i++) {
      c.getPointAt(i / step, v);
      roads.push([v.x, v.z]);
      if (Math.abs(v.x) > EXT || Math.abs(v.z) > EXT + 20 || Math.hypot(v.x, v.z - HERO) < 74) continue;
      if (i % 2 === 0) {
        pierItems.push({ x: v.x, y: 0, z: v.z, sy: v.y - 0.9 });
        colliders.push({ minX: PAST.x + v.x - 1.7, maxX: PAST.x + v.x + 1.7, minZ: v.z - 1.7, maxZ: v.z + 1.7, minY: -5, maxY: v.y });
      }
    }
  });
  const piers = chunked(root, cyl(1.5, 2, 1, 0, 0.5, 0, 10), new THREE.MeshStandardMaterial({ color: 0x25272b, roughness: 0.6 }), pierItems, 150, 1200);

  const lut = curves.map((c) => { const pts = c.getSpacedPoints(600); return { pts, len: c.getLength(), closed: c === ring }; });
  const n = 96;
  const pod = merged([new THREE.SphereGeometry(1, 10, 8).scale(1.1, 0.62, 2.3), box(1.3, 0.3, 1.1, 0, 0.42, -0.2)]);
  const pods = new THREE.InstancedMesh(pod, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.5 }), n);
  const seeds = Array.from({ length: n }, (_, i) => ({ curve: i % 3, u: rnd(), sp: rnd(30, 46), lane: (i % 2 ? 1 : -1) * rnd(2.6, 4.6), dir: i % 2 ? 1 : -1 }));
  seeds.forEach((s, i) => pods.setColorAt(i, new THREE.Color().setHSL(rnd(0.5, 0.62), rnd(0.1, 0.5), rnd(0.55, 0.92))));
  pods.frustumCulled = false;
  root.add(pods);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1), one = new THREE.Vector3(1, 1, 1);
  return {
    piers, roads,
    update(t) {
      seeds.forEach((s, i) => {
        const L = lut[s.curve];
        let u = (s.u + (s.dir * t * s.sp) / L.len) % 1; if (u < 0) u += 1;
        const f = u * 600, k = Math.floor(f), P = L.pts[k], Q = L.pts[Math.min(k + 1, 600)];
        a.lerpVectors(P, Q, f - k);
        d.subVectors(Q, P).normalize();
        b.set(d.z, 0, -d.x).normalize();
        a.addScaledVector(b, s.lane); a.y += 0.7;
        q.setFromUnitVectors(Z, s.dir > 0 ? d : d.clone().negate());
        m.compose(a, q, one);
        pods.setMatrixAt(i, m);
      });
      pods.instanceMatrix.needsUpdate = true;
    }
  };
}

// ---------------------------------------------------------------- 地面车流与行人：直线往返，够撑起“活着的城”
function buildStreetLife(root) {
  const cars = merged([new THREE.SphereGeometry(1, 10, 8).scale(1, 0.58, 2.2).translate(0, 0.62, 0), box(1.3, 0.3, 1.2, 0, 1.0, -0.15)]);
  const C = 110;
  const carMesh = new THREE.InstancedMesh(cars, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.4 }), C);
  carMesh.frustumCulled = false;
  const car = Array.from({ length: C }, (_, i) => {
    const onAve = i % 3 !== 0, lineIdx = Math.floor(rnd(-6, 7));
    carMesh.setColorAt(i, new THREE.Color().setHSL(rnd(0, 1), rnd(0.05, 0.45), rnd(0.25, 0.85)));
    const dir = i % 2 ? 1 : -1;
    return { onAve, line: (onAve ? lineIdx * AVE : Math.min(lineIdx * STR, PARK - STR)) + dir * 3.2, dir, off: rnd(-EXT, EXT), sp: rnd(12, 22) };
  });
  root.add(carMesh);

  const person = merged([cyl(0.13, 0.32, 1.05, 0, 0.55, 0, 8), new THREE.SphereGeometry(0.16, 8, 6).translate(0, 1.32, 0), cyl(0.15, 0.15, 0.22, 0, 1.03, 0, 8)]);
  const P = 160;
  const people = new THREE.InstancedMesh(person, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }), P);
  people.frustumCulled = false;
  const folk = Array.from({ length: P }, (_, i) => {
    const onAve = i % 2 === 0, lineIdx = Math.floor(rnd(-6, 7));
    people.setColorAt(i, new THREE.Color().setHSL(rnd(0, 1), rnd(0.15, 0.55), rnd(0.35, 0.8)));
    const dir = i % 3 ? 1 : -1;
    return { onAve, line: (onAve ? lineIdx * AVE : Math.min(lineIdx * STR, PARK - STR)) + (rnd() < 0.5 ? -1 : 1) * (onAve ? 8.6 : 6.6), dir, off: rnd(-EXT, EXT), sp: rnd(1.1, 1.9), phase: rnd(0, 6) };
  });
  root.add(people);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), a = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const wrap = (v) => ((v + EXT) % (2 * EXT) + 2 * EXT) % (2 * EXT) - EXT;
  // 车和人不进英雄广场：穿过它的路段直接挪到地下
  const blocked = (x, z) => Math.hypot(x, z - HERO) < 76;
  return (t) => {
    car.forEach((c, i) => {
      const s = wrap(c.off + c.dir * c.sp * t), x = c.onAve ? c.line : s, z = c.onAve ? s : c.line;
      a.set(x, blocked(x, z) || z > PARK ? -6 : 0.1, z);
      e.set(0, c.onAve ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
      m.compose(a, q.setFromEuler(e), one); carMesh.setMatrixAt(i, m);
    });
    folk.forEach((c, i) => {
      const s = wrap(c.off + c.dir * c.sp * t), x = c.onAve ? c.line : s, z = c.onAve ? s : c.line;
      a.set(x, blocked(x, z) || z > PARK ? -6 : Math.abs(Math.sin(t * 5 + c.phase)) * 0.05, z);
      e.set(0, c.onAve ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
      m.compose(a, q.setFromEuler(e), one); people.setMatrixAt(i, m);
    });
    carMesh.instanceMatrix.needsUpdate = true; people.instanceMatrix.needsUpdate = true;
  };
}

// ---------------------------------------------------------------- 飞船
function buildShips(root) {
  const hull = merged([
    new THREE.CylinderGeometry(1, 1.25, 6, 6).rotateX(Math.PI / 2).scale(1, 0.55, 1), box(1.5, 0.5, 2.2, 0, 0.62, -0.5),
    new THREE.ConeGeometry(1, 1.6, 6).rotateX(Math.PI / 2).scale(1, 0.55, 1).translate(0, 0, 3.8),
    box(3.5, 0.14, 1.4, 0, -0.1, -1.6), box(0.14, 1, 1, 0, 0.8, -2.5)
  ]);
  const engine = merged([cyl(0.34, 0.34, 0.2, -0.65, 0, -3.1, 10).rotateX(0), cyl(0.34, 0.34, 0.2, 0.65, 0, -3.1, 10)]);
  const list = [{ s: 11, r: 330, y: 215, sp: 0.024, ph: 0.4, cx: -40, cz: HERO + 40 }, { s: 8, r: 460, y: 175, sp: -0.018, ph: 2.1, cx: 80, cz: HERO }, { s: 7, r: 260, y: 270, sp: 0.03, ph: 4.2, cx: 0, cz: HERO }];
  for (let i = 0; i < 18; i++) list.push({ s: rnd(1.2, 2.8), r: rnd(120, 520), y: rnd(90, 240), sp: rnd(0.04, 0.09) * (i % 2 ? 1 : -1), ph: rnd(0, 6.3), cx: rnd(-120, 120), cz: HERO + rnd(-90, 120) });
  const body = new THREE.InstancedMesh(hull, new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.4, metalness: 0.55 }), list.length);
  const glow = new THREE.InstancedMesh(engine, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.4, 3) }), list.length);
  body.frustumCulled = glow.frustumCulled = false;
  root.add(body, glow);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), a = new THREE.Vector3(), s = new THREE.Vector3();
  return (t) => {
    list.forEach((c, i) => {
      const an = c.ph + t * c.sp;
      a.set(c.cx + Math.cos(an) * c.r, c.y + Math.sin(t * 0.3 + c.ph) * 3, c.cz + Math.sin(an) * c.r);
      e.set(0, c.sp > 0 ? -an : Math.PI - an, 0);
      m.compose(a, q.setFromEuler(e), s.setScalar(c.s));
      body.setMatrixAt(i, m); glow.setMatrixAt(i, m);
    });
    body.instanceMatrix.needsUpdate = glow.instanceMatrix.needsUpdate = true;
  };
}

// ---------------------------------------------------------------- 南郊：蘑菇平台、低矮的亮带楼、蕨丛（动画前景）
function buildGardens(root, colliders) {
  const capPts = [[0.02, 0.2], [0.5, 0.17], [0.86, 0.09], [1, -0.02], [0.82, -0.05], [0.42, -0.1], [0.12, -0.16]].map(([r, y]) => new THREE.Vector2(r, y));
  const cap = new THREE.LatheGeometry(capPts, 28);
  const stem = new THREE.LatheGeometry([[0.18, 0], [0.09, 0.08], [0.06, 0.45], [0.075, 0.5], [0.06, 0.56], [0.075, 0.93], [0.2, 1]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0x8d8f90, roughness: 0.7 });
  const capMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
  // 动画里蘑菇伞面那种密排的刀刮笔触
  capMat.colorNode = Fn(() => mix(vec3(0.14, 0.15, 0.15), vec3(0.42, 0.44, 0.42), smoothstep(0.2, 0.8, sin(uv().x.mul(420)).mul(0.5).add(0.5).mul(noise2D(uv().mul(30))))))();
  const stems = [], caps = [];
  const put = (x, z, r, h) => {
    stems.push({ x, y: 0, z, sx: r * 0.9, sy: h, sz: r * 0.9 });
    caps.push({ x, y: h, z, sx: r, sy: r * 0.9, sz: r });
    colliders.push({ minX: PAST.x + x - r * 0.16, maxX: PAST.x + x + r * 0.16, minZ: z - r * 0.16, maxZ: z + r * 0.16, minY: -5, maxY: h });
  };
  for (let i = 0; i < 26; i++) {
    const x = rnd(-EXT, EXT), z = rnd(PARK + 18, EXT + 60);
    if (Math.abs(x) < 22 || Math.hypot(x, z - PAST.mirrorZ) < 40) continue;
    put(x, z, rnd(15, 34), rnd(16, 54));
  }
  [[-108, HERO + 110, 30, 56], [118, HERO + 100, 26, 46], [-132, HERO - 40, 22, 62], [132, HERO - 50, 24, 40]].forEach((a) => put(...a));
  const chunks = [...chunked(root, stem, stemMat, stems, 200, 1300), ...chunked(root, cap, capMat, caps, 200, 1300)];

  // 低矮的亮带楼：外伸的长挑檐
  const lowDark = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.45, metalness: 0.3 });
  const low = merged([box(30, 5, 15, 0, 2.5, 0), box(38, 0.8, 19, 3, 5.4, 0), box(20, 3.6, 11, -2, 7.6, 0), box(26, 0.6, 14, 2, 9.7, 0)]);
  const lows = [];
  for (let i = 0; i < 14; i++) {
    const x = (i % 2 ? 1 : -1) * rnd(40, EXT - 20), z = rnd(PARK + 20, EXT);
    lows.push({ x, y: 0, z, ry: rnd(-0.5, 0.5), s: rnd(0.8, 1.4) });
    colliders.push({ minX: PAST.x + x - 17, maxX: PAST.x + x + 17, minZ: z - 10, maxZ: z + 10, minY: -5, maxY: 14 });
  }
  chunks.push(...chunked(root, low, lowDark, lows, 200, 1000));
  const bandG = merged([box(30.2, 0.45, 15.2, 0, 3.4, 0), box(20.2, 0.35, 11.2, -2, 8, 0)]);
  chunks.push(...chunked(root, bandG, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.7, 1.9) }), lows, 200, 1000, { shadow: false }));

  // 行道树与蕨丛
  const frond = merged(Array.from({ length: 7 }, (_, k) => new THREE.ConeGeometry(0.16, 1.5, 4).scale(1, 1, 0.3).rotateX(0.9).rotateY((k / 7) * Math.PI * 2).translate(Math.sin((k / 7) * Math.PI * 2) * 0.5, 0.55, Math.cos((k / 7) * Math.PI * 2) * 0.5)));
  const fernMat = new THREE.MeshStandardMaterial({ color: 0x3f8a48, roughness: 0.8 });
  const ferns = [];
  for (let i = 0; i < 620; i++) {
    const x = rnd(-EXT, EXT), z = rnd(PARK, EXT + 60);
    if (Math.abs(x) < 11 || Math.hypot(x, z - PAST.mirrorZ) < 20) continue;
    ferns.push({ x, y: 0, z, s: rnd(0.8, 2.4), ry: rnd(0, 6) });
  }
  chunks.push(...chunked(root, frond, fernMat, ferns, 120, 260, { shadow: false }));
  const treeG = merged([cyl(0.13, 0.2, 4, 0, 2, 0, 6), new THREE.IcosahedronGeometry(1.7, 1).scale(1, 0.72, 1).translate(0, 4.8, 0)]);
  const lamp = merged([cyl(0.05, 0.08, 7, 0, 3.5, 0, 6), box(1.4, 0.08, 0.2, 0.55, 7, 0)]);
  const treeM = new THREE.MeshStandardMaterial({ color: 0x4f8f57, roughness: 0.8 }), lampM = new THREE.MeshStandardMaterial({ color: 0x8a8d91, roughness: 0.4, metalness: 0.5 });
  const trees = [], lamps = [], heads = [];
  for (let ax = -6; ax <= 6; ax++) for (let k = 0; k < 26; k++) {
    const z = -EXT + (k + 0.5) * ((PARK + EXT) / 26);
    if (Math.abs(ax * AVE) > EXT || Math.hypot(ax * AVE, z - HERO) < 78) continue;
    const side = k % 2 ? 1 : -1, x = ax * AVE + side * 9.1;
    if (k % 4 === 0) { lamps.push({ x, y: 0, z, ry: side > 0 ? Math.PI : 0 }); heads.push({ x: x - side * 1, y: 6.92, z, sx: 1, sy: 0.08, sz: 0.3 }); }
    else trees.push({ x, y: 0, z, s: rnd(0.8, 1.2), ry: rnd(0, 6) });
  }
  chunks.push(...chunked(root, treeG, treeM, trees, 200, 420, { shadow: false }), ...chunked(root, lamp, lampM, lamps, 200, 420, { shadow: false }));
  const headM = new THREE.MeshStandardNodeMaterial({ color: 0xbfd8e8 });
  headM.emissiveNode = vec3(1.1, 1.2, 1.3).mul(homeMood.windows);
  chunks.push(...chunked(root, new THREE.BoxGeometry(1, 1, 1), headM, heads, 200, 420, { shadow: false }));
  return chunks;
}

// ---------------------------------------------------------------- 组装
export function buildGoldenCity(scene) {
  seed = 91;
  const group = new THREE.Group();
  group.name = 'past-city';
  const root = new THREE.Group();
  root.position.set(PAST.x, 0, PAST.z);
  group.add(root);
  const colliders = [];

  buildGround(root);
  buildHeroTower(root, colliders);
  const hw = buildHighways(root, colliders);
  const towers = buildTowers(root, colliders, hw.roads);
  const gardens = buildGardens(root, colliders);
  const streetLife = buildStreetLife(root);
  const ships = buildShips(root);
  const chunks = [...towers, ...gardens, ...hw.piers];

  // 回到母星的星图镜，立在南郊圆场上
  const court = new THREE.Mesh(new THREE.CircleGeometry(16, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc9cbc9, roughness: 0.7 }));
  court.position.set(0, 0.04, PAST.mirrorZ);
  court.receiveShadow = true;
  root.add(court);
  const mirror = createStarMirror();
  mirror.position.set(0, 0.04, PAST.mirrorZ);
  root.add(mirror);
  colliders.push({ minX: PAST.x - 2.4, maxX: PAST.x + 2.4, minZ: PAST.mirrorZ - 1, maxZ: PAST.mirrorZ + 1, minY: -5, maxY: 8 });

  // 边界
  const E = EXT + 70;
  colliders.push(
    { minX: PAST.x - E - 20, maxX: PAST.x - E, minZ: -E - 20, maxZ: E + 20, minY: -50, maxY: 400 },
    { minX: PAST.x + E, maxX: PAST.x + E + 20, minZ: -E - 20, maxZ: E + 20, minY: -50, maxY: 400 },
    { minX: PAST.x - E, maxX: PAST.x + E, minZ: -E - 20, maxZ: -E, minY: -50, maxY: 400 },
    { minX: PAST.x - E, maxX: PAST.x + E, minZ: E, maxZ: E + 20, minY: -50, maxY: 400 }
  );

  group.visible = false;
  scene.add(group);

  const c = new THREE.Vector3();
  return {
    group,
    colliders,
    update(elapsed, cam) {
      for (const k of chunks) {
        c.copy(k.center); c.x += PAST.x;
        const d = c.distanceTo(cam) - k.radius;
        k.mesh.visible = d < k.cullAt;
        k.mesh.castShadow = k.shadow && d < 240;
      }
      hw.update(elapsed);
      streetLife(elapsed);
      ships(elapsed);
    }
  };
}
