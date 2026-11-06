// js/actor-brain.js
// 同伴的大脑。动机很简单，反应必须快，所以全在本地每帧跑：
//   directive（动机，低频，将来由外部 Agent 下达）→ think（5 次/秒，挑目标）→ steer（每帧，输出和键盘同格式的输入）。
// Agent 想多久都不影响这里：它不说话，角色就按上一条动机继续打。
// 这个文件不碰 three.js 和 DOM，可以直接在 node 里测。

export const INTENTS = ['follow', 'guard', 'attack', 'goto', 'hold', 'flee'];
export const INTENT_LABELS = { follow: '随行', guard: '护卫', attack: '搜敌', goto: '赶路', hold: '驻守', flee: '撤退' };

const DEFAULT_TRAIT = { intent: 'follow', aggro: 16, retreatBelow: .3 };
/** 每个人默认的性子：谁冲在前，谁护着人，谁先跑。 */
export const TRAITS = {
  caosheng: { intent: 'follow', aggro: 18, retreatBelow: .3 },
  zengqian: { intent: 'guard', aggro: 18, retreatBelow: .35 },
  fengbuhai: { intent: 'follow', aggro: 26, retreatBelow: .2 },
  yunniang: { intent: 'guard', aggro: 12, retreatBelow: .35 },
  xiejingtang: { intent: 'follow', aggro: 16, retreatBelow: .4 },
  linhan: { intent: 'guard', aggro: 22, retreatBelow: .2 },
  tongtong: { intent: 'follow', aggro: 8, retreatBelow: .6 },
  zengxin: { intent: 'follow', aggro: 12, retreatBelow: .45 },
  jingnan: { intent: 'follow', aggro: 28, retreatBelow: .15 },
  dongzi: { intent: 'hold', aggro: 8, retreatBelow: .5 },
  gutingmei: { intent: 'follow', aggro: 20, retreatBelow: .35 }
};
export const traitOf = (id) => TRAITS[id] || DEFAULT_TRAIT;

const THINK_EVERY = .2, RESUME_AT = .6, GUARD_RADIUS = 14, FOLLOW_LEASH = 30;
// 队形摆在主角前方和两翼：第三人称镜头在身后，站后面会把主角和视野一起挡住
const SLOT_ANGLES = [1.35, -1.35, .8, -.8, 1.15, -1.15, 0];
const SLOT_RADII = [2.2, 2.2, 3.2, 3.2, 4.5, 4.5, 4.5];

/** 校验一条动机。外部传来的东西都先过这里；不合法就返回 error，不改变角色当前的动机。 */
export function parseDirective(raw, knownActors = []) {
  if (!raw || typeof raw !== 'object') return { error: 'directive must be an object' };
  if (!INTENTS.includes(raw.intent)) return { error: `intent must be one of ${INTENTS.join(', ')}` };
  const directive = { intent: raw.intent };
  if (raw.target != null) {
    if (typeof raw.target !== 'string') return { error: 'target must be a string' };
    if (raw.intent === 'follow' || raw.intent === 'guard') {
      if (raw.target !== 'player' && !knownActors.includes(raw.target)) return { error: `unknown target ${raw.target}` };
    }
    directive.target = raw.target;
  }
  if (raw.intent === 'goto' || raw.position != null) {
    const p = raw.position;
    if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) return { error: 'position must be [x, z]' };
    directive.position = [p[0], p[1]];
  }
  if (raw.retreatBelow != null) {
    if (!Number.isFinite(raw.retreatBelow) || raw.retreatBelow < 0 || raw.retreatBelow > 1) return { error: 'retreatBelow must be between 0 and 1' };
    directive.retreatBelow = raw.retreatBelow;
  }
  return { directive };
}

export function createBrain(slot) {
  return {
    slot, directive: { intent: 'follow' }, enemy: null, status: 'follow', retreating: false,
    thinkIn: slot * THINK_EVERY / SLOT_ANGLES.length, // 错开，别让所有人挤在同一帧想事情
    stuck: 0, detour: 0, detourDir: slot % 2 ? 1 : -1, stuckTimes: 0, lost: false, holdAt: null
  };
}

const alive = (e) => e.state !== 'dead' && !e.dormant;
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/** 这条动机围着谁转；目标倒了或找不到就退回玩家。 */
function anchorOf(brain, world) {
  const t = brain.directive.target;
  if (t && t !== 'player') {
    const who = world.resolve(t);
    if (who) return who;
  }
  return world.leader;
}

function think(actor, world) {
  const brain = actor.brain, d = brain.directive, trait = traitOf(actor.charRig.config.id);
  const hp = actor.vitals.hp / actor.vitals.max;
  const limit = d.retreatBelow ?? trait.retreatBelow;
  if (hp < limit) brain.retreating = true;
  else if (hp > Math.max(limit, RESUME_AT)) brain.retreating = false;

  if (d.intent === 'flee' || brain.retreating) { brain.enemy = null; brain.status = 'flee'; return; }
  brain.status = d.intent;

  const reach = actor.charRig.attack.hit?.range ?? 3;
  const anchor = d.intent === 'follow' || d.intent === 'guard' ? anchorOf(brain, world).position : null;
  let best = null, bestScore = Infinity;
  // Agent 可能写类型（jiashi），也可能写名字（百里渊甲士）；附近没有这种敌人就打最近的，不站着发呆
  const named = (e) => e.type === d.target || e.def.name === d.target;
  const picky = d.intent === 'attack' && d.target && world.enemies.some((e) => alive(e) && named(e) && flat(e.pos, actor.position) < 60);
  for (const e of world.enemies) {
    if (!alive(e) || Math.abs(e.pos.y - actor.position.y) > 5) continue;
    if (picky && !named(e)) continue;
    const self = flat(e.pos, actor.position);
    let ok;
    if (d.intent === 'follow') ok = self < trait.aggro && flat(e.pos, anchor) < FOLLOW_LEASH;
    else if (d.intent === 'guard') ok = flat(e.pos, anchor) < GUARD_RADIUS;
    else if (d.intent === 'attack') ok = self < 60;
    else ok = self < reach + e.def.radius; // goto / hold：只还手，不离岗
    if (!ok) continue;
    const score = self * (e === brain.enemy ? .8 : 1);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  brain.enemy = best;
}

function clearInput(input) {
  input.forward = input.backward = input.left = input.right = input.up = input.down = input.sprint = input.attack = false;
  input.faceHeading = null;
}

/** 朝 (dx, dz) 走，顺带和身边的人错开；撞墙了就侧身绕，绕几次不行就跳，再不行报告迷路。 */
function moveAlong(actor, world, input, dx, dz, dist, dt) {
  const brain = actor.brain;
  const len = Math.hypot(dx, dz) || 1;
  let vx = dx / len, vz = dz / len;
  for (const o of world.bodies) {
    if (o === actor.position) continue;
    const ox = actor.position.x - o.x, oz = actor.position.z - o.z, d2 = ox * ox + oz * oz;
    if (d2 > .001 && d2 < 2.4) { const k = (1 / Math.sqrt(d2) - .64) * .9; vx += ox * k; vz += oz * k; }
  }
  let heading = Math.atan2(vx, vz);
  const wanted = Math.abs(actor.speed) * dt;
  if (wanted > .02 && (actor.movedLastStep ?? wanted) < wanted * .35) brain.stuck += dt;
  else brain.stuck = Math.max(0, brain.stuck - dt * 2);
  if (brain.stuck > .3) {
    brain.stuck = 0; brain.detour = .7; brain.detourDir = -brain.detourDir; brain.stuckTimes++;
    if (brain.stuckTimes % 2 === 0) input.up = true;
    if (brain.stuckTimes > 6) brain.lost = true;
  }
  if (brain.detour > 0) { brain.detour -= dt; heading += brain.detourDir * 1.25; } else if (actor.speed > 4) brain.stuckTimes = Math.max(0, brain.stuckTimes - dt * .5);
  input.faceHeading = heading;
  const off = Math.abs(Math.atan2(Math.sin(heading - actor.heading), Math.cos(heading - actor.heading)));
  input.forward = off < 1.1;
  input.sprint = dist > 7;
}

/** 每帧把动机变成按键。 */
export function stepBrain(actor, world, dt, input = actor.input) {
  const brain = actor.brain, d = brain.directive;
  clearInput(input);
  brain.thinkIn -= dt;
  if (brain.thinkIn <= 0) { brain.thinkIn += THINK_EVERY; think(actor, world); }
  if (brain.enemy && !alive(brain.enemy)) { brain.enemy = null; think(actor, world); }
  const p = actor.position;

  if (brain.status === 'flee') {
    // 往玩家身边跑；已经在身边了，就背着最近的敌人跑
    const home = world.leader.position;
    let dx = home.x - p.x, dz = home.z - p.z, dist = Math.hypot(dx, dz);
    if (dist < 5) {
      let near = null, nearD = 14;
      for (const e of world.enemies) if (alive(e)) { const r = flat(e.pos, p); if (r < nearD) { nearD = r; near = e; } }
      if (!near) { input.faceHeading = world.leader.heading; return input; }
      dx = p.x - near.pos.x; dz = p.z - near.pos.z; dist = 14;
    }
    moveAlong(actor, world, input, dx, dz, dist, dt);
    return input;
  }

  if (brain.enemy) {
    const e = brain.enemy, hit = actor.charRig.attack.hit;
    const dx = e.pos.x - p.x, dz = e.pos.z - p.z, dist = Math.hypot(dx, dz);
    // 瞄准只管 12 米内，弓和飞针也站到这个距离再出手
    const standoff = Math.min((hit?.range ?? 3) * .72, 10) + e.def.radius;
    if (dist > standoff) { moveAlong(actor, world, input, dx, dz, dist - standoff, dt); return input; }
    const face = Math.atan2(dx, dz);
    input.faceHeading = face;
    const off = Math.abs(Math.atan2(Math.sin(face - actor.heading), Math.cos(face - actor.heading)));
    if (off < .45) input.attack = true;
    return input;
  }

  // 没有敌人：去动机要求的位置
  let goal = null, tolerance = .8; // 队形收紧后，停得太早会贴到主角身上
  if (d.intent === 'follow' || d.intent === 'guard') {
    const anchor = anchorOf(brain, world);
    if (!world.leaderOnGround && anchor === world.leader) return input; // 玩家在天上或铁索上，原地等着
    const a = (anchor.heading ?? 0) + SLOT_ANGLES[brain.slot % SLOT_ANGLES.length];
    const r = SLOT_RADII[brain.slot % SLOT_RADII.length];
    goal = { x: anchor.position.x + Math.sin(a) * r, z: anchor.position.z + Math.cos(a) * r };
  } else if (d.intent === 'goto') {
    goal = { x: d.position[0], z: d.position[1] }; tolerance = 1.6;
  } else if (d.intent === 'hold' && d.position) {
    goal = { x: d.position[0], z: d.position[1] }; tolerance = 1.6;
  }
  if (goal) {
    const dx = goal.x - p.x, dz = goal.z - p.z, dist = Math.hypot(dx, dz);
    if (dist > tolerance) moveAlong(actor, world, input, dx, dz, dist, dt);
  }
  if (!input.forward && input.faceHeading == null && (d.intent === 'follow' || d.intent === 'guard')) input.faceHeading = world.leader.heading;
  return input;
}
