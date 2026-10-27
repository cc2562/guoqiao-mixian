/**
 * 格子盘：装切好的配菜。三款形状，各自分格。
 *   circle  圆形八格（4 道径墙 + 1 圈环）
 *   square  方形九宫格
 *   bridge  桥形长盘（中间拱桥 + 2 道横墙）
 *
 * 落点是自由的（不吸附），cells 只用于「落点环靠近哪一格就轻微亮一下」。
 */
import * as THREE from 'three';
import { toon, blobShadow } from '../render/Toon.js';
import { attachOutline } from '../render/Outline.js';
import { patternTexture } from './ingredients/build.js';
import { tween } from '../core/Tween.js';

const TRAY_TOP = 0.062;

/* ---------------- 轮廓 ---------------- */

function circlePts(R, seg = 44) {
  const out = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    out.push({ x: Math.cos(a) * R, y: Math.sin(a) * R });
  }
  return out;
}

function roundRectPts(w, d, r, seg = 5) {
  const hw = w / 2, hh = d / 2;
  r = Math.min(r, hw * 0.9, hh * 0.9);
  const out = [];
  const corners = [
    [hw - r, hh - r, 0],
    [-hw + r, hh - r, Math.PI / 2],
    [-hw + r, -hh + r, Math.PI],
    [hw - r, -hh + r, Math.PI * 1.5],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
  }
  return out;
}

function outlineFor(meta) {
  const R = meta.size / 2;
  if (meta.shape === 'square') return roundRectPts(R * 1.9, R * 1.9, R * 0.34);
  if (meta.shape === 'bridge') return roundRectPts(R * 2.2, R * 1.1, R * 0.42);
  return circlePts(R);
}

function shapeOf(pts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i].x, pts[i].y);
  s.closePath();
  return s;
}

/* ---------------- 分格 ---------------- */

function cellsFor(meta) {
  const R = meta.size / 2;
  const cells = [];

  if (meta.shape === 'square') {
    // 外沿半径 0.95R 三等分 → 格心在 ±(2/3)·0.95R
    const g = R * 0.633;
    for (let ix = -1; ix <= 1; ix++) {
      for (let iz = -1; iz <= 1; iz++) {
        cells.push({ x: ix * g, z: iz * g, r: R * 0.26 });
      }
    }
    return cells;
  }

  if (meta.shape === 'bridge') {
    // 桥形：中间一格 + 两道横墙外侧各两格
    cells.push({ x: 0, z: 0, r: R * 0.24 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        cells.push({ x: sx * R * 0.60, z: sz * R * 0.42, r: R * 0.20 });
      }
    }
    return cells;
  }

  // 圆盘：8 格，45° 均分（在分格环与盘沿之间）
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    cells.push({ x: Math.cos(a) * R * 0.70, z: Math.sin(a) * R * 0.70, r: R * 0.26 });
  }
  return cells;
}

/** 一道矮墙（薄板） */
function wallGeo(len, height, thick = 0.026) {
  return new THREE.BoxGeometry(len, height, thick);
}

export function createTray(meta) {
  const g = new THREE.Group();
  const pts = outlineFor(meta);
  const R = meta.size / 2;

  // 轮廓在 x/z 上的半宽 / 半深（局部单位，不含 group 缩放）——装盘页按它取景
  let halfW = 0, halfD = 0;
  for (const p of pts) {
    if (Math.abs(p.x) > halfW) halfW = Math.abs(p.x);
    if (Math.abs(p.y) > halfD) halfD = Math.abs(p.y);
  }

  // 底盘
  const baseGeo = new THREE.ExtrudeGeometry(shapeOf(pts), {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.012,
    bevelSegments: 1,
    curveSegments: 1,
    steps: 1,
  });
  baseGeo.rotateX(-Math.PI / 2);

  const mat = toon(meta.color, {
    map: patternTexture(meta.pattern),
    side: THREE.DoubleSide,
  });
  const base = new THREE.Mesh(baseGeo, mat);
  base.position.y = 0.012;
  g.add(base);
  attachOutline(base);

  // 外沿
  const curve = new THREE.CatmullRomCurve3(
    pts.map((p) => new THREE.Vector3(p.x, TRAY_TOP - 0.006, -p.y)),
    true
  );
  const rim = new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(60, pts.length), 0.017, 6, true),
    toon(meta.rim)
  );
  rim.renderOrder = 3;
  g.add(rim);

  // 分格墙
  const wallMat = toon(meta.rim);
  const walls = [];
  const h = 0.042;

  if (meta.shape === 'square') {
    // 3×3：两道横墙（沿 X，落在 z=±d）+ 两道竖墙（沿 Z，落在 x=±d）
    const len = R * 1.9;
    const hw = len / 2;
    for (const t of [-1 / 3, 1 / 3]) {
      const a = wallGeo(len, h, 0.024);
      a.translate(0, TRAY_TOP + h * 0.28, t * hw);
      const b = wallGeo(0.024, h, len);
      b.translate(t * hw, TRAY_TOP + h * 0.28, 0);
      walls.push(a, b);
    }
  } else if (meta.shape === 'bridge') {
    for (const t of [-0.55, 0.55]) {
      const a = wallGeo(R * 2.1, h, 0.024);
      a.translate(0, TRAY_TOP + h * 0.28, t * R * 0.52);
      walls.push(a);
    }
    // 中间拱桥
    const arch = new THREE.CylinderGeometry(R * 0.30, R * 0.30, R * 0.62, 12, 1, false, 0, Math.PI);
    arch.rotateZ(Math.PI / 2);
    arch.rotateY(Math.PI / 2);
    arch.translate(0, TRAY_TOP + h * 0.1, 0);
    walls.push(arch);
  } else {
    // 4 道径墙
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI;
      const geo = wallGeo(R * 1.86, h, 0.024);
      geo.rotateY(a);
      geo.translate(0, TRAY_TOP + h * 0.28, 0);
      walls.push(geo);
    }
    // 一圈分格环
    const ring = new THREE.TorusGeometry(R * 0.44, 0.012, 5, 36);
    ring.rotateX(-Math.PI / 2);
    ring.translate(0, TRAY_TOP + h * 0.28, 0);
    walls.push(ring);
  }

  for (const geo of walls) {
    const m = new THREE.Mesh(geo, wallMat);
    m.renderOrder = 3;
    g.add(m);
  }

  // 落点高亮环（每格一个，平时透明）
  const cells = cellsFor(meta);
  const hltGeo = new THREE.RingGeometry(0.75, 1.0, 24);
  hltGeo.rotateX(-Math.PI / 2);
  const hlt = cells.map((c) => {
    const m = new THREE.Mesh(
      hltGeo,
      new THREE.MeshBasicMaterial({
        color: 0xfff3cf, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending,
      })
    );
    m.position.set(c.x, TRAY_TOP + 0.006, c.z);
    m.scale.setScalar(c.r);
    m.renderOrder = 7;
    m.visible = false;
    g.add(m);
    return m;
  });

  const sh = blobShadow(meta.size * 1.15, meta.size * 1.15, 0.34);
  sh.position.y = 0.004;
  g.add(sh);

  let hoverCell = -1;

  return {
    group: g,
    meta,
    topY: TRAY_TOP,
    radius: Math.max(R, meta.size * 0.55),
    halfW,
    halfD,
    cells,

    /** 离 (x,z) 最近的一格（超出范围返回 -1） */
    cellAt(x, z) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const d = Math.hypot(x - c.x, z - c.z);
        if (d < c.r && d < bestD) { bestD = d; best = i; }
      }
      return best;
    },

    setHoverCell(i) {
      if (i === hoverCell) return;
      if (hoverCell >= 0) {
        hlt[hoverCell].visible = false;
        hlt[hoverCell].material.opacity = 0;
      }
      hoverCell = i;
      if (i >= 0) {
        hlt[i].visible = true;
        hlt[i].material.opacity = 0.22;
      }
    },

    pop() {
      g.scale.setScalar(0.9);
      tween({
        dur: 340,
        ease: 'outBack',
        update: (e) => g.scale.setScalar(0.9 + 0.1 * e),
      });
    },

    dispose() {
      g.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
        }
      });
      g.removeFromParent();
    },
  };
}
