/**
 * 渲染器 + 场景 + 固定三盏灯。
 * 不开 shadowMap（卡通风格用假阴影），不用 Clock（时间统一由 App 喂）。
 */
import * as THREE from 'three';
import { COLORS } from '../data/config.js';
import { canvasTexture } from './Toon.js';

export class Renderer3D {
  constructor(canvas, tier) {
    this.canvas = canvas;
    this.tier = tier;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping; // ACES 会把糖果色洗灰
    this.renderer.shadowMap.enabled = false;
    this.renderer.setClearColor(COLORS.cream, 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(COLORS.cream);

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 80);
    this.camera.position.set(0, 2.4, 5);

    this._addLights();
    this._addBackdrop();
  }

  _addLights() {
    const hemi = new THREE.HemisphereLight(0xfff6e8, 0xffc9a8, 1.95);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(2.6, 4.6, 3.2);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xffd9be, 0.6);
    fill.position.set(-3.4, 1.8, 2.2);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xfff0dd, 0.5);
    rim.position.set(-0.6, 2.2, -4.2);
    this.scene.add(rim);
  }

  /** 背景板：暖奶油渐变 + 轻微暗角，给画面纵深 */
  _addBackdrop() {
    const tex = canvasTexture(256, 512, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, '#fffaf0');
      grd.addColorStop(0.42, '#ffeed3');
      grd.addColorStop(0.78, '#fbd9ae');
      grd.addColorStop(1, '#f0c493');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      // 柔和光斑
      const rg = g.createRadialGradient(w * 0.5, h * 0.3, 10, w * 0.5, h * 0.3, w * 0.9);
      rg.addColorStop(0, 'rgba(255,255,255,0.55)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.fillRect(0, 0, w, h);
    });
    const geo = new THREE.PlaneGeometry(24, 14);
    const mat = new THREE.MeshBasicMaterial({ map: tex, depthWrite: false });
    const wall = new THREE.Mesh(geo, mat);
    wall.position.set(0, 3.4, -6.2);
    wall.renderOrder = -10;
    this.scene.add(wall);
  }

  resize(w, h, dpr, fov) {
    this.renderer.setPixelRatio(Math.min(dpr, window.devicePixelRatio || dpr));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  setDPR(dpr) {
    this.renderer.setPixelRatio(Math.min(dpr, window.devicePixelRatio || dpr));
  }

  get bufferHeight() {
    return this.renderer.domElement.height;
  }

  info() {
    const i = this.renderer.info.render;
    return { calls: i.calls, tris: i.triangles };
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

/** 粗略的机型性能探测（够用就好，宁保守不冒进） */
export function detectTier() {
  const ua = navigator.userAgent || '';
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const oldAndroid = /Android/.test(ua) && cores <= 4;
  if (oldAndroid || mem <= 2) return 'low';
  if (!mobile) return 'high';
  return cores >= 8 ? 'high' : 'mid';
}
