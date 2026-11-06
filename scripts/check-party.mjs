// 队伍系统：多 Actor、规则 Brain、切人、敌人多目标。不开浏览器，真控制器 + 真敌人系统。
import assert from 'node:assert/strict';
import { Scene } from 'three/webgpu';
import { ThirdPersonControllerManager } from '../js/controllers.js';
import { createEnemySystem } from '../js/enemies.js';
import { createParty, PARTY_ROSTER } from '../js/party.js';
import { parseDirective } from '../js/actor-brain.js';

// 敌人闲逛用了随机数：固定种子，失败才能复现
let seed = Number(process.env.SEED ?? 12345);
Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
globalThis.window = { addEventListener() {} };
const scene = new Scene();
const controller = new ThirdPersonControllerManager(scene);
const enemies = createEnemySystem(scene, { resolve: (x, y, z, r) => controller.resolveHorizontalCollisions(x, y, z, r) });
const party = createParty({ scene, controller, enemies });
controller.callbacks.onAttackHit = (ent, hit) => enemies.strike(ent, hit);
controller.callbacks.onAttackAim = (ent, hit) => enemies.aim(ent, hit);
let elapsed = 0;
const run = (s) => { for (let i = 0; i < s * 60; i++) { elapsed += 1 / 60; controller.update(1 / 60, elapsed); party.update(1 / 60, elapsed, null); enemies.update(1 / 60, controller.getActiveEntity(), controller.activeMode, null, party.actors); } };
const leaderPos = () => controller.getActiveEntity().position;
const dist = (a) => Math.hypot(a.position.x - leaderPos().x, a.position.z - leaderPos().z);

// 默认关闭：场景里没有同伴，敌人也只盯玩家，换人就是原来的换模型
{
  const before = scene.children.length;
  assert.equal(party.enabled, false);
  assert.equal(party.actors.length, 0);
  assert.deepEqual(party.snapshot(), []);
  assert.equal(party.command('zengqian', { intent: 'hold' }).ok, false, 'no orders while off');
  run(.2);
  assert.equal(party.takeControl('tongtong').ok, true, 'solo play can still pick anyone');
  assert.equal(controller.activeCharacter, 'tongtong');
  assert.equal(scene.children.length, before);

  // 曾信和童童不进群像：当前主角是他们时打开，会换成名单第一人
  assert.deepEqual(PARTY_ROSTER.map((c) => c.id).sort(), ['caosheng', 'fengbuhai', 'linhan', 'xiejingtang', 'yunniang', 'zengqian']);
  const t0 = performance.now();
  assert.equal(party.enable().replaced, '童童');
  console.log(`enable: ${(performance.now() - t0).toFixed(0)}ms`);
  assert.equal(controller.activeCharacter, PARTY_ROSTER[0].id);
  for (const id of ['zengxin', 'jingnan', 'tongtong', 'dongzi', 'gutingmei']) {
    assert.ok(!party.snapshot().some((m) => m.id === id));
    assert.ok(!party.actors.some((a) => a.charRig.config.id === id));
    assert.equal(party.takeControl(id).ok, false, `${id} must stay out of the party`);
    assert.equal(party.command(id, { intent: 'hold' }).ok, false);
  }
  assert.equal(party.command('zengqian', { intent: 'guard', target: 'tongtong' }).ok, false, 'cannot guard someone absent');

  // 关闭：模型全部释放，敌人不再有同伴可盯；再打开，人数不变也不重影
  party.disable();
  assert.equal(party.actors.length, 0);
  assert.equal(scene.children.length, before);
  run(.2);
  party.enable();
  party.disable();
  party.enable();
  assert.equal(scene.children.length, before + PARTY_ROSTER.length - 1);
}

// 一人操控，其余五人各占一个身体
assert.equal(party.actors.length, PARTY_ROSTER.length - 1);
assert.equal(new Set(party.actors.map((a) => a.charRig.config.id)).size, PARTY_ROSTER.length - 1);
assert.ok(!party.actors.some((a) => a.charRig.config.id === controller.activeCharacter), 'the player is not also a companion');
party.regroup();

// 同一段输入，玩家和 Actor 走出同样的路：键盘和 AI 没有两套手感
{
  const a = party.actors[0], p = controller.entities.person;
  controller.teleportActiveTo(0, 126, Math.PI, null, 'person');
  a.position.copy(p.position); a.heading = p.heading; a.speed = 0; a.onGround = true; a.verticalVel = 0; a.attack = null;
  const input = { forward: true, sprint: true };
  for (let i = 0; i < 30; i++) { controller.stepPerson(p, input, 1 / 60); controller.stepPerson(a, input, 1 / 60); }
  assert.ok(p.position.distanceTo(a.position) < 1e-9, 'keyboard and AI must share one step');
  assert.ok(p.speed > 8, 'input moved the body');
  party.regroup();
}

// 跟随：玩家走开，同伴跟上，并且不和玩家叠在一起
{
  controller.teleportActiveTo(0, 126, Math.PI, null, 'person'); party.regroup();
  const start = leaderPos().clone();
  controller.keys.forward = true; run(3); controller.resetInput();
  assert.ok(leaderPos().distanceTo(start) > 15, 'player should have walked away');
  run(4);
  const near = party.actors.filter((a) => dist(a) < 16).length;
  assert.ok(near >= 5, `companions should catch up, only ${near} near: ${party.actors.map((a) => dist(a).toFixed(1))}`);
  assert.ok(party.actors.every((a) => dist(a) > .5), 'companions stack on the player');
  // 站定后的队形：贴近但不重叠，彼此也不叠在一起
  run(3);
  const gaps = party.actors.map(dist);
  assert.ok(gaps.every((g) => g > 1.2 && g < 5.5), `formation spacing off: ${gaps.map((g) => g.toFixed(1))}`);
  for (const a of party.actors) for (const b of party.actors) if (a !== b) assert.ok(a.position.distanceTo(b.position) > .9, 'companions overlap');
  console.log(`formation: ${gaps.map((g) => g.toFixed(1)).join(' ')}`);
}

// 传送后归队；骑马甩开也会自动归队
{
  controller.teleportActiveTo(0, -60, Math.PI, null, 'person'); run(1.6);
  assert.ok(party.actors.every((a) => dist(a) < 40), `regroup failed: ${party.actors.map((a) => dist(a).toFixed(0))}`);
}

// 把人带到敌人窝边：同伴自己开打并造成击杀，玩家不用动手
{
  const camp = enemies.enemies.find((e) => e.type === 'jiashi');
  const hpBefore = enemies.enemies.reduce((n, e) => n + e.hp, 0);
  controller.teleportActiveTo(camp.pos.x + 10, camp.pos.z + 10, Math.PI, null, 'person'); party.regroup();
  let sawFight = false;
  for (let i = 0; i < 20; i++) { run(.5); enemies.player.hp = enemies.player.max; sawFight ||= party.snapshot().some((m) => m.status === 'fight'); }
  const hpAfter = enemies.enemies.reduce((n, e) => n + e.hp, 0);
  assert.ok(sawFight, 'companions never engaged');
  assert.ok(hpAfter < hpBefore, `companions dealt no damage: ${hpBefore} -> ${hpAfter}`);
  assert.equal(controller.keys.attack, false, 'the player did nothing');
}

// 敌人会打同伴：玩家飞走，地上的同伴依然被盯、会掉血，倒地后不再是目标，之后能站起来
{
  const camp = enemies.enemies.find((e) => e.type === 'tiejia') || enemies.enemies[0];
  camp.state = 'chase';
  camp.hp = 1e6; // 这里测的是挨打，别让同伴先把它打死
  const a = party.actors[0];
  a.position.set(camp.pos.x + 1.5, camp.pos.y, camp.pos.z); a.onGround = true;
  a.vitals.hp = 30; a.vitals.invulnerable = 0; a.brain.directive = { intent: 'hold', retreatBelow: 0 };
  controller.teleportActiveTo(camp.pos.x + 25, camp.pos.z, Math.PI, null, 'flight');
  a.position.set(camp.pos.x + 1.5, camp.pos.y, camp.pos.z);
  let t = 0;
  while (a.vitals.hp > 0 && t < 40) { run(.25); t += .25; }
  assert.ok(a.vitals.hp <= 0, 'enemies should be able to down a companion');
  assert.equal(a.targetable, false);
  assert.equal(party.takeControl(a.charRig.config.id).ok, false, 'cannot take over a downed companion');
  run(15);
  assert.ok(a.vitals.hp > 0 && a.targetable, 'companion should get back up');
  a.brain.directive = { intent: 'follow' };
  camp.hp = camp.def.hp;
  controller.setMode('person');
}

// 切人：位置和身体互换，老身体当场交给 AI，血量跟着身体走，不会重影，也不重建步行模型
{
  controller.teleportActiveTo(0, 126, Math.PI, null, 'person'); party.regroup();
  run(.3);
  const startId = controller.activeCharacter;
  const a = party.actors[2], id = a.charRig.config.id;
  const rigBody = a.charRig, oldRig = controller.entities.person.charRig;
  a.vitals.hp = 42; enemies.player.hp = 77;
  const theirPos = a.position.clone(), myPos = leaderPos().clone();
  assert.equal(party.takeControl(id).ok, true);
  assert.equal(controller.activeCharacter, id);
  assert.equal(controller.entities.person.charRig, rigBody, 'body reused, not rebuilt');
  assert.equal(a.charRig, oldRig, 'old body handed to the AI');
  assert.ok(leaderPos().distanceTo(theirPos) < 1e-6, 'player moved into the chosen body');
  assert.ok(a.position.distanceTo(myPos) < 1e-6, 'old body stays where it stood');
  assert.equal(enemies.player.hp, 42); assert.equal(a.vitals.hp, 77);
  assert.equal(a.charRig.config.id, startId);
  assert.equal(controller.entities.person.mesh.children.filter((c) => c.name.startsWith('lead-')).length, 1);
  assert.equal(a.mesh.children.filter((c) => c.name.startsWith('lead-')).length, 1);
  const seen = party.snapshot();
  assert.equal(seen.filter((m) => m.controlled).length, 1);
  assert.equal(new Set(seen.map((m) => m.id)).size, PARTY_ROSTER.length);
  run(.5);
  // 切到骑马才生成新骑手，且是当前主角
  controller.setMode('horse');
  assert.equal(controller.getActiveEntity().charRig.config.id, id, 'rider must match the new lead');
  // 骑马中换人先下马
  const b = party.actors[3];
  assert.equal(party.takeControl(b.charRig.config.id).ok, true);
  assert.equal(controller.activeMode, 'person');
  // 换回去，气血也回来
  party.takeControl(startId);
  assert.equal(controller.activeCharacter, startId);
}

// 动机接口：合法的生效且不影响别人，非法的直接拒绝、不改变当前动机
{
  // 前面的战斗可能留下伤和敌人；回到没有敌人的长街，满血测动机
  controller.teleportActiveTo(0, 126, Math.PI, null, 'person'); party.regroup();
  for (const x of party.actors) { x.vitals.hp = x.vitals.max; x.brain.retreating = false; }
  const a = party.actors[1], id = a.charRig.config.id, before = party.actors[2].brain.directive;
  assert.equal(party.command(id, { intent: 'goto', position: [3, 120] }).ok, true);
  assert.equal(a.brain.directive.intent, 'goto');
  assert.equal(party.actors[2].brain.directive, before);
  for (const bad of [null, {}, { intent: 'dance' }, { intent: 'goto' }, { intent: 'goto', position: [1] }, { intent: 'guard', target: 'nobody' }, { intent: 'follow', retreatBelow: 9 }]) {
    assert.equal(party.command(id, bad).ok, false, `accepted ${JSON.stringify(bad)}`);
    assert.equal(a.brain.directive.intent, 'goto');
  }
  assert.equal(party.command('nobody', { intent: 'hold' }).ok, false);
  assert.ok(parseDirective({ intent: 'hold', position: [1, 2], retreatBelow: .5 }).directive);
  // goto 真的走得到
  const dest = { x: leaderPos().x + 6, z: leaderPos().z - 8 };
  party.command(id, { intent: 'goto', position: [dest.x, dest.z] });
  run(3);
  assert.ok(Math.hypot(a.position.x - dest.x, a.position.z - dest.z) < 3, 'goto did not arrive');
  // 低血量自动撤退，血回来再上
  party.command(id, { intent: 'follow', retreatBelow: .5 });
  a.vitals.hp = 20; a.vitals.sinceHit = 0; run(.3);
  assert.equal(a.brain.status, 'flee');
  a.vitals.hp = 90; run(.3);
  assert.equal(a.brain.status, 'follow');
  // attack 的目标写类型、写中文名、写错都要有人打，不能站着发呆
  {
    const camp = enemies.enemies.find((e) => e.type === 'jiashi' && e.state !== 'dead' && e.pos.y < 1); // 地面上的，不要蜃景里的
    for (const target of ['jiashi', camp.def.name, '根本没有这种敌人']) {
      controller.teleportActiveTo(camp.pos.x + 12, camp.pos.z + 12, Math.PI, null, 'person');
      party.regroup();
      party.command(id, { intent: 'attack', target });
      a.vitals.hp = a.vitals.max; a.brain.retreating = false;
      run(.5);
      assert.ok(a.brain.enemy, `attack target ${target} found nobody`);
    }
    party.command(id, { intent: 'follow' });
    controller.teleportActiveTo(0, 126, Math.PI, null, 'person'); party.regroup();
  }
  // 动机跟着人走：被玩家接管再放回，原来的任务还在
  party.command(id, { intent: 'hold' });
  const start = controller.activeCharacter;
  party.takeControl(id); party.takeControl(start);
  assert.equal(party.actors.find((x) => x.charRig.config.id === id).brain.directive.intent, 'hold');
}
// 中途关闭：玩家留在当前角色，不管刚才换到了谁
{
  const id = party.actors[0].charRig.config.id;
  party.takeControl(id);
  const at = leaderPos().clone();
  party.disable();
  assert.equal(controller.activeCharacter, id);
  assert.ok(leaderPos().distanceTo(at) < 1e-9);
  run(.2);
}
console.log('PASS: party toggle, roster limits, bodies, shared step, follow, regroup, combat, enemy targeting, downing, body swap, directives.');
