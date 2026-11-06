// 桥：真 HTTP、真 MCP 消息，用脚本扮演游戏。
import assert from 'node:assert/strict';
import { startBridge, diffEvents, situationFor } from './party-bridge.mjs';

const { server, port } = await startBridge({ port: 0 });
const base = `http://127.0.0.1:${port}`;
let rpcId = 1;
const rpc = async (actor, method, params) => {
  const res = await fetch(`${base}/mcp?actor=${actor}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }) });
  return (await res.json());
};
const tool = async (actor, name, args = {}) => {
  const { result } = await rpc(actor, 'tools/call', { name, arguments: args });
  const parsed = JSON.parse(result.content[0].text);
  assert.equal(result.isError, !parsed.ok);
  return parsed;
};
const member = (id, over = {}) => ({ id, name: id, controlled: false, hp: 100, max: 100, down: false, status: 'follow', directive: { intent: 'follow' }, position: [0, 0, 0], ...over });
const world = (over = {}) => ({ party: [member('caosheng', { controlled: true }), member('zengqian'), member('linhan')], enemies: [], mode: 'person', kills: 0, ...over });
const game = async (body) => (await fetch(`${base}/game`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173' }, body: JSON.stringify(body) })).json();

// MCP 握手和工具列表
const init = await rpc('zengqian', 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
assert.equal(init.result.protocolVersion, '2025-06-18');
assert.ok(init.result.capabilities.tools);
const note = await fetch(`${base}/mcp?actor=zengqian`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
assert.equal(note.status, 202);
const { result: { tools } } = await rpc('zengqian', 'tools/list');
assert.deepEqual(tools.map((t) => t.name), ['observe', 'act']);
assert.equal((await rpc('zengqian', 'nope')).error.code, -32601);
assert.equal((await fetch(`${base}/mcp`, { method: 'POST', body: '{}' })).status, 400, 'an agent must say who it is');

// 安全：别的网站进不来，本地来源放行
for (const path of ['/game', '/mcp?actor=zengqian']) {
  const blocked = await fetch(base + path, { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' });
  assert.equal(blocked.status, 403, path);
}
const preflight = await fetch(`${base}/game`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } });
assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173');

// 游戏没连上：明确报错，并等满时长，不让 Agent 空转
{
  const t0 = Date.now();
  const offline = await tool('zengqian', 'observe', { waitSeconds: .3 });
  assert.equal(offline.error.code, 'GAME_OFFLINE');
  assert.ok(Date.now() - t0 >= 280);
  assert.equal((await tool('zengqian', 'act', { intent: 'hold' })).error.code, 'GAME_OFFLINE');
}

// 模式关闭 / 不在群像
await game({ world: world({ party: [] }) });
assert.equal((await tool('zengqian', 'observe', { waitSeconds: 0 })).error.code, 'PARTY_OFF');
await game({ world: world() });
assert.equal((await tool('tongtong', 'observe', { waitSeconds: 0 })).error.code, 'NOT_IN_PARTY');

// 只看得到自己的视角，距离按自己算，敌人按远近排
{
  const w = world({ enemies: [{ type: 'tiejia', name: '铁甲人', hp: 100, position: [30, 0, 0] }, { type: 'jiashi', name: '甲士', hp: 50, position: [3, 0, 4] }] });
  const s = situationFor('zengqian', w);
  assert.equal(s.you.id, 'zengqian');
  assert.deepEqual(s.enemies.map((e) => [e.type, e.distance]), [['jiashi', 5], ['tiejia', 30]]);
  assert.ok(!s.allies.some((a) => a.id === 'zengqian'));
  assert.equal(s.allies.find((a) => a.id === 'caosheng').isPlayer, true);
}

// 事件全从局势差异推出
{
  const types = (prev, next) => diffEvents('zengqian', prev, next).map((e) => e.type);
  const hurt = (hp) => world({ party: [member('caosheng', { controlled: true }), member('zengqian', { hp }), member('linhan')] });
  assert.deepEqual(types(world(), world()), []);
  assert.deepEqual(types(hurt(100), hurt(80)), [], 'one hurt per quarter, not per hit');
  assert.deepEqual(types(hurt(80), hurt(70)), ['hurt']);
  assert.deepEqual(types(hurt(70), hurt(60)), []);
  assert.deepEqual(types(hurt(30), hurt(90)), []);
  const enemy = [{ type: 'jiashi', name: '甲士', hp: 100, position: [5, 0, 0] }];
  assert.deepEqual(types(world(), world({ enemies: enemy })), ['enemy_near']);
  assert.deepEqual(types(world({ enemies: enemy }), world()), ['area_clear']);
  const with_ = (o) => world({ party: [member('caosheng', { controlled: true }), member('zengqian', o), member('linhan')] });
  assert.deepEqual(types(with_({}), with_({ controlled: true })), ['control_lost']);
  assert.deepEqual(types(with_({ controlled: true }), with_({})), ['control_granted']);
  assert.deepEqual(types(with_({ hp: 10 }), with_({ hp: 0, down: true })), ['you_down']);
  assert.deepEqual(types(with_({ hp: 0, down: true }), with_({ hp: 45 })), ['you_rose']);
  const allyDown = world({ party: [member('caosheng', { controlled: true }), member('zengqian'), member('linhan', { hp: 0, down: true })] });
  assert.deepEqual(types(world(), allyDown), ['ally_down']);
  const going = (x) => with_({ directive: { intent: 'goto', position: [10, 0] }, position: [x, 0, 0] });
  assert.deepEqual(types(going(0), going(9)), ['arrived']);
  assert.deepEqual(types(going(9), going(9.5)), []);
}

// observe 在事件发生时提前返回，不用等满
{
  await game({ world: world() });
  await tool('zengqian', 'observe', { waitSeconds: 0 }); // 登记并清空
  const t0 = Date.now();
  const pending = tool('zengqian', 'observe', { waitSeconds: 10 });
  await new Promise((r) => setTimeout(r, 100));
  await game({ world: world({ enemies: [{ type: 'jiashi', name: '甲士', hp: 100, position: [5, 0, 0] }] }) });
  const seen = await pending;
  assert.ok(Date.now() - t0 < 2000, 'an event must wake the agent right away');
  assert.deepEqual(seen.data.events.map((e) => e.type), ['enemy_near']);
  assert.equal(seen.data.enemies[0].type, 'jiashi');
  await game({ world: world() });
  assert.deepEqual((await tool('zengqian', 'observe', { waitSeconds: 0 })).data.events.map((e) => e.type), ['area_clear']);
}

// act：指令交给游戏，等游戏确认后才返回；拒绝也如实传回
{
  const pendingAct = tool('zengqian', 'act', { intent: 'guard', target: 'linhan', say: '  我来掩护  ' });
  await new Promise((r) => setTimeout(r, 30));
  const { commands, agents } = await game({ world: world() });
  assert.ok(agents.includes('zengqian'));
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0].directive, { intent: 'guard', target: 'linhan' });
  assert.equal(commands[0].say, '我来掩护');
  assert.equal(commands[0].actor, 'zengqian');
  await game({ world: world(), results: [{ id: commands[0].id, result: { ok: true } }] });
  assert.equal((await pendingAct).ok, true);

  // 别人听到了，但不会被叫醒
  await tool('linhan', 'observe', { waitSeconds: 0 });
  const quiet = tool('zengqian', 'act', { say: '再说一句' });
  await new Promise((r) => setTimeout(r, 30));
  const round = await game({ world: world() });
  await game({ world: world(), results: [{ id: round.commands[0].id, result: { ok: true } }] });
  assert.equal((await quiet).ok, true);
  const t0 = Date.now();
  const heard = await tool('linhan', 'observe', { waitSeconds: .4 });
  assert.ok(Date.now() - t0 >= 380, 'hearing someone must not wake an agent');
  assert.deepEqual(heard.data.heard, [{ from: 'zengqian', text: '再说一句' }]);

  const refused = tool('zengqian', 'act', { intent: 'dance' });
  await new Promise((r) => setTimeout(r, 30));
  const r2 = await game({ world: world() });
  await game({ world: world(), results: [{ id: r2.commands[0].id, result: { ok: false, error: 'intent must be one of …' } }] });
  assert.equal((await refused).error.code, 'REJECTED');

  assert.equal((await tool('zengqian', 'act', {})).error.code, 'EMPTY_ACT');
  assert.equal((await tool('caosheng', 'act', { intent: 'hold' })).error.code, 'PLAYER_CONTROLLED');
}

server.close();
server.closeAllConnections?.();
console.log('PASS: MCP handshake, origin check, offline and party errors, per-actor view, events, wakeups, acks, chatter guard.');
