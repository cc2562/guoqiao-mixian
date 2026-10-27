/**
 * Q 版卡通渲染基础件：
 * - 程序化 gradientMap（把暗部抬起来，绝不出现纯黑）
 * - 共享材质缓存（禁止逐物体 new 材质，否则 shader 反复编译）
 * - 几张通用 canvas 贴图：软圆点 / 圆角方块 / 木纹 / 假阴影
 */
import * as THREE from 'three';

/* ---------------- gradientMap ---------------- */
const gradCache = new Map();

export function gradientMap(steps = 4) {
  let tex = gradCache.get(steps);
  if (tex) return tex;
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    // 非线性：暗部不能是 0，卡通需要"亮暗分明但都不脏"
    const v = Math.round(255 * (0.46 + 0.54 * Math.pow((i + 1) / steps, 1.28)));
    data[i * 4 + 0] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  tex = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  // 注意：DataTexture 保持 NoColorSpace，设 sRGB 会被二次转换导致渐变发灰
  gradCache.set(steps, tex);
  return tex;
}

/* ---------------- 材质缓存 ---------------- */
const matCache = new Map();

/**
 * 卡通材质（共享）
 * @param {number|string} color
 * @param {object} opts { steps, map, opacity, transparent, side, emissive, depthWrite }
 */
export function toon(color, opts = {}) {
  const steps = opts.steps || 4;
  const mapId = opts.map ? opts.map.uuid : '0';
  const key = [
    color, steps, mapId,
    opts.opacity == null ? 1 : opts.opacity,
    opts.transparent ? 1 : 0,
    opts.side || 0,
    opts.emissive || 0,
    opts.depthWrite === false ? 0 : 1,
  ].join('|');

  let m = matCache.get(key);
  if (m) return m;

  m = new THREE.MeshToonMaterial({
    color: new THREE.Color(color),
    gradientMap: gradientMap(steps),
    map: opts.map || null,
    transparent: !!opts.transparent,
    opacity: opts.opacity == null ? 1 : opts.opacity,
    side: opts.side || THREE.FrontSide,
    depthWrite: opts.depthWrite !== false,
  });
  if (opts.emissive) {
    m.emissive = new THREE.Color(opts.emissive);
    m.emissiveIntensity = opts.emissiveIntensity == null ? 1 : opts.emissiveIntensity;
  }
  matCache.set(key, m);
  return m;
}

const flatCache = new Map();
/** 纯色不受光材质（火焰、发光件、UI 薄片） */
export function flat(color, opts = {}) {
  const key = [color, opts.opacity == null ? 1 : opts.opacity, opts.transparent ? 1 : 0,
    opts.side || 0, opts.blending || 1, opts.depthWrite === false ? 0 : 1, opts.map ? opts.map.uuid : 0].join('|');
  let m = flatCache.get(key);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: !!opts.transparent,
    opacity: opts.opacity == null ? 1 : opts.opacity,
    side: opts.side || THREE.FrontSide,
    blending: opts.blending || THREE.NormalBlending,
    depthWrite: opts.depthWrite !== false,
    map: opts.map || null,
  });
  flatCache.set(key, m);
  return m;
}

/* ---------------- canvas 贴图 ---------------- */
export function canvasTexture(w, h, draw, { repeat = null, srgb = true } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(cv);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

let _softDot = null;
export function softDotTexture() {
  if (_softDot) return _softDot;
  _softDot = canvasTexture(64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.72)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
  return _softDot;
}

let _squareDot = null;
export function squareDotTexture() {
  if (_squareDot) return _squareDot;
  _squareDot = canvasTexture(32, 32, (g, w, h) => {
    g.fillStyle = '#fff';
    const r = 8;
    g.beginPath();
    g.moveTo(r, 2); g.lineTo(w - r, 2); g.quadraticCurveTo(w - 2, 2, w - 2, r);
    g.lineTo(w - 2, h - r); g.quadraticCurveTo(w - 2, h - 2, w - r, h - 2);
    g.lineTo(r, h - 2); g.quadraticCurveTo(2, h - 2, 2, h - r);
    g.lineTo(2, r); g.quadraticCurveTo(2, 2, r, 2);
    g.fill();
  });
  return _squareDot;
}

let _blob = null;
export function blobShadowTexture() {
  if (_blob) return _blob;
  _blob = canvasTexture(128, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    grd.addColorStop(0, 'rgba(58,36,24,0.62)');
    grd.addColorStop(0.55, 'rgba(58,36,24,0.34)');
    grd.addColorStop(1, 'rgba(58,36,24,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
  return _blob;
}

let _wood = null;
/** 木纹（横向年轮 + 细碎纹理） */
export function woodTexture(base = '#c98b5e', dark = '#a9693f', light = '#dba875') {
  if (_wood) return _wood;
  _wood = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const y = Math.random() * h;
      g.strokeStyle = Math.random() > 0.5 ? dark : light;
      g.globalAlpha = 0.06 + Math.random() * 0.12;
      g.lineWidth = 0.6 + Math.random() * 2.4;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) {
        g.lineTo(x, y + Math.sin((x / w) * Math.PI * 2 + i) * 3.2);
      }
      g.stroke();
    }
    // 细节点
    for (let i = 0; i < 900; i++) {
      g.globalAlpha = 0.03 + Math.random() * 0.05;
      g.fillStyle = Math.random() > 0.5 ? dark : light;
      g.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
    g.globalAlpha = 1;
  }, { repeat: [1, 1] });
  return _wood;
}

/* ---------------- 假阴影 ---------------- */
const shadowGeo = new THREE.PlaneGeometry(1, 1);
let shadowMat = null;

export function blobShadow(w = 1, h = null, opacity = 0.5) {
  if (!shadowMat) {
    shadowMat = new THREE.MeshBasicMaterial({
      map: blobShadowTexture(),
      transparent: true,
      opacity: 1,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }
  const m = new THREE.Mesh(shadowGeo, shadowMat);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(w, h == null ? w * 0.62 : h, 1);
  m.renderOrder = 1;
  m.userData.baseOpacity = opacity;
  return m;
}
