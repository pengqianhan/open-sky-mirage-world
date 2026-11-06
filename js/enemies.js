// js/enemies.js
// 反派 NPC：百里渊甲士（EP23 50:20 冲上主殿广场）、铁甲人 / 戟牙（EP19 11:40 动画的板甲与绿项圈）、
// 无形怪物（EP14 袭击脚商；剧中看不见，这里的半透明轮廓是设计推断）。
// 伤害来自各主角攻击的 hit 数据（lead-attacks.js），由 controllers.js 在出招命中的那一刻调用 strike()。

import * as THREE from 'three/webgpu';
import { Fn, vec3, float, normalWorld, positionWorld, cameraPosition, normalize, dot, abs, pow, sin, time, uniform } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MIRAGE_CONFIG, GU_MANSION, QINGFENG_TOWER, getWorldGroundHeight } from './world-config.js';
import { HOME } from './homeworld-config.js';
import { BAILI } from './baili-config.js';

const AIM_SLACK = 1.5, AIM_MAX = 12, CAMERA_CLEAR = 2.2, CAMERA_LANE = 1.5, CAMERA_LANE_SPEED = 5, MAX_SWINGING = 2;

export const ENEMY_TYPES = {
  jiashi: { name: '百里渊甲士', hp: 45, armor: 1, damage: 8, speed: 5.2, reach: 2.5, aggro: 30, windup: .5, cooldown: 1.5, scale: 1.12, poise: false, radius: .7 },
  tiejia: { name: '铁甲人', hp: 170, armor: .7, damage: 20, speed: 3.6, reach: 3, aggro: 34, windup: .8, cooldown: 2.2, scale: 1.5, poise: true, radius: 1 },
  wuxing: { name: '无形怪物', hp: 34, armor: 1, damage: 12, speed: 7.6, reach: 2.2, aggro: 26, windup: .34, cooldown: 1.7, scale: 1.12, poise: false, radius: .7 },
  // 第 20 集曾倩刺中的只是替身；第 21 集真身才露面。这里照剧情分两段打。
  bailiDouble: { name: '百里渊', rig: 'baili', hp: 130, armor: 1, damage: 12, speed: 5.4, reach: 3.3, aggro: 15, windup: .55, cooldown: 1.4, scale: 1.6, poise: true, radius: 1, boss: true },
  bailiTrue: { name: '百里渊 · 真身', rig: 'baili', hp: 280, armor: .85, damage: 12, speed: 6.2, reach: 3.6, aggro: 60, windup: .5, cooldown: 1.4, scale: 1.8, poise: true, radius: 1.1, boss: true, sweep: { every: 3, windup: 1.05, radius: 6.5, damage: 22 } },
  // 顾府（EP10 38:10–42:35 & EP11 00:40–05:10）：顾府护院与二公子顾廷美（战败被林寒削去左耳）
  gufuGuard: { name: '顾府护院', hp: 52, armor: 1, damage: 9, speed: 5.3, reach: 2.5, aggro: 24, windup: .48, cooldown: 1.45, scale: 1.14, poise: false, radius: .7 },
  gutingmei: { name: '顾廷美', rig: 'gutingmei', hp: 200, armor: .9, damage: 14, speed: 5.8, reach: 3.2, aggro: 26, windup: .48, cooldown: 1.35, scale: 1.45, poise: true, radius: .9, boss: true, sweep: { every: 3, windup: .95, radius: 5.2, damage: 18 } },
  // 清风楼（EP01 19:14–22:20）：清风楼捉刀人、光头络腮胡刀客与恶霸头目 Boss【三爷】（执巨型狼牙棒）
  qingfengHunter: { name: '清风楼捉刀人', hp: 56, armor: 1, damage: 10, speed: 5.4, reach: 2.5, aggro: 24, windup: .46, cooldown: 1.4, scale: 1.15, poise: false, radius: .7 },
  qingfengBrute: { name: '清风楼络腮胡刀客', hp: 82, armor: .92, damage: 13, speed: 5.1, reach: 2.7, aggro: 24, windup: .52, cooldown: 1.45, scale: 1.24, poise: false, radius: .78 },
  sanye: { name: '三爷 · 铜牌捉刀头目', rig: 'sanye', hp: 220, armor: .88, damage: 16, speed: 5.6, reach: 3.3, aggro: 26, windup: .5, cooldown: 1.35, scale: 1.52, poise: true, radius: .95, boss: true, sweep: { every: 3, windup: .95, radius: 5.4, damage: 20 } }
};

const M = HOME.x;
const Y = MIRAGE_CONFIG.baseY, CZ = MIRAGE_CONFIG.centerZ;
export const ENEMY_SPAWNS = [
  // 登州：州衙前街的甲士与铁甲人，西市窄巷里的无形怪物（EP14 脚商遇害）
  ...[[-14, -72], [14, -72], [-6, -62], [6, -62]].map(([x, z]) => ({ type: 'jiashi', x, y: 0, z })),
  { type: 'tiejia', x: 11, y: 0, z: -84 },
  ...[[-72, 56], [-96, 60], [-118, 52]].map(([x, z]) => ({ type: 'wuxing', x, y: 0, z })),
  // 蜃景：第 23–24 集百里渊的甲士冲上主殿广场，林寒在门前守着
  ...[[-10, 30], [10, 30], [-16, 18], [16, 18], [-7, 8], [7, 8], [-13, -2], [13, -2]].map(([x, z]) => ({ type: 'jiashi', x, y: Y, z: CZ + z })),
  { type: 'tiejia', x: 0, y: Y, z: CZ + 2 },
  // 母星：奴隶战士就是从这里被送出去的
  { type: 'tiejia', x: M + 24, y: 0, z: 40 }, { type: 'tiejia', x: M - 22, y: 0, z: -20 },
  // 百里府：前院甲阵 → 水台与栈桥 → 东岸 → 八角秘殿
  ...[[-16, 200], [16, 200], [-22, 186], [22, 186], [-8, 180], [8, 180]].map(([x, z]) => ({ type: 'jiashi', x: BAILI.x + x, y: 0, z })),
  { type: 'tiejia', x: BAILI.x, y: 0, z: 174 },
  ...[[-15, 124], [15, 124], [0, 92]].map(([x, z]) => ({ type: 'jiashi', x: BAILI.x + x, y: BAILI.floorY, z })),
  ...[[22, 62], [50, 62]].map(([x, z]) => ({ type: 'jiashi', x: BAILI.x + x, y: BAILI.floorY, z })),
  { type: 'tiejia', x: BAILI.x + 70, y: 0, z: 44 },
  ...[[62, 38], [50, 36]].map(([x, z]) => ({ type: 'jiashi', x: BAILI.x + x, y: 0, z })),
  { type: 'bailiDouble', x: BAILI.x + BAILI.octagon.dx, y: BAILI.octagon.pit, z: BAILI.octagon.z + 1 },
  { type: 'bailiTrue', x: BAILI.x + BAILI.octagon.dx, y: BAILI.octagon.floor, z: BAILI.octagon.z - BAILI.octagon.apothem + 2, dormant: true },
  // 登州城 · 顾府（EP10–EP11）：门廊与前院的顾府护院 + 正堂阶前的二公子顾廷美 Boss
  ...[[-4.5, 118.5], [4.5, 118.5], [-7.5, 112.5], [7.5, 112.5], [-6.5, 104.5], [6.5, 104.5]].map(([dx, z]) => ({ type: 'gufuGuard', x: GU_MANSION.x + dx, y: 0, z })),
  { type: 'gutingmei', x: GU_MANSION.x, y: 0, z: 99.5 },
  // 登州城 · 清风楼（EP01 19:14–22:20）：前院与惊鹤堂内的清风楼捉刀人、光头络腮胡刀客 + 惊鹤堂中央 Boss 三爷
  ...[[-4.2, 117.5], [4.2, 117.5], [-5.5, 105.5], [5.5, 105.5]].map(([dx, z]) => ({ type: 'qingfengHunter', x: QINGFENG_TOWER.x + dx, y: 0, z })),
  ...[[-4.8, 94.5], [4.8, 94.5]].map(([dx, z]) => ({ type: 'qingfengBrute', x: QINGFENG_TOWER.x + dx, y: 0, z })),
  { type: 'sanye', x: QINGFENG_TOWER.x, y: 0, z: 89.5 }
];

const PLAYER_MAX_HP = 100;
const DEAD_FOR = 45, REGEN_AFTER = 6, REGEN_RATE = 9;
// 击倒回气：连着打一路才撑得到秘殿；替身倒下回得多，算第二阶段的开场
const KILL_HEAL = 8, REVEAL_HEAL = 40;

// ---------------------------------------------------------------- 几何：同一身量，每肢一个合并网格，顶点着色
const paint = (g, hex) => {
  const c = new THREE.Color(hex), out = g.index ? g.toNonIndexed() : g, n = out.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  out.setAttribute('color', new THREE.BufferAttribute(a, 3));
  out.deleteAttribute('uv');
  return out;
};
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (t, b, h, x = 0, y = 0, z = 0, s = 12) => new THREE.CylinderGeometry(t, b, h, s).translate(x, y, z);
const orb = (sx, sy, sz, x = 0, y = 0, z = 0) => new THREE.SphereGeometry(1, 16, 12).scale(sx, sy, sz).translate(x, y, z);
const part = (...list) => mergeGeometries(list.map(([g, hex]) => paint(g, hex)));

const SKIN = 0xf0c8a8, DARK = 0x17151a;

function faceParts(y) {
  return [[orb(.25, .245, .22, 0, y, 0), SKIN], [orb(.042, .052, .02, -.095, y - .015, .205), DARK], [orb(.042, .052, .02, .095, y - .015, .205), DARK], [box(.11, .02, .02, -.1, y + .055, .2), DARK], [box(.11, .02, .02, .1, y + .055, .2), DARK]];
}

const BUILD = {
  // 圆盔带尖，灰色札甲背心，暗红衣袖（EP23 50:20）
  jiashi() {
    const iron = 0x5d6058, lam = 0x3f423c, cloth = 0x6e2f2a, y = 1.0;
    // 札甲：一层层错色的甲片环
    const lamellae = [];
    for (let k = 0; k < 6; k++) lamellae.push([cyl(.172 + k * .005, .176 + k * .005, .036, 0, .9 - k * .056, 0), k % 2 ? iron : lam]);
    return {
      body: part([cyl(.15, .17, .46, 0, .72, 0), cloth], ...lamellae, [cyl(.2, .26, .24, 0, .44, 0), lam], [box(.32, .05, .24, 0, .54, 0), 0x2a2622], [orb(.07, .07, .07, -.2, .93, 0), iron], [orb(.07, .07, .07, .2, .93, 0), iron],
        ...faceParts(y), [orb(.265, .2, .24, 0, y + .1, -.01), iron], [cyl(.27, .27, .03, 0, y + .03, -.01, 20), lam], [cyl(.005, .03, .13, 0, y + .36, -.01, 8), iron]),
      arm: part([cyl(.052, .05, .34, 0, -.17, 0), cloth], [cyl(.056, .056, .1, 0, -.3, 0), 0x2a2622], [orb(.048, .05, .046, 0, -.38, 0), SKIN]),
      leg: part([cyl(.062, .056, .34, 0, -.17, 0), 0x2b2628], [cyl(.06, .06, .08, 0, -.34, 0), 0x18161a], [orb(.066, .05, .1, 0, -.42, .03), 0x18161a]),
      weapon: part([cyl(.013, .013, .9, 0, .05, 0, 8), 0x4a3424], [box(.012, .3, .06, 0, .6, 0), 0xc5cdd2], [box(.09, .012, .05, 0, .44, 0), 0x74654a])
    };
  },
  // 全身板甲、狭缝面甲、发光绿项圈（EP19 11:40 动画）
  tiejia() {
    const plate = 0x7e8388, deep = 0x4d5157, y = 1.0;
    return {
      body: part([cyl(.2, .17, .42, 0, .74, 0), plate], [orb(.22, .12, .17, 0, .93, 0), deep], [cyl(.2, .27, .24, 0, .44, 0), deep], [box(.34, .06, .25, 0, .54, 0), 0x2c2d31],
        [orb(.1, .085, .1, -.24, .95, 0), plate], [orb(.1, .085, .1, .24, .95, 0), plate], [orb(.27, .27, .25, 0, y, 0), plate], [box(.3, .026, .02, 0, y - .005, .245), DARK], [box(.02, .13, .02, 0, y - .08, .245), DARK], [cyl(.012, .05, .2, 0, y + .36, 0, 8), deep]),
      collar: part([new THREE.TorusGeometry(.13, .026, 8, 20).rotateX(Math.PI / 2).translate(0, .835, 0), 0x38ff6a]),
      arm: part([cyl(.06, .056, .34, 0, -.17, 0), plate], [orb(.066, .066, .066, 0, -.17, 0), deep], [cyl(.066, .058, .1, 0, -.3, 0), deep], [orb(.056, .056, .052, 0, -.38, 0), deep]),
      leg: part([cyl(.07, .064, .34, 0, -.17, 0), plate], [orb(.07, .06, .07, 0, -.17, .01), deep], [orb(.074, .055, .11, 0, -.42, .03), deep]),
      weapon: part([cyl(.016, .016, 1.1, 0, .2, 0, 8), 0x2a2c30], [box(.016, .48, .12, 0, .96, 0), 0xb4bcc2], [box(.12, .02, .08, 0, .72, 0), 0x303236])
    };
  },
  // 驼背、长臂的轮廓，没有脸：只能靠扭曲的光看出来（推断）
  wuxing() {
    const c = 0xffffff;
    return {
      body: part([orb(.2, .3, .23, 0, .78, -.04), c], [orb(.17, .16, .19, 0, 1.03, .1), c], [orb(.17, .14, .18, 0, .5, -.06), c]),
      arm: part([cyl(.05, .03, .5, 0, -.25, 0), c], [orb(.04, .05, .07, 0, -.53, .02), c]),
      leg: part([cyl(.06, .035, .38, 0, -.19, 0), c], [orb(.05, .04, .09, 0, -.42, .03), c]),
      weapon: null
    };
  },
  // 白袍敞开，内衬深色甲片，长发高冠，两撇胡（EP18 12:30）
  baili() {
    const robe = 0xd8d2c0, robeShade = 0xb9b3a0, inner = 0x23282a, scale = 0x6b5a3a, hair = 0x14110f, y = 1.0;
    const scales = [];
    for (let k = 0; k < 5; k++) scales.push([cyl(.125, .135, .04, 0, .93 - k * .07, .055), k % 2 ? scale : inner]);
    return {
      body: part([cyl(.13, .17, .46, 0, .72, 0), inner], ...scales,
        // 白袍：两片前襟留出中缝，后摆垂到小腿
        [box(.1, .62, .05, -.135, .66, .12), robe], [box(.1, .62, .05, .135, .66, .12), robe], [cyl(.19, .3, .52, 0, .5, -.05), robeShade], [cyl(.2, .22, .3, 0, .82, -.05), robe],
        [orb(.08, .07, .08, -.2, .93, 0), robe], [orb(.08, .07, .08, .2, .93, 0), robe], [box(.3, .05, .22, 0, .52, .02), 0x3a2c1c],
        ...faceParts(y),
        // 胡须
        [box(.06, .014, .012, -.04, y - .09, .216), hair], [box(.06, .014, .012, .04, y - .09, .216), hair],
        // 发：顶、后披、高髻金冠
        [orb(.262, .23, .235, 0, y + .06, -.02), hair], [box(.36, .6, .1, 0, y - .3, -.17), hair], [cyl(.075, .09, .16, 0, y + .32, -.02), hair], [cyl(.05, .1, .17, 0, y + .43, -.02, 8), 0xd0a24a], [box(.2, .018, .018, 0, y + .43, -.02), 0xd0a24a]),
      arm: part([cyl(.058, .1, .4, 0, -.2, 0), robe], [cyl(.1, .105, .03, 0, -.4, 0), robeShade], [orb(.046, .048, .046, 0, -.44, 0), SKIN]),
      leg: part([cyl(.06, .056, .34, 0, -.17, 0), inner], [orb(.066, .05, .1, 0, -.42, .03), 0x18161a]),
      weapon: part([cyl(.012, .012, .2, 0, -.02, 0, 8), 0x2a2018], [box(.11, .02, .05, 0, .09, 0), 0xc69a48], [box(.012, .86, .055, 0, .53, 0), 0xdde4e8])
    };
  },
  // 顾府护院：黛青劲装、玄色比甲与暗红护腕、黑幞头，执齐眉木棍长刀（EP10 42:10–42:35 & EP11 00:40）
  gufuGuard() {
    const robe = 0x3b4956, vest = 0x242a32, crimson = 0x6e2f2a, cap = 0x1b1d22, y = 1.0;
    return {
      body: part(
        [cyl(.15, .18, .46, 0, .72, 0), robe],
        [box(.29, .42, .22, 0, .73, .01), vest],
        [box(.31, .045, .24, 0, .53, 0), crimson],
        [cyl(.19, .26, .24, 0, .43, 0), robe],
        [orb(.072, .068, .072, -.2, .93, 0), vest], [orb(.072, .068, .072, .2, .93, 0), vest],
        ...faceParts(y),
        [orb(.26, .19, .235, 0, y + .11, -.01), cap],
        [box(.22, .08, .16, 0, y + .22, -.03), cap]
      ),
      arm: part([cyl(.052, .05, .34, 0, -.17, 0), robe], [cyl(.056, .056, .1, 0, -.3, 0), crimson], [orb(.048, .05, .046, 0, -.38, 0), SKIN]),
      leg: part([cyl(.062, .056, .34, 0, -.17, 0), 0x22262c], [cyl(.06, .06, .08, 0, -.34, 0), cap], [orb(.066, .05, .1, 0, -.42, .03), cap]),
      weapon: part([cyl(.014, .014, .95, 0, .08, 0, 8), 0x5c3e26], [box(.09, .014, .05, 0, .48, 0), 0x8c734b], [box(.013, .34, .062, 0, .66, 0), 0xcfd6dc])
    };
  },
  // 顾廷美（EP10 38:57–42:35 & EP11 01:00–05:10）：淡紫宽袖纱袍、深紫团花锦背心、银紫发冠与垂肩淡紫发带、佩长剑；
  // 右耳固定在头右侧（-.252, y, .01），左耳（+.252, y, .01）单独挂载，战败时被削落并切换为左耳流血创口与断耳落地效果。
  gutingmei() {
    const robe = 0xc6b0de, vest = 0x7b5ca8, vestTrim = 0x5a3e85, collar = 0xf2eef5, belt = 0x4b346e, hair = 0x16131c, crown = 0xd8dceb, ribbon = 0xdcc8f0, y = 1.0;
    return {
      body: part(
        [cyl(.145, .185, .48, 0, .72, 0), robe],
        // 深紫锦缎比甲与白交领中衣
        [box(.29, .45, .21, 0, .73, .01), vest],
        [box(.11, .46, .225, -.085, .73, .015), vestTrim], [box(.11, .46, .225, .085, .73, .015), vestTrim],
        [box(.065, .24, .232, -.03, .83, .02), collar], [box(.065, .24, .232, .03, .83, .02), collar],
        // 玉扣紫金腰封与下摆长袍
        [box(.32, .055, .24, 0, .52, .01), belt], [box(.07, .058, .25, 0, .52, .015), crown],
        [cyl(.19, .30, .52, 0, .48, -.03), robe],
        [box(.12, .56, .05, -.13, .62, .11), vest], [box(.12, .56, .05, .13, .62, .11), vest],
        [orb(.082, .072, .082, -.205, .93, 0), vest], [orb(.082, .072, .082, .205, .93, 0), vest],
        ...faceParts(y),
        // 右耳（x < 0 为身体右侧）
        [orb(.038, .058, .028, -.252, y, .01), SKIN],
        // 乌发、高髻、银紫 V 形发冠与两条垂肩淡紫发带
        [orb(.262, .225, .235, 0, y + .065, -.02), hair],
        [box(.34, .56, .09, 0, y - .26, -.165), hair],
        [cyl(.07, .085, .15, 0, y + .31, -.02), hair],
        [cyl(.058, .088, .15, 0, y + .41, -.02, 8), crown],
        [box(.16, .022, .022, 0, y + .42, .04), 0xb89cd8],
        // 垂在胸前两侧的淡紫发带（EP10 38:57 标志特征）
        [box(.034, .46, .018, -.165, .76, .135), ribbon],
        [box(.034, .46, .018, .165, .76, .135), ribbon]
      ),
      arm: part([cyl(.058, .105, .39, 0, -.2, 0), robe], [cyl(.105, .112, .035, 0, -.39, 0), vest], [orb(.046, .048, .046, 0, -.44, 0), SKIN]),
      leg: part([cyl(.06, .056, .34, 0, -.17, 0), 0x342946], [orb(.066, .05, .1, 0, -.42, .03), 0x181520]),
      weapon: part([cyl(.012, .012, .2, 0, -.02, 0, 8), 0x3b2854], [box(.11, .022, .05, 0, .09, 0), crown], [box(.012, .86, .052, 0, .53, 0), 0xe6ecf2])
    };
  },
  // 清风楼捉刀人（EP01 19:26–20:30）：褐衣皮甲背心、腰悬铜牌、高束发髻，执雁翎宽刀
  qingfengHunter() {
    const robe = 0x46382c, vest = 0x28211b, belt = 0x5c3e24, bronze = 0xc89b48, hair = 0x1a1512, y = 1.0;
    return {
      body: part(
        [cyl(.15, .18, .46, 0, .72, 0), robe],
        [box(.29, .42, .22, 0, .73, .01), vest],
        [box(.31, .05, .24, 0, .53, 0), belt],
        [box(.05, .07, .02, .11, .50, .125), bronze], // 腰间捉刀铜牌
        [cyl(.19, .26, .24, 0, .43, 0), robe],
        [orb(.072, .068, .072, -.2, .93, 0), vest], [orb(.072, .068, .072, .2, .93, 0), vest],
        ...faceParts(y),
        [orb(.258, .21, .232, 0, y + .08, -.015), hair],
        [cyl(.06, .075, .13, 0, y + .31, -.02, 10), hair]
      ),
      arm: part([cyl(.052, .05, .34, 0, -.17, 0), robe], [cyl(.056, .056, .1, 0, -.3, 0), belt], [orb(.048, .05, .046, 0, -.38, 0), SKIN]),
      leg: part([cyl(.062, .056, .34, 0, -.17, 0), 0x26221e], [orb(.066, .05, .1, 0, -.42, .03), 0x161412]),
      weapon: part([cyl(.014, .014, .22, 0, -.02, 0, 8), 0x4e3522], [box(.1, .018, .05, 0, .1, 0), bronze], [box(.014, .74, .065, 0, .48, 0), 0xcfd6dc])
    };
  },
  // 清风楼光头络腮胡刀客（EP01 20:40–21:58 frame_0621.jpg / frame_0648.jpg）：光头、浓密棕黑满腮胡、草褐编织披肩甲与深青短打，执厚背大砍刀
  qingfengBrute() {
    const tunic = 0x242e3a, shoulderPad = 0x524c36, belt = 0x3d2a1a, beard = 0x342216, y = 1.0;
    return {
      body: part(
        [cyl(.165, .19, .46, 0, .72, 0), tunic],
        [box(.34, .22, .25, 0, .84, 0), shoulderPad],
        [box(.33, .055, .25, 0, .53, 0), belt],
        [cyl(.2, .27, .24, 0, .43, 0), tunic],
        [orb(.086, .076, .086, -.21, .93, 0), shoulderPad], [orb(.086, .076, .086, .21, .93, 0), shoulderPad],
        ...faceParts(y),
        // 光头颅顶 + 浓密络腮大胡子包裹下颌与两腮
        [orb(.254, .23, .225, 0, y + .06, -.01), SKIN],
        [orb(.245, .14, .21, 0, y - .09, .03), beard],
        [box(.22, .08, .12, 0, y - .15, .12), beard],
        [box(.14, .024, .02, 0, y - .07, .215), beard]
      ),
      arm: part([cyl(.058, .054, .34, 0, -.17, 0), tunic], [cyl(.06, .06, .1, 0, -.3, 0), belt], [orb(.05, .052, .048, 0, -.38, 0), SKIN]),
      leg: part([cyl(.066, .06, .34, 0, -.17, 0), 0x1e242c], [orb(.068, .05, .1, 0, -.42, .03), 0x14161a]),
      weapon: part([cyl(.015, .015, .24, 0, -.03, 0, 8), 0x3d2817], [box(.11, .02, .055, 0, .1, 0), 0x8b6e42], [box(.016, .8, .088, 0, .51, 0), 0xc8d0d6])
    };
  },
  // 清风楼 Boss【三爷】（EP01 19:16–22:05 frame_0579.jpg / frame_0585.jpg / frame_0587.jpg）：
  // 靛蓝暗纹长袍外罩暗红斜襟半臂披甲、腰悬捉刀铜牌、八字胡与山羊胡、束发铜冠，手持巨型狼牙棒
  sanye() {
    const robe = 0x1e2838, sash = 0x761e22, sashTrim = 0x9e3236, belt = 0x231d1a, bronze = 0xd6a64c, hair = 0x171412, iron = 0x626870, y = 1.0;
    const spikes = [];
    for (let row = 0; row < 4; row++) {
      const sy = .46 + row * .12;
      spikes.push([box(.17, .024, .024, 0, sy, 0), 0xcad2d8], [box(.024, .024, .17, 0, sy, 0), 0xcad2d8]);
    }
    return {
      body: part(
        [cyl(.155, .19, .48, 0, .72, 0), robe],
        [box(.3, .44, .22, 0, .73, .01), robe],
        // 暗红斜襟半臂披甲与肩甲
        [box(.17, .45, .235, -.06, .73, .016), sash],
        [box(.04, .45, .24, .02, .73, .02), sashTrim],
        // 宽皮腰封与铜牌捉刀令
        [box(.33, .06, .25, 0, .52, .01), belt],
        [box(.075, .085, .26, 0, .51, .015), bronze],
        [cyl(.195, .3, .5, 0, .46, -.02), robe],
        [orb(.086, .076, .086, -.21, .93, 0), sash], [orb(.086, .076, .086, .21, .93, 0), robe],
        ...faceParts(y),
        // 八字胡与下巴短须
        [box(.065, .016, .014, -.042, y - .088, .216), hair],
        [box(.065, .016, .014, .042, y - .088, .216), hair],
        [box(.045, .048, .016, 0, y - .135, .214), hair],
        // 发髻与铜冠
        [orb(.262, .22, .235, 0, y + .065, -.02), hair],
        [cyl(.072, .088, .15, 0, y + .31, -.02, 10), hair],
        [cyl(.058, .088, .12, 0, y + .39, -.02, 8), bronze]
      ),
      arm: part([cyl(.06, .09, .38, 0, -.19, 0), robe], [cyl(.062, .062, .1, 0, -.32, 0), sash], [orb(.048, .05, .048, 0, -.42, 0), SKIN]),
      leg: part([cyl(.064, .058, .34, 0, -.17, 0), 0x18202c], [orb(.068, .05, .1, 0, -.42, .03), 0x141418]),
      // 巨型狼牙棒（EP01 @ 19:32 frame_0587.jpg）
      weapon: part(
        [cyl(.018, .016, .42, 0, .12, 0, 8), 0x4a321e],
        [cyl(.032, .024, .06, 0, .34, 0, 10), bronze],
        [cyl(.058, .044, .54, 0, .63, 0, 10), iron],
        [orb(.058, .058, .058, 0, .91, 0), iron],
        ...spikes
      )
    };
  }
};

const _down = new THREE.Vector3(0, -1, 0), _earDir = new THREE.Vector3(), _armQ = new THREE.Quaternion();
const geometryCache = {};
const geometriesFor = (type) => { const key = ENEMY_TYPES[type].rig || type; return (geometryCache[key] ||= BUILD[key]()); };

const barGeo = new THREE.PlaneGeometry(1, 1);
const barBackMat = new THREE.MeshBasicMaterial({ color: 0x151014, transparent: true, opacity: .75, depthTest: false });

function createRig(type) {
  const g = geometriesFor(type), group = new THREE.Group();
  let material, reveal = null;
  if (type === 'wuxing') {
    reveal = uniform(0);
    material = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    material.colorNode = Fn(() => vec3(.72, .9, 1).mul(sin(positionWorld.y.mul(18).add(time.mul(9))).mul(.2).add(1)))();
    material.opacityNode = Fn(() => {
      const f = pow(float(1).sub(abs(dot(normalize(normalWorld), normalize(cameraPosition.sub(positionWorld))))), 2.2);
      return f.mul(.72).add(.05).add(reveal.mul(.55));
    })();
  } else {
    material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .62, metalness: type === 'tiejia' ? .45 : .2 });
  }
  const mesh = (geo, parent = group) => { const m = new THREE.Mesh(geo, material); m.castShadow = type !== 'wuxing'; parent.add(m); return m; };
  const body = new THREE.Group();
  group.add(body);
  mesh(g.body, body);
  if (g.collar) { const c = new THREE.Mesh(g.collar, new THREE.MeshBasicMaterial({ color: new THREE.Color(.25, 2.4, .5) })); body.add(c); }
  const limb = (geo, x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); mesh(geo, p); return p; };
  const shoulder = type === 'wuxing' ? [.2, .92] : type === 'tiejia' ? [.28, .95] : [.21, .93];
  const armR = limb(g.arm, -shoulder[0], shoulder[1]), armL = limb(g.arm, shoulder[0], shoulder[1]);
  body.add(armR, armL);
  const legR = limb(g.leg, -.09, .45), legL = limb(g.leg, .09, .45);
  group.add(legR, legL);
  let weaponMesh = null;
  if (g.weapon) { weaponMesh = new THREE.Mesh(g.weapon, material); weaponMesh.position.set(0, -.38, .02); weaponMesh.rotation.x = Math.PI / 2 - .3; armR.add(weaponMesh); }

  // 顾廷美专属：完整左耳 + 被削耳后的鲜血创口、捂耳血手印、断耳落地与血泊效果（EP11 04:20–05:10）
  let earL = null, earWound = null, woundHalo = null, handBlood = null, earAftermath = null, severedEar = null, bloodPool = null, bloodDrops = null;
  if (type === 'gutingmei') {
    const earGeo = part([orb(.038, .058, .028, .252, 1.0, .01), SKIN]);
    earL = mesh(earGeo, body);

    earWound = new THREE.Group();
    earWound.visible = false;
    const woundGeo = part(
      // 左耳被齐根削落后的鲜红断面与残耳廓
      [orb(.042, .064, .030, .248, 1.0, .01), 0xc81010],
      [orb(.028, .048, .024, .260, 1.0, .012), 0xff2222],
      // 顺着左颊、左颈流到淡紫衣领与左肩的血迹
      [box(.022, .11, .024, .232, .91, .055), 0xd41414],
      [box(.026, .12, .026, .195, .83, .085), 0xb80e0e],
      [orb(.052, .035, .045, .175, .75, .115), 0xa80c0c]
    );
    mesh(woundGeo, earWound);
    const haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, .16, .12), transparent: true, opacity: .82, side: THREE.DoubleSide });
    woundHalo = new THREE.Mesh(new THREE.TorusGeometry(.12, .022, 8, 24).rotateY(Math.PI / 2), haloMat);
    woundHalo.position.set(.262, 1.0, .01);
    earWound.add(woundHalo);
    body.add(earWound);

    // 左手捂住左耳时染满手掌与指缝的鲜血
    const handBloodGeo = part(
      [orb(.055, .056, .054, 0, -.44, .01), 0xc81010],
      [box(.035, .09, .035, 0, -.38, .02), 0xa80c0c]
    );
    handBlood = mesh(handBloodGeo, armL);
    handBlood.visible = false;

    // 地面残局：被削飞落地的左耳、石板上的血泊、脱手掉落的佩剑、从指缝不断滴落的血珠
    earAftermath = new THREE.Group();
    earAftermath.visible = false;
    // 断耳：放大到夸张比例、立在石板上、耳廓/耳洞/耳垂轮廓清晰，切口鲜红，一眼认出是耳朵
    const EAR_S = 2.6;
    const sevGeo = part(
      [new THREE.TorusGeometry(.05, .017, 10, 24, Math.PI * 1.55).rotateZ(-.2).scale(1, 1.4, 1), SKIN],
      [orb(.044, .062, .012, 0, 0, -.004), 0xe7b494],
      [orb(.017, .024, .014, .004, -.004, .006), 0x9a5a48],
      [orb(.026, .03, .016, -.006, -.082, 0), SKIN],
      [box(.018, .1, .03, .058, -.01, 0), 0xd41010]
    ).scale(EAR_S, EAR_S, EAR_S);
    severedEar = mesh(sevGeo, earAftermath);
    severedEar.position.set(.52, .02, .38);

    // 断耳落点的脉动红圈，把视线引到耳朵上
    const markMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, .25, .12), transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide });
    const earMark = new THREE.Mesh(new THREE.RingGeometry(.2, .245, 32).rotateX(-Math.PI / 2), markMat);
    earMark.position.set(.62, .025, .62);
    earMark.name = 'earMark';
    earAftermath.add(earMark);

    const poolMat = new THREE.MeshBasicMaterial({ color: 0x9e0b0b, transparent: true, opacity: .88, depthWrite: false, side: THREE.DoubleSide });
    bloodPool = new THREE.Group();
    const poolMain = new THREE.Mesh(new THREE.CircleGeometry(.2, 20).rotateX(-Math.PI / 2), poolMat);
    poolMain.position.set(.26, .015, .20);
    const poolEar = new THREE.Mesh(new THREE.CircleGeometry(.12, 16).rotateX(-Math.PI / 2), poolMat);
    poolEar.position.set(.62, .015, .62);
    bloodPool.add(poolMain);
    earAftermath.add(poolEar);
    earAftermath.add(bloodPool);

    const dropGeo = new THREE.SphereGeometry(.022, 8, 6);
    const dropMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, .12, .10) });
    bloodDrops = Array.from({ length: 4 }, () => {
      const d = new THREE.Mesh(dropGeo, dropMat);
      earAftermath.add(d);
      return d;
    });
    group.add(earAftermath);
  }

  const barBack = new THREE.Mesh(barGeo, barBackMat), barFill = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: type === 'tiejia' ? 0xe0a440 : 0xd8433c, depthTest: false }));
  barBack.renderOrder = barFill.renderOrder = 20;
  barBack.visible = barFill.visible = false;
  group.add(barBack, barFill);
  // 真身的横扫：先在地上亮一圈红，给人时间跑出去
  let telegraph = null;
  if (ENEMY_TYPES[type].sweep) {
    const tMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, .22, .12), transparent: true, opacity: .34, depthWrite: false, side: THREE.DoubleSide });
    telegraph = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), tMat);
    telegraph.visible = false;
    telegraph.renderOrder = 4;
  }
  return { group, body, armR, armL, legR, legL, shoulderX: shoulder[0], shoulderY: shoulder[1], weaponMesh, earL, earWound, woundHalo, handBlood, earAftermath, severedEar, bloodPool, bloodDrops, material, reveal, barBack, barFill, telegraph };
}

// ---------------------------------------------------------------- 系统
export function createEnemySystem(scene, { resolve = null, onPlayerHit = null, onPlayerDown = null, onEnemyHit = null, onKill = null, onBossPhase = null, onAllyHit = null, onAllyDown = null } = {}) {
  const root = new THREE.Group();
  root.name = 'enemies';
  scene.add(root);
  const enemies = ENEMY_SPAWNS.map((s) => {
    const def = ENEMY_TYPES[s.type], rig = createRig(s.type);
    rig.group.scale.setScalar(def.scale);
    rig.group.position.set(s.x, s.y, s.z);
    rig.group.visible = false;
    root.add(rig.group);
    if (rig.telegraph) root.add(rig.telegraph);
    return { def, type: s.type, rig, dormant: !!s.dormant, earInjured: false, swings: 0, sweeping: false, stuck: 0, detour: 0, detourDir: 1, home: new THREE.Vector3(s.x, s.y, s.z), pos: rig.group.position, heading: Math.random() * 6.28, hp: def.hp, state: 'idle', timer: Math.random() * 2, cooldown: 0, walk: Math.random() * 6, knock: new THREE.Vector3(), barTimer: 0, flash: 0, deadAt: 0, wander: null, hitStun: 0 };
  });
  const player = { hp: PLAYER_MAX_HP, max: PLAYER_MAX_HP, sinceHit: 99, invulnerable: 0, kills: 0 };
  const to = new THREE.Vector3();
  let clock = 0;

  // 能被敌人盯上的同伴，由 party.js 每帧传入：{ id, position, vitals, targetable }
  let allies = [];
  const alive = (e) => e.state !== 'dead' && !e.dormant;
  const trueBaili = enemies.find((e) => e.type === 'bailiTrue'), doubleBaili = enemies.find((e) => e.type === 'bailiDouble');
  const guBoss = enemies.find((e) => e.type === 'gutingmei');
  const sanyeBoss = enemies.find((e) => e.type === 'sanye');

  /** amount = Infinity 是致命一击（包哥）：无视护甲，正好打掉剩下的血。 */
  function damage(e, amount, from, knock = 0, healer = player) {
    if (!alive(e)) return false;
    const dealt = amount === Infinity ? Math.ceil(e.hp) : Math.round(amount * e.def.armor);
    e.hp -= dealt;
    e.flash = 1; e.barTimer = 4;
    if (e.rig.reveal) e.rig.reveal.value = 1;
    if (from && knock) { to.subVectors(e.pos, from).setY(0).normalize().multiplyScalar(knock * (e.def.poise ? .25 : 1)); e.knock.copy(to); }
    if (e.state === 'idle' || e.state === 'return') { e.state = 'chase'; }
    // 打断和硬直只属于玩家：七个同伴轮流砍，否则敌人会被锁死，一刀也出不来
    if (healer === player) {
      if (!e.def.poise && e.state === 'windup') { e.state = 'chase'; e.cooldown = .5; }
      if (!e.def.poise) e.hitStun = .22;
    }
    onEnemyHit?.(e, dealt);
    if (e.hp <= 0) {
      e.hp = 0; e.state = 'dead'; e.deadAt = clock; e.timer = 0; player.kills++;
      // 击倒回血只给出手的人，同伴的击杀不会变成玩家的血包
      if (healer.hp > 0) healer.hp = Math.min(healer.max, healer.hp + (e === doubleBaili ? REVEAL_HEAL : KILL_HEAL));
      if (e.rig.telegraph) e.rig.telegraph.visible = false;
      if (e === doubleBaili) {
        // 倒下的是替身：真身从北墙暗门走出来
        trueBaili.dormant = false; trueBaili.state = 'chase'; trueBaili.hp = trueBaili.def.hp; trueBaili.cooldown = 1.2;
        trueBaili.pos.copy(trueBaili.home); trueBaili.rig.group.rotation.set(0, 0, 0);
        onBossPhase?.('reveal', trueBaili);
      } else if (e === trueBaili) onBossPhase?.('defeated', e);
      else if (e === guBoss) {
        // 顾廷美战败：左耳被削落，跪地死死捂住流血的左耳（EP11 04:20–04:50）
        e.earInjured = true;
        if (e.rig.earL) e.rig.earL.visible = false;
        if (e.rig.earWound) e.rig.earWound.visible = true;
        if (e.rig.handBlood) e.rig.handBlood.visible = true;
        if (e.rig.earAftermath) e.rig.earAftermath.visible = true;
        if (e.rig.weaponMesh) e.rig.weaponMesh.visible = false;
        onBossPhase?.('guDefeated', e);
        onKill?.(e, player.kills);
      } else if (e === sanyeBoss) {
        onBossPhase?.('sanyeDefeated', e);
        onKill?.(e, player.kills);
      } else onKill?.(e, player.kills);
    }
    return true;
  }

  /** 主角出招命中的一刻：扇形判定，pierce 打中范围内所有人，否则只打最近的（箭、石子）。 */
  function strike(ent, hit) {
    if (!hit) return 0;
    const scale = ent.damageScale ?? 1, healer = ent.vitals || player;
    const fx = Math.sin(ent.heading), fz = Math.cos(ent.heading), hits = [];
    for (const e of enemies) {
      if (!alive(e) || !e.rig.group.visible && e.pos.distanceTo(ent.position) > 200) continue;
      const dy = Math.abs(e.pos.y - ent.position.y);
      to.subVectors(e.pos, ent.position).setY(0);
      const d = to.length();
      if (dy > 4 || d > hit.range + e.def.radius) continue;
      const along = d > .001 ? (to.x * fx + to.z * fz) / d : 1;
      // 贴身时不挑角度，免得正好错开一点就打不到
      if (d > 1.2 && Math.acos(Math.min(1, Math.max(-1, along))) > hit.arc / 2) continue;
      hits.push([d, e]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    const list = hit.pierce ? hits : hits.slice(0, 1);
    // lethal 不吃同伴减伤：包哥打谁都是一击倒
    list.forEach(([, e]) => damage(e, hit.lethal ? Infinity : hit.damage * scale, ent.position, (hit.knock || 0) * scale, healer));
    return list.length;
  }

  /** 出招时该朝哪转：够得着的敌人里取最近的，略偏向面前的。范围内没人就返回 null，不动朝向。 */
  function aim(ent, hit) {
    if (!hit) return null;
    const fx = Math.sin(ent.heading), fz = Math.cos(ent.heading);
    let best = null, bestScore = Infinity;
    for (const e of enemies) {
      if (!alive(e) || Math.abs(e.pos.y - ent.position.y) > 4) continue;
      to.subVectors(e.pos, ent.position).setY(0);
      const d = to.length();
      if (d < .001 || d > Math.min(hit.range + e.def.radius + AIM_SLACK, AIM_MAX)) continue;
      const off = Math.acos(Math.min(1, Math.max(-1, (to.x * fx + to.z * fz) / d)));
      const score = d * (1 + off * .35);
      if (score < bestScore) { bestScore = score; best = Math.atan2(to.x, to.z); }
    }
    return best;
  }

  function hitPlayer(e, amount = e.def.damage) {
    if (player.invulnerable > 0 || player.hp <= 0) return;
    player.hp = Math.max(0, player.hp - amount);
    player.sinceHit = 0;
    onPlayerHit?.(player, e);
    if (player.hp <= 0) {
      player.invulnerable = 3;
      for (const o of enemies) if (alive(o)) { o.state = 'return'; o.sweeping = false; if (o.rig.telegraph) o.rig.telegraph.visible = false; }
      onPlayerDown?.(player);
    }
  }

  function hitAlly(ally, e, amount = e.def.damage) {
    const v = ally.vitals;
    if (v.invulnerable > 0 || v.hp <= 0) return;
    v.hp = Math.max(0, v.hp - amount);
    v.sinceHit = 0;
    if (v.hp <= 0) { v.invulnerable = 3; ally.targetable = false; onAllyDown?.(ally, e); }
    else onAllyHit?.(ally, e);
  }

  /** 这个敌人现在盯谁：够得着的人里取最近的，已经盯上的略占优，免得在两人之间来回转头。 */
  function pickTarget(e, ent, playerTargetable) {
    let best = null, bestScore = Infinity;
    const consider = (who, position, vitals) => {
      if (vitals.hp <= 0 || vitals.invulnerable > 0 || Math.abs(position.y - e.pos.y) >= 6) return;
      const score = Math.hypot(position.x - e.pos.x, position.z - e.pos.z) * (e.target === who ? .75 : 1);
      if (score < bestScore) { bestScore = score; best = who; }
    };
    if (playerTargetable) consider(playerFighter, ent.position, player);
    for (const a of allies) if (a.targetable) consider(a, a.position, a.vitals);
    e.target = best;
    return best;
  }
  const playerFighter = { id: 'player' };

  function revive(e) {
    e.hp = e.def.hp; e.state = 'idle'; e.pos.copy(e.home); e.timer = 1; e.cooldown = 0;
    e.earInjured = false;
    e.rig.group.rotation.set(0, e.heading, 0);
    e.rig.group.visible = true;
    e.rig.body.position.set(0, 0, 0);
    e.rig.body.rotation.set(0, 0, 0);
    e.rig.armL.position.set(e.rig.shoulderX, e.rig.shoulderY, 0);
    e.rig.armL.rotation.set(0, 0, 0);
    e.rig.armL.scale.set(1, 1, 1);
    e.rig.legL.position.y = e.rig.legR.position.y = .45;
    e.rig.armR.rotation.set(0, 0, 0);
    e.rig.legL.rotation.set(0, 0, 0);
    e.rig.legR.rotation.set(0, 0, 0);
    if (e.rig.earL) e.rig.earL.visible = true;
    if (e.rig.earWound) e.rig.earWound.visible = false;
    if (e.rig.handBlood) e.rig.handBlood.visible = false;
    if (e.rig.earAftermath) e.rig.earAftermath.visible = false;
    if (e.rig.weaponMesh) e.rig.weaponMesh.visible = true;
    e.swings = 0; e.sweeping = false;
    if (e.rig.telegraph) e.rig.telegraph.visible = false;
  }

  function animate(e, dt, target, moving, camera) {
    const r = e.rig;
    e.walk += moving ? dt * (e.type === 'wuxing' ? 12 : 8.5) : 0;
    const s = moving ? Math.sin(e.walk) : 0;
    const blend = Math.min(1, dt * 14);
    r.legL.rotation.x += (-s * .55 - r.legL.rotation.x) * blend;
    r.legR.rotation.x += (s * .55 - r.legR.rotation.x) * blend;
    let armR = s * .4, armL = -s * .4, lean = 0;
    if (e.state === 'windup') { const t = 1 - e.timer / (e.sweeping ? e.def.sweep.windup : e.def.windup); armR = -2.5 * Math.min(1, t * 1.5); armL = -.6 * t; lean = -.12 * t; }
    if (e.state === 'recover') { const t = Math.min(1, e.timer / .3); armR = -.5 * t - .5; lean = .24 * t; }
    r.armR.rotation.x += (armR - r.armR.rotation.x) * Math.min(1, dt * 22);
    r.armL.rotation.x += (armL - r.armL.rotation.x) * blend;
    r.body.rotation.x += (lean + (e.type === 'wuxing' ? .35 : 0) - r.body.rotation.x) * blend;
    // 朝向
    let delta = target - e.heading;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    e.heading += delta * Math.min(1, dt * 7);
    r.group.rotation.y = e.heading;
    // 受击闪白
    e.flash = Math.max(0, e.flash - dt * 5);
    if (r.material.emissive) r.material.emissive.setRGB(e.flash * .9, e.flash * .8, e.flash * .7);
    if (r.reveal) r.reveal.value = Math.max(0, r.reveal.value - dt * .7);
    // 血条
    e.barTimer = Math.max(0, e.barTimer - dt);
    const show = e.barTimer > 0 && alive(e) && camera;
    r.barBack.visible = r.barFill.visible = !!show;
    if (show) {
      const w = .62, top = 1.62;
      r.barBack.position.set(0, top, 0); r.barBack.scale.set(w + .04, .085, 1);
      const pct = e.hp / e.def.hp;
      r.barFill.scale.set(Math.max(.001, w * pct), .05, 1);
      const inv = r.group.quaternion.clone().invert().multiply(camera.quaternion);
      r.barBack.quaternion.copy(inv); r.barFill.quaternion.copy(inv);
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(inv);
      r.barFill.position.set(0, top, 0).addScaledVector(side, -(1 - pct) * w / 2);
    }
  }

  function tickVitals(v, dt) {
    v.sinceHit += dt;
    v.invulnerable = Math.max(0, v.invulnerable - dt);
    if (v.hp > 0 && v.hp < v.max && v.sinceHit > REGEN_AFTER) v.hp = Math.min(v.max, v.hp + REGEN_RATE * dt);
  }

  function update(dt, ent, mode, camera, fighters = []) {
    clock += dt;
    allies = fighters;
    tickVitals(player, dt);
    for (const a of allies) tickVitals(a.vitals, dt);
    const targetable = mode === 'person' || mode === 'horse';
    // 围上来的敌人轮流动手，不然八个甲士同时落刀，三秒就没了
    let swinging = enemies.reduce((n, e) => n + (e.state === 'windup' ? 1 : 0), 0);
    let camX = 0, camZ = 0, camDist = 0;
    if (camera) {
      camX = camera.position.x - ent.position.x; camZ = camera.position.z - ent.position.z;
      camDist = Math.hypot(camX, camZ) || 1; camX /= camDist; camZ /= camDist;
    }
    for (const e of enemies) {
      if (e.dormant) { e.rig.group.visible = false; continue; }
      const far = e.pos.distanceTo(ent.position);
      const near = far < 180 || e.home.distanceTo(ent.position) < 180;
      // 贴着镜头的敌人先隐去，免得一个头盔挡住整个画面
      const inFace = camera && camera.position.distanceTo(e.pos) < CAMERA_CLEAR * e.def.scale;
      e.rig.group.visible = near && !inFace && (alive(e) || e.type === 'gutingmei' || clock - e.deadAt < 1.6);
      if (!alive(e)) {
        if (e.rig.group.visible) {
          const t = clock - e.deadAt;
          if (e.type === 'gutingmei') {
            // 顾廷美被击倒后不沉入地下，而是跪倒在石板上，左手死死捂住被削落的左耳，鲜血从指缝滴落（EP11 04:20–04:50）
            const k = Math.min(1, t / .4);
            e.pos.y = getGround(e);
            e.rig.group.rotation.x = 0;
            // 跪坐：躯干与双腿一起下沉，小腿向后平贴石板，不再悬空横伸
            e.rig.body.position.y = -.34 * k;
            e.rig.body.rotation.x = .16 * k + Math.sin(t * 11) * .03;
            e.rig.body.rotation.z = -.2 * k + Math.cos(t * 14) * .025;
            e.rig.legL.position.y = e.rig.legR.position.y = .45 - .34 * k;
            e.rig.legL.rotation.set(1.42 * k, 0, -.12 * k);
            e.rig.legR.rotation.set(1.42 * k, 0, .12 * k);
            // 左臂仍连在肩上：屈臂（缩短前臂视长）上抬，手掌按住左耳创口
            e.rig.armL.position.set(e.rig.shoulderX + .02 * k, e.rig.shoulderY, .04 * k);
            _earDir.set(.07, .13, .05).normalize();
            _armQ.setFromUnitVectors(_down, _earDir);
            e.rig.armL.quaternion.identity().slerp(_armQ, k);
            e.rig.armL.rotation.z += Math.sin(t * 13) * .03;
            e.rig.armL.scale.set(1, 1 - .55 * k, 1);
            // 右手脱剑垂撑
            e.rig.armR.rotation.set(-.55 * k, 0, 0);
            // 削落的左耳抛落地面 + 血泊扩散 + 创口红圈脉动 + 鲜血连续滴落
            if (e.rig.severedEar) {
              const p = Math.min(1, t / .42);
              // 从左耳位置飞出，翻滚后竖立着落在他身前，耳廓朝外清晰可辨
              e.rig.severedEar.position.set(.25 + .37 * p, (1 - p) * .72 + Math.sin(p * Math.PI) * .3 + .2 * p, .02 + .6 * p);
              e.rig.severedEar.rotation.set((1 - p) * 6.3 - .25 * p, (1 - p) * 4 + .5 * p, (1 - p) * 5);
              const mark = e.rig.earAftermath.getObjectByName('earMark');
              if (mark) mark.scale.setScalar(p >= 1 ? 1 + Math.sin(t * 6) * .15 : .001);
            }
            if (e.rig.bloodPool) {
              const s = Math.min(1.45, .3 + t * .32);
              e.rig.bloodPool.scale.set(s, 1, s);
            }
            if (e.rig.woundHalo) {
              const pulse = 1 + Math.sin(t * 9) * .22;
              e.rig.woundHalo.scale.setScalar(pulse);
            }
            if (e.rig.bloodDrops) {
              for (let i = 0; i < e.rig.bloodDrops.length; i++) {
                const phase = (t * 1.8 + i * .25) % 1;
                e.rig.bloodDrops[i].position.set(.25 + (i - 1.5) * .022, .72 * (1 - phase * phase) + .02, .16 + phase * .06);
              }
            }
          } else {
            const k = Math.min(1, t / .45);
            e.rig.group.rotation.x = -k * 1.5;
            e.rig.body.rotation.x = 0;
            e.pos.y = getGround(e) - Math.max(0, t - 1) * 1.2;
          }
          e.flash = Math.max(0, e.flash - dt * 5);
          if (e.rig.material.emissive) e.rig.material.emissive.setRGB(e.flash, e.flash * .8, e.flash * .7);
          e.rig.barBack.visible = e.rig.barFill.visible = false;
        }
        // 真身不单独复活；替身要等真身也倒了，才连同把真身重新藏回暗门后
        const waiting = e === trueBaili || (e === doubleBaili && !trueBaili.dormant && trueBaili.state !== 'dead');
        if (!waiting && clock - e.deadAt > DEAD_FOR && e.home.distanceTo(ent.position) > 40) {
          e.rig.group.rotation.x = 0;
          revive(e);
          if (e === doubleBaili) { trueBaili.dormant = true; trueBaili.rig.group.rotation.x = 0; revive(trueBaili); }
        }
        continue;
      }
      if (!near) continue;
      const target = pickTarget(e, ent, targetable);
      const targetPos = target === playerFighter || !target ? ent.position : target.position;
      const dy = Math.abs(targetPos.y - e.pos.y);
      to.subVectors(targetPos, e.pos).setY(0);
      const dist = to.length(), facePlayer = Math.atan2(to.x, to.z);
      let moving = false, heading = e.heading;
      e.cooldown = Math.max(0, e.cooldown - dt);
      e.hitStun = Math.max(0, e.hitStun - dt);
      const seesPlayer = !!target;

      if (e.state === 'idle') {
        e.timer -= dt;
        if (seesPlayer && dist < e.def.aggro) e.state = 'chase';
        else if (e.timer <= 0) { e.timer = 2 + Math.random() * 3; const a = Math.random() * 6.28; e.wander = Math.random() < .55 ? new THREE.Vector3(e.home.x + Math.cos(a) * 5, e.home.y, e.home.z + Math.sin(a) * 5) : null; }
        if (e.wander) {
          const w = to.clone().subVectors(e.wander, e.pos).setY(0);
          if (w.length() > .4) { heading = Math.atan2(w.x, w.z); step(e, heading, e.def.speed * .36, dt); moving = true; } else e.wander = null;
        }
      } else if (e.state === 'chase') {
        heading = facePlayer;
        if (!seesPlayer || e.home.distanceTo(e.pos) > 70) e.state = 'return';
        else if (dist <= e.def.reach && e.cooldown <= 0 && (e.def.boss || swinging < MAX_SWINGING)) {
          e.state = 'windup'; e.timer = e.def.windup; swinging++;
          if (e.def.sweep && ++e.swings % e.def.sweep.every === 0) { e.sweeping = true; e.timer = e.def.sweep.windup; }
        }
        else if (dist > e.def.reach * .75 && e.hitStun <= 0) { step(e, heading, e.def.speed, dt); moving = true; }
      } else if (e.state === 'windup') {
        if (!e.sweeping) heading = facePlayer;
        e.timer -= dt;
        if (e.sweeping) {
          const t = e.rig.telegraph, k = 1 - Math.max(0, e.timer) / e.def.sweep.windup;
          t.visible = true;
          t.position.set(e.pos.x, e.pos.y + .08, e.pos.z);
          t.scale.setScalar(e.def.sweep.radius * (.35 + .65 * k));
          t.material.opacity = .22 + .3 * k;
        }
        if (e.timer <= 0) {
          if (e.sweeping) {
            // 横扫是范围招：圈里的人都挨，不只是它盯着的那个
            const inSweep = (p) => Math.hypot(p.x - e.pos.x, p.z - e.pos.z) <= e.def.sweep.radius && Math.abs(p.y - e.pos.y) < 3;
            if (targetable && inSweep(ent.position)) hitPlayer(e, e.def.sweep.damage);
            for (const a of allies) if (a.targetable && inSweep(a.position)) hitAlly(a, e, e.def.sweep.damage);
            e.sweeping = false;
            e.rig.telegraph.visible = false;
          } else if (target && dist <= e.def.reach + .9 && dy < 3) {
            if (target === playerFighter) hitPlayer(e); else hitAlly(target, e);
          }
          e.state = 'recover'; e.timer = .42; e.cooldown = e.def.cooldown;
        }
      } else if (e.state === 'recover') {
        e.timer -= dt;
        if (e.timer <= 0) e.state = 'chase';
      } else if (e.state === 'return') {
        to.subVectors(e.home, e.pos).setY(0);
        if (to.length() < 1) { e.state = 'idle'; e.hp = Math.min(e.def.hp, e.hp + e.def.hp * .5); }
        else { heading = Math.atan2(to.x, to.z); step(e, heading, e.def.speed, dt); moving = true; if (seesPlayer && dist < e.def.aggro * .7) e.state = 'chase'; }
      }
      if (e.knock.lengthSq() > .01) {
        const nx = e.pos.x + e.knock.x * dt, nz = e.pos.z + e.knock.z * dt;
        move(e, nx, nz);
        e.knock.multiplyScalar(Math.max(0, 1 - dt * 7));
      }
      // 走进镜头和主角之间的敌人往两边让，别把主角挡住
      if (camera && far < camDist + 1) {
        const px = e.pos.x - ent.position.x, pz = e.pos.z - ent.position.z;
        const along = px * camX + pz * camZ, side = px * camZ - pz * camX;
        if (along > 0 && Math.abs(side) < CAMERA_LANE) {
          const dir = side >= 0 ? 1 : -1, slide = CAMERA_LANE_SPEED * dt * dir;
          move(e, e.pos.x + camZ * slide, e.pos.z - camX * slide);
        }
      }
      // 不叠在一起
      for (const o of enemies) if (o !== e && alive(o) && o.rig.group.visible) {
        const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, d2 = dx * dx + dz * dz, min = e.def.radius + o.def.radius;
        if (d2 > .001 && d2 < min * min) { const d = Math.sqrt(d2), p = (min - d) * .5 * Math.min(1, dt * 8); e.pos.x += dx / d * p; e.pos.z += dz / d * p; }
      }
      e.pos.y = getGround(e);
      animate(e, dt, heading, moving, camera);
    }
  }

  function getGround(e) { return getWorldGroundHeight(e.pos.x, e.pos.z, e.home.y); }
  function move(e, x, z) {
    const r = resolve ? resolve(x, e.pos.y, z, e.def.radius) : { x, z };
    e.pos.x = r.x; e.pos.z = r.z;
  }
  // 直线走不动（撞上案台、卡在墙角）就侧身绕一段，方向每次换边
  function step(e, heading, speed, dt) {
    if (e.detour > 0) { e.detour -= dt; heading += e.detourDir * 1.35; }
    const x = e.pos.x, z = e.pos.z, want = speed * dt;
    move(e, x + Math.sin(heading) * want, z + Math.cos(heading) * want);
    const moved = Math.hypot(e.pos.x - x, e.pos.z - z);
    if (moved < want * .4) e.stuck += dt; else e.stuck = Math.max(0, e.stuck - dt);
    if (e.stuck > .25) { e.stuck = 0; e.detour = .8; e.detourDir = -e.detourDir; }
  }

  return {
    enemies, player, update, strike, aim, damage, root,
    healPlayer() { player.hp = player.max; player.sinceHit = 99; player.invulnerable = 2.5; },
    /** 正在交手的 Boss，给界面顶端的长血条用 */
    boss(ent) {
      const candidates = [trueBaili && !trueBaili.dormant && alive(trueBaili) ? trueBaili : doubleBaili, guBoss, sanyeBoss];
      let best = null, bestDist = 45;
      for (const b of candidates) {
        if (!b || !alive(b) || b.state === 'idle' || b.state === 'return') continue;
        const d = b.pos.distanceTo(ent.position);
        if (d <= bestDist) { bestDist = d; best = b; }
      }
      return best;
    },
    markers: () => enemies.filter((e) => alive(e) && e.type !== 'wuxing').map((e) => e.pos),
    snapshot: () => ({ player: Math.round(player.hp), kills: player.kills, alive: enemies.filter(alive).length, total: enemies.length })
  };
}
