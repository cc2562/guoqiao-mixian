/**
 * 大碗：4 款碗型共用同一套回转体轮廓，只换釉色 / 纹样 / 口沿颜色。
 * 汤碗与米线碗是同一套参数，各选一次。
 */
import * as THREE from 'three';
import { toon, blobShadow, canvasTexture } from '../render/Toon.js';
import { createSoup } from '../render/Soup.js';
import { attachOutline } from '../render/Outline.js';
import { COLORS } from '../data/config.js';
import { BOWLS } from '../data/recipes.js';
import { tween } from '../core/Tween.js';

export const BOWL_SOUP_Y = 0.40;
const SOUP_BOTTOM = 0.115;

const PROFILE = [
  [0.001, 0.000], [0.30, 0.004], [0.40, 0.020], [0.50, 0.070],
  [0.62, 0.170], [0.71, 0.290], [0.765, 0.400], [0.785, 0.455],
  [0.795, 0.478], [0.775, 0.492], [0.742, 0.462], [0.722, 0.380],
  [0.640, 0.250], [0.500, 0.140], [0.360, 0.090], [0.001, 0.075],
];

/** 碗身釉带：按纹样画不同花样 */
function bowlBand(pattern, meta) {
  return canvasTexture(256, 128, (gx, w, h) => {
    gx.fillStyle = meta.color;
    gx.fillRect(0, 0, w, h);

    const rim = meta.rim;

    if (pattern === 'blossom') {
      gx.fillStyle = rim;
      gx.fillRect(0, h * 0.06, w, h * 0.05);
      gx.fillRect(0, h * 0.16, w, h * 0.03);
      for (let i = 0; i < 8; i++) {
        const cx = (i + 0.5) * (w / 8);
        gx.beginPath();
        gx.arc(cx, h * 0.36, 7, 0, Math.PI * 2);
        gx.fill();
        gx.strokeStyle = rim;
        gx.globalAlpha = 0.55;
        gx.lineWidth = 2;
        gx.beginPath();
        gx.arc(cx, h * 0.36, 12, 0, Math.PI * 2);
        gx.stroke();
        gx.globalAlpha = 1;
      }
      gx.globalAlpha = 0.7;
      gx.fillStyle = rim;
      gx.fillRect(0, h * 0.52, w, h * 0.02);
      gx.globalAlpha = 1;
    } else if (pattern === 'speck') {
      gx.fillStyle = 'rgba(255,255,255,0.10)';
      for (let i = 0; i < 420; i++) {
        const r = 0.6 + Math.random() * 1.8;
        gx.beginPath();
        gx.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
        gx.fill();
      }
      gx.fillStyle = 'rgba(0,0,0,0.22)';
      gx.fillRect(0, h * 0.08, w, h * 0.03);
      gx.fillRect(0, h * 0.5, w, h * 0.02);
    } else if (pattern === 'bamboo') {
      // 竹节横纹 + 两道细青线
      gx.fillStyle = 'rgba(125,154,95,0.30)';
      for (let i = 0; i < 5; i++) gx.fillRect(0, h * (0.1 + i * 0.16), w, h * 0.022);
      gx.fillStyle = rim;
      gx.fillRect(0, h * 0.05, w, h * 0.025);
      gx.fillRect(0, h * 0.55, w, h * 0.014);
    } else {
      // 素白：只留一道极淡釉线
      gx.fillStyle = rim;
      gx.globalAlpha = 0.5;
      gx.fillRect(0, h * 0.08, w, h * 0.018);
      gx.globalAlpha = 1;
    }
  }, { repeat: [1, 1] });
}

export function createBowl(meta = null) {
  const m = meta || BOWLS[0];
  const g = new THREE.Group();

  const prof = PROFILE.map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(prof, 44);

  const body = new THREE.Mesh(geo, toon(0xffffff, { map: bowlBand(m.pattern, m) }));
  g.add(body);
  attachOutline(body);

  // 口沿
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.786, 0.012, 6, 44), toon(m.rim));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.485;
  g.add(rim);

  // 汤面
  const soupSurface = createSoup({ radius: 0.70, colA: 0xf6c869, colB: 0xdd9433 });
  const soup = soupSurface.mesh;
  soup.position.y = BOWL_SOUP_Y;
  g.add(soup);

  // 油花
  const oilTex = canvasTexture(128, 128, (gx, w, h) => {
    gx.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const r = 2 + Math.random() * 7;
      const grd = gx.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,240,190,0.85)');
      grd.addColorStop(1, 'rgba(255,220,150,0)');
      gx.fillStyle = grd;
      gx.beginPath();
      gx.arc(x, y, r, 0, Math.PI * 2);
      gx.fill();
    }
  });
  const oil = new THREE.Mesh(
    new THREE.CircleGeometry(0.69, 32),
    new THREE.MeshBasicMaterial({
      map: oilTex, transparent: true, opacity: 0.45, depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  oil.rotation.x = -Math.PI / 2;
  oil.position.y = BOWL_SOUP_Y + 0.004;
  oil.renderOrder = 6;
  g.add(oil);

  const sh = blobShadow(2.0, 2.0, 0.4);
  sh.position.y = 0.004;
  g.add(sh);

  let richness = 1;

  return {
    group: g,
    body,
    soup,
    meta: m,
    soupY: BOWL_SOUP_Y,
    radius: 0.70,
    topY: 0.492,

    /** 汤色随进度变浓 */
    setRichness(t) {
      richness = t;
      const a = new THREE.Color(0xf9dc9c).lerp(new THREE.Color(COLORS.soup), 0.25 + t * 0.55);
      const b = new THREE.Color(0xf2bd63).lerp(new THREE.Color(COLORS.soupDeep), 0.2 + t * 0.45);
      soupSurface.setColors(a, b);
      oil.material.opacity = 0.22 + t * 0.3;
    },

    /** 汤量 0~1：倒汤动画用 */
    setSoupLevel(p) {
      const k = Math.max(0, Math.min(1, p));
      soup.visible = k > 0.02;
      soup.position.y = SOUP_BOTTOM + (BOWL_SOUP_Y - SOUP_BOTTOM) * k;
      soup.scale.setScalar(0.5 + 0.5 * k);
      oil.visible = k > 0.9;
      oil.position.y = soup.position.y + 0.004;
      if (k > 0.9) oil.material.opacity = 0.22 + richness * 0.3;
    },

    /** 落料时的一圈涟漪（局部坐标） */
    ripple(x, z, strength = 1) {
      soupSurface.ripple(x, z, strength);
    },

    setHighlight(on) {
      const m = body.material;
      m.emissive = new THREE.Color(on ? 0x7a4a0e : 0x000000);
      m.emissiveIntensity = on ? 0.6 : 0;
      m.needsUpdate = true;
    },

    pop() {
      g.scale.setScalar(0.9);
      tween({
        dur: 340,
        ease: 'outBack',
        update: (e) => g.scale.setScalar(0.9 + 0.1 * e),
      });
    },

    update(dt) {
      soupSurface.update(dt);
    },
  };
}
