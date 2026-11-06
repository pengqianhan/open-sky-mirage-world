// js/cameras.js
// 多机位镜头系统：3 个角色跟随镜头机位
// 支持鼠标拖拽环视、滚轮/双指缩放以及剧照参考图自动联动

import * as THREE from 'three/webgpu';

export const CAMERA_PRESETS = [
  { id: 'chase',          name: '第三人称跟随 (Chase)',       category: 'follow', fov: 56 },
  { id: 'action',         name: '仰视动作跟拍 (Low-Angle)',   category: 'follow', fov: 62 },
  { id: 'pov',            name: '第一人称视角 (First-Person)', fov: 68 }
];

export class CameraSystem {
  constructor(domElement, controllerManager) {
    this.domElement = domElement;
    this.controllerManager = controllerManager;

    this.camera = new THREE.PerspectiveCamera(
      56,
      window.innerWidth / window.innerHeight,
      0.4,
      12000
    );

    this.activePresetId = 'chase';
    this.orbitYawOffset = 0.0;
    this.orbitPitchOffset = -0.10; // 默认微仰角，方便在登州街道行走时同时看到空中蜃景
    this.zoomMultiplier = 1.0;
    this.isDragging = false;
    this.userOrbitTimer = 0;

    this.currentPos = new THREE.Vector3(0, 8, 135);
    this.currentLookAt = new THREE.Vector3(0, 35, 0);
    this.initialized = false;

    this._desiredPos = new THREE.Vector3();
    this._desiredLook = new THREE.Vector3();

    this.bindPointerControls();
  }

  bindPointerControls() {
    const canvas = this.domElement;
    const pointers = new Map();
    canvas.style.touchAction = 'none';

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || pointers.size >= 2) return;
      e.preventDefault();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
      this.isDragging = true;
      this.userOrbitTimer = 5.0;
    });

    canvas.addEventListener('pointermove', (e) => {
      const pointer = pointers.get(e.pointerId);
      if (!pointer) return;
      e.preventDefault();
      const dx = e.clientX - pointer.x;
      const dy = e.clientY - pointer.y;
      pointer.x = e.clientX;
      pointer.y = e.clientY;

      this.orbitYawOffset -= dx * 0.0065;
      this.orbitPitchOffset = Math.max(-0.55, Math.min(0.75, this.orbitPitchOffset + dy * 0.005));
      this.userOrbitTimer = 5.0;
    });

    const releasePointer = (id) => {
      if (!pointers.delete(id)) return;
      this.isDragging = pointers.size > 0;
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(type, (e) => releasePointer(e.pointerId));
    }

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomMultiplier = Math.max(0.45, Math.min(2.6, this.zoomMultiplier + e.deltaY * 0.001));
    }, { passive: false });
  }

  setCameraPreset(presetId, snapImmediately = false) {
    const preset = CAMERA_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    this.activePresetId = preset.id;
    this.camera.fov = preset.fov;
    this.camera.updateProjectionMatrix();
    if (snapImmediately) {
      this.initialized = false;
    }
  }

  resetForTeleport() {
    this.isDragging = false;
    this.orbitYawOffset = 0;
    this.orbitPitchOffset = -0.08;
    this.zoomMultiplier = 1.0;
    this.userOrbitTimer = 0;
    this.setCameraPreset('chase', true);
  }

  getActivePreset() {
    return CAMERA_PRESETS.find((p) => p.id === this.activePresetId) || CAMERA_PRESETS[0];
  }

  onResize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    const entity = this.controllerManager.getActiveEntity();
    if (entity.mesh) {
      entity.mesh.visible = this.activePresetId !== 'pov';
    }
    const desiredPos = this._desiredPos;
    const desiredLook = this._desiredLook;

    if (this.userOrbitTimer > 0 && !this.isDragging) {
      this.userOrbitTimer = Math.max(0, this.userOrbitTimer - dt);
    }

    if (!this.isDragging && this.userOrbitTimer <= 0 && Math.abs(entity.speed) > 0.5) {
      this.orbitYawOffset -= Math.round(this.orbitYawOffset / (Math.PI * 2)) * (Math.PI * 2);
      this.orbitYawOffset += (0.0 - this.orbitYawOffset) * (1 - Math.exp(-dt * 2.2));
    }

    const totalYaw = entity.heading + this.orbitYawOffset;

    switch (this.activePresetId) {
      case 'chase': {
        const dist = entity.chaseDistance * this.zoomMultiplier;
        const height = entity.chaseHeight * this.zoomMultiplier + Math.sin(this.orbitPitchOffset) * dist * 0.9;
        const horizDist = Math.cos(this.orbitPitchOffset) * dist;

        desiredPos.set(
          entity.position.x - Math.sin(totalYaw) * horizDist,
          Math.max(0.8, entity.position.y + height),
          entity.position.z - Math.cos(totalYaw) * horizDist
        );

        const pitchLookBias = Math.sin(-this.orbitPitchOffset) * 8.0 + 1.2;
        desiredLook.set(
          entity.position.x + Math.sin(totalYaw) * 6.5,
          entity.position.y + entity.cameraTargetOffset.y + pitchLookBias,
          entity.position.z + Math.cos(totalYaw) * 6.5
        );
        if (entity.type === 'chain') {
          // Look past the thick cable from the side so the hanging actor stays visible.
          desiredPos.set(
            entity.position.x + (Math.cos(totalYaw) * 6 - Math.sin(totalYaw) * 2) * this.zoomMultiplier,
            entity.position.y + (4 + Math.sin(this.orbitPitchOffset) * 3) * this.zoomMultiplier,
            entity.position.z - (Math.sin(totalYaw) * 6 + Math.cos(totalYaw) * 2) * this.zoomMultiplier
          );
          desiredLook.set(entity.position.x, entity.position.y - 1.1, entity.position.z);
        }
        break;
      }

      case 'action': {
        const sideOffset = 1.45;
        const backDist = 3.8 * this.zoomMultiplier;
        desiredPos.set(
          entity.position.x - Math.sin(entity.heading) * backDist + Math.cos(entity.heading) * sideOffset,
          Math.max(0.65, entity.position.y + 0.85),
          entity.position.z - Math.cos(entity.heading) * backDist - Math.sin(entity.heading) * sideOffset
        );
        // 仰角对准角色与高空蜃景方向
        desiredLook.set(
          entity.position.x + Math.sin(entity.heading) * 12.0,
          entity.position.y + 4.8,
          entity.position.z + Math.cos(entity.heading) * 12.0
        );
        break;
      }

      case 'pov': {
        const eyeY = entity.type === 'horse' ? 2.25 : entity.type === 'chain' ? -0.35 : 1.68;
        desiredPos.set(
          entity.position.x + Math.sin(entity.heading) * 0.35,
          entity.position.y + eyeY,
          entity.position.z + Math.cos(entity.heading) * 0.35
        );
        desiredLook.set(
          entity.position.x + Math.sin(totalYaw) * 45.0,
          entity.position.y + eyeY + Math.sin(-this.orbitPitchOffset) * 24.0 + 2.5,
          entity.position.z + Math.cos(totalYaw) * 45.0
        );
        break;
      }
    }

    if (!this.initialized) {
      this.currentPos.copy(desiredPos);
      this.currentLookAt.copy(desiredLook);
      this.initialized = true;
    } else {
      const lerpFactor = 1.0 - Math.exp(-dt * 8.5);
      this.currentPos.lerp(desiredPos, lerpFactor);
      this.currentLookAt.lerp(desiredLook, lerpFactor);
    }

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }
}
