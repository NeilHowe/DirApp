// 原生右键菜单的功能测试：真实右键弹出菜单，再用键盘在菜单里选中某一项回车
import { connect } from './cdp.mjs';
import { spawnSync } from 'node:child_process';
const c = await connect();
const T = process.env.DIRAPP_TEST_DIR, J = JSON.stringify;
const ok = (name, cond, info) => console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + info));
const ps = (text) => {
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tests/menu-pick.ps1', '-Text', text], { encoding: 'utf8' });
  return ((r.stdout || '') + (r.stderr || '')).trim().replace(/\s+/g, ' ');
};
const openOn = async (rowText) => {
  if (rowText) {
    const p = await c.pos('.pane[data-p="0"] tr.row', rowText);
    await c.mouse(p.x, p.y, { button: 'right' });
  } else {
    const r = await c.eval(`(() => { const l = $('.list', panes[0].el).getBoundingClientRect(); return { x: Math.round(l.x + l.width / 2), y: Math.round(l.y + l.height - 40) }; })()`);
    await c.mouse(r.x, r.y, { button: 'right' });
  }
  await c.sleep(900);
};
const reset = async (dir) => {
  await c.eval(`Object.keys(localStorage).filter(k=>k.startsWith("dirapp.")).forEach(k=>localStorage.removeItem(k)); split(null); panes[0].tabs=[mkTab(${J(dir)})]; panes[0].act=0; renderAll(); load(cur(0)); 1`);
  await c.sleep(700);
};

// 1. 文件夹上选“打开” → 进入该文件夹
await reset(T);
await openOn('图片');
console.log('  pick:', ps('打开'));
await c.sleep(600);
ok('原生菜单“打开”进入文件夹', (await c.eval(`cur().path`)).toLowerCase().endsWith('图片'), await c.eval(`cur().path`));

// 2. 文件上选“重命名” → 出现就地改名输入框
await reset(T + '\\文档');
await openOn('a.txt');
console.log('  pick:', ps('重命名'));
await c.sleep(700);
ok('原生菜单“重命名”就地改名', (await c.eval(`!!document.querySelector('input.ren')`)) === true, '');
await c.key('Escape');

// 3. 文件上选我们加的“复制路径” → 有提示
await openOn('a.txt');
console.log('  pick:', ps('复制路径'));
await c.sleep(600);
const toast = await c.eval(`$('.toast.show')?.innerText || ''`);
ok('原生菜单里的自定义项能执行', /复制路径/.test(toast), toast);
await c.eval(`$('.toast')?.classList.remove('show'); 1`);

// 4. 空白处选“新建文件夹” → 建出来并进入改名
const before = await c.eval(`cur().view.length`);
await openOn(null);
console.log('  pick:', ps('新建文件夹'));
await c.sleep(1200);
const after = await c.eval(`cur().view.length`);
ok('空白处菜单“新建文件夹”', after === before + 1 && (await c.eval(`!!document.querySelector('input.ren')`)), `${before} → ${after}`);
await c.key('Escape');
// 清理
await c.eval(`(async () => { const t = cur(); const f = t.view.find(v => v.it.d && v.it.n.startsWith('新建文件夹')); if (f) await invoke('file_delete', { paths: [f.it.p], permanent: true }); load(t); })()`);
await c.sleep(500);
await c.eval(`Object.keys(localStorage).filter(k=>k.startsWith("dirapp.")).forEach(k=>localStorage.removeItem(k)); 1`);
await c.eval(`split(null); 1`);
console.log('logs', J(c.logs));
c.close();
