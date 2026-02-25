use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
fn check_pending_import(app: tauri::AppHandle) -> Option<String> {
  let data_dir = app.path().data_dir().ok()?;
  // Android internal files dir maps to data_dir
  // The Kotlin code writes to filesDir/pending_import.json
  // Try multiple possible locations
  let candidates = vec![
    data_dir.join("pending_import.json"),
    PathBuf::from("/data/data/com.lilongtao.talkio/files/pending_import.json"),
  ];
  for path in candidates.iter() {
    if path.exists() {
      if let Ok(content) = fs::read_to_string(&path) {
        let _ = fs::remove_file(&path);
        if !content.is_empty() {
          return Some(content);
        }
      }
    }
  }
  None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_sql::Builder::default().build())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_http::init())
    .invoke_handler(tauri::generate_handler![check_pending_import])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
