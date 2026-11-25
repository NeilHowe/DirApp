// 目录枚举、磁盘列表、常用文件夹、路径解析
use serde::Serialize;
use std::fs::{DirEntry, Metadata};
use std::os::windows::fs::MetadataExt;
use std::path::{Path, PathBuf};

use crate::query::initials;

#[derive(Serialize, Clone)]
pub struct Item {
    pub n: String,  // 名称
    pub p: String,  // 完整路径
    pub d: bool,    // 是否文件夹
    pub s: u64,     // 大小
    pub m: i64,     // 修改时间（毫秒）
    pub h: bool,    // 隐藏
    #[serde(skip_serializing_if = "Option::is_none")]
    pub py: Option<String>, // 拼音首字母（仅含中文时）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub k: Option<&'static str>, // 特殊种类：drive
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub free: Option<u64>,
}

const HIDDEN: u32 = 0x2;

pub fn mtime(md: &Metadata) -> i64 {
    md.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn py_of(name: &str) -> Option<String> {
    if name.is_ascii() { None } else { Some(initials(name)) }
}

/// 符号链接和目录联接点：递归时不跟进，避免死循环
pub fn is_link(md: &Metadata) -> bool {
    md.file_type().is_symlink()
}

pub fn item_from(e: &DirEntry, md: Option<&Metadata>) -> Item {
    let n = e.file_name().to_string_lossy().into_owned();
    let p = e.path().to_string_lossy().into_owned();
    let (d, s, m, h) = match md {
        Some(md) => (md.is_dir(), if md.is_dir() { 0 } else { md.len() }, mtime(md), md.file_attributes() & HIDDEN != 0),
        None => (e.file_type().map(|t| t.is_dir()).unwrap_or(false), 0, 0, false),
    };
    Item { py: py_of(&n), n, p, d, s, m, h, k: None, label: None, free: None }
}

pub fn err_text(e: &std::io::Error) -> String {
    use std::io::ErrorKind::*;
    match e.kind() {
        PermissionDenied => "拒绝访问".into(),
        NotFound => "路径不存在".into(),
        _ => e.to_string(),
    }
}

#[tauri::command]
pub async fn list_dir(path: String) -> Result<Vec<Item>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let rd = std::fs::read_dir(&path).map_err(|e| err_text(&e))?;
        Ok(rd
            .filter_map(|e| e.ok())
            .map(|e| {
                // 符号链接要跟随取目标的类型和大小；普通项直接用枚举时带回的元数据（Windows 下没有额外系统调用）
                let md = e.metadata().ok();
                let md = match &md {
                    Some(m) if m.file_type().is_symlink() => std::fs::metadata(e.path()).ok().or(md),
                    _ => md,
                };
                item_from(&e, md.as_ref())
            })
            .collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn drives() -> Vec<Item> {
    use windows_sys::Win32::Storage::FileSystem::*;
    let mask = unsafe { GetLogicalDrives() };
    let mut out = vec![];
    for i in 0..26u32 {
        if mask & (1 << i) == 0 {
            continue;
        }
        let root = format!("{}:\\", (b'A' + i as u8) as char);
        let w = wide(&root);
        let kind = unsafe { GetDriveTypeW(w.as_ptr()) };
        let mut name = [0u16; 261];
        let ok = unsafe {
            GetVolumeInformationW(w.as_ptr(), name.as_mut_ptr(), 261, std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut(), 0)
        };
        let vol = if ok != 0 {
            String::from_utf16_lossy(&name[..name.iter().position(|&c| c == 0).unwrap_or(0)])
        } else {
            String::new()
        };
        let label = if !vol.is_empty() {
            vol
        } else {
            match kind {
                2 => "U 盘".into(),
                4 => "网络驱动器".into(),
                5 => "光驱".into(),
                _ => "本地磁盘".into(),
            }
        };
        let (mut free, mut total) = (0u64, 0u64);
        unsafe { GetDiskFreeSpaceExW(w.as_ptr(), std::ptr::null_mut(), &mut total, &mut free) };
        out.push(Item {
            n: root[..2].to_string(),
            p: root,
            d: true,
            s: total,
            m: 0,
            h: false,
            py: None,
            k: Some("drive"),
            label: Some(label),
            free: Some(free),
        });
    }
    out
}

#[tauri::command]
pub async fn list_drives() -> Vec<Item> {
    tauri::async_runtime::spawn_blocking(drives).await.unwrap_or_default()
}

#[derive(Serialize)]
pub struct Known {
    key: &'static str,
    path: String,
}

#[tauri::command]
pub fn known_folders() -> Vec<Known> {
    let list: [(&str, Option<PathBuf>); 7] = [
        ("desktop", dirs::desktop_dir()),
        ("downloads", dirs::download_dir()),
        ("documents", dirs::document_dir()),
        ("pictures", dirs::picture_dir()),
        ("music", dirs::audio_dir()),
        ("videos", dirs::video_dir()),
        ("home", dirs::home_dir()),
    ];
    list.into_iter()
        .filter_map(|(key, p)| p.map(|p| Known { key, path: p.to_string_lossy().into_owned() }))
        .collect()
}

#[derive(Serialize)]
pub struct Resolved {
    dir: String,
    select: Option<String>,
}

/// 地址栏输入 → 目录（输入的是文件时，打开它所在的文件夹并选中它）。支持 %环境变量% 和 ~
#[tauri::command]
pub fn resolve_path(input: String) -> Result<Resolved, String> {
    let mut s = input.trim().trim_matches('"').replace('/', "\\");
    let env = regex::Regex::new(r"%([^%]+)%").unwrap();
    s = env.replace_all(&s, |c: &regex::Captures| std::env::var(&c[1]).unwrap_or_else(|_| c[0].to_string())).into_owned();
    if s == "~" || s.starts_with("~\\") {
        if let Some(h) = dirs::home_dir() {
            s = format!("{}{}", h.to_string_lossy(), &s[1..]);
        }
    }
    if s.len() == 2 && s.ends_with(':') {
        s.push('\\');
    }
    let p = Path::new(&s);
    match std::fs::metadata(p) {
        Ok(md) if md.is_dir() => Ok(Resolved { dir: s, select: None }),
        Ok(_) => Ok(Resolved {
            dir: p.parent().map(|x| x.to_string_lossy().into_owned()).unwrap_or_default(),
            select: Some(s),
        }),
        Err(e) => Err(err_text(&e)),
    }
}
