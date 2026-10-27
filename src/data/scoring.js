/**
 * 评分：全部是纯函数，输入输出都是数字，方便单独调平衡。
 * 每个阶段只往 ctx.score 里写自己那一块，结果页只读。
 */
import { WEIGHTS, BROTH, NOODLE } from './config.js';
import { ING_MAP, BOWL_MAP, TRAY_MAP, TIERS } from './recipes.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const bell = (x, mu, sigma) => Math.exp(-((x - mu) * (x - mu)) / (2 * sigma * sigma));
export const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

/** 新建一份空分数表 */
export function newScore() {
  return {
    heat: { inBand: 0, total: 0, value: 0 },
    season: { counts: {}, salt: 0, kinds: 0, value: 0 },
    cut: { qualities: [], pieces: 0, value: 0 },
    noodle: { pos: 0, value: 0 },
    garnish: { picked: [], value: 0 },
    plate: { bowlId: '', trayId: '', value: 0 },
    plating: { placed: 0, total: 0, value: 0 },
    total: 0,
    tier: null,
  };
}

/* ---------------- 逐项 ---------------- */

/** 汤底火候：在黄金火力带内的时间占比 */
export function heatPoints(inBandTime, activeTime) {
  if (activeTime <= 0.5) return 0;
  return WEIGHTS.heat * clamp01(inBandTime / activeTime);
}

/** 调味：盐量钟形 + 种类丰富度 - 过量惩罚 */
export function seasonPoints(counts) {
  const salt = counts.salt || 0;
  const kinds = Object.keys(counts).filter((k) => k !== 'salt' && counts[k] > 0).length
    + (salt > 0 ? 1 : 0);
  const saltScore = (WEIGHTS.season * 0.6) * bell(salt, BROTH.idealSalt, BROTH.saltTol);
  const variety = (WEIGHTS.season * 0.4) * clamp01(kinds / 5);
  const penalty = Math.min(
    BROTH.maxSaltPenalty,
    BROTH.overPenaltyPer * Math.max(0, salt - BROTH.overSalt)
  );
  return {
    value: clamp(saltScore + variety - penalty, 0, WEIGHTS.season),
    salt, kinds,
  };
}

/** 刀工：每一刀的质量均值（和切了多少刀无关） */
export function cutPoints(qualities) {
  if (!qualities.length) return 0;
  return WEIGHTS.cut * clamp01(mean(qualities));
}

/** 米线口感：指针定格位置离甜区中心的距离 */
export function noodlePoints(pos) {
  const d = Math.abs(pos - NOODLE.sweetCenter);
  const over = Math.max(0, d - NOODLE.sweetHalf);
  return WEIGHTS.noodle * clamp01(1 - over / NOODLE.ramp);
}

/** 一刀的质量：直 + 顺 + 匀 */
export function cutQuality({ straight, smooth, evenness }) {
  return clamp01(0.45 * straight + 0.25 * smooth + 0.3 * evenness);
}

/** 配菜：丰富度（6 样封顶）+ 荤素平衡 */
export function garnishPoints(picked) {
  const n = picked.length;
  if (!n) return { value: 0, richness: 0, balance: 0 };
  let meat = 0, veg = 0;
  for (const id of picked) {
    const it = ING_MAP[id];
    if (!it) continue;
    if (it.meat) meat++; else veg++;
  }
  const richness = (WEIGHTS.garnish * 0.6) * clamp01(n / 6);
  const balance = (WEIGHTS.garnish * 0.4) * clamp01(1 - Math.abs(meat - veg) / Math.max(1, meat + veg));
  return { value: clamp(richness + balance, 0, WEIGHTS.garnish), richness, balance };
}

/** 器皿审美：汤碗 + 格子盘各占一半 */
export function platePoints(bowlId, trayId) {
  const b = BOWL_MAP[bowlId];
  const t = TRAY_MAP[trayId];
  const bs = b ? b.score : 8;
  const ts = t ? t.score : 8;
  return WEIGHTS.plate * clamp01((bs + ts) / 20);
}

/** 摆盘完成度：配菜有没有全部落盘 */
export function platingPoints(placed, total) {
  if (!total) return WEIGHTS.plating;
  return WEIGHTS.plating * clamp01(placed / total);
}

/* ---------------- 汇总 ---------------- */

export function computeTotal(score) {
  const s = score;
  const total =
    (s.heat?.value || 0) +
    (s.season?.value || 0) +
    (s.cut?.value || 0) +
    (s.noodle?.value || 0) +
    (s.garnish?.value || 0) +
    (s.plate?.value || 0) +
    (s.plating?.value || 0);
  s.total = Math.round(clamp(total, 0, 100) * 10) / 10;
  s.tier = TIERS.find((t) => s.total >= t.min) || TIERS[TIERS.length - 1];
  return s.total;
}

export function tierOf(total) {
  return TIERS.find((t) => total >= t.min) || TIERS[TIERS.length - 1];
}

/** 结果页展示用的 7 行 */
export function breakdown(score) {
  return [
    { key: 'heat', label: '汤底火候', value: score.heat.value, max: WEIGHTS.heat },
    { key: 'season', label: '调味平衡', value: score.season.value, max: WEIGHTS.season },
    { key: 'cut', label: '刀工', value: score.cut.value, max: WEIGHTS.cut },
    { key: 'noodle', label: '米线口感', value: score.noodle.value, max: WEIGHTS.noodle },
    { key: 'garnish', label: '配菜搭配', value: score.garnish.value, max: WEIGHTS.garnish },
    { key: 'plate', label: '器皿审美', value: score.plate.value, max: WEIGHTS.plate },
    { key: 'plating', label: '摆盘完成度', value: score.plating.value, max: WEIGHTS.plating },
  ];
}
