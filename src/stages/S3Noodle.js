/**
 * S3 · 煮米线 + 挑米线碗
 * 米线入锅 → 往复指针定格（烫得刚刚好）→ 从四只碗里挑一只装米线。
 */
import * as THREE from 'three';
import { StageBase } from './StageBase.js';
import { createPot } from '../props/Pot.js';
import { createNoodleBundle, createNoodleNest } from '../props/Noodles.js';
import { createBowl } from '../props/Bowl.js';
import { BOWLS } from '../data/recipes.js';
import { NOODLE } from '../data/config.js';
import { noodlePoints, platePoints } from '../data/scoring.js';
import { panel, button, metaText, timingBar } from '../ui/widgets.js';
import { tween, delay } from '../core/Tween.js';

/** 2×2 摆位：四只碗并排会糊成一条，两行两列每只都够大 */
const BOWL_POS = [
  [-0.70, 0.70], [0.70, 0.70],
  [-0.70, -0.70], [0.70, -0.70],
];
const CANDIDATE_SCALE = 0.82;

export class S3Noodle extends StageBase {
  constructor(ctx) {
    super(ctx, 's3');
    this.title = '煮米线 · 选碗';
  }

  build() {
    this.pot = createPot();
    this.group.add(this.pot.group);

    // 米线：干的一束（下锅用） + 捞出来的一窝（装碗用）
    this.noodles = createNoodleBundle().mesh;
    this.noodles.visible = false;
    this.group.add(this.noodles);

    this.nest = createNoodleNest().mesh;
    this.nest.visible = false;
    this.group.add(this.nest);

    // 四只候选碗（米线碗是空碗，不放汤）
    this.bowls = BOWLS.map((meta, i) => {
      const b = createBowl(meta);
      b.setSoupLevel(0);
      b.setRichness(0);
      b.group.position.set(BOWL_POS[i][0], 0.002, BOWL_POS[i][1]);
      b.group.scale.setScalar(CANDIDATE_SCALE);
      b.group.visible = false;
      this.group.add(b.group);
      return b;
    });

    this._buildPanel();
  }

  _buildPanel() {
    const ui = this.ctx.ui;
    const p = document.createElement('div');
    p.className = 'panel';

    this.hint = metaText('水开了，下米线');
    p.appendChild(this.hint);

    this.timing = timingBar();
    this.timing.setZone(NOODLE.sweetCenter, NOODLE.sweetHalf);
    p.appendChild(this.timing.root);

    const labels = document.createElement('div');
    labels.className = 'timing-labels';
    labels.appendChild(document.createTextNode('偏硬'));
    labels.appendChild(document.createTextNode('刚好'));
    labels.appendChild(document.createTextNode('偏烂'));
    p.appendChild(labels);

    this.panel = p;
    ui.registerPanel('s3', p);
  }

  reset() {
    this.phase = 'drop';
    this.needlePos = 0;
    this.phaseT = 0;
    this.frozen = false;
    this.chosen = -1;
    this.noodleValue = 0;
    this.steamAcc = 0;
    this.bubbleAcc = 0;
    this.pot.reset();
    this.pot.group.visible = true;
    this.noodles.visible = false;
    this.noodles.position.set(0, 1.1, 0);
    this.noodles.rotation.set(0, 0, 0);
    this.nest.visible = false;
    this.nest.position.set(0, 0.9, 0);
    this.nest.rotation.set(0, 0, 0);
    this.nest.scale.setScalar(1);
    this.pot.group.position.set(0, 0, 0);
    this.pot.group.scale.setScalar(1);
    for (const b of this.bowls) {
      b.group.visible = false;
      b.group.scale.setScalar(CANDIDATE_SCALE);
      b.setHighlight(false);
    }
    this.hint.innerHTML = '水开了，下米线';
    this.timing.root.style.opacity = '0.35';
    this.timing.setNeedle(0);
  }

  async enter() {
    this.reset();
    this.group.visible = true;
    this.active = true;

    const ui = this.ctx.ui;
    const audio = this.ctx.audio;

    this.btnPull = button({
      label: '捞起',
      cls: 'primary big',
      onClick: () => this.pull(),
    });
    ui.setActions([this.btnPull]);
    ui.toast('指针走到绿色区间就捞', '', 2200);

    this.pot.setHeat(0.85);
    this.pot.setSoup(0.55, 0);
    audio.startBoil();
    audio.setBoil(1);

    this.noodles.visible = true;
    const from = new THREE.Vector3(0, 1.15, 0.1);
    const to = new THREE.Vector3(0, 0.7, 0);
    this.noodles.position.copy(from);
    await tween({
      dur: 560,
      ease: 'inQuad',
      update: (e) => {
        this.noodles.position.lerpVectors(from, to, e);
        this.noodles.rotation.z = e * 0.4;
      },
    });
    const surface = this.pot.getSurfaceCenter().clone();
    this.ctx.fx.splash(surface, 14);
    this.pot.addRipple(surface, 1.6);
    audio.splash();

    this.noodles.visible = false;
    this.timing.root.style.opacity = '1';
    this.hint.innerHTML = '指针到<b>最佳</b>时点「捞起」，米线最弹';
    this.phase = 'timing';
  }

  /* ---------------- 捞起 ---------------- */

  pull() {
    if (this.phase !== 'timing' || this.frozen) return;
    this.frozen = true;

    const p = this.needlePos;
    this.noodleValue = noodlePoints(p);
    this.ctx.score.noodle.pos = p;
    this.ctx.score.noodle.value = this.noodleValue;

    this.ctx.audio.tap();

    const ratio = this.noodleValue / 15;
    if (ratio > 0.82) this.ctx.ui.toast('弹牙！这口米线刚好', 'good');
    else if (ratio > 0.5) this.ctx.ui.toast('还行，稍微差一点点', '', 1300);
    else this.ctx.ui.toast(p < NOODLE.sweetCenter ? '有点硬，再多烫一会' : '烫过了，有点软', 'warn');

    this.btnPull.disabled = true;
    this.btnPull.textContent = '捞出来了';
    this._showBowls();
  }

  async _showBowls() {
    this.phase = 'bowl';
    this.hint.innerHTML = '挑一只碗装米线';

    const audio = this.ctx.audio;
    const surface = this.pot.getSurfaceCenter().clone();

    // 米线出锅：干束换成一窝软堆
    this.ctx.fx.splash(surface, 8);
    audio.splash();
    this.nest.visible = true;
    this.nest.position.copy(surface);
    this.nest.position.y = surface.y + 0.02;
    this.nest.scale.setScalar(0.7);
    tween({
      dur: 420,
      ease: 'outBack',
      update: (e) => { this.nest.scale.setScalar(0.7 + 0.3 * e); },
    });

    // 锅让位
    tween({
      dur: 420,
      ease: 'inOutCubic',
      onDone: () => { this.pot.group.visible = false; },
      update: (e) => {
        this.pot.group.position.z = -0.62 * e;
        this.pot.group.position.y = -0.55 * e;
        this.pot.group.scale.setScalar(1 - 0.22 * e);
      },
    });

    this.ctx.cine.setStage('s3b', 0.34);

    for (let i = 0; i < this.bowls.length; i++) {
      const b = this.bowls[i];
      b.group.visible = true;
      b.group.position.y = -0.5;
      tween({
        dur: 440,
        delay: i * 66,
        ease: 'outBack',
        update: (e) => { b.group.position.y = -0.5 + 0.5 * e; },
      });
      setTimeout(() => audio.tap(), i * 66);
    }

    // 米线窝挪到中间上方，等玩家挑碗
    tween({
      dur: 560,
      delay: 120,
      ease: 'inOutCubic',
      update: (e) => {
        this.nest.position.x = 0;
        this.nest.position.z = surface.z * (1 - e) + 0.04 * e;
        this.nest.position.y = surface.y + 0.02 + (0.72 - surface.y) * e;
        this.nest.rotation.y = e * 0.9;
        this.nest.scale.setScalar(1 - 0.08 * e);
      },
    });

    this.ctx.ui.setActions([]);
    this.ctx.ui.toast('点一只碗就能装', '', 1600);
  }

  onPointer(p) {
    if (p.phase !== 'end' || this.phase !== 'bowl' || this.chosen >= 0) return;
    if (p.dist > 16) return;

    const candidates = this.bowls.map((b, i) => ({
      pos: b.group.position.clone().setY(0.3),
      radius: 78,
      key: i,
    }));
    const hit = this.ctx.input.pickScreen(candidates, p.x, p.y);
    if (hit) this.chooseBowl(hit.key);
  }

  async chooseBowl(i) {
    if (this.chosen >= 0) return;
    this.chosen = i;
    this.phase = 'done';

    const b = this.bowls[i];
    const ctx = this.ctx;
    const audio = ctx.audio;

    b.setHighlight(true);
    b.pop();
    audio.pick();

    ctx.score.plate.bowlId = b.meta.id;
    ctx.save.noodleBowlId = b.meta.id;

    // 相机推近：按「这口碗要占满可用高度带」反算距离
    const L = ctx.layout;
    const tanHalf = Math.tan((ctx.cine.camera.fov * Math.PI) / 360);
    const usable = L.usableFor('s3') || 1;
    const want = 1.5;
    const dist = Math.max(
      want / (usable * 2 * tanHalf),
      (want / L.aspect) / (2 * tanHalf)
    );
    const visH = 2 * dist * tanHalf;
    const bandMid = (L.top + (L.h - L.bottomFor('s3'))) / 2;
    const dy = ((L.h / 2 - bandMid) / L.h) * visH;
    ctx.cine.lookAt(
      new THREE.Vector3(b.group.position.x, 0.26 - dy, b.group.position.z),
      dist,
      [0, 0.62, 0.79]
    );

    // 其他碗下沉隐藏
    for (let k = 0; k < this.bowls.length; k++) {
      if (k === i) continue;
      const other = this.bowls[k];
      tween({
        dur: 260,
        update: (e) => { other.group.position.y = -0.4 * e; },
        onDone: () => { other.group.visible = false; },
      });
    }

    // 选中的碗放大回原尺寸
    const s0 = b.group.scale.x;
    tween({
      dur: 360,
      ease: 'outBack',
      update: (e) => { b.group.scale.setScalar(s0 + (1 - s0) * e); },
    });

    // 米线落进碗里
    // 注意碗是窄底：y≈0.12 处内壁半径只有 ~0.45，所以落碗后要收到 0.76，
    // 否则堆的外圈会穿过碗壁（看起来像米线插进瓷里）
    const from = this.nest.position.clone();
    const to = new THREE.Vector3(
      b.group.position.x,
      0.125,
      b.group.position.z
    );
    await tween({
      dur: 560,
      ease: 'inOutQuad',
      update: (e) => {
        this.nest.position.lerpVectors(from, to, e);
        this.nest.rotation.y = 0.9 + e * 0.7;
        this.nest.scale.setScalar(0.92 - 0.16 * e);
      },
    });
    audio.place();
    ctx.fx.sparkle(to.clone().setY(to.y + 0.1), 10);

    ctx.ui.toast(`米线装进${b.meta.name}`, 'good', 1400);

    const btn = button({
      label: '去装盘',
      cls: 'primary',
      onClick: () => this.finish(),
    });
    btn.classList.add('ready');
    ctx.ui.setActions([btn]);
  }

  finish() {
    this.ctx.audio.success();
    this.ctx.next();
  }

  update(dt) {
    super.update(dt);
    const fx = this.ctx.fx;

    if (this.phase === 'timing' || this.phase === 'drop') {
      this.pot.update(dt);
      const surface = this.pot.getSurfaceCenter().clone();
      this.steamAcc += dt * 4;
      while (this.steamAcc > 0.1) {
        this.steamAcc -= 0.1;
        fx.steam(surface, 1);
      }
      this.bubbleAcc += dt * 16;
      while (this.bubbleAcc > 1) {
        this.bubbleAcc -= 1;
        fx.bubble(surface, 1, 0.6);
      }
    }

    if (this.phase === 'timing' && !this.frozen) {
      this.phaseT += dt / NOODLE.period;
      const t = this.phaseT % 1;
      this.needlePos = t < 0.5 ? t * 2 : 2 - t * 2;
      this.timing.setNeedle(this.needlePos);
    }
  }
}
