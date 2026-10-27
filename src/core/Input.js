/**
 * 触屏/鼠标输入的唯一入口。
 * - 只跟踪第一根手指（多指全忽略），避免切菜时轨迹被第二根手指污染
 * - getCoalescedEvents() 取回同帧内的所有采样点（高刷屏切菜才顺滑）
 * - 手势分类：tap / swipe / drag / hold
 * - 屏蔽屏幕左右 18px（iOS 边缘返回手势区）
 */
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ray = new THREE.Raycaster();

export class Input {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.enabled = true;
    this.handlers = { down: null, move: null, up: null };
    this.p = null;
    this.activeId = -1;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.edgeGuard = 18;
    this._bind();
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
  }

  on(type, fn) {
    this.handlers[type] = fn;
    return this;
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) this.p = null;
  }

  _local(e) {
    return { x: e.clientX, y: e.clientY };
  }

  _bind() {
    const el = this.canvas;
    el.style.touchAction = 'none';

    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (this.activeId !== -1) return;
      // iOS 左右边缘是系统返回手势区，直接忽略
      if (e.clientX < this.edgeGuard || e.clientX > this.w - this.edgeGuard) return;

      this.activeId = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* 某些浏览器不支持 */ }

      const now = performance.now();
      this.p = {
        id: e.pointerId,
        pointerType: e.pointerType || 'mouse',
        x0: e.clientX, y0: e.clientY,
        x: e.clientX, y: e.clientY,
        nx: (e.clientX / this.w) * 2 - 1,
        ny: -((e.clientY / this.h) * 2 - 1),
        t0: now,
        path: [[e.clientX, e.clientY, now]],
        moved: false,
      };
      this._emit('down', this._snapshot('down'));
    }, { passive: true });

    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.activeId || !this.p) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      if (!evs.length) {
        evs.push(e);
      }
      for (let i = 0; i < evs.length; i++) {
        this._push(evs[i].clientX, evs[i].clientY);
      }
      this._emit('move', this._snapshot('move'));
    }, { passive: true });

    const end = (e, kind) => {
      if (e.pointerId !== this.activeId || !this.p) return;
      this._push(e.clientX, e.clientY);
      const g = this._snapshot(kind);
      this.activeId = -1;
      this.p = null;
      this._emit('up', g);
    };

    el.addEventListener('pointerup', (e) => end(e, 'up'), { passive: true });
    el.addEventListener('pointercancel', (e) => end(e, 'cancel'), { passive: true });
    // 触摸设备上 pointercancel 之后可能不再有 up，兜底
    el.addEventListener('lostpointercapture', (e) => {
      if (this.p && e.pointerId === this.activeId) end(e, 'cancel');
    }, { passive: true });

    // iOS 双指缩放
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  }

  _push(x, y) {
    const p = this.p;
    if (!p) return;
    const last = p.path[p.path.length - 1];
    const dx = x - last[0], dy = y - last[1];
    if (dx * dx + dy * dy < 4) return;   // 2px 内的抖动不要
    p.path.push([x, y, performance.now()]);
    p.x = x; p.y = y;
    p.nx = (x / this.w) * 2 - 1;
    p.ny = -((y / this.h) * 2 - 1);
    p.moved = true;
  }

  _snapshot(type) {
    const p = this.p;
    if (!p) return null;
    const dx = p.x - p.x0, dy = p.y - p.y0;
    const dist = Math.hypot(dx, dy);
    let len = 0;
    for (let i = 1; i < p.path.length; i++) {
      len += Math.hypot(p.path[i][0] - p.path[i - 1][0], p.path[i][1] - p.path[i - 1][1]);
    }
    const dur = performance.now() - p.t0;
    let kind = type;
    if (type === 'up') {
      if (dur > 700 && dist < 12) kind = 'hold';
      else if (dist < 12 && len < 20) kind = 'tap';
      else if (dur < 340 && len > 90) kind = 'swipe';
      else kind = 'drag';
    }
    return {
      /** 生命周期阶段，永远是 down / move / end 三选一 —— 阶段逻辑只该看这个 */
      phase: type === 'up' || type === 'cancel' ? 'end' : type,
      /** 手势语义（tap / swipe / drag / hold），只用于给反馈分级 */
      type: kind,
      pointerType: p.pointerType,
      x: p.x, y: p.y, x0: p.x0, y0: p.y0,
      nx: p.nx, ny: p.ny,
      dx, dy, dist, dur, len,
      path: p.path,
      pointerId: p.id,
    };
  }

  _emit(type, payload) {
    const fn = this.handlers[type];
    if (fn && payload) fn(payload);
  }

  /* ---------------- 命中 / 投影工具 ---------------- */

  /** 世界坐标 → 屏幕像素（可见性判定） */
  project(v3) {
    _v.copy(v3).project(this.camera);
    return {
      x: (_v.x * 0.5 + 0.5) * this.w,
      y: (-_v.y * 0.5 + 0.5) * this.h,
      visible: _v.z < 1,
    };
  }

  /**
   * 屏幕空间半径命中：比隐形代理 mesh 更稳、更省，且命中区可以给得比视觉更大。
   * candidates: [{ pos: Vector3, radius: px, key, data }]
   */
  pickScreen(candidates, x, y) {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (c.enabled === false) continue;
      const s = this.project(c.pos);
      if (!s.visible) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < c.radius && d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  /** 屏幕点 → 水平面（y = planeY）上的世界坐标；无交点返回 null */
  toPlane(x, y, planeY = 0, out = new THREE.Vector3()) {
    const ndc = _v.set((x / this.w) * 2 - 1, -((y / this.h) * 2 - 1), 0.5);
    _ray.setFromCamera(ndc, this.camera);
    _plane.constant = -planeY;
    const hit = _ray.ray.intersectPlane(_plane, out);
    return hit || null;
  }
}
