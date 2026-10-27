/**
 * 相机：全项目唯一的位置来源 —— 只维护「目标位姿」，用指数阻尼追过去。
 * 这样 resize / 旋转屏幕 / 阶段切换 / 阶段内推镜 都只改 goal，
 * 永远不会出现两条补间互相打架导致抖动。
 */
import * as THREE from 'three';
import { FRAMES, MISC } from '../data/config.js';
import { clamp01 } from './Tween.js';

const DEG = Math.PI / 180;
const _dir = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _pv = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

/** 对焦容差：内容占可用区域的 92%（四周留一点呼吸） */
const FIT = 0.92;
const FIT_ITERS = 7;

export class Cine {
  constructor(camera, layout) {
    this.camera = camera;
    this.layout = layout;
    this.goalPos = new THREE.Vector3(0, 2, 5);
    this.goalLook = new THREE.Vector3(0, 0.6, 0);
    this.curPos = this.goalPos.clone();
    this.curLook = this.goalLook.clone();
    this.smooth = MISC.cameraSmooth;
    this.stage = 'boot';
    this.shakeT = 0;
    this.shakeAmp = 0;
    this.orbit = 0;        // 弧度/秒
    this.orbitAngle = 0;
    this.orbitBase = null; // {target, radius, height, planeDir}
  }

  /**
   * 反算「刚好装下这一阶段」的相机位姿。
   *
   * 阶段只描述「哪些世界点必须入镜」（FRAMES[].focus）+ 大致方向，
   * 真实距离由这里用真实投影迭代求解 —— 竖屏、横屏、各种刘海屏都能自适应，
   * 也不用为了 UI 高度手调常量。
   */
  computePos(name, outPos, outLook) {
    const f = FRAMES[name] || FRAMES.s1;
    _tgt.set(f.target[0], f.target[1], f.target[2]);
    _dir.set(f.dir[0], f.dir[1], f.dir[2]).normalize();

    // 运行期覆盖：装盘页要按选中的那只盘子实际大小取景（圆/方/桥形差很多）
    const ov = this.focusOverride && this.focusOverride.name === name
      ? this.focusOverride
      : null;
    if (ov && ov.target) _tgt.set(ov.target[0], ov.target[1], ov.target[2]);
    if (ov && ov.dir) _dir.set(ov.dir[0], ov.dir[1], ov.dir[2]).normalize();
    const frameFocus = ov && ov.points ? ov.points : f.focus;
    const frameH = ov && ov.h ? ov.h : f.h;

    const layout = this.layout;
    const cam = this.camera;
    const fov = cam.fov * DEG;
    const tanHalf = Math.tan(fov / 2);
    const H = Math.max(1, layout.h);
    const usable = layout.usableFor(name) || 1;

    // 初值：先按「高度装下」估一个距离
    let dist = (frameH / usable) / (2 * tanHalf);

    const focus = frameFocus;
    if (!focus || !focus.length) {
      outPos.copy(_tgt).addScaledVector(_dir, dist);
      outLook.copy(_tgt);
      return;
    }

    // 可用矩形的 NDC 边界（顶部扣掉标题条，底部扣掉实测面板遮挡）
    const ndcTop = 1 - (2 * layout.top) / H;
    const ndcBot = -1 + (2 * layout.bottomFor(name)) / H;
    const rectCy = (ndcTop + ndcBot) * 0.5;
    const availH = Math.max(0.08, (ndcTop - ndcBot) * FIT);
    const availW = 2 * FIT;

    const target = _tgt.clone();

    for (let it = 0; it < FIT_ITERS; it++) {
      cam.position.copy(target).addScaledVector(_dir, dist);
      cam.lookAt(target);
      cam.updateMatrixWorld();

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < focus.length; i++) {
        const p = focus[i];
        _pv.set(p[0], p[1], p[2]).project(cam);
        if (_pv.x < minX) minX = _pv.x;
        if (_pv.x > maxX) maxX = _pv.x;
        if (_pv.y < minY) minY = _pv.y;
        if (_pv.y > maxY) maxY = _pv.y;
      }

      const bw = Math.max(1e-3, maxX - minX);
      const bh = Math.max(1e-3, maxY - minY);

      // 竖屏「完整装下」；横屏可用区又矮又宽，纯 contain 会缩得太小，
      // 所以按屏幕宽高比把结果往 cover 方向推一点点（只允许轻微出血，不能切掉内容）
      const sw = availW / bw;
      const sh = availH / bh;
      const sContain = Math.min(sw, sh);
      const sCover = Math.max(sw, sh);
      const wide = clamp01((layout.aspect - 1.06) / 0.8);
      const s = sContain * Math.pow(sCover / sContain, wide * 0.12);

      dist /= Math.pow(Math.max(0.2, Math.min(5, s)), 0.9);

      // 再把内容中心推到可用矩形中心
      const kY = tanHalf * dist;
      const kX = kY * layout.aspect;
      _right.setFromMatrixColumn(cam.matrixWorld, 0);
      _up.setFromMatrixColumn(cam.matrixWorld, 1);
      target.addScaledVector(_right, ((minX + maxX) * 0.5) * kX);
      target.addScaledVector(_up, ((minY + maxY) * 0.5 - rectCy) * kY);
    }

    outPos.copy(target).addScaledVector(_dir, dist);
    outLook.copy(target);
  }

  /** 立刻落到某个阶段锚点（黑场遮住，不怕瞬移） */
  snap(name) {
    this.stage = name;
    this.computePos(name, this.goalPos, this.goalLook);
    this.curPos.copy(this.goalPos);
    this.curLook.copy(this.goalLook);
    this._apply();
  }

  /** 平滑切到某阶段 */
  setStage(name, smooth = MISC.cameraSmooth) {
    this.stage = name;
    this.smooth = smooth;
    this.computePos(name, this.goalPos, this.goalLook);
  }

  /**
   * 临时替换某个机位的取景框（target / points / 可选 dir）。
   * 只在本次运行有效，不动机位表 FRAMES。
   */
  setFocusOverride(name, override) {
    this.focusOverride = name ? { name, ...override } : null;
  }

  /** 阶段内轻微推镜：沿视线靠近/远离 amount 世界单位 */
  push(amount = 0.4) {
    _tmp.copy(this.goalPos).sub(this.goalLook).normalize();
    this.goalPos.addScaledVector(_tmp, -amount);
  }

  /** 让屏幕上看到某个世界点居中（选盘子、聚焦时用） */
  lookAt(target, dist = 3.2, dirArr = [0, 0.55, 0.83]) {
    _dir.set(dirArr[0], dirArr[1], dirArr[2]).normalize();
    this.goalLook.copy(target);
    this.goalPos.copy(target).addScaledVector(_dir, dist);
  }

  /** 结果页：围着目标慢慢转 */
  startOrbit(target, radius, height, speed = 0.28, startAngle = 0) {
    this.orbitBase = { target: target.clone(), radius, height };
    this.orbit = speed;
    this.orbitAngle = startAngle;
    this.smooth = 0.5;
  }

  stopOrbit() {
    this.orbit = 0;
  }

  shake(amp = 0.03, dur = 0.32) {
    this.shakeAmp = amp;
    this.shakeT = dur;
  }

  _apply() {
    this.camera.position.copy(this.curPos);
    this.camera.lookAt(this.curLook);
  }

  update(dt) {
    if (this.orbit && this.orbitBase) {
      this.orbitAngle += this.orbit * dt;
      const b = this.orbitBase;
      this.goalPos.set(
        b.target.x + Math.sin(this.orbitAngle) * b.radius,
        b.target.y + b.height,
        b.target.z + Math.cos(this.orbitAngle) * b.radius
      );
      this.goalLook.copy(b.target);
    }

    const k = 1 - Math.exp(-dt / Math.max(0.02, this.smooth));
    this.curPos.lerp(this.goalPos, k);
    this.curLook.lerp(this.goalLook, k);

    this.camera.position.copy(this.curPos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT / 0.32);
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
    this.camera.lookAt(this.curLook);
  }
}
