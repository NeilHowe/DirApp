// 拖动分隔条调整分屏大小。用真实鼠标拖动
// 需要 DIRAPP_TEST_DIR 下有子目录“大目录”（几千个文件，测虚拟列表）和“文档”
import { connect } from './cdp.mjs';
const c = await connect();
const T = process.env.DIRAPP_TEST_DIR, J = JSON.stringify;
const ok = (name, cond, info) => console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + info));
const geo = () => c.eval(`JSON.stringify({ a: panes[0].el.getBoundingClientRect().toJSON(), b: panes[1]?.el.getBoundingClientRect().toJSON(), s: $('.splitter')?.getBoundingClientRect().toJSON(), box: panesEl.getBoundingClientRect().toJSON(), cursor: getComputedStyle($('.splitter') || document.body).cursor })`).then(JSON.parse);
const dragSplit = async (x, y, steps = 10) => {
  const g = await geo(), sx = g.s.x + g.s.width / 2, sy = g.s.y + g.s.height / 2;
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx, y: sy });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: sx, y: sy, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= steps; i++) await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: sx + (x - sx) * i / steps, y: sy + (y - sy) * i / steps, button: 'left', buttons: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  await c.sleep(150);
};
await c.eval(`Object.keys(localStorage).filter(k=>k.startsWith("dirapp.")).forEach(k=>localStorage.removeItem(k)); delete settings.split; split(null); panes[0].tabs = [mkTab(${J(T + '\\大目录')})]; panes[0].act = 0; renderAll(); load(cur(0)); split('h'); nav(cur(1), ${J(T)}); 1`);
await c.sleep(700);

let g = await geo();
ok('左右分屏默认各一半', Math.abs(g.a.width - g.b.width) < 2, J([g.a.width, g.b.width]));
ok('分隔条鼠标样式 col-resize', g.cursor === 'col-resize', g.cursor);
await dragSplit(g.box.x + 400, g.s.y + 200);
g = await geo();
ok('拖到 x=400', Math.abs(g.a.right - (g.box.x + 400)) < 6, J([g.a.right, g.box.x + 400]));
ok('总宽不变', Math.abs(g.a.width + g.s.width + g.b.width - g.box.width) < 2, J([g.a.width, g.s.width, g.b.width, g.box.width]));
await dragSplit(g.box.x + 5, g.s.y + 200);
g = await geo();
ok('左侧最小 260px', g.a.width >= 259 && g.a.width < 270, g.a.width);
await dragSplit(g.box.right - 5, g.s.y + 200);
g = await geo();
ok('右侧最小 260px', g.b.width >= 259 && g.b.width < 270, g.b.width);
ok('拖动时不选中文字', (await c.eval(`getSelection().toString().length`)) === 0, '');
await c.mouse(g.s.x + 2, g.s.y + 200, { count: 2 }); await c.sleep(200);
g = await geo();
ok('双击分隔条恢复一半', Math.abs(g.a.width - g.b.width) < 2, J([g.a.width, g.b.width]));
await dragSplit(g.box.x + 700, g.s.y + 200); await c.sleep(300);
const rows = await c.eval(`(() => { const l = $('.list', panes[0].el), r = l.querySelectorAll('tr.row'); return JSON.stringify({ last: r[r.length - 1].getBoundingClientRect().bottom, list: l.getBoundingClientRect().bottom }); })()`).then(JSON.parse);
ok('调整后列表行仍填满', rows.last >= rows.list, J(rows));

await c.eval(`split('v'); 1`); await c.sleep(200);
g = await geo();
ok('上下分屏默认各一半', Math.abs(g.a.height - g.b.height) < 2, J([g.a.height, g.b.height]));
ok('上下分隔条样式 row-resize', g.cursor === 'row-resize', g.cursor);
await dragSplit(g.s.x + 300, g.box.y + 200);
g = await geo();
ok('上下拖到 y=200', Math.abs(g.a.bottom - (g.box.y + 200)) < 6, J([g.a.bottom, g.box.y + 200]));
await dragSplit(g.s.x + 300, g.box.y + 2);
g = await geo();
ok('上方最小 150px', g.a.height >= 149 && g.a.height < 160, g.a.height);

await c.eval(`split('h'); 1`); await c.sleep(200);
const gh = await geo();
await c.eval(`split('v'); 1`); await c.sleep(200);
const gv = await geo();
ok('左右比例单独保存', Math.abs(gh.a.right - (gh.box.x + 700)) < 6, gh.a.right);
ok('上下比例单独保存', gv.a.height < 160, gv.a.height);
await c.eval(`split('h'); 1`); await c.sleep(200);
await c.dbl('.pane[data-p="1"] tr.row', '文档');
ok('调整后双击打开仍正常', (await c.eval(`cur(1).path`)).endsWith('文档'), await c.eval(`cur(1).path`));
console.log('logs', J(c.logs));
await c.eval(`Object.keys(localStorage).filter(k=>k.startsWith("dirapp.")).forEach(k=>localStorage.removeItem(k)); 1`);
c.close();
