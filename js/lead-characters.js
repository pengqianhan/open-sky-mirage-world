import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { getLead } from './lead-config.js';
import { fabricMaterial, faceMaterial, hairCapMaterial, hairFlowMaterial, skinMaterial, softMaterial } from './lead-materials.js';
import { ATTACKS, newAttackSample, sampleAttack } from './lead-attacks.js';
import { createAttackFx, fxMaterial } from './lead-attack-fx.js';

const TAU = Math.PI * 2;
const { lerp, clamp } = THREE.MathUtils;

// Chibi proportions, about three heads tall. All numbers below are in character units;
// the whole rig is scaled by WORLD_SCALE so the leads still read well beside buildings and horses.
const WORLD_SCALE = 1.12;
const HIPS_Y = .5, NECK_Y = .365, HEAD_HEIGHT = .54, HEAD_MID = HEAD_HEIGHT / 2;
const SHOULDER_Y = .27;
const HEAD_SCALE = .9;
const FACE_Y = HIPS_Y + NECK_Y + .21 * HEAD_SCALE;
const GAIT = { walkSwing: .2, walkLift: .62, runSwing: .22, runLift: .65 };
const CHAIN_HANG = 1.92; // rope hub above the feet when hanging from the pulley
const UPPER_ARM = .15, FOREARM = .207; // shoulder to elbow, elbow to the centre of the palm
const THIGH = .24, SHIN = .26; // hip to knee, knee to the bottom of the sole
const TOE = .136, HEEL = .076; // sole reach in front of and behind the shin

// Scratch objects for the per-frame attack solve.
const ikDir = new THREE.Vector3(), ikElbow = new THREE.Vector3(), ikPole = new THREE.Vector3(), ikChain = new THREE.Vector3(), ikCross = new THREE.Vector3();
const ikSwing = new THREE.Quaternion(), ikFull = new THREE.Quaternion();
const axisX = new THREE.Vector3(), axisY = new THREE.Vector3(), axisZ = new THREE.Vector3(), basis = new THREE.Matrix4();
const localA = new THREE.Vector3(), localB = new THREE.Vector3(), torsoEuler = new THREE.Euler(), UP = new THREE.Vector3(0, 1, 0);

/** Orthonormal weapon frame: Y along dir, X toward edge. */
function weaponAxes(dir, edge) {
  axisY.fromArray(dir).normalize();
  axisX.fromArray(edge);
  axisX.addScaledVector(axisY, -axisX.dot(axisY));
  if (axisX.lengthSq() < 1e-6) axisX.set(1, 0, 0).addScaledVector(axisY, -axisY.x);
  axisX.normalize();
  axisZ.crossVectors(axisX, axisY);
}

/** Hip height that keeps the lower of the two soles on the ground, whatever the legs are doing. */
function legReach(thighSwing, thighOut, kneeBend) {
  const shin = thighSwing + kneeBend;
  const foot = shin > 0 ? TOE * Math.sin(shin) : HEEL * Math.sin(-shin);
  return (THIGH * Math.cos(thighSwing) + SHIN * Math.cos(shin) + foot) * Math.cos(thighOut);
}

/** Catmull-Rom resampling, so a few hand-picked rings give a perfectly smooth silhouette. */
function smoothRings(rings, perSpan = 4) {
  if (rings.length < 3) return rings;
  const out = [];
  for (let k = 0; k < rings.length - 1; k++) {
    const p0 = rings[Math.max(k - 1, 0)], p1 = rings[k], p2 = rings[k + 1], p3 = rings[Math.min(k + 2, rings.length - 1)];
    for (let s = 0; s < perSpan; s++) {
      const t = s / perSpan;
      out.push(p1.map((_, c) => {
        const a = p0[c] ?? 0, b = p1[c] ?? 0, d = p2[c] ?? 0, e = p3[c] ?? 0;
        return .5 * (2 * b + (d - a) * t + (2 * a - 5 * b + 4 * d - e) * t * t + (3 * b - a - 3 * d + e) * t * t * t);
      }));
    }
  }
  out.push(rings[rings.length - 1]);
  return out;
}

/**
 * Surface of revolution through rings of [y, radiusX, radiusZ, offsetZ?].
 * The seam sits at the back (start = PI) and its normals are welded, so no hard line ever shows.
 * uv().y runs along the given ring order; pleats add folds that deepen toward the last ring,
 * with shading baked into the vertex colours; jag makes a torn hem.
 */
function loft(rings, { segments = 40, start = Math.PI, arc = TAU, pleats = 0, pleatCount = 10, perSpan = 4, jag = 0, shade = .34 } = {}) {
  const dense = smoothRings(rings, perSpan), positions = [], colors = [], uvs = [], indices = [];
  const n = dense.length, full = Math.abs(arc - TAU) < 1e-4;
  for (let j = 0; j < n; j++) {
    const [y, rx, rz, z = 0] = dense[j], t = j / (n - 1);
    for (let i = 0; i <= segments; i++) {
      const a = start + arc * i / segments;
      const wave = Math.cos(a * pleatCount);
      const fold = 1 + pleats * Math.pow(t, 1.15) * wave;
      const tear = jag * t * t * (Math.sin(a * 13) * .6 + Math.sin(a * 29 + 1.3) * .4);
      positions.push(Math.sin(a) * rx * fold, y + tear, Math.cos(a) * rz * fold + z);
      const ao = pleats ? 1 - shade * Math.pow(t, 1.1) * (.5 - .5 * wave) : 1;
      colors.push(ao, ao, ao);
      uvs.push(i / segments, t);
    }
  }
  const outward = dense[0][0] > dense[n - 1][0]; // rings listed downward wind outward
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < segments; i++) {
    const a = j * (segments + 1) + i, b = a + segments + 1;
    if (outward) indices.push(a, b, a + 1, b, b + 1, a + 1);
    else indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  if (full) {
    const normal = geo.attributes.normal;
    for (let j = 0; j < n; j++) {
      const a = j * (segments + 1), b = a + segments;
      const nx = normal.getX(a) + normal.getX(b), ny = normal.getY(a) + normal.getY(b), nz = normal.getZ(a) + normal.getZ(b);
      const len = Math.hypot(nx, ny, nz) || 1;
      normal.setXYZ(a, nx / len, ny / len, nz / len);
      normal.setXYZ(b, nx / len, ny / len, nz / len);
    }
  }
  return geo;
}

/**
 * Flat ribbon-like tube: the cross section is wide along the surface and thin along `outFrom`.
 * Tapered, it is a hair lock with a pointed tip; untapered, it is a strap or collar.
 */
function ribbon(points, { width = .03, thick = .012, outFrom = [0, HEAD_MID, 0], taper = true, rootWidth = .55, steps = 16, sides = 10, rootShade = .68, tipStart = .62, tipPower = .5 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const center = new THREE.Vector3(...outFrom), positions = [], colors = [], uvs = [], indices = [];
  const T = new THREE.Vector3(), R = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3(), P = new THREE.Vector3();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    curve.getPointAt(t, P); curve.getTangentAt(t, T);
    R.copy(P).sub(center).normalize();
    B.crossVectors(T, R).normalize(); N.crossVectors(B, T).normalize();
    let w = width, h = thick;
    if (taper) {
      const grow = lerp(rootWidth, 1, Math.sin(Math.min(t / .4, 1) * Math.PI / 2));
      const tip = t > tipStart ? Math.pow(Math.max(1 - (t - tipStart) / (1 - tipStart), 0), tipPower) : 1;
      w = width * grow * tip; h = thick * grow * Math.max(tip, .25);
    }
    for (let j = 0; j <= sides; j++) {
      const a = TAU * j / sides, cs = Math.cos(a), sn = Math.sin(a);
      positions.push(P.x + B.x * cs * w + N.x * sn * h, P.y + B.y * cs * w + N.y * sn * h, P.z + B.z * cs * w + N.z * sn * h);
      const ao = lerp(rootShade, 1, Math.min(t / .22, 1)) * (.86 + .14 * Math.max(sn, 0));
      colors.push(ao, ao, ao);
      uvs.push(t, j / sides);
    }
  }
  for (let i = 0; i < steps; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// Eye shapes: size, tilt and brow together carry each lead's personality.
const EYES = {
  round:  { eyeRx: .052, eyeRy: .07, eyeTilt: .02, browTilt: .03, browBend: 3, browWeight: .0058, browY: .308, lashWidth: .0085 },
  gentle: { eyeRx: .052, eyeRy: .062, eyeTilt: -.03, browTilt: -.03, browBend: 2, browWeight: .0064, browY: .3, lashWidth: .0075 },
  calm:   { eyeRx: .054, eyeRy: .056, eyeTilt: .08, browTilt: .12, browBend: 2, browWeight: .0072, browY: .29, lashWidth: .0085 },
  bold:   { eyeRx: .05, eyeRy: .06, eyeTilt: .05, browTilt: .2, browBend: 0, browWeight: .0098, browY: .292, lashWidth: .0085 },
  still:  { eyeRx: .054, eyeRy: .064, eyeTilt: 0, browTilt: 0, browBend: 1, browWeight: .0054, browY: .31, lashWidth: .0075 },
  cold:   { eyeRx: .054, eyeRy: .056, eyeTilt: .16, browTilt: .3, browBend: 0, browWeight: .0085, browY: .285, lashWidth: .0095 },
  sharp:  { eyeRx: .056, eyeRy: .054, eyeTilt: .17, browTilt: .24, browBend: 1, browWeight: .0064, browY: .288, lashWidth: .0095 }
};
const NO_STANCE = { lean: 0, chin: 0, armOut: 0 };
const BOW_BACK = -.08, BOW_NOCK = .285; // string plane and tip height, measured from the bow's grip
const FACE_SHAPE = { slim: [1, .2], round: [1.05, .1], angular: [.99, .24], soft: [1.03, .12], long: [.97, .22], sharp: [.98, .3], child: [1.07, .06], youth: [1, .15] };

export function createLeadCharacter(id = 'caosheng') {
  const c = getLead(id), group = new THREE.Group();
  group.name = `lead-${c.id}`;
  group.scale.setScalar(c.height * WORLD_SCALE);
  const geometries = new Set(), materials = new Set(), parts = [], sway = [];
  const own = (m) => (materials.add(m), m);
  const named = (n) => `${c.id}-${n}`;
  const blink = uniform(1);

  // ---- Materials --------------------------------------------------------------------------
  const skin = own(skinMaterial(named('skin'), c.skin));
  const robe = own(fabricMaterial(named('robe'), c.robe));
  const skirtMat = own(fabricMaterial(named('skirt'), c.id === 'yunniang' ? c.over : c.robe, {
    deep: c.robeDeep,
    hem: { start: c.id === 'zengqian' ? .86 : .9, band: c.id === 'yunniang' ? '#eabf5e' : c.trim, thread: c.id === 'linhan' ? '#d7dcdc' : c.inner, repeat: 22 }
  }));
  const over = own(fabricMaterial(named('over'), c.over, { deep: .82, rim: .24, quilt: c.id === 'tongtong' ? .2 : c.id === 'jingnan' ? .42 : 0 }));
  const inner = own(fabricMaterial(named('inner'), c.inner, { deep: 1, weave: .012 }));
  const trim = own(fabricMaterial(named('trim'), c.trim, { weave: .012 }));
  const belt = own(softMaterial(named('belt'), c.belt, { roughness: .5, rim: .22 }));
  const boots = own(softMaterial(named('boots'), c.boots, { roughness: .48, rim: .24 }));
  const dark = own(softMaterial(named('sole'), '#2a2422', { roughness: .8, rim: .05 }));
  const coolMetal = ['linhan', 'xiejingtang', 'caosheng', 'zengxin', 'jingnan'].includes(c.id);
  const metal = own(softMaterial(named('metal'), coolMetal ? '#c9d0d2' : '#d9b56a', { roughness: .32, metalness: .55, rim: .5, rimTint: coolMetal ? '#eef6ff' : '#ffe9b0' }));
  const wood = own(softMaterial(named('wood'), '#6a4530', { roughness: .62, rim: .14 }));
  const ivory = own(softMaterial(named('ivory'), '#fff9ec', { roughness: .62, rim: .1 }));
  const hairCap = own(hairCapMaterial(named('hair-cap'), c.hairTint, c.hairDeep, c.hairLight));
  const hairFlow = own(hairFlowMaterial(named('hair-flow'), c.hairTint, c.hairDeep, c.hairLight));
  const hairOrb = own(softMaterial(named('hair-orb'), c.hairTint, { roughness: .5, rim: .22, rimTint: c.hairLight }));

  // ---- Builders ---------------------------------------------------------------------------
  const sphere = new THREE.SphereGeometry(1, 22, 16);
  const mesh = (parent, name, geo, material, pos = [0, 0, 0]) => {
    geometries.add(geo);
    const m = new THREE.Mesh(geo, material);
    m.name = name; m.position.fromArray(pos);
    m.castShadow = true; m.receiveShadow = true; m.userData.part = name;
    parent.add(m); parts.push(m);
    return m;
  };
  const joint = (parent, name, pos) => { const j = new THREE.Group(); j.name = name; j.position.fromArray(pos); parent.add(j); return j; };
  const orb = (p, n, pos, scale, m) => { const o = mesh(p, n, sphere, m, pos); o.scale.fromArray(scale); return o; };
  const lock = (p, n, points, opts, m = hairCap) => mesh(p, n, ribbon(points, opts), m);
  const strap = (p, n, points, width, thick, m, outFrom) => mesh(p, n, ribbon(points, { width, thick, outFrom, taper: false, rootShade: 1 }), m);
  const ring = (p, n, pos, radius, tube, m, sz = 1) => {
    const r = mesh(p, n, new THREE.TorusGeometry(radius, tube, 10, 40), m, pos);
    r.rotation.x = Math.PI / 2; r.scale.y = sz;
    return r;
  };

  // ---- Skeleton and body ------------------------------------------------------------------
  const motion = joint(group, 'motion', [0, 0, 0]);
  const hips = joint(motion, 'hips', [0, HIPS_Y, 0]);
  const torso = joint(hips, 'torso', [0, 0, 0]);
  const chestOut = [0, .12, 0];
  mesh(torso, 'tailored-tunic', loft([[.355, .03, .03], [.33, .08, .07], [.285, .142, .1], [.2, .158, .116], [.1, .15, .115], [0, .138, .108], [-.05, .138, .108]]), robe);
  mesh(torso, 'neck', loft([[.42, .05, .05], [.3, .058, .056]], { segments: 18 }), skin);

  const legs = [], arms = [];
  const tall = ['zengqian', 'linhan', 'caosheng', 'jingnan'].includes(c.id);
  for (const sign of [-1, 1]) {
    const side = sign > 0 ? 'left' : 'right';
    const thigh = joint(hips, `${side}-thigh`, [sign * .078, 0, 0]);
    mesh(thigh, `${side}-trousers`, loft([[.02, .068, .068], [-.12, .066, .068], [-.25, .055, .058]], { segments: 18 }), ['zengqian', 'jingnan'].includes(c.id) ? belt : inner);
    const knee = joint(thigh, `${side}-knee`, [0, -.24, 0]);
    // Boots: rounded bean shape, slightly turned up at the toe, on a soft sole.
    mesh(knee, `${side}-boot`, loft([[tall ? .05 : -.09, .059, .06], [-.1, .056, .058], [-.2, .056, .062]], { segments: 18 }), boots);
    orb(knee, `${side}-shoe`, [0, -.212, .03], [.067, .044, .102], boots);
    orb(knee, `${side}-sole`, [0, -.245, .03], [.071, .015, .106], dark);
    if (tall) {
      const cuff = mesh(knee, `${side}-boot-cuff`, loft([[.056, .062, .063], [.03, .063, .064]], { segments: 18 }), c.id === 'zengqian' ? trim : metal);
      cuff.scale.setScalar(1.01);
    } else {
      for (let k = 0; k < 2; k++) mesh(knee, `${side}-leg-wrap-${k}`, loft([[-.03 - k * .05, .061, .063], [-.052 - k * .05, .061, .063]], { segments: 18 }), trim);
    }
    legs.push({ sign, thigh, knee });

    const arm = joint(torso, `${side}-shoulder`, [sign * .158, SHOULDER_Y, 0]);
    orb(arm, `${side}-shoulder-round`, [0, -.006, 0], [.066, .064, .066], robe);
    const sleeve = c.id === 'xiejingtang' ? 'wide' : c.id === 'yunniang' ? 'bishop' : 'fitted';
    mesh(arm, `${side}-upper-sleeve`, loft([[.01, .063, .063], [-.08, .062, .062], [-.17, .059, .059]], { segments: 20 }), robe);
    const elbow = joint(arm, `${side}-elbow`, [0, -.15, 0]);
    if (sleeve === 'wide') {
      // Hanging kimono-style sleeve, deep toward the back.
      // Two-sided: an open tube, and a raised arm looks straight into it.
      const wideSleeve = own(fabricMaterial(named(`${side}-wide-sleeve`), c.robe)), wideCuff = own(fabricMaterial(named(`${side}-wide-cuff`), c.trim, { weave: .012 }));
      wideSleeve.side = wideCuff.side = THREE.DoubleSide;
      mesh(elbow, `${side}-lower-sleeve`, loft([[.03, .062, .066], [-.08, .074, .1, -.016], [-.17, .08, .13, -.036], [-.2, .082, .135, -.04]], { segments: 22 }), wideSleeve);
      mesh(elbow, `${side}-cuff`, loft([[-.17, .083, .133, -.036], [-.2, .085, .138, -.04]], { segments: 22, perSpan: 1 }), wideCuff);
    } else if (sleeve === 'bishop') {
      orb(elbow, `${side}-elbow-round`, [0, 0, 0], [.062, .062, .062], robe); // closes the sleeve when the arm folds hard
      mesh(elbow, `${side}-lower-sleeve`, loft([[.03, .06, .06], [-.06, .075, .075], [-.13, .072, .074], [-.16, .043, .044]], { segments: 22 }), robe);
      mesh(elbow, `${side}-cuff`, loft([[-.15, .046, .047], [-.178, .045, .046]], { segments: 18, perSpan: 1 }), trim);
    } else {
      mesh(elbow, `${side}-lower-sleeve`, loft([[.03, .058, .058], [-.08, .054, .054], [-.15, .047, .048]], { segments: 20 }), robe);
      const armour = ['zengqian', 'linhan', 'caosheng', 'jingnan'].includes(c.id);
      mesh(elbow, `${side}-cuff`, loft([[-.07, armour ? .06 : .052, armour ? .06 : .052], [-.175, armour ? .052 : .05, armour ? .053 : .051]], { segments: 20, perSpan: 1 }), armour ? belt : trim);
      if (armour) for (const y of [-.1, -.15]) mesh(elbow, `${side}-cuff-buckle-${y}`, loft([[y + .006, .061, .062], [y - .006, .059, .06]], { segments: 20, perSpan: 1 }), metal);
    }
    const hand = joint(elbow, `${side}-hand`, [0, -.195, 0]);
    orb(hand, `${side}-palm`, [0, -.012, .003], [.044, .05, .04], skin);
    const thumb = orb(hand, `${side}-thumb`, [-sign * .032, .004, .023], [.017, .027, .017], skin);
    thumb.rotation.z = -sign * .5;
    arms.push({ sign, arm, elbow, hand, thumb });
  }
  const [rightArm, leftArm] = arms;

  const knives = {};

  // ---- Garments ---------------------------------------------------------------------------
  // The skirt is one bell on a pivot so it can flare, swing and bunch up on horseback.
  const skirt = joint(hips, 'skirt', [0, .03, 0]);
  const L = c.hem;
  const bell = (r = 0) => [[0, .146 + r, .112 + r], [-L * .3, .172 + r, .136 + r], [-L * .68, .212 + r, .168 + r], [-L, .246 + r, .196 + r]];
  const SKIRT_PLEATS = .06;
  mesh(skirt, 'robe-bell', loft(bell(), { segments: 96, pleats: SKIRT_PLEATS, pleatCount: 12 }), skirtMat);
  // How far a skirt-local point sits inside the bell, as a fraction of its radius (negative = poking out).
  // Null above the waistband and below the hem, where the skirt covers nothing.
  const skirtClearance = (x, y, z) => {
    const rings = bell();
    if (y > -.05 || y < -L) return null;
    const k = rings.findIndex(r => r[0] <= y);
    const [y0, a0, b0] = rings[k - 1], [y1, a1, b1] = rings[k], t = (y - y0) / (y1 - y0);
    const fold = 1 - SKIRT_PLEATS * Math.pow(-y / L, 1.15);
    return 1 - Math.hypot(x / (lerp(a0, a1, t) * fold), z / (lerp(b0, b1, t) * fold));
  };

  // Layered cross collar: inner layer first, then the two overlapping bands.
  const collar = (colour, width = .019) => {
    strap(torso, 'inner-chest', [[0, .326, .064], [0, .26, .102], [0, .2, .116]], .04, .004, inner, chestOut);
    for (const sign of [1, -1]) {
      strap(torso, `collar-${sign}`, [[sign * .064, .338, .036], [sign * .058, .292, .094], [-sign * .012, .202, .127], [-sign * .076, .106, .124]], width, .006, colour, chestOut);
    }
  };

  // Waist belt helper, slightly proud of the torso.
  const waistBand = (name, top, bottom, material, r = .006) =>
    mesh(hips, name, loft([[top, .148 + r, .118 + r], [(top + bottom) / 2, .15 + r, .12 + r], [bottom, .148 + r, .118 + r]], { segments: 48, perSpan: 2 }), material);

  if (c.id === 'caosheng') {
    // Black sleeveless over-robe, open at the front, over the navy gown; cowl scarf.
    mesh(torso, 'vest-open', loft([[.312, .118, .09], [.2, .168, .126], [.1, .161, .126], [.0, .15, .12]], { segments: 48, start: .55, arc: TAU - 1.1 }), over);
    mesh(skirt, 'over-robe-tail', loft(bell(.014).map(([y, a, b]) => [y * .86, a, b]), { segments: 72, start: .72, arc: TAU - 1.44, pleats: .04, pleatCount: 9, shade: .26 }), over);
    for (let k = 0; k < 3; k++) {
      const scarf = ring(torso, `cowl-scarf-${k}`, [0, .325 - k * .026, .012 + k * .007], .058 + k * .014, .025 - k * .002, robe, 1.05);
      scarf.rotation.x = Math.PI / 2 - .26 - k * .05;
    }
    lock(torso, 'cowl-drape', [[.008, .275, .092], [.012, .225, .127], [-.004, .165, .13]], { width: .036, thick: .012, outFrom: chestOut, rootWidth: .9, rootShade: .8, tipStart: .7 }, robe);
    waistBand('waist-sash', .05, .004, belt);
    orb(hips, 'belt-buckle', [0, .027, .125], [.026, .02, .008], metal);
    strap(hips, 'pendant-cord', [[.082, .01, .106], [.09, -.07, .13], [.09, -.15, .165]], .0045, .004, metal, [0, 0, 0]);
    orb(hips, 'pendant-jade', [.09, -.165, .17], [.017, .023, .009], trim);
  } else if (c.id === 'zengqian') {
    collar(trim, .012);
    // Curved leather plate from the right shoulder down to the belt, with a guard on that shoulder.
    strap(torso, 'vest-leather', [[-.112, .318, .05], [-.112, .24, .104], [-.092, .14, .121], [-.082, .03, .118]], .05, .009, over, chestOut);
    const guard = mesh(rightArm.arm, 'right-shoulder-guard', loft([[.056, .012, .012], [.04, .058, .058], [-.015, .077, .077], [-.075, .074, .074]], { segments: 26 }), over);
    guard.scale.setScalar(1.02);
    strap(rightArm.arm, 'guard-edge', [[-.07, -.068, .036], [-.076, -.078, 0], [-.07, -.068, -.036]], .006, .004, trim, [0, -.04, 0]);
    for (let k = 0; k < 5; k++) {
      const a = -.72 + k * .36, stem = [-.104, .178, .133];
      lock(torso, `pale-leaf-${k}`, [stem, [stem[0] + Math.sin(a) * .018, stem[1] + Math.cos(a) * .018, stem[2]], [stem[0] + Math.sin(a) * (.04 - Math.abs(k - 2) * .005), stem[1] + Math.cos(a) * (.04 - Math.abs(k - 2) * .005), stem[2] - .002]], { width: .0078, thick: .0016, outFrom: chestOut, rootWidth: .35, rootShade: 1, tipStart: .4, tipPower: .8 }, ivory);
    }
    strap(torso, 'diagonal-chest-strap', [[-.13, .285, .075], [-.05, .2, .117], [.05, .1, .126], [.145, .015, .098]], .0105, .004, own(softMaterial(named('strap'), '#a5845a', { roughness: .6 })), chestOut);
    // Under-layer of the skirt and two belts.
    mesh(skirt, 'under-skirt', loft([[0, .14, .108], [-.2, .17, .14], [-.31, .182, .152]], { segments: 48 }), over);
    waistBand('waist-sash', .056, .01, skirtMat, .004);
    waistBand('leather-belt', .022, -.012, belt);
    ring(hips, 'belt-buckle', [0, .005, .128], .017, .0048, metal).rotation.x = 0;
    for (const sign of [-1, 1]) orb(hips, `belt-stud-${sign}`, [sign * .062, .005, .118], [.0065, .0065, .004], metal);
    const flower = joint(torso, 'chest-flower', [.092, .225, .104]);
    for (let k = 0; k < 5; k++) orb(flower, `chest-petal-${k}`, [Math.cos(k * TAU / 5) * .012, Math.sin(k * TAU / 5) * .012, 0], [.009, .009, .004], ivory);
    orb(flower, 'chest-flower-center', [0, 0, .004], [.005, .005, .003], metal);
  } else if (c.id === 'fengbuhai') {
    collar(inner, .016);
    // Ochre short jacket, rope sash and the torn brown apron.
    mesh(torso, 'vest-ochre', loft([[.31, .112, .088], [.2, .169, .127], [.09, .162, .127], [-.03, .155, .125]], { segments: 48, start: .36, arc: TAU - .72 }), over);
    mesh(skirt, 'jacket-tail', loft([[.01, .16, .128], [-.08, .178, .146]], { segments: 48, start: .36, arc: TAU - .72, jag: .012 }), over);
    const apron = own(fabricMaterial(named('apron'), '#70492d', { deep: .78 }));
    mesh(skirt, 'torn-apron', loft([[0, .154, .12], [-.12, .186, .15], [-.2, .203, .166]], { segments: 42, start: -1.05, arc: 1.5, jag: .02, pleats: .03 }), apron);
    mesh(skirt, 'torn-apron-long', loft([[0, .154, .12], [-.18, .198, .158], [-.36, .24, .19]], { segments: 42, start: .22, arc: 1.05, jag: .028, pleats: .05, pleatCount: 14 }), apron);
    for (let k = 0; k < 3; k++) {
      const rope = ring(hips, `rope-wrap-${k}`, [0, .01 + k * .018, 0], .153, .0105, trim, .8);
      rope.rotation.z = (k - 1) * .05;
    }
    strap(hips, 'rope-knot-tail', [[.075, .03, .118], [.1, -.05, .142], [.09, -.14, .16]], .0085, .0085, trim, [0, 0, 0]);
    orb(hips, 'rope-knot', [.075, .03, .12], [.02, .017, .014], trim);
  } else if (c.id === 'yunniang') {
    collar(trim, .014);
    mesh(skirt, 'white-skirt-panel', loft(bell(.006), { segments: 18, start: -.3, arc: .6, perSpan: 3 }), inner);
    for (const sign of [-1, 1]) strap(skirt, `panel-edge-${sign}`, bell(.008).map(([y, a, b]) => [sign * Math.sin(.3) * a, y, Math.cos(.3) * b]), .0035, .002, trim, [0, -.2, 0]);
    // Wide butter-yellow sash, tied in front, with cords and tiny tassels.
    waistBand('waist-sash', .082, -.008, belt, .006);
    for (const y of [.06, .012]) waistBand(`sash-line-${y}`, y + .004, y - .004, trim, .007);
    orb(hips, 'sash-knot', [0, .036, .13], [.024, .018, .012], trim);
    for (const sign of [-1, 1]) {
      lock(hips, `sash-bow-${sign}`, [[sign * .01, .036, .13], [sign * .05, .058, .124], [sign * .08, .022, .112]], { width: .017, thick: .005, outFrom: [0, 0, 0], rootShade: .9 }, belt);
      strap(hips, `sash-cord-${sign}`, [[sign * .012, .02, .13], [sign * .026, -.12, .153], [sign * .022, -.27, .19]], .003, .003, trim, [0, -.1, 0]);
      orb(hips, `cord-bead-${sign}`, [sign * .022, -.275, .19], [.007, .007, .007], metal);
      lock(hips, `cord-tassel-${sign}`, [[sign * .022, -.278, .19], [sign * .022, -.3, .193], [sign * .022, -.33, .196]], { width: .008, thick: .005, outFrom: [0, 0, 0], rootWidth: 1, rootShade: 1 }, trim);
      // Twin short blades, crossed on the back: hilts behind the shoulders, tips at the small of the back.
      // Mirrored left and right, so both curved edges face outward. lead-attacks.js takes hold of the hilts here.
      const blade = joint(torso, `knife-${sign}`, [sign * .14, .299, sign > 0 ? -.152 : -.128]);
      blade.rotation.set(.06, 0, -sign * .57);
      mesh(blade, 'knife-sheath', ribbon([[sign * .002, .02, 0], [sign * .012, -.095, 0], [sign * .02, -.215, 0], [sign * .002, -.36, 0]], { width: .029, thick: .011, outFrom: [0, -.17, -1], rootWidth: 1, rootShade: 1, tipStart: .8, tipPower: .6, steps: 18 }), wood);
      ring(blade, 'knife-throat', [sign * .003, .012, 0], .027, .004, metal, .45);
      // The hilt can leave the sheath: local +Y runs along the curved blade, which only shows when drawn.
      const hilt = joint(blade, `knife-hilt-${sign}`, [0, .055, 0]);
      hilt.rotation.set(0, sign > 0 ? Math.PI : 0, Math.PI);
      mesh(hilt, 'knife-grip', loft([[.035, .013, .013], [-.035, .012, .012]], { segments: 12, perSpan: 1 }), dark);
      orb(hilt, 'knife-pommel', [0, -.039, 0], [.016, .012, .016], metal);
      ring(hilt, 'knife-guard', [0, .035, 0], .017, .005, metal);
      const curve = new THREE.Shape();
      curve.moveTo(-.016, .03); curve.lineTo(.02, .03);
      curve.bezierCurveTo(.048, .15, .052, .27, -.004, .39);
      curve.bezierCurveTo(.004, .27, -.006, .15, -.016, .03);
      const edge = mesh(hilt, 'knife-blade', new THREE.ExtrudeGeometry(curve, { depth: .003, bevelEnabled: true, bevelSegments: 1, bevelSize: .002, bevelThickness: .002, curveSegments: 10 }), own(softMaterial(named(`knife-blade-${sign}`), '#e6edf0', { roughness: .28, metalness: .3, rim: .55, rimTint: '#f7fcff' })), [0, 0, -.0015]);
      edge.visible = false;
      edge.receiveShadow = false; // too thin to shade itself cleanly
      knives[sign] = { hilt, edge, parent: blade };
    }
  } else if (c.id === 'xiejingtang') {
    strap(torso, 'inner-chest', [[0, .325, .066], [0, .23, .113], [0, .05, .118]], .07, .006, inner, chestOut);
    for (const sign of [1, -1]) strap(torso, `collar-${sign}`, [[sign * .062, .335, .036], [sign * .062, .29, .094], [sign * .058, .17, .127], [sign * .048, .03, .126]], .017, .006, trim, chestOut);
    strap(skirt, 'center-sash-band', [[.0, -.0, .12], [0, -.2, .15], [0, -.44, .198]], .023, .004, over, [0, -.1, 0]);
    waistBand('waist-sash', .056, .004, belt);
    orb(hips, 'sash-knot', [.03, .03, .128], [.02, .015, .01], belt);
    strap(hips, 'sash-tail', [[.03, .025, .13], [.04, -.1, .15], [.036, -.26, .178]], .014, .003, belt, [0, -.1, 0]);
  } else if (c.id === 'linhan') {
    collar(c.inner ? inner : trim, .017);
    // Wide leather corset and two crossing straps with metal fittings.
    waistBand('waist-armor', .1, -.02, belt, .005);
    for (let k = 0; k < 3; k++) waistBand(`waist-armor-line-${k}`, .082 - k * .04 + .004, .082 - k * .04 - .004, metal, .006);
    orb(hips, 'belt-buckle', [0, .04, .127], [.02, .027, .007], metal);
    for (const sign of [-1, 1]) {
      strap(torso, `cross-strap-${sign}`, [[sign * .125, .3, .05], [sign * .082, .22, .108], [-sign * .03, .115, .128]], .0098, .0045, belt, chestOut);
      orb(torso, `strap-fitting-${sign}`, [sign * .09, .23, .106], [.0115, .0115, .005], metal);
      strap(hips, `side-strap-${sign}`, [[sign * .13, -.02, .08], [sign * .15, -.13, .1], [sign * .13, -.2, .13]], .0065, .003, belt, [0, -.1, 0]);
    }
  } else if (c.id === 'zengxin') {
    collar(trim, .014);
    // Short cream jacket over the pale green under-robe (EP01 10:00); its sleeves stop above the elbow.
    mesh(torso, 'jacket', loft([[.312, .112, .09], [.2, .168, .126], [.09, .162, .126], [-.03, .155, .124]], { segments: 48, start: .3, arc: TAU - .6 }), over);
    mesh(skirt, 'jacket-tail', loft([[.01, .16, .128], [-.12, .184, .15]], { segments: 48, start: .3, arc: TAU - .6, pleats: .02 }), over);
    for (const { arm } of arms) mesh(arm, 'jacket-sleeve', loft([[.02, .073, .073], [-.06, .074, .074], [-.12, .072, .072]], { segments: 18 }), over);
    // Two leather belts and the strap across the chest.
    waistBand('waist-belt-upper', .048, .02, belt);
    waistBand('waist-belt-lower', .012, -.016, belt);
    ring(hips, 'belt-buckle', [0, .033, .128], .015, .0042, metal).rotation.x = 0;
    strap(torso, 'diagonal-chest-strap', [[-.122, .3, .062], [-.05, .215, .13], [.05, .115, .135], [.15, .03, .106]], .012, .005, belt, chestOut);
    strap(torso, 'diagonal-back-strap', [[-.122, .3, .012], [-.08, .25, -.1], [.05, .13, -.13], [.15, .03, -.106]], .012, .005, belt, chestOut);
    mesh(hips, 'belt-pouch', loft([[.02, .022, .012], [-.03, .036, .02], [-.075, .032, .018], [-.09, .014, .008]], { segments: 14 }), belt, [.142, -.012, .07]);
  } else if (c.id === 'jingnan') {
    collar(inner, .014);
    // Blue-black scale cuirass (EP24 15:00), overlapping plates over the hips, a lion on each shoulder.
    mesh(torso, 'cuirass', loft([[.305, .122, .1], [.2, .176, .137], [.09, .17, .135], [-.03, .162, .13]], { segments: 48, start: .3, arc: TAU - .6 }), over);
    for (let k = 0; k < 6; k++) {
      const start = -Math.PI + k * TAU / 6 + .06;
      mesh(skirt, `tasset-${k}`, loft(bell(.012).map(([y, a, b]) => [y * .66, a, b]), { segments: 16, start, arc: TAU / 6 - .1, perSpan: 2 }), over);
    }
    waistBand('waist-armor', .07, -.006, belt, .009);
    for (const y of [.056, .008]) waistBand(`waist-armor-line-${y}`, y + .004, y - .004, metal, .01);
    orb(hips, 'belt-lion', [0, .032, .135], [.03, .027, .011], metal);
    // Embossed scrolls on the chest; they read as the gilt relief from a distance.
    for (const s of [-1, 1]) {
      strap(torso, `chest-scroll-${s}`, [[s * .03, .1, .138], [s * .09, .14, .138], [s * .118, .19, .13], [s * .08, .225, .125], [s * .05, .19, .135]], .0052, .003, metal, chestOut);
      strap(torso, `chest-edge-${s}`, [[s * .062, .315, .07], [s * .05, .24, .128], [s * .018, .13, .141]], .007, .004, metal, chestOut);
    }
    for (const { arm, sign } of arms) {
      const lion = joint(arm, 'lion-pauldron', [sign * .018, .008, 0]);
      orb(lion, 'pauldron-dome', [0, 0, 0], [.092, .078, .096], over);
      // The lion looks out and forward from the shoulder (EP24 15:00).
      const face = joint(lion, 'lion-head', [sign * .078, -.004, .03]);
      face.rotation.y = sign * .85;
      orb(face, 'lion-skull', [0, 0, 0], [.05, .047, .034], metal);
      orb(face, 'lion-muzzle', [0, -.016, .028], [.03, .021, .022], metal);
      orb(face, 'lion-nose', [0, -.006, .046], [.011, .008, .007], dark);
      for (const e of [-1, 1]) {
        orb(face, `lion-brow-${e}`, [e * .021, .017, .026], [.018, .009, .011], metal);
        orb(face, `lion-eye-${e}`, [e * .021, .005, .033], [.0072, .0072, .004], dark);
        orb(face, `lion-ear-${e}`, [e * .038, .036, .004], [.013, .014, .008], metal);
      }
      for (let k = 0; k < 9; k++) {
        const a = k / 9 * TAU, cx = Math.cos(a), sy = Math.sin(a);
        lock(face, `lion-mane-${k}`, [[cx * .03, sy * .03, -.012], [cx * .054, sy * .05, -.016], [cx * .074, sy * .07, -.03]], { width: .019, thick: .007, outFrom: [0, 0, 0], rootShade: 1 }, metal);
      }
    }
  } else if (c.id === 'tongtong') {
    collar(inner, .015);
    // Pale quilted sleeveless jacket, open down the front, short tails over the skirt (EP19 17:15).
    mesh(torso, 'vest-quilted', loft([[.312, .11, .088], [.2, .167, .125], [.09, .16, .125], [-.03, .153, .123]], { segments: 48, start: .42, arc: TAU - .84 }), over);
    mesh(skirt, 'vest-tail', loft([[.01, .158, .126], [-.09, .176, .146]], { segments: 48, start: .42, arc: TAU - .84 }), over);
    const rose = own(softMaterial(named('strap'), c.belt, { roughness: .6, rim: .16 }));
    // Bag strap from her left shoulder across the chest and back again behind her.
    strap(torso, 'diagonal-chest-strap', [[.122, .3, .062], [.05, .215, .128], [-.05, .115, .133], [-.15, .03, .104]], .017, .005, rose, chestOut);
    strap(torso, 'diagonal-back-strap', [[.122, .3, .012], [.08, .25, -.098], [-.05, .13, -.128], [-.15, .03, -.104]], .017, .005, rose, chestOut);
    waistBand('waist-sash', .046, .006, belt);
    // A thin cord necklace, with her small satchel carrying Cao Jiande's manuscript.
    strap(torso, 'neck-cord', [[.055, .335, .04], [.022, .27, .112], [.002, .215, .126]], .0032, .0026, belt, chestOut);
    orb(torso, 'neck-bead', [.002, .208, .128], [.0085, .0085, .006], metal);
    const satchel = joint(hips, 'satchel', [-.172, -.03, .05]);
    satchel.rotation.set(.04, -.5, .1);
    mesh(satchel, 'satchel-bag', loft([[.055, .03, .018], [.0, .062, .028], [-.06, .058, .03], [-.074, .022, .012]], { segments: 18 }), own(fabricMaterial(named('satchel'), '#9f8064', { deep: .86 })));
    mesh(satchel, 'manuscript', loft([[.078, .04, .007], [.03, .04, .007]], { segments: 4, perSpan: 1 }), ivory);
  } else if (c.id === 'dongzi') {
    collar(trim, .014);
    // EP01 18:28 清风楼门前迎客伙计东子：米褐短袖外褂套在浅青白长衫外，左肩搭一条白布迎客搭巾。
    mesh(torso, 'jacket', loft([[.312, .112, .09], [.2, .168, .126], [.09, .162, .126], [-.03, .155, .124]], { segments: 48, start: .28, arc: TAU - .56 }), over);
    mesh(skirt, 'jacket-tail', loft([[.01, .16, .128], [-.14, .186, .152]], { segments: 48, start: .28, arc: TAU - .56, pleats: .02 }), over);
    for (const { arm } of arms) mesh(arm, 'jacket-sleeve', loft([[.02, .073, .073], [-.06, .074, .074], [-.115, .072, .072]], { segments: 18 }), over);
    waistBand('waist-sash', .048, .004, belt);
    orb(hips, 'sash-knot', [-.045, .026, .128], [.02, .015, .012], belt);
    // 左肩搭着的白布迎客巾（前垂至胸口，后垂至肩背）
    strap(torso, 'shoulder-towel-front', [[.105, .322, -.02], [.108, .312, .055], [.098, .235, .126], [.092, .135, .135]], .024, .006, ivory, chestOut);
    strap(torso, 'shoulder-towel-back', [[.105, .322, -.02], [.108, .295, -.085], [.102, .205, -.124]], .022, .005, ivory, chestOut);
    mesh(hips, 'tavern-tally', new THREE.BoxGeometry(.024, .058, .008), wood, [-.135, -.035, .092]);
  } else if (c.id === 'gutingmei') {
    collar(inner, .016);
    // EP10 38:57 顾廷美：深紫锦缎比甲套在淡紫宽袖纱袍外，紫金腰封，两条淡紫发带垂在胸前。
    mesh(torso, 'brocade-vest', loft([[.312, .112, .09], [.2, .168, .126], [.09, .162, .126], [-.03, .155, .124]], { segments: 48, start: .28, arc: TAU - .56 }), over);
    mesh(skirt, 'vest-tail', loft([[.01, .16, .128], [-.2, .19, .155]], { segments: 48, start: .3, arc: TAU - .6, pleats: .02 }), over);
    waistBand('waist-sash', .05, .004, belt);
    orb(hips, 'jade-buckle', [0, .0, .132], [.022, .02, .01], ivory);
    for (const side of [-1, 1]) strap(torso, `hair-ribbon-${side < 0 ? 'r' : 'l'}`, [[side * .07, .34, -.08], [side * .11, .3, .06], [side * .1, .2, .13], [side * .095, .06, .14]], .016, .004, own(fabricMaterial(named('ribbon'), '#dcc8f0', { deep: .92 })), chestOut);
  } else if (c.id === 'baoge') {
    collar(trim, .018);
    // 包哥（原创）：赤金无袖褂敞在墨黑短打外，宽皮战腰封配圆铜扣，双臂铁护腕，拳上缠白布。
    mesh(torso, 'gold-vest', loft([[.312, .114, .09], [.2, .17, .128], [.09, .163, .128], [-.03, .156, .126]], { segments: 48, start: .36, arc: TAU - .72 }), over);
    mesh(skirt, 'vest-tail', loft([[.01, .16, .128], [-.1, .18, .148]], { segments: 48, start: .36, arc: TAU - .72, pleats: .02 }), over);
    waistBand('war-belt', .066, -.008, belt, .009);
    orb(hips, 'belt-buckle', [0, .029, .135], [.032, .03, .012], metal);
    for (const { sign, elbow, hand } of arms) {
      const side = sign > 0 ? 'left' : 'right';
      for (const [k, y] of [-.1, -.135, -.17].entries()) ring(elbow, `${side}-iron-bracer-${k}`, [0, y, 0], .057 - k * .002, .0075, metal);
      ring(hand, `${side}-fist-wrap`, [0, -.006, .003], .043, .009, ivory, 1.1);
    }
  } else {
    collar(trim);
    waistBand('waist-sash', .05, .004, belt);
  }

  // ---- Head and painted face --------------------------------------------------------------
  const head = joint(torso, 'head', [0, NECK_Y, 0]);
  head.scale.setScalar(HEAD_SCALE * (c.headScale || 1));
  const eyeStyle = EYES[c.look.eye];
  const [faceWide, chinTaper] = FACE_SHAPE[c.face];
  const RX = .285 * faceWide, RZ = .25;
  const headRings = [];
  for (let k = 0; k <= 34; k++) {
    const v = -1 + 2 * k / 34, y = HEAD_MID + v * HEAD_MID;
    const round = Math.sqrt(Math.max(1 - v * v, 0));
    // Full cheeks low on the face, narrowing to a small soft chin: the core of the cute read.
    const cheek = 1 + .05 * Math.exp(-((v + .36) ** 2) / .07);
    const chin = v < -.42 ? 1 - chinTaper * ((-v - .42) ** 1.8) : 1;
    headRings.push([y, Math.max(RX * round * cheek * chin, .0015), Math.max(RZ * round * (v < -.42 ? 1 - .1 * (-v - .42) : 1), .0015)]);
  }
  const face = {
    ...eyeStyle, ...c.look,
    eyeX: .108 * faceWide, eyeY: .2, browHalf: .032, lashLift: .004,
    blushX: .17 * faceWide, blushY: .128, blushAmount: c.blush ?? (c.id === 'linhan' ? .28 : .42), blush: '#f58f86',
    lash: c.hairDeep, lowerLid: '#a2695f', brow: c.hairTint,
    noseY: .124, mouthY: .086
  };
  mesh(head, 'face-volume', loft(headRings, { segments: 56, perSpan: 1 }), own(faceMaterial(named('face'), c.skin, face, blink)));
  for (const sign of [-1, 1]) {
    orb(head, `ear-${sign}`, [sign * RX * .985, .215, -.01], [.022, .037, .024], skin);
    orb(head, `ear-inner-${sign}`, [sign * RX * 1.03, .215, -.008], [.012, .022, .014], skin);
  }

  // A point on the (slightly inflated) skull at azimuth a; a = 0 faces front.
  const skull = (a, y, off = .02) => {
    const v = clamp((y - HEAD_MID) / HEAD_MID, -1, 1), r = Math.sqrt(Math.max(1 - v * v, 0));
    return [Math.sin(a) * r * (RX + off), y, Math.cos(a) * r * (RZ + off)];
  };

  // ---- Hair -------------------------------------------------------------------------------
  // Shell: hairline high at the front, falling behind the ears; extra volume at the crown.
  const hairlineFront = { caosheng: .41, xiejingtang: .405, linhan: .395, zengqian: .395, yunniang: .395, fengbuhai: .4, tongtong: .39, zengxin: .4 }[c.fringe || c.id];
  const lineAt = (a) => {
    const f = Math.cos(a);
    return lerp(.18, f > 0 ? hairlineFront : .04, Math.pow(Math.abs(f), f > 0 ? 1.6 : 1.1));
  };
  const cols = 72, rows = 16, capP = [], capC = [], capUV = [], capI = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const a = -Math.PI + TAU * i / cols, t = j / rows;
    const off = .018 + .016 * (1 - Math.cos(a)) / 2;
    const yEnd = lineAt(a), phiEnd = Math.acos(clamp((yEnd - HEAD_MID) / (HEAD_MID + off), -1, 1));
    const phi = phiEnd * t;
    const r = Math.sin(phi);
    const lift = 1 + .035 * Math.exp(-((phi - .75) ** 2) / .3);
    capP.push(Math.sin(a) * r * (RX + off) * lift, HEAD_MID + Math.cos(phi) * (HEAD_MID + off) * lift, Math.cos(a) * r * (RZ + off) * lift);
    // Parting groove and a soft dark edge at the hairline give the helmet some form.
    const parting = 1 - .4 * Math.exp(-(a * a) / .006) * Math.max(Math.cos(a), 0);
    const edge = lerp(1, .78, Math.pow(t, 4));
    capC.push(parting * edge, parting * edge, parting * edge);
    capUV.push(i / cols, t);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = j * (cols + 1) + i, b = a + cols + 1;
    capI.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const capGeo = new THREE.BufferGeometry();
  capGeo.setAttribute('position', new THREE.Float32BufferAttribute(capP, 3));
  capGeo.setAttribute('color', new THREE.Float32BufferAttribute(capC, 3));
  capGeo.setAttribute('uv', new THREE.Float32BufferAttribute(capUV, 2));
  capGeo.setIndex(capI);
  capGeo.computeVertexNormals();
  // Weld the seam at the back of the head so no hard line shows through the shading.
  const capN = capGeo.attributes.normal;
  for (let j = 0; j <= rows; j++) {
    const first = j * (cols + 1), last = first + cols;
    const n = new THREE.Vector3().fromBufferAttribute(capN, first).add(new THREE.Vector3().fromBufferAttribute(capN, last)).normalize();
    capN.setXYZ(first, n.x, n.y, n.z); capN.setXYZ(last, n.x, n.y, n.z);
  }
  mesh(head, 'scalp-shell', capGeo, hairCap);

  // Fringe locks start high on the crown and sweep down over the forehead.
  const fringeLock = (name, a0, a1, tipY, width, thick = .013) => lock(head, name, [
    skull(a0 * .4, HEAD_HEIGHT - .012, .03), skull(lerp(a0, a1, .3), .47, .032), skull(lerp(a0, a1, .72), .395, .031), skull(a1, tipY, .022)
  ], { width, thick });
  // Longer strand beside the cheek.
  const faceStrand = (name, a, endY, width = .036, swing = 0) => lock(head, name, [
    skull(a * .55, .5, .03), skull(a * .92, .36, .032),
    [Math.sin(a) * (RX + .026), .17, Math.cos(a) * (RZ + .03)],
    [Math.sin(a) * (RX + .014) + swing, endY, Math.cos(a) * (RZ + .016)]
  ], { width, thick: .012 });

  const fringe = {
    caosheng() {
      for (const s of [-1, 1]) {
        fringeLock(`fringe-${s}-0`, s * .05, s * .34, .325, .056);
        fringeLock(`fringe-${s}-1`, s * .26, s * .66, .3, .05);
        faceStrand(`temple-lock-${s}`, s * 1.04, -.16, .036);
      }
    },
    xiejingtang() {
      fringeLock('fringe-0', -.14, .36, .33, .07);
      fringeLock('fringe-1', -.05, .72, .285, .056);
      fringeLock('fringe-2', -.14, -.42, .335, .062);
      fringeLock('fringe-3', -.3, -.74, .28, .05);
      for (const s of [-1, 1]) faceStrand(`temple-lock-${s}`, s * 1.08, -.03, .036);
    },
    zengqian() {
      [-.56, -.32, -.1, .12, .34, .57].forEach((a, i) => fringeLock(`fringe-${i}`, a * .7, a * 1.06, .335 + (i % 2) * .014, .05, .012));
      for (const s of [-1, 1]) faceStrand(`temple-lock-${s}`, s * 1.04, .06, .032);
    },
    yunniang() {
      [-.72, -.48, -.24, 0, .24, .48, .72].forEach((a, i) => fringeLock(`fringe-${i}`, a * .86, a, .328 + (i % 2) * .006, .058, .013));
      for (const s of [-1, 1]) faceStrand(`temple-lock-${s}`, s * 1.08, .08, .034);
    },
    fengbuhai() {
      [-.58, -.3, -.04, .24, .52].forEach((a, i) => fringeLock(`fringe-${i}`, a * .5, a * 1.12, .352 - (i % 2) * .018, .05, .014));
      for (const s of [-1, 1]) faceStrand(`temple-lock-${s}`, s * 1.14, .1, .027);
    },
    zengxin() {
      // Loose side-swept fringe under the headband or helmet: the same hair in both forms.
      [-.5, -.22, .08, .36].forEach((a, i) => fringeLock(`fringe-${i}`, a * .6, a * 1.15, .322 + (i % 2) * .014, .056, .013));
      for (const s of [-1, 1]) faceStrand(`temple-lock-${s}`, s * 1.04, s > 0 ? .02 : .1, .03);
    },
    tongtong() {
      // Straight-cut bangs right down to the brows, with long side locks to the jaw.
      [-.66, -.44, -.22, 0, .22, .44, .66].forEach((a, i) => fringeLock(`fringe-${i}`, a * .82, a, .3 + (i % 2) * .006, .064, .014));
      for (const s of [-1, 1]) faceStrand(`temple-lock-${s}`, s * 1.02, .05, .058);
    },
    linhan() {
      for (const s of [-1, 1]) {
        fringeLock(`fringe-${s}`, s * .03, s * .52, .33, .056);
        faceStrand(`temple-lock-${s}`, s * .98, .03, .026);
      }
    }
  }[c.fringe || c.id];
  fringe();

  // Long hanging hair and tails live on swaying joints.
  const backLocks = (count, spread, endY, width, { thick = .019, tipIn = .78, tipStart = .62 } = {}) => {
    const tail = joint(head, 'long-hair', [0, .3, -.17]); sway.push(tail);
    for (let k = 0; k < count; k++) {
      const u = count > 1 ? k / (count - 1) * 2 - 1 : 0;
      const a = Math.PI + u * spread, top = skull(a, .29, .03);
      const x0 = top[0], z0 = top[2] + .17;
      lock(tail, `back-lock-${k}`, [[x0 * .9, .02, z0], [x0 * 1.1, endY * .27, z0 - .012], [x0 * 1.02, endY * .68, z0 - .004], [x0 * tipIn, endY + (k % 2) * .035, z0 + .03]],
        { width, thick, outFrom: [0, -.2, .4], rootWidth: .9, rootShade: .78, tipStart }, hairFlow);
    }
  };
  const ponytail = (base, tips, reach, width) => {
    const tail = joint(head, 'long-hair', base); sway.push(tail);
    tips.forEach((x, k) => lock(tail, `back-lock-${k}`, [
      [x * .25, 0, 0], [x * .7, .04, -.08], [x * 1.2, -.03, -.17], [x * 1.25, reach * .5, -.2], [x * .7, reach + (k % 2) * .04, -.14]
    ], { width, thick: .042, outFrom: [0, -.15, .35], rootWidth: .6, rootShade: .78 }, hairFlow));
  };

  if (c.hair === 'half') {
    // 曹晟 and 谢景棠 share the same long fall down the back.
    backLocks(6, 1, -.62, .058);
    // Top knot held by a pin (曹晟) or a small silver crown (谢景棠).
    orb(head, 'tied-bun', [0, .582, -.05], [.07, .066, .068], hairOrb);
    if (c.id === 'caosheng') {
      ring(head, 'hair-crown', [0, .552, -.05], .056, .009, metal);
      mesh(head, 'hairpin', loft([[.0, .006, .006], [-.2, .006, .006]], { segments: 10, perSpan: 1 }), metal, [.1, .59, -.046]).rotation.z = -Math.PI / 2 + .1;
      orb(head, 'hairpin-head', [-.104, .6, -.046], [.016, .016, .016], metal);
    } else {
      mesh(head, 'hair-crown', loft([[.03, .062, .056], [-.012, .05, .046]], { segments: 6, perSpan: 1 }), metal, [0, .56, -.05]);
      orb(head, 'crown-gem', [0, .588, .004], [.012, .012, .008], metal);
    }
  } else if (c.hair === 'pony') {
    ponytail([0, .49, -.2], [-.04, 0, .04], -.8, .058);
    orb(head, 'tied-bun', [0, .54, -.17], [.052, .05, .05], hairOrb);
    ring(head, 'hair-crown', [0, .535, -.185], .042, .011, metal).rotation.x = .4;
    for (const s of [-1, 1]) orb(head, `crown-bead-${s}`, [s * .03, .566, -.15], [.012, .012, .012], metal);
    orb(head, 'crown-bead-mid', [0, .578, -.15], [.014, .014, .014], metal);
  } else if (c.hair === 'high') {
    ponytail([0, .54, -.17], [-.05, -.016, .016, .05], -1.02, .064);
    orb(head, 'tied-bun', [0, .575, -.13], [.05, .046, .05], hairOrb);
    ring(head, 'hair-crown', [0, .56, -.14], .046, .008, metal).rotation.x = .5;
    // Silver filigree tiara.
    for (let k = -2; k <= 2; k++) {
      const a = k * .34, h = .045 - Math.abs(k) * .012;
      lock(head, `tiara-${k}`, [[Math.sin(a) * .058, .562, -.1 + Math.cos(a) * .05], [Math.sin(a) * .062, .562 + h * .6, -.1 + Math.cos(a) * .056], [Math.sin(a) * .06, .562 + h, -.1 + Math.cos(a) * .054]], { width: .012, thick: .003, outFrom: [0, .56, -.1], rootWidth: .8, rootShade: 1 }, metal);
    }
  } else if (c.hair === 'bun') {
    // Tousled bun wrapped in hemp cord.
    orb(head, 'tied-bun', [0, .595, -.05], [.078, .072, .074], hairOrb);
    for (let k = 0; k < 2; k++) {
      const r = ring(head, `hair-rope-${k}`, [0, .565 + k * .017, -.05], .066 - k * .008, .008, trim);
      r.rotation.z = k ? .16 : -.12;
    }
  } else if (c.hair === 'headband') {
    // Half-up with a long fall behind, and the braided grey-green band around the forehead.
    backLocks(5, .9, -.56, .056);
    orb(head, 'tied-bun', [0, .594, -.07], [.066, .06, .062], hairOrb);
    ring(head, 'hair-crown', [0, .562, -.07], .05, .007, metal);
    orb(head, 'hairpin-head', [.052, .6, -.05], [.017, .012, .012], metal);
    const band = own(softMaterial(named('headband'), '#8d9f96', { roughness: .7, rim: .14 }));
    const loop = Array.from({ length: 25 }, (_, k) => skull(-Math.PI + k * TAU / 24, .352, .045));
    strap(head, 'headband-loop', loop, .021, .012, band, [0, .352, 0]);
    for (let k = -5; k <= 5; k++) orb(head, `headband-bead-${k}`, skull(k * .15, .352, .057), [.012, .0135, .007], k % 2 ? metal : band);
    for (const s of [-1, 1]) lock(head, `headband-tail-${s}`, [[s * .012, .352, -.285], [s * .05, .28, -.31], [s * .06, .17, -.32]], { width: .012, thick: .003, outFrom: [0, .3, 0], rootShade: 1, rootWidth: 1 }, band);
  } else if (c.hair === 'helmet') {
    // Scrolled helmet, cheek guards and a tall crest (EP23 45:40 / EP24 15:00). Only a little hair escapes behind.
    backLocks(3, .55, -.2, .05, { tipIn: .9 });
    const shell = own(softMaterial(named('helmet'), '#242f42', { roughness: .36, metalness: .35, rim: .42, rimTint: '#a9c3e0' }));
    mesh(head, 'helmet-dome', loft([[.66, .012, .012], [.635, .13, .12], [.57, .245, .225], [.48, .31, .28], [.4, .325, .295], [.36, .326, .296]], { segments: 40 }), shell);
    mesh(head, 'helmet-cheeks', loft([[.37, .326, .296], [.25, .322, .29], [.14, .29, .262], [.06, .22, .2]], { segments: 40, start: .78, arc: TAU - 1.56 }), shell);
    mesh(head, 'helmet-brim', loft([[.378, .334, .304], [.356, .334, .304]], { segments: 40, perSpan: 1 }), own(softMaterial(named('helmet-brim'), '#5e7088', { roughness: .36, metalness: .5, rim: .35 })));
    // Everything embossed is laid on the dome: a(ngle) round the head, y up it.
    const domeRings = [[.635, .13, .12], [.57, .245, .225], [.48, .31, .28], [.4, .325, .295], [.3, .325, .294], [.2, .316, .286], [.1, .25, .228]];
    const onHelm = (a, y, off = .006) => {
      const k = Math.max(domeRings.findIndex(r => r[0] <= y), 1), [y0, x0, z0] = domeRings[k - 1], [y1, x1, z1] = domeRings[k], t = (y - y0) / (y1 - y0);
      return [Math.sin(a) * (lerp(x0, x1, t) + off), y, Math.cos(a) * (lerp(z0, z1, t) + off)];
    };
    const relief = own(softMaterial(named('helmet-relief'), '#8ea2bb', { roughness: .36, metalness: .5, rim: .4, rimTint: '#e0ecff' }));
    const flat = { width: .0105, thick: .004, outFrom: [0, .3, 0], taper: false, rootShade: 1, rootWidth: 1 };
    lock(head, 'helmet-ridge', [onHelm(0, .4), onHelm(0, .5), onHelm(0, .58), onHelm(Math.PI, .6), onHelm(Math.PI, .5), onHelm(Math.PI, .4)], { ...flat, width: .016 }, relief);
    for (const s of [-1, 1]) {
      // A big scroll curling back on each side of the dome, and a smaller one over the temple.
      lock(head, `helmet-scroll-${s}`, [onHelm(s * .16, .405), onHelm(s * .55, .43), onHelm(s * 1.05, .47), onHelm(s * 1.5, .5), onHelm(s * 1.5, .56), onHelm(s * 1.05, .57), onHelm(s * .85, .515), onHelm(s * 1.1, .49)], flat, relief);
      lock(head, `helmet-scroll-small-${s}`, [onHelm(s * .3, .45), onHelm(s * .42, .53), onHelm(s * .2, .56), onHelm(s * .14, .5)], flat, relief);
      lock(head, `helmet-back-scroll-${s}`, [onHelm(s * 2.1, .4), onHelm(s * 2.3, .5), onHelm(s * 2.7, .54), onHelm(s * 2.6, .44)], flat, relief);
      lock(head, `helmet-cheek-trim-${s}`, [onHelm(s * .86, .35), onHelm(s * .84, .24), onHelm(s * .9, .14), onHelm(s * 1.25, .105)], { ...flat, width: .013 }, relief);
    }
    mesh(head, 'helmet-spike-base', loft([[.72, .012, .012], [.655, .034, .034]], { segments: 12, perSpan: 1 }), metal);
    lock(head, 'helmet-crest', [[0, .7, -.012], [0, .82, -.03], [0, .92, -.012]], { width: .03, thick: .018, outFrom: [0, .7, .4], rootShade: 1, rootWidth: .9 }, hairFlow);
  } else if (c.hair === 'topknot') {
    // Everything drawn up into a single bun, tied with a red cord and a sprig of pink blossoms.
    orb(head, 'tied-bun', [0, .6, -.09], [.098, .082, .09], hairOrb);
    const cord = own(softMaterial(named('hair-cord'), '#b5343f', { roughness: .55, rim: .2 }));
    for (let k = 0; k < 2; k++) {
      const r = ring(head, `hair-cord-${k}`, [0, .566 + k * .017, -.09], .092 - k * .006, .0095, cord);
      r.rotation.z = k ? .12 : -.08;
    }
    const petal = own(softMaterial(named('petal'), '#f6b9bb', { rim: .12 }));
    const sprig = joint(head, 'hair-flower', [.078, .608, -.022]);
    sprig.rotation.set(-.3, .62, 0);
    [[0, 0], [.033, -.016], [-.012, .03]].forEach(([x, y], f) => {
      for (let k = 0; k < 5; k++) {
        const a = k * TAU / 5;
        orb(sprig, `flower-petal-${f}-${k}`, [x + Math.cos(a) * .014, y + Math.sin(a) * .014, 0], [.0115, .0115, .005], petal);
      }
      orb(sprig, `flower-center-${f}`, [x, y, .004], [.0055, .0055, .0035], metal);
    });
  } else if (c.hair === 'braids') {
    const petal = own(softMaterial(named('petal'), '#fbd0cc', { rim: .1 }));
    for (const s of [-1, 1]) {
      // Side bun with a sprig of blossoms, then a thick braid over the shoulder.
      orb(head, `side-bun-${s}`, [s * .222, .47, -.1], [.066, .062, .064], hairOrb);
      const flower = joint(head, `flower-${s}`, skull(s * .98, .445, .046));
      flower.rotation.y = s * .95;
      for (let k = 0; k < 5; k++) {
        const a = k * TAU / 5, cx = Math.cos(a) * .021, cy = Math.sin(a) * .021;
        orb(flower, `flower-petal-${s}-${k}`, [cx, cy, 0], [.0165, .0165, .006], petal);
      }
      orb(flower, `flower-center-${s}`, [0, 0, .004], [.008, .008, .005], metal);
      lock(flower, `flower-ribbon-${s}`, [[0, -.015, -.004], [s * .008, -.07, 0], [s * .004, -.13, .004]], { width: .007, thick: .002, outFrom: [0, -.05, -.2], rootShade: 1, rootWidth: 1 }, trim);

      const braid = joint(head, `front-braid-${s}`, [s * .225, .15, .05]); sway.push(braid);
      lock(braid, `braid-base-${s}`, [[s * -.03, .14, -.08], [s * .012, .03, -.018], [s * .004, -.08, .03]], { width: .034, thick: .026, outFrom: [0, 0, -.3], rootWidth: .9, rootShade: .85 }, hairFlow);
      for (let k = 0; k < 9; k++) {
        const y = -.05 - k * .036, width = .034 - k * .0012, onSide = k % 2 ? 1 : -1;
        const link = orb(braid, `braid-link-${s}-${k}`, [onSide * .007, y, .03 + Math.min(.05, k * .007)], [width, .028, width * .8], k % 3 === 1 ? trim : hairOrb);
        link.rotation.z = onSide * .55;
      }
      const bow = joint(braid, `braid-tie-${s}`, [0, -.38, .09]);
      orb(bow, `braid-knot-${s}`, [0, 0, 0], [.018, .012, .015], trim);
      for (let k = -1; k <= 1; k++) lock(bow, `braid-tassel-${s}-${k}`, [[k * .004, 0, 0], [k * .012, -.05, .002], [k * .016, -.12, .002]], { width: .013, thick: .006, outFrom: [0, -.05, -.2], rootWidth: .9, rootShade: 1 }, trim);
    }
  }

  // ---- Props ------------------------------------------------------------------------------
  const backSocket = joint(torso, 'back-socket', [0, .19, -.13]);
  const rightHand = rightArm.hand;
  let heldProp = null, heldUpright = false, bowPivot = null, bowStrings = null, arrow = null, arrowStreak = null;
  const caseDoors = [];
  let caseChamber = null;
  if (c.prop === 'staff' || c.prop === 'poleblade') {
    heldProp = joint(rightHand, 'held-prop', [0, -.012, .026]);
    heldUpright = true;
    const low = -.42, top = c.prop === 'staff' ? 1.1 : .78;
    mesh(heldProp, 'wooden-shaft', loft([[top, .0135, .0135], [low, .0135, .0135]], { segments: 12, perSpan: 1 }), wood);
    if (c.prop === 'staff') {
      for (const y of [-.2, .02, .92, 1.0]) mesh(heldProp, `shaft-wrap-${y}`, loft([[y + .03, .0172, .0172], [y - .03, .0172, .0172]], { segments: 12, perSpan: 1 }), trim);
    } else {
      mesh(heldProp, 'pole-ferrule', loft([[-.3, .017, .017], [low + .005, .012, .012]], { segments: 12, perSpan: 1 }), metal);
      mesh(heldProp, 'pole-collar', loft([[top + .012, .022, .022], [top - .04, .018, .018]], { segments: 12, perSpan: 1 }), metal);
      // Guandao-style blade drawn as one bevelled outline.
      const s = new THREE.Shape();
      s.moveTo(-.024, 0); s.lineTo(.03, 0);
      s.bezierCurveTo(.1, .12, .1, .27, .03, .46);
      s.bezierCurveTo(.02, .38, -.02, .34, -.012, .28);
      s.bezierCurveTo(-.03, .2, -.03, .1, -.024, 0);
      const edge = mesh(heldProp, 'pole-blade', new THREE.ExtrudeGeometry(s, { depth: .008, bevelEnabled: true, bevelSegments: 2, bevelSize: .0045, bevelThickness: .0045, curveSegments: 14 }), own(softMaterial(named('blade'), '#e2e8ea', { roughness: .3, metalness: .25, rim: .5, rimTint: '#f4faff' })), [0, top + .004, -.004]);
      edge.userData.explodeWithParent = true;
    }
  } else if (c.prop === 'saber' || c.prop === 'sword') {
    // The curved single-edged saber from EP24 16:40. +Y runs along the blade, the edge faces +X.
    heldProp = joint(rightHand, 'held-prop', [0, -.012, .026]);
    mesh(heldProp, 'saber-grip', loft([[.02, .014, .014], [-.095, .0125, .0125]], { segments: 10, perSpan: 1 }), dark);
    orb(heldProp, 'saber-pommel', [0, -.102, 0], [.017, .017, .017], metal);
    mesh(heldProp, 'saber-guard', loft([[.032, .03, .02], [.02, .03, .02]], { segments: 14, perSpan: 1 }), metal);
    const s = new THREE.Shape();
    s.moveTo(-.016, .03); s.lineTo(.024, .03);
    if (c.prop === 'sword') { s.lineTo(.024, .74); s.lineTo(.004, .8); s.lineTo(-.016, .74); s.lineTo(-.016, .03); }
    else {
      s.bezierCurveTo(.05, .28, .06, .5, -.012, .78);
      s.bezierCurveTo(-.012, .54, -.03, .28, -.016, .03);
    }
    const edge = mesh(heldProp, 'saber-blade', new THREE.ExtrudeGeometry(s, { depth: .003, bevelEnabled: true, bevelSegments: 1, bevelSize: .002, bevelThickness: .002, curveSegments: 16 }), own(softMaterial(named('saber-steel'), '#c7d2da', { roughness: .24, metalness: .7, rim: .5, rimTint: '#eaf4ff' })));
    edge.position.z = -.0015;
    edge.receiveShadow = false;
    edge.userData.explodeWithParent = true;
  } else if (c.prop === 'bow') {
    // Quiver over her right shoulder, feathers visible from the front.
    const quiver = joint(backSocket, 'right-quiver', [-.09, .01, -.03]);
    quiver.rotation.z = -.82;
    mesh(quiver, 'leather-quiver', loft([[.19, .04, .036], [.03, .046, .04], [-.17, .034, .03]], { segments: 18 }), belt);
    for (const y of [.15, -.09]) mesh(quiver, `quiver-band-${y}`, loft([[y + .012, .048, .043], [y - .012, .047, .042]], { segments: 18, perSpan: 1 }), metal);
    for (let k = 0; k < 4; k++) {
      const x = (k - 1.5) * .016, top = .35 + (k % 2) * .03;
      mesh(quiver, `arrow-${k}`, loft([[top, .0038, .0038], [.12, .0038, .0038]], { segments: 7, perSpan: 1 }), wood, [x, 0, 0]);
      for (const s of [-1, 1]) lock(quiver, `white-feather-${k}-${s}`, [[x, top - .1, 0], [x + s * .018, top - .05, 0], [x + s * .007, top + .012, 0]], { width: .015, thick: .002, outFrom: [x, top, 1], rootWidth: .7, rootShade: 1 }, ivory);
    }
    // The bow hangs from its grip so the hand can take it; string and arrow are posed from attackPose.
    bowPivot = joint(quiver, 'bow-grip', [.17, .135, -.015]);
    mesh(bowPivot, 'bow', ribbon([[-.08, -.285, 0], [-.025, -.165, 0], [0, -.015, 0], [-.02, .145, 0], [-.08, .285, 0]], { width: .009, thick: .009, outFrom: [0, 0, 0], taper: false, sides: 8, steps: 22, rootShade: 1 }), wood);
    const stringGeo = new THREE.CylinderGeometry(.002, .002, 1, 5, 1).translate(0, .5, 0);
    bowStrings = [BOW_NOCK, -BOW_NOCK].map((y, k) => ({ nock: new THREE.Vector3(BOW_BACK, y, 0), mesh: mesh(bowPivot, k ? 'bow-string-lower' : 'bow-string-upper', stringGeo, ivory) }));
    const partCount = parts.length;
    const { length } = ATTACKS.zengqian.arrow;
    arrow = joint(bowPivot, 'nocked-arrow', [0, 0, 0]);
    mesh(arrow, 'arrow-shaft', loft([[length, .0052, .0052], [0, .0052, .0052]], { segments: 7, perSpan: 1 }), wood);
    mesh(arrow, 'arrow-head', loft([[length + .055, .001, .001], [length, .015, .012]], { segments: 8, perSpan: 1 }), metal);
    for (const s of [-1, 1]) lock(arrow, `arrow-feather-${s}`, [[0, .012, 0], [s * .018, .05, 0], [s * .007, .11, 0]], { width: .014, thick: .002, outFrom: [0, .05, 1], rootWidth: .7, rootShade: 1 }, ivory);
    arrowStreak = mesh(arrow, 'arrow-streak', sphere, own(fxMaterial(named('arrow-streak'), ATTACKS.zengqian.arrow.color)), [0, -.38, 0]);
    arrowStreak.scale.set(.009, .46, .009);
    arrowStreak.castShadow = arrowStreak.receiveShadow = false;
    arrow.visible = false;
    parts.length = partCount; // a loaded arrow is an effect: it must not count toward framing or exploded views
    strap(torso, 'quiver-strap', [[-.12, .29, -.05], [-.05, .17, -.126], [.1, .05, -.124]], .012, .004, belt, chestOut);
  } else if (c.prop === 'case') {
    heldProp = joint(rightHand, 'held-prop', [0, -.135, .012]);
    heldUpright = true;
    const box = (name, pos, size, m) => mesh(heldProp, name, new THREE.BoxGeometry(...size), m, pos);
    box('wooden-case', [0, 0, 0], [.2, .185, .075], wood);
    // Sliding doors over a chamber of needle ports; attackPose opens them.
    caseChamber = joint(heldProp, 'case-chamber', [0, 0, 0]);
    mesh(caseChamber, 'chamber-plate', new THREE.BoxGeometry(.19, .15, .002), own(softMaterial(named('chamber'), '#201a17', { roughness: .8, rim: .05 })), [0, 0, .039]);
    for (const [x, y] of [[-.06, .035], [0, .035], [.06, .035], [-.06, -.035], [0, -.035], [.06, -.035]]) orb(caseChamber, `needle-port-${x}-${y}`, [x, y, .041], [.012, .012, .004], metal);
    caseChamber.visible = false;
    for (const s of [-1, 1]) {
      const door = joint(heldProp, `case-door-${s}`, [0, 0, 0]);
      mesh(door, `case-panel-${s}`, new THREE.BoxGeometry(.088, .155, .006), own(softMaterial(named(`case-panel-${s}`), '#7d5439', { roughness: .55 })), [s * .049, 0, .039]);
      orb(door, `case-pull-${s}`, [s * .013, 0, .048], [.0075, .0075, .0065], metal);
      caseDoors.push({ door, s });
    }
    for (const x of [-1, 1]) for (const y of [-1, 1]) orb(heldProp, `case-corner-${x}-${y}`, [x * .096, y * .088, .036], [.012, .012, .007], metal);
    mesh(heldProp, 'case-handle', ribbon([[-.05, .092, 0], [-.04, .122, 0], [.04, .122, 0], [.05, .092, 0]], { width: .006, thick: .006, outFrom: [0, 0, 0], taper: false, sides: 6, steps: 10, rootShade: 1 }), metal);
  }

  // ---- Animation --------------------------------------------------------------------------
  let lastPose = 'idle', disposed = false;
  const stowed = (a) => ['ride', 'chain'].includes(a);
  const ropes = joint(motion, 'chain-ropes', [0, 0, 0]);
  function pose(action = 'idle', time = 0, speed = 1, dt = 1 / 60) {
    const moving = action === 'walk' || action === 'run', running = action === 'run';
    const phase = time * (running ? 12.5 : 8), amplitude = running ? .68 : .48;
    const stride = moving ? Math.sin(phase) * amplitude : 0;
    const blend = lastPose === action ? Math.min(1, dt * 16) : Math.min(1, dt * 11);
    const set = (o, x = 0, y = 0, z = 0) => {
      o.rotation.x = lerp(o.rotation.x, x, blend);
      o.rotation.y = lerp(o.rotation.y, y, blend);
      o.rotation.z = lerp(o.rotation.z, z, blend);
    };

    // Blink twice in a while; the painted lids close quickly and open a touch slower.
    const beat = (time + c.height * 3) % 4.3;
    const lid = (t) => t < .07 ? 1 - t / .07 : t < .2 ? (t - .07) / .13 : 1;
    blink.value = Math.max(Math.min(lid(beat), beat > 1.5 ? lid(beat - 1.5) : 1), .001);

    if (action === 'attack') {
      attackPose(time, dt);
      finishPose(action);
      return;
    }
    leaveAttack();
    hips.position.y = lerp(hips.position.y, HIPS_Y, blend);
    motion.position.z = lerp(motion.position.z, 0, blend);

    const breathe = Math.sin(time * 2.1);
    motion.position.y = running ? Math.abs(Math.cos(phase)) * .035 : 0;
    set(motion, 0, 0, moving ? Math.sin(phase) * (running ? .05 : .035) : 0);
    const stance = c.stance && (action === 'idle' || moving) ? c.stance : NO_STANCE;
    set(torso, (running ? .16 : action === 'chain' ? -.05 : 0) + stance.lean, moving ? Math.sin(phase) * .07 : 0);
    torso.scale.y = lerp(torso.scale.y, 1 + breathe * .008, blend);
    set(head,
      (running ? -.1 : action === 'chain' ? -.12 : moving ? Math.abs(Math.sin(phase)) * .025 : Math.sin(time * .9) * .012) + stance.chin + rubWeight(action, time) * .09,
      action === 'idle' ? Math.sin(time * .55) * .09 : 0,
      action === 'idle' ? Math.sin(time * .7) * .022 : 0);

    let reach = 0;
    for (const { sign, thigh, knee } of legs) {
      // A real step cycle, half a beat apart. s > 0: this foot is ahead. While s rises the leg is swinging
      // through with the knee lifted; while s falls it is planted and pushing back. The bell skirt limits how
      // far a stride can reach, so this reads through cadence and the knee as much as through stride length.
      const s = moving ? Math.sin(phase) * sign : 0;
      const swing = -s * (running ? GAIT.runSwing : GAIT.walkSwing);
      const through = moving ? Math.max(0, Math.cos(phase) * sign) : 0; // peaks mid-swing, so the heel stays inside the skirt at toe-off
      const lift = through * through * (running ? GAIT.runLift : GAIT.walkLift);
      if (moving) reach = Math.max(reach, legReach(swing, 0, lift));
      set(thigh, action === 'ride' ? -.5 : action === 'chain' ? .03 + sign * .05 : swing, 0, action === 'ride' ? sign * 1.2 : 0);
      set(knee, action === 'ride' ? .85 : action === 'chain' ? .1 + (sign > 0 ? .16 : 0) : lift);
    }
    // Hips ride on the planted leg, so its foot stays on the ground through the stride.
    if (moving) hips.position.y = lerp(hips.position.y, reach, blend);

    const holdsPole = c.prop === 'staff' || c.prop === 'poleblade';
    for (const { sign, arm, elbow } of arms) {
      let ax = stride * sign * .6, az = sign * .24, ex = moving ? -.3 : -.05;
      if (action === 'idle') { az = sign * (.24 + breathe * .012); ax = .03; }
      if (action === 'idle' || moving) az += sign * stance.armOut;
      if (action === 'ride') { ax = -.95; az = sign * .08; ex = -.55; }
      if (action === 'chain') { ax = -2.85; az = sign * .68; ex = -.16; }
      if (c.prop === 'case' && (action === 'idle' || moving) && sign === -1) { ax = 0; az = -.42; ex = -.04; }
      if (holdsPole && (action === 'idle' || moving) && sign === -1) { ax = -.42; az = -.3; ex = -.42; }
      set(arm, ax, 0, az); set(elbow, ex);
    }

    // Bell skirt: lags behind when running, tucks up when riding.
    const shake = moving ? Math.sin(phase * 2) * (running ? .03 : .018) : Math.sin(time * 1.7) * .006;
    const sx = action === 'ride' ? 1.2 : 1, sy = action === 'ride' ? .55 : 1;
    const sz = action === 'ride' ? 1.2 : running ? 1.5 : moving ? 1.36 : 1; // room for the striding knees
    skirt.scale.set(lerp(skirt.scale.x, sx, blend), lerp(skirt.scale.y, sy, blend), lerp(skirt.scale.z, sz, blend));
    set(skirt, (running ? .04 : 0) + shake, 0, moving ? -Math.sin(phase) * .03 : 0);

    sway.forEach((p, i) => {
      const trail = running ? .34 : moving ? .14 : action === 'chain' ? -.1 : 0;
      const flutter = moving ? Math.sin(time * 12 + i) * .035 : Math.sin(time * 1.8 + i) * .018;
      set(p, trail + flutter, 0, Math.sin(time * 2.3 + i) * .02);
    });

    if (heldProp) {
      const stow = stowed(action), parent = stow ? backSocket : rightHand;
      if (heldProp.parent !== parent) parent.add(heldProp);
      if (stow) {
        heldProp.position.set(0, c.prop === 'case' ? .02 : 0, -.03);
        heldProp.rotation.set(0, c.prop === 'case' ? Math.PI : 0, c.prop === 'case' ? 0 : -.72);
      } else if (c.prop === 'case') {
        // Hangs from the hand by its handle, level whatever the arm is doing.
        heldProp.position.set(0, -.135, .012);
        heldProp.rotation.set(.04, 0, .42);
      } else if (c.prop === 'saber' || c.prop === 'sword') {
        // Carried low and forward, the blade trailing toward the ground (EP23 45:40).
        heldProp.position.set(0, -.012, .026);
        heldProp.rotation.set(2.28, .2, 0);
      } else if (heldUpright) {
        // Undo the arm's rotation, so the pole stays planted and vertical beside the character.
        heldProp.position.set(0, -.012, .026);
        heldProp.rotation.set(.84, 0, .3);
      }
    }
    rubFingers(action, time);
    finishPose(action);
  }

  // EP24 46:05: Cao Sheng notices the returned Zeng Xin rubbing his fingers, which is Prince Jingnan's habit.
  // Jingnan does it often. Zeng Xin does it too, rarely and without comment, as the show leaves it.
  const RUB_R = [-.035, .03, .2], RUB_L = [.035, .03, .2], rubR = new THREE.Vector3(), rubL = new THREE.Vector3();
  function rubWeight(action, time) {
    if (!c.fingerRub || action !== 'idle') return 0;
    const { every, last } = c.fingerRub, t = time % every - (every - last);
    return t > 0 ? Math.min(t / .35, (last - t) / .35, 1) : 0;
  }
  function rubFingers(action, time) {
    if (!c.fingerRub) return;
    const w = rubWeight(action, time);
    for (const { thumb } of arms) thumb.rotation.x = w > 0 ? Math.sin(time * 9) * .55 * w : 0;
    if (w <= 0) return;
    const drift = Math.sin(time * 4.5) * .005;
    reachArm(rightArm, rubR.fromArray(RUB_R).setX(RUB_R[0] + drift), [-.8, -.6, -.3], w);
    reachArm(leftArm, rubL.fromArray(RUB_L).setX(RUB_L[0] + drift), [.8, -.6, -.3], w);
  }

  function finishPose(action) {
    ropes.visible = action === 'chain';
    if (ropes.parent && action !== 'chain') motion.remove(ropes);
    if (!ropes.parent && action === 'chain') motion.add(ropes);
    lastPose = action;
    group.userData.action = action;
  }

  // ---- Attack -----------------------------------------------------------------------------
  // Played from keyframes in torso space (lead-attacks.js). Arms solve to the hand targets and weapons
  // sit on them, so grip and blade always agree however the torso turns.
  const clip = ATTACKS[c.id], S = newAttackSample(), Spot = newAttackSample();
  const weapons = {};
  if (heldProp) weapons.R = { object: heldProp, always: true, drawn: false };
  if (knives[-1]) {
    weapons.R = { object: knives[-1].hilt, rest: knives[-1], window: clip.drawn.R, drawn: false };
    weapons.L = { object: knives[1].hilt, rest: knives[1], window: clip.drawn.L, drawn: false };
  }
  if (bowPivot) weapons.L = { object: bowPivot, rest: { parent: bowPivot.parent }, window: clip.drawn.L, drawn: false };
  for (const w of Object.values(weapons)) if (w.rest) { w.restPosition = w.object.position.clone(); w.restRotation = w.object.quaternion.clone(); }
  const weaponOffset = new THREE.Vector3().fromArray(clip.weaponOffset || [0, 0, 0]);
  const handTargets = { R: new THREE.Vector3(), L: new THREE.Vector3() };
  let attackWeight = 0, attackActive = false, fx = null;

  function reachArm({ arm, elbow, sign }, target, pole, weight) {
    ikDir.copy(target).sub(arm.position);
    const reach = clamp(ikDir.length(), .08, UPPER_ARM + FOREARM - .002);
    ikDir.normalize();
    const cosInner = clamp((UPPER_ARM ** 2 + FOREARM ** 2 - reach * reach) / (2 * UPPER_ARM * FOREARM), -1, 1);
    const bend = Math.PI - Math.acos(cosInner);
    elbow.rotation.x = lerp(elbow.rotation.x, -bend, weight);
    // Swing the bent chain onto the target, then roll it around that line until the elbow faces its pole.
    ikChain.set(0, -UPPER_ARM - FOREARM * Math.cos(bend), FOREARM * Math.sin(bend)).normalize();
    ikSwing.setFromUnitVectors(ikChain, ikDir);
    ikElbow.set(0, -UPPER_ARM, 0).applyQuaternion(ikSwing);
    ikElbow.addScaledVector(ikDir, -ikElbow.dot(ikDir));
    if (pole) ikPole.fromArray(pole); else ikPole.set(sign * .8, -.6, -.3);
    ikPole.addScaledVector(ikDir, -ikPole.dot(ikDir));
    const roll = Math.atan2(ikDir.dot(ikCross.crossVectors(ikElbow, ikPole)), ikElbow.dot(ikPole));
    ikFull.setFromAxisAngle(ikDir, roll).multiply(ikSwing);
    arm.quaternion.slerp(ikFull, weight);
  }

  function holdWeapon(w, inHand) {
    if (inHand === w.drawn) return;
    w.drawn = inHand;
    if (inHand) torso.add(w.object);
    else if (w.rest) {
      w.rest.parent.add(w.object);
      w.object.position.copy(w.restPosition);
      w.object.quaternion.copy(w.restRotation);
    }
    if (w.rest?.edge) w.rest.edge.visible = inHand;
  }

  function placeWeapon(w, hand, dir, edge, slide) {
    weaponAxes(dir, edge);
    w.object.quaternion.setFromRotationMatrix(basis.makeBasis(axisX, axisY, axisZ));
    w.object.position.fromArray(hand).addScaledVector(axisY, slide)
      .addScaledVector(axisX, weaponOffset.x).addScaledVector(axisY, weaponOffset.y).addScaledVector(axisZ, weaponOffset.z);
  }

  /** A point on hand R or L at any attack time, in the rig's group space. Effects are built from this. */
  function pointAt(t, handName, spot, out) {
    sampleAttack(clip, t, Spot);
    const hand = Spot[`hand${handName}`];
    out.fromArray(hand);
    if (spot.dist !== undefined || spot.y !== undefined || spot.z !== undefined) {
      weaponAxes(Spot[`dir${handName}`], Spot[`edge${handName}`]);
      if (spot.dist !== undefined) out.addScaledVector(axisY, spot.dist + Spot.slide[0]);
      if (spot.y !== undefined) out.addScaledVector(axisY, spot.y);
      if (spot.z !== undefined) out.addScaledVector(axisZ, spot.z);
    }
    out.applyEuler(torsoEuler.fromArray(Spot.torso));
    const hipY = Math.max(legReach(Spot.legL[0], Spot.legL[1], Spot.legL[2]), legReach(Spot.legR[0], Spot.legR[1], Spot.legR[2]));
    out.y += hipY + Spot.root[0];
    out.z += Spot.root[1];
    return out;
  }

  function poseBow(t) {
    const { nockAt, release, speed, life, length } = clip.arrow;
    // The right hand expressed in the bow's own frame.
    weaponAxes(S.dirL, S.edgeL);
    localA.fromArray(S.handR).sub(localB.fromArray(S.handL));
    const hx = localA.dot(axisX), hy = localA.dot(axisY), hz = localA.dot(axisZ);
    const pull = clamp(S.pull[0], 0, 1), age = t - release;
    const twang = age > 0 && age < .28 ? Math.sin(age * 90) * .016 * (1 - age / .28) : 0;
    localA.set(lerp(BOW_BACK, hx, pull) + twang, lerp(0, hy, pull), lerp(0, hz, pull));
    for (const { nock, mesh: part } of bowStrings) {
      localB.copy(localA).sub(nock);
      part.position.copy(nock);
      part.scale.set(1, localB.length(), 1);
      part.quaternion.setFromUnitVectors(UP, localB.normalize());
    }
    arrow.visible = t >= nockAt && age < life && weapons.L.drawn;
    if (!arrow.visible) return;
    arrowStreak.visible = age > 0;
    if (age <= 0) {
      localA.set(hx, hy, hz);
      arrow.position.copy(localA);
      arrow.quaternion.setFromUnitVectors(UP, localA.negate().normalize());
    } else {
      // Flying along the line it was loosed on; once released it no longer follows the hand.
      sampleAttack(clip, release, Spot);
      weaponAxes(Spot.dirL, Spot.edgeL);
      localA.fromArray(Spot.handR).sub(localB.fromArray(Spot.handL));
      localA.set(localA.dot(axisX), localA.dot(axisY), localA.dot(axisZ));
      arrow.position.copy(localA);
      localB.copy(localA).negate().normalize();
      arrow.quaternion.setFromUnitVectors(UP, localB);
      arrow.position.addScaledVector(localB, speed * age);
    }
  }

  function attackPose(time, dt) {
    attackActive = true;
    fx ||= createAttackFx(group, clip, pointAt, r => (r.isMaterial ? materials : geometries).add(r));
    attackWeight = Math.min(1, attackWeight + dt * 14);
    const w8 = attackWeight, t = time % clip.cycle;
    sampleAttack(clip, t, S);
    const ease = (o, x, y, z) => {
      o.rotation.x = lerp(o.rotation.x, x, w8);
      o.rotation.y = lerp(o.rotation.y, y, w8);
      o.rotation.z = lerp(o.rotation.z, z, w8);
    };

    ease(motion, 0, 0, 0);
    motion.position.y = S.root[0];
    motion.position.z = S.root[1];
    ease(torso, S.torso[0], S.torso[1], S.torso[2]);
    torso.scale.y = lerp(torso.scale.y, 1, w8);
    ease(head, S.head[0], S.head[1], S.head[2]);

    let hipY = 0;
    for (const { sign, thigh, knee } of legs) {
      const [swing, out, bend] = sign > 0 ? S.legL : S.legR;
      ease(thigh, swing, 0, sign * out);
      ease(knee, bend, 0, 0);
      hipY = Math.max(hipY, legReach(thigh.rotation.x, thigh.rotation.z, knee.rotation.x));
    }
    hips.position.y = hipY;

    ease(skirt, S.skirt[0], 0, 0);
    // As the hips sink the skirt gathers up, so the hem stays off the ground and clear of the feet.
    const hemLift = 1 - (HIPS_Y - hipY) / L;
    skirt.scale.set(lerp(skirt.scale.x, 1 + (S.skirt[1] - 1) * .35, w8), lerp(skirt.scale.y, hemLift, w8), lerp(skirt.scale.z, S.skirt[1], w8));
    sway.forEach((p, i) => ease(p, S.hair[0] + Math.sin(time * 1.8 + i) * .018, 0, S.hair[1] + Math.sin(time * 2.3 + i) * .02));

    // Weapons first, then the hands that hold them.
    for (const [name, w] of Object.entries(weapons)) {
      const inHand = w.always || (t >= w.window[0] && t < w.window[1]);
      holdWeapon(w, inHand);
      if (inHand) placeWeapon(w, S[`hand${name}`], S[`dir${name}`], S[`edge${name}`], name === 'R' ? S.slide[0] : 0);
    }
    handTargets.R.fromArray(S.handR);
    handTargets.L.fromArray(S.handL);
    const onWeapon = clamp(S.lw[0], 0, 1);
    if (onWeapon > 0) {
      weaponAxes(S.dirR, S.edgeR);
      localA.fromArray(S.handR);
      if (clip.grip) localA.addScaledVector(axisX, clip.grip[0]).addScaledVector(axisY, clip.grip[1]).addScaledVector(axisZ, clip.grip[2]);
      else localA.addScaledVector(axisY, S.lg[0]);
      handTargets.L.lerp(localA, onWeapon);
    }
    reachArm(rightArm, handTargets.R, clip.elbows?.R, w8);
    reachArm(leftArm, handTargets.L, clip.elbows?.L, w8);

    if (bowPivot) poseBow(t);
    if (caseDoors.length) {
      const open = clamp(S.open[0], 0, 1);
      for (const { door, s } of caseDoors) door.position.x = s * .058 * open;
      caseChamber.visible = open > .02;
    }
    fx.update(t);
  }

  function leaveAttack() {
    if (!attackActive) return;
    attackActive = false;
    attackWeight = 0;
    for (const w of Object.values(weapons)) holdWeapon(w, false);
    fx?.hide();
    if (bowPivot) {
      arrow.visible = false;
      arrow.position.set(0, 0, 0);
      for (const { nock, mesh: part } of bowStrings) {
        localB.set(BOW_BACK, 0, 0).sub(nock);
        part.position.copy(nock);
        part.scale.set(1, localB.length(), 1);
        part.quaternion.setFromUnitVectors(UP, localB.normalize());
      }
    }
    for (const { door } of caseDoors) door.position.x = 0;
    if (caseChamber) caseChamber.visible = false;
  }

  // Chain mode: two cords from the hands up to the pulley above the head.
  if (bowStrings) { attackActive = true; leaveAttack(); } // settles the bowstring into its rest shape
  pose('chain', 0, 0, 1);
  group.updateMatrixWorld(true);
  const hub = [0, CHAIN_HANG - .22, 0];
  for (const { sign, hand } of arms) {
    const at = motion.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
    const mid = [(at.x + hub[0]) / 2 + sign * .02, (at.y + hub[1]) / 2, (at.z + hub[2]) / 2];
    mesh(ropes, `chain-rope-${sign}`, ribbon([at.toArray(), mid, hub], { width: .007, thick: .007, outFrom: [0, 0, 0], taper: false, sides: 6, steps: 6, rootShade: 1 }), trim);
  }
  pose('idle', 0, 0, 1);

  group.userData.sculptRuntime = { profile: 'stylized-character', coordinateFrame: 'Y-up,+Z-forward', parts: parts.map(p => p.name), sockets: ['back-socket', 'left-hand', 'right-hand'], rig: 'hierarchical-joints', styleHeads: 3 };
  const scale = c.height * WORLD_SCALE;
  return {
    group, config: c, parts, hips, head, arms, legs, skirt, skirtClearance, pose,
    // Timing the controller and gallery need; handTargets are in torso space, for grip checks.
    attack: { title: clip.title, hit: clip.hit, strike: clip.strike, duration: clip.duration, cancelAt: clip.cancelAt, cycle: clip.cycle, sound: clip.sound, second: clip.second, drawn: clip.drawn, handTargets, torso },
    // World-space landmarks, so vehicles and cameras need no knowledge of the proportions.
    metrics: { seatY: HIPS_Y * scale, faceY: FACE_Y * scale, shoulderY: (HIPS_Y + SHOULDER_Y) * scale, chainHang: CHAIN_HANG * scale },
    animateWalk(phase, amplitude = .5) { pose(amplitude ? 'walk' : 'idle', phase / 6, 1, 1 / 60); },
    getStats() {
      let triangles = 0;
      group.traverse(o => { if (o.isMesh) triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3; });
      return { triangles, meshes: parts.length, materials: materials.size };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
    }
  };
}
