/**
 * S4 · 装盘
 *   选汤碗 → 盛汤 → 选格子盘 → 把切好的配菜拖进盘里
 *
 * 码盘交互：按住下方的食材卡片，那一份碎块会整组浮到空中跟着手走，
 * 盘面上有一个落点环跟着投影点跑，松手就整组落下（自由落点 + 轻微弹跳/摊开）。
 */
import * as THREE from 'three';
import { StageBase } from './StageBase.js';
import { createBowl } from '../props/Bowl.js';
import { createTray } from '../props/Tray.js';
import { createPot } from '../props/Pot.js';
import { BOWLS, TRAYS, ING_MAP } from '../data/recipes.js';
import { garnishPoints, platePoints, platingPoints } from '../data/scoring.js';
import { buildPiecesMesh } from '../props/ingredients/pieces.js';
import { iconFor } from '../props/ingredients/index.js';
import { button, metaText } from '../ui/widgets.js';
import { tween } from '../core/Tween.js';

const BOWL_POS = [
  [-0.70, 0.70], [0.70, 0.70],
  [-0.70, -0.70], [0.70, -0.70],
];
const CAND_SCALE = 0.82;
const SOUP_HOME = new THREE.Vector3(-0.80, 0, -0.55);

const TRAY_POS = [
  [-0.95, 0.46], [0.05, 0.46], [1.05, 0.46],
];
const TRAY_CAND_SCALE = 0.72;
/** 选中后的盘子放大倍数：装盘页只留盘子和配菜，所以给得比原来大 */
export const TRAY_PLACE_SCALE = 1.35;
const TRAY_HOME = new THREE.Vector3(0.0, 0, 0.10);

const HOVER_Y = 0.58;

export class S4Plate extends StageBase {
  constructor(ctx) {
    super(ctx, 's4');
    this.title = '装盘';
  }

  build() {
    // 候选汤碗
    this.bowls = BOWLS.map((meta, i) => {
      const b = createBowl(meta);
      b.setSoupLevel(0);
      b.setRichness(0);
      b.group.position.set(BOWL_POS[i][0], 0.002, BOWL_POS[i][1]);
      b.group.scale.setScalar(CAND_SCALE);
      b.group.visible = false;
      this.group.add(b.group);
      return b;
    });

    // 候选格子盘
    this.trays = TRAYS.map((meta, i) => {
      const t = createTray(meta);
      t.group.position.set(TRAY_POS[i][0], 0.002, TRAY_POS[i][1]);
      t.group.scale.setScalar(TRAY_CAND_SCALE);
      t.group.visible = false;
      this.group.add(t.group);
      return t;
    });

    // 汤锅（倒汤用）—— 不带灶，锅是被端起来的
    this.pot = createPot({ withBurner: false });
    this.pot.group.visible = false;
    this.group.add(this.pot.group);

    // 汤柱
    this.stream = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.05, 1, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xf2c264, transparent: true, opacity: 0.72,
        depthWrite: false, side: THREE.DoubleSide,
      })
    );
    this.stream.visible = false;
    this.group.add(this.stream);

    // 落点环
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 1.0, 30),
      new THREE.MeshBasicMaterial({
        color: 0xfff0c8, transparent: true, opacity: 0.55,
        depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.scale.setScalar(0.16);
    this.ring.visible = false;
    this.ring.renderOrder = 8;
    this.group.add(this.ring);

    // 落盘的配菜
    this.placed = [];          // { id, mesh }
    this.placedIds = new Set();
    this.hover = null;         // 正在拖的 { id, mesh }

    this._buildPanel();
  }

  /* ---------------- 面板 ---------------- */

  _buildPanel() {
    const ui = this.ctx.ui;
    const p = document.createElement('div');
    p.className = 'panel';

    this.progressText = metaText('已装 <b>0</b> / 0 样');
    p.appendChild(this.progressText);

    this.chipWrap = document.createElement('div');
    this.chipWrap.className = 'chips';
    p.appendChild(this.chipWrap);

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'panel-label';
    this.hintEl.style.marginTop = '4px';
    this.hintEl.textContent = '';
    p.appendChild(this.hintEl);

    this.panel = p;
    ui.registerPanel('s4', p);
  }

  /* ---------------- 生命周期 ---------------- */

  reset() {
    this.phase = 'pickBowl';
    this.bowl = null;
    this.tray = null;
    this.chosenBowl = -1;
    this.chosenTray = -1;
    this.picked = [];
    this.total = 0;
    this.placedCount = 0;
    this.finished = false;

    this._cancelDrag(true);
    for (const it of this.placed) this.group.remove(it.mesh);
    this.placed = [];
    this.placedIds = new Set();

    for (const b of this.bowls) {
      b.group.visible = false;
      b.group.position.set(0, 0, 0);
      b.group.scale.setScalar(CAND_SCALE);
      b.setHighlight(false);
      b.setSoupLevel(0);
    }
    for (const t of this.trays) {
      t.group.visible = false;
      t.group.position.set(0, 0, 0);
      t.group.scale.setScalar(TRAY_CAND_SCALE);
      t.setHoverCell(-1);
    }

    this.pot.group.visible = false;
    this.stream.visible = false;
    this.ring.visible = false;
    if (this.ctx.cine.setFocusOverride) this.ctx.cine.setFocusOverride(null);
    this.chipWrap.innerHTML = '';
    this.hintEl.textContent = '';
    this.progressText.innerHTML = '已装 <b>0</b> / 0 样';
  }

  async enter() {
    this.reset();
    this.group.visible = true;
    this.active = true;

    this.picked = (this.ctx.save.picked || []).filter((id) => ING_MAP[id]);
    this.total = this.picked.length;
    this.progressText.innerHTML = `已装 <b>0</b> / ${this.total} 样`;

    this.ctx.ui.setActions([]);
    this.ctx.ui.toast('先挑一只碗盛汤', '', 2200);
    this.hintEl.textContent = '挑一只碗盛汤';

    // 汤碗登场
    for (let i = 0; i < this.bowls.length; i++) {
      const b = this.bowls[i];
      b.group.visible = true;
      b.group.position.set(BOWL_POS[i][0], -0.5, BOWL_POS[i][1]);
      b.group.scale.setScalar(CAND_SCALE);
      tween({
        dur: 440,
        delay: i * 60,
        ease: 'outBack',
        update: (e) => { b.group.position.y = -0.5 + 0.502 * e; },
      });
    }
  }

  /* ---------------- 选碗 → 倒汤 ---------------- */

  onPointer(p) {
    if (p.phase !== 'end' || p.dist > 16) return;

    if (this.phase === 'pickBowl') {
      const cands = this.bowls.map((b, i) => ({
        pos: b.group.position.clone().setY(0.3),
        radius: 78,
        key: i,
      }));
      const hit = this.ctx.input.pickScreen(cands, p.x, p.y);
      if (hit) this.chooseBowl(hit.key);
      return;
    }

    if (this.phase === 'pickTray') {
      const cands = this.trays.map((t, i) => ({
        pos: t.group.position.clone().setY(0.06),
        radius: 84,
        key: i,
      }));
      const hit = this.ctx.input.pickScreen(cands, p.x, p.y);
      if (hit) this.chooseTray(hit.key);
    }
  }

  async chooseBowl(i) {
    if (this.phase !== 'pickBowl') return;
    this.phase = 'pour';
    this.chosenBowl = i;

    const b = this.bowls[i];
    const ctx = this.ctx;
    b.setHighlight(true);
    b.pop();
    ctx.audio.pick();

    ctx.save.bowlId = b.meta.id;
    ctx.score.plate.bowlId = b.meta.id;
    this.bowl = b;

    // 其余的碗沉下去
    for (let k = 0; k < this.bowls.length; k++) {
      if (k === i) continue;
      const other = this.bowls[k];
      tween({
        dur: 240,
        update: (e) => { other.group.position.y = -0.45 * e; },
        onDone: () => { other.group.visible = false; },
      });
    }

    // 选中的碗摆到左边，恢复原尺寸
    const s0 = b.group.scale.x;
    const p0 = b.group.position.clone();
    await tween({
      dur: 420,
      ease: 'inOutCubic',
      update: (e) => {
        b.group.scale.setScalar(s0 + (1 - s0) * e);
        b.group.position.lerpVectors(p0, SOUP_HOME, e);
      },
    });
    b.group.position.copy(SOUP_HOME);
    b.group.scale.setScalar(1);

    ctx.cine.setStage('s4b', 0.5);
    this.pour();
  }

  async pour() {
    const ctx = this.ctx;
    const b = this.bowl;
    const bowlWorld = b.group.position.clone();

    this.hintEl.textContent = '慢慢把汤盛进碗里';

    // 锅从右上方滑过来，锅身左倾把汤倒进碗里（rotation.z 为正 = 左边下沉）
    this.pot.group.visible = true;
    this.pot.reset();
    this.pot.setHeat(0.35);
    this.pot.setSoup(0.4, 0);
    this.pot.group.scale.setScalar(0.80);
    this.pot.group.rotation.z = 0;

    const LIP = new THREE.Vector3(-0.80, 0.82, 0);   // 锅口左侧最低点（本地坐标）
    const lipAt = () => {
      this.pot.group.updateMatrixWorld(true);
      return LIP.clone().applyMatrix4(this.pot.group.matrixWorld);
    };

    // 先摆到大概位置，再按「锅口实际落到哪」平移一次，保证汤柱正好从锅嘴垂下来
    const to = new THREE.Vector3(bowlWorld.x + 0.95, 0.62, bowlWorld.z + 0.22);
    this.pot.group.position.copy(to);
    this.pot.group.rotation.z = 0.30;
    const lip0 = lipAt();
    to.x += bowlWorld.x + 0.08 - lip0.x;
    to.z += bowlWorld.z + 0.04 - lip0.z;

    this.pot.group.position.set(bowlWorld.x + 1.35, 1.05, bowlWorld.z + 0.45);
    this.pot.group.rotation.z = 0;
    const from = this.pot.group.position.clone();
    await tween({
      dur: 460,
      ease: 'inOutCubic',
      update: (e) => {
        this.pot.group.position.lerpVectors(from, to, e);
        this.pot.group.rotation.z = 0.30 * e;
      },
    });

    // 汤柱：从锅口下沿垂到汤面
    const lip = lipAt();
    const botY = b.soupY + 0.02;
    const h = Math.max(0.05, lip.y - botY);
    this.stream.position.set(lip.x, (lip.y + botY) / 2, lip.z);
    this.stream.scale.set(1, h, 1);
    this.stream.visible = true;

    ctx.audio.startBoil();
    ctx.audio.setBoil(0.5);

    await tween({
      dur: 900,
      ease: 'inOutQuad',
      update: (e) => {
        b.setSoupLevel(e);
        b.ripple(0, 0, 0.6 + e);
        this.stream.scale.x = 0.9 + Math.sin(e * 30) * 0.12;
        this.stream.scale.z = 0.9 + Math.cos(e * 26) * 0.12;
      },
    });

    b.setSoupLevel(1);
    b.setRichness(1);
    this.stream.visible = false;
    ctx.fx.splash(new THREE.Vector3(bowlWorld.x, b.soupY, bowlWorld.z), 10);
    ctx.audio.splash();
    ctx.audio.stopBoil();

    // 锅退场
    const back = this.pot.group.position.clone();
    await tween({
      dur: 380,
      ease: 'inOutCubic',
      update: (e) => {
        this.pot.group.position.set(back.x + 0.7 * e, back.y + 0.6 * e, back.z + 0.4 * e);
        this.pot.group.rotation.z = 0.30 * (1 - e);
      },
      onDone: () => { this.pot.group.visible = false; },
    });

    this._showTrays();
  }

  /* ---------------- 选格子盘 ---------------- */

  _showTrays() {
    this.phase = 'pickTray';
    this.hintEl.textContent = '挑一个格子盘装配菜';
    this.ctx.ui.toast('挑一个格子盘', '', 1600);
    this.ctx.cine.setStage('s4c', 0.42);

    for (let i = 0; i < this.trays.length; i++) {
      const t = this.trays[i];
      t.group.visible = true;
      t.group.position.set(TRAY_POS[i][0], -0.45, TRAY_POS[i][1]);
      t.group.scale.setScalar(TRAY_CAND_SCALE);
      tween({
        dur: 420,
        delay: i * 70,
        ease: 'outBack',
        update: (e) => { t.group.position.y = -0.45 + 0.452 * e; },
      });
      setTimeout(() => this.ctx.audio.tap(), i * 70);
    }
  }

  async chooseTray(i) {
    if (this.phase !== 'pickTray') return;
    this.phase = 'place';
    this.chosenTray = i;

    const t = this.trays[i];
    const ctx = this.ctx;
    ctx.audio.pick();

    ctx.save.trayId = t.meta.id;
    ctx.score.plate.trayId = t.meta.id;
    this.tray = t;

    for (let k = 0; k < this.trays.length; k++) {
      if (k === i) continue;
      const other = this.trays[k];
      tween({
        dur: 240,
        update: (e) => { other.group.position.y = -0.45 * e; },
        onDone: () => { other.group.visible = false; },
      });
    }

    // 汤碗让位：装盘只看盘子，不然它挤在左上角既挡视线又占机位
    if (this.bowl) {
      const bowl = this.bowl;
      const y0 = bowl.group.position.y;
      tween({
        dur: 320,
        ease: 'inQuad',
        update: (e) => { bowl.group.position.y = y0 - 0.55 * e; },
        onDone: () => {
          bowl.group.visible = false;
          bowl.group.position.y = y0;
        },
      });
    }

    // 盘子端到中间并放大
    const s0 = t.group.scale.x;
    const p0 = t.group.position.clone();
    await tween({
      dur: 520,
      ease: 'outBack',
      update: (e) => {
        t.group.scale.setScalar(s0 + (TRAY_PLACE_SCALE - s0) * e);
        t.group.position.lerpVectors(p0, TRAY_HOME, Math.min(1, e * 1.4));
      },
    });
    t.group.position.copy(TRAY_HOME);
    t.group.scale.setScalar(TRAY_PLACE_SCALE);

    this._frameTray(0.46);
    this._buildChips();
  }

  /* ---------------- 码盘 ---------------- */

  /** 按选中的盘子实际大小取景：盘子尽量占满可用宽度，圆/方/桥形各不一样 */
  _frameTray(smooth = 0.46) {
    const t = this.tray;
    if (!t) return;
    const sc = t.group.scale.x || 1;
    const cx = TRAY_HOME.x;
    const cz = TRAY_HOME.z;
    const hw = (t.halfW || t.radius) * sc * 1.06;
    const hd = (t.halfD || t.radius) * sc * 1.06;
    const rimY = t.topY * sc;

    this.ctx.cine.setFocusOverride('s4d', {
      target: [cx, rimY + 0.24, cz],
      dir: [0, 0.93, 0.37],
      h: Math.max(1.4, hd * 2),
      points: [
        [cx - hw, rimY, cz], [cx + hw, rimY, cz],
        [cx, 0.02, cz - hd], [cx, 0.02, cz + hd],
        [cx, HOVER_Y, cz],
      ],
    });
    this.ctx.cine.setStage('s4d', smooth);
  }

  _buildChips() {
    this.chipWrap.innerHTML = '';
    for (const id of this.picked) {
      const ing = ING_MAP[id];
      const b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.dataset.key = id;

      const img = document.createElement('img');
      img.src = iconFor(ing);
      img.alt = ing.name;
      b.appendChild(img);

      const nm = document.createElement('span');
      nm.textContent = ing.name;
      nm.style.fontSize = '11px';
      b.appendChild(nm);

      b.addEventListener('pointerdown', (ev) => this._beginDrag(id, ev));
      this.chipWrap.appendChild(b);
    }

    this.hintEl.textContent = '按住卡片，拖到盘里松手';
    this.ctx.ui.toast('按住下方的配菜，拖进格盘', '', 2600);

    // 卡片进场后面板变高了：重新量一次遮挡再取景，免得盘子被面板压住
    requestAnimationFrame(() => {
      if (this.phase !== 'place') return;
      this.ctx.layout.setObstruction('s4', this.ctx.ui.panelOcclusion());
      this._frameTray(0.5);
    });
  }

  _beginDrag(id, ev) {
    if (this.phase !== 'place' || this.finished) return;
    if (this.placedIds.has(id)) return;
    const chip = ev.currentTarget;
    if (chip.classList.contains('used')) return;
    ev.preventDefault();

    const ing = ING_MAP[id];
    const data = this.ctx.save.pieces ? this.ctx.save.pieces[id] : null;

    const mesh = buildPiecesMesh(ing, data, { size: Math.max(ing.size[0], ing.size[1]) * 0.64 });
    mesh.visible = true;
    this.group.add(mesh);

    this.hover = {
      id, mesh, chip, pointerId: ev.pointerId,
      moved: false, startX: ev.clientX, startY: ev.clientY, drop: null,
    };

    const move = (e) => this._dragMove(e);
    const up = (e) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      // 触屏上浏览器可能因为滚动手势直接 pointercancel：
      // 这不是「松手」，必须当成取消，否则食材会凭空掉在盘边上
      this._endDrag(e, e.type === 'pointercancel');
    };

    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up, { passive: true });
    window.addEventListener('pointercancel', up, { passive: true });
    // 触屏：把指针抓在这张卡片上，避免手指划过容器时事件被别的元素接走
    try { chip.setPointerCapture(ev.pointerId); } catch (_) { /* 不支持就算了 */ }

    // 先让配菜浮到手指上方，但这一下不算「移动」，避免点一下就误落盘
    this._dragMove(ev);
    this.hover.moved = false;
    this.hover.drop = null;
  }

  _dragMove(ev) {
    const d = this.hover;
    if (!d || !this.tray) return;

    const air = this.ctx.input.toPlane(ev.clientX, ev.clientY, HOVER_Y);
    if (air) d.mesh.position.set(air.x, HOVER_Y, air.z);

    // 必须要真的拖动过才算数
    if (Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) > 10) d.moved = true;
    if (!d.moved) return;

    // 盘子被整体缩放过了，落点平面/半径/格坐标都要跟着换算
    const sc = this.tray.group.scale.x || 1;
    const topY = this.tray.topY * sc;

    const hit = this.ctx.input.toPlane(ev.clientX, ev.clientY, topY);
    if (!hit) { this.ring.visible = false; this.tray.setHoverCell(-1); d.drop = null; return; }

    // 落在盘内（超出就贴边）—— 注意要相对盘心算，不是世界原点
    const cx = this.tray.group.position.x;
    const cz = this.tray.group.position.z;
    const dx = hit.x - cx;
    const dz = hit.z - cz;
    const r = this.tray.radius * sc;
    const len = Math.hypot(dx, dz);

    // 手指还在盘外（比如刚离开卡片）时不算有效落点：
    // 否则触屏一拖就会被贴边吸附，看起来像「刚碰到盘子就掉下去」
    if (len > r * 1.12) {
      d.drop = null;
      this.ring.visible = false;
      this.tray.setHoverCell(-1);
      return;
    }

    const k = len > r * 0.92 ? (r * 0.92) / len : 1;
    d.drop = new THREE.Vector3(cx + dx * k, topY, cz + dz * k);

    this.ring.visible = true;
    this.ring.position.set(d.drop.x, topY + 0.008, d.drop.z);
    this.ring.scale.setScalar(0.15 + Math.sin(this.t * 6) * 0.012);

    const localX = (d.drop.x - cx) / sc;
    const localZ = (d.drop.z - cz) / sc;
    this.tray.setHoverCell(this.tray.cellAt(localX, localZ));
  }

  _endDrag(ev, cancelled = false) {
    const d = this.hover;
    this.hover = null;
    this.ring.visible = false;
    if (this.tray) this.tray.setHoverCell(-1);
    if (!d) return;

    if (cancelled || !d.drop || !d.moved) {
      // 手势被打断 / 没真的拖到盘里（点了就松手），直接收回
      d.mesh.removeFromParent();
      if (d.mesh.geometry) d.mesh.geometry.dispose();
      return;
    }

    this._drop(d.mesh, d.drop, d.chip, d.id);
  }

  _drop(mesh, drop, chip, id) {
    const ctx = this.ctx;
    if (this.finished || this.placedIds.has(id)) {
      mesh.removeFromParent();
      if (mesh.geometry) mesh.geometry.dispose();
      return;
    }
    this.placedIds.add(id);
    const from = mesh.position.clone();
    mesh.rotation.y = Math.random() * Math.PI;

    tween({
      dur: 320,
      ease: 'inQuad',
      update: (e) => {
        mesh.position.set(
          from.x + (drop.x - from.x) * e,
          from.y + (drop.y + 0.005 - from.y) * e,
          from.z + (drop.z - from.z) * e
        );
        mesh.rotation.y += 0.05;
      },
      onDone: () => {
        ctx.audio.place();
        ctx.fx.crumbs(drop.clone().setY(drop.y + 0.04), 5, [0.95, 0.85, 0.7]);

        // 轻微物理：先轻轻弹一下，再摊开一点
        const y0 = drop.y + 0.005;
        tween({
          dur: 150,
          ease: 'outQuad',
          update: (e) => {
            mesh.position.y = y0 + 0.03 * e;
            const s = 0.94 + 0.06 * e;
            mesh.scale.set(s, 1 / s, s);
          },
          onDone: () => {
            tween({
              dur: 170,
              ease: 'inQuad',
              update: (e) => {
                mesh.position.y = y0 + 0.03 * (1 - e);
                const s = 1 + 0.05 * (1 - e);
                mesh.scale.set(s, 1 / s, s);
              },
              onDone: () => {
                mesh.position.y = y0;
                mesh.scale.set(1, 1, 1);
              },
            });
          },
        });

        this.placed.push({ id, mesh });
        this.placedCount++;
        this.progressText.innerHTML = `已装 <b>${this.placedCount}</b> / ${this.total} 样`;

        chip.classList.add('used');
        chip.style.opacity = '0.35';
        chip.disabled = true;

        if (this.placedCount >= this.total) this.complete();
      },
    });
  }

  _cancelDrag(silent) {
    if (this.hover) {
      this.hover.mesh.removeFromParent();
      this.hover = null;
    }
    if (!silent) {
      this.ring.visible = false;
    }
  }

  /* ---------------- 完成 ---------------- */

  complete() {
    this.finished = true;
    const ctx = this.ctx;

    const gp = garnishPoints(this.picked);
    ctx.score.garnish.value = gp.value;
    ctx.score.garnish.picked = this.picked.slice();

    ctx.score.plate.value = platePoints(ctx.save.bowlId, ctx.save.trayId);
    ctx.score.plating.placed = this.placedCount;
    ctx.score.plating.total = this.total;
    ctx.score.plating.value = platingPoints(this.placedCount, this.total);

    ctx.audio.success();
    this.hintEl.textContent = '摆好了，可以上桌';
    ctx.ui.toast('装盘完成，端上桌！', 'good', 1600);

    const btn = button({
      label: '端上桌',
      cls: 'primary',
      onClick: () => { if (!this.busy) { this.busy = true; ctx.next(); } },
    });
    btn.classList.add('ready');
    ctx.ui.setActions([btn]);

    // 提示语换了一行、按钮也上来了，再量一次，别让盘子被面板压住
    requestAnimationFrame(() => {
      this.ctx.layout.setObstruction('s4', this.ctx.ui.panelOcclusion());
      this._frameTray(0.5);
    });
  }

  /**
   * 交给 s5 复用：把已经摆好的盘子和配菜整体交出去，避免重建。
   */
  transferPlates() {
    return {
      bowl: this.bowl,
      tray: this.tray,
      items: this.placed.map((p) => p.mesh),
    };
  }

  update(dt) {
    super.update(dt);
    if (this.bowl && this.bowl.group.visible) this.bowl.update(dt);
    if (this.hover && this.hover.drop) {
      this.ring.scale.setScalar(0.15 + Math.sin(this.t * 7) * 0.012);
    }
  }
}
