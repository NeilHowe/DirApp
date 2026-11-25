// 文件剪贴板：和资源管理器互通（CF_HDROP + "Preferred DropEffect"）
use serde::Serialize;
use std::os::windows::ffi::OsStrExt;
use windows_sys::Win32::System::DataExchange::*;
use windows_sys::Win32::Foundation::GlobalFree;
use windows_sys::Win32::System::Memory::*;
use windows_sys::Win32::UI::Shell::{DragQueryFileW, DROPFILES, HDROP};

const CF_HDROP: u32 = 15;
const DROPEFFECT_COPY: u32 = 1;
const DROPEFFECT_MOVE: u32 = 2;

fn effect_format() -> u32 {
    let name: Vec<u16> = "Preferred DropEffect".encode_utf16().chain([0]).collect();
    unsafe { RegisterClipboardFormatW(name.as_ptr()) }
}

struct Guard;
impl Drop for Guard {
    fn drop(&mut self) {
        unsafe { CloseClipboard() };
    }
}

fn open(w: &tauri::WebviewWindow) -> Result<Guard, String> {
    // 必须带窗口句柄打开：用 NULL 打开时 EmptyClipboard 会把所有者设成 NULL，随后 SetClipboardData 失败
    let hwnd = w.hwnd().map(|h| h.0).unwrap_or(std::ptr::null_mut());
    // 别的程序可能正占着剪贴板，稍微重试几次
    for _ in 0..25 {
        if unsafe { OpenClipboard(hwnd) } != 0 {
            return Ok(Guard);
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    Err("剪贴板被其他程序占用".into())
}

unsafe fn put(fmt: u32, bytes: &[u8]) -> bool {
    unsafe {
        let h = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
        if h.is_null() {
            return false;
        }
        let p = GlobalLock(h) as *mut u8;
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), p, bytes.len());
        GlobalUnlock(h);
        if SetClipboardData(fmt, h as _).is_null() {
            GlobalFree(h);
            return false;
        }
        true
    }
}

#[tauri::command]
pub fn clip_set_files(window: tauri::WebviewWindow, paths: Vec<String>, cut: bool) -> Result<(), String> {
    let mut list: Vec<u16> = vec![];
    for p in &paths {
        list.extend(std::ffi::OsStr::new(p).encode_wide());
        list.push(0);
    }
    list.push(0);
    let head = std::mem::size_of::<DROPFILES>();
    let mut bytes = vec![0u8; head + list.len() * 2];
    let df = DROPFILES { pFiles: head as u32, pt: unsafe { std::mem::zeroed() }, fNC: 0, fWide: 1 };
    unsafe {
        std::ptr::copy_nonoverlapping(&df as *const DROPFILES as *const u8, bytes.as_mut_ptr(), head);
        std::ptr::copy_nonoverlapping(list.as_ptr() as *const u8, bytes.as_mut_ptr().add(head), list.len() * 2);
    }
    let effect = if cut { DROPEFFECT_MOVE } else { DROPEFFECT_COPY };
    let _g = open(&window)?;
    unsafe {
        EmptyClipboard();
        if !put(CF_HDROP, &bytes) || !put(effect_format(), &effect.to_le_bytes()) {
            return Err("写入剪贴板失败".into());
        }
    }
    Ok(())
}

#[derive(Serialize)]
pub struct ClipFiles {
    paths: Vec<String>,
    cut: bool,
}

#[tauri::command]
pub fn clip_get_files(window: tauri::WebviewWindow) -> Result<ClipFiles, String> {
    let _g = open(&window)?;
    unsafe {
        let h = GetClipboardData(CF_HDROP);
        if h.is_null() {
            return Ok(ClipFiles { paths: vec![], cut: false });
        }
        let hdrop = h as HDROP;
        let n = DragQueryFileW(hdrop, u32::MAX, std::ptr::null_mut(), 0);
        let mut paths = vec![];
        for i in 0..n {
            let len = DragQueryFileW(hdrop, i, std::ptr::null_mut(), 0) as usize;
            let mut buf = vec![0u16; len + 1];
            DragQueryFileW(hdrop, i, buf.as_mut_ptr(), buf.len() as u32);
            paths.push(String::from_utf16_lossy(&buf[..len]));
        }
        let mut cut = false;
        let e = GetClipboardData(effect_format());
        if !e.is_null() {
            let p = GlobalLock(e as _) as *const u32;
            if !p.is_null() {
                cut = *p & DROPEFFECT_MOVE != 0;
                GlobalUnlock(e as _);
            }
        }
        Ok(ClipFiles { paths, cut })
    }
}

/// 剪切粘贴完成后清空剪贴板，避免再次粘贴时源文件已不存在
#[tauri::command]
pub fn clip_clear(window: tauri::WebviewWindow) {
    if let Ok(_g) = open(&window) {
        unsafe { EmptyClipboard() };
    }
}
