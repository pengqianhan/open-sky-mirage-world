// scripts/party-agents.mjs
// 启动桥和一组 Agent：npm run agents -- zengqian=claude linhan=codex --minutes 10
// 每个 Agent 跑在空目录里，不读项目规则，只给游戏工具，避免它去读源码或改文件。
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LEADS } from '../js/lead-config.js';
import { startBridge, DEFAULT_PORT } from './party-bridge.mjs';

const RESTART_MS = 5000;

function parseArgs(argv) {
  const plan = [];
  // 动机很简单，默认都用最便宜的模型和低思考强度
  let minutes = 10, claudeModel = 'haiku', codexModel = 'gpt-6-luna', effort = 'low';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--minutes') minutes = Number(argv[++i]);
    else if (a === '--claude-model') claudeModel = argv[++i];
    else if (a === '--codex-model') codexModel = argv[++i];
    else if (a === '--effort') effort = argv[++i];
    else {
      const [actor, kind] = a.split('=');
      if (!LEADS.some((l) => l.id === actor) || !['claude', 'codex'].includes(kind)) throw new Error(`看不懂参数 ${a}，应为 角色=claude 或 角色=codex`);
      plan.push({ actor, kind });
    }
  }
  if (!(minutes > 0)) throw new Error('--minutes 要大于 0');
  return { plan: plan.length ? plan : [{ actor: 'zengqian', kind: 'claude' }, { actor: 'linhan', kind: 'codex' }], minutes, claudeModel, codexModel, effort };
}

function briefing(actor, url) {
  const lead = LEADS.find((l) => l.id === actor);
  return `你是武侠世界《海市蜃楼》里的 ${lead.name}（${lead.caption}）：${lead.description}
你和同伴一起行动，玩家操控其中一人。你通过 game 工具控制自己（连接：${url}）。
走位和出招游戏会自动完成，反应很快；你只决定动机，所以不需要频繁下令。

一直重复这个循环，不要停，也不要写总结：
1. 调用 observe（waitSeconds 用 30）。
2. 收到 enemy_near、hurt、ally_down、control_granted 时，调用一次 act：按你的性格选动机，并用 say 说一句符合身份的短话，不超过 20 字。这是玩家能看到你的方式，所以这些时刻不要沉默。
   台词只说戏里的话，绝不提控制权、玩家、工具、事件这些戏外的词。
   动机可以和现在一样，也要说话：只有 follow、guard、attack、hold、flee 这些选择，保护别人用 guard，想主动杀敌用 attack。
3. 没有事件，或者只有 area_clear、arrived，就直接回到第 1 步，不要调用 act。
收到 control_lost 表示玩家在操控你，别调用 act，继续 observe 等 control_granted。
返回 ok:false 时按 hint 做。除了这两个工具，你不需要也不要使用任何别的东西。`;
}

function commandFor({ actor, kind }, { port, claudeModel, codexModel, effort }) {
  const url = `http://127.0.0.1:${port}/mcp?actor=${actor}`;
  const prompt = briefing(actor, url), start = '开始。先调用 observe。';
  if (kind === 'claude') {
    return ['claude', ['-p', start, '--model', claudeModel, '--effort', effort, '--system-prompt', prompt,
      '--tools', '', '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence',
      '--mcp-config', JSON.stringify({ mcpServers: { game: { type: 'http', url } } }),
      '--allowedTools', 'mcp__game__observe,mcp__game__act']];
  }
  return ['codex', ['exec', '--skip-git-repo-check', '--ephemeral', '--ignore-user-config', '--ignore-rules', '-s', 'read-only',
    '-m', codexModel,
    '-c', `model_reasoning_effort="${effort}"`,
    '-c', `mcp_servers.game.url="${url}"`,
    '-c', 'mcp_servers.game.tool_timeout_sec=60',
    '-c', 'mcp_servers.game.default_tools_approval_mode="approve"',
    `${prompt}\n\n${start}`]];
}

const options = parseArgs(process.argv.slice(2));
/** 每次工具调用记一行。Claude 的 -p 模式只在结束时输出，靠这一行才看得到它在做什么 */
function logCall(actor, tool, args, result) {
  if (!result.ok) return console.log(`[${actor}] ${tool} ✗ ${result.error.code}`);
  if (tool === 'act') return console.log(`[${actor}] act ${JSON.stringify(args)}`);
  const events = result.data.events.map((e) => e.type).join(',') || '无事件';
  console.log(`[${actor}] observe → ${events}`);
}

const { server, port } = await startBridge({ port: Number(process.env.PARTY_BRIDGE_PORT) || DEFAULT_PORT, log: logCall });
const root = join(tmpdir(), 'sky-mirage-agents');
const children = new Set();
let stopping = false;

function launch(spec) {
  if (stopping) return;
  const cwd = join(root, spec.actor);
  mkdirSync(cwd, { recursive: true });
  const [bin, args] = commandFor(spec, { ...options, port });
  const child = spawn(bin, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  const log = (chunk) => { for (const line of String(chunk).split('\n')) if (line.trim()) console.log(`[${spec.actor}/${spec.kind}] ${line}`); };
  child.stdout.on('data', log);
  child.stderr.on('data', log);
  child.on('error', (error) => console.error(`[${spec.actor}/${spec.kind}] 启动失败：${error.message}`));
  child.on('exit', (code) => {
    children.delete(child);
    if (stopping) return;
    console.log(`[${spec.actor}/${spec.kind}] 退出（${code}），${RESTART_MS / 1000} 秒后重启`);
    setTimeout(() => launch(spec), RESTART_MS);
  });
}

function stop(reason) {
  if (stopping) return;
  stopping = true;
  console.log(`停止：${reason}`);
  for (const child of children) child.kill('SIGTERM');
  server.close();
  server.closeAllConnections?.();
  setTimeout(() => { rmSync(root, { recursive: true, force: true }); process.exit(0); }, 800);
}

process.on('SIGINT', () => stop('Ctrl-C'));
process.on('SIGTERM', () => stop('SIGTERM'));
setTimeout(() => stop(`到达 ${options.minutes} 分钟上限`), options.minutes * 60000);
console.log(`桥：127.0.0.1:${port}；${options.plan.map((p) => `${p.actor}=${p.kind}`).join(' ')}；${options.minutes} 分钟后自动停止。到游戏里按 T 打开群像。`);
options.plan.forEach(launch);
