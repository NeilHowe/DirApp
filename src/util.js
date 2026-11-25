// 通用工具：后端调用、路径、类型/图标、格式化、设置
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const thisWin = window.__TAURI__.window.getCurrentWindow();
const IS_MAIN = thisWin.label === 'main';
const DAY = 864e5;
const pad = (v, w = 2) => String(v).padStart(w, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 设置（localStorage 由 WebView2 持久保存在应用数据目录里）
const store = {
  get: (k, d) => { try { const v = localStorage.getItem('dirapp.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => localStorage.setItem('dirapp.' + k, JSON.stringify(v)),
};
const settings = Object.assign({ hidden: false, dark: matchMedia('(prefers-color-scheme: dark)').matches, side: true }, store.get('settings', {}));
const saveSettings = () => store.set('settings', settings);

// 路径：'' 表示“此电脑”；磁盘根目录保留结尾的 \（C:\），其他路径不带结尾 \
const ROOT = '';
const isDrive = p => /^[a-z]:\\$/i.test(p);
function norm(p) {
  p = String(p).replace(/\//g, '\\');
  if (/^[a-z]:\\?$/i.test(p)) return p.slice(0, 2).toUpperCase() + '\\';
  return p.replace(/\\+$/, '');
}
function parentOf(p) {
  if (p === ROOT) return null;
  if (isDrive(p)) return ROOT;
  if (/^\\\\[^\\]+\\[^\\]+$/.test(p)) return ROOT;   // \\server\share
  const i = p.lastIndexOf('\\');
  if (i < 0) return ROOT;
  return norm(p.slice(0, i) || p);
}
function chainOf(p) { const a = []; for (; p && p !== ROOT; p = parentOf(p)) a.unshift(p); return a; }
const same = (a, b) => a != null && b != null && a.toLowerCase() === b.toLowerCase();
const within = (p, dir) => dir === ROOT || same(p, dir) || p.toLowerCase().startsWith((isDrive(dir) ? dir : dir + '\\').toLowerCase());
const baseName = p => p === ROOT ? '此电脑' : isDrive(p) ? p.slice(0, 2) : p.slice(p.lastIndexOf('\\') + 1);
const joinPath = (dir, name) => (isDrive(dir) ? dir : dir + '\\') + name;

// 常用文件夹和磁盘名称（启动时从后端取）
const KNOWN_LABEL = { desktop: ['桌面', '🖥️'], downloads: ['下载', '⬇️'], documents: ['文档', '📄'], pictures: ['图片', '🖼️'], music: ['音乐', '🎵'], videos: ['视频', '🎬'], home: ['主文件夹', '🏠'] };
const known = new Map();    // 小写路径 → [名称, 图标]
const drives = new Map();   // 'C:\' → 磁盘项
function labelOf(p) {
  if (p === ROOT) return '此电脑';
  if (isDrive(p)) { const d = drives.get(p); return `${d?.label || '本地磁盘'} (${p.slice(0, 2)})`; }
  return known.get(p.toLowerCase())?.[0] || baseName(p);
}
const dirIcon = p => p === ROOT ? '💻' : isDrive(p) ? '💽' : known.get(p.toLowerCase())?.[1] || '📁';
const displayPath = p => p === ROOT ? '此电脑' : p;

const TYPES = {
  docx: ['Word 文档', '📝'], doc: ['Word 文档', '📝'], xlsx: ['Excel 工作表', '📊'], xls: ['Excel 工作表', '📊'], csv: ['CSV 文件', '📊'],
  pptx: ['PowerPoint 演示文稿', '📽️'], ppt: ['PowerPoint 演示文稿', '📽️'], pdf: ['PDF 文件', '📕'],
  png: ['PNG 图片', '🖼️'], jpg: ['JPG 图片', '🖼️'], jpeg: ['JPEG 图片', '🖼️'], gif: ['GIF 图片', '🖼️'], webp: ['WebP 图片', '🖼️'], bmp: ['BMP 图片', '🖼️'], svg: ['SVG 图像', '🖼️'], ico: ['图标', '🖼️'], psd: ['Photoshop 文件', '🎨'], fig: ['Figma 文件', '🎨'],
  md: ['Markdown 文档', '📄'], txt: ['文本文档', '📄'], log: ['日志文件', '📄'], ini: ['配置设置', '⚙️'], cfg: ['配置文件', '⚙️'],
  exe: ['应用程序', '⚙️'], msi: ['Windows 安装包', '📦'], dll: ['应用程序扩展', '🧩'], sys: ['系统文件', '🧩'], lnk: ['快捷方式', '🔗'], url: ['Internet 快捷方式', '🔗'],
  zip: ['压缩文件', '🗜️'], '7z': ['7Z 压缩文件', '🗜️'], rar: ['RAR 压缩文件', '🗜️'], gz: ['GZ 压缩文件', '🗜️'], tar: ['TAR 归档文件', '🗜️'], iso: ['光盘映像', '💿'],
  mp3: ['MP3 音频', '🎵'], wav: ['WAV 音频', '🎵'], flac: ['FLAC 音频', '🎵'], m4a: ['M4A 音频', '🎵'], mp4: ['MP4 视频', '🎬'], mkv: ['MKV 视频', '🎬'], avi: ['AVI 视频', '🎬'], mov: ['MOV 视频', '🎬'],
  ttf: ['TrueType 字体', '🔤'], otf: ['OpenType 字体', '🔤'],
  js: ['JavaScript 文件', '📜'], ts: ['TypeScript 文件', '📜'], tsx: ['TSX 文件', '📜'], jsx: ['JSX 文件', '📜'], json: ['JSON 文件', '📜'], cs: ['C# 源文件', '📜'], py: ['Python 文件', '📜'],
  rs: ['Rust 文件', '📜'], go: ['Go 文件', '📜'], java: ['Java 文件', '📜'], c: ['C 源文件', '📜'], cpp: ['C++ 源文件', '📜'], h: ['头文件', '📜'], lua: ['Lua 文件', '📜'],
  toml: ['TOML 文件', '📜'], yaml: ['YAML 文件', '📜'], yml: ['YAML 文件', '📜'], xml: ['XML 文件', '📜'], cmd: ['Windows 命令脚本', '📜'], bat: ['Windows 批处理文件', '📜'], ps1: ['PowerShell 脚本', '📜'], sh: ['Shell 脚本', '📜'],
  html: ['HTML 文档', '🌐'], htm: ['HTML 文档', '🌐'], css: ['CSS 样式表', '📜'], sln: ['VS 解决方案', '🧰'], csproj: ['C# 项目文件', '🧰'],
};
const ext = name => { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toLowerCase() : ''; };
const typeOf = it => it.k === 'drive' ? '本地磁盘' : it.d ? '文件夹' : (TYPES[ext(it.n)]?.[0] || (ext(it.n) ? ext(it.n).toUpperCase() + ' 文件' : '文件'));
const iconOf = it => it.k === 'drive' ? '💽' : it.d ? dirIcon(it.p) : (TYPES[ext(it.n)]?.[1] || '📄');
const itemLabel = it => it.k === 'drive' ? `${it.label} (${it.n})` : it.n;

const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? Math.ceil(b / 1024).toLocaleString() + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1073741824).toFixed(b < 107374182400 ? 2 : 1) + ' GB';
const fmtDate = t => { if (!t) return ''; const d = new Date(t); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const sizeCell = it => it.k === 'drive' ? (it.s ? `${fmtSize(it.free)} 可用` : '') : it.d ? '' : fmtSize(it.s);
const errText = e => esc(typeof e === 'string' ? e : e?.message || String(e));
