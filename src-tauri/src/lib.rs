mod clip;
mod fs;
mod menu;
mod query;
mod search;
mod shell;
mod watch;

use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

static NEXT_WIN: AtomicU32 = AtomicU32::new(1);

/// 新窗口（标签“移到新窗口”）。必须是 async 命令：在主线程同步创建窗口会死锁
#[tauri::command]
async fn open_window(app: tauri::AppHandle, query: String) -> Result<(), String> {
    if !query.bytes().all(|b| b.is_ascii_alphanumeric() || b"%=&-_.~".contains(&b)) {
        return Err("参数无效".into());
    }
    let label = format!("w{}", NEXT_WIN.fetch_add(1, Ordering::Relaxed));
    WebviewWindowBuilder::new(&app, label, WebviewUrl::App(format!("index.html?{query}").into()))
        .title("Strata")
        .inner_size(1100.0, 720.0)
        .min_inner_size(480.0, 360.0)
        .disable_drag_drop_handler() // 让网页自己处理拖放（标签、文件拖动）
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(search::Searches::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())?;
            }
            app.manage(watch::Watch::new(app.handle().clone()));
            Ok(())
        })
        .on_window_event(|w, ev| {
            if let tauri::WindowEvent::Destroyed = ev {
                w.state::<watch::Watch>().drop_window(w.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            fs::list_dir,
            fs::list_drives,
            fs::known_folders,
            fs::resolve_path,
            search::search_start,
            search::search_cancel,
            shell::file_transfer,
            shell::file_delete,
            shell::file_rename,
            shell::new_folder,
            shell::shell_open,
            shell::reveal_in_explorer,
            shell::open_terminal,
            clip::clip_set_files,
            clip::clip_get_files,
            clip::clip_clear,
            watch::watch_set,
            menu::shell_menu,
            menu::shell_menu_preview,
            open_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
