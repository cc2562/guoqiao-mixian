/**
 * DOM 层总控：步骤条 / 阶段面板 / 底部按钮 / toast / 黑场 / boot。
 */
import { el } from './widgets.js';
import { MISC } from '../data/config.js';

export class UIRoot {
  constructor() {
    this.stageUi = document.getElementById('stage-ui');
    this.actionsEl = document.getElementById('actions');
    this.stepsEl = document.getElementById('steps');
    this.titleEl = document.getElementById('stage-title');
    this.fadeEl = document.getElementById('fade');
    this.toastWrap = document.getElementById('toast-wrap');
    this.bootEl = document.getElementById('boot');
    this.bootBar = document.getElementById('boot-bar-fill');
    this.bootHint = document.getElementById('boot-hint');
    this.soundBtn = document.getElementById('btn-sound');
    this.skipBtn = document.getElementById('btn-skip');

    this.panels = new Map();
    this.toasts = [];
  }

  /* ---------------- boot ---------------- */
  setBootProgress(p, hint) {
    if (this.bootBar) this.bootBar.style.width = Math.round(p * 100) + '%';
    if (hint && this.bootHint) this.bootHint.textContent = hint;
  }

  hideBoot() {
    this.bootEl.classList.add('hide');
    setTimeout(() => { this.bootEl.style.display = 'none'; }, 600);
  }

  bootError(text) {
    this.bootEl.classList.add('error');
    if (this.bootHint) this.bootHint.innerHTML = text;
    const btn = document.getElementById('btn-start');
    if (btn) btn.style.display = 'none';
  }

  /* ---------------- 步骤条 ---------------- */
  buildSteps(n) {
    this.stepsEl.innerHTML = '';
    for (let i = 0; i < n; i++) this.stepsEl.appendChild(el('i'));
    this.stepCount = n;
  }

  setStep(index) {
    const kids = this.stepsEl.children;
    for (let i = 0; i < kids.length; i++) {
      kids[i].classList.toggle('on', i === index);
      kids[i].classList.toggle('done', i < index);
    }
  }

  setTitle(t) {
    this.titleEl.textContent = t;
  }

  /* ---------------- 面板 ---------------- */
  registerPanel(name, node) {
    node.classList.add('hide');
    this.stageUi.appendChild(node);
    this.panels.set(name, node);
  }

  showPanel(name) {
    for (const [k, n] of this.panels) n.classList.toggle('hide', k !== name);
  }

  hidePanels() {
    for (const [, n] of this.panels) n.classList.add('hide');
  }

  /**
   * 当前阶段面板 + 底部按钮实际压掉了屏幕下方多少像素。
   * 直接量 DOM，所以换机型、改字号、横竖屏都不用重算常量。
   */
  panelOcclusion() {
    const vh = window.innerHeight;
    let top = vh;
    for (const [, n] of this.panels) {
      if (n.classList.contains('hide')) continue;
      const b = n.getBoundingClientRect();
      if (b.height > 0 && b.top < top) top = b.top;
    }
    const act = this.actionsEl.getBoundingClientRect();
    if (act.height > 0 && act.top < top) top = act.top;
    return Math.max(0, Math.round(vh - top));
  }

  /* ---------------- 底部按钮 ---------------- */
  setActions(nodes) {
    this.actionsEl.innerHTML = '';
    for (const n of nodes) if (n) this.actionsEl.appendChild(n);
  }

  clearActions() {
    this.actionsEl.innerHTML = '';
  }

  /* ---------------- toast ---------------- */
  toast(msg, type = '', ms = MISC.toastMs) {
    const t = el('div', 'toast' + (type ? ' ' + type : ''), msg);
    this.toastWrap.appendChild(t);
    this.toasts.push(t);
    // 最多同时 3 条
    while (this.toasts.length > 3) {
      const old = this.toasts.shift();
      old.remove();
    }
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => {
        t.remove();
        const i = this.toasts.indexOf(t);
        if (i >= 0) this.toasts.splice(i, 1);
      }, 320);
    }, ms);
  }

  clearToasts() {
    for (const t of this.toasts) t.remove();
    this.toasts.length = 0;
  }

  /* ---------------- 黑场 ---------------- */
  fadeTo(v, ms = MISC.fadeMs) {
    const node = this.fadeEl;
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        node.removeEventListener('transitionend', finish);
        resolve();
      };
      node.style.pointerEvents = v > 0.5 ? 'auto' : 'none';
      node.style.transition = `opacity ${ms}ms ease`;
      // 触发 reflow，确保从当前值开始过渡
      void node.offsetWidth;
      node.style.opacity = String(v);
      node.addEventListener('transitionend', finish);
      // iOS 低电量模式下 transitionend 可能不触发，必须兜底
      setTimeout(finish, ms + 160);
    });
  }
}
