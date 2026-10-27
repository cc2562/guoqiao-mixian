/**
 * 厨房环境：一张大木台面。
 * 只负责"背景氛围"，不参与玩法 —— 别在这里放会挡住锅的东西。
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COLORS } from '../data/config.js';
import { toon, woodTexture } from '../render/Toon.js';

export function createKitchen() {
  const g = new THREE.Group();

  const wood = woodTexture('#b3743f', '#8a4f26', '#c98f57');

  // ---- 台面 ----
  const counterGeo = new RoundedBoxGeometry(14, 0.55, 8, 3, 0.09);
  const counter = new THREE.Mesh(counterGeo, toon(0xffffff, { map: wood }));
  counter.position.set(0, -0.275, 1.2);
  g.add(counter);

  // 台面前沿的压边（只在前边一条，不能盖住整块台面）
  const lipGeo = new RoundedBoxGeometry(14, 0.1, 0.22, 2, 0.04);
  const lip = new THREE.Mesh(lipGeo, toon(COLORS.woodDark));
  lip.position.set(0, 0.01, 3.4);
  g.add(lip);

  return {
    group: g,
    update() {},
  };
}

