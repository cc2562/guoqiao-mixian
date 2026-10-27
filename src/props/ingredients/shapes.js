/**
 * 14 种食材的 2D 轮廓（俯视）。
 * 全部返回「逆时针」的点列，坐标原点在中心，单位=世界单位。
 * 形状刻意做得"近凸"：这样用一条直线切开永远只产生两块，
 * 任意方向切都不会出现怪异的重叠面。
 */

const TAU = Math.PI * 2;

function push(pts, x, y) {
  pts.push({ x, y });
  return pts;
}

export function roundRect(w, h, r = 0.06, seg = 4) {
  const hw = w / 2, hh = h / 2;
  r = Math.min(r, hw * 0.85, hh * 0.85);
  const pts = [];
  const corners = [
    [hw - r, hh - r, 0],
    [-hw + r, hh - r, Math.PI / 2],
    [-hw + r, -hh + r, Math.PI],
    [hw - r, -hh + r, Math.PI * 1.5],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      push(pts, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
  }
  return pts;
}

export function ellipse(rx, ry, seg = 26) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU;
    push(pts, Math.cos(a) * rx, Math.sin(a) * ry);
  }
  return pts;
}

export function circle(r, seg = 26) {
  return ellipse(r, r, seg);
}

export function capsule(w, h, seg = 9) {
  const r = h / 2;
  const x0 = Math.max(0, w / 2 - r);
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const a = -Math.PI / 2 + (i / seg) * Math.PI;
    push(pts, x0 + Math.cos(a) * r, Math.sin(a) * r);
  }
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI / 2 + (i / seg) * Math.PI;
    push(pts, -x0 + Math.cos(a) * r, Math.sin(a) * r);
  }
  return pts;
}

/** 波浪长条（豆腐皮 / 木耳那种卷边感） */
export function wavy(w, h, amp = 0.055, waves = 2.6, seg = 22) {
  const pts = [];
  const hw = w / 2, hh = h / 2;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const x = -hw + w * t;
    const y = hh + Math.sin(t * TAU * waves) * amp;
    push(pts, x, y);
  }
  for (let i = seg; i >= 0; i--) {
    const t = i / seg;
    const x = -hw + w * t;
    const y = -hh + Math.sin(t * TAU * waves + Math.PI * 0.8) * amp;
    push(pts, x, y);
  }
  return pts;
}

/** 不规则肉块（鸡肉） */
export function blob(w, h, seed = 1.7, seg = 30) {
  const pts = [];
  const rx = w / 2, ry = h / 2;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU;
    const k = 1
      + 0.09 * Math.sin(a * 3 + seed)
      + 0.05 * Math.sin(a * 5 - seed * 2.1)
      + 0.03 * Math.sin(a * 7 + seed * 0.7);
    push(pts, Math.cos(a) * rx * k, Math.sin(a) * ry * k);
  }
  return pts;
}

/** 花瓣形（玉兰片） */
export function flower(r, petals = 5, depth = 0.09, seg = 40) {
  const pts = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU;
    const k = 1 + depth * Math.cos(a * petals);
    push(pts, Math.cos(a) * r * k, Math.sin(a) * r * k);
  }
  return pts;
}

/** 三裂叶（香菜） */
export function leaf(w, h) {
  const pts = [];
  const rx = w / 2, ry = h / 2;
  const seg = 42;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU;
    let k = 1 + 0.17 * Math.cos(a * 3) + 0.05 * Math.cos(a * 6);
    // 底部收个细柄
    if (Math.sin(a) < -0.86) k *= 0.62;
    push(pts, Math.cos(a) * rx * k, Math.sin(a) * ry * k);
  }
  return pts;
}

/** 蘑菇（圆片底部带一个缺口，像切掉菌柄的断面） */
export function mushroom(w, h) {
  const pts = [];
  const rx = w / 2, ry = h / 2;
  const seg = 36;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * TAU;
    let k = 1;
    const s = Math.sin(a);
    if (s < -0.75) k *= 0.82;
    push(pts, Math.cos(a) * rx * k, s * ry * k);
  }
  // 底部小缺口
  return pts;
}

/** 按食材定义生成轮廓（带缓存） */
const cache = new Map();

export function shapeFor(ing) {
  if (cache.has(ing.id)) return cache.get(ing.id);
  const [w, h] = ing.size;
  let pts;
  switch (ing.shape) {
    case 'roundRect': pts = roundRect(w, h, Math.min(w, h) * 0.22, 4); break;
    case 'ellipse': pts = ellipse(w / 2, h / 2, 26); break;
    case 'round': pts = circle(w / 2, 24); break;
    case 'capsule': pts = capsule(w, h, 8); break;
    case 'wavy': pts = wavy(w, h, 0.05, 2.4, 18); break;
    case 'blob': pts = blob(w, h, 1.9, 28); break;
    case 'flower': pts = flower(w / 2, 5, 0.085, 36); break;
    case 'leaf': pts = leaf(w, h); break;
    case 'mushroom': pts = mushroom(w, h); break;
    default: pts = roundRect(w, h, 0.05, 3);
  }
  cache.set(ing.id, pts);
  return pts;
}

/** 给缩略图用：返回归一化到 0..1 的点列 */
export function normalizedShape(ing, pad = 0.06) {
  const pts = shapeFor(ing);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX || 1, h = maxY - minY || 1;
  const s = Math.max(w, h) * (1 + pad * 2);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return pts.map((p) => ({
    x: 0.5 + (p.x - cx) / s,
    y: 0.5 - (p.y - cy) / s,   // 画布 y 向下
  }));
}
