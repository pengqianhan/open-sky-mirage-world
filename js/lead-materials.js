// Shader-painted look for the six leads: no texture files, so faces stay crisp at any zoom.
// Face and hair are painted in head-local space (positionGeometry), see createLeadCharacter.
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, color, uv, positionGeometry, normalView, positionViewDirection,
  dot, mix, smoothstep, sin, abs, length, clamp, fract, atan, max
} from 'three/tsl';

const facing = () => clamp(dot(normalView, positionViewDirection), 0, 1);
const rimLight = (tint, strength, power = 3) =>
  color(tint).mul(float(1).sub(facing()).pow(power)).mul(strength);

function base(name, { roughness = .85, metalness = 0, side = THREE.FrontSide }) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness, metalness, side, vertexColors: true });
  m.name = name;
  return m;
}

/** Plain soft surface for leather, wood, metal and small accessories. */
export function softMaterial(name, tint, { roughness = .7, metalness = 0, rim = .18, rimTint = '#fff4e0' } = {}) {
  const m = base(name, { roughness, metalness });
  m.colorNode = color(tint);
  m.emissiveNode = rimLight(rimTint, rim);
  return m;
}

/**
 * Cloth: fine weave, depth gradient along the garment and an optional embroidered hem.
 * uv().y runs from the waist (0) to the hem (1) on every loft.
 */
export function fabricMaterial(name, tint, { deep = 1, rim = .2, rimTint = '#fff1dc', weave = .022, hem = null, roughness = .92, quilt = 0 } = {}) {
  const m = base(name, { roughness, side: THREE.DoubleSide });
  const v = uv().y, c = color(tint);
  m.colorNode = Fn(() => {
    const threads = sin(positionGeometry.x.mul(520)).mul(sin(positionGeometry.y.mul(520)));
    const col = mix(c, c.mul(deep), smoothstep(.15, 1, v)).mul(threads.mul(weave).add(1)).toVar();
    if (quilt) {
      // Quilted diamonds, stitched along both diagonals.
      const a = abs(fract(positionGeometry.x.add(positionGeometry.y).mul(26)).sub(.5));
      const b = abs(fract(positionGeometry.x.sub(positionGeometry.y).mul(26)).sub(.5));
      col.mulAssign(float(1).sub(smoothstep(.08, .02, a.min(b)).mul(quilt)));
    }
    if (hem) {
      const inside = smoothstep(hem.start - .006, hem.start, v);
      const span = v.sub(hem.start).div(1 - hem.start);
      col.assign(mix(col, color(hem.band), inside));
      // Row of small lozenges between two stitched lines: reads as embroidery up close.
      const du = abs(fract(uv().x.mul(hem.repeat)).sub(.5)).mul(2);
      const dv = abs(span.sub(.5)).mul(2.3);
      const lozenge = float(1).sub(smoothstep(.56, .66, du.add(dv)));
      const hole = float(1).sub(smoothstep(.16, .24, du.add(dv)));
      col.assign(mix(col, color(hem.thread), inside.mul(lozenge).mul(float(1).sub(hole))));
      const stitch = smoothstep(.1, .05, abs(span.sub(.07))).add(smoothstep(.1, .05, abs(span.sub(.93))));
      col.assign(mix(col, color(hem.thread), inside.mul(clamp(stitch, 0, 1))));
    }
    return col;
  })();
  m.emissiveNode = rimLight(rimTint, rim);
  return m;
}

/** Scalp and fringe: the anime "angel ring" highlight, jagged like real strands. */
export function hairCapMaterial(name, tint, deepTint, lightTint, ringY = .435) {
  const m = base(name, { roughness: .52 });
  const p = positionGeometry;
  m.colorNode = Fn(() => {
    const a = atan(p.x, p.z);
    const col = mix(color(deepTint), color(tint), smoothstep(.2, .52, p.y)).toVar();
    const center = float(ringY).add(sin(a.mul(4)).mul(.006));
    const scallop = sin(a.mul(26)).mul(.3).add(.7);
    const ring = smoothstep(.03, .004, abs(p.y.sub(center))).mul(scallop);
    return mix(col, color(lightTint), ring.mul(.6));
  })();
  m.emissiveNode = rimLight(lightTint, .2, 2.6);
  return m;
}

/** Hanging hair: uv().x runs root to tip, with a soft sheen band a third of the way down. */
export function hairFlowMaterial(name, tint, deepTint, lightTint) {
  const m = base(name, { roughness: .45 });
  const t = uv().x;
  m.colorNode = Fn(() => {
    const col = mix(color(tint), color(deepTint), smoothstep(.1, 1, t));
    const sheen = smoothstep(.14, .02, abs(t.sub(.3))).mul(sin(uv().y.mul(6.283)).mul(.5).add(.5));
    return mix(col, color(lightTint), sheen.mul(.5));
  })();
  m.emissiveNode = rimLight(lightTint, .2, 2.6);
  return m;
}

/** Neck, hands and ears. A little warm self-glow fakes light scattering through skin. */
export function skinMaterial(name, tint) {
  const m = base(name, { roughness: .58 });
  m.colorNode = color(tint);
  m.emissiveNode = color(tint).mul(color('#ff8a70')).mul(.06).add(rimLight('#ffd9c4', .2, 2.5));
  return m;
}

/**
 * Head skin with the whole face painted on: eyes, brows, blush, nose, mouth.
 * `layout` is in head-local metres (the chin is y=0) and `open` is the blink uniform (0..1).
 */
export function faceMaterial(name, tint, s, open) {
  const m = base(name, { roughness: .55 });
  const p = positionGeometry;
  const skin = color(tint);
  const ell = (q, rx, ry, edge = .07) =>
    float(1).sub(smoothstep(1 - edge, 1 + edge, length(q.div(vec2(rx, ry)))));
  const segment = (q, half, tilt, bend) => {
    const y = q.y.sub(q.x.mul(tilt)).add(q.x.mul(q.x).mul(bend));
    return length(vec2(max(abs(q.x).sub(half), 0), y));
  };

  m.colorNode = Fn(() => {
    const xy = vec2(p.x, p.y);
    const front = smoothstep(.02, .07, p.z);
    const col = skin.toVar();

    // Blush sits low and wide so the face reads young.
    for (const side of [-1, 1]) {
      const q = xy.sub(vec2(side * s.blushX, s.blushY));
      col.assign(mix(col, color(s.blush), ell(q, .068, .036, .9).mul(s.blushAmount)));
    }

    const lash = color(s.lash), iris = color(s.iris), irisLight = color(s.irisLight);
    for (const side of [-1, 1]) {
      const raw = xy.sub(vec2(side * s.eyeX, s.eyeY));
      // The tilt lifts outer corners: positive for sharper, cat-like eyes.
      const q = vec2(raw.x, raw.y.sub(raw.x.mul(side).mul(s.eyeTilt)));
      const ry = float(s.eyeRy).mul(open);

      const white = ell(q, s.eyeRx, ry, .08);
      col.assign(mix(col, color('#fffaf3'), white));

      // Iris nearly fills the eye; only a sliver of white shows at the corners.
      const irisRx = s.eyeRx * .9, irisRy = s.eyeRy * 1.02;
      const irisAt = q.sub(vec2(0, -.002));
      const irisMask = ell(irisAt, irisRx, irisRy, .06).mul(white);
      const irisCol = mix(iris, irisLight, smoothstep(.018, -.052, irisAt.y)).toVar();
      const edge = smoothstep(.74, 1, length(irisAt.div(vec2(irisRx, irisRy))));
      irisCol.assign(mix(irisCol, iris.mul(.4), edge.mul(.85)));
      irisCol.assign(mix(irisCol, color('#110d13'), ell(irisAt.sub(vec2(0, .006)), irisRx * .52, irisRy * .56, .16)));
      col.assign(mix(col, irisCol, irisMask));

      // Shadow cast into the eye by the upper lid.
      const lidShade = smoothstep(.3, 1, q.y.div(ry)).mul(white);
      col.assign(mix(col, vec3(.1, .08, .16), lidShade.mul(.55)));

      // Big catch-light high on one side, small one low on the other, same side on both eyes.
      const glint = ell(q.sub(vec2(-s.eyeRx * .32, s.eyeRy * .34)), s.eyeRx * .36, s.eyeRy * .3, .1).mul(white);
      col.assign(mix(col, color('#ffffff'), glint));
      const glint2 = ell(q.sub(vec2(s.eyeRx * .36, -s.eyeRy * .46)), s.eyeRx * .17, s.eyeRy * .13, .18).mul(white);
      col.assign(mix(col, color('#ffffff'), glint2.mul(.92)));

      // Upper lash: a crescent that is thick at the top and thins toward the corners.
      // Closed, it stays a soft downward-curving arc.
      const lashOuter = ell(q.sub(vec2(0, s.lashLift)), s.eyeRx + s.lashWidth * .5, ry.add(s.lashWidth), .06);
      const lashInner = ell(q.add(vec2(0, s.lashWidth * .9)), s.eyeRx * 1.02, ry, .06);
      const crescent = lashOuter.mul(float(1).sub(lashInner)).mul(smoothstep(-.002, .01, q.y));
      col.assign(mix(col, lash, crescent));

      // A short, faint lower lid.
      const lowerAt = q.add(vec2(0, s.eyeRy * 1.16));
      const lowerMask = ell(vec2(lowerAt.x, lowerAt.y), s.eyeRx * .42, .0028, .5);
      col.assign(mix(col, color(s.lowerLid), lowerMask.mul(open).mul(.55)));

      // Brow.
      const brow = xy.sub(vec2(side * s.eyeX, s.browY));
      const browQ = vec2(brow.x.mul(side), brow.y);
      const d = segment(browQ, s.browHalf, s.browTilt, s.browBend);
      col.assign(mix(col, color(s.brow), smoothstep(s.browWeight, s.browWeight * .45, d).mul(.92)));
    }

    // Tiny nose, a soft dot rather than a shape.
    col.assign(mix(col, color(s.mouth), ell(xy.sub(vec2(0, s.noseY)), .0075, .0048, .9).mul(.42)));

    // Mouth: a short upward curve.
    const mq = xy.sub(vec2(0, s.mouthY));
    const curve = mq.y.sub(mq.x.mul(mq.x).mul(s.mouthCurve));
    const md = length(vec2(max(abs(mq.x).sub(s.mouthWidth), 0), curve));
    col.assign(mix(col, color(s.mouth), smoothstep(.0052, .0024, md)));

    return mix(skin, col, front);
  })();
  m.emissiveNode = skin.mul(color('#ff8a70')).mul(.06).add(rimLight('#ffd9c4', .16, 2.8));
  return m;
}
