/** 海报出图验证：跑到 s5 → 点「保存海报」→ 弹层截图 + 把海报本体存成 png */
const path = require('path');
const fs = require('fs');
const puppeteer = require(path.join('C:/Users/23710/.workbuddy/binaries/node/workspace/node_modules', 'puppeteer'));

const W = +(process.argv[2] || 390);
const H = +(process.argv[3] || 844);
const OUT = 'C:/Users/23710/WorkBuddy/过桥米线游戏/shots';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(page, fn, timeout = 20000, step = 120) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const v = await page.evaluate(fn); if (v) return v; await sleep(step); }
  return null;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', `--window-size=${W},${H}`],
    defaultViewport: { width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'domcontentloaded' });
  await until(page, () => window.__gqmx_booted === true, 40000, 250);
  await sleep(1500);
  await page.evaluate(() => { const b = document.getElementById('btn-start'); if (b && !b.disabled) b.click(); });
  await until(page, () => window.__app.machine.name === 's1' && !window.__app.machine.busy, 12000);

  await page.evaluate(() => {
    const a = window.__app;
    a.save.picked = ['liji', 'heiyu', 'surou', 'huotui', 'doufuPi', 'jiucai'];
    a.save.pieces = {};
    a.save.bowlId = 'qinghua';
    a.save.noodleBowlId = 'heitao';
    a.save.trayId = 'fang';
    const s = a.score;
    s.heat.value = 20;
    s.season.value = 12.6;
    s.cut.value = 13.6;
    s.noodle.value = 15;
    s.garnish.value = 8.7;
    s.plate.value = 9.8;
    s.plating = { placed: 6, total: 6, value: 15 };
    a.machine.go('s5');
  });
  await until(page, () => window.__app.machine.name === 's5' && !window.__app.machine.busy, 25000);
  await until(page, () => {
    const s = document.querySelector('.stamp');
    return s && s.classList.contains('on');
  }, 20000, 200);
  await sleep(800);
  await page.screenshot({ path: `${OUT}/poster-stage-${W}x${H}.png` });

  const info = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#actions button')];
    const b = btns.find((x) => x.textContent.includes('海报'));
    if (b) b.click();
    return { labels: btns.map((x) => x.textContent), clicked: !!b };
  });
  console.log('buttons', JSON.stringify(info));

  const opened = await until(page, () => !!document.querySelector('.poster-frame img'), 15000, 150);
  console.log('sheet opened', !!opened);
  await sleep(700);
  await page.screenshot({ path: `${OUT}/poster-sheet-${W}x${H}.png` });

  const url = await page.evaluate(() => {
    const img = document.querySelector('.poster-frame img');
    return img ? { src: img.src, w: img.naturalWidth, h: img.naturalHeight } : null;
  });
  if (url && url.src.startsWith('data:image/png;base64,')) {
    const buf = Buffer.from(url.src.slice('data:image/png;base64,'.length), 'base64');
    const file = `${OUT}/poster-${W}x${H}.png`;
    fs.writeFileSync(file, buf);
    console.log('poster', file, url.w + 'x' + url.h, (buf.length / 1024).toFixed(0) + 'KB');
  }

  const perf = await page.evaluate(() => {
    const a = window.__app;
    const gl = a.r3d.renderer;
    return {
      canvas: [gl.domElement.width, gl.domElement.height],
      layout: [a.layout.w, a.layout.h],
      pr: gl.getPixelRatio(),
      fov: a.camera.fov,
      aspect: +a.camera.aspect.toFixed(3),
      pos: a.camera.position.toArray().map((v) => +v.toFixed(2)),
      calls: a.r3d.info(),
    };
  });
  console.log('restored', JSON.stringify(perf));
  console.log('ERRORS', errs.length ? errs.slice(0, 6) : '(none)');
  await browser.close();
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });
