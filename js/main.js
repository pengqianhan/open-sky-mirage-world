// js/main.js
// 《海市蜃楼》登州与蜃景 3D 交互世界主入口：
// 组装 Three.js WebGPU 渲染管线、登州城、登云铁索、空中蜃景、四模式控制器、3 个跟随镜头与双界舆图

import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { createPostProcessing } from './post-processing.js';
import {
  TELEPORT_LOCATIONS,
  GU_MANSION,
  inGuMansion,
  QINGFENG_TOWER,
  inQingfengTower,
  getLocationInfo,
  isTypingInField
} from './world-config.js';
import { buildDengzhouCity } from './dengzhou-city.js';
import { buildSkyMirage } from './sky-mirage.js';
import { buildIronChain } from './iron-chain.js';
import { createPedestrianSystem } from './pedestrians.js';
import { ThirdPersonControllerManager } from './controllers.js';
import { getLead } from './lead-config.js';
import { createParty } from './party.js';
import { setupPartyHud } from './party-hud.js';
import { createAgentLink } from './agent-link.js';
import { CameraSystem, CAMERA_PRESETS } from './cameras.js';
import { buildHomeworld } from './homeworld.js';
import { buildGoldenCity } from './golden-city.js';
import { buildBailiMansion } from './baili-mansion.js';
import { BAILI, inBailiEstate } from './baili-config.js';
import { createEnemySystem } from './enemies.js';
import { setupCombatHud } from './combat-hud.js';
import { isHomeworld, isPast, homeLightId, pastWeatherKey, HOME_PORTAL, MIRAGE_PORTAL, HOME, PLAZA, DECK, PAST } from './homeworld-config.js';
import { LightingSystem } from './lighting.js';
import { WorldMapSystem } from './map-system.js';
import { MirageAudioSystem } from './audio-system.js';
import { setupLeadUI } from './lead-ui.js';

async function initApp() {
  const container = document.getElementById('canvas-container');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingStatus = document.getElementById('loading-status');
  const loadingTrack = loadingOverlay ? loadingOverlay.querySelector('.loader-track') : null;
  const loadingFill = document.getElementById('loading-progress');

  const setLoadingProgress = (p) => {
    if (!loadingFill) return;
    if (loadingTrack) loadingTrack.classList.remove('is-indeterminate');
    loadingFill.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
  };

  async function showLoadingStage(message, progress = null) {
    if (loadingStatus) loadingStatus.textContent = message;
    if (progress !== null) {
      setLoadingProgress(progress);
    } else if (loadingTrack) {
      loadingTrack.classList.add('is-indeterminate');
    }
    await new Promise((resolve) => setTimeout(resolve, 16));
  }

  await showLoadingStage('正在初始化 WebGPU 渲染引擎...', 0.1);

  const renderer = new THREE.WebGPURenderer({
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  await renderer.init();

  await showLoadingStage('正在构建苍穹与日夜光影...', 0.25);
  const scene = new THREE.Scene();
  const lightingSystem = new LightingSystem(scene, renderer);

  await showLoadingStage('正在生成登州群山盆地、白灰城门、双望楼与桃花红灯闹市...', 0.45);
  const childrenBeforeWorld = scene.children.length;
  const dengzhou = buildDengzhouCity(scene);

  await showLoadingStage('正在构建空中蜃景（浮空岩岛、旋涡云洞、重檐主殿与天外母舰）...', 0.65);
  const skyMirage = buildSkyMirage(scene);

  await showLoadingStage('正在修建百里渊府（水榭、书房与八角秘殿）...', 0.72);
  const bailiMansion = buildBailiMansion(scene);

  await showLoadingStage('正在架设横跨云海的【登云玄铁长索】连接登州与蜃景...', 0.80);
  const ironChain = buildIronChain(scene);

  await showLoadingStage('正在生成登州街市行人与蜃景内城列阵玄甲武士...', 0.88);
  const pedestrians = createPedestrianSystem(scene);

  // 登州这一层的所有对象：进入母星时整层隐藏，省去绘制
  const earthLayer = scene.children.slice(childrenBeforeWorld);

  await showLoadingStage('正在展开童童口中的天外母星...', 0.91);
  const homeworld = buildHomeworld(scene);
  await showLoadingStage('正在从星图镜里照出他们当年的城...', 0.92);
  const pastCity = buildGoldenCity(scene);

  const allColliders = [...dengzhou.colliders, ...bailiMansion.colliders, ...skyMirage.colliders, ...homeworld.colliders, ...pastCity.colliders];
  const controllerManager = new ThirdPersonControllerManager(scene, allColliders);
  const cameraSystem = new CameraSystem(renderer.domElement, controllerManager);
  const { gallery: leadGallery, remember: rememberLead, setChooser: setLeadChooser } = setupLeadUI(controllerManager, cameraSystem);
  let party = null;

  await showLoadingStage('正在配置 ACES 电影级调色与泛光后期管线...', 0.94);
  const scenePass = pass(scene, cameraSystem.camera);
  const scenePassColor = scenePass.getTextureNode('output');
  const colorGrade = createPostProcessing(renderer, scenePassColor);
  const renderPipeline = new THREE.RenderPipeline(renderer, colorGrade.outputNode);

  // ---------------------------------------------------------------------------
  // UI 控件与交互绑定
  // ---------------------------------------------------------------------------
  const modeButtons = document.querySelectorAll('[data-mode]');
  const cameraButtons = document.querySelectorAll('[data-camera]');
  const timeButtons = document.querySelectorAll('[data-time]');
  const teleportButtons = document.querySelectorAll('[data-teleport]');
  const hudToggleBtn = document.getElementById('btn-toggle-hud');
  const soundButton = document.getElementById('btn-sound');
  const modeSwitch = document.getElementById('mode-switch');

  const elFps = document.getElementById('hud-fps');
  const elMode = document.getElementById('hud-active-mode');
  const elCamera = document.getElementById('hud-active-camera');
  const elSpeed = document.getElementById('hud-speed');
  const elSpeedMeter = document.getElementById('hud-speed-meter');
  const elAltitude = document.getElementById('hud-altitude');
  const elRealm = document.getElementById('hud-realm-badge');
  const elLocation = document.getElementById('hud-location');
  const elControlsHint = document.getElementById('hud-controls-hint');

  const controlHints = {
    person: [[['W', 'S'], '前行 / 后退'], [['A', 'D'], '转向'], [['Shift'], '疾奔'], [['Space'], '武侠轻功'], [['F', 'J'], '出招'], [['Tab'], '换人'], [['拖拽'], '环视天际']],
    horse:  [[['W', 'S'], '策马 / 勒缰'], [['A', 'D'], '转向'], [['Shift'], '快马加鞭'], [['拖拽'], '环视天际']],
    chain:  [[['W'], '沿铁索前进，到头自动落地'], [['S'], '往回走'], [['Space', 'Shift'], '流云飞爪加速']],
    flight: [[['W', 'S'], '飞碟推进'], [['A', 'D'], '转向'], [['Shift'], '加速'], [['Space', 'E'], '升高'], [['Q', 'C'], '降低'], [['拖拽'], '环视总览']]
  };

  const topSpeedKmh = { person: 52, horse: 94, chain: 140, flight: 324 };

  function renderControlHints(mode) {
    if (!elControlsHint) return;
    const items = (controlHints[mode] || []).filter(([[key]]) => key === 'Tab' ? party?.enabled : !(key === '拖拽' && party?.enabled)).map(([keys, action]) => {
      const item = document.createElement('span');
      item.className = 'hint';
      for (const key of keys) {
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        item.appendChild(kbd);
      }
      const label = document.createElement('span');
      label.className = 'hint-label';
      label.textContent = action;
      item.appendChild(label);
      return item;
    });
    elControlsHint.replaceChildren(...items);
  }

  function placeModeIndicator() {
    const active = modeSwitch ? modeSwitch.querySelector('.mode-btn.active') : null;
    if (!active) return;
    modeSwitch.style.setProperty('--ind-x', `${active.offsetLeft}px`);
    modeSwitch.style.setProperty('--ind-w', `${active.offsetWidth}px`);
  }

  function selectMode(mode) {
    controllerManager.setMode(mode);
    syncModeUi(mode);
  }

  /** 铁索没有按钮：挂在索上时，亮着的还是上索前的步行或策马 */
  function syncModeUi(mode) {
    const lit = mode === 'chain' ? controllerManager.entities.chain.returnMode : mode;
    modeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === lit);
    });
    document.body.dataset.mode = mode;
    placeModeIndicator();
    const ent = controllerManager.getActiveEntity();
    if (elMode) elMode.textContent = ent.label;
    renderControlHints(mode);
  }

  function selectCamera(camId, snap = false) {
    cameraSystem.setCameraPreset(camId, snap);
    cameraButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-camera') === camId);
    });
    const preset = cameraSystem.getActivePreset();
    if (elCamera) elCamera.textContent = preset.name;
  }

  function cycleCamera(step) {
    const n = CAMERA_PRESETS.length;
    const idx = CAMERA_PRESETS.findIndex((p) => p.id === cameraSystem.activePresetId);
    selectCamera(CAMERA_PRESETS[(idx + step + n) % n].id, true);
  }

  let selectedTimeId = 'day';
  let realm = 'earth'; // earth | home | past，各自一层，只画当前这层

  // 日间/夜间三处通用：登州用原预设，母星和旧都用自己的版本
  function applyWeather() {
    if (realm === 'earth') {
      lightingSystem.applyPreset(selectedTimeId, true);
    } else {
      const key = realm === 'past' ? pastWeatherKey(selectedTimeId) : selectedTimeId;
      homeworld.setWeather(key);
      lightingSystem.applyPreset(homeLightId(key), true);
    }
    colorGrade.applyPreset(lightingSystem.activePresetId);
  }

  function selectTime(timeId) {
    selectedTimeId = timeId;
    timeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-time') === timeId);
    });
    applyWeather();
  }

  function syncRealm(x) {
    const now = isPast(x) ? 'past' : isHomeworld(x) ? 'home' : 'earth';
    if (now === realm) return;
    realm = now;
    earthLayer.forEach((o) => { o.visible = realm === 'earth'; });
    homeworld.group.visible = realm === 'home';
    pastCity.group.visible = realm === 'past';
    homeworld.dome.visible = realm !== 'earth';
    lightingSystem.sky.visible = realm === 'earth';
    applyWeather();
  }

  // 虫洞与登天光柱：走进去触发全屏过场，黑场时传送。radius 内触发，离开 radius+3.4 才重新生效，免得落地立刻再走一次。
  const TRANSITS = [
    { x: MIRAGE_PORTAL.x, y: MIRAGE_PORTAL.y, z: MIRAGE_PORTAL.z, radius: 2.6, line: '童童说：他们的世界，起初和这里是一样的。', to: [HOME.x, 168, Math.PI, 2.4] },
    { x: HOME_PORTAL.x, y: HOME_PORTAL.y, z: HOME_PORTAL.z, radius: 2.6, line: '魂魄沿虫洞归来 —— 登州，还在。', to: [MIRAGE_PORTAL.x - 10, MIRAGE_PORTAL.z, -Math.PI / 2, MIRAGE_PORTAL.y] },
    { x: HOME.x + PLAZA.x, y: 0, z: PLAZA.z, radius: 3.6, line: '权贵们生活在空中的城池里。', to: [HOME.x, DECK.padZ - 8, Math.PI, DECK.y] },
    { x: HOME.x, y: DECK.y, z: DECK.z + 22, radius: 3.8, line: '镜里映出的，是他们还没毁掉的那座城。', to: [PAST.x, PAST.mirrorZ - 16, Math.PI, 0] },
    { x: PAST.x, y: 0, z: PAST.mirrorZ, radius: 3.8, line: '镜面合上。外面，还是那片废墟。', to: [HOME.x, DECK.z + 30, Math.PI, DECK.y] },
    { x: HOME.x, y: DECK.y, z: DECK.padZ, radius: 2.8, line: '光柱沉下云层，地面的人还在抬头。', to: [HOME.x, PLAZA.z + 9, Math.PI, 0] }
  ];
  const transitEl = document.getElementById('wormhole-transit');
  const transitLine = document.getElementById('wormhole-line');
  let transitting = false;
  let transitArmed = true;
  function runTransit(t) {
    if (transitting) return;
    transitting = true;
    transitArmed = false;
    transitLine.textContent = t.line;
    transitEl.classList.remove('hidden');
    requestAnimationFrame(() => transitEl.classList.add('active'));
    const [x, z, heading, y] = t.to;
    setTimeout(() => teleportTo(x, z, heading, y, 'person', null), 1100);
    setTimeout(() => {
      transitEl.classList.remove('active');
      setTimeout(() => { transitEl.classList.add('hidden'); transitting = false; }, 900);
    }, 2300);
  }
  function checkPortals() {
    if (controllerManager.activeMode !== 'person' || transitting) return;
    const { x, y, z } = controllerManager.getActiveEntity().position;
    const near = TRANSITS.filter((t) => Math.abs(y - t.y) < 8);
    const hit = near.find((t) => Math.hypot(x - t.x, z - t.z) < t.radius);
    if (hit && transitArmed) runTransit(hit);
    else if (near.every((t) => Math.hypot(x - t.x, z - t.z) > t.radius + 3.4)) transitArmed = true;
  }

  // 下拉弹层逻辑
  const teleportPopover = document.getElementById('teleport-popover');
  const cameraPopover = document.getElementById('camera-popover');
  const btnTeleport = document.getElementById('btn-teleport');
  const btnCamMenu = document.getElementById('cam-menu-btn');

  function closePopovers() {
    teleportPopover?.classList.add('hidden');
    cameraPopover?.classList.add('hidden');
    btnTeleport?.classList.remove('is-open');
    btnCamMenu?.classList.remove('is-open');
  }

  btnTeleport?.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = teleportPopover.classList.contains('hidden');
    closePopovers();
    if (willOpen) {
      const r = btnTeleport.getBoundingClientRect();
      teleportPopover.style.top = `${r.bottom + 8}px`;
      teleportPopover.style.right = `${Math.max(12, window.innerWidth - r.right)}px`;
      teleportPopover.classList.remove('hidden');
      btnTeleport.classList.add('is-open');
    }
  });

  btnCamMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = cameraPopover.classList.contains('hidden');
    closePopovers();
    if (willOpen) {
      const cluster = document.getElementById('hud-cluster');
      const r = (cluster || btnCamMenu).getBoundingClientRect();
      cameraPopover.style.bottom = `${window.innerHeight - r.top + 8}px`;
      cameraPopover.style.right = `${Math.max(12, window.innerWidth - r.right)}px`;
      cameraPopover.classList.remove('hidden');
      btnCamMenu.classList.add('is-open');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.popover') && !e.target.closest('#btn-teleport') && !e.target.closest('#cam-menu-btn')) {
      closePopovers();
    }
    const btn = e.target instanceof Element ? e.target.closest('button') : null;
    if (btn && e.detail > 0) btn.blur();
  });

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => selectMode(btn.getAttribute('data-mode')));
  });

  cameraButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectCamera(btn.getAttribute('data-camera'), true);
      closePopovers();
    });
  });

  document.getElementById('cam-prev')?.addEventListener('click', () => cycleCamera(-1));
  document.getElementById('cam-next')?.addEventListener('click', () => cycleCamera(1));

  timeButtons.forEach((btn) => {
    btn.addEventListener('click', () => selectTime(btn.getAttribute('data-time')));
  });

  // 传送功能
  function teleportTo(x, z, heading = Math.PI, explicitY = null, targetMode = null, chainT = null) {
    controllerManager.teleportActiveTo(x, z, heading, explicitY, targetMode, chainT);
    selectMode(controllerManager.activeMode);
    cameraSystem.resetForTeleport();
    selectCamera('chase', true);
    party?.regroup(); // 传送和过场不把同伴丢在原地
  }

  teleportButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-teleport');
      const loc = TELEPORT_LOCATIONS[key];
      if (loc) {
        teleportTo(loc.x, loc.z, loc.heading, loc.y, loc.mode, loc.chainT ?? null);
      }
      closePopovers();
    });
  });

  // 声音系统
  const audioSystem = new MirageAudioSystem({
    onStateChange: (enabled) => {
      if (!soundButton) return;
      soundButton.setAttribute('aria-pressed', String(enabled));
      soundButton.querySelector('use')?.setAttribute('href', enabled ? '#i-sound' : '#i-sound-off');
    }
  });
  soundButton?.addEventListener('click', () => audioSystem.setEnabled(!audioSystem.enabled));
  controllerManager.callbacks.onAttackSound = (sound, ent) => {
    // 同伴的招式压低，远了就不响，免得盖过玩家自己的手感
    if (!ent?.isCompanion) { audioSystem.playAttack(sound); return; }
    const d = ent.position.distanceTo(controllerManager.getActiveEntity().position);
    if (d < 28) audioSystem.playAttack({ ...sound, gain: sound.gain * .4 * (1 - d / 28) });
  };

  // 反派 NPC：主角的招式在 controllers.js 命中那一刻调到这里
  const combatHud = setupCombatHud(cameraSystem.camera);
  const enemySystem = createEnemySystem(scene, {
    resolve: (x, y, z, r) => controllerManager.resolveHorizontalCollisions(x, y, z, r),
    onEnemyHit: (e, dealt) => {
      combatHud.floatDamage(e.pos, dealt, e.def.scale);
      audioSystem.playAttack({ from: 420, to: 130, duration: .1, gain: .09 });
    },
    onKill: (e, kills) => combatHud.announce(`击倒 ${e.def.name}`, kills),
    onBossPhase: (phase, e) => {
      combatHud.setKills(enemySystem.player.kills);
      if (phase === 'reveal') combatHud.say('倒下的只是替身 —— 百里渊从暗门走了出来', 3200);
      else if (phase === 'guDefeated') combatHud.say('顾廷美败北 · 左耳被削落，捂耳跪地哀嚎', 4200);
      else if (phase === 'sanyeDefeated') combatHud.say('清风楼三爷败北 · 巨型狼牙棒脱手，众恶霸溃散', 4200);
      else combatHud.say('百里渊败退 · 百里府已破', 4200);
    },
    onAllyDown: (ally) => combatHud.say(`${ally.charRig.config.name} 重伤倒下`, 1800),
    onPlayerHit: (p, e) => {
      combatHud.hurt();
      audioSystem.playAttack({ from: 260, to: 70, duration: .22, gain: .13 });
    },
    onPlayerDown: () => {
      combatHud.down();
      // 重伤后回到当前世界的安全处，敌人退回原位
      setTimeout(() => {
        const p = controllerManager.getActiveEntity().position;
        const spot = isPast(p.x) ? [PAST.x, PAST.mirrorZ - 16, 0] : isHomeworld(p.x) ? [HOME.x, 168, 2.4] : p.y > 180 ? [0, -312, 240.2] : inBailiEstate(p.x, p.z) ? [BAILI.x, BAILI.gateZ + 16, 0] : inGuMansion(p.x, p.z) ? [GU_MANSION.x, 132, 0] : inQingfengTower(p.x, p.z) ? [QINGFENG_TOWER.x, 132, 0] : [0, 126, 0];
        teleportTo(spot[0], spot[1], Math.PI, spot[2], 'person', null);
        enemySystem.healPlayer();
      }, 1400);
    }
  });
  party = createParty({
    scene,
    controller: controllerManager,
    enemies: enemySystem,
    onRise: (a) => combatHud.say(`${a.charRig.config.name} 缓过一口气`, 1500)
  });

  /** 换人：键盘和镜头交给对方，自己的身体留在原地由 AI 接手 */
  function switchLead(id) {
    const result = party.takeControl(id);
    if (!result.ok) { combatHud.say(result.reason, 1400); return false; }
    syncModeUi(controllerManager.activeMode);
    rememberLead(controllerManager.activeCharacter);
    if (result.changed) {
      if (result.moved > 45) cameraSystem.resetForTeleport();
      combatHud.say(`此刻，你是${getLead(controllerManager.activeCharacter).name}`, 1100);
    }
    partyHud.render();
    return true;
  }
  const partyHud = setupPartyHud({ party, onPick: switchLead });
  setLeadChooser(switchLead);
  const partyButton = document.getElementById('btn-party');
  function setPartyMode(on) {
    let replaced = null;
    if (on) ({ replaced } = party.enable()); else party.disable();
    partyButton?.classList.toggle('active', on);
    partyButton?.setAttribute('aria-pressed', String(on));
    partyHud.setVisible(on);
    syncModeUi(controllerManager.activeMode);
    if (replaced) rememberLead(controllerManager.activeCharacter);
    const name = getLead(controllerManager.activeCharacter).name;
    combatHud.say(on ? (replaced ? `群像同行，${replaced}不在其中 · 此刻你是${name}` : '群像同行 · Tab 换人') : '独行', 1800);
  }
  partyButton?.addEventListener('click', () => setPartyMode(!party.enabled));
  // 外部 Agent 只在本地开发时接入；发布版或静态直开没有 Vite env 时安全跳过，同伴全由规则 AI 控制
  if (import.meta.env?.DEV) {
    createAgentLink({
      party,
      enemies: enemySystem,
      controller: controllerManager,
      onSay: (id, text) => partyHud.say(id, text),
      onAgents: (ids) => partyHud.setAgents(ids)
    });
  }
  function cycleLead(step) {
    const members = party.snapshot();
    const from = members.findIndex((m) => m.controlled);
    for (let i = 1; i < members.length; i++) {
      const m = members[(from + step * i + members.length * i) % members.length];
      if (!m.down) { switchLead(m.id); return; }
    }
  }

  controllerManager.callbacks.onModeAuto = (mode, zone) => {
    syncModeUi(mode);
    if (zone) combatHud.say(zone.say, 2200);
  };
  controllerManager.callbacks.onAttackHit = (ent, hit) => enemySystem.strike(ent, hit);
  controllerManager.callbacks.onAttackAim = (ent, hit) => enemySystem.aim(ent, hit);

  // 地图系统 [M]
  const mapSystem = new WorldMapSystem({
    controllerManager,
    cameraSystem,
    allBlocks: [...dengzhou.allBlocks, ...bailiMansion.blocks],
    onToggle: () => controllerManager.resetInput(),
    onTeleport: teleportTo
  });
  document.getElementById('btn-open-map')?.addEventListener('click', () => mapSystem.toggleFullMap(true));

  // 右上角工具栏折叠（记住上次状态；窄屏默认收起）
  const toolbarEl = document.getElementById('hud-toolbar');
  const collapseBtn = document.getElementById('btn-toolbar-collapse');
  function setToolbarCollapsed(on) {
    toolbarEl?.classList.toggle('collapsed', on);
    collapseBtn?.setAttribute('aria-expanded', String(!on));
    const label = on ? '展开工具栏' : '收起工具栏';
    collapseBtn?.setAttribute('aria-label', label);
    if (collapseBtn) collapseBtn.title = label;
    if (on) closePopovers();
  }
  let storedToolbar = null;
  try { storedToolbar = localStorage.getItem('mirage-toolbar-collapsed'); } catch { /* optional */ }
  setToolbarCollapsed(storedToolbar === null ? window.innerWidth <= 700 : storedToolbar === '1');
  collapseBtn?.addEventListener('click', () => {
    const on = !toolbarEl.classList.contains('collapsed');
    setToolbarCollapsed(on);
    try { localStorage.setItem('mirage-toolbar-collapsed', on ? '1' : '0'); } catch { /* optional */ }
  });

  // 纯净视图 [H]
  hudToggleBtn?.addEventListener('click', () => {
    document.body.classList.toggle('hud-minimized');
    closePopovers();
  });

  // 左下角东方牌匾位置渲染
  let lastLocationHash = '';
  function renderLocationPlaque(info) {
    const hash = `${info.realm}|${info.street}|${info.kind}`;
    if (!elLocation || hash === lastLocationHash) return;
    lastLocationHash = hash;

    const placeEl = document.createElement('div');
    placeEl.className = 'location-place';
    placeEl.textContent = info.realm;

    const row = document.createElement('div');
    row.className = 'location-signs';
    const sign = document.createElement('span');
    sign.className = `street-sign ${info.kind === 'mirage' ? 'sign-mirage' : info.kind === 'chain' ? 'sign-chain' : ''}`;
    sign.textContent = info.street;
    row.appendChild(sign);

    elLocation.replaceChildren(placeEl, row);
  }

  // 全局快捷键
  window.addEventListener('keydown', (e) => {
    if (isTypingInField(e)) return;
    if (leadGallery.active) return;
    if (e.code === 'KeyP' && !e.repeat) { leadGallery.open(controllerManager.activeCharacter); return; }
    if (e.code === 'Tab' && party.enabled) {
      e.preventDefault();
      if (!e.repeat) cycleLead(e.shiftKey ? -1 : 1);
      return;
    }
    switch (e.code) {
      case 'Digit1': selectMode('person'); break;
      case 'Digit2': selectMode('horse'); break;
      case 'Digit3': selectMode('flight'); break;
      case 'Digit5': selectCamera('chase', true); break;
      case 'Digit6': selectCamera('action', true); break;
      case 'Digit7': selectCamera('pov', true); break;
      case 'KeyV': cycleCamera(e.shiftKey ? -1 : 1); break;
      case 'KeyT':
        if (!e.repeat) setPartyMode(!party.enabled);
        break;
      case 'KeyH': hudToggleBtn?.click(); break;
      case 'KeyN':
        if (!e.repeat) audioSystem.setEnabled(!audioSystem.enabled);
        break;
    }
  });

  window.addEventListener('resize', () => {
    cameraSystem.onResize(window.innerWidth, window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
    placeModeIndicator();
    if (mapSystem.isFullMapOpen) {
      mapSystem.resizeFullCanvas();
      mapSystem.renderFullMap();
    }
  });

  // 初始化默认状态
  selectMode('person');
  selectCamera('chase', true);
  selectTime('day');
  requestAnimationFrame(placeModeIndicator);
  if(modeSwitch) new ResizeObserver(placeModeIndicator).observe(modeSwitch);

  await showLoadingStage('正在渲染首帧画面...', 1.0);

  mapSystem.markers = () => enemySystem.markers();

  globalThis.__OHMYGAME_PLAYTEST__ = {
    snapshot: () => ({
      ready: firstFrameDone,
      character: controllerManager.activeCharacter,
      mode: controllerManager.activeMode,
      position: controllerManager.getActiveEntity().position.toArray(),
      speed: controllerManager.getActiveEntity().speed,
      gallery: leadGallery.snapshot(),
      modes: Object.fromEntries(Object.entries(controllerManager.entities).map(([key,e])=>[key,e.charRig?{character:e.charRig.config.id, action:e.charRig.group.userData.action, stats:e.charRig.getStats()}:{character:null, action:'ufo'}])),
      render: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles },
      light: lightingSystem.activePresetId,
      homeworld: realm !== 'earth',
      combat: enemySystem.snapshot(),
      partyMode: party.enabled,
      party: party.snapshot(),
      dongzi: dengzhou.dongzi ? {
        id: dengzhou.dongzi.config.id,
        name: dengzhou.dongzi.config.name,
        position: dengzhou.dongzi.group.position.toArray(),
        fixedAtQingfengGate: !!dengzhou.dongzi.group.userData.fixedAtQingfengGate
      } : null
    })
  };
  let lastTime = performance.now();
  let elapsed = 0;
  let frameCount = 0;
  let fpsTimer = 0;
  let firstFrameDone = false;

  renderer.setAnimationLoop((now) => {
    const rawDt = (now - lastTime) * 0.001;
    lastTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    if (leadGallery.active) { leadGallery.render(renderer, dt); return; }
    elapsed += dt;

    controllerManager.update(dt, elapsed);
    cameraSystem.update(dt);
    syncRealm(controllerManager.getActiveEntity().position.x);
    checkPortals();
    party.update(dt, elapsed, cameraSystem.camera);
    enemySystem.update(dt, controllerManager.getActiveEntity(), controllerManager.activeMode, cameraSystem.camera, party.actors);
    partyHud.update(dt, cameraSystem.camera);
    combatHud.update(enemySystem.player, enemySystem.boss(controllerManager.getActiveEntity()));
    if (realm !== 'earth') homeworld.updateSky(cameraSystem.currentPos);
    if (realm === 'home') homeworld.update(elapsed, cameraSystem.currentPos);
    if (realm === 'past') pastCity.update(elapsed, cameraSystem.currentPos);
    dengzhou.update?.(elapsed);
    skyMirage.update(elapsed);
    ironChain.update(elapsed);
    pedestrians.update(dt, elapsed);
    lightingSystem.update(cameraSystem.currentPos);
    mapSystem.update();
    audioSystem.update(
      dt,
      controllerManager.getActiveEntity(),
      controllerManager.activeMode,
      realm !== 'earth'
    );

    renderPipeline.render();

    if (!firstFrameDone) {
      firstFrameDone = true;
      if (loadingOverlay) loadingOverlay.classList.add('hidden');
      const characterParam = new URLSearchParams(location.search).get('characters');
      if (characterParam !== null) leadGallery.open(characterParam || controllerManager.activeCharacter);
    }

    frameCount++;
    fpsTimer += Math.max(0, rawDt);
    if (fpsTimer >= 0.25) {
      const currentFps = Math.round(frameCount / fpsTimer);
      frameCount = 0;
      fpsTimer = 0;

      const activeEnt = controllerManager.getActiveEntity();
      const mode = controllerManager.activeMode;
      const kmh = Math.round(Math.abs(activeEnt.speed) * 3.6);
      const altMeters = Math.max(0, Math.round(activeEnt.position.y));

      if (elFps) {
        elFps.textContent = String(currentFps);
        elFps.className = currentFps >= 50 ? 'fps-ok' : currentFps >= 30 ? 'fps-warn' : 'fps-bad';
      }
      if (elSpeed) elSpeed.textContent = String(kmh);
      if (elSpeedMeter) elSpeedMeter.style.transform = `scaleX(${Math.min(1, kmh / (topSpeedKmh[mode] || 80))})`;
      if (elAltitude) elAltitude.textContent = String(altMeters);

      const where = activeEnt.position;
      const locInfo = getLocationInfo(where.x, where.y, where.z, mode);
      renderLocationPlaque(locInfo);

      if (elRealm) {
        if (locInfo.kind === 'homeworld') {
          elRealm.textContent = '天外母星';
          elRealm.className = 'gauge-realm realm-mirage';
        } else if (locInfo.kind === 'mirage') {
          elRealm.textContent = '空中蜃景';
          elRealm.className = 'gauge-realm realm-mirage';
        } else if (locInfo.kind === 'chain') {
          elRealm.textContent = '铁索凌云';
          elRealm.className = 'gauge-realm realm-chain';
        } else {
          elRealm.textContent = '登州地面';
          elRealm.className = 'gauge-realm';
        }
      }
    }
  });
}

initApp().catch(error => {
  console.error(error);
  const status = document.getElementById('loading-status');
  if (status) status.textContent = '场景载入失败，请刷新重试。' + error.message;
});
