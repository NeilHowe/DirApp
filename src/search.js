// 搜索：查询解析 → 匹配 + 高亮区间；递归搜索分批执行、可取消（模拟真实磁盘枚举）
const UNIT = { b: 1, k: 1024, kb: 1024, m: 1048576, mb: 1048576, g: 1073741824, gb: 1073741824 };
const SPAN = { h: 36e5, d: DAY, w: 7 * DAY, m: 30 * DAY, y: 365 * DAY };
const reEsc = s => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');

// 返回 test(node)：不匹配返回 null，匹配返回需要高亮的 [start, end] 区间数组
function parseQ(q) {
  const conds = [], terms = [], regs = [];
  for (const tok of q.trim().split(/\s+/).filter(Boolean)) {
    let m;
    if ((m = tok.match(/^ext:(.+)$/i))) {
      const xs = m[1].toLowerCase().split(',').map(x => x.replace(/^\*?\./, ''));
      conds.push(n => !n.d && xs.includes(ext(n.n)));
    } else if ((m = tok.match(/^size:(>=|<=|>|<|=)?([\d.]+)([kmg]?b?)$/i))) {
      const v = parseFloat(m[2]) * (UNIT[m[3].toLowerCase()] || 1), op = m[1] || '>=';
      conds.push(n => !n.d && { '>': n.s > v, '<': n.s < v, '>=': n.s >= v, '<=': n.s <= v, '=': Math.abs(n.s - v) <= v * 0.05 }[op]);
    } else if ((m = tok.match(/^(?:modified|date):(\d+)([hdwmy])$/i))) {
      const since = NOW - m[1] * SPAN[m[2].toLowerCase()];
      conds.push(n => n.m >= since);
    } else if ((m = tok.match(/^type:(.+)$/i))) {
      const dir = /^(folder|dir|文件夹)$/i.test(m[1]);
      conds.push(n => !!n.d === dir);
    } else if ((m = tok.match(/^\/(.+)\/$/))) {
      try { regs.push(new RegExp(m[1], 'i')); } catch { conds.push(() => false); }
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
      if (i < 0 && /^[a-z]+$/.test(t)) i = ini(n).indexOf(t);   // 拼音首字母兜底
      if (i < 0) return null;
      hl.push([i, i + t.length]);
    }
    return hl;
  };
}

function hlName(n, hl) {
  if (!hl?.length || n.p === ROOT) return esc(label(n));
  const s = n.n;
  let out = '', i = 0;
  for (const [a, b] of hl.slice().sort((x, y) => x[0] - y[0])) {
    if (b <= i) continue;
    const st = Math.max(a, i);
    out += esc(s.slice(i, st)) + '<mark>' + esc(s.slice(st, b)) + '</mark>';
    i = b;
  }
  return out + esc(s.slice(i));
}

// 递归搜索：广度优先（浅层结果先出来），每 16ms 处理 25 项，结果边找边显示
function startSearch(t) {
  stopSearch(t);
  t.cancelled = false;
  if (!t.q.trim()) { t.res = null; return refresh(t, true); }
  const test = parseQ(t.q), queue = [...t.node.c], job = { t0: performance.now(), last: 0 };
  let head = 0;
  Object.assign(t, { res: [], scanned: 0, ms: 0, job });
  const step = () => {
    if (t.job !== job) return;
    for (let k = 0; k < 25 && head < queue.length; k++) {
      const n = queue[head++];
      t.scanned++;
      const hl = test(n);
      if (hl) t.res.push({ n, hl });
      if (n.d) queue.push(...n.c);
    }
    if (head >= queue.length) {
      t.job = null;
      t.ms = Math.round(performance.now() - job.t0);
      refresh(t, true);
    } else {
      job.timer = setTimeout(step, 16);
      if (performance.now() - job.last > 90) { job.last = performance.now(); refresh(t); }
    }
  };
  refresh(t, true, true);
  step();
}

function stopSearch(t, cancelled) {
  if (!t.job) return;
  clearTimeout(t.job.timer);
  if (cancelled) { t.cancelled = true; t.ms = Math.round(performance.now() - t.job.t0); }
  t.job = null;
}
