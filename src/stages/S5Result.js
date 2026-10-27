/**
 * S5 · 套餐与评分
 * 汤碗 + 米线碗 + 格子盘摆成一套，相机绕着转，7 项分数逐行结算。
 */
import * as THREE from 'three';
import { StageBase } from './StageBase.js';
import { createBowl } from '../props/Bowl.js';
import { createTray } from '../props/Tray.js';
import { createNoodleNest } from '../props/Noodles.js';
import { buildPiecesMesh } from '../props/ingredients/pieces.js';
import { BOWLS, BOWL_MAP, TRAYS, TRAY_MAP, ING_MAP } from '../data/recipes.js';
import { computeTotal } from '../data/scoring.js';
import { createResultView } from '../ui/ResultView.js';
import { button } from '../ui/widgets.js';
import { buildPoster, openPosterSheet } from '../ui/Poster.js';
import { delay } from '../core/Tween.js';
import { TRAY_PLACE_SCALE } from './S4Plate.js';

const BEST_KEY = 'gqmx.best';

/* 三件套摆位（桌面 y=0）：汤碗在后，米线碗与格子盘在前，构成一个三角 */
const SOUP_POS = new THREE.Vector3(0.02, 0, -0.60);
const NOODLE_POS = new THREE.Vector3(-0.72, 0, 0.54);
const TRAY_POS = new THREE.Vector3(0.74, 0, 0.52);
const BOWL_SCALE = 0.86;
const TRAY_SCALE = 0.95;

function readBest() {
  try { return parseFloat(localStorage.getItem(BEST_KEY)) || 0; } catch (_) { return 0; }
}
function writeBest(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch (_) { /* 隐私模式静默失败 */ }
}

export class S5Result extends StageBase {
  constructor(ctx) {
    super(ctx, 's5');
    this.title = '成品';
  }

  build() {
    this.bowl = null;
    this.noodleBowl = null;
    this.tray = null;
  }

  reset() {
    // 把从 s4 借来的盘子和配菜还回去，否则「再来一碗」时 s4 就没有盘子了
    if (this._stolen) {
      const { s4, trayGroup, origin, items } = this._stolen;
      for (const m of items) {
        trayGroup.add(m);
        m.position.add(origin);
      }
      trayGroup.position.copy(origin);
      if (s4 && s4.group) s4.group.add(trayGroup);
      this._stolen = null;
    }
    if (this.bowl) { this.group.remove(this.bowl.group); this.bowl = null; }
    if (this.noodleBowl) { this.group.remove(this.noodleBowl.group); this.noodleBowl = null; }
    if (this.tray) { this.group.remove(this.tray.group); this.tray = null; }
  }

  async enter() {
    this.reset();
    this.group.visible = true;
    this.active = true;

    const ctx = this.ctx;
    const picked = (ctx.save.picked || []).filter((id) => ING_MAP[id]);

    /* 汤碗 */
    const soupMeta = BOWL_MAP[ctx.save.bowlId] || BOWLS[0];
    this.bowl = createBowl(soupMeta);
    this.bowl.group.position.copy(SOUP_POS);
    this.bowl.group.scale.setScalar(BOWL_SCALE);
    this.bowl.setSoupLevel(1);
    this.bowl.setRichness(1);
    this.group.add(this.bowl.group);

    /* 米线碗（空碗 + 一窝米线） */
    const noodleMeta = BOWL_MAP[ctx.save.noodleBowlId] || BOWLS[0];
    this.noodleBowl = createBowl(noodleMeta);
    this.noodleBowl.group.position.copy(NOODLE_POS);
    this.noodleBowl.group.scale.setScalar(BOWL_SCALE);
    this.noodleBowl.setSoupLevel(0);
    this.noodleBowl.setRichness(0);
    const nest = createNoodleNest().mesh;
    nest.position.set(-0.02, 0.20, 0.03);
    nest.scale.setScalar(0.95);
    this.noodleBowl.group.add(nest);
    this.group.add(this.noodleBowl.group);

    /* 格子盘：优先接管 s4 摆好的那盘 */
    const trayMeta = TRAY_MAP[ctx.save.trayId] || TRAYS[0];
    this._buildTray(trayMeta, picked);

    /* 记分 */
    const total = computeTotal(ctx.score);
    const best = readBest();
    const isRecord = total > best;
    if (isRecord) writeBest(total);

    /* 相机环绕：三件套整体入镜
     * 结果面板占了屏幕下半截，所以竖屏要把注视点压到桌面以下，
     * 让套餐整体抬到可用区（上半屏）里。 */
    const portrait = ctx.layout.portrait;
    if (portrait) {
      ctx.cine.startOrbit(new THREE.Vector3(0, -0.96, 0.04), 7.7, 3.25, 0.15, -0.55);
    } else {
      ctx.cine.startOrbit(new THREE.Vector3(0, -0.06, 0.04), 4.9, 2.35, 0.13, -0.55);
    }

    const pickedNames = picked.map((id) => ING_MAP[id].name);
    this.pickedNames = pickedNames;
    this.isRecord = isRecord;
    const view = createResultView({
      score: ctx.score,
      pickedNames,
      best,
      isRecord,
      audio: ctx.audio,
      onStamp: () => {
        ctx.cine.shake(0.035, 0.36);
        ctx.fx.confetti(new THREE.Vector3(0, 0.9, 0), 70, 2.0);
      },
    });

    ctx.ui.registerPanel('s5', view.node);
    ctx.ui.showPanel('s5');

    const replay = button({ label: '再来一碗', cls: 'primary', onClick: () => this.replay() });
    const poster = button({ label: '保存海报', cls: 'secondary', onClick: () => this.savePoster() });
    ctx.ui.setActions([poster, replay]);

    await delay(260);
    await view.play();
  }

  /** 建格子盘：能复用 s4 的成果就整盘搬过来，否则按碎块数据重建 */
  _buildTray(meta, picked) {
    const ctx = this.ctx;
    const s4 = ctx.stages && ctx.stages.s4;
    const tr = s4 && s4.transferPlates ? s4.transferPlates() : null;

    if (tr && tr.tray) {
      const trayGroup = tr.tray.group;
      const origin = trayGroup.position.clone();

      const wrap = new THREE.Group();
      trayGroup.position.set(0, 0, 0);
      wrap.add(trayGroup);
      for (const m of tr.items) {
        m.position.sub(origin);
        wrap.add(m);
      }
      this._stolen = { s4, trayGroup, origin, items: tr.items.slice() };

      // s4 里的盘子是放大过的，这里除了要还原成套餐尺寸，还要保证配菜一起等比缩
      wrap.scale.setScalar(TRAY_SCALE / TRAY_PLACE_SCALE);
      wrap.position.set(TRAY_POS.x, 0, TRAY_POS.z);
      wrap.rotation.y = -0.06;
      this.group.add(wrap);

      this.tray = { group: wrap, meta: tr.tray.meta, topY: tr.tray.topY };
      return;
    }

    // 兜底：按碎块数据现摆
    const tray = createTray(meta);
    tray.group.position.set(TRAY_POS.x, 0, TRAY_POS.z);
    tray.group.scale.setScalar(TRAY_SCALE);
    tray.group.rotation.y = -0.06;
    this.group.add(tray.group);
    this.tray = tray;

    const n = Math.max(1, picked.length);
    const R = tray.radius * 0.62;
    picked.forEach((id, i) => {
      const ing = ING_MAP[id];
      const a = (i / n) * Math.PI * 2 + 0.3;
      const mesh = buildPiecesMesh(ing, ctx.save.pieces ? ctx.save.pieces[id] : null, {
        size: Math.max(ing.size[0], ing.size[1]) * 0.8,
      });
      mesh.position.set(Math.cos(a) * R, tray.topY + 0.01, Math.sin(a) * R);
      mesh.rotation.y = Math.random() * Math.PI;
      tray.group.add(mesh);
    });
  }

  replay() {
    this.ctx.audio.tap();
    this.ctx.cine.stopOrbit();
    this.ctx.cine.setStage('s1');
    this.ctx.ui.hidePanels();
    this.ctx.restart();
  }

  /** 生成分享海报：菜品照 + 得分 + 评语 + 配菜，一张竖版图 */
  async savePoster() {
    const ctx = this.ctx;
    if (this._posterBusy) return;
    this._posterBusy = true;
    ctx.audio.tap();
    ctx.ui.toast('正在生成海报…', '', 1400);
    try {
      const cv = await buildPoster(ctx, {
        score: ctx.score,
        pickedNames: this.pickedNames || [],
        isRecord: !!this.isRecord,
      });
      openPosterSheet(cv, `过桥米线_${Math.round(ctx.score.total)}分.png`);
    } catch (e) {
      console.warn('海报生成失败', e);
      ctx.ui.toast('海报生成失败，可以手动机截屏', 'warn');
    } finally {
      this._posterBusy = false;
    }
  }

  update(dt) {
    super.update(dt);

    // 汤碗持续冒气
    this.steamAcc = (this.steamAcc || 0) + dt * 1.8;
    while (this.steamAcc > 0.2) {
      this.steamAcc -= 0.2;
      this.ctx.fx.steam(
        new THREE.Vector3(SOUP_POS.x, this.bowl ? this.bowl.soupY * BOWL_SCALE + 0.05 : 0.45, SOUP_POS.z),
        1
      );
    }

    if (this.bowl) this.bowl.update(dt);
    if (this.noodleBowl) this.noodleBowl.update(dt);
  }
}
