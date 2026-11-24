// 右键菜单、键盘快捷键、启动
const menu = document.createElement('div');
menu.className = 'menu';
menu.hidden = true;
document.body.append(menu);
function showMenu(e, items) {
  e.preventDefault();
  menu.innerHTML = items.map((it, i) => it ? `<div data-m="${i}">${it[0]}${it[2] ? `<span class="k">${it[2]}</span>` : ''}</div>` : '<hr>').join('');
  menu.items = items;
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(e.clientX, innerWidth - r.width - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(e.clientY, innerHeight - r.height - 4)) + 'px';
}
menu.addEventListener('click', e => { const d = e.target.closest('[data-m]'); if (d) { menu.hidden = true; menu.items[+d.dataset.m][1](); } });
document.addEventListener('mousedown', e => { if (!menu.contains(e.target)) menu.hidden = true; });
window.addEventListener('blur', () => { menu.hidden = true; });

function closeOthers(pi, keep, rightOnly) {
  const P = panes[pi], ki = P.tabs.indexOf(keep), active = P.tabs[P.act];
  P.tabs = P.tabs.filter((x, i) => { const drop = rightOnly ? i > ki : x !== keep; if (drop) { stopSearch(x); closed.push(x.node); } return !drop; });
  P.act = P.tabs.indexOf(P.tabs.includes(active) ? active : keep);
  renderAll();
}
function pinTab(pi, ti) {
  const P = panes[pi], x = P.tabs[ti], active = P.tabs[P.act];
  x.pin = !x.pin;
  P.tabs.splice(ti, 1);
  P.tabs.splice(P.tabs.filter(y => y.pin).length, 0, x);   // 固定标签排在最左
  P.act = P.tabs.indexOf(active);
  renderAll();
}
function toOther(pi, ti) {
  if (panes.length === 1) {
    if (panes[0].tabs.length < 2) return toast('只有一个标签，无法移到另一侧');
    panes.push({ tabs: [], act: 0 });
    layout = 'h';
  }
  moveTab(pi, ti, 1 - pi, panes[1 - pi].tabs.length);
}

panesEl.addEventListener('contextmenu', e => {
  const pi = pIdx(e);
  if (pi < 0) return;
  setActivePane(pi);
  const P = panes[pi], t = cur(pi), te = e.target.closest('.tab');
  if (te) {
    const ti = +te.dataset.t, x = P.tabs[ti];
    return showMenu(e, [
      ['➕ 新建标签', () => openTab(x.node, pi), 'Ctrl+T'],
      ['⧉ 复制标签', () => { const c = openTab(x.node, pi, true, ti + 1); c.back = [...x.back]; renderAll(); }],
      [x.pin ? '📌 取消固定' : '📌 固定标签', () => pinTab(pi, ti)],
      null,
      ['◫ 移到另一侧分屏', () => toOther(pi, ti)],
      ['🗗 移到新窗口', () => toast('桌面版中把标签拖出窗口即可成为新窗口（浏览器原型无法演示）', 3500)],
      null,
      ['✕ 关闭标签', () => closeTab(pi, ti), 'Ctrl+W'],
      ['关闭其他标签', () => closeOthers(pi, x)],
      ['关闭右侧标签', () => closeOthers(pi, x, true)],
    ]);
  }
  const it = rowOf(e, t);
  if (it) {
    if (!t.sel.has(it.n)) { t.sel = new Set([it.n]); t.anchor = it.n; refresh(t, true); }
    const n = it.n;
    return showMenu(e, [
      ['📂 打开', () => openItem(t, n), 'Enter'],
      ...(n.d ? [['🗂️ 在新标签中打开', () => openTab(n, pi, false), '中键'], ['◫ 在另一侧分屏中打开', () => openOther(pi, n)]] : []),
      ...(t.rec && t.res ? [['📍 打开所在位置', () => nav(t, n.p, 'push', n)]] : []),
      null,
      ['✂️ 剪切', () => setClip(t, true), 'Ctrl+X'],
      ['📋 复制', () => setClip(t, false), 'Ctrl+C'],
      ['🔗 复制路径', () => copyPath(n), 'Ctrl+Shift+C'],
      null,
      ['✏️ 重命名', () => rename(pi, n), 'F2'],
      ['🗑️ 删除', () => del(t), 'Del'],
      null,
      ['ℹ️ 属性', () => props(n)],
    ]);
  }
  if (e.target.closest('.list')) return showMenu(e, [
    ['📁 新建文件夹', () => newFolder(pi), 'Ctrl+Shift+N'],
    ['📋 粘贴', paste, 'Ctrl+V'],
    ['⟳ 刷新', () => refresh(t, true), 'F5'],
    null,
    ['🔍 在子文件夹中搜索', () => setMode(t, true), 'Ctrl+Shift+F'],
    ['⌨️ 在终端中打开', () => toast(`在终端中打开 ${esc(pathOf(t.node))}（模拟）`)],
  ]);
});

function focusSearch(rec) {
  const t = cur(), inp = $('.search input', panes[ap].el);
  if (rec !== undefined && t.rec !== rec) setMode(t, rec);
  inp.focus();
  if (rec !== undefined) inp.select();
}
function moveSel(t, d) {
  const v = t.view;
  if (!v.length) return;
  let i = v.findIndex(x => x.n === t.anchor);
  i = i < 0 ? 0 : Math.max(0, Math.min(v.length - 1, i + d));
  t.sel = new Set([v[i].n]);
  t.anchor = v[i].n;
  refresh(t, true);
  scrollToNode(t, v[i].n);
}

document.addEventListener('keydown', e => {
  const t = cur(), P = panes[ap], k = e.key, lk = k.toLowerCase(), ctrl = e.ctrlKey || e.metaKey, mod = ctrl || e.altKey;
  if (k === 'Escape' && !menu.hidden) { menu.hidden = true; return; }
  const hit = fn => { e.preventDefault(); fn(); };
  // 浏览器会占用 Ctrl+T/W 等组合键，原型里同时支持 Alt+T/W
  if (mod && !e.shiftKey && lk === 't') return hit(() => openTab(t.node));
  if (mod && e.shiftKey && lk === 't') return hit(reopen);
  if (mod && lk === 'w') return hit(() => closeTab(ap, P.act));
  if (ctrl && k === 'Tab') return hit(() => { P.act = (P.act + (e.shiftKey ? -1 : 1) + P.tabs.length) % P.tabs.length; renderAll(); });
  if (e.altKey && /^[1-9]$/.test(k)) return hit(() => { P.act = Math.min(+k, P.tabs.length) - 1; renderAll(); });
  if (ctrl && lk === 'f') return hit(() => focusSearch(e.shiftKey));
  if (ctrl && k === '\\') return hit(() => split(panes.length > 1 ? null : 'h'));
  if ((ctrl && lk === 'l') || (e.altKey && lk === 'd')) return hit(() => editCrumb(ap));
  if (e.altKey && k === 'ArrowLeft') return hit(() => goBack(t));
  if (e.altKey && k === 'ArrowRight') return hit(() => goFwd(t));
  if (e.altKey && k === 'ArrowUp') return hit(() => goUp(t));
  if (e.target.matches('.search input')) {
    if (k === 'Enter') hit(() => t.rec ? startSearch(t) : setMode(t, true));
    else if (k === 'Escape') { if (t.q) { t.q = ''; setMode(t, t.rec); } else $('.list', P.el).focus(); }
    else if (k === 'ArrowDown') hit(() => { $('.list', P.el).focus(); if (!t.sel.size) moveSel(t, 0); });
    return;
  }
  if (e.target.matches('input')) return;
  const sel = selNodes(t);
  if (k === 'Escape') { if (t.q) { t.q = ''; setMode(t, t.rec); } else { t.sel.clear(); refresh(t, true); } }
  else if (k === 'ArrowDown' || k === 'ArrowUp') hit(() => moveSel(t, k === 'ArrowDown' ? 1 : -1));
  else if (k === 'Enter' && sel.length) openItem(t, sel[0]);
  else if (k === 'Backspace') hit(() => goBack(t));
  else if (k === 'Delete') del(t);
  else if (k === 'F2' && sel.length) hit(() => rename(ap, sel[0]));
  else if (k === 'F5') hit(() => (t.rec && t.q.trim() ? startSearch(t) : refresh(t, true)));
  else if (ctrl && lk === 'a') hit(() => { t.view.forEach(x => t.sel.add(x.n)); refresh(t, true); });
  else if (ctrl && lk === 'z') doUndo();
  else if (ctrl && lk === 'x') setClip(t, true);
  else if (ctrl && e.shiftKey && lk === 'c') { if (sel.length) copyPath(sel[0]); }
  else if (ctrl && lk === 'c') setClip(t, false);
  else if (ctrl && lk === 'v') paste();
  else if (ctrl && e.shiftKey && lk === 'n') hit(() => newFolder(ap));
  else if (k.length === 1 && k !== ' ' && !mod) focusSearch();   // 直接打字 = 开始筛选
});

// 侧栏 + 初始状态
const FAV = [['🖥️ 桌面', 'C:\\Users\\me\\桌面'], ['⬇️ 下载', 'C:\\Users\\me\\下载'], ['📄 文档', 'C:\\Users\\me\\文档'], ['🖼️ 图片', 'C:\\Users\\me\\图片'], ['⭐ ToolDev', 'D:\\self\\ToolDev'], ['⭐ Projects', 'D:\\Projects']];
sideEl.innerHTML = '<h4>快速访问</h4>' + FAV.map(([l, p]) => `<div data-path="${esc(p)}" title="${esc(p)}">${l}</div>`).join('')
  + '<h4>此电脑</h4><div data-path="此电脑">💻 此电脑</div><div data-path="C:">💽 本地磁盘 (C:)</div><div data-path="D:">💽 本地磁盘 (D:)</div>';
panes = [{ tabs: ['D:\\self\\ToolDev\\DirApp', 'C:\\Users\\me\\下载', 'C:\\Users\\me\\图片'].map(p => mkTab(resolve(p))), act: 0 }];
renderAll();
