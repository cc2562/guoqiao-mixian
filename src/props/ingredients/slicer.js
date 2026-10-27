/**
 * 切菜内核：任意方向、任意刀数。
 *
 * 思路：食材就是「2D 多边形 + 挤出厚度」，所以"切"退化成
 *   用一条直线把多边形裁成两块 —— 纯 2D 计算，天然支持无限次、任意角度。
 * 每切一次把所有碎块重新合并成 1 个 BufferGeometry（1 个 drawcall），
 * 单次重建 < 1ms，比维护 40 个 Mesh 便宜得多。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUT } from '../../data/config.js';
import { shapeFor } from './shapes.js';
import { extrude } from './build.js';
import { attachOutline, setOutlineGeometry } from '../../render/Outline.js';
import { buildIngredientDetail } from './detail.js';

/** 有向面积（>0 为逆时针） */
export function signedArea(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

const EPS = 1e-6;

/** 去重 + 保证逆时针 + 至少 3 点 */
function clean(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const last = out[out.length - 1];
    if (!last || Math.abs(p.x - last.x) > 1e-5 || Math.abs(p.y - last.y) > 1e-5) out.push(p);
  }
  if (out.length > 2) {
    const f = out[0], l = out[out.length - 1];
    if (Math.abs(f.x - l.x) < 1e-5 && Math.abs(f.y - l.y) < 1e-5) out.pop();
  }
  if (out.length < 3) return null;
  if (signedArea(out) < 0) out.reverse();
  return out;
}

/**
 * 用直线把多边形裁成两块；不跨越则返回 null。
 * gap：切开后沿法线各推开一点，视觉上"散开"。
 */
export function splitPoly(poly, ax, ay, bx, by, gap = 0) {
  const n = poly.length;
  let dx = bx - ax, dy = by - ay;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return null;
  dx /= L; dy /= L;
  const nx = -dy, ny = dx;

  let hasPos = false, hasNeg = false;
  const d = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = (poly[i].x - ax) * nx + (poly[i].y - ay) * ny;
    d[i] = v;
    if (v > EPS) hasPos = true;
    else if (v < -EPS) hasNeg = true;
  }
  if (!hasPos || !hasNeg) return null;

  const A = [], B = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const da = d[i], db = d[j];
    const pa = poly[i], pb = poly[j];

    if (da >= 0) A.push({ x: pa.x, y: pa.y });
    else B.push({ x: pa.x, y: pa.y });

    if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
      const t = da / (da - db);
      const ix = pa.x + (pb.x - pa.x) * t;
      const iy = pa.y + (pb.y - pa.y) * t;
      A.push({ x: ix + nx * gap, y: iy + ny * gap });
      B.push({ x: ix - nx * gap, y: iy - ny * gap });
    }
  }

  const a = clean(A);
  const b = clean(B);
  if (!a || !b) return null;
  return [a, b];
}

/** 砧板上的放大倍数：食材在 2 米宽的砧板上得占住画面才有手感 */
export const BOARD_SCALE = 1.85;

export class Slicer {
  constructor(ing, material) {
    this.ing = ing;
    this.thickness = ing.thickness * 1.15;
    this.baseThickness = ing.thickness;
    this.basePoly = shapeFor(ing).map((p) => ({
      x: p.x * BOARD_SCALE,
      y: p.y * BOARD_SCALE,
    }));
    this.polys = [this.basePoly.map((p) => ({ x: p.x, y: p.y }))];
    this.cutCount = 0;

    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    this.mesh.renderOrder = 3;
    this.outline = attachOutline(this.mesh, this.mesh.geometry, 3);

    // 细节件（肌理/颗粒/伞盖）：只在没切之前显示，切开后露出平整切面
    this.detail = buildIngredientDetail(ing, this.thickness, BOARD_SCALE);
    if (this.detail) this.mesh.add(this.detail);

    this.rebuild();
  }

  /** 复原成一整块（复玩 / 重进本阶段时必须调，否则会残留上一轮的碎块） */
  resetPolys() {
    this.polys = [this.basePoly.map((p) => ({ x: p.x, y: p.y }))];
    this.cutCount = 0;
    if (this.detail) this.detail.visible = true;
    this.rebuild();
  }

  /** 把所有碎块合并成 1 个 geometry（1 drawcall） */
  rebuild() {
    const geos = [];
    for (const poly of this.polys) {
      geos.push(extrude(poly, this.thickness, this.polys.length === 1));
    }
    let merged;
    if (geos.length === 1) {
      merged = geos[0];
    } else {
      merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
    }
    const old = this.mesh.geometry;
    this.mesh.geometry = merged;
    setOutlineGeometry(this.mesh, merged);
    if (old && old !== merged) old.dispose();
  }

  /**
   * 切一刀（一条直线），切完重建几何。
   * 坐标是「食材局部坐标」（poly 坐标系，y 向上）。
   * @returns {{count:number, evenness:number, pieces:number}}
   */
  cutLine(x0, y0, x1, y1) {
    const next = [];
    let count = 0;
    let evenSum = 0;

    for (const poly of this.polys) {
      const sp = splitPoly(poly, x0, y0, x1, y1, CUT.gap);
      if (!sp) {
        next.push(poly);
        continue;
      }
      const [a, b] = sp;
      const aa = Math.abs(signedArea(a));
      const ab = Math.abs(signedArea(b));
      // 太碎的末末不再细分（否则会出现无数退化三角形），但仍算切中
      if (aa < CUT.mergeArea || ab < CUT.mergeArea) {
        next.push(poly);
        continue;
      }
      next.push(a, b);
      count++;
      evenSum += 1 - Math.abs(aa - ab) / (aa + ab);
    }

    if (!count) return { count: 0, evenness: 0, pieces: this.polys.length };
    if (next.length > CUT.maxPieces) {
      return { count: 0, evenness: 0, pieces: this.polys.length };
    }

    this.polys = next;
    this.cutCount++;
    if (this.detail) this.detail.visible = false;
    this.rebuild();
    return { count, evenness: evenSum / count, pieces: this.polys.length };
  }

  /**
   * 归一化导出：质心居中 + 最长边缩放到 1，厚度同比缩放。
   * s4/s5 拿这份数据可以原样还原「切过之后」的样子。
   */
  exportPieces() {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const poly of this.polys) {
      for (const p of poly) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const k = 1 / (Math.max(maxX - minX, maxY - minY) || 1);
    return {
      count: this.polys.length,
      thickness: this.thickness * k,
      polys: this.polys.map((poly) =>
        poly.map((p) => ({ x: (p.x - cx) * k, y: (p.y - cy) * k }))
      ),
    };
  }

  get pieceCount() {
    return this.polys.length;
  }

  get areas() {
    return this.polys.map((p) => Math.abs(signedArea(p)));
  }

  /** 顶视图下的包围盒（用于放置/镜头） */
  bounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const poly of this.polys) {
      for (const p of poly) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (-p.y < minZ) minZ = -p.y;
        if (-p.y > maxZ) maxZ = -p.y;
      }
    }
    return { minX, maxX, minZ, maxZ, w: maxX - minX, d: maxZ - minZ };
  }

  dispose() {
    const g = this.mesh.geometry;
    if (g) g.dispose();
    this.mesh.removeFromParent();
    this.outline && this.outline.removeFromParent();
  }
}
