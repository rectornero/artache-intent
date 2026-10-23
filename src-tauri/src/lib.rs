// The app is the web editor in a native window; all logic lives in the web core.

/// A .intent or .sheet file the app was opened with (double-click on Windows).
#[tauri::command]
fn opened_file() -> Option<(String, String)> {
    let path = std::env::args().skip(1).find(|a| a.ends_with(".intent") || a.ends_with(".sheet"))?;
    let text = std::fs::read_to_string(&path).ok()?;
    Some((path, text))
}

/// A project file (.intentproj) the app was opened with; the web side reads it.
#[tauri::command]
fn opened_project() -> Option<String> {
    std::env::args().skip(1).find(|a| a.ends_with(".intentproj"))
}

/// Playtest: start the Ren'Py SDK (renpy.exe or renpy.sh) on a game folder, as the
/// launcher's "Launch Project" does. Only a program named renpy… is ever started.
#[tauri::command]
fn playtest(renpy: String, project: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let exe = std::path::Path::new(&renpy);
        let name = exe.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
        if !name.starts_with("renpy") {
            return Err("That isn't the Ren'Py SDK's renpy program.".into());
        }
        let mut cmd = std::process::Command::new(exe);
        cmd.arg(&project);
        if let Some(dir) = exe.parent() {
            cmd.current_dir(dir);
        }
        cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    #[cfg(mobile)]
    {
        let _ = (renpy, project);
        Err("Playtest needs the Windows app.".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![opened_file, opened_project, playtest])
        .run(tauri::generate_context!())
        .expect("error while running Artache Intent");
}
