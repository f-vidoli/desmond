use serde_json::{json, Value};
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Manager};

fn resolve(base: &Path, relative: &str) -> Result<PathBuf, String> {
    let mut target = base.to_path_buf();
    for component in Path::new(relative).components() {
        match component {
            Component::Normal(part) => target.push(part),
            Component::CurDir => {}
            _ => return Err("unsafe path".to_string()),
        }
    }
    Ok(target)
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("desmond");
    fs::create_dir_all(&base).map_err(|error| error.to_string())?;
    Ok(base)
}

#[tauri::command]
fn desmond_read_text(app: AppHandle, path: &str) -> Result<String, String> {
    fs::read_to_string(resolve(&data_dir(&app)?, path)?).map_err(|error| error.to_string())
}

#[tauri::command]
fn desmond_write_text(app: AppHandle, path: &str, value: &str) -> Result<(), String> {
    let target = resolve(&data_dir(&app)?, path)?;
    fs::create_dir_all(target.parent().unwrap_or(Path::new("."))).map_err(|e| e.to_string())?;
    fs::write(target, value).map_err(|error| error.to_string())
}

#[tauri::command]
fn desmond_read_bytes(app: AppHandle, path: &str) -> Result<Vec<u8>, String> {
    fs::read(resolve(&data_dir(&app)?, path)?).map_err(|error| error.to_string())
}

#[tauri::command]
fn desmond_write_bytes(app: AppHandle, path: &str, bytes: Vec<u8>) -> Result<(), String> {
    let target = resolve(&data_dir(&app)?, path)?;
    fs::create_dir_all(target.parent().unwrap_or(Path::new("."))).map_err(|e| e.to_string())?;
    fs::write(target, bytes).map_err(|error| error.to_string())
}

#[tauri::command]
fn desmond_exists(app: AppHandle, path: &str) -> Result<bool, String> {
    Ok(resolve(&data_dir(&app)?, path)?.exists())
}

#[tauri::command]
fn desmond_mkdir(app: AppHandle, path: &str) -> Result<(), String> {
    fs::create_dir_all(resolve(&data_dir(&app)?, path)?).map_err(|error| error.to_string())
}

#[tauri::command]
fn desmond_list(app: AppHandle, path: &str) -> Result<Vec<Value>, String> {
    let target = resolve(&data_dir(&app)?, path)?;
    let entries = fs::read_dir(target).map_err(|error| error.to_string())?;
    let mut result = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let kind = if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            "dir"
        } else {
            "file"
        };
        result.push(json!({
            "name": entry.file_name().to_string_lossy(),
            "type": kind
        }));
    }
    Ok(result)
}

#[tauri::command]
fn desmond_remove(app: AppHandle, path: &str) -> Result<(), String> {
    let target = resolve(&data_dir(&app)?, path)?;
    if !target.exists() {
        return Ok(());
    }
    if target.is_dir() {
        fs::remove_dir_all(target).map_err(|error| error.to_string())
    } else {
        fs::remove_file(target).map_err(|error| error.to_string())
    }
}

#[tauri::command]
fn desmond_module_url() -> String {
    String::new()
}

#[cfg(not(target_os = "android"))]
fn pick_file_path() -> Option<PathBuf> {
    rfd::FileDialog::new().pick_file()
}

#[cfg(target_os = "android")]
fn pick_file_path() -> Option<PathBuf> {
    None
}

#[cfg(not(target_os = "android"))]
fn save_file_path(name: &str) -> Option<PathBuf> {
    rfd::FileDialog::new().set_file_name(name).save_file()
}

#[cfg(target_os = "android")]
fn save_file_path(_name: &str) -> Option<PathBuf> {
    None
}

#[cfg(not(target_os = "android"))]
fn confirm_dialog(message: &str) -> bool {
    matches!(
        rfd::MessageDialog::new()
            .set_title("Desmond")
            .set_description(message)
            .set_buttons(rfd::MessageButtons::YesNo)
            .show(),
        rfd::MessageDialogResult::Yes
    )
}

#[cfg(target_os = "android")]
fn confirm_dialog(_message: &str) -> bool {
    false
}

#[tauri::command]
fn desmond_pick_file() -> Result<Option<Value>, String> {
    let path = pick_file_path();
    match path {
        Some(path) => {
            let bytes = fs::read(&path).map_err(|error| error.to_string())?;
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            Ok(Some(json!({ "name": name, "bytes": bytes })))
        }
        None => Ok(None),
    }
}

#[tauri::command]
fn desmond_save_file(name: &str, text: &str) -> Result<bool, String> {
    let path = save_file_path(name);
    match path {
        Some(path) => {
            fs::write(path, text).map_err(|error| error.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

#[tauri::command]
fn desmond_confirm(message: &str) -> bool {
    confirm_dialog(message)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            desmond_read_text,
            desmond_write_text,
            desmond_read_bytes,
            desmond_write_bytes,
            desmond_exists,
            desmond_mkdir,
            desmond_list,
            desmond_remove,
            desmond_module_url,
            desmond_pick_file,
            desmond_save_file,
            desmond_confirm
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Desmond");
}
