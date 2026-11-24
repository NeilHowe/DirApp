// 文件操作（内存模拟）、右键菜单、键盘快捷键、启动
let undo = null, clip = null;

function fixTabs() {   // 文件被删/移动后，修正各标签的路径、选择、搜索结果
  for (const P of panes) for (const t of P.tabs) {
    while (!attached(t.node)) t.node = t.node.p;
    t.sel = new Set([...t.sel].filter(attached));
    if (t.res) t.res = t.res.filter(x => attached(x.n));
    t.back = t.back.filter(attached);
    t.fwd = t.fwd.filter(attached);
  }
  closed = closed.filter(attached);
  renderAll();
}

function del(t) {
  const items = selNodes(t).filter(n => n.p !== ROOT);
  if (!items.length) return;
  undo = items.map(n => ({ n, p: n.p, i: n.p.c.indexOf(n) })).sort((a, b) => a.i - b.i);
  items.forEach(n => n.p.c.splice(n.p.c.indexOf(n), 1));
  fixTabs();
  toast(`已将 ${items.length} 个项目移到回收站 <a data-a="undo">撤销 (Ctrl+Z)</a>`, 5000);
}
function doUndo() {
  if (!undo) return;
  undo.forEach(({ n, p, i }) => p.c.splice(i, 0, n));
  undo = null;
  fixTabs();
  toast('已撤销删除');
}

function uniq(dir, name, isDir) {
  const has = s => dir.c.some(c => c.n.toLowerCase() === s.toLowerCase());
  if (!has(name)) return name;
  const i = isDir ? -1 : name.lastIndexOf('.'), b = i > 0 ? name.slice(0, i) : name, x = i > 0 ? name.slice(i) : '';
  for (let k = 1; ; k++) { const s = `${b} - 副本${k > 1 ? ` (${k})` : ''}${x}`; if (!has(s)) return s; }
}
const clone = (n, p) => { const c = { ...n, p }; delete c.py; if (n.d) c.c = n.c.map(x => clone(x, c)); return c; };

function transfer(nodes, target, copy) {
  if (target === ROOT) return toast('不能放到“此电脑”根目录');
  nodes = nodes.filter(n => attached(n) && n.p !== ROOT && (copy || n.p !== target) && !chain(target).includes(n));
  if (!nodes.length) return;
  for (const n of nodes) {
    const name = uniq(target, n.n, n.d);
    if (copy) { const c = clone(n, target); c.n = name; target.c.push(c); continue; }
    n.p.c.splice(n.p.c.indexOf(n), 1);
    Object.assign(n, { n: name, p: target });
    delete n.py;
    target.c.push(n);
  }
  fixTabs();
  toast(`已${copy ? '复制' : '移动'} ${nodes.length} 个项目到 <b>${esc(label(target))}</b>`);
}

function setClip(t, cut) {
  const nodes = selNodes(t);
  if (!nodes.length) return;
  clip = { nodes, cut };
  toast(`已${cut ? '剪切' : '复制'} ${nodes.length} 个项目，切换到其他文件夹/分屏后按 Ctrl+V 粘贴`);
}
function paste() {
  if (!clip) return toast('剪贴板是空的');
  transfer(clip.nodes, cur().node, !clip.cut);
  if (clip.cut) clip = null;
}
function copyPath(n) {
  navigator.clipboard?.writeText(pathOf(n)).catch(() => {});
  toast(`已复制路径：${esc(pathOf(n))}`);
}

function rename(pi, n) {
  if (n.p === ROOT) return toast('原型中不支持重命名磁盘');
  const t = cur(pi), i = t.view.findIndex(x => x.n === n);
  const td = i >= 0 && panes[pi].el.querySelector(`tr[data-i="${i}"] .c-n`);
  if (!td) return;
  td.innerHTML = `${iconOf(n)} <input class="ren" value="${esc(n.n)}" spellcheck="false">`;
  const inp = $('input', td), dot = n.d ? -1 : n.n.lastIndexOf('.');
  inp.focus();
  inp.setSelectionRange(0, dot > 0 ? dot : n.n.length);   // 默认不选中扩展名
  let fin = false;
  const done = ok => {
    if (fin) return;
    fin = true;
    const v = inp.value.trim();
    if (ok && v && v !== n.n) {
      if (/[\\/:*?"<>|]/.test(v)) toast('文件名不能包含 \\ / : * ? " &lt; &gt; |');
      else if (n.p.c.some(c => c !== n && c.n.toLowerCase() === v.toLowerCase())) toast(`已存在同名项目“${esc(v)}”`);
      else { n.n = v; delete n.py; }
    }
    renderAll();
  };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
  inp.onblur = () => done(true);
  inp.onclick = inp.ondblclick = inp.onmousedown = e => e.stopPropagation();
}

function newFolder(pi) {
  const t = cur(pi);
  if (t.node === ROOT) return toast('不能在“此电脑”中新建文件夹');
  const f = { n: uniq(t.node, '新建文件夹', true), d: 1, m: Date.now(), c: [], p: t.node };
  t.node.c.push(f);
  if (t.q) { stopSearch(t); t.q = ''; t.res = null; }
  t.sel = new Set([f]);
  t.anchor = f;
  refresh(t, true);
  scrollToNode(t, f);
  rename(pi, f);
}

function props(n) {
  let files = 0, dirs = 0, size = n.s || 0;
  (function walk(x) { for (const c of x.c) { if (c.d) { dirs++; walk(c); } else { files++; size += c.s; } } })(n.d ? n : { c: [] });
  toast(`<b>${esc(label(n))}</b> · ${typeOf(n)} · ${fmtSize(size)}${n.d ? ` · ${files} 个文件，${dirs} 个文件夹` : ''} · 修改于 ${fmtDate(n.m)}`, 4000);
}
