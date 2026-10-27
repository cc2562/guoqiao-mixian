/**
 * 分享海报：把出餐的 3D 画面 + 得分明细画成一张竖版图。
 *
 * 关键点：海报里的菜品图**不是**截当前屏幕，而是按海报 hero 的比例
 * 另外架一个相机、按三件套的真实包围盒重新取景渲染一次 ——
 * 这样竖屏 / 横屏 / 桌面出来的海报构图一致，也不会带上被面板压住的下半屏。
 */
import * as THREE from 'three';
import { breakdown } from '../data/scoring.js';

const W = 1080;
const H = 1600;
const M = 40;                       // 外留白
const HERO_X = M;
const HERO_Y = 246;
const HERO_W = W - M * 2;           // 1000
const HERO_H = 620;
const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif';

const C = {
  ink: '#4a2e22',
  ink2: '#7f5947',
  ink3: '#a98773',
  red: '#d9432f',
  gold: '#e08e2b',
  goldLt: '#ffd27a',
  green: '#7fb069',
  greenDk: '#5d9445',
  redLt: '#f0a08e',
};

/* ---------------- 画图小工具 ---------------- */

function rr(g, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rad, y);
  g.arcTo(x + w, y, x + w, y + h, rad);
  g.arcTo(x + w, y + h, x, y + h, rad);
  g.arcTo(x, y + h, x, y, rad);
  g.arcTo(x, y, x + w, y, rad);
  g.closePath();
}

/** 逐字折行（中文没有词边界，按宽度断就行），超出行数补省略号 */
function wrapText(g, text, x, y, maxW, lh, maxLines = 2) {
  const chars = [...text];
  const lines = [];
  let line = '';
  for (const ch of chars) {
    if (g.measureText(line + ch).width > maxW) {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines) break;
    } else {
      line += ch;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  const cut = lines.join('').length < chars.length;
  if (cut && lines.length) {
    let last = lines[lines.length - 1];
    while (last && g.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    lines[lines.length - 1] = last + '…';
  }
  lines.forEach((s, i) => g.fillText(s, x, y + i * lh));
  return lines.length;
}

/* ---------------- 菜品图：另架机位渲一张 ---------------- */

/** 按 8 个包围盒角点反算「刚好装下」的距离（思路同 core/Cine.js） */
function fitDist(cam, target, dir, pts, fit) {
  const tanHalf = Math.tan((cam.fov * Math.PI) / 360);
  const tmp = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  let dist = 4;

  const measure = () => {
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.lookAt(target);
    cam.updateMatrixWorld(true);
    let mnX = 1e9, mxX = -1e9, mnY = 1e9, mxY = -1e9;
    for (const p of pts) {
      tmp.copy(p).project(cam);
      if (tmp.x < mnX) mnX = tmp.x;
      if (tmp.x > mxX) mxX = tmp.x;
      if (tmp.y < mnY) mnY = tmp.y;
      if (tmp.y > mxY) mxY = tmp.y;
    }
    return { mnX, mxX, mnY, mxY };
  };

  // 前半段：边收边把内容中心推到画面中心
  for (let it = 0; it < 7; it++) {
    const b = measure();
    const bw = Math.max(1e-3, b.mxX - b.mnX);
    const bh = Math.max(1e-3, b.mxY - b.mnY);
    const s = Math.min((2 * fit) / bw, (2 * fit) / bh);
    dist /= Math.pow(Math.max(0.2, Math.min(5, s)), 0.92);

    const kY = tanHalf * dist;
    const kX = kY * cam.aspect;
    right.setFromMatrixColumn(cam.matrixWorld, 0);
    up.setFromMatrixColumn(cam.matrixWorld, 1);
    target.addScaledVector(right, (b.mnX + b.mxX) * 0.5 * kX);
    target.addScaledVector(up, (b.mnY + b.mxY) * 0.5 * kY);
  }

  // 后半段：只调距离。最后一帧必须是**验证过**的，否则会多出一截被裁掉
  for (let it = 0; it < 4; it++) {
    const b = measure();
    const bw = Math.max(1e-3, b.mxX - b.mnX);
    const bh = Math.max(1e-3, b.mxY - b.mnY);
    const s = Math.min((2 * fit) / bw, (2 * fit) / bh);
    dist /= Math.pow(Math.max(0.2, Math.min(5, s)), 0.92);
  }
  return dist;
}

async function captureHero(ctx) {
  const gl = ctx.renderer.renderer;
  const cam = ctx.camera;
  const stage = ctx.stages && ctx.stages.s5;

  const prev = {
    pr: gl.getPixelRatio(),
    w: ctx.layout.w,
    h: ctx.layout.h,
    aspect: cam.aspect,
    fov: cam.fov,
    pos: cam.position.clone(),
    quat: cam.quaternion.clone(),
  };

  const PR = 1.6;
  try {
    gl.setPixelRatio(PR);
    gl.setSize(HERO_W, HERO_H, false);     // CSS 尺寸保持原样，只换缓冲区
    cam.aspect = HERO_W / HERO_H;
    cam.fov = 40;
    cam.updateProjectionMatrix();

    let target;
    let pts;
    if (stage && stage.group) {
      stage.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(stage.group);
      target = box.getCenter(new THREE.Vector3());
      pts = [];
      for (let i = 0; i < 8; i++) {
        pts.push(new THREE.Vector3(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z
        ));
      }
    } else {
      target = new THREE.Vector3(0, 0.2, 0);
      pts = [
        new THREE.Vector3(-1.4, 0, -1.2), new THREE.Vector3(1.4, 0, -1.2),
        new THREE.Vector3(-1.4, 0, 1.2), new THREE.Vector3(1.4, 0, 1.2),
        new THREE.Vector3(0, 0.6, 0),
      ];
    }

    const dir = new THREE.Vector3(0.10, 0.62, 0.78).normalize();
    // 略微抬高注视点：镜头跟着抬高，盘子整体往画面下方落一点，
    // 底部那块空桌面就不会白占 1/4 个 hero
    target.y += 0.16;
    const dist = fitDist(cam, target, dir, pts, 0.88);
    cam.position.copy(target).addScaledVector(dir, dist);
    cam.lookAt(target);
    cam.updateMatrixWorld(true);

    gl.render(ctx.scene, cam);
    const url = gl.domElement.toDataURL('image/png');
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = () => rej(new Error('hero image decode failed'));
      img.src = url;
    });
    return img;
  } finally {
    gl.setPixelRatio(prev.pr);
    gl.setSize(prev.w, prev.h, false);
    cam.aspect = prev.aspect;
    cam.fov = prev.fov;
    cam.updateProjectionMatrix();
    cam.position.copy(prev.pos);
    cam.quaternion.copy(prev.quat);
    cam.updateMatrixWorld(true);
  }
}

/* ---------------- 拼版 ---------------- */

function drawPoster(hero, info) {
  const { score, pickedNames = [], isRecord = false, date = new Date() } = info;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');

  /* 背景 */
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#fffaf1');
  bg.addColorStop(0.42, '#ffeed6');
  bg.addColorStop(1, '#f5d9b0');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  const glow = g.createRadialGradient(W * 0.5, 90, 30, W * 0.5, 90, 880);
  glow.addColorStop(0, 'rgba(255,255,255,0.92)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, 900);

  // 细边框
  g.strokeStyle = 'rgba(122,74,48,0.16)';
  g.lineWidth = 3;
  rr(g, 22, 22, W - 44, H - 44, 46);
  g.stroke();

  /* 标题 */
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = C.ink;
  g.font = `900 76px ${FONT}`;
  g.fillText('过桥米线', M + 20, 150);

  g.fillStyle = C.ink3;
  g.font = `500 29px ${FONT}`;
  g.fillText('一碗米线的修行 · 炖汤 · 切配 · 煮制 · 装盘', M + 24, 202);

  // 右上：日期
  const pad = (n) => String(n).padStart(2, '0');
  g.textAlign = 'right';
  g.fillStyle = C.ink3;
  g.font = `600 26px ${FONT}`;
  g.fillText(`${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`, W - M - 16, 150);

  /* 菜品图 */
  g.save();
  g.shadowColor = 'rgba(122,74,48,0.22)';
  g.shadowBlur = 34;
  g.shadowOffsetY = 14;
  rr(g, HERO_X, HERO_Y, HERO_W, HERO_H, 30);
  g.fillStyle = '#fffdf7';
  g.fill();
  g.restore();

  g.save();
  rr(g, HERO_X, HERO_Y, HERO_W, HERO_H, 30);
  g.clip();
  g.drawImage(hero, HERO_X, HERO_Y, HERO_W, HERO_H);
  g.restore();

  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 6;
  rr(g, HERO_X + 3, HERO_Y + 3, HERO_W - 6, HERO_H - 6, 27);
  g.stroke();

  /* 总分 */
  const total = Math.round(score.total);
  g.textAlign = 'left';
  g.fillStyle = C.red;
  g.font = `900 176px ${FONT}`;
  g.fillText(String(total), M + 14, 1032);

  const numW = g.measureText(String(total)).width;
  g.fillStyle = C.ink3;
  g.font = `800 44px ${FONT}`;
  g.fillText('分', M + 24 + numW, 1032);

  // 新纪录
  if (isRecord) {
    g.font = `800 26px ${FONT}`;
    const bw = g.measureText('新纪录').width + 30;
    const bx = M + 32 + numW + 54;
    g.fillStyle = C.green;
    rr(g, bx, 966, bw, 42, 12);
    g.fill();
    g.fillStyle = '#fff';
    g.fillText('新纪录', bx + 15, 996);
  }

  /* 称号印章 */
  g.save();
  g.translate(830, 962);
  g.rotate((-6 * Math.PI) / 180);
  g.fillStyle = C.red;
  rr(g, -150, -54, 300, 108, 16);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.14)';
  rr(g, -150, -54, 300, 46, 16);
  g.fill();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.font = `900 50px ${FONT}`;
  g.fillText(score.tier.name, 0, 18);
  g.restore();

  /* 评语 */
  g.textAlign = 'left';
  g.fillStyle = C.ink2;
  g.font = `500 31px ${FONT}`;
  wrapText(g, score.tier.comment, M + 16, 1100, W - M * 2 - 32, 44, 2);

  /* 七项明细：两列 */
  const rows = breakdown(score);
  const colX = [M + 16, 556];
  const rowH = 46;
  const top = 1210;
  rows.forEach((it, i) => {
    const col = i < 4 ? 0 : 1;
    const row = i < 4 ? i : i - 4;
    const x = colX[col];
    const y = top + row * rowH;
    const ratio = Math.max(0, Math.min(1, it.value / it.max));
    const hi = ratio >= 0.8;
    const lo = ratio <= 0.4;

    g.fillStyle = C.ink2;
    g.font = `600 27px ${FONT}`;
    g.textAlign = 'left';
    g.fillText(it.label, x, y + 26);

    // 条
    const bx = x + 150;
    const bw = 232;
    g.fillStyle = 'rgba(122,74,48,0.12)';
    rr(g, bx, y + 14, bw, 12, 6);
    g.fill();
    if (ratio > 0.001) {
      const grd = g.createLinearGradient(bx, 0, bx + bw, 0);
      if (hi) {
        grd.addColorStop(0, '#a8d48f');
        grd.addColorStop(1, C.greenDk);
      } else if (lo) {
        grd.addColorStop(0, C.redLt);
        grd.addColorStop(1, C.red);
      } else {
        grd.addColorStop(0, C.goldLt);
        grd.addColorStop(1, C.gold);
      }
      g.fillStyle = grd;
      rr(g, bx, y + 14, Math.max(12, bw * ratio), 12, 6);
      g.fill();
    }

    // 数值（"20/20" 这种要贴在一起读，所以先量后缀再右对齐数字）
    const val = Number(it.value.toFixed(1)).toString();
    const suf = `/${it.max}`;
    g.textAlign = 'right';
    g.fillStyle = C.ink3;
    g.font = `600 22px ${FONT}`;
    const sufW = g.measureText(suf).width;
    g.fillText(suf, x + 466, y + 26);
    g.fillStyle = C.ink;
    g.font = `800 27px ${FONT}`;
    g.fillText(val, x + 466 - sufW - 4, y + 26);
  });

  /* 配菜 */
  if (pickedNames.length) {
    g.textAlign = 'left';
    g.fillStyle = C.ink3;
    g.font = `500 27px ${FONT}`;
    wrapText(g, `本次配菜 · ${pickedNames.join('、')}（${pickedNames.length} 样）`, M + 16, 1444, W - M * 2 - 32, 40, 2);
  }

  /* 页脚 */
  g.save();
  g.strokeStyle = 'rgba(122,74,48,0.2)';
  g.lineWidth = 2;
  g.setLineDash([8, 10]);
  g.beginPath();
  g.moveTo(M + 16, 1526);
  g.lineTo(W - M - 16, 1526);
  g.stroke();
  g.restore();

  g.fillStyle = C.ink3;
  g.font = `700 25px ${FONT}`;
  g.textAlign = 'left';
  g.fillText('过桥米线 · 网页小游戏', M + 16, 1570);
  g.textAlign = 'right';
  g.font = `500 25px ${FONT}`;
  g.fillText('100 分制 · 现做现评', W - M - 16, 1570);

  return cv;
}

/** 生成海报（返回 canvas） */
export async function buildPoster(ctx, info) {
  const hero = await captureHero(ctx);
  return drawPoster(hero, info);
}

/* ---------------- 弹层：长按保存 / 下载 / 分享 ---------------- */

export function openPosterSheet(canvas, filename = '过桥米线.png') {
  const url = canvas.toDataURL('image/png');

  const sheet = document.createElement('div');
  sheet.className = 'poster-sheet';

  const frame = document.createElement('div');
  frame.className = 'poster-frame';
  const img = document.createElement('img');
  img.src = url;
  img.alt = '分享海报';
  frame.appendChild(img);
  sheet.appendChild(frame);

  // 横屏时这一列会挪到海报右边，竖屏时还是在下面
  const side = document.createElement('div');
  side.className = 'poster-side';

  const hint = document.createElement('div');
  hint.className = 'poster-hint';
  hint.textContent = '长按图片可保存到相册';
  side.appendChild(hint);

  const btns = document.createElement('div');
  btns.className = 'poster-btns';

  const close = () => {
    sheet.remove();
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'primary';
  save.textContent = '保存图片';
  save.addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    hint.textContent = '已保存 · 也可以长按图片存相册';
  });

  btns.appendChild(save);

  // 支持分享文件的浏览器（手机 Chrome / Safari 新版）直接调系统分享
  if (navigator.canShare && window.File) {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], filename, { type: 'image/png' });
      if (!navigator.canShare({ files: [file] })) return;
      const share = document.createElement('button');
      share.type = 'button';
      share.className = 'secondary';
      share.textContent = '分享';
      share.addEventListener('click', () => {
        navigator.share({ files: [file], title: '过桥米线' }).catch(() => { /* 用户取消就算了 */ });
      });
      btns.insertBefore(share, btns.firstChild);
    }, 'image/png');
  }

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'ghost';
  back.textContent = '关闭';
  back.addEventListener('click', close);
  btns.appendChild(back);

  sheet.appendChild(side);
  side.appendChild(btns);
  sheet.addEventListener('pointerdown', (e) => { if (e.target === sheet) close(); });
  window.addEventListener('keydown', onKey);

  document.body.appendChild(sheet);
  return sheet;
}
