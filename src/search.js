// 搜索：查询解析 → 匹配 + 高亮区间（即时筛选在前端做）；递归搜索交给 Rust 后端，结果分批推送、可取消
const UNIT = { b: 1, k: 1024, kb: 1024, m: 1048576, mb: 1048576, g: 1073741824, gb: 1073741824 };
const SPAN = { h: 36e5, d: DAY, w: 7 * DAY, m: 30 * DAY, y: 365 * DAY };
const reEsc = s => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');

// 返回 test(item)：不匹配返回 null，匹配返回需要高亮的 [start, end] 区间数组
function parseQ(q) {
  const conds = [], terms = [], regs = [], now = Date.now();
  for (const tok of q.trim().split(/\s+/).filter(Boolean)) {
    let m;
    if ((m = tok.match(/^ext:(.+)$/i))) {
      const xs = m[1].toLowerCase().split(',').map(x => x.replace(/^\*?\./, ''));
      conds.push(n => !n.d && xs.includes(ext(n.n)));
    } else if ((m = tok.match(/^size:(>=|<=|>|<|=)?([\d.]+)([kmg]?b?)$/i))) {
      const v = parseFloat(m[2]) * (UNIT[m[3].toLowerCase()] || 1), op = m[1] || '>=';
      conds.push(n => !n.d && { '>': n.s > v, '<': n.s < v, '>=': n.s >= v, '<=': n.s <= v, '=': Math.abs(n.s - v) <= v * 0.05 }[op]);
    } else if ((m = tok.match(/^(?:modified|date):(\d+)([hdwmy])$/i))) {
      const since = now - m[1] * SPAN[m[2].toLowerCase()];
      conds.push(n => n.m >= since);
    } else if ((m = tok.match(/^type:(.+)$/i))) {
      const dir = /^(folder|dir|文件夹)$/i.test(m[1]);
      conds.push(n => !!n.d === dir);
    } else if (/^content:/i.test(tok)) {
      conds.push(n => !n.d);   // 内容只能在子目录搜索里匹配（要读文件），筛选时只保留文件
    } else if (tok.length > 2 && tok.startsWith('/') && tok.endsWith('/')) {
      try { regs.push(new RegExp(tok.slice(1, -1), 'i')); } catch { conds.push(() => false); }
    } else if (/[*?]/.test(tok)) {
      const r = new RegExp('^' + reEsc(tok).replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      conds.push(n => r.test(n.n));
    } else terms.push(tok.toLowerCase());
  }
  return n => {
    for (const c of conds) if (!c(n)) return null;
    const hl = [], low = n.n.toLowerCase();
    for (const r of regs) {
      const mm = r.exec(n.n);
      if (!mm) return null;
      hl.push([mm.index, mm.index + mm[0].length]);
    }
    for (const t of terms) {
      let i = low.indexOf(t);
      if (i < 0 && n.py && /^[a-z]+$/.test(t)) i = n.py.indexOf(t);   // 拼音首字母（后端算好，和名称逐字对应）
      if (i < 0) return null;
      hl.push([i, i + t.length]);
    }
    return hl;
  };
}
const hasContent = q => /(^|\s)content:\S/i.test(q);

function hlName(it, hl) {
  if (!hl?.length || it.k === 'drive') return esc(itemLabel(it));
  const s = it.n;
  let out = '', i = 0;
  for (const [a, b] of hl.slice().sort((x, y) => x[0] - y[0])) {
    if (b <= i) continue;
    const st = Math.max(a, i);
    out += esc(s.slice(i, st)) + '<mark>' + esc(s.slice(st, b)) + '</mark>';
    i = b;
  }
  return out + esc(s.slice(i));
}

const jobs = new Map();   // 搜索 id → 标签
let jobSeq = Math.floor(Math.random() * 1e6) * 1000;   // 每个窗口各自的 id 段，避免多窗口冲突

function startSearch(t) {
  stopSearch(t);
  t.cancelled = false;
  t.truncated = false;
  if (!t.q.trim()) { t.res = null; return refresh(t, true); }
  const id = ++jobSeq;
  Object.assign(t, { res: [], scanned: 0, ms: 0, job: { id, test: parseQ(t.q), t0: performance.now() } });
  jobs.set(id, t);
  invoke('search_start', { id, root: t.path, query: t.q, hidden: settings.hidden });
  refresh(t, true, true);
}

function stopSearch(t, cancelled) {
  if (!t.job) return;
  invoke('search_cancel', { id: t.job.id });
  jobs.delete(t.job.id);
  if (cancelled) { t.cancelled = true; t.ms = Math.round(performance.now() - t.job.t0); }
  t.job = null;
}

listen('search-batch', ({ payload: { id, items, scanned } }) => {
  const t = jobs.get(id);
  if (!t) return;
  for (const it of items) t.res.push({ it, hl: t.job.test(it) || [] });
  t.scanned = scanned;
  refresh(t);
});
listen('search-done', ({ payload: { id, scanned, ms, cancelled, truncated } }) => {
  const t = jobs.get(id);
  if (!t) return;
  jobs.delete(id);
  Object.assign(t, { job: null, scanned, ms, cancelled, truncated });
  refresh(t, true);
});
