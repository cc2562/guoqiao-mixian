/**
 * 碎块重建：把 S2 导出的归一化多边形还原成一组 mesh。
 *
 * 约定（与 Slicer.exportPieces 对齐）：
 *   data.polys 已被「质心居中 + 最长边缩放到 1」
 *   data.thickness 同比缩放
 * 这里再统一乘上 size，就能得到任意需要的大小。
 *
 * 性能：同一食材的所有碎块 + 所有副本 merge 成 1 个 geometry → 1 个 drawcall。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { extrude } from './build.js';
import { shapeFor } from './shapes.js';
import { materialFor } from './index.js';
import { attachOutline } from '../../render/Outline.js';

/** 把一组多边形归一化到「最长边 = 1」（给没切过的食材兜底用） */
function normalized(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const k = 1 / (Math.max(maxX - minX, maxY - minY) || 1);
  return pts.map((p) => ({ x: (p.x - cx) * k, y: (p.y - cy) * k }));
}

function makeChunk(poly, size, thickness, spread) {
  const pts = poly.map((p) => ({ x: p.x * size, y: p.y * size }));
  const g = extrude(pts, thickness, false);
  g.rotateY(Math.random() * Math.PI * 2);
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * spread;
  g.translate(Math.cos(a) * r, Math.random() * thickness * 2.0, Math.sin(a) * r);
  return g;
}

/**
 * @param {object} ing   食材定义
 * @param {object|null} data  S2 导出的碎块数据；为 null/空则按整块处理
 * @param {{size?:number, copies?:number}} opts
 */
export function buildPiecesMesh(ing, data, opts = {}) {
  const base = Math.max(ing.size[0], ing.size[1]);
  const size = opts.size != null ? opts.size : base * 0.92;
  const count = data && data.count ? data.count : 1;
  const copies = opts.copies != null
    ? opts.copies
    : Math.max(1, Math.min(4, Math.round(12 / count)));

  const rawT = data && data.thickness ? data.thickness : Math.max(0.05, ing.thickness / base);
  const thickness = Math.max(0.008, rawT * size);
  const spread = size * (count > 1 ? 0.30 : 0.10);

  const src = data && data.polys && data.polys.length
    ? data.polys
    : [normalized(shapeFor(ing))];

  const geos = [];
  for (const poly of src) {
    for (let c = 0; c < copies; c++) geos.push(makeChunk(poly, size, thickness, spread));
  }

  const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  if (geos.length > 1) for (const g of geos) g.dispose();

  const mesh = new THREE.Mesh(merged, materialFor(ing));
  mesh.userData.ing = ing;
  mesh.renderOrder = 3;
  // 描边：白色的鱼片、豆腐皮放在白瓷盘上不然会糊成一片
  attachOutline(mesh);
  return mesh;
}

/** 换形状时用：释放旧几何 */
export function disposePieces(mesh) {
  if (!mesh) return;
  if (mesh.geometry) mesh.geometry.dispose();
  mesh.removeFromParent();
}
