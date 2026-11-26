// 检查系统菜单内容（不弹窗）：文件、文件夹、文件夹空白处
import { connect } from './cdp.mjs';
const c = await connect();
const T = process.env.DIRAPP_TEST_DIR, J = JSON.stringify;
const shot = (name, args) => c.eval(`invoke('shell_menu_preview', ${args}).then(r => r.join(' | '), e => 'ERR ' + e)`);
console.log('文件   :', await shot('file', `{ paths: [${J(T + '\\文档\\a.txt')}], dir: null }`));
console.log('文件夹 :', await shot('dir', `{ paths: [${J(T + '\\文档')}], dir: null }`));
console.log('空白处 :', await shot('bg', `{ paths: [], dir: ${J(T + '\\文档')} }`));
c.close();
