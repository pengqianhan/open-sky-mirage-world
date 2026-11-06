// js/pedestrians.js
// 登州城街市百姓、商贩与空中蜃景内廷甲士人群系统（复刻 ep01_08, ep01_10 闹市行人与 ep23_05 蜃景广场列阵甲士）

import * as THREE from 'three/webgpu';
import { getTerrainHeight, MIRAGE_CONFIG } from './world-config.js';

/**
 * 构建古装侠客/百姓角色模型（支持四肢行走摆动与背负长剑）
 */
export function createAncientCharacterMesh(options = {}) {
  const {
    robeColor = 0x222730,
    innerColor = 0xdce0e6,
    hasSword = true,
    hasHat = false
  } = options;

  const group = new THREE.Group();

  const robeMat = new THREE.MeshStandardNodeMaterial({ color: robeColor, roughness: 0.75 });
  const innerMat = new THREE.MeshStandardNodeMaterial({ color: innerColor, roughness: 0.70 });
  const skinMat = new THREE.MeshStandardNodeMaterial({ color: 0xe2b99b, roughness: 0.65 });
  const hairMat = new THREE.MeshStandardNodeMaterial({ color: 0x141416, roughness: 0.55 });
  const goldMat = new THREE.MeshStandardNodeMaterial({ color: 0xd9a848, roughness: 0.30, metalness: 0.85 });

  // 躯干衣袍 (参考 ep23_05 黑白交领侠客劲装)
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.88, 8), robeMat);
  torso.position.y = 1.06;
  torso.castShadow = true;
  group.add(torso);

  // 左半幅白袖披肩装饰 (复刻 ep23_05 主角半白半黑衣袍)
  if (hasSword) {
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.84, 0.32), innerMat);
    sash.position.set(-0.11, 1.07, 0.01);
    group.add(sash);
  }

  // 头部与发髻
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), skinMat);
  head.position.y = 1.64;
  head.castShadow = true;
  group.add(head);

  const bun = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.14, 8), hairMat);
  bun.position.set(0, 1.82, -0.02);
  group.add(bun);

  if (hasHat) {
    // 斗笠 (参考 ep02_03 斗笠人特写)
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.18, 12), hairMat);
    hat.position.y = 1.80;
    group.add(hat);
  }

  // 双臂与双腿关节点
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.27, 1.42, 0);
  const leftArmMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.08, 0.56, 7),
    hasSword ? innerMat : robeMat
  );
  leftArmMesh.position.y = -0.24;
  leftArm.add(leftArmMesh);
  group.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.27, 1.42, 0);
  const rightArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.08, 0.56, 7), robeMat);
  rightArmMesh.position.y = -0.24;
  rightArm.add(rightArmMesh);
  group.add(rightArm);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.11, 0.65, 0);
  const leftLegMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.065, 0.64, 7), robeMat);
  leftLegMesh.position.y = -0.32;
  leftLeg.add(leftLegMesh);
  group.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.11, 0.65, 0);
  const rightLegMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.065, 0.64, 7), robeMat);
  rightLegMesh.position.y = -0.32;
  rightLeg.add(rightLegMesh);
  group.add(rightLeg);

  // 背部斜挎鎏金长剑或长枪 (复刻 ep23_05 背影)
  if (hasSword) {
    const weapon = new THREE.Group();
    weapon.position.set(0.02, 1.18, -0.19);
    weapon.rotation.z = -0.68;

    const scabbard = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.024, 1.45, 6), hairMat);
    weapon.add(scabbard);

    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.035, 0.28, 8), goldMat);
    hilt.position.y = 0.65;
    weapon.add(hilt);

    group.add(weapon);
  }

  return {
    group,
    animateWalk(phase, amplitude = 0.55, climbFactor = 0) {
      const climbBoost = 1.0 + Math.abs(climbFactor) * 0.35;
      const s = Math.sin(phase) * amplitude * climbBoost;
      leftLeg.rotation.x = s;
      rightLeg.rotation.x = -s;
      const liftScale = 0.04 + Math.abs(climbFactor) * 0.16;
      leftLeg.position.y = 0.65 + Math.max(0, -Math.sin(phase)) * liftScale;
      rightLeg.position.y = 0.65 + Math.max(0, Math.sin(phase)) * liftScale;
      leftArm.rotation.x = -s * 0.78;
      rightArm.rotation.x = s * 0.78;
      torso.position.y = 1.06 + Math.abs(Math.cos(phase)) * 0.035 * amplitude;
      torso.rotation.x = climbFactor * 0.12;
    }
  };
}

/**
 * 创建登州街市巡游行人与空中蜃景广场守卫系统
 */
export function createPedestrianSystem(scene) {
  const group = new THREE.Group();
  group.name = 'PedestrianCrowd';

  const palette = [
    0x3b4958, 0x5c3a2e, 0x2e473b, 0x6b2d28, 0x4d463e, 0x736454
  ];

  const walkers = [];

  // 1. 登州朱雀长街、桃花闹市与鼓楼横街的往来古装行人 (36 人)
  const routes = [
    { x0: -4.5, z0: 155, x1: -4.5, z1: -95 },
    { x0: 4.5,  z0: -95, x1: 4.5,  z1: 155 },
    { x0: 20,   z0: 54,  x1: 112,  z1: 54 },
    { x0: 112,  z0: 58,  x1: 20,   z1: 58 },
    { x0: -110, z0: 3.5, x1: 110,  z1: 3.5 },
    { x0: 110,  z0: -3.5, x1: -110, z1: -3.5 }
  ];

  for (let i = 0; i < 36; i++) {
    const r = routes[i % routes.length];
    const t = (i / 36 + (i % 7) * 0.13) % 1.0;
    const char = createAncientCharacterMesh({
      robeColor: palette[i % palette.length],
      innerColor: 0xd8d2c5,
      hasSword: i % 5 === 0,
      hasHat: i % 4 === 0
    });

    const x = r.x0 + (r.x1 - r.x0) * t;
    const z = r.z0 + (r.z1 - r.z0) * t;
    const heading = Math.atan2(r.x1 - r.x0, r.z1 - r.z0);
    char.group.position.set(x, getTerrainHeight(x, z), z);
    char.group.rotation.y = heading;
    group.add(char.group);

    walkers.push({
      char,
      route: r,
      t,
      speed: 1.45 + (i % 5) * 0.22,
      len: Math.hypot(r.x1 - r.x0, r.z1 - r.z0),
      phase: i * 1.7
    });
  }

  // 2. 空中蜃景内城广场中轴列阵玄甲武士 (复刻 ep23_05 广场远景两列黑衣守卫)
  for (let row = 0; row < 6; row++) {
    for (const side of [-1, 1]) {
      const guard = createAncientCharacterMesh({
        robeColor: 0x161920,
        innerColor: 0x38424d,
        hasSword: true,
        hasHat: false
      });
      const gx = MIRAGE_CONFIG.centerX + side * 4.2;
      const gz = MIRAGE_CONFIG.centerZ + 22 - row * 5.2;
      guard.group.position.set(gx, MIRAGE_CONFIG.baseY, gz);
      guard.group.rotation.y = side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
      group.add(guard.group);
    }
  }

  scene.add(group);

  function update(dt, elapsed) {
    for (const w of walkers) {
      w.t += (w.speed * dt) / w.len;
      if (w.t > 1.0) w.t -= 1.0;
      const x = w.route.x0 + (w.route.x1 - w.route.x0) * w.t;
      const z = w.route.z0 + (w.route.z1 - w.route.z0) * w.t;
      w.char.group.position.set(x, getTerrainHeight(x, z), z);
      w.char.animateWalk(elapsed * w.speed * 3.8 + w.phase, 0.48);
    }
  }

  return { group, update };
}
