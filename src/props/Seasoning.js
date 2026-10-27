/**
 * 调味罐（5 个）：点缀 + 被点中时的弹跳反馈。
 * 交互入口其实是底部 DOM chips（手机上 100% 命中），这里的罐子负责"看见"。
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SEASONINGS } from '../data/config.js';
import { toon, blobShadow } from '../render/Toon.js';
import { damp } from '../core/Tween.js';

export function createSeasoning() {
  const g = new THREE.Group();

  // 木托盘
  const tray = new THREE.Mesh(
    new RoundedBoxGeometry(1.78, 0.07, 0.5, 3, 0.025),
    toon(0xb07b4c)
  );
  tray.position.set(0, 0.03, 0);
  g.add(tray);

  const jars = [];
  const n = SEASONINGS.length;
  const span = 1.46;

  for (let i = 0; i < n; i++) {
    const s = SEASONINGS[i];
    const jar = new THREE.Group();

    const bodyPts = [
      [0.001, 0], [0.10, 0], [0.118, 0.028], [0.124, 0.07],
      [0.124, 0.21], [0.108, 0.244], [0.104, 0.268],
    ].map(([x, y]) => new THREE.Vector2(x, y));

    // 罐身带一点该调料自己的颜色，5 个罐子一眼能分开
    const bodyCol = new THREE.Color(0xfaf4e8).lerp(new THREE.Color(s.color), 0.55);
    const body = new THREE.Mesh(
      new THREE.LatheGeometry(bodyPts, 20),
      toon(bodyCol.getHex(), { side: THREE.DoubleSide })
    );
    jar.add(body);

    // 罐口露出来的那一堆（开盖的罐子才看得见里面是什么）
    const fill = new THREE.Mesh(new THREE.SphereGeometry(0.102, 16, 10), toon(s.dot));
    fill.scale.set(1, 0.42, 1);
    fill.position.y = 0.248;
    fill.rotation.y = i * 1.1;
    jar.add(fill);

    // 罐口圈 + 标签纸
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(0.104, 0.012, 6, 20),
      toon(0xd9c8ad)
    );
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.262;
    jar.add(lip);

    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.126, 0.126, 0.052, 20, 1, true),
      toon(0xfdf8ee, { side: THREE.DoubleSide })
    );
    band.position.y = 0.14;
    jar.add(band);

    const bandDot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.127, 0.127, 0.026, 20, 1, true),
      toon(s.dot, { side: THREE.DoubleSide })
    );
    bandDot.position.y = 0.14;
    jar.add(bandDot);

    jar.position.set(-span / 2 + (span * i) / (n - 1), 0.075, (i % 2 ? 0.03 : -0.03));
    jar.rotation.y = (i % 2 ? 0.34 : -0.26);
    jar.scale.setScalar(1.02);
    g.add(jar);

    jars.push({
      node: jar,
      baseY: 0.075,
      bounceT: 0,
      meta: s,
    });
  }

  const sh = blobShadow(1.9, 0.85, 0.3);
  sh.position.set(0, 0.004, 0);
  g.add(sh);

  return {
    group: g,
    jars,

    /** 世界坐标（供命中/粒子起点） */
    jarWorld(i, out = new THREE.Vector3()) {
      const j = jars[i];
      if (!j) return out;
      return j.node.getWorldPosition(out);
    },

    bounce(i) {
      const j = jars[i];
      if (j) j.bounceT = 1;
    },

    reset() {
      for (const j of jars) {
        j.bounceT = 0;
        j.node.position.y = j.baseY;
        j.node.scale.setScalar(1.02);
      }
    },

    update(dt) {
      for (const j of jars) {
        if (j.bounceT > 0) {
          j.bounceT = Math.max(0, j.bounceT - dt * 3.6);
          const k = Math.sin((1 - j.bounceT) * Math.PI);
          j.node.position.y = j.baseY + k * 0.09;
          j.node.scale.setScalar(1.02 * (1 + k * 0.12));
        } else {
          j.node.position.y = damp(j.node.position.y, j.baseY, 12, dt);
          j.node.scale.setScalar(damp(j.node.scale.x, 1.02, 12, dt));
        }
      }
    },
  };
}
