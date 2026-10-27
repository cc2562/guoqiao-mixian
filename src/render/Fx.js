/**
 * 粒子池（Points + 自定义 ShaderMaterial）。
 * 只有两层：soft（蒸汽/气泡/水花/闪光）与 hard（碎屑/彩带）。
 * 全部「预分配 + 环形复用」，运行期零分配、零增删，2 个 drawcall。
 */
import * as THREE from 'three';
import { softDotTexture, squareDotTexture } from './Toon.js';

const VERT = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float uScale;
  varying float vA;
  varying vec3 vC;
  void main() {
    vA = aAlpha;
    vC = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.08, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  uniform sampler2D uMap;
  varying float vA;
  varying vec3 vC;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    float a = t.a * vA;
    if (a < 0.012) discard;
    gl_FragColor = vec4(vC, a);
  }
`;

const K_STEAM = 0;
const K_BUBBLE = 1;
const K_SPLASH = 2;
const K_CRUMB = 3;
const K_CONFETTI = 4;
const K_SPARK = 5;

class Layer {
  constructor(scene, count, map, { additive = false, renderOrder = 10, size = 1 } = {}) {
    this.count = count;
    this.cursor = 0;
    this.ps = new Array(count);
    for (let i = 0; i < count; i++) {
      this.ps[i] = {
        life: 0, max: 1, kind: K_STEAM,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        s0: 0.1, s1: 0.2, a0: 1, grav: 0, drag: 0, sway: 0, ph: 0,
        r: 1, g: 1, b: 1,
      };
    }

    this.pos = new Float32Array(count * 3);
    this.sizes = new Float32Array(count);
    this.alphas = new Float32Array(count);
    this.cols = new Float32Array(count * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.cols, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 50);
    this.geo = geo;

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uScale: { value: 600 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    scene.add(this.points);
    this.sizeMul = size;
  }

  emit(o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const p = this.ps[i];
    p.kind = o.kind;
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.max = o.life || 1;
    p.life = p.max;
    p.s0 = o.s0 || 0.1;
    p.s1 = o.s1 == null ? p.s0 : o.s1;
    p.a0 = o.a0 == null ? 1 : o.a0;
    p.grav = o.grav || 0;
    p.drag = o.drag || 0;
    p.sway = o.sway || 0;
    p.ph = Math.random() * Math.PI * 2;
    p.r = o.r == null ? 1 : o.r;
    p.g = o.g == null ? 1 : o.g;
    p.b = o.b == null ? 1 : o.b;
  }

  setScale(s) {
    this.mat.uniforms.uScale.value = s;
  }

  update(dt) {
    const ps = this.ps;
    const pos = this.pos, sz = this.sizes, al = this.alphas, col = this.cols;
    for (let i = 0; i < this.count; i++) {
      const p = ps[i];
      if (p.life <= 0) {
        al[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        al[i] = 0;
        continue;
      }
      const k = 1 - p.life / p.max;   // 0 → 1

      // 物理
      if (p.drag) {
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy *= d; p.vz *= d;
      }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      if (p.sway) {
        p.x += Math.sin(p.life * 2.6 + p.ph) * p.sway * dt;
        p.z += Math.cos(p.life * 2.1 + p.ph) * p.sway * dt;
      }

      // 透明度曲线
      let a;
      switch (p.kind) {
        case K_STEAM:
          a = Math.min(1, k * 4.5) * Math.pow(1 - k, 1.35);
          break;
        case K_BUBBLE:
          a = Math.min(1, k * 8) * (1 - k * k);
          break;
        case K_SPLASH:
        case K_SPARK:
          a = Math.pow(1 - k, 1.8);
          break;
        case K_CONFETTI:
          a = Math.min(1, (1 - k) * 4);
          break;
        default:
          a = Math.min(1, (1 - k) * 5);
      }

      const idx = i * 3;
      pos[idx] = p.x;
      pos[idx + 1] = p.y;
      pos[idx + 2] = p.z;
      sz[i] = (p.s0 + (p.s1 - p.s0) * k) * this.sizeMul;
      al[i] = p.a0 * a;
      col[idx] = p.r;
      col[idx + 1] = p.g;
      col[idx + 2] = p.b;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
}

export class Fx {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.soft = new Layer(scene, 340, softDotTexture(), { renderOrder: 11 });
    this.hard = new Layer(scene, 170, squareDotTexture(), { renderOrder: 12 });
    this.enabled = true;
    this.scale = 1;
  }

  /** 视口变化时更新点尺寸换算（每帧也可调用，成本极低） */
  setViewport(bufferHeight, fovDeg) {
    const fov = (fovDeg * Math.PI) / 180;
    const s = bufferHeight / (2 * Math.tan(fov / 2));
    this.soft.setScale(s);
    this.hard.setScale(s);
    this.scale = s;
  }

  /* ---------------- 语义化接口 ---------------- */

  /** 蒸汽：一团白雾向上飘散 */
  steam(p, n = 2) {
    if (!this.enabled) return;
    for (let i = 0; i < n; i++) {
      this.soft.emit({
        kind: K_STEAM,
        x: p.x + (Math.random() - 0.5) * 0.42,
        y: p.y + Math.random() * 0.06,
        z: p.z + (Math.random() - 0.5) * 0.42,
        vx: (Math.random() - 0.5) * 0.1,
        vy: 0.28 + Math.random() * 0.3,
        vz: (Math.random() - 0.5) * 0.1,
        life: 1.5 + Math.random() * 0.9,
        s0: 0.18, s1: 0.58,
        a0: 0.14 + Math.random() * 0.1,
        drag: 0.5, sway: 0.12,
        r: 1, g: 0.985, b: 0.94,
      });
    }
  }

  /** 气泡：从锅底冒出，到水面破掉 */
  bubble(p, n = 3, radius = 0.4) {
    if (!this.enabled) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      this.soft.emit({
        kind: K_BUBBLE,
        x: p.x + Math.cos(a) * r,
        y: p.y - 0.1 - Math.random() * 0.15,
        z: p.z + Math.sin(a) * r,
        vx: (Math.random() - 0.5) * 0.04,
        vy: 0.35 + Math.random() * 0.35,
        vz: (Math.random() - 0.5) * 0.04,
        life: 0.55 + Math.random() * 0.45,
        s0: 0.035, s1: 0.055,
        a0: 0.5,
        r: 1, g: 0.94, b: 0.78,
      });
    }
  }

  /** 溅起的小水珠 */
  splash(p, n = 8, color = [1, 0.9, 0.66]) {
    if (!this.enabled) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.5 + Math.random() * 1.1;
      this.soft.emit({
        kind: K_SPLASH,
        x: p.x + Math.cos(a) * 0.06,
        y: p.y + 0.02,
        z: p.z + Math.sin(a) * 0.06,
        vx: Math.cos(a) * sp,
        vy: 1.1 + Math.random() * 0.9,
        vz: Math.sin(a) * sp,
        life: 0.42 + Math.random() * 0.2,
        s0: 0.05, s1: 0.02,
        a0: 0.9,
        grav: 5.2,
        r: color[0], g: color[1], b: color[2],
      });
    }
  }

  /** 切菜的碎屑 */
  crumbs(p, n = 6, color = [0.85, 0.6, 0.45]) {
    if (!this.enabled) return;
    for (let i = 0; i < n; i++) {
      this.hard.emit({
        kind: K_CRUMB,
        x: p.x + (Math.random() - 0.5) * 0.16,
        y: p.y + Math.random() * 0.05,
        z: p.z + (Math.random() - 0.5) * 0.16,
        vx: (Math.random() - 0.5) * 1.1,
        vy: 0.5 + Math.random() * 0.8,
        vz: (Math.random() - 0.5) * 1.1,
        life: 0.55 + Math.random() * 0.35,
        s0: 0.05 + Math.random() * 0.03, s1: 0.02,
        a0: 0.95,
        grav: 6.5,
        r: color[0], g: color[1], b: color[2],
      });
    }
  }

  /** 闪光（选中、完成） */
  sparkle(p, n = 8, color = [1, 0.85, 0.45]) {
    if (!this.enabled) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.3 + Math.random() * 0.9;
      this.soft.emit({
        kind: K_SPARK,
        x: p.x, y: p.y + Math.random() * 0.1, z: p.z,
        vx: Math.cos(a) * sp,
        vy: 0.6 + Math.random() * 0.8,
        vz: Math.sin(a) * sp,
        life: 0.5 + Math.random() * 0.3,
        s0: 0.09, s1: 0.015,
        a0: 1,
        grav: 1.6, drag: 1.6,
        r: color[0], g: color[1], b: color[2],
      });
    }
  }

  /** 结果页彩纸 */
  confetti(center, n = 60, spread = 1.6) {
    if (!this.enabled) return;
    const palette = [
      [0.95, 0.28, 0.2], [0.96, 0.72, 0.25], [0.48, 0.7, 0.4],
      [0.32, 0.6, 0.85], [0.93, 0.55, 0.65], [1, 0.93, 0.7],
    ];
    for (let i = 0; i < n; i++) {
      const c = palette[(Math.random() * palette.length) | 0];
      this.hard.emit({
        kind: K_CONFETTI,
        x: center.x + (Math.random() - 0.5) * spread,
        y: center.y + 1.2 + Math.random() * 1.2,
        z: center.z + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -0.15 - Math.random() * 0.3,
        vz: (Math.random() - 0.5) * 0.5,
        life: 2.2 + Math.random() * 1.6,
        s0: 0.038, s1: 0.034,
        a0: 0.95,
        grav: 0.06, drag: 0.4, sway: 0.55,
        r: c[0], g: c[1], b: c[2],
      });
    }
  }

  update(dt) {
    this.soft.update(dt);
    this.hard.update(dt);
  }

  clear() {
    for (const p of this.soft.ps) p.life = 0;
    for (const p of this.hard.ps) p.life = 0;
  }
}
