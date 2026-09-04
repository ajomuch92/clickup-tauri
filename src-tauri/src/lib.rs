use std::io::Write;
use std::process::{Command, Stdio};

#[derive(serde::Serialize)]
struct Out {
    code: i32,
    stdout: String,
    stderr: String,
}

fn run(args: Vec<String>, stdin: Option<String>) -> Result<Out, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    // ponytail: GUI apps launched from a desktop menu often lack ~/.local/bin in PATH; try the usual install spots.
    let candidates = [
        "clickup".to_string(),
        format!("{home}/.local/bin/clickup"),
        format!("{home}/go/bin/clickup"),
        "/usr/local/bin/clickup".to_string(),
        "/opt/homebrew/bin/clickup".to_string(),
    ];
    let mut last_err = String::new();
    for bin in &candidates {
        let mut child = match Command::new(bin)
            .args(&args)
            .env("NO_COLOR", "1")
            .stdin(if stdin.is_some() { Stdio::piped() } else { Stdio::null() })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                last_err = e.to_string();
                continue;
            }
        };
        if let (Some(input), Some(mut pipe)) = (&stdin, child.stdin.take()) {
            pipe.write_all(input.as_bytes()).map_err(|e| e.to_string())?;
        }
        let o = child.wait_with_output().map_err(|e| e.to_string())?;
        return Ok(Out {
            code: o.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&o.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&o.stderr).into_owned(),
        });
    }
    Err(format!("clickup CLI not found ({last_err}). Install it: https://triptechtravel.github.io/clickup-cli/"))
}

#[tauri::command]
async fn clickup(args: Vec<String>, stdin: Option<String>) -> Result<Out, String> {
    tauri::async_runtime::spawn_blocking(move || run(args, stdin))
        .await
        .map_err(|e| e.to_string())?
}

/// Write raw bytes (the invoke body) to a temp file so the CLI can upload them. File name comes in the `x-name` header.
#[tauri::command]
fn save_temp(request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected a raw body".into());
    };
    let name: String = request
        .headers()
        .get("x-name")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("upload.png")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
        .collect();
    let dir = std::env::temp_dir().join("clickup-lite");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = dir.join(format!("{stamp}-{name}"));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run_app() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![clickup, save_temp])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
