/**
 * S1 · 炖鸡汤
 * 自由调节火力 + 自由添加调味料，进度条由「火力 × 时间」累加。
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { StageBase } from './StageBase.js';
import { createPot } from '../props/Pot.js';
import { createSeasoning } from '../props/Seasoning.js';
import { BROTH, SEASONINGS } from '../data/config.js';
import { heatPoints, seasonPoints } from '../data/scoring.js';
import { panel, row, label, chip, slider, barRow, button, metaText } from '../ui/widgets.js';
import { tween, flyArc } from '../core/Tween.js';
import { toon } from '../render/Toon.js';

const TITLES = ['清水', '微温', '起泡', '翻滚', '浓汤'];

export class S1Broth extends StageBase {
  constructor(ctx) {
    super(ctx, 's1');
    this.title = '炖鸡汤';
  }

  build() {
    // 锅
    this.pot = createPot();
    this.group.add(this.pot.group);

    // 调味罐（摆在锅前面）
    this.seasoning = createSeasoning();
    this.seasoning.group.position.set(0, 0, 1.02);
    this.group.add(this.seasoning.group);

    // 鸡块
    this.chicken = new THREE.Mesh(
      new RoundedBoxGeometry(0.32, 0.24, 0.28, 3, 0.075),
      toon(0xf2ddb6)
    );
    this.chicken.visible = false;
    this.group.add(this.chicken);

    this.dropGeo = new THREE.SphereGeometry(0.018, 8, 6);
    this._buildPanel();
  }

  _buildPanel() {
    const ui = this.ctx.ui;
    const p = document.createElement('div');
    p.className = 'panel';

    this.stateText = metaText('汤底 <b>清水</b>');
    this.heatText = metaText('火力 <b>60</b>');
    p.appendChild(row(this.stateText, this.heatText));

    this.slider = slider({
      min: 0, max: 100, value: 60,
      onInput: (v) => {
        this.heat = v;
        this.heatText.innerHTML = `火力 <b>${v}</b>`;
      },
    });
    p.appendChild(this.slider);

    p.appendChild(label('自由调味 · 想加几次加几次'));
    const chips = document.createElement('div');
    chips.className = 'chips';
    this.chips = SEASONINGS.map((s, i) => {
      const c = chip({
        label: s.name,
        dot: s.dot,
        onClick: () => this.addSeasoning(i),
      });
      chips.appendChild(c);
      return c;
    });
    p.appendChild(chips);

    this.progress = barRow();
    p.appendChild(this.progress.root);

    this.panel = p;
    ui.registerPanel('s1', p);

    // 底部按钮
    this.btnDone = button({ label: '熬好了，去配菜', cls: 'primary', onClick: () => this.finish() });
    this.btnDilute = button({
      label: '加水稀释',
      cls: 'secondary',
      onClick: () => this.dilute(),
    });
    this.btnDilute.classList.add('hide');
  }

  reset() {
    this.heat = 60;
    this.cook = 0;
    this.inBand = 0;
    this.activeTime = 0;
    this.cloudy = 0;
    this.dilutions = 0;
    this.counts = {};
    this.started = false;
    this.done = false;
    this.busy = false;
    this.ready = false;
    this.steamAcc = 0;
    this.bubbleAcc = 0;

    this.pot.reset();
    this.seasoning.reset();
    this.chicken.visible = false;

    this.slider.input.value = 60;
    this.heatText.innerHTML = '火力 <b>60</b>';
    this.stateText.innerHTML = '汤底 <b>清水</b>';
    this.progress.set(0);
    for (const c of this.chips) c.setCount(0);
    this.btnDilute.classList.add('hide');
    this.btnDone.textContent = '熬好了，去配菜';
    this.btnDone.disabled = false;
    this.btnDone.classList.remove('ready');
  }

  async enter() {
    this.reset();
    this.group.visible = true;
    this.active = true;

    const ui = this.ctx.ui;
    const to = this.pot.getSurfaceCenter().clone();

    // 按钮和提示先就位，动画再慢慢放
    ui.setActions([this.btnDilute, this.btnDone]);
    ui.toast('拨动火力，点调味罐，想加多少加多少', '', 2600);

    // 一开始就允许调味：鸡块下锅只是动画，不能因此让早点的第一下失效
    this.started = true;
    this.ctx.audio.startBoil();
    this.pot.setHeat(this.heat / 100);

    // 鸡块下锅
    this.chicken.visible = true;
    this.chicken.position.set(0.02, 1.02, 0.03);
    this.chicken.rotation.set(0.2, 0.4, 0.1);
    await tween({
      dur: 620,
      ease: 'inQuad',
      update: (e) => {
        this.chicken.position.y = 1.02 - e * 0.52;
        this.chicken.rotation.z = 0.1 + e * 0.5;
      },
    });
    this.chicken.visible = false;
    this.ctx.fx.splash(to, 12);
    this.ctx.audio.splash();
    this.pot.addRipple(to, 1.4);
  }

  /* ---------------- 交互 ---------------- */

  addSeasoning(i) {
    if (!this.started || this.done) return;
    const meta = SEASONINGS[i];
    const ui = this.ctx.ui;
    const audio = this.ctx.audio;
    const fx = this.ctx.fx;

    const key = meta.id;
    this.counts[key] = (this.counts[key] || 0) + 1;
    this.chips[i].setCount(this.counts[key]);
    this.seasoning.bounce(i);
    audio.sprinkle();

    // 颗粒飞行
    const from = this.seasoning.jarWorld(i).clone();
    from.y += 0.28;
    const to = this.pot.getSurfaceCenter().clone();

    const n = 3;
    for (let k = 0; k < n; k++) {
      const dot = new THREE.Mesh(this.dropGeo, toon(meta.dot));
      dot.position.copy(from);
      dot.position.x += (Math.random() - 0.5) * 0.08;
      dot.position.z += (Math.random() - 0.5) * 0.08;
      this.group.add(dot);
      const target = to.clone();
      target.x += (Math.random() - 0.5) * 0.22;
      target.z += (Math.random() - 0.5) * 0.22;

      tween({ dur: 320, delay: k * 40, ease: 'linear', update: () => {} }).then(() => {});
      flyArc(dot, target, {
        dur: 380 + k * 30,
        height: 0.42,
        spin: 1.4,
        onDone: () => {
          this.group.remove(dot);
          this.pot.addRipple(target, 0.8);
          fx.splash(target, 3);
          if (k === n - 1) audio.splash();
        },
      });
    }

    // 盐过量
    if (key === 'salt' && this.counts.salt > BROTH.overSalt) {
      this.cloudy = Math.min(1, this.cloudy + 0.4);
      ui.toast('有点咸了…加点水吧', 'warn');
      this.btnDilute.classList.remove('hide');
    }

    if (this.counts.salt === BROTH.idealSalt) {
      ui.toast('咸淡正好', 'good', 1000);
    }
  }

  dilute() {
    if (this.dilutions >= 3) return;
    this.dilutions++;
    this.cloudy = Math.max(0, this.cloudy - 0.45);
    this.ctx.audio.splash();
    const to = this.pot.getSurfaceCenter().clone();
    this.pot.addRipple(to, 1.6);
    this.ctx.fx.splash(to, 10);
    this.ctx.ui.toast('加了点热水，汤清回来了', 'good');
    if (this.cloudy <= 0.05) this.btnDilute.classList.add('hide');
  }

  finish() {
    if (this.busy || this.done) return;
    this.busy = true;
    this.done = true;

    const ctx = this.ctx;
    const total = Math.max(0.5, this.activeTime);
    let heat = heatPoints(this.inBand, total) * Math.min(1, this.cook);
    heat = Math.max(0, heat - this.dilutions * 1.2);

    const sp = seasonPoints(this.counts);

    ctx.score.heat.value = heat;
    ctx.score.heat.inBand = this.inBand;
    ctx.score.heat.total = total;
    ctx.score.season.value = Math.max(0, sp.value - this.dilutions);
    ctx.score.season.counts = { ...this.counts };
    ctx.score.season.salt = sp.salt;
    ctx.score.season.kinds = sp.kinds;

    ctx.audio.success();
    this.btnDone.classList.remove('ready');
    ctx.next();
  }

  /* ---------------- 每帧 ---------------- */

  update(dt) {
    super.update(dt);
    this.seasoning.update(dt);

    if (!this.started || this.done) {
      this.pot.update(dt);
      return;
    }

    const heat = this.heat;
    const audio = this.ctx.audio;
    const fx = this.ctx.fx;

    this.activeTime += dt;

    // 进度
    const rate = (BROTH.rateBase + (heat / 100) * BROTH.rateHeat) / BROTH.cookSeconds;
    this.cook = Math.min(1.4, this.cook + rate * dt);

    // 黄金火候带
    const [lo, hi] = BROTH.band;
    if (heat >= lo && heat <= hi) this.inBand += dt;
    else if (heat >= lo - BROTH.nearBand && heat <= hi + BROTH.nearBand) {
      this.inBand += dt * BROTH.nearFactor;
    }

    // 视觉
    this.pot.setHeat(heat / 100);
    this.pot.setSoup(Math.min(1, this.cook), this.cloudy);
    audio.setBoil(0.3 + (heat / 100) * 0.9);

    const surface = this.pot.getSurfaceCenter().clone();

    // 蒸汽
    this.steamAcc += dt * (0.7 + (heat / 100) * 2.0);
    while (this.steamAcc > 0.16) {
      this.steamAcc -= 0.16;
      fx.steam(surface, 1);
    }

    // 气泡
    if (heat > 35) {
      this.bubbleAcc += dt * ((heat - 35) / 65) * 14;
      while (this.bubbleAcc > 1) {
        this.bubbleAcc -= 1;
        fx.bubble(surface, 1, 0.62);
      }
    }

    this.pot.update(dt);

    // UI
    const prog = Math.min(1, this.cook);
    this.progress.set(prog);
    const stage = Math.min(4, Math.floor(prog * 5));
    this.stateText.innerHTML = `汤底 <b>${TITLES[stage]}</b>`;

    if (prog >= 1 && !this.ready) {
      this.ready = true;
      this.btnDone.classList.add('ready');
      this.ctx.ui.toast('汤滚了，金黄透亮', 'good', 1400);
      this.ctx.audio.ding(2);
    }
  }
}
