# DirApp 开发说明（给 Claude Code 和开发者）

Windows 文件管理器：多标签、左右/上下分屏、多窗口，每个标签里都能搜索。Tauri 2，Rust 后端 + 原生 HTML/JS 前端（无框架、无打包工具）。功能和搜索语法见 README.md。

## 代码结构

前端 `src/`，按顺序以普通 `<script>` 加载，共用全局变量：
- `util.js` 工具函数、`store`（localStorage）、`settings`
- `search.js` 筛选和搜索语法（前端部分）、拼音首字母
- `ui.js` 状态（`panes`、`ap`、`layout`）、渲染、虚拟滚动、分屏和分隔条、会话保存
- `events.js` 鼠标事件：点击、双击、中键、拖放
- `actions.js` 文件操作：复制/移动/删除/重命名/撤销、剪贴板
- `keys.js` 快捷键、右键菜单、启动时恢复会话

后端 `src-tauri/src/`：
- `fs.rs` 列目录、磁盘列表、常用文件夹、地址栏路径解析
- `query.rs` 搜索语法解析（有单元测试）
- `search.rs` 多线程递归搜索，可取消，结果上限 2 万条
- `shell.rs` 复制/移动/删除（SHFileOperation）、重命名、新建文件夹、用默认程序打开、属性、在资源管理器中显示、打开终端
- `clip.rs` 文件剪贴板（CF_HDROP + Preferred DropEffect，和资源管理器互通）
- `watch.rs` 目录监听，自动刷新

## 构建

- Git Bash 里构建时，必须把 MSVC 的 `bin/Hostx64/x64` 放到 PATH 最前面，否则会用到 `/usr/bin/link.exe`，链接失败。
- 前端打包在 exe 里，改了 JS/CSS 也要重新构建。调试用 `npx tauri build --debug --no-bundle`（几秒），安装包用 `npx tauri build`。
- 构建前先关掉正在运行的 dirapp.exe，否则 exe 被占用，写不进去。
- `cd src-tauri && cargo test` 跑搜索语法测试。

## 测试方法

- 一定要用真实的鼠标和键盘事件测试（CDP `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`），不要直接调 JS 函数。之前直接调函数，漏掉了“双击打不开文件”的 bug。
- 启动时设环境变量 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`，再用 `tests/cdp.mjs` 连接（`connect()` 后用 `click/dbl/key/type/mouse/shot/eval`）。
- 测试脚本用文件写，不要用 shell heredoc，Windows 路径里的反斜杠会被吞。
- 测试数据放在临时目录，测完清掉 localStorage（`localStorage.clear()`），以免影响用户自己的会话。
- 打开文件的测试会真的启动记事本等程序，测完记得关掉，别动用户已经开着的窗口。

## 当前状态（2026-11-25）

已完成并用真实输入测过：多标签/固定/恢复、分屏和拖动调整大小、标签移到新窗口、会话恢复、虚拟滚动、全部搜索语法、复制/移动/撤销/回收站、拖放（分屏之间、到文件夹、到标签、到侧栏收藏）、打开文件（含无关联程序时弹“打开方式”、属性窗口）。

还没实测：和资源管理器互相复制粘贴文件（测试时系统剪贴板一直被别的程序占用）。系统剪贴板被占用时会退回到 DirApp 内部剪贴板。

还没做：系统原生右键菜单、真实文件图标（现在是 emoji）、和资源管理器互相拖放、Everything 搜索后端。

## 约定

- 界面文字和代码注释用中文，提交信息用英文。
- 用户只做最终验收：需求明确时自己做完、自测通过再汇报，不要中途来问。
