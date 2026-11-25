// 鼠标交互：标签、地址栏、列表选择、中键、拖放（标签排序/跨分屏、文件移动/复制）
const pIdx = e => { const p = e.target.closest?.('.pane'); return p ? +p.dataset.p : -1; };
const rowOf = (e, t) => { const r = e.target.closest?.('tr.row'); return r ? t.view[+r.dataset.i]?.it : null; };
const selItems = t => t.view.filter(x => t.sel.has(x.it.p)).map(x => x.it);

function setActivePane(pi) {
  if (pi === ap) return;
  ap = pi;
  panes.forEach((P, i) => P.el.classList.toggle('act', i === ap && panes.length > 1));
  renderStatus();
}

function select(t, p, e) {
  const v = t.view, ia = v.findIndex(x => x.it.p === t.anchor);
  if (e.shiftKey && ia >= 0) {
    const ib = v.findIndex(x => x.it.p === p);
    if (!e.ctrlKey) t.sel.clear();
    v.slice(Math.min(ia, ib), Math.max(ia, ib) + 1).forEach(x => t.sel.add(x.it.p));
  } else if (e.ctrlKey || e.metaKey) {
    t.sel.has(p) ? t.sel.delete(p) : t.sel.add(p);
    t.anchor = p;
  } else { t.sel = new Set([p]); t.anchor = p; }
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

function openItem(t, it) {
  if (it.d) nav(t, it.p);
  else invoke('shell_open', { path: it.p }).catch(e => toast(errText(e)));
}

function openOther(pi, p) {
  if (panes.length === 1) { const t = mkTab(p); panes.push({ tabs: [t], act: 0 }); layout = 'h'; ap = 1; renderAll(); load(t); }
  else openTab(p, 1 - pi);
}

function editCrumb(pi) {
  const cr = $('.crumb', panes[pi].el), t = cur(pi);
  cr.innerHTML = `<input value="${esc(displayPath(t.path))}" spellcheck="false">`;
  const inp = $('input', cr);
  inp.focus();
  inp.select();
  let fin = false;
  const done = async go => {
    if (fin) return;
    fin = true;
    const v = inp.value.trim();
    cr.innerHTML = '';
    if (!go || !v) return renderPane(pi);
    if (v === '此电脑') return nav(t, ROOT);
    try {
      const r = await invoke('resolve_path', { input: v });
      nav(t, r.dir, 'push', r.select || undefined);
    } catch (e) { toast(`找不到“${esc(v)}”：${errText(e)}`); renderPane(pi); }
  };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
  inp.onblur = () => done(false);
}

panesEl.addEventListener('mousedown', e => {
  const pi = pIdx(e);
  if (pi < 0) return;
  if (e.button === 1) e.preventDefault();   // 阻止中键自动滚动
  if (e.button === 3 || e.button === 4) { e.preventDefault(); setActivePane(pi); return (e.button === 3 ? goBack : goFwd)(cur(pi)); }   // 鼠标侧键
  setActivePane(pi);
});

panesEl.addEventListener('click', e => {
  const pi = pIdx(e);
  if (pi < 0) return;
  const t = cur(pi), a = e.target.closest('[data-a]')?.dataset.a, tabEl = e.target.closest('.tab');
  if (a === 'close') return closeTab(pi, +tabEl.dataset.t);
  if (a === 'add') return openTab(t.path, pi);
  if (tabEl) return activate(pi, +tabEl.dataset.t);
  if (a === 'back') return goBack(t);
  if (a === 'fwd') return goFwd(t);
  if (a === 'up') return goUp(t);
  if (a === 'refresh') return t.rec && t.q.trim() ? startSearch(t) : load(t, true);
  if (a === 'mode') return setMode(t, !t.rec);
  if (a === 'deep') return setMode(t, true);
  const k = e.target.closest('.crumb a')?.dataset.k;
  if (k != null) return nav(t, +k ? chainOf(t.path)[k - 1] : ROOT);
  if (e.target.classList.contains('crumb')) return editCrumb(pi);
  const loc = e.target.closest('[data-loc]');
  if (loc) { const it = t.view[+loc.dataset.loc].it; return nav(t, parentOf(it.p), 'push', it.p); }
  const th = e.target.closest('th');
  if (th) { const s = th.dataset.s; t.sort = { k: s, a: t.sort.k === s ? -t.sort.a : 1 }; saveSession(); return refresh(t, true); }
  if (e.target.closest('.list')) {
    const it = rowOf(e, t);
    if (it) select(t, it.p, e); else if (!e.ctrlKey && !e.shiftKey) t.sel.clear();
    redrawSel(pi);
  }
});

panesEl.addEventListener('dblclick', e => {
  const pi = pIdx(e);
  if (pi < 0) return;
  const t = cur(pi);
  if (e.target.closest('.tabs') && !e.target.closest('.tab, .addtab')) return openTab(t.path, pi);   // 双击标签栏空白 = 新标签
  const it = rowOf(e, t);
  if (it) openItem(t, it);
});

panesEl.addEventListener('auxclick', e => {
  if (e.button !== 1) return;
  const pi = pIdx(e);
  if (pi < 0) return;
  const tabEl = e.target.closest('.tab');
  if (tabEl) return closeTab(pi, +tabEl.dataset.t);       // 中键标签 = 关闭
  const it = rowOf(e, cur(pi));
  if (it?.d) { openTab(it.p, pi, false); toast(`已在后台标签中打开 <b>${esc(itemLabel(it))}</b>`); }   // 中键文件夹 = 新标签
});

panesEl.addEventListener('input', e => {
  if (!e.target.matches('.search input')) return;
  const t = cur(pIdx(e));
  t.q = e.target.value;
  if (t.rec) { clearTimeout(t.deb); t.deb = setTimeout(() => startSearch(t), 300); }
  else refresh(t, true, true);   // 即时筛选
});

sideEl.addEventListener('click', e => { const d = e.target.closest('[data-path]'); if (d) nav(cur(), d.dataset.path); });
sideEl.addEventListener('mousedown', e => e.button === 1 && e.preventDefault());
sideEl.addEventListener('auxclick', e => {
  const d = e.target.closest('[data-path]');
  if (d && e.button === 1) { openTab(d.dataset.path, ap, false); toast('已在后台标签中打开'); }
});
statusEl.addEventListener('click', e => { if (e.target.closest('[data-a=cancel]')) { stopSearch(cur(), true); refresh(cur(), true); } });
app.addEventListener('click', e => { if (e.target.closest('.toast [data-a=undo]')) doUndo(); });

// 拖放（窗口内部）：标签排序/跨分屏；文件拖到另一分屏、文件夹或标签上 = 移动，按住 Ctrl = 复制
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
  if (te) { const p = panes[pi].tabs[+te.dataset.t].path; return p === ROOT ? null : { pi, el: te, path: p }; }   // 文件拖到标签上 = 放进该标签的文件夹
  const it = rowOf(e, t);
  if (it?.d) return { pi, el: e.target.closest('tr'), path: it.p };
  const list = e.target.closest('.list');
  return list && t.path !== ROOT && !(t.rec && t.res) ? { pi, el: list, path: t.path } : null;
}
panesEl.addEventListener('dragstart', e => {
  const pi = pIdx(e), t = cur(pi), te = e.target.closest('.tab');
  if (te) drag = { type: 'tab', pi, ti: +te.dataset.t };
  else {
    const it = rowOf(e, t);
    if (!it || it.k === 'drive') return e.preventDefault();
    if (!t.sel.has(it.p)) { t.sel = new Set([it.p]); t.anchor = it.p; redrawSel(pi); }
    drag = { type: 'files', paths: selItems(t).map(x => x.p) };
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
  else transfer(d.paths, tg.path, e.ctrlKey);
});
document.addEventListener('dragend', () => { drag = null; unmark(); });
