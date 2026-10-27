/**
 * 砂锅 + 燃气灶 + 卡通火焰 + 汤面涟漪。
 * 汤面用一个自定义 ShaderMaterial：6 个环形复用的涟漪槽位，零分配。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLORS, BROTH } from '../data/config.js';
import { toon, flat, canvasTexture, blobShadow } from '../render/Toon.js';
import { attachOutline } from '../render/Outline.js';
import { createSoup } from '../render/Soup.js';

const SOUP_R = 0.715;

function flameTexture() {
  return canvasTexture(128, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grd = g.createRadialGradient(w / 2, h * 0.74, 4, w / 2, h * 0.62, h * 0.52);
    grd.addColorStop(0, 'rgba(255,255,235,1)');
    grd.addColorStop(0.28, 'rgba(255,226,130,0.95)');
    grd.addColorStop(0.55, 'rgba(255,160,60,0.72)');
    grd.addColorStop(1, 'rgba(255,110,30,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(w * 0.5, h * 0.02);
    g.bezierCurveTo(w * 0.98, h * 0.42, w * 0.88, h * 0.98, w * 0.5, h * 0.99);
    g.bezierCurveTo(w * 0.12, h * 0.98, w * 0.02, h * 0.42, w * 0.5, h * 0.02);
    g.fill();
  });
}

export function createPot({ withBurner = true } = {}) {
  const g = new THREE.Group();

  /* ---------------- 灶 ---------------- */
  if (withBurner) {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.92, 1.0, 0.14, 28),
      toon(0x54504c)
    );
    base.position.y = 0.07;
    g.add(base);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.84, 0.05, 8, 32),
      toon(0xb9b3aa)
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.145;
    g.add(ring);

    // 三个支脚，把锅垫高一点，火焰才有地方冒出来
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.16, 0.12),
        toon(0x6b6660)
      );
      leg.position.set(Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5);
      leg.rotation.y = a;
      g.add(leg);
    }

    // 火焰：6 组交叉面片合并成 1 个 drawcall
    const flameTex = flameTexture();
    const parts = [];
    const count = 7;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      for (let j = 0; j < 2; j++) {
        const pg = new THREE.PlaneGeometry(0.34, 0.62, 1, 1);
        pg.rotateY(a + j * Math.PI / 2);
        pg.translate(Math.cos(a) * 0.66, 0.4, Math.sin(a) * 0.66);
        parts.push(pg);
      }
    }
    const flameGeo = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());

    const flameMat = new THREE.MeshBasicMaterial({
      map: flameTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.95,
      side: THREE.DoubleSide,
      color: new THREE.Color(0xffffff),
    });
    const flames = new THREE.Mesh(flameGeo, flameMat);
    flames.position.y = 0.02;
    flames.renderOrder = 8;
    flames.visible = false;
    g.add(flames);

    // 灶台暖光
    const glow = new THREE.PointLight(0xff9a3c, 0, 3.2, 2);
    glow.position.set(0, 0.35, 0);
    g.add(glow);

    g.userData.flames = flames;
    g.userData.glow = glow;
  }

  /* ---------------- 锅体 ---------------- */
  const prof = [
    [0.005, 0.000], [0.34, 0.000], [0.46, 0.022], [0.59, 0.090],
    [0.692, 0.200], [0.760, 0.335], [0.792, 0.470], [0.800, 0.545],
    [0.782, 0.572], [0.752, 0.556], [0.738, 0.462], [0.700, 0.285],
    [0.578, 0.100], [0.430, 0.045], [0.005, 0.038],
  ].map(([x, y]) => new THREE.Vector2(x, y));

  const bodyGeo = new THREE.LatheGeometry(prof, 40);
  const body = new THREE.Mesh(bodyGeo, toon(COLORS.clay));
  body.position.y = 0.26;
  g.add(body);
  attachOutline(body);

  // 锅沿亮边
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.788, 0.022, 8, 40),
    toon(COLORS.clayLight)
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.26 + 0.560;
  g.add(rim);

  // 双耳
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(
      new THREE.TorusGeometry(0.115, 0.042, 7, 16),
      toon(COLORS.clayLight)
    );
    ear.rotation.y = Math.PI / 2;
    ear.scale.set(1, 1, 0.75);
    ear.position.set(s * 0.775, 0.26 + 0.40, 0);
    g.add(ear);
  }

  /* ---------------- 汤面 ---------------- */
  const soupSurface = createSoup({
    radius: SOUP_R,
    colA: COLORS.soup,
    colB: COLORS.soupDeep,
  });
  const soup = soupSurface.mesh;
  soup.position.y = 0.26 + 0.455;
  g.add(soup);

  // 假阴影（锅在地上的一圈暗）
  const sh = blobShadow(2.3, 1.7, 0.4);
  sh.position.set(0, 0.006, 0);
  g.add(sh);

  /* ---------------- 状态 ---------------- */
  const state = {
    heat: 0,
    boil: 0,
    time: 0,
  };

  const surfaceCenter = new THREE.Vector3();

  const api = {
    group: g,
    body,
    soup,
    surfaceRadius: SOUP_R,
    surfaceY: 0.26 + 0.455,

    /** 世界坐标的汤面中心（蒸汽/涟漪发射点） */
    getSurfaceCenter(out = new THREE.Vector3()) {
      surfaceCenter.set(soup.position.x, soup.position.y, soup.position.z);
      g.localToWorld(surfaceCenter);
      return out.copy(surfaceCenter);
    },

    /** 火力 0..1 —— 只影响视觉与沸腾强度 */
    setHeat(v) {
      state.heat = Math.max(0, Math.min(1, v));
      if (g.userData.flames) {
        g.userData.flames.visible = state.heat > 0.02;
      }
      if (g.userData.glow) {
        g.userData.glow.intensity = state.heat * 1.9;
      }
    },

    /** 汤色：t 0（清水）→ 1（金黄）；cloudy 0..1 变浑 */
    setSoup(t, cloudy = 0) {
      const a = new THREE.Color(COLORS.soupPale).lerp(new THREE.Color(COLORS.soup), t);
      const b = new THREE.Color(0xf7e8c8).lerp(new THREE.Color(COLORS.soupDeep), t);
      soupSurface.setColors(a, b);
      soupSurface.setCloud(cloudy);
      state.boil = t;
    },

    /** 世界坐标落点 → 汤面涟漪 */
    addRipple(worldPos, strength = 1) {
      const local = g.worldToLocal(worldPos.clone());
      soupSurface.ripple(local.x, local.z, strength);
    },

    update(dt) {
      state.time += dt;
      soupSurface.setBoil(state.heat * (0.35 + state.boil * 0.9));
      soupSurface.update(dt);

      if (g.userData.flames && g.userData.flames.visible) {
        const f = g.userData.flames;
        const t = state.time;
        const k = 0.72 + state.heat * 0.5;
        f.scale.set(k, k * (0.86 + Math.sin(t * 13.2) * 0.1 + Math.sin(t * 7.1) * 0.06), k);
        f.material.opacity = 0.46 + Math.sin(t * 9.4) * 0.06 + state.heat * 0.22;
      }
    },

    reset() {
      state.heat = 0;
      state.boil = 0;
      api.setHeat(0);
      api.setSoup(0, 0);
      soupSurface.clearRipples();
      soupSurface.setBoil(0);
    },
  };

  return api;
}
