# Strata

Windows 文件管理器：多标签、分屏、多窗口同时打开多个文件夹，每个标签里都能搜索。基于 Tauri 2（Rust 后端 + 原生 HTML/JS 前端），安装包约 2.5 MB。

> 2026-11-25 改名为 Strata，之前叫 DirApp。已安装的版本升级时，内部标识没变，设置和会话会保留。

## 功能

- **多开**：多标签（固定、拖动排序、恢复关闭的标签）、左右/上下分屏、标签移到新窗口；启动时恢复上次的标签和分屏。
- **搜索**：输入即筛选当前文件夹；按 Enter 多线程递归搜索所有子文件夹，结果边搜边显示，可随时取消。
- **右键菜单**：文件、文件夹和“此电脑”里都是 Windows 原生菜单，系统的“打开方式”“发送到”“新建”“属性”和第三方扩展（压缩、Git、编辑器）都在，Strata 自己的几项排在最上面。
- **文件操作**：复制、移动、删除走系统的 SHFileOperation（系统进度窗、冲突提示、回收站）；剪贴板和资源管理器互通；重命名和移动可以撤销（Ctrl+Z）。
- 目录变化自动刷新、虚拟滚动（几万个文件的文件夹也不卡）、隐藏文件开关、深色主题、侧栏收藏（把文件夹拖到侧栏）。

## 搜索语法

可组合，空格分隔：

| 写法 | 含义 |
|---|---|
| `report` | 名称包含（不区分大小写） |
| `bg` | 拼音首字母，匹配“报告” |
| `*.png` `IMG_10?5*` | 通配符 |
| `ext:pdf,docx` | 扩展名 |
| `size:>5mb` | 大小（`>` `<` `>=` `<=` `=`，单位 b/kb/mb/gb） |
| `modified:7d` | 最近修改（h/d/w/m/y） |
| `type:folder` | 只看文件夹 |
| `/^IMG_\d+/` | 正则 |
| `content:关键字` | 文件内容（只在子目录搜索中生效，跳过二进制和 20 MB 以上的文件） |

快捷键见应用内 `？` 按钮或 F1。

## 开发

需要 Rust（MSVC 工具链）、Node.js、VS Build Tools 和 Windows SDK。

```bash
npm install
npm run dev      # 开发运行
npm run build    # 生成安装包：src-tauri/target/release/bundle/nsis/
cd src-tauri && cargo test   # 搜索语法单元测试
```

在 Git Bash 里构建时，要把 MSVC 的 `bin/Hostx64/x64` 放在 PATH 最前面，否则会用到 Git 自带的 `/usr/bin/link.exe`。

## 目录

```
src/            前端：util（路径/格式化）search（搜索）ui（状态/渲染）events（鼠标/拖放）actions（文件操作）keys（快捷键/菜单/启动）
src-tauri/src/  后端：fs（目录/磁盘）query（搜索语法）search（并行遍历）shell（系统文件操作）clip（剪贴板）watch（目录监听）
```
