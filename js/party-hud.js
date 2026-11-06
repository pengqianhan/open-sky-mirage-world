// js/party-hud.js
// 右上队伍栏（只在群像模式显示）：一人一格，血条与当前动向。点一下（或按 Tab）换人。
import * as THREE from 'three/webgpu';
import { PARTY_ROSTER } from './party.js';
import { INTENT_LABELS } from './actor-brain.js';

const BUBBLE_MS = 4500;
const STATUS = { ...INTENT_LABELS, player: '由你操控', fight: '交战', down: '重伤' };

export function setupPartyHud({ party, onPick }) {
  const bar = document.createElement('nav');
  bar.className = 'party-bar';
  bar.setAttribute('aria-label', '队伍，点击切换操控角色');
  bar.hidden = true;
  bar.innerHTML = PARTY_ROSTER.map((c) => `<button type="button" class="party-member" data-seat="${c.id}" style="--lead-color:${c.color}"><span class="party-seal"></span><span class="party-info"><span class="party-name"></span><span class="party-status"></span><span class="party-track"><span class="party-fill"></span></span></span></button>`).join('');
  document.body.appendChild(bar);
  const rows = new Map([...bar.querySelectorAll('.party-member')].map((el) => [el.dataset.seat, {
    el, seal: el.querySelector('.party-seal'), name: el.querySelector('.party-name'), status: el.querySelector('.party-status'), fill: el.querySelector('.party-fill'), key: ''
  }]));
  bar.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('.party-member') : null;
    if (btn) { onPick(btn.dataset.seat); btn.blur(); }
  });
  let wait = 0;
  const bubbles = new Map(), projected = new THREE.Vector3();
  function clearBubble(id) { bubbles.get(id)?.el.remove(); bubbles.delete(id); }
  /** 台词来自外部 Agent，只当纯文本显示 */
  function say(id, text) {
    clearBubble(id);
    const el = document.createElement('div');
    el.className = 'party-bubble';
    el.textContent = text;
    document.body.appendChild(el);
    bubbles.set(id, { el, until: performance.now() + BUBBLE_MS });
  }
  function placeBubbles(camera) {
    const now = performance.now(), members = party.snapshot(), placed = [];
    for (const [id, bubble] of bubbles) {
      const m = members.find((x) => x.id === id);
      if (!m || now > bubble.until) { clearBubble(id); continue; }
      projected.set(m.position[0], m.position[1] + 1.9, m.position[2]).project(camera);
      bubble.el.hidden = projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
      if (bubble.el.hidden) continue;
      // 气泡以 left 居中、以 top 为底边。几个人同时说话时后说的往上挪，别叠在一起
      const x = (projected.x * .5 + .5) * innerWidth, w = bubble.el.offsetWidth, h = bubble.el.offsetHeight;
      let y = (1 - (projected.y * .5 + .5)) * innerHeight;
      for (let moved = true; moved;) {
        moved = false;
        for (const o of placed) {
          if (Math.abs(o.x - x) < (o.w + w) / 2 + 4 && Math.abs(o.y - y) < (o.h + h) / 2 + 4) { y = o.y - (o.h + h) / 2 - 4; moved = true; }
        }
      }
      placed.push({ x, y, w, h });
      bubble.el.style.left = `${x}px`;
      bubble.el.style.top = `${y}px`;
    }
  }
  function render() {
    for (const m of party.snapshot()) {
      const row = rows.get(m.id), pct = Math.round(m.hp / m.max * 100), key = `${m.name}|${m.status}|${pct}|${m.controlled}|${m.down}`;
      if (row.key === key) continue;
      row.key = key;
      row.seal.textContent = m.name.slice(-1);
      row.name.textContent = m.name;
      row.status.textContent = STATUS[m.status] || m.status;
      row.fill.style.transform = `scaleX(${pct / 100})`;
      row.el.classList.toggle('is-player', m.controlled);
      row.el.classList.toggle('is-down', m.down);
      row.el.classList.toggle('is-fight', m.status === 'fight');
      row.el.setAttribute('aria-pressed', String(m.controlled));
      row.el.setAttribute('aria-label', `${m.name}，${STATUS[m.status] || m.status}，气血 ${pct}%`);
    }
  }
  return {
    update(dt, camera) {
      if (bubbles.size && camera) placeBubbles(camera);
      if (bar.hidden) return;
      wait -= dt;
      if (wait <= 0) { wait = .15; render(); }
    },
    render,
    say,
    /** 哪些角色背后有外部 Agent，队伍栏上标出来 */
    setAgents(ids) { for (const [id, row] of rows) row.el.classList.toggle('has-agent', ids.includes(id)); },
    setVisible(on) { bar.hidden = !on; if (on) render(); else for (const id of [...bubbles.keys()]) clearBubble(id); }
  };
}
