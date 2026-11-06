import * as THREE from 'three/webgpu';
import { ROSTER, getLead, LEAD_ACTIONS } from './lead-config.js';
import { createLeadCharacter } from './lead-characters.js';

export function createLeadGallery({ onSelect, onOpen, onClose }) {
  const dialog=document.createElement('dialog');dialog.id='lead-gallery';dialog.setAttribute('aria-label','主演图鉴');
  dialog.innerHTML=`
    <header class="lead-gallery-header"><div><span class="lead-eyebrow">海市蜃楼 · 人物志</span><h2>江湖众生相</h2></div><button class="lead-close" aria-label="关闭主演图鉴" type="button">返回江湖 <span>×</span></button></header>
    <div class="lead-stage" aria-label="角色三维预览，拖动旋转，滚轮缩放" tabindex="0"><div class="lead-stage-note">拖动环视 · 滚轮缩放</div><div class="lead-view-controls"><button data-view="0">正面</button><button data-view="1.5708">侧面</button><button data-view="3.1416">背面</button><button id="lead-face">近看</button><button id="lead-spin" aria-pressed="false">自动旋转</button></div></div>
    <aside class="lead-details"><span class="lead-eyebrow" id="lead-number"></span><h3 id="lead-name"></h3><p class="lead-caption" id="lead-caption"></p><p class="lead-description" id="lead-description"></p>
      <div class="lead-forms" id="lead-forms" role="group" aria-label="形态" hidden></div><div class="lead-rule"></div><div class="lead-roster" aria-label="全部人物">${ROSTER.map(c=>`<button data-lead="${c.id}" style="--lead-color:${c.color}" type="button"><span class="lead-seal">${c.name.slice(-1)}</span><span>${c.name}</span></button>`).join('')}</div>
      <div class="lead-actions" aria-label="预览动作">${Object.entries(LEAD_ACTIONS).map(([id,name])=>`<button data-action="${id}" type="button">${name}</button>`).join('')}</div>
      <button id="lead-use" class="lead-use" type="button">以此身入江湖</button><p id="lead-feedback" role="status" aria-live="polite"></p>
      <details class="lead-extra"><summary>拆件查看</summary><p>卡通演绎，背面衣饰含推断。</p><button id="lead-explode" type="button" aria-pressed="false">拆件查看</button><span id="lead-part" role="status"></span></details>
    </aside>`;
  document.body.appendChild(dialog);
  const stage=dialog.querySelector('.lead-stage'), scene=new THREE.Scene();scene.background=new THREE.Color('#e5dfd0');
  const camera=new THREE.PerspectiveCamera(32,1,.01,30);
  const hemi=new THREE.HemisphereLight('#ecf2fc','#b3a68a',2.4);scene.add(hemi);
  const key=new THREE.DirectionalLight('#fff0d9',1.5);key.position.set(2.2,4.6,3.6);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.bias=-.0004;key.shadow.normalBias=.012;Object.assign(key.shadow.camera,{left:-1.3,right:1.3,top:2.3,bottom:-.3,near:.5,far:10});key.shadow.radius=5;scene.add(key);
  // Half the key is shadowless: form still reads, but shadows on pale robes stay gentle.
  const fill=new THREE.DirectionalLight('#fff0d9',1.25);fill.position.copy(key.position);scene.add(fill);
  const rim=new THREE.DirectionalLight('#d5e7ff',2.2);rim.position.set(-3,3,-3);scene.add(rim);
  const floor=new THREE.Mesh(new THREE.CylinderGeometry(.9,1,.07,64),new THREE.MeshStandardNodeMaterial({color:'#c4b9a2',roughness:.9}));floor.position.y=-.045;scene.add(floor);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.84,.007,6,64),new THREE.MeshStandardNodeMaterial({color:'#a58b58',metalness:.3,roughness:.6}));ring.rotation.x=Math.PI/2;ring.position.y=-.006;scene.add(ring);
  // Soft contact patch, kept separate from the character's material.
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(.34,32),new THREE.MeshBasicNodeMaterial({color:'#716854',transparent:true,opacity:.14,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.002;shadow.scale.set(1, .65,1);scene.add(shadow);
  let rig=null, selected='caosheng', action='idle', time=0, yaw=.35,pitch=.12,distance=4.25, closeup=false,spin=false,exploded=false,active=false;
  let drag=null,previousFocus=null;
  const initialPositions=new Map();
  let frameFocus=.98, frameHeight=2, frameRadius=.45;
  function fitPose(){
    // Sample a full motion cycle once, keeping framing steady while the limbs move.
    const bounds=new THREE.Box3();
    const samples=action==='attack'?Array.from({length:17},(_,k)=>k/16*rig.attack.duration):[0,.25,.5,.75,1];
    for(const t of samples){
      rig.pose(action,t,1,1);rig.group.updateMatrixWorld(true);
      for(const part of rig.parts)if(part.visible)bounds.expandByObject(part);
    }
    frameFocus=(bounds.min.y+bounds.max.y)/2;
    frameHeight=bounds.max.y-bounds.min.y;
    frameRadius=Math.hypot(Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x)),Math.max(Math.abs(bounds.min.z),Math.abs(bounds.max.z)));
    rig.pose(action,time,1,1);
  }
  function choose(id){
    selected=getLead(id).id;rig?.dispose();rig=createLeadCharacter(selected);scene.add(rig.group);initialPositions.clear();
    rig.parts.forEach(p=>initialPositions.set(p,p.position.clone()));exploded=false;
    dialog.querySelector('#lead-explode').setAttribute('aria-pressed','false');
    const c=rig.config;dialog.querySelector('#lead-name').textContent=c.name;dialog.querySelector('#lead-caption').textContent=c.caption;
    dialog.querySelector('#lead-description').textContent=c.description;
    dialog.querySelector('#lead-number').textContent=`人物 ${String(ROSTER.findIndex(r=>r.id===(c.formOf||c.id))+1).padStart(2,'0')} / ${String(ROSTER.length).padStart(2,'0')}`;
    const seat=c.formOf||c.id,forms=getLead(seat).forms,box=dialog.querySelector('#lead-forms');
    dialog.querySelectorAll('[data-lead]').forEach(b=>{b.classList.toggle('selected',b.dataset.lead===seat);b.setAttribute('aria-pressed',String(b.dataset.lead===seat));});
    box.hidden=!forms;
    if(forms){box.innerHTML=forms.map(f=>`<button type="button" data-form="${f}" aria-pressed="${f===selected}" class="${f===selected?'selected':''}">${getLead(f).formLabel}</button>`).join('');box.querySelectorAll('[data-form]').forEach(b=>b.onclick=()=>{choose(b.dataset.form);setAction(action);});}
    dialog.querySelector('#lead-feedback').textContent='';time=0;fitPose();
  }
  function setAction(value){action=value;time=0;fitPose();dialog.querySelectorAll('[data-action]').forEach(b=>{b.classList.toggle('selected',b.dataset.action===action);b.setAttribute('aria-pressed',String(b.dataset.action===action));});}
  function close(){if(!active)return;active=false;dialog.close();document.body.classList.remove('lead-gallery-open');onClose?.();previousFocus?.focus();}
  dialog.querySelector('.lead-close').onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.querySelectorAll('[data-lead]').forEach(b=>b.onclick=()=>choose(b.dataset.lead));
  dialog.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>setAction(b.dataset.action));
  dialog.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{yaw=Number(b.dataset.view);spin=false;closeup=false;distance=4.25;dialog.querySelector('#lead-spin').setAttribute('aria-pressed','false');});
  dialog.querySelector('#lead-face').onclick=()=>{closeup=!closeup;distance=closeup?1.9:4.25;};
  dialog.querySelector('#lead-spin').onclick=e=>{spin=!spin;e.currentTarget.setAttribute('aria-pressed',String(spin));};
  dialog.querySelector('#lead-explode').onclick=e=>{exploded=!exploded;e.currentTarget.setAttribute('aria-pressed',String(exploded));if(!exploded)rig.parts.forEach(p=>p.position.copy(initialPositions.get(p)));};
  dialog.querySelector('#lead-use').onclick=()=>{onSelect(selected);close();};
  stage.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};stage.setPointerCapture(e.pointerId);spin=false;dialog.querySelector('#lead-spin').setAttribute('aria-pressed','false');});
  stage.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;yaw-=(e.clientX-drag.x)*.009;pitch=THREE.MathUtils.clamp(pitch+(e.clientY-drag.y)*.005,-.15,.6);drag.x=e.clientX;drag.y=e.clientY;});
  stage.addEventListener('pointerup',e=>{
    if(drag&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<5){
      const rect=stage.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
      const hit=ray.intersectObject(rig.group,true)[0];
      if(hit){const name=hit.object.name;dialog.querySelector('#lead-part').textContent=/hair|scalp|braid|fringe|lock/.test(name)?'发型':/eye|iris|brow|mouth|face/.test(name)?'面部':/robe|sleeve|collar|tunic|vest/.test(name)?'衣装':/boot|shoe|sole/.test(name)?'靴履':'配饰';}
    }drag=null;
  });
  stage.addEventListener('pointercancel',()=>drag=null);
  stage.addEventListener('wheel',e=>{e.preventDefault();distance=THREE.MathUtils.clamp(distance+e.deltaY*.002,1.1,6);},{passive:false});
  stage.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();yaw+=e.key==='ArrowLeft'?.2:-.2;}});
  return {
    scene,camera,get active(){return active;},
    open(id){if(active)return;previousFocus=document.activeElement;choose(id);setAction('idle');yaw=.35;pitch=.12;distance=4.25;closeup=false;spin=false;active=true;document.body.classList.add('lead-gallery-open');onOpen?.();dialog.showModal();dialog.querySelector('.lead-close').focus();},
    close,
    render(renderer,dt){
      time+=dt;rig.pose(action,time,1,dt);if(spin)yaw+=dt*.35;
      if(exploded){rig.group.updateMatrixWorld(true);rig.parts.forEach(p=>{p.position.copy(initialPositions.get(p));const world=p.getWorldPosition(new THREE.Vector3());const delta=world.sub(new THREE.Vector3(0,.95,0)).multiplyScalar(.32);const q=p.parent.getWorldQuaternion(new THREE.Quaternion()).invert();delta.applyQuaternion(q).divideScalar(rig.config.height);p.position.add(delta);});}
      const rect=stage.getBoundingClientRect(),w=window.innerWidth,h=window.innerHeight;
      camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();
      const focus=closeup?rig.metrics.faceY:frameFocus-frameHeight*.05; // leaves the feet clear of the view buttons
      const tanHalfFov=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
      const fitDistance=Math.max(3.1,frameHeight*.65/tanHalfFov,frameRadius*1.16/(tanHalfFov*camera.aspect));
      const d=closeup?distance:distance/4.25*fitDistance;
      camera.position.set(Math.sin(yaw)*d,focus+Math.sin(pitch)*d,Math.cos(yaw)*d);camera.lookAt(0,focus,0);
      renderer.setViewport(rect.left,rect.top,rect.width,rect.height);renderer.render(scene,camera);renderer.setViewport(0,0,w,h);
    },
    snapshot(){return {active,selected,action,yaw,closeup,exploded,stats:rig?.getStats()};}
  };
}
