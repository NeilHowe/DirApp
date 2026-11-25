// 分屏 ↔ 单屏 来回切换不应多出标签。用真实点击工具栏按钮
import { connect } from './cdp.mjs';
const c = await connect();
const T = process.env.DIRAPP_TEST_DIR, J = JSON.stringify;
const ok = (name, cond, info) => console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + info));
const st = () => c.eval(`JSON.stringify({ layout, ap, panes: panes.map(P => ({ act: P.act, tabs: P.tabs.map(t => baseName(t.path) + (t.pin ? '*' : '')) })) })`).then(JSON.parse);
const btn = l => c.click(`.tool [data-l="${l}"]`);
const names = s => s.panes.map(P => P.tabs.join(',')).join(' | ');

await c.eval(`localStorage.clear(); split(null); panes[0].tabs = [mkTab(${J(T)})]; panes[0].act = 0; renderAll(); load(cur(0)); 1`);
await c.sleep(500);

for (const l of ['h', 'v']) {
  for (let i = 1; i <= 3; i++) { await btn(l); await btn(''); }
  const s = await st();
  ok(`${l === 'h' ? '左右' : '上下'}分屏 ↔ 单屏 切 3 次不多标签`, names(s) === 'dirapp-test' && s.layout === null, names(s));
}

// 另一侧进了别的文件夹：合并时保留
await btn('h');
await c.dbl('.pane[data-p="1"] tr.row', '文档');
await btn('');
let s = await st();
ok('另一侧换了文件夹，合并后保留', names(s) === 'dirapp-test,文档', names(s));
ok('合并后停在原来活动的标签', s.panes[0].act === 1, J(s));   // 最后操作的是右侧“文档”

// 另一侧回到相同文件夹（同一路径），合并时不重复
await c.eval(`closeTab(0, 1); 1`);
await btn('h');
await c.click('.pane[data-p="1"] .crumb a', 'dirapp-test');   // 右侧点面包屑，路径与左侧相同
await btn('');
s = await st();
ok('两侧同一文件夹，合并后只留一个', names(s) === 'dirapp-test', names(s));

// 固定的标签：即使路径相同也保留
await btn('h');
await c.eval(`panes[1].tabs[0].pin = true; renderAll(); 1`);
await btn('');
s = await st();
ok('另一侧的固定标签保留', names(s) === 'dirapp-test,dirapp-test*', names(s));
await c.eval(`closeTab(0, 1); 1`);

// 快捷键 Ctrl+\ 切换
for (let i = 0; i < 3; i++) { await c.key('\\', 2); await c.key('\\', 2); }
s = await st();
ok('Ctrl+\\ 来回切 3 次不多标签', names(s) === 'dirapp-test' && s.layout === null, names(s) + ' ' + s.layout);

// 右侧开了好几个标签（其中一个与左侧重复）
await btn('h');
await c.eval(`openTab(${J(T + '\\图片')}, 1, false); openTab(${J(T + '\\文档')}, 1, false); 1`);
await c.sleep(300);
// 新标签插在当前标签右侧，所以右侧顺序以实际为准；合并后应是左侧标签 + 右侧去掉重复的那个
const before = await st();
const expect = ['dirapp-test', ...before.panes[1].tabs.filter(n => n !== 'dirapp-test')].join(',');
await btn('');
s = await st();
ok('多个标签合并：重复的去掉，其余按顺序保留', names(s) === expect, names(s) + ' 期望 ' + expect + '（合并前右侧 ' + before.panes[1].tabs.join(',') + '）');
console.log('logs', J(c.logs));
await c.eval(`localStorage.clear(); 1`);
c.close();
