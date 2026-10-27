/**
 * 阶段状态机：黑场转场 + 输入闸门。
 * 转场期间吞掉一切输入，避免"翻页时乱点"。
 */
import { MISC } from '../data/config.js';

export class StageMachine {
  constructor({ stages, order, ctx, ui, cine, input }) {
    this.stages = stages;
    this.order = order;
    this.ctx = ctx;
    this.ui = ui;
    this.cine = cine;
    this.input = input;
    this.current = null;
    this.name = null;
    this.busy = false;
    this.t = 0;
  }

  indexOf(name) {
    return this.order.indexOf(name);
  }

  nextName() {
    const i = this.indexOf(this.name);
    return this.order[Math.min(this.order.length - 1, i + 1)];
  }

  async go(name, params = {}) {
    if (this.busy || !this.stages[name]) return;
    this.busy = true;
    this.input.setEnabled(false);
    this.ui.hidePanels();
    this.ui.clearActions();
    this.ui.clearToasts();

    await this.ui.fadeTo(1, MISC.fadeMs);

    if (this.current) {
      this.current.group.visible = false;
      await this.current.exit();
    }

    this.ctx.audio.stopBoil();

    this.current = this.stages[name];
    this.name = name;
    this.cine.snap(name);           // 黑场遮住相机瞬移
    this.ui.setStep(this.indexOf(name));
    this.ui.setTitle(this.current.title || '');

    // 入场动画不再挡住黑场：先起播，淡入同时进行
    const entered = this.current.enter({ ...this.ctx.save, ...params });

    this.ui.showPanel(name);
    // 面板已经可见，量出它真实压掉的高度，重新取景（仍在黑场里，看不出来）
    this.ctx.layout.setObstruction(name, this.ui.panelOcclusion());
    this.cine.snap(name);

    await this.ui.fadeTo(0, MISC.stageInMs);

    this.input.setEnabled(true);
    this.busy = false;
    await entered;
  }

  update(dt) {
    this.t += dt;
    if (!this.busy && this.current) this.current.update(dt, this.t);
  }

  pointer(p) {
    if (!this.busy && this.current) this.current.onPointer(p);
  }

  resize(layout) {
    if (this.current) this.current.onResize(layout);
  }
}
