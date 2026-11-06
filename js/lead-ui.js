import { getLead } from './lead-config.js';
import { createLeadGallery } from './lead-gallery.js';

export function setupLeadUI(controller, camera) {
  const launcher=document.createElement('button');launcher.type='button';launcher.className='lead-launch';launcher.id='btn-leads';launcher.setAttribute('aria-label','打开主演图鉴');
  launcher.classList.add('tool-btn');launcher.title='主演图鉴：查看与切换角色 [P]';
  launcher.innerHTML='<span class="lead-launch-mark" aria-hidden="true">侠</span><span class="tool-label">图鉴 · <strong id="current-lead-name">曹晟</strong></span><kbd>P</kbd>';
  // 放进右上角工具栏，排在「群像」之后
  const party=document.getElementById('btn-party');
  if(party)party.after(launcher);else(document.querySelector('.hud-top-left')||document.body).appendChild(launcher);
  let stored=null;try{stored=localStorage.getItem('mirage-lead');}catch{/* Storage is optional in embedded previews. */}
  if(stored)controller.setCharacter(stored);
  const updateName=()=>launcher.querySelector('strong').textContent=getLead(controller.activeCharacter).name;
  updateName();
  // 组队后换人要经过 party（交换身体）；它接上之前退回到直接换模型
  let choose=(id)=>{controller.setCharacter(id);return true;};
  const remember=(id)=>{updateName();try{localStorage.setItem('mirage-lead',id);}catch{}};
  const gallery=createLeadGallery({
    onSelect(id){if(choose(id))remember(controller.activeCharacter);},
    onOpen(){controller.resetInput();controller.inputPaused=true;},
    onClose(){controller.resetInput();controller.inputPaused=false;camera.initialized=false;}
  });
  launcher.onclick=()=>gallery.open(controller.activeCharacter);
  const touch=document.createElement('nav');touch.className='touch-travel';touch.setAttribute('aria-label','触屏移动');
  touch.innerHTML='<div class="touch-directions"><button data-travel="forward" aria-label="前进">↑</button><button data-travel="left" aria-label="左转">←</button><button data-travel="backward" aria-label="后退">↓</button><button data-travel="right" aria-label="右转">→</button></div><div class="touch-extra"><button data-travel="up" aria-label="跳跃或上升">升</button><button data-travel="down" aria-label="下降">降</button><button data-travel="sprint" aria-label="加速">疾</button><button data-travel="attack" aria-label="攻击">攻</button></div>';
  document.body.appendChild(touch);
  touch.querySelectorAll('button').forEach(b=>{
    b.type='button';
    b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);controller.keys[b.dataset.travel]=true;if(b.dataset.travel==='attack')controller.attackQueued=true;b.classList.add('pressed');});
    const release=()=>{controller.keys[b.dataset.travel]=false;b.classList.remove('pressed');};
    ['pointerup','pointercancel','lostpointercapture'].forEach(t=>b.addEventListener(t,release));
  });
  return {gallery,launcher,remember,setChooser(fn){choose=fn;}};
}
