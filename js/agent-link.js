// js/agent-link.js
// 开发环境下把群像接到本地桥（scripts/party-bridge.mjs）。桥没开就安静地隔几秒再试，游戏照常由规则 AI 运行。
const URL_GAME = 'http://127.0.0.1:8787/game';
const FAST_MS = 250, IDLE_MS = 1000, RETRY_MS = 5000, TIMEOUT_MS = 1500, ENEMY_RANGE = 80;

export function createAgentLink({ party, enemies, controller, onSay, onAgents }) {
  let results = [];

  function world() {
    const on = party.enabled, lead = controller.getActiveEntity().position;
    const visible = on ? enemies.enemies.filter((e) => e.state !== 'dead' && !e.dormant && e.pos.distanceTo(lead) < ENEMY_RANGE) : [];
    return {
      party: party.snapshot(),
      mode: controller.activeMode,
      kills: enemies.player.kills,
      enemies: visible.map((e) => ({ type: e.type, name: e.def.name, boss: !!e.def.boss, hp: Math.round(e.hp / e.def.hp * 100), position: [e.pos.x, e.pos.y, e.pos.z] }))
    };
  }

  function apply({ id, actor, directive, say }) {
    const result = directive ? party.command(actor, directive) : { ok: party.enabled };
    if (result.ok && say) onSay(actor, say);
    return { id, result };
  }

  async function tick() {
    let wait = party.enabled ? FAST_MS : IDLE_MS;
    try {
      const response = await fetch(URL_GAME, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ world: world(), results }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      results = [];
      const { commands, agents } = await response.json();
      results = commands.map(apply);
      onAgents(agents);
    } catch {
      wait = RETRY_MS;
      onAgents([]);
    }
    setTimeout(tick, wait);
  }
  tick();
}
