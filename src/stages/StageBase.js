import * as THREE from 'three';

/**
 * 阶段基类：统一生命周期契约。
 * build() 只在启动时调用一次（建几何/建 DOM），enter/exit 每轮复用，不 dispose。
 */
export class StageBase {
  constructor(ctx, name) {
    this.ctx = ctx;
    this.name = name;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.t = 0;
    this.active = false;
  }

  build() {}
  async enter() {
    this.group.visible = true;
    this.active = true;
    this.t = 0;
  }
  async exit() {
    this.active = false;
    this.group.visible = false;
  }
  update(dt) {
    this.t += dt;
  }
  onPointer() {}
  onResize() {}
  get score() {
    return null;
  }
}
