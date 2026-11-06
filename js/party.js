// js/party.js
// 群像模式：玩家操控一人，其余每人一个 Actor + Brain。切人就是把键盘交给另一个身体。
// 模式关闭时一个同伴模型都不存在，单人游戏不多付任何开销。
// 对外的控制口是 command(id, directive) 和 snapshot()，将来 MCP 桥接层就接在这两个函数上。
import * as THREE from 'three/webgpu';
import { ROSTER, getLead } from './lead-config.js';
import { getWorldGroundHeight } from './world-config.js';
import { createBrain, parseDirective, stepBrain, traitOf } from './actor-brain.js';

const COMPANION_DAMAGE = .35; // 七个人一起打，单人要轻：铁甲人不能一秒就倒，主要输出还是玩家
const COMPANION_MAX_HP = 100, DOWN_FOR = 14, REGROUP_DISTANCE = 70, REGROUP_HEIGHT = 14, REGROUP_AFTER = 1.2, HIDE_BEYOND = 150, CAMERA_HIDE = 2.8;
const seatOf = (id) => getLead(id).formOf || getLead(id).id;
/** 群像里的人。曾信（含荆南王形态）、童童、只守在清风楼门口的东子与顾府二公子顾廷美不进群像，单人模式下仍可在图鉴里选。 */
export const PARTY_ROSTER = ROSTER.filter((c) => !['zengxin', 'tongtong', 'dongzi', 'gutingmei'].includes(c.id));
const inParty = (seat) => PARTY_ROSTER.some((c) => c.id === seat);

export function createParty({ scene, controller, enemies, onDown = null, onRise = null }) {
  const directives = new Map(); // 动机跟着人走：换了身体，这个人原来领的任务不丢
  const defaultDirective = (id) => ({ intent: traitOf(id).intent });

  function createActor(id, slot) {
    const ent = controller.createPersonEntity(id);
    Object.assign(ent, {
      vitals: { hp: COMPANION_MAX_HP, max: COMPANION_MAX_HP, sinceHit: 99, invulnerable: 0 },
      damageScale: COMPANION_DAMAGE, isCompanion: true, targetable: true, input: {},
      brain: createBrain(slot), attack: null, farFor: 0, downFor: 0
    });
    ent.brain.directive = directives.get(seatOf(id)) || defaultDirective(id);
    scene.add(ent.mesh);
    return ent;
  }

  const actors = []; // 对外是同一个数组，开关模式时原地增删
  let enabled = false;
  const idOf = (a) => a.charRig.config.id;
  const actorOfSeat = (seat) => actors.find((a) => seatOf(idOf(a)) === seat);

  const bodies = [];
  const world = {
    enemies: enemies.enemies, bodies, leader: null, leaderOnGround: true,
    resolve(id) {
      const a = actorOfSeat(seatOf(id));
      return a && a.vitals.hp > 0 ? a : null;
    }
  };

  /** 把人放到玩家身边一块能站的地方：高度差不大、没有卡在碰撞体里。 */
  function placeNear(actor, leader) {
    const base = leader.position, slot = actor.brain.slot;
    for (let i = 0; i < 12; i++) {
      const a = leader.heading + (slot % 2 ? -1 : 1) * (1 + slot * .12) + i * .9, r = 2.5 + (i % 4) * 1.2; // 先试两翼，别落到镜头前
      const x = base.x + Math.sin(a) * r, z = base.z + Math.cos(a) * r;
      const y = getWorldGroundHeight(x, z, base.y);
      if (Math.abs(y - base.y) > 2.5) continue;
      const fixed = controller.resolveHorizontalCollisions(x, y, z, .65);
      if (Math.hypot(fixed.x - x, fixed.z - z) > .01) continue;
      actor.position.set(x, y, z);
      return settle(actor, leader);
    }
    actor.position.copy(base);
    return settle(actor, leader);
  }
  function settle(actor, leader) {
    actor.heading = leader.heading; actor.speed = 0; actor.verticalVel = 0; actor.onGround = true; actor.attack = null;
    actor.farFor = 0; actor.brain.lost = false; actor.brain.stuck = 0; actor.brain.stuckTimes = 0; actor.brain.enemy = null;
    actor.mesh.position.copy(actor.position);
    actor.mesh.rotation.set(0, actor.heading, 0);
  }

  function regroup() {
    const leader = controller.getActiveEntity();
    for (const a of actors) placeNear(a, leader);
  }

  function updateDown(a, dt, elapsed) {
    a.downFor += dt;
    a.targetable = false;
    a.attack = null;
    a.charRig.pose('idle', elapsed, 0, dt);
    a.mesh.rotation.set(-Math.min(1, a.downFor / .4) * 1.45, a.heading, 0, 'YXZ');
    a.mesh.position.copy(a.position);
    if (a.downFor >= DOWN_FOR) {
      a.vitals.hp = a.vitals.max * .45; a.vitals.invulnerable = 2; a.vitals.sinceHit = 99; a.downFor = 0;
      a.targetable = true; a.brain.retreating = false;
      a.mesh.rotation.set(0, a.heading, 0, 'YXZ');
      onRise?.(a);
    }
  }

  /** 打开群像。当前主角不在群像名单里时，换成名单第一人；返回被换下的名字。 */
  function enable() {
    if (enabled) return { replaced: null };
    let replaced = null;
    if (!inParty(seatOf(controller.activeCharacter))) {
      replaced = getLead(controller.activeCharacter).name;
      controller.setCharacter(PARTY_ROSTER[0].id);
    }
    const seat = seatOf(controller.activeCharacter);
    PARTY_ROSTER.filter((c) => c.id !== seat).forEach((c, slot) => actors.push(createActor(c.id, slot)));
    enabled = true;
    regroup();
    return { replaced };
  }

  /** 关闭群像：同伴连模型一起释放，玩家留在当前角色和位置上。 */
  function disable() {
    if (!enabled) return;
    enabled = false;
    for (const a of actors) {
      a.charRig.dispose();
      scene.remove(a.mesh);
    }
    actors.length = 0;
  }

  function update(dt, elapsed, camera) {
    if (!enabled) return;
    const leader = controller.getActiveEntity(), mode = controller.activeMode;
    world.leader = leader;
    world.leaderOnGround = mode === 'person' || mode === 'horse';
    bodies.length = 0;
    bodies.push(leader.position);
    for (const a of actors) bodies.push(a.position);

    for (const a of actors) {
      const dist = a.position.distanceTo(leader.position);
      if (a.vitals.hp <= 0) updateDown(a, dt, elapsed);
      else {
        a.targetable = true;
        stepBrain(a, world, dt);
        controller.stepPerson(a, a.input, dt);
        controller.posePerson(a, a.input.sprint, dt, elapsed);
        // 跟丢了（骑马甩开、传送、卡死）就在玩家看不清的一瞬归队
        const apart = dist > REGROUP_DISTANCE || Math.abs(a.position.y - leader.position.y) > REGROUP_HEIGHT;
        a.farFor = apart && world.leaderOnGround ? a.farFor + dt : 0;
        if (a.farFor > REGROUP_AFTER || (a.brain.lost && world.leaderOnGround)) placeNear(a, leader);
      }
      a.mesh.visible = dist < HIDE_BEYOND && !(camera && camera.position.distanceTo(a.position) < CAMERA_HIDE);
    }
  }

  /**
   * 把键盘交给另一个人。原来的身体留在原地，当场由 AI 接手。
   * 返回 { ok, reason }，reason 是给玩家看的。
   */
  function takeControl(id) {
    const config = getLead(id), seat = seatOf(id);
    if (!enabled) {
      controller.setCharacter(config.id);
      return { ok: true, changed: false };
    }
    if (!inParty(seat)) return { ok: false, reason: `${config.name} 不在群像中，关闭群像模式后可选` };
    if (seat === seatOf(controller.activeCharacter)) {
      controller.setCharacter(config.id);
      return { ok: true, changed: false };
    }
    const actor = actorOfSeat(seat);
    if (actor.vitals.hp <= 0) return { ok: false, reason: `${config.name} 重伤未起` };
    if (enemies.player.hp <= 0) return { ok: false, reason: '重伤中，无法换人' };
    if (controller.activeMode !== 'person') controller.setMode('person');
    const leaderBefore = controller.getActiveEntity().position.clone();
    controller.takeBody(actor);
    // 气血跟着身体走
    const p = enemies.player, v = actor.vitals;
    for (const k of ['hp', 'sinceHit', 'invulnerable']) { const t = p[k]; p[k] = v[k]; v[k] = t; }
    actor.brain.directive = directives.get(seatOf(idOf(actor))) || defaultDirective(idOf(actor));
    actor.brain.enemy = null; actor.brain.retreating = false; actor.brain.stuck = 0; actor.brain.stuckTimes = 0; actor.brain.lost = false;
    actor.farFor = 0; actor.downFor = 0;
    actor.mesh.rotation.set(0, actor.heading, 0, 'YXZ');
    if (config.id !== controller.activeCharacter) controller.setCharacter(config.id); // 荆南王是曾信的另一种形态
    return { ok: true, changed: true, moved: leaderBefore.distanceTo(controller.getActiveEntity().position) };
  }

  /** 给某个同伴下动机。不合法就报错，角色继续做原来的事。 */
  function command(id, raw) {
    if (!enabled) return { ok: false, error: 'party mode is off' };
    const seat = seatOf(id);
    if (!inParty(seat) || getLead(id).id !== id) return { ok: false, error: `unknown actor ${id}` };
    const { directive, error } = parseDirective(raw, PARTY_ROSTER.map((c) => c.id));
    if (error) return { ok: false, error };
    directives.set(seat, directive);
    const actor = actorOfSeat(seat);
    if (actor) { actor.brain.directive = directive; actor.brain.enemy = null; actor.brain.thinkIn = 0; }
    return { ok: true, controlled: !actor };
  }

  /** 全队状态：HUD 和将来的外部 Agent 都读这一份。 */
  function snapshot() {
    if (!enabled) return [];
    const seat = seatOf(controller.activeCharacter), p = enemies.player, pos = controller.getActiveEntity().position;
    return PARTY_ROSTER.map((c) => {
      if (c.id === seat) return { id: c.id, name: getLead(controller.activeCharacter).name, controlled: true, hp: p.hp, max: p.max, down: p.hp <= 0, status: 'player', position: [pos.x, pos.y, pos.z] };
      const a = actorOfSeat(c.id), r = a.charRig.config;
      return { id: c.id, name: r.name, controlled: false, hp: a.vitals.hp, max: a.vitals.max, down: a.vitals.hp <= 0, status: a.vitals.hp <= 0 ? 'down' : a.brain.enemy ? 'fight' : a.brain.status, directive: a.brain.directive, position: [a.position.x, a.position.y, a.position.z], action: a.charRig.group.userData.action };
    });
  }

  return { actors, enable, disable, get enabled() { return enabled; }, update, takeControl, command, snapshot, regroup, seatOf, get activeSeat() { return seatOf(controller.activeCharacter); } };
}
