// 状态与渲染：窗口 → 分屏(pane) → 标签(tab)，每个标签独立保存路径、历史、排序、搜索状态
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app'), panesEl = $('#panes'), statusEl = $('#status'), sideEl = $('#side');
const coll = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const ROW_H = 30;   // 列表行高（虚拟滚动按固定行高计算）
let panes = [], ap = 0, layout = null, closed = [], uid = 0, renaming = null;

const mkTab = (path, o = {}) => ({ id: ++uid, path, items: null, loading: false, err: null, back: [], fwd: [], q: '', rec: false,
  sort: { k: 'n', a: 1 }, sel: new Set(), anchor: null, res: null, job: null, scanned: 0, ms: 0, view: [], ...o });
const cur = (pi = ap) => panes[pi].tabs[panes[pi].act];
const paneOf = t => panes.findIndex(p => p.tabs[p.act] === t);
const allTabs = () => panes.flatMap(p => p.tabs);

// 读取目录内容。keep=true 时保留选择（目录变化后的自动刷新）
async function load(t, keep) {
  const seq = t.loadSeq = (t.loadSeq || 0) + 1, path = t.path;
  t.loading = true;
  if (!keep) refresh(t, true, true);
  let items, err = null;
  try { items = path === ROOT ? await invoke('list_drives') : await invoke('list_dir', { path }); }
  catch (e) { items = []; err = e; }
  if (t.loadSeq !== seq || t.path !== path) return;   // 期间已切到别的目录
  if (path === ROOT) { drives.clear(); items.forEach(d => drives.set(d.p, d)); }
  Object.assign(t, { items, err, loading: false });
  const has = new Set(items.map(x => x.p.toLowerCase()));
  for (const p of t.sel) if (!has.has(p.toLowerCase())) t.sel.delete(p);
  refresh(t, true, !keep);
  if (t.reveal) { scrollToPath(t, t.reveal); t.reveal = null; }
}

function openTab(path, pi = ap, activate = true, at) {
  const P = panes[pi], prev = P.tabs[P.act], t = mkTab(path);
  P.tabs.splice(at ?? P.act + 1, 0, t);          // 新标签插在当前标签右侧
  P.act = P.tabs.indexOf(activate ? t : prev);
  if (activate) ap = pi;
  renderAll();
  load(t);
  return t;
}

function activate(pi, ti) {
  const P = panes[pi];
  P.act = ti;
  ap = pi;
  renderAll();
  const t = cur(pi);
  if (!t.items || !t.job) load(t, !!t.items);   // 切回来时顺便刷新一下（后台标签不监听目录变化）
}

function closeTab(pi, ti) {
  const P = panes[pi], t = P.tabs[ti];
  if (!t) return;
  stopSearch(t);
  closed.push(t.path);
  const prev = P.tabs[P.act];
  P.tabs.splice(ti, 1);
  if (!P.tabs.length) {
    if (panes.length > 1) { panes.splice(pi, 1); layout = null; ap = 0; }
    else { P.tabs.push(mkTab(ROOT)); P.act = 0; load(P.tabs[0]); }
  } else P.act = prev === t ? Math.min(ti, P.tabs.length - 1) : P.tabs.indexOf(prev);
  renderAll();
}

function reopen() {
  if (closed.length) return openTab(closed.pop());
  toast('没有可恢复的标签');
}

function moveTab(fp, fi, tp, ti) {
  const F = panes[fp], T = panes[tp], t = F.tabs[fi], keep = F.tabs[F.act];
  if (fp === tp && (ti === fi || ti === fi + 1)) return;
  F.tabs.splice(fi, 1);
  if (fp === tp && ti > fi) ti--;
  T.tabs.splice(ti, 0, t);
  T.act = ti;
  ap = tp;
  if (fp !== tp) {
    if (!F.tabs.length) { panes.splice(fp, 1); layout = null; ap = Math.max(0, panes.indexOf(T)); }
    else F.act = keep === t ? Math.min(fi, F.tabs.length - 1) : F.tabs.indexOf(keep);
  }
  renderAll();
}

function split(mode) {
  const keep = cur();
  if (mode && panes.length === 1) { const t = mkTab(keep.path); panes.push({ tabs: [t], act: 0 }); load(t); }
  if (!mode && panes.length > 1) {
    // 合并回单屏：另一侧和这边打开同一文件夹的标签不再重复添加（固定的标签保留），
    // 否则每次“分屏 → 单屏”都会多出一个标签
    const [a, b] = panes, key = t => t.path.toLowerCase();
    const open = new Map(a.tabs.map(t => [key(t), t]));
    let act = keep;
    for (const t of b.tabs) {
      const same = open.get(key(t));
      if (same && !t.pin) {
        stopSearch(t);
        if (t === keep) act = same;
      } else { a.tabs.push(t); open.set(key(t), t); }
    }
    panes.length = 1;
    a.act = Math.max(0, a.tabs.indexOf(act));
    ap = 0;
    layout = null;
    return renderAll();
  }
  layout = mode;
  ap = Math.max(0, panes.findIndex(p => p.tabs.includes(keep)));
  renderAll();
}

function nav(t, path, how = 'push', select) {
  if (path == null) return;
  path = path === ROOT ? ROOT : norm(path);
  stopSearch(t);
  if (how === 'push' && !same(path, t.path)) { t.back.push(t.path); t.fwd = []; }
  Object.assign(t, { path, items: null, err: null, q: '', res: null, cancelled: false, anchor: select || null, sel: new Set(select ? [select] : []), reveal: select || null });
  renderAll();
  load(t);
}
const goBack = t => t.back.length && (t.fwd.push(t.path), nav(t, t.back.pop(), 'hist'));
const goFwd = t => t.fwd.length && (t.back.push(t.path), nav(t, t.fwd.pop(), 'hist'));
const goUp = t => t.path !== ROOT && nav(t, parentOf(t.path), 'push', t.path);   // 回到上级时选中刚才所在的文件夹

const SKEL = `<div class="tabs"></div>
<div class="bar"><button class="btn" data-a="back" title="后退 (Alt+←)">${ic('back')}</button><button class="btn" data-a="fwd" title="前进 (Alt+→)">${ic('fwd')}</button><button class="btn" data-a="up" title="上一级 (Alt+↑)">${ic('up')}</button><button class="btn hide-n" data-a="refresh" title="刷新 (F5)">${ic('refresh')}</button>
<div class="crumb" title="点击空白处编辑路径 (Ctrl+L)"></div>
<div class="search"><span class="ic">${ic('search')}</span><input spellcheck="false"><span class="mode" data-a="mode" title="切换：只筛选当前文件夹 / 搜索所有子文件夹 (Ctrl+Shift+F)">子目录</span>
<div class="help"><b>搜索语法</b>（可组合，空格分隔）<br><code>report</code> 名称包含<br><code>bg</code> 拼音首字母（报告）<br><code>*.png</code> <code>IMG_10?5*</code> 通配符<br><code>ext:pdf,docx</code> 扩展名<br><code>size:&gt;5mb</code> 大小<br><code>modified:7d</code> 7 天内修改<br><code>type:folder</code> 只看文件夹<br><code>/^IMG_\\d+/</code> 正则<br><code>content:关键字</code> 文件内容（子目录搜索）<br><span class="dim">Enter：在所有子文件夹中搜索</span></div></div></div>
<div class="list" tabindex="0"></div>`;

function renderAll() {
  const els = [...panesEl.querySelectorAll(':scope > .pane')];
  if (els.length !== panes.length || panes.some((p, i) => p.el !== els[i])) {   // 分屏结构变了：重建骨架
    panesEl.innerHTML = '';
    panes.forEach((P, i) => {
      if (i) panesEl.append(Object.assign(document.createElement('div'), { className: 'splitter', title: '拖动调整大小，双击恢复一半' }));
      P.el = document.createElement('div');
      P.el.className = 'pane';
      P.el.innerHTML = SKEL;
      $('.list', P.el).addEventListener('scroll', () => onListScroll(P));
      panesEl.append(P.el);
    });
  }
  panesEl.className = 'panes' + (layout === 'v' ? ' v' : '');
  applySplit();
  panes.forEach((P, i) => { P.el.dataset.p = i; renderPane(i); });
  renderStatus();
  syncWatch();
  saveSession();
}

// 分屏比例：左右、上下各记一个，保存在设置里
const MIN_PANE = { h: 260, v: 150 };   // 每个分屏的最小宽度 / 高度（px）
function splitRatio() { return settings.split?.[layout === 'v' ? 'v' : 'h'] ?? 0.5; }
function applySplit(r = splitRatio()) {
  if (panes.length < 2) { panes[0].el.style.flex = ''; return; }
  panes[0].el.style.flex = `${r} 1 0`;
  panes[1].el.style.flex = `${1 - r} 1 0`;
}
function clampRatio(r) {
  const rect = panesEl.getBoundingClientRect(), sp = $('.splitter', panesEl)?.getBoundingClientRect() || { width: 0, height: 0 };
  const v = layout === 'v', total = (v ? rect.height - sp.height : rect.width - sp.width), min = MIN_PANE[v ? 'v' : 'h'];
  if (total < min * 2) return 0.5;
  return Math.min(1 - min / total, Math.max(min / total, r));
}
function setSplit(r) {
  settings.split = { ...settings.split, [layout === 'v' ? 'v' : 'h']: r };
  saveSettings();
  applySplit(r);
}
panesEl.addEventListener('pointerdown', e => {
  const sp = e.target.closest('.splitter');
  if (!sp || e.button !== 0) return;
  e.preventDefault();
  sp.setPointerCapture(e.pointerId);
  sp.classList.add('on');
  document.body.classList.add(layout === 'v' ? 'resizing-v' : 'resizing-h');
  const rect = panesEl.getBoundingClientRect(), half = sp.getBoundingClientRect()[layout === 'v' ? 'height' : 'width'] / 2;
  let r = splitRatio();
  const move = ev => {
    r = clampRatio(layout === 'v' ? (ev.clientY - rect.top - half) / (rect.height - half * 2) : (ev.clientX - rect.left - half) / (rect.width - half * 2));
    applySplit(r);
  };
  const up = () => {
    sp.removeEventListener('pointermove', move);
    sp.classList.remove('on');
    document.body.classList.remove('resizing-v', 'resizing-h');
    setSplit(r);
  };
  sp.addEventListener('pointermove', move);
  sp.addEventListener('pointerup', up, { once: true });
  sp.addEventListener('lostpointercapture', up, { once: true });
});
panesEl.addEventListener('dblclick', e => { if (e.target.closest('.splitter')) setSplit(0.5); });
// 分屏或窗口大小变化后，补渲染虚拟列表新露出来的行
new ResizeObserver(() => panes.forEach(P => P.el && renderRows(P, false))).observe(panesEl);

function refresh(t, full, reset) {
  const pi = panes.findIndex(p => p.tabs.includes(t));
  if (pi < 0 || !panes[pi].el) return;   // 分屏刚建好、DOM 还没生成
  if (cur(pi) !== t) { if (full) renderTabs(pi); return; }   // 后台标签只更新标签栏
  if (full) renderPane(pi, reset); else renderList(pi);
  if (pi === ap) renderStatus();
}

function renderTabs(pi) {
  const P = panes[pi];
  $('.tabs', P.el).innerHTML = P.tabs.map((x, i) => `<div class="tab${i === P.act ? ' on' : ''}${x.pin ? ' pin' : ''}" draggable="true" data-t="${i}" title="${esc(displayPath(x.path))}">${x.job || x.loading ? ic('refresh', 'spin') : dirIcon(x.path)}${x.pin ? '' : `<span>${esc(x.rec && x.res ? `搜索“${x.q}”` : labelOf(x.path))}</span><i data-a="close" title="关闭 (Ctrl+W)">${ic('x')}</i>`}</div>`).join('')
    + `<div class="addtab" data-a="add" title="新建标签 (Ctrl+T)">${ic('plus')}</div>`;
}

function renderPane(pi, reset) {
  const P = panes[pi], el = P.el, t = cur(pi);
  el.classList.toggle('act', pi === ap && panes.length > 1);
  renderTabs(pi);
  $('[data-a=back]', el).disabled = !t.back.length;
  $('[data-a=fwd]', el).disabled = !t.fwd.length;
  $('[data-a=up]', el).disabled = t.path === ROOT;
  const cr = $('.crumb', el);
  if (!$('input', cr)) {
    cr.innerHTML = [ROOT, ...chainOf(t.path)].map((p, k) => `<a data-k="${k}">${k ? dirIcon(p) + ' ' + esc(isDrive(p) ? labelOf(p) : baseName(p)) : pcIco() + ' 此电脑'}</a>`).join(`<em>${ic('chev')}</em>`);
    cr.scrollLeft = 1e5;   // 路径太长时显示末尾
  }
  const inp = $('.search input', el);
  if (inp.value !== t.q) inp.value = t.q;
  inp.placeholder = `${t.rec ? '搜索' : '筛选'}“${labelOf(t.path)}”`;
  $('.mode', el).classList.toggle('r', t.rec);
  renderList(pi, reset);
}

const SORTERS = {
  n: (x, y) => coll.compare(x.n, y.n), m: (x, y) => x.m - y.m, s: (x, y) => (x.s || 0) - (y.s || 0),
  t: (x, y) => coll.compare(typeOf(x), typeOf(y)), l: (x, y) => coll.compare(x.p, y.p),
};
function getView(t) {
  let arr;
  if (t.rec && t.res) arr = t.res.slice();
  else {
    const test = t.q.trim() ? parseQ(t.q) : null;
    arr = [];
    for (const it of t.items || []) {
      if (it.h && !settings.hidden) continue;
      const hl = test ? test(it) : [];
      if (hl) arr.push({ it, hl });
    }
  }
  const { k, a } = t.sort, f = SORTERS[k] || SORTERS.n;
  return arr.sort((A, B) => (B.it.d - A.it.d) || f(A.it, B.it) * a || coll.compare(A.it.n, B.it.n));
}

const COLS = [['n', '名称'], ['l', '所在位置'], ['m', '修改日期'], ['t', '类型'], ['s', '大小']];
const relDir = (root, p) => { const d = parentOf(p); return same(d, root) ? '（当前文件夹）' : root === ROOT ? d : d.slice(root.length + (isDrive(root) ? 0 : 1)); };

function renderList(pi, reset) {
  const P = panes[pi], t = cur(pi), list = $('.list', P.el);
  if (renaming === P) return;   // 正在重命名：先不重画，结束后再刷新
  t.view = getView(t);
  const rec = !!(t.rec && t.res), q = t.q.trim(), span = rec ? 5 : 4;
  const head = COLS.filter(c => rec || c[0] !== 'l').map(([k, s]) => `<th class="c-${k}" data-s="${k}">${s}${t.sort.k === k ? ic(t.sort.a > 0 ? 'sortUp' : 'sortDown') : ''}</th>`).join('');
  let extra = '';
  if (!t.view.length) {
    const msg = t.err ? `无法打开此文件夹：${errText(t.err)}` : t.loading || !t.items && !rec ? '正在读取…' : q ? (t.job ? '正在搜索…' : `没有找到与“${esc(q)}”匹配的项目`) : '此文件夹为空';
    extra = `<tr><td colspan="${span}" class="empty">${msg}</td></tr>`;
  }
  if (q && !t.rec) extra += `<tr><td colspan="${span}" class="more">只筛选了当前文件夹 · <a data-a="deep">在所有子文件夹中搜索“${esc(q)}” ${ic('fwd')}</a></td></tr>`;
  if (rec && t.truncated) extra += `<tr><td colspan="${span}" class="more">结果太多，只显示前 ${t.res.length.toLocaleString()} 项，请加更多条件缩小范围</td></tr>`;
  list.innerHTML = `<table${rec ? ' class="rec"' : ''}><thead><tr>${head}</tr></thead><tbody></tbody><tfoot>${extra}</tfoot></table>`;
  P.range = null;
  if (reset) list.scrollTop = 0;
  renderRows(P);
}

// 虚拟滚动：只渲染可见区域附近的行，上下用占位行撑开高度
function renderRows(P, force = true) {
  if (renaming === P) return;
  const t = P.tabs[P.act], list = $('.list', P.el), body = $('tbody', list);
  if (!body) return;
  const n = t.view.length, from = Math.max(0, Math.floor(list.scrollTop / ROW_H) - 20), to = Math.min(n, from + Math.ceil(list.clientHeight / ROW_H) + 40);
  if (!force && P.range && P.range[0] === from && P.range[1] === to) return;
  P.range = [from, to];
  const rec = !!(t.rec && t.res), gap = h => `<tr class="gap" style="height:${h}px"><td colspan="${rec ? 5 : 4}"></td></tr>`;
  let html = from ? gap(from * ROW_H) : '';
  for (let i = from; i < to; i++) {
    const { it, hl } = t.view[i];
    html += `<tr class="row${t.sel.has(it.p) ? ' sel' : ''}${it.h ? ' hid' : ''}" data-i="${i}" draggable="true">`
      + `<td class="c-n" title="${esc(it.n)}">${iconOf(it)} ${hlName(it, hl)}</td>`
      + (rec ? `<td class="c-l"><a data-loc="${i}" title="打开所在位置">${esc(relDir(t.path, it.p))}</a></td>` : '')
      + `<td class="c-m">${fmtDate(it.m)}</td><td class="c-t">${typeOf(it)}</td><td class="c-s">${sizeCell(it)}</td></tr>`;
  }
  if (to < n) html += gap((n - to) * ROW_H);
  body.innerHTML = html;
}
function onListScroll(P) {
  if (P.raf) return;
  P.raf = requestAnimationFrame(() => { P.raf = 0; renderRows(P, false); });
}
// 只改选中状态时不重建行：双击时第一下 click 如果重建了 DOM，dblclick 的目标元素就脱离文档了
function redrawSel(pi) {
  const P = panes[pi], t = P.tabs[P.act];
  P.el.querySelectorAll('tr.row').forEach(r => r.classList.toggle('sel', t.sel.has(t.view[+r.dataset.i]?.it.p)));
  if (pi === ap) renderStatus();
}

function scrollToPath(t, p) {
  const pi = paneOf(t), i = t.view.findIndex(x => same(x.it.p, p));
  if (pi < 0 || i < 0) return;
  const list = $('.list', panes[pi].el), top = i * ROW_H, head = 28;
  if (top < list.scrollTop) list.scrollTop = top;
  else if (top + ROW_H + head > list.scrollTop + list.clientHeight) list.scrollTop = top + ROW_H + head - list.clientHeight;
  renderRows(panes[pi]);
}
const rowEl = (pi, i) => panes[pi].el.querySelector(`tr[data-i="${i}"]`);

function renderStatus() {
  const t = cur(), sel = t.view.filter(x => t.sel.has(x.it.p)), size = sel.reduce((s, x) => s + (x.it.d ? 0 : x.it.s || 0), 0);
  let s = `<span>${t.rec && t.res ? `找到 ${t.res.length.toLocaleString()} 项` : `${t.view.length.toLocaleString()} 个项目`}</span>`;
  if (sel.length) s += `<span>已选择 ${sel.length} 项${size ? ' · ' + fmtSize(size) : ''}</span>`;
  if (t.job) s += `<span><span class="prog"><b></b></span> 正在搜索${hasContent(t.q) ? '文件内容' : '子文件夹'}… 已扫描 ${t.scanned.toLocaleString()} 项 <a data-a="cancel">取消</a></span>`;
  else if (t.rec && t.res) s += `<span>${t.cancelled ? '搜索已取消' : '搜索完成'}，扫描 ${t.scanned.toLocaleString()} 项，用时 ${(t.ms / 1000).toFixed(t.ms < 10000 ? 2 : 0)} 秒</span>`;
  s += `<span class="sp"></span><span>${panes.length > 1 ? (layout === 'v' ? '上下分屏' : '左右分屏') + ' · ' : ''}标签 ${panes[ap].act + 1}/${panes[ap].tabs.length}</span>`;
  statusEl.innerHTML = s;
  const title = `${labelOf(t.path)} - Strata`;
  if (document.title !== title) { document.title = title; thisWin.setTitle(title).catch(() => {}); }
  document.querySelectorAll('.tool [data-l]').forEach(b => b.classList.toggle('on', (b.dataset.l || null) === layout));
  sideEl.querySelectorAll('[data-path]').forEach(d => d.classList.toggle('cur', same(d.dataset.path, t.path)));
}

function toast(html, ms = 2600) {
  let el = $('.toast', app);
  if (!el) { el = document.createElement('div'); el.className = 'toast'; app.append(el); }
  el.innerHTML = html;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), ms);
}

// 目录监听：只监听各分屏当前显示的文件夹
let watchKey = '';
function syncWatch() {
  const paths = [...new Set(panes.map((P, i) => cur(i).path).filter(p => p !== ROOT))];
  const key = paths.join('|').toLowerCase();
  if (key !== watchKey) { watchKey = key; invoke('watch_set', { paths }); }
}
listen('dir-changed', ({ payload }) => {
  const set = new Set(payload.map(p => norm(p).toLowerCase()));
  panes.forEach((P, i) => { const t = cur(i); if (t.path !== ROOT && set.has(t.path.toLowerCase()) && !t.loading) load(t, true); });
});

// 会话：主窗口保存分屏、标签、路径、排序，下次启动还原
function saveSession() {
  if (!IS_MAIN) return;
  clearTimeout(saveSession.t);
  saveSession.t = setTimeout(() => store.set('session', {
    layout, ap, panes: panes.map(P => ({ act: P.act, tabs: P.tabs.map(t => ({ path: t.path, pin: !!t.pin, sort: t.sort })) })),
  }), 300);
}
