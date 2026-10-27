/**
 * 应用外壳：渲染循环、resize、可见性暂停、性能档、阶段装配。
 */
import * as THREE from 'three';
import { Renderer3D, detectTier } from '../render/Renderer.js';
import { Layout } from './Layout.js';
import { Cine } from './Cine.js';
import { Input } from './Input.js';
import { Audio } from './Audio.js';
import { Fx } from '../render/Fx.js';
import { StageMachine } from './StageMachine.js';
import { UIRoot } from '../ui/UIRoot.js';
import { tweenUpdate } from './Tween.js';
import { TIERS } from '../data/config.js';
import { setOutlineWidth } from '../render/Outline.js';
import { newScore } from '../data/scoring.js';
import { createKitchen } from '../props/Kitchen.js';
import { updateNoodleWobble } from '../props/Noodles.js';

import { S1Broth } from '../stages/S1Broth.js';
import { S2Cut } from '../stages/S2Cut.js';
import { S3Noodle } from '../stages/S3Noodle.js';
import { S4Plate } from '../stages/S4Plate.js';
import { S5Result } from '../stages/S5Result.js';

export const STAGE_ORDER = ['s1', 's2', 's3', 's4', 's5'];

export class App {
  constructor(canvas) {
    this.tierName = detectTier();
    this.tier = TIERS[this.tierName];
    this.dpr = Math.min(this.tier.dpr, window.devicePixelRatio || 1);

    this.r3d = new Renderer3D(canvas, this.tier);
    this.layout = new Layout().measure();
    this.camera = this.r3d.camera;
    this.cine = new Cine(this.camera, this.layout);
    this.input = new Input(canvas, this.camera);
    this.audio = new Audio();
    this.fx = new Fx(this.r3d.scene, this.camera);
    this.ui = new UIRoot();
    this.ui.buildSteps(STAGE_ORDER.length);

    this.score = newScore();
    this.save = {
      picked: [],
      pieces: {},        // ingId -> { count, thickness, polys }（S2 切好的碎块）
      bowlId: '',        // 汤碗
      noodleBowlId: '',  // 米线碗
      trayId: '',        // 格子盘
      plateId: '',
      noodlePos: 0,
      cutQualities: [],
      plateScores: {},
    };

    this.ctx = {
      scene: this.r3d.scene,
      camera: this.camera,
      renderer: this.r3d,
      layout: this.layout,
      cine: this.cine,
      input: this.input,
      audio: this.audio,
      fx: this.fx,
      ui: this.ui,
      score: this.score,
      save: this.save,
      tier: this.tierName,
      go: (name, params) => this.machine.go(name, params),
      restart: () => this.restart(),
      next: (params) => this.machine.go(this.machine.nextName(), params),
    };

    // 环境
    this.kitchen = createKitchen();
    this.r3d.scene.add(this.kitchen.group);

    // 阶段
    this.stages = {
      s1: new S1Broth(this.ctx),
      s2: new S2Cut(this.ctx),
      s3: new S3Noodle(this.ctx),
      s4: new S4Plate(this.ctx),
      s5: new S5Result(this.ctx),
    };
    for (const k of STAGE_ORDER) {
      const s = this.stages[k];
      s.name = k;
      s.build();
      this.r3d.scene.add(s.group);
    }

    this.machine = new StageMachine({
      stages: this.stages,
      order: STAGE_ORDER,
      ctx: this.ctx,
      ui: this.ui,
      cine: this.cine,
      input: this.input,
    });

    this.input.on('down', (p) => this.machine.pointer(p));
    this.input.on('move', (p) => this.machine.pointer(p));
    this.input.on('up', (p) => this.machine.pointer(p));

    this.last = performance.now();
    this.ema = 0.016;
    this.running = false;
    this.acc = 0;

    this.resize();
    this.cine.snap('boot');

    this._bindResize();
    this._bindVisibility();
    this._bindHud();
  }

  /* ---------------- 装配 ---------------- */
  async warmup(onProgress) {
    const rt = new THREE.WebGLRenderTarget(4, 4);
    for (let i = 0; i < STAGE_ORDER.length; i++) {
      const s = this.stages[STAGE_ORDER[i]];
      s.group.visible = true;
      this.r3d.renderer.setRenderTarget(rt);
      this.r3d.renderer.render(this.r3d.scene, this.camera);
      s.group.visible = false;
      onProgress && onProgress((i + 1) / (STAGE_ORDER.length + 1));
      await new Promise((r) => setTimeout(r, 0));
    }
    this.r3d.renderer.setRenderTarget(null);
    rt.dispose();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.r3d.renderer.setAnimationLoop(this.tick);
    this.machine.go('s1');
  }

  restart() {
    this.score = newScore();
    this.ctx.score = this.score;
    this.save.picked = [];
    this.save.pieces = {};
    this.save.bowlId = '';
    this.save.noodleBowlId = '';
    this.save.trayId = '';
    this.save.plateId = '';
    this.save.noodlePos = 0;
    this.save.cutQualities = [];
    this.fx.clear();
    this.machine.go('s1');
  }

  /* ---------------- 循环 ---------------- */
  tick = (timeMs) => {
    const raw = (timeMs - this.last) / 1000;
    this.last = timeMs;
    const dt = Math.min(raw > 0 ? raw : 1 / 60, 1 / 30);

    tweenUpdate(dt);
    updateNoodleWobble(timeMs / 1000);
    this.machine.update(dt);
    this.cine.update(dt);
    this.fx.update(dt);
    this.kitchen.update(dt);

    this.r3d.render();

    // 自适应降档（用 EMA，避免单帧抖动误判）
    this.acc += dt;
    this.ema = this.ema * 0.92 + raw * 0.08;
    if (this.acc > 1.2) {
      this.acc = 0;
      if (this.ema > 0.026 && this.dpr > 1.3) {
        this.dpr = Math.max(1.25, this.dpr - 0.25);
        this.r3d.setDPR(this.dpr);
        this.resize();
      }
    }
  };

  /* ---------------- 尺寸 ---------------- */
  resize() {
    this.layout.measure();
    const fov = this.layout.portrait ? 46 : 40;
    this.r3d.resize(this.layout.w, this.layout.h, this.dpr, fov);
    this.input.resize(this.layout.w, this.layout.h);
    this.fx.setViewport(this.r3d.bufferHeight, fov);
    setOutlineWidth(this.layout.portrait ? 0.011 : 0.016);
    this.cine.setStage(this.cine.stage);
    this.machine.resize(this.layout);
  }

  _bindResize() {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => this.resize());
    };
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(onResize, 220));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        // 地址栏收起（高度变化 < 120px）只同步 DOM，不重新拟合镜头
        const h = Math.round(window.visualViewport.height);
        if (Math.abs(h - this.layout.h) < 120) {
          document.documentElement.style.setProperty('--vh', h + 'px');
          return;
        }
        onResize();
      }, { passive: true });
    }
  }

  _bindVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.r3d.renderer.setAnimationLoop(null);
        this.audio.suspend();
      } else {
        this.last = performance.now();   // 关键：重置时间基准，否则一帧跳完所有补间
        this.audio.resume();
        if (this.running) this.r3d.renderer.setAnimationLoop(this.tick);
      }
    });
  }

  _bindHud() {
    const snd = this.ui.soundBtn;
    if (snd) {
      snd.addEventListener('click', () => {
        const muted = !this.audio.muted;
        this.audio.setMuted(muted);
        snd.classList.toggle('muted', muted);
        snd.style.opacity = muted ? 0.45 : 1;
        this.ui.toast(muted ? '已静音' : '音效已开', '', 900);
      });
    }

    const skip = this.ui.skipBtn;
    if (skip) {
      skip.addEventListener('click', () => {
        if (this.machine.busy) return;
        this.audio.tap();
        this.machine.go(this.machine.nextName());
      });
    }
  }
}
