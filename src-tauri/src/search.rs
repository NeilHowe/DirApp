// 递归搜索：多线程并行遍历（近似广度优先，浅层结果先出），每 100ms 向窗口推一批结果，可取消
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::io::Read;
use std::os::windows::fs::MetadataExt;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Condvar, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

use crate::fs::{drives, is_link, item_from, Item};
use crate::query::{Meta, Query};

const MAX_RESULTS: usize = 20_000;
const MAX_CONTENT_SIZE: u64 = 20 * 1024 * 1024;

#[derive(Default)]
pub struct Searches(Mutex<HashMap<u64, Arc<AtomicBool>>>);

#[derive(Serialize, Clone)]
struct Batch {
    id: u64,
    items: Vec<Item>,
    scanned: u64,
}

#[derive(Serialize, Clone)]
struct Done {
    id: u64,
    scanned: u64,
    ms: u64,
    cancelled: bool,
    truncated: bool,
}

struct Work {
    queue: VecDeque<PathBuf>,
    active: usize,
}

fn content_hit(path: &std::path::Path, re: &regex::bytes::Regex) -> bool {
    let Ok(mut f) = std::fs::File::open(path) else { return false };
    let mut buf = Vec::new();
    if f.by_ref().take(MAX_CONTENT_SIZE).read_to_end(&mut buf).is_err() {
        return false;
    }
    // 前 8KB 里有 NUL 字节当作二进制文件跳过（UTF-16 文本也会被跳过，第一版先这样）
    if buf[..buf.len().min(8192)].contains(&0) {
        return false;
    }
    re.is_match(&buf)
}

#[tauri::command]
pub fn search_start(app: AppHandle, window: tauri::Window, state: State<Searches>, id: u64, root: String, query: String, hidden: bool) {
    let cancel = Arc::new(AtomicBool::new(false));
    state.0.lock().unwrap().insert(id, cancel.clone());
    let label = window.label().to_string();
    std::thread::spawn(move || {
        let t0 = Instant::now();
        let q = Arc::new(Query::parse(&query));
        let roots: Vec<PathBuf> = if root.is_empty() { drives().into_iter().map(|d| PathBuf::from(d.p)).collect() } else { vec![PathBuf::from(&root)] };
        let work = Arc::new((Mutex::new(Work { queue: roots.into(), active: 0 }), Condvar::new()));
        let scanned = Arc::new(AtomicU64::new(0));
        let found = Arc::new(AtomicU64::new(0));
        let truncated = Arc::new(AtomicBool::new(false));
        let (tx, rx) = mpsc::channel::<Item>();
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(2, 8);
        let mut handles = vec![];
        for _ in 0..threads {
            let (work, q, cancel, scanned, found, truncated, tx) = (work.clone(), q.clone(), cancel.clone(), scanned.clone(), found.clone(), truncated.clone(), tx.clone());
            handles.push(std::thread::spawn(move || {
                let (lock, cv) = &*work;
                loop {
                    let dir = {
                        let mut w = lock.lock().unwrap();
                        loop {
                            if cancel.load(Ordering::Relaxed) {
                                cv.notify_all();
                                return;
                            }
                            if let Some(d) = w.queue.pop_front() {
                                w.active += 1;
                                break d;
                            }
                            if w.active == 0 {
                                cv.notify_all();
                                return;
                            }
                            w = cv.wait(w).unwrap();
                        }
                    };
                    let mut subdirs = vec![];
                    if let Ok(rd) = std::fs::read_dir(&dir) {
                        for e in rd.flatten() {
                            if cancel.load(Ordering::Relaxed) {
                                break;
                            }
                            scanned.fetch_add(1, Ordering::Relaxed);
                            let Ok(md) = e.metadata() else { continue };
                            if !hidden && md.file_attributes() & 0x2 != 0 {
                                continue;
                            }
                            let name = e.file_name();
                            let name = name.to_string_lossy();
                            let meta = Meta { name: &name, is_dir: md.is_dir(), size: md.len(), modified: crate::fs::mtime(&md) };
                            if q.matches(&meta) && q.content.as_ref().is_none_or(|re| md.len() <= MAX_CONTENT_SIZE && content_hit(&e.path(), re)) {
                                if found.fetch_add(1, Ordering::Relaxed) as usize >= MAX_RESULTS {
                                    truncated.store(true, Ordering::Relaxed);
                                    cancel.store(true, Ordering::Relaxed);
                                    break;
                                }
                                let _ = tx.send(item_from(&e, Some(&md)));
                            }
                            if md.is_dir() && !is_link(&md) {
                                subdirs.push(e.path());
                            }
                        }
                    }
                    let mut w = lock.lock().unwrap();
                    w.queue.extend(subdirs);
                    w.active -= 1;
                    cv.notify_all();
                }
            }));
        }
        drop(tx);
        // 汇总线程：批量推送，避免每条结果都触发一次界面刷新
        let mut batch = vec![];
        let mut last = Instant::now();
        loop {
            match rx.recv_timeout(Duration::from_millis(50)) {
                Ok(it) => batch.push(it),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
            if last.elapsed() >= Duration::from_millis(100) {
                last = Instant::now();
                let _ = app.emit_to(&label, "search-batch", Batch { id, items: std::mem::take(&mut batch), scanned: scanned.load(Ordering::Relaxed) });
            }
        }
        for h in handles {
            let _ = h.join();
        }
        let _ = app.emit_to(&label, "search-batch", Batch { id, items: batch, scanned: scanned.load(Ordering::Relaxed) });
        let trunc = truncated.load(Ordering::Relaxed);
        let _ = app.emit_to(
            &label,
            "search-done",
            Done { id, scanned: scanned.load(Ordering::Relaxed), ms: t0.elapsed().as_millis() as u64, cancelled: cancel.load(Ordering::Relaxed) && !trunc, truncated: trunc },
        );
        use tauri::Manager;
        app.state::<Searches>().0.lock().unwrap().remove(&id);
    });
}

#[tauri::command]
pub fn search_cancel(state: State<Searches>, id: u64) {
    if let Some(c) = state.0.lock().unwrap().get(&id) {
        c.store(true, Ordering::Relaxed);
    }
}
