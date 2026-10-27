/**
 * 布局：屏幕尺寸、安全区、可用高度比例。
 * 相机取景只需要 layout.aspect 与 layout.usable 两个数。
 */
import { LAYOUT } from '../data/config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** 用一个隐藏探针读出 env(safe-area-inset-*) 的真实像素值 */
function probeSafeArea() {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);' +
    'padding-left:env(safe-area-inset-left,0px);' +
    'padding-right:env(safe-area-inset-right,0px);';
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const out = {
    top: parseFloat(cs.paddingTop) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
    right: parseFloat(cs.paddingRight) || 0,
  };
  el.remove();
  return out;
}

export class Layout {
  constructor() {
    this.w = 1;
    this.h = 1;
    this.aspect = 1;
    this.portrait = true;
    this.top = 0;
    this.bottom = 0;
    this.usable = 1;
    this.safe = { top: 0, bottom: 0, left: 0, right: 0 };
    this.changed = true;
    /** 每个阶段实测的底部遮挡高度（px），键为阶段名 */
    this.obstr = {};
    this._usableCache = {};
  }

  measure() {
    const vv = window.visualViewport;
    const w = Math.round(vv ? vv.width : window.innerWidth);
    const h = Math.round(vv ? vv.height : window.innerHeight);
    const prevAspect = this.aspect;
    const prevH = this.h;

    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.aspect = this.w / this.h;
    this.portrait = this.aspect < 0.95;

    this.safe = probeSafeArea();

    // 兜底 --vh（iOS 地址栏）
    document.documentElement.style.setProperty('--vh', this.h + 'px');

    const conf = this.portrait ? LAYOUT.portrait : LAYOUT.landscape;
    this.top = conf.top + this.safe.top;
    this.bottom = conf.bottom + this.safe.bottom;
    this.usable = clamp(1 - (this.top + this.bottom) / this.h, 0.34, 1);
    this._usableCache = {};

    this.changed =
      Math.abs(prevAspect - this.aspect) > 0.004 || Math.abs(prevH - this.h) > 24;
    return this;
  }

  /** 记录某阶段实测的底部遮挡（px，含安全区） */
  setObstruction(stage, px) {
    if (!(px > 0)) return;
    const v = Math.max(0, px) + this.safe.bottom;
    if (Math.abs((this.obstr[stage] || 0) - v) < 2) return;
    this.obstr[stage] = v;
    this._usableCache = {};
  }

  /** 某阶段底部被 UI 压掉的像素（含安全区） */
  bottomFor(stage) {
    if (!stage) return this.bottom;
    let key = stage;
    let v = this.obstr[key];
    while (v == null && /[a-z]$/.test(key) && key.length > 2) {
      key = key.slice(0, -1);
      v = this.obstr[key];
    }
    return v == null ? this.bottom : v;
  }

  /** 某阶段真正可用的画面高度比。 */
  usableFor(stage) {
    if (stage && this._usableCache[stage] != null) return this._usableCache[stage];
    const bottom = this.bottomFor(stage);
    const u = clamp(1 - (this.top + bottom) / this.h, 0.30, 1);
    if (stage) this._usableCache[stage] = u;
    return u;
  }

  /** 横竖屏切换（而不是地址栏抖动）才算真正的旋转 */
  orientationChanged(prev) {
    return prev && prev.portrait !== this.portrait;
  }
}
