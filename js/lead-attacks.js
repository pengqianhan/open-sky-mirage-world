// One signature attack per lead, authored as keyframes in torso space (character units, +Z forward,
// +X the character's left). Hands are IK targets and weapons are placed from them, so a held weapon
// can never drift out of the hand. See attackPose in lead-characters.js for how a sample is applied.
//
// Keys inherit anything they omit from the previous key. Tracks:
//   torso, head     Euler XYZ. Torso +X leans forward, -Y turns toward the character's right.
//   root            [lift, step forward] of the whole body.
//   legL, legR      [thigh forward swing (negative = forward), thigh out, knee bend]. Hips sit on the longer leg.
//   skirt           [tilt, depth scale]; hair [trail back, sideways].
//   handR, handL    palm targets.
//   dirR, edgeR     where the right hand's weapon points, and its local +X (cutting edge); same for L.
//   lw, lg          how much the left hand is on the right hand's weapon, and how far along it.
//   slide           the weapon slides through the hand along its axis.
//   pull, open      bowstring draw and machine-case doors, 0..1.
//
// hit is what the strike does in the world (enemies.js): range in metres, arc in radians (a fan ahead of the
// player), damage, knock-back, and pierce = hits everyone in the fan rather than only the nearest. A clip with a
// second beat (流萤交剪, 匣中飞针) applies it twice. lethal = whatever it reaches dies outright: armour and the
// companions' damage scale are ignored, and damage is only what the gallery shows (包哥).

const DEFAULTS = {
  torso: [0, 0, 0], head: [0, 0, 0], root: [0, 0], legL: [0, 0, 0], legR: [0, 0, 0], skirt: [0, 1], hair: [0, 0],
  handR: [-.243, -.076, .02], handL: [.243, -.076, .02],
  dirR: [0, 1, 0], edgeR: [1, 0, 0], dirL: [0, 1, 0], edgeL: [1, 0, 0],
  lw: [0], lg: [.3], slide: [0], pull: [0], open: [0]
};
const TRACKS = Object.keys(DEFAULTS);
const POLE_REST = { handR: [-.24, .0, .2], dirR: [0, 1, 0], edgeR: [1, 0, 0] };

// Yunniang's knives on the back: gripped in the sheaths, pulled partly out, then swung up behind the shoulders.
const KNIFE_SHEATHED = {
  handR: [-.17, .345, -.125], dirR: [.54, -.84, -.05], edgeR: [-.84, -.54, -.03],
  handL: [.17, .345, -.149], dirL: [-.54, -.84, -.05], edgeL: [.84, -.54, -.03]
};
const KNIFE_LEAVING = {
  handR: [-.24, .454, -.118], dirR: [.45, -.7, -.55], edgeR: [-.84, -.54, -.03],
  handL: [.24, .454, -.142], dirL: [-.45, -.7, -.55], edgeL: [.84, -.54, -.03]
};
const KNIFE_FLIP = {
  handR: [-.27, .42, -.06], dirR: [-.1, .35, -.93], edgeR: [-.9, -.3, 0],
  handL: [.27, .42, -.06], dirL: [.1, .35, -.93], edgeL: [.9, -.3, 0]
};

const SPECS = {
  // 推掌气浪: coils to the right, steps in and drives the right palm out through a ring of qi.
  caosheng: {
    title: '推云掌', hit: { range: 7, arc: 1.2, damage: 18, knock: 7, pierce: true }, strike: .4, duration: 1.15, cancelAt: .78,
    sound: { from: 900, to: 180, duration: .32, gain: .1 },
    glows: [{ hand: 'R', from: .22, to: .56, radius: .1, color: '#3f8dff' }],
    rings: [
      { t: .4, life: .34, at: { hand: 'R' }, axis: 'forward', radius: [.06, .46], travel: .55, color: '#3f8dff' },
      { t: .44, life: .36, at: { hand: 'R' }, axis: 'forward', radius: [.08, .68], travel: 1, color: '#6aa9ff' },
      { t: .48, life: .38, at: { hand: 'R' }, axis: 'forward', radius: [.1, .86], travel: 1.5, color: '#9ac6ff' }
    ],
    keys: [
      { t: 0 },
      { t: .22, torso: [-.05, -.72, 0], head: [.02, .6, 0], root: [0, -.02], legL: [-.1, .03, .16], legR: [.12, .02, .22], skirt: [0, 1.3], handR: [-.26, .05, -.14], handL: [.13, .3, .3], hair: [.04, 0] },
      { t: .34, torso: [.06, .05, 0], head: [-.04, 0, 0], root: [0, .07], legL: [-.15, .03, .1], legR: [.16, .02, .14], skirt: [-.02, 1.34], handR: [-.2, .2, .2], handL: [.24, .16, .12], hair: [.1, 0] },
      { t: .4, torso: [.2, .6, 0], head: [-.12, -.52, 0], root: [0, .17], legL: [-.2, .03, .06], legR: [.2, .02, .12], skirt: [-.03, 1.42], handR: [-.232, .28, .335], handL: [.25, .05, -.1], hair: [.26, 0] },
      { t: .6, torso: [.17, .56, 0], head: [-.08, -.48, 0], root: [0, .18], handR: [-.225, .27, .32], handL: [.25, .04, -.08], hair: [.12, 0] },
      { t: .98, torso: [0, 0, 0], head: [0, 0, 0], root: [0, 0], legL: [0, 0, 0], legR: [0, 0, 0], skirt: [0, 1], handR: DEFAULTS.handR, handL: DEFAULTS.handL, hair: [0, 0] },
      { t: 1.15 }
    ]
  },

  // 挽弓: takes the bow from behind the shoulder, turns side-on, draws to the cheek and looses.
  zengqian: {
    title: '飞羽穿云', hit: { range: 34, arc: .24, damage: 36, knock: 2 }, strike: .74, duration: 1.45, cancelAt: 1.1,
    sound: { from: 1500, to: 420, duration: .18, gain: .1 },
    drawn: { L: [.15, 1.3] },
    elbows: { R: [-.55, .25, -.8] },
    arrow: { nockAt: .36, release: .74, speed: 26, life: .34, length: .56, color: '#ff5a3c' },
    keys: [
      { t: 0 },
      { t: .15, torso: [0, .3, 0], head: [0, -.2, 0], handL: [.2, .22, -.11], handR: [-.22, -.02, .1], legL: [-.06, .04, .1], legR: [.06, .04, .12] },
      { t: .25, handL: [.32, .22, .1], torso: [.01, -.25, 0], head: [0, .2, 0] },
      { t: .36, torso: [.02, -.75, 0], head: [0, .62, 0], handL: [.2, .28, .3], handR: [.05, .3, .27], dirL: [.05, 1, -.1], edgeL: [.81, 0, .58], legL: [-.24, .1, .1], legR: [.24, .1, .16], skirt: [0, 1.1], pull: [.05] },
      { t: .64, torso: [.0, -.95, 0], head: [-.04, .84, 0], handL: [.25, .3, .335], handR: [-.03, .3, .13], dirL: [0, 1, 0], edgeL: [.81, 0, .58], legL: [-.3, .12, .14], legR: [.3, .12, .2], pull: [1] },
      { t: .74, torso: [.0, -.97, 0], head: [-.04, .86, 0], handR: [-.05, .3, .12], pull: [1] },
      { t: .78, torso: [-.05, -.92, 0], handL: [.24, .32, .325], handR: [-.16, .34, .03], pull: [0] },
      { t: 1, torso: [-.02, -.88, 0], handL: [.24, .3, .32], handR: [-.28, .22, -.04] },
      { t: 1.16, torso: [-.01, -.25, 0], head: [0, .2, 0], handL: [.33, .22, .08], handR: [-.26, .08, 0] },
      { t: 1.3, torso: [0, .2, 0], head: [0, -.1, 0], handL: [.2, .22, -.11], handR: [-.24, -.06, .05], dirL: [.03, 1, 0], edgeL: [1, 0, 0], legL: [-.04, .03, .06], legR: [.04, .03, .06], skirt: [0, 1] },
      { t: 1.45, torso: [0, 0, 0], head: [0, 0, 0], handL: DEFAULTS.handL, handR: DEFAULTS.handR, legL: [0, 0, 0], legR: [0, 0, 0] }
    ]
  },

  // 过顶劈棍: staff swung up one-handed, caught by the left hand on the way down, slammed into the ground.
  fengbuhai: {
    title: '崩山棍', hit: { range: 4.6, arc: 2, damage: 26, knock: 5, pierce: true }, strike: .5, duration: 1.3, cancelAt: .92,
    sound: { from: 240, to: 60, duration: .3, gain: .24 },
    rest: POLE_REST,
    trails: [{ hand: 'R', from: .36, to: .52, base: .78, tip: 1.1, life: .11, color: '#e8760c' }],
    rings: [
      { t: .5, life: .46, at: { hand: 'R', dist: 1.1, ground: true }, axis: 'ground', radius: [.08, .95], color: '#d99a4a' },
      { t: .54, life: .4, at: { hand: 'R', dist: 1.1, ground: true }, axis: 'ground', radius: [.05, .58], color: '#ffc267' }
    ],
    keys: [
      { t: 0 },
      { t: .12, torso: [.14, .1, 0], root: [0, 0], legL: [-.05, .02, .16], legR: [.05, .02, .16], skirt: [0, 1.15], handR: [-.25, -.03, .2], handL: [.26, -.03, .1] },
      { t: .34, torso: [-.22, -.4, 0], head: [.12, .3, 0], root: [.07, -.02], legL: [-.14, .03, .2], legR: [.12, .03, .1], skirt: [-.02, 1.28], handR: [-.34, .39, .06], dirR: [-.14, .85, -.5], edgeR: [1, 0, 0], handL: [.3, .2, .18], hair: [-.04, 0] },
      { t: .44, torso: [.06, -.14, 0], head: [-.06, .1, 0], root: [.06, .06], handR: [-.27, .4, .25], dirR: [-.05, .8, .6], slide: [.12], handL: [.08, .26, .28], lw: [.2], lg: [-.13] },
      { t: .5, torso: [.36, .08, 0], head: [-.32, 0, 0], root: [0, .15], legL: [-.2, .03, .08], legR: [.2, .02, .14], skirt: [-.03, 1.42], handR: [-.1, .13, .31], dirR: [.02, -.44, .9], slide: [.32], handL: [.06, .24, .2], lw: [1], hair: [.2, 0] },
      { t: .64, torso: [.31, .06, 0], head: [-.26, 0, 0], root: [.0, .15], handR: [-.1, .16, .31], dirR: [.02, -.36, .93], slide: [.3], hair: [.04, 0] },
      { t: .84, torso: [.08, 0, 0], head: [-.04, 0, 0], root: [0, .05], legL: [-.08, .03, .08], legR: [.08, .03, .1], skirt: [0, 1.08], handR: [-.24, .1, .24], dirR: [-.02, .7, .71], slide: [.08], handL: [.2, .08, .16], lw: [0] },
      { t: 1.12, torso: [0, 0, 0], head: [0, 0, 0], root: [0, 0], legL: [0, 0, 0], legR: [0, 0, 0], skirt: [0, 1], handR: POLE_REST.handR, dirR: [0, 1, 0], slide: [0], handL: DEFAULTS.handL, hair: [0, 0] },
      { t: 1.3 }
    ]
  },

  // 双刀交斩: reaches over the shoulders, draws both knives from the back, hops, cuts right then left into
  // an X, then slides them home. KNIFE_SHEATHED is where the sheaths in lead-characters.js sit.
  yunniang: {
    title: '流萤交剪', hit: { range: 3.6, arc: 2.4, damage: 15, knock: 1, pierce: true }, strike: .5, duration: 1.55, cancelAt: 1.02,
    sound: { from: 2400, to: 700, duration: .2, gain: .1 },
    second: { t: .64, from: 2800, to: 800, duration: .18, gain: .08 },
    drawn: { R: [.2, 1.26], L: [.2, 1.26] },
    trails: [
      { hand: 'R', from: .4, to: .54, base: .06, tip: .38, life: .24, color: '#f59e0b' },
      { hand: 'L', from: .54, to: .68, base: .06, tip: .38, life: .24, color: '#ef6c00' }
    ],
    keys: [
      { t: 0 },
      { t: .1, torso: [.03, 0, 0], handR: [-.31, .2, -.02], handL: [.31, .2, -.02], legL: [-.03, .02, .08], legR: [.03, .02, .08], skirt: [0, 1.1] },
      { t: .2, torso: [.08, 0, 0], head: [.04, 0, 0], ...KNIFE_SHEATHED, legL: [-.06, .03, .16], legR: [.06, .03, .16], skirt: [0, 1.2] },
      { t: .28, torso: [.02, .12, 0], head: [.04, -.1, 0], ...KNIFE_LEAVING },
      { t: .34, torso: [-.03, .3, 0], head: [.04, -.24, 0], root: [.02, .01], ...KNIFE_FLIP },
      { t: .4, torso: [-.04, .42, 0], head: [.04, -.34, 0], root: [.04, .03], handR: [.07, .34, .24], handL: [.3, .08, -.04], dirR: [.42, .85, .32], edgeR: [-.8, .35, 0], dirL: [.7, -.5, -.2], edgeL: [.5, .7, 0], legL: [-.1, .03, .22], legR: [.1, .03, .06], skirt: [0, 1.3], hair: [.03, .02] },
      { t: .5, torso: [.12, -.1, 0], head: [-.02, .08, 0], root: [.13, .09], handR: [-.22, .05, .26], dirR: [-.62, -.6, .5], edgeR: [-.55, .6, .2], legL: [-.17, .03, .24], legR: [.14, .03, .2], skirt: [0, 1.42], hair: [.16, -.04] },
      { t: .54, torso: [.1, -.36, 0], head: [0, .28, 0], root: [.15, .1], handR: [-.3, 0, .15], dirR: [-.72, -.62, .3], edgeR: [-.45, .7, .2], handL: [-.07, .34, .24], dirL: [-.42, .85, .32], edgeL: [.8, .35, 0], hair: [.16, .03] },
      { t: .64, torso: [.15, .2, 0], head: [-.02, -.16, 0], root: [.1, .13], handL: [.22, .05, .26], dirL: [.62, -.6, .5], edgeL: [.55, .6, .2], handR: [-.3, .08, -.02], dirR: [-.6, -.3, -.5], hair: [.18, -.03], legL: [-.15, .03, .14], legR: [.16, .03, .16] },
      { t: .7, torso: [.17, .25, 0], head: [-.04, -.2, 0], root: [.0, .14], handL: [.3, 0, .15], dirL: [.72, -.62, .3], edgeL: [.45, .7, .2], legL: [-.18, .03, .08], legR: [.18, .03, .12], skirt: [-.02, 1.4], hair: [.08, 0] },
      { t: .92, torso: [.06, .08, 0], head: [-.02, -.06, 0], root: [0, .06], handR: [-.3, .06, .12], dirR: [-.3, .35, .88], edgeR: [-.8, .3, 0], handL: [.3, .06, .12], dirL: [.3, .35, .88], edgeL: [.8, .3, 0], legL: [-.08, .03, .08], legR: [.08, .03, .08], skirt: [0, 1.08], hair: [0, 0] },
      { t: 1.08, torso: [.02, 0, 0], head: [0, 0, 0], root: [0, 0], ...KNIFE_FLIP, legL: [-.04, .02, .08], legR: [.04, .02, .08], skirt: [0, 1.04] },
      { t: 1.17, torso: [.05, 0, 0], ...KNIFE_LEAVING },
      { t: 1.26, torso: [.07, 0, 0], head: [.03, 0, 0], ...KNIFE_SHEATHED, legL: [-.05, .03, .12], legR: [.05, .03, .12], skirt: [0, 1.1] },
      { t: 1.38, torso: [.03, 0, 0], head: [0, 0, 0], handR: [-.31, .2, -.02], handL: [.31, .2, -.02], legL: [-.02, .02, .05], legR: [.02, .02, .05], skirt: [0, 1.03] },
      { t: 1.55, torso: [0, 0, 0], handR: DEFAULTS.handR, handL: DEFAULTS.handL, legL: [0, 0, 0], legR: [0, 0, 0], skirt: [0, 1] }
    ]
  },

  // 机关连弩: lifts the case to the chest, the doors slide apart and two fans of needles fly out.
  xiejingtang: {
    title: '匣中飞针', hit: { range: 18, arc: .5, damage: 12, pierce: true }, strike: .62, duration: 1.4, cancelAt: 1.02,
    sound: { from: 3200, to: 900, duration: .1, gain: .1 },
    second: { t: .78, from: 3600, to: 1000, duration: .1, gain: .08 },
    rest: { handR: [-.3, -.056, .01], dirR: [.1, 1, 0], edgeR: [1, 0, 0] },
    weaponOffset: [0, -.135, .012],
    grip: [.135, -.135, .03],
    volleys: [
      { t: .62, count: 5, spread: .26, speed: 22, life: .3, color: '#14c8b8', from: { hand: 'R', y: -.135, z: .07 } },
      { t: .78, count: 5, spread: .34, speed: 22, life: .3, color: '#14c8b8', from: { hand: 'R', y: -.135, z: .07 } }
    ],
    rings: [
      { t: .62, life: .2, at: { hand: 'R', y: -.135, z: .09 }, axis: 'forward', radius: [.05, .26], travel: .22, color: '#14c8b8' },
      { t: .78, life: .2, at: { hand: 'R', y: -.135, z: .09 }, axis: 'forward', radius: [.05, .26], travel: .22, color: '#14c8b8' }
    ],
    keys: [
      { t: 0 },
      { t: .3, torso: [.05, .08, 0], head: [.02, -.06, 0], handR: [-.07, .34, .29], dirR: [0, 1, 0], edgeR: [1, 0, 0], handL: [.2, .08, .24], lw: [0], legL: [-.1, .04, .1], legR: [.12, .04, .16], skirt: [0, 1.1] },
      { t: .4, handL: [.2, .16, .3], lw: [1], torso: [.08, .06, 0] },
      { t: .56, handR: [-.07, .35, .31], torso: [.1, .05, 0], open: [1], legL: [-.14, .04, .08], legR: [.16, .04, .14], skirt: [0, 1.3] },
      { t: .62, handR: [-.07, .35, .31], torso: [.1, .05, 0], head: [.02, -.04, 0], open: [1] },
      { t: .68, torso: [-.08, .05, 0], handR: [-.07, .36, .25], root: [0, -.06], hair: [.04, 0] },
      { t: .78, torso: [.1, .03, 0], handR: [-.07, .35, .31], root: [0, -.03], hair: [0, 0] },
      { t: .84, torso: [-.1, .03, 0], handR: [-.07, .37, .24], root: [0, -.08], hair: [.05, 0] },
      { t: 1, torso: [.02, .02, 0], handR: [-.08, .33, .29], root: [0, -.03], open: [0], hair: [0, 0] },
      { t: 1.12, lw: [0], handL: [.24, .08, .18], handR: [-.12, .25, .22], torso: [.0, 0, 0], head: [0, 0, 0] },
      { t: 1.32, root: [0, 0], legL: [0, 0, 0], legR: [0, 0, 0], skirt: [0, 1], handR: [-.3, -.056, .01], dirR: [.1, 1, 0], handL: DEFAULTS.handL },
      { t: 1.4 }
    ]
  },

  // 天外符印 (inferred; she never fights in the show): gathers both palms at the chest, then opens
  // rings of the mirage's cyan light outward. She is a child, so the stance stays small and planted.
  tongtong: {
    title: '天外符印', hit: { range: 6.5, arc: 1.7, damage: 17, knock: 6, pierce: true }, strike: .46, duration: 1.3, cancelAt: .9,
    sound: { from: 1300, to: 340, duration: .4, gain: .09 },
    glows: [
      { hand: 'R', from: .2, to: .62, radius: .075, color: '#4deeea' },
      { hand: 'L', from: .2, to: .62, radius: .075, color: '#4deeea' }
    ],
    rings: [
      { t: .46, life: .38, at: { hand: 'R' }, axis: 'forward', radius: [.08, .5], travel: .5, color: '#4deeea' },
      { t: .52, life: .4, at: { hand: 'R' }, axis: 'forward', radius: [.1, .72], travel: .95, color: '#7ff4e8' },
      { t: .58, life: .42, at: { hand: 'R' }, axis: 'forward', radius: [.12, .92], travel: 1.4, color: '#e6c264' }
    ],
    keys: [
      { t: 0 },
      { t: .26, torso: [-.05, 0, 0], head: [.05, 0, 0], handR: [-.075, .19, .23], handL: [.075, .19, .23], legL: [-.04, .03, .08], legR: [.04, .03, .08], skirt: [0, 1.08] },
      { t: .4, torso: [-.03, 0, 0], head: [.02, 0, 0], root: [.015, 0], handR: [-.07, .23, .26], handL: [.07, .23, .26], hair: [.02, 0] },
      { t: .46, torso: [.1, 0, 0], head: [-.08, 0, 0], root: [.03, .05], handR: [-.135, .27, .33], handL: [.135, .27, .33], legL: [-.1, .03, .05], legR: [.1, .03, .07], skirt: [-.02, 1.14], hair: [.09, 0] },
      { t: .7, torso: [.08, 0, 0], head: [-.06, 0, 0], root: [.02, .05], handR: [-.135, .26, .32], handL: [.135, .26, .32], hair: [.04, 0] },
      { t: 1.08, torso: [0, 0, 0], head: [0, 0, 0], root: [0, 0], legL: [0, 0, 0], legR: [0, 0, 0], skirt: [0, 1], handR: DEFAULTS.handR, handL: DEFAULTS.handL, hair: [0, 0] },
      { t: 1.3 }
    ]
  },

  // 曾信 never shows a real weapon. A quick pebble throw (inferred): light on his feet and not very practised.
  zengxin: {
    title: '弹石', hit: { range: 15, arc: .22, damage: 11, knock: 1 }, strike: .3, duration: .95, cancelAt: .6,
    sound: { from: 1500, to: 700, duration: .09, gain: .08 },
    volleys: [{ t: .3, count: 3, spread: .1, speed: 20, life: .34, color: '#b9b2a2', from: { hand: 'R' } }],
    keys: [
      { t: 0 },
      { t: .18, torso: [-.04, -.55, 0], head: [.02, .42, 0], root: [.01, -.02], handR: [-.3, .2, -.1], handL: [.2, .16, .24], legL: [-.08, .03, .08], legR: [.1, .03, .14], skirt: [0, 1.14], hair: [.03, 0] },
      { t: .3, torso: [.12, .42, 0], head: [-.06, -.36, 0], root: [.05, .08], handR: [-.13, .3, .35], handL: [.24, .03, -.04], legL: [-.14, .03, .05], legR: [.14, .03, .08], skirt: [-.02, 1.2], hair: [.12, 0] },
      { t: .46, torso: [.1, .36, 0], head: [-.05, -.3, 0], root: [.02, .08], handR: [-.15, .26, .32], hair: [.05, 0] },
      { t: .8, torso: [0, 0, 0], head: [0, 0, 0], root: [0, 0], legL: [0, 0, 0], legR: [0, 0, 0], skirt: [0, 1], handR: DEFAULTS.handR, handL: DEFAULTS.handL, hair: [0, 0] },
      { t: .95 }
    ]
  },

  // 荆南王: one heavy diagonal cut with the saber (EP24 16:40), planted and unhurried; the cold trail is inferred.
  jingnan: {
    title: '断岳', hit: { range: 4.2, arc: 2.2, damage: 32, knock: 4, pierce: true }, strike: .46, duration: 1.3, cancelAt: .92,
    sound: { from: 1200, to: 200, duration: .34, gain: .13 },
    rest: { handR: [-.25, -.05, .06], dirR: [-.1, -.58, .8], edgeR: [.99, 0, .1] },
    trails: [{ hand: 'R', from: .34, to: .6, base: .14, tip: .76, life: .22, color: '#6fb4ff' }],
    rings: [{ t: .5, life: .3, at: { hand: 'R' }, axis: 'forward', radius: [.08, .5], travel: .7, color: '#6fb4ff' }],
    keys: [
      { t: 0 },
      { t: .24, torso: [.0, -.62, 0], head: [-.02, .5, 0], handR: [-.23, .36, .02], dirR: [-.42, .8, -.42], edgeR: [-.9, -.42, 0], handL: [.2, .13, .2], legL: [-.12, .04, .12], legR: [.12, .04, .2], skirt: [0, 1.25] },
      { t: .36, torso: [.03, -.68, 0], head: [-.02, .55, 0], root: [.02, 0], handR: [-.22, .38, .04], dirR: [-.3, .86, -.42], edgeR: [-.95, -.3, 0], hair: [.03, 0] },
      { t: .46, torso: [.2, .3, 0], head: [-.12, -.25, 0], root: [.04, .13], handR: [-.12, .2, .28], dirR: [.42, .14, .9], edgeR: [.25, -.96, -.1], handL: [.24, .05, -.02], legL: [-.2, .04, .08], legR: [.2, .04, .12], skirt: [-.03, 1.36], hair: [.18, 0] },
      { t: .56, torso: [.24, .62, 0], head: [-.14, -.5, 0], root: [.02, .17], handR: [-.03, .08, .24], dirR: [.84, -.42, .34], edgeR: [-.42, -.9, 0], hair: [.1, 0] },
      { t: .76, torso: [.2, .56, 0], head: [-.1, -.46, 0], handR: [-.04, .08, .23], dirR: [.84, -.48, .24], edgeR: [-.48, -.87, 0], hair: [.03, 0] },
      { t: 1.14, torso: [0, 0, 0], head: [0, 0, 0], root: [0, 0], legL: [0, 0, 0], legR: [0, 0, 0], skirt: [0, 1], handR: [-.25, -.05, .06], dirR: [-.1, -.58, .8], edgeR: [.99, 0, .1], handL: DEFAULTS.handL, hair: [0, 0] },
      { t: 1.3 }
    ]
  },

  // 横扫千军: the long blade winds up behind her and sweeps a full half circle at chest height.
  linhan: {
    title: '寒月横扫', hit: { range: 4.8, arc: 3.4, damage: 28, knock: 4, pierce: true }, strike: .38, duration: 1.3, cancelAt: .9,
    sound: { from: 1500, to: 240, duration: .36, gain: .13 },
    rest: POLE_REST,
    trails: [{ hand: 'R', from: .27, to: .56, base: .78, tip: 1.2, life: .22, color: '#39a7ff' }],
    keys: [
      { t: 0, lg: [.3] },
      { t: .1, torso: [.04, -.2, 0], head: [0, .14, 0], handR: [-.2, .06, .2], dirR: [-.1, .96, -.25], handL: [.12, .1, .22], legL: [-.05, .03, .08], legR: [.05, .03, .12], skirt: [0, 1.2] },
      { t: .25, torso: [.05, -.9, 0], head: [-.02, .72, 0], root: [0, -.03], handR: [.06, .16, .22], dirR: [-.64, .16, -.76], edgeR: [-.76, 0, .64], handL: [-.13, .22, .05], lw: [1], legL: [-.15, .03, .12], legR: [.14, .03, .18], skirt: [0, 1.36], hair: [-.03, .04] },
      { t: .33, torso: [.07, -.5, 0], head: [-.04, .4, 0], root: [0, .02], handR: [.02, .17, .24], dirR: [-.96, .06, -.26], edgeR: [-.26, 0, .96], lg: [.05], slide: [.2], hair: [.05, .03] },
      { t: .39, torso: [.1, .02, 0], head: [-.06, 0, 0], root: [0, .09], handR: [.0, .17, .25], dirR: [-.8, .02, .6], edgeR: [.6, 0, .8], lg: [-.1], slide: [.32], legL: [-.2, .03, .06], legR: [.18, .03, .12], skirt: [-.03, 1.44], hair: [.16, 0] },
      { t: .45, torso: [.12, .55, 0], head: [-.08, -.42, 0], root: [0, .13], handR: [.0, .17, .25], dirR: [-.2, 0, .98], edgeR: [.98, 0, .2], lg: [-.12], slide: [.36], hair: [.24, -.05] },
      { t: .52, torso: [.12, .95, 0], head: [-.08, -.76, 0], root: [0, .15], handR: [.03, .17, .25], dirR: [.4, .02, .92], edgeR: [.92, 0, -.4], legL: [-.19, .04, .06], legR: [.2, .04, .14], hair: [.2, -.08] },
      { t: .6, torso: [.1, 1.08, 0], head: [-.06, -.86, 0], handR: [.05, .18, .24], dirR: [.6, .1, .79], edgeR: [.79, 0, -.6], hair: [.1, -.05] },
      { t: .78, torso: [.06, .7, 0], head: [-.03, -.56, 0], root: [0, .08], handR: [-.02, .17, .22], dirR: [.45, .55, .7], edgeR: [.84, 0, -.54], lg: [-.1], slide: [.14], legL: [-.08, .03, .05], legR: [.09, .03, .08], skirt: [0, 1.2], hair: [0, 0] },
      { t: 1.12, torso: [0, 0, 0], head: [0, 0, 0], root: [0, 0], legL: [0, 0, 0], legR: [0, 0, 0], skirt: [0, 1], handR: POLE_REST.handR, dirR: [0, 1, 0], edgeR: [1, 0, 0], handL: DEFAULTS.handL, lw: [0], slide: [0] },
      { t: 1.3 }
    ]
  },

  // 顾廷美：长剑平刺接回撩（EP11 01:00–03:30），轻快、带一道淡紫剑光。
  gutingmei: {
    title: '紫绶回风剑', hit: { range: 4, arc: 1.5, damage: 22, knock: 3 }, strike: .34, duration: 1, cancelAt: .7,
    sound: { from: 1600, to: 420, duration: .24, gain: .1 },
    rings: [
      { t: .34, life: .3, at: { hand: 'R' }, axis: 'forward', radius: [.05, .5], travel: .8, color: '#c9b2ea' }
    ],
    keys: [
      { t: 0 },
      { t: .16, torso: [-.04, -.4, 0], head: [.02, .3, 0], handR: [-.28, .2, -.06], handL: [.2, .16, .2], legL: [-.08, .03, .08], legR: [.1, .03, .12], skirt: [0, 1.1] },
      { t: .34, torso: [.1, .32, 0], head: [-.05, -.26, 0], root: [.05, .1], handR: [-.13, .3, .35], handL: [.24, .05, -.06], legL: [-.14, .03, .05], legR: [.14, .03, .08], skirt: [-.02, 1.18], hair: [.1, 0] },
      { t: .52, torso: [.06, .2, 0], head: [-.03, -.16, 0], root: [.02, .06], handR: [-.16, .34, .3], hair: [.05, 0] },
      { t: .85, torso: [0, 0, 0], head: [0, 0, 0], root: [0, 0], legL: [0, 0, 0], legR: [0, 0, 0], skirt: [0, 1], handR: DEFAULTS.handR, handL: DEFAULTS.handL, hair: [0, 0] },
      { t: 1 }
    ]
  },

  // 东子（清风楼门口伙计）：拂尘迎客掌，双掌向前轻推送风，干净利落。
  dongzi: {
    title: '迎客拂尘掌', hit: { range: 3.4, arc: 1.6, damage: 12, knock: 3 }, strike: .38, duration: 1.05, cancelAt: .72,
    sound: { from: 980, to: 320, duration: .22, gain: .08 },
    rings: [
      { t: .38, life: .28, at: { hand: 'R' }, axis: 'forward', radius: [.06, .38], travel: .45, color: '#e6dcc8' }
    ],
    keys: [
      { t: 0 },
      { t: .2, torso: [-.04, -.22, 0], head: [.03, .16, 0], handR: [-.14, .22, .18], handL: [.12, .2, .22], legL: [-.06, .03, .08], legR: [.06, .03, .1], skirt: [0, 1.08] },
      { t: .38, torso: [.12, .18, 0], head: [-.06, -.12, 0], root: [.03, .06], handR: [-.1, .26, .34], handL: [.12, .24, .3], legL: [-.12, .03, .06], legR: [.12, .03, .08], skirt: [-.02, 1.16], hair: [.06, 0] },
      { t: .58, torso: [.08, .12, 0], head: [-.04, -.08, 0], root: [.02, .04], handR: [-.12, .24, .3], handL: [.12, .22, .26], hair: [.03, 0] },
      { t: .9, torso: [0, 0, 0], head: [0, 0, 0], root: [0, 0], legL: [0, 0, 0], legR: [0, 0, 0], skirt: [0, 1], handR: DEFAULTS.handR, handL: DEFAULTS.handL, hair: [0, 0] },
      { t: 1.05 }
    ]
  },

  // 包哥：拧腰蓄力、踏步出一记直拳，金色拳劲层层推开。lethal：前方扇形里的人一拳全倒，Boss 也不例外。
  baoge: {
    title: '一拳定音', hit: { range: 6, arc: 1.4, damage: 999, knock: 12, pierce: true, lethal: true }, strike: .42, duration: 1.2, cancelAt: .82,
    sound: { from: 620, to: 60, duration: .42, gain: .14 },
    glows: [{ hand: 'R', from: .2, to: .6, radius: .12, color: '#ffb52e' }],
    rings: [
      { t: .42, life: .3, at: { hand: 'R' }, axis: 'forward', radius: [.06, .5], travel: .6, color: '#ffd36a' },
      { t: .45, life: .36, at: { hand: 'R' }, axis: 'forward', radius: [.1, .8], travel: 1.2, color: '#ffb52e' },
      { t: .48, life: .42, at: { hand: 'R' }, axis: 'forward', radius: [.14, 1.1], travel: 1.9, color: '#ff8a1e' }
    ],
    keys: [
      { t: 0 },
      { t: .24, torso: [-.06, -.8, 0], head: [.03, .66, 0], root: [0, -.03], legL: [-.12, .04, .2], legR: [.14, .03, .26], skirt: [0, 1.3], handR: [-.24, .08, -.16], handL: [.14, .3, .3], hair: [.04, 0] },
      { t: .36, torso: [.08, .1, 0], head: [-.04, 0, 0], root: [0, .09], legL: [-.18, .04, .1], legR: [.18, .03, .14], skirt: [-.02, 1.36], handR: [-.2, .22, .2], handL: [.24, .18, .12], hair: [.12, 0] },
      { t: .42, torso: [.22, .64, 0], head: [-.13, -.55, 0], root: [0, .19], legL: [-.22, .04, .06], legR: [.22, .03, .12], skirt: [-.03, 1.42], handR: [-.232, .28, .335], handL: [.25, .05, -.12], hair: [.28, 0] },
      { t: .66, torso: [.18, .58, 0], head: [-.09, -.5, 0], root: [0, .19], handR: [-.226, .27, .32], handL: [.25, .04, -.1], hair: [.14, 0] },
      { t: 1.02, torso: [0, 0, 0], head: [0, 0, 0], root: [0, 0], legL: [0, 0, 0], legR: [0, 0, 0], skirt: [0, 1], handR: DEFAULTS.handR, handL: DEFAULTS.handL, hair: [0, 0] },
      { t: 1.2 }
    ]
  }
};

// Monotone cubic through the keys: strikes can be sharp without any track overshooting its keys.
function compile(spec) {
  let previous = { ...DEFAULTS, ...spec.rest };
  const times = spec.keys.map(k => k.t);
  const values = spec.keys.map(k => { previous = { ...previous, ...k }; return previous; });
  const tangents = values.map((_, k) => {
    const out = {};
    for (const name of TRACKS) out[name] = values[k][name].map((v, c) => {
      if (k === 0 || k === values.length - 1) return 0;
      const a = (v - values[k - 1][name][c]) / (times[k] - times[k - 1]);
      const b = (values[k + 1][name][c] - v) / (times[k + 1] - times[k]);
      return a * b <= 0 ? 0 : 2 * a * b / (a + b);
    });
    return out;
  });
  // The gallery repeats the attack; a short pause between repeats lets it read as separate strikes.
  return { ...spec, times, values, tangents, cycle: spec.duration + .55 };
}

export const ATTACKS = Object.fromEntries(Object.entries(SPECS).map(([id, spec]) => [id, compile(spec)]));

export function newAttackSample() {
  return Object.fromEntries(TRACKS.map(name => [name, DEFAULTS[name].slice()]));
}

/** Writes the pose at time t into out (from newAttackSample); nothing allocates, so it can run every frame. */
export function sampleAttack(clip, t, out) {
  const { times, values, tangents } = clip;
  const last = times.length - 1;
  const at = Math.min(Math.max(t, 0), times[last]);
  let k = 0;
  while (k < last - 1 && at >= times[k + 1]) k++;
  const h = times[k + 1] - times[k], u = (at - times[k]) / h, u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = (u3 - 2 * u2 + u) * h, h01 = 3 * u2 - 2 * u3, h11 = (u3 - u2) * h;
  for (const name of TRACKS) {
    const a = values[k][name], b = values[k + 1][name], ta = tangents[k][name], tb = tangents[k + 1][name], o = out[name];
    for (let c = 0; c < o.length; c++) o[c] = h00 * a[c] + h10 * ta[c] + h01 * b[c] + h11 * tb[c];
  }
  return out;
}
