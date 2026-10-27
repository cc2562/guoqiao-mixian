/**
 * 米线：几根 Tube 曲线合并成 1 个 drawcall。
 *
 * 两种形态：
 *   createNoodleBundle()  没下锅的干米线，直挺成束
 *   createNoodleNest()    碗里的一窝，散乱软堆（随机游走 + 边界反弹 + 中心隆起）
 *
 * 几何一次生成、模块级缓存，运行期只新建 Mesh。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, canvasTexture } from '../render/Toon.js';
import { attachOutline, makeOutlineMaterial } from '../render/Outline.js';

function strand(len, radius, phase, twist) {
  const pts = [];
  const seg = 6;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    pts.push(new THREE.Vector3(
      Math.sin(t * Math.PI * 2.6 + phase) * twist,
      Math.cos(t * Math.PI * 3.1 + phase) * 0.018,
      -len / 2 + t * len
    ));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, 26, radius, 5, false);
}

/** 一把没下锅的米线（直挺、成束） */
export function createNoodleBundle() {
  const geos = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const g = strand(0.92, 0.02, i * 1.7, 0.035);
    g.translate((i - (n - 1) / 2) * 0.028, 0, 0);
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());

  const mesh = new THREE.Mesh(merged, toon(0xf6efdc));
  attachOutline(mesh);
  mesh.position.y = 0.03;
  return { mesh, geo: merged };
}

/* ---------------- 一窝米线 ---------------- */

/** 固定种子的伪随机，保证每次打开长得一样 */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let nestGeo = null;
let nestMat = null;
let nestOutlineMat = null;
/** 摇曳动画的时间 uniform（只有一窝米线共用，App.tick 每帧写一次） */
let nestUniforms = null;

/** 给米线材质加一层很轻的顶点摇曳：软的观感一半来自几何，一半来自它会动 */
function addWobble(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = nestUniforms.uTime;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */`
      #include <begin_vertex>
      {
        // 用世界坐标做相位：描边网格跟着一起晃，不会和本体分离
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        float ph = wp.x * 7.0 + wp.z * 6.0 + wp.y * 4.0;
        float amp = 0.010;
        transformed.x += sin(uTime * 1.55 + ph) * amp;
        transformed.y += sin(uTime * 1.10 + ph * 0.7) * amp * 0.55;
        transformed.z += cos(uTime * 1.35 + ph * 1.2) * amp;
      }`
    );
  };
}

/** 描边材质是自写的 ShaderMaterial，得单独插同样一段位移 */
function addOutlineWobble(mat) {
  mat.uniforms.uTime = nestUniforms.uTime;
  mat.vertexShader = mat.vertexShader
    .replace('uniform float uWidth;', 'uniform float uWidth;\nuniform float uTime;')
    .replace(
      'vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      /* glsl */`
      vec3 p = position;
      {
        vec4 wp = modelMatrix * vec4(p, 1.0);
        float ph = wp.x * 7.0 + wp.z * 6.0 + wp.y * 4.0;
        float amp = 0.010;
        p.x += sin(uTime * 1.55 + ph) * amp;
        p.y += sin(uTime * 1.10 + ph * 0.7) * amp * 0.55;
        p.z += cos(uTime * 1.35 + ph * 1.2) * amp;
      }
      vec4 mv = modelViewMatrix * vec4(p, 1.0);`
    );
}

function noodleTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#fbf4e2';
    g.fillRect(0, 0, w, h);

    // 极淡的米浆纤维
    for (let i = 0; i < 42; i++) {
      g.strokeStyle = `rgba(213,194,156,${0.08 + Math.random() * 0.10})`;
      g.lineWidth = 0.8 + Math.random() * 1.5;
      const y = Math.random() * h;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + 4, w * 0.7, y - 4, w, y + 1);
      g.stroke();
    }

    // 润泽高光，米线才不像粉笔
    for (let i = 0; i < 24; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.22 + Math.random() * 0.28})`;
      g.lineWidth = 1 + Math.random() * 2;
      const y = Math.random() * h;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y + (Math.random() - 0.5) * 4);
      g.stroke();
    }
  }, { repeat: [2, 3] });
}

/** 堆的形状：中间鼓、边缘塌下去的一道圆顶 */
function domeY(r, R, amp) {
  const k = Math.min(1, r / R);
  return amp * Math.pow(1 - k * k, 1.25);
}

function buildNestGeo() {
  const rnd = makeRng(20261027);
  const R = 0.57;            // 堆的水平半径（碗内径 0.70）
  const AMP = 0.165;         // 堆顶高度（略高一点才像一堆，而不是一张饼）
  const TAU = Math.PI * 2;
  const geos = [];

  const pushTube = (pts, tubeR) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    geos.push(new THREE.TubeGeometry(curve, 22, tubeR, 5, false));
    // 两端各封一个小球，堵住管口（不然露出管口像「断掉」）
    for (const e of [pts[0], pts[pts.length - 1]]) {
      const cap = new THREE.SphereGeometry(tubeR * 1.05, 5, 3);
      cap.translate(e.x, e.y, e.z);
      geos.push(cap);
    }
  };

  /* 1) 盘绕的主体：慢漂移的随机游走，弧更长、更懒 */
  for (let i = 0; i < 26; i++) {
    const a0 = rnd() * TAU;
    const r0 = 0.05 + rnd() * 0.42;
    let x = Math.cos(a0) * r0;
    let z = Math.sin(a0) * r0;
    let dir = rnd() * TAU;
    const phase = rnd() * TAU;
    const yBias = (rnd() - 0.4) * 0.045;
    const amp = AMP * (0.85 + rnd() * 0.32);   // 每根高低不一，堆顶才不是一只光滑的碗
    const steps = 24;
    const pts = [];

    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const rr = Math.hypot(x, z);
      // 两端往中间收 + 往下扎：线头埋进堆里，不外露
      const edge = Math.min(1, Math.min(t, 1 - t) * 4.2);
      const taper = 0.72 + 0.28 * edge;
      pts.push(new THREE.Vector3(
        x * taper,
        (domeY(rr, R, amp) + yBias) * taper
          + Math.sin(t * Math.PI * 2.0 + phase) * 0.012
          - (1 - edge) * 0.02,
        z * taper
      ));

      dir += (rnd() - 0.5) * 0.45;         // 慢漂移 → 长弧线，不是碎卷
      x += Math.cos(dir) * 0.072;
      z += Math.sin(dir) * 0.072;

      const d = Math.hypot(x, z);
      if (d > R) {                          // 碰壁折回来
        dir = Math.atan2(-z, -x) + (rnd() - 0.5) * 0.7;
        x = (x / d) * R * 0.94;
        z = (z / d) * R * 0.94;
      }
    }
    pushTube(pts, 0.0095 + rnd() * 0.0038);
  }

  /* 2) 从堆顶翻过边缘垂下来的：最能读成「软」的一层 */
  for (let i = 0; i < 12; i++) {
    const a0 = rnd() * TAU;
    const rStart = 0.04 + rnd() * 0.20;
    const rEnd = R * (0.72 + rnd() * 0.34);   // 落点散开，别都停在同一圈上（否则像个笼子）
    const droop = 0.07 + rnd() * 0.07;        // 垂到堆脚（碗底还托得住）
    const amp = AMP * (0.8 + rnd() * 0.35);
    const drift = (rnd() - 0.5) * 0.5;
    const tSag = 0.32 + rnd() * 0.32;         // 每根的「翻过肩」位置错开，才不会连成一圈台阶
    let a = a0;
    const steps = 22;
    const pts = [];

    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const sag = Math.pow(Math.max(0, (t - tSag) / (1 - tSag)), 1.7);
      // 末端勾回来：往里收 + 继续往下，线头藏进堆脚，不会伸出一截「小棍」
      const hook = Math.pow(Math.max(0, (t - 0.82) / 0.18), 1.5);
      const r = rStart + (rEnd - rStart) * t - hook * 0.05;
      a += 0.014 * drift;
      pts.push(new THREE.Vector3(
        Math.cos(a) * r,
        domeY(r, R, amp) - droop * sag,
        Math.sin(a) * r
      ));
    }
    pushTube(pts, 0.0092 + rnd() * 0.0034);
  }

  /* 3) 几根散搭在堆上的：横跨过堆顶，打散「一个实心球」的轮廓 */
  for (let i = 0; i < 6; i++) {
    const a0 = rnd() * TAU;
    const span = 1.6 + rnd() * 0.9;
    const lift = 0.012 + rnd() * 0.05;
    const wig = (rnd() - 0.5) * 0.08;
    const steps = 16;
    const pts = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const a = a0 + (t - 0.5) * span;
      // 两端在堆沿、中间搭过堆顶（之前是反的，正好在边上围成一圈）
      const r = R * (0.94 - Math.sin(t * Math.PI) * 0.34) + wig;
      pts.push(new THREE.Vector3(
        Math.cos(a) * r,
        domeY(r, R, AMP) + lift + Math.sin(t * Math.PI) * 0.02,
        Math.sin(a) * r
      ));
    }
    pushTube(pts, 0.0088 + rnd() * 0.0030);
  }

  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return merged;
}

/** 碗里的一窝米线（散乱软堆） */
export function createNoodleNest(scale = 1) {
  if (!nestGeo) {
    nestGeo = buildNestGeo();
    nestUniforms = { uTime: { value: 0 } };
    nestMat = toon(0xf7efd8, { map: noodleTexture() });
    addWobble(nestMat);
    // 细管要配细描边，否则黑边比米线还粗；
    // 颜色也调暖一点（近黑的轮廓会让细管看起来像铁丝）
    nestOutlineMat = makeOutlineMaterial(0.0030);
    nestOutlineMat.uniforms.uColor.value.set(0xa8834f);
    addOutlineWobble(nestOutlineMat);
  }
  const mesh = new THREE.Mesh(nestGeo, nestMat);
  if (scale !== 1) mesh.scale.setScalar(scale);
  const o = new THREE.Mesh(nestGeo, nestOutlineMat);
  o.raycast = () => {};
  o.renderOrder = 2;
  o.name = 'outline';
  mesh.add(o);
  mesh.userData.outline = o;
  return { mesh, geo: nestGeo };
}

/** 由 App.tick 每帧驱动：米线轻轻晃，软的观感一半来自这里 */
export function updateNoodleWobble(t) {
  if (nestUniforms) nestUniforms.uTime.value = t;
}

