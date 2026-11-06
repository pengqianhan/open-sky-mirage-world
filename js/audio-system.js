// js/audio-system.js
// 程序化 Web Audio 东方武侠与天外蜃景声景合成器（无需外部音频文件）：
// 包含：山谷与高空云海风声、古琴/编钟五声音阶泛音、铁索飞渡锁链铿锵声与天外母舰低频共鸣

export class MirageAudioSystem {
  constructor({ onStateChange } = {}) {
    this.onStateChange = onStateChange;
    this.supported = typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);
    this.enabled = false;
    this.ctx = null;
    this.windGain = null;
    this.windFilter = null;
    this.alienDroneGain = null;
    this.chimeTimer = 0;
    this.chainClankTimer = 0;
  }

  initContext() {
    if (this.ctx || !this.supported) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    // 1. 连续粉红噪声风声发生器
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 320;
    this.windFilter.Q.value = 1.4;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0.0;

    whiteNoise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.ctx.destination);
    whiteNoise.start(0);

    // 2. 天外母舰低频科幻共鸣振荡器
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 68;
    this.alienDroneGain = this.ctx.createGain();
    this.alienDroneGain.gain.value = 0.0;
    osc.connect(this.alienDroneGain);
    this.alienDroneGain.connect(this.ctx.destination);
    osc.start(0);
  }

  setEnabled(flag) {
    if (!this.supported) return;
    this.enabled = Boolean(flag);
    if (this.enabled) {
      this.initContext();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } else if (this.windGain && this.ctx) {
      this.windGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      this.alienDroneGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
    if (this.onStateChange) this.onStateChange(this.enabled);
  }

  playPentatonicChime() {
    if (!this.enabled || !this.ctx) return;
    // 宫商角徵羽古琴/编钟泛音
    const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 659.25];
    const freq = scale[Math.floor(Math.random() * scale.length)];
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 2.9);
  }

  /** Short filtered-noise swish; each lead's attack passes its own pitch sweep. */
  playAttack({ from, to, duration, gain: level }) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * duration), this.ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(from, now);
    filter.frequency.exponentialRampToValueAtTime(to, now + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
  }

  playChainClank() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(520 + Math.random() * 240, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.09);

    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  update(dt, entity, activeMode, isAlienMode = false) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // 随海拔与速度调节高空山风呼啸感
    const altFactor = Math.min(1.0, Math.max(0.0, entity.position.y / 250.0));
    const speedFactor = Math.min(1.0, Math.abs(entity.speed) / 28.0);
    const targetWindGain = 0.04 + altFactor * 0.08 + speedFactor * 0.09;
    const targetWindFreq = 260 + altFactor * 380 + speedFactor * 320;

    this.windGain.gain.setTargetAtTime(targetWindGain, now, 0.15);
    this.windFilter.frequency.setTargetAtTime(targetWindFreq, now, 0.15);

    // 母舰低频共鸣
    const alienTarget = isAlienMode ? 0.065 : altFactor > 0.7 ? 0.02 : 0.0;
    this.alienDroneGain.gain.setTargetAtTime(alienTarget, now, 0.25);

    // 铁索攀爬时的锁环碰撞声
    if (activeMode === 'chain' && Math.abs(entity.speed) > 1.5) {
      this.chainClankTimer -= dt * (Math.abs(entity.speed) * 0.45);
      if (this.chainClankTimer <= 0) {
        this.playChainClank();
        this.chainClankTimer = 1.0;
      }
    }

    // 偶发古琴/空灵风铃音
    this.chimeTimer -= dt;
    if (this.chimeTimer <= 0) {
      this.playPentatonicChime();
      this.chimeTimer = 4.5 + Math.random() * 5.0;
    }
  }
}
