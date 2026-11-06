// js/iron-chain.js
// 构建连接【登州·登云崖神机飞爪台】与【空中蜃景·南天城门】的巨型悬空玄铁长索 (复刻 ep23_02 与 ep24_01)
// 包含：悬链线主钢缆、280 节交错三维玄铁锁环(InstancedMesh)、蜃景崖壁巨型四爪飞锚、途中铁索风旗与引路灵灯

import * as THREE from 'three/webgpu';
import {
  IRON_CHAIN_CONFIG,
  getChainPoint,
  getChainTangent
} from './world-config.js';
import { createIronChainMaterial } from './tsl-materials.js';
import { getSharedArchMaterials } from './architecture.js';

export function buildIronChain(scene) {
  const root = new THREE.Group();
  root.name = 'IronChainLink';

  const chainMat = createIronChainMaterial();
  const mats = getSharedArchMaterials();
  const { linkCount } = IRON_CHAIN_CONFIG;

  // ---------------------------------------------------------------------------
  // 1. 连续悬链线主铁索管体（确保在远景如 ep24_01 破晓逆光下依然清晰呈现一条横跨云海的铁索剪影）
  // ---------------------------------------------------------------------------
  const curvePoints = [];
  const curveSamples = 64;
  for (let i = 0; i <= curveSamples; i++) {
    const p = getChainPoint(i / curveSamples, 0);
    curvePoints.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  const catenaryCurve = new THREE.CatmullRomCurve3(curvePoints);
  const coreTubeGeo = new THREE.TubeGeometry(catenaryCurve, 72, 0.22, 8, false);
  const coreTubeMesh = new THREE.Mesh(coreTubeGeo, chainMat);
  coreTubeMesh.castShadow = true;
  root.add(coreTubeMesh);

  // ---------------------------------------------------------------------------
  // 2. 280 节正交咬合的巨型三维玄铁锁环 (InstancedMesh)
  // ---------------------------------------------------------------------------
  const linkGeo = new THREE.TorusGeometry(0.46, 0.13, 8, 14);
  // 拉伸成椭圆形锁环
  linkGeo.scale(0.72, 1.35, 0.72);
  const linksInstanced = new THREE.InstancedMesh(linkGeo, chainMat, linkCount);
  linksInstanced.castShadow = true;
  linksInstanced.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const upVec = new THREE.Vector3(0, 1, 0);
  const tangentVec = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const twistQuat = new THREE.Quaternion();

  function updateLinkMatrices(elapsed = 0) {
    for (let i = 0; i < linkCount; i++) {
      const t = i / (linkCount - 1);
      const pt = getChainPoint(t, elapsed);
      const tg = getChainTangent(t);

      dummy.position.set(pt.x, pt.y, pt.z);
      tangentVec.set(tg.x, tg.y, tg.z).normalize();
      quat.setFromUnitVectors(upVec, tangentVec);

      // 相邻锁环旋转 90° 互相咬合
      twistQuat.setFromAxisAngle(tangentVec, (i % 2) * (Math.PI * 0.5));
      dummy.quaternion.copy(twistQuat).multiply(quat);
      dummy.scale.setScalar(1.0);
      dummy.updateMatrix();
      linksInstanced.setMatrixAt(i, dummy.matrix);
    }
    linksInstanced.instanceMatrix.needsUpdate = true;
  }

  updateLinkMatrices(0);
  root.add(linksInstanced);

  // ---------------------------------------------------------------------------
  // 3. 铁索途中的索节卡扣、迎风招展红旗与引路风灯（复刻 ep24_01 铁索上等距分布的锚节剪影）
  // ---------------------------------------------------------------------------
  const knotCount = 12;
  const knots = [];
  const knotRingGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.55, 8);
  const flagGeo = new THREE.PlaneGeometry(1.6, 0.75);
  flagGeo.translate(0.8, 0, 0);

  for (let k = 1; k < knotCount; k++) {
    const t = k / knotCount;
    const knotGroup = new THREE.Group();
    const p = getChainPoint(t, 0);
    knotGroup.position.set(p.x, p.y, p.z);

    const collar = new THREE.Mesh(knotRingGeo, mats.bronze);
    collar.rotation.x = Math.PI * 0.25;
    knotGroup.add(collar);

    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 8, 8),
      k % 2 === 0 ? mats.goldLantern : mats.redLantern
    );
    lantern.position.y = -0.65;
    knotGroup.add(lantern);

    const pennant = new THREE.Mesh(flagGeo, mats.canopyRed);
    pennant.position.set(0.2, 0.35, 0);
    knotGroup.add(pennant);

    root.add(knotGroup);
    knots.push({ t, group: knotGroup, pennant });
  }

  // ---------------------------------------------------------------------------
  // 4. 蜃景南天门崖壁上的【巨型神机四爪飞锚】（铁索终点锚定装置）
  // ---------------------------------------------------------------------------
  const endPt = getChainPoint(1.0, 0);
  const clawGroup = new THREE.Group();
  clawGroup.position.set(endPt.x, endPt.y, endPt.z);

  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 4.2, 8), chainMat);
  shank.rotation.x = Math.PI * 0.35;
  clawGroup.add(shank);

  const prongGeo = new THREE.ConeGeometry(0.42, 3.2, 6);
  for (let c = 0; c < 4; c++) {
    const a = (c / 4) * Math.PI * 2 + Math.PI * 0.25;
    const prong = new THREE.Mesh(prongGeo, chainMat);
    prong.position.set(Math.cos(a) * 1.2, 0.4 + Math.sin(a) * 0.8, -1.1);
    prong.rotation.z = -Math.cos(a) * 0.85;
    prong.rotation.x = -0.75;
    clawGroup.add(prong);
  }
  root.add(clawGroup);

  scene.add(root);

  function update(elapsed) {
    // 铁索途中的风旗与卡扣随高空狂风摆动
    for (let i = 0; i < knots.length; i++) {
      const item = knots[i];
      const pt = getChainPoint(item.t, elapsed);
      item.group.position.set(pt.x, pt.y, pt.z);
      item.pennant.rotation.y = Math.sin(elapsed * 4.5 + i * 1.3) * 0.42;
    }
  }

  return { root, update };
}
