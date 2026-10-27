/**
 * 结果页：7 项分数逐行滚动 + 总分 + 印章 + 称号 + 评语。
 */
import { el } from './widgets.js';
import { breakdown } from '../data/scoring.js';
import { LINKS } from '../data/config.js';
import { tween, delay } from '../core/Tween.js';

export function createResultView({ score, pickedNames = [], best = 0, isRecord = false, audio, onStamp }) {
  const panel = el('div', 'result-panel');

  /* ---- 头部 ---- */
  const head = el('div', 'result-head');
  const wrap = el('div', 'total-wrap');
  const num = el('span', 'total-num', '0');
  wrap.appendChild(num);
  wrap.appendChild(el('span', 'total-unit', '分'));
  if (isRecord) wrap.appendChild(el('span', 'new-record', '新纪录'));
  head.appendChild(wrap);

  const stamp = el('div', 'stamp', score.tier.name);
  head.appendChild(stamp);
  panel.appendChild(head);

  /* ---- 明细 ---- */
  const rows = el('div', 'score-rows');
  const items = breakdown(score);
  const rowNodes = items.map((it) => {
    const r = el('div', 'score-row');
    r.appendChild(el('span', 'k', it.label));
    const barWrap = el('div', 'mini-bar' + (it.value >= it.max * 0.8 ? ' hi' : it.value <= it.max * 0.4 ? ' lo' : ''));
    const fill = el('i');
    barWrap.appendChild(fill);
    r.appendChild(barWrap);
    const v = el('span', 'v');
    v.innerHTML = `0 <em>/${it.max}</em>`;
    r.appendChild(v);
    rows.appendChild(r);
    return { node: r, fill, v, it };
  });
  panel.appendChild(rows);

  /* ---- 评语 ---- */
  const comment = el('div', 'result-comment');
  comment.innerHTML = `<b>${score.tier.name}</b> · ${score.tier.comment}`;
  panel.appendChild(comment);

  if (pickedNames.length) {
    const list = el('div', 'picked-list');
    list.textContent = `本次配菜：${pickedNames.join('、')}（${pickedNames.length} 样）`;
    panel.appendChild(list);
  }

  /* ---- 米饭博客入口 ---- */
  const link = el('a', 'result-link');
  link.href = LINKS.blog;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = `在${LINKS.blogName}看更多 · ${LINKS.blogHost}`;
  panel.appendChild(link);

  /* ---- 播放动画 ---- */
  async function play() {
    for (let i = 0; i < rowNodes.length; i++) {
      const { fill, v, it } = rowNodes[i];
      await tween({
        dur: 420,
        ease: 'outCubic',
        update: (e) => {
          const val = it.value * e;
          fill.style.width = (it.value / it.max) * e * 100 + '%';
          v.innerHTML = `${val.toFixed(1).replace(/\.0$/, '')} <em>/${it.max}</em>`;
        },
      });
      audio && audio.ding(Math.min(6, Math.round((it.value / it.max) * 6)));
      await delay(60);
    }

    // 总分
    await tween({
      dur: 620,
      ease: 'outCubic',
      update: (e) => {
        num.textContent = Math.round(score.total * e);
      },
    });
    num.textContent = Math.round(score.total);

    stamp.classList.add('on');
    audio && audio.stamp();
    onStamp && onStamp();
  }

  return { node: panel, play };
}
