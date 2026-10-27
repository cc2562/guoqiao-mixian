/**
 * S2 · 切菜与配菜
 * 14 种配菜全开、想加几样加几样；每一刀都是真实的多边形裁剪。
 *
 * 手感约定：一次按下 → 抬起 = 一刀。
 *   · 按下开始记录轨迹，轨迹本身就是刀（没有实体菜刀）
 *   · 抬手时取「起点 → 轨迹最远点」作为这一刀的切线，只切一刀
 *   · 轨迹显示成两端收细的刀光带，松手后被拉直成真正切的那条线再闪掉
 */
import * as THREE from 'three';
import { StageBase } from './StageBase.js';
import { createBoard, BOARD_TOP } from '../props/Board.js';
import { createPiece, iconFor } from '../props/ingredients/index.js';
import { INGREDIENTS, ING_MAP } from '../data/recipes.js';
import { CUT } from '../data/config.js';
import { cutQuality, cutPoints } from '../data/scoring.js';
import { panel, button, metaText, card } from '../ui/widgets.js';
import { clamp01 } from '../core/Tween.js';
import { softDotTexture } from '../render/Toon.js';

const BLADE_MAX = 96;
const FLASH_MS = 0.24;

export class S2Cut extends StageBase {
  constructor(ctx) {
    super(ctx, 's2');
    this.title = '切菜配菜';
  }

  build() {
    this.board = createBoard();
    this.group.add(this.board.group);
    this.boardCenter = new THREE.Vector3(0, BOARD_TOP, 0);
    this.minLenWorld = CUT.minLenWorld;

    this._buildBlade();

    this.slicers = new Map();
    this._buildPanel();
  }

  /* ---------------- 刀光 ---------------- */

  _buildBlade() {
    const n = BLADE_MAX;
    this.bladePos = new Float32Array(n * 2 * 3);

    const idx = new Uint16Array((n - 1) * 6);
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx[i * 6 + 0] = a;
      idx[i * 6 + 1] = a + 1;
      idx[i * 6 + 2] = a + 2;
      idx[i * 6 + 3] = a + 1;
      idx[i * 6 + 4] = a + 3;
      idx[i * 6 + 5] = a + 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.bladePos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setDrawRange(0, 0);
    this.bladeGeo = geo;

    this.bladeMat = new THREE.MeshBasicMaterial({
      color: 0xffe9a6,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this.blade = new THREE.Mesh(geo, this.bladeMat);
    this.blade.frustumCulled = false;
    this.blade.renderOrder = 9;
    this.blade.visible = false;
    this.group.add(this.blade);

    // 刀光核心：一条极亮的中线，让刀锋有「锐」的感觉
    const coreGeo = new THREE.BufferGeometry();
    coreGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BLADE_MAX * 3), 3));
    coreGeo.setDrawRange(0, 0);
    this.coreGeo = coreGeo;
    this.core = new THREE.Line(
      coreGeo,
      new THREE.LineBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.9,
        depthWrite: false, depthTest: false,
      })
    );
    this.core.frustumCulled = false;
    this.core.renderOrder = 10;
    this.core.visible = false;
    this.group.add(this.core);

    // 指尖光点：手指在哪，刀就在哪
    this.tip = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 0.15),
      new THREE.MeshBasicMaterial({
        map: softDotTexture(),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      })
    );
    this.tip.rotation.x = -Math.PI / 2;
    this.tip.renderOrder = 11;
    this.tip.visible = false;
    this.group.add(this.tip);
  }

  /** 沿轨迹生成一条两端收细的刀光带 */
  _setBlade(pts, opacity = 0.62) {
    const n = Math.min(pts.length, BLADE_MAX);
    if (n < 2) {
      this.bladeGeo.setDrawRange(0, 0);
      this.coreGeo.setDrawRange(0, 0);
      return;
    }

    let total = 0;
    for (let i = 1; i < n; i++) total += pts[i].distanceTo(pts[i - 1]);
    const halfW = Math.min(0.055, 0.012 + total * 0.055);
    const y = BOARD_TOP + 0.13;

    const corePos = this.coreGeo.attributes.position.array;
    let acc = 0;

    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const q = pts[Math.min(i + 1, n - 1)];
      const o = pts[Math.max(i - 1, 0)];

      let tx = q.x - o.x;
      let tz = q.z - o.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl;
      tz /= tl;
      const nx = -tz;
      const nz = tx;

      if (i) acc += p.distanceTo(pts[i - 1]);
      const t = total > 1e-5 ? acc / total : 0.5;
      const taper = Math.pow(Math.sin(Math.PI * Math.min(1, t)), 0.5);
      const w = halfW * (0.22 + 0.78 * taper);

      const k = i * 6;
      this.bladePos[k] = p.x + nx * w;
      this.bladePos[k + 1] = y;
      this.bladePos[k + 2] = p.z + nz * w;
      this.bladePos[k + 3] = p.x - nx * w;
      this.bladePos[k + 4] = y;
      this.bladePos[k + 5] = p.z - nz * w;

      corePos[i * 3] = p.x;
      corePos[i * 3 + 1] = y + 0.002;
      corePos[i * 3 + 2] = p.z;
    }

    this.bladeGeo.attributes.position.needsUpdate = true;
    this.bladeGeo.setDrawRange(0, (n - 1) * 6);
    this.coreGeo.attributes.position.needsUpdate = true;
    this.coreGeo.setDrawRange(0, n);
    this.bladeMat.opacity = opacity;
    this.core.material.opacity = Math.min(1, opacity + 0.25);
  }

  _showBlade() {
    this.blade.visible = true;
    this.core.visible = true;
  }

  _hideBlade() {
    this.blade.visible = false;
    this.core.visible = false;
    this.bladeGeo.setDrawRange(0, 0);
    this.coreGeo.setDrawRange(0, 0);
    this.flashT = 0;
  }

  /* ---------------- 面板 ---------------- */

  _buildPanel() {
    const ui = this.ctx.ui;
    const p = document.createElement('div');
    p.className = 'panel';

    this.countText = metaText('已备 <b>0</b> 样');
    this.cutText = metaText('刀工 <b>—</b>');
    const head = document.createElement('div');
    head.className = 'row between';
    head.appendChild(this.countText);
    head.appendChild(this.cutText);
    p.appendChild(head);

    const cards = document.createElement('div');
    cards.className = 'cards';
    this.cardMap = new Map();
    for (const ing of INGREDIENTS) {
      const c = card({
        ing,
        icon: iconFor(ing),
        onClick: (btn) => this.toggleIngredient(ing, btn),
      });
      cards.appendChild(c);
      this.cardMap.set(ing.id, c);
    }
    p.appendChild(cards);

    this.panel = p;
    ui.registerPanel('s2', p);

    this.btnNext = button({
      label: '切好了，去煮米线',
      cls: 'primary',
      onClick: () => this.finish(),
    });
  }

  /* ---------------- 生命周期 ---------------- */

  reset() {
    this.picked = [];
    this.activeId = null;
    this.activeSlicer = null;
    this.qualities = [];
    this.cutting = false;
    this.gesture = [];
    this.flashT = 0;
    this.hintAt = -99;

    this._hideBlade();
    this.tip.visible = false;

    for (const [, c] of this.cardMap) c.classList.remove('on');
    for (const [, s] of this.slicers) {
      s.resetPolys();
      s.mesh.visible = false;
    }
    this.board.clearTokens();
    this.countText.innerHTML = '已备 <b>0</b> 样';
    this.cutText.innerHTML = '刀工 <b>—</b>';
  }

  async enter() {
    this.reset();
    this.group.visible = true;
    this.active = true;
    this._measureMinLen();
    this.ctx.ui.setActions([this.btnNext]);
    this.ctx.ui.toast('先点下面挑配菜，再到砧板上划一道', '', 2400);
  }

  onResize() {
    this._measureMinLen();
  }

  /** 52px 在当前机位下对应多少世界单位 */
  _measureMinLen() {
    const cam = this.ctx.camera;
    const tanHalf = Math.tan((cam.fov * Math.PI) / 360);
    const d = Math.max(0.8, cam.position.distanceTo(this.boardCenter));
    const worldPerPx = (2 * d * tanHalf) / Math.max(320, this.ctx.layout.h);
    this.minLenWorld = Math.max(CUT.minLenWorld, Math.min(0.62, CUT.minLenPx * worldPerPx));
  }

  /* ---------------- 选配菜 ---------------- */

  toggleIngredient(ing, btn) {
    const on = !btn.classList.contains('on');
    btn.classList.toggle('on', on);
    this.ctx.audio.pick();

    if (on) {
      if (!this.picked.includes(ing.id)) this.picked.push(ing.id);
      this.setActive(ing.id);
    } else {
      this.picked = this.picked.filter((x) => x !== ing.id);
      if (this.activeId === ing.id) this.setActive(null);
    }

    this.board.syncTokens(this.picked.map((id) => ING_MAP[id]));
    this.countText.innerHTML = `已备 <b>${this.picked.length}</b> 样`;

    if (on && this.picked.length === 1) {
      this.ctx.ui.toast('在砧板上划一道就能切开', 'good', 1600);
    }
  }

  setActive(id) {
    if (this.activeSlicer) this.activeSlicer.mesh.visible = false;
    this.activeId = id;

    if (!id) {
      this.activeSlicer = null;
      return;
    }

    let s = this.slicers.get(id);
    if (!s) {
      const ing = ING_MAP[id];
      s = createPiece(ing);
      s.mesh.position.set(0, BOARD_TOP + 0.002, 0);
      this.group.add(s.mesh);
      this.slicers.set(id, s);
    }
    s.mesh.visible = true;
    this.activeSlicer = s;
  }

  /* ---------------- 切 ---------------- */

  _grab(p) {
    const off = p.pointerType === 'touch' ? CUT.fingerOffsetPx : 0;
    const v = this.ctx.input.toPlane(p.x, p.y - off, BOARD_TOP);
    return v ? v.clone() : null;
  }

  _toLocal(v) {
    const m = this.activeSlicer.mesh.position;
    return { x: v.x - m.x, y: -(v.z - m.z) };
  }

  onPointer(p) {
    if (!this.activeSlicer) return;

    if (p.phase === 'down') {
      const w = this._grab(p);
      if (!w) return;
      this.cutting = true;
      this.gesture = [w];
      this.tip.position.set(w.x, BOARD_TOP + 0.13, w.z);
      this.tip.visible = true;
      this._showBlade();
      this.bladeGeo.setDrawRange(0, 0);
      this.coreGeo.setDrawRange(0, 0);
      return;
    }

    if (p.phase === 'move') {
      if (!this.cutting) return;
      const w = this._grab(p);
      if (!w) return;
      const last = this.gesture[this.gesture.length - 1];
      if (last && w.distanceTo(last) < 0.006) return;

      this.gesture.push(w);
      if (this.gesture.length > BLADE_MAX) this.gesture.shift();

      this.tip.position.set(w.x, BOARD_TOP + 0.13, w.z);
      this._setBlade(this.gesture, 0.62);
      return;
    }

    if (p.phase === 'end') {
      if (!this.cutting) return;
      this.cutting = false;
      this.tip.visible = false;
      this._commitCut();
    }
  }

  /** 抬手：整条轨迹结算成「一刀」 */
  _commitCut() {
    const pts = this.gesture;
    const slicer = this.activeSlicer;
    this.gesture = [];

    if (!slicer || pts.length < 2) {
      this._hideBlade();
      return;
    }

    // 终点 = 离起点最远的那个点：划弧线、绕回来也能得到一条贯穿的切线
    let far = pts[0];
    let best = 0;
    for (const p of pts) {
      const d = p.distanceTo(pts[0]);
      if (d > best) {
        best = d;
        far = p;
      }
    }

    if (best < this.minLenWorld) {
      this._hideBlade();
      this._hintShort();
      return;
    }

    const a = this._toLocal(pts[0]);
    const b = this._toLocal(far);
    const r = slicer.cutLine(a.x, a.y, b.x, b.y);

    const mid = pts[0].clone().add(far).multiplyScalar(0.5);
    mid.y = BOARD_TOP + 0.03;

    // 刀光拉直成真正切的那一条线，然后闪掉
    this._setBlade([pts[0], far], 0.95);
    this.flashT = FLASH_MS;

    if (r.count) {
      this.qualities.push(cutQuality({
        straight: this._straightness(pts),
        smooth: this._smoothness(pts),
        evenness: r.evenness,
      }));
      this.ctx.audio.chop(1);
      this.ctx.fx.crumbs(mid, 4, colorOf(this.activeId));
      this.ctx.fx.sparkle(mid, 6);
      this._updateCutText();
      if (r.pieces >= CUT.maxPieces) this.ctx.ui.toast('已经够碎了，够了够了', '', 1200);
    } else {
      this.ctx.audio.chop(0.2);
    }
  }

  /** 轨迹有多接近直线 */
  _straightness(pts) {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
    if (len < 1e-4) return 1;
    const chord = pts[0].distanceTo(pts[pts.length - 1]);
    const raw = Math.min(1, chord / len);
    return clamp01((raw - CUT.straightLo) / (CUT.straightHi - CUT.straightLo));
  }

  /** 轨迹偏离弦线的最大距离 → 手感平滑度 */
  _smoothness(pts) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    const ab = new THREE.Vector3().subVectors(b, a);
    const abLen = ab.length() || 1e-6;
    ab.normalize();

    let maxDev = 0;
    const tmp = new THREE.Vector3();
    for (const p of pts) {
      tmp.subVectors(p, a);
      const proj = tmp.dot(ab);
      const dev = Math.sqrt(Math.max(0, tmp.lengthSq() - proj * proj));
      if (dev > maxDev) maxDev = dev;
    }
    return clamp01(1 - maxDev / (abLen * 0.3));
  }

  _hintShort() {
    const now = performance.now();
    if (now - this.hintAt < 2200) return;
    this.hintAt = now;
    this.ctx.ui.toast('划长一点才切得开', '', 1200);
  }

  _updateCutText() {
    if (!this.qualities.length) {
      this.cutText.innerHTML = '刀工 <b>—</b>';
      return;
    }
    const v = cutPoints(this.qualities) / 15;
    this.cutText.innerHTML = `刀工 <b>${Math.round(v * 100)}</b>`;
  }

  /* ---------------- 收尾 ---------------- */

  finish() {
    const ctx = this.ctx;
    const qualities = this.qualities.slice();

    ctx.score.cut.qualities = qualities;
    ctx.score.cut.value = cutPoints(qualities);

    ctx.save.picked = this.picked.slice();
    ctx.save.pieces = {};
    for (const [id, s] of this.slicers) {
      ctx.save.pieces[id] = s.exportPieces();
      s.mesh.visible = false;
    }

    ctx.audio.success();
    ctx.next();
  }

  update(dt) {
    super.update(dt);
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / FLASH_MS);
      this.bladeMat.opacity = 0.95 * k * k;
      this.core.material.opacity = k;
      if (this.flashT <= 0) this._hideBlade();
    }
  }
}

function colorOf(id) {
  const ing = ING_MAP[id];
  if (!ing) return [0.9, 0.8, 0.7];
  const c = new THREE.Color(ing.color);
  return [c.r, c.g, c.b];
}
