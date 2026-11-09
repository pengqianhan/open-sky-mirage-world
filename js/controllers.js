// js/controllers.js
// 四大探索模式控制器：
// [1] 步行侠客 (person) — 游历登州长街、登云崖石阶与空中蜃景内城广场
// [2] 策马疾驰 (horse)  — 骑乘骏马驰骋登州城门与山谷官道 (参考 ep01_06 骑马进城)
// [自动] 铁索飞渡 (chain)  — 使用神机飞爪沿悬空玄铁长索在登州与空中蜃景之间往返攀跃 (参考 ep23_02, ep24_01)
// [3] 天外来客 (flight) — 遥控一架飞碟高空总览登州、铁索与空中蜃景（不载角色）

import * as THREE from 'three/webgpu';
import {
  getWorldGroundHeight,
  getChainPoint,
  getChainTangent,
  projectOntoChain,
  CHAIN_ZONES,
  chainZoneAt,
  isTypingInField
} from './world-config.js';
import { createLeadCharacter } from './lead-characters.js';
import { getLead } from './lead-config.js';

const RIDER_SEAT_Y = 1.7; // 骑手胯部高度，略高于马鞍顶面

export class ThirdPersonControllerManager {
  constructor(scene, colliders = [], callbacks = {}) {
    this.scene = scene;
    this.colliders = colliders;
    this.callbacks = callbacks;
    this.activeCharacter = 'caosheng';
    this.inputPaused = false;
    this.attackQueued = false; // a tap shorter than a frame must still land
    this.chainArmed = true;
    this.activeMode = 'person'; // 'person' | 'horse' | 'chain' | 'flight'

    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false,
      sprint: false,
      attack: false
    };

    this.entities = {
      person: this.createPersonEntity(),
      horse: this.createHorseEntity(),
      chain: this.createChainEntity(),
      flight: this.createFlightEntity()
    };

    // 默认出生在登州南城门内朱雀长街北望处（抬头可见双望楼与高空蜃景，复刻 ep01_08）
    const startX = 0;
    const startZ = 126;
    const startY = getWorldGroundHeight(startX, startZ, 0);
    for (const ent of Object.values(this.entities)) {
      ent.position.set(startX, startY, startZ);
      ent.heading = Math.PI; // 面向正北 (-Z)，直视长街与空中蜃景
      ent.mesh.position.copy(ent.position);
      ent.mesh.rotation.y = ent.heading;
      this.scene.add(ent.mesh);
    }

    this.updateVisibility();
    this.bindKeyboard();
  }

  createPersonEntity(id = this.activeCharacter) {
    const char = createLeadCharacter(id);

    const group = new THREE.Group();
    group.add(char.group);
    return {
      type: 'person',
      label: '捉刀侠客 · 步行轻功',
      mesh: group,
      charRig: char,
      position: new THREE.Vector3(),
      heading: Math.PI,
      speed: 0,
      verticalVel: 0,
      onGround: true,
      walkPhase: 0,
      // Q 版角色更矮：镜头拉近压低，让全身留在 HUD 之上
      chaseDistance: 5.6,
      chaseHeight: 2.1,
      cameraTargetOffset: new THREE.Vector3(0, 0.5, 0)
    };
  }

  createHorseEntity() {
    const group = new THREE.Group();
    const coatMat = new THREE.MeshStandardNodeMaterial({ color: 0x59311c, roughness: 0.65 });
    const maneMat = new THREE.MeshStandardNodeMaterial({ color: 0x1a120d, roughness: 0.75 });
    const saddleMat = new THREE.MeshStandardNodeMaterial({ color: 0x7c221c, roughness: 0.55 });

    // 马身躯干
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.72, 1.75), coatMat);
    body.position.set(0, 1.15, 0);
    body.castShadow = true;
    group.add(body);

    // 马鞍
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.68), saddleMat);
    saddle.position.set(0, 1.54, 0.05);
    group.add(saddle);

    // 马颈与马头
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.78, 0.42), coatMat);
    neck.position.set(0, 1.62, 0.76);
    neck.rotation.x = 0.42;
    group.add(neck);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.32, 0.58), coatMat);
    head.position.set(0, 1.92, 1.06);
    head.rotation.x = 0.35;
    group.add(head);

    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 0.75, 6), maneMat);
    tail.position.set(0, 1.05, -0.96);
    tail.rotation.x = -0.35;
    group.add(tail);

    // 四条马腿
    const legs = [];
    const legGeo = new THREE.BoxGeometry(0.16, 0.85, 0.16);
    legGeo.translate(0, -0.42, 0);
    for (const [lx, lz] of [[-0.22, 0.65], [0.22, 0.65], [-0.22, -0.65], [0.22, -0.65]]) {
      const leg = new THREE.Mesh(legGeo, coatMat);
      leg.position.set(lx, 0.85, lz);
      leg.castShadow = true;
      group.add(leg);
      legs.push(leg);
    }

    // 马上骑手 (参考 ep01_06 红衣/白衣骑手)
    const rider = createLeadCharacter(this.activeCharacter);
    rider.group.position.set(0, RIDER_SEAT_Y - rider.metrics.seatY, 0.02);
    rider.pose('ride', 0, 0, 1);
    group.add(rider.group);

    return {
      type: 'horse',
      label: '登州骏马 · 策马疾驰',
      mesh: group,
      legs,
      charRig: rider,
      position: new THREE.Vector3(),
      heading: Math.PI,
      speed: 0,
      verticalVel: 0,
      stridePhase: 0,
      chaseDistance: 7.5,
      chaseHeight: 2.9,
      cameraTargetOffset: new THREE.Vector3(0, 2.0, 0)
    };
  }

  createChainEntity() {
    const group = new THREE.Group();
    const char = createLeadCharacter(this.activeCharacter);
    // 角色悬垂于铁索滑轮下方 (复刻 ep23_02 顺铁索攀爬飞渡姿态)
    char.group.position.set(0, -char.metrics.chainHang, 0);
    char.pose('chain', 0, 0, 1);
    group.add(char.group);

    const goldMat = new THREE.MeshStandardNodeMaterial({
      color: 0xe6b450,
      roughness: 0.25,
      metalness: 0.88
    });
    const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 8, 16), goldMat);
    pulley.rotation.y = Math.PI * 0.5;
    group.add(pulley);

    return {
      type: 'chain',
      label: '神机飞爪 · 铁索凌云',
      mesh: group,
      charRig: char,
      position: new THREE.Vector3(),
      heading: Math.PI,
      speed: 0,
      chainT: 0.06,
      travelDir: 1, // W 朝哪头走：1 往蜃景，-1 往登州
      returnMode: 'person', // 下索后变回上索前的样子（步行或骑马）
      chaseDistance: 8.2,
      chaseHeight: 2.2,
      cameraTargetOffset: new THREE.Vector3(0, -0.4, 0)
    };
  }

  /** 天外来客：一架无人驾驶的飞碟，玩家遥控它在高空总览整个世界（不载任何角色） */
  createFlightEntity() {
    const group = new THREE.Group();
    const hullMat = new THREE.MeshStandardNodeMaterial({ color: 0x9aa6b4, metalness: 0.85, roughness: 0.28 });
    const trimMat = new THREE.MeshStandardNodeMaterial({ color: 0x3b4452, metalness: 0.7, roughness: 0.4 });
    const domeMat = new THREE.MeshStandardNodeMaterial({
      color: 0x8fe8ff, emissive: 0x1d7d99, emissiveIntensity: 0.9,
      roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.72
    });
    const lightMat = new THREE.MeshStandardNodeMaterial({ color: 0xfff1b0, emissive: 0xffc35a, emissiveIntensity: 2.6 });
    const beamMat = new THREE.MeshBasicNodeMaterial({
      color: 0x9ff6ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide
    });

    const saucer = new THREE.Group();
    saucer.position.y = 1.2;
    group.add(saucer);

    // 碟身：上下两片扁圆壳 + 中间一圈外缘
    const disc = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0.0, -0.55), new THREE.Vector2(1.4, -0.42), new THREE.Vector2(3.1, -0.12),
      new THREE.Vector2(3.4, 0.0), new THREE.Vector2(3.1, 0.14), new THREE.Vector2(1.7, 0.5), new THREE.Vector2(0.0, 0.62)
    ], 40), hullMat);
    disc.castShadow = true;
    saucer.add(disc);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.09, 8, 48), trimMat);
    rim.rotation.x = Math.PI / 2;
    saucer.add(rim);

    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.25, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.position.y = 0.5;
    saucer.add(dome);

    // 外缘一圈旋转的航灯
    const lights = new THREE.Group();
    const bulbGeo = new THREE.SphereGeometry(0.13, 10, 8);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const bulb = new THREE.Mesh(bulbGeo, lightMat);
      bulb.position.set(Math.cos(a) * 3.05, -0.08, Math.sin(a) * 3.05);
      lights.add(bulb);
    }
    saucer.add(lights);

    // 腹部光环与淡淡的牵引光柱
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.18, 24), lightMat);
    core.position.y = -0.52;
    saucer.add(core);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, 9, 28, 1, true), beamMat);
    beam.position.y = -5.0;
    saucer.add(beam);

    return {
      type: 'flight',
      label: '天外来客 · 飞碟总览',
      mesh: group,
      saucer,
      lights,
      beam,
      charRig: null, // 飞碟上没有角色
      position: new THREE.Vector3(),
      heading: Math.PI,
      speed: 0,
      verticalVel: 0,
      bankAngle: 0,
      pitchAngle: 0,
      // 镜头拉远拉高，便于总览
      chaseDistance: 26.0,
      chaseHeight: 11.0,
      cameraTargetOffset: new THREE.Vector3(0, 0, 0)
    };
  }

  setCharacter(id) {
    const config = getLead(id);
    if (config.id === this.activeCharacter) return;
    for (const ent of Object.values(this.entities)) ent.attack = null;
    const riders = Object.entries(this.entities).filter(([, ent]) => ent.charRig);
    // Create before swapping so failure preserves all currently usable entities.
    const next = riders.map(() => createLeadCharacter(config.id));
    riders.forEach(([mode, ent], i) => {
      ent.charRig.dispose();
      ent.charRig = next[i];
      ent.mesh.add(next[i].group);
      if (mode === 'horse') next[i].group.position.set(0, RIDER_SEAT_Y - next[i].metrics.seatY, .02);
      if (mode === 'chain') next[i].group.position.set(0, -next[i].metrics.chainHang, 0);
      next[i].pose(({horse:'ride',chain:'chain'})[mode] || 'idle', 0, 0, 1);
    });
    this.activeCharacter = config.id;
  }

  /** 接管同伴：只交换步行身体，不重建模型；骑马、铁索、飞行的模型等真正用到时再造，切人不卡顿。 */
  takeBody(actor) {
    const person = this.entities.person, rig = person.charRig;
    const at = person.position.clone(), heading = person.heading, speed = person.speed;
    person.charRig = actor.charRig;
    actor.charRig = rig;
    person.mesh.add(person.charRig.group);
    actor.mesh.add(actor.charRig.group);
    person.position.copy(actor.position);
    person.heading = actor.heading;
    person.speed = actor.speed;
    person.verticalVel = actor.verticalVel;
    person.onGround = actor.onGround;
    person.attack = null;
    actor.position.copy(at);
    actor.heading = heading;
    actor.speed = speed;
    actor.verticalVel = 0;
    actor.onGround = true;
    actor.attack = null;
    person.mesh.position.copy(person.position);
    person.mesh.rotation.set(0, person.heading, 0);
    actor.mesh.position.copy(actor.position);
    actor.mesh.rotation.set(0, actor.heading, 0);
    this.activeCharacter = person.charRig.config.id;
    this.attackQueued = false;
    this.chainArmed = false;
  }

  /** 骑马、铁索的骑手模型跟不上当前主角时，换成当前主角 */
  ensureRig(mode) {
    const ent = this.entities[mode];
    if (!ent || !ent.charRig || ent.charRig.config.id === this.activeCharacter) return;
    const rig = createLeadCharacter(this.activeCharacter);
    ent.charRig.dispose();
    ent.charRig = rig;
    ent.mesh.add(rig.group);
    if (mode === 'horse') rig.group.position.set(0, RIDER_SEAT_Y - rig.metrics.seatY, .02);
    if (mode === 'chain') rig.group.position.set(0, -rig.metrics.chainHang, 0);
    rig.pose(({horse:'ride',chain:'chain'})[mode] || 'idle', 0, 0, 1);
  }

  updateVisibility() {
    for (const [mode, ent] of Object.entries(this.entities)) {
      ent.mesh.visible = (mode === this.activeMode);
    }
  }

  /** 走到铁索下面自动挂上去；刚落地或刚传送进来的人要先走出这片区域才会再次触发 */
  checkChainBoarding(ent) {
    const zone = chainZoneAt(ent.position.x, ent.position.y, ent.position.z);
    if (!zone) { this.chainArmed = true; return; }
    if (!this.chainArmed || Math.abs(ent.speed) < .5) return;
    // 倒退着走进来时按住的是 S：让 S 继续朝另一头走，免得在索头来回抽搐
    const backing = ent.speed < 0;
    this.setMode('chain', zone);
    if (backing) this.getActiveEntity().travelDir = -zone.dir;
    this.callbacks.onModeAuto?.('chain', zone);
  }

  setMode(newMode, board = null) {
    if (!this.entities[newMode]) return;
    this.ensureRig(newMode);
    const prevEnt = this.getActiveEntity();
    const nextEnt = this.entities[newMode];
    prevEnt.attack = null;
    this.chainArmed = false;

    if (newMode === 'chain') {
      if (this.activeMode === 'person' || this.activeMode === 'horse') nextEnt.returnMode = this.activeMode;
      nextEnt.travelDir = 1;
      // 切换到【铁索飞渡】时：若已在铁索附近则就近挂索；若在地面则从登云崖起点出发；若在蜃景则从南天门起点下行
      const proj = projectOntoChain(prevEnt.position.x, prevEnt.position.y, prevEnt.position.z);
      if (board) {
        nextEnt.chainT = board.t;
        nextEnt.travelDir = board.dir;
      } else if (proj.distance < 35) {
        nextEnt.chainT = Math.max(0.02, Math.min(0.98, proj.t));
      } else if (prevEnt.position.y > 180) {
        nextEnt.chainT = 0.94;
        nextEnt.travelDir = -1;
      } else {
        nextEnt.chainT = 0.04;
      }
      const pt = getChainPoint(nextEnt.chainT);
      nextEnt.position.set(pt.x, pt.y, pt.z);
      nextEnt.heading = Math.PI;
      nextEnt.speed = 0;
    } else if (this.activeMode !== newMode) {
      // 从铁索或飞行切回步行/骑马时，若靠近铁索两端则落回对应平台，否则在当前位置落地
      nextEnt.position.copy(prevEnt.position);
      nextEnt.heading = prevEnt.heading;
      if (newMode === 'person' || newMode === 'horse') {
        if (this.activeMode === 'chain') {
          // 上端落在飞爪之后的城门洞里，下端落在飞爪台石台脚下
          const { exit } = CHAIN_ZONES.find((c) => c.id === (prevEnt.chainT > 0.5 ? 'high' : 'low'));
          nextEnt.position.set(exit.x, getWorldGroundHeight(exit.x, exit.z, exit.y), exit.z);
          nextEnt.heading = exit.heading;
          nextEnt.speed = 0;
        } else {
          const groundY = getWorldGroundHeight(nextEnt.position.x, nextEnt.position.z, nextEnt.position.y);
          nextEnt.position.y = groundY;
        }
      } else if (newMode === 'flight') {
        nextEnt.position.y = Math.max(prevEnt.position.y + 30.0, 70.0);
        nextEnt.speed = 0;
        nextEnt.verticalVel = 0;
      }
    }

    this.activeMode = newMode;
    nextEnt.mesh.position.copy(nextEnt.position);
    nextEnt.mesh.rotation.set(0, nextEnt.heading, 0);
    this.updateVisibility();
  }

  getActiveEntity() {
    return this.entities[this.activeMode];
  }

  teleportActiveTo(x, z, heading = Math.PI, explicitY = null, targetMode = null, chainT = null) {
    if (targetMode && this.entities[targetMode]) {
      this.ensureRig(targetMode);
      this.activeMode = targetMode;
      this.updateVisibility();
    }
    this.chainArmed = false;
    const ent = this.getActiveEntity();
    if (this.activeMode === 'chain') {
      ent.travelDir = 1;
      ent.chainT = chainT !== null ? chainT : 0.45;
      const pt = getChainPoint(ent.chainT);
      ent.position.set(pt.x, pt.y, pt.z);
    } else {
      const y = explicitY !== null ? explicitY : getWorldGroundHeight(x, z, explicitY ?? 0);
      ent.position.set(x, y, z);
    }
    ent.heading = heading;
    ent.speed = 0;
    ent.verticalVel = 0;
    ent.attack = null;
    const action = ({horse:'ride',chain:'chain'})[this.activeMode] || 'idle';
    ent.charRig?.pose(action, 0, 0, 1);
    ent.mesh.position.copy(ent.position);
    ent.mesh.rotation.set(0, ent.heading, 0);
    return ent.position;
  }

  resetInput() {
    this.attackQueued = false;
    for (const k of Object.keys(this.keys)) {
      this.keys[k] = false;
    }
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (this.inputPaused || isTypingInField(e)) return;
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = true;
          break;
        case 'Space':
        case 'KeyE':
          this.keys.up = true;
          break;
        case 'KeyQ':
        case 'KeyC':
          this.keys.down = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = true;
          break;
        case 'KeyF':
        case 'KeyJ':
          this.keys.attack = true;
          if (!e.repeat) this.attackQueued = true;
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = false;
          break;
        case 'Space':
        case 'KeyE':
          this.keys.up = false;
          break;
        case 'KeyQ':
        case 'KeyC':
          this.keys.down = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.sprint = false;
          break;
        case 'KeyF':
        case 'KeyJ':
          this.keys.attack = false;
          break;
      }
    });

    window.addEventListener('blur', () => this.resetInput());
  }

  resolveHorizontalCollisions(x, y, z, radius = 0.85) {
    let rx = x;
    let rz = z;
    for (const c of this.colliders) {
      if (y + 1.8 < c.minY || y > c.maxY) continue;
      if (rx + radius <= c.minX || rx - radius >= c.maxX || rz + radius <= c.minZ || rz - radius >= c.maxZ) continue;

      const overlapLeft = (rx + radius) - c.minX;
      const overlapRight = c.maxX - (rx - radius);
      const overlapTop = (rz + radius) - c.minZ;
      const overlapBottom = c.maxZ - (rz - radius);
      const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

      if (minOverlap === overlapLeft) rx = c.minX - radius;
      else if (minOverlap === overlapRight) rx = c.maxX + radius;
      else if (minOverlap === overlapTop) rz = c.minZ - radius;
      else rz = c.maxZ + radius;
    }
    return { x: rx, z: rz };
  }

  /** Foot-mode attacks: hold to repeat; the feet plant until cancelAt, then movement can break the follow-through. */
  updateAttack(ent, dt, input = this.keys) {
    const { attack: held, forward, backward, left, right, up } = input;
    const timing = ent.charRig.attack;
    const isPlayer = input === this.keys;
    if (isPlayer && !ent.onGround) this.attackQueued = false;
    if ((held || (isPlayer && this.attackQueued)) && ent.onGround && (!ent.attack || ent.attack.time >= timing.cancelAt)) {
      ent.attack = { time: 0, struck: false, echoed: false };
      if (isPlayer) this.attackQueued = false;
    } else if (ent.attack) {
      ent.attack.time += dt;
      const free = ent.attack.time >= timing.cancelAt;
      if (ent.attack.time >= timing.duration || (free && (forward || backward || left || right || up))) ent.attack = null;
    }
    if (!ent.attack) return false;
    // 蓄势时自动转向最近的敌人：转向键在出招时是锁住的，否则绕到身后的敌人永远打不到
    if (!ent.attack.struck) {
      const aim = this.callbacks.onAttackAim?.(ent, timing.hit);
      if (aim != null) {
        const delta = Math.atan2(Math.sin(aim - ent.heading), Math.cos(aim - ent.heading));
        ent.heading += ent.attack.time >= timing.strike ? delta : delta * Math.min(1, dt * 16);
      }
    }
    if (!ent.attack.struck && ent.attack.time >= timing.strike) {
      ent.attack.struck = true;
      this.callbacks.onAttackSound?.(timing.sound, ent);
      this.callbacks.onAttackHit?.(ent, timing.hit);
    }
    if (timing.second && !ent.attack.echoed && ent.attack.time >= timing.second.t) {
      ent.attack.echoed = true;
      this.callbacks.onAttackSound?.(timing.second, ent);
      this.callbacks.onAttackHit?.(ent, timing.hit);
    }
    return ent.attack.time < timing.cancelAt;
  }

  /**
   * 一个人一帧的步行与出招。键盘和 AI 走同一段代码，手感和判定才不会分叉。
   * input: { forward, backward, left, right, up, sprint, attack, faceHeading? }，
   * faceHeading 是 AI 用的：直接给想朝的方向，比模拟按住 A/D 转得快。
   * 返回本帧是否真的在疾奔（出招锁步时为 false）。
   */
  stepPerson(ent, input, dt) {
    let { forward, backward, left, right, up, sprint } = input;
    if (this.updateAttack(ent, dt, input)) forward = backward = left = right = up = sprint = false;
    const turnRate = 2.4;
    if (left) ent.heading += turnRate * dt;
    if (right) ent.heading -= turnRate * dt;
    if (input.faceHeading != null && !ent.attack) {
      const delta = Math.atan2(Math.sin(input.faceHeading - ent.heading), Math.cos(input.faceHeading - ent.heading));
      ent.heading += delta * Math.min(1, dt * 9);
    }

    const maxSpeed = sprint ? 14.5 : 8.5;
    const targetSpeed = forward ? maxSpeed : backward ? -maxSpeed * 0.6 : 0;
    ent.speed += (targetSpeed - ent.speed) * Math.min(1, dt * 10);

    const prevGroundY = getWorldGroundHeight(ent.position.x, ent.position.z, ent.position.y);
    const nextX = ent.position.x + Math.sin(ent.heading) * ent.speed * dt;
    const nextZ = ent.position.z + Math.cos(ent.heading) * ent.speed * dt;
    const resolved = this.resolveHorizontalCollisions(nextX, ent.position.y, nextZ, 0.65);
    const moveDist = Math.hypot(resolved.x - ent.position.x, resolved.z - ent.position.z);
    ent.position.x = resolved.x;
    ent.position.z = resolved.z;
    ent.movedLastStep = moveDist;

    const groundY = getWorldGroundHeight(ent.position.x, ent.position.z, ent.position.y);
    if (up && ent.onGround) {
      ent.verticalVel = 9.5; // 武侠轻功纵跃
      ent.onGround = false;
    }

    if (ent.onGround && !up && groundY >= ent.position.y - 0.65) {
      // 在平地或拾级上下 24 级雕花石阶时保持靴底平稳贴合踏面，消除下台阶悬空弹跳与上台阶卡顿
      ent.position.y += (groundY - ent.position.y) * Math.min(1, dt * 28.0);
      if (groundY > ent.position.y || Math.abs(groundY - ent.position.y) < 0.015) {
        ent.position.y = groundY;
      }
      ent.verticalVel = 0;
    } else {
      ent.verticalVel -= 22.0 * dt;
      ent.position.y += ent.verticalVel * dt;

      if (ent.position.y <= groundY) {
        ent.position.y = groundY;
        ent.verticalVel = 0;
        ent.onGround = true;
      }
    }

    const rawSlope = moveDist > 0.0005 ? (groundY - prevGroundY) / moveDist : 0;
    const climbFactor = Math.max(-1, Math.min(1, rawSlope * 1.8));
    if (Math.abs(ent.speed) > 0.2) {
      ent.walkPhase += Math.abs(ent.speed) * dt * (2.6 + Math.abs(climbFactor) * 0.45);
    }
    return !!sprint;
  }

  /** 步行动作：攻击 > 跑 > 走 > 站 */
  posePerson(ent, sprint, dt, elapsed) {
    const action = ent.attack ? 'attack' : Math.abs(ent.speed) > .2 ? (sprint ? 'run' : 'walk') : 'idle';
    const poseTime = action === 'attack' ? ent.attack.time : action === 'walk' ? ent.walkPhase / 6 : action === 'run' ? ent.walkPhase / 10 : elapsed;
    ent.charRig.pose(action, poseTime, Math.abs(ent.speed), dt);
    ent.mesh.position.copy(ent.position);
    ent.mesh.rotation.set(0, ent.heading, 0);
  }

  update(dt, elapsed) {
    if (this.activeMode === 'person' || this.activeMode === 'horse') this.checkChainBoarding(this.getActiveEntity());
    const ent = this.getActiveEntity();
    let { forward, backward, left, right, up, sprint } = this.keys;
    const { down } = this.keys;
    if (this.activeMode !== 'person') this.attackQueued = false;

    if (this.activeMode === 'person') {
      sprint = this.stepPerson(ent, this.keys, dt);
    } else if (this.activeMode === 'horse') {
      const turnRate = 2.1;
      if (left) ent.heading += turnRate * dt;
      if (right) ent.heading -= turnRate * dt;

      const maxSpeed = sprint ? 26.0 : 18.5;
      const targetSpeed = forward ? maxSpeed : backward ? -7.0 : 0;
      ent.speed += (targetSpeed - ent.speed) * Math.min(1, dt * 6.5);

      const nextX = ent.position.x + Math.sin(ent.heading) * ent.speed * dt;
      const nextZ = ent.position.z + Math.cos(ent.heading) * ent.speed * dt;
      const resolved = this.resolveHorizontalCollisions(nextX, ent.position.y, nextZ, 1.1);
      ent.position.x = resolved.x;
      ent.position.z = resolved.z;
      ent.position.y = getWorldGroundHeight(ent.position.x, ent.position.z, ent.position.y);

      if (Math.abs(ent.speed) > 0.3) {
        ent.stridePhase += Math.abs(ent.speed) * dt * 1.9;
        const s = Math.sin(ent.stridePhase) * 0.65;
        ent.legs[0].rotation.x = s;
        ent.legs[1].rotation.x = -s;
        ent.legs[2].rotation.x = -s;
        ent.legs[3].rotation.x = s;
      }
    } else if (this.activeMode === 'chain') {
      // 【铁索飞渡】：沿连接登州登云崖与空中蜃景的玄铁长索高速攀跃
      const chainTotalLength = 212.0;
      let inputDir = 0;
      if (forward) inputDir = ent.travelDir;
      else if (backward) inputDir = -ent.travelDir;

      const boost = (sprint || up) ? 1.65 : 1.0;
      const targetSpeed = inputDir !== 0 ? inputDir * 24.0 * boost : 0;
      ent.speed += (targetSpeed - ent.speed) * Math.min(1, dt * 7.5);

      ent.chainT += (ent.speed * dt) / chainTotalLength;
      // 走到头就自动落地，变回上索前的样子
      if (ent.chainT >= 1.0 || ent.chainT <= 0.0) {
        ent.chainT = Math.min(1, Math.max(0, ent.chainT));
        ent.speed = 0;
        this.setMode(ent.returnMode);
        // 按着 S 落地就调个头，S 才是继续走开，不会倒退回去又挂上铁索
        if (backward) this.getActiveEntity().heading += Math.PI;
        this.callbacks.onModeAuto?.(ent.returnMode, null);
        return;
      }

      const pt = getChainPoint(ent.chainT, elapsed);
      const tg = getChainTangent(ent.chainT);
      ent.position.set(pt.x, pt.y, pt.z);
      ent.heading = Math.atan2(tg.x, tg.z) + (ent.travelDir < 0 ? Math.PI : 0);

    } else if (this.activeMode === 'flight') {
      // 【天外来客】：遥控飞碟在高空自由飞行，总览全图
      const turnRate = 1.7;
      if (left) ent.heading += turnRate * dt;
      if (right) ent.heading -= turnRate * dt;

      const maxSpeed = sprint ? 90.0 : 50.0;
      const targetSpeed = forward ? maxSpeed : backward ? -24.0 : 0;
      ent.speed += (targetSpeed - ent.speed) * Math.min(1, dt * 3.0);

      const climbTarget = up ? 28.0 : down ? -28.0 : 0;
      ent.verticalVel += (climbTarget - ent.verticalVel) * Math.min(1, dt * 4.0);

      ent.position.x += Math.sin(ent.heading) * ent.speed * dt;
      ent.position.z += Math.cos(ent.heading) * ent.speed * dt;
      ent.position.y = Math.min(ent.position.y + ent.verticalVel * dt, 620);

      const minGround = getWorldGroundHeight(ent.position.x, ent.position.z, ent.position.y) + 4.0;
      if (ent.position.y < minGround) {
        ent.position.y = minGround;
        ent.verticalVel = Math.max(0, ent.verticalVel);
      }

      const targetBank = (left ? 0.28 : right ? -0.28 : 0);
      ent.bankAngle += (targetBank - ent.bankAngle) * Math.min(1, dt * 4.0);
      const targetPitch = Math.max(-0.18, Math.min(0.18, ent.speed / maxSpeed * 0.16));
      ent.pitchAngle += (targetPitch - ent.pitchAngle) * Math.min(1, dt * 3.0);

      // 碟身悬浮起伏、航灯环旋转、光柱呼吸
      ent.lights.rotation.y += dt * 2.4;
      ent.saucer.position.y = 1.2 + Math.sin(elapsed * 1.6) * 0.25;
      ent.saucer.rotation.set(ent.pitchAngle, 0, ent.bankAngle);
      ent.beam.material.opacity = 0.08 + (Math.sin(elapsed * 3.1) * 0.5 + 0.5) * 0.08;
      ent.mesh.position.copy(ent.position);
      ent.mesh.rotation.set(0, ent.heading, 0);
      return;
    }

    if (this.activeMode === 'person') {
      this.posePerson(ent, sprint, dt, elapsed);
      return;
    }
    const action = ({horse:'ride',chain:'chain'})[this.activeMode];
    ent.charRig.pose(action, elapsed, Math.abs(ent.speed), dt);
    ent.mesh.position.copy(ent.position);
    ent.mesh.rotation.set(0, ent.heading, 0);
  }
}
