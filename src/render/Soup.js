/**
 * 汤面：锅和碗共用的一个 ShaderMaterial。
 * 6 个环形复用的涟漪槽位（零分配）+ 微沸波动 + 卡通高光。
 */
import * as THREE from 'three';

const VERT = /* glsl */`
  uniform float uTime;
  uniform float uBoil;
  uniform vec4 uRipple[6];
  varying vec2 vUv;
  varying float vH;
  varying vec3 vN;

  float wave(vec2 uv) {
    float h = 0.0;
    for (int i = 0; i < 6; i++) {
      vec4 r = uRipple[i];
      if (r.w <= 0.001) continue;
      float age = uTime - r.z;
      if (age < 0.0 || age > 1.9) continue;
      float d = distance(uv, r.xy);
      h += sin(d * 30.0 - age * 17.0) * exp(-d * 6.0) * exp(-age * 2.3) * r.w;
    }
    h += uBoil * 0.28 * sin(uv.x * 21.0 + uTime * 3.1) * sin(uv.y * 18.0 - uTime * 2.3);
    h += uBoil * 0.16 * sin((uv.x + uv.y) * 33.0 - uTime * 4.6);
    return h;
  }

  void main() {
    vUv = uv;
    float e = 0.012;
    float h = wave(uv);
    float hx = wave(uv + vec2(e, 0.0));
    float hz = wave(uv + vec2(0.0, e));
    vH = h;
    vec3 p = position;
    p.y += h * 0.035;
    vN = normalize(vec3(-(hx - h) / e * 0.016, 1.0, -(hz - h) / e * 0.016));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAG = /* glsl */`
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform float uCloud;
  uniform vec3 uLight;
  varying vec2 vUv;
  varying float vH;
  varying vec3 vN;

  void main() {
    vec3 n = normalize(vN);
    float ndl = clamp(dot(n, normalize(uLight)), 0.0, 1.0);

    float r = length(vUv - vec2(0.5)) * 2.0;
    // 中间清亮、外圈浓一点，汤面有"从中心往外浓郁"的层次
    vec3 base = mix(uColA, uColB, smoothstep(0.10, 1.0, r) * 0.85);
    base = mix(base, vec3(0.97, 0.95, 0.90), uCloud * 0.55);

    // 卡通分层但过渡要软：不做硬边 terminator
    float band = 0.93 + 0.13 * smoothstep(0.25, 0.95, ndl);
    vec3 col = base * band;

    // 高光：一团宽的柔光 + 一点锐的亮斑
    float gloss = pow(ndl, 5.0) * 0.07 + pow(ndl, 42.0) * 0.16;
    col += gloss * vec3(1.0, 0.96, 0.86);

    // 波峰微微提亮
    col += clamp(vH * 0.5, 0.0, 1.0) * 0.035;

    // 边缘压暗，汤面被器皿包住
    col *= 1.0 - smoothstep(0.80, 1.0, r) * 0.14;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const SLOTS = 6;

export function createSoup({ radius = 0.7, colA = 0xf2b441, colB = 0xe08e2b, segments = 48 } = {}) {
  const geo = new THREE.CircleGeometry(radius, segments);
  geo.rotateX(-Math.PI / 2);

  const ripples = new Array(SLOTS).fill(0).map(() => new THREE.Vector4(0.5, 0.5, -99, 0));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBoil: { value: 0 },
      uRipple: { value: ripples },
      uColA: { value: new THREE.Color(colA) },
      uColB: { value: new THREE.Color(colB) },
      uCloud: { value: 0 },
      uLight: { value: new THREE.Vector3(0.35, 0.9, 0.28) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;

  const st = { time: 0, boil: 0, idx: 0 };

  return {
    mesh,
    mat,
    radius,

    setColors(a, b) {
      mat.uniforms.uColA.value.copy(a);
      if (b) mat.uniforms.uColB.value.copy(b);
    },

    setCloud(v) {
      mat.uniforms.uCloud.value = v;
    },

    setBoil(v) {
      st.boil = Math.max(0, Math.min(1.6, v));
    },

    /** 局部坐标（器皿中心为原点）落一个涟漪 */
    ripple(x, z, strength = 1) {
      const u = (x / radius) * 0.5 + 0.5;
      const v = (z / radius) * 0.5 + 0.5;
      const r = ripples[st.idx];
      r.set(u, v, st.time, strength);
      st.idx = (st.idx + 1) % SLOTS;
    },

    clearRipples() {
      ripples.forEach((r) => r.set(0.5, 0.5, -99, 0));
    },

    update(dt) {
      st.time += dt;
      mat.uniforms.uTime.value = st.time;
      const u = mat.uniforms.uBoil;
      u.value += (st.boil - u.value) * Math.min(1, dt * 4);
    },
  };
}
