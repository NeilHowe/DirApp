// 原生右键菜单：用 Windows 自己的 IContextMenu（资源管理器用的那套），
// “打开方式”“发送到”“新建”“属性”以及第三方扩展（压缩、Git、编辑器）全都在。
// Strata 自己的几项排最上面，和系统项之间用分隔线隔开。
//
// 菜单必须在 STA 线程上弹，并且要处理 WM_INITMENUPOPUP 等消息（否则“发送到”“新建”这些子菜单是空的），
// 所以这里自建一个隐藏窗口当菜单宿主。
use serde::Serialize;
use std::cell::RefCell;
use std::ffi::c_void;
use windows::core::{w, Interface, Result as WinResult, BOOL, HSTRING, PCWSTR, PSTR};
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::Graphics::Gdi::ClientToScreen;
use windows::Win32::System::Com::{CoTaskMemFree, IBindCtx};
use windows::Win32::System::Ole::{OleInitialize, OleUninitialize};
use windows::Win32::UI::Shell::Common::ITEMIDLIST;
use windows::Win32::UI::Shell::{
    CDefFolderMenu_Create2, IContextMenu, IContextMenu2, IContextMenu3, IShellFolder, SHBindToParent, SHParseDisplayName,
    CMF_CANRENAME, CMF_EXPLORE, CMF_EXTENDEDVERBS, CMF_NORMAL, CMINVOKECOMMANDINFOEX, GCS_VERBW,
};
use windows::Win32::UI::WindowsAndMessaging::*;

const EXTRA_BASE: usize = 0x8000;   // 自己加的项从这个编号开始，系统项用 1..0x7FFF
const ID_LAST: u32 = 0x7FFE;
const OPEN_ID: usize = 0x7FFF;   // 系统菜单里没有“打开”时我们自己补的那一项
const CMIC_MASK_UNICODE: u32 = 0x0000_4000;

thread_local! {
    static ACTIVE: RefCell<Option<(IContextMenu2, Option<IContextMenu3>)>> = const { RefCell::new(None) };
}

/// 菜单宿主窗口：只负责把子菜单需要的消息转给 shell 扩展
unsafe extern "system" fn host_proc(hwnd: HWND, msg: u32, wp: WPARAM, lp: LPARAM) -> LRESULT {
    unsafe {
        let active = ACTIVE.with(|a| a.borrow().clone());
        if let Some((cm2, cm3)) = active {
            match msg {
                WM_INITMENUPOPUP | WM_DRAWITEM | WM_MEASUREITEM | WM_MENUCHAR => {
                    if let Some(cm3) = &cm3 {
                        let mut r = LRESULT(0);
                        let _ = cm3.HandleMenuMsg2(msg, wp, lp, Some(&mut r));
                        return r;
                    }
                    if cm2.HandleMenuMsg(msg, wp, lp).is_ok() {
                        return LRESULT(1);
                    }
                }
                _ => {}
            }
        }
        DefWindowProcW(hwnd, msg, wp, lp)
    }
}

fn new_host() -> WinResult<HWND> {
    unsafe {
        let h = CreateWindowExW(WS_EX_TOOLWINDOW, w!("STATIC"), w!(""), WS_POPUP, 0, 0, 0, 0, None, None, None, None)?;
        SetWindowLongPtrW(h, GWLP_WNDPROC, host_proc as *const () as usize as isize);
        Ok(h)
    }
}

/// 路径 → 绝对 PIDL
fn parse(path: &str) -> Option<*mut ITEMIDLIST> {
    unsafe {
        let name = HSTRING::from(path);
        let mut pidl: *mut ITEMIDLIST = std::ptr::null_mut();
        SHParseDisplayName(PCWSTR(name.as_ptr()), None::<&IBindCtx>, &mut pidl, 0, None).ok()?;
        if pidl.is_null() { None } else { Some(pidl) }
    }
}

/// 一组项目 → 菜单对象。只用和第一项同一个文件夹里的项（跨文件夹的选中很少见）
fn item_menu(owner: HWND, paths: &[String]) -> Option<(IContextMenu, Vec<*mut ITEMIDLIST>)> {
    unsafe {
        let first = parse(paths.first()?)?;
        let mut keep = vec![first];
        let mut last: *mut ITEMIDLIST = std::ptr::null_mut();
        let parent: IShellFolder = match SHBindToParent(first, Some(&mut last)) {
            Ok(f) => f,
            Err(_) => return None,
        };
        let mut kids: Vec<*const ITEMIDLIST> = vec![last];
        for p in paths.iter().skip(1) {
            let Some(pidl) = parse(p) else { continue };
            keep.push(pidl);
            let mut sub: *mut ITEMIDLIST = std::ptr::null_mut();
            let Ok(pf) = SHBindToParent::<IShellFolder>(pidl, Some(&mut sub)) else { continue };
            if Interface::as_raw(&pf) == Interface::as_raw(&parent) {
                kids.push(sub);
            }
        }
        let icm: IContextMenu = CDefFolderMenu_Create2(Some(first), Some(owner), Some(&kids[..]), &parent, None, None).ok()?;
        Some((icm, keep))
    }
}

/// 文件夹空白处 → 菜单对象（新建、粘贴、属性在里面）
fn bg_menu(owner: HWND, dir: &str) -> Option<(IContextMenu, Vec<*mut ITEMIDLIST>)> {
    unsafe {
        let pidl = parse(dir)?;
        let mut last: *mut ITEMIDLIST = std::ptr::null_mut();
        // 空白处的菜单要用这个文件夹自己的视图对象，不能用它父级的
        let r = SHBindToParent::<IShellFolder>(pidl, Some(&mut last))
            .and_then(|parent| parent.BindToObject::<_, IShellFolder>(last, None::<&IBindCtx>))
            .and_then(|folder| folder.CreateViewObject::<IContextMenu>(owner));
        match r {
            Ok(icm) => Some((icm, vec![pidl])),
            Err(_) => {
                CoTaskMemFree(Some(pidl as *const c_void));
                None
            }
        }
    }
}

fn verb_of(icm: &IContextMenu, offset: usize) -> String {
    let mut buf = [0u16; 256];
    if unsafe { icm.GetCommandString(offset, GCS_VERBW, None, PSTR(buf.as_mut_ptr() as *mut u8), buf.len() as u32) }.is_err() {
        return String::new();
    }
    let n = buf.iter().position(|&c| c == 0).unwrap_or(0);
    String::from_utf16_lossy(&buf[..n]).to_lowercase()
}

fn label(menu: HMENU, pos: u32) -> String {
    let mut buf = [0u16; 512];
    let n = unsafe { GetMenuStringW(menu, pos, Some(&mut buf), MF_BYPOSITION) };
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

fn is_sep(menu: HMENU, pos: u32) -> bool {
    let mut info = MENUITEMINFOW { cbSize: std::mem::size_of::<MENUITEMINFOW>() as u32, ..Default::default() };
    info.fMask = MIIM_FTYPE;
    unsafe { GetMenuItemInfoW(menu, pos, true, &mut info) }.is_ok() && info.fType == MFT_SEPARATOR
}

/// 菜单项文字是不是“打开”（不含“打开方式”“打开所在位置”这类）
fn is_open_label(t: &str) -> bool {
    let base = t.split("(&").next().unwrap_or(t).trim().trim_end_matches('.').trim();
    base == "打开" || base.eq_ignore_ascii_case("open")
}

/// 去掉开头、结尾的分隔线和连续的分隔线
fn tidy(menu: HMENU) {
    let n = unsafe { GetMenuItemCount(Some(menu)) };
    for i in (0..n).rev() {
        let iu = i as u32;
        if is_sep(menu, iu) && (iu + 1 == n as u32 || is_sep(menu, iu + 1) || iu == 0) {
            unsafe { let _ = DeleteMenu(menu, iu, MF_BYPOSITION); }
        }
    }
}

#[derive(Serialize)]
pub struct Pick {
    kind: &'static str,   // extra | verb | invoked | cancel
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    verb: Option<String>,
}

struct Args {
    owner: isize,   // 主窗口（HWND 不是 Send，存成整数跨线程传）
    paths: Vec<String>,
    dir: Option<String>,
    extras: Vec<Option<String>>,
    x: i32,
    y: i32,
    shift: bool,
}

/// 让 shell 执行菜单项
unsafe fn invoke(icm: &IContextMenu, a: &Args, owner: HWND, offset: usize) {
    unsafe {
        let dir = HSTRING::from(a.dir.clone().unwrap_or_default());
        let mut ci = std::mem::zeroed::<CMINVOKECOMMANDINFOEX>();
        ci.cbSize = std::mem::size_of::<CMINVOKECOMMANDINFOEX>() as u32;
        ci.fMask = CMIC_MASK_UNICODE;
        ci.hwnd = owner;
        ci.nShow = SW_SHOWNORMAL.0;
        ci.lpVerbW = PCWSTR(offset as usize as *const u16);
        if a.dir.is_some() {
            ci.lpDirectoryW = PCWSTR(dir.as_ptr());
        }
        let _ = icm.InvokeCommand(&ci as *const _ as *const _);
    }
}

/// 属性表、确认框这类窗口建在当前线程上，线程退出了它们就没了：一直处理消息直到它们关闭
unsafe fn pump() {
    use windows::Win32::System::Threading::GetCurrentThreadId;
    thread_local! { static FOUND: std::cell::Cell<bool> = const { std::cell::Cell::new(false) }; }
    unsafe extern "system" fn any(h: HWND, _l: LPARAM) -> BOOL {
        unsafe {
            if IsWindowVisible(h).as_bool() {
                FOUND.with(|f| f.set(true));
                return false.into();
            }
        }
        true.into()
    }
    let tid = unsafe { GetCurrentThreadId() };
    let start = std::time::Instant::now();
    let mut msg: MSG = unsafe { std::mem::zeroed() };
    loop {
        unsafe {
            while PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            FOUND.with(|f| f.set(false));
            let _ = EnumThreadWindows(tid, Some(any), LPARAM(0));
        }
        let found = FOUND.with(|f| f.get());
        if !found && start.elapsed() > std::time::Duration::from_secs(2) {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
}

fn run(a: Args, tx: std::sync::mpsc::Sender<Result<Pick, String>>) {
    unsafe {
        if OleInitialize(None).is_err() {
            let _ = tx.send(Err("无法初始化系统菜单".into()));
            return;
        }
    }
    let r = unsafe { popup(&a, &tx) };
    if let Err(e) = r {
        let _ = tx.send(Err(e));
    }
    unsafe { OleUninitialize() };
}

unsafe fn popup(a: &Args, tx: &std::sync::mpsc::Sender<Result<Pick, String>>) -> Result<(), String> {
    let owner = HWND(a.owner as *mut c_void);
    unsafe {
        let host = new_host().map_err(|e| e.to_string())?;
        let (icm, pidls) = if a.paths.is_empty() {
            bg_menu(host, a.dir.as_deref().ok_or("缺少目录")?)
        } else {
            item_menu(host, &a.paths)
        }
        .ok_or("系统菜单不可用")?;

        let cleanup = |menu: Option<HMENU>| {
            ACTIVE.with(|x| *x.borrow_mut() = None);
            if let Some(m) = menu { let _ = DestroyMenu(m); }
            let _ = DestroyWindow(host);
            for p in &pidls { CoTaskMemFree(Some(*p as *const c_void)); }
        };

        let menu = match CreatePopupMenu() {
            Ok(m) => m,
            Err(e) => { cleanup(None); return Err(e.to_string()); }
        };
        let mut flags = CMF_NORMAL | CMF_EXPLORE | CMF_CANRENAME;
        if a.shift { flags |= CMF_EXTENDEDVERBS; }
        // 先让 shell 把自己的项都插进来（第三方扩展会按注册表里的位置把项插到顶部），
        // 再把 Strata 自己的项插到最前面，保证它们永远在最上面
        let _ = icm.QueryContextMenu(menu, 0, 1, ID_LAST, flags);

        // 有些关联（AppX/UWP 程序）经典菜单里拿不到“打开”这一项，只有“打开方式”。
        // 这种情况下补一个，保证和资源管理器双击的效果一致
        let has_open = if a.paths.is_empty() {
            true
        } else {
            let n = GetMenuItemCount(Some(menu)).max(0) as u32;
            (0..n).any(|i| is_open_label(&label(menu, i)))
        };
        if !has_open {
            let t = HSTRING::from("打开(&O)");
            let _ = InsertMenuW(menu, 0, MF_BYPOSITION | MF_STRING, OPEN_ID, PCWSTR(t.as_ptr()));
            let sep = InsertMenuW(menu, 1, MF_BYPOSITION | MF_SEPARATOR, 0, PCWSTR::null());
            if sep.is_err() {
                let _ = DeleteMenu(menu, 1, MF_BYPOSITION);
            }
        }

        let extras = a.extras.len();
        for (i, e) in a.extras.iter().enumerate().rev() {
            let _ = match e {
                None => InsertMenuW(menu, 0, MF_BYPOSITION | MF_SEPARATOR, 0, PCWSTR::null()),
                Some(t) => {
                    let h = HSTRING::from(t.as_str());
                    InsertMenuW(menu, 0, MF_BYPOSITION | MF_STRING, EXTRA_BASE + i, PCWSTR(h.as_ptr()))
                }
            };
        }
        if extras > 0 {
            let _ = InsertMenuW(menu, extras as u32, MF_BYPOSITION | MF_SEPARATOR, 0, PCWSTR::null());
        }
        tidy(menu);

        // 子菜单（发送到、新建等）靠宿主窗口收消息
        let cm2: Option<IContextMenu2> = icm.cast().ok();
        let cm3: Option<IContextMenu3> = icm.cast().ok();
        if let Some(cm2) = cm2 {
            ACTIVE.with(|x| *x.borrow_mut() = Some((cm2, cm3)));
        }
        let _ = SetForegroundWindow(host);
        let choice = TrackPopupMenuEx(menu, (TPM_RETURNCMD | TPM_RIGHTBUTTON).0, a.x, a.y, host, None).0 as usize;
        let _ = PostMessageW(Some(host), WM_NULL, WPARAM(0), LPARAM(0));

        let (pick, invoke_at) = if choice == 0 {
            (Pick { kind: "cancel", id: None, verb: None }, None)
        } else if choice == OPEN_ID {
            (Pick { kind: "verb", id: None, verb: Some("open".into()) }, None)
        } else if choice >= EXTRA_BASE {
            (Pick { kind: "extra", id: Some(choice - EXTRA_BASE), verb: None }, None)
        } else {
            let offset = choice - 1;
            let verb = verb_of(&icm, offset);
            // 这几项交给前端：打开 = 在标签里进入文件夹；重命名 = 就地改名；删除 = 走 Strata 的回收站流程
            if matches!(verb.as_str(), "open" | "rename" | "delete") {
                (Pick { kind: "verb", id: None, verb: Some(verb) }, None)
            } else {
                (Pick { kind: "invoked", id: None, verb: Some(verb) }, Some(offset))
            }
        };
        // 先把结果交给前端，再由 shell 执行（属性表之类可能要开很久）
        let _ = tx.send(Ok(pick));
        let _ = tx.send(Ok(Pick { kind: "done", id: None, verb: None }));
        if let Some(off) = invoke_at {
            invoke(&icm, a, owner, off);
            pump();
        } else {
            let _ = SetForegroundWindow(owner);
        }
        cleanup(Some(menu));
        Ok(())
    }
}

fn to_screen(owner: HWND, x: f64, y: f64, dpr: f64) -> (i32, i32) {
    let mut p = POINT { x: (x * dpr).round() as i32, y: (y * dpr).round() as i32 };
    unsafe { let _ = ClientToScreen(owner, &mut p); }
    (p.x, p.y)
}

/// 右键菜单。paths 为空表示文件夹空白处（dir 必填）。
#[tauri::command]
pub async fn shell_menu(window: tauri::WebviewWindow, paths: Vec<String>, dir: Option<String>, extras: Vec<Option<String>>,
                        x: f64, y: f64, dpr: f64, shift: bool) -> Result<Pick, String> {
    let owner = HWND(window.hwnd().map(|h| h.0).map_err(|e| e.to_string())?);
    let (sx, sy) = to_screen(owner, x, y, if dpr > 0.0 { dpr } else { 1.0 });
    let a = Args { owner: owner.0 as isize, paths, dir, extras, x: sx, y: sy, shift };
    tauri::async_runtime::spawn_blocking(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || run(a, tx));
        // 第一条是选中项；第二条是“后端已经处理完”的信号，忽略
        rx.recv().map_err(|_| "菜单线程结束".to_string())?
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 只建菜单不弹出，返回顶层项的文字（自测用）
#[tauri::command]
pub async fn shell_menu_preview(paths: Vec<String>, dir: Option<String>) -> Result<Vec<String>, String> {
    if !cfg!(debug_assertions) {
        return Err("仅调试版可用".into());
    }
    tauri::async_runtime::spawn_blocking(move || unsafe {
        if OleInitialize(None).is_err() {
            return Err("无法初始化系统菜单".to_string());
        }
        let host = new_host().ok();
        let out = (|| -> Option<Vec<String>> {
            let host = host?;
            let (icm, pidls) = if paths.is_empty() { bg_menu(host, dir.as_deref()?) } else { item_menu(host, &paths) }?;
            let menu = CreatePopupMenu().ok()?;
            let _ = icm.QueryContextMenu(menu, 0, 1, ID_LAST, CMF_NORMAL | CMF_EXPLORE);
            let n = GetMenuItemCount(Some(menu)).max(0);
            let mut v = vec![];
            for i in 0..n as u32 {
                v.push(if is_sep(menu, i) { "---".to_string() } else { label(menu, i) });
            }
            let _ = DestroyMenu(menu);
            for p in &pidls { CoTaskMemFree(Some(*p as *const c_void)); }
            Some(v)
        })();
        if let Some(h) = host { let _ = DestroyWindow(h); }
        OleUninitialize();
        out.ok_or_else(|| "系统菜单不可用".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
