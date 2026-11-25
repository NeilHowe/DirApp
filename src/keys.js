// 右键菜单、键盘快捷键、侧栏、启动
const menu = document.createElement('div');
menu.className = 'menu';
menu.hidden = true;
document.body.append(menu);
function showMenu(e, items) {
  e.preventDefault();
  menu.innerHTML = items.map((it, i) => it ? `<div data-m="${i}">${it[3] ? ic(it[3]) : ''}${it[0]}${it[2] ? `<span class="k">${it[2]}</span>` : ''}</div>` : '<hr>').join('');
  menu.items = items;
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(e.clientX, innerWidth - r.width - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(e.clientY, innerHeight - r.height - 4)) + 'px';
}
menu.addEventListener('click', e => { const d = e.target.closest('[data-m]'); if (d) { menu.hidden = true; menu.items[+d.dataset.m][1](); } });
document.addEventListener('mousedown', e => { if (!menu.contains(e.target)) menu.hidden = true; });
window.addEventListener('blur', () => { menu.hidden = true; });
document.addEventListener('contextmenu', e => { if (!e.target.closest('input')) e.preventDefault(); });   // 屏蔽 WebView 自带菜单

function closeOthers(pi, keep, rightOnly) {
  const P = panes[pi], ki = P.tabs.indexOf(keep), active = P.tabs[P.act];
  P.tabs = P.tabs.filter((x, i) => { const drop = rightOnly ? i > ki : x !== keep; if (drop) { stopSearch(x); closed.push(x.path); } return !drop; });
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
  if (pi < 0 || e.target.closest('input')) return;
  setActivePane(pi);
  const P = panes[pi], t = cur(pi), te = e.target.closest('.tab');
  if (te) {
    const ti = +te.dataset.t, x = P.tabs[ti];
    return showMenu(e, [
      ['新建标签', () => openTab(x.path, pi), 'Ctrl+T', 'tabPlus'],
      ['复制标签', () => { const c = openTab(x.path, pi, true, ti + 1); c.back = [...x.back]; renderAll(); }, '', 'copy'],
      [x.pin ? '取消固定' : '固定标签', () => pinTab(pi, ti), '', 'pin'],
      null,
      ['移到另一侧分屏', () => toOther(pi, ti), '', 'splitH'],
      ['移到新窗口', () => toNewWindow(pi, ti), '', 'window'],
      null,
      ['关闭标签', () => closeTab(pi, ti), 'Ctrl+W', 'close'],
      ['关闭其他标签', () => closeOthers(pi, x)],
      ['关闭右侧标签', () => closeOthers(pi, x, true)],
    ]);
  }
  const it = rowOf(e, t);
  if (it) {
    if (!t.sel.has(it.p)) { t.sel = new Set([it.p]); t.anchor = it.p; redrawSel(pi); }
    const sel = selItems(t), drive = it.k === 'drive';
    return showMenu(e, [
      ['打开', () => openItem(t, it), 'Enter', 'folderOpen'],
      ...(it.d ? [['在新标签中打开', () => openTab(it.p, pi, false), '中键', 'tabPlus'], ['在另一侧分屏中打开', () => openOther(pi, it.p), '', 'splitH']] : [['打开方式…', () => invoke('shell_open', { path: it.p, verb: 'openas' }).catch(err => toast(errText(err))), '', 'openWith']]),
      ...(t.rec && t.res ? [['打开所在位置', () => nav(t, parentOf(it.p), 'push', it.p), '', 'location']] : []),
      ['在资源管理器中显示', () => reveal(it.p), '', 'external'],
      null,
      ...(drive ? [] : [['剪切', () => setClip(t, true), 'Ctrl+X', 'cut'], ['复制', () => setClip(t, false), 'Ctrl+C', 'copy']]),
      ['复制路径', () => copyPath(sel), 'Ctrl+Shift+C', 'link'],
      ...(it.d ? [['在终端中打开', () => terminal(it.p), '', 'terminal']] : []),
      null,
      ...(drive ? [] : [['重命名', () => rename(pi, it.p), 'F2', 'edit'], ['删除', () => del(t), 'Del', 'trash']]),
      ['属性', () => props(it.p), 'Alt+Enter', 'info'],
    ]);
  }
  if (e.target.closest('.list')) {
    const dir = t.path !== ROOT;
    return showMenu(e, [
      ...(dir ? [['新建文件夹', () => newFolder(pi), 'Ctrl+Shift+N', 'folderPlus'], ['粘贴', paste, 'Ctrl+V', 'paste']] : []),
      ['刷新', () => load(t, true), 'F5', 'refresh'],
      null,
      ['在子文件夹中搜索', () => setMode(t, true), 'Ctrl+Shift+F', 'search'],
      ...(dir ? [['收藏此文件夹', () => addFav(t.path), '', 'star'], ['在终端中打开', () => terminal(t.path), '', 'terminal'], ['在资源管理器中打开', () => invoke('shell_open', { path: t.path }), '', 'external'], ['属性', () => props(t.path), '', 'info']] : []),
      null,
      [settings.hidden ? '不显示隐藏文件' : '显示隐藏文件', toggleHidden, 'Ctrl+H', settings.hidden ? 'eyeOff' : 'eye'],
    ]);
  }
});

function toggleHidden() {
  settings.hidden = !settings.hidden;
  saveSettings();
  $('#hidbtn').classList.toggle('on', settings.hidden);
  $('#hidbtn').innerHTML = ic(settings.hidden ? 'eye' : 'eyeOff');
  panes.forEach((P, i) => refresh(cur(i), true));
  toast(settings.hidden ? '显示隐藏文件' : '不显示隐藏文件');
}
function setTheme(dark) { settings.dark = dark; document.body.classList.toggle('dark', dark); saveSettings(); }
function toggleSide() { settings.side = !settings.side; app.classList.toggle('noside', !settings.side); saveSettings(); }

function focusSearch(rec) {
  const t = cur(), inp = $('.search input', panes[ap].el);
  if (rec !== undefined && t.rec !== rec) setMode(t, rec);
  inp.focus();
  if (rec !== undefined) inp.select();
}
function moveSel(t, d, shift) {
  const v = t.view;
  if (!v.length) return;
  let i = v.findIndex(x => x.it.p === t.anchor);
  i = i < 0 ? 0 : Math.max(0, Math.min(v.length - 1, i + d));
  t.sel = new Set([v[i].it.p]);
  t.anchor = v[i].it.p;
  scrollToPath(t, v[i].it.p);
  redrawSel(paneOf(t));
}
// 在列表里直接按字母 = 跳到以它开头的项目（和资源管理器一样）；Ctrl+F 才是搜索
let typed = '', typedAt = 0;
function typeJump(t, ch) {
  const now = Date.now();
  typed = now - typedAt < 800 ? typed + ch : ch;
  typedAt = now;
  const s = typed.toLowerCase(), v = t.view, start = Math.max(0, v.findIndex(x => x.it.p === t.anchor));
  const hit = [...v.slice(start + (typed.length === 1 ? 1 : 0)), ...v.slice(0, start + 1)]
    .find(x => x.it.n.toLowerCase().startsWith(s) || x.it.py?.startsWith(s));
  if (hit) { t.sel = new Set([hit.it.p]); t.anchor = hit.it.p; scrollToPath(t, hit.it.p); redrawSel(paneOf(t)); }
}

document.addEventListener('keydown', e => {
  const t = cur(), P = panes[ap], k = e.key, lk = k.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (k === 'Escape' && !menu.hidden) { menu.hidden = true; return; }
  const hit = fn => { e.preventDefault(); fn(); };
  if (ctrl && !e.shiftKey && lk === 't') return hit(() => openTab(t.path));
  if (ctrl && e.shiftKey && lk === 't') return hit(reopen);
  if (ctrl && lk === 'w') return hit(() => closeTab(ap, P.act));
  if (ctrl && k === 'Tab') return hit(() => activate(ap, (P.act + (e.shiftKey ? -1 : 1) + P.tabs.length) % P.tabs.length));
  if (ctrl && /^[1-9]$/.test(k)) return hit(() => activate(ap, k === '9' ? P.tabs.length - 1 : Math.min(+k, P.tabs.length) - 1));
  if (ctrl && lk === 'f') return hit(() => focusSearch(e.shiftKey));
  if (ctrl && k === '\\') return hit(() => split(panes.length > 1 ? null : 'h'));
  if (ctrl && lk === 'n' && !e.shiftKey) return hit(() => invoke('open_window', { query: 'open=' + encodeURIComponent(t.path).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()) }));
  if ((ctrl && lk === 'l') || (e.altKey && lk === 'd')) return hit(() => editCrumb(ap));
  if (e.altKey && k === 'ArrowLeft') return hit(() => goBack(t));
  if (e.altKey && k === 'ArrowRight') return hit(() => goFwd(t));
  if (e.altKey && k === 'ArrowUp') return hit(() => goUp(t));
  if (k === 'F5' || (ctrl && lk === 'r')) return hit(() => (t.rec && t.q.trim() ? startSearch(t) : load(t, true)));
  if (ctrl && lk === 'h') return hit(toggleHidden);
  if (e.target.matches('.search input')) {
    if (k === 'Enter') hit(() => t.rec ? startSearch(t) : setMode(t, true));
    else if (k === 'Escape') { if (t.q) { t.q = ''; setMode(t, t.rec); } else $('.list', P.el).focus(); }
    else if (k === 'ArrowDown') hit(() => { $('.list', P.el).focus(); if (!t.sel.size) moveSel(t, 0); });
    return;
  }
  if (e.target.matches('input')) return;
  const sel = selItems(t);
  if (k === 'Escape') { if (t.q) { t.q = ''; setMode(t, t.rec); } else { t.sel.clear(); redrawSel(ap); } }
  else if (k === 'ArrowDown' || k === 'ArrowUp') hit(() => moveSel(t, k === 'ArrowDown' ? 1 : -1));
  else if (k === 'PageDown' || k === 'PageUp') hit(() => moveSel(t, (k === 'PageDown' ? 1 : -1) * Math.max(1, Math.floor($('.list', P.el).clientHeight / ROW_H) - 1)));
  else if (k === 'Home' || k === 'End') hit(() => moveSel(t, k === 'Home' ? -1e9 : 1e9));
  else if (k === 'Enter' && e.altKey && sel.length) hit(() => props(sel[0].p));
  else if (k === 'Enter' && sel.length) hit(() => sel.length === 1 || sel[0].d ? openItem(t, sel[0]) : sel.filter(x => !x.d).forEach(x => openItem(t, x)));
  else if (k === 'Backspace') hit(() => goUp(t));
  else if (k === 'Delete') hit(() => del(t, e.shiftKey));
  else if (k === 'F2' && sel.length) hit(() => rename(ap, sel[0].p));
  else if (ctrl && lk === 'a') hit(() => { t.view.forEach(x => t.sel.add(x.it.p)); redrawSel(ap); });
  else if (ctrl && lk === 'z') hit(doUndo);
  else if (ctrl && lk === 'x') hit(() => setClip(t, true));
  else if (ctrl && e.shiftKey && lk === 'c') hit(() => sel.length && copyPath(sel));
  else if (ctrl && lk === 'c') hit(() => setClip(t, false));
  else if (ctrl && lk === 'v') hit(paste);
  else if (ctrl && e.shiftKey && lk === 'n') hit(() => newFolder(ap));
  else if (k.length === 1 && k !== ' ' && !ctrl && !e.altKey) {
    if (e.target.closest('.list')) hit(() => typeJump(t, k));
    else focusSearch();   // 焦点不在列表时，直接打字 = 开始筛选
  }
});

// 侧栏
let sideList = new Map();   // 常用文件夹（有序）：key → { path, label, icon }
function renderSide() {
  let html = '<h4>快速访问</h4>';
  for (const p of sideList.values()) html += `<div data-path="${esc(p.path)}" title="${esc(p.path)}">${folderIco(p.icon)}<span>${esc(p.label)}</span></div>`;
  const favs = store.get('favs', []);
  if (favs.length) html += '<h4>收藏</h4>' + favs.map(p => `<div data-path="${esc(p)}" data-fav="1" title="${esc(p)}">${ic('star')}<span>${esc(baseName(p))}</span></div>`).join('');
  html += `<h4>此电脑</h4><div data-path="">${pcIco()}<span>此电脑</span></div>` + [...drives.values()].map(d => `<div data-path="${esc(d.p)}">${driveIco()}<span>${esc(labelOf(d.p))}</span></div>`).join('');
  sideEl.innerHTML = html;
  renderStatus();
}
sideEl.addEventListener('contextmenu', e => {
  const d = e.target.closest('[data-path]');
  if (!d) return;
  const p = d.dataset.path, favs = store.get('favs', []);
  showMenu(e, [
    ['在新标签中打开', () => openTab(p), '', 'tabPlus'],
    ['在另一侧分屏中打开', () => openOther(ap, p), '', 'splitH'],
    ...(d.dataset.fav ? [null, ['从收藏中移除', () => { store.set('favs', favs.filter(x => !same(x, p))); renderSide(); }, '', 'x']] : []),
  ]);
});
function addFav(p) {
  const favs = store.get('favs', []);
  if (p === ROOT || favs.some(x => same(x, p))) return toast('已经在收藏里了');
  store.set('favs', [...favs, p]);
  renderSide();
  toast(`已收藏 <b>${esc(labelOf(p))}</b>`);
}
// 把文件夹拖到侧栏 = 收藏
sideEl.addEventListener('dragover', e => { if (drag?.type === 'files' || drag?.type === 'tab') { e.preventDefault(); sideEl.classList.add('drop'); } });
sideEl.addEventListener('dragleave', () => sideEl.classList.remove('drop'));
sideEl.addEventListener('drop', e => {
  sideEl.classList.remove('drop');
  if (!drag) return;
  e.preventDefault();
  if (drag.type === 'tab') addFav(panes[drag.pi].tabs[drag.ti].path);
  else drag.paths.forEach(p => { const it = allTabs().flatMap(t => t.view).find(x => x.it.p === p)?.it; if (it?.d) addFav(p); });
  drag = null;
});

// 启动
(async function boot() {
  document.body.classList.toggle('dark', settings.dark);
  app.classList.toggle('noside', !settings.side);
  $('#brand').innerHTML = LOGO + 'Strata';
  for (const [l, name] of [['', 'single'], ['h', 'splitH'], ['v', 'splitV']]) $('.tool [data-l="' + l + '"]').innerHTML = ic(name);
  $('.tool [onclick="toggleSide()"]').innerHTML = ic('sidebar');
  $('.tool [onclick^="setTheme"]').innerHTML = ic('theme');
  $('.tool [onclick="showHelp()"]').innerHTML = ic('keyboard');
  $('#hidbtn').classList.toggle('on', settings.hidden);
  const [kf, dv] = await Promise.all([invoke('known_folders'), invoke('list_drives')]);
  for (const f of kf) {
    const [label, icon] = KNOWN_LABEL[f.key];
    if (f.key !== 'home') known.set(f.path.toLowerCase(), [label, icon]);
  }
  for (const f of kf) if (f.key !== 'home') sideList.set(f.key, { path: f.path, label: KNOWN_LABEL[f.key][0], icon: KNOWN_LABEL[f.key][1] });
  dv.forEach(d => drives.set(d.p, d));
  const q = new URLSearchParams(location.search), open = q.get('open');
  const sess = IS_MAIN && !open ? store.get('session') : null;
  if (sess?.panes?.length) {
    panes = sess.panes.map(P => ({ act: Math.min(P.act, P.tabs.length - 1), tabs: P.tabs.map(x => mkTab(x.path, { pin: x.pin, sort: x.sort || { k: 'n', a: 1 } })) }));
    layout = panes.length > 1 ? sess.layout || 'h' : null;
    ap = Math.min(sess.ap || 0, panes.length - 1);
  } else {
    const home = kf.find(f => f.key === 'home')?.path;
    panes = [{ tabs: [mkTab(open != null ? open : home || ROOT)], act: 0 }];
  }
  renderAll();
  renderSide();
  panes.forEach((P, i) => load(cur(i)));
  $('.list', panes[ap].el).focus();
})();

// 快捷键说明（工具栏“？”或 F1）
const HELP = `<div class="dlg-in"><b>快捷键</b><span class="x" data-a="x">${ic('x')}</span>
<table><tr><th colspan="2">多开</th></tr>
<tr><td>Ctrl+T / Ctrl+W</td><td>新建 / 关闭标签</td></tr><tr><td>Ctrl+Shift+T</td><td>恢复刚关闭的标签</td></tr>
<tr><td>Ctrl+Tab / Ctrl+1…9</td><td>切换标签</td></tr><tr><td>Ctrl+\</td><td>左右分屏 / 取消分屏</td></tr>
<tr><td>Ctrl+N</td><td>在新窗口中打开当前文件夹</td></tr><tr><td>中键</td><td>文件夹：后台新标签；标签：关闭</td></tr>
<tr><th colspan="2">搜索</th></tr>
<tr><td>Ctrl+F</td><td>筛选当前文件夹（输入即过滤）</td></tr><tr><td>Ctrl+Shift+F / Enter</td><td>搜索所有子文件夹</td></tr>
<tr><td>Esc</td><td>清空搜索</td></tr><tr><td>在列表里打字</td><td>跳到以该字母开头的项目</td></tr>
<tr><th colspan="2">文件</th></tr>
<tr><td>Enter / Backspace</td><td>打开 / 上一级</td></tr><tr><td>Alt+← → ↑</td><td>后退 / 前进 / 上一级</td></tr>
<tr><td>Ctrl+C / X / V</td><td>复制 / 剪切 / 粘贴（与资源管理器互通）</td></tr><tr><td>Ctrl+Shift+C</td><td>复制路径</td></tr>
<tr><td>F2 / Del / Shift+Del</td><td>重命名 / 删到回收站 / 永久删除</td></tr><tr><td>Ctrl+Z</td><td>撤销重命名或移动</td></tr>
<tr><td>Ctrl+Shift+N</td><td>新建文件夹</td></tr><tr><td>Alt+Enter</td><td>属性</td></tr>
<tr><td>Ctrl+L</td><td>编辑地址栏</td></tr><tr><td>Ctrl+H</td><td>显示 / 隐藏隐藏文件</td></tr><tr><td>F5</td><td>刷新</td></tr>
</table><p class="dim">拖动文件到另一分屏、文件夹或标签上 = 移动，按住 Ctrl = 复制。把文件夹或标签拖到侧栏 = 收藏。</p></div>`;
function showHelp() {
  let d = $('.dlg', app);
  if (d) return d.remove();
  d = document.createElement('div');
  d.className = 'dlg';
  d.innerHTML = HELP;
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-a=x]')) d.remove(); });
  app.append(d);
}
document.addEventListener('keydown', e => {
  if (e.key === 'F1') { e.preventDefault(); showHelp(); }
  else if (e.key === 'Escape') $('.dlg', app)?.remove();
}, true);
