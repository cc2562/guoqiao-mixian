/**
 * 全流程截图/自检脚本。
 * 用法：
 *   node tools/drive.js                # 竖屏 390x844
 *   node tools/drive.js 812 375 land    # 横屏
 *   node tools/drive.js 390 844 p s2    # 只跑到 s2
 */
const path = require('path');
const fs = require('fs');
const puppeteer = require(path.join('C:/Users/23710/.workbuddy/binaries/node/workspace/node_modules', 'puppeteer'));

const W = +(process.argv[2] || 390);
const H = +(process.argv[3] || 844);
const TAG = process.argv[4] || (W > H ? 'land' : 'port');
const STOP = process.argv[5] || 's5';

const OUT = 'C:/Users/23710/WorkBuddy/过桥米线游戏/shots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logs = [];
let shotIdx = 0;

async function shot(page, name) {
  const file = `${OUT}/${TAG}-${name}.png`;
  await page.screenshot({ path: file });
  console.log('  shot', path.basename(file));
  shotIdx++;
}

/** 轮询直到 fn 返回真值 */
async function until(page, fn, timeout = 20000, step = 120) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await page.evaluate(fn);
    if (v) return v;
    await sleep(step);
  }
  return null;
}

/**
 * 用合成 PointerEvent 驱动触屏（headless + swiftshader 下 CDP 的 touch 事件不落地）。
 * 回放的是真实 App 的 pointerdown/move/up 路径，只是采样点由我们给定。
 */
async function touchDrag(page, pts) {
  await page.evaluate(async (pts) => {
    const el = document.getElementById('gl');
    const mk = (t, x, y) => new PointerEvent(t, {
      pointerId: 7, pointerType: 'touch', clientX: x, clientY: y,
      bubbles: true, cancelable: true, isPrimary: true, button: 0, buttons: 1,
    });
    el.dispatchEvent(mk('pointerdown', pts[0][0], pts[0][1]));
    for (let i = 1; i < pts.length; i++) {
      await new Promise((r) => setTimeout(r, 24));
      el.dispatchEvent(mk('pointermove', pts[i][0], pts[i][1]));
    }
    await new Promise((r) => setTimeout(r, 24));
    el.dispatchEvent(mk('pointerup', pts[pts.length - 1][0], pts[pts.length - 1][1]));
  }, pts);
}

/** 单步指针事件（用于「按到一半截图」这类检查） */
async function ptr(page, type, x, y) {
  const ev = type.startsWith('pointer') ? type : 'pointer' + type;
  await page.evaluate(([ev, x, y]) => {
    const el = document.getElementById('gl');
    el.dispatchEvent(new PointerEvent(ev, {
      pointerId: 7, pointerType: 'touch', clientX: x, clientY: y,
      bubbles: true, cancelable: true, isPrimary: true, button: 0,
      buttons: ev === 'pointerup' ? 0 : 1,
    }));
  }, [ev, x, y]);
}

async function touchTap(page, x, y) {  await page.evaluate(async ([x, y]) => {
    const el = document.getElementById('gl');
    const mk = (t) => new PointerEvent(t, {
      pointerId: 9, pointerType: 'touch', clientX: x, clientY: y,
      bubbles: true, cancelable: true, isPrimary: true, button: 0, buttons: t === 'pointerup' ? 0 : 1,
    });
    el.dispatchEvent(mk('pointerdown'));
    await new Promise((r) => setTimeout(r, 60));
    el.dispatchEvent(mk('pointerup'));
  }, [x, y]);
}

/** 把世界坐标投影到屏幕像素 */
async function proj(page, x, y, z) {
  return page.evaluate(([x, y, z]) => window.__app.input.project({ x, y, z }), [x, y, z]);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      `--window-size=${W},${H}`,
    ],
    defaultViewport: { width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  global.__browser = browser;
  const page = await browser.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${t}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });

  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const booted = await until(page, () => window.__gqmx_booted === true, 40000, 250);
  if (!booted) console.log('WARN boot flag not set');
  await sleep(2200);
  await shot(page, '00-boot');
  if (STOP === 'boot') return finish();

  const started = await page.evaluate(() => {
    const b = document.getElementById('btn-start');
    if (!b || b.disabled) return false;
    b.click();
    return true;
  });
  console.log('started', started);

  /* ---------------- S1 ---------------- */
  await sleep(2400);
  await shot(page, '01-s1-a');

  // 加调味料：盐 x2 + 枸杞 + 葱段
  await page.evaluate(() => {
    const chips = [...document.querySelectorAll('#stage-ui .chips .chip')];
    for (const i of [0, 0, 4, 3]) chips[i] && chips[i].click();
  });
  await sleep(900);
  await page.evaluate(() => { window.__app.stages.s1.heat = 72; });
  await sleep(600);
  await shot(page, '01-s1-b');

  // 直接推到「汤滚了」看沸腾表现
  await page.evaluate(() => { window.__app.stages.s1.cook = 0.985; });
  await sleep(1400);
  await shot(page, '01-s1-c');

  const s1 = await page.evaluate(() => {
    const st = window.__app.stages.s1;
    return { cook: +st.cook.toFixed(2), inBand: +st.inBand.toFixed(1), counts: st.counts, ready: st.ready };
  });
  console.log('S1', JSON.stringify(s1));

  if (STOP === 's1') return finish();

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#actions button')].find((x) => x.textContent.includes('熬好'));
    b && b.click();
  });

  /* ---------------- S2 ---------------- */
  await until(page, () => window.__app.machine.name === 's2');
  await sleep(1200);
  await shot(page, '02-s2-a');

  // 挑 6 样配菜
  const picked = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#stage-ui .cards .card')];
    const want = [0, 1, 3, 4, 6, 12];
    for (const i of want) cards[i] && cards[i].click();
    const st = window.__app.stages.s2;
    return { n: st.picked.length, active: st.activeId, cards: cards.length };
  });
  console.log('S2 pick', JSON.stringify(picked));
  await sleep(900);
  await shot(page, '02-s2-b');

  // 在砧板上切三刀（touch 判定点上移 fingerOffsetPx）
  const center = await proj(page, 0, 0.12, 0);
  const OFF = 0;   // 与 CUT.fingerOffsetPx 对齐（0 = 判定线就在触摸点）
  const cx = center.x, cy = center.y + OFF;

  // 第一刀：拖到一半先截一张刀光
  await ptr(page, 'down', cx - 90, cy);
  for (const dx of [-60, -30, 0]) {
    await sleep(26);
    await ptr(page, 'move', cx + dx, cy);
  }
  await sleep(110);
  const bladeState = await page.evaluate(() => {
    const s = window.__app.stages.s2;
    return {
      vis: s.blade.visible, cutting: s.cutting, g: s.gesture.length,
      dr: s.bladeGeo.drawRange.count, op: +s.bladeMat.opacity.toFixed(2),
    };
  });
  console.log('BLADE', JSON.stringify(bladeState));
  await shot(page, '02-s2-blade');
  for (const dx of [30, 60, 90]) {
    await sleep(26);
    await ptr(page, 'move', cx + dx, cy);
  }
  await sleep(26);
  await ptr(page, 'up', cx + 90, cy);
  await sleep(90);
  await shot(page, '02-s2-slash');
  await sleep(400);

  const rot = await proj(page, 0, 0.12, 0);
  await touchDrag(page, [[rot.x, rot.y + OFF - 60], [rot.x + 1, rot.y + OFF - 20], [rot.x, rot.y + OFF + 20], [rot.x - 1, rot.y + OFF + 60]]);
  await sleep(420);
  await touchDrag(page, [[cx - 70, cy + 60], [cx - 30, cy + 20], [cx + 10, cy - 20], [cx + 50, cy - 60]]);
  await sleep(700);
  await shot(page, '02-s2-c');

  const s2 = await page.evaluate(() => {
    const st = window.__app.stages.s2;
    const sl = st.activeSlicer;
    return {
      pieces: sl ? sl.pieceCount : -1,
      cuts: st.qualities.length,
      cutScore: st.cutText.textContent.replace(/\s+/g, ' ').trim(),
    };
  });
  console.log('S2', JSON.stringify(s2));

  if (STOP === 's2') return finish();

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#actions button')].find((x) => x.textContent.includes('米线'));
    b && b.click();
  });

  /* ---------------- S3 ---------------- */
  await until(page, () => window.__app.machine.name === 's3');
  await until(page, () => window.__app.stages.s3.phase === 'timing');
  await sleep(700);
  await shot(page, '03-s3-a');

  // 等指针进甜区
  await until(page, () => {
    const st = window.__app.stages.s3;
    return st.phase === 'timing' && Math.abs(st.needlePos - 0.42) < 0.06;
  }, 8000, 40);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#actions button')].find((x) => x.textContent.includes('捞起'));
    b && b.click();
  });
  await until(page, () => window.__app.stages.s3.phase === 'bowl');
  await sleep(1400);
  await shot(page, '03-s3-b');

  // 点第三只碗（左下）装米线
  const bowlScreen = await proj(page, -0.70, 0.30, -0.62);
  console.log('bowl screen', JSON.stringify(bowlScreen));
  await touchTap(page, bowlScreen.x, bowlScreen.y);
  await until(page, () => window.__app.stages.s3.phase === 'done');
  await sleep(1500);
  await shot(page, '03-s3-c');

  const s3 = await page.evaluate(() => {
    const st = window.__app.stages.s3;
    return {
      chosen: st.chosen,
      noodleValue: +st.noodleValue.toFixed(2),
      noodleBowlId: window.__app.save.noodleBowlId,
    };
  });
  console.log('S3', JSON.stringify(s3));

  if (STOP === 's3') return finish();

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#actions button')].find((x) => x.textContent.includes('装盘'));
    b && b.click();
  });

  /* ---------------- S4 装盘 ---------------- */
  await until(page, () => window.__app.machine.name === 's4');
  await until(page, () => window.__app.stages.s4.phase === 'pickBowl');
  await sleep(1600);
  await shot(page, '04-s4-a');

  // 选汤碗（左上）
  const soupScr = await proj(page, -0.70, 0.30, 0.62);
  await touchTap(page, soupScr.x, soupScr.y);

  // 倒汤中途截一张（选碗 420 + 锅滑入 460 + 盛汤 900）
  await sleep(1500);
  await shot(page, '04-s4-b');

  const poured = await until(page, () => window.__app.stages.s4.phase === 'pickTray', 16000);
  console.log('poured', !!poured);
  await sleep(700);
  await shot(page, '04-s4-c');

  // 选格子盘（中间那只）
  const trayScr = await proj(page, 0.10, 0.10, 0.46);
  await touchTap(page, trayScr.x, trayScr.y);
  await until(page, () => window.__app.stages.s4.phase === 'place', 16000);
  await sleep(1600);
  await shot(page, '04-s4-d');

  // 一样一样拖进格盘：每样落到不同的格
  for (let k = 0; k < 14; k++) {
    const r = await page.evaluate((k) => {
      const st = window.__app.stages.s4;
      if (st.finished) return 'done';
      const chip = [...st.chipWrap.querySelectorAll('.chip')]
        .find((b) => !b.classList.contains('used'));
      if (!chip) return 'nochip';

      const cr = chip.getBoundingClientRect();
      const tray = st.tray;
      const cells = tray.cells || [];
      // 打散落点，别都堆到左上角
      const order = [0, 4, 8, 2, 6, 5, 3, 7, 1];
      const c = cells[order[k % order.length] % Math.max(1, cells.length)] || { x: 0, z: 0 };
      const t = tray.group.position;
      const sc = tray.group.scale.x || 1;
      const dst = window.__app.input.project({
        x: t.x + c.x * sc, y: tray.topY * sc, z: t.z + c.z * sc,
      });

      const mk = (type, x, y) => new PointerEvent(type, {
        pointerId: 21, pointerType: 'touch', clientX: x, clientY: y,
        bubbles: true, cancelable: true, isPrimary: true, button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
      });
      const cx = cr.left + cr.width / 2;
      const cy = cr.top + cr.height / 2;
      chip.dispatchEvent(mk('pointerdown', cx, cy));
      window.dispatchEvent(mk('pointermove', cx, cy - 60));
      window.dispatchEvent(mk('pointermove', (cx + dst.x) / 2, (cy + dst.y) / 2));
      window.dispatchEvent(mk('pointermove', dst.x, dst.y));
      window.dispatchEvent(mk('pointerup', dst.x, dst.y));
      return { key: chip.dataset.key, dst: [Math.round(dst.x), Math.round(dst.y)] };
    }, k);
    if (r === 'done' || r === 'nochip') break;
    if (k === 0) console.log('drag', JSON.stringify(r));
    await sleep(600);
    if (k === 2) await shot(page, '04-s4-e');
  }
  await sleep(1400);
  await shot(page, '04-s4-f');

  const s4 = await page.evaluate(() => {
    const st = window.__app.stages.s4;
    return {
      phase: st.phase, placed: st.placedCount, total: st.total,
      bowlId: window.__app.save.bowlId, trayId: window.__app.save.trayId,
      plate: window.__app.score.plate, plating: window.__app.score.plating,
    };
  });
  console.log('S4', JSON.stringify(s4));

  if (STOP === 's4') return finish();

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#actions button')].find((x) => x.textContent.includes('上桌'));
    b && b.click();
  });

  /* ---------------- S5 ---------------- */
  await until(page, () => window.__app.machine.name === 's5');
  await sleep(1400);
  await shot(page, '05-s5-a');
  const stamped = await until(page, () => {
    const st = document.querySelector('.stamp');
    return st && st.classList.contains('on');
  }, 15000, 200);
  console.log('stamped', !!stamped);
  await sleep(900);
  await shot(page, '05-s5-b');

  const s5 = await page.evaluate(() => {
    const a = window.__app;
    return {
      score: a.score,
      total: document.querySelector('.result-panel') ? document.querySelector('.result-panel').textContent.replace(/\s+/g, ' ').trim().slice(0, 220) : null,
    };
  });
  console.log('S5 total', JSON.stringify(s5.total));

  /* ---------------- 分享海报 ---------------- */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#actions button')].find((x) => x.textContent.includes('海报'));
    if (b) b.click();
  });
  const sheet = await until(page, () => !!document.querySelector('.poster-frame img'), 20000, 150);
  await sleep(700);
  await shot(page, '05-s5-poster');
  const poster = await page.evaluate(() => {
    const img = document.querySelector('.poster-frame img');
    if (!img) return null;
    const cv = document.querySelector('.poster-frame');
    return {
      w: img.naturalWidth,
      h: img.naturalHeight,
      bx: Math.round(cv.getBoundingClientRect().width),
      by: Math.round(cv.getBoundingClientRect().height),
      btns: [...document.querySelectorAll('.poster-btns button')].map((x) => x.textContent),
    };
  });
  console.log('POSTER', JSON.stringify(poster), 'sheet', !!sheet);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.poster-btns button')].find((x) => x.textContent.includes('关闭'));
    if (b) b.click();
  });
  await sleep(300);

  await finish();

  async function finish() {
    const info = await page.evaluate(() => {
      const a = window.__app;
      if (!a) return { error: 'no app' };
      const r = (sel) => {
        const n = document.querySelector(sel);
        if (!n) return null;
        const b = n.getBoundingClientRect();
        return [Math.round(b.top), Math.round(b.bottom)];
      };
      return {
        stage: a.machine.name,
        tier: a.tierName,
        dpr: a.dpr,
        calls: a.r3d.info(),
        cam: a.camera.position.toArray().map((v) => +v.toFixed(2)),
        vh: window.innerHeight,
        obstr: a.layout.obstr,
        usable: Object.fromEntries(Object.keys(a.stages).map((k) => [k, +a.layout.usableFor(k).toFixed(3)])),
        panel: r('#stage-ui .panel'),
        actions: r('#actions'),
      };
    });
    console.log('INFO', JSON.stringify(info));
    if (logs.length) console.log('LOGS\n' + logs.slice(0, 40).join('\n'));
    else console.log('LOGS (clean)');
    console.log('shots:', shotIdx);
    await browser.close();
  }
})().catch(async (e) => {
  console.error('FATAL', e && e.message);
  console.error(e && e.stack);
  if (global.__browser) { try { await global.__browser.close(); } catch (_) {} }
  process.exit(1);
});
