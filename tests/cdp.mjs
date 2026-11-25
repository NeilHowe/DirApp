// CDP 小工具：连到 DirApp 的 WebView2，用真实输入事件（鼠标/键盘）驱动界面
// 用法：先以 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333 启动 dirapp.exe
//   import { connect } from './cdp.mjs'; const c = await connect(); await c.dbl('.pane tr.row', '文档');
export async function connect(match = '') {
  const list = await (await fetch('http://127.0.0.1:9333/json')).json();
  const page = list.find(t => t.type === 'page' && t.url.includes(match)) || list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let n = 0;
  const pend = new Map(), logs = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') logs.push('EXC ' + d.params.exceptionDetails.exception?.description);
    if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) logs.push(d.params.type + ' ' + d.params.args.map(a => a.value ?? a.description).join(' '));
  };
  await new Promise(r => (ws.onopen = r));
  const send = (method, params = {}) => new Promise(r => { const id = ++n; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const c = {
    send, sleep, logs,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
      return r.result?.result?.value;
    },
    // 找到第一个匹配 sel 且文字包含 text 的元素，返回它的屏幕坐标
    async pos(sel, text) {
      const p = await c.eval(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})]; const el = ${text ? `els.find(e => e.textContent.includes(${JSON.stringify(text)}))` : 'els[0]'}; if (!el) return null; el.scrollIntoView({block:'nearest'}); const r = el.getBoundingClientRect(); return { x: r.x + Math.min(r.width / 2, 60), y: r.y + r.height / 2 }; })()`);
      if (!p) throw new Error('not found: ' + sel + ' ' + (text || ''));
      return p;
    },
    async mouse(x, y, { button = 'left', count = 1, mods = 0 } = {}) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers: mods });
      for (let i = 1; i <= count; i++) {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: i, modifiers: mods });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: i, modifiers: mods });
        await sleep(40);
      }
    },
    async click(sel, text, o) { const p = await c.pos(sel, text); await c.mouse(p.x, p.y, o); await sleep(150); },
    async dbl(sel, text) { const p = await c.pos(sel, text); await c.mouse(p.x, p.y, { count: 2 }); await sleep(400); },
    // mods：1=Alt 2=Ctrl 4=Meta 8=Shift，可相加
    async key(key, mods = 0) {
      const code = key === '\\' ? 'Backslash' : key.length === 1 ? 'Key' + key.toUpperCase() : key;
      const vk = { Enter: 13, Escape: 27, Delete: 46, Backspace: 8, F2: 113, F5: 116, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Tab: 9, Home: 36, End: 35, '\\': 220 }[key] || key.toUpperCase().charCodeAt(0);
      const text = key.length === 1 && !(mods & 3) ? key : undefined;
      await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, modifiers: mods, text });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await sleep(120);
    },
    async type(s) { await send('Input.insertText', { text: s }); await sleep(150); },
    async shot(file) { const r = await send('Page.captureScreenshot', { format: 'png' }); (await import('fs')).writeFileSync(file, Buffer.from(r.result.data, 'base64')); },
    close: () => ws.close(),
  };
  return c;
}
