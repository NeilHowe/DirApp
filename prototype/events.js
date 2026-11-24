// 鼠标交互：标签、地址栏、列表选择、中键、拖放（标签排序/跨分屏、文件移动/复制）
const pIdx = e => { const p = e.target.closest?.('.pane'); return p ? +p.dataset.p : -1; };
const rowOf = (e, t) => { const r = e.target.closest?.('tr.row'); return r ? t.view[+r.dataset.i] : null; };
const selNodes = t => t.view.filter(x => t.sel.has(x.n)).map(x => x.n);

function setActivePane(pi) {
  if (pi === ap) return;
  ap = pi;
  panes.forEach((P, i) => P.el.classList.toggle('act', i === ap && panes.length > 1));
  renderStatus();
}

function select(t, n, e) {
  const v = t.view, ia = v.findIndex(x => x.n === t.anchor);
  if (e.shiftKey && ia >= 0) {
    const ib = v.findIndex(x => x.n === n);
    if (!e.ctrlKey) t.sel.clear();
    v.slice(Math.min(ia, ib), Math.max(ia, ib) + 1).forEach(x => t.sel.add(x.n));
  } else if (e.ctrlKey || e.metaKey) {
    t.sel.has(n) ? t.sel.delete(n) : t.sel.add(n);
    t.anchor = n;
  } else { t.sel = new Set([n]); t.anchor = n; }
}

function setMode(t, rec) {
  t.rec = rec;
  stopSearch(t);
  t.res = null;
  t.cancelled = false;
  if (rec && t.q.trim()) startSearch(t); else refresh(t, true);
  const pi = paneOf(t);
  if (pi >= 0) $('.search input', panes[pi].el).focus();
}

function openItem(t, n) {
  if (n.d) nav(t, n);
  else toast(`打开 <b>${esc(n.n)}</b>（原型中只做模拟）`);
}

function openOther(pi, n) {
  if (panes.length === 1) { panes.push({ tabs: [mkTab(n)], act: 0 }); layout = 'h'; ap = 1; renderAll(); }
  else openTab(n, 1 - pi);
}

function editCrumb(pi) {
  const cr = $('.crumb', panes[pi].el), t = cur(pi);
  cr.innerHTML = `<input value="${esc(pathOf(t.node))}" spellcheck="false">`;
  const inp = $('input', cr);
  inp.focus();
  inp.select();
  let fin = false;
  const done = go => {
    if (fin) return;
    fin = true;
    const n = go ? resolve(inp.value) : null;
    cr.innerHTML = '';
    if (go && !n) toast(`找不到“${esc(inp.value)}”，请检查路径`);
    if (n) nav(t, n); else renderPane(pi);
  };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
  inp.onblur = () => done(false);
}

panesEl.addEventListener('mousedown', e => {
  const pi = pIdx(e);
  if (pi < 0) return;
  if (e.button === 1) e.preventDefault();   // 阻止中键自动滚动
  setActivePane(pi);
});

panesEl.addEventListener('click', e => {
  const pi = pIdx(e);
  if (pi < 0) return;
  const P = panes[pi], t = cur(pi), a = e.target.closest('[data-a]')?.dataset.a, tabEl = e.target.closest('.tab');
  if (a === 'close') return closeTab(pi, +tabEl.dataset.t);
  if (a === 'add') return openTab(t.node, pi);
  if (tabEl) { P.act = +tabEl.dataset.t; return renderAll(); }
  if (a === 'back') return goBack(t);
  if (a === 'fwd') return goFwd(t);
  if (a === 'up') return goUp(t);
  if (a === 'refresh') return t.rec && t.q.trim() ? startSearch(t) : (refresh(t, true), toast('已刷新'));
  if (a === 'mode') return setMode(t, !t.rec);
  if (a === 'deep') return setMode(t, true);
  const k = e.target.closest('.crumb a')?.dataset.k;
  if (k != null) return nav(t, +k ? chain(t.node)[k - 1] : ROOT);
  if (e.target.classList.contains('crumb')) return editCrumb(pi);
  const loc = e.target.closest('[data-loc]');
  if (loc) { const n = t.view[+loc.dataset.loc].n; return nav(t, n.p, 'push', n); }
  const th = e.target.closest('th');
  if (th) { const s = th.dataset.s; t.sort = { k: s, a: t.sort.k === s ? -t.sort.a : 1 }; return refresh(t, true); }
  if (e.target.closest('.list')) {
    const it = rowOf(e, t);
    if (it) select(t, it.n, e); else t.sel.clear();
    renderList(pi);
    renderStatus();
  }
});

panesEl.addEventListener('dblclick', e => {
  const pi = pIdx(e);
  if (pi < 0) return;
  const t = cur(pi);
  if (e.target.closest('.tabs') && !e.target.closest('.tab, .addtab')) return openTab(t.node, pi);   // 双击标签栏空白 = 新标签
  const it = rowOf(e, t);
  if (it) openItem(t, it.n);
});

panesEl.addEventListener('auxclick', e => {
  if (e.button !== 1) return;
  const pi = pIdx(e);
  if (pi < 0) return;
  const tabEl = e.target.closest('.tab');
  if (tabEl) return closeTab(pi, +tabEl.dataset.t);       // 中键标签 = 关闭
  const it = rowOf(e, cur(pi));
  if (it?.n.d) { openTab(it.n, pi, false); toast(`已在后台标签中打开 <b>${esc(label(it.n))}</b>`); }   // 中键文件夹 = 新标签
});

panesEl.addEventListener('input', e => {
  if (!e.target.matches('.search input')) return;
  const t = cur(pIdx(e));
  t.q = e.target.value;
  if (t.rec) { clearTimeout(t.deb); t.deb = setTimeout(() => startSearch(t), 250); }
  else refresh(t, true, true);   // 即时过滤
});

sideEl.addEventListener('click', e => { const d = e.target.closest('[data-path]'); if (d) nav(cur(), resolve(d.dataset.path)); });
sideEl.addEventListener('mousedown', e => e.button === 1 && e.preventDefault());
sideEl.addEventListener('auxclick', e => {
  const d = e.target.closest('[data-path]');
  if (d && e.button === 1) { openTab(resolve(d.dataset.path), ap, false); toast('已在后台标签中打开'); }
});
statusEl.addEventListener('click', e => { if (e.target.closest('[data-a=cancel]')) { stopSearch(cur(), true); refresh(cur(), true); } });
app.addEventListener('click', e => { if (e.target.closest('.toast [data-a=undo]')) doUndo(); });

// 拖放
let drag = null, dropEl = null;
const unmark = () => { dropEl?.classList.remove('drop'); dropEl = null; };
function dropTarget(e) {
  const pi = pIdx(e);
  if (pi < 0) return null;
  const t = cur(pi), te = e.target.closest('.tab');
  if (drag.type === 'tab') {
    const bar = e.target.closest('.tabs');
    return bar && { pi, el: te || bar, ti: te ? +te.dataset.t : panes[pi].tabs.length };
  }
  if (te) return { pi, el: te, node: panes[pi].tabs[+te.dataset.t].node };   // 文件拖到标签上 = 放进该标签的文件夹
  const it = rowOf(e, t);
  if (it?.n.d) return { pi, el: e.target.closest('tr'), node: it.n };
  const list = e.target.closest('.list');
  return list && t.node !== ROOT ? { pi, el: list, node: t.node } : null;
}
panesEl.addEventListener('dragstart', e => {
  const pi = pIdx(e), t = cur(pi), te = e.target.closest('.tab');
  if (te) drag = { type: 'tab', pi, ti: +te.dataset.t };
  else {
    const it = rowOf(e, t);
    if (!it) return;
    if (!t.sel.has(it.n)) { t.sel = new Set([it.n]); t.anchor = it.n; }
    drag = { type: 'files', nodes: selNodes(t) };
  }
  e.dataTransfer.setData('text/plain', 'dirapp');
  e.dataTransfer.effectAllowed = 'copyMove';
});
panesEl.addEventListener('dragover', e => {
  const tg = drag && dropTarget(e);
  if (!tg) return unmark();
  e.preventDefault();
  e.dataTransfer.dropEffect = drag.type === 'files' && e.ctrlKey ? 'copy' : 'move';
  if (dropEl !== tg.el) { unmark(); dropEl = tg.el; dropEl.classList.add('drop'); }
});
panesEl.addEventListener('drop', e => {
  const tg = drag && dropTarget(e), d = drag;
  unmark();
  drag = null;
  if (!tg) return;
  e.preventDefault();
  if (d.type === 'tab') moveTab(d.pi, d.ti, tg.pi, tg.ti);
  else transfer(d.nodes, tg.node, e.ctrlKey);   // 按住 Ctrl = 复制
});
document.addEventListener('dragend', () => { drag = null; unmark(); renderAll(); });
