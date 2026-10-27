# 过桥米线 · 3D 烹饪小游戏

用 Three.js 做的「一碗过桥米线」完整制作流程：炖鸡汤 → 切配菜 → 煮米线（挑装米线的碗）→ 挑汤碗盛汤、挑格子盘码菜 → 套餐特写打分。

**在线玩：<https://cc2562.github.io/guoqiao-mixian/>**（手机打开体验最好）

- **纯静态**：原生 ES Module + importmap，没有构建步骤，没有 npm 依赖
- **离线可跑**：Three.js r186 已内联在 `vendor/three/`，不连 CDN
- **手机触屏优先**：单手滑动切菜、拖火力、点选，竖屏/横屏都做了单独排版
- **Q 版卡通**：toon 材质 + 选择性描边 + 程序化花纹/粒子/音效，全部代码生成，没有一张图片资源

---

## 跑起来

ES Module + importmap 不能用 `file://` 直接双击打开，需要一个静态服务器：

```bash
cd 过桥米线游戏
python -m http.server 5173
# 或者： npx serve .   /   php -S localhost:5173
```

浏览器打开 `http://localhost:5173`。

**手机上试玩**：电脑和手机连同一个 Wi-Fi，手机浏览器打开 `http://<电脑的局域网 IP>:5173`。

**部署**：整个目录丢到任意静态托管（GitHub Pages / Vercel / Netlify / Nginx / 对象存储）即可，不需要任何服务端逻辑。

---

## 玩法

| 阶段 | 做什么 | 得分项（满分 100） |
| --- | --- | --- |
| 1 炖鸡汤 | 拨火力找到「最佳火候」区间，顺手往锅里加调味料 | 汤底火候 20 / 调味平衡 15 |
| 2 切配菜 | 14 种配菜随便挑、随便切：手指划过的轨迹就是刀，一次手势一刀 | 刀工 15 / 配菜搭配 10 |
| 3 煮米线 | 指针走到绿色区间点「捞起」，再从 4 只碗里挑一只装米线 | 米线口感 15 |
| 4 装盘 | 挑汤碗 → 锅把汤倒进去 → 挑格子盘（圆／方／桥形）→ 把配菜一样一样拖进盘里 | 器皿审美 10 / 摆盘完成度 15 |
| 5 出餐 | 汤碗 + 米线碗 + 格子盘摆成一套，转一圈看成品并结算 | — |

不会失败，只有分数高低（米线宗师 / 过桥达人 / 熟练厨娘 / 新手学徒）。

### 切菜：轨迹就是刀

没有实体菜刀。按下开始记录轨迹，手指划到哪里刀光跟到哪里（加色混合的飘带 + 中心亮线 + 指尖光点），
松手时取「起点 → 轨迹最远点」结算**一条直线**切下去，切口撒屑。所以刷得再花也只是一刀，
想切几刀就抬几次手。

---

## 目录结构

```
index.html                 入口，importmap 指向本地 vendor
styles/main.css            全部样式（暖奶油底 + 糖果圆角，横屏另有一套紧凑排版）
src/
  main.js                  引导：按性能分档初始化 → 预载 → 显示开始按钮
  core/
    App.js                 主循环（唯一喂 dt 的地方）、resize、性能降级
    Cine.js                相机：只维护目标位姿，距离由「必须入镜的点」实时投影求解
    Input.js               指针/触摸 → tap / swipe / drag / hold 手势
    Layout.js              屏幕尺寸、安全区、每阶段实测的底部遮挡高度
    StageMachine.js        阶段状态机 + 黑场转场
    Tween.js               极简补间（每帧喂 dt，零分配）+ 常用缓动/抛物线飞行
    Audio.js               Web Audio 程序化音效（无音频文件）
  data/
    config.js              ★ 所有可调参数：配色、镜头、难度、权重、时长
    recipes.js             ★ 14 种配菜、4 款碗、3 款格子盘、称号文案
    scoring.js             ★ 评分公式（纯函数，好单独调平衡）
  props/                   锅、碗（参数化釉色）、格子盘、砧板、调味罐、米线、厨房台面
  props/ingredients/       14 种配菜的几何体 + 表面细节件 + 多边形裁剪（切菜的核心）
  render/                  渲染器/灯光、toon 材质与程序化贴图、描边、汤面 shader、粒子
  stages/                  S1Broth / S2Cut / S3Noodle / S4Plate / S5Result
  ui/                      面板 DOM、结果页、小组件
vendor/three/              three.module.js + three.core.js（缺一不可）+ 两个 addon
tools/                     开发自检脚本（截图/探针，可整个删掉，不影响游戏）
```

---

## 想改哪里

| 想改的东西 | 改这里 |
| --- | --- |
| 整体配色 | `src/data/config.js` → `COLORS`（同时供 3D 与 CSS 用） |
| 镜头取景 | `src/data/config.js` → `FRAMES`，见下方说明 |
| 炖汤时长 / 最佳火力区间 / 盐量容差 | `config.js` → `BROTH` |
| 调味料种类与颜色 | `config.js` → `SEASONINGS` |
| 切菜手感（最短刀长、直线度门槛、碎块上限、手指偏移） | `config.js` → `CUT` |
| 煮米线的指针速度、甜区 | `config.js` → `NOODLE` |
| 各环节分值权重 | `config.js` → `WEIGHTS` |
| 配菜清单（增删食材、名字、颜色） | `src/data/recipes.js` → `INGREDIENTS` |
| 碗的款式（釉色/纹样/审美分） | `recipes.js` → `BOWLS`（`src/props/Bowl.js` 按 `pattern` 画釉带） |
| 格子盘款式（圆 8 格 / 方 9 格 / 桥形 5 格） | `recipes.js` → `TRAYS` + `src/props/Tray.js` |
| 称号与评语 | `recipes.js` → `TIERS` |
| 评分曲线 | `src/data/scoring.js` |
| 米饭博客外链 | `config.js` → `LINKS`（开场页那个写死在 `index.html` 的 `.boot-link`，改的时候两边一起改） |

### 关于镜头

`FRAMES` 里每个阶段只写两样东西：

```js
s2: {
  target: [0, 0.12, -0.26],   // 大致看哪儿
  dir:    [0, 0.90, 0.44],    // 大致从哪个方向看
  focus:  [ ... ]             // 必须完整入镜的世界坐标点
}
```

真正的相机距离由 `core/Cine.js` 用这些 `focus` 点做**真实投影迭代**反算：
每帧投影一遍点集、量出包围盒、算出还差多少倍，迭代 7 次收敛。
同时它会扣掉顶部标题条和**实测的底部面板遮挡高度**，所以：

- 换手机、换比例、转横屏都不用重新调常量
- 加了新的 UI 元素也不会把画面挡住（`Layout.setObstruction` 会重新量）
- 想知道某个阶段该放哪些点：把「少一个就不好看」的轮廓点写进去即可

有些阶段的取景框**运行期才定得下来**（装盘页的盘子有圆 / 方 / 桥三种形状和大小），
这时用 `cine.setFocusOverride(name, { target, dir, h, points })` 临时替换该阶段的
`focus`，离开阶段前 `setFocusOverride(null)` 还原。`S4Plate._frameTray()` 就是按选中
盘子的真实 `halfW / halfD × scale` 现算的，所以三只盘子上屏后的占比一致。

---

## 手机适配细节

- **触摸**：`Input.js` 把原始指针事件归一成 `tap / swipe / drag / hold`；切菜的判定线就在触摸点（`CUT.fingerOffsetPx = 0`，手指挡住切口时可以把它调大）
- **触屏拖放**：配菜卡片的 `.chip` 必须写 `touch-action: pan-x`。默认的 `auto` 会让浏览器把手势判成滚动并抛 `pointercancel`，表现就是「食材刚拖起来就掉在盘边」；`S4Plate` 同时把 `pointercancel` 当**取消**处理（收回而不是落盘），并且松手点不在盘内时不算有效落点
- **安全区**：`env(safe-area-inset-*)` 用一个隐藏探针读出真实像素值，再并进布局和相机取景
- **高度**：`100dvh` → `--vh`（由 `visualViewport` 写入）→ 安全区探针，三层兜底，iOS 地址栏伸缩不会顶掉按钮
- **横屏**：`@media (min-aspect-ratio: 1/1) and (max-height: 560px)` 把面板压成底部一条、结果页分数排两列，中间留给画面
- **音效**：Web Audio 全程序化生成；iOS 必须在用户手势里 `resume()`，已在「开始下厨」按钮里处理
- **性能**：不跑 shadowMap（用假阴影贴片）、只给主角描边、粒子走池化、整场景约 37 drawcall / 36k 三角面

---

## 米线为什么看起来是软的

软是两件事叠出来的，缺一件都会像铁丝：

1. **几何**（`props/Noodles.js → buildNestGeo`）：一堆「圆顶」上的懒弧线，外加一层从堆顶翻过肩、垂到堆脚、末端往里勾的垂挂线 —— 只有会往下垂的东西才像软的
2. **动**：`nestMat` 用 `onBeforeCompile` 插了一段顶点摇曳（`uTime`，振幅 0.01），由 `App.tick` 每帧写 `updateNoodleWobble()`。描边材质是自写的 `ShaderMaterial`，要单独插同一段位移，否则描边会和本体分家

另外：米线是细管，描边必须用 `makeOutlineMaterial(0.003)` 这种小宽度 + 暖色（近黑的粗轮廓会让细管看起来像电线）。

---

## 分享海报

出餐页的「保存海报」不是截屏，而是 `ui/Poster.js` 现画一张 1080×1600 的竖版图：

1. **菜品图**：临时把 WebGL 缓冲区改成 1000×620（pixelRatio 1.6）、按三件套的 `Box3` 重新架机位渲染一次，`toDataURL` 之后再原样恢复——所以竖屏 / 横屏 / 桌面出的海报构图完全一致，也不会有被面板压住的下半屏
2. **排版**：标题 / 日期 / 菜品图 / 总分 + 称号印章 / 评语 / 七项分数条 / 配菜清单 / 页脚，全部画在 2D canvas 上（配色抄 `main.css` 的变量）
3. **交付**：弹层里给出图片，「长按保存」+ 下载按钮；支持 `navigator.canShare({files})` 的浏览器会多一个系统分享按钮

要调版式只改 `Poster.js` 顶部的 `W / H / HERO_*` 和 `drawPoster()` 里的坐标；取景太紧就调 `fitDist(..., 0.88)` 这个留白系数，想让人和菜整体偏下就调 `target.y += 0.16`。



---

## 开发自检（可选）

`tools/drive.js` 会用 Puppeteer 驱动 Chrome 自动通关一遍并逐阶段截图，用于回归检查：

```bash
node tools/drive.js                 # 竖屏 390×844
node tools/drive.js 812 375 land    # 横屏
node tools/drive.js 390 844 p s2    # 只跑到第 2 关
```

依赖全局安装的 puppeteer（脚本里写死了本机路径，按需改成你的）和本地 Chrome。

`tools/touch-test.js` 是触屏交互的专项回归（用真实 CDP touch 事件），验证三件事：

```bash
node tools/touch-test.js
```

- 米线摇曳是否真的在动（同一区域截两张图比对，画面完全相同就是 shader 没跑起来）
- 拖配菜时**整个拖动过程中不能落盘**，只在抬手时落下
- 手势被系统打断（`pointercancel`）时应当**收回**，而不是掉在盘边

`tools/poster-test.js` 专门验海报：跑到结果页、点「保存海报」，把海报本体导出成 png 供肉眼检查（同时打印弹层里图片的天然尺寸，正常是 1080×1600）：

```bash
node tools/poster-test.js            # 竖屏
node tools/poster-test.js 812 375    # 横屏
```


输出在 `shots/`，同时打印每阶段的 `obstr`（面板遮挡像素）/`usable`（可用高度比）/drawcall。
`tools/shot.js` 是只截单帧的简化版。

`shots/` 里是 390×844 与 812×375 两套全流程截图，只是本地留档，没有进仓库（`.gitignore` 里排掉了）。
