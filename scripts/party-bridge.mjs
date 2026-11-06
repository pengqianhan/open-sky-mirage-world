// scripts/party-bridge.mjs
// 外部 Agent（Claude Code、Codex）和游戏之间的本地桥。零依赖，只听 127.0.0.1：
//   Agent → POST /mcp?actor=<角色>  两个 MCP 工具：observe 等事件看局势，act 下动机或说话。
//   游戏  → POST /game              开发环境下定时同步：上报局势，取走待执行的指令。
// 反应不等这里：挥刀、走位由游戏内的 Brain 每帧处理，Agent 只低频改动机。
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export const DEFAULT_PORT = 8787;
const STALE_MS = 2000, ACK_MS = 2500, MAX_WAIT_S = 30, DEFAULT_WAIT_S = 20, ACTIVE_MS = 70000, MAX_QUEUE = 20, NEAR = 25, SAY_MAX = 40, BODY_MAX = 1 << 20;
const LOCAL_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26'];

const TOOLS = [
  {
    name: 'observe',
    description: '等到有事发生（最多 waitSeconds 秒）再返回：事件、自己、队友、附近敌人。这是你的主循环，没事可做就继续调用它，不要自己轮询。',
    inputSchema: { type: 'object', properties: { waitSeconds: { type: 'number', minimum: 0, maximum: MAX_WAIT_S, description: `默认 ${DEFAULT_WAIT_S}；0 表示立即返回当前局势` } }, additionalProperties: false }
  },
  {
    name: 'act',
    description: '设定动机或说一句话。动机会一直生效到下次修改，走位和出招由游戏自动完成。玩家正在操控你时不能调用。',
    inputSchema: {
      type: 'object',
      properties: {
        intent: { enum: ['follow', 'guard', 'attack', 'goto', 'hold', 'flee'], description: 'follow 随行；guard 护卫 target；attack 主动搜敌；goto 去 position；hold 驻守；flee 撤退' },
        target: { type: 'string', description: 'follow/guard：队友 id 或 player（默认）。attack：敌人 type，不填则打最近的' },
        position: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2, description: '[x, z]，goto 必填' },
        retreatBelow: { type: 'number', minimum: 0, maximum: 1, description: '气血比例低于它就自动撤退' },
        say: { type: 'string', maxLength: SAY_MAX, description: '头顶气泡，一句短话' }
      },
      additionalProperties: false
    }
  }
];

const ok = (data) => ({ ok: true, data });
const fail = (code, message, hint) => ({ ok: false, error: { code, message, hint } });
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** 这一帧相对上一帧，对这个角色来说值得叫醒 Agent 的事。全部从局势差异推出来，游戏不用单独上报。 */
export function diffEvents(id, prev, next) {
  const was = prev?.party.find((m) => m.id === id), now = next.party.find((m) => m.id === id);
  if (!was || !now) return [];
  const events = [], push = (type, extra = {}) => events.push({ type, ...extra });
  if (was.controlled !== now.controlled) push(now.controlled ? 'control_lost' : 'control_granted');
  if (!was.down && now.down) push('you_down');
  if (was.down && !now.down) push('you_rose');
  // 按四分之一血量分档，否则连续挨打每一下都要叫醒一次，白白消耗额度
  const bucket = (m) => Math.ceil(m.hp / m.max * 4);
  if (!now.down && bucket(now) < bucket(was)) push('hurt', { hp: Math.round(now.hp / now.max * 100) });
  const nearby = (w, me) => w.enemies.filter((e) => flat(e.position, me.position) < NEAR).length;
  const before = nearby(prev, was), after = nearby(next, now);
  if (before === 0 && after > 0) push('enemy_near', { count: after });
  if (before > 0 && after === 0) push('area_clear');
  for (const m of next.party) {
    const old = prev.party.find((o) => o.id === m.id);
    if (m.id !== id && old && !old.down && m.down) push('ally_down', { id: m.id, name: m.name });
  }
  const goal = now.directive?.intent === 'goto' ? now.directive.position : null;
  if (goal && was.directive?.intent === 'goto') {
    const dist = (m) => Math.hypot(m.position[0] - goal[0], m.position[2] - goal[1]);
    if (dist(was) > 2 && dist(now) <= 2) push('arrived');
  }
  return events;
}

/** 给某个角色看的局势：只有它该知道的，距离按它自己算。 */
export function situationFor(id, world) {
  const me = world.party.find((m) => m.id === id);
  const pct = (m) => Math.round(m.hp / m.max * 100);
  return {
    you: { id: me.id, name: me.name, hp: pct(me), status: me.status, directive: me.directive ?? null, controlledByPlayer: me.controlled, position: [Math.round(me.position[0]), Math.round(me.position[2])] },
    allies: world.party.filter((m) => m.id !== id).map((m) => ({ id: m.id, name: m.name, hp: pct(m), status: m.status, isPlayer: m.controlled, distance: Math.round(flat(m.position, me.position)) })),
    enemies: world.enemies
      .map((e) => ({ type: e.type, name: e.name, hp: e.hp, boss: e.boss || undefined, distance: Math.round(flat(e.position, me.position)), position: [Math.round(e.position[0]), Math.round(e.position[2])] }))
      .sort((a, b) => a.distance - b.distance).slice(0, 6),
    playerMode: world.mode,
    kills: world.kills
  };
}

export function createBridge({ log = () => {} } = {}) {
  let world = null, seenAt = 0, nextId = 1;
  const agents = new Map(), outbox = [], acks = new Map();
  const online = () => world && Date.now() - seenAt < STALE_MS;

  function agentOf(actor) {
    if (!agents.has(actor)) agents.set(actor, { queue: [], heard: [], wake: null, lastSeen: 0 });
    const agent = agents.get(actor);
    agent.lastSeen = Date.now();
    return agent;
  }
  /** 给不了局势时统一的错误，hint 告诉 Agent 该怎么办 */
  function unavailable(actor) {
    if (!online()) return fail('GAME_OFFLINE', '游戏没有连上', '继续调用 observe 等待，不要做别的');
    if (!world.party.length) return fail('PARTY_OFF', '群像模式没有打开', '继续调用 observe 等待玩家打开');
    if (!world.party.some((m) => m.id === actor)) return fail('NOT_IN_PARTY', `${actor} 不在群像中`, `可用角色：${world.party.map((m) => m.id).join(', ')}`);
    return null;
  }

  function sync({ world: next, results = [] }) {
    for (const { id, result } of results) { acks.get(id)?.(result); acks.delete(id); }
    const prev = world;
    world = next; seenAt = Date.now();
    for (const [actor, agent] of agents) {
      if (prev) agent.queue.push(...diffEvents(actor, prev, next));
      agent.queue.splice(0, Math.max(0, agent.queue.length - MAX_QUEUE));
      if (agent.queue.length) agent.wake?.();
    }
    const active = [...agents].filter(([, a]) => Date.now() - a.lastSeen < ACTIVE_MS).map(([actor]) => actor);
    return { commands: outbox.splice(0), agents: active };
  }

  async function observe(actor, { waitSeconds = DEFAULT_WAIT_S } = {}) {
    const agent = agentOf(actor);
    const wait = Math.min(MAX_WAIT_S, Math.max(0, Number(waitSeconds) || 0));
    if (!agent.queue.length && wait > 0) {
      agent.wake?.(); // 同一角色只留最新一个等待者
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, wait * 1000);
        agent.wake = () => { clearTimeout(timer); agent.wake = null; resolve(); };
      });
      agent.lastSeen = Date.now();
    }
    const problem = unavailable(actor);
    if (problem) return problem;
    return ok({ events: agent.queue.splice(0), heard: agent.heard.splice(0), ...situationFor(actor, world) });
  }

  async function act(actor, args = {}) {
    agentOf(actor);
    const problem = unavailable(actor);
    if (problem) return problem;
    if (world.party.find((m) => m.id === actor).controlled) return fail('PLAYER_CONTROLLED', '玩家正在操控你', '继续调用 observe，等 control_granted 事件');
    const { say, ...directive } = args;
    const text = typeof say === 'string' ? say.trim().slice(0, SAY_MAX) : '';
    const hasDirective = directive.intent !== undefined;
    if (!hasDirective && !text) return fail('EMPTY_ACT', '既没有 intent 也没有 say', '至少给一个');
    const id = nextId++;
    outbox.push({ id, actor, directive: hasDirective ? directive : null, say: text || null });
    const result = await new Promise((resolve) => {
      const timer = setTimeout(() => { acks.delete(id); resolve({ ok: false, error: 'game did not answer' }); }, ACK_MS);
      acks.set(id, (r) => { clearTimeout(timer); resolve(r); });
    });
    if (!result.ok) return fail('REJECTED', result.error, '检查参数后重试，当前动机没有变');
    if (text) {
      const speaker = world.party.find((m) => m.id === actor).name;
      // 听到的话随下次 observe 带上，但不叫醒对方，否则几个 Agent 会互相聊个没完
      for (const [other, agent] of agents) if (other !== actor) agent.heard.push({ from: speaker, text });
    }
    return ok({ applied: true });
  }

  /** 无状态的 MCP：一问一答的 JSON，不开 SSE，也不维护会话。 */
  async function mcp(actor, message) {
    const { id, method, params } = message;
    const reply = (result) => ({ jsonrpc: '2.0', id, result });
    if (id === undefined) return null; // 通知不用回
    if (method === 'initialize') {
      const asked = params?.protocolVersion;
      return reply({
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'sky-mirage-party', version: '1.0.0' },
        instructions: `你控制角色 ${actor}。循环调用 observe，需要时调用 act。`
      });
    }
    if (method === 'ping') return reply({});
    if (method === 'tools/list') return reply({ tools: TOOLS });
    if (method === 'tools/call') {
      const run = { observe, act }[params?.name];
      if (!run) return { jsonrpc: '2.0', id, error: { code: -32602, message: `unknown tool ${params?.name}` } };
      const result = await run(actor, params.arguments ?? {});
      log(actor, params.name, params.arguments ?? {}, result);
      return reply({ content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result.ok });
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `unknown method ${method}` } };
  }

  return { sync, observe, act, mcp };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > BODY_MAX) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

export function startBridge({ port = DEFAULT_PORT, log, bridge = createBridge({ log }) } = {}) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const origin = req.headers.origin;
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) });
      res.end(body === undefined ? undefined : JSON.stringify(body));
    };
    // 别的网站不能借玩家的浏览器碰这里；Agent 是命令行进程，不带 Origin
    if (origin && !LOCAL_ORIGIN.test(origin)) return send(403, { error: 'origin not allowed' });
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Private-Network': 'true', Vary: 'Origin' });
        return res.end();
      }
      if (url.pathname === '/game' && req.method === 'POST') return send(200, bridge.sync(await readJson(req)));
      if (url.pathname === '/mcp') {
        if (req.method !== 'POST') return send(405, { error: 'POST only' });
        const actor = url.searchParams.get('actor');
        if (!/^[a-z]+$/.test(actor ?? '')) return send(400, { error: 'need ?actor=<id>' });
        const reply = await bridge.mcp(actor, await readJson(req));
        return reply ? send(200, reply) : send(202);
      }
      return send(404, { error: 'not found' });
    } catch (error) {
      return send(400, { error: String(error.message || error) });
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ server, bridge, port: server.address().port }));
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { port } = await startBridge({ port: Number(process.env.PARTY_BRIDGE_PORT) || DEFAULT_PORT });
  console.log(`party bridge: http://127.0.0.1:${port}/mcp?actor=<id>`);
}
