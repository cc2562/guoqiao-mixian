/**
 * 选择性描边（inverted hull）：
 * - 顶点着色器里沿「视空间法线」外扩，扁片物体粗细也一致（不用 scale *= 1.03 那种土办法）
 * - 描边网格必须 raycast = () => {}，否则会抢走点击
 * - 只给主角描边（锅/碗/盘/刀/台上的食材），低性能档整体关闭
 */
import * as THREE from 'three';
import { COLORS } from '../data/config.js';

export const outlineMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: true,
  depthTest: true,
  uniforms: {
    uColor: { value: new THREE.Color(COLORS.outline) },
    uWidth: { value: 0.014 },
  },
  vertexShader: /* glsl */`
    uniform float uWidth;
    void main() {
      vec3 n = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      mv.xyz += n * uWidth;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */`
    uniform vec3 uColor;
    void main() {
      gl_FragColor = vec4(uColor, 1.0);
    }
  `,
});

export function setOutlineWidth(w) {
  outlineMat.uniforms.uWidth.value = w;
}

export function setOutlineColor(hex) {
  outlineMat.uniforms.uColor.value.set(hex);
}

/**
 * 单独的一条描边材质（自带独立宽度）。
 * 细管状物体（米线）用全局 0.014 会被糊成黑棒，这里给 4~5mm 的细边。
 */
export function makeOutlineMaterial(width = 0.005) {
  const m = outlineMat.clone();
  m.uniforms.uWidth.value = width;
  return m;
}

/**
 * 给一个 mesh 挂上描边。返回描边 mesh（已挂在父级上）。
 * 注意：几何体是共享的，父级换 geometry 时要同步 setOutlineGeometry。
 */
export function attachOutline(mesh, geometry = mesh.geometry, renderOrder = 2) {
  const o = new THREE.Mesh(geometry, outlineMat);
  o.raycast = () => {};
  o.renderOrder = renderOrder;
  o.matrixAutoUpdate = true;
  o.name = 'outline';
  mesh.add(o);
  mesh.userData.outline = o;
  return o;
}

export function setOutlineGeometry(mesh, geometry) {
  const o = mesh.userData.outline;
  if (o) o.geometry = geometry;
}

export function setOutlineEnabled(mesh, on) {
  const o = mesh.userData.outline;
  if (o) o.visible = on;
}
