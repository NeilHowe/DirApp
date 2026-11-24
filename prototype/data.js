// 模拟文件系统 + 通用工具函数（原型用，非真实磁盘）
const DAY = 864e5, NOW = Date.now();
const rng = (s => () => (s = s * 16807 % 2147483647) / 2147483647)(7);
const ago = d => NOW - d * DAY - Math.floor(rng() * DAY * 0.8);
const D = (n, d, c = []) => ({ n, d: 1, m: ago(d), c });
const F = (n, kb, d) => ({ n, d: 0, s: Math.round(kb * 1024), m: ago(d) });
const gen = (k, f) => Array.from({ length: k }, (_, i) => f(i));
const pad = (v, w = 2) => String(v).padStart(w, '0');

const SYS = ['kernel', 'user', 'gdi', 'shell', 'ole', 'win', 'crypt', 'net', 'dx', 'ms', 'nt', 'combase', 'rpc', 'ws2', 'setup', 'print', 'audio', 'wlan', 'bcrypt', 'sec'];
const SUF = ['32', 'core', 'base', 'svc', 'ui', 'ext', 'api', 'mgr', 'host', 'hlp'];
const PKG = ['react', 'react-dom', 'lodash', 'axios', 'dayjs', 'vite', 'esbuild', 'rollup', 'typescript', 'zod', 'chalk', 'commander', 'debug', 'ms', 'semver', 'glob', 'minimatch', 'picomatch', 'fast-glob', 'micromatch', 'yaml', 'ws', 'express', 'body-parser', 'cookie', 'qs', 'mime', 'uuid', 'nanoid', 'classnames', 'immer', 'zustand', 'postcss', 'autoprefixer', 'tailwindcss', 'prettier', 'eslint', 'acorn', 'tslib', 'jsdom'];
const DIST = ['index.js', 'core.js', 'utils.js', 'index.d.ts', 'esm.js', 'cjs.js'];

const ROOT = D('此电脑', 0, [
  D('C:', 0, [
    D('Program Files', 120, [
      D('DirApp', 2, [F('DirApp.exe', 18400, 2), F('DirApp.dll', 2300, 2), F('Everything64.dll', 410, 2)]),
      D('Git', 60, [D('bin', 60, [F('git.exe', 4300, 60), F('bash.exe', 2400, 60)]), F('git-bash.exe', 140, 60)]),
      D('nodejs', 40, [F('node.exe', 72000, 40), F('npm.cmd', 1, 40), F('npx.cmd', 1, 40)]),
    ]),
    D('Users', 300, [D('me', 1, [
      D('桌面', 0, [F('年终总结报告.docx', 284, 1), F('产品原型.fig', 5200, 0), F('待办.txt', 2, 0), F('截图_20261119.png', 812, 1), D('临时', 3, [F('新建文本文档.txt', 0, 3)])]),
      D('下载', 0, [F('DirApp-Setup-0.1.exe', 31200, 0), F('发票_202611.pdf', 156, 2), F('合同扫描件.pdf', 4200, 6), F('简历模板.docx', 96, 20), F('archive.zip', 58000, 12), F('node-v24.14.0-x64.msi', 30500, 25), ...gen(12, i => F(`IMG_${2040 + i}.jpg`, 2400 + i * 170, i * 2))]),
      D('文档', 5, [
        D('会议纪要', 2, gen(8, i => F(`会议纪要_11月${pad(i * 2 + 2)}日.md`, 4 + i, 18 - i * 2))),
        D('财务', 10, [F('2026年度预算.xlsx', 88, 40), F('第三季度报告.xlsx', 120, 50), F('报销单.xlsx', 30, 8)]),
        D('工作资料', 4, [F('产品需求文档_v3.docx', 540, 4), F('客户名单.xlsx', 64, 15), F('方案设计.pptx', 8800, 9), F('周报模板.docx', 32, 60), F('项目计划.xlsx', 45, 3)]),
        F('读书笔记.md', 18, 7),
      ]),
      D('图片', 3, [
        D('旅行', 30, gen(40, i => F(`IMG_${1001 + i}.jpg`, 3000 + (i * 37 % 20) * 150, 30 + i))),
        D('截图', 1, gen(10, i => F(`截图_202611${pad(10 + i)}.png`, 600 + i * 40, 10 - i))),
        D('壁纸', 90, gen(6, i => F(`wallpaper_${i + 1}.png`, 5200 + i * 300, 90))),
      ]),
      D('音乐', 200, gen(8, i => F(`track_${pad(i + 1)}.mp3`, 7800 + i * 300, 200 + i))),
      D('视频', 60, [F('家庭聚会.mp4', 820000, 60), F('旅行vlog.mp4', 1520000, 33)]),
    ])]),
    D('Windows', 30, [
      D('System32', 30, gen(400, i => F(SYS[i % 20] + SUF[(i / 20 | 0) % 10] + (i >= 200 ? '_x' : '') + ['.dll', '.dll', '.exe', '.sys'][i % 4], 20 + i * 53 % 2000, 30 + i % 300))),
      D('Fonts', 200, gen(12, i => F(`font${i + 1}.ttf`, 300 + i * 40, 200))),
    ]),
  ]),
  D('D:', 0, [
    D('self', 0, [
      D('ToolDev', 0, [
        D('DirApp', 0, [
          D('.git', 0, [F('HEAD', 0.1, 0), F('config', 0.3, 0), D('objects', 0, gen(16, i => F((i * 2654435761 >>> 0).toString(16).slice(0, 8), 1 + i % 9, 0)))]),
          D('prototype', 0, [F('index.html', 9, 0), F('data.js', 7, 0), F('search.js', 4, 0), F('ui.js', 8, 0), F('events.js', 10, 0)]),
          D('src', 0, [D('DirApp', 0, [F('App.xaml', 1, 0), F('App.xaml.cs', 2, 0), F('DirApp.csproj', 1, 0),
            D('Views', 0, ['MainWindow', 'PaneGroupView', 'TabView', 'FileListView', 'AddressBar'].flatMap(v => [F(v + '.xaml', 4, 0), F(v + '.xaml.cs', 2, 0)])),
            D('ViewModels', 0, ['WindowVM', 'PaneGroupVM', 'TabVM', 'FileItemVM'].map(v => F(v + '.cs', 5, 0))),
            D('Services', 0, ['FileSystemService', 'SearchService', 'QueryParser', 'WatcherService', 'IconService', 'ShellService', 'SessionService'].map(v => F(v + '.cs', 6, 0))),
            D('Models', 0, ['FileItem', 'TabState', 'SearchQuery'].map(v => F(v + '.cs', 1, 0)))])]),
          D('tests', 0, [F('QueryParserTests.cs', 5, 0), F('FilterTests.cs', 3, 0)]),
          F('DirApp.sln', 2, 0), F('README.md', 3, 0), F('.gitignore', 1, 0),
        ]),
        D('ImageResizer', 40, [D('src', 40, gen(6, i => F(`resize_${i}.py`, 3 + i, 40))), F('README.md', 2, 40), F('requirements.txt', 0.2, 40)]),
        D('ClipboardKit', 75, [D('src', 75, gen(5, i => F(`clip${i}.rs`, 4 + i, 75))), F('Cargo.toml', 1, 75)]),
      ]),
      D('Notes', 2, gen(20, i => F(`${['周报', '读书笔记', '灵感', '日志'][i % 4]}_${pad(i + 1)}.md`, 2 + i % 6, i * 3))),
    ]),
    D('Projects', 10, [D('web-portal', 3, [
      D('node_modules', 10, PKG.map((p, i) => D(p, 10 + i, [F('package.json', 1.5, 10 + i), F('README.md', 3 + i % 5, 10 + i), F('LICENSE', 1, 10 + i),
        D('dist', 10 + i, DIST.map((x, j) => F(x, 2 + (i + j) * 13 % 60, 10 + i)))]))),
      D('src', 3, [F('main.tsx', 2, 3), F('App.tsx', 6, 3), D('components', 3, ['Header', 'Sidebar', 'Table', 'Modal', 'Button', 'Form', 'Chart', 'Login'].map((c, i) => F(c + '.tsx', 3 + i, 3 + i)))]),
      F('package.json', 2, 3), F('vite.config.ts', 1, 20), F('README.md', 4, 30),
    ])]),
    D('Backup', 100, [F('备份_2025.zip', 4200000, 330), F('备份_2026H1.zip', 5100000, 140), F('照片备份.7z', 9800000, 100)]),
  ]),
]);
(function link(n) { for (const c of n.c) { c.p = n; if (c.d) link(c); } })(ROOT);

// 拼音首字母（原型只收录了示例数据里用到的字；正式版用拼音库）
const PY = {};
'报b告g设s计j稿g照z片p文w档d下x载z项x目m桌z面m音y乐y视s频p合h同t发f票p简j历l会h议y纪j要y年n终z总z结j季j度d财c务w预y算s截j图t旅l行x家j庭t工g作z资z料l备b份f产c品p原y型x需x求q壁b纸z模m板b周z日r志z划h方f案a客k户h名m单d笔b记j读d书s扫s描m件j新x建j夹j临l时s待d办b灵l感g第d三s聚j销x本b地d磁c盘p电d脑n月y'
  .replace(/(.)([a-z])/g, (_, c, l) => (PY[c] = l, ''));
const ini = n => n.py ??= n.n.split('').map(ch => PY[ch] || ch.toLowerCase()).join('');

const TYPES = {
  docx: ['Word 文档', '📝'], xlsx: ['Excel 工作表', '📊'], pptx: ['PowerPoint 演示文稿', '📽️'], pdf: ['PDF 文件', '📕'],
  png: ['PNG 图片', '🖼️'], jpg: ['JPG 图片', '🖼️'], fig: ['Figma 文件', '🎨'], md: ['Markdown 文档', '📄'], txt: ['文本文档', '📄'],
  exe: ['应用程序', '⚙️'], msi: ['Windows 安装包', '📦'], dll: ['应用程序扩展', '🧩'], sys: ['系统文件', '🧩'],
  zip: ['压缩文件', '🗜️'], '7z': ['7Z 压缩文件', '🗜️'], mp3: ['MP3 音频', '🎵'], mp4: ['MP4 视频', '🎬'], ttf: ['TrueType 字体', '🔤'],
  js: ['JavaScript 文件', '📜'], ts: ['TypeScript 文件', '📜'], tsx: ['TSX 文件', '📜'], json: ['JSON 文件', '📜'], cs: ['C# 源文件', '📜'],
  xaml: ['XAML 文件', '📜'], py: ['Python 文件', '📜'], rs: ['Rust 文件', '📜'], toml: ['TOML 文件', '📜'], cmd: ['Windows 命令脚本', '📜'],
  html: ['HTML 文档', '🌐'], sln: ['VS 解决方案', '🧰'], csproj: ['C# 项目文件', '🧰'],
};
const ext = name => { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toLowerCase() : ''; };
const typeOf = n => n.d ? (n.p === ROOT ? '本地磁盘' : '文件夹') : (TYPES[ext(n.n)]?.[0] || (ext(n.n) ? ext(n.n).toUpperCase() + ' 文件' : '文件'));
const iconOf = n => n === ROOT ? '💻' : n.d ? (n.p === ROOT ? '💽' : '📁') : (TYPES[ext(n.n)]?.[1] || '📄');
const label = n => n === ROOT ? '此电脑' : n.p === ROOT ? `本地磁盘 (${n.n})` : n.n;

// 路径
const chain = n => { const a = []; for (; n && n !== ROOT; n = n.p) a.unshift(n); return a; };
const pathOf = n => { const a = chain(n).map(x => x.n); return !a.length ? '此电脑' : a.length === 1 ? a[0] + '\\' : a.join('\\'); };
const attached = n => { for (; n && n !== ROOT; n = n.p) if (!n.p || !n.p.c.includes(n)) return false; return !!n; };
function resolve(s) {
  s = s.trim().replace(/[\\/]+$/, '');
  if (!s || s === '此电脑') return ROOT;
  let n = ROOT;
  for (const part of s.split(/[\\/]+/)) {
    n = n.c?.find(c => c.n.toLowerCase() === part.toLowerCase());
    if (!n || !n.d) return null;
  }
  return n;
}

// 格式化
const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? Math.ceil(b / 1024).toLocaleString() + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1073741824).toFixed(2) + ' GB';
const fmtDate = t => { const d = new Date(t); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
