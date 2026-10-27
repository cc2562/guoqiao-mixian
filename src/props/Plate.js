/**
 * 四个盘子：Lathe 旋转体 + 程序化花纹贴图。
 */
import * as THREE from 'three';
import { toon, canvasTexture, blobShadow } from '../render/Toon.js';
import { attachOutline } from '../render/Outline.js';
import { PLATES } from '../data/recipes.js';

function patternTexture(kind, meta) {
  if (kind === 'plain') return null;

  return canvasTexture(256, 256, (g, w, h) => {
    const cx = w / 2, cy = h / 2;

    if (kind === 'blossom') {
      g.fillStyle = meta.color;
      g.fillRect(0, 0, w, h);
      g.strokeStyle = meta.rim;
      g.fillStyle = meta.rim;
      // 外圈回纹
      g.lineWidth = 3;
      g.beginPath();
      g.arc(cx, cy, w * 0.42, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, w * 0.38, 0, Math.PI * 2);
      g.stroke();
      // 花
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rx = cx + Math.cos(a) * w * 0.3;
        const ry = cy + Math.sin(a) * w * 0.3;
        for (let p = 0; p < 5; p++) {
          const pa = (p / 5) * Math.PI * 2 + a;
          g.beginPath();
          g.ellipse(rx + Math.cos(pa) * 9, ry + Math.sin(pa) * 9, 8, 5, pa, 0, Math.PI * 2);
          g.fill();
        }
        g.beginPath();
        g.arc(rx, ry, 3.4, 0, Math.PI * 2);
        g.fillStyle = '#ffffff';
        g.fill();
        g.fillStyle = meta.rim;
      }
      // 中心小枝
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(cx, cy, w * 0.14, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, 7, 0, Math.PI * 2);
      g.fill();
      return;
    }

    if (kind === 'speck') {
      g.fillStyle = meta.color;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const v = Math.random();
        g.fillStyle = v > 0.5
          ? `rgba(255,240,220,${0.03 + Math.random() * 0.09})`
          : `rgba(0,0,0,${0.04 + Math.random() * 0.12})`;
        g.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
      }
      return;
    }

    if (kind === 'weave') {
      g.fillStyle = meta.color;
      g.fillRect(0, 0, w, h);
      const cell = 18;
      for (let y = 0; y < h; y += cell) {
        for (let x = 0; x < w; x += cell) {
          const odd = ((x / cell) + (y / cell)) % 2 === 0;
          g.fillStyle = odd ? 'rgba(120,88,40,0.30)' : 'rgba(255,240,205,0.34)';
          g.fillRect(x + 1, y + 1, cell - 2, cell - 2);
          g.strokeStyle = 'rgba(90,64,28,0.22)';
          g.lineWidth = 1.4;
          g.beginPath();
          if (odd) { g.moveTo(x, y + cell); g.lineTo(x + cell, y); }
          else { g.moveTo(x, y); g.lineTo(x + cell, y + cell); }
          g.stroke();
        }
      }
      return;
    }

    g.fillStyle = meta.color;
    g.fillRect(0, 0, w, h);
  }, { repeat: [1, 1] });
}

function profile(scale = 1) {
  const pts = [
    [0.001, 0.000], [0.20, 0.000], [0.30, 0.004], [0.36, 0.016],
    [0.42, 0.042], [0.50, 0.072], [0.555, 0.096], [0.585, 0.112],
    [0.60, 0.128], [0.598, 0.140], [0.565, 0.126], [0.53, 0.104],
    [0.44, 0.070], [0.34, 0.038], [0.20, 0.028], [0.001, 0.026],
  ];
  return pts.map(([x, y]) => new THREE.Vector2(x * scale, y * scale));
}

/** 盘子整体缩放：0.78 → 直径约 0.94，手机上四个排开也够大 */
const PLATE_SCALE = 0.78;

export function createPlate(meta) {
  const g = new THREE.Group();
  const tex = patternTexture(meta.pattern, meta);
  // DoubleSide：盘子是回转体，俯视时看到的是内壁背面，单面会"漏"成一个圆环
  const mat = toon(meta.color, { map: tex || null, side: THREE.DoubleSide });

  const geo = new THREE.LatheGeometry(profile(PLATE_SCALE), 36);
  const mesh = new THREE.Mesh(geo, mat);
  g.add(mesh);
  attachOutline(mesh);

  // 盘沿描金/描色
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.60 * PLATE_SCALE, 0.012 * PLATE_SCALE, 6, 36),
    toon(meta.rim)
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.134 * PLATE_SCALE;
  g.add(rim);

  const sh = blobShadow(1.2 * PLATE_SCALE + 0.35, 1.2 * PLATE_SCALE + 0.35, 0.32);
  sh.position.y = 0.004;
  g.add(sh);

  let highlight = 0;

  return {
    group: g,
    mesh,
    meta,
    radius: 0.6 * PLATE_SCALE,
    topY: 0.135 * PLATE_SCALE,

    setHighlight(on) {
      highlight = on ? 1 : 0;
      mat.emissive = new THREE.Color(on ? 0x5a4320 : 0x000000);
    },

    /** 选中后轻微弹一下 */
    pop() {
      const s = g.scale.x;
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / 420);
        const e = 1 + Math.sin(k * Math.PI) * 0.08;
        g.scale.setScalar(s * e);
        if (k < 1) requestAnimationFrame(step);
        else g.scale.setScalar(s);
      };
      step();
    },

    update() { /* 保留 */ },
  };
}

export function allPlateMeta() {
  return PLATES;
}
