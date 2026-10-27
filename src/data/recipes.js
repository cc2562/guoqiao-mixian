/**
 * 配菜表 / 碗 / 格子盘 / 等级文案 —— 纯数据，改这里就能换菜单。
 *
 * cat:    raw 生肉片（靠汤温烫熟） / cooked 熟料 / veg 蔬菜
 * kind:   造型类别，交给 props/ingredients/detail.js 决定加什么细节件
 *         slab 薄片 / chunk 块状 / cap 菌盖 / ball 丸子 / frond 叶菜 / roll 肠
 * shape:  交给 props/ingredients/shapes.js 生成 2D 轮廓
 * tex:    程序化纹理（plain 素面 / oil 油花 / spots 斑点 / fiber 纤维 /
 *         wrinkle 褶皱 / crisp 脆皮 / marble 大理石纹 / streak 肌肉纹 /
 *         crust 炸衣 / speckle 细点 / gill 菌褶 / vein 叶脉）
 */

export const INGREDIENTS = [
  // ---- 生肉片类 ----
  {
    id: 'liji', name: '里脊肉片', cat: 'raw', meat: true, kind: 'slab',
    shape: 'roundRect', size: [0.5, 0.34], thickness: 0.035,
    color: '#f0b3b3', accent: '#fbe0e0', tex: 'streak', tag: '生',
    detail: { marks: 4, relief: 0.012 },
  },
  {
    id: 'heiyu', name: '黑鱼片', cat: 'raw', meat: true, kind: 'slab',
    shape: 'ellipse', size: [0.46, 0.3], thickness: 0.03,
    color: '#f6ece6', accent: '#cbb6a8', tex: 'marble', tag: '生', alpha: 0.94,
    detail: { marks: 5, relief: 0.010 },
  },
  {
    id: 'jirou', name: '鸡肉', cat: 'raw', meat: true, kind: 'chunk',
    shape: 'blob', size: [0.44, 0.4], thickness: 0.075,
    color: '#f0d5a4', accent: '#fff0d2', tex: 'fiber', tag: '生',
    detail: { marks: 7, relief: 0.03 },
  },

  // ---- 熟料类 ----
  {
    id: 'surou', name: '酥肉', cat: 'cooked', meat: true, kind: 'chunk',
    shape: 'roundRect', size: [0.4, 0.4], thickness: 0.12,
    color: '#dd9c46', accent: '#f7d79a', tex: 'crust', tag: '熟',
    detail: { marks: 14, relief: 0.028 },
  },
  {
    id: 'huotui', name: '火腿', cat: 'cooked', meat: true, kind: 'slab',
    shape: 'round', size: [0.24, 0.24], thickness: 0.05,
    color: '#d46060', accent: '#f6b3ae', tex: 'speckle', tag: '熟',
    detail: { marks: 5, relief: 0.01, ring: true },
  },
  {
    id: 'huotuiChang', name: '火腿肠', cat: 'cooked', meat: true, kind: 'roll',
    shape: 'capsule', size: [0.44, 0.2], thickness: 0.095,
    color: '#e28384', accent: '#fbc4c2', tex: 'plain', tag: '熟',
    detail: { marks: 2, relief: 0.02 },
  },
  {
    id: 'doufuPi', name: '豆腐皮', cat: 'cooked', meat: false, kind: 'slab',
    shape: 'wavy', size: [0.62, 0.3], thickness: 0.022,
    color: '#eddaa2', accent: '#fdf3d1', tex: 'wrinkle', tag: '素',
    detail: { marks: 5, relief: 0.008 },
  },
  {
    id: 'yulanPian', name: '玉兰片', cat: 'cooked', meat: false, kind: 'slab',
    shape: 'flower', size: [0.36, 0.36], thickness: 0.04,
    color: '#efdfa2', accent: '#fdf6d8', tex: 'vein', tag: '素',
    detail: { marks: 6, relief: 0.01 },
  },
  {
    id: 'muer', name: '木耳', cat: 'cooked', meat: false, kind: 'frond',
    shape: 'wavy', size: [0.42, 0.36], thickness: 0.03,
    color: '#6a4738', accent: '#9d7863', tex: 'wrinkle', tag: '素',
    detail: { marks: 4, relief: 0.022 },
  },
  {
    id: 'mogu', name: '蘑菇', cat: 'cooked', meat: false, kind: 'cap',
    shape: 'mushroom', size: [0.42, 0.42], thickness: 0.07,
    color: '#bb8c63', accent: '#f0ddc4', tex: 'gill', tag: '素',
    detail: { marks: 14, relief: 0.075 },
  },
  {
    id: 'andanchun', name: '鹌鹑蛋', cat: 'cooked', meat: true, kind: 'ball',
    shape: 'round', size: [0.27, 0.27], thickness: 0.14,
    color: '#f6efdf', accent: '#dccbb0', tex: 'spots', tag: '熟',
    detail: { marks: 0, relief: 0.09 },
  },
  {
    id: 'yuwan', name: '鱼丸', cat: 'cooked', meat: true, kind: 'ball',
    shape: 'round', size: [0.3, 0.3], thickness: 0.17,
    color: '#fbf9f2', accent: '#e8e2d2', tex: 'plain', tag: '熟',
    detail: { marks: 0, relief: 0.11, ring: true },
  },

  // ---- 蔬菜类 ----
  {
    id: 'jiucai', name: '韭菜段', cat: 'veg', meat: false, kind: 'frond',
    shape: 'capsule', size: [0.58, 0.1], thickness: 0.015,
    color: '#6fae4c', accent: '#a6d47f', tex: 'fiber', tag: '蔬',
    detail: { marks: 3, relief: 0.012 },
  },
  {
    id: 'xiangcai', name: '香菜', cat: 'veg', meat: false, kind: 'frond',
    shape: 'leaf', size: [0.42, 0.42], thickness: 0.015,
    color: '#4f9a3a', accent: '#8ecb68', tex: 'vein', tag: '蔬',
    detail: { marks: 5, relief: 0.012 },
  },
];

export const ING_MAP = INGREDIENTS.reduce((m, it) => (m[it.id] = it, m), {});

/** 上菜顺序提示（结算面板的「趁热吃」文案用） */
export const SERVE_STEPS = [
  { cat: 'raw', label: '生肉片', tip: '先下生肉片，靠滚汤烫熟' },
  { cat: 'cooked', label: '熟料', tip: '再下酥肉、火腿、丸子' },
  { cat: 'veg', label: '蔬菜', tip: '最后放蔬菜，烫一下就熟' },
  { cat: 'noodle', label: '米线', tip: '米线最后入碗，趁热吃' },
];

/* ---------------- 碗：一汤一米线，各选一次 ---------------- */
export const BOWLS = [
  {
    id: 'qinghua', name: '青花大碗', color: '#fdfdf9', rim: '#3b6ea5',
    pattern: 'blossom', score: 10, desc: '经典青花，蓝白清雅',
  },
  {
    id: 'baici', name: '白瓷大碗', color: '#fffefb', rim: '#e4d9c6',
    pattern: 'plain', score: 9.5, desc: '素白干净，最衬金色汤汁',
  },
  {
    id: 'heitao', name: '黑陶大碗', color: '#5b5048', rim: '#39312b',
    pattern: 'speck', score: 9, desc: '粗陶哑光，质朴有手感',
  },
  {
    id: 'zhubian', name: '竹青大碗', color: '#eee8d4', rim: '#7d9a5f',
    pattern: 'bamboo', score: 9.5, desc: '竹青釉色，清雅解腻',
  },
];

/* ---------------- 格子盘：装切好的配菜 ---------------- */
export const TRAYS = [
  {
    id: 'yuan', name: '圆形格盘', shape: 'circle', size: 1.30, cells: 8,
    color: '#fbfbf3', rim: '#3b6ea5', pattern: 'blossom', score: 10,
    desc: '八瓣分格，汤汁不串味',
  },
  {
    id: 'fang', name: '方形格盘', shape: 'square', size: 1.26, cells: 9,
    color: '#fffef9', rim: '#dfae62', pattern: 'plain', score: 9.5,
    desc: '九宫格，摆得规整',
  },
  {
    id: 'qiao', name: '桥形格盘', shape: 'bridge', size: 1.46, cells: 5,
    color: '#f4ead6', rim: '#a3803f', pattern: 'weave', score: 10,
    desc: '一桥飞架，过桥的仪式感',
  },
];

export const BOWL_MAP = BOWLS.reduce((m, it) => (m[it.id] = it, m), {});
export const TRAY_MAP = TRAYS.reduce((m, it) => (m[it.id] = it, m), {});

/** 旧的 4 款盘子（暂留作兜底） */
export const PLATES = BOWLS;

export const TIERS = [
  { min: 90, name: '米线宗师', comment: '汤清味正，一线入魂。这一套，值得排两小时队。' },
  { min: 80, name: '过桥达人', comment: '火候老到，就是那一口鲜，只差一点点火气。' },
  { min: 65, name: '熟练厨娘', comment: '有模有样，街边小店的水准，再练练刀工。' },
  { min: 0, name: '新手学徒', comment: '汤还差点意思，锅还热着，再来一锅？' },
];
