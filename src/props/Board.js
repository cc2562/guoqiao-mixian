/**
 * 砧板 + 备菜盘 + 备好的小样。
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COLORS } from '../data/config.js';
import { toon, woodTexture, blobShadow } from '../render/Toon.js';
import { attachOutline } from '../render/Outline.js';
import { geometryFor, materialFor } from './ingredients/index.js';
import { buildIngredientDetail } from './ingredients/detail.js';

/** 砧板台面高度：板面 y=0.095 + 半厚 0.045 —— 食材必须落在它上面，不能埋进板里 */
export const BOARD_TOP = 0.14;
export const TRAY_Z = -1.02;

export function createBoard() {
  const g = new THREE.Group();
  // 竹砧板：比台面明显浅一档，俯视才分得清哪块是板
  const wood = woodTexture('#e6c393', '#c79b60', '#f6e2ba');

  // 底板（深色边框，增加厚度感）
  const base = new THREE.Mesh(
    new RoundedBoxGeometry(2.26, 0.1, 1.72, 3, 0.05),
    toon(0x8a4f26)
  );
  base.position.set(0, 0.05, 0);
  g.add(base);

  // 板面
  const top = new THREE.Mesh(
    new RoundedBoxGeometry(2.12, 0.09, 1.58, 4, 0.045),
    toon(0xffffff, { map: wood })
  );
  top.position.set(0, 0.095, 0);
  g.add(top);

  // ---- 备菜盘 ----
  const trayPts = [
    [0.001, 0], [0.86, 0], [1.02, 0.035], [1.06, 0.075],
    [1.02, 0.085], [0.94, 0.055], [0.86, 0.04], [0.001, 0.028],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const tray = new THREE.Mesh(new THREE.LatheGeometry(trayPts, 40), toon(0xf2efe4));
  tray.scale.set(0.86, 1, 0.4);
  tray.position.set(0, 0.02, TRAY_Z);
  g.add(tray);

  const trayRim = new THREE.Mesh(
    new THREE.TorusGeometry(1.02, 0.014, 6, 42),
    toon(COLORS.blue, { opacity: 0.55, transparent: true })
  );
  trayRim.rotation.x = Math.PI / 2;
  trayRim.scale.set(0.86, 0.4, 1);
  trayRim.position.set(0, 0.095, TRAY_Z);
  g.add(trayRim);

  const sh = blobShadow(3.0, 2.2, 0.35);
  sh.position.set(0, 0.008, -0.15);
  g.add(sh);

  // ---- 备菜小样 ----
  const tokens = [];
  const MAX_TOKENS = 8;
  const detailCache = new Map();

  function detailOf(ing) {
    let d = detailCache.get(ing.id);
    if (d === undefined) {
      d = buildIngredientDetail(ing, ing.thickness, 1);
      detailCache.set(ing.id, d);
    }
    return d;
  }

  const api = {
    group: g,
    top: BOARD_TOP,
    trayZ: TRAY_Z,

    /** 同步备菜盘上的小样（最多 8 个） */
    syncTokens(ings) {
      const list = ings.slice(0, MAX_TOKENS);
      const n = list.length;
      const span = Math.min(1.5, n * 0.28);

      for (let i = 0; i < MAX_TOKENS; i++) {
        let t = tokens[i];
        if (!t) {
          t = {
            root: new THREE.Group(),
            body: new THREE.Mesh(new THREE.BufferGeometry(), toon(0xffffff)),
            detail: null,
          };
          t.root.add(t.body);
          t.root.visible = false;
          g.add(t.root);
          tokens[i] = t;
        }

        if (i < n) {
          const ing = list[i];
          t.body.geometry = geometryFor(ing);
          t.body.material = materialFor(ing);
          t.body.scale.setScalar(0.62);

          if (t.detail) t.detail.removeFromParent();
          const d = detailOf(ing);
          if (d) {
            d.scale.setScalar(0.62);
            t.root.add(d);
            t.detail = d;
          } else {
            t.detail = null;
          }

          t.root.position.set(
            n === 1 ? 0 : -span / 2 + (span * i) / (n - 1),
            0.115,
            TRAY_Z
          );
          t.root.rotation.set(0, (i % 2 ? 0.3 : -0.25), 0);
          t.root.visible = true;
        } else {
          t.root.visible = false;
        }
      }
    },

    clearTokens() {
      for (const t of tokens) t.root.visible = false;
    },
  };

  return api;
}
