/**
 * 程序化音效（Web Audio，零素材）。
 * iOS 必须在用户手势里 resume()，所以 unlock() 由「开始下厨」按钮调用。
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuf = null;
    this.boilNodes = null;
    this.ready = false;
  }

  async unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this._makeNoise(1.2);
      this.ready = true;
    }
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (_) {}
    }
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended' && !this.muted) {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  _makeNoise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** 单音（可滑音） */
  tone({ freq = 440, freq2 = null, dur = 0.16, type = 'sine', gain = 0.18, attack = 0.006, when = 0 }) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freq2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** 噪声（带滤波，可扫频） */
  noise({ dur = 0.15, gain = 0.14, type = 'bandpass', freq = 1400, freq2 = null, q = 1, when = 0 }) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(freq, t);
    if (freq2) flt.frequency.exponentialRampToValueAtTime(Math.max(60, freq2), t + dur);
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /* ---------------- 语义化音效 ---------------- */

  tap() {
    this.tone({ freq: 720, freq2: 900, dur: 0.07, type: 'triangle', gain: 0.1 });
  }

  pick() {
    this.tone({ freq: 520, freq2: 780, dur: 0.12, type: 'triangle', gain: 0.12 });
  }

  /** 切菜：短促「嚓」 */
  chop(power = 1) {
    this.noise({ dur: 0.055, gain: 0.16 * power, type: 'bandpass', freq: 3200, freq2: 1600, q: 1.6 });
    this.tone({ freq: 180, freq2: 90, dur: 0.07, type: 'square', gain: 0.05 * power });
  }

  /** 落水：咕嘟/溅起 */
  splash() {
    this.noise({ dur: 0.28, gain: 0.15, type: 'lowpass', freq: 2400, freq2: 320, q: 0.8 });
    this.tone({ freq: 320, freq2: 120, dur: 0.18, type: 'sine', gain: 0.1 });
  }

  /** 物体入碗的轻「咚」 */
  place() {
    this.tone({ freq: 240, freq2: 150, dur: 0.14, type: 'sine', gain: 0.14 });
    this.noise({ dur: 0.08, gain: 0.05, type: 'lowpass', freq: 900 });
  }

  /** 调味料撒入：沙沙声 */
  sprinkle() {
    this.noise({ dur: 0.22, gain: 0.09, type: 'highpass', freq: 2600, q: 0.6 });
    this.tone({ freq: 900, freq2: 1300, dur: 0.09, type: 'triangle', gain: 0.05 });
  }

  /** 结果页逐行「叮」，step 0..6 走五声音阶 */
  ding(step = 0) {
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];
    const f = scale[Math.min(scale.length - 1, Math.max(0, step))];
    this.tone({ freq: f, dur: 0.5, type: 'sine', gain: 0.13 });
    this.tone({ freq: f * 2, dur: 0.35, type: 'sine', gain: 0.04 });
  }

  /** 称号盖章 */
  stamp() {
    this.tone({ freq: 110, freq2: 62, dur: 0.34, type: 'sine', gain: 0.26 });
    this.noise({ dur: 0.16, gain: 0.1, type: 'lowpass', freq: 700 });
  }

  /** 阶段完成的小上行 */
  success() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.1, when: i * 0.075 });
    });
  }

  /** 沸腾环境音（低频滚动噪声），阶段进出时开关 */
  startBoil() {
    if (!this.ready || this.boilNodes || this.muted) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 420;
    flt.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.055, ctx.currentTime, 0.5);
    src.connect(flt).connect(g).connect(this.master);
    src.start();
    this.boilNodes = { src, g, flt };
  }

  setBoil(level = 1) {
    if (this.boilNodes) {
      this.boilNodes.g.gain.setTargetAtTime(0.055 * level, this.ctx.currentTime, 0.3);
      this.boilNodes.flt.frequency.setTargetAtTime(320 + 380 * level, this.ctx.currentTime, 0.3);
    }
  }

  stopBoil() {
    if (!this.boilNodes) return;
    const { src, g } = this.boilNodes;
    const t = this.ctx.currentTime;
    g.gain.setTargetAtTime(0.0001, t, 0.25);
    try { src.stop(t + 0.8); } catch (_) {}
    this.boilNodes = null;
  }
}
