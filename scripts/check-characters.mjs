import assert from 'node:assert/strict';
import { Scene, Box3, Vector3, Quaternion } from 'three/webgpu';
import { LEADS, LEAD_ACTIONS } from '../js/lead-config.js';
import { createLeadCharacter } from '../js/lead-characters.js';
import { ThirdPersonControllerManager } from '../js/controllers.js';

const results=[];
for(const {id} of LEADS){
  const rig=createLeadCharacter(id);
  assert.ok(rig.parts.length>50, `${id}: missing detail modules`);
  for(const action of Object.keys(LEAD_ACTIONS))for(const time of [0,.25,.5,1.25]){
    rig.pose(action,time,1,1);rig.group.updateMatrixWorld(true);
    rig.group.traverse(o=>{
      assert.ok(o.matrixWorld.elements.every(Number.isFinite),`${id}/${action}/${o.name}: invalid transform`);
      if(o.isMesh){
        assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite),`${id}: invalid geometry`);
        assert.ok(Array.from(o.geometry.attributes.normal.array).every(Number.isFinite),`${id}: invalid normals`);
      }
    });
  }
  rig.pose('idle',0,0,1);rig.group.updateMatrixWorld(true);
  const bodyBounds=new Box3().setFromObject(rig.group);
  assert.ok(bodyBounds.min.y > -.1,`${id}: geometry below ground`);
  for(const side of ['left','right']){
    const foot=rig.group.getObjectByName(`${side}-sole`);
    const bounds=new Box3().setFromObject(foot);
    assert.ok(Math.abs(bounds.min.y)<.025,`${id}: sole not grounded (${bounds.min.y})`);
  }
  // Legs must stay under the skirt at every gait phase (riding tucks the skirt up on purpose).
  const point=new Vector3();
  for(const action of ['idle','walk','run','chain','attack']){
    let worst=Infinity,where='';
    for(let frame=0;frame<48;frame++){
      const time=frame/48*2.4;
      rig.pose(action,time,1,1);rig.group.updateMatrixWorld(true);
      for(const {thigh} of rig.legs)thigh.traverse(o=>{
        if(!o.isMesh)return;
        const p=o.geometry.attributes.position;
        for(let i=0;i<p.count;i+=3){
          point.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);
          rig.skirt.worldToLocal(point);
          const clearance=rig.skirtClearance(point.x,point.y,point.z);
          if(clearance!==null&&clearance<worst){worst=clearance;where=`${o.name} t=${time.toFixed(2)}`;}
        }
      });
    }
    assert.ok(worst>=0,`${id}/${action}: leg pokes through skirt (${worst.toFixed(3)}, ${where})`);
  }
  // Gait: feet alternate. A quarter cycle on, one foot leads and the other trails; the planted foot stays on the ground.
  for(const [action,cadence,minGap] of [['walk',8,.1],['run',12.5,.14]]){
    const foot=(side)=>new Vector3().setFromMatrixPosition(rig.group.getObjectByName(`${side}-sole`).matrixWorld);
    const settle=(t)=>{for(let k=0;k<3;k++)rig.pose(action,t,1,1);rig.group.updateMatrixWorld(true);};
    const scale=rig.group.scale.y;
    settle(Math.PI/2/cadence);
    const leftAhead=(foot('left').z-foot('right').z)/scale;
    settle(Math.PI*1.5/cadence);
    const rightAhead=(foot('right').z-foot('left').z)/scale;
    assert.ok(leftAhead>minGap&&rightAhead>minGap,`${id}/${action}: feet do not alternate (${leftAhead.toFixed(3)}, ${rightAhead.toFixed(3)})`);
    if(action==='walk')for(let frame=0;frame<16;frame++){
      settle(frame/16*2*Math.PI/cadence);
      // The sole's lowest point, not its centre: a rolling foot stands on its toe or heel.
      const low=Math.min(...['left','right'].map(side=>new Box3().setFromObject(rig.group.getObjectByName(`${side}-sole`)).min.y))/scale;
      assert.ok(low>-.03&&low<.03,`${id}/walk: planted foot off the ground (${low.toFixed(3)} at frame ${frame})`);
    }
    rig.pose('idle',0,0,1);
  }
  // Attack: hands stay on their targets (so on the weapon), feet stay out of the ground, and everything goes home.
  const {attack}=rig,palm={R:rig.group.getObjectByName('right-palm'),L:rig.group.getObjectByName('left-palm')};
  const restParents=new Map();
  rig.pose('idle',0,0,1);
  for(const name of ['held-prop','bow-grip','knife-hilt--1','knife-hilt-1']){
    const o=rig.group.getObjectByName(name);if(o)restParents.set(o,o.parent);
  }
  // Knives leave and return exactly where they rest, so neither end of the draw can jump.
  const {drawn}=attack,stored={R:rig.group.getObjectByName('knife-hilt--1'),L:rig.group.getObjectByName('knife-hilt-1')};
  for(const hand of ['R','L']){
    const object=stored[hand];if(!object||!drawn?.[hand])continue;
    rig.pose('idle',0,0,1);rig.group.updateMatrixWorld(true);
    const rest=attack.torso.worldToLocal(object.getWorldPosition(new Vector3()));
    const restTurn=attack.torso.getWorldQuaternion(new Quaternion()).invert().multiply(object.getWorldQuaternion(new Quaternion()));
    for(const t of drawn[hand]){
      rig.pose('attack',t-(t===drawn[hand][1]?.001:0),1,1);rig.group.updateMatrixWorld(true);
      const miss=rest.distanceTo(attack.handTargets[hand]);
      assert.ok(miss<.012,`${id}: ${hand} hand is ${miss.toFixed(3)} from ${object.name} at t=${t}`);
      const angle=object.quaternion.angleTo(restTurn);
      assert.ok(angle<.05,`${id}: ${object.name} turned ${angle.toFixed(3)} rad from its sheath at t=${t}`);
    }
    rig.pose('idle',0,0,1);
  }
  // Sheaths on the back stay behind the tunic and sash and above the skirt.
  rig.group.updateMatrixWorld(true);
  rig.group.traverse(o=>{
    if(o.name!=='knife-sheath')return;
    const p=o.geometry.attributes.position,v=new Vector3();
    for(let i=0;i<p.count;i++){
      attack.torso.worldToLocal(v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld));
      assert.ok(v.z<-.112,`${id}: sheath enters the back (z=${v.z.toFixed(3)})`);
      assert.ok(v.y>-.05,`${id}: sheath enters the skirt (y=${v.y.toFixed(3)})`);
    }
  });
  let worstGrip=0,gripAt='',lowest=Infinity,lowestAt=0;
  for(let frame=0;frame<=96;frame++){
    const t=frame/96*attack.duration;
    rig.pose('attack',t,1,1);rig.group.updateMatrixWorld(true);
    for(const hand of ['R','L']){
      const at=attack.torso.worldToLocal(palm[hand].getWorldPosition(new Vector3()));
      const miss=at.distanceTo(attack.handTargets[hand]);
      if(miss>worstGrip){worstGrip=miss;gripAt=`${hand} t=${t.toFixed(2)}`;}
    }
    for(const side of ['left','right']){
      const y=new Box3().setFromObject(rig.group.getObjectByName(`${side}-sole`)).min.y;
      if(y<lowest){lowest=y;lowestAt=t;}
    }
  }
  assert.ok(worstGrip<.02,`${id}: hand misses its target by ${worstGrip.toFixed(3)} (${gripAt})`);
  assert.ok(lowest>-.05,`${id}: foot sinks into the ground (${lowest.toFixed(3)} t=${lowestAt.toFixed(2)})`);
  assert.ok(attack.strike<attack.cancelAt&&attack.cancelAt<attack.duration,`${id}: attack timing out of order`);
  rig.pose('attack',attack.strike+.02,1,1);
  rig.pose('idle',0,0,1);rig.group.updateMatrixWorld(true);
  for(const [o,parent] of restParents)assert.equal(o.parent,parent,`${id}: ${o.name} not returned after attack`);
  for(const name of ['nocked-arrow','knife-blade','case-chamber']){
    const o=rig.group.getObjectByName(name);
    if(o)assert.equal(o.visible,false,`${id}: ${name} still showing after attack`);
  }
  assert.equal(rig.hips.position.y,.5,`${id}: hips not back at rest`);
  results.push({id,...rig.getStats()});
  const geometries=new Set(rig.parts.map(p=>p.geometry));let disposed=0;
  geometries.forEach(g=>g.addEventListener('dispose',()=>disposed++));
  rig.dispose();rig.dispose();assert.equal(disposed,geometries.size,'Dispose exactly once');
}
globalThis.window={addEventListener(){}};
const scene=new Scene(),controller=new ThirdPersonControllerManager(scene);
for(const {id} of LEADS){
  const before=controller.getActiveEntity().position.clone();controller.setCharacter(id);
  assert.ok(controller.getActiveEntity().position.equals(before),'Switching identity moved the player');
  for(const [mode,entity] of Object.entries(controller.entities)){
    if(!entity.charRig){assert.equal(mode,"flight");continue;}
    assert.equal(entity.charRig.config.id,id,`${mode}: stale identity`);
    assert.equal(entity.charRig.group.parent,entity.mesh,`${mode}: detached rig`);
    assert.equal(entity.mesh.children.filter(c=>c.name.startsWith('lead-')).length,1,`${mode}: duplicate player`);
  }
}
for(const mode of ['person','horse','chain','flight']){
  controller.setMode(mode);controller.keys.forward=true;
  for(let i=0;i<60;i++)controller.update(1/60,i/60);
  assert.ok(controller.getActiveEntity().position.toArray().every(Number.isFinite));
  assert.ok(controller.getActiveEntity().speed>0,`${mode}: movement input ineffective`);
  controller.resetInput();
  controller.teleportActiveTo(0, 126, Math.PI, 28, mode, .45);
  const entity = controller.getActiveEntity();
  assert.equal(entity.speed, 0, `${mode}: teleport must stop movement`);
  assert.ok(entity.mesh.position.equals(entity.position), `${mode}: teleport left mesh behind`);
  if (mode === 'flight') assert.equal(entity.charRig, null, 'flight: the UFO carries no character');
  else assert.equal(entity.charRig.group.userData.action,
    ({person:'idle',horse:'ride',chain:'chain'})[mode], `${mode}: wrong teleport pose`);
}
// 铁索：走到下面自动挂上，W 走到另一头自动落地；从上端同样能回来；刚落地不会马上又挂回去。
{
  const { CHAIN_ZONES }=await import('../js/world-config.js');
  const autos=[];controller.callbacks.onModeAuto=(m)=>autos.push(m);
  const run=(s)=>{for(let i=0;i<s*60;i++)controller.update(1/60,i/60);};
  controller.resetInput();
  controller.teleportActiveTo(0,-195.5,Math.PI,null,'person');
  run(.5);
  assert.equal(controller.activeMode,'person','should not grab the chain while standing still');
  controller.keys.forward=true;run(.6);
  assert.equal(controller.activeMode,'chain','walking under the chain did not board it');
  run(12);
  assert.equal(controller.activeMode,'person','did not land at the mirage');
  let p=controller.getActiveEntity().position;
  assert.ok(p.y>235&&p.z<-308,`landed at ${p.y},${p.z}`);
  run(.3);
  assert.equal(controller.activeMode,'person','re-boarded walking away from the top');
  controller.resetInput();
  // 转身走回城门洞：挂上去，W 是往下滑
  controller.teleportActiveTo(0,-314,0,240.2,'person');controller.keys.forward=true;run(1.2);
  assert.equal(controller.activeMode,'chain',`top end did not board, stopped at ${controller.getActiveEntity().position.toArray().map(v=>v.toFixed(1))} speed ${controller.getActiveEntity().speed.toFixed(1)}`);
  assert.equal(controller.getActiveEntity().travelDir,-1,'W should head down from the top');
  run(12);
  p=controller.getActiveEntity().position;
  assert.equal(controller.activeMode,'person','did not land back at Dengzhou');
  assert.ok(p.z>CHAIN_ZONES[0].maxZ&&p.y<60,`landed at ${p.y},${p.z}`);
  run(.3);assert.equal(controller.activeMode,'person','re-boarded walking away from the bottom');
  // 倒退走进上索区（按住 S）：S 继续往下滑，不在索头抽搐
  controller.resetInput();
  controller.teleportActiveTo(0,-314,Math.PI,240.2,'person');controller.keys.backward=true;run(2.2);
  assert.equal(controller.activeMode,'chain','backing in did not board');
  run(12);
  assert.equal(controller.activeMode,'person','backing in should still reach Dengzhou');
  assert.ok(controller.getActiveEntity().position.y<60,'S slid the wrong way');
  assert.ok(controller.getActiveEntity().position.z>CHAIN_ZONES[0].maxZ,'S walked back under the chain');
  // 骑马上索，下来还是骑马；飞鸢不会被抓上去；传送进区域不会触发
  controller.resetInput();
  controller.teleportActiveTo(0,-195.5,Math.PI,null,'horse');controller.keys.forward=true;run(.8);
  assert.equal(controller.activeMode,'chain','horse did not board');
  run(12);assert.equal(controller.activeMode,'horse','should land back on the horse');
  controller.resetInput();
  controller.teleportActiveTo(0,-208,Math.PI,62,'flight');controller.keys.forward=true;run(.3);
  assert.equal(controller.activeMode,'flight','flight must not grab the chain');
  controller.resetInput();
  controller.teleportActiveTo(0,-306,0,240.2,'person');run(.3);
  assert.equal(controller.activeMode,'person','teleporting into a zone must not board');
  controller.callbacks.onModeAuto=null;
  controller.teleportActiveTo(0,126,Math.PI,null,'person');
}
// Attack input, on foot only.
for(const {id} of LEADS){
  controller.teleportActiveTo(0,126,Math.PI,null,'person');controller.setCharacter(id);
  const person=controller.getActiveEntity(),timing=person.charRig.attack,sounds=[];
  controller.callbacks.onAttackSound=s=>sounds.push(s);
  person.onGround=true;
  let t=0;const step=(seconds)=>{for(let i=0;i<Math.round(seconds*60);i++)controller.update(1/60,t+=1/60);};
  const action=()=>person.charRig.group.userData.action;
  step(.1);
  controller.attackQueued=true; // a tap that began and ended between two frames
  step(.05);
  assert.equal(action(),'attack',`${id}: key did not start the attack`);
  const planted=person.position.clone();
  controller.keys.forward=true;controller.keys.left=true;const heading=person.heading;
  step(timing.cancelAt-.2);
  assert.ok(person.position.distanceTo(planted)<.7,`${id}: slid while striking`);
  assert.equal(person.heading,heading,`${id}: turned while striking`);
  assert.equal(action(),'attack',`${id}: strike interrupted by movement`);
  assert.equal(sounds.length,timing.second&&timing.second.t<timing.cancelAt-.15?2:1,`${id}: strike sound count`);
  step(.3);
  assert.notEqual(action(),'attack',`${id}: movement must break the follow-through`);
  controller.resetInput();step(.4);
  controller.keys.attack=true;step(.05);controller.keys.attack=false;
  step(timing.duration+.1);
  assert.equal(action(),'idle',`${id}: attack must end by itself`);
  controller.keys.attack=true;step(.05);
  controller.setMode('horse');controller.keys.attack=false;
  assert.equal(controller.entities.person.attack,null,`${id}: switching mode must cancel the attack`);
  controller.keys.attack=true;step(.1);controller.keys.attack=false;
  assert.equal(controller.getActiveEntity().charRig.group.userData.action,'ride',`${id}: attack leaked into riding`);
  controller.setMode('person');
}
for(const e of Object.values(controller.entities))e.charRig?.dispose();
console.table(results);
// Combat: every lead can hurt, a strike only reaches what it should, and enemies die and come back.
{
  const { createEnemySystem, ENEMY_TYPES }=await import('../js/enemies.js');
  const { HOME }=await import('../js/homeworld-config.js');
  const sys=createEnemySystem(new Scene());
  const e=sys.enemies.find(o=>o.type==='jiashi'),ent={position:e.pos.clone().add(new Vector3(0,0,-2)),heading:0};
  for(const {id} of LEADS){
    const {hit}=createLeadCharacter(id).attack;
    assert.ok(hit&&hit.damage>0&&hit.range>0&&hit.arc>0,`${id}: attack has no hit data`);
    sys.update(.016,ent,'person',null);
    e.hp=e.def.hp;e.state='idle';e.knock.set(0,0,0);ent.position.copy(e.pos).add(new Vector3(0,0,-2));
    assert.ok(sys.strike(ent,hit)>=1,`${id}: strike missed an enemy two metres ahead`);
    assert.ok(e.hp<e.def.hp,`${id}: strike did no damage`);
    e.hp=e.def.hp;e.state='idle';
    ent.heading=Math.PI;
    assert.equal(sys.strike(ent,{...hit,arc:.4}),0,`${id}: strike hit an enemy behind the player`);
    ent.heading=0;
  }
  // 包哥: one blow kills every enemy type, bosses included, even with a companion's damage scale; other leads do not.
  {
    const bs=createEnemySystem(new Scene()),{hit}=createLeadCharacter('baoge').attack;
    assert.equal(hit.lethal,true,'baoge: attack must be lethal');
    for(const damageScale of [1,.35])for(const o of bs.enemies){
      o.dormant=false;o.state='idle';o.hp=o.def.hp;o.knock.set(0,0,0);
      const at={position:o.pos.clone().add(new Vector3(0,0,-2)),heading:0,damageScale,vitals:{hp:100,max:100}};
      assert.ok(bs.strike(at,hit)>=1,`baoge: missed ${o.type}`);
      assert.equal(o.state,'dead',`baoge: ${o.type} survived one blow (scale ${damageScale})`);
      assert.equal(o.hp,0,`baoge: ${o.type} hp not emptied`);
    }
    const boss=bs.enemies.find(o=>o.type==='bailiTrue');
    boss.dormant=false;boss.state='idle';boss.hp=boss.def.hp;
    for(const {id} of LEADS.filter(c=>c.id!=='baoge')){
      const {hit:other}=createLeadCharacter(id).attack;
      assert.ok(!other.lethal,`${id}: only baoge is lethal`);
    }
    bs.strike({position:boss.pos.clone().add(new Vector3(0,0,-2)),heading:0},createLeadCharacter('caosheng').attack.hit);
    assert.notEqual(boss.state,'dead','an ordinary blow must not one-shot the true Baili');
  }
  // Aiming: a blow started with an enemy behind turns to it and lands; with nobody near it leaves the heading alone.
  {
    const hit={range:4,arc:.6,damage:1,pierce:false},back={position:e.pos.clone().add(new Vector3(0,0,2)),heading:0};
    back.heading=sys.aim(back,hit);
    assert.ok(Math.abs(Math.cos(back.heading)+1)<.01,'aim did not turn to the enemy behind');
    assert.equal(sys.strike(back,hit),1,'turned blow missed');
    e.hp=e.def.hp;
    assert.equal(sys.aim({position:new Vector3(3000,0,3000),heading:0},hit),null,'aimed at nobody');
  }
  // Killing it: stops counting as alive, counts a kill, and returns after the wait once the player has gone.
  const before=sys.player.kills;
  e.state='idle';e.hp=e.def.hp;
  while(e.state!=='dead')sys.damage(e,20,ent.position);
  assert.equal(sys.player.kills,before+1,'kill not counted');
  assert.equal(sys.strike(ent,{range:9,arc:6,damage:9,pierce:true}),0,'a dead enemy was hit again');
  const away={position:new Vector3(HOME.x,0,0),heading:0};
  for(let t=0;t<47;t+=.5)sys.update(.5,away,'person',null);
  assert.notEqual(e.state,'dead','enemy never came back');
  assert.equal(e.hp,e.def.hp,'enemy came back hurt');
  // Armour: the iron men take less than the soldiers from the same blow.
  const t=sys.enemies.find(o=>o.type==='tiejia');sys.damage(t,100,null);
  assert.equal(t.def.hp-t.hp,Math.round(100*ENEMY_TYPES.tiejia.armor),'armour not applied');
  // A crowd takes turns: however many surround the player, only a couple swing at once.
  {
    const crowd=createEnemySystem(new Scene()),pack=crowd.enemies.filter(o=>o.type==='jiashi'&&o.home.y===0);
    const hero={position:pack[0].pos.clone(),heading:0};
    pack.forEach((o,i)=>{o.state='chase';o.cooldown=0;o.pos.copy(hero.position).add(new Vector3(Math.cos(i*1.57)*1.6,0,Math.sin(i*1.57)*1.6));});
    let most=0;
    for(let t=0;t<3;t+=.05){crowd.player.hp=100;crowd.update(.05,hero,'person',null);most=Math.max(most,crowd.enemies.filter(o=>o.state==='windup').length);}
    assert.ok(pack.length>=4,'crowd test needs at least four soldiers');
    assert.equal(most,2,'a crowd swung all at once');
    // One standing between the camera and the hero steps out of the sightline.
    const lane=createEnemySystem(new Scene()),o=lane.enemies[0],h={position:o.pos.clone().add(new Vector3(0,0,-2)),heading:0};
    const cam={position:h.position.clone().add(new Vector3(0,2.5,4.5)),quaternion:new Quaternion()};
    o.state='recover';o.timer=9;
    for(let t=0;t<1;t+=.05)lane.update(.05,h,'person',cam);
    assert.ok(Math.abs(o.pos.x-h.position.x)>1.3,'enemy stayed in the camera lane');
  }
  // 击倒回气，且不能超过上限
  {
    const hs=createEnemySystem(new Scene()),foe=hs.enemies.find(o=>o.type==='jiashi');
    hs.player.hp=50;
    while(foe.state!=='dead')hs.damage(foe,30,null);
    assert.equal(hs.player.hp,58,'kill should restore a little health');
  }
  // 百里渊：替身倒下才放出真身，真身的横扫要先亮圈、跑出圈就打不中。
  {
    const phases=[];
    const bs=createEnemySystem(new Scene(),{onBossPhase(p){phases.push(p);}});
    const dbl=bs.enemies.find(o=>o.type==='bailiDouble'),tru=bs.enemies.find(o=>o.type==='bailiTrue');
    assert.ok(tru.dormant,'the real Baili should start hidden');
    assert.equal(bs.strike({position:tru.pos.clone().add(new Vector3(0,0,-1)),heading:0},{range:9,arc:6,damage:9,pierce:true})>0&&tru.hp<tru.def.hp,false,'a hidden boss took damage');
    while(dbl.state!=='dead')bs.damage(dbl,50,null);
    assert.deepEqual(phases,['reveal'],'double did not reveal the real one');
    assert.equal(bs.player.hp,bs.player.max,'reveal heal should not overflow');
    assert.ok(!tru.dormant&&tru.state==='chase'&&tru.hp===tru.def.hp,'real Baili did not wake up');
    assert.ok(bs.boss({position:tru.pos.clone()})===tru,'boss bar should follow the real one');
    // 横扫：站在圈里挨打，跑到圈外不挨打
    const hero={position:tru.pos.clone().add(new Vector3(0,0,2.5)),heading:0};
    tru.swings=tru.def.sweep.every-1;tru.cooldown=0;tru.state='chase';
    bs.update(.016,hero,'person',null);
    assert.ok(tru.sweeping&&tru.state==='windup','sweep did not start');
    assert.ok(tru.rig.telegraph.visible||tru.timer>0,'sweep has no warning');
    hero.position.copy(tru.pos).add(new Vector3(0,0,tru.def.sweep.radius+2));
    const before=bs.player.hp;
    for(let t=0;t<tru.def.sweep.windup+.1;t+=.05)bs.update(.05,hero,'person',null);
    assert.equal(bs.player.hp,before,'dodged sweep still hit');
    while(tru.state!=='dead')bs.damage(tru,80,null);
    assert.deepEqual(phases,['reveal','defeated'],'defeat not announced');
    // 真身从北门走向殿中会撞上案台：得能绕过去走到主角跟前
    {
      const { buildBailiMansion }=await import('../js/baili-mansion.js');
      const { colliders }=buildBailiMansion(new Scene());
      const blocker=(x,y,z,r)=>{let rx=x,rz=z;for(const c of colliders){if(rx+r<=c.minX||rx-r>=c.maxX||rz+r<=c.minZ||rz-r>=c.maxZ)continue;const o=[rx+r-c.minX,c.maxX-rx+r,rz+r-c.minZ,c.maxZ-rz+r],m=Math.min(...o);if(m===o[0])rx=c.minX-r;else if(m===o[1])rx=c.maxX+r;else if(m===o[2])rz=c.minZ-r;else rz=c.maxZ+r;}return {x:rx,z:rz};};
      const walk=createEnemySystem(new Scene(),{resolve:blocker});
      const w1=walk.enemies.find(o=>o.type==='bailiDouble'),w2=walk.enemies.find(o=>o.type==='bailiTrue');
      while(w1.state!=='dead')walk.damage(w1,50,null);
      const target={position:w1.home.clone().add(new Vector3(0,0,8)),heading:Math.PI};
      for(let t=0;t<14;t+=.05){walk.player.hp=100;walk.update(.05,target,'person',null);}
      assert.ok(w2.pos.distanceTo(target.position)<w2.def.reach+1,`real Baili stuck at ${w2.pos.x-w1.home.x},${w2.pos.z-w1.home.z}`);
    }
    // 走远后整组复活，真身重新藏起来
    const far={position:new Vector3(HOME.x,0,0),heading:0};
    for(let t=0;t<47;t+=.5)bs.update(.5,far,'person',null);
    assert.ok(dbl.state!=='dead'&&tru.dormant&&tru.hp===tru.def.hp,'boss pair did not reset');
  }
  // 百里府：从官道一路走进秘殿，每一段都得走得通，地面高度不能断。
  {
    const { BAILI,bailiHeight,octagonDistance }=await import('../js/baili-config.js');
    const { buildBailiMansion }=await import('../js/baili-mansion.js');
    const { getWorldGroundHeight,getTerrainHeight,TELEPORT_LOCATIONS }=await import('../js/world-config.js');
    const { colliders }=buildBailiMansion(new Scene());
    const X=BAILI.x,R=.7;
    const blockedAt=(x,y,z)=>colliders.find(c=>!(y+1.8<c.minY||y>c.maxY)&&x+R>c.minX&&x-R<c.maxX&&z+R>c.minZ&&z-R<c.maxZ);
    const route=[[X,240],[X,190],[X,170],[X,150],[X,128],[X+7,128],[X,118],[X,75],[X,62],[X+25,62],[X+36,62],[X+58,62],[X+66,62],[X+66,36],[X+56,36],[X+56,24],[X+56,12],[X+56,6]];
    for(let i=1;i<route.length;i++){
      const [ax,az]=route[i-1],[bx,bz]=route[i],n=Math.ceil(Math.hypot(bx-ax,bz-az)/.4);
      let last=getWorldGroundHeight(ax,az,0);
      for(let k=0;k<=n;k++){
        const x=ax+(bx-ax)*k/n,z=az+(bz-az)*k/n,y=getWorldGroundHeight(x,z,0),hit=blockedAt(x,y,z);
        assert.ok(!hit,`route blocked at dx=${(x-X).toFixed(1)} z=${z.toFixed(1)} by ${hit&&JSON.stringify([hit.minX-X,hit.maxX-X,hit.minZ,hit.maxZ])}`);
        assert.ok(Math.abs(y-last)<.45,`ground jumps ${(y-last).toFixed(2)}m at dx=${(x-X).toFixed(1)} z=${z.toFixed(1)}`);
        last=y;
      }
    }
    // 站在水上是走不到的：岸线和栏杆围死了（从岸上往水里走会被挡）
    assert.ok(blockedAt(X+59.6,0,100),'lake shore is open');
    assert.ok(blockedAt(X+3.5,1,100),'pier rail is open');
    // 地形在府内和官道上是平的
    for(const [x,z] of [[X-70,40],[X+70,200],[X,214],[-200,240],[-390,240]])assert.ok(Math.abs(getTerrainHeight(x,z))<.02,`terrain not flat at ${x},${z}: ${getTerrainHeight(x,z)}`);
    // 传送点都落在空地上，高度和地面一致
    for(const k of ['bailiGate']){
      const t=TELEPORT_LOCATIONS[k];
      assert.ok(!blockedAt(t.x,t.y,t.z),`${k} lands inside a wall`);
      assert.ok(Math.abs(getWorldGroundHeight(t.x,t.z,t.y)-t.y)<.01,`${k} y mismatch`);
    }
    // 敌人不刷在墙里；Boss 出生点在殿内
    const es=createEnemySystem(new Scene());
    for(const e of es.enemies.filter(o=>o.home.x<-300)){
      assert.ok(!blockedAt(e.home.x,e.home.y,e.home.z),`${e.type} spawns inside a wall at dx=${e.home.x-X} z=${e.home.z}`);
      assert.ok(Math.abs(getWorldGroundHeight(e.home.x,e.home.z,e.home.y)-e.home.y)<.01,`${e.type} spawn y wrong`);
    }
    assert.ok(octagonDistance(es.enemies.find(o=>o.type==='bailiTrue').home.x-X,es.enemies.find(o=>o.type==='bailiTrue').home.z)<BAILI.octagon.apothem,'real Baili spawns outside the hall');
  }
  // 顾府（EP10–EP11）：从南顺城街过石栏桥廊、穿过“顧府”大门进入前院与“篤行致遠”正堂全线畅通；
  // 院内有顾府护院与二公子顾廷美 Boss，顾廷美战败后触发左耳被削落、捂耳跪地流血与断耳落地效果。
  {
    const { GU_MANSION,inGuMansion,getLocationInfo,TELEPORT_LOCATIONS }=await import('../js/world-config.js');
    const { buildDengzhouCity }=await import('../js/dengzhou-city.js');
    const { colliders }=buildDengzhouCity(new Scene());
    const R=.65;
    const blockedAt=(x,y,z)=>colliders.find(c=>!(y+1.8<c.minY||y>c.maxY)&&x+R>c.minX&&x-R<c.maxX&&z+R>c.minZ&&z-R<c.maxZ);
    // 传送点 gufuGate 落在门外空地上
    const tp=TELEPORT_LOCATIONS.gufuGate;
    assert.ok(tp&&!blockedAt(tp.x,tp.y,tp.z),'gufuGate teleport blocked');
    // 从街口 (78, 131) 沿中轴穿过顧府大门 (78, 124.5)、前院 (78, 108) 直达篤行致遠堂内 (78, 90) 畅通无阻
    const guRoute=[[GU_MANSION.x,131],[GU_MANSION.x,124.5],[GU_MANSION.x,112],[GU_MANSION.x,99.5],[GU_MANSION.x,90]];
    for(let i=1;i<guRoute.length;i++){
      const [ax,az]=guRoute[i-1],[bx,bz]=guRoute[i],n=Math.ceil(Math.hypot(bx-ax,bz-az)/.35);
      for(let k=0;k<=n;k++){
        const x=ax+(bx-ax)*k/n,z=az+(bz-az)*k/n,hit=blockedAt(x,0,z);
        assert.ok(!hit,`Gu Mansion route blocked at x=${x.toFixed(1)} z=${z.toFixed(1)}`);
      }
    }
    // 围墙与正堂后墙能正常阻挡
    assert.ok(blockedAt(GU_MANSION.minX,0,105),'Gu Mansion west wall is open');
    assert.ok(blockedAt(GU_MANSION.maxX,0,105),'Gu Mansion east wall is open');
    assert.ok(blockedAt(GU_MANSION.x,0,GU_MANSION.minZ),'Gu Mansion north wall is open');
    assert.ok(inGuMansion(GU_MANSION.x,108),'inGuMansion check failed');
    assert.equal(getLocationInfo(GU_MANSION.x,0,108,'person').realm,'登州城 · 顾府','Gu Mansion location plaque realm mismatch');

    // 顾府护院与顾廷美出生点不卡墙，且击败顾廷美后触发左耳受伤跪地捂耳效果
    const guPhases=[];
    const gs=createEnemySystem(new Scene(),{onBossPhase(p){guPhases.push(p);}});
    const guards=gs.enemies.filter(o=>o.type==='gufuGuard');
    const gu=gs.enemies.find(o=>o.type==='gutingmei');
    assert.ok(guards.length>=6,'Gu Mansion should have at least 6 gufuGuard enemies');
    assert.ok(gu,'Gu Mansion should spawn Boss gutingmei');
    for(const o of [...guards,gu]){
      assert.ok(inGuMansion(o.home.x,o.home.z),`${o.type} spawned outside Gu Mansion`);
      assert.ok(!blockedAt(o.home.x,o.home.y,o.home.z),`${o.type} spawned inside collider at ${o.home.x},${o.home.z}`);
    }
    // 交手时 Boss 血条指向顾廷美
    const hero={position:gu.pos.clone().add(new Vector3(0,0,2)),heading:Math.PI};
    gs.damage(gu,10,hero.position);
    assert.equal(gs.boss(hero),gu,'boss() should return gutingmei when fighting in Gu Mansion');
    assert.equal(gu.earInjured,false,'gutingmei ear should be intact before defeat');
    assert.equal(gu.rig.earL.visible,true,'gutingmei left ear mesh should be visible before defeat');
    assert.equal(gu.rig.earWound.visible,false,'gutingmei ear wound should be hidden before defeat');
    // 击败顾廷美：触发 guDefeated，左耳隐去，鲜血创口、捂耳血手印、断耳与血泊显现，且 2.5 秒后仍跪在地上捂住左耳不消失
    while(gu.state!=='dead')gs.damage(gu,50,hero.position);
    assert.deepEqual(guPhases,['guDefeated'],'gutingmei defeat phase not fired');
    assert.equal(gu.earInjured,true,'gutingmei earInjured flag should be true after defeat');
    assert.equal(gu.rig.earL.visible,false,'gutingmei intact left ear should be hidden after being sliced off');
    assert.equal(gu.rig.earWound.visible,true,'gutingmei bleeding ear wound should be visible after defeat');
    assert.equal(gu.rig.handBlood.visible,true,'gutingmei bloody left hand should be visible after defeat');
    assert.equal(gu.rig.earAftermath.visible,true,'gutingmei severed ear and blood pool aftermath should be visible');
    for(let t=0;t<2.5;t+=.1)gs.update(.1,hero,'person',null);
    assert.equal(gu.rig.group.visible,true,'gutingmei should stay visible kneeling on the ground clutching his injured ear');
    assert.ok(gu.rig.body.position.y<-.2&&gu.rig.legL.rotation.x>1.2&&gu.rig.armL.scale.y<.6,'gutingmei should be in kneeling left-ear-clutching pose');
    // 玩家远离等待复活后，顾廷美恢复完好状态
    const farAway={position:new Vector3(HOME.x,0,0),heading:0};
    for(let t=0;t<47;t+=.5)gs.update(.5,farAway,'person',null);
    assert.equal(gu.state,'idle','gutingmei should revive after player leaves');
    assert.equal(gu.earInjured,false,'gutingmei earInjured should reset on revive');
    assert.equal(gu.rig.earL.visible,true,'gutingmei left ear should be restored on revive');
    assert.equal(gu.rig.earWound.visible,false,'gutingmei ear wound should hide on revive');
  }
  // 清风楼（EP01 18:24–24:15）：门前伙计【东子】只站在清风楼门口迎客；
  // 从南顺城街穿过「清風樓」牌楼大门、太湖石假山前院进入「驚鶴堂」正厅全线畅通；
  // 楼内盘踞清风楼捉刀人、光头络腮胡刀客与 Boss【三爷】（执巨型狼牙棒，含范围横扫与战败通报）。
  {
    const { QINGFENG_TOWER,inQingfengTower,getLocationInfo,TELEPORT_LOCATIONS }=await import('../js/world-config.js');
    const { buildDengzhouCity }=await import('../js/dengzhou-city.js');
    const city=buildDengzhouCity(new Scene());
    const { colliders,dongzi }=city;
    const R=.65;
    const blockedAt=(x,y,z)=>colliders.find(c=>!(y+1.8<c.minY||y>c.maxY)&&x+R>c.minX&&x-R<c.maxX&&z+R>c.minZ&&z-R<c.maxZ);
    const tp=TELEPORT_LOCATIONS.qingfengGate;
    assert.ok(tp&&!blockedAt(tp.x,tp.y,tp.z),'qingfengGate teleport blocked');
    // 从南顺城街 (-78, 131) 经清风楼牌楼门 (-78, 124.5)、前院 (-78, 110) 直入惊鹤堂正厅 (-78, 88) 畅通无阻
    const qfRoute=[[QINGFENG_TOWER.x,131],[QINGFENG_TOWER.x,124.5],[QINGFENG_TOWER.x,110],[QINGFENG_TOWER.x,96],[QINGFENG_TOWER.x,88]];
    for(let i=1;i<qfRoute.length;i++){
      const [ax,az]=qfRoute[i-1],[bx,bz]=qfRoute[i],n=Math.ceil(Math.hypot(bx-ax,bz-az)/.35);
      for(let k=0;k<=n;k++){
        const x=ax+(bx-ax)*k/n,z=az+(bz-az)*k/n,hit=blockedAt(x,0,z);
        assert.ok(!hit,`Qingfeng Tower route blocked at x=${x.toFixed(1)} z=${z.toFixed(1)}`);
      }
    }
    assert.ok(blockedAt(QINGFENG_TOWER.minX,0,105),'Qingfeng Tower west wall is open');
    assert.ok(blockedAt(QINGFENG_TOWER.maxX,0,105),'Qingfeng Tower east wall is open');
    assert.ok(blockedAt(QINGFENG_TOWER.x,0,QINGFENG_TOWER.minZ),'Qingfeng Tower north wall is open');
    assert.ok(inQingfengTower(QINGFENG_TOWER.x,108),'inQingfengTower check failed');
    assert.equal(getLocationInfo(QINGFENG_TOWER.x,0,124,'person').realm,'登州城 · 清风楼','Qingfeng Tower gate realm mismatch');
    assert.equal(getLocationInfo(QINGFENG_TOWER.x,0,124,'person').street,'清风楼门口 · 东子迎客','Qingfeng Tower gate street mismatch');
    assert.equal(getLocationInfo(QINGFENG_TOWER.x,0,90,'person').street,'惊鹤堂 · 清风楼正厅','Qingfeng Tower hall street mismatch');

    // 验证【东子】只站在清风楼门口
    assert.ok(dongzi,'Dongzi character rig should be created at Qingfeng Tower gate');
    assert.equal(dongzi.config.id,'dongzi');
    assert.equal(dongzi.config.name,'东子');
    assert.ok(dongzi.group.getObjectByName('shoulder-towel-front'),'Dongzi should wear his white shoulder towel');
    assert.equal(dongzi.group.userData.fixedAtQingfengGate,true,'Dongzi must be marked fixedAtQingfengGate');
    assert.equal(dongzi.group.position.x,QINGFENG_TOWER.dongziX);
    assert.equal(dongzi.group.position.z,QINGFENG_TOWER.dongziZ);
    assert.ok(Math.abs(dongzi.group.position.z-QINGFENG_TOWER.gateZ)<2,'Dongzi must stand right at the entrance of Qingfeng Tower');
    city.update(12.5);
    assert.equal(dongzi.group.position.x,QINGFENG_TOWER.dongziX,'Dongzi must never leave the Qingfeng Tower entrance');
    assert.equal(dongzi.group.position.z,QINGFENG_TOWER.dongziZ,'Dongzi must never leave the Qingfeng Tower entrance');
    assert.equal(dongzi.group.userData.action,'idle','Dongzi should stay in welcoming idle pose at the gate');

    // 验证清风楼内的反派与 Boss 三爷
    const qfPhases=[];
    const qs=createEnemySystem(new Scene(),{onBossPhase(p){qfPhases.push(p);}});
    const hunters=qs.enemies.filter(o=>o.type==='qingfengHunter');
    const brutes=qs.enemies.filter(o=>o.type==='qingfengBrute');
    const sanye=qs.enemies.find(o=>o.type==='sanye');
    assert.ok(hunters.length>=4,'Qingfeng Tower should have at least 4 qingfengHunter enemies');
    assert.ok(brutes.length>=2,'Qingfeng Tower should have at least 2 qingfengBrute enemies');
    assert.ok(sanye,'Qingfeng Tower should spawn Boss sanye');
    for(const o of [...hunters,...brutes,sanye]){
      assert.ok(inQingfengTower(o.home.x,o.home.z),`${o.type} spawned outside Qingfeng Tower`);
      assert.ok(!blockedAt(o.home.x,o.home.y,o.home.z),`${o.type} spawned inside collider at ${o.home.x},${o.home.z}`);
    }
    const hero={position:sanye.pos.clone().add(new Vector3(0,0,2)),heading:Math.PI};
    qs.damage(sanye,15,hero.position);
    assert.equal(qs.boss(hero),sanye,'boss() should return sanye when fighting in Qingfeng Tower');
    while(sanye.state!=='dead')qs.damage(sanye,60,hero.position);
    assert.deepEqual(qfPhases,['sanyeDefeated'],'sanye defeat phase not fired');
  }
  // The player can be hurt and is told when down.
  let downed=0;
  const sys2=createEnemySystem(new Scene(),{onPlayerDown(){downed++;}});
  const foe=sys2.enemies[0],victim={position:foe.pos.clone().add(new Vector3(0,0,1)),heading:0};
  for(let t=0;t<120&&!downed;t+=.05){victim.position.copy(foe.pos).add(new Vector3(0,0,1));sys2.update(.05,victim,'person',null);}
  assert.equal(downed,1,'player never went down under attack');
  sys2.healPlayer();assert.equal(sys2.player.hp,sys2.player.max,'heal failed');
}
console.log(`PASS: ${LEADS.length} actors × six poses, grounding, finite geometry, disposal, all-mode identity and movement, attack grips and input.`);
