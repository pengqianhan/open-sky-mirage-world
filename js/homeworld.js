// js/homeworld.js
// 天外母星：依第 19 集童童的讲述搭建。权贵空城、甄选石台、项圈、牢笼和星图镜依该段插画动画；其余形貌是设计推断（见 .world/expanded-prompt.md）。
// 路线（一路向北）：归墟虫洞台 → 焦土古战场（西侧奴隶营）→ 甄选广场（光柱直上权贵空城）→ 魂舱阵 → 蜃景船坞；四周是废都。

import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, positionWorld, positionLocal, normalWorld, cameraPosition, attribute, uv, time, sin, abs, atan,
  floor, fract, mix, smoothstep, dot, length, normalize, pow, max, uniform
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise2D, hash2D } from './tsl-materials.js';
import { HOME_WEATHER, HOME, CRATERS, RAD_POOLS, PLAZA, DECK, YARD, MIRAGE_PORTAL, homeHeight } from './homeworld-config.js';

// 随天象变化、被多种材质共用的量
export const mood = { energy: uniform(1), windows: uniform(1), lift: uniform(0.16) };
const skyU = {
  zenith: uniform(new THREE.Vector3()), horizon: uniform(new THREE.Vector3()), haze: uniform(new THREE.Vector3()),
  sunTint: uniform(new THREE.Vector3()), cloudColor: uniform(new THREE.Vector3()), fog: uniform(new THREE.Vector3()),
  sunDir: uniform(new THREE.Vector3(0, 1, 0)), sun: uniform(1), stars: uniform(0), cloud: uniform(0), wormhole: uniform(0.88), bigMoon: uniform(0)
};

const PALETTE = {
  ashLight: 0x8a7767, ashDark: 0x352a26, rust: 0x6b3a26, iron: 0x3a3634, ruin: 0x4a403c,
  bone: 0xcfc4ae, radiation: 0x7dff5a, cyan: 0x4deeea, gold: 0xe6b450, leaf: 0x3f8f4e, swirl: 0x5a5560
};

let seed = 7;
const rnd = (a = 0, b = 1) => { seed = (seed * 16807) % 2147483647; return a + (b - a) * ((seed - 1) / 2147483646); };
const localXZ = () => positionWorld.xz.sub(vec2(HOME.x, HOME.z));

function grimeMat(hex, { metal = 0.2, rough = 0.9, scale = 0.35, dark = 0.5 } = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: metal, roughness: rough });
  const base = new THREE.Color(hex);
  m.colorNode = Fn(() => {
    const p = localXZ().add(vec2(positionWorld.y.mul(0.7), positionWorld.y.mul(0.3)));
    const n = noise2D(p.mul(scale)).mul(0.6).add(noise2D(p.mul(scale * 3.7)).mul(0.4));
    const b = vec3(base.r, base.g, base.b);
    return mix(b.mul(dark), b.mul(1.25), smoothstep(0.25, 0.75, n));
  })();
  // 尘霾的散射光：背光面也不至于死黑
  m.emissiveNode = vec3(base.r, base.g, base.b).mul(mood.lift);
  return m;
}

const box = (w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z);
  return g;
};
const cyl = (rt, rb, h, x = 0, y = 0, z = 0, seg = 10, rx = 0, rz = 0) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z);
  return g;
};
const merged = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));

function scatter(group, geo, mat, items, shadow = true) {
  const im = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  items.forEach((it, i) => {
    e.set(it.rx || 0, it.ry || 0, it.rz || 0);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1));
    im.setMatrixAt(i, m);
  });
  im.castShadow = shadow; im.receiveShadow = shadow;
  im.frustumCulled = false;
  group.add(im);
  return im;
}

// ---------------------------------------------------------------- 虫洞环（母星与中枢石殿共用）
export function createWormholeRing() {
  const g = new THREE.Group();
  const R = 3.4;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 48), (() => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false });
    const f = Fn(() => {
      const c = uv().sub(0.5).mul(2);
      const r = length(c), a = atan(c.y, c.x);
      const spiral = sin(a.mul(5).add(r.mul(16)).sub(time.mul(3.2))).mul(0.5).add(0.5);
      const core = smoothstep(0.35, 0, r);
      return vec3(0.12, 0.85, 0.9).mul(spiral.mul(1.4).add(0.3)).add(vec3(2.4, 2.8, 2.7).mul(core));
    });
    m.colorNode = f();
    m.opacityNode = smoothstep(1.0, 0.82, length(uv().sub(0.5).mul(2))).mul(0.92);
    return m;
  })());
  const stone = grimeMat(PALETTE.swirl, { scale: 3, dark: 0.45 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.42, 12, 48), stone);
  const inlay = new THREE.Mesh(new THREE.TorusGeometry(R + 0.44, 0.05, 6, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.gold).multiplyScalar(2.2) }));
  const foot = new THREE.Mesh(box(4.4, 0.9, 1.5), stone);
  foot.position.y = -R - 0.1;
  ring.castShadow = true;
  g.add(disc, ring, inlay, foot);
  disc.position.y = ring.position.y = inlay.position.y = 0;
  const lamp = new THREE.PointLight(PALETTE.cyan, 60, 22);
  g.add(lamp);
  g.userData.center = R + 0.35;
  return g;
}

// ---------------------------------------------------------------- 天空
function buildSkyDome() {
  const uFlash = uniform(0);
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
  m.colorNode = Fn(() => {
    const d = normalize(positionLocal);
    const h = max(d.y, 0);
    const haze = noise2D(d.xz.div(d.y.abs().add(0.25)).mul(1.6).add(vec2(time.mul(0.012), 0)));
    let col = mix(skyU.horizon, skyU.zenith, pow(h, 0.55));
    col = col.add(skyU.haze.mul(haze));

    // 暗红巨日
    const s = dot(d, skyU.sunDir);
    col = col.add(skyU.sunTint.mul(0.29).mul(pow(max(s, 0), 22)).mul(skyU.sun));
    col = mix(col, skyU.sunTint, smoothstep(0.9925, 0.9945, s).mul(skyU.sun.min(1)));

    // 夜空的星
    const starCell = floor(d.xz.div(d.y.abs().add(0.35)).mul(170));
    col = col.add(vec3(0.9, 0.95, 1.1).mul(smoothstep(0.994, 0.999, hash2D(starCell))).mul(skyU.stars).mul(smoothstep(0.05, 0.3, d.y)));

    // 破碎的月亮与碎石带
    const moonDir = normalize(vec3(0.62, 0.42, -0.55));
    const mS = dot(d, moonDir);
    const crack = abs(noise2D(d.xy.mul(46)).sub(0.5));
    const moon = smoothstep(0.9955, 0.9968, mS).mul(smoothstep(0.015, 0.05, crack));
    col = mix(col, vec3(0.7, 0.62, 0.55).mul(noise2D(d.xz.mul(70)).mul(0.5).add(0.6)), moon);
    const belt = abs(dot(d, normalize(vec3(0.5, 0.25, 0.83)))).sub(0.015);
    const shard = smoothstep(0.72, 0.8, noise2D(d.xy.mul(150)));
    col = col.add(vec3(0.5, 0.42, 0.36).mul(smoothstep(0.05, 0, abs(belt))).mul(shard).mul(smoothstep(0, 0.1, d.y)));

    // 旧都上空那轮巨月（EP19 04:20）；月亮那时还是完整的
    const bigDir = normalize(vec3(0.34, 0.42, -0.84));
    const big = dot(d, bigDir);
    const patch = noise2D(d.xy.mul(9)).mul(0.55).add(noise2D(d.zy.mul(27)).mul(0.25)).add(0.32);
    col = mix(col, vec3(0.58, 0.6, 0.62).mul(patch).mul(skyU.bigMoon).add(skyU.horizon.mul(0.22)), smoothstep(0.966, 0.968, big).mul(skyU.bigMoon.min(1).sign()));

    // 北方天顶虫洞
    const wh = normalize(vec3(0, 0.82, -0.57));
    const up = normalize(vec3(0, 0.57, 0.82));
    const right = vec3(1, 0, 0);
    const pl = vec2(dot(d, right), dot(d, up)).div(max(dot(d, wh), 0.05));
    const r = length(pl), a = atan(pl.y, pl.x);
    const arm = sin(a.mul(3).add(r.mul(-30)).add(time.mul(0.35))).mul(0.5).add(0.5);
    const mask = smoothstep(0.62, 0.08, r).mul(smoothstep(0, 0.3, dot(d, wh)));
    col = mix(col, vec3(0.16, 0.75, 0.82).mul(arm.mul(1.5).add(0.15)), mask.mul(skyU.wormhole));
    col = col.add(vec3(2.2, 2.9, 2.8).mul(smoothstep(0.1, 0.0, r)).mul(smoothstep(0, 0.3, dot(d, wh))).mul(skyU.wormhole));
    col = mix(col, vec3(0.01, 0.015, 0.03), smoothstep(0.075, 0.03, r).mul(smoothstep(0, 0.3, dot(d, wh))));

    // 浓云：盖住日月与虫洞
    const billow = noise2D(d.xz.div(d.y.abs().add(0.3)).mul(2.4).add(vec2(time.mul(0.02), time.mul(0.008))));
    col = mix(col, skyU.cloudColor.mul(billow.mul(0.9).add(0.55)), skyU.cloud.mul(smoothstep(0.2, 0.55, billow)));

    // 贴地与雾同色，闪电一闪
    col = mix(skyU.fog, col, smoothstep(-0.02, 0.1, d.y));
    return col.add(vec3(0.5, 0.42, 0.55).mul(uFlash));
  })();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2600, 48, 32), m);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  return { dome, uFlash };
}

// ---------------------------------------------------------------- 地形
function buildTerrain(group) {
  const size = 1500, seg = 300;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const rad = RAD_POOLS.map((i) => CRATERS[i]);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, homeHeight(x, z) - (Math.hypot(x, z - 178) < 31 ? 1.2 : Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.radius - 2 ? 0.4 : 0)); // 让出虫洞台和广场的石面
    let scorch = 0, tox = 0;
    for (const [cx, cz, cr] of CRATERS) scorch = Math.max(scorch, 1 - Math.hypot(x - cx, z - cz) / (cr * 1.6));
    for (const [cx, cz, cr] of rad) tox = Math.max(tox, 1 - Math.hypot(x - cx, z - cz) / (cr * 1.25));
    const s = Math.max(0, scorch);
    cols[i * 3] = 1 - s * 0.72 - Math.max(0, tox) * 0.25;
    cols[i * 3 + 1] = Math.max(0, tox);
    cols[i * 3 + 2] = 0;
  }
  geo.setAttribute('tint', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.96, metalness: 0 });
  m.colorNode = Fn(() => {
    const t = attribute('tint', 'vec3');
    const p = localXZ();
    const large = noise2D(p.mul(0.04));
    const fine = noise2D(p.mul(0.9));
    const crack = smoothstep(0.035, 0.0, abs(noise2D(p.mul(0.16)).sub(0.5))).mul(0.8)
      .add(smoothstep(0.03, 0, abs(noise2D(p.mul(0.5).add(9)).sub(0.5))).mul(0.5));
    let c = mix(vec3(0.17, 0.12, 0.095), vec3(0.37, 0.29, 0.235), large.mul(0.7).add(fine.mul(0.3)));
    c = c.mul(t.x.max(0).mul(0.75).add(0.25));
    c = mix(c, vec3(0.2, 0.42, 0.08), t.y.mul(0.8));
    c = c.mul(float(1).sub(crack.mul(0.72)));
    return c;
  })();
  const mesh = new THREE.Mesh(geo, m);
  mesh.receiveShadow = true;
  group.add(mesh);
}

// ---------------------------------------------------------------- 废都：带层檐的残楼，呼应“起初和这里一样”
function buildRuinCity(group) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92 });
  const base = new THREE.Color(PALETTE.ruin);
  const windowCell = () => vec2(floor(dot(positionWorld.xz, vec2(0.71, 0.71)).div(3.4)), floor(positionWorld.y.div(4)));
  const pane = () => smoothstep(0.2, 0.3, fract(dot(positionWorld.xz, vec2(0.71, 0.71)).div(3.4))).mul(smoothstep(0.75, 0.65, fract(dot(positionWorld.xz, vec2(0.71, 0.71)).div(3.4))))
    .mul(smoothstep(0.25, 0.35, fract(positionWorld.y.div(4)))).mul(smoothstep(0.8, 0.7, fract(positionWorld.y.div(4))));
  const wall = () => smoothstep(0.5, 0.2, abs(normalWorld.y));
  m.colorNode = Fn(() => vec3(base.r, base.g, base.b).mul(float(1).sub(pane().mul(wall()).mul(0.72))).mul(noise2D(localXZ().mul(0.3).add(positionWorld.y.mul(0.5))).mul(0.6).add(0.6)))();
  m.emissiveNode = Fn(() => vec3(2.0, 1.05, 0.42).mul(mood.windows).mul(pane()).mul(wall()).mul(smoothstep(0.955, 0.965, hash2D(windowCell()))))();

  const towers = [], eaves = [];
  const blocked = (x, z) => Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.radius + 30 || Math.hypot(x - YARD.x, z - YARD.z) < YARD.radius + 70 ||
    Math.hypot(x, z - 178) < 70 || (Math.abs(x) < 50 && z > -470 && z < 200) || (x < -60 && x > -220 && z > -10 && z < 140);
  for (let i = 0; i < 420 && towers.length < 500; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(190, 640);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (blocked(x, z)) continue;
    const ry = rnd(0, 1.57), w = rnd(14, 30);
    let y = homeHeight(x, z) - 2;
    const tiers = 1 + Math.floor(rnd(1, 4.9));
    const lean = rnd(0, 1) < 0.25 ? rnd(-0.1, 0.1) : 0;
    for (let t = 0; t < tiers; t++) {
      const f = 1 - t * 0.17, h = rnd(18, 44);
      towers.push({ x: x + lean * y, y: y + h / 2, z, sx: w * f, sy: h, sz: w * f, ry, rz: lean });
      y += h;
      if (rnd() > 0.28) eaves.push({ x: x + lean * y, y: y + 0.6, z, sx: w * f * 1.28, sy: 1.1, sz: w * f * 1.28, ry, rz: lean + rnd(-0.03, 0.03) });
    }
  }
  scatter(group, new THREE.BoxGeometry(1, 1, 1), m, towers);
  scatter(group, new THREE.BoxGeometry(1, 1, 1), grimeMat(PALETTE.ashDark, { scale: 0.5 }), eaves);
}

// ---------------------------------------------------------------- 战场
function buildBattlefield(group, colliders) {
  const iron = grimeMat(PALETTE.rust, { metal: 0.15, rough: 0.8, scale: 0.6, dark: 0.45 });

  // 倒伏的巨型战争机甲（局部朝向 +X，膝以下埋入土中）
  const mech = merged([
    box(14, 11, 10, 0, 0, 0), box(9, 5, 8, 8, 2, 0, 0, 0, -0.2), box(5, 5.5, 5, 13.5, 2.5, 0),
    box(16, 3.6, 3.6, 2, -1, 7.4, 0, 0.32), box(7, 4.6, 4.6, 12, -1, 10.5), cyl(1.2, 1.2, 7, 18, -1, 10.7, 8, 0, 1.57),
    box(14, 4.2, 4.2, -11, -2, -3.4), box(16, 3.4, 3.4, -24, -3, -3.4, 0, 0, 0.1),
    box(3, 13, 6, -2, 7, 0), box(1, 7, 1, 5, 7, 2, 0.1), box(1, 5, 1, 7, 6, -3, -0.2),
    cyl(2.2, 2.2, 9, 0, 0, -8.2, 10, 1.57), box(6, 1.1, 12, -4, 6, 0, 0.2)
  ]);
  const mechs = [
    { lx: -30, lz: 92, s: 1.25, ry: 0.5, rz: -0.08 }, { lx: 52, lz: 50, s: 0.85, ry: 2.5, rz: 0.1 }, { lx: 92, lz: 140, s: 1, ry: -1.1, rz: 0.04 }
  ];
  scatter(group, mech, iron, mechs.map((d) => ({ x: d.lx, y: homeHeight(d.lx, d.lz) + 3 * d.s, z: d.lz, s: d.s, ry: d.ry, rz: d.rz })));
  mechs.forEach((d) => colliders.push({ minX: HOME.x + d.lx - 11 * d.s, maxX: HOME.x + d.lx + 11 * d.s, minZ: d.lz - 7 * d.s, maxZ: d.lz + 7 * d.s, minY: -20, maxY: 60 }));

  // 战车残骸、金属断桩
  const wreck = merged([box(6, 1.8, 3.2, 0, 0.9, 0), box(3, 1.2, 2.4, -0.4, 2.3, 0), cyl(0.18, 0.2, 5, 3, 2.5, 0, 6, 0, 1.3)]);
  const open = (x, z) => Math.abs(x) > 16 && z < 170 && z > 6 && Math.abs(x) < 190;
  const pts = (n, fn) => { const a = []; for (let i = 0; i < n * 3 && a.length < n; i++) { const x = rnd(-190, 190), z = rnd(0, 170); if (open(x, z)) a.push(fn(x, z)); } return a; };
  scatter(group, wreck, iron, pts(26, (x, z) => ({ x, y: homeHeight(x, z) + 0.1, z, ry: rnd(0, 6.3), rz: rnd(-0.22, 0.22), s: rnd(0.8, 1.4) })));
  scatter(group, new THREE.BoxGeometry(0.5, 5, 0.5), iron, pts(70, (x, z) => ({ x, y: homeHeight(x, z) + 1.4, z, rz: rnd(-0.5, 0.5), rx: rnd(-0.5, 0.5), sy: rnd(0.4, 1.6) })));
  scatter(group, new THREE.IcosahedronGeometry(1, 0), grimeMat(PALETTE.ashDark, { scale: 1.2 }), pts(130, (x, z) => ({ x, y: homeHeight(x, z), z, sx: rnd(0.4, 2.6), sy: rnd(0.3, 1.6), sz: rnd(0.4, 2.6), ry: rnd(0, 6) })));

  // 枯树：童童说，这里起初也与人间一样
  const tree = merged([cyl(0.14, 0.34, 5, 0, 2.5, 0, 6), cyl(0.05, 0.13, 3, 0.9, 5, 0, 5, 0, -0.7), cyl(0.04, 0.11, 2.6, -0.8, 4.3, 0.3, 5, 0.3, 0.8), cyl(0.03, 0.08, 2, 0.1, 5.7, -0.7, 5, -0.7, 0)]);
  scatter(group, tree, grimeMat(0x1d1512, { scale: 2 }), pts(46, (x, z) => ({ x, y: homeHeight(x, z) - 0.2, z, ry: rnd(0, 6.3), s: rnd(0.8, 1.7), rz: rnd(-0.1, 0.1) })));

  // 辐射池
  const pool = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  pool.colorNode = Fn(() => vec3(0.42, 1.5, 0.3).mul(noise2D(localXZ().mul(0.35).add(time.mul(0.08))).mul(0.8).add(0.5)))();
  pool.opacityNode = smoothstep(1.0, 0.7, length(uv().sub(0.5).mul(2))).mul(0.9);
  RAD_POOLS.forEach((i) => {
    const [cx, cz, cr] = CRATERS[i];
    const c = new THREE.Mesh(new THREE.CircleGeometry(cr * 0.5, 32), pool);
    c.rotation.x = -Math.PI / 2;
    c.position.set(cx, homeHeight(cx, cz) + 1.4, cz);
    group.add(c);
  });
}

// ---------------------------------------------------------------- 奴隶营
function buildSlaveCamp(group) {
  const cx = -130, cz = 62;
  const shack = merged([box(6, 3.2, 4.6, 0, 1.6, 0), box(7, 0.25, 5.6, 0, 3.6, 0, 0.14), box(1.3, 2.3, 0.2, 1, 1.15, 2.35)]);
  const items = [];
  for (let ring = 0; ring < 3; ring++) {
    const n = 9 + ring * 5, r = 20 + ring * 13;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      items.push({ x, y: homeHeight(x, z), z, ry: -a + Math.PI / 2 + rnd(-0.3, 0.3), sx: rnd(0.8, 1.2), sy: rnd(0.8, 1.15), sz: rnd(0.8, 1.2) });
    }
  }
  scatter(group, shack, grimeMat(PALETTE.rust, { metal: 0.1, scale: 1.6, dark: 0.45 }), items);

  // 异化的底层人：驼背、覆鳞、拖尾 —— 戟牙就从这些人中选出
  const bodyParts = [
    cyl(0.32, 0.46, 1.25, 0, 1.05, -0.05, 8, 0.3), new THREE.SphereGeometry(0.28, 8, 6).translate(0, 1.82, 0.26),
    cyl(0.11, 0.13, 0.95, -0.17, 0.45, 0, 6), cyl(0.11, 0.13, 0.95, 0.17, 0.45, 0, 6),
    cyl(0.08, 0.1, 0.95, -0.45, 1.18, 0.2, 6, 0.5, 0.2), cyl(0.08, 0.1, 1.05, 0.45, 1.1, 0.2, 6, 0.6, -0.2),
    cyl(0.03, 0.16, 0.8, 0, 0.72, -0.6, 6, -1.0), cyl(0.01, 0.05, 0.8, 0, 0.4, -1.05, 5, -1.25)
  ];
  for (let i = 0; i < 6; i++) bodyParts.push(new THREE.ConeGeometry(0.07, 0.24, 4).rotateX(-0.9).translate(0, 1.0 + i * 0.13, -0.42 + i * 0.02));
  const figure = merged(bodyParts);
  const people = [];
  const fires = [[cx, cz], [cx + 6, cz + 22]];
  fires.forEach(([fx, fz]) => {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 6.28 + rnd(-0.2, 0.2), r = rnd(3, 4.6);
      const x = fx + Math.cos(a) * r, z = fz + Math.sin(a) * r;
      people.push({ x, y: homeHeight(x, z), z, ry: Math.atan2(fx - x, fz - z), s: rnd(0.85, 1.1) });
    }
  });
  // 向穹城方向排队领配给
  for (let i = 0; i < 16; i++) {
    const x = cx + 48 + i * 2.1, z = cz - 40 - i * 1.3;
    people.push({ x, y: homeHeight(x, z), z, ry: 2.15 + rnd(-0.2, 0.2), s: rnd(0.85, 1.05) });
  }
  scatter(group, figure, grimeMat(0x5d6a4e, { scale: 8, dark: 0.45 }), people);
  // 底层人都戴着只有权贵才能摘下的绿项圈（EP19 11:10）
  const campCollar = new THREE.TorusGeometry(0.17, 0.045, 7, 14).rotateX(Math.PI / 2).translate(0, 1.62, 0.13);
  scatter(group, campCollar, collarMaterial(), people, false);

  const flame = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 1.35, 0.3) });
  const ember = grimeMat(PALETTE.ashDark, { scale: 3 });
  fires.forEach(([fx, fz]) => {
    const y = homeHeight(fx, fz);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.9, 7), flame);
    f.position.set(fx, y + 1.0, fz);
    const pit = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.3, 6, 12), ember);
    pit.rotation.x = Math.PI / 2; pit.position.set(fx, y + 0.2, fz);
    const l = new THREE.PointLight(0xff8a3c, 90, 26);
    l.position.set(fx, y + 2.5, fz);
    group.add(f, pit, l);
  });
}

// ---------------------------------------------------------------- 甄选广场（EP19 11:00 动画：石台上的兜帽权贵，台下戴绿项圈的底层人）
function collarMaterial() {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 1.5, 0.16) });
}

function buildSelectionSquare(group, colliders) {
  const { x: cx, z: cz, radius: R } = PLAZA;
  const stone = grimeMat(0x8f8a80, { scale: 0.5, dark: 0.55 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 72), grimeMat(0x57524c, { scale: 0.32, dark: 0.5 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.03, cz); floor.receiveShadow = true;
  group.add(floor);

  // 白石圆台与三个兜帽权贵：左矮、中捧文书、右高
  const [px, pz] = [PLAZA.plinthX, PLAZA.plinthZ];
  const plinth = new THREE.Mesh(cyl(8, 8.4, 4.4, px, 2.2, pz, 40), grimeMat(0xd6d0c4, { scale: 0.7, dark: 0.68 }));
  plinth.castShadow = plinth.receiveShadow = true;
  group.add(plinth);
  colliders.push({ minX: HOME.x + px - 7.4, maxX: HOME.x + px + 7.4, minZ: pz - 7.4, maxZ: pz + 7.4, minY: -5, maxY: 5 });
  const robe = grimeMat(0x2c2a2e, { scale: 3, dark: 0.55, rough: 0.95 });
  const hooded = merged([
    cyl(0.28, 0.82, 2.5, 0, 1.25, 0, 10), new THREE.SphereGeometry(0.42, 10, 8).scale(1.05, 0.7, 0.85).translate(0, 2.42, 0),
    new THREE.SphereGeometry(0.34, 10, 8).scale(1, 1.25, 1).translate(0, 2.95, 0), new THREE.ConeGeometry(0.2, 0.42, 8).rotateX(-0.45).translate(0, 3.32, -0.14),
    cyl(0.12, 0.2, 1, 0.55, 1.95, 0.05, 8, 0, 0.3), cyl(0.12, 0.2, 1, -0.55, 1.95, 0.05, 8, 0, -0.3)
  ]);
  const face = new THREE.SphereGeometry(0.2, 10, 8).scale(1.05, 1.25, 0.5);
  const lords = [{ x: px - 2.7, z: pz + 0.4, s: 0.85, ry: 0.3 }, { x: px, z: pz + 1, s: 1.05, ry: 0 }, { x: px + 2.7, z: pz + 0.2, s: 1.18, ry: -0.2 }];
  scatter(group, hooded, robe, lords.map((l) => ({ x: l.x, y: 4.4, z: l.z, s: l.s, ry: l.ry })));
  scatter(group, face, new THREE.MeshBasicMaterial({ color: 0x050405 }), lords.map((l) => ({ x: l.x + Math.sin(l.ry) * 0.2 * l.s, y: 4.4 + 2.95 * l.s, z: l.z + Math.cos(l.ry) * 0.2 * l.s, s: l.s, ry: l.ry })), false);
  const page = new THREE.Mesh(box(0.85, 0.05, 0.6, px + 0.05, 4.4 + 2.18, pz + 1 + 0.72, 0.55), new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.9 }));
  group.add(page);

  // 光头、大眼窝、灰皮的底层人，一律望向石台
  const skinMat = grimeMat(0x6d7070, { scale: 5, dark: 0.5 });
  const body = merged([
    cyl(0.34, 0.5, 1.2, 0, 1.0, -0.06, 8, 0.28), new THREE.SphereGeometry(0.42, 10, 8).scale(1.15, 0.8, 0.9).translate(0, 1.62, -0.1),
    cyl(0.1, 0.15, 1.05, -0.5, 1.06, 0.1, 6, 0.3, 0.18), cyl(0.1, 0.15, 1.05, 0.5, 1.06, 0.1, 6, 0.3, -0.18),
    cyl(0.13, 0.16, 0.9, -0.2, 0.45, 0, 6), cyl(0.13, 0.16, 0.9, 0.2, 0.45, 0, 6),
    new THREE.SphereGeometry(0.38, 12, 10).scale(1, 1.08, 1.1).translate(0, 2.2, 0.16)
  ]);
  const eyes = merged([new THREE.SphereGeometry(0.1, 8, 6).scale(1, 1.25, 0.5).translate(-0.17, 2.2, 0.53), new THREE.SphereGeometry(0.1, 8, 6).scale(1, 1.25, 0.5).translate(0.17, 2.2, 0.53)]);
  const collar = new THREE.TorusGeometry(0.27, 0.075, 8, 18).rotateX(Math.PI / 2 - 0.2).translate(0, 1.87, 0.06);
  const crowd = [];
  for (let i = 0; i < 64 && crowd.length < 44; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(11.5, 27);
    const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
    if (Math.abs(x) < 8 || crowd.some((c) => Math.hypot(c.x - x, c.z - z) < 1.9)) continue;
    crowd.push({ x, y: 0, z, ry: Math.atan2(px - x, pz - z) + rnd(-0.2, 0.2), s: rnd(0.85, 1.25) });
  }
  scatter(group, body, skinMat, crowd);
  scatter(group, eyes, new THREE.MeshBasicMaterial({ color: 0x070605 }), crowd, false);
  scatter(group, collar, collarMaterial(), crowd, false);

  // 瓦顶破屋（EP19 04:50）：围住广场，南北留出主路
  const wall = grimeMat(0x6f6458, { scale: 0.9, dark: 0.5 });
  const houseBody = merged([box(9, 4.2, 6.5, 0, 2.1, 0), box(1.6, 2.4, 0.3, 1.3, 1.2, 3.3), box(1.1, 1.1, 0.3, -2.4, 2.6, 3.3)]);
  const roofGeo = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).scale(8, 2.9, 5.6).translate(0, 5.65, 0);
  const houses = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.22, r = R - 5 + (i % 2) * 3;
    const hx = cx + Math.sin(a) * r, hz = cz + Math.cos(a) * r;
    if (Math.abs(hx) < 16) continue;
    houses.push({ x: hx, y: 0, z: hz, ry: a + Math.PI, rz: rnd(-0.04, 0.04), s: rnd(0.85, 1.15) });
    colliders.push({ minX: HOME.x + hx - 4.6, maxX: HOME.x + hx + 4.6, minZ: hz - 4.6, maxZ: hz + 4.6, minY: -5, maxY: 10 });
  }
  scatter(group, houseBody, wall, houses);
  scatter(group, roofGeo, grimeMat(0x2d2a2c, { scale: 1.1, dark: 0.55 }), houses.map((h, i) => ({ ...h, rx: i % 3 === 0 ? 0.28 : 0.03, rz: i % 3 === 1 ? -0.24 : h.rz })));

  // 牢笼（EP19 12:05）：中间大笼关着盔甲戟牙，两侧小笼关着兽
  const barMat = grimeMat(0x161514, { scale: 2, dark: 0.7, metal: 0.3 });
  const cage = (x, z, w, h) => {
    const bars = [], n = Math.round(w / 0.45);
    for (let k = 0; k <= n; k++) {
      const u = -w / 2 + (k * w) / n;
      bars.push({ x: x + u, y: h / 2, z: z - w / 2 }, { x: x + u, y: h / 2, z: z + w / 2 }, { x: x - w / 2, y: h / 2, z: z + u }, { x: x + w / 2, y: h / 2, z: z + u });
    }
    scatter(group, new THREE.CylinderGeometry(0.05, 0.05, h, 5), barMat, bars);
    group.add(new THREE.Mesh(merged([box(w + 0.2, 0.25, 0.25, x, h, z - w / 2), box(w + 0.2, 0.25, 0.25, x, h, z + w / 2), box(0.25, 0.25, w + 0.2, x - w / 2, h, z), box(0.25, 0.25, w + 0.2, x + w / 2, h, z), box(w + 0.2, 0.25, w + 0.2, x, 0.12, z)]), barMat));
    colliders.push({ minX: HOME.x + x - w / 2, maxX: HOME.x + x + w / 2, minZ: z - w / 2, maxZ: z + w / 2, minY: -5, maxY: h + 1 });
  };
  const [gx, gz] = [PLAZA.cageX, PLAZA.cageZ];
  cage(gx, gz, 6.5, 6.6); cage(gx - 7, gz + 1.4, 3.4, 2.8); cage(gx + 7, gz + 1.4, 3.4, 2.8);
  const plate = grimeMat(0x8d9094, { metal: 0.45, rough: 0.48, scale: 2.5, dark: 0.55 });
  const knight = merged([
    cyl(0.62, 0.48, 1.3, 0, 2.15, 0, 10), new THREE.SphereGeometry(0.5, 10, 8).scale(1.3, 0.75, 0.9).translate(0, 2.85, 0),
    new THREE.SphereGeometry(0.38, 12, 10).scale(0.92, 1.2, 1).translate(0, 3.55, 0), box(0.5, 0.06, 0.1, 0, 3.58, 0.34), box(0.06, 0.4, 0.08, 0, 3.42, 0.36),
    new THREE.SphereGeometry(0.33, 10, 8).translate(-0.82, 2.9, 0), new THREE.SphereGeometry(0.33, 10, 8).translate(0.82, 2.9, 0),
    cyl(0.17, 0.2, 1.3, -0.82, 2.1, 0.12, 8, 0.2), cyl(0.17, 0.2, 1.3, 0.82, 2.1, 0.12, 8, 0.2),
    cyl(0.22, 0.26, 1.5, -0.3, 0.8, 0, 8), cyl(0.22, 0.26, 1.5, 0.3, 0.8, 0, 8), cyl(0.5, 0.56, 0.5, 0, 1.5, 0, 10)
  ]);
  const warrior = new THREE.Mesh(knight, plate);
  warrior.position.set(gx, 0.2, gz); warrior.rotation.y = -2.2; warrior.castShadow = true;
  group.add(warrior);
  const kCollar = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.07, 8, 20).rotateX(Math.PI / 2), collarMaterial());
  kCollar.position.set(gx, 3.32, gz);
  group.add(kCollar);
  const beast = merged([new THREE.SphereGeometry(0.6, 10, 8).scale(1.3, 0.72, 0.8).translate(0, 0.65, 0), new THREE.SphereGeometry(0.33, 10, 8).translate(0.72, 0.85, 0), new THREE.ConeGeometry(0.1, 0.3, 5).translate(0.68, 1.2, 0.14), new THREE.ConeGeometry(0.1, 0.3, 5).translate(0.68, 1.2, -0.14), cyl(0.08, 0.1, 0.5, -0.4, 0.2, 0.25, 6), cyl(0.08, 0.1, 0.5, 0.4, 0.2, -0.25, 6)]);
  scatter(group, beast, grimeMat(0x2a2624, { scale: 7, dark: 0.55 }), [{ x: gx - 7, y: 0.2, z: gz + 1.4, ry: 2.4 }, { x: gx + 7, y: 0.2, z: gz + 1.4, ry: 0.7 }]);

  // 登天光柱：正对船底的发光环
  const padM = new THREE.Mesh(cyl(4.6, 5, 0.3, cx, 0.15, cz, 40), grimeMat(PALETTE.swirl, { scale: 1, dark: 0.5 }));
  group.add(padM);
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.1, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.3, 1.4) }));
  padRing.rotation.x = Math.PI / 2; padRing.position.set(cx, 0.34, cz);
  group.add(padRing);
  group.add(liftBeam(cx, DECK.y - 36, cz, 3.2));
}

/** 莲座上的华饰圆镜，映着缓慢转动的星系 */
export function createStarMirror() {
  const mirror = new THREE.Group();
  const bronze = new THREE.MeshStandardMaterial({ color: 0x2a2520, metalness: 0.6, roughness: 0.4 });
  const lotus = [cyl(0.3, 0.55, 1.5, 0, 0.75, 0, 10)];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    lotus.push(new THREE.ConeGeometry(0.42, 1.5, 6).rotateX(0.9).rotateY(a).translate(Math.sin(a) * 0.8, 1.7, Math.cos(a) * 0.8));
  }
  lotus.push(new THREE.TorusGeometry(2.1, 0.17, 8, 40).translate(0, 4, 0));
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    lotus.push(new THREE.SphereGeometry(0.2, 6, 5).translate(Math.cos(a) * 2.32, 4 + Math.sin(a) * 2.32, 0));
  }
  mirror.add(new THREE.Mesh(merged(lotus), bronze));
  const galaxy = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, fog: false });
  galaxy.colorNode = Fn(() => {
    const c = uv().sub(0.5).mul(2);
    const r = length(c), a = atan(c.y, c.x);
    const arm = sin(a.mul(2).add(r.mul(9)).add(time.mul(0.3))).mul(0.5).add(0.5);
    const stars = smoothstep(0.985, 0.998, hash2D(floor(uv().mul(90))));
    const body = pow(arm, 2.5).mul(smoothstep(1, 0.1, r)).mul(1.3).add(smoothstep(0.26, 0, r).mul(2.6));
    return vec3(0.75, 0.82, 1.0).mul(body).add(vec3(stars)).add(vec3(0.015, 0.018, 0.035));
  })();
  const face = new THREE.Mesh(new THREE.CircleGeometry(2.04, 40), galaxy);
  face.position.y = 4;
  mirror.add(face);
  return mirror;
}

function liftBeam(x, height, z, radius) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  m.colorNode = Fn(() => vec3(1.0, 0.92, 0.62).mul(sin(positionWorld.y.mul(0.5).sub(time.mul(3))).mul(0.2).add(0.8)))();
  m.opacityNode = Fn(() => {
    const v = normalize(cameraPosition.sub(positionWorld));
    return pow(abs(dot(normalize(normalWorld), v)), 1.4).mul(0.22);
  })();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 28, 1, true), m);
  b.position.set(x, height / 2, z);
  return b;
}

// ---------------------------------------------------------------- 权贵空城（EP19 04:45 动画：碗形黑船身、底部光环、爪状翼舱、尖塔城、光泡）
function buildSkyCity(group, colliders) {
  const { x: cx, z: cz, y: Y, radius: R } = DECK;
  const city = new THREE.Group();
  city.position.set(cx, Y, cz);
  group.add(city);

  // 碗形船身：Lathe 轮廓从底部光环一路外翻到甲板沿
  const hullPts = [[13, -38], [18, -39], [30, -35], [44, -27], [55, -16], [61, -7], [63, -2], [62, 0]].map(([r, y]) => new THREE.Vector2(r, y));
  const hullM = new THREE.MeshStandardNodeMaterial({ metalness: 0.2, roughness: 0.42 });
  hullM.colorNode = Fn(() => {
    const n = noise2D(uv().mul(vec2(46, 8)));
    return mix(vec3(0.035, 0.036, 0.042), vec3(0.11, 0.115, 0.125), n);
  })();
  hullM.emissiveNode = Fn(() => {
    // 舷窗：错落的亮矩形；裂纹：一道闪电状的亮缝（动画里最醒目的伤）
    const g = uv().mul(vec2(34, 7));
    const cell = floor(g), f = fract(g);
    const lit = smoothstep(0.72, 0.74, hash2D(cell)).mul(smoothstep(0.12, 0.16, f.x)).mul(smoothstep(0.88, 0.84, f.x)).mul(smoothstep(0.34, 0.38, f.y)).mul(smoothstep(0.66, 0.62, f.y));
    const crackU = uv().x.sub(0.3).add(noise2D(vec2(uv().y.mul(22), 3)).sub(0.5).mul(0.035));
    const crack = smoothstep(0.0022, 0.0006, abs(crackU)).mul(smoothstep(0.1, 0.22, uv().y)).mul(smoothstep(0.92, 0.78, uv().y));
    return vec3(0.9, 0.95, 1.0).mul(lit.mul(0.9).mul(mood.windows.add(0.6))).add(vec3(1.8, 1.9, 2.3).mul(crack));
  })();
  city.add(new THREE.Mesh(new THREE.LatheGeometry(hullPts, 72), hullM));
  const aperture = new THREE.Mesh(new THREE.CircleGeometry(13, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.85, 0.62) }));
  aperture.position.y = -38;
  city.add(aperture);
  const lipGlow = new THREE.Mesh(new THREE.TorusGeometry(13.6, 0.9, 8, 56).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.0, 2.1) }));
  lipGlow.position.y = -38.4;
  city.add(lipGlow);

  // 两翼：伸出的臂、爪状舱、舱顶小塔
  const wingDark = grimeMat(0x18181b, { scale: 0.6, dark: 0.6, metal: 0.2 });
  const wingParts = [];
  for (const s of [-1, 1]) {
    wingParts.push(cyl(2.6, 4.4, 50, s * 83, -9, 0, 12, 0, s * (Math.PI / 2 + 0.08)));
    wingParts.push(new THREE.SphereGeometry(8.5, 14, 10).scale(1.25, 0.8, 1).translate(s * 110, -7, 0));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      wingParts.push(new THREE.ConeGeometry(2.3, 11, 7).rotateX(Math.PI).rotateZ(Math.cos(a) * 0.65).rotateX(-Math.sin(a) * 0.65).translate(s * 110 + Math.cos(a) * 7, -14, Math.sin(a) * 6));
    }
    wingParts.push(box(4.5, 16, 4.5, s * 106, 7, 1.5), box(3.4, 24, 3.4, s * 112, 11, -1.5), box(2.6, 11, 2.6, s * 117, 4, 2));
  }
  city.add(new THREE.Mesh(merged(wingParts), wingDark));

  // 甲板、石径、护栏
  const deck = new THREE.Mesh(new THREE.CircleGeometry(R + 2, 72).rotateX(-Math.PI / 2), new THREE.MeshStandardNodeMaterial({ roughness: 0.85 }));
  deck.material.colorNode = Fn(() => {
    const p = positionWorld.xz.sub(vec2(HOME.x + cx, cz));
    const n = noise2D(p.mul(0.5)).mul(0.5).add(noise2D(p.mul(1.7)).mul(0.5));
    return mix(vec3(0.09, 0.24, 0.1), vec3(0.2, 0.42, 0.15), n);
  })();
  deck.receiveShadow = true;
  city.add(deck);
  const slab = grimeMat(0xd9d3c6, { scale: 0.9, dark: 0.78, rough: 0.6 });
  const paving = [box(9, 0.14, 44, 0, 0.07, 32), new THREE.CylinderGeometry(21, 21, 0.13, 48).translate(0, 0.065, 0), new THREE.CylinderGeometry(7, 7, 0.14, 32).translate(0, 0.07, 22)];
  const pave = new THREE.Mesh(merged(paving), slab);
  pave.receiveShadow = true;
  city.add(pave);
  const gold = new THREE.MeshStandardMaterial({ color: PALETTE.gold, metalness: 0.75, roughness: 0.3, emissive: 0x3a2206 });
  const railParts = [new THREE.TorusGeometry(R - 1, 0.13, 6, 96).rotateX(Math.PI / 2).translate(0, 1.15, 0)];
  const SEG = 40;
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2;
    railParts.push(cyl(0.09, 0.11, 1.15, Math.cos(a) * (R - 1), 0.58, Math.sin(a) * (R - 1), 6));
    const bx = cx + Math.cos(a) * (R - 0.5), bz = cz + Math.sin(a) * (R - 0.5);
    colliders.push({ minX: HOME.x + bx - 3.2, maxX: HOME.x + bx + 3.2, minZ: bz - 3.2, maxZ: bz + 3.2, minY: Y - 2, maxY: Y + 8 });
  }
  city.add(new THREE.Mesh(merged(railParts), gold));

  // 甲板外沿的黑岩与林带（动画里城脚那圈不规则剪影）
  const rimRocks = [], rimTrees = [];
  for (let i = 0; i < 90; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(R + 0.5, R + 3);
    rimRocks.push({ x: Math.cos(a) * r, y: -0.5, z: Math.sin(a) * r, sx: rnd(1.6, 3.6), sy: rnd(1, 2.6), sz: rnd(1.6, 3.6), ry: rnd(0, 6) });
  }
  scatter(city, new THREE.IcosahedronGeometry(1, 0), grimeMat(0x1d1c1e, { scale: 1, dark: 0.6 }), rimRocks, false);

  // 中央主塔：逐级收分，塔尖一颗星
  const glass = new THREE.MeshStandardNodeMaterial({ metalness: 0.35, roughness: 0.32 });
  const pane = () => {
    // 竖向长条窗：比方格更像动画里那种棱柱，也不像居民楼
    const a = fract(positionWorld.x.add(positionWorld.z).mul(0.7));
    const b = fract(positionWorld.y.mul(0.11));
    return smoothstep(0.34, 0.38, a).mul(smoothstep(0.62, 0.58, a)).mul(smoothstep(0.08, 0.11, b)).mul(smoothstep(0.92, 0.89, b));
  };
  glass.colorNode = Fn(() => mix(vec3(0.15, 0.155, 0.18), vec3(0.05, 0.07, 0.1), pane()))();
  glass.emissiveNode = Fn(() => {
    const cell = vec2(floor(positionWorld.x.add(positionWorld.z).mul(0.7)), floor(positionWorld.y.mul(0.11)));
    return vec3(0.85, 0.92, 1.0).mul(pane()).mul(smoothstep(0.55, 0.62, hash2D(cell))).mul(mood.windows.add(0.3));
  })();
  const tower = [];
  let ty = 0, tw = 18;
  [34, 28, 24, 18, 12].forEach((h) => {
    tower.push(box(tw, h, tw, 0, ty + h / 2, 0), box(tw + 1.4, 0.7, tw + 1.4, 0, ty + h, 0));
    ty += h; tw *= 0.74;
  });
  const towerM = new THREE.Mesh(merged(tower), glass);
  towerM.castShadow = true;
  city.add(towerM);
  colliders.push({ minX: HOME.x + cx - 9.8, maxX: HOME.x + cx + 9.8, minZ: cz - 9.8, maxZ: cz + 9.8, minY: Y - 2, maxY: Y + 120 });
  city.add(new THREE.Mesh(cyl(0.12, 1, 14, 0, ty + 7, 0, 8), gold));
  const star = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.8, 2.8) }));
  star.position.y = ty + 15;
  city.add(star);
  const starLight = new THREE.PointLight(0xfff0c4, 1600, 150);
  starLight.position.y = ty + 8;
  city.add(starLight);

  // 环绕的尖塔：越靠中心越高，组成动画里的山形轮廓
  const spires = [];
  for (let i = 0; i < 80 && spires.length < 18; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(25, R - 9);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 12 && z > 0) continue;
    if (spires.some((s) => Math.hypot(s.x - x, s.z - z) < s.sx / 2 + 6)) continue;
    const w = rnd(4, 6.5), h = (1 - r / R) * rnd(70, 105) + 12;
    spires.push({ x, y: h / 2, z, sx: w, sy: h, sz: w });
    colliders.push({ minX: HOME.x + cx + x - w / 2 - 0.2, maxX: HOME.x + cx + x + w / 2 + 0.2, minZ: cz + z - w / 2 - 0.2, maxZ: cz + z + w / 2 + 0.2, minY: Y - 2, maxY: Y + h + 2 });
  }
  scatter(city, new THREE.BoxGeometry(1, 1, 1), glass, spires);

  // 全星球最后的绿荫（设计推断，动画只见到城脚林带）
  const canopy = merged([cyl(0.25, 0.4, 3.6, 0, 1.8, 0, 7), new THREE.IcosahedronGeometry(2.3, 1).translate(0, 5.2, 0), new THREE.IcosahedronGeometry(1.7, 1).translate(1, 4.1, 0.7), new THREE.IcosahedronGeometry(1.5, 1).translate(-1.1, 4.2, -0.4)]);
  const leaf = new THREE.MeshStandardNodeMaterial({ roughness: 0.75 });
  leaf.colorNode = Fn(() => mix(vec3(0.08, 0.3, 0.1), vec3(0.3, 0.6, 0.2), noise2D(positionWorld.xz.sub(vec2(HOME.x, 0)).add(positionWorld.y).mul(0.7))))();
  const trees = [];
  for (let i = 0; i < 120 && trees.length < 70; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(23, R - 4);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if ((Math.abs(x) < 7 && z > 0) || Math.hypot(x, z - 22) < 9 || spires.some((s) => Math.hypot(s.x - x, s.z - z) < s.sx / 2 + 2)) continue;
    trees.push({ x, y: 0, z, s: rnd(0.8, 1.5), ry: rnd(0, 6.3) });
  }
  scatter(city, canopy, leaf, trees);

  // 星图镜（EP19 05:00 动画）与持杖的兜帽权贵；走进镜子就是天外旧都
  const mirror = createStarMirror();
  mirror.position.set(0, 0.14, 22);
  city.add(mirror);
  colliders.push({ minX: HOME.x + cx - 2.4, maxX: HOME.x + cx + 2.4, minZ: cz + 21, maxZ: cz + 23, minY: Y - 2, maxY: Y + 8 });
  const robe = grimeMat(0x262428, { scale: 3, dark: 0.55, rough: 0.95 });
  const figure = merged([
    cyl(0.28, 0.82, 2.5, 0, 1.25, 0, 10), new THREE.SphereGeometry(0.42, 10, 8).scale(1.05, 0.7, 0.85).translate(0, 2.42, 0),
    new THREE.SphereGeometry(0.34, 10, 8).scale(1, 1.25, 1).translate(0, 2.95, 0), new THREE.ConeGeometry(0.2, 0.42, 8).rotateX(-0.45).translate(0, 3.32, -0.14),
    cyl(0.12, 0.2, 1, 0.55, 1.95, 0.05, 8, 0, 0.3)
  ]);
  const keeper = new THREE.Mesh(figure, robe);
  keeper.position.set(-5, 0.14, 24.5); keeper.rotation.y = 2.5; keeper.scale.setScalar(1.1); keeper.castShadow = true;
  city.add(keeper);
  city.add(new THREE.Mesh(cyl(0.05, 0.06, 4, -5.8, 2.1, 25.2, 6), gold));
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2.6, 2.8) }));
  crystal.position.set(-5.8, 4.3, 25.2); crystal.scale.y = 1.6;
  city.add(crystal);
  colliders.push({ minX: HOME.x + cx - 6.3, maxX: HOME.x + cx - 4.3, minZ: cz + 24, maxZ: cz + 26, minY: Y - 2, maxY: Y + 6 });

  // 回地面的光圈
  const padZ = DECK.padZ - cz;
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.1, 6, 40).rotateX(Math.PI / 2).translate(0, 0.25, padZ), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.3, 1.4) }));
  city.add(padRing);
  const padGlow = liftBeam(cx, 9, DECK.padZ, 2.7);
  padGlow.position.y = Y + 4.6;
  group.add(padGlow);
  city.add(new THREE.PointLight(0xfff0c4, 200, 40));

  // 巨大的光泡：动画里城后那轮亮圆
  const shield = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
  shield.colorNode = vec3(0.95, 0.96, 0.82);
  shield.opacityNode = Fn(() => {
    const v = normalize(cameraPosition.sub(positionWorld));
    const f = pow(float(1).sub(abs(dot(normalize(normalWorld), v))), 2.6);
    return f.mul(0.34).add(0.006);
  })();
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(R + 66, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), shield);
  bubble.scale.y = 1.04;
  city.add(bubble);

  // 船身周围的云团
  const cloudM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
  cloudM.colorNode = Fn(() => mix(skyU.horizon, skyU.zenith, 0.25).mul(1.12))();
  cloudM.opacityNode = Fn(() => {
    const v = normalize(cameraPosition.sub(positionWorld));
    return pow(abs(dot(normalize(normalWorld), v)), 1.7).mul(0.62);
  })();
  const puffs = [];
  for (let i = 0; i < 46; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(78, 165);
    puffs.push({ x: Math.cos(a) * r, y: rnd(-58, -28), z: Math.sin(a) * r, sx: rnd(16, 34), sy: rnd(6, 12), sz: rnd(16, 30) });
  }
  scatter(city, new THREE.SphereGeometry(1, 14, 10), cloudM, puffs, false);
}

// ---------------------------------------------------------------- 魂舱阵
function buildSoulPods(group) {
  const frame = grimeMat(PALETTE.iron, { metal: 0.25, rough: 0.6, scale: 1.2 });
  const glass = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  glass.colorNode = Fn(() => {
    const wave = sin(positionWorld.z.mul(0.09).add(time.mul(1.4))).mul(0.5).add(0.5);
    return vec3(0.1, 0.5, 0.56).mul(mood.energy).mul(wave.mul(1.1).add(0.35));
  })();
  glass.opacityNode = float(0.6);
  const bases = [], capsules = [], cables = [];
  const pod = new THREE.CapsuleGeometry(0.72, 2.0, 4, 10);
  for (let row = 0; row < 12; row++) {
    const z = -178 - row * 8.2;
    for (let side = -1; side <= 1; side += 2) for (let c = 0; c < 8; c++) {
      const x = side * (13 + c * 5.4), y = homeHeight(x, z);
      bases.push({ x, y: y + 0.4, z });
      capsules.push({ x, y: y + 2.5, z });
    }
    for (let side = -1; side <= 1; side += 2) cables.push({ x: side * 34, y: homeHeight(side * 34, z) + 0.15, z: z + 2.5, sx: 44, sy: 0.25, sz: 0.5 });
  }
  scatter(group, cyl(0.95, 1.2, 0.8, 0, 0, 0, 10), frame, bases);
  scatter(group, pod, glass, capsules, false);
  scatter(group, new THREE.BoxGeometry(1, 1, 1), frame, cables);
  const l = new THREE.PointLight(PALETTE.cyan, 260, 90);
  l.position.set(0, 16, -224);
  group.add(l);
}

// ---------------------------------------------------------------- 蜃景船坞：又一座“重生之城”正在造
function buildShipyard(group, colliders) {
  const { x, z, radius: R } = YARD;
  const iron = grimeMat(PALETTE.iron, { metal: 0.3, rough: 0.6, scale: 0.5, dark: 0.55 });
  const rustM = grimeMat(PALETTE.rust, { metal: 0.5, rough: 0.7, scale: 0.8, dark: 0.35 });

  // 地面承台与发射环
  group.add(new THREE.Mesh(cyl(R + 8, R + 12, 1.6, x, 0.3, z, 72), grimeMat(PALETTE.ashDark, { scale: 0.45 })));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R - 8, 3.2, 12, 96), iron);
  ring.rotation.x = Math.PI / 2; ring.position.set(x, 56, z); ring.castShadow = true;
  group.add(ring);
  const inlay = new THREE.Mesh(new THREE.TorusGeometry(R - 8, 3.35, 6, 96, Math.PI * 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.cyan).multiplyScalar(1.7), wireframe: true }));
  inlay.rotation.x = Math.PI / 2; inlay.position.copy(ring.position);
  group.add(inlay);

  // 12 座桁架塔
  const lattice = [];
  for (let i = 0; i < 4; i++) lattice.push(box(0.9, 60, 0.9, i < 2 ? -3 : 3, 30, i % 2 ? -3 : 3));
  for (let k = 0; k < 8; k++) { lattice.push(box(7, 0.5, 0.5, 0, 4 + k * 7.5, 3), box(7, 0.5, 0.5, 0, 4 + k * 7.5, -3), box(0.5, 0.5, 7, 3, 4 + k * 7.5, 0), box(0.5, 0.5, 7, -3, 4 + k * 7.5, 0)); }
  const towers = [];
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2;
    const tx = x + Math.cos(a) * (R - 8), tz = z + Math.sin(a) * (R - 8);
    towers.push({ x: tx, y: 0, z: tz, ry: -a });
    colliders.push({ minX: HOME.x + tx - 4, maxX: HOME.x + tx + 4, minZ: tz - 4, maxZ: tz + 4, minY: -5, maxY: 60 });
  }
  scatter(group, merged(lattice), iron, towers);

  // 半建成的倒锥姊妹舰：下半已覆岩，上半还是裸露肋骨
  const hullY = 58;
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(44, 5, 54, 32, 6, false), grimeMat(0x6a5d55, { scale: 0.22, dark: 0.45 }));
  const gp = hull.geometry.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const n = Math.sin(gp.getX(i) * 0.5) * Math.cos(gp.getZ(i) * 0.4) * Math.sin(gp.getY(i) * 0.3);
    gp.setX(i, gp.getX(i) * (1 + n * 0.12)); gp.setZ(i, gp.getZ(i) * (1 + n * 0.12));
  }
  hull.geometry.computeVertexNormals();
  hull.position.set(x, hullY, z); hull.castShadow = true;
  group.add(hull);
  const deck = new THREE.Mesh(cyl(44, 44, 1.2, x, hullY + 27.6, z, 32), iron);
  group.add(deck);
  const ribs = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, h = 10 + (i % 3) * 8 + rnd(0, 6);
    ribs.push(box(1.4, h, 1.4, x + Math.cos(a) * 36, hullY + 28 + h / 2, z + Math.sin(a) * 36));
    if (i % 2 === 0) ribs.push(box(1.1, 1.1, 14, x + Math.cos(a + 0.17) * 36, hullY + 28 + h * 0.8, z + Math.sin(a + 0.17) * 36, 0, -a - 0.17));
  }
  // 未完工的主殿骨架：与登州上空那座同形
  ribs.push(box(26, 11, 18, x, hullY + 34, z), box(38, 1, 28, x, hullY + 40.2, z), box(0.8, 12, 0.8, x - 9, hullY + 46, z - 5), box(0.8, 12, 0.8, x + 9, hullY + 46, z - 5), box(0.8, 12, 0.8, x - 9, hullY + 46, z + 5), box(0.8, 12, 0.8, x + 9, hullY + 46, z + 5), box(30, 0.8, 18, x, hullY + 52, z));
  group.add(new THREE.Mesh(merged(ribs), rustM));

  // 通天光柱 → 虫洞
  const beamMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  beamMat.colorNode = Fn(() => vec3(0.2, 1.1, 1.2).mul(mood.energy).mul(sin(positionWorld.y.mul(0.09).sub(time.mul(2.4))).mul(0.25).add(0.75)))();
  beamMat.opacityNode = Fn(() => {
    const v = normalize(cameraPosition.sub(positionWorld));
    return pow(abs(dot(normalize(normalWorld), v)), 1.6).mul(0.6);
  })();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(9, 5, 1700, 24, 1, true), beamMat);
  beam.position.set(x, 780, z);
  group.add(beam);
  const l = new THREE.PointLight(PALETTE.cyan, 3500, 240);
  l.position.set(x, 30, z);
  group.add(l);
}

// ---------------------------------------------------------------- 组装
export function buildHomeworld(scene) {
  const group = new THREE.Group();
  group.name = 'homeworld';
  const inner = new THREE.Group();
  inner.position.set(HOME.x, 0, HOME.z);
  group.add(inner);
  const colliders = [];

  const { dome, uFlash } = buildSkyDome();
  dome.visible = false;
  scene.add(dome); // 母星和旧都共用这一球天
  buildTerrain(inner);
  buildRuinCity(inner);
  buildBattlefield(inner, colliders);
  buildSlaveCamp(inner);
  buildSelectionSquare(inner, colliders);
  buildSkyCity(inner, colliders);
  buildSoulPods(inner);
  buildShipyard(inner, colliders);

  // 归墟虫洞台
  const stone = grimeMat(PALETTE.swirl, { scale: 0.6, dark: 0.5 });
  const pad = new THREE.Mesh(cyl(30, 33, 3, 0, 0.9, 178, 56), stone);
  pad.receiveShadow = true;
  const groove = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.gold).multiplyScalar(1.5) });
  inner.add(pad);
  [10, 18, 26].forEach((r) => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 6, 72), groove);
    t.rotation.x = Math.PI / 2; t.position.set(0, 2.44, 178);
    inner.add(t);
  });
  const monoliths = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    monoliths.push({ x: Math.cos(a) * 27, y: 5, z: 178 + Math.sin(a) * 27, sx: 1.4, sy: rnd(5, 9), sz: 2.2, ry: -a, rz: rnd(-0.08, 0.08) });
  }
  scatter(inner, new THREE.BoxGeometry(1, 1, 1), stone, monoliths);
  const portal = createWormholeRing();
  portal.position.set(0, 2.4 + portal.userData.center, 190);
  inner.add(portal);

  // 灰烬
  const ash = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.11, 0.11),
    new THREE.MeshBasicMaterial({ color: 0xcdbbaa, side: THREE.DoubleSide, transparent: true, opacity: 0.75 }), 420);
  ash.frustumCulled = false;
  const seeds = Array.from({ length: 420 }, () => [rnd(0, 80), rnd(0, 40), rnd(0, 80), rnd(0.7, 1.9), rnd(0, 6.3)]);
  group.add(ash);

  // 世界边界
  const R = HOME.radius;
  colliders.push(
    { minX: HOME.x - R - 20, maxX: HOME.x - R, minZ: -R - 20, maxZ: R + 20, minY: -50, maxY: 300 },
    { minX: HOME.x + R, maxX: HOME.x + R + 20, minZ: -R - 20, maxZ: R + 20, minY: -50, maxY: 300 },
    { minX: HOME.x - R, maxX: HOME.x + R, minZ: -R - 20, maxZ: -R, minY: -50, maxY: 300 },
    { minX: HOME.x - R, maxX: HOME.x + R, minZ: R, maxZ: R + 20, minY: -50, maxY: 300 }
  );

  group.visible = false;
  scene.add(group);

  function setWeather(timeId) {
    const w = HOME_WEATHER[timeId] || HOME_WEATHER.day;
    for (const key of ['zenith', 'horizon', 'haze', 'sunTint', 'cloudColor']) skyU[key].value.set(...w.sky[key]);
    for (const key of ['sun', 'stars', 'cloud', 'wormhole']) skyU[key].value = w.sky[key];
    skyU.bigMoon.value = w.sky.bigMoon || 0;
    const fog = new THREE.Color(w.light.fogColor);
    skyU.fog.value.set(fog.r, fog.g, fog.b);
    skyU.sunDir.value.set(...w.sky.sunDir).normalize();
    mood.energy.value = w.mood.energy;
    mood.windows.value = w.mood.windows;
    mood.lift.value = w.mood.lift;
    ash.material.opacity = w.mood.ash;
  }
  setWeather('day');

  // 中枢石殿东侧的虫洞：蜃景正是由此连回母星；属于登州图层
  const gate = createWormholeRing();
  gate.position.set(MIRAGE_PORTAL.x, MIRAGE_PORTAL.y + gate.userData.center, MIRAGE_PORTAL.z);
  gate.rotation.y = Math.PI / 2;
  scene.add(gate);

  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  let nextFlash = 6, lastFlash = -10;
  return {
    group,
    colliders,
    setWeather,
    dome,
    updateSky(cam) { dome.position.copy(cam); },
    update(elapsed, cam) {
      for (let i = 0; i < seeds.length; i++) {
        const [a, b, c, sp, r] = seeds[i];
        const wrap = (v, size) => v - Math.floor(v / size) * size;
        v4.set(
          cam.x - 40 + wrap(a + elapsed * 1.6 * sp - cam.x, 80),
          cam.y - 16 + wrap(b - elapsed * sp - cam.y, 40),
          cam.z - 40 + wrap(c + elapsed * 0.7 - cam.z, 80)
        );
        e4.set(elapsed * sp + r, r, elapsed * 0.6);
        m4.compose(v4, q4.setFromEuler(e4), one);
        ash.setMatrixAt(i, m4);
      }
      ash.instanceMatrix.needsUpdate = true;
      // 远方干闪电
      if (elapsed > nextFlash) { lastFlash = elapsed; nextFlash = elapsed + 5 + Math.random() * 11; }
      const since = elapsed - lastFlash;
      uFlash.value = since < 0.22 ? (0.22 - since) * 1.6 : 0;
    }
  };
}
