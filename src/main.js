/**
 * 启动器：建 App → 预热着色器 → 等玩家点「开始下厨」→ 进 S1。
 */
import { App } from './core/App.js';

const canvas = document.getElementById('gl');
const startBtn = document.getElementById('btn-start');
const bootHint = document.getElementById('boot-hint');
const bootEl = document.getElementById('boot');

function fatal(msg) {
  window.__gqmx_booted = true;
  if (bootEl) bootEl.classList.add('error');
  if (bootHint) bootHint.innerHTML = msg;
  if (startBtn) startBtn.style.display = 'none';
}

let app = null;
try {
  app = new App(canvas);
  window.__app = app;
} catch (e) {
  console.error(e);
  fatal('初始化失败：' + (e && e.message ? e.message : e) + '<br>请换用支持 WebGL 的浏览器（Chrome / Safari 新版）');
}

if (app) {
  window.__gqmx_booted = true;

  (async () => {
    try {
      if (bootHint) bootHint.textContent = '正在点亮灶台…';
      await app.warmup((p) => {
        app.ui.setBootProgress(0.1 + p * 0.85, p < 0.75 ? '正在备锅…' : '正在预热…');
      });
      app.ui.setBootProgress(1, '一切就绪');
    } catch (e) {
      console.warn('预热失败（不影响游玩）', e);
      app.ui.setBootProgress(1, '一切就绪');
    }
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = '开始下厨';
    }
  })();

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    startBtn.textContent = '点火中…';
    // iOS 必须在用户手势里解锁音频
    await app.audio.unlock();
    app.ui.hideBoot();
    setTimeout(() => app.start(), 280);
  });

  // 上下文丢失兜底
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    app.r3d.renderer.setAnimationLoop(null);
    app.ui.toast('画面丢失，请刷新页面', 'warn', 6000);
  });
}
