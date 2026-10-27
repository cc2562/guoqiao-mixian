/**
 * 两个触屏相关的手工验证：
 *   A. 米线摇曳是否真的在动（同一区域截两张图比对）
 *   B. 触屏拖配菜：拖动过程中不能被提前落盘（真实 CDP touch 事件）
 */
const path = require('path');
const puppeteer = require(path.join('C:/Users/23710/.workbuddy/binaries/node/workspace/node_modules', 'puppeteer'));

const W = 390, H = 844;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(page, fn, timeout = 20000, step = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const v = await page.evaluate(fn); if (v) return v; await sleep(step); }
  return null;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', `--window-size=${W},${H}`],
    defaultViewport: { width: W, height: H, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const cdp = await page.target().createCDPSession();

  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'domcontentloaded' });
  await until(page, () => window.__gqmx_booted === true, 40000, 250);
  await sleep(1500);
  await page.evaluate(() => { const b = document.getElementById('btn-start'); if (b && !b.disabled) b.click(); });
  await until(page, () => window.__app.machine.name === 's1' && !window.__app.machine.busy, 12000);

  /* ---------- A. 摇曳 ---------- */
  await page.evaluate(() => { window.__app.machine.go('s3'); });
  await until(page, () => window.__app.machine.name === 's3' && !window.__app.machine.busy, 20000);
  await page.evaluate(() => {
    const st = window.__app.stages.s3;
    st.phase = 'done';           // 关掉蒸汽/气泡，剩下的画面基本是静态的
    st.pot.group.visible = false;
    st.nest.visible = true;
    st.nest.position.set(0, 0.30, 0.10);
    st.nest.scale.setScalar(1);
    st.nest.rotation.set(0, 0.6, 0);
    window.__app.cine.lookAt({ x: 0, y: 0.3, z: 0.1 }, 2.2, [0, 0.45, 0.89]);
  });
  await sleep(1800);
  const clip = await page.evaluate(() => {
    const s = window.__app.input.project({ x: 0, y: 0.30, z: 0.10 });
    return { x: Math.max(0, Math.round(s.x - 130)), y: Math.max(0, Math.round(s.y - 130)), width: 260, height: 260 };
  });
  const a1 = await page.screenshot({ clip });
  await sleep(700);
  const a2 = await page.screenshot({ clip });
  const same = Buffer.compare(Buffer.from(a1), Buffer.from(a2)) === 0;
  console.log('WOBBLE', same ? 'STATIC (没动)' : 'ANIMATING ✓', '| bytes', a1.length, a2.length);
  await page.screenshot({ path: 'C:/Users/23710/WorkBuddy/过桥米线游戏/shots/t-nest.png' });

  /* ---------- B. 触屏拖拽 ---------- */
  await page.evaluate(() => {
    const a = window.__app;
    a.save.picked = ['liji', 'surou', 'huotui'];
    a.save.pieces = {};
    a.machine.go('s4');
  });
  await until(page, () => window.__app.machine.name === 's4' && !window.__app.machine.busy, 25000);
  await until(page, () => window.__app.stages.s4.phase === 'pickBowl', 15000);
  await sleep(400);
  await page.evaluate(() => { window.__app.stages.s4.chooseBowl(0); });
  await until(page, () => window.__app.stages.s4.phase === 'pickTray', 25000);
  await sleep(600);
  await page.evaluate(() => { window.__app.stages.s4.chooseTray(1); });
  await until(page, () => window.__app.stages.s4.phase === 'place', 25000);
  await sleep(1600);

  // 记录窗口上的指针事件，看有没有 pointercancel 抢戏
  await page.evaluate(() => {
    window.__evt = [];
    for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      window.addEventListener(t, (e) => window.__evt.push(t + ':' + (e.pointerType || '?')), true);
    }
  });

  const geo = await page.evaluate(() => {
    const st = window.__app.stages.s4;
    const chip = st.chipWrap.querySelector('.chip:not(.used)');
    const r = chip.getBoundingClientRect();
    const t = st.tray;
    const sc = t.group.scale.x;
    const s = window.__app.input.project({ x: t.group.position.x, y: t.topY * sc, z: t.group.position.z });
    return { from: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, to: { x: Math.round(s.x), y: Math.round(s.y) } };
  });

  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: geo.from.x, y: geo.from.y, radiusX: 12, radiusY: 12, force: 1, id: 1 }],
  });
  await sleep(60);

  const trail = [];
  const N = 10;
  for (let i = 1; i <= N; i++) {
    const x = geo.from.x + (geo.to.x - geo.from.x) * (i / N);
    const y = geo.from.y + (geo.to.y - geo.from.y) * (i / N);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y, radiusX: 12, radiusY: 12, force: 1, id: 1 }],
    });
    await sleep(40);
    const st = await page.evaluate(() => ({
      placed: window.__app.stages.s4.placedCount,
      hover: !!window.__app.stages.s4.hover,
      drop: !!window.__app.stages.s4.hover && !!window.__app.stages.s4.hover.drop,
    }));
    trail.push(`${i}:${st.placed}/${st.hover ? 'H' : '-'}${st.drop ? 'D' : ''}`);
  }

  const mid = await page.screenshot();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(700);
  const after = await page.evaluate(() => ({
    placed: window.__app.stages.s4.placedCount,
    evt: window.__evt.slice(0, 24),
  }));

  console.log('DRAG trail  ', trail.join(' '));
  console.log('DRAG after  ', JSON.stringify(after));
  console.log('DRAG 中途截图 bytes', mid.length);

  /* ---------- C. 手势被系统打断时必须「收回」而不是落盘 ---------- */
  const geo2 = await page.evaluate(() => {
    const st = window.__app.stages.s4;
    const chip = st.chipWrap.querySelector('.chip:not(.used)');
    const r = chip.getBoundingClientRect();
    const t = st.tray;
    const sc = t.group.scale.x;
    const s = window.__app.input.project({ x: t.group.position.x, y: t.topY * sc, z: t.group.position.z });
    return { from: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, to: { x: Math.round(s.x), y: Math.round(s.y) } };
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: geo2.from.x, y: geo2.from.y, radiusX: 12, radiusY: 12, force: 1, id: 2 }],
  });
  for (let i = 1; i <= 8; i++) {
    const x = geo2.from.x + (geo2.to.x - geo2.from.x) * (i / 8);
    const y = geo2.from.y + (geo2.to.y - geo2.from.y) * (i / 8);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y, radiusX: 12, radiusY: 12, force: 1, id: 2 }],
    });
    await sleep(35);
  }
  const beforeCancel = await page.evaluate(() => window.__app.stages.s4.placedCount);
  // 模拟浏览器抢走手势（真实手机上滚动手势会这样打断）
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 2, pointerType: 'touch', bubbles: true }));
  });
  await sleep(400);
  const afterCancel = await page.evaluate(() => ({
    placed: window.__app.stages.s4.placedCount,
    hover: !!window.__app.stages.s4.hover,
  }));
  console.log('CANCEL 拖动中 placed=' + beforeCancel, '→ 打断后', JSON.stringify(afterCancel),
    afterCancel.placed === beforeCancel && !afterCancel.hover ? '✓ 收回' : '✗ 被落盘了');

  await page.screenshot({ path: 'C:/Users/23710/WorkBuddy/过桥米线游戏/shots/t-drag.png' });
  console.log('ERRORS', errs.length ? errs.slice(0, 6) : '(none)');
  await browser.close();
})().catch((e) => { console.error('FATAL', e && e.message); process.exit(1); });
