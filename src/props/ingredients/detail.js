/**
 * 食材细节件：在「挤出片」之上再叠 1~2 层几何，让食材不是一个色块。
 *
 * 坐标系与 Slicer 的几何一致：
 *   多边形 (px, py) → 局部 (px, 高度, -py)，高度先从 0 长到 thickness
 * 所以细节件一律从 y = thickness 往上长。
 *
 * 性能：同类细节合并成 1 个 geometry，最多 2 个 mesh（主体色 + 辅色）。
 * 只在「砧板上的整块食材」上用；切碎后细节藏起来（切面本来就该是平的）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from '../../render/Toon.js';
import { patternTexture } from './build.js';
import { shapeFor } from './shapes.js';

/* ---------------- 小工具 ---------------- */

function pointIn(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function bbox(poly) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

/** 在多边形内随机取点（拒绝采样） */
function sampleIn(poly, b, rnd, shrink = 0.9) {
  for (let i = 0; i < 40; i++) {
    const x = b.cx + (rnd() - 0.5) * b.w * shrink;
    const y = b.cy + (rnd() - 0.5) * b.h * shrink;
    if (pointIn(poly, x, y)) return { x, y };
  }
  return { x: b.cx, y: b.cy };
}

function flatSphere(rx, ry, rz, seg = 10) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 1));
  g.scale(rx, ry, rz);
  return g;
}

function rngOf(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const matCache = new Map();

/** 把颜色压暗一点：细节件要像「纹理/阴影」，不能比主体还亮，否则看起来像发光 */
function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return c.getHex();
}

function baseMaterial(ing) {
  const key = ing.id + ':base';
  let m = matCache.get(key);
  if (!m) {
    m = toon(ing.color, {
      map: patternTexture(ing.tex),
      transparent: ing.alpha != null,
      opacity: ing.alpha == null ? 1 : ing.alpha,
    });
    matCache.set(key, m);
  }
  return m;
}

/**
 * 细节件材质：主体色的暗调版本 + 同一张贴图。
 * 之前用 ing.accent（浅色）→ 表面全是白球，看起来像高光噪点。
 */
function detailMaterial(ing) {
  const key = ing.id + ':det';
  let m = matCache.get(key);
  if (!m) {
    m = toon(shade(ing.color, 0.78), {
      map: patternTexture(ing.tex),
      transparent: ing.alpha != null,
      opacity: ing.alpha == null ? 1 : ing.alpha,
    });
    matCache.set(key, m);
  }
  return m;
}

/* ---------------- 各类造型 ---------------- */

/** 薄片：表面肌理。整片保持平整，不要盖椭球（那会变成一片亮光） */
function detailSlab(ing, poly, b, t, rnd, out) {
  const marks = ing.detail?.marks ?? 4;
  const relief = (ing.detail?.relief ?? 0.012) * 1.2;

  // 纹理长度按短边取，保证不会伸出轮廓
  const maxLen = Math.min(b.w, b.h) * 0.55;
  for (let i = 0; i < marks; i++) {
    const p = sampleIn(poly, b, rnd, 0.62);
    const ang = (rnd() - 0.5) * 0.8;
    const len = maxLen * (0.5 + rnd() * 0.5);
    const g = flatSphere(Math.max(0.02, len), relief * 0.35, Math.max(0.01, len * 0.12), 8);
    g.rotateY(ang);
    g.translate(p.x, t + relief * 0.1, -p.y);
    out.accent.push(g);
  }
}

/** 块状：中间鼓一点 + 表面颗粒 */
function detailChunk(ing, poly, b, t, rnd, out) {
  const marks = ing.detail?.marks ?? 8;
  const relief = (ing.detail?.relief ?? 0.03) * 1.1;
  const rMin = Math.min(b.w, b.h);

  // 主体隆起：和主体同色，只是让顶面有一点弧度
  const dome = flatSphere(b.w * 0.44, relief * 0.75, b.h * 0.44, 14);
  dome.translate(b.cx, t, -b.cy);
  out.base.push(dome);

  // 颗粒：小而扁，暗色 → 读作炸衣/肉纹，不是白点
  for (let i = 0; i < marks; i++) {
    const p = sampleIn(poly, b, rnd, 0.82);
    const r = rMin * (0.055 + rnd() * 0.075);
    const g = flatSphere(r, r * 0.45, r, 7);
    g.translate(p.x, t + relief * (0.55 + rnd() * 0.35), -p.y);
    out.accent.push(g);
  }
}

/** 菌盖：伞盖 + 一圈裙边 */
function detailCap(ing, poly, b, t, rnd, out) {
  const relief = (ing.detail?.relief ?? 0.075) * 1.5;
  const rx = b.w * 0.46;
  const rz = b.h * 0.46;

  const dome = flatSphere(rx, relief, rz, 16);
  dome.translate(b.cx, t, -b.cy);
  out.base.push(dome);

  // 菌褶：伞盖下沿一圈小颗粒
  const n = ing.detail?.marks ?? 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const g = flatSphere(rx * 0.10, relief * 0.14, rz * 0.10, 6);
    g.translate(
      b.cx + Math.cos(a) * rx * 0.92,
      t + relief * 0.14,
      -(b.cy + Math.sin(a) * rz * 0.92)
    );
    out.accent.push(g);
  }
}

/** 丸子：整颗球 + 一道腰环 */
function detailBall(ing, poly, b, t, rnd, out) {
  const relief = (ing.detail?.relief ?? 0.1) * 1.7;
  const r = Math.max(b.w, b.h) * 0.5;

  const ball = flatSphere(r, relief, r, 16);
  ball.translate(b.cx, t, -b.cy);
  out.base.push(ball);

  if (ing.detail?.ring) {
    const ring = new THREE.TorusGeometry(r * 0.70, Math.max(0.005, r * 0.045), 5, 20);
    ring.rotateX(-Math.PI / 2);
    ring.translate(b.cx, t + relief * 0.5, -b.cy);
    out.accent.push(ring);
  }
}

/** 叶菜：中脉 + 支脉 */
function detailFrond(ing, poly, b, t, rnd, out) {
  const relief = (ing.detail?.relief ?? 0.014) * 1.2;
  const marks = ing.detail?.marks ?? 4;
  const long = b.w >= b.h;

  // 中脉：一条明显隆起的脊
  const spine = flatSphere(
    long ? b.w * 0.45 : b.w * 0.07,
    relief,
    long ? b.h * 0.08 : b.h * 0.45,
    10
  );
  spine.translate(b.cx, t, -b.cy);
  out.base.push(spine);

  // 支脉：沿长轴排开，长度按短边限死，绝不伸出叶子
  const thin = Math.min(b.w, b.h);
  for (let i = 0; i < marks; i++) {
    const f = (i + 0.5) / marks - 0.5;
    const g = flatSphere(
      long ? b.w * 0.11 : thin * 0.22,
      relief * 0.55,
      long ? thin * 0.20 : b.h * 0.11,
      8
    );
    g.rotateY((rnd() - 0.5) * 0.3);
    g.translate(
      b.cx + (long ? f * b.w * 0.62 : (rnd() - 0.5) * b.w * 0.24),
      t + relief * 0.45,
      -(b.cy + (long ? (rnd() - 0.5) * b.h * 0.3 : f * b.h * 0.62))
    );
    out.accent.push(g);
  }
}

/** 肠：上半圆柱 + 肠衣压痕 */
function detailRoll(ing, poly, b, t, rnd, out) {
  const relief = (ing.detail?.relief ?? 0.02) * 1.2;
  const r = b.h * 0.5;

  const body = flatSphere(b.w * 0.46, r * 1.05, r * 0.95, 14);
  body.translate(b.cx, t, -b.cy);
  out.base.push(body);

  for (let i = 0; i < 2; i++) {
    const ring = new THREE.TorusGeometry(r * 0.92, Math.max(0.005, r * 0.09), 5, 16);
    ring.rotateX(-Math.PI / 2);
    ring.translate(b.cx + (i ? 1 : -1) * b.w * 0.2, t + r * 0.28, -b.cy);
    out.accent.push(ring);
  }
}

const BUILDERS = {
  slab: detailSlab,
  chunk: detailChunk,
  cap: detailCap,
  ball: detailBall,
  frond: detailFrond,
  roll: detailRoll,
};

/* ---------------- 入口 ---------------- */

/**
 * @param {object} ing 食材
 * @param {number} thickness 已乘过 1.15 的厚度（和 Slicer 一致）
 * @param {number} S BOARD_SCALE（多边形已被放大这么多倍）
 * @returns {THREE.Group|null}
 */
export function buildIngredientDetail(ing, thickness, S) {
  const kind = ing.kind || 'slab';
  const fn = BUILDERS[kind] || BUILDERS.slab;

  const poly = shapeFor(ing).map((p) => ({ x: p.x * S, y: p.y * S }));
  const b = bbox(poly);
  const rnd = rngOf(hashSeed('detail:' + ing.id));

  const out = { base: [], accent: [] };
  fn(ing, poly, b, thickness, rnd, out);

  const group = new THREE.Group();
  group.position.y = 0;

  for (const key of ['base', 'accent']) {
    const list = out[key];
    if (!list.length) continue;
    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (list.length > 1) for (const g of list) g.dispose();
    const mesh = new THREE.Mesh(merged, key === 'base' ? baseMaterial(ing) : detailMaterial(ing));
    mesh.renderOrder = 3;
    group.add(mesh);
  }

  return group.children.length ? group : null;
}

export function disposeDetail(group) {
  if (!group) return;
  group.traverse((o) => {
    if (o.isMesh && o.geometry) o.geometry.dispose();
  });
  group.removeFromParent();
}
