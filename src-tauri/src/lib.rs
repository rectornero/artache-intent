// The app is the web editor in a native window; all logic lives in the web core.

/// A .intent or .sheet file the app was opened with (double-click on Windows).
#[tauri::command]
fn opened_file() -> Option<(String, String)> {
    let path = std::env::args().skip(1).find(|a| a.ends_with(".intent") || a.ends_with(".sheet"))?;
    let text = std::fs::read_to_string(&path).ok()?;
    Some((path, text))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![opened_file])
        .run(tauri::generate_context!())
        .expect("error while running Artache Intent");
}
