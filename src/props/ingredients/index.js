/**
 * 食材工厂：材质缓存、图标缓存、可切实例、静态小模型。
 */
import * as THREE from 'three';
import { toon } from '../../render/Toon.js';
import { patternTexture, iconDataURL, extrude } from './build.js';
import { shapeFor } from './shapes.js';
import { Slicer } from './slicer.js';
import { INGREDIENTS, ING_MAP } from '../../data/recipes.js';

const matCache = new Map();
const iconCache = new Map();
const staticGeoCache = new Map();

export function materialFor(ing) {
  let m = matCache.get(ing.id);
  if (m) return m;
  m = toon(ing.color, {
    map: patternTexture(ing.tex),
    transparent: ing.alpha != null,
    opacity: ing.alpha == null ? 1 : ing.alpha,
  });
  matCache.set(ing.id, m);
  return m;
}

export function iconFor(ing) {
  let u = iconCache.get(ing.id);
  if (u) return u;
  u = iconDataURL(ing, 128);
  iconCache.set(ing.id, u);
  return u;
}

/** 静态几何（带倒角，用于小模型 / 飞行中的食材） */
export function geometryFor(ing) {
  let g = staticGeoCache.get(ing.id);
  if (g) return g;
  g = extrude(shapeFor(ing), ing.thickness, true);
  staticGeoCache.set(ing.id, g);
  return g;
}

/** 不可切的静态小模型（备菜盘上的小样、碗里的料） */
export function createToken(ing, scale = 1) {
  const m = new THREE.Mesh(geometryFor(ing), materialFor(ing));
  m.scale.setScalar(scale);
  m.userData.ing = ing;
  return m;
}

/** 可切实例（携带 Slicer） */
export function createPiece(ing) {
  return new Slicer(ing, materialFor(ing));
}

export function allIngredients() {
  return INGREDIENTS;
}

export function ingredientById(id) {
  return ING_MAP[id];
}
