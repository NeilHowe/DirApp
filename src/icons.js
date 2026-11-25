// 图标：界面用线条图标（跟随文字颜色），文件列表用彩色实心图标。全部内联 SVG，不依赖字体和 emoji
const LINE = {
  back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  fwd: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
  x: '<path d="M17 7 7 17M7 7l10 10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chev: '<path d="m10 7 5 5-5 5"/>',
  sortUp: '<path d="m7 14 5-5 5 5"/>',
  sortDown: '<path d="m7 10 5 5 5-5"/>',
  single: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/>',
  splitH: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M12 4.5v15"/>',
  splitV: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 12h17"/>',
  sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9 4.5v15"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeOff: '<path d="M4 4l16 16M10.5 5.7A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.8M6.7 6.9C4 8.6 2.5 12 2.5 12S6 18.5 12 18.5a8.7 8.7 0 0 0 4.6-1.3M10 10a2.8 2.8 0 0 0 4 4"/>',
  theme: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1Z"/>',
  desktop: '<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>',
  downloads: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  documents: '<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8Z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/>',
  pictures: '<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><circle cx="9" cy="9" r="1.8"/><path d="m20.5 15-4.5-4.5L6 20.5"/>',
  music: '<path d="M9 17.5V5.5l11-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="15.5" r="2.5"/>',
  videos: '<rect x="2.5" y="5.5" width="14" height="13" rx="2.5"/><path d="m16.5 10 5-3v10l-5-3"/>',
  star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.6-5 2.6.9-5.6-4-4 5.6-.8Z"/>',
  drive: '<rect x="3" y="12.5" width="18" height="7.5" rx="2"/><path d="M5 12.5 7.3 5h9.4l2.3 7.5M7 16.3h.01M10.5 16.3h.01"/>',
  pc: '<rect x="4" y="4.5" width="16" height="11" rx="1.8"/><path d="M2.5 19.5h19"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.7l2 2h7.3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>',
  folderOpen: '<path d="M3.5 17.5v-10a2 2 0 0 1 2-2h3.7l2 2h6.3a2 2 0 0 1 2 2v1"/><path d="M3.5 17.5 6 11h15l-2.6 6.5a1.5 1.5 0 0 1-1.4 1H5a1.5 1.5 0 0 1-1.5-1Z"/>',
  folderPlus: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.7l2 2h7.3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><path d="M12 10.5v5M9.5 13h5"/>',
  tabPlus: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9h17M12 12v5M9.5 14.5h5"/>',
  pin: '<path d="M12 16.5V21M9 3.5h6l-1 6.5 3.5 3v2h-11v-2l3.5-3Z"/>',
  window: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9h17"/>',
  external: '<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  cut: '<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="17.5" r="2.5"/><path d="M20 5 8.5 15.5M14.5 14 20 19M8.5 8.5 12 11.5"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  paste: '<rect x="8.5" y="2.5" width="7" height="4" rx="1"/><path d="M15.5 4.5H17a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h1.5"/>',
  link: '<path d="M10 13.5a4.5 4.5 0 0 0 6.8.5l2.7-2.7a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.5"/><path d="M14 10.5a4.5 4.5 0 0 0-6.8-.5l-2.7 2.7a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5"/>',
  terminal: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m7 9.5 3 2.5-3 2.5M12.5 15h4.5"/>',
  edit: '<path d="M12.5 20H20M16 4.5a2 2 0 0 1 3 3L8 18.5l-4 1 1-4Z"/>',
  trash: '<path d="M4 6.5h16M9 6.5V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M18 6.5l-.8 12.6a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9L6 6.5M10 10.5v6M14 10.5v6"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 16v-4.5M12 8h.01"/>',
  openWith: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
  location: '<path d="M12 20.5s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0c0 5.3-6.5 11-6.5 11Z"/><circle cx="12" cy="9.5" r="2.3"/>',
  close: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="m9.5 9.5 5 5M14.5 9.5l-5 5"/>',
};
const ic = (name, cls = '') => `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LINE[name] || LINE.folder}</svg>`;

// 彩色图标（文件列表、标签）。文件 = 浅色纸张 + 类别颜色的图形
const svg = (body, cls = 'fi') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const FILE_KIND = {   // 类别 → [颜色, 图形]
  doc: ['#3b7ce8', '<path d="M8.5 11.5h7M8.5 14.5h7M8.5 17.5h4.5"/>'],
  sheet: ['#1e9e5a', '<path d="M8 10.5h8v7.5H8ZM8 14.2h8M12 10.5v7.5"/>'],
  slide: ['#e3672b', '<rect x="8" y="10.5" width="8" height="5.5" rx="1"/><path d="M10 18.5h4"/>'],
  pdf: ['#df4545', '<path d="M8.5 11.5h7M8.5 14.5h7M8.5 17.5h4.5"/>'],
  image: ['#0f9fb0', '<path d="m7.5 18.5 3-3.5 2 2 1.5-1.5 2.5 3"/><circle cx="10" cy="11.8" r="1.3"/>'],
  design: ['#c2479b', '<circle cx="10.3" cy="13" r="2.1"/><circle cx="13.7" cy="16.2" r="2.1"/>'],
  audio: ['#d9467a', '<path d="M11 17.5v-6.3l4.5-1v5.3"/><circle cx="9.8" cy="17.5" r="1.3"/><circle cx="14.3" cy="15.5" r="1.3"/>'],
  video: ['#7c5ce6', '<path d="M10 11v7l5.5-3.5Z" fill="currentColor"/>'],
  archive: ['#d48a12', '<path d="M11 4h2M11 6.5h2M11 9h2M11 11.5h2"/><rect x="10.3" y="13.5" width="3.4" height="4.5" rx="1"/>'],
  disc: ['#5d6b82', '<circle cx="12" cy="14.5" r="3.8"/><circle cx="12" cy="14.5" r=".9"/>'],
  code: ['#0e8fc7', '<path d="m10 11.5-2.8 3 2.8 3M14 11.5l2.8 3-2.8 3"/>'],
  web: ['#2a86d9', '<circle cx="12" cy="14.5" r="3.8"/><path d="M8.2 14.5h7.6M12 10.7c-1.6 2.2-1.6 5.4 0 7.6M12 10.7c1.6 2.2 1.6 5.4 0 7.6"/>'],
  exe: ['#5b5fd6', '<rect x="7.5" y="10.5" width="9" height="7.5" rx="1.3"/><path d="M7.5 13h9"/>'],
  config: ['#6b7686', '<circle cx="12" cy="14.5" r="2"/><path d="M12 10.3v1.6M12 17.1v1.6M7.8 14.5h1.6M14.6 14.5h1.6"/>'],
  font: ['#8a5a3c', '<path d="m8.5 18.5 3.5-8.5 3.5 8.5M9.8 15.8h4.4"/>'],
  link: ['#2a86d9', '<path d="M9 18c0-3.2 2-5.3 5.5-5.3M12.5 10.5l2.2 2.2-2.2 2.2"/>'],
  text: ['#7a8494', '<path d="M8.5 11.5h7M8.5 14.5h7M8.5 17.5h4.5"/>'],
  file: ['#8b95a5', ''],
};
const PAGE = 'M6.5 2.5h7.8l5.2 5.2v12.3a1.5 1.5 0 0 1-1.5 1.5h-11.5A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1.5-1.5Z';
const fileIco = kind => {
  const [c, g] = FILE_KIND[kind] || FILE_KIND.file;
  return svg(`<path d="${PAGE}" fill="var(--page)" stroke="${c}" stroke-opacity=".55" stroke-width="1.2"/>`
    + `<path d="M14.3 2.5v3.7a1.5 1.5 0 0 0 1.5 1.5h3.7" fill="${c}" fill-opacity=".22" stroke="${c}" stroke-opacity=".55" stroke-width="1.2" stroke-linejoin="round"/>`
    + `<g fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" color="${c}">${g}</g>`);
};
// 文件夹：深浅两层；常用文件夹在前层上加一个小图形
const folderIco = glyph => svg('<path d="M2.5 6.2A1.7 1.7 0 0 1 4.2 4.5h4.6l2.2 2.2h8.8a1.7 1.7 0 0 1 1.7 1.7v1.1h-19Z" fill="var(--fold-b)"/>'
  + '<path d="M2.5 8.8h19v9.5a1.7 1.7 0 0 1-1.7 1.7H4.2a1.7 1.7 0 0 1-1.7-1.7Z" fill="var(--fold-f)"/>'
  + (glyph && LINE[glyph] ? `<g transform="translate(7.4 9.6) scale(.38)" fill="none" stroke="var(--fold-g)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${LINE[glyph]}</g>` : ''));
const driveIco = () => svg('<rect x="2.5" y="7" width="19" height="10" rx="2.4" fill="var(--drive)"/><rect x="2.5" y="7" width="19" height="4.2" rx="2" fill="#fff" fill-opacity=".18"/>'
  + '<circle cx="17.5" cy="14.2" r="1.1" fill="#3ddc84"/><path d="M5.5 14.2h6" stroke="#fff" stroke-opacity=".55" stroke-width="1.3" stroke-linecap="round"/>');
const pcIco = () => svg('<rect x="2.5" y="3.5" width="19" height="13" rx="2.2" fill="var(--pc)"/><rect x="4" y="5" width="16" height="10" rx="1.2" fill="#fff" fill-opacity=".22"/>'
  + '<path d="M8.5 20.5h7M12 16.5v4" stroke="var(--pc)" stroke-width="1.8" stroke-linecap="round"/>');

// 应用标志（工具栏左上角，和安装包图标一致）
const LOGO = '<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d7cff"/><stop offset="1" stop-color="#3a4fd8"/></linearGradient></defs>'
  + '<rect width="32" height="32" rx="8" fill="url(#lg)"/><path d="M8 11.5 16 7.5l8 4-8 4Z" fill="#fff"/><path d="m8 16 8 4 8-4" fill="none" stroke="#fff" stroke-opacity=".78" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  + '<path d="m8 20.5 8 4 8-4" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
