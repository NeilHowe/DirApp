// 系统集成：复制/移动/删除走 SHFileOperation（系统进度窗、冲突对话框、回收站），
// 打开文件、属性对话框、在资源管理器中定位、终端，以及和资源管理器互通的文件剪贴板（CF_HDROP）
use std::os::windows::ffi::OsStrExt;
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use windows_sys::Win32::Foundation::HWND;
use windows_sys::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
use windows_sys::Win32::UI::Shell::*;
use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

fn wide(s: &str) -> Vec<u16> {
    std::ffi::OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

/// 多个路径 → 以双 NUL 结尾的列表（SHFileOperation 要求的格式）
fn multi(paths: &[String]) -> Vec<u16> {
    let mut v = vec![];
    for p in paths {
        v.extend(std::ffi::OsStr::new(p).encode_wide());
        v.push(0);
    }
    v.push(0);
    v
}

fn hwnd_of(w: &tauri::WebviewWindow) -> isize {
    w.hwnd().map(|h| h.0 as isize).unwrap_or(0)
}

/// 返回 Ok(true) 表示全部完成，Ok(false) 表示用户在系统对话框里取消了
fn file_op(hwnd: isize, func: u32, from: &[String], to: Option<&str>, flags: u32) -> Result<bool, String> {
    let from_w = multi(from);
    let to_w = to.map(|t| multi(&[t.to_string()]));
    let mut op = SHFILEOPSTRUCTW {
        hwnd: hwnd as HWND,
        wFunc: func,
        pFrom: from_w.as_ptr(),
        pTo: to_w.as_ref().map_or(std::ptr::null(), |v| v.as_ptr()),
        fFlags: flags as u16,
        fAnyOperationsAborted: 0,
        hNameMappings: std::ptr::null_mut(),
        lpszProgressTitle: std::ptr::null(),
    };
    let r = unsafe {
        CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
        SHFileOperationW(&mut op)
    };
    if op.fAnyOperationsAborted != 0 {
        return Ok(false);
    }
    // 0x4C7 = ERROR_CANCELLED（用户在确认对话框里点了取消）
    match r {
        0 => Ok(true),
        0x4C7 => Ok(false),
        e => Err(format!("操作失败（错误码 0x{e:X}）")),
    }
}

fn parent_eq(p: &str, dir: &str) -> bool {
    Path::new(p).parent().is_some_and(|x| x.to_string_lossy().trim_end_matches('\\').eq_ignore_ascii_case(dir.trim_end_matches('\\')))
}

#[tauri::command]
pub async fn file_transfer(window: tauri::WebviewWindow, paths: Vec<String>, target: String, copy: bool) -> Result<bool, String> {
    let hwnd = hwnd_of(&window);
    tauri::async_runtime::spawn_blocking(move || {
        let same_dir = paths.iter().any(|p| parent_eq(p, &target));
        if same_dir && !copy {
            return Ok(true); // 移动到原位置：什么都不做
        }
        let mut flags = FOF_ALLOWUNDO;
        if same_dir {
            flags |= FOF_RENAMEONCOLLISION; // 同一文件夹里复制粘贴 = 生成“- 副本”
        }
        file_op(hwnd, if copy { FO_COPY } else { FO_MOVE }, &paths, Some(&target), flags)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn file_delete(window: tauri::WebviewWindow, paths: Vec<String>, permanent: bool) -> Result<bool, String> {
    let hwnd = hwnd_of(&window);
    tauri::async_runtime::spawn_blocking(move || {
        let flags = if permanent { 0 } else { FOF_ALLOWUNDO | FOF_WANTNUKEWARNING };
        file_op(hwnd, FO_DELETE, &paths, None, flags)
    })
    .await
    .map_err(|e| e.to_string())?
}

const BAD: &[char] = &['\\', '/', ':', '*', '?', '"', '<', '>', '|'];

#[tauri::command]
pub fn file_rename(path: String, name: String) -> Result<String, String> {
    let name = name.trim().trim_end_matches(['.', ' ']);
    if name.is_empty() || name.contains(BAD) {
        return Err("文件名不能包含 \\ / : * ? \" < > |".into());
    }
    let src = Path::new(&path);
    let dst = src.parent().ok_or("无法重命名磁盘")?.join(name);
    let same = dst.to_string_lossy().eq_ignore_ascii_case(&path); // 只改大小写
    if !same && dst.exists() {
        return Err(format!("已存在同名项目“{name}”"));
    }
    std::fs::rename(src, &dst).map_err(|e| crate::fs::err_text(&e))?;
    Ok(dst.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn new_folder(dir: String) -> Result<String, String> {
    let base = Path::new(&dir);
    for k in 1..1000 {
        let name = if k == 1 { "新建文件夹".to_string() } else { format!("新建文件夹 ({k})") };
        let p = base.join(&name);
        if !p.exists() {
            std::fs::create_dir(&p).map_err(|e| crate::fs::err_text(&e))?;
            return Ok(p.to_string_lossy().into_owned());
        }
    }
    Err("无法创建文件夹".into())
}

/// 同步命令在主线程（已初始化 COM、有消息循环）里执行，属性对话框需要这个环境
#[tauri::command]
pub fn shell_open(path: String, verb: Option<String>) -> Result<(), String> {
    let verb = verb.unwrap_or_else(|| "open".into());
    let (v, p) = (wide(&verb), wide(&path));
    let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
    info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
    info.fMask = SEE_MASK_INVOKEIDLIST | SEE_MASK_FLAG_NO_UI;
    info.lpVerb = v.as_ptr();
    info.lpFile = p.as_ptr();
    info.nShow = SW_SHOWNORMAL;
    if unsafe { ShellExecuteExW(&mut info) } == 0 {
        // 没有关联程序时弹出系统的“打开方式”
        if verb == "open" {
            return shell_open(path, Some("openas".into()));
        }
        return Err(format!("无法{}：{}", if verb == "properties" { "显示属性" } else { "打开" }, std::io::Error::last_os_error()));
    }
    Ok(())
}

#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    Command::new("explorer.exe").raw_arg(format!("/select,\"{path}\"")).spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_terminal(dir: String) -> Result<(), String> {
    const CREATE_NEW_CONSOLE: u32 = 0x10;
    if Command::new("wt.exe").arg("-d").arg(&dir).spawn().is_ok() {
        return Ok(());
    }
    Command::new("powershell.exe").current_dir(&dir).creation_flags(CREATE_NEW_CONSOLE).spawn().map(|_| ()).map_err(|e| e.to_string())
}
