// Weapon trails, shock rings, palm glow and thrown needles for the lead attacks.
// Everything is a pure function of attack time, so the gallery's looping preview and the game agree.
// Meshes stay out of rig.parts: they are not body parts and must not affect framing.
import * as THREE from 'three/webgpu';
import { attribute, color, float, mix } from 'three/tsl';

const TRAIL_ROWS = 26;
const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);
const a = new THREE.Vector3(), b = new THREE.Vector3();
const remap = (v, from, to) => Math.min(Math.max((v - from) / (to - from), 0), 1);

export function fxMaterial(name, tint) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.name = name;
  m.colorNode = color(tint);
  return m;
}

function trailMaterial(name, tint) {
  const m = fxMaterial(name, tint), fade = attribute('fade', 'float');
  m.colorNode = mix(color(tint), color('#ffffff'), fade.mul(fade).mul(float(.3)));
  m.opacityNode = fade;
  return m;
}

/**
 * @param parent object the effects live under; their coordinates are the rig's group space
 * @param clip the compiled attack
 * @param pointAt (t, hand, spot, out) => out, a point on the weapon or hand at attack time t
 * @param own (geometry|material) registers a resource for rig disposal
 */
export function createAttackFx(parent, clip, pointAt, own) {
  const root = new THREE.Group();
  root.name = 'attack-fx';
  root.visible = false;
  parent.add(root);
  const add = (name, geometry, material) => {
    own(geometry); own(material);
    const m = new THREE.Mesh(geometry, material);
    m.name = name;
    m.frustumCulled = false;
    m.renderOrder = 8;
    m.scale.setScalar(0);
    root.add(m);
    return m;
  };

  const trails = (clip.trails || []).map((spec, i) => {
    const positions = new Float32Array((TRAIL_ROWS + 1) * 6), fade = new Float32Array((TRAIL_ROWS + 1) * 2), indices = [];
    for (let r = 0; r < TRAIL_ROWS; r++) {
      const v = r * 2;
      indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(positions.length).fill(0).map((_, k) => k % 3 === 1 ? 1 : 0), 3));
    geometry.setAttribute('fade', new THREE.BufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(indices);
    geometry.boundingBox = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3()); // rewritten every frame, never measured
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);
    const mesh = add(`attack-trail-${i}`, geometry, trailMaterial(`attack-trail-${i}`, spec.color));
    mesh.scale.setScalar(1);
    mesh.visible = false;
    return { spec, mesh, positions, fade, geometry };
  });

  const ringGeometry = new THREE.RingGeometry(.78, 1, 64);
  const rings = (clip.rings || []).map((spec, i) => ({ spec, mesh: add(`attack-ring-${i}`, ringGeometry, fxMaterial(`attack-ring-${i}`, spec.color)) }));

  const orbGeometry = new THREE.SphereGeometry(1, 16, 12);
  const glows = (clip.glows || []).map((spec, i) => ({ spec, mesh: add(`attack-glow-${i}`, orbGeometry, fxMaterial(`attack-glow-${i}`, spec.color)) }));

  const needles = [];
  (clip.volleys || []).forEach((spec, v) => {
    for (let k = 0; k < spec.count; k++) {
      const u = spec.count > 1 ? k / (spec.count - 1) * 2 - 1 : 0;
      const dir = new THREE.Vector3(u * spec.spread, (k % 2 ? .05 : -.03), 1).normalize();
      const mesh = add(`attack-needle-${v}-${k}`, orbGeometry, fxMaterial(`attack-needle-${v}-${k}`, spec.color));
      mesh.quaternion.setFromUnitVectors(Y, dir);
      needles.push({ spec, mesh, dir });
    }
  });

  function updateTrail({ spec, mesh, positions, fade, geometry }, t) {
    const end = spec.to + spec.life;
    mesh.visible = t > spec.from && t < end;
    if (!mesh.visible) return;
    const headT = Math.min(t, spec.to);
    const out = t > spec.to ? 1 - (t - spec.to) / spec.life : 1;
    for (let r = 0; r <= TRAIL_ROWS; r++) {
      const age = r / TRAIL_ROWS, at = Math.max(headT - spec.life * age, spec.from);
      pointAt(at, spec.hand, { dist: spec.base }, a);
      pointAt(at, spec.hand, { dist: spec.tip }, b);
      positions.set([a.x, a.y, a.z, b.x, b.y, b.z], r * 6);
      const strength = Math.pow(1 - age, 1.4) * out;
      fade[r * 2] = strength * .25;
      fade[r * 2 + 1] = strength * .9;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.fade.needsUpdate = true;
  }

  function updateRing({ spec, mesh }, t) {
    const age = (t - spec.t) / spec.life;
    mesh.visible = age >= 0 && age < 1;
    if (!mesh.visible) { mesh.scale.setScalar(0); return; }
    pointAt(spec.t, spec.at.hand, spec.at, a);
    const ease = 1 - Math.pow(1 - age, 2.4), radius = spec.radius[0] + (spec.radius[1] - spec.radius[0]) * ease;
    if (spec.axis === 'ground') {
      mesh.position.set(a.x, .02, a.z);
      mesh.rotation.set(-Math.PI / 2, 0, 0);
    } else {
      mesh.position.set(a.x, a.y, a.z + (spec.travel || 0) * ease);
      mesh.quaternion.setFromUnitVectors(Z, Z);
    }
    mesh.scale.setScalar(radius);
    mesh.material.opacity = (1 - age) * (1 - age) * .9;
  }

  function updateGlow({ spec, mesh }, t) {
    const strength = Math.sin(Math.PI * remap(t, spec.from, spec.to));
    mesh.visible = strength > .001;
    if (!mesh.visible) { mesh.scale.setScalar(0); return; }
    pointAt(t, spec.hand, {}, a);
    mesh.position.copy(a);
    mesh.scale.setScalar(spec.radius * (.55 + strength * .7));
    mesh.material.opacity = strength * .55;
  }

  function updateNeedle({ spec, mesh, dir }, t) {
    const age = (t - spec.t) / spec.life;
    mesh.visible = age >= 0 && age < 1;
    if (!mesh.visible) { mesh.scale.setScalar(0); return; }
    pointAt(spec.t, spec.from.hand, spec.from, a);
    mesh.position.copy(a).addScaledVector(dir, spec.speed * spec.life * age);
    mesh.scale.set(.008, .22, .008);
    mesh.material.opacity = 1 - age * age;
  }

  return {
    update(t) {
      root.visible = true;
      trails.forEach(item => updateTrail(item, t));
      rings.forEach(item => updateRing(item, t));
      glows.forEach(item => updateGlow(item, t));
      needles.forEach(item => updateNeedle(item, t));
    },
    hide() { root.visible = false; }
  };
}
