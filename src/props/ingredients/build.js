/**
 * 轮廓 → 3D 几何 / 程序化纹理 / 卡片缩略图。
 * 所有食材都用同一套通道：2D 多边形挤出成薄片，因此"切"可以纯粹在 2D 里做。
 */
import * as THREE from 'three';
import { canvasTexture } from '../../render/Toon.js';
import { normalizedShape } from './shapes.js';

/** 多边形 → THREE.Shape */
export function polygonShape(poly) {
  const s = new THREE.Shape();
  s.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) s.lineTo(poly[i].x, poly[i].y);
  s.closePath();
  return s;
}

/**
 * 挤出成薄片，并压平成"躺在砧板上"的朝向（+Y 朝上）。
 * 压平后：多边形 (px,py) → 世界 (px, 高度, -py)
 */
export function extrude(poly, thickness, bevel = true) {
  const geo = new THREE.ExtrudeGeometry(polygonShape(poly), {
    depth: thickness,
    bevelEnabled: bevel,
    bevelThickness: Math.min(thickness * 0.35, 0.012),
    bevelSize: 0.006,
    bevelSegments: 1,
    curveSegments: 1,
    steps: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

/* ---------------- 确定性随机（贴图/图标每次打开都一样） ---------------- */
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngOf(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------------- 程序化纹理（乘在材质色上） ---------------- */
const texCache = new Map();

function texFor(kind) {
  if (texCache.has(kind)) return texCache.get(kind);
  let tex = null;

  const rnd = rngOf(hashSeed('tex:' + kind));
  const make = (draw, repeat = [3, 3]) => canvasTexture(256, 256, draw, { repeat });
  const white = (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); };

  switch (kind) {
    case 'oil':
      tex = make((g, w, h) => {
        white(g, w, h);
        for (let i = 0; i < 34; i++) {
          g.strokeStyle = `rgba(186,138,138,${0.12 + rnd() * 0.18})`;
          g.lineWidth = 0.8 + rnd() * 2.4;
          g.beginPath();
          let x = rnd() * w, y = rnd() * h;
          g.moveTo(x, y);
          for (let k = 0; k < 4; k++) {
            x += (rnd() - 0.5) * 52;
            y += (rnd() - 0.5) * 44;
            g.lineTo(x, y);
          }
          g.stroke();
        }
      });
      break;

    case 'spots':
      tex = make((g, w, h) => {
        white(g, w, h);
        for (let i = 0; i < 90; i++) {
          g.fillStyle = `rgba(168,128,98,${0.12 + rnd() * 0.24})`;
          const r = 1.4 + rnd() * 4.2;
          g.beginPath();
          g.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
          g.fill();
        }
      });
      break;

    case 'fiber':
      tex = make((g, w, h) => {
        white(g, w, h);
        for (let i = 0; i < 30; i++) {
          g.strokeStyle = `rgba(172,138,100,${0.09 + rnd() * 0.14})`;
          g.lineWidth = 0.8 + rnd() * 1.6;
          const y = rnd() * h;
          g.beginPath();
          g.moveTo(0, y);
          g.bezierCurveTo(w * 0.3, y + 9, w * 0.7, y - 9, w, y + 2);
          g.stroke();
        }
      });
      break;

    case 'wrinkle':
      tex = make((g, w, h) => {
        white(g, w, h);
        for (let i = 0; i < 20; i++) {
          g.strokeStyle = `rgba(118,94,70,${0.10 + rnd() * 0.14})`;
          g.lineWidth = 1.4 + rnd() * 2.2;
          g.beginPath();
          const y = (i / 20) * h + rnd() * 8;
          g.moveTo(0, y);
          for (let x = 0; x <= w; x += 14) {
            g.lineTo(x, y + Math.sin(x * 0.07 + i) * 6);
          }
          g.stroke();
        }
      });
      break;

    case 'crisp':
      tex = make((g, w, h) => {
        white(g, w, h);
        for (let i = 0; i < 120; i++) {
          g.fillStyle = `rgba(198,146,68,${0.12 + rnd() * 0.22})`;
          const r = 1.2 + rnd() * 4;
          g.beginPath();
          g.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
          g.fill();
        }
      });
      break;

    // 鱼片 / 火腿：大理石与肌理
    case 'marble':
      tex = make((g, w, h) => {
        white(g, w, h);
        for (let i = 0; i < 16; i++) {
          g.strokeStyle = `rgba(198,176,160,${0.16 + rnd() * 0.2})`;
          g.lineWidth = 1 + rnd() * 3.4;
          g.beginPath();
          let x = rnd() * w, y = rnd() * h;
          g.moveTo(x, y);
          for (let k = 0; k < 5; k++) {
            x += (rnd() - 0.2) * 60;
            y += (rnd() - 0.5) * 50;
            g.lineTo(x, y);
          }
          g.stroke();
        }
      }, [2, 2]);
      break;

    case 'streak':
      tex = make((g, w, h) => {
        white(g, w, h);
        for (let i = 0; i < 26; i++) {
          g.strokeStyle = `rgba(190,140,140,${0.12 + rnd() * 0.18})`;
          g.lineWidth = 1.4 + rnd() * 3.2;
          const y = (i / 26) * h;
          g.beginPath();
          g.moveTo(-10, y);
          g.bezierCurveTo(w * 0.35, y + 14, w * 0.6, y - 12, w + 10, y + 4);
          g.stroke();
        }
      }, [2, 2]);
      break;

    case 'crust':
      tex = make((g, w, h) => {
        white(g, w, h);
        for (let i = 0; i < 160; i++) {
          const r = 1.6 + rnd() * 5.5;
          g.fillStyle = `rgba(196,136,52,${0.16 + rnd() * 0.26})`;
          g.beginPath();
          g.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = `rgba(255,232,190,${0.14 + rnd() * 0.2})`;
          g.beginPath();
          g.arc(rnd() * w, rnd() * h, r * 0.45, 0, Math.PI * 2);
          g.fill();
        }
      }, [2, 2]);
      break;

    case 'speckle':
      tex = make((g, w, h) => {
        white(g, w, h);
        for (let i = 0; i < 70; i++) {
          g.fillStyle = `rgba(150,90,90,${0.10 + rnd() * 0.18})`;
          const r = 0.8 + rnd() * 2.4;
          g.beginPath();
          g.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
          g.fill();
        }
        for (let i = 0; i < 6; i++) {
          g.strokeStyle = `rgba(240,220,220,${0.2 + rnd() * 0.2})`;
          g.lineWidth = 2 + rnd() * 3;
          const y = rnd() * h;
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(w, y + (rnd() - 0.5) * 30);
          g.stroke();
        }
      }, [2, 2]);
      break;

    // 菌盖：从中心放射的菌褶
    case 'gill':
      tex = make((g, w, h) => {
        white(g, w, h);
        const cx = w * 0.5, cy = h * 0.5;
        for (let i = 0; i < 34; i++) {
          const a = (i / 34) * Math.PI * 2;
          g.strokeStyle = `rgba(150,110,74,${0.14 + rnd() * 0.16})`;
          g.lineWidth = 1.6 + rnd() * 2.6;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * w * 0.10, cy + Math.sin(a) * h * 0.10);
          g.lineTo(cx + Math.cos(a) * w * 0.52, cy + Math.sin(a) * h * 0.52);
          g.stroke();
        }
        g.strokeStyle = 'rgba(150,110,74,0.22)';
        g.lineWidth = 5;
        g.beginPath();
        g.arc(cx, cy, w * 0.12, 0, Math.PI * 2);
        g.stroke();
      }, [1, 1]);
      break;

    // 叶脉 / 笋纤维
    case 'vein':
      tex = make((g, w, h) => {
        white(g, w, h);
        g.strokeStyle = 'rgba(160,138,92,0.22)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(w * 0.5, 0);
        g.lineTo(w * 0.5, h);
        g.stroke();
        for (let i = 0; i < 14; i++) {
          const y = (i / 14) * h;
          g.strokeStyle = `rgba(160,138,92,${0.10 + rnd() * 0.12})`;
          g.lineWidth = 1.4 + rnd() * 1.8;
          g.beginPath();
          g.moveTo(w * 0.5, y);
          g.quadraticCurveTo(w * (0.5 + 0.2), y + 12, w * (0.5 + 0.42), y + 26);
          g.moveTo(w * 0.5, y);
          g.quadraticCurveTo(w * (0.5 - 0.2), y + 12, w * (0.5 - 0.42), y + 26);
          g.stroke();
        }
      }, [1, 1]);
      break;

    default:
      tex = null;
  }

  texCache.set(kind, tex);
  return tex;
}

export const patternTexture = texFor;

/* ---------------- 卡片缩略图（2D 绘制，与 3D 轮廓同源） ---------------- */

function tracePath(pts) {
  const path = new Path2D();
  path.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
  path.closePath();
  return path;
}

/** 按 kind 叠一层"看得出是什么东西"的细节 */
function drawKindDetail(g, ing, path, size, rnd) {
  const acc = ing.accent || '#ffffff';
  const kind = ing.kind || 'slab';

  g.save();
  g.clip(path);

  if (kind === 'slab' || kind === 'roll') {
    // 肌理条纹：沿长轴铺几条柔和的亮/暗线
    const n = kind === 'roll' ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.7) / (n + 0.4);
      const y = size * t;
      g.strokeStyle = i % 2 ? acc : 'rgba(255,255,255,0.55)';
      g.globalAlpha = 0.35 + rnd() * 0.25;
      g.lineWidth = size * (0.018 + rnd() * 0.02);
      g.beginPath();
      g.moveTo(size * 0.1, y + size * 0.04);
      g.bezierCurveTo(size * 0.36, y - size * 0.05, size * 0.66, y + size * 0.06, size * 0.9, y);
      g.stroke();
    }
    if (kind === 'roll') {
      // 两圈肠衣压痕
      g.globalAlpha = 0.5;
      g.strokeStyle = 'rgba(120,60,60,0.4)';
      g.lineWidth = size * 0.014;
      for (const t of [0.32, 0.68]) {
        g.beginPath();
        g.ellipse(size * t, size * 0.5, size * 0.035, size * 0.16, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
  } else if (kind === 'chunk') {
    // 颗粒 / 炸衣
    const n = ing.id === 'surou' ? 22 : 10;
    for (let i = 0; i < n; i++) {
      const x = size * (0.16 + rnd() * 0.68);
      const y = size * (0.16 + rnd() * 0.68);
      const r = size * (0.018 + rnd() * 0.032);
      g.globalAlpha = 0.5 + rnd() * 0.35;
      g.fillStyle = rnd() > 0.45 ? acc : 'rgba(160,100,40,0.7)';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
  } else if (kind === 'cap') {
    // 伞盖弧 + 菌褶
    g.globalAlpha = 0.85;
    g.fillStyle = acc;
    g.beginPath();
    g.ellipse(size * 0.5, size * 0.52, size * 0.34, size * 0.28, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.globalAlpha = 0.4;
    g.strokeStyle = 'rgba(120,86,58,0.65)';
    g.lineWidth = size * 0.012;
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (0.06 + (i / 10) * 0.88);
      g.beginPath();
      g.moveTo(size * 0.5, size * 0.52);
      g.lineTo(size * 0.5 + Math.cos(a) * size * 0.3, size * 0.52 + Math.sin(a) * size * 0.24);
      g.stroke();
    }
  } else if (kind === 'ball') {
    // 球形高光 + 底部环影
    g.globalAlpha = 0.75;
    const hl = g.createRadialGradient(size * 0.38, size * 0.33, size * 0.02, size * 0.42, size * 0.38, size * 0.36);
    hl.addColorStop(0, 'rgba(255,255,255,0.95)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl;
    g.fillRect(0, 0, size, size);
    g.globalAlpha = 0.35;
    g.strokeStyle = acc;
    g.lineWidth = size * 0.02;
    g.beginPath();
    g.arc(size * 0.5, size * 0.55, size * 0.3, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  } else if (kind === 'frond') {
    // 中脉 + 支脉
    g.globalAlpha = 0.5;
    g.strokeStyle = acc;
    g.lineWidth = size * 0.016;
    g.beginPath();
    g.moveTo(size * 0.5, size * 0.14);
    g.lineTo(size * 0.5, size * 0.86);
    g.stroke();
    g.lineWidth = size * 0.01;
    for (let i = 1; i <= 4; i++) {
      const y = size * (0.2 + i * 0.15);
      g.beginPath();
      g.moveTo(size * 0.5, y);
      g.quadraticCurveTo(size * 0.34, y + size * 0.03, size * 0.24, y + size * 0.09);
      g.moveTo(size * 0.5, y);
      g.quadraticCurveTo(size * 0.66, y + size * 0.03, size * 0.76, y + size * 0.09);
      g.stroke();
    }
  }

  g.restore();
}

export function iconDataURL(ing, size = 128) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const rnd = rngOf(hashSeed('icon:' + ing.id));
  const pts = normalizedShape(ing, 0.13).map((p) => ({ x: p.x * size, y: p.y * size }));
  const path = tracePath(pts);

  // 投影
  g.save();
  g.translate(0, size * 0.05);
  g.fillStyle = 'rgba(110,72,42,0.20)';
  g.filter = `blur(${Math.max(2, size * 0.025)}px)`;
  g.fill(path);
  g.restore();

  // 主体：上亮下暗的立体渐变
  const grd = g.createLinearGradient(0, size * 0.12, 0, size * 0.9);
  grd.addColorStop(0, ing.accent || '#ffffff');
  grd.addColorStop(0.42, ing.color);
  grd.addColorStop(1, shade(ing.color, -0.14));
  g.fillStyle = grd;
  g.fill(path);

  // 纹理相乘
  const tex = texFor(ing.tex);
  if (tex && tex.image) {
    g.save();
    g.globalAlpha = ing.tex === 'plain' ? 0.28 : 0.6;
    g.globalCompositeOperation = 'multiply';
    g.drawImage(tex.image, 0, 0, size, size);
    g.restore();
  }

  drawKindDetail(g, ing, path, size, rnd);

  // 内阴影：沿轮廓压暗一圈，材质才有厚度
  g.save();
  g.clip(path);
  g.strokeStyle = 'rgba(92,56,32,0.28)';
  g.lineWidth = size * 0.07;
  g.stroke(path);
  // 顶部高光
  const hl = g.createLinearGradient(0, size * 0.1, 0, size * 0.56);
  hl.addColorStop(0, 'rgba(255,255,255,0.5)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.fillRect(0, 0, size, size);
  g.restore();

  // 外描边
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(58,36,24,0.5)';
  g.lineWidth = Math.max(1.6, size * 0.018);
  g.stroke(path);

  return cv.toDataURL('image/png');
}

/** #rrggbb 变亮/变暗 */
export function shade(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  r = f(r); g = f(g); b = f(b);
  return `rgb(${r},${g},${b})`;
}
