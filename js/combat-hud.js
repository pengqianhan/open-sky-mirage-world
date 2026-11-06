// js/combat-hud.js
// 战斗界面：玩家血条、受伤红晕、伤害数字、击倒提示。
import * as THREE from 'three/webgpu';

export function setupCombatHud(camera) {
  const bar = document.createElement('div');
  bar.className = 'combat-hp';
  bar.innerHTML = '<span>气血</span><span class="combat-hp-track"><span class="combat-hp-fill"></span></span><span>击倒 <b>0</b></span>';
  const fill = bar.querySelector('.combat-hp-fill'), kills = bar.querySelector('b');
  const bossBar = document.createElement('div');
  bossBar.className = 'combat-boss';
  bossBar.innerHTML = '<span class="combat-boss-name"></span><span class="combat-boss-track"><span class="combat-boss-fill"></span></span>';
  const bossName = bossBar.querySelector('.combat-boss-name'), bossFill = bossBar.querySelector('.combat-boss-fill');
  document.body.append(bossBar);
  const vignette = document.createElement('div'); vignette.className = 'combat-hurt';
  const toast = document.createElement('div'); toast.className = 'combat-toast';
  document.body.append(bar, vignette, toast);
  let toastTimer = 0;
  const say = (text, ms) => {
    toast.textContent = text; toast.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('on'), ms);
  };
  const p = new THREE.Vector3();
  return {
    update(player, boss = null) {
      fill.style.transform = `scaleX(${player.hp / player.max})`;
      bossBar.classList.toggle('on', !!boss);
      if (boss) { bossName.textContent = boss.def.name; bossFill.style.transform = `scaleX(${boss.hp / boss.def.hp})`; }
    },
    say(text, ms = 2600) { say(text, ms); },
    setKills(count) { kills.textContent = count; },
    floatDamage(pos, amount, scale) {
      p.copy(pos); p.y += 1.7 * scale; p.project(camera);
      if (p.z > 1) return;
      const d = document.createElement('div');
      d.className = 'combat-dmg'; d.textContent = amount;
      d.style.left = `${(p.x * .5 + .5) * 100 + (Math.random() - .5) * 3}%`;
      d.style.top = `${(1 - (p.y * .5 + .5)) * 100}%`;
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 760);
    },
    announce(text, count) { say(text, 1300); kills.textContent = count; },
    hurt() { vignette.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => vignette.classList.remove('on'))); },
    down() { say('重伤倒下', 1500); }
  };
}
