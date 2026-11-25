// 文件操作：复制/移动/删除走系统（有进度窗和冲突提示），剪贴板和资源管理器互通；重命名、移动可撤销
let undo = null;

// 操作完成后立即刷新受影响的文件夹（目录监听也会刷新，这里是为了不等 200ms）
function reloadDirs(dirs) {
  const set = new Set(dirs.filter(d => d != null).map(d => d.toLowerCase()));
  panes.forEach((P, i) => { const t = cur(i); if (set.has(t.path.toLowerCase())) load(t, true); });
}

async function del(t, permanent = false) {
  const items = selItems(t).filter(x => x.k !== 'drive');
  if (!items.length) return;
  try {
    const ok = await invoke('file_delete', { paths: items.map(x => x.p), permanent });
    if (!ok) return toast('已取消删除');
    reloadDirs(items.map(x => parentOf(x.p)));
    if (t.res) { const gone = new Set(items.map(x => x.p)); t.res = t.res.filter(x => !gone.has(x.it.p)); refresh(t, true); }
    toast(permanent ? `已永久删除 ${items.length} 个项目` : `已将 ${items.length} 个项目移到回收站（可在回收站中还原）`, 4000);
  } catch (e) { toast(errText(e), 5000); }
}

async function doUndo() {
  const u = undo;
  if (!u) return toast('没有可撤销的操作');
  undo = null;
  try {
    if (u.kind === 'rename') {
      await invoke('file_rename', { path: u.to, name: baseName(u.from) });
      reloadDirs([parentOf(u.from)]);
      toast('已撤销重命名');
    } else if (u.kind === 'move') {
      const byDir = new Map();
      for (const { from, to } of u.items) { const d = parentOf(from); byDir.set(d, [...(byDir.get(d) || []), to]); }
      for (const [dir, paths] of byDir) await invoke('file_transfer', { paths, target: dir, copy: false });
      reloadDirs([u.target, ...byDir.keys()]);
      toast('已撤销移动');
    }
  } catch (e) { toast('撤销失败：' + errText(e), 5000); }
}

async function transfer(paths, target, copy) {
  if (target === ROOT) return toast('不能放到“此电脑”根目录');
  // 不能把文件夹移进它自己或它的子文件夹
  paths = paths.filter(p => !isDrive(p) && !within(target, p) && (copy || !same(parentOf(p), target)));
  if (!paths.length) return;
  try {
    const ok = await invoke('file_transfer', { paths, target, copy });
    if (!ok) { reloadDirs([target, ...paths.map(parentOf)]); return toast('操作已取消'); }
    if (!copy) undo = { kind: 'move', target, items: paths.map(p => ({ from: p, to: joinPath(target, baseName(p)) })) };
    reloadDirs([target, ...paths.map(parentOf)]);
    toast(`已${copy ? '复制' : '移动'} ${paths.length} 个项目到 <b>${esc(labelOf(target))}</b>${copy ? '' : ' <a data-a="undo">撤销 (Ctrl+Z)</a>'}`, 4000);
  } catch (e) { toast(errText(e), 5000); }
}

// 系统剪贴板写不进去（被别的程序占着）时，退回到窗口内剪贴板，至少标签和分屏之间能复制粘贴
let localClip = null;
async function setClip(t, cut) {
  const items = selItems(t).filter(x => x.k !== 'drive');
  if (!items.length) return;
  const paths = items.map(x => x.p), what = `已${cut ? '剪切' : '复制'} ${items.length} 个项目`;
  try {
    await invoke('clip_set_files', { paths, cut });
    localClip = null;
    toast(`${what}，可在其他标签、分屏或资源管理器中粘贴`);
  } catch {
    localClip = { paths, cut };
    toast(`${what}（系统剪贴板被其他程序占用，只能在 Strata 内粘贴）`, 4000);
  }
}

async function paste() {
  const t = cur();
  if (t.path === ROOT || (t.rec && t.res)) return toast('请先进入一个文件夹再粘贴');
  let clip = localClip, sys = false;
  if (!clip) {
    try { clip = await invoke('clip_get_files'); sys = true; }
    catch (e) { return toast(errText(e)); }
  }
  if (!clip.paths.length) return toast('剪贴板里没有文件');
  await transfer(clip.paths, t.path, !clip.cut);
  if (clip.cut) { if (sys) invoke('clip_clear').catch(() => {}); else localClip = null; }
}

function copyPath(items) {
  const text = items.map(x => x.p).join('\r\n');
  navigator.clipboard.writeText(text).then(() => toast(`已复制路径：${esc(items.length > 1 ? items.length + ' 个' : text)}`), () => toast('复制路径失败'));
}

function rename(pi, p) {
  if (isDrive(p)) return toast('不支持在这里重命名磁盘');
  const t = cur(pi);
  scrollToPath(t, p);
  const i = t.view.findIndex(x => x.it.p === p), td = i >= 0 && rowEl(pi, i)?.querySelector('.c-n');
  if (!td) return;
  const it = t.view[i].it;
  renaming = panes[pi];
  td.innerHTML = `${iconOf(it)} <input class="ren" value="${esc(it.n)}" spellcheck="false">`;
  const inp = $('input', td), dot = it.d ? -1 : it.n.lastIndexOf('.');
  inp.focus();
  inp.setSelectionRange(0, dot > 0 ? dot : it.n.length);   // 默认不选中扩展名
  let fin = false;
  const done = async ok => {
    if (fin) return;
    fin = true;
    renaming = null;
    const v = inp.value.trim();
    if (ok && v && v !== it.n) {
      try {
        const np = await invoke('file_rename', { path: it.p, name: v });
        undo = { kind: 'rename', from: it.p, to: np };
        Object.assign(it, { n: baseName(np), p: np, py: null });
        t.sel = new Set([np]);
        t.anchor = np;
        load(t, true);
      } catch (e) { toast(errText(e), 4000); }
    }
    refresh(t, true);
    $('.list', panes[pi].el).focus();
  };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
  inp.onblur = () => done(true);
  inp.onclick = inp.ondblclick = inp.onmousedown = e => e.stopPropagation();
}

async function newFolder(pi) {
  const t = cur(pi);
  if (t.path === ROOT) return toast('不能在“此电脑”中新建文件夹');
  try {
    const p = await invoke('new_folder', { dir: t.path });
    if (t.q) { stopSearch(t); t.q = ''; t.res = null; }
    t.sel = new Set([p]);
    t.anchor = p;
    await load(t, true);
    rename(pi, p);
  } catch (e) { toast(errText(e)); }
}

const props = p => invoke('shell_open', { path: p, verb: 'properties' }).catch(e => toast(errText(e)));
const reveal = p => invoke('reveal_in_explorer', { path: p }).catch(e => toast(errText(e)));
const terminal = dir => invoke('open_terminal', { dir }).catch(e => toast(errText(e)));

// 标签移到新窗口：新窗口按 URL 参数打开这个路径
async function toNewWindow(pi, ti) {
  const P = panes[pi], t = P.tabs[ti];
  try {
    await invoke('open_window', { query: 'open=' + encodeURIComponent(t.path).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()) });
    if (allTabs().length > 1) closeTab(pi, ti);
  } catch (e) { toast(errText(e)); }
}
