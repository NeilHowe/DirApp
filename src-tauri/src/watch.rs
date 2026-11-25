// 目录监听：每个窗口告诉后端它正在显示哪些文件夹，变化后 200ms 防抖再通知前端刷新
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

pub struct Watch {
    watcher: Mutex<Option<RecommendedWatcher>>,
    subs: Mutex<HashMap<String, HashSet<PathBuf>>>, // 窗口 → 文件夹
    watched: Mutex<HashSet<PathBuf>>,
}

fn key(p: &Path) -> PathBuf {
    PathBuf::from(p.to_string_lossy().trim_end_matches('\\').to_lowercase())
}

impl Watch {
    pub fn new(app: AppHandle) -> Watch {
        let pending: Arc<Mutex<HashSet<String>>> = Default::default();
        let p2 = pending.clone();
        let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            let Ok(ev) = res else { return };
            let mut set = p2.lock().unwrap();
            for p in ev.paths {
                // 文件变了 → 刷新它所在的文件夹；被监听的文件夹本身被删/改名时也通知一下
                if let Some(parent) = p.parent() {
                    set.insert(parent.to_string_lossy().into_owned());
                }
                set.insert(p.to_string_lossy().into_owned());
            }
        })
        .ok();
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(200));
            let batch: Vec<String> = pending.lock().unwrap().drain().collect();
            if !batch.is_empty() {
                let _ = app.emit("dir-changed", batch);
            }
        });
        Watch { watcher: Mutex::new(watcher), subs: Default::default(), watched: Default::default() }
    }

    fn sync(&self) {
        let want: HashSet<PathBuf> = self.subs.lock().unwrap().values().flatten().cloned().collect();
        let mut watched = self.watched.lock().unwrap();
        let mut guard = self.watcher.lock().unwrap();
        let Some(w) = guard.as_mut() else { return };
        for p in watched.difference(&want).cloned().collect::<Vec<_>>() {
            let _ = w.unwatch(&p);
            watched.remove(&p);
        }
        for p in want {
            if !watched.contains(&p) && w.watch(&p, RecursiveMode::NonRecursive).is_ok() {
                watched.insert(p);
            }
        }
    }

    pub fn drop_window(&self, label: &str) {
        self.subs.lock().unwrap().remove(label);
        self.sync();
    }
}

#[tauri::command]
pub fn watch_set(window: tauri::Window, state: State<Watch>, paths: Vec<String>) {
    let set = paths.iter().filter(|p| !p.is_empty()).map(|p| key(Path::new(p))).collect();
    state.subs.lock().unwrap().insert(window.label().to_string(), set);
    state.sync();
}
