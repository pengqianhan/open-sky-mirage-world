// js/map-system.js
// 实时左下角雷达小地图 (#minimap-canvas) 与全屏可交互双界舆图 (#fullmap-modal [M])
// 同屏绘制：登州城垣街坊（完整还原 EP02 @ 38:45《登州城之圖》：凤山八蟠岭、宝月山八眼井、相国井、清湖河五桥、
// 府治、臺諫、朝天门、水门、小堰门及「引水淹城」朱笔暗渠与 7 大红点枢纽）、北山登云崖、【登云铁索】以及【空中蜃景】

import {
  DENGZHOU_BOUNDS,
  DENGZHOU_MAP_FEATURES,
  MIRAGE_CONFIG,
  IRON_CHAIN_CONFIG,
  ROADS,
  WORLD_LANDMARKS,
  getLocationInfo,
  getWorldGroundHeight,
  isTypingInField
} from './world-config.js';
import { BAILI } from './baili-config.js';

// 百里渊府的小羊皮卷范围（府墙外留一圈纸边）
const BAILI_SHEET = {
  minX: BAILI.x - BAILI.halfX - 14, maxX: BAILI.x + BAILI.halfX + 14,
  minZ: BAILI.northZ - 16, maxZ: BAILI.gateZ + 16
};
// 落在羊皮卷上的地名用墨色，卷外（深色木案上）用浅色
const onParchment = (x, z) => (Math.abs(x) < 235 && z > -228 && z < 237)
  || (x > BAILI_SHEET.minX && x < BAILI_SHEET.maxX && z > BAILI_SHEET.minZ && z < BAILI_SHEET.maxZ);

export class WorldMapSystem {
  constructor({ controllerManager, cameraSystem, allBlocks = [], onToggle, onTeleport }) {
    this.controllerManager = controllerManager;
    this.cameraSystem = cameraSystem;
    this.allBlocks = allBlocks;
    this.onToggle = onToggle;
    this.onTeleport = onTeleport;

    this.miniCanvas = document.getElementById('minimap-canvas');
    this.miniCtx = this.miniCanvas ? this.miniCanvas.getContext('2d') : null;

    this.modal = document.getElementById('fullmap-modal');
    this.fullWrap = document.getElementById('fullmap-canvas-wrap');
    this.fullCanvas = document.getElementById('fullmap-canvas');
    this.fullCtx = this.fullCanvas ? this.fullCanvas.getContext('2d') : null;

    this.elPlayerInfo = document.getElementById('fullmap-player-info');
    this.elHoverInfo = document.getElementById('fullmap-hover-info');
    this.elSearch = document.getElementById('fullmap-search');

    this.isFullMapOpen = false;
    this.panX = 0;
    this.panZ = -65; // 默认兼顾登州城池细节与北方空中蜃景
    this.zoom = 0.85;
    this.searchQuery = '';
    this.hoverWorld = null;

    // EP02《登州城之圖》专属图层状态
    this.showWaterways = false;  // 默认关闭，用户点击后显示第二集「引水淹城」朱砂暗渠与 7 大红点枢纽
    this.parchmentMode = true;  // 全屏舆图固定为《登州城之圖》古籍羊皮卷轴风格

    this.resizeMiniCanvas();
    this.bindEvents();
  }

  resizeMiniCanvas() {
    if (!this.miniCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.miniCanvas.width = Math.round(288 * dpr);
    this.miniCanvas.height = Math.round(184 * dpr);
  }

  resizeFullCanvas() {
    if (!this.fullCanvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.fullCanvas.width = Math.round(window.innerWidth * dpr);
    this.fullCanvas.height = Math.round(window.innerHeight * dpr);
  }

  toggleFullMap(open) {
    this.isFullMapOpen = Boolean(open);
    if (!this.modal) return;
    this.modal.classList.toggle('hidden', !this.isFullMapOpen);
    if (this.onToggle) this.onToggle(this.isFullMapOpen);
    if (this.isFullMapOpen) {
      this.resizeFullCanvas();
      this.renderFullMap();
    }
  }

  bindEvents() {
    const miniCard = document.getElementById('minimap-card');
    miniCard?.addEventListener('click', () => this.toggleFullMap(true));

    const closeBtn = document.getElementById('close-fullmap-btn');
    closeBtn?.addEventListener('click', () => this.toggleFullMap(false));

    window.addEventListener('keydown', (e) => {
      if (isTypingInField(e)) {
        if (e.code === 'Escape' && this.isFullMapOpen) {
          e.target.blur();
          this.toggleFullMap(false);
        }
        return;
      }
      if (e.code === 'KeyM') {
        e.preventDefault();
        this.toggleFullMap(!this.isFullMapOpen);
      } else if (e.code === 'Escape' && this.isFullMapOpen) {
        e.preventDefault();
        this.toggleFullMap(false);
      }
    });

    document.getElementById('map-zoom-in')?.addEventListener('click', () => {
      this.zoom = Math.min(4.2, this.zoom * 1.35);
      this.renderFullMap();
    });
    document.getElementById('map-zoom-out')?.addEventListener('click', () => {
      this.zoom = Math.max(0.25, this.zoom / 1.35);
      this.renderFullMap();
    });
    document.getElementById('map-center-player')?.addEventListener('click', () => {
      const ent = this.controllerManager.getActiveEntity();
      this.panX = ent.position.x;
      this.panZ = ent.position.z;
      this.zoom = 1.45;
      this.renderFullMap();
    });
    document.getElementById('map-fit-all')?.addEventListener('click', () => {
      this.panX = 0;
      this.panZ = -85;
      this.zoom = 0.76;
      this.renderFullMap();
    });

    // EP02《登州城之圖》专属聚焦与图层切换按钮
    document.getElementById('map-focus-dengzhou')?.addEventListener('click', () => {
      this.panX = -4;
      this.panZ = -4;
      this.zoom = 1.72;
      this.renderFullMap();
    });

    const btnWaterways = document.getElementById('map-toggle-waterways');
    btnWaterways?.addEventListener('click', () => {
      this.showWaterways = !this.showWaterways;
      btnWaterways.classList.toggle('active', this.showWaterways);
      btnWaterways.setAttribute('aria-pressed', String(this.showWaterways));
      this.renderFullMap();
    });


    this.elSearch?.addEventListener('input', () => {
      this.searchQuery = this.elSearch.value.trim().toLowerCase();
      this.renderFullMap();
    });

    if (this.fullCanvas) {
      let dragging = false;
      let moved = false;
      let startX = 0;
      let startY = 0;

      this.fullCanvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        dragging = true;
        moved = false;
        startX = e.clientX;
        startY = e.clientY;
        this.fullWrap?.classList.add('is-panning');
        this.fullCanvas.setPointerCapture(e.pointerId);
      });

      this.fullCanvas.addEventListener('pointermove', (e) => {
        const wPos = this.screenToWorld(e.clientX, e.clientY);
        this.hoverWorld = wPos;
        if (this.elHoverInfo) {
          const hitNode = this.findNearestInteractiveSpot(wPos.x, wPos.z);
          if (hitNode) {
            this.elHoverInfo.textContent = `${hitNode.title} — ${hitNode.sub}（点击直接传送至此）`;
          } else {
            const info = getLocationInfo(wPos.x, wPos.z < -285 ? 240 : 0, wPos.z);
            this.elHoverInfo.textContent = `${info.realm} · ${info.street} — 点击直接传送至此`;
          }
        }

        if (!dragging) {
          this.renderFullMap();
          return;
        }
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.hypot(dx, dy) > 4) moved = true;
        startX = e.clientX;
        startY = e.clientY;
        this.panX -= dx / this.zoom;
        this.panZ -= dy / this.zoom;
        this.renderFullMap();
      });

      this.fullCanvas.addEventListener('pointerup', (e) => {
        if (!dragging) return;
        dragging = false;
        this.fullWrap?.classList.remove('is-panning');
        if (!moved && this.onTeleport) {
          const wPos = this.screenToWorld(e.clientX, e.clientY);
          // 点击铁索区域直接挂载铁索，点击蜃景区域直接传送至空中蜃景，否则传送至登州地面
          if (Math.abs(wPos.x) < 16 && wPos.z < -205 && wPos.z > -304) {
            const chainT = Math.max(0.05, Math.min(0.95, (-208 - wPos.z) / 98.0));
            this.onTeleport(0, wPos.z, Math.PI, null, 'chain', chainT);
          } else if (wPos.z <= -285) {
            const targetH = getWorldGroundHeight(wPos.x, wPos.z, MIRAGE_CONFIG.baseY + 8.5);
            this.onTeleport(wPos.x, wPos.z, Math.PI, targetH + 0.1, 'person');
          } else {
            const groundY = getWorldGroundHeight(wPos.x, wPos.z, 0);
            this.onTeleport(wPos.x, wPos.z, Math.PI, groundY > 1 ? groundY + 0.1 : null, 'person');
          }
          this.toggleFullMap(false);
        }
      });

      this.fullCanvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        this.zoom = Math.max(0.25, Math.min(4.2, this.zoom * factor));
        this.renderFullMap();
      }, { passive: false });
    }
  }

  findNearestInteractiveSpot(wx, wz) {
    const pickRadius = 12 / Math.max(0.5, this.zoom);
    if (this.showWaterways) {
      for (const n of DENGZHOU_MAP_FEATURES.redNodes) {
        if (Math.hypot(wx - n.x, wz - n.z) < pickRadius) {
          return { title: `【引水淹城枢纽】${n.name}`, sub: n.sub, x: n.x, z: n.z };
        }
      }
    }
    for (const lm of WORLD_LANDMARKS) {
      if (Math.hypot(wx - lm.x, wz - lm.z) < pickRadius) {
        return { title: `${lm.realm} · ${lm.name}`, sub: '地标节点', x: lm.x, z: lm.z };
      }
    }
    return null;
  }

  screenToWorld(clientX, clientY) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    return {
      x: this.panX + (clientX - w * 0.5) / this.zoom,
      z: this.panZ + (clientY - h * 0.5) / this.zoom
    };
  }

  /**
   * 绘制古典地图山形皴法与等高轮廓（用于《登州城之圖》中的鳳山、八蟠嶺、萬松嶺、寶月山、包家山等）
   */
  drawClassicalHill(ctx, cx, cz, rx, rz, scale, isParchment) {
    ctx.save();
    ctx.translate(cx, cz);

    // 三层渐变等高晕染
    for (const ratio of [1.0, 0.68, 0.38]) {
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * ratio, rz * ratio, 0, 0, Math.PI * 2);
      ctx.fillStyle = isParchment
        ? `rgba(116, 94, 54, ${ratio === 1.0 ? 0.12 : 0.16})`
        : `rgba(68, 118, 92, ${ratio === 1.0 ? 0.12 : 0.16})`;
      ctx.fill();
      ctx.strokeStyle = isParchment
        ? 'rgba(92, 68, 36, 0.45)'
        : 'rgba(112, 168, 136, 0.38)';
      ctx.lineWidth = 1.1 / scale;
      ctx.stroke();
    }

    // 古籍地图人字形山峰笔触 (皴法山形)
    ctx.strokeStyle = isParchment ? 'rgba(62, 44, 22, 0.78)' : 'rgba(165, 212, 182, 0.68)';
    ctx.lineWidth = 1.6 / scale;
    const peaks = [
      [0, -rz * 0.18, rx * 0.36, rz * 0.32],
      [-rx * 0.28, rz * 0.12, rx * 0.26, rz * 0.24],
      [rx * 0.28, rz * 0.10, rx * 0.26, rz * 0.24]
    ];
    for (const [px, pz, pw, ph] of peaks) {
      ctx.beginPath();
      ctx.moveTo(px - pw, pz + ph * 0.5);
      ctx.lineTo(px, pz - ph * 0.6);
      ctx.lineTo(px + pw, pz + ph * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawWorldLayers(ctx, scale, isFull = false) {
    const isParchment = isFull && this.parchmentMode;

    // 0. 若开启《登州城之圖》古图卷轴模式，先铺设羊皮古卷底框 (覆盖登州城与城外护城大江)
    if (isParchment) {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 36;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#dfd0a6';
      ctx.fillRect(-235, -228, 470, 465);
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#5c4322';
      ctx.lineWidth = 3.2 / scale;
      ctx.strokeRect(-229, -222, 458, 453);
      ctx.lineWidth = 1.1 / scale;
      ctx.strokeRect(-225, -218, 450, 445);

      // 百里渊府另铺一张小羊皮卷，府内湖面以古图石青晕染
      const b = BAILI_SHEET;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 36;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#dfd0a6';
      ctx.fillRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 3.2 / scale;
      ctx.strokeRect(b.minX + 5, b.minZ + 5, b.maxX - b.minX - 10, b.maxZ - b.minZ - 10);
      ctx.lineWidth = 1.1 / scale;
      ctx.strokeRect(b.minX + 9, b.minZ + 9, b.maxX - b.minX - 18, b.maxZ - b.minZ - 18);
      const lake = BAILI.lake;
      ctx.fillStyle = 'rgba(72, 114, 122, 0.32)';
      ctx.strokeStyle = 'rgba(58, 92, 102, 0.6)';
      ctx.fillRect(BAILI.x - lake.halfX, lake.minZ, lake.halfX * 2, lake.maxZ - lake.minZ);
      ctx.strokeRect(BAILI.x - lake.halfX, lake.minZ, lake.halfX * 2, lake.maxZ - lake.minZ);
      ctx.restore();
    }

    // 1. 登州外围护城河与南侧【大江】环带
    ctx.strokeStyle = isParchment ? 'rgba(72, 114, 122, 0.52)' : 'rgba(42, 118, 138, 0.48)';
    ctx.lineWidth = 15;
    ctx.strokeRect(-195, -195, 390, 390);

    // 南侧「大江」加宽河道与水波纹（呼应《登州城之圖》底部横贯的「大江」）
    ctx.save();
    ctx.strokeStyle = isParchment ? 'rgba(58, 92, 102, 0.65)' : 'rgba(77, 212, 226, 0.32)';
    ctx.lineWidth = 1.2 / scale;
    for (const wz of [191, 196, 201]) {
      ctx.beginPath();
      ctx.moveTo(-185, wz);
      ctx.lineTo(185, wz);
      ctx.stroke();
    }
    ctx.restore();

    // 2. 登州城池内城底色
    ctx.fillStyle = isParchment ? '#e6d8b2' : '#141c24';
    ctx.fillRect(DENGZHOU_BOUNDS.minX, DENGZHOU_BOUNDS.minZ, 340, 340);

    // 2.5 城内西北【鳳山·八蟠嶺·萬松嶺·月岩】、城西【寶月山·七寶山·石佛山】与城外西南【包家山】
    for (const hill of DENGZHOU_MAP_FEATURES.hills) {
      this.drawClassicalHill(ctx, hill.x, hill.z, hill.rx, hill.rz, scale, isParchment);
    }
    // 城外西南包家山 (小堰门外)
    this.drawClassicalHill(ctx, -206, 108, 22, 18, scale, isParchment);

    // 3. 穿城水系【清湖河】河道与五座古桥
    ctx.save();
    for (const canal of DENGZHOU_MAP_FEATURES.canals) {
      const [[x0, z0], [x1, z1]] = canal.points;
      ctx.beginPath();
      ctx.moveTo(x0, z0);
      ctx.lineTo(x1, z1);
      ctx.strokeStyle = isParchment ? 'rgba(56, 112, 124, 0.75)' : 'rgba(58, 168, 184, 0.68)';
      ctx.lineWidth = canal.width;
      ctx.lineCap = 'round';
      ctx.stroke();

      // 河岸细线
      ctx.strokeStyle = isParchment ? 'rgba(72, 54, 32, 0.65)' : 'rgba(160, 215, 225, 0.42)';
      ctx.lineWidth = 1.0 / scale;
      ctx.stroke();
    }
    ctx.restore();

    // 4. 街坊院落与建筑轮廓
    for (const b of this.allBlocks) {
      if (isParchment) {
        ctx.fillStyle = b.landmark ? 'rgba(186, 124, 52, 0.34)' : 'rgba(148, 126, 88, 0.32)';
        ctx.strokeStyle = b.landmark ? '#5a3216' : 'rgba(96, 76, 48, 0.68)';
      } else {
        ctx.fillStyle = b.landmark ? 'rgba(230, 180, 80, 0.28)' : '#24303d';
        ctx.strokeStyle = b.landmark ? 'rgba(230, 180, 80, 0.78)' : '#324152';
      }
      ctx.lineWidth = 1.1 / scale;
      ctx.fillRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
      ctx.strokeRect(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
    }

    // 5. 道路网与跨渠古桥符号
    for (const r of ROADS) {
      const [[x0, z0], [x1, z1]] = r.points;
      ctx.beginPath();
      ctx.moveTo(x0, z0);
      ctx.lineTo(x1, z1);
      if (r.mirage) {
        ctx.strokeStyle = 'rgba(77, 238, 234, 0.40)';
      } else if (isParchment) {
        ctx.strokeStyle = r.main ? 'rgba(198, 174, 122, 0.92)' : 'rgba(178, 154, 106, 0.78)';
      } else {
        ctx.strokeStyle = r.main ? '#465669' : '#33404f';
      }
      ctx.lineWidth = r.width;
      ctx.lineCap = 'round';
      ctx.stroke();

      // 朱雀御街与鼓楼大街绘制古图双线街廓
      if (r.main && !r.mirage && Math.abs(x0) < 200) {
        ctx.strokeStyle = isParchment ? 'rgba(88, 64, 34, 0.65)' : 'rgba(230, 180, 80, 0.26)';
        ctx.lineWidth = 1.1 / scale;
        ctx.stroke();
      }
    }

    // 五座跨清湖河古桥符号（大石桥、三圣桥、望仙桥、黑津桥、水门桥）
    ctx.save();
    for (const br of DENGZHOU_MAP_FEATURES.bridges) {
      ctx.save();
      ctx.translate(br.x, br.z);
      ctx.rotate(br.rotY);
      ctx.fillStyle = isParchment ? '#c9ae74' : '#586c82';
      ctx.strokeStyle = isParchment ? '#4a3419' : '#d6c292';
      ctx.lineWidth = 1.3 / scale;
      ctx.fillRect(-4.4, -3.6, 8.8, 7.2);
      ctx.strokeRect(-4.4, -3.6, 8.8, 7.2);
      ctx.restore();
    }
    ctx.restore();

    // 古图名井符号（相国井、宝月山八眼井、凤山四井）
    ctx.save();
    for (const w of DENGZHOU_MAP_FEATURES.wells) {
      const rWell = (w.eyes === 8 ? 5.2 : w.eyes === 4 ? 4.0 : 3.6);
      ctx.fillStyle = isParchment ? 'rgba(56, 112, 124, 0.32)' : 'rgba(77, 238, 234, 0.22)';
      ctx.strokeStyle = isParchment ? '#386874' : '#4deeea';
      ctx.lineWidth = 1.4 / scale;
      ctx.fillRect(w.x - rWell, w.z - rWell * 0.75, rWell * 2, rWell * 1.5);
      ctx.strokeRect(w.x - rWell, w.z - rWell * 0.75, rWell * 2, rWell * 1.5);
      // 井眼小圆环
      const cols = w.eyes === 8 ? 4 : w.eyes === 4 ? 2 : 1;
      const rows = w.eyes === 8 ? 2 : w.eyes === 4 ? 2 : 1;
      for (let rr = 0; rr < rows; rr++) {
        for (let cc = 0; cc < cols; cc++) {
          const ox = (cc - (cols - 1) * 0.5) * 2.1;
          const oz = (rr - (rows - 1) * 0.5) * 2.1;
          ctx.beginPath();
          ctx.arc(w.x + ox, w.z + oz, 0.75, 0, Math.PI * 2);
          ctx.fillStyle = isParchment ? '#2c5863' : '#8ef6f3';
          ctx.fill();
        }
      }
    }
    ctx.restore();

    // 6. 登州四面收分城垣、城门楼与【水門】【小堰門】墩台
    ctx.strokeStyle = isParchment ? '#4e381c' : '#9aa8b8';
    ctx.lineWidth = 5.8;
    ctx.strokeRect(DENGZHOU_BOUNDS.minX, DENGZHOU_BOUNDS.minZ, 340, 340);

    // 城门与水门/小堰门瓮城墩台标记
    const wallGates = [
      [0, 170, 16, 7],   // 南城门
      [0, -170, 16, 7],  // 北城门
      [170, 0, 7, 16],   // 东城门
      [-170, 0, 7, 16],  // 西城门
      [138, 170, 10, 6], // 水门 (保安水门)
      [-170, 112, 6, 10] // 小堰门
    ];
    for (const [gx, gz, gw, gd] of wallGates) {
      ctx.fillStyle = isParchment ? '#6b4922' : '#c6d2df';
      ctx.strokeStyle = isParchment ? '#2b1b0a' : '#1b242e';
      ctx.lineWidth = 1.2 / scale;
      ctx.fillRect(gx - gw * 0.5, gz - gd * 0.5, gw, gd);
      ctx.strokeRect(gx - gw * 0.5, gz - gd * 0.5, gw, gd);
    }

    // 右侧竖排古籍题名框 ┌ 登 州 城 之 圖 ┐（精准复刻 EP02 道具地图右侧题名签条）
    if (isFull) {
      ctx.save();
      const cartX = 181;
      const cartZ = -148;
      const cartW = 16;
      const cartH = 74;
      ctx.fillStyle = isParchment ? '#dfd0a6' : 'rgba(18, 24, 32, 0.92)';
      ctx.strokeStyle = isParchment ? '#3e2912' : 'rgba(230, 180, 80, 0.85)';
      ctx.lineWidth = 1.8 / scale;
      ctx.fillRect(cartX, cartZ, cartW, cartH);
      ctx.strokeRect(cartX, cartZ, cartW, cartH);
      ctx.lineWidth = 0.8 / scale;
      ctx.strokeRect(cartX + 1.8, cartZ + 1.8, cartW - 3.6, cartH - 3.6);

      ctx.font = `700 9.5px "Noto Serif SC", "Songti SC", serif`;
      ctx.fillStyle = isParchment ? '#2e1d0b' : '#e6b450';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const titleChars = ['登', '州', '城', '之', '圖'];
      for (let i = 0; i < titleChars.length; i++) {
        ctx.fillText(titleChars[i], cartX + cartW * 0.5, cartZ + 12 + i * 12.5);
      }
      ctx.restore();
    }

    // 7. 第二集 (EP02 @ 38:45)「引水淹城」朱笔暗渠路线与 7 处朱砂水闸大红点
    if (this.showWaterways) {
      ctx.save();
      // (a) 朱砂引水暗渠红线
      for (const rl of DENGZHOU_MAP_FEATURES.redLines) {
        ctx.beginPath();
        rl.points.forEach(([px, pz], idx) => {
          if (idx === 0) ctx.moveTo(px, pz);
          else ctx.lineTo(px, pz);
        });
        ctx.strokeStyle = isParchment ? 'rgba(178, 34, 24, 0.88)' : 'rgba(230, 57, 46, 0.86)';
        ctx.lineWidth = (rl.main ? 3.8 : 2.3) / Math.max(0.55, Math.min(1.35, scale));
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      // (b) 7 处朱砂大红点枢纽
      DENGZHOU_MAP_FEATURES.redNodes.forEach((node, idx) => {
        const matched = this.searchQuery && (
          node.name.toLowerCase().includes(this.searchQuery) ||
          node.sub.toLowerCase().includes(this.searchQuery)
        );
        const rDot = (matched ? 8.5 : 5.8) / Math.max(0.6, Math.min(1.6, scale));

        // 外圈朱砂晕环
        ctx.beginPath();
        ctx.arc(node.x, node.z, rDot * 1.45, 0, Math.PI * 2);
        ctx.fillStyle = isParchment ? 'rgba(182, 32, 22, 0.26)' : 'rgba(230, 57, 46, 0.28)';
        ctx.fill();

        // 实心朱砂圆点
        ctx.beginPath();
        ctx.arc(node.x, node.z, rDot, 0, Math.PI * 2);
        ctx.fillStyle = matched ? '#ff6b5e' : '#d93226';
        ctx.fill();
        ctx.strokeStyle = isParchment ? '#4a120c' : 'rgba(255, 220, 210, 0.85)';
        ctx.lineWidth = 1.2 / scale;
        ctx.stroke();

        // 圆点内水闸序号
        if (isFull && scale >= 0.85) {
          ctx.font = `700 ${Math.round(8.2 / Math.max(0.7, Math.min(1.5, scale)))}px Inter, sans-serif`;
          ctx.fillStyle = '#fff8f0';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(idx + 1), node.x, node.z + 0.3 / scale);
        }

        // 放大至街区级或搜索命中时显示完整水闸名称
        if (isFull && (scale >= 1.85 || matched)) {
          ctx.font = `600 ${Math.round(10.0 / scale)}px Inter, "PingFang SC", sans-serif`;
          ctx.fillStyle = isParchment ? '#7a160e' : '#ff9e94';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(node.name, node.x, node.z + (rDot + 10 / scale));
        }
      });
      ctx.restore();
    }

    // 8. 古图方框官署题记与街坊山川细部地名（全屏舆图按缩放分级呈现）
    if (isFull) {
      ctx.save();
      for (const wl of DENGZHOU_MAP_FEATURES.wardLabels) {
        const matched = this.searchQuery && wl.text.toLowerCase().includes(this.searchQuery);
        if (!matched && wl.kind !== 'box' && wl.kind !== 'hill' && scale < 0.92) continue;

        if (wl.kind === 'box') {
          // 仿《咸淳临安志·京城图》黑框官署牌记（府治、臺諫、相國井、朝天門）
          const bw = (wl.text.length * 6.8 + 6) / Math.max(0.7, scale);
          const bh = 12.5 / Math.max(0.7, scale);
          ctx.fillStyle = isParchment ? 'rgba(232, 216, 174, 0.94)' : 'rgba(16, 22, 30, 0.88)';
          ctx.strokeStyle = isParchment ? '#38240e' : 'rgba(230, 180, 80, 0.78)';
          ctx.lineWidth = 1.2 / scale;
          ctx.fillRect(wl.x - bw * 0.5, wl.z - bh * 0.5, bw, bh);
          ctx.strokeRect(wl.x - bw * 0.5, wl.z - bh * 0.5, bw, bh);

          ctx.font = `700 ${Math.round(10.5 / scale)}px "Noto Serif SC", "Songti SC", serif`;
          ctx.fillStyle = isParchment ? '#2b1a08' : '#f3d078';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(wl.text, wl.x, wl.z);
        } else if (scale >= 0.82 || matched) {
          ctx.font = `600 ${Math.round(10.0 / scale)}px "Noto Serif SC", "PingFang SC", serif`;
          if (wl.kind === 'hill') {
            ctx.fillStyle = isParchment ? '#4a3618' : 'rgba(168, 220, 186, 0.88)';
          } else if (wl.kind === 'water' || wl.kind === 'well' || wl.kind === 'bridge') {
            ctx.fillStyle = isParchment ? '#285662' : 'rgba(118, 224, 236, 0.88)';
          } else {
            ctx.fillStyle = isParchment ? '#523b1c' : 'rgba(220, 214, 200, 0.78)';
          }
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(wl.text, wl.x, wl.z);
        }
      }
      ctx.restore();
    }

    // 9. 空中蜃景浮岛与重檐城池轮廓 (北空 z = -380)
    const { centerX, centerZ, radiusX, radiusZ, wallHalfX, wallHalfZ } = MIRAGE_CONFIG;
    ctx.save();
    ctx.translate(centerX, centerZ);

    // 旋涡云海光晕与浮岛椭圆
    ctx.beginPath();
    ctx.ellipse(0, 0, radiusX * 1.15, radiusZ * 1.15, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(77, 238, 234, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(77, 238, 234, 0.35)';
    ctx.lineWidth = 2 / scale;
    ctx.stroke();

    // 蜃景外城墙
    ctx.fillStyle = 'rgba(20, 46, 58, 0.85)';
    ctx.strokeStyle = '#4deeea';
    ctx.lineWidth = 4.0;
    ctx.fillRect(-wallHalfX, -wallHalfZ, wallHalfX * 2, wallHalfZ * 2);
    ctx.strokeRect(-wallHalfX, -wallHalfZ, wallHalfX * 2, wallHalfZ * 2);

    // 蜃景三层主殿（含林寒守护的内部中枢石殿平面）、左四层宝塔、右三层配塔与钟鼓楼
    ctx.fillStyle = 'rgba(77, 238, 234, 0.26)';
    ctx.fillRect(-20, -62, 40, 38); // 重生主殿与中枢内殿
    ctx.strokeStyle = 'rgba(230, 180, 80, 0.85)';
    ctx.lineWidth = 1.6 / scale;
    ctx.strokeRect(-20, -62, 40, 38);
    // 中央圆形中枢石台
    ctx.beginPath();
    ctx.arc(0, -43, 6.2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(77, 238, 234, 0.38)';
    ctx.fillRect(-52, -11, 13, 13); // 左宝塔
    ctx.fillRect(38, -8, 12, 12);   // 右配塔
    ctx.restore();

    // 10. 【登云铁索】（连接登云崖 z=-208 与 蜃景南天门 z=-306 的金色锁链）
    const { start, end } = IRON_CHAIN_CONFIG;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(start.x, start.z);
    ctx.lineTo(end.x, end.z);
    ctx.strokeStyle = '#e6b450';
    ctx.lineWidth = 4.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();

    // 11. 核心地标点与文字标注
    for (const lm of WORLD_LANDMARKS) {
      const matched = this.searchQuery && lm.name.toLowerCase().includes(this.searchQuery);
      ctx.beginPath();
      ctx.arc(lm.x, lm.z, (matched ? 7.2 : 4.2) / scale, 0, Math.PI * 2);
      ctx.fillStyle = matched
        ? '#4deeea'
        : lm.realm === '空中蜃景'
          ? '#4deeea'
          : isParchment
            ? '#8c4a16'
            : '#e6b450';
      ctx.fill();

      if (isFull) {
        // 已由古图方框牌记（臺諫、相國井、朝天門）标注的节点，仅在深度放大或搜索命中时叠加现代副标题
        const isBoxedWard = ['chaotianmen', 'xiangguojing', 'taijian'].includes(lm.id);
        if (isBoxedWard && scale < 1.95 && !matched) continue;

        ctx.font = `600 ${Math.round(11.0 / scale)}px Inter, "PingFang SC", sans-serif`;
        ctx.fillStyle = matched
          ? '#ffffff'
          : isParchment && onParchment(lm.x, lm.z)
            ? '#241608'
            : 'rgba(245, 242, 235, 0.92)';
        ctx.textAlign = 'center';
        const yOff = lm.id === 'dengzhouMapScreen' ? (12.5 / scale) : (-8.5 / scale);
        ctx.fillText(lm.name, lm.x, lm.z + yOff);
      }
    }
  }

  drawPlayerMarker(ctx, x, z, heading, scale) {
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(-heading + Math.PI);

    // 视野扇形
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 34 / scale, -Math.PI * 0.72, -Math.PI * 0.28);
    ctx.closePath();
    ctx.fillStyle = 'rgba(230, 180, 80, 0.22)';
    ctx.fill();

    // 玩家箭头
    const r = 7.5 / scale;
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.3);
    ctx.lineTo(r * 0.95, r);
    ctx.lineTo(0, r * 0.55);
    ctx.lineTo(-r * 0.95, r);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#121314';
    ctx.lineWidth = 1.5 / scale;
    ctx.stroke();
    ctx.restore();
  }

  update() {
    if (!this.miniCtx || !this.miniCanvas) return;
    const dpr = this.miniCanvas.width / 288;
    const ctx = this.miniCtx;
    const w = this.miniCanvas.width;
    const h = this.miniCanvas.height;

    const ent = this.controllerManager.getActiveEntity();
    const scale = 0.42 * dpr;

    ctx.save();
    ctx.fillStyle = '#091017';
    ctx.fillRect(0, 0, w, h);

    ctx.translate(w * 0.5, h * 0.55);
    ctx.scale(scale, scale);
    ctx.translate(-ent.position.x, -ent.position.z);

    this.drawWorldLayers(ctx, scale / dpr, false);
    // 反派位置（无形怪物不上图）
    if (this.markers) {
      ctx.fillStyle = '#e8483f';
      const r = 4.2 / (scale / dpr);
      for (const p of this.markers()) { ctx.beginPath(); ctx.arc(p.x, p.z, r, 0, Math.PI * 2); ctx.fill(); }
    }
    this.drawPlayerMarker(ctx, ent.position.x, ent.position.z, ent.heading, scale / dpr);
    ctx.restore();
  }

  renderFullMap() {
    if (!this.isFullMapOpen || !this.fullCtx || !this.fullCanvas) return;
    const dpr = this.fullCanvas.width / window.innerWidth;
    const ctx = this.fullCtx;
    const w = this.fullCanvas.width;
    const h = this.fullCanvas.height;
    const scale = this.zoom * dpr;

    const ent = this.controllerManager.getActiveEntity();
    if (this.elPlayerInfo) {
      const info = getLocationInfo(ent.position.x, ent.position.y, ent.position.z, this.controllerManager.activeMode);
      this.elPlayerInfo.textContent = `当前位置：${info.realm} · ${info.street}`;
    }

    ctx.save();
    // 外围是深色胡桃木案底（呼应剧中木框屏风），中央羊皮卷是唯一的亮面，视觉重心落在登州城
    ctx.fillStyle = '#1d150e';
    ctx.fillRect(0, 0, w, h);
    const vignette = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.15, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    vignette.addColorStop(0, '#33251a');
    vignette.addColorStop(1, '#120c07');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    ctx.translate(w * 0.5, h * 0.5);
    ctx.scale(scale, scale);
    ctx.translate(-this.panX, -this.panZ);

    this.drawWorldLayers(ctx, this.zoom, true);
    this.drawPlayerMarker(ctx, ent.position.x, ent.position.z, ent.heading, this.zoom);
    ctx.restore();
  }
}
