// 状态与渲染：窗口 → 分屏(pane) → 标签(tab)，每个标签独立保存路径、历史、排序、搜索状态
const $ = (s, el = document) => el.querySelector(s);
const app = $('#app'), panesEl = $('#panes'), statusEl = $('#status'), sideEl = $('#side');
const coll = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
let panes = [], ap = 0, layout = null, closed = [], uid = 0;

const mkTab = node => ({ id: ++uid, node, back: [], fwd: [], q: '', rec: false, sort: { k: 'n', a: 1 }, sel: new Set(), anchor: null, res: null, job: null, scanned: 0, ms: 0, view: [] });
const cur = (pi = ap) => panes[pi].tabs[panes[pi].act];
const paneOf = t => panes.findIndex(p => p.tabs[p.act] === t);

function openTab(node, pi = ap, activate = true, at) {
  const P = panes[pi], prev = P.tabs[P.act], t = mkTab(node);
  P.tabs.splice(at ?? P.act + 1, 0, t);          // 新标签插在当前标签右侧
  P.act = P.tabs.indexOf(activate ? t : prev);
  if (activate) ap = pi;
  renderAll();
  return t;
}

function closeTab(pi, ti) {
  const P = panes[pi], t = P.tabs[ti];
  if (!t) return;
  stopSearch(t);
  closed.push(t.node);
  const prev = P.tabs[P.act];
  P.tabs.splice(ti, 1);
  if (!P.tabs.length) {
    if (panes.length > 1) { panes.splice(pi, 1); layout = null; ap = 0; }
    else { P.tabs.push(mkTab(ROOT)); P.act = 0; }
  } else P.act = prev === t ? Math.min(ti, P.tabs.length - 1) : P.tabs.indexOf(prev);
  renderAll();
}

function reopen() {
  while (closed.length) { const n = closed.pop(); if (attached(n)) return openTab(n); }
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
    if (!F.tabs.length) { panes.splice(fp, 1); layout = null; ap = 0; }
    else F.act = keep === t ? Math.min(fi, F.tabs.length - 1) : F.tabs.indexOf(keep);
  }
  renderAll();
}

function split(mode) {
  const keep = cur();
  if (mode && panes.length === 1) panes.push({ tabs: [mkTab(resolve('C:\\Users\\me\\下载'))], act: 0 });
  if (!mode && panes.length > 1) {
    const [a, b] = panes;
    a.tabs.push(...b.tabs);
    panes.length = 1;
    a.act = a.tabs.indexOf(keep);
  }
  layout = mode;
  ap = Math.max(0, panes.findIndex(p => p.tabs.includes(keep)));
  renderAll();
}

function nav(t, node, how = 'push', select) {
  if (!node?.d) return;
  stopSearch(t);
  if (how === 'push' && node !== t.node) { t.back.push(t.node); t.fwd = []; }
  Object.assign(t, { node, q: '', res: null, cancelled: false, anchor: select || null, sel: new Set(select ? [select] : []) });
  refresh(t, true, true);
  if (select) scrollToNode(t, select);
}
const goBack = t => t.back.length && (t.fwd.push(t.node), nav(t, t.back.pop(), 'hist'));
const goFwd = t => t.fwd.length && (t.back.push(t.node), nav(t, t.fwd.pop(), 'hist'));
const goUp = t => t.node.p && nav(t, t.node.p, 'push', t.node);   // 回到上级时选中刚才所在的文件夹

const SKEL = `<div class="tabs"></div>
<div class="bar"><button class="btn" data-a="back" title="后退 (Alt+←)">←</button><button class="btn" data-a="fwd" title="前进 (Alt+→)">→</button><button class="btn" data-a="up" title="上一级 (Alt+↑)">↑</button><button class="btn hide-n" data-a="refresh" title="刷新 (F5)">⟳</button>
<div class="crumb" title="点击空白处编辑路径 (Ctrl+L)"></div>
<div class="search"><span class="ic">🔍</span><input spellcheck="false"><span class="mode" data-a="mode" title="切换：只筛选当前文件夹 / 搜索所有子文件夹 (Ctrl+Shift+F)">子目录</span>
<div class="help"><b>搜索语法</b>（可组合，空格分隔）<br><code>report</code> 名称包含<br><code>bg</code> 拼音首字母（报告）<br><code>*.png</code> <code>IMG_10?5*</code> 通配符<br><code>ext:pdf,docx</code> 扩展名<br><code>size:&gt;5mb</code> 大小<br><code>modified:7d</code> 7 天内修改<br><code>type:folder</code> 只看文件夹<br><code>/^IMG_\\d+/</code> 正则<br><span class="dim">Enter：在所有子文件夹中搜索</span></div></div></div>
<div class="list" tabindex="0"></div>`;

function renderAll() {
  const els = panesEl.children;
  if (els.length !== panes.length || panes.some((p, i) => p.el !== els[i])) {   // 分屏结构变了：重建骨架
    panesEl.className = 'panes' + (layout === 'v' ? ' v' : '');
    panesEl.innerHTML = '';
    panes.forEach((P, i) => {
      P.el = document.createElement('div');
      P.el.className = 'pane';
      P.el.innerHTML = SKEL;
      panesEl.append(P.el);
    });
  }
  panesEl.className = 'panes' + (layout === 'v' ? ' v' : '');
  panes.forEach((P, i) => { P.el.dataset.p = i; renderPane(i); });
  renderStatus();
}

function refresh(t, full, reset) {
  const pi = panes.findIndex(p => p.tabs.includes(t));
  if (pi < 0 || (cur(pi) !== t && !full)) return;   // 后台标签只在结束时刷新一下标签图标
  renderPane(pi, reset);
  if (pi === ap) renderStatus();
}

function renderPane(pi, reset) {
  const P = panes[pi], el = P.el, t = cur(pi);
  el.classList.toggle('act', pi === ap && panes.length > 1);
  $('.tabs', el).innerHTML = P.tabs.map((x, i) => `<div class="tab${i === P.act ? ' on' : ''}${x.pin ? ' pin' : ''}" draggable="true" data-t="${i}" title="${esc(pathOf(x.node))}">${x.job ? '⏳' : iconOf(x.node)}${x.pin ? '' : `<span>${esc(x.rec && x.res ? `搜索“${x.q}”` : label(x.node))}</span><i data-a="close" title="关闭 (Ctrl+W)">✕</i>`}</div>`).join('')
    + '<div class="addtab" data-a="add" title="新建标签 (Ctrl+T)">＋</div>';
  $('[data-a=back]', el).disabled = !t.back.length;
  $('[data-a=fwd]', el).disabled = !t.fwd.length;
  $('[data-a=up]', el).disabled = !t.node.p;
  const cr = $('.crumb', el);
  if (!$('input', cr)) {
    cr.innerHTML = [ROOT, ...chain(t.node)].map((n, k) => `<a data-k="${k}">${esc(label(n))}</a>`).join('<em>›</em>');
    cr.scrollLeft = 1e5;   // 路径太长时显示末尾
  }
  const inp = $('.search input', el);
  if (inp.value !== t.q) inp.value = t.q;
  inp.placeholder = `${t.rec ? '搜索' : '筛选'}“${label(t.node)}”`;
  $('.mode', el).classList.toggle('r', t.rec);
  renderList(pi, reset);
}

function getView(t) {
  let arr;
  if (t.rec && t.res) arr = t.res.slice();
  else {
    const test = t.q.trim() ? parseQ(t.q) : null;
    arr = [];
    for (const n of t.node.c) { const hl = test ? test(n) : []; if (hl) arr.push({ n, hl }); }
  }
  const { k, a } = t.sort, f = {
    n: (x, y) => coll.compare(x.n, y.n), m: (x, y) => x.m - y.m, s: (x, y) => (x.s || 0) - (y.s || 0),
    t: (x, y) => coll.compare(typeOf(x), typeOf(y)), l: (x, y) => coll.compare(pathOf(x.p), pathOf(y.p)),
  }[k];
  return arr.sort((A, B) => (B.n.d - A.n.d) || f(A.n, B.n) * a || coll.compare(A.n.n, B.n.n));
}

const COLS = [['n', '名称'], ['l', '所在位置'], ['m', '修改日期'], ['t', '类型'], ['s', '大小']];
const rel = (root, n) => chain(n).slice(chain(root).length).map(x => x.n).join('\\') || '（当前文件夹）';

function renderList(pi, reset) {
  const t = cur(pi), list = $('.list', panes[pi].el), view = t.view = getView(t);
  const rec = !!(t.rec && t.res), q = t.q.trim(), span = rec ? 5 : 4;
  const head = COLS.filter(c => rec || c[0] !== 'l').map(([k, s]) => `<th class="c-${k}" data-s="${k}">${s}${t.sort.k === k ? (t.sort.a > 0 ? ' ▴' : ' ▾') : ''}</th>`).join('');
  let rows = view.map(({ n, hl }, i) => `<tr class="row${t.sel.has(n) ? ' sel' : ''}" data-i="${i}" draggable="true">`
    + `<td class="c-n">${iconOf(n)} ${hlName(n, hl)}</td>`
    + (rec ? `<td class="c-l"><a data-loc="${i}" title="打开所在位置">${esc(rel(t.node, n.p))}</a></td>` : '')
    + `<td class="c-m">${fmtDate(n.m)}</td><td class="c-t">${typeOf(n)}</td><td class="c-s">${n.d ? '' : fmtSize(n.s)}</td></tr>`).join('');
  if (!view.length) rows = `<tr><td colspan="${span}" class="empty">${q ? (t.job ? '正在搜索…' : `没有找到与“${esc(q)}”匹配的项目`) : '此文件夹为空'}</td></tr>`;
  if (q && !t.rec) rows += `<tr><td colspan="${span}" class="more">只筛选了当前文件夹 · <a data-a="deep">在所有子文件夹中搜索“${esc(q)}” ⏎</a></td></tr>`;
  list.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  if (reset) list.scrollTop = 0;
}

function scrollToNode(t, n) {
  const pi = paneOf(t), i = t.view.findIndex(x => x.n === n);
  if (pi >= 0 && i >= 0) panes[pi].el.querySelector(`tr[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' });
}

function renderStatus() {
  const t = cur(), sel = t.view.filter(x => t.sel.has(x.n)), size = sel.reduce((s, x) => s + (x.n.s || 0), 0);
  let s = `<span>${t.rec && t.res ? `找到 ${t.res.length} 项` : `${t.view.length} 个项目`}</span>`;
  if (sel.length) s += `<span>已选择 ${sel.length} 项${size ? ' · ' + fmtSize(size) : ''}</span>`;
  if (t.job) s += `<span><span class="prog"><b></b></span> 正在搜索子文件夹… 已扫描 ${t.scanned.toLocaleString()} 项 <a data-a="cancel">取消</a></span>`;
  else if (t.rec && t.res) s += `<span>${t.cancelled ? '搜索已取消' : '搜索完成'}，扫描 ${t.scanned.toLocaleString()} 项，用时 ${t.ms} ms</span>`;
  s += `<span class="sp"></span><span>${panes.length > 1 ? (layout === 'v' ? '上下分屏' : '左右分屏') + ' · ' : ''}标签 ${panes[ap].act + 1}/${panes[ap].tabs.length}</span>`;
  statusEl.innerHTML = s;
  $('#wtitle').textContent = pathOf(t.node);
  document.querySelectorAll('.title [data-l]').forEach(b => b.classList.toggle('on', (b.dataset.l || null) === layout));
  sideEl.querySelectorAll('[data-path]').forEach(d => d.classList.toggle('cur', resolve(d.dataset.path) === t.node));
}

function toast(html, ms = 2600) {
  let el = $('.toast', app);
  if (!el) { el = document.createElement('div'); el.className = 'toast'; app.append(el); }
  el.innerHTML = html;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), ms);
}
