/**
 * 极简 DOM 组件工厂（不引框架，避免构建步骤）。
 */

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function button({ label, cls = 'primary', onClick, id } = {}) {
  const b = el('button', cls, label);
  if (id) b.id = id;
  b.type = 'button';
  if (onClick) {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      onClick(e);
    });
  }
  return b;
}

export function iconButton(svgPath, aria, onClick) {
  const b = el('button', 'icon-btn');
  b.setAttribute('aria-label', aria);
  b.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="${svgPath}" fill="currentColor"/></svg>`;
  b.addEventListener('click', onClick);
  return b;
}

/** 调味料 chip */
export function chip({ label, dot, onClick }) {
  const c = el('button', 'chip');
  c.type = 'button';
  const d = el('span', 'dot');
  d.style.background = dot || '#eee';
  c.appendChild(d);
  c.appendChild(el('span', '', label));
  const cnt = el('span', 'cnt', '0');
  c.appendChild(cnt);

  c.addEventListener('click', (e) => {
    e.preventDefault();
    onClick && onClick(c);
  });

  c.setCount = (n) => {
    cnt.textContent = n;
    cnt.classList.toggle('on', n > 0);
  };
  return c;
}

/** 配菜卡片 */
export function card({ ing, icon, onClick }) {
  const b = el('button', 'card');
  b.type = 'button';
  const img = el('img');
  img.src = icon;
  img.alt = ing.name;
  img.draggable = false;
  b.appendChild(img);
  b.appendChild(el('span', 'nm', ing.name));
  b.appendChild(el('span', 'tag', ing.tag));
  b.dataset.id = ing.id;

  b.addEventListener('click', (e) => {
    e.preventDefault();
    onClick && onClick(b, ing);
  });
  return b;
}

/** 火力滑块 */
export function slider({ min = 0, max = 100, value = 50, onInput }) {
  const wrap = el('div', 'slider-row');
  wrap.appendChild(el('span', 'lab', '小火'));
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.value = value;
  input.step = 1;
  input.addEventListener('input', () => onInput && onInput(Number(input.value)));
  wrap.appendChild(input);
  wrap.appendChild(el('span', 'lab', '猛火'));
  wrap.input = input;
  return wrap;
}

/** 进度条 */
export function bar({ green = false } = {}) {
  const root = el('div', 'bar' + (green ? ' green' : ''));
  const fill = el('i');
  root.appendChild(fill);
  return {
    root,
    set(v) { fill.style.width = Math.max(0, Math.min(1, v)) * 100 + '%'; },
  };
}

export function barRow(labelText) {
  const row = el('div', 'bar-row');
  const b = bar();
  const pct = el('span', 'pct', '0%');
  row.appendChild(b.root);
  row.appendChild(pct);
  return {
    root: row,
    set(v) {
      b.set(v);
      pct.textContent = Math.round(Math.max(0, Math.min(1, v)) * 100) + '%';
    },
  };
}

export function panel(children, { className = 'panel' } = {}) {
  const p = el('div', className);
  for (const c of children) if (c) p.appendChild(c);
  return p;
}

export function row(...children) {
  const r = el('div', 'row between');
  for (const c of children) if (c) r.appendChild(c);
  return r;
}

export function label(text) {
  return el('div', 'panel-label', text);
}

export function metaText(html) {
  const m = el('span', 'meta');
  m.innerHTML = html;
  return m;
}

/** 手势引导小气泡 */
export function guide(text) {
  const g = el('div', 'guide', text);
  return g;
}

/** 计时指针条 */
export function timingBar() {
  const root = el('div', 'timing-bar');
  const zone = el('div', 'zone');
  const needle = el('div', 'needle');
  root.appendChild(zone);
  root.appendChild(needle);

  return {
    root,
    setZone(center, half) {
      const left = Math.max(0, center - half);
      zone.style.left = left * 100 + '%';
      zone.style.width = Math.min(1, half * 2) * 100 + '%';
    },
    setNeedle(v) {
      needle.style.left = Math.max(0, Math.min(1, v)) * 100 + '%';
    },
  };
}
