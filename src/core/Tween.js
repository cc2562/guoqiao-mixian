/**
 * 极简补间库：基于「每帧喂 dt」的实现，零依赖、零 GC（不创建临时对象）。
 * 用法：
 *   await tween({ dur: 300, ease: 'outCubic', update: (k) => { ... } })
 *   await delay(120)
 */
import * as THREE from 'three';

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  outBounce: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

const list = [];

/** 创建一个补间，返回 Promise（可直接 await） */
export function tween({ dur = 300, delay = 0, ease = 'outCubic', update, onDone }) {
  const fn = typeof ease === 'function' ? ease : (Ease[ease] || Ease.outCubic);
  return new Promise((resolve) => {
    list.push({
      t: -delay / 1000,
      dur: Math.max(0.0001, dur / 1000),
      fn, update, onDone, resolve,
    });
  });
}

export function delay(ms) {
  return tween({ dur: ms, ease: 'linear', update: () => {} });
}

export function tweenUpdate(dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i];
    it.t += dt;
    if (it.t < 0) continue;
    let k = it.t / it.dur;
    if (k > 1) k = 1;
    const e = it.fn(k);
    if (it.update) it.update(e, k);
    if (k >= 1) {
      list.splice(i, 1);
      if (it.onDone) it.onDone();
      it.resolve();
    }
  }
}

export function clearTweens() {
  list.length = 0;
}

/* ---------------- 常用动作 ---------------- */

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** 帧率无关的指数阻尼 */
export const damp = (cur, goal, lambda, dt) => cur + (goal - cur) * (1 - Math.exp(-lambda * dt));

const _v3 = new THREE.Vector3();

/** 沿一条二次贝塞尔弧线把物体送过去（抛物线感，权重更"抛"） */
export function flyArc(obj, to, { dur = 520, height = 0.9, spin = 1.2, onDone } = {}) {
  const from = _v3.copy(obj.position);
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  mid.y += height;
  const p0 = from.clone(), p2 = to.clone();
  const rotStart = obj.rotation.z;
  return tween({
    dur,
    ease: 'inOutQuad',
    update: (e) => {
      const it = 1 - e;
      obj.position.set(
        it * it * p0.x + 2 * it * e * mid.x + e * e * p2.x,
        it * it * p0.y + 2 * it * e * mid.y + e * e * p2.y,
        it * it * p0.z + 2 * it * e * mid.z + e * e * p2.z
      );
      obj.rotation.z = rotStart - spin * Math.sin(e * Math.PI);
    },
    onDone,
  });
}

/** 卡通弹性缩放（落定/盖章/选中） */
export function popScale(obj, to = 1, dur = 380, from = null) {
  const s0 = from == null ? obj.scale.x : from;
  return tween({
    dur, ease: 'outElastic',
    update: (e) => {
      const s = lerp(s0, to, e);
      obj.scale.setScalar(s);
    },
  });
}

/** 通用「心跳」：y 轴上下来回，用于待机呼吸 */
export function breathe(obj, amp = 0.012, speed = 1.6, phase = 0) {
  const y0 = obj.position.y;
  return (t) => {
    obj.position.y = y0 + Math.sin(t * speed + phase) * amp;
  };
}
